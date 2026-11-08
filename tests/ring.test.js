/* tests/ring.test.js — the Now ring fills with time in the task.
 * Run with: node tests/ring.test.js */
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

  const atZero = await p.evaluate(() => parseFloat(getComputedStyle(document.getElementById('nowRing')).getPropertyValue('--p')) || 0);
  ok(atZero < 0.2, 'ring starts nearly empty', String(atZero));

  await p.evaluate(() => { Retoma.state.timeInCurrent = 20; Retoma.renderAhora(); });
  await p.waitForTimeout(120);
  const after = await p.evaluate(() => ({
    p: parseFloat(getComputedStyle(document.getElementById('nowRing')).getPropertyValue('--p')) || 0,
    fill: getComputedStyle(document.querySelector('.now-ring__fill')).strokeDasharray,
    label: !!document.getElementById('nowRingLabel')
  }));
  ok(after.p > 0, 'after 20 min in a task --p is greater than zero', JSON.stringify(after));
  ok(after.p >= 0.79 && after.p <= 0.81, '20 of 25 minutes fills 0.8 of the ring', JSON.stringify(after));
  ok(after.label === false, 'no number inside the face', JSON.stringify(after));

  await p.evaluate(() => { Retoma.state.timeInCurrent = 25; Retoma.renderAhora(); });
  await p.waitForTimeout(120);
  const full = await p.evaluate(() => ({
    p: parseFloat(getComputedStyle(document.getElementById('nowRing')).getPropertyValue('--p')) || 0,
    cls: document.getElementById('nowRing').classList.contains('is-full')
  }));
  ok(full.p === 1 && full.cls, 'at 25 min the ring is full', JSON.stringify(full));
  ok(errs.length === 0, 'no page errors', errs.join(' | '));
  await b.close();
  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
