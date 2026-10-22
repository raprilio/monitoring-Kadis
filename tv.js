/*
 * Tampilan TV: satu halaman, tanpa scroll, tanpa interaksi.
 * Parameter URL (opsional): ?days=7|30|90  ?status=semua|menikah|lajang|cerai  ?theme=light|dark  ?refresh=<menit>  ?page=<detik pergantian peringatan>
 * Ganti filter status: klik tombol "Status" di pojok kiri atas, atau tombol panah kiri/kanan pada keyboard/remote.
 */
(() => {
  'use strict';
  const {
    D, el, fmt, nfd, pct, sum, avg, slice, changePct, dShort, SEV_LABEL, statusIcon, pill, buildAlerts, blangkoStats,
    STATUS, STATUS_COLOR, statusLabel, parseStatus, share, scaled, wargaView, pengaduanView,
  } = window.DashLib;

  const q = new URLSearchParams(location.search);
  const DAYS = [7, 30, 90].includes(Number(q.get('days'))) ? Number(q.get('days')) : 30;
  const REFRESH_MIN = Number(q.get('refresh')) || 5;
  const PAGE_SEC = Number(q.get('page')) || 8;
  let status = parseStatus(q.get('status'));
  const NO_FILTER = new Set(['aset', 'server', 'blangko']); // tidak terkait status perkawinan
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
  const ps = (arr, mode = 'sum', kind = null) => {
    if (kind) arr = scaled(arr, kind, status);
    const cur = slice(arr, DAYS), prev = slice(arr, DAYS, DAYS), f = mode === 'sum' ? sum : avg;
    return { cur, prev, c: f(cur), p: f(prev), chg: changePct(f(cur), f(prev)) };
  };
  const delta = (v, { unit = '%', goodWhenUp = true } = {}) => {
    if (Math.abs(v) < 0.05) return el('span', { class: 'd', text: '■ stabil' });
    const up = v > 0;
    return el('span', { class: 'd ' + (up === goodWhenUp ? 'good' : 'bad'), text: (up ? '▲ +' : '▼ −') + nfd(1).format(Math.abs(v)) + unit });
  };
  function kpi({ label, value, unit, sub, dl, key }) {
    return el('div', { class: 'kpi' }, [
      el('div', { class: 'k-label' }, [key ? el('i', { style: 'background:' + key }) : null, label]),
      el('div', { class: 'k-val' }, [value, unit ? el('small', { text: ' ' + unit }) : null]),
      dl ? el('div', { class: 'k-sub' }, [dl, ' vs ' + DAYS + ' hr']) : null,
      sub ? el('div', { class: 'k-sub', text: sub }) : null,
    ]);
  }
  const mounts = [];
  function panel(id, num, title, sev, kpis, viz) {
    return el('section', { class: 'panel', id }, [
      el('header', {}, [el('span', { class: 'num', text: num }), el('h2', { text: title }), NO_FILTER.has(id) && status !== 'semua' ? el('span', { class: 'nf', text: 'di luar filter' }) : null, pill(sev)]),
      el('div', { class: 'kpis' }, kpis),
      el('div', { class: 'viz' }, viz),
    ]);
  }

  /** Grafik area satu seri; digambar setelah masuk DOM supaya ukurannya terukur. */
  function areaChart(dates, values, label) {
    const host = el('div', { class: 'chart', role: 'img', 'aria-label': label });
    mounts.push(() => {
      const W = host.clientWidth, H = host.clientHeight;
      if (W < 50 || H < 50) return;
      const m = { l: 56, r: 86, t: 12, b: 28 }, iw = W - m.l - m.r, ih = H - m.t - m.b, n = values.length;
      const max = Math.max(...values), top = Math.ceil((max * 1.1) / 100) * 100 || 10;
      const x = (i) => m.l + (i / (n - 1)) * iw, y = (v) => m.t + ih - (v / top) * ih;
      const svg = el('svg:svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H });
      [0, top / 2, top].forEach((t) =>
        svg.append(
          el('svg:line', { x1: m.l, x2: W - m.r, y1: y(t), y2: y(t), class: t === 0 ? 'axis-l' : 'grid-l' }),
          el('svg:text', { x: m.l - 10, y: y(t) + 6, 'text-anchor': 'end', class: 'tick', text: fmt(t) })
        )
      );
      svg.append(
        el('svg:text', { x: m.l, y: H - 4, class: 'tick', text: dShort(dates[0]) }),
        el('svg:text', { x: W - m.r, y: H - 4, class: 'tick', 'text-anchor': 'end', text: dShort(dates[n - 1]) })
      );
      const d = values.map((v, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1)).join('');
      svg.append(
        el('svg:path', { d: d + `L${x(n - 1).toFixed(1)} ${y(0)}L${x(0).toFixed(1)} ${y(0)}Z`, style: 'fill:var(--s1)', 'fill-opacity': 0.12 }),
        el('svg:path', { d, fill: 'none', style: 'stroke:var(--s1)', 'stroke-width': 3, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }),
        el('svg:circle', { cx: x(n - 1), cy: y(values[n - 1]), r: 6, style: 'fill:var(--s1);stroke:var(--surface);stroke-width:3' }),
        el('svg:text', { x: x(n - 1) + 14, y: y(values[n - 1]) + 7, class: 'endlabel', text: fmt(values[n - 1]) })
      );
      host.replaceChildren(svg);
    });
    return host;
  }
  const legend = (items) => el('div', { class: 'legend' }, items.map((i) => el('span', {}, [el('i', { style: 'background:' + i.color }), i.name])));

  /* ---------- panel per laporan ---------- */
  function pMobile(sev) {
    const m = D.mobile;
    const aktif = ps(m.penggunaAktifHarian, 'avg', 'penggunaAktif'), aju = ps(m.pengajuanHarian, 'sum', 'pengajuan'), sel = ps(m.selesaiHarian, 'sum', 'pengajuan');
    const pg = pengaduanView(status);
    const rate = (sel.c / (aju.c || 1)) * 100, ratePrev = (sel.p / (aju.p || 1)) * 100;
    return panel('mobile', '1', 'Aplikasi Warga', sev, [
      kpi({ label: 'Pengguna harian', value: fmt(aktif.c), dl: delta(aktif.chg) }),
      kpi({ label: 'Pengajuan selesai', value: fmt(rate), unit: '%', dl: delta(rate - ratePrev, { unit: ' poin' }) }),
      kpi({ label: 'Pengaduan terbuka', value: fmt(pg.terbuka), sub: pg.lebih7Hari ? `${pg.lebih7Hari} lewat 7 hari` : 'semua < 7 hari' }),
    ], [areaChart(slice(D.tanggal, DAYS), aktif.cur, 'Pengguna aktif per hari')]);
  }

  function pKiosk(sev) {
    const k = D.kiosk, tr = ps(k.transaksiHarian, 'sum', 'transaksiKiosk');
    const online = k.perangkat.filter((p) => p.status === 'online').length;
    const rows = k.perangkat.map((p) => {
      const on = p.status === 'online';
      return el('div', { class: 'rowline', style: 'grid-template-columns: 26px 1fr auto auto' }, [
        statusIcon(on ? 'ok' : 'critical'),
        el('span', { class: 'n', text: p.nama.replace('Kiosk ', '') }),
        el('span', { class: 'v', text: on ? `${fmt(p.transaksiHariIni * share('transaksiKiosk', status))} transaksi` : 'Offline' }),
        p.kertasPersen < 20 ? pill('warning', `Kertas ${p.kertasPersen}%`) : el('span', { class: 'n', text: `Kertas ${p.kertasPersen}%` }),
      ]);
    });
    return panel('kiosk', '2', 'Kiosk', sev, [
      kpi({ label: 'Kiosk online', value: `${online}/${k.perangkat.length}`, sub: online < k.perangkat.length ? `${k.perangkat.length - online} offline` : 'semua aktif' }),
      kpi({ label: 'Transaksi', value: fmt(tr.c), dl: delta(tr.chg) }),
    ], rows);
  }

  function pAset(sev) {
    const cats = D.aset.kategori, t = (k) => sum(cats.map((c) => c[k]));
    const baik = t('baik'), perb = t('perbaikan'), rusak = t('rusak'), all = baik + perb + rusak;
    const parts = [
      { name: 'Baik', v: baik, color: 'var(--good)' },
      { name: 'Perlu perbaikan', v: perb, color: 'var(--warn)' },
      { name: 'Rusak', v: rusak, color: 'var(--crit)' },
    ];
    const butuh = (c) => c.perbaikan + c.rusak;
    const topCats = [...cats].sort((a, b) => butuh(b) / (b.baik + butuh(b)) - butuh(a) / (a.baik + butuh(a))).slice(0, 3);
    const catRows = topCats.map((c) =>
      el('div', { class: 'rowline', style: 'grid-template-columns: 215px 1fr 110px; font-size:19px' }, [
        el('span', { class: 'n', text: c.nama }),
        el('div', { class: 'bar' }, parts.map((p, i) => { const v = [c.baik, c.perbaikan, c.rusak][i]; return v ? el('div', { class: 'seg', style: `flex:${v} 1 0;background:${p.color}` }) : null; })),
        el('span', { class: 'v', text: `${butuh(c)} dari ${c.baik + butuh(c)}` }),
      ])
    );
    return panel('aset', '3', 'Inventaris Aset', sev, [
      kpi({ label: 'Total aset', value: fmt(all), unit: 'unit' }),
      kpi({ label: 'Nilai aset (Rp)', value: nfd(1).format(sum(cats.map((c) => c.nilai)) / 1e9), unit: 'miliar' }),
      kpi({ label: 'Kondisi baik', value: fmt((baik / all) * 100), unit: '%' }),
    ], [
      el('div', { class: 'bar', style: 'height:26px;margin-top:6px' }, parts.map((p) => el('div', { class: 'seg', style: `flex:${p.v} 1 0;background:${p.color}` }))),
      legend(parts.map((p) => ({ name: `${p.name} ${fmt(p.v)}`, color: p.color }))),
      el('div', { class: 'k-sub', style: 'margin-top:8px', text: 'Kategori yang paling banyak perlu tindakan (perbaikan + rusak)' }),
      ...catRows,
    ]);
  }

  function pWarga(sev) {
    const w = wargaView(status), mx = Math.max(...w.perDusun.map((d) => d.value), 1);
    const lengkap = avg(w.kelengkapan.map((k) => k.value));
    const on = (k) => status === 'semua' || status === k;
    const rows = w.perDusun.map((d) =>
      el('div', { class: 'rowline', style: 'grid-template-columns: 190px 1fr 80px' }, [
        el('span', { class: 'n', text: d.label }),
        el('div', { style: 'display:flex' }, el('div', { class: 'hfill', style: `width:${(d.value / mx) * 100}%;background:var(--s1)` })),
        el('span', { class: 'v', text: fmt(d.value) }),
      ])
    );
    const comp = el('div', { class: 'bar', style: 'height:22px;margin-top:4px' },
      w.komposisi.map((c) => el('div', { class: 'seg', style: `flex:${c.value} 1 0;background:${STATUS_COLOR[c.key]};opacity:${on(c.key) ? 1 : 0.3}` })));
    const compLegend = el('div', { class: 'legend' }, w.komposisi.map((c) =>
      el('span', { style: `opacity:${on(c.key) ? 1 : 0.5}` }, [el('i', { style: 'background:' + STATUS_COLOR[c.key] }), `${c.label} ${fmt(c.value)}`])));
    return panel('warga', '4', 'Data Digital Warga', sev, [
      kpi({ label: status === 'semua' ? 'Penduduk' : `Penduduk ${statusLabel(status).toLowerCase()}`, value: fmt(w.penduduk) }),
      kpi({ label: 'Kepala keluarga', value: fmt(w.kepalaKeluarga) }),
      kpi({ label: 'Data lengkap', value: fmt(lengkap), unit: '%', sub: `terendah ${fmt(Math.min(...w.kelengkapan.map((k) => k.value)))}%` }),
    ], [comp, compLegend, ...rows]);
  }

  function pServer(sev) {
    const s = D.server, cpu = ps(s.cpu, 'avg'), ram = ps(s.ram, 'avg');
    const rows = s.perangkat.map((n) => {
      const sv = n.disk >= 90 ? 'critical' : n.disk >= 75 ? 'warning' : 'ok';
      const fillc = sv === 'critical' ? 'var(--crit)' : sv === 'warning' ? 'var(--warn)' : 'var(--s1)';
      return el('div', { class: 'rowline', style: 'grid-template-columns: 160px 1fr 170px' }, [
        el('span', { class: 'n', text: n.nama }),
        el('div', { class: 'meter', style: '--fillc:' + fillc }, el('i', { style: `width:${n.disk}%` })),
        el('span', { class: 'v', style: 'display:flex;justify-content:flex-end;gap:8px' }, [sv !== 'ok' ? statusIcon(sv) : null, `Disk ${n.disk}%`]),
      ]);
    });
    return panel('server', '5', 'Monitoring Server', sev, [
      kpi({ label: 'Uptime 30 hari', value: nfd(2).format(s.uptime30), unit: '%' }),
      kpi({ label: 'CPU', value: fmt(cpu.c), unit: '%', dl: delta(cpu.c - cpu.p, { unit: ' poin', goodWhenUp: false }) }),
      kpi({ label: 'RAM', value: fmt(ram.c), unit: '%', dl: delta(ram.c - ram.p, { unit: ' poin', goodWhenUp: false }) }),
    ], [
      ...rows,
      el('div', { class: 'foot' }, [
        'Backup: ', el('b', { text: s.backupTerakhir.status === 'berhasil' ? 'berhasil' : 'GAGAL' }), ` (${s.backupTerakhir.waktu}) · SSL: `, el('b', { text: `${s.sslSisaHari} hari lagi` }),
      ]),
    ]);
  }

  function pBlangko(sev) {
    const { B, rows, total, terpakai, rusak, sisa } = blangkoStats();
    const parts = [
      { key: 'terpakai', color: 'var(--s1)' },
      { key: 'rusak', color: 'var(--crit)' },
      { key: 'sisa', color: 'var(--neutral-seg)' },
    ];
    const lines = rows.map((r) =>
      el('div', { class: 'rowline', style: 'grid-template-columns: 215px 1fr 76px; font-size:19px' }, [
        el('span', { class: 'n', text: r.nama.replace('Kartu Identitas Anak (KIA)', 'KIA') }),
        el('div', { class: 'bar' }, parts.map((p) => (r[p.key] ? el('div', { class: 'seg', style: `flex:${r[p.key]} 1 0;background:${p.color}` }) : null))),
        r.rusakCetak > B.ambangRusakPersen ? pill('warning', pct(r.rusakCetak, 1)) : el('span', { class: 'v', text: pct(r.rusakCetak, 1) }),
      ])
    );
    return panel('blangko', '6', 'Monitoring Blangko', sev, [
      kpi({ label: 'Terpakai', value: fmt(terpakai), key: 'var(--s1)', sub: `${pct((terpakai / total) * 100, 0)} dari ${fmt(total)}` }),
      kpi({ label: 'Rusak', value: fmt(rusak), key: 'var(--crit)', sub: `${pct((rusak / total) * 100, 1)} dari total` }),
      kpi({ label: 'Sisa stok', value: fmt(sisa), key: 'var(--neutral-seg)', sub: `${pct((sisa / total) * 100, 0)} dari total` }),
    ], [el('div', { class: 'k-sub', text: 'Per jenis · angka kanan = % rusak dari yang dicetak' }), ...lines]);
  }

  /* ---------- peringatan ---------- */
  let pageTimer = null;
  function renderTicker(alerts) {
    const box = document.getElementById('ticker');
    const nCrit = alerts.filter((a) => a.sev === 'critical').length, nWarn = alerts.length - nCrit;
    const list = el('div', { class: 't-list' });
    const PER = 3, pages = Math.max(1, Math.ceil(alerts.length / PER));
    let page = 0;
    const show = () => {
      list.replaceChildren(
        ...(alerts.length
          ? alerts.slice(page * PER, page * PER + PER).map((a) =>
              el('div', { class: 't-item' }, [
                statusIcon(a.sev),
                el('div', { style: 'min-width:0' }, [
                  el('div', { class: 'a-title', text: `${SEV_LABEL[a.sev]} · ${a.title}` }),
                  el('div', { class: 'a-detail', text: `${a.secName} — ${a.detail}` }),
                ]),
              ])
            )
          : [el('div', { class: 't-ok' }, [statusIcon('ok'), 'Semua laporan dalam batas normal.'])])
      );
    };
    box.replaceChildren(
      el('div', { class: 't-count' }, [
        el('div', { class: 't-title', text: 'Perlu perhatian' }),
        el('div', { class: 't-sub' }, [
          el('span', {}, [statusIcon('critical'), `${nCrit} kritis`]),
          el('span', {}, [statusIcon('warning'), `${nWarn} waspada`]),
          pages > 1 ? el('span', { id: 'pg', text: `1/${pages}` }) : null,
        ]),
      ]),
      list
    );
    show();
    clearInterval(pageTimer);
    if (pages > 1) {
      pageTimer = setInterval(() => {
        list.classList.add('fade');
        setTimeout(() => {
          page = (page + 1) % pages;
          show();
          document.getElementById('pg').textContent = `${page + 1}/${pages}`;
          list.classList.remove('fade');
        }, 350);
      }, PAGE_SEC * 1000);
    }
  }

  /* ---------- render ---------- */
  function render() {
    const alerts = buildAlerts(status);
    const sevOf = (id) => (alerts.find((a) => a.sec === id) || { sev: 'ok' }).sev; // urut: paling parah di depan

    const sel = ps(D.mobile.selesaiHarian, 'sum', 'pengajuan'), kio = ps(D.kiosk.transaksiHarian, 'sum', 'transaksiKiosk');
    const chg = changePct(sel.c + kio.c, sel.p + kio.p);
    document.getElementById('hero').replaceChildren(
      el('div', { class: 'h-label', text: `Layanan digital terselesaikan · ${DAYS} hari${status === 'semua' ? '' : ' · warga ' + statusLabel(status).toLowerCase()}` }),
      el('div', { class: 'h-row' }, [
        el('span', { class: 'h-val', text: fmt(sel.c + kio.c) }),
        el('span', { class: 'h-delta ' + (chg >= 0 ? 'good' : 'bad'), text: (chg >= 0 ? '▲ +' : '▼ −') + nfd(1).format(Math.abs(chg)) + '%' }),
      ])
    );
    document.getElementById('desa').textContent = `${D.meta.desa} · ${D.meta.kecamatan} · ${D.meta.kabupaten}`;
    document.getElementById('demo').hidden = !D.meta.dataContoh;
    const flt = document.getElementById('flt');
    flt.textContent = 'Status: ' + statusLabel(status);
    flt.style.setProperty('--fc', status === 'semua' ? 'var(--muted)' : STATUS_COLOR[status]);

    mounts.length = 0;
    document.getElementById('grid').replaceChildren(
      pMobile(sevOf('mobile')), pKiosk(sevOf('kiosk')), pAset(sevOf('aset')),
      pWarga(sevOf('warga')), pServer(sevOf('server')), pBlangko(sevOf('blangko'))
    );
    mounts.forEach((f) => f());
    renderTicker(alerts);
  }

  function tick() {
    const now = new Date();
    document.getElementById('time').textContent = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }).replace('.', ':');
    document.getElementById('date').textContent = now.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }

  // filter status: klik tombol atau panah kiri/kanan
  function setStatus(next) {
    status = next;
    try {
      const u = new URL(location.href);
      if (status === 'semua') u.searchParams.delete('status'); else u.searchParams.set('status', status);
      history.replaceState(null, '', u);
    } catch (e) { /* abaikan */ }
    render();
  }
  const cycle = (dir) => {
    const i = STATUS.findIndex((x) => x.key === status);
    setStatus(STATUS[(i + dir + STATUS.length) % STATUS.length].key);
  };
  document.getElementById('flt').addEventListener('click', () => cycle(1));
  addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') cycle(1);
    else if (e.key === 'ArrowLeft') cycle(-1);
  });

  render();
  tick();
  setInterval(tick, 10000);
  // Titik sambung data nyata: ambil ulang data (mis. fetch ke API) sebelum render().
  setInterval(render, REFRESH_MIN * 60 * 1000);

  // sembunyikan kursor bila diam 3 detik
  let idle;
  const wake = () => { document.body.classList.remove('idle'); clearTimeout(idle); idle = setTimeout(() => document.body.classList.add('idle'), 3000); };
  addEventListener('mousemove', wake);
  wake();
})();
