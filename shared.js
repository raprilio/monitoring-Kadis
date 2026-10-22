/* Fungsi bersama untuk tampilan rinci (index.html) dan tampilan TV (tv.html). */
window.DashLib = (() => {
  'use strict';
  const D = window.DASHBOARD_DATA;

  /* ---------- format & hitung ---------- */
  const nf = new Intl.NumberFormat('id-ID');
  const nfd = (d) => new Intl.NumberFormat('id-ID', { minimumFractionDigits: d, maximumFractionDigits: d });
  const fmt = (n) => nf.format(Math.round(n));
  const fmt1 = (n) => nfd(1).format(n);
  const pct = (n, d = 1) => nfd(d).format(n) + '%';
  const compact = (n) => (n >= 1000 ? nfd(n % 1000 === 0 ? 0 : 1).format(n / 1000) + ' rb' : nf.format(n));
  const rupiah = (n) =>
    n >= 1e9 ? 'Rp ' + fmt1(n / 1e9) + ' miliar' : n >= 1e6 ? 'Rp ' + fmt1(n / 1e6) + ' juta' : 'Rp ' + fmt(n);
  const sum = (a) => a.reduce((x, y) => x + y, 0);
  const avg = (a) => (a.length ? sum(a) / a.length : 0);
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const slice = (arr, days, offset = 0) => arr.slice(arr.length - offset - days, arr.length - offset);
  const changePct = (cur, prev) => (prev ? ((cur - prev) / prev) * 100 : 0);
  const dShort = (s) => new Date(s + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
  const dLong = (s) =>
    new Date(s + 'T00:00:00').toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });

  /* ---------- DOM ---------- */
  const SVGNS = 'http://www.w3.org/2000/svg';
  function el(tag, attrs = {}, kids = []) {
    const isSvg = tag.startsWith('svg:');
    const n = isSvg ? document.createElementNS(SVGNS, tag.slice(4)) : document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'text') n.textContent = v;
      else n.setAttribute(k, v === true ? '' : v);
    }
    (Array.isArray(kids) ? kids : [kids]).forEach((c) => {
      if (c == null || c === false) return;
      n.append(c.nodeType ? c : document.createTextNode(String(c)));
    });
    return n;
  }

  /* ---------- ikon status (selalu ikon + label, tidak mengandalkan warna saja) ---------- */
  const SEV_LABEL = { critical: 'Kritis', warning: 'Waspada', ok: 'Normal' };
  function statusIcon(sev) {
    const s = el('svg:svg', { viewBox: '0 0 16 16', width: 16, height: 16, 'aria-hidden': 'true', class: 'ico' });
    if (sev === 'critical') {
      s.append(el('svg:circle', { cx: 8, cy: 8, r: 7, style: 'fill:var(--crit)' }),
        el('svg:path', { d: 'M5.5 5.5l5 5m0-5l-5 5', stroke: '#fff', 'stroke-width': 1.8, 'stroke-linecap': 'round', fill: 'none' }));
    } else if (sev === 'warning') {
      s.append(el('svg:path', { d: 'M8 1.5l7 12.5H1z', style: 'fill:var(--warn)', 'stroke-linejoin': 'round' }),
        el('svg:path', { d: 'M8 6.2v3.4', stroke: '#1a1a19', 'stroke-width': 1.6, 'stroke-linecap': 'round' }),
        el('svg:circle', { cx: 8, cy: 11.7, r: 0.95, fill: '#1a1a19' }));
    } else {
      s.append(el('svg:circle', { cx: 8, cy: 8, r: 7, style: 'fill:var(--good)' }),
        el('svg:path', { d: 'M4.8 8.2l2.2 2.2 4.2-4.6', stroke: '#fff', 'stroke-width': 1.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', fill: 'none' }));
    }
    return s;
  }
  const pill = (sev, text) => el('span', { class: 'pill' }, [statusIcon(sev), el('b', { text: text || SEV_LABEL[sev] })]);

  /* ---------- blangko ---------- */
  function blangkoStats() {
    const B = D.blangko;
    const rows = B.jenis.map((j) => {
      const sisa = j.total - j.terpakai - j.rusak;
      const dicetak = j.terpakai + j.rusak;
      const rusakCetak = dicetak ? (j.rusak / dicetak) * 100 : 0;
      const sisaPct = (sisa / j.total) * 100;
      const sev = rusakCetak > B.ambangRusakPersen || sisaPct < B.ambangSisaPersen ? 'warning' : 'ok';
      return { ...j, sisa, dicetak, rusakCetak, sisaPct, sev };
    });
    const T = (k) => sum(rows.map((r) => r[k]));
    const total = T('total'), terpakai = T('terpakai'), rusak = T('rusak'), sisa = T('sisa');
    return { B, rows, total, terpakai, rusak, sisa, rusakCetak: (rusak / (terpakai + rusak)) * 100 };
  }

  /* ---------- peringatan otomatis ("perlu perhatian") ---------- */
  function buildAlerts() {
    const A = [];
    const add = (sev, title, detail, sec, secName) => A.push({ sev, title, detail, sec, secName });
    D.kiosk.perangkat.forEach((k) => {
      if (k.status !== 'online') add('critical', `${k.nama} offline`, k.catatan, 'kiosk', 'Kiosk');
      else if (k.kertasPersen < 20) add('warning', `${k.nama}: kertas tinggal ${k.kertasPersen}%`, 'Isi ulang kertas', 'kiosk', 'Kiosk');
    });
    D.server.perangkat.forEach((n) => {
      if (n.status !== 'ok') add(n.status === 'warning' ? 'warning' : 'critical', `${n.nama}: kondisi ${n.status === 'warning' ? 'waspada' : 'bermasalah'}`, n.peran, 'server', 'Server');
      if (n.disk >= 90) add('critical', `${n.nama}: disk ${n.disk}% penuh`, 'Segera tambah kapasitas atau bersihkan data', 'server', 'Server');
      else if (n.disk >= 75) add('warning', `${n.nama}: disk ${n.disk}% terpakai`, 'Rencanakan penambahan kapasitas', 'server', 'Server');
    });
    if (D.server.sslSisaHari < 30) add(D.server.sslSisaHari < 14 ? 'critical' : 'warning', `Sertifikat SSL berakhir ${D.server.sslSisaHari} hari lagi`, 'Perpanjang agar aplikasi warga tetap aman diakses', 'server', 'Server');
    if (D.server.backupTerakhir.status !== 'berhasil') add('critical', 'Backup terakhir gagal', D.server.backupTerakhir.waktu, 'server', 'Server');
    blangkoStats().rows.forEach((r) => {
      if (r.rusakCetak > D.blangko.ambangRusakPersen) add('warning', `Blangko ${r.nama}: ${pct(r.rusakCetak)} rusak`, `${fmt(r.rusak)} lembar rusak dari ${fmt(r.dicetak)} dicetak`, 'blangko', 'Blangko');
      if (r.sisaPct < D.blangko.ambangSisaPersen) add('warning', `Blangko ${r.nama}: sisa ${pct(r.sisaPct, 0)}`, `Tinggal ${fmt(r.sisa)} lembar`, 'blangko', 'Blangko');
    });
    const rusakAset = sum(D.aset.kategori.map((c) => c.rusak));
    if (rusakAset) add('warning', `${fmt(rusakAset)} unit aset rusak`, 'Menunggu keputusan perbaikan atau penghapusan', 'aset', 'Aset');
    if (D.mobile.pengaduanLebih7Hari) add('warning', `${D.mobile.pengaduanLebih7Hari} pengaduan warga belum ditangani > 7 hari`, `${D.mobile.pengaduanTerbuka} pengaduan masih terbuka`, 'mobile', 'Aplikasi warga');
    D.warga.kelengkapan.filter((k) => k.value < 75).forEach((k) => add('critical', `Data warga: ${k.label} baru ${pct(k.value, 0)}`, 'Perlu percepatan pendataan', 'warga', 'Data warga'));
    const order = { critical: 0, warning: 1 };
    return A.sort((a, b) => order[a.sev] - order[b.sev]);
  }

  return {
    D, nf, nfd, fmt, fmt1, pct, compact, rupiah, sum, avg, clamp, slice, changePct, dShort, dLong,
    el, SEV_LABEL, statusIcon, pill, blangkoStats, buildAlerts,
  };
})();
