//! Fictitious visitors and demo data. Everything generated here is tagged `sim` so it can be wiped
//! from Settings without touching real records.

use rand::{seq::IndexedRandom, Rng};
use serde::Serialize;

use crate::engine::{uid, who, Engine};
use crate::model::*;
use crate::util::*;

/// (city, province, 4-digit regency code, weight)
const CITIES: [(&str, &str, &str, u32); 15] = [
    ("Jakarta Pusat", "DKI Jakarta", "3173", 9),
    ("Bandung", "Jawa Barat", "3273", 10),
    ("Bogor", "Jawa Barat", "3271", 6),
    ("Depok", "Jawa Barat", "3276", 5),
    ("Bekasi", "Jawa Barat", "3275", 5),
    ("Tangerang", "Banten", "3671", 5),
    ("Semarang", "Jawa Tengah", "3374", 5),
    ("Surakarta", "Jawa Tengah", "3372", 3),
    ("Sleman", "DI Yogyakarta", "3404", 4),
    ("Surabaya", "Jawa Timur", "3578", 6),
    ("Malang", "Jawa Timur", "3573", 4),
    ("Denpasar", "Bali", "5171", 2),
    ("Medan", "Sumatera Utara", "1271", 2),
    ("Palembang", "Sumatera Selatan", "1671", 2),
    ("Makassar", "Sulawesi Selatan", "7371", 2),
];
const ABROAD: [&str; 6] = ["Amsterdam", "Kuala Lumpur", "Singapore", "Tokyo", "Melbourne", "Seoul"];
const MALE: [&str; 14] = ["Budi", "Agus", "Dedi", "Eko", "Rizky", "Fajar", "Andi", "Hendra", "Wahyu", "Yusuf", "Dimas", "Bayu", "Iwan", "Rangga"];
const FEMALE: [&str; 14] = ["Siti", "Ani", "Dewi", "Rina", "Putri", "Lestari", "Maya", "Nur", "Wulan", "Sari", "Intan", "Ayu", "Yuni", "Fitri"];
const LAST: [&str; 16] = [
    "Santoso", "Pratama", "Wijaya", "Hidayat", "Saputra", "Rahayu", "Nugroho", "Kusuma", "Permana", "Lestari", "Firmansyah", "Maulana", "Utami", "Setiawan", "Siregar",
    "Hasibuan",
];
const FOREIGN: [&str; 7] = ["Kevin Van Der Berg", "Emma Johnson", "Haruto Tanaka", "Lim Wei Jie", "Sophie Martin", "Daniel Park", "Olivia Brown"];

#[derive(Serialize, Clone, Debug)]
pub struct Persona {
    pub nik: String,
    pub name: String,
    pub city: String,
    pub province: String,
    pub category: String,
}

fn make_nik(code: &str, y: i64, m: u32, d: u32, female: bool, serial: u32) -> String {
    format!("{code}01{:02}{:02}{:02}{:04}", d + if female { 40 } else { 0 }, m, y.rem_euclid(100), serial)
}

/// Sum of 6 uniforms, rescaled: close enough to a standard normal for demo traffic shapes.
fn gauss(r: &mut impl Rng) -> f64 {
    let s: f64 = (0..6).map(|_| r.random::<f64>()).sum();
    (s - 3.0) / std::f64::consts::FRAC_1_SQRT_2
}

