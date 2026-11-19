// node shots/_nu7solo.mjs [port]: on a touch screen the race leaves the city for party.html; its way back
// (`ret`) brings you on foot to the pit gate where you tapped RACE, and inside the pit garage on its floor.
import puppeteer from "puppeteer-core";
const port = process.argv[2] ?? "3050";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"] });
const p = await b.newPage();
await p.setViewport({ width: 900, height: 420, isMobile: true, hasTouch: true, deviceScaleFactor: 1, isLandscape: true });
const errs = [];
p.on("pageerror", (e) => errs.push(e.message));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const checks = [];
const check = (name, ok, extra = "") => (checks.push(`${ok ? "PASS" : "FAIL"} ${name}${extra ? ` · ${extra}` : ""}`), ok);
const up = () => p.waitForFunction(() => window.street?.interiors && window.__streetUp, { timeout: 240000, polling: 200 });
await p.goto(`http://localhost:${port}/?debug&nofilm`);
await up();
for (let i = 0; i < 40 && !(await p.evaluate(() => street.game.nu7Quarter.done)); i++) await wait(1000);
check("coarse pointer", await p.evaluate(() => matchMedia("(pointer: coarse)").matches));
// on foot at the pit gate, tap the prompt
await p.evaluate(() => street.game.stand(189.6, -84.4, Math.PI / 2));
await wait(1500);
const box = await p.evaluate(() => {
  const r = document.querySelector(".talk-prompt.on")?.getBoundingClientRect();
  return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2, text: document.querySelector(".talk-prompt.on").textContent } : null;
});
check("the prompt is there to tap", !!box && box.text.includes("RACE"), box?.text ?? "none");
if (box) {
  await Promise.all([p.waitForNavigation({ timeout: 60000 }).catch(() => null), p.touchscreen.tap(box.x, box.y)]);
  const url = new URL(p.url());
  const ret = url.searchParams.get("ret") ?? "";
  check("the race's own page", url.pathname.endsWith("/party.html") && url.searchParams.get("game") === "kart@astana", url.pathname + url.search.slice(0, 80));
  check("its way back carries the spot", /foot=189\.6%2C-84\.4%2C1\.57|foot=189\.6,-84\.4,1\.57/.test(ret), ret);
  // back to the city, as party.html's back does
  await p.goto(`http://localhost:${port}${ret}`);
  await up();
  await wait(4000);
  const s = await p.evaluate(() => ({ walking: street.onFoot.enabled, x: +street.onFoot.camera.position.x.toFixed(1), z: +street.onFoot.camera.position.z.toFixed(1), h: +street.onFoot.heading.toFixed(2) }));
  check("back on foot at the pit gate", s.walking && Math.abs(s.x - 189.6) < 0.2 && Math.abs(s.z + 84.4) < 0.2 && Math.abs(s.h - 1.57) < 0.02, JSON.stringify(s));
}
// inside the pit garage: the way back lands on its floor
await p.evaluate(() => street.interiors.enter("nu7tower", 1));
await wait(2500);
const url2 = await p.evaluate(() => {
  // (what the party's page would get: the same builder openPartyHall uses)
  return import("/src/game/solo.ts").then((m) => m.soloUrl("party", { tab: "practice", game: "kart@astana" }, "nu7tower", { floor: String(street.interiors.floor) }));
});
const ret2 = new URL(url2, `http://localhost:${port}`).searchParams.get("ret") ?? "";
check("from the pit garage, the way back names it and its floor", ret2.includes("interior=nu7tower") && ret2.includes("floor=1"), ret2);
await p.goto(`http://localhost:${port}${ret2}`);
await up();
await wait(5000);
const s2 = await p.evaluate(() => ({ inside: street.interiors.active?.key ?? null, floor: street.interiors.floor }));
check("back in the pit garage", s2.inside === "nu7tower" && s2.floor === 1, JSON.stringify(s2));
console.log(checks.join("\n"));
console.log("errors:", errs.length, errs.slice(0, 8).join("\n"));
await b.close();
