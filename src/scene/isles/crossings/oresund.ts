import * as THREE from "three";
import { BAY, CURB } from "../../city/plan";
import { GROUND } from "../../real/ground";
import { real } from "../../real/tex";
import type { Course } from "../course";
import { CourseKit, worldUv } from "../deckkit";
import { deckMats, drawDeck } from "./deck";
import { buildTube } from "./others";

/**
 * A bridge-tunnel (the Øresund link): a big cable-stayed bridge over the deep water, coming down onto
 * an artificial islet where the road dives into a tube under the strait, and comes up out of it on the
 * far shore. Drawn here:
 *  - the bridge: its box girder, free-standing twin concrete legs for pylons (no beam over the road,
 *    Øresund's), stays in a semi-harp from high on each leg to the deck's edges every 12 m — as many
 *    as reach the middle of the main span, the same back over the side spans — piers under the
 *    approaches, the pylons' aircraft lights and floodlights;
 *  - the tube (./others.ts), and the road up out of it on the short side;
 *  - the cover over the tube wherever its roof stands out of the water or the ground (an embankment:
 *    rock armour down its sides into the sea, grass on top), a portal building at each mouth.
 */

const WATER = BAY.water;

export function buildBridgeTunnel(c: Course): THREE.Group {
  const X = c.c;
  const [t0, t1] = X.tube ?? [0, c.length];
  const g = new THREE.Group();
  g.name = `crossing:${X.key}`;
  const tube = buildTube(c, t0, t1);
  // (the tube's walls in pale enamelled panels, a long run of them: the photographed tiles read as a chessboard at that size)
  const panel = real("Concrete034", { tint: "#f0eee6", roughness: 0.35 });
  tube.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && o.name.endsWith(":tile")) (o as THREE.Mesh).material = panel;
  });
  g.add(tube);
  // (the bridge on whichever side of the tube is the longer; the road up out of it on the other)
  const bridgeFirst = t0 > c.length - t1;
  g.add(bridge(c, bridgeFirst ? 0 : t1, bridgeFirst ? t0 : c.length));
  g.add(landing(c, bridgeFirst ? t1 : 0, bridgeFirst ? c.length : t0));
  g.add(cover(c, t0, t1));
  return g;
}

/** A frustum of a rectangle (w × d at the foot, w1 × d1 at the top) from y0 to y1, square to the course at s, `off` across. */
function leg(c: Course, s: number, off: number, y0: number, y1: number, w: number, d: number, w1: number, d1: number) {
  const g = new THREE.CylinderGeometry(Math.SQRT1_2, Math.SQRT1_2, 1, 4, 1, false, Math.PI / 4);
  const p = g.getAttribute("position");
  for (let i = 0; i < p.count; i++) {
    const t = p.getY(i) + 0.5;
    const sx = w + (w1 - w) * t,
      sz = d + (d1 - d) * t;
    p.setXYZ(i, p.getX(i) * sx, y0 + (y1 - y0) * t, p.getZ(i) * sz);
  }
  g.computeVertexNormals();
  const a = c.at(s);
  g.rotateY(Math.atan2(a.tx, a.tz));
  const [x, , z] = c.point(s, off);
  g.translate(x, 0, z);
  return worldUv(g.toNonIndexed(), 3);
}

