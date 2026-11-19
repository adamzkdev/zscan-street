/**
 * NU7 GRAND PRIX: ZStreet's NU7 karting circuit (NU7 went live on mainnet at block 3,543,405), on a
 * winter evening in the NU7 Quarter. West down the quarter's boulevard, round the NU7 TOWER's ring,
 * through the foot of the ZK MALL's great tent, back east along the frozen canal in the crosswind,
 * over the ice lane across the bay (or round it, past the Northern Lights), up over the canal to the
 * square (the OPERA HOUSE, the GREAT PYRAMID, the zkSNARK OF LIBERTY's column in its roundabout) and
 * back over the canal past CITY HALL to the line. Ice patches slide, gusts push, the snow ramp flies.
 * (The landmarks' keys in AST are the old ones: bayterek = the NU7 Tower, khan = the ZK Mall, akorda
 * = City Hall, peace = the Great Pyramid, mosque = the Opera House, eli = the zkSNARK of Liberty,
 * adp / talan = Midtown's towers.)
 */
import * as THREE from "three";
import { T } from "../../../../i18n/lang";
import { rng } from "../../../kit";
import type { Course } from "../course";
import { LO, haloTex, type Kit } from "../scenery";
import { STEP } from "../track";
import { cable, chevPaint } from "./city";

/** Where things are, by control point. */
const CP = { ring: 5, west: 8, tent0: 10, tent1: 13, hairpin: 14, quay: 16, ramp: 18, fork: 20, bay: 22, rejoin: 25, bridge1: 28, bank: 30, eli: 33, bridge2: 34, akorda: 38 };
/** The landmarks (x, z). */
export const AST = {
  bayterek: [0, 8],
  khan: [-258, -8],
  akorda: [384, 34],
  golden: [252, 64],
  peace: [196, -236],
  mosque: [300, -268],
  eli: [326, -158],
  lights: [100, -36],
  adp: [-118, 74],
  talan: [-48, 78],
  library: [150, 62],
} as const;
/** The frozen canal: its south bank (z), its north bank. */
const RIVER = [-114, -150];

