import { C, CM, E, G, MAT, VoxelModel } from "../scene/voxel/model";

/**
 * The game's own cars as voxel models, in the street's vehicle convention (scene/voxel/vehicles.ts):
 * the front points to +x, the passenger side is +z, the wheel arches are left open (the wheels are
 * their own meshes, they turn and steer).
 */

/** Where each model's wheels sit (voxels from the back) and its size (voxels). */
export const GT_SPEC = { w: 27, d: 12, h: 8, wheels: [6, 21] };

/**
 * The ZK-GT: a low mid-engined coupé in Zcash gold, carbon roof and wing, a light bar across the
 * back, the shield's gold glowing under the sills.
 */
export function gtModel(paint = "#e8a91c", accent = "#15151b", glow = "#f4b728") {
  const { w, d } = GT_SPEC;
  const m = new VoxelModel(w, 9, d);
  const body = CM(paint, MAT.paint),
    deep = CM("#c98a12", MAT.paint),
    dark = CM(accent, MAT.paint),
    glass = G("#2c3d5c"),
    black = C("#0b0b10");
  // the tub: low and wide, the nose dropping toward the front
  m.box(1, 1, 0, w - 1, 3, d, body);
  m.box(0, 1, 1, w, 2, d - 1, body);
  m.box(w - 1, 2, 1, w, 3, d - 1, deep);
  // the rear deck over the engine, a step higher; the bonnet a step lower in front of the glass
  m.box(1, 3, 1, 9, 4, d - 1, body);
  m.box(19, 3, 2, 22, 4, d - 2, body);
  // the cabin: a glass bubble, the screen raked forward
  m.box(9, 3, 1, 18, 6, d - 1, glass);
  m.box(10, 6, 2, 17, 7, d - 2, body);
  m.box(17, 3, 1, 19, 5, d - 1, glass);
  m.box(8, 3, 2, 9, 5, d - 2, glass);
  // pillars in the paint
  for (const z of [1, d - 2]) {
    m.box(16, 3, z, 17, 6, z + 1, body);
    m.box(9, 3, z, 10, 6, z + 1, body);
  }
  // a black roof stripe and the bonnet's twin stripes
  m.box(10, 6, 5, 17, 7, 7, dark);
  for (const z of [4, 7]) m.box(19, 2, z, w - 1, 3, z + 1, dark);
  // the engine cover: two slats
  for (const x of [3, 6]) m.box(x, 3, 3, x + 1, 4, d - 3, dark);
  // side intakes behind the doors, sills
  for (const z of [0, d - 1]) {
    m.box(6, 1, z, 9, 3, z + 1, black);
    m.box(3, 0, z, w - 3, 1, z + 1, dark);
  }
  // the wing on two posts
  m.box(1, 4, 3, 2, 5, 4, black);
  m.box(1, 4, d - 4, 2, 5, d - 3, black);
  m.box(0, 5, 1, 3, 6, d - 1, dark);
  // lights: thin headlamps, a light bar across the back
  m.box(w - 1, 2, 1, w, 3, 4, E("#eaf6ff", 3.2));
  m.box(w - 1, 2, d - 4, w, 3, d - 1, E("#eaf6ff", 3.2));
  m.box(0, 2, 1, 1, 3, d - 1, E("#ff2a1a", 2.6));
  // the diffuser, the exhausts and the gold under the sills
  m.box(0, 1, 2, 1, 2, d - 2, black);
  m.box(0, 1, 5, 1, 2, 7, C("#3a3a42"));
  m.box(4, 0, 1, w - 4, 1, 2, E(glow, 1.8));
  m.box(4, 0, d - 2, w - 4, 1, d - 1, E(glow, 1.8));
  // the wheel arches
  for (const x of GT_SPEC.wheels) {
    m.clear(x - 2, 0, 0, x + 3, 3, 2);
    m.clear(x - 2, 0, d - 2, x + 3, 3, d);
  }
  return m;
}

/** Where the bike's wheels sit (voxels from the back) and its size (voxels). */
export const MOTO_SPEC = { w: 14, d: 4, h: 7, wheels: [2.5, 11.5] };

/**
 * The ZK-R: a sport bike in gold and black, a fairing over the front, a tank, the seat, a tail
 * light; the wheels are their own meshes (they turn). The rider sits on it at `MOTO_SEAT`.
 */
export function motoModel(paint = "#e8a91c", accent = "#15151b") {
  const { w, d } = MOTO_SPEC;
  const m = new VoxelModel(w, 8, d);
  const body = CM(paint, MAT.paint),
    dark = CM(accent, MAT.paint),
    metal = C("#7a7c86"),
    glass = G("#2c3d5c");
  // the frame and the engine between the wheels
  m.box(4, 1, 1, 10, 3, 3, dark);
  m.box(5, 1, 1, 9, 2, 3, metal);
  // the exhaust under the tail
  m.box(1, 2, 3, 5, 3, 4, metal);
  // the tank and the seat
  m.box(7, 3, 1, 11, 5, 3, body);
  m.box(3, 3, 1, 7, 4, 3, dark);
  // the tail, with its light
  m.box(1, 4, 1, 4, 5, 3, body);
  m.box(0, 4, 1, 1, 5, 3, E("#ff2a1a", 2.6));
  // the fairing and the screen, the headlight
  m.box(11, 2, 0, 13, 5, 4, body);
  m.box(12, 5, 1, 13, 6, 3, glass);
  m.box(13, 3, 1, 14, 4, 3, E("#eaf6ff", 3.2));
  // the forks down to the front wheel, the bars
  m.box(11, 1, 1, 12, 2, 3, metal);
  m.box(10, 5, 0, 11, 6, 4, dark);
  // the swingarm to the back wheel
  m.box(2, 1, 1, 5, 2, 3, metal);
  return m;
}
/** The rider's seat over the ground (m) and along the bike (m from its middle, + forward). */
export const MOTO_SEAT = { y: 0.74, x: -0.22 };
