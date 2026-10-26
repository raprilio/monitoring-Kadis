//! Persistent data model. JSON field names are camelCase so the web UI and old JS backups stay compatible.

use std::collections::BTreeMap;

use serde::{de::Error as _, Deserialize, Deserializer, Serialize};
use serde_json::Value;

use crate::util::{day_key, hour_of, trunc};

/// Accepts integers and floats (the old browser-only version stored fractional millisecond timestamps).
fn lenient_i64<'de, D: Deserializer<'de>>(d: D) -> Result<i64, D::Error> {
    match Value::deserialize(d)? {
        Value::Number(n) => n.as_i64().or_else(|| n.as_f64().filter(|f| f.is_finite()).map(|f| f.round() as i64)).ok_or_else(|| D::Error::custom("angka tidak valid")),
        Value::Null => Ok(0),
        other => Err(D::Error::custom(format!("diharapkan angka, dapat {other}"))),
    }
}

pub const MAX_VISITS: usize = 8000;
pub const MAX_LOGS: usize = 300;
pub const MAX_GUESTBOOK: usize = 500;

#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Eq, Debug, Default)]
pub enum Dir {
    #[serde(rename = "IN")]
    #[default]
    In,
    #[serde(rename = "OUT")]
    Out,
}

#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Eq, Debug, Default)]
pub enum Res {
    #[serde(rename = "OK")]
    #[default]
    Granted,
    #[serde(rename = "DENIED")]
    Denied,
    #[serde(rename = "MANUAL")]
    Manual,
}

pub struct GateDef {
    pub id: &'static str,
    pub dir: Dir,
    pub name: &'static str,
}

pub const GATES: [GateDef; 6] = [
    GateDef { id: "GM-01", dir: Dir::In, name: "Gate Masuk 1 (Utama)" },
    GateDef { id: "GM-02", dir: Dir::In, name: "Gate Masuk 2 (Reguler)" },
    GateDef { id: "GM-03", dir: Dir::In, name: "Gate Masuk 3 (VIP & Rombongan)" },
    GateDef { id: "GK-01", dir: Dir::Out, name: "Gate Keluar 1 (Timur)" },
    GateDef { id: "GK-02", dir: Dir::Out, name: "Gate Keluar 2 (Barat)" },
    GateDef { id: "GK-03", dir: Dir::Out, name: "Gate Keluar 3 (Parkir Bus)" },
];

pub fn gate_def(id: &str) -> Option<&'static GateDef> {
    GATES.iter().find(|g| g.id == id)
}

/// (key, label, default price in Rupiah — placeholders, editable in Settings)
pub const CATEGORIES: [(&str, &str, f64); 5] = [
    ("umum", "Umum", 25_000.0),
    ("pelajar", "Pelajar", 15_000.0),
    ("lansia", "Lansia", 15_000.0),
    ("mancanegara", "Mancanegara", 75_000.0),
    ("vip", "VIP", 0.0),
];

pub fn is_category(c: &str) -> bool {
    CATEGORIES.iter().any(|(k, _, _)| *k == c)
}

pub const REASONS: [&str; 6] = [
    "Tiket Fisik / Karcis Barcode Manual",
    "Pembukaan Cepat Petugas di Turnstile",
    "Rombongan / Group Pass",
    "Lansia / Disabilitas / Kursi Roda",
    "Uji Coba Perangkat (Test)",
    "Lainnya (Kebutuhan Operasional)",
];

/// (nik, name, city, province, category, note) — fictitious sample cards for quick testing.
pub const PRESETS: [(&str, &str, &str, &str, &str, &str); 6] = [
    ("3171011503850003", "Bambang Trianto", "Jakarta Pusat", "DKI Jakarta", "umum", "Jakarta • Status: Luar Area"),
    ("3273045207920004", "Siti Nurhaliza Putri", "Bandung", "Jawa Barat", "umum", "Bandung • Uji Anti-Passback"),
    ("9901010502880008", "Kevin Van Der Berg", "Amsterdam", "Mancanegara (Tourist Pass)", "mancanegara", "Amsterdam • Tourist Pass"),
    ("3578062009100001", "Raditya Bagus Pratama", "Surabaya", "Jawa Timur", "pelajar", "Surabaya • Diskon Pelajar"),
    ("3404094505550002", "Hj. Sri Rahayu", "Sleman", "DI Yogyakarta", "lansia", "Sleman, DI. Yogyakarta"),
    ("3204081807700003", "Drs. Hendra Permana", "Bandung", "Jawa Barat", "vip", "Bandung • Tamu Khusus"),
];

