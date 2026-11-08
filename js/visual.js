/* visual.js — the small motion layer the app actually calls: entrance,
 * resume-card zoom + chip FLIP, legend count-up, eye blink, tab ink.
 * CSS owns the animations; reduced motion turns them all off. */
var Visual = (function () {
  'use strict';

  var reduced = false;
  var ink = null;

  function each(sel, fn) {
    var els = document.querySelectorAll(sel);
    for (var i = 0; i < els.length; i++) fn(els[i], i);
  }

  function blinkEye() {
    var btn = document.getElementById('retomaToggle');
    if (!btn || reduced) return;
    btn.classList.remove('is-blink');
    void btn.offsetWidth;
    btn.classList.add('is-blink');
    setTimeout(function () { btn.classList.remove('is-blink'); }, 360);
  }

  /* --- entrance: bloom, menu slide, title words staggered --------------- */
  function splitWords(el, baseDelay, step) {
    if (!el) return;
    var text = el.textContent || '';
    el.innerHTML = '';
    text.split(' ').forEach(function (word, i) {
      if (!word) return;
      var s = document.createElement('span');
      s.className = 'w';
      s.textContent = word;
      if (!reduced) s.style.setProperty('--wd', (baseDelay + i * step) + 'ms');
      el.appendChild(s);
      el.appendChild(document.createTextNode(' '));
    });
  }

  function entrance() {
    if (reduced) return;
    var title = document.querySelector('.sim-title');
    splitWords(title, 120, 90);
    document.body.classList.add('is-launch');
    setTimeout(function () { document.body.classList.remove('is-launch'); }, 1300);
  }

  /* --- resume moment: card zoom and chips flipping into place ---------- */
  function resumeZoom(card) {
    if (!card || reduced) return;
    card.classList.remove('is-zoom');
    void card.offsetWidth;
    card.classList.add('is-zoom');
    setTimeout(function () { card.classList.remove('is-zoom'); }, 700);
  }

  function flipChipsIn(root) {
    if (reduced) return;
    var host = root || document.querySelector('#resumeChips');
    if (!host) return;
    var chips = host.querySelectorAll('.resume-chip');
    if (!chips.length) return;
    host.classList.remove('is-flipping');
    for (var i = 0; i < chips.length; i++) {
      chips[i].style.setProperty('--ci', String(i));
    }
    void host.offsetWidth;
    host.classList.add('is-flipping');
    setTimeout(function () { host.classList.remove('is-flipping'); }, 900);
  }

  /* --- end of day: legend minutes count up from zero ------------------- */
  function countUpLegend() {
    if (reduced) return;
    var items = document.querySelectorAll('.timeline-legend__item');
    for (var i = 0; i < items.length; i++) {
      (function (item) {
        var html = item.innerHTML;
        var m = html.match(/·\s*(\d+)\s*min/);
        if (!m) return;
        var final = parseInt(m[1], 10);
        item.innerHTML = html.replace(/·\s*\d+\s*min/, '· <span class="count-up">0</span> min');
        var num = item.querySelector('.count-up');
        if (!num) return;
        var t0 = null;
        function tick(t) {
          if (!t0) t0 = t;
          var k = Math.min((t - t0) / 450, 1);
          var e = 1 - Math.pow(1 - k, 3);
          num.textContent = String(Math.round(final * e));
          if (k < 1) requestAnimationFrame(tick);
          else num.textContent = String(final);
        }
        requestAnimationFrame(tick);
      })(items[i]);
    }
  }

  /* --- magnetic primary buttons (<=6px pull, lerp) --------------------- */
  function magnetic() {
    if (reduced) return;
    var fine = false;
    try { fine = window.matchMedia('(pointer: fine)').matches; } catch (e) { fine = true; }
    if (!fine) return;
    each('.btn--primary', function (btn) {
      var tx = 0, ty = 0, cx = 0, cy = 0, raf = 0;
      function tick() {
        cx += (tx - cx) * 0.18;
        cy += (ty - cy) * 0.18;
        if (Math.abs(tx - cx) < 0.1) cx = tx;
        if (Math.abs(ty - cy) < 0.1) cy = ty;
        btn.style.translate = cx.toFixed(1) + 'px ' + cy.toFixed(1) + 'px';
        if (cx !== tx || cy !== ty) raf = requestAnimationFrame(tick);
        else raf = 0;
      }
      function kick() { if (!raf) raf = requestAnimationFrame(tick); }
      btn.addEventListener('pointermove', function (ev) {
        var r = btn.getBoundingClientRect();
        var ox = ev.clientX - (r.left + r.width / 2);
        var oy = ev.clientY - (r.top + r.height / 2);
        var mag = Math.sqrt(ox * ox + oy * oy) || 1;
        var pull = Math.min(mag / 14, 6);
        tx = Math.round((ox / mag) * pull * 10) / 10;
        ty = Math.round((oy / mag) * pull * 10) / 10;
        kick();
      });
      btn.addEventListener('pointerleave', function () {
        tx = 0; ty = 0; kick();
      });
    });
  }

  /* --- sliding tab ink --- */
  function placeInk() {
    if (!ink) return;
    var active = document.querySelector('.retoma-tabs__btn.is-active');
    var tabs = document.querySelector('.retoma-tabs');
    if (!active || !tabs) return;
    var tr = tabs.getBoundingClientRect();
    var ar = active.getBoundingClientRect();
    ink.style.transform = 'translateX(' + Math.round(ar.left - tr.left) + 'px)';
    ink.style.width = Math.round(ar.width) + 'px';
    ink.style.opacity = '1';
  }

  function armTabs() {
    var tabs = document.querySelector('.retoma-tabs');
    if (!tabs || tabs.querySelector('.retoma-tabs__ink')) return;
    ink = document.createElement('span');
    ink.className = 'retoma-tabs__ink';
    ink.setAttribute('aria-hidden', 'true');
    tabs.appendChild(ink);
    if (window.Retoma && Retoma.switchTab) {
      var orig = Retoma.switchTab;
      Retoma.switchTab = function (name) {
        orig(name);
        requestAnimationFrame(placeInk);
      };
    }
    window.addEventListener('resize', placeInk);
    var panel = document.getElementById('retomaPanel');
    if (panel) {
      panel.addEventListener('transitionend', function (ev) {
        if (ev && ev.propertyName === 'transform') placeInk();
      });
    }
    setTimeout(placeInk, 300);
    setTimeout(placeInk, 900);
  }

  function mount() {
    reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    entrance();
    magnetic();
    armTabs();
  }

  return {
    mount: mount,
    blinkEye: blinkEye,
    placeInk: placeInk,
    resumeZoom: resumeZoom,
    flipChipsIn: flipChipsIn,
    countUpLegend: countUpLegend
  };
})();
