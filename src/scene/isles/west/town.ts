import { CURB } from "../../city/plan";
import { hex, type Kit, rng, type V3 } from "../../real/lmkit";
import type { Isle, IsleFacade } from "../types";

/**
 * Gamla's houses (./index.ts places them): the old town's narrow gabled houses, three to five floors
 * over a stone plinth — Amsterdam's dark brick with white window frames and step, neck or bell gables,
 * Copenhagen's and Bruges' plastered fronts in ochre, rust, mint and pale blue under a tiled roof —
 * built along every side of a block that looks at a street or a canal, set back from it (a pavement
 * on a street, a quay walk with its trees on a canal), each front door the game can walk into.
 */

export type Face = "n" | "s" | "e" | "w";
export const OUT: Record<Face, [number, number]> = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };
const Y0 = CURB;
const ALL = ["+x", "-x", "+y", "-y", "+z", "-z"];
/** The face of a box that looks out of a front facing `f`. */
const FRONT: Record<Face, string> = { n: "-z", s: "+z", e: "+x", w: "-x" };
export const onlyFront = (f: Face) => ALL.filter((k) => k !== FRONT[f]).join("");

/**
 * A frame on a front: `face`, its front line `front` (z for n/s, x for e/w); u along it (x for n/s, z
 * for e/w), d inward from the front line (into the house), y up.
 */
export function frame(face: Face, front: number) {
  const [ox, oz] = OUT[face];
  const P = (u: number, y: number, d: number): V3 => (ox === 0 ? [u, y, front - oz * d] : [front - ox * d, y, u]);
  /** A box between two corners given in (u, y, d). */
  const box = (K: Kit, slot: string, u0: number, u1: number, y0: number, y1: number, d0: number, d1: number, col: V3, skip?: string) => {
    const a = P(u0, y0, d0),
      b = P(u1, y1, d1);
    K.box(slot as never, Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2]), Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.max(a[2], b[2]), col, skip ? { skip } : {});
  };
  return { P, box, out: [ox, oz] as [number, number] };
}

const BRICKS = ["#5a2a22", "#6e3426", "#3a2420", "#7a4030", "#4a2c26", "#2a2224", "#8a4a36"];
const PLASTER = ["#e2b45a", "#c9653e", "#9fc6b4", "#a9c4dc", "#e8c9a8", "#d98c6a", "#f0e2c0", "#c45a4a", "#e6d27a", "#b8a2c8"];
const DOORS = ["#2f4a3a", "#5a2420", "#1e2a3a", "#3a2a20", "#2a2a2a", "#6a4a2a"];
const ROOFS = ["#4a3c38", "#6a3a2e", "#3c3a3e", "#7a4634"];

export interface HouseSpot {
  face: Face;
  /** Its front line (z for n/s, x for e/w), its run along it, its depth. */
  front: number;
  u0: number;
  u1: number;
  depth: number;
  seed: number;
  /** A shop, a café, a bar on the ground floor (its sign's colour), or a house. */
  kind: "house" | "shop" | "cafe" | "bar";
  /** Register its front door with the game. */
  door: boolean;
}

/** A row of houses along a frontage (u0…u1), widths 5.5–9 m, heights and styles by seed. */
export function rowOf(face: Face, front: number, u0: number, u1: number, depth: number, seed: number, kinds: (k: number) => HouseSpot["kind"], doorEvery = 2): HouseSpot[] {
  const r = rng(seed);
  const out: HouseSpot[] = [];
  let u = u0;
  let k = 0;
  while (u1 - u > 5) {
    let w = 5.5 + r() * 3.5;
    if (u1 - u - w < 5) w = u1 - u;
    if (w > 11) w = (u1 - u) / 2;
    out.push({ face, front, u0: u, u1: u + w, depth, seed: seed * 31 + k * 7, kind: kinds(k), door: k % doorEvery === 0 });
    u += w;
    k++;
  }
  return out;
}

/**
 * One house: its body, plinth and cornice, its windows in white frames, its ground floor (a shop
 * window and its awning, or a house's windows), its front door with a fanlight and a step, its gable
 * and its tiled roof. Its front door for the game when `door` (pushed to `facades`).
 */
