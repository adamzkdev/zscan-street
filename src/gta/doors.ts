import * as THREE from "three";

/**
 * The places' doors for the game (src/gta): every walk-in place gets a proper entrance on its
 * facade — a dark metal frame, two glass leaves that slide apart as you come up to them, a lit
 * sign with the place's name over them and a mat on the pavement. You walk up, the doors open,
 * and E (or the touch button) takes you in.
 */

export interface DoorSpot {
  key: string;
  x: number;
  z: number;
  /** The way out of the building (flat, unit). */
  fx: number;
  fz: number;
  label: string;
  /** The floor there. */
  y: number;
}

const W = 2.6;
const H = 3;
const FRAME = new THREE.MeshStandardMaterial({ color: "#1a1b21", roughness: 0.35, metalness: 0.85 });
const GLASS = new THREE.MeshStandardMaterial({ color: "#9fc4d8", roughness: 0.05, metalness: 0.4, transparent: true, opacity: 0.32, depthWrite: false });
const HANDLE = new THREE.MeshStandardMaterial({ color: "#d9a21e", roughness: 0.25, metalness: 1 });
const MAT = new THREE.MeshStandardMaterial({ color: "#232129", roughness: 0.95 });

function signTexture(label: string) {
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 160;
  const g = c.getContext("2d")!;
  g.fillStyle = "#0c0d12";
  g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = "#f4b728";
  g.lineWidth = 6;
  g.strokeRect(8, 8, c.width - 16, c.height - 16);
  g.fillStyle = "#ffffff";
  g.textAlign = "center";
  g.textBaseline = "middle";
  let size = 84;
  const font = (s: number) => `900 ${s}px Archivo, Roboto, sans-serif`;
  g.font = font(size);
  while (g.measureText(label).width > c.width - 80 && size > 30) g.font = font((size -= 4));
  g.fillText(label, c.width / 2, c.height / 2 + 4);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

class Door {
  readonly group = new THREE.Group();
  private left: THREE.Object3D;
  private right: THREE.Object3D;
  private open = 0;
  private sign: THREE.Mesh;
  constructor(readonly spot: DoorSpot) {
    const g = this.group;
    g.position.set(spot.x + spot.fx * 0.06, spot.y, spot.z + spot.fz * 0.06);
    // the doors' plane faces the street: its +z is the way out
    g.rotation.y = Math.atan2(spot.fx, spot.fz);
    const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z = 0) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      mesh.position.set(x, y, z);
      mesh.castShadow = m !== GLASS;
      mesh.receiveShadow = true;
      g.add(mesh);
      return mesh;
    };
    // the frame: two posts, a lintel, a threshold
    box(0.16, H, 0.3, FRAME, -W / 2 - 0.08, H / 2);
    box(0.16, H, 0.3, FRAME, W / 2 + 0.08, H / 2);
    box(W + 0.32, 0.18, 0.32, FRAME, 0, H + 0.09);
    box(W + 0.32, 0.04, 0.5, FRAME, 0, 0.02, 0.05);
    // the leaves: glass in a thin frame, a gold bar handle
    const leaf = (side: -1 | 1) => {
      const p = new THREE.Group();
      const glass = new THREE.Mesh(new THREE.BoxGeometry(W / 2 - 0.04, H - 0.12, 0.04), GLASS);
      glass.position.y = H / 2;
      glass.renderOrder = 2;
      p.add(glass);
      for (const [w, h, x, y] of [
        [W / 2, 0.08, 0, 0.04],
        [W / 2, 0.08, 0, H - 0.04],
        [0.06, H, -side * (W / 4 - 0.03), H / 2],
      ] as const) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.07), FRAME);
        m.position.set(x, y, 0);
        p.add(m);
      }
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.1, 0.05), HANDLE);
      bar.position.set(-side * (W / 4 - 0.18), 1.15, 0.08);
      p.add(bar);
      p.position.x = (side * W) / 4;
      g.add(p);
      return p;
    };
    this.left = leaf(-1);
    this.right = leaf(1);
    // the sign over the door, lit
    const mat = new THREE.MeshBasicMaterial({ map: signTexture(spot.label), toneMapped: false });
    mat.color.setScalar(1.35);
    this.sign = new THREE.Mesh(new THREE.PlaneGeometry(W + 0.6, ((W + 0.6) * 160) / 1024), mat);
    this.sign.position.set(0, H + 0.48, 0.17);
    g.add(this.sign);
    // the mat on the pavement
    const m = new THREE.Mesh(new THREE.PlaneGeometry(W, 1.3), MAT);
    m.rotation.x = -Math.PI / 2;
    m.position.set(0, 0.012, 0.85);
    m.receiveShadow = true;
    g.add(m);
    g.traverse((o) => (o.userData.noField = true));
  }

  /** The leaves slide apart when someone is close. */
  update(dt: number, near: boolean) {
    this.open += ((near ? 1 : 0) - this.open) * Math.min(1, dt * 5);
    const o = this.open * (W / 2 - 0.1);
    this.left.position.x = -W / 4 - o;
    this.right.position.x = W / 4 + o;
  }

  dispose() {
    this.group.removeFromParent();
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.geometry.dispose();
      if (m.material === this.sign.material) {
        (m.material as THREE.MeshBasicMaterial).map?.dispose();
        (m.material as THREE.Material).dispose();
      }
    });
  }
}

export class Doors {
  readonly group = new THREE.Group();
  private list: Door[] = [];
  /** The door you are at (in reach, outside it, facing it more or less), or null. */
  at: DoorSpot | null = null;

  constructor(scene: THREE.Scene) {
    this.group.name = "gta:doors";
    this.group.visible = false;
    scene.add(this.group);
  }

  /** The places' doors (made again when the list changes: a place that opened). */
  set(spots: DoorSpot[]) {
    const key = (s: DoorSpot) => `${s.key}@${s.x.toFixed(1)},${s.z.toFixed(1)}`;
    const want = new Map(spots.map((s) => [key(s), s]));
    for (const d of [...this.list])
      if (!want.has(key(d.spot))) {
        d.dispose();
        this.list.splice(this.list.indexOf(d), 1);
      }
    for (const [k, s] of want)
      if (!this.list.some((d) => key(d.spot) === k)) {
        const d = new Door(s);
        this.group.add(d.group);
        this.list.push(d);
      }
  }

  show(on: boolean) {
    this.group.visible = on;
  }

  /** Each frame on foot (or `null` at the wheel). */
  update(dt: number, me: { x: number; z: number; heading: number } | null) {
    this.at = null;
    let best = Infinity;
    for (const d of this.list) {
      const s = d.spot;
      let near = false;
      if (me) {
        const dx = me.x - s.x,
          dz = me.z - s.z;
        const dist = Math.hypot(dx, dz);
        // on the street side of it, within reach
        const out = dx * s.fx + dz * s.fz;
        near = dist < 5;
        if (dist < 3.4 && out > -0.6 && dist < best) {
          best = dist;
          this.at = s;
        }
      }
      d.update(dt, near);
    }
  }
}
