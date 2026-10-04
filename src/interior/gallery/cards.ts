import * as THREE from "three";
import { API } from "../../data/zscan";

/**
 * Cards on the walls. Every zkSNARK of a floor is one instance of a single InstancedMesh whose
 * shader looks its portrait up in the collection atlas (one 3200 px JPEG, 32 px per item, item n
 * at slot n − 1, 100 per row), so even the 5,000-card floor is two draw calls: pictures, frames.
 */

const COLS = 100;
/** Black mat around the picture, as a fraction of the card. */
const MAT = 0.075;

let atlas: THREE.Texture | null = null;
/** The full atlas, loaded once and shared by every floor. */
export function atlasTexture() {
  if (atlas) return atlas;
  const loader = new THREE.TextureLoader();
  loader.setCrossOrigin("anonymous");
  atlas = loader.load(`${API}/v1/collections/zksnarks/map/image`);
  atlas.colorSpace = THREE.SRGBColorSpace;
  atlas.magFilter = THREE.NearestFilter;
  atlas.minFilter = THREE.LinearMipmapLinearFilter;
  atlas.anisotropy = 8;
  return atlas;
}

const portraits = new Map<number, THREE.Texture>();
/** The 520 px portrait of one zkSNARK, for the big pictures (crisp pixels). */
export function portraitTexture(url: string, id: number) {
  let t = portraits.get(id);
  if (!t) {
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin("anonymous");
    t = loader.load(url);
    t.colorSpace = THREE.SRGBColorSpace;
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.anisotropy = 8;
    portraits.set(id, t);
  }
  return t;
}

let cardMat: THREE.MeshBasicMaterial | null = null;
/** Picture material: atlas lookup per instance (`aSlot`, −1 = not known yet), black mat border. */
export function cardMaterial() {
  if (cardMat) return cardMat;
  const m = new THREE.MeshBasicMaterial({ map: atlasTexture(), color: new THREE.Color(1, 1, 1) });
  m.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float aSlot;\nvarying vec2 vLocal;\nvarying float vSlot;")
      .replace(
        "#include <uv_vertex>",
        `#include <uv_vertex>
        vLocal = uv;
        vSlot = aSlot;
        float cCol = mod(aSlot, ${COLS}.0);
        float cRow = floor(aSlot / ${COLS}.0);
        vec2 q = clamp((uv - ${MAT}) / (1.0 - 2.0 * ${MAT}), 0.0, 1.0) * 0.96 + 0.02;
        vMapUv = vec2((cCol + q.x) / ${COLS}.0, 1.0 - (cRow + 1.0 - q.y) / ${COLS}.0);`,
      );
    s.fragmentShader = s.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec2 vLocal;\nvarying float vSlot;")
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
        if (vLocal.x < ${MAT} || vLocal.x > ${1 - MAT} || vLocal.y < ${MAT} || vLocal.y > ${1 - MAT}) diffuseColor.rgb = vec3(0.025);
        if (vSlot < 0.0) diffuseColor.rgb = vec3(0.05 + 0.03 * step(0.5, fract((vLocal.x + vLocal.y) * 6.0)));`,
      );
  };
  m.customProgramCacheKey = () => "zk-card";
  return m;
}

let frameMat: THREE.MeshStandardMaterial | null = null;
function frameMaterial() {
  return (frameMat ??= new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.45, metalness: 0.7, emissive: "#140e05", envMapIntensity: 1.1 }));
}

/** One hanging place: centre, the wall's normal as a yaw (0 = facing +z), size in metres. */
export interface Slot {
  x: number;
  y: number;
  z: number;
  yaw: number;
  s: number;
}

const GOLD = new THREE.Color("#c8952e"),
  GOLD_DARK = new THREE.Color("#8a6224"),
  BLACK = new THREE.Color("#1a1a1e");

/** The cards of one floor: pictures (pickable, instanceId = slot index) and their frames. */
export class CardSet {
  readonly cards: THREE.InstancedMesh;
  readonly frames: THREE.InstancedMesh;
  private aSlot: THREE.InstancedBufferAttribute;

  constructor(readonly slots: Slot[]) {
    const n = slots.length;
    const plane = new THREE.PlaneGeometry(1, 1);
    this.aSlot = new THREE.InstancedBufferAttribute(new Float32Array(n).fill(-1), 1);
    plane.setAttribute("aSlot", this.aSlot);
    this.cards = new THREE.InstancedMesh(plane, cardMaterial(), n);
    const frame = new THREE.BoxGeometry(1.12, 1.12, 0.05);
    frame.translate(0, 0, 0.025);
    this.frames = new THREE.InstancedMesh(frame, frameMaterial(), n);
    const m = new THREE.Matrix4(),
      q = new THREE.Quaternion(),
      up = new THREE.Vector3(0, 1, 0),
      p = new THREE.Vector3(),
      sc = new THREE.Vector3();
    slots.forEach((s, i) => {
      q.setFromAxisAngle(up, s.yaw);
      const nx = Math.sin(s.yaw),
        nz = Math.cos(s.yaw);
      m.compose(p.set(s.x + nx * 0.053, s.y, s.z + nz * 0.053), q, sc.set(s.s, s.s, 1));
      this.cards.setMatrixAt(i, m);
      m.compose(p.set(s.x, s.y, s.z), q, sc.set(s.s, s.s, 1));
      this.frames.setMatrixAt(i, m);
      // salon hang: mostly gold, some black lacquer, a few darker golds
      const h = (Math.sin(i * 12.9898 + s.x * 78.233 + s.z * 3.1) * 43758.5453) % 1;
      const r = Math.abs(h);
      this.frames.setColorAt(i, r < 0.62 ? GOLD : r < 0.85 ? BLACK : GOLD_DARK);
    });
    this.cards.computeBoundingSphere();
    this.frames.computeBoundingSphere();
  }

  /** Atlas slot (item id − 1) per hanging place; −1 leaves a place dark. */
  setItems(ids: number[]) {
    for (let i = 0; i < this.slots.length; i++) this.aSlot.setX(i, ids[i] !== undefined ? ids[i] - 1 : -1);
    this.aSlot.needsUpdate = true;
  }

  addTo(parent: THREE.Object3D) {
    parent.add(this.frames, this.cards);
  }
}

const bigFrameMat = new THREE.MeshStandardMaterial({ color: "#b8862a", roughness: 0.4, metalness: 0.75, emissive: "#140e05", envMapIntensity: 1.1 });

/** A big framed picture (520 px portrait) facing +z: gold frame, black mat, the portrait. */
export function bigPortrait(size: number) {
  const g = new THREE.Group();
  const frame = new THREE.Mesh(new THREE.BoxGeometry(size * 1.14, size * 1.14, 0.08), bigFrameMat);
  frame.position.z = 0.04;
  const mat = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ color: "#060606" }));
  mat.position.z = 0.081;
  const pic = new THREE.Mesh(new THREE.PlaneGeometry(size * 0.88, size * 0.88), new THREE.MeshBasicMaterial({ color: "#151515" }));
  pic.position.z = 0.083;
  g.add(frame, mat, pic);
  return { group: g, pic };
}

/** Show a portrait on a big picture once the id is known. */
export function showPortrait(pic: THREE.Mesh, url: string, id: number) {
  const mat = pic.material as THREE.MeshBasicMaterial;
  mat.map = portraitTexture(url, id);
  mat.color.set("#ffffff");
  mat.needsUpdate = true;
}