impl Engine {
    /// A random fictitious visitor whose NIK is structurally valid and not yet known.
    pub fn random_persona(&self) -> Option<Persona> {
        let now_y = wib_date(self.now()).0;
        let mut r = rand::rng();
        for _ in 0..20 {
            let p = if r.random_bool(0.07) {
                Persona {
                    category: "mancanegara".into(),
                    name: FOREIGN.choose(&mut r)?.to_string(),
                    city: ABROAD.choose(&mut r)?.to_string(),
                    province: "Mancanegara (Tourist Pass)".into(),
                    nik: make_nik("9901", now_y - r.random_range(20..=60), r.random_range(1..=12), r.random_range(1..=28), false, r.random_range(1..=9999)),
                }
            } else {
                let total: u32 = CITIES.iter().map(|c| c.3).sum();
                let mut roll = r.random_range(0..total);
                let c = CITIES
                    .iter()
                    .find(|c| {
                        if roll < c.3 {
                            true
                        } else {
                            roll -= c.3;
                            false
                        }
                    })
                    .unwrap_or(&CITIES[0]);
                let female = r.random_bool(0.5);
                let seg: f64 = r.random();
                let (age, category) = if seg < 0.18 {
                    (r.random_range(8..=17), "pelajar")
                } else if seg < 0.28 {
                    (r.random_range(60..=78), "lansia")
                } else if seg < 0.30 {
                    (r.random_range(19..=55), "vip")
                } else {
                    (r.random_range(19..=55), "umum")
                };
                let first = if female { FEMALE.choose(&mut r)? } else { MALE.choose(&mut r)? };
                Persona {
                    category: category.into(),
                    name: format!("{first} {}", LAST.choose(&mut r)?),
                    city: c.0.into(),
                    province: c.1.into(),
                    nik: make_nik(c.2, now_y - age, r.random_range(1..=12), r.random_range(1..=28), female, r.random_range(1..=9999)),
                }
            };
            if !self.data.visitors.contains_key(&p.nik) {
                return Some(p);
            }
        }
        None
    }

