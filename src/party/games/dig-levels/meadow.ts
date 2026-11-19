/**
 * MEADOW MINE (the first level): a chunk of meadow floating over ZStreet on a sunny day. Topsoil,
 * clay, stone, amethyst, magma; two steel slabs, the crystal CAVE between the middle lanes (a crumbly
 * chute for the outer ones), a lava pocket in each lane, and from 24 s the QUAKE.
 */
import * as THREE from "three";
import { GEO, clouds, label, skyDome, skyline, toon } from "../../k3";
import { DAY_CITY, cityGrid, cloudDeck, ground } from "../sign-levels/vista";
import { bobbers, flock } from "./props";
import { AMETH, CLAY, DIRT, GRANITE, HOT, LAVA, LAVA_POOL, MAGMA, ROWS, STONE, CRUMB, EMPTY, GRASS, HC, colX, type Box, type DigLevel } from "./common";

/** The city's streets under the island (m). */
const CITY_Y = -135;
const SLAB_A = 7;
const SLAB_B = 24;
const CAVE_ROOF = 15;
const CAVE_TOP = 16;
const CAVE_BOT = 19;

export const MEADOW: DigLevel = {
  key: "meadow",
  title: "MEADOW MINE",
  titleZh: "草地矿场",
  tag: "Over ZStreet on a sunny day: two steel slabs, the crystal cave, lava in the magma",
  tagZh: "晴天的 ZStreet 上空：两层钢板、水晶洞穴、岩浆层里的岩浆",
  ambience: "meadow",
  sky: ["#3f9dff", "#cdeeff"],
  fog: [90, 320],
  sun: ["#ffecd0", 2.05],
  fill: ["#bfe0ff", 0.5],
  layers: [
    { to: 1, mat: GRASS, en: "GRASS", zh: "草地", c: "#6cc24a", c2: "#5cb13c", wall: "#3d6e2a", ore: ["#efe0c0"] },
    { to: 8, mat: DIRT, en: "TOPSOIL", zh: "表土", c: "#c98a52", c2: "#b77a45", wall: "#55311a", ore: ["#efe0c0", "#7c5b3a", "#d9c7a4"] },
    { to: 15, mat: CLAY, en: "CLAY", zh: "黏土", c: "#ee8a4c", c2: "#d9763d", wall: "#6a3018", ore: ["#fff4de", "#f6e3c2"] },
    { to: 22, mat: STONE, en: "STONE", zh: "岩石", c: "#a3afc4", c2: "#909cb3", wall: "#3a4258", ore: ["#eef3fb", "#c9d4e6"] },
    { to: 29, mat: AMETH, en: "AMETHYST", zh: "紫晶", c: "#9a6ed9", c2: "#8659c4", wall: "#30205a", ore: ["#c9a6ff"], shine: ["#f0b6ff", "#8af0ff"] },
    { to: ROWS, mat: MAGMA, en: "MAGMA", zh: "岩浆岩", c: "#8a4658", c2: "#763b4b", wall: "#2a1420", ore: ["#3a1e28"], shine: ["#ff7a1a", "#ffb02e"] },
  ],
  walls: [2, 5, 8],
  slabs: [SLAB_A, SLAB_B],
  cave: { roof: CAVE_ROOF, top: CAVE_TOP, bot: CAVE_BOT },
  quake: ["QUAKE! WATCH THE ROOF!", "地震！小心头顶！"],
  pool: LAVA_POOL,
  pal: {
    granite: ["#58627e", "#626c8a"],
    obsid: ["#3a2a55", "#45325f"],
    crumb: ["#e0cb98", "#ecdcae"],
    hot: ["#a8331f", "#bb3f27"],
    ice: ["#9fd8ff", "#b6e4ff"],
    snow: ["#eef6ff", "#ffffff"],
  },
  rock: "#a2a9b8",
  top: "#86dc5e",
  isle: ["#7a5a48", "#86dc5e"],
  crown: "tree",
  fence: ["#8a5a32", "#c98a52", "#ffd23f"],
  wood: ["#8a5a32", "#a8703e"],
  sign: ["#ffd23f", "#c98a00", "#5a2d00"],
  says: { 3: ["STONE · 4 HITS", "岩石 · 四下", "#ffffff"], 5: ["MAGMA · MIND THE LAVA!", "岩浆层 · 小心岩浆！", "#ff8a3c"] },
  caveSay: ["THE CAVE! MIND THE ROOF", "洞穴！小心头顶", "#8af0ff"],

  /**
   * Four lanes two blocks wide, walled off by brick nothing breaks, with NONCE blocks set into the
   * walls. The two middle lanes meet in the CAVE. Topsoil with boulders; steel slab A with one gap per
   * lane; clay with granite and a sand vein; the CAVE between the two middle lanes (a crumbly roof,
   * stalactites, a nonce on its floor) and a crumbly chute for the outer ones; amethyst round steel
   * slab B; magma with a lava pocket in each lane, hot rock round it (one hit, but the lava follows).
   */
  gen(k) {
    const { set, pick, any, vein, boulder, nonce, slab } = k;
    const A = [0, 1];
    const B = [3, 4];
    // TOPSOIL (1…6)
    boulder(pick(A), any(2, 3));
    boulder(pick(B), any(4, 5));
    nonce(2, any(4, 5));
    slab(SLAB_A);
    // CLAY (8…14)
    for (const L of [A, B]) {
      const c = pick(L);
      const r = any(9, 12);
      set(c, r, GRANITE);
      set(c, r + 1, GRANITE);
      vein(L[0] + L[1] - c, r, r + 1);
    }
    nonce(0, any(12, 13));
    nonce(5, any(10, 11));
    boulder(pick(B), any(9, 10));
    // the CAVE in the middle, the chute on the outside
    for (let c = 3; c < HC; c++) {
      set(c, CAVE_ROOF, CRUMB);
      for (let r = CAVE_TOP; r <= CAVE_BOT; r++) set(c, r, EMPTY);
    }
    nonce(4, CAVE_BOT);
    k.stal(pick([3, 4]), CAVE_TOP, CAVE_BOT + 1);
    for (let r = CAVE_ROOF; r <= CAVE_BOT; r++) set(0, r, CRUMB);
    // STONE under it
    set(pick(A), any(20, 21), GRANITE);
    set(pick(B), 21, GRANITE);
    // AMETHYST (22…28) round SLAB B
    nonce(2, any(22, 23));
    slab(SLAB_B);
    for (const L of [A, B]) {
      const c = pick(L);
      const r = any(25, 26);
      set(c, r, GRANITE);
      set(c, r + 1, GRANITE);
      vein(L[0] + L[1] - c, r, r + 2);
    }
    boulder(pick(A), any(26, 27));
    // MAGMA (29…35): the lava fills one column; the way past it is two hot blocks in the other
    const pocket = (L: number[], r: number) => {
      const c = pick(L);
      const o = L[0] + L[1] - c;
      set(c, r, LAVA);
      set(c, r + 1, HOT);
      set(o, r, HOT);
      set(o, r + 1, HOT);
    };
    const first = k.R() < 0.5;
    pocket(A, first ? any(30, 31) : any(34, 36));
    pocket(B, first ? any(34, 36) : any(30, 31));
    {
      const L = pick([0, 1]) ? A : B;
      const a = any(32, 33);
      vein(pick(L), a, a + 1);
    }
    nonce(5, any(36, 38));
  },

  /** Bushes and flowers on the grass, the city's towers far round, clouds. */
  scenery(k) {
    const { put, cos, deco, cones } = k;
    const EW = (5.5 + 1.6) * 2;
    for (let i = 0; i < 14; i++) {
      const bx = (cos() - 0.5) * (EW - 1);
      const bz = -0.5 - 1.4 - cos() * (5 - 2);
      const bs = 0.6 + cos() * 0.8;
      put(deco, bx, 0.14 + bs * 0.4, bz, bs, bs * 0.8, bs, cos() < 0.5 ? "#4fae3a" : "#62c44a");
    }
    for (let i = 0; i < 18; i++) put(deco, (cos() - 0.5) * (EW - 0.6), 0.24, -0.5 - 0.7 - cos() * (5 - 1), 0.16, 0.2, 0.16, ["#ff5fa2", "#ffd23f", "#ffffff", "#ff6b35"][i % 4]);
    for (let c = 0; c < 11; c++) if (cos() < 0.5) cones.push({ x: colX(c) + (cos() - 0.5) * 0.4, y: 0.18, z: -0.7, w: 0.22, h: 0.3, d: 0.22, c: cos() < 0.5 ? "#4fae3a" : "#6cc24a" });
    const scene = k.scene;
    // the sky all round, the city far below in its blocks (its towers ring the island closer in), clouds over it
    skyDome(scene, { sky: ["#3f9dff", "#cdeeff"], ground: "#cdeeff", clouds: 18, cloud: "#ffffff", cloudShade: "#b9d6f2", haze: 0.5, rnd: cos });
    ground(scene, CITY_Y - 1, "#a3b6cc");
    const town = cityGrid(scene, {
      y: CITY_Y,
      x0: -384,
      x1: 384,
      z0: -560,
      z1: -128,
      pitch: 32,
      street: 9,
      tall: (x, z) => 16 + 60 * Math.exp(-(x * x) / 40000) * Math.exp(-((z + 300) * (z + 300)) / 30000),
      rnd: cos,
      look: DAY_CITY,
      cars: 70,
      carSize: 3.2,
      parks: 0.14,
    });
    skyline(scene, { r: 165, y: CITY_Y, tall: 1.6, rnd: cos });
    const deck = cloudDeck(scene, { n: 16, x0: -280, x1: 280, y0: -104, y1: -64, z0: -360, z1: -70, rnd: cos, color: "#ffffff", shade: "#c2d8ee", speed: 1.2, size: 2.6 });
    const cl = clouds(scene, { n: 5, r: 120, y: -30, rnd: cos });
    // a mine cart of ore by the first headframe, a signpost, mushrooms
    put(deco, -3.2, 0.35, -2.4, 1.0, 0.5, 0.6, "#6a4a32");
    put(deco, -3.2, 0.64, -2.4, 0.86, 0.14, 0.5, "#a3afc4");
    for (const [ox, oc] of [
      [-3.45, "#ffd23f"],
      [-3.05, "#9a6ed9"],
      [-3.25, "#ff7a1a"],
    ] as [number, string][])
      put(k.lights, ox, 0.78, -2.4, 0.18, 0.16, 0.18, oc, 0, 0.6);
    for (const wx of [-3.55, -2.85]) put(deco, wx, 0.12, -2.1, 0.2, 0.2, 0.08, "#2a1e18");
    put(deco, 4.6, 0.6, -1.6, 0.1, 1.2, 0.1, "#8a5a32");
    put(deco, 4.75, 1.05, -1.6, 0.7, 0.24, 0.06, "#ffd23f", 0, -0.12);
    for (let i = 0; i < 5; i++) {
      const mx = 1.2 + i * 0.35;
      put(deco, mx, 0.16, -3.6 - (i % 2) * 0.3, 0.06, 0.14, 0.06, "#f6ead0");
      put(deco, mx, 0.25, -3.6 - (i % 2) * 0.3, 0.2, 0.08, 0.2, i % 2 ? "#ff5a5a" : "#ffffff");
    }
    // hot-air balloons drifting up and down far round, a flock of birds, a Q-blimp crossing
    const bal: (Box & { g: number })[] = [];
    const balloon = (g: number, x: number, y: number, z: number, sc: number, a: string, b: string) => {
      const p = (bx: number, by: number, w: number, h: number, c: string) => bal.push({ x: x + bx * sc, y: y + by * sc, z, w: w * sc, h: h * sc, d: w * sc, c, g });
      p(0, 2.4, 2.2, 0.8, a);
      p(0, 1.6, 2.8, 0.9, b);
      p(0, 0.8, 2.6, 0.8, a);
      p(0, 0.15, 1.8, 0.6, b);
      p(0, -0.35, 0.9, 0.4, a);
      p(0, -1.3, 0.7, 0.5, "#8a5a32");
      for (const k2 of [-1, 1]) p(k2 * 0.32, -0.85, 0.05, 0.7, "#5a3a20");
    };
    balloon(0, -48, -14, -60, 2.4, "#ff5fa2", "#ffd23f");
    balloon(1, 56, -24, -75, 2.8, "#5fd8ff", "#ffffff");
    balloon(2, -30, -36, -90, 3.2, "#ff7a1a", "#7dff8a");
    balloon(3, 34, -6, -110, 3.4, "#9a6ed9", "#ffd23f");
    const bob = bobbers(scene, bal, 2.2);
    const birds = flock(scene, 7, 0, -10, -55, 55, "#ffffff", 0.06, 1.1);
    const birds2 = flock(scene, 5, 10, -27, -70, 70, "#fff4de", -0.045, 1.3);
    const blimp = new THREE.Group();
    const hull = (w: number, h: number, d: number, x: number, c: string) => {
      const m = new THREE.Mesh(GEO.box, toon(c));
      m.scale.set(w, h, d);
      m.position.x = x;
      blimp.add(m);
    };
    hull(16, 4.2, 4.2, 0, "#f4f6fb");
    hull(20, 3.2, 3.2, 0, "#f4f6fb");
    hull(3, 1.2, 1.2, 0, "#ffd23f");
    hull(2.6, 3.6, 0.3, -10.4, "#ff5fa2");
    hull(2.6, 0.3, 3.6, -10.4, "#ff5fa2");
    hull(4, 1.2, 1.6, 1, "#3a2a50");
    const q = label("ZSTREET", 4.4, "#7a4a00", "#ffd23f");
    q.position.set(2, 0.2, 2.2);
    blimp.add(q);
    blimp.position.set(-120, -18, -95);
    scene.add(blimp);
    return (t) => {
      town.tick(t.now);
      deck.tick(t.now);
      bob(t.now);
      birds(t.now);
      birds2(t.now);
      cl.rotation.y = t.now * 0.004;
      blimp.position.x = -150 + ((t.now * 3.2) % 300);
      blimp.position.y = -18 + Math.sin(t.now * 0.4) * 0.8;
      // dust motes in the light
      if (Math.random() < t.dt * 6) t.burst((Math.random() - 0.5) * 11, t.camY + (Math.random() - 0.5) * 9, 0.6, 1, MOTES, MOTE);
    };
  },
};

const MOTES = ["#fff4c4", "#ffffff"];
const MOTE = { speed: 0.15, up: 0.15, gravity: -0.05, size: 0.05, life: 2.6, drag: 0.5 };
