/* tests/settings-guide.test.js — rubric phase A.
 * Contract:
 *   Fresh profile: Spanish + light theme, whatever the browser locale says.
 *   Settings is a real fourth tab (gear) with Idioma / Tema / IA / Privacidad / Ayuda.
 *   Switching language never reloads and never loses in-memory state.
 *   Level 1 welcome shows once, is replayable, and is a real modal
 *   (role=dialog, aria-modal, focus trapped, Esc closes, focus returns).
 *   Level 2 coach marks show once and persist.
 *   Level 3 Help lives inside Settings with features, icons and a glossary.
 *   No English visible in Spanish and no Spanish visible in English.
 * Run with: node tests/settings-guide.test.js */
'use strict';

const { chromium } = require('playwright');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..');
const INDEX = pathToFileURL(path.join(ROOT, 'index.html')).href;

let passed = 0;
let failed = 0;
function ok(cond, name, detail) {
  if (cond) { passed++; console.log('  ok ' + name); }
  else { failed++; console.log('  FAIL ' + name + (detail ? '\n       ' + String(detail).slice(0, 500) : '')); }
}

async function boot(page) {
  await page.goto(INDEX, { waitUntil: 'load' });
  await page.waitForFunction(() => window.Retoma && !document.body.classList.contains('is-launch'), null, { timeout: 10000 });
  await page.waitForTimeout(350);
}
const txt = (page, sel) => page.locator(sel).first().innerText().then(t => t.trim().replace(/\s+/g, ' '));

/* Words that are English copy in this app. App names, numbers and the user's
 * own note are data, and both <code> and [data-i18n-skip] are data too. */
const ENGLISH = new RegExp('\\b(' + [
  'start', 'delete', 'everything', 'suggestion', 'planned', 'resume', 'switch', 'pause',
  'tracking', 'helper', 'minutes', 'only', 'window', 'title', 'guided', 'mode', 'step',
  'next', 'history', 'device', 'accept', 'interrupted', 'longest', 'block', 'report',
  'settings', 'language', 'theme', 'light', 'dark', 'system', 'help', 'guide',
  'permission', 'requests', 'left', 'connected', 'thinking', 'testing', 'adjust',
  'send', 'cancel', 'allow', 'privacy', 'records', 'days', 'document', 'browser',
  'spreadsheet', 'needs', 'reachable', 'test', 'off'
].join('|') + ')\\b', 'i');

const SPANISH = new RegExp('\\b(' + [
  'agregar', 'borrar', 'pausar', 'reanudar', 'siguiente', 'atrás', 'saltar', 'idioma',
  'tema', 'configuración', 'ayuda', 'guía', 'privacidad', 'hoy', 'ahora', 'sugerencia',
  'retomar', 'informe', 'bloque', 'minutos', 'disponibles', 'apagada', 'activada',
  'permiso', 'enviar', 'probar', 'pensando', 'conectado', 'navegador', 'documento',
  'hoja', 'cálculo', 'guardado', 'entendido', 'empezar', 'terminar', 'ausencia',
  'seguimiento', 'ventana', 'ventanas', 'títulos', 'nunca', 'siempre', 'tarea'
].join('|') + ')\\b', 'i');

function visibleText(page, re) {
  return page.evaluate(({ src, flags }) => {
    const re2 = new RegExp(src, flags);
    const out = [];
    const roots = ['#menuBar', '#retomaPanel', '.sim-panel', '#desktopWorkspace', '.dock', '#guideOverlay', '#coachTip'];
    roots.forEach(r => {
      const root = document.querySelector(r);
      if (!root) return;
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
        out.push(r + ' | ' + t.slice(0, 100));
      }
    });
    return out;
  }, { src: re.source, flags: re.flags });
}

async function scanScreen(page, label, re) {
  const hits = await visibleText(page, re);
  ok(hits.length === 0, label + ' has no unwanted words', hits.join('  //  '));
}

async function goTab(page, name) {
  await page.click('#tabBtn' + name);
  await page.waitForTimeout(200);
  await dismissTipIfAny(page);
}

function contrastRatio(page, fgSel, bgSel) {
  return page.evaluate(([f, b]) => {
    function rgb(el) {
      const c = getComputedStyle(el);
      const m = c.color.match(/rgba?\(([^)]+)\)/);
      if (!m) return null;
      const p = m[1].split(',').map(x => parseFloat(x));
      return p.slice(0, 3);
    }
    function bg(el) {
      while (el) {
        const c = getComputedStyle(el);
        const m = (c.backgroundColor || '').match(/rgba?\(([^)]+)\)/);
        if (m) {
          const p = m[1].split(',').map(x => parseFloat(x));
          if (p.length < 4 || p[3] > 0.9) return p.slice(0, 3);
        }
        el = el.parentElement;
      }
      return [255, 255, 255];
    }
    function lum(c) {
      const v = c.map(x => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); });
      return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
    }
    const fg = rgb(document.querySelector(f));
    const back = bg(document.querySelector(b));
    if (!fg) return 0;
    const a = lum(fg); const z = lum(back);
    return (Math.max(a, z) + 0.05) / (Math.min(a, z) + 0.05);
  }, [fgSel, bgSel]);
}

