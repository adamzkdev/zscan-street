import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { Market } from "../../data/market";
import type { City } from "../city";
import { CITY } from "../city/plan";
import { zLogo } from "../decor";
import type { Snark } from "../snark";
import { Banter, canvasTex, clean, FONT, person, v3 } from "./common";

// per-frame scratch (no garbage in the frame loop)
const STEER = new THREE.Vector3();

/**
 * The ZEC BLIMP: a 44 m airship with an LED band on its flanks (live block height and price). It
 * loops slowly round the city; board it and it takes you on a tour of the landmarks, low over the
 * roofs, from its gondola: windows all round, rows of seats, a pilot at the controls, a live screen.
 * Nose along local +x.
 */
const HULL = { a: 22, r: 5.6 };
/** The gondola (local): floor, ceiling, length and half-width. */
const GON = { x0: -2.6, x1: 6.4, y0: -9.1, y1: -6.3, w: 1.75 };
const FLOOR = GON.y0 + 0.12;

/** The tour, round the city: landmark keys and how they are called. */
const TOUR: [string, string][] = [
  ["stadium", "Block Stadium"],
  ["museum", "the zkSNARK Museum"],
  ["pyramid", "the Great Pyramid"],
  ["eiffel", "the Tour Eiffel"],
  ["shibuya", "the Shibuya crossing"],
  ["colosseum", "the Colosseum"],
  ["cemetery", "the ZK Cemetery"],
  ["needle", "the ZEC Needle"],
  ["mall", "the ZK Mall"],
  ["reserve", "the ZEC Reserve"],
  ["parliament", "Big Ben"],
  ["marina", "Marina Bay"],
  ["bridge", "the Golden Gate"],
  ["statue", "the zkSNARK of Liberty"],
  ["opera", "the Opera House"],
  ["burjalarab", "the Burj Al Zec"],
  ["palm", "the Palm"],
  ["port", "the Proof Factory"],
];

const CHAT: [number, string][][] = [
  [[0, "Happy 10 years, Zcash!"], [1, "2016–2026. Here's to the next ten!"]],
  [[1, "Did you see our birthday banner?"], [0, "A whole city celebrating Zcash!"]],
  [[0, "Sprout, Sapling, Orchard..."], [1, "Ten years of growing privacy."]],
  [
    [0, "The stadium looks tiny from up here."],
    [1, "Shielded are winning again, I bet."],
  ],
  [
    [1, "Can anyone see my house?"],
    [0, "Only if you left a transparent address on it."],
  ],
  [
    [0, "Is this thing safe?"],
    [1, "It's filled with helium, not hype."],
  ],
  [
    [1, "Look at all the block buses!"],
    [0, "Every one of them full of shielded txs."],
  ],
  [
    [0, "Best seat in the city."],
    [1, "And nobody knows we're up here. Private flight."],
  ],
];

type Stop = { name: string; p: THREE.Vector3; at: THREE.Vector3; said: boolean };

export class Blimp {
  readonly group = new THREE.Group();
  private band: { ctx: CanvasRenderingContext2D; tex: THREE.CanvasTexture };
  private screen: { g: CanvasRenderingContext2D; tex: THREE.CanvasTexture; t: number };
  private props: THREE.Object3D[] = [];
  private heading = 0;
  private speed = 9;
  private turn = 0;
  private stops: Stop[] = [];
  /** The tour in progress: the stops left. */
  tour: Stop[] | null = null;
  private pilot: Snark | null = null;
  private crew: Banter;
  private people: (Snark | null)[] = [];
  private redraw = 0;
  private nightMats: THREE.Material[] = [];
  private night: boolean | null = null;
  private interior = new THREE.Group();
  height: number | null = null;
  /** Set when a tour ends by itself (main hands the view back). */
  done = false;

