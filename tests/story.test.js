/* tests/story.test.js — the guided tour is step by step: the presenter (or someone alone with
 * the .exe) moves with Next/Back or the arrow keys, sees "N / 7", a title and a why line, and
 * one highlighted target per step. Nothing advances on its own.
 * Run with: node tests/story.test.js */
'use strict';
const { chromium } = require('playwright');
const path = require('path');
const { pathToFileURL } = require('url');
let passed = 0, failed = 0;
function ok(c, n, d) { if (c) { passed++; console.log('  ok ' + n); } else { failed++; console.log('  FAIL ' + n + (d ? '\n       ' + d : '')); } }
const INDEX = pathToFileURL(path.resolve(__dirname, '..', 'index.html')).href;

const STEPS = [
  { title: 'Retoma sees the app in use. Only the name, never what you type.', target: '.now-hero' },
  { title: 'You were interrupted. It notes it, never judges.', target: '#win-whatsapp' },
  { title: 'You stepped away for a while.', target: '#deskClock' },
  { title: 'When you return, it shows where you left off.', target: '#resumeCard' },
  { title: 'One tap and you are back to work.', target: '#retomarBtn' },
  { title: 'One simple suggestion. You decide.', target: '#proposalCard' },
  { title: 'Your history is yours. Deleted in one gesture.', target: '#privacyDelete' }
];

const txt = (p, sel) => p.evaluate((s) => { const e = document.querySelector(s); return e ? e.textContent.trim() : null; }, sel);
const focusInfo = (p) => p.evaluate(() => {
  const on = Array.from(document.querySelectorAll('.is-tour-focus'));
  return { count: on.length, ids: on.map(e => e.id || e.className) };
});
const isFocus = (p, sel) => p.evaluate((s) => { const e = document.querySelector(s); return !!(e && e.classList.contains('is-tour-focus')); }, sel);

async function open(b, lang) {
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  if (lang) await p.addInitScript((l) => localStorage.setItem('retoma.lang', l), lang);
  await p.goto(INDEX);
  await p.waitForFunction(() => window.Retoma && window.Story && !document.body.classList.contains('is-launch'));
  await p.waitForTimeout(400);
  return { p, errs };
}

