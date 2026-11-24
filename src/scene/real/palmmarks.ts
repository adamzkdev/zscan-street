import * as THREE from "three";
import type { BuildingJob } from "../city/plan";
import type { Built } from "../voxel/buildings";
import { hex, Kit, rng, type V3 } from "./markkit";
import { Frame, type MarkOut, type MarkProp, type MarkTree } from "./marks";

/**
 * THE PALM and BURJ AL ZEC, realistic (branch gta-real, wave 2): no voxels. Built on the voxel
 * builders' own plans (src/scene/voxel/landmarks/palm.ts, burjalarab.ts: the same fronds, crescent,
 * trunk, island, sail profile — their constants copied here, the layout's door, signs, lights and
 * points kept by the city from the voxel run) as real geometry: a smooth sand island lofted from the
 * plan's land (beaches sloping into the water, lawns, roads, paving, rock armour), white villas with
 * their pools and palms, the trunk's apartment blocks in photographed facades, the monorail, Atlantis'
 * coral towers and arch; the sail hotel as a lofted tower — glass wings, the white fabric sail
 * bellying at its foot, the legs and the X-braced exoskeleton, the helipad, Al Muntaha, the podium,
 * the fountain court and the curved bridge. Pure: runs in the city's workers.
 *
 * The frame (marks.ts Frame): metres, the lot centred, y = 0 at the bay's water.
 */

export const PALM_MARKS = new Set(["palm", "burjalarab"]);

interface Ctx {
  K: Kit;
  F: Frame;
  trees: MarkTree[];
  props: MarkProp[];
  lod: number;
  seed: number;
}

export function realPalmMark(kind: string, b: Built, j: BuildingJob, lod: number): MarkOut {
  const c: Ctx = { K: new Kit(lod), F: new Frame(b), trees: [], props: [], lod, seed: j.seed };
  if (kind === "palm") palm(c);
  else burj(c);
  return { geos: c.K.out(), trees: c.trees, props: c.props };
}

const SAND = hex("#efe2bc"),
  WET = hex("#cdb784"),
  LAWN = hex("#9cc47a"),
  PAVE = hex("#f2ece0"),
  WHITE: V3 = hex("#f6f4ee"),
  GOLD = hex("#e0b85a"),
  POOL = hex("#45c8e0");

// ---- THE PALM ------------------------------------------------------------------------------------------

