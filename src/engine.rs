//! The access-control engine: every rule (NIK check, anti-passback, capacity, panic, group pass,
//! manual override) lives here. The web UI only displays state and sends commands.

use std::collections::BTreeMap;

use rand::{seq::IndexedRandom, Rng};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::model::*;
use crate::util::*;

pub fn uid() -> String {
    const ALPHA: &[u8] = b"abcdefghijklmnopqrstuvwxyz0123456789";
    let mut r = rand::rng();
    (0..10).map(|_| ALPHA[r.random_range(0..ALPHA.len())] as char).collect()
}

#[derive(Serialize, Clone, Copy, PartialEq, Eq, Debug)]
#[serde(rename_all = "UPPERCASE")]
pub enum GateStatus {
    Locked,
    Open,
    Manual,
    Denied,
    Panic,
}

#[derive(Serialize, Clone, Debug)]
pub struct GateRt {
    pub status: GateStatus,
    pub msg: String,
    pub who: String,
    #[serde(skip)]
    pub until: Option<i64>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Runtime {
    pub gates: BTreeMap<String, GateRt>,
    pub auto: bool,
    pub started_at: i64,
}

#[derive(Deserialize, Default, Clone, Debug)]
#[serde(rename_all = "camelCase", default)]
pub struct TapReq {
    pub nik: String,
    pub name: String,
    pub city: String,
    pub province: String,
    pub category: Option<String>,
    pub gate_id: String,
    #[serde(skip)]
    pub sim: bool,
}

#[derive(Serialize, Debug, PartialEq, Eq)]
pub struct TapResult {
    pub ok: bool,
    pub reason: String,
}

fn ok() -> TapResult {
    TapResult { ok: true, reason: String::new() }
}
fn fail(reason: &str) -> TapResult {
    TapResult { ok: false, reason: reason.to_string() }
}

pub struct Engine {
    pub data: Persist,
    pub rt: Runtime,
    pub dirty: bool,
    clock: Option<i64>, // fixed clock for tests
    next_auto: i64,
}

fn dir_word(d: Dir) -> &'static str {
    if d == Dir::In { "MASUK" } else { "KELUAR" }
}

/// "Name (3171••••••••0003) ×4" — the identity string used in terminal log lines.
pub fn who(r: &Visit) -> String {
    let mut s = if r.name.is_empty() { "—".to_string() } else { r.name.clone() };
    if !r.nik.is_empty() {
        s.push_str(&format!(" ({})", mask_nik(&r.nik, '•')));
    }
    if r.count > 1 {
        s.push_str(&format!(" ×{}", r.count));
    }
    s
}

impl Engine {
    pub fn new(data: Persist) -> Self {
        let now = now_ms();
        let mut e = Engine {
            rt: Runtime {
                gates: GATES
                    .iter()
                    .map(|g| (g.id.to_string(), GateRt { status: GateStatus::Locked, msg: String::new(), who: String::new(), until: None }))
                    .collect(),
                auto: false,
                started_at: now,
            },
            data,
            dirty: false,
            clock: None,
            next_auto: 0,
        };
        if e.data.panic {
            for g in e.rt.gates.values_mut() {
                g.status = GateStatus::Panic;
                g.msg = "EMERGENCY OPEN".into();
            }
        }
        e
    }

    pub fn now(&self) -> i64 {
        self.clock.unwrap_or_else(now_ms)
    }

    #[cfg(test)]
    pub fn set_clock(&mut self, ts: i64) {
        self.clock = Some(ts);
    }

    pub fn count_inside(&self) -> u32 {
        self.data.visitors.values().filter(|v| v.inside).count() as u32 + self.data.groups.iter().map(|g| g.inside).sum::<u32>()
    }

    pub fn gate_name(&self, id: &str) -> String {
        self.data.settings.gate_names.get(id).cloned().unwrap_or_else(|| id.to_string())
    }

    /* -------------------------------------------------------------- plumbing */