export const ASTANA: Course = {
  key: "astana",
  title: "NU7 GRAND PRIX",
  titleZh: "NU7 大奖赛",
  tag: "A winter evening in the NU7 Quarter: black ice, crosswind gusts, a lane over the frozen canal.",
  tagZh: "NU7 街区的冬夜：黑冰、侧风阵阵、冰封运河上的捷径。",
  song: "frost",
  ambience: "wind",
  gantry: [T("NU7 GRAND PRIX", "NU7 大奖赛"), "NU7 QUARTER"],
  orbit: { x: 60, z: -60, r: 230, h: 90 },
  offK: 0.5,
  marks: [
    [AST.bayterek[0], AST.bayterek[1], 24],
    [AST.khan[0], AST.khan[1], 44],
    [AST.akorda[0], AST.akorda[1], 40],
    [AST.golden[0], AST.golden[1], 16],
    [AST.peace[0], AST.peace[1], 34],
    [AST.mosque[0], AST.mosque[1], 34],
    [AST.eli[0], AST.eli[1], 14],
    [AST.lights[0], AST.lights[1], 30],
    [AST.adp[0], AST.adp[1], 18],
    [AST.talan[0], AST.talan[1], 16],
  ],
  spec: {
    ctrl: [
      [200, 22], // 0 the line: the quarter's boulevard, westbound
      [150, 22],
      [100, 22],
      [62, 26], // 3 into the NU7 Tower's ring
      [36, 40],
      [0, 48], // 5 round the south of the plaza
      [-36, 40],
      [-62, 26],
      [-100, 22], // 8 west past the towers
      [-150, 22],
      [-204, 14], // 10 into the ZK Mall
      [-228, 0],
      [-242, -20],
      [-244, -46], // 13 out of the tent, the hairpin
      [-232, -72],
      [-206, -88],
      [-170, -94], // 16 the embankment, eastbound (the wind)
      [-120, -96],
      [-70, -96], // 18 the snow ramp
      [-20, -96],
      [20, -96], // 20 the fork: the ice lane, or round the bay
      [44, -80],
      [76, -64],
      [112, -62],
      [142, -74],
      [160, -94], // 25 the lane comes back
      [190, -102],
      [222, -112], // 27 up onto the canal bridge, northbound
      [240, -140],
      [252, -176],
      [272, -198], // 30 the far bank, past the opera house
      [306, -206],
      [340, -196], // 32 round the zkSNARK of Liberty
      [362, -172],
      [366, -140],
      [358, -110], // 35 back over the river, southbound
      [346, -70],
      [334, -36],
      [312, -8], // 38 by City Hall, onto the boulevard
      [282, 14],
      [244, 22],
    ],
    half: 7,
    laps: 2,
    // (the boulevard and the embankment are long: the pack's slipstream and catch-up need a touch less pace)
    aiPace: 0.985,
    city: [
      [CP.bank - 1, CP.eli - 1],
      [CP.akorda - 2, CP.akorda + 1],
    ],
    edges: [12, 10, 9.5, 10.2, 12],
    hills: [
      { at: [CP.bridge1, 0], up: 34, flat: 36, down: 30, h: 7 },
      { at: [CP.bridge2, 14], up: 28, flat: 34, down: 34, h: 7 },
    ],
    jump: { at: [CP.ramp, 0], len: 20, h: 2.4, gap: 0 },
    tunnel: [CP.tent0, CP.tent1],
    short: { a: CP.fork, b: CP.rejoin, half: 4.2, side: -1, kind: "water", ice: true },
    shortPatches: [
      { u0: 52, u1: 58, d0: -1.8, d1: 1.4, kind: "hole" },
      { u0: 92, u1: 97, d0: 0.2, d1: 3.6, kind: "hole" },
    ],
    patches: [
      { at: [CP.hairpin, -6], len: 24, d0: -7, d1: 0, kind: "ice" },
      { at: [CP.eli - 1, 6], len: 26, d0: 0, d1: 7, kind: "ice" },
      { at: [CP.bridge2 + 2, -4], len: 18, d0: -7, d1: 1, kind: "ice" },
      { at: [CP.ring, -6], len: 16, d0: -1, d1: 7, kind: "ice" },
    ],
    wind: { a: CP.quay - 1, b: CP.fork, every: 7.5, warn: 1.6, len: 2.2, force: 3.4, side: 1 },
    boxes: [
      [1, 10],
      [CP.west + 1, 0],
      [CP.quay, 0],
      [CP.rejoin + 1, 0],
      [CP.akorda, 0],
    ],
    pads: [
      [2, 0],
      [CP.west, 0],
      [CP.quay - 1, 8],
      [CP.bay, 0],
      [CP.bank, 0],
      [CP.bridge2 + 2, 12],
    ],
    padJump: true,
    padShort: true,
    coins: [
      [4, 0],
      [CP.tent0 + 1, 0],
      [CP.quay + 1, 0],
      [CP.bay + 1, 0],
      [CP.bank + 1, 0],
      [CP.akorda + 1, 0],
    ],
  },
  theme: {
    sky: ["#1a2766", "#f0a58c"],
    // (the dusk's haze starts further out: the whole Left Bank reads from the air, the far towers still melt into the sky)
    fog: [220, 700],
    sun: { color: "#ffb28a", i: 1.3, pos: [-200, 30, 60] },
    hemi: { sky: "#aebcff", ground: "#6a6080", i: 1.3 },
    night: true,
    // (dusk: the sun's glow on the horizon where the light comes from, pink clouds, the first stars overhead)
    dome: { stars: 260, clouds: 10, cloud: "#f8c6b6", cloudShade: "#7f74aa", disc: { az: 17, el: 5, color: "#ffd2a4", size: 7, glow: 8 }, haze: 0.5 },
    // (long evening shadows from the towers: soft, so they never black out the road)
    shadowK: 0.55,
    ground: (g, S) => {
      // snow: soft wind-blown drifts, a sparkle here and there
      g.fillStyle = "#e9eff8";
      g.fillRect(0, 0, S, S);
      const R = rng(0x5a0e);
      for (let i = 0; i < 16; i++) {
        g.fillStyle = i % 2 ? "rgba(196,212,236,0.55)" : "rgba(250,252,255,0.8)";
        const w = 50 + R() * 90,
          x = R() * S,
          y = Math.floor(R() * 32) * 8;
        for (const dx of [-S, 0]) (g.fillRect(x + dx, y, w, 6), g.fillRect(x + dx + w * 0.2, y + 6, w * 0.6, 4));
      }
      g.fillStyle = "#ffffff";
      for (let i = 0; i < 40; i++) g.fillRect(Math.floor(R() * S), Math.floor(R() * S), 3, 3);
    },
    groundM: 16,
    bedOpen: "#dde6f3",
    pave: (g) => {
      g.fillStyle = "#c9ced9";
      g.fillRect(0, 0, 64, 64);
      g.fillStyle = "#b4bac8";
      for (let k = 0; k < 64; k += 16) (g.fillRect(0, k, 64, 2), g.fillRect(k, 0, 2, 64));
      g.fillStyle = "#eef3fb";
      g.fillRect(0, 0, 64, 6);
    },
    bedDeck: "#c7c9d8",
    road: {
      // (gritted, frost-grey: light enough to read at dusk under the towers' shadows)
      base: "#646a80",
      worn: "rgba(22,26,44,0.14)",
      grit: ["rgba(255,255,255,0.07)", "rgba(0,0,0,0.06)"],
      dash: "#f8f0d2",
      edge: "#f2f6ff",
      glow: 0.3,
      over: (g, S) => {
        // (snow swept to the sides: a soft bank whose edge wanders a little, the same at both ends of the tile)
        for (const side of [0, 1]) {
          const at = (v: number, d: number) => {
            const x = S * (d + 0.012 * Math.sin((v / S) * Math.PI * 2 + side * 2) + 0.006 * Math.sin((v / S) * Math.PI * 6 + side));
            return side ? S - x : x;
          };
          for (const [d, a] of [
            [0.12, 0.28],
            [0.085, 0.5],
            [0.055, 0.92],
          ]) {
            g.fillStyle = `rgba(240,246,255,${a})`;
            g.beginPath();
            g.moveTo(side ? S : 0, 0);
            for (let v = 0; v <= S; v += S / 32) g.lineTo(at(v, d), v);
            g.lineTo(side ? S : 0, S);
            g.closePath();
            g.fill();
          }
        }
      },
    },
    kerb: ["#b07bff", "#ffffff"],
    rumble: ["#ffd23f", "#b07bff"],
    wall: ["#b07bff", "#ffffff", "#ffd23f", "#ffffff"],
    town: ["#e8e4dc", ["#b07bff", "#ffd23f", "#ff6b35", "#c45bff"]],
    cap: "#2b2f4a",
    brick: ["#b9b2c4", "#a29ab0"],
    bank: "#9aa3b8",
    water: (c) => {
      c.fillStyle = "#9fd4ee";
      c.fillRect(0, 0, 64, 64);
      c.fillStyle = "#c6ecff";
      for (let i = 0; i < 9; i++) c.fillRect((i * 23) % 64, (i * 41) % 64, 18, 2);
      c.strokeStyle = "rgba(120,170,210,0.7)";
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(4, 50);
      c.lineTo(22, 38);
      c.lineTo(30, 46);
      c.lineTo(50, 20);
      c.moveTo(22, 38);
      c.lineTo(18, 12);
      c.stroke();
    },
    waterM: 14,
    waterDrift: [0, 0],
    waterY: -0.06,
    windows: { lit: 0.55, on: "#ffd59a", off: "#4a5578" },
    skyline: { r: 430, n: 110, tall: 1.5, pal: ["#c9cfdc", "#aeb8cc", "#d8d0c4", "#9aa6bf", "#e0d8cc"] },
    clouds: 7,
    cloudColor: "#f6c9bd",
  },
  water: (tr) => {
    // the frozen canal across the north, and the bay south of it (inside the road's bend) the ice lane crosses
    const P = tr.short!;
    const pts: THREE.Vector2[] = [];
    const W0 = -520,
      W1 = 560;
    pts.push(new THREE.Vector2(W0, -RIVER[1]), new THREE.Vector2(W0, -RIVER[0]));
    const iw1 = tr.near(P.ax + P.dx * P.w1, P.az + P.dz * P.w1, P.iA),
      iw2 = tr.near(P.ax + P.dx * P.w2, P.az + P.dz * P.w2, P.iB);
    const v = new THREE.Vector3();
    tr.at(iw1, -tr.edge[iw1] - 1.5, 0, v);
    pts.push(new THREE.Vector2(v.x - 6, -RIVER[0]));
    for (let i = iw1; i !== iw2; i = (i + 2) % tr.n) {
      tr.at(i, -tr.edge[i] - 1.5, 0, v);
      pts.push(new THREE.Vector2(v.x, -Math.min(v.z, RIVER[0])));
    }
    tr.at(iw2, -tr.edge[iw2] - 1.5, 0, v);
    pts.push(new THREE.Vector2(v.x + 6, -RIVER[0]), new THREE.Vector2(W1, -RIVER[0]), new THREE.Vector2(W1, -RIVER[1]));
    return [pts];
  },
  scenery(b) {
    const tr = b.tr;
    const R = b.R;
    const F = {
      gp: b.face(T("NU7 GRAND PRIX", "NU7 大奖赛"), "#ffffff", "#b07bff", true),
      // (the arch past the tower, and the tower's own sign; the atlas holds 16 faces, the race's 4 included)
      nurzhol: b.face(T("NU7 TOWER", "NU7 塔"), "#ffd23f", "#1d1640"),
      ice: b.face(T("⚠ BLACK ICE", "⚠ 黑冰"), "#15101f", "#bfe6ff"),
      thin: b.face(T("THIN ICE!", "冰薄！"), "#ffffff", "#ff3b5c"),
      wind: b.face(T("CROSSWIND", "侧风"), "#ffffff", "#2b6fd6"),
      chev: b.face("", "#fff", "#b07bff", false, chevPaint),
      qtc: b.face("ZCASH", "#5a3a00", "#ffcf2e"),
      party: b.face("ZK PARTY", "#ffffff", "#ff5fa2"),
      winter: b.face(T("WINTER CUP", "冬季杯"), "#ffffff", "#c45bff"),
      lap: b.face(T("FULL SPEED", "全速前进"), "#ffffff", "#ff6b35"),
      astana: b.face("NU7 QUARTER", "#b07bff", "#ffffff"),
    };
    // the stands at the start and on the right bank, crowds in winter coats
    const outSide = (i: number) => (tr.clearance(...xz(tr.at(i, 30))) > tr.clearance(...xz(tr.at(i, -30))) ? 1 : -1);
    b.stand(tr.ci[1], outSide(tr.ci[1]), 44, 5, F.gp, ["#2b3a6a", "#3a4a80", "#b07bff"]);
    b.stand(tr.ci[CP.hairpin + 1], outSide(tr.ci[CP.hairpin + 1]), 26, 4, F.winter, ["#2b3a6a", "#3a4a80", "#c45bff"]);
    b.arch(tr.ci[CP.west + 1], F.nurzhol, "#b07bff", true);
    b.arch(tr.ci[CP.quay + 1], F.wind, "#2b6fd6", true);
    b.arch(tr.ci[CP.bank], F.astana, "#ffd23f", true);
    b.chevrons(
      [
        [CP.tent1, CP.quay - 1],
        [CP.eli - 1, CP.bridge2],
      ],
      F.chev,
      ["#b07bff", "#ffffff"],
    );
    // ice warnings before each patch; thin-ice signs round the lane
    for (const p of tr.patches) {
      if (p.on) continue;
      const i = tr.wrap(((p.s - 26) / tr.L) * tr.n);
      const side = p.d0 + p.d1 > 0 ? 1 : -1;
      tr.at(i, side * (tr.edge[i] + 1), 0, v1);
      b.plain.box("#2b2f4a", 0.18, 2.6, 0.18, v1.x, v1.y + 1.3, v1.z, tr.ty[i]);
      b.sign(F.ice, v1.x, v1.y + 2.7, v1.z, tr.ty[i] + Math.PI, 0.8, true);
      b.glow(v1.x, v1.y + 2.7, v1.z, "#bfe6ff");
    }
    // (the boulevard's park and the frozen river keep clear of the city)
    for (let x = -230; x <= 340; x += 15) b.clear(x, -14, 21);
    for (let x = -520; x <= 560; x += 18) b.clear(x, (RIVER[0] + RIVER[1]) / 2, 24);
    landmarks(b, F.nurzhol);
    boulevard(b);
    iceLane(b, F.thin);
    // the city: pastel blocks with snow on their roofs, closer in the old town
    let roofs = 0;
    const vents: [number, number, number][] = [];
    b.buildings({
      every: 12,
      pal: ["#e9dcc4", "#d8c6a8", "#c9d6e6", "#e6e1d6", "#b9c7d8", "#efe2cf", "#d6cfe6"],
      roof: ["#f4f8ff", "#eef3fb"],
      town: [10, 28],
      open: [9, 26],
      skipOpen: 0.45,
      deco: (x, z, w, d, h, yaw) => {
        // (a snowy cornice, a rooftop beacon that blinks, a chimney that steams in the cold)
        b.plain.box("#ffffff", w + 0.9, 0.35, d + 0.9, x, h + 0.75, z, yaw);
        if (R() < 0.3) b.blink(x, h + 1.6, z, "#ff5050");
        if (++roofs % 4 === 0 && vents.length < 16) {
          b.plain.box("#8a8fa6", 1.1, 1.8, 1.1, x + w * 0.22, h + 1.4, z + d * 0.18, yaw);
          vents.push([x + w * 0.22, h + 2.6, z + d * 0.18]);
        }
      },
    });
    b.steam(vents, "#f1f4ff", 6, 10);
    // the town round it all: snowy blocks on their grid (the right bank's old town to the north, the Left Bank's south)
    b.blocks({
      box: [-420, 460, -400, 220],
      pitch: 34,
      near: 34,
      pal: ["#e9dcc4", "#d8c6a8", "#c9d6e6", "#e6e1d6", "#b9c7d8", "#efe2cf", "#d6cfe6", "#cfa890"],
      roof: ["#f4f8ff", "#eef3fb"],
      h: [8, 30],
      street: "#b9c2d4",
      keep: (x, z, r) => z < RIVER[1] - r - 4 || z > RIVER[0] + r + 4,
      deco: (x, z, w, d, h) => {
        b.plain.box("#ffffff", w + 0.9, 0.35, d + 0.9, x, h + 0.75, z);
        if (R() < 0.15) b.blink(x, h + 1.4, z, "#ff5050");
      },
    });
    b.lamps(16, { post: "#2b2f4a", head: "#e8f4ff", glow: "#bfe6ff", pool: "#d6ecff", double: true, h: 7 });
    // pennants in the wind down the straights
    b.flags(8, ["#b07bff", "#ffd23f", "#ffffff", "#b07bff", "#ff6b35"], "#c9cfdc");
    b.boards([CP.ring + 2, CP.quay + 3, CP.bay + 2, CP.eli + 1, CP.akorda + 1], [F.qtc, F.party, F.qtc, F.lap, F.party]);
    // snowbanks along the barriers, snow on their caps
    b.s.add(
      new THREE.Mesh(
        tr.ribbon((i, o) => {
          o[0] = -tr.edge[i] - 0.3;
          o[2] = -tr.edge[i] + 0.3;
          o[1] = o[3] = (tr.zone[i] === 1 ? 1.2 : 1.05) + 0.06;
          return !tr.tunnel[i] && !tr.gap[i] && !(tr.short && tr.openS[i]);
        }, 8),
        snowMat(),
      ),
      new THREE.Mesh(
        tr.ribbon((i, o) => {
          o[0] = tr.edge[i] - 0.3;
          o[2] = tr.edge[i] + 0.3;
          o[1] = o[3] = (tr.zone[i] === 1 ? 1.2 : 1.05) + 0.06;
          return !tr.tunnel[i] && !tr.gap[i];
        }, 8),
        snowMat(),
      ),
    );
    for (let i = 0; i < tr.n; i += 3 / STEP) {
      if (tr.tunnel[i] || tr.py[i] > 0.4 || tr.zone[i] === 1) continue;
      for (const side of [-1, 1]) {
        if (tr.short && side === tr.short.side && tr.openS[i]) continue;
        if (R() < 0.35) continue;
        tr.at(i, side * (tr.edge[i] + 1.1 + R() * 0.8), 0, v1);
        if (tr.clearance(v1.x, v1.z) < tr.edge[i] + 0.5) continue;
        b.plain.shape(LO.mound, R() < 0.5 ? "#ffffff" : "#eef4fc", 1.8 + R() * 1.6, 1.4 + R() * 1.2, 1.8 + R() * 1.6, v1.x, -0.05, v1.z, R() * 3);
      }
    }
    // snowy firs and bare birches in the open
    b.trees(170, [-360, 420, -320, 160], (x, z, sz) => (R() < 0.55 ? fir(b, x, z, sz) : birch(b, x, z, sz)), 16);
    weather(b);
  },
};

