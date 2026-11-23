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
  /** A door of its own already (no portal drawn, E still takes you in). */
  bare?: boolean;
  /** The way out of the building (flat, unit). */
  fx: number;
  fz: number;
  label: string;
  /** The floor there. */
  y: number;
}

const W = 2.8;
const H = 3.1;
const FRAME = new THREE.MeshStandardMaterial({ color: "#1c1d23", roughness: 0.32, metalness: 0.85 });
const STONE = new THREE.MeshStandardMaterial({ color: "#2a2a31", roughness: 0.55, metalness: 0.2 });
const GLASS = new THREE.MeshStandardMaterial({ color: "#c9e2ef", roughness: 0.04, metalness: 0.5, transparent: true, opacity: 0.24, depthWrite: false });
const HANDLE = new THREE.MeshStandardMaterial({ color: "#d9a21e", roughness: 0.25, metalness: 1 });
const TRIM = new THREE.MeshBasicMaterial({ color: new THREE.Color("#f4b728").multiplyScalar(1.8), toneMapped: false });
const LAMP = new THREE.MeshBasicMaterial({ color: new THREE.Color("#fff1d6").multiplyScalar(3.2), toneMapped: false });
const MAT = new THREE.MeshStandardMaterial({ color: "#1d1b21", roughness: 0.95 });
for (const m of [FRAME, STONE, GLASS, HANDLE, TRIM, LAMP, MAT]) m.userData.shared = true;

/** The lobby seen through the glass: warm light from above, a floor line, a counter's silhouette. */
const LOBBY = (() => {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 128;
  const g = c.getContext("2d")!;
  const v = g.createLinearGradient(0, 0, 0, 128);
  v.addColorStop(0, "#fff2cf");
  v.addColorStop(0.45, "#d9b47a");
  v.addColorStop(0.72, "#8a6a44");
  v.addColorStop(1, "#3a2c1f");
  g.fillStyle = v;
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = "rgba(40,28,18,0.55)";
  g.fillRect(28, 78, 72, 22);
  g.fillStyle = "rgba(255,255,255,0.5)";
  for (const x of [20, 64, 108]) g.fillRect(x - 10, 4, 20, 3);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
})();
const LOBBY_MAT = new THREE.MeshBasicMaterial({ map: LOBBY, toneMapped: false });
LOBBY_MAT.color.setScalar(1.15);

/** The pool of light on the pavement under the canopy. */
const POOL = (() => {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const r = g.createRadialGradient(64, 40, 4, 64, 56, 70);
  r.addColorStop(0, "rgba(255,226,170,0.85)");
  r.addColorStop(0.55, "rgba(255,214,150,0.28)");
  r.addColorStop(1, "rgba(255,210,140,0)");
  g.fillStyle = r;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
})();
const POOL_MAT = new THREE.MeshBasicMaterial({ map: POOL, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, opacity: 0.5 });

