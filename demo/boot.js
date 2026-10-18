function simCreateTizen(doc) {
  return {
    tvinputdevice: { registerKey: function () {} },
    application: {
      getCurrentApplication: function () {
        return {
          exit: function () {
            doc.title = 'Aerial [exited]';
            doc.body.textContent = '';
            doc.body.style.background = '#000';
          }
        };
      }
    }
  };
}

function simOnKeydown(e, doc) {
  var action = simKeyAction(e.keyCode, e.target.tagName, doc.getElementById('catalog-list').classList.contains('open'));
  if (action === 'pass') return;
  if (action === 'playpause' || action === 'back') {
    e.preventDefault();
    doc.dispatchEvent(new KeyboardEvent('keydown', {keyCode: action === 'playpause' ? 10252 : simBackKey(menuOpen), bubbles: true}));
  }
  if (action === 'toggle-list' || action === 'close-list') {
    e.preventDefault();
    toggleCatalogList();
  }
  e.stopImmediatePropagation();
}

function simFadeKeys(doc) {
  var keys = doc.getElementById('sim-keys');
  if (keys) keys.classList.add('fade');
}

function simWireCatalogButton(doc) {
  doc.getElementById('catalog-button').addEventListener('click', function () { toggleCatalogList(); });
}

var tizen = simCreateTizen(document);
var webapis = {
  avplay: simCreateAvplay(
    document.getElementById('sim-video'),
    document.getElementById('sim-still'),
    simUseStills(location.protocol, location.search, DEMO_PROXY),
    function (url) { return simBrowserUrl(url, location.protocol, DEMO_PROXY); }
  )
};
document.addEventListener('keydown', function (e) { simOnKeydown(e, document); }, true);
document.addEventListener('keydown', function () { simFadeKeys(document); }, {once: true});
simWireCatalogButton(document);
