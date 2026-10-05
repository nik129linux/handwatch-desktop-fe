/* events.js — event bus + demo data (focus events, apps, timestamps) */
var Events = (function () {
  'use strict';

  var listeners = {};

  function on(event, fn) {
    if (!listeners[event]) listeners[event] = [];
    listeners[event].push(fn);
  }
  function off(event, fn) {
    if (!listeners[event]) return;
    var ix = listeners[event].indexOf(fn);
    if (ix !== -1) listeners[event].splice(ix, 1);
  }
  function emit(event, data) {
    if (!listeners[event]) return;
    listeners[event].slice().forEach(function (fn) { fn(data); });
  }

  var APPS = [
    { id: 'documento', label: 'Document', title: 'Quality report (paragraph 3)' },
    { id: 'navegador', label: 'Browser', title: 'Brightspace · Course 4B' },
    { id: 'whatsapp', label: 'WhatsApp', title: 'Messages · Ana' },
    { id: 'hoja', label: 'Spreadsheet', title: 'Data · Tracker' }
  ];

  var appIndex = 0;

  function nextApp() {
    appIndex = (appIndex + 1) % APPS.length;
    return APPS[appIndex];
  }
  function currentApp() { return APPS[appIndex]; }
  function findByLabel(label) {
    for (var i = 0; i < APPS.length; i++) if (APPS[i].label === label) return APPS[i];
    return APPS[0];
  }

  // demo timeline seed
  var seedTimeline = [
    { app: 'Document', duration: 40 },
    { app: 'Browser', duration: 12 },
    { app: 'WhatsApp', duration: 18 },
    { app: 'Spreadsheet', duration: 10 }
  ];

  return { on: on, off: off, emit: emit, APPS: APPS, nextApp: nextApp, currentApp: currentApp, findByLabel: findByLabel, seedTimeline: seedTimeline };
})();
