var BASE = 'http://sylvan.apple.com/Aerials/2x/Videos/';

var VIDEOS = [
  BASE + 'AK_A004_C012_SDR_20191217_SDR_4K_HEVC.mov',
  BASE + 'BO_A012_C031_SDR_20190726_SDR_4K_HEVC.mov',
  BASE + 'BO_A014_C008_SDR_20190719_SDR_4K_HEVC.mov',
  BASE + 'BO_A014_C023_SDR_20190717_F240F3709_SDR_4K_HEVC.mov',
  BASE + 'BO_A018_C029_SDR_20190812_SDR_4K_HEVC.mov',
  BASE + 'comp_1223LV_FLARE_v21_SDR_PS_FINAL_20180709_F0F5700_SDR_4K_HEVC.mov',
  BASE + 'comp_A001_C004_1207W5_v23_SDR_FINAL_20180706_SDR_4K_HEVC.mov',
  BASE + 'comp_A006_C003_1219EE_CC_v01_SDR_PS_FINAL_20180709_SDR_4K_HEVC.mov',
  BASE + 'comp_A009_C001_010181A_v09_SDR_PS_FINAL_20180725_SDR_4K_HEVC.mov',
  BASE + 'comp_A012_C014_1223PT_v53_SDR_PS_FINAL_20180709_F0F8700_SDR_4K_HEVC.mov',
  BASE + 'comp_A103_C002_0205DG_v12_SDR_FINAL_20180706_SDR_4K_HEVC.mov',
  BASE + 'comp_GMT110_112NC_364D_1054_AURORA_ANTARTICA__COMP_FINAL_v34_PS_SDR_20181107_SDR_4K_HEVC.mov',
  BASE + 'comp_GMT306_139NC_139J_3066_CALI_TO_VEGAS_v07_SDR_FINAL_22062018_SDR_4K_HEVC.mov',
  BASE + 'comp_GMT307_136NC_134K_8277_NY_NIGHT_01_v25_SDR_PS_20180907_SDR_4K_HEVC.mov',
  BASE + 'comp_GMT308_139K_142NC_CARIBBEAN_DAY_v09_SDR_FINAL_22062018_SDR_4K_HEVC.mov',
  BASE + 'comp_GMT314_139M_170NC_NORTH_AMERICA_AURORA__COMP_v22_SDR_20181206_v12CC_SDR_4K_HEVC.mov',
  BASE + 'CR_A009_C007_SDR_20191113_SDR_4K_HEVC.mov',
  BASE + 'DB_D001_C001_4K_SDR_HEVC.mov',
  BASE + 'DB_D001_C005_4K_SDR_HEVC.mov',
  BASE + 'DB_D002_C003_4K_SDR_HEVC.mov',
  BASE + 'DL_B002_C011_SDR_20191122_SDR_4K_HEVC.mov',
  BASE + 'g201_AK_A003_C014_SDR_20191113_SDR_4K_HEVC.mov',
  BASE + 'g201_CA_A016_C002_SDR_20191114_SDR_4K_HEVC.mov',
  BASE + 'GL_G002_C002_4K_SDR_HEVC.mov',
  BASE + 'GL_G004_C010_4K_SDR_HEVC.mov',
  BASE + 'HK_H004_C001_4K_SDR_HEVC.mov',
  BASE + 'LA_A005_C009_4K_SDR_HEVC.mov',
  BASE + 'LA_A006_C008_4K_SDR_HEVC.mov',
  BASE + 'PA_A001_C007_SDR_20190717_SDR_4K_HEVC.mov',
  BASE + 'SE_A016_C009_SDR_20190717_SDR_4K_HEVC.mov'
];

var videoIndex = -1;
var loader = document.getElementById('loader');
var fade = document.getElementById('fade');
var avplay = webapis.avplay;

var listener = {
  onbufferingstart: function () {},
  onbufferingprogress: function () {},
  onbufferingcomplete: function () {
    loader.classList.add('hidden');
  },
  onstreamcompleted: function () {
    stopAndClose();
    playVideo(pickRandom());
  },
  oncurrentplaytime: function () {},
  onevent: function () {},
  onerror: function () {
    stopAndClose();
    setTimeout(function () {
      playVideo(pickRandom());
    }, 2000);
  }
};

function stopAndClose() {
  try { avplay.stop(); } catch (e) {}
  try { avplay.close(); } catch (e) {}
}

function pickRandom() {
  var next;
  do {
    next = Math.floor(Math.random() * VIDEOS.length);
  } while (next === videoIndex && VIDEOS.length > 1);
  return next;
}

var firstPlay = true;

function startVideo(index) {
  videoIndex = index;
  try { localStorage.setItem('aerial_index', videoIndex); } catch (e) {}

  stopAndClose();

  try {
    avplay.open(VIDEOS[videoIndex]);
    avplay.setDisplayRect(0, 0, 1920, 1080);
    avplay.setListener(listener);
    avplay.prepareAsync(function () {
      avplay.play();
      loader.classList.add('hidden');
      setTimeout(function () { fade.classList.remove('active'); }, 100);
    }, function () {
      setTimeout(function () { playVideo(pickRandom()); }, 2000);
    });
  } catch (e) {
    setTimeout(function () { playVideo(pickRandom()); }, 2000);
  }
}

function playVideo(index) {
  if (firstPlay) {
    firstPlay = false;
    startVideo(index);
    return;
  }
  fade.classList.add('active');
  setTimeout(function () { startVideo(index); }, 1000);
}

// Remote control
try {
  tizen.tvinputdevice.registerKey('MediaPlayPause');
  tizen.tvinputdevice.registerKey('MediaPlay');
  tizen.tvinputdevice.registerKey('MediaPause');
  tizen.tvinputdevice.registerKey('MediaFastForward');
  tizen.tvinputdevice.registerKey('MediaStop');
  tizen.tvinputdevice.registerKey('ChannelUp');
  tizen.tvinputdevice.registerKey('ChannelDown');
} catch (e) {}

document.addEventListener('keydown', function (e) {
  switch (e.keyCode) {
    case 13:    // Enter
    case 10252: // PlayPause
      try {
        var state = avplay.getState();
        if (state === 'PLAYING') avplay.pause();
        else if (state === 'PAUSED') avplay.play();
      } catch (e) {}
      break;
    case 415:   // Play
      try { avplay.play(); } catch (e) {}
      break;
    case 19:    // Pause
      try { avplay.pause(); } catch (e) {}
      break;
    case 417:   // FastForward - next video
    case 39:    // Right arrow
    case 427:   // ChannelUp
    case 428:   // ChannelDown
      stopAndClose();
      playVideo(pickRandom());
      break;
    case 413:   // Stop
    case 10009: // Back
      stopAndClose();
      try { tizen.application.getCurrentApplication().exit(); } catch (e) {}
      break;
  }
});

// Start
var saved = -1;
try { saved = parseInt(localStorage.getItem('aerial_index'), 10); } catch (e) {}
playVideo(saved >= 0 && saved < VIDEOS.length ? saved : pickRandom());
