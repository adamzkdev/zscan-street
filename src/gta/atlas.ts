import { bakedClasses } from "../ui/minimap";

/**
 * The game's map as a road atlas (src/gta): the city's top-down classes (ui/minimap.ts's bake) in a
 * paper map's colours — white streets with a grey kerb line, pavements and squares in stone, the
 * buildings' footprints in sandstone with an outline and their shadow to the south-east, parks and
 * tree crowns in two greens, the sea deeper away from the shore, the beach in sand. Painted once.
 */

const C = {
  deep: [104, 164, 210],
  shallow: [142, 196, 232],
  sand: [236, 222, 180],
  road: [252, 251, 247],
  kerb: [178, 174, 165],
  pave: [226, 221, 209],
  green: [184, 216, 158],
  crown: [150, 198, 128],
  bld: [212, 204, 188],
  bldTall: [192, 184, 168],
  edge: [150, 141, 124],
} as const;

/** The sea's colour beyond the map's picture. */
export const SEA = `rgb(${C.deep.join(",")})`;

let painted: { canvas: HTMLCanvasElement; from: Uint8Array } | null = null;

/** The atlas (painted again only when the city's bake changed); null before the first bake. */
export function atlas(): HTMLCanvasElement | null {
  const b = bakedClasses();
  if (!b) return null;
  if (painted && painted.from === b.cls) return painted.canvas;
  const { cls, hgt, res: R } = b;
  const N = R * R;
  // the water's distance to the shore (px, capped): a chamfer in two passes
  const dist = new Uint8Array(N);
  for (let i = 0; i < N; i++) dist[i] = cls[i] === 1 || cls[i] === 0 ? 40 : 0;
  for (let y = 1; y < R; y++)
    for (let x = 1; x < R - 1; x++) {
      const i = y * R + x;
      if (dist[i]) dist[i] = Math.min(dist[i], dist[i - 1] + 1, dist[i - R] + 1, dist[i - R - 1] + 1, dist[i - R + 1] + 1);
    }
  for (let y = R - 2; y >= 0; y--)
    for (let x = R - 2; x > 0; x--) {
      const i = y * R + x;
      if (dist[i]) dist[i] = Math.min(dist[i], dist[i + 1] + 1, dist[i + R] + 1, dist[i + R + 1] + 1, dist[i + R - 1] + 1);
    }
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = R;
  const g = canvas.getContext("2d")!;
  const img = g.createImageData(R, R);
  const d = img.data;
  const isB = (i: number) => cls[i] === 5;
  for (let y = 0; y < R; y++)
    for (let x = 0; x < R; x++) {
      const i = y * R + x;
      const k = cls[i];
      let c: readonly number[];
      let shade = 1;
      if (k === 0 || k === 1) {
        const t = Math.min(1, dist[i] / 26);
        c = [0, 1, 2].map((j) => C.shallow[j] + (C.deep[j] - C.shallow[j]) * t);
      } else if (k === 6) c = C.sand;
      else if (k === 2) {
        const side = x > 0 && x < R - 1 && y > 0 && y < R - 1 && [i - 1, i + 1, i - R, i + R].some((n) => cls[n] === 3 || cls[n] === 5 || cls[n] === 4);
        c = side ? C.kerb : C.road;
      } else if (k === 4) c = hgt[i] > 10 ? C.crown : C.green;
      else if (k === 5) {
        const edge = x === 0 || y === 0 || x === R - 1 || y === R - 1 || !isB(i - 1) || !isB(i + 1) || !isB(i - R) || !isB(i + R);
        if (edge) c = C.edge;
        else {
          const t = Math.min(1, Math.sqrt(hgt[i] / 255) * 1.3);
          c = [0, 1, 2].map((j) => C.bld[j] + (C.bldTall[j] - C.bld[j]) * t);
        }
      } else c = C.pave;
      // a building's shadow falls to the south-east (taller ones a little further)
      if (k !== 5 && k !== 0 && k !== 1 && x > 4 && y > 4) {
        for (const s of [2, 4]) {
          const j = i - s * R - s;
          if (isB(j) && hgt[j] > 4 + s * 2) {
            shade = 0.86;
            break;
          }
        }
      }
      d[i * 4] = c[0] * shade;
      d[i * 4 + 1] = c[1] * shade;
      d[i * 4 + 2] = c[2] * shade;
      d[i * 4 + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  painted = { canvas, from: cls };
  return canvas;
}
