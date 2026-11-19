/**
 * ORCHARD HOLD'EM's printed things, all drawn here as SVG (nothing downloaded):
 * - the deck: a four-colour deck on warm card stock, with its own hand-drawn index numerals, real
 *   pip layouts (the lower half printed upside down), double-ended court cards whose figures are
 *   zkSNARKs (a mirrored 7 × 7 zkSNARK sigil for a face, sealOf in src/party/theme.ts: the Jack holds
 *   a viewing key, the Queen an orchard blossom, the King a sceptre with the ⓩ mark), aces in a ring,
 *   and a compact face (big rank, big suit) for cards drawn small on a phone;
 * - the back: a void field under a flare cross-hatch, a paper border, the ⓩ mark in a medallion;
 * - the clay chips (edge spots, an inlay, seen at three quarters) stacked into real piles;
 * - the dealer puck.
 *
 * The suits are the city's four inks: Sparks (a flare star), Shields (a shielded-pool shield), Proofs
 * (a cut diamond) and Blocks (a mined block, isometric).
 *
 * `spriteSvg()` holds the shared pieces (the numerals' clip, the chips) and must be in the page
 * before any face or pile is shown.
 */
import { sealOf } from "../../party/theme";
import { SUIT_INK, SUIT_PRINT } from "./cards";

export const PAPER = "#f7f3ea";
const f1 = (v: number) => (Math.round(v * 100) / 100).toString();

// ---- suits ---------------------------------------------------------------------------------------

/** A suit in a 100 × 100 box. `detail`: the inner lines, for the big ones. */
export function suitSvg(s: number, color: string, detail = false, cut = PAPER) {
  switch (s) {
    case 0:
      return `<path d="M50 2C54 34 66 46 98 50C66 54 54 66 50 98C46 66 34 54 2 50C34 46 46 34 50 2Z" fill="${color}"/>${detail ? `<rect x="44" y="44" width="12" height="12" rx="2" transform="rotate(45 50 50)" fill="${cut}"/>` : ""}`;
    case 1:
      return `<path d="M50 2L92 17V48C92 73 74 89 50 98C26 89 8 73 8 48V17Z" fill="${color}"/>${detail ? `<path d="M50 18L78 28V49C78 66 66 77 50 83C34 77 22 66 22 49V28Z" fill="none" stroke="${cut}" stroke-width="4"/>` : ""}`;
    case 2:
      return `<path d="M50 1L97 50L50 99L3 50Z" fill="${color}"/>${detail ? `<path d="M28 27L72 73M72 27L28 73" stroke="${cut}" stroke-width="4.5"/>` : ""}`;
    default:
      return `<path d="M50 3L94 26L50 49L6 26Z" fill="${color}" opacity="0.62"/><path d="M6 26L50 49L50 97L6 74Z" fill="${color}"/><path d="M94 26L94 74L50 97L50 49Z" fill="${color}" opacity="0.8"/>${detail ? `<path d="M50 49L50 97M6 26L50 49L94 26" stroke="${cut}" stroke-width="3" fill="none"/>` : ""}`;
  }
}

/** A suit icon as a data URL (the hand history). */
const iconCache = new Map<string, string>();
export function suitIcon(s: number, color = SUIT_INK[s]) {
  const k = s + color;
  let u = iconCache.get(k);
  if (!u) {
    u = `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${suitSvg(s, color)}</svg>`)}`;
    iconCache.set(k, u);
  }
  return u;
}

/** The ⓩ mark (a ring and a Z with its two ticks: drawMark's drawing in src/party/theme.ts, as SVG), s wide at (cx, cy). */
export function markSvg(cx: number, cy: number, s: number, ring = "#e8e6e0", flare = "#ff6b35") {
  const u = s / 24;
  return `<g transform="translate(${f1(cx - 12 * u)} ${f1(cy - 12 * u)}) scale(${f1(u)})" fill="none" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9.6" stroke="${ring}" stroke-width="2.2"/><path d="M8.4 8.2H15.6L8.4 15.8H15.6M12 5.4V8.2M12 15.8V18.6" stroke="${flare}" stroke-width="2.4"/></g>`;
}

// ---- the numerals --------------------------------------------------------------------------------

/**
 * The deck's own index numerals: centre-line strokes on a 30-unit-high em, cut flat at the top and
 * the bottom by a clip (so the A's apex and the stems end square, like a printed index).
 */
