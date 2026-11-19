/**
 * MARINA BAY: a night street circuit round ZStreet's Marina Bay in a tropical downpour. West along the bay past
 * the twin spiky domes of the theatre, into the shophouse streets (or straight down the lantern alley:
 * narrow, walled, a puddle in it), south along the shore past the lion fountain, under the podium of
 * the three towers with their sky park, past the glowing grove of Supertrees and over the canal jump,
 * up over the helix bridge, round the observation wheel to the line. The road is wet (it slides a
 * little), puddles drag, the rain streams, the lightning flashes.
 */
import * as THREE from "three";
import { T } from "../../../../i18n/lang";
import type { Course } from "../course";
import { LO, type Kit } from "../scenery";
import { STEP, type Track } from "../track";
import { cable, chevPaint } from "./city";

const CP = { start: 0, esplanade: 3, turnS: 4, fork: 6, west: 9, rejoin: 13, shore: 14, south: 16, tunnel0: 17, tunnel1: 19, gardens: 20, jump: 21, helix: 24, flyer: 26 };
/** The landmarks (x, z). */
export const SG = {
  sands: [0, 156],
  domes: [-58, -192],
  lion: [-104, 30],
  grove: [128, 184],
  flyer: [232, -152],
  cbd: [-250, 70],
} as const;

