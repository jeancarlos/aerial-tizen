// SPDX-FileCopyrightText: 2026 Jean
// SPDX-License-Identifier: MIT
var menuOpen = false;
var menuIndex = 0;
var menuBusyKey = null;

var menuEl = document.getElementById('menu');
var menuItemsEl = document.getElementById('menu-items');

function getVisibleMenuItems() {
  return MENU_ITEMS.filter(function (item) {
    return !item.devOnly || settings.devMode;
  });
}

function createMenuItemEl(item, isActive) {
  var value = settings[item.key];
  var display = value;

  if (item.type === 'toggle') {
    for (var i = 0; i < item.options.length; i++) {
      if (item.options[i].value === value) display = item.options[i].label;
    }
  } else if (item.type === 'number') {
    display = value + item.suffix;
  } else if (item.type === 'info') {
    display = storageBackend();
  }

  var busy = menuBusyKey === item.key;
  if (busy) display = 'testing…';

  var row = document.createElement('div');
  row.className = 'menu-item' + (isActive ? ' active' : '');

  var label = document.createElement('span');
  label.className = 'menu-label';
  label.textContent = item.label;

  var val = document.createElement('span');
  val.className = 'menu-value';

  var arrowL = document.createElement('span');
  arrowL.className = 'menu-arrow';
  arrowL.textContent = (item.type === 'text' || item.type === 'info' || busy) ? '' : '◀ ';

  var arrowR = document.createElement('span');
  arrowR.className = 'menu-arrow';
  arrowR.textContent = (item.type === 'text' || item.type === 'info' || busy) ? '' : ' ▶';

  val.appendChild(arrowL);
  val.appendChild(document.createTextNode(display));
  val.appendChild(arrowR);
  row.appendChild(label);
  row.appendChild(val);
  return row;
}

function supportsBlur() {
  return typeof CSS !== 'undefined' && !!CSS.supports &&
    (CSS.supports('backdrop-filter', 'blur(1px)') || CSS.supports('-webkit-backdrop-filter', 'blur(1px)'));
}

function renderMenu() {
  if (supportsBlur()) menuEl.classList.add('blur');
  else menuEl.classList.remove('blur');
  if (settings.menuTheme === 'light') menuEl.classList.add('light');
  else menuEl.classList.remove('light');
  var visible = getVisibleMenuItems();
  menuIndex = Math.min(menuIndex, visible.length - 1);
  menuItemsEl.textContent = '';
  for (var i = 0; i < visible.length; i++) {
    menuItemsEl.appendChild(createMenuItemEl(visible[i], i === menuIndex));
  }
}

function openMenu() {
  menuOpen = true;
  menuIndex = 0;
  renderMenu();
  menuEl.classList.add('visible');
  if (videoIndex >= 0) {
    showInfo(videoIndex);
    clearInfoTimer();
  }
}

function closeMenu() {
  menuOpen = false;
  menuEl.classList.remove('visible');
  hideInfo();
  saveSettings();
}

function moveMenu(direction) {
  var count = getVisibleMenuItems().length;
  menuIndex = (menuIndex + direction + count) % count;
  renderMenu();
}

function testConnection(baseUrl, callback) {
  var testUrl = joinUrl(baseUrl, fileName(CATALOG[0].url));
  var xhr = new XMLHttpRequest();
  xhr.timeout = 5000;
  xhr.onload = function () { callback(xhr.status >= 200 && xhr.status < 300); };
  xhr.onerror = function () { callback(false); };
  xhr.ontimeout = function () { callback(false); };
  try {
    xhr.open('HEAD', testUrl, true);
    xhr.send();
  } catch (e) {
    callback(false);
  }
}

function applySetting(key, value) {
  settingsTouched = true;
  settings[key] = value;
  saveSettings();

  if (key === 'category' || key === 'videoOrder') {
    buildPlaylist();
    playVideo(takeNext());
  }

  if (key === 'showDescription') {
    if (value && videoIndex >= 0) {
      showInfo(videoIndex);
      clearInfoTimer();
    } else {
      hideInfo();
    }
  }

  renderMenu();
}

function nextOption(item, current, direction) {
  var idx = 0;
  for (var i = 0; i < item.options.length; i++) {
    if (item.options[i].value === current) idx = i;
  }
  return item.options[(idx + direction + item.options.length) % item.options.length].value;
}

function menuChangeToggle(item, current, direction) {
  var nextValue = nextOption(item, current, direction);
  if (item.key !== 'customServerEnabled' || nextValue !== true) {
    applySetting(item.key, nextValue);
    return;
  }
  menuBusyKey = item.key;
  renderMenu();
  testConnection(settings.customServerUrl, function (success) {
    menuBusyKey = null;
    applySetting(item.key, success);
    if (!success) alert('Could not reach custom server. Test failed.');
  });
}

function menuChangeNumber(item, current, direction) {
  var val = current + direction * item.step;
  if (val < item.min) val = item.max;
  if (val > item.max) val = item.min;
  applySetting(item.key, val);
}

function menuChangeText(item, current) {
  var newVal = prompt('Enter files location URL', current);
  if (!newVal) return;
  menuBusyKey = item.key;
  renderMenu();
  testConnection(newVal, function (success) {
    menuBusyKey = null;
    if (success) {
      applySetting(item.key, newVal);
    } else {
      renderMenu();
      alert('Could not reach ' + newVal + '. URL not updated.');
    }
  });
}

var MENU_CHANGERS = { toggle: menuChangeToggle, number: menuChangeNumber, text: menuChangeText };

function menuChangeValue(direction) {
  if (menuBusyKey) return;
  var item = getVisibleMenuItems()[menuIndex];
  var change = MENU_CHANGERS[item.type];
  if (change) change(item, settings[item.key], direction);
}
