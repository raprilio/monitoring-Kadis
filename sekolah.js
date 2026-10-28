(window.__ver = window.__ver || {})['sekolah.js'] = '2026-10-28.2';
/*
 * Data sekolah: jumlah anak SD / SMP / SMK (dan SMA bila ada) + PEMBARUAN OTOMATIS saat kenaikan kelas dan kelulusan.
 *
 * Bentuk satu data siswa (mentah, mis. ekspor Dapodik / data sekolah):
 *   nisn, nik, nama, jk, tglLahir ('YYYY-MM-DD'), sekolah (nama), npsn, jenjang ('SD'|'SMP'|'SMK'|'SMA'),
 *   kelas (angka: SD 1–6, SMP 7–9, SMA/SMK 10–12), tahunAjaran ('2025/2026'), status ('aktif'|'lulus'|'pindah'|'putus')
 *
 * Pembaruan otomatis (tanpa ada yang menekan tombol): tahun ajaran baru dimulai 1 Juli. Siswa berstatus aktif yang tahun ajaran
 * datanya lebih lama dari tahun ajaran sekarang otomatis dinaikkan kelasnya; yang melewati kelas akhir otomatis menjadi "lulus".
 * Lulusan SD/SMP yang belum ada catatannya di jenjang berikutnya ditandai "belum tercatat melanjutkan" sampai data sekolah
 * yang baru masuk (impor/API), dan saat data baru masuk status itu hilang dengan sendirinya.
 * Catatan: ini PROYEKSI dari data yang ada; kebenarannya tetap bergantung pada kesegaran data dari sekolah.
 */