function palm(c: Ctx) {
  const { K, F, lod } = c;
  const W = F.W,
    D = F.D;
  const DL = D - 10;
  const CX = W / 2;
  const r = rng(c.seed * 31 + 7);
  /** Model voxels → frame metres. */
  const P = (x: number, y: number, z: number): V3 => F.p([x, y, z]);
  const M = (v: number) => F.m(v);
  // ---- the plan (as voxel/landmarks/palm.ts) ----
  const TH = 15,
    TZ0 = 40;
  const CC = { x: CX, z: 92 };
  const RO = 82;
  const angOf = (x: number, z: number) => Math.atan2(x - CC.x, CC.z - z);
  const RI = (a: number) => 74 - 17 * Math.exp(-((a / 0.6) ** 2));
  const CRES_END = 2.1;
  const zOut = (x: number) => CC.z - Math.sqrt(Math.max(0, RO * RO - (x - CC.x) ** 2));
  interface Frond {
    bx: number;
    bz: number;
    dx: number;
    dz: number;
    L: number;
    hw: number;
    s: number;
    i: number;
  }
  const fronds: Frond[] = [];
  for (let i = 0; i < 8; i++)
    for (const s of [-1, 1]) {
      const bz = 228 - i * 26;
      const th = 0.16 + i * 0.06;
      const dx = s * Math.cos(th),
        dz = -Math.sin(th);
      const bx = CX + s * 9;
      const hw = i < 6 ? 7 : 6.5;
      let L = 16;
      for (; L < 100; L++) {
        const tx = bx + dx * (L + 1),
          tz = bz + dz * (L + 1);
        if (tx < 6 + hw || tx > W - 6 - hw) break;
        const rr = Math.hypot(tx - CC.x, tz - CC.z);
        const a = angOf(tx, tz);
        if (Math.abs(a) < CRES_END + 0.25 && rr > RI(a) - 7 - hw) break;
      }
      fronds.push({ bx, bz, dx, dz, L, hw, s, i });
    }
  const frondAt = (px: number, pz: number) => {
    let best = -1,
      bu = 0,
      bv = 0,
      be = -1;
    for (let n = 0; n < fronds.length; n++) {
      const f = fronds[n];
      const rx = px - f.bx,
        rz = pz - f.bz;
      const u = rx * f.dx + rz * f.dz;
      const v = -rx * f.dz + rz * f.dx;
      if (u < -2 || u > f.L) continue;
      let e = f.hw - Math.abs(v);
      if (u > f.L - f.hw) e = f.hw - Math.hypot(u - (f.L - f.hw), v);
      if (e > be) ((be = e), (best = n), (bu = u), (bv = v));
    }
    return { n: best, u: bu, v: bv, e: be };
  };
  const ramp = (z: number) => (z > DL - 12 ? 3 + Math.min(2, Math.floor((z - (DL - 12)) / 6)) : 3);
  // per cell: its land, its height (voxels), what covers it
  const at = (x: number, z: number) => x + z * W;
  const kind = new Int8Array(W * D);
  const top = new Float32Array(W * D);
  const cover = new Int8Array(W * D); // 0 sand, 1 wet sand, 2 lawn, 3 asphalt, 4 paving, 5 rock
  for (let z = 0; z < D; z++)
    for (let x = 0; x < W; x++) {
      const px = x + 0.5,
        pz = z + 0.5;
      const i = at(x, z);
      const ta = Math.abs(px - CX);
      let te = -1;
      if (pz >= TZ0 + TH) te = TH - ta;
      else if (pz >= TZ0 - 4) te = TH - Math.hypot(ta, (TZ0 + TH - pz) * (TH / (TH + 4)));
      const f = frondAt(px, pz);
      const rr = Math.hypot(px - CC.x, pz - CC.z);
      const a = angOf(px, pz);
      let ce = -1;
      if (Math.abs(a) < CRES_END) {
        ce = Math.min(rr - RI(a), RO - rr);
        const endE = (CRES_END - Math.abs(a)) * RO;
        if (endE < 4) ce = Math.min(ce, endE);
      }
      if (te >= 0) {
        kind[i] = 1;
        top[i] = te < 1 ? 1 : te < 2.5 ? 2 : ramp(z);
        const road = f.n >= 0 && Math.abs(f.v) <= 1.6 && ta > 5 && te >= 2.5 && Math.sign(px - CX) === fronds[f.n].s;
        cover[i] = top[i] < 2.5 ? 0 : road ? 3 : ta < 1.5 ? 2 : ta < 5.5 ? 3 : ta < 12.5 ? 4 : 0;
      } else if (f.e >= 0) {
        kind[i] = 2;
        top[i] = f.e < 1 ? 1 : f.e < 2.4 ? 2 : 3;
        const fr = fronds[f.n];
        const v = Math.abs(f.v);
        cover[i] = top[i] < 2.5 ? 0 : v < 1.3 && f.u < fr.L - fr.hw * 0.7 ? 3 : v < 1.8 && f.u < fr.L - fr.hw * 0.7 ? 4 : fr.hw - v < 2.4 ? 0 : 2;
      } else if (ce >= 0) {
        kind[i] = 3;
        const ri = RI(a);
        top[i] = rr - ri < 1 ? 1 : rr - ri < 3 ? 2 : RO - rr < 2.5 ? 2 : 3;
        cover[i] = RO - rr < 3.5 ? 5 : rr - ri < 3.5 ? 0 : Math.abs(rr - (RO - 5.5)) < 1.2 ? 3 : 2;
      }
      if (kind[i] && top[i] <= 1) cover[i] = 1;
    }
  // ---- the land: one smooth surface over the plan, sloping into the water at its edges ----
  {
    const step = lod ? 2 : 1;
    const hAt = (x: number, z: number) => {
      // a corner's height: the mean of the cells round it (water pulls it under)
      let s = 0;
      for (const [dx, dz] of [
        [-1, -1],
        [0, -1],
        [-1, 0],
        [0, 0],
      ]) {
        const X = Math.min(W - 1, Math.max(0, x + dx * step)),
          Z = Math.min(D - 1, Math.max(0, z + dz * step));
        s += kind[at(X, Z)] ? top[at(X, Z)] : -1.5;
      }
      return s / 4;
    };
    const SLOT = ["lm.Ground054", "lm.Ground054", "lm.Grass004", "lm.Asphalt031", "lm.PavingStones128", "lm.Rock030"];
    const COL: V3[] = [SAND, WET, LAWN, hex("#8a8a90"), PAVE, hex("#b8b0a4")];
    const quads: number[][] = SLOT.map(() => []);
    for (let z = 0; z < D; z += step)
      for (let x = 0; x < W; x += step) {
        const i = at(x, z);
        if (!kind[i]) continue;
        const k = cover[i];
        const h00 = hAt(x, z),
          h10 = hAt(x + step, z),
          h01 = hAt(x, z + step),
          h11 = hAt(x + step, z + step);
        const a = P(x, h00, z),
          b = P(x + step, h10, z),
          cc = P(x + step, h11, z + step),
          d = P(x, h01, z + step);
        quads[k].push(...a, ...d, ...cc, ...a, ...cc, ...b);
      }
    quads.forEach((q, k) => {
      if (!q.length) return;
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(q, 3));
      g.computeVertexNormals();
      K.add(SLOT[k], g, COL[k]);
    });
    // the lanes' dashes down the boulevard
    if (!lod) for (let z = TZ0 + TH + 2; z < DL - 4; z += 6) for (const s of [-1, 1]) K.span("lm.paint", ...P(CX + s * 3.5 - 0.15, 3.02, z), ...P(CX + s * 3.5 + 0.15, 3.06, z + 3), WHITE);
  }
  // rock armour on the crescent's sea side
  for (let a = -CRES_END + 0.04; a < CRES_END - 0.04; a += lod ? 0.09 : 0.045) {
    const rr = RO - 0.6 + r() * 1.2;
    const [x, , z] = P(CC.x + Math.sin(a) * rr, 0, CC.z - Math.cos(a) * rr);
    K.blob("lm.Rock030", x, 0.2, z, 0.5 + r() * 0.3, 0.32 + r() * 0.15, 0.45 + r() * 0.3, hex("#c8c0b4"), 8, r() * 6);
  }
  const palmAt = (x: number, y: number, z: number, s: number) => miniPalm(K, P(x, y, z), 1.6 + (s % 3) * 0.3, s, lod);
  // ---- the fronds: villas with their pools and palms, a jetty now and then, lamps ----
  let vn = 0;
  for (const f of fronds) {
    const nx = -f.dz,
      nz = f.dx;
    const u0 = (TH + 2 - 9) / Math.abs(f.dx) + 3;
    const uEnd = f.L - f.hw - 1;
    const ang = Math.atan2(-f.dz, f.dx);
    for (let u = u0, jj = 0; u < uEnd; u += 8, jj++) {
      for (const t of [-1, 1]) {
        const cx = f.bx + f.dx * u + nx * t * 3.7,
          cz = f.bz + f.dz * u + nz * t * 3.7;
        villa(K, P(cx, 3, cz), ang, vn, lod);
        // the pool toward the beach, a palm by it
        const px = f.bx + f.dx * (u + 4.3) + nx * t * 4.3,
          pz = f.bz + f.dz * (u + 4.3) + nz * t * 4.3;
        if (u + 4.3 < uEnd) {
          const [qx, qy, qz] = P(px, 3, pz);
          K.box("lm.Concrete012", qx, qy - 0.02, qz, M(4), 0.06, M(3.2), PAVE, ang);
          K.box("lm.plastic", qx, qy + 0.01, qz, M(3), 0.04, M(2.2), POOL, ang);
          if ((jj + (t > 0 ? 1 : 0)) % 2 === 0) palmAt(f.bx + f.dx * (u + 4.3) + nx * t * 6.4, 3, f.bz + f.dz * (u + 4.3) + nz * t * 6.4, vn);
        }
        // a jetty from the beach, every other villa
        if (!lod && (vn + jj) % 3 === 0) {
          const jx = f.bx + f.dx * (u + 1) + nx * t * (f.hw - 1),
            jz = f.bz + f.dz * (u + 1) + nz * t * (f.hw - 1);
          const a0 = P(jx, 1.3, jz),
            a1 = P(jx + nx * t * 4.2, 1.3, jz + nz * t * 4.2);
          K.beam("lm.Wood049", a0, a1, 0.38, hex("#a87a52"), 0.06);
        }
        vn++;
      }
    }
    // palms at the frond's tip
    const tx = f.bx + f.dx * (f.L - f.hw - 1),
      tz = f.bz + f.dz * (f.L - f.hw - 1);
    palmAt(tx + nx * 2, 3, tz + nz * 2, f.i);
    palmAt(tx - nx * 2, 3, tz - nz * 2, f.i + 3);
    if (!lod) for (let u = u0; u < uEnd; u += 16) c.props.push(["lamp", ...P(f.bx + f.dx * u + nx * 1.6, 3, f.bz + f.dz * u + nz * 1.6), -ang, "#ffe6b8"]);
  }
  // ---- the trunk: apartment blocks both sides (photographed facades), palms, the median ----
  const roadAt = (x: number, z: number) => {
    const f = frondAt(x + 0.5, z + 0.5);
    return f.n >= 0 && Math.abs(f.v) <= 1.6 && Math.abs(x + 0.5 - CX) > 5;
  };
  const FAC = ["f018", "f019", "f020", "f017"] as const;
  for (const s of [-1, 1]) {
    const xa = s < 0 ? Math.round(CX - 12.5) : Math.round(CX + 7),
      xb = xa + 6;
    let z = TZ0 + TH + 2;
    let n = 0;
    while (z < DL - 16) {
      const len = 10 + (n % 3) * 2;
      let clear = true;
      for (let zz = z - 2; zz < z + len + 2; zz++) if (roadAt(Math.round(CX + s * 10), zz)) clear = false;
      if (!clear) {
        z += 3;
        continue;
      }
      const h = 3 + 9 + ((n * 5 + (s > 0 ? 3 : 0)) % 4) * 3;
      const b0 = ramp(z);
      const [x0, y0, z0] = P(xa, b0, z),
        [x1, y1, z1] = P(xb, h, z + len);
      K.tower(FAC[(n + (s > 0 ? 1 : 0)) % FAC.length], (x0 + x1) / 2, (z0 + z1) / 2, x1 - x0, z1 - z0, y0, y1, 1.0, "lm.Concrete012", n);
      // the roof: a pool or a garden, the plant room
      K.box(n % 2 ? "lm.Grass004" : "lm.plastic", (x0 + x1) / 2, y1 + 0.28, (z0 + z1) / 2 + (n % 2 ? 0 : -0.15), x1 - x0 - 0.6, 0.06, z1 - z0 - 1.2, n % 2 ? LAWN : POOL);
      K.box("lm.Concrete012", (x0 + x1) / 2, y1 + 0.28, z1 - 0.7, x1 - x0 - 1.2, 0.6, 0.6, hex("#c8beac"));
      z += len + 3;
      n++;
    }
    for (let zz = TZ0 + TH + 4; zz < DL - 8; zz += 9) if (!roadAt(Math.round(CX + s * 14), zz)) palmAt(CX + s * 13.5, 2.4, zz, zz);
    if (!lod) for (let zz = TZ0 + TH + 2; zz < D - 2; zz += 10) c.props.push(["lamp", ...P(CX + s * 6.2, ramp(zz), zz), s > 0 ? Math.PI / 2 : -Math.PI / 2, "#ffe6b8"]);
  }
  for (let z = TZ0 + TH + 6; z < DL - 4; z += 14) palmAt(CX, 3, z, z);
  // ---- the monorail: its beam on piers down the median and over the water to Atlantis ----
  const atlFront = zOut(CX) + 3 + 12;
  const MZ0 = Math.round(atlFront + 8),
    MZ1 = D - 6,
    BEAM = 15;
  {
    const [, by] = P(0, BEAM, 0);
    const a = P(CX, BEAM, MZ0),
      b = P(CX, BEAM, MZ1);
    K.box("lm.Concrete012", a[0], by, (a[2] + b[2]) / 2, M(3), M(2), b[2] - a[2], hex("#dcd8d0"));
    for (let z = MZ1 - 2; z > MZ0; z -= 14) {
      const base = kind[at(Math.round(CX), z)] ? ramp(z) : 0;
      const p = P(CX, base, z);
      K.cyl("lm.Concrete012", p[0], p[1] - 0.3, p[2], M(1.1), M(0.9), by - p[1] + 0.3, 12, hex("#dcd8d0"));
      K.frustum("lm.Concrete012", p[0], by - M(1.2), p[2], M(1.6), M(1.6), M(3.4), M(2.4), M(1.2), hex("#dcd8d0"));
    }
    // the last station at Atlantis
    const st = P(CX, BEAM + 2, MZ0 + 6);
    K.box("lm.paint", st[0], st[1], st[2], M(9), M(0.3), M(12), hex("#f2ead8"));
    K.box("lm.paint", st[0], st[1] + M(5), st[2], M(9.4), M(0.3), M(12.4), hex("#f6f2ea"));
    K.box("lm.chrome", st[0], st[1] + M(4.7), st[2] - M(6), M(9.4), M(0.3), M(0.2), GOLD);
    for (const [dx, dz] of [
      [-4, -5.5],
      [4, -5.5],
      [-4, 5.5],
      [4, 5.5],
    ])
      K.cyl("lm.paint", st[0] + M(dx), M(3), st[2] + M(dz), M(0.4), M(0.4), st[1] + M(5) - M(3), 10, hex("#efe6d2"));
  }
  // ---- the gateway at the quay, its name, the guard huts ----
  {
    const gz = DL - 6;
    const g0 = ramp(gz);
    for (const s of [-1, 1]) {
      const p = P(CX + s * 7, g0, gz + 1);
      K.box("plaster", p[0], p[1], p[2], M(2), M(11), M(2), hex("#efe6d2"));
      K.box("lm.chrome", p[0], p[1] + M(11), p[2], M(2.2), M(1), M(2.2), GOLD);
      const h = P(CX + s * 9.5, g0, gz + 1);
      K.box("plaster", h[0], h[1], h[2], M(3), M(4), M(4), hex("#e8dcc4"));
      K.box("glass", h[0], h[1] + M(1.4), h[2] + M(2) + 0.01, M(2), M(1.6), 0.02, hex("#2a4050"));
    }
    const p = P(CX, g0 + 9, gz + 1);
    K.box("plaster", p[0], p[1], p[2], M(15), M(2), M(2), hex("#efe6d2"));
    K.box("lm.chrome", p[0], p[1] + M(2), p[2], M(15.2), M(1), M(2.2), GOLD);
  }
  // ---- the crown: a round plaza and its fountain ----
  {
    const p = P(CX, 3, TZ0 + 6);
    K.cyl("lm.PavingStones128", p[0], p[1] - 0.05, p[2], M(7), M(7), 0.06, 32, PAVE);
    K.lathe("lm.Marble021", [[M(5), 0], [M(5), M(0.8)], [M(4.6), M(0.8)], [M(4.6), M(0.2)], [0, M(0.2)]], p[0], p[1], p[2], 32, WHITE);
    K.cyl("lm.plastic", p[0], p[1] + M(0.2), p[2], M(4.6), M(4.6), M(0.45), 32, POOL);
    K.cyl("lm.Marble021", p[0], p[1], p[2], M(1.2), M(0.8), M(3), 16, WHITE);
    K.cyl("lm.glow", p[0], p[1] + M(3), p[2], M(0.25), M(0.05), M(2.5), 8, hex("#d8f6ff"));
    for (let a = 0; a < 6; a++) palmAt(CX + Math.sin(a) * 9.5, 2.4, TZ0 + 6 + Math.cos(a) * 9.5, a);
  }
  // ---- the crescent: small resorts and palms ----
  {
    let n = 0;
    for (let a = -CRES_END + 0.18; a < CRES_END - 0.1; a += 0.13) {
      if (Math.abs(a) < 0.62) continue;
      const rr = (RI(a) + RO) / 2 - 1;
      const x = CC.x + Math.sin(a) * rr,
        z = CC.z - Math.cos(a) * rr;
      if (n % 2 === 0) {
        const w = 7 + (n % 2) * 2,
          d = 6;
        const h = 3 + 6 + (n % 3) * 3;
        const p = P(x, 3, z);
        const wall = hex(["#f0e2c4", "#ecd6b0", "#f4ece0"][n % 3]);
        const ry = -a;
        K.box("plaster", p[0], p[1], p[2], M(w), M(h - 3), M(d), wall, ry);
        for (let y = 4; y < h - 1; y += 3) K.box("glass", p[0], P(0, y, 0)[1], p[2], M(w) + 0.04, M(1.4), M(d) + 0.04, hex("#3a5468"), ry);
        K.box("lm.RoofingTiles006", p[0], P(0, h, 0)[1], p[2], M(w + 0.6), M(0.5), M(d + 0.6), n % 4 ? hex("#c0603e") : hex("#d9b25a"), ry);
      } else {
        palmAt(x, 3, z, n);
        palmAt(x + 2, 3, z + 2, n + 1);
      }
      const ir = RI(a) + 1.6;
      palmAt(CC.x + Math.sin(a + 0.04) * ir, 2, CC.z - Math.cos(a + 0.04) * ir, n + 2);
      n++;
    }
  }
  atlantis(c, P, M, CX, zOut);
  // Aquaventure: the stepped ziggurat and its slides
  {
    const a = 0.72;
    const rr = (RI(a) + RO) / 2;
    const zx = CC.x + Math.sin(a) * rr,
      zz = CC.z - Math.cos(a) * rr;
    for (let l = 0; l < 5; l++) {
      const p = P(zx, 3 + l * 3, zz);
      K.box("lm.Bricks083", p[0], p[1], p[2], M(10 - l * 2), M(3), M(10 - l * 2), hex("#e0c08e"));
    }
    const top = P(zx, 18, zz);
    K.frustum("lm.Bricks083", top[0], top[1], top[2], M(2), M(2), M(1), M(1), M(3), hex("#c89a5a"));
    const slide = ["#2f8fd8", "#e8a020", "#38c0a0"];
    for (let s = 0; s < 3; s++) {
      let prev: V3 | null = null;
      for (let t = 0; t <= 40; t += lod ? 4 : 2) {
        const ang = s * 2.1 + t * 0.16;
        const rad = 6 + t * 0.12;
        const q = P(zx + Math.cos(ang) * rad, 19 - t * 0.42, zz + Math.sin(ang) * rad);
        if (prev) K.rod("lm.plastic", prev, q, M(0.6), slide[s], 8);
        prev = q;
      }
    }
    for (const [dx, dz] of [
      [-9, 3],
      [8, 4],
    ]) {
      const p = P(zx + dx, 2, zz + dz);
      K.box("lm.plastic", p[0], p[1], p[2], M(6), 0.08, M(4), POOL);
    }
  }
  // the beach club's umbrellas
  {
    const a = -0.72;
    const rr = RI(a) + 3;
    for (let t = 0; t < 7; t++) {
      const aa = a - 0.05 + t * 0.022 * (t % 2 ? 1 : -1) - t * 0.03;
      const p = P(CC.x + Math.sin(aa) * rr, 2, CC.z - Math.cos(aa) * rr);
      K.cyl("lm.paint", p[0], p[1], p[2], 0.03, 0.03, M(3), 6, WHITE);
      K.lathe("lm.paint", [[0.02, M(3.3)], [M(1.5), M(2.9)], [M(1.5), M(2.8)]], p[0], p[1], p[2], 12, t % 2 ? hex("#f4b728") : hex("#f6f2ea"));
    }
  }
}

