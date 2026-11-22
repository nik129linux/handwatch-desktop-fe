/* login.js — the visual sign-in gate.
 * Retoma has no accounts: this screen is a demo, so any non-empty name and
 * password open the app, and "Continue without an account" always lets you
 * through. The typed name is remembered on this device; the password never
 * leaves the field and is never stored. A reload in the same session skips the
 * gate, a new launch shows it again. */
var Login = (function () {
  'use strict';

  var SESSION_KEY = 'retoma-login-v1';
  var NAME_KEY = 'retoma-login-name-v1';
  var el = {};
  var showing = false;
  var leaving = false;
  var busy = false;
  var revealed = false;
  var errorKind = null;   /* 'both' | 'user' | 'pass' | null */
  var greetName = '';
  var closeFns = [];
  var timers = [];
  var seq = 0;
  var wired = false;

  function isEs() {
    try { return !!(window.I18n && I18n.getLang && I18n.getLang() === 'es'); } catch (e) { return false; }
  }
  /* L(english, spanish): the copy in the active language. */
  function L(en, es) { return isEs() ? es : en; }

  function reduceMotion() {
    try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; }
  }
  function later(fn, ms) { timers.push(window.setTimeout(fn, ms)); }
  function clearTimers() {
    for (var i = 0; i < timers.length; i++) window.clearTimeout(timers[i]);
    timers = [];
  }

  function storedName() {
    try { return (window.localStorage.getItem(NAME_KEY) || '').trim(); } catch (e) { return ''; }
  }
  function saveName(name) {
    try { window.localStorage.setItem(NAME_KEY, name); } catch (e) { /* session only */ }
  }
  function skipThisSession() {
    try { return window.sessionStorage.getItem(SESSION_KEY) === '1'; } catch (e) { return false; }
  }
  function markSession() {
    try { window.sessionStorage.setItem(SESSION_KEY, '1'); } catch (e) { /* noop */ }
  }
  function clearSession() {
    try { window.sessionStorage.removeItem(SESSION_KEY); } catch (e) { /* noop */ }
  }

  /* The app behind the gate is unreachable while the gate is up: inert takes it
   * out of the tab order and out of the accessibility tree at once. */
  function setStageInert(on) {
    if (!el.stage) return;
    try {
      if (on) el.stage.setAttribute('inert', '');
      else el.stage.removeAttribute('inert');
    } catch (e) { /* noop */ }
  }

  /* --- copy ------------------------------------------------------------ */

  function greetingText(name) {
    return isEs() ? 'Hola de nuevo, ' + name : 'Welcome back, ' + name;
  }

  function setGreeting(name) {
    greetName = name || '';
    if (!el.greeting) return;
    if (greetName) {
      el.greeting.textContent = greetingText(greetName);
      el.greeting.hidden = false;
    } else {
      el.greeting.textContent = '';
      el.greeting.hidden = true;
    }
  }

  function errorText(kind) {
    if (kind === 'user') return L('Enter your name or email.', 'Escribe tu nombre o correo.');
    if (kind === 'pass') return L('Enter your password.', 'Escribe tu contraseña.');
    return L('Enter your name or email and your password.', 'Escribe tu nombre o correo y tu contraseña.');
  }

  function paintError() {
    if (!el.error) return;
    el.error.textContent = errorKind ? errorText(errorKind) : '';
  }

  function paintStatic() {
    if (el.submit) el.submit.textContent = busy ? L('Signing in\u2026', 'Entrando\u2026') : L('Sign in', 'Entrar');
    if (el.guest) el.guest.textContent = L('Continue without an account', 'Continuar sin cuenta');
    if (el.reveal) {
      el.reveal.textContent = revealed ? L('Hide', 'Ocultar') : L('Show', 'Mostrar');
      el.reveal.setAttribute('aria-pressed', String(revealed));
    }
  }

  /* --- state ------------------------------------------------------------ */

  function resetForm() {
    var name = storedName();
    revealed = false;
    errorKind = null;
    busy = false;
    if (el.user) {
      el.user.value = name;
      el.user.removeAttribute('aria-invalid');
    }
    if (el.pass) {
      el.pass.value = '';
      el.pass.type = 'password';
      el.pass.removeAttribute('aria-invalid');
    }
    if (el.submit) {
      el.submit.disabled = false;
      el.submit.classList.remove('is-busy');
    }
    if (el.face) el.face.setAttribute('data-mood', 'watching');
    setGreeting(name);
    paintError();
    paintStatic();
  }

  function focusStart() {
    if (!showing) return;
    var name = el.user ? el.user.value.trim() : '';
    var target = name && el.pass ? el.pass : el.user;
    if (target && typeof target.focus === 'function') { try { target.focus(); } catch (e) { /* noop */ } }
  }

  function returnFocus() {
    var target = document.getElementById('tabBtnAhora');
    if (!target || target.offsetParent === null) target = document.body;
    try { if (target && target.focus) target.focus(); } catch (e) { /* noop */ }
  }

  function runClose() {
    var fns = closeFns;
    closeFns = [];
    for (var i = 0; i < fns.length; i++) {
      try { fns[i](); } catch (e) { /* one callback never blocks the rest */ }
    }
  }

  function show() {
    if (!el.screen || showing || leaving) return;
    showing = true;
    busy = false;
    el.screen.classList.remove('is-hidden', 'is-leaving');
    setStageInert(true);
    resetForm();
    later(focusStart, 40);
  }

  function close() {
    if (!showing || leaving) return;
    showing = false;
    leaving = true;
    busy = false;
    seq += 1;
    clearTimers();
    if (el.submit) {
      el.submit.disabled = false;
      el.submit.classList.remove('is-busy');
    }
    /* The flag is written once the gate is really gone, so a reload during the
     * fade still shows it. */
    var done = function () {
      if (!el.screen) return;
      el.screen.classList.add('is-hidden');
      el.screen.classList.remove('is-leaving');
      leaving = false;
      /* The password never outlives the gate, not even in a hidden field. */
      if (el.pass) {
        el.pass.value = '';
        el.pass.type = 'password';
      }
      markSession();
      setStageInert(false);
      returnFocus();
      runClose();
    };
    if (reduceMotion()) { done(); return; }
    el.screen.classList.add('is-leaving');
    later(done, 200);
  }

  /* --- form ------------------------------------------------------------- */

  function clearError() {
    if (!errorKind) return;
    errorKind = null;
    paintError();
    if (el.user) el.user.removeAttribute('aria-invalid');
    if (el.pass) el.pass.removeAttribute('aria-invalid');
  }

  function signIn() {
    busy = true;
    seq += 1;
    var mine = seq;
    if (el.submit) {
      el.submit.disabled = true;
      el.submit.classList.add('is-busy');
    }
    paintStatic();
    later(function () {
      if (mine !== seq || !showing) return;
      if (el.face) el.face.setAttribute('data-mood', 'back');
      later(function () {
        if (mine !== seq || !showing) return;
        busy = false;
        if (el.submit) {
          el.submit.disabled = false;
          el.submit.classList.remove('is-busy');
        }
        close();
      }, 400);
    }, 600);
  }

  function onSubmit(ev) {
    if (ev && ev.preventDefault) ev.preventDefault();
    if (busy || !showing) return;
    var user = el.user ? el.user.value.trim() : '';
    var pass = el.pass ? el.pass.value : '';
    var missing = !user && !pass ? 'both' : (!user ? 'user' : (!pass ? 'pass' : null));
    if (missing) {
      errorKind = missing;
      paintError();
      if (el.user) {
        if (user) el.user.removeAttribute('aria-invalid');
        else el.user.setAttribute('aria-invalid', 'true');
      }
      if (el.pass) {
        if (pass) el.pass.removeAttribute('aria-invalid');
        else el.pass.setAttribute('aria-invalid', 'true');
      }
      var first = !user ? el.user : el.pass;
      if (first && typeof first.focus === 'function') { try { first.focus(); } catch (e) { /* noop */ } }
      return;
    }
    errorKind = null;
    paintError();
    saveName(user);
    signIn();
  }

  function toggleReveal() {
    revealed = !revealed;
    if (el.pass) el.pass.type = revealed ? 'text' : 'password';
    paintStatic();
  }

  /* --- keyboard --------------------------------------------------------- */

  function focusables() {
    if (!el.screen) return [];
    return Array.prototype.filter.call(
      el.screen.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'),
      function (n) { return !n.disabled && n.offsetParent !== null; }
    );
  }

  function onKeydown(ev) {
    if (!showing || leaving) return;
    /* Esc does nothing: this is a gate, and "Continue without an account" is
     * the way out. Capture phase keeps the app's own handlers out of it. */
    if (ev.key === 'Escape') {
      ev.preventDefault();
      ev.stopPropagation();
      return;
    }
    if (ev.key !== 'Tab') return;
    var f = focusables();
    if (!f.length) { ev.preventDefault(); return; }
    var first = f[0];
    var last = f[f.length - 1];
    var inside = el.screen.contains(document.activeElement);
    if (ev.shiftKey && (!inside || document.activeElement === first)) {
      ev.preventDefault();
      last.focus();
    } else if (!ev.shiftKey && (!inside || document.activeElement === last)) {
      ev.preventDefault();
      first.focus();
    }
  }

  /* --- public ----------------------------------------------------------- */

  function onClose(fn) {
    if (typeof fn !== 'function') return;
    if (showing) { closeFns.push(fn); return; }
    fn();
  }

  /* invoker: the control that reopened the gate (Settings > Sign out). Focus
   * still returns to the Now tab on close, so reopening never hides the app. */
  function openLogin(invoker) {
    if (leaving) return;
    if (showing) { focusStart(); return; }
    clearSession();
    show();
  }

  function onLangChange() {
    paintStatic();
    if (greetName) setGreeting(greetName);
    paintError();
  }

  function mount() {
    el.screen = document.getElementById('loginScreen');
    if (!el.screen) return;
    el.form = document.getElementById('loginForm');
    el.user = document.getElementById('loginUser');
    el.pass = document.getElementById('loginPass');
    el.reveal = document.getElementById('loginReveal');
    el.error = document.getElementById('loginError');
    el.submit = document.getElementById('loginSubmit');
    el.guest = document.getElementById('loginGuest');
    el.greeting = document.getElementById('loginGreeting');
    el.face = document.getElementById('loginFace');
    el.stage = document.querySelector('.stage');

    if (!wired) {
      wired = true;
      if (el.form) el.form.addEventListener('submit', onSubmit);
      if (el.guest) el.guest.addEventListener('click', function () { close(); });
      if (el.reveal) el.reveal.addEventListener('click', toggleReveal);
      if (el.user) el.user.addEventListener('input', clearError);
      if (el.pass) el.pass.addEventListener('input', clearError);
      var out = document.getElementById('settingsSignOut');
      if (out) out.addEventListener('click', function () { openLogin(out); });
      document.addEventListener('keydown', onKeydown, true);
      if (window.I18n && I18n.onChange) I18n.onChange(onLangChange);
    }
    paintStatic();
    if (skipThisSession()) {
      el.screen.classList.add('is-hidden');
      setStageInert(false);
      return;
    }
    show();
  }

  return {
    mount: mount,
    open: openLogin,
    isOpen: function () { return showing; },
    onClose: onClose
  };
})();
window.Login = Login;
