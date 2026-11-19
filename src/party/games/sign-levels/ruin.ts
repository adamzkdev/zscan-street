/**
 * PROVE THE BLOCK · SPROUT RUIN: a storm over the ruins of Sprout, Zcash's first shielded pool, long
 * retired. The pads stand on a cracked octagon in a diamond, and when the block says PROVE! the lights go out: each
 * snark's lantern lights the pads round it, and the lightning (thunder first) shows the whole floor
 * for a blink. Round it: the snapped towers, floating rocks with Sprout's broken key statues and
 * their tombstones (SPROUT, BCTV14), the rain.
 */
import * as THREE from "three";
import { rng } from "../../kit";
import { GEO, canvasTex, glow, label, qBlock, skyDome, toon } from "../../k3";
import { Bobs, Fall, Parts, city } from "./parts";
import type { SetCtx, SetLive, SetState } from "./types";
import { blinkers, boxes, cityGrid, cloudDeck, ground, type CityLook } from "./vista";

/** The floor: |x|, |z| ≤ H and |x| + |z| ≤ D (the game's layout reads these). */
export const RUIN_H = 11.6;
export const RUIN_D = 15.6;

const CRACK = "#ff4fd8";
const TEAL = "#3ff2d0";
/** The broken city's streets far under the floor (m). */
const Y0 = -46;
/** The city the day the old keys broke: dark stumps, a window alight here and there, no lamps, no traffic. */
const DEAD_CITY: CityLook = {
  street: "#150f28",
  lots: ["#241b3c", "#2a2046", "#1f1736"],
  park: "#1c1a34",
  walls: ["#3b3352", "#2e2844", "#463c60", "#352f4c", "#51466e"],
  roof: 0.35,
  win: ["#ff9a4a", "#171226"],
  lit: 0.1,
  shine: 1,
  cars: [],
};

function octagon(h: number, d: number) {
  const e = d - h;
  return new THREE.Shape(
    [
      [e, -h],
      [h, -e],
      [h, e],
      [e, h],
      [-e, h],
      [-h, e],
      [-h, -e],
      [-e, -h],
    ].map(([x, z]) => new THREE.Vector2(x, -z)),
  );
}

