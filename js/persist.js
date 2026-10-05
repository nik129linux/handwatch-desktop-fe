/* persist.js — real persistence. In Electron, events go through IPC to
 * app.getPath('userData')/events.json. In the browser, localStorage keeps
 * index.html working. Retention is 7 days, enforced on load and hourly. */
var Persist = (function () {
  'use strict';

  var KEY_DEMO = 'retoma-events-demo-v1';
  var KEY_LIVE = 'retoma-events-live-v1';
  var RETENTION_MS = 7 * 24 * 3600 * 1000;

  /* Per-mode keys: Live reads ONLY live events, Demo ONLY demo events.
   * Nothing is migrated silently; a fresh mode starts empty. */
  function keyFor(mode) {
    return mode === 'live' ? KEY_LIVE : KEY_DEMO;
  }

  function currentMode() {
    try {
      if (window.Live && Live.isLive && Live.isLive()) return 'live';
    } catch (e) { /* demo until Live mounts */ }
    return 'demo';
  }

  function hasBridge() {
    return !!(window.retoma && window.retoma.loadEvents);
  }

  function eventTime(ev) {
    if (!ev || typeof ev !== 'object') return NaN;
    return Date.parse(ev.ts || '');
  }

  function prune(events, nowMs) {
    var now = nowMs === undefined ? Date.now() : nowMs;
    return (events || []).filter(function (ev) {
      var t = eventTime(ev);
      if (isNaN(t)) return true;
      return now - t <= RETENTION_MS;
    });
  }

  function stamp(entries) {
    var now = new Date().toISOString();
    return (entries || []).map(function (e) {
      if (e && e.ts) return { app: e.app, duration: e.duration, ts: e.ts };
      return { app: e.app, duration: e.duration, ts: now };
    });
  }

  function loadLocal(mode) {
    var raw = null;
    try { raw = window.localStorage.getItem(keyFor(mode || currentMode())); } catch (e) { raw = null; }
    if (!raw) return [];
    try {
      var data = JSON.parse(raw);
      var events = Array.isArray(data) ? data : (data.events || []);
      return prune(stamp(events));
    } catch (e) { return []; }
  }

  function saveLocal(events, mode) {
    try {
      window.localStorage.setItem(keyFor(mode || currentMode()), JSON.stringify({ version: 1, savedAt: new Date().toISOString(), events: stamp(events) }));
    } catch (e) { /* storage full or blocked: demo keeps going */ }
  }

  function load(mode) {
    var m = mode || currentMode();
    if (hasBridge()) {
      return window.retoma.loadEvents(m).then(function (events) {
        return prune(events || []);
      }, function () { return loadLocal(m); });
    }
    return Promise.resolve(loadLocal(m));
  }

  function save(events, mode) {
    var m = mode || currentMode();
    var stamped = stamp(events);
    if (hasBridge()) {
      return window.retoma.saveEvents(stamped, m).then(function () { return true; }, function () { saveLocal(stamped, m); return false; });
    }
    saveLocal(stamped, m);
    return Promise.resolve(true);
  }

  function removeAll(mode) {
    var m = mode || currentMode();
    if (hasBridge()) {
      return window.retoma.deleteEvents(m).then(function () { return true; }, function () { return false; });
    }
    try { window.localStorage.removeItem(keyFor(m)); } catch (e) { /* noop */ }
    return Promise.resolve(true);
  }

  function exportData(events) {
    if (hasBridge()) return window.retoma.exportEvents();
    var blob = new Blob([JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), events: stamp(events) }, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'retoma-data.json';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    return Promise.resolve(true);
  }

  return { load: load, save: save, removeAll: removeAll, exportData: exportData, prune: prune, hasBridge: hasBridge, keyFor: keyFor, currentMode: currentMode };
})();