/**
 * A palm at the Palm's own scale (its villas are a third of a real one's size: a real tree would tower
 * over them): a leaning ringed trunk and a crown of drooping fronds, each a blade along a curve.
 */
function miniPalm(K: Kit, p: V3, H: number, seed: number, lod: number) {
  const r = rng(seed * 7 + 3);
  const lean = (r() - 0.5) * 0.35,
    la = r() * Math.PI * 2;
  const top: V3 = [p[0] + Math.cos(la) * lean * H, p[1] + H, p[2] + Math.sin(la) * lean * H];
  K.rod("lm.Wood049", p, top, H * 0.035, hex("#8a6a48"), 6);
  const n = lod ? 5 : 8;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r() * 0.4;
    const L = H * (0.55 + r() * 0.15);
    let prev = top;
    for (let k = 1; k <= 3; k++) {
      const t = k / 3;
      const q: V3 = [top[0] + Math.cos(a) * L * t, top[1] + L * (0.25 * t - 0.6 * t * t), top[2] + Math.sin(a) * L * t];
      K.beam("lm.paint", prev, q, H * 0.09 * (1.2 - t * 0.6), hex(i % 2 ? "#4a8a3a" : "#3f7f34"), 0.02);
      prev = q;
    }
  }
}

/** A villa of the fronds at (x, y, z) facing `ang`: a white ground floor with its glass all round, the upper box set back, a terrace, a pergola or a sun deck. */
function villa(K: Kit, p: V3, ang: number, n: number, lod: number) {
  const m = 1 / 3;
  const vw = (5 + (n % 3 === 0 ? 1 : 0)) * m,
    vd = 5 * m;
  const wall = hex(["#f6f2ea", "#f2ead8", "#ece4d2", "#f8f4ec"][n % 4]);
  const trim = n % 4 === 1 ? hex("#c9a77a") : n % 4 === 3 ? hex("#b86a48") : hex("#d8d0c0");
  const [x, y, z] = p;
  const c = Math.cos(ang),
    s = Math.sin(ang);
  /** A point in the villa's frame (u along the frond, w across). */
  const L = (u: number, w: number): [number, number] => [x + u * c + w * s, z - u * s + w * c];
  K.box("lm.PavingStones128", x, y - 0.05, z, vw + 2 * m, 0.08, vd + 2 * m, hex("#e8e0d0"), ang);
  K.box("lm.paint", x, y, z, vw, 4 * m, vd, wall, ang);
  if (!lod) K.box("glass", x, y + 1.2 * m, z, vw + 0.03, 1.5 * m, vd + 0.03, hex("#3a5468"), ang);
  if (n % 3 !== 1) {
    const [ux, uz] = L(n % 2 ? -m : m, 0);
    K.box("lm.paint", ux, y + 4 * m, uz, vw - 2 * m, 3 * m, vd - m, wall, ang);
    if (!lod) K.box("glass", ux, y + 5 * m, uz, vw - 2 * m + 0.03, m, vd - m + 0.03, hex("#2c4a5a"), ang);
    K.box("lm.paint", ux, y + 7 * m, uz, vw - 1.6 * m, 0.08, vd - 0.6 * m, trim, ang);
    // the terrace's glass balustrade
    if (!lod) K.box("glass", x, y + 4 * m, z, vw + 0.02, 0.5 * m, vd + 0.02, hex("#9ab4c0"), ang);
  } else {
    K.box("lm.paint", x, y + 4 * m, z, vw + 0.2 * m, 0.1, vd + 0.2 * m, trim, ang);
    if (!lod) {
      const [px, pz] = L(-0.5 * m, 0.3 * m);
      K.box("lm.plastic", px, y + 4 * m + 0.1, pz, 2 * m, 0.04, m, hex("#2f6fb0"), ang);
    }
  }
}

