import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { DETAIL_TIME } from "../detail";
import { PROP_HOLES, PROP_HOLE_N } from "../voxel/mesher";
import { maps } from "./tex";

/**
 * The city's trees, realistic (src/scene/real): a bark trunk and branches, and a crown of leaf
 * cards — clusters of real leaves (CC0 atlases: LeafSet009 round leaves, LeafSet010 maple,
 * PineNeedles001; cherry blossom drawn) composed onto a card once, alpha-tested, two-sided, lit as
 * if the crown were round. Palms: a ringed, leaning trunk and drooping fronds (leaflets from
 * LeafSet026 along a midrib). All of them sway in the wind (vertex shader, DETAIL_TIME).
 *
 * Every species has a few shapes; each shape is two instanced meshes (bark, leaves) for every tree
 * of the city that wears it: a handful of draw calls for hundreds of trees.
 */

export type Species = "broad" | "plane" | "blossom" | "maple" | "pine" | "palm" | "bush";

const BASE = `${import.meta.env?.BASE_URL ?? "/"}tex/`;
const rand = (seed: number) => {
  let h = (seed * 2654435761) >>> 0;
  return () => ((h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0), ((h ^ (h >>> 13)) >>> 0) / 4294967296);
};

// ---- leaf sprites from the CC0 atlases (colour + opacity) --------------------------------------

interface Atlas {
  canvas: HTMLCanvasElement;
  cols: number;
  rows: number;
}
const atlases = new Map<string, Promise<Atlas>>();
function img(url: string) {
  return new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = url;
  });
}
/** A leaf atlas with its opacity folded into the alpha (once). */
function atlas(set: string, cols: number, rows: number): Promise<Atlas> {
  let p = atlases.get(set);
  if (!p) {
    p = Promise.all([img(`${BASE}${set}/color.webp`), img(`${BASE}${set}/opacity.webp`)]).then(([c, o]) => {
      const S = 512;
      const cv = document.createElement("canvas");
      cv.width = cv.height = S;
      const g = cv.getContext("2d", { willReadFrequently: true })!;
      g.drawImage(o, 0, 0, S, S);
      const a = g.getImageData(0, 0, S, S);
      g.clearRect(0, 0, S, S);
      g.drawImage(c, 0, 0, S, S);
      const d = g.getImageData(0, 0, S, S);
      for (let i = 0; i < d.data.length; i += 4) d.data[i + 3] = a.data[i];
      g.putImageData(d, 0, 0);
      return { canvas: cv, cols, rows };
    });
    atlases.set(set, p);
  }
  return p;
}

/** Draw sprite k of an atlas centred at (x, y), `size` px tall, turned `rot`, brightness `b`. */
function stamp(g: CanvasRenderingContext2D, a: Atlas, k: number, x: number, y: number, size: number, rot: number, b: number, extra = "", byWidth = false) {
  const cw = a.canvas.width / a.cols,
    ch = a.canvas.height / a.rows;
  const cx = (k % a.cols) * cw,
    cy = (Math.floor(k / a.cols) % a.rows) * ch;
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.filter = `brightness(${b.toFixed(2)}) ${extra}`;
  const s = size / (byWidth ? cw : ch);
  g.drawImage(a.canvas, cx, cy, cw, ch, (-cw * s) / 2, (-ch * s) / 2, cw * s, ch * s);
  g.restore();
}

/** A texture painted when its sources arrive (blank until then). */
function painted(w: number, h: number, paint: (g: CanvasRenderingContext2D) => Promise<void> | void) {
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.userData.shared = true;
  void Promise.resolve(paint(cv.getContext("2d")!)).then(() => {
    t.needsUpdate = true;
  });
  return t;
}

