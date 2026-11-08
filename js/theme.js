/* theme.js — light / dark / system. Light is the product default for a fresh
 * profile, whatever the OS asks for. The choice is persisted and shared with
 * the Settings screen; the titlebar button stays as a light/dark shortcut. */
var Theme = (function () {
  'use strict';

  var KEY = 'retoma-theme';
  var mode = 'light';
  var reduceMotion = false;
  var listeners = [];
  var media = null;

  function stored() {
    try { return window.localStorage.getItem(KEY); } catch (e) { return null; }
  }

  function persist(name) {
    try { window.localStorage.setItem(KEY, name); } catch (e) { /* private mode: stay session-only */ }
  }

  function system() {
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';
    return 'light';
  }

  function resolve(name) {
    return name === 'system' ? system() : (name === 'dark' ? 'dark' : 'light');
  }

  function current() {
    return document.documentElement.getAttribute('data-theme') || 'light';
  }

  function getMode() { return mode; }

  function emit() {
    for (var i = 0; i < listeners.length; i++) {
      try { listeners[i](mode, current()); } catch (e) { /* one listener never blocks the rest */ }
    }
  }

  function onChange(fn) {
    if (typeof fn === 'function') listeners.push(fn);
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
    var eff = resolve(name);
    document.documentElement.setAttribute('data-theme', eff);
    document.documentElement.setAttribute('data-theme-mode', name);
    var btn = document.getElementById('themeToggle');
    paint(btn, eff);
    if (animate && !reduceMotion) {
      var root = document.documentElement;
      root.classList.add('theme-anim');
      setTimeout(function () { root.classList.remove('theme-anim'); }, 360);
    }
  }

  function setMode(next) {
    if (next !== 'light' && next !== 'dark' && next !== 'system') return;
    mode = next;
    persist(next);
    apply(mode, true);
    emit();
  }

  /* Titlebar shortcut: flips the effective theme and stores an explicit choice. */
  function toggle() {
    setMode(current() === 'light' ? 'dark' : 'light');
    return current();
  }

  function mount() {
    reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    var name = stored();
    if (name !== 'light' && name !== 'dark' && name !== 'system') name = 'light';
    mode = name;
    apply(mode, false);
    var btn = document.getElementById('themeToggle');
    if (btn) btn.addEventListener('click', function (ev) { ev.stopPropagation(); toggle(); });
    /* System mode follows the OS live, without a reload. */
    try {
      media = window.matchMedia('(prefers-color-scheme: dark)');
      var onSystem = function () { if (mode === 'system') { apply(mode, false); emit(); } };
      if (media.addEventListener) media.addEventListener('change', onSystem);
      else if (media.addListener) media.addListener(onSystem);
    } catch (e) { /* static theme */ }
    emit();
    // hook for Electron accelerators / tests
    window.__toggleTheme = toggle;
    window.__getTheme = current;
    window.__getThemeMode = getMode;
  }

  return { mount: mount, toggle: toggle, current: current, apply: apply, setMode: setMode, getMode: getMode, resolve: resolve, onChange: onChange };
})();