export const SINGAPORE: Course = {
  key: "singapore",
  title: "MARINA BAY",
  titleZh: "滨海湾",
  tag: "A night in the rain round Marina Bay: a wet road, puddles, the helix bridge, the lantern alley.",
  tagZh: "滨海湾雨夜：湿滑路面、水坑、螺旋桥、灯笼小巷。",
  song: "marina",
  ambience: "rain",
  gantry: [T("MARINA BAY NIGHT RACE", "滨海湾夜赛"), "MARINA BAY"],
  orbit: { x: 20, z: 0, r: 200, h: 80 },
  offK: 0.58,
  splash: ["#bfe6ff", "#ffffff", "#8fb8ff"],
  dust: ["#9fb8ff", "#d8e6ff", "#6a7ab0"],
  offColors: ["#2a4a3a", "#5a8a6a", "#9fb8ff"],
  mapColors: ["#5b5d6b", "#ff2a6a"],
  marks: [
    [SG.sands[0], SG.sands[1], 50],
    [SG.domes[0], SG.domes[1], 30],
    [SG.lion[0], SG.lion[1], 8],
    [SG.grove[0], SG.grove[1], 42],
    [SG.flyer[0], SG.flyer[1], 30],
  ],
  spec: {
    ctrl: [
      [120, -140], // 0 the line: along the bay, westbound
      [60, -140],
      [0, -140],
      [-50, -142], // 3 the theatre's domes
      [-100, -138],
      [-122, -118],
      [-128, -92], // 6 the fork: the lantern alley, or round the shophouses
      [-140, -74],
      [-162, -68],
      [-184, -56], // 9 the shophouse streets
      [-190, -26],
      [-182, 2],
      [-164, 12],
      [-146, 18], // 13 the alley comes out
      [-128, 44], // 14 down the shore, the lion fountain
      [-122, 76],
      [-100, 108], // 16 round to the south
      [-50, 122], // 17 under the podium of the three towers
      [0, 126],
      [50, 128],
      [96, 138], // 20 the gardens, the Supertrees
      [140, 142], // 21 the canal jump
      [176, 124],
      [192, 90],
      [196, 30], // 24 over the helix bridge
      [190, -30],
      [178, -80], // 26 round the wheel
      [160, -122],
      [140, -138],
    ],
    half: 6.2,
    laps: 3,
    city: [[CP.turnS, CP.south]],
    edges: [10.5, 8.6, 8.4, 9.2, 10.5],
    hills: [{ at: [CP.helix, 0], up: 44, flat: 56, down: 44, h: 6.5 }],
    jump: { at: [CP.gardens, -4], len: 20, h: 2.6, gap: 12 },
    tunnel: [CP.tunnel0, CP.tunnel1],
    short: { a: CP.fork, b: CP.rejoin, half: 3.3, side: -1, kind: "wall" },
    shortPatches: [{ u0: 46, u1: 56, d0: -3.4, d1: 0.9, kind: "puddle" }],
    patches: [
      { at: [2, 0], len: 14, d0: 0.8, d1: 5.4, kind: "puddle" },
      { at: [7, -6], len: 14, d0: -2, d1: 4, kind: "puddle" },
      { at: [11, -6], len: 14, d0: -5.4, d1: 0.5, kind: "puddle" },
      { at: [CP.south, -6], len: 16, d0: 0, d1: 5.6, kind: "puddle" },
      { at: [22, 4], len: 14, d0: -5.6, d1: -0.6, kind: "puddle" },
      { at: [27, -6], len: 12, d0: -1, d1: 5, kind: "puddle" },
    ],
    grip: 0.86,
    boxes: [
      [1, 10],
      [8, 0],
      [CP.shore + 1, 0],
      [CP.gardens, 0],
      [CP.flyer, 0],
    ],
    pads: [
      [3, 0],
      [CP.shore, 0],
      [19, 6],
      [CP.helix, 0],
      [28, 0],
    ],
    padJump: true,
    padShort: true,
    coins: [
      [1, 20],
      [10, 0],
      [15, 10],
      [18, 0],
      [23, 0],
      [27, 6],
    ],
  },
  theme: {
    sky: ["#070823", "#3a1f62"],
    fog: [130, 620],
    sun: { color: "#8c9cff", i: 0.6, pos: [60, 80, -40] },
    hemi: { sky: "#6a6ac0", ground: "#1a1430", i: 1.05 },
    night: true,
    wet: true,
    // (a storm's night: rain clouds lit violet by the city, the moon in a gap where the light comes from, a few stars)
    dome: { stars: 220, clouds: 12, cloud: "#5b4a92", cloudShade: "#231a48", disc: { az: 214, el: 42, moon: true, size: 6, glow: 5 }, haze: 0.45 },
    // (the moon's shadows under the towers: faint, the lamps do the lighting)
    shadowK: 0.45,
    ground: (g, S) => {
      // wet lawn at night: two dark bands, a few glints of the city's light in the puddles
      g.fillStyle = "#1c2a2c";
      g.fillRect(0, 0, S, S);
      g.fillStyle = "#213234";
      g.fillRect(0, 0, S, S / 2);
      for (let i = 0; i < 14; i++) {
        g.fillStyle = i % 3 ? "rgba(140,160,255,0.09)" : "rgba(255,120,200,0.07)";
        g.fillRect(((i * 97) % S) & ~3, ((i * 61) % S) & ~3, 40 + (i % 4) * 22, 4);
      }
    },
    groundM: 12,
    bedOpen: "#22303a",
    pave: (g) => {
      g.fillStyle = "#3a3552";
      g.fillRect(0, 0, 64, 64);
      g.fillStyle = "#2e2a44";
      for (let k = 0; k < 64; k += 16) (g.fillRect(0, k, 64, 2), g.fillRect(k, 0, 2, 64));
      g.fillStyle = "rgba(160,190,255,0.12)";
      g.fillRect(8, 20, 40, 4);
    },
    bedDeck: "#4a4a66",
    road: {
      // (wet tarmac: dark, but not so dark the bend ahead is lost; the lines shine back)
      base: "#2d3046",
      worn: "rgba(150,170,255,0.06)",
      grit: ["rgba(160,190,255,0.06)", "rgba(0,0,0,0.1)"],
      dash: "#f6f3e8",
      edge: "#dfe2f0",
      glow: 0.42,
      over: (g, S) => {
        // (long smears of the neon on the wet, down the lanes)
        for (let i = 0; i < 6; i++) {
          const x = S * (0.12 + i * 0.14);
          const gr = g.createLinearGradient(x - S * 0.03, 0, x + S * 0.03, 0);
          const c = i % 2 ? "255,80,160" : "80,220,255";
          gr.addColorStop(0, `rgba(${c},0)`);
          gr.addColorStop(0.5, `rgba(${c},0.09)`);
          gr.addColorStop(1, `rgba(${c},0)`);
          g.fillStyle = gr;
          g.fillRect(x - S * 0.03, 0, S * 0.06, S);
        }
      },
    },
    kerb: ["#ff2a6a", "#ffffff"],
    rumble: ["#00e5ff", "#1a1a2a"],
    wall: ["#ff2a6a", "#ffffff", "#00e5ff", "#ffffff"],
    town: ["#2a2440", ["#ff2a6a", "#00e5ff", "#ffd23f", "#8ee35b"]],
    cap: "#15101f",
    brick: ["#4a4260", "#3a3450"],
    bank: "#5a5470",
    water: (c) => {
      c.fillStyle = "#0b1532";
      c.fillRect(0, 0, 64, 64);
      // (soft ripples, a glint here and there)
      for (let i = 0; i < 14; i++) {
        c.fillStyle = i % 3 ? "rgba(60,90,170,0.35)" : "rgba(120,160,255,0.25)";
        c.fillRect((i * 23) % 64, (i * 41) % 64, 10 + (i % 4) * 4, 1);
      }
      c.fillStyle = "rgba(255,120,200,0.25)";
      c.fillRect(40, 12, 6, 1);
      c.fillStyle = "rgba(120,240,255,0.25)";
      c.fillRect(8, 50, 7, 1);
    },
    waterM: 26,
    waterDrift: [0.004, 0.012],
    windows: { lit: 0.5, on: "#ffe2a0", off: "#1c2240" },
    skyline: { r: 420, n: 120, tall: 2.3, pal: ["#2a2a4a", "#33335a", "#22223e", "#3a3460"] },
    clouds: 0,
    cloudColor: "#ffffff",
  },
  water: (tr) => [bayOf(tr), inlet()],
  scenery(b) {
    const tr = b.tr;
    const R = b.R;
    // (nothing stands in the water: the bay, the inlet)
    const bay = bayOf(tr),
      inl = inlet();
    const dry = (x: number, z: number, r = 0) => !inside(bay, x, -z, r + 6) && !inside(inl, x, -z, r + 4);
    const F = {
      gp: b.face(T("MARINA BAY NIGHT RACE", "滨海湾夜赛"), "#ffffff", "#ff2a6a", true),
      bay: b.face("MARINA BAY", "#00e5ff", "#120c2a", false, undefined, true),
      night: b.face(T("NIGHT RACE", "夜间赛"), "#ff5fa2", "#120c2a", false, undefined, true),
      lion: b.face(T("LION FOUNTAIN", "狮子喷泉"), "#ffd23f", "#120c2a", false, undefined, true),
      gardens: b.face(T("GARDENS", "花园"), "#8ee35b", "#120c2a", false, undefined, true),
      helix: b.face(T("HELIX BRIDGE", "螺旋桥"), "#00e5ff", "#120c2a", false, undefined, true),
      wet: b.face(T("⚠ WET ROAD", "⚠ 路面湿滑"), "#15101f", "#ffd23f"),
      chev: b.face("", "#fff", "#ff2a6a", false, chevPaint),
      qtc: b.face("ZCASH", "#ffd23f", "#120c2a", false, undefined, true),
      party: b.face("ZK PARTY", "#ff5fa2", "#120c2a", false, undefined, true),
      hawker: b.face(T("HAWKER", "小贩中心"), "#ffd23f", "#120c2a", false, undefined, true),
      kopi: b.face(T("KOPI", "咖啡"), "#ff9d1a", "#120c2a", false, undefined, true),
      laksa: b.face(T("LAKSA", "叻沙"), "#ff2a6a", "#120c2a", false, undefined, true),
      satay: b.face(T("SATAY", "沙爹"), "#00e5ff", "#120c2a", false, undefined, true),
      lantern: b.face(T("LANTERN ALLEY", "灯笼巷"), "#ffd23f", "#8a1020"),
    };
    const neon = [F.hawker, F.kopi, F.laksa, F.satay, F.qtc, F.party, F.bay];
    const outSide = (i: number) => (tr.clearance(...xz(tr.at(i, 30))) > tr.clearance(...xz(tr.at(i, -30))) ? 1 : -1);
    // the grandstand along the start (the float), and one by the gardens
    b.stand(tr.ci[1], outSide(tr.ci[1]), 44, 5, F.gp, ["#2a2450", "#3a3268", "#ff2a6a"]);
    b.stand(tr.ci[CP.gardens + 1], outSide(tr.ci[CP.gardens + 1]), 26, 4, F.night, ["#2a2450", "#3a3268", "#00e5ff"]);
    b.arch(tr.ci[2], F.bay, "#00e5ff", true);
    b.arch(tr.ci[CP.shore + 1], F.lion, "#ffd23f", true);
    b.arch(tr.ci[22], F.helix, "#ff2a6a", true);
    b.chevrons(
      [
        [CP.turnS, CP.fork],
        [CP.west - 1, CP.rejoin],
        [CP.south - 1, CP.south + 1],
        [25, 28],
      ],
      F.chev,
      ["#ff2a6a", "#ffffff"],
    );
    // a warning before each puddle
    for (const p of tr.patches) {
      if (p.on) continue;
      const i = tr.wrap(((p.s - 24) / tr.L) * tr.n);
      const side = p.d0 + p.d1 > 0 ? 1 : -1;
      tr.at(i, side * (tr.edge[i] + 0.9), 0, v1);
      b.plain.box("#2b2f4a", 0.18, 2.6, 0.18, v1.x, v1.y + 1.3, v1.z, tr.ty[i]);
      b.sign(F.wet, v1.x, v1.y + 2.7, v1.z, tr.ty[i] + Math.PI, 0.8, true);
      b.glow(v1.x, v1.y + 2.7, v1.z, "#ffd23f");
    }
    // the bayfront's railing lights along the water (the inner side of the open stretches)
    for (let i = 0; i < tr.n; i += 8 / STEP) {
      if (tr.zone[i] === 1 || tr.zone[i] === 4 || tr.tunnel[i] || tr.gap[i] || tr.py[i] > 1) continue;
      tr.at(i, -(tr.edge[i] + 2), 0, v1);
      if (!inside(bay, v1.x, -v1.z, 5)) continue;
      b.plain.box("#2b2f4a", 0.16, 1.2, 0.16, v1.x, 0.6, v1.z);
      b.lit.box((i / 16) % 2 ? "#7ff3ff" : "#ffd59a", 0.32, 0.32, 0.32, v1.x, 1.3, v1.z);
      b.glow(v1.x, 1.3, v1.z, (i / 16) % 2 ? "#7ff3ff" : "#ffd59a");
      if ((i / 16) % 3 === 0) b.pool(v1.x - tr.tz[i] * -4, -0.72, v1.z + tr.tx[i] * -4, tr.ty[i] + Math.PI / 2, 2, 12, (i / 16) % 2 ? "#7ff3ff" : "#ffd59a");
    }
    landmarks(b);
    shophouses(b, neon);
    alley(b, F.lantern);
    // the CBD's towers behind the shophouses, a few by the gardens
    b.buildings({
      every: 11,
      pal: ["#2c3456", "#343c66", "#283050", "#3a3a6a", "#2a3a5a"],
      roof: ["#1a1a2e", "#22223a"],
      town: [16, 34],
      open: [10, 26],
      skipOpen: 0.6,
      keep: dry,
      deco: (x, z, w, d, h, yaw) => {
        // (a lit crown, a red beacon, a neon band)
        const c = ["#00e5ff", "#ff2a6a", "#ffd23f", "#7f6aff"][Math.floor(R() * 4)];
        b.lit.box(c, w + 0.2, 0.5, d + 0.2, x, h - 1.5, z, yaw);
        if (R() < 0.5) b.blink(x, h + 0.6, z, "#ff3030");
        else b.glow(x, h - 1.5, z, c, true);
      },
    });
    // the city beyond: blocks of towers on their grid, never in the water
    b.blocks({
      box: [-420, 420, -420, 380],
      pitch: 36,
      near: 36,
      pal: ["#2c3456", "#343c66", "#283050", "#3a3a6a", "#2a3a5a", "#3a3050"],
      roof: ["#1a1a2e", "#22223a"],
      h: [14, 70],
      street: "#141a2a",
      keep: dry,
      deco: (x, z, w, d, h) => {
        const c = ["#00e5ff", "#ff2a6a", "#ffd23f", "#7f6aff"][Math.floor(R() * 4)];
        if (R() < 0.5) b.lit.box(c, w + 0.2, 0.5, d + 0.2, x, h - 1.2, z);
        if (R() < 0.3) b.blink(x, h + 0.6, z, "#ff3030");
      },
    });
    b.lamps(14, { post: "#1d1838", head: "#e8f4ff", glow: "#cfe0ff", pool: "#8fb0ff", h: 6.6 });
    b.boards([CP.esplanade, CP.west, CP.south + 1, CP.gardens + 1, 25, 27], [F.qtc, F.party, F.kopi, F.bay, F.laksa, F.satay]);
    // the wet road: long reflections of the lamps and the signs down the lanes
    for (let i = 0; i < tr.n; i += 14 / STEP) {
      if (tr.tunnel[i] || tr.gap[i]) continue;
      const c = ["#ff2a6a", "#00e5ff", "#ffd23f", "#cfe0ff"][(i / 28) & 3];
      tr.at(i, (R() - 0.5) * tr.half * 1.4, 0.06, v1);
      b.pool(v1.x, v1.y, v1.z, tr.ty[i], 1.6, 14, c);
    }
    // palms along the open stretches
    for (let i = 0; i < tr.n; i += 9 / STEP) {
      if (tr.zone[i] === 1 || tr.gap[i] || tr.tunnel[i] || tr.py[i] > 0.4 || R() < 0.4) continue;
      const side = -outSide(i);
      tr.at(i, side * (tr.edge[i] + 3 + R() * 2), 0, v1);
      if (tr.clearance(v1.x, v1.z) < tr.edge[i] + 2 || b.isBusy(v1.x, v1.z, 2) || !dry(v1.x, v1.z)) continue;
      palm(b, v1.x, v1.z, 0.9 + R() * 0.4);
    }
    b.trees(90, [-320, 300, -260, 260], (x, z, s) => (R() < 0.5 ? palm(b, x, z, s) : b.leafy(x, z, s, ["#1f5a3a", "#24683f", "#2f7a4a"], "#3a2a20")), 18, dry);
    // the city's lights on the bay: long streaks reaching in from the shore all round
    {
      let cx = 0,
        cz = 0;
      for (const p of bay) ((cx += p.x), (cz -= p.y));
      cx /= bay.length;
      cz /= bay.length;
      const LC = ["#ffd59a", "#7ff3ff", "#ff7ac0", "#ffe2a0", "#8fb0ff"];
      for (let k = 0; k < bay.length; k += 3) {
        const x = bay[k].x,
          z = -bay[k].y;
        const d = Math.hypot(cx - x, cz - z) || 1;
        const len = 16 + ((k * 7) % 5) * 5;
        b.pool(x + ((cx - x) / d) * (len / 2 + 5), -0.74, z + ((cz - z) / d) * (len / 2 + 5), Math.atan2(cx - x, cz - z), 2.6, len, LC[(k / 3) % LC.length | 0]);
      }
    }
    // the bay's night: bumboats under their lanterns on a slow loop, the sky park's searchlights over the rain
    b.boats(
      5,
      38,
      -8,
      78,
      52,
      -0.75,
      (m, lit) => {
        m.box("#3a2a22", 2.4, 0.9, 7.5, 0, 0.3, 0);
        m.box("#4a3628", 1.8, 0.7, 2.2, 0, 0.4, 4.4);
        m.box("#c9463a", 2.5, 0.25, 7.6, 0, 0.82, 0);
        m.box("#2a3a5a", 2.1, 1.3, 4.2, 0, 1.55, -0.6);
        m.box("#1a2238", 2.5, 0.2, 4.8, 0, 2.3, -0.6);
        for (const z of [-2.6, 0, 1.6]) for (const e of [-1, 1]) lit.box(z ? "#ffd59a" : "#ff6a5a", 0.34, 0.4, 0.34, e * 1.2, 1.7, z);
        lit.box("#fff1c9", 0.3, 0.3, 0.3, 0, 1.3, 4.9);
      },
      0.028,
    );
    b.beams(
      [
        [SG.sands[0] - 36, 84, SG.sands[1]],
        [SG.sands[0], 84, SG.sands[1]],
        [SG.sands[0] + 36, 84, SG.sands[1]],
      ],
      ["#7ff3ff", "#ff7ac0", "#ffe08a"],
      150,
    );
    weather(b);
  },
};

