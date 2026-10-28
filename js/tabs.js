/* Wisata Gateway — TV billboard, analytics, guestbook/logs, group pass + insights, settings. */
(function () {
  'use strict';
  const WG = window.WG;
  const { esc, $, $$ } = WG;
  const CAT_COLOR = { umum: '#10d395', pelajar: '#2dd4bf', lansia: '#9b6dff', mancanegara: '#4da3ff', vip: '#ffd24d' };
  const RESULT = { OK: ['ok', 'DIIZINKAN'], DENIED: ['err', 'DITOLAK'], MANUAL: ['amber', 'MANUAL'] };

  /* ================================================================== TV BILLBOARD */
  let lastTicker = '';
  let lastQuote = -1;
  const tv = {
    init() {
      $('#btnFs').addEventListener('click', () => {
        const el = $('#tvBoard');
        if (document.fullscreenElement) document.exitFullscreen();
        else if (el.requestFullscreen) el.requestFullscreen();
      });
    },
    render() {
      const S = WG.S, st = WG.stats();
      $('#tvPark').textContent = S.settings.parkName;
      $('#tvDate').textContent = WG.fmtDateLong(Date.now());
      const pct = Math.min(1, st.occupancy);
      $('#tvRing').style.strokeDasharray = `${(pct * 540.35).toFixed(1)} 540.35`;
      $('#tvPct').textContent = Math.round(st.occupancy * 100) + '%';
      let key = 'ok', label = 'TERSEDIA';
      if (S.panic) { key = 'full'; label = 'DARURAT — HARAP KELUAR DENGAN TENANG'; }
      else if (st.occupancy >= 1) { key = 'full'; label = 'PENUH — MOHON MENUNGGU'; }
      else if (st.occupancy >= 0.85) { key = 'warn'; label = 'HAMPIR PENUH'; }
      else if (st.occupancy >= 0.6) { key = 'busy'; label = 'RAMAI'; }
      $('#tvBoard').dataset.level = key;
      $('#tvStatus').textContent = label;
      $('#tvInside').textContent = st.inside;
      $('#tvFree').textContent = st.free;
      $('#tvToday').textContent = st.todayIn;

      // Public screen: first name + origin city only. No NIK, no surname.
      const feed = [];
      for (let i = S.visits.length - 1; i >= 0 && feed.length < 6; i--) {
        const v = S.visits[i];
        if (v.result !== 'OK' || v.dir !== 'IN') continue;
        feed.push(v.groupId
          ? `Rombongan <b>${esc(v.name)}</b> (${v.count} orang)`
          : `<b>${esc((v.name || '').split(/\s+/)[0] || 'Pengunjung')}</b>${v.city ? ' dari ' + esc(v.city) : ''}`);
      }
      $('#tvFeed').innerHTML = feed.length ? feed.map((f) => `<li>${f}</li>`).join('') : '<li class="dim">Menunggu pengunjung pertama…</li>';

      const ann = S.settings.announcements.length ? S.settings.announcements : [S.settings.parkName];
      const html = ann.map((a) => `<span>${esc(a)}</span>`).join('');
      if (html !== lastTicker) {
        lastTicker = html;
        $('#tvTicker').innerHTML = html + html;
        $('#tvTicker').style.animationDuration = Math.max(20, ann.join('').length * 0.28) + 's';
      }
      this.tick(true);
    },
    tick(force) {
      const d = new Date(Date.now() + 7 * 3600e3);
      $('#tvClock').textContent = `${WG.pad(d.getUTCHours())}.${WG.pad(d.getUTCMinutes())}`;
      const gb = WG.S.guestbook;
      const idx = gb.length ? Math.floor(Date.now() / 8000) % Math.min(gb.length, 10) : -1;
      if (idx !== lastQuote || force) {
        lastQuote = idx;
        const m = idx >= 0 ? gb[gb.length - 1 - idx] : null;
        $('#tvQuote').innerHTML = m ? `<q>${esc(m.text)}</q><span>— ${esc(m.name)} ${'★'.repeat(m.rating)}</span>` : '<q class="dim">Tulis kesan Anda di Buku Tamu digital.</q>';
      }
    },
  };

  /* ================================================================== ANALYTICS */
  let anDay = null;

  const niceMax = (m) => {
    const p = Math.pow(10, Math.floor(Math.log10(m)));
    return ([1, 2, 2.5, 5, 10].find((f) => f * p >= m) || 10) * p;
  };

  function dayStats(day) {
    const S = WG.S;
    const a = {
      day, inn: Array(24).fill(0), out: Array(24).fill(0), cat: {}, city: {}, gate: {}, totalIn: 0, totalOut: 0,
      denied: 0, manual: 0, revenue: 0, dwellSum: 0, dwellN: 0, catRev: {},
    };
    for (const v of S.visits) {
      if (v.day !== day) continue;
      if (v.result === 'DENIED') { a.denied++; continue; }
      if (v.result === 'MANUAL') { a.manual++; continue; }
      a.gate[v.gateId] = (a.gate[v.gateId] || 0) + v.count;
      if (v.dir === 'IN') {
        a.totalIn += v.count; a.inn[v.hour] += v.count;
        a.cat[v.category] = (a.cat[v.category] || 0) + v.count;
        const r = (S.settings.prices[v.category] || 0) * v.count;
        a.revenue += r; a.catRev[v.category] = (a.catRev[v.category] || 0) + r;
        const c = v.city || '(tidak diisi)';
        a.city[c] = (a.city[c] || 0) + v.count;
      } else {
        a.totalOut += v.count; a.out[v.hour] += v.count;
        if (v.dwell) { a.dwellSum += v.dwell; a.dwellN++; }
      }
    }
    a.peak = a.inn.reduce((b, v, h) => (v > a.inn[b] ? h : b), 0);
    return a;
  }

  // Entry is by KTP-el; tariffs are optional. Money figures only appear once a tariff above 0 is configured.
  const hasTariff = () => Object.values(WG.S.settings.prices).some((p) => p > 0);

  function hourlyChart(a) {
    let h0 = 7, h1 = 18;
    for (let h = 0; h < 24; h++) if (a.inn[h] || a.out[h]) { h0 = Math.min(h0, h); h1 = Math.max(h1, h); }
    const W = 1100, H = 250, L = 38, R = 8, T = 10, B = 28;
    const n = h1 - h0 + 1;
    const max = niceMax(Math.max(1, ...a.inn.slice(h0, h1 + 1), ...a.out.slice(h0, h1 + 1)));
    const bw = (W - L - R) / n;
    const y = (v) => T + (H - T - B) * (1 - v / max);
    let g = '';
    for (let i = 0; i <= 4; i++) {
      const v = (max / 4) * i;
      g += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" class="gl"/><text x="${L - 6}" y="${y(v) + 4}" class="ax" text-anchor="end">${Math.round(v * 10) / 10}</text>`;
    }
    let bars = '';
    for (let h = h0; h <= h1; h++) {
      const x = L + (h - h0) * bw;
      const bi = a.inn[h], bo = a.out[h];
      bars += `<rect x="${x + bw * 0.12}" y="${y(bi)}" width="${bw * 0.36}" height="${H - B - y(bi)}" rx="2" fill="${CAT_COLOR.umum}"><title>${WG.pad(h)}.00 masuk: ${bi}</title></rect>`;
      bars += `<rect x="${x + bw * 0.52}" y="${y(bo)}" width="${bw * 0.36}" height="${H - B - y(bo)}" rx="2" fill="${CAT_COLOR.mancanegara}"><title>${WG.pad(h)}.00 keluar: ${bo}</title></rect>`;
      bars += `<text x="${x + bw / 2}" y="${H - 9}" class="ax" text-anchor="middle">${WG.pad(h)}</text>`;
    }
    return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="Grafik kunjungan per jam">${g}${bars}</svg>
      <div class="legend"><span><i style="background:${CAT_COLOR.umum}"></i>Masuk</span><span><i style="background:${CAT_COLOR.mancanegara}"></i>Keluar</span></div>`;
  }

  function donut(a) {
    const total = Object.values(a.cat).reduce((s, v) => s + v, 0);
    if (!total) return '<div class="empty">Belum ada data</div>';
    let off = 25, segs = '';
    for (const k of Object.keys(WG.CATEGORIES)) {
      const v = a.cat[k] || 0;
      if (!v) continue;
      const p = (v / total) * 100;
      segs += `<circle cx="21" cy="21" r="15.9155" fill="none" stroke="${CAT_COLOR[k]}" stroke-width="6" stroke-dasharray="${p} ${100 - p}" stroke-dashoffset="${off}"><title>${WG.CATEGORIES[k].label}: ${v}</title></circle>`;
      off -= p;
    }
    const legend = Object.keys(WG.CATEGORIES).filter((k) => a.cat[k]).map((k) => `<li><i style="background:${CAT_COLOR[k]}"></i>${WG.CATEGORIES[k].label}<b>${a.cat[k]}</b><em>${Math.round((a.cat[k] / total) * 100)}%</em></li>`).join('');
    return `<div class="donut-wrap"><svg viewBox="0 0 42 42" class="donut" role="img" aria-label="Komposisi kategori"><circle cx="21" cy="21" r="15.9155" fill="none" stroke="var(--line)" stroke-width="6"/>${segs}<text x="21" y="22.5" text-anchor="middle" class="donut-t">${total}</text></svg><ul class="legend-list">${legend}</ul></div>`;
  }

  function hbars(map, labelFn, color) {
    const rows = Object.entries(map).sort((x, y) => y[1] - x[1]).slice(0, 6);
    if (!rows.length) return '<div class="empty">Belum ada data</div>';
    const max = rows[0][1];
    return `<div class="hbars">${rows.map(([k, v]) => `<div class="hb"><span>${esc(labelFn(k))}</span><div><i style="width:${(v / max) * 100}%;background:${color}"></i></div><b>${v}</b></div>`).join('')}</div>`;
  }

  const analytics = {
    init() {
      $('#anDay').addEventListener('change', (e) => { anDay = e.target.value; this.render(); });
      $('#btnPrint').addEventListener('click', () => window.print());
      $('#anBody').addEventListener('click', (e) => { if (e.target.closest('[data-demo]')) loadDemoWithConfirm(); });
      $('#btnAnCsv').addEventListener('click', () => {
        const a = dayStats(anDay);
        const rows = [['Laporan', WG.S.settings.parkName, a.day], [], ['Metrik', 'Nilai'],
          ['Total masuk', a.totalIn], ['Total keluar', a.totalOut], ['Ditolak', a.denied], ['Override manual', a.manual],
          ...(hasTariff() ? [['Estimasi pendapatan (Rp)', Math.round(a.revenue)]] : []),
          ['Rata-rata durasi (menit)', a.dwellN ? Math.round(a.dwellSum / a.dwellN / 60000) : ''], [],
          ['Jam', 'Masuk', 'Keluar'], ...a.inn.map((v, h) => [`${WG.pad(h)}.00`, v, a.out[h]]), [],
          hasTariff() ? ['Kategori', 'Masuk', 'Estimasi Rp'] : ['Kategori', 'Masuk'],
          ...Object.keys(WG.CATEGORIES).map((k) => (hasTariff() ? [WG.CATEGORIES[k].label, a.cat[k] || 0, Math.round(a.catRev[k] || 0)] : [WG.CATEGORIES[k].label, a.cat[k] || 0]))];
        WG.download(`laporan-${a.day}.csv`, WG.csv(rows), 'text/csv;charset=utf-8');
      });
    },
    render() {
      const S = WG.S;
      const days = Array.from(new Set([WG.stats().today, ...S.visits.map((v) => v.day)])).sort().reverse();
      if (!anDay || !days.includes(anDay)) anDay = days[0];
      $('#anDay').innerHTML = days.map((d) => `<option value="${d}" ${d === anDay ? 'selected' : ''}>${d}${d === days[0] && d === WG.stats().today ? ' (hari ini)' : ''}</option>`).join('');
      const a = dayStats(anDay);
      if (!a.totalIn && !a.totalOut && !a.denied && !a.manual) {
        $('#anBody').innerHTML = `<div class="card empty-card"><b>Belum ada data pada ${anDay}.</b><p>Data muncul otomatis setelah ada tap di gate. Untuk melihat tampilan laporan terisi:</p><button class="btn primary" data-demo type="button">Isi Data Demo</button></div>`;
        return;
      }
      const avgDwell = a.dwellN ? WG.fmtDur(a.dwellSum / a.dwellN) : '—';
      const kpi = (l, v, c = '') => `<div class="card kpi"><span>${l}</span><b class="mono ${c}">${v}</b></div>`;
      const gateRows = Object.fromEntries(WG.GATES.map((g) => [g.id, a.gate[g.id] || 0]).filter((r) => r[1]));
      const catRows = Object.keys(WG.CATEGORIES).filter((k) => a.cat[k]).map((k) => `<tr><td>${WG.CATEGORIES[k].label}</td><td class="num">${a.cat[k]}</td><td class="num">${WG.fmtRp(S.settings.prices[k] || 0)}</td><td class="num">${WG.fmtRp(a.catRev[k] || 0)}</td></tr>`).join('');
      $('#anBody').innerHTML = `
        <div class="kpis">
          ${kpi('TOTAL MASUK', a.totalIn, 'c-green')}${kpi('TOTAL KELUAR', a.totalOut, 'c-blue')}
          ${kpi('JAM PUNCAK', a.totalIn ? `${WG.pad(a.peak)}.00 <small>(${a.inn[a.peak]})</small>` : '—', 'c-amber')}
          ${kpi('RATA-RATA DURASI', avgDwell)}${hasTariff() ? kpi('ESTIMASI PENDAPATAN', WG.fmtRp(a.revenue), 'c-gold') : kpi('RATA-RATA / JAM', perHour(a))}
          ${kpi('DITOLAK / MANUAL', `${a.denied} / ${a.manual}`, a.denied + a.manual ? 'c-red' : '')}
        </div>
        <div class="card"><div class="card-head"><h3>KUNJUNGAN PER JAM</h3></div>${hourlyChart(a)}</div>
        <div class="an-grid">
          <div class="card"><div class="card-head"><h3>KATEGORI PENGUNJUNG</h3></div>${donut(a)}</div>
          <div class="card"><div class="card-head"><h3>ASAL KOTA TERBANYAK</h3></div>${hbars(a.city, (k) => k, 'var(--blue)')}</div>
          <div class="card"><div class="card-head"><h3>LALU LINTAS PER GATE</h3></div>${hbars(gateRows, (k) => `${k} • ${WG.gateName(k)}`, 'var(--green)')}</div>
        </div>
        ${hasTariff() ? revenueCard(a, catRows) : ''}`;
    },
  };

  function perHour(a) {
    const hrs = a.inn.map((v, h) => (v ? h : -1)).filter((h) => h >= 0);
    if (!hrs.length) return '—';
    return `${Math.round(a.totalIn / (hrs[hrs.length - 1] - hrs[0] + 1))} <small>orang</small>`;
  }

  function revenueCard(a, catRows) {
    return `<div class="card"><div class="card-head"><h3>RINCIAN PENDAPATAN (ESTIMASI)</h3><span class="hint">tarif dari Pengaturan; bukan data kasir</span></div>
          <div class="table-wrap"><table class="tbl"><thead><tr><th>Kategori</th><th class="num">Masuk</th><th class="num">Harga</th><th class="num">Estimasi</th></tr></thead><tbody>${catRows}</tbody>
          <tfoot><tr><td>Total</td><td class="num">${a.totalIn}</td><td></td><td class="num">${WG.fmtRp(a.revenue)}</td></tr></tfoot></table></div></div>`;
  }

  /* ================================================================== GUESTBOOK + LOGS */
  let lgLimit = 100;
  let rating = 5;

  function filteredLogs() {
    const q = $('#lgQ').value.trim().toLowerCase();
    const dir = $('#lgDir').value, res = $('#lgRes').value, gate = $('#lgGate').value;
    const out = [];
    const vs = WG.S.visits;
    for (let i = vs.length - 1; i >= 0; i--) {
      const v = vs[i];
      if (dir && v.dir !== dir) continue;
      if (res && v.result !== res) continue;
      if (gate && v.gateId !== gate) continue;
      if (q && !`${v.name} ${v.city} ${v.nik.slice(-4)} ${v.reason}`.toLowerCase().includes(q)) continue;
      out.push(v);
    }
    return out;
  }

  function renderStars() {
    $('#gbStars').innerHTML = [1, 2, 3, 4, 5].map((n) => `<button type="button" role="radio" aria-checked="${n === rating}" aria-label="${n} bintang" data-r="${n}" class="${n <= rating ? 'on' : ''}">★</button>`).join('');
  }

  const guestbook = {
    init() {
      $('#lgGate').innerHTML += WG.GATES.map((g) => `<option value="${g.id}">${g.id}</option>`).join('');
      for (const id of ['#lgQ', '#lgDir', '#lgRes', '#lgGate']) $(id).addEventListener('input', () => { lgLimit = 100; this.render(); });
      $('#lgMore').addEventListener('click', () => { lgLimit += 200; this.render(); });
      $('#btnLogCsv').addEventListener('click', () => {
        const rows = [['Waktu (WIB)', 'Hari', 'Arah', 'Hasil', 'Gate', 'Nama', 'NIK (disamarkan)', 'Kategori', 'Kota', 'Provinsi', 'Jumlah', 'Durasi (menit)', 'Catatan']];
        for (const v of filteredLogs()) rows.push([WG.fmtTime(v.ts), v.day, v.dir, v.result, v.gateId, v.name, v.nik ? v.nik.slice(0, 4) + '********' + v.nik.slice(-4) : '', v.category, v.city, v.province, v.count, v.dwell ? Math.round(v.dwell / 60000) : '', v.reason]);
        WG.download(`log-kunjungan-${WG.stats().today}.csv`, WG.csv(rows), 'text/csv;charset=utf-8');
      });
      $('#gbStars').addEventListener('click', (e) => {
        const b = e.target.closest('[data-r]');
        if (b) { rating = +b.dataset.r; renderStars(); }
      });
      $('#gbForm').addEventListener('submit', (e) => {
        e.preventDefault();
        if (!$('#gbText').value.trim()) return;
        WG.addGuestbook({ name: $('#gbName').value, text: $('#gbText').value, rating });
        $('#gbForm').reset();
        rating = 5;
        renderStars();
        WG.toast('Terima kasih! Pesan Anda tersimpan.');
      });
      renderStars();
    },
    render() {
      const rows = filteredLogs();
      const shown = rows.slice(0, lgLimit);
      $('#lgTable').innerHTML = `<thead><tr><th>Waktu</th><th>Arah</th><th>Hasil</th><th>Gate</th><th>Pengunjung</th><th>NIK</th><th>Kategori</th><th>Kota</th><th>Catatan</th></tr></thead><tbody>${
        shown.map((v) => {
          const [cls, lab] = RESULT[v.result];
          return `<tr><td class="mono">${WG.fmtTime(v.ts)}</td><td><span class="badge ${v.dir === 'IN' ? 'in' : 'out'}">${v.dir === 'IN' ? 'MASUK' : 'KELUAR'}</span></td><td><span class="badge ${cls}">${lab}</span></td><td class="mono">${v.gateId}</td><td>${esc(v.name || '—')}${v.count > 1 ? ` <em>×${v.count}</em>` : ''}</td><td class="mono dim">${v.nik ? WG.maskNik(v.nik) : '—'}</td><td>${v.category ? WG.CATEGORIES[v.category].label : '—'}</td><td>${esc(v.city || '—')}</td><td class="dim">${esc(v.reason || (v.dwell ? 'durasi ' + WG.fmtDur(v.dwell) : ''))}</td></tr>`;
        }).join('') || '<tr><td colspan="9" class="empty">Tidak ada catatan yang cocok.</td></tr>'}</tbody>`;
      $('#lgCount').textContent = `Menampilkan ${shown.length} dari ${rows.length} catatan`;
      $('#lgMore').hidden = rows.length <= shown.length;

      const gb = WG.S.guestbook.slice().reverse();
      $('#gbList').innerHTML = gb.length
        ? gb.slice(0, 50).map((m) => `<div class="gb-item"><div><b>${esc(m.name)}</b><span class="stars-ro">${'★'.repeat(m.rating)}${'☆'.repeat(5 - m.rating)}</span><time>${WG.fmtHM(m.ts)} • ${WG.dayKey(m.ts)}</time></div><p>${esc(m.text)}</p></div>`).join('')
        : '<div class="empty">Belum ada pesan. Jadilah yang pertama menulis!</div>';
    },
  };

  /* ================================================================== GROUP PASS + INSIGHTS */
  function insights() {
    const S = WG.S, st = WG.stats(), now = Date.now();
    const out = [];
    const add = (level, title, detail) => out.push({ level, title, detail });

    const pct = Math.round(st.occupancy * 100);
    add(pct >= 100 ? 'crit' : pct >= 85 ? 'warn' : 'ok', `Okupansi ${pct}% (${st.inside}/${st.cap})`,
      pct >= 100 ? 'Kapasitas penuh — gate masuk menolak otomatis. Pertimbangkan sistem antre di luar.' : pct >= 85 ? 'Mendekati batas. Siapkan petugas tambahan di pintu masuk.' : `Masih longgar, sisa ${st.free} orang.`);

    let inn = 0, outt = 0;
    for (let i = S.visits.length - 1; i >= 0; i--) {
      const v = S.visits[i];
      if (now - v.ts > 30 * 60e3) break;
      if (v.result !== 'OK') continue;
      if (v.dir === 'IN') inn += v.count; else outt += v.count;
    }
    const net = (inn - outt) / 30;
    if (!inn && !outt) add('info', 'Belum ada lalu lintas 30 menit terakhir', 'Prakiraan kepadatan butuh minimal beberapa tap terbaru.');
    else if (net > 0.05 && st.inside < st.cap) {
      const eta = (st.cap - st.inside) / net;
      add(eta < 90 ? 'warn' : 'info', eta < 600 ? `Perkiraan penuh ±${Math.round(eta)} menit lagi` : 'Arus masuk naik, belum mengancam kapasitas',
        `Dalam 30 menit terakhir: ${inn} masuk, ${outt} keluar (netto ${net >= 0 ? '+' : ''}${(net * 10).toFixed(1)} orang/10 menit). Ekstrapolasi linear — kasar.`);
    } else add('ok', 'Arus stabil atau menurun', `30 menit terakhir: ${inn} masuk, ${outt} keluar.`);

    const ins = WG.GATES.filter((g) => g.dir === 'in');
    const tot = ins.reduce((s, g) => s + (st.gateCount[g.id] || 0), 0);
    if (tot >= 20) {
      const top = ins.reduce((b, g) => ((st.gateCount[g.id] || 0) > (st.gateCount[b.id] || 0) ? g : b), ins[0]);
      const share = (st.gateCount[top.id] || 0) / tot;
      if (share > 0.6) add('warn', `${top.id} menanggung ${Math.round(share * 100)}% antrean masuk`, 'Arahkan pengunjung ke gate masuk lain agar antrean merata.');
    }

    const ap = S.visits.filter((v) => v.day === st.today && v.result === 'DENIED' && /anti-passback|Belum tercatat/i.test(v.reason)).length;
    if (ap >= 3) add('warn', `${ap} penolakan anti-passback hari ini`, 'Pola ini bisa berarti KTP dipinjamkan/dipakai bergantian, atau pengunjung lupa tap keluar. Cek rekaman CCTV di gate terkait.');
    else if (st.denied) add('info', `${st.denied} akses ditolak hari ini`, 'Lihat alasan di Guestbook & Logs.');

    let man = 0;
    for (let i = S.visits.length - 1; i >= 0 && now - S.visits[i].ts <= 60 * 60e3; i--) if (S.visits[i].result === 'MANUAL') man++;
    if (man >= 3) add('warn', `${man} override manual dalam 1 jam`, 'Override sering menembus verifikasi KTP dan tidak ikut hitungan okupansi. Periksa pembaca kartu atau latih petugas.');

    let long = 0;
    for (const k in S.visitors) { const v = S.visitors[k]; if (v.inside && v.enteredAt && now - v.enteredAt > 6 * 3600e3) long++; }
    if (long) add('warn', `${long} pengunjung tercatat di dalam > 6 jam`, 'Kemungkinan lupa tap keluar. Hitungan okupansi jadi terlalu tinggi sampai diperbaiki (Reset Hari Ini saat tutup).');

    const gIn = S.groups.filter((g) => g.inside).reduce((s, g) => s + g.inside, 0);
    const gWait = S.groups.filter((g) => !g.inside);
    if (gIn || gWait.length) add('info', `Group pass: ${gIn} orang di dalam, ${gWait.length} rombongan terdaftar belum masuk`, gWait.length ? `Potensi tambahan ${gWait.reduce((s, g) => s + g.size, 0)} orang — pastikan ada ruang di kapasitas.` : 'Semua rombongan terdaftar sudah masuk.');

    if (st.todayIn >= 10) {
      const peak = st.hourIn.reduce((b, v, h) => (v > st.hourIn[b] ? h : b), 0);
      add('info', `Jam puncak sejauh ini: ${WG.pad(peak)}.00 (${st.hourIn[peak]} masuk)`, 'Jadwalkan petugas & kebersihan menyesuaikan jam ini.');
    }
    return out;
  }

  function gateFor(dir) {
    const t = WG.gateById(WG.S.target);
    return t.dir === dir ? t.id : dir === 'in' ? 'GM-03' : 'GK-03';
  }

  const group = {
    init() {
      $('#gpCat').innerHTML = Object.entries(WG.CATEGORIES).map(([k, c]) => `<option value="${k}">${c.label}</option>`).join('');
      $('#gpForm').addEventListener('submit', (e) => {
        e.preventDefault();
        const size = Math.round(+$('#gpSize').value);
        if (!(size >= 2 && size <= 500)) return WG.toast('Jumlah rombongan 2–500 orang.', 'err');
        WG.addGroup({ name: $('#gpName').value, leader: $('#gpLeader').value, city: $('#gpCity').value, category: $('#gpCat').value, size });
        $('#gpForm').reset();
        $('#gpSize').value = 20;
        WG.toast('Group pass terdaftar.');
      });
      $('#gpList').addEventListener('click', async (e) => {
        const b = e.target.closest('[data-g]');
        if (!b) return;
        const id = b.dataset.id;
        if (b.dataset.g === 'in' || b.dataset.g === 'out') {
          const r = WG.tapGroup(id, gateFor(b.dataset.g));
          if (!r.ok) WG.toast(r.reason, 'err');
        } else if (await WG.confirm('Hapus group pass?', 'Rombongan dihapus dari daftar. Catatan akses yang sudah ada tetap tersimpan.', 'Hapus', true)) WG.removeGroup(id);
      });
    },
    render() {
      const S = WG.S;
      $('#gpHint').textContent = `Masuk via ${gateFor('in')} • keluar via ${gateFor('out')}`;
      $('#gpList').innerHTML = S.groups.length
        ? S.groups.map((g) => {
            const done = !g.inside && S.visits.some((v) => v.groupId === g.id && v.dir === 'OUT' && v.result === 'OK');
            const state = g.inside ? ['ok', `DI DALAM • ${g.inside}`] : done ? ['', 'SELESAI'] : ['amber', 'MENUNGGU'];
            return `<div class="grp"><div><b>${esc(g.name)}</b><small>${esc(g.leader || '—')} • ${esc(g.city || '—')} • ${WG.CATEGORIES[g.category].label} • ${g.size} orang</small></div>
              <span class="badge ${state[0]}">${state[1]}</span>
              <div class="grp-act"><button type="button" class="btn mini primary" data-g="in" data-id="${g.id}" ${g.inside ? 'disabled' : ''}>MASUK</button><button type="button" class="btn mini ghost" data-g="out" data-id="${g.id}" ${g.inside ? '' : 'disabled'}>KELUAR</button><button type="button" class="btn mini ghost" data-g="del" data-id="${g.id}" aria-label="Hapus">${WG.icon('trash')}</button></div></div>`;
          }).join('')
        : '<div class="empty">Belum ada rombongan. Daftarkan di atas, lalu 1 tap membuka gate untuk seluruh anggota.</div>';
      $('#insights').innerHTML = insights().map((i) => `<div class="ins ${i.level}"><b>${esc(i.title)}</b><p>${esc(i.detail)}</p></div>`).join('');
    },
  };

  /* ================================================================== SETTINGS */
  async function loadDemoWithConfirm() {
    if (WG.S.visits.some((v) => !v.sim) && !(await WG.confirm('Isi data demo?', 'Data demo akan bercampur dengan catatan nyata Anda. Data demo bisa dihapus lagi dari Pengaturan.', 'Isi data demo'))) return;
    WG.loadDemo();
    WG.toast('Data demo dimuat.');
  }

  const settings = {
    init() {
      $('#sGates').innerHTML = WG.GATES.map((g) => `<label class="fld span2"><span>${g.id}</span><input data-gate="${g.id}" maxlength="60"></label>`).join('');
      $('#sPrices').innerHTML = Object.entries(WG.CATEGORIES).map(([k, c]) => `<label class="fld"><span>${c.label.toUpperCase()} (Rp)</span><input type="number" min="0" step="500" data-price="${k}"></label>`).join('');
      const S = () => WG.S.settings;
      $('#sName').addEventListener('change', (e) => WG.updateSettings({ parkName: e.target.value.trim() || S().parkName }));
      $('#sSub').addEventListener('change', (e) => WG.updateSettings({ subtitle: e.target.value }));
      $('#sCap').addEventListener('change', (e) => WG.updateSettings({ capacity: e.target.value }));
      $('#sRelock').addEventListener('change', (e) => WG.updateSettings({ relockSec: e.target.value }));
      $('#sAp').addEventListener('change', (e) => WG.updateSettings({ antiPassback: e.target.checked }));
      $('#sSound').addEventListener('change', (e) => WG.updateSettings({ sound: e.target.checked }));
      $('#sAnn').addEventListener('change', (e) => WG.updateSettings({ announcements: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean) }));
      $('#sGates').addEventListener('change', (e) => { const id = e.target.dataset.gate; if (id) WG.updateSettings({ gateNames: { ...S().gateNames, [id]: e.target.value.trim() || S().gateNames[id] } }); });
      $('#sPrices').addEventListener('change', (e) => { const k = e.target.dataset.price; if (k) WG.updateSettings({ prices: { ...S().prices, [k]: e.target.value } }); });

      $('#btnDemo').addEventListener('click', loadDemoWithConfirm);
      $('#btnClearSim').addEventListener('click', async () => { if (await WG.confirm('Hapus data demo?', 'Hanya catatan bertanda demo/simulasi yang dihapus. Catatan nyata tidak disentuh.', 'Hapus data demo', true)) { WG.clearSim(); WG.toast('Data demo dihapus.'); } });
      $('#btnBackup').addEventListener('click', () => WG.download(`wisata-gateway-backup-${WG.stats().today}.json`, WG.exportJson(), 'application/json'));
      $('#fileRestore').addEventListener('change', async (e) => {
        const f = e.target.files[0];
        e.target.value = '';
        if (!f) return;
        try {
          const text = await f.text();
          if (!(await WG.confirm('Restore backup?', 'Seluruh data saat ini akan diganti dengan isi file backup.', 'Restore', true))) return;
          WG.importJson(text);
          WG.toast('Backup dipulihkan.');
        } catch (err) { WG.toast(err.message || 'File backup tidak valid.', 'err'); }
      });
      $('#btnResetToday').addEventListener('click', async () => { if (await WG.confirm('Reset data hari ini?', 'Catatan akses hari ini dihapus dan semua pengunjung dianggap sudah keluar. Gunakan saat tutup operasional. Tidak bisa dibatalkan.', 'Reset hari ini', true)) { WG.resetToday(); WG.toast('Data hari ini direset.'); } });
      $('#btnFactory').addEventListener('click', async () => { if (await WG.confirm('Reset total?', 'SEMUA data & pengaturan dihapus dari browser ini. Pertimbangkan Backup JSON dulu. Tidak bisa dibatalkan.', 'Hapus semuanya', true)) { WG.factoryReset(); WG.toast('Semua data direset.'); } });
    },
    render() {
      const s = WG.S.settings;
      const set = (sel, v) => { const el = $(sel); if (document.activeElement !== el) el.value = v; };
      set('#sName', s.parkName); set('#sSub', s.subtitle); set('#sCap', s.capacity); set('#sRelock', s.relockSec);
      set('#sAnn', s.announcements.join('\n'));
      $('#sAp').checked = s.antiPassback;
      $('#sSound').checked = s.sound;
      $$('#sGates input').forEach((i) => set(`#sGates input[data-gate="${i.dataset.gate}"]`, s.gateNames[i.dataset.gate]));
      $$('#sPrices input').forEach((i) => { if (document.activeElement !== i) i.value = s.prices[i.dataset.price]; });
    },
  };

  Object.assign(WG.views, { tv, analytics, guestbook, group, settings });
})();
