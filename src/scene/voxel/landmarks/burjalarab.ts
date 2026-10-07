import type { Built } from "../buildings";
import { C, E, G, hash, rand, shades, VoxelModel, type Paint } from "../model";
import type { SignSpot } from "../parts";
import type { LandmarkOpts } from "./index";
import { lotSize } from "./lot";

/**
 * BURJ AL ZEC, the sail hotel on its own island off the Palm. Two wings of rooms meet at the
 * mast in a V, closed at the front by the white fabric sail, which bellies out at the bottom and
 * tapers to the top; the two curved legs frame the sail and the white steel truss with its giant
 * X braces runs up both sides; the mast climbs on past the roof to the spire. Near the top, the
 * helipad disc cantilevers out on one side and the Al Muntaha restaurant on the other. On the
 * island: the entrance podium with its gold canopy, the fountain court, the terrace pools and
 * cabanas at the back, rock armour; a curved bridge runs to the city quay. At night the sail is
 * washed in colour from its foot and the legs and helipad are lined with lights.
 *
 * Scale 2. The model sits with y = 0 at the bay's water level and reaches 16 voxels past its
 * lot's front, across the water to the quay. Points: `door`, `keeper`, `helipad`, `camPos`,
 * `camLook`, `sailFoot`, `sailTop` (for a colour wash on the fabric).
 */
