// node shots/_stadium-in.mjs <scenario>: BLOCK STADIUM dynamics (goals, wave, celebrations).
import puppeteer from "puppeteer-core";
const [scenario = "play"] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 300000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1440, height: 860 } });
const p = await b.newPage();
p.on("pageerror", (e) => console.log("[pageerror]", e.message));
p.on("console", (m) => m.type() === "error" && !m.text().includes("Failed to load resource") && console.log("[error]", m.text()));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await p.goto(`http://localhost:3007/?debug&theme=night&interior=stadium`);
for (let k = 0; k < 120; k++) { try { if (await p.evaluate(() => !!window.street?.interiors?.active && !!window.__stadium)) break; } catch {} await wait(1000); }
await wait(2500);
const place = (x, z, yaw, floor, pitch) => p.evaluate((x, z, yaw, floor, pitch) => { const I = street.interiors; if (I.floor !== floor) I.goTo(floor); const y = I.active.floors[I.floor].y; const V = I.walk.camera.position.constructor; I.walk.place(new V(x, y, z), yaw, y); I.walk.pitch = pitch; }, x, z, yaw, floor, pitch);
const shot = async (name) => { await p.screenshot({ path: `shots/in-stadium-${name}.png` }); console.log(`shots/in-stadium-${name}.png`); };
if (scenario === "play") {
  await place(-2, 20.3, -0.75, 1, 0);
  await wait(800);
  // put the ball in front of the visitor, near the box, and shoot at the goal
  await p.evaluate(() => { const m = __stadium.match; m.state = "play"; const c = street.interiors.walk.camera; c.position.x = 18; c.position.z = 1; m.ball.set(18.7, 0.22, 1); m.bv.set(0, 0, 0); });
  await place(18, 1, -Math.PI / 2, 1, 0.02);
  await wait(400);
  await p.evaluate(() => { const m = __stadium.match; m.ball.set(18.7, 0.22, 1.0); m.bv.set(0,0,0); });
  await shot("aim");
  console.log(await p.evaluate(() => { const m = __stadium.match; const c = street.interiors.walk.camera; return JSON.stringify({ball: m.ball, cam: c.position, st: m.state, ok: m.shoot(c), bv: m.bv}); }));
  for (let i = 0; i < 8; i++) { await wait(120); console.log(await p.evaluate(() => { const m = __stadium.match; return [m.ball.x, m.ball.y, m.ball.z, m.bv.x, m.bv.y, m.bv.z].map((v) => v.toFixed(2)).join(" ") + " " + m.state; })); }
  await wait(100);
  await shot("goal1");
  await wait(1400);
  await shot("goal2");
  await place(0, 15, Math.PI, 1, 0.45);
  await wait(800);
  await shot("goal3");
} else if (scenario === "dribble") {
  await place(-6, 0, -Math.PI / 2, 1, -0.1);
  await wait(600);
  await p.evaluate(() => { const m = __stadium.match; m.state = "play"; m.ball.set(-5.2, 0.22, 0); m.bv.set(0, 0, 0); });
  await p.keyboard.down("Shift");
  await p.keyboard.down("w");
  for (let i = 0; i < 10; i++) { await wait(200); console.log(await p.evaluate(() => { const m = __stadium.match; const c = street.interiors.walk.camera.position; return `you ${c.x.toFixed(1)},${c.z.toFixed(1)} ball ${m.ball.x.toFixed(1)},${m.ball.z.toFixed(1)} v ${m.bv.x.toFixed(1)} ${m.state}`; })); if (i === 5) await shot("dribble"); }
  await p.keyboard.up("w");
  await p.keyboard.up("Shift");
  await p.keyboard.press("Space");
  await wait(300);
  console.log(await p.evaluate(() => { const m = __stadium.match; return `after space ball ${m.ball.x.toFixed(1)},${m.ball.y.toFixed(1)},${m.ball.z.toFixed(1)} v ${m.bv.x.toFixed(1)} ${m.state} score ${m.score}`; }));
  await wait(20000);
  console.log(await p.evaluate(() => { const m = __stadium.match; return `20s later score ${m.score} state ${m.state}`; }));
  await shot("later");
} else if (scenario === "silver") {
  await place(-20, 6, Math.PI / 2 + 0.3, 1, -0.05);
  await wait(600);
  await p.evaluate(() => { const m = __stadium.match; m.state = "play"; m.players[0].cd = 5; m.ball.set(-26, 1, 0); m.bv.set(-22, 2, 0.8); });
  await wait(1100);
  await shot("silver");
} else if (scenario === "watch") {
  await place(0, 35.9, 0, 0, -0.05);
  await wait(500);
  await p.evaluate(() => __stadium.block(14, 3));
  await wait(1800);
  await shot("wave");
  for (let i = 0; i < 12; i++) { await wait(1000); if (await p.evaluate(() => __stadium.match.state === "goal")) break; }
  await wait(700);
  await shot("wgoal1");
  await wait(1500);
  await shot("wgoal2");
}
const fps = await p.evaluate(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else res(Math.round(n / 2)); }; requestAnimationFrame(f); }));
console.log("fps", fps);
await b.close();
