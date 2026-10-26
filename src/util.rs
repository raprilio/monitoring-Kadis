//! Time (WIB, fixed UTC+7), NIK parsing and masking helpers.

use std::time::{SystemTime, UNIX_EPOCH};

pub const WIB_MS: i64 = 7 * 3_600_000;
const DAY_MS: i64 = 86_400_000;

pub fn now_ms() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as i64).unwrap_or(0)
}

/// Days since 1970-01-01 -> (year, month, day). Howard Hinnant's civil-calendar algorithm.
pub fn civil_from_days(z: i64) -> (i64, u32, u32) {
    let z = z + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    (if m <= 2 { y + 1 } else { y }, m, d)
}

pub fn wib_date(ts: i64) -> (i64, u32, u32) {
    civil_from_days((ts + WIB_MS).div_euclid(DAY_MS))
}

pub fn day_key(ts: i64) -> String {
    let (y, m, d) = wib_date(ts);
    format!("{y:04}-{m:02}-{d:02}")
}

pub fn hour_of(ts: i64) -> u8 {
    ((ts + WIB_MS).rem_euclid(DAY_MS) / 3_600_000) as u8
}

/// Timestamp (ms) of 00:00 WIB on the day containing `ts`.
pub fn day_start(ts: i64) -> i64 {
    (ts + WIB_MS).div_euclid(DAY_MS) * DAY_MS - WIB_MS
}

/// "1j 45m" / "12m", the format the UI uses for durations.
pub fn fmt_dur(ms: i64) -> String {
    let m = ((ms.max(0) as f64) / 60_000.0).round() as i64;
    if m < 60 {
        format!("{m}m")
    } else {
        format!("{}j {:02}m", m / 60, m % 60)
    }
}

pub fn trunc(s: &str, max: usize) -> String {
    s.trim().chars().take(max).collect()
}

/// First 4 + last 4 digits kept. `mask` is the filler char (`•` for log text, `*` for API output).
/// Anything that is not exactly 16 digits yields an empty/placeholder value, never partial data.
pub fn mask_nik(nik: &str, mask: char) -> String {
    if nik.len() == 16 && nik.bytes().all(|b| b.is_ascii_digit()) {
        format!("{}{}{}", &nik[..4], mask.to_string().repeat(8), &nik[12..])
    } else {
        "—".to_string()
    }
}

pub struct NikInfo {
    pub province: &'static str,
    #[allow(dead_code)]
    pub female: bool,
    pub age: i32,
    #[allow(dead_code)]
    pub birth: String,
}

pub fn province_name(code: u32) -> Option<&'static str> {
    Some(match code {
        11 => "Aceh",
        12 => "Sumatera Utara",
        13 => "Sumatera Barat",
        14 => "Riau",
        15 => "Jambi",
        16 => "Sumatera Selatan",
        17 => "Bengkulu",
        18 => "Lampung",
        19 => "Kep. Bangka Belitung",
        21 => "Kepulauan Riau",
        31 => "DKI Jakarta",
        32 => "Jawa Barat",
        33 => "Jawa Tengah",
        34 => "DI Yogyakarta",
        35 => "Jawa Timur",
        36 => "Banten",
        51 => "Bali",
        52 => "Nusa Tenggara Barat",
        53 => "Nusa Tenggara Timur",
        61 => "Kalimantan Barat",
        62 => "Kalimantan Tengah",
        63 => "Kalimantan Selatan",
        64 => "Kalimantan Timur",
        65 => "Kalimantan Utara",
        71 => "Sulawesi Utara",
        72 => "Sulawesi Tengah",
        73 => "Sulawesi Selatan",
        74 => "Sulawesi Tenggara",
        75 => "Gorontalo",
        76 => "Sulawesi Barat",
        81 => "Maluku",
        82 => "Maluku Utara",
        91 => "Papua",
        92 => "Papua Barat",
        99 => "Mancanegara (Tourist Pass)",
        _ => return None,
    })
}

fn is_leap(y: i64) -> bool {
    (y % 4 == 0 && y % 100 != 0) || y % 400 == 0
}

fn days_in_month(y: i64, m: u32) -> u32 {
    match m {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        _ if is_leap(y) => 29,
        _ => 28,
    }
}

