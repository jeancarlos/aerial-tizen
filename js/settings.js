var LOCAL_SERVER = (typeof AERIAL_LOCAL_SERVER !== 'undefined') ? AERIAL_LOCAL_SERVER : '';

var DEFAULT_SETTINGS = {
  showDescription: true,
  descriptionTimer: 3,
  videoOrder: 'shuffle',
  category: 'all',
  customServerEnabled: !!LOCAL_SERVER,
  customServerUrl: LOCAL_SERVER || 'http://192.168.0.100:8090',
  devMode: !!LOCAL_SERVER
};

var CATEGORIES = [
  { value: 'all', label: 'All' },
  { value: 'space', label: 'Space' },
  { value: 'sea', label: 'Sea' },
  { value: 'landscape', label: 'Landscape' },
  { value: 'cityscape', label: 'Cityscape' }
];

// Offering a category the catalog cannot fill makes the setting look ignored:
// buildPlaylist has to fall back to the whole catalog to have anything to play.
// ponytail: a category that appears in the catalog without an entry above stays
// unlisted until someone gives it a label.
function categoryOptions() {
  return CATEGORIES.filter(function (option) {
    if (option.value === 'all') return true;
    for (var i = 0; i < CATALOG.length; i++) {
      if (CATALOG[i].category === option.value) return true;
    }
    return false;
  });
}

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
    options: categoryOptions()
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
    key: 'storageBackend',
    label: 'Settings stored in',
    type: 'info',
    devOnly: true
  },
  {
    key: 'customServerUrl',
    label: 'Files location',
    type: 'text',
    devOnly: true
  }
];

var settings = {};
var settingsTouched = false;

function loadSettings() {
  var parsed = {};
  try { parsed = JSON.parse(storageGet('aerial_settings')) || {}; } catch (e) {}
  for (var key in DEFAULT_SETTINGS) {
    if (DEFAULT_SETTINGS.hasOwnProperty(key)) {
      settings[key] = typeof parsed[key] === typeof DEFAULT_SETTINGS[key] ? parsed[key] : DEFAULT_SETTINGS[key];
    }
  }
  if (LOCAL_SERVER) {
    // A deployment that ships a server address means to use it: the stored
    // toggle would otherwise keep a failed test from an older build.
    settings.customServerUrl = LOCAL_SERVER;
    settings.customServerEnabled = true;
    settings.devMode = true;
  }
  clampSettings();
}

function clampSettings() {
  for (var i = 0; i < MENU_ITEMS.length; i++) {
    var item = MENU_ITEMS[i];
    if (item.type !== 'number') continue;
    if (settings[item.key] < item.min) settings[item.key] = item.min;
    if (settings[item.key] > item.max) settings[item.key] = item.max;
  }
  var offered = categoryOptions();
  var known = false;
  for (var c = 0; c < offered.length; c++) {
    if (offered[c].value === settings.category) known = true;
  }
  if (!known) settings.category = 'all';
}

function saveSettings() {
  storageSet('aerial_settings', JSON.stringify(settings));
}
