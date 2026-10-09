import * as THREE from "three";
import * as F from "../furniture";
import { box, glowMat, std } from "../kit";
import * as H from "./furniture";
import { HotelKit, LEVELS, marble, tex } from "./kit";

/**
 * The grand staircase: a stair hall in the core behind the atrium's west wall, from G (a doorway
 * behind the Atrium Bar) up to the casino on 2 (a gold portal by the Lotus bar). One straight flight
 * of 53 white marble steps under a red runner with brass rods, walnut dado and brass handrails on
 * both walls, damask panels in gilt mouldings, portraits, crystal chandeliers and a coffered laylight.
 * It is walked for real (liftplan.ts: the flight over STAIR's zone joins G and 2); it is drawn with
 * the atrium, and index.ts shows the floor at its other end while you are in it.
 */
export const STAIR = {
  /** The flight: [x0, z0, x1, z1], climbing toward +z (foot on G at z0, head on 2 at z1). */
  zone: [-19.3, -19.3, -15.3, -3.3] as const,
  /** The hall's west wall (its inner face), the core wall it is built behind. */
  west: -19.5,
  east: -15,
  /** The doorways in the core wall: [z0, z1, height]. */
  footDoor: [-21.75, -19.4, 3.6] as [number, number, number],
  headDoor: [-3.0, -0.6, 3.4] as [number, number, number],
};