async function dismissTipIfAny(page) {
  if (await page.evaluate(() => !document.getElementById('coachTip').classList.contains('is-hidden'))) {
    await page.click('#coachTipClose');
    await page.waitForTimeout(100);
  }
}

(async () => {
  const browser = await chromium.launch();

  console.log('settings-guide: fresh profile');
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'en-US' });
  /* Only the login gate is skipped here: this file owns the level-1 welcome. */
  await ctx.addInitScript(() => {
    try { sessionStorage.setItem('retoma-login-v1', '1'); } catch (e) { /* storage unavailable */ }
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await boot(page);

  ok(await page.evaluate(() => document.documentElement.lang) === 'es', 'fresh profile opens in Spanish');
  ok(await page.locator('#menuBar .lang-switch__btn[data-lang="es"]').getAttribute('aria-pressed') === 'true', 'ES is the pressed language');
  ok(await page.evaluate(() => document.documentElement.getAttribute('data-theme')) === 'light', 'fresh profile opens light');
  ok(await txt(page, '#tabBtnAhora') === 'Ahora' && await txt(page, '#tabBtnHoy') === 'Hoy' && await txt(page, '#tabBtnPriv') === 'Privacidad', 'tabs are Spanish');

  console.log('settings-guide: level 1 first run');
  ok(await page.evaluate(() => !document.getElementById('guideOverlay').classList.contains('is-hidden')), 'welcome guide shows on first launch');
  ok(await page.locator('#guideOverlay[role="dialog"]').getAttribute('aria-modal') === 'true', 'welcome is a modal dialog');
  ok(await page.locator('#guideDots .guide-dot').count() === 3, 'three cards, three progress dots');
  ok(await txt(page, '#guideSkip') === 'Saltar', 'Skip reads Saltar');
  await page.click('#guideNext');
  await page.waitForTimeout(120);
  ok(await page.evaluate(() => document.querySelectorAll('#guideDots .guide-dot.is-active').length) === 1, 'progress dot follows the card');
  await page.click('#guideBack');
  await page.waitForTimeout(120);
  ok(/Paso 1 de 3/.test(await page.evaluate(() => document.getElementById('guideCount').textContent)), 'Back returns to card 1');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(120);
  ok(await page.evaluate(() => document.getElementById('guideOverlay').classList.contains('is-hidden')), 'Esc closes the guide');

  console.log('settings-guide: level 2 coach mark');
  ok(await page.evaluate(() => !document.getElementById('coachTip').classList.contains('is-hidden')), 'a coach mark appears after the welcome');
  const tipText = await txt(page, '#coachTip');
  ok(tipText.length > 10, 'coach mark has copy', tipText);
  await scanScreen(page, 'coach mark in Spanish', ENGLISH);
  await dismissTipIfAny(page);
  ok(await page.evaluate(() => { try { return JSON.parse(localStorage.getItem('retoma-tips-v1')).note === 1; } catch (e) { return false; } }), 'coach mark is persisted as seen');

  console.log('settings-guide: Settings tab');
  ok(await page.locator('#tabBtnConfig svg').count() === 1, 'Settings tab carries a gear icon');
  await goTab(page, 'Config');
  ok(await txt(page, '#tabBtnConfig').then(t => /Configuración/.test(t)), 'tab reads Configuración');
  ok(await page.evaluate(() => document.getElementById('retomaTabConfig').classList.contains('is-active')), 'Settings panel is active');
  const settings = await txt(page, '#retomaTabConfig');
  ok(/Idioma/.test(settings) && /Tema/.test(settings) && /Inteligencia artificial/.test(settings) && /Privacidad/.test(settings) && /Ayuda/.test(settings), 'Settings has Idioma / Tema / IA / Privacidad / Ayuda', settings.slice(0, 300));
  ok(await page.locator('[data-theme-choice="light"].is-active').count() === 1, 'Claro is the active theme choice');
  const small = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('#retomaTabConfig .btn, #retomaTabConfig .seg__btn, #tabBtnConfig'));
    return els.filter(e => getComputedStyle(e).display !== 'none').map(e => e.getBoundingClientRect().height).filter(h => h > 0 && h < 44);
  });
  ok(small.length === 0, 'Settings targets are at least 44px tall', JSON.stringify(small));

  console.log('settings-guide: language switch without reload');
  await page.evaluate(() => { window.__keep = 42; Retoma.state.currentApp = 'Document'; });
  await goTab(page, 'Ahora');
  await page.fill('#leaveNote', 'revisar la cita');
  const before = await page.evaluate(() => ({ nav: performance.getEntriesByType('navigation').length, marker: window.__keep, note: document.getElementById('leaveNote').value }));
  await goTab(page, 'Config');
  await page.click('[data-settings-lang="en"]');
  await page.waitForTimeout(300);
  ok(await page.evaluate(() => document.documentElement.lang) === 'en', '<html lang="en"> after switching');
  ok(await txt(page, '#tabBtnAhora') === 'Now', 'tab copy follows the language');
  const after = await page.evaluate(() => ({ nav: performance.getEntriesByType('navigation').length, marker: window.__keep, note: document.getElementById('leaveNote').value }));
  ok(after.nav === before.nav, 'the page did not reload');
  ok(after.marker === 42, 'in-memory state survives the switch', String(after.marker));
  ok(after.note === 'revisar la cita', 'the note survives the switch', after.note);
  ok(await txt(page, '[data-settings-lang="en"]') === 'English' && await txt(page, '[data-settings-lang="es"]') === 'Español', 'language options stay Español / English');

  console.log('settings-guide: English scan');
  await goTab(page, 'Hoy');
  await scanScreen(page, 'Today in English', SPANISH);
  await goTab(page, 'Priv');
  await scanScreen(page, 'Privacy in English', SPANISH);
  await goTab(page, 'Config');
  await scanScreen(page, 'Settings in English', SPANISH);

  console.log('settings-guide: theme + persistence');
  await page.click('[data-theme-choice="dark"]');
  await page.waitForTimeout(200);
  ok(await page.evaluate(() => document.documentElement.getAttribute('data-theme')) === 'dark', 'Oscuro switches the theme');
  ok(await page.evaluate(() => localStorage.getItem('retoma-theme')) === 'dark', 'theme choice is persisted');
  await page.click('[data-theme-choice="system"]');
  await page.waitForTimeout(150);
  ok(await page.evaluate(() => localStorage.getItem('retoma-theme')) === 'system', 'Sistema is a third persisted option');
  await page.click('[data-theme-choice="light"]');

  console.log('settings-guide: contrast in both themes');
  for (const th of ['light', 'dark']) {
    await page.click('[data-theme-choice="' + th + '"]');
    await page.waitForTimeout(200);
    await page.evaluate(() => Guide.replay());
    await page.waitForTimeout(200);
    const title = await contrastRatio(page, '#guideTitle', '.guide-card');
    const body = await contrastRatio(page, '#guideBody', '.guide-card');
    ok(title >= 4.5 && body >= 4.5, '[' + th + '] guide text contrast >= 4.5', title.toFixed(2) + ' / ' + body.toFixed(2));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
  }
  await page.click('[data-theme-choice="light"]');

  console.log('settings-guide: plurals + Intl');
  await page.evaluate(() => { Retoma.state.aiMode = 'server'; Retoma.setQuota({ left: 1, limit: 10 }); });
  await goTab(page, 'Hoy');
  ok((await txt(page, '#quotaTextHoy')).indexOf('AI requests: 1 left') !== -1, 'English singular quota', await txt(page, '#quotaTextHoy'));
  await page.evaluate(() => Retoma.setQuota({ left: 2, limit: 10 }));
  ok((await txt(page, '#quotaTextHoy')).indexOf('AI requests: 2 left') !== -1, 'English plural quota', await txt(page, '#quotaTextHoy'));
  await page.evaluate(() => { Retoma.state.aiMode = 'off'; Retoma.setQuota({ left: 2, limit: 10 }); });

  console.log('settings-guide: back to Spanish + own scan');
  await page.click('.lang-switch__btn[data-lang="es"]');
  await page.waitForTimeout(350);
  await scanScreen(page, 'Today in Spanish', ENGLISH);
  await goTab(page, 'Priv');
  await scanScreen(page, 'Privacy in Spanish', ENGLISH);
  await goTab(page, 'Config');
  await scanScreen(page, 'Settings in Spanish', ENGLISH);
  ok(await page.evaluate(() => document.documentElement.lang) === 'es', 'back to Spanish');
  ok(await page.evaluate(() => I18n.formatNumber(1234)) === '1.234', 'Spanish numbers use Intl (1.234)', await page.evaluate(() => I18n.formatNumber(1234)));
  const plurals = await page.evaluate(() => {
    const m1 = { totalMinutes: 40, count: 1, switchesPerHour: 1, longest: { app: 'Document', minutes: 40, count: 1 }, median: 40 };
    const m2 = { totalMinutes: 80, count: 2, switchesPerHour: 2, longest: { app: 'Document', minutes: 40, count: 2 }, median: 40 };
    return {
      en1: Habits.rulesAsk(m1, 'context switches?'),
      en2: Habits.rulesAsk(m2, 'context switches?'),
      es1: I18n.t(Habits.rulesAsk(m1, 'context switches?')),
      es2: I18n.t(Habits.rulesAsk(m2, 'context switches?'))
    };
  });
  ok(/1 block/.test(plurals.en1) && /2 blocks/.test(plurals.en2), 'English plurals: 1 block / 2 blocks', JSON.stringify(plurals));
  ok(/1 bloque/.test(plurals.es1) && /2 bloques/.test(plurals.es2), 'Spanish plurals: 1 bloque / 2 bloques', JSON.stringify(plurals));
  await page.evaluate(() => { Retoma.state.aiMode = 'server'; Retoma.setQuota({ left: 1, limit: 10 }); Retoma.switchTab('hoy'); });
  await page.waitForTimeout(200);
  ok((await txt(page, '#quotaTextHoy')).indexOf('1 disponible') !== -1, 'Spanish singular quota', await txt(page, '#quotaTextHoy'));
  await page.evaluate(() => Retoma.setQuota({ left: 2, limit: 10 }));
  ok((await txt(page, '#quotaTextHoy')).indexOf('2 disponibles') !== -1, 'Spanish plural quota', await txt(page, '#quotaTextHoy'));
  await page.evaluate(() => { Retoma.state.aiMode = 'off'; Retoma.switchTab('config'); });
  await page.waitForTimeout(150);

  console.log('settings-guide: level 3 Help');
  await page.click('#helpOpen');
  await page.waitForTimeout(250);
  ok(await page.evaluate(() => document.getElementById('helpPanel').getBoundingClientRect().height > 100), 'Help screen exists inside Settings');
  ok(await page.locator('#helpBody .help__term').count() >= 12, 'Help lists every feature and icon');
  const help = await txt(page, '#helpPanel');
  ok(/Glosario/.test(help) && /Bloque/.test(help), 'Help has a glossary');
  await scanScreen(page, 'Help in Spanish', ENGLISH);
  ok(await page.evaluate(() => document.activeElement && document.activeElement.id === 'helpPanel'), 'Help takes focus');

  console.log('settings-guide: replay + focus trap');
  await page.click('#guideReplay');
  await page.waitForTimeout(150);
  ok(await page.evaluate(() => !document.getElementById('guideOverlay').classList.contains('is-hidden')), 'See the guide again replays level 1');
  await scanScreen(page, 'welcome in Spanish', ENGLISH);
  const inside = [];
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Tab');
    inside.push(await page.evaluate(() => !!document.getElementById('guideOverlay').contains(document.activeElement)));
  }
  ok(inside.every(Boolean), 'focus stays trapped in the modal', JSON.stringify(inside));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  const focusBack = await page.evaluate(() => ({ id: document.activeElement && document.activeElement.id, tag: document.activeElement && document.activeElement.tagName }));
  ok(focusBack.id === 'guideReplay', 'focus returns to the button that opened the guide', JSON.stringify(focusBack));

  console.log('settings-guide: second launch');
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(500);
  ok(await page.evaluate(() => document.getElementById('guideOverlay').classList.contains('is-hidden')), 'level 1 does not show on the second launch');
  ok(await page.evaluate(() => document.getElementById('coachTip').classList.contains('is-hidden')), 'the coach mark does not show twice');
  ok(await page.evaluate(() => document.documentElement.lang) === 'es', 'Spanish survives a reload');
  ok(await page.evaluate(() => document.documentElement.getAttribute('data-theme')) === 'light', 'theme choice survives a reload');

  console.log('settings-guide: guide works in Live mode');
  await page.click('[data-mode="live"]');
  await page.waitForTimeout(300);
  await page.evaluate(() => Guide.replay());
  await page.waitForTimeout(150);
  ok(await page.evaluate(() => !document.getElementById('guideOverlay').classList.contains('is-hidden') && document.body.classList.contains('is-live')), 'level 1 opens in Live mode too');
  await page.click('#guideSkip');
  await page.waitForTimeout(150);

  ok(errs.length === 0, 'no console errors', errs.join(' | '));
  await browser.close();
  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
