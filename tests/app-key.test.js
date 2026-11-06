/* tests/app-key.test.js — the Retoma server requires X-App-Key in production
 * (401 "app key required" without it). The desktop sends it from the main
 * process only: RETOMA_APP_KEY, else ai/app-key.json ({ "key": "..." },
 * gitignored, written at build time). No key -> no header, nothing breaks.
 * Run: node tests/app-key.test.js */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log('  ok ' + name); }
  catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + (e && e.message)); }
}

const ROOT = path.resolve(__dirname, '..');
const KEY_FILE = path.join(ROOT, 'ai', 'app-key.json');

function fresh() {
  delete require.cache[require.resolve('../ai/providers.js')];
  return require('../ai/providers.js');
}
function spy(seen) {
  return async (url, opts) => {
    seen.push({ url, headers: (opts && opts.headers) || {} });
    return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ ok: true, fallback: true }) };
  };
}
const METRICS = { perApp: { Document: 40 }, totalMinutes: 40, count: 1, longest: { app: 'Document', minutes: 40 } };
const SUMMARY = { perApp: { Document: 40 }, longest: { app: 'Document', minutes: 40 }, firstInterruption: null };

(async () => {
  const hadFile = fs.existsSync(KEY_FILE);
  const backup = hadFile ? fs.readFileSync(KEY_FILE) : null;
  const envBefore = process.env.RETOMA_APP_KEY;
  try {
    await test('env key goes out as X-App-Key on all four server routes', async () => {
      process.env.RETOMA_APP_KEY = 'env-key';
      const p = fresh();
      const seen = [];
      const o = { apiBase: 'http://x', fetchImpl: spy(seen) };
      await Promise.allSettled([
        p.serverPropose(SUMMARY, o),
        p.serverResumeLine({ app: 'Document' }, o),
        p.serverHabits(METRICS, o),
        p.serverAsk(METRICS, 'longest?', o)
      ]);
      assert.strictEqual(seen.length, 4);
      seen.forEach((s) => assert.strictEqual(s.headers['X-App-Key'], 'env-key', s.url));
    });
    await test('ai/app-key.json is used when the env is unset', async () => {
      delete process.env.RETOMA_APP_KEY;
      fs.writeFileSync(KEY_FILE, JSON.stringify({ key: 'file-key' }));
      const p = fresh();
      const seen = [];
      await p.serverAsk(METRICS, 'q', { apiBase: 'http://x', fetchImpl: spy(seen) }).catch(() => {});
      assert.strictEqual(seen[0].headers['X-App-Key'], 'file-key');
    });
    await test('no key anywhere -> no header, call still made', async () => {
      delete process.env.RETOMA_APP_KEY;
      if (fs.existsSync(KEY_FILE)) fs.unlinkSync(KEY_FILE);
      const p = fresh();
      const seen = [];
      await p.serverAsk(METRICS, 'q', { apiBase: 'http://x', fetchImpl: spy(seen) }).catch(() => {});
      assert.strictEqual(seen.length, 1);
      assert.ok(!('X-App-Key' in seen[0].headers));
    });
    await test('the key never reaches the renderer or git', () => {
      ['preload.js', 'index.html'].concat(fs.readdirSync(path.join(ROOT, 'js')).map((f) => 'js/' + f)).forEach((f) => {
        const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
        assert.ok(!/app-key|X-App-Key|RETOMA_APP_KEY/i.test(src), f + ' mentions the app key');
      });
      const ignore = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8');
      assert.ok(/^ai\/app-key\.json$/m.test(ignore), '.gitignore lists ai/app-key.json');
    });
  } finally {
    if (hadFile) fs.writeFileSync(KEY_FILE, backup);
    else if (fs.existsSync(KEY_FILE)) fs.unlinkSync(KEY_FILE);
    if (envBefore === undefined) delete process.env.RETOMA_APP_KEY;
    else process.env.RETOMA_APP_KEY = envBefore;
  }
  console.log('\napp-key: ' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
})();