/** The cable-stayed bridge from s0 to s1. */
function bridge(c: Course, s0: number, s1: number): THREE.Group {
  const X = c.c;
  const sec = X.section;
  const K = new CourseKit(c);
  const M = deckMats(X.style.paint);
  drawDeck(K, c, { s0: Math.max(6, s0), s1: Math.min(c.length - 6, s1), lampEvery: 32, median: [Math.max(16, s0 + 10), Math.min(c.length - 16, s1 - 10)], road: [s0, s1] });
  // the box girder under the deck (a steel trapezoid, its soffit dark), only where it stands clear
  const clear = (s: number) => c.y(s) > 2.4;
  let a = -1;
  for (let s = s0 + 2; s <= s1 - 2; s += 2) {
    const on = clear(s);
    if (on && a < 0) a = s;
    if ((!on || s + 2 > s1 - 2) && a >= 0) {
      K.sweep("paint", [[-sec.edge + 0.6, -0.1], [-sec.edge + 0.6, -1.6], [-6.5, -3.6], [6.5, -3.6], [sec.edge - 0.6, -1.6], [sec.edge - 0.6, -0.1]], () => 0, a, s, 2);
      a = -1;
    }
  }
  const pylons = (X.towers ?? []).filter((t) => t > s0 && t < s1).sort((p, q) => p - q);
  const top = X.top ?? 120;
  const plane = sec.edge + 1.8;
  const span = pylons.length > 1 ? pylons[1] - pylons[0] : 300;
  const reach = span / 2 - 8;
  const n = Math.floor(reach / 12);
  for (const t of pylons) {
    const yd = c.y(t);
    // the foundation in the water: a caisson, its ice-breaker nose
    K.box("concrete", plane * 2 + 14, 7, 22, t, 0, WATER - 5);
    K.box("concreteDark", plane * 2 + 14.4, 0.6, 22.4, t, 0, WATER - 0.2);
    // the crossbeam under the deck the girder rests on
    K.box("concrete", plane * 2 + 4, 4.2, 6, t, 0, yd - 7.6);
    // the two legs, free-standing, tapering, their faces chamfered by the light
    for (const sd of [-1, 1]) {
      K.add("concrete", leg(c, t, sd * plane, WATER + 2, top, 6.6, 9, 3.6, 5));
      // the anchorages' housing at the top (a band of a darker concrete), the aircraft lights
      K.add("concreteDark", leg(c, t, sd * plane, top - 6 - n * 3.2 - 1, top - 3, 4.6, 6.0, 3.9, 5.2));
      K.box("red", 0.7, 0.7, 0.7, t, sd * plane, top + 0.1);
      K.box("red", 0.5, 0.5, 0.5, t + 2.7, sd * plane, top * 0.62);
      // floodlights at the foot, aimed up the legs
      K.box("flood", 1.4, 0.4, 1.4, t - 5.2, sd * plane, yd + 0.4);
      K.box("flood", 1.4, 0.4, 1.4, t + 5.2, sd * plane, yd + 0.4);
    }
    // the stays: a semi-harp from the legs (3.2 m apart, highest to the farthest) to the deck's edges every 12 m, both ways
    for (const dir of [-1, 1])
      for (let k = 1; k <= n; k++) {
        const s = t + dir * (8 + k * 12);
        if (s < s0 + 6 || s > s1 - 6) break;
        const ya = top - 6 - (n - k) * 3.2 - c.y(t);
        for (const sd of [-1, 1]) {
          const A = c.point(t, sd * plane, ya);
          const B = c.point(s, sd * (sec.edge - 0.25), 0.2);
          K.bar("metal", A, B, 0.22);
          // the anchor's sleeve on the deck
          K.bar("metal", B, c.point(s - dir * 1.2, sd * (sec.edge - 0.25), 0.9), 0.36);
        }
      }
  }
  // piers under the approaches (two columns and a cap), every 40 m where the deck stands clear
  for (let s = s0 + 24; s < s1 - 10; s += 40) {
    if (pylons.some((t) => Math.abs(t - s) < 28)) continue;
    const y = c.y(s);
    if (y < 3.0) continue;
    const foot = WATER - 3;
    for (const x of [-5.2, 5.2]) K.add("concrete", leg(c, s, x, foot, y - 3.6, 2.6, 2.6, 2.2, 2.2));
    K.box("concrete", 15, 1.4, 3.2, s, 0, y - 3.8);
  }
  return K.build({ ...(M as unknown as Record<string, THREE.Material>) }, `crossing:${X.key}:stayed`, { noShadow: new Set(["road", "walk", "rail", "lamp", "red", "flood"]) });
}

/** The road from s0 to s1 where no bridge carries it: up out of the tube's cutting onto the far shore. */
function landing(c: Course, s0: number, s1: number): THREE.Group {
  const X = c.c;
  const K = new CourseKit(c);
  const M = deckMats(X.style.paint);
  drawDeck(K, c, { s0: Math.max(6, s0), s1: Math.min(c.length - 6, s1), lampEvery: 24, median: [s0 + 2, Math.min(c.length - 14, s1 - 10)], road: [s0, s1] });
  return K.build(M as unknown as Record<string, THREE.Material>, `crossing:${X.key}:landing`, { noShadow: new Set(["road", "walk", "rail", "lamp"]) });
}

/**
 * Over the tube where its roof stands above the water or the ground near each portal: an embankment
 * (grass on its crown, rock armour down its sides to the sea floor), and a portal building at each
 * mouth — a deep concrete hood over it, the link's name in lit letters.
 */
