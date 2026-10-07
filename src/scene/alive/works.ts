import * as THREE from "three";
import { CURB } from "../city/plan";
import { toObject } from "../voxel/mesher";
import { C, E, G, VOX, VoxelModel, type Paint } from "../voxel/model";
import type { AliveCtx, AliveFrame, AlivePart } from "./types";

/**
 * Building sites and window cleaners:
 *  - two tower cranes over half-built towers rising out of block courtyards (west of the heart and
 *    on Wall Street). The jib slews, the trolley runs, the hook really lifts steel beams and pallets
 *    of gold crates from the laydown yard to the top deck, where they stay; the load swings a little
 *    on its cables; a site hoist rides up and down the tower; red aviation lights blink at night;
 *  - a building maintenance unit on the tallest supertall: an arm over the roof edge, a gondola on
 *    two cables with two cleaners going down the glass, drop by drop.
 */

const rand = (a: number, b: number) => a + Math.random() * (b - a);

/** A voxel line from a to b (inclusive). */
function line(m: VoxelModel, a: [number, number, number], b: [number, number, number], c: Paint, t = 1) {
  const n = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]), Math.abs(b[2] - a[2]), 1);
  for (let i = 0; i <= n; i++) {
    const k = i / n;
    const x = a[0] + (b[0] - a[0]) * k,
      y = a[1] + (b[1] - a[1]) * k,
      z = a[2] + (b[2] - a[2]) * k;
    if (t <= 1) m.set(x, y, z, c);
    else m.box(Math.round(x), Math.round(y), Math.round(z), Math.round(x) + t, Math.round(y) + t, Math.round(z) + t, c);
  }
}

const YELLOW = "#f4b728";
const STEEL = "#b8402e";

/** A worker in a hard hat (11 voxels tall), feet at y. */
function worker(m: VoxelModel, x: number, y: number, z: number, hat = "#f4d22a", facingX = false) {
  const [w, d] = facingX ? [2, 3] : [3, 2];
  m.box(x, y, z, x + w, y + 4, z + d, C("#2a3a5a"));
  m.box(x, y + 4, z, x + w, y + 8, z + d, C("#ff7a1a"));
  m.box(x, y + 6, z, x + w, y + 7, z + d, C("#e8f070"));
  m.box(x, y + 8, z, x + w, y + 10, z + d, C("#e0b090"));
  m.box(x, y + 10, z, x + w, y + 11, z + d, C(hat));
}

function signTexture(text: string) {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 128;
  const g = c.getContext("2d")!;
  g.fillStyle = "#16141c";
  g.fillRect(0, 0, 512, 128);
  g.fillStyle = YELLOW;
  g.fillRect(0, 0, 512, 10);
  g.fillRect(0, 118, 512, 10);
  g.font = '900 70px "JetBrains Mono", Menlo, monospace';
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, 256, 68);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// ---- the building site ---------------------------------------------------------------------------

interface SiteSpec {
  /** The free courtyard (world), long along z. */
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  floors: number;
  jib: number;
  counter: number;
  sign: string;
}

const STOREY = 19;

class Site {
  readonly root = new THREE.Group();
  private slew = new THREE.Group();
  private trolley: THREE.Object3D;
  private hook: THREE.Object3D;
  private cable: THREE.Mesh;
  private loads: THREE.Object3D[] = [];
  private placed: THREE.Object3D[][] = [[], []];
  private placedNext = 0;
  private hoist: THREE.Object3D;
  private lights: THREE.Mesh;
  private lightMat: THREE.MeshBasicMaterial;
  private mast = new THREE.Vector3();
  private jibY = 0;
  // the crane's state and where it is going
  private a = 0;
  private r = 6;
  private y = 10;
  private steps: { a?: number; r?: number; y?: number; wait?: number; attach?: number; detach?: boolean }[] = [];
  private waitT = 0;
  private carrying = -1;
  private sway = new THREE.Vector2();
  private swayV = new THREE.Vector2();
  private lastHook = new THREE.Vector3();
  private lastVel = new THREE.Vector2();
  private pickups: { x: number; y: number; z: number; kind: number }[] = [];
  private drops: { x: number; y: number; z: number }[] = [];
  private dropK = 0;
  private hoistT = rand(0, 60);
  private topY: number;
  private cx: number;
  private cz: number;
  readonly centre: THREE.Vector3;

