(window.__ver = window.__ver || {})['ui.js'] = '2026-10-28.1';
/* Komponen visual bersama: ikon, cincin, donat, kartu KPI, peta desa skematik. */
window.DashUI = (() => {
  'use strict';
  const { el, fmt, pct, statusIcon, SEV_LABEL, sum } = window.DashLib;
  const TAU = Math.PI * 2;
  const SEV_COLOR = { ok: 'var(--s1)', warning: 'var(--warn)', critical: 'var(--crit)' };
  const MARK_COLOR = { ok: 'var(--good)', warning: 'var(--warn)', critical: 'var(--crit)' };

  /* ---------- ikon garis 24×24 ---------- */
  const ICONS = {
    phone: 'M8 2.5h8a1.5 1.5 0 0 1 1.5 1.5v16a1.5 1.5 0 0 1-1.5 1.5H8A1.5 1.5 0 0 1 6.5 20V4A1.5 1.5 0 0 1 8 2.5zM10.5 18.5h3',
    kiosk: 'M5 3.5h14a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 14V5A1.5 1.5 0 0 1 5 3.5zM9 20.5h6M12 15.5v5',
    box: 'M3.5 7.5 12 3.5l8.5 4v9L12 20.5l-8.5-4zM3.5 7.5 12 11.5l8.5-4M12 11.5v9',
    users: 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 20c0-3.4 2.7-6 6-6s6 2.6 6 6M16.5 11a2.5 2.5 0 1 0 0-5M17 14.2c2.4.4 4 2.3 4 5.1',
    server: 'M4.5 4h15A1.5 1.5 0 0 1 21 5.5v4A1.5 1.5 0 0 1 19.5 11h-15A1.5 1.5 0 0 1 3 9.5v-4A1.5 1.5 0 0 1 4.5 4zM4.5 13h15a1.5 1.5 0 0 1 1.5 1.5v4a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5v-4A1.5 1.5 0 0 1 4.5 13zM7 7.5h.01M7 16.5h.01',
    doc: 'M7 3h7l5 5v12.5a.5.5 0 0 1-.5.5h-11a.5.5 0 0 1-.5-.5V3.5A.5.5 0 0 1 7 3zM14 3v5h5M9.5 13h6M9.5 16.5h6',
    home: 'M3.5 11 12 4l8.5 7M6 9.5V20h12V9.5M10 20v-5h4v5',
    tv: 'M3.5 6h17A1.5 1.5 0 0 1 22 7.5v9a1.5 1.5 0 0 1-1.5 1.5h-17A1.5 1.5 0 0 1 2 16.5v-9A1.5 1.5 0 0 1 3.5 6zM8 21h8',
    shield: 'M12 3 4.5 6v5.5c0 4.5 3 8 7.5 9.5 4.5-1.5 7.5-5 7.5-9.5V6z',
    school: 'M2 9l10-5 10 5-10 5zM6 11.5V16c0 1.5 3 3 6 3s6-1.5 6-3v-4.5M22 9v6',
    gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  };
  function icon(name, size = 20) {
    return el('svg:svg', { viewBox: '0 0 24 24', width: size, height: size, 'aria-hidden': 'true', class: 'ic', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.7, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' },
      el('svg:path', { d: ICONS[name] || ICONS.home }));
  }

  /* ---------- cincin (gauge) ---------- */
  function ring({ value, max = 100, size = 76, stroke = 9, sev = 'ok', color, text, label }) {
    const col = color || SEV_COLOR[sev], r = (size - stroke) / 2, c = TAU * r, f = Math.max(0, Math.min(1, value / max)), m = size / 2;
    const svg = el('svg:svg', { viewBox: `0 0 ${size} ${size}`, width: size, height: size, class: 'ring', role: 'img', 'aria-label': label || text || '' });
    svg.append(
      el('svg:circle', { cx: m, cy: m, r, fill: 'none', style: `stroke:color-mix(in srgb, ${col} 22%, var(--surface));stroke-width:${stroke}` }),
      el('svg:circle', { cx: m, cy: m, r, fill: 'none', style: `stroke:${col};stroke-width:${stroke}`, 'stroke-linecap': f > 0 && f < 1 ? 'round' : 'butt', 'stroke-dasharray': `${(c * f).toFixed(2)} ${c.toFixed(2)}`, transform: `rotate(-90 ${m} ${m})` })
    );
    if (text) svg.append(el('svg:text', { x: m, y: m, 'text-anchor': 'middle', 'dominant-baseline': 'central', class: 'ring-t', style: `font-size:${Math.max(13, Math.round(size * 0.25))}px`, text }));
    return svg;
  }

  /* ---------- donat (komposisi), jeda antar irisan ---------- */
  function donut({ items, size = 160, thickness = 22, gap = 2.5, center = [], bigSize, smallSize, label }) {
    const total = sum(items.map((i) => i.value)) || 1, r = (size - thickness) / 2, c = TAU * r, m = size / 2;
    const svg = el('svg:svg', { viewBox: `0 0 ${size} ${size}`, width: size, height: size, class: 'ring', role: 'img', 'aria-label': label || '' });
    svg.append(el('svg:circle', { cx: m, cy: m, r, fill: 'none', style: `stroke:var(--grid);stroke-width:${thickness}` }));
    let acc = 0;
    items.forEach((i) => {
      if (!i.value) return;
      const len = (i.value / total) * c, dash = Math.max(0.5, len - gap);
      svg.append(el('svg:circle', { cx: m, cy: m, r, fill: 'none', style: `stroke:${i.color};stroke-width:${thickness}`, 'stroke-dasharray': `${dash.toFixed(2)} ${(c - dash).toFixed(2)}`, 'stroke-dashoffset': (-acc).toFixed(2), transform: `rotate(-90 ${m} ${m})` }));
      acc += len;
    });
    if (center[0] != null) svg.append(el('svg:text', { x: m, y: center[1] != null ? m - size * 0.04 : m, 'text-anchor': 'middle', 'dominant-baseline': 'central', class: 'donut-big', style: `font-size:${bigSize || Math.round(size * 0.18)}px`, text: center[0] }));
    if (center[1] != null) svg.append(el('svg:text', { x: m, y: m + size * 0.13, 'text-anchor': 'middle', 'dominant-baseline': 'central', class: 'donut-small', style: `font-size:${smallSize || Math.round(size * 0.085)}px`, text: center[1] }));
    return svg;
  }

  /* ---------- kartu KPI ---------- */
  function kpiCard(c, { href = null, ringSize = 76 } = {}) {
    const col = SEV_COLOR[c.sev] || SEV_COLOR.ok;
    const viz = c.donut
      ? donut({ items: c.donut, size: ringSize, thickness: 11, gap: 2, label: c.label })
      : ring({ value: c.ring.value, size: ringSize, stroke: 10, sev: c.ring.sev || c.sev, text: c.ring.text, label: `${c.label}: ${c.ring.text}` });
    const body = el('div', { class: 'k-body' }, [
      el('div', { class: 'k-top' }, [icon(c.icon, 18), el('span', { text: c.label })]),
      el('div', { class: 'k-val', text: c.value }),
      el('div', { class: 'k-sub', text: c.sub, title: c.sub }),
    ]);
    // status: ikon berbentuk berbeda (✓ / ▲ / ✕) + label untuk pembaca layar; bukan warna saja
    const st = el('span', { class: 'k-st', title: SEV_LABEL[c.sev], role: 'img', 'aria-label': 'Status ' + SEV_LABEL[c.sev] }, statusIcon(c.sev));
    return el(href ? 'a' : 'article', { class: 'kpi-card', href, style: `--kc:${col}` }, [body, viz, st]);
  }

  /* ---------- peta desa skematik ---------- */
  const markerShape = (jenis) => (jenis === 'kiosk'
    ? el('svg:circle', { r: 2.5, class: 'shape' })
    : jenis === 'aset'
      ? el('svg:path', { d: 'M0 -3.1 L3.1 0 L0 3.1 L-3.1 0Z', class: 'shape' })
      : el('svg:rect', { x: -2.6, y: -2.6, width: 5.2, height: 5.2, rx: 1.1, class: 'shape' }));

  /** Gambar peta. `opts`: peta, counts (Map dusun→jumlah), points, active (id), onHover(point, event), onLeave(), vb ([lebar,tinggi]). */
  function villageMap({ peta, counts, points, active = null, onHover, onLeave, vb = [160, 105], slice = false }) {
    const svg = el('svg:svg', { viewBox: `0 0 ${vb[0]} ${vb[1]}`, class: 'vmap', role: 'img', 'aria-label': 'Peta skematik desa dengan lokasi kiosk, aset, dan balai desa', preserveAspectRatio: slice ? 'xMidYMid slice' : 'xMidYMid meet' });
    const mx = Math.max(1, ...peta.dusun.map((d) => counts.get(d.nama) || 0));
    peta.dusun.forEach((d) => {
      const n = counts.get(d.nama) || 0;
      svg.append(el('svg:polygon', { points: d.poligon.map((p) => p.join(',')).join(' '), class: 'zone', style: `fill:color-mix(in srgb, var(--s1) ${6 + (n / mx) * 26}%, var(--surface2))` }));
    });
    peta.jalan.forEach((d) => svg.append(el('svg:path', { d, class: 'road' }), el('svg:path', { d, class: 'road-in' })));
    svg.append(el('svg:path', { d: peta.sungai, class: 'river' }));
    peta.dusun.forEach((d) => {
      svg.append(
        el('svg:text', { x: d.label[0], y: d.label[1], class: 'zname', text: d.nama.replace('Dusun ', '') }),
        el('svg:text', { x: d.label[0], y: d.label[1] + 4.8, class: 'zcount', text: counts.has(d.nama) ? fmt(counts.get(d.nama)) : '—' })
      );
    });
    // urutan gambar: normal dulu, bermasalah di atas, yang dipilih paling atas
    [...points].sort((a, b) => (a.id === active) - (b.id === active) || (a.sev !== 'ok') - (b.sev !== 'ok')).forEach((p) => {
      const col = MARK_COLOR[p.sev];
      const g = el('svg:g', { class: 'mk' + (p.sev !== 'ok' ? ' alert' : '') + (p.id === active ? ' active' : ''), transform: `translate(${p.x} ${p.y})`, tabindex: 0, role: 'img', 'aria-label': `${p.tipe} ${p.nama}: ${SEV_LABEL[p.sev]}. ${p.detail}` });
      const halo = el('svg:circle', { r: 5.2, class: 'halo', style: `fill:${col}` });
      const shape = markerShape(p.jenis);
      shape.setAttribute('style', `fill:${col}`);
      g.append(halo, shape);
      if (p.id === active) g.append(el('svg:text', { y: -5.6, class: 'mk-label', text: p.nama }));
      if (onHover) {
        g.addEventListener('pointermove', (e) => onHover(p, e));
        g.addEventListener('focus', () => { const r = g.getBoundingClientRect(); onHover(p, { clientX: r.left + r.width / 2, clientY: r.top }); });
        g.addEventListener('pointerleave', () => onLeave && onLeave());
        g.addEventListener('blur', () => onLeave && onLeave());
      }
      svg.append(g);
    });
    return svg;
  }

  function mapLegend() {
    const sh = (kind) => {
      const s = el('svg:svg', { viewBox: '-4 -4 8 8', width: 14, height: 14, 'aria-hidden': 'true' });
      const n = markerShape(kind); n.setAttribute('style', 'fill:var(--ink2)'); n.setAttribute('transform', 'scale(1.1)');
      s.append(n);
      return s;
    };
    return el('div', { class: 'map-legend' }, [
      el('span', {}, [sh('kiosk'), 'Kiosk']), el('span', {}, [sh('aset'), 'Aset']), el('span', {}, [sh('balai'), 'Balai & server']),
      el('span', {}, [statusIcon('ok'), 'Normal']), el('span', {}, [statusIcon('warning'), 'Waspada']), el('span', {}, [statusIcon('critical'), 'Kritis']),
    ]);
  }

  return { icon, ring, donut, kpiCard, villageMap, mapLegend, SEV_COLOR, MARK_COLOR };
})();
