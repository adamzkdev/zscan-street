import * as THREE from "three";

/**
 * The realistic materials' textures (public/tex: photographed PBR sets from ambientCG, CC0, see
 * public/tex/CREDITS.md and scripts/cc0-textures.mjs): colour, normal, roughness and (some) ambient
 * occlusion maps, loaded once each when first asked for, repeating, sharp at grazing angles.
 *
 * Geometry that wears them carries its UVs in metres divided by the set's tile size (`TILE`): a
 * wall 12 m wide in a brick set whose tile is 1.6 m runs u from 0 to 7.5. One material per set and
 * tint is shared by everything that wears it (merged meshes: a few draw calls for the city).
 */

/** Every set, by id: how many metres one repeat of the texture covers (width, height). */
export const TILE: Record<string, [number, number]> = {
  Asphalt031: [6, 6],
  Asphalt025C: [6, 6],
  PavingStones130: [2.4, 2.4],
  Tiles074: [1.6, 1.6],
  Concrete034: [2, 2],
  Grass004: [3, 3],
  Ground054: [3, 3],
  Gravel022: [2, 2],
  Plaster001: [2.5, 2.5],
  PaintedPlaster017: [2.5, 2.5],
  Concrete019: [3, 3],
  Bricks060: [1.6, 1.6],
  Bricks075A: [1.6, 1.6],
  Metal032: [2, 2],
  Wood049: [1.5, 1.5],
  RoofingTiles006: [2, 2],
  // the photographed facades: about five floors of 3.2 m and five or six bays per repeat
  Facade001: [12, 12],
  Facade005: [9, 9],
  Facade006: [16, 16],
  Facade017: [14, 14],
  Facade018A: [16, 16],
  Facade019A: [16, 16],
  Facade020A: [16, 16],
  Facade009: [16, 16],
  Facade016: [16, 16],
};

/** Which maps each set has (the rest are left out of its material). */
const HAS_AO = new Set(["Asphalt031", "Asphalt025C", "PavingStones130", "Grass004", "Ground054", "Gravel022", "Bricks060", "Bricks075A", "RoofingTiles006", "Facade018A", "Facade019A", "Facade020A"]);

const BASE = `${import.meta.env?.BASE_URL ?? "/"}tex/`;
const loader = new THREE.TextureLoader();
const cache = new Map<string, THREE.Texture>();
let anisotropy = 8;

/** The renderer's best anisotropy (call once with the renderer). */
export function texSetup(renderer: THREE.WebGLRenderer) {
  anisotropy = Math.min(16, renderer.capabilities.getMaxAnisotropy());
  for (const t of cache.values()) t.anisotropy = anisotropy;
}

function load(id: string, map: "color" | "normal" | "rough" | "ao") {
  const key = `${id}/${map}`;
  let t = cache.get(key);
  if (t) return t;
  t = loader.load(`${BASE}${id}/${map}.webp`);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = anisotropy;
  t.colorSpace = map === "color" ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.userData.shared = true;
  cache.set(key, t);
  return t;
}

/** The maps of a set (shared textures). */
export function maps(id: string) {
  return {
    map: load(id, "color"),
    normalMap: load(id, "normal"),
    roughnessMap: load(id, "rough"),
    aoMap: HAS_AO.has(id) ? load(id, "ao") : null,
  };
}

const mats = new Map<string, THREE.MeshStandardMaterial>();

export interface RealOpts {
  /** Multiplied into the colour map (plaster in any paint). */
  tint?: THREE.ColorRepresentation;
  roughness?: number;
  metalness?: number;
  /** Normal map strength. */
  normal?: number;
  /** Night windows: a second set whose colour lights up (`emissiveMap`) as night falls (see `night`). */
  glowSet?: string;
  envMapIntensity?: number;
}

/**
 * The shared material for a set (and options): MeshStandardMaterial with its maps. Its UVs are the
 * geometry's (metres / TILE). `aoMap` reads the first UV set (three r15x+: `aoMap` uses uv by default
 * as long as `aoMapChannel` is 0).
 */
export function real(id: string, o: RealOpts = {}) {
  const key = `${id}|${JSON.stringify(o)}`;
  let m = mats.get(key);
  if (m) return m;
  const mp = maps(id);
  m = new THREE.MeshStandardMaterial({
    map: mp.map,
    normalMap: mp.normalMap,
    roughnessMap: mp.roughnessMap,
    aoMap: mp.aoMap,
    aoMapIntensity: 0.8,
    color: new THREE.Color(o.tint ?? "#ffffff"),
    roughness: o.roughness ?? 1,
    metalness: o.metalness ?? 0,
    envMapIntensity: o.envMapIntensity ?? 1,
  });
  if (o.normal !== undefined) m.normalScale.setScalar(o.normal);
  if (o.glowSet) {
    m.emissiveMap = load(o.glowSet, "color");
    m.emissive = new THREE.Color("#ffffff");
    m.emissiveIntensity = 0;
    m.userData.nightGlow = true;
  }
  m.userData.shared = true;
  m.userData.real = id;
  mats.set(key, m);
  return m;
}

/** Every real material made so far (for the theme and the day: their night glow, their wetness). */
export function realMaterials() {
  return mats.values();
}

/** Night falls on the windows: the night sets' lit rooms show through (0 by day … 1 at night). */
export function nightGlow(k: number) {
  for (const m of mats.values()) if (m.userData.nightGlow) m.emissiveIntensity = k * 1.6;
}

/** UVs for a box face from its size in metres and the set's tile (u along, v up). */
export function uvScale(id: string): [number, number] {
  const t = TILE[id] ?? [2, 2];
  return [1 / t[0], 1 / t[1]];
}
