import * as THREE from "three";
import { CEIL, HW, LEN, Quads, S0, SPHERE, TIERS, TOP_Y, ZB, canvasTex, frontAt, glow, offset, pathAt, rng, std, tierY, TOP_V, vwave, wave, type Tier } from "./kit";

/**
 * The atrium's shell: the white waves of terraced shelves round the U (thousands of instanced
 * books in their recesses, a warm LED line under every lip), the walls above them, the ceiling's
 * contour lights, the polished floor, and the eye-shaped glass front.
 */

const DS = 0.5;
const RECESS = 0.34,
  LIP = 0.14;

/** Front-wall eye (vesica): centre height, half width and half height. */
export const EYE = { yc: 14, a: 27, b: 14 };
const EYE_R = (EYE.a * EYE.a + EYE.b * EYE.b) / (2 * EYE.b);
/** Top and bottom of the eye opening at x (null outside it). */
export function eyeAt(x: number): [number, number] | null {
  if (Math.abs(x) >= EYE.a) return null;
  const k = Math.sqrt(EYE_R * EYE_R - x * x) - (EYE_R - EYE.b);
  return [EYE.yc - k, EYE.yc + k];
}

const samples = () => {
  const out: number[] = [];
  for (let s = S0; s < LEN - S0; s += DS) out.push(s);
  out.push(LEN - S0);
  return out;
};

export interface Atrium {
  group: THREE.Group;
  books: THREE.InstancedMesh;
  ledMat: THREE.MeshBasicMaterial;
  glass: THREE.Mesh;
  /** Reserved stretches of the shelves (no plain books there): tier index → [s0, s1][]. */
}

/**
 * Builds the shell. `reserved(tierIndex, s)` keeps a slot free of plain books (the data shelves
 * put their own there).
 */
