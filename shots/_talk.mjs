import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1400, height: 860 } });
const p = await b.newPage();
p.on("pageerror", (e) => console.log("ERR", e.message));
await p.goto("http://localhost:3007/?debug&capture&theme=day");
await p.waitForFunction(() => window.capture && window.street, { timeout: 120000 });
const step = async (sec) => { const end = Date.now() + sec * 1000; while (Date.now() < end) { await p.evaluate(() => capture.step(1 / 30)); await new Promise((r) => setTimeout(r, 15)); } };
await step(14);
// a conversation: wait for a bubble at the plaza
for (let k = 0; k < 20; k++) { await step(1); if (await p.evaluate(() => [...street.director.snarks].some((s) => s.said && s.said.parent && Math.abs(s.root.position.z - 10.4) < 1))) break; }
await p.evaluate(() => { capture.shot({ pos: [-9, 2.6, 15], look: [-9, 1.6, 10.4], fov: 45 }); capture.step(1 / 30); });
await p.screenshot({ path: "shots/talk-0.png" });
// the stairs: walk up from the street to the PARK platform
const st = await p.evaluate(() => { const s = street.metro.stations[0]; const a = s.stairs[0], b = s.stairs[s.stairs.length - 2]; return { a: [a.x, a.z], b: [b.x, b.z] }; });
await p.evaluate((st) => { capture.shot(null); street.walk(true); const V = street.onFoot.camera.position.constructor; const yaw = Math.atan2(-(st.b[0] - st.a[0]), -(st.b[1] - st.a[1])); street.onFoot.place(new V(st.a[0], 0.2, st.a[1]), yaw); }, st);
await p.keyboard.down("w");
await step(7);
await p.keyboard.up("w");
console.log("on foot y", await p.evaluate(() => street.onFoot.camera.position.y.toFixed(2)), "floor", await p.evaluate(() => street.onFoot.floor.toFixed(2)));
await p.screenshot({ path: "shots/talk-1.png" });
// a driver: stand in the avenue
await p.evaluate(() => street.onFoot.place(new street.onFoot.camera.position.constructor(-30, 0.01, -0.4), -Math.PI / 2));
for (let k = 0; k < 30; k++) { await step(1); if (await p.evaluate(() => [...street.director.snarks].some((s) => s.role === "Driver" && s.said && s.said.parent))) break; }
await p.evaluate(() => { const d = [...street.director.snarks].find((s) => s.role === "Driver"); const q = d ? d.root.position : { x: -30, z: 0 }; capture.shot({ pos: [q.x - 2, 3, q.z + 6], look: [q.x, 1.5, q.z], fov: 50 }); capture.step(1 / 30); });
await p.screenshot({ path: "shots/talk-2.png" });
await b.close();
