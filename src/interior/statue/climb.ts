import * as THREE from "three";
import type { Rect } from "../types";
import { glowMat, std } from "../kit";
import { AXIS, BALC, BALCONY_Y, CROWN_Y, type Shell } from "./shell";
import type { StatueKit } from "./kit";

/**
 * Floors 1 and 2, one climb: the balcony round the top of the pedestal (outdoors, the city across
 * the water), the door in the back of the robe, Eiffel's iron pylon inside the copper skin with
 * its secondary frame of flat bars reaching out to the skin, the double helix (two spiral stairs
 * wound together, one up, one down, both walkable) and the crown: a deck in the head with 25
 * windows round it and the two Volt eyes to look out of.
 */

/** The helix: inner and outer radius, steps a turn, a step's rise, steps per stair. */
const RI = 0.3,
  RO = 1.7,
  RING = 1.82,
  PER_TURN = 24;
const DA = (Math.PI * 2) / PER_TURN;
const N = Math.round((CROWN_Y - BALCONY_Y) / 0.2);
const RISE = (CROWN_Y - BALCONY_Y) / N;
/** Where each stair starts: the up stair by the door (−z), the other half a turn round. */
const A0 = [-Math.PI / 2, Math.PI / 2];
const END = A0.map((a) => a + N * DA);
const T = Math.PI * 2;
const norm = (a: number) => ((a % T) + T) % T;
/** The pylon's legs, from the axis. */
const LEG = 1.98;

export const SPAWN1 = { pos: new THREE.Vector3(-4.6, 0, -7.4), yaw: 0.35 };
export const SPAWN2 = { pos: new THREE.Vector3(AXIS.x + 0.4, 0, AXIS.z - 2.6), yaw: Math.PI - 0.3 };