    fn set_gate(&mut self, id: &str, status: GateStatus, msg: &str, ms: Option<i64>, who: Option<&str>) {
        let now = self.now();
        let panic = self.data.panic;
        let Some(g) = self.rt.gates.get_mut(id) else { return };
        if panic && status != GateStatus::Panic {
            // Gates stay open in an emergency; just remember who passed.
            if let Some(w) = who.filter(|w| !w.is_empty()) {
                g.who = w.to_string();
            }
            return;
        }
        g.status = status;
        g.msg = msg.to_string();
        if let Some(w) = who {
            g.who = w.to_string();
        }
        g.until = if status != GateStatus::Locked { ms.map(|m| now + m) } else { None };
    }

    fn record(&mut self, mut rec: Visit) {
        rec.id = uid();
        if rec.ts == 0 {
            rec.ts = self.now();
        }
        rec.day = day_key(rec.ts);
        rec.hour = hour_of(rec.ts);
        rec.count = rec.count.max(1);
        self.data.visits.push(rec);
        let over = self.data.visits.len().saturating_sub(MAX_VISITS);
        if over > 0 {
            self.data.visits.drain(..over);
        }
    }

    pub fn log(&mut self, level: &str, msg: String, ts: Option<i64>) {
        let ts = ts.unwrap_or_else(|| self.now());
        self.data.logs.push(LogLine { ts, level: level.to_string(), msg });
        let over = self.data.logs.len().saturating_sub(MAX_LOGS);
        if over > 0 {
            self.data.logs.drain(..over);
        }
    }

    fn deny(&mut self, gate: &GateDef, mut rec: Visit, reason: &str) -> TapResult {
        rec.result = Res::Denied;
        rec.reason = reason.to_string();
        let line = format!("{} ditolak @ {} — {}: {}", dir_word(rec.dir), self.gate_name(gate.id), who(&rec), reason);
        self.record(rec);
        self.log("DENY", line, None);
        self.set_gate(gate.id, GateStatus::Denied, reason, Some(2200), Some(""));
        fail(reason)
    }

    fn grant(&mut self, gate: &GateDef, mut rec: Visit) -> TapResult {
        rec.result = Res::Granted;
        let dwell = if rec.dwell > 0 { format!(" • durasi {}", fmt_dur(rec.dwell)) } else { String::new() };
        let line = format!("{} diizinkan @ {} — {}{}", dir_word(rec.dir), self.gate_name(gate.id), who(&rec), dwell);
        let name = rec.name.clone();
        self.record(rec);
        self.log("OK", line, None);
        let ms = (self.data.settings.relock_sec * 1000.0) as i64;
        self.set_gate(gate.id, GateStatus::Open, "ACCESS GRANTED", Some(ms), Some(&name));
        ok()
    }

    /* -------------------------------------------------------------- commands */

