/**
 * ZK PARTY's palette and its printed marks, in ZStreet's own colours: the night (void, surface),
 * the paper (content), the flare, ZEC's gold, and the shielded pools' inks (the KIND_COLOR of the
 * street's parcels: shielded green, Orchard cyan, migration lilac). The ⓩ mark is ZStreet's coin
 * (the HUD's "zec" icon): a ring and a Z with its two ticks. A zkSNARK's sigil is a mirrored 7 × 7
 * figure drawn from its id, the way a face reads in a crowd (tiles, banners, card faces).
 */

export const VOID = "#0e0e12";
export const SURFACE = "#18171d";
export const CONTENT = "#ece6da";
export const MUTED = "#8a8784";
/** The seat-0 orange of the party, the city's neon. */
export const FLARE = "#ff6b35";
/** ZEC's gold. */
export const GOLD = "#f4b728";
/** The shielded pools' inks (the street's KIND_COLOR). */
export const SHIELD = "#3ee08f";
export const GLACIER = "#7fd3ff";
export const LILAC = "#b07bff";
export const SAND = "#ffd28a";
export const SAGE = "#5cff9a";
export const ALARM = "#ff4a5a";

/** mulberry32 on a seed: a repeatable stream in [0, 1). */
function rng(seed: number) {
  let s = (seed * 2654435761) >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A zkSNARK's sigil: 7 × 7, mirrored about its middle column (0 empty, 1 ink, 2 second ink); never empty. */
export function sigilOf(seed: number): number[][] {
  const r = rng(seed + 7919);
  const solid = r() < 0.26;
  const sigil: number[][] = [];
  for (let y = 0; y < 7; y++) {
    const row = new Array(7).fill(0);
    for (let x = 0; x < 4; x++) {
      const v = r() < (solid && x === 3 ? 0.85 : 0.48) ? (r() < 0.16 ? 2 : 1) : 0;
      row[x] = row[6 - x] = v;
    }
    sigil.push(row);
  }
  if (!sigil.flat().some(Boolean)) sigil[3][3] = 2;
  return sigil;
}

/** The old name, kept for the callers that read `.sigil` off a seal. */
export const sealOf = (seed: number) => ({ sigil: sigilOf(seed) });

/**
 * The ⓩ mark, `s` wide, centred on (cx, cy): a ring in `ring`, the Z in `z` with its two ticks
 * (ZStreet's coin, the same drawing as the HUD's "zec" icon on a 24-unit grid).
 */
export function drawMark(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number, ring: string = CONTENT, z: string = GOLD) {
  const u = s / 24;
  const ox = cx - 12 * u,
    oy = cy - 12 * u;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = ring;
  ctx.lineWidth = 2.2 * u;
  ctx.beginPath();
  ctx.arc(cx, cy, 9.6 * u, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = z;
  ctx.lineWidth = 2.4 * u;
  ctx.beginPath();
  ctx.moveTo(ox + 8.4 * u, oy + 8.2 * u);
  ctx.lineTo(ox + 15.6 * u, oy + 8.2 * u);
  ctx.lineTo(ox + 8.4 * u, oy + 15.8 * u);
  ctx.lineTo(ox + 15.6 * u, oy + 15.8 * u);
  ctx.moveTo(ox + 12 * u, oy + 5.4 * u);
  ctx.lineTo(ox + 12 * u, oy + 8.2 * u);
  ctx.moveTo(ox + 12 * u, oy + 15.8 * u);
  ctx.lineTo(ox + 12 * u, oy + 18.6 * u);
  ctx.stroke();
  ctx.restore();
}
