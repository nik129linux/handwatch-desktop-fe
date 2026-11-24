/* tests/history.test.js — in Now, Earlier/Later browse what you were doing before.
 * Run with: node tests/history.test.js */
'use strict';
const { chromium } = require('playwright');
const path = require('path');
const { pathToFileURL } = require('url');
const seed = require('./support/seed');
let passed = 0, failed = 0;
function ok(c, n, d) { if (c) { passed++; console.log('  ok ' + n); } else { failed++; console.log('  FAIL ' + n + (d ? '\n       ' + d : '')); } }
const INDEX = pathToFileURL(path.resolve(__dirname, '..', 'index.html')).href;
const txt = (p, s) => p.evaluate((x) => { const e = document.querySelector(x); return e ? e.textContent.trim() : null; }, s);
const dis = (p, s) => p.evaluate((x) => { const e = document.querySelector(x); return e ? e.disabled : null; }, s);
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await seed(p, { lang: 'en' });
  await p.goto(INDEX);
  await p.waitForFunction(() => window.Retoma && !document.body.classList.contains('is-launch'));
  await p.waitForTimeout(500);
  const tl = await p.evaluate(() => Retoma.state.timeline.map(e => ({ app: e.app, duration: e.duration })));
  ok(tl.length >= 3, 'demo timeline has entries', JSON.stringify(tl));
  ok(await p.evaluate(() => !!document.querySelector('#retomaTabAhora #nowPrev') && !!document.querySelector('#retomaTabAhora #nowNext')), 'Now has Earlier/Later buttons');
  ok(await p.evaluate(() => document.getElementById('nowPrev').getAttribute('aria-label') === 'Earlier' && document.getElementById('nowNext').getAttribute('aria-label') === 'Later'), 'buttons are labelled Earlier / Later');
  ok(await dis(p, '#nowNext') === true && await dis(p, '#nowPrev') === false, 'live: Later disabled, Earlier enabled');
  const live = await txt(p, '#nowApp');
  for (let k = 1; k <= tl.length; k++) {
    await p.click('#nowPrev'); await p.waitForTimeout(250);
    const e = tl[tl.length - k];
    ok(await txt(p, '#nowApp') === e.app, 'Earlier x' + k + ' shows ' + e.app, await txt(p, '#nowApp'));
    ok(new RegExp('\\b' + e.duration + ' min').test(await txt(p, '#nowTime')), 'Earlier x' + k + ' shows ' + e.duration + ' min', await txt(p, '#nowTime'));
    ok(new RegExp(k + ' of ' + tl.length).test(await txt(p, '#nowWhen')), 'position reads ' + k + ' of ' + tl.length, await txt(p, '#nowWhen'));
  }
  ok(await dis(p, '#nowPrev') === true, 'oldest: Earlier disabled');
  for (let k = 0; k < tl.length; k++) { await p.click('#nowNext'); await p.waitForTimeout(200); }
  ok(await txt(p, '#nowApp') === live && await dis(p, '#nowNext') === true, 'Later back to the live view', await txt(p, '#nowApp'));
  ok(!(await txt(p, '#nowWhen')) || !/ of /.test(await txt(p, '#nowWhen')), 'live view has no position', await txt(p, '#nowWhen'));
  await p.click('#nowPrev'); await p.waitForTimeout(200);
  await p.evaluate(() => Retoma.receiveWhatsapp()); await p.waitForTimeout(400);
  ok(await txt(p, '#nowApp') === 'WhatsApp', 'a new switch returns to live', await txt(p, '#nowApp'));
  await p.evaluate(() => Retoma.deleteAll()); await p.waitForTimeout(300);
  ok(await dis(p, '#nowPrev') === true, 'no history: Earlier disabled');
  ok(errs.length === 0, 'no page errors', errs.join(' | '));
  await p.close();
  const es = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await es.addInitScript(() => localStorage.setItem('retoma.lang', 'es'));
  await seed(es, { lang: 'es' });
  await es.goto(INDEX);
  await es.waitForFunction(() => window.Retoma && !document.body.classList.contains('is-launch'));
  await es.waitForTimeout(500);
  ok(await es.evaluate(() => document.getElementById('nowPrev').getAttribute('aria-label') === 'Antes' && document.getElementById('nowNext').getAttribute('aria-label') === 'Después'), 'ES labels Antes / Después');
  await es.click('#nowPrev'); await es.waitForTimeout(250);
  ok(/1 de \d/.test(await txt(es, '#nowWhen')), 'ES position reads 1 de N', await txt(es, '#nowWhen'));
  await es.close(); await b.close();
  console.log('\nhistory: ' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
