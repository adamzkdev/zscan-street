import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { groundMat } from "../scene/real/ground";
import { foliageCards } from "../scene/real/trees";

/**
 * The places' common furniture modelled for real (the realistic pass): sofas, armchairs, chairs,
 * stools, tables, desks, shelves, beds, wardrobes, curtains, counters, plants and trees — real
 * shapes (rounded cushions, tapered legs, folds, leaves) in photographed materials (fabric, wood,
 * metal, marble) mapped in world metres, in the same frame as the voxel piece it replaces (metres,
 * centred on its footprint, standing on y = 0, its front to +z) so the places' layouts and
 * colliders stay. Each builder is the `realize` of furniture.ts's voxel model.
 */

const keep = <T extends THREE.Material>(m: T) => ((m.userData.shared = true), (m.userData.noReal = true), m);
const plain = new Map<string, THREE.Material>();
const std = (key: string, make: () => THREE.Material) => {
  let m = plain.get(key);
  if (!m) plain.set(key, (m = keep(make())));
  return m;
};

const lift = (hex: string, k: number) => {
  const c = new THREE.Color(hex);
  return "#" + new THREE.Color(Math.min(1, c.r * k), Math.min(1, c.g * k), Math.min(1, c.b * k)).getHexString();
};

/** What a piece is made of: photographed and tinted (world-mapped), or plain metal and glass. */
const M = {
  // (the photographed weave is mid-grey: the paint is lifted so the cloth reads its own colour)
  fabric: (tint: string) => groundMat({ set: "Fabric030", tint: lift(tint, 1.45), tile: 0.55, rough: 1, normal: 0.6, anti: 0.1, patches: 0 }),
  leather: (tint: string) => groundMat({ set: "Fabric030", tint: lift(tint, 1.35), tile: 1.6, rough: 0.55, normal: 0.25, anti: 0.1, patches: 0 }),
  wood: (tint = "#c08a5a") => groundMat({ set: "Wood049", tint, tile: 1.1, rough: 0.8, normal: 0.6, anti: 0.15, patches: 0 }),
  dark: () => groundMat({ set: "Wood049", tint: "#6a4a34", tile: 1.1, rough: 0.7, normal: 0.6, anti: 0.15, patches: 0 }),
  marble: () => groundMat({ set: "Marble012", tint: "#f2efe8", tile: 1.4, rough: 0.35, normal: 0.3, anti: 0.3, patches: 0 }),
  painted: (tint: string) => groundMat({ set: "Plaster001", tint, tile: 3, rough: 0.6, normal: 0.15, anti: 0.1, patches: 0 }),
  steel: () => std("steel", () => new THREE.MeshStandardMaterial({ color: "#c9ccd2", metalness: 0.92, roughness: 0.28 })),
  black: () => std("black", () => new THREE.MeshStandardMaterial({ color: "#141418", metalness: 0.6, roughness: 0.45 })),
  brass: () => std("brass", () => new THREE.MeshStandardMaterial({ color: "#c9a227", metalness: 1, roughness: 0.28 })),
  ceramic: (tint: string) => std(`ceramic${tint}`, () => new THREE.MeshStandardMaterial({ color: tint, roughness: 0.42, metalness: 0 })),
  soil: () => std("soil", () => new THREE.MeshStandardMaterial({ color: "#2c2018", roughness: 1 })),
  glass: () => std("glass", () => new THREE.MeshPhysicalMaterial({ color: "#cfe0e8", roughness: 0.05, metalness: 0, transparent: true, opacity: 0.28, depthWrite: false })),
  bottle: (tint: string) => std(`bottle${tint}`, () => new THREE.MeshPhysicalMaterial({ color: tint, roughness: 0.08, metalness: 0, transparent: true, opacity: 0.72 })),
};

/** Geometries by material, merged into one mesh each at the end. */
class Kit {
  private by = new Map<THREE.Material, THREE.BufferGeometry[]>();
  add(mat: THREE.Material, g: THREE.BufferGeometry) {
    const l = this.by.get(mat);
    if (l) l.push(g);
    else this.by.set(mat, [g]);
    return g;
  }
  /** A box with rounded edges (r m), its centre at (x, y, z). */
  rbox(mat: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number, r = 0.03) {
    const rr = Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001);
    return this.add(mat, new RoundedBoxGeometry(w, h, d, 2, Math.max(0.002, rr)).translate(x, y, z));
  }
  box(mat: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number) {
    return this.add(mat, new THREE.BoxGeometry(w, h, d).translate(x, y, z));
  }
  /** A vertical tapered cylinder (a leg, a pot), its base at y0. */
  cyl(mat: THREE.Material, rTop: number, rBot: number, h: number, x: number, y0: number, z: number, seg = 14) {
    return this.add(mat, new THREE.CylinderGeometry(rTop, rBot, h, seg).translate(x, y0 + h / 2, z));
  }
  /** A rod (r m thick, len m long) centred at (x, y, z), along x ("x") or z ("z"). */
  rod(mat: THREE.Material, r: number, len: number, x: number, y: number, z: number, axis: "x" | "z") {
    const g = new THREE.CylinderGeometry(r, r, len, 8);
    if (axis === "x") g.rotateZ(Math.PI / 2);
    else g.rotateX(Math.PI / 2);
    return this.add(mat, g.translate(x, y, z));
  }
  done(name: string) {
    const g = new THREE.Group();
    for (const [mat, list] of this.by) {
      const geo = mergeGeometries(list.map((q) => (q.index ? q.toNonIndexed() : q)), false)!;
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = !(mat as THREE.MeshPhysicalMaterial).transparent;
      mesh.receiveShadow = true;
      g.add(mesh);
    }
    g.userData.real = name;
    return g;
  }
}

const darker = (hex: string, k: number) => {
  const c = new THREE.Color(hex);
  return "#" + c.multiplyScalar(k).getHexString();
};

// ---- seating --------------------------------------------------------------------------------------

/** A sofa `seats` cushions wide (voxel: 8 + 9·seats × 11 × 11 at 12/m): a plinth on short legs, seat and back cushions, rolled arms, two pillows. */
export function sofaReal(color: string, seats: number, pillow: string) {
  const W = (8 + seats * 9) / 12,
    D = 11 / 12,
    k = new Kit();
  const f = M.fabric(color),
    f2 = M.fabric(darker(color, 0.86));
  k.rbox(f2, W, 0.3, D - 0.04, 0, 0.26, 0, 0.04);
  const arm = 4 / 12;
  for (const s of [-1, 1]) k.rbox(f, arm, 0.62, D, s * (W / 2 - arm / 2), 0.31 + 0.1, 0, 0.09);
  const inner = W - 2 * arm,
    cw = inner / seats;
  for (let i = 0; i < seats; i++) {
    const x = -inner / 2 + cw * (i + 0.5);
    k.rbox(f, cw - 0.015, 0.16, D - 0.28, x, 0.49, 0.1, 0.06);
    k.rbox(f, cw - 0.02, 0.44, 0.22, x, 0.76, -D / 2 + 0.16, 0.08);
  }
  const pm = M.fabric(pillow);
  k.rbox(pm, 0.4, 0.36, 0.12, -inner / 2 + 0.3, 0.75, -D / 2 + 0.33, 0.06).rotateZ(0.08);
  k.rbox(pm, 0.4, 0.36, 0.12, inner / 2 - 0.3, 0.75, -D / 2 + 0.33, 0.06).rotateZ(-0.08);
  for (const x of [-W / 2 + 0.08, W / 2 - 0.08]) for (const z of [-D / 2 + 0.08, D / 2 - 0.08]) k.cyl(M.dark(), 0.022, 0.016, 0.11, x, 0, z, 8);
  return k.done("sofa");
}

