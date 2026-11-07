/* tests/accept-more.test.js — after Accept the card stays: it says the block is
 * planned and offers "Suggest another with AI"; a new AI suggestion brings back
 * Accept / Adjust / No, thanks. No, thanks still closes the card.
 * Run with: node tests/accept-more.test.js */
'use strict';
const { chromium } = require('playwright');
const path = require('path');
const { pathToFileURL } = require('url');
let passed = 0, failed = 0;
function ok(c, n, d) { if (c) { passed++; console.log('  ok ' + n); } else { failed++; console.log('  FAIL ' + n + (d ? '\n       ' + d : '')); } }

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => {
    window.__calls = 0;
    window.retoma = {
      propose: function () {
        window.__calls++;
        return new Promise(function (resolve) {
          setTimeout(function () {
            resolve({ source: 'Retoma server · gemma4:31b', quota: { left: 46, limit: 50 }, start: '10:15', minutes: 30, reason: 'Second idea.' });
          }, 150);
        });
      },
      previewPayload: function (s) { return Promise.resolve({ prompt: JSON.stringify(s) }); },
      aiQuota: function () { return Promise.resolve({ left: 47, limit: 50 }); },
      aiStatus: function () { return Promise.resolve({ reachable: true, model: 'gemma4:31b' }); },
      capabilities: function () { return Promise.resolve({ cloudAvailable: false }); }
    };
  });
  await p.goto(pathToFileURL(path.resolve(__dirname, '..', 'index.html')).href);
  await p.waitForFunction(() => window.Retoma && !document.body.classList.contains('is-launch'));
  await p.evaluate(() => { Retoma.state.aiMode = 'server'; Retoma.state.aiConsent.server = true; Retoma.showEndOfDay(); });
  await p.waitForTimeout(400);

  const before = await p.locator('#proposalText').textContent();
  await p.click('#proposalAccept');
  await p.waitForTimeout(350);
  ok(await p.locator('#proposalCard').isVisible(), 'Accept keeps the card on screen');
  ok(await p.locator('#proposalCard.is-accepted').count() === 1, 'card is marked accepted');
  ok(await p.locator('#proposalAccepted').isVisible(), 'a Planned line confirms the accept');
  ok(/Planned/.test(await p.locator('#proposalAccepted').textContent()), 'line says Planned', await p.locator('#proposalAccepted').textContent());
  ok(!(await p.locator('#proposalAccept').isVisible()), 'Accept is gone once accepted');
  ok(await p.locator('#aiSuggestBtn').isVisible(), 'AI button still on screen');
  ok(/Suggest another with AI/.test(await p.locator('#aiSuggestLabel').textContent()), 'AI button offers another suggestion', await p.locator('#aiSuggestLabel').textContent());
  ok(await p.locator('#proposalText').textContent() === before, 'accepted text stays as it was');
  const saved = await p.evaluate(() => localStorage.getItem('retoma-block-demo'));
  ok(saved && /"start"/.test(saved) && /"minutes"/.test(saved), 'accepted block is saved', saved);

  // A re-render (live episode, timeline refresh) must not undo the accept.
  await p.evaluate(() => Retoma.renderTimeline());
  await p.waitForTimeout(150);
  ok(await p.locator('#proposalCard.is-accepted').count() === 1, 'renderTimeline keeps the accepted state');

  const callsBefore = await p.evaluate(() => window.__calls);
  await p.click('#aiSuggestBtn');
  await p.waitForTimeout(600);
  ok(await p.evaluate(() => window.__calls) === callsBefore + 1, 'Suggest another calls the model once');
  ok(/10:15/.test(await p.locator('#proposalText').textContent()), 'new suggestion is painted', await p.locator('#proposalText').textContent());
  ok(await p.locator('#proposalCard.is-accepted').count() === 0, 'new suggestion clears the accepted state');
  ok(await p.locator('#proposalAccept').isVisible(), 'Accept is back for the new one');
  ok(await p.locator('#proposalAccepted.is-hidden').count() === 1 && !(await p.locator('#proposalAccepted').isVisible()), 'Planned line hides for the new one');
  ok(/^Suggest with AI$/.test((await p.locator('#aiSuggestLabel').textContent()).trim()), 'button label back to Suggest with AI');

  await p.click('#proposalDecline');
  await p.waitForTimeout(300);
  ok(await p.locator('#proposalCard.is-hidden').count() === 1, 'No, thanks still closes the card');

  // End of day starts fresh: not accepted.
  await p.evaluate(() => Retoma.showEndOfDay());
  await p.waitForTimeout(300);
  ok(await p.locator('#proposalCard.is-accepted').count() === 0 && await p.locator('#proposalAccept').isVisible(), 'end of day shows a fresh, unaccepted proposal');

  // Spanish copy
  ok(await p.evaluate(() => !!(window.I18n || window.i18n)), 'i18n present');
  ok(errs.length === 0, 'no page errors', errs.join(' | '));
  await b.close();
  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
