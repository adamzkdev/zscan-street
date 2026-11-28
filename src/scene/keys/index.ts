import * as THREE from "three";
import { carObject, type CarKind } from "../real/cars";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { City } from "../city";
import { BAY, CURB } from "../city/plan";
import { F, type Land } from "../forest/land";
import { markingsTexture, neonTexture, releaseAfterUpload } from "../textures";
import { GROUND, terrainMat } from "../real/ground";
import { plantTrees, type Species } from "../real/trees";
import { placeProps } from "../real/props";
import { keysMat } from "../real/keysmats";
import type { KSlot } from "../real/keysreal";
import { beachY, corridor, inKeys, inVilla, KEYS, KGRID, KPARK, KPIER, kLots, kStreets, KTUNNEL, KX, shoreDist, VILLA, villaFloor, villaPool } from "./plan";
import { buildVilla } from "./villa";
import { KeysSea } from "./sea";
import type { KGeo, KOut } from "./worker";

/**
 * ORCHARD KEYS on the main thread (src/scene/keys): the ground (the hill behind the town where the
 * headland's woods come down, the beaches all round, sand into the sea), the streets and the raised
 * blocks with their kerbs, the promenade, the tunnel's road — and, when the worker has built them,
 * the voxel houses, shops, hotels, palms, lamps, cars, huts and the pier, with their neon signs.
 * What the walker and the cars need from it: the ground's height, what stops a body, the shops' doors.
 */

/** The town's inner box (streets and blocks), where the ground is drawn by them, not the terrain. */
const TOWN = { x0: KGRID.west, x1: KGRID.east, z0: KGRID.north, z1: KGRID.south };
const inTown = (x: number, z: number) => x > TOWN.x0 && x < TOWN.x1 && z > TOWN.z0 && z < TOWN.z1;
/** The tunnel's concrete either side of the inside (m), and its height. */
const SHELL = 4;
const SHELL_TOP = KTUNNEL.top + 4.1;
/** The wing walls either side of the south portal reach this far from the road's centre (m). */
const WING = 22;
/**
 * Orchard Boulevard (14 m) is wider than the tunnel (11.2 m inside): over FUNNEL m before the south
 * portal two low concrete barriers taper it in, and a car is eased along them into the tube instead
 * of meeting the wing wall head on. The barrier's inner face at z: KX ± funnelAt(z).
 * (Only up to Note Street's kerb line: the barriers once ran on across the junction and closed Note
 * Street off from the boulevard — your car held back at them, the loops' cars driving through them.)
 */
const FUNNEL = KGRID.zs[0] - KGRID.zw[0] / 2 - KTUNNEL.z1 - 0.4;
const funnelAt = (z: number) => {
  const t = Math.min(1, Math.max(0, (z - KTUNNEL.z1) / FUNNEL));
  return KTUNNEL.half + (KGRID.xw[1] / 2 - KTUNNEL.half) * t * t * (3 - 2 * t);
};

export interface KeysFacade {
  type: string;
  name: string;
  face: "n" | "s" | "e" | "w";
  x0: number;
  x1: number;
  z: number;
  out: THREE.Vector3;
  door: { x: number; z: number };
}

export class Keys {
  readonly group = new THREE.Group();
  done = false;
  readonly ready: Promise<void>;
  readonly sea: KeysSea;
  facades: KeysFacade[] = [];
  palms: { x: number; z: number }[] = [];
  /** The parked cars along its streets (the game can take them: main.ts hands them to Parking). */
  parkedCars: { obj: THREE.Group; kind: CarKind }[] = [];
  /** Your villa on the north point (./villa.ts), and its house (hidden from its own rooms' view of the city). */
  readonly villa: THREE.Group;
  readonly villaHouse: THREE.Group;
  private land: Land | null;
  /** The ground's height every metre over the town's box (NaN: open sea, or the town's own slabs). */
  private hgt: Float32Array;
  private nx: number;
  private nz: number;
  /** The lots' footprints (for the walker without the game's solid shape). */
  private lots: { x0: number; x1: number; z0: number; z1: number }[] = [];
  /** Trunks, posts, rocks and the letters, by 4 m cell (x, z, radius). */
  private circles = new Map<number, [number, number, number][]>();

