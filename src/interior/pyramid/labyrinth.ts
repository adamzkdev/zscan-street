import * as THREE from "three";
import { hash, rand } from "../../scene/voxel/model";
import { place } from "../furniture";
import { glowMat, textPlane } from "../kit";
import { bake, Geo, type Torch } from "./geo";
import { TORCH, type PyramidKit } from "./kit";
import { brazier, guardian, jar, mummy, sand, skeleton } from "./models";

/**
 * Level 0: the descending passage from the street, the entrance gallery (corbelled, two zebra-headed
 * wardens, braziers) and the LABYRINTH: a seeded maze of 9 × 9 cells of 2.6 m, braided a little so
 * it has loops as well as dead ends, torchlit, its walls carved with Zcash hieroglyphs. Five golden
 * ⓩ coins hide in its dead ends, mummies stand in others (one walks a long corridor), two pressure
 * plates drop a stone door behind or ahead of you, and the far side opens on the ascending passage.
 */

export const N = 9,
  S = 2.6,
  T = 0.5,
  MH = 3.2;
export const MX0 = -(N * S) / 2,
  MZ0 = -20,
  MZ1 = MZ0 - N * S;
const HALL = N * N,
  PASS = N * N + 1,
  EXITR = N * N + 2;
const ENTRY_C = 4;

export interface Game {
  found: number;
  total: number;
  onFound(): void;
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

export function labyrinth(k: PyramidKit, seed: number, game: Game) {
  const f = 0;
  const g = k.groups[f];
  const rects = k.rects[f];
  const r = rand(seed);

  // ---- the maze ------------------------------------------------------------------------------
  // hw[r][c]: wall on the line z = MZ0 - S·r above cell (r, c); vw[r][c]: wall on x = MX0 + S·c
  const hw = Array.from({ length: N + 1 }, () => Array<boolean>(N).fill(true));
  const vw = Array.from({ length: N }, () => Array<boolean>(N + 1).fill(true));
  const seen = new Uint8Array(N * N);
  const stack: [number, number][] = [[0, ENTRY_C]];
  seen[ENTRY_C] = 1;
  const openBetween = (a: [number, number], b: [number, number]) => {
    if (b[0] < a[0]) hw[a[0]][a[1]] = false;
    else if (b[0] > a[0]) hw[b[0]][a[1]] = false;
    else if (b[1] < a[1]) vw[a[0]][a[1]] = false;
    else vw[a[0]][b[1]] = false;
  };
  while (stack.length) {
    const cur = stack[stack.length - 1];
    const opts: [number, number][] = [];
    for (const [dr, dc] of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ]) {
      const nr = cur[0] + dr,
        nc = cur[1] + dc;
      if (nr >= 0 && nr < N && nc >= 0 && nc < N && !seen[nr * N + nc]) opts.push([nr, nc]);
    }
    if (!opts.length) {
      stack.pop();
      continue;
    }
    const nx = opts[Math.floor(r() * opts.length)];
    openBetween(cur, nx);
    seen[nx[0] * N + nx[1]] = 1;
    stack.push(nx);
  }

  /** Open sides of a cell: [dr, dc] steps. */
  const exits = (rr: number, c: number) => {
    const o: [number, number][] = [];
    if (rr > 0 && !hw[rr][c]) o.push([-1, 0]);
    if (rr < N - 1 && !hw[rr + 1][c]) o.push([1, 0]);
    if (c > 0 && !vw[rr][c]) o.push([0, -1]);
    if (c < N - 1 && !vw[rr][c + 1]) o.push([0, 1]);
    return o;
  };
  // braid: knock out a few walls between corridors (never a dead end's) so there are loops too
  for (let rr = 1; rr < N; rr++) for (let c = 0; c < N; c++) if (hw[rr][c] && r() < 0.14 && exits(rr, c).length > 1 && exits(rr - 1, c).length > 1) hw[rr][c] = false;
  for (let rr = 0; rr < N; rr++) for (let c = 1; c < N; c++) if (vw[rr][c] && r() < 0.14 && exits(rr, c).length > 1 && exits(rr, c - 1).length > 1) vw[rr][c] = false;
  const dist = new Int32Array(N * N).fill(-1);
  dist[ENTRY_C] = 0;
  const q = [ENTRY_C];
  while (q.length) {
    const cell = q.shift()!;
    const rr = Math.floor(cell / N),
      c = cell % N;
    for (const [dr, dc] of exits(rr, c)) {
      const n = (rr + dr) * N + c + dc;
      if (dist[n] < 0) {
        dist[n] = dist[cell] + 1;
        q.push(n);
      }
    }
  }
  let exitC = 0;
  for (let c = 0; c < N; c++) if (dist[(N - 1) * N + c] > dist[(N - 1) * N + exitC]) exitC = c;
  hw[0][ENTRY_C] = false;
  hw[N][exitC] = false;

