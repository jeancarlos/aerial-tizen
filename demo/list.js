// SPDX-FileCopyrightText: 2026 Jean
// SPDX-License-Identifier: MIT
function buildCatalogList(catalog, doc, onPlay) {
  var root = doc.createElement('div');
  var search = doc.createElement('input');
  search.setAttribute('type', 'search');
  search.setAttribute('placeholder', 'Filter ' + catalog.length + ' videos');
  search.oninput = function () { filterCatalogList(root, search.value); };
  root.appendChild(search);
  var groups = {};
  var order = [];
  catalog.forEach(function (video) {
    if (!groups[video.category]) {
      groups[video.category] = [];
      order.push(video.category);
    }
    groups[video.category].push(video);
  });
  order.forEach(function (category) {
    var heading = doc.createElement('h2');
    heading.textContent = category.charAt(0).toUpperCase() + category.slice(1) + ' (' + groups[category].length + ')';
    root.appendChild(heading);
    groups[category].forEach(function (video) {
      var row = doc.createElement('div');
      var play = doc.createElement('button');
      play.textContent = 'Play';
      play.onclick = function () { onPlay(catalog.indexOf(video)); };
      var link = doc.createElement('a');
      link.textContent = video.label;
      link.setAttribute('href', video.url);
      link.setAttribute('target', '_blank');
      link.setAttribute('rel', 'noopener noreferrer');
      var thumb = doc.createElement('img');
      thumb.setAttribute('src', 'preload/' + video.url.slice(video.url.lastIndexOf('/') + 1).replace(/\.(mov|mp4)$/, '.webp'));
      thumb.setAttribute('alt', '');
      thumb.setAttribute('loading', 'lazy');
      var text = doc.createElement('span');
      text.textContent = video.description;
      row.searchText = (video.label + ' ' + video.description).toLowerCase();
      row.appendChild(play);
      row.appendChild(link);
      row.appendChild(text);
      row.appendChild(thumb);
      root.appendChild(row);
    });
  });
  return root;
}

function filterCatalogList(root, query) {
  var needle = query.trim().toLowerCase();
  var heading = null;
  var shown = 0;
  Array.prototype.forEach.call(root.children, function (child) {
    if (child.tagName === 'H2') {
      if (heading) heading.hidden = shown === 0;
      heading = child;
      shown = 0;
    } else if (child.searchText !== undefined) {
      child.hidden = needle !== '' && child.searchText.indexOf(needle) < 0;
      if (!child.hidden) shown++;
    }
  });
  if (heading) heading.hidden = shown === 0;
}

function playFromCatalogList(index) {
  playVideo(index);
}

function toggleCatalogList() {
  var panel = document.getElementById('catalog-list');
  if (!panel.firstChild) panel.appendChild(buildCatalogList(CATALOG, document, playFromCatalogList));
  panel.classList.toggle('open');
}
