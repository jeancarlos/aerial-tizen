var PRELOAD_FADE_MS = 500;
var ERROR_SKIP_MS = 2000;

var playlist = [];
var playlistIndex = -1;
var videoIndex = -1;
var nextIndex = -1;
var playToken = 0;
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

function getPreloadPath(url) {
  var filename = url.substring(url.lastIndexOf('/') + 1);
  return 'preload/' + filename.replace(/\.(mov|mp4)$/, '.jpg');
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
    var base = settings.customServerUrl;
    return [base + (base.endsWith('/') ? '' : '/') + url.substring(url.lastIndexOf('/') + 1)];
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
  var attempt = 0;

  function tryPlay() {
    if (token !== playToken) return;
    if (attempt >= urls.length) {
      skipAfterError();
      return;
    }
    var prepared = false;
    try {
      stopAndClose();
      avplay.open(urls[attempt++]);
      avplay.setDisplayRect(0, 0, 1920, 1080);
      try { avplay.setStreamingProperty('SET_MODE_4K', 'TRUE'); } catch (e) {}
      avplay.setListener({
        onbufferingcomplete: function () {
          if (token !== playToken) return;
          hidePreload();
          scheduleHideInfo();
          prefetchNextThumbnail();
        },
        onstreamcompleted: function () {
          if (token === playToken) playVideo(takeNext());
        },
        onerror: function () {
          if (prepared && token === playToken) skipAfterError();
        }
      });
      avplay.prepareAsync(function () {
        if (token !== playToken) return;
        prepared = true;
        try {
          avplay.play();
        } catch (e) {
          tryPlay();
        }
      }, tryPlay);
    } catch (e) {
      tryPlay();
    }
  }

  tryPlay();
}

function playVideo(index) {
  stopPlayback();
  var token = playToken;
  hideInfo();
  videoIndex = index;
  try { localStorage.setItem('aerial_index', index); } catch (e) {}

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
