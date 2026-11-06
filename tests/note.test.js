/* tests/note.test.js — note-on-leave ("next step") in the browser build.
 * Contract:
 *   Now tab: <input id="leaveNote" maxlength="200"> with a visible <label for="leaveNote">,
 *            saved on Enter and on blur (no extra button needed).
 *   Resume card: <p id="resumeNote"> shows "Next: <note>" (textContent only), hidden when empty.
 *   Resume / Start fresh / Delete everything clear the note (input empty, card line hidden).
 *   The note survives a reload (localStorage key per mode: retoma.note.demo / retoma.note.live).
 *   Chips and the title line never render HTML from data; a long title never overflows the card.
 * Run with: node tests/note.test.js */
'use strict';

const { chromium } = require('playwright');
const path = require('path');
const { pathToFileURL } = require('url');

const INDEX = pathToFileURL(path.resolve(__dirname, '..', 'index.html')).href;
let passed = 0;
let failed = 0;
function ok(cond, name, detail) {
  if (cond) { passed++; console.log('  ok ' + name); }
  else { failed++; console.log('  FAIL ' + name + (detail ? '\n       ' + detail : '')); }
}

async function boot(page) {
  await page.goto(INDEX, { waitUntil: 'load' });
  await page.waitForFunction(() => window.Retoma && !document.body.classList.contains('is-launch'), null, { timeout: 10000 });
  await page.waitForTimeout(300);
}

async function openNow(page) {
  await page.evaluate(() => { Retoma.openPanel(); Retoma.switchTab('ahora'); });
  await page.waitForTimeout(400);
}

async function typeNote(page, text) {
  await openNow(page);
  await page.fill('#leaveNote', text);
  await page.press('#leaveNote', 'Enter');
  await page.waitForTimeout(150);
}

async function awayAndBack(page) {
  await page.evaluate(() => { Retoma.state.currentApp = 'Document'; Retoma.state.currentTitle = 'Quality report'; });
  await page.click('#freeMode [data-act="away"]');
  await page.waitForTimeout(300);
  await page.click('#freeMode [data-act="return"]');
  await page.waitForSelector('#resumeCard.is-visible', { timeout: 3000 });
  await page.waitForTimeout(300);
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await boot(page);

  console.log('note: field');
  await openNow(page);
  ok(await page.locator('#leaveNote').isVisible(), 'Now tab shows the note field');
  ok(await page.getAttribute('#leaveNote', 'maxlength') === '200', 'note field maxlength=200');
  const label = await page.locator('label[for="leaveNote"]').textContent().catch(() => '');
  ok(label && label.trim().length > 3, 'note field has a visible label', label);
  ok(await page.locator('#leaveNote').evaluate(el => el.tabIndex >= 0), 'note field is keyboard reachable');

  console.log('note: resume card');
  await typeNote(page, 'fix the citation in paragraph 3');
  await awayAndBack(page);
  ok(await page.locator('#resumeNote').isVisible(), 'resume card shows the note line');
  ok(!(await page.locator('#resumeHonest').isVisible()) && !(await page.locator('#resumeAi').isVisible()), 'demo card hides the Live-only line and the empty AI line');
  ok((await page.locator('#resumeNote').textContent()).trim() === 'Next: fix the citation in paragraph 3', 'note line reads "Next: <note>"',
    await page.locator('#resumeNote').textContent());
  await page.evaluate(() => document.getElementById('retomarBtn').click());
  await page.waitForTimeout(600);
  await openNow(page);
  ok(await page.inputValue('#leaveNote') === '', 'Resume clears the note field');
  await awayAndBack(page);
  ok(!(await page.locator('#resumeNote').isVisible()), 'with no note the line is hidden');
  await page.evaluate(() => document.getElementById('retomarBtn').click());
  await page.waitForTimeout(600);

  console.log('note: start fresh + delete clear it');
  await typeNote(page, 'call back Laura');
  await awayAndBack(page);
  await page.evaluate(() => document.getElementById('startFreshBtn').click());
  await page.waitForTimeout(600);
  await openNow(page);
  ok(await page.inputValue('#leaveNote') === '', 'Start fresh clears the note');

  console.log('note: persistence');
  await typeNote(page, 'outline section 2');
  await page.locator('#leaveNote').blur();
  await boot(page);
  await openNow(page);
  ok(await page.inputValue('#leaveNote') === 'outline section 2', 'note survives a reload');
  const keys = await page.evaluate(() => Object.keys(localStorage));
  ok(keys.indexOf('retoma.note.demo') !== -1, 'stored under retoma.note.demo', JSON.stringify(keys));

  console.log('note: blur saves without Enter');
  await page.fill('#leaveNote', 'typed then clicked away');
  await page.locator('#leaveNote').blur();
  await page.waitForTimeout(150);
  ok(await page.evaluate(() => localStorage.getItem('retoma.note.demo')) === 'typed then clicked away', 'blur saves');

  console.log('note: never renders HTML');
  await typeNote(page, '<img src=x id=pwn onerror="window.__pwned=1">');
  await page.evaluate(() => { Retoma.state.prevWindows = ['<b id=chipx>A</b>', 'B', 'C']; });
  await awayAndBack(page);
  await page.evaluate(() => { Retoma.state.prevWindows = ['<b id=chipx>A</b>', 'B', 'C']; Retoma.state.prevTitle = '<i id=subx>t</i>'; Retoma.showResume(); });
  await page.waitForTimeout(300);
  ok(await page.locator('#pwn').count() === 0 && !(await page.evaluate(() => window.__pwned)), 'note HTML is shown as text');
  ok(await page.locator('#chipx').count() === 0, 'chips render as text, not HTML');
  ok(await page.locator('#subx').count() === 0, 'title line renders as text, not HTML');
  await page.evaluate(() => document.getElementById('startFreshBtn').click());
  await page.waitForTimeout(600);

  console.log('note: long title stays inside the card');
  await page.evaluate(() => { Retoma.state.prevTitle = 'y'.repeat(400); Retoma.showResume(); });
  await page.waitForTimeout(400);
  const fit = await page.evaluate(() => {
    const card = document.getElementById('resumeCard').getBoundingClientRect();
    const sub = document.getElementById('resumeSub').getBoundingClientRect();
    return { card: card.right, sub: sub.right };
  });
  ok(fit.sub <= fit.card + 1, 'long title does not overflow the card', JSON.stringify(fit));

  console.log('note: delete everything clears it');
  await page.evaluate(() => document.getElementById('startFreshBtn').click());
  await page.waitForTimeout(400);
  await typeNote(page, 'to be deleted');
  await page.evaluate(() => Retoma.deleteAll());
  await page.waitForTimeout(800);
  const stored = await page.evaluate(() => localStorage.getItem('retoma.note.demo'));
  ok(stored === null || stored === '', 'Delete everything removes the stored note', String(stored));
  await openNow(page);
  ok(await page.inputValue('#leaveNote') === '', 'Delete everything empties the field');

  ok(errs.length === 0, 'no console errors', errs.join(' | '));

  await browser.close();
  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
