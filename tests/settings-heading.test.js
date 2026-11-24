/* tests/settings-heading.test.js — Settings has one heading: the tab.
 * Run with: node tests/settings-heading.test.js */
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
  await p.evaluate(() => Retoma.switchTab('config'));
  await p.waitForTimeout(200);

  const panel = await p.evaluate(() => ({
    labels: document.querySelectorAll('#retomaTabConfig .panel-section__label').length,
    tabs: Array.from(document.querySelectorAll('.retoma-tabs__btn')).filter((b) => b.getAttribute('data-tab') === 'config').length,
    heading: (document.querySelector('[data-tab="config"]').textContent || '').trim()
  }));
  ok(panel.labels === 0, 'no duplicated panel label under the tabs', JSON.stringify(panel));
  ok(panel.tabs === 1 && /Settings/.test(panel.heading), 'the tab is the single Settings heading', JSON.stringify(panel));
  ok(errs.length === 0, 'no page errors', errs.join(' | '));
  await b.close();
  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
