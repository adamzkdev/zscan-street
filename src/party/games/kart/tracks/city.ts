/**
 * ZSTREET: the original circuit, a figure of eight through the city at golden hour. Down the start
 * straight past the stands, round the big sweeper, through the S of the old town, up and over the
 * SNARK BRIDGE (the circuit crosses itself under it), round the lake (or straight over it on the
 * plank: the risky shortcut), the hairpin, the ZK TOWER's tunnel, the woods, the jump over the
 * canal, under the bridge, to the line. Three laps.
 */
import * as THREE from "three";
import { T } from "../../../../i18n/lang";
import { rng } from "../../../kit";
import { qBlock, toonSteps } from "../../../k3";
import type { Course } from "../course";
import type { Kit } from "../scenery";
import { Merge, STEP, WATER } from "../track";

/** Where things are, by control point. */
const CP = { sweep: 5, sweepOut: 7, chicane: 10, climb: 12, crossE: 15, fork: 19, lake: 22, rejoin: 26, hairpin: 29, hairOut: 31, tunnel0: 32, tunnel1: 34, woods: 37, sweepI: 39, crossA: 43 };

const v1 = new THREE.Vector3();
const v2 = new THREE.Vector3();
const v3 = new THREE.Vector3();
const BRIDGE_H = 9;

