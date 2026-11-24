import { landmark } from "../src/scene/voxel/landmarks";
import { realMark } from "../src/scene/real/marks";
const w = 54, d = 54;
const b = landmark(9001, { kind: "colosseum", w, d } as never);
const out = realMark("colosseum", b, { seed: 9001 } as never, 0);
for (const [slot, g] of Object.entries(out.geos)) {
  let outer = 0, n = g.pos.length / 3, ymax = 0, nan = 0;
  for (let i = 0; i < g.pos.length; i += 3) {
    const x = g.pos[i], y = g.pos[i + 1], z = g.pos[i + 2];
    if (!Number.isFinite(x + y + z)) nan++;
    ymax = Math.max(ymax, y);
    const oz = (61 + 8 - b.model.d / 2) / 3;
    const e = Math.hypot(x / 25, (z - oz) / 20.33);
    if (e > 0.93 && e < 1.01 && y > 1 && y < 22) outer++;
  }
  console.log(slot, "verts", n, "near outer wall", outer, "ymax", ymax.toFixed(1), "nan", nan);
}