const GLYPH: Record<string, { w: number; d: string }> = {
  A: { w: 20, d: "M0.6 34L10 -3L19.4 34M4.3 20.6H15.7" },
  K: { w: 19, d: "M3 -2V33M18.4 -1L3.4 18.8M8.6 12L18.8 33" },
  Q: { w: 20, d: "M10 1.95C15.6 1.95 18.05 7.6 18.05 14.6C18.05 21.6 15.6 27.3 10 27.3C4.4 27.3 1.95 21.6 1.95 14.6C1.95 7.6 4.4 1.95 10 1.95ZM11.2 20.2L19.6 33" },
  J: { w: 16, d: "M13.2 -2V20.6C13.2 25.8 10.8 28.05 7.6 28.05C4.6 28.05 2.3 26.1 1.95 22" },
  "1": { w: 10, d: "M7.4 -2V33M1.4 7.6L7.4 1.6" },
  "0": { w: 15, d: "M7.5 1.95C11.7 1.95 13.05 7.6 13.05 15C13.05 22.4 11.7 28.05 7.5 28.05C3.3 28.05 1.95 22.4 1.95 15C1.95 7.6 3.3 1.95 7.5 1.95Z" },
  "9": { w: 18, d: "M16.05 9.6C16.05 13.9 13 17.2 9 17.2C5 17.2 1.95 13.9 1.95 9.6C1.95 5.3 5 1.95 9 1.95C13 1.95 16.05 5.3 16.05 9.6V20C16.05 25.5 13 28.05 9 28.05C6 28.05 3.4 26.6 2.4 23.6" },
  "8": {
    w: 18,
    d: "M9 1.95C12.7 1.95 15.1 4.3 15.1 7.7C15.1 11.1 12.6 13.5 9 13.5C5.4 13.5 2.9 11.1 2.9 7.7C2.9 4.3 5.3 1.95 9 1.95ZM9 13.5C13.4 13.5 16.05 16.4 16.05 20.8C16.05 25.2 13.1 28.05 9 28.05C4.9 28.05 1.95 25.2 1.95 20.8C1.95 16.4 4.6 13.5 9 13.5Z",
  },
  "7": { w: 18, d: "M0.4 1.95H16.6L6.6 33" },
  "6": { w: 18, d: "M1.95 20.4C1.95 16.1 5 12.8 9 12.8C13 12.8 16.05 16.1 16.05 20.4C16.05 24.7 13 28.05 9 28.05C5 28.05 1.95 24.7 1.95 20.4V10C1.95 4.5 5 1.95 9 1.95C12 1.95 14.6 3.4 15.6 6.4" },
  "5": { w: 18, d: "M15.9 1.95H3.7L2.7 14.2C4.3 12.8 6.5 12 9 12C13.3 12 16.05 15 16.05 19.8C16.05 24.9 13 28.05 8.8 28.05C5.6 28.05 3.2 26.6 1.95 24" },
  "4": { w: 19, d: "M13 33V-2M13 1.8L1.95 21.2H18.8" },
  "3": { w: 18, d: "M2.2 6.2C3.2 3.5 5.8 1.95 9 1.95C12.8 1.95 15.3 4.2 15.3 7.6C15.3 11.2 12.6 13.6 8.2 13.6H6.8M8.2 13.6C13.2 13.6 16.05 16.4 16.05 20.6C16.05 25.2 13 28.05 8.9 28.05C5.6 28.05 3.1 26.6 1.95 23.9" },
  "2": { w: 18, d: "M2.2 7.4C2.6 4.1 5.3 1.95 9 1.95C12.9 1.95 15.6 4.3 15.6 7.9C15.6 11.3 13.6 13.8 10 17.3L2.3 28.05H17" },
};
const SW = 5;

/** A rank's index, `h` tall with its top-left at (x, y). Returns [svg, width]. */
function rankSvg(r: number, x: number, y: number, h: number, ink: string): [string, number] {
  const chars = r === 8 ? ["1", "0"] : ["23456789TJQKA"[r]];
  const s = h / 30;
  // the ten is condensed to sit in one column
  const sx = chars.length > 1 ? 0.78 : 1;
  let out = "";
  let cx = 0;
  for (const c of chars) {
    const g = GLYPH[c];
    out += `<g transform="translate(${f1(x + cx * s * sx)} ${f1(y)}) scale(${f1(s * sx)} ${f1(s)})" clip-path="url(#lh-gc)"><path d="${g.d}" fill="none" stroke="${ink}" stroke-width="${SW}" stroke-linejoin="miter" stroke-miterlimit="6"/></g>`;
    cx += g.w - 1.2;
  }
  return [out, (cx + 1.2) * s * sx];
}