window.SekolahLib = (() => {
  'use strict';
  const JENJANG = [
    { key: 'SD', label: 'SD', min: 1, max: 6, usia: [7, 12], next: ['SMP'] },
    { key: 'SMP', label: 'SMP', min: 7, max: 9, usia: [13, 15], next: ['SMK', 'SMA'] },
    { key: 'SMK', label: 'SMK', min: 10, max: 12, usia: [16, 18], next: [] },
    { key: 'SMA', label: 'SMA', min: 10, max: 12, usia: [16, 18], next: [] },
  ];
  const J = Object.fromEntries(JENJANG.map((j) => [j.key, j]));
  const RANK = { SD: 1, SMP: 2, SMK: 3, SMA: 3 };

  /* ---------- tahun ajaran ---------- */
  const taStart = (d = new Date()) => (d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1); // mulai Juli
  const taLabel = (y) => `${y}/${y + 1}`;
  const taYear = (s) => { const m = /(\d{4})/.exec(String(s || '')); return m ? Number(m[1]) : null; };
  const keyOf = (r) => r.nik || r.nisn || '';

  /** Terapkan kenaikan kelas/kelulusan otomatis berdasarkan tanggal hari ini. */
  function proyeksi(list, today = new Date()) {
    const cur = taStart(today);
    const out = list.map((r) => {
      const j = J[r.jenjang];
      const base = { ...r, kelasNow: r.kelas, state: r.status || 'aktif', otomatis: false, lulusTahun: null, calonLulus: false, lanjut: null };
      if (!j) return base;
      const max = r.jenjang === 'SMK' && r.kelas > 12 ? r.kelas : j.max; // SMK program 4 tahun (kelas 13)
      const ta = taYear(r.tahunAjaran);
      if (base.state === 'lulus') { base.lulusTahun = ta == null ? null : ta + 1; return base; }
      if (base.state !== 'aktif') return base;
      const diff = ta == null ? 0 : cur - ta;
      if (diff > 0) {
        base.otomatis = true;
        const k = r.kelas + diff;
        if (k > max) { base.state = 'lulus'; base.kelasNow = max; base.lulusTahun = ta + (max - r.kelas) + 1; }
        else base.kelasNow = k;
      }
      base.calonLulus = base.state === 'aktif' && base.kelasNow >= max;
      return base;
    });
    // kesinambungan: lulusan yang sudah punya catatan aktif di jenjang berikutnya
    const aktifBy = new Map();
    out.forEach((r) => { if (r.state === 'aktif' && keyOf(r)) { const k = keyOf(r); (aktifBy.get(k) || aktifBy.set(k, []).get(k)).push(r.jenjang); } });
    out.forEach((r) => {
      if (r.state !== 'lulus') return;
      const nxt = (J[r.jenjang] || { next: [] }).next;
      if (!nxt.length) return; // lulus SMA/SMK = tamat
      const k = keyOf(r);
      r.lanjut = !!k && (aktifBy.get(k) || []).some((jj) => nxt.includes(jj));
    });
    return out;
  }

  /* ---------- agregat ---------- */
  function aggregate(sis, warga, today = new Date()) {
    const keys = JENJANG.map((j) => j.key).filter((k) => k !== 'SMA' || sis.some((r) => r.jenjang === 'SMA'));
    const per = keys.map((k) => {
      const j = J[k], rows = sis.filter((r) => r.jenjang === k);
      const aktif = rows.filter((r) => r.state === 'aktif');
      const kelas = [];
      for (let n = j.min; n <= j.max; n++) kelas.push({ kelas: n, value: aktif.filter((r) => r.kelasNow === n).length });
      return {
        key: k, label: j.label, aktif: aktif.length, kelas,
        calonLulus: aktif.filter((r) => r.calonLulus).length,
        naikOtomatis: aktif.filter((r) => r.otomatis).length,
        lulusOtomatis: rows.filter((r) => r.state === 'lulus' && r.otomatis).length,
        lulus: rows.filter((r) => r.state === 'lulus').length,
        belumLanjut: rows.filter((r) => r.state === 'lulus' && r.lanjut === false).length,
        pindah: rows.filter((r) => r.state === 'pindah').length, putus: rows.filter((r) => r.state === 'putus').length,
      };
    });
    // sekolah
    const sm = new Map();
    sis.forEach((r) => {
      const id = r.npsn || r.sekolah || '—';
      const s = sm.get(id) || sm.set(id, { id, nama: r.sekolah || id, jenjang: r.jenjang, aktif: 0, calonLulus: 0, lulus: 0 }).get(id);
      if (r.state === 'aktif') { s.aktif++; if (r.calonLulus) s.calonLulus++; } else if (r.state === 'lulus') s.lulus++;
    });
    // anak usia sekolah yang tidak tercatat bersekolah (butuh NIK pada data sekolah dan data penduduk)
    const adaNik = sis.some((r) => r.nik);
    let ats = null;
    const nikW = new Set((warga || []).map((w) => w.nik).filter(Boolean));
    const denganNik = sis.filter((r) => r.nik);
    const cocok = denganNik.length ? denganNik.filter((r) => nikW.has(r.nik)).length / denganNik.length : 0;
    // bila NIK pada data sekolah hampir tidak ada di data penduduk, hasilnya tidak bermakna: jangan dihitung
    const atsCatatan = adaNik && warga && warga.length && cocok < 0.3 ? `NIK pada data sekolah hanya ${Math.round(cocok * 100)}% yang cocok dengan data penduduk, jadi anak yang belum bersekolah tidak dihitung.` : '';
    if (warga && warga.length && adaNik && !atsCatatan) {
      const aktifNik = new Set(sis.filter((r) => r.state === 'aktif' && r.nik).map((r) => r.nik));
      const tamat = new Set(sis.filter((r) => r.state === 'lulus' && !(J[r.jenjang] || { next: [1] }).next.length && r.nik).map((r) => r.nik));
      const band = [['SD', 7, 12], ['SMP', 13, 15], ['SMK/SMA', 16, 18]];
      const dusun = new Map();
      const hit = warga.filter((w) => w.usia != null && w.usia >= 7 && w.usia <= 18 && !aktifNik.has(w.nik) && !tamat.has(w.nik));
      hit.forEach((w) => dusun.set(w.dusun || '—', (dusun.get(w.dusun || '—') || 0) + 1));
      ats = {
        total: hit.length, dari: warga.filter((w) => w.usia != null && w.usia >= 7 && w.usia <= 18).length,
        band: band.map(([label, a, b]) => ({ label, value: hit.filter((w) => w.usia >= a && w.usia <= b).length })),
        dusun: [...dusun].map(([label, value]) => ({ label, value })).sort((x, y) => y.value - x.value),
      };
    }
    return {
      per, sekolah: [...sm.values()].sort((a, b) => (RANK[a.jenjang] - RANK[b.jenjang]) || b.aktif - a.aktif),
      total: per.reduce((a, p) => a + p.aktif, 0),
      naikOtomatis: per.reduce((a, p) => a + p.naikOtomatis, 0), lulusOtomatis: per.reduce((a, p) => a + p.lulusOtomatis, 0),
      belumLanjut: per.reduce((a, p) => a + p.belumLanjut, 0), calonLulus: per.reduce((a, p) => a + p.calonLulus, 0),
      ats, atsCatatan, taSekarang: taLabel(taStart(today)),
    };
  }

  /* ---------- impor CSV (ekspor Dapodik / data sekolah) ---------- */
  const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
  // Nama kolom → field. Daftar ini PERKIRAAN; sesuaikan bila ekspor sekolah Anda berbeda.
  const ALIAS = {
    nisn: ['nisn'], nik: ['nik', 'nomornik', 'nonik'],
    nama: ['nama', 'namasiswa', 'namapesertadidik', 'namalengkap'],
    jk: ['jeniskelamin', 'jk', 'kelamin'], tglLahir: ['tanggallahir', 'tgllahir', 'tglahir'],
    sekolah: ['sekolah', 'namasekolah', 'satuanpendidikan', 'namasatuanpendidikan'], npsn: ['npsn'],
    jenjang: ['jenjang', 'bentukpendidikan', 'bentuk', 'jenjangpendidikan'],
    kelas: ['kelas', 'tingkat', 'tingkatpendidikan', 'tingkatkelas', 'rombel', 'tingkatrombel'],
    tahunAjaran: ['tahunajaran', 'tahunpelajaran', 'ta'], status: ['status', 'statussiswa', 'statuspesertadidik', 'keterangan'],
  };
  const ROMAWI = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10, xi: 11, xii: 12, xiii: 13 };
  const mapJenjang = (v) => {
    const s = v.toLowerCase();
    if (/smk|\bmak\b/.test(s)) return 'SMK';
    if (/smp|mts|tsanawiyah|sltp/.test(s)) return 'SMP';
    if (/sma|\bma\b|aliyah|slta/.test(s)) return 'SMA';
    if (/\bsd\b|\bmi\b|ibtidaiyah|^sd|^mi$/.test(s)) return 'SD';
    return null;
  };
  const mapKelas = (v) => {
    const s = v.toLowerCase().trim();
    const d = /(\d{1,2})/.exec(s);
    if (d) return Number(d[1]);
    const r = /\b(xiii|xii|xi|x|ix|viii|vii|vi|iv|v|iii|ii|i)\b/.exec(s);
    return r ? ROMAWI[r[1]] : null;
  };
  const mapStatus = (v) => {
    const s = v.toLowerCase();
    if (/lulus|tamat/.test(s)) return 'lulus';
    if (/pindah|mutasi/.test(s)) return 'pindah';
    if (/putus|keluar|drop|mengundurkan/.test(s)) return 'putus';
    return 'aktif';
  };
  const mapDate = (v) => {
    let m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/.exec(v.trim());
    if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/.exec(v.trim());
    return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : '';
  };

  function importCSV(text, parseCSV, today = new Date()) {
    const rows = parseCSV(text);
    if (rows.length < 2) return { siswa: [], report: { error: 'File kosong atau tidak punya baris data.' } };
    const head = rows[0].map(norm), idx = {};
    for (const [f, names] of Object.entries(ALIAS)) { const i = head.findIndex((h) => names.includes(h)); if (i >= 0) idx[f] = i; }
    const known = new Set(Object.values(idx));
    const report = { baris: rows.length - 1, dikenali: Object.keys(idx), tidakDikenali: rows[0].filter((_, i) => !known.has(i)).map((h) => h.trim()).filter(Boolean), hilang: Object.keys(ALIAS).filter((f) => !(f in idx)), dilewati: 0, alasan: {} };
    const skip = (w) => { report.dilewati++; report.alasan[w] = (report.alasan[w] || 0) + 1; };
    const miss = ['jenjang', 'kelas'].filter((f) => !(f in idx));
    if (miss.length || !('nama' in idx)) {
      report.error = 'Kolom wajib tidak ditemukan: ' + [...(!('nama' in idx) ? ['nama'] : []), ...miss].join(', ') + '.';
      return { siswa: [], report };
    }
    const get = (r, f) => (f in idx && r[idx[f]] != null ? String(r[idx[f]]).trim() : '');
    const curTa = taLabel(taStart(today));
    const siswa = [];
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      if (!get(r, 'nama')) { skip('nama kosong'); continue; }
      const jenjang = mapJenjang(get(r, 'jenjang')), kelas = mapKelas(get(r, 'kelas'));
      if (!jenjang) { skip('jenjang tidak dikenali'); continue; }
      if (kelas == null) { skip('kelas tidak terbaca'); continue; }
      const ta = get(r, 'tahunAjaran');
      siswa.push({
        nisn: get(r, 'nisn'), nik: get(r, 'nik').replace(/\D/g, ''), nama: get(r, 'nama'), jk: /^(l|lk|laki)/i.test(get(r, 'jk')) ? 'L' : /^(p|pr|perempuan)/i.test(get(r, 'jk')) ? 'P' : null,
        tglLahir: mapDate(get(r, 'tglLahir')), sekolah: get(r, 'sekolah'), npsn: get(r, 'npsn'), jenjang, kelas,
        tahunAjaran: taYear(ta) ? taLabel(taYear(ta)) : curTa, status: 'status' in idx ? mapStatus(get(r, 'status')) : 'aktif',
      });
    }
    report.diimpor = siswa.length;
    if (!('tahunAjaran' in idx)) report.catatan = `Kolom tahun ajaran tidak ada: semua data dianggap tahun ajaran ${curTa} (tanpa kenaikan kelas otomatis).`;
    if (!('nik' in idx)) report.catatan = (report.catatan ? report.catatan + ' ' : '') + 'Kolom NIK tidak ada: anak yang tidak tercatat bersekolah tidak bisa dihitung.';
    return { siswa, report };
  }

  return { JENJANG, taStart, taLabel, proyeksi, aggregate, importCSV };
})();
