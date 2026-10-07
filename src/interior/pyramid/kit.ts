import * as THREE from "three";
import { ZScan } from "../../data/zscan";
import { Snark, loadArt } from "../../scene/snark";
import { place } from "../furniture";
import type { InteriorContext, PickInfo, Rect } from "../types";
import { Geo, type Lighting, type Torch } from "./geo";
import { torch as torchModel } from "./models";
import { cobweb, coinFace, flagstones, glowDot, granite, hieroglyphs, sandstone, slabs } from "./tex";

/**
 * The pyramid's shared kit: one group per level (only the one you are on is drawn), colliders,
 * ticks, people, pickables, the stone materials (world-UV textures × baked torchlight), the
 * torches with their flames and halos, and hieroglyph panels from the atlas.
 */

/**
 * The levels are one continuous building: the ascending passage climbs 4 m from the labyrinth to
 * the Grand Gallery's foot, the gallery climbs 14 m more to the King's Chamber, the descending
 * passage drops 5 m from the entrance gallery to the subterranean chamber (see ./index.ts).
 */
export const FLOORS = [
  { label: "0", name: "Labyrinth · entrance gallery", y: 0 },
  { label: "1", name: "Grand Gallery", y: 4 },
  { label: "2", name: "King's Chamber · the treasure", y: 18 },
  { label: "−1", name: "Subterranean chamber · the pit", y: -5 },
];

export type Tick = (dt: number, t: number, cam: THREE.Camera) => void;
export type PickFn = (hit: THREE.Intersection) => PickInfo | null;

export const TORCH = new THREE.Color(1.2, 0.8, 0.48);

/** The coin's face lies sideways on the turned cylinder: turn it back. */
const turned = (make: () => THREE.Texture) => () => {
  const t = make();
  t.center.set(0.5, 0.5);
  t.rotation = -Math.PI / 2;
  return t;
};

const texCache: Record<string, THREE.Texture> = {};
const T = (k: string, make: () => THREE.Texture) => (texCache[k] ??= make());

export class PyramidKit {
  readonly groups = FLOORS.map(() => new THREE.Group());
  readonly rects: Rect[][] = FLOORS.map(() => []);
  readonly ticks: Tick[][] = FLOORS.map(() => []);
  readonly people: Snark[][] = FLOORS.map(() => []);
  readonly torches: Torch[][] = FLOORS.map(() => []);
  /** Where each torch hangs and which way its wall faces (for the brackets and flames). */
  private flames: { p: THREE.Vector3; n: THREE.Vector3 }[][] = FLOORS.map(() => []);
  readonly pickables: THREE.Object3D[] = [];
  readonly picks = new Map<THREE.Object3D, PickFn>();
  readonly hovers = new Map<THREE.Object3D, string>();
  readonly floorOf = new Map<THREE.Object3D, number>();
  current = 0;

  // ---- materials
  readonly glyphs = hieroglyphs();
  readonly stone = new THREE.MeshStandardMaterial({ map: T("sand", () => sandstone()), vertexColors: true, roughness: 0.93 });
  readonly stoneDark = new THREE.MeshStandardMaterial({ map: T("sand2", () => sandstone([150, 118, 82], 4)), vertexColors: true, roughness: 0.95 });
  readonly floor = new THREE.MeshStandardMaterial({ map: T("flag", () => flagstones()), vertexColors: true, roughness: 0.9 });
  readonly ceiling = new THREE.MeshStandardMaterial({ map: T("slab", () => slabs()), vertexColors: true, roughness: 0.95 });
  readonly granite = new THREE.MeshStandardMaterial({ map: T("gran", () => granite()), vertexColors: true, roughness: 0.55, metalness: 0.05 });
  readonly panel = new THREE.MeshStandardMaterial({ map: this.glyphs.texture, vertexColors: true, roughness: 0.85 });
  /** Moving stone (the trap's door): no baked light. */
  readonly stoneLoose = new THREE.MeshStandardMaterial({ map: T("sand", () => sandstone()), roughness: 0.93, color: "#9a8a72" });
  readonly wood = new THREE.MeshStandardMaterial({ color: "#6a4a2c", roughness: 0.8, vertexColors: true });
  readonly gold = new THREE.MeshStandardMaterial({ color: "#f4b728", roughness: 0.28, metalness: 1, emissive: "#5a3a00", emissiveIntensity: 0.6 });
  readonly coinMats = [this.gold, new THREE.MeshStandardMaterial({ map: T("coin", turned(coinFace)), emissiveMap: T("coin", turned(coinFace)), emissive: "#ffffff", emissiveIntensity: 0.35, roughness: 0.3, metalness: 0.9 })];
  readonly halo = T("halo", () => glowDot());
  readonly web = T("web", cobweb);

