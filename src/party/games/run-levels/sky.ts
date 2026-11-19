/**
 * SKY CHAIN: the first CONSENSUS RUN course, by day, floating high over ZStreet. A transaction's
 * trip through the chain: out of the MEMPOOL, through the PROOF CHECK (doors: only the valid proofs
 * break), the GOSSIP SWEEP (spinning bars), the EQUIHASH HAMMERS, the FORK CHOICE (seesaws), the UNCLE
 * BLOCKS (crumbling tiles, sliding platforms) and up the FINALITY CLIMB (belts, bumpers, a boost).
 */
import * as THREE from "three";
import { T } from "../../../i18n/lang";
import { rng } from "../../kit";
import { GEO, canvasTex, label, qTex, skyDome, skyline } from "../../k3";
import { Bake, Crowd, Flags, Pieces, TAU, cel, far, puff, sunAt, type Level } from "./kit";

/** Where the climb starts (its pad); everything after it is laid from here. */
const C0 = 171.5;
const FIN_S = C0 + 31.5;

/** The city's ground from high above, one 64 m tile of 4 × 4 blocks: streets, pavements, parks, squares, car parks. */
function groundTex(rnd: () => number) {
  return canvasTex(
    512,
    512,
    (g) => {
      g.fillStyle = "#62718c";
      g.fillRect(0, 0, 512, 512);
      // the streets' centre lines
      g.fillStyle = "#8b98b0";
      for (let i = 0; i < 4; i++)
        for (let d = 6; d < 512; d += 22) {
          g.fillRect(d, i * 128 - 1, 12, 2);
          g.fillRect(i * 128 - 1, d, 2, 12);
        }
      const lots = ["#93a2ba", "#8a9ab4", "#9aa6b8", "#8e9cb0"];
      for (let by = 0; by < 4; by++)
        for (let bx = 0; bx < 4; bx++) {
          const x0 = bx * 128 + 12,
            y0 = by * 128 + 12;
          // the pavement round the block, then its lot
          g.fillStyle = "#b4c0d2";
          g.fillRect(x0, y0, 104, 104);
          const kind = rnd();
          if (kind < 0.16) {
            // a park: lawn, paths, trees
            g.fillStyle = "#86bd72";
            g.fillRect(x0 + 5, y0 + 5, 94, 94);
            g.fillStyle = "#cfd8c0";
            g.fillRect(x0 + 5, y0 + 48, 94, 8);
            g.fillRect(x0 + 48, y0 + 5, 8, 94);
            g.fillStyle = "#5c9a52";
            for (let t = 0; t < 9; t++) g.fillRect(x0 + 10 + Math.floor(rnd() * 5) * 17, y0 + 10 + Math.floor(rnd() * 5) * 17, 11, 11);
          } else if (kind < 0.26) {
            // a car park: bays
            g.fillStyle = "#77849c";
            g.fillRect(x0 + 5, y0 + 5, 94, 94);
            g.fillStyle = "#c9d2e0";
            for (let t = 0; t < 8; t++) {
              g.fillRect(x0 + 10 + t * 11, y0 + 12, 2, 28);
              g.fillRect(x0 + 10 + t * 11, y0 + 64, 2, 28);
            }
          } else {
            g.fillStyle = lots[(bx * 3 + by) % lots.length];
            g.fillRect(x0 + 5, y0 + 5, 94, 94);
          }
        }
    },
    true,
  );
}
/** A tower's windows (white: the tower's colour tints them), a few lit. */
function windowTex(rnd: () => number) {
  return canvasTex(
    64,
    128,
    (g) => {
      g.fillStyle = "#ffffff";
      g.fillRect(0, 0, 64, 128);
      for (let y = 4; y < 128; y += 8)
        for (let x = 3; x < 64; x += 8) {
          g.fillStyle = rnd() < 0.22 ? "#f4fbff" : "#9db0c8";
          g.fillRect(x, y, 5, 5);
        }
    },
    true,
  );
}
/** The river from above: water between two pale banks, a few lighter streaks (it scrolls along its length). */
function riverTex() {
  return canvasTex(
    64,
    64,
    (g) => {
      g.fillStyle = "#c9d6e4";
      g.fillRect(0, 0, 64, 64);
      g.fillStyle = "#5fa8e0";
      g.fillRect(4, 0, 56, 64);
      g.fillStyle = "#86c4f0";
      for (const [x, y, h] of [
        [12, 6, 18],
        [30, 30, 22],
        [46, 10, 14],
        [20, 44, 12],
        [40, 52, 10],
      ])
        g.fillRect(x, y, 2, h);
    },
    true,
  );
}