const v1 = new THREE.Vector3();
const v2 = new THREE.Vector3();
const xz = (v: THREE.Vector3): [number, number] => [v.x, v.z];

/** The bay: just inside the road's inner barrier all round, the shophouse streets cut straight across (x, −z). */
function bayOf(tr: Track) {
  const pts: THREE.Vector2[] = [];
  const v = new THREE.Vector3();
  for (let i = 0; i < tr.n; i += 6) {
    if (tr.zone[i] === 4 || tr.zone[i] === 1) continue;
    tr.at(i, -tr.edge[i] - 3, 0, v);
    pts.push(new THREE.Vector2(v.x, -v.z));
  }
  return shrink(pts);
}

/** Whether (x, y) is inside the polygon, or within `pad` of its edge. */
function inside(poly: THREE.Vector2[], x: number, y: number, pad = 0) {
  let c = false;
  let near = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i],
      b = poly[j];
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) c = !c;
    const dx = b.x - a.x,
      dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy || 1)));
    near = Math.min(near, Math.hypot(x - (a.x + dx * t), y - (a.y + dy * t)));
  }
  return c || near < pad;
}

/** The bay's outline pulled in a little from the road (and smoothed). */
function shrink(pts: THREE.Vector2[]) {
  let cx = 0,
    cy = 0;
  for (const p of pts) ((cx += p.x), (cy += p.y));
  cx /= pts.length;
  cy /= pts.length;
  const out = pts.map((p) => new THREE.Vector2(cx + (p.x - cx) * 0.97, cy + (p.y - cy) * 0.97));
  for (let r = 0; r < 3; r++) for (let k = 0; k < out.length; k++) {
    const a = out[(k + out.length - 1) % out.length],
      c = out[(k + 1) % out.length];
    out[k].set((a.x + c.x + out[k].x * 2) / 4, (a.y + c.y + out[k].y * 2) / 4);
  }
  return out;
}
/** The inlet running east under the helix bridge. */
function inlet() {
  return [
    [187, -16],
    [330, -22],
    [330, 66],
    [187, 62],
  ].map(([x, z]) => new THREE.Vector2(x, -z));
}

