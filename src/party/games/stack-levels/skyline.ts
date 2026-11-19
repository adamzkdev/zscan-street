/**
 * CHAIN STACK · ZSTREET SKYLINE's world (the pads and their chain are built in stack.ts): ZStreet
 * far below on a blue day, laid out in blocks (its river and bridges, its parks, the needle on the
 * far bank, traffic in its streets), clouds over it, two tower cranes standing up beside the pads
 * (their jibs slewing, their lamps blinking), hot-air balloons rising past the towers, a flock of
 * birds crossing, the ZStreet blimp cruising behind.
 */
import * as THREE from "three";
import { GEO, glow, label, outline, skyDome, toon } from "../../k3";
import { DAY_CITY, blinkers, boxes, cityGrid, cloudDeck, ground } from "../sign-levels/vista";
import type { StackCtx, StackLive, StackState } from "./types";

/** The city's streets under the pads (m). */
export const CITY_Y = -72;
type Bx = [string, number, number, number, number, number, number, number?];

/** A tower crane standing at (x, z) from the city up to `top`: its lattice mast, its cab; hands back its jib (it slews). */
function crane(scene: THREE.Scene, x: number, z: number, top: number, flip: number, solid: Bx[], lamps: [number, number, number, number, string, number][]) {
  const Y = CITY_Y;
  // the mast: four legs and its bracing (a rung every 4 m), down into the haze
  for (const [dx, dz] of [[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]]) solid.push(["#e8b62a", 0.32, top - Y, 0.32, x + dx, (top + Y) / 2, z + dz]);
  for (let y = top - 2; y > Y + 4; y -= 4) {
    solid.push(["#c99a1c", 2.1, 0.2, 0.2, x, y, z + 0.9], ["#c99a1c", 2.1, 0.2, 0.2, x, y, z - 0.9], ["#c99a1c", 0.2, 0.2, 2.1, x + 0.9, y - 2, z], ["#c99a1c", 0.2, 0.2, 2.1, x - 0.9, y - 2, z]);
  }
  solid.push(["#2b2560", 2.6, 0.5, 2.6, x, top + 0.25, z], ["#f4f1ff", 1.5, 1.5, 1.5, x + flip * 0.2, top + 1.3, z + 1.3]);
  // the jib and its counterweight, turning on the mast's top (one draw: its parts in its own frame)
  const parts: [string, number, number, number, number, number, number][] = [
    ["#e8b62a", 19, 0.3, 0.3, 6.5, 2.0, 0.55],
    ["#e8b62a", 19, 0.3, 0.3, 6.5, 2.0, -0.55],
    ["#e8b62a", 19, 0.3, 0.3, 6.5, 3.0, 0],
    ["#3a3358", 3, 1.6, 1.8, -3.6, 2.2, 0],
    ["#e8b62a", 0.3, 4.4, 0.3, 0, 4.2, 0],
    // the trolley, its cable, the hook's load of girders
    ["#2b2560", 1.2, 0.5, 1.5, 11, 1.6, 0],
    ["#2b2560", 0.1, 7, 0.1, 11, -2.1, 0],
    ["#ff6b35", 2.6, 0.5, 0.5, 11, -5.8, 0],
    ["#c4b1fc", 2.6, 0.5, 0.5, 11, -6.3, 0],
  ];
  for (let k = -2; k <= 15; k += 1.6) parts.push(["#c99a1c", 0.18, 1.1, 1.2, k, 2.5, 0]);
  const jib = new THREE.InstancedMesh(GEO.box, toon("#ffffff"), parts.length);
  const m = new THREE.Matrix4(),
    q = new THREE.Quaternion(),
    col = new THREE.Color();
  parts.forEach(([c, w, h, d, px, py, pz], i) => {
    m.compose(new THREE.Vector3(px, py, pz), q, new THREE.Vector3(w, h, d));
    jib.setMatrixAt(i, m);
    jib.setColorAt(i, col.set(c));
  });
  jib.userData.noShadow = true;
  jib.frustumCulled = false;
  jib.raycast = () => {};
  jib.position.set(x, top + 0.5, z);
  scene.add(jib);
  lamps.push([x, top + 9.2, z, 0.8, "#ff3d5a", x * 0.01]);
  return jib;
}

