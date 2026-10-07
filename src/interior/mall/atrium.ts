import * as THREE from "three";
import { hash } from "../../scene/voxel/model";
import { CZ, FH, LEVELS, MallKit, RAIL, ROOF, VX, VZ0, VZ1, X0, X1, Z0, Z1 } from "./kit";
import { marbleTex, tiledMat, woodTex } from "./tex";

/**
 * The atrium: the slabs round the void, glass balustrades with planters spilling vines, the
 * sunken forest valley on the ground floor (terraces stepping down to the pool, a boardwalk out to
 * the water), the RAIN VORTEX falling from the oculus of the glass dome, mist, the night light
 * show, the glass roof onto the real sky, and the escalators criss-crossing the void.
 */

const GREENS = ["#2e6b36", "#3b8040", "#4c9446", "#2a5d33", "#5fa84c", "#7cbd58", "#356f3a", "#46874a"];
const BLOOM = ["#ff8ac8", "#ffffff", "#ffd84a", "#ff6a5a", "#c89aff"];

/** A shrub: a few leaf cubes, now and then a flower. */
export function bush(k: MallKit, x: number, y: number, z: number, s: number, seed: number) {
  const n = 3 + Math.floor(hash(seed, 1, 3, 5) * 4);
  for (let i = 0; i < n; i++) {
    const r = hash(seed, i, 7, 1);
    const sz = s * (0.45 + r * 0.55);
    k.boxR(k.leaf, GREENS[Math.floor(hash(seed, i, 2, 2) * GREENS.length)], sz, sz * 0.85, sz, x + (hash(seed, i, 3, 3) - 0.5) * s, y + sz * 0.42 + hash(seed, i, 4, 4) * s * 0.4, z + (hash(seed, i, 5, 5) - 0.5) * s, 0, r * 1.6);
  }
  if (hash(seed, 9, 9, 9) > 0.6) for (let i = 0; i < 3; i++) k.box(k.paint, BLOOM[Math.floor(hash(seed, i, 6, 6) * BLOOM.length)], 0.09, 0.09, 0.09, x + (hash(seed, i, 8, 1) - 0.5) * s, y + s * 0.8, z + (hash(seed, i, 8, 2) - 0.5) * s);
}

/** A tree: trunk, two boughs, a cloud of leaf cubes. */
export function tree(k: MallKit, x: number, y: number, z: number, h: number, seed: number) {
  const tw = 0.12 + h * 0.025;
  k.box(k.paint, "#6a4a32", tw, h * 0.72, tw, x, y, z, hash(seed, 1, 1, 1));
  for (let b = 0; b < 2; b++) {
    const a = hash(seed, b, 2, 1) * Math.PI * 2;
    k.boxR(k.paint, "#6a4a32", tw * 0.6, h * 0.3, tw * 0.6, x + Math.sin(a) * h * 0.08, y + h * 0.55, z + Math.cos(a) * h * 0.08, Math.cos(a) * 0.6, 0, -Math.sin(a) * 0.6);
  }
  const n = 9 + Math.floor(h * 1.5);
  for (let i = 0; i < n; i++) {
    const a = hash(seed, i, 3, 3) * Math.PI * 2,
      r = Math.sqrt(hash(seed, i, 4, 4)) * h * 0.3;
    const sz = h * (0.12 + hash(seed, i, 5, 5) * 0.12);
    k.boxR(k.leaf, GREENS[Math.floor(hash(seed, i, 6, 6) * GREENS.length)], sz, sz * 0.8, sz, x + Math.sin(a) * r, y + h * (0.68 + hash(seed, i, 7, 7) * 0.3), z + Math.cos(a) * r, 0, a);
  }
}

/** A trailing vine hanging from (x, y, z) down `len` metres, pushed out along (nx, nz). */
export function vine(k: MallKit, x: number, y: number, z: number, len: number, seed: number, nx = 0, nz = 0) {
  const n = Math.max(2, Math.round(len / 0.22));
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const s = 0.2 - t * 0.06;
    k.boxR(k.leaf, GREENS[(seed + i) % GREENS.length], s, 0.22, s, x + (hash(seed, i, 1, 9) - 0.5) * 0.12 + nx * 0.06, y - i * 0.2, z + (hash(seed, i, 2, 9) - 0.5) * 0.12 + nz * 0.06, 0, hash(seed, i, 3, 9) * 2);
  }
}

