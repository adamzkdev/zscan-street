import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { maps } from "./tex";

/**
 * The boats, realistic (branch gta-real, wave 2): the river's moored boats and its water bus, the
 * bay's ferries. A lofted hull (a fine bow at +x, a flat transom at −x, a V bottom down to the keel,
 * sitting a hand deep in the water), a boot stripe and the antifouling under it, a teak deck, the
 * cabin with its windows, railings, the lamps. Centred on x and z, y = 0 at the waterline, front +x
 * (as the voxel boats they replace). Geometry and materials shared by every copy of a look.
 */

const mats = new Map<string, THREE.Material>();
function M(key: string, make: () => THREE.Material) {
  let m = mats.get(key);
  if (!m) {
    m = make();
    m.userData.shared = true;
    mats.set(key, m);
  }
  return m;
}
// (both sides: the hull's faces are lofted, and a deck seen from below shows its underside)
export const gloss = (hex: string) => M(`g:${hex}`, () => new THREE.MeshStandardMaterial({ color: hex, roughness: 0.22, metalness: 0.05, envMapIntensity: 1.2, side: THREE.DoubleSide }));
export const matte = (hex: string, r = 0.7) => M(`m:${hex}:${r}`, () => new THREE.MeshStandardMaterial({ color: hex, roughness: r, side: THREE.DoubleSide }));
export const steel = () => M("steel", () => new THREE.MeshStandardMaterial({ color: "#c8ccd2", roughness: 0.25, metalness: 0.95 }));
export const glass = () => M("glass", () => new THREE.MeshStandardMaterial({ color: "#16202c", roughness: 0.04, metalness: 0.6, envMapIntensity: 1.5 }));
export const lamp = (hex: string, k = 2.6) => M(`l:${hex}:${k}`, () => new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(k), toneMapped: false }));
export const teak = () =>
  M("teak", () => {
    const mp = maps("Planks021");
    return new THREE.MeshStandardMaterial({ map: mp.map, normalMap: mp.normalMap, roughnessMap: mp.roughnessMap, color: "#c89a6a", roughness: 1, side: THREE.DoubleSide });
  });

export type Parts = Map<THREE.Material, THREE.BufferGeometry[]>;
export function add(parts: Parts, m: THREE.Material, g: THREE.BufferGeometry) {
  const gg = g.index ? g.toNonIndexed() : g;
  if (!gg.getAttribute("uv")) gg.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(gg.getAttribute("position").count * 2), 2));
  for (const k of Object.keys(gg.attributes)) if (k !== "position" && k !== "normal" && k !== "uv") gg.deleteAttribute(k);
  const l = parts.get(m);
  if (l) l.push(gg);
  else parts.set(m, [gg]);
}
export const rbox = (w: number, h: number, d: number, r: number, x: number, y: number, z: number) => new RoundedBoxGeometry(w, h, d, 2, r).translate(x, y + h / 2, z);
export const box = (w: number, h: number, d: number, x: number, y: number, z: number) => new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z);

/**
 * The hull: L long, W wide, its sheer at `top` (rising a little to the bow), the keel `draft` under
 * the water. Split at the waterline band: `under` (antifouling) below y = band0, `boot` the stripe
 * band0…band1, `topside` above.
 */
