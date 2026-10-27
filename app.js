(() => {
  'use strict';

  const D = window.DASHBOARD_DATA;
  const {
    nfd, fmt, fmt1, pct, compact, rupiah, sum, avg, clamp, slice, changePct, dShort, dLong,
    el, SEV_LABEL, statusIcon, pill, blangkoStats, buildAlerts,
    W, wargaAll, ready, kpis, petaTitik, petaCounts, petaGeo,
  } = window.DashLib;
  const UI = window.DashUI;

  /* ============================== tooltip ============================== */
  const tip = (() => {
    const box = el('div', { id: 'tip', role: 'tooltip', hidden: true });
    document.body.append(box);
    return {
      show(x, y, title, rows) {
        box.replaceChildren(el('div', { class: 'tip-title', text: title }));
        rows.forEach((r) =>
          box.append(
            el('div', { class: 'tip-row' }, [
              r.color ? el('span', { class: 'tip-key', style: 'background:' + r.color }) : null,
              el('span', { class: 'tip-val', text: r.value }),
              r.name ? el('span', { class: 'tip-name', text: r.name }) : null,
            ])
          )
        );
        box.hidden = false;
        const w = box.offsetWidth, h = box.offsetHeight;
        let left = x + 14, top = y - h - 12;
        if (left + w > innerWidth - 8) left = x - w - 14;
        if (left < 8) left = 8;
        if (top < 8) top = y + 18;
        box.style.left = left + 'px';
        box.style.top = top + 'px';
      },
      hide() { box.hidden = true; },
    };
  })();
  function attachHover(node, getContent) {
    const at = (x, y) => { const c = getContent(); tip.show(x, y, c.title, c.rows); };
    node.addEventListener('pointermove', (e) => at(e.clientX, e.clientY));
    node.addEventListener('pointerleave', tip.hide);
    node.addEventListener('focus', () => { const r = node.getBoundingClientRect(); at(r.left + r.width / 2, r.top); });
    node.addEventListener('blur', tip.hide);
  }

  /* ============================== komponen ============================== */
  function legendEl(items) {
    return el('div', { class: 'legend' },
      items.map((it) =>
        el('span', {}, [el('i', { class: it.kind === 'line' ? 'line' : 'box', style: 'background:' + it.color }), it.name])
      )
    );
  }

  function tableEl(headers, rows, { tall = false, numCols = [] } = {}) {
    const t = el('table', {}, [
      el('thead', {}, el('tr', {}, headers.map((h, i) => el('th', { scope: 'col', class: numCols.includes(i) ? 'num' : '', text: h })))),
      el('tbody', {}, rows.map((r) =>
        el('tr', {}, r.map((c, i) => el('td', { class: numCols.includes(i) ? 'num' : '' }, c)))
      )),
    ]);
    return el('div', { class: 'tablewrap' + (tall ? ' tall' : ''), tabindex: tall ? null : 0 }, t);
  }

  /** Kartu: judul + isi grafik, dengan tombol "Tabel" yang menukar ke tampilan tabel (data yang sama). */
  function card({ title, sub, build, table, tableOnly }) {
    const body = el('div', { class: 'card-body' });
    const chartHost = el('div', {});
    body.append(chartHost);
    const head = el('div', { class: 'card-head' }, [el('div', {}, [el('h3', { text: title }), sub ? el('p', { text: sub }) : null])]);
    const root = el('article', { class: 'card' }, [head, body]);
    if (tableOnly) {
      chartHost.append(tableEl(...tableOnly));
      return root;
    }
    build(chartHost);
    if (table) {
      const tbl = el('div', { hidden: true }, tableEl(...table));
      const btn = el('button', { class: 'btn', type: 'button', 'aria-pressed': 'false', text: 'Tabel' });
      btn.addEventListener('click', () => {
        const on = btn.getAttribute('aria-pressed') !== 'true';
        btn.setAttribute('aria-pressed', String(on));
        btn.textContent = on ? 'Grafik' : 'Tabel';
        tbl.hidden = !on;
        chartHost.hidden = on;
      });
      head.append(btn);
      body.append(tbl);
    }
    return root;
  }

  function niceCeil(max, n = 4) {
    if (max <= 0) return { top: 1, ticks: [0, 1] };
    const raw = max / n, mag = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / mag;
    const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * mag;
    const top = Math.ceil(max / step - 1e-9) * step;
    const ticks = [];
    for (let v = 0; v <= top + 1e-9; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
    return { top, ticks };
  }

  /** Grafik garis/area, satu sumbu. Crosshair + tooltip untuk semua seri di titik X terdekat. */
  function lineChart(host, o) {
    const { dates, series, yFmt = compact, valFmt = fmt, ticks: fixedTicks, yMax, height = 230, label } = o;
    host.replaceChildren();
    if (series.length > 1) host.append(legendEl(series.map((s) => ({ name: s.name, color: s.color, kind: 'line' }))));
    const wrap = el('div', { class: 'plot' });
    host.append(wrap);
    let lastW = 0;

    const draw = () => {
      const W = Math.floor(wrap.clientWidth);
      if (W < 60) return;
      lastW = W;
      wrap.replaceChildren();
      const H = height, m = { l: 42, r: 54, t: 12, b: 26 };
      const iw = W - m.l - m.r, ih = H - m.t - m.b, n = dates.length;
      const nt = fixedTicks ? { top: yMax, ticks: fixedTicks } : niceCeil(Math.max(...series.flatMap((s) => s.values)));
      const x = (i) => m.l + (n === 1 ? iw / 2 : (i / (n - 1)) * iw);
      const y = (v) => m.t + ih - (v / nt.top) * ih;
      const svg = el('svg:svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', 'aria-label': label, tabindex: 0 });

      nt.ticks.forEach((t) =>
        svg.append(
          el('svg:line', { x1: m.l, x2: W - m.r, y1: y(t), y2: y(t), class: t === 0 ? 'axis' : 'grid' }),
          el('svg:text', { x: m.l - 8, y: y(t) + 4, 'text-anchor': 'end', class: 'tick', text: yFmt(t) })
        )
      );
      const k = Math.min(W < 420 ? 3 : 5, n);
      for (let j = 0; j < k; j++) {
        const i = Math.round((j * (n - 1)) / (k - 1 || 1));
        svg.append(el('svg:text', {
          x: x(i), y: H - 6, class: 'tick', text: dShort(dates[i]),
          'text-anchor': j === 0 ? 'start' : j === k - 1 ? 'end' : 'middle',
        }));
      }

      const ends = [];
      series.forEach((s) => {
        const d = s.values.map((v, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1)).join('');
        if (series.length === 1)
          svg.append(el('svg:path', { d: d + `L${x(n - 1).toFixed(1)} ${y(0)}L${x(0).toFixed(1)} ${y(0)}Z`, style: `fill:${s.color}`, 'fill-opacity': 0.1 }));
        svg.append(el('svg:path', { d, fill: 'none', style: `stroke:${s.color}`, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
        const ly = y(s.values[n - 1]);
        svg.append(el('svg:circle', { cx: x(n - 1), cy: ly, r: 4, style: `fill:${s.color};stroke:var(--surface);stroke-width:2` }));
        ends.push({ y: ly, text: valFmt(s.values[n - 1]) });
      });
      let lastY = -99;
      ends.sort((a, b) => a.y - b.y).forEach((e) => {
        if (e.y - lastY < 14) return; // label bertabrakan: biarkan legenda + tooltip yang membawa
        lastY = e.y;
        svg.append(el('svg:text', { x: x(n - 1) + 10, y: e.y + 4, class: 'endlabel', text: e.text }));
      });

      const hov = el('svg:g', { style: 'display:none' });
      const vline = el('svg:line', { y1: m.t, y2: m.t + ih, class: 'cross' });
      const dots = series.map((s) => el('svg:circle', { r: 4, style: `fill:${s.color};stroke:var(--surface);stroke-width:2` }));
      hov.append(vline, ...dots);
      const overlay = el('svg:rect', { x: m.l, y: m.t, width: iw, height: ih, fill: 'transparent' });
      svg.append(hov, overlay);

      const showAt = (i, cx, cy) => {
        hov.style.display = '';
        vline.setAttribute('x1', x(i)); vline.setAttribute('x2', x(i));
        dots.forEach((c, si) => { c.setAttribute('cx', x(i)); c.setAttribute('cy', y(series[si].values[i])); });
        tip.show(cx, cy, dLong(dates[i]), series.map((s) => ({ color: s.color, name: s.name, value: valFmt(s.values[i]) })));
      };
      const hide = () => { hov.style.display = 'none'; tip.hide(); };
      overlay.addEventListener('pointermove', (e) => {
        const r = svg.getBoundingClientRect();
        showAt(clamp(Math.round(((e.clientX - r.left - m.l) / iw) * (n - 1)), 0, n - 1), e.clientX, e.clientY);
      });
      overlay.addEventListener('pointerleave', hide);
      let kb = n - 1;
      const kbShow = () => {
        const r = svg.getBoundingClientRect();
        showAt(kb, r.left + x(kb), r.top + y(series[0].values[kb]));
      };
      svg.addEventListener('focus', () => { kb = n - 1; kbShow(); });
      svg.addEventListener('blur', hide);
      svg.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowLeft') kb = Math.max(0, kb - 1);
        else if (e.key === 'ArrowRight') kb = Math.min(n - 1, kb + 1);
        else return;
        e.preventDefault();
        kbShow();
      });
      wrap.append(svg);
    };

    draw();
    new ResizeObserver(() => { if (Math.floor(wrap.clientWidth) !== lastW) draw(); }).observe(wrap);
  }

  /** Batang horizontal satu seri. Nilai di ujung batang; batang <= 14px. */
  function hbarChart(host, { items, valFmt = fmt, color = 'var(--s1)', unit = '' }) {
    const mx = Math.max(...items.map((i) => i.value), 1);
    const list = el('div', { class: 'hbars' });
    items.forEach((it) => {
      const row = el('div', { class: 'hbar-row', tabindex: 0, role: 'group', 'aria-label': `${it.label}: ${valFmt(it.value)}${unit}` }, [
        el('div', { class: 'hbar-label', text: it.label }),
        el('div', { class: 'hbar-track' }, [
          el('div', { class: 'hbar-fill', style: `width:${((it.value / mx) * 78).toFixed(2)}%;background:${it.color || color}` }),
          el('span', { class: 'hbar-val', text: valFmt(it.value) + unit }),
        ]),
      ]);
      attachHover(row, () => ({ title: it.label, rows: [{ color: it.color || color, value: valFmt(it.value) + unit, name: it.hint || '' }] }));
      list.append(row);
    });
    host.replaceChildren(list);
  }

  /** Batang bertumpuk 100% per baris (komposisi), jeda 2px antar segmen. */
  function stackChart(host, { parts, rows, active }) {
    host.replaceChildren(legendEl(parts.map((p) => ({ name: p.name, color: p.color }))));
    const list = el('div', { class: 'stack-rows' });
    rows.forEach((r) => {
      const total = sum(parts.map((p) => r.values[p.key] || 0));
      const bar = el('div', { class: 'stack-bar' });
      parts.forEach((p) => {
        const v = r.values[p.key] || 0;
        if (!v) return;
        bar.append(el('div', { class: 'stack-seg' + (active && !active.includes(p.key) ? ' dim' : ''), style: `flex:${v} 1 0;background:${p.color}` }));
      });
      const row = el('div', { class: 'stack-row', tabindex: 0, role: 'group', 'aria-label': r.label + ': ' + parts.map((p) => `${p.name} ${fmt(r.values[p.key] || 0)}`).join(', ') }, [
        el('div', { class: 'stack-top' }, [el('span', { class: 'l', text: r.label }), el('span', { class: 'r', text: r.right || '' })]),
        bar,
      ]);
      attachHover(row, () => ({
        title: r.label,
        rows: parts.map((p) => {
          const v = r.values[p.key] || 0;
          return { color: p.color, name: p.name, value: `${fmt(v)} (${pct(total ? (v / total) * 100 : 0)})` };
        }),
      }));
      list.append(row);
    });
    host.append(list);
  }

  /** Meter: isi berubah warna menurut tingkat keparahan; trek = langkah lebih terang dari warna isi. */
  function meterEl({ label, value, valText, sev = 'ok' }) {
    const fillc = sev === 'critical' ? 'var(--crit)' : sev === 'warning' ? 'var(--warn)' : 'var(--s1)';
    return el('div', { class: 'meter', style: '--fillc:' + fillc }, [
      el('div', { class: 'meter-top' }, [
        el('span', { class: 'l', text: label }),
        el('span', { class: 'v' }, [sev !== 'ok' ? pill(sev) : null, valText]),
      ]),
      el('div', { class: 'meter-track', role: 'meter', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': Math.round(value), 'aria-label': label },
        el('div', { class: 'meter-fill', style: `width:${clamp(value, 0, 100)}%` })),
    ]);
  }

  function bucket(values, k, mode) {
    k = Math.min(k, values.length);
    const out = [];
    for (let b = 0; b < k; b++) {
      const part = values.slice(Math.floor((b * values.length) / k), Math.floor(((b + 1) * values.length) / k));
      out.push(mode === 'sum' ? sum(part) : avg(part));
    }
    return out;
  }
  function sparkline(values) {
    const w = 84, h = 30, p = 4, mn = Math.min(...values), mx = Math.max(...values), rg = mx - mn || 1;
    const pt = (v, i) => [p + (i / (values.length - 1 || 1)) * (w - 2 * p), h - p - ((v - mn) / rg) * (h - 2 * p)];
    const pts = values.map(pt);
    const line = (a) => a.map((q, i) => (i ? 'L' : 'M') + q[0].toFixed(1) + ' ' + q[1].toFixed(1)).join('');
    const last = pts[pts.length - 1];
    return el('svg:svg', { class: 'spark', viewBox: `0 0 ${w} ${h}`, width: w, height: h, 'aria-hidden': 'true' }, [
      el('svg:path', { d: line(pts), fill: 'none', style: 'stroke:var(--muted)', 'stroke-width': 1.5, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }),
      pts.length > 1 ? el('svg:path', { d: line(pts.slice(-2)), fill: 'none', style: 'stroke:var(--s1)', 'stroke-width': 2, 'stroke-linecap': 'round' }) : null,
      el('svg:circle', { cx: last[0], cy: last[1], r: 3.5, style: 'fill:var(--s1);stroke:var(--surface);stroke-width:2' }),
    ]);
  }

  /** Stat tile: label · nilai · delta (bertanda, vs periode bernama) · tren opsional. */
  function tile({ label, value, sub, delta, goodWhenUp = true, spark, sev }) {
    let deltaEl = null;
    if (delta) {
      const v = delta.value;
      const flat = Math.abs(v) < 0.05;
      const up = v > 0;
      const good = flat ? null : up === goodWhenUp;
      deltaEl = el('div', { class: 't-delta' }, [
        el('span', { class: 'd ' + (good == null ? '' : good ? 'good' : 'bad'), text: flat ? '■ stabil' : (up ? '▲ +' : '▼ −') + nfd(1).format(Math.abs(v)) + (delta.unit || '%') }),
        ' ' + delta.vs,
      ]);
    }
    return el('article', { class: 'card tile' }, [
      el('div', { class: 't-label', text: label }),
      el('div', { class: 't-row' }, [el('div', { class: 't-val', text: value }), spark ? sparkline(spark) : null]),
      sev ? el('div', { class: 't-sub' }, pill(sev)) : null,
      sub ? el('div', { class: 't-sub', text: sub }) : null,
      deltaEl,
    ]);
  }

  /* ============================== kalkulasi ============================== */
  const state = { days: 30 };
  const vsText = () => `vs ${state.days} hari sebelumnya`;
  function periodStats(arr, mode = 'sum') {
    const cur = slice(arr, state.days), prev = slice(arr, state.days, state.days);
    const f = mode === 'sum' ? sum : avg;
    return { cur, prev, c: f(cur), p: f(prev), chg: changePct(f(cur), f(prev)) };
  }
  const dates = () => slice(D.tanggal, state.days);

  /* ============================== seksi ============================== */
  function section(id, num, title, insight, ...children) {
    return el('section', { class: 'sec', id, 'aria-labelledby': id + '-h' }, [
      el('div', { class: 'sec-head' }, [
        el('span', { class: 'sec-num', 'aria-hidden': 'true', text: num }),
        el('div', {}, [
          el('h2', { id: id + '-h', text: title }),
          el('p', { class: 'insight', text: insight }),
        ]),
      ]),
      ...children,
    ]);
  }
  const tiles = (...t) => el('div', { class: 'tiles' }, t);
  const grid2 = (...c) => el('div', { class: 'grid2' }, c);

  function secMobile() {
    const m = D.mobile;
    const aktif = periodStats(m.penggunaAktifHarian, 'avg');
    const aju = periodStats(m.pengajuanHarian);
    const sel = periodStats(m.selesaiHarian);
    const rate = (sel.c / (aju.c || 1)) * 100, ratePrev = (sel.p / (aju.p || 1)) * 100;
    const jumlahWarga = D.warga.records.length;
    const terdaftarPct = (m.wargaTerdaftar / (jumlahWarga || 1)) * 100;
    const insight = `Rata-rata ${fmt(aktif.c)} pengguna aktif per hari (${aktif.chg >= 0 ? 'naik' : 'turun'} ${fmt1(Math.abs(aktif.chg))}% vs ${state.days} hari sebelumnya); ${fmt(aju.c)} pengajuan layanan masuk, ${pct(rate, 0)} sudah selesai.`;

    const jenis = m.pengajuanPerJenis.map((j) => ({ label: j.label, value: Math.round(j.bobot * aju.c) }));
    return section('mobile', '1', 'Aplikasi Mobile Warga', insight,
      tiles(
        tile({ label: 'Pengguna aktif harian (rata-rata)', value: fmt(aktif.c), delta: { value: aktif.chg, vs: vsText() }, spark: bucket(aktif.cur, 12, 'avg') }),
        tile({ label: 'Pengajuan layanan', value: fmt(aju.c), delta: { value: aju.chg, vs: vsText() }, spark: bucket(aju.cur, 12, 'sum') }),
        tile({ label: 'Pengajuan selesai', value: pct(rate, 0), delta: { value: rate - ratePrev, unit: ' poin', vs: vsText() }, sub: `${fmt(sel.c)} dari ${fmt(aju.c)} pengajuan` }),
        tile({ label: 'Warga terdaftar di aplikasi', value: fmt(m.wargaTerdaftar), sub: `${pct(terdaftarPct, 0)} dari ${fmt(jumlahWarga)} penduduk · rating ${nfd(1).format(m.rating)}/5 (${fmt(m.jumlahUlasan)} ulasan)` }),
        tile({ label: 'Pengaduan warga terbuka', value: fmt(m.pengaduanTerbuka), sev: m.pengaduanLebih7Hari ? 'warning' : null, sub: m.pengaduanLebih7Hari ? `${m.pengaduanLebih7Hari} belum ditangani lebih dari 7 hari` : 'Semua ditangani < 7 hari' }),
      ),
      grid2(
        card({
          title: 'Pengguna aktif per hari', sub: `${state.days} hari terakhir`,
          build: (h) => lineChart(h, { dates: dates(), series: [{ name: 'Pengguna aktif', color: 'var(--s1)', values: aktif.cur }], label: 'Grafik pengguna aktif harian aplikasi warga' }),
          table: [['Tanggal', 'Pengguna aktif'], dates().map((d, i) => [dLong(d), fmt(aktif.cur[i])]).reverse(), { numCols: [1] }],
        }),
        card({
          title: 'Pengajuan layanan menurut jenis', sub: `Total ${fmt(aju.c)} dalam ${state.days} hari`,
          build: (h) => hbarChart(h, { items: jenis }),
          table: [['Jenis', 'Pengajuan'], jenis.map((j) => [j.label, fmt(j.value)]), { numCols: [1] }],
        })
      )
    );
  }

  function secKiosk() {
    const k = D.kiosk;
    const tr = periodStats(k.transaksiHarian);
    const online = k.perangkat.filter((p) => p.status === 'online').length;
    const offline = k.perangkat.length - online;
    const lowPaper = k.perangkat.filter((p) => p.kertasPersen < 20);
    const insight = `${online} dari ${k.perangkat.length} kiosk online. ${fmt(tr.c)} transaksi dalam ${state.days} hari (${tr.chg >= 0 ? 'naik' : 'turun'} ${fmt1(Math.abs(tr.chg))}%).${offline ? ' Ada kiosk yang perlu dicek petugas.' : ''}`;
    const layanan = k.layananPopuler.map((j) => ({ label: j.label, value: Math.round(j.bobot * tr.c) }));
    const sevOf = (s) => (s === 'online' ? 'ok' : 'critical');

    return section('kiosk', '2', 'Aplikasi Kiosk', insight,
      tiles(
        tile({ label: 'Kiosk online', value: `${online} / ${k.perangkat.length}`, sev: offline ? 'critical' : null, sub: offline ? `${offline} kiosk offline` : 'Semua kiosk aktif' }),
        tile({ label: 'Transaksi layanan', value: fmt(tr.c), delta: { value: tr.chg, vs: vsText() }, spark: bucket(tr.cur, 12, 'sum') }),
        tile({ label: 'Waktu layanan rata-rata', value: nfd(1).format(k.waktuLayananMenit) + ' mnt', sub: 'per transaksi' }),
        tile({ label: 'Kertas hampir habis', value: fmt(lowPaper.length), sev: lowPaper.length ? 'warning' : null, sub: lowPaper.length ? lowPaper.map((p) => p.nama.replace('Kiosk ', '')).join(', ') : 'Stok kertas aman' }),
      ),
      grid2(
        card({
          title: 'Transaksi kiosk per hari', sub: `${state.days} hari terakhir`,
          build: (h) => lineChart(h, { dates: dates(), series: [{ name: 'Transaksi', color: 'var(--s1)', values: tr.cur }], label: 'Grafik transaksi kiosk harian' }),
          table: [['Tanggal', 'Transaksi'], dates().map((d, i) => [dLong(d), fmt(tr.cur[i])]).reverse(), { numCols: [1] }],
        }),
        card({
          title: 'Layanan paling banyak dipakai', sub: `Perkiraan dari ${fmt(tr.c)} transaksi`,
          build: (h) => hbarChart(h, { items: layanan }),
          table: [['Layanan', 'Transaksi'], layanan.map((j) => [j.label, fmt(j.value)]), { numCols: [1] }],
        })
      ),
      card({
        title: 'Status tiap kiosk', sub: 'Kondisi saat ini',
        tableOnly: [
          ['Kiosk', 'Lokasi', 'Status', 'Uptime 30 hari', 'Transaksi hari ini', 'Kertas', 'Catatan'],
          k.perangkat.map((p) => [p.nama, p.lokasi, pill(sevOf(p.status), p.status === 'online' ? 'Online' : 'Offline'), pct(p.uptime30), fmt(p.transaksiHariIni),
            p.kertasPersen < 20 ? pill('warning', pct(p.kertasPersen, 0)) : pct(p.kertasPersen, 0), p.catatan]),
          { tall: true, numCols: [3, 4] },
        ],
      })
    );
  }

  function secAset() {
    const cats = D.aset.kategori;
    const tot = (key) => sum(cats.map((c) => c[key]));
    const baik = tot('baik'), perb = tot('perbaikan'), rusak = tot('rusak'), all = baik + perb + rusak;
    const nilai = sum(cats.map((c) => c.nilai));
    const insight = `${fmt(all)} unit aset tercatat; ${pct((baik / all) * 100, 0)} dalam kondisi baik. ${fmt(perb)} unit perlu perbaikan dan ${fmt(rusak)} unit rusak menunggu keputusan perbaikan atau penghapusan.`;
    const parts = [
      { key: 'baik', name: 'Baik', color: 'var(--good)' },
      { key: 'perbaikan', name: 'Perlu perbaikan', color: 'var(--warn)' },
      { key: 'rusak', name: 'Rusak', color: 'var(--crit)' },
    ];
    const rows = cats.map((c) => ({
      label: c.nama, values: { baik: c.baik, perbaikan: c.perbaikan, rusak: c.rusak },
      right: `${fmt(c.baik + c.perbaikan + c.rusak)} unit · ${rupiah(c.nilai)}`,
    }));
    const kondisi = { rusak: ['critical', 'Rusak'], perbaikan: ['warning', 'Perlu perbaikan'] };
    return section('aset', '3', 'Inventaris Aset Desa', insight,
      tiles(
        tile({ label: 'Total aset tercatat', value: fmt(all), sub: 'unit, semua kategori' }),
        tile({ label: 'Nilai aset', value: rupiah(nilai), sub: 'perkiraan nilai tercatat' }),
        tile({ label: 'Kondisi baik', value: pct((baik / all) * 100, 0), sub: `${fmt(baik)} dari ${fmt(all)} unit` }),
        tile({ label: 'Perlu perbaikan', value: fmt(perb), sev: perb ? 'warning' : null, sub: 'unit' }),
        tile({ label: 'Rusak', value: fmt(rusak), sev: rusak ? 'critical' : null, sub: 'unit menunggu keputusan' }),
      ),
      grid2(
        card({
          title: 'Kondisi aset per kategori', sub: 'Komposisi kondisi, 100% = seluruh unit di kategori itu',
          build: (h) => stackChart(h, { parts, rows }),
          table: [['Kategori', 'Baik', 'Perlu perbaikan', 'Rusak', 'Nilai'], cats.map((c) => [c.nama, fmt(c.baik), fmt(c.perbaikan), fmt(c.rusak), rupiah(c.nilai)]), { numCols: [1, 2, 3, 4] }],
        }),
        card({
          title: 'Aset yang perlu perhatian', sub: 'Prioritas tindak lanjut',
          tableOnly: [['Aset', 'Kondisi', 'Lokasi', 'Catatan'],
            D.aset.perluPerhatian.map((a) => [el('span', {}, [a.nama, el('div', { class: 't-sub', text: a.kategori })]), pill(kondisi[a.kondisi][0], kondisi[a.kondisi][1]), a.lokasi, a.catatan]),
            {}],
        })
      )
    );
  }

  /* ============================== data kependudukan (SIAK) ============================== */
  // Filter bertahan antar render ulang (ganti periode); dibaca dari URL saat halaman dibuka.
  const wf = { f: W.filterFromParams(new URLSearchParams(location.search)), page: 0, sort: { key: 'nama', dir: 1 } };
  const covSev = (p) => (p >= 90 ? 'ok' : p >= 75 ? 'warning' : 'critical');
  const pendLabel = (r) => (r.pend == null ? '—' : W.PEND_LEVELS[r.pend]);
  const jkLabel = (jk) => (jk === 'L' ? 'Laki-laki' : jk === 'P' ? 'Perempuan' : '—');

  function kartuCell(wajib, sudah, belum) {
    if (!wajib) return 'Tidak wajib';
    if (sudah) return pill('ok', 'Sudah');
    if (belum) return pill('warning', 'Belum');
    return '—';
  }

  /* ---- dialog detail: isi data satu warga ---- */
  let dlg = null;
  function openDetail(r, all) {
    if (!dlg) {
      dlg = el('dialog', { class: 'detail', 'aria-labelledby': 'detail-h' });
      dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
      document.body.append(dlg);
    }
    let reveal = false;
    const nikEl = el('span', { text: W.maskNik(r.nik) });
    const nikBtn = el('button', { type: 'button', class: 'btn', text: 'Tampilkan', 'aria-pressed': 'false' });
    nikBtn.addEventListener('click', () => {
      reveal = !reveal;
      nikEl.textContent = reveal ? r.nik || '—' : W.maskNik(r.nik);
      nikBtn.textContent = reveal ? 'Sembunyikan' : 'Tampilkan';
      nikBtn.setAttribute('aria-pressed', String(reveal));
    });
    const row = (k, v) => [el('dt', { text: k }), el('dd', {}, v == null || v === '' ? '—' : v)];
    const kartu = (wajib, sudah, belum, ya) => (!wajib ? 'Tidak wajib pada usia/status ini' : sudah ? 'Sudah punya' : belum ? 'Belum punya (wajib)' : ya);
    const keluarga = r.noKK ? all.filter((x) => x.noKK === r.noKK) : [];
    dlg.replaceChildren(
      el('div', { class: 'detail-head' }, [
        el('div', {}, [
          el('h3', { id: 'detail-h', text: r.nama }),
          el('p', { text: `${r.usia == null ? '—' : r.usia + ' tahun'} · ${jkLabel(r.jk)} · ${r.status ? W.statusLabel(r.status) : r.statusKawin || '—'}` }),
        ]),
        el('button', { type: 'button', class: 'btn', text: 'Tutup', onclick: null }),
      ]),
      el('p', { class: 'detail-warn', text: 'Data pribadi. Jangan ditampilkan di layar umum atau dibagikan tanpa dasar tugas.' }),
      el('div', { class: 'detail-body' }, [
        el('section', {}, [el('h4', { text: 'Identitas' }), el('dl', { class: 'kv2' }, [
          ...row('NIK', el('span', { class: 'nikrow' }, [nikEl, nikBtn])), ...row('No. KK', r.noKK),
          ...row('Tempat, tanggal lahir', [r.tempatLahir, r.tglLahir].filter(Boolean).join(', ')),
          ...row('Jenis kelamin', jkLabel(r.jk)), ...row('Agama', r.agama), ...row('Golongan darah', r.golDarah),
        ])]),
        el('section', {}, [el('h4', { text: 'Kependudukan' }), el('dl', { class: 'kv2' }, [
          ...row('Status perkawinan', r.statusKawin ? r.statusKawin + (r.status && /^CERAI/.test(r.statusKawin) ? ` (${W.statusLabel(r.status)})` : '') : ''),
          ...row('Hubungan dalam keluarga', r.hubungan), ...row('Alamat', r.alamat),
          ...row('Dusun', r.dusun), ...row('RT / RW', [r.rt, r.rw].filter(Boolean).join(' / ')),
        ])]),
        el('section', {}, [el('h4', { text: 'Pendidikan & pekerjaan' }), el('dl', { class: 'kv2' }, [
          ...row('Pendidikan terakhir', pendLabel(r) === '—' ? '' : pendLabel(r)), ...row('Pekerjaan', r.pekerjaan),
        ])]),
        el('section', {}, [el('h4', { text: 'Dokumen' }), el('dl', { class: 'kv2' }, [
          ...row('KTP-el', kartu(r.ktpWajib, r.ktpSudah, r.ktpBelum, 'Status tidak ada di sumber data')),
          ...row('KIA', kartu(r.kiaWajib, r.kiaSudah, r.kiaBelum, 'Status tidak ada di sumber data')),
          ...(r.aplikasi == null ? [] : row('Terdaftar di aplikasi warga', r.aplikasi ? 'Ya' : 'Belum')),
        ])]),
        el('section', { class: 'span2' }, [
          el('h4', { text: `Anggota keluarga dalam KK ini (${keluarga.length})` }),
          keluarga.length
            ? el('ul', { class: 'fam' }, keluarga.slice(0, 15).map((m) =>
                el('li', { class: m === r ? 'me' : '' }, `${m.nama} · ${m.hubungan || '—'} · ${m.usia == null ? '—' : m.usia + ' th'}${m === r ? ' (dipilih)' : ''}`)))
            : el('p', { class: 't-sub', text: 'Nomor KK tidak terisi.' }),
        ]),
      ])
    );
    dlg.querySelector('.detail-head .btn').addEventListener('click', () => dlg.close());
    dlg.showModal();
  }

  /* ---- tabel daftar warga: urut, halaman, klik nama untuk melihat isi ---- */
  const SORTERS = {
    nama: (a, b) => a.nama.localeCompare(b.nama, 'id'),
    usia: (a, b) => (a.usia ?? -1) - (b.usia ?? -1),
    status: (a, b) => (a.status || '').localeCompare(b.status || ''),
    pend: (a, b) => (a.pend ?? -1) - (b.pend ?? -1),
    dusun: (a, b) => (a.dusun || '').localeCompare(b.dusun || '', 'id'),
  };
  function wargaTable(rows, all) {
    const PER = 20, box = el('div', {});
    const draw = () => {
      const srt = SORTERS[wf.sort.key];
      const sorted = [...rows].sort((a, b) => srt(a, b) * wf.sort.dir);
      const pages = Math.max(1, Math.ceil(sorted.length / PER));
      wf.page = clamp(wf.page, 0, pages - 1);
      const view = sorted.slice(wf.page * PER, wf.page * PER + PER);
      const th = (label, key) => {
        const on = wf.sort.key === key;
        const b = el('button', { type: 'button', class: 'sortbtn', text: label + (on ? (wf.sort.dir > 0 ? ' ▲' : ' ▼') : '') });
        b.addEventListener('click', () => { wf.sort = { key, dir: on ? -wf.sort.dir : 1 }; wf.page = 0; draw(); });
        return el('th', { scope: 'col', 'aria-sort': on ? (wf.sort.dir > 0 ? 'ascending' : 'descending') : 'none' }, b);
      };
      const rowsEl = view.map((r) => {
        const open = el('button', { type: 'button', class: 'linkbtn', text: r.nama });
        open.addEventListener('click', () => openDetail(r, all));
        return el('tr', {}, [
          el('td', {}, open), el('td', { class: 'nowrap mono', text: W.maskNik(r.nik) }), el('td', { text: r.jk || '—' }),
          el('td', { class: 'num', text: r.usia == null ? '—' : String(r.usia) }),
          el('td', { class: 'nowrap', text: r.status ? W.statusLabel(r.status) : '—' }), el('td', { text: pendLabel(r) }), el('td', { text: r.dusun || '—' }),
          el('td', { class: 'nowrap' }, kartuCell(r.ktpWajib, r.ktpSudah, r.ktpBelum)), el('td', { class: 'nowrap' }, kartuCell(r.kiaWajib, r.kiaSudah, r.kiaBelum)),
        ]);
      });
      const first = sorted.length ? wf.page * PER + 1 : 0;
      const prev = el('button', { type: 'button', class: 'btn', text: 'Sebelumnya' }), next = el('button', { type: 'button', class: 'btn', text: 'Berikutnya' });
      prev.disabled = wf.page === 0; next.disabled = wf.page >= pages - 1;
      prev.addEventListener('click', () => { wf.page--; draw(); });
      next.addEventListener('click', () => { wf.page++; draw(); });
      box.replaceChildren(
        el('div', { class: 'tablewrap tall' }, el('table', {}, [
          el('thead', {}, el('tr', {}, [th('Nama', 'nama'), el('th', { scope: 'col', text: 'NIK' }), el('th', { scope: 'col', text: 'JK' }), th('Usia', 'usia'), th('Status', 'status'), th('Pendidikan', 'pend'), th('Dusun', 'dusun'), el('th', { scope: 'col', text: 'KTP-el' }), el('th', { scope: 'col', text: 'KIA' })])),
          el('tbody', {}, rowsEl.length ? rowsEl : el('tr', {}, el('td', { colspan: 9, text: 'Tidak ada warga yang cocok dengan filter.' }))),
        ])),
        el('div', { class: 'pager' }, [el('span', { text: `${fmt(first)}–${fmt(Math.min(sorted.length, wf.page * PER + PER))} dari ${fmt(sorted.length)} warga` }), el('span', { class: 'pager-btns' }, [prev, next])])
      );
    };
    draw();
    return box;
  }

  /* ---- hasil: tile, grafik, tabel mengikuti filter ---- */
  function renderResults(host, rows, all) {
    const a = W.aggregate(rows), tot = all.length;
    const cov = (c, label, nama) => tile({
      label, value: c.wajib ? pct(c.pct, 1) : '—',
      sev: c.wajib && c.belum ? (c.pct < 75 ? 'critical' : 'warning') : null,
      sub: c.wajib ? `${fmt(c.sudah)} dari ${fmt(c.wajib)} wajib · ${fmt(c.belum)} belum` : `Tidak ada warga wajib ${nama} di hasil ini (atau status tidak ada di sumber data)`,
    });
    const statusItems = a.status.map((s) => ({ label: s.label, value: s.value, color: W.STATUS_COLOR[s.key] }));
    const covRows = [['KTP-el', a.ktp], ['KIA', a.kia]];
    const tbl = (head, items) => [head, items.map((i) => [i.label, fmt(i.value), pct(a.n ? (i.value / a.n) * 100 : 0)]), { numCols: [1, 2] }];

    host.replaceChildren(
      tiles(
        tile({ label: 'Warga sesuai filter', value: fmt(a.n), sub: `${pct(tot ? (a.n / tot) * 100 : 0, 1)} dari ${fmt(tot)} warga · ${fmt(a.lakiLaki)} laki-laki · ${fmt(a.perempuan)} perempuan` }),
        tile({ label: 'Kartu Keluarga terkait', value: fmt(a.kk), sub: `rata-rata ${nfd(1).format(a.n / (a.kk || 1))} warga per KK` }),
        cov(a.ktp, 'Cakupan KTP-el', 'KTP-el'),
        cov(a.kia, 'Cakupan KIA', 'KIA'),
        tile({ label: 'Kualitas data', value: pct(avg(a.kualitas.map((k) => k.value)), 1), sev: a.nikGanda ? 'critical' : null, sub: a.nikGanda ? `${fmt(a.nikGanda)} NIK ganda` : 'Tidak ada NIK ganda' }),
      ),
      grid2(
        card({ title: 'Menurut status perkawinan', sub: 'Menikah, lajang, janda (perempuan cerai), duda (laki-laki cerai)', build: (h) => hbarChart(h, { items: statusItems }), table: tbl(['Status', 'Warga', 'Persen'], a.status) }),
        card({
          title: 'Kepemilikan KTP-el dan KIA', sub: 'KTP-el wajib usia 17+ atau sudah kawin; KIA untuk anak < 17 yang belum kawin · ≥ 90% baik, 75–89% waspada, < 75% kritis',
          build: (h) => h.append(el('div', { class: 'meters' }, covRows.map(([n, c]) => (c.wajib
            ? meterEl({ label: `${n} (${fmt(c.sudah)} dari ${fmt(c.wajib)} wajib)`, value: c.pct, valText: pct(c.pct, 1), sev: covSev(c.pct) })
            : el('p', { class: 't-sub', text: `${n}: tidak ada warga wajib di hasil ini.` }))))),
          table: [['Kartu', 'Wajib', 'Sudah', 'Belum', 'Cakupan'], covRows.map(([n, c]) => [n, fmt(c.wajib), fmt(c.sudah), fmt(c.belum), c.wajib ? pct(c.pct, 1) : '—']), { numCols: [1, 2, 3, 4] }],
        }),
      ),
      grid2(
        card({ title: 'Menurut kelompok usia', sub: 'Jumlah warga', build: (h) => hbarChart(h, { items: a.usia }), table: tbl(['Kelompok usia', 'Warga', 'Persen'], a.usia) }),
        card({ title: 'Menurut strata pendidikan', sub: 'Pendidikan terakhir tercatat', build: (h) => hbarChart(h, { items: a.pend }), table: tbl(['Strata', 'Warga', 'Persen'], a.pend) }),
      ),
      grid2(
        card({ title: 'Menurut dusun', sub: 'Jumlah warga', build: (h) => hbarChart(h, { items: a.dusun }), table: tbl(['Dusun', 'Warga', 'Persen'], a.dusun) }),
        card({
          title: 'Kualitas data kependudukan', sub: 'Kelengkapan isian pada warga di hasil ini',
          build: (h) => h.append(el('div', { class: 'meters' }, a.kualitas.map((k) => meterEl({ label: k.label, value: k.value, valText: pct(k.value, 1), sev: covSev(k.value) })))),
          table: [['Indikator', 'Persen'], a.kualitas.map((k) => [k.label, pct(k.value, 1)]), { numCols: [1] }],
        }),
      ),
      card({
        title: 'Daftar warga', sub: 'Klik nama untuk melihat isi data. NIK disamarkan di tabel.',
        build: (h) => h.append(wargaTable(rows, all)),
      })
    );
  }

  /* ---- kartu filter ---- */
  function filterCard(onChange) {
    const f = wf.f, chips = [];
    const chip = (label, isOn, onClick, color) => {
      const b = el('button', { type: 'button', class: 'chip', 'aria-pressed': 'false' }, [color ? el('i', { class: 'dot', style: 'background:' + color }) : null, label]);
      b.addEventListener('click', () => { onClick(); wf.page = 0; refresh(); onChange(); });
      chips.push({ b, isOn });
      return b;
    };
    const toggle = (arr, k) => (arr.includes(k) ? arr.splice(arr.indexOf(k), 1) : arr.push(k));
    const usiaMin = el('input', { type: 'number', min: 0, max: 150, inputmode: 'numeric', 'aria-label': 'Usia minimum', placeholder: 'dari' });
    const usiaMax = el('input', { type: 'number', min: 0, max: 150, inputmode: 'numeric', 'aria-label': 'Usia maksimum', placeholder: 'sampai' });
    const sameUsia = (g) => f.usia && f.usia[0] === g.min && f.usia[1] === g.max;
    const kartu = el('select', { 'aria-label': 'Kepemilikan kartu' }, W.KARTU_OPSI.map((o) => el('option', { value: o.key, text: o.label })));
    const q = el('input', { type: 'search', placeholder: 'Cari nama, NIK, atau No. KK', 'aria-label': 'Cari nama, NIK, atau nomor KK', autocomplete: 'off' });
    const reset = el('button', { type: 'button', class: 'btn', text: 'Hapus semua filter' });

    const refresh = () => {
      chips.forEach(({ b, isOn }) => b.setAttribute('aria-pressed', String(isOn())));
      usiaMin.value = f.usia && !W.USIA_GROUPS.some(sameUsia) ? f.usia[0] : f.usia && W.USIA_GROUPS.some(sameUsia) ? f.usia[0] : '';
      usiaMax.value = f.usia ? (f.usia[1] >= 150 ? '' : f.usia[1]) : '';
      kartu.value = f.kartu;
      reset.disabled = !W.isFiltered(f);
    };
    const onRange = () => {
      const lo = usiaMin.value === '' ? null : clamp(Number(usiaMin.value), 0, 150), hi = usiaMax.value === '' ? null : clamp(Number(usiaMax.value), 0, 150);
      f.usia = lo == null && hi == null ? null : [Math.min(lo ?? 0, hi ?? 150), Math.max(lo ?? 0, hi ?? 150)];
      wf.page = 0;
      chips.forEach(({ b, isOn }) => b.setAttribute('aria-pressed', String(isOn())));
      reset.disabled = !W.isFiltered(f);
      onChange();
    };
    usiaMin.addEventListener('change', onRange); usiaMax.addEventListener('change', onRange);
    kartu.addEventListener('change', () => { f.kartu = kartu.value; wf.page = 0; refresh(); onChange(); });
    let t;
    q.value = f.q;
    q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { f.q = q.value; wf.page = 0; refresh(); onChange(); }, 200); });
    reset.addEventListener('click', () => { Object.assign(f, W.emptyFilter()); q.value = ''; wf.page = 0; refresh(); onChange(); });

    const group = (title, ...kids) => el('div', { class: 'fgroup', role: 'group', 'aria-label': title }, [el('div', { class: 'f-title', text: title }), el('div', { class: 'f-ctl' }, kids)]);
    const node = el('article', { class: 'card filters' }, [
      group('Status perkawinan', ...W.STATUS.map((s) => chip(s.label, () => f.status.includes(s.key), () => toggle(f.status, s.key), W.STATUS_COLOR[s.key]))),
      group('Usia (tahun)', ...W.USIA_GROUPS.map((g) => chip(g.label, () => sameUsia(g), () => { f.usia = sameUsia(g) ? null : [g.min, g.max]; })), el('span', { class: 'range' }, [usiaMin, ' – ', usiaMax])),
      group('Strata pendidikan', ...W.PEND_GROUPS.map((g) => chip(g.label, () => f.pend.includes(g.key), () => toggle(f.pend, g.key)))),
      group('Kepemilikan kartu', kartu),
      group('Pencarian', q, reset),
    ]);
    refresh();
    return node;
  }

  /* ---- bilah sumber data + impor CSV ---- */
  function sourceBar(rerender) {
    const m = D.meta.sumberPenduduk, input = el('input', { type: 'file', accept: '.csv,text/csv,text/plain', hidden: true });
    const report = el('div', { class: 'import-report', hidden: true });
    const src = m.jenis === 'api' ? `API ${m.url} · ${fmt(m.jumlah)} warga`
      : m.jenis === 'csv' ? `File ${m.nama} · ${fmt(m.jumlah)} warga (hanya ada di browser ini, tidak diunggah)`
      : 'Data contoh (sintetis; NIK berawalan 999999 bukan nomor sungguhan)';
    const btn = el('button', { type: 'button', class: 'btn', text: 'Impor CSV dari SIAK…' });
    btn.addEventListener('click', () => input.click());
    input.addEventListener('change', async () => {
      const file = input.files[0];
      if (!file) return;
      const { records, report: r } = W.importCSV(await file.text());
      input.value = '';
      report.hidden = false;
      if (r.error) { report.replaceChildren(el('p', { class: 'err', text: 'Gagal membaca file: ' + r.error }), el('p', { class: 't-sub', text: `Kolom di file: ${(r.tidakDikenali || []).join(', ') || '(tidak ada)'}` })); return; }
      const use = el('button', { type: 'button', class: 'btn', text: `Pakai ${fmt(records.length)} data ini` }), cancel = el('button', { type: 'button', class: 'btn', text: 'Batal' });
      use.addEventListener('click', () => { D.warga.records = records; D.meta.sumberPenduduk = { jenis: 'csv', nama: file.name, jumlah: records.length }; Object.assign(wf.f, W.emptyFilter()); wf.page = 0; rerender(); });
      cancel.addEventListener('click', () => { report.hidden = true; });
      const alasan = Object.entries(r.alasan).map(([k, v]) => `${fmt(v)} ${k}`).join(', ');
      report.replaceChildren(
        el('p', {}, [el('b', { text: `${fmt(r.baris)} baris dibaca: ${fmt(r.diimpor)} diimpor, ${fmt(r.dilewati)} dilewati` }), alasan ? ` (${alasan})` : '', '.']),
        el('p', { class: 't-sub', text: `Kolom dikenali: ${r.dikenali.join(', ')}.` }),
        r.hilang.length ? el('p', { class: 't-sub', text: `Kolom tidak ada di file: ${r.hilang.join(', ')}. Bagian yang bergantung pada kolom ini akan kosong atau tidak dihitung.` }) : null,
        r.tidakDikenali.length ? el('p', { class: 't-sub', text: `Kolom tidak dipakai: ${r.tidakDikenali.join(', ')}.` }) : null,
        el('div', { class: 'row-btns' }, [use, cancel])
      );
    });
    return el('article', { class: 'card sourcebar' }, [
      el('div', { class: 'src-line' }, [el('span', {}, [el('b', { text: 'Sumber data warga: ' }), src]), el('span', { class: 'row-btns' }, [btn, input])]),
      m.galat ? el('p', { class: 'err', text: m.galat }) : null,
      el('p', { class: 't-sub', text: 'Berisi data pribadi (nama, NIK). Tampilan TV hanya menampilkan angka gabungan, tanpa nama. Impor dibaca langsung di browser ini; yang dibaca: file CSV (di SIAK/Excel pilih Simpan sebagai CSV).' }),
      report,
    ]);
  }

  function secWarga() {
    const all = wargaAll(), a = W.aggregate(all);
    const results = el('div', { class: 'warga-results' }), count = el('p', { class: 'warga-count', 'aria-live': 'polite' });
    const update = () => {
      const rows = W.applyFilter(all, wf.f);
      count.textContent = W.isFiltered(wf.f) ? `Menampilkan ${fmt(rows.length)} dari ${fmt(all.length)} warga · filter: ${[W.describeFilter(wf.f), wf.f.q.trim() && `cari "${wf.f.q.trim()}"`].filter(Boolean).join(' · ')}` : `Menampilkan seluruh ${fmt(all.length)} warga (tanpa filter)`;
      renderResults(results, rows, all);
      try {
        const u = new URL(location.href);
        W.filterToParams(wf.f, u.searchParams);
        history.replaceState(null, '', u);
      } catch (e) { /* mis. file:// di beberapa browser */ }
    };
    const insight = all.length
      ? `${fmt(a.n)} warga dalam ${fmt(a.kk)} KK. Cakupan KTP-el ${a.ktp.pct == null ? '—' : pct(a.ktp.pct, 1)}, KIA ${a.kia.pct == null ? '—' : pct(a.kia.pct, 1)}. Gunakan filter di bawah untuk melihat kelompok tertentu dan isi datanya.`
      : 'Belum ada data warga.';
    const sec = section('warga', '4', 'Data Kependudukan (SIAK)', insight, sourceBar(() => { render(); }), filterCard(update), count, results);
    update();
    return sec;
  }

  const sevByUsage = (v, warn, crit) => (v >= crit ? 'critical' : v >= warn ? 'warning' : 'ok');
  const nodeSev = (n) => (n.status === 'ok' ? 'ok' : n.status === 'warning' ? 'warning' : 'critical');

  function secServer() {
    const s = D.server;
    const cpu = periodStats(s.cpu, 'avg'), ram = periodStats(s.ram, 'avg');
    const bad = s.perangkat.filter((n) => n.status !== 'ok');
    const ssl = s.sslSisaHari;
    const insight = bad.length
      ? `${bad.length} perangkat butuh perhatian (${bad.map((n) => n.nama).join(', ')}). Uptime 30 hari ${pct(s.uptime30, 2)}.`
      : `Semua perangkat sehat. Uptime 30 hari ${pct(s.uptime30, 2)}.`;
    const barang = s.perangkat.map((n) => [
      el('span', {}, [el('b', { text: n.nama }), el('div', { class: 't-sub', text: n.peran })]),
      pill(nodeSev(n)), pct(n.cpu, 0), pct(n.ram, 0), pct(n.disk, 0), fmt(n.uptimeHari) + ' hari',
    ]);
    return section('server', '5', 'Monitoring Server', insight,
      tiles(
        tile({ label: 'Uptime 30 hari', value: pct(s.uptime30, 2), sub: 'layanan dapat diakses warga' }),
        tile({ label: 'Perangkat bermasalah', value: `${bad.length} / ${s.perangkat.length}`, sev: bad.length ? 'warning' : null, sub: bad.length ? bad.map((n) => n.nama).join(', ') : 'Semua normal' }),
        tile({ label: 'Beban CPU (rata-rata)', value: pct(cpu.c, 0), delta: { value: cpu.c - cpu.p, unit: ' poin', vs: vsText() }, goodWhenUp: false, spark: bucket(cpu.cur, 12, 'avg') }),
        tile({ label: 'Pemakaian RAM (rata-rata)', value: pct(ram.c, 0), delta: { value: ram.c - ram.p, unit: ' poin', vs: vsText() }, goodWhenUp: false, spark: bucket(ram.cur, 12, 'avg') }),
        tile({ label: 'Backup terakhir', value: s.backupTerakhir.status === 'berhasil' ? 'Berhasil' : 'Gagal', sev: s.backupTerakhir.status === 'berhasil' ? 'ok' : 'critical', sub: s.backupTerakhir.waktu }),
        tile({ label: 'Sertifikat SSL', value: `${ssl} hari lagi`, sev: ssl < 14 ? 'critical' : ssl < 30 ? 'warning' : null, sub: ssl < 30 ? 'segera perpanjang' : 'masa berlaku aman' }),
      ),
      grid2(
        card({
          title: 'Beban CPU dan RAM', sub: `Rata-rata harian, ${state.days} hari terakhir`,
          build: (h) => lineChart(h, {
            dates: dates(), ticks: [0, 25, 50, 75, 100], yMax: 100, yFmt: (v) => v + '%', valFmt: (v) => v + '%',
            series: [{ name: 'CPU', color: 'var(--s1)', values: cpu.cur }, { name: 'RAM', color: 'var(--s2)', values: ram.cur }],
            label: 'Grafik beban CPU dan pemakaian RAM server',
          }),
          table: [['Tanggal', 'CPU', 'RAM'], dates().map((d, i) => [dLong(d), cpu.cur[i] + '%', ram.cur[i] + '%']).reverse(), { numCols: [1, 2] }],
        }),
        card({
          title: 'Ruang penyimpanan', sub: 'Pemakaian disk saat ini · ≥ 75% waspada, ≥ 90% kritis',
          build: (h) => h.append(el('div', { class: 'meters' }, s.perangkat.map((n) => {
            const sev = sevByUsage(n.disk, 75, 90);
            return meterEl({ label: n.nama, value: n.disk, valText: pct(n.disk, 0), sev });
          }))),
          table: [['Perangkat', 'Disk'], s.perangkat.map((n) => [n.nama, pct(n.disk, 0)]), { numCols: [1] }],
        })
      ),
      card({
        title: 'Daftar perangkat server', sub: 'Kondisi saat ini',
        tableOnly: [['Perangkat', 'Status', 'CPU', 'RAM', 'Disk', 'Menyala'], barang, { tall: true, numCols: [2, 3, 4, 5] }],
      })
    );
  }

  function secBlangko() {
    const { B, rows, total, terpakai, rusak, sisa, rusakCetak } = blangkoStats();
    const flagged = rows.filter((r) => r.sev !== 'ok');
    const insight = `Dari ${fmt(total)} blangko: ${fmt(terpakai)} terpakai (${pct((terpakai / total) * 100, 0)}), ${fmt(rusak)} rusak (${pct((rusak / total) * 100)} dari total), ${fmt(sisa)} tersisa. ${flagged.length ? `Perhatikan: ${flagged.map((r) => r.nama).join(', ')}.` : 'Semua jenis dalam batas wajar.'}`;
    const parts = [
      { key: 'terpakai', name: 'Terpakai', color: 'var(--s1)' },
      { key: 'rusak', name: 'Rusak', color: 'var(--crit)' },
      { key: 'sisa', name: 'Sisa stok', color: 'var(--neutral-seg)' },
    ];
    const stackRows = rows.map((r) => ({
      label: r.nama, values: { terpakai: r.terpakai, rusak: r.rusak, sisa: r.sisa },
      right: `Rusak ${fmt(r.rusak)} (${pct(r.rusakCetak)} dari dicetak) · sisa ${fmt(r.sisa)}/${fmt(r.total)}`,
    }));

    // tingkat rusak bergulir 7 hari (rusak ÷ dicetak)
    const used = B.terpakaiHarian, bad = B.rusakHarian;
    const roll = used.map((_, i) => {
      const a = Math.max(0, i - 6);
      const u = sum(used.slice(a, i + 1)), r = sum(bad.slice(a, i + 1));
      return u + r ? (r / (u + r)) * 100 : 0;
    });
    const rollCur = slice(roll, state.days).map((v) => Math.round(v * 10) / 10);
    const rusakP = periodStats(bad);

    return section('blangko', '6', 'Monitoring Blangko', insight,
      tiles(
        tile({ label: 'Total blangko (pengadaan)', value: fmt(total), sub: `${rows.length} jenis blangko` }),
        tile({ label: 'Terpakai', value: fmt(terpakai), sub: `${pct((terpakai / total) * 100)} dari total` }),
        tile({ label: 'Rusak', value: fmt(rusak), sev: rusakCetak > B.ambangRusakPersen ? 'warning' : null, sub: `${pct((rusak / total) * 100)} dari total · ${pct(rusakCetak)} dari yang dicetak` }),
        tile({ label: 'Sisa stok', value: fmt(sisa), sev: (sisa / total) * 100 < B.ambangSisaPersen ? 'warning' : null, sub: `${pct((sisa / total) * 100)} dari total` }),
        tile({ label: `Blangko rusak (${state.days} hari)`, value: fmt(rusakP.c), delta: { value: rusakP.chg, vs: vsText() }, goodWhenUp: false, spark: bucket(rusakP.cur, 12, 'sum') }),
      ),
      grid2(
        card({
          title: 'Terpakai, rusak, dan sisa per jenis', sub: 'Komposisi, 100% = total blangko jenis itu',
          build: (h) => stackChart(h, { parts, rows: stackRows }),
          table: [['Jenis', 'Terpakai', 'Rusak', 'Sisa', 'Total'], rows.map((r) => [r.nama, fmt(r.terpakai), fmt(r.rusak), fmt(r.sisa), fmt(r.total)]), { numCols: [1, 2, 3, 4] }],
        }),
        card({
          title: 'Tingkat blangko rusak', sub: `% rusak dari yang dicetak, rata-rata bergulir 7 hari · batas wajar ${B.ambangRusakPersen}%`,
          build: (h) => lineChart(h, {
            dates: dates(), series: [{ name: 'Tingkat rusak', color: 'var(--s1)', values: rollCur }],
            yFmt: (v) => v + '%', valFmt: (v) => nfd(1).format(v) + '%', label: 'Grafik tingkat blangko rusak',
          }),
          table: [['Tanggal', 'Tingkat rusak'], dates().map((d, i) => [dLong(d), nfd(1).format(rollCur[i]) + '%']).reverse(), { numCols: [1] }],
        })
      ),
      card({
        title: 'Rincian per jenis blangko', sub: `Perhatian bila rusak > ${B.ambangRusakPersen}% dari yang dicetak atau sisa < ${B.ambangSisaPersen}% dari total`,
        tableOnly: [
          ['Jenis blangko', 'Total', 'Terpakai', 'Rusak', 'Sisa', 'Rusak / total', 'Rusak / dicetak', 'Status'],
          rows.map((r) => [r.nama, fmt(r.total), fmt(r.terpakai), fmt(r.rusak), fmt(r.sisa), pct((r.rusak / r.total) * 100), pct(r.rusakCetak),
            pill(r.sev, r.sev === 'ok' ? 'Normal' : r.rusakCetak > B.ambangRusakPersen ? 'Rusak tinggi' : 'Stok menipis')]),
          { tall: true, numCols: [1, 2, 3, 4, 5, 6] },
        ],
      })
    );
  }

  /* ============================== ringkasan & peringatan ============================== */
  // satu peta dipakai terus (tidak dibuat ulang tiap render); wilayah & kunci disimpan di URL
  const mapParams = new URLSearchParams(location.search);
  const mapApi = window.DashMap.create({
    controls: true, wilayah: mapParams.get('wilayah') || 'desa', kunci: mapParams.get('kunci') === '1',
    onHover: (p, e) => tip.show(e.clientX, e.clientY, p.nama, [{ value: SEV_LABEL[p.sev], name: `${p.tipe} · ${p.detail}` }]), onLeave: () => tip.hide(),
    onChange: ({ wilayah, kunci }) => {
      try {
        const u = new URL(location.href);
        if (wilayah === 'desa') u.searchParams.delete('wilayah'); else u.searchParams.set('wilayah', wilayah);
        if (kunci) u.searchParams.set('kunci', '1'); else u.searchParams.delete('kunci');
        history.replaceState(null, '', u);
      } catch (e) { /* abaikan */ }
    },
  });

  function overview(alerts, K) {
    const h = K.hero, chg = h.chg;
    const dailySel = periodStats(D.mobile.selesaiHarian).cur, dailyKio = periodStats(D.kiosk.transaksiHarian).cur;
    const trend = el('div', { class: 'hero-trend' });
    lineChart(trend, { dates: dates(), series: [{ name: 'Layanan selesai per hari', color: 'var(--s1)', values: dailySel.map((v, i) => v + dailyKio[i]) }], height: 140, label: 'Grafik layanan digital terselesaikan per hari' });
    const hero = el('article', { class: 'card hero', id: 'ringkasan' }, [
      el('div', { class: 'hero-main' }, [
        el('div', { class: 'hero-label', text: `Layanan digital terselesaikan · ${state.days} hari terakhir` }),
        el('div', { class: 'hero-val', text: fmt(h.value) }),
        el('div', { class: 'hero-sub' }, [
          el('span', { style: 'font-weight:600;color:var(--' + (chg >= 0 ? 'good-text' : 'crit-text') + ')', text: (chg >= 0 ? '▲ +' : '▼ −') + fmt1(Math.abs(chg)) + '%' }),
          ' ' + vsText(),
        ]),
        el('div', { class: 'hero-sub' }, ['Aplikasi warga ', el('b', { text: fmt(h.viaApp) }), ' · kiosk ', el('b', { text: fmt(h.viaKiosk) })]),
        el('div', { class: 'hero-sub' }, ['Pengajuan selesai ', el('b', { text: pct(h.rate, 0) })]),
      ]),
      trend,
    ]);
    const kpiGrid = el('div', { class: 'kpi-grid' }, [hero, ...K.cards.map((c) => UI.kpiCard(c, { href: '#' + c.id, ringSize: 72 }))]);

    // peta desa: lokasi kiosk, aset bermasalah, balai desa; angka = warga per dusun
    const points = petaTitik();
    const mapHost = el('div', { class: 'mapframe' }, mapApi.el);
    const nWatch = points.filter((p) => p.sev !== 'ok').length, geo = D.peta.geo;
    const mapCard = el('article', { class: 'card mapcard' }, [
      el('div', { class: 'card-head', style: 'margin-bottom:0' }, [el('div', {}, [el('h3', { text: 'Peta desa' }), el('p', { text: `${nWatch} dari ${points.length} titik perlu perhatian · angka = jumlah warga per dusun` })])]),
      mapHost, UI.mapLegend(),
      el('p', { class: 'note', text: 'Pilih wilayah (seluruh desa atau satu dusun), lalu tekan Kunci untuk membekukan tampilan. Tanpa kunci, peta bebas digeser tetapi tidak bisa keluar dari batas desa.' }),
      geo.contoh ? el('p', { class: 'note warn', text: 'Lokasi peta ini hanya contoh. Isi koordinat desa Anda di data.js (peta.geo.batas) agar sesuai wilayah sebenarnya.' }) : null,
    ]);

    const nCrit = alerts.filter((a) => a.sev === 'critical').length;
    const list = alerts.length
      ? el('ul', { class: 'alert-list' }, alerts.map((a) =>
          el('li', {}, el('a', { href: '#' + a.sec }, [
            statusIcon(a.sev),
            el('span', {}, [
              el('div', { class: 'a-title' }, [el('span', { class: 'sev', text: SEV_LABEL[a.sev] }), a.title]),
              el('div', { class: 'a-detail', text: a.detail }),
            ]),
            el('span', { class: 'a-sec', text: a.secName }),
          ]))
        ))
      : el('div', { class: 'all-good' }, [statusIcon('ok'), 'Tidak ada hal yang perlu perhatian saat ini.']);
    const al = el('article', { class: 'card alerts' }, [
      el('h2', { text: 'Perlu perhatian' }),
      el('p', { class: 'alerts-sub', text: alerts.length ? `${alerts.length} hal · ${nCrit} kritis, ${alerts.length - nCrit} waspada. Ketuk untuk menuju bagian terkait.` : 'Semua laporan dalam batas normal.' }),
      list,
    ]);
    return el('div', {}, [kpiGrid, el('div', { class: 'overview2' }, [mapCard, al])]);
  }

  /* ============================== render ============================== */
  const app = document.getElementById('app');
  const SECTIONS = [
    ['mobile', 'Aplikasi Warga', 'phone'], ['kiosk', 'Kiosk', 'kiosk'], ['aset', 'Aset Desa', 'box'],
    ['warga', 'Kependudukan', 'users'], ['server', 'Server', 'server'], ['blangko', 'Blangko', 'doc'],
  ];
  let spy = null;
  function renderNav(K) {
    const nav = document.getElementById('nav');
    nav.replaceChildren(
      el('a', { href: '#ringkasan', 'data-s': 'ringkasan' }, [UI.icon('home'), 'Ringkasan']),
      ...SECTIONS.map(([id, name, ic]) => el('a', { href: '#' + id, 'data-s': id }, [UI.icon(ic), `${SECTIONS.findIndex((s) => s[0] === id) + 1}. ${name}`, el('span', { class: 'st', title: SEV_LABEL[K.sevOf(id)] }, statusIcon(K.sevOf(id)))]))
    );
    // sorot bagian yang sedang dilihat
    const mark = (id) => nav.querySelectorAll('a').forEach((a) => a.setAttribute('aria-current', String(a.dataset.s === id)));
    mark('ringkasan');
    if (spy) spy.disconnect();
    if ('IntersectionObserver' in window) {
      spy = new IntersectionObserver((entries) => entries.forEach((en) => { if (en.isIntersecting) mark(en.target.id); }), { rootMargin: '-30% 0px -60% 0px' });
      ['ringkasan', ...SECTIONS.map((s) => s[0])].forEach((id) => { const n = document.getElementById(id); if (n) spy.observe(n); });
    }
  }
  function render() {
    tip.hide();
    const alerts = buildAlerts(), K = kpis(state.days, alerts);
    app.replaceChildren(overview(alerts, K), secMobile(), secKiosk(), secAset(), secWarga(), secServer(), secBlangko());
    mapApi.update(wargaAll());
    renderNav(K);
    const sp = D.meta.sumberPenduduk;
    document.getElementById('side-src').textContent = `Data warga: ${sp.jenis === 'api' ? 'API' : sp.jenis === 'csv' ? 'impor CSV' : 'data contoh'}${D.meta.dataContoh ? ' · bagian lain: data contoh' : ''}`;
  }

  function setup() {
    document.getElementById('desa-name').textContent = `${D.meta.desa} · ${D.meta.kecamatan} · ${D.meta.kabupaten}`;
    if (D.meta.dataContoh) {
      const bd = document.getElementById('demo-badge');
      bd.hidden = false;
      bd.textContent = D.meta.sumberPenduduk.jenis === 'contoh' ? 'Data contoh' : 'Selain data warga: data contoh';
    }
    document.getElementById('updated').textContent =
      'Diperbarui ' + new Date(D.meta.diperbarui).toLocaleString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    document.getElementById('footer').textContent = D.meta.dataContoh
      ? 'Angka pada halaman ini adalah data contoh. Hubungkan data.js ke aplikasi sebenarnya (dan data warga ke SIAK) untuk menampilkan data desa.'
      : '';

    document.getElementById('side-logo').classList.add('logo');
    document.getElementById('side-logo').append(UI.icon('shield', 24));
    document.getElementById('side-desa').textContent = D.meta.desa;
    document.getElementById('side-tv').append(UI.icon('tv', 20), el('span', { text: 'Tampilan TV' }));

    const per = document.getElementById('periode');
    const check = () => el('svg:svg', { class: 'chk', viewBox: '0 0 16 16', 'aria-hidden': 'true' }, el('svg:path', { d: 'M3 8.5l3.2 3.2L13 4.8', fill: 'none', stroke: 'currentColor', 'stroke-width': 2.2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
    [7, 30, 90].forEach((d) => {
      const b = el('button', { type: 'button', role: 'radio', 'aria-checked': String(d === state.days), 'data-d': d }, [check(), `${d} hari`]);
      b.addEventListener('click', () => {
        if (state.days === d) return;
        state.days = d;
        per.querySelectorAll('button').forEach((x) => x.setAttribute('aria-checked', String(Number(x.dataset.d) === d)));
        app.classList.add('is-loading');
        setTimeout(() => { render(); app.classList.remove('is-loading'); }, 120);
      });
      per.append(b);
    });

    const root = document.documentElement, btn = document.getElementById('theme-btn');
    const dark = () => (root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches);
    const sync = () => { btn.setAttribute('aria-pressed', String(dark())); btn.textContent = dark() ? 'Mode terang' : 'Mode gelap'; };
    try { const s = localStorage.getItem('dash-theme'); if (s) root.dataset.theme = s; } catch (e) { /* abaikan */ }
    btn.addEventListener('click', () => {
      root.dataset.theme = dark() ? 'light' : 'dark';
      mapApi.restyle();
      try { localStorage.setItem('dash-theme', root.dataset.theme); } catch (e) { /* abaikan */ }
      sync();
    });
    sync();
  }

  ready.then(() => { setup(); render(); });
})();
