import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/**
 * The places' doors for the game (src/gta): every walk-in place has an ordinary front door on the
 * facade that faces its street or plaza — glass doors in a frame with the lobby's light behind them,
 * a lit canopy, its name on a plate above. Doors are doors: closed, solid (the game's feet stop at
 * them), and E (or the touch button) takes you in.
 */

export type DoorStyle = "glass" | "classic" | "revolving" | "shop" | "wood";
/** How far out in front of its wall a door of this kind stands (its leaves stop you there). */
export const doorDepth = (s: DoorSpot) => (s.drawn && s.style === "revolving" ? 0.85 : 0.34);

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
  /** Clear pavement in front of it (m), when known: a grand entrance's carpet fits in it. */
  room?: number;
  /** Draw a door here (a wall with no entrance of its own); off: the building's own entrance is the door. */
  drawn?: boolean;
  /**
   * A drawn door's kind, in the building's own manner: a pair of glass doors (a lobby), an arched pair in
   * bronze in a stone surround (a classical monument), a revolving door between two glass ones (a tower),
   * a wide glazed shopfront entrance under its fascia (a mall, a shop), a panelled wooden one (a house).
   */
  style?: DoorStyle;
}

const UNDERLIGHT = new THREE.MeshBasicMaterial({ color: new THREE.Color("#fff0d0").multiplyScalar(1.6), toneMapped: false });
UNDERLIGHT.userData.shared = true;

const FRAME = new THREE.MeshStandardMaterial({ color: "#1c1d23", roughness: 0.32, metalness: 0.85 });
const GLASS = new THREE.MeshStandardMaterial({ color: "#2e3e48", roughness: 0.04, metalness: 0.85, transparent: true, opacity: 0.42, depthWrite: false });
const HANDLE = new THREE.MeshStandardMaterial({ color: "#d9a21e", roughness: 0.25, metalness: 1 });
const SURROUND = new THREE.MeshStandardMaterial({ color: "#9a958c", roughness: 0.75, metalness: 0.05 });
const STONE = new THREE.MeshStandardMaterial({ color: "#8a857c", roughness: 0.8, metalness: 0.02 });
const STONE_LIGHT = new THREE.MeshStandardMaterial({ color: "#cfc6b4", roughness: 0.78, metalness: 0.02 });
const GRANITE = new THREE.MeshStandardMaterial({ color: "#4a4a50", roughness: 0.4, metalness: 0.1 });
const BRONZE_LEAF = new THREE.MeshStandardMaterial({ color: "#3e2f1f", roughness: 0.42, metalness: 0.85 });
const HANDLE_STEEL = new THREE.MeshStandardMaterial({ color: "#c9ccd2", roughness: 0.22, metalness: 1 });
const LAMP = new THREE.MeshBasicMaterial({ color: new THREE.Color("#fff1d6").multiplyScalar(2.6), toneMapped: false });
const BRONZE = new THREE.MeshStandardMaterial({ color: "#5a4630", roughness: 0.35, metalness: 0.9 });
for (const m of [FRAME, GLASS, HANDLE, BRONZE, SURROUND, STONE, STONE_LIGHT, GRANITE, BRONZE_LEAF, HANDLE_STEEL, LAMP]) m.userData.shared = true;
/** A house's front door paint. */
const DOOR_PAINT = ["#1f3a5a", "#6a1f24", "#2a4a2e", "#2a2a2e", "#7a5a2a", "#3a5a6a"];