// ---- the faces -----------------------------------------------------------------------------------

/** A suit pip, `size` wide, centred on (cx, cy), upside down when `flip`. */
function pip(su: number, ink: string, cx: number, cy: number, size: number, flip = false, detail = false) {
  const inner = `<svg x="${f1(cx - size / 2)}" y="${f1(cy - size / 2)}" width="${f1(size)}" height="${f1(size)}" viewBox="0 0 100 100">${suitSvg(su, ink, detail)}</svg>`;
  return flip ? `<g transform="rotate(180 ${f1(cx)} ${f1(cy)})">${inner}</g>` : inner;
}

/** Where the pips go on 2…10 (columns L C R, rows top → bottom; the lower half printed upside down). */
const PIPS: Record<number, [number, number][]> = (() => {
  const L = 33,
    C = 50,
    R = 67;
  const top = 23,
    bot = 117,
    mid = 70;
  const q1 = top + (bot - top) / 3,
    q2 = top + ((bot - top) * 2) / 3;
  return {
    2: [
      [C, top],
      [C, bot],
    ],
    3: [
      [C, top],
      [C, mid],
      [C, bot],
    ],
    4: [
      [L, top],
      [R, top],
      [L, bot],
      [R, bot],
    ],
    5: [
      [L, top],
      [R, top],
      [C, mid],
      [L, bot],
      [R, bot],
    ],
    6: [
      [L, top],
      [R, top],
      [L, mid],
      [R, mid],
      [L, bot],
      [R, bot],
    ],
    7: [
      [L, top],
      [R, top],
      [C, (top + mid) / 2],
      [L, mid],
      [R, mid],
      [L, bot],
      [R, bot],
    ],
    8: [
      [L, top],
      [R, top],
      [C, (top + mid) / 2],
      [L, mid],
      [R, mid],
      [C, (mid + bot) / 2],
      [L, bot],
      [R, bot],
    ],
    9: [
      [L, top],
      [R, top],
      [L, q1],
      [R, q1],
      [C, mid],
      [L, q2],
      [R, q2],
      [L, bot],
      [R, bot],
    ],
    10: [
      [L, top],
      [R, top],
      [C, (top + q1) / 2],
      [L, q1],
      [R, q1],
      [L, q2],
      [R, q2],
      [C, (q2 + bot) / 2],
      [L, bot],
      [R, bot],
    ],
  };
})();