/** A cluster card: twigs, then a mass of leaves gathered round the middle (denser in its heart). */
function clusterCard(set: string, cols: number, rows: number, opts: { n: number; size: [number, number]; seed: number; twig: string; dark?: number; flowers?: boolean; filter?: string }) {
  return painted(512, 512, async (g) => {
    const a = await atlas(set, cols, rows);
    const r = rand(opts.seed);
    // twigs from the card's foot, forking out
    g.strokeStyle = opts.twig;
    g.lineCap = "round";
    for (let i = 0; i < 5; i++) {
      let x = 256 + (r() - 0.5) * 60,
        y = 500,
        ang = -Math.PI / 2 + (r() - 0.5) * 1.4;
      g.lineWidth = 7;
      g.beginPath();
      g.moveTo(x, y);
      for (let k = 0; k < 6; k++) {
        x += Math.cos(ang) * 50;
        y += Math.sin(ang) * 50;
        ang += (r() - 0.5) * 0.7;
        g.lineTo(x, y);
        g.lineWidth = Math.max(1.5, g.lineWidth * 0.75);
      }
      g.stroke();
    }
    const sprites = cols * rows;
    for (let i = 0; i < opts.n; i++) {
      // (a gaussian-ish spread round the card's middle, a little high)
      const ang = r() * Math.PI * 2,
        rad = Math.sqrt(r()) * 200 * (0.6 + r() * 0.4);
      const x = 256 + Math.cos(ang) * rad,
        y = 236 + Math.sin(ang) * rad * 0.9;
      const inner = 1 - rad / 230;
      const size = opts.size[0] + r() * (opts.size[1] - opts.size[0]);
      stamp(g, a, Math.floor(r() * sprites), x, y, size, r() * Math.PI * 2, (opts.dark ?? 0.72) + r() * 0.42 - inner * 0.18, opts.filter ?? "");
    }
    if (opts.flowers) {
      // cherry blossom: five-petal flowers in pinks, clustered, over the leaves
      for (let i = 0; i < 260; i++) {
        const ang = r() * Math.PI * 2,
          rad = Math.sqrt(r()) * 215;
        const x = 256 + Math.cos(ang) * rad,
          y = 240 + Math.sin(ang) * rad * 0.9;
        const s = 7 + r() * 7;
        const pink = [`#ffd6e4`, `#ffc2d6`, `#f7a8c4`, `#ffe8ef`, `#f09ab8`][Math.floor(r() * 5)];
        g.fillStyle = pink;
        for (let k = 0; k < 5; k++) {
          const pa = (k / 5) * Math.PI * 2 + r();
          g.beginPath();
          g.ellipse(x + Math.cos(pa) * s * 0.55, y + Math.sin(pa) * s * 0.55, s * 0.5, s * 0.32, pa, 0, Math.PI * 2);
          g.fill();
        }
        g.fillStyle = "#e8b04a";
        g.beginPath();
        g.arc(x, y, s * 0.18, 0, Math.PI * 2);
        g.fill();
      }
    }
  });
}

/** A palm frond: the midrib down the middle, leaflets either side from LeafSet026, drooping at the tip. */
function frondTexture() {
  return painted(256, 1024, async (g) => {
    const a = await atlas("LeafSet026", 3, 2);
    const r = rand(77);
    // leaflets: long, angled forward, either side of the rib; the card's v runs base (bottom) to tip (top)
    for (let y = 1000; y > 30; y -= 15) {
      const t = 1 - y / 1024;
      const len = 120 * Math.sin(Math.min(1, t * 1.35) * Math.PI * 0.95) + 18;
      for (const side of [-1, 1]) {
        const ang = side * (1.05 + t * 0.35) - Math.PI / 2;
        const x = 128 + Math.cos(ang) * len * 0.5,
          yy = y + Math.sin(ang) * len * 0.5;
        // (the atlas's leaves lie along x: turned to the leaflet's own direction, sized by their length)
        stamp(g, a, Math.floor(r() * 3), x, yy, len * 1.15, ang, 0.82 + r() * 0.3, "saturate(1.2)", true);
      }
    }
    // the midrib
    g.strokeStyle = "#8a7a46";
    g.lineWidth = 6;
    g.beginPath();
    g.moveTo(128, 1024);
    g.lineTo(128, 10);
    g.stroke();
  });
}

