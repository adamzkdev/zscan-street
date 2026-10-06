/// <reference lib="webworker" />
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { meshModel } from "../voxel/mesher";
import { C, palette, VOX, VoxelModel, type Kind } from "../voxel/model";
import type { Prop } from "../voxel/props";
import { buildJob, propModel } from "./build";
import type { BuildingJob, PropJob } from "./plan";

/**
 * City generation off the main thread: builds the voxel models, meshes them (greedy + AO) and
 * sends back plain arrays. Each building comes with a cut-down copy for the walls-down view.
 */

export interface GeoData {
  pos: Float32Array;
  nor: Float32Array;
  col: Float32Array;
  idx: Uint32Array;
}
export type Geos = Partial<Record<Kind, GeoData>>;

export const CUT_VOX = 16;

function pack(geos: Partial<Record<Kind, THREE.BufferGeometry>>, out: Transferable[]): Geos {
  const r: Geos = {};
  for (const [k, g] of Object.entries(geos) as [Kind, THREE.BufferGeometry][]) {
    const d: GeoData = {
      pos: g.getAttribute("position").array as Float32Array,
      nor: g.getAttribute("normal").array as Float32Array,
      col: g.getAttribute("color").array as Float32Array,
      idx: Uint32Array.from(g.getIndex()!.array),
    };
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

/**
 * Half-resolution copy of a model, for buildings seen from afar: each 2×2×2 cell becomes one
 * voxel of its most common colour (lit windows win, so the city still glows at night). Meshed at
 * double scale, it lines up with the full model.
 */
function half(m: VoxelModel) {
  const w = Math.ceil(m.w / 2),
    h = Math.ceil(m.h / 2),
    d = Math.ceil(m.d / 2);
  const o = new VoxelModel(w, h, d);
  const count = new Map<number, number>();
  for (let y = 0; y < h; y++)
    for (let z = 0; z < d; z++)
      for (let x = 0; x < w; x++) {
        count.clear();
        let filled = 0,
          emit = 0;
        for (let k = 0; k < 8; k++) {
          const c = m.get(x * 2 + (k & 1), y * 2 + ((k >> 1) & 1), z * 2 + ((k >> 2) & 1));
          if (!c) continue;
          filled++;
          if (palette.entries[c].kind === "emit") emit = c;
          count.set(c, (count.get(c) ?? 0) + 1);
        }
        if (filled < 2 && !emit) continue;
        let best = 0,
          n = 0;
        for (const [c, k] of count) if (k > n) (best = c), (n = k);
        o.set(x, y, z, emit || best);
      }
  return o;
}

/** Props that block with their whole footprint (a bench is two metres long, not a post). */
const SOLID = new Set(["bench", "shelter", "stall", "container", "greenhouse", "vending", "bicycle", "crates", "trashBags", "planter", "fence", "mailbox", "barrel"]);

self.onmessage = (e: MessageEvent) => {
  const msg = e.data as { kind: "buildings"; jobs: BuildingJob[] } | { kind: "props"; props: PropJob[] };
  const transfer: Transferable[] = [];
  if (msg.kind === "buildings") {
    const results = msg.jobs.map((j) => {
      const b = buildJob(j);
      const m = b.model;
      return {
        id: j.id,
        full: pack(meshModel(m), transfer),
        // the bigger city's buildings: a far copy instead of the walls-down cut
        cut: j.ext ? {} : pack(meshModel(capped(m.slice(CUT_VOX))), transfer),
        lod: j.ext ? pack(scaled(meshModel(half(m)), 2), transfer) : undefined,
        lod2: j.ext ? pack(scaled(meshModel(half(half(m))), 4), transfer) : undefined,
        meta: { w: m.w, h: m.h, d: m.d, signs: b.signs, door: b.door, body: b.body, lights: b.lights, walls: b.walls, points: b.points },
      };
    });
    (self as unknown as Worker).postMessage({ kind: "buildings", results }, transfer);
    return;
  }
  // props: one merged mesh set per district, plus what the main thread needs to know
  const cache = new Map<string, { prop: Prop; geos: Partial<Record<Kind, THREE.BufferGeometry>> }>();
  const parts = new Map<string, Record<Kind, THREE.BufferGeometry[]>>();
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
      c = { prop, geos: meshModel(prop.model) };
      cache.set(key, c);
    }
    const mtx = new THREE.Matrix4().compose(new THREE.Vector3(p.x, p.y ?? 0.2, p.z), new THREE.Quaternion().setFromAxisAngle(Y, p.rot), new THREE.Vector3(1, 1, 1));
    let bucket = parts.get(p.district);
    if (!bucket) parts.set(p.district, (bucket = { solid: [], glass: [], emit: [] }));
    for (const [k, g] of Object.entries(c.geos) as [Kind, THREE.BufferGeometry][]) bucket[k].push(g.clone().applyMatrix4(mtx));
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
  const chunks: { district: string; geos: Geos }[] = [];
  for (const [district, bucket] of parts) {
    const merged: Partial<Record<Kind, THREE.BufferGeometry>> = {};
    for (const k of ["solid", "glass", "emit"] as Kind[]) if (bucket[k].length) merged[k] = mergeGeometries(bucket[k], false);
    chunks.push({ district, geos: pack(merged, transfer) });
  }
  (self as unknown as Worker).postMessage({ kind: "props", chunks, circles, rects, lamps, canopies }, transfer);
};
