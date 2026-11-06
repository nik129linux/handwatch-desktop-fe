/* retoma.js — tracker logic, resume-card builder, timeline, AI proposals */
var Retoma = (function () {
  'use strict';

  var state = {
    currentApp: 'Document',
    currentTitle: 'Quality report (paragraph 3)',
    timeInCurrent: 0,
    paused: false,
    pausedUntil: 0,
    away: false,
    awayMinutes: 0,
    awayTimer: null,
    prevApp: null,
    prevTitle: null,
    prevWindows: [],
    interruptionApp: 'WhatsApp',
    timeline: [],
    empty: false,
    liveTimeline: [],
    liveEmpty: true,
    proposalDismissed: false,
    aiMode: 'off',
    aiConsent: { local: false, cloud: false, server: false },
    aiBusy: false,
    aiToken: 0,
    cloudAvailable: false,
    cloudReason: '',
    pendingMode: null
  };

  var el = {};
  var clockH = 9, clockM = 0;
  var tickTimer = null;
  var activeTab = 'ahora';
  var resumeAiToken = 0;

  function isLiveMode() {
    try {
      return !!(window.Live && Live.isLive && Live.isLive());
    } catch (e) { return false; }
  }

  function noteKey() {
    return 'retoma.note.' + (isLiveMode() ? 'live' : 'demo');
  }
  function loadNote() {
    try { return window.localStorage.getItem(noteKey()) || ''; } catch (e) { return ''; }
  }
  function saveNote(value) {
    try {
      var v = value == null ? '' : String(value);
      var key = noteKey();
      if (v.trim() === '') window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, v.trim());
    } catch (e) { /* noop */ }
  }
  function currentNote() {
    if (el.leaveNote) return String(el.leaveNote.value || '').trim();
    return String(loadNote() || '').trim();
  }
  function clearNote() {
    resumeAiToken++;
    if (el.leaveNote) el.leaveNote.value = '';
    try { window.localStorage.removeItem(noteKey()); } catch (e) { /* noop */ }
    if (el.resumeNote) { el.resumeNote.textContent = ''; el.resumeNote.classList.add('is-hidden'); }
    if (el.resumeAi) { el.resumeAi.textContent = ''; el.resumeAi.classList.add('is-hidden'); }
  }

  /* Live reads ONLY live events: never fall back to the demo seed. */
  function activeEntries() {
    if (isLiveMode()) return state.liveTimeline;
    return state.timeline;
  }

  function formatClock() {
    var h = String(clockH).padStart(2, '0');
    var m = String(clockM).padStart(2, '0');
    return h + ':' + m;
  }

  function advanceClock(mins) {
    clockM += mins;
    while (clockM >= 60) { clockM -= 60; clockH = (clockH + 1) % 24; }
    renderClock();
  }

  function setClock(h, m) {
    clockH = h; clockM = m;
    renderClock();
  }

  function renderClock() {
    if (el.deskClock) el.deskClock.textContent = formatClock();
    if (el.nowClock) el.nowClock.textContent = formatClock();
  }

  function switchApp(next) {
    if (state.paused) return;
    if (isLiveMode()) return;
    var prev = state.currentApp;
    if (prev) {
      var dur = state.timeInCurrent || 5;
      state.timeline.push({ app: prev, duration: dur });
      if (state.timeline.length > 12) state.timeline.shift();
    }
    state.currentApp = next.label;
    state.currentTitle = next.title;
    state.timeInCurrent = 0;
    Desk.focus(next.label);
    renderAhora();
    renderTimeline();
    persistTimeline();
    Events.emit('app:switch', next);
  }

  function rotateApp() {
    var n = Events.nextApp();
    switchApp(n);
  }

  function receiveWhatsapp() {
    switchApp(Events.findByLabel('WhatsApp'));
  }

  function goAway(minutes) {
    if (isLiveMode()) return;
    minutes = minutes || 25;
    state.away = true;
    state.awayMinutes = minutes;
    state.prevApp = state.currentApp;
    state.prevTitle = state.currentTitle;
    state.prevWindows = ['Document', 'Browser', 'Spreadsheet'];
    hideResume();
    Desk.minimize('Document');
    renderAhoraAway();
  }

  function comeBack() {
    if (!state.away) return;
    state.away = false;
    if (state.paused) {
      // paused mid-away cancels the episode: no clock jump, no resume card.
      renderAhora();
      return;
    }
    advanceClock(state.awayMinutes);
    // The desk is whole again on return: Document is back in both themes,
    // with or without a resume card. Resume only refocuses from here.
    if (window.Desk && Desk.restore) Desk.restore('Document');
    if (state.awayMinutes >= 10) {
      showResume();
      openPanel();
      switchTab('ahora');
      if (window.retoma && window.retoma.notifyReturn) {
        try { window.retoma.notifyReturn({ awayMinutes: state.awayMinutes, app: state.prevApp }); } catch (e) { /* demo keeps going */ }
      }
    }
    renderAhora();
  }

  function showResume() {
    if (!el.resumeCard) return;
    var live = window.Live && Live.isLive && Live.isLive();
    if (el.retomaPanel) el.retomaPanel.classList.add('has-resume');
    el.resumeCard.classList.remove('is-hidden');
    if (el.resumeHero) {
      el.resumeHero.textContent = 'You were in ' + state.prevApp;
      splitHeroWords(el.resumeHero);
    }
    if (el.resumeSub) el.resumeSub.textContent = state.prevTitle;
    if (el.resumeInter) {
      el.resumeInter.textContent = live
        ? 'Away ' + state.awayMinutes + ' min · back now'
        : state.interruptionApp + ' interrupted you · ' + state.awayMinutes + ' min';
    }
    var honest = document.getElementById('resumeHonest');
    if (honest) honest.classList.toggle('is-hidden', !live);
    if (el.retomarBtn) el.retomarBtn.textContent = live ? 'Got it' : 'Resume';
    if (el.resumeChips) {
      el.resumeChips.textContent = '';
      (state.prevWindows || []).forEach(function (w, i) {
        if (i > 0) {
          var sep = document.createElement('span');
          sep.className = 'resume-chip__sep';
          sep.textContent = ' · ';
          el.resumeChips.appendChild(sep);
        }
        var chip = document.createElement('span');
        chip.className = 'resume-chip';
        chip.textContent = w;
        el.resumeChips.appendChild(chip);
      });
    }
    var note = loadNote();
    if (el.resumeNote) {
      if (note) {
        el.resumeNote.textContent = 'Next: ' + note;
        el.resumeNote.classList.remove('is-hidden');
      } else {
        el.resumeNote.textContent = '';
        el.resumeNote.classList.add('is-hidden');
      }
    }
    // resumeAi under hero
    if (el.resumeAi) {
      el.resumeAi.textContent = '';
      el.resumeAi.classList.add('is-hidden');
    }
    var token = ++resumeAiToken;
    if (window.retoma && window.retoma.resumeLine) {
      var ctx = { app: state.prevApp, title: state.prevTitle, note: note, awayMinutes: state.awayMinutes };
      var opts = { mode: state.aiMode, consent: state.aiConsent, lang: uiLang() };
      try {
        window.retoma.resumeLine(ctx, opts).then(function (res) {
          if (token !== resumeAiToken) return;
          // Rules only repeat the hero + note line: show the line only when a model wrote it.
          if (!res || !res.text || res.fallback || res.source === 'On-device rules') {
            if (el.resumeAi) el.resumeAi.classList.add('is-hidden');
            return;
          }
          if (el.resumeAi) {
            el.resumeAi.textContent = '';
            var t = document.createElement('span');
            t.textContent = res.text;
            el.resumeAi.appendChild(t);
            if (res.source) {
              var tag = document.createElement('small');
              tag.className = 'resume-ai__source';
              tag.textContent = res.source;
              el.resumeAi.appendChild(document.createTextNode(' '));
              el.resumeAi.appendChild(tag);
            }
            el.resumeAi.classList.remove('is-hidden');
          }
        }, function () {
          if (token !== resumeAiToken) return;
          if (el.resumeAi) el.resumeAi.classList.add('is-hidden');
        });
      } catch (e) { /* noop */ }
    }
    el.resumeCard.classList.remove('is-visible');
    void el.resumeCard.offsetWidth;
    el.resumeCard.classList.add('is-visible');
  }

  function splitHeroWords(heroEl) {
    var text = heroEl.textContent || '';
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    heroEl.innerHTML = '';
    text.split(' ').forEach(function (word, i) {
      var s = document.createElement('span');
      s.className = 'w';
      s.textContent = word;
      if (!reduce) s.style.transitionDelay = (i * 100) + 'ms';
      heroEl.appendChild(s);
      heroEl.appendChild(document.createTextNode(' '));
    });
  }

  function fmtClock(totalMin) {
    var h = Math.floor(totalMin / 60) % 24;
    var m = totalMin % 60;
    return h + ':' + String(m).padStart(2, '0');
  }

  function computeProposal(data) {
    if (!data || !data.length) {
      if (isLiveMode()) return null;
      data = Events.seedTimeline;
    }
    var entries = data.slice();
    var longest = entries[0] || { app: 'Document', duration: 40 };
    entries.forEach(function (e) { if (e.duration > longest.duration) longest = e; });
    var ix = -1;
    for (var i = 0; i < entries.length; i++) {
      if (entries[i].app === 'WhatsApp') { ix = i; break; }
    }
    if (ix === -1) ix = entries.length > 1 ? 1 : 0;
    var startMin = 9 * 60;
    for (var j = 0; j < ix; j++) startMin += entries[j].duration;
    var rawStart = Math.max(6 * 60, startMin - 60);
    var winStart = Math.ceil(rawStart / 15) * 15;
    var winEnd = winStart + longest.duration;
    return {
      longest: longest,
      interApp: entries[ix] ? entries[ix].app : longest.app,
      interStart: startMin,
      winStart: winStart,
      winEnd: winEnd,
      text: 'Tomorrow: ' + longest.duration + ' min for the report, ' + fmtClock(winStart) + ' to ' + fmtClock(winEnd) + ', before the messages arrive.',
      how: 'How I decided: longest block ' + longest.app + ' ' + longest.duration + ' min · first interruption ' + (entries[ix] ? entries[ix].app : longest.app) + ' ' + fmtClock(startMin) + ' · window ' + fmtClock(winStart) + '–' + fmtClock(winEnd)
    };
  }

  function renderProposal(data) {
    var textEl = document.getElementById('proposalText');
    var howEl = document.getElementById('proposalHow');
    var tagEl = document.getElementById('proposalTag');
    var card = document.getElementById('proposalCard');
    /* Live with no live events: no proposal, and propose() never runs. */
    if (isLiveMode() && (!data || !data.length)) {
      if (card) { card.classList.add('is-hidden'); card.classList.remove('is-loading'); }
      return null;
    }
    var useProvider = hasBridge() && (state.aiMode === 'local' || state.aiMode === 'server') && state.aiConsent[state.aiMode];
    if (!useProvider) {
      var p = computeProposal(data);
      if (!p) {
        if (card) { card.classList.add('is-hidden'); card.classList.remove('is-loading'); }
        return null;
      }
      if (textEl) textEl.textContent = p.text;
      if (howEl) howEl.textContent = p.how;
      if (tagEl) tagEl.textContent = 'On-device rules';
      if (card) card.classList.remove('is-loading');
      return p;
    }
    var summary = Ai.buildSummary(data && data.length ? data : Events.seedTimeline);
    var token = ++state.aiToken;
    state.aiBusy = true;
    if (card) card.classList.add('is-loading');
    if (textEl) textEl.innerHTML = '<span class="skeleton-bar"></span><span class="skeleton-bar skeleton-bar--short"></span>';
    if (howEl) howEl.textContent = '';
    window.retoma.propose(summary, { mode: state.aiMode, consent: state.aiConsent, lang: uiLang() }).then(function (res) {
      if (token !== state.aiToken) return;
      state.aiBusy = false;
      if (card) card.classList.remove('is-loading');
      if (!res || !Ai.validProposal(res)) {
        var fb = computeProposal(data);
        if (!fb) { if (card) card.classList.add('is-hidden'); return; }
        if (textEl) textEl.textContent = fb.text;
        if (howEl) howEl.textContent = fb.how;
        if (tagEl) tagEl.textContent = 'On-device rules';
        return;
      }
      var f = Ai.formatProposal(res);
      if (textEl) textEl.textContent = f.text;
      if (howEl) howEl.textContent = res.fallback && res.note ? f.how + ' · ' + res.note : f.how;
      if (tagEl) tagEl.textContent = sourceLabel(res.source, res.fallback);
    }, function () {
      if (token !== state.aiToken) return;
      state.aiBusy = false;
      if (card) card.classList.remove('is-loading');
      var fb2 = computeProposal(data);
      if (!fb2) { if (card) card.classList.add('is-hidden'); return; }
      if (textEl) textEl.textContent = fb2.text;
      if (howEl) howEl.textContent = fb2.how;
      if (tagEl) tagEl.textContent = 'On-device rules';
    });
    return null;
  }

  /* The proposal tag names the real source. The resume card is not AI
   * and carries no tag. Rules output is always "On-device rules". */
  function sourceLabel(source, fallback) {
    if (fallback) return 'On-device rules';
    if (!source || source === 'rules') return 'On-device rules';
    return source;
  }

  function hasBridge() {
    return !!(window.retoma && window.retoma.propose);
  }

  function loadAiPrefs() {
    try {
      var m = window.localStorage.getItem('retoma-ai-mode');
      if (m === 'off' || m === 'local' || m === 'cloud' || m === 'server') state.aiMode = m;
      var c = JSON.parse(window.localStorage.getItem('retoma-ai-consent') || '{}');
      if (c) { state.aiConsent.local = !!c.local; state.aiConsent.cloud = !!c.cloud; state.aiConsent.server = !!c.server; }
    } catch (e) { /* prefs stay default */ }
  }

  function saveAiPrefs() {
    try {
      window.localStorage.setItem('retoma-ai-mode', state.aiMode);
      window.localStorage.setItem('retoma-ai-consent', JSON.stringify(state.aiConsent));
    } catch (e) { /* noop */ }
  }

  function paintAiMode() {
    var btns = document.querySelectorAll('[data-ai-mode]');
    for (var i = 0; i < btns.length; i++) {
      var b = btns[i];
      var m = b.getAttribute('data-ai-mode');
      b.classList.toggle('is-active', m === state.aiMode);
      if (m === 'cloud') {
        b.disabled = !state.cloudAvailable;
        b.title = state.cloudAvailable ? '' : state.cloudReason;
      } else if (m === 'local') {
        b.disabled = !hasBridge();
        b.title = hasBridge() ? '' : 'Local model needs the desktop app';
      } else if (m === 'server') {
        b.disabled = !hasBridge();
        b.title = hasBridge() ? '' : 'Retoma server needs the desktop app';
      }
    }
    var reason = document.getElementById('aiModeReason');
    if (reason) {
      var msg = '';
      if (state.aiMode === 'cloud' && !state.cloudAvailable) msg = state.cloudReason;
      if (state.aiMode === 'local' && !hasBridge()) msg = 'Local model needs the desktop app';
      if (state.aiMode === 'server' && !hasBridge()) msg = 'Retoma server needs the desktop app';
      reason.textContent = msg;
      reason.classList.toggle('is-hidden', !msg);
    }
    refreshServerStatusLine();
  }

  var habitsPatched = false;
  function patchHabitsStatus() {
    if (habitsPatched) return;
    try {
      if (window.HabitsUI && HabitsUI.refreshStatus) {
        habitsPatched = true;
        var orig = HabitsUI.refreshStatus;
        HabitsUI.refreshStatus = function () {
          if (state.aiMode === 'server') { refreshServerStatusLineInner(); return; }
          return orig.apply(this, arguments);
        };
      }
    } catch (e) { /* noop */ }
  }

  function refreshServerStatusLineInner() {
    var st = document.getElementById('aiStatus');
    if (!st) return;
    if (!hasBridge() || !(window.retoma && window.retoma.serverStatus)) return;
    window.retoma.serverStatus().then(function (s) {
      if (state.aiMode !== 'server') return;
      if (s && s.reachable) {
        st.textContent = 'Retoma server: ready (' + (s.model || '') + ')';
      } else {
        st.textContent = 'Retoma server: offline, using on-device rules';
      }
    }, function () {
      if (state.aiMode !== 'server') return;
      st.textContent = 'Retoma server: offline, using on-device rules';
    });
  }

  function refreshServerStatusLine() {
    patchHabitsStatus();
    if (state.aiMode !== 'server') return;
    refreshServerStatusLineInner();
  }

  function refreshCapabilities() {
    if (!hasBridge()) {
      state.cloudAvailable = false;
      state.cloudReason = 'Cloud model needs the desktop app';
      if (state.aiMode !== 'off') state.aiMode = 'off';
      paintAiMode();
      return;
    }
    window.retoma.capabilities().then(function (caps) {
      state.cloudAvailable = !!(caps && caps.cloudAvailable);
      state.cloudReason = (caps && caps.cloudReason) || '';
      if (state.aiMode === 'cloud' && !state.cloudAvailable) state.aiMode = 'off';
      if ((state.aiMode === 'local' || state.aiMode === 'server') && !hasBridge()) state.aiMode = 'off';
      paintAiMode();
    }, function () { paintAiMode(); });
  }

  function hideConsent() {
    var box = document.getElementById('aiConsent');
    if (box) box.classList.add('is-hidden');
  }

  function showConsent(mode) {
    var box = document.getElementById('aiConsent');
    var pre = document.getElementById('aiPayload');
    if (!box || !pre) return;
    var copy = box.querySelector('.panel-section__text--muted');
    if (copy) {
      if (mode === 'server') {
        copy.textContent = "Your note, the app name and the window title go to Retoma's server, which asks gemma on Ollama cloud. Nothing is stored there.";
      } else {
        copy.textContent = 'This exact payload is sent. Nothing else leaves this device.';
      }
    }
    var entries = activeEntries();
    var summary = entries.length
      ? Ai.buildSummary(entries)
      : (isLiveMode()
        ? { perApp: {}, longest: { app: 'None', minutes: 0 }, firstInterruption: { app: 'None', at: '—' } }
        : Ai.buildSummary(Events.seedTimeline));
    paintAiMode();
    var paint = function (payload) {
      pre.textContent = JSON.stringify(payload, null, 2);
      box.classList.remove('is-hidden');
    };
    if (hasBridge()) {
      window.retoma.previewPayload(summary, mode).then(paint, function () { paint(Ai.previewLocal(summary)); });
    } else {
      paint(Ai.previewLocal(summary));
    }
  }

  function selectAiMode(mode) {
    if (mode !== 'off' && mode !== 'local' && mode !== 'cloud' && mode !== 'server') return;
    if (mode === 'cloud' && !state.cloudAvailable) { paintAiMode(); return; }
    if ((mode === 'local' || mode === 'server') && !hasBridge()) { paintAiMode(); return; }
    if ((mode === 'local' || mode === 'cloud' || mode === 'server') && !state.aiConsent[mode]) {
      state.pendingMode = mode;
      showConsent(mode);
      return;
    }
    state.pendingMode = null;
    state.aiToken++;
    state.aiMode = mode;
    saveAiPrefs();
    hideConsent();
    paintAiMode();
    renderTimeline();
  }

  function persistTimeline() {
    if (isLiveMode()) {
      if (state.liveEmpty) return;
      Persist.save(state.liveTimeline, 'live');
      return;
    }
    if (state.empty) return;
    Persist.save(state.timeline, 'demo');
  }

  /* Swap the visible history when the mode flips; each mode keeps its own. */
  function reloadForMode(mode) {
    var m = mode === 'live' ? 'live' : 'demo';
    return Persist.load(m).then(function (events) {
      var list = (events || []).map(function (e) { return { app: e.app, duration: e.duration }; });
      if (m === 'live') {
        state.liveTimeline = list.slice(-12);
        state.liveEmpty = state.liveTimeline.length === 0;
      } else {
        if (list.length) {
          state.timeline = list.slice(-12);
          state.empty = false;
        }
      }
      hideResume();
      renderAhora();
      renderTimeline();
      if (window.Live && Live.renderLiveNow) Live.renderLiveNow();
      if (window.Live && Live.renderLiveToday) Live.renderLiveToday();
      return true;
    });
  }

  function hideResume() {
    if (!el.resumeCard) return;
    resumeAiToken++;
    if (el.resumeAi) { el.resumeAi.textContent = ''; el.resumeAi.classList.add('is-hidden'); }
    if (el.retomaPanel) el.retomaPanel.classList.remove('has-resume');
    el.resumeCard.classList.remove('is-visible');
    setTimeout(function () {
      if (!el.resumeCard.classList.contains('is-visible')) el.resumeCard.classList.add('is-hidden');
    }, 320);
  }

  function doRetomar() {
    if (!el.resumeCard || !el.resumeCard.classList.contains('is-visible')) return;
    if (window.Live && Live.isLive && Live.isLive()) {
      // Live on Wayland cannot reopen windows: the card only reminds.
      clearNote();
      hideResume();
      return;
    }
    if (state.empty) return;
    Desk.reopen(state.prevWindows, true);
    clearNote();
    hideResume();
    var app = Events.findByLabel(state.prevApp);
    if (app) switchApp(app);
  }

  function doStartFresh() {
    clearNote();
    hideResume();
  }

  /* The model answers in the language the person reads the app in. */
  function uiLang() {
    try { return (window.I18n && I18n.getLang && I18n.getLang() === 'es') ? 'es' : 'en'; } catch (e) { return 'en'; }
  }

  var RING_BLOCK_MIN = 25;
  function renderRing(minutes) {
    var ring = document.getElementById('nowRing');
    var label = document.getElementById('nowRingLabel');
    if (!ring || !label) return;
    var known = typeof minutes === 'number' && isFinite(minutes) && minutes >= 0;
    var p = known ? Math.min(1, minutes / RING_BLOCK_MIN) : 0;
    ring.style.setProperty('--p', String(p));
    ring.classList.toggle('is-full', p >= 1);
    label.textContent = '';
    label.appendChild(document.createTextNode(known ? String(minutes) : '0'));
    var unit = document.createElement('small');
    unit.textContent = 'min';
    label.appendChild(unit);
    ring.setAttribute('aria-label', known
      ? minutes + ' minutes in this task. The ring fills at ' + RING_BLOCK_MIN + ' minutes.'
      : 'Not tracking right now');
  }

  function renderAhora() {
    if (!el.nowApp) return;
    renderRing(null);
    if (isLiveMode() && !hasTimelineEntries() && !(window.Live && Live.state && Live.state.liveApp)) {
      /* Live with no live events: never show the demo's Document. */
      el.nowApp.textContent = 'Waiting for activity';
      if (el.nowTitle) el.nowTitle.textContent = 'Start any app to begin tracking.';
      if (el.nowTime) el.nowTime.textContent = '—';
      if (el.nowDesc) el.nowDesc.textContent = 'Only app names. Never what you type.';
      return;
    }
    if (state.paused) {
      el.nowApp.textContent = 'Paused: I am not watching anything';
      if (el.nowTitle) el.nowTitle.textContent = 'Retoma is paused. Resume whenever you like.';
      if (el.nowTime) el.nowTime.textContent = '—';
      if (el.nowDesc) el.nowDesc.textContent = 'Paused: I am not watching anything';
      return;
    }
    if (state.away) {
      el.nowApp.textContent = 'Away';
      if (el.nowTitle) el.nowTitle.textContent = 'Out · ' + state.awayMinutes + ' min';
      if (el.nowTime) el.nowTime.textContent = formatClock();
      if (el.nowDesc) el.nowDesc.textContent = 'Coming back shows where you left off.';
      return;
    }
    el.nowApp.textContent = state.currentApp;
    renderRing(state.timeInCurrent);
    if (el.nowTitle) el.nowTitle.textContent = state.currentTitle;
    if (el.nowTime) el.nowTime.textContent = state.timeInCurrent + ' min here';
    if (el.nowDesc) {
      el.nowDesc.textContent = (window.Live && Live.isLive && Live.isLive())
        ? ((Live.titlesOn && Live.titlesOn()) ? 'App name and title. Never what you type.' : 'Only the app name. Never what you type.')
        : 'Only the app name and the title. Never what you type.';
    }
  }

  function renderAhoraAway() {
    if (el.nowApp) el.nowApp.textContent = 'Away';
    if (el.nowTitle) el.nowTitle.textContent = 'Out · ' + state.awayMinutes + ' min';
    if (el.nowTime) el.nowTime.textContent = formatClock();
    if (el.nowDesc) el.nowDesc.textContent = 'Coming back shows where you left off.';
  }

  function togglePause() {
    state.paused = !state.paused;
    if (window.retoma && window.retoma.setPaused) {
      try { window.retoma.setPaused(state.paused); } catch (e) { /* demo keeps going */ }
    }
    var btn = el.toggleBtn;
    if (btn) {
      btn.classList.toggle('is-paused', state.paused);
      btn.setAttribute('aria-pressed', String(state.paused));
      var eyeOpen = btn.querySelector('.eye-open');
      var eyeClosed = btn.querySelector('.eye-closed');
      if (eyeOpen && eyeClosed) {
        eyeOpen.style.display = state.paused ? 'none' : 'block';
        eyeClosed.style.display = state.paused ? 'block' : 'none';
      }
    }
    if (el.menuBar) el.menuBar.classList.toggle('is-paused', state.paused);
    if (el.simPause) el.simPause.textContent = state.paused ? 'Resume' : 'Pause';
    renderAhora();
    Events.emit('retoma:pause', state.paused);
  }

  function isPaused() { return state.paused; }

  function renderTimeline() {
    if (!el.timelineBar) return;
    /* Live reads ONLY live events: empty Live never falls back to the demo seed. */
    var dayStatement = document.getElementById('dayStatement');
    if (isLiveMode()) {
      if (dayStatement) dayStatement.style.display = 'none';
      if (state.liveEmpty || !state.liveTimeline.length) {
        el.timelineBar.innerHTML = '';
        if (el.timelineLegend) el.timelineLegend.innerHTML = '';
        if (el.timelineText) el.timelineText.textContent = '';
        if (el.proposalCard) { el.proposalCard.classList.add('is-hidden'); el.proposalCard.classList.remove('is-loading'); }
        if (window.HabitsUI && HabitsUI.hide) { try { HabitsUI.hide(); } catch (e) { /* noop */ } }
        if (el.timeline) el.timeline.classList.remove('is-hidden');
        el.timelineBar.style.display = 'none';
        if (el.timelineLegend) el.timelineLegend.style.display = 'none';
        if (el.emptyState) {
          el.emptyState.textContent = 'Nothing tracked yet';
          el.emptyState.classList.remove('is-hidden');
        }
        return;
      }
      if (dayStatement) dayStatement.style.display = 'none';
      renderLiveList(state.liveTimeline);
      return;
    }
    if (dayStatement) dayStatement.style.display = '';
    if (state.empty) {
      el.timelineBar.innerHTML = '';
      if (el.timelineLegend) el.timelineLegend.innerHTML = '';
      if (el.timelineText) el.timelineText.textContent = '';
      if (el.proposalCard) el.proposalCard.classList.add('is-hidden');
      if (window.HabitsUI && HabitsUI.hide) { try { HabitsUI.hide(); } catch (e) { /* noop */ } }
      if (el.timeline) el.timeline.classList.remove('is-hidden');
      el.timelineBar.style.display = 'none';
      if (el.timelineLegend) el.timelineLegend.style.display = 'none';
      if (el.emptyState) {
        el.emptyState.textContent = 'No history. Everything was deleted.';
        el.emptyState.classList.remove('is-hidden');
      }
      return;
    }
    renderLiveList(state.timeline.length ? state.timeline : Events.seedTimeline);
  }

  /* Shared painter for one non-empty list. Demo passes the seed fallback;
   * Live passes ONLY live entries (never the seed). */
  function renderLiveList(data) {
    var total = data.reduce(function (s, e) { return s + e.duration; }, 0) || 80;
    el.timelineBar.style.display = '';
    var colors = ['var(--seg-1)', 'var(--seg-2)', 'var(--seg-3)', 'var(--seg-4)', 'var(--seg-5)'];
    // map colors consistently by index; will be distinct via tokens
    el.timelineBar.innerHTML = data.map(function (e, i) {
      var w = (e.duration / total * 100).toFixed(1);
      return '<div class="timeline-bar__seg" style="width:' + w + '%;--i:' + i + ';background:' + colors[i % colors.length] + '"></div>';
    }).join('');
    if (el.timelineLegend) {
      el.timelineLegend.style.display = '';
      // merge same-app segments for legend (sum minutes), keep bar segments
      var merged = {};
      var order = [];
      var appFirstColor = {};
      data.forEach(function (e, i) {
        if (!merged.hasOwnProperty(e.app)) { merged[e.app] = 0; order.push(e.app); appFirstColor[e.app] = colors[i % colors.length]; }
        merged[e.app] += e.duration;
      });
      // longest uninterrupted (single) block explains proposal minutes
      var longestSingle = data[0] || { app: 'Document', duration: 40 };
      data.forEach(function (e) { if (e.duration > longestSingle.duration) longestSingle = e; });
      el.timelineLegend.innerHTML = order.map(function (app) {
        var c = appFirstColor[app];
        var label = app + ' · ' + merged[app] + ' min';
        if (app === longestSingle.app) {
          return '<span class="timeline-legend__item timeline-legend__item--major"><span class="timeline-legend__dot" style="background:' + c + '"></span><span>' + label + '<span class="timeline-legend__sub">longest block ' + longestSingle.duration + ' min</span></span></span>';
        }
        return '<span class="timeline-legend__item"><span class="timeline-legend__dot" style="background:' + c + '"></span>' + label + '</span>';
      }).join('');
    }
    if (el.timelineText) {
      el.timelineText.textContent = isLiveMode()
        ? 'Tracked today: ' + total + ' min on this PC'
        : 'Planned: 2 h on the report · Actual: 1 h 20 min';
    }
    renderProposal(data);
    if (el.timeline) el.timeline.classList.remove('is-hidden');
    if (el.emptyState) el.emptyState.classList.add('is-hidden');
    if (!state.proposalDismissed && el.proposalCard) {
      el.proposalCard.classList.remove('is-hidden');
    } else if (state.proposalDismissed && el.proposalCard) {
      el.proposalCard.classList.add('is-hidden');
    }
    if (window.HabitsUI && HabitsUI.refresh) {
      try { HabitsUI.refresh(); } catch (e) { /* coach card keeps last state */ }
    }
  }

  function showEndOfDay() {
    if (isLiveMode()) {
      state.proposalDismissed = false;
      renderTimeline();
      if (el.timeline) el.timeline.classList.remove('is-hidden');
      openPanel();
      switchTab('hoy');
      return;
    }
    setClock(18, 0);
    if (!state.paused) {
      state.timeline.push({ app: state.currentApp, duration: state.timeInCurrent || 10 });
    }
    state.proposalDismissed = false;
    renderTimeline();
    persistTimeline();
    if (el.timeline) el.timeline.classList.remove('is-hidden');
    if (el.proposalCard) el.proposalCard.classList.remove('is-hidden');
    openPanel();
    switchTab('hoy');
  }

  function dismissProposal() {
    state.proposalDismissed = true;
    if (el.proposalCard) el.proposalCard.classList.add('is-hidden');
  }

  function acceptProposal() {
    dismissProposal();
  }

  function deleteAll() {
    /* Live deletes ONLY the live store and says so; Demo deletes only demo. */
    if (isLiveMode()) {
      state.liveTimeline = [];
      state.liveEmpty = true;
      state.aiToken++;
      state.away = false;
      state.awayMinutes = 0;
      clearNote();
      hideResume();
      renderTimeline();
      dismissProposal();
      if (window.Live && Live.renderLiveToday) Live.renderLiveToday();
      if (window.Live && Live.renderLiveNow) Live.renderLiveNow();
      Persist.removeAll('live');
      try { window.localStorage.removeItem('retoma-exp-live'); } catch (e) { /* noop */ }
      return;
    }
    state.timeline = [];
    state.empty = true;
    state.aiToken++;
    state.away = false;
    state.awayMinutes = 0;
    clearNote();
    hideResume();
    renderTimeline();
    dismissProposal();
    Persist.removeAll('demo');
    try { window.localStorage.removeItem('retoma-exp-demo'); } catch (e) { /* noop */ }
  }

  function hasTimelineEntries() {
    if (isLiveMode()) return !state.liveEmpty && state.liveTimeline.length > 0;
    return !state.empty && state.timeline.length > 0;
  }

  /* The Retoma column is the app itself (always on screen). openPanel /
   * closePanel stay in the API for the story and tests; closing is a no-op. */
  function isPanelOpen() { return !!el.retomaPanel; }

  function syncDesktopLayout() {
    var ws = document.getElementById('desktopWorkspace');
    if (!ws) return;
    requestAnimationFrame(function () {
      var r = ws.getBoundingClientRect();
      if (r.width < 200) return;
      var inset = 24, gap = 16, top = 56;
      var colW = Math.floor((r.width - inset * 2 - gap) / 2);
      colW = Math.max(160, Math.min(colW, 360));
      var rowH = Math.floor((r.height - top - inset - gap) / 2);
      var map = { 'win-doc': 0, 'win-browser': 1, 'win-whatsapp': 2, 'win-sheet': 3 };
      Object.keys(map).forEach(function (id) {
        var e = document.getElementById(id);
        if (!e) return;
        var ix = map[id];
        e.style.left = (inset + (ix % 2) * (colW + gap)) + 'px';
        e.style.top = (top + Math.floor(ix / 2) * (Math.max(rowH, 180) + gap)) + 'px';
        e.style.width = colW + 'px';
      });
    });
  }

  function openPanel() {
    if (!el.retomaPanel) return;
    el.retomaPanel.classList.add('is-open');
    syncDesktopLayout();
  }
  function closePanel() {
    syncDesktopLayout();
  }
  function togglePanel() {
    if (isPanelOpen()) closePanel(); else openPanel();
  }

  function switchTab(name) {
    if (!['ahora','hoy','priv'].includes(name)) return;
    activeTab = name;
    document.querySelectorAll('.retoma-tabs__btn').forEach(function (b) {
      var is = b.getAttribute('data-tab') === name;
      b.classList.toggle('is-active', is);
      b.setAttribute('aria-selected', is ? 'true' : 'false');
    });
    document.querySelectorAll('.retoma-tab').forEach(function (p) {
      var idMap = { ahora: 'retomaTabAhora', hoy: 'retomaTabHoy', priv: 'retomaTabPriv' };
      var target = idMap[name];
      if (p.id === target) p.classList.add('is-active'); else p.classList.remove('is-active');
    });
    // keep the sliding tab ink under the active tab on every path
    // (button clicks and internal calls, not only the wrapped global).
    if (window.Visual && window.Visual.placeInk) {
      requestAnimationFrame(function () { window.Visual.placeInk(); });
    }
  }

  function startTick() {
    if (tickTimer) clearInterval(tickTimer);
    tickTimer = setInterval(function () {
      if (state.paused || state.away) return;
      state.timeInCurrent += 1;
      if (state.timeInCurrent % 2 === 0) {
        advanceClock(1);
      }
      renderAhora();
    }, 1000);
  }

  function mount() {
    el.deskClock = document.getElementById('deskClock');
    el.menuBar = document.getElementById('menuBar');
    el.nowApp = document.getElementById('nowApp');
    el.nowTitle = document.getElementById('nowTitle');
    el.nowDesc = document.getElementById('nowDesc');
    el.nowTime = document.getElementById('nowTime');
    el.nowClock = document.getElementById('nowClock');
    el.toggleBtn = document.getElementById('retomaToggle');
    el.retomaPanel = document.getElementById('retomaPanel');
    el.resumeCard = document.getElementById('resumeCard');
    el.resumeHero = document.getElementById('resumeHero');
    el.resumeSub = document.getElementById('resumeSub');
    el.resumeInter = document.getElementById('resumeInter');
    el.resumeChips = document.getElementById('resumeChips');
    el.retomarBtn = document.getElementById('retomarBtn');
    el.startFreshBtn = document.getElementById('startFreshBtn');
    el.leaveNote = document.getElementById('leaveNote');
    el.resumeNote = document.getElementById('resumeNote');
    el.resumeAi = document.getElementById('resumeAi');
    el.timeline = document.getElementById('timeline');
    el.timelineBar = document.getElementById('timelineBar');
    el.timelineLegend = document.getElementById('timelineLegend');
    el.timelineText = document.getElementById('timelineText');
    el.proposalCard = document.getElementById('proposalCard');
    el.proposalAccept = document.getElementById('proposalAccept');
    el.proposalDecline = document.getElementById('proposalDecline');
    el.emptyState = document.getElementById('emptyState');
    el.confirmOverlay = document.getElementById('confirmOverlay');
    el.confirmYes = document.getElementById('confirmYes');
    el.confirmNo = document.getElementById('confirmNo');
    el.deleteBtn = document.getElementById('btnDelete');
    el.simPause = document.getElementById('btnPause');

    if (el.toggleBtn) {
      el.toggleBtn.addEventListener('click', function (ev) {
        ev.stopPropagation();
        togglePause();
      });
    }
    if (el.retomarBtn) el.retomarBtn.addEventListener('click', doRetomar);
    if (el.startFreshBtn) el.startFreshBtn.addEventListener('click', doStartFresh);
    if (el.leaveNote) {
      try { el.leaveNote.value = loadNote(); } catch (e) { /* noop */ }
      el.leaveNote.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter') { ev.preventDefault(); saveNote(el.leaveNote.value); }
      });
      el.leaveNote.addEventListener('blur', function () { saveNote(el.leaveNote.value); });
    }
    if (el.proposalAccept) el.proposalAccept.addEventListener('click', acceptProposal);
    if (el.proposalDecline) el.proposalDecline.addEventListener('click', dismissProposal);

    // tabs
    document.querySelectorAll('.retoma-tabs__btn').forEach(function (b) {
      b.addEventListener('click', function () { switchTab(b.getAttribute('data-tab')); });
    });

    // Esc closes the confirm dialog (the Retoma column never closes)
    document.addEventListener('keydown', function (ev) {
      if (ev.key !== 'Escape') return;
      if (el.confirmOverlay && el.confirmOverlay.classList.contains('is-open')) closeConfirm();
    });

    // privacy delete confirm
    if (el.deleteBtn) el.deleteBtn.addEventListener('click', function () { openConfirm(); });
    var privDelete = document.getElementById('privacyDelete');
    if (privDelete) privDelete.addEventListener('click', function () { openConfirm(); });
    if (el.confirmNo) el.confirmNo.addEventListener('click', function () { closeConfirm(); });
    if (el.confirmYes) el.confirmYes.addEventListener('click', function () { closeConfirm(); deleteAll(); });
    if (el.confirmOverlay) el.confirmOverlay.addEventListener('click', function (ev) { if (ev.target === el.confirmOverlay) closeConfirm(); });
    if (el.confirmOverlay) {
      el.confirmOverlay.setAttribute('aria-hidden', 'true');
      el.confirmOverlay.addEventListener('keydown', function (ev) {
        if (ev.key === 'Escape') { ev.stopPropagation(); closeConfirm(); return; }
        if (ev.key !== 'Tab') return;
        var f = Array.from(el.confirmOverlay.querySelectorAll('button')).filter(function (b) { return !b.disabled; });
        if (!f.length) return;
        var first = f[0], last = f[f.length - 1];
        if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); }
        else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
      });
    }

    setClock(9, 0);
    state.timeline = Events.seedTimeline.slice();
    loadAiPrefs();
    paintAiMode();
    refreshCapabilities();
    document.querySelectorAll('[data-ai-mode]').forEach(function (b) {
      b.addEventListener('click', function () { selectAiMode(b.getAttribute('data-ai-mode')); });
    });
    var aiAllow = document.getElementById('aiAllow');
    if (aiAllow) aiAllow.addEventListener('click', function () {
      if (!state.pendingMode) return;
      state.aiConsent[state.pendingMode] = true;
      var m = state.pendingMode;
      state.pendingMode = null;
      state.aiToken++;
      state.aiMode = m;
      saveAiPrefs();
      hideConsent();
      paintAiMode();
      renderTimeline();
    });
    var aiCancel = document.getElementById('aiCancel');
    if (aiCancel) aiCancel.addEventListener('click', function () { state.pendingMode = null; hideConsent(); paintAiMode(); });
    var privExport = document.getElementById('privacyExport');
    if (privExport) privExport.addEventListener('click', function () { Persist.exportData(state.timeline); });
    if (window.retoma && window.retoma.onFocusResume) {
      try {
        window.retoma.onFocusResume(function () {
          openPanel();
          switchTab('ahora');
          showResume();
          var resumeBtn = document.getElementById('retomarBtn');
          if (resumeBtn) resumeBtn.focus();
        });
      } catch (e) { /* demo keeps going */ }
    }
    if (window.retoma && window.retoma.onNoteFocus) {
      try {
        window.retoma.onNoteFocus(function () {
          openPanel();
          switchTab('ahora');
          if (el.leaveNote) el.leaveNote.focus();
        });
      } catch (e) { /* demo keeps going */ }
    }
    Persist.load('demo').then(function (events) {
      if (events && events.length) {
        state.timeline = events.slice(-12).map(function (e) { return { app: e.app, duration: e.duration }; });
        state.empty = false;
        if (!isLiveMode()) renderTimeline();
        persistTimeline();
      }
    });
    Persist.load('live').then(function (events) {
      var list = (events || []).map(function (e) { return { app: e.app, duration: e.duration }; });
      if (list.length) {
        state.liveTimeline = list.slice(-12);
        state.liveEmpty = false;
        if (isLiveMode()) { renderTimeline(); renderAhora(); }
      }
    });
    setInterval(function () {
      var m = isLiveMode() ? 'live' : 'demo';
      Persist.load(m).then(function (events) { Persist.save(events || [], m); });
    }, 3600 * 1000);
    renderAhora();
    renderTimeline();
    hideResume();
    switchTab('ahora');
    closePanel();
    startTick();
    window.addEventListener('resize', syncDesktopLayout);

    // expose for tests/story
    window.Retoma = { state: state, switchApp: switchApp, rotateApp: rotateApp, receiveWhatsapp: receiveWhatsapp, goAway: goAway, comeBack: comeBack, showResume: showResume, hideResume: hideResume, doRetomar: doRetomar, togglePause: togglePause, isPaused: isPaused, showEndOfDay: showEndOfDay, dismissProposal: dismissProposal, acceptProposal: acceptProposal, deleteAll: deleteAll, hasTimelineEntries: hasTimelineEntries, openPanel: openPanel, closePanel: closePanel, togglePanel: togglePanel, setClock: setClock, advanceClock: advanceClock, switchTab: switchTab, isPanelOpen: isPanelOpen, syncDesktopLayout: syncDesktopLayout, renderTimeline: renderTimeline, renderAhora: renderAhora, selectAiMode: selectAiMode, hasBridge: hasBridge, reloadForMode: reloadForMode, isLiveMode: isLiveMode };
  }

  function openConfirm() {
    if (!el.confirmOverlay) return;
    var confirmText = document.getElementById('confirmText');
    if (confirmText) {
      confirmText.textContent = isLiveMode()
        ? 'Only the Live history on this PC will be deleted. Demo history is kept. This cannot be undone.'
        : 'Today\'s history and cards will be deleted. This cannot be undone.';
    }
    el.lastFocus = document.activeElement;
    el.confirmOverlay.classList.add('is-open');
    el.confirmOverlay.setAttribute('aria-hidden', 'false');
    setTimeout(function () { if (el.confirmYes) el.confirmYes.focus(); }, 60);
  }
  function closeConfirm() {
    if (!el.confirmOverlay) return;
    el.confirmOverlay.classList.remove('is-open');
    el.confirmOverlay.setAttribute('aria-hidden', 'true');
    var back = el.lastFocus && document.contains(el.lastFocus) ? el.lastFocus : el.deleteBtn;
    if (back && typeof back.focus === 'function') back.focus();
    el.lastFocus = null;
  }

  return { mount: mount, state: state, switchApp: switchApp, rotateApp: rotateApp, receiveWhatsapp: receiveWhatsapp, goAway: goAway, comeBack: comeBack, showResume: showResume, hideResume: hideResume, doRetomar: doRetomar, togglePause: togglePause, isPaused: isPaused, showEndOfDay: showEndOfDay, deleteAll: deleteAll, hasTimelineEntries: hasTimelineEntries, openPanel: openPanel, closePanel: closePanel, setClock: setClock, reloadForMode: reloadForMode, isLiveMode: isLiveMode, renderTimeline: renderTimeline, renderAhora: renderAhora };
})();
