import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { PROP_HOLES, PROP_HOLE_N } from "../voxel/mesher";
import { GROUND } from "./ground";
import { maps } from "./tex";
import { plantTrees, type TreeSpot } from "./trees";
import { build2, KINDS2, LIGHT2, RADIUS2, SOLID2, type Kit } from "./props2";

/**
 * The street's furniture, realistic (src/scene/real): powder-coated street lamps with a lit head,
 * benches of wooden slats on cast frames, steel bollards, litter bins, hydrants, post boxes,
 * vending machines with their lit fronts, street signs, bus-stop and taxi poles, concrete planters
 * with a real shrub. Built once per kind (merged per material), drawn as instanced meshes: a few
 * dozen draw calls for the whole city. Same places, sizes and facings as the voxel props they
 * replace (the plan's positions, the collisions); what the game knocks down (PROP_HOLES) goes.
 */

/** The kinds this module draws (the rest of the plan's props stay with the voxel props worker). */
export const REAL_PROPS = new Set(["lamp", "bench", "bollard", "trashBin", "hydrant", "mailbox", "planter", "vending", "streetSign", "stopPole", "taxiSign", "shelter", ...KINDS2]);

/** The kinds the game never knocks over (src/gta FURN): baked still into tiles, not instanced. */
const STILL = new Set(["stall", "crates", "trashBags", "gate", "rail", "bamboo", "bridge", "stones", "tieredFountain", "greenhouse", "pole"]);
const BAKE_TILE = 96;

/** Radius for the walker's collisions (as the voxel props had them). */
const RADIUS: Record<string, number> = { lamp: 0.18, bench: 0.5, bollard: 0.18, trashBin: 0.35, hydrant: 0.2, mailbox: 0.35, planter: 0.75, vending: 0.6, streetSign: 0.15, stopPole: 0.2, taxiSign: 0.2 };

// ---- materials ---------------------------------------------------------------------------------

const HOLE_HEAD = /* glsl */ `
uniform vec4 uHoles[48];
uniform int uHoleN;
`;
const HOLE_BODY = /* glsl */ `
#ifdef USE_INSTANCING
{
  vec2 io = (modelMatrix * vec4(instanceMatrix[3].xyz, 1.0)).xz;
  for (int i = 0; i < 48; i++) {
    if (i >= uHoleN) break;
    if (distance(io, uHoles[i].xy) < 0.6) { transformed = vec3(0.0, -500.0, 0.0); break; }
  }
}
#endif
`;
/** What the game knocks down disappears from the instanced furniture (the same holes as the voxel props). */
function holes<T extends THREE.Material>(m: T): T {
  const prev = m.onBeforeCompile;
  const hadOwn = prev !== THREE.Material.prototype.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    if (hadOwn) prev.call(m, sh, r);
    sh.uniforms.uHoles = PROP_HOLES;
    sh.uniforms.uHoleN = PROP_HOLE_N;
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\n" + HOLE_HEAD).replace("#include <begin_vertex>", "#include <begin_vertex>\n" + HOLE_BODY);
  };
  const base = m.customProgramCacheKey.bind(m);
  m.customProgramCacheKey = () => `${base()}|holes`;
  return m;
}

const mats = new Map<string, THREE.Material>();
function M(key: string, make: () => THREE.Material) {
  let m = mats.get(key);
  if (!m) {
    m = holes(make());
    m.userData.shared = true;
    mats.set(key, m);
  }
  return m;
}
const paint = (hex: string, rough = 0.45, metal = 0.6) => M(`paint:${hex}:${rough}:${metal}`, () => new THREE.MeshStandardMaterial({ color: hex, roughness: rough, metalness: metal }));
const steel = () => M("steel", () => new THREE.MeshStandardMaterial({ color: "#a9adb3", roughness: 0.32, metalness: 0.9 }));
const wood = () =>
  M("wood", () => {
    const mp = maps("Wood049");
    return new THREE.MeshStandardMaterial({ map: mp.map, normalMap: mp.normalMap, roughnessMap: mp.roughnessMap, roughness: 1, color: "#d8c0a0" });
  });
const glow = (hex: string, k = 3) =>
  M(`glow:${hex}:${k}`, () => {
    const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(k), toneMapped: false });
    // (lit at night only: the street's night switch shows it)
    m.userData.night = true;
    return m;
  });