/** The palm's trunk: rings of old leaf scars, grey-brown, rough. */
function palmBarkTexture() {
  return painted(128, 256, (g) => {
    const r = rand(5);
    g.fillStyle = "#8a7a64";
    g.fillRect(0, 0, 128, 256);
    for (let y = 0; y < 256; y += 16) {
      const grd = g.createLinearGradient(0, y, 0, y + 16);
      grd.addColorStop(0, "#5a4c3c");
      grd.addColorStop(0.25, "#9a8a72");
      grd.addColorStop(0.7, "#8a7a62");
      grd.addColorStop(1, "#6a5a48");
      g.fillStyle = grd;
      g.fillRect(0, y, 128, 16);
    }
    for (let i = 0; i < 900; i++) {
      g.fillStyle = `rgba(${r() > 0.5 ? "40,32,24" : "170,160,140"},${0.15 + r() * 0.2})`;
      g.fillRect(r() * 128, r() * 256, 1 + r() * 3, 1 + r() * 2);
    }
  });
}

// ---- materials ---------------------------------------------------------------------------------

const WIND_HEAD = /* glsl */ `
uniform vec4 uHoles[48];
uniform int uHoleN;
uniform float uWindTime;
uniform float uWindH;
uniform float uWindAmp;
uniform float uFlutter;
`;
const WIND_BODY = /* glsl */ `
{
  vec3 ip = vec3(0.0);
  #ifdef USE_INSTANCING
  ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
  #endif
  float h = clamp(position.y / uWindH, 0.0, 1.4);
  float ph = uWindTime * 1.1 + ip.x * 0.31 + ip.z * 0.17;
  float sway = (sin(ph) * 0.65 + sin(ph * 2.3 + 1.7) * 0.25) * h * h * uWindAmp;
  transformed.x += sway;
  transformed.z += sway * 0.55;
  transformed += normal * sin(uWindTime * 5.5 + position.x * 3.1 + position.z * 2.3 + ip.x) * 0.025 * h * uFlutter;
  // knocked down by the game (PROP_HOLES on its trunk): this whole tree is taken out
  #ifdef USE_INSTANCING
  vec2 io = (modelMatrix * vec4(ip, 1.0)).xz;
  for (int i = 0; i < 48; i++) {
    if (i >= uHoleN) break;
    if (distance(io, uHoles[i].xy) < 0.9) { transformed = vec3(0.0, -500.0, 0.0); break; }
  }
  #endif
}
`;
function windy<T extends THREE.Material>(m: T, height: number, amp: number, flutter: number): T {
  const u = { uWindTime: DETAIL_TIME, uWindH: { value: height }, uWindAmp: { value: amp }, uFlutter: { value: flutter }, uHoles: PROP_HOLES, uHoleN: PROP_HOLE_N };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\n" + WIND_HEAD).replace("#include <begin_vertex>", "#include <begin_vertex>\n" + WIND_BODY);
  };
  m.customProgramCacheKey = () => `real-wind`;
  return m;
}

const leafCache = new Map<string, { mat: THREE.MeshStandardMaterial; depth: THREE.MeshDepthMaterial }>();
function leafMat(key: string, tex: THREE.Texture, height: number, tint = "#ffffff", amp = 0.12) {
  let e = leafCache.get(key);
  if (e) return e;
  const mat = windy(new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.42, side: THREE.DoubleSide, roughness: 0.72, metalness: 0, color: tint }), height, amp, 1);
  mat.userData.shared = true;
  const depth = windy(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: tex, alphaTest: 0.42, side: THREE.DoubleSide }), height, amp, 1);
  e = { mat, depth };
  leafCache.set(key, e);
  return e;
}
let barkM: THREE.MeshStandardMaterial | null = null;
let palmBarkM: THREE.MeshStandardMaterial | null = null;
function barkMat() {
  if (barkM) return barkM;
  const mp = maps("Bark012");
  barkM = windy(new THREE.MeshStandardMaterial({ map: mp.map, normalMap: mp.normalMap, roughnessMap: mp.roughnessMap, roughness: 1, color: "#c8bfb2" }), 9, 0.06, 0);
  barkM.userData.shared = true;
  return barkM;
}
function palmBark() {
  if (palmBarkM) return palmBarkM;
  const t = palmBarkTexture();
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  palmBarkM = windy(new THREE.MeshStandardMaterial({ map: t, bumpMap: t, bumpScale: 2, roughness: 0.95 }), 9, 0.1, 0);
  palmBarkM.userData.shared = true;
  return palmBarkM;
}

