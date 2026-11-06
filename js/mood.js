/* mood.js — the ring is Retoma's character. One shape, six moods, each with a job:
 *   watching  tracking, the ring breathes slowly
 *   thinking  a model is writing the resume line, the arc turns
 *   paused    nothing is watched, the ring sleeps (grey, still)
 *   away      you stepped out, the ring dims
 *   back      the "where you were" card is ready, the mark pings once
 *   accepted  you took the suggestion, a quick wink (transient)
 * The mood is derived from state already on screen (no hooks into retoma.js), written to
 * <html data-mood>, and drawn by css/app.css. Reduced motion keeps the states, drops the motion. */
var Mood = (function () {
  'use strict';

  var THINK_MAX_MS = 9000;
  var current = '';
  var resumeShownAt = 0;
  var winkUntil = 0;

  function el(id) { return document.getElementById(id); }

  function visible(node) {
    return !!node && !node.classList.contains('is-hidden') && getComputedStyle(node).display !== 'none';
  }

  function derive(now) {
    var R = window.Retoma;
    if (!R || !R.state) return 'watching';
    if (now < winkUntil) return 'accepted';
    if (R.isPaused && R.isPaused()) return 'paused';
    var card = el('resumeCard');
    if (card && card.classList.contains('is-visible') && !card.classList.contains('is-hidden')) {
      if (!resumeShownAt) resumeShownAt = now;
      var aiOn = R.state.aiMode && R.state.aiMode !== 'off' && R.state.aiConsent && R.state.aiConsent[R.state.aiMode];
      if (aiOn && !visible(el('resumeAi')) && now - resumeShownAt < THINK_MAX_MS) return 'thinking';
      return 'back';
    }
    resumeShownAt = 0;
    if (R.state.away) return 'away';
    return 'watching';
  }

  function paint() {
    var next = derive(Date.now());
    if (next === current) return;
    current = next;
    document.documentElement.setAttribute('data-mood', next);
  }

  function mount() {
    document.addEventListener('click', function (ev) {
      if (ev.target && ev.target.closest && ev.target.closest('#proposalAccept, #habitAccept')) {
        winkUntil = Date.now() + 700;
        paint();
      }
    }, true);
    paint();
    setInterval(paint, 300);
  }

  return { mount: mount, current: function () { return current; } };
})();
window.Mood = Mood;
