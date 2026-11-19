/**
 * PLANET GRAB's space: the sky all round the planet. The camera circles the whole ball, so the sky has
 * no horizon and no "under" (k3's skyDome keeps its stars over one): the dome is painted once over the
 * full sphere, from the level's sun. Its colours run from the sun's side round to the far side, with
 * nebula clouds, a milky band and dark dust out of one seeded noise sampled by direction (no seam, no
 * pinch at the poles). It follows the camera; the stars over it are points of their own (crisp).
 */
import * as THREE from "three";
import { rng } from "../../kit";
import { canvasTex } from "../../k3";

export interface Space {
  seed: number;
  /** Where the level's sun is (unit). */
  sun: THREE.Vector3;
  /** The sky facing the sun, across from it, on the far side. */
  tone: [string, string, string];
  /** Where the middle tone sits on the way round from the sun (0…1, default 0.42). */
  turn?: number;
  /** The sun's glare painted round it: its colour, its strength, its reach (degrees). */
  glare?: [string, number, number];
  /** Nebula clouds: colour, strength, how rare (0…1), which mix of the two noises (0: the first … 1: the second, 2: where they differ). */
  clouds?: [string, number, number, number][];
  /** A milky band round the great circle at right angles to `pole`: its colour, its strength, its half width (as a sine). */
  band?: { pole: THREE.Vector3; color: string; k: number; width: number };
  /** Dark dust lanes (0: none … 1). */
  dust?: number;
}

/** The dome's picture (an equirectangular map, as a sphere's own uv reads it). */
const SW = 768;
const SH = 384;
/** Painted once a page for each level (a rematch builds the scene again). */
const painted = new Map<string, HTMLCanvasElement>();

/** Value noise on a lattice (0…1), from a seeded table. */
function lattice(seed: number) {
  const r = rng(seed);
  const perm = new Uint8Array(512);
  const val = new Float32Array(256);
  for (let i = 0; i < 256; i++) ((perm[i] = i), (val[i] = r()));
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    const t = perm[i];
    perm[i] = perm[j];
    perm[j] = t;
  }
  for (let i = 0; i < 256; i++) perm[256 + i] = perm[i];
  return (x: number, y: number, z: number) => {
    const xi = Math.floor(x),
      yi = Math.floor(y),
      zi = Math.floor(z);
    const xf = x - xi,
      yf = y - yi,
      zf = z - zi;
    const u = xf * xf * (3 - 2 * xf),
      v = yf * yf * (3 - 2 * yf),
      w = zf * zf * (3 - 2 * zf);
    const X = xi & 255,
      Y = yi & 255,
      Z = zi & 255;
    const A = perm[X] + Y,
      B = perm[X + 1] + Y;
    const AA = perm[A] + Z,
      AB = perm[A + 1] + Z,
      BA = perm[B] + Z,
      BB = perm[B + 1] + Z;
    const x00 = val[perm[AA]] + (val[perm[BA]] - val[perm[AA]]) * u;
    const x10 = val[perm[AB]] + (val[perm[BB]] - val[perm[AB]]) * u;
    const x01 = val[perm[AA + 1]] + (val[perm[BA + 1]] - val[perm[AA + 1]]) * u;
    const x11 = val[perm[AB + 1]] + (val[perm[BB + 1]] - val[perm[AB + 1]]) * u;
    const y0 = x00 + (x10 - x00) * v;
    const y1 = x01 + (x11 - x01) * v;
    return y0 + (y1 - y0) * w;
  };
}

const sm = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const rgb = (hex: string) => {
  const c = new THREE.Color(hex);
  // (the canvas is sRGB: mix there, as the eye sees the picture)
  c.convertLinearToSRGB();
  return [c.r * 255, c.g * 255, c.b * 255];
};