/** The upper half of a court card's figure (the frame is 52 × 124 at (24, 8); this draws in its top 62). */
function courtHalf(rank: number, su: number) {
  const ink = SUIT_PRINT[su];
  const glow = SUIT_INK[su];
  const seal = sealOf(9000 + rank * 4 + su);
  const ox = 24,
    oy = 8;
  const cx = ox + 26,
    cy = oy + 25;
  const r = 13.5;
  let o = "";
  // the robe: square shoulders, a striped front, a collar; it runs down to the waist (the middle)
  const robe = `M${ox + 4} ${oy + 62}V${oy + 51}Q${ox + 4} ${oy + 42.5} ${ox + 15} ${oy + 41.5}H${ox + 37}Q${ox + 48} ${oy + 42.5} ${ox + 48} ${oy + 51}V${oy + 62}Z`;
  o += `<path d="${robe}" fill="${glow}" fill-opacity="0.5" stroke="${ink}" stroke-width="1.3"/>`;
  let stripes = "";
  for (let x = ox + 8; x <= ox + 44; x += 4) stripes += `M${x} ${oy + 47}V${oy + 62}`;
  o += `<path d="${stripes}" stroke="${ink}" stroke-opacity="0.35" stroke-width="0.8"/>`;
  o += `<path d="M${cx - 9} ${oy + 41.5}L${cx} ${oy + 53}L${cx + 9} ${oy + 41.5}Z" fill="${PAPER}" stroke="${ink}" stroke-width="1.1" stroke-linejoin="round"/>`;
  o += `<path d="M${cx} ${oy + 53}V${oy + 62}" stroke="${ink}" stroke-width="1.4"/>`;
  for (let k = 0; k < 3; k++) o += `<circle cx="${cx}" cy="${oy + 55 + k * 3}" r="0.9" fill="${PAPER}"/>`;
  o += `<rect x="${cx - 4}" y="${cy + r - 1}" width="8" height="${oy + 41.5 - (cy + r - 1)}" fill="${ink}"/>`;
  // the head: J a ring, Q a hexagon, K a double ring
  if (rank === 10) {
    let d = "";
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
      d += `${k ? "L" : "M"}${f1(cx + Math.cos(a) * (r + 1.6))} ${f1(cy + Math.sin(a) * (r + 1.6))}`;
    }
    o += `<path d="${d}Z" fill="${PAPER}" stroke="${ink}" stroke-width="2.4" stroke-linejoin="round"/>`;
  } else {
    o += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${PAPER}" stroke="${ink}" stroke-width="2.4"/>`;
    if (rank === 11) o += `<circle cx="${cx}" cy="${cy}" r="${r - 3.2}" fill="none" stroke="${ink}" stroke-width="0.7"/>`;
  }
  // the face: the seal's sigil
  const c = 2.55;
  const x0 = cx - (7 * c) / 2,
    y0 = cy - (7 * c) / 2;
  for (let y = 0; y < 7; y++)
    for (let x = 0; x < 7; x++) {
      const v = seal.sigil[y][x];
      if (v) o += `<rect x="${f1(x0 + x * c + 0.25)}" y="${f1(y0 + y * c + 0.25)}" width="${f1(c - 0.5)}" height="${f1(c - 0.5)}" fill="${v === 2 ? "#ff6b35" : ink}"/>`;
    }
  // headgear
  const top = cy - r - 0.5;
  if (rank === 11) {
    o += `<path d="M${cx - 10} ${top}L${cx - 11.5} ${top - 8}L${cx - 5} ${top - 4}L${cx} ${top - 10}L${cx + 5} ${top - 4}L${cx + 11.5} ${top - 8}L${cx + 10} ${top}Z" fill="${glow}" stroke="${ink}" stroke-width="1.2" stroke-linejoin="round"/>`;
    for (const dx of [-11.5, 0, 11.5]) o += `<circle cx="${cx + dx}" cy="${top - (dx ? 8 : 10)}" r="1.4" fill="${ink}"/>`;
  } else if (rank === 10) {
    o += `<path d="M${cx - 10} ${top + 1}Q${cx} ${top - 5} ${cx + 10} ${top + 1}" fill="none" stroke="${ink}" stroke-width="1.2"/>`;
    for (let k = 0; k < 3; k++) o += `<circle cx="${cx + (k - 1) * 6.5}" cy="${top - 2.6 + (k === 1 ? -1.6 : 0)}" r="2" fill="${glow}" stroke="${ink}" stroke-width="0.9"/>`;
  } else {
    o += `<path d="M${cx - 12.5} ${cy - 6}C${cx - 11.5} ${cy - 17.5} ${cx + 11.5} ${cy - 17.5} ${cx + 12.5} ${cy - 6}Z" fill="${ink}"/><rect x="${cx - 14}" y="${cy - 7.2}" width="28" height="2.6" rx="1.3" fill="${glow}"/>`;
  }
  // what each one holds: the Jack a viewing key, the Queen an orchard blossom, the King a ⓩ sceptre
  if (rank === 9) {
    const kx = ox + 44,
      ky = oy + 14;
    o += `<circle cx="${kx}" cy="${ky}" r="3.4" fill="none" stroke="${ink}" stroke-width="1.6"/><path d="M${kx} ${ky + 3.4}V${ky + 34}M${kx} ${ky + 27}H${kx - 3.6}M${kx} ${ky + 31}H${kx - 2.8}" stroke="${ink}" stroke-width="1.6" fill="none"/>`;
  } else if (rank === 10) {
    const fx = ox + 7.5,
      fy = oy + 15;
    o += `<path d="M${fx} ${fy + 10}V${fy + 33}" stroke="${ink}" stroke-width="1.4"/><path d="M${fx} ${fy}L${fx + 6} ${fy + 6}L${fx} ${fy + 12}L${fx - 6} ${fy + 6}Z" fill="${glow}" stroke="${ink}" stroke-width="1.1"/><path d="M${fx - 3} ${fy + 3}L${fx + 3} ${fy + 9}M${fx + 3} ${fy + 3}L${fx - 3} ${fy + 9}" stroke="${ink}" stroke-width="0.7"/>`;
  } else {
    const sx = ox + 44.5,
      sy = oy + 10;
    o += `<path d="M${sx} ${sy + 8}V${sy + 40}" stroke="${ink}" stroke-width="1.9"/><circle cx="${sx}" cy="${sy + 3.5}" r="5.2" fill="${PAPER}" stroke="${ink}" stroke-width="1.1"/>${markSvg(sx, sy + 3.5, 8.2, ink, "#ff6b35")}`;
  }
  return o;
}