/** A flat ring sector facing up, angle a from +z towards +x (CylinderGeometry's convention). */
function ringSector(r0: number, r1: number, a0: number, a1: number, seg = 64) {
  const pos: number[] = [],
    idx: number[] = [],
    uv: number[] = [];
  for (let i = 0; i <= seg; i++) {
    const a = a0 + ((a1 - a0) * i) / seg;
    for (const r of [r0, r1]) {
      pos.push(Math.sin(a) * r, 0, Math.cos(a) * r);
      uv.push(Math.sin(a) * r, Math.cos(a) * r);
    }
    if (i < seg) {
      const b = i * 2;
      idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const VERT = `varying vec2 vUv; varying vec3 vWP; varying vec3 vWN; varying vec3 vP;
void main(){ vUv = uv; vP = position; vec4 wp = modelMatrix * vec4(position, 1.0); vWP = wp.xyz; vWN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * wp; }`;

/** Falling water: thin streaks racing down a curtain, brighter at the rim, coloured at night. */
function waterfallMat(seed: number, alpha: number) {
  return new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 }, uNight: { value: 0 }, uHue: { value: new THREE.Color("#ffffff") }, uSeed: { value: seed }, uA: { value: alpha } },
    vertexShader: VERT,
    fragmentShader: `uniform float uT; uniform float uNight; uniform vec3 uHue; uniform float uSeed; uniform float uA;
varying vec2 vUv; varying vec3 vWP; varying vec3 vWN;
float h1(float n){ return fract(sin(n * 91.3458 + uSeed) * 47453.5453); }
void main(){
  float cx = vUv.x * 150.0; float id = floor(cx); float fx = fract(cx);
  float sp = 0.75 + h1(id) * 0.8;
  float y = vUv.y * 13.0 + uT * sp * 2.4 + h1(id + 7.0) * 9.0;
  float seg = fract(y);
  float streak = smoothstep(0.0, 0.06, seg) * (1.0 - smoothstep(0.2, 0.95, seg));
  float lane = 1.0 - smoothstep(0.1, 0.5, abs(fx - 0.5));
  float s = streak * lane;
  float sheet = 0.5 + 0.5 * sin(vUv.x * 40.0 + vUv.y * 30.0 + uT * 6.0 + uSeed);
  vec3 V = normalize(cameraPosition - vWP);
  float fr = pow(1.0 - abs(dot(normalize(vWN), V)), 1.4);
  float a = uA * (0.22 + 0.9 * s + 0.12 * sheet) + 0.4 * fr * uA;
  vec3 c = mix(vec3(0.56, 0.76, 0.86), vec3(1.05), s);
  c = mix(c, uHue * (0.5 + 1.4 * s), uNight * 0.85);
  float foot = smoothstep(0.06, 0.0, vUv.y);
  c += foot * 0.5;
  a = min(0.92, a + foot * 0.5);
  gl_FragColor = vec4(c * 0.95, a);
}`,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

/** The pool: rings running out from where the vortex lands, a teal depth, light-show colour at night. */
function poolMat() {
  return new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 }, uNight: { value: 0 }, uHue: { value: new THREE.Color("#ffffff") } },
    vertexShader: VERT,
    fragmentShader: `uniform float uT; uniform float uNight; uniform vec3 uHue;
varying vec3 vP;
void main(){
  float r = length(vP.xy);
  float w = 0.5 + 0.5 * sin(r * 6.0 - uT * 3.2);
  float w2 = 0.5 + 0.5 * sin(r * 13.0 - uT * 5.0 + sin(atan(vP.y, vP.x) * 7.0));
  vec3 deep = vec3(0.03, 0.18, 0.22), lite = vec3(0.35, 0.7, 0.72);
  vec3 c = mix(deep, lite, (w * 0.35 + w2 * 0.2) * smoothstep(5.4, 1.5, r));
  float foam = smoothstep(3.2, 2.0, r) * (0.6 + 0.4 * w2);
  c = mix(c, vec3(1.1), foam * 0.85);
  c = mix(c, c * 0.4 + uHue * (0.35 + 0.6 * w), uNight * 0.7);
  gl_FragColor = vec4(c, 1.0);
}`,
  });
}

/** Rising mist round the foot of the vortex. */
function mist(k: MallKit) {
  const N = 220;
  const pos = new Float32Array(N * 3);
  const vel = new Float32Array(N * 3);
  const life = new Float32Array(N);
  const reset = (i: number, first = false) => {
    const a = Math.random() * Math.PI * 2,
      r = 1.8 + Math.random() * 1.2;
    pos[i * 3] = Math.sin(a) * r;
    pos[i * 3 + 1] = -2.4 + Math.random() * (first ? 4 : 0.6);
    pos[i * 3 + 2] = CZ + Math.cos(a) * r;
    vel[i * 3] = Math.sin(a) * (0.2 + Math.random() * 0.35);
    vel[i * 3 + 1] = 0.25 + Math.random() * 0.6;
    vel[i * 3 + 2] = Math.cos(a) * (0.2 + Math.random() * 0.35);
    life[i] = 1.5 + Math.random() * 3;
  };
  for (let i = 0; i < N; i++) reset(i, true);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const x = c.getContext("2d")!;
  const grd = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, "rgba(255,255,255,0.55)");
  grd.addColorStop(1, "rgba(255,255,255,0)");
  x.fillStyle = grd;
  x.fillRect(0, 0, 64, 64);
  const mat = new THREE.PointsMaterial({ size: 0.9, map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, color: new THREE.Color(0.9, 0.95, 1), opacity: 0.55, sizeAttenuation: true });
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false;
  k.core.add(pts);
  k.always.push((dt) => {
    for (let i = 0; i < N; i++) {
      life[i] -= dt;
      if (life[i] <= 0) reset(i);
      pos[i * 3] += vel[i * 3] * dt;
      pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
      pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      vel[i * 3] *= 0.99;
      vel[i * 3 + 2] *= 0.99;
    }
    g.attributes.position.needsUpdate = true;
  });
  return mat;
}