export function grandStair(k: HotelKit) {
  const g = k.groups[0];
  const [x0, z0, x1, z1] = STAIR.zone;
  const W = STAIR.west,
    E = STAIR.east;
  const top = LEVELS[1].y;
  const ceil = top + LEVELS[1].h;
  const run = z1 - z0;
  const N = 53;
  const rise = top / N,
    go = run / N;
  const slope = Math.atan2(top, run);
  const pitch = (z: number) => THREE.MathUtils.clamp((z - z0) / run, 0, 1) * top;
  const mid = (x0 + x1) / 2,
    wide = E - W;
  const cx = (W + E) / 2;

  // ---- materials ----
  const stepMat = new THREE.MeshStandardMaterial({ map: marble("#f3efe8", "130,118,104", 2, 0.4), roughness: 0.14, metalness: 0.1 });
  const landMat = new THREE.MeshStandardMaterial({ map: marble("#ece7de", "120,110,100", 3, 2), roughness: 0.12, metalness: 0.15 });
  const runnerT = tex(128, 1, 1, (c, S) => {
    c.fillStyle = "#6a0f1c";
    c.fillRect(0, 0, S, S);
    c.fillStyle = "#7d1424";
    for (let i = 0; i < 4; i++) c.fillRect(20 + i * 24, 0, 10, S);
    c.fillStyle = "#c9a227";
    c.fillRect(6, 0, 5, S);
    c.fillRect(S - 11, 0, 5, S);
    c.fillStyle = "#3a0810";
    c.fillRect(0, 0, 4, S);
    c.fillRect(S - 4, 0, 4, S);
  });
  const runner = new THREE.MeshStandardMaterial({ map: runnerT, roughness: 0.95 });
  const brass = std("#c9a24a", 0.25, 0.9);
  const walnut = std("#4a2c1a", 0.45, 0.1);
  const silk = std("#ead9bd", 0.7);
  const damaskT = tex(128, 2, 3, (c, S) => {
    c.fillStyle = "#5a1020";
    c.fillRect(0, 0, S, S);
    c.strokeStyle = "rgba(214,170,90,0.45)";
    c.lineWidth = 3;
    c.beginPath();
    c.ellipse(S / 2, S / 2, S * 0.22, S * 0.36, 0, 0, Math.PI * 2);
    c.stroke();
    c.beginPath();
    c.moveTo(S / 2, S * 0.1);
    c.lineTo(S / 2, S * 0.9);
    c.moveTo(S * 0.3, S / 2);
    c.lineTo(S * 0.7, S / 2);
    c.stroke();
    c.fillStyle = "rgba(214,170,90,0.4)";
    for (const [x, y] of [[0, 0], [S, 0], [0, S], [S, S]]) {
      c.beginPath();
      c.arc(x, y, 9, 0, Math.PI * 2);
      c.fill();
    }
  });
  const damask = new THREE.MeshStandardMaterial({ map: damaskT, roughness: 0.85 });
  const core = std("#2a2620", 0.8);

  // ---- the shell: the west wall, the ends, the core wall's back with its two doorways, the ceiling ----
  box(g, 0.2, ceil + 0.2, 22.4, silk, W - 0.1, 0, -11);
  box(g, wide + 0.2, ceil + 0.2, 0.2, silk, cx - 0.1, 0, -22.1);
  box(g, wide + 0.2, ceil + 0.2, 0.2, silk, cx - 0.1, 0, 0.1);
  k.rects[0].push([W - 0.2, -22.2, W, 0.2], [W - 0.2, -22.2, E + 0.1, -22], [W - 0.2, 0, E + 0.1, 0.2]);
  k.rects[1].push([W - 0.2, -22.2, W, 0.2], [W - 0.2, 0, E + 0.1, 0.2]);
  // the back of the core wall, panelled like the rest (planes facing into the hall, cut round the doorways)
  const [fd0, fd1, fdh] = STAIR.footDoor;
  const [hd0, hd1, hdh] = STAIR.headDoor;
  const back = (za: number, zb: number, ya: number, yb: number, mat: THREE.Material = silk, x = E - 0.11) => {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(zb - za, yb - ya), mat);
    p.position.set(x, (ya + yb) / 2, (za + zb) / 2);
    p.rotation.y = -Math.PI / 2;
    g.add(p);
    return p;
  };
  back(-22, fd0, 0, ceil);
  back(fd0, fd1, fdh, ceil);
  back(fd1, hd0, 0, ceil);
  back(hd0, hd1, top - 0.2, top);
  back(hd0, hd1, top + hdh, ceil);
  back(hd1, 0, 0, ceil);
  // seen from the atrium over its wall (the casino above is not drawn from there): the core rising on
  const out = (za: number, zb: number, ya: number, yb: number) => {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(zb - za, yb - ya), core);
    p.position.set(E, (ya + yb) / 2, (za + zb) / 2);
    p.rotation.y = Math.PI / 2;
    g.add(p);
  };
  out(-22.2, hd0, LEVELS[0].h, ceil + 0.2);
  out(hd0, hd1, LEVELS[0].h, top);
  out(hd0, hd1, top + hdh, ceil + 0.2);
  out(hd1, 0.2, LEVELS[0].h, ceil + 0.2);
  // the ceiling: gilt beams over a warm laylight
  box(g, wide + 0.4, 0.2, 22.4, std("#efe0bd", 0.6), cx, ceil, -11);
  const lay = glowMat("#ffe6b8", 0.95);
  for (let z = -21; z < -0.5; z += 2) box(g, wide - 1.0, 0.02, 1.6, lay, cx, ceil - 0.02, z);
  for (let z = -22; z <= 0; z += 2) box(g, wide, 0.3, 0.16, k.gold, cx, ceil - 0.3, z);
  for (const x of [W + 0.3, E - 0.3]) box(g, 0.3, 0.3, 22, k.gold, x, ceil - 0.3, -11);
  // the cornice
  for (const x of [W + 0.06, E - 0.17]) {
    box(g, 0.12, 0.36, 22, std("#f2e6cc", 0.5), x, ceil - 0.66, -11);
    box(g, 0.14, 0.06, 22, k.gold, x, ceil - 0.72, -11);
  }

  // ---- the landings ----
  const foot = new THREE.Mesh(new THREE.PlaneGeometry(wide, z0 + 22), landMat);
  foot.rotation.x = -Math.PI / 2;
  foot.position.set(cx, 0.003, (z0 - 22) / 2);
  g.add(foot);
  box(g, wide, 0.2, -z1, landMat, cx, top - 0.2, z1 / 2);
  box(g, wide, 0.04, 0.06, k.gold, cx, top - 0.02, z1 + 0.03);
  // gold thresholds in the doorways
  box(g, 0.24, 0.02, fd1 - fd0, k.gold, E, 0, (fd0 + fd1) / 2);
  box(g, 0.24, 0.02, hd1 - hd0, k.gold, E, top, (hd0 + hd1) / 2);
  // rugs on the landings
  const rug = (z: number, y: number, d: number) => {
    const r = new THREE.Mesh(new THREE.PlaneGeometry(d, wide - 0.8), runner);
    r.rotation.set(-Math.PI / 2, 0, Math.PI / 2);
    r.position.set(cx, y + 0.008, z);
    g.add(r);
  };
  rug((z0 - 21.7) / 2, 0, z0 + 21.7);
  rug(z1 / 2 - 0.05, top, -z1 - 0.5);

  // ---- the flight: marble steps, the runner, brass rods, gold nosings (instanced) ----
  const m4 = new THREE.Matrix4(),
    q = new THREE.Quaternion(),
    one = new THREE.Vector3(1, 1, 1),
    p = new THREE.Vector3();
  const inst = (geo: THREE.BufferGeometry, mat: THREE.Material, at: (i: number) => [number, number, number]) => {
    const im = new THREE.InstancedMesh(geo, mat, N);
    for (let i = 0; i < N; i++) im.setMatrixAt(i, m4.compose(p.set(...at(i)), q, one));
    im.instanceMatrix.needsUpdate = true;
    im.computeBoundingSphere();
    g.add(im);
    return im;
  };
  const front = (i: number) => z0 + i * go;
  inst(new THREE.BoxGeometry(wide, rise + 0.3, go + 0.004), stepMat, (i) => [cx, (i + 1) * rise - (rise + 0.3) / 2, front(i) + go / 2]);
  inst(new THREE.BoxGeometry(2.6, rise + 0.014, go + 0.014), runner, (i) => [mid, (i + 1) * rise + 0.014 - (rise + 0.014) / 2, front(i) - 0.014 + (go + 0.014) / 2]);
  inst(new THREE.BoxGeometry(wide, 0.03, 0.05), k.gold, (i) => [cx, (i + 1) * rise - 0.014, front(i) + 0.022]);
  const rod = new THREE.CylinderGeometry(0.016, 0.016, 2.8, 8).rotateZ(Math.PI / 2);
  inst(rod, brass, (i) => [mid, i * rise + 0.035, front(i) - 0.03]);
  for (const s of [-1, 1]) inst(new THREE.SphereGeometry(0.03, 8, 6), brass, (i) => [mid + s * 1.42, i * rise + 0.035, front(i) - 0.03]);

  // ---- both walls: a walnut dado following the stair, its gold cap, a brass handrail on brackets ----
  const tilt = (mesh: THREE.Mesh) => {
    mesh.rotation.x = -slope;
    return mesh;
  };
  const len = Math.hypot(run, top);
  for (const [x, nx, doors] of [
    [W + 0.03, 1, [] as [number, number, number][]],
    [E - 0.13, -1, [[fd0, fd1, 0], [hd0, hd1, top]] as [number, number, number][]],
  ] as const) {
    // flat runs on the landings (cut at the doorways), the sloped run along the flight
    const flats: [number, number, number][] = [
      [-22, z0, 0],
      [z1, 0, top],
    ];
    for (const [za, zb, y] of flats) {
      let pieces: [number, number][] = [[za, zb]];
      for (const [da, db, dy] of doors) if (dy === y) pieces = pieces.flatMap(([a, b]) => (db <= a || da >= b ? [[a, b]] : ([[a, da], [db, b]] as [number, number][]).filter(([u, v]) => v - u > 0.01)));
      for (const [a, b] of pieces) {
        box(g, 0.06, 1.1, b - a, walnut, x, y, (a + b) / 2);
        box(g, 0.1, 0.06, b - a, k.gold, x + nx * 0.02, y + 1.1, (a + b) / 2);
      }
    }
    const za = Math.max(z0, nx < 0 ? fd1 : z0);
    const l = Math.hypot(z1 - za, pitch(z1) - pitch(za));
    const zm = (za + z1) / 2;
    const dado = tilt(new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.4 * Math.cos(slope), l), walnut));
    dado.position.set(x, pitch(zm) + 0.4, zm);
    const cap = tilt(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, l), k.gold));
    cap.position.set(x + nx * 0.02, pitch(zm) + 1.1, zm);
    g.add(dado, cap);
    // the handrail, 0.95 m over the nosings
    const hx = x + nx * 0.14;
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, len + 0.6, 12), brass);
    rail.rotation.x = Math.PI / 2 - slope;
    rail.position.set(hx, top / 2 + 0.95, (z0 + z1) / 2);
    g.add(rail);
    for (let t = 0.04; t < 1; t += 0.12) {
      const zz = z0 + t * run;
      box(g, 0.14, 0.03, 0.03, brass, (x + hx) / 2, pitch(zz) + 0.9, zz);
    }
    // newels at the foot and the head: a marble post against the wall with a lit globe
    for (const [zz, y] of [
      [z0 - 0.12, 0],
      [z1 + 0.12, top],
    ] as const) {
      if (nx < 0 && zz > fd0 - 0.2 && zz < fd1 + 0.2 && y === 0) continue;
      box(g, 0.2, 1.2, 0.3, stepMat, x + nx * 0.07, y, zz);
      box(g, 0.24, 0.06, 0.34, k.gold, x + nx * 0.07, y + 1.2, zz);
      const globe = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), glowMat("#fff0cc", 1.5));
      globe.position.set(x + nx * 0.07, y + 1.42, zz);
      g.add(globe);
    }
  }

  // ---- above the dado: damask panels in gilt mouldings, stepping up with the stair ----
  const moulding = (x: number, za: number, zb: number, ya: number, yb: number) => {
    const t = 0.05;
    box(g, 0.05, t, zb - za, k.gold, x, ya, (za + zb) / 2);
    box(g, 0.05, t, zb - za, k.gold, x, yb - t, (za + zb) / 2);
    box(g, 0.05, yb - ya, t, k.gold, x, ya, za + t / 2);
    box(g, 0.05, yb - ya, t, k.gold, x, ya, zb - t / 2);
  };
  const panels = [-17.6, -14.2, -10.6, -7.0];
  for (const [x, nx] of [
    [W + 0.02, 1],
    [E - 0.13, -1],
  ] as const)
    panels.forEach((zc, i) => {
      if (nx > 0 && i === 2) return; // the big portrait goes there
      const ya = pitch(zc) + 1.7,
        h = 3.0;
      const pl = new THREE.Mesh(new THREE.PlaneGeometry(2.4, h), damask);
      pl.position.set(x + nx * 0.005, ya + h / 2, zc);
      pl.rotation.y = (nx * Math.PI) / 2;
      g.add(pl);
      moulding(x + nx * 0.02, zc - 1.25, zc + 1.25, ya - 0.05, ya + h + 0.05);
    });
  // portraits up the west wall: the house's own zkSNARKs
  k.painting(0, 4242, W + 0.04, pitch(-10.6) + 3.3, -10.6, Math.PI / 2, 2.2);
  k.painting(0, 1337, W + 0.04, pitch(-14.2) + 3.2, -14.2, Math.PI / 2, 1.3);
  k.painting(0, 2024, W + 0.04, pitch(-7.0) + 3.2, -7.0, Math.PI / 2, 1.3);
  k.painting(0, 3301, E - 0.15, pitch(-10.6) + 3.2, -10.6, -Math.PI / 2, 1.5);
  // the dado round the end walls too
  for (const [z, y, nz] of [
    [-21.97, 0, 1],
    [-0.03, top, -1],
  ] as const) {
    box(g, wide, 1.1, 0.06, walnut, cx, y, z);
    box(g, wide, 0.06, 0.1, k.gold, cx, y + 1.1, z + nz * 0.02);
  }
  // and on the end walls, facing down and up the flight
  k.painting(0, 777, cx, 3.6, -21.97, 0, 2.4);
  k.painting(0, 5000, cx + 0.5, top + 2.9, -0.03, Math.PI, 1.6);
  for (const s of [-1, 1]) {
    F.place(g, "sconceStair", () => F.sconce("#ffe2b0"), cx + s * 1.75, 3.2, -21.97, 0);
    F.place(g, "sconceStair", () => F.sconce("#ffe2b0"), cx + 0.5 + s * 1.3, top + 2.7, -0.03, Math.PI);
  }
  // sconces between the panels, on both walls
  for (const zc of [-19.4, -15.9, -12.4, -8.8, -5.2])
    for (const [x, r] of [
      [W + 0.05, Math.PI / 2],
      [E - 0.16, -Math.PI / 2],
    ] as const) {
      if (r < 0 && zc < fd1 + 0.4) continue;
      F.place(g, "sconceStair", () => F.sconce("#ffe2b0"), x, Math.max(0, pitch(zc)) + 2.6, zc, r);
    }
  // the frieze over the flight
  k.label(0, "MARINA ZEC  ·  GRAND STAIRCASE", W + 0.06, ceil - 1.25, -11, { h: 0.42, color: "#f4b728", rot: Math.PI / 2 });

  // ---- chandeliers down the hall, hung clear of the stair ----
  for (const [z, y, r] of [
    [-20.6, 6.6, 1.1],
    [-14.2, 9.6, 1.35],
    [-8.6, 12.0, 1.35],
    [-2.0, 13.2, 0.9],
  ] as const) {
    const ch = H.chandelier(r, 4);
    ch.position.set(cx, y, z);
    g.add(ch);
    box(g, 0.03, ceil - (y + 1.2), 0.03, k.gold, cx, y + 1.2, z);
  }

  // ---- the landings' furniture ----
  // (their colliders: the planters, not the fronds' reach)
  k.put(0, "stairPalm", () => H.palm(7), W + 0.75, -21.3, 0, { solid: false });
  k.rects[0].push([W + 0.3, -21.75, W + 1.2, -20.85]);
  // the head landing is on the casino's floor (drawn with the hall, so it never pops in)
  k.put(0, "stairPalm", () => H.palm(8), W + 0.75, -0.75, 0, { dy: top, solid: false });
  k.rects[1].push([W + 0.3, -1.2, W + 1.2, -0.3]);

  // ---- the doorways, seen from the rooms: gold portals and their signs ----
  // G: behind the Atrium Bar
  const portal = (f: number, [a, b, h]: [number, number, number], depth: number) => {
    const y = LEVELS[f].y,
      gg = k.groups[f];
    const x = E + 0.1;
    for (const zz of [a - 0.14, b + 0.14]) box(gg, depth, h + 0.28, 0.28, k.gold, x + depth / 2, y, zz);
    box(gg, depth, 0.28, b - a + 0.56, k.gold, x + depth / 2, y + h, (a + b) / 2);
    box(gg, 0.04, 0.5, b - a - 0.2, k.dark, x + depth + 0.01, y + h + 0.35, (a + b) / 2);
    k.rects[f].push([E, a - 0.28, x + depth, a], [E, b, x + depth, b + 0.28]);
    return x + depth + 0.06;
  };
  const fx = portal(0, STAIR.footDoor, 0.24);
  k.label(0, "GRAND STAIRCASE", fx, fdh + 0.6, (fd0 + fd1) / 2, { h: 0.26, color: "#f4b728", rot: Math.PI / 2 });
  k.label(0, "▲ 2 · CASINO", fx, fdh + 1.12, (fd0 + fd1) / 2, { h: 0.2, color: "#3ee08f", rot: Math.PI / 2 });
  // 2: by the Lotus bar, a deep portal (it frames the stair hall)
  const hx = portal(1, STAIR.headDoor, 0.5);
  k.label(1, "GRAND STAIRCASE", hx, hdh + 0.6, (hd0 + hd1) / 2, { h: 0.24, color: "#f4b728", rot: Math.PI / 2 });
  k.label(1, "▼ G · GRAND ATRIUM", hx, hdh + 1.1, (hd0 + hd1) / 2, { h: 0.18, color: "#ff9f2e", rot: Math.PI / 2 });
  // and from inside the hall, over each doorway
  k.label(0, "CASINO · 2", E - 0.14, top + hdh + 0.45, (hd0 + hd1) / 2, { h: 0.3, color: "#f4b728", rot: -Math.PI / 2 });
  k.label(0, "GRAND ATRIUM · G", E - 0.14, fdh + 0.45, (fd0 + fd1) / 2, { h: 0.26, color: "#f4b728", rot: -Math.PI / 2 });
}