export const CITY: Course = {
  key: "city",
  title: "ZSTREET",
  titleZh: "ZStreet",
  tag: "ZStreet's figure of eight at golden hour: the bridge, the plank over the lake, the canal jump.",
  tagZh: "黄金时刻的 ZStreet 八字赛道：大桥、湖上木板捷径、运河飞跃。",
  song: "race",
  ambience: "city-day",
  gantry: [T("SNARK KART", "Snark 卡丁车"), "ZK PARTY"],
  orbit: { x: -20, z: 0, r: 120, h: 62 },
  spec: {
    ctrl: [
      [130, -62], // 0 the line
      [165, -62],
      [193, -58],
      [223, -48], // 3 the big sweeper
      [243, -28],
      [251, 0],
      [243, 28],
      [223, 48],
      [195, 57],
      [175, 58], // 9 the old town's S
      [156, 65],
      [138, 62],
      [120, 51], // 12 up to the bridge
      [60, 34],
      [30, 17],
      [0, 0], // 15 over the crossing
      [-30, -18],
      [-60, -38],
      [-86, -55],
      [-110, -62], // 19 the fork: the plank, or round the lake
      [-127, -72],
      [-142, -90],
      [-162, -100],
      [-183, -94],
      [-197, -80],
      [-207, -67],
      [-219, -60], // 26 the plank comes back
      [-233, -57], // 27 the hairpin
      [-245, -52],
      [-250, -40],
      [-245, -28],
      [-233, -23],
      [-212, -21], // 32 the tower's tunnel
      [-185, -20],
      [-160, -15],
      [-140, -2], // 35 the woods
      [-129, 18],
      [-126, 38],
      [-117, 58],
      [-98, 73],
      [-72, 73],
      [-48, 55], // 41 the jump
      [-24, 28],
      [0, 0], // 43 under the bridge
      [24, -28],
      [45, -50],
      [92, -62],
    ],
    half: 6.5,
    laps: 3,
    city: [
      [44, 2],
      [9, 12],
      [31, 35],
    ],
    edges: [11, 9, 8.2, 9.5, 11],
    hills: [{ at: [CP.crossE, 0], up: 73, flat: 44, down: 78, h: BRIDGE_H }],
    jump: { at: [CP.crossA, -58], len: 24, h: 3, gap: 14 },
    tunnel: [CP.tunnel0, CP.tunnel1],
    short: { a: CP.fork, b: CP.rejoin, half: 2.7, side: -1, kind: "water" },
    boxes: [
      [1, -10],
      [CP.sweepOut, 0],
      [CP.crossE, 0],
      [CP.tunnel1 + 1, 0],
      [CP.sweepI, 0],
    ],
    pads: [
      [CP.sweep, 0],
      [CP.climb, -6],
      [CP.hairOut, 4],
      [CP.sweepI, 0],
      [CP.woods, -14],
      [CP.sweep - 2, 0],
    ],
    padJump: true,
    padShort: true,
    coins: [
      [2, 0],
      [CP.chicane + 1, 0],
      [CP.crossE, -46],
      [CP.lake, 0],
      [CP.tunnel0 + 1, 0],
      [CP.woods + 1, 0],
      [CP.crossA, 30],
      [CP.sweep + 2, 0],
    ],
  },
  theme: {
    sky: ["#3f6bd6", "#ffc98e"],
    fog: [170, 520],
    sun: { color: "#ffd9a8", i: 2.3, pos: [-70, 45, 40] },
    hemi: { sky: "#e9eeff", ground: "#8f8670", i: 1.7 },
    night: false,
    // (golden hour: the sun low in the west where the light comes from, long clouds lit from under)
    dome: { clouds: 18, cloud: "#fff1dc", cloudShade: "#e9a98c", disc: { az: 30, el: 21, color: "#fff3cf", size: 8, glow: 7 }, haze: 0.5 },
    shadowK: 0.9,
    ground: (g, S) => {
      // mown grass: two wide bands, tufts and daisies as small squares
      g.fillStyle = "#74ba58";
      g.fillRect(0, 0, S, S);
      g.fillStyle = "#6bb051";
      g.fillRect(0, 0, S, S / 2);
      const R = rng(0x9a55);
      for (let i = 0; i < 90; i++) {
        g.fillStyle = i % 9 === 0 ? "rgba(255,250,220,0.5)" : i % 2 ? "rgba(40,110,30,0.16)" : "rgba(200,240,140,0.16)";
        const d = i % 9 === 0 ? 3 : 4 + (i % 3) * 3;
        g.fillRect(Math.floor((R() * S) / 4) * 4, Math.floor((R() * S) / 4) * 4, d, i % 9 === 0 ? 3 : Math.max(3, d - 3));
      }
    },
    groundM: 14,
    bedOpen: "#6fb654",
    pave: (g) => {
      g.fillStyle = "#e2dcea";
      g.fillRect(0, 0, 64, 64);
      g.fillStyle = "#cfc7dc";
      for (let k = 0; k < 64; k += 16) (g.fillRect(0, k, 64, 2), g.fillRect(k, 0, 2, 64));
    },
    bedDeck: "#d4cfe0",
    road: { base: "#5b5d6c", worn: "rgba(255,255,255,0.05)", grit: ["rgba(255,255,255,0.045)", "rgba(0,0,0,0.06)"], dash: "#f6f2e4", edge: "#ece8dc" },
    kerb: ["#ff3b3b", "#ffffff"],
    rumble: ["#ffffff", "#3e7bff"],
    wall: ["#3ec6ff", "#ffffff", "#ff6b35", "#ffffff"],
    town: ["#ece6f4", ["#ff5fa2", "#ffd23f", "#3ec6ff", "#8ee35b"]],
    cap: "#2b2f4a",
    brick: ["#e0a47a", "#c9875e"],
    bank: "#b8aecb",
    water: (c) => {
      c.fillStyle = "#3fa9f5";
      c.fillRect(0, 0, 64, 64);
      c.fillStyle = "#7fd6ff";
      for (let i = 0; i < 10; i++) c.fillRect((i * 23) % 64, (i * 41) % 64, 14, 3);
    },
    waterM: 9,
    waterDrift: [0.012, 0],
    windows: { lit: 0.3, on: "#fff1c2", off: "#7d8fb5" },
    skyline: { r: 300, n: 90, tall: 1.7, pal: ["#e9dccb", "#c9d6e6", "#f2c9a0", "#b9c7d8", "#ddd0f0", "#f0e6d0"] },
    clouds: 9,
    cloudColor: "#ffffff",
  },
  water: (tr) => {
    const P = tr.short!;
    // the lake: the shore along the road round it, the plank's far side bulging out
    const lake: THREE.Vector2[] = [];
    const iw1 = tr.near(P.ax + P.dx * P.w1, P.az + P.dz * P.w1, P.iA),
      iw2 = tr.near(P.ax + P.dx * P.w2, P.az + P.dz * P.w2, P.iB);
    for (let i = iw1; i !== iw2; i = (i + 2) % tr.n) {
      tr.at(i, -tr.edge[i] - 1.5, 0, v1);
      lake.push(new THREE.Vector2(v1.x, -v1.z));
    }
    for (let k = 0; k <= 40; k++) {
      const u = P.w2 - ((P.w2 - P.w1) * k) / 40;
      const f = (u - P.w1) / (P.w2 - P.w1);
      tr.onShort(u, -(P.half + 1.2 + 16 * Math.pow(Math.sin(Math.PI * f), 0.8)), v1);
      lake.push(new THREE.Vector2(v1.x, -v1.z));
    }
    return [lake];
  },
  scenery(b) {
    const tr = b.tr;
    const R = b.R;
    const F = {
      gp: b.face(T("ZK PARTY GRAND PRIX", "ZK 派对大奖赛"), "#ffffff", "#3ec6ff", true),
      tower: b.face(T("ZK TOWER", "ZK 塔"), "#ffffff", "#ff6b35"),
      bridge: b.face(T("SNARK BRIDGE", "Snark 大桥"), "#ffffff", "#3e7bff"),
      party: b.face("ZK PARTY", "#ffffff", "#ff5fa2"),
      pq: b.face(T("SHIELDED BY DEFAULT", "默认屏蔽"), "#ffffff", "#8e5bff"),
      city: b.face("ZSTREET", "#ffd23f", "#2b2f4a"),
      chev: b.face("", "#fff", "#ff3b3b", false, chevPaint),
      splash: b.face(T("SPLASH ZONE", "溅水区"), "#ffffff", "#3fb4ff"),
      qtc: b.face("ZCASH", "#5a3a00", "#ffcf2e"),
      go: b.face(T("GO GO GO!", "冲冲冲！"), "#ffffff", "#8ee35b"),
      lap: b.face(T("FULL SPEED", "全速前进"), "#ffffff", "#ff6b35"),
    };
    // the stands by the start straight (outside the loop) and at the hairpin, with crowds
    const outSide = (i: number) => (tr.clearance(...xz(tr.at(i, 30))) > tr.clearance(...xz(tr.at(i, -30))) ? 1 : -1);
    b.stand(tr.ci[1], outSide(tr.ci[1]), 44, 5, F.gp);
    b.stand(tr.ci[CP.hairpin], outSide(tr.ci[CP.hairpin]), 26, 4, F.go);
    // arches over the road: banners you drive under
    b.arch(tr.ci[CP.sweep - 1], F.party, "#ff5fa2");
    b.arch(tr.ci[CP.chicane], F.pq, "#8e5bff");
    b.arch(tr.ci[CP.woods], F.lap, "#ff6b35");
    b.arch(tr.ci[CP.climb + 1], F.city, "#3ec6ff");
    tower(b, F.tower);
    bridge(b, F.bridge);
    lakeSide(b, F.splash);
    b.chevrons(
      [
        [CP.hairpin - 2, CP.hairpin + 2],
        [CP.chicane - 1, CP.chicane + 1],
      ],
      F.chev,
    );
    b.cones();
    // the landmarks: the giant Z-Block, the Ferris wheel
    b.clear(152, 0, 14);
    if (tr.clearance(152, 0) > 24) {
      b.inked("#e9e3f5", 10, 2, 10, 152, 1, 0, 0.3, 0.08);
      b.inked("#ffd23f", 8, 0.5, 8, 152, 2.25, 0, 0.3, 0.05);
      const q8 = qBlock(8);
      q8.position.set(152, 9, 0);
      b.s.add(q8);
      b.spinners.push({ o: q8, k: 0.4 });
    }
    if (tr.clearance(-82, 12) > 26) b.wheel(-82, 12, 0.9, 17, { rim: ["#ff6b35", "#ffffff"], leg: "#ece6f4", base: "#ff5fa2", cabins: ["#ff6b35", "#3ec6ff", "#8ee35b", "#ff5fa2", "#ffd23f", "#a98bff"] });
    else b.clear(-82, 12, 22);
    // stands and billboards keep their room
    for (const c of [1, CP.hairpin]) {
      const i = tr.ci[c];
      for (const side of [-1, 1]) b.clear(...xz(tr.at(i, side * (tr.edge[i] + 9))), 26);
    }
    // the city round the circuit: blocks of flats, awnings over the doors in town
    b.buildings({
      pal: ["#f2b38a", "#f7d79b", "#b8d4f0", "#d9c3f0", "#f0a7a7", "#a8e0c0", "#ffe0b8", "#c9d2e8"],
      roof: ["#efe7dc", "#ff8a6b", "#6bb8ff", "#ffd23f"],
      deco: (x, z, w, d, _h, yaw, town, side, i) => {
        if (!town || R() > 0.6) return;
        const fx = -tr.tz[i] * -side,
          fz = tr.tx[i] * -side;
        b.plain.box(["#ff5fa2", "#3ec6ff", "#8ee35b", "#ffd23f"][Math.floor(R() * 4)], w * 0.6, 0.25, 1.4, x + fx * (d / 2 + 0.6), 3.2, z + fz * (d / 2 + 0.6), yaw, side * 0.3);
      },
    });
    b.lamps(15);
    b.flags();
    b.boards([CP.sweep + 1, CP.chicane + 2, CP.lake + 1, CP.tunnel1 + 2, CP.woods + 2, 45], [F.qtc, F.city, F.party, F.pq, F.qtc, F.city]);
    b.trees(240, [-280, 260, -150, 110], (x, z, s) => b.leafy(x, z, s));
    // a hedge of bushes along the open stretches, just past the barrier
    for (let i = 0; i < tr.n; i += 5 / STEP) {
      if (tr.zone[i] !== 0 || tr.gap[i] || tr.py[i] > 0.3 || R() < 0.5) continue;
      const side = R() < 0.5 ? -1 : 1;
      tr.at(i, side * (tr.edge[i] + 2.2 + R()), 0, v1);
      if (tr.clearance(v1.x, v1.z) < tr.edge[i] + 1.8) continue;
      b.plain.box(R() < 0.5 ? "#4fbf4f" : "#6bd45b", 1.6, 1.1, 1.6, v1.x, 0.55, v1.z, R());
    }
    // hot-air balloons far off, drifting on the evening air (one draw)
    const bal = new Merge();
    for (let k = 0; k < 7; k++) {
      const a = R() * Math.PI * 2,
        d = 150 + R() * 120;
      const x = Math.cos(a) * d,
        z = Math.sin(a) * d,
        y = 40 + R() * 35;
      const c = ["#ff5fa2", "#ffd23f", "#3ec6ff", "#8ee35b", "#ff6b35", "#a98bff", "#ffffff"][k];
      b.ball(bal, c, 4.5, 5.5, 4.5, x, y, z);
      bal.box("#ffffff", 9.2, 1.4, 9.2, x, y, z);
      bal.box("#8a5a33", 2, 1.6, 2, x, y - 8, z);
    }
    const balloons = new THREE.Mesh(bal.build(), new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonSteps() }));
    balloons.userData.noShadow = true;
    b.s.add(balloons);
    b.anims.push((t) => balloons.position.set(t * 0.35, Math.sin(t * 0.3) * 2.2, Math.sin(t * 0.11) * 6));
    // gulls over the lake, swifts wheeling over the old town
    {
      const P = tr.short!;
      tr.onShort((P.w1 + P.w2) / 2, -(P.half + 6), v1);
      b.birds(v1.x, v1.z, 16, 34, 9, "#ffffff", 2.4);
      b.birds(170, 20, 44, 70, 8, "#3a3550", 2.0);
    }
  },
};