export function house(K: Kit, h: HouseSpot, facades: IsleFacade[]) {
  const r = rng(h.seed);
  const F = frame(h.face, h.front);
  const w = h.u1 - h.u0;
  const D = h.depth;
  const floors = 3 + Math.floor(r() * 2.6);
  const gf = 3.7;
  const fh = 3.1;
  const Hw = gf + (floors - 1) * fh;
  const brick = r() < 0.5;
  const wallSlot = brick ? "brick" : "plaster";
  const wallCol = hex(brick ? BRICKS[Math.floor(r() * BRICKS.length)] : PLASTER[Math.floor(r() * PLASTER.length)]);
  const white = hex(brick ? "#f2efe8" : "#f6f2ea");
  const stone = hex("#bdb5a6");
  const front = onlyFront(h.face);
  const a = h.u0 + 0.05,
    b = h.u1 - 0.05;
  const mid = (a + b) / 2;
  // the body (party walls to its neighbours), the plinth, the cornice
  F.box(K, wallSlot, a, b, Y0, Y0 + Hw, 0, D, wallCol, "-y+y");
  F.box(K, "lm.Concrete034", a - 0.02, b + 0.02, Y0 - 0.2, Y0 + 0.55, -0.05, D, stone, "-y");
  F.box(K, "lm.Concrete034", a, b, Y0 + Hw - 0.25, Y0 + Hw + 0.05, -0.18, 0.2, white, "-y");
  // the upper floors' windows (tall sashes in white frames)
  const n = Math.max(1, Math.floor((w - 0.6) / 2.05));
  const ww = Math.min(1.25, (w - 0.6) / n - 0.75);
  const step = (b - a) / n;
  for (let f = 1; f < floors; f++) {
    const y = Y0 + gf + (f - 1) * fh + 0.55;
    const wh = f === floors - 1 ? 1.7 : 1.95;
    for (let i = 0; i < n; i++) {
      const u = a + step * (i + 0.5);
      F.box(K, "lm.paint", u - ww / 2 - 0.13, u + ww / 2 + 0.13, y - 0.13, y + wh + 0.13, -0.05, 0.02, white, front);
      F.box(K, "lm.glass", u - ww / 2, u + ww / 2, y, y + wh, -0.07, 0.02, hex("#9aa4ae"), front);
      // the glazing bars
      F.box(K, "lm.paint", u - 0.03, u + 0.03, y, y + wh, -0.09, -0.06, white, front);
      F.box(K, "lm.paint", u - ww / 2, u + ww / 2, y + wh * 0.55 - 0.03, y + wh * 0.55 + 0.03, -0.09, -0.06, white, front);
    }
  }
  // the ground floor: the door, and a shop's window and awning or a house's windows
  const dw = 1.25,
    dh = 2.55;
  const du = h.kind === "house" ? (n > 1 ? a + step * 0.5 : mid) : a + Math.min(1.6, w * 0.22);
  if (h.kind !== "house") {
    const s0 = du + dw / 2 + 0.5,
      s1 = b - 0.45;
    if (s1 - s0 > 1.2) {
      F.box(K, "lm.paint", s0 - 0.12, s1 + 0.12, Y0 + 0.55, Y0 + 3.05, -0.06, 0.02, hex(h.kind === "bar" ? "#1e2a24" : "#2a2622"), front);
      F.box(K, "lm.glow", s0, s1, Y0 + 0.65, Y0 + 2.9, -0.08, 0.02, hex(h.kind === "cafe" ? "#ffd29a" : h.kind === "bar" ? "#ffb36a" : "#ffe6c0", 0.55), front);
      // the sign board over it, the awning
      const sign = hex(["#1e3a2e", "#5a1e1e", "#1e2a4a", "#2a2a2a", "#6a4a1e"][Math.floor(r() * 5)]);
      F.box(K, "lm.paint", a + 0.1, b - 0.1, Y0 + 3.15, Y0 + 3.6, -0.14, 0.02, sign);
      F.box(K, "awning", s0 - 0.2, s1 + 0.2, Y0 + 2.95, Y0 + 3.1, -1.5, 0, hex(["#b8352a", "#2e5a3a", "#e0b030", "#1e3a6a", "#7a2a4a"][Math.floor(r() * 5)]));
    }
  } else {
    for (let i = 0; i < n; i++) {
      const u = a + step * (i + 0.5);
      if (Math.abs(u - du) < dw) continue;
      F.box(K, "lm.paint", u - ww / 2 - 0.13, u + ww / 2 + 0.13, Y0 + 0.97, Y0 + 3.13, -0.05, 0.02, white, front);
      F.box(K, "lm.glass", u - ww / 2, u + ww / 2, Y0 + 1.1, Y0 + 3.0, -0.07, 0.02, hex("#9aa4ae"), front);
    }
  }
  // the front door: a stone surround, the painted door, the fanlight, a step and a lamp
  F.box(K, "lm.Concrete034", du - dw / 2 - 0.22, du + dw / 2 + 0.22, Y0, Y0 + dh + 0.75, -0.08, 0.02, stone, front);
  F.box(K, "lm.Wood049", du - dw / 2, du + dw / 2, Y0 + 0.02, Y0 + dh, -0.1, 0.02, hex(DOORS[Math.floor(r() * DOORS.length)]), front);
  F.box(K, "lm.glow.night", du - dw / 2, du + dw / 2, Y0 + dh + 0.1, Y0 + dh + 0.6, -0.1, 0.02, hex("#ffd9a0"), front);
  F.box(K, "lm.Concrete034", du - dw / 2 - 0.3, du + dw / 2 + 0.3, Y0 - 0.1, Y0 + 0.16, -0.75, 0, stone, "-y");
  F.box(K, "lm.glow.night", du + dw / 2 + 0.35, du + dw / 2 + 0.6, Y0 + 2.3, Y0 + 2.7, -0.35, -0.05, hex("#ffc67a"));
  if (h.door) {
    const [ox, oz] = F.out;
    const d = F.P(du, 0, -0.35);
    facades.push({
      // (src/interior/building.ts: what the ground floor is inside)
      type: h.kind === "bar" ? "bar" : h.kind === "cafe" ? "cafe" : h.kind === "shop" ? "streetshop" : "house",
      face: h.face,
      x0: ox === 0 ? du - dw / 2 : h.front,
      x1: ox === 0 ? du + dw / 2 : h.front,
      z: ox === 0 ? h.front : du,
      out: { x: ox, y: 0, z: oz },
      door: { x: d[0], z: d[2] },
    });
  }
  // the gable and the roof: a pitched roof running back from the front, its ridge square to the street
  const gh = Math.min(7.5, w * (0.72 + r() * 0.22));
  const yT = Y0 + Hw;
  const roofCol = hex(ROOFS[Math.floor(r() * ROOFS.length)]);
  const kindG = r();
  const tri = (d: number, col: V3) => {
    const p0 = F.P(a, yT, d),
      p1 = F.P(b, yT, d),
      p2 = F.P(mid, yT + gh, d);
    const [ox, oz] = F.out;
    const nrm: V3 = d < D / 2 ? [ox, 0, oz] : [-ox, 0, -oz];
    K.tri(wallSlot as never, p0, p1, p2, nrm, (p) => [(p[0] + p[2]) / 1.6, p[1] / 1.6], col);
  };
  tri(0.0, wallCol);
  tri(D, wallCol);
  // the two slopes (a hand over the gables front and back)
  for (const side of [-1, 1]) {
    const e = side < 0 ? a - 0.18 : b + 0.18;
    const q0 = F.P(e, yT - 0.12, -0.15),
      q1 = F.P(mid, yT + gh + 0.05, -0.15),
      q2 = F.P(mid, yT + gh + 0.05, D + 0.15),
      q3 = F.P(e, yT - 0.12, D + 0.15);
    // (the slope's normal: out and up)
    const [ox, oz] = F.out;
    const across: V3 = ox === 0 ? [side, 0, 0] : [0, 0, side];
    void oz;
    const nrm: V3 = [across[0] * 0.75, 0.66, across[2] * 0.75];
    K.quad("tile" as never, q0, q1, q2, q3, nrm, (p) => [(p[0] + p[2]) / 2, p[1] / 1.4], roofCol);
  }
  // the gable's own shape over the roof's line: stepped, neck, or a plain triangle with a coping
  if (kindG < 0.4) {
    const steps = 4;
    for (let s = 0; s < steps; s++) {
      const t0 = s / steps,
        t1 = (s + 1) / steps;
      const half = ((b - a) / 2) * (1 - t0) * 0.98;
      const halfN = ((b - a) / 2) * (1 - t1) * 0.98;
      // (each step: a block from the last step's width up to the next level, its top a coping)
      F.box(K, wallSlot, mid - half, mid + half, yT + gh * t0, yT + gh * t1 + 0.35, -0.04, 0.35, wallCol, "-y");
      F.box(K, "lm.Concrete034", mid - half - 0.05, mid - halfN, yT + gh * t1 + 0.35, yT + gh * t1 + 0.5, -0.1, 0.4, white);
      F.box(K, "lm.Concrete034", mid + halfN, mid + half + 0.05, yT + gh * t1 + 0.35, yT + gh * t1 + 0.5, -0.1, 0.4, white);
    }
  } else if (kindG < 0.72) {
    // a neck gable: shoulders, a tall neck, a small pediment, white scrolls at the shoulders
    const nw = (b - a) * 0.22;
    F.box(K, wallSlot, a + 0.3, b - 0.3, yT, yT + gh * 0.45, -0.04, 0.35, wallCol, "-y");
    F.box(K, wallSlot, mid - nw, mid + nw, yT + gh * 0.45, yT + gh * 0.95, -0.04, 0.35, wallCol, "-y");
    F.box(K, "lm.paint", mid - nw - 0.7, mid - nw, yT + gh * 0.45, yT + gh * 0.62, -0.08, 0.3, white);
    F.box(K, "lm.paint", mid + nw, mid + nw + 0.7, yT + gh * 0.45, yT + gh * 0.62, -0.08, 0.3, white);
    F.box(K, "lm.Concrete034", mid - nw - 0.15, mid + nw + 0.15, yT + gh * 0.95, yT + gh + 0.2, -0.1, 0.4, white);
    // the attic window in the neck
    F.box(K, "lm.paint", mid - 0.55, mid + 0.55, yT + gh * 0.55, yT + gh * 0.82, -0.08, 0.02, white, front);
    F.box(K, "lm.glass", mid - 0.42, mid + 0.42, yT + gh * 0.57, yT + gh * 0.8, -0.1, 0.02, hex("#9aa4ae"), front);
  } else {
    // a plain gable with a white coping up its sides and a round attic window
    for (const side of [-1, 1]) {
      const e = side < 0 ? a : b;
      K.bar("lm.Concrete034" as never, F.P(e, yT, -0.12), F.P(mid, yT + gh, -0.12), 0.32, white);
    }
    F.box(K, "lm.paint", mid - 0.5, mid + 0.5, yT + gh * 0.3, yT + gh * 0.3 + 1.0, -0.06, 0.02, white, front);
    F.box(K, "lm.glass", mid - 0.36, mid + 0.36, yT + gh * 0.3 + 0.14, yT + gh * 0.3 + 0.86, -0.08, 0.02, hex("#9aa4ae"), front);
  }
  // the hoisting beam under the gable's top (Amsterdam's)
  if (brick) F.box(K, "lm.Wood049", mid - 0.12, mid + 0.12, yT + gh * 0.72, yT + gh * 0.72 + 0.25, -0.9, 0.1, hex("#2a1e18"));
  return { du, door: F.P(du, 0, -0.35) };
}

