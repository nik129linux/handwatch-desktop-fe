/* tests/note-pin.test.js — a saved note shows up right away in the Now card, and Saved says where it goes.
 * Run with: node tests/note-pin.test.js */
'use strict';
const { chromium } = require('playwright');
const path = require('path');
const { pathToFileURL } = require('url');
let passed = 0, failed = 0;
function ok(c, n, d) { if (c) { passed++; console.log('  ok ' + n); } else { failed++; console.log('  FAIL ' + n + (d ? '\n       ' + d : '')); } }
const INDEX = pathToFileURL(path.resolve(__dirname, '..', 'index.html')).href;
const shown = (p) => p.evaluate(() => { const e = document.getElementById('nowNote'); if (!e) return null; const r = e.getBoundingClientRect(); return { text: e.textContent.trim(), vis: r.height > 0 && getComputedStyle(e).display !== 'none' && !!e.closest('#retomaTabAhora .now-hero') }; });
(async () => {
  const b = await chromium.launch();
  for (const lang of ['en', 'es']) {
    const L = '[' + lang + '] ';
    const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.addInitScript((l) => { localStorage.clear(); localStorage.setItem('retoma.lang', l); }, lang);
    await p.goto(INDEX);
    await p.waitForFunction(() => window.Retoma && !document.body.classList.contains('is-launch'));
    await p.waitForTimeout(400);
    let s = await shown(p);
    ok(!s || !s.vis, L + 'no pinned note before writing one', JSON.stringify(s));
    await p.click('#leaveNote'); await p.keyboard.type('mandar el borrador'); await p.keyboard.press('Enter');
    await p.waitForTimeout(300);
    s = await shown(p);
    ok(s && s.vis && s.text.indexOf('mandar el borrador') !== -1, L + 'Enter pins the note in the Now card', JSON.stringify(s));
    ok(s && /^(Next|Siguiente): /.test(s.text), L + 'pinned note reads Next: / Siguiente:', JSON.stringify(s));
    const saved = await p.evaluate(() => document.getElementById('leaveNoteSaved').textContent.trim());
    ok(saved === (lang === 'es' ? 'Guardado, lo verás al volver' : "Saved, you'll see it when you come back"), L + 'Saved says where it goes', saved);
    await p.fill('#leaveNote', ''); await p.keyboard.press('Enter'); await p.focus('#leaveNote'); await p.keyboard.press('Enter');
    await p.waitForTimeout(300);
    s = await shown(p);
    ok(!s || !s.vis, L + 'clearing the note unpins it', JSON.stringify(s));
    ok(errs.length === 0, L + 'no page errors', errs.join(' | '));
    await p.close();
  }
  await b.close();
  console.log('\nnote-pin: ' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
