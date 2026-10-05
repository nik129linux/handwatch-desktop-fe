/* tests/acceptance.js — Playwright acceptance gate */
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

  // need a known prev app for resume card: switch to Documento then away
  // ensure current is not Documento then set to Documento
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
  // ensure windows were minimized during away, now retomar reopens
  await page.click('#retomarBtn');
  await settle(page, 800);
  const visibleDocs = await page.evaluate(() => {
    const els = document.querySelectorAll('.window');
    return Array.from(els).map(e => ({ app: e.getAttribute('data-app'), hidden: e.classList.contains('is-minimized') || e.classList.contains('is-hidden'), visible: !e.classList.contains('is-minimized') && !e.classList.contains('is-hidden') }));
  });
  const docVis = visibleDocs.find(v => v.app === 'Documento');
  ok(docVis && docVis.visible, 'Retomar reopens windows (Documento visible)', JSON.stringify(visibleDocs));
  await page.screenshot({ path: path.join(SHOTS, '02-resume.png'), fullPage: true });

  // secondary Empezar de cero also hides card: test once
  await page.click('#freeMode [data-act="away"]');
  await settle(page, 300);
  await page.click('#freeMode [data-act="return"]');
  await page.waitForSelector('#resumeCard.is-visible', { timeout: 3000 });
  await page.click('#startFreshBtn');
  await settle(page, 400);
  ok(await page.locator('#resumeCard.is-visible').count() === 0, 'Empezar de cero hides resume card');

  head('3 · Pausar prevents timeline entry');
  // ensure not paused, record timeline length, then pause and switch
  await page.evaluate(() => { if (Retoma.isPaused()) Retoma.togglePause(); });
  await settle(page, 200);
  const lenBefore = await page.evaluate(() => Retoma.state.timeline.length);
  await page.click('#retomaToggle');
  await settle(page, 300);
  const isPaused = await page.evaluate(() => Retoma.isPaused());
  ok(isPaused === true, 'status icon shows paused');
  const tooltipVisible = await page.evaluate(() => {
    const t = document.querySelector('.retoma-toggle__tooltip');
    const btn = document.getElementById('retomaToggle');
    return btn.classList.contains('is-paused');
  });
  ok(tooltipVisible, 'paused state has is-paused class');

  await page.click('#freeMode [data-act="switch"]');
  await settle(page, 400);
  const lenAfter = await page.evaluate(() => Retoma.state.timeline.length);
  ok(lenAfter === lenBefore, 'Cambiar de app while paused creates NO timeline entry', lenBefore + ' -> ' + lenAfter);
  // resume for next tests
  await page.click('#retomaToggle');
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

  // Aceptar closes it
  await page.click('#proposalAccept');
  await settle(page, 300);
  ok(await page.locator('#proposalCard.is-hidden').count() === 1, 'Aceptar closes proposal');

  // show again and test No, gracias
  await page.click('#freeMode [data-act="endday"]');
  await settle(page, 300);
  await page.click('#proposalDecline');
  await settle(page, 300);
  ok(await page.locator('#proposalCard.is-hidden').count() === 1, 'No, gracias closes proposal');
  await page.screenshot({ path: path.join(SHOTS, '04-timeline.png'), fullPage: true });

  head('5 · Borrar todo requires confirm then empty state');
  // ensure timeline has data before delete
  await page.click('#freeMode [data-act="endday"]');
  await settle(page, 300);
  // click Borrar todo
  await page.click('#btnDelete');
  await settle(page, 200);
  ok(await page.locator('#confirmOverlay.is-open').count() === 1, 'Borrar todo opens confirm');
  await page.click('#confirmYes');
  await settle(page, 600);
  ok(await page.locator('#emptyState').isVisible().catch(()=>false), 'empty state visible after delete');
  const emptyHidden = await page.locator('#timeline.is-hidden').count();
  // timeline may be hidden class, check emptyState not hidden
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
  const sub = await storyPage.locator('#subtitle').textContent();
  // last subtitle should be the privacy one
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
  // reset
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
  // allow google fonts link? ignore
  // filter out comment-like? already stripped
  // also tokens.css is allowed, but we scanned not it
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
  // also check index copy via innerText would be caught in source already
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
