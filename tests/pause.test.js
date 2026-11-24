/* tests/pause.test.js — Pause lasts 30 minutes, then Retoma resumes itself.
 * Run with: node tests/pause.test.js */
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
  await p.addInitScript(() => {
    const base = 1700000000000;
    window.__now = base;
    window.__retomaNow = () => window.__now;
  });
  await p.goto(INDEX);
  await p.waitForFunction(() => window.Retoma && !document.body.classList.contains('is-launch'));

  ok((await p.getAttribute('#retomaToggle', 'aria-label')) === 'Pause Retoma', 'eye starts as Pause Retoma');
  await p.click('#retomaToggle');
  await p.waitForTimeout(100);
  const paused = await p.evaluate(() => ({ paused: Retoma.isPaused(), until: Retoma.state.pausedUntil, now: window.__now }));
  ok(paused.paused, 'the eye pauses');
  ok(paused.until === paused.now + 30 * 60000, 'pause is exactly 30 minutes', JSON.stringify(paused));
  ok((await p.getAttribute('#retomaToggle', 'aria-label')) === 'Resume Retoma', 'eye label switches to Resume Retoma');

  await p.evaluate(() => { window.__now += 31 * 60000; });
  await p.evaluate(() => Retoma.resumeIfPauseExpired());
  await p.waitForTimeout(100);
  const resumed = await p.evaluate(() => ({ paused: Retoma.isPaused(), until: Retoma.state.pausedUntil }));
  ok(!resumed.paused && resumed.until === 0, 'after 30 minutes Retoma resumes on its own', JSON.stringify(resumed));
  ok((await p.getAttribute('#retomaToggle', 'aria-label')) === 'Pause Retoma', 'eye label returns to Pause Retoma');

  await p.evaluate(() => { window.__now += 1000; Retoma.togglePause(); });
  await p.waitForTimeout(80);
  ok(await p.evaluate(() => Retoma.isPaused()), 'a second pause works');
  await p.evaluate(() => Retoma.togglePause());
  await p.waitForTimeout(80);
  ok(await p.evaluate(() => !Retoma.isPaused()), 'manual Resume still works before 30 minutes');

  ok(errs.length === 0, 'no page errors', errs.join(' | '));
  await b.close();
  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