export function ruinSet(c: SetCtx): SetLive {
  const { scene, table, rnd } = c;
  c.hemi.color.set("#c9b8ff");
  c.hemi.groundColor.set("#2a1f3a");
  c.hemi.intensity = 1.55;
  c.sun.color.set("#e2d4ff");
  c.sun.intensity = 1.7;
  // (a cold light through a gap in the storm, from the front right: the shadows fall back across the floor)
  c.sun.position.set(24, 36, 26);
  scene.userData.shadowK = 0.85;
  const B = new Parts();
  const H = RUIN_H,
    D = RUIN_D;

  // ---- the floor: slate tiles (repeating), the slab under it, the jagged rocks under that
  const tiles = canvasTex(
    256,
    256,
    (g) => {
      g.fillStyle = "#1c1630";
      g.fillRect(0, 0, 256, 256);
      const stone = ["#3a3256", "#352d50", "#3f3660", "#322a4a"];
      for (let j = 0; j < 2; j++)
        for (let i = 0; i < 2; i++) {
          g.fillStyle = stone[(i + j * 2) % 4];
          g.fillRect(i * 128 + 4, j * 128 + 4, 120, 120);
          g.fillStyle = "rgba(255,255,255,0.05)";
          g.fillRect(i * 128 + 8, j * 128 + 7, 112, 6);
          // a hairline crack or two
          g.strokeStyle = "rgba(10,6,24,0.7)";
          g.lineWidth = 2;
          g.beginPath();
          let x = i * 128 + 10 + Math.random() * 100,
            y = j * 128 + 8;
          g.moveTo(x, y);
          for (let k = 0; k < 5; k++) ((x += (Math.random() - 0.5) * 40), (y += 22), g.lineTo(x, y));
          g.stroke();
        }
    },
    true,
  );
  tiles.repeat.set(1 / 4, 1 / 4);
  const floor = new THREE.Mesh(new THREE.ShapeGeometry(octagon(H + 0.8, D + 1.1)).rotateX(-Math.PI / 2), new THREE.MeshToonMaterial({ map: tiles, gradientMap: toon("#fff").gradientMap }));
  floor.position.y = 0.001;
  table.add(floor);
  const slabG = new THREE.ExtrudeGeometry(octagon(H + 0.8, D + 1.1), { depth: 1.5, bevelEnabled: false }).rotateX(-Math.PI / 2);
  slabG.translate(0, -1.5, 0);
  const slab = new THREE.Mesh(slabG, toon("#2b2342"));
  table.add(slab);
  const slabInkG = new THREE.ExtrudeGeometry(octagon(H + 0.95, D + 1.3), { depth: 1.65, bevelEnabled: false }).rotateX(-Math.PI / 2);
  slabInkG.translate(0, -1.57, 0);
  table.add(new THREE.Mesh(slabInkG, c.ink));
  for (let k = 0; k < 13; k++) {
    const a = rnd() * Math.PI * 2,
      r = rnd() * 8;
    const w = 3 + rnd() * 4,
      h = 4 + rnd() * 7;
    // (hanging under the slab: their bases at its bottom)
    B.add("cone", k % 3 ? "#2b2342" : "#3a2f58", w, h, w, Math.cos(a) * r, -1.5 - h / 2 + 0.1, Math.sin(a) * r, { rx: Math.PI, ry: rnd(), ink: 0.06 });
  }
  // the glowing cracks across the floor (between the pads), and the broken low wall at the edge
  const crack = (x0: number, z0: number, ang: number, n: number, col: string) => {
    let x = x0,
      z = z0,
      a = ang;
    for (let k = 0; k < n; k++) {
      const l = 0.6 + rnd() * 0.9;
      const nx = x + Math.cos(a) * l,
        nz = z + Math.sin(a) * l;
      if (Math.abs(nx) > H - 0.3 || Math.abs(nz) > H - 0.3 || Math.abs(nx) + Math.abs(nz) > D - 0.4) break;
      B.add("box", col, l + 0.06, 0.02, 0.09, (x + nx) / 2, 0.012, (z + nz) / 2, { lit: true, ry: -a });
      x = nx;
      z = nz;
      a += (rnd() - 0.5) * 1.3;
    }
  };
  // (out of the pinch points between the pads, and in from the edge)
  for (const [x, z] of [
    [4.1, 0],
    [-4.1, 0],
    [0, 4.1],
    [0, -4.1],
    [8.2, 4.1],
    [-8.2, -4.1],
    [-4.1, 8.2],
    [4.1, -8.2],
  ])
    crack(x, z, rnd() * Math.PI * 2, 6 + Math.floor(rnd() * 4), rnd() < 0.5 ? CRACK : TEAL);
  const e = D - H;
  const wallPts: [number, number][] = [
    [e, -H],
    [H, -e],
    [H, e],
    [e, H],
    [-e, H],
    [-H, e],
    [-H, -e],
    [-e, -H],
  ];
  for (let k = 0; k < 8; k++) {
    const [ax, az] = wallPts[k],
      [bx, bz] = wallPts[(k + 1) % 8];
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(2, Math.round(len / 1.4));
    const ang = Math.atan2(bz - az, bx - ax);
    // (just outside the line the snarks keep in)
    const ox = Math.sin(ang) * 0.35,
      oz = -Math.cos(ang) * 0.35;
    // (the front edge stays open: the start line)
    if (k === 3) continue;
    for (let j = 0; j < n; j++) {
      if (rnd() < 0.3) continue;
      const u = (j + 0.5) / n;
      const h = 0.25 + rnd() * 0.7;
      B.add("box", rnd() < 0.5 ? "#4a3f6e" : "#3d3460", len / n - 0.12, h, 0.45, ax + (bx - ax) * u + ox, h / 2, az + (bz - az) * u + oz, { ry: -ang + (rnd() - 0.5) * 0.15, rz: (rnd() - 0.5) * 0.2, ink: 0.04 });
    }
  }
  // the start line: a lit strip at the open front edge
  B.add("box", TEAL, 2 * e - 0.6, 0.03, 0.12, 0, 0.015, H - 0.1, { lit: true });

  // ---- two floating rocks: a snapped pillar, a giant broken key, a tombstone each
  const keyM = toon("#b98a4a");
  for (const sx of [-1, 1]) {
    const x = sx * 17.5,
      z = -4;
    B.add("cone", "#2b2342", 7, 8, 5, x, -5.2, z, { rx: Math.PI, ry: 0.4, ink: 0.06 });
    B.box("#3a3256", 7.2, 1.1, 5.4, x, -1.6, z, 0.06);
    // the pillar's stump and its fallen drum
    B.cyl("#8a7fb0", 0.75, 3.6 + sx * 0.6, x - sx * 2.3, -0.5, z - 1.4, 0.05);
    B.add("cyl", "#8a7fb0", 1.5, 2.6, 1.5, x - sx * 0.6, 0.25, z + 1.5, { rz: Math.PI / 2, ry: 0.5 * sx, ink: 0.05 });
    // the key: its bow (a torus), its shaft broken in two, its bit
    const bow = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.32, 8, 20), keyM);
    bow.position.set(x + sx * 1.6, 1.15, z - 0.4);
    bow.rotation.set(0.3, sx * 0.6, 0.2);
    scene.add(bow);
    B.add("box", "#b98a4a", 2.6, 0.42, 0.42, x + sx * 0.0, 0.0, z - 0.2, { ry: sx * 0.5, rz: sx * 0.35, ink: 0.04 });
    B.add("box", "#a87a3e", 2.2, 0.42, 0.42, x - sx * 1.4, -0.75, z + 0.8, { ry: -sx * 0.4, rz: -sx * 0.15, ink: 0.04 });
    B.add("box", "#a87a3e", 0.42, 0.9, 0.42, x - sx * 2.2, -0.55, z + 1.25, { ry: -sx * 0.4, ink: 0.04 });
    // the tombstone
    B.box("#6e6690", 2.0, 2.6, 0.5, x + sx * 0.4, -1.05, z - 2.2, 0.05, -sx * 0.2);
    const t = label(sx < 0 ? "SPROUT" : "BCTV14", 0.42, "#1a1033", "");
    t.position.set(x + sx * 0.4 - Math.sin(-sx * 0.2) * 0.01, 0.5, z - 2.2 + 0.27);
    t.rotation.y = -sx * 0.2;
    scene.add(t);
    const rip = label("R.I.P.", 0.34, "#1a1033", "");
    rip.position.set(x + sx * 0.4, 1.1, z - 2.2 + 0.27);
    rip.rotation.y = -sx * 0.2;
    scene.add(rip);
  }
  // a Z-Block over each far corner, glowing in the dark
  const qbs: THREE.Object3D[] = [];
  for (const [x, y, z] of [
    [-12.5, 12.5, -10],
    [12.6, 11.6, -11],
  ]) {
    const qb = qBlock(1.5);
    qb.position.set(x, y, z);
    scene.add(qb);
    qbs.push(qb);
  }
  B.build(table, c.ink);

  // ---- the broken city, the rain, the lightning
  // (the far ring of snapped towers: the game's dice, as before; everything nearer has dice of its own)
  city(scene, { r: 215, n: 64, y: Y0, rnd, pal: ["#3b3352", "#2e2844", "#463c60", "#352f4c", "#51466e"], win: ["#ff9a4a", "#1d1730"], lit: 0.14, tall: 1.3, glowK: 0.45, broken: true });
  const cos = rng(0x2d4c);
  // the sky: the storm's own clouds, no star
  skyDome(scene, { sky: ["#0d0820", "#40265a"], ground: "#40265a", clouds: 18, cloud: "#4a3270", cloudShade: "#1c1230", haze: 0.3, rnd: cos });
  ground(scene, Y0 - 1, "#150f28");
  // the dead city under the floor, in blocks: stumps, low under the floor and taller behind the block
  const town = cityGrid(scene, {
    y: Y0,
    x0: -238,
    x1: 238,
    z0: -196,
    z1: 84,
    pitch: 28,
    street: 9,
    tall: (x, z) => 8 + 26 * Math.min(1, Math.max(0, (-z - 20) / 110)) + 9 * Math.abs(Math.sin(x * 0.045 + z * 0.02)),
    rnd: cos,
    look: DEAD_CITY,
    parks: 0.22,
  });
  // the fissures that broke it: glowing cracks along its streets (the floor's own, far bigger), fires
  const lit: [string, number, number, number, number, number, number, number?][] = [];
  const fires: [number, number, number, number, string, number][] = [];
  for (let n = 0; n < 9; n++) {
    let x = -200 + cos() * 400;
    let z = -180 + cos() * 240;
    let a = cos() * Math.PI * 2;
    const col = n % 2 ? CRACK : TEAL;
    for (let k = 0; k < 9; k++) {
      const l = 12 + cos() * 16;
      const nx = x + Math.cos(a) * l;
      const nz = z + Math.sin(a) * l;
      lit.push([col, l + 0.8, 0.5, 1.5, (x + nx) / 2, Y0 + 0.75, (z + nz) / 2, -a]);
      x = nx;
      z = nz;
      a += (cos() - 0.5) * 1.5;
    }
  }
  for (let k = 0; k < 34; k++) fires.push([-220 + cos() * 440, Y0 + 2.2 + cos() * 9, -186 + cos() * 260, 1.6 + cos() * 1.4, k % 3 ? "#ff8a3a" : "#ffc44a", cos() * 1.4]);
  boxes(scene, lit, true);
  const burn = blinkers(scene, fires);
  // storm clouds low over the city, under the floor's level (they drift on the gale)
  const scud = cloudDeck(scene, { n: 12, x0: -170, x1: 170, y0: -30, y1: -18, z0: -150, z1: -40, rnd: cos, color: "#4a3a70", shade: "#241838", speed: 3.2, size: 1.5 });
  const rain = new Fall(scene, 230, new THREE.MeshBasicMaterial({ color: "#a8c8ff", transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false }), { x: 0, z: -1, w: 44, d: 38, y0: -6, y1: 22, v: 26, size: [0.03, 0.9, 0.03] });
  // three bolts (zigzags of light) in the sky behind; one shows at a flash
  const bolts: THREE.InstancedMesh[] = [];
  const bm = glow("#f4e8ff");
  for (let b = 0; b < 3; b++) {
    const n = 8;
    const im = new THREE.InstancedMesh(GEO.box, bm, n);
    let x = -30 + b * 30 + (rnd() - 0.5) * 10,
      y = 40;
    const z = -70 - rnd() * 20;
    const m = new THREE.Matrix4(),
      q = new THREE.Quaternion(),
      p = new THREE.Vector3(),
      s = new THREE.Vector3(),
      eu = new THREE.Euler();
    for (let k = 0; k < n; k++) {
      const nx = x + (rnd() - 0.5) * 10,
        ny = y - 7 - rnd() * 4;
      const len = Math.hypot(nx - x, ny - y);
      eu.set(0, 0, Math.atan2(nx - x, ny - y) * -1);
      q.setFromEuler(eu);
      m.compose(p.set((x + nx) / 2, (y + ny) / 2, z), q, s.set(0.5, len, 0.5));
      im.setMatrixAt(k, m);
      x = nx;
      y = ny;
    }
    im.visible = false;
    im.frustumCulled = false;
    scene.add(im);
    bolts.push(im);
  }
  // embers rising off the cracks (in the floor's frame), rocks drifting round the floor
  const add = (col: string) => new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
  const embersA = new Fall(table, 36, add(CRACK), { x: 0, z: 0, w: 22, d: 22, y0: 0, y1: 6, v: -1.1, size: [0.09, 0.09, 0.09], drift: 0.5 });
  const embersB = new Fall(table, 36, add(TEAL), { x: 0, z: 0, w: 22, d: 22, y0: 0, y1: 6, v: -0.9, size: [0.08, 0.08, 0.08], drift: 0.5 });
  const rocks: { x: number; y: number; z: number; s: number; w: number; h: number; dd: number }[] = [];
  for (let k = 0; k < 18; k++) {
    const a = (k / 18) * Math.PI * 2 + rnd() * 0.3;
    const r = 15 + rnd() * 9;
    rocks.push({ x: Math.cos(a) * r, y: -3 + rnd() * 6, z: Math.sin(a) * r * 0.8 - 2, s: 0.8 + rnd() * 1.4, w: 1 + rnd(), h: 0.6 + rnd() * 0.6, dd: 1 + rnd() });
  }
  const debris = new Bobs(scene, GEO.cone, toon("#3a3256"), rocks, { bob: 0.5, speed: 0.5, spin: 0.6 });
  let bolt = -1;
  return {
    tick(dt: number, st: SetState) {
      const t = st.t;
      rain.tick(dt, t, 1.2, -0.05);
      town.tick(t);
      burn.tick(t * 2.3);
      scud.tick(t);
      embersA.tick(dt, t, 0.2);
      embersB.tick(dt, t, -0.2);
      debris.tick(t);
      for (let k = 0; k < qbs.length; k++) {
        qbs[k].rotation.y = t * (0.9 + k * 0.3);
        qbs[k].position.y = (k ? 11.6 : 12.5) + Math.sin(t * 1.4 + k * 2) * 0.35;
      }
      if (st.flash > 0.3) {
        if (bolt < 0) bolt = Math.floor(Math.random() * bolts.length);
      } else bolt = -1;
      for (let b = 0; b < bolts.length; b++) bolts[b].visible = b === bolt;
    },
  };
}
