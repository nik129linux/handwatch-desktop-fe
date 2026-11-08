/* tests/motion.test.js — motion the app really runs: resume zoom, chip FLIP,
 * window fly-in and legend count-up. Reduced motion removes all of it.
 * Run with: node tests/motion.test.js */
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

  await p.evaluate(() => { Retoma.goAway(25); Retoma.comeBack(); });
  const resume = await p.evaluate(() => ({
    card: getComputedStyle(document.getElementById('resumeCard')).animationName,
    chip: getComputedStyle(document.querySelector('.resume-chip')).animationName,
    chipDelay: getComputedStyle(document.querySelectorAll('.resume-chip')[1] || document.querySelector('.resume-chip')).animationDelay
  }));
  ok(/resume-zoom/.test(resume.card), 'resume card runs a real zoom animation', JSON.stringify(resume));
  ok(/chip-in/.test(resume.chip), 'chips run a real FLIP animation', JSON.stringify(resume));
  ok(/70ms|0\.07s/.test(resume.chipDelay), 'chips are staggered', JSON.stringify(resume));

  await p.evaluate(() => document.getElementById('retomarBtn').click());
  await p.waitForTimeout(60);
  const fly = await p.evaluate(() => getComputedStyle(document.getElementById('win-doc')).animationName);
  ok(/window-fly-in/.test(fly), 'windows fly in from the dock with --fx/--fy', fly);

  await p.evaluate(() => Retoma.showEndOfDay());
  await p.waitForTimeout(60);
  const counting = await p.evaluate(() => {
    const n = document.querySelector('.count-up');
    return { present: !!n, value: n ? parseInt(n.textContent, 10) : -1, finalHint: document.getElementById('timelineLegend').textContent };
  });
  ok(counting.present, 'legend minutes use a count-up element', JSON.stringify(counting));
  await p.waitForTimeout(700);
  const final = await p.evaluate(() => parseInt(document.querySelector('.count-up').textContent, 10));
  ok(final > 0, 'count-up lands on the real number', String(final));
  ok(errs.length === 0, 'no page errors', errs.join(' | '));
  await p.close();

  // Reduced motion: no zoom and no chip animation.
  const r = await b.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  await seed(r, { lang: 'en' });
  await r.goto(INDEX);
  await r.waitForFunction(() => window.Retoma && !document.body.classList.contains('is-launch'));
  await r.evaluate(() => { Retoma.goAway(25); Retoma.comeBack(); });
  const reduced = await r.evaluate(() => ({
    card: getComputedStyle(document.getElementById('resumeCard')).animationName,
    chip: getComputedStyle(document.querySelector('.resume-chip')).animationName
  }));
  ok(!/resume-zoom/.test(reduced.card) && !/chip-in/.test(reduced.chip), 'reduced motion turns the motion off', JSON.stringify(reduced));
  await r.close();
  await b.close();
  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