/** A palm: a leaning ringed trunk, a crown of drooping fronds. */
function palm(b: Kit, x: number, z: number, sz: number) {
  const R = b.R;
  const lean = (R() - 0.5) * 0.3;
  const h = 7.5 * sz;
  for (let k = 0; k < 5; k++) b.cyl(b.plain, k % 2 ? "#5a4632" : "#6a5440", 0.32 * sz, h / 5 + 0.05, x + lean * (k + 0.5) * (h / 5), (k + 0.5) * (h / 5), z, 0, 0, -lean);
  const tx = x + lean * h,
    ty = h;
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2 + R();
    b.plain.box(k % 2 ? "#2f7a4a" : "#3a8a52", 0.5 * sz, 0.12 * sz, 3.6 * sz, tx + Math.sin(a) * 1.6 * sz, ty - 0.3 * sz, z + Math.cos(a) * 1.6 * sz, a, 0.45);
  }
}

/** The landmarks: the three towers and their sky park, the domes, the lion, the Supertrees, the wheel, the helix. */
function landmarks(b: Kit) {
  const { plain, lit, wins } = b;
  const tr = b.tr;
  // ---- the three towers on their podium, the boat-shaped sky park across their tops
  {
    const [x, z] = SG.sands;
    const H = 78;
    for (const dx of [-36, 0, 36]) {
      // (each tower: two slabs leaning in, glass with lit floors)
      for (const s of [-1, 1]) {
        wins.box("#3a4a7a", 11, H, 7, x + dx, H / 2, z + s * 4.2, 0, s * 0.03, 0, [1.8, H / 5, 0, 0]);
        for (let y = 6; y < H; y += 8) lit.box("#bfe0ff", 11.2, 0.25, 0.2, x + dx, y, z + s * 7.8);
      }
      b.glow(x + dx, H - 2, z, "#cfe0ff", true);
      b.glow(x + dx, H * 0.5, z - 8, "#9fc0ff", true);
      b.pool(x + dx, -0.7, z - 40, 0, 10, 60, "#9fc0ff");
    }
    // the sky park: a long hull over all three, its prow out past the north tower, lit edges
    plain.box("#d8dcec", 128, 3.2, 16, x + 6, H + 1.6, z);
    plain.shape(LO.pyr, "#d8dcec", 22, 30, 3.2 * Math.SQRT2, x + 6 + 64 + 9, H + 1.6, z, Math.PI / 4, 0, Math.PI / 2);
    lit.box("#00e5ff", 129, 0.35, 0.3, x + 6, H + 0.2, z + 8.1);
    lit.box("#00e5ff", 129, 0.35, 0.3, x + 6, H + 0.2, z - 8.1);
    lit.box("#7fffd4", 60, 0.5, 10, x - 10, H + 3.4, z);
    for (let k = -5; k <= 6; k++) b.glow(x + k * 11, H + 1, z + 8.4, "#00e5ff");
    for (let k = -3; k <= 3; k++) b.glow(x + k * 18, H + 4, z, "#ffffff", k % 2 === 0);
    // the podium over the road (the tunnel's roof), its glass front lit
    const t = tr.range(tr.tunnel);
    if (t) {
      const mid = t.mid;
      tr.at(mid, 0, 0, v1);
      const len = t.cnt * STEP + 6;
      wins.box("#2a3460", 36, 12, len, v1.x, 7.6 + 6, v1.z, tr.ty[mid], 0, 0, [5, 2, 0, 0]);
      for (const end of [-1, 1]) {
        const ex = v1.x + Math.sin(tr.ty[mid]) * end * (len / 2 + 0.3),
          ez = v1.z + Math.cos(tr.ty[mid]) * end * (len / 2 + 0.3);
        lit.box("#ff2a6a", 34, 0.6, 0.3, ex, 8.4, ez, tr.ty[mid]);
        lit.box("#00e5ff", 34, 0.4, 0.3, ex, 19, ez, tr.ty[mid]);
        for (let k = -3; k <= 3; k++) b.glow(ex + Math.cos(tr.ty[mid]) * k * 5, 8.6, ez - Math.sin(tr.ty[mid]) * k * 5, k % 2 ? "#ff2a6a" : "#ffd23f");
      }
    }
  }
  // ---- the theatre's two spiky domes by the water
  {
    const [x, z] = SG.domes;
    for (const [dx, dz, r] of [
      [-14, 4, 15],
      [16, -6, 12],
    ]) {
      plain.shape(LO.dome, "#b8b09c", r * 2, r * 1.5, r * 2.3, x + dx, 0, z + dz);
      b.cyl(lit, "#ffd59a", r * 0.98, 1.2, x + dx, 0.6, z + dz);
      // (the spikes: sun shades over the shell, in rings)
      for (let ring = 1; ring <= 5; ring++) {
        const p = (ring / 6) * (Math.PI / 2);
        const n = Math.round(22 * Math.cos(p)) + 4;
        for (let k = 0; k < n; k++) {
          const a = (k / n) * Math.PI * 2 + ring * 0.3;
          const px = x + dx + Math.cos(a) * r * Math.cos(p),
            py = r * 0.75 * Math.sin(p) * 2,
            pz = z + dz + Math.sin(a) * r * 1.15 * Math.cos(p);
          plain.shape(LO.pyr, ring % 2 ? "#e2d8c0" : "#d0c4a8", 2, 2.4, 2, px, py, pz, a, -Math.cos(a) * (Math.PI / 2 - p), Math.sin(a) * (Math.PI / 2 - p));
        }
      }
      b.glow(x + dx, r * 0.6, z + dz + r, "#ffd59a", true);
      b.glow(x + dx, 2, z + dz + r * 1.1, "#ffe2a0", true);
      b.glow(x + dx, r * 1.2, z + dz, "#ffcf8a", true);
      b.pool(x + dx, -0.7, z + dz + r * 1.6, 0, 8, 22, "#ffcf8a");
    }
  }
  // ---- the lion fountain on the shore: a white lion's head on a fish's body, a jet into the bay
  {
    const [x, z] = SG.lion;
    b.inked("#d8d8e4", 8, 2.4, 8, x, 1.2, z, 0, 0.06);
    plain.box("#f4f4f2", 4.2, 7, 3.6, x, 5.6, z, Math.PI / 2);
    plain.shape(LO.ball, "#f4f4f2", 5.4, 5, 5.4, x + 0.6, 10.4, z);
    plain.shape(LO.ball, "#e8e2d0", 7.4, 6.6, 7.4, x - 0.6, 10.6, z);
    b.glow(x + 3, 10, z, "#ffffff", true);
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      plain.shape(LO.cone, "#e8e6dc", 1.6, 2.6, 1.6, x - 1.2, 10.6 + Math.sin(a) * 3.4, z + Math.cos(a) * 3.4, 0, 0, a);
    }
    plain.box("#f4f4f2", 1.6, 2.4, 3, x - 1.2, 2.8, z, Math.PI / 2, 0.5);
    // the jet, arcing east into the bay
    for (let k = 0; k < 10; k++) {
      const f = k / 9;
      const jx = x + 3.4 + f * 14,
        jy = 9.6 + Math.sin(f * Math.PI * 0.7) * 2.4 - f * f * 10;
      lit.box("#bfefff", 0.7, 0.7, 0.7, jx, jy, z);
      if (k % 3 === 0) b.glow(jx, jy, z, "#bfefff");
    }
    b.glow(x, 6, z, "#ffffff", true);
  }
  // ---- the Supertree grove: trunks of light, canopies like open umbrellas, a skyway between
  {
    const [x, z] = SG.grove;
    const R = b.R;
    const trees: [number, number, number][] = [];
    for (let k = 0; k < 12; k++) {
      const a = k * 2.4,
        r = 6 + k * 2.6;
      trees.push([x + Math.cos(a) * r, z + Math.sin(a) * r * 0.8, 22 + R() * 22 + (k < 3 ? 12 : 0)]);
    }
    trees.forEach(([tx, tz, h], k) => {
      const c = ["#ff2a9a", "#b45bff", "#3ec6ff", "#ff6b35"][k % 4];
      plain.shape(LO.cone, "#3a2a4a", 5, h, 5, tx, h / 2, tz, 0, Math.PI);
      for (let y = 3; y < h; y += 3.2) b.cyl(lit, c, 0.9 + (1 - y / h) * 1.6, 0.4, tx, y, tz);
      plain.shape(LO.cone, "#2a1a3a", 16, 5, 16, tx, h + 2.5, tz, 0, Math.PI);
      for (let q = 0; q < 12; q++) {
        const a = (q / 12) * Math.PI * 2;
        cable(b, c, tx, h, tz, tx + Math.cos(a) * 8, h + 5, tz + Math.sin(a) * 8, 0.3, true);
      }
      b.cyl(lit, c, 8.2, 0.4, tx, h + 5, tz);
      b.glow(tx, h + 4, tz, c, true);
      b.glow(tx, h * 0.5, tz, c);
    });
    for (let k = 0; k < 3; k++) {
      const [ax, az, ah] = trees[k],
        [cx2, cz2, ch] = trees[(k + 1) % 3];
      const y = Math.min(ah, ch) * 0.7;
      cable(b, "#ffd23f", ax, y, az, cx2, y, cz2, 0.5, true);
    }
  }
  // ---- the observation wheel, lit
  {
    const [x, z] = SG.flyer;
    b.wheel(x, z, -0.6, 26, { rim: ["#d8dcec", "#bfc4d8"], leg: "#d8dcec", base: "#2a2450", cabins: ["#cfe0ff", "#bfefff", "#ffe2a0"], lights: "#7ff3ff" }, 0.08);
  }
  // ---- the helix bridge: a double spiral of steel and light round the deck
  {
    const c = tr.ci[CP.helix];
    const L = 70 / STEP;
    for (let k = -L; k <= L; k += 2) {
      const i = tr.wrap(c + k);
      const a = (k * STEP) / 5.5;
      const r = tr.edge[i] + 1.6;
      for (const ph of [0, Math.PI]) {
        const i2 = tr.wrap(i + 2);
        const b0 = a + ph,
          b1 = a + ph + (2 * STEP) / 5.5;
        const p0 = tr.at(i, Math.cos(b0) * r, Math.max(0.2, 4.2 + Math.sin(b0) * 5.4), v1).clone();
        const p1 = tr.at(i2, Math.cos(b1) * r, Math.max(0.2, 4.2 + Math.sin(b1) * 5.4), v2);
        cable(b, ph ? "#ff2a9a" : "#7ff3ff", p0.x, p0.y, p0.z, p1.x, p1.y, p1.z, 0.3, true);
        if (k % 12 === 0) b.glow(p0.x, p0.y, p0.z, ph ? "#ff2a9a" : "#7ff3ff");
      }
      if (k % 10 === 0) {
        // (the rings that tie the two spirals)
        for (let q = 0; q < 8; q++) {
          const a0 = (q / 8) * Math.PI * 2,
            a1 = ((q + 1) / 8) * Math.PI * 2;
          if (Math.sin(a0) < -0.6 && Math.sin(a1) < -0.6) continue;
          const p0 = tr.at(i, Math.cos(a0) * r, Math.max(0.2, 4.2 + Math.sin(a0) * 5.4), v1).clone();
          const p1 = tr.at(i, Math.cos(a1) * r, Math.max(0.2, 4.2 + Math.sin(a1) * 5.4), v2);
          cable(b, "#c8cce0", p0.x, p0.y, p0.z, p1.x, p1.y, p1.z, 0.18);
        }
      }
    }
  }
  // ---- the CBD: a wall of glass towers to the south-west, lit crowns
  {
    const [x, z] = SG.cbd;
    const R = b.R;
    for (let k = 0; k < 9; k++) {
      const px = x - 30 + (k % 3) * 26 + R() * 6,
        pz = z - 40 + Math.floor(k / 3) * 34 + R() * 6;
      if (tr.clearance(px, pz) < 26) continue;
      const h = 70 + R() * 70;
      wins.box(["#2c3a66", "#34406e", "#2a3458"][k % 3], 14, h, 14, px, h / 2, pz, R() * 0.4, 0, 0, [2.2, h / 6, 0, 0]);
      const c = ["#00e5ff", "#ff2a6a", "#ffd23f"][k % 3];
      lit.box(c, 14.4, 1, 14.4, px, h + 0.5, pz);
      b.glow(px, h + 1, pz, c, true);
    }
  }
}

