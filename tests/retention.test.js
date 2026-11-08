/* tests/retention.test.js — 7-day retention works because ts survives reload.
 * Run with: node tests/retention.test.js */
'use strict';
const { chromium } = require('playwright');
const path = require('path');
const { pathToFileURL } = require('url');
let passed = 0, failed = 0;
function ok(c, n, d) { if (c) { passed++; console.log('  ok ' + n); } else { failed++; console.log('  FAIL ' + n + (d ? '\n       ' + d : '')); } }
const INDEX = pathToFileURL(path.resolve(__dirname, '..', 'index.html')).href;

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  const oldTs = new Date(Date.now() - 9 * 24 * 3600 * 1000).toISOString();
  const freshTs = new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString();
  await p.addInitScript(({ oldTs, freshTs }) => {
    localStorage.setItem('retoma-guide-v1', '1');
    localStorage.setItem('retoma-tips-v1', JSON.stringify({ note: 1, today: 1, privacy: 1, settings: 1 }));
    localStorage.setItem('retoma.lang', 'en');
    window.__freshTs = freshTs;
    localStorage.setItem('retoma-events-demo-v1', JSON.stringify({ version: 1, events: [
      { app: 'OldApp', duration: 30, ts: oldTs },
      { app: 'Document', duration: 40, ts: freshTs }
    ] }));
  }, { oldTs, freshTs });
  await p.goto(INDEX);
  await p.waitForFunction(() => window.Retoma && !document.body.classList.contains('is-launch'));

  const loaded = await p.evaluate(() => Retoma.state.timeline);
  ok(loaded.some(e => e.app === 'Document' && e.ts), 'load keeps ts on recent events', JSON.stringify(loaded));

  await p.evaluate(() => Retoma.reloadForMode('demo'));
  await p.waitForTimeout(150);
  const afterReload = await p.evaluate(() => Retoma.state.timeline);
  ok(!afterReload.some(e => e.app === 'OldApp'), 'events older than 7 days are pruned after reload', JSON.stringify(afterReload));
  ok(afterReload.some(e => e.app === 'Document' && e.ts === freshTs), 'reload keeps the existing ts', JSON.stringify(afterReload));

  // Two saves in a row must not re-stamp the old timestamp.
  await p.evaluate(async () => {
    await Persist.save(Retoma.state.timeline, 'demo');
    await Persist.save(Retoma.state.timeline, 'demo');
  });
  const saved = await p.evaluate(() => JSON.parse(localStorage.getItem('retoma-events-demo-v1')).events);
  ok(saved.some(e => e.app === 'Document' && e.ts === freshTs), 'ts is preserved across two saves', JSON.stringify(saved));
  ok(errs.length === 0, 'no page errors', errs.join(' | '));
  await b.close();
  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
