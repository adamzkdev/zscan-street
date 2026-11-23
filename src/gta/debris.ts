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

/**
 * What a car knocks over in the street (src/gta): a lamp post, a tree, a sign — its standing copy is
 * folded out of the city's batch (scene/voxel/mesher.ts PROP_HOLES) and this one falls in its place,
 * the way it was hit, and lies there.
 */
interface Down {
  group: THREE.Group;
  t: number;
  axis: THREE.Vector3;
  at: THREE.Vector3;
  key: string;
}

const POLE = new THREE.MeshStandardMaterial({ color: "#2a2a32", roughness: 0.5, metalness: 0.6 });
const LIGHT = new THREE.MeshBasicMaterial({ color: new THREE.Color("#fff1d6").multiplyScalar(1.4), toneMapped: false });
const BARK = new THREE.MeshStandardMaterial({ color: "#5a3d26", roughness: 0.9 });
const LEAF = new THREE.MeshStandardMaterial({ color: "#3f8a3a", roughness: 0.8 });
const BOX = new THREE.BoxGeometry(1, 1, 1);

export class Fallen {
  readonly group = new THREE.Group();
  private list: Down[] = [];

  constructor() {
    this.group.name = "gta:fallen";
  }

  /** Down it goes: `type` the prop's kind, at (x, y, z), pushed along (dx, dz). */
  fall(key: string, type: string, x: number, y: number, z: number, dx: number, dz: number) {
    const g = new THREE.Group();
    const part = (m: THREE.Material, w: number, h: number, d: number, py: number) => {
      const b = new THREE.Mesh(BOX, m);
      b.scale.set(w, h, d);
      b.position.y = py;
      b.castShadow = true;
      g.add(b);
    };
    if (type === "lamp") {
      part(POLE, 0.16, 5, 0.16, 2.5);
      part(POLE, 0.14, 0.14, 1.2, 5);
      part(LIGHT, 0.3, 0.12, 0.5, 4.95);
    } else if (type === "tree" || type === "maple") {
      part(BARK, 0.34, 2.6, 0.34, 1.3);
      const leaf = type === "maple" ? new THREE.MeshStandardMaterial({ color: "#c0482e", roughness: 0.8 }) : LEAF;
      part(leaf, 2.4, 2, 2.4, 3.4);
      part(leaf, 1.6, 1.2, 1.6, 4.6);
    } else return false;
    g.position.set(x, y, z);
    this.group.add(g);
    const l = Math.hypot(dx, dz) || 1;
    // the axis it tips over about: across the way it was pushed
    const axis = new THREE.Vector3(dz / l, 0, -dx / l);
    this.list.push({ group: g, t: 0, axis, at: g.position.clone(), key });
    if (this.list.length > 48) this.drop(this.list[0]);
    return true;
  }

  private drop(d: Down) {
    this.list.splice(this.list.indexOf(d), 1);
    d.group.removeFromParent();
  }

  /** Stood up again (its hole was given back). */
  raise(key: string) {
    const d = this.list.find((x) => x.key === key);
    if (d) this.drop(d);
  }

  update(dt: number) {
    for (const d of this.list) {
      if (d.t >= 1) continue;
      d.t = Math.min(1, d.t + dt * 1.6);
      // falls faster and faster, a little bounce at the end
      const k = d.t * d.t;
      const ang = (Math.PI / 2 - 0.06) * k + (d.t >= 1 ? 0.06 : 0);
      d.group.quaternion.setFromAxisAngle(d.axis, ang);
    }
  }

  clear() {
    for (const d of [...this.list]) this.drop(d);
  }
}
