// The city works: node shots/_works.mjs [day|night]
import puppeteer from "puppeteer-core";
const theme = process.argv[2] ?? "night";
const plan = (style, floors, wall, glass, neon, crown, sign, seed) => ({ style, floors, wall, glass, neon, crown, sign, seed });
const who = (id, name, job, line) => ({ id, name, job, ...(line ? { line } : {}) });
const MOCK = {
  tip: 3511000, round: 6095, start: 3510720, end: 3511296, stopped: false,
  proposals: [
    { idx: 0, architect: who(11, "Kenji", "noodle chef"), name: "Ramen Heights", pitch: "Twelve floors of broth and neon. 326 transactions last round, the city is hungry.", plan: plan("pagoda", 7, "red", "gold", "gold", "spire", "RAMEN", 11), backers: [who(3, "Mika", "courier", "Kenji feeds this street, he gets my vote."), who(5, "Ines", "barista", "A pagoda by the park? Finally some style.")], votes: 4 },
    { idx: 1, architect: who(22, "Amara", "miner"), name: "The Hash Exchange", pitch: "A glass tower that hums with every block. Empty blocks hit us 9 times, we need power.", plan: plan("twist", 20, "night", "sky", "cyan", "antenna", "HASH EX", 22), backers: [who(7, "Leo", "trader", "Twisting glass, that's the future.")], votes: 7 },
    { idx: 2, architect: who(33, "Sora", "gardener"), name: "Shielded Terraces", pitch: "Trees on every floor, privacy in every garden.", plan: plan("garden", 12, "white", "green", "green", "garden", "TERRACES", 33), backers: [], votes: 2 },
  ],
  sites: [
    { site: 0, round: 6092, idx: 0, start: 3510000, votes: 5, architect: who(41, "Noor", "librarian"), name: "Proof Library Tower", pitch: "", plan: plan("deco", 18, "stone", "gold", "gold", "spire", "PROOF", 41), crew: [], work: 58, need: 58 },
    { site: 1, round: 6093, idx: 1, start: 3510300, votes: 3, architect: who(42, "Theo", "baker"), name: "Night Market Hall", pitch: "", plan: plan("market", 4, "brick", "gold", "pink", "billboard", "YATAI", 42), crew: [], work: 16, need: 16 },
    { site: 2, round: 6094, idx: 2, start: 3510700, votes: 9, architect: who(43, "Yuna", "architect"), name: "Halo Spiral", pitch: "A spiral for the shielded pool.", plan: plan("twist", 16, "night", "violet", "violet", "dome", "HALO", 43), crew: [who(1, "Rafa", "welder", "Every block, another layer."), who(2, "Hana", "painter", "This twist is a nightmare to pour.")], work: 23, need: 52 },
  ],
};
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1400, height: 860 } });
const p = await b.newPage();
p.on("pageerror", (e) => console.log(`[pageerror] ${e.message}`));
p.on("console", (m) => m.type() === "error" && console.log(`[console] ${m.text()}`));
await p.evaluateOnNewDocument((mock) => {
  const f = window.fetch;
  window.fetch = (u, o) => (String(u).includes("/v1/street/works") && !String(u).includes("vote") ? Promise.resolve(new Response(JSON.stringify(mock), { headers: { "content-type": "application/json" } })) : f(u, o));
}, MOCK);
await p.goto(`http://localhost:3007/?debug&theme=${theme}`);
await p.waitForFunction(() => window.street?.game, { timeout: 180000 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(9000);
await p.evaluate(() => street.game.works.goTo(4));
await sleep(5000);
await p.screenshot({ path: `shots/works-1-${theme}.png` });
await p.evaluate(() => street.game.works.goTo(0));
await sleep(4000);
await p.screenshot({ path: `shots/works-2-${theme}.png` });
await p.evaluate(() => street.game.stand(51.5, -60, -1.25));
await sleep(5000);
await p.screenshot({ path: `shots/works-4-foot-${theme}.png` });
await p.evaluate(() => street.game.stand(51.5, -60, -0.5));
await sleep(2500);
await p.screenshot({ path: `shots/works-5-foot-${theme}.png` });
await p.evaluate(() => street.game.works.open());
await sleep(1500);
await p.screenshot({ path: `shots/works-3-panel.png` });
await b.close();
