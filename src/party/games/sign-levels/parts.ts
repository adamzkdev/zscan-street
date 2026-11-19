/**
 * The levels' set builder (PROVE THE BLOCK, MEMPOOL RUSH and CHAIN STACK share it): every static
 * piece of a set as a few InstancedMeshes (toon, unlit, and their ink hulls), a city of towers far
 * round it in a palette of its own, and a sky of stars. One draw per kind of piece, whatever the count.
 */
import * as THREE from "three";
import { GEO, canvasTex, glow, toon, toonSteps } from "../../k3";

type Kind = "box" | "cyl" | "ball" | "cone";
interface Piece {
  k: Kind;
  c: string;
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  rx: number;
  ry: number;
  rz: number;
  ink: number;
  lit: boolean;
}

export class Parts {
  private p: Piece[] = [];
  add(k: Kind, c: string, sx: number, sy: number, sz: number, x: number, y: number, z: number, o: { rx?: number; ry?: number; rz?: number; ink?: number; lit?: boolean } = {}) {
    this.p.push({ k, c, sx, sy, sz, x, y, z, rx: o.rx ?? 0, ry: o.ry ?? 0, rz: o.rz ?? 0, ink: o.ink ?? 0, lit: !!o.lit });
  }
  /** A box standing on y (its bottom at y). */
  box(c: string, w: number, h: number, d: number, x: number, y: number, z: number, ink = 0, ry = 0) {
    this.add("box", c, w, h, d, x, y + h / 2, z, { ink, ry });
  }
  /** A lit (unshaded) box standing on y. */
  lit(c: string, w: number, h: number, d: number, x: number, y: number, z: number, ry = 0) {
    this.add("box", c, w, h, d, x, y + h / 2, z, { lit: true, ry });
  }
  /** A cylinder of radius r standing on y. */
  cyl(c: string, r: number, h: number, x: number, y: number, z: number, ink = 0) {
    this.add("cyl", c, r * 2, h, r * 2, x, y + h / 2, z, { ink });
  }
  get count() {
    return this.p.length;
  }
  /** Into `parent`: a mesh per kind (toon / lit / ink). */
  build(parent: THREE.Object3D, ink: THREE.Material) {
    const M = new THREE.Matrix4(),
      Q = new THREE.Quaternion(),
      E = new THREE.Euler(),
      P = new THREE.Vector3(),
      S = new THREE.Vector3(),
      C = new THREE.Color();
    const groups = new Map<string, Piece[]>();
    for (const q of this.p) {
      const key = `${q.k}:${q.lit ? 1 : 0}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(q);
      if (q.ink) {
        const ik = `${q.k}:ink`;
        if (!groups.has(ik)) groups.set(ik, []);
        groups.get(ik)!.push(q);
      }
    }
    const out: THREE.InstancedMesh[] = [];
    for (const [key, list] of groups) {
      const [k, mode] = key.split(":") as [Kind, string];
      const isInk = mode === "ink";
      const mat = isInk ? ink : mode === "1" ? glow("#ffffff") : toon("#ffffff");
      const mesh = new THREE.InstancedMesh(GEO[k], mat, list.length);
      list.forEach((q, i) => {
        E.set(q.rx, q.ry, q.rz, "YXZ");
        Q.setFromEuler(E);
        const t = isInk ? q.ink * 2 : 0;
        M.compose(P.set(q.x, q.y, q.z), Q, S.set(q.sx + t, q.sy + t, q.sz + t));
        mesh.setMatrixAt(i, M);
        if (!isInk) mesh.setColorAt(i, C.set(q.c));
      });
      mesh.raycast = () => {};
      mesh.frustumCulled = false;
      parent.add(mesh);
      out.push(mesh);
    }
    this.p.length = 0;
    return out;
  }
}

/** A ring of towers far round the set (one draw): `pal` their colours, `win` [lit, dark] window colours, `lit` the share of lit windows. */
export function city(
  parent: THREE.Object3D,
  o: { r: number; n: number; y: number; rnd: () => number; pal: string[]; win: [string, string]; lit: number; tall?: number; glowK?: number; broken?: boolean; from?: number; to?: number },
) {
  // (the walls and their windows; the glow: the lit windows only, so the walls keep their colour)
  const lit: boolean[] = [];
  for (let k = 0; k < 11 * 6; k++) lit.push(Math.random() < o.lit);
  const paint = (glowOnly: boolean) => (g: CanvasRenderingContext2D) => {
    g.fillStyle = glowOnly ? "#000" : "#fff";
    g.fillRect(0, 0, 64, 128);
    let i = 0;
    for (let y = 6; y < 128; y += 12)
      for (let x = 5; x < 64; x += 12, i++) {
        if (glowOnly && !lit[i]) continue;
        g.fillStyle = lit[i] ? o.win[0] : o.win[1];
        g.fillRect(x, y, 7, 7);
      }
  };
  const tex = canvasTex(64, 128, paint(false), true);
  const k = o.glowK ?? 0;
  const mat = new THREE.MeshToonMaterial({ map: tex, gradientMap: toonSteps(), emissive: k ? new THREE.Color(1, 1, 1).multiplyScalar(Math.min(1, k * 2.2)) : new THREE.Color(0), emissiveMap: k ? canvasTex(64, 128, paint(true), true) : null });
  const n = o.n * (o.broken ? 2 : 1);
  const mesh = new THREE.InstancedMesh(GEO.box, mat, n);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const c = new THREE.Color();
  const up = new THREE.Vector3(0, 1, 0);
  const a0 = o.from ?? 0,
    a1 = o.to ?? Math.PI * 2;
  let i = 0;
  for (let j = 0; j < o.n; j++) {
    const a = a0 + ((j + 0.5) / o.n) * (a1 - a0) + (o.rnd() - 0.5) * 0.04;
    const d = o.r * (0.9 + o.rnd() * 0.28);
    const w = 7 + o.rnd() * 9;
    const h = (8 + o.rnd() * o.rnd() * 70) * (o.tall ?? 1);
    q.setFromAxisAngle(up, -a);
    const x = Math.cos(a) * d,
      z = Math.sin(a) * d;
    if (o.broken) {
      // a tower snapped: its stump, and a slab of its top fallen askew against it
      const h1 = h * (0.55 + o.rnd() * 0.25);
      m.compose(new THREE.Vector3(x, o.y + h1 / 2, z), q, new THREE.Vector3(w, h1, w));
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i++, c.set(o.pal[j % o.pal.length]));
      const tq = new THREE.Quaternion().setFromEuler(new THREE.Euler((o.rnd() - 0.5) * 0.7, -a, (o.rnd() - 0.5) * 0.9));
      const h2 = Math.max(4, h - h1) * 0.8;
      m.compose(new THREE.Vector3(x + (o.rnd() - 0.5) * w * 0.6, o.y + h1 + h2 * 0.3, z + (o.rnd() - 0.5) * w * 0.6), tq, new THREE.Vector3(w * 0.8, h2, w * 0.8));
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i++, c.set(o.pal[(j + 2) % o.pal.length]));
    } else {
      m.compose(new THREE.Vector3(x, o.y + h / 2, z), q, new THREE.Vector3(w, h, w));
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i++, c.set(o.pal[j % o.pal.length]));
    }
  }
  mesh.count = i;
  mesh.raycast = () => {};
  parent.add(mesh);
  return mesh;
}

/** Stars on a far dome (one draw). */
export function stars(parent: THREE.Object3D, n: number, r: number, rnd: () => number, minY = 0.05) {
  const mesh = new THREE.InstancedMesh(GEO.box, new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false }), n);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2;
    const y = minY + rnd() * (1 - minY);
    const k = Math.sqrt(1 - y * y);
    const s = 0.5 + rnd() * rnd() * 1.6;
    m.compose(new THREE.Vector3(Math.cos(a) * k * r, y * r, Math.sin(a) * k * r), q, new THREE.Vector3(s, s, s));
    mesh.setMatrixAt(i, m);
    const b = 0.55 + rnd() * 0.45;
    mesh.setColorAt(i, c.setRGB(b, b, b * (0.9 + rnd() * 0.2)));
  }
  mesh.raycast = () => {};
  mesh.frustumCulled = false;
  parent.add(mesh);
  return mesh;
}

/** Things falling through a box round a point (snow, rain): one instanced draw, moved by `tick`. */
export class Fall {
  readonly mesh: THREE.InstancedMesh;
  private d: Float32Array;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private p = new THREE.Vector3();
  private s = new THREE.Vector3();
  constructor(
    parent: THREE.Object3D,
    private n: number,
    mat: THREE.Material,
    private o: { x: number; z: number; w: number; d: number; y0: number; y1: number; v: number; size: [number, number, number]; drift?: number },
  ) {
    this.mesh = new THREE.InstancedMesh(GEO.box, mat, n);
    this.mesh.frustumCulled = false;
    this.mesh.raycast = () => {};
    this.d = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      this.d[i * 4] = o.x + (Math.random() - 0.5) * o.w;
      this.d[i * 4 + 1] = o.y0 + Math.random() * (o.y1 - o.y0);
      this.d[i * 4 + 2] = o.z + (Math.random() - 0.5) * o.d;
      this.d[i * 4 + 3] = 0.7 + Math.random() * 0.6;
    }
    parent.add(this.mesh);
  }
  /** `wind`: a sideways push (m/s); `lean`: the streaks' tilt with it. */
  tick(dt: number, t: number, wind = 0, lean = 0) {
    const o = this.o,
      d = this.d;
    this.e.set(0, 0, lean);
    this.q.setFromEuler(this.e);
    for (let i = 0; i < this.n; i++) {
      const k = d[i * 4 + 3];
      d[i * 4 + 1] -= o.v * k * dt;
      d[i * 4] += (wind + Math.sin(t * 1.3 + i) * (o.drift ?? 0)) * dt;
      if (d[i * 4 + 1] < o.y0) {
        d[i * 4 + 1] = o.y1;
        d[i * 4] = o.x + (Math.random() - 0.5) * o.w;
      } else if (d[i * 4 + 1] > o.y1) {
        // (rising things: embers, sky lanterns)
        d[i * 4 + 1] = o.y0;
        d[i * 4] = o.x + (Math.random() - 0.5) * o.w;
      }
      if (d[i * 4] > o.x + o.w / 2) d[i * 4] -= o.w;
      if (d[i * 4] < o.x - o.w / 2) d[i * 4] += o.w;
      this.m.compose(this.p.set(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]), this.q, this.s.set(o.size[0] * k, o.size[1] * k, o.size[2] * k));
      this.mesh.setMatrixAt(i, this.m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/** Shipping containers (one draw, their ink another): ribbed steel in each one's colour, `l` long (x, before `ry`). */
export function containers(parent: THREE.Object3D, list: { c: string; x: number; y: number; z: number; ry?: number; l?: number }[], ink: THREE.Material) {
  const ribTex = canvasTex(
    128,
    32,
    (g) => {
      g.fillStyle = "#ffffff";
      g.fillRect(0, 0, 128, 32);
      g.fillStyle = "rgba(0,0,0,0.2)";
      for (let x = 2; x < 128; x += 8) g.fillRect(x, 3, 3, 26);
      g.fillStyle = "rgba(0,0,0,0.32)";
      g.fillRect(0, 0, 128, 3);
      g.fillRect(0, 29, 128, 3);
      g.fillStyle = "rgba(255,255,255,0.35)";
      for (let x = 5; x < 128; x += 8) g.fillRect(x, 3, 1, 26);
    },
    true,
  );
  const mat = new THREE.MeshToonMaterial({ color: 0xffffff, map: ribTex, gradientMap: toonSteps() });
  const body = new THREE.InstancedMesh(GEO.box, mat, list.length);
  const hull = new THREE.InstancedMesh(GEO.box, ink, list.length);
  const m = new THREE.Matrix4(),
    q = new THREE.Quaternion(),
    up = new THREE.Vector3(0, 1, 0),
    c = new THREE.Color();
  list.forEach((k, i) => {
    q.setFromAxisAngle(up, k.ry ?? 0);
    const l = k.l ?? 4.4;
    m.compose(new THREE.Vector3(k.x, k.y + 0.8, k.z), q, new THREE.Vector3(l, 1.6, 1.6));
    body.setMatrixAt(i, m);
    body.setColorAt(i, c.set(k.c));
    m.compose(new THREE.Vector3(k.x, k.y + 0.8, k.z), q, new THREE.Vector3(l + 0.09, 1.69, 1.69));
    hull.setMatrixAt(i, m);
  });
  for (const x of [body, hull]) ((x.frustumCulled = false), (x.raycast = () => {}), parent.add(x));
  return body;
}

/** Little things bobbing or twinkling in place (lanterns on water, glints, fireflies): one draw, moved by `tick`. */
export class Bobs {
  readonly mesh: THREE.InstancedMesh;
  private d: Float32Array;
  private sh: Float32Array;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private p = new THREE.Vector3();
  private s = new THREE.Vector3();
  constructor(
    parent: THREE.Object3D,
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    pts: { x: number; y: number; z: number; s: number; c?: string; w?: number; h?: number; dd?: number }[],
    private o: { bob?: number; twinkle?: number; drift?: number; speed?: number; spin?: number; slide?: number; wrap?: number } = {},
  ) {
    this.mesh = new THREE.InstancedMesh(geo, mat, pts.length);
    this.mesh.frustumCulled = false;
    this.mesh.raycast = () => {};
    this.d = new Float32Array(pts.length * 5);
    this.sh = new Float32Array(pts.length * 3);
    const c = new THREE.Color();
    pts.forEach((pt, i) => {
      this.d.set([pt.x, pt.y, pt.z, pt.s, Math.random() * 10], i * 5);
      this.sh.set([pt.w ?? 1, pt.h ?? 1, pt.dd ?? 1], i * 3);
      if (pt.c) this.mesh.setColorAt(i, c.set(pt.c));
    });
    parent.add(this.mesh);
  }
  tick(t: number) {
    const d = this.d,
      o = this.o;
    const sp = o.speed ?? 1;
    for (let i = 0; i < this.mesh.count; i++) {
      const ph = d[i * 5 + 4];
      const tw = o.twinkle ? Math.max(0, 1 - o.twinkle + o.twinkle * (0.5 + 0.5 * Math.sin(t * 3.1 * sp + ph * 7))) : 1;
      const k = d[i * 5 + 3] * tw;
      // (slide: a steady drift along x, wrapped round ±wrap)
      let x = d[i * 5] + Math.sin(t * 0.4 * sp + ph) * (o.drift ?? 0);
      if (o.slide) {
        const w = o.wrap ?? 60;
        x = ((((x + t * o.slide + w) % (2 * w)) + 2 * w) % (2 * w)) - w;
      }
      this.p.set(x, d[i * 5 + 1] + Math.sin(t * 1.7 * sp + ph) * (o.bob ?? 0), d[i * 5 + 2] + Math.cos(t * 0.33 * sp + ph) * (o.drift ?? 0));
      this.q.setFromAxisAngle(this.s.set(0, 1, 0), ph + t * 0.3 * sp * (o.spin ?? 1));
      this.m.compose(this.p, this.q, this.s.set(k * this.sh[i * 3], k * this.sh[i * 3 + 1], k * this.sh[i * 3 + 2]));
      this.mesh.setMatrixAt(i, this.m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/** A soft round light (additive): pools under lamps, halos round bulbs (a texture of its own: the game's disposeScene frees it). */
export function softGlow() {
  return canvasTex(64, 64, (g) => {
    const gr = g.createRadialGradient(32, 32, 1, 32, 32, 32);
    gr.addColorStop(0, "rgba(255,255,255,1)");
    gr.addColorStop(0.4, "rgba(255,255,255,0.45)");
    gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
  });
}

/** Flat additive pools of light on the ground (one draw). */
export function pools(parent: THREE.Object3D, list: { x: number; y: number; z: number; r: number; c: string; a?: number }[]) {
  const mat = new THREE.MeshBasicMaterial({ map: softGlow(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const mesh = new THREE.InstancedMesh(geo, mat, list.length);
  const m = new THREE.Matrix4(),
    q = new THREE.Quaternion(),
    c = new THREE.Color();
  list.forEach((p, i) => {
    m.compose(new THREE.Vector3(p.x, p.y, p.z), q, new THREE.Vector3(p.r * 2, 1, p.r * 2));
    mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, c.set(p.c).multiplyScalar(p.a ?? 0.5));
  });
  mesh.renderOrder = 1;
  mesh.frustumCulled = false;
  mesh.raycast = () => {};
  parent.add(mesh);
  return mesh;
}

/** Fireworks far off (one draw): a shell climbs, bursts into a ball of sparks that fall and fade. Cosmetic (Math.random). */
export class Fireworks {
  readonly mesh: THREE.InstancedMesh;
  private p: Float32Array;
  private n: number;
  private next = 0;
  private wait = 0.5;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3();
  private c = new THREE.Color();
  constructor(
    parent: THREE.Object3D,
    private o: { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number; every: number; colors: string[]; size?: number },
    cap = 240,
  ) {
    this.n = cap;
    this.mesh = new THREE.InstancedMesh(GEO.box, new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false }), cap);
    this.mesh.frustumCulled = false;
    this.mesh.raycast = () => {};
    // per spark: x y z vx vy vz life
    this.p = new Float32Array(cap * 7);
    for (let i = 0; i < cap; i++) this.mesh.setColorAt(i, this.c.set("#ffffff"));
    parent.add(this.mesh);
  }
  /** A burst now at (x, y, z) (k: its size). */
  burst(x: number, y: number, z: number, k = 1) {
    const col = this.o.colors[Math.floor(Math.random() * this.o.colors.length)];
    const n = Math.round(36 * k);
    for (let j = 0; j < n; j++) {
      const i = this.next++ % this.n;
      const a = Math.random() * Math.PI * 2,
        u = Math.random() * 2 - 1,
        r = Math.sqrt(1 - u * u);
      const sp = (7 + Math.random() * 2) * k;
      this.p.set([x, y, z, Math.cos(a) * r * sp, u * sp, Math.sin(a) * r * sp, 1], i * 7);
      this.mesh.setColorAt(i, this.c.set(j % 5 ? col : "#ffffff"));
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
  tick(dt: number, on = true) {
    const o = this.o;
    this.wait -= dt;
    if (on && this.wait <= 0) {
      this.wait = o.every * (0.6 + Math.random() * 0.8);
      this.burst(o.x0 + Math.random() * (o.x1 - o.x0), o.y0 + Math.random() * (o.y1 - o.y0), o.z0 + Math.random() * (o.z1 - o.z0), 0.8 + Math.random() * 0.5);
    }
    const p = this.p,
      sz = o.size ?? 0.45;
    for (let i = 0; i < this.n; i++) {
      let life = p[i * 7 + 6];
      if (life > 0) {
        life -= dt * 0.75;
        p[i * 7 + 6] = life;
        const drag = Math.exp(-2.2 * dt);
        p[i * 7 + 3] *= drag;
        p[i * 7 + 4] = p[i * 7 + 4] * drag - 4 * dt;
        p[i * 7 + 5] *= drag;
        p[i * 7] += p[i * 7 + 3] * dt;
        p[i * 7 + 1] += p[i * 7 + 4] * dt;
        p[i * 7 + 2] += p[i * 7 + 5] * dt;
      }
      const k = life > 0 ? sz * (0.4 + life * 0.8) * (life < 0.25 ? (Math.random() < 0.5 ? 1 : 0.3) : 1) : 0;
      this.m.compose(this.v.set(p[i * 7], p[i * 7 + 1], p[i * 7 + 2]), this.q, this.s.set(k, k, k));
      this.mesh.setMatrixAt(i, this.m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
