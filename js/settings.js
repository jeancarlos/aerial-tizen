var DEFAULT_SETTINGS = {
  showDescription: true,
  descriptionTimer: 3,
  videoOrder: 'shuffle',
  category: 'all',
  customServerEnabled: false,
  customServerUrl: 'http://192.168.0.100:8090',
  devMode: false
};

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

var settings = {};

function storageGet(key) {
  try {
    if (tizen.preference.exists(key)) return tizen.preference.getValue(key);
  } catch (e) {}
  try { return localStorage.getItem(key); } catch (e) { return null; }
}

function storageSet(key, value) {
  try { tizen.preference.setValue(key, String(value)); } catch (e) {}
  try { localStorage.setItem(key, value); } catch (e) {}
}

function loadSettings() {
  var parsed = {};
  try { parsed = JSON.parse(storageGet('aerial_settings')) || {}; } catch (e) {}
  for (var key in DEFAULT_SETTINGS) {
    if (DEFAULT_SETTINGS.hasOwnProperty(key)) {
      settings[key] = typeof parsed[key] === typeof DEFAULT_SETTINGS[key] ? parsed[key] : DEFAULT_SETTINGS[key];
    }
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
}

function saveSettings() {
  storageSet('aerial_settings', JSON.stringify(settings));
}
