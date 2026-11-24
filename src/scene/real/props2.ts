import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { maps } from "./tex";

/**
 * The rest of the street's furniture, realistic (src/scene/real, wave 2): the old town's wooden
 * utility poles, bicycles, rubbish bags, crates, traffic cones, oil drums, the market stalls, stone
 * lanterns, the greenhouse, the gates, queue rails, bamboo, the koi pond's arched bridge, stepping
 * stones in raked gravel and the three-tier fountain. Same footprints, facings, lights and
 * collisions as the voxel props they replace (src/scene/voxel/props.ts), built once per variant and
 * instanced by props.ts placeProps (local: origin on the ground at the prop's spot, front +z).
 */

export type Parts = Map<THREE.Material, THREE.BufferGeometry[]>;
type Mat = (key: string, make: () => THREE.Material) => THREE.Material;

/** What each kind needs from its caller: the shared materials' maker (with the knock-down holes) and a part adder. */
export interface Kit {
  M: Mat;
  add(parts: Parts, m: THREE.Material, g: THREE.BufferGeometry): void;
  paint(hex: string, rough?: number, metal?: number): THREE.Material;
  steel(): THREE.Material;
  wood(): THREE.Material;
  glow(hex: string, k?: number): THREE.Material;
}

export const KINDS2 = ["pole", "bicycle", "trashBags", "crates", "cone", "barrel", "stall", "stoneLantern", "greenhouse", "gate", "rail", "bamboo", "bridge", "stones", "tieredFountain"] as const;

