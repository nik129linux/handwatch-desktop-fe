/* visual.js — D2 craft layer: entrance, resume moment, timeline scrub/count-up,
   theme circular reveal, magnetic buttons, eye blink, sliding tab ink.
   One smoothed value per input (mostar), word blur-in (space), master ease only. */
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

  /* --- entrance: bloom, menu slide, windows fly staggered 70ms from dock --- */
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

  /* --- resume moment: scrim, zoom from eye, chips FLIP, fly-out, settle --- */
  function eyeCenter() {
    var btn = document.getElementById('retomaToggle');
    if (!btn) return { x: window.innerWidth - 60, y: 20 };
    var r = btn.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  function armResume() {
    if (!window.Retoma) return;
    var origShow = Retoma.showResume;
    Retoma.showResume = function () {
      origShow();
      var ws = document.getElementById('desktopWorkspace');
      if (ws) ws.classList.add('has-resume');
      var card = document.getElementById('resumeCard');
      if (card && !reduced) {
        card.classList.remove('is-zoom');
        void card.offsetWidth;
        card.classList.add('is-zoom');
      }
      blinkEye();
      flipChipsIn();
    };
    var origHide = Retoma.hideResume;
    Retoma.hideResume = function () {
      var ws = document.getElementById('desktopWorkspace');
      if (ws) ws.classList.remove('has-resume');
      origHide();
    };
    var origGo = Retoma.doRetomar;
    Retoma.doRetomar = function () {
      flyChipsOut();
      origGo();
      if (!reduced) {
        setTimeout(function () {
          each('.window--entering', function (w) { w.classList.add('window--settle'); });
          setTimeout(function () {
            each('.window--settle', function (w) { w.classList.remove('window--settle'); });
          }, 700);
        }, 60);
      }
      var ws = document.getElementById('desktopWorkspace');
      if (ws) ws.classList.remove('has-resume');
    };
  }

  function flipChipsIn() {
    if (reduced) return;
    var chips = document.querySelectorAll('.resume-chip');
    var eye = eyeCenter();
    for (var i = 0; i < chips.length; i++) {
      (function (chip, i) {
        var r = chip.getBoundingClientRect();
        var dx = eye.x - (r.left + r.width / 2);
        var dy = eye.y - (r.top + r.height / 2);
        chip.style.transition = 'none';
        chip.style.transform = 'translate(' + Math.round(dx) + 'px,' + Math.round(dy) + 'px) scale(0.5)';
        chip.style.opacity = '0';
        void chip.offsetWidth;
        chip.style.transition = '';
        chip.style.transitionDelay = (i * 70) + 'ms';
        chip.style.transform = '';
        chip.style.opacity = '';
        setTimeout(function () { chip.style.transitionDelay = ''; }, 600 + i * 70);
      })(chips[i], i);
    }
  }

  function flyChipsOut() {
    var card = document.getElementById('resumeCard');
    if (!card || reduced) return;
    var chips = card.querySelectorAll('.resume-chip');
    var wins = ['Document', 'Browser', 'Spreadsheet'];
    for (var i = 0; i < chips.length; i++) {
      (function (chip, i) {
        var app = wins[i % wins.length];
        var target = document.querySelector('.window[data-app="' + app + '"]') ||
          document.querySelector('.dock__item[data-app="' + app + '"]');
        if (!target) return;
        var r = chip.getBoundingClientRect();
        var t = target.getBoundingClientRect();
        var ghost = document.createElement('span');
        ghost.className = 'chip-ghost';
        ghost.textContent = chip.textContent;
        ghost.style.left = Math.round(r.left) + 'px';
        ghost.style.top = Math.round(r.top) + 'px';
        document.body.appendChild(ghost);
        var dx = (t.left + t.width / 2) - (r.left + r.width / 2);
        var dy = (t.top + t.height / 2) - (r.top + r.height / 2);
        ghost.style.transitionDelay = (i * 70) + 'ms';
        requestAnimationFrame(function () {
          requestAnimationFrame(function () {
            ghost.style.transform = 'translate(' + Math.round(dx) + 'px,' + Math.round(dy) + 'px) scale(0.6)';
            ghost.style.opacity = '0';
          });
        });
        setTimeout(function () { if (ghost.parentNode) ghost.parentNode.removeChild(ghost); }, 700 + i * 70);
      })(chips[i], i);
    }
  }

  /* --- timeline: count-up minutes + hover scrub rule --- */
  var countArmed = false;

  function armTimeline() {
    if (!window.Retoma) return;
    var origEnd = Retoma.showEndOfDay;
    Retoma.showEndOfDay = function () {
      countArmed = !reduced;
      origEnd();
      countArmed = false;
    };
    var origRender = Retoma.renderTimeline;
    Retoma.renderTimeline = function () {
      origRender();
      if (countArmed) countUpLegend();
    };
    var bar = document.getElementById('timelineBar');
    if (bar && !bar.parentElement.querySelector('.timeline-scrub')) {
      var scrub = document.createElement('div');
      scrub.className = 'timeline-scrub';
      scrub.setAttribute('aria-hidden', 'true');
      bar.appendChild(scrub);
      var read = document.createElement('div');
      read.className = 'timeline-readout';
      read.setAttribute('aria-hidden', 'true');
      bar.appendChild(read);
      bar.addEventListener('pointermove', function (ev) {
        if (reduced) return;
        var r = bar.getBoundingClientRect();
        var x = ev.clientX - r.left;
        var segs = bar.querySelectorAll('.timeline-bar__seg');
        if (!segs.length) return;
        var frac = Math.min(Math.max(x / r.width, 0), 1);
        scrub.style.opacity = '1';
        scrub.style.transform = 'translateX(' + Math.round(x) + 'px)';
        var acc = 0;
        var total = 0;
        var data = window.Retoma && Retoma.state ? ((Retoma.isLiveMode && Retoma.isLiveMode() ? Retoma.state.liveTimeline : Retoma.state.timeline) || []) : [];
        for (var i = 0; i < data.length; i++) total += data[i].duration;
        var walked = 0;
        var label = '';
        for (var j = 0; j < segs.length; j++) {
          var w = segs[j].getBoundingClientRect().width;
          if (x <= walked + w && data[j]) {
            label = data[j].app + ' · ' + data[j].duration + ' min';
            break;
          }
          walked += w;
        }
        acc = Math.round(frac * total);
        read.textContent = (label ? label + ' — ' : '') + acc + ' min in';
        read.style.opacity = '1';
        read.style.transform = 'translateX(' + Math.round(Math.min(Math.max(x - 60, 0), r.width - 130)) + 'px)';
      });
      bar.addEventListener('pointerleave', function () {
        scrub.style.opacity = '0';
        read.style.opacity = '0';
      });
    }
  }

  function countUpLegend() {
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

  /* --- theme: View Transitions circular reveal from the toggle --- */
  function armTheme() {
    if (!window.Theme) return;
    var origApply = Theme.apply;
    Theme.apply = function (name, animate) {
      if (!animate || reduced || !document.startViewTransition) {
        origApply(name, animate);
        return;
      }
      var btn = document.getElementById('themeToggle');
      var r = btn ? btn.getBoundingClientRect() : { left: window.innerWidth - 60, top: 12, width: 32, height: 22 };
      var x = r.left + r.width / 2;
      var y = r.top + r.height / 2;
      var maxR = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
      try {
        var tr = document.startViewTransition(function () { origApply(name, false); });
        tr.ready.then(function () {
          document.documentElement.animate(
            { clipPath: ['circle(0px at ' + x + 'px ' + y + 'px)', 'circle(' + Math.round(maxR) + 'px at ' + x + 'px ' + y + 'px)'] },
            { duration: 420, easing: 'cubic-bezier(0.16,1,0.3,1)', pseudoElement: '::view-transition-new(root)' }
          );
        });
      } catch (e) { origApply(name, true); }
    };
  }

  /* --- magnetic primary buttons (<=6px pull, lerp) --- */
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
    // the panel scales while opening; re-seat the ink once it lands.
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
    armResume();
    armTimeline();
    armTheme();
    magnetic();
    armTabs();
    if (window.Retoma && Retoma.togglePause) {
      var origPause = Retoma.togglePause;
      Retoma.togglePause = function () {
        origPause();
        blinkEye();
        if (window.Presence) {
          if (Retoma.isPaused()) Presence.freeze();
          else Presence.thaw();
        }
      };
    }
  }

  return { mount: mount, blinkEye: blinkEye, placeInk: placeInk };
})();