/** An armchair (11 × 11 × 11 at 12/m). */
export function armchairReal(color: string) {
  const S = 11 / 12,
    k = new Kit();
  const f = M.fabric(color);
  k.rbox(M.fabric(darker(color, 0.86)), S, 0.3, S - 0.04, 0, 0.26, 0, 0.04);
  for (const s of [-1, 1]) k.rbox(f, 0.17, 0.6, S, s * (S / 2 - 0.085), 0.4, 0, 0.07);
  k.rbox(f, S - 0.34, 0.16, S - 0.26, 0, 0.49, 0.1, 0.06);
  k.rbox(f, S - 0.34, 0.5, 0.22, 0, 0.79, -S / 2 + 0.16, 0.08);
  for (const x of [-S / 2 + 0.08, S / 2 - 0.08]) for (const z of [-S / 2 + 0.08, S / 2 - 0.08]) k.cyl(M.dark(), 0.022, 0.016, 0.11, x, 0, z, 8);
  return k.done("armchair");
}

/** A chair (6 × 12 × 6 at 12/m): a wooden one with an upholstered seat, or an office chair on its star base. */
export function chairReal(color: string, office: boolean) {
  const k = new Kit();
  if (office) {
    const b = M.black();
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      k.add(b, new THREE.BoxGeometry(0.03, 0.03, 0.26).translate(0, 0.06, 0.13).rotateY(a));
      k.add(b, new THREE.SphereGeometry(0.028, 8, 6).translate(Math.sin(a) * 0.25, 0.028, Math.cos(a) * 0.25));
    }
    k.cyl(M.steel(), 0.025, 0.03, 0.36, 0, 0.06, 0, 10);
    k.rbox(M.fabric(color), 0.46, 0.08, 0.44, 0, 0.47, 0.02, 0.035);
    k.rbox(M.fabric(color), 0.44, 0.48, 0.07, 0, 0.8, -0.2, 0.035).rotateX(-0.08);
    for (const s of [-1, 1]) k.rbox(b, 0.04, 0.03, 0.26, s * 0.24, 0.66, 0.02, 0.012);
    return k.done("officeChair");
  }
  const w = M.wood("#b07a4a");
  for (const x of [-0.2, 0.2]) for (const z of [-0.2, 0.2]) k.cyl(w, 0.017, 0.014, 0.45, x, 0, z, 8);
  k.rbox(w, 0.46, 0.04, 0.44, 0, 0.47, 0, 0.012);
  k.rbox(M.fabric(color), 0.42, 0.05, 0.4, 0, 0.51, 0.01, 0.02);
  for (const x of [-0.2, 0.2]) k.cyl(w, 0.016, 0.017, 0.5, x, 0.49, -0.2, 8);
  k.rbox(w, 0.44, 0.12, 0.025, 0, 0.9, -0.2, 0.01);
  k.rbox(w, 0.44, 0.05, 0.02, 0, 0.72, -0.2, 0.008);
  return k.done("chair");
}

/** A bar stool (5 × 9 × 5 at 12/m): a round padded seat on a chrome column and foot ring. */
export function stoolReal(color: string) {
  const k = new Kit();
  k.cyl(M.steel(), 0.19, 0.2, 0.025, 0, 0, 0, 20);
  k.cyl(M.steel(), 0.024, 0.024, 0.66, 0, 0.02, 0, 10);
  k.add(M.steel(), new THREE.TorusGeometry(0.15, 0.012, 6, 20).rotateX(Math.PI / 2).translate(0, 0.3, 0));
  k.cyl(M.leather(color), 0.19, 0.18, 0.07, 0, 0.68, 0, 20);
  return k.done("stool");
}

/** A bench (20 × 6 × 6 at 12/m): slatted wooden seat on two black steel frames. */
export function benchReal() {
  const k = new Kit(),
    W = 20 / 12,
    D = 6 / 12;
  const w = M.wood("#a8784a");
  for (let i = 0; i < 4; i++) k.rbox(w, W, 0.035, D / 4 - 0.015, 0, 0.44, -D / 2 + (D / 4) * (i + 0.5), 0.01);
  for (const x of [-W / 2 + 0.22, W / 2 - 0.22]) {
    k.box(M.black(), 0.05, 0.42, 0.05, x, 0.21, -D / 2 + 0.08);
    k.box(M.black(), 0.05, 0.42, 0.05, x, 0.21, D / 2 - 0.08);
    k.box(M.black(), 0.05, 0.05, D - 0.1, x, 0.4, 0);
  }
  return k.done("bench");
}

/** A pool lounger (8 × 9 × 24 at 12/m): a chrome frame, a padded mattress, the back raised. */
export function loungerReal(color: string) {
  const k = new Kit(),
    W = 8 / 12,
    D = 24 / 12;
  for (const s of [-1, 1]) k.rbox(M.steel(), 0.03, 0.03, D, s * (W / 2 - 0.02), 0.3, 0, 0.012);
  for (const z of [-D / 2 + 0.1, D / 2 - 0.1]) for (const s of [-1, 1]) k.cyl(M.steel(), 0.015, 0.015, 0.3, s * (W / 2 - 0.02), 0, z, 8);
  k.rbox(M.fabric(color), W - 0.04, 0.08, D * 0.66, 0, 0.36, D * 0.15, 0.03);
  const back = k.rbox(M.fabric(color), W - 0.04, 0.08, D * 0.34, 0, 0, 0, 0.03);
  back.rotateX(-0.55).translate(0, 0.5, -D / 2 + D * 0.17);
  return k.done("lounger");
}

// ---- tables -----------------------------------------------------------------------------------------

/** A coffee table (14 × 5 × 8 at 12/m): a wooden top, a lower shelf, slim legs. */
export function coffeeTableReal() {
  const k = new Kit(),
    W = 14 / 12,
    D = 8 / 12;
  k.rbox(M.wood("#9a6a42"), W, 0.045, D, 0, 0.4, 0, 0.012);
  k.rbox(M.dark(), W - 0.14, 0.025, D - 0.12, 0, 0.13, 0, 0.008);
  for (const x of [-W / 2 + 0.05, W / 2 - 0.05]) for (const z of [-D / 2 + 0.05, D / 2 - 0.05]) k.cyl(M.dark(), 0.018, 0.015, 0.38, x, 0, z, 8);
  return k.done("coffeeTable");
}

