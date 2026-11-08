/* tests/face.test.js — the ring has a face: two eyes and a mouth that act out the mood.
 * Run with: node tests/face.test.js */
'use strict';
const { chromium } = require('playwright');
const path = require('path');
const { pathToFileURL } = require('url');
const seed = require('./support/seed');
let passed = 0, failed = 0;
function ok(c, n, d) { if (c) { passed++; console.log('  ok ' + n); } else { failed++; console.log('  FAIL ' + n + (d ? '\n       ' + d : '')); } }
const INDEX = pathToFileURL(path.resolve(__dirname, '..', 'index.html')).href;
// eye openness = scaleY of the computed transform of each .ring-eye in the Now ring
const face = (p, root) => p.evaluate((r) => {
  const ring = document.querySelector(r);
  if (!ring) return null;
  const eyes = Array.from(ring.querySelectorAll('.ring-eye'));
  const sy = (e) => { const m = new DOMMatrixReadOnly(getComputedStyle(e).transform === 'none' ? undefined : getComputedStyle(e).transform); return Math.round(m.d * 100) / 100; };
  const mouth = ring.querySelector('.ring-mouth');
  const vis = (e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0 && getComputedStyle(e).visibility !== 'hidden'; };
  return { eyes: eyes.length, visible: eyes.every(vis), open: eyes.map(sy), anim: eyes.map(e => getComputedStyle(e).animationName), mouth: mouth ? +getComputedStyle(mouth).opacity : -1, mood: document.documentElement.getAttribute('data-mood') };
}, root);
(async () => {
  const b = await chromium.launch();
  for (const lang of ['en', 'es']) {
    const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.addInitScript((l) => localStorage.setItem('retoma.lang', l), lang);
  await seed(p, { lang: lang });
    await p.goto(INDEX);
    await p.waitForFunction(() => window.Retoma && window.Mood && !document.body.classList.contains('is-launch'));
    await p.waitForTimeout(500);
    const L = '[' + lang + '] ';
    let f = await face(p, '#nowRing');
    ok(f && f.eyes === 2 && f.visible, L + 'Now ring has two visible eyes', JSON.stringify(f));
    ok(f && f.mouth >= 0, L + 'Now ring has a mouth', JSON.stringify(f));
    ok(f && f.anim.every(a => a === 'eye-blink'), L + 'watching: eyes blink', JSON.stringify(f));
    ok(await p.evaluate(() => { const r = document.getElementById('nowRing').getBoundingClientRect(); return r.width >= 120; }), L + 'the face is large (ring >= 120px)');
    ok(await p.evaluate(() => getComputedStyle(document.getElementById('nowRingLabel') || document.body).display === 'none' || !document.getElementById('nowRingLabel')), L + 'no number inside the face (minutes stay in #nowTime)');
    await p.click('#retomaToggle'); await p.waitForTimeout(500);
    f = await face(p, '#nowRing');
    ok(f.mood === 'paused' && f.open.every(v => v <= 0.3), L + 'paused: eyes closed', JSON.stringify(f));
    await p.click('#retomaToggle'); await p.waitForTimeout(400);
    await p.click('#freeMode [data-act="away"]'); await p.waitForTimeout(500);
    f = await face(p, '#nowRing');
    ok(f.mood === 'away' && f.open.every(v => v <= 0.3), L + 'away: eyes closed (asleep)', JSON.stringify(f));
    await p.click('#freeMode [data-act="return"]'); await p.waitForTimeout(700);
    f = await face(p, '#resumeCard');
    ok(f && f.eyes === 2 && f.visible, L + 'resume card shows the face too', JSON.stringify(f));
    ok(f && f.mood === 'back' && f.mouth >= 0.9 && f.open.every(v => v >= 0.9), L + 'back: eyes open and smiling', JSON.stringify(f));
    await p.emulateMedia({ reducedMotion: 'reduce' }); await p.waitForTimeout(200);
    f = await face(p, '#resumeCard');
    ok(f.anim.every(a => a === 'none'), L + 'reduced motion: no eye animation', JSON.stringify(f));
    ok(errs.length === 0, L + 'no page errors', errs.join(' | '));
    await p.close();
  }
  await b.close();
  console.log('\nface: ' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