  const cx = (c: number) => MX0 + S * (c + 0.5);
  const cz = (rr: number) => MZ0 - S * (rr + 0.5);
  const ex = cx(exitC);

  const cellOf = (x: number, z: number) => {
    if (z <= MZ0 && z > MZ1 && x >= MX0 && x < MX0 + N * S) return Math.floor((MZ0 - z) / S) * N + Math.floor((x - MX0) / S);
    if (z > MZ0) return z > -9 ? PASS : HALL;
    return EXITR;
  };
  const neighbours = (cell: number): number[] => {
    if (cell === PASS) return [HALL];
    if (cell === HALL) return [PASS, ENTRY_C];
    if (cell === EXITR) return [(N - 1) * N + exitC];
    const rr = Math.floor(cell / N),
      c = cell % N;
    const out = exits(rr, c).map(([dr, dc]) => (rr + dr) * N + c + dc);
    if (cell === ENTRY_C) out.push(HALL);
    if (cell === (N - 1) * N + exitC) out.push(EXITR);
    return out;
  };
  // light reaches the torch's own cell, its open neighbours, and two cells down a straight corridor
  const reach = new Map<number, Set<number>>();
  const reachOf = (cell: number) => {
    let s = reach.get(cell);
    if (s) return s;
    s = new Set([cell]);
    for (const n of neighbours(cell)) {
      s.add(n);
      if (cell < N * N && n < N * N) {
        const n2 = n + (n - cell);
        if (neighbours(n).includes(n2) && Math.abs((n2 % N) - (n % N)) <= 1) s.add(n2);
      }
    }
    reach.set(cell, s);
    return s;
  };
  const light = bake(k.torches[f], new THREE.Color(0.2, 0.16, 0.13), (p, n, t: Torch) => reachOf(t.cell).has(cellOf(p.x + n.x * 0.3, p.z + n.z * 0.3)));

  const walls = new Geo(2),
    floor = new Geo(2),
    ceil = new Geo(2),
    panels = new Geo(1);
  const solid = (x0: number, z0: number, x1: number, z1: number) => rects.push([x0, z0, x1, z1]);

  // walls and the posts between them
  for (let rr = 0; rr <= N; rr++)
    for (let c = 0; c < N; c++) {
      if (!hw[rr][c]) continue;
      const zl = MZ0 - S * rr,
        x0 = MX0 + S * c + T / 2,
        x1 = MX0 + S * (c + 1) - T / 2;
      walls.box(x0, 0, zl - T / 2, x1, MH, zl + T / 2, ["top", "bottom"]);
      solid(x0, zl - T / 2, x1, zl + T / 2);
    }
  for (let rr = 0; rr < N; rr++)
    for (let c = 0; c <= N; c++) {
      if (!vw[rr][c]) continue;
      const xl = MX0 + S * c,
        z0 = MZ0 - S * (rr + 1) + T / 2,
        z1 = MZ0 - S * rr - T / 2;
      walls.box(xl - T / 2, 0, z0, xl + T / 2, MH, z1, ["top", "bottom"]);
      solid(xl - T / 2, z0, xl + T / 2, z1);
    }
  for (let rr = 0; rr <= N; rr++)
    for (let c = 0; c <= N; c++) {
      const any = (c < N && hw[rr][c]) || (c > 0 && hw[rr][c - 1]) || (rr < N && vw[rr][c]) || (rr > 0 && vw[rr - 1][c]);
      if (!any) continue;
      const x = MX0 + S * c,
        z = MZ0 - S * rr;
      walls.box(x - T / 2, 0, z - T / 2, x + T / 2, MH, z + T / 2, ["top", "bottom"]);
      solid(x - T / 2, z - T / 2, x + T / 2, z + T / 2);
    }
  floor.flat(MX0, MZ1, MX0 + N * S, MZ0, 0, true, S / 4);
  ceil.flat(MX0, MZ1, MX0 + N * S, MZ0, MH, false, S / 4);

