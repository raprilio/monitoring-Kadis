(window.__ver = window.__ver || {})['shared.js'] = '2026-10-28.2';
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

  /* ---------- data warga (SIAK) ---------- */
  const W = window.WargaLib;
  const wargaAll = () => W.enrich(D.warga.records);
  D.meta.sumberPenduduk = { jenis: 'contoh' };

  /** Ambil data warga dari API bila DASHBOARD_CONFIG.apiPenduduk diisi. Gagal → data sebelumnya tetap dipakai dan galat dicatat. */
  async function loadWarga() {
    const url = (window.DASHBOARD_CONFIG || {}).apiPenduduk;
    if (!url) return;
    try {
      const res = await fetch(url, { credentials: 'same-origin', cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const j = await res.json();
      const rec = Array.isArray(j) ? j : j && j.records;
      if (!Array.isArray(rec)) throw new Error('format data tidak dikenali (harus array data warga)');
      D.warga.records = rec;
      D.meta.sumberPenduduk = { jenis: 'api', url, jumlah: rec.length, diambil: new Date().toISOString() };
    } catch (e) {
      const prev = D.meta.sumberPenduduk;
      D.meta.sumberPenduduk = prev.jenis === 'api'
        ? { ...prev, galat: `Pembaruan terakhir gagal (${e.message}); memakai data dari ${new Date(prev.diambil).toLocaleTimeString('id-ID')}.` }
        : { jenis: 'contoh', galat: `Gagal mengambil ${url}: ${e.message}. Memakai data contoh.` };
    }
  }
  const ready = loadWarga();

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
    // data kependudukan: selalu dihitung dari seluruh warga, tidak mengikuti filter di layar
    const a = W.aggregate(wargaAll());
    if (a.ktp.belum) add(a.ktp.pct < 75 ? 'critical' : 'warning', `${fmt(a.ktp.belum)} warga wajib KTP-el belum punya`, `Cakupan ${pct(a.ktp.pct, 1)} dari ${fmt(a.ktp.wajib)} warga wajib`, 'warga', 'Data warga');
    if (a.kia.belum) add(a.kia.pct < 75 ? 'critical' : 'warning', `${fmt(a.kia.belum)} anak belum punya KIA`, `Cakupan ${pct(a.kia.pct, 1)} dari ${fmt(a.kia.wajib)} anak wajib`, 'warga', 'Data warga');
    if (a.nikGanda) add('critical', `${fmt(a.nikGanda)} NIK ganda di data kependudukan`, 'Periksa dan perbaiki di SIAK', 'warga', 'Data warga');
    const nikBuruk = a.kualitas[0].value < 100 ? Math.round(((100 - a.kualitas[0].value) / 100) * a.n) : 0;
    if (nikBuruk) add('warning', `${fmt(nikBuruk)} NIK tidak valid (bukan 16 digit)`, 'Periksa dan perbaiki di SIAK', 'warga', 'Data warga');
    if (D.sekolah && D.sekolah.siswa && D.sekolah.siswa.length) {
      const sk = sekolahAgg();
      if (sk.belumLanjut) add('warning', `${fmt(sk.belumLanjut)} lulusan SD/SMP belum tercatat melanjutkan`, 'Menunggu data sekolah diperbarui, atau perlu didekati orang tuanya', 'sekolah', 'Pendidikan');
      if (sk.ats && sk.ats.total) add(sk.ats.total / (sk.ats.dari || 1) > 0.25 ? 'critical' : 'warning', `${fmt(sk.ats.total)} anak usia sekolah belum tercatat bersekolah`, `Dari ${fmt(sk.ats.dari)} anak usia 7–18 tahun`, 'sekolah', 'Pendidikan');
    }
    if (D.keuangan) {
      const k = keuanganRingkas();
      k.belanja.rows.filter((r) => r.sev !== 'ok').forEach((r) => add(r.sev, `Belanja "${r.uraian}" baru ${pct(r.persen, 0)} terealisasi`, `Waktu ${pct(k.waktu, 0)} · sisa ${rupiah(r.sisa)}`, 'keuangan', 'Keuangan'));
      k.pendapatan.rows.filter((r) => r.sev !== 'ok').forEach((r) => add(r.sev, `Pendapatan "${r.uraian}" baru ${pct(r.persen, 0)} terealisasi`, `Waktu ${pct(k.waktu, 0)} · cek pencairan`, 'keuangan', 'Keuangan'));
    }
    if (D.bansos && D.bansos.penerima && D.bansos.penerima.length) {
      const b = bansosAgg();
      b.per.forEach((p) => {
        if (p.persenKuota != null && p.persenKuota < 90) add('warning', `${p.nama}: penerima baru ${fmt(p.terdata)} dari kuota ${fmt(p.kuota)}`, 'Kuota belum terpenuhi', 'bansos', 'Bantuan sosial');
        if (p.belum + p.ditunda > 0) add('warning', `${p.nama}: ${fmt(p.belum + p.ditunda)} penerima belum menerima penyaluran`, `${fmt(p.belum)} belum, ${fmt(p.ditunda)} ditunda`, 'bansos', 'Bantuan sosial');
      });
      if (b.tidakCocok) add('warning', `${fmt(b.tidakCocok)} penerima bantuan tidak ditemukan di data penduduk`, 'Periksa NIK penerima di data SIAK', 'bansos', 'Bantuan sosial');
      if (b.ganda) add('critical', `${fmt(b.ganda)} data penerima bantuan tercatat ganda`, 'NIK muncul lebih dari sekali', 'bansos', 'Bantuan sosial');
    }
    const order = { critical: 0, warning: 1 };
    return A.sort((a, b) => order[a.sev] - order[b.sev]);
  }



  /* ---------- data sekolah ---------- */
  const SK = window.SekolahLib;
  const sekolahAll = () => SK.proyeksi((D.sekolah && D.sekolah.siswa) || []);
  const sekolahAgg = () => SK.aggregate(sekolahAll(), wargaAll());
  D.meta.sumberSekolah = { jenis: 'contoh' };
  /** Ambil data sekolah dari API bila DASHBOARD_CONFIG.apiSekolah diisi (array siswa, atau { siswa: [...], diperbarui }). */
  async function loadSekolah() {
    const url = (window.DASHBOARD_CONFIG || {}).apiSekolah;
    if (!url) return;
    try {
      const res = await fetch(url, { credentials: 'same-origin', cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const j = await res.json();
      const siswa = Array.isArray(j) ? j : j && (j.siswa || j.records);
      if (!Array.isArray(siswa)) throw new Error('format data tidak dikenali (harus array siswa)');
      D.sekolah = { diperbarui: (j && j.diperbarui) || new Date().toISOString(), sekolah: (j && j.sekolah) || [], siswa };
      D.meta.sumberSekolah = { jenis: 'api', url, jumlah: siswa.length, diambil: new Date().toISOString() };
    } catch (e) {
      const prev = D.meta.sumberSekolah;
      D.meta.sumberSekolah = prev.jenis === 'api' ? { ...prev, galat: `Pembaruan terakhir gagal (${e.message}); memakai data sebelumnya.` } : { jenis: 'contoh', galat: `Gagal mengambil ${url}: ${e.message}. Memakai data contoh.` };
    }
  }

  /* ---------- keuangan desa & bantuan sosial ---------- */
  const KL = window.KeuanganLib, BL = window.BansosLib;
  const keuanganRingkas = () => KL.ringkas(D.keuangan);
  const bansosAgg = () => BL.agregat(D.bansos, wargaAll());
  D.meta.sumberKeuangan = { jenis: 'contoh' };
  D.meta.sumberBansos = { jenis: 'contoh' };
  /** Ambil JSON dari alamat di DASHBOARD_CONFIG[cfgKey]; `terima(json)` memasang datanya. Gagal → data sebelumnya tetap dipakai. */
  async function muatApi(cfgKey, metaKey, terima) {
    const url = (window.DASHBOARD_CONFIG || {})[cfgKey];
    if (!url) return;
    try {
      const res = await fetch(url, { credentials: 'same-origin', cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const jml = terima(await res.json());
      D.meta[metaKey] = { jenis: 'api', url, jumlah: jml, diambil: new Date().toISOString() };
    } catch (e) {
      const prev = D.meta[metaKey];
      D.meta[metaKey] = prev.jenis === 'api' ? { ...prev, galat: `Pembaruan terakhir gagal (${e.message}); memakai data sebelumnya.` } : { jenis: 'contoh', galat: `Gagal mengambil ${url}: ${e.message}. Memakai data contoh.` };
    }
  }
  const loadKeuangan = () => muatApi('apiKeuangan', 'sumberKeuangan', (j) => {
    if (!j || !Array.isArray(j.belanja) || !Array.isArray(j.pendapatan)) throw new Error('format data tidak dikenali (butuh pendapatan[] dan belanja[])');
    D.keuangan = { tahun: j.tahun || new Date().getFullYear(), ambang: j.ambang, diperbarui: j.diperbarui || new Date().toISOString(), pendapatan: j.pendapatan, belanja: j.belanja };
    return j.pendapatan.length + j.belanja.length;
  });
  const loadBansos = () => muatApi('apiBansos', 'sumberBansos', (j) => {
    if (!j || !Array.isArray(j.program) || !Array.isArray(j.penerima)) throw new Error('format data tidak dikenali (butuh program[] dan penerima[])');
    D.bansos = { tahun: j.tahun || new Date().getFullYear(), diperbarui: j.diperbarui || new Date().toISOString(), program: j.program, penerima: j.penerima };
    return j.penerima.length;
  });
  const readyAll = Promise.all([ready, loadSekolah(), loadKeuangan(), loadBansos()]).then(() => undefined);
  const reloadAll = () => Promise.all([loadWarga(), loadSekolah(), loadKeuangan(), loadBansos()]).then(() => undefined);

  /* ---------- statistik periode & kartu KPI (dipakai bersama oleh index.html dan tv.html) ---------- */
  function periodOf(arr, days, mode = 'sum') {
    const cur = slice(arr, days), prev = slice(arr, days, days), f = mode === 'sum' ? sum : avg;
    return { cur, prev, c: f(cur), p: f(prev), chg: changePct(f(cur), f(prev)) };
  }

  /** Enam kartu KPI (satu per bagian) + angka utama layanan digital. `alerts` = hasil buildAlerts(). */
  function kpis(days, alerts) {
    const sevOf = (id) => (alerts.find((a) => a.sec === id) || { sev: 'ok' }).sev; // daftar urut: paling parah dulu
    const healthSev = (p) => (p >= 90 ? 'ok' : p >= 75 ? 'warning' : 'critical'); // warna cincin = kesehatan angka yang ditampilkan
    const m = D.mobile, rows = wargaAll(), wa = W.aggregate(rows), n = rows.length;
    const sel = periodOf(m.selesaiHarian, days), kio = periodOf(D.kiosk.transaksiHarian, days);
    const aju = periodOf(m.pengajuanHarian, days);
    const hero = { value: sel.c + kio.c, chg: changePct(sel.c + kio.c, sel.p + kio.p), viaApp: sel.c, viaKiosk: kio.c, rate: (sel.c / (aju.c || 1)) * 100 };

    const online = D.kiosk.perangkat.filter((p) => p.status === 'online').length, nKiosk = D.kiosk.perangkat.length;
    const cats = D.aset.kategori, t = (k) => sum(cats.map((c) => c[k]));
    const baik = t('baik'), perb = t('perbaikan'), rusak = t('rusak'), allAset = baik + perb + rusak;
    const nodes = D.server.perangkat, sehat = nodes.filter((x) => x.status === 'ok').length;
    const bl = blangkoStats();

    const cards = [
      { id: 'mobile', icon: 'phone', label: 'Warga di aplikasi', value: fmt(m.wargaTerdaftar), sub: `${pct((m.wargaTerdaftar / (n || 1)) * 100, 0)} dari warga desa`, ring: { value: (m.wargaTerdaftar / (n || 1)) * 100, text: fmt((m.wargaTerdaftar / (n || 1)) * 100) + '%', sev: 'ok' } },
      { id: 'kiosk', icon: 'kiosk', label: 'Kiosk online', value: `${online}/${nKiosk}`, sub: online < nKiosk ? `${nKiosk - online} kiosk offline` : 'semua kiosk aktif', ring: { value: (online / nKiosk) * 100, text: fmt((online / nKiosk) * 100) + '%', sev: healthSev((online / nKiosk) * 100) } },
      { id: 'aset', icon: 'box', label: 'Aset kondisi baik', value: pct((baik / allAset) * 100, 0), sub: `${fmt(rusak + perb)} perlu tindakan`, ring: { value: (baik / allAset) * 100, text: fmt((baik / allAset) * 100) + '%', sev: healthSev((baik / allAset) * 100) } },
      { id: 'warga', icon: 'users', label: 'Warga tercatat', value: fmt(n), sub: 'KTP-el (cincin)', ring: { value: wa.ktp.pct || 0, text: wa.ktp.pct == null ? '—' : fmt(wa.ktp.pct) + '%', sev: wa.ktp.pct == null ? 'ok' : healthSev(wa.ktp.pct) } },
      { id: 'server', icon: 'server', label: 'Server sehat', value: `${sehat}/${nodes.length}`, sub: `uptime ${pct(D.server.uptime30, 2)}`, ring: { value: (sehat / nodes.length) * 100, text: fmt((sehat / nodes.length) * 100) + '%', sev: healthSev((sehat / nodes.length) * 100) } },
      { id: 'blangko', icon: 'doc', label: 'Blangko terpakai', value: pct((bl.terpakai / bl.total) * 100, 0), sub: `${fmt(bl.rusak)} rusak (${pct((bl.rusak / bl.total) * 100, 1)})`,
        donut: [{ label: 'Terpakai', value: bl.terpakai, color: 'var(--s1)' }, { label: 'Rusak', value: bl.rusak, color: 'var(--crit)' }, { label: 'Sisa', value: bl.sisa, color: 'var(--neutral-seg)' }] },
    ];
    cards.forEach((c) => { c.sev = sevOf(c.id); });
    return { hero, cards, sevOf };
  }

  /* ---------- peta desa: titik dan jumlah warga per dusun ---------- */
  function petaTitik() {
    const kioskBy = new Map(D.kiosk.perangkat.map((k) => [k.nama, k]));
    const asetBy = new Map(D.aset.perluPerhatian.map((a) => [a.nama, a]));
    const out = [];
    ((D.peta && D.peta.titik) || []).forEach((t) => {
      if (t.jenis === 'kiosk') {
        const k = kioskBy.get(t.ref);
        if (!k) return;
        const sev = k.status !== 'online' ? 'critical' : k.kertasPersen < 20 ? 'warning' : 'ok';
        out.push({ ...t, tipe: 'Kiosk', sev, detail: k.status !== 'online' ? k.catatan : k.kertasPersen < 20 ? `Kertas tinggal ${k.kertasPersen}%` : `${fmt(k.transaksiHariIni)} transaksi hari ini` });
      } else if (t.jenis === 'aset') {
        const a = asetBy.get(t.ref);
        if (!a) return;
        out.push({ ...t, tipe: 'Aset', sev: a.kondisi === 'rusak' ? 'critical' : 'warning', detail: `${a.kondisi === 'rusak' ? 'Rusak' : 'Perlu perbaikan'}: ${a.catatan}` });
      } else {
        const bad = D.server.perangkat.filter((x) => x.status !== 'ok');
        out.push({ ...t, tipe: 'Server & jaringan', sev: bad.some((x) => x.status !== 'warning') ? 'critical' : bad.length ? 'warning' : 'ok',
          detail: bad.length ? bad.map((x) => `${x.nama} ${x.status === 'warning' ? 'waspada' : 'bermasalah'}`).join(', ') : 'Server dan jaringan normal' });
      }
    });
    return out;
  }

  /* ---------- peta nyata: koordinat, wilayah, batas ---------- */
  /** Poligon/titik/wilayah dalam [lintang, bujur]. Memakai GeoJSON dusun bila ada, bila tidak: konversi dari gambar skematik. */
  function petaGeo() {
    const P = D.peta, g = P && P.geo;
    if (!g || !g.batas) return null; // data.js lama (tanpa peta nyata)
    const [sw, ne] = g.batas;
    const toLL = ([x, y]) => [ne[0] - (y / P.tinggi) * (ne[0] - sw[0]), sw[1] + (x / P.lebar) * (ne[1] - sw[1])];
    const ring = (c) => c.map(([lng, lat]) => [lat, lng]);
    const fromGj = new Map();
    if (g.dusunGeojson && Array.isArray(g.dusunGeojson.features)) {
      g.dusunGeojson.features.forEach((f) => {
        const nm = f.properties && f.properties.nama, geom = f.geometry;
        if (!nm || !geom) return;
        const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.type === 'MultiPolygon' ? geom.coordinates : [];
        fromGj.set(nm, polys.map((p) => ring(p[0])));
      });
    }
    const bbox = (pts) => {
      const la = pts.map((p) => p[0]), lo = pts.map((p) => p[1]);
      const pa = (Math.max(...la) - Math.min(...la)) * 0.08, po = (Math.max(...lo) - Math.min(...lo)) * 0.08;
      return [[Math.min(...la) - pa, Math.min(...lo) - po], [Math.max(...la) + pa, Math.max(...lo) + po]];
    };
    const palsu = g.contoh && !fromGj.size; // bentuk dusun hasil konversi gambar skematik hanya layak di lokasi contoh
    const adaDusun = g.contoh || fromGj.size > 0;
    const namaP = P.dusun.map((d) => d.nama);
    const tambahan = [...fromGj.keys()].filter((n) => !namaP.includes(n)).map((nama) => ({ nama, poligon: [], label: [0, 0] })); // dusun hasil gambar/GeoJSON yang belum ada di daftar
    const dusun = (adaDusun ? [...P.dusun, ...tambahan].filter((d) => g.contoh || fromGj.has(d.nama)) : []).map((d) => { // di wilayah nyata hanya dusun yang punya batas asli
      const polys = fromGj.get(d.nama) || [d.poligon.map(toLL)];
      const flat = polys.flat();
      const label = fromGj.has(d.nama) ? [sum(flat.map((p) => p[0])) / flat.length, sum(flat.map((p) => p[1])) / flat.length] : toLL(d.label);
      return { nama: d.nama, key: d.nama.replace(/^Dusun\s+/i, '').toLowerCase().replace(/\W+/g, '-'), poligon: polys, label, bounds: bbox(flat) };
    });
    const desaBounds = [[sw[0], sw[1]], [ne[0], ne[1]]];
    const semuaTitik = petaTitik();
    const titik = semuaTitik.filter((p) => g.contoh || (p.lat != null && p.lng != null)).map((p) => ({ ...p, ll: p.lat != null && p.lng != null ? [p.lat, p.lng] : toLL([p.x, p.y]) }));
    const tanpaKoordinat = semuaTitik.length - titik.length;
    const wilayah = [{ key: 'desa', label: 'Seluruh desa', bounds: desaBounds }, ...dusun.map((d) => ({ key: d.key, label: d.nama, bounds: d.bounds }))];
    return { geo: g, dusun, titik, wilayah, desaBounds, desaPoligon: g.desaPoligon || null, gambar: g.gambar || [], tanpaKoordinat, adaDusun };
  }
  const petaCounts = (rows) => {
    const m = new Map();
    rows.forEach((r) => m.set(r.dusun, (m.get(r.dusun) || 0) + 1));
    return m;
  };

  return {
    D, nf, nfd, fmt, fmt1, pct, compact, rupiah, sum, avg, clamp, slice, changePct, dShort, dLong,
    el, SEV_LABEL, statusIcon, pill, blangkoStats, buildAlerts,
    W, wargaAll, ready: readyAll, reload: reloadAll, periodOf, kpis, petaTitik, petaCounts, petaGeo, SK, sekolahAll, sekolahAgg, KL, BL, keuanganRingkas, bansosAgg,
  };
})();