// ---- geometry ----------------------------------------------------------------------------------

/** A tapered limb from a to b (radii ra → rb), its bark's UVs in metres (u round, v along). */
function limb(a: THREE.Vector3, b: THREE.Vector3, ra: number, rb: number, seg = 7, tile = 1.2) {
  const len = a.distanceTo(b);
  const geo = new THREE.CylinderGeometry(rb, ra, len, seg, 1, true);
  const uv = geo.getAttribute("uv");
  const circ = Math.PI * 2 * (ra + rb) * 0.5;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * circ) / tile, (uv.getY(i) * len) / tile);
  geo.translate(0, len / 2, 0);
  const dir = new THREE.Vector3().subVectors(b, a).normalize();
  geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir));
  geo.translate(a.x, a.y, a.z);
  return geo;
}

/** Leaf cards scattered in an ellipsoid crown, their normals bent outward (the crown lit as a whole). */
function crownCards(r: () => number, n: number, c: THREE.Vector3, rad: THREE.Vector3, size: [number, number], shell = 0.55) {
  const pos: number[] = [],
    nor: number[] = [],
    uv: number[] = [],
    idx: number[] = [];
  const q = new THREE.Quaternion(),
    e = new THREE.Euler();
  const corner = [
    [-0.5, -0.5, 0, 0],
    [0.5, -0.5, 1, 0],
    [0.5, 0.5, 1, 1],
    [-0.5, 0.5, 0, 1],
  ];
  const v = new THREE.Vector3(),
    out = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    // a point in the crown, mostly toward its shell
    const u = r() * 2 - 1,
      th = r() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    const k = shell + (1 - shell) * Math.pow(r(), 0.5);
    const p = new THREE.Vector3(Math.cos(th) * s * rad.x * k, u * rad.y * k, Math.sin(th) * s * rad.z * k).add(c);
    const sz = size[0] + r() * (size[1] - size[0]);
    e.set((r() - 0.5) * 1.6, r() * Math.PI * 2, (r() - 0.5) * 1.2);
    q.setFromEuler(e);
    const base = pos.length / 3;
    for (const [cx, cy, cu, cv] of corner) {
      v.set(cx * sz, cy * sz, 0).applyQuaternion(q).add(p);
      pos.push(v.x, v.y, v.z);
      // the bent normal: out from the crown's middle, a little up
      out.subVectors(v, c).divide(rad).normalize();
      out.y += 0.35;
      out.normalize();
      nor.push(out.x, out.y, out.z);
      uv.push(cu, cv);
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

interface Shape {
  bark: THREE.BufferGeometry;
  leaves: THREE.BufferGeometry;
  leaf: { mat: THREE.MeshStandardMaterial; depth: THREE.MeshDepthMaterial };
  barkMat: THREE.MeshStandardMaterial;
  /** The crown, for the camera and the rain (centre height, radius). */
  crown: [number, number];
}

const leafTex = new Map<string, THREE.Texture>();
function tex(key: string, make: () => THREE.Texture) {
  let t = leafTex.get(key);
  if (!t) leafTex.set(key, (t = make()));
  return t;
}

/** A broadleaved street tree: trunk, a few limbs, a round crown. */
function broadShape(seed: number, sp: Species): Shape {
  const r = rand(seed * 13 + 1);
  const kind = sp === "maple" ? "maple" : sp === "blossom" ? "blossom" : sp === "plane" ? "plane" : "broad";
  const tall = sp === "plane" ? 1.25 : sp === "maple" ? 0.62 : sp === "blossom" ? 0.78 : 1;
  const H = (4.6 + r() * 1.2) * tall;
  const trunkH = H * 0.42;
  const parts: THREE.BufferGeometry[] = [];
  const base = new THREE.Vector3(0, 0, 0),
    top = new THREE.Vector3((r() - 0.5) * 0.3, trunkH, (r() - 0.5) * 0.3);
  parts.push(limb(base, top, 0.17 * tall + 0.03, 0.11 * tall + 0.02, 8));
  const crownC = new THREE.Vector3(top.x, trunkH + H * 0.34, top.z);
  const rad = new THREE.Vector3(H * (sp === "blossom" ? 0.6 : 0.44), H * (sp === "blossom" ? 0.3 : 0.36), H * (sp === "blossom" ? 0.6 : 0.44));
  const nl = 4 + Math.floor(r() * 3);
  for (let i = 0; i < nl; i++) {
    const a = (i / nl) * Math.PI * 2 + r() * 0.6;
    const from = top.clone().add(new THREE.Vector3(0, -r() * 0.5, 0));
    const to = new THREE.Vector3(crownC.x + Math.cos(a) * rad.x * 0.65, crownC.y + (r() - 0.2) * rad.y * 0.6, crownC.z + Math.sin(a) * rad.z * 0.65);
    parts.push(limb(from, to, 0.07 * tall + 0.02, 0.025, 6));
  }
  const bark = mergeGeometries(parts.map((p) => p.toNonIndexed()), false)!;
  let t: THREE.Texture;
  let tint = "#ffffff";
  if (kind === "maple") (t = tex("maple", () => clusterCard("LeafSet010", 2, 2, { n: 150, size: [70, 110], seed: 3, twig: "#5a3a28" }))), (tint = "#ffb08a");
  else if (kind === "blossom") t = tex("blossom", () => clusterCard("LeafSet009", 3, 2, { n: 70, size: [60, 90], seed: 4, twig: "#4a3428", flowers: true }));
  else if (kind === "plane") (t = tex("plane", () => clusterCard("LeafSet010", 2, 2, { n: 160, size: [76, 118], seed: 6, twig: "#6a5a3a" }))), (tint = "#d8ecb0");
  else (t = tex("broad", () => clusterCard("LeafSet009", 3, 2, { n: 190, size: [64, 100], seed: 5, twig: "#5a4630" }))), (tint = "#a6cc8a");
  const leaves = crownCards(r, sp === "maple" ? 48 : 72, crownC, rad, [1.35 * tall + 0.35, 2.0 * tall + 0.45]);
  return { bark, leaves, leaf: leafMat(kind, t, H, tint, sp === "plane" ? 0.14 : 0.12), barkMat: barkMat(), crown: [crownC.y, Math.max(rad.x, rad.y) * 1.1] };
}

/** A pine: a straight trunk and tiers of needle cards, a cone. */
function pineShape(seed: number): Shape {
  const r = rand(seed * 7 + 9);
  const H = 8 + r() * 2.5;
  const bark = limb(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, H * 0.92, 0), 0.22, 0.05, 8).toNonIndexed();
  const t = tex("pine", () => clusterCard("PineNeedles001", 2, 4, { n: 110, size: [130, 190], seed: 8, twig: "#4a3426", dark: 0.55, filter: "hue-rotate(62deg) saturate(1.5)" }));
  const geos: THREE.BufferGeometry[] = [];
  const tiers = 7;
  for (let k = 0; k < tiers; k++) {
    const y = H * (0.28 + (k / tiers) * 0.68);
    const w = (1 - k / tiers) * 2.4 + 0.4;
    geos.push(crownCards(r, 26 - k * 2, new THREE.Vector3(0, y, 0), new THREE.Vector3(w, 0.55, w), [1.1, 1.6], 0.5));
  }
  const leaves = mergeGeometries(geos, false)!;
  return { bark, leaves, leaf: leafMat("pine", t, H, "#cfe0c0", 0.08), barkMat: barkMat(), crown: [H * 0.6, 3] };
}

/** A palm: a ringed trunk leaning and curving a little, a crown of drooping fronds. */
function palmShape(seed: number): Shape {
  const r = rand(seed * 31 + 7);
  const H = 7 + r() * 3;
  const lean = 0.08 + r() * 0.12;
  const a = r() * Math.PI * 2;
  const parts: THREE.BufferGeometry[] = [];
  const seg = 8;
  let prev = new THREE.Vector3(0, 0, 0);
  for (let i = 1; i <= seg; i++) {
    const t = i / seg;
    const p = new THREE.Vector3(Math.cos(a) * lean * t * t * H, t * H, Math.sin(a) * lean * t * t * H);
    parts.push(limb(prev, p, 0.24 - 0.08 * ((i - 1) / seg), 0.24 - 0.08 * t, 9, 1.8));
    prev = p;
  }
  const bark = mergeGeometries(parts.map((p) => p.toNonIndexed()), false)!;
  const top = prev;
  // fronds: a strip each, from the crown out and down, widest a third of the way
  const pos: number[] = [],
    nor: number[] = [],
    uv: number[] = [],
    idx: number[] = [];
  const nF = 12 + Math.floor(r() * 4);
  const S = 10;
  for (let f = 0; f < nF; f++) {
    const fa = (f / nF) * Math.PI * 2 + r() * 0.3;
    const L = 3.6 + r() * 1.4;
    const rise = 0.9 + r() * 0.8;
    const dir = new THREE.Vector3(Math.cos(fa), 0, Math.sin(fa));
    const side = new THREE.Vector3(-dir.z, 0, dir.x);
    const base = pos.length / 3;
    for (let k = 0; k <= S; k++) {
      const t = k / S;
      // out and up, then over and down (a drooping arc)
      const along = t * L;
      const y = rise * Math.sin(t * Math.PI * 0.55) - t * t * 2.4;
      const w = 0.95 * Math.sin(Math.min(1, t * 1.6) * Math.PI * 0.85) + 0.08;
      const c = top.clone().addScaledVector(dir, along + 0.15).add(new THREE.Vector3(0, y, 0));
      const tw = (r() - 0.5) * 0.15;
      for (const s of [-1, 1]) {
        const p = c.clone().addScaledVector(side, s * w * 0.5).add(new THREE.Vector3(0, -Math.abs(s) * w * 0.12 + tw, 0));
        pos.push(p.x, p.y, p.z);
        const n = new THREE.Vector3(0, 1, 0).addScaledVector(dir, 0.3).normalize();
        nor.push(n.x, n.y, n.z);
        uv.push(s < 0 ? 0 : 1, t);
      }
    }
    for (let k = 0; k < S; k++) {
      const i0 = base + k * 2;
      idx.push(i0, i0 + 1, i0 + 3, i0, i0 + 3, i0 + 2);
    }
  }
  const fronds = new THREE.BufferGeometry();
  fronds.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  fronds.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  fronds.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  fronds.setIndex(idx);
  // coconuts under the crown
  const nuts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 4; i++) {
    const na = r() * Math.PI * 2;
    nuts.push(new THREE.SphereGeometry(0.13, 7, 5).translate(top.x + Math.cos(na) * 0.22, top.y - 0.18, top.z + Math.sin(na) * 0.22).toNonIndexed());
  }
  void nuts;
  const t = tex("frond", () => frondTexture());
  return { bark, leaves: fronds, leaf: leafMat("palm", t, H, "#e8f4c8", 0.1), barkMat: palmBark(), crown: [top.y, 4] };
}