/* ------------------------------------------------------------------ settings */

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub park_name: String,
    pub subtitle: String,
    pub capacity: u32,
    pub relock_sec: f64,
    pub anti_passback: bool,
    pub gate_names: BTreeMap<String, String>,
    pub prices: BTreeMap<String, f64>,
    pub announcements: Vec<String>,
}

impl Default for Settings {
    fn default() -> Self {
        Settings {
            park_name: "WISATA GATEWAY".into(),
            subtitle: "TAMAN WISATA ALAM NUSANTARA • DIGITAL GUESTBOOK & ACCESS CONTROLLER".into(),
            capacity: 300,
            relock_sec: 4.0,
            anti_passback: true,
            gate_names: GATES.iter().map(|g| (g.id.to_string(), g.name.to_string())).collect(),
            prices: CATEGORIES.iter().map(|(k, _, p)| (k.to_string(), *p)).collect(),
            announcements: vec![
                "Selamat datang di Taman Wisata Alam Nusantara".into(),
                "Harap jaga kebersihan dan buang sampah pada tempatnya".into(),
                "Anak-anak wajib didampingi orang dewasa".into(),
                "Tap e-KTP Anda di turnstile saat keluar — tiket berlaku untuk satu kali masuk".into(),
            ],
        }
    }
}

impl Settings {
    pub fn sanitize(&mut self) {
        let d = Settings::default();
        self.park_name = trunc(&self.park_name, 60);
        if self.park_name.is_empty() {
            self.park_name = d.park_name.clone();
        }
        self.subtitle = trunc(&self.subtitle, 160);
        self.capacity = self.capacity.clamp(1, 100_000);
        self.relock_sec = if self.relock_sec.is_finite() { self.relock_sec.clamp(1.0, 30.0) } else { d.relock_sec };
        for g in GATES.iter() {
            let v = trunc(self.gate_names.get(g.id).map(String::as_str).unwrap_or(""), 60);
            self.gate_names.insert(g.id.to_string(), if v.is_empty() { g.name.to_string() } else { v });
        }
        self.gate_names.retain(|k, _| gate_def(k).is_some());
        for (k, _, p) in CATEGORIES.iter() {
            let v = self.prices.get(*k).copied().filter(|x| x.is_finite()).unwrap_or(*p);
            self.prices.insert(k.to_string(), v.clamp(0.0, 1e8));
        }
        self.prices.retain(|k, _| is_category(k));
        self.announcements = self.announcements.iter().map(|a| trunc(a, 140)).filter(|a| !a.is_empty()).take(20).collect();
    }

    /// Applies a partial JSON patch: top-level keys replace, `gateNames`/`prices` merge key by key.
    pub fn apply_patch(&mut self, patch: &Value) -> Result<(), String> {
        let Value::Object(p) = patch else { return Err("Body harus berupa objek JSON".into()) };
        let mut cur = serde_json::to_value(&*self).map_err(|e| e.to_string())?;
        let obj = cur.as_object_mut().ok_or("internal")?;
        for (k, v) in p {
            if !obj.contains_key(k) {
                continue; // unknown keys are ignored, not stored
            }
            match (k.as_str(), obj.get_mut(k), v) {
                ("gateNames" | "prices", Some(Value::Object(dst)), Value::Object(src)) => {
                    for (kk, vv) in src {
                        dst.insert(kk.clone(), vv.clone());
                    }
                }
                _ => {
                    obj.insert(k.clone(), v.clone());
                }
            }
        }
        let mut next: Settings = serde_json::from_value(cur).map_err(|e| format!("Nilai pengaturan tidak valid: {e}"))?;
        next.sanitize();
        *self = next;
        Ok(())
    }
}