const v1 = new THREE.Vector3();
const v2 = new THREE.Vector3();
const xz = (v: THREE.Vector3): [number, number] => [v.x, v.z];

let snowM: THREE.MeshToonMaterial | null = null;
function snowMat() {
  snowM ??= Object.assign(new THREE.MeshToonMaterial({ color: "#f4f8ff" }), { userData: { shared: true } });
  return snowM;
}

/** A snowy fir: a dark trunk, three tiers of green with white on top. */
function fir(b: Kit, x: number, z: number, sz: number) {
  b.plain.box("#5a3a24", 0.5 * sz, 1.6 * sz, 0.5 * sz, x, 0.8 * sz, z);
  for (let k = 0; k < 3; k++) {
    const r = (2.6 - k * 0.7) * sz,
      y = (1.6 + k * 1.7) * sz;
    b.plain.shape(LO.cone, k % 2 ? "#2f6a4a" : "#2a5e44", r * 2, 2.4 * sz, r * 2, x, y + 1.2 * sz, z);
    b.plain.shape(LO.cone, "#f4f8ff", r * 1.2, 1.0 * sz, r * 1.2, x, y + 2.0 * sz, z);
  }
}

/** A bare winter birch: a white trunk with dark marks, a few branches, a dusting of snow. */
function birch(b: Kit, x: number, z: number, sz: number) {
  const R = b.R;
  const h = 6 * sz;
  b.plain.box("#f2f0ea", 0.42 * sz, h, 0.42 * sz, x, h / 2, z);
  for (let k = 0; k < 4; k++) b.plain.box("#2b2620", 0.44 * sz, 0.12 * sz, 0.2 * sz, x, (1 + k * 1.3) * sz, z + 0.12 * sz, k);
  for (let k = 0; k < 5; k++) {
    const a = R() * Math.PI * 2,
      y = h * (0.55 + R() * 0.4);
    b.plain.box("#d9d2c6", 0.16 * sz, 2.2 * sz, 0.16 * sz, x + Math.cos(a) * 0.7 * sz, y, z + Math.sin(a) * 0.7 * sz, a, 0.7);
  }
  b.plain.shape(LO.ball, "#e9d9b0", 3 * sz, 2.4 * sz, 3 * sz, x, h * 0.95, z);
}