export function buildAtrium(reserved: (ti: number, s: number, row: number) => boolean): Atrium {
  const group = new THREE.Group();
  const S = samples();
  const white = new Quads(),
    led = new Quads();
  const P = (x: number, y: number, z: number) => [x, y, z];

  TIERS.forEach((t, ti) => {
    const next: Tier | undefined = TIERS[ti + 1];
    for (let i = 0; i < S.length - 1; i++) {
      const sa = S[i],
        sb = S[i + 1];
      const [y0a, y1a] = tierY(ti, sa),
        [y0b, y1b] = tierY(ti, sb);
      const fa = frontAt(t, sa),
        fb = frontAt(t, sb);
      const ba = frontAt(t, sa, RECESS),
        bb = frontAt(t, sb, RECESS);
      // top: from the front back to the next tier's recess (or the wall)
      const ta = next ? frontAt(next, sa, RECESS) : frontAt(t, sa, offset(t, sa)),
        tb = next ? frontAt(next, sb, RECESS) : frontAt(t, sb, offset(t, sb));
      white.quad(P(fa.x, y1a, fa.z), P(fb.x, y1b, fb.z), P(tb.x, y1b, tb.z), P(ta.x, y1a, ta.z), 1.0);
      // the lip's face and underside
      white.quad(P(fa.x, y1a - LIP, fa.z), P(fb.x, y1b - LIP, fb.z), P(fb.x, y1b, fb.z), P(fa.x, y1a, fa.z), 0.97);
      white.quad(P(fa.x, y1a - LIP, fa.z), P(ba.x, y1a - LIP, ba.z), P(bb.x, y1b - LIP, bb.z), P(fb.x, y1b - LIP, fb.z), 0.9);
      // the recess back, darker low down
      white.quad(P(ba.x, y0a, ba.z), P(bb.x, y0b, bb.z), P(bb.x, y1b - LIP, bb.z), P(ba.x, y1a - LIP, ba.z), [0.62, 0.62, 0.8, 0.8]);
      // the middle board, its top and its edge
      const yba = y0a + 0.55,
        ybb = y0b + 0.55;
      const ea = frontAt(t, sa, 0.03),
        eb = frontAt(t, sb, 0.03);
      white.quad(P(ea.x, yba, ea.z), P(eb.x, ybb, eb.z), P(bb.x, ybb, bb.z), P(ba.x, yba, ba.z), 0.92);
      white.quad(P(ea.x, yba - 0.035, ea.z), P(eb.x, ybb - 0.035, eb.z), P(eb.x, ybb, eb.z), P(ea.x, yba, ea.z), 0.95);
      // the warm line under the lip
      const la = frontAt(t, sa, 0.05),
        lb = frontAt(t, sb, 0.05);
      led.quad(P(la.x, y1a - LIP - 0.035, la.z), P(lb.x, y1b - LIP - 0.035, lb.z), P(lb.x, y1b - LIP, lb.z), P(la.x, y1a - LIP, la.z), 1);
      // a fin every 2.1 m
      if (Math.floor(sa / 2.1) !== Math.floor(sb / 2.1)) {
        const s = Math.floor(sb / 2.1) * 2.1;
        const [y0, y1] = tierY(ti, s);
        const f = frontAt(t, s, 0.02),
          b = frontAt(t, s, RECESS);
        const tx = f.nz * 0.025,
          tz = -f.nx * 0.025;
        for (const sg of [-1, 1]) white.quad(P(f.x + tx * sg, y0, f.z + tz * sg), P(b.x + tx * sg, y0, b.z + tz * sg), P(b.x + tx * sg, y1 - LIP, b.z + tz * sg), P(f.x + tx * sg, y1 - LIP, f.z + tz * sg), 0.93);
        white.quad(P(f.x - tx, y0, f.z - tz), P(f.x + tx, y0, f.z + tz), P(f.x + tx, y1 - LIP, f.z + tz), P(f.x - tx, y1 - LIP, f.z - tz), 1);
      }
    }
    // end caps against the front wall
    for (const s of [S0, LEN - S0]) {
      const f = frontAt(t, s),
        w = pathAt(s);
      const [y0, y1] = tierY(ti, s);
      white.quad(P(w.x, y0, w.z), P(f.x, y0, f.z), P(f.x, y1, f.z), P(w.x, y1, w.z), 0.95);
    }
  });

  // the wall round the U, up to the ceiling, with the reading room's window in the back
  for (let i = 0; i < S.length - 1; i++) {
    const a = pathAt(S[i]),
      b = pathAt(S[i + 1]);
    const win = a.nz === 1 && Math.abs(a.x) < 10 && Math.abs(b.x) < 10.01;
    const spans: [number, number][] = win
      ? [
          [0, 25],
          [29.6, CEIL],
        ]
      : [[0, CEIL]];
    for (const [y0, y1] of spans) white.quad(P(a.x, y0, a.z), P(b.x, y0, b.z), P(b.x, y1, b.z), P(a.x, y1, a.z), y1 > TOP_Y + 1 ? 0.96 : 0.7);
  }
  // the upper waves: thin white bands between the shelves and the ceiling
  for (const [y, o, a] of [
    [25.6, 0.9, 0.35],
    [27.4, 1.3, 0.5],
    [29.2, 1.8, 0.7],
    [31.0, 2.4, 0.9],
  ] as const) {
    for (let i = 0; i < S.length - 1; i++) {
      const sa = S[i],
        sb = S[i + 1];
      const pa = pathAt(sa),
        pb = pathAt(sb);
      const oa = o + a * wave(sa),
        ob = o + a * wave(sb);
      const ya = y + TOP_V * 0.75 * vwave(sa),
        yb = y + TOP_V * 0.75 * vwave(sb);
      const fa = [pa.x + pa.nx * oa, pa.z + pa.nz * oa],
        fb = [pb.x + pb.nx * ob, pb.z + pb.nz * ob];
      if (pa.nz === 1 && Math.abs(pa.x) < 10.5 && y > 24.5 && y < 30) continue;
      white.quad(P(fa[0], ya, fa[1]), P(fb[0], yb, fb[1]), P(pb.x, yb, pb.z), P(pa.x, ya, pa.z), 1);
      white.quad(P(fa[0], ya - 0.12, fa[1]), P(fb[0], yb - 0.12, fb[1]), P(fb[0], yb, fb[1]), P(fa[0], ya, fa[1]), 0.98);
      white.quad(P(fa[0], ya - 0.12, fa[1]), P(pa.x, ya - 0.12, pa.z), P(pb.x, yb - 0.12, pb.z), P(fb[0], yb - 0.12, fb[1]), 0.88);
      const la = [pa.x + pa.nx * (oa - 0.06), pa.z + pa.nz * (oa - 0.06)],
        lb = [pb.x + pb.nx * (ob - 0.06), pb.z + pb.nz * (ob - 0.06)];
      led.quad(P(la[0], ya - 0.16, la[1]), P(lb[0], yb - 0.16, lb[1]), P(lb[0], yb - 0.12, lb[1]), P(la[0], ya - 0.12, la[1]), 1);
    }
  }
  const shellMat = std("#f4f1ea", 0.62, 0.0, { vertexColors: true, side: THREE.DoubleSide });
  const shell = new THREE.Mesh(white.geometry(), shellMat);
  shell.raycast = () => {};
  const ledMat = glow("#ffe0b0", 1.6);
  ledMat.side = THREE.DoubleSide;
  const leds = new THREE.Mesh(led.geometry(), ledMat);
  leds.raycast = () => {};
  group.add(shell, leds);

  // ---- the books: one instanced mesh, spines out -------------------------------------------------
  const books = plainBooks(reserved);
  group.add(books);

  // ---- floor ----------------------------------------------------------------------------------------
  const floorTex = canvasTex(1024, 1024, (g, w, h) => {
    g.fillStyle = "#e9e5dd";
    g.fillRect(0, 0, w, h);
    const r = rng(7);
    for (let y = 0; y < 8; y++)
      for (let x = 0; x < 8; x++) {
        const l = 88 + r() * 5;
        g.fillStyle = `hsl(36, 12%, ${l}%)`;
        g.fillRect(x * 128 + 1, y * 128 + 1, 126, 126);
      }
    g.strokeStyle = "rgba(120,110,95,0.25)";
    g.lineWidth = 2;
    for (let k = 0; k <= 8; k++) {
      g.beginPath();
      g.moveTo(k * 128, 0);
      g.lineTo(k * 128, h);
      g.moveTo(0, k * 128);
      g.lineTo(w, k * 128);
      g.stroke();
    }
  });
  floorTex.t.wrapS = floorTex.t.wrapT = THREE.RepeatWrapping;
  floorTex.t.repeat.set(7.5, 8);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(HW * 2, -ZB), new THREE.MeshStandardMaterial({ map: floorTex.t, roughness: 0.22, metalness: 0.05 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, ZB / 2);
  floor.raycast = () => {};
  group.add(floor);
  // rings in the floor round the sphere
  for (const [r, w, k] of [
    [9.2, 0.08, 1.4],
    [10.4, 0.05, 1.0],
    [12.2, 0.04, 0.8],
  ] as const) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(r, r + w, 128), glow("#ffd9a0", k));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(SPHERE.x, 0.012, SPHERE.z);
    ring.raycast = () => {};
    group.add(ring);
  }

  // ---- ceiling with its contour lights and the oval over the sphere ----------------------------------
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(HW * 2, -ZB), std("#f2efe8", 0.9));
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set(0, CEIL, ZB / 2);
  ceil.raycast = () => {};
  group.add(ceil);
  const cl = new Quads();
  for (const o of [4.2, 7.6, 11.2, 14.6]) {
    for (let i = 0; i < S.length - 1; i++) {
      const pa = pathAt(S[i]),
        pb = pathAt(S[i + 1]);
      const oa = o + 1.2 * wave(S[i] * 0.7 + o),
        ob = o + 1.2 * wave(S[i + 1] * 0.7 + o);
      const a0 = [pa.x + pa.nx * oa, pa.z + pa.nz * oa],
        b0 = [pb.x + pb.nx * ob, pb.z + pb.nz * ob],
        a1 = [pa.x + pa.nx * (oa + 0.09), pa.z + pa.nz * (oa + 0.09)],
        b1 = [pb.x + pb.nx * (ob + 0.09), pb.z + pb.nz * (ob + 0.09)];
      cl.quad(P(a0[0], CEIL - 0.02, a0[1]), P(b0[0], CEIL - 0.02, b0[1]), P(b1[0], CEIL - 0.02, b1[1]), P(a1[0], CEIL - 0.02, a1[1]), 1);
    }
  }
  for (const [rx, rz] of [
    [6, 7],
    [8.5, 9.8],
    [11, 12.6],
  ]) {
    for (let i = 0; i < 96; i++) {
      const a = (i / 96) * Math.PI * 2,
        b = ((i + 1) / 96) * Math.PI * 2;
      const q = (ang: number, k: number) => [SPHERE.x + Math.cos(ang) * rx * k, CEIL - 0.02, SPHERE.z + Math.sin(ang) * rz * k];
      cl.quad(q(a, 1), q(b, 1), q(b, 1.012), q(a, 1.012), 1);
    }
  }
  const ceilLines = new THREE.Mesh(cl.geometry(), ledMat);
  ceilLines.raycast = () => {};
  group.add(ceilLines);

  // ---- the eye: the front wall, its glass and mullions, the contour rings round it ---------------------
  const wallShape = new THREE.Shape();
  wallShape.moveTo(-HW, -0.5);
  wallShape.lineTo(HW, -0.5);
  wallShape.lineTo(HW, CEIL);
  wallShape.lineTo(-HW, CEIL);
  wallShape.closePath();
  const lens = new THREE.Path();
  const N = 72;
  for (let i = 0; i <= N; i++) {
    const x = -EYE.a + (2 * EYE.a * i) / N;
    const e = eyeAt(x) ?? [EYE.yc, EYE.yc];
    if (i === 0) lens.moveTo(x, e[1]);
    else lens.lineTo(x, e[1]);
  }
  for (let i = N - 1; i > 0; i--) {
    const x = -EYE.a + (2 * EYE.a * i) / N;
    lens.lineTo(x, eyeAt(x)![0]);
  }
  lens.closePath();
  wallShape.holes.push(lens);
  const front = new THREE.Mesh(new THREE.ShapeGeometry(wallShape, 4), std("#f1eee7", 0.7, 0, { side: THREE.DoubleSide }));
  front.position.z = 0;
  front.raycast = () => {};
  group.add(front);
  const lensShape = new THREE.Shape(lens.getPoints());
  const glass = new THREE.Mesh(new THREE.ShapeGeometry(lensShape, 4), new THREE.MeshBasicMaterial({ color: "#cfe4ec", transparent: true, opacity: 0.1, depthWrite: false, side: THREE.DoubleSide }));
  glass.position.z = 0.08;
  glass.raycast = () => {};
  group.add(glass);
  const mull = new Quads();
  const bar = (x0: number, y0: number, x1: number, y1: number, t: number) => {
    // a thin flat bar on the glass plane, facing the atrium
    const dx = x1 - x0,
      dy = y1 - y0,
      l = Math.hypot(dx, dy) || 1;
    const px = (-dy / l) * t,
      py = (dx / l) * t;
    mull.quad(P(x0 - px, y0 - py, 0.02), P(x1 - px, y1 - py, 0.02), P(x1 + px, y1 + py, 0.02), P(x0 + px, y0 + py, 0.02), 1);
  };
  for (let x = -EYE.a + 2.25; x < EYE.a; x += 2.25) {
    const e = eyeAt(x);
    if (e) bar(x, e[0], x, e[1], Math.abs(x) < 0.2 ? 0.09 : 0.045);
  }
  for (let y = 2.4; y < EYE.yc + EYE.b; y += 2.4) {
    // the lens's width at y
    let w = 0;
    for (let x = 0; x < EYE.a; x += 0.05) {
      const e = eyeAt(x);
      if (e && y > e[0] && y < e[1]) w = x;
    }
    if (w > 0.2) bar(-w, y, w, y, 0.04);
  }
  // the lens frame itself and concentric contour lines round it, lit
  const ring = new Quads();
  for (const [grow, t] of [
    [0, 0.16],
    [1.4, 0.05],
    [2.9, 0.05],
    [4.6, 0.045],
  ] as const) {
    const a = EYE.a + grow * 1.6,
      b = EYE.b + grow;
    const R = (a * a + b * b) / (2 * b);
    const at = (x: number, up: boolean) => {
      const k = Math.sqrt(Math.max(0, R * R - x * x)) - (R - b);
      return EYE.yc + (up ? k : -k);
    };
    const pts: [number, number][] = [];
    for (let i = 0; i <= 80; i++) {
      const x = -a + (2 * a * i) / 80;
      pts.push([x, at(x, true)]);
    }
    for (let i = 80; i >= 0; i--) {
      const x = -a + (2 * a * i) / 80;
      pts.push([x, at(x, false)]);
    }
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0] = pts[i],
        [x1, y1] = pts[i + 1];
      if (Math.min(y0, y1) < 0.05 || Math.max(y0, y1) > CEIL - 0.1 || Math.max(Math.abs(x0), Math.abs(x1)) > HW - 0.1) continue;
      const dx = x1 - x0,
        dy = y1 - y0,
        l = Math.hypot(dx, dy) || 1;
      const px = (-dy / l) * t,
        py = (dx / l) * t;
      ring.quad(P(x0 - px, y0 - py, -0.03), P(x1 - px, y1 - py, -0.03), P(x1 + px, y1 + py, -0.03), P(x0 + px, y0 + py, -0.03), 1);
    }
  }
  const mullions = new THREE.Mesh(mull.geometry(), std("#e8e6e0", 0.4, 0.3, { side: THREE.DoubleSide }));
  const rings = new THREE.Mesh(ring.geometry(), ledMat);
  mullions.raycast = rings.raycast = () => {};
  group.add(mullions, rings);

  return { group, books, ledMat, glass };
}

