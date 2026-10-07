import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { Flora, P } from "./flora";
import { type GardensKit, LEVELS, paint } from "./kit";

/**
 * Shared pieces of the gardens: ground textures, the glass gridshell domes, paths (ribbons and
 * the distance to them, so planting keeps off them), rain trees, palms, benches, lamps, and the
 * scatter that fills a bed with a mix of tropical plants.
 */

export type Rng = () => number;
export function rng(seed: number): Rng {
  let s = seed % 2147483647 || 1;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

// ---- textures ----------------------------------------------------------------------------------

export function grassTex(rx: number, ry: number, dark = false) {
  return paint(
    512,
    512,
    (g, W, H) => {
      g.fillStyle = dark ? "#2f5a26" : "#4a8a34";
      g.fillRect(0, 0, W, H);
      const r = rng(11);
      for (let i = 0; i < 9000; i++) {
        const l = dark ? 18 + r() * 14 : 26 + r() * 18;
        g.fillStyle = `hsl(${88 + r() * 24},${40 + r() * 20}%,${l}%)`;
        g.fillRect(r() * W, r() * H, 1.5 + r() * 2, 3 + r() * 5);
      }
      // a few clover patches and bare spots
      for (let i = 0; i < 30; i++) {
        g.fillStyle = `rgba(${r() < 0.5 ? "30,60,20" : "120,150,60"},0.12)`;
        g.beginPath();
        g.arc(r() * W, r() * H, 10 + r() * 30, 0, 7);
        g.fill();
      }
    },
    rx,
    ry,
  );
}

export function pavingTex(rx: number, ry: number, base = "#cfc6b4") {
  return paint(
    512,
    512,
    (g, W, H) => {
      g.fillStyle = base;
      g.fillRect(0, 0, W, H);
      const r = rng(23);
      const t = 64;
      for (let y = 0; y < H; y += t / 2)
        for (let x = (y / (t / 2)) % 2 ? -t / 2 : 0; x < W; x += t) {
          g.fillStyle = `rgba(${r() < 0.5 ? "255,250,240" : "60,50,40"},${0.04 + r() * 0.08})`;
          g.fillRect(x + 2, y + 2, t - 4, t / 2 - 4);
        }
      g.strokeStyle = "rgba(70,60,50,0.35)";
      g.lineWidth = 2;
      for (let y = 0; y <= H; y += t / 2) {
        g.beginPath();
        g.moveTo(0, y);
        g.lineTo(W, y);
        g.stroke();
        for (let x = (y / (t / 2)) % 2 ? -t / 2 : 0; x <= W; x += t) {
          g.beginPath();
          g.moveTo(x, y);
          g.lineTo(x, y + t / 2);
          g.stroke();
        }
      }
      for (let i = 0; i < 3000; i++) {
        g.fillStyle = `rgba(0,0,0,${r() * 0.08})`;
        g.fillRect(r() * W, r() * H, 1.5, 1.5);
      }
    },
    rx,
    ry,
  );
}

export function soilTex(rx: number, ry: number) {
  return paint(
    256,
    256,
    (g, W, H) => {
      g.fillStyle = "#3a2a1c";
      g.fillRect(0, 0, W, H);
      const r = rng(5);
      for (let i = 0; i < 4000; i++) {
        g.fillStyle = `hsl(${20 + r() * 20},${25 + r() * 20}%,${8 + r() * 20}%)`;
        g.fillRect(r() * W, r() * H, 2 + r() * 3, 2 + r() * 3);
      }
    },
    rx,
    ry,
  );
}

// ---- paths -------------------------------------------------------------------------------------

export class Paths {
  readonly segs: { a: THREE.Vector2; b: THREE.Vector2; w: number }[] = [];
  private geos: THREE.BufferGeometry[] = [];

  /** A path through `pts` (x, z), `w` wide, drawn `dy` above floor f. */
  add(k: GardensKit, f: number, pts: [number, number][], w: number, dy = 0.02) {
    const y = LEVELS[f].y + dy;
    for (let i = 0; i + 1 < pts.length; i++) this.segs.push({ a: new THREE.Vector2(...pts[i]), b: new THREE.Vector2(...pts[i + 1]), w });
    // a ribbon with mitred joints, uv in metres
    const pos: number[] = [],
      uv: number[] = [],
      idx: number[] = [];
    let along = 0;
    pts.forEach((p, i) => {
      const prev = pts[Math.max(0, i - 1)],
        next = pts[Math.min(pts.length - 1, i + 1)];
      const dx = next[0] - prev[0],
        dz = next[1] - prev[1];
      const L = Math.hypot(dx, dz) || 1;
      const nx = -dz / L,
        nz = dx / L;
      if (i > 0) along += Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]);
      pos.push(p[0] + (nx * w) / 2, y, p[1] + (nz * w) / 2, p[0] - (nx * w) / 2, y, p[1] - (nz * w) / 2);
      uv.push(0, along / 2, w / 2, along / 2);
      if (i > 0) {
        const o = i * 2;
        idx.push(o - 2, o, o - 1, o - 1, o, o + 1);
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    // keep the faces pointing up
    const n = g.attributes.normal;
    for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
    this.geos.push(g.toNonIndexed());
    void k;
  }

  /** Distance from (x, z) to the edge of the nearest path (negative: on it). */
  dist(x: number, z: number) {
    let best = Infinity;
    const p = new THREE.Vector2(x, z),
      ab = new THREE.Vector2(),
      ap = new THREE.Vector2();
    for (const s of this.segs) {
      ab.subVectors(s.b, s.a);
      ap.subVectors(p, s.a);
      const t = THREE.MathUtils.clamp(ap.dot(ab) / ab.lengthSq(), 0, 1);
      const d = p.distanceTo(ab.multiplyScalar(t).add(s.a)) - s.w / 2;
      if (d < best) best = d;
    }
    return best;
  }

  build(k: GardensKit, f: number, mat: THREE.Material) {
    if (!this.geos.length) return;
    const g = mergeGeometries(this.geos, false)!;
    this.geos.forEach((x) => x.dispose());
    this.geos = [];
    const m = new THREE.Mesh(g, mat);
    m.raycast = () => {};
    m.renderOrder = 1;
    k.g(f).add(m);
  }
}

// ---- domes -------------------------------------------------------------------------------------

/**
 * A glass gridshell (half an ellipsoid rx × h × rz) on floor f: glass, meridian and parallel ribs,
 * and the great external arches over it.
 */
export function dome(k: GardensKit, f: number, cx: number, cz: number, rx: number, rz: number, h: number, o: { ribs?: number; rings?: number; arches?: number; flat?: number } = {}) {
  const ribs = o.ribs ?? 48,
    rings = o.rings ?? 10;
  // a flatter top for the Flower Dome
  const flat = o.flat ?? 1;
  const at = (a: number, e: number) => {
    const c = Math.cos(e),
      s = Math.pow(Math.sin(e), flat);
    return new THREE.Vector3(cx + Math.sin(a) * rx * c, h * s, cz + Math.cos(a) * rz * c);
  };
  const glass = new THREE.SphereGeometry(1, 64, 16, 0, Math.PI * 2, 0, Math.PI / 2);
  const p = glass.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const e = Math.asin(THREE.MathUtils.clamp(y, 0, 1));
    const v = at(Math.atan2(p.getX(i), p.getZ(i)), e);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  glass.computeVertexNormals();
  k.geo(f, glass, "#cfe8f0", "glass");
  for (let s = 0; s < ribs; s++) {
    const a = (s / ribs) * Math.PI * 2;
    let prev: THREE.Vector3 | null = null;
    for (let j = 0; j <= 14; j++) {
      const q = at(a, (j / 14) * (Math.PI / 2) * 0.985);
      if (prev) k.beam(f, prev, q, s % 4 ? 0.12 : 0.22, "#e8ecef", "metal");
      prev = q;
    }
  }
  for (let j = 1; j <= rings; j++) {
    const e = (j / (rings + 1)) * (Math.PI / 2);
    let prev: THREE.Vector3 | null = null;
    const n = 72;
    for (let s = 0; s <= n; s++) {
      const q = at((s / n) * Math.PI * 2, e);
      if (prev) k.beam(f, prev, q, 0.12, "#e8ecef", "metal");
      prev = q;
    }
  }
  // the base ring
  k.cyl(f, Math.max(rx, rz) + 0.4, Math.max(rx, rz) + 0.4, 0.01, cx, -0.01, cz, "#000", "matte", 4);
  {
    let prev: THREE.Vector3 | null = null;
    for (let s = 0; s <= 96; s++) {
      const q = at((s / 96) * Math.PI * 2, 0).setY(0.4);
      if (prev) k.beam(f, prev, q, 0.8, "#dcd8d0", "matte");
      prev = q;
    }
  }
  // the external arches: great steel ribs leaning over the shell
  const arches = o.arches ?? 6;
  for (let i = 0; i < arches; i++) {
    const a = (i / arches) * Math.PI;
    let prev: THREE.Vector3 | null = null;
    for (let j = 0; j <= 24; j++) {
      const u = j / 24;
      const side = u < 0.5 ? a : a + Math.PI;
      const e = (1 - Math.abs(u - 0.5) * 2) * (Math.PI / 2) * 0.96;
      const q = at(side, e);
      q.add(new THREE.Vector3(q.x - cx, 0, q.z - cz).normalize().multiplyScalar(1.4 * Math.cos(e))).add(new THREE.Vector3(0, 1.2, 0));
      if (prev) k.beam(f, prev, q, 0.55, "#f0f2f4", "metal");
      prev = q;
    }
  }
}

// ---- trees, palms, furniture -------------------------------------------------------------------

/** A spreading rain tree: a short trunk, limbs, a wide flat crown of leaf clumps. */
export function rainTree(k: GardensKit, flora: Flora, f: number, x: number, z: number, s: number, r: Rng, cell: number = P.canopy, bark = "#5a4a3a") {
  const zone = LEVELS[f].zone,
    y0 = LEVELS[f].y;
  const th = 3.2 * s;
  k.cyl(f, 0.45 * s, 0.32 * s, th, x, 0, z, bark, "matte", 9);
  const limbs = 5;
  for (let i = 0; i < limbs; i++) {
    const a = (i / limbs) * Math.PI * 2 + r();
    const L = (3 + r() * 2) * s;
    const end = new THREE.Vector3(x + Math.cos(a) * L, th + (1.6 + r() * 1.4) * s, z + Math.sin(a) * L);
    k.beam(f, new THREE.Vector3(x, th - 0.4, z), end, 0.32 * s, bark, "matte");
    const n = 5 + Math.floor(r() * 4);
    for (let j = 0; j < n; j++) {
      const cs = (2.4 + r() * 1.6) * s;
      flora.add(zone, "clump", cell, end.x + (r() - 0.5) * 3 * s, y0 + end.y + (r() - 0.2) * 1.4 * s, end.z + (r() - 0.5) * 3 * s, r() * 6, cs, cs * 0.7, new THREE.Color().setHSL(0.27 + r() * 0.06, 0.25, 0.85 + r() * 0.3));
    }
  }
  for (let j = 0; j < 6; j++) {
    const cs = (3 + r() * 1.5) * s;
    flora.add(zone, "clump", cell, x + (r() - 0.5) * 3 * s, y0 + th + (2.6 + r()) * s, z + (r() - 0.5) * 3 * s, r() * 6, cs, cs * 0.6);
  }
}

/** A palm: a ringed, slightly leaning trunk and a crown of fronds. */
export function palm(k: GardensKit, flora: Flora, f: number, x: number, z: number, h: number, r: Rng, cell: number = P.palm) {
  const zone = LEVELS[f].zone,
    y0 = LEVELS[f].y;
  const lean = new THREE.Vector2((r() - 0.5) * 0.12, (r() - 0.5) * 0.12);
  let prev = new THREE.Vector3(x, 0, z);
  const seg = 6;
  for (let i = 1; i <= seg; i++) {
    const u = i / seg;
    const p = new THREE.Vector3(x + lean.x * h * u * u, h * u, z + lean.y * h * u * u);
    k.beam(f, prev, p, 0.32 - u * 0.06, i % 2 ? "#8a7a62" : "#7a6a54", "matte");
    prev = p;
  }
  flora.rosette(zone, cell, prev.x, y0 + prev.y, prev.z, 12, 3.6, 0.42, 0.25, r);
}

export function bench(k: GardensKit, f: number, x: number, z: number, ry: number) {
  const c = Math.cos(ry),
    s = Math.sin(ry);
  for (const o of [-0.7, 0.7]) k.box(f, 0.08, 0.42, 0.42, x + o * c, 0, z - o * s, "#3a3a40", "metal", ry);
  k.box(f, 1.7, 0.06, 0.46, x, 0.42, z, "#9a6a3a", "matte", ry);
  k.box(f, 1.7, 0.36, 0.05, x + 0.22 * s, 0.5, z + 0.22 * c, "#9a6a3a", "matte", ry);
  k.solid(f, x - 0.9, z - 0.9, x + 0.9, z + 0.9);
}

export function lamp(k: GardensKit, f: number, x: number, z: number, color = "#ffe8c0", h = 4) {
  k.cyl(f, 0.09, 0.06, h, x, 0, z, "#2a2a30", "metal", 8);
  k.box(f, 0.5, 0.08, 0.5, x, h, z, "#2a2a30", "metal");
  k.box(f, 0.34, 0.3, 0.34, x, h - 0.3, z, color, "glow");
}

/**
 * Fill around (x, z) within radius `rad` with a tropical mix, keeping `clear` metres off paths
 * (and out of `avoid`).
 */
export function scatter(flora: Flora, f: number, paths: Paths | null, x: number, z: number, rad: number, n: number, r: Rng, o: { clear?: number; avoid?: (x: number, z: number) => boolean; mix?: number[]; scale?: number } = {}) {
  const zone = LEVELS[f].zone,
    y0 = LEVELS[f].y;
  const mix = o.mix ?? [P.bush, P.bush, P.fern, P.broad, P.heliconia, P.grass, P.bougain, P.marigold, P.bromeliad, P.orchid, P.palm, P.salvia];
  const sc = o.scale ?? 1;
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2,
      d = Math.sqrt(r()) * rad;
    const px = x + Math.cos(a) * d,
      pz = z + Math.sin(a) * d;
    if (paths && paths.dist(px, pz) < (o.clear ?? 0.4)) continue;
    if (o.avoid?.(px, pz)) continue;
    plant(flora, zone, mix[Math.floor(r() * mix.length)], px, y0, pz, r, sc);
  }
}

/** One plant of a kind at (x, y, z). */
export function plant(flora: Flora, zone: number, kind: number, x: number, y: number, z: number, r: Rng, sc = 1) {
  const yaw = r() * Math.PI * 2;
  const tint = new THREE.Color().setHSL(0.25 + r() * 0.1, 0.25, 0.8 + r() * 0.35);
  switch (kind) {
    case P.fern:
      flora.rosette(zone, P.fern, x, y, z, 7, (1.1 + r() * 0.8) * sc, 0.55, 0.5, r, tint);
      break;
    case P.palm:
      flora.rosette(zone, P.palm, x, y, z, 9, (1.6 + r() * 0.8) * sc, 0.45, 0.75, r, tint);
      break;
    case P.broad: {
      const n = 4 + Math.floor(r() * 3);
      for (let i = 0; i < n; i++) flora.add(zone, "frond", P.broad, x, y + 0.3, z, yaw + (i / n) * Math.PI * 2, (0.9 + r() * 0.5) * sc, (1.4 + r() * 0.9) * sc, tint, -0.7 - r() * 0.4);
      break;
    }
    case P.bromeliad:
      flora.rosette(zone, P.bromeliad, x, y, z, 9, (0.6 + r() * 0.3) * sc, 0.4, 0.75, r);
      break;
    case P.heliconia:
      flora.add(zone, "cross", P.heliconia, x, y, z, yaw, (1.4 + r() * 0.6) * sc, (1.8 + r() * 0.8) * sc);
      break;
    case P.grass:
      flora.add(zone, "cross", P.grass, x, y, z, yaw, (0.9 + r() * 0.5) * sc, (0.6 + r() * 0.4) * sc, tint);
      break;
    case P.agave:
      flora.add(zone, "cross", P.agave, x, y, z, yaw, (1 + r() * 0.8) * sc, (0.8 + r() * 0.6) * sc);
      break;
    default:
      flora.add(zone, "cross", kind, x, y, z, yaw, (1.2 + r() * 0.8) * sc, (0.8 + r() * 0.7) * sc, kind === P.bush ? tint : "#ffffff");
  }
}

// ---- haze ----------------------------------------------------------------------------------------

/**
 * A veil of haze (a geometry seen from inside): fog-coloured, thickest at the bottom and fading
 * by `top` (0..1 of the opacity left at height `h`). Distant towers and the glass behind it go soft.
 */
export function haze(geo: THREE.BufferGeometry, h: number, opacity: number, top = 0) {
  const u = { uColor: { value: new THREE.Color("#d0dce4") }, uOp: { value: opacity }, uH: { value: h }, uTop: { value: top } };
  const mat = new THREE.ShaderMaterial({
    uniforms: u,
    transparent: true,
    depthWrite: false,
    side: THREE.BackSide,
    vertexShader: `varying float vY; void main(){ vY = position.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 uColor; uniform float uOp, uH, uTop; varying float vY;
      void main(){ float k = clamp(vY / uH, 0.0, 1.0); float a = uOp * mix(1.0, uTop, pow(k, 0.7)); gl_FragColor = vec4(uColor, a); }`,
  });
  const m = new THREE.Mesh(geo, mat);
  m.raycast = () => {};
  m.renderOrder = 3;
  m.frustumCulled = false;
  return { mesh: m, u };
}
