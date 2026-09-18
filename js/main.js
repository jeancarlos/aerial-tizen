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
  settings.devMode = !settings.devMode;
  if (!settings.devMode) settings.customServerEnabled = false;
  saveSettings();
  if (menuOpen) renderMenu();
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

function handlePlayerKey(keyCode) {
  switch (keyCode) {
    case 13: // Enter
      openMenu();
      break;
    case 10252: // PlayPause
      try {
        var state = avplay.getState();
        if (state === 'PLAYING') avplay.pause();
        else if (state === 'PAUSED') avplay.play();
      } catch (err) {}
      break;
    case 415: // Play
      try { avplay.play(); } catch (err) {}
      break;
    case 19: // Pause
      try { avplay.pause(); } catch (err) {}
      break;
    case 417: // FastForward
    case 39:  // Right
    case 427: // ChannelUp
    case 428: // ChannelDown
      playVideo(takeNext());
      break;
    case 413:   // Stop
    case 10009: // Back
      stopPlayback();
      try { tizen.application.getCurrentApplication().exit(); } catch (err) {}
      break;
  }
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
playlistIndex = playlist.indexOf(savedIndex);
telemetryProbe();

telemetry('app_start', {
  catalog_size: CATALOG.length,
  category: settings.category,
  order: settings.videoOrder,
  custom_server: settings.customServerEnabled ? settings.customServerUrl : ''
});

playVideo(playlistIndex >= 0 ? savedIndex : pickNext());