/** A bush: leaf cards in a low dome. */
function bushShape(seed: number): Shape {
  const r = rand(seed * 5 + 2);
  const t = tex("broad", () => clusterCard("LeafSet009", 3, 2, { n: 190, size: [64, 100], seed: 5, twig: "#5a4630" }));
  const leaves = crownCards(r, 40, new THREE.Vector3(0, 0.55, 0), new THREE.Vector3(1.1, 0.6, 1.1), [0.7, 1.1], 0.5);
  const bark = new THREE.BufferGeometry();
  bark.setAttribute("position", new THREE.Float32BufferAttribute([], 3));
  return { bark, leaves, leaf: leafMat("broad", t, 1.4, "#ffffff", 0.04), barkMat: barkMat(), crown: [0.6, 1.2] };
}

const SHAPES = 3;
const shapes = new Map<string, Shape>();
function shape(sp: Species, v: number) {
  const key = `${sp}:${v}`;
  let s = shapes.get(key);
  if (!s) {
    s = sp === "pine" ? pineShape(v) : sp === "palm" ? palmShape(v) : sp === "bush" ? bushShape(v) : broadShape(v, sp);
    shapes.set(key, s);
  }
  return s;
}

/** The plan's tree kinds (voxel/props.ts TreeKind, the gardens' maples) as species. */
export function speciesOf(type: string, kind: string): Species {
  if (type === "maple") return "maple";
  switch (kind) {
    case "blossom":
      return "blossom";
    case "pine":
      return "pine";
    case "palm":
      return "palm";
    case "bush":
      return "bush";
    case "tall":
      return "plane";
    case "persimmon":
      return "maple";
    default:
      return "broad";
  }
}

