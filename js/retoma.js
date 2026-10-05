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
    hideResume();
    Desk.minimize('Documento');
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
    }
    renderAhora();
  }

  function showResume() {
    if (!el.resumeCard) return;
    el.resumeCard.classList.remove('is-hidden');
    if (el.resumeHero) el.resumeHero.textContent = 'Estabas en: ' + state.prevApp;
    if (el.resumeSub) el.resumeSub.textContent = state.prevTitle;
    if (el.resumeInter) el.resumeInter.textContent = 'Te interrumpió ' + state.interruptionApp + ' · ' + state.awayMinutes + ' min';
    if (el.resumeChips) {
      el.resumeChips.innerHTML = state.prevWindows.map(function (w) { return '<span class="chip resume-chip">' + w + '</span>'; }).join('');
    }
    el.resumeCard.classList.remove('is-visible');
    void el.resumeCard.offsetWidth;
    el.resumeCard.classList.add('is-visible');
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
      el.nowApp.textContent = 'Pausado: no estoy viendo nada';
      if (el.nowTitle) el.nowTitle.textContent = 'Retoma está en pausa. Reanuda cuando quieras.';
      if (el.nowTime) el.nowTime.textContent = '—';
      if (el.nowDesc) el.nowDesc.textContent = 'Pausado: no estoy viendo nada';
      return;
    }
    if (state.away) {
      el.nowApp.textContent = 'Ausente';
      if (el.nowTitle) el.nowTitle.textContent = 'Fuera · ' + state.awayMinutes + ' min';
      if (el.nowTime) el.nowTime.textContent = formatClock();
      if (el.nowDesc) el.nowDesc.textContent = 'Volver te muestra dónde ibas.';
      return;
    }
    el.nowApp.textContent = state.currentApp;
    if (el.nowTitle) el.nowTitle.textContent = state.currentTitle;
    if (el.nowTime) el.nowTime.textContent = state.timeInCurrent + ' min aquí';
    if (el.nowDesc) el.nowDesc.textContent = 'Solo el nombre de la app y el título. Nunca lo que escribes.';
  }

  function renderAhoraAway() {
    if (el.nowApp) el.nowApp.textContent = 'Ausente';
    if (el.nowTitle) el.nowTitle.textContent = 'Fuera · ' + state.awayMinutes + ' min';
    if (el.nowTime) el.nowTime.textContent = formatClock();
    if (el.nowDesc) el.nowDesc.textContent = 'Volver te muestra dónde ibas.';
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
    if (el.menuBar) el.menuBar.classList.toggle('is-paused', state.paused);
    if (el.simPause) el.simPause.textContent = state.paused ? 'Reanudar' : 'Pausar';
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
    var colors = ['var(--bg-primary-500)', 'var(--tint-primary-70)', 'var(--tint-primary-45)', 'var(--tint-primary-30)', 'var(--tint-primary-18)'];
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
      el.timelineLegend.innerHTML = order.map(function (app) {
        var c = appFirstColor[app];
        return '<span class="timeline-legend__item"><span class="timeline-legend__dot" style="background:' + c + '"></span>' + app + ' · ' + merged[app] + ' min</span>';
      }).join('');
    }
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
    if (!state.paused) {
      state.timeline.push({ app: state.currentApp, duration: state.timeInCurrent || 10 });
    }
    state.proposalDismissed = false;
    renderTimeline();
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
    hideResume();
    renderTimeline();
    dismissProposal();
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
        var tops = [48, 48, 272, 286];
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
    renderAhora();
    renderTimeline();
    hideResume();
    switchTab('ahora');
    closePanel();
    startTick();
    window.addEventListener('resize', syncDesktopLayout);

    // expose for tests/story
    window.Retoma = { state: state, switchApp: switchApp, rotateApp: rotateApp, receiveWhatsapp: receiveWhatsapp, goAway: goAway, comeBack: comeBack, showResume: showResume, hideResume: hideResume, doRetomar: doRetomar, togglePause: togglePause, isPaused: isPaused, showEndOfDay: showEndOfDay, dismissProposal: dismissProposal, acceptProposal: acceptProposal, deleteAll: deleteAll, hasTimelineEntries: hasTimelineEntries, openPanel: openPanel, closePanel: closePanel, togglePanel: togglePanel, setClock: setClock, advanceClock: advanceClock, switchTab: switchTab, isPanelOpen: isPanelOpen, syncDesktopLayout: syncDesktopLayout, renderTimeline: renderTimeline };
  }

  function openConfirm() { if (el.confirmOverlay) el.confirmOverlay.classList.add('is-open'); }
  function closeConfirm() { if (el.confirmOverlay) el.confirmOverlay.classList.remove('is-open'); }

  return { mount: mount, state: state, switchApp: switchApp, rotateApp: rotateApp, receiveWhatsapp: receiveWhatsapp, goAway: goAway, comeBack: comeBack, showResume: showResume, hideResume: hideResume, doRetomar: doRetomar, togglePause: togglePause, isPaused: isPaused, showEndOfDay: showEndOfDay, deleteAll: deleteAll, hasTimelineEntries: hasTimelineEntries, openPanel: openPanel, closePanel: closePanel, setClock: setClock };
})();
