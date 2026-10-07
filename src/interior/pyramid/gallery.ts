import * as THREE from "three";
import { place } from "../furniture";
import { glowMat, textPlane } from "../kit";
import { bake, Geo } from "./geo";
import type { PyramidKit } from "./kit";
import { brazier, jar, mummy } from "./models";

/**
 * Level 1: the GRAND GALLERY. A 42 m ramp climbing 14 m, its walls rising straight from the side
 * benches then stepping in, course after course, seven corbels to a narrow roof 9.5 m up; a wooden
 * boardwalk with cleats and handrails up the middle, torches on the walls, carvings between them.
 * It is modelled level and sheared up the slope, so every course runs parallel to the floor as in
 * the real one. The walker's eye follows the ramp.
 */

export const ZA = -3,
  ZB = -45,
  RISE = 14;
const SLOPE = RISE / (ZA - ZB);
const W = 1.05,
  B = 1.6,
  BH = 0.6,
  WH = 2.9,
  CH = 0.95,
  STEP = 0.09,
  NC = 7;
const TOP = WH + CH * NC;
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Height of the ramp above the level's floor at z. */
export const rampY = (z: number) => (z >= ZA ? 0 : z <= ZB ? RISE : (ZA - z) * SLOPE);

export function gallery(k: PyramidKit) {
  const f = 1;
  const Y = k.y(f);
  const g = k.groups[f];
  const rects = k.rects[f];
  const shear = new THREE.Matrix4().set(1, 0, 0, 0, 0, 1, -SLOPE, SLOPE * ZA, 0, 0, 1, 0, 0, 0, 0, 1);

  const sw = new Geo(2),
    sf = new Geo(2),
    swood = new Geo(1),
    sglow = new Geo(1),
    spanel = new Geo(1);
  const fw = new Geo(2),
    ff = new Geo(2),
    fwood = new Geo(1),
    fceil = new Geo(2),
    fpanel = new Geo(1),
    recess = new Geo(2);

  /** The cross-section (benches, walls, corbels, roof) from z0 to z1 into `w`. */
  const section = (w: Geo, z0: number, z1: number, benches: boolean) => {
    for (const s of [-1, 1]) {
      const lo = (a: number, b: number) => (s < 0 ? -b : a);
      const hi = (a: number, b: number) => (s < 0 ? -a : b);
      if (benches) w.box(lo(W, B), Y, z0, hi(W, B), Y + BH, z1, ["bottom", s < 0 ? "nx" : "px"]);
      w.box(lo(B, B + 0.5), Y, z0, hi(B, B + 0.5), Y + WH, z1, ["bottom", "top", s < 0 ? "nx" : "px"]);
      for (let i = 0; i < NC; i++) {
        const inner = B - STEP * (i + 1);
        w.box(lo(inner, B + 0.5), Y + WH + CH * i, z0, hi(inner, B + 0.5), Y + WH + CH * (i + 1), z1, ["top", s < 0 ? "nx" : "px"]);
      }
    }
    const rw = B - STEP * NC;
    w.box(-rw, Y + TOP, z0, rw, Y + TOP + 0.4, z1, ["top"]);
  };

  // ---- the sloping gallery (built level, sheared)
  section(sw, ZB, ZA, true);
  sf.flat(-W, ZB, W, ZA, Y);
  // the boardwalk: boards, cleats, handrails on posts, a warm strip along each bench
  swood.box(-0.95, Y, ZB, 0.95, Y + 0.12, ZA, ["bottom"]);
  for (let z = ZA - 0.3; z > ZB; z -= 0.48) swood.box(-0.9, Y + 0.12, z - 0.05, 0.9, Y + 0.16, z, ["bottom"]);
  for (const s of [-1, 1]) {
    for (let z = ZA - 0.5; z > ZB; z -= 2.1) swood.box(s * 0.98 - 0.03, Y + 0.12, z - 0.06, s * 0.98 + 0.03, Y + 1.05, z, ["bottom"]);
    swood.box(s * 0.98 - 0.035, Y + 1.0, ZB, s * 0.98 + 0.035, Y + 1.07, ZA, []);
    sglow.box(s * (W + 0.01) - 0.02, Y + BH - 0.02, ZB, s * (W + 0.01) + 0.02, Y + BH + 0.01, ZA, ["bottom"]);
  }

  // ---- the two landings, level
  section(fw, ZA, 1.2, false);
  section(fw, ZB - 4, ZB, false);
  ff.flat(-B, ZA, B, 1.2, Y);
  ff.flat(-B, ZB - 4, B, ZB, Y + RISE);
  fwood.box(-B, Y, ZA, B, Y + 0.12, 0.8, ["bottom"]);
  fwood.box(-B, Y + RISE, ZB - 4, B, Y + RISE + 0.12, ZB, ["bottom"]);
  // end walls with their low doorways
  const endWall = (z: number, y: number, facing: 1 | -1) => {
    const t = 0.5 * -facing;
    fw.box(-B, y, Math.min(z, z + t), -0.6, y + TOP + 0.4, Math.max(z, z + t), []);
    fw.box(0.6, y, Math.min(z, z + t), B, y + TOP + 0.4, Math.max(z, z + t), []);
    fw.box(-0.6, y + 1.9, Math.min(z, z + t), 0.6, y + TOP + 0.4, Math.max(z, z + t), []);
    // a short dark recess behind
    recess.box(-1.1, y, Math.min(z + t, z + t * 4), -0.6, y + 2.2, Math.max(z + t, z + t * 4), []);
    recess.box(0.6, y, Math.min(z + t, z + t * 4), 1.1, y + 2.2, Math.max(z + t, z + t * 4), []);
    recess.box(-0.6, y + 1.9, Math.min(z + t, z + t * 4), 0.6, y + 2.2, Math.max(z + t, z + t * 4), []);
    recess.box(-0.6, y, Math.min(z + t * 4, z + t * 5), 0.6, y + 2.2, Math.max(z + t * 4, z + t * 5), []);
    recess.flat(-0.6, Math.min(z, z + t * 4), 0.6, Math.max(z, z + t * 4), y + 0.01);
    rects.push([-B, Math.min(z, z + t) - 0.05, B, Math.max(z, z + t)]);
  };
  endWall(1.2, Y, -1);
  endWall(ZB - 4, Y + RISE, 1);

  // colliders: landing walls, the benches either side of the boardwalk
  rects.push([-B - 0.5, ZB - 4, -B, 1.2], [B, ZB - 4, B + 0.5, 1.2], [-B, ZB, -W, ZA], [W, ZB, B, ZA]);

  // ---- torches up both walls, carvings between them
  for (let i = 0; i < 7; i++) {
    const z = ZA - 3 - i * 6;
    const s = i % 2 ? 1 : -1;
    k.torch(f, V(s * B, Y + rampY(z) + BH + 0.9, z), V(-s, 0, 0), -1, 7.5);
    // panels (level coordinates: the shear puts them on the slope)
    for (const side of [-1, 1]) {
      const pz = z + (side === s ? -3 : 0) - 1.5;
      if (pz > ZB + 1 && pz < ZA - 1) k.panelOn(spanel, (i * 3 + (side > 0 ? 1 : 0)) % 8, V(side * B, Y + BH + 0.35, pz), V(-side, 0, 0), 0.8, 1.6);
    }
  }
  for (const s of [-1, 1]) {
    k.torch(f, V(s * B, Y + 1.5, -0.4), V(-s, 0, 0), -1, 6);
    k.torch(f, V(s * B, Y + RISE + 1.5, ZB - 2.4), V(-s, 0, 0), -1, 6);
    k.panelOn(fpanel, s < 0 ? 6 : 1, V(s * B, Y + 0.3, ZA + 1.6), V(-s, 0, 0), 0.9, 1.8);
    place(g, "pyr-brazier", brazier, s * 1.1, Y + RISE + 0.12, ZB - 0.9, 0);
    k.glow(f, V(s * 1.1, Y + RISE + 1.3, ZB - 0.9), new THREE.Color(1.9, 0.9, 0.35), 9);
  }
  rects.push([-1.5, ZB - 1.3, -0.7, ZB - 0.5], [0.7, ZB - 1.3, 1.5, ZB - 0.5]);
  place(g, "pyr-jar1", () => jar(1, true), -1.25, Y + RISE + 0.12, ZB - 3.4, 0.5);
  rects.push([-1.6, ZB - 3.8, -0.9, ZB - 3.0]);

  // ---- doors
  const door = (z: number, y: number, to: number, label: string, rot: number, hover: string) => {
    const d = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.9), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
    d.position.set(0, y + 0.95, z);
    d.rotation.y = rot;
    g.add(d);
    k.pick(f, d, hover, () => ({ eyebrow: "Passage", title: label.replace(/^[▲▼] /, ""), floor: to }));
    const t = textPlane(label, { h: 0.22, glow: true, color: "#f4b728" });
    t.position.set(0, y + 2.25, z);
    t.rotation.y = rot;
    g.add(t);
    const sill = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.05), glowMat("#ffb050", 1.3));
    sill.rotation.x = -Math.PI / 2;
    sill.position.set(0, y + 0.13, z + (rot ? 0.1 : -0.1));
    g.add(sill);
  };
  door(0.75, Y, 0, "▼ LABYRINTH", Math.PI, "<b>▼ Labyrinth</b><span>back down</span>");
  door(ZB - 3.95, Y + RISE, 2, "▲ KING'S CHAMBER", 0, "<b>▲ King's Chamber</b><span>the treasure</span>");

  // ---- people
  const Z1 = -18;
  void k.person(f, 9001, [0.45, Z1], "Explorer", { y: Y + rampY(Z1) + 0.12, face: V(0, 0, 1) });
  void k.person(f, 3333, [-1.05, ZB - 1.7], "Archaeologist", { y: Y + RISE + 0.12, face: V(0.5, 0, 1).normalize() });
  const mm = place(g, "pyr-mummy", () => mummy(), 1.2, Y + RISE + 0.12, ZB - 3.4, -0.5);
  rects.push([0.8, ZB - 3.7, 1.6, ZB - 2.9]);
  k.pick(f, mm, "<b>Mummy</b><span>guarding the way</span>", () => null);

  // ---- bake and build
  const light = bake(k.torches[f], new THREE.Color(0.14, 0.1, 0.075));
  k.add(f, sw, k.stone, light, shear);
  k.add(f, sf, k.floor, light, shear);
  k.add(f, swood, k.wood, light, shear);
  k.add(f, spanel, k.panel, light, shear);
  const strip = sglow.mesh(glowMat("#ffab4a", 1.5), undefined, shear);
  g.add(strip);
  k.add(f, fw, k.stone, light);
  k.add(f, ff, k.floor, light);
  k.add(f, fwood, k.wood, light);
  k.add(f, fceil, k.ceiling, light);
  k.add(f, fpanel, k.panel, light);
  // the passages beyond the doors fall into darkness
  const dim = new THREE.Color(0.05, 0.035, 0.025);
  k.add(f, recess, k.stoneDark, (p, n) => {
    const d = Math.min(Math.abs(p.z - 1.2), Math.abs(p.z - (ZB - 4)));
    return dim.clone().addScalar(Math.max(0, 0.5 - d * 0.35));
  });
  k.lightUp(f);
}
