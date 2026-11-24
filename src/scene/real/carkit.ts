import * as THREE from "three";
import { mergeGeometries, mergeVertices, toCreasedNormals } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { TessellateModifier } from "three/examples/jsm/modifiers/TessellateModifier.js";

/**
 * The parts every realistic vehicle is made from (src/scene/real/cars.ts): the shared materials
 * (clear-coated paint per colour, dark glass, chrome, a vertex-coloured trim for the black plastic,
 * rubber and interior, the lamps), side profiles extruded with rounded edges, a body-wide shaping
 * (the plan's taper at the ends, the cabin's tumblehome), smooth creased normals, and the wheels.
 *
 * A vehicle is built once per model and paint: its parts merged per material (a handful of draw
 * calls), the geometries and materials shared by every copy (`userData.shared`: never freed).
 */

const keep = <T extends { userData: Record<string, unknown> }>(x: T) => ((x.userData.shared = true), x);

// ---- materials ---------------------------------------------------------------------------------

const paints = new Map<string, THREE.MeshPhysicalMaterial>();
/** Car paint: metallic flakes under a clear coat (one material per colour and finish). */
export function paint(color: THREE.ColorRepresentation, finish: "metal" | "solid" | "matte" = "metal") {
  const c = new THREE.Color(color);
  const key = `${c.getHexString()}|${finish}`;
  let m = paints.get(key);
  if (!m) {
    m = keep(
      new THREE.MeshPhysicalMaterial({
        color: c,
        metalness: finish === "metal" ? 0.55 : finish === "solid" ? 0.08 : 0.05,
        roughness: finish === "matte" ? 0.62 : finish === "metal" ? 0.34 : 0.28,
        clearcoat: finish === "matte" ? 0.15 : 1,
        clearcoatRoughness: 0.06,
        envMapIntensity: 1.15,
      }),
    );
    m.userData.carPaint = true;
    paints.set(key, m);
  }
  return m;
}

export const GLASS = keep(new THREE.MeshPhysicalMaterial({ color: "#0d1218", metalness: 0.25, roughness: 0.03, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.7 }));
/** A car's windows: tinted, see-through — its cabin is hollow, the driver shows behind them. */
export const GLASS_TINT = keep(new THREE.MeshPhysicalMaterial({ color: "#1c2632", metalness: 0.1, roughness: 0.03, transparent: true, opacity: 0.58, depthWrite: false, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.6 }));
/** See-through glass (a bus's windows: its riders show behind them). */
export const GLASS_CLEAR = keep(new THREE.MeshPhysicalMaterial({ color: "#9fb4c4", metalness: 0.1, roughness: 0.04, transparent: true, opacity: 0.28, depthWrite: false, envMapIntensity: 1.5, side: THREE.DoubleSide }));
export const CHROME = keep(new THREE.MeshStandardMaterial({ color: "#e4e8ec", metalness: 1, roughness: 0.13, envMapIntensity: 1.3 }));
/** Black plastic, rubber seals, the interior, the grille: one material, the colour per vertex. */
export const TRIM = keep(new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.15, roughness: 0.55, envMapIntensity: 0.8 }));
/** The lamps: unlit colours over 1 (they bloom), brighter at night (`carLamps`). */
export const LAMPS = keep(new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }));
/** Tyres and rims: the rubber dark and soft, the alloy bright (colour per vertex). */
export const WHEEL = keep(new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.55, roughness: 0.42, envMapIntensity: 1.1 }));

/** Day 0 … night 1: the lamps' strength (the head and tail lights carry at night). */
export function carLamps(night: number) {
  LAMPS.color.setScalar(0.75 + night * 0.9);
}
carLamps(0);

/** Lamp colours (linear, over 1 for the bloom). */
export const LAMP = {
  head: new THREE.Color(2.4, 2.3, 2.05),
  drl: new THREE.Color(2.6, 2.6, 2.7),
  tail: new THREE.Color(2.6, 0.12, 0.08),
  amber: new THREE.Color(2.4, 1.2, 0.1),
  reverse: new THREE.Color(1.6, 1.6, 1.6),
};

/** Trim colours (sRGB hex). */
export const T = {
  black: 0x111215,
  plastic: 0x1b1c20,
  rubber: 0x0c0c0e,
  interior: 0x1e1e22,
  seat: 0x2a2624,
  liner: 0x08080a,
  plate: 0xe8e6de,
  grey: 0x5a5c62,
  tread: 0x2a2a2e,
  wood: 0x7a5a3a,
};

// ---- building a vehicle ------------------------------------------------------------------------

export type Slot = "paint" | "accent" | "glass" | "trim" | "chrome" | "lamps" | "clear";

/** A deformation of the whole body (x along, y up, z across), applied before the normals. */
export type Shape = (p: THREE.Vector3) => void;

/**
 * Collects a vehicle's parts by material slot, each with its colour (for the vertex-coloured slots),
 * then shapes them all the same way, gives each its creased normals and merges them per slot.
 */
export class Kit {
  private parts = new Map<Slot, THREE.BufferGeometry[]>();

