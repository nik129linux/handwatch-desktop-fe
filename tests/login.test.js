/* tests/login.test.js — the visual login gate.
 * Contract:
 *   A fresh session shows the login in Spanish, as a real modal (role=dialog,
 *   aria-modal), with the app behind it inert.
 *   An empty submit explains what is missing and marks the field invalid; any
 *   name and password are accepted (Retoma has no accounts).
 *   Closing the gate, by signing in or with "Continue without an account",
 *   hands the screen to the level-1 welcome guide.
 *   A reload in the same session skips the gate; a new session shows it again.
 *   The name is remembered on this device; the password never is.
 *   Tab is trapped, Esc does nothing, Sign out in Settings brings it back.
 *   No English in Spanish and no Spanish in English; targets are >= 44px; text
 *   contrast >= 4.5 in both themes; no horizontal scroll at 390px.
 * Run with: node tests/login.test.js */
'use strict';

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..');
const INDEX = pathToFileURL(path.join(ROOT, 'index.html')).href;
const SHOTS = path.join(ROOT, 'shots');

let passed = 0;
let failed = 0;
function ok(cond, name, detail) {
  if (cond) { passed++; console.log('  ok ' + name); }
  else { failed++; console.log('  FAIL ' + name + (detail ? '\n       ' + String(detail).slice(0, 600) : '')); }
}

async function boot(page) {
  await page.goto(INDEX, { waitUntil: 'load' });
  await page.waitForFunction(() => window.Retoma && !document.body.classList.contains('is-launch'), null, { timeout: 10000 });
  await page.waitForTimeout(450);
}

/* Every scenario gets its own context: a fresh profile and a fresh session. */
async function fresh(browser, opts) {
  const o = opts || {};
  const ctx = await browser.newContext(Object.assign({ viewport: { width: 1440, height: 900 }, locale: 'en-US' }, o.ctx || {}));
  if (o.init) await ctx.addInitScript(o.init);
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  page.errs = errs;
  return { ctx, page };
}

const txt = (page, sel) => page.locator(sel).first().innerText().then(t => t.trim().replace(/\s+/g, ' '));

/* Words that are English copy in this app (same lists as settings-guide.test.js,
 * with the login's own words added). App names, numbers and the person's own
 * name are data, and <code> / [data-i18n-skip] are data too. */
const ENGLISH = new RegExp('\\b(' + [
  'start', 'delete', 'everything', 'suggestion', 'planned', 'resume', 'switch', 'pause',
  'tracking', 'helper', 'minutes', 'only', 'window', 'title', 'guided', 'mode', 'step',
  'next', 'history', 'device', 'accept', 'interrupted', 'longest', 'block', 'report',
  'settings', 'language', 'theme', 'light', 'dark', 'system', 'help', 'guide',
  'permission', 'requests', 'left', 'connected', 'thinking', 'testing', 'adjust',
  'send', 'cancel', 'allow', 'privacy', 'records', 'days', 'document', 'browser',
  'spreadsheet', 'needs', 'reachable', 'test', 'off',
  'sign in', 'password', 'account', 'email', 'show', 'hide', 'stored'
].join('|') + ')\\b', 'i');

const SPANISH = new RegExp('\\b(' + [
  'agregar', 'borrar', 'pausar', 'reanudar', 'siguiente', 'atrás', 'saltar', 'idioma',
  'tema', 'configuración', 'ayuda', 'guía', 'privacidad', 'hoy', 'ahora', 'sugerencia',
  'retomar', 'informe', 'bloque', 'minutos', 'disponibles', 'apagada', 'activada',
  'permiso', 'enviar', 'probar', 'pensando', 'conectado', 'navegador', 'documento',
  'hoja', 'cálculo', 'guardado', 'entendido', 'empezar', 'terminar', 'ausencia',
  'seguimiento', 'ventana', 'ventanas', 'títulos', 'nunca', 'siempre', 'tarea',
  'entrar', 'contraseña', 'nombre', 'cuenta', 'mostrar', 'ocultar', 'correo', 'sesión'
].join('|') + ')\\b', 'i');

