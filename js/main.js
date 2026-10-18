// SPDX-FileCopyrightText: 2026 Jean
// SPDX-License-Identifier: MIT
var DEV_TARGET_SEQUENCE = '12345';
var devSequence = '';

var REGISTERED_KEYS = [
  'MediaPlayPause', 'MediaPlay', 'MediaPause', 'MediaFastForward', 'MediaStop',
  'ChannelUp', 'ChannelDown', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'
];

REGISTERED_KEYS.forEach(function (key) {
  try { tizen.tvinputdevice.registerKey(key); } catch (e) {}
});

function handleDevSequence(keyCode) {
  var digit = '';
  if (keyCode >= 48 && keyCode <= 57) digit = String(keyCode - 48);
  else if (keyCode >= 96 && keyCode <= 105) digit = String(keyCode - 96);
  if (!digit) return;

  devSequence = (devSequence + digit).slice(-DEV_TARGET_SEQUENCE.length);
  if (devSequence !== DEV_TARGET_SEQUENCE) return;

  devSequence = '';
  var enabled = !settings.devMode;
  if (!enabled) applySetting('customServerEnabled', false);
  applySetting('devMode', enabled);
}

function handleMenuKey(keyCode) {
  switch (keyCode) {
    case 38: moveMenu(-1); break;       // Up
    case 40: moveMenu(1); break;        // Down
    case 37: menuChangeValue(-1); break; // Left
    case 39:                            // Right
    case 13: menuChangeValue(1); break; // Enter
    case 10009: closeMenu(); break;     // Back
  }
}

function togglePause() {
  try {
    var state = avplay.getState();
    if (state === 'PLAYING') avplay.pause();
    else if (state === 'PAUSED') avplay.play();
  } catch (err) {}
}

function skipVideo() {
  playVideo(takeNext());
}

function exitApp() {
  stopPlayback();
  try { tizen.application.getCurrentApplication().exit(); } catch (err) {}
}

var PLAYER_KEYS = {
  // 0 shows the event log, which is the only view into the TV
  48: function () { if (settings.devMode) debugToggle(); },
  13: openMenu,
  10252: togglePause,
  415: function () { try { avplay.play(); } catch (err) {} },
  19: function () { try { avplay.pause(); } catch (err) {} },
  417: skipVideo,
  39: skipVideo,
  427: skipVideo,
  428: skipVideo,
  413: exitApp,
  10009: exitApp
};

function handlePlayerKey(keyCode) {
  var action = PLAYER_KEYS[keyCode];
  if (action) action();
}

document.addEventListener('keydown', function (e) {
  handleDevSequence(e.keyCode);
  if (menuOpen) handleMenuKey(e.keyCode);
  else handlePlayerKey(e.keyCode);
});

document.addEventListener('visibilitychange', function () {
  if (document.hidden) stopPlayback();
  else playVideo(videoIndex >= 0 ? videoIndex : takeNext());
});

loadSettings();

if (!CATALOG.length) {
  throw new Error('CATALOG is empty: js/catalog.js failed to load');
}

buildPlaylist();

var savedIndex = parseInt(storageGet('aerial_index'), 10);

storageInitFile(function (saved) {
  debugProbeFileBackend();
  if (!saved) {
    telemetry('storage_restore_skipped', { reason: 'no file' });
    return;
  }
  if (settingsTouched || videoIndex !== startupIndex) {
    telemetry('storage_restore_skipped', { reason: 'viewer already navigated' });
    return;
  }
  loadSettings();
  buildPlaylist();
  var fileIndex = parseInt(storageFileSnapshotGet('aerial_index'), 10);
  if (fileIndex !== videoIndex && playlist.indexOf(fileIndex) >= 0) playVideo(fileIndex);
  telemetry('storage_restored', { backend: storageBackend(), index: videoIndex });
});

debugProbeSyncBackends();
telemetryProbe();

telemetry('app_start', {
  catalog_size: CATALOG.length,
  category: settings.category,
  order: settings.videoOrder,
  custom_server: settings.customServerEnabled ? settings.customServerUrl : ''
});

var startupIndex = playlist.indexOf(savedIndex) >= 0 ? savedIndex : pickNext();
playVideo(startupIndex);