/** The landmarks, at kart scale (silhouettes that read at speed, a few hundred boxes in all); `name`: the tower's sign. */
function landmarks(b: Kit, name: number[]) {
  const { plain, lit, wins } = b;
  // ---- the NU7 TOWER on its round plaza: violet glass stepping back three times, gold ledges, violet
  // neon up its corners, a crown of gold tiers banded in neon, the spire (ZStreet's NU7 Tower at kart scale)
  {
    const [x, z] = AST.bayterek;
    b.cyl(plain, "#cfd3dc", 22, 0.3, x, 0.15, z);
    b.cyl(lit, "#c9a8ff", 18.5, 0.32, x, 0.17, z);
    b.cyl(plain, "#dfe3ea", 16, 0.36, x, 0.19, z);
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      b.glow(x + Math.cos(a) * 19.5, 0.6, z + Math.sin(a) * 19.5, "#d6c2ff");
    }
    // the shaft's tiers: half width, foot, top
    const tiers: [number, number, number][] = [
      [8, 0.4, 34],
      [7, 34, 50],
      [6, 50, 62],
      [5, 62, 70],
    ];
    for (const [hw, y0, y1] of tiers) {
      const h = y1 - y0;
      wins.box("#8f7ae0", hw * 2, h, hw * 2, x, y0 + h / 2, z, 0, 0, 0, [(hw * 2) / 3.2, h / 3.4, 0, 0]);
      lit.box("#f4b728", hw * 2 + 0.8, 0.7, hw * 2 + 0.8, x, y1 + 0.1, z);
      for (const [sx, sz] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ])
        lit.box("#b07bff", 0.6, h - 1.2, 0.6, x + sx * hw, y0 + h / 2, z + sz * hw);
    }
    // the lobby's gold canopy, toward the boulevard
    plain.box("#f4b728", 9, 0.6, 2.4, x, 5.4, z + 9);
    // the crown: three gold tiers, a violet band round each
    for (let t = 0; t < 3; t++) {
      const hw = 4 - t,
        y0 = 70.5 + t * 3.2;
      plain.box("#d9a63a", hw * 2, 3.2, hw * 2, x, y0 + 1.6, z);
      lit.box("#b07bff", hw * 2 + 0.2, 0.5, hw * 2 + 0.2, x, y0 + 2.6, z);
    }
    // the spire, gold rings up it, a violet light on top
    b.cyl(plain, "#d9a63a", 0.7, 18, x, 89.1, z);
    for (const y of [83, 87, 91]) b.cyl(lit, "#f4b728", 1.4, 0.4, x, y, z);
    lit.box("#b07bff", 0.9, 1.6, 0.9, x, 98.9, z);
    b.glow(x, 99, z, "#b07bff", true);
    b.glow(x, 74, z, "#ffd27a", true);
    // its name, high on all four faces
    for (let k = 0; k < 4; k++) {
      const yaw = (k * Math.PI) / 2;
      b.sign(name, x + Math.sin(yaw) * 8.06, 28, z + Math.cos(yaw) * 8.06, yaw, 2.6, false);
    }
    // a violet wash up the shaft
    for (let y = 8; y < 66; y += 9) b.glow(x, y, z + 8.4, "#cbb2ff");
  }
  // ---- the ZK MALL: the great tent, its skin lit in bands, the road through its foot
  {
    const [x, z] = AST.khan;
    const rx = 52,
      rz = 42,
      H = 64;
    const segs = 28,
      rings = 9;
    const skin = new THREE.BufferGeometry();
    const pos: number[] = [];
    const ring = (k: number) => {
      const f = k / rings;
      const y = 7.6 + (H - 7.6) * f;
      const r = Math.pow(1 - f, 0.7);
      // (the point leans to the west and the back, the cushions twist as it rises)
      return { y, r, ox: -9 * f * f, oz: -6 * f * f, tw: f * 0.5 };
    };
    for (let k = 0; k < rings; k++) {
      const a0 = ring(k),
        a1 = ring(k + 1);
      for (let j = 0; j < segs; j++) {
        const t0 = (j / segs) * Math.PI * 2,
          t1 = ((j + 1) / segs) * Math.PI * 2;
        const p = (q: { y: number; r: number; ox: number; oz: number; tw: number }, t: number) => [x + q.ox + Math.cos(t + q.tw) * rx * q.r, q.y, z + q.oz + Math.sin(t + q.tw) * rz * q.r];
        const A = p(a0, t0),
          B = p(a0, t1),
          C = p(a1, t1),
          D = p(a1, t0);
        pos.push(...A, ...D, ...C, ...A, ...C, ...B);
      }
      // (its bands: gold at the foot, violet in the middle, ice blue up high)
      const band = k === 1 ? "#ffcf6a" : k === 4 ? "#c45bff" : k === 6 ? "#7ff3ff" : "";
      if (band)
        for (let j = 0; j < segs; j++) {
          const t = (j / segs) * Math.PI * 2;
          const q = ring(k + 0.5);
          lit.box(band, 0.7, 1.6, (2 * Math.PI * rx * q.r) / segs + 0.6, x + q.ox + Math.cos(t + q.tw) * rx * q.r * 1.01, q.y, z + q.oz + Math.sin(t + q.tw) * rz * q.r * 1.01, -(t + q.tw), 0, 0);
          if (j % 3 === 0) b.glow(x + q.ox + Math.cos(t + q.tw) * rx * q.r * 1.04, q.y, z + q.oz + Math.sin(t + q.tw) * rz * q.r * 1.04, band, k === 1);
        }
    }
    skin.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    skin.computeVertexNormals();
    plain.add(skin, new THREE.Matrix4(), "#efe2c6");
    skin.dispose();
    // the cable net: helices both ways
    for (const dir of [-1, 1])
      for (let j = 0; j < 14; j++)
        for (let k = 0; k < rings; k++) {
          const q0 = ring(k),
            q1 = ring(k + 1);
          const t0 = (j / 14) * Math.PI * 2 + dir * k * 0.22,
            t1 = t0 + dir * 0.22;
          cable(b, "#8f7c5a", x + q0.ox + Math.cos(t0 + q0.tw) * rx * q0.r * 1.005, q0.y, z + q0.oz + Math.sin(t0 + q0.tw) * rz * q0.r * 1.005, x + q1.ox + Math.cos(t1 + q1.tw) * rx * q1.r * 1.005, q1.y, z + q1.oz + Math.sin(t1 + q1.tw) * rz * q1.r * 1.005, 0.18);
        }
    // the mast's tilted spire, its light
    const top = ring(rings);
    cable(b, "#d8d8e4", x + top.ox, H - 2, z + top.oz, x + top.ox - 6, H + 20, z + top.oz - 3, 0.6);
    lit.box("#ff4040", 0.8, 0.8, 0.8, x + top.ox - 6, H + 20.4, z + top.oz - 3);
    b.glow(x + top.ox - 6, H + 20.4, z + top.oz - 3, "#ff4040");
    // the podium round its foot (a glazed hall), open where the road goes through
    const tr = b.tr;
    for (let j = 0; j < 56; j++) {
      const t = (j / 56) * Math.PI * 2;
      const px = x + Math.cos(t) * rx,
        pz = z + Math.sin(t) * rz;
      if (tr.clearance(px, pz) < 14) continue;
      wins.box("#d8cbb0", 6.4, 7.6, 1.2, px, 3.8, pz, -t + Math.PI / 2, 0, 0, [0.7, 0.6, 0, 0]);
    }
  }
  // ---- CITY HALL: the white palace under its sky-blue dome, at the east end of the axis
  {
    const [x, z] = AST.akorda;
    const yaw = -Math.PI / 2;
    const L = (lx: number, lz: number) => b.local(x, z, yaw, lx, lz);
    // (its frame: x across the front, z out of the front toward the boulevard)
    for (const [lx, w, h] of [
      [0, 26, 16],
      [-25, 24, 11],
      [25, 24, 11],
      [-40, 8, 13],
      [40, 8, 13],
    ] as [number, number, number][]) {
      const [px, pz] = L(lx, 0);
      wins.box("#f4f1ea", w, h, 18, px, h / 2, pz, yaw, 0, 0, [w / 6, h / 5, 0, 0]);
      plain.box("#e6e1d6", w + 0.8, 0.8, 18.8, px, h + 0.4, pz, yaw);
    }
    // the portico: eight tall columns under the entablature
    for (let k = 0; k < 8; k++) {
      const [px, pz] = L(-10.5 + k * 3, 11);
      b.cyl(plain, "#ffffff", 0.7, 14, px, 7, pz);
    }
    const [ex, ez] = L(0, 11);
    plain.box("#f7f5ef", 26, 2.4, 4, ex, 15, ez, yaw);
    // the drum, the dome (gold ribs), the lantern, the spire and its sun
    const [dx, dz] = L(0, -1);
    b.cyl(wins, "#f4f1ea", 8.5, 6, dx, 19, dz);
    b.cyl(lit, "#ffe2a0", 8.7, 0.5, dx, 21.4, dz);
    plain.shape(LO.dome, "#4aa8e8", 18, 15, 18, dx, 22, dz);
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      for (let q = 0; q < 4; q++) {
        const p0 = (q / 4) * (Math.PI / 2),
          p1 = ((q + 1) / 4) * (Math.PI / 2);
        cable(b, "#ffcf4a", dx + Math.cos(a) * 9 * Math.cos(p0), 22 + 7.5 * Math.sin(p0), dz + Math.sin(a) * 9 * Math.cos(p0), dx + Math.cos(a) * 9 * Math.cos(p1), 22 + 7.5 * Math.sin(p1), dz + Math.sin(a) * 9 * Math.cos(p1), 0.35, true);
      }
    }
    b.cyl(lit, "#ffd27a", 1.6, 3, dx, 31, dz);
    b.cyl(plain, "#ffcf4a", 0.3, 12, dx, 38, dz);
    b.ball(lit, "#ffd23f", 1.4, 1.4, 0.4, dx, 44.5, dz, yaw);
    b.glow(dx, 44.5, dz, "#ffd23f", true);
    b.glow(dx, 31, dz, "#ffe2a0", true);
    for (let k = -4; k <= 4; k++) {
      const [px, pz] = L(k * 9, 12.5);
      b.glow(px, 1.2, pz, "#fff2d6", true);
    }
    // the flags: NU7 violet with a gold square
    for (const s of [-1, 1]) {
      const [px, pz] = L(s * 18, 20);
      plain.box("#d8d8e4", 0.3, 14, 0.3, px, 7, pz);
      lit.box("#b07bff", 0.1, 2.4, 4, px, 12.6, pz + 2, 0);
      lit.box("#ffd23f", 0.12, 0.9, 0.9, px, 12.6, pz + 2, 0);
    }
  }
  // ---- the Golden Towers: two gold cans banded floor by floor
  {
    const [x, z] = AST.golden;
    for (const s of [-1, 1]) {
      const px = x + s * 9;
      b.cyl(plain, "#d9a441", 5.6, 62, px, 31, z);
      for (let y = 3; y < 62; y += 3.2) b.cyl(lit, y % 9.6 < 3.2 ? "#ffd98a" : "#ffc95a", 5.7, 0.35, px, y, z);
      b.cyl(lit, "#ffe9b0", 6, 1.2, px, 62.4, z);
      b.glow(px, 63, z, "#ffd98a", true);
    }
    wins.box("#f2efe6", 30, 14, 14, x, 7, z + 12, 0, 0, 0, [4, 2, 0, 0]);
  }
  // ---- the GREAT PYRAMID: pale granite, its glass apex lit blue to gold
  {
    const [x, z] = AST.peace;
    const S = 50;
    b.inked("#d9d2c4", S + 16, 4, S + 16, x, 2, z, 0, 0.08);
    plain.shape(LO.pyr, "#e4ddd0", S * Math.SQRT2, S, S * Math.SQRT2, x, 4 + S / 2, z, Math.PI / 4);
    const A = S * 0.36;
    lit.shape(LO.pyr, "#6fa8ff", A * Math.SQRT2 * 1.02, A * 1.02, A * Math.SQRT2 * 1.02, x, 4 + S - A / 2 + 0.05, z, Math.PI / 4);
    lit.shape(LO.pyr, "#ffd27a", A * 0.5 * Math.SQRT2 * 1.03, A * 0.5 * 1.03, A * 0.5 * Math.SQRT2 * 1.03, x, 4 + S - A * 0.25 + 0.1, z, Math.PI / 4);
    b.glow(x, 4 + S - A * 0.4, z, "#8fc0ff", true);
    b.glow(x, 4 + S - 4, z, "#ffd27a", true);
  }
  // ---- the OPERA HOUSE: white, its great dome, four slim corner towers with gold finials
  {
    const [x, z] = AST.mosque;
    wins.box("#f6f6f2", 34, 12, 34, x, 6, z, 0, 0, 0, [4, 1.5, 0, 0]);
    plain.box("#e8c26a", 34.6, 1, 34.6, x, 11.6, z);
    b.cyl(plain, "#f6f6f2", 11, 6, x, 15, z);
    b.cyl(lit, "#ffd59a", 11.1, 1.2, x, 16, z);
    plain.shape(LO.dome, "#fbfbf8", 24, 20, 24, x, 18, z);
    b.cyl(plain, "#ffcf4a", 0.4, 6, x, 31, z);
    b.ball(lit, "#ffd23f", 1, 1, 1, x, 34.5, z);
    b.glow(x, 28, z, "#fff0c8", true);
    for (const [sx, sz] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ]) {
      plain.shape(LO.dome, "#fbfbf8", 7, 6, 7, x + sx * 11, 12, z + sz * 11);
      const mx = x + sx * 21,
        mz = z + sz * 21;
      b.cyl(plain, "#f6f6f2", 1.3, 40, mx, 20, mz);
      b.cyl(lit, "#ffe2a0", 1.7, 0.8, mx, 24, mz);
      b.cyl(lit, "#ffe2a0", 1.6, 0.8, mx, 34, mz);
      plain.shape(LO.cone, "#fbfbf8", 2.8, 5, 2.8, mx, 42.5, mz);
      b.ball(lit, "#ffd23f", 0.6, 0.6, 0.6, mx, 46, mz);
      b.glow(mx, 34, mz, "#ffe2a0");
    }
  }
  // ---- the zkSNARK OF LIBERTY: the white column, the golden torch held high, in its roundabout
  {
    const [x, z] = AST.eli;
    b.cyl(plain, "#cfd3dc", 9, 0.6, x, 0.3, z);
    b.cyl(plain, "#e4e4ea", 5, 2, x, 1.6, z);
    plain.box("#d8d2c8", 5, 5, 5, x, 4.6, z);
    plain.box("#c9a24a", 5.2, 2.4, 5.2, x, 4.4, z);
    b.cyl(plain, "#fafaf8", 1.3, 40, x, 27, z);
    b.cyl(lit, "#ffcf4a", 1.8, 1.4, x, 47.2, z);
    // (the torch: a gold grip and cup, the flame)
    b.cyl(plain, "#c9a24a", 0.7, 2.6, x, 49.2, z);
    b.cyl(lit, "#ffcf4a", 1.6, 0.9, x, 50.9, z);
    lit.shape(LO.cone, "#ff9d1a", 2.6, 4.4, 2.6, x, 53.5, z);
    lit.shape(LO.cone, "#ffe27a", 1.4, 2.8, 1.4, x, 53, z);
    b.glow(x, 53, z, "#ffb030", true);
    for (let y = 8; y < 46; y += 8) b.glow(x, y, z + 1.4, "#e8f0ff");
  }
  // ---- the Northern Lights: three lens towers in a row, their crowns an aurora green
  {
    const [x, z] = AST.lights;
    // (each a lens of glass in steps, its roof sweeping up to a white fin, an aurora line along it)
    [
      [-20, 26],
      [0, 32],
      [21, 40],
    ].forEach(([dx, h], k) => {
      const yaw = 0.25;
      for (let q = 0; q < 5; q++) {
        const f = q / 4;
        const w = 14 * (1 - 0.55 * Math.abs(f - 0.5) * 2) + 2;
        const hh = h * (0.82 + 0.18 * f);
        const [px, pz] = b.local(x + dx, z, yaw, -6 + q * 3, 0);
        wins.box(q % 2 ? "#7fc8c0" : "#8fd2c8", 3.1, hh, w * 0.55, px, hh / 2, pz, yaw, 0, 0, [0.5, hh / 6, 0, 0]);
        lit.box(q % 2 ? "#5dffb0" : "#7ff3ff", 3.2, 0.45, w * 0.55 + 0.2, px, hh + 0.2, pz, yaw);
      }
      const [fx, fz] = b.local(x + dx, z, yaw, 8.6, 0);
      plain.box("#ffffff", 0.7, h * 0.3, 3, fx, h + h * 0.05, fz, yaw);
      b.glow(x + dx, h + 1, z, k === 1 ? "#5dffb0" : "#7ff3ff", true);
    });
  }
  // ---- MIDTOWN's towers: the tallest (its sloped crown, a red light) and its two twins (gold crowns)
  {
    const [x, z] = AST.adp;
    wins.box("#8fa6c8", 13, 112, 13, x, 56, z, 0.2, 0, 0, [2, 18, 0, 0]);
    plain.box("#c9d6ea", 13.4, 9, 13.4, x, 114, z, 0.2, 0.5);
    plain.box("#d8d8e4", 0.5, 16, 0.5, x, 124, z);
    lit.box("#ff3030", 0.9, 0.9, 0.9, x, 132, z);
    b.glow(x, 132, z, "#ff3030");
    b.glow(x, 116, z, "#bfe6ff", true);
    for (const [dx, dz, h] of [
      [-16, 6, 54],
      [14, 10, 66],
      [2, -16, 46],
    ])
      wins.box("#9fb2d0", 10, h, 10, x + dx, h / 2, z + dz, 0.2, 0, 0, [1.6, h / 6, 0, 0]);
    const [tx, tz] = AST.talan;
    for (const [dx, h] of [
      [-6, 76],
      [8, 58],
    ]) {
      wins.box("#d8c8a8", 9, h, 9, tx + dx, h / 2, tz, 0.4, 0, 0, [1.5, h / 6, 0, 0]);
      lit.box("#ffd27a", 7, 5, 7, tx + dx, h + 2.5, tz, 0.4);
      b.glow(tx + dx, h + 3, tz, "#ffd27a", true);
    }
  }
}

