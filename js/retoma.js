/* retoma.js — tracker logic, resume-card builder, timeline, AI proposals */
var Retoma = (function () {
  'use strict';

  var state = {
    currentApp: 'Documento',
    currentTitle: 'Informe de calidad (párrafo 3)',
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
    proposalDismissed: false
  };

  var el = {};
  var clockH = 9, clockM = 0;
  var tickTimer = null;

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

  function nowAppLabel() { return state.currentApp; }

  function switchApp(next) {
    if (state.paused) return;
    var prev = state.currentApp;
    // push timeline entry for previous dwell
    if (prev) {
      // accumulate timeInCurrent into timeline
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
    state.prevWindows = ['Documento', 'Navegador', 'Hoja de cálculo'];
    // fast-forward clock x30 simulated: we just jump
    // hide resume card during away
    hideResume();
    // tick clock visually? story will handle
    Desk.minimize('Documento');
    // keep timeline paused during away
    renderAhoraAway();
  }

  function comeBack() {
    if (!state.away) return;
    state.away = false;
    advanceClock(state.awayMinutes);
    // if away >=10 show resume card
    if (state.awayMinutes >= 10) {
      showResume();
    }
    renderAhora();
  }

  function showResume() {
    if (!el.resumeCard) return;
    el.resumeCard.classList.remove('is-hidden');
    // fill content
    if (el.resumePrev) el.resumePrev.textContent = 'Estabas en: ' + state.prevApp + ' · ' + state.prevTitle;
    if (el.resumeInter) el.resumeInter.textContent = 'Te interrumpió: ' + state.interruptionApp + ', ' + state.awayMinutes + ' min';
    if (el.resumeChips) {
      el.resumeChips.innerHTML = state.prevWindows.map(function (w) { return '<span class="chip resume-chip">' + w + '</span>'; }).join('');
    }
    // slide up animation
    el.resumeCard.classList.remove('is-visible');
    void el.resumeCard.offsetWidth;
    el.resumeCard.classList.add('is-visible');
  }

  function hideResume() {
    if (!el.resumeCard) return;
    el.resumeCard.classList.remove('is-visible');
    // keep hidden after animation? but spec says exists hidden until shown
    // we hide via class after transition
    setTimeout(function () {
      if (!el.resumeCard.classList.contains('is-visible')) el.resumeCard.classList.add('is-hidden');
    }, 320);
  }

  function doRetomar() {
    Desk.reopen(state.prevWindows, true);
    hideResume();
    // switch back to prev app
    var app = Events.findByLabel(state.prevApp);
    if (app) switchApp(app);
  }

  function doStartFresh() {
    hideResume();
  }

  function renderAhora() {
    if (el.nowApp) el.nowApp.textContent = state.currentApp;
    if (el.nowTitle) el.nowTitle.textContent = state.currentTitle;
    if (el.nowTime) el.nowTime.textContent = state.timeInCurrent + ' min aquí';
    if (state.away && el.nowApp) el.nowApp.textContent = 'Ausente';
  }

  function renderAhoraAway() {
    if (el.nowApp) el.nowApp.textContent = 'Ausente';
    if (el.nowTitle) el.nowTitle.textContent = 'Fuera · ' + state.awayMinutes + ' min';
    if (el.nowTime) el.nowTime.textContent = formatClock();
  }

  function togglePause() {
    state.paused = !state.paused;
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
    // also update sim pause button label
    if (el.simPause) el.simPause.textContent = state.paused ? 'Reanudar' : 'Pausar';
    Events.emit('retoma:pause', state.paused);
  }

  function isPaused() { return state.paused; }

  function renderTimeline() {
    if (!el.timelineBar) return;
    if (state.empty) {
      el.timelineBar.innerHTML = '';
      if (el.timelineText) el.timelineText.textContent = '';
      if (el.proposalCard) el.proposalCard.classList.add('is-hidden');
      if (el.timeline) el.timeline.classList.remove('is-hidden');
      el.timelineBar.style.display = 'none';
      if (el.emptyState) el.emptyState.classList.remove('is-hidden');
      return;
    }
    // build segments from timeline OR seed
    var data = state.timeline.length ? state.timeline : Events.seedTimeline;
    var total = data.reduce(function (s, e) { return s + e.duration; }, 0) || 80;
    el.timelineBar.style.display = '';
    el.timelineBar.innerHTML = data.map(function (e, i) {
      var w = (e.duration / total * 100).toFixed(1);
      return '<div class="timeline-bar__seg" style="width:' + w + '%;--i:' + i + '"></div>';
    }).join('');
    if (el.timelineText) el.timelineText.textContent = 'Planeado: 2 h de informe · Real: 1 h 20 min';
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
    // push current dwell
    if (!state.paused) {
      state.timeline.push({ app: state.currentApp, duration: state.timeInCurrent || 10 });
    }
    state.proposalDismissed = false;
    renderTimeline();
    if (el.timeline) el.timeline.classList.remove('is-hidden');
    if (el.proposalCard) el.proposalCard.classList.remove('is-hidden');
    // ensure panel open to show Hoy
    openPanel();
  }

  function dismissProposal() {
    state.proposalDismissed = true;
    if (el.proposalCard) el.proposalCard.classList.add('is-hidden');
  }

  function acceptProposal() {
    dismissProposal();
    // accepted leaves trace? spec says declining leaves no trace, accepting closes it as well
  }

  function deleteAll() {
    state.timeline = [];
    state.empty = true;
    hideResume();
    renderTimeline();
    dismissProposal();
    // animate out: already handled
  }

  function hasTimelineEntries() { return !state.empty && state.timeline.length > 0; }

  function panel() { return el.retomaPanel; }
  function openPanel() {
    if (!el.retomaPanel) return;
    el.retomaPanel.classList.add('is-open');
    el.retomaPanel.classList.remove('is-closing');
  }
  function closePanel() {
    if (!el.retomaPanel) return;
    el.retomaPanel.classList.remove('is-open');
    el.retomaPanel.classList.add('is-closing');
    // remove closing after duration
    setTimeout(function () { el.retomaPanel.classList.remove('is-closing'); }, 220);
  }
  function togglePanel() {
    if (el.retomaPanel.classList.contains('is-open')) closePanel(); else openPanel();
  }

  function startTick() {
    if (tickTimer) clearInterval(tickTimer);
    tickTimer = setInterval(function () {
      if (state.paused || state.away) return;
      state.timeInCurrent += 1;
      // every 60s advance clock by 1
      if (state.timeInCurrent % 2 === 0) { // faster for demo: 2 ticks = 1 minute
        advanceClock(1);
      }
      renderAhora();
    }, 1000);
  }

  function mount() {
    el.deskClock = document.getElementById('deskClock');
    el.nowApp = document.getElementById('nowApp');
    el.nowTitle = document.getElementById('nowTitle');
    el.nowTime = document.getElementById('nowTime');
    el.nowClock = document.getElementById('nowClock');
    el.toggleBtn = document.getElementById('retomaToggle');
    el.retomaPanel = document.getElementById('retomaPanel');
    el.resumeCard = document.getElementById('resumeCard');
    el.resumePrev = document.getElementById('resumePrev');
    el.resumeInter = document.getElementById('resumeInter');
    el.resumeChips = document.getElementById('resumeChips');
    el.retomarBtn = document.getElementById('retomarBtn');
    el.startFreshBtn = document.getElementById('startFreshBtn');
    el.timeline = document.getElementById('timeline');
    el.timelineBar = document.getElementById('timelineBar');
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

    if (el.toggleBtn) el.toggleBtn.addEventListener('click', togglePause);
    if (el.retomarBtn) el.retomarBtn.addEventListener('click', doRetomar);
    if (el.startFreshBtn) el.startFreshBtn.addEventListener('click', doStartFresh);
    if (el.proposalAccept) el.proposalAccept.addEventListener('click', acceptProposal);
    if (el.proposalDecline) el.proposalDecline.addEventListener('click', dismissProposal);
    // panel toggle via clicking the toggle already does pause? spec says icon click = pause/resume AND dropdown? But we separate: toggleBtn click pauses AND opens? brief says Retoma status icon in menu bar: eye open/struck click = pause/resume always visible. Panel dropdown from icon. So click should do both? We'll make click pause, and double? Simpler: click pauses, panel opens on separate button? But we have only one icon. Implement: click toggles pause and also toggles panel after 120ms? We'll make panel open on click as well but not during story autoplay? Let's make primary click toggle pause and also toggle panel visibility: panel stays open while paused visible. Implement togglePanel inside togglePause after.
    // Actually we will attach second handler for panel toggle on same button but with distinction: if user clicks, pause + panel toggle.
    // To satisfy tests, we need panel reachable via toggle button click for Esc close test maybe. We'll make click open panel too.
    var origToggle = togglePause;
    // rewrap to also toggle panel open state for visibility in story step 7
    el.toggleBtn.addEventListener('click', function () {
      // after pause toggle, ensure panel is open so user sees sections
      openPanel();
    });

    // Esc closes panel
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape') closePanel();
    });
    // click outside closes
    document.addEventListener('click', function (ev) {
      if (!el.retomaPanel || !el.toggleBtn) return;
      if (el.retomaPanel.contains(ev.target) || el.toggleBtn.contains(ev.target)) return;
      // don't auto close if interacting elsewhere
    });

    // privacy delete confirm
    if (el.deleteBtn) el.deleteBtn.addEventListener('click', function () { openConfirm(); });
    var privDelete = document.getElementById('privacyDelete');
    if (privDelete) privDelete.addEventListener('click', function () { openConfirm(); });
    if (el.confirmNo) el.confirmNo.addEventListener('click', closeConfirm);
    if (el.confirmYes) el.confirmYes.addEventListener('click', function () { closeConfirm(); deleteAll(); });
    if (el.confirmOverlay) el.confirmOverlay.addEventListener('click', function (ev) { if (ev.target === el.confirmOverlay) closeConfirm(); });

    // also allow opening panel via eye icon long? Provide separate privacy opener? Story will call openPanel.

    // dock handled by Desk

    setClock(9, 0);
    state.timeline = Events.seedTimeline.slice();
    renderAhora();
    renderTimeline();
    hideResume();
    openPanel();
    startTick();

    // expose for tests/story
    window.Retoma = { state: state, switchApp: switchApp, rotateApp: rotateApp, receiveWhatsapp: receiveWhatsapp, goAway: goAway, comeBack: comeBack, showResume: showResume, hideResume: hideResume, doRetomar: doRetomar, togglePause: togglePause, isPaused: isPaused, showEndOfDay: showEndOfDay, dismissProposal: dismissProposal, acceptProposal: acceptProposal, deleteAll: deleteAll, hasTimelineEntries: hasTimelineEntries, openPanel: openPanel, closePanel: closePanel, togglePanel: togglePanel, setClock: setClock, advanceClock: advanceClock };
  }

  function openConfirm() { if (el.confirmOverlay) el.confirmOverlay.classList.add('is-open'); }
  function closeConfirm() { if (el.confirmOverlay) el.confirmOverlay.classList.remove('is-open'); }

  return { mount: mount, state: state, switchApp: switchApp, rotateApp: rotateApp, receiveWhatsapp: receiveWhatsapp, goAway: goAway, comeBack: comeBack, showResume: showResume, hideResume: hideResume, doRetomar: doRetomar, togglePause: togglePause, isPaused: isPaused, showEndOfDay: showEndOfDay, deleteAll: deleteAll, hasTimelineEntries: hasTimelineEntries, openPanel: openPanel, closePanel: closePanel, setClock: setClock };
})();
