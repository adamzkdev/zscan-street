/**
 * ZK PARTY's shared collisions, on the ground plane (x, z): what a mini-game needs so that bodies
 * are solid, bounce the same at any frame rate and never pass through a wall.
 *
 * Everything works on plain `{ x, z }` points (a THREE.Vector3 is one) and changes them in place.
 * Nothing here reads the clock or a random: it is safe inside an online lockstep tick.
 *
 *   const n = steps(speed, dt, r);                    // sub-steps so a fast body never skips a wall
 *   if (pushApart(a.pos, b.pos, ra, rb)) bounce(a.vel, b.vel, HIT, ma, mb, 0.6);
 *   if (outOfBox(p.pos, r, box)) slide(p.vel, HIT);   // HIT.nx, HIT.nz: the contact's normal
 *   outOfSegment(p.pos, r, ax, az, bx, bz);           // a wall of any angle
 *   keepInCircle(p.pos, r, cx, cz, R);                // a round arena's rim (keepOutOfCircle: a pillar)
 */

export interface P2 {
  x: number;
  z: number;
}

/** The last contact: its normal (unit, pointing out of the obstacle, toward the body pushed) and its depth. */
export const HIT = { nx: 0, nz: 0, depth: 0 };

/**
 * How many equal sub-steps a frame needs so a body moving at `speed` never travels more than half its
 * radius `r` in one (1..max): step the moves and the collisions that many times with `dt / n`.
 */
export function steps(speed: number, dt: number, r: number, max = 8) {
  const n = Math.ceil((speed * dt) / Math.max(1e-4, r * 0.5));
  return n < 1 ? 1 : n > max ? max : n;
}

/**
 * Two discs that overlap are moved apart along the line between their centres. `share` is how much of
 * the move `a` takes (0.5: both the same; 1: `b` is a wall; by mass: mb / (ma + mb)). True when they
 * touched; HIT's normal points from b to a.
 */
export function pushApart(a: P2, b: P2, ra: number, rb: number, share = 0.5) {
  let dx = a.x - b.x;
  let dz = a.z - b.z;
  const rr = ra + rb;
  const d2 = dx * dx + dz * dz;
  if (d2 >= rr * rr) return false;
  let d = Math.sqrt(d2);
  if (d < 1e-6) {
    // (one on top of the other: apart along x, always the same way)
    dx = 1;
    dz = 0;
    d = 1;
  }
  const nx = dx / d;
  const nz = dz / d;
  const depth = rr - (d2 < 1e-12 ? 0 : d);
  a.x += nx * depth * share;
  a.z += nz * depth * share;
  b.x -= nx * depth * (1 - share);
  b.z -= nz * depth * (1 - share);
  HIT.nx = nx;
  HIT.nz = nz;
  HIT.depth = depth;
  return true;
}

/**
 * The bounce of two bodies along a contact's normal `n` (from b to a): an impulse that conserves
 * momentum, `e` the restitution (0: they stop against each other, 1: a perfect bounce). Nothing when
 * they are already parting. Returns the closing speed (how hard they hit; 0 when parting).
 */
export function bounce(va: P2, vb: P2, n: { nx: number; nz: number }, ma = 1, mb = 1, e = 0.5) {
  const rel = (va.x - vb.x) * n.nx + (va.z - vb.z) * n.nz;
  if (rel >= 0) return 0;
  const j = (-(1 + e) * rel) / (1 / ma + 1 / mb);
  va.x += (j / ma) * n.nx;
  va.z += (j / ma) * n.nz;
  vb.x -= (j / mb) * n.nx;
  vb.z -= (j / mb) * n.nz;
  return -rel;
}

/**
 * A velocity against a wall of normal `n`: the part going into the wall is turned back by `e` (0: it
 * slides along the wall, keeping all its speed along it; 1: a full bounce). Returns the speed into the wall.
 */
export function slide(v: P2, n: { nx: number; nz: number }, e = 0) {
  const into = v.x * n.nx + v.z * n.nz;
  if (into >= 0) return 0;
  v.x -= (1 + e) * into * n.nx;
  v.z -= (1 + e) * into * n.nz;
  return -into;
}

