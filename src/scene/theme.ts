import * as THREE from "three";
import type { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import type { Decor } from "./decor";
import type { LampLights } from "./post";
import { MATERIALS } from "./voxel/mesher";
import { cityEnvironment } from "./envmap";

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

function gradient(stops: [number, string][]) {
  const c = document.createElement("canvas");
  c.width = 4;
  c.height = 256;
  const ctx = c.getContext("2d")!;
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  for (const [k, col] of stops) g.addColorStop(k, col);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const SKY = {
  // a pale lavender studio sky, like a product render
  day: gradient([
    [0, "#f4f5fd"],
    [0.6, "#e7e9f8"],
    [1, "#d9dcf3"],
  ]),
  // a night sky that glows magenta toward the horizon, as over a city that never sleeps
  night: gradient([
    [0, "#05040a"],
    [0.55, "#0d0820"],
    [0.85, "#2a0e34"],
    [1, "#3a1238"],
  ]),
};

const EMIT_NIGHT = new THREE.Color(1, 1, 1);
const EMIT_DAY = new THREE.Color(0.62, 0.62, 0.66);

/**
 * Day: a clean, bright miniature under a soft sun (dry asphalt, lamps off, faint neon).
 * Night: the rainy cyberpunk street with its glowing signs and wet reflections.
 */
export function applyTheme(t: ThemeTargets, theme: Theme) {
  const day = theme === "day";
  const { renderer, scene, hemi, sun, bloom } = t;
  scene.background = SKY[theme];
  scene.fog = day ? new THREE.Fog("#e4e6f6", 170, 360) : new THREE.Fog("#1a0c26", 150, 330);
  scene.environment = cityEnvironment(renderer, day);
  scene.environmentIntensity = day ? 0.45 : 0.24;
  renderer.toneMappingExposure = day ? 0.92 : 1.05;
  hemi.color.set(day ? "#ffffff" : "#6a64a8");
  hemi.groundColor.set(day ? "#aaa4cc" : "#1a1420");
  // by day a warmer sun and a softer, cooler fill: the shadows read, the city gets its depth
  hemi.intensity = day ? 0.85 : 1.5;
  sun.color.set(day ? "#ffefd6" : "#9fb0ff");
  sun.intensity = day ? 3.6 : 0.9;
  sun.shadow.radius = day ? 3 : 1;
  sun.shadow.intensity = day ? 0.72 : 1;
  bloom.strength = day ? 0.08 : 0.38;
  bloom.threshold = day ? 1.2 : 0.95;
  t.lamps.scale = day ? 0 : 1;
  t.lamps.update(0, new THREE.Vector3(), true);
  MATERIALS.emit.color.copy(day ? EMIT_DAY : EMIT_NIGHT);
  t.decor.setRain(!day && rainWanted);
  t.city.traverse((o) => {
    const mats = (o as THREE.Mesh).material;
    if (!mats) return;
    for (const m of Array.isArray(mats) ? mats : [mats]) {
      if (m.userData.night) o.visible = !day;
      const s = m as THREE.MeshStandardMaterial;
      if (m.userData.wet) {
        s.roughness = day ? 0.92 : 0.24;
        s.metalness = day ? 0 : 0.22;
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

let rainWanted = true;
export function setRainWanted(on: boolean) {
  rainWanted = on;
}
