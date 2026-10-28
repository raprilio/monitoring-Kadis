(window.__ver = window.__ver || {})['pengaturan.js'] = '2026-10-28.1';
/*
 * Pengaturan wilayah peta: penyimpanan, penerapan, dan pencarian otomatis.
 *
 * Urutan prioritas: pengaturan di browser ini (localStorage) > config.js (DASHBOARD_CONFIG.pengaturan) > bawaan data.js.
 *   - "Simpan di browser ini" hanya berlaku di browser/perangkat tempat Anda mengatur.
 *   - Agar TV dan semua perangkat ikut, unduh config.js dari dialog Pengaturan lalu unggah menimpa config.js di hosting.
 * Pencarian otomatis memakai Nominatim (OpenStreetMap) dari browser Anda; hanya dijalankan saat tombol ditekan (batas wajar 1 permintaan/detik).
 */
window.Pengaturan = (() => {
  'use strict';
  const D = window.DASHBOARD_DATA;
  const KEY = 'kadis.pengaturan.v1';
  const NOMINATIM = 'https://nominatim.openstreetmap.org/search';

  /* ---------- salinan bawaan, untuk reset ---------- */
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const asli = D && D.peta ? clone({ geo: D.peta.geo, titik: D.peta.titik.map((t) => ({ id: t.id, lat: t.lat, lng: t.lng })) }) : null;

  /* ---------- simpan / muat ---------- */
  const bacaLokal = () => { try { const t = localStorage.getItem(KEY); return t ? JSON.parse(t) : null; } catch (e) { return null; } };
  const simpanLokal = (s) => { try { localStorage.setItem(KEY, JSON.stringify(s)); return true; } catch (e) { return false; } };
  const hapusLokal = () => { try { localStorage.removeItem(KEY); } catch (e) { /* abaikan */ } };
  const dariConfig = () => ((window.DASHBOARD_CONFIG || {}).pengaturan) || null;
  const aktif = () => bacaLokal() || dariConfig();
  const sumberAktif = () => (bacaLokal() ? 'browser' : dariConfig() ? 'config' : 'bawaan');

  /* ---------- validasi & penerapan ---------- */
  const num = (v) => typeof v === 'number' && isFinite(v);
  function validBatas(b) {
    return Array.isArray(b) && b.length === 2 && b.every((p) => Array.isArray(p) && num(p[0]) && num(p[1]))
      && b[0][0] >= -90 && b[1][0] <= 90 && b[0][1] >= -180 && b[1][1] <= 180 && b[0][0] < b[1][0] && b[0][1] < b[1][1];
  }
  const urutBatas = (b) => [[Math.min(b[0][0], b[1][0]), Math.min(b[0][1], b[1][1])], [Math.max(b[0][0], b[1][0]), Math.max(b[0][1], b[1][1])]];

  function kembalikan() {
    if (!asli) return;
    D.peta.geo = clone(asli.geo);
    D.peta.titik.forEach((t) => { const o = asli.titik.find((x) => x.id === t.id); if (o && o.lat != null) { t.lat = o.lat; t.lng = o.lng; } else { delete t.lat; delete t.lng; } });
  }
  /** Terapkan pengaturan ke data peta yang dipakai halaman. Mengembalikan daftar masalah (kosong = baik). */
  function terapkan(s) {
    kembalikan();
    const masalah = [];
    if (!s || !D || !D.peta) return masalah;
    const g = D.peta.geo, w = s.wilayah;
    if (w) {
      if (w.batas && validBatas(w.batas)) { g.batas = urutBatas(w.batas); g.contoh = false; } else if (w.batas) masalah.push('Batas wilayah tidak valid (sudut barat daya harus di selatan-barat sudut timur laut).');
      if (Array.isArray(w.desaPoligon) && w.desaPoligon.length > 2) g.desaPoligon = w.desaPoligon;
      if (w.dusunGeojson && Array.isArray(w.dusunGeojson.features)) g.dusunGeojson = w.dusunGeojson;
      if (num(w.minZoom)) g.minZoom = w.minZoom;
      if (num(w.maxZoom)) g.maxZoom = w.maxZoom;
      if (w.tiles && w.tiles.url) g.tiles = { ...g.tiles, ...w.tiles };
      g.nama = w.nama || ''; g.mode = w.mode || ''; g.sumber = w.sumber || '';
    }
    if (s.titik) D.peta.titik.forEach((t) => { const o = s.titik[t.id]; if (o && num(o.lat) && num(o.lng)) { t.lat = o.lat; t.lng = o.lng; } });
    return masalah;
  }
  const simpan = (s) => { s.versi = 1; s.diperbarui = new Date().toISOString(); return simpanLokal(s); };
  const reset = () => { hapusLokal(); terapkan(dariConfig()); };

  /* ---------- ekspor / impor ---------- */
  /** Teks config.js baru: mempertahankan apiPenduduk/apiSekolah yang sudah ada dan menambah pengaturan. */
  function eksporConfig(s) {
    const cfg = { ...(window.DASHBOARD_CONFIG || {}), pengaturan: s };
    return '/* Dibuat dari halaman Pengaturan. Unggah menimpa config.js di hosting agar TV dan semua perangkat memakai pengaturan ini. */\nwindow.DASHBOARD_CONFIG = ' + JSON.stringify(cfg, null, 2) + ';\n';
  }
  const eksporJson = (s) => JSON.stringify(s, null, 2);
  /** Terima JSON pengaturan, atau isi config.js hasil ekspor. Hanya JSON.parse (tidak menjalankan kode). */
  function impor(text) {
    let t = text.trim();
    const m = /^(?:\/\*[\s\S]*?\*\/\s*)?window\.DASHBOARD_CONFIG\s*=\s*([\s\S]*?);?\s*$/.exec(t);
    if (m) t = m[1];
    const o = JSON.parse(t);
    const s = o && o.pengaturan ? o.pengaturan : o;
    if (!s || typeof s !== 'object' || (!s.wilayah && !s.titik)) throw new Error('Isi file bukan pengaturan wilayah.');
    return s;
  }

  /* ---------- pencarian otomatis ---------- */
  const ringTerbesar = (geom) => {
    if (!geom) return null;
    const rings = geom.type === 'Polygon' ? [geom.coordinates[0]] : geom.type === 'MultiPolygon' ? geom.coordinates.map((p) => p[0]) : [];
    if (!rings.length) return null;
    const r = rings.sort((a, b) => b.length - a.length)[0];
    const step = Math.max(1, Math.ceil(r.length / 250)); // sederhanakan agar berkas kecil
    return r.filter((_, i) => i % step === 0).map(([lng, lat]) => [lat, lng]);
  };
  async function nominatim(params) {
    const u = NOMINATIM + '?' + new URLSearchParams({ format: 'jsonv2', polygon_geojson: '1', addressdetails: '1', countrycodes: 'id', 'accept-language': 'id', ...params });
    const r = await fetch(u);
    if (!r.ok) throw new Error('Pencarian gagal (HTTP ' + r.status + ')');
    return r.json();
  }
  /** Cari wilayah administratif/tempat berdasarkan nama. */
  async function cariWilayah(q) {
    const j = await nominatim({ q, limit: '6' });
    return j.map((x) => ({
      nama: x.display_name, jenis: [x.category, x.type].filter(Boolean).join(' / '),
      batas: [[Number(x.boundingbox[0]), Number(x.boundingbox[2])], [Number(x.boundingbox[1]), Number(x.boundingbox[3])]],
      poligon: ringTerbesar(x.geojson), titikSaja: !x.geojson || x.geojson.type === 'Point',
    }));
  }
  const tunggu = (ms) => new Promise((r) => setTimeout(r, ms));
  /** Cari batas tiap dusun di dalam batas desa (berurutan, 1 permintaan/detik). `onProgress(i, total, hasil)` opsional. */
  async function cariDusun(namaDusun, desa, batas, onProgress) {
    const [[s, w], [n, e]] = batas, padLat = (n - s) * 0.1, padLng = (e - w) * 0.1;
    const fitur = [], hasil = [];
    for (let i = 0; i < namaDusun.length; i++) {
      if (i) await tunggu(1100);
      let f = null, err = null;
      try {
        const j = await nominatim({ q: `${namaDusun[i]}, ${desa}`, limit: '3', viewbox: [w - padLng, n + padLat, e + padLng, s - padLat].join(','), bounded: '1' });
        const hit = j.find((x) => x.geojson && /Polygon/.test(x.geojson.type));
        if (hit) { f = { type: 'Feature', properties: { nama: namaDusun[i] }, geometry: hit.geojson }; fitur.push(f); }
      } catch (ex) { err = ex.message; }
      hasil.push({ nama: namaDusun[i], ketemu: !!f, galat: err });
      if (onProgress) onProgress(i + 1, namaDusun.length, hasil[i]);
    }
    return { geojson: fitur.length ? { type: 'FeatureCollection', features: fitur } : null, hasil };
  }
  /** Batas dari lokasi perangkat (butuh izin lokasi dan, di sebagian browser, HTTPS). */
  function dariLokasi(radiusKm = 1.5) {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error('Browser ini tidak mendukung lokasi.'));
      navigator.geolocation.getCurrentPosition((p) => {
        const lat = p.coords.latitude, lng = p.coords.longitude;
        const dLat = radiusKm / 110.574, dLng = radiusKm / (111.32 * Math.cos((lat * Math.PI) / 180));
        resolve({ pusat: [lat, lng], akurasiM: p.coords.accuracy, batas: [[lat - dLat, lng - dLng], [lat + dLat, lng + dLng]] });
      }, (err) => reject(new Error(err.code === 1 ? 'Izin lokasi ditolak.' : 'Lokasi tidak tersedia.')), { enableHighAccuracy: false, timeout: 12000 });
    });
  }
  /** Batas yang membungkus titik-titik berkoordinat (mis. kiosk, aset, balai desa), ditambah ruang 30%. */
  function dariTitik(titikAda, pad = 0.3) {
    const p = titikAda.filter((t) => num(t.lat) && num(t.lng));
    if (p.length < 2) return null;
    const la = p.map((t) => t.lat), lo = p.map((t) => t.lng);
    const h = Math.max(Math.max(...la) - Math.min(...la), 0.004) * pad, v = Math.max(Math.max(...lo) - Math.min(...lo), 0.004) * pad;
    return [[Math.min(...la) - h, Math.min(...lo) - v], [Math.max(...la) + h, Math.max(...lo) + v]];
  }

  // terapkan pengaturan aktif sedini mungkin (sebelum halaman menggambar)
  const awal = aktif();
  const masalahAwal = awal ? terapkan(awal) : [];

  return { KEY, aktif, bacaLokal, simpan, simpanLokal, hapusLokal, reset, terapkan, sumberAktif, validBatas, urutBatas, eksporConfig, eksporJson, impor, cariWilayah, cariDusun, dariLokasi, dariTitik, masalahAwal };
})();
