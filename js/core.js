/* Wisata Gateway — core: reference data, state, persistence, access engine, demo data.
 * No dependencies. Everything hangs off window.WG. */
(function () {
  'use strict';
  const WG = (window.WG = {});

  const WIB_MS = 7 * 3600 * 1000; // Asia/Jakarta, no DST
  const STORE_KEY = 'wisata-gateway.v1';
  const MAX_VISITS = 8000;
  const MAX_LOGS = 300;

  /* ------------------------------------------------------------------ reference data */

  WG.CATEGORIES = {
    umum: { label: 'Umum', price: 0 },
    pelajar: { label: 'Pelajar', price: 0 },
    lansia: { label: 'Lansia', price: 0 },
    mancanegara: { label: 'Mancanegara', price: 0 },
    vip: { label: 'VIP', price: 0 },
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
    'KTP-el Tidak Terbaca / Rusak',
    'Pembukaan Cepat Petugas di Turnstile',
    'Rombongan / Group Pass',
    'Lansia / Disabilitas / Kursi Roda',
    'Uji Coba Perangkat (Test)',
    'Lainnya (Kebutuhan Operasional)',
  ];

  // First two digits of a NIK = province code.
  const PROVINCES = {
    11: 'Aceh', 12: 'Sumatera Utara', 13: 'Sumatera Barat', 14: 'Riau', 15: 'Jambi',
    16: 'Sumatera Selatan', 17: 'Bengkulu', 18: 'Lampung', 19: 'Kep. Bangka Belitung',
    21: 'Kepulauan Riau', 31: 'DKI Jakarta', 32: 'Jawa Barat', 33: 'Jawa Tengah',
    34: 'DI Yogyakarta', 35: 'Jawa Timur', 36: 'Banten', 51: 'Bali', 52: 'Nusa Tenggara Barat',
    53: 'Nusa Tenggara Timur', 61: 'Kalimantan Barat', 62: 'Kalimantan Tengah',
    63: 'Kalimantan Selatan', 64: 'Kalimantan Timur', 65: 'Kalimantan Utara',
    71: 'Sulawesi Utara', 72: 'Sulawesi Tengah', 73: 'Sulawesi Selatan', 74: 'Sulawesi Tenggara',
    75: 'Gorontalo', 76: 'Sulawesi Barat', 81: 'Maluku', 82: 'Maluku Utara',
    91: 'Papua', 92: 'Papua Barat', 99: 'Mancanegara (Tourist Pass)',
  };

  const CITIES = [
    { city: 'Jakarta Pusat', province: 'DKI Jakarta', code: '3173', w: 9 },
    { city: 'Bandung', province: 'Jawa Barat', code: '3273', w: 10 },
    { city: 'Bogor', province: 'Jawa Barat', code: '3271', w: 6 },
    { city: 'Depok', province: 'Jawa Barat', code: '3276', w: 5 },
    { city: 'Bekasi', province: 'Jawa Barat', code: '3275', w: 5 },
    { city: 'Tangerang', province: 'Banten', code: '3671', w: 5 },
    { city: 'Semarang', province: 'Jawa Tengah', code: '3374', w: 5 },
    { city: 'Surakarta', province: 'Jawa Tengah', code: '3372', w: 3 },
    { city: 'Sleman', province: 'DI Yogyakarta', code: '3404', w: 4 },
    { city: 'Surabaya', province: 'Jawa Timur', code: '3578', w: 6 },
    { city: 'Malang', province: 'Jawa Timur', code: '3573', w: 4 },
    { city: 'Denpasar', province: 'Bali', code: '5171', w: 2 },
    { city: 'Medan', province: 'Sumatera Utara', code: '1271', w: 2 },
    { city: 'Palembang', province: 'Sumatera Selatan', code: '1671', w: 2 },
    { city: 'Makassar', province: 'Sulawesi Selatan', code: '7371', w: 2 },
  ];
  const ABROAD = ['Amsterdam', 'Kuala Lumpur', 'Singapore', 'Tokyo', 'Melbourne', 'Seoul'];

  const MALE = ['Budi', 'Agus', 'Dedi', 'Eko', 'Rizky', 'Fajar', 'Andi', 'Hendra', 'Wahyu', 'Yusuf', 'Dimas', 'Bayu', 'Iwan', 'Rangga'];
  const FEMALE = ['Siti', 'Ani', 'Dewi', 'Rina', 'Putri', 'Lestari', 'Maya', 'Nur', 'Wulan', 'Sari', 'Intan', 'Ayu', 'Yuni', 'Fitri'];
  const LAST = ['Santoso', 'Pratama', 'Wijaya', 'Hidayat', 'Saputra', 'Rahayu', 'Nugroho', 'Kusuma', 'Permana', 'Lestari', 'Firmansyah', 'Maulana', 'Utami', 'Setiawan', 'Siregar', 'Hasibuan'];
  const FOREIGN = ['Kevin Van Der Berg', 'Emma Johnson', 'Haruto Tanaka', 'Lim Wei Jie', 'Sophie Martin', 'Daniel Park', 'Olivia Brown'];

  WG.PRESETS = [
    { nik: '3171011503850003', name: 'Bambang Trianto', city: 'Jakarta Pusat', province: 'DKI Jakarta', category: 'umum', note: 'Jakarta • Status: Luar Area' },
    { nik: '3273045207920004', name: 'Siti Nurhaliza Putri', city: 'Bandung', province: 'Jawa Barat', category: 'umum', note: 'Bandung • Uji Anti-Passback' },
    { nik: '9901010502880008', name: 'Kevin Van Der Berg', city: 'Amsterdam', province: 'Mancanegara (Tourist Pass)', category: 'mancanegara', note: 'Amsterdam • Tourist Pass' },
    { nik: '3578062009100001', name: 'Raditya Bagus Pratama', city: 'Surabaya', province: 'Jawa Timur', category: 'pelajar', note: 'Surabaya • Pelajar' },
    { nik: '3404094505550002', name: 'Hj. Sri Rahayu', city: 'Sleman', province: 'DI Yogyakarta', category: 'lansia', note: 'Sleman, DI. Yogyakarta' },
    { nik: '3204081807700003', name: 'Drs. Hendra Permana', city: 'Bandung', province: 'Jawa Barat', category: 'vip', note: 'Bandung • Tamu Khusus' },
  ];

  /* ------------------------------------------------------------------ helpers */

  const pad = (n, l = 2) => String(n).padStart(l, '0');
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const rint = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);

  WG.pad = pad;
  WG.uid = uid;
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

  /** Structural check of an Indonesian NIK: 16 digits, known province, plausible birth date.
   *  It does NOT prove the card is genuine — that needs the Dukcapil/e-KTP chip reader. */
  WG.parseNik = function (nik) {
    if (!/^\d{16}$/.test(nik || '')) return { valid: false, error: 'NIK harus 16 digit angka' };
    const province = PROVINCES[+nik.slice(0, 2)];
    if (!province) return { valid: false, error: 'Kode provinsi tidak dikenal' };
    let dd = +nik.slice(6, 8);
    const mm = +nik.slice(8, 10);
    const yy = +nik.slice(10, 12);
    const female = dd > 40;
    if (female) dd -= 40;
    const nowY = new Date(Date.now() + WIB_MS).getUTCFullYear();
    const year = 2000 + yy <= nowY ? 2000 + yy : 1900 + yy;
    const d = new Date(Date.UTC(year, mm - 1, dd));
    if (d.getUTCFullYear() !== year || d.getUTCMonth() !== mm - 1 || d.getUTCDate() !== dd)
      return { valid: false, error: 'Tanggal lahir pada NIK tidak valid' };
    const age = nowY - year - (Date.now() + WIB_MS < Date.UTC(nowY, mm - 1, dd) ? 1 : 0);
    return { valid: true, province, female, age, birth: `${pad(dd)}-${pad(mm)}-${year}` };
  };

  WG.suggestCategory = (info) => {
    if (!info.valid) return 'umum';
    if (info.province.startsWith('Mancanegara')) return 'mancanegara';
    if (info.age >= 60) return 'lansia';
    if (info.age <= 17) return 'pelajar';
    return 'umum';
  };

  const makeNik = (code, y, m, d, female, serial) =>
    `${code}01${pad(d + (female ? 40 : 0))}${pad(m)}${pad(y % 100)}${pad(serial, 4)}`;

  const weighted = (list) => {
    let r = Math.random() * list.reduce((s, x) => s + x.w, 0);
    for (const x of list) if ((r -= x.w) < 0) return x;
    return list[0];
  };

  WG.randomPersona = function () {
    const nowY = new Date(Date.now() + WIB_MS).getUTCFullYear();
    for (let tries = 0; tries < 20; tries++) {
      const roll = Math.random();
      const p = {};
      if (roll < 0.07) {
        p.category = 'mancanegara';
        p.name = pick(FOREIGN);
        p.city = pick(ABROAD);
        p.province = PROVINCES[99];
        p.nik = makeNik('9901', nowY - rint(20, 60), rint(1, 12), rint(1, 28), false, rint(1, 9999));
      } else {
        const c = weighted(CITIES);
        const female = Math.random() < 0.5;
        const seg = Math.random();
        let age = rint(19, 55);
        p.category = 'umum';
        if (seg < 0.18) { age = rint(8, 17); p.category = 'pelajar'; }
        else if (seg < 0.28) { age = rint(60, 78); p.category = 'lansia'; }
        else if (seg < 0.30) p.category = 'vip';
        p.name = `${pick(female ? FEMALE : MALE)} ${pick(LAST)}`;
        p.city = c.city;
        p.province = c.province;
        p.nik = makeNik(c.code, nowY - age, rint(1, 12), rint(1, 28), female, rint(1, 9999));
      }
      if (!S.visitors[p.nik]) return p;
    }
    return null;
  };

  /* ------------------------------------------------------------------ state */

  const defaults = () => ({
    v: 1,
    settings: {
      parkName: 'WISATA GATEWAY',
      subtitle: 'TAMAN WISATA ALAM NUSANTARA • DIGITAL GUESTBOOK & ACCESS CONTROLLER',
      capacity: 300,
      relockSec: 4,
      antiPassback: true,
      sound: true,
      gateNames: Object.fromEntries(WG.GATES.map((g) => [g.id, g.name])),
      prices: Object.fromEntries(Object.entries(WG.CATEGORIES).map(([k, c]) => [k, c.price])),
      announcements: [
        'Selamat datang di Taman Wisata Alam Nusantara',
        'Harap jaga kebersihan dan buang sampah pada tempatnya',
        'Anak-anak wajib didampingi orang dewasa',
        'Tap KTP-el Anda di turnstile saat masuk dan saat keluar — satu KTP untuk satu kali masuk',
      ],
    },
    visitors: {}, // nik -> {nik,name,city,province,category,inside,enteredAt,sim}
    groups: [], // {id,name,leader,city,category,size,inside,enteredAt,sim}
    visits: [], // access attempts, chronological
    logs: [], // terminal lines
    guestbook: [],
    target: 'GM-01',
    panic: false,
  });

  const str = (x, max, def = '') => (typeof x === 'string' ? x.slice(0, max) : def);
  const num = (x, min, max, def) => (Number.isFinite(+x) ? Math.min(max, Math.max(min, +x)) : def);
  const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);
  const gateIds = WG.GATES.map((g) => g.id);

  /** Rebuilds a state object from untrusted JSON (localStorage or an imported backup). */
  function sanitize(o) {
    const d = defaults();
    if (!isObj(o)) return d;
    if (isObj(o.settings)) {
      const s = o.settings, t = d.settings;
      t.parkName = str(s.parkName, 60, t.parkName) || t.parkName;
      t.subtitle = str(s.subtitle, 160, t.subtitle);
      t.capacity = Math.round(num(s.capacity, 1, 100000, t.capacity));
      t.relockSec = num(s.relockSec, 1, 30, t.relockSec);
      t.antiPassback = s.antiPassback !== false;
      t.sound = s.sound !== false;
      if (isObj(s.gateNames)) for (const id of gateIds) t.gateNames[id] = str(s.gateNames[id], 60, t.gateNames[id]) || t.gateNames[id];
      if (isObj(s.prices)) for (const k of Object.keys(t.prices)) t.prices[k] = num(s.prices[k], 0, 1e8, t.prices[k]);
      if (Array.isArray(s.announcements)) t.announcements = s.announcements.slice(0, 20).map((a) => str(a, 140)).filter(Boolean);
    }
    if (isObj(o.visitors))
      for (const [nik, v] of Object.entries(o.visitors)) {
        if (!/^\d{16}$/.test(nik) || !isObj(v)) continue;
        d.visitors[nik] = {
          nik, name: str(v.name, 80), city: str(v.city, 60), province: str(v.province, 60),
          category: WG.CATEGORIES[v.category] ? v.category : 'umum',
          inside: v.inside === true, enteredAt: num(v.enteredAt, 0, 4e12, 0), sim: v.sim === true,
        };
      }
    if (Array.isArray(o.groups))
      d.groups = o.groups.filter(isObj).slice(0, 200).map((g) => ({
        id: str(g.id, 20) || uid(), name: str(g.name, 80), leader: str(g.leader, 80), city: str(g.city, 60),
        category: WG.CATEGORIES[g.category] ? g.category : 'umum', size: Math.round(num(g.size, 1, 100000, 1)),
        inside: Math.round(num(g.inside, 0, 100000, 0)), enteredAt: num(g.enteredAt, 0, 4e12, 0), sim: g.sim === true,
      }));
    if (Array.isArray(o.visits))
      d.visits = o.visits.filter((v) => isObj(v) && Number.isFinite(v.ts)).slice(-MAX_VISITS).map((v) => ({
        id: str(v.id, 20) || uid(), ts: v.ts, day: WG.dayKey(v.ts), hour: WG.hourOf(v.ts),
        gateId: gateIds.includes(v.gateId) ? v.gateId : 'GM-01', dir: v.dir === 'OUT' ? 'OUT' : 'IN',
        result: ['OK', 'DENIED', 'MANUAL'].includes(v.result) ? v.result : 'OK',
        nik: str(v.nik, 16), name: str(v.name, 80), city: str(v.city, 60), province: str(v.province, 60),
        category: WG.CATEGORIES[v.category] ? v.category : '', count: Math.round(num(v.count, 1, 100000, 1)),
        groupId: str(v.groupId, 20), reason: str(v.reason, 120), dwell: num(v.dwell, 0, 4e9, 0), sim: v.sim === true,
      }));
    if (Array.isArray(o.logs))
      d.logs = o.logs.filter((l) => isObj(l) && Number.isFinite(l.ts)).slice(-MAX_LOGS)
        .map((l) => ({ ts: l.ts, level: str(l.level, 6, 'SYS'), msg: str(l.msg, 300) }));
    if (Array.isArray(o.guestbook))
      d.guestbook = o.guestbook.filter((m) => isObj(m) && Number.isFinite(m.ts)).slice(-500)
        .map((m) => ({ ts: m.ts, name: str(m.name, 60, 'Anonim'), text: str(m.text, 400), rating: Math.round(num(m.rating, 1, 5, 5)), sim: m.sim === true }));
    if (gateIds.includes(o.target)) d.target = o.target;
    d.panic = o.panic === true;
    return d;
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      return raw ? sanitize(JSON.parse(raw)) : defaults();
    } catch (e) {
      return defaults();
    }
  }

  let S = load();
  Object.defineProperty(WG, 'S', { get: () => S });

  // Runtime-only state (not persisted)
  const rt = {
    gates: Object.fromEntries(gateIds.map((id) => [id, { status: 'LOCKED', msg: '', who: '', timer: null }])),
    auto: false,
    startedAt: Date.now(),
  };
  WG.rt = rt;

  let saveTimer = null;
  let saveFailed = false;
  function saveNow() {
    clearTimeout(saveTimer);
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(S));
      saveFailed = false;
    } catch (e) {
      if (!saveFailed) WG.emit('toast', { msg: 'Penyimpanan browser penuh/ditolak — data sesi ini tidak tersimpan permanen.', kind: 'err' });
      saveFailed = true;
    }
  }
  WG.saveNow = saveNow;
  window.addEventListener('beforeunload', saveNow);

  /* ------------------------------------------------------------------ pub/sub */

  const handlers = {};
  WG.on = (ev, fn) => (handlers[ev] = handlers[ev] || []).push(fn);
  WG.emit = (ev, d) => (handlers[ev] || []).forEach((fn) => fn(d));

  let cache = null;
  function dirty() {
    cache = null;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 400);
    WG.emit('change');
  }
  WG.touch = dirty;

  /* ------------------------------------------------------------------ gates + sound */

  WG.gateById = (id) => WG.GATES.find((g) => g.id === id);
  WG.gateName = (id) => S.settings.gateNames[id] || WG.gateById(id).name;

  let actx = null;
  function beep(kind) {
    if (!S.settings.sound) return;
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
  }
  WG.beep = beep;

  function setGate(id, status, msg, ms, who) {
    const g = rt.gates[id];
    clearTimeout(g.timer);
    if (S.panic && status !== 'PANIC') {
      if (who) g.who = who; // gates stay open during an emergency; just remember who passed
      return;
    }
    g.status = status;
    g.msg = msg || '';
    if (who !== undefined) g.who = who;
    if (status !== 'LOCKED' && ms) {
      g.timer = setTimeout(() => {
        g.status = S.panic ? 'PANIC' : 'LOCKED';
        g.msg = '';
        WG.emit('change');
      }, ms);
    }
  }

  function record(rec) {
    rec.id = uid();
    rec.ts = rec.ts || Date.now();
    rec.day = WG.dayKey(rec.ts);
    rec.hour = WG.hourOf(rec.ts);
    rec.count = rec.count || 1;
    S.visits.push(rec);
    if (S.visits.length > MAX_VISITS) S.visits.splice(0, S.visits.length - MAX_VISITS);
    return rec;
  }

  function log(level, msg, ts) {
    S.logs.push({ ts: ts || Date.now(), level, msg });
    if (S.logs.length > MAX_LOGS) S.logs.splice(0, S.logs.length - MAX_LOGS);
  }

  const dirWord = (rec) => (rec.dir === 'IN' ? 'MASUK' : 'KELUAR');
  const who = (rec) => `${rec.name || '—'}${rec.nik ? ` (${WG.maskNik(rec.nik)})` : ''}${rec.count > 1 ? ` ×${rec.count}` : ''}`;

  function deny(gate, rec, reason) {
    rec.result = 'DENIED';
    rec.reason = reason;
    record(rec);
    log('DENY', `${dirWord(rec)} ditolak @ ${WG.gateName(gate.id)} — ${who(rec)}: ${reason}`);
    setGate(gate.id, 'DENIED', reason, 2200, '');
    beep('deny');
    dirty();
    return { ok: false, reason };
  }

  function grant(gate, rec) {
    rec.result = 'OK';
    record(rec);
    log('OK', `${dirWord(rec)} diizinkan @ ${WG.gateName(gate.id)} — ${who(rec)}${rec.dwell ? ` • durasi ${WG.fmtDur(rec.dwell)}` : ''}`);
    setGate(gate.id, 'OPEN', `ACCESS GRANTED`, S.settings.relockSec * 1000, rec.name);
    beep('ok');
    dirty();
    return { ok: true };
  }

  /* ------------------------------------------------------------------ engine */

  /** Pure count of people currently inside (individuals + group passes). */
  function countInside() {
    let n = 0;
    for (const k in S.visitors) if (S.visitors[k].inside) n++;
    for (const g of S.groups) n += g.inside || 0;
    return n;
  }

  /** Simulates an e-KTP tap on a gate. p = {nik,name?,city?,province?,category?,gateId,sim?} */
  WG.tap = function (p) {
    const gate = WG.gateById(p.gateId);
    const now = Date.now();
    const nik = String(p.nik || '').replace(/\s|-/g, '');
    const info = WG.parseNik(nik);
    const rec = {
      ts: now, gateId: gate.id, dir: gate.dir === 'in' ? 'IN' : 'OUT', nik,
      name: (p.name || '').trim(), city: (p.city || '').trim(), province: (p.province || '').trim(),
      category: WG.CATEGORIES[p.category] ? p.category : WG.suggestCategory(info), count: 1, sim: !!p.sim,
    };
    if (!info.valid) return deny(gate, rec, info.error);

    let v = S.visitors[nik];
    if (!v) {
      v = S.visitors[nik] = {
        nik, name: rec.name || `Pengunjung (${nik.slice(-4)})`, city: rec.city || '', province: rec.province || info.province,
        category: rec.category, inside: false, enteredAt: 0, sim: !!p.sim,
      };
    } else {
      if (rec.name) v.name = rec.name;
      if (rec.city) v.city = rec.city;
      if (rec.province) v.province = rec.province;
      if (p.category) v.category = rec.category;
    }
    rec.name = v.name; rec.city = v.city; rec.province = v.province; rec.category = v.category;
    const ap = S.settings.antiPassback;

    if (gate.dir === 'in') {
      if (S.panic) return deny(gate, rec, 'Mode darurat aktif — masuk ditutup');
      if (v.inside && ap) return deny(gate, rec, 'Anti-passback: NIK sudah tercatat di dalam');
      if (countInside() + (v.inside ? 0 : 1) > S.settings.capacity) return deny(gate, rec, 'Kapasitas area penuh');
      v.inside = true;
      v.enteredAt = now;
      return grant(gate, rec);
    }
    if (!v.inside && ap && !S.panic) return deny(gate, rec, 'Belum tercatat masuk (anti-passback)');
    if (v.inside && v.enteredAt) rec.dwell = now - v.enteredAt;
    v.inside = false;
    return grant(gate, rec);
  };

  /** Group pass: one tap admits/releases the whole party. */
  WG.tapGroup = function (groupId, gateId) {
    const g = S.groups.find((x) => x.id === groupId);
    const gate = WG.gateById(gateId);
    if (!g) return { ok: false, reason: 'Rombongan tidak ditemukan' };
    const now = Date.now();
    const rec = {
      ts: now, gateId, dir: gate.dir === 'in' ? 'IN' : 'OUT', nik: '', name: g.name, city: g.city, province: '',
      category: g.category, count: g.size, groupId: g.id, sim: !!g.sim,
    };
    if (gate.dir === 'in') {
      if (S.panic) return deny(gate, rec, 'Mode darurat aktif — masuk ditutup');
      if (g.inside) return deny(gate, rec, 'Rombongan sudah tercatat di dalam');
      if (countInside() + g.size > S.settings.capacity) return deny(gate, rec, `Kapasitas tidak cukup untuk ${g.size} orang`);
      g.inside = g.size;
      g.enteredAt = now;
      return grant(gate, rec);
    }
    if (!g.inside) return deny(gate, rec, 'Rombongan belum tercatat masuk');
    rec.count = g.inside;
    rec.dwell = g.enteredAt ? now - g.enteredAt : 0;
    g.inside = 0;
    return grant(gate, rec);
  };

  /** Officer override. seconds = 0 keeps the gate open until locked by hand. */
  WG.manualOpen = function (gateId, reason, seconds) {
    const gate = WG.gateById(gateId);
    const rec = record({ gateId, dir: gate.dir === 'in' ? 'IN' : 'OUT', result: 'MANUAL', reason, name: 'Petugas', count: 1 });
    log('OVR', `Petugas membuka ${WG.gateName(gateId)} secara manual. Alasan: ${reason} (${seconds ? `auto-close ${seconds}s` : 'ditahan terbuka'})`, rec.ts);
    setGate(gateId, 'MANUAL', 'MANUAL OVERRIDE', seconds * 1000, 'Petugas');
    beep('manual');
    dirty();
  };

  WG.lockGate = function (gateId) {
    if (S.panic) return;
    setGate(gateId, 'LOCKED', '', 0, '');
    log('SYS', `Petugas mengunci ${WG.gateName(gateId)}.`);
    dirty();
  };

  WG.setPanic = function (on) {
    S.panic = !!on;
    for (const id of gateIds) {
      if (on) { clearTimeout(rt.gates[id].timer); rt.gates[id].status = 'PANIC'; rt.gates[id].msg = 'EMERGENCY OPEN'; }
      else { rt.gates[id].status = 'LOCKED'; rt.gates[id].msg = ''; }
    }
    log(on ? 'ALERT' : 'SYS', on ? 'PANIC GATE DIAKTIFKAN — seluruh turnstile dibuka, masuk ditutup.' : 'Mode darurat dinormalkan — seluruh turnstile dikunci kembali.');
    beep(on ? 'panic' : 'manual');
    dirty();
  };

  WG.setTarget = function (id) {
    if (!gateIds.includes(id)) return;
    S.target = id;
    dirty();
  };

  WG.updateSettings = function (patch) {
    Object.assign(S.settings, patch);
    S.settings = sanitize({ settings: S.settings }).settings;
    dirty();
  };

  /* ---- groups & guestbook */

  WG.addGroup = function (g) {
    S.groups.unshift({
      id: uid(), name: g.name.trim(), leader: g.leader.trim(), city: g.city.trim(), category: g.category,
      size: g.size, inside: 0, enteredAt: 0, sim: false,
    });
    log('SYS', `Group pass terdaftar: ${g.name.trim()} (${g.size} orang).`);
    dirty();
  };
  WG.removeGroup = function (id) {
    const g = S.groups.find((x) => x.id === id);
    S.groups = S.groups.filter((x) => x.id !== id);
    if (g) log('SYS', `Group pass dihapus: ${g.name}.`);
    dirty();
  };
  WG.addGuestbook = function (m) {
    S.guestbook.push({ ts: Date.now(), name: m.name.trim() || 'Anonim', text: m.text.trim(), rating: m.rating, sim: false });
    dirty();
  };

  /* ---- stats (memoised until the next change) */

  WG.stats = function () {
    if (cache) return cache;
    const now = Date.now();
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
        if (w < 8) st.winIn[7 - w] += v.count;
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

  /* ---- auto traffic (live demo) */

  let autoTimer = null;
  function autoStep() {
    const inside = Object.values(S.visitors).filter((v) => v.inside);
    const ins = WG.GATES.filter((g) => g.dir === 'in'), outs = WG.GATES.filter((g) => g.dir === 'out');
    if (inside.length > 4 && Math.random() < 0.45) {
      WG.tap({ nik: pick(inside).nik, gateId: pick(outs).id, sim: true });
    } else {
      const p = WG.randomPersona();
      if (p) WG.tap({ ...p, gateId: pick(ins).id, sim: true });
    }
  }
  function autoTick() {
    if (!rt.auto) return;
    autoStep();
    autoTimer = setTimeout(autoTick, 1200 + Math.random() * 2300);
  }
  WG.setAuto = function (on) {
    clearTimeout(autoTimer);
    rt.auto = !!on;
    if (on) autoTick();
    WG.emit('change');
  };

  /* ---- demo data + maintenance */

  WG.loadDemo = function () {
    const now = Date.now();
    const dayStart = (ts) => Math.floor((ts + WIB_MS) / 864e5) * 864e5 - WIB_MS;
    const todayStart = dayStart(now);
    const H = 3600e3;
    const ins = ['GM-01', 'GM-01', 'GM-01', 'GM-02', 'GM-02', 'GM-03'];
    const outs = ['GK-01', 'GK-01', 'GK-02', 'GK-02', 'GK-03'];
    const gauss = () => { let s = 0; for (let i = 0; i < 6; i++) s += Math.random(); return (s - 3) / 0.7071; };

    const genDay = (open, close, limit, total) => {
      const made = [];
      for (let i = 0; i < total; i++) {
        const t = Math.round(open + Math.min(8.5, Math.max(0, 3.4 + gauss() * 1.9)) * H);
        if (t > limit) continue;
        const p = WG.randomPersona();
        if (!p) continue;
        const stay = Math.round(Math.max(25 * 60e3, (115 + gauss() * 45) * 60e3));
        const exitAt = Math.min(t + stay, close);
        const person = { ...p, inside: false, enteredAt: t, sim: true };
        S.visitors[p.nik] = person;
        record({ ts: t, gateId: pick(ins), dir: 'IN', result: 'OK', ...p, count: 1, sim: true });
        if (exitAt <= limit) {
          record({ ts: exitAt, gateId: pick(outs), dir: 'OUT', result: 'OK', ...p, count: 1, dwell: exitAt - t, sim: true });
        } else {
          person.inside = true;
        }
        made.push(person);
      }
      return made;
    };

    const yOpen = todayStart - 864e5 + 8 * H;
    genDay(yOpen, yOpen + 9.5 * H, yOpen + 9.5 * H, 255);
    // Opening hours 08:00; outside 09-17h anchor the busy period to "now" so the demo is never empty.
    const hourNow = WG.hourOf(now);
    let tOpen = hourNow >= 9 && hourNow <= 17 ? todayStart + 8 * H : Math.max(todayStart, now - 9 * H);
    if (now - tOpen < 40 * 60e3) tOpen = now - 3 * H; // too early in the day: back-fill the last few hours
    genDay(tOpen, Infinity, now, 300); // no closing time today: stays that outlast `now` are still inside

    // A few denials + overrides so logs/insights have something to chew on
    const insidePeople = Object.values(S.visitors).filter((v) => v.inside);
    for (let i = 0; i < Math.min(4, insidePeople.length); i++) {
      const v = insidePeople[i];
      const ts = Math.max(tOpen, now - rint(5, 150) * 60e3);
      record({ ts, gateId: pick(['GM-01', 'GM-02']), dir: 'IN', result: 'DENIED', reason: 'Anti-passback: NIK sudah tercatat di dalam', nik: v.nik, name: v.name, city: v.city, province: v.province, category: v.category, count: 1, sim: true });
    }
    for (let i = 0; i < 3; i++) {
      record({ ts: Math.max(tOpen, now - rint(10, 170) * 60e3), gateId: pick(['GM-01', 'GM-02', 'GK-01']), dir: 'IN', result: 'MANUAL', reason: pick(WG.REASONS), name: 'Petugas', count: 1, sim: true });
    }
    for (const m of [['Dewi Lestari', 'Tamannya bersih dan asri, anak-anak senang sekali!', 5], ['Budi Santoso', 'Antrean masuk cepat, petugas ramah.', 5], ['Hj. Sri Rahayu', 'Jalur kursi roda sudah bagus, terima kasih.', 4], ['Kevin V.', 'Beautiful park, easy entry with the ID card.', 5]])
      S.guestbook.push({ ts: now - rint(10, 300) * 60e3, name: m[0], text: m[1], rating: m[2], sim: true });
    for (const g of [['SDN Cibiru 2', 'Ibu Ratna', 'Bandung', 'pelajar', 42, true], ['Rombongan Majelis Taklim An-Nur', 'Bpk. Hasan', 'Bogor', 'lansia', 35, false], ['PT Maju Bersama (Gathering)', 'Sdr. Arif', 'Jakarta Pusat', 'umum', 28, false]]) {
      const grp = { id: uid(), name: g[0], leader: g[1], city: g[2], category: g[3], size: g[4], inside: g[5] ? g[4] : 0, enteredAt: g[5] ? now - 50 * 60e3 : 0, sim: true };
      S.groups.push(grp);
      if (g[5]) record({ ts: grp.enteredAt, gateId: 'GM-03', dir: 'IN', result: 'OK', name: grp.name, city: grp.city, category: grp.category, count: grp.size, groupId: grp.id, sim: true });
    }

    S.visits.sort((a, b) => a.ts - b.ts);
    const todays = S.visits.filter((v) => v.day === WG.dayKey(now)).slice(-14);
    S.logs = S.logs.filter((l) => l.ts < (todays[0] ? todays[0].ts : now));
    for (const v of todays) {
      if (v.result === 'OK') log('OK', `${dirWord(v)} diizinkan @ ${WG.gateName(v.gateId)} — ${who(v)}${v.dwell ? ` • durasi ${WG.fmtDur(v.dwell)}` : ''}`, v.ts);
      else if (v.result === 'DENIED') log('DENY', `${dirWord(v)} ditolak @ ${WG.gateName(v.gateId)} — ${who(v)}: ${v.reason}`, v.ts);
      else log('OVR', `Petugas membuka ${WG.gateName(v.gateId)} secara manual. Alasan: ${v.reason}`, v.ts);
    }
    log('SYS', 'Data demo dimuat (ditandai "sim", bisa dihapus dari Pengaturan).');
    dirty();
  };

  WG.clearSim = function () {
    S.visits = S.visits.filter((v) => !v.sim);
    for (const k of Object.keys(S.visitors)) if (S.visitors[k].sim) delete S.visitors[k];
    S.groups = S.groups.filter((g) => !g.sim);
    S.guestbook = S.guestbook.filter((m) => !m.sim);
    // A real visitor who was last seen by a sim record is not tracked; keep the real ones as-is.
    log('SYS', 'Data simulasi/demo dihapus.');
    dirty();
  };

  WG.resetToday = function () {
    const today = WG.dayKey(Date.now());
    S.visits = S.visits.filter((v) => v.day !== today);
    for (const k in S.visitors) S.visitors[k].inside = false;
    for (const g of S.groups) g.inside = 0;
    log('SYS', 'Data hari ini direset oleh petugas.');
    dirty();
  };

  WG.factoryReset = function () {
    WG.setAuto(false);
    for (const id of gateIds) { clearTimeout(rt.gates[id].timer); rt.gates[id].status = 'LOCKED'; }
    S = defaults();
    dirty();
  };

  WG.exportJson = () => JSON.stringify(S, null, 1);
  WG.importJson = function (text) {
    const o = JSON.parse(text);
    if (!isObj(o) || o.v !== 1 || !isObj(o.settings)) throw new Error('Bukan file backup Wisata Gateway (v1).');
    WG.setAuto(false);
    S = sanitize(o);
    for (const id of gateIds) { clearTimeout(rt.gates[id].timer); rt.gates[id].status = S.panic ? 'PANIC' : 'LOCKED'; }
    dirty();
  };

  if (S.panic) for (const id of gateIds) { rt.gates[id].status = 'PANIC'; rt.gates[id].msg = 'EMERGENCY OPEN'; }
})();