/** Footprints (m, along x and z) of the kinds a body bumps into whole (the voxel props' SOLID set). */
export const SOLID2: Record<string, [number, number]> = {
  bicycle: [0.34, 1.67],
  trashBags: [1.33, 1.0],
  crates: [1.67, 1.33],
  barrel: [0.67, 0.67],
  stall: [2.67, 1.67],
  greenhouse: [12, 6],
};
/** Radii for the rest (0: nothing to bump into). */
export const RADIUS2: Record<string, number> = { pole: 0.25, cone: 0.25, stoneLantern: 0.4, gate: 0, rail: 0, bamboo: 0.6, bridge: 0, stones: 0, tieredFountain: 3.7 };
/** Their lights (local, colour). */
export const LIGHT2: Record<string, [number, number, number, string]> = {
  stall: [0, 1.83, 0.5, "#ffcf8a"],
  stoneLantern: [0, 1.17, 0, "#ffcf7a"],
  greenhouse: [0, 2, 0, "#7dffb0"],
};

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const cyl = (r0: number, r1: number, h: number, x: number, y: number, z: number, seg = 14) => new THREE.CylinderGeometry(r1, r0, h, seg).translate(x, y + h / 2, z);
const box = (w: number, h: number, d: number, x: number, y: number, z: number, r = 0) => (r > 0 ? new RoundedBoxGeometry(w, h, d, 2, r) : new THREE.BoxGeometry(w, h, d)).translate(x, y + h / 2, z);
/** A tube from a to b (radius r). */
function tube(a: THREE.Vector3, b: THREE.Vector3, r: number, seg = 8) {
  const len = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(r, r, len, seg).translate(0, len / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), b.clone().sub(a).normalize()));
  return g.translate(a.x, a.y, a.z);
}
/** UVs in metres over a tile (for the photographed sets). */
function metreUv(g: THREE.BufferGeometry, tile: number) {
  const p = g.getAttribute("position"),
    n = g.getAttribute("normal"),
    uv = g.getAttribute("uv");
  if (!uv) return g;
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)),
      ay = Math.abs(n.getY(i));
    const u = ax > 0.5 ? p.getZ(i) : p.getX(i);
    const v = ay > 0.5 ? p.getZ(i) : p.getY(i);
    uv.setXY(i, u / tile, v / tile);
  }
  return g;
}
/** A seeded random. */
function rng(seed: number) {
  let s = (Math.abs(Math.floor(seed * 2654435761)) >>> 0) || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

// ---- the materials of their own ---------------------------------------------------------------------

function stone(k: Kit, tint = "#c8c2b8") {
  return k.M(`stone:${tint}`, () => {
    const mp = maps("Concrete034");
    return new THREE.MeshStandardMaterial({ map: mp.map, normalMap: mp.normalMap, roughnessMap: mp.roughnessMap, color: tint, roughness: 1 });
  });
}
function water(k: Kit) {
  return k.M("water", () => {
    const mp = maps("Concrete034");
    const m = new THREE.MeshStandardMaterial({ color: "#2c6f86", roughness: 0.04, metalness: 0.1, normalMap: mp.normalMap, envMapIntensity: 1.4, transparent: true, opacity: 0.86 });
    m.normalScale.setScalar(0.15);
    return m;
  });
}
function glass(k: Kit) {
  return k.M("hothouse-glass", () => new THREE.MeshStandardMaterial({ color: "#cfe6e8", roughness: 0.06, metalness: 0.1, transparent: true, opacity: 0.24, depthWrite: false, envMapIntensity: 1.2 }));
}
function cloth(k: Kit, hex: string) {
  return k.M(`cloth:${hex}`, () => new THREE.MeshStandardMaterial({ color: hex, roughness: 0.92, side: THREE.DoubleSide }));
}
function gravel(k: Kit) {
  return k.M("gravel", () => {
    const mp = maps("Gravel022");
    return new THREE.MeshStandardMaterial({ map: mp.map, normalMap: mp.normalMap, roughnessMap: mp.roughnessMap, color: "#e8e2d8", roughness: 1 });
  });
}
/** Bamboo leaves: the long-leaf CC0 set, cut out by its opacity map. */
let leafTex: { map: THREE.Texture; alpha: THREE.Texture } | null = null;
function bambooLeaf(k: Kit) {
  return k.M("bamboo-leaf", () => {
    if (!leafTex) {
      const l = new THREE.TextureLoader();
      const base = `${import.meta.env?.BASE_URL ?? "/"}tex/LeafSet026/`;
      const map = l.load(`${base}color.webp`);
      map.colorSpace = THREE.SRGBColorSpace;
      leafTex = { map, alpha: l.load(`${base}opacity.webp`) };
    }
    return new THREE.MeshStandardMaterial({ map: leafTex.map, alphaMap: leafTex.alpha, alphaTest: 0.45, side: THREE.DoubleSide, color: "#b8d890", roughness: 0.7 });
  });
}

// ---- the kinds ----------------------------------------------------------------------------------------

/** A wooden utility pole: creosoted, two crossarms with their insulators (the wires come in at 7.4 and 6.55 m), a pole-top transformer, a step plate. */
function pole(k: Kit, parts: Parts) {
  const timber = k.M("pole-timber", () => {
    const mp = maps("Wood049");
    return new THREE.MeshStandardMaterial({ map: mp.map, normalMap: mp.normalMap, roughnessMap: mp.roughnessMap, color: "#6e5a48", roughness: 1 });
  });
  k.add(parts, timber, metreUv(cyl(0.16, 0.12, 8.1, 0, 0, 0, 12), 1.5));
  const arm = k.paint("#3a3a40", 0.6, 0.5);
  const porcelain = k.M("porcelain", () => new THREE.MeshStandardMaterial({ color: "#e8e4da", roughness: 0.25, metalness: 0 }));
  for (const y of [6.45, 7.3]) {
    k.add(parts, arm, box(2.3, 0.1, 0.12, 0, y, 0));
    for (const x of [-0.95, -0.25, 0.4, 0.9]) {
      k.add(parts, porcelain, cyl(0.05, 0.035, 0.12, x, y + 0.1, 0, 10));
      k.add(parts, porcelain, cyl(0.06, 0.06, 0.02, x, y + 0.14, 0, 10));
    }
    // the braces
    for (const s of [-1, 1]) k.add(parts, arm, tube(V(0, y - 0.6, 0.02), V(s * 0.6, y, 0.02), 0.02, 6));
  }
  // the transformer: a grey can on a bracket
  const can = k.paint("#8a8e94", 0.5, 0.6);
  k.add(parts, can, cyl(0.26, 0.26, 0.85, 0.45, 5.0, 0.0, 16));
  k.add(parts, can, cyl(0.28, 0.28, 0.06, 0.45, 5.85, 0, 16));
  k.add(parts, arm, box(0.4, 0.08, 0.12, 0.2, 5.4, 0));
  k.add(parts, porcelain, cyl(0.04, 0.03, 0.18, 0.45, 5.9, 0, 8));
  // a numbered yellow plate
  k.add(parts, k.paint("#d8c43a", 0.5, 0.1), box(0.34, 0.24, 0.02, 0, 3.4, 0.13));
}

/** A city bicycle, front +z: wheels with their tyres, a step-through frame in its colour, a basket, mudguards, a stand. */
function bicycle(k: Kit, parts: Parts, color: string) {
  const frame = k.paint(color, 0.35, 0.5);
  const rubber = k.paint("#1a1a1c", 0.8, 0);
  const chrome = k.steel();
  for (const z of [-0.52, 0.52]) {
    k.add(parts, rubber, new THREE.TorusGeometry(0.32, 0.025, 8, 28).rotateY(Math.PI / 2).translate(0, 0.34, z));
    k.add(parts, chrome, new THREE.TorusGeometry(0.29, 0.008, 4, 24).rotateY(Math.PI / 2).translate(0, 0.34, z));
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI;
      k.add(parts, chrome, tube(V(0, 0.34 - Math.sin(a) * 0.29, z - Math.cos(a) * 0.29), V(0, 0.34 + Math.sin(a) * 0.29, z + Math.cos(a) * 0.29), 0.003, 3));
    }
    k.add(parts, frame, new THREE.TorusGeometry(0.35, 0.02, 4, 16, Math.PI * 0.75).rotateY(Math.PI / 2).rotateX(z > 0 ? -0.6 : -0.15).translate(0, 0.34, z));
  }
  const bb = V(0, 0.32, -0.05),
    seat = V(0, 0.82, -0.2),
    head = V(0, 0.86, 0.34);
  k.add(parts, frame, tube(bb, seat, 0.02));
  k.add(parts, frame, tube(bb, V(0, 0.55, 0.3), 0.022));
  k.add(parts, frame, tube(V(0, 0.55, 0.3), head, 0.022));
  k.add(parts, frame, tube(bb, V(0, 0.34, -0.52), 0.014));
  k.add(parts, frame, tube(seat, V(0, 0.34, -0.52), 0.012));
  k.add(parts, chrome, tube(head, V(0, 0.34, 0.52), 0.014));
  k.add(parts, chrome, tube(V(-0.28, 0.98, 0.38), V(0.28, 0.98, 0.38), 0.012));
  k.add(parts, chrome, tube(head, V(0, 0.98, 0.38), 0.014));
  k.add(parts, rubber, box(0.12, 0.05, 0.24, 0, 0.84, -0.22, 0.02));
  // the basket over the front wheel
  k.add(parts, chrome, box(0.32, 0.2, 0.26, 0, 0.82, 0.58));
  k.add(parts, chrome, tube(V(0, 0.32, -0.05), V(0.18, 0.02, -0.12), 0.008, 4));
}