/** The lobby seen through the glass: a lit ceiling, a stone back wall, a counter, the floor. */
const LOBBY = (() => {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 128;
  const g = c.getContext("2d")!;
  const v = g.createLinearGradient(0, 0, 0, 128);
  v.addColorStop(0, "#f6efe2");
  v.addColorStop(0.12, "#d8d0c2");
  v.addColorStop(0.55, "#a89c8a");
  v.addColorStop(0.7, "#5e554b");
  v.addColorStop(1, "#2a2724");
  g.fillStyle = v;
  g.fillRect(0, 0, 128, 128);
  // downlights, a counter, a plant's shadow, the floor's line
  g.fillStyle = "rgba(255,250,235,0.9)";
  for (const x of [18, 64, 110]) g.fillRect(x - 9, 3, 18, 3);
  g.fillStyle = "rgba(38,30,24,0.75)";
  g.fillRect(36, 74, 56, 20);
  g.fillStyle = "rgba(200,170,110,0.6)";
  g.fillRect(36, 74, 56, 3);
  g.fillStyle = "rgba(30,48,30,0.55)";
  g.fillRect(8, 60, 12, 34);
  g.fillStyle = "rgba(0,0,0,0.25)";
  g.fillRect(0, 94, 128, 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
})();
const LOBBY_MAT = new THREE.MeshBasicMaterial({ map: LOBBY, toneMapped: false });
LOBBY_MAT.color.setScalar(0.95);


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
 * A door: an ordinary front door set in the facade it stands against, in the building's manner
 * (`style`): its surround, its frame, its leaves with the lobby's light behind them, handles, a light
 * over it, the place's name above, a step. Closed: you don't walk through it, E takes you in. Drawn
 * only on a wall; undrawn (the building's own entrance is the door, or no wall): only the ring.
 */
class Door {
  readonly group = new THREE.Group();
  private ring: THREE.Mesh;
  private own: THREE.BufferGeometry[] = [];
  private mats: THREE.Material[] = [];
  private t = Math.random() * 6;
  /** A revolving door's wings (turning slowly while you are near). */
  private wings: THREE.Group | null = null;
  private spin = 0;
  constructor(readonly spot: DoorSpot) {
    const g = this.group;
    g.position.set(spot.x, spot.y, spot.z);
    // its +z is the way out; the wall's face just behind z = 0
    g.rotation.y = Math.atan2(spot.fx, spot.fz);
    if (spot.drawn) {
      this.draw();
      this.merge();
    }
    // a soft ring where E takes you in: on the pavement in front, or on its step when the street is
    // right there (never on the carriageway)
    const rg = new THREE.RingGeometry(0.5, 0.62, 48);
    this.own.push(rg);
    this.ring = new THREE.Mesh(rg, RING_MAT);
    this.ring.rotation.x = -Math.PI / 2;
    const out = doorDepth(spot) + 0.5;
    this.ring.position.set(0, 0.12, Math.max(Math.min(out + 0.7, (spot.room ?? 6) - 0.35), Math.min(out, 0.6)));
    this.ring.renderOrder = 2;
    g.add(this.ring);
    g.traverse((o) => (o.userData.noField = true));
  }

  private mesh(geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number) {
    this.own.push(geo);
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z);
    mesh.castShadow = m === FRAME || m === SURROUND || m === BRONZE || m === STONE;
    mesh.receiveShadow = true;
    this.group.add(mesh);
    return mesh;
  }
  private box(w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z = 0) {
    return this.mesh(new THREE.BoxGeometry(w, h, d), m, x, y, z);
  }
  /** The place's name on a dark plate (lit letters), centred at height y. */
  private plate(w: number, y: number, z: number) {
    const sm = new THREE.MeshBasicMaterial({ map: signTexture(this.spot.label), toneMapped: false });
    sm.color.setScalar(1.2);
    this.mats.push(sm);
    const h = (w * 128) / 1024;
    this.mesh(new THREE.PlaneGeometry(w, h), sm, 0, y, z + 0.03);
    this.box(w + 0.08, h + 0.08, 0.05, FRAME, 0, y, z);
  }
  /** The lobby's light behind glass: a plane w × h from y0, just behind z. */
  private lobby(w: number, h: number, y0: number, z: number) {
    this.mesh(new THREE.PlaneGeometry(w, h), LOBBY_MAT, 0, y0 + h / 2, z);
  }
  /** A pair of glazed leaves w wide, h high: slim stiles, a kick rail, a pull bar each. */
  private leaves(w: number, h: number, frame: THREE.Material, bar: THREE.Material = HANDLE) {
    for (const side of [-1, 1]) {
      const glass = this.box(w / 2 - 0.06, h - 0.08, 0.03, GLASS, (side * w) / 4, h / 2, 0.01);
      glass.renderOrder = 2;
      this.box(0.06, h - 0.04, 0.06, frame, (side * w) / 2 - side * 0.03, h / 2, 0.01);
      this.box(0.05, h - 0.04, 0.06, frame, side * 0.025, h / 2, 0.01);
      this.box(w / 2 - 0.02, 0.18, 0.06, frame, (side * w) / 4, 0.09, 0.01);
      this.box(0.035, 1.0, 0.035, bar, side * 0.15, 1.1, 0.08);
      for (const y of [0.7, 1.5]) this.box(0.03, 0.03, 0.07, bar, side * 0.15, y, 0.045);
    }
  }
  /** A little canopy over it, lit underneath: a soft panel, or a row of downlights on a long one. */
  private canopy(w: number, d: number, y: number, m: THREE.Material) {
    this.box(w, 0.1, d, m, 0, y, d / 2);
    if (d <= 1) {
      const under = this.mesh(new THREE.PlaneGeometry(w - 0.2, d - 0.15), UNDERLIGHT, 0, y - 0.055, d / 2);
      under.rotation.x = Math.PI / 2;
      return;
    }
    // (a deep canopy: its soffit dark, downlights in a row over the doors)
    const n = Math.max(2, Math.round(w / 1.6));
    for (let k = 0; k < n; k++) {
      const x = -w / 2 + ((k + 0.5) * w) / n;
      const spot = this.mesh(new THREE.CircleGeometry(0.11, 12), UNDERLIGHT, x, y - 0.056, d * 0.55);
      spot.rotation.x = Math.PI / 2;
    }
  }
  /** A step out from the wall, w wide. */
  private step(w: number, d = 0.5, m: THREE.Material = SURROUND) {
    this.box(w, 0.1, d, m, 0, 0.05, d / 2 + 0.02);
  }

  private draw() {
    const style = this.spot.style ?? "glass";
    if (style === "classic") return this.classic();
    if (style === "revolving") return this.revolving();
    if (style === "shop") return this.shop();
    if (style === "wood") return this.wood();
    return this.glass();
  }

  /** A pair of glass doors in a frame under a fanlight, a stone surround, a lit canopy, its name above. */
  private glass() {
    const Wd = 2.3,
      Hd = 2.75,
      sw = 0.24,
      lh = Hd - 0.5;
    this.surround(Wd, Hd, sw, SURROUND);
    this.frame(Wd, Hd, FRAME);
    this.lobby(Wd, Hd, 0, -0.05);
    this.box(Wd, 0.07, 0.1, FRAME, 0, lh);
    this.box(Wd - 0.06, Hd - lh - 0.1, 0.02, GLASS, 0, (lh + Hd) / 2).renderOrder = 2;
    this.leaves(Wd, lh, FRAME);
    this.step(Wd + 2 * sw + 0.3);
    const cy = Hd + sw + 0.16;
    this.canopy(Wd + 2 * sw + 0.5, 0.9, cy, FRAME);
    this.plate(Math.min(Wd + 1.6, Math.max(Wd, this.spot.label.length * 0.2 + 0.6)), cy + 0.42, 0);
  }

  /** A stone surround (jambs and a head) proud of the wall, round an opening w × h. */
  private surround(w: number, h: number, sw: number, m: THREE.Material) {
    this.box(sw, h + sw, 0.2, m, -w / 2 - sw / 2 - 0.06, (h + sw) / 2, 0.02);
    this.box(sw, h + sw, 0.2, m, w / 2 + sw / 2 + 0.06, (h + sw) / 2, 0.02);
    this.box(w + 2 * sw + 0.12, sw, 0.2, m, 0, h + sw / 2 + 0.06, 0.02);
  }
  /** The door frame round an opening w × h. */
  private frame(w: number, h: number, m: THREE.Material) {
    this.box(0.08, h + 0.06, 0.14, m, -w / 2 - 0.02, (h + 0.06) / 2, -0.01);
    this.box(0.08, h + 0.06, 0.14, m, w / 2 + 0.02, (h + 0.06) / 2, -0.01);
    this.box(w + 0.12, 0.08, 0.14, m, 0, h + 0.02, -0.01);
  }

  /**
   * A classical monument's door: a round-headed opening in a stone architrave with its keystone,
   * a pair of panelled bronze leaves with lion-head pulls, the lit fanlight in the arch over them, a
   * lantern either side, its name cut in a stone tablet above, two steps.
   */
  private classic() {
    const Wd = 2.6,
      Hr = 2.9,
      R = Wd / 2,
      sw = 0.42;
    // the architrave: an arch of voussoirs (a ring segment, extruded) on two jambs, its keystone
    const arch = new THREE.Shape();
    arch.absarc(0, 0, R + sw, 0, Math.PI, false);
    arch.lineTo(-R, 0);
    arch.absarc(0, 0, R, Math.PI, 0, true);
    arch.lineTo(R + sw, 0);
    const ag = new THREE.ExtrudeGeometry(arch, { depth: 0.24, bevelEnabled: false, curveSegments: 20 });
    this.mesh(ag, STONE_LIGHT, 0, Hr, -0.06);
    for (const sx of [-1, 1]) this.box(sw, Hr, 0.24, STONE_LIGHT, sx * (R + sw / 2), Hr / 2, 0.06);
    this.box(0.36, 0.5, 0.3, STONE_LIGHT, 0, Hr + R + sw - 0.12, 0.08);
    // the fanlight: the lobby's light in the half-round, glazing bars like a sunburst
    const fan = this.mesh(new THREE.CircleGeometry(R, 24, 0, Math.PI), LOBBY_MAT, 0, Hr, -0.04);
    fan.scale.setScalar(0.98);
    for (let k = 1; k < 6; k++) {
      const a = (k / 6) * Math.PI;
      const bar = this.box(0.04, R, 0.03, BRONZE, Math.cos(a) * (R / 2), Hr + Math.sin(a) * (R / 2), -0.02);
      bar.rotation.z = a - Math.PI / 2;
    }
    this.box(Wd, 0.1, 0.12, BRONZE, 0, Hr, -0.01);
    // the leaves: bronze, three raised panels each, a ring pull
    for (const side of [-1, 1]) {
      const cx = (side * Wd) / 4;
      this.box(Wd / 2 - 0.03, Hr - 0.02, 0.08, BRONZE_LEAF, cx, Hr / 2, -0.02);
      for (const [y, h] of [
        [0.25, 0.7],
        [1.1, 0.9],
        [2.15, 0.6],
      ])
        this.box(Wd / 2 - 0.36, h, 0.04, BRONZE, cx, y + h / 2, 0.04);
      this.box(0.09, 0.09, 0.05, HANDLE, side * 0.2, 1.15, 0.08);
      const ring = this.mesh(new THREE.TorusGeometry(0.09, 0.015, 6, 16), HANDLE, side * 0.2, 1.03, 0.1);
      ring.rotation.x = 0.2;
    }
    this.box(0.04, Hr - 0.02, 0.1, BRONZE, 0, Hr / 2, 0.01);
    // two steps, a lantern either side on a bracket, the name on a tablet over the arch
    this.box(Wd + 2 * sw + 0.9, 0.12, 0.9, STONE_LIGHT, 0, 0.06, 0.45);
    this.box(Wd + 2 * sw + 0.5, 0.12, 0.5, STONE_LIGHT, 0, 0.18, 0.25);
    for (const sx of [-1, 1]) {
      const x = sx * (R + sw + 0.45);
      this.box(0.08, 0.08, 0.3, FRAME, x, 2.3, 0.15);
      this.box(0.22, 0.34, 0.22, FRAME, x, 2.1, 0.32);
      this.box(0.16, 0.24, 0.16, LAMP, x, 2.1, 0.32);
    }
    this.plate(Math.min(Wd + 1.4, Math.max(Wd, this.spot.label.length * 0.18 + 0.6)), Hr + R + sw + 0.45, 0);
  }

  /**
   * A tower's entrance: a revolving door (a glass drum, its four wings turning, a lit crown) between
   * two glass doors, under a long flat canopy with the tower's name along its edge.
   */
  private revolving() {
    const R = 1.15,
      H = 2.5,
      side = 1.4;
    // the drum, half out of the glass front
    const drum = this.mesh(new THREE.CylinderGeometry(R, R, H, 32, 1, true, -Math.PI / 2, Math.PI), GLASS, 0, H / 2, 0);
    drum.renderOrder = 2;
    this.mesh(new THREE.CylinderGeometry(R + 0.06, R + 0.06, 0.28, 32, 1, false, -Math.PI / 2, Math.PI), FRAME, 0, H + 0.14, 0);
    this.mesh(new THREE.CylinderGeometry(R + 0.04, R + 0.04, 0.06, 32, 1, false, -Math.PI / 2, Math.PI), FRAME, 0, 0.03, 0);
    this.lobby(2 * R + 2 * side, H, 0, -0.03);
    // the wings, on their post
    const wings = new THREE.Group();
    wings.position.set(0, 0, 0);
    for (let k = 0; k < 4; k++) {
      const a = (k * Math.PI) / 2 + Math.PI / 4;
      const pane = new THREE.Mesh(new THREE.BoxGeometry(R - 0.08, H - 0.12, 0.03), GLASS);
      this.own.push(pane.geometry);
      pane.position.set((Math.cos(a) * (R - 0.08)) / 2, H / 2, (Math.sin(a) * (R - 0.08)) / 2);
      pane.rotation.y = -a;
      pane.renderOrder = 2;
      const edge = new THREE.Mesh(new THREE.BoxGeometry(0.05, H - 0.12, 0.05), FRAME);
      this.own.push(edge.geometry);
      edge.position.set(Math.cos(a) * (R - 0.1), H / 2, Math.sin(a) * (R - 0.1));
      wings.add(pane, edge);
    }
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, H, 8), FRAME);
    this.own.push(post.geometry);
    post.position.y = H / 2;
    wings.add(post);
    this.group.add(wings);
    this.wings = wings;
    // a glass door either side, in the glazed front
    for (const sx of [-1, 1]) {
      const cx = sx * (R + 0.15 + side / 2);
      const g = this.box(side - 0.1, H - 0.1, 0.03, GLASS, cx, H / 2, 0.01);
      g.renderOrder = 2;
      this.box(0.06, H, 0.08, FRAME, cx - side / 2, H / 2, 0.01);
      this.box(0.06, H, 0.08, FRAME, cx + side / 2, H / 2, 0.01);
      this.box(0.035, 1.1, 0.035, HANDLE_STEEL, cx - sx * (side / 2 - 0.18), 1.1, 0.07);
    }
    this.box(2 * R + 2 * side + 0.5, 0.12, 0.12, FRAME, 0, H + 0.02, 0.02);
    this.step(2 * R + 2 * side + 0.6, 1.4, GRANITE);
    // the canopy: long, flat, lit beneath, the name along its front edge
    const cw = 2 * R + 2 * side + 1.6,
      cd = 1.8,
      cy = H + 0.75;
    this.canopy(cw, cd, cy, FRAME);
    this.plate(Math.min(cw - 0.6, Math.max(2.4, this.spot.label.length * 0.2 + 0.6)), cy + 0.32, cd - 0.02);
  }

  /** A shop's entrance: a wide pair of sliding glass doors, glazed to the fascia, its name lit along it. */
  private shop() {
    const Wd = 3.6,
      H = 2.8,
      fh = 0.7;
    this.lobby(Wd + 1.2, H, 0, -0.02);
    // the glazed front: the sliding pair, a fixed light either side, slim aluminium
    const alu = HANDLE_STEEL;
    for (const sx of [-1, 1]) {
      const g = this.box(Wd / 2 - 0.04, H - 0.06, 0.03, GLASS, (sx * Wd) / 4, H / 2, 0.02);
      g.renderOrder = 2;
      this.box(0.05, H, 0.07, alu, (sx * Wd) / 2, H / 2, 0.02);
      this.box(0.6, H, 0.03, GLASS, sx * (Wd / 2 + 0.33), H / 2, 0.0).renderOrder = 2;
      this.box(0.05, H, 0.07, alu, sx * (Wd / 2 + 0.63), H / 2, 0.02);
      this.box(0.03, 0.03, 0.4, alu, sx * 0.12, 1.05, 0.05);
    }
    this.box(0.04, H, 0.07, alu, 0, H / 2, 0.03);
    this.box(Wd + 1.3, 0.07, 0.08, alu, 0, H, 0.02);
    // the fascia over it, its name lit along it; the step
    this.box(Wd + 1.5, fh, 0.24, FRAME, 0, H + fh / 2, 0.08);
    this.plate(Math.min(Wd + 1.1, Math.max(2.4, this.spot.label.length * 0.2 + 0.6)), H + fh / 2, 0.21);
    const strip = this.box(Wd + 1.4, 0.04, 0.04, UNDERLIGHT, 0, H + 0.02, 0.22);
    strip.castShadow = false;
    this.step(Wd + 1.6, 0.6, GRANITE);
  }

  /** A house's front door: a panelled wooden leaf under its fanlight, a brass lever, a porch light. */
  private wood() {
    const Wd = 1.1,
      Hd = 2.3,
      sw = 0.16,
      lh = Hd - 0.42;
    this.surround(Wd, Hd, sw, SURROUND);
    this.frame(Wd, Hd, FRAME);
    const leaf = new THREE.MeshStandardMaterial({ color: DOOR_PAINT[Math.abs(Math.round(this.spot.x * 7 + this.spot.z * 3)) % DOOR_PAINT.length], roughness: 0.55, metalness: 0.05 });
    this.mats.push(leaf);
    this.box(Wd - 0.04, lh, 0.06, leaf, 0, lh / 2, -0.03);
    for (const [y, h] of [
      [0.18, 0.62],
      [0.92, 0.95],
    ])
      for (const side of [-1, 1]) this.box(Wd / 2 - 0.2, h, 0.03, leaf, (side * Wd) / 4, y + h / 2, 0.01);
    this.mesh(new THREE.PlaneGeometry(Wd - 0.12, 0.3), LOBBY_MAT, 0, lh + 0.2, -0.04);
    this.box(Wd, 0.05, 0.08, FRAME, 0, lh + 0.03, -0.01);
    this.box(0.12, 0.03, 0.05, HANDLE, Wd / 2 - 0.2, 1.02, 0.03);
    this.box(0.22, 0.05, 0.02, HANDLE, 0, 1.25, 0.01);
    this.step(Wd + 2 * sw + 0.3);
    this.canopy(Wd + 2 * sw + 0.5, 0.6, Hd + sw + 0.16, FRAME);
  }

  /**
   * Its still parts merged, one mesh per material (a door was some twenty meshes: three hundred draw
   * calls a frame for the city's doors); the revolving door's wings stay apart (they turn).
   */
  private merge() {
    const by = new Map<THREE.Material, { geos: THREE.BufferGeometry[]; cast: boolean }>();
    const out: THREE.Mesh[] = [];
    this.group.updateMatrix();
    for (const o of [...this.group.children]) {
      const m = o as THREE.Mesh;
      if (!m.isMesh || o === this.wings || Array.isArray(m.material)) continue;
      m.updateMatrix();
      let g = m.geometry.clone().applyMatrix4(m.matrix);
      if (g.index) g = g.toNonIndexed();
      for (const k of Object.keys(g.attributes)) if (k !== "position" && k !== "normal" && k !== "uv") g.deleteAttribute(k);
      if (!g.getAttribute("uv")) g.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(g.getAttribute("position").count * 2), 2));
      const e = by.get(m.material) ?? { geos: [], cast: false };
      e.geos.push(g);
      e.cast ||= m.castShadow;
      by.set(m.material, e);
      out.push(m);
    }
    if (out.length < 3) return;
    for (const m of out) m.removeFromParent();
    for (const [mat, e] of by) {
      const geo = mergeGeometries(e.geos, false);
      for (const g of e.geos) g.dispose();
      if (!geo) continue;
      this.own.push(geo);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = e.cast;
      mesh.receiveShadow = true;
      mesh.userData.noField = true;
      // (the lobby's glass after the light behind it: as before, by their order of adding)
      mesh.renderOrder = (mat as THREE.Material).transparent ? 1 : 0;
      this.group.add(mesh);
    }
  }

  /** The ring breathes and shows when you are close; a revolving door turns slowly then. */
  update(dt: number, near: boolean) {
    this.t += dt;
    const s = 1 + Math.sin(this.t * 2.4) * 0.05;
    this.ring.scale.set(s, s, 1);
    this.ring.visible = near;
    if (this.wings) {
      this.spin += ((near ? 0.6 : 0.12) - this.spin) * Math.min(1, dt * 2);
      this.wings.rotation.y += this.spin * dt;
    }
  }

  dispose() {
    this.group.removeFromParent();
    for (const geo of this.own) geo.dispose();
    for (const m of this.mats) {
      (m as THREE.MeshBasicMaterial).map?.dispose();
      m.dispose();
    }
  }
}

const RING_MAT = new THREE.MeshBasicMaterial({ color: new THREE.Color("#f4b728").multiplyScalar(1.6), toneMapped: false, transparent: true, opacity: 0.7, depthWrite: false });
RING_MAT.userData.shared = true;

/** A door's leaves and frame, for the feet: within its width and just in front of it, a wall. */
export const DOOR_HALF = 1.4;
/** Half a drawn door's width, by its kind (a revolving door with its side doors, a shopfront: wider). */
export const doorHalf = (s: DoorSpot) => (!s.drawn ? DOOR_HALF : s.style === "revolving" ? 2.6 : s.style === "shop" ? 2.45 : s.style === "classic" ? 1.75 : s.style === "wood" ? 0.75 : DOOR_HALF);

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
    LOBBY_MAT.color.setScalar(on ? 1.25 : 0.95);
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
    // (a door found again on its wall, drawn now, is made again)
    const key = (s: DoorSpot) => `${s.key}@${s.x.toFixed(1)},${s.y.toFixed(1)},${s.z.toFixed(1)}:${s.drawn ? s.style ?? "d" : "-"}${s.wall === false ? "g" : "w"}`;
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