const lens = () => M("lens", () => new THREE.MeshStandardMaterial({ color: "#d8d4c8", roughness: 0.2, metalness: 0.1, emissive: "#ffe8c0", emissiveIntensity: 0.15 }));

/** What the other kinds' builders (props2.ts) use: the same shared materials (with the knock-down holes). */
const KIT: Kit = {
  M,
  add: (parts, m, g) => add(parts, m, g),
  paint: (hex, rough, metal) => paint(hex, rough, metal),
  steel: () => steel(),
  wood: () => wood(),
  glow: (hex, k) => glow(hex, k),
};

// ---- geometry helpers -------------------------------------------------------------------------

type Parts = Map<THREE.Material, THREE.BufferGeometry[]>;
function add(parts: Parts, m: THREE.Material, g: THREE.BufferGeometry) {
  const gg = g.index ? g.toNonIndexed() : g;
  // (every part with uvs, so the merge keeps them)
  if (!gg.getAttribute("uv")) gg.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array((gg.getAttribute("position").count * 2) | 0), 2));
  const l = parts.get(m);
  if (l) l.push(gg);
  else parts.set(m, [gg]);
}
const cyl = (r0: number, r1: number, h: number, x: number, y: number, z: number, seg = 14) => new THREE.CylinderGeometry(r1, r0, h, seg).translate(x, y + h / 2, z);
const box = (w: number, h: number, d: number, x: number, y: number, z: number, r = 0) => (r > 0 ? new RoundedBoxGeometry(w, h, d, 2, r) : new THREE.BoxGeometry(w, h, d)).translate(x, y + h / 2, z);
/** UVs of a box in metres over a tile (planks along x). */
function metreUv(g: THREE.BufferGeometry, tile: number) {
  const p = g.getAttribute("position"),
    n = g.getAttribute("normal"),
    uv = g.getAttribute("uv");
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)),
      ay = Math.abs(n.getY(i));
    const u = ax > 0.5 ? p.getZ(i) : p.getX(i);
    const v = ay > 0.5 ? p.getZ(i) : p.getY(i);
    uv.setXY(i, u / tile, v / tile);
  }
  return g;
}

// ---- the kinds (local: origin on the ground at the prop's spot, the arm / the seat's front +z) ----

/** A street lamp: a tapered pole on its base, an outreach arm over the kerb, a flat LED head. Returns its head's light point too. */
function lamp(parts: Parts, color: string) {
  const pole = paint("#2c2f34", 0.45, 0.7);
  add(parts, pole, cyl(0.2, 0.2, 0.08, 0, 0, -0.6, 16));
  add(parts, pole, cyl(0.14, 0.12, 0.6, 0, 0.08, -0.6, 16));
  add(parts, pole, cyl(0.1, 0.065, 6.8, 0, 0.6, -0.6, 12));
  // the arm: up and over toward the street, a gentle curve in three pieces
  const arm = [
    new THREE.Vector3(0, 7.1, -0.6),
    new THREE.Vector3(0, 7.45, -0.1),
    new THREE.Vector3(0, 7.55, 0.6),
    new THREE.Vector3(0, 7.5, 1.3),
  ];
  for (let i = 1; i < arm.length; i++) {
    const a = arm[i - 1],
      b = arm[i];
    const len = a.distanceTo(b);
    const g = new THREE.CylinderGeometry(0.045, 0.05, len, 10).translate(0, len / 2, 0);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()));
    g.translate(a.x, a.y, a.z);
    add(parts, pole, g);
  }
  // the head: a slim housing, its lens beneath (lit at night)
  add(parts, pole, box(0.32, 0.1, 0.7, 0, 7.38, 1.55, 0.03));
  add(parts, lens(), box(0.24, 0.02, 0.58, 0, 7.365, 1.55));
  add(parts, glow(color, 3.2), box(0.22, 0.012, 0.54, 0, 7.355, 1.55));
  return new THREE.Vector3(0, 7.2, 1.55);
}

function bench(parts: Parts) {
  const frame = paint("#1f2226", 0.5, 0.75);
  for (const x of [-0.82, 0.82]) {
    // cast side frames: legs, the seat's support, the back's post
    add(parts, frame, box(0.06, 0.44, 0.06, x, 0, 0.32));
    add(parts, frame, box(0.06, 0.44, 0.06, x, 0, -0.02));
    add(parts, frame, box(0.06, 0.05, 0.5, x, 0.42, 0.16));
    const back = box(0.06, 0.5, 0.05, x, 0.44, -0.04);
    back.rotateX(-0.12);
    add(parts, frame, back);
  }
  // the slats: five for the seat, three for the back
  for (let i = 0; i < 5; i++) add(parts, wood(), metreUv(box(1.9, 0.035, 0.08, 0, 0.47, -0.0 + i * 0.095, 0.012), 1.5));
  for (let i = 0; i < 3; i++) {
    const s = metreUv(box(1.9, 0.08, 0.03, 0, 0.6 + i * 0.12, -0.06 - i * 0.015, 0.01), 1.5);
    add(parts, wood(), s);
  }
}