/** ATLANTIS on the crescent's middle: the coral wings stepping down either side, the two towers, the bridge over the great arch, the stepped crown, the podium. */
function atlantis(c: Ctx, P: (x: number, y: number, z: number) => V3, M: (v: number) => number, CX: number, zOut: (x: number) => number) {
  const { K, lod } = c;
  const coral = hex("#e8a08a"),
    deep = hex("#d0806c"),
    cream = hex("#f4e2be");
  const zb = zOut(CX) + 3;
  const atlTop = (A: number) => (A < 6 ? 50 : A < 12 ? 54 : 46 - Math.floor((A - 12) / 4) * 5);
  // the wings: a block every 4 voxels along the crescent's curve, stepping down
  for (let A = 12; A < 32; A += 4)
    for (const s of [-1, 1]) {
      const xm = CX + s * (A + 2);
      const ht = atlTop(A);
      const z0 = zOut(xm) + 3;
      const p = P(xm, 3, z0 + 5);
      const ry = Math.atan2(zOut(xm + 0.5) - zOut(xm - 0.5), 1);
      K.box("plaster", p[0], p[1], p[2], M(4.05), M(ht - 4), M(10), coral, -ry);
      K.box("lm.paint", p[0], P(0, ht - 1, 0)[1], p[2], M(4.1), M(1), M(10.1), cream, -ry);
      if (!lod) for (let y = 4; y < ht - 2; y += 3) K.box("glass", p[0], P(0, y, 0)[1], p[2], M(4.1), M(1.2), M(10.06), hex("#3a5468"), -ry);
    }
  // the towers and the bridge: one face cut with the great arch, extruded through
  {
    const sh = new THREE.Shape();
    const xs = (v: number) => M(v);
    sh.moveTo(xs(-12), 0);
    sh.lineTo(xs(-6), 0);
    // the arch: up from its springing, round over the top
    for (let i = 0; i <= 16; i++) {
      const a = -6 + (12 * i) / 16;
      sh.lineTo(xs(a), xs(30 + 8 * Math.sqrt(Math.max(0, 1 - (a / 6) ** 2)) - 3));
    }
    sh.lineTo(xs(6), 0);
    sh.lineTo(xs(12), 0);
    sh.lineTo(xs(12), xs(51));
    sh.lineTo(xs(6), xs(51));
    sh.lineTo(xs(6), xs(47));
    sh.lineTo(xs(-6), xs(47));
    sh.lineTo(xs(-6), xs(51));
    sh.lineTo(xs(-12), xs(51));
    sh.lineTo(xs(-12), 0);
    const [x0, y0, z0] = P(CX, 3, zb);
    K.extrude("plaster", sh, z0, M(12), coral, { ox: x0, oy: y0 });
    // pilasters and windows down the towers' faces, the bridge suite's windows, the gold rim of the arch
    if (!lod)
      for (const s of [-1, 1]) {
        for (let a = 7; a < 11; a += 2) K.box("glass", x0 + s * M(a + 0.5), y0 + M(1), z0 + M(6), M(1), M(44), M(12.08), hex("#3a5468"));
        for (const a of [6, 11.5]) K.box("plaster", x0 + s * M(a), y0, z0 + M(6), M(0.6), M(51), M(12.2), deep);
      }
    if (!lod) for (const y of [40, 43]) K.box("glass", x0, y0 + M(y - 3), z0 + M(6), M(10), M(1.2), M(12.08), hex("#3a5468"));
    for (let i = 0; i < 16; i++) {
      const a0 = -6 + (12 * i) / 16,
        a1 = -6 + (12 * (i + 1)) / 16;
      const h = (a: number) => 30 + 8 * Math.sqrt(Math.max(0, 1 - (a / 6) ** 2)) - 3;
      for (const z of [z0 - 0.02, z0 + M(12) + 0.02]) K.beam("lm.chrome", [x0 + M(a0), y0 + M(h(a0)), z], [x0 + M(a1), y0 + M(h(a1)), z], 0.12, GOLD, 0.06);
    }
    // the crown over the bridge and the towers' stepped lanterns
    const cy = y0 + M(47);
    K.box("plaster", x0, cy, z0 + M(6), M(16), M(4), M(10), coral);
    K.box("lm.paint", x0, cy + M(3), z0 + M(6), M(16.1), M(1), M(10.1), cream);
    K.box("plaster", x0, cy + M(4), z0 + M(6), M(12), M(4), M(8), coral);
    K.box("plaster", x0, cy + M(8), z0 + M(6), M(8), M(4), M(6), deep);
    K.box("lm.chrome", x0, cy + M(12), z0 + M(6), M(4), M(3), M(4), GOLD);
    K.cyl("lm.chrome", x0, cy + M(15), z0 + M(6), M(1), M(0.3), M(5), 12, GOLD);
    for (const s of [-1, 1]) {
      const tx = x0 + s * M(9);
      K.box("plaster", tx, y0 + M(51), z0 + M(6), M(6), M(3), M(8), coral);
      K.box("plaster", tx, y0 + M(54), z0 + M(6), M(4), M(3), M(6), deep);
      K.frustum("lm.chrome", tx, y0 + M(57), z0 + M(6), M(2), M(2), M(0.6), M(0.6), M(4), GOLD);
    }
    // the podium and its porte-cochère, the fountain in front
    const pf = z0 + M(12);
    K.box("plaster", x0, y0, pf + M(2), M(28), M(5), M(4), coral);
    K.box("lm.paint", x0, y0 + M(5), pf + M(2), M(28.4), M(0.6), M(4.4), cream);
    if (!lod) K.box("glass", x0, y0 + M(1), pf + M(2), M(26), M(3), M(4.06), hex("#3a5468"));
    K.box("lm.PavingStones128", x0, y0 - 0.04, pf + M(6), M(12), 0.06, M(4), PAVE);
    K.cyl("lm.plastic", x0, y0, pf + M(7), M(3), M(3), 0.1, 20, POOL);
  }
}

