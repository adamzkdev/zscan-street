import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/**
 * Boats of the Palm: a jet ski, a day speedboat, and motor yachts (an extruded hull with a pointed
 * bow, a gold sheer line, tiers of tinted glass, a flybridge, a teak swim platform).
 * Each is a small group of meshes sharing materials; origin at the waterline, bow towards +z.
 */

const M = {
  white: new THREE.MeshStandardMaterial({ color: "#f6f6f2", roughness: 0.25, metalness: 0.05 }),
  tint: new THREE.MeshStandardMaterial({ color: "#16202a", roughness: 0.06, metalness: 0.75 }),
  teak: new THREE.MeshStandardMaterial({ color: "#a0703f", roughness: 0.6 }),
  chrome: new THREE.MeshStandardMaterial({ color: "#d8dce4", roughness: 0.15, metalness: 0.95 }),
  black: new THREE.MeshStandardMaterial({ color: "#1a1a20", roughness: 0.5 }),
  gold: new THREE.MeshStandardMaterial({ color: "#f4b728", roughness: 0.3, metalness: 0.7 }),
  antifoul: new THREE.MeshStandardMaterial({ color: "#1e2c48", roughness: 0.5 }),
};
const colored = new Map<string, THREE.MeshStandardMaterial>();
function mat(c: string) {
  let m = colored.get(c);
  if (!m) colored.set(c, (m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.25, metalness: 0.1 })));
  return m;
}

/** A hull outline seen from above: flat transom at z = 0, bow at z = L. */
function hullShape(L: number, W: number, bow = 0.32) {
  const s = new THREE.Shape();
  s.moveTo(-W / 2, 0);
  s.lineTo(-W / 2, L * (1 - bow));
  s.quadraticCurveTo(-W / 2, L * (1 - bow * 0.25), 0, L);
  s.quadraticCurveTo(W / 2, L * (1 - bow * 0.25), W / 2, L * (1 - bow));
  s.lineTo(W / 2, 0);
  s.lineTo(-W / 2, 0);
  return s;
}
/** The hull as a solid from y0 to y1 (shape in x/z), optionally shrunk. */
function hullSolid(L: number, W: number, y0: number, y1: number, bow = 0.32) {
  const g = new THREE.ExtrudeGeometry(hullShape(L, W, bow), { depth: y1 - y0, bevelEnabled: false, curveSegments: 10 });
  // the shape lies in x/y: turn it so the extrusion goes up and the length runs along +z
  g.rotateX(-Math.PI / 2);
  g.rotateY(Math.PI);
  g.translate(0, y0, 0);
  return g;
}

function mesh(g: THREE.BufferGeometry, m: THREE.Material, parent: THREE.Object3D, x = 0, y = 0, z = 0) {
  const o = new THREE.Mesh(g, m);
  o.position.set(x, y, z);
  o.raycast = () => {};
  parent.add(o);
  return o;
}

/** A sit-down jet ski, 3 m, its colour on the hull. */
export function jetSki(color: string) {
  const g = new THREE.Group();
  mesh(hullSolid(3, 1.15, -0.15, 0.35, 0.4), mat(color), g, 0, 0, -1.5);
  mesh(hullSolid(2.4, 0.95, 0.35, 0.5, 0.45), M.white, g, 0, 0, -1.2);
  mesh(new THREE.BoxGeometry(0.42, 0.22, 1.2), M.black, g, 0, 0.55, -0.55);
  mesh(new THREE.BoxGeometry(0.7, 0.06, 0.08), M.chrome, g, 0, 0.92, 0.35);
  mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.42), M.black, g, 0, 0.72, 0.35).rotation.x = -0.4;
  mesh(new THREE.BoxGeometry(0.6, 0.2, 0.3), M.tint, g, 0, 0.6, 0.7).rotation.x = -0.6;
  return g;
}

/** A day speedboat, 8 m: hull, a windscreen, white seats, an outboard pair. */
export function speedboat(hull: string, stripe: string) {
  const g = new THREE.Group();
  mesh(hullSolid(8, 2.6, -0.4, 0.2, 0.36), mat(stripe), g, 0, 0, -4);
  mesh(hullSolid(8, 2.6, 0.2, 0.75, 0.36), mat(hull), g, 0, 0, -4);
  mesh(hullSolid(7.6, 2.3, 0.75, 0.8, 0.36), M.teak, g, 0, 0, -3.8);
  mesh(new THREE.BoxGeometry(2.0, 0.5, 0.06), M.tint, g, 0, 1.05, 0.6).rotation.x = -0.5;
  for (const x of [-0.55, 0.55]) mesh(new THREE.BoxGeometry(0.7, 0.45, 0.7), M.white, g, x, 1.0, -0.4);
  mesh(new THREE.BoxGeometry(2.0, 0.4, 0.8), M.white, g, 0, 0.98, -2.6);
  for (const x of [-0.45, 0.45]) mesh(new THREE.BoxGeometry(0.4, 0.9, 0.45), M.black, g, x, 0.7, -4.2);
  return g;
}

export interface Yacht {
  group: THREE.Group;
  /** The aft deck's height above the water and where a screen sits (for live names / block). */
  deck: number;
  /** Local positions for people: aft deck, flybridge, bow. */
  spots: { aft: THREE.Vector3; fly: THREE.Vector3; bow: THREE.Vector3 };
}

/**
 * A motor yacht `L` metres long: a white hull with a dark boot top and a gold sheer line, a main
 * deck saloon in tinted glass, an upper deck, a flybridge with its hardtop, the radar arch, a teak
 * swim platform at the stern; bow towards +z.
 */