const xz = (v: THREE.Vector3): [number, number] => [v.x, v.z];

export function chevPaint(g: CanvasRenderingContext2D, w: number) {
  g.fillStyle = "#ffffff";
  for (let k = 0; k < 4; k++) {
    const cx = w / 2 - 150 + k * 100;
    g.beginPath();
    g.moveTo(cx + 30, 22);
    g.lineTo(cx - 20, 64);
    g.lineTo(cx + 30, 106);
    g.lineTo(cx + 58, 106);
    g.lineTo(cx + 8, 64);
    g.lineTo(cx + 58, 22);
    g.closePath();
    g.fill();
  }
}

/** The ZK TOWER over the tunnel: one tall block, its windows, its sign at both mouths, a Z-Block on top. */
function tower(b: Kit, word: number[]) {
  const tr = b.tr;
  const t = tr.range(tr.tunnel);
  if (!t) return;
  const mid = t.mid;
  const y0 = tr.ty[mid];
  const len = t.cnt * STEP + 4;
  const e = tr.edge[mid];
  tr.at(mid, 0, 0, v1);
  const cx = v1.x,
    cz = v1.z;
  const H0 = 7.6,
    TH = 46;
  b.wins.box("#a596e8", e * 2 + 8, TH, len, cx, H0 + TH / 2, cz, y0, 0, 0, [3, 4, 0, 0]);
  b.ink.box(0x15101f, e * 2 + 8.24, TH + 0.24, len + 0.24, cx, H0 + TH / 2, cz, y0);
  b.plain.box("#ff6b35", e * 2 + 9, 1.4, len + 1, cx, H0 + 0.7, cz, y0);
  b.ink.box(0x15101f, e * 2 + 9.12, 1.52, len + 1.12, cx, H0 + 0.7, cz, y0);
  b.plain.box("#5a4ea8", e * 2 + 9, 1.2, len + 1, cx, H0 + TH + 0.6, cz, y0);
  for (const k of [-1, 1]) for (const l of [-1, 1]) b.plain.box("#ffd23f", 1.2, TH, 1.2, cx + (Math.cos(y0) * k * (e + 4) + Math.sin(y0) * l * (len / 2)), H0 + TH / 2, cz + (-Math.sin(y0) * k * (e + 4) + Math.cos(y0) * l * (len / 2)), y0);
  for (const end of [-1, 1]) {
    const zx = cx + Math.sin(y0) * end * (len / 2 + 0.62),
      zz = cz + Math.cos(y0) * end * (len / 2 + 0.62);
    b.sign(word, zx, 10.6, zz, y0 + (end < 0 ? Math.PI : 0), 2.6, false);
  }
  const top = qBlock(7);
  top.position.set(cx, H0 + TH + 5, cz);
  b.s.add(top);
  b.spinners.push({ o: top, k: 0.7 });
}