/** A court card's panel: a framed, double-ended zkSNARK. */
function court(rank: number, su: number) {
  const ink = SUIT_PRINT[su];
  const glow = SUIT_INK[su];
  let o = `<rect x="24" y="8" width="52" height="124" rx="3" fill="${glow}" fill-opacity="0.13"/>`;
  // the cross-hatch behind the figure
  let lat = "";
  for (let k = -8; k <= 8; k++) lat += `M${24 + k * 8} 8L${24 + k * 8 + 52} 132M${76 - k * 8} 8L${76 - k * 8 - 52} 132`;
  o += `<g clip-path="url(#lh-cc)"><path d="${lat}" stroke="${ink}" stroke-opacity="0.12" stroke-width="0.6"/></g>`;
  const half = courtHalf(rank, su);
  o += `<g clip-path="url(#lh-ch)">${half}</g><g transform="rotate(180 50 70)" clip-path="url(#lh-ch)">${half}</g>`;
  o += `<path d="M24 70H76" stroke="${ink}" stroke-width="0.8"/>`;
  o += `<rect x="24" y="8" width="52" height="124" rx="3" fill="none" stroke="${ink}" stroke-width="1.3"/><rect x="26.2" y="10.2" width="47.6" height="119.6" rx="2" fill="none" stroke="${ink}" stroke-opacity="0.5" stroke-width="0.5"/>`;
  // the corner pips inside the frame
  o += pip(su, ink, 31.5, 16, 8) + pip(su, ink, 68.5, 124, 8, true);
  return o;
}

/** An ace: one big suit in a ring of points. */
function ace(su: number) {
  const ink = SUIT_PRINT[su];
  let o = `<circle cx="50" cy="70" r="31" fill="${SUIT_INK[su]}" fill-opacity="0.14"/><circle cx="50" cy="70" r="34.5" fill="none" stroke="${ink}" stroke-width="0.9"/><circle cx="50" cy="70" r="31" fill="none" stroke="${ink}" stroke-width="0.5" stroke-dasharray="1.4 2.2"/>`;
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    o += `<circle cx="${f1(50 + Math.cos(a) * 38.5)}" cy="${f1(70 + Math.sin(a) * 38.5)}" r="${k % 3 ? 0.7 : 1.4}" fill="${ink}"/>`;
  }
  o += pip(su, ink, 50, 70, 42, false, true);
  return o;
}

/** A card's face, viewBox 100 × 140. `compact`: a big rank and a big suit only (a card drawn small). */
const faceCache = new Map<number, string>();
export function faceSvg(card: number, compact = false) {
  const key = card + (compact ? 64 : 0);
  let s = faceCache.get(key);
  if (s) return s;
  const r = card >> 2,
    su = card & 3;
  const ink = SUIT_PRINT[su];
  let body = "";
  if (compact) {
    const [rk] = rankSvg(r, 9, 9, 50, ink);
    body = rk + pip(su, ink, 70, 106, 44, false, true);
    if (r >= 9 && r <= 11) body += `<path d="M9 70H34" stroke="${ink}" stroke-width="2.4" stroke-opacity="0.35"/>`;
  } else {
    const [rk, w] = rankSvg(r, 6, 7.5, 27, ink);
    const corner = `${rk}${pip(su, ink, 6 + Math.max(w, 14) / 2, 46, 14)}`;
    let mid = "";
    if (r === 12) mid = ace(su);
    else if (r >= 9) mid = `<g transform="translate(50 70) scale(0.93 1) translate(-50 -70)">${court(r, su)}</g>`;
    else for (const [x, y] of PIPS[r + 2]) mid += pip(su, ink, x, y, 16.5, y > 70.5);
    body = `${mid}${corner}<g transform="rotate(180 50 70)">${corner}</g>`;
  }
  s = `<svg class="lh-svg" viewBox="0 0 100 140" xmlns="http://www.w3.org/2000/svg"><rect x="0.5" y="0.5" width="99" height="139" rx="7.5" fill="url(#lh-paper)" stroke="#d6cdbb" stroke-width="1"/>${body}<rect x="0.5" y="0.5" width="99" height="139" rx="7.5" fill="url(#lh-sheen)"/></svg>`;
  faceCache.set(key, s);
  return s;
}

