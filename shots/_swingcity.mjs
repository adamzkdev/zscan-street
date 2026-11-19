// The swing in the real city, in Chrome: a phone in landscape (two fingers: hold HOLD · SWING and
// look with that thumb, the left stick moves; cancel, blur, a turned phone let go; the button stays
// tappable on small screens; hidden on the map), then a desktop (no button; the right button attaches
// at the actual cursor, R from the keyboard; a long fall at speed widens the view, lands in the street
// and hands back to the walker). Screenshots in shots/port-swing/.
//   npx vite --port 3013 & PORT=3013 node shots/_swingcity.mjs
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import puppeteer from "puppeteer-core";
const base = process.env.BASE ?? `http://localhost:${process.env.PORT ?? 3013}`;
const OUT = "shots/port-swing";
await fs.mkdir(OUT, { recursive: true });
const browser = await puppeteer.launch({ executablePath: process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true, protocolTimeout: 300000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"] });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  // (the live API's rate limits on images and the presence socket are the network's, not the page's)
  if (m.type() === "error" && !/^Failed to load resource|WebSocket connection .* 429/.test(m.text())) errors.push(m.text());
});
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const snapshot = () =>
  page.evaluate(() => {
    const s = street.swing.physics;
    return { anchor: !!s.anchor, active: s.active, p: street.onFoot.camera.position.toArray(), v: s.v.toArray(), yaw: street.onFoot.heading, fov: street.onFoot.camera.fov, stick: { ...street.onFoot.stick } };
  });