export interface TreeSpot {
  x: number;
  z: number;
  y?: number;
  rot?: number;
  species: Species;
  seed: number;
}

/** Beyond this from the camera's focus a tree is drawn light: a third of its cards, no shadow. */
const NEAR_R = 75;
interface Lot {
  mats: THREE.Matrix4[];
  at: THREE.Vector3[];
  bark: THREE.InstancedMesh | null;
  near: THREE.InstancedMesh;
  far: THREE.InstancedMesh;
  colors: THREE.Color[];
}
const lots: Lot[] = [];
const lastFocus = new THREE.Vector3(1e9, 0, 0);

/**
 * Near the camera's focus the trees are whole and cast their shadows; further off a third of their
 * leaf cards and no shadow (the shadow map drew every leaf of the city each frame). Cheap: only
 * when the focus has moved a few metres.
 */
export function treeLod(focus: THREE.Vector3) {
  if (focus.distanceToSquared(lastFocus) < 8 * 8) return;
  lastFocus.copy(focus);
  const r2 = NEAR_R * NEAR_R;
  for (const l of lots) {
    let n = 0,
      f = 0;
    for (let i = 0; i < l.mats.length; i++) {
      const p = l.at[i];
      if ((p.x - focus.x) ** 2 + (p.z - focus.z) ** 2 < r2) {
        l.near.setMatrixAt(n, l.mats[i]);
        l.near.setColorAt(n++, l.colors[i]);
      } else {
        l.far.setMatrixAt(f, l.mats[i]);
        l.far.setColorAt(f++, l.colors[i]);
      }
    }
    l.near.count = n;
    l.far.count = f;
    for (const im of [l.near, l.far]) {
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
    }
  }
}