export function climb(k: StatueKit, shell: Shell) {
  const f = 1;
  const ax = AXIS.x,
    az = AXIS.z;
  const Y0 = BALCONY_Y;
  const at = (a: number, r: number, y: number) => new THREE.Vector3(ax + Math.cos(a) * r, y, az + Math.sin(a) * r);
  k.noLights(2);

  // ---- the double helix ------------------------------------------------------------------------
  const treads = [std("#4a4a52", 0.5, 0.6), std("#504852", 0.5, 0.6)];
  const rail = k.brass;
  const steel = std("#2e2e34", 0.5, 0.6);
  const bulb = k.glow("#ffd9a0", 1.6, 2.4);
  for (let h = 0; h < 2; h++) {
    const a0 = A0[h];
    for (let i = 0; i < N; i++) {
      const a = a0 + (i + 0.5) * DA;
      const y = Y0 + (i + 1) * RISE;
      const rm = (RI + RO) / 2;
      const step = new THREE.BoxGeometry(RO - RI, 0.05, rm * DA * 1.5);
      // a fan-shaped tread: wider at the rim
      const pos = step.attributes.position;
      for (let v = 0; v < pos.count; v++) {
        const x = pos.getX(v);
        pos.setZ(v, pos.getZ(v) * (0.45 + ((x + (RO - RI) / 2) / (RO - RI)) * 0.85));
      }
      step.rotateY(-a);
      step.translate(ax + Math.cos(a) * rm, y - 0.025, az + Math.sin(a) * rm);
      k.addGeo(f, step, treads[h]);
      // nosing, stringers (outer and inner), balusters every other step
      const p0 = (r: number, dy: number) => at(a0 + i * DA, r, y + dy),
        p1 = (r: number, dy: number) => at(a0 + (i + 1) * DA, r, y + RISE + dy);
      k.beam(f, p0(RO, -0.16), p1(RO, -0.16), 0.05, steel, 0.24);
      k.beam(f, p0(RI, -0.16), p1(RI, -0.16), 0.05, steel, 0.2);
      k.beam(f, p0(RO - 0.04, 0.95), p1(RO - 0.04, 0.95), 0.05, rail);
      k.beam(f, p0(RO - 0.04, 0.5), p1(RO - 0.04, 0.5), 0.025, steel);
      if (i % 2 === 0) k.beam(f, p0(RO - 0.04, 0), p0(RO - 0.04, 0.95), 0.025, steel);
      if (i % 12 === 6) k.slab(f, 0.12, 0.16, 0.12, ax + Math.cos(a) * 0.24, y + 1.9, az + Math.sin(a) * 0.24, bulb);
    }
  }
  // the mast both stairs wind round
  k.addGeo(f, new THREE.CylinderGeometry(0.18, 0.2, CROWN_Y - Y0 + 1.1, 12).translate(ax, (Y0 + CROWN_Y + 1.1) / 2, az), steel);
  k.slab(f, 0.3, 0.3, 0.3, ax, CROWN_Y + 1.1, az, bulb);
  // UP / DOWN at the foot of each stair, on the floor
  k.label(f, "UP ▲ CROWN", ...at(A0[0] + 0.3, 1.1, Y0 + 0.02).toArray(), { h: 0.3, color: "#3ee08f", rot: 0 }).rotation.set(-Math.PI / 2, 0, Math.PI);
  k.label(f, "DOWN ▼", ...at(A0[1] + 0.3, 1.1, Y0 + 0.02).toArray(), { h: 0.3, color: "#ff9f2e" }).rotation.set(-Math.PI / 2, 0, 0);

  // ---- Eiffel's pylon: four legs, girts, cross braces; flat bars out to the skin -------------------
  const iron = k.iron;
  const top = CROWN_Y - 0.45;
  const corners = [
    [1, 1],
    [-1, 1],
    [-1, -1],
    [1, -1],
  ];
  for (const [sx, sz] of corners) {
    const x = ax + sx * LEG,
      z = az + sz * LEG;
    k.slab(f, 0.26, top - Y0, 0.26, x, Y0, z, iron);
    // lattice on the leg's two outer faces
    for (let y = Y0 + 0.4; y < top - 0.6; y += 0.6) {
      k.beam(f, new THREE.Vector3(x + sx * 0.14, y, z - 0.12), new THREE.Vector3(x + sx * 0.14, y + 0.6, z + 0.12), 0.03, iron);
      k.beam(f, new THREE.Vector3(x - 0.12, y, z + sz * 0.14), new THREE.Vector3(x + 0.12, y + 0.6, z + sz * 0.14), 0.03, iron);
    }
    k.slab(f, 0.5, 0.12, 0.5, x, Y0, z, k.graniteDark);
  }
  const BAY = 2.4;
  for (let y = Y0 + BAY; y < top; y += BAY) {
    for (let c = 0; c < 4; c++) {
      const [ax0, az0] = corners[c],
        [ax1, az1] = corners[(c + 1) % 4];
      const A = new THREE.Vector3(ax + ax0 * LEG, y, az + az0 * LEG),
        B = new THREE.Vector3(ax + ax1 * LEG, y, az + az1 * LEG);
      k.beam(f, A, B, 0.14, iron, 0.2);
      // X braces in every bay but the first (the way in)
      if (y + BAY <= top + 0.01) {
        k.beam(f, A, B.clone().setY(y + BAY), 0.06, iron, 0.1);
        k.beam(f, B, A.clone().setY(y + BAY), 0.06, iron, 0.1);
      }
    }
    // the secondary frame: flat bars from each leg and each face out to the copper
    for (let j = 0; j < 8; j++) {
      const a = (j / 8) * T + Math.PI / 4;
      const dx = Math.cos(a),
        dz = Math.sin(a);
      const yy = y + (j % 2) * 1.2 - 0.6;
      const r = shell.skinAt(yy, dx, dz);
      if (r < LEG + 0.6) continue;
      const from = at(a, j % 2 ? LEG : LEG * Math.SQRT2, yy);
      const to = at(a, r - 0.12, yy + 0.5);
      k.beam(f, from, to, 0.05, k.ironRust, 0.16);
      // a saddle where the bar meets the skin
      k.beam(f, to.clone().setY(to.y - 0.6), to.clone().setY(to.y + 0.6), 0.08, k.ironRust, 0.08);
    }
  }
  k.slab(f, LEG * 2 + 0.4, 0.2, LEG * 2 + 0.4, ax, top, az, iron);

  // ---- lights: the stair's lamps, the crown -------------------------------------------------------
  k.light(f, ax + 0.6, Y0 + 3.2, az - 1.1, "#ffcf98", 7, 9);
  k.light(f, ax, Y0 + 11, az, "#ffcf98", 9, 12);
  k.light(f, ax, Y0 + 20, az, "#ffcf98", 9, 12);
  k.light(f, -6, Y0 + 3.4, -9.5, "#ffd8a8", 5, 10);
  k.light(f, ax + 1.6, CROWN_Y + 2.6, az + 0.8, "#ffe0b0", 8, 9);
  k.light(f, ax - 1.6, CROWN_Y + 2.6, az - 0.6, "#ffe0b0", 6, 9);

  // ---- the balcony -------------------------------------------------------------------------------
  balcony(k, f);

  // ---- the crown ---------------------------------------------------------------------------------
  crown(k, shell);

  // ---- walking it -----------------------------------------------------------------------------------
  const post = (a: number, r = RING, s = 0.1): Rect => [ax + Math.cos(a) * r - s, az + Math.sin(a) * r - s, ax + Math.cos(a) * r + s, az + Math.sin(a) * r + s];
  const inArc = (a: number, from: number, to: number) => norm(a - from) <= norm(to - from);
  const ring = (gaps: [number, number][]) => {
    const out: Rect[] = [];
    for (let i = 0; i < 52; i++) {
      const a = (i / 52) * T;
      if (!gaps.some(([g0, g1]) => inArc(a, g0, g1))) out.push(post(a));
    }
    return out;
  };
  const radial = (a: number) => [0.55, 0.85, 1.15, 1.45, 1.75].map((r) => post(a, r, 0.12));
  const mast: Rect = [ax - 0.24, az - 0.24, ax + 0.24, az + 0.24];
  const legs: Rect[] = corners.map(([sx, sz]) => [ax + sx * LEG - 0.15, az + sz * LEG - 0.15, ax + sx * LEG + 0.15, az + sz * LEG + 0.15]);
  const MODES = {
    base: [...shell.balconyRects, ...k.rects[1], mast, ...legs, ...ring(A0.map((a) => [a, a + 0.62] as [number, number])), ...A0.flatMap((a) => radial(a - 0.07))],
    helix: [mast, ...ring([])],
    crown: [...shell.crownRects, ...k.rects[2], mast, ...ring(END.map((a) => [a - 0.62, a] as [number, number])), ...END.flatMap((a) => radial(a + 0.07))],
  };
  type Mode = keyof typeof MODES;
  let mode: Mode | null = null;
  const apply = (m: Mode) => {
    if (m === mode) return;
    mode = m;
    for (const arr of [k.rects[1], k.rects[2]]) {
      arr.length = 0;
      arr.push(...MODES[m]);
    }
  };
  let last = Y0;
  const modeFor = (y: number): Mode => (y < Y0 + 1.0 ? "base" : y > CROWN_Y - 1.0 ? "crown" : "helix");
  const reset = (y: number) => {
    last = y;
    apply(modeFor(y));
  };
  reset(Y0);
  const ground = (x: number, z: number) => {
    const dx = x - ax,
      dz = z - az;
    const r = Math.hypot(dx, dz);
    let h: number | null = null;
    if (r > 0.2 && r < RING + 0.05) {
      const th = Math.atan2(dz, dx);
      let best: number | null = null;
      for (let s = 0; s < 2; s++) {
        const t = norm(th - A0[s]);
        for (let turn = 0; turn < 8; turn++) {
          const i = Math.floor((t + turn * T) / DA);
          if (i >= N) break;
          const y = Y0 + (i + 1) * RISE;
          if (best === null || Math.abs(y - last) < Math.abs(best - last)) best = y;
        }
      }
      if (best !== null && Math.abs(best - last) < 0.8) h = best;
    }
    if (h === null) h = mode === "crown" ? CROWN_Y : mode === "base" ? Y0 : last;
    last = h;
    apply(modeFor(h));
    return h;
  };
  return { ground, reset, get height() {
    return last;
  } };
}

