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
    proposalDismissed: false,
    aiMode: 'off',
    aiConsent: { local: false, cloud: false },
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
    advanceClock(state.awayMinutes);
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
    el.resumeCard.classList.remove('is-hidden');
    if (el.resumeHero) {
      el.resumeHero.textContent = 'You were in ' + state.prevApp;
      splitHeroWords(el.resumeHero);
    }
    if (el.resumeSub) el.resumeSub.textContent = state.prevTitle;
    if (el.resumeInter) el.resumeInter.textContent = state.interruptionApp + ' interrupted you · ' + state.awayMinutes + ' min';
    if (el.resumeChips) {
      el.resumeChips.innerHTML = state.prevWindows.map(function (w) { return '<span class="chip resume-chip">' + w + '</span>'; }).join('');
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
    var entries = (data && data.length ? data : Events.seedTimeline).slice();
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
    var useProvider = hasBridge() && (state.aiMode === 'local' || state.aiMode === 'cloud') && state.aiConsent[state.aiMode];
    if (!useProvider) {
      var p = computeProposal(data);
      if (textEl) textEl.textContent = p.text;
      if (howEl) howEl.textContent = p.how;
      if (tagEl) tagEl.textContent = 'Simulated';
      if (card) card.classList.remove('is-loading');
      return p;
    }
    var summary = Ai.buildSummary(data && data.length ? data : Events.seedTimeline);
    var token = ++state.aiToken;
    state.aiBusy = true;
    if (card) card.classList.add('is-loading');
    if (textEl) textEl.innerHTML = '<span class="skeleton-bar"></span><span class="skeleton-bar skeleton-bar--short"></span>';
    if (howEl) howEl.textContent = '';
    window.retoma.propose(summary, { mode: state.aiMode, consent: state.aiConsent }).then(function (res) {
      if (token !== state.aiToken) return;
      state.aiBusy = false;
      if (card) card.classList.remove('is-loading');
      if (!res || !Ai.validProposal(res)) {
        var fb = computeProposal(data);
        if (textEl) textEl.textContent = fb.text;
        if (howEl) howEl.textContent = fb.how;
        if (tagEl) tagEl.textContent = 'On-device rules';
        return;
      }
      var f = Ai.formatProposal(res);
      if (textEl) textEl.textContent = f.text;
      if (howEl) howEl.textContent = res.fallback && res.note ? f.how + ' · ' + res.note : f.how;
      if (tagEl) tagEl.textContent = res.fallback ? 'On-device rules' : (res.source || 'Simulated');
    }, function () {
      if (token !== state.aiToken) return;
      state.aiBusy = false;
      if (card) card.classList.remove('is-loading');
      var fb2 = computeProposal(data);
      if (textEl) textEl.textContent = fb2.text;
      if (howEl) howEl.textContent = fb2.how;
      if (tagEl) tagEl.textContent = 'On-device rules';
    });
    return null;
  }

  function hasBridge() {
    return !!(window.retoma && window.retoma.propose);
  }

  function loadAiPrefs() {
    try {
      var m = window.localStorage.getItem('retoma-ai-mode');
      if (m === 'off' || m === 'local' || m === 'cloud') state.aiMode = m;
      var c = JSON.parse(window.localStorage.getItem('retoma-ai-consent') || '{}');
      if (c) { state.aiConsent.local = !!c.local; state.aiConsent.cloud = !!c.cloud; }
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
      }
    }
    var reason = document.getElementById('aiModeReason');
    if (reason) {
      var msg = '';
      if (state.aiMode === 'cloud' && !state.cloudAvailable) msg = state.cloudReason;
      if (state.aiMode === 'local' && !hasBridge()) msg = 'Local model needs the desktop app';
      reason.textContent = msg;
      reason.classList.toggle('is-hidden', !msg);
    }
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
      if (state.aiMode === 'local' && !hasBridge()) state.aiMode = 'off';
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
    var summary = Ai.buildSummary(state.timeline.length ? state.timeline : Events.seedTimeline);
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
    if (mode !== 'off' && mode !== 'local' && mode !== 'cloud') return;
    if (mode === 'cloud' && !state.cloudAvailable) { paintAiMode(); return; }
    if (mode === 'local' && !hasBridge()) { paintAiMode(); return; }
    if ((mode === 'local' || mode === 'cloud') && !state.aiConsent[mode]) {
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
    if (state.empty) return;
    Persist.save(state.timeline);
  }

  function hideResume() {
    if (!el.resumeCard) return;
    el.resumeCard.classList.remove('is-visible');
    setTimeout(function () {
      if (!el.resumeCard.classList.contains('is-visible')) el.resumeCard.classList.add('is-hidden');
    }, 320);
  }

  function doRetomar() {
    Desk.reopen(state.prevWindows, true);
    hideResume();
    var app = Events.findByLabel(state.prevApp);
    if (app) switchApp(app);
  }

  function doStartFresh() {
    hideResume();
  }

  function renderAhora() {
    if (!el.nowApp) return;
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
    if (el.nowTitle) el.nowTitle.textContent = state.currentTitle;
    if (el.nowTime) el.nowTime.textContent = state.timeInCurrent + ' min here';
    if (el.nowDesc) el.nowDesc.textContent = 'Only the app name and the title. Never what you type.';
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
    if (state.empty) {
      el.timelineBar.innerHTML = '';
      if (el.timelineLegend) el.timelineLegend.innerHTML = '';
      if (el.timelineText) el.timelineText.textContent = '';
      if (el.proposalCard) el.proposalCard.classList.add('is-hidden');
      if (el.timeline) el.timeline.classList.remove('is-hidden');
      el.timelineBar.style.display = 'none';
      if (el.timelineLegend) el.timelineLegend.style.display = 'none';
      if (el.emptyState) el.emptyState.classList.remove('is-hidden');
      return;
    }
    var data = state.timeline.length ? state.timeline : Events.seedTimeline;
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
    if (el.timelineText) el.timelineText.textContent = 'Planned: 2 h on the report · Actual: 1 h 20 min';
    renderProposal(data);
    if (el.timeline) el.timeline.classList.remove('is-hidden');
    if (el.emptyState) el.emptyState.classList.add('is-hidden');
    if (!state.proposalDismissed && el.proposalCard) {
      el.proposalCard.classList.remove('is-hidden');
    } else if (state.proposalDismissed && el.proposalCard) {
      el.proposalCard.classList.add('is-hidden');
    }
  }

  function showEndOfDay() {
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
    state.timeline = [];
    state.empty = true;
    state.aiToken++;
    hideResume();
    renderTimeline();
    dismissProposal();
    Persist.removeAll();
  }

  function hasTimelineEntries() { return !state.empty && state.timeline.length > 0; }

  function isPanelOpen() { return el.retomaPanel && el.retomaPanel.classList.contains('is-open'); }

  function syncDesktopLayout() {
    if (window.innerWidth < 901) {
      var da = document.querySelector('.desktop-area');
      if (da) da.classList.remove('has-panel-open');
      return;
    }
    var desktopArea = document.querySelector('.desktop-area');
    if (!desktopArea) return;
    var isOpen = isPanelOpen();
    if (isOpen) desktopArea.classList.add('has-panel-open');
    else desktopArea.classList.remove('has-panel-open');
    if (isOpen) {
      requestAnimationFrame(function () {
        var panel = document.getElementById('retomaPanel');
        var ws = document.getElementById('desktopWorkspace');
        if (!panel || !ws) return;
        var pLeft = panel.getBoundingClientRect().left;
        var wsLeft = ws.getBoundingClientRect().left;
        var avail = pLeft - wsLeft - 24;
        if (avail < 100) return;
        var gap = 16;
        var inset = 16;
        var colW = Math.floor((avail - inset * 2 - gap) / 2);
        colW = Math.max(180, Math.min(colW, 340));
        var map = { 'win-doc': 0, 'win-browser': 1, 'win-whatsapp': 2, 'win-sheet': 3 };
        var lefts = [inset, inset + colW + gap, inset, inset + colW + gap];
        var tops = [48, 48, 330, 330];
        Object.keys(map).forEach(function (id) {
          var e = document.getElementById(id);
          if (!e) return;
          var idx = map[id];
          e.style.left = lefts[idx] + 'px';
          e.style.width = colW + 'px';
          e.style.top = tops[idx] + 'px';
        });
      });
    } else {
      ['win-doc','win-browser','win-whatsapp','win-sheet'].forEach(function (id) {
        var e = document.getElementById(id);
        if (e) { e.style.left = ''; e.style.width = ''; e.style.top = ''; }
      });
    }
  }

  function openPanel() {
    if (!el.retomaPanel) return;
    el.retomaPanel.classList.add('is-open');
    el.retomaPanel.classList.remove('is-closing');
    if (el.toggleBtn) el.toggleBtn.setAttribute('aria-expanded', 'true');
    syncDesktopLayout();
  }
  function closePanel() {
    if (!el.retomaPanel) return;
    el.retomaPanel.classList.remove('is-open');
    el.retomaPanel.classList.add('is-closing');
    if (el.toggleBtn) el.toggleBtn.setAttribute('aria-expanded', 'false');
    syncDesktopLayout();
    setTimeout(function () { el.retomaPanel.classList.remove('is-closing'); }, 220);
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
        togglePanel();
      });
    }
    if (el.retomarBtn) el.retomarBtn.addEventListener('click', doRetomar);
    if (el.startFreshBtn) el.startFreshBtn.addEventListener('click', doStartFresh);
    if (el.proposalAccept) el.proposalAccept.addEventListener('click', acceptProposal);
    if (el.proposalDecline) el.proposalDecline.addEventListener('click', dismissProposal);

    // tabs
    document.querySelectorAll('.retoma-tabs__btn').forEach(function (b) {
      b.addEventListener('click', function () { switchTab(b.getAttribute('data-tab')); });
    });

    // Esc closes panel
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape') closePanel();
    });
    // click outside closes — ignore clicks that intentionally open the panel (Volver, endday) or inside sim-panel
    document.addEventListener('click', function (ev) {
      if (!el.retomaPanel || !el.toggleBtn) return;
      if (!isPanelOpen()) return;
      if (el.retomaPanel.contains(ev.target) || el.toggleBtn.contains(ev.target)) return;
      if (ev.target.closest('.confirm-overlay')) return;
      if (ev.target.closest('.sim-panel') || ev.target.closest('#freeMode')) return;
      if (ev.target.closest('.retoma-panel')) return;
      closePanel();
    });

    // privacy delete confirm
    if (el.deleteBtn) el.deleteBtn.addEventListener('click', function () { openConfirm(); });
    var privDelete = document.getElementById('privacyDelete');
    if (privDelete) privDelete.addEventListener('click', function () { openConfirm(); });
    if (el.confirmNo) el.confirmNo.addEventListener('click', closeConfirm);
    if (el.confirmYes) el.confirmYes.addEventListener('click', function () { closeConfirm(); deleteAll(); });
    if (el.confirmOverlay) el.confirmOverlay.addEventListener('click', function (ev) { if (ev.target === el.confirmOverlay) closeConfirm(); });

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
    Persist.load().then(function (events) {
      if (events && events.length) {
        state.timeline = events.slice(-12).map(function (e) { return { app: e.app, duration: e.duration }; });
        state.empty = false;
        renderTimeline();
        persistTimeline();
      }
    });
    setInterval(function () {
      Persist.load().then(function (events) { Persist.save(events || []); });
    }, 3600 * 1000);
    renderAhora();
    renderTimeline();
    hideResume();
    switchTab('ahora');
    closePanel();
    startTick();
    window.addEventListener('resize', syncDesktopLayout);

    // expose for tests/story
    window.Retoma = { state: state, switchApp: switchApp, rotateApp: rotateApp, receiveWhatsapp: receiveWhatsapp, goAway: goAway, comeBack: comeBack, showResume: showResume, hideResume: hideResume, doRetomar: doRetomar, togglePause: togglePause, isPaused: isPaused, showEndOfDay: showEndOfDay, dismissProposal: dismissProposal, acceptProposal: acceptProposal, deleteAll: deleteAll, hasTimelineEntries: hasTimelineEntries, openPanel: openPanel, closePanel: closePanel, togglePanel: togglePanel, setClock: setClock, advanceClock: advanceClock, switchTab: switchTab, isPanelOpen: isPanelOpen, syncDesktopLayout: syncDesktopLayout, renderTimeline: renderTimeline, selectAiMode: selectAiMode, hasBridge: hasBridge };
  }

  function openConfirm() { if (el.confirmOverlay) el.confirmOverlay.classList.add('is-open'); }
  function closeConfirm() { if (el.confirmOverlay) el.confirmOverlay.classList.remove('is-open'); }

  return { mount: mount, state: state, switchApp: switchApp, rotateApp: rotateApp, receiveWhatsapp: receiveWhatsapp, goAway: goAway, comeBack: comeBack, showResume: showResume, hideResume: hideResume, doRetomar: doRetomar, togglePause: togglePause, isPaused: isPaused, showEndOfDay: showEndOfDay, deleteAll: deleteAll, hasTimelineEntries: hasTimelineEntries, openPanel: openPanel, closePanel: closePanel, setClock: setClock };
})();