/* ------------------------------------------------------------------ records */

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct Visitor {
    pub nik: String,
    pub name: String,
    pub city: String,
    pub province: String,
    pub category: String,
    pub inside: bool,
    #[serde(deserialize_with = "lenient_i64")]
    pub entered_at: i64,
    pub sim: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct Group {
    pub id: String,
    pub name: String,
    pub leader: String,
    pub city: String,
    pub category: String,
    pub size: u32,
    pub inside: u32,
    #[serde(deserialize_with = "lenient_i64")]
    pub entered_at: i64,
    pub sim: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct Visit {
    pub id: String,
    #[serde(deserialize_with = "lenient_i64")]
    pub ts: i64,
    pub day: String,
    pub hour: u8,
    pub gate_id: String,
    pub dir: Dir,
    pub result: Res,
    pub nik: String,
    pub name: String,
    pub city: String,
    pub province: String,
    pub category: String,
    pub count: u32,
    pub group_id: String,
    pub reason: String,
    #[serde(deserialize_with = "lenient_i64")]
    pub dwell: i64,
    pub sim: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct LogLine {
    #[serde(deserialize_with = "lenient_i64")]
    pub ts: i64,
    pub level: String,
    pub msg: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct GuestMsg {
    #[serde(deserialize_with = "lenient_i64")]
    pub ts: i64,
    pub name: String,
    pub text: String,
    pub rating: u8,
    pub sim: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase", default)]
pub struct Persist {
    pub v: u32,
    pub settings: Settings,
    pub visitors: BTreeMap<String, Visitor>,
    pub groups: Vec<Group>,
    pub visits: Vec<Visit>,
    pub logs: Vec<LogLine>,
    pub guestbook: Vec<GuestMsg>,
    pub panic: bool,
}

impl Default for Persist {
    fn default() -> Self {
        Persist {
            v: 1,
            settings: Settings::default(),
            visitors: BTreeMap::new(),
            groups: vec![],
            visits: vec![],
            logs: vec![],
            guestbook: vec![],
            panic: false,
        }
    }
}

fn cat_or(c: &str, fallback: &str) -> String {
    if is_category(c) { c.to_string() } else { fallback.to_string() }
}

impl Persist {
    /// Rebuilds every record from untrusted JSON (data file or imported backup): clamps sizes,
    /// drops malformed entries, recomputes derived fields.
    pub fn sanitize(mut self) -> Self {
        self.v = 1;
        self.settings.sanitize();

        let mut visitors = BTreeMap::new();
        for (nik, v) in std::mem::take(&mut self.visitors) {
            if nik.len() != 16 || !nik.bytes().all(|b| b.is_ascii_digit()) {
                continue;
            }
            visitors.insert(
                nik.clone(),
                Visitor {
                    nik,
                    name: trunc(&v.name, 80),
                    city: trunc(&v.city, 60),
                    province: trunc(&v.province, 60),
                    category: cat_or(&v.category, "umum"),
                    inside: v.inside,
                    entered_at: v.entered_at.max(0),
                    sim: v.sim,
                },
            );
        }
        self.visitors = visitors;

        self.groups = std::mem::take(&mut self.groups)
            .into_iter()
            .take(200)
            .map(|g| {
                let size = g.size.clamp(1, 100_000);
                Group {
                    id: if g.id.is_empty() { crate::engine::uid() } else { trunc(&g.id, 20) },
                    name: trunc(&g.name, 80),
                    leader: trunc(&g.leader, 80),
                    city: trunc(&g.city, 60),
                    category: cat_or(&g.category, "umum"),
                    size,
                    inside: g.inside.min(size),
                    entered_at: g.entered_at.max(0),
                    sim: g.sim,
                }
            })
            .collect();

        let skip = self.visits.len().saturating_sub(MAX_VISITS);
        self.visits = std::mem::take(&mut self.visits)
            .into_iter()
            .skip(skip)
            .filter(|v| v.ts > 0 && gate_def(&v.gate_id).is_some())
            .map(|v| Visit {
                id: if v.id.is_empty() { crate::engine::uid() } else { trunc(&v.id, 20) },
                day: day_key(v.ts),
                hour: hour_of(v.ts),
                nik: trunc(&v.nik, 16),
                name: trunc(&v.name, 80),
                city: trunc(&v.city, 60),
                province: trunc(&v.province, 60),
                category: cat_or(&v.category, ""),
                count: v.count.clamp(1, 100_000),
                group_id: trunc(&v.group_id, 20),
                reason: trunc(&v.reason, 120),
                dwell: v.dwell.max(0),
                ..v
            })
            .collect();

        let skip = self.logs.len().saturating_sub(MAX_LOGS);
        self.logs = std::mem::take(&mut self.logs)
            .into_iter()
            .skip(skip)
            .filter(|l| l.ts > 0)
            .map(|l| LogLine { ts: l.ts, level: trunc(&l.level, 6), msg: trunc(&l.msg, 300) })
            .collect();

        let skip = self.guestbook.len().saturating_sub(MAX_GUESTBOOK);
        self.guestbook = std::mem::take(&mut self.guestbook)
            .into_iter()
            .skip(skip)
            .filter(|m| m.ts > 0)
            .map(|m| GuestMsg {
                ts: m.ts,
                name: if trunc(&m.name, 60).is_empty() { "Anonim".into() } else { trunc(&m.name, 60) },
                text: trunc(&m.text, 400),
                rating: m.rating.clamp(1, 5),
                sim: m.sim,
            })
            .collect();
        self
    }
}
