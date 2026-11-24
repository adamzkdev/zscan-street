import * as THREE from "three";
import { addDetail, guessDetail } from "../scene/detail";
import { groundMat } from "../scene/real/ground";

/**
 * The finish of a place: every plain standard material gets its surface (plaster, polished stone,
 * wood, fabric, brushed metal — guessed from its colour, gloss and metal), every texture the
 * sharpest filtering, and the big pale floors (marble, tiles, parquet) their polish, so the halls
 * mirror their columns and lights. Run on a place when it is built and on each floor as it is
 * shown (some places build their floors on the way up); what was seen once is skipped.
 */
const done = new WeakSet<THREE.Material>();
const seen = new WeakSet<THREE.Object3D>();
const box = new THREE.Box3();
const size = new THREE.Vector3();
const hsl = { h: 0, s: 0, l: 0 };

function polishFloor(o: THREE.Mesh) {
  const m = o.material as THREE.MeshStandardMaterial;
  if (Array.isArray(o.material) || !m.isMeshStandardMaterial || m.transparent || m.userData.polished) return;
  if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
  box.copy(o.geometry.boundingBox!).applyMatrix4(o.matrixWorld).getSize(size);
  // a floor: a wide, flat slab
  if (size.y > 0.35 || size.x * size.z < 20 || Math.min(size.x, size.z) < 3) return;
  m.color.getHSL(hsl, THREE.SRGBColorSpace);
  const textured = !!m.map;
  // carpet, lawn, sand, dark rubber stay matte
  if (!textured && (hsl.l < 0.35 || hsl.s > 0.45)) return;
  if (m.roughness >= 0.9 && !textured) return;
  const woodish = hsl.h * 360 > 18 && hsl.h * 360 < 48 && hsl.s > 0.25 && hsl.l < 0.5;
  // a satin polish: the hall reflects softly; mirror-hard floors turned every lamp into a glare
  m.roughness = THREE.MathUtils.clamp(m.roughness, 0.5, woodish ? 0.6 : 0.55);
  m.userData.polished = true;
}

/**
 * The realistic pass (branch gta-real): the big plain surfaces of a place — its floors and its walls —
 * in photographed materials (public/tex) instead of a flat colour with a grain: a pale floor is
 * polished marble, a brown one parquet, a saturated one carpet, a grey one polished concrete, the
 * rest tiles; a wall is plaster in its own colour, a brown one wood panelling. Mapped in world
 * metres (real/ground.ts's shader: every face, no stretching), tinted by the colour the place chose
 * so its palette stays. Small things keep their grain (the furniture, the fittings).
 */
function realSurface(mesh: THREE.Mesh): boolean {
  const m = mesh.material as THREE.MeshStandardMaterial;
  if (Array.isArray(mesh.material) || !m?.isMeshStandardMaterial || m.map || m.transparent || m.userData.realGround || m.userData.noReal) return false;
  if (m.metalness > 0.5 || m.emissiveIntensity > 0.5 && m.emissive && m.emissive.getHex() !== 0) return false;
  if ((mesh as THREE.InstancedMesh).isInstancedMesh || (mesh as THREE.SkinnedMesh).isSkinnedMesh) return false;
  const geo = mesh.geometry;
  if (!geo?.getAttribute("position") || geo.getAttribute("color")) return false;
  if (!geo.boundingBox) geo.computeBoundingBox();
  box.copy(geo.boundingBox!).applyMatrix4(mesh.matrixWorld).getSize(size);
  m.color.getHSL(hsl, THREE.SRGBColorSpace);
  const hue = hsl.h * 360;
  const woody = hue > 15 && hue < 48 && hsl.s > 0.22 && hsl.l < 0.55 && hsl.l > 0.12;
  const tint = "#" + m.color.getHexString(THREE.SRGBColorSpace);
  const floor = size.y < 0.4 && size.x * size.z > 12 && Math.min(size.x, size.z) > 2.5;
  const wall = !floor && size.y > 2.2 && Math.max(size.x, size.z) > 2.5 && Math.min(size.x, size.z) < 0.8;
  if (!floor && !wall) return false;
  let set: string,
    rough = 1,
    t = tint;
  if (floor) {
    if (woody) set = "WoodFloor051";
    else if (hsl.s > 0.35 && hsl.l < 0.55) set = "Carpet016";
    else if (hsl.l > 0.62) ((set = "Marble012"), (rough = 0.55));
    else if (hsl.s < 0.12 && hsl.l < 0.4) ((set = "Concrete019"), (rough = 0.7));
    else set = "Tiles074";
    // (the photograph carries its own colour: the tint only leans it toward the place's)
    if (set === "WoodFloor051" || set === "Marble012") t = new THREE.Color(tint).lerp(new THREE.Color("#ffffff"), 0.55).getStyle();
  } else {
    set = woody ? "Wood049" : "Plaster001";
  }
  mesh.material = groundMat({ set, tint: t, rough, anti: 0.5, patches: 0.2 });
  return true;
}

export function refine(root: THREE.Object3D) {
  root.updateMatrixWorld();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    const mats = mesh.material;
    if (!mats) return;
    if (!seen.has(o) && mesh.isMesh && !(mesh as THREE.InstancedMesh).isInstancedMesh) {
      seen.add(o);
      if (realSurface(mesh)) return;
      if (!done.has(mats as THREE.Material)) polishFloor(mesh);
    }
    for (const m of Array.isArray(mats) ? mats : [mats]) {
      if (done.has(m)) continue;
      done.add(m);
      const s = m as THREE.MeshStandardMaterial;
      for (const t of [s.map, s.emissiveMap, s.roughnessMap]) if (t && t.anisotropy < 8) (t.anisotropy = 8), (t.needsUpdate = true);
      // floors take the lamps' highlights at a grazing angle, right in the eye: a third of them
      if (s.isMeshStandardMaterial && !s.transparent && !s.wireframe) addDetail(s, guessDetail(s), s.userData.polished ? 0.35 : 1);
    }
  });
}