  constructor(city: City, land: Land | null, private day: () => boolean) {
    this.land = land;
    this.group.name = "keys";
    this.nx = Math.ceil(KEYS.x1 - KEYS.x0) + 1;
    this.nz = Math.ceil(KEYS.z1 - KEYS.z0) + 1;
    this.hgt = new Float32Array(this.nx * this.nz);
    for (let j = 0; j < this.nz; j++) for (let i = 0; i < this.nx; i++) this.hgt[i + j * this.nx] = this.height(KEYS.x0 + i, KEYS.z0 + j);
    this.group.add(this.terrain());
    // the sea round the town: clear over the sand, deeper blue further out, waves and foam
    // (north of the town: the strait the Golden Gate spans — deep water, and the woods' own shores)
    this.sea = new KeysSea((x, z) => {
      if (z >= KEYS.z0) return this.ground(x, z);
      if (this.land && x > F.x0 && x < F.x1 && z > F.z0) return this.land.raw(x, z);
      return BAY.bed - 4;
    }, day);
    this.group.add(this.sea.mesh);
    this.streets();
    // your villa (src/gta/home.ts), on its plot raised over the north beach
    const v = buildVilla(city.lamps);
    this.villa = v.group;
    this.villaHouse = v.house;
    this.group.add(v.group);
    for (const c of v.circles) {
      const k = cellKey(c[0], c[1]);
      (this.circles.get(k) ?? this.circles.set(k, []).get(k)!).push(c);
    }
    for (const l of kLots()) {
      const along = l.face === "n" || l.face === "s";
      const hw = (along ? l.w : l.d) / 2,
        hd = (along ? l.d : l.w) / 2;
      this.lots.push({ x0: l.x - hw, x1: l.x + hw, z0: l.z - hd, z1: l.z + hd });
    }
    city.group.add(this.group);
    this.ready = this.build(city);
  }

  // ---- the ground -----------------------------------------------------------------------------------

  /** The forest's ground at its south edge (the column tops, as it draws them), for the hill to meet. */
  private edge(x: number) {
    if (!this.land || x < F.x0 + 0.5 || x > F.x1 - 0.5) return null;
    const h = this.land.raw(x, F.z1 - 0.5);
    return Math.round(h / 0.25) * 0.25;
  }

  /** The ground's height at (x, z) before the town's slabs: hill, beach, sea floor. */
  private height(x: number, z: number) {
    const s = shoreDist(x, z);
    let h = beachY(s);
    // the hill behind the town: from the woods' edge down to the foot of the town
    if (z < TOWN.z0) {
      const e = this.edge(Math.min(F.x1 - 0.5, Math.max(F.x0 + 0.5, x)));
      if (e !== null) {
        // west and east of the woods it falls away to the shore
        const fade = x < F.x0 ? Math.max(0, 1 - (F.x0 - x) / 12) : x > F.x1 ? Math.max(0, 1 - (x - F.x1) / 18) : 1;
        const t = Math.max(0, Math.min(1, (TOWN.z0 - z) / (TOWN.z0 - F.z1)));
        const k = t * t * (3 - 2 * t);
        const n = (Math.sin(x * 0.21) * 0.6 + Math.sin(x * 0.07 + z * 0.3) * 0.5) * k * (1 - k) * 4;
        h = Math.max(h, CURB + (e - CURB) * k * fade + n * fade);
      }
      // round the tunnel the headland stands as a bluff over its portal, held back by the wing walls
      const dx = Math.abs(x - KX);
      if (dx < WING + 16) {
        const near = dx < WING ? 1 : 1 - (dx - WING) / 16;
        const drop = z < KTUNNEL.z1 - 0.9 ? 1 : Math.max(0, 1 - (z - (KTUNNEL.z1 - 0.9)) / 0.6);
        h = Math.max(h, CURB + (SHELL_TOP + 0.3 - CURB) * near * near * (3 - 2 * near) * drop);
      }
    }
    // your villa's plot: raised to the street's level over the north beach (its court and gardens
    // just over this; its terrace, pool and dock stand on their own sea wall out in the strait, north
    // of this grid, the yacht's berth beyond it in the strait's deep water)
    if (inVilla(x, z, 0.6)) return CURB - 0.1;
    // (between the woods' shore and the plot's west sea wall the hill's foot goes down into the strait,
    // under water by the town's north edge: no bank cut off where this grid ends)
    if (x > F.x1 - 1 && x < VILLA.x0 + 1 && z < 624) {
      const k = Math.max(0, Math.min(1, (z - KEYS.z0) / (624 - KEYS.z0)));
      const low = BAY.water - 2.4;
      h = Math.min(h, low + (h - low) * k * k * (3 - 2 * k));
    }
    return h;
  }