  add(slot: Slot, geo: THREE.BufferGeometry, color?: number | THREE.Color, shaped = true, tess = 0) {
    let g = geo.index ? geo.toNonIndexed() : geo;
    for (const k of Object.keys(g.attributes)) if (k !== "position") g.deleteAttribute(k);
    // (a big panel bent by the body's shaping needs vertices along it, or its reflections ripple)
    if (tess > 0) g = new TessellateModifier(tess, 6).modify(g);
    g.userData.shaped = shaped;
    if (color !== undefined) {
      const c = color instanceof THREE.Color ? color : new THREE.Color().setHex(color, THREE.SRGBColorSpace);
      const n = g.getAttribute("position").count;
      const a = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) (a[i * 3] = c.r), (a[i * 3 + 1] = c.g), (a[i * 3 + 2] = c.b);
      g.setAttribute("color", new THREE.BufferAttribute(a, 3));
    }
    const list = this.parts.get(slot) ?? [];
    list.push(g);
    this.parts.set(slot, list);
    return g;
  }

  /** Shaped, creased, merged: one geometry per slot. */
  build(shape: Shape | null, crease = 0.62): Partial<Record<Slot, THREE.BufferGeometry>> {
    const out: Partial<Record<Slot, THREE.BufferGeometry>> = {};
    const v = new THREE.Vector3();
    for (const [slot, list] of this.parts) {
      const done: THREE.BufferGeometry[] = [];
      for (const g of list) {
        const pos = g.getAttribute("position") as THREE.BufferAttribute;
        if (shape && g.userData.shaped)
          for (let i = 0; i < pos.count; i++) {
            v.fromBufferAttribute(pos, i);
            shape(v);
            pos.setXYZ(i, v.x, v.y, v.z);
          }
        const col = g.getAttribute("color");
        // smooth where the surface is smooth, a crease at the edges (the colour, if any, carried along)
        let n: THREE.BufferGeometry;
        if (col) {
          const c = (col.array as Float32Array).slice(0, 3);
          g.deleteAttribute("color");
          n = toCreasedNormals(mergeVertices(g, 1e-4), crease);
          const k = n.getAttribute("position").count;
          const a = new Float32Array(k * 3);
          for (let i = 0; i < k; i++) (a[i * 3] = c[0]), (a[i * 3 + 1] = c[1]), (a[i * 3 + 2] = c[2]);
          n.setAttribute("color", new THREE.BufferAttribute(a, 3));
        } else n = toCreasedNormals(mergeVertices(g, 1e-4), crease);
        done.push(n);
      }
      const m = mergeGeometries(done, false);
      if (!m) continue;
      m.computeBoundingSphere();
      m.computeBoundingBox();
      keep(m);
      out[slot] = m;
    }
    return out;
  }
}

/** A side profile (x along, y up) extruded across the car, `width` wide in all, its edges rounded by `bevel`. */
export function profile(pts: [number, number][], width: number, bevel: number, curve = 6) {
  const s = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  const depth = Math.max(0.005, width - 2 * bevel);
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: bevel > 0.05 ? 3 : bevel > 0 ? 2 : 0, curveSegments: curve, steps: 1 });
  g.translate(0, 0, -depth / 2);
  return g;
}

/** A box with rounded edges, centred at (x, y, z). */
export function rbox(w: number, h: number, d: number, r: number, x: number, y: number, z: number, seg = 1) {
  const g = new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3));
  g.translate(x, y, z);
  return g;
}

/** A plain box, centred. */
export function box(w: number, h: number, d: number, x: number, y: number, z: number) {
  return new THREE.BoxGeometry(w, h, d).translate(x, y, z);
}