function bollard(parts: Parts) {
  add(parts, paint("#26292e", 0.4, 0.7), cyl(0.1, 0.09, 0.9, 0, 0, 0, 16));
  add(parts, paint("#26292e", 0.4, 0.7), new THREE.SphereGeometry(0.09, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0.9, 0));
  add(parts, paint("#e8b42c", 0.35, 0.2), cyl(0.102, 0.098, 0.07, 0, 0.7, 0, 16));
}

function trashBin(parts: Parts) {
  const body = paint("#2f4a3c", 0.5, 0.45);
  add(parts, body, cyl(0.27, 0.29, 0.86, 0, 0, 0, 18));
  add(parts, steel(), cyl(0.3, 0.3, 0.06, 0, 0.86, 0, 18));
  add(parts, paint("#1c1e22", 0.6, 0.3), cyl(0.12, 0.12, 0.02, 0, 0.92, 0, 14));
}

function hydrant(parts: Parts) {
  const red = paint("#b8261f", 0.4, 0.35);
  add(parts, red, cyl(0.13, 0.13, 0.08, 0, 0, 0, 14));
  add(parts, red, cyl(0.1, 0.09, 0.5, 0, 0.08, 0, 14));
  add(parts, red, new THREE.SphereGeometry(0.1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0.58, 0));
  add(parts, steel(), cyl(0.03, 0.03, 0.05, 0, 0.66, 0, 8));
  for (const s of [-1, 1]) add(parts, red, new THREE.CylinderGeometry(0.045, 0.045, 0.12, 10).rotateZ(Math.PI / 2).translate(s * 0.13, 0.42, 0));
  add(parts, red, new THREE.CylinderGeometry(0.06, 0.06, 0.1, 10).rotateX(Math.PI / 2).translate(0, 0.42, 0.12));
}

