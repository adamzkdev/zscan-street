/// <reference lib="webworker" />
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { meshModel } from "../voxel/mesher";
import { C, half, palette, VOX, type Kind } from "../voxel/model";
import type { Prop } from "../voxel/props";
import { buildJob, propModel } from "./build";
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
}
export type Geos = Partial<Record<Kind, GeoData>>;

export const CUT_VOX = 16;

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

self.onmessage = (e: MessageEvent) => {
  const msg = e.data as { kind: "buildings"; jobs: BuildingJob[]; lite?: boolean } | { kind: "props"; props: PropJob[] };
  const transfer: Transferable[] = [];
  if (msg.kind === "buildings") {
    const lite = !!msg.lite;
    // one broken building (a builder throwing) must not take the whole queue, or the city, with it
    const results = msg.jobs.flatMap((j) => {
      const t0 = performance.now();
      try {
        const res = buildOne(j);
        return [{ ...res, ms: Math.round(performance.now() - t0) }];
      } catch (err) {
        console.error(`city worker: ${j.type} #${j.id} failed`, err);
        return [];
      }
    });
    (self as unknown as Worker).postMessage({ kind: "buildings", results }, transfer);
    return;
    function buildOne(j: BuildingJob) {
      const b = buildJob(j);
      const m = b.model;
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
