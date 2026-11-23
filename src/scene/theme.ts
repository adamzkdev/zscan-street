import * as THREE from "three";
import type { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import type { Decor } from "./decor";
import type { LampLights } from "./post";
import { MATERIALS } from "./voxel/mesher";
import { GLASS_NIGHT } from "./voxel/surface";
import { DETAIL_WET } from "./detail";
import { cityEnvironment } from "./envmap";
import { GAME_HORIZON, SKY_HORIZON, skyTexture } from "./skydome";

/** The game (src/gta) is on: its clearer day (a deeper sky, a blue haze, the fog farther out). */
export const ATMOS = { game: false };

/** Where the sun (by night the moon) stands, seen from the city: the shadow light's offset. */
const SUN_DIR = new THREE.Vector3(-18, 34, 22);

export type Theme = "day" | "night";

export interface ThemeTargets {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  hemi: THREE.HemisphereLight;
  sun: THREE.DirectionalLight;
  bloom: UnrealBloomPass;
  lamps: LampLights;
  decor: Decor;
  city: THREE.Object3D;
}

const EMIT_NIGHT = new THREE.Color(1, 1, 1);
const EMIT_DAY = new THREE.Color(0.62, 0.62, 0.66);

/**
 * Day: a clean, bright miniature under a soft sun (dry asphalt, lamps off, faint neon).
 * Night: the rainy cyberpunk street with its glowing signs and wet reflections.
 */
export function applyTheme(t: ThemeTargets, theme: Theme) {
  const day = theme === "day";
  const { renderer, scene, hemi, sun, bloom } = t;
  const game = ATMOS.game && day;
  scene.background = skyTexture(day, SUN_DIR, game);
  scene.fog = day ? new THREE.Fog(game ? GAME_HORIZON : SKY_HORIZON.day, 170, 360) : new THREE.Fog(SKY_HORIZON.night, 150, 330);
  scene.environment = cityEnvironment(renderer, day);
  scene.environmentIntensity = day ? 0.45 : 0.24;
  renderer.toneMappingExposure = day ? 0.92 : 1.05;
  hemi.color.set(day ? (game ? "#d6e4ff" : "#ffffff") : "#6a64a8");
  hemi.groundColor.set(day ? (game ? "#a89c8c" : "#aaa4cc") : "#1a1420");
  // by day a warmer sun and a softer, cooler fill: the shadows read, the city gets its depth (in
  // the game a little more so: a sky-blue fill, the warm bounce of the street, deeper shadows)
  hemi.intensity = day ? (game ? 0.72 : 0.85) : 1.5;
  sun.color.set(day ? (game ? "#ffe8c8" : "#ffefd6") : "#9fb0ff");
  sun.intensity = day ? (game ? 3.85 : 3.6) : 0.9;
  sun.shadow.radius = day ? 3 : 1;
  sun.shadow.intensity = day ? (game ? 0.86 : 0.72) : 1;
  bloom.strength = day ? 0.08 : 0.38;
  bloom.threshold = day ? 1.2 : 0.95;
  t.lamps.scale = day ? 0 : 1;
  t.lamps.update(0, new THREE.Vector3(), true);
  MATERIALS.emit.color.copy(day ? EMIT_DAY : EMIT_NIGHT);
  // by night the tarmac is damp and holds puddles (detail.ts), the rooms behind the glass light up
  // (voxel/surface.ts)
  DETAIL_WET.value = day ? 0 : 0.85;
  GLASS_NIGHT.value = day ? 0 : 1;
  t.decor.setRain(!day && rainWanted);
  t.city.traverse((o) => {
    const mats = (o as THREE.Mesh).material;
    if (!mats) return;
    for (const m of Array.isArray(mats) ? mats : [mats]) {
      if (m.userData.night) o.visible = !day;
      const s = m as THREE.MeshStandardMaterial;
      // the roads are dry tarmac, day and night (no wet sheen)
      if (m.userData.wet) {
        s.roughness = 0.92;
        s.metalness = 0;
      }
      if (m.userData.dayMap) {
        if (day && !(m.userData.dayTex instanceof THREE.Texture)) m.userData.dayTex = m.userData.dayMap();
        s.map = day ? m.userData.dayTex : m.userData.nightMap;
        s.needsUpdate = true;
      }
      if (m.userData.dayColor) {
        m.userData.nightColor ??= "#" + s.color.getHexString();
        s.color.set(day ? m.userData.dayColor : m.userData.nightColor);
      }
    }
  });
  document.documentElement.dataset.theme = theme;
}

let rainWanted = false;
export function setRainWanted(on: boolean) {
  rainWanted = on;
}
