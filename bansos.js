(window.__ver = window.__ver || {})['bansos.js'] = '2026-10-28.2';
/*
 * Bantuan sosial (BLT Dana Desa, PKH, Sembako, dll.): penerima per program dan per dusun, penyaluran, dan pemeriksaan data
 * terhadap data penduduk (SIAK): NIK penerima yang tidak ada di data penduduk, penerima ganda, dan penerima di banyak program.
 *
 * Bentuk data:
 *   { tahun, diperbarui, program: [{ id, nama, sumber, kuota, nilai, periode }],
 *     penerima: [{ program (id), nik, noKK, nama, status: 'tersalur'|'belum'|'ditunda' }] }
 * Catatan: ini hanya memantau DATA PENERIMA YANG TERCATAT. Menilai siapa yang berhak (miskin/tidak) butuh data kesejahteraan
 * resmi dan keputusan musyawarah desa; dashboard ini tidak menentukan hal itu.
 */
window.BansosLib = (() => {
  'use strict';

  function agregat(B, warga) {
    const nikW = new Map((warga || []).filter((w) => w.nik).map((w) => [w.nik, w]));
    const denganNik = B.penerima.filter((r) => r.nik);
    const cocokPct = denganNik.length ? denganNik.filter((r) => nikW.has(r.nik)).length / denganNik.length : 0;
    const bisaCocok = nikW.size > 0 && cocokPct >= 0.3; // NIK hampir tak cocok = data penduduk berbeda; jangan menuduh penerima
    const catatan = nikW.size > 0 && denganNik.length && !bisaCocok ? `NIK penerima hanya ${Math.round(cocokPct * 100)}% yang cocok dengan data penduduk, jadi pemeriksaan kecocokan tidak dilakukan.` : '';
    const dusun = new Map();
    const per = B.program.map((p) => {
      const rows = B.penerima.filter((r) => r.program === p.id);
      const seen = new Set(), unik = [];
      rows.forEach((r) => { const k = r.nik || r.noKK || r.nama; if (!seen.has(k)) { seen.add(k); unik.push(r); } });
      const tidakCocok = bisaCocok ? unik.filter((r) => !nikW.has(r.nik)).length : null;
      if (bisaCocok) unik.forEach((r) => { const w = nikW.get(r.nik); if (w) dusun.set(w.dusun || '—', (dusun.get(w.dusun || '—') || 0) + 1); });
      const st = (s) => unik.filter((r) => r.status === s).length;
      return {
        ...p, terdata: unik.length, ganda: rows.length - unik.length, tersalur: st('tersalur'), belum: st('belum'), ditunda: st('ditunda'), tidakCocok,
        persenKuota: p.kuota ? (unik.length / p.kuota) * 100 : null, persenSalur: unik.length ? (st('tersalur') / unik.length) * 100 : 0,
        nilaiTersalur: st('tersalur') * (p.nilai || 0),
      };
    });
    const count = new Map();
    B.penerima.forEach((r) => { const k = r.nik || r.noKK; if (k) { (count.get(k) || count.set(k, new Set()).get(k)).add(r.program); } });
    const unikSemua = count.size, rangkap = [...count.values()].filter((s) => s.size > 1).length;
    const tot = (f) => per.reduce((a, p) => a + f(p), 0);
    return {
      per, unikSemua, rangkap, catatan, bisaCocok,
      terdata: tot((p) => p.terdata), kuota: tot((p) => p.kuota || 0), tersalur: tot((p) => p.tersalur), belum: tot((p) => p.belum), ditunda: tot((p) => p.ditunda),
      ganda: tot((p) => p.ganda), tidakCocok: bisaCocok ? tot((p) => p.tidakCocok || 0) : null,
      nilaiTersalur: tot((p) => p.nilaiTersalur),
      perDusun: [...dusun].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value),
    };
  }

  /* ---------- impor CSV ---------- */
  const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
  const ALIAS = {
    program: ['program', 'namaprogram', 'jenisbantuan', 'bantuan', 'jenis'],
    nik: ['nik', 'nomornik', 'nonik'], noKK: ['nokk', 'nomorkk', 'nomorkartukeluarga'], nama: ['nama', 'namapenerima', 'namalengkap'],
    status: ['status', 'statuspenyaluran', 'penyaluran', 'keterangan'], kuota: ['kuota', 'target', 'targetpenerima', 'pagu'], nilai: ['nilai', 'nominal', 'besarbantuan', 'jumlahbantuan'],
  };
  const mapStatus = (v) => { const s = v.toLowerCase(); if (/belum|tidak/.test(s)) return 'belum'; if (/tunda|tahan|pending/.test(s)) return 'ditunda'; if (/salur|terima|sudah|cair/.test(s)) return 'tersalur'; return v ? 'belum' : 'tersalur'; };
  function importCSV(text, parseCSV, tahun = new Date().getFullYear()) {
    const rows = parseCSV(text);
    if (rows.length < 2) return { data: null, report: { error: 'File kosong atau tidak punya baris data.' } };
    const head = rows[0].map(norm), idx = {};
    for (const [f, names] of Object.entries(ALIAS)) { const i = head.findIndex((h) => names.includes(h)); if (i >= 0) idx[f] = i; }
    const known = new Set(Object.values(idx));
    const report = { baris: rows.length - 1, dikenali: Object.keys(idx), tidakDikenali: rows[0].filter((_, i) => !known.has(i)).map((h) => h.trim()).filter(Boolean), dilewati: 0, alasan: {} };
    const skip = (w) => { report.dilewati++; report.alasan[w] = (report.alasan[w] || 0) + 1; };
    const miss = ['program', 'nik'].filter((f) => !(f in idx));
    if (miss.length) { report.error = 'Kolom wajib tidak ditemukan: ' + miss.join(', ') + '.'; return { data: null, report }; }
    const get = (r, f) => (f in idx && r[idx[f]] != null ? String(r[idx[f]]).trim() : '');
    const progs = new Map(), penerima = [];
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i], pn = get(r, 'program'), nik = get(r, 'nik').replace(/\D/g, '');
      if (!pn) { skip('program kosong'); continue; }
      if (!nik) { skip('NIK kosong'); continue; }
      const id = pn.toLowerCase().replace(/\W+/g, '-');
      const p = progs.get(id) || progs.set(id, { id, nama: pn, sumber: '', kuota: null, nilai: 0, periode: '' }).get(id);
      const k = Number(get(r, 'kuota').replace(/\D/g, '')), n = Number(get(r, 'nilai').replace(/\D/g, ''));
      if (k) p.kuota = Math.max(p.kuota || 0, k);
      if (n) p.nilai = Math.max(p.nilai || 0, n);
      penerima.push({ program: id, nik, noKK: get(r, 'noKK').replace(/\D/g, ''), nama: get(r, 'nama'), status: mapStatus(get(r, 'status')) });
    }
    report.diimpor = penerima.length;
    if (![...progs.values()].some((p) => p.kuota)) report.catatan = 'Kolom kuota tidak ada: persentase terhadap kuota tidak dihitung.';
    return { data: { tahun, diperbarui: new Date().toISOString(), program: [...progs.values()], penerima }, report };
  }

  return { agregat, importCSV };
})();