  // ---- what each cell holds: torches, carvings, jars, cobwebs, sand ----------------------------
  type Side = { n: THREE.Vector3; at: THREE.Vector3; along: THREE.Vector3 };
  const sides = (rr: number, c: number): Side[] => {
    const out: Side[] = [];
    const x = cx(c),
      z = cz(rr);
    if (hw[rr][c]) out.push({ n: V(0, 0, -1), at: V(x, 0, MZ0 - S * rr - T / 2), along: V(1, 0, 0) });
    if (hw[rr + 1][c]) out.push({ n: V(0, 0, 1), at: V(x, 0, MZ0 - S * (rr + 1) + T / 2), along: V(1, 0, 0) });
    if (vw[rr][c]) out.push({ n: V(1, 0, 0), at: V(MX0 + S * c + T / 2, 0, z), along: V(0, 0, 1) });
    if (vw[rr][c + 1]) out.push({ n: V(-1, 0, 0), at: V(MX0 + S * (c + 1) - T / 2, 0, z), along: V(0, 0, 1) });
    return out;
  };
  const deadEnds: number[] = [];
  for (let rr = 0; rr < N; rr++)
    for (let c = 0; c < N; c++) {
      const cell = rr * N + c;
      if (exits(rr, c).length === 1 && cell !== ENTRY_C && !(rr === N - 1 && c === exitC)) deadEnds.push(cell);
    }
  deadEnds.sort((a, b) => dist[b] - dist[a]);
  // five coins in the deepest dead ends, kept apart from each other
  const coinCells: number[] = [];
  for (const d of deadEnds) {
    if (coinCells.length >= game.total) break;
    const ok = coinCells.every((o) => Math.abs((o % N) - (d % N)) + Math.abs(Math.floor(o / N) - Math.floor(d / N)) >= 3);
    if (ok) coinCells.push(d);
  }
  for (const d of deadEnds) if (coinCells.length < game.total && !coinCells.includes(d)) coinCells.push(d);
  const others = deadEnds.filter((d) => !coinCells.includes(d));
  const mummyCells = others.slice(0, 2);
  const skeletonCell = others[2] ?? -1;

  for (let rr = 0; rr < N; rr++)
    for (let c = 0; c < N; c++) {
      const cell = rr * N + c;
      const sd = sides(rr, c);
      const h = hash(rr, c, seed);
      let torchSide = -1;
      if (sd.length && (h < 0.55 || coinCells.includes(cell) || cell === ENTRY_C)) {
        torchSide = Math.floor(hash(c, rr, seed + 1) * sd.length);
        const s = sd[torchSide];
        k.torch(f, s.at.clone().setY(1.55), s.n, cell);
      }
      sd.forEach((s, i) => {
        if (i === torchSide) {
          // carvings either side of the torch
          if (hash(rr, c, i + 9) > 0.5) for (const o of [-0.62, 0.62]) k.panelOn(panels, Math.floor(hash(rr, c, i + o * 10) * 8), s.at.clone().addScaledVector(s.along, o).setY(0.5), s.n, 0.42, 0.84);
          return;
        }
        if (hash(rr, c, i + 3) < 0.55) k.panelOn(panels, Math.floor(hash(c, rr, i) * 8), s.at.clone().setY(0.55), s.n, 0.9, 1.8);
      });
      // a jar against a wall
      if (sd.length >= 2 && hash(rr, c, 5) < 0.2 && !coinCells.includes(cell) && !mummyCells.includes(cell)) {
        const s = sd[(torchSide + 1) % sd.length];
        const p = s.at.clone().addScaledVector(s.n, 0.32).addScaledVector(s.along, hash(rr, c, 6) > 0.5 ? 0.7 : -0.7);
        place(g, `pyr-jar${cell % 3}`, () => jar(cell % 3, cell % 2 === 0), p.x, 0, p.z, hash(rr, c, 7) * 6);
        solid(p.x - 0.3, p.z - 0.3, p.x + 0.3, p.z + 0.3);
      }
      if (hash(rr, c, 8) < 0.22) place(g, `pyr-sand${cell % 2}`, () => sand(cell % 2), cx(c) + (hash(rr, c, 9) - 0.5) * 1.2, 0, cz(rr) + (hash(rr, c, 10) - 0.5) * 1.2, hash(rr, c, 11) * 3);
      // a cobweb where two walls meet under the ceiling
      for (let i = 0; i < sd.length; i++)
        for (let j = 0; j < sd.length; j++) {
          const a = sd[i],
            b = sd[j];
          if (i >= j || Math.abs(a.n.dot(b.n)) > 0.1 || hash(rr, c, i * 4 + j) > 0.3) continue;
          const corner = V(cx(c) - b.n.x * (S / 2 - T / 2) - a.n.x * (S / 2 - T / 2), MH - 0.01, cz(rr) - b.n.z * (S / 2 - T / 2) - a.n.z * (S / 2 - T / 2));
          k.cobweb(f, corner, a.n, b.n, 0.7 + hash(c, rr, 4) * 0.4);
        }
    }

