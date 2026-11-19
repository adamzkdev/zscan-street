/**
 * INSCRIBE!'s set dressing, the life round each board (all of it instanced, cosmetic, Math.random):
 * flocks that flap and circle, strings of pennants, floating islands, sky lanterns, bats and crows,
 * giant dead keys stuck in the cemetery, mist, glowing mushrooms, candles; on the pier gulls, foam
 * caps, a palm sandbar, a moored ferry, lifebuoys and jumping fish. It fills what the play camera sees
 * round the board: its two flanks (|x| 11..22 m) and the band behind it.
 */
import * as THREE from "three";
import { GEO, canvasTex, glow, toon, type Fx3 } from "../../k3";

const UP = new THREE.Vector3(0, 1, 0);
const IDENT = new THREE.Quaternion();
const rand = (a: number, b: number) => a + Math.random() * (b - a);

export interface DressKit {
  scene: THREE.Scene;
  /** The board's group (it turns on the pier): what rides on the rim goes in it. */
  deck: THREE.Group;
  fx: Fx3;
  half: number;
  rimOut: number;
}
export type Tick = (dt: number, now: number) => void;

/**
 * A flock in one draw: each bird a body and two wings that flap, circling (cx, cz) at its own radius,
 * height and pace, some one way, some the other.
 */
export function flock(s: THREE.Scene, n: number, o: { color: string; emissive?: string; wing?: string; cx: number; cz: number; r: [number, number]; y: [number, number]; size: number; speed: number; flap: number; glide?: number }): Tick {
  const mesh = new THREE.InstancedMesh(GEO.box, toon("#ffffff", o.emissive ?? "#000000"), n * 3);
  mesh.frustumCulled = false;
  const c1 = new THREE.Color(o.color),
    c2 = new THREE.Color(o.wing ?? o.color);
  const birds = Array.from({ length: n }, (_, i) => {
    mesh.setColorAt(i * 3, c1);
    mesh.setColorAt(i * 3 + 1, c2);
    mesh.setColorAt(i * 3 + 2, c2);
    return { r: rand(o.r[0], o.r[1]), y: rand(o.y[0], o.y[1]), a: rand(0, Math.PI * 2), w: (o.speed * rand(0.7, 1.3)) / rand(o.r[0], o.r[1]), dir: i % 3 === 2 ? -1 : 1, ph: rand(0, 6) };
  });
  const m = new THREE.Matrix4(),
    p = new THREE.Vector3(),
    off = new THREE.Vector3(),
    sc = new THREE.Vector3(),
    qy = new THREE.Quaternion(),
    qw = new THREE.Quaternion(),
    q = new THREE.Quaternion(),
    Z = new THREE.Vector3(0, 0, 1);
  s.add(mesh);
  const L = o.size * 0.95;
  return (dt, now) => {
    for (let i = 0; i < n; i++) {
      const b = birds[i];
      b.a += b.w * b.dir * dt;
      const x = o.cx + Math.cos(b.a) * b.r,
        z = o.cz + Math.sin(b.a) * b.r;
      p.set(x, b.y + Math.sin(now * 0.8 + b.ph) * 0.7, z);
      // (heading along the circle; a glider holds its wings out now and then)
      const vx = -Math.sin(b.a) * b.dir,
        vz = Math.cos(b.a) * b.dir;
      qy.setFromAxisAngle(UP, Math.atan2(vx, vz));
      const gl = o.glide ? Math.max(0, Math.sin(now * 0.6 + b.ph)) : 0;
      const f = Math.sin(now * o.flap + b.ph * 3) * 0.65 * (1 - gl) + 0.1;
      mesh.setMatrixAt(i * 3, m.compose(p, qy, sc.set(o.size * 0.32, o.size * 0.28, o.size * 0.9)));
      for (let sd = 0; sd < 2; sd++) {
        const side = sd ? 1 : -1;
        qw.setFromAxisAngle(Z, side * f);
        q.copy(qy).multiply(qw);
        off.set(side * (L / 2) * Math.cos(f), (L / 2) * Math.sin(f), -o.size * 0.05).applyQuaternion(qy);
        mesh.setMatrixAt(i * 3 + (side < 0 ? 1 : 2), m.compose(off.add(p), q, sc.set(L, o.size * 0.06, o.size * 0.42)));
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
  };
}

/** Strings of pennants (one draw, ropes and flags): each a sagging line from a to b; they flutter. */
export function bunting(parent: THREE.Object3D, lines: [THREE.Vector3, THREE.Vector3][], colors: string[], per = 12, sag = 0.7): Tick {
  const n = lines.length * (per + 1);
  const geo = new THREE.ConeGeometry(0.5, 1, 3);
  geo.rotateX(Math.PI);
  geo.translate(0, -0.5, 0);
  const mesh = new THREE.InstancedMesh(geo, toon("#ffffff", "#141018"), n);
  mesh.frustumCulled = false;
  const col = new THREE.Color();
  const flags: { p: THREE.Vector3; yaw: number; ph: number }[] = [];
  const m = new THREE.Matrix4(),
    sc = new THREE.Vector3(),
    q = new THREE.Quaternion(),
    e = new THREE.Euler();
  let k = 0;
  lines.forEach(([a, b], li) => {
    const yaw = Math.atan2(b.x - a.x, b.z - a.z);
    for (let j = 0; j < per; j++) {
      const u = (j + 0.5) / per;
      const p = new THREE.Vector3().lerpVectors(a, b, u);
      p.y -= Math.sin(Math.PI * u) * sag;
      flags.push({ p, yaw, ph: j * 0.7 + li });
      mesh.setColorAt(k++, col.set(colors[(j + li) % colors.length]));
    }
    // the rope: a thin rod from a to b (the sag drawn as its middle drop)
    const mid = new THREE.Vector3().lerpVectors(a, b, 0.5);
    mid.y -= sag * 0.62;
    const len = a.distanceTo(b);
    e.set(0, yaw, 0);
    q.setFromEuler(e).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2));
    // (the rod's shape runs back from its base: its base half a length on from the middle)
    mid.addScaledVector(new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)), len / 2);
    mesh.setMatrixAt(k, m.compose(mid.setY(mid.y + 0.02), q, sc.set(0.06, len, 0.06)));
    mesh.setColorAt(k++, col.set("#3a3050"));
  });
  parent.add(mesh);
  return (_dt, now) => {
    for (let i = 0; i < flags.length; i++) {
      const f = flags[i];
      e.set(Math.sin(now * 5 + f.ph) * 0.35, f.yaw + Math.PI / 2, 0);
      mesh.setMatrixAt(lineIndex(i), m.compose(f.p, q.setFromEuler(e), sc.set(0.72, 0.9, 0.06)));
    }
    mesh.instanceMatrix.needsUpdate = true;
  };
  // (the pennants sit before each line's rope)
  function lineIndex(i: number) {
    return i + Math.floor(i / per);
  }
}

