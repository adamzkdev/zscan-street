// Agents: mocked /v1/street/agents + people + chat. node shots/_agents.mjs
import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1400, height: 860 } });
const p = await b.newPage();
const logs = [];
p.on("console", (m) => m.type() === "error" && !m.text().includes("404") && logs.push(m.text()));
p.on("pageerror", (e) => console.log(`[pageerror] ${e.message}`));
const NAMES = ["Mika", "Yuna", "Kenji", "Amara", "Leo", "Ines", "Rafa", "Noor", "Sora", "Theo", "Lina", "Omar"];
const JOBS = ["barista at the corner café", "night-shift miner at the Proof Factory", "street musician", "retired cryptographer"];
const persona = (id) => ({ id, name: NAMES[id % 12], job: JOBS[id % 4], trait: "cheerful and chatty", take: "privacy is a human right, shielded by default", home: "Midtown" });
const CAST = [101, 202, 303, 404, 505, 606, 707, 808, 909, 1010, 1111, 1212];
const GO = ["bench", "bench", "fountain", "fountain", "market", "koi", "vending", "window", "bus", "bench", "orchard", "fountain"];
const agents = (h) => ({
  height: h,
  day: 1,
  cast: CAST.map((id, k) => ({ ...persona(id), now: { id, go: GO[k], mood: "happy", thought: k % 2 ? "Empty block again? The miners must be napping." : "Orchard is the best pool, fight me.", with: k < 4 ? CAST[k ^ 1] : null, journal: ["at koi, calm: The koi look shielded today."] } })),
  talks: [{ a: 101, b: 202, lines: ["Did you see that bus? Only miners aboard.", "Empty block. Even the koi noticed.", "Next one will be packed, trust me."] }],
});
// mock the new endpoints in the page (request interception stalls Vite's module requests)
await p.exposeFunction("__chatLog", (who, facts) => {
  console.log("CHAT who:", who);
  console.log("CHAT facts head:", (facts || "").split("\n").slice(0, 6).join(" | "));
});
await p.evaluateOnNewDocument((NAMES, JOBS, CAST, GO) => {
  const persona = (id) => ({ id, name: NAMES[id % 12], job: JOBS[id % 4], trait: "cheerful and chatty", take: "privacy is a human right, shielded by default", home: "Midtown" });
  const agents = (h) => ({
    height: h,
    day: 1,
    cast: CAST.map((id, k) => ({ ...persona(id), now: { id, go: GO[k], mood: "happy", thought: k % 2 ? "Empty block again? The miners must be napping." : "Orchard is the best pool, fight me.", with: k < 4 ? CAST[k ^ 1] : null, journal: ["at koi, calm: The koi look shielded today."] } })),
    talks: [{ a: 101, b: 202, lines: ["Did you see that bus? Only miners aboard.", "Empty block. Even the koi noticed.", "Next one will be packed, trust me."] }],
  });
  const json = (v) => new Response(JSON.stringify(v), { status: 200, headers: { "content-type": "application/json" } });
  const real = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const u = String(input instanceof Request ? input.url : input);
    if (u.includes("/v1/street/agents")) return json(agents(Number(new URL(u).searchParams.get("h")) || 3511000));
    if (u.includes("/v1/street/people")) return json(new URL(u).searchParams.get("ids").split(",").map(Number).map(persona));
    if (u.includes("/v1/street/chat")) {
      const body = JSON.parse(init?.body || "{}");
      window.__chatLog(body.who, body.facts);
      return json({ reply: "Hey! I'm on my way to the fountain, Kenji owes me a coffee." });
    }
    return real(input, init);
  };
}, NAMES, JOBS, CAST, GO);
await p.goto(`http://localhost:3007/?debug&theme=night`);
await p.waitForFunction(() => window.street?.game, { timeout: 180000 }).catch(async () => console.log("no game; title", await p.title(), await p.evaluate(() => document.body.innerText.slice(0, 300))));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(14000);
const out = await p.evaluate(() => street.game.residents.debug().map((r) => r.id));
console.log("residents out:", out.join(","));
const castOut = out.filter((id) => [101, 202, 303, 404, 505, 606, 707, 808, 909, 1010, 1111, 1212].includes(id));
console.log("cast out:", castOut.join(","));
const who = castOut[0] ?? out[0];
await p.evaluate((id) => street.game.meet(id), who);
await sleep(1500);
const pos = () => p.evaluate(() => street.game.residents.debug().map((r) => `${r.id}@${r.x.toFixed(1)},${r.z.toFixed(1)}`).join(" "));
await p.screenshot({ path: "shots/agents-1-prompt.png" });
await p.keyboard.press("KeyE");
const before = await pos();
await sleep(800);
await p.type(".talk input", "What are you up to today?");
await p.keyboard.press("Enter");
await sleep(1500);
await p.screenshot({ path: "shots/agents-2-talk.png" });
console.log("talking to:", await p.evaluate(() => document.querySelector(".tk-name")?.textContent));
console.log("before:", before);
console.log("after: ", await pos());
await p.keyboard.press("Escape");
await sleep(500);
// a passer-by from the crowd: walk somewhere busy
const at = await p.evaluate(() => {
  const c = street.alive.named.people.crowd;
  // a walker on a loop, a few metres in front of us
  const i = c.people.findIndex((q) => q.kind === 0);
  const v = c.positionOf(i, { set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } });
  return { i, x: v.x, z: v.z };
});
console.log("crowd walker", JSON.stringify(at));
await p.evaluate(({ x, z }) => {
  window.__meetCrowd = true;
}, at);
console.log("meetCrowd", JSON.stringify(await p.evaluate(() => street.game.meetCrowd())));
await sleep(150);
console.log("prompt:", await p.evaluate(() => document.querySelector(".talk-prompt.on")?.textContent));
await p.keyboard.press("KeyE");
await sleep(1500);
console.log("talking to:", await p.evaluate(() => document.querySelector(".tk-name")?.textContent));
await p.screenshot({ path: "shots/agents-3-crowd.png" });
console.log(logs.join("\n") || "no errors");
await b.close();