  constructor(parent: THREE.Object3D, city: City) {
    parent.add(this.group);
    const std = (color: string, o: Partial<THREE.MeshStandardMaterialParameters> = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.1, ...o });
    const white = std("#f4f2f6", { roughness: 0.45 });
    const gold = std("#f4b728", { roughness: 0.3, metalness: 0.7 });
    const dark = std("#1c1a22", { roughness: 0.5 });
    const carbon = std("#2c2a34", { roughness: 0.35, metalness: 0.3 });
    const leather = std("#5a2e22", { roughness: 0.6 });
    const seatGold = std("#c8962a", { roughness: 0.5 });
    const floorMat = std("#6b4f3a", { roughness: 0.75 });
    const glass = new THREE.MeshStandardMaterial({ color: "#cfe8ff", roughness: 0.03, metalness: 0.3, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide });
    const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.0, 1.75, 1.3), toneMapped: false });
    const glowGold = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.5, 0.35), toneMapped: false });
    const nav = (c: THREE.Color) => {
      const m = new THREE.MeshBasicMaterial({ color: c, toneMapped: false });
      this.nightMats.push(m);
      return m;
    };

    // ---- the envelope ----
    const hull = new THREE.Mesh(new THREE.SphereGeometry(1, 56, 28).scale(HULL.a, HULL.r, HULL.r), white);
    hull.castShadow = true;
    const ringAt = (x: number, w: number) => {
      const k = HULL.r * Math.sqrt(1 - (x / HULL.a) ** 2);
      return new THREE.TorusGeometry(k + 0.02, w, 6, 56).rotateY(Math.PI / 2).translate(x, 0, 0);
    };
    const trims = new THREE.Mesh(mergeGeometries([ringAt(15.5, 0.16), ringAt(14.6, 0.08), ringAt(-13, 0.16), ringAt(-12.1, 0.08)].map(clean), false), gold);
    const nose = new THREE.Mesh(new THREE.SphereGeometry(1.2, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2).rotateZ(-Math.PI / 2).scale(0.6, 1, 1).translate(HULL.a - 0.55, 0, 0), gold);
    // tail fins: four, in a cross, gold leading edges
    const finShape = new THREE.Shape();
    finShape.moveTo(0, 0);
    finShape.lineTo(8, 0);
    finShape.lineTo(7.4, 4.6);
    finShape.lineTo(4.2, 4.6);
    finShape.closePath();
    const finGeo = new THREE.ExtrudeGeometry(finShape, { depth: 0.28, bevelEnabled: false }).translate(-HULL.a + 1.2, 2.4, -0.14);
    const edgeGeo = new THREE.BoxGeometry(0.4, 4.7, 0.34).translate(0, 2.35, 0);
    const fins: THREE.BufferGeometry[] = [],
      edges: THREE.BufferGeometry[] = [];
    for (let k = 0; k < 4; k++) {
      const rot = new THREE.Matrix4().makeRotationX((k * Math.PI) / 2 + Math.PI / 4);
      fins.push(finGeo.clone().applyMatrix4(rot));
      edges.push(
        edgeGeo
          .clone()
          .applyMatrix4(new THREE.Matrix4().makeRotationZ(-0.62))
          .translate(-HULL.a + 1.2 + 8 - 0.3, 2.4, 0)
          .applyMatrix4(rot),
      );
    }
    const finMesh = new THREE.Mesh(mergeGeometries(fins.map(clean), false), dark);
    const edgeMesh = new THREE.Mesh(mergeGeometries(edges.map(clean), false), gold);
    // the Zcash mark on the two vertical-ish fins
    const mark = new THREE.MeshBasicMaterial({
      map: canvasTex(128, 128, (g, w, h) => {
        g.clearRect(0, 0, w, h);
        zLogo(g, w / 2, h / 2, w * 0.86, "#f4b728");
      }),
      transparent: true,
      toneMapped: false,
    });
    for (const side of [1, -1]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), mark);
      m.position.set(-HULL.a + 6.0, 4.6, 0.2 * side).applyAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 4);
      m.rotation.set(Math.PI / 4, side > 0 ? 0 : Math.PI, 0);
      this.group.add(m);
    }
    // the LED band on both flanks: a strip of the envelope itself
    const c = document.createElement("canvas");
    c.width = 1536;
    c.height = 384;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    this.band = { ctx: c.getContext("2d")!, tex };
    const bandMat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, color: new THREE.Color(1.5, 1.5, 1.5) });
    for (const phi of [Math.PI / 2, (3 * Math.PI) / 2]) {
      const g = new THREE.SphereGeometry(1.006, 48, 12, phi - 0.6, 1.2, Math.PI / 2 - 0.4, 0.8).scale(HULL.a, HULL.r, HULL.r);
      const banner = new THREE.Mesh(g, bandMat);
      banner.name = "Zcash 10 years · envelope banner";
      this.group.add(banner);
    }

    // ---- the gondola: shell, windows all round (a rounded nose), fairing up to the envelope ----
    const G = GON;
    const sh: THREE.BufferGeometry[] = [],
      gl: THREE.BufferGeometry[] = [],
      mull: THREE.BufferGeometry[] = [];
    const box = (arr: THREE.BufferGeometry[], x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) => arr.push(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0).translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2));
    const winY0 = G.y0 + 0.5,
      winY1 = G.y1 - 0.35;
    // floor, lower walls, roof
    box(sh, G.x0, G.y0 - 0.2, -G.w, G.x1, G.y0 + 0.02, G.w);
    for (const s of [-1, 1]) {
      box(sh, G.x0, G.y0 - 0.2, s * G.w - 0.05, G.x1, winY0, s * G.w + 0.05);
      box(sh, G.x0, winY1, s * G.w - 0.05, G.x1, G.y1 + 0.05, s * G.w + 0.05);
      gl.push(new THREE.PlaneGeometry(G.x1 - G.x0, winY1 - winY0).translate((G.x0 + G.x1) / 2, (winY0 + winY1) / 2, s * G.w));
      for (let x = G.x0 + 0.05; x <= G.x1; x += 1.5) box(mull, x - 0.03, winY0, s * G.w - 0.05, x + 0.03, winY1, s * G.w + 0.05);
    }
    box(sh, G.x0 - 0.05, G.y0 - 0.2, -G.w, G.x0 + 0.05, G.y1 + 0.05, G.w);
    box(sh, G.x0, G.y1, -G.w, G.x1, G.y1 + 0.12, G.w);
    // rounded nose: a half drum of glass on a lower skirt, with its mullions
    const noseY = (y0: number, y1: number) => new THREE.CylinderGeometry(G.w, G.w, y1 - y0, 24, 1, true, 0, Math.PI).translate(G.x1, (y0 + y1) / 2, 0);
    sh.push(noseY(G.y0 - 0.2, winY0), noseY(winY1, G.y1 + 0.05));
    gl.push(noseY(winY0, winY1));
    sh.push(new THREE.CircleGeometry(G.w, 24, 0, Math.PI).rotateX(-Math.PI / 2).translate(G.x1, G.y0 - 0.2, 0));
    sh.push(new THREE.CircleGeometry(G.w, 24, 0, Math.PI).rotateX(-Math.PI / 2).translate(G.x1, G.y1 + 0.12, 0));
    for (let k = 1; k < 6; k++) {
      const a = (k / 6) * Math.PI;
      box(mull, G.x1 + Math.sin(a) * G.w - 0.03, winY0, Math.cos(a) * G.w - 0.03, G.x1 + Math.sin(a) * G.w + 0.03, winY1, Math.cos(a) * G.w + 0.03);
    }
    // the fairing between the gondola and the envelope
    sh.push(new THREE.CylinderGeometry(1, 1, 1, 24).scale((G.x1 - G.x0) / 2 + 1.2, 1.0, G.w + 0.1).translate((G.x0 + G.x1) / 2 + 0.6, G.y1 + 0.55, 0));
    const shell = new THREE.Mesh(mergeGeometries(sh.map(clean), false), white);
    shell.castShadow = true;
    const panes = new THREE.Mesh(mergeGeometries(gl.map(clean), false), glass);
    panes.renderOrder = 3;
    const bars = new THREE.Mesh(mergeGeometries(mull.map(clean), false), carbon);
    // a gold stripe under the windows, the window band lit at night
    const stripe = new THREE.Mesh(
      mergeGeometries(
        [
          new THREE.BoxGeometry(G.x1 - G.x0, 0.14, 0.02).translate((G.x0 + G.x1) / 2, winY0 - 0.12, G.w + 0.06),
          new THREE.BoxGeometry(G.x1 - G.x0, 0.14, 0.02).translate((G.x0 + G.x1) / 2, winY0 - 0.12, -G.w - 0.06),
        ].map(clean),
        false,
      ),
      gold,
    );
    this.group.add(hull, trims, nose, finMesh, edgeMesh, shell, panes, bars, stripe);

    // engines on outriggers, propellers turning
    for (const s of [-1, 1]) {
      const nac = new THREE.Mesh(new THREE.CapsuleGeometry(0.5, 1.8, 4, 12).rotateZ(Math.PI / 2), white);
      nac.position.set(0.6, G.y0 + 1.2, s * (G.w + 1.9));
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 1.8), carbon);
      arm.position.set(0.6, G.y0 + 1.2, s * (G.w + 0.9));
      const prop = new THREE.Group();
      for (let k = 0; k < 3; k++) {
        const blade = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.6, 0.22), dark);
        blade.position.y = 0.8;
        const hold = new THREE.Group();
        hold.rotation.x = (k / 3) * Math.PI * 2;
        hold.add(blade);
        prop.add(hold);
      }
      prop.position.set(-0.85, G.y0 + 1.2, s * (G.w + 1.9));
      this.props.push(prop);
      this.group.add(nac, arm, prop);
    }
    // navigation lights (night): red port, green starboard, white tail
    const navs: [THREE.Vector3, THREE.Color][] = [
      [v3(0, -0.5, -HULL.r - 0.05), new THREE.Color(3, 0.2, 0.2)],
      [v3(0, -0.5, HULL.r + 0.05), new THREE.Color(0.2, 3, 0.5)],
      [v3(-HULL.a - 0.1, 0, 0), new THREE.Color(3, 3, 3)],
      [v3(0, HULL.r + 0.05, 0), new THREE.Color(3, 0.4, 0.3)],
    ];
    for (const [p, col] of navs) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), nav(col));
      m.position.copy(p);
      this.group.add(m);
    }

    // ---- inside: wood floor, rows of seats, the pilot's console, a live screen, lights ----
    const I = this.interior;
    const fl = new THREE.Mesh(new THREE.BoxGeometry(G.x1 - G.x0 + 1.4, 0.04, G.w * 2 - 0.12).translate((G.x0 + G.x1) / 2 + 0.6, FLOOR - 0.02, 0), floorMat);
    I.add(fl);
    const seatParts: THREE.BufferGeometry[] = [],
      seatGoldParts: THREE.BufferGeometry[] = [];
    const seat = (x: number, z: number) => {
      box(seatParts, x - 0.28, FLOOR, z - 0.3, x + 0.28, FLOOR + 0.46, z + 0.3);
      box(seatParts, x - 0.36, FLOOR + 0.46, z - 0.26, x - 0.28, FLOOR + 0.92, z + 0.26);
      box(seatGoldParts, x - 0.38, FLOOR + 0.9, z - 0.27, x - 0.27, FLOOR + 0.96, z + 0.27);
      box(seatGoldParts, x - 0.2, FLOOR + 0.46, z - 0.33, x + 0.28, FLOOR + 0.52, z - 0.29);
      box(seatGoldParts, x - 0.2, FLOOR + 0.46, z + 0.29, x + 0.28, FLOOR + 0.52, z + 0.33);
    };
    for (const x of [-1.6, 0.0, 1.6, 3.2]) for (const z of [-1.0, 1.0]) seat(x, z);
    seat(5.0, -0.75);
    seat(5.0, 0.75);
    I.add(new THREE.Mesh(mergeGeometries(seatParts.map(clean), false), leather), new THREE.Mesh(mergeGeometries(seatGoldParts.map(clean), false), seatGold));
    // console under the windscreen, instruments glowing
    const con = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.85, G.w * 2 - 0.4).translate(G.x1 + 0.35, FLOOR + 0.42, 0), carbon);
    const dials = new THREE.Mesh(
      new THREE.PlaneGeometry(G.w * 2 - 0.6, 0.42),
      new THREE.MeshBasicMaterial({
        toneMapped: false,
        map: canvasTex(512, 96, (g, w, h) => {
          g.fillStyle = "#0b0a10";
          g.fillRect(0, 0, w, h);
          for (let k = 0; k < 7; k++) {
            const cx = 36 + k * 72;
            g.strokeStyle = k === 3 ? "#f4b728" : "#5cff9a";
            g.lineWidth = 4;
            g.beginPath();
            g.arc(cx, h / 2, 26, 0, Math.PI * 2);
            g.stroke();
            g.beginPath();
            g.moveTo(cx, h / 2);
            g.lineTo(cx + Math.cos(k * 1.3) * 22, h / 2 + Math.sin(k * 1.3) * 22);
            g.stroke();
          }
        }),
      }),
    );
    dials.position.set(G.x1 - 0.02, FLOOR + 0.78, 0);
    dials.rotation.set(0, -Math.PI / 2, 0);
    dials.rotateX(-0.6);
    // the control column
    const yoke = new THREE.Mesh(mergeGeometries([new THREE.CylinderGeometry(0.04, 0.04, 0.6, 6).translate(0, 0.3, 0), new THREE.BoxGeometry(0.06, 0.08, 0.5).translate(0, 0.62, 0)].map(clean), false), dark);
    yoke.position.set(5.55, FLOOR + 0.3, 0.75 * -1);
    I.add(con, dials, yoke);
    // ceiling: a lit strip and the live screen hanging over the aisle
    const strip = new THREE.Mesh(new THREE.BoxGeometry(G.x1 - G.x0 - 0.4, 0.04, 0.3).translate((G.x0 + G.x1) / 2, G.y1 - 0.02, 0), glow);
    I.add(strip);
    const sc = document.createElement("canvas");
    sc.width = 640;
    sc.height = 320;
    const stex = new THREE.CanvasTexture(sc);
    stex.colorSpace = THREE.SRGBColorSpace;
    this.screen = { g: sc.getContext("2d")!, tex: stex, t: 0 };
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.6), new THREE.MeshBasicMaterial({ map: stex, toneMapped: false }));
    scr.position.set(4.25, G.y1 - 0.62, 0);
    scr.rotation.y = -Math.PI / 2;
    const scrBack = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.68, 1.28), dark);
    scrBack.position.set(4.29, G.y1 - 0.62, 0);
    const scrArm = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.3, 0.05), dark);
    scrArm.position.set(4.29, G.y1 - 0.15, 0);
    I.add(scrBack, scr, scrArm);
    // a gold Z on the rear bulkhead
    const z = new THREE.Mesh(
      new THREE.PlaneGeometry(0.8, 0.8),
      new THREE.MeshBasicMaterial({
        transparent: true,
        toneMapped: false,
        map: canvasTex(128, 128, (g, w, h) => {
          g.clearRect(0, 0, w, h);
          zLogo(g, w / 2, h / 2, w * 0.86, "#f4b728");
        }),
      }),
    );
    z.position.set(G.x0 + 0.07, G.y1 - 0.9, 0);
    z.rotation.y = Math.PI / 2;
    I.add(z);
    this.group.add(I);
    for (const m of [glow]) this.nightMats.push(m);
    void glowGold;

    // the pilot, and two passengers in the front rows
    void person(I, 1 + Math.floor(Math.random() * 10000), v3(5.0, FLOOR + 0.36, -0.75), { sit: true, cap: true, scale: 0.78, role: "Pilot" }).then((s) => (this.pilot = s));
    const p0 = person(I, 1 + Math.floor(Math.random() * 10000), v3(3.2, FLOOR + 0.36, -1.0), { sit: true, scale: 0.78 });
    const p1 = person(I, 1 + Math.floor(Math.random() * 10000), v3(-1.6, FLOOR + 0.36, 1.0), { sit: true, scale: 0.78 });
    this.crew = new Banter([null, null], CHAT, 0.78, 0.3);
    void p0.then((s) => (this.crew.people[0] = s));
    void p1.then((s) => (this.crew.people[1] = s));
    this.people = this.crew.people;

    // the stops: over the low landmarks, beside the tall ones
    for (const [k, name] of TOUR) {
      const l = city.landmarks.get(k);
      if (!l) continue;
      const b = l.occluder.box;
      const at = b.getCenter(new THREE.Vector3());
      const top = b.max.y;
      const p = at.clone().setY(Math.max(62, Math.min(105, top + 30)));
      if (top > 75) {
        const out = at.clone().setY(0).normalize();
        p.addScaledVector(out, 46).setY(top > 120 ? 98 : 80);
      }
      this.stops.push({ name, p, at: at.setY(top * 0.6), said: false });
    }
    this.group.position.set(0, 95, -30 + (CITY.maxZ - CITY.minZ) * 0.3);
    this.heading = Math.PI;
    Market.subscribe(() => (this.redraw = 0));
  }

  private loopTarget(out: THREE.Vector3) {
    const rx = (CITY.maxX - CITY.minX) * 0.36,
      rz = (CITY.maxZ - CITY.minZ) * 0.3;
    const p = this.group.position;
    const a = Math.atan2((p.z + 30) / rz, p.x / rx) + 0.4;
    return out.set(Math.cos(a) * rx, 95, Math.sin(a) * rz - 30);
  }

  /** Is the ray on the blimp (its envelope or gondola)? Distance or null. */
  hit(ray: THREE.Raycaster) {
    this.group.updateMatrixWorld(true);
    const inv = this.group.matrixWorld.clone().invert();
    const r = ray.ray.clone().applyMatrix4(inv);
    // the envelope as a unit sphere
    const s = new THREE.Vector3(1 / HULL.a, 1 / HULL.r, 1 / HULL.r);
    const o = r.origin.clone().multiply(s),
      d = r.direction.clone().multiply(s);
    const A = d.dot(d),
      B = 2 * o.dot(d),
      C = o.dot(o) - 1.15;
    const disc = B * B - 4 * A * C;
    let hit = disc >= 0 && (-B - Math.sqrt(disc)) / (2 * A) > 0;
    if (!hit) hit = !!r.intersectBox(new THREE.Box3(v3(GON.x0, GON.y0, -GON.w), v3(GON.x1 + GON.w, GON.y1, GON.w)), new THREE.Vector3());
    return hit ? this.group.position.distanceTo(ray.ray.origin) : null;
  }

  /** Board: the tour starts from the nearest landmark ahead, ten stops round the city. */
  board() {
    this.done = false;
    if (!this.stops.length) return;
    const p = this.group.position;
    let best = 0,
      bd = Infinity;
    this.stops.forEach((s, i) => {
      const d = Math.hypot(s.p.x - p.x, s.p.z - p.z);
      if (d < bd) (bd = d), (best = i);
    });
    this.tour = [];
    for (let k = 0; k < Math.min(10, this.stops.length); k++) {
      const s = this.stops[(best + k) % this.stops.length];
      s.said = false;
      this.tour.push(s);
    }
    this.crew.hush(9);
    setTimeout(() => this.pilotSay("Welcome aboard! Happy 10 years, Zcash!", 4.5), 900);
  }

  stop() {
    this.tour = null;
  }

  private pilotSay(words: string, seconds = 4) {
    const s = this.pilot;
    if (!s) return;
    const b = new Banter([s], [], 0.78, 0.3);
    b.say(0, words, seconds);
    this.crew.hush(seconds + 1.5);
  }

  block(h: number) {
    if (this.tour) this.crew.say(1, `Block ${h.toLocaleString("en-US")} just landed!`, 3.2), this.crew.hush(4);
  }

  /** The rider's eye (world): second row, by the right-hand windows. */
  eye(out: THREE.Vector3) {
    return this.group.localToWorld(out.set(1.7, FLOOR + 1.2, 1.0));
  }

  /** Which way the nose points (yaw for a camera: 0 looks to -z). */
  get yaw() {
    return Math.atan2(-Math.cos(this.heading), -Math.sin(this.heading));
  }

  update(dt: number, t: number, camQuat: THREE.Quaternion, camRight: THREE.Vector3, night: boolean, riding: boolean) {
    if (night !== this.night) {
      this.night = night;
      for (const m of this.nightMats) (m as THREE.MeshBasicMaterial).visible = night;
    }
    // steer toward the next stop (or round the city's loop), turning gently, rolling into turns
    const p = this.group.position;
    const target = STEER.set(0, 0, 0);
    const stop = this.tour?.[0];
    if (stop) target.copy(stop.p);
    else this.loopTarget(target);
    const want = Math.atan2(target.z - p.z, target.x - p.x);
    let dh = want - this.heading;
    dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    const rate = THREE.MathUtils.clamp(dh * 0.6, -0.26, 0.26);
    this.turn += (rate - this.turn) * Math.min(1, dt * 1.5);
    this.heading += this.turn * dt;
    const v = stop ? 15 : 9;
    this.speed += (v - this.speed) * Math.min(1, dt * 0.5);
    p.x += Math.cos(this.heading) * this.speed * dt;
    p.z += Math.sin(this.heading) * this.speed * dt;
    const climb = (target.y - p.y) * Math.min(1, dt * 0.35);
    p.y += climb + Math.sin(t * 0.3) * 0.02;
    this.group.rotation.set(-this.turn * 0.25, -this.heading, THREE.MathUtils.clamp(climb / Math.max(dt, 1e-3) * 0.01, -0.06, 0.06), "YXZ");
    for (const pr of this.props) pr.rotation.x += dt * 26;
    if (stop) {
      const d = Math.hypot(stop.p.x - p.x, stop.p.z - p.z);
      if (!stop.said && d < 150) {
        stop.said = true;
        const right = new THREE.Vector3(-Math.sin(this.heading), 0, Math.cos(this.heading));
        const side = stop.at.clone().sub(p).setY(0).dot(right);
        const where = Math.abs(side) < 25 ? "Right below us" : side > 0 ? "On your right" : "On your left";
        this.pilotSay(`${where}: ${stop.name}!`, 4.2);
      }
      if (d < 26) {
        this.tour!.shift();
        if (!this.tour!.length) {
          this.tour = null;
          if (riding) {
            this.pilotSay("That's the tour! Thanks for flying ZEC.", 3.5);
            setTimeout(() => (this.done = true), 3500);
          }
        }
      }
    }
    this.interior.visible = riding;
    if (riding) {
      this.crew.update(dt);
      for (const s of [this.pilot, ...this.people]) s?.update(dt, t, camQuat, camRight);
      if ((this.screen.t -= dt) <= 0) {
        this.screen.t = 0.5;
        this.drawScreen();
      }
    }
    this.redraw -= dt;
    if (this.redraw <= 0) {
      this.redraw = 1 / 20;
      this.drawBand(t);
    }
  }

  private drawBand(t: number) {
    const { ctx, tex } = this.band;
    const w = ctx.canvas.width,
      h = ctx.canvas.height;
    ctx.fillStyle = "#05060a";
    ctx.fillRect(0, 0, w, h);
    const p = Market.state.price;
    const text = `ⓩ ZSTREET   BLOCK #${this.height?.toLocaleString("en-US") ?? "—"}   ZEC ${p ? "$" + p.usd.toLocaleString("en-US", { maximumFractionDigits: 2 }) : "—"} ${p ? (p.usd_24h_change >= 0 ? "▲" : "▼") + Math.abs(p.usd_24h_change).toFixed(1) + "%" : ""}   PRIVACY IS NORMAL   `;
    ctx.strokeStyle = "#eab64a";
    ctx.lineWidth = 7;
    ctx.strokeRect(14, 14, w - 28, h - 28);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#ffe3a0";
    ctx.font = `900 118px ${FONT}`;
    ctx.fillText("10 YEARS OF ZCASH", w / 2, 157);
    ctx.fillStyle = "#95efd1";
    ctx.font = `700 46px ${FONT}`;
    ctx.fillText("2016 — 2026  ·  HAPPY BIRTHDAY, ZCASH!", w / 2, 233);
    ctx.textAlign = "left";
    ctx.font = `700 43px ${FONT}`;
    ctx.textBaseline = "middle";
    const tw = ctx.measureText(text).width;
    ctx.fillStyle = "#f4b728";
    for (let x = -((t * 100) % tw); x < w; x += tw) ctx.fillText(text, x, 318);
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    for (let y = 0; y < h; y += 4) ctx.fillRect(0, y, w, 2);
    tex.needsUpdate = true;
  }

  private drawScreen() {
    const { g, tex } = this.screen;
    const w = 640,
      h = 320;
    g.fillStyle = "#0b0a10";
    g.fillRect(0, 0, w, h);
    g.fillStyle = "#f4b728";
    g.fillRect(0, 0, w, 52);
    g.fillStyle = "#0b0a10";
    g.font = `800 32px ${FONT}`;
    g.textBaseline = "middle";
    g.fillText("ⓩ ZCASH · 10 YEARS", 18, 27);
    const p = this.group.position;
    const stop = this.tour?.[0];
    g.fillStyle = "#8a86a0";
    g.font = `600 22px ${FONT}`;
    g.fillText(stop ? "NEXT" : "CRUISING", 20, 84);
    g.fillStyle = "#ffffff";
    g.font = `800 36px ${FONT}`;
    g.fillText(stop ? stop.name.replace(/^the /, "").toUpperCase() : "OVER ZSTREET", 20, 120);
    if (stop) {
      g.fillStyle = "#8a86a0";
      g.font = `600 24px ${FONT}`;
      g.fillText(`${Math.round(Math.hypot(stop.p.x - p.x, stop.p.z - p.z))} m`, 20, 156);
    }
    g.fillStyle = "#f4b728";
    g.font = `700 32px ${FONT}`;
    g.fillText(`BLOCK #${this.height?.toLocaleString("en-US") ?? "—"}`, 20, 210);
    const pr = Market.state.price;
    g.fillStyle = pr && pr.usd_24h_change < 0 ? "#ff5a6a" : "#5cff9a";
    g.fillText(pr ? `ZEC $${pr.usd.toFixed(2)} ${pr.usd_24h_change >= 0 ? "▲" : "▼"}${Math.abs(pr.usd_24h_change).toFixed(1)}%` : "ZEC —", 20, 256);
    g.textAlign = "right";
    g.fillStyle = "#ffffff";
    g.font = `700 30px ${FONT}`;
    g.fillText(`ALT ${Math.round(p.y)} m`, w - 20, 210);
    g.fillText(`${Math.round(this.speed * 1.944)} kn`, w - 20, 256);
    g.textAlign = "left";
    // the stops left, as dots
    const n = this.tour?.length ?? 0;
    for (let k = 0; k < 10; k++) {
      g.fillStyle = k < 10 - n ? "#f4b728" : "#2a2834";
      g.fillRect(20 + k * 28, 290, 20, 12);
    }
    tex.needsUpdate = true;
  }
}
