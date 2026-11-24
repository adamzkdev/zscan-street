import * as THREE from "three";
import { add, glass, gloss, lamp, matte, object, rbox, steel, type Parts } from "./boats";

/**
 * The sky's traffic, realistic (branch gta-real): the news and tour helicopters, the airliners on
 * their approach (built at a third of their size, drawn ×3 like the voxel ones), the delivery drones
 * and their parcels. Smooth lathed fuselages and nacelles, swept wings, glass, lamps. In the frames
 * the voxel models had (centred on x and z, standing on y = 0, front +x) so the rotors' hubs, the
 * lights and the parcels' hooks stay where src/scene/alive/air.ts puts them.
 */

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** A body of revolution along x: radius r(t) for t 0 (tail) … 1 (nose), from x0 to x1, its axis at (y, z). */
function lathe(x0: number, x1: number, y: number, z: number, r: (t: number) => number, seg = 18, rings = 16, sy = 1) {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= rings; i++) {
    const t = i / rings;
    pts.push(new THREE.Vector2(Math.max(0.001, r(t)), x0 + (x1 - x0) * t));
  }
  // (the lathe turns round y: laid along x afterwards; sy squashes it upright)
  return new THREE.LatheGeometry(pts, seg).rotateZ(-Math.PI / 2).scale(1, sy, 1).translate(0, y, z);
}

/** A thin swept plate (a wing, a fin): a polygon in its own plane, `t` thick. */
function plate(pts: [number, number][], t: number) {
  const sh = new THREE.Shape(pts.map(([a, b]) => new THREE.Vector2(a, b)));
  return new THREE.ExtrudeGeometry(sh, { depth: t, bevelEnabled: true, bevelThickness: t * 0.4, bevelSize: t * 0.5, bevelSegments: 2, curveSegments: 4 }).translate(0, 0, -t / 2);
}

function tube(a: THREE.Vector3, b: THREE.Vector3, r: number) {
  const len = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(r, r, len, 8).translate(0, len / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()));
  return g.translate(a.x, a.y, a.z);
}

/** A helicopter (about 9.7 m nose to tail fin; the rotors are drawn apart at the mast (1.67, 3.37, 0) and the tail (−4.5, 2.58, 0.32)). */
export function realHeli(body: string, accent: string) {
  return object(`heli:${body}:${accent}`, () => {
    const parts: Parts = new Map();
    // the cabin: a teardrop from the boom's root to the nose
    add(parts, gloss(body), lathe(-0.7, 4.3, 1.55, 0, (t) => 0.95 * Math.pow(Math.sin(Math.PI * (0.1 + 0.85 * t)), 0.55) * (t < 0.15 ? 0.5 + t * 3.3 : 1), 22, 18, 1.12));
    // the stripe along it
    add(parts, gloss(accent), lathe(-0.5, 4.0, 1.1, 0, (t) => 0.99 * Math.pow(Math.sin(Math.PI * (0.12 + 0.8 * t)), 0.55), 22, 12, 0.18));
    // the canopy: a glass bubble over the nose, the side windows
    const can = new THREE.SphereGeometry(1, 20, 14, -Math.PI / 2, Math.PI, 0, Math.PI * 0.55).scale(1.25, 0.85, 0.92).rotateY(-Math.PI / 2).translate(3.0, 1.85, 0);
    add(parts, glass(), can);
    for (const s of [-1, 1]) add(parts, glass(), rbox(1.9, 0.6, 0.03, 0.1, 1.2, 1.6, s * 0.97));
    // the engine housing on the roof, the mast
    add(parts, gloss(body), rbox(2.6, 0.45, 1.0, 0.2, 1.2, 2.55, 0));
    add(parts, matte("#1e1d24", 0.5), new THREE.CylinderGeometry(0.12, 0.16, 0.42, 10).translate(1.67, 3.1, 0));
    // the tail boom, the fin, the stabiliser
    add(parts, gloss(body), lathe(-4.8, -0.4, 1.95, 0, (t) => 0.13 + 0.17 * t, 12, 6));
    add(parts, gloss(accent), plate([[-4.9, 1.7], [-4.2, 1.8], [-4.35, 3.15], [-4.85, 3.2]], 0.08).translate(0, 0, 0));
    add(parts, gloss(body), plate([[-3.9, -1.0], [-3.4, -1.0], [-3.3, 1.0], [-3.9, 1.0]], 0.06).rotateX(Math.PI / 2).translate(0, 1.95, 0));
    // the skids
    const dark = matte("#1e1d24", 0.45);
    for (const s of [-1, 1]) {
      add(parts, dark, tube(V(-0.6, 0.08, s * 0.95), V(3.4, 0.08, s * 0.95), 0.06));
      add(parts, dark, tube(V(3.4, 0.08, s * 0.95), V(3.75, 0.35, s * 0.95), 0.06));
      for (const x of [0.4, 2.5]) add(parts, dark, tube(V(x, 0.08, s * 0.95), V(x + 0.1, 0.95, s * 0.6), 0.045));
    }
    add(parts, lamp("#fff6e0", 2.4), new THREE.SphereGeometry(0.1, 10, 8).translate(4.2, 0.95, 0));
    return parts;
  });
}