  constructor(s: SiteSpec) {
    const W = Math.floor((s.x1 - s.x0) / VOX),
      D = Math.floor((s.z1 - s.z0) / VOX);
    this.cx = (s.x0 + s.x1) / 2;
    this.cz = (s.z0 + s.z1) / 2;
    // voxel (i, k) of the site model → world
    const wx = (i: number) => this.cx + (i + 0.5 - W / 2) * VOX,
      wz = (k: number) => this.cz + (k + 0.5 - D / 2) * VOX;
    const N = s.floors;
    const bx0 = 2,
      bx1 = W - 2,
      bz0 = 2,
      bz1 = Math.round(D * 0.6);
    const top = N * STOREY;
    const H = top + 30;
    const m = new VoxelModel(W, H, D);
    const conc = C("#a8a4ae");
    const dark = C("#3a3842");
    const steel = C(STEEL);
    const glass = G("#6a9ac8");
    // the mast stands in the tower's open bay
    const mx0 = bx1 - 11,
      mz0 = Math.round((bz0 + bz1) / 2) - 4;
    // core (stairs and lifts), with its climbing formwork on top
    const kx0 = bx0 + 2,
      kz0 = Math.round((bz0 + bz1) / 2) - 7;
    m.box(kx0, 0, kz0, kx0 + 12, top + 10, kz0 + 14, conc);
    m.box(kx0 - 1, top + 10, kz0 - 1, kx0 + 13, top + 16, kz0 + 15, C("#d8a040"));
    m.box(kx0 - 1, top + 15, kz0 - 1, kx0 + 13, top + 16, kz0 + 15, C(YELLOW));
    // slabs: full ones, then a half one on the top deck; edge barriers on the open floors
    for (let f = 0; f <= N - 1; f++) {
      const y = f * STOREY;
      const z1 = f === N - 1 ? bz0 + Math.round((bz1 - bz0) * 0.55) : bz1;
      m.box(bx0, y, bz0, bx1, y + 2, z1, conc);
      if (f >= 3) {
        m.box(bx0, y + 5, bz0, bx1, y + 6, bz0 + 1, C("#ff7a1a"));
        m.box(bx0, y + 5, z1 - 1, bx1, y + 6, z1, C("#ff7a1a"));
        m.box(bx0, y + 5, bz0, bx0 + 1, y + 6, z1, C("#ff7a1a"));
        m.box(bx1 - 1, y + 5, bz0, bx1, y + 6, z1, C("#ff7a1a"));
      }
      // work lights hanging under the open floors
      if (f >= 1 && f < N) for (let x = bx0 + 6; x < bx1 - 4; x += 12) for (let z = bz0 + 6; z < z1 - 4; z += 14) m.box(x, y - 1, z, x + 2, y, z + 2, E("#fff0c8", 1.6));
    }
    // columns: concrete below, bare steel on the top two storeys, rebar out of the top
    const cols: [number, number][] = [];
    for (const x of [bx0, bx0 + Math.round((bx1 - bx0) / 2) - 1, bx1 - 2]) for (let z = bz0; z <= bz1 - 2; z += Math.max(10, Math.round((bz1 - bz0 - 2) / 3))) cols.push([x, z]);
    for (const [x, z] of cols) {
      if (x + 2 > mx0 && x < mx0 + 10 && z + 2 > mz0 && z < mz0 + 10) continue;
      m.box(x, 0, z, x + 2, (N - 2) * STOREY, z + 2, conc);
      m.box(x, (N - 2) * STOREY, z, x + 2, top, z + 2, steel);
      m.box(x, top, z, x + 1, top + 4, z + 1, C("#6a3a2a"));
    }
    // the steel frame of the last storey: edge beams
    for (const y of [(N - 1) * STOREY, top - 1]) {
      m.box(bx0, y, bz0, bx1, y + 1, bz0 + 1, steel);
      m.box(bx0, y, bz1 - 1, bx1, y + 1, bz1, steel);
      m.box(bx0, y, bz0, bx0 + 1, y + 1, bz1, steel);
      m.box(bx1 - 1, y, bz0, bx1, y + 1, bz1, steel);
    }
    // glass going up on the lower floors (mullions every metre)
    const clad = Math.min(4, N - 3) * STOREY;
    for (let y = 2; y < clad; y++) {
      if (y % STOREY < 2) continue;
      for (let x = bx0; x < bx1; x++) {
        const c = x % 6 === 0 ? dark : glass;
        m.set(x, y, bz0, c);
        m.set(x, y, bz1 - 1, c);
      }
      for (let z = bz0; z < bz1; z++) {
        const c = z % 6 === 0 ? dark : glass;
        m.set(bx0, y, z, c);
        m.set(bx1 - 1, y, z, c);
      }
    }
    // a hole through the slabs for the mast
    m.clear(mx0, 0, mz0, mx0 + 10, top + 2, mz0 + 10);
    // the hoist's mast on the yard face, and its cage below (the cage moves)
    const hx = bx0 + Math.round((bx1 - bx0) / 2) - 1;
    m.box(hx, 0, bz1, hx + 2, top + 8, bz1 + 2, C("#8a8694"));
    for (let y = 0; y < top + 8; y += 9) m.box(hx, y, bz1, hx + 2, y + 1, bz1 + 2, C(YELLOW));
    // the yard: stacks of beams, pallets of crates, the site office, a portaloo, workers
    const yz0 = bz1 + 6;
    m.box(1, 0, yz0 - 1, W - 1, 1, D - 1, C("#6a6058"));
    const beamX = 3,
      beamZ = yz0 + 1;
    for (let l = 0; l < 3; l++)
      for (let b = 0; b < 3; b++) {
        m.box(beamX + b * 4, 1 + l * 3, beamZ, beamX + b * 4 + 3, 1 + l * 3 + 3, Math.min(D - 3, beamZ + 26), steel);
        m.box(beamX + b * 4 + 1, 1 + l * 3, beamZ, beamX + b * 4 + 2, 1 + l * 3 + 3, Math.min(D - 3, beamZ + 26), C("#8a3022"));
      }
    const palX = W - 15,
      palZ = yz0 + 2;
    m.box(palX, 1, palZ, palX + 12, 3, palZ + 12, C("#a07040"));
    for (let i = 0; i < 2; i++) for (let k = 0; k < 2; k++) m.box(palX + 1 + i * 5, 3, palZ + 1 + k * 5, palX + 6 + i * 5, 8, palZ + 6 + k * 5, i ^ k ? C(YELLOW) : C("#d89a1a"));
    // the site office: a container on the yard's far end
    const oz = D - 12;
    if (oz > palZ + 13) {
      m.box(2, 1, oz, W - 2, 15, D - 2, C("#e8e4ec"));
      m.box(2, 9, oz, W - 2, 11, D - 2, C("#2e5ab8"));
      for (let x = 5; x < W - 6; x += 8) m.box(x, 5, oz - 1, x + 4, 8, oz, G("#2a3448"));
      m.box(W - 8, 1, oz - 1, W - 5, 9, oz, C("#5a5a66"));
    }
    worker(m, W / 2 - 1, 1, yz0 + 14, "#ffffff");
    worker(m, beamX + 13, 1, beamZ + 4, "#f4d22a", true);
    // on the top deck, waiting for the next load
    worker(m, bx0 + 16, (N - 1) * STOREY + 2, bz0 + 4, "#f4d22a");
    worker(m, bx0 + 24, (N - 1) * STOREY + 2, bz0 + 10, "#ffffff", true);
    worker(m, kx0 + 4, top + 16, kz0 + 5, "#f4d22a");
    const site = toObject(m);
    site.position.set(this.cx, CURB, this.cz);
    this.root.add(site);
    this.topY = CURB + top * VOX;

    // ---- the crane: mast, slewing part (jib, counter-jib, cab, apex, counterweights) ----
    const mastH = top + 66;
    const mm = new VoxelModel(10, mastH, 10);
    const yel = C(YELLOW);
    for (const [x, z] of [
      [0, 0],
      [9, 0],
      [0, 9],
      [9, 9],
    ])
      mm.box(x, 0, z, x + 1, mastH, z + 1, yel);
    for (let y = 0; y < mastH - 9; y += 9) {
      for (const [a, b] of [
        [[0, y, 0], [9, y, 0]],
        [[0, y, 9], [9, y, 9]],
        [[0, y, 0], [0, y, 9]],
        [[9, y, 0], [9, y, 9]],
        [[0, y, 0], [9, y + 9, 0]],
        [[9, y, 9], [0, y + 9, 9]],
        [[0, y + 9, 0], [0, y, 9]],
        [[9, y + 9, 9], [9, y, 0]],
      ] as [number, number, number][][])
        line(mm, a as [number, number, number], b as [number, number, number], yel);
    }
    mm.box(0, 0, 0, 10, 2, 10, C("#3a3842"));
    const mast = toObject(mm);
    this.mast.set(wx(mx0) + 4.5 * VOX, CURB, wz(mz0) + 4.5 * VOX);
    mast.position.copy(this.mast);
    this.root.add(mast);
    this.jibY = CURB + mastH * VOX;

    const L = Math.round(s.jib / VOX),
      Lc = Math.round(s.counter / VOX);
    const JW = Lc + L + 4,
      JH = 52,
      JD = 16;
    const piv = Lc + 2; // the mast's axis, in the slewing model's x
    const jm = new VoxelModel(JW, JH, JD);
    const zc = 7;
    // slewing ring and turntable
    jm.box(piv - 6, 0, zc - 5, piv + 6, 8, zc + 6, C("#3a3842"));
    jm.box(piv - 5, 8, zc - 4, piv + 5, 12, zc + 5, yel);
    // jib: two bottom chords, a top chord, lacing
    const jy = 12,
      jt = 21;
    jm.box(piv, jy, zc - 3, JW - 1, jy + 1, zc - 2, yel);
    jm.box(piv, jy, zc + 3, JW - 1, jy + 1, zc + 4, yel);
    jm.box(piv, jt, zc, JW - 4, jt + 1, zc + 1, yel);
    for (let x = piv; x < JW - 6; x += 6) {
      line(jm, [x, jy, zc - 3], [x + 3, jt, zc], yel);
      line(jm, [x + 3, jt, zc], [x + 6, jy, zc - 3], yel);
      line(jm, [x, jy, zc + 3], [x + 3, jt, zc], yel);
      line(jm, [x + 3, jt, zc], [x + 6, jy, zc + 3], yel);
      line(jm, [x, jy, zc - 3], [x, jy, zc + 3], yel);
    }
    // counter-jib: a grated platform with rails, the hoist winch, the counterweights at its end
    jm.box(2, jy, zc - 4, piv - 6, jy + 1, zc + 5, C("#4a4852"));
    jm.box(2, jy + 1, zc - 4, piv - 6, jy + 4, zc - 3, yel);
    jm.box(2, jy + 1, zc + 4, piv - 6, jy + 4, zc + 5, yel);
    jm.box(Math.round(Lc * 0.45), jy + 1, zc - 3, Math.round(Lc * 0.45) + 9, jy + 7, zc + 4, C("#6a6874"));
    jm.box(1, 0, zc - 4, 13, jy, zc + 5, C("#c0bcc4"));
    for (let y = 2; y < jy; y += 3) jm.box(1, y, zc - 4, 13, y + 1, zc + 5, C("#9a96a2"));
    // the apex and its pendant ties to both ends
    const ax = piv,
      ay = JH - 2;
    line(jm, [piv - 5, 12, zc - 3], [ax, ay, zc], yel, 1);
    line(jm, [piv + 5, 12, zc - 3], [ax, ay, zc], yel, 1);
    line(jm, [piv - 5, 12, zc + 4], [ax, ay, zc], yel, 1);
    line(jm, [piv + 5, 12, zc + 4], [ax, ay, zc], yel, 1);
    line(jm, [ax, ay, zc], [piv + Math.round(L * 0.7), jt, zc], C("#5a5864"));
    line(jm, [ax, ay, zc], [4, jy + 2, zc], C("#5a5864"));
    // the cab, beside the turntable
    jm.box(piv + 5, 1, zc + 6, piv + 13, 11, JD, C("#e8e4ec"));
    jm.box(piv + 12, 3, zc + 7, piv + 13, 10, JD - 1, G("#2a3448"));
    jm.box(piv + 6, 3, JD - 1, piv + 12, 9, JD, G("#2a3448"));
    jm.box(piv + 5, 10, zc + 6, piv + 13, 11, JD, yel);
    const jib = toObject(jm);
    jib.position.x = (JW / 2 - piv - 0.5) * VOX;
    jib.position.z = (JD / 2 - zc - 0.5) * VOX;
    this.slew.add(jib);
    // the builder's name on the counterweights, both sides
    const signT = signTexture(s.sign);
    for (const side of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(12 * VOX, 3 * VOX), new THREE.MeshBasicMaterial({ map: signT }));
      p.position.set((7 - piv) * VOX, 6 * VOX, side * (4.5 * VOX + 0.02));
      if (side < 0) p.rotation.y = Math.PI;
      this.slew.add(p);
    }
    // aviation lights: apex, jib tip, counter-jib end
    this.lightMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.2, 0.15), toneMapped: false });
    const lg = new THREE.BoxGeometry(0.28, 0.28, 0.28);
    const lights = [
      [0, (ay + 1) * VOX, 0],
      [(JW - piv - 2) * VOX, (jt + 1.5) * VOX, 0],
      [(1 - piv) * VOX, (jy + 2) * VOX, 0],
    ].map(([x, y, z]) => lg.clone().translate(x, y, z));
    this.lights = new THREE.Mesh(mergeBoxes(lights), this.lightMat);
    this.slew.add(this.lights);
    this.slew.position.set(this.mast.x, this.jibY, this.mast.z);
    this.root.add(this.slew);

    // trolley, cables, hook block
    const tm = new VoxelModel(8, 3, 8);
    tm.box(0, 0, 0, 8, 3, 8, C("#3a3842"));
    tm.box(1, 0, 1, 7, 1, 7, yel);
    this.trolley = toObject(tm, { shadows: false });
    this.trolley.position.y = (jy - 3) * VOX;
    this.slew.add(this.trolley);
    const cg = mergeBoxes([new THREE.BoxGeometry(0.05, 1, 0.05).translate(-0.18, -0.5, 0), new THREE.BoxGeometry(0.05, 1, 0.05).translate(0.18, -0.5, 0)]);
    this.cable = new THREE.Mesh(cg, new THREE.MeshStandardMaterial({ color: "#2a2830", roughness: 0.5, metalness: 0.6 }));
    this.root.add(this.cable);
    const hm = new VoxelModel(4, 7, 3);
    hm.box(0, 3, 0, 4, 7, 3, (x, y) => (((x + y) & 1) === 0 ? C(YELLOW) : C("#1a1a20")));
    hm.box(1, 0, 1, 3, 3, 2, C("#3a3842"));
    this.hook = toObject(hm, { shadows: false });
    this.root.add(this.hook);

    // the loads: a bundle of beams on slings, a pallet of crates on slings
    const beams = new VoxelModel(36, 22, 10);
    for (let b = 0; b < 3; b++) {
      beams.box(0, 0, 1 + b * 3, 36, 3, 3 + b * 3, steel);
      beams.box(0, 1, 1 + b * 3, 36, 2, 2 + b * 3, C("#8a3022"));
    }
    line(beams, [3, 3, 5], [18, 21, 5], C("#2a2830"));
    line(beams, [32, 3, 5], [18, 21, 5], C("#2a2830"));
    const pal = new VoxelModel(12, 22, 12);
    pal.box(0, 0, 0, 12, 2, 12, C("#a07040"));
    for (let i = 0; i < 2; i++) for (let k = 0; k < 2; k++) pal.box(1 + i * 5, 2, 1 + k * 5, 6 + i * 5, 7, 6 + k * 5, i ^ k ? C(YELLOW) : C("#d89a1a"));
    pal.box(4, 4, 0, 8, 6, 1, E("#f4b728", 1.2));
    for (const [x, z] of [
      [0, 0],
      [11, 0],
      [0, 11],
      [11, 11],
    ])
      line(pal, [x, 7, z], [6, 21, 6], C("#2a2830"));
    const beamsDeck = new VoxelModel(36, 3, 10);
    for (let b = 0; b < 3; b++) beamsDeck.box(0, 0, 1 + b * 3, 36, 3, 3 + b * 3, steel);
    const palDeck = new VoxelModel(12, 7, 12);
    palDeck.box(0, 0, 0, 12, 2, 12, C("#a07040"));
    for (let i = 0; i < 2; i++) for (let k = 0; k < 2; k++) palDeck.box(1 + i * 5, 2, 1 + k * 5, 6 + i * 5, 7, 6 + k * 5, i ^ k ? C(YELLOW) : C("#d89a1a"));
    for (const model of [beams, pal]) {
      const o = toObject(model, { shadows: false });
      o.visible = false;
      o.userData.h = model.h * VOX;
      this.root.add(o);
      this.loads.push(o);
    }
    for (const [k, model] of [beamsDeck, palDeck].entries())
      for (let i = 0; i < 2; i++) {
        const o = toObject(model, { shadows: false });
        o.visible = false;
        this.root.add(o);
        this.placed[k].push(o);
      }

    // the hoist's cage
    const hc = new VoxelModel(8, 12, 6);
    hc.box(0, 0, 0, 8, 12, 6, C("#e8e4ec"));
    hc.box(1, 3, 5, 7, 10, 6, G("#2a3448"));
    hc.box(0, 11, 0, 8, 12, 6, C(YELLOW));
    this.hoist = toObject(hc, { shadows: false });
    this.hoist.position.set(wx(hx) + 0.5 * VOX, CURB, wz(bz1 + 2) + 3 * VOX);
    this.root.add(this.hoist);

    // where loads come from (top of the stacks) and where they go (the top deck)
    this.pickups.push({ x: wx(beamX + 6), y: CURB + 10 * VOX, z: wz(beamZ + 13), kind: 0 });
    this.pickups.push({ x: wx(palX + 6), y: CURB + 8 * VOX, z: wz(palZ + 6), kind: 1 });
    const deckY = CURB + ((N - 1) * STOREY + 2) * VOX;
    const halfZ1 = bz0 + Math.round((bz1 - bz0) * 0.55);
    for (const [i, k] of [
      [0.32, 0.3],
      [0.32, 0.75],
      [0.62, 0.55],
    ])
      this.drops.push({ x: wx(bx0 + (mx0 - bx0) * i), y: deckY, z: wz(bz0 + (halfZ1 - bz0) * k) });
    this.centre = new THREE.Vector3(this.cx, this.topY, this.cz);
    this.y = this.topY + 6;
    this.lastHook.set(this.mast.x + 6, this.y, this.mast.z);
  }

  private polar(x: number, z: number) {
    const dx = x - this.mast.x,
      dz = z - this.mast.z;
    return { a: Math.atan2(-dz, dx), r: Math.max(3, Math.hypot(dx, dz)) };
  }

  /** The next lift: from a stack to the deck, and back empty. */
  private plan() {
    const p = this.pickups[Math.floor(Math.random() * this.pickups.length)];
    const d = this.drops[this.dropK++ % this.drops.length];
    const clear = this.topY + 4;
    const P = this.polar(p.x, p.z),
      Dp = this.polar(d.x, d.z);
    const h = this.loads[p.kind].userData.h as number;
    this.steps.push(
      { y: clear, a: P.a, r: P.r },
      { y: p.y + h },
      { wait: rand(2, 4), attach: p.kind },
      { y: clear + h * 0.3 },
      { a: Dp.a, r: Dp.r },
      { y: d.y + h },
      { wait: rand(2.5, 4.5), detach: true },
      { y: clear },
      { wait: rand(2, 6) },
    );
  }

  update(f: AliveFrame, near: boolean) {
    const dt = f.dt;
    // the blink of the aviation lights (dim by day)
    const on = Math.sin(f.t * 3.4 + this.cx) > -0.2;
    this.lightMat.color.setRGB(f.night ? (on ? 4 : 0.25) : 1.6, f.night ? (on ? 0.25 : 0.03) : 0.12, f.night ? (on ? 0.18 : 0.02) : 0.1);
    // the hoist: up, wait, down, wait
    this.hoistT += dt;
    const cyc = this.hoistT % 70;
    const top = this.topY - CURB - 2.4;
    const k = cyc < 20 ? cyc / 20 : cyc < 35 ? 1 : cyc < 55 ? 1 - (cyc - 35) / 20 : 0;
    this.hoist.position.y = CURB + top * (k * k * (3 - 2 * k));
    if (!near) return;
    // the crane moves toward its current step's targets
    if (!this.steps.length) this.plan();
    const st = this.steps[0];
    let done = true;
    if (st.a !== undefined) {
      let da = st.a - this.a;
      da = Math.atan2(Math.sin(da), Math.cos(da));
      const v = 0.22 * dt * Math.min(1, Math.abs(da) * 2 + 0.25);
      if (Math.abs(da) > v) (this.a += Math.sign(da) * v), (done = false);
      else this.a = st.a;
    }
    if (st.r !== undefined) {
      const dr = st.r - this.r;
      const v = 1.6 * dt * Math.min(1, Math.abs(dr) * 0.8 + 0.2);
      if (Math.abs(dr) > v) (this.r += Math.sign(dr) * v), (done = false);
      else this.r = st.r;
    }
    if (st.y !== undefined) {
      const dy = st.y - this.y;
      const v = 2.2 * dt * Math.min(1, Math.abs(dy) * 0.6 + 0.15);
      if (Math.abs(dy) > v) (this.y += Math.sign(dy) * v), (done = false);
      else this.y = st.y;
    }
    if (st.wait !== undefined) {
      if (this.waitT === 0) {
        if (st.attach !== undefined) this.carrying = st.attach;
        if (st.detach && this.carrying >= 0) {
          // the load stays on the deck, where it was set down
          const pool = this.placed[this.carrying];
          const o = pool[this.placedNext++ % pool.length];
          const d = this.drops[(this.dropK - 1) % this.drops.length];
          o.position.set(d.x, d.y, d.z);
          o.rotation.y = this.loads[this.carrying].rotation.y;
          o.visible = true;
          this.loads[this.carrying].visible = false;
          this.carrying = -1;
        }
      }
      this.waitT += dt;
      if (this.waitT < st.wait) done = false;
      else this.waitT = 0;
    }
    if (done) this.steps.shift();
    // place the parts
    this.slew.rotation.y = this.a;
    this.trolley.position.x = this.r;
    const tx = this.mast.x + Math.cos(this.a) * this.r,
      tz = this.mast.z - Math.sin(this.a) * this.r;
    // the hook swings a little behind the trolley (a damped pendulum)
    if (dt > 0) {
      const vx = (tx - this.lastHook.x) / dt,
        vz = (tz - this.lastHook.z) / dt;
      const ax = (vx - this.lastVel.x) / dt,
        az = (vz - this.lastVel.y) / dt;
      this.lastVel.set(vx, vz);
      this.lastHook.set(tx, 0, tz);
      const len = Math.max(2, this.jibY - this.y);
      const w2 = 9.8 / len;
      this.swayV.x += (-w2 * this.sway.x - THREE.MathUtils.clamp(ax, -3, 3) * 0.3 - this.swayV.x * 0.9) * dt;
      this.swayV.y += (-w2 * this.sway.y - THREE.MathUtils.clamp(az, -3, 3) * 0.3 - this.swayV.y * 0.9) * dt;
      this.sway.x = THREE.MathUtils.clamp(this.sway.x + this.swayV.x * dt, -0.8, 0.8);
      this.sway.y = THREE.MathUtils.clamp(this.sway.y + this.swayV.y * dt, -0.8, 0.8);
      // resting on a stack or on the deck: no swing
      if (st.wait !== undefined) this.sway.multiplyScalar(0.9);
    }
    const hx = tx + this.sway.x,
      hz = tz + this.sway.y;
    const hookTop = this.y + 7 * VOX;
    this.hook.position.set(hx, this.y, hz);
    this.hook.rotation.y = this.a;
    const topY = this.jibY + 9 * VOX;
    const dir = new THREE.Vector3(hx - tx, hookTop - topY, hz - tz);
    const len = dir.length();
    this.cable.position.set(tx, topY, tz);
    this.cable.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir.normalize());
    this.cable.scale.set(1, len, 1);
    this.cable.rotateY(this.a);
    for (const [i, o] of this.loads.entries()) {
      o.visible = i === this.carrying;
      if (!o.visible) continue;
      o.position.set(hx, this.y - (o.userData.h as number), hz);
      o.rotation.y = this.a + Math.PI / 2;
    }
  }
}

