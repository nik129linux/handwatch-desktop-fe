/* tests/electron-smoke.js — Playwright-Electron smoke: window opens, title, theme toggle, screenshot.
 * Under Wayland run with xvfb-run (or --ozone-platform=x11) — see TESTING.md. */
const path = require('path');
const fs = require('fs');
const os = require('os');
const { _electron } = require('/home/nico/.nvm/versions/node/v22.23.2/lib/node_modules/playwright');

const ROOT = path.resolve(__dirname, '..');
const SHOTS = path.join(ROOT, 'shots');
// Isolated profile: parallel agents (or a dev `npm start`) hold the
// single-instance lock on the default ~/.config/retoma profile, which makes
// a second instance quit instantly ("Target page ... has been closed").
// A unique --user-data-dir per run keeps the lock (and events.json) private.
const PROFILE = fs.mkdtempSync(path.join(os.tmpdir(), 'retoma-smoke-'));

let pass = 0;
const fails = [];
function ok(cond, label, detail) {
  if (cond) { pass++; console.log('  ✓ ' + label); return true; }
  fails.push(label + (detail ? ' — ' + detail : ''));
  console.log('  ✗ ' + label + (detail ? '\n      ' + detail : ''));
  return false;
}

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const electronPath = require('electron');
  const app = await _electron.launch({ executablePath: electronPath, args: ['.', '--no-sandbox', '--user-data-dir=' + PROFILE], cwd: ROOT });
  const window = await app.firstWindow();
  await window.waitForSelector('#deskClock', { timeout: 15000 });
  // screenshots and state checks start only once the entrance choreography is done
  await window.waitForFunction(() => !document.body.classList.contains('is-launch'), { timeout: 15000 });

  ok((await window.title()) === 'Retoma', 'window title is Retoma', await window.title());
  ok((await window.locator('.window').count()) === 4, '4 windows present');
  const entered = await window.evaluate(() => Array.from(document.querySelectorAll('.window')).map(e => ({
    app: e.getAttribute('data-app'),
    min: e.classList.contains('is-minimized'),
    hid: e.classList.contains('is-hidden'),
    op: parseFloat(getComputedStyle(e).opacity)
  })));
  ok(entered.length === 4 && entered.every(w => !w.min && !w.hid && w.op > 0.9), 'all 4 windows visible after the entrance', JSON.stringify(entered));
  ok((await window.locator('#themeToggle[aria-label="Switch theme"]').count()) === 1, 'theme toggle present');

  const before = await window.evaluate(() => document.documentElement.getAttribute('data-theme'));
  await window.click('#themeToggle');
  await window.waitForTimeout(600);
  const after = await window.evaluate(() => document.documentElement.getAttribute('data-theme'));
  ok(before !== after, 'theme toggle flips data-theme', before + ' -> ' + after);

  // app window in DARK and LIGHT: resume card + timeline + privacy.
  // Document is back on the desk in both themes (comeBack restores it).
  for (const th of ['dark', 'light']) {    await window.evaluate((t) => Theme.apply(t, false), th);
    await window.evaluate(() => { Retoma.goAway(25); Retoma.comeBack(); });
    await window.waitForTimeout(600);
    const resumeWins = await window.evaluate(() => Array.from(document.querySelectorAll('.window')).map(e => ({
      app: e.getAttribute('data-app'),
      vis: !e.classList.contains('is-minimized') && !e.classList.contains('is-hidden')
    })));
    ok(resumeWins.length === 4 && resumeWins.every(w => w.vis), '[' + th + '] Document present in resume state', JSON.stringify(resumeWins));
    await window.screenshot({ path: path.join(SHOTS, 'app-' + th + '-resume.png') });
    await window.evaluate(() => { document.getElementById('retomarBtn').click(); Retoma.showEndOfDay(); });
    await window.waitForTimeout(500);
    await window.evaluate(() => {
      Retoma.openPanel(); Retoma.switchTab('hoy');
      const bar = document.getElementById('timelineBar');
      if (bar) bar.scrollIntoView({ block: 'start' });
    });
    await window.waitForTimeout(400);
    await window.screenshot({ path: path.join(SHOTS, 'app-' + th + '-timeline.png') });
    await window.evaluate(() => { Retoma.openPanel(); Retoma.switchTab('priv'); });
    await window.waitForTimeout(400);
    await window.screenshot({ path: path.join(SHOTS, 'app-' + th + '-privacy.png') });
  }

  console.log('\nD1 · preload bridge + IPC persistence + propose');
  ok(await window.evaluate(() => !!(window.retoma && window.retoma.propose)), 'preload bridge window.retoma.propose present');
  const caps = await window.evaluate(() => window.retoma.capabilities());
  const keyPresent = !!process.env.GEMINI_API_KEY;
  ok(caps && caps.cloudAvailable === keyPresent, 'cloud availability follows the key', JSON.stringify(caps));
  ok(keyPresent ? (caps.cloudReason || '') === '' : /GEMINI_API_KEY/.test(caps.cloudReason || ''), 'disabled reason names the missing key', (caps && caps.cloudReason) || '(enabled)');
  const eProp = await window.evaluate(async () => {
    const s = { perApp: { Document: 40 }, longest: { app: 'Document', minutes: 40 }, firstInterruption: { app: 'WhatsApp', at: '9:52' } };
    return window.retoma.propose(s, { mode: 'off' });
  });
  ok(/^\d{1,2}:[0-5]\d$/.test(eProp.start) && Number.isInteger(eProp.minutes) && eProp.minutes >= 15 && eProp.minutes <= 180 && String(eProp.reason).length <= 140, 'propose off returns valid shape over IPC', JSON.stringify(eProp));
  await window.evaluate(() => window.retoma.saveEvents([{ app: 'Document', duration: 40, ts: new Date().toISOString() }]));
  const eLoaded = await window.evaluate(() => window.retoma.loadEvents());
  ok(Array.isArray(eLoaded) && eLoaded.length >= 1, 'events round-trip through events.json', JSON.stringify(eLoaded).slice(0, 120));
  await window.evaluate(() => window.retoma.deleteEvents());
  const eAfter = await window.evaluate(() => window.retoma.loadEvents());
  ok(Array.isArray(eAfter) && eAfter.length === 0, 'delete-all empties the store');
  await window.evaluate(() => { Retoma.goAway(25); Retoma.comeBack(); });
  await window.waitForTimeout(400);
  ok(await window.evaluate(() => document.getElementById('resumeCard').classList.contains('is-visible')), 'resume card shows after 25 min away (notify path)');
  const segCount = await window.evaluate(() => document.querySelectorAll('[data-ai-mode]').length);
  ok(segCount === 3, 'Smart suggestions control present in app', 'found ' + segCount);

  await app.close();
  try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch (e) { /* best effort */ }
  if (fails.length) { console.log(fails.length + ' failed, ' + pass + ' passed'); process.exit(1); }
  console.log('  ' + pass + ' passed, 0 failed');
})().catch(e => { console.error(e); process.exit(1); });