/** An airliner at a third of its size (about 14 m here, 42 m drawn): its centre-line 1.67 m up, wings ±6 m. */
export function realPlane() {
  return object("plane", () => {
    const parts: Parts = new Map();
    const y = 1.67;
    add(parts, gloss("#f2f2f6"), lathe(-7, 6.9, y, 0, (t) => 0.68 * (t < 0.1 ? 0.35 + t * 6.5 : t > 0.88 ? Math.sqrt(Math.max(0, 1 - ((t - 0.88) / 0.12) ** 2)) * 0.95 + 0.05 : 1), 22, 22));
    // the gold cheatline, the belly in grey
    add(parts, gloss("#f4b728"), lathe(-6.2, 6.2, y + 0.02, 0, () => 0.685, 22, 2, 0.12));
    add(parts, gloss("#c8ccd6"), lathe(-6.2, 6.0, y - 0.32, 0, () => 0.62, 22, 2, 0.4));
    // the windows (lit), the cockpit's glass
    for (const s of [-1, 1]) for (let x = -5; x < 5.6; x += 0.5) add(parts, lamp("#ffe6b0", 1.2), new THREE.CircleGeometry(0.06, 8).rotateY(s > 0 ? 0 : Math.PI).translate(x, y + 0.2, s * 0.672));
    add(parts, glass(), new THREE.SphereGeometry(0.5, 14, 8, -0.8, 1.6, 0.8, 0.7).rotateY(Math.PI / 2).translate(6.35, y + 0.05, 0));
    // the wings, swept, a little dihedral; their lamps
    for (const s of [-1, 1]) {
      const w = plate([[2.6, 0], [0.2, 0], [-2.0, 6.0 * s], [-1.1, 6.0 * s]], 0.12).rotateX(Math.PI / 2).rotateX(s * -0.06).translate(0, y - 0.3, 0);
      add(parts, gloss("#f2f2f6"), w);
      add(parts, gloss("#f2f2f6"), plate([[-1.6, 0], [-1.1, 0], [-1.25, 0.45], [-1.6, 0.45]], 0.05).translate(0, y - 0.05, s * 5.95));
      add(parts, lamp(s > 0 ? "#2aff5a" : "#ff2a1a", 3), new THREE.SphereGeometry(0.08, 8, 6).translate(-1.5, y - 0.1, s * 6.05));
      // the engine under each wing
      add(parts, gloss("#c8ccd6"), lathe(-0.2, 1.8, y - 0.95, s * 2.1, (t) => 0.38 * (0.75 + 0.25 * Math.sin(Math.PI * t)), 16, 8));
      add(parts, matte("#2a2a34", 0.4), new THREE.CircleGeometry(0.3, 16).rotateY(Math.PI / 2).translate(1.81, y - 0.95, s * 2.1));
      add(parts, gloss("#f2f2f6"), rbox(0.9, 0.5, 0.12, 0.04, 0.5, y - 0.65, s * 2.1));
    }
    // the tail: the fin in gold, the stabilisers
    add(parts, gloss("#f4b728"), plate([[-7.0, y + 0.3], [-5.2, y + 0.3], [-6.4, y + 2.9], [-7.2, y + 2.9]], 0.14));
    for (const s of [-1, 1]) add(parts, gloss("#f2f2f6"), plate([[-5.6, 0], [-6.8, 0], [-7.3, 2.0 * s], [-6.7, 2.0 * s]], 0.08).rotateX(Math.PI / 2).translate(0, y + 0.25, 0));
    return parts;
  });
}

/** A delivery quadcopter, about 1.3 m across, its parcel hook under the middle. */
export function realDrone() {
  return object("drone", () => {
    const parts: Parts = new Map();
    const dark = matte("#26252e", 0.4);
    add(parts, dark, rbox(0.62, 0.18, 0.62, 0.08, 0, 0.18, 0));
    add(parts, gloss("#f4b728"), rbox(0.3, 0.1, 0.3, 0.04, 0, 0.36, 0));
    for (const [x, z] of [
      [0.5, 0.5],
      [-0.5, 0.5],
      [0.5, -0.5],
      [-0.5, -0.5],
    ]) {
      add(parts, dark, tube(V(0, 0.28, 0), V(x, 0.3, z), 0.03));
      add(parts, dark, new THREE.CylinderGeometry(0.05, 0.05, 0.1, 10).translate(x, 0.34, z));
      add(parts, matte("#8a8898", 0.3), new THREE.CylinderGeometry(0.26, 0.26, 0.012, 20).translate(x, 0.4, z));
    }
    add(parts, lamp("#3ef0ff", 2), new THREE.SphereGeometry(0.04, 8, 6).translate(0.33, 0.2, 0));
    add(parts, steel(), tube(V(0, 0.1, 0), V(0, 0.0, 0), 0.01));
    return parts;
  });
}

/** The parcel: a gold box with its dark strap. */
export function realParcel() {
  return object("parcel", () => {
    const parts: Parts = new Map();
    add(parts, gloss("#f4b728"), rbox(0.5, 0.5, 0.5, 0.04, 0, 0, 0));
    add(parts, matte("#7a5208", 0.6), rbox(0.14, 0.52, 0.52, 0.02, 0, -0.01, 0));
    return parts;
  });
}
