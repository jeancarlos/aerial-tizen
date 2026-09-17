var menuOpen = false;
var menuIndex = 0;

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
  arrowL.textContent = item.type === 'text' ? '' : '◀ ';

  var arrowR = document.createElement('span');
  arrowR.className = 'menu-arrow';
  arrowR.textContent = item.type === 'text' ? '' : ' ▶';

  val.appendChild(arrowL);
  val.appendChild(document.createTextNode(display));
  val.appendChild(arrowR);
  row.appendChild(label);
  row.appendChild(val);
  return row;
}

function renderMenu() {
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
  var videoUrl = CATALOG[0].url;
  var testUrl = baseUrl + (baseUrl.endsWith('/') ? '' : '/') + videoUrl.substring(videoUrl.lastIndexOf('/') + 1);
  var xhr = new XMLHttpRequest();
  xhr.open('HEAD', testUrl, true);
  xhr.timeout = 5000;
  xhr.onload = function () { callback(xhr.status >= 200 && xhr.status < 300); };
  xhr.onerror = function () { callback(false); };
  xhr.ontimeout = function () { callback(false); };
  xhr.send();
}

function applySetting(key, value) {
  settings[key] = value;
  saveSettings();

  if (key === 'category' || key === 'videoOrder') buildPlaylist();

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

function menuChangeValue(direction) {
  var item = getVisibleMenuItems()[menuIndex];
  var current = settings[item.key];

  if (item.type === 'toggle') {
    var idx = 0;
    for (var i = 0; i < item.options.length; i++) {
      if (item.options[i].value === current) idx = i;
    }
    var nextValue = item.options[(idx + direction + item.options.length) % item.options.length].value;

    if (item.key === 'customServerEnabled' && nextValue === true) {
      testConnection(settings.customServerUrl, function (success) {
        if (!success) alert('Could not reach custom server. Test failed.');
        applySetting(item.key, success);
      });
      return;
    }
    applySetting(item.key, nextValue);
  } else if (item.type === 'number') {
    var val = current + direction * item.step;
    if (val < item.min) val = item.max;
    if (val > item.max) val = item.min;
    applySetting(item.key, val);
  } else if (item.type === 'text') {
    var newVal = prompt('Enter files location URL', current);
    if (!newVal) return;
    testConnection(newVal, function (success) {
      if (success) applySetting(item.key, newVal);
      else alert('Could not reach ' + newVal + '. URL not updated.');
    });
  }
}