function isIn(o: THREE.Object3D, g: THREE.Object3D) {
  for (let p: THREE.Object3D | null = o; p; p = p.parent) if (p === g) return true;
  return false;
}

function mergeBoxes(geos: THREE.BufferGeometry[]) {
  const pos: number[] = [],
    nor: number[] = [],
    idx: number[] = [];
  for (const g of geos) {
    const base = pos.length / 3;
    const p = g.getAttribute("position"),
      n = g.getAttribute("normal");
    for (let i = 0; i < p.count; i++) pos.push(p.getX(i), p.getY(i), p.getZ(i)), nor.push(n.getX(i), n.getY(i), n.getZ(i));
    const ix = g.index!;
    for (let i = 0; i < ix.count; i++) idx.push(base + ix.getX(i));
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  out.setIndex(idx);
  return out;
}

// ---- the window cleaners ------------------------------------------------------------------------

class Cleaners {
  readonly root = new THREE.Group();
  private bmu: THREE.Object3D;
  private gondola: THREE.Object3D;
  private cables: THREE.Mesh;
  private wipers: THREE.Mesh[] = [];
  private cols: number[] = [];
  private col = 0;
  private x: number;
  private y: number;
  private phase: "move" | "down" | "pause" | "up" = "move";
  private pauseT = 0;
  private yaw: number;
  private out: number;
  readonly centre: THREE.Vector3;

  constructor(
    x0: number,
    x1: number,
    private z: number,
    face: "s" | "n",
    private roof: number,
  ) {
    this.out = face === "s" ? 1 : -1;
    this.yaw = face === "s" ? 0 : Math.PI;
    for (let x = x0 + 2.5; x < x1 - 2.4; x += 3.4) this.cols.push(x);
    if (!this.cols.length) this.cols.push((x0 + x1) / 2);
    this.col = Math.floor(Math.random() * this.cols.length);
    this.x = this.cols[this.col];
    this.y = roof - 3 - Math.random() * (roof - 12);
    this.phase = "down";
    // the roof unit: a carriage on the roof, an arm reaching out over the edge
    const bm = new VoxelModel(18, 16, 30);
    bm.box(0, 0, 0, 18, 9, 14, C("#d8d4dc"));
    bm.box(0, 6, 0, 18, 7, 14, C(YELLOW));
    bm.box(2, 9, 4, 16, 12, 30, C("#e8e4ec"));
    bm.box(3, 9, 26, 15, 12, 30, C("#9a96a2"));
    bm.box(0, 0, 13, 18, 2, 14, C("#3a3842"));
    bm.box(1, 9, 0, 3, 11, 2, E("#ff6a2a", 2));
    this.bmu = toObject(bm);
    this.bmu.rotation.y = this.yaw;
    this.root.add(this.bmu);
    // the gondola: a platform with rails, two cleaners in it
    const gm = new VoxelModel(20, 18, 6);
    gm.box(0, 0, 0, 20, 2, 6, C("#5a5864"));
    gm.box(0, 2, 5, 20, 7, 6, C("#e8e4ec"));
    gm.box(0, 6, 0, 20, 7, 6, C(YELLOW));
    gm.box(0, 2, 0, 1, 7, 6, C("#e8e4ec"));
    gm.box(19, 2, 0, 20, 7, 6, C("#e8e4ec"));
    gm.box(0, 2, 0, 20, 3, 1, C("#9a96a2"));
    gm.box(3, 3, 5, 17, 5, 6, C("#2e5ab8"));
    for (const x of [5, 13]) {
      gm.box(x, 2, 2, x + 3, 6, 4, C("#2a4a8a"));
      gm.box(x, 6, 2, x + 3, 9, 4, C("#2e5ab8"));
      gm.box(x, 9, 2, x + 3, 11, 4, C("#e0b090"));
      gm.box(x, 11, 2, x + 3, 12, 4, C("#ffffff"));
    }
    gm.box(0, 12, 2, 1, 18, 4, C("#5a5864"));
    gm.box(19, 12, 2, 20, 18, 4, C("#5a5864"));
    this.gondola = toObject(gm, { shadows: false });
    this.gondola.rotation.y = this.yaw;
    this.root.add(this.gondola);
    const wiperMat = new THREE.MeshStandardMaterial({ color: "#3a3842" });
    for (const dx of [-0.6, 0.75]) {
      const w = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.9, 0.06).translate(0, 0.45, 0), wiperMat);
      w.userData.dx = dx;
      this.wipers.push(w);
      this.root.add(w);
    }
    this.cables = new THREE.Mesh(
      mergeBoxes([new THREE.BoxGeometry(0.04, 1, 0.04).translate(-1.55, -0.5, 0), new THREE.BoxGeometry(0.04, 1, 0.04).translate(1.55, -0.5, 0)]),
      new THREE.MeshStandardMaterial({ color: "#2a2830", metalness: 0.6, roughness: 0.4 }),
    );
    this.root.add(this.cables);
    this.centre = new THREE.Vector3((x0 + x1) / 2, roof * 0.5, z);
  }

  update(f: AliveFrame, near: boolean) {
    if (!near) return;
    const dt = f.dt;
    const top = this.roof - 2.6,
      bottom = CURB + 4;
    if (this.phase === "move") {
      const tx = this.cols[this.col];
      const d = tx - this.x;
      const v = 0.5 * dt;
      if (Math.abs(d) > v) this.x += Math.sign(d) * v;
      else (this.x = tx), (this.phase = "down");
      this.y = Math.min(top, this.y + 1.2 * dt);
    } else if (this.phase === "down") {
      this.y -= 0.3 * dt;
      if (this.y < bottom) (this.y = bottom), (this.phase = "pause"), (this.pauseT = 6);
    } else if (this.phase === "pause") {
      if ((this.pauseT -= dt) < 0) this.phase = "up";
    } else {
      this.y += 1.1 * dt;
      if (this.y > top) {
        this.y = top;
        this.col = (this.col + 1) % this.cols.length;
        this.phase = "move";
      }
    }
    const armZ = this.z + this.out * 0.75;
    this.bmu.position.set(this.x, this.roof, this.z - this.out * 2.3);
    this.gondola.position.set(this.x, this.y, armZ);
    const cy = this.roof + 11 * VOX;
    this.cables.position.set(this.x, cy, armZ);
    this.cables.scale.set(1, Math.max(0.1, cy - (this.y + 18 * VOX)), 1);
    // the squeegees sweep the glass while going down
    const sweeping = this.phase === "down" || this.phase === "pause";
    this.wipers.forEach((w, i) => {
      w.position.set(this.x + (w.userData.dx as number) * this.out, this.y + 9 * VOX, this.z + this.out * 0.42);
      w.rotation.z = sweeping ? Math.sin(f.t * 2.6 + i * 1.7) * 0.9 : 0.2;
    });
  }
}