/// Structural check of an Indonesian NIK: 16 digits, known province, plausible birth date
/// (day + 40 for women). It does NOT prove the card is genuine — that needs the e-KTP chip / Dukcapil.
pub fn parse_nik(nik: &str, now: i64) -> Result<NikInfo, &'static str> {
    if nik.len() != 16 || !nik.bytes().all(|b| b.is_ascii_digit()) {
        return Err("NIK harus 16 digit angka");
    }
    let num = |a: usize, b: usize| nik[a..b].parse::<u32>().unwrap_or(0);
    let province = province_name(num(0, 2)).ok_or("Kode provinsi tidak dikenal")?;
    let mut dd = num(6, 8);
    let mm = num(8, 10);
    let yy = num(10, 12) as i64;
    let female = dd > 40;
    if female {
        dd -= 40;
    }
    let (now_y, now_m, now_d) = wib_date(now);
    let year = if 2000 + yy <= now_y { 2000 + yy } else { 1900 + yy };
    if !(1..=12).contains(&mm) || dd < 1 || dd > days_in_month(year, mm) {
        return Err("Tanggal lahir pada NIK tidak valid");
    }
    let age = (now_y - year) as i32 - if (now_m, now_d) < (mm, dd) { 1 } else { 0 };
    Ok(NikInfo { province, female, age, birth: format!("{dd:02}-{mm:02}-{year}") })
}

pub fn suggest_category(info: &NikInfo) -> &'static str {
    if info.province.starts_with("Mancanegara") {
        "mancanegara"
    } else if info.age >= 60 {
        "lansia"
    } else if info.age <= 17 {
        "pelajar"
    } else {
        "umum"
    }
}

/// Constant-time-ish byte comparison for the officer token.
pub fn ct_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    a.iter().zip(b).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

#[cfg(test)]
mod tests {
    use super::*;

    // 2026-10-26 12:00 WIB
    const NOW: i64 = 1792990800000;

    #[test]
    fn calendar_round_trip() {
        assert_eq!(civil_from_days(0), (1970, 1, 1));
        assert_eq!(civil_from_days(19_000), (2022, 1, 8));
        assert_eq!(day_key(0), "1970-01-01");
        // 17:00 UTC on 31 Dec is already 1 Jan in WIB
        assert_eq!(day_key(1767200400000), "2026-01-01");
        assert_eq!(day_key(1767200400000 - 1), "2025-12-31");
        assert_eq!(hour_of(0), 7);
    }

    #[test]
    fn day_start_is_midnight_wib() {
        let s = day_start(NOW);
        assert_eq!(hour_of(s), 0);
        assert_eq!(day_key(s), day_key(NOW));
        assert_eq!(day_key(s - 1), day_key(NOW - 86_400_000));
    }

    #[test]
    fn nik_accepts_valid_and_reads_fields() {
        let i = parse_nik("3273045207920004", NOW).unwrap();
        assert_eq!(i.province, "Jawa Barat");
        assert!(i.female);
        assert_eq!(i.birth, "12-07-1992");
        assert!(parse_nik("3171011503850003", NOW).is_ok());
        assert!(!parse_nik("3171011503850003", NOW).unwrap().female);
    }

    #[test]
    fn nik_rejects_bad_input() {
        assert!(parse_nik("123", NOW).is_err());
        assert!(parse_nik("31710115038500AB", NOW).is_err());
        assert_eq!(parse_nik("0000000000000000", NOW).err(), Some("Kode provinsi tidak dikenal"));
        assert_eq!(parse_nik("3171013002850001", NOW).err(), Some("Tanggal lahir pada NIK tidak valid")); // 30 Feb
        assert_eq!(parse_nik("3171011503851234", NOW).map(|_| ()), Ok(()));
    }

    #[test]
    fn category_suggestion() {
        assert_eq!(suggest_category(&parse_nik("9901010502880008", NOW).unwrap()), "mancanegara");
        assert_eq!(suggest_category(&parse_nik("3404094505550002", NOW).unwrap()), "lansia");
        assert_eq!(suggest_category(&parse_nik("3578062009100001", NOW).unwrap()), "pelajar");
    }

    #[test]
    fn masking_never_leaks_partial_garbage() {
        assert_eq!(mask_nik("3171011503850003", '*'), "3171********0003");
        assert_eq!(mask_nik("12345", '*'), "—");
        assert_eq!(fmt_dur(105 * 60_000), "1j 45m");
        assert_eq!(fmt_dur(12 * 60_000), "12m");
    }
}
