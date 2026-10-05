/* presence.js — living presence field on the wallpaper (Gravity-inspired).
   Canvas 2D soft spheres: calm drift + pointer repel while watching, scatter on
   interruption, slow dim while away, ring gather around the resume card, frozen
   and desaturated while paused. Pauses when hidden; absent under reduced motion.
   Colors read from tokens via getComputedStyle. No raw color literals in here. */
var Presence = (function () {
  'use strict';

  var canvas = null;
  var ctx = null;
  var raf = 0;
  var running = false;
  var hidden = false;
  var reduced = false;
  var W = 0;
  var H = 0;
  var DPR = 1;
  var parts = [];
  var pointer = null;
  var mode = 'watching';
  var scatterT = 0;
  var anchor = null;
  var anchorTick = 0;
  var palette = null;
  var lastApp = null;
  var seed = 1;

  function rand() {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  }

  function parseChannel(h) {
    return parseInt(h, 16);
  }

  function hexToRgb(hex) {
    var h = String(hex || '').trim().replace(/^#/, '');
    if (/^[0-9a-fA-F]{3}$/.test(h)) {
      return [parseChannel(h[0] + h[0]), parseChannel(h[1] + h[1]), parseChannel(h[2] + h[2])];
    }
    if (/^[0-9a-fA-F]{6}$/.test(h)) {
      return [parseChannel(h.slice(0, 2)), parseChannel(h.slice(2, 4)), parseChannel(h.slice(4, 6))];
    }
    return null;
  }

  /* Tokens arrive as #hex (see css/tokens.css) or rgb(). Resolve var()
   * chains one level so ink-derived tokens work in both themes. */
  function rgbComp(tokenName, fallback) {
    try {
      var raw = getComputedStyle(document.documentElement).getPropertyValue(tokenName);
      raw = (raw || '').trim();
      if (!raw) return fallback;
      if (raw.charAt(0) === '#') return hexToRgb(raw) || fallback;
      var vm = /^var\((--[^)]+)\)$/.exec(raw);
      if (vm) {
        var inner = getComputedStyle(document.documentElement).getPropertyValue(vm[1]).trim();
        if (!inner) return fallback;
        if (inner.charAt(0) === '#') return hexToRgb(inner) || fallback;
        raw = inner;
      }
      var nums = raw.split('(');
      if (nums.length < 2) return fallback;
      var parts = nums[1].split(')')[0].split(',');
      if (parts.length < 3) return fallback;
      return [parseFloat(parts[0]) || 0, parseFloat(parts[1]) || 0, parseFloat(parts[2]) || 0];
    } catch (e) { return fallback; }
  }

  function refreshPalette() {
    var lime = rgbComp('--color-primary-500', [200, 200, 200]);
    var paper = rgbComp('--text-neutral-100', [200, 200, 200]);
    var fog = rgbComp('--text-neutral-400', [150, 150, 150]);
    var deep = rgbComp('--text-neutral-600', [110, 110, 110]);
    var light = false;
    try { light = document.documentElement.getAttribute('data-theme') === 'light'; } catch (e) { light = false; }
    // Ink on paper needs more alpha than light on dark to read.
    palette = { lime: lime, paper: paper, fog: fog, deep: deep, boost: light ? 1.45 : 1 };
    // Re-tint live particles so a theme switch recolors the field at once.
    for (var k = 0; k < parts.length; k++) {
      if (parts[k].ink && palette[parts[k].ink]) parts[k].col = palette[parts[k].ink];
    }
    window.__presencePalette = palette;
  }

  function solid(c) {
    var o = String.fromCharCode(40);
    var c2 = String.fromCharCode(41);
    return 'rgb' + o + Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]) + c2;
  }

  function build() {
    parts = [];
    var n = W < 700 ? 36 : 52;
    var i;
    for (i = 0; i < n; i++) {
      var roll = rand();
      var role = 'matte';
      var ink = 'fog';
      var r = 1.6 + rand() * 3.4;
      var col = palette.fog;
      if (roll < 0.16) { role = 'glass'; ink = 'lime'; r = 5 + rand() * 9; col = palette.lime; }
      else if (roll < 0.34) { role = 'matte'; ink = 'lime'; r = 2.4 + rand() * 3.2; col = palette.lime; }
      else if (roll < 0.62) { role = 'matte'; ink = 'paper'; r = 1.6 + rand() * 2.6; col = palette.paper; }
      else if (roll < 0.84) { role = 'matte'; ink = 'fog'; r = 1.4 + rand() * 2.2; col = palette.fog; }
      else { role = 'deep'; ink = 'deep'; r = 2 + rand() * 3; col = palette.deep; }
      var a = rand() * Math.PI * 2;
      var sp = 6 + rand() * 14;
      parts.push({
        x: rand() * W, y: rand() * H,
        vx: 0, vy: 0,
        dx: Math.cos(a) * sp, dy: Math.sin(a) * sp * 0.7,
        r: r, role: role, ink: ink, col: col,
        ph: rand() * Math.PI * 2,
        tw: 0.5 + rand() * 0.5
      });
    }
  }

  function size() {
    if (!canvas) return;
    var ws = document.getElementById('desktopWorkspace');
    if (!ws) return;
    var rect = ws.getBoundingClientRect();
    DPR = Math.min(window.devicePixelRatio || 1, 1.5);
    W = Math.max(80, Math.floor(rect.width));
    H = Math.max(80, Math.floor(rect.height));
    canvas.width = Math.floor(W * DPR);
    canvas.height = Math.floor(H * DPR);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
  }

  function deriveMode() {
    try {
      if (window.Retoma && window.Retoma.isPaused && window.Retoma.isPaused()) return 'paused';
      if (window.Retoma && window.Retoma.state) {
        var st = window.Retoma.state;
        var card = document.getElementById('resumeCard');
        if (card && card.classList.contains('is-visible')) return 'ring';
        if (st.away) return 'away';
        if (st.currentApp && st.currentApp !== lastApp) {
          lastApp = st.currentApp;
          if (st.currentApp === 'WhatsApp') scatterT = 90;
        } else if (st.currentApp) {
          lastApp = st.currentApp;
        }
      }
    } catch (e) { /* field keeps drifting */ }
    return scatterT > 0 ? 'scatter' : 'watching';
  }

  function updateAnchor() {
    anchorTick++;
    if (anchorTick % 30 !== 0 && anchor) return;
    anchorTick = 0;
    try {
      var card = document.getElementById('resumeCard');
      var ws = document.getElementById('desktopWorkspace');
      if (!card || !ws) { anchor = null; return; }
      var cr = card.getBoundingClientRect();
      var wr = ws.getBoundingClientRect();
      anchor = {
        x: Math.min(Math.max(cr.left - wr.left - 60, W * 0.3), W * 0.92),
        y: Math.min(Math.max(cr.top - wr.top + cr.height * 0.3, H * 0.15), H * 0.85)
      };
    } catch (e) { anchor = null; }
  }

  function frame() {
    raf = 0;
    if (!running || hidden || document.hidden) return;
    mode = deriveMode();
    if (mode === 'paused') { freeze(); return; }
    window.__presenceMode = mode;
    updateAnchor();
    if (scatterT > 0) scatterT--;
    var dim = mode === 'away' ? 0.45 : 1;
    var speed = mode === 'away' ? 0.35 : 1;
    var dt = 1 / 60;
    var i, p;
    var ringR = Math.min(W, H) * 0.30;
    for (i = 0; i < parts.length; i++) {
      p = parts[i];
      if (mode === 'ring' && anchor) {
        var ta = (i / parts.length) * Math.PI * 2 + p.ph * 0.05;
        var tx = anchor.x + Math.cos(ta) * ringR;
        var ty = anchor.y + Math.sin(ta) * ringR * 0.82;
        p.vx += (tx - p.x) * 0.022;
        p.vy += (ty - p.y) * 0.022;
        p.vx *= 0.90;
        p.vy *= 0.90;
      } else {
        p.vx += (p.dx * speed - p.vx) * 0.055;
        p.vy += (p.dy * speed - p.vy) * 0.055;
        if (pointer) {
          var ox = p.x - pointer.x;
          var oy = p.y - pointer.y;
          var d2 = ox * ox + oy * oy;
          var R = 130;
          if (d2 < R * R && d2 > 1) {
            var d = Math.sqrt(d2);
            var push = (1 - d / R) * 3.4;
            p.vx += (ox / d) * push;
            p.vy += (oy / d) * push;
          }
        }
        p.vx += (W / 2 - p.x) * 0.00012;
        p.vy += (H / 2 - p.y) * 0.00012;
      }
      p.x += p.vx * dt * 60 * 0.5;
      p.y += p.vy * dt * 60 * 0.5;
      if (p.x < -20) p.x = W + 20;
      if (p.x > W + 20) p.x = -20;
      if (p.y < -20) p.y = H + 20;
      if (p.y > H + 20) p.y = -20;
    }
    draw(dim);
    window.__presenceFrames = (window.__presenceFrames || 0) + 1;
    raf = requestAnimationFrame(frame);
  }

  function draw(dim) {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);
    var boost = (palette && palette.boost) || 1;
    function alpha(a) {
      var v = a * boost;
      return v > 1 ? 1 : v;
    }
    var t = (window.__presenceFrames || 0) / 60;
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      var glow = 0.55 + 0.45 * Math.sin(t * p.tw + p.ph);
      if (p.role === 'glass') {
        ctx.globalAlpha = alpha(0.30 * dim * glow + 0.10);
        ctx.strokeStyle = solid(p.col);
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, 6.2832);
        ctx.stroke();
        ctx.globalAlpha = alpha(0.10 * dim);
        ctx.fillStyle = solid(p.col);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, 6.2832);
        ctx.fill();
      } else if (p.role === 'deep') {
        ctx.globalAlpha = alpha(0.35 * dim);
        ctx.fillStyle = solid(p.col);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, 6.2832);
        ctx.fill();
      } else {
        ctx.globalAlpha = alpha((p.col === palette.lime ? 0.5 : 0.42) * dim * glow + 0.08);
        ctx.fillStyle = solid(p.col);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, 6.2832);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  function freeze() {
    running = false;
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    if (canvas) canvas.classList.add('is-frozen');
    window.__presenceMode = 'paused';
  }

  function thaw() {
    if (canvas) canvas.classList.remove('is-frozen');
    if (!running && !reduced && !hidden && !document.hidden) {
      running = true;
      if (!raf) raf = requestAnimationFrame(frame);
    }
  }

  function start() {
    if (running || reduced || hidden || document.hidden) return;
    running = true;
    if (!raf) raf = requestAnimationFrame(frame);
  }

  function stop() {
    running = false;
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
  }

  function scatter() {
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      var a = Math.random() * Math.PI * 2;
      var f = 60 + Math.random() * 90;
      p.vx += Math.cos(a) * f * 0.06;
      p.vy += Math.sin(a) * f * 0.06;
    }
    scatterT = 80;
  }

  function mount() {
    reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    window.__presenceFrames = 0;
    window.__presenceMode = 'calm';
    if (reduced) return;
    var ws = document.getElementById('desktopWorkspace');
    var wall = ws ? ws.querySelector('.wallpaper') : null;
    if (!ws || !wall) return;
    try {
      if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches && window.innerWidth < 901) return;
    } catch (e) { /* keep field */ }
    refreshPalette();
    canvas = document.createElement('canvas');
    canvas.id = 'presenceField';
    canvas.setAttribute('aria-hidden', 'true');
    wall.insertBefore(canvas, wall.firstChild);
    ctx = canvas.getContext('2d');
    if (!ctx) { canvas.remove(); canvas = null; return; }
    size();
    build();
    if (!parts.length) return;
    document.addEventListener('pointermove', function (ev) {
      var r = canvas.getBoundingClientRect();
      if (ev.clientX < r.left || ev.clientX > r.right || ev.clientY < r.top || ev.clientY > r.bottom) { pointer = null; return; }
      pointer = { x: ev.clientX - r.left, y: ev.clientY - r.top };
    }, { passive: true });
    document.addEventListener('pointerleave', function () { pointer = null; });
    window.addEventListener('resize', function () { size(); });
    if (typeof MutationObserver !== 'undefined') {
      var obs = new MutationObserver(function () { refreshPalette(); });
      obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    }
    document.addEventListener('visibilitychange', function () {
      hidden = document.hidden;
      if (hidden) stop(); else thaw();
    });
    if (window.Events && Events.on) {
      Events.on('app:switch', function (next) {
        if (next && next.label === 'WhatsApp') scatter();
      });
      Events.on('retoma:pause', function (isPaused) {
        if (isPaused) { mode = 'paused'; freeze(); } else { thaw(); }
      });
    }
    try {
      var io = new IntersectionObserver(function (entries) {
        hidden = !entries[0].isIntersecting;
        if (hidden) stop(); else thaw();
      });
      io.observe(canvas);
    } catch (e) { /* observer optional */ }
    start();
  }

  return { mount: mount, scatter: scatter, thaw: thaw, freeze: freeze };
})();