/** Escalator lanes between level f and f + 1, rising along z in direction `dir` from zb. */
function escalator(k: MallKit, f: number, x: number, zb: number, dir: 1 | -1) {
  const L = 10.4,
    H = FH,
    ang = Math.atan2(H, L),
    len = Math.hypot(L, H);
  const y0 = LEVELS[f].y,
    zm = zb + (dir * L) / 2,
    rx = -dir * ang;
  k.at(null);
  for (const [lx, up] of [
    [x - 0.62, true],
    [x + 0.62, false],
  ] as const) {
    // the truss, clad in brushed steel, the step band on it
    k.boxR(k.paint, "#8a8276", 1.2, 0.9, len, lx, y0 + H / 2 - 0.5, zm, rx, 0);
    k.boxR(k.paint, "#2a2a30", 1.0, 0.05, len, lx, y0 + H / 2 - 0.04, zm, rx, 0);
    const n = 30;
    for (let i = 0; i < n; i++) {
      const s = ((i + 0.5) / n) * L;
      k.box(k.metal, "#8a8e96", 1.0, 0.16, L / n - 0.02, lx, y0 + (s * H) / L - 0.16, zb + dir * s);
      k.box(k.glow, "#ffd06a", 1.0, 0.012, 0.03, lx, y0 + (s * H) / L, zb + dir * (s + L / n / 2 - 0.02), 0, 0.9);
    }
    // landings
    k.box(k.metal, "#9a9ea6", 1.2, 0.08, 1.4, lx, y0, zb - dir * 0.7);
    k.box(k.metal, "#9a9ea6", 1.2, 0.08, 1.4, lx, y0 + H, zb + dir * (L + 0.7));
    // glass balustrades, black handrails, lit skirts
    for (const side of [-0.56, 0.56]) {
      k.boxR(k.glass, "#ffffff", 0.03, 0.95, len + 0.6, lx + side, y0 + H / 2 + 0.5, zm, rx, 0);
      k.boxR(k.paint, "#141418", 0.08, 0.1, len + 0.8, lx + side, y0 + H / 2 + 1.02, zm, rx, 0);
      k.boxR(k.glow, up ? "#8ae8ff" : "#ffb070", 0.03, 0.03, len, lx + side * 0.92, y0 + H / 2 + 0.05, zm, rx, 0, 0, 1.4);
    }
  }
  // the newel ends: rounded black handrail returns, lit arrows
  for (const [zz, yy] of [
    [zb - dir * 0.9, y0],
    [zb + dir * (L + 0.9), y0 + H],
  ])
    for (const side of [-1.18, -0.06, 0.06, 1.18]) k.box(k.paint, "#141418", 0.08, 1.0, 0.5, x + side, yy, zz);
  // click: ride it to the other end
  const hover = (to: number) => `<b>Escalator</b><span>${LEVELS[to].label} · ${LEVELS[to].name}</span>`;
  for (const [on, to] of [
    [f, f + 1],
    [f + 1, f],
  ]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.4, len), k.hidden);
    m.position.set(x, y0 + H / 2 + 0.6, zm);
    m.rotation.x = rx;
    k.groups[on].add(m);
    k.pick(on, m, hover(to), () => ({ eyebrow: "Escalator", title: `${LEVELS[to].label} · ${LEVELS[to].name}`, floor: to }));
  }
  return { top: zb + dir * L };
}

export interface Atrium {
  setNight(on: boolean): void;
}