function signTexture(label: string) {
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 128;
  const g = c.getContext("2d")!;
  g.fillStyle = "#0b0c10";
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = "#f4b728";
  g.fillRect(0, c.height - 8, c.width, 8);
  g.fillStyle = "#ffffff";
  g.textAlign = "center";
  g.textBaseline = "middle";
  let size = 72;
  const font = (s: number) => `900 ${s}px Archivo, Roboto, sans-serif`;
  g.font = font(size);
  while (g.measureText(label).width > c.width - 80 && size > 28) g.font = font((size -= 4));
  g.fillText(label, c.width / 2, c.height / 2 - 2);
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
  private pool: THREE.Mesh;
  private own: THREE.BufferGeometry[] = [];
  constructor(readonly spot: DoorSpot) {
    const g = this.group;
    g.position.set(spot.x, spot.y, spot.z);
    // the portal's plane faces the street: its +z is the way out, the wall just behind z = 0
    g.rotation.y = Math.atan2(spot.fx, spot.fz);
    const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z = 0) => {
      const geo = new THREE.BoxGeometry(w, h, d);
      this.own.push(geo);
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.set(x, y, z);
      mesh.castShadow = m !== GLASS && m !== LOBBY_MAT && m !== LAMP && m !== TRIM;
      mesh.receiveShadow = true;
      g.add(mesh);
      return mesh;
    };
    // the surround: stone jambs and a deep lintel, standing proud of the wall
    const D = 0.55;
    box(0.5, H + 0.7, D, STONE, -W / 2 - 0.25, (H + 0.7) / 2, D / 2 - 0.1);
    box(0.5, H + 0.7, D, STONE, W / 2 + 0.25, (H + 0.7) / 2, D / 2 - 0.1);
    box(W + 1, 0.7, D, STONE, 0, H + 0.35, D / 2 - 0.1);
    // a gold line round the opening
    box(0.04, H, 0.04, TRIM, -W / 2 - 0.02, H / 2, D - 0.09);
    box(0.04, H, 0.04, TRIM, W / 2 + 0.02, H / 2, D - 0.09);
    box(W + 0.08, 0.04, 0.04, TRIM, 0, H + 0.02, D - 0.09);
    // the recess: the lit lobby behind the glass, its side walls
    const lobby = new THREE.Mesh(new THREE.PlaneGeometry(W, H), LOBBY_MAT);
    this.own.push(lobby.geometry);
    lobby.position.set(0, H / 2, -0.35);
    g.add(lobby);
    box(0.05, H, 0.5, FRAME, -W / 2, H / 2, -0.1);
    box(0.05, H, 0.5, FRAME, W / 2, H / 2, -0.1);
    // the threshold step
    box(W + 0.4, 0.12, 0.7, STONE, 0, 0.06, 0.25);
    // the canopy: a dark slab out over the pavement, lamps under it
    box(W + 1.6, 0.16, 1.9, FRAME, 0, H + 0.78, 0.85);
    for (const x of [-W / 2, 0, W / 2]) box(0.34, 0.03, 0.34, LAMP, x, H + 0.69, 1.15);
    // lanterns on the jambs
    for (const x of [-W / 2 - 0.25, W / 2 + 0.25]) {
      box(0.16, 0.34, 0.16, FRAME, x, 2.2, D - 0.02);
      box(0.1, 0.24, 0.1, LAMP, x, 2.2, D + 0.04);
    }
    // the leaves: glass in a thin frame, a gold bar handle
    const leaf = (side: -1 | 1) => {
      const p = new THREE.Group();
      const geo = new THREE.BoxGeometry(W / 2 - 0.04, H - 0.12, 0.04);
      this.own.push(geo);
      const glass = new THREE.Mesh(geo, GLASS);
      glass.position.y = H / 2;
      glass.renderOrder = 2;
      p.add(glass);
      for (const [w, h, x, y] of [
        [W / 2, 0.08, 0, 0.04],
        [W / 2, 0.08, 0, H - 0.04],
        [0.06, H, -side * (W / 4 - 0.03), H / 2],
      ] as const) {
        const fg = new THREE.BoxGeometry(w, h, 0.07);
        this.own.push(fg);
        const m = new THREE.Mesh(fg, FRAME);
        m.position.set(x, y, 0);
        p.add(m);
      }
      const hg = new THREE.BoxGeometry(0.05, 1.1, 0.05);
      this.own.push(hg);
      const bar = new THREE.Mesh(hg, HANDLE);
      bar.position.set(-side * (W / 4 - 0.18), 1.15, 0.08);
      p.add(bar);
      p.position.set((side * W) / 4, 0, 0.12);
      g.add(p);
      return p;
    };
    this.left = leaf(-1);
    this.right = leaf(1);
    // the sign on the canopy's front, lit
    const mat = new THREE.MeshBasicMaterial({ map: signTexture(spot.label), toneMapped: false });
    mat.color.setScalar(1.3);
    const sg = new THREE.PlaneGeometry(W + 1.5, ((W + 1.5) * 128) / 1024);
    this.own.push(sg);
    this.sign = new THREE.Mesh(sg, mat);
    this.sign.position.set(0, H + 0.98, 1.81);
    g.add(this.sign);
    // the mat, and the light on the pavement
    const mg = new THREE.PlaneGeometry(W, 1.3);
    this.own.push(mg);
    const m = new THREE.Mesh(mg, MAT);
    m.rotation.x = -Math.PI / 2;
    m.position.set(0, 0.125, 0.4);
    m.receiveShadow = true;
    g.add(m);
    const pg = new THREE.PlaneGeometry(W + 2.4, 3.2);
    this.own.push(pg);
    this.pool = new THREE.Mesh(pg, POOL_MAT);
    this.pool.rotation.x = -Math.PI / 2;
    this.pool.position.set(0, 0.02, 1.6);
    this.pool.renderOrder = 2;
    g.add(this.pool);
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
    for (const geo of this.own) geo.dispose();
    (this.sign.material as THREE.MeshBasicMaterial).map?.dispose();
    (this.sign.material as THREE.Material).dispose();
  }
}

export class Doors {
  readonly group = new THREE.Group();
  private list: Door[] = [];
  private bare: DoorSpot[] = [];
  /** The door you are at (in reach, outside it, facing it more or less), or null. */
  at: DoorSpot | null = null;

  constructor(scene: THREE.Scene) {
    this.group.name = "gta:doors";
    this.group.visible = false;
    scene.add(this.group);
  }

  /** The pools of light under the canopies: brighter at night. */
  night(on: boolean) {
    POOL_MAT.opacity = on ? 0.75 : 0.3;
  }

  /** The places' doors (made again when the list changes: a place that opened). */
  set(all: DoorSpot[]) {
    this.bare = all.filter((s) => s.bare);
    const spots = all.filter((s) => !s.bare);
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
    void 0;
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
        if (dist < 3.8 && out > -0.6 && dist < best) {
          best = dist;
          this.at = s;
        }
      }
      d.update(dt, near);
    }
    if (me)
      for (const sp of this.bare) {
        const dx = me.x - sp.x,
          dz = me.z - sp.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 3.4 && dx * sp.fx + dz * sp.fz > -0.6 && dist < best) {
          best = dist;
          this.at = sp;
        }
      }
  }
}