  // ---- the descending passage (from the street) -----------------------------------------------
  const PH = 2.9;
  floor.flat(-1.4, -9, 1.4, 0, 0);
  ceil.flat(-1.4, -9, 1.4, 0, PH, false);
  walls.box(-1.9, 0, -8.5, -1.4, PH, 0, ["top", "bottom", "nx"]);
  walls.box(1.4, 0, -8.5, 1.9, PH, 0, ["top", "bottom", "px"]);
  walls.box(-1.4, 0, 0, 1.4, PH, 0.4, ["top", "bottom", "pz"]);
  solid(-1.9, -9, -1.4, 0);
  solid(1.4, -9, 1.9, 0);
  solid(-1.4, -0.1, 1.4, 0.4);
  k.torch(f, V(-1.4, 1.5, -3.2), V(1, 0, 0), PASS);
  k.torch(f, V(1.4, 1.5, -6.6), V(-1, 0, 0), PASS);
  k.panelOn(panels, 1, V(-1.4, 0.5, -6.6), V(1, 0, 0), 0.9, 1.8);
  k.panelOn(panels, 4, V(1.4, 0.5, -3.2), V(-1, 0, 0), 0.9, 1.8);
  place(g, "pyr-sand0", () => sand(0), -0.9, 0, -1.2, 0.4);
  place(g, "pyr-sand1", () => sand(1), 1.0, 0, -7.8, 2);

