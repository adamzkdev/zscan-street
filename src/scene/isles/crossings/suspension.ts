import * as THREE from "three";
import type { Course } from "../course";
import { CourseKit } from "../deckkit";
import { cableMats, curtain } from "./cables";
import { deckMats, drawDeck } from "./deck";

/**
 * A suspension bridge on a crossing's course (the Rainbow Bridge's way): two towers of square legs
 * joined by portal beams, standing on footings in the water; the main cables in catenary from the
 * anchorages over the towers' saddles; hangers down to the deck's edge; under the long spans a deep
 * stiffening truss carrying a lower deck (a light-rail guideway); off the ends approach viaducts on
 * piers. Night: the floodlit towers, the deck's lamps, and a necklace of lights along the cables —
 * white, or the colours of the rainbow (`style.night`).
 */

export function buildSuspension(c: Course): THREE.Group {
  const X = c.c;
  const sec = X.section;
  const [t1, t2] = X.towers ?? [c.length * 0.3, c.length * 0.7];
  const [a1, a2] = X.anchors ?? [t1 - 60, t2 + 60];
  const top = X.top ?? 90;
  const L = c.length;
  const K = new CourseKit(c);
  const M = deckMats(X.style.paint);

  // ---- the deck ----
  drawDeck(K, c, { s0: 6, s1: L - 6, lampEvery: 32, median: [16, L - 16] });

  // ---- the cables' line ----
  /** The towers' stoutness (their legs and beams in proportion to their height). */
  const k = Math.max(1, top / 98);
  /** The legs' and the cables' plane, off the centre line (stouter legs stand further out, clear of the deck). */
  const plane = sec.edge + 1.8 + 1.5 * (k - 1);
  const saddle = top - 2;
  const mid = (t1 + t2) / 2;
  const low = c.y(mid) + 2.6;
  const yA1 = c.y(a1) + 2.6,
    yA2 = c.y(a2) + 2.6;
  const cableY = (s: number) => {
    if (s >= t1 && s <= t2) {
      const u = (s - mid) / ((t2 - t1) / 2);
      return low + (saddle - low) * u * u;
    }
    const [sa, ya, st] = s < t1 ? [a1, yA1, t1] : [a2, yA2, t2];
    const t = (s - sa) / (st - sa);
    if (t < 0 || t > 1) return -1;
    return ya + (saddle - ya) * t - 4.5 * 4 * t * (1 - t);
  };

  // ---- the towers ----
  // (their legs and beams in proportion to their height, k: the Rainbow Bridge's 130 m towers stand
  // on legs a third stouter than a 98 m tower's)
  for (const t of [t1, t2]) {
    const yd = c.y(t);
    // the footing in the water, and the legs (wider below the deck), their grooves
    K.box("concrete", plane * 2 + 12 * k, 6.4, 16 * k, t, 0, -7.2);
    for (const sd of [-1, 1]) {
      K.box("paint", 3.8 * k, yd - 2 + 1.2, 6.4 * k, t, sd * plane, -1.2);
      K.box("paint", 3.0 * k, top - (yd - 2), 5.2 * k, t, sd * plane, yd - 2);
      for (const g of [-1.2, 1.2]) K.box("steelDark", 0.35, top - yd - 14, 0.2, t + g * k, sd * plane, yd + 4);
      // the lantern on top, its red light
      K.box("paint", 2.4 * k, 2.2, 4.4 * k, t, sd * plane, top);
      K.box("red", 0.5, 0.5, 0.5, t, sd * plane, top + 2.2);
    }
    // portal beams: under the deck, at mid-height (two on a tall tower), and the deep crown with its square window
    const span = plane * 2 + 3.0 * k;
    K.box("paint", span, 2.8 * k, 4.6 * k, t, 0, yd - 5.2);
    const ym = (yd + top) / 2;
    if (top - yd > 80) {
      K.box("paint", span, 3.4 * k, 4.2 * k, t, 0, yd + (top - yd) * 0.36 - 1.7);
      K.box("paint", span, 3.4 * k, 4.2 * k, t, 0, yd + (top - yd) * 0.66 - 1.7);
    } else K.box("paint", span, 3.4, 4.2, t, 0, ym - 1.7);
    K.box("paint", span, 2.2 * k, 4.2 * k, t, 0, top - 9 * k);
    K.box("paint", span, 2.6 * k, 4.2 * k, t, 0, top - 2.6 * k);
    for (const x of [-4.2, 4.2]) K.box("paint", 1.6 * k, 4.6 * k, 4.2 * k, t, x * k, top - 6.8 * k);
    // its floodlights: strips on both faces of the crown and up the legs' inner faces
    for (const f of [-1, 1]) {
      K.box("flood", span - 1, 0.25, 0.06, t + f * (2.14 * k), 0, top - 2.9 * k);
      K.box("flood", span - 1, 0.25, 0.06, t + f * (2.14 * k), 0, top - 8.8 * k);
      for (const sd of [-1, 1]) K.box("flood", 0.25, top - yd - 12, 0.06, t + f * (2.64 * k), sd * (plane - 1.0 * k), yd + 3);
    }
    // the saddles
    for (const sd of [-1, 1]) K.box("steelDark", 1.6 * k, 1.4 * k, 3.2 * k, t, sd * plane, saddle - 0.4);
  }

  // ---- the anchorages: a block under the deck, the cable houses either side ----
  for (const a of [a1, a2]) {
    const ya = c.y(a);
    K.box("concrete", sec.edge * 2 - 1, ya - 2.4 + 7, 20, a, 0, -7);
    for (const sd of [-1, 1]) {
      K.box("concrete", 4.2, ya + 4.6 + 7, 16, a, sd * (sec.edge + 2.4), -7);
      K.box("concreteDark", 4.4, 0.6, 16.2, a, sd * (sec.edge + 2.4), ya + 4.6);
    }
  }

  // ---- the main cables, their hangers, the necklace of lights ----
  const necklace: number[] = [],
    neckCol: number[] = [];
  const col = new THREE.Color();
  for (const sd of [-1, 1]) {
    const pts: [number, number, number][] = [];
    for (let s = a1; s <= a2 + 0.01; s += 3) pts.push(c.point(s, sd * plane, cableY(s) - c.y(s)) as [number, number, number]);
    K.tube("paint", pts, 0.42, 8);
    for (let s = a1 + 6; s < a2 - 5; s += 8) {
      if (Math.abs(s - t1) < 5 || Math.abs(s - t2) < 5) continue;
      const cy = cableY(s);
      if (cy < c.y(s) + 1.5) continue;
      K.bar("hanger", c.point(s, sd * plane, cy - c.y(s)), c.point(s, sd * (sec.edge - 0.25), 0.3), 0.12);
    }
    // (and far away: their veil, src/scene/isles/crossings/cables.ts)
    curtain(K, c, "curtain", sd * (sec.edge - 0.25), a1 + 2, a2 - 2, 0.3, cableY, 8, a1 + 6, (s) => Math.abs(s - t1) < 4 || Math.abs(s - t2) < 4, sd * plane);
    // the lights along the cables (colour by the way along: the rainbow, or white)
    for (let s = a1 + 2; s < a2 - 2; s += 4.5) {
      const p = c.point(s, sd * plane, cableY(s) - c.y(s) + 0.5);
      const h = (s - a1) / (a2 - a1);
      if (X.style.night === "rainbow") col.setHSL(h * 0.83, 1, 0.55);
      else if (X.style.night === "gold") col.set("#ffc46a");
      else col.set("#fff6e8");
      const r = 0.22;
      const g = new THREE.BoxGeometry(r * 2, r * 2, r * 2).translate(p[0], p[1], p[2]);
      const ng = g.toNonIndexed();
      const n = ng.getAttribute("position").count;
      const cc = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) cc.set([col.r, col.g, col.b], i * 3);
      ng.setAttribute("color", new THREE.BufferAttribute(cc, 3));
      necklace.push(n);
      neckCol.push(0);
      K.add("necklace", ng);
    }
  }

  // ---- the stiffening truss and the lower deck, wherever the deck stands high ----
  const D = 7.2;
  let s0 = -1,
    s1 = -1;
  for (let s = 0; s <= L; s += 1) {
    if (c.y(s) > D + 2.5) {
      if (s0 < 0) s0 = s;
      s1 = s;
    }
  }
  if (s0 >= 0) {
    for (const sd of [-1, 1]) {
      const off = sd * (sec.edge - 0.4);
      const at = () => off;
      K.sweep("paint", [[-0.35, -D], [0.35, -D], [0.35, -D + 0.7], [-0.35, -D + 0.7], [-0.35, -D]], at, s0, s1, 2);
      let k = 0;
      for (let s = s0; s + 9 <= s1; s += 9, k++) {
        K.bar("paint", c.point(s, off, -1.8), c.point(s, off, -D + 0.3), 0.42);
        if (k % 2) K.bar("paint", c.point(s, off, -1.8), c.point(s + 9, off, -D + 0.3), 0.36);
        else K.bar("paint", c.point(s, off, -D + 0.3), c.point(s + 9, off, -1.8), 0.36);
      }
    }
    // the lower deck: the light rail's guideway, its two rails
    K.ribbon("concrete", () => -4.6, () => 4.6, -D + 0.75, s0, s1, 3, 2, undefined, false);
    K.ribbon("concrete", () => -4.6, () => 4.6, -D + 0.45, s0, s1, 3, 2, undefined, true);
    for (const x of [-2.2, 2.2]) K.sweep("metal", [[-0.08, 0], [-0.08, 0.16], [0.08, 0.16], [0.08, 0]], () => x, s0, s1, 2);
    // floor beams across, every 9 m
    for (let s = s0; s <= s1; s += 9) K.box("steelDark", sec.edge * 2 - 1, 0.6, 0.5, s, 0, c.y(s) - D + 0.1);
  }

  // ---- the approach viaducts: a box girder on piers ----
  for (const [from, to] of [
    [4, s0 < 0 ? L - 4 : s0 + 2],
    [s1 < 0 ? L : s1 - 2, L - 4],
  ] as const) {
    if (to <= from) continue;
    K.sweep("concrete", [[-sec.edge + 0.8, -1.8], [-5.5, -3.4], [5.5, -3.4], [sec.edge - 0.8, -1.8]], () => 0, from, to, 2);
    for (let s = from + 14; s < to - 6; s += 30) {
      const y = c.y(s);
      if (y < 3.2) continue;
      for (const x of [-4.2, 4.2]) K.box("concrete", 1.9, y - 3.4 + 8, 1.9, s, x, -8);
      K.box("concrete", 13.5, 1.5, 2.6, s, 0, y - 4.9);
    }
  }
  // the girder's soffit over the whole length (the deck's underside)
  K.ribbon("steelDark", () => -sec.edge, () => sec.edge, -1.82, 2, L - 2, 4, 2, undefined, true);

  return K.build({ ...(M as unknown as Record<string, THREE.Material>), ...cableMats(X.style.paint, M.paint) }, `crossing:${X.key}`, { noShadow: new Set(["road", "walk", "rail", "necklace", "flood", "lamp", "red", "curtain"]) });
}
