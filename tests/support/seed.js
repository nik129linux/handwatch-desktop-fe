/* tests/support/seed.js — fixture for tests that do not exercise the guide.
 * Spanish is the app default and the first-run guide is a real modal, so a
 * test that wants a plain screen marks the guide and its coach marks as seen.
 * Tests for the guide itself (tests/settings-guide.test.js) never use this. */
'use strict';

var TIPS = { note: 1, today: 1, privacy: 1, settings: 1 };

function seed(page, opts) {
  var o = opts || {};
  return page.addInitScript(function (cfg) {
    try {
      window.localStorage.setItem('retoma-guide-v1', '1');
      window.localStorage.setItem('retoma-tips-v1', JSON.stringify(cfg.tips));
      if (cfg.lang) window.localStorage.setItem('retoma.lang', cfg.lang);
    } catch (e) { /* storage unavailable: the test will say so */ }
  }, { tips: TIPS, lang: o.lang || '' });
}

module.exports = seed;