(async () => {
  const b = await chromium.launch();

  console.log('tour: controls bar');
  {
    const { p } = await open(b);
    ok(await txt(p, '.sim-section[aria-label="Guided tour"] .sim-label') === 'Guided tour, 7 steps', 'label says 7 steps, no false duration', await txt(p, '.sim-section[aria-label="Guided tour"] .sim-label'));
    ok(await p.evaluate(() => !document.getElementById('storyPause')), 'no tour Pause button (nothing runs on its own)');
    ok(await p.evaluate(() => !document.getElementById('storyClock') && !/Status:/.test(document.querySelector('.sim-panel').textContent)), 'no "Status:" line');
    ok(await p.evaluate(() => { const c = document.getElementById('tourCard'); return !!c && getComputedStyle(c).display === 'none' && getComputedStyle(document.getElementById('freeMode')).display !== 'none'; }), 'caption hidden and free mode shown before the tour');
    await p.close();
  }

  console.log('tour: step by step, never on its own');
  const { p, errs } = await open(b);
  await p.click('#storyPlay');
  await p.waitForTimeout(400);
  ok(await p.evaluate(() => { const c = document.getElementById('tourCard'); return !!c && c.classList.contains('is-open') && getComputedStyle(c).display !== 'none'; }), 'caption card opens');
  ok(await txt(p, '#tourStep') === '1 / 7', 'counter 1 / 7', await txt(p, '#tourStep'));
  ok(await txt(p, '#subtitle') === STEPS[0].title, 'step 1 title', await txt(p, '#subtitle'));
  const why1 = await txt(p, '#tourWhy');
  ok(why1 && why1.length >= 30 && why1 !== STEPS[0].title, 'step 1 has a why line', why1);
  ok(await p.evaluate(() => document.getElementById('tourBack').disabled === true), 'Back disabled on step 1');
  await p.waitForTimeout(6000);
  ok(await txt(p, '#tourStep') === '1 / 7', 'no auto-advance after 6 s', await txt(p, '#tourStep'));

  const whys = [why1];
  for (let i = 0; i < STEPS.length; i++) {
    if (i > 0) {
      if (i % 2) await p.click('#tourNext'); else await p.keyboard.press('ArrowRight');
      await p.waitForTimeout(350);
    }
    const s = STEPS[i];
    ok(await txt(p, '#tourStep') === (i + 1) + ' / 7', 'counter ' + (i + 1) + ' / 7', await txt(p, '#tourStep'));
    ok(await txt(p, '#subtitle') === s.title, 'step ' + (i + 1) + ' title', await txt(p, '#subtitle'));
    const w = await txt(p, '#tourWhy');
    if (i > 0) whys.push(w);
    ok(w && w.length >= 30, 'step ' + (i + 1) + ' why line', w);
    ok(await isFocus(p, s.target), 'step ' + (i + 1) + ' highlights ' + s.target, JSON.stringify(await focusInfo(p)));
    ok((await focusInfo(p)).count === 1, 'step ' + (i + 1) + ' highlights exactly one thing', JSON.stringify(await focusInfo(p)));
    if (i === 1) ok(await p.evaluate(() => Retoma.state.currentApp === 'WhatsApp'), 'step 2 moved focus to WhatsApp');
    if (i === 2) {
      await p.waitForTimeout(3500);
      ok(await p.evaluate(() => Retoma.state.away === true), 'step 3 is away');
      ok(await txt(p, '#deskClock') === '09:26' || await txt(p, '#deskClock') === '09:25', 'step 3 clock moved 25 min', await txt(p, '#deskClock'));
    }
    if (i === 3) ok(await p.evaluate(() => document.getElementById('resumeCard').classList.contains('is-visible')), 'step 4 shows the resume card');
    if (i === 4) {
      await p.waitForTimeout(2500);
      ok(await p.evaluate(() => Desk.isVisible('Document') && Desk.isVisible('Browser')), 'step 5 pressed Resume and reopened the work windows');
    }
    if (i === 5) {
      const limes = await p.evaluate(() => {
        const accent = getComputedStyle(document.documentElement).getPropertyValue('--focus-ring').trim();
        const probe = document.createElement('i'); probe.style.color = accent; document.body.appendChild(probe);
        const rgb = getComputedStyle(probe).color; probe.remove();
        return Array.from(document.querySelectorAll('.window')).filter(w => !w.classList.contains('is-tour-focus') && getComputedStyle(w).borderTopColor === rgb).length;
      });
      ok(limes === 0, 'during the tour no window border competes with the spotlight', 'lime windows: ' + limes);
    }
    if (i === 5) ok(await p.evaluate(() => !document.getElementById('proposalCard').classList.contains('is-hidden')), 'step 6 shows the suggestion');
  }
  ok(new Set(whys).size === 7, 'seven different why lines');
  ok(/Finish/.test(await txt(p, '#tourNext')), 'last step: Next reads Finish', await txt(p, '#tourNext'));
  await p.waitForTimeout(2500);
  ok(await p.evaluate(() => Retoma.state.empty === true), 'step 7 deletes the history');

  console.log('tour: the caption never covers the stage');
  const boxes = await p.evaluate(() => {
    const r = (e) => { const b = e.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom }; };
    return {
      card: r(document.getElementById('tourCard')),
      dock: r(document.querySelector('.dock')),
      wins: Array.from(document.querySelectorAll('.window')).filter(w => w.offsetParent).map(r),
      inPanel: !!document.getElementById('tourCard').closest('.sim-panel'),
      freeHidden: getComputedStyle(document.getElementById('freeMode')).display === 'none'
    };
  });
  const hit = (a, c) => a.l < c.r && c.l < a.r && a.t < c.b && c.t < a.b;
  ok(!hit(boxes.card, boxes.dock), 'caption and dock do not overlap', JSON.stringify(boxes.card));
  ok(boxes.wins.length > 0 && boxes.wins.every(w => !hit(boxes.card, w)), 'caption overlaps no window', JSON.stringify(boxes));
  ok(boxes.inPanel && boxes.freeHidden, 'caption takes the place of the (disabled) free mode while the tour runs');
  ok(await p.evaluate(() => { const r = document.getElementById('tourStep').getBoundingClientRect(); const e = document.elementFromPoint(r.left + 4, r.top + r.height / 2); return !!e && e.closest('#tourCard') !== null; }), 'the counter is not covered by anything');

  await p.click('#tourNext');
  await p.waitForTimeout(400);
  ok(await p.evaluate(() => window.__storyDone === true), 'Finish ends the tour');
  ok(await p.evaluate(() => !document.getElementById('tourCard').classList.contains('is-open')), 'caption closes on finish');
  ok((await focusInfo(p)).count === 0, 'no highlight left after finish');
  ok(await p.evaluate(() => document.getElementById('storyPlay').disabled === false), 'tour can start again');

  console.log('tour: Back replays the previous step');
  await p.click('#storyPlay');
  await p.waitForTimeout(300);
  await p.click('#tourNext'); await p.waitForTimeout(300);
  await p.click('#tourNext'); await p.waitForTimeout(3500);
  await p.click('#tourNext'); await p.waitForTimeout(600);
  ok(await txt(p, '#tourStep') === '4 / 7', 'at step 4', await txt(p, '#tourStep'));
  await p.click('#tourBack'); await p.waitForTimeout(1200);
  ok(await txt(p, '#tourStep') === '3 / 7', 'Back -> 3 / 7', await txt(p, '#tourStep'));
  ok(await p.evaluate(() => Retoma.state.away === true && !document.getElementById('resumeCard').classList.contains('is-visible')), 'step 3 state: away, no resume card');
  await p.keyboard.press('ArrowLeft'); await p.waitForTimeout(800);
  ok(await txt(p, '#tourStep') === '2 / 7', 'ArrowLeft -> 2 / 7', await txt(p, '#tourStep'));
  ok(await p.evaluate(() => Retoma.state.away === false && Retoma.state.currentApp === 'WhatsApp'), 'step 2 state: back at WhatsApp, not away');
  ok(await isFocus(p, '#win-whatsapp') && (await focusInfo(p)).count === 1, 'step 2 highlight restored');

  console.log('tour: arrow keys ignored while typing');
  await p.focus('#leaveNote');
  await p.keyboard.press('ArrowRight'); await p.waitForTimeout(300);
  ok(await txt(p, '#tourStep') === '2 / 7', 'ArrowRight inside the note does not advance');
  await p.evaluate(() => document.activeElement.blur());

  console.log('tour: Skip to end');
  await p.click('#storySkip'); await p.waitForTimeout(500);
  ok(await p.evaluate(() => Retoma.state.empty === true && window.__storyDone === true), 'skip ends in the deleted state');
  ok(await p.evaluate(() => !document.getElementById('tourCard').classList.contains('is-open')) && (await focusInfo(p)).count === 0, 'skip closes caption and highlight');
  ok(errs.length === 0, 'no page errors', errs.join(' | '));
  await p.close();

  console.log('tour: Spanish');
  {
    const { p: es, errs: esErrs } = await open(b, 'es');
    ok(await txt(es, '.sim-section[aria-label="Guided tour"] .sim-label') === 'Tour guiado, 7 pasos' || await txt(es, '.sim-label') === 'Tour guiado, 7 pasos', 'ES label', await txt(es, '.sim-label'));
    await es.click('#storyPlay'); await es.waitForTimeout(500);
    ok(await txt(es, '#subtitle') === 'Retoma ve la app en uso. Solo el nombre, nunca lo que escribes.', 'ES step 1 title', await txt(es, '#subtitle'));
    const w = await txt(es, '#tourWhy');
    ok(w && w !== why1 && /[áéíóúñ]|\b(la|el|que|de)\b/.test(w), 'ES why line is Spanish', w);
    ok(/Siguiente/.test(await txt(es, '#tourNext')) && /Atrás/.test(await txt(es, '#tourBack')), 'ES Next/Back', (await txt(es, '#tourNext')) + ' / ' + (await txt(es, '#tourBack')));
    ok(await txt(es, '#tourStep') === '1 / 7', 'ES counter');
    ok(await es.evaluate(() => document.getElementById('leaveNote').value) === 'corregir la cita del párrafo 3', 'ES demo note is Spanish');
    for (let i = 0; i < 6; i++) { await es.click('#tourNext'); await es.waitForTimeout(i === 1 ? 3500 : 400); }
    ok(/Terminar/.test(await txt(es, '#tourNext')), 'ES last step reads Terminar', await txt(es, '#tourNext'));
    ok(esErrs.length === 0, 'ES no page errors', esErrs.join(' | '));
    await es.close();
  }

  await b.close();
  console.log('\nstory: ' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
