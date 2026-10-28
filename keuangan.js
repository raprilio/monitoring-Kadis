(window.__ver = window.__ver || {})['keuangan.js'] = '2026-10-28.2';
/*
 * Keuangan desa (APBDes): realisasi pendapatan dan belanja terhadap anggaran, dibandingkan dengan porsi waktu tahun berjalan.
 *
 * Bentuk data:
 *   { tahun, diperbarui, ambang: { tertinggalWaspada, tertinggalKritis },
 *     pendapatan: [{ uraian, anggaran, realisasi }], belanja: [{ uraian, anggaran, realisasi, tanpaTarget? }] }
 * "Tertinggal" = porsi waktu berjalan (mis. 82% tahun sudah lewat) dikurangi persen realisasi, dalam poin persen.
 * Ambang peringatan (15 dan 30 poin) adalah NILAI AWAL, bukan aturan; sesuaikan dengan kebijakan desa.
 * Belanja cadangan (mis. darurat/bencana) diberi tanpaTarget agar tidak dinilai tertinggal.
 */
window.KeuanganLib = (() => {
  'use strict';
  const sum = (a, f) => a.reduce((x, y) => x + f(y), 0);

  /** Porsi tahun anggaran yang sudah berjalan (0..1). */
  function porsiWaktu(tahun, today = new Date()) {
    const y = today.getFullYear();
    if (y > tahun) return 1;
    if (y < tahun) return 0;
    const awal = new Date(y, 0, 1), akhir = new Date(y + 1, 0, 1);
    return Math.min(1, (today - awal) / (akhir - awal));
  }

  function ringkas(K, today = new Date()) {
    const waktu = porsiWaktu(K.tahun, today) * 100;
    const amb = { tertinggalWaspada: 15, tertinggalKritis: 30, ...(K.ambang || {}) };
    const baris = (list, lunak) => list.map((r) => {
      const persen = r.anggaran ? (r.realisasi / r.anggaran) * 100 : 0;
      const tertinggal = r.tanpaTarget ? 0 : waktu - persen;
      let sev = tertinggal >= amb.tertinggalKritis ? 'critical' : tertinggal >= amb.tertinggalWaspada ? 'warning' : 'ok';
      if (lunak && sev === 'critical') sev = 'warning'; // pendapatan tertunda biasanya soal pencairan, bukan kelalaian desa
      return { ...r, persen, sisa: r.anggaran - r.realisasi, tertinggal, sev };
    });
    const total = (rows) => { const a = sum(rows, (r) => r.anggaran), r = sum(rows, (x) => x.realisasi); return { anggaran: a, realisasi: r, sisa: a - r, persen: a ? (r / a) * 100 : 0 }; };
    const belanja = baris(K.belanja, false), pendapatan = baris(K.pendapatan, true);
    return { tahun: K.tahun, waktu, amb, belanja: { rows: belanja, total: total(belanja) }, pendapatan: { rows: pendapatan, total: total(pendapatan) }, tertinggal: belanja.filter((r) => r.sev !== 'ok') };
  }

  /* ---------- impor CSV ---------- */
  const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
  const ALIAS = {
    jenis: ['jenis', 'kelompok', 'tipe', 'akun', 'kategori'],
    uraian: ['uraian', 'bidang', 'sumber', 'namaakun', 'keterangan', 'rekening', 'nama'],
    anggaran: ['anggaran', 'pagu', 'apbdes', 'jumlahanggaran', 'anggaransetelahperubahan'],
    realisasi: ['realisasi', 'terealisasi', 'sdsaatini', 'sampaidengansaatini', 'jumlahrealisasi'],
    cadangan: ['cadangan', 'tanpatarget'],
  };
  /** "1.250.000.000", "Rp 1.250.000,50", "1250000" → angka. */
  function parseRupiah(v) {
    let s = String(v == null ? '' : v).replace(/rp|\s/gi, '');
    if (!s) return null;
    if (/^-?\d+$/.test(s)) return Number(s);
    const dot = s.includes('.'), com = s.includes(',');
    if (dot && com) s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
    else if (com) s = /,\d{1,2}$/.test(s) ? s.replace(',', '.') : s.replace(/,/g, '');
    else if (dot) s = /\.\d{3}(\.|$)/.test(s) ? s.replace(/\./g, '') : s;
    const n = Number(s);
    return isFinite(n) ? n : null;
  }
  function importCSV(text, parseCSV, tahun = new Date().getFullYear()) {
    const rows = parseCSV(text);
    if (rows.length < 2) return { data: null, report: { error: 'File kosong atau tidak punya baris data.' } };
    const head = rows[0].map(norm), idx = {};
    for (const [f, names] of Object.entries(ALIAS)) { const i = head.findIndex((h) => names.includes(h)); if (i >= 0) idx[f] = i; }
    const known = new Set(Object.values(idx));
    const report = { baris: rows.length - 1, dikenali: Object.keys(idx), tidakDikenali: rows[0].filter((_, i) => !known.has(i)).map((h) => h.trim()).filter(Boolean), dilewati: 0, alasan: {} };
    const skip = (w) => { report.dilewati++; report.alasan[w] = (report.alasan[w] || 0) + 1; };
    const miss = ['jenis', 'uraian', 'anggaran', 'realisasi'].filter((f) => !(f in idx));
    if (miss.length) { report.error = 'Kolom wajib tidak ditemukan: ' + miss.join(', ') + '.'; return { data: null, report }; }
    const get = (r, f) => (f in idx && r[idx[f]] != null ? String(r[idx[f]]).trim() : '');
    const data = { tahun, diperbarui: new Date().toISOString(), pendapatan: [], belanja: [] };
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i], j = get(r, 'jenis').toLowerCase();
      const a = parseRupiah(get(r, 'anggaran')), re = parseRupiah(get(r, 'realisasi'));
      if (!get(r, 'uraian')) { skip('uraian kosong'); continue; }
      if (a == null || re == null) { skip('anggaran/realisasi bukan angka'); continue; }
      const item = { uraian: get(r, 'uraian'), anggaran: a, realisasi: re };
      if (/^(y|ya|1|true|cadangan)/i.test(get(r, 'cadangan'))) item.tanpaTarget = true;
      if (/pendapatan|penerimaan/.test(j)) data.pendapatan.push(item);
      else if (/belanja|pengeluaran/.test(j)) data.belanja.push(item);
      else skip('jenis bukan pendapatan/belanja');
    }
    report.diimpor = data.pendapatan.length + data.belanja.length;
    return { data, report };
  }

  return { porsiWaktu, ringkas, importCSV, parseRupiah };
})();