/** Spine colours: deep cloths, creams and a few bright jackets. */
const PALETTE = ["#7a2a2a", "#9a3a2e", "#26406a", "#1f3550", "#2f5a44", "#3c6a52", "#c99a3a", "#e3d7bc", "#f1ece0", "#ece4d0", "#2a2a30", "#5a3a6a", "#b85a2a", "#d8c8a0", "#3a7a8a", "#a8443c", "#f4b728", "#e8e0d0", "#6a6a74", "#2e6e9e", "#c4b8a0", "#8a2a4a", "#f2efe6", "#4a5a2a"];

/** The plain books in every recess not reserved for data. */
function plainBooks(reserved: (ti: number, s: number, row: number) => boolean) {
  // a book without its back: spine (+z), top, sides, bottom
  const g = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const idx = g.index!.array;
  // box faces: +x, -x, +y, -y, +z, -z (6 indices each): drop -z (against the back panel)
  const keep: number[] = [];
  for (let f = 0; f < 6; f++) if (f !== 5) for (let i = 0; i < 6; i++) keep.push(idx[f * 6 + i]);
  g.setIndex(keep);
  const r = rng(2024);
  const mats: THREE.Matrix4[] = [];
  const cols: THREE.Color[] = [];
  const m = new THREE.Matrix4(),
    q = new THREE.Quaternion(),
    e = new THREE.Euler(0, 0, 0, "YXZ"),
    v = new THREE.Vector3(),
    sc = new THREE.Vector3();
  TIERS.forEach((t, ti) => {
    [0, 1].forEach((row) => {
      let s = S0 + 0.1;
      while (s < LEN - S0 - 0.1) {
        const th = 0.045 + r() * 0.07;
        const mid = s + th / 2;
        s += th + 0.004;
        const [y0, y1] = tierY(ti, mid);
        const [ya, yb] = row ? [y0 + 0.55, y1 - LIP - 0.04] : [y0, y0 + 0.515];
        const fin = Math.abs(mid / 2.1 - Math.round(mid / 2.1)) * 2.1;
        if (fin < 0.07 || reserved(ti, mid, row) || r() < 0.07) continue;
        const f = frontAt(t, mid, RECESS - 0.01);
        const depth = 0.2 + r() * 0.08;
        const h = (yb - ya) * (0.6 + r() * 0.34);
        const yaw = Math.atan2(f.nx, f.nz);
        const lean = r() < 0.05 ? (r() - 0.5) * 0.5 : 0;
        e.set(0, yaw, lean);
        q.setFromEuler(e);
        v.set(f.x + f.nx * (depth / 2), ya + 0.002, f.z + f.nz * (depth / 2));
        sc.set(th, h, depth);
        mats.push(m.compose(v, q, sc).clone());
        cols.push(new THREE.Color(PALETTE[Math.floor(r() * PALETTE.length)]).multiplyScalar(0.85 + r() * 0.25));
      }
    });
  });
  const mesh = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ roughness: 0.72, metalness: 0 }), mats.length);
  mats.forEach((mm, i) => {
    mesh.setMatrixAt(i, mm);
    mesh.setColorAt(i, cols[i]);
  });
  mesh.raycast = () => {};
  mesh.frustumCulled = false;
  return mesh;
}

export { RECESS, LIP };