/** Black rubbish bags, tied at the top, in a heap. */
function trashBags(k: Kit, parts: Parts, seed: number) {
  const r = rng(seed + 3);
  const bag = k.M("bags", () => new THREE.MeshStandardMaterial({ color: "#16161a", roughness: 0.28, metalness: 0.05 }));
  const n = 3 + Math.floor(r() * 2);
  for (let i = 0; i < n; i++) {
    const g = new THREE.SphereGeometry(0.3, 14, 10);
    const p = g.getAttribute("position");
    for (let v = 0; v < p.count; v++) {
      const y = p.getY(v);
      const s = 1 + Math.sin(p.getX(v) * 9 + i) * 0.06 + Math.cos(p.getZ(v) * 11 + i) * 0.05;
      p.setXYZ(v, p.getX(v) * s, y < 0 ? y * 0.75 : y * (1.15 + r() * 0.05), p.getZ(v) * s);
    }
    g.computeVertexNormals();
    const x = -0.4 + (i % 3) * 0.38 + (r() - 0.5) * 0.1,
      z = -0.2 + Math.floor(i / 3) * 0.35 + (r() - 0.5) * 0.15;
    k.add(parts, bag, g.translate(x, 0.24, z));
    k.add(parts, bag, cyl(0.05, 0.02, 0.12, x, 0.56, z, 8));
  }
}

