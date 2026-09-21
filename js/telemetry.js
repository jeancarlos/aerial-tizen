var TELEMETRY_FLUSH_MS = 10000;
var TELEMETRY_MAX_QUEUE = 50;

var telemetryConfig = (typeof AERIAL_TELEMETRY !== 'undefined') ? AERIAL_TELEMETRY : null;
var telemetryQueue = [];
var telemetryTimer = null;
var telemetryStarted = Date.now();
var telemetryLog = [];
var TELEMETRY_LOG_MAX = 14;

function telemetryRecent(count) {
  return telemetryLog.slice(-count);
}

function telemetryRender() {
  var view = document.getElementById('logview');
  if (!view || !view.classList.contains('visible')) return;
  view.textContent = telemetryLog.join('\n');
}

function telemetryToggleLog() {
  var view = document.getElementById('logview');
  if (!view) return;
  view.classList.toggle('visible');
  telemetryRender();
}

function telemetryEnabled() {
  return !!(telemetryConfig && telemetryConfig.clientToken);
}

function telemetryIntakeUrl() {
  var site = telemetryConfig.site || 'datadoghq.com';
  var host = site === 'datadoghq.com' ? 'browser-intake-datadoghq.com' : 'browser-intake-' + site;
  return 'https://' + host + '/api/v2/logs' +
    '?dd-api-key=' + encodeURIComponent(telemetryConfig.clientToken) +
    '&dd-evp-origin=tizen' +
    '&ddsource=browser';
}

function telemetrySend(batch) {
  var body = JSON.stringify(batch);
  var url = telemetryIntakeUrl();
  try {
    if (navigator.sendBeacon && navigator.sendBeacon(url, body)) return;
  } catch (e) {}
  try {
    var xhr = new XMLHttpRequest();
    xhr.open('POST', url, true);
    xhr.setRequestHeader('Content-Type', 'text/plain');
    xhr.send(body);
  } catch (e) {}
}

function telemetryFlush() {
  if (telemetryTimer) {
    clearTimeout(telemetryTimer);
    telemetryTimer = null;
  }
  if (!telemetryQueue.length || !telemetryEnabled()) return;
  var batch = telemetryQueue.splice(0, telemetryQueue.length);
  telemetrySend(batch);
}

function telemetryProbe() {
  var base = (typeof AERIAL_PROBE_URL !== 'undefined') ? AERIAL_PROBE_URL : '';
  if (!base) return;
  // An <img> request needs no CORS grant and no XHR, so this reaches a plain
  // file server and lands in its access log even when it 404s.
  var url = base + '/aerial-probe.gif?t=' + Date.now();
  try {
    new Image().src = url;
  } catch (e) {}
  console.warn('[telemetry] probe sent to', url);
}

function telemetry(event, fields) {
  var payload = {
    ddsource: 'tizen',
    service: (telemetryConfig && telemetryConfig.service) || 'aerial-tizen',
    ddtags: 'env:' + ((telemetryConfig && telemetryConfig.env) || 'tv'),
    message: event,
    event: event,
    uptime_ms: Date.now() - telemetryStarted
  };
  for (var key in fields) {
    if (fields.hasOwnProperty(key)) payload[key] = fields[key];
  }

  var line = Math.round((Date.now() - telemetryStarted) / 1000) + 's ' + event;
  for (var f in fields) {
    if (fields.hasOwnProperty(f)) line += ' ' + f + '=' + String(fields[f]).slice(-42);
  }
  telemetryLog.push(line);
  if (telemetryLog.length > TELEMETRY_LOG_MAX) telemetryLog.shift();
  if (typeof debugRender === 'function') debugRender();
  else telemetryRender();

  if (event === 'avplay_failure' || event === 'watchdog_timeout') {
    payload.status = 'error';
    console.warn('[telemetry]', event, JSON.stringify(fields || {}));
  }

  if (!telemetryEnabled()) return;

  telemetryQueue.push(payload);
  if (telemetryQueue.length >= TELEMETRY_MAX_QUEUE) {
    telemetryFlush();
    return;
  }
  if (!telemetryTimer) {
    telemetryTimer = setTimeout(telemetryFlush, TELEMETRY_FLUSH_MS);
  }
}
