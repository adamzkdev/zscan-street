import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { Flora, P } from "./flora";
import { type GardensKit, LEVELS } from "./kit";

/**
 * The Supertrees: a concrete core inside a funnel of rust-purple steel members crossing in a
 * diamond lattice, every cell of it planted (ferns, bromeliads, orchids, vines), under an inverted
 * umbrella of radial ribs and rings studded with lights. The lights are one point cloud per zone,
 * coloured in the shader: a steady glow at night, and GARDEN RHAPSODY, the light show, waves running
 * up the trunks, round the crowns and from tree to tree, on each new block and every few minutes.
 */

export interface TreeSpec {
  x: number;
  z: number;
  h: number;
  /** Crown radius. */
  r: number;
  /** Night colour of its lights. */
  glow: string;
}

const STEEL = "#5e2f45";
const STEEL_HI = "#7a3c58";
const CORE = "#8a8278";

/** The crowns' steel mesh: one lathe per tree, drawn together with a lattice texture. */
const crownGeos: THREE.BufferGeometry[] = [];
export function buildCrowns(parent: THREE.Object3D) {
  if (!crownGeos.length) return;
  const geo = mergeGeometries(crownGeos, false)!;
  crownGeos.length = 0;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  g.strokeStyle = "#ffffff";
  g.lineWidth = 7;
  for (const d of [-1, 1]) {
    g.beginPath();
    for (let i = -2; i <= 2; i++) {
      g.moveTo(i * 64, d > 0 ? 0 : 128);
      g.lineTo(i * 64 + 128, d > 0 ? 128 : 0);
    }
    g.stroke();
  }
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(0, 64);
  g.lineTo(128, 64);
  g.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  const mat = new THREE.MeshStandardMaterial({ color: STEEL, alphaMap: tex, alphaTest: 0.5, transparent: false, side: THREE.DoubleSide, roughness: 0.6, metalness: 0.4 });
  const m = new THREE.Mesh(geo, mat);
  m.raycast = () => {};
  parent.add(m);
}

export class LightShow {
  private pos: number[] = [];
  private col: number[] = [];
  private att: number[] = [];
  readonly uniforms = {
    uTime: { value: 0 },
    uShow: { value: 0 },
    uNight: { value: 1 },
    uMode: { value: 0 },
    uScale: { value: 400 },
  };
  /** Seconds since the show started (-1: not running). */
  private at = -1;
  private next = 6;
  readonly length = 52;
  onStart: (() => void) | null = null;

  /** A light at (x, y, z) (scene), its colour, tree index, height along the tree 0..1, angle 0..1, crown radius 0..1. */
  add(x: number, y: number, z: number, color: THREE.Color, tree: number, h: number, a: number, r: number) {
    this.pos.push(x, y, z);
    this.col.push(color.r, color.g, color.b);
    this.att.push(tree, h, a, r);
  }

