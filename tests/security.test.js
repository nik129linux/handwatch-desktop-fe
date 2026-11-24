/* tests/security.test.js — live app names stay text and the page ships a CSP.
 * Run with: node tests/security.test.js */
'use strict';
const fs = require('fs');
const { chromium } = require('playwright');
const path = require('path');
const { pathToFileURL } = require('url');
const seed = require('./support/seed');
let passed = 0, failed = 0;
function ok(c, n, d) { if (c) { passed++; console.log('  ok ' + n); } else { failed++; console.log('  FAIL ' + n + (d ? '\n       ' + d : '')); } }
const ROOT = path.resolve(__dirname, '..');
const INDEX = pathToFileURL(path.join(ROOT, 'index.html')).href;

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error' && /Content Security Policy/i.test(m.text())) errs.push(m.text()); });
  await seed(p, { lang: 'en' });
  await p.goto(INDEX);
  await p.waitForFunction(() => window.Retoma && !document.body.classList.contains('is-launch'));

  const csp = await p.evaluate(() => {
    const m = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
    return m ? m.getAttribute('content') : '';
  });
  ok(/default-src 'self'/.test(csp) && /object-src 'none'/.test(csp), 'index.html declares a real CSP', csp.slice(0, 120));
  ok(!/unsafe-eval/.test(csp), 'CSP does not allow unsafe-eval');
  ok(await p.evaluate(() => !!window.Retoma && !!window.I18n), 'the app scripts still run under the CSP');

  const hostile = '<img id="xssProbe" src="x" onerror="window.__xss=1">';
  await p.evaluate(async (name) => {
    await Live.setMode('live');
    Retoma.state.liveTimeline = [{ app: name, duration: 12 }, { app: 'Document', duration: 40 }];
    Retoma.state.liveEmpty = false;
    Retoma.renderTimeline();
  }, hostile);
  await p.waitForTimeout(300);
  const escaped = await p.evaluate(() => ({
    probe: !!document.getElementById('xssProbe'),
    xss: !!window.__xss,
    legend: document.getElementById('timelineLegend').textContent
  }));
  ok(!escaped.probe && !escaped.xss, 'a hostile live app name is never parsed as HTML', JSON.stringify(escaped));
  ok(escaped.legend.includes('xssProbe'), 'the hostile name is shown literally', escaped.legend.slice(0, 120));

  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  ok(!/--no-sandbox/.test(pkg.scripts.start), 'npm start no longer forces --no-sandbox', pkg.scripts.start);
  ok(errs.length === 0, 'no page or CSP errors', errs.join(' | '));
  await b.close();
  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