/** A cylinder along an axis ("x", "y" or "z"), centred. */
export function cyl(r: number, len: number, axis: "x" | "y" | "z", x: number, y: number, z: number, seg = 14, r2 = r) {
  const g = new THREE.CylinderGeometry(r, r2, len, seg);
  if (axis === "x") g.rotateZ(Math.PI / 2);
  if (axis === "z") g.rotateX(Math.PI / 2);
  return g.translate(x, y, z);
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * The body's shaping: narrower toward the nose and the tail seen from above (`plan`), the cabin
 * leaning in toward the roof (`tumble` metres each side at `top`), the sides tucked under a little.
 */
export function bodyShape(o: { half: number; len: number; plan: number; belt: number; top: number; tumble: number; clear: number }): Shape {
  const L = o.len / 2;
  return (p) => {
    const t = Math.abs(p.x) / L;
    let k = 1 - o.plan * smooth(0.62, 1.02, t) ** 1.6;
    // the cabin leans in toward the roof
    if (p.y > o.belt) k -= (o.tumble / o.half) * smooth(o.belt, o.top, p.y);
    // the sides tuck under at the sill
    k -= 0.035 * (1 - smooth(o.clear, o.clear + 0.3, p.y));
    p.z *= k;
  };
}

// ---- the wheels ----------------------------------------------------------------------------------

const wheelGeos = new Map<string, THREE.BufferGeometry>();

/**
 * A wheel's geometry (axle along z, centred): the tyre (a rounded section turned round), the rim's
 * lip and spokes, the hub, a brake disc behind; rubber and alloy by vertex colour.
 */
export function wheelGeometry(r: number, w: number, style: "alloy" | "steel" | "sport" | "truck" = "alloy") {
  const key = `${r.toFixed(3)}|${w.toFixed(3)}|${style}`;
  let g = wheelGeos.get(key);
  if (g) return g;
  const parts: THREE.BufferGeometry[] = [];
  const colored = (geo: THREE.BufferGeometry, hex: number) => {
    let x = geo.index ? geo.toNonIndexed() : geo;
    for (const k of Object.keys(x.attributes)) if (k !== "position" && k !== "normal") x.deleteAttribute(k);
    if (!x.getAttribute("normal")) x.computeVertexNormals();
    const c = new THREE.Color().setHex(hex, THREE.SRGBColorSpace);
    const n = x.getAttribute("position").count;
    const a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) (a[i * 3] = c.r), (a[i * 3 + 1] = c.g), (a[i * 3 + 2] = c.b);
    x.setAttribute("color", new THREE.BufferAttribute(a, 3));
    parts.push(x);
  };
  // the tyre: a rounded section (sidewall bulge, tread) turned round the axle (lathe: about y, then laid on z)
  const rin = r * (style === "truck" ? 0.6 : style === "sport" ? 0.72 : 0.66);
  const hw = w / 2;
  const sec: THREE.Vector2[] = [];
  const N = 7;
  for (let i = 0; i <= N; i++) {
    const a = -Math.PI / 2 + (i / N) * Math.PI;
    // the section: from the inner bead out to the tread and back, a superellipse
    // (the bead at the rim, the sidewall bulging out to a flat tread)
    const sx = Math.abs(Math.cos(a)) ** 0.42;
    const sy = Math.sign(Math.sin(a)) * Math.abs(Math.sin(a)) ** 0.55;
    sec.push(new THREE.Vector2(rin + (r - rin) * sx, hw * sy));
  }
  const tyre = new THREE.LatheGeometry(sec, 16);
  tyre.rotateX(Math.PI / 2);
  colored(tyre, 0x141416);
  // the rim: its lip (a short tube), a face set back, spokes, the hub with its nuts
  const face = style === "sport" ? 0.72 : 0.62;
  const lip = new THREE.CylinderGeometry(rin, rin, w * 0.92, 16, 1, true);
  lip.rotateX(Math.PI / 2);
  colored(lip, style === "steel" ? 0x4a4c52 : 0xb8bcc4);
  for (const side of [-1, 1]) {
    const disc = new THREE.RingGeometry(rin * 0.86, rin, 16);
    if (side < 0) disc.rotateY(Math.PI);
    disc.translate(0, 0, side * hw * face);
    colored(disc, style === "steel" ? 0x5a5c62 : 0xd0d4da);
    const spokes = style === "truck" ? 8 : style === "sport" ? 10 : 5;
    for (let k = 0; k < spokes; k++) {
      const a = (k / spokes) * Math.PI * 2;
      const len = rin * 0.72;
      const sp = new THREE.BoxGeometry(len, style === "sport" ? rin * 0.09 : rin * 0.16, 0.025);
      sp.translate(len / 2 + rin * 0.12, 0, 0);
      sp.rotateZ(a);
      sp.translate(0, 0, side * hw * (face - 0.06));
      colored(sp, style === "steel" ? 0x55575c : 0xc4c8ce);
    }
    const hub = new THREE.CylinderGeometry(rin * 0.2, rin * 0.24, 0.05, 8);
    hub.rotateX(Math.PI / 2);
    hub.translate(0, 0, side * hw * (face - 0.02));
    colored(hub, 0x9a9ea6);
  }
  // the dark well behind the spokes (each face), the brake disc
  for (const side of [-1, 1]) {
    const back = new THREE.CircleGeometry(rin * 0.86, 12);
    if (side < 0) back.rotateY(Math.PI);
    back.translate(0, 0, side * hw * (face - 0.16));
    colored(back, 0x18181b);
  }
  g = keep(mergeGeometries(parts, false)!);
  g.computeBoundingSphere();
  wheelGeos.set(key, g);
  return g;
}

/**
 * A wheel ready to turn: a pivot at the hub (it steers: rotation.y), a spinner in it (it rolls:
 * rotation.z), the wheel's mesh in that. The pivot carries `userData.wheel = { r, front }`.
 */
export function wheel(r: number, w: number, style: Parameters<typeof wheelGeometry>[2], x: number, z: number, front: boolean, flip = false) {
  const pivot = new THREE.Group();
  pivot.name = "wheel";
  pivot.position.set(x, r, z);
  const spin = new THREE.Group();
  const m = new THREE.Mesh(wheelGeometry(r, w, style), WHEEL);
  m.castShadow = true;
  if (flip) m.rotation.y = Math.PI;
  spin.add(m);
  pivot.add(spin);
  pivot.userData.wheel = { r, front };
  return pivot;
}

/** A shared geometry for a decal (text on a panel), and its shared materials per texture. */
export const keepShared = keep;