  constructor(
    readonly ctx: InteriorContext,
    readonly scene: THREE.Scene,
  ) {
    for (const g of this.groups) scene.add(g);
  }

  y(f: number) {
    return FLOORS[f].y;
  }

  /**
   * A level built round its own origin moved into place: its group, its colliders and its lights
   * (the bake is done by then, in the level's own coordinates; flames live in the group).
   */
  shift(f: number, dx: number, dz: number) {
    this.groups[f].position.set(dx, 0, dz);
    for (const r of this.rects[f]) {
      r[0] += dx;
      r[2] += dx;
      r[1] += dz;
      r[3] += dz;
    }
    for (const t of this.torches[f]) t.p = t.p.clone().add(new THREE.Vector3(dx, 0, dz));
  }

  pick(f: number, o: THREE.Object3D, hover: string, info: PickFn) {
    this.pickables.push(o);
    this.floorOf.set(o, f);
    this.hovers.set(o, hover);
    this.picks.set(o, info);
  }

  /**
   * A torch on a wall: `at` is the point on the wall face (y included), `n` the face's normal.
   * It lights the bake (reach `r`) and gets a bracket, a flame and a halo.
   */
  torch(f: number, at: THREE.Vector3, n: THREE.Vector3, cell = -1, r = 6.5) {
    const p = at.clone().addScaledVector(n, 0.17);
    p.y += 0.8;
    this.torches[f].push({ p, color: TORCH, r, cell });
    this.flames[f].push({ p, n: n.clone() });
    place(this.groups[f], "pyr-torch", torchModel, at.x + n.x * 0.12, at.y, at.z + n.z * 0.12, Math.atan2(n.x, n.z));
  }

  /** A light for the bake only (braziers, the gold), no flame. */
  glow(f: number, p: THREE.Vector3, color: THREE.Color, r = 6, cell = -1) {
    this.torches[f].push({ p, color, r, cell });
  }

  /**
   * A hieroglyph panel (atlas panel `i`) on a wall face: centred at `at` (bottom-centre point on
   * the face), facing `n`, w × h metres.
   */
  panelOn(geo: Geo, i: number, at: THREE.Vector3, n: THREE.Vector3, w = 0.9, h = 1.8) {
    const right = new THREE.Vector3(n.z, 0, -n.x);
    const o = at.clone().addScaledVector(right, -w / 2).addScaledVector(n, 0.012);
    geo.quad(o, right.multiplyScalar(w), new THREE.Vector3(0, h, 0), 0.6, this.glyphs.rects[i % this.glyphs.rects.length]);
  }