    /// An e-KTP tap on a gate.
    pub fn tap(&mut self, req: TapReq) -> TapResult {
        let Some(gate) = gate_def(&req.gate_id) else { return fail("Gate tidak dikenal") };
        let now = self.now();
        let nik: String = req.nik.chars().filter(|c| !c.is_whitespace() && *c != '-').take(32).collect();
        let info = parse_nik(&nik, now);
        let cat_req = req.category.as_deref().filter(|c| is_category(c)).map(str::to_string);
        let mut rec = Visit {
            ts: now,
            gate_id: gate.id.to_string(),
            dir: gate.dir,
            nik: nik.clone(),
            name: trunc(&req.name, 80),
            city: trunc(&req.city, 60),
            province: trunc(&req.province, 60),
            category: cat_req.clone().unwrap_or_else(|| info.as_ref().map(suggest_category).unwrap_or("umum").to_string()),
            count: 1,
            sim: req.sim,
            ..Visit::default()
        };
        let info = match info {
            Ok(i) => i,
            Err(e) => return self.deny(gate, rec, e),
        };

        // Upsert the visitor record (also for denied taps, as the original app did).
        let v = self.data.visitors.entry(nik.clone()).or_insert_with(|| Visitor {
            nik: nik.clone(),
            name: if rec.name.is_empty() { format!("Pengunjung ({})", &nik[12..]) } else { rec.name.clone() },
            city: rec.city.clone(),
            province: if rec.province.is_empty() { info.province.to_string() } else { rec.province.clone() },
            category: rec.category.clone(),
            inside: false,
            entered_at: 0,
            sim: req.sim,
        });
        if !rec.name.is_empty() {
            v.name = rec.name.clone();
        }
        if !rec.city.is_empty() {
            v.city = rec.city.clone();
        }
        if !rec.province.is_empty() {
            v.province = rec.province.clone();
        }
        if let Some(c) = &cat_req {
            v.category = c.clone();
        }
        rec.name = v.name.clone();
        rec.city = v.city.clone();
        rec.province = v.province.clone();
        rec.category = v.category.clone();
        let (was_inside, entered_at) = (v.inside, v.entered_at);
        let ap = self.data.settings.anti_passback;

        if gate.dir == Dir::In {
            if self.data.panic {
                return self.deny(gate, rec, "Mode darurat aktif — masuk ditutup");
            }
            if was_inside && ap {
                return self.deny(gate, rec, "Anti-passback: NIK sudah tercatat di dalam");
            }
            if self.count_inside() + if was_inside { 0 } else { 1 } > self.data.settings.capacity {
                return self.deny(gate, rec, "Kapasitas area penuh");
            }
            if let Some(v) = self.data.visitors.get_mut(&nik) {
                v.inside = true;
                v.entered_at = now;
            }
            return self.grant(gate, rec);
        }

        if !was_inside && ap && !self.data.panic {
            return self.deny(gate, rec, "Belum tercatat masuk (anti-passback)");
        }
        if was_inside && entered_at > 0 {
            rec.dwell = now - entered_at;
        }
        if let Some(v) = self.data.visitors.get_mut(&nik) {
            v.inside = false;
        }
        self.grant(gate, rec)
    }

    /// Group pass: one tap admits (or releases) the whole party.
    pub fn tap_group(&mut self, group_id: &str, gate_id: &str) -> TapResult {
        let Some(gate) = gate_def(gate_id) else { return fail("Gate tidak dikenal") };
        let Some(gi) = self.data.groups.iter().position(|g| g.id == group_id) else { return fail("Rombongan tidak ditemukan") };
        let now = self.now();
        let g = self.data.groups[gi].clone();
        let mut rec = Visit {
            ts: now,
            gate_id: gate.id.to_string(),
            dir: gate.dir,
            name: g.name.clone(),
            city: g.city.clone(),
            category: g.category.clone(),
            count: g.size,
            group_id: g.id.clone(),
            sim: g.sim,
            ..Visit::default()
        };
        if gate.dir == Dir::In {
            if self.data.panic {
                return self.deny(gate, rec, "Mode darurat aktif — masuk ditutup");
            }
            if g.inside > 0 {
                return self.deny(gate, rec, "Rombongan sudah tercatat di dalam");
            }
            if self.count_inside() + g.size > self.data.settings.capacity {
                return self.deny(gate, rec, &format!("Kapasitas tidak cukup untuk {} orang", g.size));
            }
            self.data.groups[gi].inside = g.size;
            self.data.groups[gi].entered_at = now;
            return self.grant(gate, rec);
        }
        if g.inside == 0 {
            return self.deny(gate, rec, "Rombongan belum tercatat masuk");
        }
        rec.count = g.inside;
        rec.dwell = if g.entered_at > 0 { now - g.entered_at } else { 0 };
        self.data.groups[gi].inside = 0;
        self.grant(gate, rec)
    }

