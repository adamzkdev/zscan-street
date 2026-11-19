// half() as it was before the port of the fork's speed-ups (ZStreet 3deeb43): the reference for _meshcheck.mjs.
import { palette, VoxelModel } from "../src/scene/voxel/model";

export function half(m: VoxelModel) {
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