/** Wooden crates stacked, their slats and frames. */
function crates(k: Kit, parts: Parts, seed: number) {
  const r = rng(seed + 9);
  const w = k.wood();
  const dark = k.M("crate-frame", () => {
    const mp = maps("Wood049");
    return new THREE.MeshStandardMaterial({ map: mp.map, normalMap: mp.normalMap, color: "#8a6a4a", roughness: 1 });
  });
  const crate = (x: number, y: number, z: number, s: number, rot: number) => {
    const g = metreUv(box(s, s * 0.8, s, 0, 0, 0), 0.8).rotateY(rot).translate(x, y, z);
    k.add(parts, w, g);
    for (const yy of [0, s * 0.8 - 0.05]) k.add(parts, dark, box(s + 0.02, 0.05, s + 0.02, 0, yy, 0).rotateY(rot).translate(x, y, z));
    for (const [dx, dz] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ])
      k.add(parts, dark, box(0.05, s * 0.8, 0.05, (dx * s) / 2, 0, (dz * s) / 2).rotateY(rot).translate(x, y, z));
  };
  crate(-0.38, 0, -0.1, 0.62, r() * 0.2);
  crate(0.36, 0, 0.12, 0.58, -r() * 0.2);
  crate(-0.3, 0.5, -0.05, 0.5, r() * 0.4);
}

/** A traffic cone: a square foot, the cone, two reflective bands. */
function cone(k: Kit, parts: Parts) {
  const orange = k.paint("#f26a1b", 0.45, 0);
  const white = k.M("cone-band", () => new THREE.MeshStandardMaterial({ color: "#f4f4f0", roughness: 0.25, metalness: 0.3 }));
  k.add(parts, k.paint("#1c1c20", 0.7, 0), box(0.42, 0.03, 0.42, 0, 0, 0, 0.01));
  k.add(parts, orange, cyl(0.17, 0.035, 0.66, 0, 0.03, 0, 20));
  k.add(parts, white, cyl(0.128, 0.105, 0.11, 0, 0.3, 0, 20));
  k.add(parts, white, cyl(0.088, 0.068, 0.08, 0, 0.47, 0, 20));
}

/** An oil drum: its ribs, the lid's rim and bung. */
function barrel(k: Kit, parts: Parts, color: string) {
  const p = k.paint(color, 0.45, 0.55);
  k.add(parts, p, cyl(0.29, 0.29, 0.88, 0, 0, 0, 22));
  for (const y of [0.0, 0.3, 0.58, 0.86]) k.add(parts, p, cyl(0.305, 0.305, 0.03, 0, y, 0, 22));
  k.add(parts, k.steel(), cyl(0.04, 0.04, 0.02, 0.15, 0.88, 0.05, 10));
}

