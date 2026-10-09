import * as THREE from "three";
import { addDetail, guessDetail } from "../scene/detail";

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

export function refine(root: THREE.Object3D) {
  root.updateMatrixWorld();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    const mats = mesh.material;
    if (!mats) return;
    if (!seen.has(o) && mesh.isMesh && !(mesh as THREE.InstancedMesh).isInstancedMesh) {
      seen.add(o);
      if (!done.has(mats as THREE.Material)) polishFloor(mesh);
    }
    for (const m of Array.isArray(mats) ? mats : [mats]) {
      if (done.has(m)) continue;
      done.add(m);
      const s = m as THREE.MeshStandardMaterial;
      for (const t of [s.map, s.emissiveMap, s.roughnessMap]) if (t && t.anisotropy < 8) (t.anisotropy = 8), (t.needsUpdate = true);
      if (s.isMeshStandardMaterial && !s.transparent && !s.wireframe) addDetail(s, guessDetail(s));
    }
  });
}