function visibleText(page, re) {
  return page.evaluate(({ src, flags }) => {
    const re2 = new RegExp(src, flags);
    const out = [];
    const root = document.querySelector('#loginScreen');
    if (!root) return out;
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = w.nextNode())) {
      const t = n.nodeValue.trim();
      if (!t || !re2.test(t)) continue;
      const el = n.parentElement;
      if (!el || el.closest('[data-i18n-skip]') || el.closest('script,style,code')) continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || el.closest('[hidden],.is-hidden,[inert]')) continue;
      const box = el.getBoundingClientRect();
      if (!box.width || !box.height) continue;
      out.push(t.slice(0, 100));
    }
    return out;
  }, { src: re.source, flags: re.flags });
}

async function scanLogin(page, label, re) {
  const hits = await visibleText(page, re);
  ok(hits.length === 0, label + ' has no unwanted words', hits.join('  //  '));
}

function contrastRatio(page, sel) {
  return page.evaluate((f) => {
    function parse(c) {
      const m = (c || '').match(/rgba?\(([^)]+)\)/);
      if (!m) return null;
      const p = m[1].split(',').map(x => parseFloat(x));
      return { rgb: p.slice(0, 3), a: p.length > 3 ? p[3] : 1 };
    }
    function lum(c) {
      const v = c.map(x => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); });
      return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
    }
    const el = document.querySelector(f);
    if (!el) return 0;
    const fg = parse(getComputedStyle(el).color);
    let node = el;
    let back = null;
    while (node) {
      const p = parse(getComputedStyle(node).backgroundColor);
      if (p && p.a > 0.9) { back = p.rgb; break; }
      node = node.parentElement;
    }
    if (!fg) return 0;
    if (!back) back = [255, 255, 255];
    const a = lum(fg.rgb);
    const z = lum(back);
    return (Math.max(a, z) + 0.05) / (Math.min(a, z) + 0.05);
  }, sel);
}

async function dismissTipIfAny(page) {
  if (await page.evaluate(() => !document.getElementById('coachTip').classList.contains('is-hidden'))) {
    await page.click('#coachTipClose');
    await page.waitForTimeout(100);
  }
}

const loginHidden = page => page.evaluate(() => document.getElementById('loginScreen').classList.contains('is-hidden'));
const gateInert = page => page.evaluate(() => {
  const stage = document.querySelector('.stage');
  return !!(stage && stage.hasAttribute('inert'));
});
const activeId = page => page.evaluate(() => document.activeElement && document.activeElement.id);

