import * as THREE from "three";
import { GLASS_NIGHT } from "../voxel/surface";
import { maps } from "./tex";

/**
 * The landmarks' materials (src/scene/real/markkit.ts slots `lm.…`), shared: a CC0 set of public/tex
 * tinted by the vertex colour (`lm.<Set>`, `lm.<Set>.gloss` polished stone, `lm.<Set>.metal`
 * metallic), or a plain one: `lm.paint` (matte paint), `lm.plastic` (seats, satin), `lm.chrome`,
 * `lm.dark` (black iron), `lm.glass` (dark reflective glass that lights its share of rooms at night
 * from its vertex colour's red), `lm.glow` (lit: lamps, clock dials, LED ribbons; brighter at night).
 */

const made = new Map<string, THREE.Material>();
const night = GLASS_NIGHT;

export function markMat(slot: string): THREE.Material {
  let m = made.get(slot);
  if (m) return m;
  m = make(slot);
  m.userData.shared = true;
  m.userData.realSlot = slot;
  made.set(slot, m);
  return m;
}

function make(slot: string): THREE.Material {
  const [, name, flavour] = slot.split(".");
  switch (name) {
    case "paint":
      return new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, metalness: 0 });
    case "plastic":
      return new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0, envMapIntensity: 0.8 });
    case "chrome":
      return new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.22, metalness: 0.95, envMapIntensity: 1.2 });
    case "dark":
      return new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.6, envMapIntensity: 0.7 });
    case "glass": {
      // `lm.glass.clear`: a glasshouse's panes (the gardens' domes): light, seen through to the beds,
      // the trees and the mountain inside — not a tower's dark mirror
      if (flavour === "clear") {
        const m = new THREE.MeshStandardMaterial({ vertexColors: true, color: "#e8f4f6", roughness: 0.08, metalness: 0.1, envMapIntensity: 1.4, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide });
        m.customProgramCacheKey = () => "lm.glass.clear";
        return m;
      }
      // (a dark base, as the buildings' glass (real/mats.ts): a light tint on a metal would mirror the night sky's glow back white)
      const m = new THREE.MeshStandardMaterial({ vertexColors: true, color: "#3c4652", roughness: 0.06, metalness: 0.85, envMapIntensity: 1.25 });
      m.onBeforeCompile = (sh) => {
        sh.uniforms.uNight = night;
        sh.fragmentShader = sh.fragmentShader
          .replace("#include <common>", `#include <common>\nuniform float uNight;\nfloat mkHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }`)
          .replace(
            "#include <emissivemap_fragment>",
            `#include <emissivemap_fragment>
            {
              // a share of the rooms behind the glass lit by night (a 1.6 × 3.4 m cell each, by world position)
              vec3 wp = (inverse(viewMatrix) * vec4(-vViewPosition, 1.0)).xyz;
              vec2 cell = floor(vec2(wp.x + wp.z, wp.y) / vec2(1.6, 3.4));
              float on = step(mkHash(cell), 0.38 * uNight);
              vec3 warm = mix(vec3(1.0, 0.72, 0.42), vec3(0.65, 0.8, 1.0), step(0.7, mkHash(cell + 3.7)));
              totalEmissiveRadiance += on * warm * 0.42 * uNight;
            }`,
          );
      };
      m.customProgramCacheKey = () => "lm.glass";
      return m;
    }
    case "glow": {
      // (the vertex colour is the light: lit by day too and brighter at night; `lm.glow.night`: a
      // lamp, all but dark by day — its fitting shows in the paint around it)
      const day = flavour === "night" ? 0.04 : 0.9;
      const m = new THREE.MeshStandardMaterial({ vertexColors: true, color: flavour === "night" ? "#8a8070" : "#000000", roughness: 0.4, emissive: "#ffffff", emissiveIntensity: 1 });
      m.onBeforeCompile = (sh) => {
        sh.uniforms.uNight = night;
        sh.fragmentShader = sh.fragmentShader
          .replace("#include <common>", `#include <common>\nuniform float uNight;`)
          .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>\ntotalEmissiveRadiance = vColor.rgb * mix(${day.toFixed(2)}, 1.6, uNight);`);
      };
      m.customProgramCacheKey = () => `lm.glow.${flavour ?? ""}`;
      return m;
    }
  }
  // a photographed set
  const mp = maps(name);
  const m = new THREE.MeshStandardMaterial({
    vertexColors: true,
    map: mp.map,
    normalMap: mp.normalMap,
    roughnessMap: mp.roughnessMap,
    roughness: flavour === "gloss" ? 0.45 : 1,
    metalness: flavour === "metal" ? 0.55 : 0,
    envMapIntensity: flavour === "gloss" ? 1 : flavour === "metal" ? 0.9 : 0.75,
  });
  if (flavour === "gloss") m.normalScale.setScalar(0.4);
  // (a monument's big blocks: their joints deeper)
  if (flavour === "blocks") m.normalScale.setScalar(1.8);
  return m;
}