/** A dining table (16 or 22 × 9 × 10 at 12/m). */
export function diningTableReal(seats: number) {
  const k = new Kit(),
    W = (seats > 4 ? 22 : 16) / 12,
    D = 10 / 12;
  k.rbox(M.wood("#a87448"), W, 0.05, D, 0, 0.72, 0, 0.012);
  k.rbox(M.dark(), W - 0.12, 0.08, D - 0.12, 0, 0.65, 0, 0.01);
  for (const x of [-W / 2 + 0.08, W / 2 - 0.08]) for (const z of [-D / 2 + 0.08, D / 2 - 0.08]) k.cyl(M.dark(), 0.03, 0.022, 0.62, x, 0, z, 10);
  return k.done("diningTable");
}

/** An office desk (19 × 9 × 10 at 12/m): a white top on steel side frames, a monitor, keyboard, a lamp. */
export function deskReal(seed: number) {
  const k = new Kit(),
    W = 19 / 12,
    D = 10 / 12;
  k.rbox(M.painted("#ecebe6"), W, 0.035, D, 0, 0.72, 0, 0.008);
  for (const x of [-W / 2 + 0.04, W / 2 - 0.04]) {
    k.box(M.steel(), 0.04, 0.7, 0.04, x, 0.35, -D / 2 + 0.06);
    k.box(M.steel(), 0.04, 0.7, 0.04, x, 0.35, D / 2 - 0.06);
    k.box(M.steel(), 0.04, 0.04, D - 0.1, x, 0.03, 0);
  }
  k.box(M.steel(), W - 0.1, 0.18, 0.015, 0, 0.55, -D / 2 + 0.08);
  // the screen (to the back), its stand, a keyboard, a mug
  k.rbox(M.black(), 0.62, 0.37, 0.03, 0, 1.0, -D / 2 + 0.2, 0.01);
  k.box(std("screen", () => new THREE.MeshStandardMaterial({ color: "#0d1622", emissive: "#2a5a8a", emissiveIntensity: 0.35, roughness: 0.2 })), 0.58, 0.33, 0.005, 0, 1.0, -D / 2 + 0.218);
  k.box(M.black(), 0.05, 0.18, 0.04, 0, 0.82, -D / 2 + 0.17);
  k.rbox(M.black(), 0.22, 0.012, 0.14, 0, 0.745, -D / 2 + 0.17, 0.004);
  k.rbox(std("keys", () => new THREE.MeshStandardMaterial({ color: "#2a2a30", roughness: 0.6 })), 0.44, 0.02, 0.14, 0, 0.75, 0.05, 0.006);
  k.cyl(M.ceramic(seed % 2 ? "#f2f0ea" : "#c0302e"), 0.038, 0.035, 0.1, W / 2 - 0.25, 0.738, 0.1, 14);
  return k.done("desk");
}

// ---- storage ---------------------------------------------------------------------------------------------

const BOOKS = ["#7a2420", "#24466e", "#a8822c", "#1e5a40", "#4a3468", "#a04e1e", "#d8d0bc", "#26262e", "#6a7a3a"];

/** A bookshelf (w × 24 × 5 at 12/m): an open wooden case of four shelves filled with books of every height. */
export function bookshelfReal(seed: number, w: number) {
  const k = new Kit(),
    W = w / 12,
    H = 24 / 12,
    D = 5 / 12;
  const wd = M.dark();
  k.box(wd, W, H, 0.02, 0, H / 2, -D / 2 + 0.01);
  for (const s of [-1, 1]) k.box(wd, 0.03, H, D, s * (W / 2 - 0.015), H / 2, 0);
  for (let i = 0; i <= 4; i++) k.box(wd, W - 0.06, 0.03, D, 0, 0.04 + i * (H - 0.08) / 4, 0);
  let r = seed * 9301 + 49297;
  const rnd = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
  for (let sh = 0; sh < 4; sh++) {
    const y0 = 0.055 + sh * (H - 0.08) / 4,
      room = (H - 0.08) / 4 - 0.05;
    for (let x = -W / 2 + 0.05; x < W / 2 - 0.08; ) {
      const bw = 0.025 + rnd() * 0.035,
        bh = room * (0.62 + rnd() * 0.33);
      if (rnd() < 0.06) {
        x += 0.08;
        continue;
      }
      k.box(M.ceramic(BOOKS[Math.floor(rnd() * BOOKS.length)]), bw, bh, D - 0.08 - rnd() * 0.06, x + bw / 2, y0 + bh / 2, 0.01);
      x += bw + 0.003;
    }
  }
  return k.done("bookshelf");
}

/** A wardrobe (16 × 26 × 7 at 12/m): two doors with slim handles, a plinth and a cornice. */
export function wardrobeReal(color: string) {
  const k = new Kit(),
    W = 16 / 12,
    H = 26 / 12,
    D = 7 / 12;
  const p = M.painted(color);
  k.rbox(p, W, H - 0.1, D, 0, (H - 0.1) / 2 + 0.06, 0, 0.01);
  k.box(M.dark(), W - 0.04, 0.06, D - 0.04, 0, 0.03, 0);
  k.rbox(p, W + 0.03, 0.04, D + 0.03, 0, H - 0.02, 0, 0.008);
  k.box(M.painted(darker(color, 0.8)), 0.006, H - 0.2, 0.004, 0, H / 2, D / 2 + 0.002);
  for (const s of [-1, 1]) k.cyl(M.steel(), 0.007, 0.007, 0.32, s * 0.06, H / 2 - 0.16, D / 2 + 0.018, 8);
  return k.done("wardrobe");
}

/** A nightstand (6 × 14 × 5 at 12/m: the cabinet and a lamp on it). */
export function nightstandReal() {
  const k = new Kit();
  k.rbox(M.wood("#9a6a42"), 0.5, 0.48, 0.4, 0, 0.26, 0, 0.012);
  k.box(M.dark(), 0.44, 0.003, 0.004, 0, 0.3, 0.202);
  k.rod(M.brass(), 0.012, 0.03, 0, 0.36, 0.205, "z");
  k.cyl(M.ceramic("#e8e4dc"), 0.06, 0.08, 0.22, 0, 0.5, 0, 16);
  k.cyl(std("shade", () => new THREE.MeshStandardMaterial({ color: "#f4ead2", emissive: "#ffd9a0", emissiveIntensity: 0.6, roughness: 0.9, side: THREE.DoubleSide })), 0.1, 0.14, 0.17, 0, 0.72, 0, 20);
  return k.done("nightstand");
}

/** A TV unit (w × 6 × 6 at 12/m) with its flat screen. */
export function tvUnitReal(w: number) {
  const k = new Kit(),
    W = w / 12;
  k.rbox(M.dark(), W, 0.4, 0.45, 0, 0.26, 0, 0.012);
  k.box(M.black(), W - 0.02, 0.06, 0.4, 0, 0.03, 0);
  return k.done("tvUnit");
}

