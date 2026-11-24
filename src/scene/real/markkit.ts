import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { FACADE, type RGeo, type Slot } from "./buildings";

/**
 * The geometry kit of the realistic landmarks (src/scene/real/marks.ts): real shapes — boxes with
 * bevels, prisms, lathes, extrusions, beams between two points (lattices), arches — written per
 * material slot in metres (the lot's frame: x across, y up, z from the back to the front at +d/2,
 * centred), then merged per slot with UVs projected from the world in metres over the slot's
 * texture set (a box projection: walls take their texture upright, floors flat). Pure (the city's
 * workers run it).
 *
 * Slots: the realistic buildings' own ("f001", "glass", "metal", "concrete", …) or `lm.<Set>[.<flavour>]`
 * over any CC0 set of public/tex (flavours: `gloss` polished, `metal` metallic) and a few plain ones:
 * `lm.paint`, `lm.plastic`, `lm.chrome`, `lm.glow` (lit, vertex colours), `lm.dark` (matte black iron).
 * Their materials: src/scene/real/marksmat.ts.
 */

export type V3 = [number, number, number];
export const WHITE: V3 = [1, 1, 1];

/** Metres per repeat of the sets the landmarks use (UVs are metres / tile). */
const TILE: Record<string, [number, number]> = {
  Bricks008: [2.6, 2.6],
  Bricks083: [2.2, 2.2],
  Bricks084: [2.4, 1.2],
  Bricks060: [1.6, 1.6],
  Marble021: [2.5, 2.5],
  Metal024: [2.5, 2.5],
  Metal032: [2, 2],
  Concrete012: [3, 3],
  Concrete019: [3, 3],
  Concrete034: [2, 2],
  Concrete031: [3, 3],
  Grass004: [3, 3],
  Gravel022: [2, 2],
  Ground054: [3, 3],
  PavingStones128: [3.2, 3.2],
  PavingStones111: [2.4, 2.4],
  PavingStones130: [2.4, 2.4],
  PavingStones070: [1.6, 1.6],
  Tiles074: [1.6, 1.6],
  RoofingTiles006: [2, 2],
  Wood049: [1.5, 1.5],
  Plaster001: [2.5, 2.5],
  concrete: [3, 3],
  metal: [2, 2],
  plaster: [2.5, 2.5],
  roof: [2, 2],
  tile: [2, 2],
  brick: [1.6, 1.6],
  brickLight: [1.6, 1.6],
  wood: [1.5, 1.5],
};
const tileOf = (slot: string): [number, number] => {
  if (slot.startsWith("lm.")) {
    const [, set, flavour] = slot.split(".");
    const t = TILE[set] ?? [2, 2];
    // (`blocks`: the set five times larger — a wall's stones become a monument's blocks)
    return flavour === "blocks" ? [t[0] * 5, t[1] * 5] : t;
  }
  return TILE[slot] ?? [2, 2];
};

/** sRGB hex → linear (the vertex colours are linear). */
export function hex(h: string): V3 {
  const n = parseInt(h.replace("#", ""), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255].map((c) => Math.pow(c, 2.2)) as V3;
}
export const shadeC = (c: V3, k: number): V3 => [c[0] * k, c[1] * k, c[2] * k];

