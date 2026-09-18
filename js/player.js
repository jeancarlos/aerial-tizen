var PRELOAD_FADE_MS = 500;
var ERROR_SKIP_MS = 2000;
var RETRY_DELAYS_MS = [1000, 3000];
var BUFFER_TIMEOUT_MS = 20000;

var playlist = [];
var playlistIndex = -1;
var videoIndex = -1;
var nextIndex = -1;
var playToken = 0;
var menuOpen = false;
var infoTimer = null;

var avplay = webapis.avplay;
var preloadEl = document.getElementById('preload');
var fade = document.getElementById('fade');
var info = document.getElementById('info');
var infoLabel = document.getElementById('info-label');
var infoDescription = document.getElementById('info-description');

// ── Playlist ──

function buildPlaylist() {
  playlist = [];
  for (var i = 0; i < CATALOG.length; i++) {
    if (settings.category === 'all' || CATALOG[i].category === settings.category) {
      playlist.push(i);
    }
  }
  if (playlist.length === 0) {
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
  stopAndClose();
}

function getVideoUrls(index) {
  var url = CATALOG[index].url;
  if (settings.devMode && settings.customServerEnabled) {
    return [joinUrl(settings.customServerUrl, fileName(url))];
  }
  return [url, url.replace('http://', 'https://')];
}

function skipAfterError() {
  stopPlayback();
  var token = playToken;
  setTimeout(function () {
    if (token === playToken) playVideo(takeNext());
  }, ERROR_SKIP_MS);
}

function startVideo(index, token) {
  showInfo(index);
  var urls = getVideoUrls(index);
  var urlIndex = 0;
  var retry = 0;
  var attempt = 0;

  function failed() {
    if (token !== playToken) return;
    if (retry < RETRY_DELAYS_MS.length) {
      var delay = RETRY_DELAYS_MS[retry++];
      setTimeout(function () {
        if (token === playToken) tryPlay();
      }, delay);
      return;
    }
    retry = 0;
    urlIndex++;
    if (urlIndex >= urls.length) skipAfterError();
    else tryPlay();
  }

  function tryPlay() {
    if (token !== playToken) return;
    var currentAttempt = ++attempt;
    var settled = false;
    var prepared = false;
    var watchdog = null;

    function clearWatchdog() {
      if (watchdog) clearTimeout(watchdog);
      watchdog = null;
    }

    function active() {
      return token === playToken && currentAttempt === attempt && !settled;
    }

    function failAttempt(error) {
      if (!active()) return;
      settled = true;
      clearWatchdog();
      console.warn("AVPlay failure", urls[urlIndex], String(error || "buffer timeout"));
      failed();
    }

    try {
      stopAndClose();
      avplay.open(urls[urlIndex]);
      avplay.setDisplayRect(0, 0, 1920, 1080);
      try { avplay.setStreamingProperty('SET_MODE_4K', 'TRUE'); } catch (e) {}
      avplay.setListener({
        onbufferingcomplete: function () {
          if (!active()) return;
          clearWatchdog();
          hidePreload();
          scheduleHideInfo();
          prefetchNextThumbnail();
        },
        onstreamcompleted: function () {
          if (active()) { clearWatchdog(); playVideo(takeNext()); }
        },
        onerror: function (error) {
          if (!prepared) return;
          failAttempt(error);
        }
      });
      avplay.prepareAsync(function () {
        if (!active()) return;
        prepared = true;
        watchdog = setTimeout(function () {
          failAttempt();
        }, BUFFER_TIMEOUT_MS);
        try {
          avplay.play();
        } catch (e) {
          failAttempt(e);
        }
      }, failAttempt);
    } catch (e) {
      failAttempt(e);
    }
  }

  tryPlay();
}

function playVideo(index) {
  stopPlayback();
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
