(() => {
  'use strict';

  const D = window.DASHBOARD_DATA;
  const {
    nfd, fmt, fmt1, pct, compact, rupiah, sum, avg, clamp, slice, changePct, dShort, dLong,
    el, SEV_LABEL, statusIcon, pill, blangkoStats, buildAlerts,
  } = window.DashLib;

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
      const k = Math.min(5, n);
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
  function stackChart(host, { parts, rows }) {
    host.replaceChildren(legendEl(parts.map((p) => ({ name: p.name, color: p.color }))));
    const list = el('div', { class: 'stack-rows' });
    rows.forEach((r) => {
      const total = sum(parts.map((p) => r.values[p.key] || 0));
      const bar = el('div', { class: 'stack-bar' });
      parts.forEach((p) => {
        const v = r.values[p.key] || 0;
        if (!v) return;
        bar.append(el('div', { class: 'stack-seg', style: `flex:${v} 1 0;background:${p.color}` }));
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
        el('div', {}, [el('h2', { id: id + '-h', text: title }), el('p', { class: 'insight', text: insight })]),
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
    const terdaftarPct = (m.wargaTerdaftar / D.warga.penduduk) * 100;
    const insight = `Rata-rata ${fmt(aktif.c)} pengguna aktif per hari (${aktif.chg >= 0 ? 'naik' : 'turun'} ${fmt1(Math.abs(aktif.chg))}% vs ${state.days} hari sebelumnya); ${fmt(aju.c)} pengajuan layanan masuk, ${pct(rate, 0)} sudah selesai.`;

    const jenis = m.pengajuanPerJenis.map((j) => ({ label: j.label, value: Math.round(j.bobot * aju.c) }));
    return section('mobile', '1', 'Aplikasi Mobile Warga', insight,
      tiles(
        tile({ label: 'Pengguna aktif harian (rata-rata)', value: fmt(aktif.c), delta: { value: aktif.chg, vs: vsText() }, spark: bucket(aktif.cur, 12, 'avg') }),
        tile({ label: 'Pengajuan layanan', value: fmt(aju.c), delta: { value: aju.chg, vs: vsText() }, spark: bucket(aju.cur, 12, 'sum') }),
        tile({ label: 'Pengajuan selesai', value: pct(rate, 0), delta: { value: rate - ratePrev, unit: ' poin', vs: vsText() }, sub: `${fmt(sel.c)} dari ${fmt(aju.c)} pengajuan` }),
        tile({ label: 'Warga terdaftar di aplikasi', value: fmt(m.wargaTerdaftar), sub: `${pct(terdaftarPct, 0)} dari ${fmt(D.warga.penduduk)} penduduk · rating ${nfd(1).format(m.rating)}/5 (${fmt(m.jumlahUlasan)} ulasan)` }),
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

  function secWarga() {
    const w = D.warga;
    const mt = w.mutasi30Hari;
    const net = mt.lahir + mt.datang - mt.meninggal - mt.pindah;
    const lengkap = (v) => (v >= 90 ? 'ok' : v >= 75 ? 'warning' : 'critical');
    const terendah = w.kelengkapan.reduce((a, b) => (b.value < a.value ? b : a));
    const insight = `${fmt(w.penduduk)} penduduk dalam ${fmt(w.kepalaKeluarga)} KK. Data paling tertinggal: "${terendah.label}" (${pct(terendah.value)}).`;
    return section('warga', '4', 'Data Digital Warga', insight,
      tiles(
        tile({ label: 'Jumlah penduduk', value: fmt(w.penduduk), sub: `${fmt(w.lakiLaki)} laki-laki · ${fmt(w.perempuan)} perempuan` }),
        tile({ label: 'Kepala keluarga', value: fmt(w.kepalaKeluarga), sub: `rata-rata ${nfd(1).format(w.penduduk / w.kepalaKeluarga)} jiwa per KK` }),
        tile({ label: 'Pertumbuhan 30 hari', value: (net >= 0 ? '+' : '−') + fmt(Math.abs(net)), sub: 'lahir + datang − meninggal − pindah' }),
        tile({ label: 'Data lengkap (rata-rata)', value: pct(avg(w.kelengkapan.map((k) => k.value)), 0), sub: `${w.kelengkapan.length} indikator kelengkapan` }),
      ),
      grid2(
        card({
          title: 'Penduduk per dusun', sub: 'Jumlah jiwa',
          build: (h) => hbarChart(h, { items: w.perDusun }),
          table: [['Dusun', 'Penduduk'], w.perDusun.map((d) => [d.label, fmt(d.value)]), { numCols: [1] }],
        }),
        card({
          title: 'Penduduk menurut kelompok usia', sub: 'Jumlah jiwa',
          build: (h) => hbarChart(h, { items: w.perUsia }),
          table: [['Kelompok usia', 'Penduduk'], w.perUsia.map((d) => [d.label, fmt(d.value)]), { numCols: [1] }],
        })
      ),
      grid2(
        card({
          title: 'Kelengkapan data digital', sub: '% warga dengan data sudah lengkap · ≥ 90% baik, 75–89% waspada, < 75% kritis',
          build: (h) => h.append(el('div', { class: 'meters' }, w.kelengkapan.map((k) => meterEl({ label: k.label, value: k.value, valText: pct(k.value), sev: lengkap(k.value) })))),
          table: [['Indikator', 'Persen'], w.kelengkapan.map((k) => [k.label, pct(k.value)]), { numCols: [1] }],
        }),
        card({
          title: 'Mutasi penduduk', sub: '30 hari terakhir (tidak mengikuti filter periode)',
          build: (h) => h.append(el('dl', { class: 'kv' }, [
            el('dt', { text: 'Kelahiran' }), el('dd', { text: fmt(mt.lahir) }),
            el('dt', { text: 'Pendatang' }), el('dd', { text: fmt(mt.datang) }),
            el('dt', { text: 'Kematian' }), el('dd', { text: fmt(mt.meninggal) }),
            el('dt', { text: 'Pindah keluar' }), el('dd', { text: fmt(mt.pindah) }),
            el('dt', { text: 'Selisih bersih' }), el('dd', { text: (net >= 0 ? '+' : '−') + fmt(Math.abs(net)) }),
          ])),
        })
      )
    );
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
  function overview() {
    const sel = periodStats(D.mobile.selesaiHarian), kio = periodStats(D.kiosk.transaksiHarian);
    const total = sel.c + kio.c, prev = sel.p + kio.p;
    const chg = changePct(total, prev);
    const alerts = buildAlerts();
    const nCrit = alerts.filter((a) => a.sev === 'critical').length;

    const hero = el('article', { class: 'card hero' }, [
      el('div', { class: 'hero-label', text: `Layanan digital terselesaikan · ${state.days} hari terakhir` }),
      el('div', { class: 'hero-val', text: fmt(total) }),
      el('div', { class: 'hero-sub' }, [
        el('span', { style: 'font-weight:600;color:var(--' + (chg >= 0 ? 'good-text' : 'crit-text') + ')', text: (chg >= 0 ? '▲ +' : '▼ −') + fmt1(Math.abs(chg)) + '%' }),
        ' ' + vsText(),
      ]),
      el('div', { class: 'hero-split' }, [
        el('span', {}, ['Via aplikasi warga ', el('b', { text: fmt(sel.c) })]),
        el('span', {}, ['Via kiosk ', el('b', { text: fmt(kio.c) })]),
      ]),
      el('h2', { class: 'status-h', text: 'Status tiap bagian' }),
      el('ul', { class: 'status-grid' }, SECTIONS.map(([id, name]) => {
        const worst = alerts.find((a) => a.sec === id); // daftar sudah urut dari yang paling parah
        const sev = worst ? worst.sev : 'ok';
        return el('li', {}, el('a', { href: '#' + id }, [el('span', { text: name }), pill(sev)]));
      })),
    ]);

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
    return el('div', { class: 'overview' }, [hero, al]);
  }

  /* ============================== render ============================== */
  const app = document.getElementById('app');
  const SECTIONS = [
    ['mobile', '1. Aplikasi warga'], ['kiosk', '2. Kiosk'], ['aset', '3. Aset'],
    ['warga', '4. Data warga'], ['server', '5. Server'], ['blangko', '6. Blangko'],
  ];
  function render() {
    tip.hide();
    app.replaceChildren(overview(), secMobile(), secKiosk(), secAset(), secWarga(), secServer(), secBlangko());
  }

  function setup() {
    document.getElementById('desa-name').textContent = `${D.meta.desa} · ${D.meta.kecamatan} · ${D.meta.kabupaten}`;
    if (D.meta.dataContoh) document.getElementById('demo-badge').hidden = false;
    document.getElementById('updated').textContent =
      'Diperbarui ' + new Date(D.meta.diperbarui).toLocaleString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    document.getElementById('footer').textContent = D.meta.dataContoh
      ? 'Angka pada halaman ini adalah data contoh. Hubungkan data.js ke aplikasi sebenarnya untuk menampilkan data desa.'
      : '';

    const jump = document.getElementById('jump');
    SECTIONS.forEach(([id, name]) => jump.append(el('a', { href: '#' + id, text: name })));

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
      try { localStorage.setItem('dash-theme', root.dataset.theme); } catch (e) { /* abaikan */ }
      sync();
    });
    sync();
  }

  setup();
  render();
})();
