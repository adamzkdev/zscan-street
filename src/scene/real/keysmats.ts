import * as THREE from "three";
import { SLOTS, type Slot } from "./buildings";
import { GROUND } from "./ground";
import type { KSlot } from "./keysreal";
import { realMat } from "./mats";
import { maps } from "./tex";

/**
 * The materials of Orchard Keys' realistic geometry (src/scene/real/keysreal.ts), one per slot,
 * shared: the city's slots (real/mats.ts: stucco, roofs, glass with its night draw, the shops'
 * interiors, neon) and the town's own — pool water, the lawns, paths, sand and asphalt mapped by the
 * world (real/ground.ts), chrome, rubber, rock, palm thatch, white paint and canvas.
 */

const own = new Map<KSlot, THREE.Material>();

/** The thatch of the beach bars' palapas: dried palm leaves in overlapping rows (drawn once). */
function thatchTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  g.fillStyle = "#8a6a3c";
  g.fillRect(0, 0, 256, 256);
  let s = 7;
  const R = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let row = 0; row < 9; row++)
    for (let i = 0; i < 260; i++) {
      const x = R() * 256,
        y = row * 30 + R() * 10;
      const l = 22 + R() * 26;
      const k = 150 + R() * 80;
      g.strokeStyle = `rgb(${k}, ${k * 0.78}, ${k * 0.45})`;
      g.lineWidth = 1 + R() * 1.6;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + (R() - 0.5) * 6, y + l);
      g.stroke();
    }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function make(slot: KSlot): THREE.Material {
  switch (slot) {
    case "water": {
      const n = maps("Concrete034").normalMap;
      const m = new THREE.MeshStandardMaterial({ color: "#3aa8c8", roughness: 0.03, metalness: 0.05, normalMap: n, transparent: true, opacity: 0.82, envMapIntensity: 1.5 });
      m.normalScale.setScalar(0.12);
      return m;
    }
    case "lawn":
      return GROUND.lawn();
    case "path":
      return GROUND.plaza();
    case "sand":
      return GROUND.sand();
    case "asphalt":
      return GROUND.asphalt();
    case "rock": {
      const mp = maps("Rock030");
      // (the slate's dark: lifted by the vertex colour's own light greys and an emissive-free brighter base)
      const m = new THREE.MeshStandardMaterial({ vertexColors: true, map: mp.map, normalMap: mp.normalMap, roughnessMap: mp.roughnessMap, roughness: 1, color: new THREE.Color(1.9, 1.85, 1.75) });
      return m;
    }
    case "court": {
      const mp = maps("Concrete034");
      return new THREE.MeshStandardMaterial({ vertexColors: true, normalMap: mp.normalMap, roughness: 0.8 });
    }
    case "chrome":
      return new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 1, roughness: 0.18, envMapIntensity: 1.2 });
    case "rubber":
      return new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
    case "thatch":
      return new THREE.MeshStandardMaterial({ vertexColors: true, map: thatchTexture(), roughness: 1, side: THREE.DoubleSide });
    case "tiles": {
      // (the tunnel's wall tiles: the plaza's tile set, glazed)
      // (its relief only: the glaze is the vertex colour's cream)
      const mp = maps("Tiles074");
      return new THREE.MeshStandardMaterial({ vertexColors: true, normalMap: mp.normalMap, roughness: 0.22, envMapIntensity: 1.2 });
    }
    case "white":
      return new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42 });
    case "cloth": {
      const mp = maps("Fabric030");
      const m = new THREE.MeshStandardMaterial({ vertexColors: true, normalMap: mp.normalMap, roughnessMap: mp.roughnessMap, roughness: 1, side: THREE.DoubleSide });
      m.normalScale.setScalar(0.6);
      return m;
    }
  }
  return realMat(slot as Slot);
}

/** The shared material of a slot of the town's geometry. */
export function keysMat(slot: KSlot): THREE.Material {
  if ((SLOTS as string[]).includes(slot)) return realMat(slot as Slot);
  let m = own.get(slot);
  if (!m) {
    m = make(slot);
    m.userData.shared = true;
    own.set(slot, m);
  }
  return m;
}