  /** The ground's height (bilinear over the metre grid). */
  ground(x: number, z: number) {
    const fx = Math.max(0, Math.min(this.nx - 1.001, x - KEYS.x0)),
      fz = Math.max(0, Math.min(this.nz - 1.001, z - KEYS.z0));
    const i = Math.floor(fx),
      j = Math.floor(fz);
    const u = fx - i,
      v = fz - j;
    const H = this.hgt,
      N = this.nx;
    const a = H[i + j * N],
      b = H[i + 1 + j * N],
      c = H[i + (j + 1) * N],
      d = H[i + 1 + (j + 1) * N];
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }

  /** The hill, the beaches and the sea floor round the town, one mesh of vertex colours. */
  private terrain() {
    const pos: number[] = [],
      col: number[] = [];
    const c = new THREE.Color();
    const sand = new THREE.Color("#ecd9a8"),
      wet = new THREE.Color("#b89e6e"),
      grass = new THREE.Color("#5f8f45"),
      dark = new THREE.Color("#4a7c3a"),
      gold = new THREE.Color("#a8a060"),
      rock = new THREE.Color("#8a8478"),
      foam = new THREE.Color("#f4f2ea"),
      sea = new THREE.Color("#6f8f7c");
    const tint = (x: number, z: number, y: number) => {
      const s = shoreDist(x, z);
      const slope = Math.max(Math.abs(this.ground(x + 1, z) - this.ground(x - 1, z)), Math.abs(this.ground(x, z + 1) - this.ground(x, z - 1))) / 2;
      const n = Math.sin(x * 0.7) * Math.cos(z * 0.55) * 0.04 + Math.sin((x + z) * 1.3) * 0.02;
      // (the foam is the water's own now: here the sand darkens where the waves wet it, and under the water)
      if (y < BAY.water + 0.22 && y > BAY.water - 0.08) c.copy(wet).lerp(foam, 0.08);
      else if (y > CURB + 0.6 || (z < TOWN.z0 + 2 && s > 10)) {
        const patch = Math.sin(x * 0.19 + z * 0.07) * Math.cos(z * 0.23 - x * 0.05);
        c.copy(slope > 1.1 ? rock : grass).lerp(dark, Math.max(0, patch) * 0.6).lerp(gold, Math.max(0, -patch) * 0.35);
      } else if (y <= BAY.water - 0.08) c.copy(wet).lerp(sea, Math.min(0.55, (BAY.water - y) / 5));
      else c.copy(sand).lerp(wet, Math.min(0.5, Math.max(0, (BAY.water + 0.9 - y) / 2.2)));
      return c.multiplyScalar(1 + n);
    };
    const S = 1;
    for (let x = KEYS.x0; x < KEYS.x1; x += S)
      for (let z = KEYS.z0; z < KEYS.z1; z += S) {
        const cx = x + S / 2,
          cz = z + S / 2;
        // the woods have their own ground; the town draws its own
        if (cz < F.z1 && cx > F.x0 && cx < F.x1) continue;
        if (inTown(cx, cz) && !(cz < TOWN.z0 + 0.01)) continue;
        // the road out of the tunnel to the first street: the town's asphalt
        if (Math.abs(cx - KX) < KTUNNEL.half + 1.2 && cz > KTUNNEL.z1 - 0.6 && cz < TOWN.z0 + 1) continue;
        const ys = [this.ground(x, z), this.ground(x, z + S), this.ground(x + S, z), this.ground(x + S, z + S)];
        // (the floor under the clear water — the sand and the shelf show through it — but not where
        // it is deep enough for the water to hide it)
        if (Math.max(...ys) < BAY.water - 2.7) continue;
        const q = [
          [x, z, ys[0]],
          [x, z + S, ys[1]],
          [x + S, z, ys[2]],
          [x + S, z, ys[2]],
          [x, z + S, ys[1]],
          [x + S, z + S, ys[3]],
        ];
        for (const [px, pz, py] of q) {
          pos.push(px, py, pz);
          const k = tint(px, pz, py);
          col.push(k.r, k.g, k.b);
        }
      }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, terrainMat());
    mesh.receiveShadow = true;
    mesh.name = "keys:ground";
    return mesh;
  }

  // ---- the streets and the blocks ----------------------------------------------------------------------

  private streets() {
    const day = this.day();
    const roadMats = new Map<number, THREE.MeshStandardMaterial>();
    // (realistic: photographed asphalt in the world's metres and the paint over it, src/scene/real/ground.ts)
    void day;
    const roadMat = (width: number) => {
      let m = roadMats.get(width);
      if (m) return m;
      m = GROUND.asphalt(markingsTexture(16, width, [], width >= 12 ? 4 : 2));
      roadMats.set(width, m);
      return m;
    };
    const parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
    const add = (m: THREE.Material, g: THREE.BufferGeometry) => (parts.get(m) ?? parts.set(m, []).get(m)!).push(g.index ? g.toNonIndexed() : g);
    /** A strip of tarmac along x or z (its texture along the street, every 16 m). */
    const strip = (axis: "x" | "z", at: number, from: number, to: number, width: number, y: number) => {
      const len = to - from;
      const geo = new THREE.PlaneGeometry(len, width);
      const uv = geo.getAttribute("uv");
      for (let i = 0; i < uv.count; i++) uv.setX(i, (uv.getX(i) * len) / 16);
      geo.rotateX(-Math.PI / 2);
      if (axis === "z") geo.rotateY(Math.PI / 2);
      const mid = (from + to) / 2;
      return axis === "x" ? geo.translate(mid, y, at) : geo.translate(at, y, mid);
    };
    for (const s of kStreets()) add(roadMat(s.width), strip(s.axis, s.at, s.from, s.to, s.width, 0.011 + (s.axis === "z" ? 0.002 : 0)));
    // the corridor: the tunnel's road and the bit of headland road before it
    // (painted for two lanes each way, as the traffic runs through it: a double yellow, broken lane lines)
    add(GROUND.asphalt(markingsTexture(16, KTUNNEL.half * 2 - 2, [], 4)), strip("z", KX, KTUNNEL.z0 - 0.4, KTUNNEL.z1 + 0.2, KTUNNEL.half * 2 - 2, 0.03));
    // under it all, a floor the colour of the asphalt (no glimpse of the sea through a seam)
    const under = new THREE.PlaneGeometry(TOWN.x1 - TOWN.x0, TOWN.z1 - TOWN.z0).rotateX(-Math.PI / 2).translate((TOWN.x0 + TOWN.x1) / 2, -0.02, (TOWN.z0 + TOWN.z1) / 2);
    add(GROUND.asphalt(), under);
    // the blocks: raised, paved, their kerbs (world-space UVs: a 2 m slab grid)
    const paving = [GROUND.plaza(), GROUND.pavement(), GROUND.pavement()];
    const curbM = GROUND.kerb();
    const lawn = GROUND.lawn();
    const slab = (x0: number, x1: number, z0: number, z1: number, m: THREE.Material, top = CURB) => {
      const g = new THREE.BoxGeometry(x1 - x0, top + 0.4, z1 - z0);
      // world-space UVs on the top: a slab every 2 m
      const p = g.getAttribute("position"),
        uv = g.getAttribute("uv");
      for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) + (x0 + x1) / 2) / 2 + (p.getY(i) * 0.5), (p.getZ(i) + (z0 + z1) / 2) / 2);
      add(m, g.translate((x0 + x1) / 2, (top - 0.4) / 2, (z0 + z1) / 2));
    };
    const kerb = (x0: number, x1: number, z0: number, z1: number) => {
      const t = 0.18;
      for (const g of [
        new THREE.BoxGeometry(x1 - x0, CURB + 0.03, t).translate((x0 + x1) / 2, (CURB + 0.03) / 2, z0 + t / 2),
        new THREE.BoxGeometry(x1 - x0, CURB + 0.03, t).translate((x0 + x1) / 2, (CURB + 0.03) / 2, z1 - t / 2),
        new THREE.BoxGeometry(t, CURB + 0.03, z1 - z0).translate(x0 + t / 2, (CURB + 0.03) / 2, (z0 + z1) / 2),
        new THREE.BoxGeometry(t, CURB + 0.03, z1 - z0).translate(x1 - t / 2, (CURB + 0.03) / 2, (z0 + z1) / 2),
      ])
        add(curbM, g);
    };
    const G = KGRID;
    const xe = [G.west, ...G.xs.flatMap((x, i) => [x - G.xw[i] / 2, x + G.xw[i] / 2]), G.east];
    const ze = [G.north, ...G.zs.flatMap((z, i) => [z - G.zw[i] / 2, z + G.zw[i] / 2]), G.south];
    let k = 0;
    for (let a = 0; a < xe.length; a += 2)
      for (let b = 0; b < ze.length; b += 2) {
        let [x0, x1, z0, z1] = [xe[a], xe[a + 1], ze[b], ze[b + 1]];
        if (x1 - x0 < 0.5 || z1 - z0 < 0.5) continue;
        // (the north strip along the foot of the bluff is one run each side of the boulevard: below)
        if (b === 0) continue;
        // the beach drive's sea side: one promenade end to end
        if (b === ze.length - 2) {
          if (a > 0) continue;
          x1 = G.east;
        }
        const park = Math.abs((x0 + x1) / 2 - (KPARK.x0 + KPARK.x1) / 2) < 1 && Math.abs((z0 + z1) / 2 - (KPARK.z0 + KPARK.z1) / 2) < 1;
        slab(x0, x1, z0, z1, paving[k++ % 3]);
        if (park) slab(x0 + 2.5, x1 - 2.5, z0 + 2.5, z1 - 2.5, lawn, CURB + 0.004);
        kerb(x0, x1, z0, z1);
      }
    for (const [p, q] of [
      [G.west, KX - G.xw[1] / 2],
      [KX + G.xw[1] / 2, G.east],
    ]) {
      slab(p, q, G.north, G.zs[0] - G.zw[0] / 2, paving[k++ % 3]);
      kerb(p, q, G.north, G.zs[0] - G.zw[0] / 2);
    }
    // the north strip west and east of the town's blocks runs to the beach; the main road's kerbs to the tunnel
    for (const s of [-1, 1]) kerb(KX + s * (G.xw[1] / 2) - (s > 0 ? 0 : 0.18), KX + s * (G.xw[1] / 2) + (s > 0 ? 0.18 : 0), KTUNNEL.z1, G.north);
    // the south portal's wing walls, stepping down either side, holding the bluff back
    const conc = new THREE.MeshStandardMaterial({ color: "#a8a39a", roughness: 0.9 });
    conc.userData.dayColor = "#c4bfb5";
    conc.userData.nightColor = "#8a857c";
    for (const sd of [-1, 1])
      for (let k = 0; k < 6; k++) {
        const x0 = KX + sd * (KTUNNEL.half + SHELL - 0.2 + k * ((WING - KTUNNEL.half - SHELL) / 6)),
          x1 = KX + sd * (KTUNNEL.half + SHELL - 0.2 + (k + 1) * ((WING - KTUNNEL.half - SHELL) / 6) + 0.4);
        const top = SHELL_TOP + 0.4 - k * 0.9;
        add(conc, new THREE.BoxGeometry(Math.abs(x1 - x0), top + 0.3, 1.5).translate((x0 + x1) / 2, (top - 0.3) / 2, KTUNNEL.z1 - 0.45));
        add(conc, new THREE.BoxGeometry(Math.abs(x1 - x0) + 0.1, 0.3, 1.8).translate((x0 + x1) / 2, top, KTUNNEL.z1 - 0.45));
      }
    // the funnel's barriers: low concrete (New Jersey profile, as a box with a cap), in short straight runs
    // along the eased curve, with reflector posts on top
    const refl = new THREE.MeshStandardMaterial({ color: "#f5c542", roughness: 0.4, emissive: "#3a2a00" });
    for (const sd of [-1, 1])
      for (let k = 0; k < 9; k++) {
        const za = KTUNNEL.z1 + 0.3 + (k * (FUNNEL - 0.3)) / 9,
          zb = KTUNNEL.z1 + 0.3 + ((k + 1) * (FUNNEL - 0.3)) / 9;
        const xa = KX + sd * (funnelAt(za) + 0.3),
          xb = KX + sd * (funnelAt(zb) + 0.3);
        const len = Math.hypot(xb - xa, zb - za) + 0.05;
        const yaw = Math.atan2(xb - xa, zb - za);
        add(conc, new THREE.BoxGeometry(0.6, 0.8, len).rotateY(yaw).translate((xa + xb) / 2, 0.4, (za + zb) / 2));
        add(conc, new THREE.BoxGeometry(0.3, 0.12, len).rotateY(yaw).translate((xa + xb) / 2, 0.86, (za + zb) / 2));
        if (k % 4 === 0) add(refl, new THREE.BoxGeometry(0.12, 0.22, 0.04).translate(xa, 1.03, za));
      }
    // the promenade's wall on the sand side, with gaps for the steps down (and the pier)
    const wall = new THREE.MeshStandardMaterial({ color: "#f2eee6", roughness: 0.8 });
    for (let x = G.west; x < G.east; x += 12) {
      const gap = Math.abs(x + 6 - KPIER.x) < 7 || Math.round(x / 12) % 3 === 0;
      if (gap) continue;
      add(wall, new THREE.BoxGeometry(10, 0.55, 0.4).translate(x + 6, CURB + 0.27, G.south - 0.2));
    }
    for (const [m, list] of parts) {
      const mesh = new THREE.Mesh(mergeGeometries(list, false), m);
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      this.group.add(mesh);
    }
  }

  // ---- what the worker builds ---------------------------------------------------------------------------

  private async build(city: City) {
    const out = await new Promise<KOut>((resolve, reject) => {
      const w = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
      w.onmessage = (e) => {
        resolve(e.data as KOut);
        w.terminate();
      };
      w.onerror = (e) => reject(e);
      // (the ground's own heights: the sign and the trees on the bluff stand on them)
      const hgt = this.hgt.slice();
      w.postMessage({ hgt, nx: this.nx, nz: this.nz }, [hgt.buffer]);
    }).catch((e) => {
      console.warn("keys: the town could not be built", e);
      return null;
    });
    if (!out) return;
    // the town, realistic: a mesh per material slot and 64 m sector (src/scene/real/keysreal.ts, keysmats.ts)
    const flat = new Set<KSlot>(["neon", "water", "lawn", "path", "sand", "asphalt", "court", "shop"]);
    for (const ch of out.chunks) {
      for (const [k, d] of Object.entries(ch.geos) as [KSlot, KGeo][]) {
        const mesh = new THREE.Mesh(geometry(d), keysMat(k));
        // (standing at its sector's centre: what judges a mesh's size on screen measures from its origin)
        mesh.position.set(ch.centre[0], 0, ch.centre[1]);
        mesh.updateMatrix();
        mesh.castShadow = !flat.has(k);
        mesh.receiveShadow = k !== "neon";
        mesh.userData.kind = k;
        mesh.matrixAutoUpdate = false;
        this.group.add(mesh);
      }
    }
    // (nothing of the old north beach's layout on your villa's plot: its lamps lit up inside the house)
    const off = (x: number, z: number) => !inVilla(x, z, 1.5);
    for (const s of out.signs) if (off(s.x, s.z)) this.sign(s);
    for (const [x, y, z, color] of out.lights) if (off(x, z)) city.lamps.push({ pos: new THREE.Vector3(x, y, z), color, intensity: 10 });
    this.facades = out.facades.map((f) => ({
      type: f.type,
      name: f.name,
      face: f.face,
      x0: f.door[0],
      x1: f.door[0],
      z: f.door[1],
      out: new THREE.Vector3(f.out[0], 0, f.out[1]),
      door: { x: f.door[0], z: f.door[1] },
    }));
    this.palms = out.palms.filter(([x, z]) => off(x, z)).map(([x, z]) => ({ x, z }));
    // the palms, pines and bushes, realistic and instanced (src/scene/real/trees.ts)
    plantTrees(this.group, out.trees.filter(([x, , z]) => off(x, z)).map(([x, y, z, sp, seed]) => ({ x, y, z, species: sp as Species, seed })));
    placeProps(this.group, out.lamps.filter(([x, , z]) => off(x, z)).map(([x, y, z, yaw]) => ({ type: "lamp", args: ["#ffd9a0"], x, y, z, rot: yaw })));
    // the parked cars, realistic (shared bodies: a few kinds and paints)
    const PARKED = ["#ff7fb0", "#46c8e0", "#f4b728", "#2a2a34", "#d8333f", "#9fe0c8"];
    for (const [x, z, yaw, k] of out.cars) {
      const kinds = ["sedan", "convertible", "suv", "sports", "sedan", "pickup"] as const;
      const car = k >= PARKED.length ? carObject("taxi", { paint: "#f2c230" }) : carObject(kinds[k % kinds.length], { paint: PARKED[k] });
      car.position.set(x, 0.02, z);
      car.rotation.y = yaw;
      this.group.add(car);
      this.parkedCars.push({ obj: car, kind: k >= PARKED.length ? "taxi" : kinds[k % kinds.length] });
    }
    for (const c of out.circles) {
      if (!off(c[0], c[1])) continue;
      const k = cellKey(c[0], c[1]);
      (this.circles.get(k) ?? this.circles.set(k, []).get(k)!).push(c);
    }
    this.done = true;
    console.info(`keys: Orchard Keys built in ${out.ms} ms (worker), ${out.chunks.length} sectors`);
  }

  private sign(s: KOut["signs"][number]) {
    const { texture, aspect } = neonTexture(s.text, s.color, { vertical: s.vertical });
    releaseAfterUpload(texture);
    let w = s.w,
      h = s.w / aspect;
    if (h > s.h) {
      h = s.h;
      w = s.h * aspect;
    }
    const m = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false, color: new THREE.Color(1.15, 1.15, 1.15) });
    const geo = new THREE.PlaneGeometry(w, h);
    for (const side of s.both ? [1, -1] : [0]) {
      const p = new THREE.Mesh(geo, m);
      const yaw = s.yaw + (side < 0 ? Math.PI : 0);
      p.position.set(s.x, s.y, s.z).add(new THREE.Vector3(0, 0, 0.04).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw));
      p.rotation.y = yaw;
      p.userData.noField = true;
      this.group.add(p);
    }
  }

  // ---- what the walker and the cars ask ---------------------------------------------------------------------

  /** Is (x, z) the town's to rule on foot (its land, its beaches, the tunnel)? */
  owns(x: number, z: number) {
    // (your villa's plot, its sea half too: out in the strait past the town's box)
    if (inVilla(x, z, 0.6)) return true;
    if (corridor(x, z)) return z > KTUNNEL.z0 - 0.4;
    if (!inKeys(x, z)) return false;
    return z >= F.z1 || x < F.x0 || x > F.x1;
  }

  /**
   * On the pier's deck (between its rails, from the promenade's edge out to its end): the deck's
   * height there — a short ramp up from the promenade, then level — or null.
   */
  pierAt(x: number, z: number): number | null {
    const P = KPIER;
    if (Math.abs(x - P.x) > P.half - 0.35 || z < P.z0 - 2.5 || z > P.z1 - 0.6) return null;
    const k = Math.min(1, Math.max(0, (z - (P.z0 - 2.5)) / 5));
    return CURB + (P.y - CURB) * k;
  }

  /** The floor on foot off the town's pavements: the tunnel's, the beach, the hill (null: the kerb's). */
  groundAt(x: number, z: number): number | null {
    const pier = this.pierAt(x, z);
    if (pier !== null) return pier;
    if (corridor(x, z) && z > KTUNNEL.z0 - 0.4) return Math.abs(x - KX) < KTUNNEL.half - 0.85 ? 0.03 : 0.36;
    const vf = villaFloor(x, z);
    if (vf !== null) return vf;
    if (!this.owns(x, z) || inTown(x, z)) return null;
    return Math.max(BAY.water - 0.3, this.ground(x, z));
  }

  /** A trunk, a post, a rock or a letter within `r` of (x, z): the one, or null. */
  private circleAt(x: number, z: number, r: number) {
    const cx = Math.floor(x / 4),
      cz = Math.floor(z / 4);
    for (let i = -1; i <= 1; i++)
      for (let j = -1; j <= 1; j++)
        for (const c of this.circles.get((cx + i) * 4096 + cz + j) ?? []) if ((c[0] - x) ** 2 + (c[1] - z) ** 2 < (c[2] + r) ** 2) return c;
    return null;
  }

  /**
   * At the wheel: a palm's trunk, a lamp post, a rock is out of a car's way (the game's solid shape
   * lets thin things through): (p) pushed out of any within r. True if it was.
   */
  pushCar(p: THREE.Vector3, r: number) {
    // the tunnel's walls, for a car (under the hill the picture from above has nothing to stop it:
    // a car that strayed past the kerb found the hill's height and rode up the wall onto it)
    // (only in the tunnel itself: north of the town at these z there is the beach and your villa's forecourt)
    if (p.z > KTUNNEL.z0 - 1 && p.z < KTUNNEL.z1 + 0.5 && Math.abs(p.x - KX) < KTUNNEL.half + SHELL + 1) {
      const lim = KTUNNEL.half - r - 0.1;
      if (Math.abs(p.x - KX) > lim) {
        p.x = KX + Math.sign(p.x - KX) * lim;
        return true;
      }
    }
    // the funnel before the south portal: eased along its barriers (inside), or held off them (outside)
    if (p.z > KTUNNEL.z1 + 0.5 && p.z < KTUNNEL.z1 + FUNNEL + 0.5) {
      const inner = funnelAt(p.z),
        d = Math.abs(p.x - KX);
      if (d > inner - r - 0.1 && d < inner + 0.6 + r) {
        p.x = KX + Math.sign(p.x - KX) * (d < inner + 0.3 ? inner - r - 0.1 : inner + 0.6 + r);
        return true;
      }
    }
    if (!inKeys(p.x, p.z)) return false;
    const c = this.circleAt(p.x, p.z, r);
    if (!c) return false;
    const dx = p.x - c[0],
      dz = p.z - c[1];
    const d = Math.hypot(dx, dz) || 1e-3;
    const push = c[2] + r - d;
    p.x += (dx / d) * push;
    p.z += (dz / d) * push;
    return true;
  }

  /** On foot (without the game's solid shape): the sea, the hill's steep side, the tunnel's walls, a house. */
  blocked(x: number, z: number) {
    if (this.pierAt(x, z) !== null) return false;
    if (inVilla(x, z, 0.45)) return this.villaBlocked(x, z);
    if (this.circleAt(x, z, 0.25)) return true;
    if (corridor(x, z) && z > KTUNNEL.z0 - 0.4) return Math.abs(x - KX) > KTUNNEL.half - 0.3;
    if (inTown(x, z)) {
      for (const l of this.lots) if (x > l.x0 + 0.6 && x < l.x1 - 0.6 && z > l.z0 + 0.6 && z < l.z1 - 0.6) return true;
      return false;
    }
    const g = this.ground(x, z);
    if (g < BAY.water + 0.25) return true;
    const e = 0.5;
    const slope = Math.max(Math.abs(this.ground(x + e, z) - this.ground(x - e, z)), Math.abs(this.ground(x, z + e) - this.ground(x, z - e))) / (2 * e);
    return slope > 0.9;
  }

  /** The height under a car's wheel where the town's ground is not the street's (the tunnel, the sand, the hill), or null. */
  carSurface(x: number, z: number): number | null {
    if (corridor(x, z)) return z < KTUNNEL.z0 ? CURB + 0.02 : 0.03;
    const vf = villaFloor(x, z);
    if (vf !== null) return vf;
    if (!this.owns(x, z) || inTown(x, z)) return null;
    return this.ground(x, z);
  }

  /** On foot (without the game's solid shape), on your villa's plot: its walls, the house, the pool, the fountain, the palms. */
  private villaBlocked(x: number, z: number) {
    return villaWall(x, z) || !!this.circleAt(x, z, 0.25);
  }
}

