# Wisata Gateway

Digital guestbook & access controller for a tourist park: a **Rust server** that owns every access rule and all
data, plus a browser UI for 6 turnstiles (3 in / 3 out), e-KTP tap, anti-passback, capacity control, a public TV
billboard, reports, group passes and rule-based insights. UI language: Indonesian. Timezone: WIB (UTC+7, fixed).

```
Cargo.toml
src/main.rs     bootstrap, env config, 200 ms ticker (re-lock gates, auto-traffic, autosave), graceful shutdown
src/engine.rs   ALL rules: NIK check, anti-passback, capacity, panic, group pass, manual override, settings
src/model.rs    persistent data model + sanitising of untrusted JSON (data file / imported backup)
src/util.rs     WIB time maths, NIK parsing & masking
src/demo.rs     fictitious visitors + demo data (everything tagged "sim")
src/api.rs      JSON API under /api, optional officer token, long-poll sync, embedded static UI
web/            the UI (HTML/CSS/JS, no build step) — embedded into the binary on release builds
```

The browser only renders and sends commands. Rules and storage are in Rust, so several machines (entry gates,
TV, supervisor) share one live state.

## Run

```bash
cargo run --release            # http://127.0.0.1:8080   (data in ./data/state.json)
cargo test                     # 21 unit tests for the rules
```

| Env var | Default | Meaning |
| --- | --- | --- |
| `WG_BIND` | `127.0.0.1:8080` | Address to listen on |
| `WG_DATA` | `data/state.json` | Data file (atomic writes, saved ≈1 s after a change and on shutdown) |
| `WG_TOKEN` | *(unset)* | Officer token. Required on every `/api` call as header `x-wg-token`; the UI asks for it once per tab |

**Network use:** to let other machines connect, e.g. `WG_BIND=0.0.0.0:8080 WG_TOKEN=<secret> cargo run --release`.
The server **refuses to start** on a non-loopback address without `WG_TOKEN`, because the API can open gates and
export every NIK. The token travels in clear text over HTTP: put it behind HTTPS (reverse proxy) or keep it on a
trusted LAN/VPN. There is no per-user login or brute-force lockout.

The TV board can run on any screen: `http://<server>:8080/#tv`.

## What it does

| Tab | Highlights |
| --- | --- |
| Turnstiles Controller | Live stats, per-gate officer override (open / hold / lock), animated gates, preset e-KTP cards, manual form with live NIK hint, real-time log terminal, server-side Auto Traffic demo |
| TV Public Billboard | Occupancy gauge with traffic-light status, free quota, welcome feed (first name + city only), guestbook quotes, announcements, fullscreen |
| Analytics & Reports | Per-day KPIs, hourly chart, category mix, top cities, gate throughput, revenue estimate, CSV export, print |
| Guestbook & Logs | Filterable access log (+CSV), digital guestbook with ratings |
| Group Pass & AI | One tap admits/releases a registered party. "Smart Insights" = local rule-based checks (capacity ETA, gate imbalance, repeated denials, frequent overrides, forgotten exits) — **not** an LLM |
| Settings | Capacity, re-lock delay, anti-passback, gate names, ticket prices, announcements, demo data, JSON backup/restore, resets |

Rules: 1 NIK = 1 entry and 1 exit (toggle in Settings); entries are refused at capacity and during Panic Gate; exits
are always allowed in an emergency. Old JSON backups from the earlier browser-only version can be restored.

## Limits you should know about

- **Simulator, not hardware.** Nothing talks to real turnstiles or card readers yet. Integration point: `Engine::tap`
  / `manual_open` in `src/engine.rs` (e.g. a reader posting to `POST /api/tap`). The "Hardware Telemetry" card is
  labelled `SIMULASI`.
- **NIK validation is structural only** (16 digits, known province, plausible birth date). It cannot tell a real
  KTP from a made-up number; that needs an e-KTP chip reader / Dukcapil check. Camera OCR is not implemented.
- **Personal data.** The server never sends full NIKs to the browser (masked first4…last4 in API output, screens and
  CSV). The data file and the token-protected JSON backup contain full NIKs and names: protect the machine, decide
  retention and consent (UU PDP) before using real visitors. The public TV shows first names — a typed name appears
  there unmoderated.
- **Single server process, one data file** (last 8,000 access records kept). Not a cluster; no history beyond that.
- **Manual overrides** are audited but do not change the head count (nobody is identified).
- `/api/export` and `/api/import` use the same token as everything else; there is no separate admin role.
- Demo / auto-traffic records are tagged and can be removed from Settings without touching real records.