/** The SNARK BRIDGE: pillars under the deck, two pylons over it with their sign, posts down the railing. */
function bridge(b: Kit, word: number[]) {
  const tr = b.tr;
  const cE = tr.ci[CP.crossE];
  let s0 = -1,
    s1 = -1;
  for (let k = -60 / STEP; k <= 60 / STEP; k++) {
    const i = tr.wrap(cE + k);
    if (tr.span[i] && s0 < 0) s0 = i;
    if (tr.span[i]) s1 = i;
  }
  for (const i of [s0, s1]) {
    if (i < 0) continue;
    for (const side of [-1, 0, 1]) {
      tr.at(i, side * (tr.edge[i] - 0.5), 0, v1);
      b.plain.box("#cfc8de", 1.8, BRIDGE_H - 1.2, 1.8, v1.x, (BRIDGE_H - 1.2) / 2 - 0.1, v1.z, tr.ty[i]);
      b.ink.box(0x15101f, 1.92, BRIDGE_H - 1.1, 1.92, v1.x, (BRIDGE_H - 1.2) / 2 - 0.1, v1.z, tr.ty[i]);
    }
  }
  const i = cE;
  const y0 = tr.ty[i];
  const e = tr.edge[i];
  for (const side of [-1, 1]) {
    tr.at(i, side * (e + 2.4), 0, v1);
    b.plain.box("#3e7bff", 1.6, BRIDGE_H + 11, 1.6, v1.x, (BRIDGE_H + 11) / 2, v1.z, y0);
    b.ink.box(0x15101f, 1.74, BRIDGE_H + 11.1, 1.74, v1.x, (BRIDGE_H + 11) / 2, v1.z, y0);
    b.plain.box("#ffd23f", 2, 0.8, 2, v1.x, BRIDGE_H + 11.2, v1.z, y0);
  }
  for (const side of [-1, 1]) {
    tr.at(i, side * (e + 2.4), 0, v2);
    for (const dir of [-1, 1])
      for (let c = 1; c <= 3; c++) {
        const j = tr.wrap(i + (dir * c * 7) / STEP);
        tr.at(j, side * (tr.edge[j] + 0.4), 0, v3);
        cable(b, "#ffffff", v2.x, BRIDGE_H + 10.5, v2.z, v3.x, tr.py[j] + 1.1, v3.z);
      }
  }
  tr.at(i, 0, 0, v1);
  b.plain.box("#3e7bff", e * 2 + 6, 1.6, 1.1, v1.x, BRIDGE_H + 9, v1.z, y0);
  b.ink.box(0x15101f, e * 2 + 6.14, 1.74, 1.24, v1.x, BRIDGE_H + 9, v1.z, y0);
  b.sign(word, v1.x - tr.tx[i] * 0.57, BRIDGE_H + 9, v1.z - tr.tz[i] * 0.57, y0 + Math.PI, 1.4, false);
  b.sign(word, v1.x + tr.tx[i] * 0.57, BRIDGE_H + 9, v1.z + tr.tz[i] * 0.57, y0, 1.4, false);
  // posts and pennants down the railing, the whole way up and down
  for (let k = -95 / STEP; k <= 100 / STEP; k += 5 / STEP) {
    const j = tr.wrap(cE + k);
    if (tr.py[j] < 1.5) continue;
    for (const side of [-1, 1]) {
      tr.at(j, side * (tr.edge[j] + 0.1), 0, v1);
      b.plain.box("#2b2f4a", 0.2, 2.6, 0.2, v1.x, v1.y + 1.3, v1.z, tr.ty[j]);
      b.plain.box(["#ff6b35", "#3ec6ff", "#ffd23f", "#ff5fa2"][(k / 10) & 3], 0.05, 0.7, 0.9, v1.x + tr.tx[j] * 0.45, v1.y + 2.2, v1.z + tr.tz[j] * 0.45, tr.ty[j]);
    }
  }
}

