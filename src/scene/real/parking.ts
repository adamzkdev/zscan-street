import * as THREE from "three";
import { carObject, type CarKind } from "./cars";
import { GLASS } from "./carkit";
import { CITY, GRID, LOTS, RIVER, ST, streetSegments } from "../city/plan";

/**
 * Cars parked at the kerbs of the city's wider streets (the GTA street: not every kerb empty), in the
 * kerb lane clear of the traffic's (which keeps to the middle of its half), never near a crossing,
 * a bus stop or a lot's own frontage; a few kinds and paints, shared bodies. They are the game's
 * like any car in the street: taken (nobody inside: you just get in), shoved by a crash, solid to a
 * walker. Orchard Keys' parked cars are listed here too (`adopt`).
 *
 * Drawn in batches: every parked car's meshes go into one BatchedMesh per material (the paints share
 * one white material per finish, the colour per instance; the glass is the dark opaque one — nobody
 * sits in a parked car), each car's parts culled on their own: 80 cars are about ten draws and no
 * thousand-odd objects for the renderer to walk every frame (each car was 20 of them). The car itself
 * (`obj`) is kept out of the scene, placed where it stands: taken or shoved, its instances go and it
 * is handed over whole, a live car.
 */

export interface Parked {
  obj: THREE.Group;
  kind: CarKind;
  /** Half its length and width (m). */
  hl: number;
  hw: number;
}

const KINDS: CarKind[] = ["sedan", "suv", "sedan", "pickup", "sports", "van", "sedan", "convertible", "suv", "taxi"];
const PAINTS = ["#c8ccd4", "#16161c", "#d62f2f", "#2a4a7a", "#e8e4dc", "#5a5c62", "#3a6a4a", "#8a2a3a", "#f4c430", "#46c8e0", "#ff7fb0", "#2a2a34"];
const WHITE = new THREE.Color(1, 1, 1);

interface Batch {
  mat: THREE.Material;
  cast: boolean;
  receive: boolean;
  colored: boolean;
  items: { car: Parked; geo: THREE.BufferGeometry; m: THREE.Matrix4; c: THREE.Color }[];
  mesh: THREE.BatchedMesh | null;
}

/** What a BatchedMesh needs all its geometries to share: the attributes (and their kinds) and the index or none. */
function signature(g: THREE.BufferGeometry) {
  const a = Object.keys(g.attributes)
    .sort()
    .map((k) => {
      const at = g.getAttribute(k) as THREE.BufferAttribute;
      return `${k}:${at.itemSize}:${at.normalized ? 1 : 0}:${(at.array as unknown as { constructor: { name: string } }).constructor.name}`;
    });
  return `${a.join(",")}|${g.index ? "i" : "n"}`;
}

/** The paints' white twins (one per set of the paint's other properties): the colour goes per instance. */
const whites = new Map<string, THREE.Material>();
function whiteOf(m: THREE.MeshStandardMaterial): THREE.Material {
  const p = m as THREE.MeshPhysicalMaterial;
  const key = `${m.type}|${m.metalness}|${m.roughness}|${p.clearcoat ?? 0}|${p.clearcoatRoughness ?? 0}|${m.envMapIntensity}`;
  let w = whites.get(key);
  if (!w) {
    w = m.clone();
    (w as THREE.MeshStandardMaterial).color.set(0xffffff);
    w.userData.shared = true;
    whites.set(key, w);
  }
  return w;
}

export class Parking {
  readonly group = new THREE.Group();
  readonly cars: Parked[] = [];
  private batches = new Map<string, Batch>();
  /** Where each car's instances are (to take them out when it leaves). */
  private slots = new Map<Parked, { b: Batch; id: number }[]>();
  private dirty = false;

