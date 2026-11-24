/* tests/resume-real.test.js — the resume card names the real interruption and
 * lists exactly the windows that were open before leaving.
 * Run with: node tests/resume-real.test.js */
'use strict';
const { chromium } = require('playwright');
const path = require('path');
const { pathToFileURL } = require('url');
const seed = require('./support/seed');
let passed = 0, failed = 0;
function ok(c, n, d) { if (c) { passed++; console.log('  ok ' + n); } else { failed++; console.log('  FAIL ' + n + (d ? '\n       ' + d : '')); } }
const INDEX = pathToFileURL(path.resolve(__dirname, '..', 'index.html')).href;

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await seed(p, { lang: 'en' });
  await p.goto(INDEX);
  await p.waitForFunction(() => window.Retoma && !document.body.classList.contains('is-launch'));

  await p.evaluate(() => {
    Desk.minimize('Browser');
    Desk.minimize('WhatsApp');
    Retoma.switchApp(Events.findByLabel('Browser'));
    Retoma.goAway(25);
    Retoma.comeBack();
  });
  await p.waitForTimeout(400);

  ok(await p.locator('#resumeCard').isVisible(), 'resume card is visible');
  const inter = (await p.locator('#resumeInter').textContent()) || '';
  ok(/Browser interrupted you/.test(inter), 'interruption is derived from the app that took focus', inter);
  const chips = await p.locator('.resume-chip').allTextContents();
  ok(chips.length === 2 && chips[0] === 'Document' && chips[1] === 'Spreadsheet', 'chips are exactly the open windows', JSON.stringify(chips));
  const hero = (await p.locator('#resumeHero').textContent()) || '';
  ok(/Document/.test(hero), 'hero names the task before the interruption', hero);
  ok(errs.length === 0, 'no page errors', errs.join(' | '));
  await b.close();
  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
