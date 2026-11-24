/**
 * The landmarks drawn on the main thread by src/scene/real (the Golden Gate, the bay's statue and
 * opera house: built from their own real geometry where the game needs it, the deck's heights, the
 * torch). The city's workers still run their voxel builders, for the layout only (door, named
 * points, lot), and send no geometry for them. Pure: the workers import it.
 */
export const MAIN_LANDMARKS = new Set<string>(["bridge", "statue", "opera"]);

/**
 * What a worker sends for one of them: no meshes; the voxel builder's door, points, signs, walls
 * and lights (in VOX units). The bridge keeps none of its walls, signs or lights: the real one
 * draws its own and the game holds bodies on its deck (src/scene/goldengate.ts).
 */
export function mainLandmarkMeta(
  b: { model: { w: number; h: number; d: number }; door: number[]; body: number[]; lights: [number, number, number, string][]; walls?: number[][]; signs: { x: number; y: number; z: number; w: number; h: number }[]; points?: Record<string, number[]> },
  k: number,
  kind: string,
) {
  const v = (n: number) => n * k;
  const bridge = kind === "bridge";
  return {
    w: b.model.w * k,
    h: b.model.h * k,
    d: b.model.d * k,
    signs: bridge ? [] : b.signs.map((s) => ({ ...s, x: v(s.x), y: v(s.y), z: v(s.z), w: v(s.w), h: v(s.h) })),
    door: b.door.map(v),
    body: b.body.map(v),
    lights: bridge ? [] : b.lights.map(([x, y, z, c]) => [v(x), v(y), v(z), c] as [number, number, number, string]),
    walls: bridge ? [] : b.walls?.map((w) => w.map(v)),
    points: b.points && Object.fromEntries(Object.entries(b.points).map(([n, p]) => [n, p.map(v)])),
  };
}
