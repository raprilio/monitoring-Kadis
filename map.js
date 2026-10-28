(window.__ver = window.__ver || {})['map.js'] = '2026-10-28.2';
/*
 * Peta nyata (OpenStreetMap + Leaflet) yang bisa DIKUNCI ke wilayah tertentu.
 *  - Wilayah: seluruh desa atau satu dusun (tampilan langsung menyesuaikan).
 *  - Kunci: tampilan dibekukan pada wilayah terpilih (tanpa geser/zoom). Tanpa kunci: bebas geser/zoom, tetapi tidak bisa keluar dari batas desa.
 *  - Bila Leaflet/peta dasar tidak bisa dimuat (mis. tidak ada internet), otomatis memakai peta skematik sebagai cadangan.
 */
window.DashMap = (() => {
  'use strict';
  const { el, fmt, SEV_LABEL, petaGeo, petaCounts } = window.DashLib;
  const UI = window.DashUI;
  const MARK_COLOR = UI.MARK_COLOR;

  const LOCK = { closed: 'M7 11V8a5 5 0 0 1 10 0v3M6 11h12a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1z', open: 'M7 11V8a5 5 0 0 1 9.6-2M6 11h12a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1z' };
  const lockIcon = (closed) => el('svg:svg', { viewBox: '0 0 24 24', width: 18, height: 18, fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' }, el('svg:path', { d: closed ? LOCK.closed : LOCK.open }));

  const shapeSvg = (jenis, col) => {
    const s = el('svg:svg', { viewBox: '-11 -11 22 22', width: 24, height: 24, class: 'gm-shape', 'aria-hidden': 'true' });
    const style = `fill:${col};stroke:var(--surface);stroke-width:2`;
    s.append(jenis === 'kiosk' ? el('svg:circle', { r: 8, style })
      : jenis === 'aset' ? el('svg:path', { d: 'M0 -10 L10 0 L0 10 L-10 0Z', style })
      : el('svg:rect', { x: -8, y: -8, width: 16, height: 16, rx: 3.5, style }));
    return s;
  };

  /** opts: { wilayah, kunci, active, controls, onHover(p,e), onLeave(), onChange({wilayah,kunci}), tileWaitMs, schematicOnly } */
  function create(opts = {}) {
    const host = el('div', { class: 'geomap', role: 'region', 'aria-label': 'Peta desa' });
    const st = { wilayah: opts.wilayah || 'desa', kunci: !!opts.kunci, active: opts.active || null, rows: [], mode: 'peta', note: '' };
    let map = null, zoneLayer = null, markerLayer = null, zoomCtl = null, ctlEl = null, ro = null, tiles = null, waitTimer = null;
    let data = null, counts = null, started = false;

    const useLeaflet = () => typeof window.L !== 'undefined' && !opts.schematicOnly;

    /* ---------- peta skematik (cadangan) ---------- */
    function drawSchematic() {
      host.classList.add('is-skema');
      const noteEl = st.note ? el('div', { class: 'gm-note', role: 'status', text: st.note + ' Menampilkan peta skematik.' }) : null;
      host.replaceChildren(UI.villageMap({ peta: window.DASHBOARD_DATA.peta, counts, points: data.titik, active: st.active, onHover: opts.onHover, onLeave: opts.onLeave, slice: !!opts.slice }), noteEl);
    }
    function fallback(reason) {
      if (st.mode === 'skema') return;
      clearTimeout(waitTimer);
      if (ro) ro.disconnect();
      if (map) { map.remove(); map = null; }
      st.mode = 'skema';
      st.note = reason;
      drawSchematic();
    }

    /* ---------- peta nyata ---------- */
    const region = () => data.wilayah.find((w) => w.key === st.wilayah) || data.wilayah[0];
    const fixWilayah = () => { if (!data.wilayah.some((w) => w.key === st.wilayah)) st.wilayah = 'desa'; };
    const cssVar = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

    function initLeaflet() {
      const g = data.geo;
      map = L.map(host, { zoomControl: false, minZoom: g.minZoom, maxZoom: g.maxZoom, zoomSnap: 0.25, zoomDelta: 0.5, maxBoundsViscosity: 1, attributionControl: true, worldCopyJump: false });
      host.classList.remove('is-skema');
      zoneLayer = L.layerGroup().addTo(map);
      markerLayer = L.layerGroup().addTo(map);
      zoomCtl = L.control.zoom({ position: 'topright', zoomInText: '+', zoomOutText: '−' });

      let loaded = 0, errors = 0;
      tiles = L.tileLayer(g.tiles.url, { referrerPolicy: 'origin', attribution: g.tiles.attribution, maxZoom: g.tiles.maxZoom || 19, minZoom: 1 }).addTo(map);
      tiles.on('tileload', () => { loaded++; clearTimeout(waitTimer); });
      tiles.on('tileerror', () => { errors++; if (!loaded && errors >= 4) fallback('Peta dasar tidak bisa dimuat (periksa koneksi internet).'); });
      waitTimer = setTimeout(() => { if (!loaded) fallback('Peta dasar tidak bisa dimuat (periksa koneksi internet).'); }, opts.tileWaitMs || 9000);

      if (opts.controls) { addControls(); addLinks(); }
      let raf = 0;
      ro = new ResizeObserver(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { if (map) { map.invalidateSize(); applyView(false); } }); });
      ro.observe(host);
    }

    /** "Rute" dan "Buka di Maps" seperti di Google Maps (tautan resmi, tanpa kunci API), plus tombol layar penuh. */
    function addLinks() {
      const Ctl = L.Control.extend({
        options: { position: 'bottomleft' },
        onAdd() {
          const box = el('div', { class: 'gm-links' });
          const tujuan = () => { const b = L.latLngBounds(region().bounds).getCenter(); return [b.lat, b.lng]; };
          const mk = (label, fn, ikon) => { const a = el('a', { class: 'gm-pill', target: '_blank', rel: 'noopener noreferrer', href: '#' }, [ikon, el('span', { text: label })]); a.addEventListener('click', () => { const [la, lo] = tujuan(); a.href = fn(la, lo); }); a.addEventListener('focus', () => { const [la, lo] = tujuan(); a.href = fn(la, lo); }); return a; };
          const svg = (d) => el('svg:svg', { viewBox: '0 0 24 24', width: 18, height: 18, fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' }, el('svg:path', { d }));
          box.append(mk('Rute', window.Pengaturan.urlGoogleRute, svg('M12 3l9 9-9 9-9-9zM9 12h6M12 9l3 3-3 3')), mk('Buka di Maps', window.Pengaturan.urlGoogleMaps, svg('M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2zM9 4v14M15 6v14')));
          L.DomEvent.disableClickPropagation(box);
          return box;
        },
      });
      new Ctl().addTo(map);
      const Fs = L.Control.extend({
        options: { position: 'topright' },
        onAdd() {
          const b = el('button', { type: 'button', class: 'gm-fs leaflet-bar', title: 'Layar penuh', 'aria-label': 'Layar penuh' }, el('svg:svg', { viewBox: '0 0 24 24', width: 20, height: 20, fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' }, el('svg:path', { d: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5' })));
          b.addEventListener('click', () => { if (document.fullscreenElement) document.exitFullscreen(); else if (host.requestFullscreen) host.requestFullscreen(); });
          L.DomEvent.disableClickPropagation(b);
          return b;
        },
      });
      new Fs().addTo(map);
    }

    function addControls() {
      const Ctl = L.Control.extend({
        options: { position: 'topleft' },
        onAdd() {
          const box = el('div', { class: 'gm-ctl leaflet-bar' });
          const sel = el('select', { 'aria-label': 'Pilih wilayah peta' }, data.wilayah.map((w) => el('option', { value: w.key, text: w.label })));
          sel.value = st.wilayah;
          const btn = el('button', { type: 'button', class: 'gm-lock', 'aria-pressed': String(st.kunci), title: 'Kunci tampilan peta pada wilayah terpilih' });
          const paint = () => { btn.setAttribute('aria-pressed', String(st.kunci)); btn.replaceChildren(lockIcon(st.kunci), el('span', { text: st.kunci ? 'Terkunci' : 'Kunci' })); sel.value = st.wilayah; };
          sel.addEventListener('change', () => api.setWilayah(sel.value));
          btn.addEventListener('click', () => api.setKunci(!st.kunci));
          box.append(el('label', {}, [el('span', { text: 'Wilayah' }), sel]), btn);
          paint();
          box._paint = paint;
          ctlEl = box;
          L.DomEvent.disableClickPropagation(box);
          L.DomEvent.disableScrollPropagation(box);
          return box;
        },
      });
      new Ctl().addTo(map);
    }

    function applyView(animate) {
      if (!map || !data) return;
      const g = data.geo, b = L.latLngBounds(region().bounds);
      const hs = ['dragging', 'touchZoom', 'doubleClickZoom', 'scrollWheelZoom', 'boxZoom', 'keyboard'];
      if (st.kunci) {
        map.setMinZoom(0);
        map.setMaxBounds(null);
        map.fitBounds(b, { animate: false });
        map.setMinZoom(map.getZoom());
        map.setMaxZoom(map.getZoom());
        map.setMaxBounds(b.pad(0.02));
        hs.forEach((h) => map[h] && map[h].disable());
        zoomCtl.remove();
        host.classList.add('is-locked');
      } else {
        map.setMaxZoom(g.maxZoom);
        map.setMinZoom(g.minZoom);
        map.setMaxBounds(L.latLngBounds(data.desaBounds).pad(0.2));
        hs.forEach((h) => map[h] && map[h].enable());
        zoomCtl.addTo(map);
        host.classList.remove('is-locked');
        map.fitBounds(b, { animate: !!animate });
      }
      if (ctlEl && ctlEl._paint) ctlEl._paint();
    }

    let noteCtl = null;
    function drawLayers() {
      zoneLayer.clearLayers();
      markerLayer.clearLayers();
      if (noteCtl) { noteCtl.remove(); noteCtl = null; }
      if (data.tanpaKoordinat > 0) {
        const C = L.Control.extend({ options: { position: 'bottomright' }, onAdd() { return el('div', { class: 'gm-miss', text: `${data.tanpaKoordinat} titik belum diberi koordinat, belum ditampilkan (Pengaturan → Titik lokasi).` }); } });
        noteCtl = new C().addTo(map);
      }
      if (data.desaPoligon) L.polygon(data.desaPoligon, { color: '#ea4335', weight: 4, opacity: 0.95, fill: false, interactive: false, dashArray: '1 8', lineCap: 'round', className: 'gm-desa' }).addTo(zoneLayer); // titik-titik merah seperti batas wilayah di Google Maps
      (data.gambar || []).forEach((x) => {
        const warna = x.warna || '#ea4335';
        const lyr = x.jenis === 'area'
          ? L.polygon(x.titik, { color: warna, weight: 2.5, fillColor: warna, fillOpacity: 0.12, className: 'gm-gambar' })
          : L.polyline(x.titik, { color: warna, weight: 4, opacity: 0.95, lineCap: 'round', lineJoin: 'round', className: 'gm-gambar' });
        lyr.addTo(zoneLayer);
        if (x.nama) lyr.bindTooltip(x.nama, { sticky: true, className: 'gm-tip' });
      });
      const s1 = cssVar('--s1') || '#2a78d6';
      const mx = Math.max(1, ...data.dusun.map((d) => counts.get(d.nama) || 0));
      data.dusun.forEach((d) => {
        const n = counts.get(d.nama) || 0, sel = st.wilayah === d.key;
        const poly = L.polygon(d.poligon, { color: s1, weight: sel ? 3.5 : 1.8, opacity: sel ? 1 : 0.7, fillColor: s1, fillOpacity: 0.07 + 0.2 * (n / mx), dashArray: sel ? null : '5 4', className: 'gm-zone' }).addTo(zoneLayer);
        poly.on('click', () => { if (!st.kunci) api.setWilayah(d.key); });
        const lab = el('div', { class: 'gm-zlabel' }, [el('span', { text: d.nama.replace('Dusun ', '') }), el('b', { text: counts.has(d.nama) ? fmt(counts.get(d.nama)) : '—' })]);
        L.marker(d.label, { interactive: false, keyboard: false, icon: L.divIcon({ className: 'gm-zl', html: lab, iconSize: [0, 0] }) }).addTo(zoneLayer);
      });
      [...data.titik].sort((a, b) => (a.sev !== 'ok') - (b.sev !== 'ok') || (a.id === st.active) - (b.id === st.active)).forEach((p) => {
        const col = MARK_COLOR[p.sev];
        const node = el('div', { class: 'gm' + (p.sev !== 'ok' ? ' alert' : '') + (p.id === st.active ? ' active' : ''), style: `--mc:${col}` }, [el('span', { class: 'gm-halo' }), shapeSvg(p.jenis, col)]);
        const m = L.marker(p.ll, {
          icon: L.divIcon({ className: 'gm-wrap', html: node, iconSize: [36, 36], iconAnchor: [18, 18] }),
          keyboard: true, title: `${p.tipe} ${p.nama}: ${SEV_LABEL[p.sev]}`, zIndexOffset: p.id === st.active ? 1000 : p.sev !== 'ok' ? 500 : 0,
        }).addTo(markerLayer);
        if (p.id === st.active) m.bindTooltip(p.nama, { permanent: true, direction: 'top', offset: [0, -16], className: 'gm-tip' }).openTooltip();
        if (opts.onHover) {
          m.on('mousemove', (e) => opts.onHover(p, e.originalEvent));
          m.on('mouseout', () => opts.onLeave && opts.onLeave());
          m.on('focus', () => { const r = m.getElement().getBoundingClientRect(); opts.onHover(p, { clientX: r.left + r.width / 2, clientY: r.top }); });
          m.on('blur', () => opts.onLeave && opts.onLeave());
        }
      });
    }

    /* ---------- siklus ---------- */
    function render() {
      if (!host.isConnected) return;
      data = petaGeo();
      if (!data) { host.replaceChildren(el('div', { class: 'gm-note', style: 'position:static', text: 'Data peta tidak lengkap: data.js kemungkinan versi lama. Unggah ulang data.js dari zip terbaru.' })); return; }
      counts = petaCounts(st.rows);
      fixWilayah();
      if (st.mode === 'skema' || !useLeaflet()) {
        if (st.mode !== 'skema') { st.mode = 'skema'; st.note = useLeaflet() ? st.note : ''; }
        drawSchematic();
        return;
      }
      if (!map) { initLeaflet(); started = true; applyView(false); } else map.invalidateSize();
      drawLayers();
    }

    const api = {
      el: host,
      get mode() { return st.mode; },
      get state() { return { wilayah: st.wilayah, kunci: st.kunci }; },
      attach() { if (map) { map.invalidateSize(); applyView(false); } render(); },
      update(rows) { st.rows = rows; render(); },
      setActive(id) { st.active = id; if (host.isConnected) { if (st.mode === 'skema') render(); else drawLayers(); } },
      setWilayah(key) {
        st.wilayah = key;
        if (map) { applyView(true); drawLayers(); }
        opts.onChange && opts.onChange({ wilayah: st.wilayah, kunci: st.kunci });
      },
      setKunci(on) {
        st.kunci = !!on;
        if (map) applyView(true);
        opts.onChange && opts.onChange({ wilayah: st.wilayah, kunci: st.kunci });
      },
      restyle() { if (map) drawLayers(); },
      /** Bangun ulang peta (mis. setelah pengaturan wilayah diubah). */
      reload() { clearTimeout(waitTimer); if (ro) ro.disconnect(); if (map) { map.remove(); map = null; } host.replaceChildren(); host.className = 'geomap'; st.mode = useLeaflet() ? 'peta' : 'skema'; st.note = ''; render(); },
      destroy() { clearTimeout(waitTimer); if (ro) ro.disconnect(); if (map) { map.remove(); map = null; } },
    };
    return api;
  }

  return { create };
})();
