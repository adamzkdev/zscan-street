// Responsive arcade screenshots and controller regressions. Run against `npm run dev`.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import puppeteer from 'puppeteer-core';

const base = process.env.BASE ?? 'http://localhost:3012';
const out = 'shots/port-party/arcade-review';
await fs.mkdir(out, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, args: ['--use-angle=metal'],
});
const errors = [];
const pause = ms => new Promise(r => setTimeout(r, ms));
const page = await browser.newPage();
page.on('pageerror', e => errors.push(e.message));
const view = (width, height, touch = true) => page.setViewport({ width, height, isMobile: touch, hasTouch: touch, deviceScaleFactor: 1 });
const shot = name => page.screenshot({ path: `${out}/${name}.png` });
try {
  for (const [name, w, h, touch] of [['phone', 390, 844, true], ['small-phone', 320, 568, true], ['landscape', 844, 390, true], ['tablet', 768, 1024, true], ['desktop', 1440, 900, false]]) {
    await view(w, h, touch);
    await page.goto(`${base}/partylab.html?hub`);
    await page.waitForSelector('.pt-hub .pt-mg');
    await pause(750);
    assert.equal(await page.$('.or-card'), null, `${name}: menu must work in either orientation`);
    const overflow = await page.$eval('.pt-hub', e => e.scrollWidth - e.clientWidth);
    assert.ok(overflow <= 1, `${name}: hub overflow ${overflow}`);
    await shot(`hub-${name}`);
    await page.click('[data-a="minis"]');
    await page.waitForSelector('.pt-sel:not(.pt-hidden)');
    await pause(500);
    assert.ok(await page.$eval('.sel-card', e => e.getBoundingClientRect().height > 80), `${name}: game cards keep their image height`);
    await shot(`select-${name}`);
    if (w < 700) {
      await page.click('.sel-card[data-i="3"]');
      await pause(400);
      assert.equal(await page.$eval('.pt-sel', e => e.classList.contains('sheet')), true);
      await page.click('[data-fold="rules"] summary');
      assert.ok((await page.$eval('.sel-detail', e => e.innerText)).includes('DIVE'));
      await shot(`detail-${name}`);
    }
    console.log(`PASS menu ${name}`);
  }

  // Exercise real multitouch against an isolated Stage, without AI or a WebGL renderer.
  await view(844, 390);
  await page.goto(`${base}/partylab.html?hub`);
  await page.waitForSelector('.pt-hub');
  await page.evaluate(async () => {
    const { Stage } = await import('/src/party/host.ts');
    const root = document.createElement('div');
    root.className = 'pt-root';
    root.style.zIndex = '5000';
    document.body.append(root);
    const stage = new Stage(root);
    const scene = { update() {}, draw() {} };
    stage.show(scene, ['left', 'right', 'up', 'down', 'a', 'b'], false, true, { a: 'jump', b: 'shove' });
    window.controllerQA = { stage, scene, root };
  });
  await pause(200);
  const point = async selector => page.$eval(selector, e => { const r = e.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; });
  const cdp = await page.createCDPSession();
  const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map((p, i) => ({ radiusX: 3, radiusY: 3, ...p, id: p.id ?? i + 1 })) });
  const held = () => page.evaluate(() => window.controllerQA.stage.input.held('a'));
  const a = await point('[style*="5000"] [data-pad="a"]');
  const zone = { x: 550, y: 210, id: 2 };
  await touch('touchStart', [{ ...a, id: 1 }]);
  assert.equal(await held(), true, 'action begins');
  await touch('touchStart', [{ ...a, id: 1 }, zone]);
  await touch('touchEnd', [zone]);
  assert.equal(await held(), true, 'second finger keeps action held');
  await touch('touchEnd', []);
  assert.equal(await held(), false, 'last finger releases action');
  await touch('touchStart', [{ ...a, id: 1 }]);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  assert.equal(await held(), false, 'interrupted touch releases action');
  assert.equal(await page.$('[style*="5000"] [data-pad].on'), null, 'interrupted touch clears visual');
  await touch('touchCancel', []);
  await touch('touchStart', [{ x: 110, y: 250, id: 1 }]);
  await touch('touchMove', [{ x: 155, y: 250, id: 1 }]);
  assert.equal(await page.evaluate(() => window.controllerQA.stage.input.held('right')), true, 'stick steers');
  await touch('touchCancel', []);
  assert.equal(await page.evaluate(() => window.controllerQA.stage.input.stick), null, 'cancel releases stick');
  await page.evaluate(() => {
    const { stage, scene } = window.controllerQA;
    stage.show(scene, ['left', 'right', 'up', 'down', 'a', 'b'], false, 'x', { a: 'jump', b: 'shove' });
  });
  assert.equal(await page.$eval('[style*="5000"] .pt-zone', e => e.classList.contains('pt-x')), true, 'same buttons can switch to steering rail');
  await page.evaluate(() => { window.controllerQA.stage.dispose(); window.controllerQA.root.remove(); });
  console.log('PASS multitouch, cancelled input, blur, stick and steering mode');

  for (const game of ['coins', 'laser', 'kart', 'roll', 'stack']) {
    await view(844, 390);
    await page.goto(`${base}/partylab.html?g=${game}&auto&cine=0&seed=42`);
    await page.waitForFunction(() => window.labPhase?.phase === 'play', { timeout: 60000 });
    await pause(750);
    await shot(`game-${game}`);
    if (game === 'coins') {
      await view(390, 844);
      await pause(300);
      await shot('game-portrait');
      const bounds = await page.$eval('.pt-stage', e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
      assert.ok(Math.abs(bounds.w - 390) <= 1 && Math.abs(bounds.h - 844) <= 1, 'rotated game fills portrait phone');
      await view(844, 390);
      await page.waitForFunction(() => window.labPhase?.phase === 'podium', { timeout: 60000 });
      await pause(700);
      await shot('podium');
      await page.waitForFunction(() => window.lab?.done, { timeout: 30000 });
      const results = await page.evaluate(() => window.lab.results);
      assert.equal(new Set(results[0].order).size, 4, 'full game produces four distinct finishing places');
    }
    console.log(`PASS gameplay ${game}`);
  }
  assert.deepEqual(errors, [], 'no browser runtime errors');
  console.log(`PASS all arcade checks; screenshots: ${out}`);
} finally {
  await page.goto('about:blank').catch(() => {});
  await browser.close();
}