/** The boulevard's park between the carriageways: lawns under snow, frozen pools, birches in rows, garlands. */
function boulevard(b: Kit) {
  const { plain, lit } = b;
  const R = b.R;
  for (let x = -200; x <= 330; x += 14) {
    if (Math.abs(x - AST.bayterek[0]) < 30) continue;
    // (the median: north of the road, from z -34 to 6)
    if (x < 300) {
      plain.box("#f0f4fb", 13, 0.25, 34, x, 0.12, -14);
      lit.box("#a9dcff", 9, 0.27, 3, x, 0.14, -14);
      if ((x / 14) % 2) for (const s of [-1, 1]) birch(b, x + s * 3, -14 + s * 11, 0.8 + R() * 0.3);
      else
        for (const s of [-1, 1]) {
          plain.box("#2b2f4a", 0.2, 5, 0.2, x, 2.5, -14 + s * 9);
          lit.box("#e8f4ff", 0.6, 0.6, 0.6, x, 5.2, -14 + s * 9);
          b.glow(x, 5.2, -14 + s * 9, "#bfe6ff");
        }
    }
  }
  // garlands of little lights strung across the boulevard
  for (let x = -180; x <= 300; x += 28) {
    if (Math.abs(x) < 34) continue;
    for (let k = 0; k <= 10; k++) {
      const z = -34 + k * 5.6,
        y = 6.5 - Math.sin((k / 10) * Math.PI) * 1.4;
      lit.box(k % 2 ? "#ffd23f" : "#7ff3ff", 0.3, 0.3, 0.3, x, y, z);
      if (k % 2) b.glow(x, y, z, k % 4 === 1 ? "#ffd23f" : "#7ff3ff");
    }
  }
  // skaters on the frozen canal, a rink's lights
  for (let k = 0; k < 16; k++) {
    const x = -300 + R() * 640,
      z = -122 - R() * 22;
    if (x > 10 && x < 170) continue;
    const c = ["#ff5f5f", "#3ec6ff", "#ffd23f", "#8ee35b", "#c45bff"][k % 5];
    plain.box(c, 0.6, 1, 0.4, x, 0.7, z, R() * 3);
    plain.box("#f2c9a0", 0.36, 0.36, 0.36, x, 1.4, z);
  }
  for (let x = -280; x <= 320; x += 40) {
    plain.box("#2b2f4a", 0.2, 6, 0.2, x, 3, -150);
    b.glow(x, 6, -150, "#ffe9b0");
  }
}

