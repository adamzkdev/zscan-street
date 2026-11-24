/// <reference lib="webworker" />
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { meshModel } from "../voxel/mesher";
import { C, half, palette, VOX, type Kind } from "../voxel/model";
import type { Prop } from "../voxel/props";
import { buildJob, propModel } from "./build";
import { workerCache } from "./cache";
import { realBuilding, REAL_TYPES, type RGeo, type Slot } from "../real/buildings";
import { MAIN_LANDMARKS, mainLandmarkMeta } from "../real/mainmarks";
import { REAL_HEART, REAL_LANDMARKS, realLandmark } from "../real/landmarks";
import { REAL_MARKS, realMark } from "../real/marks";
import { PALM_MARKS, realPalmMark } from "../real/palmmarks";
import type { BuildingJob, PropJob } from "./plan";

/**
 * City generation off the main thread: builds the voxel models, meshes them (greedy + AO) and
 * sends back plain arrays. Each building comes with a cut-down copy for the walls-down view.
 */

/**
 * Compact on purpose: the city is ~28 million vertices, and in plain Float32 its arrays took
 * ~830 MB of memory (and as much again on the GPU). Normals are axis-aligned (bytes: -127/0/127,
 * normalised), colours are half floats (they go above 1 for the lit windows and neon), indices are
 * 16-bit whenever a mesh has fewer than 65,536 vertices. Same look, about 40 % of the memory.
 */
export interface GeoData {
  pos: Float32Array;
  nor: Int8Array;
  /** Half floats (IEEE 754 binary16). */
  col: Uint16Array;
  idx: Uint32Array | Uint16Array;
  /** The realistic buildings' texture coordinates (src/scene/real). */
  uv?: Float32Array;
}
/** By the voxels' kind, or by a realistic slot (src/scene/real/buildings.ts). */
export type Geos = Partial<Record<Kind | Slot, GeoData>>;

// (in plan.ts, which the main thread loads anyway: importing it from here pulled every builder into the main bundle)
export { CUT_VOX } from "./plan";
import { CUT_VOX } from "./plan";

const toHalf = THREE.DataUtils.toHalfFloat;
function pack(geos: Partial<Record<Kind, THREE.BufferGeometry>>, out: Transferable[]): Geos {
  const r: Geos = {};
  for (const [k, g] of Object.entries(geos) as [Kind, THREE.BufferGeometry][]) {
    const pos = g.getAttribute("position").array as Float32Array;
    const n = g.getAttribute("normal").array;
    const c = g.getAttribute("color").array;
    const nor = new Int8Array(n.length);
    for (let i = 0; i < n.length; i++) nor[i] = Math.round(n[i] * 127);
    const col = new Uint16Array(c.length);
    for (let i = 0; i < c.length; i++) col[i] = toHalf(c[i]);
    const src = g.getIndex()!.array;
    const idx = pos.length / 3 <= 65535 ? Uint16Array.from(src) : Uint32Array.from(src);
    const d: GeoData = { pos, nor, col, idx };
    out.push(d.pos.buffer, d.nor.buffer, d.col.buffer, d.idx.buffer);
    r[k] = d;
  }
  return r;
}

/** A realistic building's slots, compact the same way (byte normals, half-float colours). */
function packReal(geos: Partial<Record<Slot, RGeo>>, out: Transferable[]): Geos {
  const r: Geos = {};
  for (const [k, g] of Object.entries(geos) as [Slot, RGeo][]) {
    const nor = new Int8Array(g.nor.length);
    for (let i = 0; i < g.nor.length; i++) nor[i] = Math.round(g.nor[i] * 127);
    const col = new Uint16Array(g.col.length);
    for (let i = 0; i < g.col.length; i++) col[i] = toHalf(g.col[i]);
    const idx = g.pos.length / 3 <= 65535 ? Uint16Array.from(g.idx) : Uint32Array.from(g.idx);
    const d: GeoData = { pos: g.pos, nor, col, idx, uv: g.uv };
    out.push(d.pos.buffer, d.nor.buffer, d.col.buffer, d.idx.buffer, g.uv.buffer);
    r[k] = d;
  }
  return r;
}