/** The shophouse streets: rows of narrow two- and three-storey fronts in pastels, arcades, neon over the doors. */
function shophouses(b: Kit, neon: number[][]) {
  const tr = b.tr;
  const R = b.R;
  const pastel = ["#9fe0c8", "#ffb0c8", "#ffe08a", "#a8c8ff", "#f4c8a0", "#c8b0ff", "#bfe8a0"];
  let nk = 0;
  for (let i = tr.ci[CP.turnS]; i !== tr.ci[CP.south]; i = (i + 1) % tr.n) {
    if ((i - tr.ci[CP.turnS] + tr.n) % (5.5 / STEP)) continue;
    for (const side of [-1, 1]) {
      if (tr.short && side === tr.short.side && tr.openS[i]) continue;
      const d = side * (tr.edge[i] + 4.2);
      const p = tr.at(i, d);
      if (tr.clearance(p.x, p.z) < tr.edge[i] + 3) continue;
      if (b.isBusy(p.x, p.z, 2)) continue;
      const yaw = tr.ty[i];
      const h = R() < 0.5 ? 8 : 11;
      const c = pastel[Math.floor(R() * pastel.length)];
      b.wins.box(c, 5.4, h, 6, p.x, h / 2, p.z, yaw, 0, 0, [0.8, h / 4, 0, 0]);
      // (the roof's red tiles, the arcade's columns and its lit soffit)
      b.plain.box("#b8483a", 5.8, 0.6, 6.8, p.x, h + 0.2, p.z, yaw, side * 0.18);
      const fx = -tr.tz[i] * -side,
        fz = tr.tx[i] * -side;
      b.plain.box("#f4efe2", 0.5, 3.4, 0.5, p.x + fx * 3.2 + Math.sin(yaw) * 2.4, 1.7, p.z + fz * 3.2 + Math.cos(yaw) * 2.4, yaw);
      b.lit.box("#ffd59a", 5.2, 0.2, 2.2, p.x + fx * 2.4, 3.3, p.z + fz * 2.4, yaw);
      b.pool(p.x + fx * 4.5, 0.08, p.z + fz * 4.5, yaw, 5, 4, "#ffb060");
      // a neon sign on every other front
      if (R() < 0.55) {
        const sy = 4.6 + R() * 2.5;
        b.sign(neon[nk++ % neon.length], p.x + fx * 3.15, sy, p.z + fz * 3.15, yaw + (side > 0 ? -Math.PI / 2 : Math.PI / 2), 1.0, false);
        b.glow(p.x + fx * 3.6, sy, p.z + fz * 3.6, ["#ff2a6a", "#00e5ff", "#ffd23f"][nk % 3], true);
      }
      b.placed.push({ x: p.x, z: p.z, r: 4 });
    }
  }
}