/** A market stall: a trestle counter with its goods, posts, a striped awning sloping to the front, a lamp under it. */
function stall(k: Kit, parts: Parts, clothHex: string, seed: number) {
  const r = rng(seed + 17);
  const post = k.paint("#3a3530", 0.6, 0.2);
  for (const x of [-1.25, 1.25]) for (const z of [-0.7, 0.7]) k.add(parts, post, cyl(0.03, 0.03, z > 0 ? 2.15 : 2.5, x, 0, z, 8));
  k.add(parts, k.wood(), metreUv(box(2.5, 0.06, 1.1, 0, 0.86, 0.1), 1.2));
  k.add(parts, cloth(k, "#e8e2d4"), box(2.5, 0.8, 0.02, 0, 0.06, 0.64));
  // goods: crates of fruit, jars, bundles
  const goods = ["#d8402a", "#f2b23a", "#6aa83a", "#e8d06a", "#8a3a6a", "#e88a3a"];
  for (let i = 0; i < 9; i++) {
    const x = -1.05 + (i % 5) * 0.52,
      z = -0.15 + Math.floor(i / 5) * 0.42;
    k.add(parts, k.wood(), metreUv(box(0.42, 0.12, 0.32, x, 0.92, z), 0.8));
    const g = cloth(k, goods[Math.floor(r() * goods.length)]);
    for (let j = 0; j < 5; j++) k.add(parts, g, new THREE.SphereGeometry(0.05, 8, 6).translate(x - 0.12 + (j % 3) * 0.12, 1.06, z - 0.06 + Math.floor(j / 3) * 0.12));
  }
  // the awning: stripes of the cloth and cream, high at the back
  const a = cloth(k, clothHex),
    b = cloth(k, "#f2ece0");
  const n = 8;
  for (let i = 0; i < n; i++) {
    const x0 = -1.4 + (i * 2.8) / n,
      x1 = x0 + 2.8 / n;
    const geo = new THREE.BufferGeometry().setFromPoints([V(x0, 2.52, -0.85), V(x1, 2.52, -0.85), V(x1, 2.12, 0.95), V(x0, 2.12, -0.85), V(x1, 2.12, 0.95), V(x0, 2.12, 0.95)]);
    geo.computeVertexNormals();
    k.add(parts, i % 2 ? a : b, geo);
    // the valance
    k.add(parts, i % 2 ? a : b, box(2.8 / n, 0.2, 0.01, (x0 + x1) / 2, 1.92, 0.95));
  }
  k.add(parts, k.glow("#ffcf8a", 2.4), new THREE.SphereGeometry(0.07, 10, 8).translate(0, 1.83, 0.5));
}

/** A stone lantern (tōrō): its foot, post, platform, the light box, a curved roof and its jewel. */
function stoneLantern(k: Kit, parts: Parts) {
  const s = stone(k, "#b8b2a6");
  k.add(parts, s, metreUv(cyl(0.42, 0.38, 0.14, 0, 0, 0, 6), 1));
  k.add(parts, s, metreUv(cyl(0.14, 0.12, 0.62, 0, 0.14, 0, 12), 1));
  k.add(parts, s, metreUv(cyl(0.36, 0.3, 0.16, 0, 0.76, 0, 6), 1));
  // the light box: four corner posts round a lit core
  for (const [dx, dz] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ])
    k.add(parts, s, box(0.08, 0.3, 0.08, dx * 0.18, 0.92, dz * 0.18));
  k.add(parts, k.glow("#ffcf7a", 2), box(0.26, 0.24, 0.26, 0, 0.95, 0));
  const roof = new THREE.ConeGeometry(0.55, 0.32, 6, 1, false, Math.PI / 6);
  const p = roof.getAttribute("position");
  // (the eaves turned up at the corners)
  for (let v = 0; v < p.count; v++) if (p.getY(v) < 0) p.setY(v, p.getY(v) + 0.05);
  roof.computeVertexNormals();
  k.add(parts, s, metreUv(roof.translate(0, 1.38, 0), 1));
  k.add(parts, s, new THREE.SphereGeometry(0.07, 10, 8).translate(0, 1.6, 0));
}

