/* tests/polish.test.js — the unslop P0 pass approved on 2026-11-06 (polish mode, brand kept).
 * Run with: node tests/polish.test.js */
'use strict';
const { chromium } = require('playwright');
const path = require('path');
const { pathToFileURL } = require('url');
let passed = 0, failed = 0;
function ok(c, n, d) { if (c) { passed++; console.log('  ok ' + n); } else { failed++; console.log('  FAIL ' + n + (d ? '\n       ' + d : '')); } }
const INDEX = pathToFileURL(path.resolve(__dirname, '..', 'index.html')).href;

async function open(b, opts) {
  opts = opts || {};
  const p = await b.newPage({ viewport: { width: opts.w || 1440, height: 900 } });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript((o) => { if (o.lang) localStorage.setItem('retoma.lang', o.lang); if (o.theme) localStorage.setItem('retoma-theme', o.theme); }, opts);
  await p.goto(INDEX);
  await p.waitForFunction(() => window.Retoma && !document.body.classList.contains('is-launch'));
  await p.waitForTimeout(500);
  return { p, errs };
}

(async () => {
  const b = await chromium.launch();

  for (const theme of ['dark', 'light']) {
    const { p, errs } = await open(b, { theme });
    console.log('[' + theme + '] stage has no decorative particles');
    ok(await p.evaluate(() => !document.getElementById('presenceField') && !document.querySelector('.desktop-workspace canvas, .desktop-area canvas')), '[' + theme + '] no particle canvas on the stage');

    console.log('[' + theme + '] controls bar');
    const rows = await p.evaluate(() => {
      const tops = {};
      document.querySelectorAll('#freeMode .btn').forEach(bt => {
        const t = Math.round(bt.getBoundingClientRect().top / 4) * 4;
        tops[t] = (tops[t] || 0) + 1;
      });
      return tops;
    });
    ok(Object.values(rows).every(n => n >= 2), '[' + theme + '] no free-mode button alone on a row', JSON.stringify(rows));
    const pauses = await p.evaluate(() => Array.from(document.querySelectorAll('.sim-panel button')).filter(x => x.offsetParent && /^\s*Pause/.test(x.textContent)).length);
    ok(pauses <= 1, '[' + theme + '] at most one Pause button in the controls', 'found ' + pauses);

    console.log('[' + theme + '] tab bar does not jump when the resume card appears');
    const before = await p.evaluate(() => Math.round(document.querySelector('.retoma-tabs').getBoundingClientRect().top));
    await p.evaluate(() => { Retoma.goAway(25); Retoma.comeBack(); });
    await p.waitForTimeout(900);
    const after = await p.evaluate(() => Math.round(document.querySelector('.retoma-tabs').getBoundingClientRect().top));
    ok(Math.abs(before - after) <= 1, '[' + theme + '] tabs stay put', before + ' -> ' + after);
    ok(await p.evaluate(() => document.getElementById('resumeCard').classList.contains('is-visible')), '[' + theme + '] resume card still shows');
    const order = await p.evaluate(() => {
      const t = document.querySelector('.retoma-tabs').getBoundingClientRect();
      const r = document.getElementById('resumeCard').getBoundingClientRect();
      return { tabsBottom: t.bottom, cardTop: r.top };
    });
    ok(order.cardTop >= order.tabsBottom, '[' + theme + '] resume card sits below the tabs', JSON.stringify(order));

    console.log('[' + theme + '] Today legend');
    await p.evaluate(() => { Retoma.showEndOfDay(); Retoma.switchTab('hoy'); });
    await p.waitForTimeout(600);
    const legend = await p.evaluate(() => Array.from(document.querySelectorAll('.timeline-legend__item')).map(it => {
      const lh = parseFloat(getComputedStyle(it).lineHeight) || parseFloat(getComputedStyle(it).fontSize) * 1.5;
      return { text: it.textContent.trim(), h: Math.round(it.getBoundingClientRect().height), lh: Math.round(lh) };
    }));
    ok(legend.length >= 3, '[' + theme + '] legend rendered', JSON.stringify(legend));
    ok(legend.every(x => x.h < x.lh * 1.8), '[' + theme + '] every legend item on one line', JSON.stringify(legend));

    console.log('[' + theme + '] keyboard focus is visible');
    await p.evaluate(() => document.activeElement && document.activeElement.blur());
    await p.keyboard.press('Tab');
    await p.keyboard.press('Tab');
    const ring = await p.evaluate(() => {
      const e = document.activeElement; const cs = getComputedStyle(e);
      return { tag: e.tagName, id: e.id || e.className, outline: cs.outlineStyle + ' ' + cs.outlineWidth, shadow: cs.boxShadow };
    });
    ok(ring.tag !== 'BODY' && ((ring.outline.indexOf('none') !== 0 && parseFloat(ring.outline.split(' ')[1]) >= 2) || (ring.shadow && ring.shadow !== 'none')), '[' + theme + '] focused control shows a ring', JSON.stringify(ring));
    ok(errs.length === 0, '[' + theme + '] no page errors', errs.join(' | '));
    await p.close();
  }

  console.log('Spanish demo windows');
  {
    const { p } = await open(b, { lang: 'es' });
    const titles = await p.evaluate(() => ({
      wa: document.querySelector('#win-whatsapp .window__title').textContent.trim(),
      sheet: document.querySelector('#win-sheet .window__title').textContent.trim()
    }));
    ok(titles.wa === 'Mensajes · Ana', 'WhatsApp window title in Spanish', titles.wa);
    ok(titles.sheet === 'Datos · Tracker', 'Spreadsheet window title in Spanish', titles.sheet);
    const h = await p.evaluate(() => {
      const hh = (id) => Math.round(document.getElementById(id).getBoundingClientRect().height);
      return { doc: hh('win-doc'), browser: hh('win-browser'), wa: hh('win-whatsapp'), sheet: hh('win-sheet') };
    });
    ok(Math.abs(h.doc - h.browser) <= 1 && Math.abs(h.wa - h.sheet) <= 1, 'windows in a row share one height (ES)', JSON.stringify(h));
    await p.close();
  }

  await b.close();
  console.log('\npolish: ' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
