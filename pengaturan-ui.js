(window.__ver = window.__ver || {})['pengaturan-ui.js'] = '2026-10-28.2';
/* Dialog "Pengaturan wilayah & titik lokasi" (hanya di index.html): manual atau otomatis, dengan pratinjau peta. */
window.PengaturanUI = (() => {
  'use strict';
  const { el } = window.DashLib;
  const D = window.DASHBOARD_DATA;
  const P = window.Pengaturan;
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const f4 = (n) => (typeof n === 'number' && isFinite(n) ? String(Math.round(n * 1e5) / 1e5) : '');

  let dlg = null;

  function unduh(nama, isi, tipe) {
    const url = URL.createObjectURL(new Blob([isi], { type: tipe }));
    const a = el('a', { href: url, download: nama });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function buka({ onApplied } = {}) {
    if (!dlg) { dlg = el('dialog', { class: 'settings', 'aria-labelledby': 'set-h' }); document.body.append(dlg); dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); }); }
    const g = D.peta.geo;
    const draft = {
      wilayah: { mode: g.mode || 'otomatis', sumber: g.sumber || '', nama: g.nama || '', batas: clone(g.batas), desaPoligon: g.desaPoligon ? clone(g.desaPoligon) : null, dusunGeojson: g.dusunGeojson ? clone(g.dusunGeojson) : null, minZoom: g.minZoom, maxZoom: g.maxZoom, tiles: null },
      titik: {},
      gambar: clone(g.gambar || []),
    };
    D.peta.titik.forEach((t) => { if (t.lat != null && t.lng != null) draft.titik[t.id] = { lat: t.lat, lng: t.lng }; });
    let tab = 'wilayah', pick = null, map = null, layer = null, drawLayer = null, rubber = null;
    const dr = { aktif: false, mode: 'titik', pts: [], drag: false, edit: false };

    /* ---------- elemen ---------- */
    const status = el('p', { class: 'set-status', role: 'status' });
    const say = (t, bad) => { status.textContent = t; status.className = 'set-status' + (bad ? ' bad' : ''); };
    const hint = el('p', { class: 'set-hint', hidden: true });
    const mapBox = el('div', { class: 'set-map' });

    const inp = (label, getv, setv, step = '0.0001') => {
      const i = el('input', { type: 'number', step, inputmode: 'decimal', 'aria-label': label });
      i.value = f4(getv());
      i.addEventListener('change', () => { const v = parseFloat(i.value); setv(isFinite(v) ? v : null); gambar(true); });
      i._sync = () => { i.value = f4(getv()); };
      return i;
    };
    const syncs = [];
    const field = (label, i) => { syncs.push(i); return el('label', { class: 'set-f' }, [el('span', { text: label }), i]); };

    /* ---------- pratinjau peta ---------- */
    function gambar(fit) {
      daftar();
      if (!map) return;
      layer.clearLayers();
      const w = draft.wilayah, b = w.batas;
      if (P.validBatas(b)) L.rectangle(b, { color: '#ff8a1f', weight: 2, fillOpacity: 0.06, dashArray: '6 4', interactive: false }).addTo(layer);
      if (w.desaPoligon) {
        L.polygon(w.desaPoligon, { color: '#ea4335', weight: 4, fill: false, interactive: false, dashArray: '1 8', lineCap: 'round' }).addTo(layer);
        if (dr.edit && !dr.aktif) w.desaPoligon.forEach((q, i) => {
          const m = L.marker(q, { draggable: true, icon: L.divIcon({ className: 'set-vtx', iconSize: [14, 14] }), title: 'Seret untuk menggeser; klik kanan untuk menghapus titik' }).addTo(layer);
          m.on('dragend', () => { const ll = m.getLatLng(); w.desaPoligon[i] = [ll.lat, ll.lng]; w.batas = P.kotakDariTitik(w.desaPoligon); gambar(false); });
          m.on('contextmenu', () => { if (w.desaPoligon.length > 3) { w.desaPoligon.splice(i, 1); w.batas = P.kotakDariTitik(w.desaPoligon); gambar(false); } });
        });
      }
      if (w.dusunGeojson) L.geoJSON(w.dusunGeojson, { style: { color: '#3987e5', weight: 2, fillOpacity: 0.1 }, interactive: false }).addTo(layer);
      draft.gambar.forEach((x) => (x.jenis === 'area' ? L.polygon(x.titik, { color: x.warna || '#ea4335', weight: 2.5, fillOpacity: 0.12, interactive: false }) : L.polyline(x.titik, { color: x.warna || '#ea4335', weight: 4, lineCap: 'round', lineJoin: 'round', interactive: false })).addTo(layer));
      D.peta.titik.forEach((t) => {
        const c = draft.titik[t.id];
        if (!c || c.lat == null || c.lng == null) return;
        const m = L.marker([c.lat, c.lng], { draggable: tab === 'titik', title: t.nama }).addTo(layer);
        m.bindTooltip(t.nama, { direction: 'top', offset: [0, -28] });
        m.on('dragend', () => { const ll = m.getLatLng(); draft.titik[t.id] = { lat: ll.lat, lng: ll.lng }; syncs.forEach((i) => i._sync && i._sync()); });
      });
      if (fit && P.validBatas(b)) map.fitBounds(b, { animate: false, padding: [10, 10] });
      syncs.forEach((i) => i._sync && i._sync());
    }
    function mulaiPeta() {
      if (map || typeof L === 'undefined') { if (typeof L === 'undefined') mapBox.textContent = 'Pratinjau peta tidak tersedia (folder lib/ belum terunggah). Isian koordinat tetap bisa dipakai.'; return; }
      map = L.map(mapBox, { zoomSnap: 0.25, minZoom: 3 });
      L.tileLayer(D.peta.geo.tiles.url, { attribution: D.peta.geo.tiles.attribution, maxZoom: 19, referrerPolicy: 'origin' }).addTo(map);
      layer = L.layerGroup().addTo(map);
      drawLayer = L.layerGroup().addTo(map);
      pasangGambar();
      map.on('click', (e) => {
        const ll = [e.latlng.lat, e.latlng.lng], b = draft.wilayah.batas;
        if (dr.aktif) {
          if (dr.mode !== 'titik') return;
          const p0 = dr.pts[0];
          if (p0 && dr.pts.length >= 3 && areaTarget() && map.latLngToContainerPoint(e.latlng).distanceTo(map.latLngToContainerPoint(p0)) < 12) return selesai(); // klik titik pertama = menutup
          dr.pts.push(ll); sementara(); return;
        }
        if (pick === 'sw') { b[0] = ll; pick = 'ne'; hint.textContent = 'Sekarang klik sudut TIMUR LAUT (kanan-atas) wilayah.'; }
        else if (pick === 'ne') { b[1] = ll; pick = null; hint.hidden = true; draft.wilayah.batas = P.urutBatas(b); draft.wilayah.mode = 'manual'; draft.wilayah.sumber = 'manual'; }
        else if (pick && pick.startsWith('titik:')) { draft.titik[pick.slice(6)] = { lat: ll[0], lng: ll[1] }; pick = null; hint.hidden = true; }
        else return;
        gambar(false);
      });
      gambar(true);
    }

    /* ---------- tab Wilayah: otomatis ---------- */
    const qIn = el('input', { type: 'search', 'aria-label': 'Nama desa, kecamatan, kabupaten', value: [D.meta.desa, D.meta.kecamatan, D.meta.kabupaten].filter(Boolean).join(', ') });
    const hasil = el('div', { class: 'set-res' });
    const cariBtn = el('button', { type: 'button', class: 'btn', text: 'Cari di OpenStreetMap' });
    const lakukan = async (btn, fn) => { btn.disabled = true; try { await fn(); } catch (e) { say(e.message || String(e), true); } btn.disabled = false; };
    cariBtn.addEventListener('click', () => lakukan(cariBtn, async () => {
      say('Mencari…'); hasil.replaceChildren();
      const r = await P.cariWilayah(qIn.value.trim());
      say(r.length ? `${r.length} hasil. Pilih yang sesuai; hasil dengan "garis batas" paling tepat.` : 'Tidak ada hasil. Coba nama lebih singkat (mis. hanya nama desa dan kabupaten) atau pakai mode Manual.', !r.length);
      r.forEach((x) => {
        const b = el('button', { type: 'button', class: 'btn', text: 'Pakai' });
        b.addEventListener('click', () => {
          Object.assign(draft.wilayah, { mode: 'otomatis', sumber: 'osm', nama: x.nama.split(',').slice(0, 3).join(','), batas: x.batas, desaPoligon: x.poligon, dusunGeojson: null });
          gambar(true); say('Wilayah diisi dari OpenStreetMap. Periksa kotak oranye di peta, lalu tekan "Terapkan".');
        });
        hasil.append(el('div', { class: 'set-r' }, [el('div', {}, [el('b', { text: x.nama }), el('div', { class: 't-sub', text: `${x.jenis}${x.titikSaja ? ' · hanya titik (kotak batas perkiraan)' : ' · ada garis batas'}` })]), b]));
      });
    }));
    const radius = el('input', { type: 'number', min: '0.2', max: '20', step: '0.1', value: '1.5', 'aria-label': 'Radius kilometer' });
    const lokBtn = el('button', { type: 'button', class: 'btn', text: 'Gunakan lokasi perangkat ini' });
    lokBtn.addEventListener('click', () => lakukan(lokBtn, async () => {
      say('Meminta lokasi…');
      const r = await P.dariLokasi(parseFloat(radius.value) || 1.5);
      Object.assign(draft.wilayah, { mode: 'otomatis', sumber: 'lokasi', batas: r.batas, desaPoligon: null, dusunGeojson: null });
      gambar(true); say(`Lokasi ditemukan (akurasi ±${Math.round(r.akurasiM)} m). Kotak ${radius.value} km di sekitar perangkat ini; pindahkan sesuai kebutuhan.`);
    }));
    const titikBtn = el('button', { type: 'button', class: 'btn', text: 'Cocokkan ke titik lokasi' });
    titikBtn.addEventListener('click', () => {
      const b = P.dariTitik(D.peta.titik.map((t) => ({ lat: (draft.titik[t.id] || {}).lat, lng: (draft.titik[t.id] || {}).lng })));
      if (!b) return say('Butuh minimal 2 titik yang sudah berkoordinat (lihat tab Titik lokasi).', true);
      Object.assign(draft.wilayah, { mode: 'otomatis', sumber: 'titik', batas: b });
      gambar(true); say('Batas disesuaikan dengan titik-titik lokasi (ditambah ruang 30%).');
    });
    const dusunBtn = el('button', { type: 'button', class: 'btn', text: 'Cari batas dusun otomatis' });
    const dusunRes = el('div', { class: 't-sub' });
    dusunBtn.addEventListener('click', () => lakukan(dusunBtn, async () => {
      if (!P.validBatas(draft.wilayah.batas)) throw new Error('Tentukan wilayah desa dulu.');
      dusunRes.textContent = ''; say('Mencari batas dusun (1 dusun per detik)…');
      const nama = D.peta.dusun.map((d) => d.nama);
      const r = await P.cariDusun(nama, D.meta.desa, draft.wilayah.batas, (i, n, h) => { dusunRes.textContent = `${i}/${n} · ${h.nama}: ${h.ketemu ? 'ketemu' : h.galat ? 'gagal (' + h.galat + ')' : 'tidak ada di OSM'}`; });
      if (r.geojson) { draft.wilayah.dusunGeojson = r.geojson; gambar(false); }
      say(`${r.hasil.filter((x) => x.ketemu).length} dari ${nama.length} dusun ditemukan. ${r.geojson ? '' : 'Dusun yang tidak ketemu bisa diisi lewat GeoJSON di mode Manual.'}`, !r.geojson);
    }));

    const panelAuto = el('div', { class: 'set-panel' }, [
      el('div', { class: 'set-card' }, [el('h4', { text: '1. Cari nama desa' }), el('p', { class: 't-sub', text: 'Mengambil kotak batas (dan garis batas bila ada) dari OpenStreetMap berdasarkan nama.' }), el('div', { class: 'set-row' }, [qIn, cariBtn]), hasil]),
      el('div', { class: 'set-card' }, [el('h4', { text: '2. Lokasi perangkat ini' }), el('p', { class: 't-sub', text: 'Cocok bila Anda sedang berada di desa. Butuh izin lokasi (umumnya harus HTTPS).' }), el('div', { class: 'set-row' }, [el('label', { class: 'set-f' }, [el('span', { text: 'Radius (km)' }), radius]), lokBtn])]),
      el('div', { class: 'set-card' }, [el('h4', { text: '3. Dari titik lokasi' }), el('p', { class: 't-sub', text: 'Membungkus semua kiosk/aset/balai yang sudah punya koordinat.' }), titikBtn]),
      el('div', { class: 'set-card' }, [el('h4', { text: '4. Batas dusun' }), el('p', { class: 't-sub', text: 'Mencari garis batas tiap dusun di OSM. Banyak dusun belum dipetakan di OSM; yang tidak ketemu bisa diisi manual.' }), dusunBtn, dusunRes]),
    ]);

    /* ---------- gambar bebas ---------- */
    const targetSel = el('select', { 'aria-label': 'Yang digambar' });
    const optTarget = () => [['desa', 'Batas desa (garis titik-titik merah)'], ...D.peta.dusun.map((d) => ['dusun:' + d.nama, 'Batas ' + d.nama]), ['garis', 'Garis atau area lain (jalan, sungai, zona)']];
    optTarget().forEach(([v, l]) => targetSel.append(el('option', { value: v, text: l })));
    const namaGaris = el('input', { type: 'text', placeholder: 'Nama garis/area (mis. Sungai Serayu)', 'aria-label': 'Nama garis atau area' });
    const jenisSel = el('select', { 'aria-label': 'Bentuk' }, [el('option', { value: 'garis', text: 'Garis' }), el('option', { value: 'area', text: 'Area tertutup' })]);
    const extra = el('div', { class: 'set-row', hidden: true }, [namaGaris, jenisSel]);
    targetSel.addEventListener('change', () => { extra.hidden = targetSel.value !== 'garis'; });
    const areaTarget = () => targetSel.value !== 'garis' || jenisSel.value === 'area';
    const modeSeg = el('div', { class: 'seg-ctl', role: 'radiogroup', 'aria-label': 'Cara menggambar' });
    const modeRender = () => modeSeg.replaceChildren(...[['titik', 'Klik titik demi titik'], ['bebas', 'Bebas (tahan & seret)']].map(([k, l]) => { const b = el('button', { type: 'button', role: 'radio', 'aria-checked': String(dr.mode === k), text: l }); b.addEventListener('click', () => { if (dr.aktif) return; dr.mode = k; modeRender(); }); return b; }));
    modeRender();
    const mulaiBtn = el('button', { type: 'button', class: 'btn primary', text: 'Mulai menggambar' });
    const selesaiBtn = el('button', { type: 'button', class: 'btn', text: 'Selesai', hidden: true });
    const urungBtn = el('button', { type: 'button', class: 'btn', text: 'Urungkan titik', hidden: true });
    const batalBtn = el('button', { type: 'button', class: 'btn', text: 'Batal', hidden: true });
    const editChk = el('input', { type: 'checkbox' });
    editChk.addEventListener('change', () => { dr.edit = editChk.checked; gambar(false); if (dr.edit) say('Seret titik oranye di peta untuk menggeser batas; klik kanan pada titik untuk menghapusnya.'); });
    const daftarBox = el('div', { class: 'set-res' });

    function sementara() {
      if (!drawLayer) return;
      drawLayer.clearLayers(); rubber = null;
      if (!dr.aktif || !dr.pts.length) return;
      const gaya = { color: '#ea4335', weight: 4, dashArray: '1 8', lineCap: 'round', fillOpacity: 0.1, interactive: false };
      (areaTarget() && dr.pts.length > 2 ? L.polygon(dr.pts, gaya) : L.polyline(dr.pts, gaya)).addTo(drawLayer);
      if (dr.mode === 'titik') {
        dr.pts.forEach((q, i) => L.circleMarker(q, { radius: i === 0 ? 8 : 5, color: '#fff', weight: 2, fillColor: i === 0 ? '#ff8a1f' : '#ea4335', fillOpacity: 1, interactive: false }).addTo(drawLayer));
        rubber = L.polyline([dr.pts[dr.pts.length - 1], dr.pts[dr.pts.length - 1]], { color: '#ea4335', weight: 2, dashArray: '4 6', interactive: false }).addTo(drawLayer);
      }
    }
    function berhenti() {
      dr.aktif = false; dr.pts = []; dr.drag = false;
      mulaiBtn.hidden = false; [selesaiBtn, urungBtn, batalBtn].forEach((b) => { b.hidden = true; });
      targetSel.disabled = jenisSel.disabled = false;
      if (map) { map.doubleClickZoom.enable(); map.dragging.enable(); map.getContainer().style.cursor = ''; map.getContainer().style.touchAction = ''; }
      hint.hidden = true; sementara();
    }
    function mulai() {
      if (!map) return say('Pratinjau peta tidak tersedia (folder lib/ belum terunggah).', true);
      if (targetSel.value === 'garis' && !namaGaris.value.trim()) return say('Beri nama garis/area dulu.', true);
      pick = null; dr.aktif = true; dr.pts = []; dr.edit = false; editChk.checked = false; gambar(false);
      mulaiBtn.hidden = true; selesaiBtn.hidden = dr.mode === 'bebas'; urungBtn.hidden = dr.mode === 'bebas'; batalBtn.hidden = false;
      targetSel.disabled = jenisSel.disabled = true;
      const c = map.getContainer(); c.style.cursor = 'crosshair';
      if (dr.mode === 'bebas') { map.dragging.disable(); c.style.touchAction = 'none'; }
      else map.doubleClickZoom.disable();
      hint.hidden = false;
      hint.textContent = dr.mode === 'bebas' ? 'Tahan klik/jari di peta lalu seret mengikuti garis yang diinginkan; lepas untuk selesai. Zoom dulu agar lebih presisi.' : `Klik titik demi titik di peta${areaTarget() ? '; klik titik pertama (oranye) atau tekan Selesai untuk menutup' : '; klik dua kali atau tekan Selesai untuk berhenti'}.`;
      say('');
    }
    function pasang(tg, nama, jenis, pts) {
      const w = draft.wilayah;
      if (tg === 'desa') {
        if (jenis !== 'area') return say('Batas desa harus berupa area tertutup.', true);
        w.desaPoligon = pts; w.batas = P.kotakDariTitik(pts); w.mode = 'manual'; w.sumber = 'gambar';
        if (!w.nama && nama) w.nama = nama;
        say(`Batas desa: ${pts.length} titik. Kotak batas peta ikut disesuaikan. Periksa di peta, lalu "Terapkan".`);
      } else if (tg.startsWith('dusun:')) {
        if (jenis !== 'area') return say('Batas dusun harus berupa area tertutup.', true);
        const dn = tg.slice(6), gj = w.dusunGeojson && Array.isArray(w.dusunGeojson.features) ? w.dusunGeojson : { type: 'FeatureCollection', features: [] };
        gj.features = gj.features.filter((f) => !(f.properties && f.properties.nama === dn));
        gj.features.push({ type: 'Feature', properties: { nama: dn }, geometry: { type: 'Polygon', coordinates: [[...pts, pts[0]].map(([la, lo]) => [lo, la])] } });
        w.dusunGeojson = gj; w.mode = 'manual';
        say(`${dn}: ${pts.length} titik tersimpan di draf.`);
      } else {
        draft.gambar.push({ jenis, nama: nama || '', titik: pts, warna: '#ea4335' });
        say(`${jenis === 'area' ? 'Area' : 'Garis'} "${nama || 'tanpa nama'}" ditambahkan (${pts.length} titik).`);
      }
      return true;
    }
    function selesai() {
      const area = areaTarget(), min = area ? 3 : 2;
      let pts = dr.pts.slice();
      if (pts.length < min) { say(`Butuh minimal ${min} titik.`, true); if (dr.mode === 'bebas') berhenti(); return; }
      if (dr.mode === 'bebas') { // rapikan: sederhanakan di ruang piksel agar hasil ringan
        const px = pts.map((q) => { const p = map.latLngToLayerPoint(q); return [p.x, p.y]; });
        let e = 2; let s = P.sederhanakan(px, e);
        while (s.length > 250 && e < 40) { e *= 1.5; s = P.sederhanakan(px, e); }
        pts = s.map(([x, y]) => { const ll = map.layerPointToLatLng([x, y]); return [ll.lat, ll.lng]; });
        if (pts.length < min) { say('Coretan terlalu pendek.', true); return berhenti(); }
      }
      const tg = targetSel.value, jenis = area ? 'area' : 'garis', nama = tg === 'garis' ? namaGaris.value.trim() : '';
      const ok = pasang(tg, nama, jenis, pts);
      berhenti();
      if (ok) { if (tg === 'garis') namaGaris.value = ''; gambar(tg === 'desa'); }
    }
    mulaiBtn.addEventListener('click', mulai);
    selesaiBtn.addEventListener('click', selesai);
    batalBtn.addEventListener('click', () => { berhenti(); say('Gambar dibatalkan.'); });
    urungBtn.addEventListener('click', () => { dr.pts.pop(); sementara(); });
    function pasangGambar() { // peristiwa mouse/jari untuk mode bebas, dan penutup dengan klik ganda untuk mode titik
      const c = map.getContainer();
      const ll = (e) => map.mouseEventToLatLng(e);
      c.addEventListener('pointerdown', (e) => {
        if (!dr.aktif || dr.mode !== 'bebas' || e.button > 0 || e.target.closest('.leaflet-control')) return;
        dr.drag = true; dr.pts = [[ll(e).lat, ll(e).lng]]; try { c.setPointerCapture(e.pointerId); } catch (x) { /* abaikan */ } e.preventDefault(); sementara();
      });
      c.addEventListener('pointermove', (e) => {
        if (dr.aktif && dr.mode === 'titik' && rubber && dr.pts.length) { const p = ll(e); rubber.setLatLngs([dr.pts[dr.pts.length - 1], [p.lat, p.lng]]); return; }
        if (!dr.drag) return;
        const p = ll(e), last = dr.pts[dr.pts.length - 1];
        if (map.latLngToContainerPoint(p).distanceTo(map.latLngToContainerPoint(last)) < 3) return;
        dr.pts.push([p.lat, p.lng]); sementara();
      });
      const lepas = () => { if (!dr.drag) return; dr.drag = false; selesai(); };
      c.addEventListener('pointerup', lepas); c.addEventListener('pointercancel', lepas);
      map.on('dblclick', () => { if (dr.aktif && dr.mode === 'titik') { dr.pts.pop(); selesai(); } }); // klik ganda menghasilkan satu titik kembar
    }
    function daftar() { // daftar hasil gambar + tombol hapus
      const baris = [];
      const item = (label, hapus) => { const b = el('button', { type: 'button', class: 'btn', text: 'Hapus' }); b.addEventListener('click', hapus); baris.push(el('div', { class: 'set-r' }, [el('span', { text: label }), b])); };
      if (draft.wilayah.desaPoligon) item(`Batas desa (${draft.wilayah.desaPoligon.length} titik)`, () => { draft.wilayah.desaPoligon = null; dr.edit = false; editChk.checked = false; gambar(false); });
      ((draft.wilayah.dusunGeojson || {}).features || []).forEach((f) => item(`Batas ${(f.properties || {}).nama || 'dusun'}`, () => { draft.wilayah.dusunGeojson.features = draft.wilayah.dusunGeojson.features.filter((x) => x !== f); if (!draft.wilayah.dusunGeojson.features.length) draft.wilayah.dusunGeojson = null; gambar(false); }));
      draft.gambar.forEach((x, i) => item(`${x.jenis === 'area' ? 'Area' : 'Garis'}: ${x.nama || 'tanpa nama'} (${x.titik.length} titik)`, () => { draft.gambar.splice(i, 1); gambar(false); }));
      daftarBox.replaceChildren(...(baris.length ? baris : [el('p', { class: 't-sub', text: 'Belum ada batas yang digambar atau diimpor.' })]));
    }

    /* ---------- acuan Google ---------- */
    const gIn = el('input', { type: 'text', placeholder: 'Tempel tautan Google Maps (…@-7.36,109.90,15z) atau ketik: -7.36, 109.90', 'aria-label': 'Tautan atau koordinat Google Maps' });
    const gRad = el('input', { type: 'number', min: '0.2', max: '30', step: '0.1', value: '2', 'aria-label': 'Radius kilometer' });
    const gPusat = el('button', { type: 'button', class: 'btn', text: 'Arahkan peta ke sini' });
    gPusat.addEventListener('click', () => {
      const r = P.bacaGoogleMaps(gIn.value);
      if (!r) return say('Tempel tautan atau koordinat dulu.', true);
      if (r.galat) return say(r.galat, true);
      if (draft.wilayah.desaPoligon) { if (map) map.setView([r.lat, r.lng], Math.max(map.getZoom(), 15)); return say('Peta dipindah ke titik itu; batas yang sudah Anda gambar tidak diubah.'); }
      draft.wilayah.batas = P.kotakDariPusat(r.lat, r.lng, parseFloat(gRad.value) || 2); draft.wilayah.mode = 'manual'; draft.wilayah.sumber = 'google';
      gambar(true); say('Peta diarahkan ke titik itu. Sekarang gambar batas wilayah di atas peta.');
    });
    const gBuka = el('button', { type: 'button', class: 'btn', text: 'Buka wilayah ini di Google Maps' });
    gBuka.addEventListener('click', () => {
      const r = P.bacaGoogleMaps(gIn.value), b = draft.wilayah.batas;
      const pusat = r && !r.galat ? [r.lat, r.lng] : P.validBatas(b) ? [(b[0][0] + b[1][0]) / 2, (b[0][1] + b[1][1]) / 2] : null;
      if (!pusat) return say('Tentukan wilayah dulu.', true);
      window.open(P.urlGoogleMaps(pusat[0], pusat[1]), '_blank', 'noopener,noreferrer');
    });
    const berkas = el('input', { type: 'file', accept: '.kml,.geojson,.json,.xml,application/vnd.google-earth.kml+xml,application/geo+json,application/json', hidden: true });
    const berkasBtn = el('button', { type: 'button', class: 'btn', text: 'Impor KML / GeoJSON…' });
    const berkasRes = el('div', { class: 'set-res' });
    berkasBtn.addEventListener('click', () => berkas.click());
    berkas.addEventListener('change', async () => {
      berkasRes.replaceChildren();
      try {
        const bentuk = P.bacaBerkasPeta(await berkas.files[0].text());
        say(`${bentuk.length} bentuk ditemukan. Pilih akan dipakai sebagai apa.`);
        bentuk.forEach((x) => {
          const sel = el('select', { 'aria-label': 'Pakai sebagai' });
          const dflt = x.jenis === 'area' ? (/desa|kelurahan|batas|wilayah/i.test(x.nama) ? 'desa' : D.peta.dusun.some((d) => d.nama.toLowerCase() === x.nama.toLowerCase() || ('dusun ' + x.nama).toLowerCase() === d.nama.toLowerCase()) ? 'dusun:' + (D.peta.dusun.find((d) => d.nama.toLowerCase() === x.nama.toLowerCase() || ('dusun ' + x.nama).toLowerCase() === d.nama.toLowerCase()) || {}).nama : 'desa') : 'garis';
          optTarget().filter(([v]) => x.jenis === 'area' || v === 'garis').forEach(([v, l]) => sel.append(el('option', { value: v, text: l, selected: v === dflt })));
          const b = el('button', { type: 'button', class: 'btn', text: 'Pakai' });
          b.addEventListener('click', () => { if (pasang(sel.value, x.nama, x.jenis, x.titik)) gambar(true); });
          berkasRes.append(el('div', { class: 'set-r' }, [el('div', {}, [el('b', { text: x.nama || '(tanpa nama)' }), el('div', { class: 't-sub', text: `${x.jenis === 'area' ? 'Area' : 'Garis'} · ${x.titik.length} titik` })]), sel, b]));
        });
      } catch (e) { say('Gagal membaca: ' + e.message, true); }
      berkas.value = '';
    });

    const panelGambar = [
      el('div', { class: 'set-card' }, [el('h4', { text: 'Gambar batas sendiri (bebas)' }),
        el('p', { class: 't-sub', text: 'Gambar langsung di peta sebelah kanan: batas desa, batas dusun, atau garis/area lain. Zoom sedekat mungkin supaya presisi.' }),
        el('label', { class: 'set-f wide' }, [el('span', { text: 'Yang digambar' }), targetSel]), extra, modeSeg,
        el('div', { class: 'row-btns' }, [mulaiBtn, selesaiBtn, urungBtn, batalBtn]),
        el('label', { class: 't-sub' }, [editChk, ' Geser / hapus titik batas desa yang sudah ada']),
        daftarBox]),
      el('div', { class: 'set-card' }, [el('h4', { text: 'Acuan dari Google Maps' }),
        el('p', { class: 't-sub', text: 'Tempel tautan/koordinat dari Google Maps untuk mengarahkan peta, lihat batas wilayahnya di Google Maps, lalu garis ulang di sini. Garis batas milik Google sendiri tidak bisa disalin otomatis (ketentuan Google); bila Anda punya garis dari Google My Maps/Earth, impor sebagai KML.' }),
        el('div', { class: 'set-row' }, [gIn]), el('div', { class: 'set-row' }, [el('label', { class: 'set-f' }, [el('span', { text: 'Radius (km)' }), gRad]), gPusat, gBuka]),
        el('div', { class: 'set-row' }, [berkasBtn, berkas]), berkasRes]),
    ];

    /* ---------- tab Wilayah: manual ---------- */
    const b0 = () => draft.wilayah.batas;
    const namaIn = el('input', { type: 'text', 'aria-label': 'Nama wilayah', value: draft.wilayah.nama, placeholder: 'mis. Desa Sukamaju' });
    namaIn.addEventListener('input', () => { draft.wilayah.nama = namaIn.value; });
    const gjIn = el('textarea', { rows: 4, placeholder: 'Tempel GeoJSON batas dusun (FeatureCollection; tiap fitur punya properties.nama sama dengan nama dusun)…', 'aria-label': 'GeoJSON batas dusun' });
    const gjBtn = el('button', { type: 'button', class: 'btn', text: 'Pakai GeoJSON ini' });
    gjBtn.addEventListener('click', () => {
      try {
        const j = JSON.parse(gjIn.value);
        if (!j || !Array.isArray(j.features)) throw new Error('Harus FeatureCollection dengan daftar features.');
        draft.wilayah.dusunGeojson = j; draft.wilayah.mode = 'manual'; gambar(false); say(`GeoJSON dipakai: ${j.features.length} fitur.`);
      } catch (e) { say('GeoJSON tidak valid: ' + e.message, true); }
    });
    const pickBtn = el('button', { type: 'button', class: 'btn', text: 'Klik 2 sudut di peta' });
    pickBtn.addEventListener('click', () => { pick = 'sw'; hint.hidden = false; hint.textContent = 'Klik sudut BARAT DAYA (kiri-bawah) wilayah di peta di bawah.'; });
    const zIn = (k) => { const i = el('input', { type: 'number', min: '1', max: '19', step: '1', 'aria-label': k }); i.value = draft.wilayah[k] ?? ''; i.addEventListener('change', () => { draft.wilayah[k] = parseInt(i.value, 10) || undefined; }); return i; };
    const tileIn = el('input', { type: 'text', placeholder: 'https://…/{z}/{x}/{y}.png (kosong = OpenStreetMap)', 'aria-label': 'Alamat server tile peta' });
    tileIn.addEventListener('change', () => { draft.wilayah.tiles = tileIn.value.trim() ? { url: tileIn.value.trim() } : null; });
    const panelManual = el('div', { class: 'set-panel' }, [
      ...panelGambar,
      el('div', { class: 'set-card' }, [el('h4', { text: 'Batas wilayah (lintang, bujur)' }), el('label', { class: 'set-f wide' }, [el('span', { text: 'Nama wilayah' }), namaIn]),
        el('div', { class: 'set-grid' }, [
          field('Barat daya: lintang', inp('Lintang barat daya', () => b0()[0][0], (v) => { b0()[0][0] = v; })), field('Barat daya: bujur', inp('Bujur barat daya', () => b0()[0][1], (v) => { b0()[0][1] = v; })),
          field('Timur laut: lintang', inp('Lintang timur laut', () => b0()[1][0], (v) => { b0()[1][0] = v; })), field('Timur laut: bujur', inp('Bujur timur laut', () => b0()[1][1], (v) => { b0()[1][1] = v; })),
        ]), pickBtn]),
      el('div', { class: 'set-card' }, [el('h4', { text: 'Batas dusun (GeoJSON)' }), gjIn, gjBtn]),
      el('details', { class: 'set-card' }, [el('summary', { text: 'Lanjutan: zoom dan server peta' }), el('div', { class: 'set-grid' }, [field('Zoom minimum', zIn('minZoom')), field('Zoom maksimum', zIn('maxZoom'))]), el('label', { class: 'set-f wide' }, [el('span', { text: 'Server tile peta' }), tileIn]), el('p', { class: 't-sub', text: 'Untuk TV yang menyala terus, sebaiknya pakai server/penyedia peta sendiri; server OpenStreetMap membatasi pemakaian berat.' })]),
    ]);

    /* ---------- tab Titik ---------- */
    const pickTitik = (id) => { pick = 'titik:' + id; hint.hidden = false; hint.textContent = 'Klik lokasinya di peta di bawah.'; };
    const tbody = el('tbody', {}, D.peta.titik.map((t) => {
      const c = () => (draft.titik[t.id] = draft.titik[t.id] || { lat: null, lng: null });
      const b = el('button', { type: 'button', class: 'btn', text: 'Pilih di peta' });
      b.addEventListener('click', () => pickTitik(t.id));
      const la = inp('Lintang ' + t.nama, () => (draft.titik[t.id] || {}).lat, (v) => { c().lat = v; }), lo = inp('Bujur ' + t.nama, () => (draft.titik[t.id] || {}).lng, (v) => { c().lng = v; });
      syncs.push(la, lo);
      return el('tr', {}, [el('td', { text: t.nama }), el('td', { text: t.jenis === 'balai' ? 'Balai/server' : t.jenis === 'kiosk' ? 'Kiosk' : 'Aset' }), el('td', {}, la), el('td', {}, lo), el('td', {}, b)]);
    }));
    const panelTitik = el('div', { class: 'set-panel' }, [
      el('p', { class: 't-sub', text: 'Isi koordinat tiap titik, atau tekan "Pilih di peta" lalu klik lokasinya; marker di peta juga bisa digeser. Titik tanpa koordinat tidak ditampilkan di peta nyata (supaya tidak ada posisi palsu).' }),
      el('div', { class: 'tablewrap tall' }, el('table', {}, [el('thead', {}, el('tr', {}, ['Titik', 'Jenis', 'Lintang', 'Bujur', ''].map((h) => el('th', { text: h })))), tbody])),
    ]);

    /* ---------- mode & tab ---------- */
    const tabs = el('div', { class: 'seg-ctl', role: 'tablist' });
    const modeBox = el('div', { class: 'set-mode seg-ctl', role: 'radiogroup', 'aria-label': 'Cara menentukan wilayah' });
    const render = () => {
      tabs.replaceChildren(...[['wilayah', 'Wilayah'], ['titik', 'Titik lokasi']].map(([k, l]) => { const b = el('button', { type: 'button', role: 'tab', 'aria-selected': String(tab === k), text: l }); b.addEventListener('click', () => { if (dr.aktif) berhenti(); tab = k; pick = null; hint.hidden = true; render(); gambar(false); }); return b; }));
      modeBox.hidden = tab !== 'wilayah';
      modeBox.replaceChildren(...[['otomatis', 'Otomatis'], ['manual', 'Manual']].map(([k, l]) => { const b = el('button', { type: 'button', role: 'radio', 'aria-checked': String(draft.wilayah.mode === k), text: l }); b.addEventListener('click', () => { draft.wilayah.mode = k; render(); }); return b; }));
      panelAuto.hidden = tab !== 'wilayah' || draft.wilayah.mode !== 'otomatis';
      panelManual.hidden = tab !== 'wilayah' || draft.wilayah.mode !== 'manual';
      panelTitik.hidden = tab !== 'titik';
    };

    /* ---------- tombol bawah ---------- */
    const ambil = () => ({ versi: 1, wilayah: { ...draft.wilayah }, titik: clone(draft.titik), gambar: clone(draft.gambar) });
    const cek = () => { if (!P.validBatas(draft.wilayah.batas)) { say('Batas wilayah belum valid: pastikan 4 angka terisi dan barat daya berada di kiri-bawah timur laut.', true); return false; } return true; };
    const terapkanBtn = el('button', { type: 'button', class: 'btn primary', text: 'Terapkan & simpan di browser ini' });
    terapkanBtn.addEventListener('click', () => {
      if (!cek()) return;
      const s = ambil(); const m = P.terapkan(s);
      if (m.length) return say(m.join(' '), true);
      const ok = P.simpan(s);
      say(ok ? 'Tersimpan di browser ini dan sudah dipakai. Agar TV/perangkat lain ikut, unduh config.js lalu unggah ke hosting.' : 'Diterapkan, tetapi browser menolak menyimpan (mode privat?). Unduh config.js agar tidak hilang.', !ok);
      onApplied && onApplied();
    });
    const cfgBtn = el('button', { type: 'button', class: 'btn', text: 'Unduh config.js (untuk hosting)' });
    cfgBtn.addEventListener('click', () => { if (!cek()) return; unduh('config.js', P.eksporConfig(ambil()), 'text/javascript'); say('config.js diunduh. Unggah menimpa config.js di hosting, lalu tekan Ctrl+F5 di TV.'); });
    const jsonBtn = el('button', { type: 'button', class: 'btn', text: 'Unduh JSON (cadangan)' });
    jsonBtn.addEventListener('click', () => { if (!cek()) return; unduh('pengaturan-wilayah.json', P.eksporJson(ambil()), 'application/json'); });
    const file = el('input', { type: 'file', accept: '.json,.js,application/json,text/javascript', hidden: true });
    const impBtn = el('button', { type: 'button', class: 'btn', text: 'Impor pengaturan…' });
    impBtn.addEventListener('click', () => file.click());
    file.addEventListener('change', async () => {
      try {
        const s = P.impor(await file.files[0].text());
        if (s.wilayah) Object.assign(draft.wilayah, s.wilayah);
        if (s.titik) draft.titik = s.titik;
        draft.gambar = Array.isArray(s.gambar) ? clone(s.gambar) : [];
        namaIn.value = draft.wilayah.nama || ''; render(); gambar(true); say('Pengaturan dibaca. Tekan "Terapkan" untuk memakainya.');
      } catch (e) { say('Gagal membaca: ' + e.message, true); }
      file.value = '';
    });
    const resetBtn = el('button', { type: 'button', class: 'btn', text: 'Kembali ke bawaan' });
    resetBtn.addEventListener('click', () => { if (!confirm('Hapus pengaturan di browser ini dan kembali ke bawaan (config.js / data contoh)?')) return; P.reset(); say('Dikembalikan ke bawaan.'); onApplied && onApplied(); dlg.close(); });
    const tutup = el('button', { type: 'button', class: 'btn', text: 'Tutup' });
    tutup.addEventListener('click', () => dlg.close());

    const sumber = { browser: 'pengaturan di browser ini', config: 'config.js di hosting', bawaan: 'bawaan (lokasi contoh)' }[P.sumberAktif()];
    dlg.replaceChildren(
      el('div', { class: 'detail-head' }, [el('div', {}, [el('h3', { id: 'set-h', text: 'Pengaturan wilayah & peta' }), el('p', { text: `Sumber yang sedang dipakai: ${sumber}.` })]), tutup]),
      el('div', { class: 'set-bar' }, [tabs, modeBox]),
      el('div', { class: 'set-body' }, [el('div', { class: 'set-left' }, [panelAuto, panelManual, panelTitik]), el('div', { class: 'set-right' }, [hint, mapBox])]),
      status,
      el('div', { class: 'row-btns set-foot' }, [terapkanBtn, cfgBtn, jsonBtn, impBtn, file, resetBtn])
    );
    render();
    dlg.showModal();
    requestAnimationFrame(() => { mulaiPeta(); if (map) { map.invalidateSize(); gambar(true); } });
    dlg.addEventListener('close', () => { if (map) { map.remove(); map = null; } dr.aktif = false; }, { once: true });
  }

  return { buka };
})();