/** A tiny seeded random. */
export function rng(seed: number) {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpV = new THREE.Vector3();
const tmpS = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

export class Kit {
  private parts = new Map<string, THREE.BufferGeometry[]>();
  /** 0: near (every detail), 1: far (the forms, coarser curves, no small things). */
  constructor(readonly lod: number) {}

  /** Curve segments for a full turn, by detail. */
  seg(n: number) {
    return this.lod ? Math.max(6, Math.round(n / 2.5)) : n;
  }

  /** Any geometry (already in the lot's frame) into a slot, its vertex colour `col`. */
  add(slot: Slot | string, g: THREE.BufferGeometry, col: V3 | string = WHITE, keepUV = false) {
    const geo = g.index ? g.toNonIndexed() : g;
    if (g.index) g.dispose();
    const c = typeof col === "string" ? hex(col) : col;
    const n = geo.getAttribute("position").count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) arr.set(c, i * 3);
    geo.setAttribute("color", new THREE.BufferAttribute(arr, 3));
    if (!keepUV) geo.deleteAttribute("uv");
    for (const k of Object.keys(geo.attributes)) if (!["position", "normal", "uv", "color"].includes(k)) geo.deleteAttribute(k);
    geo.userData.keepUV = keepUV;
    let list = this.parts.get(slot);
    if (!list) this.parts.set(slot, (list = []));
    list.push(geo);
  }

  /** A box centred on (x, y, z) (y: its bottom), turned `ry` about its centre. */
  box(slot: string, x: number, y: number, z: number, sx: number, sy: number, sz: number, col: V3 | string = WHITE, ry = 0) {
    if (sx <= 0 || sy <= 0 || sz <= 0) return;
    const g = new THREE.BoxGeometry(sx, sy, sz);
    g.translate(0, sy / 2, 0);
    if (ry) g.rotateY(ry);
    g.translate(x, y, z);
    this.add(slot, g, col);
  }

  /** A box between two corners (x0, y0, z0)–(x1, y1, z1). */
  span(slot: string, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, col: V3 | string = WHITE) {
    this.box(slot, (x0 + x1) / 2, Math.min(y0, y1), (z0 + z1) / 2, Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0), col);
  }

  /** A battered block: (x, z) centred, `sx0` × `sz0` at its foot y, `sx1` × `sz1` at its top y + h (a pylon, a pyramid, a plinth). */
  frustum(slot: string, x: number, y: number, z: number, sx0: number, sz0: number, sx1: number, sz1: number, h: number, col: V3 | string = WHITE, ry = 0) {
    if (h <= 0) return;
    const g = new THREE.BoxGeometry(1, h, 1);
    const p = g.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const top = p.getY(i) > 0;
      p.setXYZ(i, p.getX(i) * (top ? sx1 : sx0), p.getY(i) + h / 2, p.getZ(i) * (top ? sz1 : sz0));
    }
    g.computeVertexNormals();
    if (ry) g.rotateY(ry);
    g.translate(x, y, z);
    this.add(slot, g, col);
  }

  /** An ellipsoid centred on (x, y, z), half-axes rx, ry, rz (a sculpted mass: a haunch, a head). */
  blob(slot: string, x: number, y: number, z: number, rx: number, ry: number, rz: number, col: V3 | string = WHITE, seg = 16, rot = 0) {
    const g = new THREE.SphereGeometry(1, this.seg(seg), Math.max(4, Math.round(this.seg(seg) / 2)));
    g.scale(rx, ry, rz);
    if (rot) g.rotateY(rot);
    g.translate(x, y, z);
    this.add(slot, g, col);
  }

  /** An upright cylinder (or cone) from y up h, radii at the bottom and the top. */
  cyl(slot: string, x: number, y: number, z: number, rBot: number, rTop: number, h: number, seg = 16, col: V3 | string = WHITE, open = false) {
    const g = new THREE.CylinderGeometry(rTop, rBot, h, this.seg(seg), 1, open);
    g.translate(x, y + h / 2, z);
    this.add(slot, g, col);
  }

  /** A solid of revolution: (radius, height) points from the bottom up, about (x, z). */
  lathe(slot: string, pts: [number, number][], x: number, y: number, z: number, seg = 24, col: V3 | string = WHITE, phi = 0, len = Math.PI * 2) {
    const g = new THREE.LatheGeometry(
      pts.map(([r, h]) => new THREE.Vector2(Math.max(0.0001, r), h)),
      this.seg(seg),
      phi,
      len,
    );
    g.translate(x, y, z);
    this.add(slot, g, col);
  }

  /** A square (or rectangular) beam from a to b, `w` × `d` across (a lattice member, a strut, a cable). */
  beam(slot: string, a: V3, b: V3, w: number, col: V3 | string = WHITE, d = w) {
    tmpV.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const len = tmpV.length();
    if (len < 1e-4) return;
    const g = new THREE.BoxGeometry(w, len, d);
    tmpQ.setFromUnitVectors(UP, tmpV.normalize());
    tmpM.compose(tmpS.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2), tmpQ, new THREE.Vector3(1, 1, 1));
    g.applyMatrix4(tmpM);
    this.add(slot, g, col);
  }

  /** A round rod from a to b (cables, rails, tubes). */
  rod(slot: string, a: V3, b: V3, r: number, col: V3 | string = WHITE, seg = 6) {
    tmpV.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const len = tmpV.length();
    if (len < 1e-4) return;
    const g = new THREE.CylinderGeometry(r, r, len, this.lod ? 4 : seg, 1, true);
    tmpQ.setFromUnitVectors(UP, tmpV.normalize());
    tmpM.compose(tmpS.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2), tmpQ, new THREE.Vector3(1, 1, 1));
    g.applyMatrix4(tmpM);
    this.add(slot, g, col);
  }

  /**
   * A flat outline (x across, y up) extruded `depth` along z from z0, then turned `ry` about the
   * y axis through (ox, oz): a wall with its arches cut out, a gable, a pediment.
   */
  extrude(slot: string, shape: THREE.Shape, z0: number, depth: number, col: V3 | string = WHITE, o: { ry?: number; ox?: number; oy?: number; oz?: number; bevel?: number; curve?: number } = {}) {
    const g = new THREE.ExtrudeGeometry(shape, {
      depth,
      bevelEnabled: !!o.bevel && !this.lod,
      bevelThickness: o.bevel ?? 0,
      bevelSize: o.bevel ?? 0,
      bevelSegments: 1,
      curveSegments: this.lod ? 4 : (o.curve ?? 10),
    });
    g.translate(0, 0, z0);
    if (o.ry) g.rotateY(o.ry);
    g.translate(o.ox ?? 0, o.oy ?? 0, o.oz ?? 0);
    this.add(slot, g, col);
  }

  /** A shape lying flat (x, z), extruded up from y0 by h (a plinth with a rounded plan, a pond). */
  slab(slot: string, shape: THREE.Shape, y0: number, h: number, col: V3 | string = WHITE, bevel = 0) {
    const g = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: !!bevel && !this.lod, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: this.lod ? 6 : 16 });
    // (the shape's y is the world's −z: laid down, extruded upwards from y0)
    g.rotateX(-Math.PI / 2);
    g.translate(0, y0, 0);
    this.add(slot, g, col);
  }

  /**
   * A photographed facade (src/scene/real/buildings.ts FACADE sets) on a vertical rectangle from
   * (x0, z0) to (x1, z1), y0 to y1, its normal out of the side `out` (+1: left of a→b seen from
   * above… simply the given normal), floors of `fh` metres: whole bays and floors.
   */
  facade(slot: Slot, a: [number, number], b: [number, number], y0: number, y1: number, n: [number, number], fh = 3.4, uOff = 0) {
    const F = FACADE[slot];
    if (!F) return;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const bays = Math.max(1, Math.round(len / F.bay));
    const pos = [a[0], y0, a[1], b[0], y0, b[1], b[0], y1, b[1], a[0], y1, a[1]];
    const u1 = uOff + bays / F.bays,
      v1 = (y1 - y0) / (fh * F.floors);
    const uv = [uOff, 0, u1, 0, u1, v1, uOff, v1];
    const g = new THREE.BufferGeometry();
    // (wound to face n)
    const cross = (b[0] - a[0]) * n[1] - (b[1] - a[1]) * n[0];
    const order = cross < 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];
    const P: number[] = [],
      U: number[] = [],
      N: number[] = [];
    for (const i of order) {
      P.push(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
      U.push(uv[i * 2], uv[i * 2 + 1]);
      N.push(n[0], 0, n[1]);
    }
    g.setAttribute("position", new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(N, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(U, 2));
    this.add(slot, g, WHITE, true);
  }

  /** A box whose four sides are a photographed facade (a tower's shaft), lid in `roof`. */
  tower(slot: Slot, x: number, z: number, w: number, d: number, y0: number, y1: number, fh = 3.4, roof = "lm.Concrete012", seed = 0) {
    const x0 = x - w / 2,
      x1 = x + w / 2,
      z0 = z - d / 2,
      z1 = z + d / 2;
    const u = (seed % 7) / 7;
    this.facade(slot, [x0, z1], [x1, z1], y0, y1, [0, 1], fh, u);
    this.facade(slot, [x1, z0], [x0, z0], y0, y1, [0, -1], fh, u + 0.3);
    this.facade(slot, [x1, z1], [x1, z0], y0, y1, [1, 0], fh, u + 0.5);
    this.facade(slot, [x0, z0], [x0, z1], y0, y1, [-1, 0], fh, u + 0.7);
    this.box(roof, x, y1 - 0.02, z, w, 0.3, d, "#8a8680");
  }

  /** Every slot merged, UVs projected (metres / the slot's tile), as the city's packed arrays. */
  out(): Record<string, RGeo> {
    const res: Record<string, RGeo> = {};
    for (const [slot, list] of this.parts) {
      const [tu, tv] = tileOf(slot);
      for (const g of list) {
        if (g.userData.keepUV && g.getAttribute("uv")) continue;
        const p = g.getAttribute("position").array as Float32Array;
        const uv = new Float32Array((p.length / 3) * 2);
        for (let i = 0; i < p.length; i += 9) {
          // the face's normal decides the projection
          const ax = p[i + 3] - p[i],
            ay = p[i + 4] - p[i + 1],
            az = p[i + 5] - p[i + 2],
            bx = p[i + 6] - p[i],
            by = p[i + 7] - p[i + 1],
            bz = p[i + 8] - p[i + 2];
          const nx = Math.abs(ay * bz - az * by),
            ny = Math.abs(az * bx - ax * bz),
            nz = Math.abs(ax * by - ay * bx);
          for (let k = 0; k < 3; k++) {
            const x = p[i + k * 3],
              y = p[i + k * 3 + 1],
              z = p[i + k * 3 + 2];
            const j = ((i / 3 + k) | 0) * 2;
            if (ny >= nx && ny >= nz) ((uv[j] = x / tu), (uv[j + 1] = z / tv));
            else if (nx >= nz) ((uv[j] = z / tu), (uv[j + 1] = y / tv));
            else ((uv[j] = x / tu), (uv[j + 1] = y / tv));
          }
        }
        g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
      }
      const m = list.length === 1 ? list[0] : mergeGeometries(list, false);
      if (!m) continue;
      const pos = m.getAttribute("position").array as Float32Array;
      const n = pos.length / 3;
      const idx = new Array<number>(n);
      for (let i = 0; i < n; i++) idx[i] = i;
      res[slot] = {
        pos: Float32Array.from(pos),
        nor: Float32Array.from(m.getAttribute("normal").array as Float32Array),
        uv: Float32Array.from(m.getAttribute("uv").array as Float32Array),
        col: Float32Array.from(m.getAttribute("color").array as Float32Array),
        idx,
      };
      for (const g of list) g.dispose();
    }
    return res;
  }
}