/** A glasshouse 12 × 6 m: a brick plinth, white glazing bars, glass walls and roof, benches of plants inside. */
function greenhouse(k: Kit, parts: Parts) {
  const W = 12,
    D = 6,
    H = 2.6,
    R = 4.2;
  const brick = k.M("brick-plinth", () => {
    const mp = maps("Bricks060");
    return new THREE.MeshStandardMaterial({ map: mp.map, normalMap: mp.normalMap, roughnessMap: mp.roughnessMap, roughness: 1 });
  });
  for (const [w, d, x, z] of [
    [W, 0.25, 0, -D / 2],
    [W, 0.25, 0, D / 2],
    [0.25, D, -W / 2, 0],
    [0.25, D, W / 2, 0],
  ] as const)
    k.add(parts, brick, metreUv(box(w, 0.6, d, x, 0, z), 1.6));
  const bar = k.paint("#f2f2ee", 0.4, 0.2);
  const gl = glass(k);
  // walls
  for (const z of [-D / 2, D / 2]) {
    k.add(parts, gl, box(W, H - 0.6, 0.02, 0, 0.6, z));
    for (let x = -W / 2; x <= W / 2 + 0.01; x += 1.5) k.add(parts, bar, box(0.06, H - 0.6, 0.06, x, 0.6, z));
    k.add(parts, bar, box(W, 0.06, 0.08, 0, H, z));
  }
  for (const x of [-W / 2, W / 2]) {
    k.add(parts, gl, box(0.02, H - 0.6, D, x, 0.6, 0));
    // the gable
    const tri = new THREE.BufferGeometry().setFromPoints([V(x, H, -D / 2), V(x, R, 0), V(x, H, D / 2)]);
    tri.computeVertexNormals();
    k.add(parts, gl, tri);
  }
  // the roof: two glass slopes on their rafters
  for (const s of [-1, 1]) {
    const g = new THREE.BufferGeometry().setFromPoints([V(-W / 2, H, (s * D) / 2), V(W / 2, H, (s * D) / 2), V(W / 2, R, 0), V(-W / 2, H, (s * D) / 2), V(W / 2, R, 0), V(-W / 2, R, 0)]);
    g.computeVertexNormals();
    k.add(parts, gl, g);
    for (let x = -W / 2; x <= W / 2 + 0.01; x += 1.5) k.add(parts, bar, tube(V(x, H, (s * D) / 2), V(x, R, 0), 0.03, 4));
  }
  k.add(parts, bar, tube(V(-W / 2, R, 0), V(W / 2, R, 0), 0.05, 6));
  // the door (glazed) in the middle of the front
  k.add(parts, bar, box(1.2, 2.1, 0.08, 0, 0.6, D / 2 + 0.02));
  // the plant benches
  for (const z of [-1.7, 1.7]) {
    k.add(parts, k.wood(), metreUv(box(W - 1.2, 0.06, 1.1, 0, 0.8, z), 1.5));
    for (let x = -W / 2 + 1; x < W / 2 - 0.8; x += 0.5) k.add(parts, k.M("pot", () => new THREE.MeshStandardMaterial({ color: "#b8603a", roughness: 0.9 })), cyl(0.12, 0.09, 0.16, x, 0.86, z, 10));
  }
}

/** A gate across a path (w metres): two black-lacquered posts, the top beam curving up at its ends, a tie beam below. */
function gate(k: Kit, parts: Parts, w: number) {
  const lac = k.paint("#1e1b20", 0.35, 0.15);
  const hw = w / 2 - 0.25;
  for (const s of [-1, 1]) {
    k.add(parts, lac, cyl(0.2, 0.17, 4.6, s * hw, 0, 0, 16));
    k.add(parts, stone(k, "#8a8680"), cyl(0.28, 0.28, 0.3, s * hw, 0, 0, 16));
  }
  k.add(parts, lac, box(w - 0.3, 0.22, 0.24, 0, 3.75, 0));
  // the top beam in segments, rising to the ends
  const n = 12;
  for (let i = 0; i < n; i++) {
    const t0 = i / n - 0.5,
      t1 = (i + 1) / n - 0.5;
    const L = w + 1.2;
    const a = V(t0 * L, 4.45 + t0 * t0 * 0.7, 0),
      b = V(t1 * L, 4.45 + t1 * t1 * 0.7, 0);
    const seg = box(a.distanceTo(b) + 0.02, 0.3, 0.42, 0, -0.15, 0);
    seg.rotateZ(Math.atan2(b.y - a.y, b.x - a.x)).translate((a.x + b.x) / 2, (a.y + b.y) / 2, 0);
    k.add(parts, lac, seg);
  }
}