export function hull(L: number, W: number, top: number, draft: number) {
  const N = 18;
  const st: { x: number; hw: number; y: number; k: number }[] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const x = -L / 2 + t * L;
    // full aft, a fine entry over the last third
    const hw = (W / 2) * (t < 0.62 ? 1 - 0.06 * (1 - t / 0.62) ** 2 : Math.sqrt(Math.max(0, 1 - ((t - 0.62) / 0.38) ** 2)));
    st.push({ x, hw: Math.max(hw, 0.001), y: top + 0.18 * t * t, k: -draft * (t < 0.85 ? 1 : 1 - (t - 0.85) / 0.15 * 0.6) });
  }
  // each section: sheer, chine, keel, chine, sheer (starboard +z to port −z)
  const sec = (s: (typeof st)[number]) => [
    new THREE.Vector3(s.x, s.y, s.hw),
    new THREE.Vector3(s.x, s.k * 0.35, s.hw * 0.86),
    new THREE.Vector3(s.x, s.k, 0),
    new THREE.Vector3(s.x, s.k * 0.35, -s.hw * 0.86),
    new THREE.Vector3(s.x, s.y, -s.hw),
  ];
  const side: number[] = [];
  for (let i = 0; i < N; i++) {
    const a = sec(st[i]),
      b = sec(st[i + 1]);
    for (let j = 0; j < 4; j++) {
      // (wound to face out: starboard faces +z, port −z, the bottom down)
      const q = [a[j], b[j], b[j + 1], a[j + 1]];
      side.push(...q[0].toArray(), ...q[2].toArray(), ...q[1].toArray(), ...q[0].toArray(), ...q[3].toArray(), ...q[2].toArray());
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(side, 3));
  g.computeVertexNormals();
  // the transom (the stern's flat face) and the deck
  const tr = sec(st[0]);
  const stern: number[] = [];
  for (let j = 0; j < 4; j++) stern.push(...tr[0].clone().setZ(0).setY(tr[2].y * 0.3 + tr[0].y * 0.7).toArray(), ...tr[j + 1].toArray(), ...tr[j].toArray());
  const sg = new THREE.BufferGeometry();
  sg.setAttribute("position", new THREE.Float32BufferAttribute(stern, 3));
  sg.computeVertexNormals();
  const deck: number[] = [];
  const uv: number[] = [];
  for (let i = 0; i < N; i++) {
    const a = st[i],
      b = st[i + 1];
    const p = [
      [a.x, a.y - 0.04, a.hw - 0.05],
      [b.x, b.y - 0.04, Math.max(0, b.hw - 0.05)],
      [b.x, b.y - 0.04, -Math.max(0, b.hw - 0.05)],
      [a.x, a.y - 0.04, -(a.hw - 0.05)],
    ];
    for (const k of [0, 1, 2, 0, 2, 3]) {
      deck.push(...p[k]);
      uv.push(p[k][2] / 1.2, p[k][0] / 1.2);
    }
  }
  const dg = new THREE.BufferGeometry();
  dg.setAttribute("position", new THREE.Float32BufferAttribute(deck, 3));
  dg.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  dg.computeVertexNormals();
  return { side: mergeGeometries([g, sg], false)!, deck: dg, st };
}

/** Clip a geometry's triangles by height into three bands (the antifouling, the boot stripe, the topsides): crude, per triangle centre. */
export function bands(g: THREE.BufferGeometry, y0: number, y1: number) {
  const p = g.getAttribute("position");
  const out: number[][] = [[], [], []];
  for (let i = 0; i < p.count; i += 3) {
    const cy = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3;
    const k = cy < y0 ? 0 : cy < y1 ? 1 : 2;
    for (let j = 0; j < 3; j++) out[k].push(p.getX(i + j), p.getY(i + j), p.getZ(i + j));
  }
  return out.map((a) => {
    const b = new THREE.BufferGeometry();
    b.setAttribute("position", new THREE.Float32BufferAttribute(a, 3));
    b.computeVertexNormals();
    return b;
  });
}

export function railing(parts: Parts, pts: THREE.Vector3[], h: number) {
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    add(parts, steel(), new THREE.CylinderGeometry(0.018, 0.018, h, 6).translate(p.x, p.y + h / 2, p.z));
    if (i) {
      const a = pts[i - 1].clone().setY(pts[i - 1].y + h),
        b = p.clone().setY(p.y + h);
      const len = a.distanceTo(b);
      const t = new THREE.CylinderGeometry(0.02, 0.02, len, 6).translate(0, len / 2, 0);
      t.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()));
      add(parts, steel(), t.translate(a.x, a.y, a.z));
    }
  }
}