  build(parent: THREE.Object3D) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(this.col, 3));
    geo.setAttribute("aInfo", new THREE.Float32BufferAttribute(this.att, 4));
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        attribute vec3 color;
        attribute vec4 aInfo;
        uniform float uTime, uShow, uNight, uMode, uScale;
        varying vec3 vCol;
        float h1(float n) { return fract(sin(n) * 43758.5453); }
        vec3 hue(float h) { return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); }
        void main() {
          float tree = aInfo.x, ht = aInfo.y, ang = aInfo.z, rad = aInfo.w;
          float id = float(gl_VertexID);
          // steady: each tree breathes slowly, the crown rim brighter
          float steady = 0.55 + 0.25 * sin(uTime * 0.6 + tree * 1.7) + rad * 0.3;
          vec3 base = color * steady;
          // the show: a pattern per movement
          float t = uTime;
          float k;
          if (uMode < 0.5) k = smoothstep(0.55, 1.0, 0.5 + 0.5 * sin(ht * 14.0 - t * 4.5));
          else if (uMode < 1.5) k = smoothstep(0.5, 1.0, 0.5 + 0.5 * sin(ang * 6.2832 * 3.0 + t * 3.5 + tree));
          else if (uMode < 2.5) k = smoothstep(0.4, 1.0, 0.5 + 0.5 * sin(rad * 12.0 - t * 6.0 + ht * 6.0));
          else if (uMode < 3.5) k = smoothstep(0.6, 1.0, 0.5 + 0.5 * sin(position.x * 0.09 - t * 2.6 + ht * 2.0));
          else k = step(0.82, h1(id * 0.137 + floor(t * 9.0)));
          vec3 showCol = hue(fract(t * 0.06 + tree * 0.11 + ht * 0.35 + uMode * 0.2)) * 0.85 + 0.15;
          vec3 c = mix(base, showCol * (0.15 + 1.9 * k), uShow);
          vCol = c * mix(0.0, 1.0, uNight) + showCol * k * uShow * (1.0 - uNight) * 0.5;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = clamp(uScale * (0.34 + 0.25 * k * uShow) / -mv.z, 1.5, 26.0);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        varying vec3 vCol;
        void main() {
          vec2 d = gl_PointCoord - 0.5;
          float r = length(d) * 2.0;
          float a = smoothstep(1.0, 0.0, r);
          a = a * a + smoothstep(0.35, 0.0, r);
          gl_FragColor = vec4(vCol * a, a);
        }`,
    });
    mat.toneMapped = false;
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    pts.raycast = () => {};
    parent.add(pts);
    this.pos = [];
    this.col = [];
    this.att = [];
    return pts;
  }

  /** Start Garden Rhapsody now. */
  start() {
    if (this.at >= 0) return;
    this.at = 0;
    this.onStart?.();
  }
  get running() {
    return this.at >= 0;
  }

  update(dt: number, t: number, viewH: number) {
    const u = this.uniforms;
    u.uTime.value = t;
    u.uScale.value = viewH * 0.9;
    if (this.at < 0) {
      this.next -= dt;
      if (this.next <= 0) this.start();
      u.uShow.value = Math.max(0, u.uShow.value - dt * 0.5);
      return;
    }
    this.at += dt;
    const fade = Math.min(1, this.at / 2, (this.length - this.at) / 3);
    u.uShow.value = Math.max(0, fade);
    u.uMode.value = Math.floor(this.at / 7.5) % 5;
    if (this.at >= this.length) {
      this.at = -1;
      this.next = 150 + Math.random() * 60;
    }
  }
}

/**
 * One Supertree on floor f, trunk at (x, z): steel, garden, crown, and its lights (into `show`).
 * Returns the radius of its trunk at height y (for the Skyway's landings).
 */
export function supertree(k: GardensKit, flora: Flora, show: LightShow, f: number, i: number, t: TreeSpec) {
  const zone = LEVELS[f].zone;
  const y0 = LEVELS[f].y;
  const rnd = (() => {
    let s = 1000 + i * 7919;
    return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
  })();
  const H = t.h;
  const Hc = H * 0.7;
  /** Radius of the trunk's funnel at height h (narrowest a third of the way up). */
  const rAt = (h: number) => {
    const u = h / Hc;
    return 1.75 - 0.55 * Math.sin(Math.min(1, u * 1.5) * Math.PI * 0.5) + 1.3 * Math.pow(Math.max(0, u - 0.55) / 0.45, 2);
  };
  const glow = new THREE.Color(t.glow);
  const warm = new THREE.Color("#ffe6c0");
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

  // ---- the planter at its foot
  k.cyl(f, 3.6, 3.5, 0.5, t.x, 0, t.z, "#b8b0a2", "matte", 28);
  k.cyl(f, 3.3, 3.3, 0.56, t.x, 0, t.z, "#3a2a1e", "matte", 28);
  k.disc(f, t.x, t.z, 3.0);
  // the core
  k.cyl(f, 1.05, 0.85, Hc + 1.5, t.x, 0, t.z, CORE, "matte", 14);

  // ---- the steel funnel: members spiralling both ways, rings every few metres
  const N = 14;
  const step = 1.6;
  for (let dir = -1; dir <= 1; dir += 2)
    for (let m = 0; m < N; m++) {
      let prev: THREE.Vector3 | null = null;
      for (let h = 0.4; h <= Hc + 0.01; h += step) {
        const a = (m / N) * Math.PI * 2 + dir * h * 0.085;
        const r = rAt(h);
        const p = v(t.x + Math.cos(a) * r, h, t.z + Math.sin(a) * r);
        if (prev) k.beam(f, prev, p, 0.13, dir > 0 ? STEEL : STEEL_HI, "matte");
        prev = p;
      }
    }
  for (let h = 3; h < Hc; h += 3.2) {
    const r = rAt(h) + 0.04;
    let prev: THREE.Vector3 | null = null;
    for (let s = 0; s <= 28; s++) {
      const a = (s / 28) * Math.PI * 2;
      const p = v(t.x + Math.cos(a) * r, h, t.z + Math.sin(a) * r);
      if (prev) k.beam(f, prev, p, 0.1, STEEL, "matte");
      prev = p;
    }
  }
  // the garden in its cells: vine panels, ferns and bromeliads sticking out, orchids, flowers
  const kinds = [P.vine, P.vine, P.vine, P.fern, P.bromeliad, P.orchid, P.vine, P.fern, P.vine, P.bromeliad];
  for (let h = 0.6; h < Hc - 0.8; h += 1.05) {
    const r = rAt(h + 0.6);
    const n = Math.round((Math.PI * 2 * r) / 0.85);
    for (let s = 0; s < n; s++) {
      if (rnd() < 0.12) continue;
      const a = (s / n) * Math.PI * 2 + rnd() * 0.2 + h * 0.3;
      const x = t.x + Math.cos(a) * (r - 0.12),
        z = t.z + Math.sin(a) * (r - 0.12);
      const yaw = Math.PI / 2 - a;
      const kind = kinds[Math.floor(rnd() * kinds.length)];
      const tint = new THREE.Color().setHSL(0.27 + rnd() * 0.08, 0.3, 0.85 + rnd() * 0.25);
      if (kind === P.fern || kind === P.bromeliad) flora.add(zone, "frond", kind, x, y0 + h, z, yaw, 0.5, 1.2 + rnd() * 0.6, "#ffffff", -0.4 - rnd() * 0.5, (rnd() - 0.5) * 0.8);
      else flora.add(zone, "panel", kind, x, y0 + h - 0.1, z, yaw, 1.1 + rnd() * 0.4, 1.3 + rnd() * 0.6, kind === P.vine ? tint : "#ffffff", (rnd() - 0.5) * 0.2 - (h / Hc) * 0.25);
    }
  }
  // lights climbing the trunk members
  for (let m = 0; m < N; m += 2)
    for (let h = 1.2; h < Hc; h += 2.4) {
      const a = (m / N) * Math.PI * 2 + h * 0.085;
      const r = rAt(h) + 0.12;
      show.add(t.x + Math.cos(a) * r, y0 + h, t.z + Math.sin(a) * r, glow, i, (h / H) * 0.85, m / N, 0);
    }

  // ---- the crown: an inverted umbrella of ribs and rings
  const R0 = rAt(Hc);
  const ribs = 28;
  const rings = [0.3, 0.55, 0.8, 1];
  const crown = (u: number) => ({ r: R0 + (t.r - R0) * u, y: Hc + (H - Hc) * Math.pow(u, 0.7) });
  for (let s = 0; s < ribs; s++) {
    const a = (s / ribs) * Math.PI * 2 + i;
    let prev: THREE.Vector3 | null = null;
    for (let u = 0; u <= 1.001; u += 0.125) {
      const c = crown(u);
      const p = v(t.x + Math.cos(a) * c.r, c.y, t.z + Math.sin(a) * c.r);
      if (prev) k.beam(f, prev, p, 0.16, STEEL, "matte");
      prev = p;
      if (u > 0.2) show.add(p.x, y0 + p.y - 0.15, p.z, s % 3 === 0 ? warm : glow, i, 0.72 + u * 0.28, s / ribs, u);
    }
    // a diagonal between this rib and the next, for the lattice
    const a2 = ((s + 1) / ribs) * Math.PI * 2 + i;
    for (let j = 0; j < 4; j++) {
      const c0 = crown(j / 4),
        c1 = crown((j + 1) / 4);
      k.beam(f, v(t.x + Math.cos(a) * c0.r, c0.y, t.z + Math.sin(a) * c0.r), v(t.x + Math.cos(a2) * c1.r, c1.y, t.z + Math.sin(a2) * c1.r), 0.09, STEEL_HI, "matte");
    }
  }
  for (const u of rings) {
    const c = crown(u);
    const n = Math.max(24, Math.round(c.r * 6));
    let prev: THREE.Vector3 | null = null;
    for (let s = 0; s <= n; s++) {
      const a = (s / n) * Math.PI * 2;
      const p = v(t.x + Math.cos(a) * c.r, c.y, t.z + Math.sin(a) * c.r);
      if (prev) k.beam(f, prev, p, u === 1 ? 0.24 : 0.14, u === 1 ? STEEL_HI : STEEL, "matte");
      prev = p;
      if (u === 1 && s % 2 === 0) show.add(p.x, y0 + p.y + 0.15, p.z, glow, i, 1, s / n, 1);
    }
  }
  // the steel mesh between the ribs
  {
    const prof: THREE.Vector2[] = [];
    for (let j = 0; j <= 10; j++) {
      const c = crown(j / 10);
      prof.push(new THREE.Vector2(c.r - 0.05, c.y));
    }
    const lathe = new THREE.LatheGeometry(prof, 48);
    const uv = lathe.attributes.uv;
    const reps = Math.round(t.r * 4);
    for (let j = 0; j < uv.count; j++) uv.setXY(j, uv.getX(j) * reps, uv.getY(j) * Math.round((H - Hc) / 1.4 + 2));
    lathe.translate(t.x, y0, t.z);
    crownGeos.push(lathe);
  }
  // the cap on the core, a few plants up there
  k.cyl(f, R0 * 0.9, R0 * 0.75, 0.6, t.x, Hc + 1.4, t.z, STEEL, "matte", 18);
  // lights hung under the crown, warm and coloured
  for (let s = 0; s < 16; s++) {
    const a = (s / 16) * Math.PI * 2 + 0.1;
    const c = crown(0.55 + (s % 2) * 0.25);
    show.add(t.x + Math.cos(a) * c.r * 0.92, y0 + c.y - 1.2, t.z + Math.sin(a) * c.r * 0.92, s % 2 ? warm : glow, i, 0.8, s / 16, 0.6);
  }
  return rAt;
}