/** The back: a paper border, a void field under a flare cross-hatch, the ⓩ mark in a medallion (a data URL). */
let backCache = "";
export function backUrl() {
  if (backCache) return backCache;
  let a = "",
    b = "";
  for (let k = -20; k <= 20; k++) {
    a += `M${k * 9} 0L${k * 9 + 80.8} 140M${k * 9 + 100} 0L${k * 9 + 19.2} 140`;
    b += `M${k * 9 + 4.5} 0L${k * 9 + 85.3} 140M${k * 9 + 104.5} 0L${k * 9 + 23.7} 140`;
  }
  let dots = "";
  for (let y = 0; y < 16; y++) for (let x = 0; x < 12; x++) dots += `M${x * 9 + (y % 2) * 4.5} ${y * 7.8 + 3.9}h0.01`;
  const svg = `<svg viewBox="0 0 100 140" xmlns="http://www.w3.org/2000/svg">
<defs><clipPath id="f"><rect x="6" y="6" width="88" height="128" rx="4"/></clipPath>
<radialGradient id="v" cx="50%" cy="50%" r="65%"><stop offset="0" stop-color="#2a1610"/><stop offset="1" stop-color="#120c0a"/></radialGradient>
<linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.16"/><stop offset="0.45" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>
<rect x="0.5" y="0.5" width="99" height="139" rx="7.5" fill="${PAPER}" stroke="#d6cdbb" stroke-width="1"/>
<rect x="6" y="6" width="88" height="128" rx="4" fill="url(#v)"/>
<g clip-path="url(#f)" fill="none"><path d="${a}" stroke="#ff6b35" stroke-opacity="0.5" stroke-width="0.7"/><path d="${b}" stroke="#ff6b35" stroke-opacity="0.16" stroke-width="0.4"/><path d="${dots}" stroke="#c4b1fc" stroke-opacity="0.5" stroke-width="1.1" stroke-linecap="round"/></g>
<rect x="9.5" y="9.5" width="81" height="121" rx="2.5" fill="none" stroke="${PAPER}" stroke-opacity="0.75" stroke-width="0.7"/>
<rect x="11.5" y="11.5" width="77" height="117" rx="1.5" fill="none" stroke="#ff6b35" stroke-opacity="0.8" stroke-width="0.5"/>
<ellipse cx="50" cy="70" rx="23" ry="27" fill="#120c0a" stroke="${PAPER}" stroke-opacity="0.85" stroke-width="1.1"/>
<ellipse cx="50" cy="70" rx="19.5" ry="23.5" fill="none" stroke="#ff6b35" stroke-width="0.6" stroke-dasharray="1.2 1.6"/>
${markSvg(50, 70, 26, PAPER, "#ff6b35")}
${[
  [18, 20],
  [82, 20],
  [18, 120],
  [82, 120],
]
  .map(([x, y]) => `<path d="M${x} ${y - 4}L${x + 4} ${y}L${x} ${y + 4}L${x - 4} ${y}Z" fill="${PAPER}" fill-opacity="0.85"/>`)
  .join("")}
<rect x="0.5" y="0.5" width="99" height="139" rx="7.5" fill="url(#g)"/>
</svg>`;
  backCache = `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
  return backCache;
}

// ---- chips ---------------------------------------------------------------------------------------

/** The play chips: value, clay colour, edge-spot colour. */
export const DENOMS: { v: number; c: string; e: string }[] = [
  { v: 25000, c: "#e8487a", e: "#f7f3ea" },
  { v: 5000, c: "#d9bc8a", e: "#2a2018" },
  { v: 1000, c: "#8fc6d8", e: "#123848" },
  { v: 500, c: "#ab94f0", e: "#f7f3ea" },
  { v: 100, c: "#24201f", e: "#ff6b35" },
  { v: 25, c: "#56a876", e: "#f7f3ea" },
  { v: 5, c: "#f0612c", e: "#f7f3ea" },
  { v: 1, c: "#e6e1d6", e: "#3b3633" },
];
/** A chip seen at three quarters: radius, its ellipse's half height, its thickness (chip units: 20 wide). */
const RX = 10,
  RY = 5.2,
  TH = 2.7;

const shade = (hex: string, k: number) => {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k)));
  return `rgb(${ch(n >> 16)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
};

/** A chip's edge (its side band, the spots running through it), spots turned by `phi`. */
function chipSide(d: { c: string; e: string }, phi: number) {
  const ell = (t: number) => [RX - RX * Math.cos(t), RY + RY * Math.sin(t)] as const;
  let o = `<path d="M0 ${RY}A${RX} ${RY} 0 0 0 ${RX * 2} ${RY}V${RY + TH}A${RX} ${RY} 0 0 1 0 ${RY + TH}Z" fill="${shade(d.c, -0.18)}"/>`;
  const w = 0.2;
  for (let k = 0; k < 6; k++) {
    const mid = (((phi + (k * Math.PI) / 3) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const a = Math.max(0.02, mid - w),
      b = Math.min(Math.PI - 0.02, mid + w);
    if (b <= a) continue;
    const [x1, y1] = ell(a),
      [x2, y2] = ell(b);
    o += `<path d="M${f1(x1)} ${f1(y1)}A${RX} ${RY} 0 0 0 ${f1(x2)} ${f1(y2)}V${f1(y2 + TH)}A${RX} ${RY} 0 0 1 ${f1(x1)} ${f1(y1 + TH)}Z" fill="${d.e}"/>`;
  }
  o += `<path d="M0 ${RY}A${RX} ${RY} 0 0 0 ${RX * 2} ${RY}V${RY + TH}A${RX} ${RY} 0 0 1 0 ${RY + TH}Z" fill="url(#lh-cshade)"/>`;
  o += `<path d="M0 ${RY + TH}A${RX} ${RY} 0 0 0 ${RX * 2} ${RY + TH}" fill="none" stroke="#000" stroke-opacity="0.45" stroke-width="0.35"/>`;
  return o;
}

/** A chip's top face: the clay, six edge spots, a dashed ring and its inlay. */
function chipTop(d: { c: string; e: string }) {
  let o = `<ellipse cx="${RX}" cy="${RY}" rx="${RX}" ry="${RY}" fill="${d.c}"/>`;
  const at = (r: number, t: number) => `${f1(RX + r * RX * Math.cos(t))} ${f1(RY + r * RY * Math.sin(t))}`;
  for (let k = 0; k < 6; k++) {
    const t = 0.35 + (k * Math.PI) / 3,
      w = 0.2;
    o += `<path d="M${at(0.99, t - w)}L${at(0.99, t + w)}L${at(0.76, t + w * 0.82)}L${at(0.76, t - w * 0.82)}Z" fill="${d.e}"/>`;
  }
  o += `<ellipse cx="${RX}" cy="${RY}" rx="${RX * 0.66}" ry="${RY * 0.66}" fill="none" stroke="${d.e}" stroke-width="0.45" stroke-dasharray="0.9 0.8" stroke-opacity="0.85"/>`;
  o += `<ellipse cx="${RX}" cy="${RY}" rx="${RX * 0.5}" ry="${RY * 0.5}" fill="${shade(d.c, 0.22)}"/>`;
  o += `<rect x="${RX + 1}" y="${RY + 0.35}" width="1.5" height="0.85" rx="0.25" fill="${d.e}" fill-opacity="0.8"/>`;
  o += `<path d="M${RX + 0.9} ${RY + 0.2}A1.7 0.95 0 1 0 ${RX + 0.4} ${RY + 0.9}" fill="none" stroke="${d.e}" stroke-opacity="0.8" stroke-width="0.4"/>`;
  o += `<ellipse cx="${RX}" cy="${RY}" rx="${RX}" ry="${RY}" fill="url(#lh-ctop)"/>`;
  return o;
}

/** The shared pieces every face and pile points at (put once in the page, hidden). */
export function spriteSvg() {
  let chips = "";
  DENOMS.forEach((d, k) => {
    chips += `<g id="lh-cs${k}a">${chipSide(d, 0.25)}</g><g id="lh-cs${k}b">${chipSide(d, 0.78)}</g><g id="lh-ct${k}">${chipTop(d)}</g>`;
  });
  return `<svg class="lh-sprite" width="0" height="0" aria-hidden="true" style="position:absolute"><defs>
<clipPath id="lh-gc" clipPathUnits="userSpaceOnUse"><rect x="-6" y="-0.6" width="40" height="31.2"/></clipPath>
<clipPath id="lh-ch" clipPathUnits="userSpaceOnUse"><rect x="24" y="8" width="52" height="62"/></clipPath>
<clipPath id="lh-cc" clipPathUnits="userSpaceOnUse"><rect x="24" y="8" width="52" height="124" rx="3"/></clipPath>
<linearGradient id="lh-paper" x1="0" y1="0" x2="0.3" y2="1"><stop offset="0" stop-color="#fbf8f1"/><stop offset="1" stop-color="#efe8da"/></linearGradient>
<linearGradient id="lh-sheen" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.35"/><stop offset="0.3" stop-color="#fff" stop-opacity="0"/><stop offset="0.85" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.06"/></linearGradient>
<linearGradient id="lh-cshade" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000" stop-opacity="0.5"/><stop offset="0.3" stop-color="#000" stop-opacity="0.06"/><stop offset="0.42" stop-color="#fff" stop-opacity="0.1"/><stop offset="0.7" stop-color="#000" stop-opacity="0.08"/><stop offset="1" stop-color="#000" stop-opacity="0.55"/></linearGradient>
<radialGradient id="lh-ctop" cx="0.35" cy="0.25" r="0.8"><stop offset="0" stop-color="#fff" stop-opacity="0.22"/><stop offset="0.6" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.12"/></radialGradient>
${chips}</defs></svg>`;
}

/** An amount broken into chips: per denomination index, how many. */
export function breakdown(amount: number): [number, number][] {
  const out: [number, number][] = [];
  let left = Math.max(0, Math.round(amount));
  DENOMS.forEach((d, k) => {
    const n = Math.floor(left / d.v);
    if (n > 0) {
      out.push([k, n]);
      left -= n * d.v;
    }
  });
  return out;
}

/**
 * A pile of chips for an amount: one column per denomination (split past `per` chips), up to `cols`
 * columns in front and as many behind, big ones at the back. Sized by the CSS `--chip` (a chip's width).
 */
export function pileSvg(amount: number, cols = 3, per = 10) {
  if (amount <= 0) return "";
  const stacks: [number, number][] = [];
  for (const [k, n] of breakdown(amount)) for (let left = n; left > 0; left -= per) stacks.push([k, Math.min(per, left)]);
  const shown = stacks.slice(0, cols * 2);
  const front = shown.slice(-Math.min(cols, shown.length));
  const back = shown.slice(0, shown.length - front.length);
  const step = 20.6;
  const tallest = Math.max(...shown.map((s) => s[1]));
  const W = Math.max(front.length, back.length + (back.length ? 0.5 : 0)) * step + 0.6;
  const backLift = back.length ? 6.4 : 0;
  const H = RY * 2 + TH + (tallest - 1) * TH + backLift + 0.6;
  let o = "";
  let seed = (amount * 2654435761) >>> 0;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0), seed / 4294967296);
  const col = (x: number, base: number, k: number, n: number) => {
    for (let i = 0; i < n; i++) o += `<use href="#lh-cs${k}${rnd() < 0.5 ? "a" : "b"}" x="${f1(x + (rnd() - 0.5) * 0.9)}" y="${f1(base - i * TH)}"/>`;
    o += `<use href="#lh-ct${k}" x="${f1(x + (rnd() - 0.5) * 0.5)}" y="${f1(base - (n - 1) * TH)}"/>`;
  };
  // (the bottom chip's ellipse top sits at `base`)
  const baseFront = H - (RY * 2 + TH) - 0.3;
  back.forEach(([k, n], i) => col(0.3 + step * 0.5 + i * step, baseFront - backLift, k, n));
  front.forEach(([k, n], i) => col(0.3 + i * step, baseFront, k, n));
  return `<svg class="lh-pile" viewBox="0 0 ${f1(W)} ${f1(H)}" style="width:calc(var(--chip) * ${f1(W / 20)});height:calc(var(--chip) * ${f1(H / 20)})">${o}</svg>`;
}

/** The dealer puck, at three quarters like the chips: cream acrylic, a flare ring, a "D". */
export function puckSvg() {
  return `<svg class="lh-puck-svg" viewBox="0 0 40 27" xmlns="http://www.w3.org/2000/svg">
<ellipse cx="20" cy="18" rx="19" ry="8.6" fill="#000" fill-opacity="0.35"/>
<path d="M1 12.5A19 8.6 0 0 0 39 12.5V16.5A19 8.6 0 0 1 1 16.5Z" fill="#cfc6b4"/>
<path d="M1 12.5A19 8.6 0 0 0 39 12.5V16.5A19 8.6 0 0 1 1 16.5Z" fill="url(#lh-cshade)"/>
<ellipse cx="20" cy="12.5" rx="19" ry="8.6" fill="#f4efe4"/>
<ellipse cx="20" cy="12.5" rx="15.6" ry="7" fill="none" stroke="#ff6b35" stroke-width="1"/>
<g transform="translate(20 12.5) scale(1 0.46)"><path d="M-5.2 -9.2V9.2H-0.6C5.4 9.2 7.6 5.2 7.6 0C7.6 -5.2 5.4 -9.2 -0.6 -9.2Z" fill="none" stroke="#14100e" stroke-width="3.4" stroke-linejoin="miter"/></g>
<ellipse cx="20" cy="12.5" rx="19" ry="8.6" fill="url(#lh-ctop)"/>
</svg>`;
}
