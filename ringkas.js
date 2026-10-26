/*
 * Tampilan ringkas: bahasa sehari-hari, satu pertanyaan per kartu, satu kalimat per masalah.
 * Layar lebar (TV): satu halaman tanpa scroll. HP/tablet tegak: mengalir ke bawah.
 * Parameter URL (opsional): ?theme=light|dark  ?days=7|30|90  ?refresh=<menit>
 * Seluruh angka dihitung dari data yang sama dengan halaman detail; hanya bahasanya yang disederhanakan.
 */
(() => {
  'use strict';
  const { D, el, fmt, nfd, pct, sum, statusIcon, blangkoStats, W, wargaAll, ready, reload, periodOf } = window.DashLib;
  const UI = window.DashUI;

  const q = new URLSearchParams(location.search);
  const DAYS = [7, 30, 90].includes(Number(q.get('days'))) ? Number(q.get('days')) : 30;
  const REFRESH_MIN = Number(q.get('refresh')) || 5;
  if (['light', 'dark'].includes(q.get('theme'))) document.documentElement.dataset.theme = q.get('theme');

  const WORD = { ok: 'Baik', warning: 'Perlu dicek', critical: 'Segera ditangani' };
  const COLOR = { ok: 'var(--good)', warning: 'var(--warn)', critical: 'var(--crit)' };
  const ORDER = { critical: 0, warning: 1, ok: 2 };
  const lc = (s) => s.charAt(0).toLowerCase() + s.slice(1);
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  // nama perangkat dalam bahasa awam (cadangan: keterangan peran di data)
  const NAMA_ALAT = {
    'srv-aplikasi': 'Komputer utama aplikasi warga',
    'srv-database': 'Komputer penyimpan data penduduk',
    'srv-backup': 'Penyimpan cadangan data',
    'router-balai': 'Jaringan internet Balai Desa',
  };
  const namaAlat = (n) => NAMA_ALAT[n.nama] || n.peran;

  /** Semua hal yang perlu perhatian, dalam kalimat biasa + saran tindakan. Satu-satunya sumber status halaman ini. */
  function items() {
    const out = [];
    const add = (sev, sec, text, saran) => out.push({ sev, sec, text, saran });
    const m = D.mobile;

    D.kiosk.perangkat.forEach((k) => {
      const nm = k.nama.replace('Kiosk ', '');
      if (k.status !== 'online') add('critical', 'kiosk', `Kiosk ${nm} mati, warga tidak bisa memakainya.`, 'Minta petugas memeriksa listrik dan internetnya.');
      else if (k.kertasPersen < 20) add('warning', 'kiosk', `Kertas kiosk ${nm} hampir habis (sisa ${k.kertasPersen}%).`, 'Minta petugas mengisi kertas.');
    });
    D.server.perangkat.forEach((n) => {
      const a = namaAlat(n);
      if (n.status !== 'ok') add(n.status === 'warning' ? 'warning' : 'critical', 'server', `${cap(a)} sedang bermasalah.`, 'Minta teknisi memeriksanya.');
      if (n.disk >= 90) add('critical', 'server', `Tempat simpan ${lc(a)} hampir penuh (${n.disk}%).`, 'Minta teknisi menambah kapasitas segera.');
      else if (n.disk >= 75) add('warning', 'server', `Tempat simpan ${lc(a)} sudah ${n.disk}% terisi.`, 'Rencanakan penambahan kapasitas.');
    });
    if (D.server.sslSisaHari < 30) add(D.server.sslSisaHari < 14 ? 'critical' : 'warning', 'server', `Izin keamanan situs (sertifikat) habis ${D.server.sslSisaHari} hari lagi.`, 'Minta teknisi memperpanjang sebelum habis.');
    if (D.server.backupTerakhir.status !== 'berhasil') add('critical', 'server', 'Salinan cadangan data terakhir gagal dibuat.', 'Minta teknisi memeriksanya.');

    const bl = blangkoStats();
    bl.rows.forEach((r) => {
      if (r.rusakCetak > bl.B.ambangRusakPersen) add('warning', 'blangko', `Blangko ${r.nama} banyak yang rusak (${pct(r.rusakCetak, 0)} dari yang dicetak).`, 'Periksa printer dan cara pencetakannya.');
      if (r.sisaPct < bl.B.ambangSisaPersen) add('warning', 'blangko', `Blangko ${r.nama} tinggal ${fmt(r.sisa)} lembar.`, 'Ajukan tambahan blangko.');
    });

    const cats = D.aset.kategori, rusak = sum(cats.map((c) => c.rusak));
    if (rusak) add('warning', 'aset', `${fmt(rusak)} barang milik desa rusak.`, 'Putuskan: diperbaiki atau dihapus dari daftar.');

    if (m.pengaduanLebih7Hari) add('warning', 'mobile', `${fmt(m.pengaduanLebih7Hari)} pengaduan warga belum dijawab lebih dari 7 hari.`, 'Minta petugas menindaklanjuti.');

    const a = W.aggregate(wargaAll());
    if (a.ktp.belum) add(a.ktp.pct < 75 ? 'critical' : 'warning', 'warga', `${fmt(a.ktp.belum)} warga sudah wajib KTP tetapi belum punya.`, 'Ajak warga merekam KTP di kantor Dukcapil.');
    if (a.kia.belum) add(a.kia.pct < 75 ? 'critical' : 'warning', 'warga', `${fmt(a.kia.belum)} anak belum punya KIA (Kartu Identitas Anak).`, 'Ajak orang tua mengurus KIA anaknya.');
    if (a.nikGanda) add('critical', 'warga', `${fmt(a.nikGanda)} nomor NIK tercatat ganda di data penduduk.`, 'Minta operator memperbaikinya di SIAK.');
    const nikBuruk = Math.round(((100 - a.kualitas[0].value) / 100) * a.n);
    if (nikBuruk) add('warning', 'warga', `${fmt(nikBuruk)} NIK tidak lengkap (bukan 16 angka).`, 'Minta operator memperbaikinya di SIAK.');

    return out.sort((x, y) => ORDER[x.sev] - ORDER[y.sev]);
  }

  /** Enam kartu: judul, angka besar, bar, dan kalimat penjelas. */
  function cards(list) {
    const worst = (sec) => (list.find((i) => i.sec === sec) || { sev: 'ok' }).sev; // list sudah urut dari yang terparah
    const m = D.mobile, n = D.warga.records.length || 1;
    const aju = periodOf(m.pengajuanHarian, DAYS), sel = periodOf(m.selesaiHarian, DAYS);

    const k = D.kiosk.perangkat, online = k.filter((p) => p.status === 'online').length;
    const cats = D.aset.kategori, t = (key) => sum(cats.map((c) => c[key]));
    const baik = t('baik'), perb = t('perbaikan'), rusak = t('rusak'), all = baik + perb + rusak;
    const wa = W.aggregate(wargaAll());
    const nodes = D.server.perangkat, sehat = nodes.filter((x) => x.status === 'ok').length;
    const bl = blangkoStats();

    const kioskOff = k.filter((p) => p.status !== 'online').map((p) => p.nama.replace('Kiosk ', ''));
    const sev = (id) => worst(id);
    const texts = (id, fallback) => { const l = list.filter((i) => i.sec === id).slice(0, 2).map((i) => i.text); return l.length ? l : [fallback]; };

    const one = (id, fallback) => texts(id, fallback)[0];
    return [
      { id: 'mobile', icon: 'phone', title: 'Aplikasi HP Warga', num: fmt(m.wargaTerdaftar), unit: 'warga sudah memakai', bar: (m.wargaTerdaftar / n) * 100, barLabel: `${pct((m.wargaTerdaftar / n) * 100, 0)} warga`,
        text: one('mobile', `Semua pengaduan ditangani. ${DAYS} hari terakhir ada ${fmt(aju.c)} permohonan layanan, ${pct((sel.c / (aju.c || 1)) * 100, 0)} selesai.`) },
      { id: 'kiosk', icon: 'kiosk', title: 'Kiosk Layanan', num: `${online} dari ${k.length}`, unit: 'kiosk menyala', bar: (online / k.length) * 100, barLabel: `${pct((online / k.length) * 100, 0)} menyala`,
        text: one('kiosk', 'Semua kiosk berjalan baik.') },
      { id: 'aset', icon: 'box', title: 'Barang Milik Desa', num: pct((baik / all) * 100, 0), unit: 'dalam kondisi baik', bar: (baik / all) * 100, barLabel: `${fmt(baik)} dari ${fmt(all)}`,
        text: `${fmt(rusak)} barang rusak dan ${fmt(perb)} perlu diperbaiki.` },
      { id: 'warga', icon: 'users', title: 'Data Penduduk', num: fmt(wa.n), unit: 'warga tercatat di SIAK', bar: wa.ktp.pct || 0, barLabel: `${wa.ktp.pct == null ? '—' : pct(wa.ktp.pct, 0)} sudah ber-KTP`,
        text: one('warga', 'Data penduduk lengkap dan rapi.') },
      { id: 'server', icon: 'server', title: 'Komputer & Internet', num: sehat === nodes.length ? 'Normal' : `${sehat} dari ${nodes.length}`, unit: sehat === nodes.length ? 'semua berjalan' : 'alat sehat', bar: (sehat / nodes.length) * 100, barLabel: `${pct((sehat / nodes.length) * 100, 0)} sehat`,
        text: one('server', 'Semua berjalan normal dan data tercadangkan.') },
      { id: 'blangko', icon: 'doc', title: 'Blangko KTP/KK', num: pct((bl.terpakai / bl.total) * 100, 0), unit: `terpakai, sisa ${fmt(bl.sisa)} lembar`, bar: (bl.terpakai / bl.total) * 100, barLabel: `${fmt(bl.rusak)} rusak`,
        text: one('blangko', 'Stok dan kondisi blangko aman.') },
    ].map((c) => ({ ...c, sev: sev(c.id) }));
  }

  function render() {
    const list = items();
    const nCrit = list.filter((i) => i.sev === 'critical').length, nWarn = list.length - nCrit;
    const overall = nCrit ? 'critical' : nWarn ? 'warning' : 'ok';
    const sel = periodOf(D.mobile.selesaiHarian, DAYS), kio = periodOf(D.kiosk.transaksiHarian, DAYS);
    const tot = sel.c + kio.c, chg = ((tot - (sel.p + kio.p)) / ((sel.p + kio.p) || 1)) * 100;
    const sp = D.meta.sumberPenduduk;
    const demo = D.meta.dataContoh || sp.galat;

    const title = overall === 'critical' ? `Ada ${nCrit} hal yang harus segera ditangani` : overall === 'warning' ? `Ada ${nWarn} hal yang perlu dicek` : 'Semua berjalan baik';
    const sub = overall === 'critical' ? (nWarn ? `Ditambah ${nWarn} hal yang perlu dicek.` : 'Lihat daftar di bagian bawah.') : overall === 'warning' ? 'Lihat daftar di bagian bawah.' : 'Tidak ada yang perlu ditindaklanjuti saat ini.';

    const header = el('header', { class: 'head' }, [
      el('div', {}, [
        el('h1', {}, ['Kondisi Desa Hari Ini', demo ? el('span', { class: 'demo', text: sp.galat ? 'Data warga gagal dimuat' : 'Data contoh' }) : null]),
        el('p', { class: 'sub', text: `${D.meta.desa} · ${DAYS} hari terakhir desa melayani ${fmt(tot)} layanan lewat HP dan kiosk (${chg >= 0 ? 'naik' : 'turun'} ${nfd(1).format(Math.abs(chg))}%)` }),
      ]),
      el('div', { class: 'clock' }, [el('div', { class: 't', id: 'time' }), el('div', { class: 'd', id: 'date' })]),
    ]);

    const banner = el('section', { class: 'banner', style: '--bc:' + COLOR[overall], role: 'status' }, [
      el('span', { class: 'big-ico' }, statusIcon(overall)),
      el('div', {}, [el('h2', { text: title }), el('p', { text: sub })]),
    ]);

    const grid = el('main', { class: 'cards' }, cards(list).map((c) =>
      el('article', { class: 'card', style: '--bc:' + COLOR[c.sev] }, [
        el('div', { class: 'c-top' }, [
          el('span', { class: 'c-ico' }, UI.icon(c.icon, 30)),
          el('h3', { text: c.title }),
          el('span', { class: 'chip' }, [statusIcon(c.sev), WORD[c.sev]]),
        ]),
        el('div', { class: 'c-num' }, [el('b', { text: c.num }), el('span', { text: c.unit })]),
        el('div', { class: 'c-barrow' }, [el('div', { class: 'c-bar', role: 'img', 'aria-label': `${c.title}: ${Math.round(c.bar)} persen` }, el('i', { style: `width:${Math.max(0, Math.min(100, c.bar))}%` })), el('span', { text: c.barLabel })]),
        el('p', { class: 'c-txt', text: c.text }),
      ])
    ));

    const SHOW = document.body.classList.contains('stage') ? 4 : 8;
    const todo = el('section', { class: 'todo' }, [
      el('h2', {}, ['Yang perlu Bapak/Ibu tindak lanjuti', list.length > SHOW ? el('small', { text: `(${SHOW} teratas dari ${list.length} hal)` }) : null]),
      list.length
        ? el('ol', {}, list.slice(0, SHOW).map((i) => el('li', {}, [statusIcon(i.sev), el('div', {}, [el('div', { class: 'tx', text: i.text }), el('div', { class: 'sa', text: 'Saran: ' + i.saran })])])))
        : el('div', { class: 'ok' }, [statusIcon('ok'), 'Tidak ada. Semua dalam keadaan baik.']),
    ]);

    const foot = el('footer', { class: 'foot' }, [
      el('span', { text: demo ? 'Angka di halaman ini masih contoh, belum data desa yang sebenarnya.' : `Diperbarui ${new Date().toLocaleString('id-ID', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}` }),
      el('span', {}, [el('a', { href: 'index.html', text: 'Lihat rincian lengkap' }), ' · ', el('a', { href: 'tv.html', text: 'Tampilan TV rinci' })]),
    ]);

    document.getElementById('app').replaceChildren(header, banner, grid, todo, foot);
    tick();
  }

  function tick() {
    const t = document.getElementById('time'), d = document.getElementById('date'), now = new Date();
    if (t) t.textContent = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }).replace('.', ':');
    if (d) d.textContent = now.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }

  /* ---------- mode tampilan: panggung TV atau mengalir ---------- */
  function layout() {
    const app = document.getElementById('app'), stage = innerWidth >= 1000 && innerWidth / innerHeight >= 1.3;
    const changed = document.body.classList.contains('stage') !== stage;
    document.body.classList.toggle('stage', stage);
    document.body.classList.toggle('flow', !stage);
    if (stage) {
      const s = Math.min(innerWidth / 1920, innerHeight / 1080);
      app.style.transform = `scale(${s})`;
      app.style.left = (innerWidth - 1920 * s) / 2 + 'px';
      app.style.top = (innerHeight - 1080 * s) / 2 + 'px';
    } else {
      app.style.transform = app.style.left = app.style.top = '';
    }
    if (changed && app.firstChild) render();
  }
  addEventListener('resize', layout);

  ready.then(() => {
    layout();
    render();
    setInterval(tick, 10000);
    setInterval(async () => { await reload(); render(); }, REFRESH_MIN * 60 * 1000);
  });

  // sembunyikan kursor bila diam 3 detik (untuk TV)
  let idle;
  const wake = () => { document.body.classList.remove('idle'); clearTimeout(idle); idle = setTimeout(() => document.body.classList.add('idle'), 3000); };
  addEventListener('mousemove', wake);
  wake();
})();
