import * as THREE from "three";
import { GLASS_NIGHT } from "../voxel/surface";
import { FACADE, SHOP_CELLS, SLOT_SET, type Slot } from "./buildings";
import { maps } from "./tex";

/**
 * The realistic buildings' materials (src/scene/real/buildings.ts makes the geometry): one shared
 * material per slot — the photographed sets with their colour, normal and roughness maps, tinted by
 * the geometry's vertex colour — and a clone per walk-in building of the heart (walls down clips its
 * own materials). By night (GLASS_NIGHT, set by the theme and the game's day) the windows light up:
 * on the photographed facades the glass is where their roughness map is smooth, one window in a
 * few lit by a hash of its bay and floor; on the window panes the vertex colour carries the draw.
 */

const mats = new Map<string, THREE.Material>();

/** The shared material of a slot (`own`: a clone of it, same program, for a building's own use). */
export function realMat(slot: Slot, own = false): THREE.Material {
  let m = mats.get(slot);
  if (!m) mats.set(slot, (m = make(slot)));
  if (!own) return m;
  const c = m.clone();
  c.onBeforeCompile = m.onBeforeCompile;
  c.customProgramCacheKey = m.customProgramCacheKey;
  c.userData = { ...m.userData };
  return c;
}

const night = GLASS_NIGHT;

function standard(slot: Slot, o: THREE.MeshStandardMaterialParameters = {}) {
  const set = SLOT_SET[slot];
  const mp = set ? maps(set) : null;
  const m = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 1,
    metalness: 0,
    ...(mp ? { map: mp.map, normalMap: mp.normalMap, roughnessMap: mp.roughnessMap } : {}),
    ...o,
  });
  m.userData.shared = true;
  m.userData.realSlot = slot;
  return m;
}

/** A program per slot (the hooks below differ by slot in their constants, not in their text). */
const keyed = (m: THREE.Material, slot: Slot) => {
  m.customProgramCacheKey = () => `real:${slot}`;
  return m;
};

