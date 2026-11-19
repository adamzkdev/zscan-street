/**
 * A number in [0, 1) carried in the four bytes of an ordinary RGBA8 pixel: what the GPU picks
 * (a depth, a height) reads back on any device, with no float render target or extension needed.
 * About seven significant digits: a millimetre at a few tens of metres. (1 itself, the far plane:
 * all four bytes zero, read as nothing.)
 */
export const PACK_GLSL = `vec4 packUnit(float v){ vec4 e = fract(max(v, 0.) * vec4(1., 255., 65025., 16581375.)); e -= e.yzww * vec4(1. / 255., 1. / 255., 1. / 255., 0.); return e; }`;

/** The number back from the pixel's bytes at `i` (all four zero: nothing was drawn there). */
export function unpack(px: Uint8Array, i = 0) {
  return px[i] / 255 + px[i + 1] / 65025 + px[i + 2] / 16581375 + px[i + 3] / 4228250625;
}
