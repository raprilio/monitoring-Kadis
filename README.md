# Wisata Gateway

Digital guestbook & access controller for a tourist park — a browser-based **simulator** of a 6-turnstile
entry/exit system with e-KTP tap, anti-passback, capacity control, a public TV billboard, reports, group passes
and rule-based insights. UI language: Indonesian. Timezone: WIB (UTC+7, fixed).

Access is by **KTP-el** (e-KTP tap), not by ticket; entry tariffs are optional and default to 0.

No build step and no dependencies. Open `index.html` in a browser (or serve the folder with any static server).
Everything is saved to the browser's `localStorage`.

```
index.html      page shell (6 tabs)
css/style.css   dark control-room theme, responsive, print styles for the report
js/core.js      state, persistence, access engine (tap / group / manual / panic), demo data
js/ui.js        shared UI (toast, confirm, icons, header) + Turnstiles Controller view
js/tabs.js      TV billboard, analytics, guestbook & logs, group pass & insights, settings
js/main.js      tab routing (#tv, #analytics, …), clock, render scheduling
```

## What it does

| Tab | Highlights |
| --- | --- |
| Turnstiles Controller | Live stats, per-gate officer override (open / hold / lock), 3 entry + 3 exit gates with animated state (click a gate column — or pick it in the dropdown — to make it the tap target), one-click preset e-KTP cards, manual e-KTP form with live NIK validation, real-time log terminal, Auto Traffic demo mode |
| TV Public Billboard | Occupancy gauge with traffic-light status, free quota, welcome feed (first name + city only), guestbook quotes, scrolling announcements, fullscreen. Open it directly with `index.html#tv` on a second screen |
| Analytics & Reports | Per-day KPIs, hourly in/out chart, category mix, top origin cities, gate throughput, CSV export, print (revenue estimate only if an optional entry tariff is set) |
| Guestbook & Logs | Filterable access log (search, direction, result, gate) with CSV export; digital guestbook with ratings |
| Group Pass & AI | Register a party once; one tap admits/releases everyone. "Smart Insights" = local rule-based checks (capacity ETA, gate imbalance, repeated anti-passback denials, frequent overrides, forgotten exits) — **not** an LLM |
| Settings | Capacity, re-lock delay, anti-passback, sound, gate names, optional entry tariffs, TV announcements, demo data, JSON backup/restore, resets |

Access rules: 1 NIK = 1 entry and 1 exit (toggle in Settings); entries are refused at capacity and while Panic Gate is
active; exits are always allowed in an emergency.

## Limits you should know about

- **Simulator, not hardware.** Nothing talks to real turnstiles or card readers yet. The "Hardware Telemetry" card is
  labelled `SIMULASI` for that reason. Integration would go through `WG.tap()` / `WG.manualOpen()` in `js/core.js`.
- **NIK validation is structural only** (16 digits, known province code, plausible birth date). It does not verify that a
  card is genuine — that needs an e-KTP chip reader / Dukcapil check. Camera OCR is not implemented.
- **Single device, single browser.** State lives in `localStorage` (last 8,000 access records kept). Multiple gates on
  different machines would need a shared backend.
- **Personal data.** NIK is masked everywhere on screen and in CSV exports; the JSON backup contains full NIKs. Decide
  on retention and consent before using real data (UU PDP).
- **Manual overrides** log an audit record but do not change the occupancy count (nobody is identified).
- Demo/auto-traffic records are tagged and can be removed from Settings without touching real records.
