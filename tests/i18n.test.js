/* tests/i18n.test.js — English / Spanish switch.
 * Contract:
 *   Titlebar: <div class="lang-switch" role="group" aria-label="Language"> with two buttons
 *     .lang-switch__btn[data-lang="en"] "EN" and [data-lang="es"] "ES", aria-pressed on the active one,
 *     same look as the Demo/Live .mode-switch. Default language: English (deterministic for tests).
 *   Choice persists in localStorage 'retoma.lang' (try/catch). <html lang> follows it.
 *   Spanish covers static AND dynamic copy (resume card, Now, Today, Privacy, demo controls, story
 *   subtitles, demo windows), plus placeholder / aria-label / title attributes.
 *   Spanish is neutral Colombian with "tú" (no voseo). Switching back restores English exactly.
 * Run with: node tests/i18n.test.js */
'use strict';

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..');
const INDEX = pathToFileURL(path.join(ROOT, 'index.html')).href;
let passed = 0;
let failed = 0;
function ok(cond, name, detail) {
  if (cond) { passed++; console.log('  ok ' + name); }
  else { failed++; console.log('  FAIL ' + name + (detail ? '\n       ' + String(detail).slice(0, 400) : '')); }
}

async function boot(page) {
  await page.goto(INDEX, { waitUntil: 'load' });
  await page.waitForFunction(() => window.Retoma && !document.body.classList.contains('is-launch'), null, { timeout: 10000 });
  await page.waitForTimeout(300);
}
const txt = (page, sel) => page.locator(sel).first().innerText().then(t => t.trim().replace(/\s+/g, ' '));
async function setLang(page, lang) {
  await page.click('.lang-switch__btn[data-lang="' + lang + '"]');
  await page.waitForTimeout(250);
}

/* Visible text in the app that is still English. App names, numbers and the user's own note are data,
 * not copy; anything inside [data-i18n-skip] is data too. */
