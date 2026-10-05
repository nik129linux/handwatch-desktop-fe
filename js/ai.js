/* ai.js — renderer-safe mirror of the proposal math (no keys, no network).
 * In Electron, real local/cloud calls go through window.retoma (main process).
 * Here: build the summary payload and format validated provider output. */
var Ai = (function () {
  'use strict';

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function fmtClock(totalMin) {
    var h = Math.floor(totalMin / 60) % 24;
    var m = totalMin % 60;
    return h + ':' + pad2(m);
  }

  function parseClock(str) {
    var m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(String(str || ''));
    if (!m) return null;
    return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  }

  /* Same contract as the main-process summary: per-app minutes, longest
   * uninterrupted block, first break time. Window titles never leave. */
  function buildSummary(timeline) {
    var entries = (timeline && timeline.length ? timeline : [{ app: 'Document', duration: 40 }]).slice();
    var perApp = {};
    entries.forEach(function (e) {
      if (!perApp[e.app]) perApp[e.app] = 0;
      perApp[e.app] += e.duration;
    });
    var longest = { app: entries[0].app, minutes: entries[0].duration };
    entries.forEach(function (e) {
      if (e.duration > longest.minutes) longest = { app: e.app, minutes: e.duration };
    });
    var ix = -1;
    for (var i = 0; i < entries.length; i++) {
      if (entries[i].app === 'WhatsApp') { ix = i; break; }
    }
    if (ix === -1) ix = entries.length > 1 ? 1 : 0;
    var startMin = 9 * 60;
    for (var j = 0; j < ix; j++) startMin += entries[j].duration;
    return {
      perApp: perApp,
      longest: longest,
      firstInterruption: { app: entries[ix] ? entries[ix].app : longest.app, at: fmtClock(startMin) }
    };
  }

  function validProposal(obj) {
    if (!obj || typeof obj !== 'object') return false;
    if (parseClock(obj.start) === null) return false;
    if (!Number.isInteger(obj.minutes) || obj.minutes < 15 || obj.minutes > 180) return false;
    if (typeof obj.reason !== 'string' || obj.reason.length < 1 || obj.reason.length > 140) return false;
    return true;
  }

  /* Render a validated provider result in the existing proposal voice. */
  function formatProposal(p) {
    var startMin = parseClock(p.start);
    var end = fmtClock(startMin + p.minutes);
    return {
      text: 'Tomorrow: ' + p.minutes + ' min for the report, ' + p.start + ' to ' + end + ', before the messages arrive.',
      how: 'How I decided: ' + p.reason
    };
  }

  /* Exact local payload preview when the bridge is absent (browser demo):
   * same prompt shape the main process would send. */
  function previewLocal(summary) {
    return {
      model: 'first available local model',
      prompt: 'Plan one focused work block from this usage summary (per-app minutes, ' +
        'longest uninterrupted block, first break time). Reply with JSON only, ' +
        'exactly {"start":"HH:MM","minutes":15-180,"reason":"140 chars max"}. ' +
        'Summary: ' + JSON.stringify(summary),
      format: 'json',
      stream: false
    };
  }

  return {
    buildSummary: buildSummary,
    validProposal: validProposal,
    formatProposal: formatProposal,
    previewLocal: previewLocal,
    fmtClock: fmtClock,
    parseClock: parseClock
  };
})();
