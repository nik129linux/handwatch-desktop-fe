/* tests/mood.test.js — the ring's moods follow the app state (js/mood.js + css/app.css).
 * Run with: node tests/mood.test.js */
'use strict';
const { chromium } = require('playwright');
const path = require('path');
const { pathToFileURL } = require('url');
let passed = 0, failed = 0;
function ok(c, n, d) { if (c) { passed++; console.log('  ok ' + n); } else { failed++; console.log('  FAIL ' + n + (d ? '\n       ' + d : '')); } }
const mood = (p) => p.evaluate(() => document.documentElement.getAttribute('data-mood'));
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(pathToFileURL(path.resolve(__dirname, '..', 'index.html')).href);
  await p.waitForFunction(() => window.Retoma && window.Mood && !document.body.classList.contains('is-launch'));
  await p.waitForTimeout(400);
  ok(await mood(p) === 'watching', 'watching on launch');
  ok(await p.evaluate(() => getComputedStyle(document.querySelector('.now-ring')).animationName) === 'ring-breathe', 'watching breathes');
  await p.click('#retomaToggle'); await p.waitForTimeout(450);
  ok(await mood(p) === 'paused', 'eye -> paused');
  ok(await p.evaluate(() => getComputedStyle(document.querySelector('.now-ring')).animationName) === 'none', 'paused ring is still');
  await p.click('#retomaToggle'); await p.waitForTimeout(450);
  await p.click('#freeMode [data-act="away"]'); await p.waitForTimeout(450);
  ok(await mood(p) === 'away', 'step away -> away');
  await p.click('#freeMode [data-act="return"]'); await p.waitForTimeout(450);
  ok(await mood(p) === 'back', 'come back -> back (AI off)');
  ok(await p.evaluate(() => getComputedStyle(document.querySelector('.titlebar .menu-bar__left'), '::before').transform !== 'matrix(0, 0, 0, 0, 0, 0)'), 'back shows the dot');
  await p.evaluate(() => { Retoma.state.aiMode = 'local'; Retoma.state.aiConsent.local = true; Retoma.showResume(); });
  await p.waitForTimeout(450);
  ok(await mood(p) === 'thinking', 'AI on and line pending -> thinking');
  ok(await p.evaluate(() => getComputedStyle(document.querySelector('.brand-mark')).animationName) === 'mark-turn', 'thinking turns the mark');
  await p.evaluate(() => { const a = document.getElementById('resumeAi'); a.textContent = 'You were in Document.'; a.classList.remove('is-hidden'); });
  await p.waitForTimeout(450);
  ok(await mood(p) === 'back', 'line arrived -> back');
  await p.evaluate(() => { Retoma.state.aiMode = 'off'; document.getElementById('retomarBtn').click(); Retoma.showEndOfDay(); Retoma.switchTab('hoy'); });
  await p.waitForTimeout(700);
  await p.click('#proposalAccept'); await p.waitForTimeout(120);
  ok(await mood(p) === 'accepted', 'accept -> wink');
  await p.waitForTimeout(900);
  ok(await mood(p) === 'watching', 'wink is transient');
  await p.emulateMedia({ reducedMotion: 'reduce' }); await p.waitForTimeout(200);
  ok(await p.evaluate(() => getComputedStyle(document.querySelector('.now-ring')).animationName) === 'none', 'reduced motion: no loop');
  ok(errs.length === 0, 'no page errors', errs.join(' | '));
  await b.close();
  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
