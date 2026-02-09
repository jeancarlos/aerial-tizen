// ── Settings ──

var DEFAULT_SETTINGS = {
  showDescription: true,
  descriptionTimer: 3,
  videoOrder: 'shuffle',
  category: 'all',
  customServerEnabled: false,
  customServerUrl: 'http://192.168.1.200:8090',
  devMode: false
};

var devSequence = '';
var DEV_TARGET_SEQUENCE = '12345';

var MENU_ITEMS = [
  {
    key: 'showDescription',
    label: 'Show Description',
    type: 'toggle',
    options: [
      { value: true, label: 'On' },
      { value: false, label: 'Off' }
    ]
  },
  {
    key: 'descriptionTimer',
    label: 'Description Timer',
    type: 'number',
    min: 1,
    max: 15,
    step: 1,
    suffix: 's'
  },
  {
    key: 'videoOrder',
    label: 'Video Order',
    type: 'toggle',
    options: [
      { value: 'shuffle', label: 'Shuffle' },
      { value: 'sequential', label: 'Sequential' }
    ]
  },
  {
    key: 'category',
    label: 'Category',
    type: 'toggle',
    options: [
      { value: 'all', label: 'All' },
      { value: 'space', label: 'Space' },
      { value: 'sea', label: 'Sea' },
      { value: 'landscape', label: 'Landscape' },
      { value: 'cityscape', label: 'Cityscape' }
    ]
  },
  {
    key: 'customServerEnabled',
    label: 'Use custom server',
    type: 'toggle',
    options: [
      { value: true, label: 'Yes' },
      { value: false, label: 'No' }
    ],
    devOnly: true
  },
  {
    key: 'customServerUrl',
    label: 'Files location',
    type: 'text',
    devOnly: true
  }
];

// ── State ──

var settings = {};
var playlist = [];
var playlistIndex = -1;
var videoIndex = -1;
var menuOpen = false;
var menuIndex = 0;
var infoTimer = null;
var firstPlay = true;

// ── DOM ──

var preloadEl = document.getElementById('preload');
var fade = document.getElementById('fade');
var info = document.getElementById('info');
var infoLabel = document.getElementById('info-label');
var infoDescription = document.getElementById('info-description');
var menuEl = document.getElementById('menu');
var menuItemsEl = document.getElementById('menu-items');
var avplay = webapis.avplay;

// ── LocalStorage persistence ──

function loadSettings() {
  try {
    var saved = localStorage.getItem('aerial_settings');
    if (saved) {
      var parsed = JSON.parse(saved);
      for (var key in DEFAULT_SETTINGS) {
        if (DEFAULT_SETTINGS.hasOwnProperty(key)) {
          settings[key] = parsed.hasOwnProperty(key) ? parsed[key] : DEFAULT_SETTINGS[key];
        }
      }
      return;
    }
  } catch (e) {}
  for (var key in DEFAULT_SETTINGS) {
    if (DEFAULT_SETTINGS.hasOwnProperty(key)) {
      settings[key] = DEFAULT_SETTINGS[key];
    }
  }
}

function saveSettings() {
  try {
    localStorage.setItem('aerial_settings', JSON.stringify(settings));
  } catch (e) {}
}

// ── Playlist ──

