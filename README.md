# Aerial for Samsung Tizen TV

This application brings Apple TV aerial screensavers to Samsung TVs. It ships a catalog of 115 videos and decodes them in hardware as HEVC 4K through AVPlay.

[Live demo](https://jeancarlos.github.io/aerial-tizen/)

![Aerial running in the browser demo](docs/screenshot.png)

The demo runs the application against a mocked AVPlay environment and displays catalog placeholder frames. Apple aerials use HTTP, and `sylvan.apple.com` uses a private Apple CA, meaning HTTPS pages block both. To work around this, the local HTTP simulator plays H.264 1080p video.

## Playback

The player streams 115 verified videos from the Apple CDN, accompanied by 115 thumbnails with one mapped to each video.

| Category | Videos |
|---|---:|
| Space | 22 |
| Sea | 21 |
| Landscape | 42 |
| Cityscape | 30 |

The player uses fade transitions and displays title and description overlays during load. A twelve-bar activity indicator appears on a cold start, while preload thumbnails cover subsequent transitions. The indicator returns when consecutive failures leave nothing playing.

The application consists of about 1,950 lines of ES5 across the eight scripts that ship, and it requires no dependencies, frameworks, or build steps.

## Requirements

- Samsung Smart TV, Tizen 6.0+ (2021+).
- Linux, macOS, or Windows PC on same network segment.
- [Tizen Studio CLI](https://developer.tizen.org/development/tizen-studio/download) or Docker.
- Node.js (tests only).

A Samsung developer account is unnecessary because these instructions use the Tizen public distributor certificate. Although store submission requires a Samsung distributor certificate, the app itself needs neither.

## Install

### 1. Enable Developer Mode

1. Open Apps on the TV.
2. Type `12345` on the remote.
3. Turn Developer mode on.
4. Enter the IP address of your PC.
5. Restart the TV.

### 2. Find TV IP

You can find the TV IP by checking your router DHCP leases or scanning the sdb port:

```bash
nmap -p 26101 --open 192.168.0.0/24
```

Always verify the current address because DHCP renewal changes the IP, and a stale address causes timeouts.

### 3. Deploy with Docker

This method bypasses local SDK installation.

```bash
docker run --rm --network=host -v "$PWD:/app:ro" vitalets/tizen-webos-sdk bash -lc '
  TV=<tv-ip>:26101
  sdb connect $TV
  DEVICE=$(sdb devices | awk "NR>1 {print \$3; exit}")

  STAGE=/tmp/stage; mkdir -p $STAGE/js $STAGE/css
  cp /app/config.xml /app/icon.png /app/index.html $STAGE/
  cp /app/css/style.css $STAGE/css/
  for n in catalog storage telemetry settings player menu debug main; do cp /app/js/$n.js $STAGE/js/; done
  [ -f /app/js/local-config.js ] && cp /app/js/local-config.js $STAGE/js/
  cp -r /app/preload $STAGE/preload

  tizen package -t wgt -s dev -- $STAGE
  mv "$STAGE/Aerial Screensaver.wgt" $STAGE/aerial.wgt
  tizen install -n aerial.wgt -t $DEVICE -- $STAGE
  tizen run -p AerialScr0.AerialScreensaver -t $DEVICE
'
```

Without `js/local-config.js`, the build ships public defaults with telemetry off. The image includes a `dev` signing profile, making certificate setup unnecessary.

Do not run `tizen cli-config profiles.path=...` as it breaks profile resolution and causes packaging to fail.

### 4. Deploy with Tizen Studio

```bash
./setup.sh     # asks for the Tizen Studio path, TV address and profile, writes .env
./deploy.sh    # stages the runtime files, packages, installs, launches
```

The `deploy.sh` script packages the staging directory while omitting tests, simulator files, the H264 map, and deployment scripts from the `.wgt` file.

## Simulate

The `simulate.html` file mocks the Samsung APIs and plays browser-decodable H.264 1080p variants over local HTTP.

```bash
python3 -m http.server 8080
# open http://localhost:8080/simulate.html
```

| Key | Action |
|---|---|
| `Enter` | Open menu |
| `Space` | Pause |
| `→` | Skip |
| `Esc` | Close menu |

A console 404 error for `js/local-config.js` is expected because the file is optional and untracked.

The simulator verifies application logic without hardware, so you should maintain the simulator when editing the player.

## Remote Control

| Key | Action |
|---|---|
| `Enter` | Open settings |
| `→`, `Fast Forward`, `Ch+`, `Ch−` | Next video |
| `Play` / `Pause` / `Play-Pause` | Pause and resume |
| `Back`, `Stop` | Exit app |
| `12345` | Type `12345` to toggle the developer rows; typing it again hides them and turns the custom server off. |
| `0` | Toggle on-screen debug board. Requires developer mode. |

The menu uses the following controls:

| Key | Action |
|---|---|
| `↑` `↓` | Move |
| `←` `→` | Change value |
| `Enter` | Toggle |
| `Back` | Close |

## Settings

| Setting | Values | Notes |
|---|---|---|
| Show Description | On, Off | Controls description overlay |
| Description Timer | 1–15s | Clamped on load |
| Video Order | Shuffle, Sequential | Shuffle avoids repeating current video |
| Category | All, Space, Sea, Landscape, Cityscape | Changing restarts list |
| Use custom server | Yes, No | Developer rows only |
| Files location | URL | Developer rows only |
| Settings stored in | info, read-only | Displays active storage backend. Developer rows only. |

### LAN Video Server

Local hosting removes the CDN as a single point of failure. To enable it, create `js/local-config.js` via `js/local-config.example.js` and keep it untracked.

```js
var AERIAL_LOCAL_SERVER = 'http://<host>:<port>';
```

The application defaults to the local server while retaining the CDN catalog URL as a fallback. Serve the files flat, named exactly as the catalog basenames, from a server that supports byte ranges. The application uses the CDN if the server goes down.

### Telemetry

Telemetry defaults to off, and credentials are absent from the repository. You can enable it in `js/local-config.js`:

```js
var AERIAL_TELEMETRY = { clientToken: '<datadog client token>', site: 'datadoghq.com' };
```

| Event | Details |
|---|---|
| `app_start` | App start |
| `transition_ms` | Switch time to first buffered frame, URL |
| `rebuffer_start` | Stall began, running count |
| `rebuffer_end` | Stall ended, count, duration |
| `playback_failure` | URL, URL index, attempt, retry count, phase, reason |
| `video_skipped` | Every URL failed, consecutive-failure streak |
| `category_empty` | Chosen category empty, full catalog used |
| `storage_probe` | Storage backend probe |
| `storage_probe_file` | File storage probe |
| `storage_restored` | Storage restored |
| `storage_restore_skipped` | Restore skipped |
| `storage_write_error` | Storage write error |

Failures show on the on-screen debug board, which `0` opens when developer mode is on, and reach the telemetry beacon when one is configured. This is necessary because console output cannot be retrieved from a retail TV.

## Failure Handling

The Apple CDN drops connections under load, which is handled via the following process:

1. The application retries the URL twice with a 1s and then a 3s delay.
2. Once retries are exhausted, the player tries the next URL from the LAN server, HTTP, and HTTPS options.
3. When all URLs are exhausted, the video is skipped, and the skip delay starts at 2s before doubling per consecutive failure up to 60s.
4. The first buffered video clears the failure streak.

A 20-second watchdog detects missing preparation callbacks, incomplete initial buffering, and mid-video stalls. Any stalled stream restarts via the retry sequence. A paused video never trips the watchdog, which keeps re-arming until playback resumes.

All failures are logged with the URL and reason so that a full catalog pass can identify unplayable videos per TV.

## Storage

The boot process probes the following backends:

| Backend | Storage |
|---|---|
| `tizen.preference` | Tizen preferences |
| wgt-private file | App-private file |
| `localStorage` | Browser storage |

The debug board reports the surviving backend post-reboot, and this persistence covers both settings and playback position.

Note that `localStorage` is unreliable on the TV because Chromium commits lazily, causing pre-exit writes to be lost.

## Code

The scripts load in an exact order and share state via globals.

| File | Responsibility |
|---|---|
| `js/local-config.js` | Untracked deployment values. LAN server, telemetry credentials. |
| `js/storage.js` | Storage backends, ordered writes. |
| `js/telemetry.js` | Event reporting. Silent, network-free unless configured. |
| `js/catalog.js` | Generated `var CATALOG`. |
| `js/settings.js` | Defaults, menu model. Persistence with range clamping. |
| `js/player.js` | Playlist, AVPlay lifecycle. Preload, info overlay. Retries, watchdog. |
| `js/menu.js` | Settings menu. LAN server test. |
| `js/debug.js` | On-screen board, boot-time backend probe. |
| `js/main.js` | Remote keys, app lifecycle, start-up. |

The build process creates several generated artifacts: `js/catalog.js`, `js/h264map.js`, and `preload/*.webp`. A separate tool verifies CDN links and generates thumbnails from frames.

You should hand-edit generated files for experiments only because regeneration overwrites any manual changes.

## Tests

The tests run in Node.js only, requiring no frameworks, network access, or TV hardware.

```bash
bash test/run-all.sh
```

| Suite | Coverage |
|---|---|
| `test/player.test.js` | Stale-work cancellation. Retries, watchdog. Category restarts. Settings clamping, persistence. |
| `test/catalog-sync.test.sh` | Missing thumbnails, thumbnails no catalog entry claims, and stray .jpg files; URL uniqueness and HTTP scheme; H264 map consistency including orphan keys. |

The player suite runs the application in a `vm` context, stubs the Samsung APIs, and virtualizes the clock. The tests declare the expected delay directly, avoiding manual timer counts.

A test fails when its named behavior is deleted, so you can verify coverage by deleting an implementation line and confirming the test fails.

## Troubleshooting

### `install failed[118, -11] Author certificate not match`

This error occurs when the installed build uses a different certificate, and uninstalling the application will clear your settings.

```bash
sdb -s <tv-ip>:26101 uninstall AerialScr0
```

The `tizen uninstall` and `vd_uninstallapp` commands fail silently, so you must use `sdb`.

Make sure to retain the author certificate after the first install, as this prevents repeated removal.

### Every command times out

This issue indicates that the TV address has changed, meaning you must repeat install step 2.

### Packaging fails with "An error has occurred"

Check `~/tizen-studio-data/cli/logs/cli.log` for details. The `profiles.path` setting in the CLI configuration usually causes this, so you should remove it.

### A video never starts

The watchdog triggers a retry after 20s, but the catalog might be stale if all videos fail. You can fix this by regenerating the catalog and testing the URL via `ffprobe`.

### Thumbnail stays on screen

The application awaits AVPlay buffering to complete, so you should check the logs for a `playback_failure` event.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

The project uses ES5 syntax for a Chromium 76 runtime, with no build steps and no dependencies. Please maintain the test passing state and ignore generated files.

## Thanks

This project was inspired by [xscreensaver-aerial](https://github.com/graysky2/xscreensaver-aerial) by graysky2.

## Author

Jean Souza · [Site](https://jeansouza.dev) · [GitHub](https://github.com/jeancarlos)

## License

This software is licensed under the MIT License. Copyright (c) 2026 Jean.

The Apple aerial videos belong to Apple, and this application simply links to their public CDN.