/** A queue rail (len m along x): polished posts every metre, a round top rail. */
function rail(k: Kit, parts: Parts, len: number) {
  const s = k.steel();
  for (let x = 0; x <= len + 0.01; x += 1) k.add(parts, s, cyl(0.025, 0.025, 0.95, x - len / 2, 0, 0, 10));
  k.add(parts, s, tube(V(-len / 2, 0.95, 0), V(len / 2, 0.95, 0), 0.025, 10));
  k.add(parts, s, tube(V(-len / 2, 0.5, 0), V(len / 2, 0.5, 0), 0.015, 8));
}

/** A clump of bamboo: green canes with their nodes, sprays of long leaves near the top. */
function bamboo(k: Kit, parts: Parts, seed: number) {
  const r = rng(seed + 5);
  const cane = k.M("bamboo-cane", () => new THREE.MeshStandardMaterial({ color: "#7a9a48", roughness: 0.45 }));
  const node = k.M("bamboo-node", () => new THREE.MeshStandardMaterial({ color: "#5e7a36", roughness: 0.5 }));
  const leaf = bambooLeaf(k);
  for (let i = 0; i < 9; i++) {
    const x = (r() - 0.5) * 1.3,
      z = (r() - 0.5) * 1.3,
      h = 3.6 + r() * 2.6;
    const lean = V((r() - 0.5) * 0.25, 1, (r() - 0.5) * 0.25).normalize();
    const top = V(x, 0, z).add(lean.clone().multiplyScalar(h));
    k.add(parts, cane, tube(V(x, 0, z), top, 0.035, 8));
    for (let y = 0.6; y < h; y += 0.6) {
      const p = V(x, 0, z).add(lean.clone().multiplyScalar(y));
      k.add(parts, node, cyl(0.04, 0.04, 0.03, p.x, p.y, p.z, 8));
    }
    // sprays: crossed cards
    for (let j = 0; j < 4; j++) {
      const p = V(x, 0, z).add(lean.clone().multiplyScalar(h * (0.55 + j * 0.13)));
      const card = new THREE.PlaneGeometry(0.9, 0.5);
      card.rotateY(r() * Math.PI).rotateZ((r() - 0.5) * 0.6).translate(p.x, p.y, p.z);
      k.add(parts, leaf, card);
    }
  }
}

/** The koi pond's bridge (spans x, 6 m): an arch of planks, red rails on posts. */
function bridge(k: Kit, parts: Parts) {
  const red = k.paint("#b02a24", 0.4, 0.1);
  const n = 18;
  for (let i = 0; i < n; i++) {
    const t0 = i / n,
      t1 = (i + 1) / n;
    const a = V(-3 + t0 * 6, Math.sin(t0 * Math.PI) * 0.85, 0),
      b = V(-3 + t1 * 6, Math.sin(t1 * Math.PI) * 0.85, 0);
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    const plank = box(a.distanceTo(b) + 0.01, 0.08, 1.05, 0, 0, 0).rotateZ(ang).translate((a.x + b.x) / 2, (a.y + b.y) / 2, 0);
    k.add(parts, k.wood(), metreUv(plank, 1.2));
    for (const z of [-0.58, 0.58]) {
      k.add(parts, red, tube(a.clone().add(V(0, 0.82, z)), b.clone().add(V(0, 0.82, z)), 0.035, 6));
      if (i % 3 === 0) k.add(parts, red, box(0.08, 0.86, 0.08, a.x, a.y, z));
    }
  }
  for (const z of [-0.58, 0.58]) k.add(parts, red, box(0.08, 0.86, 0.08, 3, 0, z));
}

