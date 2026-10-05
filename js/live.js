/* live.js — Live mode UI: Demo/Live switch, live view, live settings,
 * helper installer card. Real tracking stays in the main process; here only
 * renders what the tracker emits (titles already stripped when off). */
var Live = (function () {
  'use strict';

  var LS_KEY = 'retoma-settings-v1';

  var state = {
    mode: 'demo',
    liveStatus: 'waiting',
    storeTitles: false,
    awayAfterMin: 5,
    blocklist: [],
    paused: false,
    liveApp: '',
    liveTitle: '',
    liveMinutes: 0,
    recentApps: [],
    tickTimer: null
  };

  var el = {};

  function hasBridge() {
    return !!(window.retoma && window.retoma.loadSettings);
  }

  function readLocal() {
    try {
      var raw = window.localStorage.getItem(LS_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) { return {}; }
  }

  function writeLocal(patch) {
    try {
      var cur = readLocal();
      Object.keys(patch || {}).forEach(function (k) { cur[k] = patch[k]; });
      window.localStorage.setItem(LS_KEY, JSON.stringify(cur));
    } catch (e) { /* private mode: session only */ }
  }

  function loadSettings() {
    if (hasBridge()) return window.retoma.loadSettings();
    return Promise.resolve(Object.assign(
      { mode: 'demo', storeTitles: false, awayAfterMin: 5, blocklist: [], paused: false },
      readLocal()
    ));
  }

  function saveSettings(patch) {
    Object.keys(patch || {}).forEach(function (k) { state[k] = patch[k]; });
    writeLocal(patch);
    if (hasBridge()) {
      return window.retoma.saveSettings(patch).then(function (next) {
        if (next) applySettings(next);
        return next;
      }, function () { return null; });
    }
    applySettings(state);
    return Promise.resolve(state);
  }

  function applySettings(next) {
    if (!next) return;
    state.mode = next.mode === 'live' ? 'live' : 'demo';
    state.storeTitles = !!next.storeTitles;
    state.awayAfterMin = Number(next.awayAfterMin) || 5;
    state.blocklist = Array.isArray(next.blocklist) ? next.blocklist.slice() : [];
    state.paused = !!next.paused;
    paintMode();
    paintLiveSettings();
    updateTexts();
    renderLiveNow();
    renderLiveToday();
    syncPause();
  }

  function isLive() { return state.mode === 'live'; }
  function titlesOn() { return state.storeTitles; }

  /* --- mode switch ---------------------------------------------------- */

  function paintMode() {
    document.body.classList.toggle('is-live', isLive());
    var btns = document.querySelectorAll('[data-mode]');
    for (var i = 0; i < btns.length; i++) {
      var on = btns[i].getAttribute('data-mode') === state.mode;
      btns[i].classList.toggle('is-active', on);
      btns[i].setAttribute('aria-pressed', String(on));
    }
    if (el.liveView) {
      el.liveView.classList.toggle('is-hidden', !isLive());
      if (isLive()) el.liveView.removeAttribute('inert');
      else el.liveView.setAttribute('inert', '');
    }
    /* Demo windows leave the layout AND the a11y tree in Live (not faded). */
    var wins = document.querySelectorAll('.window');
    for (var w = 0; w < wins.length; w++) {
      if (isLive()) {
        wins[w].setAttribute('inert', '');
        wins[w].setAttribute('aria-hidden', 'true');
      } else {
        wins[w].removeAttribute('inert');
        wins[w].removeAttribute('aria-hidden');
      }
    }
    if (el.hint) el.hint.textContent = isLive() ? 'Live — tracking this PC' : 'Simulation — drag focus between windows';
    var simBtns = document.querySelectorAll('.sim-panel .btn');
    for (var j = 0; j < simBtns.length; j++) {
      simBtns[j].disabled = isLive();
      if (isLive()) simBtns[j].title = 'Disabled in Live mode';
      else simBtns[j].removeAttribute('title');
    }
    placeModeInk();
  }

  function setMode(mode) {
    if (mode !== 'demo' && mode !== 'live') return;
    if (mode === state.mode) {
      if (window.Retoma && Retoma.reloadForMode) Retoma.reloadForMode(mode);
      return;
    }
    saveSettings({ mode: mode }).then(function () {
      if (window.Retoma && Retoma.reloadForMode) {
        try {
          var r = Retoma.reloadForMode(mode);
          if (r && r.then) {
            r.then(function () {
              if (mode === 'live' && hasBridge()) {
                try { window.retoma.liveReady(); } catch (e) { /* main starts playback */ }
              }
            });
            return;
          }
        } catch (e) { /* fall through */ }
      }
      if (mode === 'live' && hasBridge()) {
        try { window.retoma.liveReady(); } catch (e) { /* main starts playback */ }
      }
    });
  }

  function placeModeInk() {
    var groups = document.querySelectorAll('.mode-switch');
    for (var g = 0; g < groups.length; g++) {
      var ink = groups[g].querySelector('.mode-switch__ink');
      var active = groups[g].querySelector('.mode-switch__btn.is-active');
      if (!ink || !active) continue;
      ink.style.opacity = '1';
      ink.style.width = active.offsetWidth + 'px';
      ink.style.transform = 'translateX(' + active.offsetLeft + 'px)';
    }
  }

  /* --- live view ------------------------------------------------------ */

  function startLiveTick() {
    if (state.tickTimer) return;
    state.tickTimer = setInterval(function () {
      if (!isLive() || state.paused) return;
      if (window.Retoma && Retoma.state.away) return;
      state.liveMinutes += 1;
      renderLiveNow();
    }, 60000);
  }

  function liveNowText() {
    /* No live events yet: never name the demo's windows. */
    if (!state.liveApp) return 'Now: waiting for activity';
    var mins = state.liveMinutes + ' min';
    if (state.storeTitles && state.liveTitle) return 'Now: ' + state.liveApp + ' · ' + state.liveTitle + ' · ' + mins;
    return 'Now: ' + state.liveApp + ' · ' + mins;
  }

  function renderLiveNow() {
    if (el.liveNow) el.liveNow.textContent = liveNowText();
  }

  function mergedToday() {
    /* Live reads ONLY live events: the demo seed never appears here. */
    var data = (window.Retoma && Retoma.state.liveTimeline) || [];
    var merged = {};
    var order = [];
    data.forEach(function (e) {
      if (!merged[e.app]) { merged[e.app] = 0; order.push(e.app); }
      merged[e.app] += e.duration;
    });
    return order.map(function (app) { return { app: app, duration: merged[app] }; });
  }

  function renderLiveToday() {
    var rows = mergedToday();
    if (el.liveToday) {
      el.liveToday.textContent = rows.length
        ? 'Today: ' + rows.map(function (r) { return r.app + ' ' + r.duration + ' min'; }).join(' · ')
        : 'Nothing tracked yet';
    }
    if (el.liveBar) {
      if (!rows.length) {
        el.liveBar.innerHTML = '';
        el.liveBar.style.display = 'none';
        return;
      }
      el.liveBar.style.display = '';
      var total = rows.reduce(function (s, r) { return s + r.duration; }, 0) || 1;
      var colors = ['var(--seg-1)', 'var(--seg-2)', 'var(--seg-3)', 'var(--seg-4)', 'var(--seg-5)'];
      el.liveBar.innerHTML = rows.map(function (r, i) {
        var w = (r.duration / total * 100).toFixed(1);
        return '<div class="live-bar__seg" style="width:' + w + '%;--i:' + i + ';background:' + colors[i % colors.length] + '"></div>';
      }).join('');
    }
  }

  function trackRecent(app) {
    if (!app) return;
    state.recentApps = [app].concat(state.recentApps.filter(function (a) { return a !== app; })).slice(0, 5);
  }

  function onLiveEvent(evt) {
    if (!evt || !window.Retoma) return;
    if (evt.type === 'app:switch' && evt.app) {
      state.liveApp = evt.app.label || 'Unknown';
      state.liveTitle = evt.app.title || '';
      state.liveMinutes = 0;
      trackRecent(state.liveApp);
      Retoma.state.currentApp = state.liveApp;
      Retoma.state.currentTitle = state.liveTitle;
      Retoma.state.timeInCurrent = 0;
      Retoma.renderAhora && Retoma.renderAhora();
      renderLiveNow();
    } else if (evt.type === 'episode' && evt.entry) {
      /* Live episodes land ONLY in the live history; demo stays untouched. */
      if (Retoma.state.liveEmpty) {
        Retoma.state.liveEmpty = false;
        Retoma.state.liveTimeline = [];
      }
      Retoma.state.liveTimeline.push({ app: evt.entry.app, duration: evt.entry.duration });
      if (Retoma.state.liveTimeline.length > 12) Retoma.state.liveTimeline.shift();
      try {
        if (window.Persist && Persist.save) Persist.save(Retoma.state.liveTimeline, 'live');
      } catch (e) { /* demo keeps going */ }
      Retoma.renderTimeline();
      renderLiveToday();
    } else if (evt.type === 'away') {
      Retoma.state.away = true;
      Retoma.state.awayMinutes = 0;
      Retoma.renderAhora && Retoma.renderAhora();
    } else if (evt.type === 'return') {
      Retoma.state.away = false;
      showLiveResume({ app: evt.app || state.liveApp || 'Unknown', awayMinutes: evt.awayMinutes || 1 });
    }
  }

  function showLiveResume(info) {
    if (!window.Retoma) return;
    Retoma.state.prevApp = info.app;
    Retoma.state.prevTitle = state.storeTitles && state.liveTitle ? state.liveTitle : '';
    Retoma.state.prevWindows = state.recentApps.slice(0, 3);
    if (!Retoma.state.prevWindows.length) Retoma.state.prevWindows = [info.app];
    Retoma.state.awayMinutes = info.awayMinutes;
    Retoma.showResume();
    Retoma.openPanel();
    Retoma.switchTab('ahora');
    // The main process fires the native notification on return.
  }

  /* --- status chip + helper card -------------------------------------- */

  var STATUS_TEXT = {
    ready: 'Tracking this PC',
    'extension-missing': 'Waiting for helper',
    error: 'Waiting for helper',
    paused: 'Paused'
  };

  function onLiveStatus(status) {
    state.liveStatus = status || 'waiting';
    if (state.paused) state.liveStatus = 'paused';
    paintStatus();
  }

  function paintStatus() {
    var s = state.paused ? 'paused' : state.liveStatus;
    if (el.liveStatus) {
      el.liveStatus.setAttribute('data-status', s === 'ready' ? 'ready' : (s === 'paused' ? 'paused' : 'waiting'));
      if (el.liveStatusText) el.liveStatusText.textContent = s === 'paused' ? STATUS_TEXT.paused : (STATUS_TEXT[s] || STATUS_TEXT.error);
    }
    if (el.helperCard) {
      var missing = !state.paused && (state.liveStatus === 'extension-missing' || state.liveStatus === 'error');
      el.helperCard.classList.toggle('is-hidden', !missing);
    }
  }

  function refreshStatus() {
    if (hasBridge()) {
      window.retoma.liveStatus().then(function (s) { onLiveStatus(s); }, function () { /* card keeps last state */ });
    }
  }

  function installHelper() {
    if (!hasBridge()) return Promise.resolve(null);
    return window.retoma.helperInstall({}).then(function (res) {
      if (res && res.copied) {
        note('Helper installed. Log out and back in, then press Check again.');
      } else {
        note('Install cancelled. Nothing was copied.');
      }
      return res;
    });
  }

  function checkHelper() {
    if (!hasBridge()) return Promise.resolve(null);
    return window.retoma.helperCheck().then(function (res) {
      if (!res) return res;
      onLiveStatus(res.status);
      /* The enable command is visible and copyable from the start. */
      if (el.enableCmd) el.enableCmd.classList.remove('is-hidden');
      if (el.enableCopy) el.enableCopy.classList.remove('is-hidden');
      if (res.status === 'ready') {
        note('Helper is on. Tracking this PC.');
      } else if (res.installed) {
        note('Helper files are here but off. Run the command, then press Check again.');
      } else {
        note('Helper not found yet. Press Install helper first.');
      }
      return res;
    });
  }

  function note(text) {
    if (el.helperNote) {
      el.helperNote.textContent = text;
      el.helperNote.classList.remove('is-hidden');
    }
  }

  function copyEnable() {
    if (!el.enableCmd) return;
    var text = el.enableCmd.textContent.trim();
    function done() { note('Command copied. Paste it in a terminal.'); }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text); done(); });
    } else {
      fallbackCopy(text);
      done();
    }
  }

  function fallbackCopy(text) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    } catch (e) { /* clipboard stays manual */ }
  }

  /* --- privacy texts: always true per mode ----------------------------- */

  function updateTexts() {
    var see = el.privacySee;
    var never = el.privacyNever;
    if (see) {
      var items;
      if (!isLive()) items = ['App name and window title', 'How much time'];
      else if (state.storeTitles) items = ['App name', 'Window title (60 chars)', 'How much time'];
      else items = ['App name only', 'How much time'];
      see.innerHTML = items.map(function (t) { return '<li>' + t + '</li>'; }).join('');
    }
    if (never) {
      var blocks = ['What you type', 'Screen content', 'Your camera', 'Your microphone'];
      if (isLive() && !state.storeTitles) blocks.unshift('Window titles (off)');
      never.innerHTML = blocks.map(function (t) { return '<li>' + t + '</li>'; }).join('');
    }
    if (el.modeNote) {
      el.modeNote.textContent = !isLive()
        ? 'Demo mode: tracks the windows inside this demo'
        : (state.storeTitles
          ? 'Live mode: tracks apps on this PC, titles on.'
          : 'Live mode: tracks apps on this PC. App names only.');
    }
  }

  /* --- live settings --------------------------------------------------- */

  function paintLiveSettings() {
    var awayBtns = document.querySelectorAll('[data-away]');
    for (var i = 0; i < awayBtns.length; i++) {
      var on = Number(awayBtns[i].getAttribute('data-away')) === state.awayAfterMin;
      awayBtns[i].classList.toggle('is-active', on);
    }
    if (el.titlesToggle) el.titlesToggle.checked = state.storeTitles;
    renderBlocklist();
    syncPause();
  }

  function renderBlocklist() {
    if (!el.blockList) return;
    el.blockList.innerHTML = '';
    state.blocklist.forEach(function (name) {
      var li = document.createElement('li');
      li.className = 'blocklist__item';
      var span = document.createElement('span');
      span.textContent = name;
      var rm = document.createElement('button');
      rm.className = 'blocklist__remove';
      rm.textContent = 'Remove';
      rm.setAttribute('aria-label', 'Unblock ' + name);
      rm.addEventListener('click', function () {
        var next = state.blocklist.filter(function (b) { return b !== name; });
        saveSettings({ blocklist: next });
      });
      li.appendChild(span);
      li.appendChild(rm);
      el.blockList.appendChild(li);
    });
  }

  function syncPause() {
    var p = state.paused || (window.Retoma && Retoma.isPaused && Retoma.isPaused());
    state.paused = !!p;
    if (el.livePause) el.livePause.textContent = state.paused ? 'Resume tracking' : 'Pause tracking';
    paintStatus();
  }

  function togglePause() {
    var target = !state.paused;
    if (window.Retoma && Retoma.togglePause) {
      if (Retoma.isPaused() !== target) Retoma.togglePause();
      else if (window.retoma && window.retoma.setPaused) {
        try { window.retoma.setPaused(target); } catch (e) { /* demo keeps going */ }
      }
    }
    saveSettings({ paused: target });
  }

  function mount() {
    el.liveView = document.getElementById('liveView');
    el.liveNow = document.getElementById('liveNow');
    el.liveToday = document.getElementById('liveToday');
    el.liveBar = document.getElementById('liveBar');
    el.liveStatus = document.getElementById('liveStatus');
    el.liveStatusText = document.getElementById('liveStatusText');
    el.helperCard = document.getElementById('helperCard');
    el.helperInstall = document.getElementById('helperInstall');
    el.helperCheck = document.getElementById('helperCheck');
    el.helperNote = document.getElementById('helperNote');
    el.enableCmd = document.getElementById('enableCmd');
    el.enableCopy = document.getElementById('enableCopy');
    el.hint = document.getElementById('desktopHint');
    el.privacySee = document.getElementById('privacySee');
    el.privacyNever = document.getElementById('privacyNever');
    el.modeNote = document.getElementById('modeNote');
    el.titlesToggle = document.getElementById('titlesToggle');
    el.blockList = document.getElementById('blockList');
    el.blockInput = document.getElementById('blockInput');
    el.blockAdd = document.getElementById('blockAdd');
    el.livePause = document.getElementById('livePause');

    var modeBtns = document.querySelectorAll('[data-mode]');
    for (var i = 0; i < modeBtns.length; i++) {
      modeBtns[i].addEventListener('click', function () { setMode(this.getAttribute('data-mode')); });
    }
    var awayBtns = document.querySelectorAll('[data-away]');
    for (var j = 0; j < awayBtns.length; j++) {
      awayBtns[j].addEventListener('click', function () {
        saveSettings({ awayAfterMin: Number(this.getAttribute('data-away')) });
      });
    }
    if (el.titlesToggle) {
      el.titlesToggle.addEventListener('change', function () {
        saveSettings({ storeTitles: el.titlesToggle.checked });
      });
    }
    function addBlock() {
      if (!el.blockInput) return;
      var name = el.blockInput.value.trim();
      if (!name) return;
      if (state.blocklist.indexOf(name) === -1) {
        saveSettings({ blocklist: state.blocklist.concat([name]) });
      }
      el.blockInput.value = '';
    }
    if (el.blockAdd) el.blockAdd.addEventListener('click', addBlock);
    if (el.blockInput) {
      el.blockInput.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter') addBlock();
      });
    }
    if (el.livePause) el.livePause.addEventListener('click', togglePause);
    if (el.helperInstall) el.helperInstall.addEventListener('click', installHelper);
    if (el.helperCheck) el.helperCheck.addEventListener('click', checkHelper);
    if (el.enableCopy) el.enableCopy.addEventListener('click', copyEnable);

    if (window.Events && Events.on) {
      Events.on('retoma:pause', function () { syncPause(); });
    }
    if (hasBridge()) {
      window.retoma.onLiveEvent(onLiveEvent);
      window.retoma.onLiveStatus(onLiveStatus);
      if (window.retoma.onSettings) window.retoma.onSettings(function (next) { applySettings(next); });
    }
    window.addEventListener('resize', placeModeInk);

    loadSettings().then(function (next) {
      applySettings(next || {});
      /* Starting in Live: show ONLY the live store, never the demo seed. */
      if (window.Retoma && Retoma.reloadForMode && state.mode === 'live') {
        try { Retoma.reloadForMode('live'); } catch (e) { /* demo keeps going */ }
      }
      refreshStatus();
      renderLiveNow();
      renderLiveToday();
      if (window.Retoma && Retoma.isPaused && Retoma.isPaused() !== state.paused && state.paused) {
        Retoma.togglePause();
      }
      if (hasBridge()) {
        try { window.retoma.liveReady(); } catch (e) { /* playback starts on demand */ }
      }
      setTimeout(placeModeInk, 60);
    });
    startLiveTick();
  }

  return {
    mount: mount,
    isLive: isLive,
    titlesOn: titlesOn,
    setMode: setMode,
    getMode: function () { return state.mode; },
    saveSettings: saveSettings,
    showLiveResume: showLiveResume,
    syncPause: syncPause,
    renderLiveNow: renderLiveNow,
    renderLiveToday: renderLiveToday,
    state: state
  };
})();