/** The cut-away model gets a proper roof on its top layer, not a slice through solid wall. */
function capped(m: import("../voxel/model").VoxelModel) {
  const y = m.h - 1;
  const tar = C("#34303c"),
    edge = C("#4a4555");
  for (let z = 0; z < m.d; z++)
    for (let x = 0; x < m.w; x++) {
      if (!m.get(x, y, z) || palette.entries[m.get(x, y, z)].kind === "emit") continue;
      const rim = !m.get(x - 1, y, z) || !m.get(x + 1, y, z) || !m.get(x, y, z - 1) || !m.get(x, y, z + 1);
      m.set(x, y, z, rim ? edge : tar);
    }
  return m;
}

function scaled(geos: Partial<Record<Kind, THREE.BufferGeometry>>, k: number) {
  for (const g of Object.values(geos)) g.scale(k, k, k);
  return geos;
}


/** Props that block with their whole footprint (a bench is two metres long, not a post). */
const SOLID = new Set(["bench", "shelter", "stall", "container", "greenhouse", "vending", "bicycle", "crates", "trashBags", "planter", "fence", "mailbox", "barrel"]);

self.onmessage = async (e: MessageEvent) => {
  const msg = e.data as { kind: "buildings"; jobs: BuildingJob[]; lite?: boolean; real?: boolean; marks?: boolean; keys?: Record<number, string> } | { kind: "props"; props: PropJob[] } | { kind: "hello" };
  // the main thread asks which bundle this is: its hashed name versions the city cache
  if (msg.kind === "hello") return void (self as unknown as Worker).postMessage({ url: self.location.pathname });
  const transfer: Transferable[] = [];
  if (msg.kind === "buildings") {
    const lite = !!msg.lite;
    const realOn = msg.real !== false;
    const marksOn = msg.marks !== false;
    // the city cache (`keys`: the variants' cache keys, when it is on)
    const cache = msg.keys ? await workerCache() : null;
    // each building posted as soon as it is meshed, so the main thread places it while the next one
    // is built (they all came at the end, then were placed in one long stall)
    for (const j of msg.jobs) {
      const t0 = performance.now();
      let res;
      try {
        res = { ...buildOne(j), ms: 0 };
      } catch (err) {
        // one broken building (a builder throwing) must not take the whole queue, or the city, with it
        console.error(`city worker: ${j.type} #${j.id} failed`, err);
        transfer.length = 0;
        (self as unknown as Worker).postMessage({ kind: "failed", id: j.id });
        continue;
      }
      res.ms = Math.round(performance.now() - t0);
      // into the cache first, while the arrays are still ours (put copies them): posting hands them over
      cache?.put(msg.keys![j.id], res);
      (self as unknown as Worker).postMessage({ kind: "building", result: res }, transfer);
      transfer.length = 0;
    }
    await cache?.done();
    (self as unknown as Worker).postMessage({ kind: "done" });
    return;
    function buildOne(j: BuildingJob) {
      const b = buildJob(j);
      const m = b.model;
      if (j.type === "landmark" && MAIN_LANDMARKS.has((j.opts as { kind: string }).kind)) {
        // drawn on the main thread, realistic (src/scene/real/mainmarks.ts): the layout only
        const kind = (j.opts as { kind: string }).kind;
        return { id: j.id, full: {}, cut: {}, lod: {}, meta: mainLandmarkMeta(b, b.scale ?? 1, kind) };
      }
      if (realOn && marksOn && j.type === "landmark" && REAL_MARKS.has((j.opts as { kind: string }).kind)) {
        // a landmark of the north or the centre rebuilt realistically (src/scene/real/marks.ts): metres, its layout from its voxels
        const kind = (j.opts as { kind: string }).kind;
        const k = b.scale ?? 1;
        const v = (n: number) => n * k;
        const near = realMark(kind, b, j, lite ? 1 : 0);
        return {
          id: j.id,
          real: true,
          full: packReal(near.geos, transfer),
          cut: {},
          lod: packReal(realMark(kind, b, j, 1).geos, transfer),
          meta: {
            w: m.w * k,
            h: m.h * k,
            d: m.d * k,
            signs: b.signs.map((s) => ({ ...s, x: v(s.x), y: v(s.y), z: v(s.z), w: v(s.w), h: v(s.h) })),
            door: b.door.map(v),
            body: b.body.map(v),
            lights: b.lights.map(([x, y, z, c]) => [v(x), v(y), v(z), c]),
            walls: b.walls?.map((w) => w.map(v)),
            points: b.points && Object.fromEntries(Object.entries(b.points).map(([n, p]) => [n, p.map(v)])),
            extras: { trees: near.trees, props: near.props },
          },
        };
      }
      if (realOn && marksOn && j.type === "landmark" && PALM_MARKS.has((j.opts as { kind: string }).kind)) {
        // the Palm and the sail hotel rebuilt realistically (src/scene/real/palmmarks.ts): metres, the layout from their voxels
        const kind = (j.opts as { kind: string }).kind;
        const k = b.scale ?? 1;
        const v = (n: number) => n * k;
        const near = realPalmMark(kind, b, j, lite ? 1 : 0);
        return {
          id: j.id,
          real: true,
          full: packReal(near.geos, transfer),
          cut: {},
          lod: packReal(realPalmMark(kind, b, j, 1).geos, transfer),
          meta: {
            w: m.w * k,
            h: m.h * k,
            d: m.d * k,
            signs: b.signs.map((s) => ({ ...s, x: v(s.x), y: v(s.y), z: v(s.z), w: v(s.w), h: v(s.h) })),
            door: b.door.map(v),
            body: b.body.map(v),
            lights: b.lights.map(([x, y, z, c]) => [v(x), v(y), v(z), c]),
            walls: b.walls?.map((w) => w.map(v)),
            points: b.points && Object.fromEntries(Object.entries(b.points).map(([n, p]) => [n, p.map(v)])),
            extras: { trees: near.trees, props: near.props },
          },
        };
      }
      if (realOn && marksOn && j.type === "landmark" && REAL_LANDMARKS.has((j.opts as { kind: string }).kind)) {
        // a landmark rebuilt realistically (src/scene/real/landmarks.ts): metres; the layout from its voxels
        const kind = (j.opts as { kind: string }).kind;
        const k = b.scale ?? 1;
        const v = (n: number) => n * k;
        const near = realLandmark(kind, b, { lod: lite ? 1 : 0 });
        return {
          id: j.id,
          real: true,
          full: packReal(near.geos, transfer),
          cut: {},
          lod: packReal(realLandmark(kind, b, { lod: 1 }).geos, transfer),
          meta: {
            w: m.w * k,
            h: m.h * k,
            d: m.d * k,
            signs: b.signs.map((s) => ({ ...s, x: v(s.x), y: v(s.y), z: v(s.z), w: v(s.w), h: v(s.h) })),
            door: b.door.map(v),
            body: b.body.map(v),
            lights: b.lights.map(([x, y, z, c]) => [v(x), v(y), v(z), c]),
            walls: b.walls?.map((w) => w.map(v)),
            points: b.points && Object.fromEntries(Object.entries(b.points).map(([n, p]) => [n, p.map(v)])),
            extras: near.extras,
          },
        };
      }
      if (j.type === "landmark") {
        // a landmark: meshed once at its own voxel size, no walls-down cut, coordinates in VOX units
        const k = b.scale ?? 1;
        const v = (n: number) => n * k;
        return {
          id: j.id,
          // (on a phone, a level coarser all round)
          full: lite ? pack(scaled(meshModel(half(m)), k * 2), transfer) : pack(scaled(meshModel(m), k), transfer),
          cut: {},
          // seen from afar: half resolution
          lod: lite ? pack(scaled(meshModel(half(half(m))), k * 4), transfer) : pack(scaled(meshModel(half(m)), k * 2), transfer),
          meta: {
            w: m.w * k,
            h: m.h * k,
            d: m.d * k,
            signs: b.signs.map((s) => ({ ...s, x: v(s.x), y: v(s.y), z: v(s.z), w: v(s.w), h: v(s.h) })),
            door: b.door.map(v),
            body: b.body.map(v),
            lights: b.lights.map(([x, y, z, c]) => [v(x), v(y), v(z), c]),
            walls: b.walls?.map((w) => w.map(v)),
            points: b.points && Object.fromEntries(Object.entries(b.points).map(([n, p]) => [n, p.map(v)])),
          },
        };
      }
      if (realOn && marksOn && REAL_HEART.has(j.type)) {
        // the heart's own buildings (MEMPOOL HQ and kiosks, the street shops, the bookshop, the
        // pavilion), realistic (src/scene/real/landmarks.ts "h:" builders): metres; walls-down copy clipped
        const hb = Object.assign(b, { kind: (j.opts as { kind?: string }).kind });
        const near = realLandmark(`h:${j.type}`, hb, { lod: lite ? 1 : 0 });
        const meta = { w: m.w, h: m.h, d: m.d, signs: b.signs, door: b.door, body: b.body, lights: b.lights, walls: b.walls, points: b.points, extras: near.extras };
        if (!j.ext) return { id: j.id, real: true, full: packReal(near.geos, transfer), cut: packReal(realLandmark(`h:${j.type}`, hb, { lod: 1, clipY: CUT_VOX * VOX }).geos, transfer), meta };
        const far = realLandmark(`h:${j.type}`, hb, { lod: 1 }).geos;
        return { id: j.id, real: true, full: packReal(near.geos, transfer), cut: {}, lod: packReal(far, transfer), lod2: packReal(realLandmark(`h:${j.type}`, hb, { lod: 1 }).geos, transfer), meta };
      }
      // the ordinary buildings, realistic (src/scene/real): the voxel model only for its layout
      if (realOn && REAL_TYPES.has(j.type)) {
        const meta = { w: m.w, h: m.h, d: m.d, signs: b.signs, door: b.door, body: b.body, lights: b.lights, walls: b.walls, points: b.points };
        if (!j.ext) return { id: j.id, real: true, full: packReal(realBuilding(j, b, { lod: lite ? 1 : 0 }), transfer), cut: packReal(realBuilding(j, b, { lod: 1, clipY: CUT_VOX }), transfer), meta };
        return {
          id: j.id,
          real: true,
          full: packReal(realBuilding(j, b, { lod: lite ? 1 : 0 }), transfer),
          cut: {},
          lod: packReal(realBuilding(j, b, { lod: lite ? 2 : 1 }), transfer),
          lod2: packReal(realBuilding(j, b, { lod: 2 }), transfer),
          meta,
        };
      }
      if (lite && j.ext)
        // a phone: the bigger city a level coarser (half resolution near, a quarter beyond)
        return {
          id: j.id,
          full: pack(scaled(meshModel(half(m)), 2), transfer),
          cut: {},
          lod: pack(scaled(meshModel(half(half(m))), 4), transfer),
          lod2: undefined,
          meta: { w: m.w, h: m.h, d: m.d, signs: b.signs, door: b.door, body: b.body, lights: b.lights, walls: b.walls, points: b.points },
        };
      return {
        id: j.id,
        full: pack(meshModel(m), transfer),
        // the bigger city's buildings: a far copy instead of the walls-down cut
        cut: j.ext ? {} : pack(meshModel(capped(m.slice(CUT_VOX))), transfer),
        lod: j.ext ? pack(scaled(meshModel(half(m)), 2), transfer) : undefined,
        lod2: j.ext ? pack(scaled(meshModel(half(half(m))), 4), transfer) : undefined,
        meta: { w: m.w, h: m.h, d: m.d, signs: b.signs, door: b.door, body: b.body, lights: b.lights, walls: b.walls, points: b.points },
      };
    }
  }
  // props: one merged mesh set per district, plus what the main thread needs to know
  const cache = new Map<string, { prop: Prop; geos: Partial<Record<Kind, THREE.BufferGeometry>>; far: Partial<Record<Kind, THREE.BufferGeometry>> }>();
  const parts = new Map<string, Record<Kind, THREE.BufferGeometry[]>>();
  /** The same props at half resolution, for the sectors far from the camera's focus. */
  const farParts = new Map<string, Record<Kind, THREE.BufferGeometry[]>>();
  const centres = new Map<string, [number, number]>();
  const circles: [number, number, number][] = [];
  const rects: [number, number, number, number][] = [];
  const lamps: [number, number, number, string][] = [];
  const canopies: [number, number, number, number][] = [];
  const Y = new THREE.Vector3(0, 1, 0);
  for (const p of msg.props) {
    const key = `${p.type}|${JSON.stringify(p.args)}`;
    let c = cache.get(key);
    if (!c) {
      const prop = propModel(p.type, p.args);
      c = { prop, geos: meshModel(prop.model), far: scaled(meshModel(half(prop.model)), 2) };
      cache.set(key, c);
    }
    const mtx = new THREE.Matrix4().compose(new THREE.Vector3(p.x, p.y ?? 0.2, p.z), new THREE.Quaternion().setFromAxisAngle(Y, p.rot), new THREE.Vector3(1, 1, 1));
    // merged by 96 m sector, so what is off screen is culled
    const sector = `${p.district}|${Math.floor(p.x / 96)}|${Math.floor(p.z / 96)}`;
    let bucket = parts.get(sector);
    if (!bucket) parts.set(sector, (bucket = { solid: [], glass: [], emit: [] }));
    for (const [k, g] of Object.entries(c.geos) as [Kind, THREE.BufferGeometry][]) bucket[k].push(g.clone().applyMatrix4(mtx));
    let fb = farParts.get(sector);
    if (!fb) farParts.set(sector, (fb = { solid: [], glass: [], emit: [] }));
    for (const [k, g] of Object.entries(c.far) as [Kind, THREE.BufferGeometry][]) fb[k].push(g.clone().applyMatrix4(mtx));
    if (!centres.has(sector)) centres.set(sector, [(Math.floor(p.x / 96) + 0.5) * 96, (Math.floor(p.z / 96) + 0.5) * 96]);
    const pr = c.prop;
    const local = (x: number, y: number, z: number) => new THREE.Vector3((x - pr.model.w / 2) * VOX, y * VOX, (z - pr.model.d / 2) * VOX).applyMatrix4(mtx);
    // things you would bump into get their whole footprint; posts and trunks a circle
    if (SOLID.has(p.type)) {
      const turned = Math.abs(Math.sin(p.rot)) > 0.7;
      const hw = ((turned ? pr.model.d : pr.model.w) * VOX) / 2,
        hd = ((turned ? pr.model.w : pr.model.d) * VOX) / 2;
      rects.push([p.x - hw, p.z - hd, p.x + hw, p.z + hd]);
    } else if (pr.radius > 0) circles.push([p.x, p.z, pr.radius]);
    if (pr.light) {
      const v = local(pr.light[0], pr.light[1], pr.light[2]);
      lamps.push([v.x, v.y, v.z, pr.light[3]]);
    }
    if (pr.canopy) {
      const v = local(pr.canopy[0], pr.canopy[1], pr.canopy[2]);
      canopies.push([v.x, v.y, v.z, pr.canopy[3] * VOX]);
    }
  }
  const chunks: { district: string; geos: Geos; far: Geos; centre: [number, number] }[] = [];
  const merge = (bucket: Record<Kind, THREE.BufferGeometry[]>) => {
    const merged: Partial<Record<Kind, THREE.BufferGeometry>> = {};
    for (const k of ["solid", "glass", "emit"] as Kind[]) if (bucket[k].length) merged[k] = mergeGeometries(bucket[k], false);
    return pack(merged, transfer);
  };
  for (const [district, bucket] of parts) chunks.push({ district, geos: merge(bucket), far: merge(farParts.get(district)!), centre: centres.get(district)! });
  (self as unknown as Worker).postMessage({ kind: "props", chunks, circles, rects, lamps, canopies }, transfer);
};