/** On foot on the avenue, looking up at a tall facade (a wall several metres wide) with a hold under the centre. */
const facing = async () => {
  const candidates = await page.evaluate(() => {
    const f = street.swing.heights();
    const at = (x, z) => {
      const i = Math.floor((x - f.x0) / f.cell),
        j = Math.floor((z - f.z0) / f.cell);
      return i < 0 || j < 0 || i >= f.size || j >= f.size ? 0 : f.h[j * f.size + i];
    };
    const e = { x: 20, y: 1.8, z: 0.3 };
    const out = [];
    for (let a = 0; a < Math.PI * 2; a += 0.08)
      for (let d = 12; d < 40; d += 0.5) {
        const x = e.x - Math.sin(a) * d,
          z = e.z - Math.cos(a) * d,
          h = at(x, z);
        if (h <= 24) continue;
        // (a facade: tall here and to both sides, not a mast or a string of lanterns)
        const sx = Math.cos(a) * 2,
          sz = -Math.sin(a) * 2;
        if (at(x + sx, z + sz) > 20 && at(x - sx, z - sz) > 20) out.push({ a, pitch: Math.atan2(Math.min(h - 4, 22) - e.y, d) });
        break;
      }
    return out;
  });
  for (const c of candidates) {
    await page.evaluate((c) => {
      const w = street.onFoot;
      w.place(new w.camera.position.constructor(20, 0.2, 0.3), c.a);
      w.turn(0, c.pitch + 0.08);
    }, c);
    // (a hold is looked for a few times a second, from the frame on screen)
    const found = await page.waitForFunction(() => !!street.swing.physics.aim, { timeout: 1500, polling: 50 }).then(() => true, () => false);
    if (found) return c;
  }
  console.log("no hold found", candidates.length, await page.evaluate(() => JSON.stringify({ aim: document.querySelector(".swing-aim").className, panels: [...document.querySelectorAll("#ui .panel.open, #ui.photo, .bigmap.on")].map((e) => e.className), enabled: street.onFoot.enabled, captured: street.swing.picker.captured, size: [innerWidth, innerHeight], centre: street.swing.picker.hit(street.swing.controls.ndc(street.swing["ndc"]), street.onFoot.camera.position.clone())?.toArray() ?? null, cam: street.onFoot.camera.position.toArray() })));
  return null;
};
const ready = async () => {
  await page.goto(`${base}/?debug&theme=night`);
  await page.waitForFunction(() => window.__streetUp && window.street?.swing, { timeout: 180000 });
  await page.waitForFunction(() => !document.getElementById("boot") || document.getElementById("boot").dataset.gone, { timeout: 60000 });
  await page.evaluate(() => street.walk(true));
  await wait(1500);
  assert.ok(await facing(), "a tall facade in reach from the avenue");
  await wait(700);
};
try {
  // ---- a phone in landscape ----
  await page.setViewport({ width: 844, height: 390, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
  await ready();
  const cdp = await page.createCDPSession();
  const touch = async (type, touchPoints) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints });
  const button = await page.$eval(".swing-btn", (e) => {
    const r = e.getBoundingClientRect();
    return { id: 1, x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  const left = await page.$eval(".stick-pad", (e) => {
    const r = e.getBoundingClientRect();
    return { id: 2, x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  assert.equal(await page.evaluate(() => !!street.swing.physics.aim), true, "the real city offers a hold under the centre reticle");
  await page.evaluate(() =>
    document.querySelector(".swing-btn").addEventListener("pointerdown", () => {
      const a = street.swing.physics.anchor;
      window.aimAtShot = a ? a.clone().project(street.onFoot.camera).toArray() : null;
    }),
  );
  const launchY = (await snapshot()).p[1];
  await touch("touchStart", [button]);
  assert.equal((await snapshot()).anchor, true, "touch throws a line");
  const touchAim = await page.evaluate(() => window.aimAtShot);
  assert.ok(touchAim && Math.hypot(touchAim[0], touchAim[1]) < 0.005, "the touch line lands under the centre reticle");
  assert.equal(await page.$eval(".swing-btn", (e) => e.getAttribute("aria-pressed")), "true");
  await wait(850);
  assert.ok((await snapshot()).p[1] > launchY + 4, "the button alone launches from the street, no jump or stick needed");
  await page.screenshot({ path: `${OUT}/mobile-launch.jpg`, type: "jpeg", quality: 82 });
  await touch("touchStart", [button, left]);
  const pushed = { ...left, y: left.y - 50 };
  await touch("touchMove", [button, pushed]);
  await wait(650);
  const before = await snapshot();
  assert.ok(before.stick.y > 0.9, "the second finger on the stick pumps the swing");
  const moved = { ...button, x: button.x + 18, y: button.y - 8 };
  await touch("touchMove", [moved, pushed]);
  await wait(80);
  const after = await snapshot();
  assert.ok(Math.abs(after.yaw - before.yaw) > 0.07, "the holding thumb looks around");
  await page.screenshot({ path: `${OUT}/mobile-swing.jpg`, type: "jpeg", quality: 82 });
  await touch("touchEnd", [moved]);
  assert.equal((await snapshot()).anchor, false, "lifting the right thumb lets go");
  await touch("touchEnd", []);
  assert.deepEqual((await snapshot()).stick, { x: 0, y: 0 });
  // (wherever the swing ended, on a roof or back in the street: placed on the avenue again, which stops it)
  await wait(1500);
  assert.ok(await facing());
  assert.equal((await snapshot()).active, false, "placed somewhere new, the swing stops");
  await touch("touchStart", [button]);
  await touch("touchCancel", []);
  assert.equal(await page.$eval(".swing-btn", (e) => e.getAttribute("aria-pressed")), "false", "a cancelled touch releases the button");
  assert.equal((await snapshot()).anchor, false, "a cancelled touch lets go");
  await touch("touchStart", [button]);
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  assert.equal((await snapshot()).anchor, false, "a blur lets go");
  await touch("touchEnd", []);
  for (const [name, width, height] of [["landscape", 844, 390], ["small-landscape", 568, 320]]) {
    await page.setViewport({ width, height, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
    await wait(300);
    const fit = await page.evaluate(() => {
      const r = document.querySelector(".swing-btn").getBoundingClientRect();
      const s = document.querySelector(".stick-pad").getBoundingClientRect();
      const m = document.querySelector(".minimap")?.getBoundingClientRect();
      const apart = (a, b) => !b || b.width === 0 || a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top;
      return {
        size: r.width >= 44 && r.height >= 44,
        inside: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight,
        hit: !!document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest(".swing-btn"),
        clear: apart(r, s) && apart(r, m),
      };
    });
    assert.deepEqual(fit, { size: true, inside: true, hit: true, clear: true }, `${name}: the swing button is tappable and clear of the stick and the map`);
    // (a resize reallocates the frame's depth: picking from it before it is drawn again once left
    // the view black and every pick empty)
    assert.ok(await facing(), `${name}: holds under the reticle again after the resize`);
    await page.screenshot({ path: `${OUT}/${name}-controls.jpg`, type: "jpeg", quality: 82 });
  }
  await page.setViewport({ width: 844, height: 390, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
  await wait(300);
  await page.evaluate(() => street.swing.reset());
  assert.ok(await facing());
  await wait(500);
  await touch("touchStart", [button]);
  assert.equal((await snapshot()).anchor, true);
  await page.setViewport({ width: 390, height: 844, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
  await wait(300);
  assert.equal((await snapshot()).anchor, false, "turning the phone lets go");
  assert.equal(await page.$eval(".swing-btn", (e) => e.getAttribute("aria-pressed")), "false");
  await touch("touchEnd", []);
  await page.screenshot({ path: `${OUT}/portrait.jpg`, type: "jpeg", quality: 82 });
  await page.evaluate(() => street.walk(false));
  await wait(400);
  assert.equal(await page.$eval(".swing-btn", (e) => getComputedStyle(e).display), "none", "hidden on the map");
  assert.equal(await page.$eval(".swing-aim", (e) => getComputedStyle(e).display), "none", "no reticle on the map");

  // ---- a desktop ----
  await page.setViewport({ width: 1440, height: 900, hasTouch: false, isMobile: false, deviceScaleFactor: 1 });
  await ready();
  assert.equal(await page.$eval(".swing-btn", (e) => getComputedStyle(e).display), "none", "no touch button with a mouse");
  // with the cursor free (ZStreet's look is a drag), the line goes where the cursor is, not the centre
  await page.evaluate(() =>
    document.querySelector("#scene").addEventListener("mousedown", (e) => {
      if (e.button !== 2) return;
      const a = street.swing.physics.anchor;
      window.aimAtShot = a ? a.clone().project(street.onFoot.camera).toArray() : null;
    }),
  );
  // (the cursor somewhere a little off the centre, over the facade: the first spot with a hold under it)
  let cursor = null;
  for (const [nx, ny] of [[0.1, 0.1], [-0.1, 0.1], [0.1, -0.05], [-0.1, -0.05], [0.05, 0.2]]) {
    const x = Math.round(((nx + 1) / 2) * 1440),
      y = Math.round(((1 - ny) / 2) * 900);
    await page.mouse.move(x, y);
    await wait(200);
    if (await page.waitForFunction(() => !!street.swing.physics.aim, { timeout: 1200, polling: 50 }).then(() => true, () => false)) {
      cursor = { x, y, ndc: [((x / 1440) * 2 - 1), 1 - (y / 900) * 2] };
      break;
    }
  }
  assert.ok(cursor, "a hold under the cursor somewhere off the centre");
  assert.equal(await page.$eval(".swing-aim", (e) => e.style.transform), `translate(${cursor.x}px, ${cursor.y}px)`, "the reticle follows the cursor");
  const menu = await page.evaluate(() => !document.querySelector("#scene").dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, button: 2 })));
  assert.ok(menu, "no context menu on foot: the right button is the swing's");
  await page.mouse.down({ button: "right" });
  const mouseAim = await page.evaluate(() => window.aimAtShot);
  assert.ok(mouseAim && Math.hypot(mouseAim[0] - cursor.ndc[0], mouseAim[1] - cursor.ndc[1]) < 0.005, `the right button attaches at the actual off-centre cursor ${JSON.stringify({ mouseAim, cursor })}`);
  await wait(500);
  await page.screenshot({ path: `${OUT}/desktop-mouse.jpg`, type: "jpeg", quality: 82 });
  await page.mouse.up({ button: "right" });
  assert.equal((await snapshot()).anchor, false, "the right button lets go");
  await wait(1000);
  assert.ok(await facing());
  await page.mouse.move(1439, 899);
  await page.mouse.move(1500, 950);
  await wait(400);
  await page.keyboard.down("w");
  await page.keyboard.down("Shift");
  await wait(300);
  await page.keyboard.down("r");
  assert.equal((await snapshot()).anchor, true, "R attaches");
  await wait(600);
  await page.screenshot({ path: `${OUT}/desktop-key.jpg`, type: "jpeg", quality: 82 });
  await page.keyboard.up("r");
  await page.keyboard.up("w");
  await page.keyboard.up("Shift");
  assert.equal((await snapshot()).anchor, false, "R lets go");
  // a long fall over the real city: the speed treatment, then a landing in the street
  await page.evaluate(() => {
    street.swing.reset();
    const w = street.onFoot;
    w.place(new w.camera.position.constructor(1.5, 0.2, -0.5), 0);
    w.camera.position.set(1.5, 100, -0.5);
    w.turn(0, -0.3);
    street.swing.physics.active = true;
    street.swing.physics.v.set(0, -32, 0);
  });
  await wait(900);
  const fast = await snapshot();
  assert.ok(fast.fov > 65 && Math.hypot(...fast.v) <= 58.01, "the speed treatment and the speed cap");
  await page.screenshot({ path: `${OUT}/city-speed.jpg`, type: "jpeg", quality: 82 });
  await page.waitForFunction(() => !street.swing.physics.active, { timeout: 15000 });
  await wait(1500);
  const landed = await snapshot();
  assert.ok(landed.p.every(Number.isFinite) && landed.p[1] >= 1.7 && landed.p[1] < 2 && Math.abs(landed.fov - 62) < 0.1, `lands in the street and settles ${JSON.stringify(landed)}`);
  // and the walker walks again
  await page.keyboard.down("w");
  await wait(600);
  await page.keyboard.up("w");
  const walked = await snapshot();
  assert.ok(Math.hypot(walked.p[0] - landed.p[0], walked.p[2] - landed.p[2]) > 0.8, "the walker walks again after the landing");
  assert.deepEqual(errors, [], "no uncaught browser errors");
  console.log(JSON.stringify({ mobile: after, fast, landed }));
  console.log("PASS real city: touch swing and look, release on cancel/blur/rotation, phone viewports, desktop cursor aim and R, speed, landing and walking on");
} finally {
  await browser.close();
}