/** The balcony: coin binoculars at the rail, lanterns, the door's plaque, people. */
function balcony(k: StatueKit, f: number) {
  const y = BALCONY_Y;
  const B = BALC - 0.35;
  // lanterns on the rail's corners and middles
  const lamp = k.glow("#ffc070", 0.4, 2.6);
  for (const sx of [-1, 0, 1])
    for (const sz of [-1, 1]) {
      const x = sx * B,
        z = sz * B;
      k.slab(f, 0.08, 1.6, 0.08, x, y + 1.2, z, k.iron);
      k.slab(f, 0.26, 0.36, 0.26, x, y + 2.8, z, lamp);
      k.slab(f, 0.34, 0.06, 0.34, x, y + 3.16, z, k.iron);
      if (sx !== 0) {
        k.slab(f, 0.08, 1.6, 0.08, z, y + 1.2, x, k.iron);
        k.slab(f, 0.26, 0.36, 0.26, z, y + 2.8, x, lamp);
        k.slab(f, 0.34, 0.06, 0.34, z, y + 3.16, x, k.iron);
      }
    }
  // coin binoculars looking at the city (−z) and down the bay (+z)
  const yellow = std("#2f6a5a", 0.45, 0.5);
  const binos = [
    [-6.5, -B + 0.5, 0],
    [0.5, -B + 0.5, 0],
    [6.5, -B + 0.5, 0],
    [-5, B - 0.5, Math.PI],
    [5, B - 0.5, Math.PI],
    [-B + 0.5, 0, Math.PI / 2],
  ];
  binos.forEach(([x, z, rot], n) => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.y = rot;
    const postM = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, 1.1, 10), k.iron);
    postM.position.y = 0.55;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.28, 0.5), yellow);
    head.position.y = 1.25;
    head.rotation.x = 0.12;
    g.add(postM, head);
    for (const sx of [-0.1, 0.1]) {
      const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.2, 12), yellow);
      lens.rotation.x = Math.PI / 2;
      lens.position.set(sx, 1.27, -0.33);
      g.add(lens);
    }
    k.groups[f].add(g);
    k.rects[f].push([x - 0.25, z - 0.25, x + 0.25, z + 0.25]);
    k.pick(f, head, `<b>Binoculars ${n + 1}</b><span>live chain</span>`, () => {
      const d = k.ctx.director;
      const last = d.lastBlockTime;
      const s = last ? Math.round((Date.now() - last) / 1000) : null;
      const pool = d.mempoolList();
      return {
        eyebrow: `Binoculars ${n + 1} · pedestal balcony`,
        title: k.height ? `Block ${k.height.toLocaleString("en-US")}` : "Block …",
        mono: true,
        tag: s != null ? (s < 90 ? ["live", "ok"] : ["waiting", "warn"]) : ["…", "muted"],
        stats: [
          ["Mempool", String(pool.length)],
          ["Shielded", String(pool.filter((t) => t.kind === "shielded").length)],
          ["Last block", s != null ? `${s} s` : "—"],
          ["Height", "19 m"],
        ],
        link: k.height ? { href: `https://zscan.cash/block/${k.height}`, label: "Open in ZScan" } : undefined,
      };
    });
  });
  // the door's sign and plaque, on the back of the robe
  const dz = -5.1;
  k.label(f, "TO THE CROWN ▲", AXIS.x, y + 3.6, dz - 0.9, { h: 0.34, color: "#f4b728", rot: Math.PI });
  k.plaque(f, 1.3, 1.0, AXIS.x - 2.6, y + 1.5, dz - 0.6, Math.PI, "The Double Helix", `${2 * N} steps · ${Math.round(CROWN_Y - BALCONY_Y)} m`, "Two spiral stairs wound round one mast: one goes up, one comes down, and they never meet. Like the inputs and outputs of a shielded transaction: everyone knows the stairs are there, nobody can tell who took which.", { style: "bronze" });
  k.plaque(f, 1.3, 1.0, AXIS.x + 3.2, y + 1.5, dz - 0.6, Math.PI, "Eiffel's Pylon", "Gustave Eiffel · 1881", "Four iron legs, flat bars reaching out, and a copper skin that just floats on them. The iron carries the load, the skin only has to look good. Mind your head: the bars are older than the internet.", { style: "bronze" });

  // ---- people on the balcony, talking ----------------------------------------------------------
  const Y = y;
  const p = (n: number, at: [number, number], role: string, face: [number, number], o: { cap?: boolean; wander?: [number, number][] } = {}) => k.person(f, k.visitor(n), at, role, { y: Y, face, ...o });
  const ranger = p(101, [-1.2, -8.6], "Ranger", [-3.5, -8.8], { cap: true });
  const tourA = p(102, [-3.0, -9.2], "Visitor", [-3, -12]);
  const tourB = p(103, [-2.2, -9.4], "Photographer", [-2, -12]);
  k.chat(f, [ranger, tourA, tourB], [
    [[1, "Is that the whole of ZStreet over there?"], [0, "Every block of it. The tall gold one is the ZK TOWER."], [2, "Hold still, I want the skyline behind you."], [1, "Make it shielded. No location tag."]],
    [[2, "Why does she have no face?"], [0, "She has a face. You just can't see who it is."], [1, "Zero knowledge, right?"], [0, "Now you get it."]],
    [[1, "How many steps to the crown?"], [0, `${N} up, ${N} down. Different stairs.`], [2, "Is there a lift?"], [0, "There's a floor button. Don't tell anyone."]],
  ]);
  const kid = p(104, [6.2, -8.7], "Kid", [6.2, -12]);
  const mum = p(105, [7.3, -8.9], "Visitor", [6.2, -8.7]);
  k.chat(f, [kid, mum], [
    [[0, "Mum, the water is so far down!"], [1, "Nineteen metres. Hold the rail."], [0, "Can I throw a coin?"], [1, "Coins go in the binoculars."]],
    [[0, "Why is she green?"], [1, "Copper. It turns green outside."], [0, "Will I turn green?"], [1, "Only if you stay up here thirty years."]],
  ]);
  const couple1 = p(106, [-8.6, 2.5], "Couple", [-12, 2.5]);
  const couple2 = p(107, [-8.6, 3.5], "Couple", [-12, 3.5]);
  k.chat(f, [couple1, couple2], [
    [[0, "You can see the Redeemer from here."], [1, "And the bridge. Look, the lights just came on."], [0, "Best view in the bay."]],
    [[1, "Remember our first transaction?"], [0, "I don't. That was the point."], [1, "Romantic."]],
  ]);
  void p(108, [3.5, 8.6], "Guide", [3.5, 12], { wander: [[3.5, 8.6], [-3, 8.8], [8.4, 4]] });
}

