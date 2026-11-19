// Drawer regressions: touch close after scrolling, rotation, backdrop, native accordions and focus.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import puppeteer from 'puppeteer-core';
const base = process.env.BASE ?? 'http://localhost:3012';
const out = 'shots/port-party/menu-review';
await fs.mkdir(out, { recursive: true });
const browser = await puppeteer.launch({ executablePath: process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=metal'] });
const p = await browser.newPage();
const errors = [];
p.on('pageerror', e => errors.push(e.message));
const wait = ms => new Promise(r => setTimeout(r, ms));
let touch = true;
const click = async selector => { const e = await p.waitForSelector(selector, { visible: true }); await (touch ? e.tap() : e.click()); };
const shown = () => p.$eval('.sel-drawer', d => d.open);
const screenshot = name => p.screenshot({ path: `${out}/${name}.png` });
try {
  for (const [name, width, height, coarse] of [['phone',390,844,true],['small-phone',320,568,true],['landscape',844,390,true],['tablet',768,1024,true],['desktop',1440,900,false]]) {
    touch = coarse;
    await p.setViewport({ width, height, hasTouch: touch, isMobile: touch, deviceScaleFactor: 1 });
    await p.goto(`${base}/party.html?game=coins`);
    await p.waitForSelector('.sel-drawer[open]');
    await wait(400);
    assert.equal(await p.$eval('[data-fold="rules"]', e => e.open), false);
    assert.equal(await p.$eval('[data-fold="settings"]', e => e.open), false);
    assert.equal(await p.$eval('[data-fold="stakes"]', e => e.open), false);
    const pinned = await p.evaluate(() => ['.sel-x','.sel-go'].map(s => {
      const e = document.querySelector(s), r = e.getBoundingClientRect();
      return r.width >= 44 && r.height >= 44 && r.top >= 0 && r.bottom <= innerHeight + 1 && !!document.elementFromPoint(r.x + r.width/2,r.y + r.height/2)?.closest(s);
    }));
    assert.deepEqual(pinned,[true,true],`${name}: close and play stay visible and tappable`);
    await screenshot(`${name}-drawer`);
    await click('[data-fold="rules"] summary');
    assert.equal(await p.$eval('[data-fold="rules"]', e => e.open), true);
    assert.equal(await p.$('.pt-playing'), null, 'accordion never starts game');
    await click('[data-fold="settings"] summary');
    await click('[data-s="level"][data-v="2"]');
    await click('[data-s="mrounds"][data-v="3"]');
    assert.match(await p.$eval('.sel-settings-summary', e => e.textContent), /Hard.*3 rounds/);
    await click('[data-fold="stakes"] summary');
    await click('[data-s="stakev"]:not(:disabled)');
    assert.equal(await p.$eval('[data-fold="stakes"]',e=>e.open),true,'stake update preserves accordion');
    await p.$eval('.sel-scroll', e => e.scrollTop=e.scrollHeight);
    await wait(150);
    await screenshot(`${name}-expanded`);
    await click('.sel-x');
    assert.equal(await shown(),false,`${name}: close after scroll`);
    assert.equal(await p.$eval('.pt-sel',e=>e.classList.contains('pt-hidden')),true,'direct card returns to hall');
    await click('[data-a="board-setup"]');
    assert.equal(await p.$eval('.pt-board-options',e=>e.open),false,'hall settings start collapsed');
    await click('.pt-board-options > summary');
    const turns = await p.$eval('[data-a="turns"]:last-child',e=>e.dataset.v);
    await click('[data-a="turns"]:last-child');
    assert.equal(await p.$eval('.pt-board-options',e=>e.open),true,'changing settings preserves accordion');
    assert.ok((await p.$eval('.pt-board-options > summary',e=>e.textContent)).includes(`${turns} turns`));
    assert.equal(await p.evaluate(()=>document.activeElement?.dataset.v),turns,'settings preserve keyboard focus');
    assert.ok(await p.$eval('.pt-hub',e=>e.scrollWidth-e.clientWidth<=1),'expanded hall has no horizontal overflow');
    await click('.pt-board-options > summary');
    await screenshot(`${name}-board-setup`);
    await click('[data-a="board-close"]');
    assert.equal(await p.$eval('.pt-board-dialog',e=>e.open),false,'board drawer closes');
    assert.equal(await p.evaluate(()=>document.activeElement?.dataset.a),'board-setup','board focus returns to thumbnail');
    await p.$eval('.pt-library',e=>e.scrollIntoView({block:'start'}));
    await screenshot(`${name}-hall`);
    await click('[data-a="minis"]');
    assert.equal(await shown(),false);
    await click('.sel-card[data-i="3"]');
    assert.equal(await shown(),true);
    await click('.sel-x');
    assert.equal(await shown(),false);
    assert.equal(await p.$eval('.pt-sel',e=>e.classList.contains('pt-hidden')),false,'browser card returns to grid');
    assert.equal(await p.evaluate(()=>document.activeElement?.getAttribute('data-i')),'3','focus returns to selected card');
    await click('.sel-card[data-i="0"]');
    await wait(300);
    const back = await p.$eval('.sel-drawer',e=>{const r=e.getBoundingClientRect();return r.x>2?{x:Math.max(1,r.x/2),y:80}:{x:10,y:Math.max(1,r.y/2)};});
    await (touch?p.touchscreen.tap(back.x,back.y):p.mouse.click(back.x,back.y));
    assert.equal(await shown(),false,`${name}: tap outside closes`);
    await click('.sel-card[data-i="0"]');
    await p.keyboard.press('Escape');
    assert.equal(await shown(),false,`${name}: Escape closes`);
    if (!touch) {
      await p.focus('.sel-card[data-i="0"]');
      await p.keyboard.press('Enter');
      assert.equal(await shown(),true,'Enter opens details, not game');
      for (let n=0;n<12;n++) {
        await p.keyboard.press('Tab');
        // Native dialogs permit a browser-chrome stop (reported as body), never background controls.
        assert.equal(await p.evaluate(()=>document.activeElement===document.body||!!document.activeElement?.closest('.sel-drawer')),true,'Tab cannot reach background controls');
      }
      await p.$eval('.sel-back',e=>e.focus());
      assert.equal(await p.evaluate(()=>document.activeElement?.classList.contains('sel-back')),false,'background stays inert');
      await p.focus('[data-fold="rules"] summary');
      await p.keyboard.press('Space');
      assert.equal(await p.$eval('[data-fold="rules"]',e=>e.open),true,'keyboard accordion');
      assert.equal(await p.$('.pt-playing'),null);
      await p.keyboard.press('Escape');
    }
    console.log(`PASS ${name}: close, pinned controls, accordions, settings, backdrop, Escape, focus`);
  }
  touch=true;
  await p.setViewport({width:390,height:844,hasTouch:true,isMobile:true,deviceScaleFactor:1});
  await p.goto(`${base}/party.html?game=coins`);
  await p.waitForSelector('.sel-drawer[open]');
  await p.setViewport({width:844,height:390,hasTouch:true,isMobile:true,deviceScaleFactor:1});
  await wait(300);
  await click('.sel-x');assert.equal(await shown(),false,'rotation keeps close working');
  await click('[data-a="minis"]');await click('.sel-card[data-i="3"]');
  await click('[data-s="track"][data-v="marina"]');
  assert.match(await p.$eval('.sel-arena',e=>e.textContent),/MARINA RAIN/);
  await click('.sel-go');await p.waitForSelector('.pt-playing');
  assert.equal(await p.$('.sel-drawer[open]'),null,'starting a game dismisses native modal');
  await click('.pt-quit');await p.waitForSelector('.pt-pause');await click('.pt-pause [data-yes]');
  await p.waitForFunction(()=>!document.querySelector('.pt-playing'));
  assert.deepEqual(errors,[]);
  console.log('PASS rotation and launch → pause → leave; no browser errors');
} finally {await p.goto('about:blank').catch(()=>{});await browser.close();}
