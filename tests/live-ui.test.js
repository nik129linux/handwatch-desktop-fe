/* tests/live-ui.test.js — L2 live UI unit tests. No display, no D-Bus.
 * Run with: node tests/live-ui.test.js */
'use strict';

var assert = require('assert');
var path = require('path');
var fs = require('fs');
var os = require('os');

var ROOT = path.resolve(__dirname, '..');
var settingsStore = require(path.join(ROOT, 'ai', 'settings'));
var installer = require(path.join(ROOT, 'live', 'installer'));
var liveManager = require(path.join(ROOT, 'live', 'live-manager'));

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

function tick(ms) {
  return new Promise(function (res) { setTimeout(res, ms || 0); });
}

function fakeClock() {
  var t = 1000000;
  return {
    now: function () { return t; },
    advance: function (ms) { t += ms; }
  };
}

async function main() {
  console.log('l2: settings');

  await test('settings: defaults are demo, titles off, away 5', function () {
    var d = settingsStore.defaults();
    assert.strictEqual(d.mode, 'demo');
    assert.strictEqual(d.storeTitles, false);
    assert.strictEqual(d.awayAfterMin, 5);
    assert.strictEqual(d.paused, false);
    assert.ok(Array.isArray(d.blocklist) && d.blocklist.length > 0);
  });

  await test('settings: sanitize rejects junk, keeps valid patch', function () {
    var s = settingsStore.sanitize({ mode: 'zzz', awayAfterMin: -3, storeTitles: 1, blocklist: ['a', '', 42] });
    assert.strictEqual(s.mode, 'demo');
    assert.strictEqual(s.awayAfterMin, 5);
    assert.strictEqual(s.storeTitles, true);
    assert.deepStrictEqual(s.blocklist, ['a']);
    var s2 = settingsStore.sanitize({ mode: 'live', awayAfterMin: 2, paused: true });
    assert.strictEqual(s2.mode, 'live');
    assert.strictEqual(s2.awayAfterMin, 2);
    assert.strictEqual(s2.paused, true);
  });

  await test('settings: round-trip through a temp file, mode persists', function () {
    var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'retoma-settings-'));
    var file = path.join(dir, 'settings.json');
    assert.strictEqual(settingsStore.loadSettingsFile(fs, file).mode, 'demo', 'missing file defaults to demo');
    settingsStore.saveSettingsFile(fs, file, { mode: 'live' });
    assert.strictEqual(settingsStore.loadSettingsFile(fs, file).mode, 'live', 'live persists');
    settingsStore.saveSettingsFile(fs, file, { storeTitles: true, awayAfterMin: 10, blocklist: ['x'] });
    var back = settingsStore.loadSettingsFile(fs, file);
    assert.strictEqual(back.mode, 'live', 'patch merge never loses mode');
    assert.strictEqual(back.storeTitles, true);
    assert.strictEqual(back.awayAfterMin, 10);
    assert.deepStrictEqual(back.blocklist, ['x']);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  await test('settings: corrupt file falls back to demo', function () {
    var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'retoma-settings-'));
    var file = path.join(dir, 'settings.json');
    fs.writeFileSync(file, '{{{not json', 'utf8');
    assert.strictEqual(settingsStore.loadSettingsFile(fs, file).mode, 'demo');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  console.log('l2: installer');

  await test('installer: without confirm copies nothing', function () {
    var home = fs.mkdtempSync(path.join(os.tmpdir(), 'retoma-home-'));
    var res = installer.installHelper({ fs: fs, home: home, confirm: false });
    assert.strictEqual(res.copied, false);
    assert.strictEqual(fs.existsSync(installer.destDir(home)), false, 'no folder created');
    assert.strictEqual(installer.isInstalled(fs, home), false);
    fs.rmSync(home, { recursive: true, force: true });
  });

  await test('installer: with confirm copies exactly the 2 extension files', function () {
    var home = fs.mkdtempSync(path.join(os.tmpdir(), 'retoma-home-'));
    var res = installer.installHelper({ fs: fs, home: home, confirm: true });
    assert.strictEqual(res.copied, true);
    assert.deepStrictEqual(res.files, ['extension.js', 'metadata.json']);
    var destFiles = fs.readdirSync(res.dest).sort();
    assert.deepStrictEqual(destFiles, ['extension.js', 'metadata.json']);
    installer.FILES.forEach(function (f) {
      var src = fs.readFileSync(path.join(installer.sourceDir(), f), 'utf8');
      var dst = fs.readFileSync(path.join(res.dest, f), 'utf8');
      assert.strictEqual(dst, src, f + ' identical');
    });
    assert.strictEqual(installer.isInstalled(fs, home), true);
    fs.rmSync(home, { recursive: true, force: true });
  });

  await test('installer: enable command text is exact', function () {
    assert.strictEqual(installer.ENABLE_COMMAND, 'gnome-extensions enable retoma-focus@retoma.local');
    assert.strictEqual(installer.UUID, 'retoma-focus@retoma.local');
    var meta = installer.describeInstall('/tmp/fake-home');
    assert.deepStrictEqual(meta.files, ['extension.js', 'metadata.json']);
    assert.ok(meta.to.indexOf('retoma-focus@retoma.local') !== -1, 'dest names the extension');
    assert.ok(meta.from.indexOf('retoma-focus@retoma.local') !== -1, 'source names the extension');
  });

  console.log('l2: manager routing + fake');

  function makeManager(samples, settings) {
    var events = [];
    var episodes = [];
    var notes = [];
    var statuses = [];
    var clock = fakeClock();
    var m = liveManager.createLiveManager({
      send: function (e) { events.push(e); },
      sendStatus: function (s) { statuses.push(s); },
      saveEpisode: function (e) { episodes.push(e); },
      notify: function (n) { notes.push(n); },
      clock: clock,
      settings: settings || { awayAfterMin: 5 },
      fakeSamples: samples
    });
    return { m: m, events: events, episodes: episodes, notes: notes, statuses: statuses, clock: clock };
  }

  await test('manager: fake waits for ready(), then plays the full script', async function () {
    var h = makeManager([
      { waitMs: 5, advanceMs: 0, focus: { appId: 'a', appName: 'Alpha', title: 't1' } },
      { waitMs: 5, advanceMs: 60000, focus: { appId: 'b', appName: 'Beta', title: 't2' } }
    ]);
    h.m.start();
    await tick(30);
    assert.strictEqual(h.events.length, 0, 'nothing plays before ready()');
    assert.strictEqual(h.m.ready(), true);
    await tick(60);
    assert.ok(h.events.length >= 1, 'script played after ready()');
    assert.strictEqual(h.m.ready(), false, 'ready() is one-shot');
    h.m.stop();
  });

  await test('manager: titles off strips everywhere, blocklist is Private app', async function () {
    var h = makeManager([
      { waitMs: 5, advanceMs: 0, focus: { appId: 'ff', appName: 'Firefox', title: 'secret-bank-page' } },
      { waitMs: 5, advanceMs: 60000, focus: { appId: 'keepassxc', appName: 'KeePassXC', title: 'vault' } },
      { waitMs: 5, advanceMs: 60000, focus: { appId: 't', appName: 'Terminal', title: 'x' } }
    ], { awayAfterMin: 5, storeTitles: false });
    h.m.start();
    h.m.ready();
    await tick(80);
    var dump = JSON.stringify(h.events);
    assert.strictEqual(/secret-bank-page|vault|KeePassXC|keepassxc/i.test(dump), false, 'no titles or blocked names leak: ' + dump.slice(0, 200));
    var privates = h.events.filter(function (e) { return e.type === 'app:switch' && e.app.label === 'Private app'; });
    assert.strictEqual(privates.length, 1, 'blocked app renders as Private app');
    assert.strictEqual('title' in privates[0].app, false, 'private app carries no title');
    h.m.stop();
  });

  await test('manager: titles on truncates to 60', async function () {
    var long = new Array(101).join('y');
    var h = makeManager([
      { waitMs: 5, advanceMs: 0, focus: { appId: 'ff', appName: 'Firefox', title: long } },
      { waitMs: 5, advanceMs: 60000, focus: { appId: 't', appName: 'Terminal', title: 'x' } }
    ], { awayAfterMin: 5, storeTitles: true });
    h.m.start();
    h.m.ready();
    await tick(80);
    var first = h.events.filter(function (e) { return e.type === 'app:switch'; })[0];
    assert.strictEqual(first.app.title.length, 60, 'title truncated to 60');
    h.m.stop();
  });

  await test('manager: away/return routes episode save + notify, replay works', async function () {
    var h = makeManager([
      { waitMs: 5, advanceMs: 0, focus: { appId: 'a', appName: 'Alpha', title: '' } },
      { waitMs: 5, advanceMs: 60000, idleMs: 300000 },
      { waitMs: 5, advanceMs: 1500000, idleMs: 1000 }
    ], { awayAfterMin: 5 });
    h.m.start();
    h.m.ready();
    await tick(80);
    assert.strictEqual(h.episodes.length, 1, 'episode saved');
    assert.deepStrictEqual(h.episodes[0], { app: 'Alpha', duration: 1 });
    var returns = h.events.filter(function (e) { return e.type === 'return'; });
    assert.strictEqual(returns.length, 1);
    assert.strictEqual(returns[0].awayMinutes, 25);
    assert.strictEqual(h.notes.length, 1, 'return fires the notification hook');
    assert.deepStrictEqual(h.notes[0], { awayMinutes: 25, app: 'Alpha' });
    var n = h.events.length;
    assert.strictEqual(h.m.replay(), true);
    await tick(80);
    assert.ok(h.events.length > n, 'replay re-runs the script');
    h.m.stop();
  });

  await test('manager: paused records nothing, status reflects it', async function () {
    var h = makeManager([
      { waitMs: 5, advanceMs: 0, focus: { appId: 'a', appName: 'Alpha', title: '' } }
    ]);
    h.m.start();
    h.m.setPaused(true);
    assert.strictEqual(h.m.status(), 'paused');
    h.m.ready();
    await tick(40);
    assert.strictEqual(h.events.length, 0, 'paused records nothing');
    h.m.setPaused(false);
    assert.strictEqual(h.m.status(), 'ready');
    h.m.stop();
  });

  await test('manager: extension-missing passes through without a fake file', function () {
    var src = { status: function () { return 'extension-missing'; }, start: function () {}, stop: function () {} };
    var m = liveManager.createLiveManager({
      focusSource: src,
      send: function () {},
      settings: {}
    });
    assert.strictEqual(m.status(), 'extension-missing');
    assert.strictEqual(m.isFake(), false);
    assert.strictEqual(m.replay(), false);
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