/** The lane over the frozen bay: groomed snow between orange poles, thin ice either side, holes to dodge. */
function iceLane(b: Kit, thin: number[]) {
  const tr = b.tr;
  const P = tr.short!;
  const yaw = Math.atan2(P.dx, P.dz);
  for (let u = Math.max(0, P.ua - 2); u < Math.min(P.len, P.ub + 2); u += 2) {
    tr.onShort(u + 1, 0, v1);
    const ph = tr.shortHalf(u + 1);
    b.plain.box(Math.floor(u / 2) % 2 ? "#f4f8ff" : "#e8f0fb", ph * 2, 0.08, 2.05, v1.x, -0.02, v1.z, yaw);
    if (Math.floor(u) % 8 === 0)
      for (const side of [-1, 1]) {
        tr.onShort(u + 1, side * (ph + 0.3), v2);
        b.plain.box("#ff7a1a", 0.18, 1.6, 0.18, v2.x, 0.8, v2.z);
        b.lit.box("#ffb040", 0.3, 0.3, 0.3, v2.x, 1.65, v2.z);
        b.glow(v2.x, 1.7, v2.z, "#ffb040");
      }
  }
  for (const u of [P.u1 + 6, (P.u1 + P.u2) / 2, P.u2 - 8])
    for (const side of [-1, 1]) {
      tr.onShort(u, side * (P.half + 4), v1);
      b.plain.box("#2b2f4a", 0.18, 2.2, 0.18, v1.x, 1.1, v1.z);
      b.sign(thin, v1.x, 2.2, v1.z, yaw + Math.PI, 0.7, true);
    }
}