/** A double bed (20 × 14 × 26 at 12/m): a wooden frame, an upholstered headboard, mattress, duvet, pillows. */
export function bedReal(color: string, accent: string) {
  const k = new Kit(),
    W = 20 / 12,
    L = 26 / 12;
  k.rbox(M.dark(), W, 0.3, L - 0.1, 0, 0.2, 0.05, 0.02);
  k.rbox(M.fabric(darker(color, 0.75)), W, 1.15, 0.12, 0, 0.58, -L / 2 + 0.06, 0.04);
  k.rbox(M.fabric("#f4f2ee"), W - 0.08, 0.2, L - 0.3, 0, 0.45, 0.1, 0.06);
  k.rbox(M.fabric(color), W - 0.02, 0.1, L * 0.62, 0, 0.58, L * 0.17, 0.05);
  k.rbox(M.fabric(darker(color, 0.85)), W - 0.04, 0.12, 0.3, 0, 0.6, L * 0.5 - 0.15, 0.06);
  for (const s of [-1, 1]) k.rbox(M.fabric(accent), W / 2 - 0.12, 0.14, 0.38, s * (W / 4 - 0.02), 0.64, -L / 2 + 0.38, 0.06);
  return k.done("bed");
}

/** Curtains drawn to one side (10 × h·12 × 2 at 12/m): a fabric in vertical folds on a rail. */
export function curtainReal(color: string, h: number) {
  const k = new Kit(),
    W = 10 / 12;
  const n = 7;
  const geo = new THREE.PlaneGeometry(W, h - 0.08, n * 4, 4);
  const pos = geo.getAttribute("position");
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    pos.setZ(i, Math.sin(((x + W / 2) / W) * n * Math.PI * 2) * 0.035);
  }
  geo.computeVertexNormals();
  geo.translate(0, (h - 0.08) / 2, 0.06);
  const mat = std(`curtain${color}`, () => {
    const m = groundMat({ set: "Fabric030", tint: color, tile: 0.7, rough: 1, normal: 0.4, anti: 0, patches: 0 }).clone();
    m.side = THREE.DoubleSide;
    return m;
  });
  k.add(mat, geo);
  k.rod(M.steel(), 0.012, W + 0.06, 0, h - 0.04, 0.06, "x");
  return k.done("curtain");
}

// ---- counters -------------------------------------------------------------------------------------------

/** A bar counter (len × 13 × 8 at 12/m): panelled wooden front, a polished stone top, a brass foot rail. */
export function barCounterReal(len: number, accent: string) {
  const k = new Kit(),
    D = 8 / 12;
  k.box(M.dark(), len, 1.0, D - 0.08, 0, 0.5, -0.04);
  for (let x = -len / 2 + 0.4; x < len / 2 - 0.2; x += 0.8) k.rbox(M.dark(), 0.66, 0.66, 0.03, x + 0.0, 0.5, D / 2 - 0.08 + 0.01, 0.01);
  k.rbox(M.marble(), len + 0.04, 0.05, D + 0.04, 0, 1.03, 0, 0.01);
  k.box(std(`accent${accent}`, () => new THREE.MeshBasicMaterial({ color: new THREE.Color(accent).multiplyScalar(1.6), toneMapped: false })), len, 0.012, 0.012, 0, 0.94, D / 2 - 0.05);
  k.rod(M.brass(), 0.02, len - 0.1, 0, 0.18, D / 2 - 0.02, "x");
  return k.done("barCounter");
}

/** The back bar (len × 26 × 5 at 12/m): a wooden cabinet, mirrored shelves of bottles. */
export function backBarReal(len: number) {
  const k = new Kit(),
    D = 5 / 12,
    H = 26 / 12;
  k.box(M.dark(), len, 0.9, D, 0, 0.45, 0);
  k.box(std("mirror", () => new THREE.MeshStandardMaterial({ color: "#8a9098", metalness: 1, roughness: 0.06 })), len - 0.1, H - 1.0, 0.02, 0, 0.95 + (H - 1.0) / 2, -D / 2 + 0.02);
  const colors = ["#2a8a4a", "#c8902a", "#a8342a", "#7fb0c8", "#5a2a1a", "#e8e0c8"];
  let r = Math.round(len * 977);
  const rnd = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
  for (const y of [1.05, 1.5]) {
    k.box(M.dark(), len - 0.1, 0.03, D - 0.06, 0, y - 0.015, 0);
    for (let x = -len / 2 + 0.12; x < len / 2 - 0.12; x += 0.09 + rnd() * 0.05) {
      const h = 0.22 + rnd() * 0.12;
      const mat = M.bottle(colors[Math.floor(rnd() * colors.length)]);
      k.cyl(mat, 0.032, 0.035, h * 0.7, x, y, 0, 10);
      k.cyl(mat, 0.012, 0.03, h * 0.3, x, y + h * 0.7, 0, 10);
    }
  }
  return k.done("backBar");
}

// ---- plants ---------------------------------------------------------------------------------------------

/** A potted plant (9 × 15/22 × 9 at 12/m): a ceramic pot of soil and a real plant — a monstera's big leaves, a ficus on its trunk, or a cactus. */
export function plantReal(kind: "monstera" | "ficus" | "cactus", seed: number) {
  const k = new Kit();
  const pot = kind === "cactus" ? M.ceramic("#b8643a") : M.ceramic(seed % 2 ? "#e8e4dc" : "#2a2a30");
  k.cyl(pot, 0.2, 0.15, 0.34, 0, 0, 0, 20);
  k.cyl(M.soil(), 0.185, 0.185, 0.02, 0, 0.31, 0, 20);
  if (kind === "cactus") {
    const green = std("cactus", () => new THREE.MeshStandardMaterial({ color: "#3a7a42", roughness: 0.7 }));
    k.add(green, new THREE.CapsuleGeometry(0.07, 0.55, 4, 12).translate(0, 0.66, 0));
    k.add(green, new THREE.CapsuleGeometry(0.045, 0.2, 4, 10).translate(-0.12, 0.72, 0));
    k.add(green, new THREE.CapsuleGeometry(0.04, 0.15, 4, 10).translate(0.11, 0.8, 0));
    k.add(green, new THREE.CylinderGeometry(0.03, 0.03, 0.06, 8).rotateZ(Math.PI / 2).translate(-0.08, 0.64, 0));
    k.add(green, new THREE.CylinderGeometry(0.025, 0.025, 0.05, 8).rotateZ(Math.PI / 2).translate(0.08, 0.74, 0));
    return k.done("cactus");
  }
  const g = k.done(kind);
  const ficus = kind === "ficus";
  if (ficus) {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.7, 8).translate(0, 0.65, 0), M.dark());
    trunk.castShadow = true;
    g.add(trunk);
  }
  const f = foliageCards(ficus ? [{ c: new THREE.Vector3(0, 1.35, 0), rad: new THREE.Vector3(0.32, 0.4, 0.32), n: 22, size: [0.36, 0.36] }] : [{ c: new THREE.Vector3(0, 0.78, 0), rad: new THREE.Vector3(0.32, 0.34, 0.32), n: 14, size: [0.42, 0.42] }], seed, "broad");
  const leaves = new THREE.Mesh(f.geometry, f.mat);
  leaves.customDepthMaterial = f.depth;
  leaves.castShadow = true;
  g.add(leaves);
  return g;
}

