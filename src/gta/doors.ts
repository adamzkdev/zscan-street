import * as THREE from "three";

/**
 * The places' doors for the game (src/gta): every walk-in place gets an entrance set in its facade —
 * a dark frame, tinted glass with the lobby's light behind it, its name on a plate above, a lamp each
 * side — or, where there is no wall (a garden, a plaza), a gate. Doors are doors: closed, solid
 * (the game's feet stop at them), and E (or the touch button) takes you in.
 */

export interface DoorSpot {
  key: string;
  x: number;
  z: number;
  /** A door of its own already (no portal drawn, E still takes you in). */
  bare?: boolean;
  /** Set in a wall (found behind it); false: standing free (a gate). */
  wall?: boolean;
  /** The way out of the building (flat, unit). */
  fx: number;
  fz: number;
  label: string;
  /** The floor there. */
  y: number;
}

const FRAME = new THREE.MeshStandardMaterial({ color: "#1c1d23", roughness: 0.32, metalness: 0.85 });
const STONE = new THREE.MeshStandardMaterial({ color: "#2a2a31", roughness: 0.55, metalness: 0.2 });
const GLASS = new THREE.MeshStandardMaterial({ color: "#26323a", roughness: 0.06, metalness: 0.6, transparent: true, opacity: 0.62, depthWrite: false });
const HANDLE = new THREE.MeshStandardMaterial({ color: "#d9a21e", roughness: 0.25, metalness: 1 });
const LAMP = new THREE.MeshBasicMaterial({ color: new THREE.Color("#fff1d6").multiplyScalar(3.2), toneMapped: false });
for (const m of [FRAME, STONE, GLASS, HANDLE, LAMP]) m.userData.shared = true;

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

/**
 * A door: set in the wall it stands against (`wall`), a dark frame, two leaves of tinted glass with
 * the warm light of the lobby behind them, the place's name on a plate above, a lamp each side, a
 * step. A door, closed: you don't walk through it, E takes you in. With no wall behind it (a garden,
 * a plaza), a gate: two piers, a lintel with the name, barred leaves.
 */
class Door {
  readonly group = new THREE.Group();
  private ring: THREE.Mesh;
  private own: THREE.BufferGeometry[] = [];
  private signMat: THREE.MeshBasicMaterial;
  private t = Math.random() * 6;
  constructor(readonly spot: DoorSpot) {
    const g = this.group;
    g.position.set(spot.x, spot.y, spot.z);
    // its +z is the way out; the wall's face just behind z = 0
    g.rotation.y = Math.atan2(spot.fx, spot.fz);
    const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z = 0) => {
      const geo = new THREE.BoxGeometry(w, h, d);
      this.own.push(geo);
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.set(x, y, z);
      mesh.castShadow = m === FRAME || m === STONE;
      mesh.receiveShadow = true;
      g.add(mesh);
      return mesh;
    };
    const walled = spot.wall !== false;
    const Wd = walled ? 2.3 : 2.8;
    const Hd = walled ? 2.75 : 2.9;
    if (walled) {
      // the lobby's light, just proud of the wall, seen through the glass
      const lobby = new THREE.Mesh(new THREE.PlaneGeometry(Wd, Hd), LOBBY_MAT);
      this.own.push(lobby.geometry);
      lobby.position.set(0, Hd / 2, -0.035);
      g.add(lobby);
      // the frame: jambs and a head, a little proud of the wall
      box(0.12, Hd + 0.12, 0.16, FRAME, -Wd / 2 - 0.06, (Hd + 0.12) / 2, -0.02);
      box(0.12, Hd + 0.12, 0.16, FRAME, Wd / 2 + 0.06, (Hd + 0.12) / 2, -0.02);
      box(Wd + 0.24, 0.12, 0.16, FRAME, 0, Hd + 0.06, -0.02);
      box(Wd, 0.06, 0.12, FRAME, 0, 0.03, -0.02);
      // the leaves: tinted glass in a thin frame, a brass bar each
      for (const side of [-1, 1]) {
        const glass = box(Wd / 2 - 0.05, Hd - 0.1, 0.03, GLASS, (side * Wd) / 4, Hd / 2, 0.01);
        glass.renderOrder = 2;
        box(0.05, Hd - 0.06, 0.06, FRAME, (side * Wd) / 2 - side * 0.025, Hd / 2, 0.01);
        box(0.04, Hd - 0.06, 0.06, FRAME, side * 0.02, Hd / 2, 0.01);
        box(Wd / 2, 0.07, 0.06, FRAME, (side * Wd) / 4, 0.1, 0.01);
        box(0.035, 1.0, 0.035, HANDLE, side * 0.16, 1.1, 0.07);
      }
      // the step
      box(Wd + 0.5, 0.08, 0.55, STONE, 0, 0.04, 0.27);
      // a lamp each side, on the wall
      for (const x of [-Wd / 2 - 0.42, Wd / 2 + 0.42]) {
        box(0.14, 0.3, 0.1, FRAME, x, 2.15, 0.01);
        box(0.08, 0.2, 0.05, LAMP, x, 2.15, 0.07);
      }
    } else {
      // a gate: stone piers, a lintel, barred leaves
      box(0.45, Hd + 0.5, 0.45, STONE, -Wd / 2 - 0.22, (Hd + 0.5) / 2, 0);
      box(0.45, Hd + 0.5, 0.45, STONE, Wd / 2 + 0.22, (Hd + 0.5) / 2, 0);
      box(Wd + 0.9, 0.42, 0.5, STONE, 0, Hd + 0.29, 0);
      for (const side of [-1, 1]) {
        box(Wd / 2 - 0.04, 0.06, 0.06, FRAME, (side * Wd) / 4, 0.25, 0);
        box(Wd / 2 - 0.04, 0.06, 0.06, FRAME, (side * Wd) / 4, Hd - 0.2, 0);
        for (let k = 0; k < 6; k++) box(0.035, Hd - 0.35, 0.035, FRAME, side * (0.1 + k * ((Wd / 2 - 0.2) / 5)), Hd / 2 - 0.05, 0);
      }
      for (const x of [-Wd / 2 - 0.22, Wd / 2 + 0.22]) box(0.2, 0.26, 0.2, LAMP, x, Hd + 0.68, 0);
    }
    // the name, on a plate over the door
    this.signMat = new THREE.MeshBasicMaterial({ map: signTexture(spot.label), toneMapped: false });
    this.signMat.color.setScalar(1.2);
    const sw = Math.min(Wd + 1.4, Math.max(Wd, spot.label.length * 0.2 + 0.6));
    const sg = new THREE.PlaneGeometry(sw, (sw * 128) / 1024);
    this.own.push(sg);
    const sign = new THREE.Mesh(sg, this.signMat);
    sign.position.set(0, walled ? Hd + 0.42 : Hd + 0.29, walled ? 0.0 : 0.26);
    g.add(sign);
    if (walled) box(sw + 0.08, (sw * 128) / 1024 + 0.08, 0.05, FRAME, 0, Hd + 0.42, -0.03);
    // a soft ring on the pavement where E takes you in
    const rg = new THREE.RingGeometry(0.5, 0.62, 48);
    this.own.push(rg);
    this.ring = new THREE.Mesh(rg, RING_MAT);
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.set(0, 0.04, 1.2);
    this.ring.renderOrder = 2;
    g.add(this.ring);
    g.traverse((o) => (o.userData.noField = true));
  }

  /** The ring breathes; brighter when you are close. */
  update(dt: number, near: boolean) {
    this.t += dt;
    const s = 1 + Math.sin(this.t * 2.4) * 0.05;
    this.ring.scale.set(s, s, 1);
    this.ring.visible = near;
  }

  dispose() {
    this.group.removeFromParent();
    for (const geo of this.own) geo.dispose();
    this.signMat.map?.dispose();
    this.signMat.dispose();
  }
}