const cellKey = (x: number, z: number) => Math.floor(x / 4) * 4096 + Math.floor(z / 4);

/** (Keys.villaBlocked: the walls, the house, the pool, what stands on the terrace) */
function villaWall(x: number, z: number) {
  const V = VILLA,
    H = V.house;
  const t = 0.45;
  if (x < V.x0 + t || x > V.x1 - t || z < V.z0 + t) return true;
  if (z > V.z1 - t && (x < V.gate.x0 || x > V.gate.x1)) return true;
  // (the porch before the house's front, between the entrance's blades: up to its door)
  const porch = x > V.hall.x0 + 0.3 && x < V.hall.x1 - 0.3 && z > V.door.z - 0.2;
  if (x > H.x0 - 0.3 && x < H.x1 + 0.3 && z > H.z0 - 0.3 && z < H.z1 + 0.3 && !porch) return true;
  // (the entrance's stone blades either side of the porch)
  if (z > H.z1 - 0.3 && z < H.z1 + 2.3 && ((x > V.hall.x0 - 1.5 && x < V.hall.x0 + 0.3) || (x > V.hall.x1 - 0.3 && x < V.hall.x1 + 1.5))) return true;
  // the fountain's basin, the cabana's walls, the fire pit, the kitchen's counters, the loggia's table (./villa.ts)
  if (Math.hypot(x - V.fountain.x, z - V.fountain.z) < V.fountain.r + 0.25) return true;
  if (x < 251.8 && z < 582.4) return true;
  if (z > 581.3 && z < 582.4 && x < 261.8) return true;
  if (Math.hypot(x - 308, z - 579) < 1.25) return true;
  if (x > 315.6 && x < 328.4 && z > 581.2 && z < 583) return true;
  if (x > 317.4 && x < 326.6 && z > 577.3 && z < 579.1) return true;
  if (x > 315.2 && x < 326.8 && z > 585.1 && z < 586.9) return true;
  return villaPool(x, z) !== null;
}

/** A half-float attribute over the worker's own array. */
function half(a: Uint16Array) {
  const at = new THREE.BufferAttribute(a, 3);
  Object.setPrototypeOf(at, THREE.Float16BufferAttribute.prototype);
  (at as unknown as { isFloat16BufferAttribute: boolean }).isFloat16BufferAttribute = true;
  return at;
}

function geometry(d: KGeo) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(d.pos, 3));
  g.setAttribute("normal", new THREE.BufferAttribute(d.nor, 3, true));
  g.setAttribute("uv", new THREE.BufferAttribute(d.uv, 2));
  g.setAttribute("color", half(d.col));
  g.setIndex(new THREE.BufferAttribute(d.idx, 1));
  g.computeBoundingSphere();
  return g;
}