/**
 * A wall `w` × `h` with round-headed (or pointed) arches opening from its foot, for `extrude`: an
 * arcade. (The arches are notches in the outline, not holes: a hole touching the edge breaks the
 * triangulation and the wall came out solid.)
 */
export function arcadeShape(w: number, h: number, arches: { x: number; w: number; h: number; pointed?: boolean }[], x0 = -w / 2) {
  const s = new THREE.Shape();
  s.moveTo(x0, 0);
  for (const a of [...arches].sort((p, q) => p.x - q.x)) {
    const r = a.w / 2;
    const spring = a.h - r;
    s.lineTo(a.x - r, 0);
    s.lineTo(a.x - r, spring);
    if (a.pointed) {
      s.quadraticCurveTo(a.x - r, spring + r * 1.1, a.x, a.h + r * 0.25);
      s.quadraticCurveTo(a.x + r, spring + r * 1.1, a.x + r, spring);
    } else s.absarc(a.x, spring, r, Math.PI, 0, true);
    s.lineTo(a.x + r, 0);
  }
  s.lineTo(x0 + w, 0);
  s.lineTo(x0 + w, h);
  s.lineTo(x0, h);
  s.lineTo(x0, 0);
  return s;
}

/** A rectangle with rectangular windows cut out of it (a facade's wall with real reveals). */
export function windowsShape(w: number, h: number, holes: { x: number; y: number; w: number; h: number; arch?: boolean; pointed?: boolean }[], x0 = -w / 2) {
  const s = new THREE.Shape();
  s.moveTo(x0, 0);
  s.lineTo(x0 + w, 0);
  s.lineTo(x0 + w, h);
  s.lineTo(x0, h);
  s.lineTo(x0, 0);
  for (const o of holes) {
    const p = new THREE.Path();
    p.moveTo(o.x - o.w / 2, o.y);
    p.lineTo(o.x + o.w / 2, o.y);
    if (o.pointed) {
      const r = o.w / 2,
        spring = o.y + o.h - r * 1.25;
      p.lineTo(o.x + r, spring);
      p.quadraticCurveTo(o.x + r, spring + r * 0.9, o.x, o.y + o.h);
      p.quadraticCurveTo(o.x - r, spring + r * 0.9, o.x - r, spring);
    } else if (o.arch) {
      p.lineTo(o.x + o.w / 2, o.y + o.h - o.w / 2);
      p.absarc(o.x, o.y + o.h - o.w / 2, o.w / 2, 0, Math.PI, false);
    } else {
      p.lineTo(o.x + o.w / 2, o.y + o.h);
      p.lineTo(o.x - o.w / 2, o.y + o.h);
    }
    p.lineTo(o.x - o.w / 2, o.y);
    s.holes.push(p);
  }
  return s;
}

/** A rectangle (x, z) as a shape for `slab` (its y is the world's −z). */
export function rectShape(x0: number, z0: number, x1: number, z1: number) {
  const s = new THREE.Shape();
  s.moveTo(x0, -z0);
  s.lineTo(x1, -z0);
  s.lineTo(x1, -z1);
  s.lineTo(x0, -z1);
  s.lineTo(x0, -z0);
  return s;
}

/** An ellipse (x, z) as a shape for `slab`, with an optional elliptic hole. */
export function ellipseShape(cx: number, cz: number, rx: number, rz: number, hole?: [number, number]) {
  const s = new THREE.Shape();
  s.absellipse(cx, -cz, rx, rz, 0, Math.PI * 2, false, 0);
  if (hole) {
    const h = new THREE.Path();
    h.absellipse(cx, -cz, hole[0], hole[1], 0, Math.PI * 2, true, 0);
    s.holes.push(h);
  }
  return s;
}