// ---- BURJ AL ZEC -------------------------------------------------------------------------------------

function burj(c: Ctx) {
  const { K, F, lod } = c;
  const W = F.W,
    D = F.D;
  const DL = D - 16;
  const cx = W / 2;
  const P = (x: number, y: number, z: number): V3 => F.p([x, y, z]);
  const M = (v: number) => F.m(v);
  const r = rng(c.seed * 17 + 3);
  const TOPY = 4,
    ZM = 14,
    TOP = 168;
  const IC = { x: cx, z: 34 },
    IRX = 26,
    IRZ = 28;
  const dep = (y: number) => {
    const t = Math.min(1, Math.max(0, (y - TOPY) / (TOP - TOPY)));
    return 5 + 31 * Math.pow(1 - Math.pow(t, 2.1), 0.62);
  };
  const hwMax = (y: number) => {
    const t = Math.min(1, Math.max(0, (y - TOPY) / (TOP - TOPY)));
    return 4 + 11 * Math.pow(1 - Math.pow(t, 1.8), 0.7);
  };
  const hw = (s: number, y: number) => Math.min(hwMax(y), 2.5 + s * 0.55);
  // ---- the island: rock armour, sand, the paved top ----
  {
    const ring = (k: number) => {
      const sh = new THREE.Shape();
      for (let i = 0; i <= 48; i++) {
        const ang = (i / 48) * Math.PI * 2;
        const wob = 1 + 0.04 * Math.sin(ang * 5 + 1) + 0.03 * Math.sin(ang * 9);
        const [x, , z] = P(IC.x + Math.cos(ang) * IRX * wob * k, 0, IC.z + Math.sin(ang) * IRZ * wob * k);
        // (laid flat: the shape's y is −z)
        if (i) sh.lineTo(x, -z);
        else sh.moveTo(x, -z);
      }
      return sh;
    };
    K.slab("lm.Rock030", ring(1), -0.6, 0.6 + M(2), hex("#c8c0b4"));
    K.slab("lm.Ground054", ring(0.93), -0.1, 0.1 + M(3), SAND);
    K.slab("lm.PavingStones128", ring(0.82), 0, M(TOPY) + 0.01, PAVE);
    for (let a = 0; a < Math.PI * 2; a += lod ? 0.2 : 0.1) {
      const [x, , z] = P(IC.x + Math.cos(a) * IRX * 0.99, 0, IC.z + Math.sin(a) * IRZ * 0.99);
      K.blob("lm.Rock030", x, 0.15, z, 0.5 + r() * 0.3, 0.35 + r() * 0.15, 0.45 + r() * 0.25, hex("#c8c0b4"), 8, r() * 6);
    }
  }
  const Y0 = M(TOPY);
  // ---- the sail tower: lofted from its plan level by level ----
  const levels = lod ? 14 : 34;
  const outline = (y: number) => {
    // (counter-clockwise from above: the mast's back corners, the wings out to the sail's edges, the sail bellying out)
    const dp = dep(y),
      hm = hwMax(y);
    const sk = Math.max(0, (hm - 2.5) / 0.55);
    const pts: [number, number][] = [];
    pts.push([cx - 2.5, ZM]);
    pts.push([cx - hw(Math.min(sk, dp), y), ZM + Math.min(sk, dp)]);
    pts.push([cx - hw(dp, y), ZM + dp - 1.6]);
    const n = lod ? 4 : 8;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = -1 + 2 * t;
      const h = hw(dp, y);
      // the fabric: bellying forward at the foot, flatter higher up
      const belly = (1 - x * x) * (1.6 + 3 * (1 - Math.min(1, (y - TOPY) / (TOP - TOPY))));
      pts.push([cx + x * h, ZM + dp - 1.6 + belly * 0.6 + 1.6 * (1 - Math.abs(x))]);
    }
    pts.push([cx + hw(dp, y), ZM + dp - 1.6]);
    pts.push([cx + hw(Math.min(sk, dp), y), ZM + Math.min(sk, dp)]);
    pts.push([cx + 2.5, ZM]);
    return pts;
  };
  {
    // the wings' glass and the sail's fabric: a loft between consecutive outlines
    const glassP: number[] = [],
      fabricP: number[] = [],
      whiteP: number[] = [];
    for (let l = 0; l < levels; l++) {
      const ya = TOPY + ((TOP - TOPY) * l) / levels,
        yb = TOPY + ((TOP - TOPY) * (l + 1)) / levels;
      const A = outline(ya),
        B = outline(yb);
      for (let i = 0; i < A.length; i++) {
        const j = (i + 1) % A.length;
        const a0 = P(A[i][0], ya, A[i][1]),
          a1 = P(A[j][0], ya, A[j][1]),
          b0 = P(B[i][0], yb, B[i][1]),
          b1 = P(B[j][0], yb, B[j][1]);
        // (wound to face out)
        const tri = [...a0, ...a1, ...b1, ...a0, ...b1, ...b0];
        const sail = i >= 2 && i < A.length - 3;
        const back = i === 0 || i >= A.length - 2;
        (sail ? fabricP : back ? whiteP : glassP).push(...tri);
      }
    }
    const mk = (arr: number[]) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(arr, 3));
      g.computeVertexNormals();
      return g;
    };
    K.add("glass", mk(glassP), hex("#4a6a82"));
    K.add("lm.paint", mk(fabricP), hex("#fbfbf8"));
    K.add("lm.paint", mk(whiteP), WHITE);
    // the floors' white slabs round the wings (every 6 voxels: 2 m)
    if (!lod)
      for (let y = TOPY + 6; y < TOP; y += 6) {
        const A = outline(y);
        for (let i = 0; i < A.length - 1; i++) {
          const sail = i >= 2 && i < A.length - 3;
          if (sail) continue;
          K.beam("lm.paint", P(A[i][0], y, A[i][1]), P(A[i + 1][0], y, A[i + 1][1]), 0.18, WHITE, 0.32);
        }
      }
    // the fabric's seams up the sail: a faint glow at night
    if (!lod)
      for (let k = -3; k <= 3; k++) {
        let prev: V3 | null = null;
        for (let l = 0; l <= 12; l++) {
          const y = TOPY + ((TOP - TOPY) * l) / 12;
          const dp = dep(y),
            h = hw(dp, y);
          const x = k / 4;
          const belly = (1 - x * x) * (1.6 + 3 * (1 - (y - TOPY) / (TOP - TOPY)));
          const q = P(cx + x * h, y, ZM + dp - 1.6 + belly * 0.6 + 1.6 * (1 - Math.abs(x)) + 0.15);
          if (prev) K.rod("lm.glow", prev, q, 0.05, hex("#c8b8ff"), 4);
          prev = q;
        }
      }
    // the roof cap
    const cap = outline(TOP);
    const capShape = new THREE.Shape();
    cap.forEach(([x, z], i) => {
      const [X, , Z] = P(x, 0, z);
      if (i) capShape.lineTo(X, -Z);
      else capShape.moveTo(X, -Z);
    });
    K.slab("lm.paint", capShape, M(TOP), 0.4, WHITE);
  }
  // ---- the legs: along the sail's edges, arcing over the roof into the mast ----
  const legAt = (y: number, sx: number): V3 => {
    const dp = dep(y);
    return P(cx + sx * (hw(dp, y) + 1.2), y, ZM + dp - 1.5);
  };
  for (const sx of [-1, 1]) {
    let prev: V3 | null = null;
    for (let y = TOPY; y <= TOP; y += lod ? 16 : 6) {
      const q = legAt(y, sx);
      if (prev) K.rod("lm.paint", prev, q, M(1.1), WHITE, 10);
      prev = q;
    }
    for (let i = 1; i <= 8; i++) {
      const f = i / 8;
      const q = P(cx + sx * (hw(dep(TOP), TOP) + 1.2) * (1 - f), TOP + Math.sin(f * Math.PI * 0.5) * 9, ZM + dep(TOP) - 1.5 - f * (dep(TOP) - 3));
      if (prev) K.rod("lm.paint", prev, q, M(1.0), WHITE, 10);
      prev = q;
    }
    // the exoskeleton: the rear chord and the giant X braces on the side
    const rear = (y: number): V3 => {
      const s = dep(y) * 0.18;
      return P(cx + sx * (hw(s, y) + 1.4), y, ZM + s);
    };
    let rp: V3 | null = null;
    for (let y = TOPY; y <= TOP; y += lod ? 16 : 8) {
      const q = rear(y);
      if (rp) K.rod("lm.paint", rp, q, M(0.8), hex("#e8eaec"), 8);
      rp = q;
    }
    const STEP = 27;
    for (let y = TOPY; y + STEP <= TOP; y += STEP) {
      const a = legAt(y, sx),
        b = rear(y + STEP),
        cc = rear(y),
        d = legAt(y + STEP, sx);
      K.rod("lm.paint", a, b, M(0.6), hex("#e8eaec"), 8);
      K.rod("lm.paint", cc, d, M(0.6), hex("#e8eaec"), 8);
      K.rod("lm.paint", d, rear(y + STEP), M(0.5), hex("#e8eaec"), 8);
    }
  }
  // ---- the mast and the spire, the aircraft lights ----
  {
    const b = P(cx, TOPY, ZM - 1);
    K.box("lm.paint", b[0], b[1], b[2], M(4), M(TOP + 10 - TOPY), M(4), WHITE);
    K.box("lm.paint", b[0], M(TOP + 10), b[2] - M(0.5), M(3), M(12), M(3), WHITE);
    K.cyl("lm.chrome", b[0], M(TOP + 22), b[2] - M(1), M(0.8), M(0.2), M(14), 10, hex("#e0e2e6"));
    K.blob("lm.glow", b[0], M(TOP + 36), b[2] - M(1), 0.25, 0.25, 0.25, hex("#ff4a3a"), 8);
    for (let y = TOPY + 30; y < TOP; y += 30) K.blob("lm.glow", b[0], M(y), b[2] - M(2.2), 0.15, 0.15, 0.15, hex("#ff5a4a"), 6);
  }
  // ---- the helipad (+x) and Al Muntaha (−x) ----
  {
    const HY = 150,
      HR = 10.5;
    const hp = P(cx + hwMax(HY) + 11, HY - 2, ZM + 5);
    K.cyl("lm.paint", hp[0], hp[1], hp[2], M(HR), M(HR), M(1), 40, hex("#d8dade"));
    K.cyl("lm.paint", hp[0], hp[1] + M(1), hp[2], M(HR - 0.9), M(HR - 0.9), 0.03, 40, hex("#4f8a56"));
    K.lathe("lm.paint", [[M(HR - 2.2), M(1) + 0.035], [M(HR - 1.3), M(1) + 0.035]], hp[0], hp[1], hp[2], 40, hex("#f4f4ee"));
    // the H
    for (const [w, d, dx] of [
      [1.2, 7, -2.6],
      [1.2, 7, 2.6],
      [4.2, 1.2, 0],
    ])
      K.box("lm.paint", hp[0] + M(dx), hp[1] + M(1) + 0.03, hp[2], M(w), 0.02, M(d), hex("#f4f4ee"));
    // its rim lights
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 10) K.blob("lm.glow", hp[0] + Math.cos(a) * M(HR - 0.3), hp[1] + M(1) + 0.05, hp[2] + Math.sin(a) * M(HR - 0.3), 0.1, 0.06, 0.1, hex("#ffe6a0"), 6);
    // the cantilever under it, back to the wing
    const wx = P(cx + hwMax(HY) - 1, HY - 2, ZM + 5);
    for (const dz of [-3, 3]) {
      K.rod("lm.paint", [wx[0], wx[1] - M(10), wx[2] + M(dz)], [hp[0], hp[1], hp[2] + M(dz)], M(0.7), hex("#e8eaec"), 8);
      K.rod("lm.paint", [wx[0], wx[1], wx[2] + M(dz)], [hp[0], hp[1], hp[2] + M(dz)], M(0.7), hex("#e8eaec"), 8);
    }
    // Al Muntaha: the glazed capsule cantilevered on the other side
    const MY = 138;
    const x1 = cx - hwMax(MY) + 2,
      x0 = x1 - 26;
    const a = P(x0, MY, ZM - 1),
      b = P(x1, MY + 6, ZM + 10);
    const len = b[0] - a[0],
      hh = b[1] - a[1],
      dd = b[2] - a[2];
    const g = new THREE.CapsuleGeometry(Math.min(hh, dd) / 2, len - Math.min(hh, dd), 6, 16).rotateZ(Math.PI / 2).scale(1, hh / Math.min(hh, dd), dd / Math.min(hh, dd));
    g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
    K.add("lm.glass", g, hex("#5a7890"));
    K.box("lm.paint", (a[0] + b[0]) / 2, a[1] - 0.2, (a[2] + b[2]) / 2, len * 0.9, 0.3, dd * 0.6, WHITE);
  }
  // ---- at the foot: the podium and its gold canopy, the fountain court, the terraces ----
  const front = ZM + dep(TOPY);
  {
    const z0 = Math.round(front - 2),
      z1 = z0 + 8;
    const p = P(cx, TOPY, (z0 + z1) / 2);
    K.box("lm.paint", p[0], p[1], p[2], M(22), M(7), M(8), WHITE);
    if (!lod) K.box("glass", p[0], p[1] + M(1), p[2] + M(0.05), M(20), M(3.5), M(8), hex("#4a6a82"));
    K.box("lm.chrome", p[0], p[1] + M(7), p[2] + M(0.5), M(24), M(1), M(9), GOLD);
    const cz = P(cx, TOPY + 5, z1 + 2.5);
    K.box("lm.chrome", cz[0], cz[1], cz[2], M(10), M(1), M(5), GOLD);
    for (const sx of [-1, 1]) K.cyl("lm.chrome", cz[0] + sx * M(4.5), Y0, cz[2] + M(2), M(0.5), M(0.5), cz[1] - Y0, 12, GOLD);
    // the fountain court
    const fc = P(cx, TOPY, Math.round(front + 14));
    K.lathe("lm.Marble021", [[M(7.5), 0], [M(7.5), M(1)], [M(6.5), M(1)], [M(6.5), M(0.4)], [0, M(0.4)]], fc[0], fc[1] - 0.05, fc[2], 40, WHITE);
    K.cyl("lm.plastic", fc[0], fc[1] + M(0.4), fc[2], M(6.5), M(6.5), M(0.4), 36, POOL);
    for (let a = 0; a < 12; a++) {
      const ang = (a / 12) * Math.PI * 2;
      K.cyl("lm.glow", fc[0] + Math.cos(ang) * M(4), fc[1] + M(0.8), fc[2] + Math.sin(ang) * M(4), 0.05, 0.02, M(2 + (a % 3)), 6, hex("#d8f6ff"));
    }
    K.cyl("lm.glow", fc[0], fc[1] + M(0.8), fc[2], 0.12, 0.04, M(6), 8, hex("#e8fbff"));
    // the terraces at the back: pools, cabanas
    for (const [xa, xb, za, zb] of [
      [cx - 14, cx - 4, 5, 10],
      [cx + 5, cx + 14, 5, 11],
    ]) {
      const q = P((xa + xb) / 2, TOPY, (za + zb) / 2);
      K.box("lm.plastic", q[0], q[1], q[2], M(xb - xa - 2), 0.06, M(zb - za - 2), POOL);
    }
    for (let i = 0; i < 4; i++) {
      const q = P(cx + 17 + (i % 2) * 3, TOPY, 13 + i * 4);
      K.box("lm.paint", q[0], q[1], q[2], M(2), M(3), M(2), hex("#f6f2ea"));
      K.box(i % 2 ? "lm.chrome" : "lm.paint", q[0], q[1] + M(3), q[2], M(2.4), M(0.4), M(2.4), i % 2 ? GOLD : hex("#f6f2ea"));
    }
  }
  // palms round the island
  for (let a = 0; a < 16; a++) {
    const ang = (a / 16) * Math.PI * 2;
    const x = IC.x + Math.cos(ang) * IRX * 0.78,
      z = IC.z + Math.sin(ang) * IRZ * 0.78;
    if (Math.abs(x - cx) < 16 && z > ZM - 6 && z < front + 4) continue;
    if (Math.abs(x - cx) < 6 && z > front) continue;
    miniPalm(K, P(x, TOPY, z), 2.2 + (a % 3) * 0.35, a, lod);
  }
  // ---- the curved bridge to the quay: its deck, white parapets with lamps, its piers, the gatehouse ----
  {
    const zA = Math.round(front + 20);
    const xAt = (z: number) => cx + 8 * Math.sin(((z - zA) / (D - zA)) * Math.PI);
    // the deck: one continuous strip a voxel at a time, level with the island and the quay (the walker
    // crosses it from the ferry's landing to the door), from inside the island's paving to past the quay's edge
    const HW = 3.5;
    const top: number[] = [],
      skirt: number[] = [];
    const za = zA - 6,
      zb = D + 2;
    for (let z = za; z < zb; z += 1) {
      const x0 = xAt(Math.min(z, D)),
        x1 = xAt(Math.min(z + 1, D));
      const al = P(x0 - HW, TOPY, z),
        ar = P(x0 + HW, TOPY, z),
        bl = P(x1 - HW, TOPY, z + 1),
        br = P(x1 + HW, TOPY, z + 1);
      top.push(...al, ...bl, ...br, ...al, ...br, ...ar);
      for (const [a, b] of [
        [al, bl],
        [br, ar],
      ]) {
        const a2: V3 = [a[0], a[1] - 0.5, a[2]],
          b2: V3 = [b[0], b[1] - 0.5, b[2]];
        skirt.push(...a, ...a2, ...b2, ...a, ...b2, ...b);
      }
    }
    for (const [arr, slot, col] of [
      [top, "lm.PavingStones128", PAVE],
      [skirt, "lm.paint", WHITE],
    ] as const) {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(arr, 3));
      g.computeVertexNormals();
      K.add(slot, g, col);
    }
    // its white parapets with their lamps (along the edges only: the ends stay open), its piers
    const stp = lod ? 6 : 2;
    let prev: { l: V3; r: V3 } | null = null;
    for (let z = zA - 2; z <= D - 1; z += stp) {
      const xc = xAt(z);
      const l = P(xc - 3.2, TOPY, z),
        rr = P(xc + 3.2, TOPY, z);
      if (prev)
        for (const [a, b] of [
          [prev.l, l],
          [prev.r, rr],
        ])
          K.beam("lm.paint", [a[0], a[1] + 0.25, a[2]], [b[0], b[1] + 0.25, b[2]], 0.16, WHITE, 0.5);
      if (!lod && z % 6 === 0) for (const q of [l, rr]) K.blob("lm.glow", q[0], q[1] + 0.6, q[2], 0.07, 0.07, 0.07, hex("#bfe0ff"), 6);
      if (z % 9 === 0 && z > front + 22) {
        const ce = P(xc, TOPY, z);
        K.cyl("lm.paint", ce[0], -0.5, ce[2], M(1), M(1), ce[1] + 0.2 - 0.5 - 0.3, 12, WHITE);
      }
      prev = { l, r: rr };
    }
    const gx = xAt(D - 4);
    const g = P(gx + 6, TOPY + 1, D - 4.5);
    K.box("lm.paint", g[0], g[1], g[2], M(4), M(4), M(5), WHITE);
    K.box("lm.chrome", g[0], g[1] + M(4), g[2], M(4.4), M(0.6), M(5.4), GOLD);
  }
  // the night's colour wash at the sail's foot: a row of floodlights
  for (let i = 0; i < 9; i++) {
    const q = P(cx - 10 + i * 2.5, TOPY + 8, front + 6);
    K.blob("lm.glow", q[0], q[1], q[2], 0.18, 0.12, 0.18, hex(["#7a4cff", "#2fa8ff", "#ff4ab0", "#f4b728", "#38e0c0"][i % 5]), 6);
  }
  void DL;
}
