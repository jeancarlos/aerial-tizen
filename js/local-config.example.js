// Copy to js/local-config.js (gitignored) and fill in.
// deploy.sh packages local-config.js when it exists; without it the app uses
// the public defaults and sends no telemetry.
var AERIAL_LOCAL_SERVER = 'http://192.168.0.100:8090';
var AERIAL_TELEMETRY = {
  clientToken: '',              // Datadog client token (write-only, safe in a page)
  site: 'datadoghq.com',        // datadoghq.eu, us5.datadoghq.com, ...
  service: 'aerial-tizen',
  env: 'tv'
};