/** A soft round glow (a sprite's or a mist patch's texture). */
function puffTex(inner: string, outer: string) {
  return canvasTex(64, 64, (g) => {
    const gr = g.createRadialGradient(32, 32, 2, 32, 32, 32);
    gr.addColorStop(0, inner);
    gr.addColorStop(1, outer);
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
  });
}

/** A sun (or a moon) in the sky: a disc and its halo, one sprite each (seen from the fly-over). */
export function sun(s: THREE.Scene, at: THREE.Vector3, r: number, core: string, halo: string) {
  const d = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex(core, "rgba(255,255,255,0)"), transparent: true, depthWrite: false, fog: false }));
  d.scale.setScalar(r * 2);
  d.position.copy(at);
  const h = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex(halo, "rgba(255,255,255,0)"), transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
  h.scale.setScalar(r * 7);
  h.position.copy(at);
  s.add(h, d);
}

// ---- the slab -------------------------------------------------------------------------------------

/**
 * SKY SLAB: little grass islands adrift round the board (trees, lamps), pennants strung along its
 * sides between the home pillars, a flock wheeling over the flanks, sky lanterns rising from the city
 * and gold motes in the air.
 */
export function dressSlab(k: DressKit): Tick {
  const s = k.scene;
  const isles: [number, number, number, number][] = [
    [-17.5, -4.2, 5.5, 1.7],
    [-21.5, -6.5, -8.5, 2.2],
    [-14.5, -9, -2, 1.2],
    [18.2, -4.8, 4.2, 1.9],
    [21.5, -3.4, -10.5, 1.6],
    [15, -8.5, -4.5, 1.1],
  ];
  const n = isles.length;
  const rockGeo = new THREE.ConeGeometry(1, 1, 7);
  rockGeo.rotateX(Math.PI);
  const rocks = new THREE.InstancedMesh(rockGeo, toon("#ffffff", "#140c1c"), n * 2);
  const grass = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 0.92, 1, 7), toon("#ffffff", "#0c1808"), n);
  const trees = new THREE.InstancedMesh(GEO.box, toon("#ffffff", "#120a10"), n * 3);
  const lamps = new THREE.InstancedMesh(GEO.box, glow("#ffd59a"), n);
  const col = new THREE.Color();
  isles.forEach((_, i) => {
    rocks.setColorAt(i * 2, col.set(i % 2 ? "#6e5a86" : "#7a6690"));
    rocks.setColorAt(i * 2 + 1, col.set("#5a4870"));
    grass.setColorAt(i, col.set(i % 3 === 1 ? "#6fb85a" : "#5eab4e"));
    trees.setColorAt(i * 3, col.set("#6a4a3a"));
    trees.setColorAt(i * 3 + 1, col.set(i % 2 ? "#ff9fc0" : "#5fbf6a"));
    trees.setColorAt(i * 3 + 2, col.set(i % 2 ? "#ffc2d6" : "#7fd884"));
  });
  s.add(rocks, grass, trees, lamps);
  // the sky lanterns rising from the streets far below
  const NL = 26;
  const lant = new THREE.InstancedMesh(GEO.box, glow("#ffffff"), NL);
  lant.frustumCulled = false;
  const lanterns = Array.from({ length: NL }, (_, i) => {
    lant.setColorAt(i, col.set(i % 4 === 0 ? "#ffb0d0" : i % 3 === 0 ? "#ffe2a0" : "#ffc46a"));
    const side = i % 2 ? 1 : -1;
    return { x: side * rand(12, 34), z: rand(-30, 12), y: rand(-62, -8), v: rand(1.2, 2.4), ph: rand(0, 6) };
  });
  s.add(lant);
  // the pennants along the board's two sides, pillar to pillar (the seats' colours)
  const L = k.half + 0.275;
  const tickB = bunting(
    k.deck,
    [
      [new THREE.Vector3(-L, 3.35, -L), new THREE.Vector3(-L, 3.35, L)],
      [new THREE.Vector3(L, 3.35, -L), new THREE.Vector3(L, 3.35, L)],
    ],
    ["#ff6b35", "#3ec6ff", "#8ee35b", "#ff5fa2", "#ffffff", "#c4b1fc"],
    14,
    0.8,
  );
  const tickF = flock(s, 9, { color: "#ffffff", wing: "#f1e6ff", cx: 0, cz: -4, r: [15, 23], y: [4, 8], size: 0.55, speed: 5, flap: 9, glide: 1 });
  // the low sun of the dusk, where the back light comes from
  sun(s, new THREE.Vector3(150, 46, -150), 14, "rgba(255,236,200,1)", "rgba(255,150,110,0.35)");
  const m = new THREE.Matrix4(),
    v = new THREE.Vector3(),
    sc = new THREE.Vector3(),
    q = new THREE.Quaternion();
  let mote = 0;
  return (dt, now) => {
    for (let i = 0; i < n; i++) {
      const [x, y, z, r] = isles[i];
      const bob = Math.sin(now * 0.9 + i * 1.7) * 0.35;
      q.setFromAxisAngle(UP, now * 0.05 + i);
      rocks.setMatrixAt(i * 2, m.compose(v.set(x, y + bob - r * 0.55, z), q, sc.set(r, r * 1.2, r)));
      rocks.setMatrixAt(i * 2 + 1, m.compose(v.set(x + r * 0.3, y + bob - r * 1.25, z - r * 0.2), q, sc.set(r * 0.5, r * 0.8, r * 0.5)));
      grass.setMatrixAt(i, m.compose(v.set(x, y + bob + 0.12, z), q, sc.set(r * 1.04, 0.3, r * 1.04)));
      const tx = x + r * 0.3,
        tz = z - r * 0.15;
      const th = 0.9 + r * 0.35;
      trees.setMatrixAt(i * 3, m.compose(v.set(tx, y + bob + 0.25 + th / 2, tz), IDENT, sc.set(0.26, th, 0.26)));
      trees.setMatrixAt(i * 3 + 1, m.compose(v.set(tx, y + bob + 0.35 + th, tz), q, sc.set(r * 0.62, r * 0.5, r * 0.62)));
      trees.setMatrixAt(i * 3 + 2, m.compose(v.set(tx + 0.1, y + bob + 0.4 + th + r * 0.38, tz), q, sc.set(r * 0.4, r * 0.32, r * 0.4)));
      lamps.setMatrixAt(i, m.compose(v.set(x - r * 0.45, y + bob + 0.5, z + r * 0.3), IDENT, sc.setScalar(0.3 + Math.sin(now * 4 + i) * 0.03)));
    }
    rocks.instanceMatrix.needsUpdate = grass.instanceMatrix.needsUpdate = trees.instanceMatrix.needsUpdate = lamps.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < NL; i++) {
      const l = lanterns[i];
      l.y += l.v * dt;
      if (l.y > -6) ((l.y = -62), (l.x = (i % 2 ? 1 : -1) * rand(12, 34)), (l.z = rand(-30, 12)));
      const sw = Math.sin(now * 0.7 + l.ph) * 0.8;
      lant.setMatrixAt(i, m.compose(v.set(l.x + sw, l.y, l.z), IDENT, sc.set(0.7, 0.9 + Math.sin(now * 6 + l.ph) * 0.06, 0.7)));
    }
    lant.instanceMatrix.needsUpdate = true;
    tickB(dt, now);
    tickF(dt, now);
    // gold motes drifting up off the board's sides
    if ((mote -= dt) <= 0) {
      mote = 0.12;
      const side = Math.random() < 0.5 ? -1 : 1;
      v.set(side * rand(10.6, 16), rand(-1, 2), rand(-10, 9));
      k.fx.burst(v, 1, ["#ffe6a0", "#ffffff", "#ffc4dd"], { speed: 0.3, up: 0.8, gravity: -0.4, size: 0.12, life: 2.4, drag: 1.2 });
    }
  };
}

