/* tests/electron-smoke.js — Playwright-Electron smoke: window opens, title, theme toggle, screenshot.
 * Under Wayland run with xvfb-run (or --ozone-platform=x11) — see TESTING.md. */
const path = require('path');
const fs = require('fs');
const { _electron } = require('/home/nico/.nvm/versions/node/v22.23.2/lib/node_modules/playwright');

const ROOT = path.resolve(__dirname, '..');
const SHOTS = path.join(ROOT, 'shots');

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
  const app = await _electron.launch({ executablePath: electronPath, args: ['.', '--no-sandbox'], cwd: ROOT });
  const window = await app.firstWindow();
  await window.waitForSelector('#deskClock', { timeout: 15000 });

  ok((await window.title()) === 'Retoma', 'window title is Retoma', await window.title());
  ok((await window.locator('.window').count()) === 4, '4 windows present');
  ok((await window.locator('#themeToggle[aria-label="Switch theme"]').count()) === 1, 'theme toggle present');

  const before = await window.evaluate(() => document.documentElement.getAttribute('data-theme'));
  await window.click('#themeToggle');
  await window.waitForTimeout(600);
  const after = await window.evaluate(() => document.documentElement.getAttribute('data-theme'));
  ok(before !== after, 'theme toggle flips data-theme', before + ' -> ' + after);

  // app window in DARK and LIGHT: resume card + timeline
  for (const th of ['dark', 'light']) {
    await window.evaluate((t) => Theme.apply(t, false), th);
    await window.evaluate(() => { Retoma.goAway(25); Retoma.comeBack(); });
    await window.waitForTimeout(600);
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
  }

  await app.close();
  if (fails.length) { console.log(fails.length + ' failed, ' + pass + ' passed'); process.exit(1); }
  console.log('  ' + pass + ' passed, 0 failed');
})().catch(e => { console.error(e); process.exit(1); });