function buildPlaylist() {
  playlist = [];
  for (var i = 0; i < CATALOG.length; i++) {
    if (settings.category === 'all' || CATALOG[i].category === settings.category) {
      playlist.push(i);
    }
  }
  if (playlist.length === 0) {
    for (var j = 0; j < CATALOG.length; j++) {
      playlist.push(j);
    }
  }
  playlistIndex = -1;
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

// ── Preload thumbnail ──

var nextIndex = -1;

function getPreloadPath(url) {
  var filename = url.substring(url.lastIndexOf('/') + 1);
  filename = filename.replace('.mov', '.jpg').replace('.mp4', '.jpg');
  return 'preload/' + filename;
}

function prefetchNextThumbnail() {
  nextIndex = pickNext();
  new Image().src = getPreloadPath(CATALOG[nextIndex].url);
}

function showPreload(index, onComplete) {
  if (!preloadEl) {
    if (onComplete) onComplete();
    return;
  }
  var path = getPreloadPath(CATALOG[index].url);
  preloadEl.onerror = function () {
    preloadEl.classList.remove('visible');
    fade.classList.add('active');
    if (onComplete) onComplete();
  };
  function onFadeIn(e) {
    if (e.propertyName !== 'opacity') return;
    preloadEl.removeEventListener('transitionend', onFadeIn);
    if (onComplete) onComplete();
  }
  preloadEl.addEventListener('transitionend', onFadeIn);
  preloadEl.src = path;
  preloadEl.classList.add('visible');
}

function hidePreload() {
  if (!preloadEl) return;
  preloadEl.classList.remove('visible');
  fade.classList.remove('active');
}

// ── Info overlay (description = loader) ──

function showInfo(index) {
  if (!settings.showDescription) return;
  var video = CATALOG[index];
  infoLabel.textContent = video.label;
  infoDescription.textContent = video.description;
  info.classList.add('visible');
}

function hideInfo() {
  info.classList.remove('visible');
  if (infoTimer) {
    clearTimeout(infoTimer);
    infoTimer = null;
  }
}

function scheduleHideInfo() {
  if (!settings.showDescription) return;
  if (infoTimer) clearTimeout(infoTimer);
  infoTimer = setTimeout(function () {
    info.classList.remove('visible');
    infoTimer = null;
  }, settings.descriptionTimer * 1000);
}

// ── AVPlay ──

var listener = {
  onbufferingstart: function () {},
  onbufferingprogress: function () {},
  onbufferingcomplete: function () {
    hidePreload();
    scheduleHideInfo();
    prefetchNextThumbnail();
  },
  onstreamcompleted: function () {
    stopAndClose();
    var idx = nextIndex >= 0 ? nextIndex : pickNext();
    nextIndex = -1;
    playVideo(idx);
  },
  oncurrentplaytime: function () {},
  onevent: function () {},
  onerror: function () {
    stopAndClose();
    setTimeout(function () {
      playVideo(pickNext());
    }, 2000);
  }
};

function stopAndClose() {
  try { avplay.stop(); } catch (e) {}
  try { avplay.close(); } catch (e) {}
}

function startVideo(index) {
  videoIndex = index;
  try { localStorage.setItem('aerial_index', videoIndex); } catch (e) {}

  stopAndClose();
  showInfo(index);

  try {
    var url = CATALOG[videoIndex].url;
    if (settings.customServerEnabled && settings.customServerUrl) {
      var filename = url.substring(url.lastIndexOf('/') + 1);
      url = settings.customServerUrl + (settings.customServerUrl.endsWith('/') ? '' : '/') + filename;
    }

    avplay.open(url);
    avplay.setDisplayRect(0, 0, 1920, 1080);
    avplay.setListener(listener);
    avplay.prepareAsync(function () {
      avplay.play();
    }, function () {
      setTimeout(function () { playVideo(pickNext()); }, 2000);
    });
  } catch (e) {
    setTimeout(function () { playVideo(pickNext()); }, 2000);
  }
}

function playVideo(index) {
  hideInfo();
  showPreload(index, function () {
    firstPlay = false;
    startVideo(index);
  });
}

// ── Menu (DOM-based rendering) ──

function createMenuItemEl(item, isActive) {
  var value = settings[item.key];
  var display = '';

  if (item.type === 'toggle') {
    for (var j = 0; j < item.options.length; j++) {
      if (item.options[j].value === value) {
        display = item.options[j].label;
        break;
      }
    }
  } else if (item.type === 'number') {
    display = value + (item.suffix || '');
  } else if (item.type === 'text') {
    display = value;
  }

  var row = document.createElement('div');
  row.className = 'menu-item' + (isActive ? ' active' : '');

  var label = document.createElement('span');
  label.className = 'menu-label';
  label.textContent = item.label;

  var val = document.createElement('span');
  val.className = 'menu-value';

  var arrowL = document.createElement('span');
  arrowL.className = 'menu-arrow';
  arrowL.textContent = item.type === 'text' ? '' : '\u25C0 ';

  var text = document.createTextNode(display);

  var arrowR = document.createElement('span');
  arrowR.className = 'menu-arrow';
  arrowR.textContent = item.type === 'text' ? '' : ' \u25B6';

  val.appendChild(arrowL);
  val.appendChild(text);
  val.appendChild(arrowR);

  row.appendChild(label);
  row.appendChild(val);

  return row;
}

function getVisibleMenuItems() {
  var visible = [];
  for (var i = 0; i < MENU_ITEMS.length; i++) {
    if (!MENU_ITEMS[i].devOnly || settings.devMode) {
      visible.push(MENU_ITEMS[i]);
    }
  }
  return visible;
}

function renderMenu() {
  while (menuItemsEl.firstChild) {
    menuItemsEl.removeChild(menuItemsEl.firstChild);
  }
  var visible = getVisibleMenuItems();
  for (var i = 0; i < visible.length; i++) {
    menuItemsEl.appendChild(createMenuItemEl(visible[i], i === menuIndex));
  }
}

function openMenu() {
  menuOpen = true;
  menuIndex = 0;
  renderMenu();
  menuEl.classList.add('visible');
  if (settings.showDescription && videoIndex >= 0) {
    showInfo(videoIndex);
    if (infoTimer) { clearTimeout(infoTimer); infoTimer = null; }
  }
}

function closeMenu() {
  menuOpen = false;
  menuEl.classList.remove('visible');
  hideInfo();
  saveSettings();
}

function testConnection(baseUrl, callback) {
  var videoUrl = CATALOG[0].url;
  var filename = videoUrl.substring(videoUrl.lastIndexOf('/') + 1);
  var testUrl = baseUrl + (baseUrl.endsWith('/') ? '' : '/') + filename;

  var xhr = new XMLHttpRequest();
  xhr.open('HEAD', testUrl, true);
  xhr.timeout = 5000;
  xhr.onreadystatechange = function () {
    if (xhr.readyState === 4) {
      if (xhr.status >= 200 && xhr.status < 300) {
        callback(true);
      } else {
        callback(false);
      }
    }
  };
  xhr.onerror = function () { callback(false); };
  xhr.ontimeout = function () { callback(false); };
  xhr.send();
}

function menuChangeValue(direction) {
  var visible = getVisibleMenuItems();
  var item = visible[menuIndex];
  var current = settings[item.key];

  if (item.type === 'toggle') {
    var idx = 0;
    for (var i = 0; i < item.options.length; i++) {
      if (item.options[i].value === current) {
        idx = i;
        break;
      }
    }
    var nextIdx = (idx + direction + item.options.length) % item.options.length;
    var nextValue = item.options[nextIdx].value;

    if (item.key === 'customServerEnabled' && nextValue === true) {
      testConnection(settings.customServerUrl, function (success) {
        if (success) {
          settings[item.key] = true;
        } else {
          alert('Could not reach custom server. Test failed.');
          settings[item.key] = false;
        }
        renderMenu();
      });
      return;
    }

    settings[item.key] = nextValue;
  } else if (item.type === 'number') {
    var val = current + (direction * item.step);
    if (val < item.min) val = item.max;
    if (val > item.max) val = item.min;
    settings[item.key] = val;
  } else if (item.type === 'text') {
    var newVal = prompt('Enter files location URL', settings[item.key]);
    if (newVal !== null && newVal !== '') {
      testConnection(newVal, function (success) {
        if (success) {
          settings[item.key] = newVal;
          renderMenu();
        } else {
          alert('Could not reach ' + newVal + '. URL not updated.');
        }
      });
      return;
    }
  }

  if (item.key === 'category') {
    buildPlaylist();
  }

  if (item.key === 'showDescription') {
    if (settings.showDescription && videoIndex >= 0) {
      showInfo(videoIndex);
      if (infoTimer) { clearTimeout(infoTimer); infoTimer = null; }
    } else {
      hideInfo();
    }
  }

  renderMenu();
}

// ── Remote control ──

try {
  tizen.tvinputdevice.registerKey('MediaPlayPause');
  tizen.tvinputdevice.registerKey('MediaPlay');
  tizen.tvinputdevice.registerKey('MediaPause');
  tizen.tvinputdevice.registerKey('MediaFastForward');
  tizen.tvinputdevice.registerKey('MediaStop');
  tizen.tvinputdevice.registerKey('ChannelUp');
  tizen.tvinputdevice.registerKey('ChannelDown');
  tizen.tvinputdevice.registerKey('0');
  tizen.tvinputdevice.registerKey('1');
  tizen.tvinputdevice.registerKey('2');
  tizen.tvinputdevice.registerKey('3');
  tizen.tvinputdevice.registerKey('4');
  tizen.tvinputdevice.registerKey('5');
  tizen.tvinputdevice.registerKey('6');
  tizen.tvinputdevice.registerKey('7');
  tizen.tvinputdevice.registerKey('8');
  tizen.tvinputdevice.registerKey('9');
} catch (e) {}

document.addEventListener('keydown', function (e) {
  // ── Dev mode sequence (1-2-3-4-5) ──
  var key = '';
  if (e.keyCode >= 48 && e.keyCode <= 57) key = (e.keyCode - 48).toString();
  else if (e.keyCode >= 96 && e.keyCode <= 105) key = (e.keyCode - 96).toString();

  if (key !== '') {
    devSequence += key;
    if (devSequence.length > DEV_TARGET_SEQUENCE.length) {
      devSequence = devSequence.substring(devSequence.length - DEV_TARGET_SEQUENCE.length);
    }
    if (devSequence === DEV_TARGET_SEQUENCE) {
      settings.devMode = !settings.devMode;
      if (!settings.devMode) {
        settings.customServerEnabled = false;
      }
      saveSettings();
      if (menuOpen) renderMenu();
      devSequence = '';
    }
  }

  if (menuOpen) {
    var visible = getVisibleMenuItems();
    switch (e.keyCode) {
      case 38: // Up
        menuIndex = (menuIndex - 1 + visible.length) % visible.length;
        renderMenu();
        break;
      case 40: // Down
        menuIndex = (menuIndex + 1) % visible.length;
        renderMenu();
        break;
      case 37: // Left
        menuChangeValue(-1);
        break;
      case 39: // Right
        menuChangeValue(1);
        break;
      case 13: // Enter - toggle value
        menuChangeValue(1);
        break;
      case 10009: // Back - close menu
        closeMenu();
        break;
    }
    return;
  }

  switch (e.keyCode) {
    case 13:    // Enter - open menu
      openMenu();
      break;
    case 10252: // PlayPause
      try {
        var state = avplay.getState();
        if (state === 'PLAYING') avplay.pause();
        else if (state === 'PAUSED') avplay.play();
      } catch (err) {}
      break;
    case 415:   // Play
      try { avplay.play(); } catch (err) {}
      break;
    case 19:    // Pause
      try { avplay.pause(); } catch (err) {}
      break;
    case 417:   // FastForward - next video
    case 39:    // Right arrow
    case 427:   // ChannelUp
    case 428:   // ChannelDown
      stopAndClose();
      var idx = nextIndex >= 0 ? nextIndex : pickNext();
      nextIndex = -1;
      playVideo(idx);
      break;
    case 413:   // Stop
    case 10009: // Back - exit app
      stopAndClose();
      try { tizen.application.getCurrentApplication().exit(); } catch (err) {}
      break;
  }
});

// ── Init ──

loadSettings();
buildPlaylist();

var saved = -1;
try { saved = parseInt(localStorage.getItem('aerial_index'), 10); } catch (e) {}

var startIdx = pickNext();
if (saved >= 0 && saved < CATALOG.length) {
  for (var i = 0; i < playlist.length; i++) {
    if (playlist[i] === saved) {
      startIdx = saved;
      playlistIndex = i;
      break;
    }
  }
}

playVideo(startIdx);
