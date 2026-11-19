// Game catalog: images, the Online card (enabled: rooms), real table launchers and return to the hall.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import puppeteer from 'puppeteer-core';
const base = process.env.BASE ?? 'http://localhost:3012';
const out = 'shots/port-party/hall-review';
await fs.mkdir(out, {recursive:true});
const browser = await puppeteer.launch({executablePath:process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-angle=metal']});
const p = await browser.newPage();
const errors = [];
p.on('pageerror',e=>errors.push(e.message));
const wait = ms=>new Promise(r=>setTimeout(r,ms));
let touch = true;
// (a panel that redraws itself as its data comes in, the latest block, a portrait: tap the new one)
const click = async s=>{for(let i=0;;i++){try{const e=await p.waitForSelector(s,{visible:true});await(touch?e.tap():e.click());return;}catch(err){if(i>=3||!/detached|not clickable|not visible/i.test(String(err)))throw err;await wait(400);}}};
try {
  for(const [name,width,height,coarse] of [['small',320,568,true],['phone',390,844,true],['landscape',844,390,true],['tablet',768,1024,true],['desktop',1440,900,false]]) {
    touch=coarse;
    await p.setViewport({width,height,hasTouch:touch,isMobile:touch,deviceScaleFactor:1});
    await p.goto(`${base}/party.html?tab=board`);
    await p.waitForSelector('.pt-library');
    await wait(800);
    assert.equal(await p.$$eval('.pt-library-game',es=>es.length),4);
    await p.waitForFunction(()=>[...document.querySelectorAll('.pt-library-game img')].every(e=>e.complete&&e.naturalWidth>0));
    assert.ok(await p.$eval('.pt-hub',e=>e.scrollWidth<=e.clientWidth+1),`${name}: no horizontal overflow`);
    // (online is on: a room server beside the dev page, or the site's own origin in production)
    assert.ok(await p.$eval('.pt-onl [data-a="on-create"]',b=>!b.disabled),`${name}: online rooms enabled`);
    assert.equal(await p.$('.pt-coming-soon'),null);
    await p.$eval('.pt-library',e=>e.scrollIntoView({block:'start'}));
    await p.screenshot({path:`${out}/${name}-library.png`});
    await p.$eval('.pt-onl',e=>e.scrollIntoView({block:'center'}));
    await p.screenshot({path:`${out}/${name}-online.png`});
    await click('[data-a="board-setup"]');
    assert.ok(await p.$eval('.pt-board-dialog',e=>e.open));
    await p.keyboard.press('Escape');
    assert.equal(await p.$eval('.pt-board-dialog',e=>e.open),false);
    console.log(`PASS ${name}: catalog images, responsive layout, online card enabled, board drawer`);
  }
  touch=true;
  await p.setViewport({width:390,height:844,hasTouch:true,isMobile:true,deviceScaleFactor:1});
  for (const key of ['barons','glyph','holdem']) {
    await p.goto(`${base}/party.html?game=coins&ret=%2F%3Finterior%3Dgamehouse`);
    await p.waitForSelector('.sel-drawer[open]');await click('.sel-x');
    const link=await p.$eval(`[data-table="${key}"]`,e=>e.href);
    const ret=new URL(new URL(link).searchParams.get('ret'),base);
    assert.match(ret.pathname,/^\/party(?:\.html)?$/);
    assert.equal(ret.searchParams.get('tab'),'board');
    assert.equal(ret.searchParams.get('game'),null,'return never reopens previous mini-game');
    assert.equal(ret.searchParams.get('ret'),'/?interior=gamehouse','city return route survives');
    await Promise.all([p.waitForNavigation(),click(`[data-table="${key}"]`)]);
    await p.waitForSelector('.tl-root.on .tl-play');
    assert.equal(new URL(p.url()).searchParams.get('t'),key);
    await Promise.all([p.waitForNavigation(),click('.tl-x')]);
    await p.waitForSelector('.pt-library');
    assert.equal(await p.$('.sel-drawer[open]'),null);
    await Promise.all([p.waitForNavigation(),click(`[data-table="${key}"]`)]);
    await click('.tl-root [data-a="stake"][data-v="0"]');
    await click('.tl-play');
    await p.waitForSelector('.tl-stage',{visible:true,timeout:30000});
    await wait(1000);
    assert.ok(await p.$eval('.tl-stage',e=>e.childElementCount>0),`${key}: actual game mounted`);
    await p.screenshot({path:`${out}/${key}-launched.png`});
    console.log(`PASS ${key}: thumbnail → setup → return to hall, free game launch`);
  }
  await p.goto(`${base}/party.html?tab=board`);
  await click('[data-a="board-setup"]');await click('.pt-board-options > summary');
  await click('[data-a="table"][data-v="0"]');
  await click('.pt-setup-foot [data-a="board"]');
  await p.waitForSelector('.pt-playing',{timeout:30000});
  assert.equal(await p.$eval('.pt-board-dialog',e=>e.open),false,'board launch dismisses modal');
  await click('.pt-quit');await click('.pt-pause [data-yes]');
  await p.waitForFunction(()=>!document.querySelector('.pt-playing'));
  assert.ok(await p.$('.pt-library'));
  assert.deepEqual(errors,[]);
  console.log('PASS ZK Party launch → pause → leave; no browser runtime errors');
} finally {await p.goto('about:blank').catch(()=>{});await browser.close();}
