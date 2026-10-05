/* desk.js — simulated windows: focus, minimize, reopen */
var Desk = (function () {
  'use strict';

  var windows = {};
  var focused = 'Documento';

  function mount() {
    initParallax();
    var els = document.querySelectorAll('.window');
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      var app = el.getAttribute('data-app');
      windows[app] = el;
      el.addEventListener('click', (function (a) {
        return function () { focus(a); };
      })(app));
    }
    var dockItems = document.querySelectorAll('.dock__item');
    for (var j = 0; j < dockItems.length; j++) {
      dockItems[j].addEventListener('click', function () {
        var a = this.getAttribute('data-app');
        toggleMinimize(a);
      });
    }
    // window bar close/minimize dot
    var dots = document.querySelectorAll('.window__dot--close');
    for (var k = 0; k < dots.length; k++) {
      dots[k].addEventListener('click', function (ev) {
        ev.stopPropagation();
        var w = this.closest('.window');
        var a2 = w.getAttribute('data-app');
        minimize(a2);
      });
    }
    focus(focused);
  }

  function focus(app) {
    focused = app;
    Object.keys(windows).forEach(function (key) {
      windows[key].classList.toggle('is-focused', key === app);
    });
    document.querySelectorAll('.dock__item').forEach(function (d) {
      d.classList.toggle('is-active', d.getAttribute('data-app') === app);
    });
    // bring to front via z-index
    var maxZ = 10;
    Object.keys(windows).forEach(function (key) {
      windows[key].style.zIndex = key === app ? String(maxZ + 1) : String(maxZ);
    });
  }

  function minimize(app) {
    var el = windows[app];
    if (!el) return;
    el.classList.add('is-minimized');
    el.classList.remove('is-focused');
    var dock = document.querySelector('.dock__item[data-app="' + app + '"]');
    if (dock) dock.classList.add('is-hidden-app');
  }

  function restore(app) {
    var el = windows[app];
    if (!el) return;
    el.classList.remove('is-minimized', 'is-hidden');
    el.classList.remove('is-hidden');
    var dock = document.querySelector('.dock__item[data-app="' + app + '"]');
    if (dock) dock.classList.remove('is-hidden-app');
  }

  function reopen(apps, staggered) {
    var delay = 0;
    apps.forEach(function (app) {
      var el = windows[app];
      if (!el) return;
      el.classList.remove('is-minimized', 'is-hidden');
      el.classList.remove('window--entering');
      void el.offsetWidth;
      if (staggered) {
        // fly-in origin: vector from window center to its dock icon
        var dockEl = document.querySelector('.dock__item[data-app="' + app + '"]');
        if (dockEl && dockEl.getBoundingClientRect().width) {
          var wr = el.getBoundingClientRect();
          var dr = dockEl.getBoundingClientRect();
          if (wr.width) {
            el.style.setProperty('--fx', Math.round((dr.left + dr.width / 2) - (wr.left + wr.width / 2)) + 'px');
            el.style.setProperty('--fy', Math.round((dr.top + dr.height / 2) - (wr.top + wr.height / 2)) + 'px');
          }
        }
        el.style.setProperty('--d', delay + 'ms');
        el.style.animationDelay = delay + 'ms';
        el.classList.add('window--entering');
        delay += 60;
      } else {
        el.style.removeProperty('--fx');
        el.style.removeProperty('--fy');
        el.style.animationDelay = '';
        el.classList.add('window--entering');
      }
      var dock = document.querySelector('.dock__item[data-app="' + app + '"]');
      if (dock) dock.classList.remove('is-hidden-app');
    });
    if (apps.length) focus(apps[0]);
    if (window.Retoma && window.Retoma.syncDesktopLayout) {
      setTimeout(function () { window.Retoma.syncDesktopLayout(); }, 10);
    }
  }

  function toggleMinimize(app) {
    var el = windows[app];
    if (!el) return;
    if (el.classList.contains('is-minimized') || el.classList.contains('is-hidden')) {
      restore(app);
      focus(app);
    } else {
      minimize(app);
    }
  }

  function initParallax() {
    var ws = document.getElementById('desktopWorkspace');
    if (!ws) return;
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var fine = window.matchMedia && window.matchMedia('(pointer: fine)').matches;
    if (reduce || !fine || window.innerWidth < 901) return;
    var tx = 0, ty = 0, cx = 0, cy = 0, raf = 0;
    function tick() {
      cx += (tx - cx) * 0.08;
      cy += (ty - cy) * 0.08;
      if (Math.abs(tx - cx) < 0.05) cx = tx;
      if (Math.abs(ty - cy) < 0.05) cy = ty;
      ws.style.setProperty('--px', cx.toFixed(2));
      ws.style.setProperty('--py', cy.toFixed(2));
      if (cx !== tx || cy !== ty) raf = requestAnimationFrame(tick);
      else raf = 0;
    }
    document.addEventListener('pointermove', function (ev) {
      if (window.innerWidth < 901) return;
      var r = ws.getBoundingClientRect();
      if (ev.clientX < r.left || ev.clientX > r.right || ev.clientY < r.top || ev.clientY > r.bottom) return;
      tx = Math.max(-10, Math.min(10, ((ev.clientX - r.left) / r.width - 0.5) * 20));
      ty = Math.max(-10, Math.min(10, ((ev.clientY - r.top) / r.height - 0.5) * 20));
      if (!raf) raf = requestAnimationFrame(tick);
    });
  }

  function isVisible(app) {
    var el = windows[app];
    if (!el) return false;
    return !el.classList.contains('is-minimized') && !el.classList.contains('is-hidden');
  }

  function visibleApps() {
    return Object.keys(windows).filter(function (k) { return isVisible(k); });
  }

  function hideAll() {
    Object.keys(windows).forEach(function (k) { windows[k].classList.add('is-hidden'); });
  }

  return { mount: mount, focus: focus, minimize: minimize, restore: restore, reopen: reopen, isVisible: isVisible, visibleApps: visibleApps, hideAll: hideAll, getFocused: function () { return focused; } };
})();
