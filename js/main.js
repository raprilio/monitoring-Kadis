/* Wisata Gateway — bootstrap: tab routing, clock, render scheduling. */
(function () {
  'use strict';
  const WG = window.WG;
  const { $, $$ } = WG;

  const TABS = ['controller', 'tv', 'analytics', 'guestbook', 'group', 'settings'];
  let active = TABS.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'controller';

  function show(tab, push) {
    active = tab;
    $$('.tab').forEach((b) => {
      const on = b.dataset.tab === tab;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', on);
    });
    $$('.view').forEach((v) => v.classList.toggle('on', v.id === 'view-' + tab));
    document.body.dataset.tab = tab;
    if (push) history.replaceState(null, '', '#' + tab);
    WG.views[tab].render();
  }

  let queued = false;
  function refresh() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      WG.renderHeader();
      WG.views[active].render();
    });
  }

  function tickClock() {
    $('#clock').textContent = WG.fmtTime(Date.now());
    if (active === 'tv') WG.views.tv.tick();
  }

  function init() {
    WG.hydrateIcons();
    for (const v of Object.values(WG.views)) v.init && v.init();

    $$('.tab').forEach((b) => b.addEventListener('click', () => show(b.dataset.tab, true)));
    window.addEventListener('hashchange', () => { const t = location.hash.slice(1); if (TABS.includes(t)) show(t); });

    $('#btnPanic').addEventListener('click', WG.togglePanic);
    $('#btnSound').addEventListener('click', () => WG.updateSettings({ sound: !WG.S.settings.sound }));

    WG.on('change', refresh);
    setInterval(tickClock, 1000);
    // Occupancy windows / dwell times age with the wall clock even when nothing is tapped.
    setInterval(() => { if (active === 'controller' || active === 'group') WG.touch(); }, 30000);

    tickClock();
    WG.renderHeader();
    show(active);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
