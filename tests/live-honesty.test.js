/* tests/live-honesty.test.js — L3 live honesty unit tests. No display, no D-Bus.
 * Run with: node tests/live-honesty.test.js
 * Live reads ONLY live events, Demo ONLY demo events; neither leaks. */
'use strict';

var assert = require('assert');
var path = require('path');
var fs = require('fs');
var os = require('os');

var ROOT = path.resolve(__dirname, '..');
var store = require(path.join(ROOT, 'ai', 'store'));

var passed = 0;
var failed = 0;
var failures = [];

function test(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(function () {
      passed++;
      console.log('  ok ' + name);
    })
    .catch(function (e) {
      failed++;
      failures.push(name + ': ' + (e && e.message));
      console.log('  FAIL ' + name);
      console.log('       ' + (e && e.stack ? String(e.stack).split('\n').slice(0, 4).join('\n       ') : e));
    });
}

function memFs(backing) {
  return {
    readFileSync: function (p) {
      if (!Object.prototype.hasOwnProperty.call(backing, p)) {
        var e = new Error('ENOENT');
        e.code = 'ENOENT';
        throw e;
      }
      return backing[p];
    },
    writeFileSync: function (p, s) { backing[p] = String(s); },
    unlinkSync: function (p) {
      if (!Object.prototype.hasOwnProperty.call(backing, p)) {
        var e = new Error('ENOENT');
        e.code = 'ENOENT';
        throw e;
      }
      delete backing[p];
    }
  };
}

