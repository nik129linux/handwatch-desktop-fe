/* tests/rubric-b-fix1.test.js — phase B fix round 1.
 * The reviewer flow, fresh profile at 1440x900:
 *   Escape the welcome -> "Llega un WhatsApp" -> "Alejarme 25 min" ->
 *   "Volver" -> "Terminar el día".
 * Contract:
 *   1. The resume subtitle is the title of the window named in the hero, not
 *      the interruption window's title.
 *   2. A coach mark never covers a visible button (in particular Resume), is
 *      not shown while the resume card first appears, and closes (as seen)
 *      when the tab changes or its anchor is hidden.
 *   3. Only one coach mark is open at a time; the rest wait in a queue.
 * Run with: node tests/rubric-b-fix1.test.js */
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
  else { failed++; console.log('  FAIL ' + name + (detail ? '\n       ' + String(detail).slice(0, 600) : '')); }
}

async function boot(page) {
  await page.goto(INDEX, { waitUntil: 'load' });
  await page.waitForFunction(() => window.Retoma && !document.body.classList.contains('is-launch'), null, { timeout: 10000 });
  await page.waitForTimeout(350);
}
const txt = (page, sel) => page.locator(sel).first().innerText().then(t => t.trim().replace(/\s+/g, ' '));

/* Bounding-box audit: when a coach mark is open, none of its pixels may fall
 * inside a visible button, and there must be exactly one open coach mark. */
function auditTip(page) {
  return page.evaluate(() => {
    const tip = document.getElementById('coachTip');
    if (!tip || tip.classList.contains('is-hidden')) return { open: false, openTips: 0, hits: [] };
    const tr = tip.getBoundingClientRect();
    const buttons = Array.from(document.querySelectorAll('button, [role="button"], a[href], input[type="button"], input[type="submit"]'))
      .filter((b) => {
        if (tip.contains(b)) return false;
        if (b.disabled) return false;
        if (b.closest('.is-hidden, [hidden], [inert]')) return false;
        const cs = getComputedStyle(b);
        if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return false;
        const r = b.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && r.right > 0 && r.bottom > 0 && r.left < innerWidth && r.top < innerHeight;
      })
      .map((b) => {
        const r = b.getBoundingClientRect();
        return { id: b.id || (b.textContent || '').trim().slice(0, 24), left: r.left, right: r.right, top: r.top, bottom: r.bottom };
      });
    const hits = buttons.filter((b) => !(tr.right <= b.left || tr.left >= b.right || tr.bottom <= b.top || tr.top >= b.bottom));
    return {
      open: true,
      openTips: document.querySelectorAll('.coach-tip:not(.is-hidden)').length,
      tip: { left: tr.left, right: tr.right, top: tr.top, bottom: tr.bottom },
      hits
    };
  });
}

async function assertTipClear(page, label) {
  const a = await auditTip(page);
  if (a.open) ok(a.openTips === 1, label + ': only one coach mark is open', JSON.stringify(a));
  ok(a.hits.length === 0, label + ': coach mark intersects no visible button', a.open ? JSON.stringify(a.hits) : 'tip closed');
  return a;
}