/** The lantern alley: walls of shophouse backs, red lanterns strung across, a puddle in the middle. */
function alley(b: Kit, word: number[]) {
  const tr = b.tr;
  const P = tr.short!;
  const yaw = Math.atan2(P.dx, P.dz);
  for (let u = 0; u < P.len; u += 2) {
    tr.onShort(u + 1, 0, v1);
    const hw = tr.shortHalf(u + 1);
    b.plain.box(Math.floor(u / 2) % 2 ? "#3a3550" : "#34304a", hw * 2 + 0.4, 0.06, 2.05, v1.x, 0.03, v1.z, yaw);
    if (u > P.u1 - 2 && u < P.u2 + 2)
      for (const side of [-1, 1]) {
        tr.onShort(u + 1, side * (hw + 0.4), v2);
        const h = 7 + ((u * 7) % 5);
        b.wins.box(["#c8b0ff", "#ffb0c8", "#9fe0c8", "#ffe08a"][Math.floor(u / 8) % 4], 0.8, h, 2.05, v2.x, h / 2, v2.z, yaw, 0, 0, [0.3, h / 4, 0, 0]);
      }
    if (u > P.u1 && u < P.u2 && Math.floor(u) % 6 === 0) {
      // (a string of lanterns across)
      for (let q = -2; q <= 2; q++) {
        tr.onShort(u + 1, q * (hw / 2.5), v2);
        const y = 5.4 - Math.cos((q / 2.5) * Math.PI * 0.5) * 0.6;
        b.lit.shape(LO.ball, "#ff3030", 0.7, 0.9, 0.7, v2.x, y, v2.z);
        b.lit.box("#ffd23f", 0.3, 0.12, 0.3, v2.x, y - 0.5, v2.z);
        if (q % 2 === 0) b.glow(v2.x, y, v2.z, "#ff5040");
      }
      tr.onShort(u + 1, 0, v2);
      b.pool(v2.x, 0.08, v2.z, yaw, 4, 6, "#ff5040");
    }
  }
  tr.onShort(P.u1 + 3, 0, v1);
  b.plain.box("#8a1020", tr.shortHalf(P.u1 + 3) * 2 + 2, 0.8, 0.6, v1.x, 7.4, v1.z, yaw);
  b.sign(word, v1.x - P.dx * 0.32, 7.4, v1.z - P.dz * 0.32, yaw + Math.PI, 1.2, false);
  b.glow(v1.x, 7.4, v1.z, "#ffd23f", true);
}