/** An indoor tree (20 × 46 × 20 at 12/m): a big square planter, a trunk branching, a round crown. */
export function indoorTreeReal(seed: number) {
  const k = new Kit();
  k.rbox(std("planter", () => new THREE.MeshStandardMaterial({ color: "#2c2a30", roughness: 0.5, metalness: 0.2 })), 1.16, 0.58, 1.16, 0, 0.29, 0, 0.03);
  k.box(M.soil(), 1.08, 0.02, 1.08, 0, 0.58, 0);
  const g = k.done("indoorTree");
  const bark = groundMat({ set: "Bark012", tint: "#9a8a7a", tile: 0.8, rough: 1, normal: 0.8, anti: 0, patches: 0 });
  const tr: THREE.BufferGeometry[] = [new THREE.CylinderGeometry(0.06, 0.09, 2.1, 10).translate(0, 1.6, 0)];
  for (const [a, y, l] of [
    [0.6, 1.9, 0.6],
    [2.6, 2.1, 0.55],
    [4.4, 2.3, 0.5],
  ]) tr.push(new THREE.CylinderGeometry(0.025, 0.04, l, 8).translate(0, l / 2, 0).rotateZ(0.8).rotateY(a).translate(0, y, 0));
  const trunk = new THREE.Mesh(mergeGeometries(tr.map((q) => q.toNonIndexed()), false)!, bark);
  trunk.castShadow = true;
  g.add(trunk);
  const f = foliageCards(
    [
      { c: new THREE.Vector3(0, 3.0, 0), rad: new THREE.Vector3(0.75, 0.6, 0.75), n: 46, size: [0.75, 0.75] },
      { c: new THREE.Vector3(0.3, 2.55, 0.2), rad: new THREE.Vector3(0.5, 0.35, 0.5), n: 18, size: [0.6, 0.6] },
    ],
    seed,
    "plane",
  );
  const leaves = new THREE.Mesh(f.geometry, f.mat);
  leaves.customDepthMaterial = f.depth;
  leaves.castShadow = true;
  g.add(leaves);
  return g;
}

// ---- kitchens, baths, counters, lamps, rugs, columns, gym ----------------------------------------------

/** A kitchen run (len m × 28 × 8 at 12/m): base units with doors and handles, a stone worktop, a tiled splashback, wall units, a sink and its tap, a hob and its hood, the oven. */
export function kitchenReal(len: number, color: string, top: string) {
  const k = new Kit(),
    D = 8 / 12;
  const body = M.painted(color),
    seam = M.painted(darker(color, 0.8));
  k.rbox(body, len, 0.82, D - 0.1, 0, 0.47, -0.05, 0.008);
  k.box(M.black(), len - 0.02, 0.08, D - 0.16, 0, 0.04, -0.06);
  k.rbox(top === "#2a2830" ? std("worktop", () => new THREE.MeshStandardMaterial({ color: "#2a2a30", roughness: 0.25, metalness: 0.1 })) : M.marble(), len, 0.04, D, 0, 0.9, 0, 0.006);
  const doors = Math.max(1, Math.round(len / 0.6));
  for (let i = 0; i <= doors; i++) k.box(seam, 0.006, 0.74, 0.004, -len / 2 + (len / doors) * i, 0.47, D / 2 - 0.05);
  for (let i = 0; i < doors; i++) k.box(M.steel(), 0.14, 0.012, 0.02, -len / 2 + (len / doors) * (i + 0.5), 0.8, D / 2 - 0.035);
  // splashback tiles: a white glazed plane (the grid in its normal is enough at this scale)
  k.box(M.ceramic("#eef0f2"), len, 0.5, 0.01, 0, 1.17, -D / 2 + 0.005);
  k.rbox(body, len, 0.75, 0.33, 0, 1.8, -D / 2 + 0.165, 0.008);
  for (let i = 0; i < doors; i++) k.box(M.steel(), 0.14, 0.012, 0.02, -len / 2 + (len / doors) * (i + 0.5), 1.47, -D / 2 + 0.34);
  // the sink and its tap, the hob and its hood, the oven door
  const sx = -len / 2 + len * 0.25,
    hx = -len / 2 + len * 0.62;
  k.rbox(M.steel(), 0.5, 0.02, 0.38, sx, 0.915, 0.02, 0.01);
  k.cyl(M.steel(), 0.012, 0.012, 0.22, sx, 0.92, -D / 2 + 0.07, 8);
  k.rod(M.steel(), 0.01, 0.14, sx, 1.13, -D / 2 + 0.13, "z");
  k.rbox(M.black(), 0.6, 0.012, 0.5, hx, 0.925, 0.02, 0.004);
  k.rbox(M.steel(), 0.62, 0.14, 0.45, hx, 1.45, -D / 2 + 0.25, 0.01);
  k.rbox(std("oven", () => new THREE.MeshStandardMaterial({ color: "#14161a", roughness: 0.15, metalness: 0.3 })), 0.58, 0.48, 0.01, hx, 0.46, D / 2 - 0.045, 0.004);
  return k.done("kitchen");
}

/** A fridge (9 × 23 × 8 at 12/m): brushed steel, two doors, long handles. */
export function fridgeReal() {
  const k = new Kit(),
    W = 9 / 12,
    H = 23 / 12,
    D = 8 / 12;
  k.rbox(std("fridge", () => new THREE.MeshStandardMaterial({ color: "#c8ccd2", metalness: 0.85, roughness: 0.35 })), W, H, D, 0, H / 2, 0, 0.03);
  k.box(M.black(), W - 0.04, 0.008, 0.004, 0, H * 0.62, D / 2 + 0.002);
  for (const y of [H * 0.82, H * 0.38]) k.cyl(M.steel(), 0.012, 0.012, 0.36, W / 2 - 0.08, y - 0.18, D / 2 + 0.03, 8);
  return k.done("fridge");
}

/** A toilet (5 × 10 × 8 at 12/m): white ceramic bowl, seat, cistern. */
export function toiletReal() {
  const k = new Kit(),
    c = M.ceramic("#f6f5f2");
  k.cyl(c, 0.15, 0.12, 0.38, 0, 0, 0.08, 18);
  k.add(c, new THREE.CylinderGeometry(0.19, 0.17, 0.06, 20).scale(1, 1, 1.25).translate(0, 0.41, 0.1));
  k.rbox(c, 0.38, 0.36, 0.17, 0, 0.6, -0.24, 0.03);
  k.rbox(M.steel(), 0.06, 0.012, 0.03, 0, 0.785, -0.24, 0.005);
  return k.done("toilet");
}

