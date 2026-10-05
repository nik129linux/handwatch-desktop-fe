/* story.js — guided script + free-mode controls */
var Story = (function () {
  'use strict';

  var el = {};
  var running = false;
  var paused = false;
  var stepIx = 0;
  var runToken = 0;
  var waitTimer = null;

  function S() { return window.__storySpeed || 1; }
  function scaled(n) { return Math.max(16, Math.round(n / S())); }

  function say(t) { if (el.subtitle) el.subtitle.textContent = t || ''; }

  var BEATS = [
    {
      sub: 'Retoma ve la app en uso. Solo el nombre, nunca lo que escribes.',
      hold: 2200,
      act: function () { Retoma.setClock(9, 0); Retoma.state.currentApp = 'Documento'; Retoma.state.currentTitle = 'Informe de calidad (párrafo 3)'; Retoma.state.timeInCurrent = 0; Desk.focus('Documento'); Retoma.openPanel(); }
    },
    {
      sub: 'Te interrumpieron. Lo anota, no te juzga.',
      hold: 2400,
      act: function () { Retoma.receiveWhatsapp(); },
      until: function () { return Retoma.state.currentApp === 'WhatsApp'; }
    },
    {
      sub: 'Te fuiste un rato.',
      hold: 2600,
      act: function () {
        Retoma.goAway(25);
        // fast-forward clock x30 visual: accelerate to 25 min
        var steps = 25; var i = 0;
        var iv = setInterval(function () {
          if (i >= steps || runToken !== runToken) { clearInterval(iv); return; }
          if (paused) return;
          Retoma.advanceClock(1);
          i++;
          if (i >= steps) clearInterval(iv);
        }, scaled(80));
      },
      until: function () { return Retoma.state.away; }
    },
    {
      sub: 'Al volver, te dice dónde ibas.',
      hold: 2600,
      act: function () { Retoma.comeBack(); },
      until: function () { return document.getElementById('resumeCard') && document.getElementById('resumeCard').classList.contains('is-visible'); }
    },
    {
      sub: 'Un toque y vuelves a tu trabajo.',
      hold: 2400,
      act: function () {
        // animate fingertip then click Retomar
        setTimeout(function () {
          var btn = document.getElementById('retomarBtn');
          if (btn) {
            btn.focus();
            // visual press
            btn.classList.add('is-press');
            setTimeout(function () { btn.classList.remove('is-press'); Retoma.doRetomar(); }, scaled(300));
          }
        }, scaled(800));
      },
      settle: function () { return Desk.isVisible('Documento') && Desk.isVisible('Navegador'); }
    },
    {
      sub: 'La IA propone. Tú decides.',
      hold: 2800,
      act: function () { Retoma.showEndOfDay(); Retoma.openPanel(); },
      until: function () { return document.getElementById('proposalCard') && !document.getElementById('proposalCard').classList.contains('is-hidden'); }
    },
    {
      sub: 'Tu historial es tuyo. Se borra en un gesto.',
      hold: 2600,
      act: function () {
        Retoma.openPanel();
        // scroll to privacy
        var panel = document.getElementById('retomaPanel');
        if (panel) panel.scrollTop = panel.scrollHeight;
        setTimeout(function () {
          Retoma.deleteAll();
        }, scaled(1200));
      },
      settle: function () { return Retoma.state.empty; }
    }
  ];

  function setControls(runningNow) {
    if (el.storyPlay) { el.storyPlay.disabled = runningNow; el.storyPlay.textContent = runningNow ? '▶ En curso' : '▶ Turno guiado'; }
    if (el.storyPause) el.storyPause.disabled = !runningNow;
    if (el.storySkip) el.storySkip.disabled = !runningNow;
    var freeBtns = document.querySelectorAll('#freeMode .btn');
    for (var i = 0; i < freeBtns.length; i++) freeBtns[i].disabled = runningNow;
  }

  function next() {
    if (stepIx >= BEATS.length) { finish(); return; }
    var beat = BEATS[stepIx++];
    var token = runToken;
    say(beat.sub);
    if (beat.act) beat.act();
    if (el.storyClock) el.storyClock.textContent = Retoma.state.currentApp;
    var hold = scaled(beat.hold);
    var deadline = Date.now() + hold + 12000;
    var t0 = Date.now();
    function poll() {
      if (token !== runToken) return;
      if (paused) { waitTimer = setTimeout(poll, 120); return; }
      var held = Date.now() - t0 >= hold;
      var ready = !beat.until || beat.until();
      var settled = !beat.settle || beat.settle();
      if ((held && ready && settled) || Date.now() > deadline) {
        if (beat.after) beat.after();
        next();
        return;
      }
      waitTimer = setTimeout(poll, 60);
    }
    waitTimer = setTimeout(poll, 60);
  }

  function start() {
    stop();
    runToken++;
    resetState();
    running = true;
    paused = false;
    stepIx = 0;
    setControls(true);
    window.__storyDone = false;
    next();
  }
  function stop() {
    runToken++;
    if (waitTimer) { clearTimeout(waitTimer); waitTimer = null; }
    running = false;
  }
  function finish() {
    stop();
    setControls(false);
    el.storyClock.textContent = 'fin';
    window.__storyDone = true;
  }
  function skip() {
    stop();
    setControls(false);
    // jump to end state
    Retoma.state.empty = true;
    Retoma.state.proposalDismissed = true;
    Retoma.setClock(18, 0);
    Retoma.deleteAll();
    Retoma.openPanel();
    say('');
    el.storyClock.textContent = 'fin';
    window.__storyDone = true;
  }
  function togglePause() {
    if (!running) return;
    paused = !paused;
    if (el.storyPause) el.storyPause.textContent = paused ? 'Continuar' : 'Pausar';
  }
  function resetState() {
    Retoma.state.currentApp = 'Documento';
    Retoma.state.currentTitle = 'Informe de calidad (párrafo 3)';
    Retoma.state.timeInCurrent = 0;
    Retoma.state.away = false;
    Retoma.state.awayMinutes = 0;
    Retoma.state.empty = false;
    Retoma.state.proposalDismissed = false;
    Retoma.state.paused = false;
    Retoma.state.timeline = Events.seedTimeline.slice();
    Retoma.setClock(9, 0);
    Retoma.hideResume();
    // restore windows
    Desk.reopen(['Documento','Navegador','WhatsApp','Hoja de cálculo'], false);
    Desk.focus('Documento');
    Retoma.openPanel();
    // reset toggle icon
    var btn = document.getElementById('retomaToggle');
    if (btn) {
      btn.classList.remove('is-paused');
      var o = btn.querySelector('.eye-open'); var c = btn.querySelector('.eye-closed');
      if (o) o.style.display = 'block';
      if (c) c.style.display = 'none';
    }
    var sp = document.getElementById('btnPause');
    if (sp) sp.textContent = 'Pausar';
    window.__storyDone = false;
    say('');
  }

  function mount() {
    el.subtitle = document.getElementById('subtitle');
    el.storyPlay = document.getElementById('storyPlay');
    el.storyPause = document.getElementById('storyPause');
    el.storySkip = document.getElementById('storySkip');
    el.storyRestart = document.getElementById('storyRestart');
    el.storyClock = document.getElementById('storyClock');
    el.freeMode = document.getElementById('freeMode');

    if (el.storyPlay) el.storyPlay.addEventListener('click', start);
    if (el.storyRestart) el.storyRestart.addEventListener('click', resetState);
    if (el.storyPause) el.storyPause.addEventListener('click', togglePause);
    if (el.storySkip) el.storySkip.addEventListener('click', skip);

    // free-mode delegation
    if (el.freeMode) el.freeMode.addEventListener('click', function (ev) {
      var btn = ev.target.closest('[data-act]');
      if (!btn) return;
      var a = btn.getAttribute('data-act');
      if (a === 'switch') Retoma.rotateApp();
      else if (a === 'whatsapp') Retoma.receiveWhatsapp();
      else if (a === 'away') Retoma.goAway(25);
      else if (a === 'return') Retoma.comeBack();
      else if (a === 'endday') Retoma.showEndOfDay();
      else if (a === 'pause') Retoma.togglePause();
      else if (a === 'delete') {
        var ov = document.getElementById('confirmOverlay');
        if (ov) ov.classList.add('is-open');
      }
    });
  }

  return { mount: mount, start: start, reset: resetState, skip: skip };
})();
