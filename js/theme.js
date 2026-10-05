/* theme.js — light/dark switch. Default = prefers-color-scheme, persisted in localStorage. */
var Theme = (function () {
  'use strict';

  var KEY = 'retoma-theme';
  var reduceMotion = false;

  function stored() {
    try { return window.localStorage.getItem(KEY); } catch (e) { return null; }
  }

  function persist(name) {
    try { window.localStorage.setItem(KEY, name); } catch (e) { /* private mode: stay session-only */ }
  }

  function system() {
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) return 'light';
    return 'dark';
  }

  function current() {
    return document.documentElement.getAttribute('data-theme') || 'dark';
  }

  function paint(btn, name) {
    var sun = btn ? btn.querySelector('.theme-icon-sun') : null;
    var moon = btn ? btn.querySelector('.theme-icon-moon') : null;
    if (sun && moon) {
      var isLight = name === 'light';
      sun.style.display = isLight ? 'none' : 'block';
      moon.style.display = isLight ? 'block' : 'none';
    }
    if (btn) btn.setAttribute('aria-pressed', String(name === 'light'));
  }

  function apply(name, animate) {
    document.documentElement.setAttribute('data-theme', name);
    var btn = document.getElementById('themeToggle');
    paint(btn, name);
    if (animate && !reduceMotion) {
      var root = document.documentElement;
      root.classList.add('theme-anim');
      setTimeout(function () { root.classList.remove('theme-anim'); }, 360);
    }
  }

  function toggle() {
    var next = current() === 'light' ? 'dark' : 'light';
    apply(next, true);
    persist(next);
    return next;
  }

  function mount() {
    reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    var name = stored() || system();
    if (name !== 'light' && name !== 'dark') name = 'dark';
    apply(name, false);
    var btn = document.getElementById('themeToggle');
    if (btn) btn.addEventListener('click', function (ev) { ev.stopPropagation(); toggle(); });
    // hook for Electron accelerators / tests
    window.__toggleTheme = toggle;
    window.__getTheme = current;
  }

  return { mount: mount, toggle: toggle, current: current, apply: apply };
})();