/** A vanity (12 × 26 × 6 at 12/m): a cabinet, a basin, a tap, a lit mirror. */
export function vanityReal(color: string) {
  const k = new Kit(),
    W = 1,
    D = 0.5;
  k.rbox(M.painted(color), W, 0.8, D, 0, 0.42, 0, 0.01);
  k.rbox(M.marble(), W + 0.02, 0.04, D + 0.02, 0, 0.84, 0, 0.006);
  k.add(M.ceramic("#f6f5f2"), new THREE.CylinderGeometry(0.2, 0.16, 0.1, 22).scale(1, 1, 0.75).translate(0, 0.9, 0.04));
  k.cyl(M.steel(), 0.012, 0.012, 0.18, 0, 0.86, -0.16, 8);
  k.box(std("mirror2", () => new THREE.MeshStandardMaterial({ color: "#a8b0b8", metalness: 1, roughness: 0.04 })), 0.9, 0.8, 0.02, 0, 1.55, -D / 2 + 0.015);
  k.box(std("lightbar", () => new THREE.MeshBasicMaterial({ color: new THREE.Color("#fff2dc").multiplyScalar(1.6), toneMapped: false })), 0.86, 0.03, 0.03, 0, 2.0, -D / 2 + 0.03);
  return k.done("vanity");
}

/** A bathtub (9 × 7 × 20 at 12/m): white enamel, rounded rim, chrome tap. */
export function bathtubReal() {
  const k = new Kit(),
    W = 0.75,
    L = 1.66;
  const c = M.ceramic("#f6f5f2");
  k.rbox(c, W, 0.56, L, 0, 0.28, 0, 0.06);
  k.add(std("bathwater", () => new THREE.MeshPhysicalMaterial({ color: "#bfe6f0", roughness: 0.05, transparent: true, opacity: 0.6 })), new THREE.BoxGeometry(W - 0.12, 0.01, L - 0.14).translate(0, 0.45, 0));
  k.cyl(M.steel(), 0.015, 0.015, 0.16, 0, 0.56, -L / 2 + 0.08, 8);
  return k.done("bathtub");
}

/** A reception desk (48 × 14 × 12 at 12/m): a long curved-front walnut counter, a stone top, a glowing plinth, two screens. */
export function receptionDeskReal() {
  const k = new Kit(),
    W = 4,
    D = 1;
  k.rbox(M.dark(), W, 1.05, D - 0.08, 0, 0.55, -0.04, 0.04);
  k.rbox(M.marble(), W + 0.06, 0.05, D + 0.02, 0, 1.12, 0, 0.012);
  k.box(std("plinthglow", () => new THREE.MeshBasicMaterial({ color: new THREE.Color("#ffd28a").multiplyScalar(1.4), toneMapped: false })), W - 0.1, 0.02, 0.02, 0, 0.06, D / 2 - 0.08);
  for (const x of [-0.8, 0.8]) {
    k.rbox(M.black(), 0.52, 0.32, 0.03, x, 1.42, -D / 2 + 0.25, 0.008);
    k.box(M.black(), 0.04, 0.2, 0.04, x, 1.22, -D / 2 + 0.22);
  }
  return k.done("receptionDesk");
}

/** A bistro table (8 × 9 × 8 at 12/m): a round marble top on a cast-iron column. */
export function bistroTableReal() {
  const k = new Kit();
  k.cyl(M.marble(), 0.33, 0.33, 0.03, 0, 0.72, 0, 28);
  k.cyl(M.black(), 0.025, 0.03, 0.7, 0, 0.03, 0, 10);
  k.cyl(M.black(), 0.06, 0.22, 0.04, 0, 0, 0, 20);
  return k.done("bistroTable");
}

/** A floor lamp (5 × 20 × 5 at 12/m): a weighted base, a slim brass stem, a lit linen shade. */
export function floorLampReal() {
  const k = new Kit();
  k.cyl(M.black(), 0.17, 0.18, 0.03, 0, 0, 0, 20);
  k.cyl(M.brass(), 0.012, 0.012, 1.32, 0, 0.03, 0, 8);
  k.cyl(std("shade", () => new THREE.MeshStandardMaterial({ color: "#f4ead2", emissive: "#ffd9a0", emissiveIntensity: 0.6, roughness: 0.9, side: THREE.DoubleSide })), 0.16, 0.21, 0.26, 0, 1.33, 0, 24);
  return k.done("floorLamp");
}

/** A pendant (5 × drop·12 × 5 at 12/m): its cord from the ceiling, a dark dome shade, the bulb glowing under it. */
export function pendantReal(drop: number, color: string) {
  const k = new Kit();
  k.cyl(M.black(), 0.004, 0.004, drop - 0.18, 0, 0.18, 0, 6);
  k.add(std("pendshade", () => new THREE.MeshStandardMaterial({ color: "#26262c", metalness: 0.5, roughness: 0.4, side: THREE.DoubleSide })), new THREE.SphereGeometry(0.2, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0.04, 0));
  k.add(std(`bulb${color}`, () => new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(2.2), toneMapped: false })), new THREE.SphereGeometry(0.06, 12, 8).translate(0, 0.06, 0));
  return k.done("pendant");
}

/** A wall sconce (3 × 4 × 3 at 12/m): a brass plate and arm, a frosted glass shade lit. */
export function sconceReal(color: string) {
  const k = new Kit();
  k.rbox(M.brass(), 0.1, 0.16, 0.02, 0, 0.17, -0.11, 0.005);
  k.box(M.brass(), 0.015, 0.015, 0.12, 0, 0.17, -0.05);
  k.cyl(std(`frost${color}`, () => new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(1.6), toneMapped: false })), 0.06, 0.05, 0.16, 0, 0.1, 0.02, 16);
  return k.done("sconce");
}

/** A rug (w × d m): a woven field with a darker border (carpet texture, tinted), lying flat. */
export function rugReal(w: number, d: number, color: string, accent: string) {
  const k = new Kit();
  const carpet = (tint: string) => groundMat({ set: "Carpet016", tint: lift(tint, 1.3), tile: 1.2, rough: 1, normal: 0.5, anti: 0.1, patches: 0 });
  k.rbox(carpet(accent), w, 0.012, d, 0, 0.006, 0, 0.004);
  if (w > 0.4 && d > 0.4) k.box(carpet(color), w - 0.16, 0.004, d - 0.16, 0, 0.014, 0);
  // (flat on the floor: no shadow of its own, that read as a raised mat)
  const g = k.done("rug");
  g.traverse((o) => (o.castShadow = false));
  return g;
}

/** A column (10 × h·12 × 10 at 12/m): a round marble shaft with brass rings, a square base and capital. */
export function columnReal(h: number) {
  const k = new Kit();
  k.rbox(M.black(), 0.84, 0.17, 0.84, 0, 0.085, 0, 0.02);
  k.cyl(M.marble(), 0.33, 0.35, h - 0.34, 0, 0.17, 0, 28);
  for (const y of [0.2, h - 0.27]) k.cyl(M.brass(), 0.37, 0.37, 0.06, 0, y, 0, 28);
  k.rbox(M.black(), 0.84, 0.17, 0.84, 0, h - 0.085, 0, 0.02);
  return k.done("column");
}