const built = new Map<string, Parts>();
export function object(key: string, make: () => Parts) {
  let parts = built.get(key);
  if (!parts) {
    const raw = make();
    parts = new Map();
    for (const [m, gs] of raw) {
      const g = mergeGeometries(gs, false);
      if (g) parts.set(m, [g]);
    }
    built.set(key, parts);
  }
  const o = new THREE.Group();
  for (const [m, [g]] of parts) {
    const mesh = new THREE.Mesh(g, m);
    mesh.castShadow = !(m as THREE.MeshBasicMaterial).isMeshBasicMaterial;
    mesh.receiveShadow = true;
    o.add(mesh);
  }
  return o;
}

/** A river boat (8 m: a launch with its cabin amidships): the hull in `hullHex`, the cabin in `cabinHex`. */
export function realBoat(hullHex: string, cabinHex: string) {
  return object(`boat:${hullHex}:${cabinHex}`, () => {
    const parts: Parts = new Map();
    const L = 8,
      W = 2.3,
      top = 0.75;
    const h = hull(L, W, top, 0.45);
    const [under, boot, topside] = bands(h.side, -0.06, 0.08);
    add(parts, matte("#7a2a24", 0.8), under);
    add(parts, gloss("#f2f0ea"), boot);
    add(parts, gloss(hullHex), topside);
    add(parts, teak(), h.deck);
    // the rubbing strake along the sheer
    for (const s of [-1, 1]) {
      const pts = h.st.map((q) => new THREE.Vector3(q.x, q.y + 0.02, s * q.hw));
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1],
          b = pts[i];
        const len = a.distanceTo(b);
        const t = new THREE.BoxGeometry(len + 0.02, 0.06, 0.06).rotateY(-Math.atan2(b.z - a.z, b.x - a.x)).translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
        add(parts, matte("#3a2a20", 0.5), t);
      }
    }
    // the cabin: its sides, windows all round, the roof with its overhang, a door aft
    const cx0 = -1.7,
      cx1 = 1.9,
      cw = 1.7;
    add(parts, gloss(cabinHex), rbox(cx1 - cx0, 1.05, cw, 0.06, (cx0 + cx1) / 2, top, 0));
    for (const s of [-1, 1]) add(parts, glass(), box(cx1 - cx0 - 0.5, 0.42, 0.02, (cx0 + cx1) / 2, top + 0.45, s * (cw / 2 + 0.005)));
    add(parts, glass(), box(0.02, 0.42, cw - 0.4, cx1 + 0.005, top + 0.45, 0).rotateZ(0));
    add(parts, matte("#3a3844", 0.6), rbox(cx1 - cx0 + 0.3, 0.08, cw + 0.25, 0.03, (cx0 + cx1) / 2, top + 1.05, 0));
    add(parts, matte("#2a2830", 0.6), box(0.04, 0.85, 0.6, cx0 - 0.005, top + 0.05, 0));
    // the bow's navigation lamp, the stern's, cleats, the rail round the foredeck
    add(parts, lamp("#fff6e0"), new THREE.SphereGeometry(0.06, 10, 8).translate(L / 2 - 0.4, top + 0.3, 0));
    add(parts, lamp("#ff3a2a", 2), new THREE.SphereGeometry(0.05, 10, 8).translate(-L / 2 + 0.2, top + 0.25, 0));
    railing(
      parts,
      [-1, 0, 1].flatMap((s) => (s ? [new THREE.Vector3(2.2, top + 0.05, s * 1.0), new THREE.Vector3(3.2, top + 0.12, s * 0.75)] : [new THREE.Vector3(3.75, top + 0.16, 0)])),
      0.55,
    );
    for (const x of [-L / 2 + 0.5, L / 2 - 1]) for (const s of [-1, 1]) add(parts, steel(), box(0.18, 0.05, 0.05, x, top - 0.02, s * 0.95));
    // a fender or two over the side
    for (const x of [-1.5, 1.2]) add(parts, matte("#f2f0ea", 0.5), new THREE.CapsuleGeometry(0.1, 0.35, 4, 10).translate(x, top - 0.35, 1.2));
    return parts;
  });
}

