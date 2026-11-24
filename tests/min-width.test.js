/* tests/min-width.test.js — at the app's minimum 1100x720 the demo controls
 * wrap instead of overflowing the viewport.
 * Run with: node tests/min-width.test.js */
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
  const p = await b.newPage({ viewport: { width: 1100, height: 720 } });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await seed(p, { lang: 'en' });
  await p.goto(INDEX);
  await p.waitForFunction(() => window.Retoma && !document.body.classList.contains('is-launch'));
  await p.waitForTimeout(300);

  const overflow = await p.evaluate(() => {
    const panel = document.querySelector('.sim-panel');
    const vw = window.innerWidth;
    const bad = [];
    if (panel) {
      const all = [panel].concat(Array.from(panel.querySelectorAll('*')));
      all.forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && (r.right > vw + 1 || r.left < -1)) {
          bad.push({ tag: el.tagName, cls: el.className, text: (el.textContent || '').trim().slice(0, 30), left: Math.round(r.left), right: Math.round(r.right) });
        }
      });
    }
    return { bad, scroll: document.documentElement.scrollWidth, vw };
  });
  ok(overflow.bad.length === 0, 'no .sim-panel element exceeds 1100px', JSON.stringify(overflow.bad.slice(0, 5)));
  ok(overflow.scroll <= overflow.vw + 1, 'the page does not scroll horizontally', JSON.stringify(overflow));
  const volver = await p.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('.sim-panel .btn')).find((b) => /Come back/.test(b.textContent));
    if (!btn) return null;
    const r = btn.getBoundingClientRect();
    return { right: Math.round(r.right), vw: window.innerWidth };
  });
  ok(volver && volver.right <= volver.vw, 'the last control stays inside the viewport', JSON.stringify(volver));
  ok(errs.length === 0, 'no page errors', errs.join(' | '));
  await b.close();
  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
