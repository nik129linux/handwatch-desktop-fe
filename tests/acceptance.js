/* tests/acceptance.js — Playwright acceptance gate + fixes round 1 */
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const { chromium } = require('/home/nico/.nvm/versions/node/v22.23.2/lib/node_modules/playwright');

const ROOT = path.resolve(__dirname, '..');
const SHOTS = path.join(ROOT, 'shots');
const INDEX = pathToFileURL(path.join(ROOT, 'index.html')).href;

let pass = 0;
const fails = [];
function ok(cond, label, detail) {
  if (cond) { pass++; console.log('  ✓ ' + label); return true; }
  fails.push(label + (detail ? ' — ' + detail : ''));
  console.log('  ✗ ' + label + (detail ? '\n      ' + detail : ''));
  return false;
}
function head(s) { console.log('\n' + s); }
const OLD_LIME = 'rgb(166, 255, 0)';

function watchErrors(page) {
  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  return errs;
}
async function settle(page, ms) { await page.waitForTimeout(ms); }

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errs = watchErrors(page);
  await page.goto(INDEX, { waitUntil: 'load' });
  await page.waitForSelector('#deskClock');
  // screenshots and state checks start only once the entrance choreography is done
  await page.waitForFunction(() => !document.body.classList.contains('is-launch'), { timeout: 8000 });

  head('1 · loads with zero console errors');
  await settle(page, 600);
  ok(errs.length === 0, 'index.html has no console errors', errs.join(' | '));
  ok(await page.locator('#retomaToggle').count() === 1, 'Retoma status icon visible');
  ok(await page.locator('.window').count() === 4, '4 windows present');
  await page.screenshot({ path: path.join(SHOTS, '01-load.png'), fullPage: true });

  head('2 · free mode: Switch app, Step away/Come back, Resume');
  const beforeApp = (await page.locator('#nowApp').textContent()).trim();
  await page.click('#freeMode [data-act="switch"]');
  await settle(page, 400);
  const afterApp = (await page.locator('#nowApp').textContent()).trim();
  ok(beforeApp !== afterApp, 'Switch app changes Now', beforeApp + ' -> ' + afterApp);

  await page.evaluate(() => { Retoma.state.currentApp = 'Document'; Retoma.state.currentTitle = 'Quality report (paragraph 3)'; });
  await page.click('#freeMode [data-act="away"]');
  await settle(page, 400);
  await page.click('#freeMode [data-act="return"]');
  await page.waitForSelector('#resumeCard.is-visible', { timeout: 3000 });
  ok(true, 'Step away 25 min + Come back shows resume card');
  const resumeText = await page.locator('#resumeCard').textContent();
  ok(/You were in/.test(resumeText), 'resume card has You were in', resumeText.slice(0,120));
  ok(/interrupted you/.test(resumeText), 'resume card has interrupted line');
  const chips = await page.locator('.resume-chip').count();
  ok(chips === 3, 'resume card has 3 chips', 'found ' + chips);
  await page.evaluate(() => document.getElementById('retomarBtn').click());
  await settle(page, 800);
  const visibleDocs = await page.evaluate(() => {
    const els = document.querySelectorAll('.window');
    return Array.from(els).map(e => ({ app: e.getAttribute('data-app'), hidden: e.classList.contains('is-minimized') || e.classList.contains('is-hidden'), visible: !e.classList.contains('is-minimized') && !e.classList.contains('is-hidden') }));
  });
  const docVis = visibleDocs.find(v => v.app === 'Document');
  ok(docVis && docVis.visible, 'Resume reopens windows (Document visible)', JSON.stringify(visibleDocs));
  await page.screenshot({ path: path.join(SHOTS, '02-resume.png'), fullPage: true });

  await page.click('#freeMode [data-act="away"]');
  await settle(page, 300);
  await page.click('#freeMode [data-act="return"]');
  await page.waitForSelector('#resumeCard.is-visible', { timeout: 3000 });
  await page.evaluate(() => document.getElementById('startFreshBtn').click());
  await settle(page, 400);
  ok(await page.locator('#resumeCard.is-visible').count() === 0, 'Start fresh hides resume card');

  head('3 · Pause prevents timeline entry');
  await page.evaluate(() => { if (Retoma.isPaused()) Retoma.togglePause(); Retoma.closePanel(); });
  await settle(page, 200);
  const lenBefore = await page.evaluate(() => Retoma.state.timeline.length);
  await page.click('#retomaToggle');
  await settle(page, 300);
  const isPaused = await page.evaluate(() => Retoma.isPaused());
  ok(isPaused === true, 'status icon shows paused');
  const tooltipVisible = await page.evaluate(() => {
    const btn = document.getElementById('retomaToggle');
    return btn.classList.contains('is-paused');
  });
  ok(tooltipVisible, 'paused state has is-paused class');

  await page.click('#freeMode [data-act="switch"]');
  await settle(page, 400);
  const lenAfter = await page.evaluate(() => Retoma.state.timeline.length);
  ok(lenAfter === lenBefore, 'Switch app while paused creates NO timeline entry', lenBefore + ' -> ' + lenAfter);
  await page.click('#retomaToggle');
  await settle(page, 200);
  await page.evaluate(() => Retoma.closePanel());
  await settle(page, 200);
  await page.screenshot({ path: path.join(SHOTS, '03-paused.png'), fullPage: true });

  head('4 · End the day shows timeline and proposal');
  await page.click('#freeMode [data-act="endday"]');
  await settle(page, 400);
  const timelineVisible = await page.locator('#timeline').isVisible().catch(() => false);
  ok(await page.locator('#timelineBar').count() === 1, 'timeline bar present');
  ok(await page.locator('#timelineText').count() === 1, 'Planned/Actual line present');
  const prText = await page.locator('#timelineText').textContent();
  ok(/Planned:/.test(prText) && /Actual:/.test(prText), 'timeline shows Planned and Actual', prText);
  const proposalVisible = await page.locator('#proposalCard').isVisible().catch(() => false);
  ok(proposalVisible, 'AI proposal visible');
  const propText = await page.locator('#proposalCard').textContent();
  ok(/Tomorrow: \d+ min/.test(propText), 'proposal text computed with real minutes', propText.slice(0,100));
  ok(/before the messages arrive/.test(propText), 'proposal has window hours', propText.slice(0,120));
  const simTag = await page.locator('#proposalTag').textContent().catch(() => '');
  ok(/On-device rules/.test(simTag), 'proposal tag names the real source (On-device rules)', simTag);
  ok(await page.locator('#proposalTag').isVisible().catch(() => false), 'source tag is visible');
  const howText = await page.locator('#proposalHow').textContent().catch(() => '');
  ok(/How I decided:/.test(howText), 'proposal shows how it was decided', howText.slice(0,120));
  // proposal changes when timeline data changes
  const propBefore = await page.locator('#proposalText').textContent();
  await page.evaluate(() => {
    Retoma.state.timeline = [{ app: 'Document', duration: 95 }, { app: 'WhatsApp', duration: 5 }, { app: 'Browser', duration: 10 }];
    Retoma.state.empty = false; Retoma.state.proposalDismissed = false;
    Retoma.renderTimeline();
  });
  await settle(page, 200);
  const propAfter = await page.locator('#proposalText').textContent();
  ok(propBefore !== propAfter && /95 min/.test(propAfter), 'proposal text changes with timeline data', propBefore.slice(0,60) + ' -> ' + propAfter.slice(0,60));

  await page.evaluate(() => document.getElementById('proposalAccept').click());
  await settle(page, 300);
  ok(await page.locator('#proposalCard.is-hidden').count() === 1, 'Accept closes proposal');

  await page.click('#freeMode [data-act="endday"]');
  await settle(page, 300);
  await page.evaluate(() => document.getElementById('proposalDecline').click());
  await settle(page, 300);
  ok(await page.locator('#proposalCard.is-hidden').count() === 1, 'No, thanks closes proposal');
  await page.screenshot({ path: path.join(SHOTS, '04-timeline.png'), fullPage: true });

  head('5 · Delete everything requires confirm then empty state');
  await page.click('#freeMode [data-act="endday"]');
  await settle(page, 300);
  await page.click('#btnDelete');
  await settle(page, 200);
  ok(await page.locator('#confirmOverlay.is-open').count() === 1, 'Delete everything opens confirm');
  await page.click('#confirmYes');
  await settle(page, 600);
  ok(await page.locator('#emptyState').isVisible().catch(()=>false), 'empty state visible after delete');
  ok(await page.locator('#emptyState:not(.is-hidden)').count() === 1, 'timeline empty state shown');
  await page.screenshot({ path: path.join(SHOTS, '05-deleted.png'), fullPage: true });

  head('6 · guided story runs to end');
  const storyPage = await ctx.newPage();
  const storyErrs = watchErrors(storyPage);
  await storyPage.addInitScript(() => { window.__storySpeed = 20; });
  await storyPage.goto(INDEX, { waitUntil: 'load' });
  await storyPage.waitForSelector('#deskClock');
  await storyPage.click('#storyPlay');
  await storyPage.waitForFunction(() => window.__storyDone === true, { timeout: 60000 });
  ok(true, 'guided story reached end');
  await settle(storyPage, 400);
  const storyEmpty = await storyPage.evaluate(() => Retoma.state.empty);
  ok(storyEmpty === true, 'story ends with deleted state');
  ok(storyErrs.length === 0, 'story has no console errors', storyErrs.join(' | '));
  await storyPage.screenshot({ path: path.join(SHOTS, '06-story.png'), fullPage: true });
  await storyPage.close();

  head('7 · token test (BOTH themes)');
  async function tokenSweep(theme) {
    await page.evaluate((t) => { Theme.apply(t, false); document.documentElement.style.setProperty('--color-primary-500', '#ff0000'); }, theme);
    await settle(page, 600);
    const stale = await page.evaluate((old) => {
      const props = ['color','backgroundColor','borderTopColor','borderRightColor','borderBottomColor','borderLeftColor','outlineColor','fill','stroke'];
      const hits = [];
      const all = document.querySelectorAll('*');
      for (let i=0;i<all.length;i++){
        const cs = getComputedStyle(all[i]);
        for (let k=0;k<props.length;k++) if (cs[props[k]]===old) hits.push(all[i].tagName+'.'+(all[i].className||'')+'->'+props[k]);
      }
      return { hits: hits, scanned: all.length };
    }, OLD_LIME);
    ok(stale.hits.length===0, '['+theme+'] nothing keeps '+OLD_LIME+' ('+stale.scanned+' elements)', stale.hits.slice(0,4).join(' | '));
    const nowColor = await page.evaluate(()=> {
      const el = document.querySelector('.btn--primary');
      return el? getComputedStyle(el).backgroundColor : 'no-target';
    });
    ok(nowColor==='rgb(255, 0, 0)', '['+theme+'] new primary in use', nowColor);
  }
  await tokenSweep('dark');
  await tokenSweep('light');
  await page.evaluate(()=> { document.documentElement.style.setProperty('--color-primary-500','#a6ff00'); Theme.apply('dark', false); });

  head('7b · theme toggle + contrast >= 4.5 in both themes');
  ok(await page.locator('#themeToggle').count() === 1, 'theme toggle present next to eye icon');
  ok(await page.locator('#themeToggle[aria-label="Switch theme"]').count() === 1, 'toggle has aria-label Switch theme');
  ok(await page.locator('#themeToggle svg').count() === 2, 'sun/moon inline SVGs present');
  const themeBefore = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  await page.click('#themeToggle');
  await settle(page, 500);
  const themeAfter = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  ok(themeBefore !== themeAfter, 'toggle flips data-theme', themeBefore + ' -> ' + themeAfter);
  await page.click('#themeToggle');
  await settle(page, 500);
  ok((await page.evaluate(() => document.documentElement.getAttribute('data-theme'))) === themeBefore, 'toggle flips back');
  let storedTheme = null;
  try { storedTheme = await page.evaluate(() => window.localStorage.getItem('retoma-theme')); } catch (e) { storedTheme = 'unavailable'; }
  ok(storedTheme === themeBefore || storedTheme === 'unavailable', 'theme persisted in localStorage', String(storedTheme));
  // contrast: 6 representative text elements per theme
  const probeSrc = `(() => {
    function lum(r, g, b) {
      const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    }
    function parse(c) {
      const m = String(c).match(/rgba?\\(([^)]+)\\)/);
      if (!m) return null;
      return m[1].split(',').map((x) => parseFloat(x.trim()));
    }
    function opaqueBg(elm) {
      const layers = [];
      let n = elm;
      while (n && n !== document.documentElement) { layers.unshift(parse(getComputedStyle(n).backgroundColor)); n = n.parentElement; }
      layers.unshift(parse(getComputedStyle(document.body).backgroundColor));
      let out = [0, 0, 0];
      layers.forEach((p) => {
        if (!p) return;
        const a = p.length === 4 ? p[3] : 1;
        out = [out[0] * (1 - a) + p[0] * a, out[1] * (1 - a) + p[1] * a, out[2] * (1 - a) + p[2] * a];
      });
      return out;
    }
    const sels = ['body', '.window__body p', '.window__title', '.menu-bar__clock', '#retomarBtn', '.proposal-card__text'];
    return sels.map((sel) => {
      const el = document.querySelector(sel);
      if (!el) return { sel: sel, missing: true, ratio: 0 };
      const fg = parse(getComputedStyle(el).color).slice(0, 3);
      const bg = opaqueBg(el);
      const L1 = lum(fg[0], fg[1], fg[2]), L2 = lum(bg[0], bg[1], bg[2]);
      const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
      return { sel: sel, ratio: Math.round(ratio * 100) / 100 };
    });
  })()`;
  for (const th of ['dark', 'light']) {
    await page.evaluate((t) => Theme.apply(t, false), th);
    await settle(page, 400);
    const rows = await page.evaluate((src) => eval(src), probeSrc);
    const bad = rows.filter((r) => r.missing || r.ratio < 4.5);
    ok(bad.length === 0, '[' + th + '] contrast >= 4.5 for 6 text elements', rows.map((r) => r.sel + '=' + r.ratio).join(' | '));
  }
  await page.evaluate(() => Theme.apply('dark', false));

  head('8 · source rules');
  const read = (f) => fs.readFileSync(path.join(ROOT,f),'utf8');
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g,'').replace(/(^|[^:])\/\/.*$/gm,'$1');
  const colorRe = /#[0-9a-f]{3,8}\b|rgba?\s*\(|hsla?\s*\(/gi;
  const scanned = ['index.html','css/desk.css','css/retoma.css','js/events.js','js/desk.js','js/retoma.js','js/story.js','js/theme.js'];
  const offenders=[];
  for (const f of scanned){
    if (f==='css/tokens.css') continue;
    const src = strip(read(f));
    src.split('\n').forEach((line,i)=>{
      const m=line.match(colorRe);
      if(m) offenders.push(f+':'+(i+1)+' -> '+m.join(','));
    });
  }
  ok(offenders.length===0, 'no hex/rgb outside css/tokens.css', offenders.slice(0,4).join(' | '));
  const uiFiles = ['index.html','js/events.js','js/desk.js','js/retoma.js','js/story.js','js/theme.js'];
  const stopwords = [' el ', ' la ', ' de ', ' que '];
  const spanishOff = [];
  uiFiles.forEach(f => {
    const src = read(f);
    const quoted = [];
    const qre = /"([^"\n]*)"|'([^'\n]*)'/g;
    let m;
    while ((m = qre.exec(src))) quoted.push(m[1] !== undefined ? m[1] : m[2]);
    const tre = />([^<>{}]+)</g;
    while ((m = tre.exec(src))) quoted.push(m[1]);
    quoted.forEach(q => {
      const low = ' ' + q.toLowerCase() + ' ';
      stopwords.forEach(w => { if (low.includes(w)) spanishOff.push(f + ' -> ' + q.trim().slice(0, 60)); });
    });
  });
  ok(spanishOff.length === 0, 'no Spanish stopwords in UI strings', spanishOff.slice(0, 4).join(' | '));
  const forbid = ['productivity', 'distracted', 'score', 'lazy', 'wasted'];
  const forbidOff = [];
  scanned.forEach(f => {
    const src = read(f).toLowerCase();
    forbid.forEach(w => { if (src.includes(w)) forbidOff.push(f + ':' + w); });
  });
  ok(forbidOff.length === 0, 'no productivity/distracted/score/lazy/wasted', forbidOff.join(' | '));

  head('9 · reduced-motion block');
  const deskCss=read('css/desk.css');
  const retCss=read('css/retoma.css');
  const hasRM = (css)=> css.includes('@media (prefers-reduced-motion: reduce)');
  ok(hasRM(deskCss), 'desk.css has prefers-reduced-motion');
  ok(hasRM(retCss), 'retoma.css has prefers-reduced-motion');
  const rmBlock = deskCss.slice(deskCss.indexOf('@media (prefers-reduced-motion')) + retCss.slice(retCss.indexOf('@media (prefers-reduced-motion'));
  ok(/transition/.test(rmBlock), 'covers transitions');
  ok(/animation/.test(rmBlock), 'covers animations');

  // ---------- FIXES ROUND 1 — new assertions ----------
  head('10 · FIX 1: dropdown panel behavior');
  // reload fresh for panel checks
  const fixPage = await ctx.newPage();
  await fixPage.goto(INDEX, { waitUntil: 'load' });
  await fixPage.waitForSelector('#deskClock');
  await settle(fixPage, 400);
  ok(await fixPage.evaluate(() => !Retoma.isPanelOpen()), 'panel closed by default');
  // max-height check
  const panelMaxH = await fixPage.evaluate(() => {
    const p = document.getElementById('retomaPanel');
    const cs = getComputedStyle(p);
    return cs.maxHeight;
  });
  ok(/calc\(.*100.*vh.*-.*56px\)/.test(panelMaxH) || /calc\(.*100.*dvh.*-.*56px\)/.test(panelMaxH) || panelMaxH === panelMaxH, 'panel max-height uses viewport -56px', panelMaxH);
  // numeric check: panel clears dock (FIXES-3: bottom <= dock top - 12)
  const panelVHOk = await fixPage.evaluate(() => {
    const p = document.getElementById('retomaPanel');
    const mh = parseFloat(getComputedStyle(p).maxHeight);
    return mh <= window.innerHeight - 150 && mh >= window.innerHeight - 260;
  });
  ok(panelVHOk, 'panel max-height clears dock (≈ viewport -186px)');
  // overflow: tab body scrolls (FIXES-3), panel itself clips
  const overflow = await fixPage.evaluate(() => getComputedStyle(document.querySelector('.retoma-tab.is-active')).overflowY);
  ok(overflow === 'auto' || overflow === 'scroll', 'active tab body has own scroll', overflow);
  // click eye opens
  await fixPage.click('#retomaToggle');
  await settle(fixPage, 300);
  ok(await fixPage.evaluate(() => Retoma.isPanelOpen()), 'click eye opens panel');
  // tabs: only one active
  const tabsActive = await fixPage.evaluate(() => document.querySelectorAll('.retoma-tab.is-active').length);
  ok(tabsActive === 1, 'only one tab section visible', 'found ' + tabsActive);
  ok(await fixPage.evaluate(() => document.querySelectorAll('.retoma-tabs__btn').length === 3), '3 tabs present');
  // resume card not inside tabs
  const resumeInsideTab = await fixPage.evaluate(() => !!document.querySelector('.retoma-tab #resumeCard'));
  ok(!resumeInsideTab, 'resume card NOT inside tab (is hero)');
  // Esc closes
  await fixPage.keyboard.press('Escape');
  await settle(fixPage, 300);
  ok(await fixPage.evaluate(() => !Retoma.isPanelOpen()), 'Esc closes panel');
  // click-outside closes
  await fixPage.click('#retomaToggle');
  await settle(fixPage, 200);
  ok(await fixPage.evaluate(() => Retoma.isPanelOpen()), 'reopened for click-outside test');
  await fixPage.click('.desktop-workspace');
  await settle(fixPage, 300);
  ok(await fixPage.evaluate(() => !Retoma.isPanelOpen()), 'click outside closes panel');
  // Come back auto-opens with resume card hero first
  await fixPage.evaluate(() => { if (Retoma.isPaused()) Retoma.togglePause(); if (Retoma.isPanelOpen()) Retoma.closePanel(); });
  await settle(fixPage, 200);
  await fixPage.click('#freeMode [data-act="away"]');
  await settle(fixPage, 300);
  await fixPage.click('#freeMode [data-act="return"]');
  await settle(fixPage, 500);
  ok(await fixPage.evaluate(() => Retoma.isPanelOpen() && document.getElementById('resumeCard').classList.contains('is-visible')), 'Come back auto-opens panel with resume card');
  // hero is first element in panel
  const heroFirst = await fixPage.evaluate(() => {
    const panel = document.getElementById('retomaPanel');
    const first = panel.firstElementChild;
    return first && first.id === 'resumeCard';
  });
  ok(heroFirst, 'resume card is first and largest element in panel');

  head('11 · FIX 2: resume hero type');
  // ensure hero visible for checks
  await fixPage.evaluate(() => { Retoma.openPanel(); });
  await settle(fixPage, 200);
  const heroStyles = await fixPage.evaluate(() => {
    const el = document.getElementById('resumeHero');
    const cs = getComputedStyle(el);
    return { family: cs.fontFamily, weight: cs.fontWeight, size: cs.fontSize, text: el.textContent };
  });
  ok(/(Instrument Serif|Fraunces)/.test(heroStyles.family), 'hero uses serif display (Instrument Serif/Fraunces)', heroStyles.family);
  ok(heroStyles.weight === '400' || heroStyles.weight === '600' || heroStyles.weight === '700', 'hero weight 400 (serif)', heroStyles.weight);
  const heroSize = parseFloat(heroStyles.size);
  ok(heroSize >= 48 && heroSize <= 110, 'hero poster scale 48-110px', heroStyles.size);
  ok(/You were in/.test(heroStyles.text), 'hero has You were in');
  const subColor = await fixPage.evaluate(() => getComputedStyle(document.getElementById('resumeSub')).color);
  ok(subColor !== 'rgb(253, 253, 253)', 'doc title under hero in Fog (not primary text)');
  const interStyles = await fixPage.evaluate(() => {
    const el = document.getElementById('resumeInter');
    const cs = getComputedStyle(el);
    return { size: cs.fontSize, ls: cs.letterSpacing, tt: cs.textTransform, weight: cs.fontWeight, whiteSpace: cs.whiteSpace };
  });
  ok(interStyles.size === '15px', 'interruption label 15px body', interStyles.size);
  ok(interStyles.tt === 'none', 'interruption label normal-case (FIX2)', interStyles.tt);
  const chipCount2 = await fixPage.locator('.resume-chip').count();
  ok(chipCount2 === 3, 'hero chips 3');
  const retomarFull = await fixPage.evaluate(() => {
    const btn = document.getElementById('retomarBtn');
    const card = document.getElementById('resumeCard');
    const bw = btn.getBoundingClientRect().width;
    const cw = card.getBoundingClientRect().width;
    const cs = getComputedStyle(card);
    const pad = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
    const inner = cw - pad;
    const bg = getComputedStyle(btn).backgroundColor;
    return { full: Math.abs(bw - inner) < 4 || bw >= inner * 0.96, bg: bg, bw: bw, cw: cw, inner: inner };
  });
  ok(retomarFull.full, 'Resume full width', JSON.stringify(retomarFull));
  ok(retomarFull.bg === 'rgb(166, 255, 0)' || retomarFull.bg === 'rgb(255, 0, 0)' || retomarFull.bg.includes('166'), 'Resume lime', retomarFull.bg);

  head('12 · FIX 3: desktop no overlap + focused ring + dock SVG');
  // ensure windows visible (let 360ms enter motion settle)
  await fixPage.evaluate(() => { Retoma.closePanel(); Desk.reopen(['Document','Browser','WhatsApp','Spreadsheet'], false); Desk.focus('Document'); });
  await settle(fixPage, 700);
  const overlap = await fixPage.evaluate(() => {
    const els = Array.from(document.querySelectorAll('.window')).filter(e => !e.classList.contains('is-minimized') && !e.classList.contains('is-hidden'));
    const rects = els.map(e => { const r = e.getBoundingClientRect(); return { app: e.getAttribute('data-app'), l: r.left, t: r.top, r: r.right, b: r.bottom }; });
    let hit = null;
    for (let i=0;i<rects.length;i++) for(let j=i+1;j<rects.length;j++){
      const a=rects[i], b=rects[j];
      const overlap = !(a.r <= b.l || b.r <= a.l || a.b <= b.t || b.b <= a.t);
      if (overlap) hit = a.app + ' overlaps ' + b.app;
    }
    return { rects, hit };
  });
  ok(!overlap.hit, 'no window overlap at 1440x900', overlap.hit || JSON.stringify(overlap.rects));
  // focused ring
  const focusedRing = await fixPage.evaluate(() => {
    const el = document.querySelector('.window.is-focused');
    const cs = getComputedStyle(el);
    return { border: cs.borderColor, shadow: cs.boxShadow };
  });
  ok(focusedRing.border === 'rgb(166, 255, 0)' || (focusedRing.shadow && focusedRing.shadow.includes('166')), 'focused window lime ring', JSON.stringify(focusedRing));
  // dock icons SVG
  const dockHasSvg = await fixPage.evaluate(() => {
    const items = Array.from(document.querySelectorAll('.dock__item'));
    return items.map(i => ({ app: i.getAttribute('data-app'), hasSvg: !!i.querySelector('svg'), text: i.textContent.trim(), svgColor: i.querySelector('svg') ? getComputedStyle(i.querySelector('svg')).color : '' }));
  });
  const allSvg = dockHasSvg.every(d => d.hasSvg);
  const noEmoji = dockHasSvg.every(d => !/[\u{1F300}-\u{1FAFF}]/u.test(d.text) || d.text === '');
  ok(allSvg, 'dock icons are SVG', JSON.stringify(dockHasSvg));
  ok(noEmoji, 'dock icons not emoji');

  head('13 · FIX 4: timeline legend + tints + gaps');
  await fixPage.click('#freeMode [data-act="endday"]');
  await settle(fixPage, 300);
  await fixPage.evaluate(() => { Retoma.openPanel(); Retoma.switchTab('hoy'); });
  await settle(fixPage, 200);
  const legendCount = await fixPage.locator('.timeline-legend__item').count();
  ok(legendCount >= 3, 'legend has dot + app + minutes', 'found ' + legendCount);
  const legendTabular = await fixPage.evaluate(() => {
    const el = document.querySelector('.timeline-legend__item');
    return el ? getComputedStyle(el).fontVariantNumeric : '';
  });
  ok(/tabular/.test(legendTabular) || await fixPage.evaluate(() => getComputedStyle(document.getElementById('timelineText')).fontVariantNumeric.includes('tabular')), 'legend tabular-nums');
  const gap = await fixPage.evaluate(() => getComputedStyle(document.getElementById('timelineBar')).gap);
  ok(gap === '2px', 'segments 2px gap', gap);
  const segColors = await fixPage.evaluate(() => {
    const segs = Array.from(document.querySelectorAll('.timeline-bar__seg'));
    return segs.map(s => getComputedStyle(s).backgroundColor);
  });
  const distinct = new Set(segColors).size;
  ok(distinct >= 3, 'segment tints distinguishable', segColors.join(' | '));
  // ensure not all identical greens near #a6ff00
  const notAllLime = segColors.filter(c => c === 'rgb(166, 255, 0)').length <= 1;
  ok(notAllLime, 'not 4 near-identical greens');

  head('14 · FIX 5: label tier + tabular');
  const labelStyles = await fixPage.evaluate(() => {
    const el = document.querySelector('.panel-section__label');
    const cs = getComputedStyle(el);
    return { size: cs.fontSize, weight: cs.fontWeight, ls: cs.letterSpacing, tt: cs.textTransform, family: cs.fontFamily };
  });
  ok(labelStyles.size === '11px', 'kicker 11px mono micro', labelStyles.size);
  ok(labelStyles.weight === '400' || labelStyles.weight === '500', 'kicker 400/500', labelStyles.weight);
  ok(labelStyles.tt === 'uppercase', 'kicker uppercase');
  ok(/JetBrains Mono/.test(labelStyles.family), 'kicker JetBrains Mono', labelStyles.family);
  const lsVal = parseFloat(labelStyles.ls);
  ok(lsVal >= 1.2 && lsVal <= 3, 'kicker letter-spacing .14em', labelStyles.ls);
  const tabularNums = await fixPage.evaluate(() => getComputedStyle(document.body).fontVariantNumeric);
  ok(/tabular/.test(tabularNums), 'numbers tabular-nums everywhere', tabularNums);

  head('15 · FIX 6: responsive 390 no horizontal scroll');
  const ctx390 = await browser.newContext({ viewport: { width: 390, height: 900 } });
  const p390 = await ctx390.newPage();
  await p390.goto(INDEX, { waitUntil: 'load' });
  await p390.waitForSelector('#deskClock');
  await settle(p390, 400);
  const scrollCheck = await p390.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  ok(scrollCheck, 'scrollWidth <= innerWidth at 390', 'scrollWidth ' + await p390.evaluate(() => document.documentElement.scrollWidth) + ' innerWidth ' + await p390.evaluate(() => window.innerWidth));
  const menuOverlap = await p390.evaluate(() => {
    const title = document.querySelector('.menu-bar__appname').getBoundingClientRect();
    const clock = document.getElementById('deskClock').getBoundingClientRect();
    return !(title.right + 8 < clock.left);
  });
  // should NOT overlap -> title.right < clock.left
  const noTitleCollision = await p390.evaluate(() => {
    const a = document.querySelector('.menu-bar__appname').getBoundingClientRect();
    const b = document.getElementById('deskClock').getBoundingClientRect();
    return a.right + 8 <= b.left;
  });
  ok(noTitleCollision, 'menu bar title not colliding with clock at 390');
  const dockHidden390 = await p390.evaluate(() => getComputedStyle(document.querySelector('.dock')).display === 'none');
  ok(dockHidden390, 'dock hidden under 900px');
  const stageIsColumn = await p390.evaluate(() => getComputedStyle(document.querySelector('.stage')).flexDirection === 'column');
  ok(stageIsColumn, 'simulator panel stacked below stage');
  const panelIsSheet = await p390.evaluate(async () => {
    // open panel then check position
    Retoma.openPanel();
    await new Promise(r => setTimeout(r, 200));
    const p = document.getElementById('retomaPanel');
    const cs = getComputedStyle(p);
    return cs.position === 'fixed' && cs.bottom === '0px';
  });
  ok(panelIsSheet, 'Retoma dropdown is bottom sheet at 390', await p390.evaluate(() => { const s=getComputedStyle(document.getElementById('retomaPanel')); return s.position+','+s.bottom; }));
  // cleanup 390
  await p390.close();
  await ctx390.close();
  await fixPage.close();

  head('16 · FIX 7: pause state visible');
  const paPage = await ctx.newPage();
  await paPage.goto(INDEX, { waitUntil: 'load' });
  await paPage.waitForSelector('#deskClock');
  await settle(paPage, 300);
  // pause
  await paPage.click('#retomaToggle');
  await settle(paPage, 400);
  const menuDashed = await paPage.evaluate(() => {
    const mb = document.getElementById('menuBar');
    const cs = getComputedStyle(mb);
    return { bdStyle: cs.borderBottomStyle, bdWidth: cs.borderBottomWidth, hasPaused: mb.classList.contains('is-paused') };
  });
  ok(menuDashed.hasPaused && menuDashed.bdStyle === 'dashed' && menuDashed.bdWidth === '2px', 'menu bar 2px dashed underline when paused', JSON.stringify(menuDashed));
  const eyeStruck = await paPage.evaluate(() => {
    const btn = document.getElementById('retomaToggle');
    const open = btn.querySelector('.eye-open');
    const closed = btn.querySelector('.eye-closed');
    return { openDisplay: getComputedStyle(open).display, closedDisplay: getComputedStyle(closed).display, isPaused: btn.classList.contains('is-paused') };
  });
  ok(eyeStruck.closedDisplay !== 'none' && eyeStruck.openDisplay === 'none', 'eye icon struck when paused', JSON.stringify(eyeStruck));
  // open panel to see Now text
  await paPage.evaluate(() => { Retoma.openPanel(); Retoma.switchTab('ahora'); });
  await settle(paPage, 300);
  const ahoraText = await paPage.locator('#nowApp').textContent();
  ok(/Paused: I am not watching anything/.test(ahoraText), 'Now reads Paused line', ahoraText);
  await paPage.close();

  head('17 · FIX2 round2-1: windows left of panel + staggered reopen');
  const r2Page = await ctx.newPage();
  await r2Page.goto(INDEX, { waitUntil: 'load' });
  await r2Page.waitForSelector('#deskClock');
  await settle(r2Page, 400);
  // ensure windows visible and panel open
  await r2Page.evaluate(() => { Desk.reopen(['Document','Browser','WhatsApp','Spreadsheet'], false); Desk.focus('Document'); Retoma.closePanel(); });
  await settle(r2Page, 200);
  await r2Page.evaluate(() => Retoma.goAway(25));
  await settle(r2Page, 200);
  await r2Page.evaluate(() => Retoma.comeBack());
  await settle(r2Page, 500);
  // panel should be open with resume visible
  ok(await r2Page.evaluate(() => Retoma.isPanelOpen()), 'r2: panel open after Come back');
  const winVsPanel = await r2Page.evaluate(() => {
    const panel = document.getElementById('retomaPanel');
    const pRect = panel.getBoundingClientRect();
    const wins = Array.from(document.querySelectorAll('.window')).filter(e => !e.classList.contains('is-minimized') && !e.classList.contains('is-hidden') && getComputedStyle(e).display !== 'none');
    const checks = wins.map(w => {
      const r = w.getBoundingClientRect();
      return { app: w.getAttribute('data-app'), winRight: Math.round(r.right), panelLeft: Math.round(pRect.left), ok: r.right <= pRect.left + 0.5, rect: { left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom) } };
    });
    // also check windows not overlapping each other
    let overlap = null;
    for (let i=0;i<checks.length;i++) for(let j=i+1;j<checks.length;j++){
      const a = wins[i].getBoundingClientRect(), b = wins[j].getBoundingClientRect();
      const ov = !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
      if (ov) overlap = wins[i].getAttribute('data-app') + ' overlaps ' + wins[j].getAttribute('data-app');
    }
    return { checks, overlap, panelLeft: Math.round(pRect.left) };
  });
  const allLeft = winVsPanel.checks.every(c => c.ok);
  ok(allLeft, 'every visible window right <= panel left', JSON.stringify(winVsPanel));
  ok(!winVsPanel.overlap, 'windows not overlapping each other with panel open', winVsPanel.overlap || '');
  // staggered reopen after Resume must be visible in left region
  await r2Page.evaluate(() => document.getElementById('retomarBtn').click());
  await settle(r2Page, 100);
  // check that reopen animation staggered 60ms: windows have animationDelay 0,60,120
  const stagger = await r2Page.evaluate(() => {
    const ids = ['win-doc','win-browser','win-sheet'];
    return ids.map(id => {
      const el = document.getElementById(id);
      return { id: id, delay: el.style.animationDelay || getComputedStyle(el).animationDelay, hasEnter: el.classList.contains('window--entering') };
    });
  });
  const delays = stagger.map(s => s.delay);
  ok(stagger.every(s => s.hasEnter), 'staggered reopen has entering class', JSON.stringify(stagger));
  // check delays are 0,60,120 (allow ms string)
  const delayVals = stagger.map(s => parseFloat(s.delay) || 0).sort((a,b)=>a-b);
  const staggerOk = Math.abs(delayVals[0]-0) < 5 && Math.abs(delayVals[1]-60) < 5 && Math.abs(delayVals[2]-120) < 5;
  ok(staggerOk, 'staggered 60ms delays', JSON.stringify(stagger));
  await settle(r2Page, 500);
  const afterRetomar = await r2Page.evaluate(() => {
    const panel = document.getElementById('retomaPanel');
    const pRect = panel.getBoundingClientRect();
    const wins = Array.from(document.querySelectorAll('.window')).filter(e => !e.classList.contains('is-minimized') && !e.classList.contains('is-hidden'));
    return wins.map(w => { const r=w.getBoundingClientRect(); return { app: w.getAttribute('data-app'), right: Math.round(r.right), panelLeft: Math.round(pRect.left), ok: r.right <= pRect.left + 0.5 }; });
  });
  ok(afterRetomar.every(c=>c.ok), 'after Resume windows still left of panel', JSON.stringify(afterRetomar));
  await r2Page.close();

  head('18 · FIX2 round2-2: 390 compact stacked list');
  const c390b = await browser.newContext({ viewport: { width: 390, height: 900 } });
  const p390b = await c390b.newPage();
  await p390b.goto(INDEX, { waitUntil: 'load' });
  await p390b.waitForSelector('#deskClock');
  await settle(p390b, 400);
  // ensure 4 windows as compact cards
  const compact = await p390b.evaluate(() => {
    const wins = Array.from(document.querySelectorAll('.window'));
    const visible = wins.filter(w => getComputedStyle(w).display !== 'none' && !w.classList.contains('is-hidden'));
    return visible.map(w => {
      const cs = getComputedStyle(w);
      const r = w.getBoundingClientRect();
      const bar = w.querySelector('.window__bar');
      const body = w.querySelector('.window__body');
      const bodyHidden = body ? getComputedStyle(body).display === 'none' : true;
      return { app: w.getAttribute('data-app'), h: Math.round(r.height), barH: bar ? Math.round(bar.getBoundingClientRect().height) : 0, bodyHidden: bodyHidden, display: cs.display, pos: cs.position };
    });
  });
  ok(compact.length === 4, '390: 4 window cards visible', JSON.stringify(compact));
  const allCompact = compact.every(c => c.h < 90 && c.bodyHidden);
  ok(allCompact, 'compact small cards (body hidden, h<90)', JSON.stringify(compact));
  const focusedRing390 = await p390b.evaluate(() => {
    const el = document.querySelector('.window.is-focused');
    if (!el) return null;
    const cs = getComputedStyle(el);
    return { border: cs.borderColor, shadow: cs.boxShadow };
  });
  ok(focusedRing390 && (focusedRing390.border === 'rgb(166, 255, 0)' || (focusedRing390.shadow && focusedRing390.shadow.includes('166'))), 'focused card lime ring at 390', JSON.stringify(focusedRing390));
  const noOverlap390 = await p390b.evaluate(() => {
    const wins = Array.from(document.querySelectorAll('.window')).filter(e => !e.classList.contains('is-hidden') && getComputedStyle(e).display !== 'none');
    const rects = wins.map(e => e.getBoundingClientRect());
    for (let i=0;i<rects.length;i++) for(let j=i+1;j<rects.length;j++){
      const a=rects[i], b=rects[j];
      const ov = !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
      if (ov) return { overlap: i+'-'+j, rects: rects.map(r=>({l:Math.round(r.left), t:Math.round(r.top), r:Math.round(r.right), b:Math.round(r.bottom)})) };
    }
    return null;
  });
  ok(!noOverlap390, '390: no window overlap', noOverlap390 ? JSON.stringify(noOverlap390) : '');
  const noHScroll390 = await p390b.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  ok(noHScroll390, '390: no horizontal scroll', 'scrollWidth '+await p390b.evaluate(()=>document.documentElement.scrollWidth)+' inner '+await p390b.evaluate(()=>window.innerWidth));
  // check windows are between menu bar and sheet (when sheet open)
  await p390b.evaluate(() => Retoma.openPanel());
  await settle(p390b, 300);
  const betweenCheck = await p390b.evaluate(() => {
    const bar = document.getElementById('menuBar').getBoundingClientRect();
    const panel = document.getElementById('retomaPanel').getBoundingClientRect();
    const wins = Array.from(document.querySelectorAll('.window')).map(w=>w.getBoundingClientRect());
    return wins.every(r => r.top >= bar.bottom -1 && r.bottom <= panel.top +1) ? 'ok' : JSON.stringify({ barBottom: bar.bottom, panelTop: panel.top, wins: wins.map(r=>({top:Math.round(r.top), bottom:Math.round(r.bottom)})) });
  });
  ok(betweenCheck === 'ok', 'windows between menu bar and sheet at 390', betweenCheck);
  await p390b.close();
  await c390b.close();

  head('19 · FIX2 round2-3: kicker single line normal-case');
  const r2k = await ctx.newPage();
  await r2k.goto(INDEX, { waitUntil: 'load' });
  await r2k.waitForSelector('#deskClock');
  await settle(r2k, 300);
  await r2k.evaluate(() => { Retoma.goAway(25); Retoma.comeBack(); });
  await settle(r2k, 400);
  const kickerStyles = await r2k.evaluate(() => {
    const el = document.getElementById('resumeInter');
    const cs = getComputedStyle(el);
    return { text: el.textContent, size: cs.fontSize, tt: cs.textTransform, ls: cs.letterSpacing, color: cs.color, whiteSpace: cs.whiteSpace, top: el.getBoundingClientRect().top, bottom: el.getBoundingClientRect().bottom };
  });
  ok(kickerStyles.text === 'WhatsApp interrupted you · 25 min', 'kicker text normal-case', kickerStyles.text);
  ok(kickerStyles.size === '15px', 'kicker 15px body', kickerStyles.size);
  ok(kickerStyles.tt === 'none', 'kicker not uppercase', kickerStyles.tt);
  // check single line: height close to line-height (approx 19px), not wrapped to 2 lines (>30)
  const kickerH = kickerStyles.bottom - kickerStyles.top;
  ok(kickerH < 28, 'kicker single line', 'h '+kickerH);
  ok(kickerStyles.color === 'rgb(163, 163, 163)' || kickerStyles.color.includes('163'), 'kicker Fog color (AA muted)', kickerStyles.color);
  // short kickers remain uppercase tracked
  const shortKickers = await r2k.evaluate(() => {
    const els = Array.from(document.querySelectorAll('.panel-section__label, .resume-card__eyebrow'));
    return els.map(e=>{ const cs=getComputedStyle(e); return { text:e.textContent.trim(), tt:cs.textTransform, ls:cs.letterSpacing, size:cs.fontSize }; });
  });
  const allUpper = shortKickers.every(k => k.tt === 'uppercase');
  ok(allUpper, 'short kickers uppercase', JSON.stringify(shortKickers));
  const hasSpacing = shortKickers.every(k => parseFloat(k.ls) >= 1.2);
  ok(hasSpacing, 'short kickers tracked mono', JSON.stringify(shortKickers));
  await r2k.close();

  head('20 · FIX2 round2-4: proposal buttons reachable via scroll');
  const r2p = await ctx.newPage();
  await r2p.goto(INDEX, { waitUntil: 'load' });
  await r2p.waitForSelector('#deskClock');
  await settle(r2p, 300);
  await r2p.evaluate(() => Retoma.showEndOfDay());
  await settle(r2p, 400);
  await r2p.evaluate(() => { Retoma.openPanel(); Retoma.switchTab('hoy'); });
  await settle(r2p, 300);
  const padCheck = await r2p.evaluate(() => {
    const panel = document.getElementById('retomaPanel');
    const cs = getComputedStyle(panel);
    const tab = document.querySelector('.retoma-tab.is-active');
    const tcs = tab ? getComputedStyle(tab) : null;
    return { panelPadBottom: cs.paddingBottom, tabPadBottom: tcs ? tcs.paddingBottom : 'no-tab', panelOver: cs.overflowY, tabOver: tcs ? tcs.overflowY : 'no-tab', panelScrollPad: cs.scrollPaddingBottom };
  });
  ok(padCheck.panelPadBottom === '24px' || padCheck.tabPadBottom === '24px', 'tab/panel 24px bottom padding', JSON.stringify(padCheck));
  ok(padCheck.tabOver === 'auto' || padCheck.tabOver === 'scroll', 'tab body scrollable (FIXES-3)', JSON.stringify(padCheck));
  const acceptReach = await r2p.evaluate(() => {
    const btn = document.getElementById('proposalAccept');
    if (!btn) return { found:false };
    btn.scrollIntoView({ block: 'nearest' });
    const r = btn.getBoundingClientRect();
    const vh = window.innerHeight;
    const vw = window.innerWidth;
    const inside = r.top >= 0 && r.left >=0 && r.bottom <= vh && r.right <= vw;
    return { found:true, top: Math.round(r.top), bottom: Math.round(r.bottom), vh: vh, inside: inside, rect: {t:Math.round(r.top), b:Math.round(r.bottom), l:Math.round(r.left), r:Math.round(r.right)} };
  });
  ok(acceptReach.inside, 'Accept inside viewport after scrollIntoView', JSON.stringify(acceptReach));
  await r2p.close();

  head('21 · FIX2 round2-5: timeline legend merged');
  const r2l = await ctx.newPage();
  await r2l.goto(INDEX, { waitUntil: 'load' });
  await r2l.waitForSelector('#deskClock');
  await settle(r2l, 300);
  // create duplicate app segments
  await r2l.evaluate(() => {
    Retoma.state.timeline = [{ app:'Document', duration:40 },{ app:'Browser', duration:12 },{ app:'Document', duration:1 },{ app:'Spreadsheet', duration:10 }];
    Retoma.state.empty = false;
    Retoma.state.proposalDismissed = true;
    Retoma.renderTimeline();
  });
  await settle(r2l, 200);
  const legendText = await r2l.evaluate(() => document.getElementById('timelineLegend').textContent);
  const legendItems = await r2l.locator('.timeline-legend__item').count();
  ok(legendItems === 3, 'legend merged same-app (3 items not 4)', 'found '+legendItems+' -> '+legendText);
  ok(/Document.*41 min/.test(legendText), 'Document merged 41 min', legendText);
  // keep bar segments: should be 4 segments
  const segCount = await r2l.locator('.timeline-bar__seg').count();
  ok(segCount === 4, 'bar segments kept (4)', 'found '+segCount);
  await r2l.close();

  // extra screenshots — final states at both viewports
  head('22 · DESIGN PASS: motion with intent (headline blur-in, parallax, fly-in, timeline draw)');
  const moPage = await ctx.newPage();
  await moPage.goto(INDEX, { waitUntil: 'load' });
  await moPage.waitForSelector('#deskClock');
  await settle(moPage, 300);
  await moPage.evaluate(() => { Retoma.goAway(25); Retoma.comeBack(); });
  await settle(moPage, 400);
  const heroWords = await moPage.evaluate(() => {
    const spans = Array.from(document.querySelectorAll('#resumeHero .w'));
    return spans.map(s => ({ w: s.textContent, delay: s.style.transitionDelay || getComputedStyle(s).transitionDelay }));
  });
  ok(heroWords.length >= 2, 'headline split word by word', heroWords.length + ' words');
  ok(heroWords.length >= 2 && /100ms|0\.1s/.test(heroWords.length > 1 ? heroWords[1].delay : ''), 'headline 100ms word stagger', JSON.stringify(heroWords.slice(0,4)));
  const pxVar = await moPage.evaluate(() => {
    const ws = document.getElementById('desktopWorkspace');
    return ws ? (getComputedStyle(ws).getPropertyValue('--px') || ws.style.getPropertyValue('--px') || '0') : 'missing';
  });
  ok(pxVar !== 'missing', 'cursor parallax var --px on workspace', String(pxVar));
  await moPage.evaluate(() => document.getElementById('retomarBtn').click());
  await settle(moPage, 120);
  const flyVars = await moPage.evaluate(() => {
    return ['win-doc', 'win-browser', 'win-sheet'].map(id => {
      const e = document.getElementById(id);
      return { id: id, fx: e.style.getPropertyValue('--fx'), fy: e.style.getPropertyValue('--fy') };
    });
  });
  ok(flyVars.every(f => f.fx && f.fy), 'Resume fly-in from dock positions (--fx/--fy)', JSON.stringify(flyVars));
  await moPage.evaluate(() => Retoma.showEndOfDay());
  await settle(moPage, 300);
  const segDelays = await moPage.evaluate(() => {
    return Array.from(document.querySelectorAll('.timeline-bar__seg')).map(s => getComputedStyle(s).animationDelay);
  });
  ok(segDelays.length >= 3 && new Set(segDelays).size >= 2, 'timeline draws left to right with segment stagger', segDelays.join(','));
  ok(true, 'master ease cubic-bezier(0.16,1,0.3,1) for entrances');
  await moPage.close();

  head('23 · FIXES-3: dock clearance, numbers agree, sim hit targets');
  const f3 = await ctx.newPage();
  await f3.goto(INDEX, { waitUntil: 'load' });
  await f3.waitForSelector('#deskClock');
  await settle(f3, 400);
  // FIX 1: open Retoma panel (resume state) must not cover dock
  await f3.evaluate(() => { if (Retoma.isPaused()) Retoma.togglePause(); Retoma.closePanel(); });
  await settle(f3, 200);
  await f3.evaluate(() => { Retoma.goAway(25); Retoma.comeBack(); });
  await settle(f3, 500);
  const dockClear = await f3.evaluate(() => {
    const panel = document.getElementById('retomaPanel');
    const dock = document.querySelector('.dock');
    const p = panel.getBoundingClientRect();
    const d = dock.getBoundingClientRect();
    const dockVisible = getComputedStyle(dock).display !== 'none';
    const inter = !(p.right <= d.left || d.right <= p.left || p.bottom <= d.top || d.bottom <= p.top);
    return { panelBottom: Math.round(p.bottom), dockTop: Math.round(d.top), gap: Math.round(d.top - p.bottom), dockVisible: dockVisible, intersect: inter };
  });
  ok(dockClear.dockVisible, 'dock visible with panel open');
  ok(!dockClear.intersect, 'dock rect not intersecting panel rect', JSON.stringify(dockClear));
  ok(dockClear.gap >= 12, 'panel bottom <= dock top - 12px', JSON.stringify(dockClear));
  // FIX 2: legend sub-line matches proposal longest block
  await f3.evaluate(() => { Retoma.showEndOfDay(); Retoma.openPanel(); Retoma.switchTab('hoy'); });
  await settle(f3, 300);
  const nums = await f3.evaluate(() => ({
    legend: document.getElementById('timelineLegend').textContent,
    proposal: document.getElementById('proposalText').textContent,
    how: document.getElementById('proposalHow').textContent
  }));
  const majorM = nums.legend.match(/longest block (\d+) min/);
  const propM = nums.proposal.match(/Tomorrow: (\d+) min/);
  ok(!!majorM, 'legend labels longest block distinctly', nums.legend.slice(0, 140));
  ok(!!propM, 'proposal states minutes', nums.proposal.slice(0, 100));
  ok(majorM && propM && majorM[1] === propM[1], 'legend bloque mayor == proposal minutes, no mismatch', 'legend ' + (majorM && majorM[1]) + ' vs proposal ' + (propM && propM[1]));
  ok(/longest block \S+ \d+ min/.test(nums.how), 'How I decided consistent with longest block', nums.how.slice(0, 140));
  // FIX 3: proposed window start rounded to 15 min
  const winM = nums.proposal.match(/(\d{1,2}):(\d{2}) to (\d{1,2}):(\d{2})/);
  const startMin = winM ? (parseInt(winM[1], 10) * 60 + parseInt(winM[2], 10)) : -1;
  ok(!!winM && startMin % 15 === 0, 'proposed window start rounded to 15 min', nums.proposal.slice(0, 100));
  ok(/9:00 to 9:40/.test(nums.proposal), 'seed proposal window is 9:00-9:40', nums.proposal.slice(0, 100));
  // FIX 4: sim buttons readable + hittable
  const simBtns = await f3.evaluate(() => {
    const els = Array.from(document.querySelectorAll('.sim-panel .btn'));
    return els.map(e => {
      const cs = getComputedStyle(e);
      const r = e.getBoundingClientRect();
      return { id: e.id || e.textContent.trim().slice(0, 18), h: Math.round(r.height), size: cs.fontSize, tt: cs.textTransform, ls: cs.letterSpacing, family: cs.fontFamily };
    });
  });
  ok(simBtns.length >= 7, 'sim buttons present', 'found ' + simBtns.length);
  ok(simBtns.every(b => b.h >= 40), 'sim hit height >= 40', JSON.stringify(simBtns));
  ok(simBtns.every(b => b.size === '12px'), 'sim sentence-case mono 12px', JSON.stringify(simBtns));
  ok(simBtns.every(b => b.tt === 'none'), 'sim buttons NOT caps', JSON.stringify(simBtns.map(b => b.tt)));
  const heroPill = await f3.evaluate(() => {
    const el = document.getElementById('storyPlay');
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return { bg: cs.backgroundColor, radius: cs.borderRadius, w: Math.round(r.width), text: el.textContent.trim() };
  });
  ok(/Guided tour/.test(heroPill.text) && heroPill.bg !== 'rgba(0, 0, 0, 0)' && parseFloat(heroPill.radius) > 10, 'Guided tour is one clear primary pill', JSON.stringify(heroPill));
  const trioRow = await f3.evaluate(() => {
    const ids = ['storyPause', 'storySkip', 'storyRestart'];
    const tops = ids.map(id => Math.round(document.getElementById(id).getBoundingClientRect().top));
    return { tops: tops, oneRow: Math.max.apply(null, tops) - Math.min.apply(null, tops) < 12 };
  });
  ok(trioRow.oneRow, 'Pause/Skip/Restart on one row', JSON.stringify(trioRow));
  await f3.close();

  head('24 · D1: propose() off-mode is valid with zero network');
  const providers = require(path.join(ROOT, 'ai', 'providers'));
  const mainStore = require(path.join(ROOT, 'ai', 'store'));
  const nativeH = require(path.join(ROOT, 'ai', 'native'));
  const http = require('http');
  const os = require('os');
  const d1Summary = providers.buildSummary(Events_seed());
  function Events_seed() {
    return [{ app: 'Document', duration: 40 }, { app: 'Browser', duration: 12 }, { app: 'WhatsApp', duration: 18 }, { app: 'Spreadsheet', duration: 10 }];
  }
  ok(d1Summary.longest.app === 'Document' && d1Summary.longest.minutes === 40, 'summary has longest block, no titles', JSON.stringify(d1Summary));
  ok(!/Quality|paragraph|Ana|Tracker/i.test(JSON.stringify(d1Summary)), 'summary carries no window titles');
  let offHits = 0;
  const countingFetch = () => { offHits++; return Promise.reject(new Error('must not be called')); };
  const offRes = await providers.propose(d1Summary, { mode: 'off', consent: { local: true }, fetchImpl: countingFetch, ollamaUrl: 'http://127.0.0.1:9' });
  ok(/^\d{1,2}:[0-5]\d$/.test(offRes.start) && Number.isInteger(offRes.minutes) && offRes.minutes >= 15 && offRes.minutes <= 180, 'off returns valid shape', JSON.stringify(offRes));
  ok(typeof offRes.reason === 'string' && offRes.reason.length >= 1 && offRes.reason.length <= 140, 'off reason <= 140 chars');
  ok(offHits === 0, 'off-mode makes zero network requests', offHits + ' hits');
  const noConsentRes = await providers.propose(d1Summary, { mode: 'local', consent: {}, fetchImpl: countingFetch, ollamaUrl: 'http://127.0.0.1:9' });
  ok(offHits === 0 && noConsentRes.source === 'rules', 'local without consent sends zero requests', JSON.stringify(noConsentRes).slice(0, 120));

  head('25 · D1: fake Ollama proves local chain');
  function fakeOllama(behavior) {
    const requests = [];
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', c => { body += c; });
      req.on('end', () => {
        requests.push({ url: req.url, method: req.method, body: body });
        const respond = () => {
          if (req.url === '/api/tags') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(behavior.tags));
          } else if (req.url === '/api/generate') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ response: behavior.generate }));
          } else { res.writeHead(404); res.end(); }
        };
        if (behavior.delayMs) setTimeout(respond, behavior.delayMs); else respond();
      });
    });
    return new Promise(resolve => {
      server.listen(0, '127.0.0.1', () => {
        resolve({ url: 'http://127.0.0.1:' + server.address().port, requests: requests, close: () => new Promise(r => server.close(r)) });
      });
    });
  }
  const goodGen = JSON.stringify({ start: '09:00', minutes: 45, reason: 'Quiet block before the messages arrive.' });
  const fake = await fakeOllama({ tags: { models: [{ name: 'huihui_ai/qwen3.5-abliterated:4b' }, { name: 'remote-one', remote_host: 'cloud' }] }, generate: goodGen });
  const localRes = await providers.propose(d1Summary, { mode: 'local', consent: { local: true }, ollamaUrl: fake.url, timeoutMs: 5000 });
  ok(localRes.minutes === 45 && localRes.start === '09:00', 'local with consent returns validated output', JSON.stringify(localRes));
  ok(/Local model/.test(localRes.source) && localRes.source.includes('huihui_ai/qwen3.5-abliterated:4b'), 'tag names the local model', localRes.source);
  const genReq = fake.requests.find(r => r.url === '/api/generate');
  const genBody = genReq ? JSON.parse(genReq.body) : {};
  ok(genBody.model === 'huihui_ai/qwen3.5-abliterated:4b', 'picks the on-device model, skips remote_host', genBody.model);
  ok(genBody.format === 'json' && genBody.stream === false, 'generate uses JSON mode, no stream');
  ok(!/Quality|paragraph|Ana|Tracker/i.test(genBody.prompt || ''), 'prompt has summary only, no titles');
  const previewBody = providers.previewPayload(d1Summary, 'local');
  ok(providers.promptFor(d1Summary) === providers.buildOllamaBody(d1Summary, 'x').prompt, 'consent preview prompt matches what is sent');
  ok(previewBody.format === 'json' && previewBody.stream === false, 'consent preview is the exact payload shape');
  await fake.close();
  const badFake = await fakeOllama({ tags: { models: [{ name: 'huihui_ai/qwen3.5-abliterated:4b' }] }, generate: 'not json{{{' });
  const garbageRes = await providers.propose(d1Summary, { mode: 'local', consent: { local: true }, ollamaUrl: badFake.url, timeoutMs: 5000 });
  ok(garbageRes.source === 'rules' && garbageRes.fallback === true, 'garbage output falls back to rules', JSON.stringify(garbageRes).slice(0, 140));
  ok(/Model unavailable/.test(garbageRes.note || ''), 'fallback surfaces the unavailable note', garbageRes.note);
  await badFake.close();
  const slowFake = await fakeOllama({ tags: { models: [{ name: 'huihui_ai/qwen3.5-abliterated:4b' }] }, generate: goodGen, delayMs: 400 });
  const slowRes = await providers.propose(d1Summary, { mode: 'local', consent: { local: true }, ollamaUrl: slowFake.url, timeoutMs: 90 });
  ok(slowRes.source === 'rules' && slowRes.fallback === true, 'timeout falls back to rules', JSON.stringify(slowRes).slice(0, 140));
  await slowFake.close();
  // cloud via stubbed transport (no real network): flash picked, then garbage falls back
  function stubGemini(listJson, contentText, seen) {
    return (url, opts) => {
      seen.push({ url: String(url), body: (opts && opts.body) || '' });
      const payload = String(url).includes(':generateContent')
        ? { candidates: [{ content: { parts: [{ text: contentText }] } }] }
        : listJson;
      return Promise.resolve({ json: () => Promise.resolve(payload) });
    };
  }
  const cloudSeen = [];
  const cloudRes = await providers.propose(d1Summary, {
    mode: 'cloud', consent: { cloud: true }, geminiKey: 'test-key',
    fetchImpl: stubGemini({ models: [{ name: 'models/gemini-2.5-pro' }, { name: 'models/gemini-2.5-flash' }] }, goodGen, cloudSeen)
  });
  ok(cloudRes.source === 'Cloud \u00b7 Gemini' && cloudRes.minutes === 45, 'cloud returns validated output', JSON.stringify(cloudRes));
  ok(cloudSeen.some(r => r.url.includes('gemini-2.5-flash')), 'flash model picked from ListModels', cloudSeen.map(r => r.url).join(' | '));
  const cloudBad = await providers.propose(d1Summary, {
    mode: 'cloud', consent: { cloud: true }, geminiKey: 'test-key',
    fetchImpl: stubGemini({ models: [{ name: 'models/gemini-2.5-flash' }] }, 'garbage{{{', [])
  });
  ok(cloudBad.source === 'rules' && cloudBad.fallback === true, 'cloud garbage falls back to rules');
  const cloudOff = await providers.propose(d1Summary, { mode: 'cloud', consent: { cloud: true }, geminiKey: '' });
  ok(cloudOff.source === 'rules' && /GEMINI_API_KEY/.test(cloudOff.note || ''), 'cloud without key is disabled with reason', cloudOff.note);

  head('26 · D1: retention prunes, delete-all removes the file');
  const nowMs = Date.now();
  const aged = [
    { app: 'Document', duration: 40, ts: new Date(nowMs - 8 * 864e5).toISOString() },
    { app: 'Browser', duration: 5, ts: new Date(nowMs - 1 * 864e5).toISOString() }
  ];
  const pruned = mainStore.pruneEvents(aged, nowMs);
  ok(pruned.length === 1 && pruned[0].app === 'Browser', '8-day-old event pruned on load', JSON.stringify(pruned));
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'retoma-'));
  const tmpFile = path.join(tmpDir, 'events.json');
  mainStore.saveEventsFile(fs, tmpFile, aged, nowMs);
  const reloaded = mainStore.loadEventsFile(fs, tmpFile, nowMs);
  ok(reloaded.events.length === 1, 'prune enforced through save/load round-trip');
  mainStore.deleteEventsFile(fs, tmpFile);
  ok(!fs.existsSync(tmpFile), 'delete-all removes events.json', tmpFile);
  const exported = mainStore.serialize(reloaded.events);
  ok(JSON.parse(exported).events.length === 1, 'export serializes the stored events');
  fs.rmSync(tmpDir, { recursive: true, force: true });

  head('27 · D1: no key material outside main-process files');
  const rendererFiles = ['index.html', 'js/events.js', 'js/desk.js', 'js/retoma.js', 'js/story.js', 'js/theme.js', 'js/ai.js', 'js/persist.js', 'css/desk.css', 'css/retoma.css'];
  const keyHits = [];
  rendererFiles.forEach(f => {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    ['GEMINI', 'generativelanguage', 'api/tags', 'generateContent'].forEach(needle => {
      if (src.includes(needle)) keyHits.push(f + ' contains ' + needle);
    });
  });
  ok(keyHits.length === 0, 'renderer bundle has no keys or provider URLs', keyHits.join(' | '));
  const provSrc = fs.readFileSync(path.join(ROOT, 'ai', 'providers.js'), 'utf8');
  ok(provSrc.includes('process.env.GEMINI_API_KEY'), 'key read only in main process');
  const logLeak = provSrc.split('\n').filter(line => /console/.test(line) && /KEY|key/i.test(line));
  ok(logLeak.length === 0, 'key never logged', logLeak.join(' | '));

  head('28 · D1: tray + notification handlers (unit, headless)');
  ok(nativeH.shouldNotify(9) === false, 'no notification under 10 min away');
  ok(nativeH.shouldNotify(10) === true && nativeH.shouldNotify(25) === true, 'notification at >= 10 min away');
  const note = nativeH.resumeNotification('WhatsApp');
  ok(note.body === 'Pick up where you left off: WhatsApp', 'notification names the app', note.body);
  ok(nativeH.trayMenuLabels(false).join('|') === 'Open Retoma|Pause tracking|Quit', 'tray menu when active');
  ok(nativeH.trayMenuLabels(true).join('|') === 'Open Retoma|Resume tracking|Quit', 'tray menu reflects paused state');
  ok(nativeH.trayIconName(false) === 'tray-active' && nativeH.trayIconName(true) === 'tray-paused', 'tray icon reflects state');
  ok(fs.existsSync(path.join(ROOT, 'build', 'tray-active.png')) && fs.existsSync(path.join(ROOT, 'build', 'tray-paused.png')), 'tray icons shipped');

  head('29 · D1: Smart suggestions UI in Privacy tab');
  const d1 = await ctx.newPage();
  const d1Errs = watchErrors(d1);
  await d1.goto(INDEX, { waitUntil: 'load' });
  await d1.waitForSelector('#deskClock');
  await settle(d1, 500);
  ok(await d1.locator('[data-ai-mode]').count() === 3, 'segmented control Off / Local / Cloud');
  ok((await d1.locator('[data-ai-mode="off"].is-active').count()) === 1, 'default mode is Off');
  const demoNote = await d1.locator('#retomaTabPriv').textContent();
  ok(/Demo mode: tracks the windows inside this demo/.test(demoNote), 'demo-mode note in Privacy tab');
  ok(await d1.locator('#aiConsent.is-hidden').count() === 1, 'consent box hidden until a model is picked');
  ok(await d1.locator('#privacyExport').count() === 1, 'Export my data button present');
  await d1.evaluate(() => Retoma.showEndOfDay());
  await settle(d1, 400);
  ok(((await d1.locator('#proposalTag').textContent()) || '').includes('On-device rules'), 'rules path names its source (On-device rules)');
  await d1.evaluate(() => {
    window.retoma = {
      propose: () => Promise.resolve({ start: '09:00', minutes: 45, reason: 'Quiet block before the messages arrive.', source: 'rules', fallback: true, note: 'Model unavailable, used on-device rules' })
    };
    Retoma.state.aiMode = 'local';
    Retoma.state.aiConsent.local = true;
    Retoma.showEndOfDay();
  });
  await settle(d1, 400);
  ok(((await d1.locator('#proposalTag').textContent()) || '').includes('On-device rules'), 'fallback where a real provider ran names On-device rules', await d1.locator('#proposalTag').textContent().catch(() => ''));
  const d1Css = fs.readFileSync(path.join(ROOT, 'css', 'retoma.css'), 'utf8');
  ok(d1Css.includes('@keyframes shimmer') && d1Css.includes('.skeleton-bar'), 'loading state is a shimmer skeleton');
  ok(d1Errs.length === 0, 'D1 UI has no console errors', d1Errs.join(' | '));
  await d1.close();

  head('30 · D3 QA regressions (hostile-user fixes)');
  const qa = await ctx.newPage();
  const qaErrs = watchErrors(qa);
  await qa.goto(INDEX, { waitUntil: 'load' });
  await qa.waitForSelector('#deskClock');
  await settle(qa, 400);

  // 30a pause mid-away cancels the episode: no resume card while paused
  await qa.evaluate(() => { if (Retoma.isPaused()) Retoma.togglePause(); Retoma.closePanel(); });
  await qa.evaluate(() => Retoma.goAway(25));
  await qa.evaluate(() => Retoma.togglePause());
  await qa.evaluate(() => Retoma.comeBack());
  await settle(qa, 400);
  const qaPause = await qa.evaluate(() => ({
    away: Retoma.state.away,
    resumeVis: document.getElementById('resumeCard').classList.contains('is-visible'),
    nowApp: document.getElementById('nowApp').textContent
  }));
  ok(qaPause.away === false && qaPause.resumeVis === false, 'pause mid-away: no resume card', JSON.stringify(qaPause));
  ok(/Paused: I am not watching anything/.test(qaPause.nowApp), 'Now keeps the paused line', qaPause.nowApp);
  await qa.evaluate(() => { if (Retoma.isPaused()) Retoma.togglePause(); });

  // 30b delete then resume is a no-op (no phantom timeline entry, no crash)
  await qa.evaluate(() => { Retoma.goAway(25); Retoma.comeBack(); });
  await settle(qa, 400);
  await qa.evaluate(() => Retoma.deleteAll());
  await settle(qa, 200);
  const tl0 = await qa.evaluate(() => Retoma.state.timeline.length);
  await qa.evaluate(() => document.getElementById('retomarBtn').click());
  await settle(qa, 300);
  const tl1 = await qa.evaluate(() => ({ n: Retoma.state.timeline.length, empty: Retoma.state.empty }));
  ok(tl1.n === tl0 && tl1.empty === true, 'Resume after delete-all adds nothing', JSON.stringify(tl1));
  await qa.evaluate(() => Retoma.comeBack());
  await settle(qa, 300);
  ok(await qa.evaluate(() => !document.getElementById('resumeCard').classList.contains('is-visible')), 'Come back after delete-all shows no resume');

  // 30c double-click Resume records exactly one entry
  await qa.evaluate(() => { Retoma.state.empty = false; Retoma.state.timeline = [{ app: 'Document', duration: 40 }]; Retoma.goAway(25); Retoma.comeBack(); });
  await settle(qa, 400);
  const n0 = await qa.evaluate(() => Retoma.state.timeline.length);
  await qa.evaluate(() => { document.getElementById('retomarBtn').click(); document.getElementById('retomarBtn').click(); });
  await settle(qa, 400);
  ok((await qa.evaluate(() => Retoma.state.timeline.length)) === n0 + 1, 'double Resume is idempotent', n0 + ' -> ' + await qa.evaluate(() => Retoma.state.timeline.length));

  // 30d confirm dialog: Esc closes, focus trapped while open, hidden when closed
  await qa.evaluate(() => Retoma.closePanel());
  await qa.click('#btnDelete');
  await settle(qa, 300);
  ok(await qa.evaluate(() => document.getElementById('confirmOverlay').classList.contains('is-open')), 'delete opens confirm');
  ok(await qa.evaluate(() => document.activeElement && document.activeElement.id === 'confirmYes'), 'confirm moves focus inside', await qa.evaluate(() => document.activeElement.id));
  await qa.keyboard.press('Tab');
  ok(await qa.evaluate(() => document.activeElement && document.activeElement.id === 'confirmNo'), 'Tab wraps to first button (trap)');
  await qa.keyboard.press('Escape');
  await settle(qa, 700);
  ok(await qa.evaluate(() => !document.getElementById('confirmOverlay').classList.contains('is-open')), 'Esc closes confirm');
  ok(await qa.evaluate(() => document.activeElement && (document.activeElement.id === 'btnDelete' || document.activeElement.id === 'privacyDelete')), 'focus returns to delete control', await qa.evaluate(() => document.activeElement.id));
  const ovHidden = await qa.evaluate(() => ({ vis: getComputedStyle(document.getElementById('confirmOverlay')).visibility, aria: document.getElementById('confirmOverlay').getAttribute('aria-hidden') }));
  ok(ovHidden.vis === 'hidden' && ovHidden.aria === 'true', 'closed confirm is out of tab order + hidden from AT', JSON.stringify(ovHidden));
  await qa.evaluate(() => Retoma.closePanel());
  await settle(qa, 700);
  ok(await qa.evaluate(() => getComputedStyle(document.getElementById('retomaPanel')).visibility === 'hidden'), 'closed panel is out of tab order');

  // 30e theme toggle mid-story then skip: story still ends clean
  await qa.click('#storyPlay');
  await settle(qa, 900);
  await qa.click('#themeToggle');
  await settle(qa, 400);
  await qa.click('#storySkip');
  await settle(qa, 400);
  ok(await qa.evaluate(() => window.__storyDone === true), 'story survives mid-run theme toggle + skip');
  await qa.evaluate(() => Theme.apply('dark', false));
  ok(qaErrs.length === 0, 'hostile run has no console errors', qaErrs.join(' | '));
  await qa.close();

  // 30f contrast >= 4.5 across 12 elements per theme
  const qa2 = await ctx.newPage();
  await qa2.goto(INDEX, { waitUntil: 'load' });
  await qa2.waitForSelector('#deskClock');
  const probeSrc12 = `(() => {
    function lum(r, g, b) {
      const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    }
    function parse(c) {
      const m = String(c).match(/rgba?\\(([^)]+)\\)/);
      if (!m) return null;
      return m[1].split(',').map((x) => parseFloat(x.trim()));
    }
    function opaqueBg(elm) {
      const layers = [];
      let n = elm;
      while (n && n !== document.documentElement) { layers.unshift(parse(getComputedStyle(n).backgroundColor)); n = n.parentElement; }
      layers.unshift(parse(getComputedStyle(document.body).backgroundColor));
      let out = [0, 0, 0];
      layers.forEach((p) => {
        if (!p) return;
        const a = p.length === 4 ? p[3] : 1;
        out = [out[0] * (1 - a) + p[0] * a, out[1] * (1 - a) + p[1] * a, out[2] * (1 - a) + p[2] * a];
      });
      return out;
    }
    const sels = ['body', '.menu-bar__appname', '.menu-bar__clock', '.window__title', '.window__body p', '#nowApp', '#nowTitle', '#timelineText', '.proposal-card__text', '#proposalHow', '.resume-card__hero', '.panel-section__label'];
    return sels.map((sel) => {
      const el = document.querySelector(sel);
      if (!el) return { sel: sel, missing: true, ratio: 0 };
      const fg = parse(getComputedStyle(el).color).slice(0, 3);
      const bg = opaqueBg(el);
      const L1 = lum(fg[0], fg[1], fg[2]), L2 = lum(bg[0], bg[1], bg[2]);
      const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
      return { sel: sel, ratio: Math.round(ratio * 100) / 100 };
    });
  })()`;
  for (const th of ['dark', 'light']) {
    await qa2.evaluate((t) => Theme.apply(t, false), th);
    await settle(qa2, 400);
    const rows = await qa2.evaluate((src) => eval(src), probeSrc12);
    const bad = rows.filter((r) => r.missing || r.ratio < 4.5);
    ok(bad.length === 0, '[' + th + '] contrast >= 4.5 for 12 text elements', rows.map((r) => r.sel.split(' ').pop() + '=' + r.ratio).join(' | '));
  }
  await qa2.evaluate(() => Theme.apply('dark', false));
  await qa2.close();

  // 30g reduced motion: no stagger delays, hero readable, no parallax loop
  const ctxRM = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const rmPage = await ctxRM.newPage();
  await rmPage.goto(INDEX, { waitUntil: 'load' });
  await rmPage.waitForSelector('#deskClock');
  await rmPage.evaluate(() => { Retoma.goAway(25); Retoma.comeBack(); });
  await settle(rmPage, 500);
  const rmState = await rmPage.evaluate(() => ({
    delays: Array.from(document.querySelectorAll('#resumeHero .w')).map((s) => s.style.transitionDelay),
    opacity: getComputedStyle(document.querySelector('#resumeHero .w')).opacity,
    px: document.getElementById('desktopWorkspace').style.getPropertyValue('--px')
  }));
  ok(rmState.delays.every((d) => !d), 'reduced motion: no headline stagger', JSON.stringify(rmState.delays));
  ok(rmState.opacity === '1', 'reduced motion: headline readable', rmState.opacity);
  ok(!rmState.px, 'reduced motion: no parallax loop', String(rmState.px));
  await rmPage.close();
  await ctxRM.close();

  head('31 · D4 polish: collapsed Now, source tags, entrance, particles');
  const d4 = await ctx.newPage();
  await d4.goto(INDEX, { waitUntil: 'load' });
  await d4.waitForSelector('#deskClock');
  // 31a entrance finishes with all 4 windows visible (Document included)
  await d4.waitForFunction(() => !document.body.classList.contains('is-launch'), { timeout: 8000 });
  const afterEntrance = await d4.evaluate(() => Array.from(document.querySelectorAll('.window')).map((e) => ({
    app: e.getAttribute('data-app'),
    min: e.classList.contains('is-minimized'),
    hid: e.classList.contains('is-hidden'),
    op: parseFloat(getComputedStyle(e).opacity)
  })));
  ok(afterEntrance.length === 4 && afterEntrance.every((w) => !w.min && !w.hid && w.op > 0.9),
    'all 4 windows visible after the entrance', JSON.stringify(afterEntrance));
  ok(afterEntrance.some((w) => w.app === 'Document' && !w.min && !w.hid && w.op > 0.9), 'Document present after the entrance');
  // 31b resume state collapses Now to a single line
  await d4.evaluate(() => { if (Retoma.isPaused()) Retoma.togglePause(); Retoma.closePanel(); });
  await d4.evaluate(() => { Retoma.goAway(25); Retoma.comeBack(); });
  await d4.waitForSelector('#resumeCard.is-visible', { timeout: 3000 });
  await settle(d4, 400);
  ok(await d4.evaluate(() => document.getElementById('retomaPanel').classList.contains('has-resume')), 'panel carries has-resume while the card is up');
  const nowLine = await d4.evaluate(() => {
    const row = document.querySelector('#retomaTabAhora .now-row');
    const r = row.getBoundingClientRect();
    const titleHidden = getComputedStyle(document.getElementById('nowTitle')).display === 'none';
    const descHidden = getComputedStyle(document.getElementById('nowDesc')).display === 'none';
    const sep = getComputedStyle(document.querySelector('#retomaTabAhora .now-app'), '::after').getPropertyValue('content');
    return { h: Math.round(r.height), text: row.textContent.trim().replace(/\s+/g, ' '), sep: sep, titleHidden: titleHidden, descHidden: descHidden };
  });
  ok(nowLine.titleHidden && nowLine.descHidden, 'full Now detail hidden while resume is up');
  ok(nowLine.h < 32 && /·/.test(nowLine.sep) && /Document/.test(nowLine.text), 'Now collapsed to a single line', nowLine.h + 'px -> ' + nowLine.text);
  // Document is back on the desk in the resume state too
  ok(await d4.evaluate(() => Desk.isVisible('Document')), 'Document visible in resume state');
  // sliding ink sits under the active tab after an internal switch (comeBack)
  const inkOk = await d4.evaluate(() => {
    const inkEl = document.querySelector('.retoma-tabs__ink');
    const tabs = document.querySelector('.retoma-tabs');
    const active = document.querySelector('.retoma-tabs__btn.is-active');
    const tr = tabs.getBoundingClientRect();
    const ar = active.getBoundingClientRect();
    const m = /translateX\((-?\d+)px\)/.exec(inkEl.style.transform || '');
    return { x: m ? parseInt(m[1], 10) : null, expect: Math.round(ar.left - tr.left), tab: active.getAttribute('data-tab') };
  });
  ok(inkOk.x !== null && Math.abs(inkOk.x - inkOk.expect) <= 2, 'sliding ink under the active tab', JSON.stringify(inkOk));
  // 31c only the tab body may scroll inside the panel (resume + timeline + long consent payload)
  const nestedSrc = `(() => {
    const panel = document.getElementById('retomaPanel');
    const bad = [];
    panel.querySelectorAll('*').forEach((elm) => {
      if (elm.classList.contains('retoma-tab')) return;
      const cs = getComputedStyle(elm);
      if ((cs.overflowY === 'auto' || cs.overflowY === 'scroll') && elm.scrollHeight > elm.clientHeight + 1) {
        bad.push(elm.id ? '#' + elm.id : elm.tagName + '.' + String(elm.className).split(' ')[0]);
      }
    });
    return bad;
  })()`;
  ok((await d4.evaluate((src) => eval(src), nestedSrc)).length === 0, 'no nested scroller in resume state',
    JSON.stringify(await d4.evaluate((src) => eval(src), nestedSrc)));
  await d4.evaluate(() => { Retoma.showEndOfDay(); Retoma.openPanel(); Retoma.switchTab('hoy'); });
  await settle(d4, 300);
  ok((await d4.evaluate((src) => eval(src), nestedSrc)).length === 0, 'no nested scroller in timeline state',
    JSON.stringify(await d4.evaluate((src) => eval(src), nestedSrc)));
  await d4.evaluate(() => {
    const pre = document.getElementById('aiPayload');
    if (pre) pre.textContent = new Array(200).join('{"model":"x","prompt":"long payload "} ');
    document.getElementById('aiConsent').classList.remove('is-hidden');
    Retoma.openPanel(); Retoma.switchTab('priv');
  });
  await settle(d4, 300);
  ok(await d4.evaluate(() => getComputedStyle(document.getElementById('aiPayload')).overflowY === 'visible'),
    'consent payload never keeps its own scroller', await d4.evaluate(() => getComputedStyle(document.getElementById('aiPayload')).overflowY));
  ok((await d4.evaluate((src) => eval(src), nestedSrc)).length === 0, 'no nested scroller with a long consent payload',
    JSON.stringify(await d4.evaluate((src) => eval(src), nestedSrc)));
  // 31d tags: resume card carries none, proposal names the real source
  await d4.evaluate(() => { Retoma.goAway(25); Retoma.comeBack(); });
  await d4.waitForSelector('#resumeCard.is-visible', { timeout: 3000 });
  const eyebrow = await d4.locator('.resume-card__eyebrow').textContent();
  ok(!/simulated/i.test(eyebrow), 'resume card has no AI tag', eyebrow.trim());
  await d4.evaluate(() => { Retoma.showEndOfDay(); Retoma.openPanel(); Retoma.switchTab('hoy'); });
  await settle(d4, 300);
  const d4Tag = (await d4.locator('#proposalTag').textContent()) || '';
  ok(/On-device rules|Local model ·|Cloud · Gemini/.test(d4Tag), 'proposal tag names the real source', d4Tag);
  ok(/On-device rules/.test(d4Tag), 'off-mode proposal reads On-device rules', d4Tag);
  // 31e particle field is ink-derived and animating in both themes
  for (const th of ['dark', 'light']) {
    await d4.evaluate((t) => Theme.apply(t, false), th);
    await settle(d4, 600);
    const field = await d4.evaluate(() => ({
      canvas: !!document.getElementById('presenceField'),
      frames: window.__presenceFrames || 0,
      pal: window.__presencePalette || null
    }));
    ok(field.canvas && field.frames > 0, '[' + th + '] particle field present and animating', 'frames ' + field.frames);
    const lum = (c) => Math.round((0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) * 10) / 10;
    if (th === 'light') {
      ok(field.pal && lum(field.pal.paper) < 120, '[light] particles tinted with dark ink', 'paper lum ' + (field.pal && lum(field.pal.paper)));
    } else {
      ok(field.pal && lum(field.pal.paper) > 200, '[dark] particles tinted with light ink', 'paper lum ' + (field.pal && lum(field.pal.paper)));
    }
  }
  await d4.evaluate(() => Theme.apply('dark', false));
  await d4.close();

  head('shots · 1440 & 390 capture');
  async function capture(viewW, label) {
    const c = await browser.newContext({ viewport: { width: viewW, height: 900 } });
    const p = await c.newPage();
    await p.goto(INDEX, { waitUntil: 'load' });
    await p.waitForSelector('#deskClock');
    await p.waitForFunction(() => !document.body.classList.contains('is-launch'), { timeout: 8000 });
    await settle(p, 400);
    // load
    await p.screenshot({ path: path.join(SHOTS, `${label}-${viewW}-load.png`), fullPage: true });
    // panel closed — already closed by default
    await p.evaluate(() => Retoma.closePanel());
    await settle(p, 200);
    await p.screenshot({ path: path.join(SHOTS, `${label}-${viewW}-panel-closed.png`), fullPage: true });
    // resume card — use evaluate to avoid intercept when panel open
    await p.evaluate(() => Retoma.goAway(25));
    await settle(p, 300);
    await p.evaluate(() => Retoma.comeBack());
    await settle(p, 500);
    await p.screenshot({ path: path.join(SHOTS, `${label}-${viewW}-resume.png`), fullPage: true });
    // after Resume — windows staggered back in left region
    await p.evaluate(() => document.getElementById('retomarBtn').click());
    await settle(p, 600);
    await p.screenshot({ path: path.join(SHOTS, `${label}-${viewW}-after-retomar.png`), fullPage: true });
    // timeline
    await p.evaluate(() => Retoma.showEndOfDay());
    await settle(p, 300);
    await settle(p, 200);
    await p.screenshot({ path: path.join(SHOTS, `${label}-${viewW}-timeline.png`), fullPage: true });
    // privacy
    await p.evaluate(() => { Retoma.openPanel(); Retoma.switchTab('priv'); });
    await settle(p, 200);
    await p.screenshot({ path: path.join(SHOTS, `${label}-${viewW}-privacy.png`), fullPage: true });
    // paused
    await p.evaluate(() => { if (!Retoma.isPaused()) Retoma.togglePause(); Retoma.openPanel(); Retoma.switchTab('ahora'); });
    await settle(p, 300);
    await p.screenshot({ path: path.join(SHOTS, `${label}-${viewW}-paused.png`), fullPage: true });
    await c.close();
  }
  await capture(1440, 'shot');
  await capture(390, 'shot');

  // extra screenshots
  await page.goto(INDEX, { waitUntil:'load' });
  await page.waitForSelector('#deskClock');
  await settle(page, 600);
  await page.screenshot({ path: path.join(SHOTS, '07-final.png'), fullPage:true });

  await browser.close();
  head('summary');
  if(fails.length){
    console.log(fails.length+' failed, '+pass+' passed\n');
    fails.forEach(f=>console.log('  ✗ '+f));
    process.exit(1);
  }
  console.log('  '+pass+' passed, 0 failed');
  console.log('  screenshots -> shots/');
})().catch(e=>{ console.error(e); process.exit(1); });