/** The rain: streaks falling round the camera (one draw), splashes on the road, lightning now and then. */
function weather(b: Kit) {
  const N = 700;
  const pos = new Float32Array(N * 6);
  const seed = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const x = (Math.random() - 0.5) * 70,
      y = Math.random() * 26,
      z = (Math.random() - 0.5) * 70;
    pos.set([x, y, z, x - 0.12, y + 1.3, z], i * 6);
    seed[i] = Math.random();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const rain = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: "#a9c0ff", transparent: true, opacity: 0.42, depthWrite: false }));
  rain.frustumCulled = false;
  b.s.add(rain);
  let nextFlash = 6 + Math.random() * 5;
  let flash = 0;
  const base = { hemi: 0, sun: 0 };
  const C_SPL = ["#cfe0ff", "#ffffff"];
  const o = { speed: 1.2, up: 1.6, gravity: 12, size: 0.07, life: 0.25, drag: 0, dir: new THREE.Vector3() };
  b.anims.push((t, dt) => {
    const c = b.ctx;
    if (!c) return;
    const cam = c.camera.position;
    for (let n = 0; n < N; n++) {
      let x = pos[n * 6],
        y = pos[n * 6 + 1],
        z = pos[n * 6 + 2];
      y -= dt * (26 + seed[n] * 8);
      x -= dt * 2.5;
      const rx = x - cam.x,
        rz = z - cam.z;
      if (rx > 35) x -= 70;
      else if (rx < -35) x += 70;
      if (rz > 35) z -= 70;
      else if (rz < -35) z += 70;
      if (y < cam.y - 6) y += 26;
      pos[n * 6] = x;
      pos[n * 6 + 1] = y;
      pos[n * 6 + 2] = z;
      pos[n * 6 + 3] = x + 0.18;
      pos[n * 6 + 4] = y + 1.4;
      pos[n * 6 + 5] = z;
    }
    g.attributes.position.needsUpdate = true;
    // splashes round the kart in view
    const f = c.focus;
    if (Math.random() < dt * 40) {
      v1.set(f.x + (Math.random() - 0.5) * 22 + Math.sin(f.yaw) * 10, f.y + 0.05, f.z + (Math.random() - 0.5) * 22 + Math.cos(f.yaw) * 10);
      c.fx.burst(v1, 2, C_SPL, o);
    }
    // the lightning: a flash, the sky lit, a rumble
    if (!base.hemi) ((base.hemi = c.hemi.intensity), (base.sun = c.sun.intensity));
    nextFlash -= dt;
    if (nextFlash <= 0) {
      nextFlash = 9 + Math.random() * 9;
      flash = 1;
      if (c.playing) c.flash(0.45);
    }
    if (flash > 0) {
      flash = Math.max(0, flash - dt * 3);
      const k = flash * (0.7 + 0.3 * Math.sin(t * 60));
      c.hemi.intensity = base.hemi + k * 1.1;
      c.sun.intensity = base.sun + k * 0.9;
    }
  });
}