export function burjalarab(seed: number, o: LandmarkOpts): Built {
  const k = 2;
  const { W, D: DL } = lotSize(o, k);
  const EXT = 16;
  const D = DL + EXT;
  const H = 206;
  const m = new VoxelModel(W, H, D);
  const rnd = rand(seed * 17 + 3);
  const cx = W / 2;
  const signs: SignSpot[] = [];
  const lights: Built["lights"] = [];

  const white = shades(["#f6f6f2", "#f1f1ec", "#f8f8f6"], 2, seed);
  const steel = shades(["#e8eaec", "#e0e2e6"], 2, seed + 1);
  // the fabric: white panels; its seams carry the night's colour show (violet at the foot, blue, then rose to the top)
  const SEAM = ["#c8b8ff", "#b8d4ff", "#bfe8ff", "#f0c8ff", "#ffc8e4"];
  const fabric = (x: number, y: number) => (x % 5 === 0 && y % 3 !== 0 ? E(SEAM[Math.min(4, Math.floor(y / 36))], 0.95) : y % 9 === 0 ? C("#e8eaea") : C("#fbfbf8"));
  const glass = G("#4a6a82");
  const glassDark = G("#2c4258");
  const lit = E("#ffd8a0", 1.2);
  const gold = C("#d9b25a");
  const sand = shades(["#ecdcae", "#e6d5a4"], 2, seed + 2);
  const rock = shades(["#8f897c", "#837d71", "#9a9487"], 1, seed + 3);
  const pave = shades(["#e8e0d0", "#e0d8c8", "#ece6d8"], 2, seed + 4);
  const pool = E("#45d0e6", 0.85);
  const leaf = [C("#3f8f3a"), C("#4fa046"), C("#2f7a32")];

  // ---- the island ---------------------------------------------------------------------------------
  const IC = { x: cx, z: 34 },
    IRX = 26,
    IRZ = 28;
  const isl = (x: number, z: number) => {
    const ang = Math.atan2(z - IC.z, x - IC.x);
    const wob = 1 + 0.04 * Math.sin(ang * 5 + 1) + 0.03 * Math.sin(ang * 9);
    return Math.hypot((x - IC.x) / IRX, (z - IC.z) / IRZ) / wob;
  };
  const TOPY = 4;
  for (let z = 0; z < DL; z++)
    for (let x = 0; x < W; x++) {
      const r = isl(x + 0.5, z + 0.5);
      if (r > 1) continue;
      const e = (1 - r) * Math.min(IRX, IRZ); // voxels from the edge
      if (e < 2) {
        m.box(x, 0, z, x + 1, 2, z + 1, rock);
        continue;
      }
      if (e < 3.5) {
        m.box(x, 0, z, x + 1, 3, z + 1, rock);
        continue;
      }
      m.box(x, 0, z, x + 1, TOPY - 1, z + 1, sand);
      m.set(x, TOPY - 1, z, e < 5 ? rock : pave);
    }
  // boulders round the rim
  for (let a = 0; a < Math.PI * 2; a += 0.09) {
    const x = IC.x + Math.cos(a) * IRX * 0.99,
      z = IC.z + Math.sin(a) * IRZ * 0.99;
    m.blob(x, 1.4, z, 1.5 + rnd() * 0.9, rock, 0.3, seed + Math.round(a * 50));
  }

  // ---- the sail tower -----------------------------------------------------------------------------
  const ZM = 14; // the mast, at the back
  const TOP = 168; // the roof
  const dep = (y: number) => {
    const t = Math.min(1, Math.max(0, (y - TOPY) / (TOP - TOPY)));
    return 5 + 31 * Math.pow(1 - Math.pow(t, 2.1), 0.62);
  };
  const hwMax = (y: number) => {
    const t = Math.min(1, Math.max(0, (y - TOPY) / (TOP - TOPY)));
    return 4 + 11 * Math.pow(1 - Math.pow(t, 1.8), 0.7);
  };
  const hw = (s: number, y: number) => Math.min(hwMax(y), 2.5 + s * 0.55);
  for (let y = TOPY; y < TOP; y++) {
    const dp = dep(y);
    for (let z = ZM; z <= ZM + Math.ceil(dp); z++) {
      const s = z + 0.5 - ZM;
      if (s > dp) continue;
      const h = hw(s, y);
      for (let x = Math.floor(cx - h); x < Math.ceil(cx + h); x++) {
        const a = Math.abs(x + 0.5 - cx);
        if (a > h) continue;
        let c: Paint;
        const fl = (y - TOPY) % 6;
        if (s > dp - 1.6) c = fabric(x, y); // the sail
        else if (a > h - 1.3) {
          // the wings' outer faces: a floor of glass between white slabs, balconies of light
          if (fl === 0) c = white;
          else if (fl === 5) c = steel;
          else if (z % 4 === 0) c = steel;
          else c = hash(Math.floor(z / 4), Math.floor(y / 6), x > cx ? 1 : 0, seed + 9) < 0.14 ? lit : fl === 4 ? glassDark : glass;
        } else if (s < 1.5) c = white;
        else c = white;
        m.set(x, y, z, c);
      }
    }
  }
  // the roof: a white cap and the curve over the top of the sail
  for (let z = ZM; z < ZM + 8; z++) for (let x = Math.floor(cx - 4); x < Math.ceil(cx + 4); x++) m.set(x, TOP, z, white);

  /** A 3D line of voxels `t` thick. */
  const line = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, c: Paint, t = 1) => {
    const n = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0)) * 1.5) + 1;
    for (let i = 0; i <= n; i++) {
      const f = i / n;
      const x = x0 + (x1 - x0) * f,
        y = y0 + (y1 - y0) * f,
        z = z0 + (z1 - z0) * f;
      if (t <= 1) m.set(x, y, z, c);
      else m.box(Math.round(x - t / 2), Math.round(y - t / 2), Math.round(z - t / 2), Math.round(x - t / 2) + t, Math.round(y - t / 2) + t, Math.round(z - t / 2) + t, c);
    }
  };

  // the legs: along the sail's two edges, a little outside, curving in to the mast over the roof
  const legAt = (y: number, sx: number): [number, number, number] => {
    const dp = dep(y);
    return [cx + sx * (hw(dp, y) + 1.2), y, ZM + dp - 1.5];
  };
  for (const sx of [-1, 1]) {
    let p = legAt(TOPY, sx);
    for (let y = TOPY + 2; y <= TOP; y += 2) {
      const q = legAt(y, sx);
      line(p[0], p[1], p[2], q[0], q[1], q[2], steel, 2);
      p = q;
    }
    // over the roof, the legs arc together into the mast
    for (let i = 1; i <= 8; i++) {
      const f = i / 8;
      const q: [number, number, number] = [cx + sx * (hw(dep(TOP), TOP) + 1.2) * (1 - f), TOP + Math.sin(f * Math.PI * 0.5) * 9, ZM + dep(TOP) - 1.5 - f * (dep(TOP) - 3)];
      line(p[0], p[1], p[2], q[0], q[1], q[2], steel, 2);
      p = q;
    }
    // the exoskeleton: the rear chord and the giant X braces on the side
    const rear = (y: number): [number, number, number] => {
      const s = dep(y) * 0.18;
      return [cx + sx * (hw(s, y) + 1.4), y, ZM + s];
    };
    let r0 = rear(TOPY);
    for (let y = TOPY + 3; y <= TOP; y += 3) {
      const r1 = rear(y);
      line(r0[0], r0[1], r0[2], r1[0], r1[1], r1[2], steel, 1);
      r0 = r1;
    }
    const STEP = 27;
    for (let y = TOPY + 2; y + STEP <= TOP + 4; y += STEP) {
      const a = legAt(y, sx),
        b = rear(y + STEP),
        c = rear(y),
        d = legAt(Math.min(TOP, y + STEP), sx);
      line(a[0], a[1], a[2], b[0], b[1], b[2], steel, 2);
      line(c[0], c[1], c[2], d[0], d[1], d[2], steel, 2);
      // the horizontal tie
      line(c[0], c[1], c[2], a[0], a[1], a[2], steel, 1);
    }
  }
  // the mast at the back and the spire
  m.box(Math.round(cx - 2), TOPY, ZM - 3, Math.round(cx + 2), TOP + 10, ZM + 1, white);
  m.box(Math.round(cx - 1), TOP + 10, ZM - 2, Math.round(cx + 2), TOP + 22, ZM + 1, white);
  m.box(Math.round(cx - 1), TOP + 22, ZM - 2, Math.round(cx + 1), TOP + 34, ZM, steel);
  m.box(Math.round(cx - 1), TOP + 34, ZM - 2, Math.round(cx), TOP + 36, ZM - 1, E("#ff4a3a", 2.6));
  // aircraft lights up the mast
  for (let y = TOPY + 30; y < TOP; y += 30) m.set(Math.round(cx), y, ZM - 4, E("#ff5a4a", 2));

  // ---- the helipad (+x side) and Al Muntaha (-x side) -------------------------------------------
  const HY = 150;
  const hpx = Math.round(cx + hwMax(HY) + 11),
    hpz = ZM + 5;
  const HR = 10.5;
  {
    // the deck: a disc, a ring and the H, lights round the rim
    for (let z = Math.floor(hpz - HR); z <= Math.ceil(hpz + HR); z++)
      for (let x = Math.floor(hpx - HR); x <= Math.ceil(hpx + HR); x++) {
        const r = Math.hypot(x + 0.5 - hpx, z + 0.5 - hpz);
        if (r > HR) continue;
        m.set(x, HY - 1, z, steel);
        m.set(x, HY - 2, z, C("#9a9ca4"));
        const ax = Math.abs(x + 0.5 - hpx),
          az = Math.abs(z + 0.5 - hpz);
        let c = C("#5a8a5a");
        if (r > HR - 0.9) c = (Math.round(Math.atan2(z - hpz, x - hpx) * 4) & 1) === 0 ? E("#ffe6a0", 2.2) : C("#e8e8e4");
        else if (r > HR - 2.2 && r < HR - 1.3) c = C("#f4f4ee");
        else if ((ax < 3.5 && az < 0.6) || (az < 4 && ax > 2.5 && ax < 3.6)) c = C("#f4f4ee");
        m.set(x, HY, z, c);
      }
    // the cantilever truss under it, back to the wing
    const wx = cx + hwMax(HY) - 1;
    for (const dz of [-3, 3]) {
      line(wx, HY - 1, hpz + dz, hpx + HR - 2, HY - 1, hpz + dz, steel, 2);
      line(wx, HY - 22, hpz + dz, hpx + 2, HY - 2, hpz + dz, steel, 2);
    }
  }
  const MY = 138;
  {
    // Al Muntaha: a long glazed capsule cantilevered from the mast side
    const x1 = Math.round(cx - hwMax(MY) + 2),
      x0 = x1 - 17;
    const z0 = ZM - 1,
      z1 = ZM + 9;
    for (let x = x0; x < x1; x++)
      for (let y = MY; y < MY + 7; y++)
        for (let z = z0; z < z1; z++) {
          // rounded ends and underside
          const ex = Math.min(x - x0, x1 - 1 - x);
          const cut = (y === MY && (z === z0 || z === z1 - 1)) || (ex === 0 && (y === MY || y === MY + 6 || z === z0 || z === z1 - 1));
          if (cut) continue;
          const face = z === z0 || z === z1 - 1 || ex === 0;
          m.set(x, y, z, face && y >= MY + 2 && y <= MY + 4 ? (hash(x, y, z, seed + 31) < 0.5 ? E("#a8d8ff", 1.1) : glass) : y === MY + 6 ? steel : white);
        }
    line(x1, MY - 18, ZM + 4, x0 + 4, MY, ZM + 4, steel, 2);
  }

  // ---- at the foot: the entrance podium, the fountain court, the terrace --------------------------
  const front = ZM + dep(TOPY); // the sail's foot at the front
  {
    const z0 = Math.round(front - 2),
      z1 = z0 + 8;
    m.box(Math.round(cx - 11), TOPY, z0, Math.round(cx + 11), TOPY + 7, z1, (x, y, z) => (y >= TOPY + 1 && y <= TOPY + 4 && z === z1 - 1 && x % 3 !== 0 ? (y > TOPY + 2 ? lit : glass) : paintAt(white, x, y, z)));
    m.box(Math.round(cx - 12), TOPY + 7, z0, Math.round(cx + 12), TOPY + 8, z1 + 1, gold);
    // the porte-cochère canopy over the door
    m.box(Math.round(cx - 5), TOPY + 5, z1, Math.round(cx + 5), TOPY + 6, z1 + 5, gold);
    for (const sx of [-1, 1]) m.box(Math.round(cx + sx * 4.5 - 0.5), TOPY, z1 + 4, Math.round(cx + sx * 4.5 + 0.5), TOPY + 5, z1 + 5, gold);
    signs.push({ text: "BURJ AL ZEC", color: "#f4b728", x: cx, y: TOPY + 9.5, z: z1 + 0.2, w: 16, h: 2.6, vertical: false, facing: "front" });
  }
  // the fountain court: a round basin with jets in a ring, and the driveway round it
  const FZ = Math.round(front + 14);
  {
    m.cylinder(cx, TOPY - 1, FZ, 7.5, 1, C("#c9c1b0"));
    m.cylinder(cx, TOPY, FZ, 6.5, 1, C("#e8e2d4"));
    m.cylinder(cx, TOPY, FZ, 5.5, 1, pool);
    for (let a = 0; a < 12; a++) {
      const x = cx + Math.cos((a / 12) * Math.PI * 2) * 4,
        z = FZ + Math.sin((a / 12) * Math.PI * 2) * 4;
      m.box(Math.floor(x), TOPY + 1, Math.floor(z), Math.floor(x) + 1, TOPY + 2 + (a % 3), Math.floor(z) + 1, E("#d8f6ff", 1.4));
    }
    m.box(Math.round(cx - 1), TOPY + 1, FZ - 1, Math.round(cx + 1), TOPY + 7, FZ + 1, E("#e8fbff", 1.6));
    lights.push([cx, TOPY + 4, FZ, "#bfe8ff"]);
  }
  // palms round the island
  const palmTree = (x: number, y0: number, z: number, h: number, s: number) => {
    x = Math.round(x);
    z = Math.round(z);
    for (let y = 0; y < h; y++) m.set(x + (y > h * 0.6 && s % 2 ? 1 : 0), y0 + y, z, C("#8a6a48"));
    const tx = x + (s % 2 ? 1 : 0),
      ty = y0 + h;
    m.set(tx, ty, z, leaf[2]);
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [-1, -1],
      [1, -1],
      [-1, 1],
    ])
      for (let r = 1; r <= 3; r++) m.set(tx + dx * r, ty - (r === 3 ? 1 : 0), z + dz * r, leaf[(r + s + dx + 2) % 3]);
  };
  for (let a = 0; a < 16; a++) {
    const ang = (a / 16) * Math.PI * 2;
    const x = IC.x + Math.cos(ang) * IRX * 0.78,
      z = IC.z + Math.sin(ang) * IRZ * 0.78;
    if (Math.abs(x - cx) < 16 && z > ZM - 6 && z < front + 4) continue;
    if (Math.abs(x - cx) < 6 && z > front) continue;
    palmTree(x, TOPY, z, 6 + (a % 3), a);
  }
  // the terrace at the back: pools, loungers, cabanas
  {
    m.box(Math.round(cx - 14), TOPY, 5, Math.round(cx - 4), TOPY + 1, 10, pave);
    m.box(Math.round(cx - 13), TOPY, 6, Math.round(cx - 5), TOPY + 1, 9, pool);
    m.box(Math.round(cx + 5), TOPY, 5, Math.round(cx + 14), TOPY + 1, 11, pave);
    m.box(Math.round(cx + 6), TOPY, 6, Math.round(cx + 13), TOPY + 1, 10, pool);
    for (let i = 0; i < 4; i++) {
      const x = Math.round(cx + 16 + (i % 2) * 3),
        z = 12 + i * 4;
      m.box(x, TOPY, z, x + 2, TOPY + 3, z + 2, C("#f6f2ea"));
      m.box(x, TOPY + 3, z, x + 2, TOPY + 4, z + 2, i % 2 ? gold : C("#f6f2ea"));
    }
  }

  // ---- the curved bridge to the quay ------------------------------------------------------------
  {
    const zA = Math.round(front + 20);
    const xAt = (z: number) => cx + 8 * Math.sin(((z - zA) / (D - zA)) * Math.PI);
    for (let z = zA - 4; z < D; z++) {
      const xc = xAt(z);
      const top = z > D - 8 ? TOPY + 1 : TOPY;
      for (let x = Math.floor(xc - 3.5); x < Math.ceil(xc + 3.5); x++) {
        const a = Math.abs(x + 0.5 - xc);
        if (a > 3.5) continue;
        m.box(x, top - 2, z, x + 1, top, z + 1, a > 2.6 ? white : (z & 3) === 0 ? C("#d8d0c0") : pave);
        if (a > 2.6) {
          m.set(x, top, z, white);
          if (z % 6 === 0) m.set(x, top + 1, z, E("#bfe0ff", 1.8));
        }
      }
      if (z % 9 === 0 && z > front + 22) m.box(Math.round(xc - 1), 0, z, Math.round(xc + 1), top - 2, z + 2, white);
    }
    // the gatehouse at the quay end
    const gx = xAt(D - 4);
    m.box(Math.round(gx + 4), TOPY + 1, D - 7, Math.round(gx + 8), TOPY + 5, D - 2, white);
    m.box(Math.round(gx + 4), TOPY + 5, D - 7, Math.round(gx + 8), TOPY + 6, D - 2, gold);
  }

  // ---- night: floodlights at the sail's foot in colour, and their wash ---------------------------
  const wash = ["#7a4cff", "#2fa8ff", "#ff4ab0", "#f4b728", "#38e0c0"];
  for (let i = 0; i < 9; i++) {
    const x = Math.round(cx - 10 + i * 2.5);
    m.set(x, TOPY + 8, Math.round(front + 6), E(wash[i % wash.length], 2.4));
  }
  lights.push([cx, 40, front + 8, "#9a6cff"], [cx, 100, front + 4, "#4ab0ff"], [cx, TOP - 10, ZM + 10, "#ff6ac0"]);

  void glassDark;
  const door: [number, number] = [cx, Math.round(front + 8)];
  return {
    model: m,
    signs,
    door: [cx, DL],
    body: [0, 0, W, DL],
    walls: [],
    lights,
    scale: k,
    points: {
      door: [door[0], TOPY, door[1]],
      keeper: [cx, TOPY, Math.round(front + 9)],
      helipad: [hpx, HY + 1, hpz],
      sailFoot: [cx, TOPY, Math.round(front)],
      sailTop: [cx, TOP, ZM + dep(TOP)],
      camPos: [cx + 70, 90, D + 90],
      camLook: [cx, 70, 30],
    },
  };
}

const paintAt = (p: Paint, x: number, y: number, z: number) => (typeof p === "number" ? p : p(x, y, z));
