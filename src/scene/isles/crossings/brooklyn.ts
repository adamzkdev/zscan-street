import * as THREE from "three";
import { real } from "../../real/tex";
import type { Course } from "../course";
import { CourseKit, worldUv, type V3 } from "../deckkit";
import { cableMats, curtain } from "./cables";
import { deckMats } from "./deck";

/**
 * A suspension bridge in Brooklyn's way (a crossing whose `style.tower` is "gothic"): two massive
 * granite towers, each pierced by twin pointed arches the roadways run through; four main cables —
 * two over the deck's outer edges, two either side of the median — with their vertical suspenders
 * and, from each tower's top, the diagonal stays fanned down to the deck (the famous web); a deep
 * stiffening truss under the deck; between the two roadways the elevated promenade (timber planks,
 * iron railings, lanterns) climbing off the road at each end; the anchorages, great blocks of
 * masonry; the approaches on stone arches over the water, a causeway where the deck runs low.
 * Night: the necklace of lights along the cables, the towers floodlit, the promenade's lanterns.
 *
 * World coordinates (the course: s along, `off` across, + right of the way along), meshes merged per
 * material and per 120 m stretch (src/scene/isles/deckkit.ts).
 */

let stoneM: Record<string, THREE.Material> | null = null;
function stoneMats() {
  if (stoneM) return stoneM;
  const keep = <T extends THREE.Material>(m: T) => ((m.userData.shared = true), m);
  const stone = real("Bricks084", { tint: "#cfc6b6", roughness: 1 });
  const stoneDark = real("Bricks084", { tint: "#8f877a", roughness: 1 });
  const granite = real("Bricks008", { tint: "#b9b2a6", roughness: 1 });
  const planks = real("Planks021", { tint: "#b49a78", roughness: 0.95 });
  const iron = keep(new THREE.MeshStandardMaterial({ color: "#2e3134", roughness: 0.55, metalness: 0.6 }));
  const lantern = keep(new THREE.MeshBasicMaterial({ color: new THREE.Color("#ffd9a0"), toneMapped: false }));
  stoneM = { stone, stoneDark, granite, planks, iron, lantern };
  return stoneM;
}

/** The lanterns' and the floodlights' glow by the evening (0 by day … 1 at night). */
export function brooklynNight(k: number) {
  if (!stoneM) return;
  (stoneM.lantern as THREE.MeshBasicMaterial).color.setRGB(1, 0.85, 0.62).multiplyScalar(0.25 + 2.4 * k);
}