const RING_MAT = new THREE.MeshBasicMaterial({ color: new THREE.Color("#f4b728").multiplyScalar(1.6), toneMapped: false, transparent: true, opacity: 0.7, depthWrite: false });
RING_MAT.userData.shared = true;

/** A door's leaves and frame, for the feet: within its width and just in front of it, a wall. */
export const DOOR_HALF = 1.4;

export class Doors {
  readonly group = new THREE.Group();
  private list: Door[] = [];
  private bare: DoorSpot[] = [];
  /** The ferry landings' markers (a lit sign on a post, a ring on the stage). */
  private stages = new Map<string, THREE.Group>();
  /** The door you are at (in reach, outside it, facing it more or less), or null. */
  at: DoorSpot | null = null;

  constructor(scene: THREE.Scene) {
    this.group.name = "gta:doors";
    this.group.visible = false;
    scene.add(this.group);
  }

  /** (At night the lobbies glow a little brighter.) */
  night(on: boolean) {
    LOBBY_MAT.color.setScalar(on ? 1.35 : 1.1);
  }

  /** The places' doors (made again when the list changes: a place that opened). */
  set(all: DoorSpot[]) {
    this.bare = all.filter((s) => s.bare);
    for (const sp of this.bare)
      if (sp.key.startsWith("ferry:") && !this.stages.has(sp.key)) {
        const g = new THREE.Group();
        g.position.set(sp.x, sp.y, sp.z);
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, 2.6, 0.14), FRAME);
        post.position.set(1.2, 1.3, 0);
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.45), new THREE.MeshBasicMaterial({ map: signTexture("FERRY"), toneMapped: false, side: THREE.DoubleSide }));
        sign.position.set(1.2, 2.75, 0);
        sign.rotation.y = Math.atan2(sp.fx, sp.fz);
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.05, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color("#3fd6c6").multiplyScalar(2), toneMapped: false, transparent: true, opacity: 0.85 }));
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.03;
        g.add(post, sign, ring);
        g.traverse((o) => (o.userData.noField = true));
        this.group.add(g);
        this.stages.set(sp.key, g);
      }
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
        near = dist < 6;
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
        if (dist < (sp.key.startsWith("ferry:") ? 2.6 : 3.4) && (sp.key.startsWith("ferry:") || dx * sp.fx + dz * sp.fz > -0.6) && dist < best) {
          best = dist;
          this.at = sp;
        }
      }
  }
}
