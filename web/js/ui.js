/* Wisata Gateway — shared UI helpers, header, and the Turnstiles Controller view. */
(function () {
  'use strict';
  const WG = window.WG;
  const { esc } = WG;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  WG.$ = $;
  WG.$$ = $$;
  WG.views = {};

  /* ------------------------------------------------------------------ icons */
  const IC = {
    lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    unlock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.5-1.5"/>',
    shield: '<path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z"/><path d="M9 12l2 2 4-4"/>',
    tv: '<rect x="3" y="5" width="18" height="12" rx="2"/><path d="M8 21h8M12 17v4"/>',
    chart: '<path d="M5 20V10M12 20V4M19 20v-7"/>',
    users: '<circle cx="9" cy="8" r="3"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><path d="M16 5.5a3 3 0 0 1 0 5M18 14c2 .8 3 3 3 6"/>',
    spark: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 16v4M17 18h4"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9L7 7M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>',
    volume: '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16 9a4 4 0 0 1 0 6"/>',
    mute: '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M17 9l4 6M21 9l-4 6"/>',
    alert: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18h.01"/>',
    zap: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
    download: '<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>',
    print: '<path d="M7 9V3h10v6M7 17H4v-7h16v7h-3"/><rect x="7" y="14" width="10" height="7"/>',
    card: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M3 10h18M6 15h4"/>',
    camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
    full: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
    sliders: '<path d="M5 4v16M12 4v16M19 4v16"/><circle cx="5" cy="9" r="2" fill="currentColor"/><circle cx="12" cy="15" r="2" fill="currentColor"/><circle cx="19" cy="8" r="2" fill="currentColor"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  };
  WG.icon = (n) => `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[n] || ''}</svg>`;
  WG.hydrateIcons = (root = document) => $$('i[data-ic]', root).forEach((el) => { el.outerHTML = WG.icon(el.dataset.ic); });

  /* ------------------------------------------------------------------ toast + confirm */
  WG.toast = function (msg, kind = 'ok') {
    const t = document.createElement('div');
    t.className = 'toast ' + kind;
    t.textContent = msg;
    $('#toasts').appendChild(t);
    setTimeout(() => t.classList.add('out'), 3000);
    setTimeout(() => t.remove(), 3400);
  };
  WG.on('toast', (d) => WG.toast(d.msg, d.kind));

  WG.confirm = (title, body, okLabel = 'Ya, lanjut', danger = false) =>
    new Promise((res) => {
      const d = $('#dlg');
      $('#dlgTitle').textContent = title;
      $('#dlgBody').textContent = body;
      const ok = $('#dlgOk');
      ok.textContent = okLabel;
      ok.className = 'btn ' + (danger ? 'danger' : 'primary');
      d.returnValue = '';
      d.addEventListener('close', () => res(d.returnValue === 'ok'), { once: true });
      d.showModal();
    });

  WG.download = function (name, text, type) {
    const a = document.createElement('a');
    const url = URL.createObjectURL(new Blob([text], { type }));
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  // CSV with formula-injection guard (names are user-typed and end up in spreadsheets).
  WG.csv = (rows) =>
    '﻿' + rows.map((r) => r.map((c) => {
      let s = String(c == null ? '' : c);
      if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
      return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }).join(',')).join('\r\n');

  /* ------------------------------------------------------------------ header */
  WG.renderHeader = function () {
    const S = WG.S, st = WG.stats();
    $('#parkTitle').textContent = S.settings.parkName;
    $('#parkSub').textContent = S.settings.subtitle;
    document.title = S.settings.parkName;
    $('#hudInside').textContent = st.inside;
    $('#hudCap').textContent = '/' + st.cap;
    $('#hudToday').textContent = st.todayIn;
    $('#hudExited').textContent = st.todayOut;
    $('#hudOcc').textContent = Math.round(st.occupancy * 100) + '%';
    const lit = Math.min(4, Math.ceil(st.occupancy * 4));
    $('#hudBars').innerHTML = [0, 1, 2, 3].map((i) => `<u class="${i < lit ? 'on' : ''}"></u>`).join('');
    const ss = WG.systemStatus();
    const el = $('#sysStatus');
    el.className = 'sys ' + ss.key;
    el.textContent = '● ' + ss.label;
    $('#simPill').hidden = !st.hasSim;
    $('#btnSound').innerHTML = WG.icon(WG.sound ? 'volume' : 'mute');
    $('#btnSound').setAttribute('aria-pressed', WG.sound);
    $('#btnSound').title = WG.sound ? 'Suara aktif di perangkat ini (klik untuk matikan)' : 'Suara mati di perangkat ini (klik untuk aktifkan)';
    $('#offPill').hidden = WG.online;
    $('#offPill').textContent = WG.needToken ? 'MASUKKAN TOKEN' : 'OFFLINE';
    $('#btnPanic').innerHTML = WG.icon('alert') + (S.panic ? 'NORMALKAN' : 'PANIC GATE');
    $('#btnPanic').classList.toggle('active', S.panic);
    $('#btnPanic2').classList.toggle('active', S.panic);
    $('#panic2Label').textContent = S.panic ? 'NORMALKAN (KUNCI SEMUA)' : 'PANIC GATE (BUKA SEMUA)';
  };

  WG.togglePanic = async function () {
    const on = !WG.S.panic;
    const ok = await WG.confirm(
      on ? 'Aktifkan PANIC GATE?' : 'Normalkan mode darurat?',
      on ? 'Seluruh 6 turnstile akan dibuka dan masuk ditutup sampai Anda menormalkan kembali. Gunakan hanya untuk evakuasi.' : 'Seluruh turnstile akan dikunci kembali dan operasional normal dilanjutkan.',
      on ? 'Buka semua gate' : 'Normalkan',
      on
    );
    if (ok) WG.setPanic(on);
  };

  /* ================================================================== CONTROLLER VIEW */
  const STATUS_LABEL = { LOCKED: 'LOCKED', OPEN: 'OPEN', MANUAL: 'MANUAL', DENIED: 'DENIED', PANIC: 'PANIC' };
  const IDLE_LABEL = { LOCKED: 'IDLE', OPEN: 'OPEN', MANUAL: 'MANUAL', DENIED: 'DENIED', PANIC: 'EMERGENCY' };
  let ctrlBuilt = false;

  function buildGates() {
    for (const g of WG.GATES) {
      const el = document.createElement('article');
      el.className = `gate ${g.dir}`;
      el.dataset.gate = g.id;
      el.innerHTML = `
        <span class="ribbon">TARGET</span>
        <div class="gate-top"><span class="gate-no">${String(g.n).padStart(2, '0')}</span><span class="gate-id">${g.id}</span><span class="chip" data-f="chip">LOCKED</span></div>
        <h4 data-f="name"></h4>
        <div class="gate-meta"><span>Passage:</span><b data-f="count">0</b></div>
        <div class="viz"><div class="track"></div><div class="knob"></div><div class="arm"></div><span class="viz-label" data-f="viz">READY FOR TAP</span></div>
        <div class="gate-last" data-f="last"></div>
        <div class="gate-actions">
          <button type="button" class="btn mini" data-act="target">PILIH TARGET</button>
          <button type="button" class="btn mini ghost" data-act="open">${WG.icon('unlock')}Buka</button>
        </div>`;
      $(g.dir === 'in' ? '#wingIn' : '#wingOut').appendChild(el);
    }
  }

  function updateGates(st) {
    const S = WG.S;
    for (const g of WG.GATES) {
      const el = $(`.gate[data-gate="${g.id}"]`);
      const r = WG.rt.gates[g.id];
      const isTarget = S.target === g.id;
      el.dataset.status = r.status;
      el.classList.toggle('target', isTarget);
      $('[data-f=name]', el).textContent = WG.gateName(g.id);
      $('[data-f=chip]', el).textContent = STATUS_LABEL[r.status];
      $('[data-f=count]', el).textContent = st.gateCount[g.id] || 0;
      const last = st.lastByGate[g.id];
      $('[data-f=last]', el).innerHTML = last
        ? `Last: <b>${esc(last.groupId ? last.name : last.name || WG.maskNik(last.nik))}</b>`
        : '<i>No activity yet</i>';
      let viz = 'READY FOR TAP';
      if (r.status === 'OPEN') viz = `ACCESS GRANTED${r.who ? ' • ' + WG.shortName(r.who) : ''}`;
      else if (r.status === 'DENIED') viz = `DENIED • ${r.msg}`;
      else if (r.status === 'MANUAL') viz = 'MANUAL OVERRIDE';
      else if (r.status === 'PANIC') viz = 'EMERGENCY OPEN';
      $('[data-f=viz]', el).textContent = viz;
      const tb = $('[data-act=target]', el);
      tb.innerHTML = isTarget ? '✕ LEPAS TARGET' : 'PILIH TARGET';
      tb.classList.toggle('primary', isTarget);
    }
    // gate selector keeps its own selection; just refresh labels
    const sel = $('#selGate');
    for (const o of sel.options) o.textContent = `${WG.gateName(o.value)} — Status: ${IDLE_LABEL[WG.rt.gates[o.value].status]} (${o.value})`;
    if (document.activeElement !== sel) sel.value = S.target;
  }

  function renderStats(st) {
    const S = WG.S;
    let delta = '';
    if (st.yIn > 0) {
      const d = ((st.todayIn - st.yIn) / st.yIn) * 100;
      delta = `<span class="delta ${d >= 0 ? 'up' : 'down'}" title="Dibanding kemarin pada jam yang sama (${st.yIn} orang)">${d >= 0 ? '+' : ''}${d.toFixed(1)}%</span>`;
    } else delta = '<span class="delta" title="Belum ada data kemarin">—</span>';
    const max = Math.max(1, ...st.winIn);
    const bars = st.winIn.map((v) => `<u style="height:${Math.max(12, (v / max) * 100)}%" class="${v ? 'on' : ''}"></u>`).join('');
    const sensors = Array.from({ length: 8 }, () => '<u class="on"></u>').join('');
    $('#statCards').innerHTML = `
      <div class="card stat">
        <div class="stat-h"><span>TODAY'S VISITORS</span>${delta}</div>
        <div class="big mono">${st.todayIn}</div>
        <div class="progress"><i style="width:${Math.min(100, st.occupancy * 100)}%"></i></div>
        <div class="stat-f"><span>Cap: ${st.cap}</span><span>Sisa: ${st.free} org</span></div>
      </div>
      <div class="card stat">
        <div class="stat-h"><span>ACTIVE INSIDE AREA</span><span class="live-dot"></span></div>
        <div class="big mono c-blue">${st.inside}</div>
        <div class="stat-f"><div class="spark">${bars}</div><span>Avg Dwell: ${st.avgInsideDwell ? WG.fmtDur(st.avgInsideDwell) : '—'}</span></div>
      </div>
      <div class="card stat purple">
        <div class="stat-h"><span>ANTI-PASSBACK GUARD</span><span class="pill ${S.settings.antiPassback ? 'ok' : 'warn'}">${S.settings.antiPassback ? 'ACTIVE' : 'OFF'}</span></div>
        <div class="ap-title">${WG.icon('shield')}<b>${S.settings.antiPassback ? '100% Secure' : 'Dinonaktifkan'}</b></div>
        <p>${S.settings.antiPassback ? '1 KTP = 1x Masuk &amp; 1x Keluar. Mencegah duplikasi tiket &amp; fraud.' : 'Satu KTP bisa dipindai berulang. Aktifkan kembali di Pengaturan.'}</p>
        <div class="stat-f mono"><span>POLICY: ${S.settings.antiPassback ? 'STRICT ANTI-JOKI' : 'RELAXED'}</span><span>${st.denied} ditolak hari ini</span></div>
      </div>
      <div class="card stat">
        <div class="stat-h"><span>HARDWARE TELEMETRY</span><span class="pill sim" title="Perangkat keras belum terhubung — ini simulator">SIMULASI</span></div>
        <div class="ap-title c-green">${WG.icon('zap')}<b>6 Gates Synced</b></div>
        <p>Re-lock delay: <b>${S.settings.relockSec}s</b> • Optical Sensor OK</p>
        <div class="stat-f mono"><span>SENSORS:</span><div class="sensors">${sensors}</div></div>
      </div>`;
  }

  function renderPresets() {
    const S = WG.S;
    const tg = WG.gateById(S.target);
    $('#tapHint').textContent = `Tap ke: ${tg.id} (${tg.dir === 'in' ? 'masuk' : 'keluar'})`;
    $('#presets').innerHTML = WG.presets.map((p) => {
      const inside = p.inside;
      return `<button type="button" class="preset ${inside ? 'inside' : ''} cat-${p.category}" data-nik="${p.nik}">
        <div class="p-top"><span class="mono dim">${p.nik.slice(0, 4)}...${p.nik.slice(-4)}</span><span class="badge ${inside ? 'amber' : p.category}">${inside ? 'Di Dalam' : WG.CATEGORIES[p.category].label}</span></div>
        <b>${esc(p.name)}</b><small>${esc(p.note)}</small><span class="tap">TAP CARD →</span></button>`;
    }).join('');
  }

  function renderTerminal() {
    const lines = WG.S.logs.slice(-60).reverse();
    $('#terminal').innerHTML = lines.length
      ? lines.map((l) => `<div class="log ${l.level.toLowerCase()}"><time>${WG.fmtTime(l.ts)}</time><span class="lvl">${esc(l.level)}</span><p>${esc(l.msg)}</p></div>`).join('')
      : '<div class="empty">Belum ada aktivitas. Tap kartu preset atau isi form e-KTP untuk memulai.</div>';
  }

  function nikHint() {
    const v = $('#fNik').value.replace(/\D/g, '');
    const el = $('#nikHint');
    if (!v) { el.textContent = ''; el.className = 'nik-hint'; return; }
    if (v.length < 16) { el.textContent = `${v.length}/16 digit`; el.className = 'nik-hint'; return; }
    const i = WG.parseNik(v);
    el.className = 'nik-hint ' + (i.valid ? 'good' : 'bad');
    el.textContent = i.valid ? `✓ ${i.province} • ${i.female ? 'Perempuan' : 'Laki-laki'} • lahir ${i.birth} (${i.age} th)` : '✕ ' + i.error;
  }

  function initController() {
    buildGates();
    $('#selGate').innerHTML = WG.GATES.map((g) => `<option value="${g.id}"></option>`).join('');
    $('#selReason').innerHTML = WG.REASONS.map((r) => `<option>${esc(r)}</option>`).join('');
    $('#fCat').innerHTML = Object.entries(WG.CATEGORIES).map(([k, c]) => `<option value="${k}">${c.label}</option>`).join('');
    ctrlBuilt = true;

    $('#selGate').addEventListener('change', (e) => WG.setTarget(e.target.value));

    $('#btnOpen').addEventListener('click', () => WG.manualOpen($('#selGate').value, $('#selReason').value, +$('#selDur').value));
    $('#btnLock').addEventListener('click', () => WG.lockGate($('#selGate').value));
    $('#btnPanic2').addEventListener('click', WG.togglePanic);

    $('.wings').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      const id = btn.closest('.gate').dataset.gate;
      if (btn.dataset.act === 'open') {
        WG.manualOpen(id, $('#selReason').value, +$('#selDur').value || 0);
      } else {
        // PILIH/LEPAS TARGET: releasing falls back to the first gate so there is always a target.
        WG.setTarget(WG.S.target === id ? 'GM-01' : id);
      }
    });

    // Business denials (anti-passback, capacity…) come back as ok:false; transport errors are toasted by the client.
    const doTap = async (p) => {
      const r = await WG.tap({ ...p, gateId: WG.S.target });
      if (!r.ok && !r.error) WG.toast(r.reason, 'err');
      return r;
    };
    $('#presets').addEventListener('click', (e) => {
      const b = e.target.closest('.preset');
      if (!b) return;
      const p = WG.presets.find((x) => x.nik === b.dataset.nik);
      if (p) doTap(p);
    });

    $('#fNik').addEventListener('input', () => {
      const raw = $('#fNik').value.replace(/\D/g, '').slice(0, 16);
      $('#fNik').value = raw;
      nikHint();
      if (raw.length === 16) {
        const i = WG.parseNik(raw);
        if (i.valid) {
          if (!$('#fProv').value) $('#fProv').value = i.province;
          $('#fCat').value = WG.suggestCategory(i);
        }
      }
    });
    $('#btnFill').addEventListener('click', async () => {
      const p = await WG.randomPersona();
      if (!p) return;
      $('#fNik').value = p.nik; $('#fName').value = p.name; $('#fCity').value = p.city; $('#fProv').value = p.province; $('#fCat').value = p.category;
      nikHint();
    });
    $('#ktpForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const r = await doTap({
        nik: $('#fNik').value, name: $('#fName').value, city: $('#fCity').value, province: $('#fProv').value, category: $('#fCat').value,
      });
      if (r.ok) {
        $('#ktpForm').reset();
        nikHint();
      }
    });

    $('#btnAuto').addEventListener('click', () => WG.setAuto(!WG.rt.auto));
  }

  WG.views.controller = {
    init: initController,
    render() {
      if (!ctrlBuilt) return;
      const st = WG.stats();
      renderStats(st);
      updateGates(st);
      renderPresets();
      renderTerminal();
      const b = $('#btnAuto');
      b.textContent = 'AUTO TRAFFIC: ' + (WG.rt.auto ? 'ON' : 'OFF');
      b.classList.toggle('primary', WG.rt.auto);
      b.setAttribute('aria-pressed', WG.rt.auto);
    },
  };
})();
