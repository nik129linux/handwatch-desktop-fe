/* tests/quota.test.js — Retoma server AI for habits/ask + visible daily quota.
 * Contract:
 *   serverHabits(metrics, { apiBase, fetchImpl, lang, timeoutMs, onQuota })
 *     POST <apiBase>/api/retoma/habits JSON { metrics, lang }
 *     reply { ok, note, experiment, source, fallback:false } must pass
 *     habits.validateReport + habits.groundedReport or it throws -> rules.
 *   serverAsk(metrics, question, { ... })
 *     POST <apiBase>/api/retoma/ask JSON { metrics, question (<=200), lang }
 *     reply { ok, answer, source, fallback:false } must pass
 *     habits.validateAnswer + habits.groundedAnswer or it throws -> rules.
 *   Every server* response carries X-Quota-Left / X-Quota-Limit (or body
 *   quotaLeft/quotaLimit); onQuota({left, limit}) fires. 429 -> left 0 and the
 *   result falls back to rules with limitReached:true.
 *   ai/store.js persists the last quota per mode (quota-demo.json / quota-live.json).
 * Run with: node tests/quota.test.js */
'use strict';

var assert = require('assert');
var path = require('path');
var fs = require('fs');
var os = require('os');
var ROOT = path.resolve(__dirname, '..');
var providers = require(path.join(ROOT, 'ai', 'providers'));
var habits = require(path.join(ROOT, 'ai', 'habits'));
var store = require(path.join(ROOT, 'ai', 'store'));

var passed = 0;
var failed = 0;
function test(name, fn) {
  return Promise.resolve().then(fn).then(function () { passed++; console.log('  ok ' + name); })
    .catch(function (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e && e.stack || e).split('\n').slice(0, 3).join('\n       ')); });
}

var BASE = 'https://srv.test';
var METRICS = habits.computeMetrics([
  { app: 'Document', duration: 40, ts: new Date().toISOString() },
  { app: 'WhatsApp', duration: 18, ts: new Date().toISOString() }
]);

var REPORT = {
  ok: true,
  note: 'Longest block Document 40 min across 2 blocks.',
  experiment: {
    text: 'After I open my main task, I will stay with it for 25 min.',
    trigger: 'I open my main task',
    action: 'stay with it',
    minutes: 25,
    metric: 'longest',
    target: 25,
    direction: 'atLeast'
  },
  source: 'Retoma server \u00b7 gemma4:31b',
  fallback: false
};

function fakeServer(replyFor) {
  var calls = [];
  var impl = function (url, opts) {
    calls.push({
      url: String(url),
      method: (opts && opts.method) || 'GET',
      body: opts && opts.body ? JSON.parse(opts.body) : null,
      headers: (opts && opts.headers) || {}
    });
    var r = replyFor(String(url));
    if (r instanceof Error) return Promise.reject(r);
    if (r === 'hang') return new Promise(function () {});
    return Promise.resolve({
      ok: r.status ? r.status < 400 : true,
      status: r.status || 200,
      headers: r.headers || {},
      json: function () { return Promise.resolve(r.json); }
    });
  };
  impl.calls = calls;
  return impl;
}

function optsFor(impl, extra) {
  return Object.assign({
    mode: 'server',
    consent: { server: true },
    apiBase: BASE,
    fetchImpl: impl,
    timeoutMs: 200
  }, extra || {});
}

function recordOnQuota(calls) {
  return function (q) { calls.push(q); };
}

