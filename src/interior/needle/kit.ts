import * as THREE from "three";
import { Market } from "../../data/market";
import { ZScan } from "../../data/zscan";
import { Snark, loadArt } from "../../scene/snark";
import type { VoxelModel } from "../../scene/voxel/model";
import { place } from "../furniture";
import { box, glowMat, std, textPlane } from "../kit";
import type { InteriorContext, PickInfo, Rect } from "../types";

/**
 * The ZEC NEEDLE's kit: its levels at their real heights (the windows show the city from there),
 * one group per level, colliders, people, ticks, and the pieces every level shares — round glass
 * shells, the lift core with its cabin (a real ride: doors shut, the counter runs, doors open),
 * live screens, people with phones.
 */

export const LEVELS = [
  { label: "G", name: "Grand lobby · Zcash history wall", y: 0, h: 9, m: "0 m" },
  { label: "11", name: "ZEC Residences · Suite 1101", y: 40, h: 4.2, m: "40 m" },
  { label: "22", name: "At the Top · observation deck", y: 82, h: 4.8, m: "82 m" },
  { label: "33", name: "Sky Lounge · restaurant & bar", y: 120, h: 4.6, m: "120 m" },
  { label: "41", name: "At the Top SKY · 150 m", y: 150, h: 4.4, m: "150 m" },
];
export const LIGHTS_PER_FLOOR = 5;
/** Metres from the street door to the tower's axis (where the panoramas are taken). */
export const BACK = 13;

/** Where the needle stands in the city (centre of its lot), for bearings to the other places. */
export const SITE = { x: 141.5, z: -137.5 };

const LINES: Record<string, string[]> = {
  Visitor: ["You can see the whole of ZStreet from here.", "Look, the bus is leaving the MEMPOOL!", "One more photo. The light is perfect.", "The Colosseum looks tiny from up here."],
  Photographer: ["Hold still… perfect.", "Golden hour over the city.", "Panorama mode. Turn slowly."],
  Guide: ["Telescopes all round: each one is aimed at a landmark.", "The terrace door is open, mind the wind.", "The Sky Lounge is on 33, At the Top SKY on 41."],
  Security: ["Bags on the belt, please.", "Phones and keys in the tray.", "Enjoy At the Top."],
  Host: ["Welcome to the ZEC NEEDLE.", "The lifts climb at 10 metres a second.", "Your ticket is shielded: nobody knows you came."],
  Butler: ["Your suite is ready.", "Champagne is on ice.", "The bath is drawn, with a view."],
  Resident: ["Forty metres up, the street noise is gone.", "I watch the blocks land from the sofa."],
  Waiter: ["Your table by the glass is ready.", "Tonight: Orchard lobster, Sapling greens.", "Dessert is a gold-leaf ⓩ."],
  Bartender: ["A Shielded Sour? Our signature.", "The Halo 2 martini: no trusted setup.", "Ice from the top of the needle."],
  Diner: ["The view is better than the food. And the food is great.", "Every block, the city lights flicker."],
  Pianist: ["This one is called “Canopy”.", "Requests? I only play in zero knowledge."],
  Guest: ["Best view in the city.", "One hundred and fifty metres. My ears popped."],
};
export const linesFor = (role: string) => LINES[role] ?? LINES.Guest;

export type Tick = (dt: number, t: number) => void;
export type PickFn = (hit?: THREE.Intersection) => PickInfo | null;

export function makeCanvas(w: number, h: number, draw?: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  draw?.(g);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return { c, g, t };
}

export const fmt = (n: number, d = 0) => n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
export const MONO = '"JetBrains Mono", Menlo, monospace';
export const GOLD = "#f4b728";

