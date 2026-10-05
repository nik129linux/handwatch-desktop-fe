/* habits.js — renderer UI for the AI habit coach (Today card + Ask + status).
 * Offline (browser demo): same rules as the main process, computed locally.
 * Electron: aggregates go through window.retoma (main process), which owns
 * the provider chain and the experiments store. Nothing here holds keys. */
var HabitsUI = (function () {
  'use strict';

  var EXP_KEY_PREFIX = 'retoma-exp-';
  var RETENTION_MS = 7 * 24 * 3600 * 1000;

  var el = {};
  var lastKey = '';
  var inflight = false;
  var current = null;

  function hasLib() {
    return !!(window.Habits && window.Habits.computeMetrics);
  }

  function hasBridge() {
    return !!(window.retoma && window.retoma.habitsReport);
  }

  function mode() {
    try {
      return window.Live && Live.isLive && Live.isLive() ? 'live' : 'demo';
    } catch (e) { return 'demo'; }
  }

  function aiMode() {
    try {
      return (window.Retoma && Retoma.state.aiMode) || 'off';
    } catch (e) { return 'off'; }
  }

  function consent() {
    try {
      return (window.Retoma && Retoma.state.aiConsent) || { local: false, cloud: false };
    } catch (e) { return { local: false, cloud: false }; }
  }

  function stateEntries() {
    if (!window.Retoma) return [];
    var st = Retoma.state;
    if (mode() === 'live') return st.liveTimeline || [];
    if (st.timeline && st.timeline.length) return st.timeline;
    return (window.Events && Events.seedTimeline) ? Events.seedTimeline : [];
  }

  function stamp(list) {
    var now = new Date().toISOString();
    return (list || []).map(function (e) {
      if (e && e.ts) return { app: e.app, duration: e.duration, ts: e.ts };
      return { app: e.app, duration: e.duration, ts: now };
    });
  }

  function shouldHide() {
    if (!window.Retoma) return true;
    var st = Retoma.state;
    if (mode() === 'live') return !(st.liveTimeline && st.liveTimeline.length);
    return !!st.empty;
  }

  function hide() {
    if (el.card) el.card.classList.add('is-hidden');
  }

  function sourceLabel(source, fallback) {
    if (fallback) return 'On-device rules';
    if (!source || source === 'rules') return 'On-device rules';
    return source;
  }

  /* --- offline experiments (browser demo mirrors the main store) --- */

  function expKey(m) {
    return EXP_KEY_PREFIX + (m === 'live' ? 'live' : 'demo');
  }

  function loadLocalExps(m) {
    var raw = null;
    try { raw = window.localStorage.getItem(expKey(m)); } catch (e) { raw = null; }
    if (!raw) return [];
    try {
      var data = JSON.parse(raw);
      var list = Array.isArray(data) ? data : [];
      var now = Date.now();
      return list.filter(function (e) {
        if (!e || typeof e !== 'object') return false;
        var t = Date.parse(e.createdAt || '');
        if (isNaN(t)) return true;
        return now - t <= RETENTION_MS;
      });
    } catch (e) { return []; }
  }

  function saveLocalExps(m, list) {
    try {
      window.localStorage.setItem(expKey(m), JSON.stringify(list || []));
    } catch (e) { /* session only */ }
  }

  function dayKeyLocal(ms) {
    var d = new Date(ms);
    function p2(n) { return String(n).padStart(2, '0'); }
    return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
  }

  function renderResult(payload) {
    if (!el.card || !payload || !payload.report || payload.report.empty) {
      hide();
      return;
    }
    var rep = payload.report;
    if (!rep.note || !rep.experiment) {
      hide();
      return;
    }
    current = payload;
    el.card.classList.remove('is-hidden');
    if (el.note) el.note.textContent = rep.note;
    if (el.experiment) el.experiment.textContent = rep.experiment.text;
    if (el.tag) el.tag.textContent = sourceLabel(rep.source, rep.fallback);
    if (el.evalLine) {
      if (payload.evaluation) {
        el.evalLine.textContent = payload.evaluation.text;
        el.evalLine.classList.remove('is-hidden');
      } else {
        el.evalLine.textContent = '';
        el.evalLine.classList.add('is-hidden');
      }
    }
  }

  function offlineReport(list, m) {
    if (!hasLib()) {
      hide();
      return;
    }
    var metrics = window.Habits.computeMetrics(stamp(list));
    if (!metrics) {
      hide();
      return;
    }
    var rep = window.Habits.rulesReport(metrics);
    if (!rep) {
      hide();
      return;
    }
    var exps = loadLocalExps(m);
    var evaluation = null;
    var today = dayKeyLocal(Date.now());
    for (var i = exps.length - 1; i >= 0; i--) {
      if (exps[i] && exps[i].status === 'active') {
        var createdDay = exps[i].createdAt ? dayKeyLocal(Date.parse(exps[i].createdAt)) : '';
        if (createdDay && createdDay !== today) {
          evaluation = window.Habits.evaluateExperiment(exps[i], metrics);
          exps[i].status = 'done';
          saveLocalExps(m, exps);
        }
        break;
      }
    }
    renderResult({
      metrics: metrics,
      report: {
        pattern: rep.pattern,
        note: rep.note,
        experiment: rep.experiment,
        source: 'rules',
        fallback: false
      },
      evaluation: evaluation
    });
  }

  function refresh(force) {
    if (!el.card) return;
    if (shouldHide()) {
      hide();
      return;
    }
    var list = stateEntries();
    if (!list.length) {
      hide();
      return;
    }
    var m = mode();
    var key = m + '|' + JSON.stringify(list) + '|' + aiMode() + '|' + JSON.stringify(consent());
    if (!force && key === lastKey) return;
    lastKey = key;
    if (!hasBridge()) {
      offlineReport(list, m);
      return;
    }
    if (inflight) return;
    inflight = true;
    window.retoma.habitsReport({ mode: m, aiMode: aiMode(), consent: consent() }).then(function (payload) {
      inflight = false;
      renderResult(payload);
      refreshStatus();
    }, function () {
      inflight = false;
      offlineReport(list, m);
    });
  }

  function accept() {
    if (!current || !current.report || !current.report.experiment) return;
    var m = mode();
    var exp = current.report.experiment;
    if (hasBridge()) {
      window.retoma.habitsAccept(exp, { mode: m }).then(function () {
        if (el.evalLine) {
          el.evalLine.textContent = 'Saved. Tomorrow this card measures it.';
          el.evalLine.classList.remove('is-hidden');
        }
      }, function () { /* card keeps the note */ });
      return;
    }
    var exps = loadLocalExps(m);
    exps.forEach(function (e) { if (e && e.status === 'active') e.status = 'done'; });
    exps.push({
      id: 'exp-' + Date.now(),
      createdAt: new Date().toISOString(),
      pattern: exp.pattern || current.report.pattern || '',
      metric: exp.metric || 'longest',
      target: exp.target,
      direction: exp.direction || 'atLeast',
      trigger: exp.trigger,
      action: exp.action,
      minutes: exp.minutes,
      text: exp.text,
      status: 'active'
    });
    saveLocalExps(m, exps);
    if (el.evalLine) {
      el.evalLine.textContent = 'Saved. Tomorrow this card measures it.';
      el.evalLine.classList.remove('is-hidden');
    }
  }

  function ask() {
    if (!el.answer || !el.input) return;
    var q = String(el.input.value || '').trim().slice(0, 200);
    if (!q) return;
    function show(text) {
      el.answer.textContent = String(text || '').slice(0, 240);
      el.answer.classList.remove('is-hidden');
    }
    var m = mode();
    var list = stateEntries();
    if (hasBridge()) {
      window.retoma.habitsAsk(q, { mode: m, aiMode: aiMode(), consent: consent() }).then(function (res) {
        show(res && res.answer);
      }, function () {
        if (hasLib()) show(window.Habits.rulesAsk(window.Habits.computeMetrics(stamp(list)), q));
      });
      return;
    }
    if (hasLib()) show(window.Habits.rulesAsk(window.Habits.computeMetrics(stamp(list)), q));
  }

  function refreshStatus() {
    if (!el.status) return;
    if (!(window.retoma && window.retoma.aiStatus)) {
      el.status.textContent = 'Local model: needs the desktop app';
      return;
    }
    if (aiMode() !== 'local' || !consent().local) {
      el.status.textContent = 'Local model: off';
      return;
    }
    window.retoma.aiStatus({ consent: consent() }).then(function (st) {
      if (!st || st.gated) {
        el.status.textContent = 'Local model: off';
      } else if (st.reachable && st.model) {
        el.status.textContent = 'Local model: ready (' + st.model + ')';
      } else if (st.reachable) {
        el.status.textContent = 'Local model: reachable, no model installed';
      } else {
        el.status.textContent = 'Local model: unreachable';
      }
    }, function () {
      el.status.textContent = 'Local model: unreachable';
    });
  }

  function mount() {
    el.card = document.getElementById('habitCard');
    el.tag = document.getElementById('habitTag');
    el.note = document.getElementById('habitNote');
    el.experiment = document.getElementById('habitExperiment');
    el.evalLine = document.getElementById('habitEval');
    el.accept = document.getElementById('habitAccept');
    el.refreshBtn = document.getElementById('habitRefresh');
    el.input = document.getElementById('habitAskInput');
    el.askBtn = document.getElementById('habitAskBtn');
    el.answer = document.getElementById('habitAskAnswer');
    el.status = document.getElementById('aiStatus');
    if (el.accept) el.accept.addEventListener('click', accept);
    if (el.refreshBtn) el.refreshBtn.addEventListener('click', function () { refresh(true); });
    if (el.askBtn) el.askBtn.addEventListener('click', ask);
    if (el.input) {
      el.input.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter') ask();
      });
    }
    var tabs = document.querySelectorAll('.retoma-tabs__btn');
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].addEventListener('click', function () {
        var tab = this.getAttribute('data-tab');
        if (tab === 'hoy') refresh(false);
        if (tab === 'priv') refreshStatus();
      });
    }
    var modes = document.querySelectorAll('[data-mode]');
    for (var j = 0; j < modes.length; j++) {
      modes[j].addEventListener('click', function () {
        lastKey = '';
        current = null;
      });
    }
    refreshStatus();
    refresh(false);
  }

  return { mount: mount, refresh: refresh, hide: hide, refreshStatus: refreshStatus };
})();
