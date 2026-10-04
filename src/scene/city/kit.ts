import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { blobTexture, neonTexture, zcashBadge } from "../textures";

/** Sidewalk top. */
export const CURB = 0.2;

// ---- materials ----------------------------------------------------------------------------------

const matCache = new Map<string, THREE.MeshStandardMaterial>();

/** Shared untextured standard material, so static meshes can be merged per material. */
export function mat(color: THREE.ColorRepresentation, roughness = 0.85, metalness = 0.05, emissive?: THREE.ColorRepresentation, emissiveIntensity = 1) {
  const key = `${new THREE.Color(color).getHexString()}|${roughness}|${metalness}|${emissive ?? ""}|${emissiveIntensity}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness, metalness });
    if (emissive != null) {
      m.emissive = new THREE.Color(emissive);
      m.emissiveIntensity = emissiveIntensity;
    }
    matCache.set(key, m);
  }
  return m;
}

const glowCache = new Map<string, THREE.MeshBasicMaterial>();
/** Unlit HDR colour that blooms (bulbs, LED strips, lit panes). */
export function glow(color: THREE.ColorRepresentation, strength = 2.5) {
  const key = `${new THREE.Color(color).getHexString()}|${strength}`;
  let m = glowCache.get(key);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(strength), toneMapped: false });
    glowCache.set(key, m);
  }
  return m;
}

// ---- primitives ---------------------------------------------------------------------------------

const boxGeo = new THREE.BoxGeometry(1, 1, 1);

export function box(parent: THREE.Object3D, w: number, h: number, d: number, m: THREE.Material | THREE.Material[], x = 0, y = 0, z = 0, shadow = true) {
  const mesh = new THREE.Mesh(Array.isArray(m) ? new THREE.BoxGeometry(w, h, d) : boxGeo, m);
  if (!Array.isArray(m)) mesh.scale.set(w, h, d);
  mesh.position.set(x, y, z);
  mesh.castShadow = shadow;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

/** A box sitting on `y` (its bottom), which is how most props are placed. */
export function block(parent: THREE.Object3D, w: number, h: number, d: number, m: THREE.Material | THREE.Material[], x: number, y: number, z: number, shadow = true) {
  return box(parent, w, h, d, m, x, y + h / 2, z, shadow);
}

export function plane(parent: THREE.Object3D, w: number, h: number, m: THREE.Material, x: number, y: number, z: number, rotX = 0, rotY = 0) {
  const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
  p.position.set(x, y, z);
  // yaw first, then tilt, so a ground plane can be turned to run along z
  p.rotation.set(rotX, rotY, 0, "YXZ");
  parent.add(p);
  return p;
}

export interface Flicker {
  mat: THREE.MeshBasicMaterial;
  seed: number;
  base: THREE.Color;
}

/** Neon sign facing +z in its own group; returns the group so it can be rotated into place. */
export function neon(parent: THREE.Object3D, text: string, color: string, height: number, x: number, y: number, z: number, opts: { vertical?: boolean; rotY?: number; flicker?: Flicker[] } = {}) {
  const { texture, aspect } = neonTexture(text, color, { vertical: opts.vertical });
  const w = height * aspect;
  const g = new THREE.Group();
  const m = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false, color: new THREE.Color(1.6, 1.6, 1.6) });
  const face = new THREE.Mesh(new THREE.PlaneGeometry(w, height), m);
  face.position.z = 0.06;
  g.add(face);
  box(g, w + 0.08, height + 0.08, 0.1, mat("#111018"), 0, 0, 0, false);
  g.position.set(x, y, z);
  g.rotation.y = opts.rotY ?? 0;
  parent.add(g);
  if (opts.flicker && Math.random() < 0.5) opts.flicker.push({ mat: m, seed: Math.random() * 10, base: m.color.clone() });
  return { group: g, width: w };
}

// ---- props --------------------------------------------------------------------------------------

export interface Lamp {
  /** Where the bulb is, for the shared point-light pool. */
  pos: THREE.Vector3;
  color: string;
}

const poolTextures = new Map<string, THREE.Texture>();
function poolTex(color: string) {
  let t = poolTextures.get(color);
  if (!t) {
    const c = new THREE.Color(color);
    const rgb = `${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)}`;
    t = blobTexture(`rgba(${rgb},0.24)`, `rgba(${rgb},0)`);
    poolTextures.set(color, t);
  }
  return t;
}
const poolMats = new Map<string, THREE.MeshBasicMaterial>();
function poolMat(color: string) {
  let m = poolMats.get(color);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ map: poolTex(color), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    poolMats.set(color, m);
  }
  return m;
}

/** A light pool painted on the ground: cheap light that reads from far away. */
export function lightPool(parent: THREE.Object3D, x: number, y: number, z: number, size: number, color: string) {
  const p = plane(parent, size, size, poolMat(color), x, y + 0.015, z, -Math.PI / 2);
  p.userData.dynamic = true;
  return p;
}

/** Street lamp whose arm reaches over (dx, dz). */
export function lamp(parent: THREE.Object3D, lamps: Lamp[], x: number, z: number, dx: number, dz: number, color = "#ffb46b", base = CURB) {
  const pole = mat("#232129", 0.4, 0.5);
  block(parent, 0.12, 4.2, 0.12, pole, x, base, z);
  const len = Math.hypot(dx, dz);
  const arm = box(parent, 0.08, 0.08, len, pole, x + dx / 2, base + 4.15, z + dz / 2);
  arm.rotation.y = Math.atan2(dx, dz);
  box(parent, 0.34, 0.14, 0.34, mat("#1a1a1f"), x + dx, base + 4.08, z + dz);
  const bulb = plane(parent, 0.26, 0.26, glow(color, 3), x + dx, base + 4.0, z + dz, Math.PI / 2);
  bulb.userData.dynamic = true;
  lightPool(parent, x + dx, base, z + dz, 4.2, color);
  lamps.push({ pos: new THREE.Vector3(x + dx, base + 3.7, z + dz), color });
}

/** Voxel tree: trunk and stacked leaf cubes. */
export function tree(parent: THREE.Object3D, x: number, z: number, base: number, scale = 1, hue: "green" | "dark" | "blossom" = "green", seed = 1) {
  const leaves = { green: ["#2f6b3c", "#3d8a4a", "#285c33"], dark: ["#244a33", "#1f3d2b", "#2c5a3c"], blossom: ["#c86a9a", "#e08ab4", "#a85482"] }[hue];
  block(parent, 0.25 * scale, 1.1 * scale, 0.25 * scale, mat("#4a3426"), x, base, z);
  const r = mulberry(seed);
  for (let i = 0; i < 4; i++) {
    const s = (1.2 - i * 0.2) * scale;
    const c = block(parent, s, 0.6 * scale, s, mat(leaves[i % 3], 0.95), x + (r() - 0.5) * 0.3 * scale, base + (1.0 + i * 0.45) * scale, z + (r() - 0.5) * 0.3 * scale);
    c.rotation.y = r() * 0.6;
  }
}

export function bench(parent: THREE.Object3D, x: number, z: number, base: number, rotY = 0) {
  const g = new THREE.Group();
  block(g, 1.8, 0.1, 0.5, mat("#5a3e28"), 0, 0.42, 0);
  block(g, 1.8, 0.4, 0.08, mat("#5a3e28"), 0, 0.52, -0.22);
  for (const dx of [-0.75, 0.75]) block(g, 0.08, 0.42, 0.45, mat("#1c1b21", 0.4, 0.6), dx, 0, 0);
  g.position.set(x, base, z);
  g.rotation.y = rotY;
  parent.add(g);
}

export function vending(parent: THREE.Object3D, x: number, z: number, base: number, color: string, rotY = 0) {
  const g = new THREE.Group();
  block(g, 0.9, 1.9, 0.7, mat("#d9d6e0"), 0, 0, 0);
  plane(g, 0.7, 1.1, glow(color, 1.8), 0, 1.25, 0.36).userData.dynamic = true;
  block(g, 0.6, 0.2, 0.05, mat("#222"), 0, 0.3, 0.36);
  g.position.set(x, base, z);
  g.rotation.y = rotY;
  parent.add(g);
}

export function bollardRow(parent: THREE.Object3D, x0: number, x1: number, z: number, step: number, base: number, skip: (x: number) => boolean = () => false) {
  const m = mat("#2b2a31", 0.5, 0.4);
  for (let x = x0; x <= x1; x += step) if (!skip(x)) block(parent, 0.18, 0.7, 0.18, m, x, base, z);
}

export function crates(parent: THREE.Object3D, x: number, z: number, base: number, n: number, seed: number) {
  const r = mulberry(seed);
  const woods = ["#8a6a44", "#7a5a38", "#9a7a50"];
  for (let i = 0; i < n; i++) {
    const s = 0.4 + r() * 0.35;
    const c = block(parent, s, s, s, mat(woods[i % 3]), x + (r() - 0.5) * 1.2, base + (i > 2 && r() > 0.5 ? 0.45 : 0), z + (r() - 0.5) * 0.8);
    c.rotation.y = r();
  }
}

export function zBadge(parent: THREE.Object3D, x: number, y: number, z: number, radius: number, rotY = 0) {
  const m = new THREE.MeshBasicMaterial({ map: zcashBadge(), toneMapped: false, color: new THREE.Color(1.5, 1.5, 1.5) });
  const d = new THREE.Mesh(new THREE.CircleGeometry(radius, 28), m);
  d.position.set(x, y, z);
  d.rotation.y = rotY;
  parent.add(d);
  return d;
}

export function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- static batching ----------------------------------------------------------------------------

/**
 * Merge every static, opaque, single-material mesh under `root` into one mesh per material.
 * Thousands of props become a few dozen draw calls. Meshes flagged `userData.dynamic` stay as is.
 */
export function mergeStatic(root: THREE.Object3D) {
  root.updateMatrixWorld(true);
  const buckets = new Map<string, { mat: THREE.Material; geos: THREE.BufferGeometry[]; cast: boolean }>();
  const remove: THREE.Mesh[] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || Array.isArray(m.material) || m.userData.dynamic) return;
    const material = m.material as THREE.Material;
    if (material.transparent || (material as THREE.ShaderMaterial).isShaderMaterial) return;
    for (let p = m.parent; p; p = p.parent) if (p.userData.dynamic) return;
    const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    for (const name of Object.keys(g.attributes)) if (!["position", "normal", "uv"].includes(name)) g.deleteAttribute(name);
    g.applyMatrix4(m.matrixWorld);
    const key = material.uuid + (m.castShadow ? "|s" : "");
    let b = buckets.get(key);
    if (!b) buckets.set(key, (b = { mat: material, geos: [], cast: m.castShadow }));
    b.geos.push(g);
    remove.push(m);
  });
  for (const m of remove) m.parent?.remove(m);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  for (const b of buckets.values()) {
    const merged = mergeGeometries(b.geos, false);
    if (!merged) continue;
    merged.applyMatrix4(inv);
    const mesh = new THREE.Mesh(merged, b.mat);
    mesh.castShadow = b.cast;
    mesh.receiveShadow = true;
    root.add(mesh);
  }
  return { merged: remove.length, drawCalls: buckets.size };
}
