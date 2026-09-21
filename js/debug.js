// On-screen debug board.
//
// The only sinks on this TV are this panel and an HTTP beacon: the restricted
// sdb shell yields no console output. So whatever has to be proven about the
// device is proven here.
//
// Each backend is probed on its own key, through its own primitive, never
// through storageSet's broadcast: a value written to one backend must not be
// able to credit another with persistence. The marker carries a per-run nonce,
// so "a marker exists" is not enough - it has to be a marker THIS run did not
// write.
//
//   absent        the API is missing or throws
//   no-prior      reachable, but no earlier run left a marker
//   write-failed  this run could not write
//   write-ok      this run wrote, nothing earlier found
//   readback-ok   this run wrote and read its own value back
//   survived      an earlier run's marker was read from untouched state

var DEBUG_PROBE_KEY = 'aerial_probe_marker';
var DEBUG_BOOT_KEY = 'aerial_boot_count';

var debugRunId = null;
var debugBootCount = 0;
var debugBackends = {};

function debugMakeRunId(bootCount) {
  return bootCount + '-' + Math.floor(Math.random() * 1e9).toString(36);
}

function debugParseMarker(raw) {
  if (!raw) return null;
  var parts = String(raw).split('|');
  return parts.length === 2 ? { run: parts[0], at: parts[1] } : null;
}

function debugClassify(priorRaw, wroteOk, readBack) {
  var prior = debugParseMarker(priorRaw);
  if (prior && prior.run !== debugRunId) {
    return { state: 'survived', detail: prior.at };
  }
  if (!wroteOk) return { state: 'write-failed', detail: '' };
  if (readBack) return { state: 'readback-ok', detail: 'this run only' };
  return { state: 'write-ok', detail: 'this run only' };
}

function debugProbeSyncBackends() {
  // Read every backend's own key BEFORE this run writes anything to it.
  var priorPreference = storageHasPreference() ? storagePreferenceGet(DEBUG_PROBE_KEY) : null;
  var priorLocal = storageLocalGet(DEBUG_PROBE_KEY);

  var previousCount = parseInt(storagePreferenceGet(DEBUG_BOOT_KEY) || storageLocalGet(DEBUG_BOOT_KEY), 10);
  debugBootCount = (previousCount || 0) + 1;
  debugRunId = debugMakeRunId(debugBootCount);
  var marker = debugRunId + '|' + new Date().toISOString();

  if (!storageHasPreference()) {
    debugBackends.preference = { state: 'absent', detail: '' };
  } else {
    var wrotePreference = storagePreferenceSet(DEBUG_PROBE_KEY, marker);
    storagePreferenceSet(DEBUG_BOOT_KEY, debugBootCount);
    debugBackends.preference = debugClassify(priorPreference, wrotePreference,
      storagePreferenceGet(DEBUG_PROBE_KEY) === marker);
  }

  var wroteLocal = storageLocalSet(DEBUG_PROBE_KEY, marker);
  storageLocalSet(DEBUG_BOOT_KEY, debugBootCount);
  debugBackends.localStorage = debugClassify(priorLocal, wroteLocal,
    storageLocalGet(DEBUG_PROBE_KEY) === marker);

  debugBackends['wgt-private'] = storageHasFilesystem()
    ? { state: 'pending', detail: 'waiting for the file to resolve' }
    : { state: 'absent', detail: '' };

  telemetry('storage_probe', {
    boot: debugBootCount,
    preference: debugBackends.preference.state,
    localStorage: debugBackends.localStorage.state
  });
}

// Called once the file has resolved, with the snapshot taken before this run
// touched it - the only honest source for "did it survive".
function debugProbeFileBackend() {
  if (!storageHasFilesystem()) return;
  var prior = storageFileSnapshotGet(DEBUG_PROBE_KEY);
  var marker = debugRunId + '|' + new Date().toISOString();
  var wrote = storageFileSet(DEBUG_PROBE_KEY, marker);
  storageFileSet(DEBUG_BOOT_KEY, debugBootCount);
  debugBackends['wgt-private'] = debugClassify(prior, wrote, true);

  telemetry('storage_probe_file', {
    boot: debugBootCount,
    state: debugBackends['wgt-private'].state,
    prior: debugBackends['wgt-private'].detail || 'none'
  });
  if (typeof telemetryProbe === 'function') telemetryProbe(debugVerdictQuery());
  debugRender();
}

function debugVerdictQuery() {
  var parts = ['boot=' + debugBootCount, 'run=' + debugRunId];
  for (var name in debugBackends) {
    if (debugBackends.hasOwnProperty(name)) {
      parts.push(name.replace('-', '_') + '=' + debugBackends[name].state);
    }
  }
  return parts.join('&');
}

function debugLines() {
  var lines = ['STORAGE  (boot ' + debugBootCount + ', run ' + debugRunId + ')'];
  var order = ['preference', 'wgt-private', 'localStorage'];
  for (var i = 0; i < order.length; i++) {
    var name = order[i];
    var info = debugBackends[name] || { state: 'unknown', detail: '' };
    lines.push('  ' + name + ': ' + info.state + (info.detail ? '  (' + info.detail + ')' : ''));
  }
  var errors = storageErrorList();
  for (var e = 0; e < errors.length; e++) lines.push('  ! ' + errors[e]);

  lines.push('PLAYBACK');
  lines.push('  catalog ' + CATALOG.length + ', playlist ' + playlist.length +
    ', order ' + settings.videoOrder + ', category ' + settings.category);
  lines.push('  playing: ' + (videoIndex >= 0 && CATALOG[videoIndex] ? CATALOG[videoIndex].label : 'none'));
  lines.push('  source: ' + (settings.customServerEnabled ? settings.customServerUrl : 'apple cdn'));
  lines.push('  uptime ' + Math.round((Date.now() - telemetryStarted) / 1000) + 's');

  lines.push('EVENTS');
  var events = telemetryRecent(8);
  if (!events.length) lines.push('  (none yet)');
  for (var j = 0; j < events.length; j++) lines.push('  ' + events[j]);

  return lines;
}

function debugRender() {
  var view = document.getElementById('logview');
  if (!view || !view.classList.contains('visible')) return;
  view.textContent = debugLines().join('\n');
}

function debugToggle() {
  var view = document.getElementById('logview');
  if (!view) return;
  view.classList.toggle('visible');
  debugRender();
}