    /// Officer override. `seconds == 0` keeps the gate open until it is locked by hand.
    /// Overrides are audited but do not change the head count (nobody is identified).
    pub fn manual_open(&mut self, gate_id: &str, reason: &str, seconds: u32) -> Result<(), &'static str> {
        let gate = gate_def(gate_id).ok_or("Gate tidak dikenal")?;
        let seconds = seconds.min(600);
        let reason = if trunc(reason, 120).is_empty() { REASONS[5].to_string() } else { trunc(reason, 120) };
        let ts = self.now();
        self.record(Visit {
            ts,
            gate_id: gate.id.to_string(),
            dir: gate.dir,
            result: Res::Manual,
            reason: reason.clone(),
            name: "Petugas".into(),
            count: 1,
            ..Visit::default()
        });
        let hold = if seconds > 0 { format!("auto-close {seconds}s") } else { "ditahan terbuka".to_string() };
        self.log("OVR", format!("Petugas membuka {} secara manual. Alasan: {} ({})", self.gate_name(gate.id), reason, hold), Some(ts));
        self.set_gate(gate.id, GateStatus::Manual, "MANUAL OVERRIDE", if seconds > 0 { Some(seconds as i64 * 1000) } else { None }, Some("Petugas"));
        Ok(())
    }

    pub fn lock_gate(&mut self, gate_id: &str) -> Result<(), &'static str> {
        let gate = gate_def(gate_id).ok_or("Gate tidak dikenal")?;
        if self.data.panic {
            return Ok(());
        }
        self.set_gate(gate.id, GateStatus::Locked, "", None, Some(""));
        self.log("SYS", format!("Petugas mengunci {}.", self.gate_name(gate.id)), None);
        Ok(())
    }

    pub fn set_panic(&mut self, on: bool) {
        self.data.panic = on;
        for g in self.rt.gates.values_mut() {
            g.until = None;
            g.status = if on { GateStatus::Panic } else { GateStatus::Locked };
            g.msg = if on { "EMERGENCY OPEN".into() } else { String::new() };
        }
        let msg = if on {
            "PANIC GATE DIAKTIFKAN — seluruh turnstile dibuka, masuk ditutup."
        } else {
            "Mode darurat dinormalkan — seluruh turnstile dikunci kembali."
        };
        self.log(if on { "ALERT" } else { "SYS" }, msg.to_string(), None);
    }

    pub fn update_settings(&mut self, patch: &Value) -> Result<(), String> {
        self.data.settings.apply_patch(patch)
    }

    pub fn add_group(&mut self, name: &str, leader: &str, city: &str, category: &str, size: u32) -> Result<(), &'static str> {
        let name = trunc(name, 80);
        if name.is_empty() {
            return Err("Nama rombongan wajib diisi");
        }
        if !(2..=500).contains(&size) {
            return Err("Jumlah rombongan 2–500 orang");
        }
        if !is_category(category) {
            return Err("Kategori tidak dikenal");
        }
        self.data.groups.insert(
            0,
            Group { id: uid(), name: name.clone(), leader: trunc(leader, 80), city: trunc(city, 60), category: category.to_string(), size, inside: 0, entered_at: 0, sim: false },
        );
        self.data.groups.truncate(200);
        self.log("SYS", format!("Group pass terdaftar: {name} ({size} orang)."), None);
        Ok(())
    }

    pub fn remove_group(&mut self, id: &str) {
        if let Some(i) = self.data.groups.iter().position(|g| g.id == id) {
            let g = self.data.groups.remove(i);
            self.log("SYS", format!("Group pass dihapus: {}.", g.name), None);
        }
    }

    pub fn add_guestbook(&mut self, name: &str, text: &str, rating: u8) -> Result<(), &'static str> {
        let text = trunc(text, 400);
        if text.is_empty() {
            return Err("Pesan tidak boleh kosong");
        }
        let name = trunc(name, 60);
        let ts = self.now();
        self.data.guestbook.push(GuestMsg { ts, name: if name.is_empty() { "Anonim".into() } else { name }, text, rating: rating.clamp(1, 5), sim: false });
        let over = self.data.guestbook.len().saturating_sub(MAX_GUESTBOOK);
        if over > 0 {
            self.data.guestbook.drain(..over);
        }
        Ok(())
    }

    /* -------------------------------------------------------------- maintenance */

    pub fn clear_sim(&mut self) {
        self.data.visits.retain(|v| !v.sim);
        self.data.visitors.retain(|_, v| !v.sim);
        self.data.groups.retain(|g| !g.sim);
        self.data.guestbook.retain(|m| !m.sim);
        self.log("SYS", "Data simulasi/demo dihapus.".into(), None);
    }

    pub fn reset_today(&mut self) {
        let today = day_key(self.now());
        self.data.visits.retain(|v| v.day != today);
        for v in self.data.visitors.values_mut() {
            v.inside = false;
        }
        for g in self.data.groups.iter_mut() {
            g.inside = 0;
        }
        self.log("SYS", "Data hari ini direset oleh petugas.".into(), None);
    }

    pub fn factory_reset(&mut self) {
        self.rt.auto = false;
        self.data = Persist::default();
        self.reset_gates();
    }

    pub fn import(&mut self, p: Persist) {
        self.rt.auto = false;
        self.data = p.sanitize();
        self.reset_gates();
        let panic = self.data.panic;
        for g in self.rt.gates.values_mut() {
            if panic {
                g.status = GateStatus::Panic;
                g.msg = "EMERGENCY OPEN".into();
            }
        }
    }

    fn reset_gates(&mut self) {
        for g in self.rt.gates.values_mut() {
            *g = GateRt { status: GateStatus::Locked, msg: String::new(), who: String::new(), until: None };
        }
    }

    pub fn set_auto(&mut self, on: bool) {
        self.rt.auto = on;
        self.next_auto = 0;
    }

    /// Housekeeping driven by the server's 200 ms ticker: re-lock expired gates, run auto-traffic.
    /// Returns true when something visible changed.
    pub fn tick(&mut self) -> bool {
        let now = self.now();
        let panic = self.data.panic;
        let mut changed = false;
        for g in self.rt.gates.values_mut() {
            if matches!(g.until, Some(t) if t <= now) {
                g.until = None;
                g.status = if panic { GateStatus::Panic } else { GateStatus::Locked };
                g.msg = if panic { "EMERGENCY OPEN".into() } else { String::new() };
                changed = true;
            }
        }
        if self.rt.auto && now >= self.next_auto {
            self.auto_step();
            self.next_auto = now + 1200 + rand::rng().random_range(0..2300);
            changed = true;
        }
        if changed {
            self.dirty = true;
        }
        changed
    }

    fn auto_step(&mut self) {
        let inside: Vec<String> = self.data.visitors.values().filter(|v| v.inside).map(|v| v.nik.clone()).collect();
        let ins: Vec<&str> = GATES.iter().filter(|g| g.dir == Dir::In).map(|g| g.id).collect();
        let outs: Vec<&str> = GATES.iter().filter(|g| g.dir == Dir::Out).map(|g| g.id).collect();
        let (leave, pick_nik, gate_in, gate_out) = {
            let mut r = rand::rng();
            (
                inside.len() > 4 && r.random_bool(0.45),
                inside.choose(&mut r).cloned(),
                *ins.choose(&mut r).unwrap_or(&"GM-01"),
                *outs.choose(&mut r).unwrap_or(&"GK-01"),
            )
        };
        if let (true, Some(nik)) = (leave, pick_nik) {
            self.tap(TapReq { nik, gate_id: gate_out.into(), sim: true, ..TapReq::default() });
        } else if let Some(p) = self.random_persona() {
            self.tap(TapReq { nik: p.nik, name: p.name, city: p.city, province: p.province, category: Some(p.category), gate_id: gate_in.into(), sim: true });
        }
    }

    /* -------------------------------------------------------------- view for the API */

    /// State as sent to the browser. NIKs are masked (first 4 + last 4); the visitor map is keyed by an
    /// opaque index so full NIKs never leave the server except through the token-protected backup export.
    pub fn view(&self, version: u64) -> Value {
        let mask_visit = |v: &Visit| {
            let mut v = v.clone();
            v.nik = if v.nik.len() == 16 { mask_nik(&v.nik, '*') } else { String::new() };
            v
        };
        let visitors: BTreeMap<String, Visitor> = self
            .data
            .visitors
            .values()
            .enumerate()
            .map(|(i, v)| (format!("v{i}"), Visitor { nik: mask_nik(&v.nik, '*'), ..v.clone() }))
            .collect();
        let presets: Vec<Value> = PRESETS
            .iter()
            .map(|(nik, name, city, province, category, note)| {
                let inside = self.data.visitors.get(*nik).map(|v| v.inside).unwrap_or(false);
                serde_json::json!({ "nik": nik, "name": name, "city": city, "province": province, "category": category, "note": note, "inside": inside })
            })
            .collect();
        serde_json::json!({
            "version": version,
            "now": self.now(),
            "state": {
                "settings": self.data.settings,
                "visitors": visitors,
                "groups": self.data.groups,
                "visits": self.data.visits.iter().map(mask_visit).collect::<Vec<_>>(),
                "logs": self.data.logs,
                "guestbook": self.data.guestbook,
                "panic": self.data.panic,
            },
            "rt": self.rt,
            "presets": presets,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const BAMBANG: &str = "3171011503850003";
    const SITI: &str = "3273045207920004";
    const T0: i64 = 1_792_990_800_000; // 2026-10-26 12:00 WIB

    fn eng() -> Engine {
        let mut e = Engine::new(Persist::default());
        e.set_clock(T0);
        e
    }
    fn tap(e: &mut Engine, nik: &str, gate: &str) -> TapResult {
        e.tap(TapReq { nik: nik.into(), gate_id: gate.into(), ..TapReq::default() })
    }
    fn last(e: &Engine) -> &Visit {
        e.data.visits.last().unwrap()
    }

    #[test]
    fn entry_then_exit_records_dwell() {
        let mut e = eng();
        assert!(tap(&mut e, BAMBANG, "GM-01").ok);
        assert_eq!(e.count_inside(), 1);
        e.set_clock(T0 + 105 * 60_000);
        assert!(tap(&mut e, BAMBANG, "GK-02").ok);
        assert_eq!(e.count_inside(), 0);
        assert_eq!(last(&e).dwell, 105 * 60_000);
        assert!(e.data.logs.last().unwrap().msg.contains("durasi 1j 45m"));
    }

    #[test]
    fn anti_passback_blocks_double_entry_and_phantom_exit() {
        let mut e = eng();
        assert!(tap(&mut e, BAMBANG, "GM-01").ok);
        let r = tap(&mut e, BAMBANG, "GM-02");
        assert!(!r.ok && r.reason.starts_with("Anti-passback"));
        assert_eq!(e.count_inside(), 1);
        let r = tap(&mut e, SITI, "GK-01");
        assert!(!r.ok && r.reason.contains("Belum tercatat masuk"));
        assert_eq!(last(&e).result, Res::Denied);
    }

    #[test]
    fn anti_passback_can_be_switched_off() {
        let mut e = eng();
        e.update_settings(&serde_json::json!({ "antiPassback": false })).unwrap();
        assert!(tap(&mut e, BAMBANG, "GM-01").ok);
        assert!(tap(&mut e, BAMBANG, "GM-02").ok);
        assert_eq!(e.count_inside(), 1, "same person is not counted twice");
        assert!(tap(&mut e, SITI, "GK-01").ok, "exit without entry allowed when guard is off");
    }

    #[test]
    fn invalid_nik_is_denied_and_never_stored_as_visitor() {
        let mut e = eng();
        for bad in ["", "123", "1234567890123456", "3171011503850AB3"] {
            let r = tap(&mut e, bad, "GM-01");
            assert!(!r.ok, "{bad:?} must be refused");
        }
        assert!(e.data.visitors.is_empty());
        assert_eq!(e.count_inside(), 0);
    }

    #[test]
    fn capacity_is_enforced_for_people_and_groups() {
        let mut e = eng();
        e.update_settings(&serde_json::json!({ "capacity": 2 })).unwrap();
        assert!(tap(&mut e, BAMBANG, "GM-01").ok);
        e.add_group("Rombongan", "", "", "umum", 2).unwrap();
        let gid = e.data.groups[0].id.clone();
        let r = e.tap_group(&gid, "GM-03");
        assert!(!r.ok && r.reason.contains("Kapasitas"));
        assert!(tap(&mut e, SITI, "GM-01").ok);
        let r = tap(&mut e, "3204081807700003", "GM-01");
        assert!(!r.ok && r.reason == "Kapasitas area penuh");
        assert_eq!(e.count_inside(), 2);
    }

    #[test]
    fn group_pass_admits_and_releases_whole_party() {
        let mut e = eng();
        assert!(e.add_group("SDN 1", "Bu Ani", "Bandung", "pelajar", 1).is_err());
        e.add_group("SDN 1", "Bu Ani", "Bandung", "pelajar", 40).unwrap();
        let gid = e.data.groups[0].id.clone();
        assert!(!e.tap_group(&gid, "GK-03").ok, "cannot leave before entering");
        assert!(e.tap_group(&gid, "GM-03").ok);
        assert_eq!(e.count_inside(), 40);
        assert!(!e.tap_group(&gid, "GM-03").ok, "no double entry");
        assert!(e.tap_group(&gid, "GK-03").ok);
        assert_eq!(e.count_inside(), 0);
        assert_eq!(last(&e).count, 40);
    }

    #[test]
    fn panic_opens_everything_blocks_entry_but_allows_exit() {
        let mut e = eng();
        assert!(tap(&mut e, BAMBANG, "GM-01").ok);
        e.set_panic(true);
        assert!(e.rt.gates.values().all(|g| g.status == GateStatus::Panic));
        let r = tap(&mut e, SITI, "GM-01");
        assert!(!r.ok && r.reason.contains("darurat"));
        assert!(e.rt.gates["GM-01"].status == GateStatus::Panic, "a denial must not close a gate during an emergency");
        assert!(tap(&mut e, BAMBANG, "GK-01").ok);
        assert!(tap(&mut e, SITI, "GK-02").ok, "evacuation exits never need a prior entry");
        e.set_panic(false);
        assert!(e.rt.gates.values().all(|g| g.status == GateStatus::Locked));
    }

    #[test]
    fn manual_override_is_audited_but_not_counted_and_relocks() {
        let mut e = eng();
        e.manual_open("GM-02", "Uji Coba Perangkat (Test)", 5).unwrap();
        assert_eq!(e.rt.gates["GM-02"].status, GateStatus::Manual);
        assert_eq!(last(&e).result, Res::Manual);
        assert_eq!(e.count_inside(), 0);
        assert!(e.data.logs.last().unwrap().msg.contains("auto-close 5s"));
        e.set_clock(T0 + 4_000);
        assert!(!e.tick());
        e.set_clock(T0 + 5_001);
        assert!(e.tick());
        assert_eq!(e.rt.gates["GM-02"].status, GateStatus::Locked);
        // hold-open stays open until locked by hand
        e.manual_open("GM-02", "", 0).unwrap();
        e.set_clock(T0 + 3_600_000);
        e.tick();
        assert_eq!(e.rt.gates["GM-02"].status, GateStatus::Manual);
        e.lock_gate("GM-02").unwrap();
        assert_eq!(e.rt.gates["GM-02"].status, GateStatus::Locked);
        assert!(e.manual_open("XX-99", "x", 1).is_err());
    }

    #[test]
    fn granted_gate_relocks_after_configured_delay() {
        let mut e = eng();
        e.update_settings(&serde_json::json!({ "relockSec": 2 })).unwrap();
        tap(&mut e, BAMBANG, "GM-01");
        assert_eq!(e.rt.gates["GM-01"].status, GateStatus::Open);
        e.set_clock(T0 + 2_100);
        e.tick();
        assert_eq!(e.rt.gates["GM-01"].status, GateStatus::Locked);
    }

    #[test]
    fn view_never_contains_a_full_nik() {
        let mut e = eng();
        tap(&mut e, BAMBANG, "GM-01");
        tap(&mut e, "3171011503850AB3", "GM-01");
        // `presets` intentionally carries the fictitious sample cards; everything under `state` must be masked.
        let s = e.view(1)["state"].to_string();
        assert!(!s.contains(BAMBANG.get(4..12).unwrap()), "middle digits leaked: {s}");
        assert!(s.contains("3171********0003"));
        assert!(!s.contains("3171011503850AB3"));
    }

    #[test]
    fn settings_patch_merges_clamps_and_ignores_unknown_keys() {
        let mut e = eng();
        e.update_settings(&serde_json::json!({ "capacity": 0, "relockSec": 999, "evil": 1, "gateNames": { "GM-01": "Pintu Utama", "ZZ": "x" }, "prices": { "umum": -5 } })).unwrap();
        let s = &e.data.settings;
        assert_eq!(s.capacity, 1);
        assert_eq!(s.relock_sec, 30.0);
        assert_eq!(s.gate_names["GM-01"], "Pintu Utama");
        assert!(!s.gate_names.contains_key("ZZ"));
        assert_eq!(s.gate_names["GM-02"], "Gate Masuk 2 (Reguler)", "untouched names survive a partial patch");
        assert_eq!(s.prices["umum"], 0.0);
        assert!(e.update_settings(&serde_json::json!({ "capacity": "abc" })).is_err());
        assert!(e.update_settings(&serde_json::json!([1, 2])).is_err());
    }

    #[test]
    fn import_sanitizes_hostile_data() {
        let mut e = eng();
        let evil = serde_json::json!({
            "v": 1,
            "settings": { "capacity": 999999999, "parkName": "<b>x</b>" },
            "visitors": { "short": { "nik": "short", "inside": true }, "3171011503850003": { "name": "Ok", "category": "hacker", "inside": true } },
            "visits": [ { "ts": 1, "gateId": "NOPE" }, { "ts": 1792990800000i64, "gateId": "GM-01", "count": 0, "category": "x" } ],
            "groups": [ { "size": 5, "inside": 50 } ],
            "unknownTopLevel": 1
        });
        let p: Persist = serde_json::from_value(evil).unwrap();
        e.import(p);
        assert_eq!(e.data.settings.capacity, 100_000);
        assert_eq!(e.data.visitors.len(), 1);
        assert_eq!(e.data.visitors["3171011503850003"].category, "umum");
        assert_eq!(e.data.visits.len(), 1);
        assert_eq!(e.data.visits[0].count, 1);
        assert_eq!(e.data.visits[0].day, "2026-10-26");
        assert_eq!(e.data.groups[0].inside, 5);
        assert!(!e.data.groups[0].id.is_empty());
    }

    #[test]
    fn import_accepts_float_timestamps_from_the_old_browser_app() {
        let mut e = eng();
        let old = serde_json::json!({
            "v": 1, "settings": { "capacity": 300, "relockSec": 4, "antiPassback": true, "sound": true },
            "target": "GM-02",
            "visitors": { "3171011503850003": { "nik": "3171011503850003", "name": "A", "inside": true, "enteredAt": 1792990800000.6804 } },
            "visits": [ { "id": "x", "ts": 1792990800000.6804, "gateId": "GM-01", "dir": "IN", "result": "OK", "dwell": 1234.5, "count": 1 } ],
            "logs": [ { "ts": 1792990800000.25, "level": "OK", "msg": "m" } ],
            "guestbook": [ { "ts": 1792990800000.5, "name": "n", "text": "t", "rating": 5 } ],
            "groups": []
        });
        let p: Persist = serde_json::from_value(old).expect("floats must be accepted");
        e.import(p);
        assert_eq!(e.data.visits[0].ts, 1_792_990_800_001);
        assert_eq!(e.data.visits[0].day, "2026-10-26");
        assert_eq!(e.count_inside(), 1);
        assert!(serde_json::from_value::<Persist>(serde_json::json!({ "visits": [ { "ts": "yesterday" } ] })).is_err(), "strings are still rejected");
    }

    #[test]
    fn guestbook_and_group_validation() {
        let mut e = eng();
        assert!(e.add_guestbook("  ", "   ", 5).is_err());
        e.add_guestbook("", "Bagus!", 9).unwrap();
        assert_eq!(e.data.guestbook[0].name, "Anonim");
        assert_eq!(e.data.guestbook[0].rating, 5);
        assert!(e.add_group("", "", "", "umum", 10).is_err());
        assert!(e.add_group("X", "", "", "nope", 10).is_err());
        assert!(e.add_group("X", "", "", "umum", 501).is_err());
    }
}