    /// Fills yesterday (full day) and today (up to now) with plausible traffic, a few denials and
    /// overrides, guestbook messages and group passes.
    pub fn load_demo(&mut self) {
        let now = self.now();
        let today_start = day_start(now);
        let h = 3_600_000i64;
        let ins = ["GM-01", "GM-01", "GM-01", "GM-02", "GM-02", "GM-03"];
        let outs = ["GK-01", "GK-01", "GK-02", "GK-02", "GK-03"];

        // (open, close, limit, arrivals): `close` forces departure; `limit` is "now" for today.
        let gen_day = |e: &mut Engine, open: i64, close: i64, limit: i64, total: u32| {
            for _ in 0..total {
                let (t, stay, gin, gout) = {
                    let mut r = rand::rng();
                    let t = open + ((3.4 + gauss(&mut r) * 1.9).clamp(0.0, 8.5) * h as f64) as i64;
                    let stay = (((115.0 + gauss(&mut r) * 45.0) * 60_000.0) as i64).max(25 * 60_000);
                    (t, stay, *ins.choose(&mut r).unwrap(), *outs.choose(&mut r).unwrap())
                };
                if t > limit {
                    continue;
                }
                let Some(p) = e.random_persona() else { continue };
                let exit_at = (t + stay).min(close);
                let exits = exit_at <= limit;
                e.data.visitors.insert(
                    p.nik.clone(),
                    Visitor { nik: p.nik.clone(), name: p.name.clone(), city: p.city.clone(), province: p.province.clone(), category: p.category.clone(), inside: !exits, entered_at: t, sim: true },
                );
                let base = Visit { nik: p.nik.clone(), name: p.name.clone(), city: p.city.clone(), province: p.province.clone(), category: p.category.clone(), count: 1, sim: true, ..Visit::default() };
                push(e, Visit { ts: t, gate_id: gin.into(), dir: Dir::In, ..base.clone() });
                if exits {
                    push(e, Visit { ts: exit_at, gate_id: gout.into(), dir: Dir::Out, dwell: exit_at - t, ..base });
                }
            }
        };

        let y_open = today_start - 24 * h + 8 * h;
        gen_day(self, y_open, y_open + 19 * h / 2, y_open + 19 * h / 2, 255);
        // Opening hours 08:00; outside 09-17h anchor the busy period to "now" so the demo is never empty.
        let mut t_open = if (9..=17).contains(&hour_of(now)) { today_start + 8 * h } else { (now - 9 * h).max(today_start) };
        if now - t_open < 40 * 60_000 {
            t_open = now - 3 * h; // too early in the day: back-fill the last few hours
        }
        gen_day(self, t_open, i64::MAX, now, 300); // no closing time today: long stays are still inside

        // A few denials + overrides so logs/insights have something to chew on.
        let inside: Vec<Visitor> = self.data.visitors.values().filter(|v| v.inside).take(4).cloned().collect();
        for v in inside {
            let (ts, gate) = {
                let mut r = rand::rng();
                (t_open.max(now - r.random_range(5..=150) * 60_000), *["GM-01", "GM-02"].choose(&mut r).unwrap())
            };
            push(
                self,
                Visit {
                    ts,
                    gate_id: gate.into(),
                    dir: Dir::In,
                    result: Res::Denied,
                    reason: "Anti-passback: NIK sudah tercatat di dalam".into(),
                    nik: v.nik,
                    name: v.name,
                    city: v.city,
                    province: v.province,
                    category: v.category,
                    count: 1,
                    sim: true,
                    ..Visit::default()
                },
            );
        }
        for _ in 0..3 {
            let (ts, gate, reason) = {
                let mut r = rand::rng();
                (t_open.max(now - r.random_range(10..=170) * 60_000), *["GM-01", "GM-02", "GK-01"].choose(&mut r).unwrap(), *REASONS.choose(&mut r).unwrap())
            };
            let dir = gate_def(gate).map(|g| g.dir).unwrap_or(Dir::In);
            push(self, Visit { ts, gate_id: gate.into(), dir, result: Res::Manual, reason: reason.into(), name: "Petugas".into(), count: 1, sim: true, ..Visit::default() });
        }

        for (name, text, rating) in [
            ("Dewi Lestari", "Tamannya bersih dan asri, anak-anak senang sekali!", 5),
            ("Budi Santoso", "Antrean masuk cepat, petugas ramah.", 5),
            ("Hj. Sri Rahayu", "Jalur kursi roda sudah bagus, terima kasih.", 4),
            ("Kevin V.", "Beautiful park, easy entry with the ID card.", 5),
        ] {
            let ago = rand::rng().random_range(10..=300) * 60_000;
            self.data.guestbook.push(GuestMsg { ts: now - ago, name: name.into(), text: text.into(), rating, sim: true });
        }
        for (name, leader, city, cat, size, inside) in [
            ("SDN Cibiru 2", "Ibu Ratna", "Bandung", "pelajar", 42, true),
            ("Rombongan Majelis Taklim An-Nur", "Bpk. Hasan", "Bogor", "lansia", 35, false),
            ("PT Maju Bersama (Gathering)", "Sdr. Arif", "Jakarta Pusat", "umum", 28, false),
        ] {
            let g = Group {
                id: uid(),
                name: name.into(),
                leader: leader.into(),
                city: city.into(),
                category: cat.into(),
                size,
                inside: if inside { size } else { 0 },
                entered_at: if inside { now - 50 * 60_000 } else { 0 },
                sim: true,
            };
            if inside {
                push(
                    self,
                    Visit { ts: g.entered_at, gate_id: "GM-03".into(), dir: Dir::In, nik: String::new(), name: g.name.clone(), city: g.city.clone(), category: g.category.clone(), count: g.size, group_id: g.id.clone(), sim: true, ..Visit::default() },
                );
            }
            self.data.groups.push(g);
        }

        self.data.visits.sort_by_key(|v| v.ts);
        let over = self.data.visits.len().saturating_sub(MAX_VISITS);
        self.data.visits.drain(..over);

        // Seed the terminal with the most recent few events, then a marker line.
        let today = day_key(now);
        let recent: Vec<Visit> = self.data.visits.iter().filter(|v| v.day == today).rev().take(14).cloned().collect::<Vec<_>>().into_iter().rev().collect();
        let first_ts = recent.first().map(|v| v.ts).unwrap_or(now);
        self.data.logs.retain(|l| l.ts < first_ts);
        for v in recent {
            let (lvl, msg) = match v.result {
                Res::Granted => (
                    "OK",
                    format!(
                        "{} diizinkan @ {} — {}{}",
                        if v.dir == Dir::In { "MASUK" } else { "KELUAR" },
                        self.gate_name(&v.gate_id),
                        who(&v),
                        if v.dwell > 0 { format!(" • durasi {}", fmt_dur(v.dwell)) } else { String::new() }
                    ),
                ),
                Res::Denied => ("DENY", format!("{} ditolak @ {} — {}: {}", if v.dir == Dir::In { "MASUK" } else { "KELUAR" }, self.gate_name(&v.gate_id), who(&v), v.reason)),
                Res::Manual => ("OVR", format!("Petugas membuka {} secara manual. Alasan: {}", self.gate_name(&v.gate_id), v.reason)),
            };
            self.log(lvl, msg, Some(v.ts));
        }
        self.log("SYS", "Data demo dimuat (ditandai \"sim\", bisa dihapus dari Pengaturan).".into(), None);
    }
}

