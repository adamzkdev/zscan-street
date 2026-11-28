import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { RGeo } from "./buildings";
import type { Slot } from "./lmkit";
import { realMat } from "./mats";

/**
 * The geometry kit's output (src/scene/real/lmkit.ts, slots → arrays in metres) as three.js
 * geometries and meshes on the main thread: for the realistic things made there (the metro's cars,
 * the NU7 quarter, the City Works sites). Materials are the city's shared ones (realMat).
 */

export type KitGeos = Partial<Record<string, THREE.BufferGeometry>>;

/** Arrays to geometries, raised by `y`. */
export function kitGeos(out: Partial<Record<Slot, RGeo>>, y = 0): KitGeos {
  const r: KitGeos = {};
  for (const [slot, d] of Object.entries(out) as [Slot, RGeo][]) {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(d.pos, 3));
    g.setAttribute("normal", new THREE.BufferAttribute(d.nor, 3));
    g.setAttribute("uv", new THREE.BufferAttribute(d.uv, 2));
    g.setAttribute("color", new THREE.BufferAttribute(d.col, 3));
    g.setIndex(Array.from(d.idx));
    if (y) g.translate(0, y, 0);
    g.computeBoundingSphere();
    r[slot] = g;
  }
  return r;
}

/** Several pieces merged per slot (one draw call each). The parts are left as they were. */
export function mergeKit(parts: KitGeos[]): KitGeos {
  const out: KitGeos = {};
  const slots = new Set(parts.flatMap((p) => Object.keys(p)));
  for (const s of slots) {
    const list = parts.map((p) => p[s]).filter((g): g is THREE.BufferGeometry => !!g);
    if (list.length) out[s] = list.length === 1 ? list[0].clone() : (mergeGeometries(list) ?? undefined);
  }
  return out;
}

const LIT = new Set(["lm.glow", "lm.glow.night", "neon"]);

/** Meshes over the geometries, the city's materials; `shared`: the geometries are kept on dispose. */
export function kitMeshes(g: KitGeos, o: { shadows?: boolean; shared?: boolean } = {}) {
  const out = new THREE.Group();
  for (const [slot, geo] of Object.entries(g)) {
    if (!geo) continue;
    if (o.shared) geo.userData.shared = true;
    const mesh = new THREE.Mesh(geo, realMat(slot as never));
    const lit = LIT.has(slot);
    mesh.castShadow = !lit && o.shadows !== false && slot !== "lm.glass" && slot !== "lm.glass.clear";
    mesh.receiveShadow = !lit;
    if (o.shared) mesh.userData.shared = true;
    out.add(mesh);
  }
  return out;
}
