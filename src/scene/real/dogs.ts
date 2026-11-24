import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { Kind, type Crowd } from "../alive/crowd";

/**
 * The dogs walked round the blocks, realistic (branch gta-real): instead of the crowd's pixel dogs
 * (its sprites hidden), a dog in 3D — a smooth body, legs, a head with its snout and ears, the tail
 * up, the gold collar — two coats (black, tan), one instanced draw each, following each dog's own
 * walk on its loop (the crowd's shader path, mirrored by Crowd.positionOf), trotting.
 */

const ell = (rx: number, ry: number, rz: number, x: number, y: number, z: number, seg = 14) => new THREE.SphereGeometry(1, seg, Math.max(8, seg / 2 + 2)).scale(rx, ry, rz).translate(x, y, z);
function limb(a: THREE.Vector3, b: THREE.Vector3, r0: number, r1: number) {
  const len = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(r1, r0, len, 8).translate(0, len / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()));
  return g.translate(a.x, a.y, a.z);
}
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** A dog facing +x, standing on y = 0, about 0.85 m long: its geometry with the coat's colours in its vertices. */
function dogGeometry(fur: string, dark: string, light: string) {
  const parts: [THREE.BufferGeometry, string][] = [];
  const P = (g: THREE.BufferGeometry, c: string) => parts.push([g.index ? g.toNonIndexed() : g, c]);
  P(ell(0.3, 0.13, 0.12, 0, 0.42, 0, 18), fur);
  P(ell(0.22, 0.08, 0.1, 0.02, 0.36, 0), light);
  for (const [x, z] of [
    [0.2, 0.07],
    [0.2, -0.07],
    [-0.2, 0.07],
    [-0.2, -0.07],
  ]) {
    P(limb(V(x, 0.4, z), V(x + 0.01, 0.03, z), 0.04, 0.03), fur);
    P(ell(0.035, 0.025, 0.03, x + 0.02, 0.02, z, 8), dark);
  }
  // the neck, the head, the snout and nose, the ears, the collar
  P(limb(V(0.24, 0.45, 0), V(0.34, 0.6, 0), 0.08, 0.06), fur);
  P(ell(0.1, 0.09, 0.085, 0.37, 0.63, 0), fur);
  P(ell(0.08, 0.05, 0.05, 0.47, 0.6, 0, 10), light);
  P(ell(0.025, 0.022, 0.025, 0.545, 0.615, 0, 8), "#141216");
  for (const s of [-1, 1]) {
    P(ell(0.035, 0.065, 0.02, 0.33, 0.68, s * 0.075, 8).rotateX(s * 0.3), dark);
    P(ell(0.015, 0.015, 0.012, 0.44, 0.66, s * 0.05, 6), "#141216");
  }
  P(new THREE.TorusGeometry(0.068, 0.014, 6, 16).rotateZ(Math.PI / 2 - 0.5).translate(0.3, 0.55, 0), "#f4b728");
  // the tail, up
  P(limb(V(-0.29, 0.46, 0), V(-0.4, 0.62, 0), 0.03, 0.015), fur);
  const geos = parts.map(([g, c]) => {
    const col = new THREE.Color(c);
    const a = new Float32Array(g.getAttribute("position").count * 3);
    for (let i = 0; i < a.length; i += 3) a.set([col.r, col.g, col.b], i);
    g.setAttribute("color", new THREE.BufferAttribute(a, 3));
    for (const k of Object.keys(g.attributes)) if (k !== "position" && k !== "normal" && k !== "color") g.deleteAttribute(k);
    return g;
  });
  return mergeGeometries(geos, false)!;
}

const DOG_KINDS: number[] = [Kind.DogLoop, Kind.DogStand, Kind.DogPath];
const COATS: [string, string, string][] = [
  ["#2a2830", "#141318", "#e8e4dc"],
  ["#c8873a", "#8a5422", "#f2d2a0"],
];

export class RealDogs {
  readonly group = new THREE.Group();
  private meshes: THREE.InstancedMesh[] = [];
  private dogs: { i: number; coat: number; last: THREE.Vector3; yaw: number; ph: number }[] = [];
  private tmp = new THREE.Vector3();
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private s = new THREE.Vector3();
  private up = new THREE.Vector3(0, 1, 0);
  private one = new THREE.Vector3(1, 1, 1);

  constructor(private crowd: Crowd) {
    const people = crowd.people;
    people.forEach((p, i) => {
      if (!DOG_KINDS.includes(p.kind)) return;
      const coat = (p.slot ?? 0) & 1;
      this.dogs.push({ i, coat, last: crowd.positionOf(i, new THREE.Vector3()), yaw: Math.random() * 6.28, ph: Math.random() * 6 });
      // (its pixel sprite gone: the dog is drawn here)
      crowd.hide(i, true);
    });
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
    COATS.forEach((c, k) => {
      const n = Math.max(1, this.dogs.filter((d) => d.coat === k).length);
      const im = new THREE.InstancedMesh(dogGeometry(...c), mat, n);
      im.castShadow = true;
      im.receiveShadow = true;
      im.frustumCulled = false;
      im.count = 0;
      im.name = "real:dogs";
      this.meshes.push(im);
      this.group.add(im);
    });
  }

  /** Each frame: every dog within `radius` of the focus at its place on its walk, facing its way, trotting. */
  update(dt: number, focus: THREE.Vector3, radius: number) {
    const counts = [0, 0];
    const r2 = radius * radius;
    for (const d of this.dogs) {
      const at = this.crowd.positionOf(d.i, this.tmp);
      const dx = at.x - d.last.x,
        dz = at.z - d.last.z;
      const step = Math.hypot(dx, dz);
      if (step > 0.002 && step < 2) {
        let dy = Math.atan2(-dz, dx) - d.yaw;
        dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        d.yaw += dy * Math.min(1, dt * 10);
      }
      const moving = dt > 0 && step / dt > 0.2;
      if (moving) d.ph += dt * 14;
      d.last.copy(at);
      if ((at.x - focus.x) ** 2 + (at.z - focus.z) ** 2 > r2) continue;
      const bob = moving ? Math.abs(Math.sin(d.ph)) * 0.03 : 0;
      this.q.setFromAxisAngle(this.up, d.yaw);
      this.m.compose(this.s.set(at.x, at.y + bob, at.z), this.q, this.one);
      const im = this.meshes[d.coat];
      im.setMatrixAt(counts[d.coat]++, this.m);
    }
    this.meshes.forEach((im, k) => {
      im.count = counts[k];
      im.instanceMatrix.needsUpdate = true;
    });
  }
}