function cover(c: Course, t0: number, t1: number): THREE.Group {
  const X = c.c;
  const sec = X.section;
  const half = sec.road + 2.2 + 0.8;
  const K = new CourseKit(c);
  const roof = (s: number) => c.y(s) + 6.4 + 0.8;
  const out = new THREE.Group();
  out.name = `crossing:${X.key}:cover`;
  // the stretches where the roof stands out (over the water's level), from each portal inward
  const stretch = (from: number, dir: 1 | -1) => {
    let s = from;
    while (s > t0 && s < t1 && roof(s) > WATER + 0.4) s += dir * 0.5;
    return dir > 0 ? [from, s] : [s, from];
  };
  const parts = [stretch(t0, 1), stretch(t1, -1)];
  const pos: number[] = [],
    uv: number[] = [];
  const grass: number[] = [],
    guv: number[] = [];
  const BED = -6.5;
  for (const [a, b] of parts) {
    if (b - a < 1) continue;
    const step = 1;
    // (the cross-section at s: the crown over the roof, the slopes down past the water to the bed)
    const ring = (s: number): [number, number][] => {
      const r = roof(s) + 0.5;
      const slope = 1.6;
      const w = (r - BED) * slope;
      return [
        [-half - 1.5 - w, BED],
        [-half - 1.5, r],
        [half + 1.5, r],
        [half + 1.5 + w, BED],
      ];
    };
    for (let s = a; s < b; s += step) {
      const q = Math.min(b, s + step);
      const A = ring(s),
        B = ring(q);
      for (let k = 0; k < 3; k++) {
        const p0 = c.point(s, A[k][0], A[k][1] - c.y(s)),
          p1 = c.point(s, A[k + 1][0], A[k + 1][1] - c.y(s)),
          p2 = c.point(q, B[k + 1][0], B[k + 1][1] - c.y(q)),
          p3 = c.point(q, B[k][0], B[k][1] - c.y(q));
        const dst = k === 1 ? grass : pos;
        const tuv = k === 1 ? guv : uv;
        for (const [p, u, v] of [
          [p0, s, A[k][0]],
          [p1, s, A[k + 1][0]],
          [p2, q, B[k + 1][0]],
          [p0, s, A[k][0]],
          [p2, q, B[k + 1][0]],
          [p3, q, B[k][0]],
        ] as [number[], number, number][]) {
          dst.push(p[0], p[1], p[2]);
          tuv.push(u / 4, (v + (k === 0 ? p[1] : -p[1])) / 4);
        }
      }
    }
  }
  const mk = (p: number[], t: number[], m: THREE.Material, name: string) => {
    if (!p.length) return;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(t, 2));
    geo.computeVertexNormals();
    geo.computeBoundingBox();
    const ctr = geo.boundingBox!.getCenter(new THREE.Vector3());
    geo.translate(-ctr.x, -ctr.y, -ctr.z);
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.copy(ctr);
    mesh.receiveShadow = true;
    mesh.name = name;
    out.add(mesh);
  };
  mk(pos, uv, real("Rock030", { tint: "#a9a49a", roughness: 1 }), `crossing:${X.key}:armour`);
  mk(grass, guv, GROUND.lawn(), `crossing:${X.key}:crown`);
  // the portal buildings: a deep hood over each mouth, its wing walls, the name over the mouth
  const M = deckMats(X.style.paint);
  for (const [s, dir] of [
    [t0, 1],
    [t1, -1],
  ] as const) {
    const y = c.y(s);
    const r = roof(s);
    // (the hood reaches out 10 m from the mouth; its top level with the embankment's crown)
    for (let k = 0; k < 10; k += 2) K.box("concrete", half * 2 + 3, 1.2, 2.05, s - dir * (k + 1), 0, r - 0.4);
    for (const sd of [-1, 1]) K.box("concrete", 2.4, r - y + 0.8, 10.4, s - dir * 5, sd * (half + 0.3), y - 0.4);
    // the face: a slab over the mouth, a band of light under its lip
    K.box("concreteDark", half * 2 + 3.4, 2.8, 0.8, s - dir * 10.2, 0, r - 2.0);
    K.box("tubeLight", half * 2 - 1, 0.25, 0.9, s - dir * 10.3, 0, y + 6.6);
    // the control building on the crown beside it
    const rb = roof(s + dir * 12) + 0.4;
    K.box("concrete", 9, 5, 14, s + dir * 12, -(half - 3), rb);
    K.box("tubeLight", 9.1, 0.8, 10, s + dir * 12, -(half - 3), rb + 2.2);
    void CURB;
  }
  out.add(K.build(M as unknown as Record<string, THREE.Material>, `crossing:${X.key}:portals`, { noShadow: new Set(["tubeLight"]) }));
  return out;
}