export const SKY: Level = {
  key: "sky",
  title: "SKY CHAIN",
  titleZh: "天空链",
  tag: "By day over ZStreet: valid proofs, sweeps, hammers, seesaws, crumbling blocks",
  tagZh: "白天的 ZStreet 上空：有效证明、横扫、重锤、跷跷板、碎块",
  song: "bouncy",
  ambience: "city-day",
  look: {
    sky: ["#2f80f0", "#bfe0ff"],
    fog: [90, 400],
    post: "#2b2350",
    gate: ["#ffffff", "#6a52d6"],
    slabTh: 1.3,
    thrusters: true,
    lips: true,
    ham: ["#cfd3e6", "#ff6b35", "#ffffff", "#3a3160"],
    movers: ["#ffd23f", "#c4b1fc"],
  },
  grav: 30,
  jumpV: 10.6,
  secs: [
    { s: -8, en: "MEMPOOL", zh: "内存池", sh: "MEMPOOL", shZh: "内存池", c: "#c4b1fc" },
    { s: 9, en: "PROOF CHECK", zh: "验证明关", sh: "PROOFS", shZh: "验证", c: "#3fe0c8" },
    { s: 40.5, en: "GOSSIP SWEEP", zh: "广播横扫", sh: "SWEEP", shZh: "横扫", c: "#ffb02e" },
    { s: 68, en: "EQUIHASH HAMMERS", zh: "Equihash 重锤", sh: "HAMMERS", shZh: "重锤", c: "#ff6b35" },
    { s: 99.5, en: "FORK CHOICE", zh: "分叉抉择", sh: "FORKS", shZh: "分叉", c: "#ff5fa2" },
    { s: 133, en: "UNCLE BLOCKS", zh: "叔块乱跳", sh: "UNCLES", shZh: "叔块", c: "#62bfff" },
    { s: C0, en: "FINALITY CLIMB", zh: "最终确认", sh: "CLIMB", shZh: "冲顶", c: "#8ee35b" },
  ],
  pal: [
    ["#b9a4ff", "#d9ceff", "#5b46b8"],
    ["#3fd3bd", "#8aecdb", "#1b7d72"],
    ["#ffc24a", "#ffe08a", "#b8701a"],
    ["#646a8c", "#7f86aa", "#2e3150"],
    ["#ff8cbf", "#ffc4de", "#a8386d"],
    ["#7ec8ff", "#c2e6ff", "#2f74ad"],
    ["#86df55", "#c0f09c", "#3d7a1c"],
  ],
  slabs: [
    [-7.25, 7.25, -8, 9, 0, 0, 0],
    [-7.25, 7.25, 9, 37.5, 0, 0, 1],
    [-3, 3, 37.5, 40.5, 0, 0, 1],
    [-8, 8, 40.5, 68, 0, 0, 2],
    [-3.5, 3.5, 68, 99.5, 0, 0, 3],
    [-4.5, 8.4, 99.5, 103, 0, 0, 4],
    [-6.5, 6.5, 133, 136.5, 0, 0, 5],
    [-7.6, 6.2, C0, C0 + 4, 0, 0, 6],
    [-4.2, 6.2, C0 + 4, C0 + 28, 0, 6, 6],
    [-7.6, -4.6, C0 + 8.6, C0 + 28, 4.6, 6, 6],
    [-7.6, 7.6, C0 + 28, C0 + 39, 6, 6, 6],
  ],
  cps: [
    { s: 0, y: 0, x0: -4.5, x1: 4.5 },
    { s: 39, y: 0, x0: -2.2, x1: 2.2 },
    { s: 69, y: 0, x0: -2.4, x1: 2.4 },
    { s: 100.3, y: 0, x0: -3.4, x1: 3.4 },
    { s: 133.8, y: 0, x0: -4.6, x1: 4.6 },
    { s: C0 + 0.8, y: 0, x0: -3, x1: 5 },
  ],
  fin: { s: FIN_S, y: 6, x0: -7.6, x1: 7.6 },
  gateW: 14.4,
  zones: [
    { k: "doors", s1: 28.6 },
    { k: "go", s1: 40.5, w: 1.6, lim: 2.2, sc1: [37.6, 2.6] },
    { k: "sweep", s1: 68, w: 3.6, narrow: [63, 2, 2.4] },
    { k: "hams", s1: 99.5, w: 1.8, lim: 2.3 },
    { k: "saws", s1: 132.5 },
    { k: "blocks", s1: C0 - 0.3, sc2x: -4.9 },
    { k: "climb", s1: 1e9 },
  ],
  rolls: [30, 125],
  arches: [
    [-7.8, -7.25, 7.25, 0, "MEMPOOL", "内存池", "#6a52d6"],
    [9.5, -7.25, 7.25, 0, "PROOF CHECK · VALID PROOFS BREAK", "验证明 · 有效证明的门能撞开", "#16a08c", 1.0],
    [41, -8, 8, 0, "GOSSIP SWEEP", "广播横扫", "#e07b00"],
    [68.5, -3.5, 3.5, 0, "EQUIHASH HAMMERS", "Equihash 重锤", "#e04a14"],
    [100, -4.5, 8.4, 0, "FORK CHOICE", "分叉抉择", "#d23a84"],
    [133.4, -6.5, 6.5, 0, "UNCLE BLOCKS", "叔块乱跳", "#2f8fd6"],
    [C0 + 0.4, -7.6, 6.2, 0, "FINALITY CLIMB", "最终确认", "#3d9a1c"],
    [FIN_S, -7.6, 7.6, 6, "FINALITY!", "最终确认！", "#ff6b35", 1.5, 7.2],
  ],
  walls: [
    { s: 16, real: 3 },
    { s: 27.5, real: 2 },
  ],
  sweeps: [
    { cx: 0, cs: 47.5, R: 6.4, n: 2, w: 1.25 },
    { cx: 0, cs: 61, R: 6.4, n: 3, w: -1.05 },
  ],
  hams: [
    { s: 73.5, T: 2.8, ph: 0 },
    { s: 80, T: 2.5, ph: 1.9 },
    { s: 86.5, T: 2.3, ph: 3.6 },
    { s: 93, T: 2.1, ph: 5.1 },
  ],
  pillars: { x: 7.6, s: [72, 76.6, 81.2, 85.8, 90.4, 95], exit: [95.5, 6.5, 104] },
  saws: [
    { cx: -1.5, s0: 104.5, s1: 112.5, hw: 4.5 },
    { cx: 2, s0: 114, s1: 122, hw: 4.5 },
    { cx: 0, s0: 123.5, s1: 131.5, hw: 5 },
  ],
  tiles: { rows: [139.6, 144.5, 149.4, 163.5, 168.4], cols: [-4.9, 0, 4.9], size: 3.6, colors: ["#4fb6ff", "#a98cff"] },
  lanes: [
    { s0: 152.7, s1: 155.7, per: 3.6, ph: 0, cs: [-3, 3], amp: 2.6, hw: 1.8 },
    { s0: 157.2, s1: 160.2, per: 3.1, ph: Math.PI / 2, cs: [-3, 3], amp: 2.6, hw: 1.8 },
  ],
  climb: C0,

  scenery(k) {
    const { scene: sc, rnd, ink, slabs, deco, lights, fx, world } = k;
    // (the scenery's own stream. The game's `rnd` is only drawn from where it always was, and as often:
    // the race that follows depends on how many numbers the scenery took)
    const dr = rng(0x5c1a1);
    // a mid-morning sun from the right, a little behind: the shadows fall across the course
    sunAt(world, 152, 47);
    skyDome(sc, { sky: ["#1f6ae6", "#bfe0ff"], ground: "#bfe0ff", clouds: 18, disc: { az: 152, el: 47, size: 8, glow: 6 }, haze: 0.4, rnd: dr });

    // the signs to the two shortcuts
    const sideSign = label(T("SIDECHAIN ▸", "侧链 ▸"), 0.7, "#ffffff", "#ff6b35");
    sideSign.position.set(7.4, 2.6, -66.2);
    sc.add(sideSign);
    slabs.box("#2b2350", 0.25, 2.4, 0.25, 7.4, 1.2, -66.3);
    const boostSign = label(T("BOOST ▲", "弹射 ▲"), 0.6, "#ffffff", "#ff6b35");
    boostSign.position.set(-6, 2.3, -(C0 + 0.2));
    sc.add(boostSign);
    slabs.box("#2b2350", 0.2, 2.0, 0.2, -6, 1.0, -(C0 + 0.1));

    // the chain itself, hanging in the sky each side of the course: big golden Z-Blocks, linked (far
    // off and huge: nothing to pick up)
    const qs: { x: number; y: number; z: number; ph: number; s: number }[] = [];
    const pQ = far(new Pieces(sc, GEO.box, cel({ map: qTex(), emissive: 0x3a2600 }), 16, 0.1, ink));
    const links = new Bake();
    for (let i = 0; i < 16; i++) {
      const side = i % 2 ? 1 : -1;
      const n = i >> 1;
      qs.push({ x: side * (44 + rnd() * 5), y: (side < 0 ? -15 : 9) + rnd() * 3, z: -(-20 + n * 34 + rnd() * 5), ph: rnd() * TAU, s: 4.6 + rnd() * 1.1 });
      if (n > 0) {
        const a = qs[i - 2],
          b = qs[i];
        const len = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
        links.box("#3a3160", 0.7, 0.7, len, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2, Math.atan2(b.y - a.y, Math.abs(b.z - a.z)), Math.atan2(a.x - b.x, a.z - b.z), 0);
      }
    }
    far(links.build(sc, GEO.box, cel()));
    // transactions drifting up from the city (orange: transparent; green: shielded)
    const parcels: typeof qs = [];
    const pParcel = far(new Pieces(sc, GEO.box, cel(), 26, 0.03, ink));
    for (let i = 0; i < 26; i++) {
      const side = rnd() < 0.5 ? 1 : -1;
      parcels.push({ x: side * (15 + rnd() * 16), y: -14 + rnd() * 26, z: -(rnd() * 210), ph: rnd() * TAU, s: 0.5 + rnd() * 0.45 });
      pParcel.tint(i, rnd() < 0.6 ? "#ff8a5a" : "#3ee08f");
    }
    const balloons = new Bake();
    const bcol = ["#ff6b35", "#3ec6ff", "#8ee35b", "#ff5fa2", "#ffd23f", "#c4b1fc"];
    for (let i = 0; i < 14; i++) {
      const fin2 = i >= 7;
      const side = i % 2 ? 1 : -1;
      const x = side * (8.6 + (i % 3) * 0.9);
      const s = fin2 ? C0 + 29 + (i % 4) * 2.4 : -6 + (i % 4) * 3.5;
      const y = (fin2 ? 6 : 0) + 4.4 + (i % 3) * 0.8;
      balloons.box(bcol[i % bcol.length], 1.0, 1.25, 1.0, x, y, -s);
      lights.box("#ffffff", 0.03, 3.2, 0.03, x, y - 2.2, -s);
    }
    balloons.build(sc, GEO.ball, cel(), 0.04, ink);

    // the clouds, in voxels: a sea of them under the course (you're high up), two decks drifting at
    // their own pace, and a few high ones
    const seaA = new Bake(),
      seaB = new Bake(),
      high = new Bake();
    for (let i = 0; i < 18; i++) {
      const low = i < 8;
      const cx = (rnd() < 0.5 ? -1 : 1) * (18 + rnd() * 50);
      const cz = -(rnd() * 240 - 20);
      const cy = low ? -16 - rnd() * 10 : 26 + rnd() * 18;
      const n = 3 + Math.floor(rnd() * 3);
      let w = 10 + n * 2;
      for (let j = 0; j < n; j++) w += rnd() + rnd() + rnd();
      puff(low ? seaA : high, dr, low ? cx * 1.2 : cx * 1.6, cy, cz, low ? w * 1.2 : w * 1.5, "#ffffff", dr() * 0.6 - 0.3);
    }
    for (let i = 0; i < 40; i++) {
      // (more of the sea, wider than the game's own few; none right under the course, where the city shows)
      const deep = i % 2 === 1;
      const x = (dr() < 0.5 ? -1 : 1) * (deep ? 10 + dr() * 190 : 24 + dr() * 130);
      const z = 90 - dr() * 460;
      puff(deep ? seaB : seaA, dr, x, deep ? -36 - dr() * 12 : -15 - dr() * 12, z, deep ? 30 + dr() * 26 : 16 + dr() * 16, deep ? "#eef4ff" : "#ffffff", dr() * 0.8 - 0.4);
    }
    for (let i = 0; i < 8; i++) puff(high, dr, (dr() < 0.5 ? -1 : 1) * (70 + dr() * 150), 30 + dr() * 40, 120 - dr() * 520, 26 + dr() * 22, "#ffffff", dr() * 0.8 - 0.4);
    const cloudMat = cel({ emissive: 0x8f9cba });
    const cloudSets = [seaA, seaB, high].map((b) => far(b.build(sc, GEO.box, cloudMat)));

    // airships cruising past the course, a Z on their gondolas
    const ships: { x: number; y: number; z0: number; v: number; ph: number }[] = [];
    for (let i = 0; i < 3; i++) ships.push({ x: (i % 2 ? 1 : -1) * (34 + i * 9), y: 16 + i * 6, z0: rnd() * 240, v: 2.2 + rnd() * 1.4, ph: rnd() * TAU });
    const pEnv = far(new Pieces(sc, GEO.ball, cel(), 3, 0.08, ink));
    const pGon = far(new Pieces(sc, GEO.box, cel({ map: qTex(), emissive: 0x2a1c00 }), 3, 0.05, ink));
    const pFin = far(new Pieces(sc, GEO.box, cel(), 6, 0.04, ink));
    ["#ff6b35", "#3ec6ff", "#ff5fa2"].forEach((c, i) => (pEnv.tint(i, c), pFin.tint(i * 2, "#ffffff"), pFin.tint(i * 2 + 1, "#ffffff")));
    let glint = 0;
    const at = new THREE.Vector3();
    // the ZEC BLIMP moored behind the start, broadside (the look back down the course ends on it)
    const hull = new Bake();
    hull.box("#ff6b35", 27, 9.5, 9.5, 3, 17.5, 46);
    far(hull.build(sc, GEO.ball, cel(), 0.1, ink));
    const rig = new Bake();
    rig.box("#3a3160", 7, 1.8, 2.6, 3, 11.9, 46);
    for (const [dy, sy, sz] of [
      [3.2, 4.6, 0.3],
      [-3.2, 4.6, 0.3],
      [0, 0.3, 8.4],
    ])
      rig.box("#ffffff", 4.4, sy, sz, 15.2, 17.5 + dy, 46);
    for (let i = 0; i < 5; i++) lights.box("#fff6b0", 0.7, 0.6, 0.1, 0.6 + i * 1.2, 12.1, 44.66);
    far(rig.build(sc, GEO.box, cel(), 0.06, ink));
    const blimpName = label(T("ZEC BLIMP", "ZEC 飞艇"), 2.3, "#ffffff", "");
    blimpName.position.set(3, 17.5, 41.2);
    blimpName.rotation.y = Math.PI;
    sc.add(blimpName);

    // the city far below. Its far skyline, pale in the haze…
    const ring = far(skyline(sc, { r: 300, n: 80, y: -70, rnd, tall: 2 }));
    ring.position.z = -100;
    const hazy = ["#86a2c8", "#93abcc", "#7f9cc4", "#9db3d2", "#8aa0c0"];
    const tmpC = new THREE.Color();
    for (let i = 0; i < 80; i++) ring.setColorAt(i, tmpC.set(hazy[i % hazy.length]));
    // …the streets, a river through them…
    const ground = far(new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ map: groundTex(dr), color: "#d4dfee" })));
    (ground.material as THREE.MeshBasicMaterial).map!.repeat.set(22, 22);
    ground.rotation.x = -Math.PI / 2;
    ground.scale.set(1408, 1408, 1);
    ground.position.set(0, -70, -96);
    sc.add(ground);
    const RA = 0.6;
    const RX = Math.cos(RA),
      RZ = Math.sin(RA);
    /** How far a spot is from the river's middle (it runs aslant under the SWEEP), and how far along it. */
    const riverD = (x: number, z: number) => Math.abs(x * RZ - (z + 62) * RX);
    const flow = riverTex();
    flow.repeat.set(1, 40);
    const river = far(new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ map: flow, color: "#e6f0fa" })));
    river.rotation.set(-Math.PI / 2, 0, Math.PI / 2 - RA);
    river.scale.set(44, 1500, 1);
    river.position.set(0, -69.7, -62);
    sc.add(river);
    // …and its buildings: low blocks on the streets' grid (roofs, from here), a few tall ones nearer
    const city = new Bake();
    const towers = new Bake();
    const rc = ["#e9dccb", "#c9d6e6", "#f2c9a0", "#b9c7d8", "#ddd0f0", "#f0e6d0", "#cfe0d0", "#e6c9c0"];
    const cell = (v: number) => Math.floor(v / 16) * 16 + 8;
    const lot = (x: number, z: number, h: number, wd: number, c: string) => {
      if (riverD(x, z) < 26 + wd / 2) return;
      city.box(c, wd, h, wd, x, -70 + h / 2, z);
      // (a lighter parapet, a darker hut on the roof: what a roof is from above)
      if (wd > 8.5) city.box("#8c98ad", wd * 0.34, 1.4, wd * 0.3, x + wd * 0.18, -70 + h + 0.7, z - wd * 0.2);
    };
    for (let i = 0; i < 90; i++) {
      const x = (rnd() < 0.5 ? -1 : 1) * (4 + rnd() * 90);
      const z = -(rnd() * 300 - 50);
      const h = 6 + rnd() * rnd() * 34;
      const wd = 6 + rnd() * 8;
      lot(cell(x), cell(z), Math.min(h, 30), Math.min(wd, 11.5), rc[i % rc.length]);
    }
    for (let i = 0; i < 420; i++) {
      const x = cell((dr() - 0.5) * 520),
        z = cell(140 - dr() * 600);
      lot(x, z, 5 + dr() * dr() * 30, 7 + dr() * 4.5, rc[Math.floor(dr() * rc.length)]);
    }
    const tc = ["#7e96bc", "#8da3c4", "#a39c96", "#8fa8b8", "#9a92b8"];
    for (let i = 0; i < 23; i++) {
      // (the tall ones, well off the course: their tops near its height, some over it; a few stand
      // behind the start and past the finish, where the looks back and ahead end)
      const side = i % 2 ? 1 : -1;
      const ends = [-74, 150, -30, 190, 38, 168, 84, 142, -52, -335, 22, -362, 72, -340];
      const x = cell(i < 16 ? side * (105 + dr() * 90) : ends[(i - 16) * 2]),
        z = cell(i < 16 ? 70 - (i / 16) * 380 + dr() * 20 : ends[(i - 16) * 2 + 1]);
      if (riverD(x, z) < 34) continue;
      const w = 12 + dr() * 3,
        h = 52 + dr() * 44;
      const c = tc[i % tc.length];
      towers.box(c, w, h, w, x, -70 + h / 2, z);
      towers.box(c, w * 0.66, h * 0.16, w * 0.66, x, -70 + h * 1.08, z);
      city.box("#dfe6f0", w * 0.72, 0.8, w * 0.72, x, -70 + h * 1.16 + 0.4, z);
      city.box("#6f7f9c", 0.7, h * 0.14, 0.7, x, -70 + h * 1.23, z);
    }
    far(city.build(sc, GEO.box, cel()));
    far(towers.build(sc, GEO.box, cel({ map: windowTex(dr) })));
    // barges on the river
    const boats: { u: number; v: number; off: number }[] = [];
    for (let i = 0; i < 7; i++) boats.push({ u: dr() * 600, v: (i % 2 ? 1 : -1) * (3 + dr() * 3), off: (i % 2 ? 1 : -1) * (5 + dr() * 9) });
    const pBoat = far(new Pieces(sc, GEO.box, cel(), boats.length * 2));
    boats.forEach((_, i) => (pBoat.tint(i * 2, i % 3 ? "#f4f6fa" : "#ff8a5a"), pBoat.tint(i * 2 + 1, "#b8dcf8")));

    // the stands, floating beside the start and the finish: the crowd on them
    const crowd = new Crowd();
    for (const [s0, y0] of [
      [-1, 0],
      [FIN_S + 3.5, 6],
    ])
      for (const side of [-1, 1]) {
        const x = side * 14.6;
        slabs.box("#5b46b8", 4.6, 0.6, 9.4, x, y0 - 0.9, -s0);
        slabs.box("#7a66d6", 2.2, 0.7, 9.4, x + side * 1.2, y0 - 0.3, -s0);
        deco.box("#ffd23f", 0.16, 0.16, 9.4, x - side * 2.2, y0 + 0.25, -s0);
        for (const dz of [-4.6, 0, 4.6]) deco.box("#ffffff", 0.14, 0.9, 0.14, x - side * 2.2, y0 - 0.2, -(s0 + dz));
        for (const dz of [-2.6, 2.6]) {
          deco.box("#54486e", 1.2, 0.8, 1.2, x, y0 - 1.5, -(s0 + dz));
          lights.box("#ff9a52", 0.8, 0.5, 0.8, x, y0 - 2.1, -(s0 + dz));
        }
        for (let r = 0; r < 2; r++)
          for (let j = 0; j < 8; j++) crowd.add(x - side * 1.3 + side * r * 2.1 + (dr() - 0.5) * 0.3, y0 - 0.6 + r * 0.65, -(s0 - 4 + j * 1.14 + (dr() - 0.5) * 0.3), (side * -Math.PI) / 2, dr);
      }
    crowd.build(sc, ink);
    // pennants over every arch, in its stretch's colour
    const flags = new Flags();
    SKY.arches.forEach(([s, x0, x1, y, , , bg, , top = 8.1], i) => {
      for (const px of [x0 - 0.7, x1 + 0.7]) {
        deco.box("#ffffff", 0.1, 1.9, 0.1, px, y + top + 1.2, -s);
        flags.add(px, y + top + 1.7, -s, 0.5, 1.9, 0.8, i === SKY.arches.length - 1 ? "#ffd23f" : bg);
      }
    });
    flags.build(sc);
    // gulls wheeling beside the course
    const gulls: { cx: number; cy: number; cz: number; r: number; w: number; ph: number }[] = [];
    for (let i = 0; i < 14; i++) {
      const f = i < 7 ? 0 : 1;
      gulls.push({ cx: f ? 25 : -22, cy: (f ? 15 : 10) + dr() * 5, cz: f ? -150 : -45, r: 9 + dr() * 9, w: (f ? -1 : 1) * (0.32 + dr() * 0.16), ph: dr() * TAU });
    }
    const pGull = far(new Pieces(sc, GEO.box, cel(), gulls.length * 3));
    gulls.forEach((_, i) => (pGull.tint(i * 3, "#ffffff"), pGull.tint(i * 3 + 1, "#dfe6f2"), pGull.tint(i * 3 + 2, "#dfe6f2")));

    return (now, dt) => {
      qs.forEach((q, i) => pQ.put(i, q.x, q.y + Math.sin(now * 0.5 + q.ph) * 0.5, q.z, q.s, q.s, q.s, 0, Math.sin(now * 0.23 + q.ph) * 0.3, 0));
      pQ.flush();
      cloudSets[0].mesh.position.x = Math.sin(now * 0.03) * 16;
      cloudSets[1].mesh.position.x = Math.sin(now * 0.02 + 2) * 26;
      cloudSets[2].mesh.position.x = Math.sin(now * 0.016 + 4) * 30;
      ships.forEach((sh, i) => {
        const z = -(((sh.z0 + now * sh.v) % 260) - 30);
        const y = sh.y + Math.sin(now * 0.6 + sh.ph) * 0.8;
        pEnv.put(i, sh.x, y, z, 4.2, 4.2, 11, 0, 0, Math.sin(now * 0.5 + sh.ph) * 0.04);
        pGon.put(i, sh.x, y - 2.6, z, 1.4, 1.0, 3.0);
        pFin.put(i * 2, sh.x, y + 1.6, z + 5, 0.2, 2.2, 2.0);
        pFin.put(i * 2 + 1, sh.x, y, z + 5, 4.4, 0.2, 2.0);
      });
      pEnv.flush();
      pGon.flush();
      pFin.flush();
      // (a glint off a block of the chain now and then)
      glint -= dt;
      if (glint <= 0) {
        glint = 0.5 + dr() * 0.7;
        const q = qs[Math.floor(dr() * qs.length)];
        fx.burst(at.set(q.x - Math.sign(q.x) * q.s * 0.5, q.y + q.s * 0.5, q.z), 5, ["#fff6b0", "#ffffff"], { speed: 3, up: 2, gravity: 0, size: 0.4, life: 0.9 });
      }
      parcels.forEach((q, i) => {
        const y = ((q.y + now * 1.6 + 30) % 40) - 18;
        pParcel.put(i, q.x + Math.sin(now * 0.7 + q.ph) * 0.6, y, q.z, q.s, q.s, q.s, now * 0.5 + q.ph, now * 0.8, 0);
      });
      pParcel.flush();
      crowd.tick(now, 0.5);
      flags.tick(now);
      gulls.forEach((b, i) => {
        const a = now * b.w + b.ph;
        const x = b.cx + Math.cos(a) * b.r,
          z = b.cz + Math.sin(a) * b.r * 1.5;
        const y = b.cy + Math.sin(a * 2 + b.ph) * 1.2;
        // (heading along its circle; the wings beat, then glide a while)
        const hd = Math.atan2(-Math.sin(a) * Math.sign(b.w), Math.cos(a) * 1.5 * Math.sign(b.w));
        const beat = Math.sin(now * 9 + b.ph * 3) * (Math.sin(now * 0.9 + b.ph) > -0.2 ? 0.7 : 0.12);
        pGull.put(i * 3, x, y, z, 0.22, 0.16, 0.7, 0, hd, 0);
        const cs = Math.cos(hd),
          sn = Math.sin(hd);
        for (const e of [1, -1]) pGull.put(i * 3 + (e > 0 ? 1 : 2), x + cs * e * 0.42, y + Math.abs(beat) * 0.1, z - sn * e * 0.42, 0.8, 0.05, 0.34, 0, hd, e * beat);
      });
      pGull.flush();
      flow.offset.y = (now * 0.01) % 1;
      boats.forEach((b, i) => {
        const u = ((((b.u + now * b.v) % 600) + 600) % 600) - 300;
        const x = RX * u + RZ * b.off,
          z = -62 + RZ * u - RX * b.off;
        pBoat.put(i * 2, x, -69.2, z, 9, 1.2, 3.2, 0, -RA, 0);
        pBoat.put(i * 2 + 1, x - RX * Math.sign(b.v) * 9, -69.6, z - RZ * Math.sign(b.v) * 9, 11, 0.1, 1.6, 0, -RA, 0);
      });
      pBoat.flush();
    };
  },
};