const ENGLISH = /\b(the|you|your|you're|what|never|today|tomorrow|now|with|before|after|away|back|start|delete|everything|suggestion|planned|actual|resume|switch|pause|tracking|helper|minutes|here|only|title|window|arrives|guided|free|mode|step|next|deleted|history|about|this|device|thanks|accept|interrupted|longest|block|report|morning)\b/i;
async function englishLeftovers(page) {
  return page.evaluate((src) => {
    const re = new RegExp(src, 'i');
    const out = [];
    const roots = ['#menuBar', '#retomaPanel', '.sim-panel', '#desktopWorkspace', '.dock'];
    roots.forEach(r => {
      const root = document.querySelector(r);
      if (!root) return;
      const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = w.nextNode())) {
        const t = n.nodeValue.trim();
        if (!t) continue;
        const el = n.parentElement;
        if (!el || el.closest('[data-i18n-skip]') || el.closest('script,style,code')) continue;
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden' || el.closest('[hidden],.is-hidden,[inert]')) continue;
        const r2 = el.getBoundingClientRect();
        if (r2.width === 0 || r2.height === 0) continue;
        if (re.test(t)) out.push(t.slice(0, 80));
      }
    });
    return out;
  }, ENGLISH.source);
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'en-US' });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await boot(page);

  console.log('i18n: switch');
  ok(await page.locator('#menuBar .lang-switch[role="group"]').count() === 1, 'language switch lives in the titlebar');
  ok(await page.locator('.lang-switch__btn[data-lang="en"]').getAttribute('aria-pressed') === 'true', 'English is the default');
  ok(await page.evaluate(() => document.documentElement.lang) === 'en', '<html lang="en"> by default');
  ok(await txt(page, '.lang-switch__btn[data-lang="es"]') === 'ES' && await txt(page, '.lang-switch__btn[data-lang="en"]') === 'EN', 'buttons read EN / ES');
  ok(await page.evaluate(() => getComputedStyle(document.querySelector('.lang-switch__btn[data-lang="en"]')).backgroundColor ===
      getComputedStyle(document.querySelector('.mode-switch__btn.is-active')).backgroundColor), 'active language looks like the active Demo/Live segment');

  await setLang(page, 'es');
  ok(await page.locator('.lang-switch__btn[data-lang="es"]').getAttribute('aria-pressed') === 'true', 'ES pressed after click');
  ok(await page.evaluate(() => document.documentElement.lang) === 'es', '<html lang="es">');
  ok(await page.evaluate(() => { try { return localStorage.getItem('retoma.lang'); } catch (e) { return null; } }) === 'es', "stored in localStorage 'retoma.lang'");

  console.log('i18n: static copy');
  ok(await txt(page, '#tabBtnAhora') === 'Ahora' && await txt(page, '#tabBtnHoy') === 'Hoy' && await txt(page, '#tabBtnPriv') === 'Privacidad', 'tabs: Ahora / Hoy / Privacidad');
  ok(await txt(page, 'label[for="leaveNote"]') === 'Siguiente paso (una línea)', 'note label in Spanish', await txt(page, 'label[for="leaveNote"]'));
  ok(/vuelvas/i.test(await page.getAttribute('#leaveNote', 'placeholder')), 'note placeholder in Spanish', await page.getAttribute('#leaveNote', 'placeholder'));
  const sim = {
    switch: 'Cambiar de app', whatsapp: 'Llega un WhatsApp', away: 'Alejarme 25 min', return: 'Volver',
    endday: 'Terminar el día', pause: 'Pausar', delete: 'Borrar todo'
  };
  for (const k of Object.keys(sim)) {
    const t = await txt(page, '#freeMode [data-act="' + k + '"]');
    ok(t === sim[k], 'demo button ' + k + ' -> ' + sim[k], t);
  }
  ok(await txt(page, '#storyPlay') === 'Tour guiado', 'Guided tour -> Tour guiado', await txt(page, '#storyPlay'));
  ok(await page.locator('#storyPlay svg').count() === 1, 'play icon survives the translation');
  ok(/Pausar|Reanudar/.test(await page.getAttribute('#retomaToggle', 'aria-label') || ''), 'eye aria-label in Spanish', await page.getAttribute('#retomaToggle', 'aria-label'));
  ok(await page.getAttribute('#themeToggle', 'aria-label') === 'Cambiar tema', 'theme aria-label in Spanish');

  console.log('i18n: dynamic copy (resume card)');
  await page.evaluate(() => { Retoma.openPanel(); Retoma.switchTab('ahora'); });
  await page.fill('#leaveNote', 'corregir la cita del párrafo 3');
  await page.press('#leaveNote', 'Enter');
  await page.evaluate(() => { Retoma.state.currentApp = 'Document'; Retoma.state.currentTitle = 'Informe de calidad'; });
  await page.click('#freeMode [data-act="whatsapp"]');
  await page.waitForTimeout(200);
  await page.evaluate(() => { Retoma.state.currentApp = 'Document'; });
  await page.click('#freeMode [data-act="away"]');
  await page.waitForTimeout(250);
  await page.click('#freeMode [data-act="return"]');
  await page.waitForSelector('#resumeCard.is-visible', { timeout: 3000 });
  await page.waitForTimeout(500);
  ok(/^Estabas en Document$/.test(await txt(page, '#resumeHero')), 'hero: Estabas en Document', await txt(page, '#resumeHero'));
  ok(/te interrumpió/.test(await txt(page, '#resumeInter')) && /25 min/.test(await txt(page, '#resumeInter')), 'interruption line in Spanish', await txt(page, '#resumeInter'));
  ok(await txt(page, '#resumeNote') === 'Siguiente: corregir la cita del párrafo 3', 'note line: Siguiente: ...', await txt(page, '#resumeNote'));
  ok(await txt(page, '#retomarBtn') === 'Retomar' && await txt(page, '#startFreshBtn') === 'Empezar de cero', 'Retomar / Empezar de cero');
  ok((await englishLeftovers(page)).length === 0, 'no English left on the resume screen', JSON.stringify(await englishLeftovers(page)));
  await page.evaluate(() => document.getElementById('retomarBtn').click());
  await page.waitForTimeout(600);
  ok(/min aquí/.test(await txt(page, '#nowTime')) || /min aquí/.test(await txt(page, '.now-row')), 'Now time: "N min aquí"', await txt(page, '.now-row'));

  console.log('i18n: Today + Privacy');
  await page.evaluate(() => { Retoma.showEndOfDay(); Retoma.switchTab('hoy'); });
  await page.waitForTimeout(900);
  ok(/^Mañana:/.test(await txt(page, '#proposalText')), 'proposal starts with Mañana:', await txt(page, '#proposalText'));
  ok(await txt(page, '#proposalAccept') === 'Aceptar' && await txt(page, '#proposalDecline') === 'No, gracias', 'Aceptar / No, gracias');
  ok(/Planeado/.test(await txt(page, '#timelineText')) && /Real/.test(await txt(page, '#timelineText')), 'planned/actual in Spanish', await txt(page, '#timelineText'));
  ok((await englishLeftovers(page)).length === 0, 'no English left on Today', JSON.stringify(await englishLeftovers(page)));
  await page.evaluate(() => Retoma.switchTab('priv'));
  await page.waitForTimeout(400);
  const priv = await txt(page, '#retomaTabPriv');
  ok(/Qué veo/.test(priv) && /Qué nunca veo/.test(priv) && /Borrar todo/.test(priv), 'Privacy: Qué veo / Qué nunca veo / Borrar todo', priv.slice(0, 200));
  ok((await englishLeftovers(page)).length === 0, 'no English left on Privacy', JSON.stringify(await englishLeftovers(page)));

  console.log('i18n: story subtitles');
  await page.evaluate(() => { window.__storySpeed = 20; });
  await page.click('#storyPlay');
  await page.waitForTimeout(700);
  const sub = await txt(page, '#subtitle');
  ok(sub.length > 0 && !ENGLISH.test(sub), 'story subtitle in Spanish', sub);
  await page.waitForFunction(() => !document.getElementById('storyPlay').disabled, null, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(400);

  console.log('i18n: persistence and back to English');
  await boot(page);
  ok(await page.evaluate(() => document.documentElement.lang) === 'es' && await txt(page, '#tabBtnAhora') === 'Ahora', 'Spanish survives a reload');
  await setLang(page, 'en');
  ok(await txt(page, '#tabBtnAhora') === 'Now' && await txt(page, '#tabBtnPriv') === 'Privacy', 'tabs back to English');
  ok(await txt(page, '#freeMode [data-act="away"]') === 'Step away 25 min', 'demo buttons back to English');
  ok(await page.getAttribute('#themeToggle', 'aria-label') === 'Switch theme', 'attributes back to English');
  ok(await page.evaluate(() => document.documentElement.lang) === 'en', '<html lang="en"> again');

  console.log('i18n: Spanish quality');
  const sources = ['js', 'index.html'].map(p => path.join(ROOT, p));
  const files = [];
  sources.forEach(p => { if (fs.statSync(p).isDirectory()) fs.readdirSync(p).forEach(f => files.push(path.join(p, f))); else files.push(p); });
  const voseo = /\b(tocá|mirá|podés|tenés|querés|acordate|volvé|hacé|decí|sabés|empezá|elegí)\b/i;
  const hits = files.filter(f => voseo.test(fs.readFileSync(f, 'utf8'))).map(f => path.relative(ROOT, f));
  ok(hits.length === 0, 'no voseo anywhere (tú, neutral Colombian)', hits.join(', '));
  const judging = /\b(productividad|distraíd[oa]|puntaje|perezos[oa]|perdiste)\b/i;
  const hits2 = files.filter(f => judging.test(fs.readFileSync(f, 'utf8'))).map(f => path.relative(ROOT, f));
  ok(hits2.length === 0, 'no judging words in Spanish copy', hits2.join(', '));
  const dash = files.filter(f => /\.html$/.test(f)).filter(f => / — /.test(fs.readFileSync(f, 'utf8')));
  ok(dash.length === 0, 'no em dashes in visible HTML copy', dash.join(', '));

  ok(errs.length === 0, 'no console errors', errs.join(' | '));
  await browser.close();
  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
