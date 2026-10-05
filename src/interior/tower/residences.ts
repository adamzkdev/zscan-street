import * as THREE from "three";
import { get } from "../../data/zscan";
import { fitText } from "../../scene/fit";
import { hash } from "../../scene/voxel/model";
import type { Book } from "../../ui/reader";
import * as F from "../furniture";
import { box, glowMat, std, wall } from "../kit";
import { LEVELS, TowerKit, X1, Z0, Z1, makeCanvas } from "./kit";

/** 6 — the residences: four complete flats off a corridor, a resident in each. */
export function residences(k: TowerKit) {
  const f = 6,
    g = k.groups[f],
    y = LEVELS[f].y,
    h = LEVELS[f].h;
  k.shell(f, std("#3a3036", 0.8), std("#1a1620", 0.9), { panels: "none" });
  k.elevators(f);
  const hallWall = std("#3e3650", 0.85);
  box(g, 22, 0.012, 1.6, std("#5a2a3a", 0.95), 1, y + 0.006, -9);
  for (const z of [-9.82, -8.18]) box(g, 22, 0.014, 0.03, glowMat("#ff9f2e", 1.1), 1, y + 0.008, z);
  k.label(f, "RESIDENCES · 住居", 1, 3.0, -10.38, { h: 0.26, color: "#ff9f2e" });
  for (const x of [-5, 1, 7]) box(g, 0.6, 0.04, 0.6, glowMat("#ffe6c8", 1.2), x, y + h - 0.05, -9);
  const wood = (() => {
    const t = makeCanvas(128, 128, (gc) => {
      gc.fillStyle = "#8a6440";
      gc.fillRect(0, 0, 128, 128);
      for (let i = 0; i < 8; i++) {
        gc.fillStyle = i % 2 ? "#7e5a38" : "#93693f";
        gc.fillRect(0, i * 16, 128, 15);
        gc.fillStyle = "rgba(0,0,0,0.15)";
        gc.fillRect(((i * 37) % 100) + 10, i * 16, 2, 15);
      }
    }).t;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(4, 3);
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.55 });
  })();
  const tiles = (() => {
    const t = makeCanvas(64, 64, (gc) => {
      gc.fillStyle = "#e4e8ec";
      gc.fillRect(0, 0, 64, 64);
      gc.fillStyle = "#c8d0d8";
      gc.fillRect(0, 0, 64, 2);
      gc.fillRect(0, 0, 2, 64);
    }).t;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(6, 7);
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.3 });
  })();
  let zips: Book[] = [];
  void (async () => {
    let list = (await get<{ slug: string; number: number | null; title: string; status: string; owners: string[]; created: string | null; url: string }[]>("/v1/zips")) ?? [];
    if (!list.length) list = await fetch(`${import.meta.env.BASE_URL}zips.json`).then((r) => (r.ok ? r.json() : []), () => []);
    zips = list.filter((z) => z.number != null && z.status !== "Reserved").map((z) => ({ slug: z.slug, number: z.number, title: z.title, status: z.status, owners: z.owners, created: z.created, url: z.url, color: "#ff9f2e" }));
  })();

  /**
   * One flat, 11 × 7.5 m, laid out in (u, w): u along the corridor, w from the corridor wall in
   * towards the windows; mapped to the north side (−1) or the south side (+1).
   */
  const flat = (a: number, side: -1 | 1, n: string, o: { tone: string; accent: string; sofa: string; bed: string; resident: number; art: number }) => {
    const W = (u: number, w: number) => [a + u, side < 0 ? -10.5 - w : -7.5 + w] as [number, number];
    const r = k.rects[f];
    // turn something that faces +z to face the corridor, the windows, east or west
    const face = (d: "corridor" | "window" | "east" | "west") => (d === "east" ? Math.PI / 2 : d === "west" ? -Math.PI / 2 : (d === "corridor") === side < 0 ? 0 : Math.PI);
    const put = (key: string, build: () => import("../../scene/voxel/model").VoxelModel, u: number, w: number, d: "corridor" | "window" | "east" | "west", opts: { dy?: number; solid?: boolean } = {}) => {
      const [x, z] = W(u, w);
      return k.put(f, key, build, x, z, face(d), opts);
    };
    const wallMat = std(o.tone, 0.85);
    const iw = (u0: number, w0: number, u1: number, w1: number) => {
      const [x0, z0] = W(u0, w0),
        [x1, z1] = W(u1, w1);
      r.push(wall(g, x0, z0, x1, z1, h, wallMat, y, 0.12));
    };
    // floors: wood throughout, tiles in the bathroom
    const [fx, fz] = W(5.5, 3.75);
    box(g, 11, 0.02, 7.5, wood, fx, y, fz);
    const [bx, bz] = W(1.5, 4.25);
    box(g, 3, 0.02, 3.5, tiles, bx, y + 0.012, bz);
    // the front door off the corridor, its lit frame, the number sign
    const cz = side < 0 ? -10.5 : -7.5;
    r.push(wall(g, a, cz, a + 1, cz, h, hallWall, y), wall(g, a + 2.4, cz, a + 11, cz, h, hallWall, y));
    box(g, 1.4, h - 2.2, 0.2, hallWall, a + 1.7, y + 2.2, cz);
    if (a + 11 < X1) iw(11, 0, 11, 7.5);
    for (const u of [1, 2.4]) box(g, 0.05, 2.2, 0.05, glowMat(o.accent, 1.2), a + u, y, cz - side * 0.12);
    box(g, 1.45, 0.05, 0.05, glowMat(o.accent, 1.2), a + 1.7, y + 2.2, cz - side * 0.12);
    const plate = k.label(f, n, a + 0.4, 2.55, cz - side * 0.42, { h: 0.26, color: "#0d0d0d", bg: o.accent, rot: -Math.PI / 2 });
    (plate.material as THREE.MeshBasicMaterial).side = THREE.DoubleSide;
    // entry: a shoe cabinet and a mirror
    put("shoeCab", () => F.nightstand(), 0.4, 0.4, "window", { solid: true });
    // ---- bathroom (u 0–3, w 2.5–6) ----
    iw(0, 2.5, 3, 2.5);
    iw(3, 2.5, 3, 2.7);
    iw(3, 3.6, 3, 6);
    iw(0, 6, 3, 6);
    const toilet = put("toilet", F.toilet, 0.4, 5.4, "east");
    put(`vanity${o.tone}`, () => F.vanity(o.tone === "#e8dcc8" ? "#5a6a7a" : "#4a5a4a"), 1.5, 2.85, "window");
    put("tub", F.bathtub, 2.4, 4.4, "west");
    let flushes = 0;
    toilet.traverse((m) => m instanceof THREE.Mesh && k.pick(f, m, "<b>Toilet</b><span>flush</span>", () => ({ eyebrow: `Flat ${n} · bathroom`, title: `Flushed 🚽 ×${++flushes}`, body: "<p>Shielded plumbing: nothing leaks.</p>" })));
    // ---- kitchen along the corridor wall (u 3.4–8.2), a fridge, the dining table ----
    const kit = put(`kitchen${o.accent}`, () => F.kitchen(4, o.tone === "#d8e0e8" ? "#3a4a5a" : "#e8e2d4"), 5.6, 0.35, "window");
    const fr = put("fridge", F.fridge, 8.1, 0.4, "window");
    const food = ["oat milk, three onigiri and a cake shaped like a ⓩ", "kimchi, cold soba and a bottle of Shielded Sour", "eggs, natto and leftover hotpot", "matcha, mochi and a single lemon"];
    fr.traverse((m) => m instanceof THREE.Mesh && k.pick(f, m, "<b>Fridge</b><span>open it</span>", () => ({ eyebrow: `Flat ${n} · kitchen`, title: "The fridge", body: `<p>Inside: ${food[(Number(n) + Math.floor(Date.now() / 60000)) % food.length]}.</p>` })));
    let cooking = false;
    const steam = new THREE.Points(new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(new Array(60).fill(0), 3)), new THREE.PointsMaterial({ color: "#ffffff", size: 0.05, transparent: true, opacity: 0.5, depthWrite: false }));
    steam.frustumCulled = false;
    steam.visible = false;
    g.add(steam);
    const [hx, hz] = W(6.1, 0.35);
    k.ticks[f].push((_, t) => {
      if (!steam.visible) return;
      const pos = steam.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < 20; i++) pos.setXYZ(i, hx + Math.sin(i * 7 + t * 2) * 0.12, y + 1.0 + ((t * 0.5 + i / 20) % 1) * 0.7, hz + Math.cos(i * 3) * 0.1);
      pos.needsUpdate = true;
    });
    kit.traverse((m) =>
      m instanceof THREE.Mesh &&
      k.pick(f, m, "<b>Kitchen</b><span>cook something</span>", () => {
        cooking = !cooking;
        steam.visible = cooking;
        return { eyebrow: `Flat ${n} · kitchen`, title: cooking ? "Ramen on the hob 🍜" : "Hob off" };
      }),
    );
    put("dining4", () => F.diningTable(4), 5.6, 2.6, "east");
    for (const [du, dw, d] of [[-0.45, -0.7, "window"], [0.45, -0.7, "window"], [-0.45, 0.7, "corridor"], [0.45, 0.7, "corridor"]] as [number, number, "window" | "corridor"][]) put(`chair${o.accent}`, () => F.chair(o.accent), 5.6 + du, 2.6 + dw, d, { solid: false });
    const [px, pz] = W(5.6, 2.6);
    k.put(f, "pendant", () => F.pendant(0.9), px, pz, 0, { dy: h - 0.9, solid: false });
    // ---- bedroom (u 8.6–11, w 0–3.9) ----
    iw(8.6, 0.85, 8.6, 2.6);
    iw(8.6, 3.5, 8.6, 3.9);
    iw(8.6, 3.9, 11, 3.9);
    const bedObj = put(`bed${o.bed}`, () => F.bed(o.bed), 9.95, 2.1, "corridor");
    void bedObj;
    put("nightstand", F.nightstand, 10.75, 0.6, "window", { solid: false });
    put("wardrobe", () => F.wardrobe(), 9.4, 3.55, "corridor");
    k.painting(f, o.art + 1, ...((): [number, number, number, number] => { const [x, z] = W(9.95, 0.12); return [x, 1.9, z, face("window")]; })(), 0.7);
    // ---- living room by the windows (u 3–11, w 4–7.5) ----
    put(`rug${o.accent}`, () => F.rug(3.2, 2.4, o.tone === "#e8dcc8" ? "#c8b89a" : "#9aa8c8", o.accent), 5.2, 5.6, "corridor", { solid: false });
    put(`sofa${o.sofa}`, () => F.sofa(o.sofa, 3), 6.6, 5.6, "west");
    put("armchairRes", () => F.armchair(o.accent), 4.9, 7.0, "corridor");
    put("coffee", F.coffeeTable, 5.0, 5.6, "east", { solid: true });
    put("tvUnit", () => F.tvUnit(22), 3.3, 5.6, "east");
    const tv = k.screen(f, 1.5, 0.84, (gc, Wd, Hd) => {
      gc.fillStyle = "#04121a";
      gc.fillRect(0, 0, Wd, Hd);
      gc.fillStyle = "#3ef0ff";
      gc.font = '600 26px "JetBrains Mono", monospace';
      fitText(gc, "ZCASH · LIVE", 24, 44);
      gc.fillStyle = "#e8fbff";
      gc.font = '800 70px "JetBrains Mono", monospace';
      fitText(gc, k.height ? `#${k.height.toLocaleString("en-US")}` : "…", 24, 150);
      gc.fillStyle = "#ff3e8a";
      gc.font = '600 24px "JetBrains Mono", monospace';
      fitText(gc, `${k.ctx.director.mempoolList().length} TX WAITING`, 24, 220);
    }, 5);
    const [tx, tz] = W(3.15, 5.6);
    tv.position.set(tx, y + 1.25, tz);
    tv.rotation.y = face("east");
    box(g, 0.06, 0.92, 1.6, k.dark, tx - 0.04, y + 0.83, tz);
    k.pick(f, tv, `<b>Flat ${n} · TV</b><span>the chain, live</span>`, () => ({ eyebrow: `Flat ${n} · TV`, title: k.height ? `Block ${k.height.toLocaleString("en-US")}` : "Waiting for a block", body: `<p>${k.ctx.director.mempoolList().length} transactions waiting at the MEMPOOL.</p>` }));
    const shelf = put("shelfRes", () => F.bookshelf(Number(n)), 10.75, 4.7, "west");
    shelf.traverse((m) =>
      m instanceof THREE.Mesh &&
      k.pick(f, m, "<b>Bookshelf</b><span>pick a ZIP to read</span>", () => {
        if (!zips.length) return { eyebrow: `Flat ${n}`, title: "The bookshelf", body: "<p>The books are still being shelved…</p>" };
        const z = zips[Math.floor(Math.random() * zips.length)];
        return { eyebrow: `Flat ${n} · bookshelf`, title: z.title, book: z };
      }),
    );
    put("floorLamp", F.floorLamp, 8.2, 7.1, "corridor");
    put("plantRes", () => F.plant("monstera", Number(n)), 3.6, 7.1, "corridor");
    put("plantRes2", () => F.plant("cactus", Number(n) + 1), 10.6, 7.1, "corridor");
    // curtains drawn to either side of the window
    for (const u of [3.4, 10.4]) put(`curtain${o.accent}`, () => F.curtain(o.accent, h - 0.2), u, 7.35, "corridor", { solid: false });
    k.painting(f, o.art, ...((): [number, number, number, number] => { const [x, z] = W(6.6, 4.05); return [x, 1.9, z, face("window")]; })(), 0.8);
    void k.person(f, o.resident, W(6.5, 5.6), "Resident", { face: new THREE.Vector3(...(side < 0 ? [-1, 0, 0] : [-1, 0, 0])), sit: true, dy: 0.42 });
    void k.person(f, o.resident + 1, W(6.2, 1.6), "Resident", { face: new THREE.Vector3(0, 0, side < 0 ? 1 : -1), wander: [W(6.2, 1.6), W(9.9, 3.3), W(5.0, 6.6), W(4.2, 1.6)] });
    void hash;
  };
  flat(-10, -1, "601", { tone: "#e8dcc8", accent: "#ff9f2e", sofa: "#8a4a3a", bed: "#3a5a8a", resident: 3333, art: 101 });
  flat(1, -1, "602", { tone: "#d8e0e8", accent: "#3ef0ff", sofa: "#3a6a5a", bed: "#6a3a6a", resident: 5151, art: 202 });
  flat(-10, 1, "603", { tone: "#e8d8e0", accent: "#ff7ab0", sofa: "#4a4a7a", bed: "#3a6a3a", resident: 9090, art: 303 });
  flat(1, 1, "604", { tone: "#dde8d8", accent: "#3ee08f", sofa: "#6a5a3a", bed: "#7a3a3a", resident: 7171, art: 404 });
  k.rects[f].push(wall(g, -10, -10.5, -10, Z0, h, hallWall, y), wall(g, -10, -7.5, -10, Z1, h, hallWall, y));
  k.light(f, -4.5, -14, "#ffe6c8", 7);
  k.light(f, 6.5, -14, "#ffe6c8", 7);
  k.light(f, -4.5, -4, "#ffe2b8", 7);
  k.light(f, 6.5, -4, "#ffe2b8", 7);
}
