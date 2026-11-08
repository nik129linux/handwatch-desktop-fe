/* tests/today-computed.test.js — the day sentence and Planned/Actual come
 * from the same timeline the legend draws.
 * Run with: node tests/today-computed.test.js */
'use strict';
const { chromium } = require('playwright');
const path = require('path');
const { pathToFileURL } = require('url');
const seed = require('./support/seed');
let passed = 0, failed = 0;
function ok(c, n, d) { if (c) { passed++; console.log('  ok ' + n); } else { failed++; console.log('  FAIL ' + n + (d ? '\n       ' + d : '')); } }
const INDEX = pathToFileURL(path.resolve(__dirname, '..', 'index.html')).href;

async function paint(p, timeline) {
  await p.evaluate((tl) => {
    Retoma.state.timeline = tl;
    Retoma.state.empty = false;
    Retoma.renderTimeline();
  }, timeline);
  await p.waitForTimeout(80);
  return p.evaluate(() => ({
    sentence: document.getElementById('dayStatement').textContent,
    text: document.getElementById('timelineText').textContent,
    legend: document.getElementById('timelineLegend').textContent
  }));
}

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await seed(p, { lang: 'en' });
  await p.goto(INDEX);
  await p.waitForFunction(() => window.Retoma && !document.body.classList.contains('is-launch'));

  const a = await paint(p, [
    { app: 'Document', duration: 40 },
    { app: 'Browser', duration: 12 },
    { app: 'WhatsApp', duration: 18 },
    { app: 'Spreadsheet', duration: 10 }
  ]);
  ok(a.sentence === 'Today, the report won the morning', 'day 1 sentence follows the longest block', a.sentence);
  ok(/Planned: 40 min/.test(a.text) && /Actual: 1 h 20 min/.test(a.text), 'day 1 Planned/Actual computed', a.text);
  ok(/Document/.test(a.legend) && /longest block 40 min/.test(a.legend), 'day 1 legend agrees', a.legend);

  const c = await paint(p, [
    { app: 'Browser', duration: 60 },
    { app: 'Document', duration: 20 }
  ]);
  ok(/Today, Browser took the morning/.test(c.sentence), 'day 2 sentence changes with the data', c.sentence);
  ok(/Planned: 1 h/.test(c.text) && /Actual: 1 h 20 min/.test(c.text), 'day 2 Planned/Actual computed', c.text);
  ok(/Browser/.test(c.legend) && /longest block 60 min/.test(c.legend), 'day 2 legend agrees', c.legend);
  ok(errs.length === 0, 'no page errors', errs.join(' | '));
  await b.close();
  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