/** A treadmill (10 × 18 × 24 at 12/m): a deck and belt, side rails, the console on its uprights. */
export function treadmillReal() {
  const k = new Kit(),
    W = 10 / 12,
    L = 2;
  k.rbox(M.black(), W, 0.2, L - 0.3, 0, 0.1, 0.15, 0.03);
  k.box(std("belt", () => new THREE.MeshStandardMaterial({ color: "#1a1a1e", roughness: 0.9 })), W - 0.16, 0.012, L - 0.5, 0, 0.205, 0.2);
  for (const s of [-1, 1]) {
    k.cyl(M.steel(), 0.025, 0.025, 1.15, s * (W / 2 - 0.06), 0.15, -L / 2 + 0.35, 10);
    k.rbox(M.black(), 0.05, 0.05, 0.6, s * (W / 2 - 0.06), 1.0, -L / 2 + 0.6, 0.02);
  }
  k.rbox(M.black(), W - 0.08, 0.3, 0.12, 0, 1.3, -L / 2 + 0.38, 0.03).rotateX(0);
  k.box(std("console", () => new THREE.MeshStandardMaterial({ color: "#0d1622", emissive: "#3ee08f", emissiveIntensity: 0.35 })), W - 0.2, 0.18, 0.005, 0, 1.3, -L / 2 + 0.445);
  return k.done("treadmill");
}

/** An exercise bike (6 × 15 × 16 at 12/m): a red flywheel frame, saddle, handlebars, a small screen. */
export function exerciseBikeReal() {
  const k = new Kit();
  const red = std("bikered", () => new THREE.MeshStandardMaterial({ color: "#c8202e", roughness: 0.35, metalness: 0.4 }));
  k.rbox(M.black(), 0.4, 0.05, 1.3, 0, 0.025, 0, 0.02);
  k.add(M.black(), new THREE.CylinderGeometry(0.24, 0.24, 0.06, 28).rotateZ(Math.PI / 2).translate(0, 0.34, -0.42));
  k.add(red, new THREE.BoxGeometry(0.07, 0.8, 0.07).translate(0, 0.4, 0).rotateX(-0.35).translate(0, 0, -0.15));
  k.add(red, new THREE.BoxGeometry(0.07, 0.75, 0.07).translate(0, 0.38, 0).rotateX(0.2).translate(0, 0, 0.25));
  k.rbox(M.black(), 0.2, 0.06, 0.28, 0, 0.85, 0.32, 0.03);
  k.add(M.steel(), new THREE.CylinderGeometry(0.015, 0.015, 0.46, 8).rotateZ(Math.PI / 2).translate(0, 1.08, -0.38));
  k.rbox(M.black(), 0.2, 0.14, 0.03, 0, 1.12, -0.32, 0.01);
  return k.done("exerciseBike");
}

// ---- the Marina hotel's own pieces (src/interior/hotel/furniture.ts) --------------------------------------

/** A club chair (12 × 11 × 12 at 12/m): deep, curved back, rolled arms, a seat cushion. */
export function clubChairReal(color: string) {
  const k = new Kit(),
    S = 1;
  const f = M.fabric(color);
  k.rbox(M.black(), S - 0.1, 0.08, S - 0.1, 0, 0.04, 0, 0.02);
  k.rbox(f, S, 0.28, S, 0, 0.22, 0, 0.08);
  k.rbox(f, S - 0.36, 0.15, S - 0.3, 0, 0.42, 0.08, 0.06);
  // the curved back: a bent slab of segments
  for (let i = 0; i < 7; i++) {
    const a = ((i - 3) / 3) * 0.9;
    const seg = new RoundedBoxGeometry(0.2, 0.55, 0.2, 2, 0.07);
    seg.translate(0, 0.62, 0).rotateY(a);
    seg.translate(Math.sin(a) * 0.34, 0, -Math.cos(a) * 0.34 + 0.05);
    k.add(f, seg);
  }
  for (const s of [-1, 1]) k.rbox(f, 0.17, 0.32, S - 0.15, s * (S / 2 - 0.085), 0.5, 0.07, 0.08);
  return k.done("clubChair");
}

/** A velvet dining chair (6 × 13 × 6 at 12/m): gilded legs, a padded seat and back. */
export function velvetChairReal(color: string) {
  const k = new Kit();
  for (const x of [-0.2, 0.2]) for (const z of [-0.2, 0.2]) k.cyl(M.brass(), 0.018, 0.014, 0.42, x, 0, z, 8);
  k.rbox(M.fabric(color), 0.5, 0.09, 0.5, 0, 0.46, 0, 0.035);
  k.rbox(M.fabric(color), 0.48, 0.58, 0.07, 0, 0.8, -0.22, 0.035);
  k.rbox(M.brass(), 0.5, 0.03, 0.08, 0, 1.1, -0.22, 0.012);
  return k.done("velvetChair");
}

/** The front desk (len × 14 × 10 at 12/m): a cream stone counter, a gold band, a glowing plinth, the check-in screens. */
export function frontDeskReal(len: number) {
  const k = new Kit(),
    D = 10 / 12;
  k.rbox(M.marble(), len, 1.0, D - 0.06, 0, 0.58, -0.03, 0.03);
  k.box(M.black(), len - 0.06, 0.08, D - 0.1, 0, 0.04, -0.03);
  k.rbox(std("desktop", () => new THREE.MeshStandardMaterial({ color: "#26232c", roughness: 0.2, metalness: 0.2 })), len + 0.04, 0.05, D + 0.04, 0, 1.11, 0, 0.012);
  k.box(M.brass(), len, 0.06, 0.012, 0, 0.8, D / 2 - 0.02);
  k.box(std("plinthglow", () => new THREE.MeshBasicMaterial({ color: new THREE.Color("#ffd28a").multiplyScalar(1.4), toneMapped: false })), len - 0.1, 0.02, 0.02, 0, 0.1, D / 2 - 0.05);
  for (let x = -len / 2 + 0.7; x < len / 2 - 0.4; x += 1.33) {
    k.rbox(M.black(), 0.42, 0.28, 0.03, x, 1.36, -0.25, 0.008);
    k.box(std("checkin", () => new THREE.MeshStandardMaterial({ color: "#0d1622", emissive: "#3ef0ff", emissiveIntensity: 0.4 })), 0.38, 0.24, 0.005, x, 1.36, -0.233);
    k.box(M.black(), 0.04, 0.14, 0.04, x, 1.2, -0.27);
  }
  return k.done("frontDesk");
}