(async () => {
  const browser = await chromium.launch();

  console.log('rubric-b-fix1: fresh profile, reviewer flow');
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'en-US' });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await boot(page);

  ok(await page.evaluate(() => !document.getElementById('guideOverlay').classList.contains('is-hidden')), 'welcome guide is open on a fresh profile');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  ok(await page.evaluate(() => !document.getElementById('coachTip').classList.contains('is-hidden')), 'the note coach mark opens after the welcome');
  await assertTipClear(page, 'welcome coach mark');

  await page.click('#freeMode [data-act="whatsapp"]');
  await page.waitForTimeout(200);
  await page.click('#freeMode [data-act="away"]');
  await page.waitForTimeout(200);
  await page.click('#freeMode [data-act="return"]');
  await page.waitForSelector('#resumeCard.is-visible', { timeout: 3000 });
  await page.waitForTimeout(500);

  const resume = await page.evaluate(() => ({
    hero: (document.getElementById('resumeHero').innerText || '').trim().replace(/\s+/g, ' '),
    sub: (document.getElementById('resumeSub').innerText || '').trim().replace(/\s+/g, ' '),
    docApp: (document.querySelector('#win-doc .window__app').innerText || '').trim(),
    docTitle: (document.querySelector('#win-doc .window__title').innerText || '').trim(),
    waTitle: (document.querySelector('#win-whatsapp .window__title').innerText || '').trim(),
    tipHidden: document.getElementById('coachTip').classList.contains('is-hidden')
  }));
  ok(resume.hero === 'Estabas en ' + resume.docApp, 'resume hero names Documento', JSON.stringify(resume));
  ok(resume.sub === resume.docTitle, 'resume subtitle is the Document window title', JSON.stringify(resume));
  ok(resume.sub === 'Informe de calidad, párrafo 3', 'resume subtitle reads Informe de calidad, párrafo 3', JSON.stringify(resume));
  ok(!new RegExp(resume.waTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(resume.sub), 'subtitle is not the WhatsApp title', JSON.stringify(resume));
  ok(resume.tipHidden, 'no coach mark is shown while the resume card first appears');

  const tipAtResume = await assertTipClear(page, 'resume card');
  ok(!tipAtResume.hits.some(h => h.id === 'retomarBtn'), 'the primary Retomar button is never covered');
  ok(await page.evaluate(() => {
    const btn = document.getElementById('retomarBtn').getBoundingClientRect();
    const tip = document.getElementById('coachTip').getBoundingClientRect();
    return document.getElementById('coachTip').classList.contains('is-hidden') ||
      !(tip.right > btn.left && tip.left < btn.right && tip.bottom > btn.top && tip.top < btn.bottom);
  }), 'the Retomar bounding box is clear of the coach mark');

  await page.click('#freeMode [data-act="endday"]');
  await page.waitForTimeout(600);
  ok(await page.evaluate(() => document.querySelector('.retoma-tabs__btn.is-active').getAttribute('data-tab') === 'hoy'), 'End the day opens Today');
  await assertTipClear(page, 'Today after End the day');

  console.log('rubric-b-fix1: one coach mark at a time, the rest queue');
  await page.evaluate(() => Guide.visit('settings'));
  const whileOpen = await auditTip(page);
  ok(whileOpen.open && /sugerencia para mañana/i.test(await txt(page, '#coachTipText')), 'a second feature does not replace the open coach mark', JSON.stringify(whileOpen));
  await page.click('#coachTipClose');
  await page.waitForTimeout(150);
  const queued = await page.evaluate(() => ({
    open: !document.getElementById('coachTip').classList.contains('is-hidden'),
    text: (document.getElementById('coachTipText').textContent || '').trim(),
    count: document.querySelectorAll('.coach-tip:not(.is-hidden)').length
  }));
  ok(queued.open && /idioma|tema|guía/i.test(queued.text), 'the queued coach mark opens after the first is dismissed', JSON.stringify(queued));
  ok(queued.count === 1, 'only one coach mark is visible after the queue advances', JSON.stringify(queued));
  await assertTipClear(page, 'queued coach mark');

  console.log('rubric-b-fix1: tab change closes the coach mark and counts it as seen');
  await page.click('#tabBtnConfig');
  await page.waitForTimeout(200);
  const afterTab = await page.evaluate(() => {
    let seen = {};
    try { seen = JSON.parse(localStorage.getItem('retoma-tips-v1') || '{}'); } catch (e) { /* ignore */ }
    return {
      hidden: document.getElementById('coachTip').classList.contains('is-hidden'),
      settingsSeen: seen.settings === 1
    };
  });
  ok(afterTab.hidden, 'switching tabs closes the open coach mark', JSON.stringify(afterTab));
  ok(afterTab.settingsSeen, 'the closed coach mark is persisted as seen', JSON.stringify(afterTab));

  ok(errs.length === 0, 'no console errors during the flow', errs.join(' | '));
  await browser.close();
  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
