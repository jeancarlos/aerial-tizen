var PRELOAD_FADE_MS = 500;
var ERROR_SKIP_MS = 2000;
var RETRY_DELAYS_MS = [1000, 3000];
var BUFFER_TIMEOUT_MS = 20000;
var MAX_SKIP_DELAY_MS = 60000;

var playlist = [];
var playlistIndex = -1;
var videoIndex = -1;
var nextIndex = -1;
var playToken = 0;
var transitionStartedAt = 0;
var transitionReported = false;
var rebufferCount = 0;
var skipStreak = 0;
var firstVideoPlayed = false;
var infoTimer = null;

var avplay = webapis.avplay;
var preloadEl = document.getElementById('preload');
var fade = document.getElementById('fade');
var info = document.getElementById('info');
var infoLabel = document.getElementById('info-label');
var infoDescription = document.getElementById('info-description');
var loadingEl = document.getElementById('loading');

// ── Playlist ──

function buildPlaylist() {
  playlist = [];
  for (var i = 0; i < CATALOG.length; i++) {
    if (settings.category === 'all' || CATALOG[i].category === settings.category) {
      playlist.push(i);
    }
  }
  if (playlist.length === 0) {
    // Nothing to play is worse than the wrong thing, so fall back to the whole
    // catalog - but say so, instead of leaving the setting looking ignored.
    telemetry('category_empty', { category: settings.category });
    for (var j = 0; j < CATALOG.length; j++) playlist.push(j);
  }
  playlistIndex = playlist.indexOf(videoIndex);
  nextIndex = -1;
}

function pickNext() {
  if (settings.videoOrder === 'shuffle') {
    var next;
    do {
      next = Math.floor(Math.random() * playlist.length);
    } while (playlist[next] === videoIndex && playlist.length > 1);
    playlistIndex = next;
  } else {
    playlistIndex = (playlistIndex + 1) % playlist.length;
  }
  return playlist[playlistIndex];
}

function takeNext() {
  var idx = nextIndex >= 0 ? nextIndex : pickNext();
  nextIndex = -1;
  return idx;
}

// ── Preload thumbnail ──

function fileName(url) {
  return url.substring(url.lastIndexOf('/') + 1);
}

function joinUrl(base, name) {
  return base + (base.endsWith('/') ? '' : '/') + name;
}

function getPreloadPath(url) {
  return 'preload/' + fileName(url).replace(/\.(mov|mp4)$/, '.webp');
}

function prefetchNextThumbnail() {
  if (nextIndex >= 0) return;
  nextIndex = pickNext();
  new Image().src = getPreloadPath(CATALOG[nextIndex].url);
}

function showLoading() {
  // Once a video has played the preload thumbnail covers every transition, so
  // a spinner on each one is noise over a screensaver. It comes back only when
  // nothing is playing and the viewer would otherwise stare at a frozen frame.
  if (!loadingEl || (firstVideoPlayed && skipStreak === 0)) return;
  loadingEl.classList.add('visible');
}

function hideLoading() {
  firstVideoPlayed = true;
  if (loadingEl) loadingEl.classList.remove('visible');
}

function hidePreload() {
  preloadEl.classList.remove('visible');
  fade.classList.remove('active');
}

// ── Info overlay ──

function showInfo(index) {
  if (!settings.showDescription) return;
  infoLabel.textContent = CATALOG[index].label;
  infoDescription.textContent = CATALOG[index].description;
  info.classList.add('visible');
}

function clearInfoTimer() {
  if (infoTimer) clearTimeout(infoTimer);
  infoTimer = null;
}

function hideInfo() {
  info.classList.remove('visible');
  clearInfoTimer();
}

function scheduleHideInfo() {
  if (!settings.showDescription || menuOpen) return;
  clearInfoTimer();
  infoTimer = setTimeout(hideInfo, settings.descriptionTimer * 1000);
}

// ── AVPlay ──

function stopAndClose() {
  try { avplay.stop(); } catch (e) {}
  try { avplay.close(); } catch (e) {}
}

function stopPlayback() {
  playToken++;
  clearWatchdog();
  stopAndClose();
}

function getVideoUrls(index) {
  var url = CATALOG[index].url;
  var urls = [url, url.replace('http://', 'https://')];
  if (settings.devMode && settings.customServerEnabled) {
    urls.unshift(joinUrl(settings.customServerUrl, fileName(url)));
  }
  // An https catalog entry is its own secure fallback, and a custom server can
  // be handed the address it is already serving: a repeated URL would only
  // spend the retry budget twice on the same dead host.
  return urls.filter(function (u, i) { return urls.indexOf(u) === i; });
}

function skipAfterError() {
  skipStreak++;
  telemetry('video_skipped', {
    video: videoIndex >= 0 && CATALOG[videoIndex] ? CATALOG[videoIndex].label : '',
    streak: skipStreak
  });
  stopPlayback();
  var token = playToken;
  // With the network down nothing is playable, and the catalog is long enough
  // that a flat delay would reopen dead URLs for hours. Back off to one attempt
  // a minute; the first video that buffers clears the streak.
  var delay = Math.min(ERROR_SKIP_MS * Math.pow(2, skipStreak - 1), MAX_SKIP_DELAY_MS);
  setTimeout(function () {
    if (token === playToken) playVideo(takeNext());
  }, delay);
}

