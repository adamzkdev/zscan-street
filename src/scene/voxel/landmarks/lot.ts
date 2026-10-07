import type { Built } from "../buildings";
import { VoxelModel } from "../model";
import type { LandmarkOpts } from "./index";

/** Model size in voxels for a lot of `o.w` × `o.d` metres at voxel scale `k` (1 = VOX). */
export function lotSize(o: LandmarkOpts, k: number) {
  return { W: Math.round((o.w * 6) / k), D: Math.round((o.d * 6) / k) };
}

/** A lot with nothing on it yet. */
export function emptyLot(o: LandmarkOpts): Built {
  const k = 2;
  const { W, D } = lotSize(o, k);
  return { model: new VoxelModel(W, 1, D), signs: [], door: [W / 2, D], body: [0, 0, W, D], lights: [], walls: [], scale: k };
}
