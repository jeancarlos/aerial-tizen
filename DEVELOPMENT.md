# Development

Everything here is for working on the app. If you only want to install and watch it, [README.md](README.md) is enough.

## Running it without a TV

`simulate.html` loads the real player scripts against a mocked `webapis.avplay`, so the UI, the menu, the transitions and the failure paths all work in a desktop browser.

```bash
python3 -m http.server 8080
# open http://localhost:8080/simulate.html
```

Over plain http it plays the browser-decodable H.264 1080p variant of each video. Over https it cannot: Apple serves the aerials from `sylvan.apple.com` over http only, and signs that host with a private Apple CA no browser trusts, so an https page can load neither scheme. On https the simulator falls back to the catalog's placeholder frames, which is what the [published demo](https://jeancarlos.github.io/aerial-tizen/) shows. Append `?stills` to see that mode locally.

| Key | Action |
|---|---|
| `Enter` | Open menu |
| `Space` | Pause |
| `→` | Next video |
| `Esc` | Close menu |

A console 404 for `js/local-config.js` is expected. The file is optional and untracked.

The demo published to GitHub Pages is built by `demo/build.sh`, which the Pages workflow also calls, so what you check locally is what the site serves.

## Developer mode on the TV

Type `12345` on the remote to reveal the developer rows in the settings menu. Typing it again hides them and turns the custom server off.

| Setting | Values | Notes |
|---|---|---|
| Use custom server | Yes, No | Play from a LAN server instead of Apple's CDN |
| Files location | URL | The LAN server's address |
| Settings stored in | read-only | Which storage backend is actually in use |

With developer mode on, `0` toggles the on-screen debug board. The board is the only way to see what the app is doing on a retail TV: the restricted sdb shell returns no console output, so `sdb dlog` will not show you app logs. The board reports the storage probe results, the playlist state, and the last events.

## Playing from a LAN server

Hosting the videos yourself removes Apple's CDN as a failure source. Create `js/local-config.js`, using `js/local-config.example.js` as the shape. The file is gitignored and must stay that way; it holds your LAN address and, if you use telemetry, a client token.

```js
var AERIAL_LOCAL_SERVER = 'http://<host>:<port>';
```

A deployment that ships this address uses it first and keeps the catalog URL as a fallback, so a server that goes down costs a retry rather than the video. Serve the files flat, named exactly as the catalog's basenames, from a server that supports byte ranges.

## Telemetry

Off by default, and no credentials are in the repository. Enable it in the same untracked file:

```js
var AERIAL_TELEMETRY = { clientToken: '<datadog client token>', site: 'datadoghq.com' };
```

| Event | Carries |
|---|---|
| `app_start` | App start |
| `transition_ms` | Time from the switch to the first buffered frame, and the URL |
| `rebuffer_start` | A stall began, with a running count |
| `rebuffer_end` | The stall ended, with the count and its duration |
| `playback_failure` | URL, URL index, attempt, retry count, phase, reason |
| `video_skipped` | Every URL failed, with the consecutive-failure streak |
| `category_empty` | The chosen category matched nothing, so the whole catalog was used |
| `storage_probe` | Storage backend probe |
| `storage_probe_file` | File storage probe |
| `storage_restored` | Storage restored |
| `storage_restore_skipped` | Restore skipped |
| `storage_write_error` | Storage write error |

## How playback recovers

Apple's CDN drops connections under load, so nothing here assumes a URL works.

1. The URL is retried twice, after 1s and then 3s.
2. When the retries are spent, the next URL is tried: the LAN server if one is configured, then http, then https.
3. When every URL is spent the video is skipped. That skip delay starts at 2s and doubles per consecutive failure up to 60s.
4. The first video that buffers clears the streak.

A 20-second watchdog covers the three ways a stream can stop without reporting an error: a prepare callback that never arrives, initial buffering that never completes, and a stall mid-video. A stalled stream goes back into the retry sequence. A video the viewer paused never trips it; the watchdog re-arms and keeps waiting until playback resumes.

The loading indicator only appears on a cold start, because after the first video the preload thumbnail covers each transition. It comes back when a failure streak means nothing is playing.

## Storage

Three backends are probed at boot, in this order:

| Backend | Where it lives |
|---|---|
| `tizen.preference` | Tizen's own preference store |
| wgt-private file | A file private to the app |
| `localStorage` | Browser storage |

Settings and the last video played are persisted. The debug board reports which backend actually survived a reboot, which is the only honest way to know: `localStorage` alone is unreliable on this TV, because Chromium commits lazily and a write just before exit can be lost.

## Code layout

The scripts are plain globals loaded in a fixed order.

| File | Responsibility |
|---|---|
| `js/local-config.js` | Untracked deployment values: LAN server, telemetry credentials |
| `js/storage.js` | The three backends and the ordered writes behind them |
| `js/telemetry.js` | Event reporting, silent and network-free unless configured |
| `js/catalog.js` | Generated `var CATALOG` |
| `js/settings.js` | Defaults, the menu model, persistence with range clamping |
| `js/player.js` | Playlist and AVPlay lifecycle, preload, info overlay, retries, watchdog |
| `js/menu.js` | Settings menu and the LAN server connection test |
| `js/debug.js` | The on-screen board and the boot-time backend probe |
| `js/main.js` | Remote keys, app lifecycle, start-up |

`js/catalog.js`, `js/h264map.js` and `preload/*.webp` are generated. See [CONTRIBUTING.md](CONTRIBUTING.md) before editing them.

## Tests

Node only. No framework, no network, no TV.

```bash
bash test/run-all.sh
```

| Suite | Covers |
|---|---|
| `test/player.test.js` | Stale-work cancellation, the retry ladder, the watchdog, category restarts, settings clamping and persistence |
| `test/catalog-sync.test.sh` | Missing thumbnails, thumbnails no catalog entry claims, stray `.jpg` files, URL uniqueness and scheme, h264 map consistency including orphan keys |

The player suite loads the real scripts into a `vm` context with stubbed Samsung APIs and a virtual clock. `advance(ms)` fires whatever is due, in due order, so a test states the delay it is waiting for — a fade, the watchdog, a retry — instead of counting how many timers happen to exist. Adding a `setTimeout` somewhere in the player no longer breaks unrelated tests.

Write tests that fail when the behaviour is deleted, and prove it: remove the implementation line your test covers, run the suite, confirm it goes red, put the line back.