function make(slot: Slot): THREE.Material {
  const F = FACADE[slot];
  if (F) {
    const towers = slot === "f001" || slot === "f005" || slot === "f006" || slot === "f017";
    const m = standard(slot, { envMapIntensity: towers ? 1.25 : 0.9 });
    m.normalScale.setScalar(towers ? 0.6 : 1);
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uNight = night;
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", `#include <common>\nuniform float uNight;\nfloat realGlass = 0.0;\nfloat realHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }`)
        .replace(
          "#include <roughnessmap_fragment>",
          `#include <roughnessmap_fragment>
          // the glass: where the photographed facade is smooth
          realGlass = 1.0 - smoothstep(0.18, 0.4, texelRoughness.g);
          roughnessFactor = mix(roughnessFactor, 0.06, realGlass * ${towers ? "0.85" : "0.6"});`,
        )
        .replace("#include <metalnessmap_fragment>", `#include <metalnessmap_fragment>\nmetalnessFactor = mix(metalnessFactor, ${towers ? "0.75" : "0.45"}, realGlass);`)
        .replace(
          "#include <emissivemap_fragment>",
          `#include <emissivemap_fragment>
          {
            // one window in a few lit by night: its bay and floor drawn
            vec2 cell = floor(vMapUv * vec2(${F.bays.toFixed(1)}, ${F.floors.toFixed(1)}));
            float h = realHash(cell);
            float on = step(h, 0.34 * uNight) * realGlass;
            vec3 warm = mix(vec3(1.0, 0.7, 0.4), vec3(0.62, 0.78, 1.0), step(0.72, realHash(cell + 7.3)));
            totalEmissiveRadiance += on * warm * (0.38 + 0.4 * realHash(cell + 3.1)) * uNight;
          }`,
        );
    };
    return keyed(m, slot);
  }
  switch (slot) {
    case "glass": {
      const m = new THREE.MeshStandardMaterial({ vertexColors: true, color: "#1b2531", roughness: 0.05, metalness: 0.85, envMapIntensity: 1.3 });
      m.userData.shared = true;
      m.onBeforeCompile = (sh) => {
        sh.uniforms.uNight = night;
        sh.fragmentShader = sh.fragmentShader
          .replace("#include <common>", `#include <common>\nuniform float uNight;`)
          // (the vertex colour is the window's draw, not a tint: lit share, warm or cool, a shade)
          .replace("#include <color_fragment>", `diffuseColor.rgb *= 0.75 + 0.5 * vColor.b;`)
          .replace(
            "#include <emissivemap_fragment>",
            `#include <emissivemap_fragment>
            float on = step(vColor.r, 0.45 * uNight);
            vec3 tint = mix(vec3(0.7, 0.85, 1.0), vec3(1.0, 0.74, 0.45), vColor.g);
            totalEmissiveRadiance += on * tint * (0.42 + 0.35 * vColor.b) * uNight;`,
          );
      };
      return keyed(m, slot);
    }
    case "shop": {
      const t = shopAtlas();
      const m = new THREE.MeshStandardMaterial({ vertexColors: true, map: t, emissiveMap: t, emissive: new THREE.Color("#ffffff"), roughness: 0.12, metalness: 0.15, envMapIntensity: 1.1 });
      m.userData.shared = true;
      m.onBeforeCompile = (sh) => {
        sh.uniforms.uNight = night;
        sh.fragmentShader = sh.fragmentShader.replace("#include <common>", `#include <common>\nuniform float uNight;`).replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>\ntotalEmissiveRadiance *= mix(0.22, 0.62, uNight);`);
      };
      return keyed(m, slot);
    }
    case "neon": {
      const m = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
      m.userData.shared = true;
      return m;
    }
    case "fabric":
    case "awning":
      return standard(slot, { roughness: 0.85, side: THREE.DoubleSide });
    case "metal":
      return standard(slot, { roughness: 0.6, metalness: 0.55, envMapIntensity: 0.8 });
    case "roof":
      return standard(slot, { roughness: 1 });
    default:
      return standard(slot);
  }
}

// ---- the shops' interiors, drawn once -------------------------------------------------------------

let atlas: THREE.CanvasTexture | null = null;

/** Eight shop interiors in a 4 × 2 atlas (cafe, konbini, ramen, boutique / bar, lobby, florist, market): seen through the glass. */
function shopAtlas() {
  if (atlas) return atlas;
  const S = 256;
  const c = document.createElement("canvas");
  c.width = S * 4;
  c.height = S * 2;
  const g = c.getContext("2d")!;
  let seed = 7;
  const R = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const LOOK: Record<string, { wall: string; floor: string; light: string; goods: string[] }> = {
    cafe: { wall: "#6b4a34", floor: "#3a2a20", light: "#ffd9a0", goods: ["#c89060", "#e8d8c0", "#7a4a2a", "#f2e6d0"] },
    konbini: { wall: "#e8eef2", floor: "#c8ccd0", light: "#ffffff", goods: ["#e83a3a", "#3a7ae8", "#f2c230", "#3ab86a", "#f28a3a"] },
    ramen: { wall: "#8a3a2a", floor: "#3a2a24", light: "#ffc890", goods: ["#f2e6d0", "#c83a2a", "#3a2a20"] },
    boutique: { wall: "#f2ece4", floor: "#d8d0c4", light: "#fff2e0", goods: ["#1a1a1e", "#c8a07a", "#7a8aa0", "#e8c8c8"] },
    bar: { wall: "#2a1a2a", floor: "#1a1418", light: "#ff8a5a", goods: ["#f2c060", "#c83a6a", "#6a3ac8", "#3ac8c8"] },
    lobby: { wall: "#d8d2c8", floor: "#a8a29a", light: "#fff4e0", goods: ["#3a3a40", "#c8c0b0", "#5a7a5a"] },
    florist: { wall: "#e8e4da", floor: "#8a7a6a", light: "#fff0d8", goods: ["#e83a6a", "#f2c230", "#3ab86a", "#f28ac8", "#ffffff"] },
    market: { wall: "#dcd4c4", floor: "#8a8478", light: "#fff8e8", goods: ["#e8a03a", "#3ab86a", "#e83a3a", "#c8c03a"] },
  };
  SHOP_CELLS.forEach((name, i) => {
    const L = LOOK[name];
    const ox = (i % 4) * S,
      oy = Math.floor(i / 4) * S;
    g.save();
    g.translate(ox, oy);
    // the room in perspective: back wall, floor, ceiling, side walls
    g.fillStyle = L.wall;
    g.fillRect(0, 0, S, S);
    const vg = g.createLinearGradient(0, 0, 0, S);
    vg.addColorStop(0, "rgba(255,255,255,0.25)");
    vg.addColorStop(0.6, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(0,0,0,0.35)");
    g.fillStyle = vg;
    g.fillRect(0, 0, S, S);
    g.fillStyle = L.floor;
    g.beginPath();
    g.moveTo(0, S);
    g.lineTo(S, S);
    g.lineTo(S * 0.82, S * 0.7);
    g.lineTo(S * 0.18, S * 0.7);
    g.fill();
    g.fillStyle = "rgba(0,0,0,0.25)";
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(S * 0.18, S * 0.12);
    g.lineTo(S * 0.18, S * 0.7);
    g.lineTo(0, S);
    g.fill();
    g.beginPath();
    g.moveTo(S, 0);
    g.lineTo(S * 0.82, S * 0.12);
    g.lineTo(S * 0.82, S * 0.7);
    g.lineTo(S, S);
    g.fill();
    // the lights in the ceiling
    g.fillStyle = L.light;
    for (let k = 0; k < 3; k++) {
      const y = S * (0.03 + k * 0.035);
      g.globalAlpha = 0.95;
      g.fillRect(S * (0.22 + k * 0.02), y, S * (0.56 - k * 0.04), 4);
    }
    g.globalAlpha = 1;
    // shelves of goods on the back wall
    for (let row = 0; row < 4; row++) {
      const y = S * (0.2 + row * 0.12);
      g.fillStyle = "rgba(30,26,24,0.85)";
      g.fillRect(S * 0.2, y + S * 0.085, S * 0.6, 3);
      for (let x = S * 0.21; x < S * 0.79; x += 6 + R() * 8) {
        g.fillStyle = L.goods[Math.floor(R() * L.goods.length)];
        const h = S * (0.04 + R() * 0.04);
        g.fillRect(x, y + S * 0.085 - h, 4 + R() * 5, h);
      }
    }
    // a counter in front, a figure or two
    g.fillStyle = "rgba(20,18,20,0.9)";
    g.fillRect(S * 0.08, S * 0.74, S * 0.5, S * 0.26);
    g.fillStyle = "rgba(255,255,255,0.12)";
    g.fillRect(S * 0.08, S * 0.74, S * 0.5, 4);
    for (let k = 0; k < 1 + Math.floor(R() * 2); k++) {
      const x = S * (0.62 + R() * 0.25);
      g.fillStyle = "rgba(15,14,18,0.75)";
      g.beginPath();
      g.arc(x, S * 0.62, S * 0.035, 0, Math.PI * 2);
      g.fill();
      g.fillRect(x - S * 0.04, S * 0.655, S * 0.08, S * 0.22);
    }
    // the light's pool, the window's reflection
    const lg = g.createRadialGradient(S / 2, S * 0.1, 4, S / 2, S * 0.1, S * 0.8);
    lg.addColorStop(0, "rgba(255,240,210,0.35)");
    lg.addColorStop(1, "rgba(255,240,210,0)");
    g.fillStyle = lg;
    g.fillRect(0, 0, S, S);
    g.restore();
  });
  atlas = new THREE.CanvasTexture(c);
  atlas.colorSpace = THREE.SRGBColorSpace;
  atlas.anisotropy = 4;
  atlas.userData.shared = true;
  return atlas;
}