/** Raked gravel in a circle and nine stepping stones across it. */
function stones(k: Kit, parts: Parts, seed: number) {
  const r = rng(seed + 2);
  const disc = new THREE.CircleGeometry(2.4, 40).rotateX(-Math.PI / 2).translate(0, 0.02, 0);
  const uv = disc.getAttribute("uv");
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2.4, uv.getY(i) * 2.4);
  k.add(parts, gravel(k), disc);
  for (let i = 0; i < 9; i++) {
    const x = -2 + i * 0.5,
      z = Math.sin(i * 0.9) * 1;
    const g = new RoundedBoxGeometry(0.42 + r() * 0.12, 0.12, 0.38 + r() * 0.1, 2, 0.05);
    g.rotateY(r() * Math.PI).translate(x, 0.06, z);
    k.add(parts, stone(k, "#7a766e"), metreUv(g, 1));
  }
}

/** The three-tier fountain: a wide stone basin, water in each bowl, a column, the spout, a neon line under each lip. */
function tieredFountain(k: Kit, parts: Parts) {
  const s = stone(k, "#c8c2b8");
  const lathe = (pts: [number, number][], seg = 48) => new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), seg);
  k.add(parts, s, metreUv(lathe([[0, 0], [3.6, 0], [3.66, 0.7], [3.48, 0.82], [3.38, 0.7], [3.3, 0.15], [0, 0.15]]), 1.2));
  k.add(parts, water(k), new THREE.CircleGeometry(3.32, 48).rotateX(-Math.PI / 2).translate(0, 0.6, 0));
  k.add(parts, s, metreUv(cyl(0.5, 0.42, 1.8, 0, 0.15, 0, 24), 1));
  k.add(parts, s, metreUv(lathe([[0, 1.8], [0.4, 1.75], [1.7, 1.95], [1.72, 2.12], [1.6, 2.1], [0, 2.0]]), 1));
  k.add(parts, water(k), new THREE.CircleGeometry(1.58, 36).rotateX(-Math.PI / 2).translate(0, 2.06, 0));
  k.add(parts, s, metreUv(cyl(0.22, 0.18, 0.9, 0, 2.1, 0, 18), 1));
  k.add(parts, s, metreUv(lathe([[0, 2.95], [0.25, 2.92], [0.78, 3.12], [0.78, 3.22], [0, 3.15]]), 1));
  k.add(parts, s, new THREE.SphereGeometry(0.14, 14, 10).translate(0, 3.3, 0));
  k.add(parts, k.glow("#3ef0ff", 1.6), new THREE.TorusGeometry(3.5, 0.025, 6, 64).rotateX(Math.PI / 2).translate(0, 0.66, 0));
  k.add(parts, k.glow("#ff3e8a", 1.4), new THREE.TorusGeometry(1.68, 0.02, 6, 48).rotateX(Math.PI / 2).translate(0, 1.92, 0));
}

/** Build a kind into `parts` (its variant's arguments as the plan gives them). */
export function build2(k: Kit, parts: Parts, type: string, args: unknown[]) {
  const a = args as never[];
  switch (type) {
    case "pole":
      return pole(k, parts);
    case "bicycle":
      return bicycle(k, parts, String(a[0] ?? "#c03a3a"));
    case "trashBags":
      return trashBags(k, parts, Number(a[0] ?? 1));
    case "crates":
      return crates(k, parts, Number(a[0] ?? 1));
    case "cone":
      return cone(k, parts);
    case "barrel":
      return barrel(k, parts, String(a[0] ?? "#3a5a8a"));
    case "stall":
      return stall(k, parts, String(a[0] ?? "#c0503a"), Number(a[1] ?? 1));
    case "stoneLantern":
      return stoneLantern(k, parts);
    case "greenhouse":
      return greenhouse(k, parts);
    case "gate":
      return gate(k, parts, Number(a[0] ?? 30) / 6);
    case "rail":
      return rail(k, parts, Number(a[0] ?? 5));
    case "bamboo":
      return bamboo(k, parts, Number(a[0] ?? 1));
    case "bridge":
      return bridge(k, parts);
    case "stones":
      return stones(k, parts, Number(a[0] ?? 1));
    case "tieredFountain":
      return tieredFountain(k, parts);
  }
}