async function main() {
  console.log('quota: server habits');

  await test('serverHabits: valid grounded reply -> server source, quota from body', async function () {
    var seen = [];
    var f = fakeServer(function () {
      return { json: Object.assign({}, REPORT, { quotaLeft: 7, quotaLimit: 10 }) };
    });
    var r = await providers.serverHabits(METRICS, optsFor(f, { lang: 'en', onQuota: recordOnQuota(seen) }));
    assert.strictEqual(r.note, REPORT.note);
    assert.strictEqual(r.source, 'Retoma server \u00b7 gemma4:31b');
    assert.strictEqual(r.fallback, false);
    assert.strictEqual(f.calls[0].url, BASE + '/api/retoma/habits');
    assert.deepStrictEqual(f.calls[0].body, { metrics: METRICS, lang: 'en' });
    assert.deepStrictEqual(seen[seen.length - 1], { left: 7, limit: 10 });
  });

  await test('serverHabits: ungrounded or guilt note -> throws (rules fallback at the entry)', async function () {
    var ungrounded = fakeServer(function () {
      return { json: Object.assign({}, REPORT, { note: 'Longest block Document 400 min.' }) };
    });
    await assert.rejects(providers.serverHabits(METRICS, optsFor(ungrounded)), /grounded|invalid/);
    var guilt = fakeServer(function () {
      return { json: Object.assign({}, REPORT, { note: 'You were lazy today.' }) };
    });
    await assert.rejects(providers.serverHabits(METRICS, optsFor(guilt)), /grounded|invalid/);
  });

  await test('serverHabits: 429 -> rules + limitReached + onQuota left 0', async function () {
    var seen = [];
    var f = fakeServer(function () {
      return { status: 429, headers: { 'X-Quota-Limit': '10' }, json: { ok: false, quotaLeft: 0, quotaLimit: 10 } };
    });
    var r = await providers.habitsReport(METRICS, optsFor(f, { onQuota: recordOnQuota(seen) }));
    assert.strictEqual(r.source, 'rules');
    assert.strictEqual(r.fallback, true);
    assert.strictEqual(r.limitReached, true);
    assert.deepStrictEqual(seen[seen.length - 1], { left: 0, limit: 10 });
  });

  await test('serverHabits: header X-Quota-Left wins, then onQuota({left:7, limit})', async function () {
    var seen = [];
    var f = fakeServer(function () {
      return { headers: { 'X-Quota-Left': '7', 'X-Quota-Limit': '10' }, json: Object.assign({}, REPORT, { quotaLeft: 2, quotaLimit: 99 }) };
    });
    var r = await providers.habitsReport(METRICS, optsFor(f, { onQuota: recordOnQuota(seen) }));
    assert.strictEqual(r.source, 'Retoma server \u00b7 gemma4:31b');
    assert.deepStrictEqual(seen[seen.length - 1], { left: 7, limit: 10 });
  });

  await test('serverHabits: timeout -> rules, never rejects', async function () {
    var f = fakeServer(function () { return 'hang'; });
    var r = await providers.habitsReport(METRICS, optsFor(f, { timeoutMs: 40 }));
    assert.strictEqual(r.source, 'rules');
    assert.strictEqual(r.fallback, true);
  });

  console.log('quota: server ask');

  await test('serverAsk: valid grounded reply -> server source', async function () {
    var seen = [];
    var f = fakeServer(function () {
      return { headers: { 'X-Quota-Left': '6', 'X-Quota-Limit': '10' }, json: { ok: true, answer: 'Your longest block was Document 40 min.', source: 'Retoma server \u00b7 gemma4:31b', fallback: false } };
    });
    var r = await providers.serverAsk(METRICS, 'What was my longest block?', optsFor(f, { onQuota: recordOnQuota(seen) }));
    assert.strictEqual(r.answer, 'Your longest block was Document 40 min.');
    assert.strictEqual(r.source, 'Retoma server \u00b7 gemma4:31b');
    assert.strictEqual(f.calls[0].url, BASE + '/api/retoma/ask');
    assert.deepStrictEqual(seen[seen.length - 1], { left: 6, limit: 10 });
  });

  await test('serverAsk: 500-char question is sliced to 200 in the body', async function () {
    var f = fakeServer(function () {
      return { json: { ok: true, answer: 'I cannot tell from the tracked time yet.', source: 's', fallback: false } };
    });
    await providers.serverAsk(METRICS, 'q'.repeat(500), optsFor(f));
    assert.strictEqual(f.calls[0].body.question.length, 200);
    assert.strictEqual(f.calls[0].body.metrics && typeof f.calls[0].body.metrics, 'object');
  });

  await test('serverAsk: ungrounded answer -> rules fallback at the entry', async function () {
    var f = fakeServer(function () {
      return { json: { ok: true, answer: 'You wasted 400 min, lazy.', source: 's', fallback: false } };
    });
    var r = await providers.habitsAsk(METRICS, 'How was my day?', optsFor(f));
    assert.strictEqual(r.source, 'rules');
    assert.strictEqual(r.answer, habits.rulesAsk(METRICS, 'How was my day?'));
  });

  await test('serverAsk: 429 -> rules + limitReached + onQuota left 0', async function () {
    var seen = [];
    var f = fakeServer(function () {
      return { status: 429, headers: { 'X-Quota-Limit': '5' }, json: { ok: false, quotaLeft: 0, quotaLimit: 5 } };
    });
    var r = await providers.habitsAsk(METRICS, 'What was my longest block?', optsFor(f, { onQuota: recordOnQuota(seen) }));
    assert.strictEqual(r.source, 'rules');
    assert.strictEqual(r.limitReached, true);
    assert.deepStrictEqual(seen[seen.length - 1], { left: 0, limit: 5 });
  });

  console.log('quota: existing server calls also report');

  await test('propose/resumeLine read the same quota headers', async function () {
    var seen = [];
    var summary = providers.buildSummary([{ app: 'Document', duration: 40 }]);
    var f = fakeServer(function (url) {
      if (/resume-line/.test(url)) {
        return { headers: { 'X-Quota-Left': '3', 'X-Quota-Limit': '9' }, json: { ok: true, text: 'You were in Document.', source: 'Retoma server', fallback: false } };
      }
      return { headers: { 'X-Quota-Left': '4', 'X-Quota-Limit': '9' }, json: { ok: true, start: '9:00', minutes: 40, reason: 'Your longest block was in Document.', source: 'Retoma server', fallback: false } };
    });
    await providers.propose(summary, optsFor(f, { onQuota: recordOnQuota(seen) }));
    assert.deepStrictEqual(seen[seen.length - 1], { left: 4, limit: 9 });
    await providers.resumeLine({ app: 'Document' }, optsFor(f, { onQuota: recordOnQuota(seen) }));
    assert.deepStrictEqual(seen[seen.length - 1], { left: 3, limit: 9 });
  });

  console.log('quota: store');

  await test('saveQuota/loadQuota round-trip in a per-mode JSON file', function () {
    var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'retoma-quota-'));
    var file = store.quotaPathFor(dir, 'live');
    assert.ok(/quota-live\.json$/.test(file), file);
    assert.strictEqual(store.loadQuota(fs, file), null);
    store.saveQuota(fs, file, { left: 7, limit: 10 }, Date.parse('2026-11-06T10:00:00Z'));
    var q = store.loadQuota(fs, file);
    assert.strictEqual(q.left, 7);
    assert.strictEqual(q.limit, 10);
    assert.strictEqual(q.at, '2026-11-06T10:00:00.000Z');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  await test('wiring: preload exposes aiQuota, main saves on every server call', function () {
    var pre = fs.readFileSync(path.join(ROOT, 'preload.js'), 'utf8');
    var main = fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8');
    assert.ok(/aiQuota\s*:/.test(pre) && /retoma:ai:quota/.test(pre));
    assert.ok(/ipcMain\.handle\(\s*['"]retoma:ai:quota['"]/.test(main));
    assert.ok(/onQuota/.test(main) && /saveQuota/.test(main));
  });

  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
}
main().catch(function (e) { console.error(e); process.exit(1); });
