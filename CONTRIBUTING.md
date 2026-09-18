# Contributing

Thanks for wanting to help. This is a small app with unusual constraints, and most of them come from the device it runs on.

## The constraints, and why they exist

**No build step, no dependencies, no module system.** The app is loaded as plain scripts sharing globals. Adding a bundler would mean a contributor needs a toolchain to change a line of CSS, and the package that reaches the TV would stop matching the files in the repo.

**ES5-era syntax only.** Tizen 6.0 runs Chromium 76. No arrow functions, `let`/`const`, template literals, spread, classes or `async`/`await` in `js/`. `simulate.html` is desktop-only and may use anything.

**CSS that Chromium 76 understands.** `inset` and flexbox `gap` are both too new and will silently do nothing on the TV — a mistake that already shipped once and made the fade overlay zero-sized.

**Less code wins.** A patch that deletes something and keeps the behaviour is better than one that adds an abstraction for a single case.

## Getting set up

You do not need a TV to contribute.

```bash
git clone <your fork>
cd aerial-tizen
./test/run-all.sh          # both suites, no network, no TV
python3 -m http.server 8080
# open http://localhost:8080/simulate.html
```

`simulate.html` mocks Samsung's `webapis.avplay` and `tizen` objects and plays the 1080p H264 variants of the same videos, so the whole UI, the menu, the transitions and the failure paths are exercisable in a desktop browser.

## What is generated and what is hand-written

Do not hand-edit these; a regeneration overwrites them:

- `js/catalog.js` — the video list
- `js/h264map.js` — the browser-playable URL per video, used only by the simulator
- `preload/*.webp` — one thumbnail per video, extracted from its own first seconds

They come from a separate generator that verifies every link against Apple's CDN and refuses to list a video that does not play. If you want to add or remove videos, open an issue describing what changed upstream rather than editing the list — a hand-edit will be reverted by the next regeneration, and the invariants in `test/catalog-sync.test.sh` will usually catch it first.

## Tests

Both suites must be green:

```bash
./test/run-all.sh
```

`test/player.test.js` is a hand-rolled harness: it loads the real player scripts into a VM context with stubbed Samsung APIs and a controllable clock, so timers, retries and the watchdog are deterministic. `flush()` runs exactly the timers queued at that moment, which is how a cascade of retries is stepped through one stage at a time.

**Write tests that would fail if the behaviour were deleted.** Prove it before you push: delete the implementation line your test covers, run that single test, confirm it goes red, restore the line. Two tests in this repo's history passed against deleted logic, which is worse than having no test, because it buys false confidence.

Things worth a test: anything touching the token that cancels stale playback, the retry ladder, the watchdog, playlist order, or settings persistence. Those are where the bugs have been.

## Deploying to a real TV

See the README. In short: enable developer mode, point it at your PC's address, and deploy with the Docker one-liner or `./setup.sh && ./deploy.sh`. The TV accepts the Tizen public distributor certificate; no Samsung developer account is needed.

Keep your author certificate somewhere safe. If you lose it, the next install fails with `Author certificate not match` and you have to uninstall first, which wipes the app's stored settings.

Never commit `js/local-config.js`. It holds your LAN address and, if you use telemetry, a client token. It is gitignored; `js/local-config.example.js` shows the shape.

## Pull requests

- One concern per PR, with a description of what you observed, not only what you changed.
- Say whether you tested on hardware or only in the simulator. Both are acceptable; knowing which matters, because the simulator cannot reproduce AVPlay's stalls, and hardware cannot be reproduced by reviewers.
- Include the test that would have caught the bug you fixed.
- No AI-generated prose in documentation without saying so.

## Reporting a video that does not play

Useful reports name the video and the failure, both of which the app logs:

```bash
sdb -s <tv-ip>:26101 dlog | grep -i aerial
```

Look for `avplay_failure` or `watchdog_timeout` lines, which carry the URL and the reason. Include your TV model and firmware year. "Some videos do not open" without the URLs cannot be acted on: the catalog is codec-uniform, so a failure is almost always the CDN or that specific file, not the decoder.
