import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { VoxelModel } from "../scene/voxel/model";

/**
 * Pieces of furniture modelled for real (the realistic pass), for the voxel models whose shape no
 * remeshing can save (a grand piano's curve). A voxel model carries its real twin as `realize`
 * (in metres, in the same frame as the voxel one drawn by furniture.ts: centred on its footprint,
 * standing on y = 0); furniture.ts and the kits' real batches use it while a place is built real.
 */
export type Realizable = VoxelModel & { realize?: () => THREE.Object3D };

export function withReal<T extends VoxelModel>(v: T, realize: () => THREE.Object3D): T {
  (v as Realizable).realize = realize;
  return v;
}

const keep = <T extends THREE.Material>(m: T) => ((m.userData.shared = true), (m.userData.noReal = true), m);
const LACQUER = keep(new THREE.MeshPhysicalMaterial({ color: "#0a0a0d", roughness: 0.16, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.2 }));
const IVORY = keep(new THREE.MeshStandardMaterial({ color: "#f3efe6", roughness: 0.32 }));
const EBONY = keep(new THREE.MeshStandardMaterial({ color: "#121115", roughness: 0.4 }));
const BRASS = keep(new THREE.MeshStandardMaterial({ color: "#c9a227", metalness: 1, roughness: 0.25 }));
const FELT = keep(new THREE.MeshStandardMaterial({ color: "#7a1820", roughness: 0.9 }));

const merged = (list: THREE.BufferGeometry[]) => mergeGeometries(list.map((g) => (g.index ? g.toNonIndexed() : g)), false)!;

/**
 * A concert grand (the voxel one's footprint: 1.5 m wide, 2 m long, keyboard at −z, the bentside
 * curving in toward the tail at +z, the straight side at −x): a lacquered rim with its curve, the
 * lid open on its prop, the keyboard, three legs on brass casters, the lyre and its pedals.
 */
export function grandPianoReal() {
  const g = new THREE.Group();
  const x0 = -0.75,
    x1 = 0.68,
    zf = -1.0,
    zt = 1.0;
  // the outline seen from above (shape x → world x, shape y → world −z after the rotation)
  const s = new THREE.Shape();
  s.moveTo(x0, -zf);
  s.lineTo(x1, -zf);
  s.lineTo(x1, -(-0.2));
  s.bezierCurveTo(x1, -0.35, x1 - 0.55, -0.55, -0.1, -0.85);
  s.quadraticCurveTo(0.05, -zt, -0.25, -zt);
  s.lineTo(x0, -zt);
  s.lineTo(x0, -zf);
  const rim = new THREE.ExtrudeGeometry(s, { depth: 0.27, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.015, bevelSegments: 3, curveSegments: 24 });
  // (extruded along +z: turn it so the outline lies flat and the depth goes up)
  rim.rotateX(-Math.PI / 2).translate(0, 0.58, 0);
  const body = new THREE.Mesh(rim, LACQUER);
  g.add(body);
  // the lid: the same outline, thin, hinged on the straight side, open on its prop
  const lidGeo = new THREE.ExtrudeGeometry(s, { depth: 0.02, bevelEnabled: false, curveSegments: 24 });
  lidGeo.rotateX(-Math.PI / 2).translate(-x0, 0, 0);
  const lid = new THREE.Mesh(lidGeo, LACQUER);
  lid.position.set(x0, 0.87, 0);
  lid.rotation.z = 0.62;
  g.add(lid);
  // its prop stick on the curved side
  const prop = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.62, 8), EBONY);
  prop.position.set(x1 - 0.25, 1.1, -0.15);
  prop.rotation.z = -0.35;
  g.add(prop);
  // the keyboard: the key bed in front, white keys, black keys, the cheek blocks
  const kb: THREE.BufferGeometry[] = [];
  const kz = zf - 0.13;
  kb.push(new THREE.BoxGeometry(x1 - x0 - 0.12, 0.06, 0.3).translate((x0 + x1) / 2, 0.66, kz + 0.06));
  const white: THREE.BufferGeometry[] = [],
    black: THREE.BufferGeometry[] = [];
  const n = 36,
    kw = (x1 - x0 - 0.2) / n;
  for (let i = 0; i < n; i++) {
    const x = x0 + 0.1 + (i + 0.5) * kw;
    white.push(new THREE.BoxGeometry(kw * 0.94, 0.022, 0.15).translate(x, 0.705, kz - 0.02));
    const pos = i % 7;
    if (pos !== 2 && pos !== 6 && i < n - 1) black.push(new THREE.BoxGeometry(kw * 0.55, 0.03, 0.09).translate(x + kw / 2, 0.73, kz + 0.02));
  }
  for (const sx of [x0 + 0.04, x1 - 0.04]) kb.push(new THREE.BoxGeometry(0.08, 0.1, 0.3).translate(sx, 0.69, kz + 0.04));
  g.add(new THREE.Mesh(merged(kb), LACQUER), new THREE.Mesh(merged(white), IVORY), new THREE.Mesh(merged(black), EBONY));
  // the felt strip and the music desk
  const felt = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0 - 0.2, 0.01, 0.02), FELT);
  felt.position.set((x0 + x1) / 2, 0.72, kz + 0.075);
  g.add(felt);
  const desk = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.26, 0.015), LACQUER);
  desk.position.set((x0 + x1) / 2, 0.98, zf + 0.15);
  desk.rotation.x = -0.25;
  g.add(desk);
  // the legs, tapered, on brass casters; the lyre and its three pedals
  const legs: THREE.BufferGeometry[] = [],
    brass: THREE.BufferGeometry[] = [];
  for (const [x, z] of [
    [x0 + 0.12, zf + 0.12],
    [x1 - 0.12, zf + 0.12],
    [-0.3, zt - 0.2],
  ]) {
    legs.push(new THREE.CylinderGeometry(0.06, 0.04, 0.54, 12).translate(x, 0.31, z));
    brass.push(new THREE.CylinderGeometry(0.045, 0.045, 0.04, 12).translate(x, 0.02, z));
  }
  legs.push(new THREE.BoxGeometry(0.22, 0.44, 0.06).translate(-0.02, 0.35, zf + 0.35));
  for (const dx of [-0.06, 0, 0.06]) brass.push(new THREE.BoxGeometry(0.03, 0.012, 0.12).translate(-0.02 + dx, 0.1, zf + 0.29));
  g.add(new THREE.Mesh(merged(legs), LACQUER), new THREE.Mesh(merged(brass), BRASS));
  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) (o.castShadow = true), (o.receiveShadow = true);
  });
  g.userData.real = "grandPiano";
  return g;
}
