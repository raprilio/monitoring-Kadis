/*
 * Tampilan TV: satu halaman, tanpa scroll, tanpa interaksi.
 * Parameter URL (opsional): ?days=7|30|90  ?theme=light|dark  ?refresh=<menit>  ?page=<detik pergantian peringatan/peta>
 *   filter data warga (panel Data Kependudukan dan angka di peta): ?status=menikah,lajang,janda,duda  ?usia=17-24  ?pend=sd,sma,sarjana  ?kartu=ktp-belum|kia-belum|ktp-sudah|kia-sudah
 * Tampilan TV hanya menampilkan angka gabungan, tidak pernah nama atau NIK.
 * Ganti filter status: klik tombol "Filter warga" di kiri atas, atau tombol panah kiri/kanan pada keyboard/remote.
 */
(() => {
  'use strict';
  const {
    D, el, fmt, nfd, pct, sum, avg, slice, changePct, dShort, SEV_LABEL, statusIcon, pill, buildAlerts, blangkoStats,
    W, wargaAll, ready, reload, periodOf, kpis, petaTitik, petaCounts,
  } = window.DashLib;
  const UI = window.DashUI;

  const q = new URLSearchParams(location.search);
  const DAYS = [7, 30, 90].includes(Number(q.get('days'))) ? Number(q.get('days')) : 30;
  const REFRESH_MIN = Number(q.get('refresh')) || 5;
  const PAGE_SEC = Number(q.get('page')) || 8;
  const filter = W.filterFromParams(q); // filter data warga; tombol di header mengganti status
  if (['light', 'dark'].includes(q.get('theme'))) document.documentElement.dataset.theme = q.get('theme');

  /* ---------- skala panggung 1920x1080 ke ukuran layar ---------- */
  const stage = document.getElementById('stage');
  function fit() {
    const s = Math.min(innerWidth / 1920, innerHeight / 1080);
    stage.style.transform = `scale(${s})`;
    stage.style.left = (innerWidth - 1920 * s) / 2 + 'px';
    stage.style.top = (innerHeight - 1080 * s) / 2 + 'px';
  }
  addEventListener('resize', fit);
  fit();

  /* ---------- util ---------- */
  const delta = (v, { unit = '%', goodWhenUp = true } = {}) => {
    if (Math.abs(v) < 0.05) return el('span', { class: 'd', text: '■ stabil' });
    const up = v > 0;
    return el('span', { class: 'd ' + (up === goodWhenUp ? 'good' : 'bad'), text: (up ? '▲ +' : '▼ −') + nfd(1).format(Math.abs(v)) + unit });
  };
  const mounts = [];
  function panel(cls, num, title, sev, body, extraHead) {
    return el('section', { class: 'panel ' + cls, id: cls.split(' ')[0] }, [
      el('div', { class: 'ph' }, [num ? el('span', { class: 'num', text: num }) : null, el('h2', { text: title }), extraHead || null, sev ? pill(sev) : null]),
      el('div', { class: 'body' }, body),
    ]);
  }
  const legend = (items) => el('div', { class: 'legend' }, items.map((i) => el('span', {}, [el('i', { style: 'background:' + i.color }), i.name])));
  const SEC = [['mobile', '1', 'phone', 'Aplikasi warga'], ['kiosk', '2', 'kiosk', 'Kiosk'], ['aset', '3', 'box', 'Aset'], ['warga', '4', 'users', 'Data kependudukan'], ['server', '5', 'server', 'Server'], ['blangko', '6', 'doc', 'Blangko']];

  /** Grafik area satu seri; digambar setelah masuk DOM supaya ukurannya terukur. */
  function areaChart(dates, values, label) {
    const host = el('div', { class: 'chart', role: 'img', 'aria-label': label });
    mounts.push(() => {
      const W_ = host.clientWidth, H = host.clientHeight;
      if (W_ < 50 || H < 40) return;
      const m = { l: 46, r: 64, t: 8, b: 24 }, iw = W_ - m.l - m.r, ih = H - m.t - m.b, n = values.length;
      const max = Math.max(...values), top = Math.ceil((max * 1.1) / 100) * 100 || 10;
      const x = (i) => m.l + (i / (n - 1)) * iw, y = (v) => m.t + ih - (v / top) * ih;
      const svg = el('svg:svg', { viewBox: `0 0 ${W_} ${H}`, width: W_, height: H });
      [0, top].forEach((t) => svg.append(
        el('svg:line', { x1: m.l, x2: W_ - m.r, y1: y(t), y2: y(t), class: t === 0 ? 'axis-l' : 'grid-l' }),
        el('svg:text', { x: m.l - 8, y: y(t) + 5, 'text-anchor': 'end', class: 'tick', text: fmt(t) })
      ));
      svg.append(
        el('svg:text', { x: m.l, y: H - 4, class: 'tick', text: dShort(dates[0]) }),
        el('svg:text', { x: W_ - m.r, y: H - 4, class: 'tick', 'text-anchor': 'end', text: dShort(dates[n - 1]) })
      );
      const d = values.map((v, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1)).join('');
      svg.append(
        el('svg:path', { d: d + `L${x(n - 1).toFixed(1)} ${y(0)}L${x(0).toFixed(1)} ${y(0)}Z`, style: 'fill:var(--s1)', 'fill-opacity': 0.14 }),
        el('svg:path', { d, fill: 'none', style: 'stroke:var(--s1)', 'stroke-width': 2.5, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }),
        el('svg:circle', { cx: x(n - 1), cy: y(values[n - 1]), r: 5, style: 'fill:var(--s1);stroke:var(--surface);stroke-width:2.5' }),
        el('svg:text', { x: x(n - 1) + 10, y: y(values[n - 1]) + 6, class: 'endlabel', text: fmt(values[n - 1]) })
      );
      host.replaceChildren(svg);
    });
    return host;
  }

  /* ---------- rel samping ---------- */
  function renderRail(K) {
    const rail = document.getElementById('rail');
    rail.replaceChildren(el('div', { class: 'logo' }, UI.icon('shield', 26)));
    SEC.forEach(([id, n, ic]) => {
      const sev = K.sevOf(id);
      rail.append(el('div', { class: 'r', title: SEC.find((s) => s[0] === id)[3] }, [el('span', { class: 'n', text: n }), UI.icon(ic, 28), statusIcon(sev)]));
    });
  }

  /* ---------- header ---------- */
  function renderHead(K) {
    const h = K.hero;
    document.getElementById('hero').replaceChildren(
      el('div', { class: 'h-label', text: `Layanan digital terselesaikan · ${DAYS} hari terakhir` }),
      el('div', { class: 'h-row' }, [
        el('span', { class: 'h-val', text: fmt(h.value) }),
        el('span', { class: 'h-delta ' + (h.chg >= 0 ? 'good' : 'bad'), text: (h.chg >= 0 ? '▲ +' : '▼ −') + nfd(1).format(Math.abs(h.chg)) + '%' }),
      ])
    );
    document.getElementById('desa').textContent = `${D.meta.desa} · ${D.meta.kecamatan} · ${D.meta.kabupaten}`;
    const sp = D.meta.sumberPenduduk, demo = document.getElementById('demo');
    demo.hidden = !D.meta.dataContoh && !sp.galat;
    demo.textContent = sp.galat ? (sp.jenis === 'api' ? 'Data warga basi: API gagal' : 'API gagal: data contoh') : sp.jenis === 'contoh' ? 'Data contoh' : 'Selain data warga: data contoh';
    const flt = document.getElementById('flt');
    flt.textContent = 'Filter warga: ' + (W.describeFilter(filter) || 'semua');
    flt.style.setProperty('--fc', filter.status.length === 1 ? W.STATUS_COLOR[filter.status[0]] : 'var(--muted)');
  }

  /* ---------- panel kependudukan ---------- */
  const covSev = (p) => (p >= 90 ? 'ok' : p >= 75 ? 'warning' : 'critical');
  function pWarga(sev, a) {
    const items = a.status.map((s) => ({ label: s.label, value: s.value, color: W.STATUS_COLOR[s.key] }));
    const total = a.n || 1;
    const leg = el('div', { class: 'siak-leg' }, items.map((i) =>
      el('div', { class: 'rowline' }, [el('i', { style: 'background:' + i.color }), el('span', { class: 'n', text: i.label }), el('span', { class: 'v', text: fmt(i.value) }), el('span', { class: 'v pc', text: pct((i.value / total) * 100, 0) })])));
    const cov = (label, c) => el('div', { class: 'ringbox' }, [
      UI.ring({ value: c.pct || 0, size: 78, stroke: 10, sev: c.wajib ? covSev(c.pct) : 'ok', text: c.wajib ? fmt(c.pct) + '%' : '—', label: `${label}: ${c.wajib ? pct(c.pct, 1) : 'tidak ada data'}` }),
      el('div', { class: 't' }, [el('b', { text: label }), c.wajib ? `${fmt(c.belum)} belum punya` : 'tidak ada data']),
    ]);
    const mx = Math.max(...a.usia.map((u) => u.value), 1);
    const usia = a.usia.map((u) => el('div', { class: 'rowline', style: 'grid-template-columns: 122px 1fr 56px' }, [
      el('span', { class: 'n', text: u.label }),
      el('div', { style: 'display:flex' }, el('div', { class: 'hfill', style: `width:${(u.value / mx) * 100}%;background:var(--s1)` })),
      el('span', { class: 'v', text: fmt(u.value) }),
    ]));
    return panel('warga', '4', 'Data Kependudukan', sev, [
      el('div', { class: 'siak-top' }, [UI.donut({ items, size: 168, thickness: 22, center: [fmt(a.n), W.isFiltered(filter) ? 'sesuai filter' : 'warga'], bigSize: 30, smallSize: 16, label: 'Komposisi status perkawinan' }), leg]),
      el('div', { class: 'rings' }, [cov('KTP-el', a.ktp), cov('KIA', a.kia)]),
      el('div', { class: 'sub', text: 'Menurut kelompok usia' }),
      ...usia,
    ]);
  }

  /* ---------- peta ---------- */
  let mapTimer = null, alertTimer = null;
  function renderMap(rows, sev) {
    const points = petaTitik();
    const watch = points.filter((p) => p.sev !== 'ok');
    const cyc = watch.length ? watch : points;
    let i = 0;
    const host = el('div', { class: 'map-svg' }), info = el('div', { class: 'map-info' });
    const draw = () => {
      const p = cyc[i % cyc.length];
      host.replaceChildren(UI.villageMap({ peta: D.peta, counts: petaCounts(rows), points, active: p.id, slice: true }));
      info.replaceChildren(
        el('div', { class: 'tp', text: p.tipe }), el('div', { class: 't', text: p.nama }),
        el('div', {}, pill(p.sev)), el('div', { class: 'd', text: p.detail })
      );
    };
    draw();
    clearInterval(mapTimer);
    if (cyc.length > 1) mapTimer = setInterval(() => { i++; draw(); }, PAGE_SEC * 1000);
    const nWatch = watch.length;
    return el('section', { class: 'panel map', id: 'peta' }, [
      host,
      el('div', { class: 'map-title' }, ['Peta Desa (skematik)', el('span', { class: 'sub', text: `${nWatch} dari ${points.length} titik perlu perhatian` })]),
      info,
      el('div', { class: 'map-leg' }, [UI.mapLegend(), el('div', { class: 'sub', style: 'margin-top:4px', text: 'Angka di peta = warga per dusun' })]),
    ]);
  }

  /* ---------- peringatan ---------- */
  function pAlerts(alerts) {
    const nCrit = alerts.filter((a) => a.sev === 'critical').length, nWarn = alerts.length - nCrit;
    const PER = 6, pages = Math.max(1, Math.ceil(alerts.length / PER));
    let page = 0;
    const list = el('div', { class: 'alert-list' }), pg = el('span', { class: 'pg', text: pages > 1 ? `1/${pages}` : '' });
    const show = () => list.replaceChildren(...(alerts.length
      ? alerts.slice(page * PER, page * PER + PER).map((a) => el('div', { class: 'a-item' }, [statusIcon(a.sev), el('div', { style: 'min-width:0' }, [
          el('div', { class: 'a-title', text: `${SEV_LABEL[a.sev]} · ${a.title}` }),
          el('div', { class: 'a-detail', text: `${a.secName} — ${a.detail}` }),
        ])]))
      : [el('div', { class: 't-ok' }, [statusIcon('ok'), 'Semua laporan dalam batas normal.'])]));
    show();
    clearInterval(alertTimer);
    if (pages > 1) {
      alertTimer = setInterval(() => {
        list.classList.add('fade');
        setTimeout(() => { page = (page + 1) % pages; show(); pg.textContent = `${page + 1}/${pages}`; list.classList.remove('fade'); }, 350);
      }, PAGE_SEC * 1000);
    }
    return el('section', { class: 'panel', id: 'alerts' }, [
      el('div', { class: 'ph' }, [el('h2', { text: 'Perlu perhatian' }), pg]),
      el('div', { class: 'sub' }, [el('span', { class: 'pill' }, [statusIcon('critical'), el('b', { text: `${nCrit} kritis` })]), '   ', el('span', { class: 'pill' }, [statusIcon('warning'), el('b', { text: `${nWarn} waspada` })])]),
      el('div', { class: 'body' }, list),
    ]);
  }

  /* ---------- panel bawah ---------- */
  function pMobile(sev) {
    const m = D.mobile, aktif = periodOf(m.penggunaAktifHarian, DAYS, 'avg'), aju = periodOf(m.pengajuanHarian, DAYS), sel = periodOf(m.selesaiHarian, DAYS);
    return panel('mobile', '1', 'Aplikasi Warga', sev, [
      areaChart(slice(D.tanggal, DAYS), aktif.cur.map((v) => Math.round(v)), 'Pengguna aktif per hari'),
      el('div', { class: 'sub' }, ['Aktif/hari ', el('b', { text: fmt(aktif.c) }), ' ', delta(aktif.chg)]),
      el('div', { class: 'sub' }, ['Pengajuan ', el('b', { text: fmt(aju.c) }), ' · selesai ', el('b', { text: pct((sel.c / (aju.c || 1)) * 100, 0) })]),
    ]);
  }
  function pKiosk(sev) {
    const k = D.kiosk;
    const rows = k.perangkat.map((p) => {
      const off = p.status !== 'online', low = !off && p.kertasPersen < 20;
      return el('div', { class: 'rowline', style: 'grid-template-columns: 22px 1fr auto' }, [
        statusIcon(off ? 'critical' : low ? 'warning' : 'ok'),
        el('span', { class: 'n', text: p.nama.replace('Kiosk ', '') }),
        el('span', { class: 'v', text: off ? 'Offline' : low ? `Kertas ${p.kertasPersen}%` : `${fmt(p.transaksiHariIni)} trx` }),
      ]);
    });
    return panel('kiosk', '2', 'Kiosk', sev, [...rows, el('div', { class: 'sub', text: 'Angka = transaksi hari ini' })]);
  }
  function pAset(sev) {
    const cats = D.aset.kategori, t = (key) => sum(cats.map((c) => c[key]));
    const parts = [{ name: 'Baik', v: t('baik'), color: 'var(--good)' }, { name: 'Perbaikan', v: t('perbaikan'), color: 'var(--warn)' }, { name: 'Rusak', v: t('rusak'), color: 'var(--crit)' }];
    const butuh = (c) => c.perbaikan + c.rusak;
    const top = [...cats].sort((a, b) => butuh(b) / (b.baik + butuh(b)) - butuh(a) / (a.baik + butuh(a))).slice(0, 3);
    return panel('aset', '3', 'Aset Desa', sev, [
      el('div', { class: 'bar', style: 'height:20px' }, parts.map((p) => el('div', { class: 'seg', style: `flex:${p.v} 1 0;background:${p.color}` }))),
      legend(parts.map((p) => ({ name: `${p.name} ${fmt(p.v)}`, color: p.color }))),
      el('div', { class: 'sub', text: 'Paling banyak perlu tindakan' }),
      ...top.map((c) => el('div', { class: 'rowline', style: 'grid-template-columns: 130px 1fr 50px' }, [
        el('span', { class: 'n', text: c.nama }),
        el('div', { class: 'bar' }, [[c.baik, 'var(--good)'], [c.perbaikan, 'var(--warn)'], [c.rusak, 'var(--crit)']].map(([v, col]) => (v ? el('div', { class: 'seg', style: `flex:${v} 1 0;background:${col}` }) : null))),
        el('span', { class: 'v', text: `${butuh(c)}/${c.baik + butuh(c)}` }),
      ])),
    ]);
  }
  function pServer(sev) {
    const s = D.server;
    return panel('server', '5', 'Server', sev, [
      ...s.perangkat.map((n) => {
        const sv = n.disk >= 90 ? 'critical' : n.disk >= 75 ? 'warning' : 'ok';
        const fillc = sv === 'critical' ? 'var(--crit)' : sv === 'warning' ? 'var(--warn)' : 'var(--s1)';
        return el('div', { class: 'rowline', style: 'grid-template-columns: 112px 1fr 84px' }, [
          el('span', { class: 'n', text: n.nama }),
          el('div', { class: 'meter', style: '--fillc:' + fillc }, el('i', { style: `width:${n.disk}%` })),
          el('span', { class: 'v' }, [sv !== 'ok' ? statusIcon(sv) : null, `Disk ${n.disk}%`]),
        ]);
      }),
      el('div', { class: 'sub' }, ['Backup ', el('b', { text: s.backupTerakhir.status === 'berhasil' ? 'berhasil' : 'GAGAL' }), ' · SSL ', el('b', { text: `${s.sslSisaHari} hr` })]),
    ]);
  }
  function pBlangko(sev) {
    const { B, rows } = blangkoStats();
    const parts = [{ key: 'terpakai', color: 'var(--s1)' }, { key: 'rusak', color: 'var(--crit)' }, { key: 'sisa', color: 'var(--neutral-seg)' }];
    return panel('blangko', '6', 'Blangko', sev, [
      legend([{ name: 'Terpakai', color: 'var(--s1)' }, { name: 'Rusak', color: 'var(--crit)' }, { name: 'Sisa', color: 'var(--neutral-seg)' }]),
      ...rows.map((r) => el('div', { class: 'rowline', style: 'grid-template-columns: 128px 1fr 64px; font-size:16px' }, [
        el('span', { class: 'n', text: r.nama.replace('Kartu Identitas Anak (KIA)', 'KIA') }),
        el('div', { class: 'bar' }, parts.map((p) => (r[p.key] ? el('div', { class: 'seg', style: `flex:${r[p.key]} 1 0;background:${p.color}` }) : null))),
        r.rusakCetak > B.ambangRusakPersen ? el('span', { class: 'v' }, [statusIcon('warning'), pct(r.rusakCetak, 1)]) : el('span', { class: 'v', text: pct(r.rusakCetak, 1) }),
      ])),
    ]);
  }

  /* ---------- render ---------- */
  function render() {
    const alerts = buildAlerts();
    const K = kpis(DAYS, alerts);
    const rows = W.applyFilter(wargaAll(), filter), a = W.aggregate(rows);
    renderRail(K);
    renderHead(K);
    document.getElementById('kpis').replaceChildren(...K.cards.map((c) => UI.kpiCard(c, { ringSize: 68 })));
    mounts.length = 0;
    document.getElementById('main').replaceChildren(pWarga(K.sevOf('warga'), a), renderMap(rows), pAlerts(alerts));
    document.getElementById('bottom').replaceChildren(pMobile(K.sevOf('mobile')), pKiosk(K.sevOf('kiosk')), pAset(K.sevOf('aset')), pServer(K.sevOf('server')), pBlangko(K.sevOf('blangko')));
    mounts.forEach((f) => f());
  }

  function tick() {
    const now = new Date();
    document.getElementById('time').textContent = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }).replace('.', ':');
    document.getElementById('date').textContent = now.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }

  // ganti filter status warga: klik tombol atau panah kiri/kanan (semua → menikah → lajang → janda → duda)
  const OPSI = [null, ...W.STATUS.map((x) => x.key)];
  function cycle(dir) {
    const cur = filter.status.length === 1 ? filter.status[0] : filter.status.length ? undefined : null;
    const i = OPSI.indexOf(cur === undefined ? null : cur);
    const nxt = OPSI[(i + dir + OPSI.length) % OPSI.length];
    filter.status = nxt ? [nxt] : [];
    try {
      const u = new URL(location.href);
      W.filterToParams(filter, u.searchParams);
      history.replaceState(null, '', u);
    } catch (e) { /* abaikan */ }
    render();
  }
  document.getElementById('flt').addEventListener('click', () => cycle(1));
  addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') cycle(1);
    else if (e.key === 'ArrowLeft') cycle(-1);
  });

  ready.then(() => {
    render();
    tick();
    setInterval(tick, 10000);
    // ambil ulang data (bila memakai API) lalu gambar ulang
    setInterval(async () => { await reload(); render(); }, REFRESH_MIN * 60 * 1000);
  });

  // sembunyikan kursor bila diam 3 detik
  let idle;
  const wake = () => { document.body.classList.remove('idle'); clearTimeout(idle); idle = setTimeout(() => document.body.classList.add('idle'), 3000); };
  addEventListener('mousemove', wake);
  wake();
})();
