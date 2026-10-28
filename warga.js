(window.__ver = window.__ver || {})['warga.js'] = '2026-10-28.2';
/*
 * Logika data kependudukan: bentuk data, turunan (usia, status, kewajiban KTP-el/KIA), filter,
 * agregat, dan impor CSV hasil ekspor SIAK.
 *
 * Bentuk satu data warga (mentah):
 *   nik, noKK, nama, jk ('L'|'P'), tglLahir ('YYYY-MM-DD'), tempatLahir,
 *   statusKawin ('BELUM KAWIN'|'KAWIN'|'CERAI HIDUP'|'CERAI MATI'),
 *   pend (0..9, urutan strata pendidikan SIAK; null bila kosong), pekerjaan, agama, golDarah,
 *   hubungan, dusun, rt, rw, alamat,
 *   ktpEl ('sudah'|'belum'|null), kia ('sudah'|'belum'|null), aplikasi (true|false|undefined)
 */
window.WargaLib = (() => {
  'use strict';

  /* ---------- kategori ---------- */
  const STATUS = [
    { key: 'menikah', label: 'Menikah' },
    { key: 'lajang', label: 'Lajang' },
    { key: 'janda', label: 'Janda' },
    { key: 'duda', label: 'Duda' },
  ];
  const STATUS_COLOR = { menikah: 'var(--st1)', lajang: 'var(--st2)', janda: 'var(--st3)', duda: 'var(--st4)' };
  const statusLabel = (k) => (STATUS.find((s) => s.key === k) || { label: 'Lainnya' }).label;

  // Urutan resmi strata pendidikan pada KTP/KK (kode 1–10 pada SIAK = indeks 0–9 + 1)
  const PEND_LEVELS = [
    'Tidak/Belum Sekolah', 'Belum Tamat SD/Sederajat', 'Tamat SD/Sederajat', 'SLTP/Sederajat', 'SLTA/Sederajat',
    'Diploma I/II', 'Akademi/Diploma III/Sarjana Muda', 'Diploma IV/Strata I', 'Strata II', 'Strata III',
  ];
  const PEND_GROUPS = [
    { key: 'tidak', label: 'Tidak/Belum sekolah', levels: [0, 1] },
    { key: 'sd', label: 'SD', levels: [2] },
    { key: 'smp', label: 'SMP', levels: [3] },
    { key: 'sma', label: 'SMA', levels: [4] },
    { key: 'diploma', label: 'Diploma (D1–D3)', levels: [5, 6] },
    { key: 'sarjana', label: 'Sarjana (D4/S1)', levels: [7] },
    { key: 'pasca', label: 'Pascasarjana (S2/S3)', levels: [8, 9] },
  ];
  const pendGroupOf = (lvl) => (lvl == null ? null : (PEND_GROUPS.find((g) => g.levels.includes(lvl)) || {}).key || null);

  const USIA_GROUPS = [
    { key: 'balita', label: 'Balita 0–5', min: 0, max: 5 },
    { key: 'anak', label: 'Anak 6–16', min: 6, max: 16 },
    { key: 'remaja', label: 'Remaja 17–24', min: 17, max: 24 },
    { key: 'dewasa', label: 'Dewasa 25–59', min: 25, max: 59 },
    { key: 'lansia', label: 'Lansia 60+', min: 60, max: 150 },
  ];

  const KARTU_OPSI = [
    { key: '', label: 'Semua' },
    { key: 'ktp-sudah', label: 'Sudah punya KTP-el' },
    { key: 'ktp-belum', label: 'Belum punya KTP-el (wajib)' },
    { key: 'kia-sudah', label: 'Sudah punya KIA' },
    { key: 'kia-belum', label: 'Belum punya KIA (wajib)' },
  ];

  /* ---------- turunan ---------- */
  const ageOn = (iso, today) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    if (!m) return null;
    let a = today.getFullYear() - Number(m[1]);
    if (today.getMonth() + 1 < Number(m[2]) || (today.getMonth() + 1 === Number(m[2]) && today.getDate() < Number(m[3]))) a--;
    return a >= 0 && a < 150 ? a : null;
  };
  const statusOf = (r) => {
    const s = r.statusKawin;
    if (s === 'BELUM KAWIN') return 'lajang';
    if (s === 'KAWIN') return 'menikah';
    if (s === 'CERAI HIDUP' || s === 'CERAI MATI') return r.jk === 'P' ? 'janda' : r.jk === 'L' ? 'duda' : null;
    return null;
  };

  /** Tambah kolom turunan. KTP-el wajib bagi usia >= 17 atau yang sudah/pernah kawin; KIA bagi usia < 17 yang belum kawin. */
  function enrich(records, today = new Date()) {
    return records.map((r) => {
      const usia = ageOn(r.tglLahir, today);
      const status = statusOf(r);
      const pernahKawin = r.statusKawin && r.statusKawin !== 'BELUM KAWIN';
      const ktpWajib = usia != null && (usia >= 17 || pernahKawin);
      const kiaWajib = usia != null && usia < 17 && !pernahKawin;
      return {
        ...r, usia, status, pendGroup: pendGroupOf(r.pend), ktpWajib, kiaWajib,
        ktpSudah: ktpWajib && r.ktpEl === 'sudah', ktpBelum: ktpWajib && r.ktpEl === 'belum',
        kiaSudah: kiaWajib && r.kia === 'sudah', kiaBelum: kiaWajib && r.kia === 'belum',
      };
    });
  }

  /* ---------- filter ---------- */
  const emptyFilter = () => ({ status: [], usia: null, pend: [], kartu: '', q: '' });
  const isFiltered = (f) => !!(f.status.length || f.usia || f.pend.length || f.kartu || f.q.trim());
  function applyFilter(rows, f) {
    const q = f.q.trim().toLowerCase();
    return rows.filter((r) => {
      if (f.status.length && !f.status.includes(r.status)) return false;
      if (f.usia && (r.usia == null || r.usia < f.usia[0] || r.usia > f.usia[1])) return false;
      if (f.pend.length && !f.pend.includes(r.pendGroup)) return false;
      if (f.kartu === 'ktp-sudah' && !r.ktpSudah) return false;
      if (f.kartu === 'ktp-belum' && !r.ktpBelum) return false;
      if (f.kartu === 'kia-sudah' && !r.kiaSudah) return false;
      if (f.kartu === 'kia-belum' && !r.kiaBelum) return false;
      if (q && !(`${r.nama} ${r.nik} ${r.noKK}`.toLowerCase().includes(q))) return false;
      return true;
    });
  }
  /** Ringkasan teks filter, mis. "Janda · 17–24 th · SMA". */
  function describeFilter(f) {
    const p = [];
    if (f.status.length) p.push(f.status.map(statusLabel).join(' + '));
    if (f.usia) p.push(f.usia[1] >= 150 ? `${f.usia[0]}+ th` : `${f.usia[0]}–${f.usia[1]} th`);
    if (f.pend.length) p.push(f.pend.map((k) => PEND_GROUPS.find((g) => g.key === k).label).join(' + '));
    if (f.kartu) p.push(KARTU_OPSI.find((o) => o.key === f.kartu).label);
    return p.join(' · ');
  }
  /** Filter dari/ke parameter URL (kecuali pencarian nama, supaya data pribadi tidak masuk URL). */
  function filterFromParams(sp) {
    const f = emptyFilter();
    f.status = (sp.get('status') || '').split(',').filter((k) => STATUS.some((s) => s.key === k));
    const u = /^(\d{1,3})-(\d{1,3})$/.exec(sp.get('usia') || '');
    if (u) f.usia = [Math.min(+u[1], +u[2]), Math.max(+u[1], +u[2])];
    f.pend = (sp.get('pend') || '').split(',').filter((k) => PEND_GROUPS.some((g) => g.key === k));
    const k = sp.get('kartu') || '';
    if (KARTU_OPSI.some((o) => o.key === k)) f.kartu = k;
    return f;
  }
  function filterToParams(f, sp) {
    const set = (k, v) => (v ? sp.set(k, v) : sp.delete(k));
    set('status', f.status.join(','));
    set('usia', f.usia ? `${f.usia[0]}-${f.usia[1]}` : '');
    set('pend', f.pend.join(','));
    set('kartu', f.kartu);
    return sp;
  }

  /* ---------- agregat ---------- */
  function aggregate(rows) {
    const count = (keyFn) => { const m = new Map(); rows.forEach((r) => { const k = keyFn(r); if (k != null) m.set(k, (m.get(k) || 0) + 1); }); return m; };
    const st = count((r) => r.status), ug = count((r) => USIA_GROUPS.find((g) => r.usia != null && r.usia >= g.min && r.usia <= g.max)?.key);
    const pg = count((r) => r.pendGroup), ds = count((r) => r.dusun || null);
    const cov = (wajib, sudah, known) => {
      const w = rows.filter((r) => r[wajib] && r[known] != null), ok = w.filter((r) => r[sudah]).length;
      return { wajib: w.length, sudah: ok, belum: w.length - ok, pct: w.length ? (ok / w.length) * 100 : null };
    };
    const kk = new Set(rows.map((r) => r.noKK).filter(Boolean));
    const nikCount = count((r) => r.nik || null);
    const ratio = (pred) => (rows.length ? (rows.filter(pred).length / rows.length) * 100 : 0);
    return {
      n: rows.length,
      kk: kk.size,
      lakiLaki: rows.filter((r) => r.jk === 'L').length,
      perempuan: rows.filter((r) => r.jk === 'P').length,
      status: STATUS.map((s) => ({ key: s.key, label: s.label, value: st.get(s.key) || 0 })),
      usia: USIA_GROUPS.map((g) => ({ key: g.key, label: g.label, value: ug.get(g.key) || 0 })),
      pend: PEND_GROUPS.map((g) => ({ key: g.key, label: g.label, value: pg.get(g.key) || 0 })),
      dusun: [...ds].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value),
      ktp: cov('ktpWajib', 'ktpSudah', 'ktpEl'),
      kia: cov('kiaWajib', 'kiaSudah', 'kia'),
      kualitas: [
        { label: 'NIK valid (16 digit)', value: ratio((r) => /^\d{16}$/.test(r.nik || '')) },
        { label: 'Nomor KK terisi', value: ratio((r) => !!r.noKK) },
        { label: 'Tanggal lahir valid', value: ratio((r) => r.usia != null) },
        { label: 'Pendidikan terisi', value: ratio((r) => r.pend != null) },
        { label: 'Pekerjaan terisi', value: ratio((r) => !!r.pekerjaan) },
      ],
      nikGanda: [...nikCount.values()].filter((c) => c > 1).length,
    };
  }

  /* ---------- impor CSV (ekspor SIAK) ---------- */
  function parseCSV(text) {
    text = text.replace(/^﻿/, '');
    const first = text.split(/\r?\n/, 1)[0] || '';
    const delim = [',', ';', '\t'].map((d) => [d, first.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
    const rows = [];
    let row = [], cur = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c;
      } else if (c === '"') q = true;
      else if (c === delim) { row.push(cur); cur = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(cur); cur = '';
        if (row.some((x) => x.trim() !== '')) rows.push(row);
        row = [];
      } else cur += c;
    }
    row.push(cur);
    if (row.some((x) => x.trim() !== '')) rows.push(row);
    return rows;
  }

  // Nama kolom (dinormalkan: huruf kecil tanpa spasi/simbol) → field. Daftar ini PERKIRAAN; sesuaikan bila ekspor SIAK Anda berbeda.
  const ALIAS = {
    nik: ['nik', 'nomornik', 'nonik'],
    noKK: ['nokk', 'nomorkk', 'nomorkartukeluarga', 'nokartukeluarga'],
    nama: ['nama', 'namalgkp', 'namalengkap', 'namawarga'],
    jk: ['jeniskelamin', 'jenisklmin', 'jk', 'kelamin'],
    tglLahir: ['tanggallahir', 'tgllahir', 'tgllhr', 'tanggallhr'],
    tempatLahir: ['tempatlahir', 'tmptlhr', 'tempatlhr'],
    statusKawin: ['statuskawin', 'statkwn', 'statusperkawinan', 'perkawinan'],
    pend: ['pendidikan', 'pendidikanakhir', 'pendidikanterakhir', 'pddkakh', 'stratapendidikan'],
    pekerjaan: ['pekerjaan', 'jenispekerjaan', 'jnspkrjn'],
    agama: ['agama'],
    golDarah: ['golongandarah', 'goldarah', 'goldrh'],
    hubungan: ['hubungankeluarga', 'hubungandalamkeluarga', 'stathbkel', 'shdk', 'hubungan'],
    dusun: ['dusun', 'dukuh', 'kampung', 'namadusun', 'namadukuh'],
    rt: ['rt', 'nort'],
    rw: ['rw', 'norw'],
    alamat: ['alamat'],
    ktpEl: ['statusektp', 'statusktpel', 'ktpel', 'ektp', 'statusrekam', 'statusrekamektp', 'statuskartu'],
    kia: ['kia', 'statuskia', 'kepemilikankia'],
  };
  const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');

  const mapJK = (v) => (/^(l|lk|laki)/i.test(v.trim()) ? 'L' : /^(p|pr|perempuan|wanita)/i.test(v.trim()) ? 'P' : null);
  const mapKawin = (v) => {
    const s = v.toLowerCase();
    if (!s.trim()) return null;
    if (/belum|lajang|bujang/.test(s)) return 'BELUM KAWIN';
    if (/cerai/.test(s) && /mati/.test(s)) return 'CERAI MATI';
    if (/cerai|janda|duda/.test(s)) return 'CERAI HIDUP';
    if (/kawin|nikah|menikah/.test(s)) return 'KAWIN';
    return null;
  };
  const PEND_RULES = [
    [/strata\s*(iii|3)|\bs\s*3\b|doktor/, 9], [/strata\s*(ii|2)\b|\bs\s*2\b|magister/, 8],
    [/diploma\s*(iv|4)|\bd\s*4\b|strata\s*(i|1)\b|\bs\s*1\b|sarjana\b(?!\s*muda)/, 7],
    [/diploma\s*(iii|3)|\bd\s*3\b|akademi|sarjana\s*muda/, 6], [/diploma\s*(i|ii|1|2)\b|\bd\s*[12]\b/, 5],
    [/slta|\bsma\b|\bsmk\b|\bma\b|sederajat.*menengah atas/, 4], [/sltp|\bsmp\b|\bmts\b/, 3],
    [/belum\s*tamat/, 1], [/tamat\s*sd|\bsd\b|\bmi\b/, 2], [/tidak|belum/, 0],
  ];
  const mapPend = (v) => {
    const s = v.toLowerCase().trim();
    if (!s) return null;
    if (/^\d+$/.test(s)) { const n = Number(s); return n >= 1 && n <= 10 ? n - 1 : null; }
    for (const [re, lvl] of PEND_RULES) if (re.test(s)) return lvl;
    return null;
  };
  const mapDate = (v) => {
    const s = v.trim();
    let m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/.exec(s);
    if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/.exec(s);
    return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null;
  };
  // Status kartu: "belum/tidak" → belum; "sudah/ada/ya/cetak(printed)" → sudah; isian lain dianggap belum; kosong → tidak diketahui.
  const mapKartu = (v) => {
    const s = v.toLowerCase().trim();
    if (!s) return null;
    if (/belum|tidak|^no\b|^n$/.test(s)) return 'belum';
    if (/sudah|^ada$|^ya$|^y$|cetak|printed|tercetak|punya/.test(s)) return 'sudah';
    return 'belum';
  };

  function importCSV(text) {
    const rows = parseCSV(text);
    if (rows.length < 2) return { records: [], report: { error: 'File kosong atau tidak punya baris data.' } };
    const head = rows[0].map(norm), idx = {};
    for (const [field, names] of Object.entries(ALIAS)) {
      const i = head.findIndex((h) => names.includes(h));
      if (i >= 0) idx[field] = i;
    }
    const known = new Set(Object.values(idx));
    const report = {
      baris: rows.length - 1,
      dikenali: Object.keys(idx),
      tidakDikenali: rows[0].filter((_, i) => !known.has(i)).map((h) => h.trim()).filter(Boolean),
      hilang: Object.keys(ALIAS).filter((f) => !(f in idx)),
      dilewati: 0,
      alasan: {},
    };
    const skip = (why) => { report.dilewati++; report.alasan[why] = (report.alasan[why] || 0) + 1; };
    if (!('tglLahir' in idx) || !('nama' in idx)) {
      report.error = 'Kolom wajib tidak ditemukan: ' + [!('nama' in idx) && 'nama', !('tglLahir' in idx) && 'tanggal lahir'].filter(Boolean).join(', ') + '.';
      return { records: [], report };
    }
    const get = (r, f) => (f in idx && r[idx[f]] != null ? String(r[idx[f]]).trim() : '');
    const records = [];
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      const tgl = mapDate(get(r, 'tglLahir'));
      if (!get(r, 'nama')) { skip('nama kosong'); continue; }
      if (!tgl) { skip('tanggal lahir tidak terbaca'); continue; }
      records.push({
        nik: get(r, 'nik').replace(/\D/g, ''), noKK: get(r, 'noKK').replace(/\D/g, ''), nama: get(r, 'nama'),
        jk: mapJK(get(r, 'jk')), tglLahir: tgl, tempatLahir: get(r, 'tempatLahir'),
        statusKawin: mapKawin(get(r, 'statusKawin')), pend: mapPend(get(r, 'pend')),
        pekerjaan: get(r, 'pekerjaan'), agama: get(r, 'agama'), golDarah: get(r, 'golDarah'), hubungan: get(r, 'hubungan'),
        dusun: get(r, 'dusun'), rt: get(r, 'rt'), rw: get(r, 'rw'), alamat: get(r, 'alamat'),
        ktpEl: 'ktpEl' in idx ? mapKartu(get(r, 'ktpEl')) : null, kia: 'kia' in idx ? mapKartu(get(r, 'kia')) : null,
      });
    }
    report.diimpor = records.length;
    return { records, report };
  }

  /* ---------- tampilan data pribadi ---------- */
  const maskNik = (nik) => (nik && nik.length >= 10 ? nik.slice(0, 6) + '•'.repeat(nik.length - 10) + nik.slice(-4) : nik || '—');

  return {
    STATUS, STATUS_COLOR, statusLabel, PEND_LEVELS, PEND_GROUPS, USIA_GROUPS, KARTU_OPSI,
    enrich, emptyFilter, isFiltered, applyFilter, describeFilter, filterFromParams, filterToParams, aggregate,
    parseCSV, importCSV, maskNik,
  };
})();