  constructor(scene: THREE.Object3D) {
    this.group.name = "parked-cars";
    // (a parked car moves when it is taken or shoved: not part of the game's static solid shape)
    this.group.userData.noField = true;
    scene.add(this.group);
    let seed = 20261124;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    const crossX = GRID.xs.map((x, i) => [x, GRID.xw[i] / 2] as const),
      crossZ = GRID.zs.map((z, i) => [z, GRID.zw[i] / 2] as const);
    const nearCross = (v: number, list: readonly (readonly [number, number])[]) => list.some(([c, h]) => Math.abs(v - c) < h + 9);
    const inLot = (x: number, z: number) => LOTS.some((l) => x > l.x0 - 4 && x < l.x1 + 4 && z > l.z0 - 4 && z < l.z1 + 4);
    // (the streets with traffic of their own lanes: the ring, the boulevards, the avenue, the heart's)
    const busyZ = new Set([ST.ringN, ST.ringS, ST.blvdN, ST.north, ST.south]);
    const busyX = new Set([ST.ringW, ST.ringE, ST.blvdW, ST.blvdE, ST.heartW, ST.heartE]);
    for (const st of streetSegments()) {
      if (st.width < 13) continue;
      const busy = st.axis === "x" ? busyZ.has(st.at) : busyX.has(st.at);
      const half = st.width / 2;
      for (let a = st.from + 14 + rnd() * 10; a < st.to - 12; a += 9 + rnd() * 26) {
        if (st.axis === "x" ? nearCross(a, crossX) : nearCross(a, crossZ)) continue;
        if (st.axis === "z" && a > RIVER.z0 - 8 && a < RIVER.z1 + 8) continue;
        if (st.axis === "x" && Math.abs(st.at - (CITY.road.z0 + CITY.road.z1) / 2) < 6) continue;
        // the busy streets: one kerb in three; the quiet ones, most
        if (rnd() < (busy ? 0.7 : 0.35)) continue;
        const side = rnd() < 0.5 ? -1 : 1;
        const off = half - 1.15;
        const x = st.axis === "x" ? a : st.at + side * off,
          z = st.axis === "x" ? st.at + side * off : a;
        if (inLot(x, z) && rnd() < 0.6) continue;
        // facing the way its side's traffic goes (right-hand traffic: +x keeps to +z, +z keeps to −x)
        const yaw = st.axis === "x" ? (side > 0 ? 0 : Math.PI) : side < 0 ? -Math.PI / 2 : Math.PI / 2;
        const k = Math.floor(rnd() * KINDS.length);
        const kind = KINDS[k];
        const obj = carObject(kind, kind === "taxi" ? {} : { paint: PAINTS[Math.floor(rnd() * PAINTS.length)] });
        obj.position.set(x, 0.02, z);
        obj.rotation.y = yaw;
        this.add(obj, kind);
      }
    }
    this.rebuild();
  }

  /** Someone else's parked cars (Orchard Keys') join the list: out of their parent, drawn with the rest. */
  adopt(obj: THREE.Group, kind: CarKind) {
    obj.updateWorldMatrix(true, false);
    const p = new THREE.Vector3(),
      q = new THREE.Quaternion(),
      s = new THREE.Vector3();
    obj.matrixWorld.decompose(p, q, s);
    obj.removeFromParent();
    obj.position.copy(p);
    obj.quaternion.copy(q);
    obj.scale.copy(s);
    this.add(obj, kind);
    // (several come in a row: drawn again once, on the next frame's look)
    this.dirty = true;
    queueMicrotask(() => this.dirty && this.rebuild());
  }