// ---- the part ------------------------------------------------------------------------------------

export async function buildWorks(ctx: AliveCtx): Promise<AlivePart> {
  const root = new THREE.Group();
  root.name = "works";
  ctx.group.add(root);
  const nav = ctx.city.nav;
  // free courtyards found in the plan (block west of the heart; Wall Street)
  const specs: SiteSpec[] = [
    { x0: -73.2, x1: -65.7, z0: -30.6, z1: -14.1, floors: 8, jib: 22, counter: 8, sign: "ZEC BUILD" },
    { x0: 136.8, x1: 146.3, z0: 11.4, z1: 23.4, floors: 6, jib: 17, counter: 6, sign: "SHIELDED CO." },
  ];
  const sites: Site[] = [];
  for (const s of specs) {
    const cx = (s.x0 + s.x1) / 2,
      cz = (s.z0 + s.z1) / 2;
    // only where the courtyard really is free
    if (!nav.free(cx, cz, 1) || !nav.free(cx, s.z0 + 2, 1) || !nav.free(cx, s.z1 - 2, 1)) continue;
    const site = new Site(s);
    root.add(site.root);
    sites.push(site);
    await new Promise((r) => setTimeout(r, 0));
  }

  // window cleaners on the tallest supertall: its roof found by casting down onto it (the outer
  // city's buildings stream in a few seconds after the city is built: wait for them)
  for (let i = 0; i < 60 && ctx.city.facades.filter((fa) => fa.ext).length < 300; i++) await new Promise((r) => setTimeout(r, 500));
  let cleaners: Cleaners | null = null;
  const tall = ctx.city.facades.filter((fa) => fa.type === "office" && (fa.face === "s" || fa.face === "n") && fa.x1 - fa.x0 > 6).sort((a, b) => b.height - a.height);
  const ray = new THREE.Raycaster();
  // only the city's meshes (no sprites, nothing of the living layer)
  const targets: THREE.Object3D[] = [];
  ctx.city.group.traverse((o) => {
    if (o === ctx.group) return;
    if ((o as THREE.Mesh).isMesh && !isIn(o, ctx.group)) targets.push(o);
  });
  for (const fa of tall.slice(0, 3)) {
    const out = fa.face === "s" ? 1 : -1;
    const hits: number[] = [];
    for (const k of [0.2, 0.3, 0.7, 0.8]) {
      const x = fa.x0 + (fa.x1 - fa.x0) * k;
      ray.set(new THREE.Vector3(x, 400, fa.z - out * 1.2), new THREE.Vector3(0, -1, 0));
      ray.far = 420;
      const h = ray.intersectObjects(targets, false).find((i) => i.object.visible);
      if (h) hits.push(h.point.y);
    }
    if (hits.length < 2) continue;
    hits.sort((a, b) => a - b);
    const roof = hits[0];
    if (roof < 30) continue;
    cleaners = new Cleaners(fa.x0 + 1, fa.x1 - 1, fa.z, fa.face as "s" | "n", roof);
    root.add(cleaners.root);
    break;
  }
  // picking on the map never needs to test any of this
  root.traverse((o) => (o.raycast = () => {}));
  console.log("[alive] works", sites.length, "sites", cleaners ? `cleaners at ${cleaners.centre.x.toFixed(0)},${cleaners.centre.z.toFixed(0)}` : "no cleaners");

  return {
    update(f) {
      for (const s of sites) {
        const d = Math.hypot(s.centre.x - f.focus.x, s.centre.z - f.focus.z);
        s.update(f, f.wide ? d < 260 : d < 200);
      }
      if (cleaners) {
        const d = Math.hypot(cleaners.centre.x - f.focus.x, cleaners.centre.z - f.focus.z);
        cleaners.update(f, d < (f.wide ? 260 : 200));
      }
    },
  };
}