  // ---- the entrance gallery: corbelled hall before the maze ------------------------------------
  const HX = 6,
    HZ0 = -20,
    HZ1 = -9,
    HH = 4.2;
  floor.flat(-HX, HZ0, HX, HZ1, 0);
  for (const sgn of [-1, 1]) {
    walls.box(sgn < 0 ? -HX - 0.5 : HX, 0, HZ0, sgn < 0 ? -HX : HX + 0.5, HH, HZ1, ["top", "bottom"]);
    for (let i = 0; i < 3; i++) {
      const inner = HX - 0.55 * (i + 1);
      walls.box(sgn < 0 ? -HX - 0.5 : inner, HH + 0.6 * i, HZ0, sgn < 0 ? -inner : HX + 0.5, HH + 0.6 * (i + 1), HZ1, ["top"]);
    }
    solid(sgn < 0 ? -HX - 0.5 : HX, HZ0, sgn < 0 ? -HX : HX + 0.5, HZ1);
  }
  const HTOP = HH + 1.8;
  ceil.flat(-HX, HZ0, HX, HZ1, HTOP, false);
  // the front wall with the passage through it, and the back wall above the maze's
  walls.box(-HX, 0, HZ1, -1.4, HTOP, HZ1 + 0.5, ["pz", "bottom"]);
  walls.box(1.4, 0, HZ1, HX, HTOP, HZ1 + 0.5, ["pz", "bottom"]);
  walls.box(-1.4, PH, HZ1, 1.4, HTOP, HZ1 + 0.5, ["pz"]);
  solid(-HX, HZ1, -1.4, HZ1 + 0.5);
  solid(1.4, HZ1, HX, HZ1 + 0.5);
  walls.box(-HX, MH, HZ0 - T / 2, HX, HTOP, HZ0 + T / 2, ["nz"]);
  // a lintel over the maze door
  walls.box(-1.6, MH - 0.45, HZ0 + T / 2, 1.6, MH - 0.05, HZ0 + T / 2 + 0.25, []);
  for (const sgn of [-1, 1]) {
    k.torch(f, V(sgn * HX, 1.8, -11.6), V(-sgn, 0, 0), HALL, 8);
    k.torch(f, V(sgn * HX, 1.8, -16.6), V(-sgn, 0, 0), HALL, 8);
    k.panelOn(panels, 6, V(sgn * HX, 0.6, -14.1), V(-sgn, 0, 0), 1.5, 3.0);
    k.panelOn(panels, sgn < 0 ? 2 : 5, V(sgn * HX, 0.9, -18.7), V(-sgn, 0, 0), 1.0, 2.0);
    k.panelOn(panels, sgn < 0 ? 3 : 7, V(sgn * 4.4, 0.4, HZ0 + T / 2), V(0, 0, 1), 1.6, 3.2);
    k.panelOn(panels, 1, V(sgn * 3.6, 0.4, HZ1), V(0, 0, -1), 1.1, 2.2);
    // the wardens and their braziers
    place(g, "pyr-guardian", () => guardian(), sgn * 2.15, 0, HZ0 + 0.95, 0);
    solid(sgn * 2.15 - 0.6, HZ0 + 0.3, sgn * 2.15 + 0.6, HZ0 + 1.6);
    place(g, "pyr-brazier", brazier, sgn * 3.2, 0, -16.2, 0);
    solid(sgn * 3.2 - 0.4, -16.6, sgn * 3.2 + 0.4, -15.8);
    k.glow(f, V(sgn * 3.2, 1.4, -16.2), new THREE.Color(1.9, 0.9, 0.35), 8, HALL);
    place(g, `pyr-jar${sgn > 0 ? 1 : 2}`, () => jar(sgn > 0 ? 1 : 2, sgn > 0), sgn * 5.4, 0, -10.0, 0);
    place(g, "pyr-jar0", () => jar(0, true), sgn * 5.5, 0, -10.8, 1);
    solid(sgn * 5.4 - 0.4, -11.2, sgn * 5.4 + 0.4, -9.6);
  }
  const sign = textPlane("LABYRINTH · 迷宮", { h: 0.42, glow: true, color: "#f4b728" });
  sign.position.set(0, MH + 0.75, HZ0 + T / 2 + 0.02);
  g.add(sign);
  place(g, "pyr-sandH", () => sand(1, 20, 12), -3.8, 0, -12.4, 1);

