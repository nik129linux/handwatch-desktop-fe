/* guide.js — the three-level guide and the Help reference.
 * Level 1: first-run welcome, three cards, modal, replayable from Settings.
 * Level 2: one small coach mark the first time each key feature is reached.
 * Level 3: the Help screen inside Settings (features, icons, status, glossary).
 * Works in Demo and Live; never depends on a demo-only mode. */
var Guide = (function () {
  'use strict';

  var SEEN_KEY = 'retoma-guide-v1';
  var TIPS_KEY = 'retoma-tips-v1';
  var el = {};
  var idx = 0;
  var open = false;
  var lastFocus = null;
  var tipOpen = null;
  var tipKey = null;
  var tipQueue = [];
  var tipsSuppressed = false;
  var fromInvoker = false;
  var listeners = [];

  function isEs() {
    try { return !!(window.I18n && I18n.getLang && I18n.getLang() === 'es'); } catch (e) { return false; }
  }
  /* L(english, spanish): the copy in the active language. */
  function L(en, es) { return isEs() ? es : en; }

  var CARDS = [
    {
      title: ['Welcome to Retoma', 'Te damos la bienvenida a Retoma'],
      body: [
        'Retoma is a quiet companion for the desktop. When you come back after an interruption, it reminds you where you were so you do not have to rebuild the thread.',
        'Retoma es un compañero discreto para el escritorio. Cuando vuelves después de una interrupción, te recuerda dónde estabas para que no tengas que reconstruir el hilo.'
      ]
    },
    {
      title: ['One card, one step back', 'Una tarjeta, un paso de vuelta'],
      body: [
        'The resume card keeps the task, the paragraph and the note you left yourself. Press Resume and you are back. The next-step note is always one line away.',
        'La tarjeta de retoma guarda la tarea, el párrafo y la nota que te dejaste. Presiona Retomar y vuelves. La nota del siguiente paso siempre está a una línea de distancia.'
      ]
    },
    {
      title: ['Private by default', 'Privada por defecto'],
      body: [
        'Retoma sees app names and window titles, never what you type, never your screen. Everything stays on this device, except what you send to the AI with your permission, and is deleted after 7 days. AI is off until you allow it.',
        'Retoma ve nombres de apps y títulos de ventana, nunca lo que escribes ni tu pantalla. Todo queda en este dispositivo, salvo lo que envías a la IA con tu permiso, y se borra a los 7 días. La IA está apagada hasta que la permitas.'
      ]
    }
  ];

  /* Level 2: one tip per key feature, shown the first time it is reached. */
  var TIPS = {
    note: {
      text: [
        'Leave the next step here. You will see it again on the resume card.',
        'Deja aquí el siguiente paso. Lo verás otra vez en la tarjeta de retoma.'
      ],
      target: '#leaveNote'
    },
    today: {
      text: [
        'One suggestion for tomorrow, with how it was decided. You decide.',
        'Una sugerencia para mañana, con cómo se decidió. Tú decides.'
      ],
      target: '#proposalCard'
    },
    privacy: {
      text: [
        'Here you see what Retoma keeps, and delete everything in one gesture.',
        'Aquí ves lo que Retoma guarda, y lo borras todo con un gesto.'
      ],
      target: '#privacyDelete'
    },
    settings: {
      text: [
        'Language, theme, AI permission, privacy and this guide live here.',
        'Aquí están el idioma, el tema, el permiso de IA, la privacidad y esta guía.'
      ],
      target: '#tabBtnConfig'
    }
  };

  function readSeen() {
    try { return window.localStorage.getItem(SEEN_KEY) === '1'; } catch (e) { return false; }
  }
  function markSeen() {
    try { window.localStorage.setItem(SEEN_KEY, '1'); } catch (e) { /* session only */ }
  }
  function readTips() {
    try { return JSON.parse(window.localStorage.getItem(TIPS_KEY) || '{}') || {}; } catch (e) { return {}; }
  }
  function markTip(key) {
    try {
      var all = readTips();
      all[key] = 1;
      window.localStorage.setItem(TIPS_KEY, JSON.stringify(all));
    } catch (e) { /* session only */ }
  }

  /* --- level 1 ------------------------------------------------------- */

  function paintDots() {
    if (!el.dots) return;
    el.dots.innerHTML = '';
    for (var i = 0; i < CARDS.length; i++) {
      var d = document.createElement('span');
      d.className = 'guide-dot' + (i === idx ? ' is-active' : '');
      el.dots.appendChild(d);
    }
  }

  function paintCard() {
    var card = CARDS[idx];
    if (!card) return;
    var title = isEs() ? card.title[1] : card.title[0];
    var body = isEs() ? card.body[1] : card.body[0];
    if (el.title) el.title.textContent = title;
    if (el.body) el.body.textContent = body;
    if (el.count) {
      var total = I18n && I18n.formatNumber ? I18n.formatNumber(CARDS.length) : String(CARDS.length);
      var cur = I18n && I18n.formatNumber ? I18n.formatNumber(idx + 1) : String(idx + 1);
      el.count.textContent = L('Step ' + cur + ' of ' + total, 'Paso ' + cur + ' de ' + total);
    }
    if (el.back) {
      el.back.textContent = L('Back', 'Atrás');
      el.back.disabled = idx === 0;
    }
    if (el.next) el.next.textContent = idx === CARDS.length - 1 ? L('Finish', 'Terminar') : L('Next', 'Siguiente');
    if (el.skip) el.skip.textContent = L('Skip', 'Saltar');
    paintDots();
  }

  function focusables() {
    if (!el.overlay) return [];
    return Array.prototype.filter.call(
      el.overlay.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'),
      function (n) { return !n.disabled && n.offsetParent !== null; }
    );
  }

  function openLevel1(invoker) {
    if (!el.overlay) return;
    fromInvoker = !!invoker;
    lastFocus = invoker || document.activeElement;
    open = true;
    idx = 0;
    hideTip();
    paintCard();
    el.overlay.classList.remove('is-hidden');
    el.overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('guide-open');
    setTimeout(function () { if (el.next) el.next.focus(); }, 30);
  }

  function closeLevel1(opts) {
    if (!el.overlay) return;
    open = false;
    el.overlay.classList.add('is-hidden');
    el.overlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('guide-open');
    var back = lastFocus && document.contains(lastFocus) ? lastFocus : null;
    if (back && typeof back.focus === 'function') { try { back.focus(); } catch (e) { /* noop */ } }
    lastFocus = null;
    if (opts && opts.seen) markSeen();
    if (opts && opts.after) opts.after();
  }

  function next() {
    if (!open) return;
    if (idx >= CARDS.length - 1) {
      closeLevel1({ seen: true, after: afterWelcome });
      return;
    }
    idx += 1;
    paintCard();
    if (el.next) el.next.focus();
  }

  function back() {
    if (!open || idx <= 0) return;
    idx -= 1;
    paintCard();
    if (el.back) el.back.focus();
  }

  function skip() { closeLevel1({ seen: true, after: afterWelcome }); }

  function afterWelcome() {
    try { window.dispatchEvent(new CustomEvent('retoma:guide-done')); } catch (e) { /* noop */ }
    if (fromInvoker) {
      /* Replayed from Settings: stay where the person was, so focus can go
       * back to the button that opened the guide. */
      fromInvoker = false;
      var active = document.querySelector('.retoma-tabs__btn.is-active');
      var tab = active ? active.getAttribute('data-tab') : 'ahora';
      enqueue(tab === 'ahora' ? 'note' : tab === 'hoy' ? 'today' : tab === 'priv' ? 'privacy' : 'settings');
      pump();
      return;
    }
    if (window.Retoma && Retoma.switchTab) {
      try { Retoma.switchTab('ahora'); } catch (e) { /* noop */ }
    }
    if (!tipQueue.length && !readTips().note) enqueue('note');
    pump();
  }

  function replay(invoker) {
    openLevel1(invoker || (el.replay || null));
  }

  /* --- level 2: coach marks ------------------------------------------ */

  function isTargetVisible(target) {
    if (!target || !document.contains(target)) return false;
    if (target.closest && target.closest('.is-hidden, [hidden], [inert]')) return false;
    var tab = target.closest && target.closest('.retoma-tab');
    if (tab && !tab.classList.contains('is-active')) return false;
    var cs = window.getComputedStyle ? window.getComputedStyle(target) : null;
    if (cs && (cs.display === 'none' || cs.visibility === 'hidden')) return false;
    var r = target.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  function resumeCardBusy() {
    var card = document.getElementById('resumeCard');
    if (!card) return false;
    if (card.classList.contains('is-hidden')) return false;
    return card.classList.contains('is-visible') || card.getBoundingClientRect().height > 0;
  }

  function visibleButtons() {
    var out = [];
    var nodes = document.querySelectorAll('button, [role="button"], input[type="button"], input[type="submit"], a[href]');
    Array.prototype.forEach.call(nodes, function (b) {
      if (el.tip && el.tip.contains(b)) return;
      if (b.disabled) return;
      if (b.closest && b.closest('.is-hidden, [hidden], [inert]')) return;
      var cs = window.getComputedStyle ? window.getComputedStyle(b) : null;
      if (cs && (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0')) return;
      var r = b.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return;
      if (r.right <= 0 || r.bottom <= 0 || r.left >= window.innerWidth || r.top >= window.innerHeight) return;
      out.push({ left: r.left, right: r.right, top: r.top, bottom: r.bottom });
    });
    return out;
  }

  function overlaps(a, b) {
    return !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
  }

  function clamp(v, lo, hi) { return Math.min(Math.max(v, lo), Math.max(lo, hi)); }

  function placeTip(target) {
    if (!el.tip || !target) return;
    var old = document.querySelector('.coach-spot');
    if (old) old.remove();
    var r = target.getBoundingClientRect();
    var m = 16;
    var w = Math.min(320, Math.max(240, window.innerWidth - 32));
    el.tip.style.width = w + 'px';
    var h = el.tip.offsetHeight || 140;
    var buttons = visibleButtons();
    /* Never cover the anchor itself either: a tip goes beside or below it. */
    buttons.push({ left: r.left, right: r.right, top: r.top, bottom: r.bottom });
    var maxX = Math.max(m, window.innerWidth - w - m);
    var maxY = Math.max(m, window.innerHeight - h - m);
    var cx = r.left + r.width / 2;
    var cy = r.top + r.height / 2;
    var tries = [
      { left: r.right + 14, top: cy - h / 2 },          /* right */
      { left: r.left - w - 14, top: cy - h / 2 },       /* left */
      { left: cx - w / 2, top: r.bottom + 14 },         /* below */
      { left: cx - w / 2, top: r.top - h - 14 },        /* above */
      { left: r.right - w, top: r.bottom + 14 },        /* below, right-aligned */
      { left: r.left, top: r.bottom + 14 },             /* below, left-aligned */
      { left: r.right - w, top: r.top - h - 14 },       /* above, right-aligned */
      { left: r.left, top: r.top - h - 14 }             /* above, left-aligned */
    ];

    function valid(x, y) {
      x = clamp(x, m, maxX);
      y = clamp(y, m, maxY);
      var box = { left: x, right: x + w, top: y, bottom: y + h };
      for (var i = 0; i < buttons.length; i++) if (overlaps(box, buttons[i])) return null;
      return { left: x, top: y };
    }

    var found = null;
    for (var i = 0; i < tries.length && !found; i++) found = valid(tries[i].left, tries[i].top);
    if (!found) {
      /* Last resort: scan the viewport and take the free spot closest to the
       * anchor. A collision-free tip is mandatory; proximity is secondary. */
      var best = null;
      var bestD = Infinity;
      for (var y = m; y <= maxY; y += 16) {
        for (var x = m; x <= maxX; x += 16) {
          var spot = valid(x, y);
          if (!spot) continue;
          var d = Math.pow(spot.left + w / 2 - cx, 2) + Math.pow(spot.top + h / 2 - cy, 2);
          if (d < bestD) { bestD = d; best = spot; }
        }
      }
      found = best;
    }
    if (!found) found = { left: clamp(cx - w / 2, m, maxX), top: clamp(r.bottom + 14, m, maxY) };
    el.tip.style.left = Math.round(found.left) + 'px';
    el.tip.style.top = Math.round(found.top) + 'px';

    var spotEl = document.createElement('span');
    spotEl.className = 'coach-spot';
    spotEl.setAttribute('aria-hidden', 'true');
    spotEl.style.left = Math.round(cx) + 'px';
    spotEl.style.top = Math.round(r.top + Math.min(r.height, 40) / 2) + 'px';
    document.body.appendChild(spotEl);
  }

  function hideTip() {
    if (el.tip) el.tip.classList.add('is-hidden');
    tipOpen = null;
    tipKey = null;
    var spot = document.querySelector('.coach-spot');
    if (spot) spot.remove();
  }

  function enqueue(key) {
    if (!TIPS[key] || readTips()[key]) return;
    if (key === tipOpen || key === tipKey) return;
    if (tipQueue.indexOf(key) === -1) tipQueue.push(key);
  }

  /* Only one coach mark is ever open. Dismissing it opens the next queued tip
   * that has a visible anchor. */
  function pump() {
    if (open || tipOpen || tipsSuppressed) return;
    while (tipQueue.length) {
      var key = tipQueue.shift();
      if (!TIPS[key] || readTips()[key]) continue;
      var target = document.querySelector(TIPS[key].target);
      if (!target || !isTargetVisible(target)) continue;
      showTipNow(key, target);
      return;
    }
  }

  function showTipNow(key, target) {
    var tip = TIPS[key];
    if (!tip || !el.tip) return;
    tipOpen = key;
    tipKey = key;
    if (el.tipText) el.tipText.textContent = isEs() ? tip.text[1] : tip.text[0];
    if (el.tipClose) el.tipClose.textContent = L('Got it', 'Entendido');
    el.tip.classList.remove('is-hidden');
    markTip(key);
    try { target.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (e) { /* noop */ }
    placeTip(target);
    setTimeout(function () {
      if (el.tipClose) { try { el.tipClose.focus(); } catch (e) { /* noop */ } }
    }, 30);
  }

  function showTip(key) {
    if (!TIPS[key] || !el.tip) return;
    if (readTips()[key]) return;
    if (open || tipOpen || tipsSuppressed) { enqueue(key); return; }
    var target = document.querySelector(TIPS[key].target);
    if (!target || !isTargetVisible(target)) return;
    showTipNow(key, target);
  }

  function dismissTip() {
    if (!tipOpen) return;
    markTip(tipOpen);
    var back = null;
    try { back = document.getElementById(tipKey === 'settings' ? 'tabBtnConfig' : (tipKey === 'privacy' ? 'tabBtnPriv' : 'leaveNote')); } catch (e) { back = null; }
    hideTip();
    if (back && typeof back.focus === 'function' && back.offsetParent !== null) { try { back.focus(); } catch (e) { /* noop */ } }
    pump();
  }

  /* The resume card owns the screen while it first appears. Step aside until
   * the person has acted once (Resume, Start fresh or editing the note). */
  function suspendForResume() {
    tipsSuppressed = true;
    if (tipOpen) { markTip(tipOpen); hideTip(); }
    var spot = document.querySelector('.coach-spot');
    if (spot) spot.remove();
  }

  function resumeActed() {
    tipsSuppressed = false;
    pump();
  }

  /* A tab change closes the open tip (and counts it as seen) before the new
   * tab can ask for its own. */
  function tabChanged() {
    if (tipOpen) { markTip(tipOpen); hideTip(); }
  }

  function refreshTip() {
    if (!tipOpen) return;
    var tip = TIPS[tipOpen];
    var target = tip ? document.querySelector(tip.target) : null;
    if (!target || !isTargetVisible(target)) {
      if (resumeCardBusy()) { hideTip(); return; }
      markTip(tipKey);
      hideTip();
      pump();
      return;
    }
    placeTip(target);
  }

  /* Called by the app the first time a feature is reached. */
  function visit(feature) {
    if (!TIPS[feature]) return;
    if (readTips()[feature]) return;
    if (open || tipOpen || tipsSuppressed) { enqueue(feature); return; }
    /* The 7-step demo tour brings its own captions: never stack a tip on it. */
    if (document.querySelector('#tourCard.is-open')) return;
    showTip(feature);
  }

  /* --- level 3: Help -------------------------------------------------- */

  function helpModel() {
    return [
      {
        title: ['What Retoma does', 'Qué hace Retoma'],
        items: [
          ['Now', 'Ahora', 'The app you are using, the window title and the minutes in this task. The ring fills every 25 minutes of focus.', 'La app que estás usando, el título de la ventana y los minutos en esta tarea. El círculo se completa cada 25 minutos de enfoque.'],
          ['Next-step note', 'Nota del siguiente paso', 'One line for your future self. It travels with the resume card.', 'Una línea para tu yo del futuro. Viaja con la tarjeta de retoma.'],
          ['Earlier / Later', 'Antes / Después', 'Walks back through the recent blocks without changing the current task.', 'Recorre los bloques recientes sin cambiar la tarea actual.'],
          ['Today', 'Hoy', 'A timeline of apps and minutes, plus one suggestion for tomorrow and how it was decided.', 'Una línea de tiempo de apps y minutos, más una sugerencia para mañana y cómo se decidió.'],
          ['Resume card', 'Tarjeta de retoma', 'Appears when you return after ten minutes or more away: the task, the note, and the windows you had open.', 'Aparece cuando vuelves tras diez minutos o más de ausencia: la tarea, la nota y las ventanas que tenías abiertas.'],
          ['Suggest with AI', 'Sugerir con IA', 'Asks the Retoma server for one suggestion. It shows the model that answered and the response time.', 'Pide al servidor Retoma una sugerencia. Muestra el modelo que respondió y el tiempo de respuesta.'],
          ['Habit coach', 'Coach de hábitos', 'A small experiment drawn from your week. Accept it and tomorrow it measures itself.', 'Un experimento pequeño sacado de tu semana. Acéptalo y mañana se mide solo.'],
          ['Ask your day', 'Pregunta a tu día', 'Ask about your longest block, your most used app or your switches. Answers come from aggregate minutes only.', 'Pregunta por tu bloque más largo, tu app más usada o tus cambios. Las respuestas salen solo de minutos agregados.'],
          ['Privacy', 'Privacidad', 'What Retoma sees and never sees, and the one-button delete.', 'Lo que Retoma ve y nunca ve, y el borrado con un botón.'],
          ['Live tracking', 'Seguimiento en vivo', 'Follows this computer instead of the demo. It can keep app names only, or titles too.', 'Sigue este equipo en lugar de la demo. Puede guardar solo nombres de apps, o también títulos.'],
          ['Blocked apps', 'Apps bloqueadas', 'Apps Retoma never records, whatever else happens.', 'Apps que Retoma nunca registra, pase lo que pase.'],
          ['Export and delete', 'Exportar y borrar', 'Downloads your records as JSON, or deletes them right now. Deletion cannot be undone.', 'Descarga tus registros como JSON, o los borra ahora mismo. El borrado no se puede deshacer.'],
          ['Language', 'Idioma', 'Switches the whole app between Spanish and English without a reload.', 'Cambia toda la app entre español e inglés sin recargar.'],
          ['Theme', 'Tema', 'Claro, Oscuro or Sistema. Light is the default for a new profile.', 'Claro, Oscuro o Sistema. Claro es el predeterminado en un perfil nuevo.'],
          ['Settings', 'Configuración', 'The canonical home for language, theme, AI permission, privacy and this guide.', 'El lugar principal para el idioma, el tema, el permiso de IA, la privacidad y esta guía.'],
          ['Guide', 'Guía', 'Three levels: the welcome, the coach marks and this Help screen. Replay the welcome from Settings.', 'Tres niveles: la bienvenida, las pistas y esta pantalla de Ayuda. Repite la bienvenida desde Configuración.']
        ]
      },
      {
        title: ['Icons and status', 'Íconos y estados'],
        items: [
          ['Eye in the titlebar', 'Ojo en la barra de título', 'Open eye: Retoma is watching. Crossed eye: paused until you resume.', 'Ojo abierto: Retoma está observando. Ojo tachado: en pausa hasta que reanudes.'],
          ['Live dot', 'Punto de Live', 'Dim: waiting for the helper. Green: tracking this computer. Out: paused.', 'Tenue: esperando el ayudante. Verde: siguiendo este equipo. Apagado: en pausa.'],
          ['Sun and moon', 'Sol y luna', 'Theme shortcut: flips between light and dark. The full choice is in Settings.', 'Atajo de tema: alterna entre claro y oscuro. La elección completa está en Configuración.'],
          ['Gear', 'Engranaje', 'Opens Settings: language, theme, AI, privacy and this guide.', 'Abre Configuración: idioma, tema, IA, privacidad y esta guía.'],
          ['Status chip', 'Chip de estado', 'Waiting for helper, Tracking this PC, or Paused. It never claims to track when it cannot.', 'Esperando el ayudante, Siguiendo este equipo o En pausa. Nunca dice que sigue si no puede.'],
          ['Quota bar', 'Barra de cuota', 'How many AI requests are left today. It fills from the server answer, not from a guess.', 'Cuántas solicitudes de IA quedan hoy. Se llena con la respuesta del servidor, no con una suposición.'],
          ['Progress dots', 'Puntos de progreso', 'Which welcome card you are on, out of three.', 'En cuál tarjeta de bienvenida estás, de tres.'],
          ['Paused chip', 'Chip de pausa', 'Shows in the titlebar while Retoma is paused, so nothing is watched.', 'Aparece en la barra de título mientras Retoma está en pausa, para que nada se observe.'],
          ['Ring', 'Círculo', 'Time in the current task, in minutes. The spectrum shows the block filling up.', 'Tiempo en la tarea actual, en minutos. El espectro muestra cómo se llena el bloque.']
        ]
      },
      {
        title: ['Glossary', 'Glosario'],
        items: [
          ['Block', 'Bloque', 'A stretch of time in a single app. The longest block explains the suggestion.', 'Un tramo de tiempo en una sola app. El bloque más largo explica la sugerencia.'],
          ['Interruption', 'Interrupción', 'A short switch to messages or a browser in the middle of a task.', 'Un cambio corto a mensajes o a un navegador en mitad de una tarea.'],
          ['Away', 'Ausencia', 'Time without activity. Ten minutes or more brings the resume card.', 'Tiempo sin actividad. Diez minutos o más traen la tarjeta de retoma.'],
          ['On-device rules', 'Reglas en el dispositivo', 'The plain calculation Retoma uses when no model is available. It never pretends to be AI.', 'El cálculo simple que usa Retoma cuando no hay modelo. Nunca finge ser IA.'],
          ['Local model', 'Modelo local', 'A model running on your own computer through Ollama.', 'Un modelo que corre en tu propio equipo con Ollama.'],
          ['Retoma server', 'Servidor Retoma', 'The only place that can receive app names and minutes, and only with your permission.', 'El único lugar que puede recibir nombres de apps y minutos, y solo con tu permiso.']
        ]
      }
    ];
  }

  function renderHelp() {
    if (!el.helpBody) return;
    el.helpBody.innerHTML = '';
    var model = helpModel();
    for (var s = 0; s < model.length; s++) {
      var section = document.createElement('div');
      section.className = 'help__section';
      var h = document.createElement('h4');
      h.className = 'help__title';
      h.textContent = isEs() ? model[s].title[1] : model[s].title[0];
      section.appendChild(h);
      var dl = document.createElement('dl');
      dl.className = 'help__list';
      for (var i = 0; i < model[s].items.length; i++) {
        var it = model[s].items[i];
        var dt = document.createElement('dt');
        dt.className = 'help__term';
        dt.textContent = isEs() ? it[1] : it[0];
        var dd = document.createElement('dd');
        dd.className = 'help__desc';
        dd.textContent = isEs() ? it[3] : it[2];
        dl.appendChild(dt);
        dl.appendChild(dd);
      }
      section.appendChild(dl);
      el.helpBody.appendChild(section);
    }
    if (el.helpTitle) el.helpTitle.textContent = L('Help', 'Ayuda');
  }

  function openHelp() {
    if (window.Retoma && Retoma.switchTab) {
      try { Retoma.switchTab('config'); } catch (e) { /* noop */ }
    }
    renderHelp();
    setTimeout(function () {
      if (!el.helpPanel) return;
      try { el.helpPanel.scrollIntoView({ block: 'start' }); } catch (e) { /* noop */ }
      try { el.helpPanel.focus(); } catch (e) { /* noop */ }
    }, 30);
  }

  /* --- language + wiring ---------------------------------------------- */

  function onLangChange() {
    if (open) paintCard();
    if (tipOpen && el.tipText && TIPS[tipOpen]) el.tipText.textContent = isEs() ? TIPS[tipOpen].text[1] : TIPS[tipOpen].text[0];
    if (el.tipClose) el.tipClose.textContent = L('Got it', 'Entendido');
    renderHelp();
    paintSettingsButtons();
    for (var i = 0; i < listeners.length; i++) {
      try { listeners[i](); } catch (e) { /* noop */ }
    }
  }

  function paintSettingsButtons() {
    if (el.replay) el.replay.textContent = L('See the guide again', 'Ver la guía otra vez');
    if (el.helpOpen) el.helpOpen.textContent = L('Help', 'Ayuda');
  }

  function onKeydown(ev) {
    if (open) {
      if (ev.key === 'Escape') { ev.preventDefault(); skip(); return; }
      if (ev.key === 'Tab') {
        var f = focusables();
        if (!f.length) { ev.preventDefault(); return; }
        var first = f[0];
        var last = f[f.length - 1];
        if (ev.shiftKey && (document.activeElement === first || !el.overlay.contains(document.activeElement))) {
          ev.preventDefault(); last.focus();
        } else if (!ev.shiftKey && (document.activeElement === last || !el.overlay.contains(document.activeElement))) {
          ev.preventDefault(); first.focus();
        }
        return;
      }
      return;
    }
    if (tipOpen && ev.key === 'Escape') { ev.preventDefault(); dismissTip(); }
  }

  function mount() {
    el.overlay = document.getElementById('guideOverlay');
    el.title = document.getElementById('guideTitle');
    el.body = document.getElementById('guideBody');
    el.count = document.getElementById('guideCount');
    el.dots = document.getElementById('guideDots');
    el.next = document.getElementById('guideNext');
    el.back = document.getElementById('guideBack');
    el.skip = document.getElementById('guideSkip');
    el.tip = document.getElementById('coachTip');
    el.tipText = document.getElementById('coachTipText');
    el.tipClose = document.getElementById('coachTipClose');
    el.helpPanel = document.getElementById('helpPanel');
    el.helpTitle = document.getElementById('helpTitle');
    el.helpBody = document.getElementById('helpBody');
    el.replay = document.getElementById('guideReplay');
    el.helpOpen = document.getElementById('helpOpen');

    if (el.next) el.next.addEventListener('click', next);
    if (el.back) el.back.addEventListener('click', back);
    if (el.skip) el.skip.addEventListener('click', skip);
    if (el.tipClose) el.tipClose.addEventListener('click', dismissTip);
    if (el.replay) el.replay.addEventListener('click', function () { replay(el.replay); });
    if (el.helpOpen) el.helpOpen.addEventListener('click', openHelp);
    document.addEventListener('keydown', onKeydown);
    window.addEventListener('resize', refreshTip);
    window.addEventListener('scroll', refreshTip, true);
    setInterval(function () { if (tipOpen) refreshTip(); }, 500);
    if (window.I18n && I18n.onChange) I18n.onChange(onLangChange);
    renderHelp();
    paintSettingsButtons();
    if (!readSeen()) setTimeout(openLevel1, 80);
  }

  return {
    mount: mount,
    visit: visit,
    replay: replay,
    openHelp: openHelp,
    renderHelp: renderHelp,
    showTip: showTip,
    dismissTip: dismissTip,
    suspendForResume: suspendForResume,
    resumeActed: resumeActed,
    tabChanged: tabChanged,
    refreshTip: refreshTip,
    isOpen: function () { return open; },
    reset: function () {
      try { window.localStorage.removeItem(SEEN_KEY); window.localStorage.removeItem(TIPS_KEY); } catch (e) { /* noop */ }
    }
  };
})();
window.Guide = Guide;
