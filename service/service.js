var APP_ID = 'AerialScr0.AerialScreensaver';

function launchApp() {
  tizen.application.launch(APP_ID, function () {
    console.log('[AerialService] App launched');
  }, function (err) {
    console.error('[AerialService] Launch failed: ' + err.message);
    setTimeout(launchApp, 5000);
  });
}

// Wait a few seconds for the system to settle after boot
setTimeout(launchApp, 3000);