function paint(o: Space) {
  const cv = document.createElement("canvas");
  cv.width = SW;
  cv.height = SH;
  const g = cv.getContext("2d")!;
  const img = g.createImageData(SW, SH);
  const px = img.data;
  const n1 = lattice(o.seed);
  const n2 = lattice(o.seed + 101);
  const jit = rng(o.seed + 7);
  const [c0, c1, c2] = o.tone.map(rgb);
  const turn = o.turn ?? 0.42;
  const gl = o.glare ? rgb(o.glare[0]) : null;
  const glK = o.glare?.[1] ?? 0;
  const glR = ((o.glare?.[2] ?? 30) * Math.PI) / 180;
  const clouds = (o.clouds ?? []).map(([c, k, rare, mix]) => ({ c: rgb(c), k, rare, mix }));
  const band = o.band ? { c: rgb(o.band.color), k: o.band.k, w: o.band.width, p: o.band.pole } : null;
  const dust = o.dust ?? 0;
  const S = o.sun;
  const cosP = new Float32Array(SW),
    sinP = new Float32Array(SW);
  for (let x = 0; x < SW; x++) {
    const ph = ((x + 0.5) / SW) * Math.PI * 2;
    cosP[x] = Math.cos(ph);
    sinP[x] = Math.sin(ph);
  }
  // (four octaves of each noise, 0…1)
  const fbm = (n: (x: number, y: number, z: number) => number, x: number, y: number, z: number) =>
    (n(x, y, z) * 8 + n(x * 2.03 + 11, y * 2.03 + 5, z * 2.03 + 3) * 4 + n(x * 4.1 + 23, y * 4.1 + 7, z * 4.1 + 17) * 2 + n(x * 8.3 + 31, y * 8.3 + 19, z * 8.3 + 41)) / 15;
  let i = 0;
  for (let y = 0; y < SH; y++) {
    const th = ((y + 0.5) / SH) * Math.PI;
    const st = Math.sin(th),
      dy = Math.cos(th);
    for (let x = 0; x < SW; x++) {
      // (a sphere's uv: u round from −x through +z, v down from the pole)
      const dx = -cosP[x] * st,
        dz = sinP[x] * st;
      const ang = Math.acos(Math.min(1, Math.max(-1, dx * S.x + dy * S.y + dz * S.z)));
      const t = ang / Math.PI;
      const k1 = sm(0, turn, t),
        k2 = sm(turn, 1, t);
      let r = c0[0] + (c1[0] - c0[0]) * k1,
        gg = c0[1] + (c1[1] - c0[1]) * k1,
        b = c0[2] + (c1[2] - c0[2]) * k1;
      r += (c2[0] - r) * k2;
      gg += (c2[1] - gg) * k2;
      b += (c2[2] - b) * k2;
      const a = fbm(n1, dx * 2.1 + 9, dy * 2.1 + 4, dz * 2.1 + 2);
      const bb = fbm(n2, dx * 3.3 + 1, dy * 3.3 + 8, dz * 3.3 + 6);
      for (const c of clouds) {
        const f = c.mix >= 2 ? 0.5 + (a - bb) * 1.6 : a + (bb - a) * c.mix;
        const m = sm(c.rare, c.rare + 0.3, f) * c.k;
        r += c.c[0] * m;
        gg += c.c[1] * m;
        b += c.c[2] * m;
      }
      if (band) {
        const lat = (dx * band.p.x + dy * band.p.y + dz * band.p.z) / band.w;
        const m = Math.exp(-lat * lat) * (0.35 + 1.3 * bb * bb) * band.k;
        r += band.c[0] * m;
        gg += band.c[1] * m;
        b += band.c[2] * m;
      }
      if (dust > 0) {
        const m = 1 - dust * sm(0.5, 0.72, 1 - a) * sm(0.35, 0.6, bb);
        r *= m;
        gg *= m;
        b *= m;
      }
      if (gl) {
        const m = (Math.exp(-(ang * ang) / (glR * glR)) + 0.35 * Math.exp(-ang / (glR * 1.6))) * glK;
        r += gl[0] * m;
        gg += gl[1] * m;
        b += gl[2] * m;
      }
      // (a grain of noise: no bands in the dark gradients)
      const d = (jit() - 0.5) * 1.6;
      px[i++] = r + d;
      px[i++] = gg + d;
      px[i++] = b + d;
      px[i++] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return cv;
}

/** The sky's dome round the camera (one draw, behind everything). `key`: the level's (its picture is kept for a rematch). */
export function spaceDome(scene: THREE.Scene, key: string, o: Space) {
  let cv = painted.get(key);
  if (!cv) painted.set(key, (cv = paint(o)));
  const tex = canvasTex(SW, SH, (g) => g.drawImage(cv!, 0, 0));
  tex.wrapS = THREE.RepeatWrapping;
  tex.anisotropy = 1;
  const dome = new THREE.Mesh(new THREE.SphereGeometry(400, 40, 20), new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false, depthWrite: false, depthTest: false }));
  dome.renderOrder = -1000;
  dome.frustumCulled = false;
  dome.raycast = () => {};
  dome.userData.noShadow = true;
  dome.onBeforeRender = (_r, _s, cam) => {
    dome.position.setFromMatrixPosition(cam.matrixWorld);
    dome.updateMatrixWorld();
  };
  scene.add(dome);
  // (the flat backdrop under it is never seen: a plain colour, no full-screen picture to draw)
  if (scene.background instanceof THREE.Texture) scene.background.dispose();
  scene.background = new THREE.Color(o.tone[2]);
  return dome;
}

