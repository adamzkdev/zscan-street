/// <reference lib="webworker" />
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { meshModel } from "../voxel/mesher";
import { C, palette, VOX, type Kind } from "../voxel/model";
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
        cut: pack(meshModel(capped(m.slice(CUT_VOX))), transfer),
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
    if (pr.radius > 0) circles.push([p.x, p.z, pr.radius]);
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
  (self as unknown as Worker).postMessage({ kind: "props", chunks, circles, lamps, canopies }, transfer);
};