  /** Cobweb in a top corner: `at` the corner point, spanning towards `a` and `b` (unit vectors). */
  cobweb(f: number, at: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3, size = 0.9) {
    const g = new THREE.BufferGeometry();
    const p1 = at.clone().addScaledVector(a, size),
      p2 = at.clone().addScaledVector(b, size).addScaledVector(new THREE.Vector3(0, -1, 0), size * 0.3);
    g.setAttribute("position", new THREE.Float32BufferAttribute([at.x, at.y, at.z, p1.x, p1.y, p1.z, p2.x, p2.y, p2.z, p1.x, p1.y - size * 0.4, p1.z], 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute([0, 1, 1, 1, 0, 0, 1, 0.6], 2));
    g.setIndex([0, 1, 2, 1, 3, 2]);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: this.web, transparent: true, depthWrite: false, side: THREE.DoubleSide, opacity: 0.55, color: "#8a8070" }));
    m.raycast = () => {};
    this.groups[f].add(m);
  }

  /**
   * Flames and halos for every torch of a floor, animated: call once the floor's torches are all
   * placed.
   */
  lightUp(f: number) {
    const list = this.flames[f];
    if (!list.length) return;
    const geo = new THREE.OctahedronGeometry(0.1, 0);
    const outer = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 1.3, 0.3), toneMapped: false, transparent: true, opacity: 0.9 }), list.length);
    const inner = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: new THREE.Color(3.4, 2.6, 1.2), toneMapped: false }), list.length);
    outer.raycast = inner.raycast = () => {};
    const pos = new Float32Array(list.length * 3);
    list.forEach((l, i) => pos.set([l.p.x, l.p.y + 0.12, l.p.z], i * 3));
    const pg = new THREE.BufferGeometry();
    pg.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const haloMat = new THREE.PointsMaterial({ map: this.halo, size: 2.2, color: new THREE.Color(1, 0.62, 0.3), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.55 });
    const halos = new THREE.Points(pg, haloMat);
    halos.raycast = () => {};
    this.groups[f].add(outer, inner, halos);
    const m = new THREE.Matrix4(),
      q = new THREE.Quaternion(),
      s = new THREE.Vector3(),
      v = new THREE.Vector3();
    this.ticks[f].push((_dt, t) => {
      list.forEach((l, i) => {
        const a = Math.sin(t * 13 + i * 3.1) * 0.5 + Math.sin(t * 7.3 + i) * 0.5;
        const b = Math.sin(t * 17 + i * 1.7);
        q.setFromAxisAngle(v.set(0, 1, 0), t * 2 + i);
        s.set(1.05 + b * 0.1, 2.3 + a * 0.45, 1.05 - b * 0.1);
        m.compose(v.set(l.p.x + b * 0.015, l.p.y + 0.1 + a * 0.02, l.p.z), q, s);
        outer.setMatrixAt(i, m);
        s.multiplyScalar(0.55);
        m.compose(v.set(l.p.x, l.p.y + 0.06, l.p.z), q, s);
        inner.setMatrixAt(i, m);
      });
      outer.instanceMatrix.needsUpdate = inner.instanceMatrix.needsUpdate = true;
      haloMat.opacity = 0.5 + Math.sin(t * 11) * 0.05 + Math.sin(t * 23) * 0.04;
    });
  }

  /** The torches of a floor as light points (for the real lights that follow the walker). */
  lightsOf(f: number) {
    return this.torches[f];
  }

  /** Bake helper: stone geometry → mesh in a floor group. */
  add(f: number, geo: Geo, mat: THREE.Material, light: Lighting, m?: THREE.Matrix4) {
    if (geo.empty) return null;
    const mesh = geo.mesh(mat, light, m);
    this.groups[f].add(mesh);
    return mesh;
  }

  /** A zkSNARK standing (or sitting) somewhere; it talks when clicked (handled by the street). */
  async person(f: number, id: number, at: [number, number], role: string, o: { face?: THREE.Vector3; y?: number; sit?: boolean } = {}) {
    try {
      const s = new Snark(id, await loadArt(id));
      s.noClip = true;
      s.state = "resident";
      s.role = role;
      s.root.position.set(at[0], o.y ?? FLOORS[f].y, at[1]);
      s.faceDir = o.face ?? new THREE.Vector3(0, 0, 1);
      if (o.sit) s.sit(true);
      this.groups[f].add(s.root);
      this.people[f].push(s);
      return s;
    } catch {
      return null;
    }
  }

  portrait(id: number) {
    return ZScan.zkSnarkImage(id);
  }
}