export class NeedleKit {
  readonly groups = LEVELS.map(() => new THREE.Group());
  readonly rects: Rect[][] = LEVELS.map(() => []);
  readonly people: Snark[][] = LEVELS.map(() => []);
  readonly ticks: Tick[][] = LEVELS.map(() => []);
  readonly pickables: THREE.Object3D[] = [];
  readonly picks = new Map<THREE.Object3D, PickFn>();
  readonly hovers = new Map<THREE.Object3D, string>();
  readonly floorOf = new Map<THREE.Object3D, number>();
  private lightCount = LEVELS.map(() => 0);
  current = 0;
  private lastHeight = 0;
  /** The camera zoom asked by a telescope: seconds left. */
  zoom = 0;
  /** Lift cabins, one per upper level: the ride plays in the cabin of the level you arrive at. */
  readonly cabins: (Cabin | null)[] = LEVELS.map(() => null);

  readonly glass = new THREE.MeshStandardMaterial({ color: "#a8c8e0", transparent: true, opacity: 0.1, roughness: 0.04, metalness: 0.4, depthWrite: false, side: THREE.DoubleSide });
  readonly mullion = std("#2a2832", 0.35, 0.7);
  readonly gold = std("#c9a227", 0.28, 0.85);
  readonly bronze = std("#8a6a3a", 0.32, 0.8);
  readonly dark = std("#16141c", 0.5, 0.3);
  readonly chrome = std("#c8ccd4", 0.18, 0.9);
  readonly stone = std("#d8d0c2", 0.35, 0.05);

  constructor(
    readonly ctx: InteriorContext,
    readonly scene: THREE.Scene,
  ) {
    for (const g of this.groups) scene.add(g);
    ctx.onBlock((h) => (this.lastHeight = h));
    Market.subscribe(() => {});
  }

  get height() {
    return Math.max(this.lastHeight, this.ctx.director.blockHeight ?? 0);
  }
  get mempool() {
    return this.ctx.director.mempoolList().length;
  }
  get price() {
    return Market.state.price;
  }
  get market() {
    return Market.state;
  }
  /** Seconds since the last block, or null. */
  get sinceBlock() {
    const t = this.ctx.director.lastBlockTime;
    return t ? Math.max(0, Math.round((Date.now() - t) / 1000)) : null;
  }

  y(f: number) {
    return LEVELS[f].y;
  }

  pick(f: number, o: THREE.Object3D, hover: string, info: PickFn) {
    this.pickables.push(o);
    this.floorOf.set(o, f);
    this.hovers.set(o, hover);
    this.picks.set(o, info);
  }