// ---- the graveyard --------------------------------------------------------------------------------

/**
 * ZK CEMETERY: giant rusted keys of the dead transparent addresses stuck in the grass, glowing mushrooms, mist
 * along the island's sides, candles on the walls, crows on the fence, bats round the yard, roots
 * hanging off the island's edges.
 */
export function dressCrypt(k: DressKit, walls: number[], cellX: (c: number) => number, cellZ: (c: number) => number): Tick {
  const s = k.scene;
  const R = k.rimOut;
  const m = new THREE.Matrix4(),
    v = new THREE.Vector3(),
    sc = new THREE.Vector3(),
    q = new THREE.Quaternion(),
    e = new THREE.Euler(),
    col = new THREE.Color();
  // the keys: a ring, a shaft, two bits, each stuck in at a slant (two draws)
  const keys: [number, number, number, number][] = [
    [-(R + 3.1), -4.6, 0.35, 0.4],
    [-(R + 3.0), 5.6, -0.3, 2.2],
    [R + 3.1, -2.8, -0.35, 2.9],
    [R + 3.0, 6.4, 0.3, 0.9],
  ];
  const keyM = new THREE.InstancedMesh(GEO.box, toon("#c48a52", "#2a1406"), keys.length * 3);
  const rings = new THREE.InstancedMesh(new THREE.TorusGeometry(0.62, 0.2, 8, 18), toon("#c48a52", "#2a1406"), keys.length);
  const runes = new THREE.InstancedMesh(GEO.box, glow("#c4b1fc"), keys.length);
  keys.forEach(([x, z, tilt, yaw], i) => {
    e.set(0, yaw, tilt);
    q.setFromEuler(e);
    const at = (lx: number, ly: number) => new THREE.Vector3(lx, ly, 0).applyQuaternion(q).add(new THREE.Vector3(x, -0.3, z));
    keyM.setMatrixAt(i * 3, m.compose(at(0, 1.2), q, sc.set(0.26, 2.4, 0.22)));
    keyM.setMatrixAt(i * 3 + 1, m.compose(at(0.3, 0.35), q, sc.set(0.42, 0.24, 0.2)));
    keyM.setMatrixAt(i * 3 + 2, m.compose(at(0.26, 0.8), q, sc.set(0.32, 0.22, 0.2)));
    rings.setMatrixAt(i, m.compose(at(0, 3.05), q, sc.set(1, 1, 1)));
    runes.setMatrixAt(i, m.compose(at(0, 3.05), q, sc.set(0.34, 0.34, 0.12)));
  });
  s.add(keyM, rings, runes);
  // glowing mushrooms in the grass (stems, caps)
  const NM = 18;
  const stems = new THREE.InstancedMesh(GEO.box, toon("#efe6d8", "#1a1410"), NM);
  const caps = new THREE.InstancedMesh(new THREE.SphereGeometry(0.5, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), glow("#ffffff"), NM);
  const capC = ["#7dffd6", "#c4b1fc", "#9dff9a", "#7fd3ee"];
  for (let i = 0; i < NM; i++) {
    const side = i % 2 ? 1 : -1;
    const x = side * rand(R + 0.5, R + 3.9),
      z = rand(-k.half + 0.5, k.half - 0.5);
    const h = rand(0.2, 0.45),
      r = rand(0.22, 0.4);
    stems.setMatrixAt(i, m.compose(v.set(x, -0.05 + h / 2, z), IDENT, sc.set(0.1, h, 0.1)));
    caps.setMatrixAt(i, m.compose(v.set(x, -0.05 + h, z), IDENT, sc.set(r, r * 0.8, r)));
    caps.setColorAt(i, col.set(capC[i % capC.length]));
  }
  s.add(stems, caps);
  // mist along the sides and behind (soft additive patches that drift and breathe)
  const NMi = 12;
  const mist = new THREE.InstancedMesh(GEO.plane, new THREE.MeshBasicMaterial({ map: puffTex("rgba(150,140,235,0.5)", "rgba(120,110,220,0)"), transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }), NMi);
  mist.frustumCulled = false;
  mist.renderOrder = 5;
  const mists = Array.from({ length: NMi }, (_, i) => {
    const behind = i >= 10;
    return { x: behind ? (i === 10 ? -5 : 5) : (i % 2 ? 1 : -1) * rand(R + 0.8, R + 3.8), z: behind ? -(R + 2.4) : rand(-k.half, k.half), r: rand(3, 5), v: rand(0.15, 0.4) * (i % 3 ? 1 : -1), ph: rand(0, 6), behind };
  });
  s.add(mist);
  // candles on some walls' tops
  const cw = walls.filter((_, i) => i % 5 === 2);
  const wax = new THREE.InstancedMesh(GEO.box, toon("#f4ecd8", "#2a2010"), cw.length);
  const flame = new THREE.InstancedMesh(GEO.box, glow("#ffcf6a"), cw.length);
  cw.forEach((c, i) => wax.setMatrixAt(i, m.compose(v.set(cellX(c) + 0.25, 1.15 + 0.15, cellZ(c) - 0.2), IDENT, sc.set(0.14, 0.3, 0.14))));
  k.deck.add(wax, flame);
  // crows on the fence (a body, a head, a beak)
  const crowsAt: [number, number, number][] = [
    [-6.5, 1.32, -(R + 0.15)],
    [4.2, 1.32, -(R + 0.15)],
    [-(R + 0.15), 1.32, -3.5],
    [R + 0.15, 1.32, 2.5],
  ];
  const crows = new THREE.InstancedMesh(GEO.box, toon("#1c1828", "#06040a"), crowsAt.length * 3);
  for (let i = 0; i < crowsAt.length; i++) {
    crows.setColorAt(i * 3, col.set("#1c1828"));
    crows.setColorAt(i * 3 + 1, col.set("#242036"));
    crows.setColorAt(i * 3 + 2, col.set("#ffb347"));
  }
  const hop = crowsAt.map(() => ({ t: rand(1, 5), y: 0, vy: 0, look: rand(0, 6) }));
  s.add(crows);
  // roots hanging off the island's sides
  const NR = 24;
  const roots = new THREE.InstancedMesh(GEO.box, toon("#4a3830", "#100806"), NR);
  const rootP = Array.from({ length: NR }, (_, i) => ({ x: (i % 2 ? 1 : -1) * (R + 4.1), z: rand(-k.half - 1, k.half + 1), h: rand(1.2, 3.4), ph: rand(0, 6) }));
  s.add(roots);
  const X = new THREE.Vector3(1, 0, 0);
  const tickBats = flock(s, 7, { color: "#2a2238", wing: "#3a3050", emissive: "#0a0612", cx: 0, cz: -3, r: [13, 19], y: [5, 9], size: 0.7, speed: 6, flap: 16 });
  return (dt, now) => {
    for (let i = 0; i < NMi; i++) {
      const p = mists[i];
      const z = p.behind ? p.z : ((((p.z + now * p.v + k.half) % (2 * k.half)) + 2 * k.half) % (2 * k.half)) - k.half;
      const r = p.r * (1 + Math.sin(now * 0.5 + p.ph) * 0.15);
      q.setFromAxisAngle(X, -Math.PI / 2);
      mist.setMatrixAt(i, m.compose(v.set(p.x, 0.45 + Math.sin(now * 0.7 + p.ph) * 0.1, z), q, sc.set(r * (p.behind ? 2.2 : 1), r, 1)));
    }
    mist.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < cw.length; i++) {
      const f = 0.17 + Math.sin(now * 14 + i * 2.3) * 0.03 + Math.sin(now * 9 + i) * 0.025;
      flame.setMatrixAt(i, m.compose(v.set(cellX(cw[i]) + 0.25, 1.15 + 0.38, cellZ(cw[i]) - 0.2), IDENT, sc.set(f, f * 1.6, f)));
    }
    flame.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < crowsAt.length; i++) {
      const [x, y, z] = crowsAt[i];
      const h = hop[i];
      if ((h.t -= dt) <= 0) ((h.t = rand(2, 6)), (h.vy = 3.2), (h.look = rand(0, 6)));
      h.vy -= 14 * dt;
      h.y = Math.max(0, h.y + h.vy * dt);
      if (h.y === 0) h.vy = 0;
      const yaw = h.look + Math.sin(now * 1.3 + i) * 0.5;
      q.setFromAxisAngle(UP, yaw);
      const fx = Math.sin(yaw),
        fz = Math.cos(yaw);
      crows.setMatrixAt(i * 3, m.compose(v.set(x, y + h.y + 0.18, z), q, sc.set(0.3, 0.32, 0.5)));
      crows.setMatrixAt(i * 3 + 1, m.compose(v.set(x + fx * 0.22, y + h.y + 0.42, z + fz * 0.22), q, sc.set(0.22, 0.22, 0.22)));
      crows.setMatrixAt(i * 3 + 2, m.compose(v.set(x + fx * 0.38, y + h.y + 0.4, z + fz * 0.38), q, sc.set(0.08, 0.07, 0.16)));
    }
    crows.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < NR; i++) {
      const r = rootP[i];
      e.set(Math.sin(now * 0.8 + r.ph) * 0.08, 0, Math.sin(now * 0.6 + r.ph) * 0.1);
      roots.setMatrixAt(i, m.compose(v.set(r.x, -1.9 - r.h / 2, r.z), q.setFromEuler(e), sc.set(0.14, r.h, 0.14)));
    }
    roots.instanceMatrix.needsUpdate = true;
    // the runes on the keys and the mushrooms throb
    const g = 0.3 + Math.sin(now * 2.2) * 0.05;
    for (let i = 0; i < keys.length; i++) {
      const [x, z, tilt, yaw] = keys[i];
      e.set(0, yaw, tilt);
      q.setFromEuler(e);
      v.set(0, 3.05, 0).applyQuaternion(q).add(sc.set(x, -0.3, z));
      runes.setMatrixAt(i, m.compose(v, q, sc.set(g, g, 0.12)));
    }
    runes.instanceMatrix.needsUpdate = true;
    tickBats(dt, now);
    // (fireflies round the mushrooms)
    if (Math.random() < dt * 5) {
      const side = Math.random() < 0.5 ? -1 : 1;
      v.set(side * rand(R + 0.5, R + 3.9), rand(0.3, 1.2), rand(-k.half, k.half));
      k.fx.burst(v, 1, ["#d8ff7a", "#7dffd6"], { speed: 0.5, up: 0.4, gravity: -0.2, size: 0.1, life: 1.8, drag: 2 });
    }
  };
}

