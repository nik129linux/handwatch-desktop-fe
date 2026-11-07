/* retoma.js — tracker logic, resume-card builder, timeline, AI proposals */
var Retoma = (function () {
  'use strict';

  var state = {
    currentApp: 'Document',
    currentTitle: 'Quality report (paragraph 3)',
    timeInCurrent: 0,
    paused: false,
    pausedUntil: 0,
    away: false,
    awayMinutes: 0,
    awayTimer: null,
    prevApp: null,
    prevTitle: null,
    prevWindows: [],
    interruptionApp: 'WhatsApp',
    timeline: [],
    empty: false,
    liveTimeline: [],
    liveEmpty: true,
    proposalDismissed: false,
    aiMode: 'off',
    aiConsent: { local: false, cloud: false, server: false },
    aiBusy: false,
    aiToken: 0,
    aiSuggestBusy: false,
    suppressProposal: false,
    cloudAvailable: false,
    cloudReason: '',
    pendingMode: null,
    quota: null,
    currentProposal: null,
    acceptedBlock: null,
    proposalAccepted: false,
    adjust: null
  };

  var el = {};
  var clockH = 9, clockM = 0;
  var tickTimer = null;
  var activeTab = 'ahora';
  var resumeAiToken = 0;
  /* -1 is the live view; 1 is the newest timeline entry, N the oldest. */
  var browseIndex = -1;
  var browseSig = '';
  var noteSavedTimer = null;

  function timelineSig() {
    return activeEntries().map(function (e) { return e.app + ':' + e.duration + ':' + (e.title || ''); }).join('|');
  }

  function resetBrowse() {
    browseIndex = -1;
    browseSig = '';
  }

  function isLiveMode() {
    try {
      return !!(window.Live && Live.isLive && Live.isLive());
    } catch (e) { return false; }
  }

  function noteKey() {
    return 'retoma.note.' + (isLiveMode() ? 'live' : 'demo');
  }
  function loadNote() {
    try { return window.localStorage.getItem(noteKey()) || ''; } catch (e) { return ''; }
  }
  function saveNote(value) {
    try {
      var v = value == null ? '' : String(value);
      var key = noteKey();
      if (v.trim() === '') window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, v.trim());
    } catch (e) { /* noop */ }
    renderNowNote();
  }
  function currentNote() {
    if (el.leaveNote) return String(el.leaveNote.value || '').trim();
    return String(loadNote() || '').trim();
  }
  /* The saved note is pinned right under the Now title. Earlier browsing
   * is history, not the live task, so the pin steps aside there. */
  function renderNowNote() {
    var n = el.nowNote;
    if (!n) return;
    var note = currentNote();
    if (!note || browseIndex >= 0) {
      n.textContent = '';
      n.style.display = 'none';
      return;
    }
    n.textContent = 'Next: ' + note;
    n.style.display = '';
  }
  /* Grow the note field to its content, never past three lines. */
  function growLeaveNote() {
    var n = el.leaveNote;
    if (!n) return;
    n.style.height = 'auto';
    var cs = window.getComputedStyle ? window.getComputedStyle(n) : null;
    var lh = cs ? parseFloat(cs.lineHeight) : 24;
    if (!(lh > 0)) lh = 24;
    var pad = cs ? (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0) : 0;
    var border = cs ? (parseFloat(cs.borderTopWidth) || 0) + (parseFloat(cs.borderBottomWidth) || 0) : 2;
    var minH = lh + pad + border;
    var maxH = lh * 3 + pad + border;
    var h = n.scrollHeight + border;
    n.style.height = Math.min(Math.max(h, minH), maxH) + 'px';
  }
  function showNoteSaved(full) {
    if (el.leaveNoteSaved) {
      el.leaveNoteSaved.textContent = full ? "Saved, you'll see it when you come back" : 'Saved';
      el.leaveNoteSaved.classList.add('is-visible');
    }
  }
  function stashNoteSaved() {
    if (noteSavedTimer) { clearTimeout(noteSavedTimer); noteSavedTimer = null; }
    if (el.leaveNoteSaved) el.leaveNoteSaved.classList.remove('is-visible');
  }
  function scheduleNoteSave() {
    if (noteSavedTimer) clearTimeout(noteSavedTimer);
    noteSavedTimer = setTimeout(function () {
      noteSavedTimer = null;
      if (!el.leaveNote) return;
      saveNote(el.leaveNote.value);
      showNoteSaved();
    }, 600);
  }
  function cleanNoteText(value) {
    return String(value == null ? '' : value).replace(/[\r\n]+/g, ' ');
  }
  function clearNote() {
    resumeAiToken++;
    if (el.leaveNote) { el.leaveNote.value = ''; growLeaveNote(); }
    try { window.localStorage.removeItem(noteKey()); } catch (e) { /* noop */ }
    if (el.resumeNote) { el.resumeNote.textContent = ''; el.resumeNote.classList.add('is-hidden'); }
    if (el.resumeAi) { el.resumeAi.textContent = ''; el.resumeAi.classList.add('is-hidden'); }
    renderNowNote();
  }

  /* Live reads ONLY live events: never fall back to the demo seed. */
  function activeEntries() {
    if (isLiveMode()) return state.liveTimeline;
    return state.timeline;
  }

  function formatClock() {
    var h = String(clockH).padStart(2, '0');
    var m = String(clockM).padStart(2, '0');
    return h + ':' + m;
  }

  function advanceClock(mins) {
    clockM += mins;
    while (clockM >= 60) { clockM -= 60; clockH = (clockH + 1) % 24; }
    renderClock();
  }

  function setClock(h, m) {
    clockH = h; clockM = m;
    renderClock();
  }

  function renderClock() {
    if (el.deskClock) el.deskClock.textContent = formatClock();
    if (el.nowClock) el.nowClock.textContent = formatClock();
  }

  function switchApp(next) {
    if (state.paused) return;
    if (isLiveMode()) return;
    var prev = state.currentApp;
    if (prev) {
      var dur = state.timeInCurrent || 5;
      state.timeline.push({ app: prev, duration: dur });
      if (state.timeline.length > 12) state.timeline.shift();
    }
    state.currentApp = next.label;
    state.currentTitle = next.title;
    state.timeInCurrent = 0;
    resetBrowse();
    Desk.focus(next.label);
    renderAhora();
    renderTimeline();
    persistTimeline();
    Events.emit('app:switch', next);
  }

  function rotateApp() {
    var n = Events.nextApp();
    switchApp(n);
  }

  function receiveWhatsapp() {
    switchApp(Events.findByLabel('WhatsApp'));
  }

  function goAway(minutes) {
    if (isLiveMode()) return;
    minutes = minutes || 25;
    resetBrowse();
    state.away = true;
    state.awayMinutes = minutes;
    state.prevApp = state.currentApp;
    state.prevTitle = state.currentTitle;
    state.prevWindows = ['Document', 'Browser', 'Spreadsheet'];
    hideResume();
    Desk.minimize('Document');
    renderAhoraAway();
  }

  function comeBack() {
    if (!state.away) return;
    resetBrowse();
    state.away = false;
    if (state.paused) {
      // paused mid-away cancels the episode: no clock jump, no resume card.
      renderAhora();
      return;
    }
    advanceClock(state.awayMinutes);
    // The desk is whole again on return: Document is back in both themes,
    // with or without a resume card. Resume only refocuses from here.
    if (window.Desk && Desk.restore) Desk.restore('Document');
    if (state.awayMinutes >= 10) {
      showResume();
      openPanel();
      switchTab('ahora');
      if (window.retoma && window.retoma.notifyReturn) {
        try { window.retoma.notifyReturn({ awayMinutes: state.awayMinutes, app: state.prevApp }); } catch (e) { /* demo keeps going */ }
      }
    }
    renderAhora();
  }

  function showResume() {
    if (!el.resumeCard) return;
    var live = window.Live && Live.isLive && Live.isLive();
    if (el.retomaPanel) el.retomaPanel.classList.add('has-resume');
    el.resumeCard.classList.remove('is-hidden');
    if (el.resumeHero) {
      el.resumeHero.textContent = 'You were in ' + state.prevApp;
      splitHeroWords(el.resumeHero);
    }
    if (el.resumeSub) el.resumeSub.textContent = state.prevTitle;
    if (el.resumeInter) {
      el.resumeInter.textContent = live
        ? 'Away ' + state.awayMinutes + ' min · back now'
        : state.interruptionApp + ' interrupted you · ' + state.awayMinutes + ' min';
    }
    var honest = document.getElementById('resumeHonest');
    if (honest) honest.classList.toggle('is-hidden', !live);
    if (el.retomarBtn) el.retomarBtn.textContent = live ? 'Got it' : 'Resume';
    if (el.resumeChips) {
      el.resumeChips.textContent = '';
      (state.prevWindows || []).forEach(function (w, i) {
        if (i > 0) {
          var sep = document.createElement('span');
          sep.className = 'resume-chip__sep';
          sep.textContent = ' · ';
          el.resumeChips.appendChild(sep);
        }
        var chip = document.createElement('span');
        chip.className = 'resume-chip';
        chip.textContent = w;
        el.resumeChips.appendChild(chip);
      });
    }
    var note = loadNote();
    if (el.resumeNote) {
      if (note) {
        el.resumeNote.textContent = 'Next: ' + note;
        el.resumeNote.classList.remove('is-hidden');
      } else {
        el.resumeNote.textContent = '';
        el.resumeNote.classList.add('is-hidden');
      }
    }
    // resumeAi under hero
    if (el.resumeAi) {
      el.resumeAi.textContent = '';
      el.resumeAi.classList.add('is-hidden');
    }
    var token = ++resumeAiToken;
    if (window.retoma && window.retoma.resumeLine) {
      var ctx = { app: state.prevApp, title: state.prevTitle, note: note, awayMinutes: state.awayMinutes };
      var opts = { mode: state.aiMode, consent: state.aiConsent, lang: uiLang() };
      try {
        window.retoma.resumeLine(ctx, opts).then(function (res) {
          if (token !== resumeAiToken) return;
          if (res && res.quota) setQuota(res.quota);
          // Rules only repeat the hero + note line: show the line only when a model wrote it.
          if (!res || !res.text || res.fallback || res.source === 'On-device rules') {
            if (el.resumeAi) el.resumeAi.classList.add('is-hidden');
            return;
          }
          if (el.resumeAi) {
            el.resumeAi.textContent = '';
            var t = document.createElement('span');
            t.textContent = res.text;
            el.resumeAi.appendChild(t);
            if (res.source) {
              var tag = document.createElement('small');
              tag.className = 'resume-ai__source';
              tag.textContent = res.source;
              el.resumeAi.appendChild(document.createTextNode(' '));
              el.resumeAi.appendChild(tag);
            }
            el.resumeAi.classList.remove('is-hidden');
          }
        }, function () {
          if (token !== resumeAiToken) return;
          if (el.resumeAi) el.resumeAi.classList.add('is-hidden');
        });
      } catch (e) { /* noop */ }
    }
    el.resumeCard.classList.remove('is-visible');
    void el.resumeCard.offsetWidth;
    el.resumeCard.classList.add('is-visible');
  }

  function splitHeroWords(heroEl) {
    var text = heroEl.textContent || '';
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    heroEl.innerHTML = '';
    text.split(' ').forEach(function (word, i) {
      var s = document.createElement('span');
      s.className = 'w';
      s.textContent = word;
      if (!reduce) s.style.transitionDelay = (i * 100) + 'ms';
      heroEl.appendChild(s);
      heroEl.appendChild(document.createTextNode(' '));
    });
  }

  function fmtClock(totalMin) {
    var h = Math.floor(totalMin / 60) % 24;
    var m = totalMin % 60;
    return h + ':' + String(m).padStart(2, '0');
  }

  function computeProposal(data) {
    if (!data || !data.length) {
      if (isLiveMode()) return null;
      data = Events.seedTimeline;
    }
    var entries = data.slice();
    var longest = entries[0] || { app: 'Document', duration: 40 };
    entries.forEach(function (e) { if (e.duration > longest.duration) longest = e; });
    var ix = -1;
    for (var i = 0; i < entries.length; i++) {
      if (entries[i].app === 'WhatsApp') { ix = i; break; }
    }
    if (ix === -1) ix = entries.length > 1 ? 1 : 0;
    var startMin = 9 * 60;
    for (var j = 0; j < ix; j++) startMin += entries[j].duration;
    var rawStart = Math.max(6 * 60, startMin - 60);
    var winStart = Math.ceil(rawStart / 15) * 15;
    var winEnd = winStart + longest.duration;
    return {
      longest: longest,
      interApp: entries[ix] ? entries[ix].app : longest.app,
      interStart: startMin,
      winStart: winStart,
      winEnd: winEnd,
      text: 'Tomorrow: ' + longest.duration + ' min for the report, ' + fmtClock(winStart) + ' to ' + fmtClock(winEnd) + ', before the messages arrive.',
      how: 'How I decided: longest block ' + longest.app + ' ' + longest.duration + ' min · first interruption ' + (entries[ix] ? entries[ix].app : longest.app) + ' ' + fmtClock(startMin) + ' · window ' + fmtClock(winStart) + '–' + fmtClock(winEnd)
    };
  }

  function proposalData() {
    var data = activeEntries();
    return data && data.length ? data : Events.seedTimeline;
  }

  function proposalSummary() {
    return Ai.buildSummary(proposalData());
  }

  function paintRulesProposal(data) {
    var p = computeProposal(data);
    if (!p) return false;
    state.currentProposal = {
      start: fmtClock(p.winStart),
      minutes: Math.max(15, Math.min(180, Math.round(p.longest.duration))),
      reason: p.how
    };
    var textEl = document.getElementById('proposalText');
    var howEl = document.getElementById('proposalHow');
    var tagEl = document.getElementById('proposalTag');
    if (textEl) textEl.textContent = p.text;
    if (howEl) howEl.textContent = p.how;
    if (tagEl) tagEl.textContent = 'On-device rules';
    return true;
  }

  function paintProviderProposal(res) {
    if (!res || !Ai.validProposal(res)) return false;
    var textEl = document.getElementById('proposalText');
    var howEl = document.getElementById('proposalHow');
    var tagEl = document.getElementById('proposalTag');
    var f = Ai.formatProposal(res);
    state.currentProposal = { start: res.start, minutes: res.minutes, reason: res.reason };
    if (textEl) textEl.textContent = f.text;
    if (howEl) howEl.textContent = res.fallback && res.note ? f.how + ' · ' + res.note : f.how;
    if (tagEl) tagEl.textContent = sourceLabel(res.source, res.fallback);
    return true;
  }

  function renderProposal(data) {
    var card = document.getElementById('proposalCard');
    /* Live with no live events: no proposal, and propose() never runs. */
    if (isLiveMode() && (!data || !data.length)) {
      if (card) { card.classList.add('is-hidden'); card.classList.remove('is-loading'); }
      return null;
    }
    var useProvider = hasBridge() && (state.aiMode === 'local' || state.aiMode === 'server') && state.aiConsent[state.aiMode] && !state.suppressProposal;
    if (!useProvider) {
      var p = paintRulesProposal(data);
      if (!p) {
        if (card) { card.classList.add('is-hidden'); card.classList.remove('is-loading'); }
        return null;
      }
      if (card) card.classList.remove('is-loading');
      return true;
    }
    var summary = Ai.buildSummary(data && data.length ? data : Events.seedTimeline);
    var token = ++state.aiToken;
    state.aiBusy = true;
    if (card) card.classList.add('is-loading');
    var textEl = document.getElementById('proposalText');
    var howEl = document.getElementById('proposalHow');
    if (textEl) textEl.innerHTML = '<span class="skeleton-bar"></span><span class="skeleton-bar skeleton-bar--short"></span>';
    if (howEl) howEl.textContent = '';
    window.retoma.propose(summary, { mode: state.aiMode, consent: state.aiConsent, lang: uiLang() }).then(function (res) {
      if (token !== state.aiToken) return;
      state.aiBusy = false;
      if (card) card.classList.remove('is-loading');
      if (res && res.quota) setQuota(res.quota);
      if (!paintProviderProposal(res)) {
        if (!paintRulesProposal(data)) { if (card) card.classList.add('is-hidden'); }
      }
    }, function () {
      if (token !== state.aiToken) return;
      state.aiBusy = false;
      if (card) card.classList.remove('is-loading');
      if (!paintRulesProposal(data)) { if (card) card.classList.add('is-hidden'); }
    });
    return null;
  }

  /* --- Suggest with AI ---------------------------------------------------
   * One visible button that always calls the server and shows what answered:
   * model, latency and the remaining requests. Without the desktop bridge the
   * button stays on screen, disabled, so the card never pretends. */

  function isServerSource(source) {
    return typeof source === 'string' && source.indexOf('Retoma server') === 0;
  }

  function modelFromSource(source) {
    var ix = typeof source === 'string' ? source.indexOf('\u00b7') : -1;
    return ix === -1 ? '' : source.slice(ix + 1).trim();
  }

  function suggestFace() {
    return document.querySelector('#aiSuggestBtn .ring-face');
  }

  function setSuggestLabel(text) {
    var label = document.getElementById('aiSuggestLabel');
    if (label) label.textContent = text;
  }

  function suggestCopy() {
    if (state.proposalAccepted) return uiLang() === 'es' ? 'Sugerir otra con IA' : 'Suggest another with AI';
    return uiLang() === 'es' ? 'Sugerir con IA' : 'Suggest with AI';
  }

  /* Accepted: the card stays, says what is planned, and the AI button offers
   * another idea. A new suggestion (or a new day) clears it. */
  function setAccepted(on) {
    state.proposalAccepted = !!on;
    var card = document.getElementById('proposalCard');
    if (card) card.classList.toggle('is-accepted', state.proposalAccepted);
    var actions = document.getElementById('proposalActions');
    if (actions) actions.classList.toggle('is-hidden', state.proposalAccepted);
    var line = document.getElementById('proposalAccepted');
    if (line) {
      var b = state.acceptedBlock;
      line.textContent = state.proposalAccepted && b
        ? 'Planned for tomorrow, ' + b.start + '\u2013' + fmtClock(Ai.parseClock(b.start) + b.minutes)
        : '';
      line.classList.toggle('is-hidden', !state.proposalAccepted);
    }
    paintSuggestCopy();
  }

  function paintSuggestCopy() {
    if (!state.aiSuggestBusy) setSuggestLabel(suggestCopy());
  }

  function syncSuggestButton() {
    var btn = document.getElementById('aiSuggestBtn');
    if (!btn) return;
    var ready = hasBridge();
    btn.disabled = !ready;
    btn.title = ready ? '' : 'Needs the desktop app';
  }

  function restoreSuggestButton() {
    state.aiSuggestBusy = false;
    var btn = document.getElementById('aiSuggestBtn');
    if (btn) { btn.disabled = !hasBridge(); btn.title = hasBridge() ? '' : 'Needs the desktop app'; }
    setSuggestLabel(suggestCopy());
    var face = suggestFace();
    if (face) face.classList.remove('is-thinking');
  }

  function hideSuggestConsent() {
    var box = document.getElementById('aiSuggestConsent');
    if (box) box.classList.add('is-hidden');
  }

  function paintSuggestPayload(summary, mode, preId) {
    var pre = document.getElementById(preId);
    if (!pre) return;
    var paint = function (payload) { pre.textContent = JSON.stringify(payload, null, 2); };
    if (window.retoma && window.retoma.previewPayload) {
      window.retoma.previewPayload(summary, mode).then(paint, function () { paint(Ai.previewLocal(summary)); });
    } else {
      paint(Ai.previewLocal(summary));
    }
  }

  function showSuggestConsent() {
    var box = document.getElementById('aiSuggestConsent');
    if (!box) return;
    paintSuggestPayload(proposalSummary(), 'server', 'aiSuggestPayload');
    box.classList.remove('is-hidden');
  }

  function setProofLine(text) {
    var line = document.getElementById('aiProofLine');
    if (line) line.textContent = text;
    var box = document.getElementById('aiProof');
    if (box) box.classList.remove('is-hidden');
  }

  function triggerLimitNotice(res) {
    var limit = res && res.quota && quotaKnown(res.quota)
      ? res.quota.limit
      : (quotaKnown(state.quota) ? state.quota.limit : 1);
    setQuota({ left: 0, limit: limit });
  }

  function markFresh() {
    var textEl = document.getElementById('proposalText');
    if (!textEl) return;
    textEl.classList.remove('is-fresh');
    void textEl.offsetWidth;
    textEl.classList.add('is-fresh');
    setTimeout(function () { textEl.classList.remove('is-fresh'); }, 300);
  }

  function runAiSuggest() {
    var btn = document.getElementById('aiSuggestBtn');
    if (!btn || !hasBridge() || state.aiSuggestBusy) return;
    var summary = proposalSummary();
    var t0 = (window.performance && performance.now) ? performance.now() : Date.now();
    var card = document.getElementById('proposalCard');
    state.aiSuggestBusy = true;
    btn.disabled = true;
    setSuggestLabel('Thinking\u2026');
    var face = suggestFace();
    if (face) face.classList.add('is-thinking');
    if (card) card.classList.add('is-loading');
    hideSuggestConsent();
    var token = ++state.aiToken;
    window.retoma.propose(summary, { mode: 'server', consent: state.aiConsent, lang: uiLang() }).then(function (res) {
      if (token === state.aiToken) state.proposalAccepted = false;
      restoreSuggestButton();
      if (token !== state.aiToken) return;
      setAccepted(false);
      if (card) card.classList.remove('is-loading');
      if (res && res.quota) setQuota(res.quota);
      var real = isServerSource(res && res.source) && !res.fallback;
      if (real && paintProviderProposal(res)) {
        var ms = ((window.performance && performance.now) ? performance.now() : Date.now()) - t0;
        var left = res.quota && quotaKnown(res.quota)
          ? Math.max(0, Math.floor(res.quota.left))
          : (quotaKnown(state.quota) ? state.quota.left : null);
        var model = modelFromSource(res.source);
        var line = (model ? model + ' \u00b7 ' : '') + 'Retoma server \u00b7 ' + (ms / 1000).toFixed(1) + ' s';
        if (left !== null) line += ' \u00b7 ' + left + ' requests left';
        setProofLine(line);
        markFresh();
      } else {
        if (res && res.limitReached) triggerLimitNotice(res);
        paintRulesProposal(proposalData());
        setProofLine('The server did not answer, so on-device rules made this one.');
      }
      paintSuggestPayload(summary, 'server', 'aiProofPayload');
    }, function () {
      if (token === state.aiToken) state.proposalAccepted = false;
      restoreSuggestButton();
      if (token !== state.aiToken) return;
      setAccepted(false);
      if (card) card.classList.remove('is-loading');
      paintRulesProposal(proposalData());
      setProofLine('The server did not answer, so on-device rules made this one.');
      paintSuggestPayload(summary, 'server', 'aiProofPayload');
    });
  }

  function aiSuggestClick() {
    if (!hasBridge()) { syncSuggestButton(); return; }
    if (state.aiMode === 'server' && state.aiConsent.server) { runAiSuggest(); return; }
    showSuggestConsent();
  }

  function sendSuggestedAi() {
    hideSuggestConsent();
    /* Same path the Privacy panel's Allow button takes, so the radio and the
     * saved preference move together. renderTimeline runs once, silently. */
    state.suppressProposal = true;
    try { grantAiConsentMode('server'); } finally { state.suppressProposal = false; }
    if (state.aiMode === 'server' && state.aiConsent.server) runAiSuggest();
  }

  /* The proposal tag names the real source. The resume card is not AI
   * and carries no tag. Rules output is always "On-device rules". */
  function sourceLabel(source, fallback) {
    if (fallback) return 'On-device rules';
    if (!source || source === 'rules') return 'On-device rules';
    return source;
  }

  function hasBridge() {
    return !!(window.retoma && window.retoma.propose);
  }

  /* --- Daily AI quota ---------------------------------------------------- */

  function quotaKnown(q) {
    return !!q && typeof q.left === 'number' && isFinite(q.left) &&
      typeof q.limit === 'number' && isFinite(q.limit) && q.limit > 0;
  }

  function setQuota(q) {
    if (!quotaKnown(q)) return;
    state.quota = { left: Math.max(0, Math.floor(q.left)), limit: Math.floor(q.limit) };
    paintQuota();
  }

  function quotaBarIds() {
    return [
      { box: 'quotaHoy', text: 'quotaTextHoy', fill: 'quotaFillHoy', btn: 'quotaOllamaHoy' },
      { box: 'quotaPriv', text: 'quotaTextPriv', fill: 'quotaFillPriv', btn: 'quotaOllamaPriv' }
    ];
  }

  function paintQuota() {
    var q = state.quota;
    var show = state.aiMode === 'server' && quotaKnown(q);
    quotaBarIds().forEach(function (ids) {
      var box = document.getElementById(ids.box);
      if (!box) return;
      box.classList.toggle('is-hidden', !show);
      if (!show) return;
      var text = document.getElementById(ids.text);
      var fill = document.getElementById(ids.fill);
      var btn = document.getElementById(ids.btn);
      var pct = Math.max(0, Math.min(100, q.left / q.limit * 100));
      pct = Math.round(pct * 10) / 10;
      if (fill) fill.style.width = pct + '%';
      var bar = fill && fill.parentElement;
      if (bar) bar.setAttribute('aria-valuenow', String(Math.round(pct)));
      var reached = q.left <= 0;
      if (text) {
        text.textContent = reached
          ? 'AI limit reached. Connect Ollama to keep going.'
          : 'AI requests: ' + q.left + ' left';
      }
      if (btn) btn.classList.toggle('is-hidden', !reached);
    });
  }

  /* Re-read the last quota saved by the main process (or the test stub). */
  function refreshQuota() {
    paintQuota();
    if (state.aiMode !== 'server') return;
    if (!(window.retoma && window.retoma.aiQuota)) return;
    try {
      window.retoma.aiQuota(isLiveMode() ? 'live' : 'demo').then(function (q) {
        if (state.aiMode !== 'server') return;
        setQuota(q);
      }, function () { /* no saved quota yet */ });
    } catch (e) { /* noop */ }
  }

  function connectOllama() {
    switchTab('priv');
    var panel = document.getElementById('ollamaConnect');
    if (panel) panel.classList.remove('is-hidden');
    if (state.aiMode !== 'local') selectAiMode('local');
    var input = document.getElementById('ollamaUrl');
    if (input) {
      if (!input.value) input.value = 'http://127.0.0.1:11434';
      setTimeout(function () {
        try { input.focus(); input.select(); } catch (e) { /* noop */ }
      }, 60);
    }
  }

  function testOllama() {
    var input = document.getElementById('ollamaUrl');
    var out = document.getElementById('ollamaTestResult');
    var url = input ? String(input.value || '').trim() : '';
    if (!url || !out) return;
    function say(text) {
      out.textContent = text;
      out.classList.remove('is-hidden');
    }
    if (!(window.retoma && window.retoma.aiStatus)) { say('Not reachable'); return; }
    say('Testing…');
    try {
      window.retoma.aiStatus({ ollamaUrl: url, consent: state.aiConsent }).then(function (st) {
        if (st && st.reachable) say('Connected' + (st.model ? ' \u00b7 ' + st.model : ''));
        else say('Not reachable');
      }, function () { say('Not reachable'); });
    } catch (e) { say('Not reachable'); }
  }

  /* --- Proposal Adjust: start time + 15-min steps, clamped 15..180 ------- */

  function adjustValid() {
    if (!state.adjust) return false;
    var clock = Ai.parseClock(state.adjust.start);
    var minutes = state.adjust.minutes;
    return clock !== null && Number.isInteger(minutes) && minutes >= 15 && minutes <= 180;
  }

  function validateAdjust() {
    var okv = adjustValid();
    if (el.adjustError) el.adjustError.classList.toggle('is-hidden', okv);
    if (el.proposalAccept) el.proposalAccept.disabled = !okv;
    return okv;
  }

  function startAdjust() {
    if (!state.currentProposal) return;
    state.adjust = {
      start: state.currentProposal.start,
      minutes: Math.max(15, Math.min(180, Math.round(state.currentProposal.minutes)))
    };
    if (el.proposalAdjuster) el.proposalAdjuster.classList.remove('is-hidden');
    if (el.adjustStart) el.adjustStart.value = state.adjust.start;
    if (el.adjustMinutes) el.adjustMinutes.textContent = String(state.adjust.minutes);
    validateAdjust();
    if (el.adjustStart) {
      try { el.adjustStart.focus(); } catch (e) { /* noop */ }
    }
  }

  function endAdjust() {
    state.adjust = null;
    if (el.proposalAdjuster) el.proposalAdjuster.classList.add('is-hidden');
    if (el.adjustError) el.adjustError.classList.add('is-hidden');
    if (el.proposalAccept) el.proposalAccept.disabled = false;
  }

  function bumpAdjust(delta) {
    if (!state.adjust) return;
    state.adjust.minutes = Math.max(15, Math.min(180, state.adjust.minutes + delta));
    if (el.adjustMinutes) el.adjustMinutes.textContent = String(state.adjust.minutes);
    validateAdjust();
  }

  function readAdjustStart() {
    if (!state.adjust || !el.adjustStart) return;
    state.adjust.start = String(el.adjustStart.value || '').trim();
    validateAdjust();
  }

  function loadAiPrefs() {
    try {
      var m = window.localStorage.getItem('retoma-ai-mode');
      if (m === 'off' || m === 'local' || m === 'cloud' || m === 'server') state.aiMode = m;
      var c = JSON.parse(window.localStorage.getItem('retoma-ai-consent') || '{}');
      if (c) { state.aiConsent.local = !!c.local; state.aiConsent.cloud = !!c.cloud; state.aiConsent.server = !!c.server; }
    } catch (e) { /* prefs stay default */ }
  }

  function saveAiPrefs() {
    try {
      window.localStorage.setItem('retoma-ai-mode', state.aiMode);
      window.localStorage.setItem('retoma-ai-consent', JSON.stringify(state.aiConsent));
    } catch (e) { /* noop */ }
  }

  function paintAiMode() {
    var btns = document.querySelectorAll('[data-ai-mode]');
    for (var i = 0; i < btns.length; i++) {
      var b = btns[i];
      var m = b.getAttribute('data-ai-mode');
      b.classList.toggle('is-active', m === state.aiMode);
      if (m === 'cloud') {
        b.disabled = !state.cloudAvailable;
        b.title = state.cloudAvailable ? '' : state.cloudReason;
      } else if (m === 'local') {
        b.disabled = !hasBridge();
        b.title = hasBridge() ? '' : 'Local model needs the desktop app';
      } else if (m === 'server') {
        b.disabled = !hasBridge();
        b.title = hasBridge() ? '' : 'Retoma server needs the desktop app';
      }
    }
    var reason = document.getElementById('aiModeReason');
    if (reason) {
      var msg = '';
      if (state.aiMode === 'cloud' && !state.cloudAvailable) msg = state.cloudReason;
      if (state.aiMode === 'local' && !hasBridge()) msg = 'Local model needs the desktop app';
      if (state.aiMode === 'server' && !hasBridge()) msg = 'Retoma server needs the desktop app';
      reason.textContent = msg;
      reason.classList.toggle('is-hidden', !msg);
    }
    refreshServerStatusLine();
    paintQuota();
    if (state.aiMode === 'server') refreshQuota();
  }

  var habitsPatched = false;
  function patchHabitsStatus() {
    if (habitsPatched) return;
    try {
      if (window.HabitsUI && HabitsUI.refreshStatus) {
        habitsPatched = true;
        var orig = HabitsUI.refreshStatus;
        HabitsUI.refreshStatus = function () {
          if (state.aiMode === 'server') { refreshServerStatusLineInner(); return; }
          return orig.apply(this, arguments);
        };
      }
    } catch (e) { /* noop */ }
  }

  function refreshServerStatusLineInner() {
    var st = document.getElementById('aiStatus');
    if (!st) return;
    if (!hasBridge() || !(window.retoma && window.retoma.serverStatus)) return;
    window.retoma.serverStatus().then(function (s) {
      if (state.aiMode !== 'server') return;
      if (s && s.reachable) {
        st.textContent = 'Retoma server: ready (' + (s.model || '') + ')';
      } else {
        st.textContent = 'Retoma server: offline, using on-device rules';
      }
    }, function () {
      if (state.aiMode !== 'server') return;
      st.textContent = 'Retoma server: offline, using on-device rules';
    });
  }

  function refreshServerStatusLine() {
    patchHabitsStatus();
    if (state.aiMode !== 'server') return;
    refreshServerStatusLineInner();
  }

  function refreshCapabilities() {
    if (!hasBridge()) {
      state.cloudAvailable = false;
      state.cloudReason = 'Cloud model needs the desktop app';
      if (state.aiMode !== 'off') state.aiMode = 'off';
      paintAiMode();
      return;
    }
    window.retoma.capabilities().then(function (caps) {
      state.cloudAvailable = !!(caps && caps.cloudAvailable);
      state.cloudReason = (caps && caps.cloudReason) || '';
      if (state.aiMode === 'cloud' && !state.cloudAvailable) state.aiMode = 'off';
      if ((state.aiMode === 'local' || state.aiMode === 'server') && !hasBridge()) state.aiMode = 'off';
      paintAiMode();
    }, function () { paintAiMode(); });
  }

  function hideConsent() {
    var box = document.getElementById('aiConsent');
    if (box) box.classList.add('is-hidden');
  }

  function showConsent(mode) {
    var box = document.getElementById('aiConsent');
    var pre = document.getElementById('aiPayload');
    if (!box || !pre) return;
    var copy = box.querySelector('.panel-section__text--muted');
    if (copy) {
      if (mode === 'server') {
        copy.textContent = "Your note, the app name and the window title go to Retoma's server, which asks gemma on Ollama cloud. Nothing is stored there.";
      } else {
        copy.textContent = 'This exact payload is sent. Nothing else leaves this device.';
      }
    }
    var entries = activeEntries();
    var summary = entries.length
      ? Ai.buildSummary(entries)
      : (isLiveMode()
        ? { perApp: {}, longest: { app: 'None', minutes: 0 }, firstInterruption: { app: 'None', at: '—' } }
        : Ai.buildSummary(Events.seedTimeline));
    paintAiMode();
    var paint = function (payload) {
      pre.textContent = JSON.stringify(payload, null, 2);
      box.classList.remove('is-hidden');
    };
    if (hasBridge() && window.retoma.previewPayload) {
      window.retoma.previewPayload(summary, mode).then(paint, function () { paint(Ai.previewLocal(summary)); });
    } else {
      paint(Ai.previewLocal(summary));
    }
  }

  function grantAiConsentMode(mode) {
    if (mode !== 'local' && mode !== 'cloud' && mode !== 'server') return;
    state.aiConsent[mode] = true;
    state.pendingMode = null;
    state.aiToken++;
    state.aiMode = mode;
    saveAiPrefs();
    hideConsent();
    paintAiMode();
    renderTimeline();
  }

  function selectAiMode(mode) {
    if (mode !== 'off' && mode !== 'local' && mode !== 'cloud' && mode !== 'server') return;
    if (mode === 'cloud' && !state.cloudAvailable) { paintAiMode(); return; }
    if ((mode === 'local' || mode === 'server') && !hasBridge()) { paintAiMode(); return; }
    if ((mode === 'local' || mode === 'cloud' || mode === 'server') && !state.aiConsent[mode]) {
      state.pendingMode = mode;
      showConsent(mode);
      return;
    }
    state.pendingMode = null;
    state.aiToken++;
    state.aiMode = mode;
    saveAiPrefs();
    hideConsent();
    paintAiMode();
    renderTimeline();
  }

  function persistTimeline() {
    if (isLiveMode()) {
      if (state.liveEmpty) return;
      Persist.save(state.liveTimeline, 'live');
      return;
    }
    if (state.empty) return;
    Persist.save(state.timeline, 'demo');
  }

  /* Swap the visible history when the mode flips; each mode keeps its own. */
  function reloadForMode(mode) {
    var m = mode === 'live' ? 'live' : 'demo';
    return Persist.load(m).then(function (events) {
      var list = (events || []).map(function (e) { return { app: e.app, duration: e.duration }; });
      if (m === 'live') {
        state.liveTimeline = list.slice(-12);
        state.liveEmpty = state.liveTimeline.length === 0;
      } else {
        if (list.length) {
          state.timeline = list.slice(-12);
          state.empty = false;
        }
      }
      hideResume();
      resetBrowse();
      renderAhora();
      renderTimeline();
      if (window.Live && Live.renderLiveNow) Live.renderLiveNow();
      if (window.Live && Live.renderLiveToday) Live.renderLiveToday();
      return true;
    });
  }

  function hideResume() {
    resetBrowse();
    updateBrowseControls();
    if (!el.resumeCard) return;
    resumeAiToken++;
    if (el.resumeAi) { el.resumeAi.textContent = ''; el.resumeAi.classList.add('is-hidden'); }
    if (el.retomaPanel) el.retomaPanel.classList.remove('has-resume');
    el.resumeCard.classList.remove('is-visible');
    setTimeout(function () {
      if (!el.resumeCard.classList.contains('is-visible')) el.resumeCard.classList.add('is-hidden');
    }, 320);
  }

  function doRetomar() {
    if (!el.resumeCard || !el.resumeCard.classList.contains('is-visible')) return;
    if (window.Live && Live.isLive && Live.isLive()) {
      // Live on Wayland cannot reopen windows: the card only reminds.
      clearNote();
      hideResume();
      return;
    }
    if (state.empty) return;
    Desk.reopen(state.prevWindows, true);
    clearNote();
    hideResume();
    var app = Events.findByLabel(state.prevApp);
    if (app) switchApp(app);
  }

  function doStartFresh() {
    clearNote();
    hideResume();
  }

  /* The model answers in the language the person reads the app in. */
  function uiLang() {
    try { return (window.I18n && I18n.getLang && I18n.getLang() === 'es') ? 'es' : 'en'; } catch (e) { return 'en'; }
  }

  var RING_BLOCK_MIN = 25;
  function renderRing(minutes) {
    var ring = document.getElementById('nowRing');
    var label = document.getElementById('nowRingLabel');
    if (!ring || !label) return;
    var known = typeof minutes === 'number' && isFinite(minutes) && minutes >= 0;
    var p = known ? Math.min(1, minutes / RING_BLOCK_MIN) : 0;
    ring.style.setProperty('--p', String(p));
    ring.classList.toggle('is-full', p >= 1);
    label.textContent = '';
    label.appendChild(document.createTextNode(known ? String(minutes) : '0'));
    var unit = document.createElement('small');
    unit.textContent = 'min';
    label.appendChild(unit);
    ring.setAttribute('aria-label', known
      ? minutes + ' minutes in this task. The ring fills at ' + RING_BLOCK_MIN + ' minutes.'
      : 'Not tracking right now');
  }

  function renderBrowse() {
    var entries = activeEntries();
    if (browseIndex > entries.length) browseIndex = entries.length;
    var e = entries[entries.length - browseIndex];
    if (!e) { resetBrowse(); renderAhora(); return; }
    renderRing(e.duration);
    el.nowApp.textContent = e.app;
    if (el.nowTitle) el.nowTitle.textContent = e.title || '';
    if (el.nowTime) el.nowTime.textContent = 'Was here ' + e.duration + ' min';
    if (el.nowWhen) el.nowWhen.textContent = 'Earlier, ' + browseIndex + ' of ' + entries.length;
    updateBrowseControls();
    renderNowNote();
  }

  function updateBrowseControls() {
    var n = activeEntries().length;
    if (el.nowPrev) el.nowPrev.disabled = n === 0 || browseIndex >= n;
    if (el.nowNext) el.nowNext.disabled = browseIndex < 0;
  }

  function goEarlier() {
    var n = activeEntries().length;
    if (!n) { resetBrowse(); updateBrowseControls(); return; }
    if (browseIndex < 0) {
      browseIndex = 1;
      browseSig = timelineSig();
    } else if (browseIndex < n) {
      browseIndex += 1;
    }
    renderAhora();
  }

  function goLater() {
    if (browseIndex < 0) return;
    if (browseIndex > 1) browseIndex -= 1;
    else resetBrowse();
    renderAhora();
  }

  function renderAhora() {
    if (!el.nowApp) return;
    if (browseIndex >= 0) {
      if (!hasTimelineEntries() || state.paused || state.away || timelineSig() !== browseSig) {
        resetBrowse();
      } else {
        renderBrowse();
        return;
      }
    }
    updateBrowseControls();
    renderNowNote();
    if (el.nowWhen) el.nowWhen.textContent = '';
    renderRing(null);
    if (isLiveMode() && !hasTimelineEntries() && !(window.Live && Live.state && Live.state.liveApp)) {
      /* Live with no live events: never show the demo's Document. */
      el.nowApp.textContent = 'Waiting for activity';
      if (el.nowTitle) el.nowTitle.textContent = 'Start any app to begin tracking.';
      if (el.nowTime) el.nowTime.textContent = '—';
      if (el.nowDesc) el.nowDesc.textContent = 'Only app names. Never what you type.';
      return;
    }
    if (state.paused) {
      el.nowApp.textContent = 'Paused: I am not watching anything';
      if (el.nowTitle) el.nowTitle.textContent = 'Retoma is paused. Resume whenever you like.';
      if (el.nowTime) el.nowTime.textContent = '—';
      if (el.nowDesc) el.nowDesc.textContent = 'Paused: I am not watching anything';
      return;
    }
    if (state.away) {
      el.nowApp.textContent = 'Away';
      if (el.nowTitle) el.nowTitle.textContent = 'Out · ' + state.awayMinutes + ' min';
      if (el.nowTime) el.nowTime.textContent = formatClock();
      if (el.nowDesc) el.nowDesc.textContent = 'Coming back shows where you left off.';
      return;
    }
    el.nowApp.textContent = state.currentApp;
    renderRing(state.timeInCurrent);
    if (el.nowTitle) el.nowTitle.textContent = state.currentTitle;
    if (el.nowTime) el.nowTime.textContent = state.timeInCurrent + ' min here';
    if (el.nowDesc) {
      el.nowDesc.textContent = (window.Live && Live.isLive && Live.isLive())
        ? ((Live.titlesOn && Live.titlesOn()) ? 'App name and title. Never what you type.' : 'Only the app name. Never what you type.')
        : 'Only the app name and the title. Never what you type.';
    }
  }

  function renderAhoraAway() {
    if (el.nowApp) el.nowApp.textContent = 'Away';
    if (el.nowTitle) el.nowTitle.textContent = 'Out · ' + state.awayMinutes + ' min';
    if (el.nowTime) el.nowTime.textContent = formatClock();
    if (el.nowDesc) el.nowDesc.textContent = 'Coming back shows where you left off.';
    if (el.nowWhen) el.nowWhen.textContent = '';
    updateBrowseControls();
  }

  function togglePause() {
    state.paused = !state.paused;
    if (window.retoma && window.retoma.setPaused) {
      try { window.retoma.setPaused(state.paused); } catch (e) { /* demo keeps going */ }
    }
    var btn = el.toggleBtn;
    if (btn) {
      btn.classList.toggle('is-paused', state.paused);
      btn.setAttribute('aria-pressed', String(state.paused));
      var eyeOpen = btn.querySelector('.eye-open');
      var eyeClosed = btn.querySelector('.eye-closed');
      if (eyeOpen && eyeClosed) {
        eyeOpen.style.display = state.paused ? 'none' : 'block';
        eyeClosed.style.display = state.paused ? 'block' : 'none';
      }
    }
    if (el.menuBar) el.menuBar.classList.toggle('is-paused', state.paused);
    if (el.simPause) el.simPause.textContent = state.paused ? 'Resume' : 'Pause';
    renderAhora();
    Events.emit('retoma:pause', state.paused);
  }

  function isPaused() { return state.paused; }

  function renderTimeline() {
    if (!el.timelineBar) return;
    if (state.aiMode === 'server') refreshQuota();
    /* Live reads ONLY live events: empty Live never falls back to the demo seed. */
    var dayStatement = document.getElementById('dayStatement');
    if (isLiveMode()) {
      if (dayStatement) dayStatement.style.display = 'none';
      if (state.liveEmpty || !state.liveTimeline.length) {
        el.timelineBar.innerHTML = '';
        if (el.timelineLegend) el.timelineLegend.innerHTML = '';
        if (el.timelineText) el.timelineText.textContent = '';
        if (el.proposalCard) { el.proposalCard.classList.add('is-hidden'); el.proposalCard.classList.remove('is-loading'); }
        if (window.HabitsUI && HabitsUI.hide) { try { HabitsUI.hide(); } catch (e) { /* noop */ } }
        if (el.timeline) el.timeline.classList.remove('is-hidden');
        el.timelineBar.style.display = 'none';
        if (el.timelineLegend) el.timelineLegend.style.display = 'none';
        if (el.emptyState) {
          el.emptyState.textContent = 'Nothing tracked yet';
          el.emptyState.classList.remove('is-hidden');
        }
        return;
      }
      if (dayStatement) dayStatement.style.display = 'none';
      renderLiveList(state.liveTimeline);
      return;
    }
    if (dayStatement) dayStatement.style.display = '';
    if (state.empty) {
      el.timelineBar.innerHTML = '';
      if (el.timelineLegend) el.timelineLegend.innerHTML = '';
      if (el.timelineText) el.timelineText.textContent = '';
      if (el.proposalCard) el.proposalCard.classList.add('is-hidden');
      if (window.HabitsUI && HabitsUI.hide) { try { HabitsUI.hide(); } catch (e) { /* noop */ } }
      if (el.timeline) el.timeline.classList.remove('is-hidden');
      el.timelineBar.style.display = 'none';
      if (el.timelineLegend) el.timelineLegend.style.display = 'none';
      if (el.emptyState) {
        el.emptyState.textContent = 'No history. Everything was deleted.';
        el.emptyState.classList.remove('is-hidden');
      }
      return;
    }
    renderLiveList(state.timeline.length ? state.timeline : Events.seedTimeline);
  }

  /* Shared painter for one non-empty list. Demo passes the seed fallback;
   * Live passes ONLY live entries (never the seed). */
  function renderLiveList(data) {
    var total = data.reduce(function (s, e) { return s + e.duration; }, 0) || 80;
    el.timelineBar.style.display = '';
    var colors = ['var(--seg-1)', 'var(--seg-2)', 'var(--seg-3)', 'var(--seg-4)', 'var(--seg-5)'];
    // map colors consistently by index; will be distinct via tokens
    el.timelineBar.innerHTML = data.map(function (e, i) {
      var w = (e.duration / total * 100).toFixed(1);
      return '<div class="timeline-bar__seg" style="width:' + w + '%;--i:' + i + ';background:' + colors[i % colors.length] + '"></div>';
    }).join('');
    if (el.timelineLegend) {
      el.timelineLegend.style.display = '';
      // merge same-app segments for legend (sum minutes), keep bar segments
      var merged = {};
      var order = [];
      var appFirstColor = {};
      data.forEach(function (e, i) {
        if (!merged.hasOwnProperty(e.app)) { merged[e.app] = 0; order.push(e.app); appFirstColor[e.app] = colors[i % colors.length]; }
        merged[e.app] += e.duration;
      });
      // longest uninterrupted (single) block explains proposal minutes
      var longestSingle = data[0] || { app: 'Document', duration: 40 };
      data.forEach(function (e) { if (e.duration > longestSingle.duration) longestSingle = e; });
      el.timelineLegend.innerHTML = order.map(function (app) {
        var c = appFirstColor[app];
        var label = app + ' · ' + merged[app] + ' min';
        if (app === longestSingle.app) {
          return '<span class="timeline-legend__item timeline-legend__item--major"><span class="timeline-legend__dot" style="background:' + c + '"></span><span class="timeline-legend__label">' + label + '</span><span class="timeline-legend__sub">longest block ' + longestSingle.duration + ' min</span></span>';
        }
        return '<span class="timeline-legend__item"><span class="timeline-legend__dot" style="background:' + c + '"></span>' + label + '</span>';
      }).join('');
    }
    if (el.timelineText) {
      el.timelineText.textContent = isLiveMode()
        ? 'Tracked today: ' + total + ' min on this PC'
        : 'Planned: 2 h on the report · Actual: 1 h 20 min';
    }
    if (!state.proposalAccepted) renderProposal(data);
    if (el.timeline) el.timeline.classList.remove('is-hidden');
    if (el.emptyState) el.emptyState.classList.add('is-hidden');
    if (!state.proposalDismissed && el.proposalCard) {
      el.proposalCard.classList.remove('is-hidden');
    } else if (state.proposalDismissed && el.proposalCard) {
      el.proposalCard.classList.add('is-hidden');
    }
    if (window.HabitsUI && HabitsUI.refresh) {
      try { HabitsUI.refresh(); } catch (e) { /* coach card keeps last state */ }
    }
  }

  function showEndOfDay() {
    if (isLiveMode()) {
      state.proposalDismissed = false;
      setAccepted(false);
      renderTimeline();
      if (el.timeline) el.timeline.classList.remove('is-hidden');
      openPanel();
      switchTab('hoy');
      return;
    }
    setClock(18, 0);
    if (!state.paused) {
      state.timeline.push({ app: state.currentApp, duration: state.timeInCurrent || 10 });
    }
    state.proposalDismissed = false;
    setAccepted(false);
    renderTimeline();
    persistTimeline();
    if (el.timeline) el.timeline.classList.remove('is-hidden');
    if (el.proposalCard) el.proposalCard.classList.remove('is-hidden');
    openPanel();
    switchTab('hoy');
  }

  function dismissProposal() {
    state.proposalDismissed = true;
    setAccepted(false);
    endAdjust();
    if (el.proposalCard) el.proposalCard.classList.add('is-hidden');
  }

  function acceptProposal() {
    if (state.adjust) {
      if (!validateAdjust()) return;
      var start = String(state.adjust.start || '').trim();
      var minutes = state.adjust.minutes;
      state.acceptedBlock = { start: start, minutes: minutes };
      try {
        window.localStorage.setItem('retoma-block-' + (isLiveMode() ? 'live' : 'demo'),
          JSON.stringify(state.acceptedBlock));
      } catch (e) { /* session only */ }
      var end = fmtClock(Ai.parseClock(start) + minutes);
      var textEl = document.getElementById('proposalText');
      if (textEl) {
        textEl.textContent = 'Tomorrow: ' + minutes + ' min for the report, ' + start +
          ' to ' + end + ', before the messages arrive.';
      }
      if (state.currentProposal) {
        state.currentProposal.start = start;
        state.currentProposal.minutes = minutes;
      }
      var howEl = document.getElementById('proposalHow');
      if (howEl) {
        var baseHow = String(howEl.textContent || '')
          .replace(/\s*\u00b7\s*adjusted to \d{1,2}:\d{2}\u2013\d{1,2}:\d{2}$/, '');
        howEl.textContent = baseHow + ' \u00b7 adjusted to ' + start + '\u2013' + end;
      }
      endAdjust();
      setAccepted(true);
      return;
    }
    var cp = state.currentProposal;
    if (!cp) { dismissProposal(); return; }
    state.acceptedBlock = { start: cp.start, minutes: cp.minutes };
    try {
      window.localStorage.setItem('retoma-block-' + (isLiveMode() ? 'live' : 'demo'),
        JSON.stringify(state.acceptedBlock));
    } catch (e) { /* session only */ }
    setAccepted(true);
  }

  function deleteAll() {
    /* Live deletes ONLY the live store and says so; Demo deletes only demo. */
    if (isLiveMode()) {
      state.liveTimeline = [];
      state.liveEmpty = true;
      state.aiToken++;
      state.away = false;
      state.awayMinutes = 0;
      clearNote();
      hideResume();
      resetBrowse();
      updateBrowseControls();
      renderTimeline();
      dismissProposal();
      if (window.Live && Live.renderLiveToday) Live.renderLiveToday();
      if (window.Live && Live.renderLiveNow) Live.renderLiveNow();
      Persist.removeAll('live');
      try { window.localStorage.removeItem('retoma-exp-live'); } catch (e) { /* noop */ }
      return;
    }
    state.timeline = [];
    state.empty = true;
    state.aiToken++;
    state.away = false;
    state.awayMinutes = 0;
    clearNote();
    hideResume();
    resetBrowse();
    updateBrowseControls();
    renderTimeline();
    dismissProposal();
    Persist.removeAll('demo');
    try { window.localStorage.removeItem('retoma-exp-demo'); } catch (e) { /* noop */ }
  }

  function hasTimelineEntries() {
    if (isLiveMode()) return !state.liveEmpty && state.liveTimeline.length > 0;
    return !state.empty && state.timeline.length > 0;
  }

  /* The Retoma column is the app itself (always on screen). openPanel /
   * closePanel stay in the API for the story and tests; closing is a no-op. */
  function isPanelOpen() { return !!el.retomaPanel; }

  function syncDesktopLayout() {
    var ws = document.getElementById('desktopWorkspace');
    if (!ws) return;
    requestAnimationFrame(function () {
      var r = ws.getBoundingClientRect();
      if (r.width < 200) return;
      var inset = 24, gap = 16, top = 56;
      var colW = Math.floor((r.width - inset * 2 - gap) / 2);
      colW = Math.max(160, Math.min(colW, 360));
      var rowH = Math.floor((r.height - top - inset - gap) / 2);
      var map = { 'win-doc': 0, 'win-browser': 1, 'win-whatsapp': 2, 'win-sheet': 3 };
      Object.keys(map).forEach(function (id) {
        var e = document.getElementById(id);
        if (!e) return;
        var ix = map[id];
        e.style.left = (inset + (ix % 2) * (colW + gap)) + 'px';
        e.style.top = (top + Math.floor(ix / 2) * (Math.max(rowH, 180) + gap)) + 'px';
        e.style.width = colW + 'px';
      });
      /* Both windows in a row share one height, whatever the language makes
       * the text do: measure the natural height of the pair, then let the
       * shorter one stretch (min-height) to match the taller. */
      var stacked = window.matchMedia && window.matchMedia('(max-width: 900px)').matches;
      [['win-doc', 'win-browser'], ['win-whatsapp', 'win-sheet']].forEach(function (ids) {
        var wins = ids.map(function (id) { return document.getElementById(id); }).filter(Boolean);
        wins.forEach(function (w) { w.style.minHeight = ''; });
        if (stacked || wins.length < 2) return;
        var tallest = 0;
        wins.forEach(function (w) {
          var b = w.getBoundingClientRect();
          if (b.height > tallest) tallest = b.height;
        });
        if (!tallest) return;
        var h = Math.ceil(tallest) + 'px';
        wins.forEach(function (w) { w.style.minHeight = h; });
      });
    });
  }

  function openPanel() {
    if (!el.retomaPanel) return;
    el.retomaPanel.classList.add('is-open');
    syncDesktopLayout();
  }
  function closePanel() {
    syncDesktopLayout();
  }
  function togglePanel() {
    if (isPanelOpen()) closePanel(); else openPanel();
  }

  function switchTab(name) {
    if (!['ahora','hoy','priv'].includes(name)) return;
    activeTab = name;
    document.querySelectorAll('.retoma-tabs__btn').forEach(function (b) {
      var is = b.getAttribute('data-tab') === name;
      b.classList.toggle('is-active', is);
      b.setAttribute('aria-selected', is ? 'true' : 'false');
    });
    document.querySelectorAll('.retoma-tab').forEach(function (p) {
      var idMap = { ahora: 'retomaTabAhora', hoy: 'retomaTabHoy', priv: 'retomaTabPriv' };
      var target = idMap[name];
      if (p.id === target) p.classList.add('is-active'); else p.classList.remove('is-active');
    });
    if (name === 'ahora') growLeaveNote();
    // keep the sliding tab ink under the active tab on every path
    // (button clicks and internal calls, not only the wrapped global).
    if (window.Visual && window.Visual.placeInk) {
      requestAnimationFrame(function () { window.Visual.placeInk(); });
    }
  }

  function startTick() {
    if (tickTimer) clearInterval(tickTimer);
    tickTimer = setInterval(function () {
      if (state.paused || state.away) return;
      state.timeInCurrent += 1;
      if (state.timeInCurrent % 2 === 0) {
        advanceClock(1);
      }
      renderAhora();
    }, 1000);
  }

  function buildBrowseRow() {
    var hero = document.querySelector('#retomaTabAhora .now-hero');
    if (!hero || document.getElementById('nowPrev')) return;
    var row = document.createElement('div');
    row.className = 'now-history';
    var prev = document.createElement('button');
    prev.type = 'button';
    prev.id = 'nowPrev';
    prev.className = 'now-history__btn';
    prev.setAttribute('aria-label', 'Earlier');
    prev.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M15 6l-6 6 6 6"></path></svg>';
    var when = document.createElement('span');
    when.id = 'nowWhen';
    when.className = 'now-history__when';
    var next = document.createElement('button');
    next.type = 'button';
    next.id = 'nowNext';
    next.className = 'now-history__btn';
    next.setAttribute('aria-label', 'Later');
    next.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M9 6l6 6-6 6"></path></svg>';
    row.appendChild(prev);
    row.appendChild(when);
    row.appendChild(next);
    hero.appendChild(row);
    prev.addEventListener('click', goEarlier);
    next.addEventListener('click', goLater);
  }

  function mount() {
    buildBrowseRow();
    el.deskClock = document.getElementById('deskClock');
    el.menuBar = document.getElementById('menuBar');
    el.nowApp = document.getElementById('nowApp');
    el.nowTitle = document.getElementById('nowTitle');
    el.nowNote = document.getElementById('nowNote');
    el.nowDesc = document.getElementById('nowDesc');
    el.nowTime = document.getElementById('nowTime');
    el.nowClock = document.getElementById('nowClock');
    el.nowPrev = document.getElementById('nowPrev');
    el.nowNext = document.getElementById('nowNext');
    el.nowWhen = document.getElementById('nowWhen');
    el.toggleBtn = document.getElementById('retomaToggle');
    el.retomaPanel = document.getElementById('retomaPanel');
    el.resumeCard = document.getElementById('resumeCard');
    el.resumeHero = document.getElementById('resumeHero');
    el.resumeSub = document.getElementById('resumeSub');
    el.resumeInter = document.getElementById('resumeInter');
    el.resumeChips = document.getElementById('resumeChips');
    el.retomarBtn = document.getElementById('retomarBtn');
    el.startFreshBtn = document.getElementById('startFreshBtn');
    el.leaveNote = document.getElementById('leaveNote');
    el.resumeNote = document.getElementById('resumeNote');
    el.resumeAi = document.getElementById('resumeAi');
    el.timeline = document.getElementById('timeline');
    el.timelineBar = document.getElementById('timelineBar');
    el.timelineLegend = document.getElementById('timelineLegend');
    el.timelineText = document.getElementById('timelineText');
    el.proposalCard = document.getElementById('proposalCard');
    el.proposalAccept = document.getElementById('proposalAccept');
    el.proposalDecline = document.getElementById('proposalDecline');
    el.proposalAdjust = document.getElementById('proposalAdjust');
    el.proposalAdjuster = document.getElementById('proposalAdjuster');
    el.adjustStart = document.getElementById('adjustStart');
    el.adjustMinutes = document.getElementById('adjustMinutes');
    el.adjustMinus = document.getElementById('adjustMinus');
    el.adjustPlus = document.getElementById('adjustPlus');
    el.adjustError = document.getElementById('adjustError');
    el.emptyState = document.getElementById('emptyState');
    el.confirmOverlay = document.getElementById('confirmOverlay');
    el.confirmYes = document.getElementById('confirmYes');
    el.confirmNo = document.getElementById('confirmNo');
    el.deleteBtn = document.getElementById('btnDelete');
    el.simPause = document.getElementById('btnPause');

    if (el.toggleBtn) {
      el.toggleBtn.addEventListener('click', function (ev) {
        ev.stopPropagation();
        togglePause();
      });
    }
    if (el.retomarBtn) el.retomarBtn.addEventListener('click', doRetomar);
    if (el.startFreshBtn) el.startFreshBtn.addEventListener('click', doStartFresh);
    if (el.leaveNote) {
      el.leaveNoteSaved = document.getElementById('leaveNoteSaved');
      try { el.leaveNote.value = loadNote(); } catch (e) { /* noop */ }
      growLeaveNote();
      el.leaveNote.addEventListener('input', function () {
        var n = el.leaveNote;
        var clean = cleanNoteText(n.value);
        if (clean !== n.value) n.value = clean;
        stashNoteSaved();
        growLeaveNote();
        scheduleNoteSave();
      });
      el.leaveNote.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter') {
          ev.preventDefault();
          if (noteSavedTimer) { clearTimeout(noteSavedTimer); noteSavedTimer = null; }
          var n = el.leaveNote;
          var clean = cleanNoteText(n.value);
          if (clean !== n.value) n.value = clean;
          saveNote(n.value);
          growLeaveNote();
          showNoteSaved(true);
          n.blur();
          return;
        }
        stashNoteSaved();
      });
      el.leaveNote.addEventListener('blur', function () { saveNote(el.leaveNote.value); });
    }
    if (el.proposalAccept) el.proposalAccept.addEventListener('click', acceptProposal);
    if (el.proposalDecline) el.proposalDecline.addEventListener('click', dismissProposal);
    if (el.proposalAdjust) el.proposalAdjust.addEventListener('click', function () {
      if (state.adjust) endAdjust(); else startAdjust();
    });
    if (el.adjustStart) el.adjustStart.addEventListener('input', readAdjustStart);
    if (el.adjustMinus) el.adjustMinus.addEventListener('click', function () { bumpAdjust(-15); });
    if (el.adjustPlus) el.adjustPlus.addEventListener('click', function () { bumpAdjust(15); });
    Array.prototype.forEach.call(document.querySelectorAll('#quotaOllamaHoy, #quotaOllamaPriv'), function (b) {
      b.addEventListener('click', connectOllama);
    });
    var ollamaTest = document.getElementById('ollamaTest');
    if (ollamaTest) ollamaTest.addEventListener('click', testOllama);

    // tabs
    document.querySelectorAll('.retoma-tabs__btn').forEach(function (b) {
      b.addEventListener('click', function () { switchTab(b.getAttribute('data-tab')); });
    });

    // Esc closes the confirm dialog (the Retoma column never closes)
    document.addEventListener('keydown', function (ev) {
      if (ev.key !== 'Escape') return;
      if (el.confirmOverlay && el.confirmOverlay.classList.contains('is-open')) closeConfirm();
    });

    // privacy delete confirm
    if (el.deleteBtn) el.deleteBtn.addEventListener('click', function () { openConfirm(); });
    var privDelete = document.getElementById('privacyDelete');
    if (privDelete) privDelete.addEventListener('click', function () { openConfirm(); });
    if (el.confirmNo) el.confirmNo.addEventListener('click', function () { closeConfirm(); });
    if (el.confirmYes) el.confirmYes.addEventListener('click', function () { closeConfirm(); deleteAll(); });
    if (el.confirmOverlay) el.confirmOverlay.addEventListener('click', function (ev) { if (ev.target === el.confirmOverlay) closeConfirm(); });
    if (el.confirmOverlay) {
      el.confirmOverlay.setAttribute('aria-hidden', 'true');
      el.confirmOverlay.addEventListener('keydown', function (ev) {
        if (ev.key === 'Escape') { ev.stopPropagation(); closeConfirm(); return; }
        if (ev.key !== 'Tab') return;
        var f = Array.from(el.confirmOverlay.querySelectorAll('button')).filter(function (b) { return !b.disabled; });
        if (!f.length) return;
        var first = f[0], last = f[f.length - 1];
        if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); }
        else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
      });
    }

    setClock(9, 0);
    state.timeline = Events.seedTimeline.slice();
    loadAiPrefs();
    paintAiMode();
    refreshCapabilities();
    document.querySelectorAll('[data-ai-mode]').forEach(function (b) {
      b.addEventListener('click', function () { selectAiMode(b.getAttribute('data-ai-mode')); });
    });
    var aiAllow = document.getElementById('aiAllow');
    if (aiAllow) aiAllow.addEventListener('click', function () {
      if (state.pendingMode) grantAiConsentMode(state.pendingMode);
    });
    var aiCancel = document.getElementById('aiCancel');
    if (aiCancel) aiCancel.addEventListener('click', function () { state.pendingMode = null; hideConsent(); paintAiMode(); });
    var aiSuggestBtn = document.getElementById('aiSuggestBtn');
    if (aiSuggestBtn) aiSuggestBtn.addEventListener('click', aiSuggestClick);
    var aiSuggestSend = document.getElementById('aiSuggestSend');
    if (aiSuggestSend) aiSuggestSend.addEventListener('click', sendSuggestedAi);
    var aiSuggestCancel = document.getElementById('aiSuggestCancel');
    if (aiSuggestCancel) aiSuggestCancel.addEventListener('click', hideSuggestConsent);
    syncSuggestButton();
    paintSuggestCopy();
    try {
      if (window.MutationObserver) {
        new MutationObserver(paintSuggestCopy).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
      }
    } catch (e) { /* label keeps its language */ }
    var privExport = document.getElementById('privacyExport');
    if (privExport) privExport.addEventListener('click', function () { Persist.exportData(state.timeline); });
    if (window.retoma && window.retoma.onFocusResume) {
      try {
        window.retoma.onFocusResume(function () {
          openPanel();
          switchTab('ahora');
          showResume();
          var resumeBtn = document.getElementById('retomarBtn');
          if (resumeBtn) resumeBtn.focus();
        });
      } catch (e) { /* demo keeps going */ }
    }
    if (window.retoma && window.retoma.onNoteFocus) {
      try {
        window.retoma.onNoteFocus(function () {
          openPanel();
          switchTab('ahora');
          if (el.leaveNote) el.leaveNote.focus();
        });
      } catch (e) { /* demo keeps going */ }
    }
    Persist.load('demo').then(function (events) {
      if (events && events.length) {
        state.timeline = events.slice(-12).map(function (e) { return { app: e.app, duration: e.duration }; });
        state.empty = false;
        if (!isLiveMode()) renderTimeline();
        persistTimeline();
      }
    });
    Persist.load('live').then(function (events) {
      var list = (events || []).map(function (e) { return { app: e.app, duration: e.duration }; });
      if (list.length) {
        state.liveTimeline = list.slice(-12);
        state.liveEmpty = false;
        if (isLiveMode()) { renderTimeline(); renderAhora(); }
      }
    });
    setInterval(function () {
      var m = isLiveMode() ? 'live' : 'demo';
      Persist.load(m).then(function (events) { Persist.save(events || [], m); });
    }, 3600 * 1000);
    renderAhora();
    renderTimeline();
    hideResume();
    switchTab('ahora');
    closePanel();
    startTick();
    window.addEventListener('resize', syncDesktopLayout);
    /* i18n swaps the window text in place; re-balance the row heights after it. */
    if (window.MutationObserver && document.getElementById('desktopWorkspace')) {
      new MutationObserver(function () { syncDesktopLayout(); })
        .observe(document.getElementById('desktopWorkspace'), { childList: true, subtree: true, characterData: true });
    }

    // expose for tests/story
    window.Retoma = { state: state, switchApp: switchApp, rotateApp: rotateApp, receiveWhatsapp: receiveWhatsapp, goAway: goAway, comeBack: comeBack, showResume: showResume, hideResume: hideResume, doRetomar: doRetomar, togglePause: togglePause, isPaused: isPaused, showEndOfDay: showEndOfDay, dismissProposal: dismissProposal, acceptProposal: acceptProposal, deleteAll: deleteAll, hasTimelineEntries: hasTimelineEntries, openPanel: openPanel, closePanel: closePanel, togglePanel: togglePanel, setClock: setClock, advanceClock: advanceClock, switchTab: switchTab, isPanelOpen: isPanelOpen, syncDesktopLayout: syncDesktopLayout, renderTimeline: renderTimeline, renderAhora: renderAhora, selectAiMode: selectAiMode, hasBridge: hasBridge, reloadForMode: reloadForMode, isLiveMode: isLiveMode, setQuota: setQuota, refreshQuota: refreshQuota, connectOllama: connectOllama };
  }

  function openConfirm() {
    if (!el.confirmOverlay) return;
    var confirmText = document.getElementById('confirmText');
    if (confirmText) {
      confirmText.textContent = isLiveMode()
        ? 'Only the Live history on this PC will be deleted. Demo history is kept. This cannot be undone.'
        : 'Today\'s history and cards will be deleted. This cannot be undone.';
    }
    el.lastFocus = document.activeElement;
    el.confirmOverlay.classList.add('is-open');
    el.confirmOverlay.setAttribute('aria-hidden', 'false');
    setTimeout(function () { if (el.confirmYes) el.confirmYes.focus(); }, 60);
  }
  function closeConfirm() {
    if (!el.confirmOverlay) return;
    el.confirmOverlay.classList.remove('is-open');
    el.confirmOverlay.setAttribute('aria-hidden', 'true');
    var back = el.lastFocus && document.contains(el.lastFocus) ? el.lastFocus : el.deleteBtn;
    if (back && typeof back.focus === 'function') back.focus();
    el.lastFocus = null;
  }

  return { mount: mount, state: state, switchApp: switchApp, rotateApp: rotateApp, receiveWhatsapp: receiveWhatsapp, goAway: goAway, comeBack: comeBack, showResume: showResume, hideResume: hideResume, doRetomar: doRetomar, togglePause: togglePause, isPaused: isPaused, showEndOfDay: showEndOfDay, deleteAll: deleteAll, hasTimelineEntries: hasTimelineEntries, openPanel: openPanel, closePanel: closePanel, setClock: setClock, reloadForMode: reloadForMode, isLiveMode: isLiveMode, renderTimeline: renderTimeline, renderAhora: renderAhora, setQuota: setQuota, refreshQuota: refreshQuota, connectOllama: connectOllama };
})();
