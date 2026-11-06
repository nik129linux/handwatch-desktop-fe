/* ai/store.js — MAIN PROCESS file. Real persistence for Retoma events.
 * File lives at app.getPath('userData')/events.json. Retention is 7 days,
 * enforced on load and on an hourly timer in main.js. Pure helpers here so
 * unit tests can drive them without Electron. */
'use strict';

var path = require('path');

var RETENTION_MS = 7 * 24 * 3600 * 1000;
var STORE_VERSION = 1;

function eventsPath(userDataDir) {
  return path.join(userDataDir, 'events.json');
}

/* Per-mode stores: Live reads ONLY live events, Demo ONLY demo events.
 * No silent migration: a fresh mode starts empty, old events.json is left alone. */
function eventsPathFor(userDataDir, mode) {
  var m = mode === 'live' ? 'live' : 'demo';
  return path.join(userDataDir, 'events-' + m + '.json');
}

function eventTime(ev) {
  if (!ev || typeof ev !== 'object') return NaN;
  var t = Date.parse(ev.ts || ev.savedAt || '');
  return t;
}

/* Drop anything older than 7 days. Events without a date are kept. */
function pruneEvents(events, nowMs) {
  var now = nowMs === undefined ? Date.now() : nowMs;
  return (events || []).filter(function (ev) {
    var t = eventTime(ev);
    if (isNaN(t)) return true;
    return now - t <= RETENTION_MS;
  });
}

function loadEventsFile(fsImpl, filePath, nowMs) {
  var raw;
  try {
    raw = fsImpl.readFileSync(filePath, 'utf8');
  } catch (e) {
    return { version: STORE_VERSION, events: [] };
  }
  var data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    return { version: STORE_VERSION, events: [] };
  }
  var events = Array.isArray(data) ? data : (data.events || []);
  return { version: STORE_VERSION, events: pruneEvents(events, nowMs) };
}

function saveEventsFile(fsImpl, filePath, events, nowMs) {
  var pruned = pruneEvents(events, nowMs);
  var data = { version: STORE_VERSION, savedAt: new Date().toISOString(), events: pruned };
  fsImpl.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  return pruned;
}

function deleteEventsFile(fsImpl, filePath) {
  try {
    fsImpl.unlinkSync(filePath);
  } catch (e) {
    if (e && e.code !== 'ENOENT') throw e;
  }
}

/* Accepted habit experiments persist per mode with the same 7-day
 * retention, delete-all and export behaviour as the events store. */
function experimentsPathFor(userDataDir, mode) {
  var m = mode === 'live' ? 'live' : 'demo';
  return path.join(userDataDir, 'experiments-' + m + '.json');
}

function expTime(exp) {
  if (!exp || typeof exp !== 'object') return NaN;
  return Date.parse(exp.createdAt || '');
}

function pruneExperiments(exps, nowMs) {
  var now = nowMs === undefined ? Date.now() : nowMs;
  return (exps || []).filter(function (exp) {
    var t = expTime(exp);
    if (isNaN(t)) return true;
    return now - t <= RETENTION_MS;
  });
}

function loadExperimentsFile(fsImpl, filePath, nowMs) {
  var raw;
  try {
    raw = fsImpl.readFileSync(filePath, 'utf8');
  } catch (e) {
    return [];
  }
  var data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    return [];
  }
  var exps = Array.isArray(data) ? data : (data.experiments || []);
  return pruneExperiments(exps, nowMs);
}

function saveExperimentsFile(fsImpl, filePath, exps, nowMs) {
  var pruned = pruneExperiments(exps, nowMs);
  var data = { version: STORE_VERSION, savedAt: new Date().toISOString(), experiments: pruned };
  fsImpl.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  return pruned;
}

function serializeExperiments(exps) {
  return JSON.stringify({ version: STORE_VERSION, exportedAt: new Date().toISOString(), experiments: exps || [] }, null, 2);
}

function serialize(events) {
  return JSON.stringify({ version: STORE_VERSION, exportedAt: new Date().toISOString(), events: events || [] }, null, 2);
}

/* Last daily AI quota seen from the Retoma server, per mode. Same shape as
 * the experiments store: one JSON file in userData. The renderer repaints the
 * bar from this when the daily cap was already reached before launch. */
function quotaPathFor(userDataDir, mode) {
  var m = mode === 'live' ? 'live' : 'demo';
  return path.join(userDataDir, 'quota-' + m + '.json');
}

function normalizeQuota(q) {
  if (!q || typeof q !== 'object') return null;
  var left = Number(q.left);
  var limit = Number(q.limit);
  if (!isFinite(left) || !isFinite(limit)) return null;
  return {
    left: Math.max(0, left),
    limit: Math.max(0, limit),
    at: q.at ? String(q.at) : new Date().toISOString()
  };
}

function loadQuota(fsImpl, filePath) {
  var raw;
  try {
    raw = fsImpl.readFileSync(filePath, 'utf8');
  } catch (e) {
    return null;
  }
  var data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    return null;
  }
  return normalizeQuota(data && data.quota ? data.quota : data);
}

function saveQuota(fsImpl, filePath, quota, nowMs) {
  var now = nowMs === undefined ? Date.now() : nowMs;
  var out = normalizeQuota(Object.assign({ at: new Date(now).toISOString() }, quota || {}));
  if (!out) out = { left: 0, limit: 0, at: new Date(now).toISOString() };
  var data = { version: STORE_VERSION, savedAt: new Date(now).toISOString(), quota: out };
  fsImpl.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  return out;
}

module.exports = {
  RETENTION_MS: RETENTION_MS,
  eventsPath: eventsPath,
  eventsPathFor: eventsPathFor,
  pruneEvents: pruneEvents,
  loadEventsFile: loadEventsFile,
  saveEventsFile: saveEventsFile,
  deleteEventsFile: deleteEventsFile,
  serialize: serialize,
  experimentsPathFor: experimentsPathFor,
  pruneExperiments: pruneExperiments,
  loadExperimentsFile: loadExperimentsFile,
  saveExperimentsFile: saveExperimentsFile,
  serializeExperiments: serializeExperiments,
  quotaPathFor: quotaPathFor,
  normalizeQuota: normalizeQuota,
  loadQuota: loadQuota,
  saveQuota: saveQuota
};