/** A bay ferry (10 m: two decks, the wheelhouse on top, the band in `bandHex`, lit windows along the main cabin). */
export function realFerry(hullHex: string, bandHex: string) {
  return object(`ferry:${hullHex}:${bandHex}`, () => {
    const parts: Parts = new Map();
    const L = 10,
      W = 3,
      top = 0.85;
    const h = hull(L, W, top, 0.6);
    const [under, boot, topside] = bands(h.side, -0.06, 0.12);
    add(parts, matte("#7a2a24", 0.8), under);
    add(parts, gloss(bandHex), boot);
    add(parts, gloss(hullHex), topside);
    add(parts, teak(), h.deck);
    // the main cabin: long windows (lit by night: a warm band behind the glass), white walls
    const x0 = -3.3,
      x1 = 2.7,
      cw = 2.4;
    add(parts, gloss("#ece8e0"), rbox(x1 - x0, 1.25, cw, 0.08, (x0 + x1) / 2, top, 0));
    for (const s of [-1, 1]) {
      add(parts, glass(), box(x1 - x0 - 0.6, 0.55, 0.02, (x0 + x1) / 2, top + 0.45, s * (cw / 2 + 0.006)));
      for (let x = x0 + 0.5; x < x1 - 0.4; x += 0.75) add(parts, lamp("#ffe6b0", 0.9), box(0.5, 0.06, 0.01, x + 0.25, top + 0.92, s * (cw / 2 + 0.018)));
    }
    add(parts, glass(), box(0.02, 0.55, cw - 0.5, x1 + 0.006, top + 0.45, 0));
    // the upper deck: its rail; the wheelhouse with its band and wraparound glass; the funnel
    add(parts, gloss("#ece8e0"), rbox(x1 - x0 + 0.2, 0.1, cw + 0.2, 0.04, (x0 + x1) / 2, top + 1.25, 0));
    const r = [
      new THREE.Vector3(x0, top + 1.35, cw / 2),
      new THREE.Vector3(x1, top + 1.35, cw / 2),
      new THREE.Vector3(x1, top + 1.35, -cw / 2),
      new THREE.Vector3(x0, top + 1.35, -cw / 2),
      new THREE.Vector3(x0, top + 1.35, cw / 2),
    ];
    railing(parts, r, 0.75);
    add(parts, gloss("#ece8e0"), rbox(2.6, 0.75, 1.6, 0.06, 0.6, top + 1.35, 0));
    add(parts, glass(), rbox(2.62, 0.38, 1.62, 0.05, 0.6, top + 1.62, 0));
    add(parts, gloss(bandHex), rbox(2.7, 0.1, 1.7, 0.04, 0.6, top + 2.1, 0));
    add(parts, gloss(bandHex), new THREE.CylinderGeometry(0.22, 0.26, 0.6, 16).translate(-0.4, top + 2.4, 0));
    add(parts, matte("#1a1820", 0.6), new THREE.CylinderGeometry(0.23, 0.23, 0.08, 16).translate(-0.4, top + 2.72, 0));
    // the lamps: masthead, port and starboard, stern; a lifebuoy on the cabin
    add(parts, steel(), new THREE.CylinderGeometry(0.025, 0.025, 1.0, 6).translate(1.6, top + 2.6, 0));
    add(parts, lamp("#fff6e0"), new THREE.SphereGeometry(0.07, 10, 8).translate(1.6, top + 3.12, 0));
    add(parts, lamp("#3aff6a", 2), new THREE.SphereGeometry(0.05, 8, 6).translate(1.9, top + 1.95, 0.83));
    add(parts, lamp("#ff3a2a", 2), new THREE.SphereGeometry(0.05, 8, 6).translate(1.9, top + 1.95, -0.83));
    add(parts, lamp("#fff6e0"), new THREE.SphereGeometry(0.06, 8, 6).translate(L / 2 - 0.35, top + 0.35, 0));
    for (const s of [-1, 1]) add(parts, matte("#ff5a2a", 0.5), new THREE.TorusGeometry(0.22, 0.06, 8, 18).translate(-2.6, top + 0.75, s * (cw / 2 + 0.07)));
    return parts;
  });
}