(async () => {
  const browser = await chromium.launch();

  /* --- (a) a fresh session shows the gate ------------------------------ */
  console.log('login: fresh launch');
  const a = await fresh(browser);
  await boot(a.page);
  ok(!(await loginHidden(a.page)), 'a fresh launch shows the login');
  ok(await a.page.locator('#loginScreen[role="dialog"]').getAttribute('aria-modal') === 'true', 'the login is a modal dialog');
  ok(await a.page.evaluate(() => document.documentElement.lang) === 'es', 'it opens in Spanish');
  ok(await txt(a.page, '#loginSubmit') === 'Entrar', 'the submit reads Entrar', await txt(a.page, '#loginSubmit'));
  ok(await txt(a.page, '#loginTitle') === 'Retoma donde lo dejaste', 'the title is Spanish', await txt(a.page, '#loginTitle'));
  ok(await txt(a.page, '#loginGuest') === 'Continuar sin cuenta', 'it offers a way out without an account');
  ok(await gateInert(a.page), 'the app behind the gate is inert');
  ok(await activeId(a.page) === 'loginUser', 'focus starts on the name field');
  ok(a.page.errs.length === 0, 'no console errors on launch', a.page.errs.join(' | '));

  /* the password reveal */
  await a.page.fill('#loginPass', 'abc');
  await a.page.click('#loginReveal');
  ok(await a.page.locator('#loginPass').getAttribute('type') === 'text', 'Mostrar reveals the password');
  ok(await a.page.locator('#loginReveal').getAttribute('aria-pressed') === 'true', 'the reveal is pressed while the password shows');
  ok(await txt(a.page, '#loginReveal') === 'Ocultar', 'the reveal reads Ocultar when shown');
  await a.page.click('#loginReveal');
  ok(await a.page.locator('#loginPass').getAttribute('type') === 'password', 'Ocultar hides it again');
  ok(await a.page.locator('#loginReveal').getAttribute('aria-pressed') === 'false', 'the reveal is released again');
  await a.page.fill('#loginPass', '');

  /* --- (b) an empty submit explains what is missing -------------------- */
  console.log('login: empty submit');
  await a.page.click('#loginSubmit');
  await a.page.waitForTimeout(150);
  const errText = await txt(a.page, '#loginError');
  ok(errText.length > 5, 'the empty submit shows an error', errText);
  ok(await a.page.locator('#loginError').getAttribute('role') === 'alert', 'the error is a role=alert');
  ok(/contraseña/.test(errText), 'the error is in Spanish', errText);
  ok(await a.page.locator('#loginUser').getAttribute('aria-invalid') === 'true', 'the empty name is aria-invalid');
  ok(await a.page.locator('#loginPass').getAttribute('aria-invalid') === 'true', 'the empty password is aria-invalid');
  ok(await activeId(a.page) === 'loginUser', 'focus moves to the first empty field');
  await a.page.fill('#loginUser', 'Ana');
  await a.page.waitForTimeout(120);
  ok((await txt(a.page, '#loginError')) === '', 'typing clears the error');
  ok(await a.page.locator('#loginUser').getAttribute('aria-invalid') === null, 'typing clears aria-invalid');
  await a.page.fill('#loginPass', '');
  await a.page.click('#loginSubmit');
  await a.page.waitForTimeout(150);
  ok((await txt(a.page, '#loginError')) === 'Escribe tu contraseña.', 'a missing password gets the per-field message', await txt(a.page, '#loginError'));
  ok(await a.page.locator('#loginUser').getAttribute('aria-invalid') === null, 'the filled field is not marked invalid');
  await a.ctx.close();

  /* --- (c) a valid sign-in closes the gate, then the welcome ----------- */
  console.log('login: valid sign-in');
  const c = await fresh(browser);
  await boot(c.page);
  await c.page.fill('#loginUser', 'Ana');
  await c.page.fill('#loginPass', 'demo1234');
  await c.page.click('#loginSubmit');
  await c.page.waitForTimeout(160);
  ok((await txt(c.page, '#loginSubmit')) === 'Entrando…', 'the button reads Entrando… while it works', await txt(c.page, '#loginSubmit'));
  ok(await c.page.locator('#loginSubmit').isDisabled(), 'the submit is disabled while it works');
  await c.page.waitForTimeout(2200);
  ok(await loginHidden(c.page), 'a valid sign-in closes the login');
  ok(await c.page.evaluate(() => document.getElementById('loginFace').getAttribute('data-mood')) === 'back', 'the face smiles on the way out');
  ok(!(await gateInert(c.page)), 'the app is reachable again');
  await c.page.waitForFunction(() => !document.getElementById('guideOverlay').classList.contains('is-hidden'), null, { timeout: 3000 });
  ok(true, 'the level-1 guide opens after the gate');
  ok(await c.page.evaluate(() => !!document.getElementById('guideOverlay').contains(document.activeElement)), 'the guide takes focus from the login');
  ok(c.page.errs.length === 0, 'no console errors through the sign-in', c.page.errs.join(' | '));
  await c.ctx.close();

  /* --- (d) Continue without an account -------------------------------- */
  console.log('login: continue without an account');
  const d = await fresh(browser);
  await boot(d.page);
  await d.page.click('#loginGuest');
  await d.page.waitForTimeout(400);
  ok(await loginHidden(d.page), 'Continue without an account closes the login at once');
  ok(!(await gateInert(d.page)), 'the app is reachable again');
  await d.page.waitForFunction(() => !document.getElementById('guideOverlay').classList.contains('is-hidden'), null, { timeout: 3000 });
  ok(true, 'the guide opens after the guest path too');
  await d.ctx.close();

  /* --- (e) one gate per session --------------------------------------- */
  console.log('login: one gate per session');
  const e = await fresh(browser);
  await boot(e.page);
  await e.page.click('#loginGuest');
  await e.page.waitForFunction(() => document.getElementById('loginScreen').classList.contains('is-hidden'), null, { timeout: 3000 });
  await e.page.reload({ waitUntil: 'load' });
  await e.page.waitForFunction(() => window.Retoma && !document.body.classList.contains('is-launch'), null, { timeout: 10000 });
  await e.page.waitForTimeout(500);
  ok(await loginHidden(e.page), 'a reload in the same session does not show the login again');
  const e2 = await fresh(browser);
  await boot(e2.page);
  ok(!(await loginHidden(e2.page)), 'a new session shows the login again');
  await e2.ctx.close();
  await e.ctx.close();

  /* --- (f) the name stays, the password never does --------------------- */
  console.log('login: what is remembered');
  const f = await fresh(browser);
  await boot(f.page);
  await f.page.fill('#loginUser', 'Ana Restrepo');
  await f.page.fill('#loginPass', 'secreto-123');
  await f.page.click('#loginSubmit');
  await f.page.waitForFunction(() => document.getElementById('loginScreen').classList.contains('is-hidden'), null, { timeout: 4000 });
  const store = await f.page.evaluate(() => {
    const dump = (s) => {
      const out = [];
      for (let i = 0; i < s.length; i++) { const k = s.key(i); out.push(k + '=' + s.getItem(k)); }
      return out;
    };
    return { local: dump(localStorage), session: dump(sessionStorage), dom: document.documentElement.outerHTML };
  });
  ok(store.local.some(x => x.indexOf('retoma-login-name-v1=Ana Restrepo') === 0), 'the name is remembered on this device', store.local.join(' | '));
  ok(!/secreto-123/.test(JSON.stringify(store)), 'the password never reaches localStorage, sessionStorage or the DOM');
  ok(await f.page.locator('#loginPass').inputValue() === '', 'the gate forgets the password on the way out');
  await f.ctx.close();

  const f2 = await fresh(browser, { init: () => { try { localStorage.setItem('retoma-login-name-v1', 'Ana Restrepo'); } catch (err) { /* ignore */ } } });
  await boot(f2.page);
  ok(await f2.page.inputValue('#loginUser') === 'Ana Restrepo', 'a remembered name prefills the field');
  ok(await f2.page.locator('#loginGreeting').isVisible(), 'the greeting is visible');
  ok((await txt(f2.page, '#loginGreeting')).indexOf('Ana Restrepo') !== -1, 'the greeting names the person back', await txt(f2.page, '#loginGreeting'));
  ok(await activeId(f2.page) === 'loginPass', 'focus starts on the password field when the name is known');
  await f2.page.click('.login__tools .lang-switch__btn[data-lang="en"]');
  await f2.page.waitForTimeout(300);
  ok(/Welcome back, Ana Restrepo/.test(await txt(f2.page, '#loginGreeting')), 'the greeting follows the language', await txt(f2.page, '#loginGreeting'));
  await f2.ctx.close();

  /* --- (g) Tab is trapped, Esc does nothing --------------------------- */
  console.log('login: keyboard');
  const g = await fresh(browser);
  await boot(g.page);
  const forward = [];
  for (let i = 0; i < 10; i++) {
    await g.page.keyboard.press('Tab');
    forward.push(await g.page.evaluate(() => !!document.getElementById('loginScreen').contains(document.activeElement)));
  }
  ok(forward.every(Boolean), 'Tab stays inside the login', JSON.stringify(forward));
  const backward = [];
  for (let i = 0; i < 6; i++) {
    await g.page.keyboard.press('Shift+Tab');
    backward.push(await g.page.evaluate(() => !!document.getElementById('loginScreen').contains(document.activeElement)));
  }
  ok(backward.every(Boolean), 'Shift+Tab stays inside the login', JSON.stringify(backward));
  await g.page.keyboard.press('Escape');
  await g.page.waitForTimeout(300);
  ok(!(await loginHidden(g.page)), 'Esc does not close the gate');
  ok(await g.page.evaluate(() => !!document.querySelector('.stage[inert]')), 'Esc keeps the app inert');
  await g.ctx.close();

  /* --- (h) Sign out in Settings reopens the gate ---------------------- */
  console.log('login: Sign out in Settings');
  const h = await fresh(browser);
  await boot(h.page);
  await h.page.click('#loginGuest');
  await h.page.waitForTimeout(400);
  if (!(await h.page.evaluate(() => document.getElementById('guideOverlay').classList.contains('is-hidden')))) {
    await h.page.keyboard.press('Escape');
    await h.page.waitForTimeout(250);
  }
  await dismissTipIfAny(h.page);
  await h.page.click('#tabBtnConfig');
  await h.page.waitForTimeout(250);
  await dismissTipIfAny(h.page);
  const settings = await txt(h.page, '#retomaTabConfig');
  ok(/Cuenta/.test(settings) && /Cerrar sesión/.test(settings), 'Settings has an Account group with Cerrar sesión', settings.slice(0, 400));
  ok(/Sesión de demostración/.test(settings), 'the group says the session is a demo', settings.slice(0, 400));
  await h.page.click('#settingsSignOut');
  await h.page.waitForTimeout(350);
  ok(!(await loginHidden(h.page)), 'Sign out brings the login back');
  ok(await gateInert(h.page), 'the app is inert again');
  ok(await h.page.evaluate(() => sessionStorage.getItem('retoma-login-v1')) === null, 'Sign out clears the session flag');
  await h.ctx.close();

  /* --- (i) both languages, no foreign words --------------------------- */
  console.log('login: languages');
  const i = await fresh(browser);
  await boot(i.page);
  const loginSwitch = '.login__tools .lang-switch__btn';
  await scanLogin(i.page, 'login in Spanish', ENGLISH);
  ok(await i.page.locator('.login__tools .lang-switch').getAttribute('aria-label') === 'Idioma', 'the aria-label is translated too');
  ok(await txt(i.page, '#loginSubmit') === 'Entrar' && await txt(i.page, '#loginGuest') === 'Continuar sin cuenta' && await txt(i.page, '#loginReveal') === 'Mostrar', 'Spanish labels on every control');
  await i.page.click(loginSwitch + '[data-lang="en"]');
  await i.page.waitForTimeout(350);
  await scanLogin(i.page, 'login in English', SPANISH);
  ok(await i.page.evaluate(() => document.documentElement.lang) === 'en', 'the switch reaches <html lang>');
  ok(await i.page.locator('.login__tools .lang-switch').getAttribute('aria-label') === 'Language', 'the aria-label comes back in English');
  ok(await txt(i.page, '#loginTitle') === 'Pick up where you left off', 'the title follows the language', await txt(i.page, '#loginTitle'));
  ok(await txt(i.page, '#loginSubmit') === 'Sign in' && await txt(i.page, '#loginGuest') === 'Continue without an account', 'English labels on every control');
  ok(await txt(i.page, '#loginHint') === 'Demo: no account is created and nothing leaves this device.', 'the hint follows the language', await txt(i.page, '#loginHint'));
  await i.page.click('#loginSubmit');
  await i.page.waitForTimeout(150);
  ok(/Enter your name or email/.test(await txt(i.page, '#loginError')), 'the error follows the language', await txt(i.page, '#loginError'));
  await i.page.click(loginSwitch + '[data-lang="es"]');
  await i.page.waitForTimeout(350);
  ok(/contraseña/.test(await txt(i.page, '#loginError')), 'the error is re-rendered in Spanish', await txt(i.page, '#loginError'));
  await scanLogin(i.page, 'login back in Spanish', ENGLISH);
  await i.ctx.close();

  /* --- (j) 44px targets, (k) contrast, (l) 390px ---------------------- */
  console.log('login: size, contrast and width');
  const s = await fresh(browser);
  await boot(s.page);
  const small = await s.page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('#loginScreen button, #loginScreen input, #loginScreen a[href]'))
      .filter(el => {
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0;
      });
    return els.filter(el => el.getBoundingClientRect().height < 44)
      .map(el => ({ id: el.id || (el.textContent || '').trim(), h: el.getBoundingClientRect().height }));
  });
  ok(small.length === 0, 'every login control is at least 44px tall', JSON.stringify(small));

  for (const th of ['light', 'dark']) {
    await s.page.evaluate((t) => Theme.apply(t), th);
    await s.page.waitForTimeout(250);
    const title = await contrastRatio(s.page, '#loginTitle');
    const label = await contrastRatio(s.page, '.login-field label');
    const hint = await contrastRatio(s.page, '#loginHint');
    ok(title >= 4.5 && label >= 4.5 && hint >= 4.5, '[' + th + '] login text contrast >= 4.5', title.toFixed(2) + ' / ' + label.toFixed(2) + ' / ' + hint.toFixed(2));
  }
  await s.page.evaluate(() => Theme.apply('light'));

  await s.page.setViewportSize({ width: 390, height: 844 });
  await s.page.waitForTimeout(300);
  const scroll = await s.page.evaluate(() => ({
    doc: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    body: document.body.scrollWidth <= document.body.clientWidth,
    docW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth
  }));
  ok(scroll.doc && scroll.body, 'no horizontal scroll at 390px', JSON.stringify(scroll));
  ok(!(await loginHidden(s.page)), 'the gate still fills the 390px screen');
  await s.ctx.close();

  /* --- screenshots ---------------------------------------------------- */
  console.log('login: screenshots');
  fs.mkdirSync(SHOTS, { recursive: true });
  async function shot(name, opts) {
    const o = opts || {};
    const r = await fresh(browser, { ctx: { viewport: o.viewport || { width: 1440, height: 900 } }, init: o.init });
    await boot(r.page);
    await r.page.waitForTimeout(1100);
    if (o.error) {
      await r.page.click('#loginSubmit');
      await r.page.waitForTimeout(250);
    }
    await r.page.screenshot({ path: path.join(SHOTS, name) });
    await r.ctx.close();
  }
  const dark = () => { try { localStorage.setItem('retoma-theme', 'dark'); } catch (e) { /* ignore */ } };
  await shot('login-1440-light.png');
  await shot('login-1440-dark.png', { init: dark });
  await shot('login-390-light.png', { viewport: { width: 390, height: 844 } });
  await shot('login-390-dark.png', { viewport: { width: 390, height: 844 }, init: dark });
  await shot('login-error-1440.png', { error: true });
  ['login-1440-light.png', 'login-1440-dark.png', 'login-390-light.png', 'login-390-dark.png', 'login-error-1440.png'].forEach(function (n) {
    ok(fs.existsSync(path.join(SHOTS, n)) && fs.statSync(path.join(SHOTS, n)).size > 5000, 'shot ' + n + ' was written');
  });

  await browser.close();
  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