export interface StarOpts {
  n: number;
  /** Their size on the screen (px). */
  size: number;
  rad?: number;
  palette: string[];
  dim?: number;
  seed: number;
  /** More of them along this great circle (the milky band's pole), by `k` (0: even). */
  pole?: THREE.Vector3;
  k?: number;
  /** Fewer and fainter near the sun (its glare drowns them): the sun, the reach (degrees). */
  sun?: THREE.Vector3;
  reach?: number;
}

/** A shell of stars (one draw, `map`: a soft dot); twinkle its material's opacity. */
export function starShell(scene: THREE.Scene, map: THREE.Texture, o: StarOpts) {
  const r = rng(o.seed);
  const pc = o.palette.map((c) => new THREE.Color(c));
  const pos = new Float32Array(o.n * 3),
    col = new Float32Array(o.n * 3);
  const reach = Math.cos(((o.reach ?? 0) * Math.PI) / 180);
  for (let i = 0; i < o.n; i++) {
    let x = 0,
      y = 1,
      z = 0,
      glare = 1;
    for (let t = 0; t < 6; t++) {
      const zz = r() * 2 - 1,
        a = r() * Math.PI * 2,
        k = Math.sqrt(1 - zz * zz);
      x = Math.cos(a) * k;
      y = zz;
      z = Math.sin(a) * k;
      // (crowded toward the band: a spot far from it is drawn again, more often the higher `k`)
      if (o.pole && o.k && Math.abs(x * o.pole.x + y * o.pole.y + z * o.pole.z) > 0.3 && r() < o.k) continue;
      if (o.sun && o.reach) {
        const u = x * o.sun.x + y * o.sun.y + z * o.sun.z;
        glare = u > reach ? 1 - (u - reach) / (1 - reach) : 1;
        if (r() > glare) continue;
      }
      break;
    }
    const d = (o.rad ?? 430) + r() * 60;
    pos.set([x * d, y * d, z * d], i * 3);
    const c = pc[i % pc.length],
      b = (0.45 + r() * 0.55) * (o.dim ?? 1) * (0.4 + 0.6 * glare);
    col.set([c.r * b, c.g * b, c.b * b], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  const pts = new THREE.Points(g, new THREE.PointsMaterial({ size: o.size, sizeAttenuation: false, vertexColors: true, map, transparent: true, depthWrite: false }));
  pts.raycast = () => {};
  pts.frustumCulled = false;
  scene.add(pts);
  return pts;
}

const bn = new THREE.Vector3();
const lit = new THREE.Color();
/**
 * A far body's light, baked into its corners: its day side faces the level's sun whatever the play
 * light does (that one turns with the camera). `sun`: in the body's own frame; `night`: its dark side.
 */
export function sunBake(geo: THREE.BufferGeometry, sun: THREE.Vector3, night: string, soft = 0.22) {
  const nrm = geo.getAttribute("normal");
  const col = new Float32Array(nrm.count * 3);
  const dark = new THREE.Color(night);
  for (let i = 0; i < nrm.count; i++) {
    const d = bn.fromBufferAttribute(nrm, i).dot(sun);
    lit.copy(dark).lerp(WHITE, sm(-soft * 0.4, soft, d));
    col.set([lit.r, lit.g, lit.b], i * 3);
  }
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return geo;
}
const WHITE = new THREE.Color(1, 1, 1);