function mailbox(parts: Parts) {
  const red = paint("#c0251c", 0.35, 0.3);
  add(parts, paint("#2a2c30", 0.5, 0.6), cyl(0.06, 0.06, 0.62, 0, 0, 0, 10));
  add(parts, red, box(0.52, 0.86, 0.48, 0, 0.62, 0, 0.06));
  add(parts, paint("#1a1a1e", 0.6, 0.4), box(0.32, 0.03, 0.02, 0, 1.22, 0.25));
  add(parts, red, new THREE.CylinderGeometry(0.26, 0.26, 0.48, 18, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateY(Math.PI / 2).translate(0, 1.48, 0));
}

const vendFronts = new Map<string, THREE.Texture>();
function vendFront(body: string) {
  let t = vendFronts.get(body);
  if (t) return t;
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 512;
  const g = c.getContext("2d")!;
  g.fillStyle = "#f4f6fa";
  g.fillRect(0, 0, 256, 512);
  // rows of drinks behind the glass, the buttons under each
  const cols = ["#d8282a", "#2a6ad8", "#f4b728", "#2aa858", "#e86a2a", "#8a3ad8", "#e8e8e8", "#3a2a1a"];
  for (let row = 0; row < 4; row++)
    for (let k = 0; k < 6; k++) {
      const x = 18 + k * 38,
        y = 24 + row * 70;
      g.fillStyle = cols[(row * 3 + k * 5) % cols.length];
      g.fillRect(x, y, 24, 46);
      g.fillStyle = "rgba(255,255,255,0.5)";
      g.fillRect(x + 3, y + 4, 4, 36);
      g.fillStyle = "#3a3a44";
      g.fillRect(x + 6, y + 52, 12, 6);
    }
  g.fillStyle = body;
  g.fillRect(0, 300, 256, 212);
  g.fillStyle = "#1a1a20";
  g.fillRect(40, 420, 176, 50);
  g.fillStyle = "#2a2a30";
  g.fillRect(200, 320, 34, 60);
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.userData.shared = true;
  vendFronts.set(body, t);
  return t;
}
function vending(parts: Parts, theme: string) {
  const col = ({ red: "#b8322e", blue: "#2e5ab8", white: "#e0dcd8", green: "#2e8a5a" } as Record<string, string>)[theme] ?? "#b8322e";
  add(parts, paint(col, 0.35, 0.3), box(1.0, 1.9, 0.75, 0, 0, -0.02, 0.03));
  const front = new THREE.PlaneGeometry(0.9, 1.75).translate(0, 0.96, 0.36);
  add(parts, M(`vend:${col}`, () => new THREE.MeshStandardMaterial({ map: vendFront(col), emissiveMap: vendFront(col), emissive: "#ffffff", emissiveIntensity: 0.55, roughness: 0.25, metalness: 0.1 })), front);
}

function streetSign(parts: Parts) {
  add(parts, steel(), cyl(0.04, 0.035, 2.9, 0, 0, 0, 10));
  add(parts, paint("#1f5aa8", 0.4, 0.3), box(0.9, 0.5, 0.03, 0, 2.3, 0.05, 0.01));
  add(parts, paint("#f2f2f2", 0.5, 0.1), box(0.8, 0.08, 0.005, 0, 2.5, 0.068));
}
function stopPole(parts: Parts) {
  add(parts, paint("#3a3d44", 0.45, 0.6), cyl(0.045, 0.04, 3.4, 0, 0, 0, 10));
  add(parts, paint("#f4b728", 0.35, 0.2), new THREE.CylinderGeometry(0.28, 0.28, 0.04, 22).rotateX(Math.PI / 2).translate(0, 2.95, 0.04));
  add(parts, glow("#fff0d0", 1.4), box(0.5, 0.9, 0.04, 0, 1.4, 0.05));
  add(parts, paint("#2a2c32", 0.5, 0.5), box(0.56, 0.96, 0.03, 0, 1.37, 0.02));
}
function taxiSign(parts: Parts) {
  add(parts, paint("#3a3d44", 0.45, 0.6), cyl(0.045, 0.04, 3.6, 0, 0, 0, 10));
  add(parts, paint("#26262c", 0.5, 0.5), box(1.2, 0.7, 0.18, 0, 3.0, 0, 0.03));
  add(parts, glow("#ffc84a", 1.6), box(1.0, 0.45, 0.01, 0, 3.12, 0.095));
}
function planter(parts: Parts) {
  add(parts, GROUND.stone(), box(1.4, 0.55, 1.4, 0, 0, 0, 0.04));
  add(parts, paint("#3a2a1e", 0.95, 0), box(1.26, 0.02, 1.26, 0, 0.55, 0));
}

// ---- placement ---------------------------------------------------------------------------------

export interface PropSpot {
  type: string;
  args: unknown[];
  x: number;
  z: number;
  y?: number;
  rot: number;
}

/**
 * Every prop of the list of a kind this module draws, instanced, under `parent`. Returns the
 * lamps' light points (for the street's lamp lights, as the props worker gave them) and the
 * collision circles.
 */
export function placeProps(parent: THREE.Object3D, list: PropSpot[]) {
  const byKey = new Map<string, PropSpot[]>();
  const shelters: PropSpot[] = [];
  for (const p of list) {
    if (!REAL_PROPS.has(p.type)) continue;
    if (p.type === "shelter") {
      shelters.push(p);
      continue;
    }
    const variant = p.type === "lamp" ? String(p.args[0] ?? "#ffb46b") : p.type === "vending" ? String(p.args[0] ?? "red") : (KINDS2 as readonly string[]).includes(p.type) ? JSON.stringify(p.args) : "";
    const k = `${p.type}|${variant}`;
    const l = byKey.get(k);
    if (l) l.push(p);
    else byKey.set(k, [p]);
  }
  const lights: [number, number, number, string][] = [];
  const baked = new Map<string, Map<string, { mat: THREE.Material; gs: THREE.BufferGeometry[] }>>();
  const circles: [number, number, number][] = [];
  const rects: [number, number, number, number][] = [];
  const shrubs: TreeSpot[] = [];
  const m = new THREE.Matrix4(),
    q = new THREE.Quaternion(),
    one = new THREE.Vector3(1, 1, 1),
    pos = new THREE.Vector3(),
    Y = new THREE.Vector3(0, 1, 0);
  for (const [k, ps] of byKey) {
    const bar = k.indexOf("|");
    const type = k.slice(0, bar),
      variant = k.slice(bar + 1);
    const parts: Parts = new Map();
    let head: THREE.Vector3 | null = null;
    if (type === "lamp") head = lamp(parts, variant);
    else if (type === "bench") bench(parts);
    else if (type === "bollard") bollard(parts);
    else if (type === "trashBin") trashBin(parts);
    else if (type === "hydrant") hydrant(parts);
    else if (type === "mailbox") mailbox(parts);
    else if (type === "vending") vending(parts, variant);
    else if (type === "streetSign") streetSign(parts);
    else if (type === "stopPole") stopPole(parts);
    else if (type === "taxiSign") taxiSign(parts);
    else if (type === "planter") planter(parts);
    else if ((KINDS2 as readonly string[]).includes(type)) build2(KIT, parts, type, JSON.parse(variant || "[]"));
    for (const [mat, geos] of parts) {
      const geo = mergeGeometries(geos, false);
      if (!geo) continue;
      // what the game never knocks down (stalls, crates, gates, rails…): baked into one still mesh per
      // material and tile (below), not an instanced draw per variant and material city-wide — the
      // market's stalls alone were seventy draws a frame
      if (STILL.has(type)) {
        for (const p of ps) {
          q.setFromAxisAngle(Y, p.rot);
          m.compose(pos.set(p.x, p.y ?? 0.2, p.z), q, one);
          const k = `${Math.floor(p.x / BAKE_TILE)},${Math.floor(p.z / BAKE_TILE)}`;
          let byMat = baked.get(k);
          if (!byMat) baked.set(k, (byMat = new Map()));
          // (by material and by attributes: only alike geometries merge)
          const sig = `${mat.uuid}|${Object.keys(geo.attributes).sort().join()}|${!!geo.index}`;
          const l = byMat.get(sig);
          const g = geo.clone().applyMatrix4(m);
          if (l) l.gs.push(g);
          else byMat.set(sig, { mat, gs: [g] });
        }
        continue;
      }
      const im = new THREE.InstancedMesh(geo, mat, ps.length);
      ps.forEach((p, i) => {
        q.setFromAxisAngle(Y, p.rot);
        m.compose(pos.set(p.x, p.y ?? 0.2, p.z), q, one);
        im.setMatrixAt(i, m);
      });
      im.castShadow = !(mat as THREE.MeshBasicMaterial).isMeshBasicMaterial;
      im.receiveShadow = true;
      im.computeBoundingSphere();
      im.name = `real:props:${type}`;
      parent.add(im);
    }
    for (const p of ps) {
      // (what a body bumps into whole: its footprint; posts and trunks a circle; flat things nothing)
      const solid = SOLID2[type];
      if (solid) {
        const turned = Math.abs(Math.sin(p.rot)) > 0.7;
        const hw = (turned ? solid[1] : solid[0]) / 2,
          hd = (turned ? solid[0] : solid[1]) / 2;
        rects.push([p.x - hw, p.z - hd, p.x + hw, p.z + hd]);
      } else {
        const rr = RADIUS2[type] ?? RADIUS[type] ?? 0.3;
        if (rr > 0) circles.push([p.x, p.z, rr]);
      }
      const l2 = LIGHT2[type];
      if (l2) {
        const w = new THREE.Vector3(l2[0], l2[1], l2[2]).applyAxisAngle(Y, p.rot);
        lights.push([p.x + w.x, (p.y ?? 0.2) + w.y, p.z + w.z, l2[3]]);
      }
      if (head) {
        const w = head.clone().applyAxisAngle(Y, p.rot);
        lights.push([p.x + w.x, (p.y ?? 0.2) + w.y, p.z + w.z, variant]);
      }
      if (type === "planter") shrubs.push({ x: p.x, z: p.z, y: (p.y ?? 0.2) + 0.5, rot: p.rot, species: "bush", seed: Math.round(p.x * 7 + p.z * 3) });
    }
  }
  if (shrubs.length) plantTrees(parent, shrubs);
  // the baked still props: a mesh per tile and material, placed at its tile's centre (a mesh built
  // in world coordinates sits at the origin, and the draw-saver measured it from there)
  for (const [k, byMat] of baked) {
    const [tx, tz] = k.split(",").map(Number);
    const cx = (tx + 0.5) * BAKE_TILE,
      cz = (tz + 0.5) * BAKE_TILE;
    for (const { mat, gs } of byMat.values()) {
      const g = mergeGeometries(gs, false);
      if (!g) continue;
      g.translate(-cx, 0, -cz);
      g.computeBoundingSphere();
      const mesh = new THREE.Mesh(g, mat);
      mesh.position.set(cx, 0, cz);
      mesh.castShadow = !(mat as THREE.MeshBasicMaterial).isMeshBasicMaterial;
      mesh.receiveShadow = true;
      mesh.name = "real:props:still";
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      parent.add(mesh);
    }
  }
  // the plan's own bus shelter (the heart's): the realistic one, its light, its footprint
  for (const p of shelters) {
    const sh = realShelter();
    sh.position.set(p.x, p.y ?? 0.2, p.z);
    sh.rotation.y = p.rot;
    sh.name = "real:props:shelter";
    parent.add(sh);
    const w = new THREE.Vector3(0, 2.33, 0.17).applyAxisAngle(Y, p.rot);
    lights.push([p.x + w.x, (p.y ?? 0.2) + w.y, p.z + w.z, "#ffd28a"]);
    const turned = Math.abs(Math.sin(p.rot)) > 0.7;
    rects.push(turned ? [p.x - 0.85, p.z - 2.35, p.x + 0.85, p.z + 2.35] : [p.x - 2.35, p.z - 0.85, p.x + 2.35, p.z + 0.85]);
  }
  return { lights, circles, rects };
}

/**
 * A bus shelter (alive/people.ts places them): steel posts, a glass back and end, a flat roof with
 * a light strip under it (lit at night), a slatted bench; the advert's lightbox is put on its open
 * end by the caller (local x +2.36). Same footprint as the voxel one: 4.7 × 1.7 m, open to +z.
 */
/** One prop on its own, plain meshes on the shared parts (a lamp the game knocks over falls as this): its foot at the origin, front +z. */
export function realPropObject(type: string, args: unknown[] = []) {
  const parts: Parts = new Map();
  if (type === "lamp") lamp(parts, String(args[0] ?? "#ffb46b"));
  else if (type === "bollard") bollard(parts);
  else if (type === "trashBin") trashBin(parts);
  else if (type === "streetSign") streetSign(parts);
  else if (type === "stopPole") stopPole(parts);
  else if ((KINDS2 as readonly string[]).includes(type)) build2(KIT, parts, type, args);
  const g = new THREE.Group();
  for (const [mat, geos] of parts) {
    const geo = mergeGeometries(geos, false);
    if (!geo) continue;
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = !(mat as THREE.MeshBasicMaterial).isMeshBasicMaterial;
    g.add(m);
  }
  return g;
}

export function realShelter() {
  const g = new THREE.Group();
  const frame = paint("#2a2d32", 0.4, 0.75);
  const glass = M("shelter-glass", () => new THREE.MeshStandardMaterial({ color: "#a8c4d4", roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.22, depthWrite: false }));
  const mesh = (geo: THREE.BufferGeometry, m: THREE.Material) => {
    // (all non-indexed: the caller merges its statics per material as they come)
    const o = new THREE.Mesh(geo.index ? geo.toNonIndexed() : geo, m);
    o.castShadow = m !== glass;
    o.receiveShadow = true;
    g.add(o);
  };
  for (const x of [-2.2, 2.2]) for (const z of [-0.72, 0.62]) mesh(box(0.08, 2.5, 0.08, x, 0, z), frame);
  mesh(box(4.8, 0.12, 1.9, 0, 2.5, -0.05, 0.02), frame);
  mesh(box(4.4, 0.02, 0.18, 0, 2.48, 0.2), glow("#ffe2b0", 2.6));
  mesh(box(4.36, 2.05, 0.02, 0, 0.32, -0.74), glass);
  mesh(box(0.02, 2.05, 1.3, -2.22, 0.32, -0.08), glass);
  mesh(box(4.4, 0.05, 0.05, 0, 0.3, -0.74), frame);
  mesh(box(4.4, 0.05, 0.05, 0, 2.38, -0.74), frame);
  // the bench along the back
  for (const x of [-1.6, 0, 1.6]) mesh(box(0.05, 0.44, 0.3, x, 0, -0.5), frame);
  for (let i = 0; i < 3; i++) mesh(metreUv(box(3.8, 0.03, 0.09, 0, 0.45, -0.62 + i * 0.1, 0.01), 1.5), wood());
  // the advert's case on the open end
  mesh(box(0.1, 2.1, 1.3, 2.3, 0.25, -0.08, 0.02), frame);
  return g;
}
