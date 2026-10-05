/* persist.js — real persistence. In Electron, events go through IPC to
 * app.getPath('userData')/events.json. In the browser, localStorage keeps
 * index.html working. Retention is 7 days, enforced on load and hourly. */
var Persist = (function () {
  'use strict';

  var KEY = 'retoma-events-v1';
  var RETENTION_MS = 7 * 24 * 3600 * 1000;

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

  function loadLocal() {
    var raw = null;
    try { raw = window.localStorage.getItem(KEY); } catch (e) { raw = null; }
    if (!raw) return [];
    try {
      var data = JSON.parse(raw);
      var events = Array.isArray(data) ? data : (data.events || []);
      return prune(stamp(events));
    } catch (e) { return []; }
  }

  function saveLocal(events) {
    try {
      window.localStorage.setItem(KEY, JSON.stringify({ version: 1, savedAt: new Date().toISOString(), events: stamp(events) }));
    } catch (e) { /* storage full or blocked: demo keeps going */ }
  }

  function load() {
    if (hasBridge()) {
      return window.retoma.loadEvents().then(function (events) {
        return prune(events || []);
      }, function () { return loadLocal(); });
    }
    return Promise.resolve(loadLocal());
  }

  function save(events) {
    var stamped = stamp(events);
    if (hasBridge()) {
      return window.retoma.saveEvents(stamped).then(function () { return true; }, function () { saveLocal(stamped); return false; });
    }
    saveLocal(stamped);
    return Promise.resolve(true);
  }

  function removeAll() {
    if (hasBridge()) {
      return window.retoma.deleteEvents().then(function () { return true; }, function () { return false; });
    }
    try { window.localStorage.removeItem(KEY); } catch (e) { /* noop */ }
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

  return { load: load, save: save, removeAll: removeAll, exportData: exportData, prune: prune, hasBridge: hasBridge };
})();