/**
 * Every tree of a list as instanced meshes (bark, and near and far leaves, per shape), in
 * `parent`. Returns the crowns (for the rain and the camera) as spheres.
 */
export function plantTrees(parent: THREE.Object3D, list: TreeSpot[]) {
  const groups = new Map<string, TreeSpot[]>();
  for (const t of list) {
    const k = `${t.species}:${Math.floor(Math.abs(t.seed)) % SHAPES}`;
    const l = groups.get(k);
    if (l) l.push(t);
    else groups.set(k, [t]);
  }
  const crowns: THREE.Sphere[] = [];
  const q = new THREE.Quaternion(),
    s = new THREE.Vector3(),
    p = new THREE.Vector3(),
    Y = new THREE.Vector3(0, 1, 0);
  for (const [k, ts] of groups) {
    const [sp, v] = k.split(":");
    const sh = shape(sp as Species, Number(v));
    const bark = sh.bark.getAttribute("position")?.count ? new THREE.InstancedMesh(sh.bark, sh.barkMat, ts.length) : null;
    const near = new THREE.InstancedMesh(sh.leaves, sh.leaf.mat, ts.length);
    near.customDepthMaterial = sh.leaf.depth;
    // the far crowns: the same cards' first third (shared buffers, a shorter draw)
    const lite = new THREE.BufferGeometry();
    for (const [name, a] of Object.entries(sh.leaves.attributes)) lite.setAttribute(name, a);
    // (one card in three over the whole crown: the first third was one end of it, and a far pine or
    // palm showed a bare top over a tuft)
    {
      const src = sh.leaves.index?.array ?? [];
      const keep: number[] = [];
      for (let c = 0; c + 6 <= src.length; c += 6) if ((c / 6) % 3 === 0) for (let k = 0; k < 6; k++) keep.push(src[c + k]);
      lite.setIndex(keep);
    }
    const far = new THREE.InstancedMesh(lite, sh.leaf.mat, ts.length);
    const lot: Lot = { mats: [], at: [], bark, near, far, colors: [] };
    ts.forEach((t, i) => {
      const r = rand(t.seed * 17 + i);
      const sc = 0.85 + r() * 0.3;
      q.setFromAxisAngle(Y, t.rot ?? r() * Math.PI * 2);
      const m = new THREE.Matrix4().compose(p.set(t.x, t.y ?? 0.2, t.z), q, s.setScalar(sc));
      bark?.setMatrixAt(i, m);
      lot.mats.push(m);
      lot.at.push(new THREE.Vector3(t.x, 0, t.z));
      // each crown a slightly different green
      lot.colors.push(new THREE.Color().setHSL(0, 0, 0.86 + r() * 0.2));
      crowns.push(new THREE.Sphere(new THREE.Vector3(t.x, (t.y ?? 0.2) + sh.crown[0] * sc, t.z), sh.crown[1] * sc));
    });
    // (all near until the first focus)
    lot.mats.forEach((m, i) => (near.setMatrixAt(i, m), near.setColorAt(i, lot.colors[i])));
    far.count = 0;
    far.setColorAt(0, new THREE.Color(1, 1, 1));
    for (const im of [bark, near, far]) {
      if (!im) continue;
      im.castShadow = im !== far;
      im.receiveShadow = true;
      im.frustumCulled = false;
      im.name = `real:trees:${k}`;
      // (the leaves are no wall: the game's solid shape takes the trunks only — low crowns over the
      // road edge read as obstacles on the asphalt)
      if (im !== bark) im.userData.noField = true;
      parent.add(im);
    }
    lots.push(lot);
  }
  lastFocus.set(1e9, 0, 0);
  return crowns;
}