export function yacht(L: number, hull: string, glass: string, o: { decks?: number; stripe?: string } = {}): Yacht {
  const g = new THREE.Group();
  const W = Math.max(4, L * 0.21);
  const decks = o.decks ?? (L > 30 ? 3 : 2);
  const glassM = glass === "#1a2430" ? M.tint : mat(glass);
  const hullM = mat(hull);
  const fb = L * 0.012 + 1.2; // freeboard
  // hull: below the water (antifoul), the boot top, the topsides, the gold line, the deck
  mesh(hullSolid(L, W, -0.8, 0.0, 0.3), M.antifoul, g, 0, 0, -L / 2);
  mesh(hullSolid(L, W, 0.0, 0.25, 0.3), mat(o.stripe ?? "#1a2430"), g, 0, 0, -L / 2);
  mesh(hullSolid(L, W, 0.25, fb, 0.3), hullM, g, 0, 0, -L / 2);
  // the hull windows: a long dark band low on the sides
  mesh(new THREE.BoxGeometry(W + 0.02, 0.35, L * 0.32), M.tint, g, 0, fb * 0.45, -L * 0.02);
  mesh(hullSolid(L * 1.002, W * 1.002, fb - 0.12, fb - 0.04, 0.3), M.gold, g, 0, 0, -L / 2);
  mesh(hullSolid(L * 0.985, W * 0.94, fb, fb + 0.06, 0.3), M.teak, g, 0, 0, -L * 0.49);
  // the swim platform
  mesh(new THREE.BoxGeometry(W * 0.92, 0.12, 1.4), M.teak, g, 0, 0.35, -L / 2 - 0.6);
  // superstructure tiers, each shorter and set back from the bow
  let y = fb + 0.06;
  let len = L * 0.58,
    z0 = -L * 0.42,
    w = W * 0.86;
  for (let d = 0; d < decks; d++) {
    const h = d === decks - 1 ? 0.15 : 2.3;
    if (d < decks - 1) {
      mesh(new THREE.BoxGeometry(w, 0.35, len), hullM, g, 0, y + 0.18, z0 + len / 2);
      mesh(new THREE.BoxGeometry(w + 0.02, 1.35, len * 0.92), glassM, g, 0, y + 0.35 + 0.68, z0 + len * 0.5);
      // the raked front: a sloped glass face
      const rake = new THREE.BoxGeometry(w * 0.98, 1.6, 0.1);
      rake.rotateX(0.75);
      mesh(rake, glassM, g, 0, y + 0.95, z0 + len * 0.96);
      mesh(new THREE.BoxGeometry(w + 0.1, 0.55, len + 0.6), hullM, g, 0, y + 1.75 + 0.28, z0 + len / 2 - 0.1);
      // the deck overhang aft, shading the deck below
      mesh(new THREE.BoxGeometry(w * 0.98, 0.12, 2.4), hullM, g, 0, y + 2.27, z0 - 1.2);
      for (const s of [-1, 1]) mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.2), M.chrome, g, s * w * 0.42, y + 1.1, z0 - 2.2);
    }
    y += h;
    z0 += len * 0.12;
    len *= 0.72;
    w *= 0.92;
  }
  // flybridge hardtop on posts, the radar arch, a mast light
  const topY = y + 0.1;
  for (const [sx, sz] of [
    [-1, 0],
    [1, 0],
    [-1, 1],
    [1, 1],
  ])
    mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.0), M.chrome, g, sx * w * 0.4, topY + 1.0, z0 + sz * len * 0.7);
  mesh(new THREE.BoxGeometry(w * 0.95, 0.12, len * 0.85), hullM, g, 0, topY + 2.0, z0 + len * 0.35);
  mesh(new THREE.BoxGeometry(0.5, 0.12, 0.5), M.black, g, 0, topY + 2.12, z0 + len * 0.4);
  const radar = mesh(new THREE.BoxGeometry(1.2, 0.06, 0.12), M.white, g, 0, topY + 2.3, z0 + len * 0.4);
  radar.userData.spin = true;
  // the flybridge helm and seats
  mesh(new THREE.BoxGeometry(w * 0.5, 0.5, 0.6), M.white, g, 0, topY + 0.25, z0 + len * 0.75);
  mesh(new THREE.BoxGeometry(w * 0.7, 0.45, 1.2), M.white, g, 0, topY + 0.22, z0 + len * 0.15);
  // rails round the foredeck
  const foreY = fb + 0.06;
  const railPts: THREE.BufferGeometry[] = [];
  for (const s of [-1, 1]) {
    const r = new THREE.CylinderGeometry(0.03, 0.03, L * 0.5).rotateX(Math.PI / 2).translate(s * W * 0.45, foreY + 0.9, L * 0.18);
    railPts.push(r);
  }
  mesh(mergeGeometries(railPts)!, M.chrome, g);
  // sunpads on the foredeck
  mesh(new THREE.BoxGeometry(W * 0.6, 0.2, L * 0.12), mat("#f2eee4"), g, 0, foreY + 0.1, L * 0.24);
  g.userData.radar = radar;
  return {
    group: g,
    deck: fb + 0.06,
    spots: { aft: new THREE.Vector3(0, fb + 0.06, -L * 0.45), fly: new THREE.Vector3(0, topY, z0 + len * 0.15), bow: new THREE.Vector3(0, foreY, L * 0.24) },
  };
}