export function atrium(k: MallKit): Atrium {
  const floorMat = tiledMat(marbleTex("#6c625a", "236,222,200"), 3, { roughness: 0.38, metalness: 0.05 });
  const deckMat = tiledMat(woodTex("#9a6a42"), 2.4, { roughness: 0.55 });
  k.at(null);

  // ---- level floors and slabs ------------------------------------------------------------------
  const ground: [number, number, number, number][] = [
    [X0, Z0, X1, -46],
    [X0, -41, X1, VZ0],
    [X0, VZ1, X1, Z1],
    [X0, VZ0, -VX, VZ1],
    [VX, VZ0, X1, VZ1],
  ];
  const slab: [number, number, number, number][] = [
    [X0, Z0, X1, VZ0],
    [X0, VZ1, X1, Z1],
    [X0, VZ0, -VX, VZ1],
    [VX, VZ0, X1, VZ1],
  ];
  LEVELS.forEach((L, f) => {
    for (const [x0, z0, x1, z1] of f ? slab : ground) {
      k.flat(floorMat, "#ffffff", x1 - x0, z1 - z0, (x0 + x1) / 2, L.y + 0.002, (z0 + z1) / 2, [x0, z0, x1, z1]);
      if (f) k.flat(k.paint, "#6a5444", x1 - x0, z1 - z0, (x0 + x1) / 2, L.y - 0.45, (z0 + z1) / 2, undefined, true);
    }
    if (!f) return;
    // downlights in the soffit
    for (let x = X0 + 2; x < X1; x += 4)
      for (let z = Z0 + 2; z < Z1; z += 4) {
        if (Math.abs(x) < VX + 0.6 && z > VZ0 - 0.6 && z < VZ1 + 0.6) continue;
        k.cyl(k.glow, "#ffd9a4", 0.11, 0.11, 0.02, x, L.y - 0.48, z, 10, 0.85);
      }
    // the slab edge round the void: a white ribbon with a light line under it
    for (const [w, d, x, z] of [
      [2 * VX + 0.24, 0.12, 0, VZ0],
      [2 * VX + 0.24, 0.12, 0, VZ1],
      [0.12, VZ1 - VZ0, -VX, CZ],
      [0.12, VZ1 - VZ0, VX, CZ],
    ] as const) {
      k.box(k.gloss, "#7a6048", w, 1.15, d, x, L.y - 0.62, z);
      k.box(k.glow, "#ffc878", w, 0.03, d + 0.04, x, L.y - 0.64, z, 0, 1.05);
    }
  });

  // ---- outer walls (behind the shops) and the glass roof --------------------------------------
  const wallC = "#5e544a";
  k.box(k.paint, wallC, X1 - X0, ROOF, 0.3, 0, 0, Z0 - 0.15);
  k.box(k.paint, wallC, 0.3, ROOF, Z1 - Z0, X0 - 0.15, 0, (Z0 + Z1) / 2);
  k.box(k.paint, wallC, 0.3, ROOF, Z1 - Z0, X1 + 0.15, 0, (Z0 + Z1) / 2);
  k.box(k.paint, wallC, X1 - X0, ROOF - 6, 0.3, 0, 6, Z1 + 0.15);
  // ...and solid, on every level: between the shop fronts the east and west walls had gaps out into the void
  for (const rs of k.rects) rs.push([X0 - 0.3, Z0 - 0.3, X0, Z1], [X1, Z0 - 0.3, X1 + 0.3, Z1], [X0 - 0.3, Z0 - 0.3, X1 + 0.3, Z0]);
  const R = 14.14;
  {
    const s = new THREE.Shape();
    s.moveTo(X0, -Z0);
    s.lineTo(X1, -Z0);
    s.lineTo(X1, -Z1);
    s.lineTo(X0, -Z1);
    s.closePath();
    const hole = new THREE.Path();
    hole.absarc(0, -CZ, R, 0, Math.PI * 2, false);
    s.holes.push(hole);
    const g = new THREE.ShapeGeometry(s, 48);
    g.rotateX(-Math.PI / 2);
    g.translate(0, ROOF, 0);
    k.geo(k.glass, "#ffffff", g);
    // the steel grid of the flat roof, kept outside the dome's ring
    for (let x = X0; x <= X1 + 0.01; x += 2.5) {
      const dz = Math.abs(x) < R ? Math.sqrt(R * R - x * x) : 0;
      const segs: [number, number][] = dz ? [[Z0, CZ - dz], [CZ + dz, Z1]] : [[Z0, Z1]];
      for (const [a, b] of segs) k.box(k.gloss, "#2e2e34", 0.14, 0.3, b - a, x, ROOF - 0.3, (a + b) / 2);
    }
    for (let z = Z0; z <= Z1 + 0.01; z += 2.8) {
      const dz = z - CZ;
      const dx = Math.abs(dz) < R ? Math.sqrt(R * R - dz * dz) : 0;
      const segs: [number, number][] = dx ? [[X0, -dx], [dx, X1]] : [[X0, X1]];
      for (const [a, b] of segs) k.box(k.gloss, "#2e2e34", b - a, 0.3, 0.14, (a + b) / 2, ROOF - 0.3, z);
    }
  }
  // the dome: a glass gridshell with the oculus at its crown
  const DR = 20,
    th0 = Math.asin(2.7 / DR),
    th1 = Math.asin(R / DR),
    dy = ROOF - DR * Math.cos(th1);
  const domeTop = dy + DR * Math.cos(th0);
  {
    const g = new THREE.SphereGeometry(DR, 48, 10, 0, Math.PI * 2, th0, th1 - th0);
    g.translate(0, dy, CZ);
    k.geo(k.glass, "#ffffff", g);
    const lat = new THREE.LineSegments(new THREE.WireframeGeometry(new THREE.SphereGeometry(DR, 36, 8, 0, Math.PI * 2, th0, th1 - th0)), new THREE.LineBasicMaterial({ color: "#6a6a72" }));
    lat.position.set(0, dy, CZ);
    k.core.add(lat);
    const ring = new THREE.TorusGeometry(R, 0.3, 6, 96);
    ring.rotateX(Math.PI / 2);
    ring.translate(0, ROOF, CZ);
    k.geo(k.gloss, "#f2f2ee", ring);
    const ocu = new THREE.TorusGeometry(2.75, 0.32, 8, 64);
    ocu.rotateX(Math.PI / 2);
    ocu.translate(0, domeTop, CZ);
    k.geo(k.gloss, "#f2f2ee", ocu);
    const bowl = new THREE.CylinderGeometry(3.4, 2.6, 1.2, 64, 1, true);
    bowl.translate(0, domeTop - 0.4, CZ);
    k.geo(k.tint, "#ffffff", bowl);
  }

  // ---- the sunken forest valley on the ground floor ---------------------------------------------
  const gap = 0.3; // the boardwalk's notch, towards +z
  {
    // the outer band: the void square minus a circle, a step down from the floor
    const s = new THREE.Shape();
    s.moveTo(-VX, -VZ1);
    s.lineTo(VX, -VZ1);
    s.lineTo(VX, -VZ0);
    s.lineTo(-VX, -VZ0);
    s.closePath();
    const hole = new THREE.Path();
    hole.absarc(0, -CZ, 8.6, 0, Math.PI * 2, false);
    s.holes.push(hole);
    const g = new THREE.ShapeGeometry(s, 64);
    g.rotateX(-Math.PI / 2);
    g.translate(0, -0.6, 0);
    k.geo(k.paint, "#3a3024", g);
    // the edge walls of the square, faced in stone
    for (const [w, d, x, z] of [
      [2 * VX, 0.2, 0, VZ0 + 0.1],
      [2 * VX, 0.2, 0, VZ1 - 0.1],
      [0.2, VZ1 - VZ0, -VX + 0.1, CZ],
      [0.2, VZ1 - VZ0, VX - 0.1, CZ],
    ] as const)
      k.box(k.paint, "#cfc6b6", w, 0.62, d, x, -0.62, z);
    const tiers: [number, number, number][] = [
      [7.2, 8.6, -1.2],
      [5.9, 7.2, -1.8],
    ];
    let top = -0.6;
    for (const [r0, r1, y] of tiers) {
      const rg = ringSector(r0, r1, 0, Math.PI * 2);
      rg.translate(0, y, CZ);
      k.geo(k.paint, "#3a3024", rg);
      const riser = new THREE.CylinderGeometry(r1, r1, top - y, 96, 1, true);
      riser.scale(-1, 1, 1); // faces the pool
      riser.translate(0, (top + y) / 2, CZ);
      k.geo(k.paint, "#bdb3a2", riser);
      top = y;
    }
    // the pool's stone rim and its wall
    const rim = ringSector(5.4, 5.9, 0, Math.PI * 2);
    rim.translate(0, -1.9, CZ);
    k.geo(k.gloss, "#d8d0c2", rim);
    const rr = new THREE.CylinderGeometry(5.9, 5.9, 0.1, 96, 1, true);
    rr.scale(-1, 1, 1);
    rr.translate(0, -1.85, CZ);
    k.geo(k.paint, "#bdb3a2", rr);
    const pw = new THREE.CylinderGeometry(5.4, 5.4, 0.6, 96, 1, true);
    pw.scale(-1, 1, 1);
    pw.translate(0, -2.2, CZ);
    k.geo(k.paint, "#5a6a6a", pw);
    // planting: shrubs on every tier, trees in the corners and on the middle tier
    let seed = 1;
    for (const [r0, r1, y, n] of [
      [8.6, 9.6, -0.6, 44],
      [7.2, 8.6, -1.2, 40],
      [5.9, 7.2, -1.8, 32],
    ] as const)
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + hash(i, n, 1, 1) * 0.1;
        if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < gap + 0.12) continue;
        const r = r0 + 0.3 + hash(i, n, 2, 2) * (r1 - r0 - 0.6);
        const x = Math.sin(a) * r,
          z = CZ + Math.cos(a) * r;
        if (Math.abs(x) > VX - 0.4 || Math.abs(z - CZ) > VX - 0.4) continue;
        bush(k, x, y, z, 0.7 + hash(i, n, 3, 3) * 0.5, seed++);
        if (r0 > 6 && hash(i, n, 4, 4) > 0.55) vine(k, Math.sin(a) * (r0 + 0.1), y, CZ + Math.cos(a) * (r0 + 0.1), 0.5, seed++, -Math.sin(a), -Math.cos(a));
      }
    for (const [cx, cz] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ])
      for (let i = 0; i < 4; i++) {
        const x = cx * (8.4 - hash(i, cx, 1, 2) * 1.6) + (i === 3 ? -cx * 2.2 : 0),
          z = CZ + cz * (8.4 - hash(i, cz, 2, 2) * 1.6) + (i === 2 ? -cz * 2.2 : 0);
        tree(k, x, -0.6, z, cz > 0 ? 2.4 + hash(i, cx, cz, 3) * 1.4 : 4.5 + hash(i, cx, cz, 3) * 4.5, seed++); // low on the entrance side: the view stays open
        bush(k, x + 0.6, -0.6, z + 0.4, 1, seed++);
      }
    for (let i = 0; i < 7; i++) {
      const a = gap + 0.5 + (i / 7) * (Math.PI * 2 - 2 * gap - 1);
      tree(k, Math.sin(a) * 8, -1.2, CZ + Math.cos(a) * 8, Math.cos(a) > 0 ? 2.6 + hash(i, 5, 5, 5) : 3.5 + hash(i, 5, 5, 5) * 3, seed++);
    }
    // the boardwalk out over the terraces to a round deck above the pool
    k.box(deckMat, "#ffffff", 2.4, 0.18, 4.0, 0, -0.18, VZ1 - 2.0);
    const deck = new THREE.CylinderGeometry(1.7, 1.7, 0.18, 40);
    deck.translate(0, -0.09, -19.1);
    k.geo(deckMat, "#ffffff", deck);
    k.cyl(k.gloss, "#d8d0c2", 0.25, 0.25, 2.4, 0, -2.5, -19.1);
    for (const sx of [-1.2, 1.2]) {
      k.box(k.glass, "#ffffff", 0.03, 1.05, 3.4, sx, 0, VZ1 - 1.7);
      k.box(k.gloss, "#8a5a36", 0.08, 0.06, 3.4, sx, 1.05, VZ1 - 1.7);
    }
    const dr = new THREE.CylinderGeometry(1.7, 1.7, 1.05, 40, 1, true, Math.PI - 2.4, 4.8);
    dr.translate(0, 0.52, -19.1);
    k.geo(k.glass, "#ffffff", dr);
    const dt = new THREE.TorusGeometry(1.7, 0.04, 4, 40, 4.8);
    dt.rotateX(Math.PI / 2);
    dt.rotateY(-Math.PI / 2 + 2.4 - 0.0);
    dt.translate(0, 1.07, -19.1);
    k.geo(k.gloss, "#8a5a36", dt);
  }

  // ---- balustrades round the void, planters spilling vines ---------------------------------------
  /** Escalator piers: [level, side x sign, z0, z1]. */
  const piers: [number, number, number, number][] = [];
  // west side rises to −z on even levels, east side the other way: the lanes cross in the void
  for (let f = 0; f < LEVELS.length - 1; f++)
    for (const sx of [-1, 1]) {
      const even = (f + (sx > 0 ? 1 : 0)) % 2 === 0;
      const zb = even ? -16.2 : -31.8,
        dir = even ? -1 : 1;
      const { top } = escalator(k, f, sx * 8.4, zb, dir as 1 | -1);
      piers.push([f, sx, Math.min(zb, zb - dir * 1.6), Math.max(zb, zb - dir * 1.6)]);
      piers.push([f + 1, sx, Math.min(top, top + dir * 1.6), Math.max(top, top + dir * 1.6)]);
    }
  k.at(null);
  LEVELS.forEach((L, f) => {
    const y = L.y;
    const rx = f ? RAIL : VX,
      zn = f ? VZ0 - 0.7 : VZ0,
      zs = f ? VZ1 + 0.7 : VZ1;
    const myPiers = piers.filter((p) => p[0] === f);
    // glass panels along a side, leaving gaps; posts and a wooden handrail
    const run = (ax: number, az: number, bx: number, bz: number, gaps: [number, number][]) => {
      const alongX = az === bz;
      const a = alongX ? ax : az,
        b = alongX ? bx : bz;
      let cuts: [number, number][] = [[a, b]];
      for (const [g0, g1] of gaps) cuts = cuts.flatMap(([s, e]) => (g1 <= s || g0 >= e ? [[s, e]] : ([[s, g0], [g1, e]] as [number, number][]).filter(([p, q]) => q - p > 0.05)));
      for (const [s, e] of cuts) {
        const m = (s + e) / 2,
          len = e - s;
        if (alongX) {
          k.box(k.glass, "#ffffff", len, 1.05, 0.03, m, y, az);
          k.box(k.gloss, "#8a5a36", len, 0.07, 0.1, m, y + 1.05, az);
          k.box(k.metal, "#c8ccd2", len, 0.06, 0.06, m, y, az);
        } else {
          k.box(k.glass, "#ffffff", 0.03, 1.05, len, ax, y, m);
          k.box(k.gloss, "#8a5a36", 0.1, 0.07, len, ax, y + 1.05, m);
          k.box(k.metal, "#c8ccd2", 0.06, 0.06, len, ax, y, m);
        }
        for (let p = s; p <= e + 0.01; p += Math.max(0.5, len / Math.max(1, Math.round(len / 1.6)))) k.box(k.metal, "#c8ccd2", 0.05, 1.05, 0.05, alongX ? p : ax, y, alongX ? az : p);
      }
    };
    const sideGaps = (sx: number) => myPiers.filter((p) => p[1] === sx).map((p) => [p[2], p[3]] as [number, number]);
    run(-rx, zn, rx, zn, []);
    run(-rx, zs, rx, zs, f ? [] : [[-1.2, 1.2]]);
    run(-rx, zn, -rx, zs, sideGaps(-1));
    run(rx, zn, rx, zs, sideGaps(1));
    // walkers stop at the glass (the boardwalk gap on the ground floor stays open)
    k.rects[f].push([-rx - 0.12, zn - 0.12, -rx + 0.12, zs + 0.12], [rx - 0.12, zn - 0.12, rx + 0.12, zs + 0.12], [-rx, zn - 0.12, rx, zn + 0.12]);
    if (f) k.rects[f].push([-rx, zs - 0.12, rx, zs + 0.12]);
    else
      k.rects[f].push([-rx, zs - 0.12, -1.25, zs + 0.12], [1.25, zs - 0.12, rx, zs + 0.12], [-VX, VZ0, VX, -20.9], [-VX, -20.9, -1.75, -17.6], [1.75, -20.9, VX, -17.6], [-VX, -17.6, -1.3, VZ1], [1.3, -17.6, VX, VZ1]);
    // escalator piers: a slab tongue out to the lanes
    for (const [, sx, z0, z1] of myPiers) {
      k.box(floorMat, "#ffffff", 3.2, 0.45, z1 - z0, sx * (VX - 1.6 + (f ? 0 : 0)), y - 0.45, (z0 + z1) / 2);
      if (!f) k.box(k.paint, "#cfc6b6", 3.2, 0.62, z1 - z0, sx * (VX - 1.6), -1.07, (z0 + z1) / 2);
    }
    if (!f) return;
    // planter troughs between the slab edge and the glass, vines down the ribbon
    let seed = f * 1000;
    const trough = (x0: number, z0: number, x1: number, z1: number, nx: number, nz: number) => {
      k.box(k.gloss, "#3a3129", x1 - x0, 0.5, z1 - z0, (x0 + x1) / 2, y, (z0 + z1) / 2);
      k.box(k.paint, "#3a3024", x1 - x0 - 0.1, 0.02, z1 - z0 - 0.1, (x0 + x1) / 2, y + 0.5, (z0 + z1) / 2);
      const along = Math.abs(x1 - x0) > Math.abs(z1 - z0);
      const len = along ? x1 - x0 : z1 - z0;
      for (let s = 0.3; s < len; s += 0.55) {
        const px = along ? x0 + s : (x0 + x1) / 2,
          pz = along ? (z0 + z1) / 2 : z0 + s;
        if (myPiers.some((p) => Math.sign(px) === p[1] && !along && pz > p[2] - 0.2 && pz < p[3] + 0.2)) continue;
        bush(k, px, y + 0.45, pz, 0.32 + hash(s * 10, f, 1, 1) * 0.16, seed++);
        if (hash(s * 10, f, 2, 7) > 0.35) vine(k, px + nx * 0.36, y + 0.5, pz + nz * 0.36, 0.8 + hash(s * 10, f, 3, 7) * 2.4, seed++, nx, nz);
      }
    };
    trough(-RAIL + 0.05, VZ0 - 0.7, RAIL - 0.05, VZ0, 0, 1);
    trough(-RAIL + 0.05, VZ1, RAIL - 0.05, VZ1 + 0.7, 0, -1);
    const westCuts = sideGaps(-1),
      eastCuts = sideGaps(1);
    for (const [sx, cuts] of [
      [-1, westCuts],
      [1, eastCuts],
    ] as const) {
      let segs: [number, number][] = [[VZ0, VZ1]];
      for (const [g0, g1] of cuts) segs = segs.flatMap(([s, e]) => (g1 <= s || g0 >= e ? [[s, e]] : ([[s, g0], [g1, e]] as [number, number][]).filter(([p, q]) => q - p > 0.3)));
      for (const [s, e] of segs) trough(sx < 0 ? -RAIL + 0.05 : VX, s, sx < 0 ? -VX : RAIL - 0.05, e, sx < 0 ? 1 : -1, 0);
    }
  });

  // ---- the RAIN VORTEX ---------------------------------------------------------------------------
  const top = domeTop - 0.3,
    bottom = -2.5;
  const outer = waterfallMat(1.3, 0.55),
    inner = waterfallMat(7.9, 0.35);
  const fallH = top - bottom;
  for (const [mat, rt, rb] of [
    [outer, 2.6, 2.05],
    [inner, 2.35, 1.75],
  ] as const) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, fallH, 96, 1, true), mat);
    m.position.set(0, bottom + fallH / 2, CZ);
    m.renderOrder = 3;
    k.core.add(m);
  }
  const pool = poolMat();
  const water = new THREE.Mesh(new THREE.CircleGeometry(5.4, 72), pool);
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, -2.45, CZ);
  k.core.add(water);
  // the foam ring where it lands
  const foam = new THREE.Mesh(new THREE.RingGeometry(1.6, 3.1, 64), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.4, 1.5, 1.6), transparent: true, opacity: 0.55, depthWrite: false }));
  foam.rotation.x = -Math.PI / 2;
  foam.position.set(0, -2.4, CZ);
  k.core.add(foam);
  const mistMat = mist(k);
  // the light show: a ring of uplights in the rim and a slow colour cycle at night
  const rimMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.5, 1.2), toneMapped: false });
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * Math.PI * 2;
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 0.16), rimMat);
    m.position.set(Math.sin(a) * 5.65, -1.84, CZ + Math.cos(a) * 5.65);
    k.core.add(m);
  }
  const sun = new THREE.DirectionalLight("#fff4e0", 1.4);
  sun.position.set(12, 60, -10);
  sun.target.position.set(0, 0, CZ);
  k.core.add(sun, sun.target);
  const hue = new THREE.Color();
  let night = k.night;
  const palette = ["#f4b728", "#3ef0ff", "#ff4fb8", "#7a5cff", "#3ee08f"];
  k.always.push((dt, t) => {
    for (const m of [outer, inner, pool]) m.uniforms.uT.value = t;
    foam.rotation.z += dt * 0.4;
    if (night) {
      // the show: a colour wash, each palette colour in turn, blending
      const p = (t / 6) % palette.length;
      const i = Math.floor(p);
      hue.set(palette[i]).lerp(new THREE.Color(palette[(i + 1) % palette.length]), THREE.MathUtils.smoothstep(p - i, 0.7, 1));
      for (const m of [outer, inner, pool]) (m.uniforms.uHue.value as THREE.Color).copy(hue);
      rimMat.color.copy(hue).multiplyScalar(2.2);
      mistMat.color.copy(hue).lerp(new THREE.Color(1, 1, 1), 0.5);
    }
  });
  const pickVortex = () => {
    const s = k.market.supply;
    return {
      eyebrow: "Rain vortex",
      title: "ZEC RAIN VORTEX",
      stats: s
        ? ([
            ["Block subsidy", `${(s.block_subsidy / 1e8).toFixed(4)} ZEC`],
            ["Issued", `${Math.round(s.supply / 1e8).toLocaleString("en-US")} ZEC`],
            ["Inflation", `${(s.inflation_rate * 100).toFixed(2)} %`],
            ["Next halving", `#${s.next_halving_height.toLocaleString("en-US")}`],
          ] as [string, string][])
        : undefined,
      tag: k.height ? ([`Block ${k.height.toLocaleString("en-US")}`, "info"] as [string, "info"]) : undefined,
    };
  };
  const vhit = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, fallH, 16), k.hidden);
  vhit.position.set(0, bottom + fallH / 2, CZ);
  k.core.add(vhit);
  k.pick(-1, vhit, "<b>ZEC RAIN VORTEX</b><span>block subsidy · supply</span>", pickVortex);

  const setNight = (on: boolean) => {
    night = on;
    for (const m of [outer, inner, pool]) m.uniforms.uNight.value = on ? 1 : 0;
    if (!on) {
      rimMat.color.setRGB(1.6, 1.5, 1.2);
      mistMat.color.setRGB(0.9, 0.95, 1);
    }
    sun.color.set(on ? "#4a5a8a" : "#fff4e0");
    sun.intensity = on ? 0.4 : 1.0;
  };
  setNight(night);
  return { setNight };
}
