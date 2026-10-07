import type { Built } from "../buildings";
import { C, E, G, hash, shades, VoxelModel, type Paint } from "../model";
import type { SignSpot } from "../parts";
import type { LandmarkOpts } from "./index";
import { lotSize } from "./lot";
import { bench, lampPost, leafTree, mv, planterBox } from "./needle";

/**
 * ZK TOWER HALO, Wall Street's twisted glass supertall (~140 m), after the Shanghai Tower: a
 * rounded-triangle plan that tapers and turns 110° as it rises, so its corners and the notch cut up
 * one of them spiral round the tower; silver-blue glass between fins that follow the twist, white
 * floor bands, a lit sky-lobby band every fifteen floors, lit offices at night. Near the top a
 * free-standing ring of cyan light (the halo) hangs round the tower on spokes; on the roof the
 * helipad, its rim lit cyan, a helicopter parked on the H. At its foot a glass canopy over the
 * entrance, a plaza with fountains, trees and lamps on the avenue.
 *
 * Scale 2 (a third of a metre). Points: `door`, `keeper`, `helipad`, `camPos`, `camLook`.
 */
export function zkhalo(seed: number, o: LandmarkOpts): Built {
  const k = 2;
  const { W, D } = lotSize(o, k);
  const TOP = 400; // the roof
  const PAD = TOP + 6; // the helipad deck
  const H = PAD + 26;
  const m = new VoxelModel(W, H, D);
  const signs: SignSpot[] = [];
  const lights: Built["lights"] = [];
  const cx = W / 2;
  const cz = Math.min(D - 40, 46);

  const glass = G("#6f9cc0");
  const glassHi = G("#a8c8e0");
  const glassDeep = G("#3e6688");
  const band = C("#eef2f6");
  const fin = C("#c8d2dc");
  const core = C("#1a222c");
  const lit = E("#ffe4b8", 1.15);
  const litCool = E("#cfe8ff", 1.0);
  const cyan = E("#3ef0ff", 2.6);
  const cyanSoft = E("#7ff6ff", 1.6);

  // ---- the plan: a rounded equilateral triangle, flat side to the front at the street ----------
  const SQ3 = Math.sqrt(3);
  const sdTri = (px: number, py: number, r: number) => {
    let x = Math.abs(px) - r,
      y = py + r / SQ3;
    if (x + SQ3 * y > 0) [x, y] = [(x - SQ3 * y) / 2, (-SQ3 * x - y) / 2];
    x -= Math.min(0, Math.max(-2 * r, x));
    return -Math.hypot(x, y) * Math.sign(y);
  };
  const TWIST = (110 * Math.PI) / 180;
  const theta = (y: number) => (Math.min(y, TOP) / TOP) * TWIST;
  const scaleAt = (y: number) => {
    const t = Math.min(1, y / TOP);
    return 1 - 0.3 * t - 0.05 * t * t;
  };
  const RT = 19,
    RR = 7;
  /** Signed distance to the facade at height y (negative inside), and the local frame. */
  const field = (x: number, z: number, y: number) => {
    const th = theta(y),
      s = scaleAt(y);
    const dx = x + 0.5 - cx,
      dz = z + 0.5 - cz;
    const c = Math.cos(th),
      sn = Math.sin(th);
    const lx = dx * c - dz * sn,
      lz = dx * sn + dz * c;
    // the triangle's vertex points to local -z (the back); its flat side faces +z
    const d = (sdTri(lx / s, -lz / s, RT) - RR) * s;
    return { d, lx, lz, s };
  };
  const notch = (lx: number, lz: number, s: number, d: number) => lz < -10 * s && Math.abs(lx) < 3.6 && d > -5.5;
  const VERT = [-Math.PI / 2, -Math.PI / 2 + (Math.PI * 2) / 3, -Math.PI / 2 - (Math.PI * 2) / 3];
  const angDiff = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

  // ---- plaza --------------------------------------------------------------------------------------
  const pave = shades(["#d8d4cc", "#cfcac2", "#dedad2"], 2, seed);
  m.box(0, 0, 0, W, 1, D, pave);
  for (let z = 0; z < D; z++)
    for (let x = 0; x < W; x++) {
      const r = Math.hypot(x + 0.5 - cx, z + 0.5 - cz);
      // concentric rings of darker granite round the tower, a cyan inlay in one
      if (Math.abs(r - 40) < 0.55 || Math.abs(r - 48) < 0.55) m.set(x, 0, z, C("#8e8a84"));
      else if (Math.abs(r - 44) < 0.5) m.set(x, 0, z, E("#3ef0ff", 0.9));
      if (x < 2 || x >= W - 2 || z >= D - 2) m.set(x, 0, z, C("#9a968e"));
    }

  // ---- the tower -----------------------------------------------------------------------------------
  const FH = 12; // a floor: 4 m
  const BASE = 2;
  const R0 = 32;
  for (let y = BASE; y < TOP; y++) {
    const floor = Math.floor((y - BASE) / FH);
    const fy = (y - BASE) % FH;
    const sky = floor % 15 === 14; // the sky lobbies
    const th = theta(y);
    for (let z = Math.max(0, Math.floor(cz - R0)); z < Math.min(D, Math.ceil(cz + R0)); z++)
      for (let x = Math.max(0, Math.floor(cx - R0)); x < Math.min(W, Math.ceil(cx + R0)); x++) {
        const { d, lx, lz, s } = field(x, z, y);
        if (d > 0 || d < -6) continue;
        if (notch(lx, lz, s, d)) {
          // the notch: a slot up the back corner, its walls dark glass with lit lines
          if (Math.abs(lx) > 2.6 || d < -4.6) m.set(x, y, z, fy === 0 ? cyanSoft : glassDeep);
          continue;
        }
        if (d < -1.2) {
          if (d > -3) m.set(x, y, z, core);
          continue;
        }
        // where along the facade: the angle in the turning frame, for fins that follow the twist
        const a = Math.atan2(lz, lx);
        const seg = Math.floor(((a + Math.PI) / (Math.PI * 2)) * 40);
        const onFin = ((a + Math.PI) / (Math.PI * 2)) * 40 - seg < 0.12;
        const spine = VERT.some((v) => angDiff(a, v) < 0.07);
        let c: Paint;
        if (sky && fy < 4) c = fy === 1 || fy === 2 ? cyanSoft : band;
        else if (fy === 0 || spine) c = band;
        else if (onFin) c = fin;
        else if (y < BASE + 24 && lz > 0 && Math.abs(lx) < 16) c = fy % 6 === 0 ? fin : E("#d8ecf8", 0.75); // the lobby, two floors of lit glass
        else {
          const h = hash(seg, floor, 3, seed);
          c = h < 0.1 ? lit : h < 0.15 ? litCool : fy > 9 ? glassDeep : glass;
        }
        m.set(x, y, z, c);
      }
    void th;
  }
  // the roof: a slab over the last floor, a parapet of fins
  for (let z = 0; z < D; z++)
    for (let x = 0; x < W; x++) {
      const { d, lx, lz, s } = field(x, z, TOP);
      if (d > 0 || notch(lx, lz, s, d)) continue;
      m.set(x, TOP, z, d > -1.2 ? band : C("#8a929c"));
      if (d > -1.2) m.box(x, TOP + 1, z, x + 1, TOP + 3, z + 1, glassHi);
    }

  // ---- the halo: a ring of cyan light round the tower near the top, on spokes ---------------------
  const HY = TOP - 42;
  const HR = 31;
  for (let a = 0; a < Math.PI * 2; a += 0.012) {
    const x = cx + Math.cos(a) * HR,
      z = cz + Math.sin(a) * HR;
    const ix = Math.floor(x),
      iz = Math.floor(z);
    if (ix < 0 || ix >= W || iz < 0 || iz >= D) continue;
    m.set(ix, HY, iz, cyan);
    m.set(ix, HY + 1, iz, cyan);
    m.set(ix, HY - 1, iz, C("#d8dee6"));
  }
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    for (let r = 6; r < HR; r += 0.5) {
      const x = Math.floor(cx + Math.cos(a) * r),
        z = Math.floor(cz + Math.sin(a) * r);
      if (field(x, z, HY).d < -0.5) continue;
      m.set(x, HY - 1, z, C("#d8dee6"));
    }
  }
  lights.push([cx, HY, cz + HR, "#3ef0ff"]);

  // ---- the helipad on the roof: a disc on a drum, rim lit cyan, the H ------------------------------
  const PR = 22;
  const pz = cz;
  m.cylinder(cx, TOP + 1, pz, 7, PAD - TOP - 1, C("#8a929c"));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    for (let t = 0; t <= 1; t += 0.05) {
      const r = 6 + t * (PR - 8);
      m.set(Math.floor(cx + Math.cos(a) * r), Math.round(TOP + 1 + t * (PAD - TOP - 2)), Math.floor(pz + Math.sin(a) * r), C("#c8d2dc"));
    }
  }
  for (let z = Math.floor(pz - PR); z <= Math.ceil(pz + PR); z++)
    for (let x = Math.floor(cx - PR); x <= Math.ceil(cx + PR); x++) {
      const r = Math.hypot(x + 0.5 - cx, z + 0.5 - pz);
      if (r > PR || x < 0 || x >= W || z < 0 || z >= D) continue;
      m.set(x, PAD - 1, z, C("#6a7078"));
      const ax = Math.abs(x + 0.5 - cx),
        az = Math.abs(z + 0.5 - pz);
      let c: Paint = C("#3a4048");
      if (r > PR - 1.2) c = (Math.floor(Math.atan2(z - pz, x - cx) * 6) & 1) === 0 ? cyan : C("#e8ecf0");
      else if (r > PR - 4 && r < PR - 2.6) c = C("#f4c428");
      else if ((ax < 5 && az < 1) || (az < 6.5 && ax > 3.5 && ax < 5.2)) c = C("#f4f4ee");
      m.set(x, PAD, z, c);
    }
  // the helicopter on the H (nose to +x), white and cyan
  {
    const hx = Math.round(cx) - 2,
      hz = Math.round(pz),
      hy = PAD + 1;
    const body = C("#f2f4f6"),
      stripe = E("#3ef0ff", 1.4),
      win = G("#1a2a3a"),
      dark = C("#22262c");
    // skids
    for (const s of [-3, 3]) {
      m.box(hx - 7, hy, hz + s, hx + 9, hy + 1, hz + s + 1, dark);
      m.box(hx - 4, hy + 1, hz + s, hx - 3, hy + 3, hz + s + 1, dark);
      m.box(hx + 5, hy + 1, hz + s, hx + 6, hy + 3, hz + s + 1, dark);
    }
    // cabin: a rounded box, the windscreen at the nose
    for (let x = hx - 6; x <= hx + 9; x++)
      for (let y = hy + 3; y <= hy + 9; y++)
        for (let z = hz - 3; z <= hz + 3; z++) {
          const nx = Math.max(0, x - (hx + 5)) / 4;
          const rr = Math.hypot((z - hz) / 3.4, (y - (hy + 6)) / 3.6, nx);
          if (rr > 1) continue;
          const front = x > hx + 4 && y > hy + 5;
          m.set(x, y, z, front ? win : y === hy + 5 ? stripe : Math.abs(z - hz) === 3 && y > hy + 6 && x > hx - 3 && x < hx + 4 ? win : body);
        }
    // tail boom, fin, tail rotor
    for (let x = hx - 22; x < hx - 5; x++) {
      const t = (hx - 5 - x) / 17;
      const y = Math.round(hy + 7 + t * 2);
      m.set(x, y, hz, body);
      if (t < 0.6) m.set(x, y - 1, hz, body);
      if (x % 3 === 0) m.set(x, y, hz, stripe);
    }
    m.box(hx - 23, hy + 8, hz, hx - 20, hy + 14, hz + 1, body);
    m.box(hx - 22, hy + 13, hz - 2, hx - 21, hy + 14, hz + 3, stripe);
    m.box(hx - 22, hy + 9, hz + 1, hx - 21, hy + 13, hz + 2, dark);
    // mast and the main rotor's blades
    m.box(hx + 1, hy + 10, hz, hx + 2, hy + 12, hz + 1, dark);
    for (let i = -18; i <= 18; i++) {
      m.set(hx + 1 + i, hy + 12, hz, dark);
      m.set(hx + 1 + Math.round(i * 0.3), hy + 12, hz + Math.round(i * 0.95), dark);
    }
    m.set(hx + 1, hy + 13, hz, E("#ff4a3a", 2.4));
  }
  // aircraft lights on the roof edge and the parapet
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 - Math.PI / 2 + TWIST;
    m.box(Math.floor(cx + Math.cos(a) * 22), TOP + 3, Math.floor(cz + Math.sin(a) * 22), Math.floor(cx + Math.cos(a) * 22) + 1, TOP + 5, Math.floor(cz + Math.sin(a) * 22) + 1, E("#ff4a3a", 2.4));
  }
  lights.push([cx, PAD + 2, pz, "#3ef0ff"]);

  // ---- the entrance: a glass canopy on slim columns over the doors, the name on its edge ----------
  const front = Math.ceil(cz + (RT / SQ3 + RR) * scaleAt(BASE)); // the flat face at the street
  const c0 = Math.round(cx - 15),
    c1 = Math.round(cx + 15);
  const cz1 = Math.min(D - 8, front + 16);
  m.box(c0, 18, front - 1, c1, 19, cz1, G("#bfe0f0"));
  m.box(c0, 19, front - 1, c1, 20, cz1, C("#e8ecf0"));
  m.box(c0, 17, cz1 - 1, c1, 20, cz1, C("#e8ecf0"));
  m.box(c0 + 1, 17, cz1 - 2, c1 - 1, 18, cz1 - 1, cyanSoft);
  for (const x of [c0 + 1, c1 - 2]) m.box(x, 1, cz1 - 3, x + 1, 18, cz1 - 2, C("#c8d2dc"));
  // revolving doors and the lit lobby behind
  m.box(Math.round(cx - 10), 1, front, Math.round(cx + 10), 14, front + 1, (x, y) => (x % 4 === 0 || y === 13 ? C("#c8d2dc") : E("#e8f4ff", 0.9)));
  for (const dx of [-6, 0, 6]) {
    m.cylinder(cx + dx, 1, front + 2, 2.2, 12, G("#bfe0f0"), true);
    m.box(Math.round(cx + dx - 2), 13, front, Math.round(cx + dx + 2), 14, front + 4, C("#c8d2dc"));
  }
  signs.push({ text: "ZK TOWER HALO", color: "#3ef0ff", x: cx, y: 22.5, z: cz1 + 0.2, w: c1 - c0 - 2, h: 4, vertical: false, facing: "front" });
  lights.push([cx, 12, cz1 + 2, "#bfeeff"]);

  // ---- the plaza: two fountains flanking the walk, trees, benches, lamps --------------------------
  const FZ = Math.min(D - 12, cz1 + 7);
  for (const fx of [Math.round(W * 0.18), Math.round(W * 0.82)]) {
    m.cylinder(fx, 1, FZ, 7, 1, C("#c9c4bc"));
    m.cylinder(fx, 1, FZ, 6, 1, E("#45c8e6", 0.8));
    m.cylinder(fx, 2, FZ, 7, 1, C("#e2ded6"), true);
    for (let a = 0; a < 8; a++) {
      const x = fx + Math.cos((a / 8) * Math.PI * 2) * 3.5,
        z = FZ + Math.sin((a / 8) * Math.PI * 2) * 3.5;
      m.box(Math.floor(x), 2, Math.floor(z), Math.floor(x) + 1, 3 + (a % 3), Math.floor(z) + 1, E("#d8f6ff", 1.3));
    }
    m.box(fx, 2, FZ, fx + 1, 7, FZ + 1, E("#e8fbff", 1.6));
  }
  lights.push([W * 0.18, 4, FZ, "#9fe8ff"], [W * 0.82, 4, FZ, "#9fe8ff"]);
  for (const x of [5, W - 6]) for (let z = 12; z < front - 4; z += 14) leafTree(m, x, 1, z, k, seed + z, 6);
  planterBox(m, 2, 1, D - 10, 14, D - 5, seed + 3, false);
  planterBox(m, W - 14, 1, D - 10, W - 2, D - 5, seed + 4, false);
  bench(m, 16, 1, D - 7, k);
  bench(m, W - 22, 1, D - 7, k);
  for (const x of [3, W - 4]) for (let z = front; z < D - 3; z += 13) lampPost(m, x, 1, z, k, "#bfeeff");
  // bollards along the kerb
  for (let x = 4; x < W - 4; x += 4) if (Math.abs(x - cx) > 8) m.box(x, 1, D - 3, x + 1, 3, D - 2, C("#3a3c44"));
  void mv;

  return {
    model: m,
    signs,
    door: [cx, D],
    body: [0, 0, W, D],
    walls: [[Math.round(cx - 28), Math.round(cz - 30), Math.round(cx + 28), front + 1]],
    lights,
    scale: k,
    points: {
      door: [cx, 1, front + 6],
      keeper: [cx + 4, 1, front + 8],
      helipad: [cx, PAD + 1, pz],
      halo: [cx, HY, cz],
      camPos: [cx + 150, 260, D + 260],
      camLook: [cx, 200, cz],
    },
  };
}