// ── Playback ──
//
// A session is one video: the URL list to walk and the retry budget spent on
// each. A run is one avplay.open of one URL inside that session. Only the
// newest run of the newest session is live — playToken retires a session,
// currentRun retires a run — so every callback below asks runIsLive() before
// touching anything shared.

var currentRun = null;
var watchdogTimer = null;

function startVideo(index, token) {
  showInfo(index);
  tryPlay({ index: index, token: token, urls: getVideoUrls(index), urlIndex: 0, retry: 0, attempt: 0 });
}

function runIsLive(run) {
  return run.session.token === playToken && currentRun === run && !run.settled;
}

function clearWatchdog() {
  if (watchdogTimer) clearTimeout(watchdogTimer);
  watchdogTimer = null;
}

function armWatchdog(run) {
  if (!runIsLive(run)) return;
  clearWatchdog();
  watchdogTimer = setTimeout(function () {
    // A paused video is not a stall: the viewer asked for it to stop making
    // progress. Keep watching instead of restarting playback.
    var paused = false;
    try { paused = avplay.getState() === 'PAUSED'; } catch (e) {}
    if (paused) armWatchdog(run);
    else failRun(run, null);
  }, BUFFER_TIMEOUT_MS);
}

function failRun(run, error) {
  if (!runIsLive(run)) return;
  run.settled = true;
  clearWatchdog();
  var s = run.session;
  telemetry('playback_failure', {
    phase: run.prepared ? 'playing' : 'preparing',
    url: s.urls[s.urlIndex],
    url_index: s.urlIndex,
    attempt: run.attempt,
    retry: s.retry,
    video: CATALOG[s.index] ? CATALOG[s.index].label : '',
    reason: String(error || 'buffer timeout')
  });
  retryOrAdvance(s);
}

// Retry the same URL on a backoff, then fall through to the next URL, then give
// up on the video.
function retryOrAdvance(s) {
  if (s.token !== playToken) return;
  if (s.retry < RETRY_DELAYS_MS.length) {
    var delay = RETRY_DELAYS_MS[s.retry++];
    setTimeout(function () {
      if (s.token === playToken) tryPlay(s);
    }, delay);
    return;
  }
  s.retry = 0;
  s.urlIndex++;
  if (s.urlIndex >= s.urls.length) skipAfterError();
  else tryPlay(s);
}

function reportBuffered(run) {
  var s = run.session;
  var label = CATALOG[s.index] ? CATALOG[s.index].label : '';
  if (!transitionReported) {
    transitionReported = true;
    telemetry('transition_ms', { url: s.urls[s.urlIndex], video: label, ms: Date.now() - transitionStartedAt });
  } else {
    telemetry('rebuffer_end', { video: label, count: rebufferCount, ms: Date.now() - run.startedAt });
  }
}

function playbackListener(run) {
  var label = CATALOG[run.session.index] ? CATALOG[run.session.index].label : '';
  return {
    onbufferingstart: function () {
      if (!runIsLive(run)) return;
      rebufferCount++;
      telemetry('rebuffer_start', { video: label, count: rebufferCount });
      armWatchdog(run);
    },
    onbufferingcomplete: function () {
      if (!runIsLive(run)) return;
      clearWatchdog();
      hideLoading();
      skipStreak = 0;
      reportBuffered(run);
      hidePreload();
      scheduleHideInfo();
      prefetchNextThumbnail();
    },
    onstreamcompleted: function () {
      if (!runIsLive(run)) return;
      clearWatchdog();
      playVideo(takeNext());
    },
    onerror: function (error) {
      // Until prepareAsync settles, its own failure callback owns the error.
      if (run.prepared) failRun(run, error);
    }
  };
}

function tryPlay(s) {
  if (s.token !== playToken) return;
  var run = { session: s, attempt: ++s.attempt, settled: false, prepared: false, startedAt: Date.now() };
  currentRun = run;
  try {
    stopAndClose();
    avplay.open(s.urls[s.urlIndex]);
    avplay.setDisplayRect(0, 0, 1920, 1080);
    try { avplay.setStreamingProperty('SET_MODE_4K', 'TRUE'); } catch (e) {}
    avplay.setListener(playbackListener(run));
    armWatchdog(run);
    avplay.prepareAsync(function () {
      if (!runIsLive(run)) return;
      run.prepared = true;
      armWatchdog(run);
      try {
        avplay.play();
      } catch (e) {
        failRun(run, e);
      }
    }, function (error) {
      failRun(run, error);
    });
  } catch (e) {
    failRun(run, e);
  }
}

function playVideo(index) {
  stopPlayback();
  showLoading();
  transitionStartedAt = Date.now();
  transitionReported = false;
  rebufferCount = 0;
  // Keep the playlist cursor on whatever is actually playing: without this a
  // video started outside pickNext (a resume, a category change) leaves
  // sequential order picking the current video again as its "next".
  var position = playlist.indexOf(index);
  if (position >= 0) playlistIndex = position;
  var token = playToken;
  hideInfo();
  videoIndex = index;
  storageSet('aerial_index', index);

  preloadEl.onerror = function () {
    if (token !== playToken || !preloadEl.classList.contains('visible')) return;
    preloadEl.classList.remove('visible');
    fade.classList.add('active');
  };
  preloadEl.src = getPreloadPath(CATALOG[index].url);
  preloadEl.classList.add('visible');

  setTimeout(function () {
    if (token === playToken) startVideo(index, token);
  }, PRELOAD_FADE_MS);
}
