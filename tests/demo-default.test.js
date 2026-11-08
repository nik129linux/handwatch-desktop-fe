/* tests/demo-default.test.js — a fresh launch is Demo; Reset demo cleans the
 * demo history and replays the welcome.
 * Run with: node tests/demo-default.test.js */
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
  await p.waitForFunction(() => window.Retoma && window.Live && !document.body.classList.contains('is-launch'));
  ok(await p.evaluate(() => Live.getMode()) === 'demo', 'a fresh profile opens in Demo');
  ok(!(await p.evaluate(() => document.body.classList.contains('is-live'))), 'the Demo desktop is the visible one');

  // A saved Live with no helper must fall back to Demo on launch.
  await p.evaluate(() => localStorage.setItem('retoma-settings-v1', JSON.stringify({ mode: 'live' })));
  await p.reload({ waitUntil: 'load' });
  await p.waitForFunction(() => window.Retoma && window.Live && !document.body.classList.contains('is-launch'));
  await p.waitForTimeout(300);
  ok(await p.evaluate(() => Live.getMode()) === 'demo', 'saved Live without the helper opens in Demo');
  const savedMode = await p.evaluate(() => JSON.parse(localStorage.getItem('retoma-settings-v1')).mode);
  ok(savedMode === 'demo', 'the fallback is persisted', savedMode);

  // Reset demo: clean history + welcome replay.
  await p.evaluate(() => {
    Retoma.state.timeline = [{ app: 'Document', duration: 40 }];
    Retoma.state.empty = false;
    Retoma.renderTimeline();
    localStorage.setItem('retoma-events-demo-v1', JSON.stringify({ version: 1, events: [{ app: 'Document', duration: 40 }] }));
  });
  await p.evaluate(() => Retoma.switchTab('config'));
  await p.click('#resetDemo');
  await p.waitForTimeout(400);
  const after = await p.evaluate(() => ({
    mode: Live.getMode(),
    live: document.body.classList.contains('is-live'),
    timeline: Retoma.state.timeline.length,
    empty: Retoma.state.empty,
    stored: localStorage.getItem('retoma-events-demo-v1'),
    guide: !document.getElementById('guideOverlay').classList.contains('is-hidden')
  }));
  ok(after.mode === 'demo' && !after.live, 'Reset demo sets Demo mode', JSON.stringify(after));
  ok(after.timeline === 0 && after.empty, 'Reset demo clears the demo history', JSON.stringify(after));
  ok(after.stored === null, 'Reset demo clears the stored demo events', String(after.stored));
  ok(after.guide, 'Reset demo replays the welcome', JSON.stringify(after));
  ok(errs.length === 0, 'no page errors', errs.join(' | '));
  await b.close();
  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
