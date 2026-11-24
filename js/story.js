/* story.js — guided step-by-step tour */
var Story = (function () {
  'use strict';

  var el = {};
  var running = false;
  var idx = 0;
  var runToken = 0;
  var pending = [];
  var currentComplete = null;

  function trackTimeout(id) { pending.push(id); return id; }
  function trackInterval(id) { pending.push(id); return id; }
  function untrack(id) {
    for (var i = pending.length - 1; i >= 0; i--) {
      if (pending[i] === id) pending.splice(i, 1);
    }
  }
  function clearPending() {
    for (var i = 0; i < pending.length; i++) {
      try { clearTimeout(pending[i]); } catch (e) { /* noop */ }
      try { clearInterval(pending[i]); } catch (e) { /* noop */ }
    }
    pending = [];
    currentComplete = null;
  }

  function say(t) { if (el.subtitle) el.subtitle.textContent = t || ''; }
  function sayWhy(t) { if (el.tourWhy) el.tourWhy.textContent = t || ''; }

  function clearFocus() {
    var on = document.querySelectorAll('.is-tour-focus');
    for (var i = 0; i < on.length; i++) on[i].classList.remove('is-tour-focus');
  }
  function setFocus(sel) {
    clearFocus();
    if (!sel) return;
    var t = document.querySelector(sel);
    if (t) t.classList.add('is-tour-focus');
  }
  function openCard() {
    if (el.tourCard) { el.tourCard.classList.add('is-open'); el.tourCard.setAttribute('aria-hidden', 'false'); }
  }
  function closeCard() {
    if (el.tourCard) { el.tourCard.classList.remove('is-open'); el.tourCard.setAttribute('aria-hidden', 'true'); }
  }

  var STEPS = [
    {
      sub: 'Retoma sees the app in use. Only the name, never what you type.',
      why: 'It reads the app and the window title, so it knows you were in the report without reading the report.',
      target: '.now-hero',
      act: function (fast) {
        Retoma.setClock(9, 0);
        Retoma.state.currentApp = 'Document';
        Retoma.state.currentTitle = 'Quality report (paragraph 3)';
        Retoma.state.timeInCurrent = 0;
        Desk.focus('Document');
        Retoma.openPanel();
        var ln = document.getElementById('leaveNote');
        if (ln) {
          // the note is the user's own words, so it is written in the app's language
          var note = (window.I18n && I18n.t) ? I18n.t('fix the citation in paragraph 3') : 'fix the citation in paragraph 3';
          ln.value = note;
          try { localStorage.setItem('retoma.note.' + (Retoma.isLiveMode() ? 'live' : 'demo'), note); } catch (e) { /* noop */ }
        }
        if (Retoma.switchTab) Retoma.switchTab('ahora');
      }
    },
    {
      sub: 'You were interrupted. It notes it, never judges.',
      why: 'A message pulled you into WhatsApp. Retoma only remembers what you were doing before it.',
      target: '#win-whatsapp',
      act: function (fast) { Retoma.receiveWhatsapp(); }
    },
    {
      sub: 'You stepped away for a while.',
      why: 'The clock jumps 25 minutes. Long enough to lose the thread.',
      target: '#deskClock',
      act: function (fast) {
        Retoma.setClock(9, 0);
        Retoma.goAway(25);
        if (fast) { Retoma.advanceClock(25); return; }
        var token = runToken;
        var done = 0;
        var iv = setInterval(function () {
          if (token !== runToken) { try { clearInterval(iv); } catch (e) {} untrack(iv); return; }
          done++;
          Retoma.advanceClock(1);
          if (done >= 25) { try { clearInterval(iv); } catch (e) {} untrack(iv); currentComplete = null; }
        }, 100);
        trackInterval(iv);
        currentComplete = function () {
          try { clearInterval(iv); } catch (e) {}
          untrack(iv);
          if (done < 25) { Retoma.advanceClock(25 - done); done = 25; }
          currentComplete = null;
        };
      }
    },
    {
      sub: 'When you return, it shows where you left off.',
      why: 'One card with the task, the paragraph and the note you left yourself.',
      target: '#resumeCard',
      act: function (fast) { Retoma.comeBack(); }
    },
    {
      sub: 'One tap and you are back to work.',
      why: 'Resume brings back the three work windows you had open.',
      target: '#retomarBtn',
      act: function (fast) {
        var btn = document.getElementById('retomarBtn');
        if (fast) {
          if (btn) btn.classList.remove('is-press');
          Retoma.doRetomar();
          return;
        }
        var token = runToken;
        var t1 = setTimeout(function () {
          if (token !== runToken) { untrack(t1); return; }
          untrack(t1);
          if (btn) btn.classList.add('is-press');
          var t2 = setTimeout(function () {
            if (token !== runToken) { untrack(t2); return; }
            untrack(t2);
            if (btn) btn.classList.remove('is-press');
            Retoma.doRetomar();
            currentComplete = null;
          }, 300);
          trackTimeout(t2);
        }, 900);
        trackTimeout(t1);
        currentComplete = function () {
          try { clearTimeout(t1); } catch (e) {}
          untrack(t1);
          if (btn) btn.classList.remove('is-press');
          Retoma.doRetomar();
          // clear any second timer if it already got scheduled
          for (var i = pending.length - 1; i >= 0; i--) {
            try { clearTimeout(pending[i]); } catch (e) {}
            try { clearInterval(pending[i]); } catch (e) {}
          }
          pending = [];
          currentComplete = null;
        };
      }
    },
    {
      sub: 'One simple suggestion. You decide.',
      why: 'At the end of the day it proposes one block for tomorrow and shows how it decided.',
      target: '#proposalCard',
      act: function (fast) {
        Retoma.showEndOfDay();
        Retoma.openPanel();
        if (Retoma.switchTab) Retoma.switchTab('hoy');
      }
    },
    {
      sub: 'Your history is yours. Deleted in one gesture.',
      why: 'Everything stays on this device, except what you send to the AI with your permission, and is deleted after 7 days, or right now with one button.',
      target: '#privacyDelete',
      act: function (fast) {
        if (Retoma.switchTab) Retoma.switchTab('priv');
        if (fast) { Retoma.deleteAll(); return; }
        var token = runToken;
        var t = setTimeout(function () {
          if (token !== runToken) { untrack(t); return; }
          untrack(t);
          Retoma.deleteAll();
          currentComplete = null;
        }, 1200);
        trackTimeout(t);
        currentComplete = function () {
          try { clearTimeout(t); } catch (e) {}
          untrack(t);
          Retoma.deleteAll();
          currentComplete = null;
        };
      }
    }
  ];

  function setControls(runningNow) {
    if (el.storyPlay) {
      el.storyPlay.disabled = runningNow;
      var lbl = el.storyPlay.querySelector('.story-play-label');
      if (lbl) lbl.textContent = runningNow ? 'Running' : 'Guided tour';
      else el.storyPlay.textContent = runningNow ? 'Running' : 'Guided tour';
    }
    if (el.storySkip) el.storySkip.disabled = !runningNow;
    var freeBtns = document.querySelectorAll('#freeMode .btn');
    for (var i = 0; i < freeBtns.length; i++) freeBtns[i].disabled = runningNow;
    updateNav();
  }

  function updateNav() {
    if (el.tourBack) el.tourBack.disabled = !running || idx <= 0;
    if (el.tourNext) {
      el.tourNext.disabled = !running;
      var last = idx >= STEPS.length - 1;
      el.tourNext.textContent = last ? 'Finish' : 'Next';
    }
  }

  function showStep(i) {
    runToken++;
    // clear any leftover timers from previous step (should already be empty)
    for (var k = 0; k < pending.length; k++) {
      try { clearTimeout(pending[k]); } catch (e) {}
      try { clearInterval(pending[k]); } catch (e) {}
    }
    pending = [];
    currentComplete = null;
    idx = i;
    var st = STEPS[idx];
    say(st.sub);
    sayWhy(st.why);
    if (el.tourStep) el.tourStep.textContent = (idx + 1) + ' / 7';
    setFocus(st.target);
    openCard();
    updateNav();
    if (st.act) st.act(false);
  }

  function completeCurrentInstantly() {
    if (pending.length && currentComplete) {
      var f = currentComplete;
      currentComplete = null;
      try { f(); } catch (e) { /* noop */ }
    }
    for (var i = 0; i < pending.length; i++) {
      try { clearTimeout(pending[i]); } catch (e) {}
      try { clearInterval(pending[i]); } catch (e) {}
    }
    pending = [];
    currentComplete = null;
  }

  function goNext() {
    if (!running) return;
    completeCurrentInstantly();
    if (idx >= STEPS.length - 1) { finish(); return; }
    showStep(idx + 1);
  }

  function goBack() {
    if (!running || idx <= 0) return;
    var target = idx - 1;
    runToken++;
    for (var i = 0; i < pending.length; i++) {
      try { clearTimeout(pending[i]); } catch (e) {}
      try { clearInterval(pending[i]); } catch (e) {}
    }
    pending = [];
    currentComplete = null;
    clearFocus();
    resetState();
    runToken++;
    for (var k = 0; k < target; k++) {
      try { STEPS[k].act(true); } catch (e) { /* noop */ }
    }
    // drop any timers fast acts may have left (none expected)
    for (var j = 0; j < pending.length; j++) {
      try { clearTimeout(pending[j]); } catch (e) {}
      try { clearInterval(pending[j]); } catch (e) {}
    }
    pending = [];
    currentComplete = null;
    running = true;
    setControls(true);
    showStep(target);
  }

  function start() {
    runToken++;
    for (var i = 0; i < pending.length; i++) {
      try { clearTimeout(pending[i]); } catch (e) {}
      try { clearInterval(pending[i]); } catch (e) {}
    }
    pending = [];
    currentComplete = null;
    resetState();
    running = true;
    window.__storyDone = false;
    setControls(true);
    showStep(0);
  }

  function finish() {
    runToken++;
    for (var i = 0; i < pending.length; i++) {
      try { clearTimeout(pending[i]); } catch (e) {}
      try { clearInterval(pending[i]); } catch (e) {}
    }
    pending = [];
    currentComplete = null;
    running = false;
    clearFocus();
    closeCard();
    setControls(false);
    window.__storyDone = true;
  }

  function skip() {
    runToken++;
    for (var i = 0; i < pending.length; i++) {
      try { clearTimeout(pending[i]); } catch (e) {}
      try { clearInterval(pending[i]); } catch (e) {}
    }
    pending = [];
    currentComplete = null;
    running = false;
    Retoma.state.empty = true;
    Retoma.state.proposalDismissed = true;
    Retoma.setClock(18, 0);
    Retoma.deleteAll();
    Retoma.openPanel();
    say('');
    sayWhy('');
    clearFocus();
    closeCard();
    setControls(false);
    window.__storyDone = true;
  }

  function resetState() {
    Retoma.state.currentApp = 'Document';
    Retoma.state.currentTitle = 'Quality report (paragraph 3)';
    Retoma.state.timeInCurrent = 0;
    Retoma.state.away = false;
    Retoma.state.awayMinutes = 0;
    Retoma.state.empty = false;
    Retoma.state.proposalDismissed = false;
    Retoma.state.paused = false;
    Retoma.state.timeline = Events.seedTimeline.slice();
    Retoma.setClock(9, 0);
    Retoma.hideResume();
    Desk.reopen(['Document', 'Browser', 'WhatsApp', 'Spreadsheet'], false);
    Desk.focus('Document');
    Retoma.openPanel();
    var btn = document.getElementById('retomaToggle');
    if (btn) {
      btn.classList.remove('is-paused');
      btn.setAttribute('aria-pressed', 'false');
      btn.setAttribute('aria-expanded', 'true');
      var o = btn.querySelector('.eye-open'); var c = btn.querySelector('.eye-closed');
      if (o) o.style.display = 'block';
      if (c) c.style.display = 'none';
    }
    var mb = document.getElementById('menuBar');
    if (mb) mb.classList.remove('is-paused');
    var sp = document.getElementById('btnPause');
    if (sp) sp.textContent = 'Pause';
    if (Retoma.switchTab) Retoma.switchTab('ahora');
    window.__storyDone = false;
    say('');
    sayWhy('');
  }

  function fullReset() {
    runToken++;
    for (var i = 0; i < pending.length; i++) {
      try { clearTimeout(pending[i]); } catch (e) {}
      try { clearInterval(pending[i]); } catch (e) {}
    }
    pending = [];
    currentComplete = null;
    running = false;
    clearFocus();
    closeCard();
    resetState();
    setControls(false);
  }

  function onKey(e) {
    if (!running) return;
    var k = e.key;
    if (k !== 'ArrowRight' && k !== 'ArrowLeft') return;
    var a = document.activeElement;
    if (a) {
      var t = (a.tagName || '').toUpperCase();
      if (t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT' || a.isContentEditable) return;
    }
    if (k === 'ArrowRight') { e.preventDefault(); goNext(); }
    else { e.preventDefault(); goBack(); }
  }

  function mount() {
    el.subtitle = document.getElementById('subtitle');
    el.tourWhy = document.getElementById('tourWhy');
    el.tourCard = document.getElementById('tourCard');
    el.tourStep = document.getElementById('tourStep');
    el.tourBack = document.getElementById('tourBack');
    el.tourNext = document.getElementById('tourNext');
    el.storyPlay = document.getElementById('storyPlay');
    el.storySkip = document.getElementById('storySkip');
    el.storyRestart = document.getElementById('storyRestart');
    el.freeMode = document.getElementById('freeMode');

    if (el.storyPlay) el.storyPlay.addEventListener('click', start);
    if (el.storyRestart) el.storyRestart.addEventListener('click', fullReset);
    if (el.storySkip) el.storySkip.addEventListener('click', skip);
    if (el.tourNext) el.tourNext.addEventListener('click', goNext);
    if (el.tourBack) el.tourBack.addEventListener('click', goBack);
    document.addEventListener('keydown', onKey);

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
