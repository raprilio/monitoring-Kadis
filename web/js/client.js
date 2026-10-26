/* Wisata Gateway — thin client for the Rust server.
 * All rules (NIK check, anti-passback, capacity, panic, group pass, overrides) and all data live on the
 * server. This file keeps a read-only mirror of the server state, derives display statistics from it,
 * and turns UI actions into API calls. Exposes window.WG. */
(function () {
  'use strict';
  const WG = (window.WG = {});
  const WIB_MS = 7 * 3600 * 1000;

  /* ------------------------------------------------------------------ reference data (labels only) */
  WG.CATEGORIES = {
    umum: { label: 'Umum' },
    pelajar: { label: 'Pelajar' },
    lansia: { label: 'Lansia' },
    mancanegara: { label: 'Mancanegara' },
    vip: { label: 'VIP' },
  };
  WG.GATES = [
    { id: 'GM-01', n: 1, dir: 'in', name: 'Gate Masuk 1 (Utama)' },
    { id: 'GM-02', n: 2, dir: 'in', name: 'Gate Masuk 2 (Reguler)' },
    { id: 'GM-03', n: 3, dir: 'in', name: 'Gate Masuk 3 (VIP & Rombongan)' },
    { id: 'GK-01', n: 4, dir: 'out', name: 'Gate Keluar 1 (Timur)' },
    { id: 'GK-02', n: 5, dir: 'out', name: 'Gate Keluar 2 (Barat)' },
    { id: 'GK-03', n: 6, dir: 'out', name: 'Gate Keluar 3 (Parkir Bus)' },
  ];
  WG.REASONS = [
    'Tiket Fisik / Karcis Barcode Manual',
    'Pembukaan Cepat Petugas di Turnstile',
    'Rombongan / Group Pass',
    'Lansia / Disabilitas / Kursi Roda',
    'Uji Coba Perangkat (Test)',
    'Lainnya (Kebutuhan Operasional)',
  ];

  /* ------------------------------------------------------------------ helpers */
  const pad = (n, l = 2) => String(n).padStart(l, '0');
  WG.pad = pad;
  WG.esc = (s) =>
    String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  WG.dayKey = (ts) => new Date(ts + WIB_MS).toISOString().slice(0, 10);
  WG.hourOf = (ts) => new Date(ts + WIB_MS).getUTCHours();
  WG.fmtTime = (ts) => {
    const d = new Date(ts + WIB_MS);
    return `${pad(d.getUTCHours())}.${pad(d.getUTCMinutes())}.${pad(d.getUTCSeconds())}`;
  };
  WG.fmtHM = (ts) => {
    const d = new Date(ts + WIB_MS);
    return `${pad(d.getUTCHours())}.${pad(d.getUTCMinutes())}`;
  };
  WG.fmtDateLong = (ts) =>
    new Date(ts).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' });
  WG.fmtDur = (ms) => {
    const m = Math.max(0, Math.round(ms / 60000));
    return m < 60 ? `${m}m` : `${Math.floor(m / 60)}j ${pad(m % 60)}m`;
  };
  WG.fmtRp = (n) => 'Rp ' + Math.round(n).toLocaleString('id-ID');
  WG.maskNik = (nik) => (nik && nik.length === 16 ? `${nik.slice(0, 4)}••••••••${nik.slice(-4)}` : '—');
  WG.shortName = (name) => {
    const parts = String(name || '').trim().split(/\s+/);
    return parts.length > 1 ? `${parts[0]} ${parts[1][0]}.` : parts[0] || '—';
  };

  const PROVINCES = {
    11: 'Aceh', 12: 'Sumatera Utara', 13: 'Sumatera Barat', 14: 'Riau', 15: 'Jambi', 16: 'Sumatera Selatan',
    17: 'Bengkulu', 18: 'Lampung', 19: 'Kep. Bangka Belitung', 21: 'Kepulauan Riau', 31: 'DKI Jakarta',
    32: 'Jawa Barat', 33: 'Jawa Tengah', 34: 'DI Yogyakarta', 35: 'Jawa Timur', 36: 'Banten', 51: 'Bali',
    52: 'Nusa Tenggara Barat', 53: 'Nusa Tenggara Timur', 61: 'Kalimantan Barat', 62: 'Kalimantan Tengah',
    63: 'Kalimantan Selatan', 64: 'Kalimantan Timur', 65: 'Kalimantan Utara', 71: 'Sulawesi Utara',
    72: 'Sulawesi Tengah', 73: 'Sulawesi Selatan', 74: 'Sulawesi Tenggara', 75: 'Gorontalo', 76: 'Sulawesi Barat',
    81: 'Maluku', 82: 'Maluku Utara', 91: 'Papua', 92: 'Papua Barat', 99: 'Mancanegara (Tourist Pass)',
  };

  /** Instant form hint only. The authoritative check (same rules) runs in Rust (src/util.rs). */
  WG.parseNik = function (nik) {
    if (!/^\d{16}$/.test(nik || '')) return { valid: false, error: 'NIK harus 16 digit angka' };
    const province = PROVINCES[+nik.slice(0, 2)];
    if (!province) return { valid: false, error: 'Kode provinsi tidak dikenal' };
    let dd = +nik.slice(6, 8);
    const mm = +nik.slice(8, 10);
    const yy = +nik.slice(10, 12);
    const female = dd > 40;
    if (female) dd -= 40;
    const now = new Date(WG.now() + WIB_MS);
    const nowY = now.getUTCFullYear();
    const year = 2000 + yy <= nowY ? 2000 + yy : 1900 + yy;
    const d = new Date(Date.UTC(year, mm - 1, dd));
    if (d.getUTCFullYear() !== year || d.getUTCMonth() !== mm - 1 || d.getUTCDate() !== dd)
      return { valid: false, error: 'Tanggal lahir pada NIK tidak valid' };
    const age = nowY - year - (now.getTime() < Date.UTC(nowY, mm - 1, dd) ? 1 : 0);
    return { valid: true, province, female, age, birth: `${pad(dd)}-${pad(mm)}-${year}` };
  };
  WG.suggestCategory = (info) => {
    if (!info.valid) return 'umum';
    if (info.province.startsWith('Mancanegara')) return 'mancanegara';
    if (info.age >= 60) return 'lansia';
    if (info.age <= 17) return 'pelajar';
    return 'umum';
  };

  /* ------------------------------------------------------------------ pub/sub */
  const handlers = {};
  WG.on = (ev, fn) => (handlers[ev] = handlers[ev] || []).push(fn);
  WG.emit = (ev, d) => (handlers[ev] || []).forEach((fn) => fn(d));

  /* ------------------------------------------------------------------ mirrored server state */
  const emptyState = () => ({
    settings: {
      parkName: 'WISATA GATEWAY', subtitle: '', capacity: 300, relockSec: 4, antiPassback: true,
      gateNames: Object.fromEntries(WG.GATES.map((g) => [g.id, g.name])),
      prices: { umum: 25000, pelajar: 15000, lansia: 15000, mancanegara: 75000, vip: 0 },
      announcements: [],
    },
    visitors: {}, groups: [], visits: [], logs: [], guestbook: [], panic: false, target: 'GM-01',
  });
  const emptyRt = () => ({
    gates: Object.fromEntries(WG.GATES.map((g) => [g.id, { status: 'LOCKED', msg: '', who: '' }])),
    auto: false, startedAt: 0,
  });
  let S = emptyState();
  let rt = emptyRt();
  let version = 0;
  let clockOffset = 0; // server time - local time, so every screen shows the server's clock
  let cache = null;
  WG.presets = [];
  WG.online = false;
  Object.defineProperty(WG, 'S', { get: () => S });
  Object.defineProperty(WG, 'rt', { get: () => rt });
  WG.now = () => Date.now() + clockOffset;
  WG.touch = () => { cache = null; WG.emit('change'); };

  // The target gate is a per-operator UI selection, not shared state.
  let target = 'GM-01';
  try { target = WG.GATES.some((g) => g.id === localStorage.getItem('wg.target')) ? localStorage.getItem('wg.target') : 'GM-01'; } catch (e) { /* private mode */ }
  S.target = target;
  WG.setTarget = (id) => {
    if (!WG.GATES.some((g) => g.id === id)) return;
    target = id;
    S.target = id;
    try { localStorage.setItem('wg.target', id); } catch (e) { /* ignore */ }
    WG.emit('change');
  };

  WG.gateById = (id) => WG.GATES.find((g) => g.id === id);
  WG.gateName = (id) => S.settings.gateNames[id] || WG.gateById(id).name;

  /* ------------------------------------------------------------------ sound (per device) */
  WG.sound = true;
  try { WG.sound = localStorage.getItem('wg.sound') !== 'off'; } catch (e) { /* ignore */ }
  WG.setSound = (on) => {
    WG.sound = !!on;
    try { localStorage.setItem('wg.sound', on ? 'on' : 'off'); } catch (e) { /* ignore */ }
    WG.emit('change');
  };
  let actx = null;
  WG.beep = function (kind) {
    if (!WG.sound) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume();
      const seq = { ok: [[880, 0.09]], deny: [[220, 0.14], [180, 0.2]], manual: [[660, 0.08], [880, 0.08]], panic: [[900, 0.25], [600, 0.25], [900, 0.25], [600, 0.25]] }[kind] || [];
      let t = actx.currentTime;
      for (const [f, dur] of seq) {
        const o = actx.createOscillator(), g = actx.createGain();
        o.type = kind === 'deny' || kind === 'panic' ? 'square' : 'sine';
        o.frequency.value = f;
        g.gain.setValueAtTime(0.05, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g).connect(actx.destination);
        o.start(t);
        o.stop(t + dur);
        t += dur + 0.03;
      }
    } catch (e) { /* audio is optional */ }
  };

  /* ------------------------------------------------------------------ API */
  let token = '';
  try { token = sessionStorage.getItem('wg.token') || ''; } catch (e) { /* ignore */ }

  async function api(method, path, body, retry = true) {
    const headers = {};
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (token) headers['x-wg-token'] = token;
    const res = await fetch('/api' + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    if (res.status === 401) {
      try { sessionStorage.removeItem('wg.token'); } catch (e) { /* ignore */ }
      token = '';
      const t = retry ? window.prompt('Token petugas diperlukan (WG_TOKEN di server):') : null;
      if (t) {
        token = t;
        try { sessionStorage.setItem('wg.token', t); } catch (e) { /* ignore */ }
        return api(method, path, body, false);
      }
      const err = new Error('Token petugas diperlukan');
      err.auth = true;
      throw err;
    }
    let data = null;
    try { data = await res.json(); } catch (e) { /* non-JSON error body */ }
    if (!res.ok) throw new Error((data && data.reason) || `Server menjawab ${res.status}`);
    return data;
  }

  /** Runs a command. Returns {ok, reason}; transport/validation failures come back with error:true and are toasted here. */
  async function act(method, path, body) {
    try {
      const r = await api(method, path, body);
      return r && typeof r.ok === 'boolean' ? r : { ok: true, ...(r || {}) };
    } catch (e) {
      WG.toast(e.message, 'err');
      return { ok: false, reason: e.message, error: true };
    }
  }

  WG.tap = (p) => act('POST', '/tap', { nik: p.nik, name: p.name, city: p.city, province: p.province, category: p.category, gateId: p.gateId });
  WG.tapGroup = (groupId, gateId) => act('POST', '/tap-group', { groupId, gateId });
  WG.manualOpen = (gateId, reason, seconds) => act('POST', '/manual-open', { gateId, reason, seconds });
  WG.lockGate = (gateId) => act('POST', '/lock', { gateId });
  WG.setPanic = (on) => act('POST', '/panic', { on });
  WG.setAuto = (on) => act('POST', '/auto', { on });
  WG.addGroup = (g) => act('POST', '/groups', g);
  WG.removeGroup = (id) => act('DELETE', '/groups/' + encodeURIComponent(id));
  WG.addGuestbook = (m) => act('POST', '/guestbook', m);
  WG.updateSettings = (patch) => act('PATCH', '/settings', patch);
  WG.loadDemo = () => act('POST', '/demo');
  WG.clearSim = () => act('POST', '/clear-sim');
  WG.resetToday = () => act('POST', '/reset-today');
  WG.factoryReset = () => act('POST', '/factory-reset');
  WG.randomPersona = async () => {
    try { return await api('GET', '/persona'); } catch (e) { WG.toast(e.message, 'err'); return null; }
  };
  WG.exportBackup = async function () {
    try {
      const headers = token ? { 'x-wg-token': token } : {};
      const res = await fetch('/api/export', { headers });
      if (!res.ok) throw new Error(res.status === 401 ? 'Token petugas diperlukan' : `Server menjawab ${res.status}`);
      WG.download(`wisata-gateway-backup-${WG.stats().today}.json`, await res.text(), 'application/json');
    } catch (e) { WG.toast(e.message, 'err'); }
  };
  WG.importJson = async function (text) {
    let obj;
    try { obj = JSON.parse(text); } catch (e) { WG.toast('File bukan JSON yang valid.', 'err'); return { ok: false, error: true }; }
    return act('POST', '/import', obj);
  };

  /* ------------------------------------------------------------------ sync (long-poll) */
  let lastVisitTs = null;
  let lastPanic = null;

  function soundForNewEvents() {
    const fresh = lastVisitTs === null ? [] : S.visits.filter((v) => v.ts > lastVisitTs).slice(-8);
    if (S.visits.length) lastVisitTs = Math.max(lastVisitTs || 0, S.visits[S.visits.length - 1].ts);
    else if (lastVisitTs === null) lastVisitTs = 0;
    if (lastPanic !== null && S.panic !== lastPanic) WG.beep('panic');
    else if (fresh.some((v) => v.result === 'DENIED')) WG.beep('deny');
    else if (fresh.some((v) => v.result === 'OK')) WG.beep('ok');
    else if (fresh.length) WG.beep('manual');
    lastPanic = S.panic;
  }

  function setOnline(on) {
    if (WG.online === on) return;
    WG.online = on;
    WG.emit('change');
  }

  async function loadState() {
    const d = await api('GET', '/state');
    version = d.version;
    clockOffset = d.now - Date.now();
    S = { ...d.state, target };
    rt = d.rt;
    WG.presets = d.presets;
    cache = null;
    soundForNewEvents();
    setOnline(true);
    WG.emit('change');
  }
  WG.needToken = false; // set after a refused/cancelled token prompt; the header pill lets the operator retry
  WG.reauth = null;
  WG.loadInitial = async () => {
    try { await loadState(); } catch (e) { WG.needToken = !!e.auth; setOnline(false); }
  };

  WG.startSync = async function () {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    for (;;) {
      if (WG.needToken) {
        // Do not nag with a prompt every few seconds: wait until the operator clicks the pill.
        WG.emit('change');
        await new Promise((r) => (WG.reauth = r));
        WG.needToken = false;
        WG.reauth = null;
      }
      try {
        const p = await api('GET', '/poll?since=' + version);
        if (p.version !== version || !WG.online) await loadState();
      } catch (e) {
        setOnline(false);
        version = 0; // after an outage (or server restart) always resync immediately
        if (e.auth) WG.needToken = true;
        else await sleep(2000);
      }
    }
  };

  /* ------------------------------------------------------------------ derived statistics */
  function countInside() {
    let n = 0;
    for (const k in S.visitors) if (S.visitors[k].inside) n++;
    for (const g of S.groups) n += g.inside || 0;
    return n;
  }

  WG.stats = function () {
    if (cache) return cache;
    const now = WG.now();
    const today = WG.dayKey(now);
    const yDay = WG.dayKey(now - 864e5);
    const st = {
      today, inside: countInside(), todayIn: 0, todayOut: 0, denied: 0, manual: 0, yIn: 0,
      gateCount: {}, lastByGate: {}, hourIn: Array(24).fill(0), hourOut: Array(24).fill(0),
      winIn: Array(8).fill(0), dwellSum: 0, dwellN: 0, cap: S.settings.capacity,
    };
    for (let i = S.visits.length - 1; i >= 0; i--) {
      const v = S.visits[i];
      if (v.result === 'OK' && !st.lastByGate[v.gateId]) st.lastByGate[v.gateId] = v;
      if (v.day === yDay && v.result === 'OK' && v.dir === 'IN' && v.ts <= now - 864e5) st.yIn += v.count;
      if (v.day !== today) continue;
      if (v.result === 'DENIED') st.denied++;
      else if (v.result === 'MANUAL') st.manual++;
      else if (v.dir === 'IN') {
        st.todayIn += v.count; st.hourIn[v.hour] += v.count;
        st.gateCount[v.gateId] = (st.gateCount[v.gateId] || 0) + v.count;
        const w = Math.floor((now - v.ts) / 600000);
        if (w >= 0 && w < 8) st.winIn[7 - w] += v.count;
      } else {
        st.todayOut += v.count; st.hourOut[v.hour] += v.count;
        st.gateCount[v.gateId] = (st.gateCount[v.gateId] || 0) + v.count;
        if (v.dwell) { st.dwellSum += v.dwell; st.dwellN++; }
      }
    }
    let sum = 0, n = 0;
    for (const k in S.visitors) { const v = S.visitors[k]; if (v.inside && v.enteredAt) { sum += now - v.enteredAt; n++; } }
    st.avgInsideDwell = n ? sum / n : 0;
    st.occupancy = st.cap ? st.inside / st.cap : 0;
    st.free = Math.max(0, st.cap - st.inside);
    st.hasSim = S.visits.some((v) => v.sim) || Object.values(S.visitors).some((v) => v.sim) || S.groups.some((g) => g.sim) || S.guestbook.some((m) => m.sim);
    return (cache = st);
  };

  WG.systemStatus = function () {
    const st = WG.stats();
    if (S.panic) return { key: 'panic', label: 'EMERGENCY' };
    if (st.inside >= st.cap) return { key: 'full', label: 'CAPACITY FULL' };
    return { key: 'secure', label: 'SECURE' };
  };
})();
