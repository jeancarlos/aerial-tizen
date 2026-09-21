// Durable storage for a Tizen TV app, most durable backend first.
//
// localStorage alone is not enough: Chromium commits it lazily, so a value
// written just before the app exits can be lost, and this TV may clear it
// between restarts. tizen.preference is the native per-app store and is
// synchronous. wgt-private is a real file in the app's own directory, but its
// API is asynchronous, which is where the ordering rules below come from:
//
//   - writes made before the file resolves are queued, not dropped
//   - the file's previous contents are snapshotted before anything opens it
//     for writing, because opening in 'w' truncates
//   - the snapshot is what a persistence probe must read: a value this run
//     wrote proves nothing about restarts
//   - file writes are single-flight, so a burst cannot interleave

var STORAGE_FILE = 'aerial-state.json';

var storageFsDir = null;
var storageFsCache = {};
var storageFileSnapshot = null;
var storageReady = false;
var storagePending = {};
var storageWriting = false;
var storageDirty = false;
var storageErrors = [];

function storageHasPreference() {
  try {
    return typeof tizen !== 'undefined' && !!tizen.preference &&
      typeof tizen.preference.setValue === 'function';
  } catch (e) {
    return false;
  }
}

function storageHasFilesystem() {
  try {
    return typeof tizen !== 'undefined' && !!tizen.filesystem &&
      typeof tizen.filesystem.resolve === 'function';
  } catch (e) {
    return false;
  }
}

// Derived, never stored: a name set as a side effect of the last read or
// write reports whoever answered most recently, not where settings live.
function storageBackend() {
  if (storageHasPreference()) return 'preference';
  if (storageHasFilesystem() && storageReady) return 'wgt-private';
  return 'localStorage';
}

function storageNoteError(backend, message) {
  storageErrors.push(backend + ': ' + message);
  if (storageErrors.length > 8) storageErrors.shift();
  if (typeof telemetry === 'function') {
    telemetry('storage_write_error', { backend: backend, message: String(message).slice(0, 80) });
  }
}

function storageErrorList() {
  return storageErrors.slice(0);
}

// ── Per-backend primitives. Probes use these directly so a value never
// ── launders from one backend into another through the broadcast below.

function storagePreferenceGet(key) {
  if (!storageHasPreference()) return null;
  try {
    return tizen.preference.exists(key) ? tizen.preference.getValue(key) : null;
  } catch (e) {
    return null;
  }
}

function storagePreferenceSet(key, value) {
  if (!storageHasPreference()) return false;
  try {
    tizen.preference.setValue(key, String(value));
    return true;
  } catch (e) {
    storageNoteError('preference', e && e.message ? e.message : e);
    return false;
  }
}

function storageLocalGet(key) {
  try {
    return localStorage.getItem(key);
  } catch (e) {
    return null;
  }
}

function storageLocalSet(key, value) {
  try {
    localStorage.setItem(key, String(value));
    return true;
  } catch (e) {
    storageNoteError('localStorage', e && e.message ? e.message : e);
    return false;
  }
}

// The file as it was on disk when the app started, before this run wrote
// anything. A persistence probe must read from here.
function storageFileSnapshotGet(key) {
  if (!storageFileSnapshot) return null;
  return storageFileSnapshot.hasOwnProperty(key) ? storageFileSnapshot[key] : null;
}

function storageFileSet(key, value) {
  if (!storageHasFilesystem()) return false;
  if (!storageReady) {
    storagePending[key] = String(value);
    return true;
  }
  storageFsCache[key] = String(value);
  storageFlushFile();
  return true;
}

function storageFlushFile() {
  if (!storageReady || !storageFsDir) return;
  if (storageWriting) {
    storageDirty = true;
    return;
  }
  storageWriting = true;
  var payload = JSON.stringify(storageFsCache);
  try {
    var file = null;
    try { file = storageFsDir.resolve(STORAGE_FILE); } catch (e) {}
    if (!file) file = storageFsDir.createFile(STORAGE_FILE);
    file.openStream('w', function (stream) {
      try {
        stream.write(payload);
      } catch (e) {
        storageNoteError('wgt-private', e && e.message ? e.message : e);
      }
      try { stream.close(); } catch (e) {}
      storageWriting = false;
      if (storageDirty) {
        storageDirty = false;
        storageFlushFile();
      }
    }, function (error) {
      storageWriting = false;
      storageNoteError('wgt-private', error && error.message ? error.message : 'openStream failed');
    }, 'UTF-8');
  } catch (e) {
    storageWriting = false;
    storageNoteError('wgt-private', e && e.message ? e.message : e);
  }
}

// Reads the durable file once. Nothing writes to it until this settles, so
// the snapshot is the previous run's state, untouched by this one.
function storageInitFile(onReady) {
  if (!storageHasFilesystem()) {
    storageReady = true;
    if (onReady) onReady(null);
    return;
  }

  function settle(parsed) {
    storageFileSnapshot = parsed || {};
    storageFsCache = {};
    for (var key in storageFileSnapshot) {
      if (storageFileSnapshot.hasOwnProperty(key)) storageFsCache[key] = storageFileSnapshot[key];
    }
    // Writes made while the file was resolving win over the file: they are
    // this run's intent. The one exception is handled by the caller, which
    // decides whether a start-up default should lose to a restored value.
    for (var pending in storagePending) {
      if (storagePending.hasOwnProperty(pending)) storageFsCache[pending] = storagePending[pending];
    }
    storagePending = {};
    storageReady = true;
    storageFlushFile();
    if (onReady) onReady(parsed);
  }

  try {
    tizen.filesystem.resolve('wgt-private', function (dir) {
      storageFsDir = dir;
      var file = null;
      try { file = dir.resolve(STORAGE_FILE); } catch (e) {}
      if (!file) {
        settle(null);
        return;
      }
      file.readAsText(function (text) {
        var parsed = null;
        try { parsed = JSON.parse(text); } catch (e) {}
        settle(parsed);
      }, function () {
        settle(null);
      }, 'UTF-8');
    }, function () {
      storageReady = true;
      if (onReady) onReady(null);
    }, 'rw');
  } catch (e) {
    storageReady = true;
    if (onReady) onReady(null);
  }
}

function storageGet(key) {
  var fromPreference = storagePreferenceGet(key);
  if (fromPreference !== null) {
    return fromPreference;
  }
  if (storageReady && storageFsCache.hasOwnProperty(key)) return storageFsCache[key];
  if (storagePending.hasOwnProperty(key)) return storagePending[key];
  return storageLocalGet(key);
}

function storageSet(key, value) {
  var text = String(value);
  var stored = false;

  if (storagePreferenceSet(key, text)) {
    stored = true;
  }
  if (storageFileSet(key, text)) {
    stored = true;
  }
  if (storageLocalSet(key, text)) stored = true;
  return stored;
}