/// Appends a visit with derived fields filled in (no log line, no gate animation).
fn push(e: &mut Engine, mut v: Visit) {
    v.id = uid();
    v.day = day_key(v.ts);
    v.hour = hour_of(v.ts);
    e.data.visits.push(v);
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::engine::TapReq;

    #[test]
    fn personas_are_valid_unique_niks() {
        let e = Engine::new(Persist::default());
        let now = e.now();
        let mut seen = std::collections::HashSet::new();
        for _ in 0..500 {
            let p = e.random_persona().expect("persona");
            assert!(parse_nik(&p.nik, now).is_ok(), "bad NIK {}", p.nik);
            assert!(is_category(&p.category));
            seen.insert(p.nik);
        }
        assert!(seen.len() > 450, "NIKs should almost never collide");
    }

    #[test]
    fn demo_is_consistent_and_clearable() {
        // Midday: plenty of people inside. Also run after hours / just after midnight for consistency.
        for offset_h in [0i64, 8, 15] {
            let mut e = Engine::new(Persist::default());
            e.set_clock(1_792_990_800_000 + offset_h * 3_600_000); // 2026-10-26 12:00 WIB (+offset)
            e.load_demo();
            check_demo(&mut e, offset_h == 0);
        }
    }

    fn check_demo(e: &mut Engine, expect_inside: bool) {
        let inside_visitors = e.data.visitors.values().filter(|v| v.inside).count() as u32;
        let inside_groups: u32 = e.data.groups.iter().map(|g| g.inside).sum();
        assert_eq!(e.count_inside(), inside_visitors + inside_groups);
        assert!(e.count_inside() <= e.data.settings.capacity);
        assert!(e.data.visits.windows(2).all(|w| w[0].ts <= w[1].ts), "visits sorted");
        assert!(e.data.visits.iter().all(|v| v.sim));
        // every exit has a matching earlier entry for the same person
        for out in e.data.visits.iter().filter(|v| v.dir == Dir::Out && v.result == Res::Granted && v.group_id.is_empty()) {
            assert!(e.data.visits.iter().any(|i| i.dir == Dir::In && i.nik == out.nik && i.ts < out.ts && i.result == Res::Granted));
        }
        // live taps still obey the rules on top of demo data
        if expect_inside {
            assert!(e.count_inside() > 20, "a midday demo should have a crowd inside");
            let who_is_in = e.data.visitors.values().find(|v| v.inside).unwrap().nik.clone();
            let r = e.tap(TapReq { nik: who_is_in, gate_id: "GM-01".into(), ..TapReq::default() });
            assert!(!r.ok);
        }
        e.clear_sim();
        // Only the one real (non-sim) denial from the live tap above may survive; no demo record may.
        assert!(e.data.visits.iter().all(|v| !v.sim) && e.data.visits.len() <= 1);
        assert!(e.data.visitors.is_empty() && e.data.groups.is_empty() && e.data.guestbook.is_empty());
        assert_eq!(e.count_inside(), 0);
    }
}
