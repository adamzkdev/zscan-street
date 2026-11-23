import * as THREE from "three";

/**
 * Pieces flying (src/gta): what a smashed thing leaves, voxel chunks in its colours, thrown, falling,
 * bouncing on the floor they fell from and lying there a while. Every piece in one instanced draw.
 */
interface Piece {
  p: THREE.Vector3;
  v: THREE.Vector3;
  r: THREE.Euler;
  w: THREE.Vector3;
  s: number;
  floor: number;
  life: number;
}

const MAX = 600;

export class Debris {
  readonly mesh: THREE.InstancedMesh;
  private list: Piece[] = [];
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private sv = new THREE.Vector3();
  private c = new THREE.Color();

  constructor() {
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.7, metalness: 0.05 }), MAX);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.setColorAt(0, this.c.set(0xffffff));
    this.mesh.name = "gta:debris";
  }

  /** Into the scene where the smash happened (the street or a place). */
  into(scene: THREE.Object3D) {
    if (this.mesh.parent !== scene) scene.add(this.mesh);
  }

  /**
   * A thing in pieces: its box (world), its colours (picked at random per piece), the way it was hit
   * (m/s), the floor under it.
   */
  burst(box: THREE.Box3, colors: THREE.Color[], push: THREE.Vector3, floor: number, n?: number) {
    const size = box.getSize(new THREE.Vector3());
    const vol = size.x * size.y * size.z;
    const count = n ?? Math.max(6, Math.min(28, Math.round(vol * 40) + 6));
    const piece = Math.max(0.05, Math.min(0.32, Math.cbrt(vol / count) * 0.9));
    for (let i = 0; i < count; i++) {
      if (this.list.length >= MAX) this.list.shift();
      const p = new THREE.Vector3(box.min.x + Math.random() * size.x, box.min.y + Math.random() * size.y, box.min.z + Math.random() * size.z);
      const v = push.clone().multiplyScalar(0.4 + Math.random() * 0.7).add(new THREE.Vector3((Math.random() - 0.5) * 4, 1.5 + Math.random() * 3.5, (Math.random() - 0.5) * 4));
      const col = colors[Math.floor(Math.random() * colors.length)] ?? new THREE.Color(0x888888);
      const pc: Piece = { p, v, r: new THREE.Euler(Math.random() * 3, Math.random() * 3, Math.random() * 3), w: new THREE.Vector3((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14), s: piece * (0.6 + Math.random() * 0.8), floor, life: 6 + Math.random() * 3 };
      this.list.push(pc);
      (pc as Piece & { col: THREE.Color }).col = col;
    }
  }

  update(dt: number) {
    const L = this.list;
    for (let i = L.length - 1; i >= 0; i--) {
      const d = L[i];
      d.life -= dt;
      if (d.life <= 0) {
        L.splice(i, 1);
        continue;
      }
      const resting = d.v.lengthSq() < 0.01 && d.p.y <= d.floor + d.s / 2 + 0.001;
      if (!resting) {
        d.v.y -= 15 * dt;
        d.p.addScaledVector(d.v, dt);
        d.r.x += d.w.x * dt;
        d.r.y += d.w.y * dt;
        d.r.z += d.w.z * dt;
        const ground = d.floor + d.s / 2;
        if (d.p.y < ground) {
          d.p.y = ground;
          d.v.y = Math.abs(d.v.y) * 0.3;
          d.v.x *= 0.6;
          d.v.z *= 0.6;
          d.w.multiplyScalar(0.5);
          if (d.v.lengthSq() < 0.3) d.v.set(0, 0, 0);
        }
      }
    }
    const n = L.length;
    for (let i = 0; i < n; i++) {
      const d = L[i];
      // the last second: shrinks away
      const k = Math.min(1, d.life);
      this.q.setFromEuler(d.r);
      this.m.compose(d.p, this.q, this.sv.setScalar(d.s * k));
      this.mesh.setMatrixAt(i, this.m);
      this.mesh.setColorAt(i, (d as Piece & { col: THREE.Color }).col);
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  clear() {
    this.list = [];
    this.mesh.count = 0;
  }
}

/** The colours a mesh is drawn in (its material's, its vertex colours'), for its pieces. */
export function colorsOf(o: THREE.Object3D): THREE.Color[] {
  const out: THREE.Color[] = [];
  o.traverse((x) => {
    const m = x as THREE.Mesh;
    if (!m.isMesh) return;
    for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
      const c = (mat as THREE.MeshStandardMaterial).color;
      if (c) out.push(c.clone());
      const e = (mat as THREE.MeshStandardMaterial).emissive;
      if (e && (e.r + e.g + e.b > 0.3)) out.push(e.clone());
    }
    const vc = m.geometry?.getAttribute("color");
    if (vc && vc.count) for (let i = 0; i < 4; i++) out.push(new THREE.Color().fromBufferAttribute(vc as THREE.BufferAttribute, Math.floor(Math.random() * vc.count)));
  });
  return out.length ? out : [new THREE.Color(0x8a8a90)];
}