export interface Box2 {
  /** Its centre and its half sizes. */
  x: number;
  z: number;
  hw: number;
  hd: number;
}

/**
 * A disc out of an axis-aligned box: moved out by the shortest way (round the corners, so it slides
 * round them instead of catching). True when it touched; HIT's normal points out of the box.
 */
export function outOfBox(p: P2, r: number, b: Box2) {
  const lx = p.x - b.x;
  const lz = p.z - b.z;
  const cx = lx < -b.hw ? -b.hw : lx > b.hw ? b.hw : lx;
  const cz = lz < -b.hd ? -b.hd : lz > b.hd ? b.hd : lz;
  const dx = lx - cx;
  const dz = lz - cz;
  const d2 = dx * dx + dz * dz;
  if (d2 > 0) {
    // the centre is outside: away from the nearest point of the box
    if (d2 >= r * r) return false;
    const d = Math.sqrt(d2);
    HIT.nx = dx / d;
    HIT.nz = dz / d;
    HIT.depth = r - d;
  } else {
    // the centre is inside: out through the nearest side
    const px = b.hw - Math.abs(lx);
    const pz = b.hd - Math.abs(lz);
    if (px < pz) {
      HIT.nx = lx < 0 ? -1 : 1;
      HIT.nz = 0;
      HIT.depth = px + r;
    } else {
      HIT.nx = 0;
      HIT.nz = lz < 0 ? -1 : 1;
      HIT.depth = pz + r;
    }
  }
  p.x += HIT.nx * HIT.depth;
  p.z += HIT.nz * HIT.depth;
  return true;
}

/** A disc out of a wall from (ax, az) to (bx, bz), of any angle (round ends). True when it touched. */
export function outOfSegment(p: P2, r: number, ax: number, az: number, bx: number, bz: number) {
  const ex = bx - ax;
  const ez = bz - az;
  const l2 = ex * ex + ez * ez;
  let t = l2 > 0 ? ((p.x - ax) * ex + (p.z - az) * ez) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const dx = p.x - (ax + ex * t);
  const dz = p.z - (az + ez * t);
  const d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return false;
  const d = Math.sqrt(d2);
  if (d < 1e-6) {
    // (right on the wall: out on its left side)
    const l = Math.sqrt(l2) || 1;
    HIT.nx = -ez / l;
    HIT.nz = ex / l;
  } else {
    HIT.nx = dx / d;
    HIT.nz = dz / d;
  }
  HIT.depth = r - d;
  p.x += HIT.nx * HIT.depth;
  p.z += HIT.nz * HIT.depth;
  return true;
}

/** A disc kept inside a round arena of radius `R` at (cx, cz). True when it was at the rim; HIT's normal points inward. */
export function keepInCircle(p: P2, r: number, cx: number, cz: number, R: number) {
  const dx = p.x - cx;
  const dz = p.z - cz;
  const lim = R - r;
  const d2 = dx * dx + dz * dz;
  if (d2 <= lim * lim) return false;
  const d = Math.sqrt(d2);
  HIT.nx = -dx / d;
  HIT.nz = -dz / d;
  HIT.depth = d - lim;
  p.x = cx + (dx / d) * lim;
  p.z = cz + (dz / d) * lim;
  return true;
}

const PILLAR: P2 = { x: 0, z: 0 };
/** A disc out of a round pillar of radius `R` at (cx, cz). True when it touched; HIT's normal points out of the pillar. */
export function keepOutOfCircle(p: P2, r: number, cx: number, cz: number, R: number) {
  PILLAR.x = cx;
  PILLAR.z = cz;
  return pushApart(p, PILLAR, r, R, 1);
}

/** A speed's decay that is the same at any frame rate: `v *= damp(k, dt)` loses `k` of it per second (k per second, as exp(-k·dt)). */
export const damp = (k: number, dt: number) => Math.exp(-k * dt);

/** A value eased toward a target at any frame rate (`k` per second): `x += (target - x) * ease(k, dt)`. */
export const ease = (k: number, dt: number) => 1 - Math.exp(-k * dt);