/**
 * The town's cells from its descriptor (as the ground is cut: src/scene/isles/land.ts): the x and z
 * cuts, and each cell's kind (1 street, 2 canal, 0 block).
 */
export function cells(isle: Isle) {
  const L = isle.land;
  const rect = (s: { axis: "x" | "z"; at: number; from: number; to: number; width: number }) => (s.axis === "x" ? { x0: s.from, x1: s.to, z0: s.at - s.width / 2, z1: s.at + s.width / 2 } : { x0: s.at - s.width / 2, x1: s.at + s.width / 2, z0: s.from, z1: s.to });
  const roads = isle.streets.map(rect),
    canals = (isle.canals ?? []).map(rect);
  const xs = new Set([L.x0, L.x1]),
    zs = new Set([L.z0, L.z1]);
  for (const r of [...roads, ...canals]) {
    xs.add(Math.max(L.x0, Math.min(L.x1, r.x0)));
    xs.add(Math.max(L.x0, Math.min(L.x1, r.x1)));
    zs.add(Math.max(L.z0, Math.min(L.z1, r.z0)));
    zs.add(Math.max(L.z0, Math.min(L.z1, r.z1)));
  }
  const xe = [...xs].sort((p, q) => p - q),
    ze = [...zs].sort((p, q) => p - q);
  const nx = xe.length - 1,
    nz = ze.length - 1;
  const inR = (rs: typeof roads, x: number, z: number) => rs.some((r) => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1);
  const kind = new Uint8Array(nx * nz);
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const cx = (xe[i] + xe[i + 1]) / 2,
        cz = (ze[j] + ze[j + 1]) / 2;
      kind[j * nx + i] = inR(roads, cx, cz) ? 1 : inR(canals, cx, cz) ? 2 : 0;
    }
  const at = (i: number, j: number) => (i < 0 || j < 0 || i >= nx || j >= nz ? -1 : kind[j * nx + i]);
  return { xe, ze, nx, nz, at };
}