export function skylineLife(c: StackCtx): StackLive {
  const { scene, rnd } = c;
  const Y = CITY_Y;
  // ---- the sky, the city in its blocks, the river through it
  skyDome(scene, { sky: ["#3f9dff", "#d6f1ff"], ground: "#d6f1ff", clouds: 16, cloud: "#ffffff", cloudShade: "#b9d6f2", haze: 0.5, rnd });
  ground(scene, Y - 1, "#9fb2c8");
  const riverZ = (x: number) => -196 + x * 0.3 + 22 * Math.sin(x * 0.017);
  const town = cityGrid(scene, {
    y: Y,
    x0: -352,
    x1: 352,
    z0: -470,
    z1: -86,
    pitch: 32,
    street: 9,
    keep: (x, z) => Math.abs(z - riverZ(x)) > 26,
    // (downtown behind the pads: its tallest roofs stay well under the pads, so the row stands against the haze and the sky)
    tall: (x, z) => 12 + 34 * Math.exp(-(x * x) / 30000) * Math.exp(-((z + 190) * (z + 190)) / 26000),
    rnd,
    look: DAY_CITY,
    cars: 90,
    carSize: 2.4,
    parks: 0.12,
  });
  const solid: Bx[] = [];
  for (let x = -372; x <= 372; x += 24) {
    const z = riverZ(x);
    const ry = -Math.atan2(riverZ(x + 12) - riverZ(x - 12), 24);
    solid.push(["#62b2ea", 26, 0.5, 38, x, Y + 0.1, z, ry], ["#8ccbf4", 26, 0.5, 16, x, Y + 0.2, z, ry]);
  }
  for (const bx of [-208, -112, -16, 80, 176]) {
    const z = riverZ(bx);
    solid.push(["#eef2f8", 9, 1.4, 56, bx, Y + 3, z], ["#b8c4d4", 2.4, 3.4, 2.4, bx, Y + 1.4, z - 12], ["#b8c4d4", 2.4, 3.4, 2.4, bx, Y + 1.4, z + 12]);
  }
  // the needle on the far bank: a shaft, its saucer, a spire with a lamp
  const nx = 118,
    nz = -262;
  solid.push(["#f4f1ff", 5, 74, 5, nx, Y + 37, nz], ["#c4b1fc", 20, 3.4, 20, nx, Y + 72, nz], ["#2b2560", 16, 2.6, 16, nx, Y + 75, nz], ["#f4f1ff", 9, 5, 9, nx, Y + 78.5, nz], ["#ff6b35", 1.6, 22, 1.6, nx, Y + 92, nz]);
  // ---- the cranes beside the pads (out of the towers' way: beyond the row's ends, a little behind)
  const lamps: [number, number, number, number, string, number][] = [[nx, Y + 104, nz, 2.2, "#ff3d5a", 0.4]];
  // (far enough out and back that, seen from the play camera, they stand clear of the row at any height)
  const jibs = [crane(scene, -41, -27, 17, 1, solid, lamps), crane(scene, 43, -31, 26, -1, solid, lamps)];
  boxes(scene, solid);
  const blink = blinkers(scene, lamps);
  // clouds over the city, well under the pads
  const deck = cloudDeck(scene, { n: 18, x0: -260, x1: 260, y0: -50, y1: -24, z0: -330, z1: -60, rnd, color: "#ffffff", shade: "#c2d8ee", speed: 1.1, size: 2.2 });

  // ---- the balloons: an envelope in stripes, a basket, a flame under it
  const cols = [
    ["#ff6b35", "#ffe14a"],
    ["#3ec6ff", "#ffffff"],
    ["#c4b1fc", "#ff6fd0"],
    ["#6dbf8a", "#ffe14a"],
  ];
  const balloons: { g: THREE.Group; v: number; y0: number; y1: number }[] = [];
  for (let k = 0; k < 4; k++) {
    const g = new THREE.Group();
    const [a, b] = cols[k];
    const env = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 10), toon(a));
    env.scale.set(2.2, 2.6, 2.2);
    outline(env, 0.06);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(2.24, 2.24, 0.9, 12, 1, true), toon(b));
    band.position.y = 0.2;
    const neck = new THREE.Mesh(GEO.cone, toon(a));
    neck.scale.set(1.6, 1.4, 1.6);
    neck.rotation.x = Math.PI;
    neck.position.y = -2.4;
    const basket = new THREE.Mesh(GEO.box, toon("#8a5a32"));
    basket.scale.set(0.7, 0.55, 0.7);
    basket.position.y = -3.8;
    const flame = new THREE.Mesh(GEO.ball, glow("#ffd27a"));
    flame.scale.setScalar(0.35);
    flame.position.y = -3.0;
    g.add(env, band, neck, basket, flame);
    g.position.set(-46 + k * 30 + (rnd() - 0.5) * 8, rnd() * 40, -30 - rnd() * 18);
    scene.add(g);
    balloons.push({ g, v: 0.5 + rnd() * 0.4, y0: -14, y1: 52 });
  }
  // ---- the birds: little chevrons flapping across in a V
  const NB = 9;
  const wing = new THREE.BoxGeometry(0.9, 0.06, 0.22);
  const birds = new THREE.InstancedMesh(wing, new THREE.MeshBasicMaterial({ color: "#2a2a44" }), NB * 2);
  birds.frustumCulled = false;
  scene.add(birds);
  const flock = { x: -70, y: 16, z: -24, v: 3.2 };
  // ---- the blimp
  const blimp = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), toon("#f4f1ff"));
  hull.scale.set(7, 2.2, 2.2);
  outline(hull, 0.08);
  const gond = new THREE.Mesh(GEO.box, toon("#2b2560"));
  gond.scale.set(2.2, 0.7, 0.9);
  gond.position.y = -2.3;
  const fins: THREE.Mesh[] = [];
  for (const [ry, rz] of [
    [0, 0],
    [Math.PI / 2, 0],
  ]) {
    const f = new THREE.Mesh(GEO.box, toon("#ff6b35"));
    f.scale.set(1.6, 2.4, 0.12);
    f.position.x = -6.6;
    f.rotation.set(ry, 0, rz);
    fins.push(f);
  }
  const name = label("ZSTREET", 1.1, "#2b2560", "");
  name.position.set(0, 0.1, 2.25);
  blimp.add(hull, gond, ...fins, name);
  blimp.position.set(40, 26, -52);
  scene.add(blimp);
  const m = new THREE.Matrix4(),
    q = new THREE.Quaternion(),
    e = new THREE.Euler(),
    p = new THREE.Vector3(),
    s = new THREE.Vector3(1, 1, 1),
    out = [new THREE.Matrix4().makeTranslation(-0.42, 0, 0), new THREE.Matrix4().makeTranslation(0.42, 0, 0)];
  return {
    tick(dt: number, st: StackState) {
      const t = st.t;
      town.tick(t);
      deck.tick(t);
      blink.tick(t);
      // (the jibs slew a little, back and forth, never over the pads)
      // (the jib points along +x at rest: turned to swing between straight back and out to its side, away from the row)
      jibs[0].rotation.y = Math.PI * 0.75 + Math.sin(t * 0.12) * 0.36;
      jibs[1].rotation.y = Math.PI * 0.25 + Math.sin(t * 0.1 + 2) * 0.36;
      for (const b of balloons) {
        b.g.position.y += b.v * dt;
        if (b.g.position.y > b.y1) b.g.position.y = b.y0;
        b.g.position.x += Math.sin(t * 0.2 + b.v * 9) * 0.3 * dt;
        b.g.rotation.y = Math.sin(t * 0.3 + b.v * 5) * 0.4;
      }
      flock.x += flock.v * dt;
      if (flock.x > 80) ((flock.x = -80), (flock.y = 8 + rnd() * 22));
      for (let k = 0; k < NB; k++) {
        const row = Math.ceil(k / 2) * (k % 2 ? 1 : -1);
        const bx = flock.x - Math.abs(row) * 1.6,
          by = flock.y + Math.sin(t * 0.8 + k) * 0.3,
          bz = flock.z + row * 1.4;
        const flap = Math.sin(t * 9 + k * 0.7) * 0.6;
        for (const side of [-1, 1]) {
          e.set(0, 0, side * (0.35 + flap));
          q.setFromEuler(e);
          m.compose(p.set(bx, by, bz), q, s);
          // (each wing out to its side)
          m.multiply(out[side > 0 ? 1 : 0]);
          birds.setMatrixAt(k * 2 + (side > 0 ? 1 : 0), m);
        }
      }
      birds.instanceMatrix.needsUpdate = true;
      blimp.position.x -= 1.4 * dt;
      if (blimp.position.x < -70) blimp.position.x = 70;
      blimp.position.y = 26 + Math.sin(t * 0.4) * 0.8;
    },
  };
}
