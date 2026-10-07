// Close-ups of zkSNARK accessories and poses: a lineup on the avenue (caps, hard hats, items,
// umbrellas, perched, seated). Usage: node shots/_propsfit.mjs <tag> [port]
import puppeteer from "puppeteer-core";
const tag = process.argv[2] ?? "x";
const port = process.argv[3] ?? "3037";
const OUT = process.env.OUT ?? "shots";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"], defaultViewport: { width: 1400, height: 800 } });
const p = await b.newPage();
p.on("pageerror", (e) => console.log("ERR", e.message));
await p.goto(`http://localhost:${port}/?debug&capture&theme=day`);
await p.waitForFunction(() => window.capture && window.street, { timeout: 120000 });
const step = async (sec) => { const end = Date.now() + sec * 1000; while (Date.now() < end) { await p.evaluate(() => capture.step(1 / 30)); await new Promise((r) => setTimeout(r, 10)); } };
await step(3);
const at = await p.evaluate(async () => {
  const S = await import("/src/scene/snark.ts");
  const C = await import("/src/interior/factory/crew.ts");
  const d = street.director;
  const ids = [1, 42, 777, 1234, 5000, 1977, 4911, 9999, 2500, 3333];
  // a quiet strip: the north kerb of the avenue, west end
  const cop = [...d.snarks].find((s) => s.role === "Police officer");
  const o = cop ? cop.root.position.clone() : { x: 0, y: 0.2, z: 0 };
  const base = { x: 0, y: 250, z: 0 };
  {
    const b = cop.body;
    const fl = new b.constructor(new b.geometry.constructor(80, 80), new b.material.constructor({ color: 0x8a8a92 }));
    fl.rotation.x = -Math.PI / 2;
    fl.position.set(10, 250, 10);
    d.scene.add(fl);
    for (let k = 0; k < 4; k++) { const st = new b.constructor(new b.geometry.constructor(14, 0.45), new b.material.constructor({ color: 0x6a5a48 })); st.position.set(5, 250.225, k * 6 + 0.35); }
  }
  const V = cop.root.position.constructor;
  const mk = async (id, x, z) => {
    const s = new S.Snark(id, await S.loadArt(id));
    d.adopt(s);
    s.noClip = true;
    s.showParcels(true);
    s.root.position.set(base.x + x, base.y, base.z + z);
    s.faceDir = new V(1, 0, 0);
    return s;
  };
  window.__lineup = [];
  // row 0: police caps
  for (let i = 0; i < 10; i++) { const s = await mk(ids[i], i * 1.1, 0); s.setCap(); __lineup.push(s); }
  // row 1: hard hats (factory crew)
  const crew = new C.Crew();
  const grp = d.scene;
  for (let i = 0; i < 10; i++) {
    const pp = await crew.person(ids[i], grp, new V(base.x + i * 1.1, base.y, base.z + 8), "x", { hat: ["#f4c020", "#dcdce2", "#ff7a1a"][i % 3], face: new V(1, 0, 0) });
    d.snarks.add(pp.s);
  }
  // row 2: items
  const items = ["coffee", "phone", "bag", "briefcase", "book", "flowers", "rod", "can", "basket", "shielded"];
  for (let i = 0; i < 10; i++) { const s = await mk(ids[i], i * 1.1, 16); s.carry = items[i]; s.redrawHold(); __lineup.push(s); }
  // row 3: umbrellas (some with items)
  for (let i = 0; i < 10; i++) { const s = await mk(ids[i], i * 1.1, 24); s.carry = [null, "coffee", "bag", "shielded", "phone", null, "briefcase", "book", null, "flowers"][i]; s.redrawHold(); s.setUmbrella(["#e8453c", "#3a7ad0", "#f4b728"][i % 3]); __lineup.push(s); }
  // row 4: seated on chairs (root on the seat) and perched on a bench (root on the floor)
  const T = await import("/node_modules/three/build/three.module.js");
  const wood = new T.MeshBasicMaterial({ color: 0x7a4a2a }), dark = new T.MeshBasicMaterial({ color: 0x4a2a18 });
  const box = (w, h, d, x, y, z, m) => { const b = new T.Mesh(new T.BoxGeometry(w, h, d), m); b.position.set(x, y, z); d0.scene.add(b); };
  const d0 = d;
  for (let i = 0; i < 5; i++) {
    const x = base.x + i * 1.6, z = base.z + 32, y = base.y;
    box(0.5, 0.06, 0.5, x, y + 0.42, z, wood);
    box(0.06, 0.5, 0.5, x - 0.25, y + 0.7, z, dark);
    for (const [dx, dz] of [[-0.22, -0.22], [0.22, -0.22], [-0.22, 0.22], [0.22, 0.22]]) box(0.05, 0.42, 0.05, x + dx, y + 0.21, z + dz, dark);
    box(0.7, 0.05, 0.7, x + 0.75, y + 0.72, z, wood);
    box(0.08, 0.72, 0.08, x + 0.75, y + 0.36, z, dark);
    const s = await mk(ids[i], i * 1.6, 32);
    s.root.position.y = y + 0.45;
    s.sit(true, 0.45);
    s.carry = [null, "coffee", "phone", "book", null][i]; s.redrawHold();
    if (i === 4) s.setCap();
    __lineup.push(s);
  }
  box(7.6, 0.08, 0.45, base.x + 11.2, base.y + 0.45, base.z + 32, wood);
  box(7.6, 0.4, 0.06, base.x + 11.2, base.y + 0.75, base.z + 31.78, dark);
  for (let i = 0; i < 5; i++) {
    const s = await mk(ids[5 + i], 8 + i * 1.6, 32);
    s.faceDir = new V(0, 0, 1);
    s.perch(0.49);
    __lineup.push(s);
  }
  // row 5: sitting on the floor (picnic) and riders at 0.78 scale on a bus-like seat
  for (let i = 0; i < 4; i++) { const s = await mk(ids[i], i * 1.6, 40); s.sit(true, 0); __lineup.push(s); }
  for (let i = 0; i < 4; i++) { box(0.5, 0.06, 0.5, base.x + 7 + i * 1.6, base.y + 0.4, base.z + 40, wood); const s = await mk(ids[4 + i], 7 + i * 1.6, 40); s.root.position.y = base.y + 0.43; s.sit(true, 0.43); s.setScale(0.78); __lineup.push(s); }
  // row 6: chef's toques and laurels (wear() exists after the fix only)
  for (let i = 0; i < 10; i++) { const s = await mk(ids[i], i * 1.1, 48); if (s.wear) s.wear({ hat: i < 5 ? "chef" : "laurel" }); __lineup.push(s); }
  return base;
});
console.log("base", at);
await step(1.5);
const shot = async (name, pos, look, fov = 30) => {
  await p.evaluate((pos, look, fov) => { capture.shot({ pos, look, fov }); capture.step(1 / 30); capture.step(1 / 30); }, pos, look, fov);
  await p.screenshot({ path: `${OUT}/pf-${tag}-${name}.png` });
};
const B = at;
for (const [row, z] of [["caps", 0], ["hardhats", 8], ["items", 16], ["umbrellas", 24]]) {
  await shot(`${row}-a`, [B.x + 2.2, B.y + 1.3, B.z + z + 5.5], [B.x + 2.2, B.y + 1.1, B.z + z], 34);
  await shot(`${row}-b`, [B.x + 7.7, B.y + 1.3, B.z + z + 5.5], [B.x + 7.7, B.y + 1.1, B.z + z], 34);
}
for (const [nm, x, z, dx] of [["seat-a", 3.2, 32, 0], ["seat-b", 11.2, 32, 0], ["seat-side", 3.2, 32, 1], ["floor", 2.4, 40, 0], ["rider", 9.4, 40, 0]]) {
  await shot(nm, [B.x + x + (dx ? 4.5 : 0.8), B.y + 1.5, B.z + z + (dx ? 1.2 : 5.5)], [B.x + x, B.y + 0.8, B.z + z], 40);
}
await shot("chef", [B.x + 2.2, B.y + 1.3, B.z + 48 + 5.5], [B.x + 2.2, B.y + 1.1, B.z + 48], 34);
await shot("laurel", [B.x + 7.7, B.y + 1.3, B.z + 48 + 5.5], [B.x + 7.7, B.y + 1.1, B.z + 48], 34);
// walking caps: bob check
await p.evaluate(() => { const V = __lineup[0].root.position.constructor; for (const s of __lineup.slice(0, 10)) void s.walk([s.root.position.clone().add(new V(0.01, 0, -30))], 0.4); });
await step(0.5);
await shot("caps-walk", [B.x + 2.2, B.y + 1.3, B.z + 3.8], [B.x + 2.2, B.y + 1.0, B.z - 0.3], 34);
await b.close();
