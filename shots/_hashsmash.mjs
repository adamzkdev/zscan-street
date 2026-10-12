// node shots/_hashsmash.mjs [snapshot.json] — HashSmash Hall (university floor 5), dev server on $PORT (3007 by default).
// Reads the live /v1/hashsmash, or a snapshot file when given (served by the page's own fetch);
// SNAP2 (a second snapshot) is served after the first shots, to see the hall announce what moved.
// Shots: entry, mid-room, each wall, Poseidon, then a smash sequence (?debug's __hashsmash.smash).
import fs from "node:fs";
import puppeteer from "puppeteer-core";
const PORT = process.env.PORT ?? 3007;
const OUT = process.env.OUT ?? "shots";
const [snap] = process.argv.slice(2);
let body = snap ? fs.readFileSync(snap, "utf8") : null;
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 300000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1440, height: 860 } });
const p = await b.newPage();
p.on("pageerror", (e) => console.log("[pageerror]", e.message));
p.on("console", (m) => m.type() === "error" && !m.text().includes("Failed to load resource") && console.log("[error]", m.text()));
// a snapshot is served by the page's own fetch (intercepting every request slows Vite's boot to a crawl)
await p.exposeFunction("__hsBody", () => body);
if (body)
  await p.evaluateOnNewDocument(() => {
    const real = window.fetch.bind(window);
    window.fetch = async (u, o) => (String(u).includes("/v1/hashsmash") ? new Response(await window.__hsBody(), { headers: { "content-type": "application/json" } }) : real(u, o));
  });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await p.goto(`http://localhost:${PORT}/?debug&theme=night&interior=university`);
for (let k = 0; k < 180 && !(await p.evaluate(() => !!window.street?.interiors?.active).catch(() => false)); k++) await wait(1000);
await wait(3000);
const place = (x, z, yaw, pitch) =>
  p.evaluate(
    (v) => {
      const I = street.interiors;
      if (I.floor !== 5) I.goTo(5);
      const y = I.active.floors[I.floor].y;
      const V = I.walk.camera.position.constructor;
      I.walk.place(new V(v.x, y, v.z), v.yaw, y);
      I.walk.pitch = v.pitch;
    },
    { x, z, yaw, pitch },
  );
const shot = async (name, x, z, yaw, pitch, ms = 4000) => {
  await place(x, z, yaw, pitch);
  await wait(ms);
  await p.screenshot({ path: `${OUT}/hashsmash-${name}.png` });
  console.log(`${OUT}/hashsmash-${name}.png`);
};
await shot("entry", 0, -1.5, 0, 0.12, 6000);
await shot("mid", -3.5, -11, 0.12, 0.1);
await shot("frontier", 0, -18, 0, 0.14);
await shot("race", -3, -19, Math.PI / 2, 0.1);
await shot("east", 3.5, -18.6, -Math.PI / 2, 0.1);
await shot("poseidon", 2.2, -7.2, 0.18, 0.02);
await shot("latest-back", 0, -12.2, Math.PI, 0.32);
// the smash: Poseidon's next round comes off
await place(-0.4, -6.6, -0.03, -0.06);
await wait(2500);
await p.evaluate(() => window.__hashsmash.smash("poseidon", 6));
for (const [i, ms] of [
  [1, 250],
  [2, 250],
  [3, 250],
  [4, 900],
]) {
  await wait(ms);
  await p.screenshot({ path: `${OUT}/hashsmash-smash${i}.png` });
  console.log(`${OUT}/hashsmash-smash${i}.png`);
}
await p.evaluate(() => window.__hashsmash.chip("sha256"));
await place(-5.6, -5.6, 0.62, -0.05);
await wait(300);
await p.screenshot({ path: `${OUT}/hashsmash-chip.png` });
console.log(`${OUT}/hashsmash-chip.png`);
if (process.env.SNAP2) {
  body = fs.readFileSync(process.env.SNAP2, "utf8");
  // the hall reads the API again on arrival: walk out to floor 4 and back in
  await p.evaluate(() => street.interiors.goTo(4));
  await wait(1500);
  await shot("after", 1.2, -6.5, 0.1, 0.1, 2500);
  console.log(await p.evaluate(() => (JSON.parse(localStorage.getItem("street.inbox") || "{}").mails || []).filter((m) => m.kind === "smash").map((m) => m.title + " | " + m.text).join("\n")));
}
await b.close();