/** The snow falling round the camera (one draw), blown sideways in the gusts; spindrift across the road. */
function weather(b: Kit) {
  const N = 900;
  const pos = new Float32Array(N * 3);
  const seed = new Float32Array(N);
  for (let i = 0; i < N; i++) ((pos[i * 3] = (Math.random() - 0.5) * 80), (pos[i * 3 + 1] = Math.random() * 30), (pos[i * 3 + 2] = (Math.random() - 0.5) * 80), (seed[i] = Math.random()));
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const flakes = new THREE.Points(g, new THREE.PointsMaterial({ color: "#ffffff", size: 0.32, map: haloTex(), transparent: true, depthWrite: false, opacity: 0.95 }));
  flakes.frustumCulled = false;
  b.s.add(flakes);
  const C_SPIN = ["#ffffff", "#e8f4ff"];
  const o = { speed: 0, up: 0, gravity: 0, size: 0.14, life: 0.7, drag: 0, dir: new THREE.Vector3() };
  b.anims.push((t, dt) => {
    const c = b.ctx;
    if (!c) return;
    const cam = c.camera.position;
    const gu = c.gust;
    const tr = b.tr;
    const windy = tr.windy[c.focus.seg] ? 1 : 0;
    const side = gu.side;
    // (the gust blows across the road at the camera: its direction in the world)
    const i = c.focus.seg;
    const wx = -tr.tz[i] * side,
      wz = tr.tx[i] * side;
    const blow = windy * (gu.k * 22 + gu.warn * 6) + 1.2;
    for (let n = 0; n < N; n++) {
      let x = pos[n * 3],
        y = pos[n * 3 + 1],
        z = pos[n * 3 + 2];
      y -= dt * (2.2 + seed[n] * 1.6);
      x += dt * (wx * blow + Math.sin(t * 1.3 + seed[n] * 9) * 0.6);
      z += dt * (wz * blow + Math.cos(t * 1.1 + seed[n] * 7) * 0.6);
      // (kept in a box round the camera: what leaves one side comes back on the other)
      const rx = x - cam.x,
        rz = z - cam.z;
      if (rx > 40) x -= 80;
      else if (rx < -40) x += 80;
      if (rz > 40) z -= 80;
      else if (rz < -40) z += 80;
      if (y < cam.y - 8) y += 30;
      else if (y > cam.y + 22) y -= 30;
      pos[n * 3] = x;
      pos[n * 3 + 1] = y;
      pos[n * 3 + 2] = z;
    }
    g.attributes.position.needsUpdate = true;
    // spindrift: snow streaming across the road ahead (the warning, then the gust)
    if (windy && (gu.warn > 0 || gu.k > 0) && c.playing) {
      const f = c.focus;
      const n = Math.random() < (gu.k > 0 ? 1 : gu.warn * 0.6) ? (gu.k > 0 ? 4 : 1) : 0;
      for (let q = 0; q < n; q++) {
        const ahead = 6 + Math.random() * 30;
        const across = (Math.random() - 0.5) * 24 - side * 8;
        v1.set(f.x + Math.sin(f.yaw) * ahead - Math.cos(f.yaw) * across, 0.3 + Math.random() * 1.4, f.z + Math.cos(f.yaw) * ahead + Math.sin(f.yaw) * across);
        o.dir.set(wx * (10 + gu.k * 14), 0.3, wz * (10 + gu.k * 14));
        c.fx.burst(v1, 1, C_SPIN, o);
      }
    }
  });
}
