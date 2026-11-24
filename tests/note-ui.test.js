/* tests/note-ui.test.js — the Next step field: grows to 3 lines, Enter saves, a quiet "Saved" confirms.
 * Run with: node tests/note-ui.test.js */
'use strict';
const { chromium } = require('playwright');
const path = require('path');
const { pathToFileURL } = require('url');
const seed = require('./support/seed');
let passed = 0, failed = 0;
function ok(c, n, d) { if (c) { passed++; console.log('  ok ' + n); } else { failed++; console.log('  FAIL ' + n + (d ? '\n       ' + d : '')); } }
const INDEX = pathToFileURL(path.resolve(__dirname, '..', 'index.html')).href;
const LONG = 'revisar la bibliografía y mandar el borrador a Ana antes del viernes por la tarde sin falta';
(async () => {
  const b = await chromium.launch();
  for (const lang of ['en', 'es']) {
    const L = '[' + lang + '] ';
    const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.addInitScript((l) => { localStorage.clear(); localStorage.setItem('retoma.lang', l); }, lang);
  await seed(p, { lang: lang });
    await p.goto(INDEX);
    await p.waitForFunction(() => window.Retoma && !document.body.classList.contains('is-launch'));
    await p.waitForTimeout(400);
    const h0 = await p.evaluate(() => document.getElementById('leaveNote').getBoundingClientRect().height);
    const saved = () => p.evaluate(() => { const s = document.getElementById('leaveNoteSaved'); return s ? { text: s.textContent.trim(), shown: getComputedStyle(s).opacity > 0.5 && getComputedStyle(s).visibility !== 'hidden' } : null; });
    ok((await saved()) && !(await saved()).shown, L + 'no "Saved" before typing', JSON.stringify(await saved()));
    await p.click('#leaveNote');
    await p.keyboard.type(LONG);
    const box = await p.evaluate(() => { const e = document.getElementById('leaveNote'); return { h: e.getBoundingClientRect().height, sh: e.scrollHeight, ch: e.clientHeight, sw: e.scrollWidth, cw: e.clientWidth }; });
    ok(box.h > h0 + 10, L + 'the field grows for a long note', JSON.stringify({ h0, box }));
    ok(box.sh <= box.ch + 2 && box.sw <= box.cw + 2, L + 'the whole note is visible (nothing clipped)', JSON.stringify(box));
    await p.waitForTimeout(1200);
    let s = await saved();
    ok(s && s.shown && s.text === (lang === 'es' ? 'Guardado' : 'Saved'), L + 'a pause in typing shows Saved', JSON.stringify(s));
    await p.click('#leaveNote'); await p.keyboard.press('End'); await p.keyboard.type(' ok');
    await p.waitForTimeout(100);
    await p.keyboard.press('Enter');
    await p.waitForTimeout(250);
    s = await saved();
    ok(s && s.shown, L + 'Enter shows Saved right away', JSON.stringify(s));
    const after = await p.evaluate(() => ({ val: document.getElementById('leaveNote').value, focused: document.activeElement && document.activeElement.id, stored: localStorage.getItem('retoma.note.demo') }));
    ok(after.val === LONG + ' ok' && !/\n/.test(after.val), L + 'Enter does not add a line break', JSON.stringify(after.val));
    ok(after.focused !== 'leaveNote', L + 'Enter leaves the field', after.focused);
    ok(after.stored === LONG + ' ok', L + 'Enter stores the note', after.stored);
    await p.evaluate(() => { Retoma.goAway(25); Retoma.comeBack(); }); await p.waitForTimeout(800);
    ok(new RegExp(LONG.slice(0, 30)).test(await p.evaluate(() => document.getElementById('resumeNote').textContent)), L + 'the resume card shows the note');
    ok(errs.length === 0, L + 'no page errors', errs.join(' | '));
    await p.close();
  }
  await b.close();
  console.log('\nnote-ui: ' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
