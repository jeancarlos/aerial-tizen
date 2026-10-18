// SPDX-FileCopyrightText: 2026 Jean
// SPDX-License-Identifier: MIT
var STILL_CLIP_MS = 8000;

function simUseStills(protocol, search, proxy) {
  return (protocol === 'https:' && !proxy) || /[?&]stills\b/.test(search);
}

function simBrowserUrl(url, protocol, proxy) {
  return simProxyUrl((typeof H264_MAP !== 'undefined' && H264_MAP[url]) || url, protocol === 'https:' ? proxy : '');
}

function simCreateAvplay(video, still, useStills, urlFor) {
  var listener = {};
  var clip = null;
  var buffered = false;
  var state = 'NONE';

  function emit(name, arg) {
    if (listener[name]) listener[name](arg);
  }

  video.addEventListener('waiting', function () { emit('onbufferingstart'); });
  video.addEventListener('playing', function () { emit('onbufferingcomplete'); });
  video.addEventListener('ended', function () { emit('onstreamcompleted'); });
  video.addEventListener('error', function () { emit('onerror'); });
  video.addEventListener('timeupdate', function () { emit('oncurrentplaytime', video.currentTime * 1000); });

  var common = {
    setDisplayRect: function () {},
    setStreamingProperty: function () {},
    setListener: function (l) { listener = l; },
    getState: function () { return state; }
  };

  var videoPlayer = {
    open: function (url) {
      video.src = urlFor(url) + '#t=1';
      state = 'IDLE';
    },
    prepareAsync: function (onSuccess, onError) {
      video.oncanplay = function () {
        video.oncanplay = null;
        state = 'READY';
        if (onSuccess) onSuccess();
      };
      video.onerror = function () {
        video.onerror = null;
        if (onError) onError();
      };
      video.load();
    },
    play: function () {
      video.play().catch(function (e) {
        if (e.name !== 'AbortError') emit('onerror');
      });
      state = 'PLAYING';
    },
    pause: function () {
      video.pause();
      state = 'PAUSED';
    },
    stop: function () {
      video.pause();
      video.removeAttribute('src');
      state = 'NONE';
    },
    close: function () { state = 'NONE'; }
  };

  var stillPlayer = {
    open: function (url) {
      still.src = getPreloadPath(url);
      buffered = false;
      state = 'IDLE';
    },
    prepareAsync: function (onSuccess, onError) {
      still.onload = function () {
        state = 'READY';
        if (onSuccess) onSuccess();
      };
      still.onerror = function () {
        if (onError) onError('no thumbnail for this video');
      };
      if (still.complete && still.naturalWidth) still.onload();
    },
    play: function () {
      state = 'PLAYING';
      if (!buffered) {
        buffered = true;
        emit('onbufferingcomplete');
      }
      // ponytail: resuming restarts the clip rather than keeping the time
      // left - a still has no playhead to resume from.
      clearTimeout(clip);
      clip = setTimeout(function () { emit('onstreamcompleted'); }, STILL_CLIP_MS);
    },
    pause: function () { clearTimeout(clip); state = 'PAUSED'; },
    stop: function () { clearTimeout(clip); state = 'NONE'; },
    close: function () { state = 'NONE'; }
  };

  var player = useStills ? stillPlayer : videoPlayer;
  Object.keys(common).forEach(function (name) { player[name] = common[name]; });
  return player;
}