// ---- the pier -------------------------------------------------------------------------------------

/**
 * BAY PIER: gulls, foam caps on the swell, a sandbar with palms and a sunshade on the left, a
 * ferry moored on the right, lifebuoys and pennants on the deck's rim, fish jumping.
 */
export function dressPier(k: DressKit, sea: number, rimMid: number): Tick {
  const s = k.scene;
  const m = new THREE.Matrix4(),
    v = new THREE.Vector3(),
    sc = new THREE.Vector3(),
    q = new THREE.Quaternion(),
    e = new THREE.Euler(),
    col = new THREE.Color();
  // the sandbar: a mound, three palms (trunks in segments, fronds), a striped sunshade
  const ix = -19.5,
    iz = -5;
  const sand = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.25, 1, 12), toon("#f4dca4", "#2a1e08"));
  sand.scale.set(5.6, 1.1, 3.8);
  sand.position.set(ix, sea + 0.2, iz);
  s.add(sand);
  const palms: [number, number, number, number][] = [
    [ix - 1.6, iz - 0.8, 0.35, 4.6],
    [ix + 1.2, iz - 1.2, -0.25, 3.9],
    [ix + 0.1, iz + 1.4, 0.2, 3.3],
  ];
  const trunk = new THREE.InstancedMesh(GEO.box, toon("#9a6a44", "#1a0e06"), palms.length * 5 + 1);
  const fronds = new THREE.InstancedMesh(GEO.box, toon("#ffffff", "#06180a"), palms.length * 6 + 3);
  let t = 0,
    f = 0;
  const tips: THREE.Vector3[] = [];
  palms.forEach(([x, z, lean, h], i) => {
    for (let j = 0; j < 5; j++) {
      const u = (j + 0.5) / 5;
      const bend = lean * u * u * h;
      trunk.setMatrixAt(t++, m.compose(v.set(x + bend, sea + 0.75 + u * h, z), q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), -lean * u * 1.4), sc.set(0.42 - u * 0.12, h / 5 + 0.05, 0.42 - u * 0.12)));
    }
    tips.push(new THREE.Vector3(x + lean * h, sea + 0.75 + h, z));
    for (let j = 0; j < 6; j++) fronds.setColorAt(f++, col.set(j % 2 ? "#3fae4a" : "#57c95c"));
    void i;
  });
  // (the sunshade's pole is the trunks' last; its canopy, three wedges, in the fronds)
  trunk.setMatrixAt(t, m.compose(v.set(ix + 2.6, sea + 1.7, iz + 0.9), IDENT, sc.set(0.1, 2.2, 0.1)));
  for (let j = 0; j < 3; j++) fronds.setColorAt(f + j, col.set(j % 2 ? "#ffffff" : "#ff6b35"));
  s.add(trunk, fronds);
  // the ferry on the right: hull, its band, deck, cabin, roof, funnel and its band, lifeboats (one draw), windows (one)
  const fx = 21.5,
    fz = -9,
    fyaw = 0.5;
  const parts: [string, number, number, number, number, number, number][] = [
    ["#ffffff", 0, 0.7, 0, 3.4, 1.6, 10],
    ["#ff6b35", 0, 0.25, 0, 3.46, 0.35, 10.05],
    ["#c9a57a", 0, 1.55, 0, 3.2, 0.12, 9.6],
    ["#f4f1ea", 0, 2.3, 0.6, 2.6, 1.4, 5.2],
    ["#c4b1fc", 0, 3.08, 0.6, 2.8, 0.18, 5.4],
    ["#ffffff", 0, 3.8, -0.8, 0.9, 1.4, 0.9],
    ["#ff6b35", 0, 4.25, -0.8, 0.95, 0.3, 0.95],
    ["#ff9a3a", 1.45, 2.0, 2.6, 0.5, 0.45, 1.6],
    ["#ff9a3a", -1.45, 2.0, 2.6, 0.5, 0.45, 1.6],
  ];
  const ferry = new THREE.InstancedMesh(GEO.box, toon("#ffffff", "#1a1820"), parts.length);
  parts.forEach((p, i) => ferry.setColorAt(i, col.set(p[0])));
  const win = new THREE.InstancedMesh(GEO.box, glow("#bfefff"), 2);
  s.add(ferry, win);
  // lifebuoys on the deck's rim between the pillars (they ride the deck round)
  const buoyGeo = new THREE.TorusGeometry(0.42, 0.14, 6, 14);
  const buoys = new THREE.InstancedMesh(buoyGeo, toon("#ff5a3a", "#3a0a00"), 4);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    q.setFromAxisAngle(UP, -a + Math.PI / 2);
    buoys.setMatrixAt(i, m.compose(v.set(Math.cos(a) * (rimMid + 0.32), 0.05, Math.sin(a) * (rimMid + 0.32)), q, sc.set(1, 1, 1)));
  }
  k.deck.add(buoys);
  // pennants round the rim, pillar to pillar
  const lines: [THREE.Vector3, THREE.Vector3][] = [];
  const NA = 8;
  for (let i = 0; i < NA; i++) {
    const a0 = Math.PI / 4 + (i / NA) * Math.PI * 2,
      a1 = Math.PI / 4 + ((i + 1) / NA) * Math.PI * 2;
    lines.push([new THREE.Vector3(Math.cos(a0) * rimMid, 3.1, Math.sin(a0) * rimMid), new THREE.Vector3(Math.cos(a1) * rimMid, 3.1, Math.sin(a1) * rimMid)]);
  }
  const tickB = bunting(k.deck, lines, ["#ffffff", "#ff6b35", "#3ec6ff", "#ffd27a", "#ff5fa2", "#8ee35b"], 7, 0.55);
  // posts on the four pennant stops between the pillars
  const posts = new THREE.InstancedMesh(GEO.box, toon("#f2ebe0", "#1a1410"), 4);
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + Math.PI / 4 + (i / 4) * Math.PI * 2;
    posts.setMatrixAt(i, m.compose(v.set(Math.cos(a) * rimMid, 1.7, Math.sin(a) * rimMid), IDENT, sc.set(0.14, 2.8, 0.14)));
  }
  k.deck.add(posts);
  // rocks off the near left, a striped channel marker on them, its lamp blinking (two draws)
  const rx = -16.5,
    rz = 8.5;
  const rockG = new THREE.ConeGeometry(1, 1, 6);
  const crag = new THREE.InstancedMesh(rockG, toon("#ffffff", "#101418"), 6);
  const crags: [string, number, number, number, number, number][] = [
    ["#6e7f8a", 0, 0, 1.9, 1.7, 1.6],
    ["#5f6f7a", 1.6, 0.8, 1.2, 1.1, 1.0],
    ["#7d8e98", -1.3, -0.9, 1.0, 0.9, 0.9],
    ["#ffffff", 0, 0, 0.16, 2.6, 0.16],
    ["#ff4a3a", 0, 0, 0.2, 0.5, 0.2],
    ["#ff4a3a", 0, 0, 0.2, 0.5, 0.2],
  ];
  crags.forEach(([c, ox, oz, w, h, d], i) => {
    const y = i < 3 ? sea + h / 2 - 0.2 : i === 3 ? sea + 1.4 + h / 2 : sea + 2.0 + (i - 4) * 1.0;
    crag.setMatrixAt(i, m.compose(v.set(rx + ox, y, rz + oz), i < 3 ? q.setFromAxisAngle(UP, i * 1.3) : IDENT, sc.set(i < 3 ? w : w, h, i < 3 ? d : d)));
    crag.setColorAt(i, col.set(c));
  });
  const marker = new THREE.Mesh(GEO.box, glow("#fff1a8"));
  marker.position.set(rx, sea + 4.4, rz);
  s.add(crag, marker);
  // foam caps on the swell (white voxels that rise and fade)
  const NF = 44;
  const foam = new THREE.InstancedMesh(GEO.box, glow("#f4fdff"), NF);
  foam.frustumCulled = false;
  const spot = (o: { x: number; z: number }) => {
    for (;;) {
      o.x = rand(-28, 28);
      o.z = rand(-24, 14);
      // (not on the deck, the sandbar or the ferry)
      if (Math.hypot(o.x, o.z) > k.rimOut + 2.2 && Math.hypot(o.x - ix, (o.z - iz) * 1.4) > 6.5 && Math.hypot(o.x - rx, o.z - rz) > 3 && Math.hypot(o.x - fx, (o.z - fz) * 0.5) > 3.5) return o;
    }
  };
  const caps = Array.from({ length: NF }, () => ({ ...spot({ x: 0, z: 0 }), t: rand(0, 2), d: rand(1.2, 2.4), w: rand(0.6, 1.6) }));
  s.add(foam);
  sun(s, new THREE.Vector3(-120, 95, -150), 12, "rgba(255,250,232,1)", "rgba(255,230,170,0.3)");
  const tickG = flock(s, 8, { color: "#ffffff", wing: "#d9e3ec", cx: 0, cz: -3, r: [13, 22], y: [6, 10], size: 0.75, speed: 6.5, flap: 7, glide: 1 });
  let fish = 1;
  const qf = new THREE.Quaternion();
  return (dt, now) => {
    // the palms sway, the fronds droop round their tips
    let j = 0;
    for (let i = 0; i < palms.length; i++) {
      const tip = tips[i];
      const sw = Math.sin(now * 1.1 + i * 2) * 0.08;
      for (let n2 = 0; n2 < 6; n2++) {
        const a = (n2 / 6) * Math.PI * 2 + i;
        e.set(0, -a, -(0.55 + sw + Math.sin(now * 2 + n2) * 0.05), "YXZ");
        q.setFromEuler(e);
        v.set(1.0, 0, 0).applyQuaternion(q).add(tip);
        fronds.setMatrixAt(j++, m.compose(v, q, sc.set(2.0, 0.08, 0.5)));
      }
    }
    for (let n2 = 0; n2 < 3; n2++) {
      const a = (n2 / 3) * Math.PI * 2 + now * 0.05;
      e.set(0, -a, -0.32, "YXZ");
      q.setFromEuler(e);
      v.set(0.62, 0, 0).applyQuaternion(q).add(sc.set(ix + 2.6, sea + 2.75, iz + 0.9));
      fronds.setMatrixAt(j++, m.compose(v, q, sc.set(1.3, 0.06, 0.9)));
    }
    fronds.instanceMatrix.needsUpdate = true;
    // the ferry rides the swell
    const bob = Math.sin(now * 1.2) * 0.18,
      roll = Math.sin(now * 0.9) * 0.03;
    e.set(roll * 0.5, fyaw, roll, "YXZ");
    qf.setFromEuler(e);
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      v.set(p[1], p[2], p[3]).applyQuaternion(qf).add(sc.set(fx, sea + bob - 0.6, fz));
      ferry.setMatrixAt(i, m.compose(v, qf, sc.set(p[4], p[5], p[6])));
    }
    ferry.instanceMatrix.needsUpdate = true;
    for (let side = 0; side < 2; side++) {
      v.set(side ? 1.32 : -1.32, 2.35, 0.6).applyQuaternion(qf).add(sc.set(fx, sea + bob - 0.6, fz));
      win.setMatrixAt(side, m.compose(v, qf, sc.set(0.06, 0.45, 4.4)));
    }
    win.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < NF; i++) {
      const c = caps[i];
      c.t += dt;
      if (c.t > c.d) ((c.t = 0), spot(c), (c.d = rand(1.2, 2.4)));
      const u = c.t / c.d;
      const h = Math.sin(Math.PI * u);
      foam.setMatrixAt(i, m.compose(v.set(c.x + u * 0.8, sea + 0.05 + h * 0.12, c.z), IDENT, sc.set(c.w * (0.4 + h * 0.6), 0.12 + h * 0.18, 0.32 + h * 0.2)));
    }
    foam.instanceMatrix.needsUpdate = true;
    tickB(dt, now);
    tickG(dt, now);
    marker.scale.setScalar(Math.floor(now * 1.6) % 2 ? 0.5 : 0.12);
    // a fish leaps now and then
    if ((fish -= dt) <= 0) {
      fish = rand(1.0, 2.2);
      const o = spot({ x: 0, z: 0 });
      v.set(o.x, sea + 0.1, o.z);
      k.fx.burst(v, 3, ["#cfe8f4", "#8fb8d0"], { speed: 0.8, up: 6.5, gravity: 14, size: 0.26, life: 0.9, drag: 0.2 });
      k.fx.burst(v, 10, ["#ffffff", "#bdf0ff"], { speed: 2.4, up: 2.5, gravity: 10, size: 0.16, life: 0.6 });
    }
  };
}