/** A card table (28 × 11 × 16/18 at 12/m): a felt top (half-moon or oval), a padded rail, a pedestal. */
export function cardTableReal(felt: string, oval: boolean) {
  const k = new Kit(),
    W = 28 / 12,
    D = (oval ? 18 : 16) / 12;
  const top = new THREE.CylinderGeometry(0.5, 0.5, 0.04, 40);
  // (half-moon: the flat side to −z, the dealer's)
  if (!oval) {
    const s = new THREE.Shape();
    s.absellipse(0, 0, W / 2, D, 0, Math.PI, false, 0);
    s.lineTo(W / 2, 0);
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.04, bevelEnabled: false, curveSegments: 40 });
    g.rotateX(Math.PI / 2).translate(0, 0.75, -D / 2);
    k.add(std(`felt${felt}`, () => new THREE.MeshStandardMaterial({ color: felt, roughness: 1 })), g);
    const rim = new THREE.ExtrudeGeometry(s, { depth: 0.06, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, curveSegments: 40 });
    rim.scale(1.04, 1.04, 1).rotateX(Math.PI / 2).translate(0, 0.73, -D / 2);
    k.add(M.leather("#2a1a14"), rim);
  } else {
    k.add(std(`felt${felt}`, () => new THREE.MeshStandardMaterial({ color: felt, roughness: 1 })), top.clone().scale(W, 1, D).translate(0, 0.78, 0));
    k.add(M.leather("#2a1a14"), new THREE.TorusGeometry(0.5, 0.035, 8, 48).rotateX(Math.PI / 2).scale(W, 1, D).translate(0, 0.79, 0));
  }
  k.cyl(M.dark(), 0.12, 0.16, 0.72, 0, 0, 0, 16);
  k.cyl(M.dark(), 0.4, 0.45, 0.05, 0, 0, 0, 24);
  return k.done("cardTable");
}

/** A sun lounger on teak (8 × 9 × 24 at 12/m): slatted frame, a white cushion, the back raised, a rolled towel. */
export function teakLoungerReal(towel: string) {
  const k = new Kit(),
    W = 8 / 12,
    L = 2;
  const teak = M.wood("#a87040");
  for (const z of [-L / 2 + 0.12, L / 2 - 0.2]) for (const s of [-1, 1]) k.box(teak, 0.06, 0.28, 0.06, s * (W / 2 - 0.04), 0.14, z);
  for (const s of [-1, 1]) k.rbox(teak, 0.05, 0.06, L * 0.75, s * (W / 2 - 0.03), 0.3, -L * 0.12, 0.01);
  k.rbox(M.fabric("#f4f0e8"), W - 0.08, 0.08, L * 0.72, 0, 0.37, -L * 0.13, 0.03);
  const back = new THREE.Group();
  const bk = new RoundedBoxGeometry(W - 0.06, 0.08, 0.62, 2, 0.03);
  bk.translate(0, 0, 0.31).rotateX(-0.75).translate(0, 0.36, L / 2 - 0.55);
  k.add(M.fabric("#f4f0e8"), bk);
  void back;
  k.add(M.fabric(towel), new THREE.CylinderGeometry(0.07, 0.07, W - 0.16, 14).rotateZ(Math.PI / 2).translate(0, 0.47, -L / 2 + 0.3));
  return k.done("teakLounger");
}

/** A cabana (30 × 32 × 30 at 12/m): four white posts, a canopy with a striped valance, drapes tied back, a daybed and cushions. */
export function cabanaReal(color: string) {
  const k = new Kit(),
    S = 2.5;
  const white = M.painted("#f2eee6");
  for (const x of [-S / 2 + 0.05, S / 2 - 0.05]) for (const z of [-S / 2 + 0.05, S / 2 - 0.05]) k.cyl(white, 0.05, 0.05, 2.5, x, 0, z, 12);
  k.rbox(white, S + 0.1, 0.1, S + 0.1, 0, 2.55, 0, 0.03);
  for (let i = 0; i < 10; i++) {
    const c = i % 2 ? M.fabric("#f4f0e8") : M.fabric(color);
    const w = S / 10;
    for (const z of [-S / 2 - 0.02, S / 2 + 0.02]) k.box(c, w, 0.25, 0.02, -S / 2 + w * (i + 0.5), 2.37, z);
  }
  // drapes tied back at the corners
  for (const x of [-S / 2 + 0.16, S / 2 - 0.16]) for (const z of [-S / 2 + 0.06, S / 2 - 0.06]) k.add(M.fabric("#f6f2ea"), new THREE.CylinderGeometry(0.06, 0.13, 2.2, 10).translate(x, 1.35, z));
  k.rbox(M.fabric("#d8d0c0"), S - 0.5, 0.32, S - 0.5, 0, 0.17, 0, 0.05);
  k.rbox(M.fabric("#f8f6f0"), S - 0.55, 0.16, S - 0.55, 0, 0.42, 0, 0.06);
  k.rbox(M.fabric(color), S - 0.6, 0.38, 0.22, 0, 0.66, -S / 2 + 0.42, 0.08);
  for (const x of [-0.6, 0, 0.6]) k.rbox(M.fabric(x === 0 ? "#c9a227" : "#f2eee6"), 0.4, 0.26, 0.14, x, 0.62, -S / 2 + 0.6, 0.06);
  return k.done("cabana");
}

/** A round side table (6 × 15 × 6 at 12/m) with its lamp. */
export function sideTableReal(lamp: boolean) {
  const k = new Kit();
  k.cyl(M.brass(), 0.25, 0.25, 0.03, 0, 0.53, 0, 24);
  k.cyl(M.black(), 0.03, 0.035, 0.52, 0, 0.01, 0, 10);
  k.cyl(M.black(), 0.16, 0.18, 0.03, 0, 0, 0, 20);
  if (lamp) {
    k.cyl(M.ceramic("#e8dcc0"), 0.05, 0.08, 0.25, 0, 0.56, 0, 16);
    k.cyl(std("shade", () => new THREE.MeshStandardMaterial({ color: "#f4ead2", emissive: "#ffd9a0", emissiveIntensity: 0.6, roughness: 0.9, side: THREE.DoubleSide })), 0.12, 0.17, 0.22, 0, 0.82, 0, 20);
  }
  return k.done("sideTable");
}

/** A king bed (24 × 18 × 27 at 12/m): a tall upholstered headboard in a gold frame, white linen, four pillows, a runner. */
export function kingBedReal(head: string, runner: string) {
  const k = new Kit(),
    W = 2,
    L = 27 / 12;
  k.rbox(M.dark(), W, 0.32, L - 0.1, 0, 0.18, 0.05, 0.02);
  k.rbox(M.brass(), W + 0.04, 1.5, 0.12, 0, 0.75, -L / 2 + 0.06, 0.02);
  k.rbox(M.fabric(head), W - 0.1, 1.34, 0.08, 0, 0.78, -L / 2 + 0.1, 0.05);
  k.rbox(M.fabric("#f6f4f0"), W - 0.06, 0.24, L - 0.25, 0, 0.45, 0.1, 0.07);
  k.rbox(M.fabric("#f6f4f0"), W - 0.02, 0.1, L * 0.62, 0, 0.6, L * 0.17, 0.05);
  k.rbox(M.fabric(runner), W + 0.02, 0.11, 0.42, 0, 0.6, L * 0.32, 0.05);
  for (const s of [-1, 1]) {
    k.rbox(M.fabric("#f6f4f0"), W / 2 - 0.12, 0.16, 0.4, s * (W / 4 - 0.02), 0.66, -L / 2 + 0.38, 0.07);
    k.rbox(M.fabric(runner), W / 2 - 0.3, 0.13, 0.32, s * (W / 4 - 0.02), 0.7, -L / 2 + 0.62, 0.06);
  }
  return k.done("kingBed");
}