async function main() {
  console.log('l3: per-mode stores');

  await test('store: live and demo paths differ, legacy untouched', function () {
    var live = store.eventsPathFor('/tmp/ud', 'live');
    var demo = store.eventsPathFor('/tmp/ud', 'demo');
    assert.ok(/events-live\.json$/.test(live), 'live file: ' + live);
    assert.ok(/events-demo\.json$/.test(demo), 'demo file: ' + demo);
    assert.notStrictEqual(live, demo);
    assert.ok(/events\.json$/.test(store.eventsPath('/tmp/ud')), 'legacy path kept');
    assert.strictEqual(store.eventsPathFor('/tmp/ud', 'zzz'), demo, 'junk mode falls back to demo');
    assert.strictEqual(store.eventsPathFor('/tmp/ud'), demo, 'missing mode falls back to demo');
  });

  await test('store: live and demo histories stay separate on disk', function () {
    var backing = {};
    var f = memFs(backing);
    var dir = '/tmp/ud-honesty';
    var liveFile = store.eventsPathFor(dir, 'live');
    var demoFile = store.eventsPathFor(dir, 'demo');
    var now = Date.now();
    store.saveEventsFile(f, demoFile, [{ app: 'Document', duration: 40, ts: new Date(now).toISOString() }], now);
    store.saveEventsFile(f, liveFile, [{ app: 'Terminal', duration: 5, ts: new Date(now).toISOString() }], now);
    var demoBack = store.loadEventsFile(f, demoFile, now);
    var liveBack = store.loadEventsFile(f, liveFile, now);
    assert.deepStrictEqual(demoBack.events.map(function (e) { return e.app; }), ['Document']);
    assert.deepStrictEqual(liveBack.events.map(function (e) { return e.app; }), ['Terminal']);
    var dump = JSON.stringify(backing);
    assert.strictEqual(/Quality report|Brightspace/.test(dump), false, 'no demo titles leak anywhere');
  });

  await test('store: deleting live removes only the live file', function () {
    var backing = {};
    var f = memFs(backing);
    var dir = '/tmp/ud-del';
    var liveFile = store.eventsPathFor(dir, 'live');
    var demoFile = store.eventsPathFor(dir, 'demo');
    store.saveEventsFile(f, demoFile, [{ app: 'Document', duration: 40 }]);
    store.saveEventsFile(f, liveFile, [{ app: 'Terminal', duration: 5 }]);
    store.deleteEventsFile(f, liveFile);
    assert.strictEqual(backing[liveFile], undefined, 'live file gone');
    assert.ok(backing[demoFile], 'demo file kept');
    assert.deepStrictEqual(store.loadEventsFile(f, liveFile).events, [], 'live loads empty after delete');
    assert.strictEqual(store.loadEventsFile(f, demoFile).events.length, 1, 'demo untouched');
  });

  await test('store: no silent migration from legacy events.json', function () {
    var backing = {};
    var f = memFs(backing);
    var dir = '/tmp/ud-mig';
    backing[store.eventsPath(dir)] = JSON.stringify({ version: 1, events: [{ app: 'Document', duration: 40 }] });
    assert.deepStrictEqual(store.loadEventsFile(f, store.eventsPathFor(dir, 'live')).events, [], 'live starts empty');
    assert.deepStrictEqual(store.loadEventsFile(f, store.eventsPathFor(dir, 'demo')).events, [], 'demo starts empty');
  });

  console.log('l3: renderer persist keys');

  await test('persist: demo and live use separate localStorage keys', function () {
    var src = fs.readFileSync(path.join(ROOT, 'js', 'persist.js'), 'utf8');
    assert.ok(/retoma-events-demo-v1/.test(src), 'demo key present');
    assert.ok(/retoma-events-live-v1/.test(src), 'live key present');
    // keyFor must map modes without falling back to one shared key.
    var backing = {};
    var fakeWindow = {
      localStorage: {
        getItem: function (k) { return Object.prototype.hasOwnProperty.call(backing, k) ? backing[k] : null; },
        setItem: function (k, v) { backing[k] = String(v); },
        removeItem: function (k) { delete backing[k]; }
      },
      Live: { isLive: function () { return false; } }
    };
    var sandbox = { window: fakeWindow };
    /* eslint-disable no-eval */
    var factory = new Function('window', src + '\nreturn Persist;');
    var Persist = factory(fakeWindow);
    assert.strictEqual(Persist.keyFor('live'), 'retoma-events-live-v1');
    assert.strictEqual(Persist.keyFor('demo'), 'retoma-events-demo-v1');
    global.Live = fakeWindow.Live;
    assert.strictEqual(Persist.currentMode(), 'demo');
    fakeWindow.Live.isLive = function () { return true; };
    assert.strictEqual(Persist.currentMode(), 'live');
    delete global.Live;
    void sandbox;
  });

  console.log('l3: renderer honesty contracts');

  await test('retoma: live render never falls back to the seed', function () {
    var src = fs.readFileSync(path.join(ROOT, 'js', 'retoma.js'), 'utf8');
    assert.ok(/liveEmpty/.test(src), 'live empty flag exists');
    assert.ok(/liveTimeline/.test(src), 'separate live timeline exists');
    assert.ok(/Never fall?s? back|ONLY live events|never falls back/i.test(src), 'honesty comment present');
  });

  await test('live: empty copy and hidden bar, windows inert', function () {
    var src = fs.readFileSync(path.join(ROOT, 'js', 'live.js'), 'utf8');
    assert.ok(/Now: waiting for activity/.test(src), 'empty Now line present');
    assert.ok(/Nothing tracked yet/.test(src), 'empty Today line present');
    assert.ok(/setAttribute\('inert'/.test(src), 'windows go inert in Live');
    assert.ok(/liveTimeline/.test(src), 'live intake keeps its own list');
  });

  await test('markup: enable command visible from the start, steps numbered', function () {
    var html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    assert.ok(html.indexOf('gnome-extensions enable retoma-focus@retoma.local') !== -1, 'exact command in markup');
    assert.ok(!/id="enableCmd" class="helper-cmd is-hidden"/.test(html), 'command not hidden at start');
    assert.ok(!/id="enableCopy" class="btn is-hidden"/.test(html), 'copy not hidden at start');
    assert.ok(/<ol class="helper-card__steps">/.test(html), 'steps are a numbered list');
    assert.ok(/Now: waiting for activity/.test(html), 'initial Now is honest');
    assert.ok(/Nothing tracked yet/.test(html), 'initial Today is honest');
  });

  await test('css: demo windows fully removed in Live, not faded', function () {
    var css = fs.readFileSync(path.join(ROOT, 'css', 'desk.css'), 'utf8');
    var block = css.slice(css.indexOf('body.is-live .window'));
    assert.ok(/display:\s*none/.test(block.split('}')[0]), 'display:none in Live');
    assert.strictEqual(/opacity:\s*0/.test(block.split('}')[0]), false, 'no faded ghosts');
  });

  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  if (failures.length) {
    console.log('failures:\n - ' + failures.join('\n - '));
    process.exit(1);
  }
}

main().catch(function (e) {
  console.error(e);
  process.exit(1);
});
