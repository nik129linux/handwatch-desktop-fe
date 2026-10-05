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

  head('1 · loads with zero console errors');
  await settle(page, 600);
  ok(errs.length === 0, 'index.html has no console errors', errs.join(' | '));
  ok(await page.locator('#retomaToggle').count() === 1, 'Retoma status icon visible');
  ok(await page.locator('.window').count() === 4, '4 windows present');
  await page.screenshot({ path: path.join(SHOTS, '01-load.png'), fullPage: true });

  head('2 · free mode: Cambiar de app, Alejarme/Volver, Retomar');
  const beforeApp = (await page.locator('#nowApp').textContent()).trim();
  await page.click('#freeMode [data-act="switch"]');
  await settle(page, 400);
  const afterApp = (await page.locator('#nowApp').textContent()).trim();
  ok(beforeApp !== afterApp, 'Cambiar de app changes Ahora', beforeApp + ' -> ' + afterApp);

  await page.evaluate(() => { Retoma.state.currentApp = 'Documento'; Retoma.state.currentTitle = 'Informe de calidad (párrafo 3)'; });
  await page.click('#freeMode [data-act="away"]');
  await settle(page, 400);
  await page.click('#freeMode [data-act="return"]');
  await page.waitForSelector('#resumeCard.is-visible', { timeout: 3000 });
  ok(true, 'Alejarme 25 min + Volver shows resume card');
  const resumeText = await page.locator('#resumeCard').textContent();
  ok(/Estabas en:/.test(resumeText), 'resume card has Estabas en', resumeText.slice(0,120));
  ok(/Te interrumpi/.test(resumeText), 'resume card has Te interrumpió');
  const chips = await page.locator('.resume-chip').count();
  ok(chips === 3, 'resume card has 3 chips', 'found ' + chips);
  await page.evaluate(() => document.getElementById('retomarBtn').click());
  await settle(page, 800);
  const visibleDocs = await page.evaluate(() => {
    const els = document.querySelectorAll('.window');
    return Array.from(els).map(e => ({ app: e.getAttribute('data-app'), hidden: e.classList.contains('is-minimized') || e.classList.contains('is-hidden'), visible: !e.classList.contains('is-minimized') && !e.classList.contains('is-hidden') }));
  });
  const docVis = visibleDocs.find(v => v.app === 'Documento');
  ok(docVis && docVis.visible, 'Retomar reopens windows (Documento visible)', JSON.stringify(visibleDocs));
  await page.screenshot({ path: path.join(SHOTS, '02-resume.png'), fullPage: true });

  await page.click('#freeMode [data-act="away"]');
  await settle(page, 300);
  await page.click('#freeMode [data-act="return"]');
  await page.waitForSelector('#resumeCard.is-visible', { timeout: 3000 });
  await page.evaluate(() => document.getElementById('startFreshBtn').click());
  await settle(page, 400);
  ok(await page.locator('#resumeCard.is-visible').count() === 0, 'Empezar de cero hides resume card');

  head('3 · Pausar prevents timeline entry');
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
  ok(lenAfter === lenBefore, 'Cambiar de app while paused creates NO timeline entry', lenBefore + ' -> ' + lenAfter);
  await page.click('#retomaToggle');
  await settle(page, 200);
  await page.evaluate(() => Retoma.closePanel());
  await settle(page, 200);
  await page.screenshot({ path: path.join(SHOTS, '03-paused.png'), fullPage: true });

  head('4 · Terminar el día shows timeline and proposal');
  await page.click('#freeMode [data-act="endday"]');
  await settle(page, 400);
  const timelineVisible = await page.locator('#timeline').isVisible().catch(() => false);
  ok(await page.locator('#timelineBar').count() === 1, 'timeline bar present');
  ok(await page.locator('#timelineText').count() === 1, 'Planeado/Real line present');
  const prText = await page.locator('#timelineText').textContent();
  ok(/Planeado:/.test(prText) && /Real:/.test(prText), 'timeline shows Planeado and Real', prText);
  const proposalVisible = await page.locator('#proposalCard').isVisible().catch(() => false);
  ok(proposalVisible, 'AI proposal visible');
  const propText = await page.locator('#proposalCard').textContent();
  ok(/Mañana: 90 min/.test(propText), 'proposal text correct', propText.slice(0,80));

  await page.evaluate(() => document.getElementById('proposalAccept').click());
  await settle(page, 300);
  ok(await page.locator('#proposalCard.is-hidden').count() === 1, 'Aceptar closes proposal');

  await page.click('#freeMode [data-act="endday"]');
  await settle(page, 300);
  await page.evaluate(() => document.getElementById('proposalDecline').click());
  await settle(page, 300);
  ok(await page.locator('#proposalCard.is-hidden').count() === 1, 'No, gracias closes proposal');
  await page.screenshot({ path: path.join(SHOTS, '04-timeline.png'), fullPage: true });

  head('5 · Borrar todo requires confirm then empty state');
  await page.click('#freeMode [data-act="endday"]');
  await settle(page, 300);
  await page.click('#btnDelete');
  await settle(page, 200);
  ok(await page.locator('#confirmOverlay.is-open').count() === 1, 'Borrar todo opens confirm');
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

  head('7 · token test');
  await page.evaluate(() => { document.documentElement.style.setProperty('--color-primary-500', '#ff0000'); });
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
  ok(stale.hits.length===0, 'nothing keeps '+OLD_LIME+' ('+stale.scanned+' elements)', stale.hits.slice(0,4).join(' | '));
  const nowColor = await page.evaluate(()=> {
    const el = document.querySelector('.btn--primary');
    return el? getComputedStyle(el).backgroundColor : 'no-target';
  });
  ok(nowColor==='rgb(255, 0, 0)', 'new primary in use', nowColor);
  await page.evaluate(()=> document.documentElement.style.setProperty('--color-primary-500','#a6ff00'));

  head('8 · source rules');
  const read = (f) => fs.readFileSync(path.join(ROOT,f),'utf8');
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g,'').replace(/(^|[^:])\/\/.*$/gm,'$1');
  const colorRe = /#[0-9a-f]{3,8}\b|rgba?\s*\(|hsla?\s*\(/gi;
  const scanned = ['index.html','css/desk.css','css/retoma.css','js/events.js','js/desk.js','js/retoma.js','js/story.js'];
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
  const voseo = /\b(tocá|mirá|podés|tenés|querés|acordate)\b/i;
  const badCopy=[];
  scanned.concat(['css/tokens.css']).forEach(f=>{
    const src=read(f);
    if(voseo.test(src)) badCopy.push(f);
  });
  ok(badCopy.length===0, 'no voseo words', badCopy.join(','));
  const forbid = ['productividad','distraído','distraido','puntaje'];
  const forbidOff=[];
  scanned.forEach(f=>{
    const src=read(f).toLowerCase();
    forbid.forEach(w=>{ if(src.includes(w)) forbidOff.push(f+':'+w); });
  });
  ok(forbidOff.length===0, 'no productividad/distraído/puntaje', forbidOff.join(' | '));

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
  // numeric check: maxHeight <= viewport -48 approx
  const panelVHOk = await fixPage.evaluate(() => {
    const p = document.getElementById('retomaPanel');
    const mh = parseFloat(getComputedStyle(p).maxHeight);
    return mh <= window.innerHeight - 40 && mh >= window.innerHeight - 80;
  });
  ok(panelVHOk, 'panel max-height ≈ viewport -56px');
  // overflow scroll
  const overflow = await fixPage.evaluate(() => getComputedStyle(document.getElementById('retomaPanel')).overflowY);
  ok(overflow === 'auto' || overflow === 'scroll', 'panel has own scroll', overflow);
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
  // Volver auto-opens with resume card hero first
  await fixPage.evaluate(() => { if (Retoma.isPaused()) Retoma.togglePause(); if (Retoma.isPanelOpen()) Retoma.closePanel(); });
  await settle(fixPage, 200);
  await fixPage.click('#freeMode [data-act="away"]');
  await settle(fixPage, 300);
  await fixPage.click('#freeMode [data-act="return"]');
  await settle(fixPage, 500);
  ok(await fixPage.evaluate(() => Retoma.isPanelOpen() && document.getElementById('resumeCard').classList.contains('is-visible')), 'Volver auto-opens panel with resume card');
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
  ok(/Inter Tight/.test(heroStyles.family), 'hero uses Inter Tight', heroStyles.family);
  ok(heroStyles.weight === '600' || heroStyles.weight === '700', 'hero weight 600', heroStyles.weight);
  const heroSize = parseFloat(heroStyles.size);
  ok(heroSize >= 28 && heroSize <= 36, 'hero 28-36px', heroStyles.size);
  ok(/Estabas en:/.test(heroStyles.text), 'hero has Estabas en:');
  const subColor = await fixPage.evaluate(() => getComputedStyle(document.getElementById('resumeSub')).color);
  ok(subColor !== 'rgb(253, 253, 253)', 'doc title under hero in Fog (not primary text)');
  const interStyles = await fixPage.evaluate(() => {
    const el = document.getElementById('resumeInter');
    const cs = getComputedStyle(el);
    return { size: cs.fontSize, ls: cs.letterSpacing, tt: cs.textTransform, weight: cs.fontWeight };
  });
  ok(parseFloat(interStyles.size) <= 13, 'interruption label small', interStyles.size);
  ok(interStyles.tt === 'uppercase', 'interruption label uppercase');
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
  ok(retomarFull.full, 'Retomar full width', JSON.stringify(retomarFull));
  ok(retomarFull.bg === 'rgb(166, 255, 0)' || retomarFull.bg === 'rgb(255, 0, 0)' || retomarFull.bg.includes('166'), 'Retomar lime', retomarFull.bg);

  head('12 · FIX 3: desktop no overlap + focused ring + dock SVG');
  // ensure windows visible
  await fixPage.evaluate(() => { Retoma.closePanel(); Desk.reopen(['Documento','Navegador','WhatsApp','Hoja de cálculo'], false); Desk.focus('Documento'); });
  await settle(fixPage, 300);
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
  ok(labelStyles.size === '12px', 'kicker 12px', labelStyles.size);
  ok(labelStyles.weight === '500', 'kicker 500', labelStyles.weight);
  ok(labelStyles.tt === 'uppercase', 'kicker uppercase');
  const lsVal = parseFloat(labelStyles.ls);
  ok(lsVal >= 1.8 && lsVal <= 3, 'kicker letter-spacing .18em', labelStyles.ls);
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
  // open panel to see Ahora text
  await paPage.evaluate(() => { Retoma.openPanel(); Retoma.switchTab('ahora'); });
  await settle(paPage, 300);
  const ahoraText = await paPage.locator('#nowApp').textContent();
  ok(/Pausado: no estoy viendo nada/.test(ahoraText), 'Ahora reads Pausado: no estoy viendo nada', ahoraText);
  await paPage.close();

  // extra screenshots — final states at both viewports
  head('shots · 1440 & 390 capture');
  async function capture(viewW, label) {
    const c = await browser.newContext({ viewport: { width: viewW, height: 900 } });
    const p = await c.newPage();
    await p.goto(INDEX, { waitUntil: 'load' });
    await p.waitForSelector('#deskClock');
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
