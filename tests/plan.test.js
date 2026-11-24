/* tests/plan.test.js — an accepted proposal comes back as tomorrow's plan.
 * The clock is injectable so the test never waits a day.
 * Run with: node tests/plan.test.js */
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

  await p.evaluate(() => Retoma.showEndOfDay());
  await p.waitForTimeout(300);
  await p.evaluate(() => Retoma.acceptProposal());
  const block = await p.evaluate(() => JSON.parse(localStorage.getItem('retoma-block-demo')));
  ok(block && block.app && block.start && block.minutes, 'accept stores app, start and minutes', JSON.stringify(block));
  ok(/^\d{4}-\d{2}-\d{2}$/.test(block.plannedFor), 'accept stores the planned day', JSON.stringify(block));
  ok(await p.locator('#planCard.is-hidden').count() === 1, 'the plan card is not due on the same day');

  await p.evaluate(() => {
    const t = Date.now() + 2 * 24 * 3600 * 1000;
    window.__retomaNow = () => t;
    Retoma.checkPlanCard();
    Retoma.switchTab('ahora');
  });
  await p.waitForTimeout(150);
  ok(await p.locator('#planCard').isVisible(), 'the plan card appears on the planned day');
  const text = (await p.locator('#planText').textContent()) || '';
  ok(text.includes(block.app) && text.includes(block.start) && text.includes(String(block.minutes)), 'card names app, start and minutes', text);
  ok(/Today's plan/.test(await p.locator('#planCard .proposal-card__label').textContent()), 'card is labelled Today\'s plan');

  await p.click('#planStart');
  await p.waitForTimeout(200);
  ok(await p.locator('#planCard.is-hidden').count() === 1, 'Start hides the plan card');
  const started = await p.evaluate(() => ({ app: Retoma.state.currentApp, clock: document.getElementById('deskClock').textContent }));
  const clockMin = (s) => { const a = String(s).split(':'); return (+a[0]) * 60 + (+a[1]); };
  ok(started.app === block.app, 'Start opens the planned app', JSON.stringify(started));
  ok(clockMin(started.clock) === clockMin(block.start), 'Start sets the planned start time', JSON.stringify(started));
  ok(await p.evaluate(() => localStorage.getItem('retoma-block-demo') === null), 'Start clears the stored plan');

  // Dismiss throws it away. Accept on the real clock again.
  await p.evaluate(() => { delete window.__retomaNow; Retoma.showEndOfDay(); });
  await p.waitForTimeout(250);
  await p.evaluate(() => Retoma.acceptProposal());
  await p.evaluate(() => {
    const t = Date.now() + 2 * 24 * 3600 * 1000;
    window.__retomaNow = () => t;
    Retoma.checkPlanCard();
    Retoma.switchTab('ahora');
  });
  await p.waitForTimeout(120);
  ok(await p.locator('#planCard').isVisible(), 'a second plan is due');
  await p.click('#planDismiss');
  await p.waitForTimeout(120);
  ok(await p.locator('#planCard.is-hidden').count() === 1, 'Dismiss hides the plan card');
  ok(await p.evaluate(() => localStorage.getItem('retoma-block-demo') === null), 'Dismiss clears the stored plan');

  ok(errs.length === 0, 'no page errors', errs.join(' | '));
  await b.close();
  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
