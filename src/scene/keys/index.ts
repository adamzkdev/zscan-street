import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { City } from "../city";
import { BAY, CURB } from "../city/plan";
import { addDetail } from "../detail";
import { F, type Land } from "../forest/land";
import { grassTexture, neonTexture, pavingTexture, releaseAfterUpload, roadTexture } from "../textures";
import { MATERIALS } from "../voxel/mesher";
import type { Kind } from "../voxel/model";
import { beachY, corridor, inKeys, KEYS, KGRID, KPARK, KPIER, kLots, kStreets, KTUNNEL, KX, shoreDist } from "./plan";
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
    this.sea = new KeysSea((x, z) => this.ground(x, z), day);
    this.group.add(this.sea.mesh);
    this.streets();
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
    const mesh = new THREE.Mesh(geo, addDetail(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.93 }), "paving"));
    mesh.receiveShadow = true;
    mesh.name = "keys:ground";
    return mesh;
  }

  // ---- the streets and the blocks ----------------------------------------------------------------------

  private streets() {
    const day = this.day();
    const roadMats = new Map<number, THREE.MeshStandardMaterial>();
    const roadMat = (width: number) => {
      let m = roadMats.get(width);
      if (m) return m;
      const lanes = width >= 12 ? 4 : 2;
      const night = roadTexture(16, width, [], lanes);
      night.wrapS = THREE.RepeatWrapping;
      const dayMap = () => {
        const t = roadTexture(16, width, [], lanes, true);
        t.wrapS = THREE.RepeatWrapping;
        return t;
      };
      m = addDetail(new THREE.MeshStandardMaterial({ map: night, roughness: 0.92, metalness: 0 }), "asphalt");
      m.userData.wet = true;
      m.userData.nightMap = night;
      m.userData.dayMap = dayMap;
      if (day) m.map = m.userData.dayTex = dayMap();
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
    add(roadMat(KTUNNEL.half * 2 - 2), strip("z", KX, KTUNNEL.z0 - 0.4, KTUNNEL.z1 + 0.2, KTUNNEL.half * 2 - 2, 0.03));
    // under it all, a floor the colour of the asphalt (no glimpse of the sea through a seam)
    const under = new THREE.PlaneGeometry(TOWN.x1 - TOWN.x0, TOWN.z1 - TOWN.z0).rotateX(-Math.PI / 2).translate((TOWN.x0 + TOWN.x1) / 2, -0.02, (TOWN.z0 + TOWN.z1) / 2);
    add(new THREE.MeshStandardMaterial({ color: "#3a3842", roughness: 0.95 }), under);
    // the blocks: raised, paved, their kerbs (world-space UVs: a 2 m slab grid)
    const paving = [44, 45, 46].map((seed) => {
      const night = pavingTexture(seed, 4);
      night.wrapS = night.wrapT = THREE.RepeatWrapping;
      const m = addDetail(new THREE.MeshStandardMaterial({ map: night, roughness: 0.72, metalness: 0.02, color: "#ffffff" }), "paving");
      const dayMap = () => {
        const t = pavingTexture(seed, 4, true);
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        return t;
      };
      m.userData.nightMap = night;
      m.userData.dayMap = dayMap;
      if (day) m.map = m.userData.dayTex = dayMap();
      return m;
    });
    const curbM = new THREE.MeshStandardMaterial({ color: day ? "#bdb9b3" : "#6d6876", roughness: 0.85 });
    curbM.userData.dayColor = "#bdb9b3";
    curbM.userData.nightColor = "#6d6876";
    const lawnT = grassTexture(14);
    lawnT.wrapS = lawnT.wrapT = THREE.RepeatWrapping;
    const lawn = addDetail(new THREE.MeshStandardMaterial({ map: lawnT, roughness: 0.95 }), "grass");
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
    for (const ch of out.chunks) {
      for (const [k, d] of Object.entries(ch.geos) as [Kind, KGeo][]) {
        const mesh = new THREE.Mesh(geometry(d), MATERIALS[k]);
        mesh.castShadow = k !== "emit";
        mesh.receiveShadow = k !== "emit";
        mesh.userData.kind = k;
        mesh.matrixAutoUpdate = false;
        this.group.add(mesh);
      }
    }
    for (const s of out.signs) this.sign(s);
    for (const [x, y, z, color] of out.lights) city.lamps.push({ pos: new THREE.Vector3(x, y, z), color, intensity: 10 });
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
    this.palms = out.palms.map(([x, z]) => ({ x, z }));
    for (const c of out.circles) {
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
    if (p.z > KTUNNEL.z0 - 1 && p.z < KTUNNEL.z1 + 0.5) {
      const lim = KTUNNEL.half - r - 0.1;
      if (Math.abs(p.x - KX) > lim) {
        p.x = KX + Math.sign(p.x - KX) * lim;
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
    if (!this.owns(x, z) || inTown(x, z)) return null;
    return this.ground(x, z);
  }
}

const cellKey = (x: number, z: number) => Math.floor(x / 4) * 4096 + Math.floor(z / 4);

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
  g.setAttribute("color", half(d.col));
  g.setIndex(new THREE.BufferAttribute(d.idx, 1));
  g.computeBoundingSphere();
  return g;
}