export function buildBrooklyn(c: Course): THREE.Group {
  const X = c.c;
  const sec = X.section;
  const L = c.length;
  const [t1, t2] = X.towers ?? [L * 0.28, L * 0.72];
  const [a1, a2] = X.anchors ?? [t1 - 170, t2 + 170];
  const top = X.top ?? 92;
  const K = new CourseKit(c);
  const M = deckMats(X.style.paint);
  const S = stoneMats();
  const pr = X.promenade;
  const med = sec.median;

  /** A strip over the deck between offsets a and b whose height over the road varies (dy(s)). */
  const strip = (mat: string, a: number, b: number, dy: (s: number) => number, s0: number, s1: number, step = 2, uTile = 3, down = false) => {
    const pos: number[] = [],
      uv: number[] = [];
    for (let s = s0; s < s1 - 1e-6; s += step) {
      const q = Math.min(s1, s + step);
      const P = [c.point(s, a, dy(s)), c.point(s, b, dy(s)), c.point(q, b, dy(q)), c.point(q, a, dy(q))];
      const T = [
        [s / uTile, a / uTile],
        [s / uTile, b / uTile],
        [q / uTile, b / uTile],
        [q / uTile, a / uTile],
      ];
      for (const o of down ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3]) pos.push(...P[o]), uv.push(...T[o]);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    K.add(mat, g);
  };
  /** A vertical band along the course at `off`, from dy0(s) to dy1(s) over the road (a fascia, a railing's panel). */
  const wall = (mat: string, off: number, dy0: (s: number) => number, dy1: (s: number) => number, s0: number, s1: number, step = 2) => {
    const pos: number[] = [],
      uv: number[] = [];
    for (let s = s0; s < s1 - 1e-6; s += step) {
      const q = Math.min(s1, s + step);
      const P = [c.point(s, off, dy0(s)), c.point(q, off, dy0(q)), c.point(q, off, dy1(q)), c.point(s, off, dy1(s))];
      // (u along every `uT` metres, v 0 at the band's foot … 1 at its top: a railing's balusters fit it)
      const uT = mat === "rail" ? 0.6 : 2;
      const T = [
        [s / uT, 0],
        [q / uT, 0],
        [q / uT, 1],
        [s / uT, 1],
      ];
      // (both faces)
      for (const o of [0, 1, 2, 0, 2, 3, 0, 2, 1, 0, 3, 2]) pos.push(...P[o]), uv.push(...T[o]);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    K.add(mat, g);
  };

  // ---- the roadways: two carriageways either side of the median, the median under the promenade ----
  const e0 = 6,
    e1 = L - 6;
  K.ribbon("road", () => med, () => sec.road, 0.012, 0, L, 18, 1, [med - 7.4, 14.8]);
  K.ribbon("road", () => -sec.road, () => -med, 0.012, 0, L, 18, 1, [-med - 7.4, 14.8]);
  K.ribbon("concrete", () => -med, () => med, 0.03, 0, L, 4, 2);
  for (const sd of [-1, 1]) {
    const at = (off: number) => () => sd * off;
    const pair = (a: number, b: number): [(s: number) => number, (s: number) => number] => (sd < 0 ? [at(b), at(a)] : [at(a), at(b)]);
    // the median's Jersey walls (facing their roadways) and the outer barriers, a steel rail on top
    K.sweep("barrier", [[0, 0], [0.05, 0.3], [0.14, 0.85], [0.42, 0.85], [0.5, 0]], at(med - 0.5), 14, L - 14, 1, false, sd);
    K.sweep("barrier", [[0, 0], [0.05, 0.3], [0.14, 0.85], [0.42, 0.85], [0.5, 0]], at(sec.road + 0.02), e0, e1, 1, false, sd);
    K.sweep("metal", [[0.2, 0.95], [0.36, 0.95], [0.36, 1.05], [0.2, 1.05], [0.2, 0.95]], at(sec.road + 0.02), e0, e1, 1, false, sd);
    // the outer walkways (a kerb up) out to the fascia, the railing, the fascia
    K.ribbon("walk", ...pair(sec.road + 0.5, sec.edge), 0.15, e0, e1, 2, 2);
    K.ribbon("walk", ...pair(sec.road, sec.road + 0.5), 0.02, e0, e1, 4, 2);
    K.sweep("iron", [[0, 1.3], [0.1, 1.3], [0.1, 1.4], [0, 1.4], [0, 1.3]], at(sec.rail), e0, e1, 1, false, sd);
    for (let s = e0 + 1; s < e1; s += 2.5) K.box("iron", 0.08, 1.25, 0.08, s, sd * sec.rail, c.y(s) + 0.15);
    K.sweep("paint", [[0, 0.3], [0, -2.2], [-0.5, -2.2]], at(sec.edge), e0, e1, 1, false, sd);
    K.sweep("paint", [[-0.5, 0.3], [0, 0.3]], at(sec.edge), e0, e1, 1, false, sd);
    // the walkway's lamps: cast-iron posts, a lantern each (every 36 m)
    for (let s = e0 + 18; s < e1 - 6; s += 36) {
      if (Math.abs(s - t1) < 14 || Math.abs(s - t2) < 14) continue;
      const y = c.y(s) + 0.15;
      K.box("iron", 0.34, 0.5, 0.34, s, sd * (sec.walk - 0.1), y);
      K.box("iron", 0.16, 5.2, 0.16, s, sd * (sec.walk - 0.1), y);
      K.box("iron", 0.5, 0.12, 0.5, s, sd * (sec.walk - 0.1), y + 5.2);
      K.box("lantern", 0.42, 0.7, 0.42, s, sd * (sec.walk - 0.1), y + 5.32);
      K.box("iron", 0.6, 0.14, 0.6, s, sd * (sec.walk - 0.1), y + 6.02);
    }
  }

  // ---- the promenade over the median ----
  if (pr) {
    const rise = (s: number) => {
      if (s < pr.s0 || s > pr.s1) return 0;
      const k = Math.min(1, (s - pr.s0) / pr.ramp, (pr.s1 - s) / pr.ramp);
      return pr.rise * k * k * (3 - 2 * k);
    };
    const h = pr.half;
    strip("planks", -h, h, (s) => rise(s) + 0.02, pr.s0, pr.s1, 1.5, 3);
    strip("iron", -h, h, (s) => rise(s) - 0.35, pr.s0 + pr.ramp * 0.25, pr.s1 - pr.ramp * 0.25, 3, 3, true);
    for (const sd of [-1, 1]) {
      // the beam under the planks' edge, the railing (posts, a top rail, a lattice panel)
      wall("iron", sd * h, (s) => rise(s) - 0.45, (s) => rise(s), pr.s0, pr.s1, 2);
      wall("iron", sd * (h - 0.05), (s) => rise(s) + 1.02, (s) => rise(s) + 1.12, pr.s0, pr.s1, 2);
      wall("rail", sd * (h - 0.06), (s) => rise(s) + 0.1, (s) => rise(s) + 1.0, pr.s0, pr.s1, 2);
      for (let s = pr.s0 + 1; s < pr.s1; s += 3) K.box("iron", 0.07, 1.1, 0.07, s, sd * (h - 0.05), c.y(s) + rise(s));
      // its columns down to the median, every 12 m where it stands clear of the road
      for (let s = pr.s0 + 12; s < pr.s1 - 4; s += 12) {
        const r = rise(s);
        if (r < 1.2) continue;
        K.box("iron", 0.36, r - 0.4, 0.36, s, sd * (h - 0.8), c.y(s) + 0.02);
      }
      // lanterns along it, every 24 m (staggered either side)
      for (let s = pr.s0 + (sd > 0 ? 12 : 24); s < pr.s1 - 6; s += 24) {
        if (Math.abs(s - t1) < 12 || Math.abs(s - t2) < 12) continue;
        const y = c.y(s) + rise(s);
        K.box("iron", 0.12, 3.6, 0.12, s, sd * (h - 0.2), y);
        K.box("lantern", 0.36, 0.55, 0.36, s, sd * (h - 0.2), y + 3.6);
        K.box("iron", 0.5, 0.12, 0.5, s, sd * (h - 0.2), y + 4.15);
      }
    }
  }

  // ---- the cables' lines ----
  const outer = sec.edge + 0.9;
  const inner = med + 0.2;
  const saddle = top - 3;
  const mid = (t1 + t2) / 2;
  const low = c.y(mid) + 3.2;
  const cableY = (s: number) => {
    if (s >= t1 && s <= t2) {
      const u = (s - mid) / ((t2 - t1) / 2);
      return low + (saddle - low) * u * u;
    }
    const [sa, st] = s < t1 ? [a1, t1] : [a2, t2];
    const ya = c.y(sa) + 2.4;
    const t = (s - sa) / (st - sa);
    if (t < 0 || t > 1) return -1;
    return ya + (saddle - ya) * t - 6 * 4 * t * (1 - t);
  };

  // ---- the towers ----
  const W = outer + 5.2; // the tower's half width across
  for (const t of [t1, t2]) {
    const y0 = c.y(t);
    const D = 16;
    // the caisson in the water and the base up to the roadway: solid granite across the whole width
    K.box("granite", W * 2 + 8, 9, D + 10, t, 0, -7);
    K.box("stone", W * 2 + 2, y0 - 2 - 2, D + 2, t, 0, 2);
    K.box("stoneDark", W * 2 + 2.6, 0.9, D + 2.6, t, 0, y0 - 2.6);
    // the outer piers, full height
    const pierIn = sec.edge - 0.6;
    for (const sd of [-1, 1]) {
      const pc = sd * (pierIn + (W - pierIn) / 2);
      K.box("stone", W - pierIn, top - (y0 - 2), D, t, pc, y0 - 2);
      // the pilasters' stepped faces (a band at the springing, one at the cornice)
      K.box("stoneDark", W - pierIn + 0.8, 1.2, D + 0.8, t, pc, y0 + 24);
    }
    // the central pier: under the promenade's passage and over it
    const cw = 2.0;
    const pass = pr ? [y0 + pr.rise - 0.4, y0 + pr.rise + 3.6] : [y0 + 4, y0 + 4];
    K.box("stone", cw * 2, pass[0] - (y0 - 2), D, t, 0, y0 - 2);
    // (the passage's pointed head)
    const spring = y0 + 24;
    K.box("stone", cw * 2, spring - pass[1], D, t, 0, pass[1]);
    // the twin pointed arches: the spandrels filled level by level up to the apex
    const a = (pierIn - cw) / 2;
    const apex = spring + a * Math.sqrt(3);
    for (const sd of [-1, 1]) {
      const cx = sd * (cw + a);
      for (let hh = 0; hh < apex - spring; hh += 0.9) {
        const w = Math.max(0, Math.sqrt(4 * a * a - (hh + 0.45) * (hh + 0.45)) - a);
        if (a - w < 0.05) continue;
        for (const side of [-1, 1]) {
          const o0 = cx + side * w,
            o1 = cx + side * a;
          K.box("stone", Math.abs(o1 - o0), 0.9, D, t, (o0 + o1) / 2, spring + hh);
        }
      }
      // the arch's moulding: a darker band following the curve on both faces
      for (let k = 0; k < 14; k++) {
        const u0 = k / 14,
          u1 = (k + 1) / 14;
        const th = (u: number) => u * (Math.PI / 3);
        for (const side of [-1, 1]) {
          // (the arc centred on the opposite springing, radius 2a)
          const P = (u: number): [number, number] => [cx - side * a + side * 2 * a * Math.cos(th(u)), spring + 2 * a * Math.sin(th(u))];
          const [p0x, p0y] = P(u0),
            [p1x, p1y] = P(u1);
          for (const f of [-1, 1]) K.bar("stoneDark", c.point(t + f * (D / 2 + 0.15), p0x, p0y - y0), c.point(t + f * (D / 2 + 0.15), p1x, p1y - y0), 0.7);
        }
      }
    }
    // solid over the arches to the top, the cornice, the cap
    K.box("stone", W * 2, top - apex, D, t, 0, apex);
    K.box("stoneDark", W * 2 + 1.6, 1.4, D + 1.6, t, 0, top - 6);
    K.box("stone", W * 2 + 1.0, 2.6, D + 1.0, t, 0, top - 1.2);
    K.box("stoneDark", W * 2 + 1.8, 0.6, D + 1.8, t, 0, top + 1.4);
    // blind pointed niches high on both faces (two per face, over each arch)
    for (const sd of [-1, 1])
      for (const f of [-1, 1]) {
        const cx = sd * (cw + a);
        K.box("stoneDark", 3.2, 9, 0.5, t + f * (D / 2), cx, apex + 4);
        K.box("stoneDark", 2.0, 2.2, 0.5, t + f * (D / 2), cx, apex + 13);
      }
    // the saddles on top, the floodlights on both faces (warm, at night)
    for (const off of [outer, inner]) for (const sd of [-1, 1]) K.box("iron", 2.0, 1.4, 4.0, t, sd * off, saddle - 0.6);
    for (const f of [-1, 1]) {
      K.box("flood", W * 2 - 2, 0.3, 0.08, t + f * (D / 2 + 0.95), 0, top - 6.4);
      for (const sd of [-1, 1]) K.box("flood", 0.3, top - y0 - 10, 0.08, t + f * (D / 2 + 0.06), sd * (pierIn + 0.5), y0 + 2);
    }
  }

  // ---- the anchorages: masonry blocks the deck runs over, blind arches down their sides ----
  for (const an of [a1, a2]) {
    const len = 46;
    K.box("granite", W * 2 + 6, 6, len + 6, an, 0, -7);
    // (in slices along the deck: it climbs over the block, the masonry's top follows it just under)
    for (let u = an - len / 2; u < an + len / 2 - 1e-6; u += 2) {
      const yu = Math.min(c.y(u), c.y(u + 2));
      K.box("stone", W * 2 + 2, yu - 2.3 + 1, 2.02, u + 1, 0, -1);
      K.box("stoneDark", W * 2 + 3, 0.9, 2.02, u + 1, 0, yu - 3.2);
    }
    const ya = c.y(an);
    for (const sd of [-1, 1])
      for (let k = -2; k <= 2; k++) {
        const s = an + k * 8.4;
        K.box("stoneDark", 0.5, Math.max(2, Math.min(c.y(s - 2.1), c.y(s + 2.1)) - 10), 4.2, s, sd * (W + 1.05), 2);
      }
    void ya;
  }

  // ---- the cables, their suspenders, the stays (the web), the necklace ----
  const neck: THREE.BufferGeometry[] = [];
  const white = new THREE.Color(X.style.night === "gold" ? "#ffc46a" : "#fff4e0");
  for (const off of [outer, inner])
    for (const sd of [-1, 1]) {
      const pts: V3[] = [];
      for (let s = a1; s <= a2 + 0.01; s += 3) pts.push(c.point(s, sd * off, cableY(s) - c.y(s)));
      K.tube("paint", pts, off === outer ? 0.48 : 0.4, 8);
      // the suspenders, every 6 m
      const foot = off === outer ? sec.edge - 0.3 : med + 0.15;
      for (let s = a1 + 5; s < a2 - 4; s += 6) {
        if (Math.abs(s - t1) < 9 || Math.abs(s - t2) < 9) continue;
        const cy = cableY(s);
        if (cy < c.y(s) + 1.6) continue;
        K.bar("hanger", c.point(s, sd * off, cy - c.y(s)), c.point(s, sd * foot, 0.4), 0.09);
      }
      // (far away: their veil, crossings/cables.ts)
      curtain(K, c, "curtain", sd * foot, a1 + 2, a2 - 2, 0.4, cableY, 6, a1 + 5, (s) => Math.abs(s - t1) < 9 || Math.abs(s - t2) < 9, sd * off);
      // the stays: from high on each tower, fanned down to the deck both ways (a third of the span)
      for (const t of [t1, t2])
        for (const dir of [-1, 1])
          for (let k = 1; k <= 10; k++) {
            const s = t + dir * (8 + k * 14);
            if (s < a1 + 6 || s > a2 - 6) break;
            K.bar("hanger", c.point(t, sd * off, saddle - 4 - k * 1.2 - c.y(t)), c.point(s, sd * foot, 0.4), 0.11);
          }
      // the lights along the outer cables
      if (off === outer)
        for (let s = a1 + 3; s < a2 - 3; s += 5) {
          const p = c.point(s, sd * off, cableY(s) - c.y(s) + 0.55);
          const g = new THREE.BoxGeometry(0.42, 0.42, 0.42).translate(p[0], p[1], p[2]).toNonIndexed();
          const n = g.getAttribute("position").count;
          const cc = new Float32Array(n * 3);
          for (let i = 0; i < n; i++) cc.set([white.r, white.g, white.b], i * 3);
          g.setAttribute("color", new THREE.BufferAttribute(cc, 3));
          neck.push(g);
        }
    }
  for (const g of neck) K.add("necklace", worldUv(g, 2));

  // ---- the stiffening truss under the suspended deck (a1 … a2): Warren girders at the edges and either side of the median ----
  {
    const Dt = 6.4;
    for (const off of [sec.edge - 0.5, med + 0.4])
      for (const sd of [-1, 1]) {
        const o = sd * off;
        K.sweep("paint", [[-0.3, -Dt], [0.3, -Dt], [0.3, -Dt + 0.6], [-0.3, -Dt + 0.6], [-0.3, -Dt]], () => o, a1 + 20, a2 - 20, 2);
        let k = 0;
        for (let s = a1 + 20; s + 8 <= a2 - 20; s += 8, k++) {
          K.bar("paint", c.point(s, o, -2.2), c.point(s, o, -Dt + 0.3), 0.36);
          if (k % 2) K.bar("paint", c.point(s, o, -2.2), c.point(s + 8, o, -Dt + 0.3), 0.3);
          else K.bar("paint", c.point(s, o, -Dt + 0.3), c.point(s + 8, o, -2.2), 0.3);
        }
      }
    for (let s = a1 + 20; s <= a2 - 20; s += 8) K.box("steelDark", sec.edge * 2 - 1, 0.6, 0.5, s, 0, c.y(s) - Dt + 0.1);
  }

  // ---- the approaches: stone arches over the water, a causeway where the deck runs low ----
  for (const [from, to] of [
    [8, a1 - 23],
    [a2 + 23, L - 8],
  ] as const) {
    if (to <= from) continue;
    // piers every 26 m where the deck stands high enough for an arch, the arches between
    const piers: number[] = [];
    for (let s = from; s <= to; s += 26) piers.push(s);
    for (let i = 0; i < piers.length; i++) {
      const s = piers[i];
      const y = c.y(s);
      if (y < 6) {
        // low: a causeway's solid wall under the whole deck to the next pier
        const q = Math.min(to, s + 26);
        for (let u = s; u < q; u += 2) K.box("stone", sec.edge * 2, c.y(u) - 2.2 + 6, 2.05, u + 1, 0, -6);
        continue;
      }
      K.box("granite", sec.edge * 2 + 2, 3, 6.5, s, 0, -6);
      K.box("stone", sec.edge * 2, y - 2.2 + 3, 4.5, s, 0, -3);
      K.box("stoneDark", sec.edge * 2 + 0.8, 0.8, 5.3, s, 0, y - 3.4);
      if (i + 1 >= piers.length) continue;
      const q = piers[i + 1];
      const span = q - s - 4.5;
      const rise = Math.min(span / 2, y - 4);
      // the arch's barrel (segments) and the spandrel walls over it on both faces
      for (let k = 0; k < 12; k++) {
        const u0 = s + 2.25 + (span * k) / 12,
          u1 = s + 2.25 + (span * (k + 1)) / 12;
        const um = (u0 + u1) / 2;
        const v = (um - (s + 2.25)) / span;
        const yA = c.y(um) - 2.2 - rise * (1 - Math.sqrt(Math.max(0, 1 - (2 * v - 1) ** 2)));
        K.box("stone", sec.edge * 2 - 0.4, 0.9, u1 - u0 + 0.05, um, 0, yA - 0.9);
        for (const sd of [-1, 1]) K.box("stone", 0.8, c.y(um) - 2.2 - yA + 0.05, u1 - u0 + 0.05, um, sd * (sec.edge - 0.6), yA);
      }
    }
  }
  // the deck's underside over the whole length
  K.ribbon("steelDark", () => -sec.edge, () => sec.edge, -2.22, 2, L - 2, 4, 2, undefined, true);

  return K.build({ ...(M as unknown as Record<string, THREE.Material>), ...S, ...cableMats(X.style.paint, M.paint) }, `crossing:${X.key}`, { noShadow: new Set(["road", "walk", "rail", "necklace", "flood", "lamp", "lantern", "red", "planks", "concrete", "curtain"]) });
}