  private add(obj: THREE.Group, kind: CarKind) {
    obj.userData.noField = true;
    obj.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(obj);
    const sz = box.getSize(new THREE.Vector3());
    const car: Parked = { obj, kind, hl: Math.max(sz.x, sz.z) / 2, hw: Math.min(sz.x, sz.z) / 2 };
    this.cars.push(car);
    // its meshes into the batches: by material and by the geometry's make-up
    obj.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || !m.visible) return;
      let mat = m.material as THREE.Material | THREE.Material[];
      // (a multi-material part: not batched — none of the parked kinds has one)
      if (Array.isArray(mat)) return;
      let color = WHITE;
      let colored = false;
      const slot = m.userData.kind as string | undefined;
      if (!Array.isArray(mat)) {
        if (slot === "glass" && (mat as THREE.Material).transparent) mat = GLASS;
        else if ((slot === "paint" || slot === "accent") && (mat as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
          color = (mat as THREE.MeshStandardMaterial).color.clone();
          mat = whiteOf(mat as THREE.MeshStandardMaterial);
          colored = true;
        }
      }
      const key = `${(mat as THREE.Material).uuid}|${signature(m.geometry)}|${m.castShadow ? 1 : 0}${m.receiveShadow ? 1 : 0}`;
      let b = this.batches.get(key);
      if (!b) this.batches.set(key, (b = { mat: mat as THREE.Material, cast: m.castShadow, receive: m.receiveShadow, colored, items: [], mesh: null }));
      b.items.push({ car, geo: m.geometry, m: m.matrixWorld.clone(), c: color });
    });
  }

  /** The batched meshes made again (once at the start, again when cars are adopted). */
  private rebuild() {
    this.dirty = false;
    this.slots.clear();
    for (const b of this.batches.values()) {
      if (b.mesh) {
        b.mesh.removeFromParent();
        b.mesh.dispose();
        b.mesh = null;
      }
      // (cars taken since: their items go)
      b.items = b.items.filter((it) => this.cars.includes(it.car));
      if (!b.items.length) continue;
      // every distinct geometry once, every part an instance of it
      const geos = [...new Set(b.items.map((it) => it.geo))];
      let verts = 0,
        index = 0;
      for (const g of geos) {
        verts += g.getAttribute("position").count;
        index += g.index ? g.index.count : 0;
      }
      const bm = new THREE.BatchedMesh(b.items.length, verts, Math.max(1, index), b.mat);
      const ids = new Map<THREE.BufferGeometry, number>();
      for (const g of geos) ids.set(g, bm.addGeometry(g));
      for (const it of b.items) {
        const id = bm.addInstance(ids.get(it.geo)!);
        bm.setMatrixAt(id, it.m);
        if (b.colored) bm.setColorAt(id, it.c);
        const list = this.slots.get(it.car) ?? [];
        list.push({ b, id });
        this.slots.set(it.car, list);
      }
      bm.castShadow = b.cast;
      bm.receiveShadow = b.receive;
      bm.perObjectFrustumCulled = true;
      bm.userData.noField = true;
      // (static: no matrix to work out each frame)
      bm.matrixAutoUpdate = false;
      bm.updateMatrix();
      b.mesh = bm;
      this.group.add(bm);
    }
    this.group.matrixAutoUpdate = false;
    this.group.updateMatrixWorld(true);
  }

  /** The car at (x, z), if one stands there (a walker's collision). */
  hit(x: number, z: number, pad = 0.25) {
    for (const c of this.cars) {
      const p = c.obj.position;
      if (Math.abs(x - p.x) > 6 || Math.abs(z - p.z) > 6) continue;
      const fx = Math.cos(c.obj.rotation.y),
        fz = -Math.sin(c.obj.rotation.y);
      const dx = x - p.x,
        dz = z - p.z;
      const along = dx * fx + dz * fz,
        across = -dx * fz + dz * fx;
      if (Math.abs(along) < c.hl + pad && Math.abs(across) < c.hw + pad) return true;
    }
    return false;
  }

  /** Taken (or shoved out of its place): out of the list and out of the instances, the car itself handed over (not in the scene yet). */
  take(obj: THREE.Object3D): THREE.Group | null {
    const i = this.cars.findIndex((c) => c.obj === obj);
    if (i < 0) return null;
    const c = this.cars[i];
    this.cars.splice(i, 1);
    for (const { b, id } of this.slots.get(c) ?? []) if (b.mesh) b.mesh.setVisibleAt(id, false);
    this.slots.delete(c);
    const g = c.obj;
    g.removeFromParent();
    return g;
  }
}