/** One tree on its own (plain meshes on the shared shape and materials: a tree the game knocks over falls as this). */
export function treeObject(species: Species, seed: number) {
  const sh = shape(species, Math.floor(Math.abs(seed)) % SHAPES);
  const g = new THREE.Group();
  if (sh.bark.getAttribute("position")?.count) {
    const b = new THREE.Mesh(sh.bark, sh.barkMat);
    b.castShadow = true;
    g.add(b);
  }
  const l = new THREE.Mesh(sh.leaves, sh.leaf.mat);
  l.customDepthMaterial = sh.leaf.depth;
  l.castShadow = true;
  g.add(l);
  return g;
}

/** A species' shared shape (geometry and materials), for others that instance it their own way (the woods: src/scene/forest/trees.ts). */
export function treeShape(species: Species, v: number) {
  const sh = shape(species, Math.floor(Math.abs(v)) % SHAPES);
  return { bark: sh.bark, leaves: sh.leaves, barkMat: sh.barkMat, leafMat: sh.leaf.mat, leafDepth: sh.leaf.depth };
}

/**
 * Foliage in given blobs (indoor plants, planters, a voxel model's leaves turned real: src/scene/real/remesh.ts):
 * leaf cards in each ellipsoid (centre, radii, count, card size), one geometry, the broadleaf cards with a
 * whisper of sway. Returns the geometry and its shared materials.
 */
export function foliageCards(blobs: { c: THREE.Vector3; rad: THREE.Vector3; n: number; size: [number, number] }[], seed = 1, kind: "broad" | "plane" = "broad") {
  const r = rand(seed * 31 + 7);
  const geos = blobs.map((b) => crownCards(r, b.n, b.c, b.rad, b.size, 0.35));
  const geometry = geos.length === 1 ? geos[0] : mergeGeometries(geos, false)!;
  const t = kind === "plane" ? tex("plane", () => clusterCard("LeafSet010", 2, 2, { n: 160, size: [76, 118], seed: 6, twig: "#6a5a3a" })) : tex("broad", () => clusterCard("LeafSet009", 3, 2, { n: 190, size: [64, 100], seed: 5, twig: "#5a4630" }));
  const m = leafMat(`indoor-${kind}`, t, 3, kind === "plane" ? "#d8ecb0" : "#a6cc8a", 0.015);
  return { geometry, mat: m.mat, depth: m.depth };
}