  /** An invisible box that catches clicks (for things made of many pieces). */
  hit(f: number, w: number, h: number, d: number, x: number, y: number, z: number, hover: string, info: PickFn, rot = 0) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({ visible: false }));
    m.position.set(x, LEVELS[f].y + y + h / 2, z);
    m.rotation.y = rot;
    this.groups[f].add(m);
    this.pick(f, m, hover, info);
    return m;
  }

  light(f: number, x: number, z: number, color = "#ffe6c8", intensity = 8, dy = -0.4, range = 22) {
    if (this.lightCount[f] >= LIGHTS_PER_FLOOR) return;
    this.lightCount[f]++;
    const l = new THREE.PointLight(color, intensity, range, 1.5);
    l.position.set(x, LEVELS[f].y + LEVELS[f].h + dy, z);
    this.groups[f].add(l);
  }

  /** Every level ends up with the same number of lights: changing level never recompiles a shader. */
  padLights() {
    LEVELS.forEach((_, f) => {
      while (this.lightCount[f] < LIGHTS_PER_FLOOR) this.light(f, 0, 0, "#000000", 0);
    });
  }

  put(f: number, key: string, build: () => VoxelModel, x: number, z: number, rot = 0, o: { dy?: number; solid?: boolean } = {}) {
    const obj = place(this.groups[f], key, build, x, LEVELS[f].y + (o.dy ?? 0), z, rot);
    if (o.solid !== false) {
      obj.updateMatrixWorld(true);
      const b = new THREE.Box3().setFromObject(obj);
      if (b.max.y - LEVELS[f].y > 0.25) this.rects[f].push([b.min.x + 0.05, b.min.z + 0.05, b.max.x - 0.05, b.max.z - 0.05]);
    }
    return obj;
  }

  label(f: number, text: string, x: number, y: number, z: number, o: { h?: number; color?: string; bg?: string; rot?: number; glow?: boolean; font?: string } = {}) {
    const p = textPlane(text, { h: o.h ?? 0.24, color: o.color ?? "#ffd28a", bg: o.bg, glow: o.glow ?? !o.bg, font: o.font });
    p.position.set(x, LEVELS[f].y + y, z);
    p.rotation.y = o.rot ?? 0;
    this.groups[f].add(p);
    return p;
  }

  /** A screen redrawn every `every` seconds while you are on its level. */
  screen(f: number, w: number, h: number, draw: (g: CanvasRenderingContext2D, W: number, H: number, t: number) => void, every = 3, res = 512) {
    const W = res,
      H = Math.round((res * h) / w);
    const s = makeCanvas(W, H);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: s.t, toneMapped: false }));
    let acc = every;
    this.ticks[f].push((dt, t) => {
      acc += dt;
      if (acc < every) return;
      acc = 0;
      draw(s.g, W, H, t);
      s.t.needsUpdate = true;
    });
    draw(s.g, W, H, 0);
    s.t.needsUpdate = true;
    this.groups[f].add(mesh);
    return mesh;
  }

  /**
   * A zkSNARK on this level. Options: sit, face, wander between spots, and a phone held up
   * (taking photos: the screen glows, a flash now and then).
   */
  async person(f: number, id: number, at: [number, number], role: string, o: { face?: THREE.Vector3; wander?: [number, number][]; dy?: number; sit?: boolean; phone?: boolean } = {}) {
    try {
      const s = new Snark(id, await loadArt(id));
      s.noClip = true;
      s.state = "resident";
      s.role = role;
      const base = LEVELS[f].y + (o.dy ?? 0);
      s.root.position.set(at[0], base, at[1]);
      s.faceDir = o.face ?? new THREE.Vector3(0, 0, 1);
      if (o.sit) s.sit(true);
      this.groups[f].add(s.root);
      this.people[f].push(s);
      if (o.phone) this.phone(f, s, id);
      let said = 0;
      const lines = linesFor(role);
      this.pick(f, s.body, `<b>${role}</b><span>zkSNARK #${id}</span>`, () => ({ eyebrow: role, title: `“${lines[said++ % lines.length]}”`, image: ZScan.zkSnarkImage(id), body: `<p>zkSNARK #${id}</p>` }));
      if (o.wander) {
        const w = o.wander;
        void (async () => {
          for (;;) {
            await new Promise((r) => setTimeout(r, 5000 + Math.random() * 8000));
            if (this.current !== f) continue;
            s.faceDir = null;
            const p = w[Math.floor(Math.random() * w.length)];
            await s.walk([new THREE.Vector3(p[0], base, p[1])], 0.8);
            s.faceDir = o.face ?? null;
          }
        })();
      }
      return s;
    } catch {
      return null;
    }
  }

  /** A phone held up beside the head, its screen lit; a flash every few seconds. */
  private phone(f: number, s: Snark, id: number) {
    const g = new THREE.Group();
    g.position.set(0.6, 1.42, 0.07);
    g.rotation.z = -0.12;
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.24, 0.02), this.dark);
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.11, 0.2), new THREE.MeshBasicMaterial({ color: new THREE.Color("#9fd8ff").multiplyScalar(1.2), toneMapped: false }));
    scr.position.z = 0.011;
    const flash = new THREE.Mesh(new THREE.CircleGeometry(0.09, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.6, 1.6), transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
    flash.position.set(0.03, 0.08, 0.02);
    // a hand under it
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.07, 0.03), std("#d8b090", 0.8));
    hand.position.set(0, -0.12, 0.012);
    g.add(body, scr, flash, hand);
    s.visual.add(g);
    const every = 5 + (id % 7);
    let next = (id % 5) + 1;
    this.ticks[f].push((_dt, t) => {
      if (t > next) next = t + every;
      const k = next - t;
      (flash.material as THREE.MeshBasicMaterial).opacity = k > every - 0.15 ? 1 : 0;
      g.position.y = 1.42 + Math.sin(t * 0.7 + id) * 0.015;
    });
  }

  // ---- shells -----------------------------------------------------------------------------------

  /**
   * A round glass level: floor disc, ceiling with a light ring, glass all round on `segs` facets
   * with mullions, a sill and a head; colliders along the glass except in the `gaps` (door
   * openings, angles in radians from +z, as [from, to]).
   */
  roundShell(f: number, R: number, floor: THREE.Material, ceil: THREE.Material | null, o: { segs?: number; gaps?: [number, number][]; h?: number; noFloor?: boolean } = {}) {
    const { y } = LEVELS[f];
    const h = o.h ?? LEVELS[f].h;
    const g = this.groups[f];
    const segs = o.segs ?? 32;
    if (!o.noFloor) {
      const fl = new THREE.Mesh(new THREE.CircleGeometry(R + 0.15, segs * 2), floor);
      fl.rotation.x = -Math.PI / 2;
      fl.position.y = y;
      g.add(fl);
      // the slab edge under the glass (seen when looking down)
      const edge = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.15, R + 0.15, 0.6, segs * 2, 1, true), this.dark);
      edge.position.y = y - 0.3;
      g.add(edge);
    }
    if (ceil) {
      const c = new THREE.Mesh(new THREE.CircleGeometry(R + 0.15, segs * 2), ceil);
      c.rotation.x = Math.PI / 2;
      c.position.y = y + h;
      g.add(c);
    }
    this.glassRing(f, R, h, segs, o.gaps ?? [], true);
  }

  /** Glass facets on a circle with mullions, a sill and a head rail, colliders on the facets. */
  glassRing(f: number, R: number, h: number, segs: number, gaps: [number, number][], head = true, y0 = LEVELS[f].y) {
    const g = this.groups[f];
    const inGap = (a: number) => gaps.some(([a0, a1]) => angDiff(a, a0) >= 0 && angDiff(a1, a) >= 0);
    // facets (skipping the gaps)
    const pos: number[] = [];
    const mull = new THREE.InstancedMesh(new THREE.BoxGeometry(0.09, h, 0.09), this.mullion, segs + 4);
    let nm = 0;
    const mtx = new THREE.Matrix4();
    for (let i = 0; i < segs; i++) {
      const a0 = (i / segs) * Math.PI * 2,
        a1 = ((i + 1) / segs) * Math.PI * 2;
      const mid = (a0 + a1) / 2;
      if (!inGap(mid)) {
        const x0 = R * Math.sin(a0),
          z0 = R * Math.cos(a0),
          x1 = R * Math.sin(a1),
          z1 = R * Math.cos(a1);
        pos.push(x0, y0, z0, x1, y0, z1, x1, y0 + h, z1, x0, y0, z0, x1, y0 + h, z1, x0, y0 + h, z0);
      }
      if (!inGap(a0) || !inGap(a0 + 0.001) || !inGap(a0 - 0.001)) {
        mtx.makeTranslation(R * Math.sin(a0), y0 + h / 2, R * Math.cos(a0));
        if (nm < segs + 4) mull.setMatrixAt(nm++, mtx);
      }
    }
    mull.count = nm;
    g.add(mull);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.computeVertexNormals();
    const pane = new THREE.Mesh(geo, this.glass);
    pane.raycast = () => {};
    pane.renderOrder = 2;
    g.add(pane);
    // sill and head rails (whole circle: they also frame the doors)
    const rail = (yy: number, t: number) => {
      const r = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.04, R + 0.04, t, segs, 1, true), this.mullion);
      r.position.y = yy;
      r.raycast = () => {};
      g.add(r);
    };
    rail(y0 + 0.06, 0.12);
    if (head) rail(y0 + h - 0.06, 0.12);
    this.ringColliders(f, R, gaps);
  }

  /** Small square colliders all along a circle, except in the gaps. */
  ringColliders(f: number, R: number, gaps: [number, number][] = []) {
    const n = Math.ceil((Math.PI * 2 * R) / 0.35);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      if (gaps.some(([a0, a1]) => angDiff(a, a0) >= 0 && angDiff(a1, a) >= 0)) continue;
      const x = R * Math.sin(a),
        z = R * Math.cos(a);
      this.rects[f].push([x - 0.22, z - 0.22, x + 0.22, z + 0.22]);
    }
  }

  // ---- the lift core and its cabin ---------------------------------------------------------------

  /**
   * The lift core: a square of `c` half-size at the centre, clad in `clad`, with the cabin set into
   * its south face (opening on +z). The cabin rides: arriving here, its doors are shut while the
   * counter runs up (or down) from the level you left; then they slide open.
   */
  core(f: number, c: number, clad: THREE.Material, o: { h?: number } = {}) {
    const { y } = LEVELS[f];
    const h = o.h ?? LEVELS[f].h;
    const g = this.groups[f];
    const CW = 1.25,
      CD = 2.3; // cabin half width, depth
    const zb = c - CD;
    // the core around the cabin slot
    box(g, c - CW, h, 2 * c, clad, -(c + CW) / 2, y, 0);
    box(g, c - CW, h, 2 * c, clad, (c + CW) / 2, y, 0);
    box(g, 2 * CW, h, c + zb, clad, 0, y, (zb - c) / 2);
    box(g, 2 * CW, h - 2.5, 0.3, clad, 0, y + 2.5, c - 0.15);
    this.rects[f].push([-c, -c, -CW, c], [CW, -c, c, c], [-CW, -c, CW, zb]);
    // gold banding at the corners and a gold frame round the cabin door
    for (const [x, z] of [[-c, -c], [c, -c], [-c, c], [c, c]] as const) box(g, 0.14, h, 0.14, this.gold, x, y, z);
    box(g, 0.12, 2.55, 0.1, this.gold, -CW - 0.06, y, c + 0.02);
    box(g, 0.12, 2.55, 0.1, this.gold, CW + 0.06, y, c + 0.02);
    box(g, 2 * CW + 0.24, 0.12, 0.1, this.gold, 0, y + 2.5, c + 0.02);
    // cabin inside: bronze walls, mirror back, lit ceiling, a stone floor
    const walnut = std("#3a2618", 0.45, 0.2);
    box(g, 0.04, 2.5, CD, walnut, -CW + 0.02, y, zb + CD / 2);
    box(g, 0.04, 2.5, CD, walnut, CW - 0.02, y, zb + CD / 2);
    for (const sx of [-1, 1]) {
      box(g, 0.03, 0.05, CD - 0.2, this.gold, sx * (CW - 0.06), y + 0.95, zb + CD / 2);
      box(g, 0.03, 1.4, CD - 0.6, std("#c9b48a", 0.15, 0.95), sx * (CW - 0.05), y + 1.0, zb + CD / 2 - 0.1);
    }
    box(g, 2 * CW, 0.02, CD, std("#1c1a20", 0.3, 0.2), 0, y + 0.005, zb + CD / 2);
    box(g, 2 * CW - 0.3, 0.02, CD - 0.3, glowMat("#fff0d8", 0.9), 0, y + 2.47, zb + CD / 2);
    // the multimedia back wall: a film plays on the ride
    const film = makeCanvas(512, 320);
    const fm = new THREE.Mesh(new THREE.PlaneGeometry(2 * CW - 0.2, 1.9), new THREE.MeshBasicMaterial({ map: film.t, toneMapped: false }));
    fm.position.set(0, y + 1.4, zb + 0.03);
    g.add(fm);
    // the floor counter over the door, inside, and the panel of buttons
    const disp = makeCanvas(512, 160);
    const dm = new THREE.Mesh(new THREE.PlaneGeometry(0.96, 0.3), new THREE.MeshBasicMaterial({ map: disp.t, toneMapped: false }));
    dm.position.set(0, y + 2.27, c - 0.35);
    dm.rotation.y = Math.PI;
    g.add(dm);
    box(g, 2 * CW, 0.46, 0.05, this.dark, 0, y + 2.02, c - 0.3);
    // the doors: two leaves, slide into the core
    const leafMat = std("#a88a52", 0.45, 0.75);
    const leaves = [-1, 1].map((sx) => {
      const l = new THREE.Mesh(new THREE.BoxGeometry(CW, 2.3, 0.05), leafMat);
      l.position.set((sx * CW) / 2, y + 1.15, c - 0.1);
      g.add(l);
      const line = new THREE.Mesh(new THREE.BoxGeometry(0.02, 2.3, 0.06), this.dark);
      line.position.set((-sx * CW) / 2 + sx * 0.01, 0, 0);
      l.add(line);
      return l;
    });
    // button panel on the east wall inside
    const panel = new THREE.Group();
    panel.position.set(CW - 0.05, y + 1.2, c - 0.6);
    panel.rotation.y = -Math.PI / 2;
    g.add(panel);
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.9, 0.03), this.chrome);
    panel.add(plate);
    LEVELS.forEach((L, i) => {
      const yy = -0.34 + i * 0.16;
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.03, 16), i === f ? glowMat("#ffd28a", 1.8) : std("#e8e4dc", 0.3, 0.5));
      b.rotation.x = Math.PI / 2;
      b.position.set(-0.07, yy, 0.025);
      panel.add(b);
      const tl = textPlane(L.label, { h: 0.07, color: "#1a1820" });
      tl.position.set(0.08, yy, 0.02);
      panel.add(tl);
      if (i !== f) this.pick(f, b, `<b>${L.label} · ${L.name.split(" · ")[0]}</b><span>${L.m}</span>`, () => ({ eyebrow: `Lift · ${L.m}`, title: L.name, floor: i }));
    });
    const cab: Cabin = { f, leaves, doorRect: [-CW, c - 0.25, CW, c + 0.05], open: 1, from: f, t: 99, dur: 0, film, disp, CW, c };
    this.cabins[f] = cab;
    this.drawCabin(cab, 0);
    this.ticks[f].push((dt, t) => this.rideTick(cab, dt, t));
    // outside: the lit indicator over the door and the level's name on the core
    this.label(f, `${LEVELS[f].label} · ${LEVELS[f].name.split(" · ")[0].toUpperCase()} · ${LEVELS[f].m}`, 0, 3.0, c + 0.05, { h: 0.2, color: "#ffd28a" });
    return cab;
  }

  /** Start a ride into this level's cabin from `from`. */
  ride(f: number, from: number) {
    const cab = this.cabins[f];
    if (!cab) return;
    cab.from = from;
    cab.t = 0;
    const dh = Math.abs(LEVELS[f].y - LEVELS[from].y);
    cab.dur = 1.6 + dh / 30;
    cab.open = 0;
    if (!this.rects[f].includes(cab.doorRect)) this.rects[f].push(cab.doorRect);
    this.drawCabin(cab, 0);
  }

  private rideTick(cab: Cabin, dt: number, t: number) {
    if (cab.t > cab.dur + 3) return;
    cab.t += dt;
    const riding = cab.t < cab.dur;
    if (!riding) {
      cab.open = Math.min(1, (cab.t - cab.dur) / 1.1);
      if (cab.open > 0.7) {
        const i = this.rects[cab.f].indexOf(cab.doorRect);
        if (i >= 0) this.rects[cab.f].splice(i, 1);
      }
    }
    const e = cab.open * cab.open * (3 - 2 * cab.open);
    cab.leaves.forEach((l, i) => (l.position.x = (i ? 1 : -1) * (cab.CW / 2 + e * (cab.CW - 0.05))));
    this.drawCabin(cab, t);
  }

  private drawCabin(cab: Cabin, t: number) {
    const L = LEVELS[cab.f],
      F = LEVELS[cab.from];
    const k = cab.dur ? Math.min(1, cab.t / cab.dur) : 1;
    const ease = k * k * (3 - 2 * k);
    const m = F.y + (L.y - F.y) * ease;
    const up = L.y >= F.y;
    const speed = cab.dur && k < 1 ? (Math.abs(L.y - F.y) / cab.dur) * 6 * k * (1 - k) : 0;
    // the counter
    const d = cab.disp.g;
    d.fillStyle = "#07060c";
    d.fillRect(0, 0, 512, 160);
    d.fillStyle = "#ffb43a";
    d.font = `800 80px ${MONO}`;
    d.textAlign = "left";
    d.fillText(`${k < 1 ? (up ? "▲" : "▼") : "●"}`, 16, 108);
    d.textAlign = "right";
    d.fillText(`${Math.round(m)}`, 292, 108);
    d.font = `700 34px ${MONO}`;
    d.textAlign = "left";
    d.fillText("m", 298, 108);
    d.fillStyle = "#ffd28a";
    d.font = `700 26px ${MONO}`;
    d.fillText(k < 1 ? `${speed.toFixed(1)} m/s` : `L${L.label}`, 350, 66);
    d.fillStyle = "#8a7a5a";
    d.font = `600 24px ${MONO}`;
    d.fillText(k < 1 ? `→ L${L.label}` : L.m, 350, 108);
    cab.disp.t.needsUpdate = true;
    // the film: rising gold lines, the city's lights, the destination
    const g = cab.film.g,
      W = 512,
      H = 320;
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "#05040c");
    bg.addColorStop(1, "#1a1206");
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
    for (let i = 0; i < 46; i++) {
      const x = (i * 97) % W;
      const yy = (((i * 53 + (up ? 1 : -1) * cab.t * (k < 1 ? 260 : 8)) % H) + H) % H;
      g.fillStyle = `rgba(244,183,40,${0.15 + (i % 5) * 0.08})`;
      g.fillRect(x, H - yy, 2, 18 + (i % 4) * 10);
    }
    g.strokeStyle = "rgba(244,183,40,0.8)";
    g.lineWidth = 3;
    g.beginPath();
    g.arc(W / 2, H * 0.42, 64, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = GOLD;
    g.font = `800 84px ${MONO}`;
    g.textAlign = "center";
    g.fillText("ⓩ", W / 2, H * 0.42 + 30);
    g.font = `700 26px ${MONO}`;
    g.fillStyle = "#f4ecd8";
    g.fillText(L.name.split(" · ")[0].toUpperCase(), W / 2, H * 0.8);
    g.font = `500 18px ${MONO}`;
    g.fillStyle = "#c9a227";
    g.fillText(`ZEC NEEDLE · L${L.label} · ${L.m}`, W / 2, H * 0.9);
    g.textAlign = "left";
    cab.film.t.needsUpdate = true;
    void t;
  }

  /** Bearing (radians from +z, the interior's frame = the city's) and distance to a city point. */
  bearing(x: number, z: number) {
    const dx = x - SITE.x,
      dz = z - SITE.z;
    return { a: Math.atan2(dx, dz), d: Math.hypot(dx, dz) };
  }
}

export interface Cabin {
  f: number;
  leaves: THREE.Mesh[];
  doorRect: Rect;
  open: number;
  from: number;
  t: number;
  dur: number;
  film: ReturnType<typeof makeCanvas>;
  disp: ReturnType<typeof makeCanvas>;
  CW: number;
  c: number;
}

/** a - b wrapped to [-π, π]. */
export function angDiff(a: number, b: number) {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Compass name of a bearing (the city's -z is north). */
export function compass(a: number) {
  // +z is south; turn so 0 = north, clockwise towards +x (east)
  const deg = ((180 - (a * 180) / Math.PI) % 360 + 360) % 360;
  const n = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  return { deg: Math.round(deg), name: n[Math.round(deg / 22.5) % 16] };
}
