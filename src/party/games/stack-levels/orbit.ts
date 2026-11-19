/**
 * CHAIN STACK · ORBIT: four station modules high over the Earth, a truss between them. Up here a
 * block let go keeps the speed it slid at while it floats down: the landing light on the tower's top
 * shows where it will come down. Round it: the blue curve of the planet, the stars, the sun's glare,
 * satellites passing.
 */
import * as THREE from "three";
import { rng } from "../../kit";
import { GEO, canvasTex, glow, skyDome, toon } from "../../k3";
import { tint } from "../../hud";
import { Bobs, Parts, softGlow, stars } from "../sign-levels/parts";
import type { StackCtx, StackLive, StackState } from "./types";

const UP = new THREE.Vector3(0, 1, 0);
const tv = new THREE.Vector3();

export function orbitSet(c: StackCtx): StackLive {
  const { scene, rnd } = c;
  c.hemi.color.set("#dfe6ff");
  c.hemi.groundColor.set("#3a6ab0");
  c.hemi.intensity = 1.5;
  c.sun.color.set("#fff4e0");
  c.sun.intensity = 2.6;
  // (the sun's own light, hard and from straight in front: a block's shadow falls dead under it, black as space)
  c.sun.position.set(5, 40, 30);
  scene.userData.shadowK = 1.2;
  const B = new Parts();

  // (the set's own dice for everything painted and placed here; the old stars keep the game's, as before)
  const cos = rng(0x0b17);
  // ---- the sky: deep space all round (no horizon up here), a dusting of far stars, the galaxy's band
  skyDome(scene, { sky: ["#04031a", "#141048"], ground: "#0c0a30", stars: 900, band: true, haze: 0, rnd: cos });
  // ---- the planet: a great sphere far below, its oceans, its land (coasts, deserts, forests), its
  // weather in streaks and swirls; a thin bright atmosphere
  const earthTex = canvasTex(2048, 1024, (g) => {
    const sea = g.createLinearGradient(0, 0, 0, 1024);
    sea.addColorStop(0, "#2a7ad0");
    sea.addColorStop(0.5, "#1b58b4");
    sea.addColorStop(1, "#2a7ad0");
    g.fillStyle = sea;
    g.fillRect(0, 0, 2048, 1024);
    // the land: a few continents, each a cluster of lobes (a pale coast round it, forest and desert inside)
    const lobes: [number, number, number, number][] = [];
    for (let k = 0; k < 7; k++) {
      const cx = cos() * 2048;
      const cy = 230 + cos() * 560;
      const n = 4 + Math.floor(cos() * 5);
      for (let j = 0; j < n; j++) lobes.push([cx + (cos() - 0.5) * 240, cy + (cos() - 0.5) * 140, 40 + cos() * 70, 24 + cos() * 44]);
    }
    const blob = (x: number, y: number, rx: number, ry: number) => {
      for (const dx of [-2048, 0, 2048]) {
        g.beginPath();
        g.ellipse(x + dx, y, rx, ry, 0, 0, Math.PI * 2);
        g.fill();
      }
    };
    // (sea greens and dusty ochres, close to the ocean's own value: no seat's colour down there)
    g.fillStyle = "#4f9ad8";
    for (const [x, y, rx, ry] of lobes) blob(x, y, rx + 9, ry + 9);
    g.fillStyle = "#2f8a8a";
    for (const [x, y, rx, ry] of lobes) blob(x, y, rx, ry);
    g.fillStyle = "#287a7c";
    for (const [x, y, rx, ry] of lobes) blob(x - rx * 0.2, y + ry * 0.1, rx * 0.55, ry * 0.5);
    g.fillStyle = "#8a9a8a";
    for (let k = 0; k < lobes.length; k += 3) blob(lobes[k][0] + lobes[k][2] * 0.25, lobes[k][1] - lobes[k][3] * 0.2, lobes[k][2] * 0.4, lobes[k][3] * 0.38);
    // the ice at both ends, the weather: long streaks along the latitudes, a few swirls
    g.fillStyle = "#f2f8ff";
    g.fillRect(0, 0, 2048, 60);
    g.fillRect(0, 964, 2048, 60);
    for (let k = 0; k < 40; k++) blob(cos() * 2048, cos() < 0.5 ? 60 : 964, 60 + cos() * 80, 14 + cos() * 16);
    g.fillStyle = "rgba(255,255,255,0.82)";
    for (let k = 0; k < 210; k++) blob(cos() * 2048, 90 + cos() * 844, 26 + cos() * 90, 4 + cos() * 9);
    for (let k = 0; k < 9; k++) {
      const x = cos() * 2048;
      const y = 200 + cos() * 620;
      for (let j = 0; j < 14; j++) {
        const a = j * 0.55;
        const r = 12 + j * 5;
        blob(x + Math.cos(a) * r, y + Math.sin(a) * r * 0.6, 16 - j * 0.7, 7 - j * 0.3);
      }
    }
  });
  // (turned on its side: the cap under the station is the tropics, not the pole where the picture pinches)
  const globe = new THREE.Group();
  globe.position.set(0, -580, -160);
  globe.rotation.set(1.15, 0, 0.35);
  scene.add(globe);
  const earth = new THREE.Mesh(new THREE.SphereGeometry(520, 64, 32), new THREE.MeshToonMaterial({ map: earthTex, gradientMap: toon("#fff").gradientMap, emissive: new THREE.Color("#0a2a5a") }));
  earth.userData.noShadow = true;
  globe.add(earth);
  const air = new THREE.Mesh(new THREE.SphereGeometry(536, 64, 32), new THREE.MeshBasicMaterial({ color: "#6fc4ff", transparent: true, opacity: 0.35, side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false }));
  air.position.copy(globe.position);
  scene.add(air);
  stars(scene, 260, 420, rnd, 0.0);
  // the sun, top right: a white core in a soft warm glare, and a wider faint halo
  const sunAt = new THREE.Vector3(170, 120, -320);
  const glows: THREE.Mesh[] = [];
  for (const [r, col, a] of [
    [12, "#ffffff", 1],
    [46, "#fff1c8", 0.85],
    [130, "#ffcf8a", 0.32],
  ] as const) {
    const m = new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ map: softGlow(), color: col, transparent: true, opacity: a, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    m.scale.setScalar(r);
    m.position.copy(sunAt);
    m.lookAt(0, 0, 0);
    scene.add(m);
    glows.push(m);
  }
  // twinkling stars nearer in, a band of the galaxy's glow
  const tw: { x: number; y: number; z: number; s: number; c: string }[] = [];
  for (let k = 0; k < 60; k++) {
    const a = -Math.PI * 0.9 + rnd() * Math.PI * 0.8;
    tw.push({ x: Math.cos(a) * 260, y: 20 + rnd() * 150, z: Math.sin(a) * 260, s: 1.4 + rnd() * 1.6, c: ["#ffffff", "#bfe0ff", "#ffe8c8", "#d8c8ff"][k % 4] });
  }
  const twinkle = new Bobs(scene, GEO.box, new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false }), tw, { twinkle: 0.9, speed: 0.8 });
  const band = new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ map: softGlow(), color: "#6a5acd", transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  band.scale.set(520, 90, 1);
  band.position.set(-40, 110, -330);
  band.rotation.z = 0.35;
  band.lookAt(0, 30, 0);
  scene.add(band);
  // shooting stars now and then (a streak across the sky)
  const meteors: { m: THREE.Mesh; t: number; vx: number; vy: number }[] = [];
  for (let k = 0; k < 3; k++) {
    const m = new THREE.Mesh(GEO.box, new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    m.visible = false;
    scene.add(m);
    meteors.push({ m, t: 2 + k * 2.7, vx: 0, vy: 0 });
  }

  // ---- the station: solar wings on each module, the truss between them, antennas, beacons
  const tx = c.tx;
  const xs = [...tx].sort((a, b) => a - b);
  for (let k = 0; k < 4; k++) {
    const x = xs[k];
    // (the modules' wings point back, away from the camera, out of the towers' way)
    for (const sz of [-1]) {
      B.box("#9aa4bc", 0.18, 0.18, 3.6, x, -0.75, sz * 3.4, 0.03);
      for (let j = 0; j < 3; j++) {
        B.box("#20408c", 2.6, 0.06, 1.15, x - 1.45, -0.72, sz * (2.4 + j * 1.25), 0.02);
        B.box("#20408c", 2.6, 0.06, 1.15, x + 1.45, -0.72, sz * (2.4 + j * 1.25), 0.02);
        B.lit("#5fa0ff", 2.5, 0.02, 0.05, x - 1.45, -0.66, sz * (2.4 + j * 1.25));
        B.lit("#5fa0ff", 2.5, 0.02, 0.05, x + 1.45, -0.66, sz * (2.4 + j * 1.25));
      }
    }
    // an antenna and a beacon under the module
    B.add("cyl", "#c9cfdc", 0.08, 2.4, 0.08, x + 1.2, -2.4, -0.9, { ink: 0.02 });
    B.add("ball", tint(c.players[tx.indexOf(x)].color, 0.3), 0.32, 0.32, 0.32, x + 1.2, -3.65, -0.9, { lit: true });
    // the docking ring under it
    B.add("cyl", "#c9cfdc", 1.5, 0.5, 1.5, x, -2.1, 0, { ink: 0.04 });
  }
  for (let k = 0; k < 3; k++) {
    const xa = xs[k] + 2.1,
      xb = xs[k + 1] - 2.1;
    const len = xb - xa,
      mx = (xa + xb) / 2;
    for (const [y, z] of [
      [-0.55, 0.45],
      [-0.55, -0.45],
      [-1.35, 0],
    ])
      B.box("#c9cfdc", len, 0.14, 0.14, mx, y - 0.07, z, 0.025);
    const n = Math.round(len / 0.8);
    for (let j = 0; j <= n; j++) {
      const x = xa + (j / n) * len;
      B.add("box", "#aab2c8", 0.08, 0.95, 0.08, x, -0.95, (j % 2 ? 0.22 : -0.22), { rx: j % 2 ? 0.5 : -0.5, ink: 0.015 });
    }
    B.lit("#7ff0ff", len, 0.05, 0.05, mx, -0.5, 0.52);
  }
  // the station's two ends, past the outer modules: a boom to a great solar wing on the left, a boom
  // to the dish and a docked capsule on the right (wider screens see them)
  const xl = xs[0] - 2.1,
    xr = xs[3] + 2.1;
  B.box("#c9cfdc", 9.4, 0.16, 0.16, xl - 4.7, -0.78, -0.3, 0.025);
  B.box("#c9cfdc", 9.4, 0.16, 0.16, xl - 4.7, -1.4, 0.2, 0.025);
  for (let j = 0; j < 9; j++) B.add("box", "#aab2c8", 0.08, 0.8, 0.08, xl - 0.6 - j * 1.05, -1.05, -0.05, { rz: j % 2 ? 0.6 : -0.6, ink: 0.015 });
  for (const sz of [-1, 1])
    for (let j = 0; j < 4; j++) {
      B.box("#20408c", 2.0, 0.07, 5.2, xl - 3.2 - j * 2.15, -0.74, sz * 3.4, 0.02);
      B.lit("#5fa0ff", 2.0, 0.02, 0.05, xl - 3.2 - j * 2.15, -0.66, sz * 3.4);
      B.lit("#5fa0ff", 0.05, 0.02, 5.2, xl - 3.2 - j * 2.15, -0.66, sz * 3.4);
    }
  B.box("#9aa4bc", 0.2, 0.2, 7.4, xl - 6.4, -0.82, 0, 0.03);
  B.box("#c9cfdc", 7.2, 0.16, 0.16, xr + 3.6, -0.78, -0.3, 0.025);
  B.box("#c9cfdc", 7.2, 0.16, 0.16, xr + 3.6, -1.4, 0.2, 0.025);
  for (let j = 0; j < 7; j++) B.add("box", "#aab2c8", 0.08, 0.8, 0.08, xr + 0.6 + j * 1.05, -1.05, -0.05, { rz: j % 2 ? 0.6 : -0.6, ink: 0.015 });
  B.add("cyl", "#e8e2c8", 2.0, 3.4, 2.0, xr + 9, -1.0, 0, { rz: Math.PI / 2, ink: 0.05 });
  B.add("cone", "#c9cfdc", 2.0, 1.4, 2.0, xr + 11.4, -1.0, 0, { rz: -Math.PI / 2, ry: Math.PI / 4, ink: 0.04 });
  B.lit("#ff6b35", 0.3, 2.1, 2.1, xr + 8.2, -2.05, 0);
  B.add("ball", "#7dffb2", 0.34, 0.34, 0.34, xr + 9, 0.2, 0, { lit: true });
  B.box("#c9cfdc", 0.14, 3.0, 0.14, xr + 5.4, -0.7, -1.6, 0.02);
  B.build(scene, c.ink);
  // the dish on its boom (it tracks slowly), an astronaut out on a tether by the solar wing
  const dish = new THREE.Group();
  const bowl = new THREE.Mesh(new THREE.ConeGeometry(1.5, 0.9, 16, 1, true), new THREE.MeshToonMaterial({ color: "#eef2f8", gradientMap: toon("#fff").gradientMap, side: THREE.DoubleSide }));
  bowl.rotation.x = Math.PI;
  bowl.position.y = 0.45;
  const feed = new THREE.Mesh(GEO.box, glow("#ff6b35"));
  feed.scale.set(0.2, 1.1, 0.2);
  feed.position.y = 0.6;
  dish.add(bowl, feed);
  dish.position.set(xr + 5.4, 2.4, -1.6);
  dish.traverse((o) => (o.userData.noShadow = true));
  scene.add(dish);
  const walker = new THREE.Group();
  const A = new Parts();
  A.box("#f4f6fb", 0.5, 0.62, 0.36, 0, -0.31, 0, 0.03);
  A.box("#f4f6fb", 0.44, 0.4, 0.4, 0, 0.32, 0, 0.03);
  A.lit("#ffb02e", 0.3, 0.2, 0.05, 0, 0.42, 0.2);
  A.box("#c9cfdc", 0.4, 0.5, 0.2, 0, -0.25, -0.26, 0.02);
  for (const sx of [-1, 1]) {
    A.add("box", "#f4f6fb", 0.16, 0.5, 0.16, sx * 0.38, 0.05, 0, { rz: sx * 0.9, ink: 0.02 });
    A.add("box", "#f4f6fb", 0.18, 0.5, 0.18, sx * 0.16, -0.5, 0, { rz: sx * 0.25, ink: 0.02 });
  }
  A.build(walker, c.ink);
  walker.position.set(xl - 8.6, 2.2, 1.4);
  walker.traverse((o) => (o.userData.noShadow = true));
  scene.add(walker);
  const tether = new THREE.Mesh(GEO.box, glow("#ffffff", 0.6));
  tether.userData.noShadow = true;
  scene.add(tether);
  const anchor = new THREE.Vector3(xl - 6.4, -0.7, 0);

  // ---- satellites crossing far behind (cosmetic)
  const sats: THREE.Group[] = [];
  for (let k = 0; k < 3; k++) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(GEO.box, toon("#e8e2c8"));
    body.scale.set(1.4, 1.4, 2.2);
    const wing = new THREE.Mesh(GEO.box, toon("#20408c"));
    wing.scale.set(7, 0.08, 1.4);
    const dish = new THREE.Mesh(GEO.cone, toon("#c9cfdc"));
    dish.scale.set(1.6, 0.6, 1.6);
    dish.position.z = 1.4;
    dish.rotation.x = Math.PI / 2;
    const lamp = new THREE.Mesh(GEO.ball, glow(k ? "#ff6b6b" : "#7dffb2"));
    lamp.scale.setScalar(0.4);
    lamp.position.y = 0.9;
    g.add(body, wing, dish, lamp);
    g.position.set(-70 + k * 60, 14 + k * 9, -60 - k * 25);
    g.userData.v = 1.2 + rnd() * 1.2;
    g.userData.y0 = g.position.y;
    scene.add(g);
    sats.push(g);
  }
  return {
    tick(dt: number, s: StackState) {
      const t = s.t;
      earth.rotation.y = t * 0.004;
      twinkle.tick(t);
      dish.rotation.set(Math.sin(t * 0.21) * 0.5 - 0.4, t * 0.15, 0);
      // (the astronaut drifts at the end of the tether, turning over slowly)
      walker.position.set(xl - 8.6 + Math.sin(t * 0.31) * 0.9, 2.3 + Math.sin(t * 0.23 + 1) * 0.7, 1.4 + Math.cos(t * 0.27) * 0.5);
      walker.rotation.set(Math.sin(t * 0.2) * 0.5, t * 0.12, Math.sin(t * 0.17) * 0.6);
      tether.position.copy(walker.position).add(anchor).multiplyScalar(0.5);
      tether.scale.set(0.04, walker.position.distanceTo(anchor), 0.04);
      tether.quaternion.setFromUnitVectors(UP, tv.copy(walker.position).sub(anchor).normalize());
      glows[1].scale.setScalar(46 + Math.sin(t * 2.3) * 2);
      for (const mt of meteors) {
        mt.t -= dt;
        if (mt.t <= 0 && !mt.m.visible) {
          mt.m.visible = true;
          mt.m.position.set(-90 + Math.random() * 180, 60 + Math.random() * 50, -160 - Math.random() * 60);
          mt.vx = (Math.random() < 0.5 ? -1 : 1) * (60 + Math.random() * 40);
          mt.vy = -25 - Math.random() * 20;
          mt.m.rotation.z = Math.atan2(mt.vy, mt.vx);
          mt.m.scale.set(9, 0.35, 0.35);
          mt.t = 0.9;
        } else if (mt.m.visible) {
          mt.m.position.x += mt.vx * dt;
          mt.m.position.y += mt.vy * dt;
          (mt.m.material as THREE.MeshBasicMaterial).opacity = Math.max(0, mt.t / 0.9);
          if (mt.t <= 0) ((mt.m.visible = false), (mt.t = 3 + Math.random() * 5));
        }
      }
      for (let k = 0; k < sats.length; k++) {
        const g = sats[k];
        g.position.x += g.userData.v * dt;
        if (g.position.x > 90) g.position.x = -90;
        g.position.y = g.userData.y0 + Math.sin(t * 0.3 + k) * 1.5;
        g.rotation.z = t * 0.2 + k;
        g.rotation.y = t * 0.1;
      }
    },
  };
}