  // ---- the exit chamber and the ascending passage -----------------------------------------------
  const rx0 = Math.max(ex - 2.4, MX0 + T / 2),
    rx1 = Math.min(ex + 2.4, MX0 + N * S - T / 2);
  const RZ1 = MZ1 - T / 2,
    RZ0 = MZ1 - 4.6;
  floor.flat(rx0, RZ0, rx1, RZ1, 0);
  ceil.flat(rx0, RZ0, rx1, RZ1, MH, false);
  walls.box(rx0 - 0.5, 0, RZ0, rx0, MH, RZ1, ["top", "bottom", "nx"]);
  walls.box(rx1, 0, RZ0, rx1 + 0.5, MH, RZ1, ["top", "bottom", "px"]);
  solid(rx0 - 0.5, RZ0, rx0, RZ1);
  solid(rx1, RZ0, rx1 + 0.5, RZ1);
  walls.box(rx0, 0, RZ0 - 0.5, ex - 0.8, MH, RZ0, ["top", "bottom", "nz"]);
  walls.box(ex + 0.8, 0, RZ0 - 0.5, rx1, MH, RZ0, ["top", "bottom", "nz"]);
  walls.box(ex - 0.8, 2.4, RZ0 - 0.5, ex + 0.8, MH, RZ0, ["top", "nz"]);
  solid(rx0, RZ0 - 0.5, rx1, RZ0);
  // the ascending passage: steps climbing into the dark
  const AZ = RZ0 - 0.5;
  for (let i = 0; i < 9; i++) walls.box(ex - 0.8, 0, AZ - 0.4 * (i + 1), ex + 0.8, 0.2 * (i + 1), AZ - 0.4 * i, ["bottom", "nz"]);
  walls.box(ex - 1.3, 0, AZ - 3.8, ex - 0.8, 4.4, AZ, ["nx", "bottom"]);
  walls.box(ex + 0.8, 0, AZ - 3.8, ex + 1.3, 4.4, AZ, ["px", "bottom"]);
  ceil.quad(V(ex + 0.8, 2.4, AZ), V(-1.6, 0, 0), V(0, 1.8, -3.6));
  walls.box(ex - 0.8, 0, AZ - 4.2, ex + 0.8, 4.4, AZ - 3.6, []);
  const doorway = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 2.4), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
  doorway.position.set(ex, 1.2, RZ0 - 0.3);
  g.add(doorway);
  k.pick(f, doorway, "<b>▲ Grand Gallery</b><span>the ascending passage</span>", () => ({ eyebrow: "Ascending passage", title: "Grand Gallery", floor: 1 }));
  const up = textPlane("▲ GRAND GALLERY", { h: 0.24, glow: true, color: "#f4b728" });
  up.position.set(ex, 2.72, RZ0 + 0.02);
  g.add(up);
  for (const sgn of [-1, 1]) k.torch(f, V(sgn < 0 ? rx0 : rx1, 1.5, RZ0 + 1.6), V(-sgn, 0, 0), EXITR);
  k.panelOn(panels, 7, V(ex - 1.6, 0.4, RZ0), V(0, 0, 1), 0.9, 1.8);
  k.panelOn(panels, 3, V(ex + 1.6, 0.4, RZ0), V(0, 0, 1), 0.9, 1.8);
  const stairGlow = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.06), glowMat("#ffb050", 1.4));
  stairGlow.position.set(ex, 0.08, RZ0 - 0.2);
  stairGlow.rotation.x = -Math.PI / 2;
  g.add(stairGlow);

  // ---- people and the dead ---------------------------------------------------------------------
  const facing = (cell: number) => {
    const rr = Math.floor(cell / N),
      c = cell % N;
    const [dr, dc] = exits(rr, c)[0] ?? [1, 0];
    return { x: cx(c), z: cz(rr), dx: dc, dz: -dr };
  };
  for (const cell of mummyCells) {
    const o = facing(cell);
    const x = o.x - o.dx * 0.6,
      z = o.z - o.dz * 0.6;
    const mm = place(g, "pyr-mummy", () => mummy(), x, 0, z, Math.atan2(o.dx, o.dz));
    solid(x - 0.35, z - 0.35, x + 0.35, z + 0.35);
    hoverOnly(k, f, mm, "<b>Mummy</b><span>don't wake it</span>");
  }
  if (skeletonCell >= 0) {
    const o = facing(skeletonCell);
    place(g, "pyr-skeleton", skeleton, o.x - o.dx * 0.4, 0, o.z - o.dz * 0.4, Math.atan2(o.dz, -o.dx));
  }
  // a mummy that walks the longest straight corridor, back and forth
  let best: [number, number, number, number] = [0, 0, 0, 0];
  for (let rr = 0; rr < N; rr++) {
    let run = 0;
    for (let c = 0; c < N; c++) {
      run = c > 0 && !vw[rr][c] ? run + 1 : 0;
      if (run > best[0]) best = [run, rr, c - run, c];
    }
  }
  let alongX = true;
  for (let c = 0; c < N; c++) {
    let run = 0;
    for (let rr = 0; rr < N; rr++) {
      run = rr > 0 && !hw[rr][c] ? run + 1 : 0;
      if (run > best[0]) (best = [run, c, rr - run, rr]), (alongX = false);
    }
  }
  if (best[0] >= 2) {
    const [, line, a, b] = best;
    const A = alongX ? V(cx(a), 0, cz(line)) : V(cx(line), 0, cz(a));
    const B = alongX ? V(cx(b), 0, cz(line)) : V(cx(line), 0, cz(b));
    const walker = place(g, "pyr-mummy2", () => mummy("#ff5a3a", 2), A.x, 0, A.z, 0);
    hoverOnly(k, f, walker, "<b>Mummy</b><span>on its rounds</span>");
    const len = A.distanceTo(B);
    k.ticks[f].push((_dt, t) => {
      const u = (t * 0.42) % (2 * len + 4);
      // walk, pause, turn, walk back, pause
      const s = u < len ? u : u < len + 2 ? len : u < 2 * len + 2 ? 2 * len + 2 - u : 0;
      const forward = u < len + 1 || u > 2 * len + 3;
      walker.position.lerpVectors(A, B, s / len);
      walker.position.y = Math.abs(Math.sin(t * 3.2)) * 0.03;
      const d = B.clone().sub(A).normalize().multiplyScalar(forward ? 1 : -1);
      const target = Math.atan2(d.x, d.z);
      walker.rotation.y += Math.atan2(Math.sin(target - walker.rotation.y), Math.cos(target - walker.rotation.y)) * 0.08;
      walker.rotation.z = Math.sin(t * 1.6) * 0.04;
    });
  }
  void k.person(f, 2140, [-3.9, -12.2], "Guide", { face: V(1, 0, 0.6).normalize() });
  void k.person(f, 777, [4.2, -17.8], "Archaeologist", { face: V(-0.6, 0, 1).normalize() });
  {
    const near = [...Array(N * N).keys()].find((cell) => dist[cell] === 3 && exits(Math.floor(cell / N), cell % N).length >= 2) ?? 13;
    const rr = Math.floor(near / N),
      c = near % N;
    void k.person(f, 5021, [cx(c) + 0.6, cz(rr) + 0.5], "Explorer", { face: V(-1, 0, 0) });
  }

  // ---- the coins -----------------------------------------------------------------------------
  const coinGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.045, 28).rotateX(Math.PI / 2);
  const coins = coinCells.map((cell, i) => {
    const rr = Math.floor(cell / N),
      c = cell % N;
    const o = new THREE.Group();
    const mesh = new THREE.Mesh(coinGeo, [k.coinMats[0], k.coinMats[1], k.coinMats[1]]);
    o.add(mesh);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: k.halo, color: new THREE.Color(1.6, 1.1, 0.3), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    halo.scale.setScalar(1.3);
    halo.raycast = () => {};
    o.add(halo);
    o.position.set(cx(c), 1.15, cz(rr));
    g.add(o);
    k.glow(f, V(cx(c), 1.2, cz(rr)), new THREE.Color(0.9, 0.62, 0.15), 3.2, cell);
    const coin = { o, mesh, got: false, t: 0, i };
    k.pick(f, mesh, `<b>ⓩ Golden coin</b><span>${i + 1} of ${game.total}</span>`, () => {
      if (!coin.got) collect(coin);
      return null;
    });
    return coin;
  });
  const collect = (coin: (typeof coins)[number]) => {
    if (coin.got) return;
    coin.got = true;
    coin.t = 0;
    game.found++;
    game.onFound();
  };
  k.ticks[f].push((dt, t, cam) => {
    for (const coin of coins) {
      if (!coin.o.visible) continue;
      if (!coin.got) {
        coin.mesh.rotation.y = t * 1.8 + coin.i;
        coin.o.position.y = 1.15 + Math.sin(t * 2 + coin.i) * 0.06;
        if (Math.hypot(cam.position.x - coin.o.position.x, cam.position.z - coin.o.position.z) < 0.85) collect(coin);
      } else {
        coin.t += dt;
        coin.mesh.rotation.y += dt * 18;
        coin.o.position.y += dt * 1.4;
        coin.o.scale.setScalar(Math.max(0.01, 1 - coin.t * 1.4));
        if (coin.t > 0.7) coin.o.visible = false;
      }
    }
  });

  // ---- the traps: pressure plates that drop a stone door -------------------------------------
  const corridor = [...Array(N * N).keys()].filter((cell) => {
    const rr = Math.floor(cell / N),
      c = cell % N;
    const e = exits(rr, c);
    return e.length === 2 && e[0][0] === -e[1][0] && e[0][1] === -e[1][1] && dist[cell] >= 4 && !coinCells.includes(cell);
  });
  corridor.sort((a, b) => hash(a, 1, seed) - hash(b, 1, seed));
  const traps: number[] = [];
  for (const c of corridor) if (traps.length < 2 && traps.every((o) => Math.abs(dist[o] - dist[c]) > 4)) traps.push(c);
  let shake = 0;
  const last = new THREE.Vector3();
  for (const cell of traps) {
    const rr = Math.floor(cell / N),
      c = cell % N;
    const px = cx(c),
      pz = cz(rr);
    const plate = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.06, 1.0), k.stoneLoose);
    plate.position.set(px, 0.0, pz);
    g.add(plate);
    const rim = new THREE.Mesh(new THREE.PlaneGeometry(1.08, 1.08), new THREE.MeshBasicMaterial({ color: "#1a120a" }));
    rim.rotation.x = -Math.PI / 2;
    rim.position.set(px, 0.005, pz);
    g.add(rim);
    const e = exits(rr, c);
    const slab = new THREE.Mesh(new THREE.BoxGeometry(S - T + 0.1, MH, 0.42), k.stoneLoose);
    slab.visible = false;
    g.add(slab);
    let state: "idle" | "fall" | "down" | "rise" = "idle",
      time = 0,
      vy = 0,
      rect: [number, number, number, number] | null = null;
    k.ticks[f].push((dt, _t, cam) => {
      const p = cam.position;
      if (state === "idle") {
        if (Math.hypot(p.x - px, p.z - pz) < 0.5) {
          const vel = V(p.x - last.x, 0, p.z - last.z);
          // the door drops on the side you are heading for
          const [dr, dc] = e.reduce((a, b) => (vel.x * b[1] - vel.z * b[0] > vel.x * a[1] - vel.z * a[0] ? b : a));
          const bx = px + (dc * S) / 2,
            bz = pz - (dr * S) / 2;
          slab.position.set(bx, MH + MH / 2, bz);
          slab.rotation.y = dc ? Math.PI / 2 : 0;
          slab.visible = true;
          rect = dc ? [bx - 0.21, bz - S / 2, bx + 0.21, bz + S / 2] : [bx - S / 2, bz - 0.21, bx + S / 2, bz + 0.21];
          plate.position.y = -0.03;
          state = "fall";
          vy = 0;
          time = 0;
        }
      } else if (state === "fall") {
        vy += 22 * dt;
        slab.position.y -= vy * dt;
        if (slab.position.y - MH / 2 < 1.6 && rect && !rects.includes(rect)) rects.push(rect);
        if (slab.position.y <= MH / 2) {
          slab.position.y = MH / 2;
          state = "down";
          shake = 0.5;
          time = 0;
        }
      } else if (state === "down") {
        time += dt;
        if (time > 9) state = "rise";
      } else if (state === "rise") {
        slab.position.y += dt * 0.7;
        if (slab.position.y - MH / 2 > 2.0 && rect) {
          const i = rects.indexOf(rect);
          if (i >= 0) rects.splice(i, 1);
        }
        if (slab.position.y >= MH * 1.5) {
          slab.visible = false;
          plate.position.y = 0;
          state = "idle";
          time = 0;
        }
      }
    });
  }
  k.ticks[f].push((dt, _t, cam) => {
    if (shake > 0) {
      shake = Math.max(0, shake - dt);
      cam.position.y += (Math.random() - 0.5) * shake * 0.25;
    }
    last.copy(cam.position);
  });

  // ---- bake and build ------------------------------------------------------------------------
  k.add(f, walls, k.stone, light);
  k.add(f, floor, k.floor, light);
  k.add(f, ceil, k.ceiling, light);
  k.add(f, panels, k.panel, light);
  k.lightUp(f);
  void TORCH;
  k.scene.userData.maze = { coins: coinCells.map((c) => [cx(c % N), cz(Math.floor(c / N))]), traps: traps.map((c) => [cx(c % N), cz(Math.floor(c / N))]), exit: [ex, MZ1], mummies: mummyCells.map((c) => [cx(c % N), cz(Math.floor(c / N))]) };
  return { cellOf, neighbours };
}

/** Something that shows a tooltip but has nothing to open. */
function hoverOnly(k: PyramidKit, f: number, o: THREE.Object3D, html: string) {
  k.pick(f, o, html, () => null);
}