/** The crown: brass rail under the windows, Volt glass in the eyes, plaques, a ranger. */
function crown(k: StatueKit, shell: Shell) {
  const f = 2;
  const y = CROWN_Y;
  const ax = AXIS.x,
    az = AXIS.z;
  // brass rail along the windows, set back from the skin
  const w = shell.windows;
  const inward = (p: THREE.Vector3, d: number) => {
    const dx = p.x - ax,
      dz = p.z - az;
    const l = Math.hypot(dx, dz) || 1;
    return new THREE.Vector3(p.x - (dx / l) * d, y + 1.0, p.z - (dz / l) * d);
  };
  for (let i = 0; i < w.length; i++) {
    const a = inward(w[i], 0.4),
      b = inward(w[(i + 1) % w.length], 0.4);
    if (a.distanceTo(b) < 2.5) k.beam(f, a, b, 0.05, k.brass);
    k.beam(f, a.clone().setY(y), a, 0.04, k.brass);
  }
  // the well's rail is the cage ring: brass posts
  for (let i = 0; i < 52; i++) {
    const a = (i / 52) * Math.PI * 2;
    if (END.some((e) => norm(a - (e - 0.62)) <= 0.62)) continue;
    const p = new THREE.Vector3(ax + Math.cos(a) * RING, y, az + Math.sin(a) * RING);
    k.beam(f, p, p.clone().setY(y + 1.0), 0.04, k.brass);
    const q = new THREE.Vector3(ax + Math.cos(a + T / 52) * RING, y + 1.0, az + Math.sin(a + T / 52) * RING);
    if (!END.some((e) => norm(a + T / 52 - (e - 0.62)) <= 0.62)) k.beam(f, p.clone().setY(y + 1.0), q, 0.05, k.brass);
  }
  // Volt glass in the eyes, lit frames
  const volt = new THREE.MeshBasicMaterial({ color: new THREE.Color("#d3fc7e"), transparent: true, opacity: 0.1, depthWrite: false, toneMapped: false });
  const frame = glowMat("#b8e870", 0.9);
  const front = shell.skinAt(shell.eyes[0].y, 0, 1);
  for (const e of shell.eyes) {
    const z = az + front - 0.05;
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(1.75, 1.75), volt);
    pane.position.set(e.x, e.y, z);
    pane.rotation.y = Math.PI;
    k.groups[f].add(pane);
    for (const [w2, h2, dx, dy] of [
      [1.85, 0.04, 0, 0.9],
      [1.85, 0.04, 0, -0.9],
      [0.04, 1.8, 0.9, 0],
      [0.04, 1.8, -0.9, 0],
    ])
      k.slab(f, w2, h2, 0.05, e.x + dx, e.y + dy - h2 / 2, z - 0.02, frame);
    k.pick(f, pane, "<b>The eyes</b><span>Volt glass</span>", () => ({ eyebrow: "Crown · the eyes", title: "Looking out through a zkSNARK's eyes", body: "<p>Two square windows of Volt-green glass, a metre and a half each. From the city they glow at night; from in here they tint everything a little greener.</p>" }));
  }
  k.plaque(f, 1.0, 0.75, ax - 2.2, y + 1.55, az - 1.9, Math.PI / 4, "The Crown", "25 windows · 7 rays", "Twenty-five windows for twenty-five gemstones; seven rays for the seven seas and the seven continents. The view is free. What you do with it stays between you and the bay.", { style: "bronze" });

  const ranger = k.person(f, k.visitor(201), [ax + 1.9, az - 1.6], "Ranger", { face: [ax + 3, az + 0.5], cap: true });
  const climber = k.person(f, k.visitor(202), [ax + 2.3, az + 1.1], "Climber", { face: [ax + 2.6, az + 3] });
  const v = k.person(f, k.visitor(203), [ax - 2.4, az + 0.9], "Visitor", { face: [ax - 2.8, az + 3] });
  k.chat(f, [ranger, climber, v], [
    [[1, "Made it. My legs did not consent."], [0, `${N} steps. Most people stop counting at forty.`], [1, "I stopped at nine."]],
    [[2, "Wait, these are her eyes?"], [0, "Volt glass. The city sees them glowing at night."], [2, "So right now, somebody down there is looking at me."], [0, "They can't tell it's you. That's the whole idea."]],
    [[1, "Can we go up the arm to the torch?"], [0, "Closed since 1916."], [1, "Even with a viewing key?"], [0, "...Fine. Floor T. Don't tell my supervisor."]],
  ]);
}