/** A thin box from (ax, ay, az) to (bx, by, bz): a cable, a strut. */
export function cable(b: Kit, c: string, ax: number, ay: number, az: number, bx: number, by: number, bz: number, t = 0.16, lit = false) {
  const len = Math.hypot(bx - ax, by - ay, bz - az);
  const yaw = Math.atan2(bx - ax, bz - az);
  const pitch = Math.atan2(ay - by, Math.hypot(bx - ax, bz - az));
  (lit ? b.lit : b.plain).box(c, t, t, len, (ax + bx) / 2, (ay + by) / 2, (az + bz) / 2, yaw, pitch);
}

/** The lake: the plank over it (planks, posts, hazard edges), buoys, the lighthouse, the splash sign. */
function lakeSide(b: Kit, splash: number[]) {
  const tr = b.tr;
  const P = tr.short!;
  const yaw = Math.atan2(P.dx, P.dz);
  const u0 = Math.max(0, P.ua - 1),
    u1 = Math.min(P.len, P.ub + 1);
  for (let u = u0; u < u1; u += 1.0) {
    tr.onShort(u + 0.5, 0, v1);
    const ph = tr.shortHalf(u + 0.5);
    b.plain.box(Math.floor(u) % 2 ? "#c58b52" : "#b57a45", ph * 2, 0.3, 0.92, v1.x, -0.12, v1.z, yaw);
    for (const side of [-1, 1]) {
      tr.onShort(u + 0.5, side * (ph - 0.12), v1);
      b.plain.box(Math.floor(u / 2) % 2 ? "#ffd23f" : "#2b2f4a", 0.24, 0.1, 1.0, v1.x, 0.06, v1.z, yaw);
      if (Math.floor(u) % 6 === 0) {
        tr.onShort(u + 0.5, side * (ph + 0.15), v1);
        b.plain.box("#6b4a2a", 0.4, 1.6, 0.4, v1.x, -0.6, v1.z, yaw);
      }
    }
  }
  // buoys and the lighthouse
  let seed = 77;
  const R = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let k = 0; k < 14; k++) {
    const u = P.w1 + R() * (P.w2 - P.w1);
    const off = (R() < 0.5 ? -1 : 1) * (P.half + 3 + R() * 8);
    tr.onShort(u, off, v1);
    const near = tr.near(v1.x, v1.z, P.iA + ((P.iB - P.iA + tr.n) % tr.n) / 2);
    if (Math.hypot(v1.x - tr.px[near], v1.z - tr.pz[near]) < tr.edge[near] + 3) continue;
    b.plain.box(k % 2 ? "#ff3b3b" : "#ffffff", 0.7, 0.9, 0.7, v1.x, WATER + 0.4, v1.z, R());
  }
  {
    tr.onShort((P.w1 + P.w2) / 2, -(P.half + 11), v1);
    const lx = v1.x,
      lz = v1.z;
    for (let k = 0; k < 6; k++) {
      const r = 1.6 - k * 0.13;
      b.cyl(b.plain, k % 2 ? "#ffffff" : "#ff3b3b", r, 1.6, lx, WATER + 1 + k * 1.6, lz);
    }
    b.plain.box("#7d8fb5", 1.8, 0.4, 1.8, lx, WATER + 10.6, lz);
    b.lit.box("#fff3a0", 1.2, 1.2, 1.2, lx, WATER + 11.4, lz);
    b.plain.box("#ff3b3b", 1.9, 0.8, 1.9, lx, WATER + 12.4, lz);
    b.plain.box("#b8aecb", 5, 1.2, 5, lx, WATER + 0.3, lz);
  }
  tr.onShort(P.u1 + 2, P.half + 1.6, v1);
  b.plain.box("#2b2f4a", 0.2, 2.4, 0.2, v1.x, 1.0, v1.z, yaw);
  b.sign(splash, v1.x, 2.2, v1.z, yaw + Math.PI, 0.6, true);

}
