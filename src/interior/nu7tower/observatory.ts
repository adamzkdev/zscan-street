import * as THREE from "three";
import { hash } from "../../scene/voxel/model";
import type { PickInfo } from "../types";
import { marbleTex, paint, Surface, type SkyKit } from "../zktowers/kit";
import { bezel, board, cap, F, glow, GOLD, header, hexA, LIFT, LIFT_STYLE, ledBg, neon, NU7, num, Nu7Live, scan, span, VIOLET } from "./shared";

/**
 * 35 · the HALVING OBSERVATORY: an octagon under a star dome, a slit open to the real sky, a big
 * refractor aimed through it. The next halving (block 6,132,390) counted down in blocks and in
 * time; the block subsidy since 2016, before and after NU7 (a third a block, the same an hour);
 * and day by day, blocks against ZEC issued, NU7 in the middle. Glass on five sides, the city
 * 117 metres down.
 */

const f = F.obs;
const CX = 0,
  CZ = -14,
  A = 12;
const RC = A / Math.cos(Math.PI / 8);
const WH = 4.6;

export function observatory(k: SkyKit, live: Nu7Live) {
  // ---- the octagon: its vertices, glass on five sides, the boards on the three to the north ----------
  const v = Array.from({ length: 8 }, (_, i) => {
    const a = Math.PI / 8 + (i * Math.PI) / 4;
    return [CX + Math.cos(a) * RC, CZ + Math.sin(a) * RC] as [number, number];
  });
  // sides i → i+1, their outward normal at π/4 · (i + 1) − π/8 + π/8 = (i + 0.5) · π/4 + π/8
  const solid = new Set([4, 5, 6]);
  for (let i = 0; i < 8; i++) {
    const [ax, az] = v[i],
      [bx, bz] = v[(i + 1) % 8];
    if (i === 1) {
      // the south side: the lifts' wall
      k.wall(f, ax, az, bx, bz, WH, "#1a1522", "polish", 0.4);
    } else if (solid.has(i)) k.wall(f, ax, az, bx, bz, WH, "#1a1522", "polish", 0.4);
    else k.curtain(f, ax, az, bx, bz, WH, "#2a2236", 2.0, { transom: 2.6 });
  }
  // floor: dark stone, a compass rose of gold under the telescope
  const stone = marbleTex(91, "#14101c", "#3a2a5a", 512, 4, 6, 6, "rgba(244,183,40,0.14)");
  const floorGeo = new THREE.CircleGeometry(RC + 0.2, 8, Math.PI / 8);
  floorGeo.rotateX(-Math.PI / 2);
  const fl = new THREE.Mesh(floorGeo, new THREE.MeshStandardMaterial({ map: stone, roughness: 0.15, metalness: 0.15 }));
  stone.repeat.set(6, 6);
  fl.raycast = () => {};
  k.add(f, fl, CX, 0, CZ);
  k.flat(f, 9, 9, new THREE.MeshStandardMaterial({ map: roseTex(), transparent: true, roughness: 0.25, metalness: 0.5, emissive: new THREE.Color("#3a2a08"), emissiveIntensity: 0.5 }), CX, CZ, 0.006);

  // ---- the dome: stars inside, a slit to the north, the ring it sits on --------------------------------
  const R = RC + 0.25;
  const slit = 0.1;
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(R, 72, 36, (3 * Math.PI) / 2 + slit, Math.PI * 2 - slit * 2, 0, Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: starsTex(), side: THREE.BackSide, toneMapped: false, color: new THREE.Color(1.15, 1.15, 1.15) }),
  );
  dome.raycast = () => {};
  k.add(f, dome, CX, WH, CZ);
  const ringGeo = new THREE.RingGeometry(A - 0.6, R + 0.1, 64);
  ringGeo.rotateX(Math.PI / 2);
  const ring = new THREE.Mesh(ringGeo, new THREE.MeshStandardMaterial({ color: "#14101c", roughness: 0.6, side: THREE.DoubleSide }));
  ring.raycast = () => {};
  k.add(f, ring, CX, WH, CZ);
  const lip = new THREE.Mesh(new THREE.TorusGeometry(A - 0.6, 0.06, 8, 96), new THREE.MeshBasicMaterial({ color: new THREE.Color(VIOLET).multiplyScalar(1.8), toneMapped: false }));
  lip.rotation.x = Math.PI / 2;
  lip.raycast = () => {};
  k.add(f, lip, CX, WH - 0.04, CZ);
  // the slit's two ribs, gold, from the rim to the top
  for (const s of [-1, 1]) {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 24; i++) {
      const th = (i / 24) * (Math.PI / 2);
      const phi = (3 * Math.PI) / 2 + s * slit;
      pts.push(new THREE.Vector3(-R * Math.cos(phi) * Math.sin(th), R * Math.cos(th), R * Math.sin(phi) * Math.sin(th)).multiplyScalar(0.995));
    }
    const rib = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 32, 0.06, 6), new THREE.MeshStandardMaterial({ color: GOLD, metalness: 0.95, roughness: 0.2 }));
    rib.raycast = () => {};
    k.add(f, rib, CX, WH, CZ);
  }

  // ---- the refractor --------------------------------------------------------------------------------
  refractor(k);

  // ---- the boards ------------------------------------------------------------------------------------
  const side = (i: number) => {
    const a = (i + 0.5) * (Math.PI / 4) + Math.PI / 8;
    const r = A - 0.32;
    return { x: CX + Math.cos(a) * r, z: CZ + Math.sin(a) * r, ry: Math.atan2(-Math.cos(a), -Math.sin(a)) };
  };
  const n = side(5),
    nw = side(4),
    ne = side(6);
  bezel(k, f, 8.2, 3.4, n.x, 2.3, n.z, n.ry, GOLD);
  board(k, f, 8.2, 3.4, n.x, 2.3, n.z, n.ry, (g, W, Hh) => drawHalving(g, W, Hh, live), 1, 2048);
  bezel(k, f, 8.2, 3.4, nw.x, 2.3, nw.z, nw.ry, VIOLET);
  board(k, f, 8.2, 3.4, nw.x, 2.3, nw.z, nw.ry, (g, W, Hh) => drawSubsidy(g, W, Hh, live), 30, 2048);
  bezel(k, f, 8.2, 3.4, ne.x, 2.3, ne.z, ne.ry, VIOLET);
  board(k, f, 8.2, 3.4, ne.x, 2.3, ne.z, ne.ry, (g, W, Hh) => drawDaily(g, W, Hh, live), 30, 2048);
  const hitOn = (s: { x: number; z: number; ry: number }, hover: string, info: () => PickInfo) => k.hit(f, 8.2, 3.4, 0.4, s.x + Math.sin(s.ry) * 0.2, 0.6, s.z + Math.cos(s.ry) * 0.2, hover, info, s.ry);
  hitOn(n, `<b>Next halving</b><span>block ${num(NU7.halving)}</span>`, () => halvingInfo(live));
  hitOn(nw, `<b>Block subsidy</b><span>per block · per hour · since 2016</span>`, () => subsidyInfo(live));
  hitOn(ne, `<b>Blocks and ZEC issued</b><span>per day · NU7 in the middle</span>`, () => dailyInfo(live));
  const title = neon("半減期観測所 · HALVING OBSERVATORY", 0.36, GOLD);
  k.add(f, title, n.x + Math.sin(n.ry) * 0.05, 4.4, n.z + Math.cos(n.ry) * 0.05, n.ry);

  // ---- the chart table: the halving's progress on a round LED top ------------------------------------
  {
    const TX = 5.6,
      TZ = -17.8;
    k.cyl(f, 0.7, 0.5, 0.85, TX, 0, TZ, "#1c1626", "polish", 32);
    k.cyl(f, 1.45, 1.45, 0.08, TX, 0.85, TZ, "#120e18", "polish", 48);
    k.cyl(f, 1.47, 1.47, 0.03, TX, 0.93, TZ, GOLD, "metal", 48);
    const top = new Surface(1024, 1024, 1.2);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1.32, 64), top.mat);
    disc.rotation.x = -Math.PI / 2;
    disc.raycast = () => {};
    k.add(f, disc, TX, 0.95, TZ);
    const draw = () => top.draw((g, W) => drawGauge(g, W, live));
    draw();
    let acc = 0;
    k.ticks[f].push((dt) => {
      if ((acc += dt) > 3) (acc = 0), draw();
    });
    k.solid(f, TX - 1.5, TZ - 1.5, TX + 1.5, TZ + 1.5);
    k.hit(f, 3, 1.2, 3, TX, 0, TZ, `<b>Halving gauge</b><span>from block ${num(NU7.lastHalving)} to ${num(NU7.halving)}</span>`, () => halvingInfo(live));
  }
  // a reading desk with a lamp and the old charts; benches at the windows
  {
    const DX = -6.8,
      DZ = -17.0;
    k.box(f, 2.0, 0.08, 1.0, DX, 0.76, DZ, "#3a2a1c", "polish", 0.6);
    for (const [ox, oz] of [
      [-0.85, -0.4],
      [0.85, -0.4],
      [-0.85, 0.4],
      [0.85, 0.4],
    ]) {
      const c = Math.cos(0.6),
        s = Math.sin(0.6);
      k.box(f, 0.07, 0.76, 0.07, DX + ox * c + oz * s, 0, DZ - ox * s + oz * c, "#2a1e14", "polish");
    }
    k.box(f, 0.7, 0.01, 0.5, DX - 0.2, 0.84, DZ, "#e8dcc0", "matte", 0.4);
    k.box(f, 0.5, 0.01, 0.4, DX + 0.4, 0.845, DZ + 0.1, "#d8ccb0", "matte", 0.9);
    k.cyl(f, 0.12, 0.1, 0.04, DX + 0.6, 0.84, DZ - 0.25, GOLD, "metal", 16);
    k.cyl(f, 0.015, 0.015, 0.4, DX + 0.6, 0.88, DZ - 0.25, GOLD, "metal", 6);
    k.cyl(f, 0.16, 0.08, 0.14, DX + 0.6, 1.24, DZ - 0.25, "#2a6a3a", "polish", 16);
    k.cyl(f, 0.07, 0.07, 0.02, DX + 0.6, 1.235, DZ - 0.25, "#ffe9c0", "glow", 12);
    k.solid(f, DX - 1.1, DZ - 0.8, DX + 1.1, DZ + 0.8);
  }
  for (const i of [0, 2, 3, 7]) {
    const a = (i + 0.5) * (Math.PI / 4) + Math.PI / 8;
    const r = A - 1.3;
    const x = CX + Math.cos(a) * r,
      z = CZ + Math.sin(a) * r;
    const ry = Math.atan2(Math.cos(a), Math.sin(a));
    k.box(f, 2.6, 0.1, 0.6, x, 0.42, z, "#2a1e14", "polish", ry);
    k.box(f, 2.64, 0.03, 0.64, x, 0.52, z, GOLD, "metal", ry);
    k.box(f, 2.2, 0.42, 0.4, x, 0, z, "#14101c", "polish", ry);
    k.line(f, x - Math.cos(ry) * 1.3, z + Math.sin(ry) * 1.3, x + Math.cos(ry) * 1.3, z - Math.sin(ry) * 1.3, 0.6);
  }

  // ---- the lifts ---------------------------------------------------------------------------------------
  const [lx, lz, lry] = LIFT[f];
  k.lifts(f, lx, lz, lry, LIFT_STYLE);

  // ---- light --------------------------------------------------------------------------------------------
  k.light(f, CX + 4.5, 4.0, CZ + 4.5, "#dfe6ff", 12, 14);
  k.light(f, n.x * 0.7, 3.4, CZ + (n.z - CZ) * 0.7, "#fff1d6", 12, 10);
  k.light(f, nw.x * 0.7, 3.4, CZ + (nw.z - CZ) * 0.7, "#fff1d6", 10, 10);
  k.light(f, ne.x * 0.7, 3.4, CZ + (ne.z - CZ) * 0.7, "#fff1d6", 10, 10);
  k.light(f, 0, 3.4, -5, "#ffe2b8", 10, 12);
  k.light(f, CX, 7, CZ, VIOLET, 10, 16);

  // ---- people ---------------------------------------------------------------------------------------------
  k.onCast(f, () => {
    void k.person(f, 7501, [0.9, -10.9], "Astronomer", {
      face: [-0.4, -1],
      lines: [
        `The next halving: block ${num(NU7.halving)}.`,
        () => {
          const h = live.halving;
          return h.left !== null ? `${num(h.left)} blocks to go.` : "Two years, give or take.";
        },
        () => {
          const h = live.halving;
          return h.eta ? `Around ${new Date(h.eta).toISOString().slice(0, 10)}, at 25 seconds a block.` : "At 25 seconds a block.";
        },
        "A third of the subsidy a block since NU7. The same an hour.",
      ],
    });
    void k.person(f, 7502, [-6.0, -15.8], "Archivist", { face: [-0.4, -1], lines: ["12.5, 6.25, 3.125, 1.5625. And now 0.52083333.", "Every halving on this chart."] });
    const a = k.person(f, 7503, [-3.8, -8.2], "Visitor", { face: [0.6, 1] });
    const b = k.person(f, 7504, [-2.6, -7.6], "Visitor", { face: [-1, -0.2] });
    k.dialog(f, [a, b], [
      [0, "Per block it fell by three at NU7."],
      [1, "And per hour it didn't move. Three times the blocks."],
      [0, () => (live.supply ? `${(live.supply.block_subsidy / 1e8).toFixed(8)} ZEC a block now.` : "0.52083333 a block.")],
      [1, "Next stop: half of that."],
    ]);
  });
}

/** The refractor on its pier: a fork mount, the tube aimed up the slit, a finder, an eyepiece. */
function refractor(k: SkyKit) {
  k.cyl(f, 1.05, 0.85, 1.3, CX, 0, CZ, "#1c1626", "polish", 40);
  k.cyl(f, 0.9, 0.9, 0.06, CX, 1.3, CZ, GOLD, "metal", 40);
  k.cyl(f, 1.08, 1.08, 0.04, CX, 0.06, CZ, VIOLET, "glow", 40);
  k.ring(f, CX, CZ, 1.25);
  // (the eyepiece end hangs over the floor south of the pier)
  k.solid(f, CX - 0.45, CZ + 1.9, CX + 0.45, CZ + 2.8);
  const mount = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: "#2a2632", metalness: 0.7, roughness: 0.35 });
  const gold = new THREE.MeshStandardMaterial({ color: GOLD, metalness: 0.95, roughness: 0.2, envMapIntensity: 1.5 });
  const white = new THREE.MeshStandardMaterial({ color: "#ece8f6", metalness: 0.2, roughness: 0.3 });
  const turn = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.72, 0.3, 40), dark);
  turn.position.y = 0.15;
  mount.add(turn);
  for (const s of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.7, 0.5), dark);
    arm.position.set(s * 0.78, 1.1, 0);
    mount.add(arm);
    const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.1, 24), gold);
    knob.rotation.z = Math.PI / 2;
    knob.position.set(s * 0.92, 1.75, 0);
    mount.add(knob);
  }
  const tube = new THREE.Group();
  tube.position.y = 1.75;
  const L = 6.4;
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, L, 40), white);
  tube.add(body);
  const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.52, 1.2, 40, 1, true), dark);
  shade.position.y = L / 2 + 0.4;
  tube.add(shade);
  for (const y of [-L / 2 + 0.2, -0.4, 0.4, L / 2 - 0.1]) {
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.49, 0.49, 0.12, 40), gold);
    band.position.y = y;
    tube.add(band);
  }
  const lensMat = new THREE.MeshBasicMaterial({ color: new THREE.Color("#5a3a9a").multiplyScalar(1.4), toneMapped: false });
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.44, 40), lensMat);
  lens.rotation.x = -Math.PI / 2;
  lens.position.y = L / 2 + 0.02;
  tube.add(lens);
  const focuser = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 0.6, 20), dark);
  focuser.position.y = -L / 2 - 0.25;
  tube.add(focuser);
  const eye = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.3, 16), gold);
  eye.position.set(0, -L / 2 - 0.5, 0.12);
  eye.rotation.x = 0.8;
  tube.add(eye);
  const finder = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.4, 16), gold);
  finder.position.set(0.5, 0.9, 0.3);
  tube.add(finder);
  // aimed up the slit, to the north
  tube.rotation.x = -0.82;
  mount.add(tube);
  mount.traverse((o) => ((o as THREE.Mesh).raycast = () => {}));
  k.add(f, mount, CX, 1.36, CZ, 0);
  k.ticks[f].push((_dt, t) => {
    // tracking: a slow drift along the slit
    mount.rotation.y = Math.sin(t * 0.05) * 0.04;
    tube.rotation.x = -0.82 + Math.sin(t * 0.031) * 0.12;
    lensMat.color.setScalar(0.5 + 0.15 * Math.sin(t * 0.7)).multiply(new THREE.Color("#7a4aff"));
  });
  k.hit(f, 2.6, 6, 2.6, CX, 0, CZ, `<b>The refractor</b><span>aimed through the slit</span>`, () => ({
    eyebrow: "HALVING OBSERVATORY · refractor",
    title: `Block ${num(NU7.halving)}`,
    mono: true,
    stats: [
      ["Next halving", `#${num(NU7.halving)}`],
      ["Subsidy then", "0.26041666 ZEC"],
      ["Block time", "25 s"],
      ["Last halving", `#${num(NU7.lastHalving)}`],
    ],
  }));
  return mount;
}

// ---- textures ---------------------------------------------------------------------------------------------

function starsTex() {
  const t = paint(2048, 1024, (g, W, H) => {
    const grad = g.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, "#05030b");
    grad.addColorStop(1, "#140c26");
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);
    // a band of the galaxy: soft clouds of violet, gold dust in it
    for (let i = 0; i < 700; i++) {
      const x = hash(i, 1, 9, 3) * W;
      const y = H * 0.35 + Math.sin((x / W) * Math.PI * 2) * H * 0.12 + (hash(i, 2, 9, 3) - 0.5) * H * 0.16;
      const r = 24 + hash(i, 4, 9, 3) * 60;
      const c = g.createRadialGradient(x, y, 0, x, y, r);
      c.addColorStop(0, `rgba(${hash(i, 8, 9, 3) > 0.8 ? "244,183,40" : "150,100,240"},${0.025 + hash(i, 3, 9, 3) * 0.035})`);
      c.addColorStop(1, "rgba(150,100,240,0)");
      g.fillStyle = c;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    for (let i = 0; i < 2600; i++) {
      const x = hash(i, 5, 9, 3) * W,
        y = hash(i, 6, 9, 3) * H;
      const b = hash(i, 7, 9, 3);
      g.fillStyle = b > 0.97 ? "#ffe9b0" : b > 0.9 ? "#d9c6ff" : "rgba(255,255,255,0.75)";
      const s = b > 0.97 ? 3.2 : b > 0.9 ? 2.2 : 1.3;
      g.fillRect(x, y, s, s);
    }
    // seven bright ones, a little constellation: 七
    const seven = [
      [0.42, 0.3],
      [0.47, 0.28],
      [0.52, 0.27],
      [0.45, 0.22],
      [0.46, 0.36],
      [0.49, 0.41],
      [0.53, 0.42],
    ];
    g.strokeStyle = "rgba(244,183,40,0.35)";
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(seven[0][0] * W, seven[0][1] * H);
    g.lineTo(seven[1][0] * W, seven[1][1] * H);
    g.lineTo(seven[2][0] * W, seven[2][1] * H);
    g.moveTo(seven[3][0] * W, seven[3][1] * H);
    g.lineTo(seven[1][0] * W, seven[1][1] * H);
    g.lineTo(seven[4][0] * W, seven[4][1] * H);
    g.lineTo(seven[5][0] * W, seven[5][1] * H);
    g.lineTo(seven[6][0] * W, seven[6][1] * H);
    g.stroke();
    for (const [x, y] of seven) {
      g.fillStyle = "#fff4d0";
      g.shadowColor = GOLD;
      g.shadowBlur = 12;
      g.beginPath();
      g.arc(x * W, y * H, 4, 0, Math.PI * 2);
      g.fill();
    }
    g.shadowBlur = 0;
  });
  return t;
}

function roseTex() {
  return paint(1024, 1024, (g, W) => {
    const c = W / 2;
    g.clearRect(0, 0, W, W);
    g.strokeStyle = GOLD;
    for (const [r, w] of [
      [c - 10, 6],
      [c - 60, 2],
      [c * 0.42, 3],
    ] as const) {
      g.lineWidth = w;
      g.beginPath();
      g.arc(c, c, r, 0, Math.PI * 2);
      g.stroke();
    }
    for (let i = 0; i < 32; i++) {
      const a = (i / 32) * Math.PI * 2;
      const long = i % 8 === 0;
      g.lineWidth = long ? 5 : 2;
      g.strokeStyle = long ? GOLD : hexA(GOLD, 0.5);
      g.beginPath();
      g.moveTo(c + Math.cos(a) * (long ? c * 0.42 : c - 60), c + Math.sin(a) * (long ? c * 0.42 : c - 60));
      g.lineTo(c + Math.cos(a) * (c - 12), c + Math.sin(a) * (c - 12));
      g.stroke();
    }
    g.fillStyle = GOLD;
    g.font = `400 64px "DotGothic16", monospace`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    for (const [s, a] of [
      ["N", -Math.PI / 2],
      ["E", 0],
      ["S", Math.PI / 2],
      ["W", Math.PI],
    ] as const)
      g.fillText(s, c + Math.cos(a) * (c - 34 - 70), c + Math.sin(a) * (c - 34 - 70));
  });
}

// ---- the boards -------------------------------------------------------------------------------------------

function drawHalving(g: CanvasRenderingContext2D, W: number, H: number, live: Nu7Live) {
  ledBg(g, W, H, GOLD);
  const h = live.halving;
  header(g, W, 76, "次の半減期", "NEXT HALVING", GOLD, `#${num(h.height)}`);
  cap(g, "BLOCKS TO GO", 64, 170, 40);
  glow(g, h.left !== null ? num(h.left) : "—", 56, 380, 210, GOLD, "left", 0.3);
  const rows: [string, string][] = [
    ["ETA", h.eta ? new Date(h.eta).toISOString().slice(0, 16).replace("T", " ") : "—"],
    ["IN", h.eta ? span(h.eta - Date.now()) : "—"],
    ["SUBSIDY THEN", "0.26041666"],
  ];
  rows.forEach(([l, v], i) => {
    const y = 170 + i * 120;
    cap(g, l, 1300, y, 36);
    glow(g, v, W - 64, y + 70, 70, i === 2 ? VIOLET : "#efe6ff", "right", 0.25);
  });
  // from the last halving to the next
  const p = live.tip ? Math.max(0, Math.min(1, (live.tip - NU7.lastHalving) / (h.height - NU7.lastHalving))) : 0;
  const x0 = 64,
    x1 = W - 64,
    y = 560;
  g.fillStyle = "rgba(255,255,255,0.06)";
  g.fillRect(x0, y, x1 - x0, 52);
  const grad = g.createLinearGradient(x0, 0, x1, 0);
  grad.addColorStop(0, VIOLET);
  grad.addColorStop(1, GOLD);
  g.fillStyle = grad;
  g.fillRect(x0, y, (x1 - x0) * p, 52);
  // NU7 on the way
  const nx = x0 + ((NU7.height - NU7.lastHalving) / (h.height - NU7.lastHalving)) * (x1 - x0);
  g.fillStyle = "#ffffff";
  g.fillRect(nx - 2, y - 14, 4, 80);
  cap(g, "NU7", nx, y - 22, 30, "#ffffff", "center");
  cap(g, `#${num(NU7.lastHalving)} · 2024-11-23`, x0, y + 96, 32);
  cap(g, `${(p * 100).toFixed(1)} %`, (x0 + x1) / 2, y + 96, 36, GOLD, "center");
  cap(g, `#${num(h.height)}`, x1, y + 96, 32, "#8d84a3", "right");
  scan(g, W, H, 4);
}

interface Era {
  from: number;
  block: number;
  secs: number;
  label: string;
}
function eras(live: Nu7Live): Era[] {
  const at = (n: string, d: string) => Date.parse(live.upgrade(n)?.activated_at ?? d);
  const next = live.halving.eta ?? Date.parse("2028-11-24T00:00:00Z");
  return [
    { from: Date.parse("2016-10-28T00:00:00Z"), block: 12.5, secs: 150, label: "2016" },
    { from: at("Blossom", "2019-12-11T21:50:05Z"), block: 6.25, secs: 75, label: "BLOSSOM" },
    { from: at("Canopy", "2020-11-18T12:34:16Z"), block: 3.125, secs: 75, label: "HALVING" },
    { from: at("Nu6", "2024-11-23T11:02:59Z"), block: 1.5625, secs: 75, label: "HALVING" },
    { from: at("Nu7", "2026-11-06T02:34:02Z"), block: NU7.subsidy, secs: 25, label: "NU7" },
    { from: next, block: NU7.subsidy / 2, secs: 25, label: "HALVING" },
  ];
}

function drawSubsidy(g: CanvasRenderingContext2D, W: number, H: number, live: Nu7Live) {
  ledBg(g, W, H);
  header(g, W, 64, "補助金", "BLOCK SUBSIDY", VIOLET);
  const E = eras(live);
  const t0 = E[0].from,
    t1 = Date.parse("2030-06-01T00:00:00Z");
  const x0 = 210,
    x1 = W - 60;
  const xOf = (t: number) => x0 + ((t - t0) / (t1 - t0)) * (x1 - x0);
  // two panels: ZEC a block and ZEC an hour, both on a log₂ scale (a halving is one step)
  const panels: { y0: number; y1: number; label: string; val: (e: Era) => number; color: string; fmt: (v: number) => string }[] = [
    { y0: 110, y1: 400, label: "ZEC / BLOCK", val: (e) => e.block, color: VIOLET, fmt: (v) => (v >= 1 ? String(v) : v.toFixed(8).replace(/0+$/, "")) },
    { y0: 470, y1: 760, label: "ZEC / HOUR", val: (e) => (e.block * 3600) / e.secs, color: GOLD, fmt: (v) => String(Math.round(v * 10) / 10) },
  ];
  for (const p of panels) {
    const vals = E.map(p.val);
    const hi = Math.log2(Math.max(...vals)) + 0.4,
      lo = Math.log2(Math.min(...vals)) - 0.6;
    const yOf = (v: number) => p.y1 - ((Math.log2(v) - lo) / (hi - lo)) * (p.y1 - p.y0);
    g.fillStyle = "rgba(255,255,255,0.03)";
    g.fillRect(x0, p.y0, x1 - x0, p.y1 - p.y0);
    cap(g, p.label, 40, p.y0 + 40, 34, p.color);
    g.strokeStyle = p.color;
    g.lineWidth = 7;
    g.shadowColor = p.color;
    g.shadowBlur = 14;
    g.beginPath();
    E.forEach((e, i) => {
      const xa = xOf(e.from),
        xb = i + 1 < E.length ? xOf(E[i + 1].from) : x1;
      const y = yOf(p.val(e));
      if (i === 0) g.moveTo(xa, y);
      else g.lineTo(xa, y);
      g.lineTo(xb, y);
    });
    g.stroke();
    g.shadowBlur = 0;
    E.forEach((e, i) => {
      const xa = xOf(e.from),
        xb = i + 1 < E.length ? xOf(E[i + 1].from) : x1;
      const y = yOf(p.val(e));
      const future = e.from > Date.now();
      cap(g, p.fmt(p.val(e)), (xa + xb) / 2, y - 16, 30, future ? "#8d84a3" : "#efe6ff", "center");
    });
  }
  // the eras' marks: NU7 in violet, the next halving dashed
  E.forEach((e, i) => {
    if (!i) return;
    const x = xOf(e.from);
    const nu7 = e.label === "NU7";
    g.strokeStyle = nu7 ? VIOLET : "rgba(255,255,255,0.18)";
    g.lineWidth = nu7 ? 4 : 2;
    if (e.from > Date.now()) g.setLineDash([12, 10]);
    g.beginPath();
    g.moveTo(x, 100);
    g.lineTo(x, 790);
    g.stroke();
    g.setLineDash([]);
    cap(g, e.label, x, 826, 26, nu7 ? VIOLET : "#a99cc8", "center");
    cap(g, new Date(e.from).toISOString().slice(0, 7), x, 856, 24, "#8d84a3", "center");
  });
  cap(g, "2016-10", x0, 856, 24, "#8d84a3", "center");
  // now
  const nx = xOf(Date.now());
  g.fillStyle = "#ffffff";
  g.fillRect(nx - 1, 100, 3, 690);
  scan(g, W, H, 4);
}

function drawDaily(g: CanvasRenderingContext2D, W: number, H: number, live: Nu7Live) {
  ledBg(g, W, H, GOLD);
  header(g, W, 64, "発行 / 日", "BLOCKS · ZEC ISSUED PER DAY", GOLD);
  const d = live.daily.slice(-45);
  if (!d.length) return scan(g, W, H, 4);
  const x0 = 170,
    x1 = W - 170,
    y0 = 120,
    y1 = 760;
  const bw = (x1 - x0) / d.length;
  const maxI = Math.max(...d.map((r) => r.issued)) * 1.15 || 1;
  const maxB = Math.max(...d.map((r) => r.blocks)) * 1.15 || 1;
  // issued: gold bars (no data yet: hatched)
  d.forEach((r, i) => {
    const x = x0 + i * bw;
    const has = r.has_txs !== false && r.issued > 0;
    if (has) {
      const h = (r.issued / maxI) * (y1 - y0);
      g.fillStyle = hexA(GOLD, 0.75);
      g.fillRect(x + bw * 0.15, y1 - h, bw * 0.7, h);
    } else {
      g.fillStyle = "rgba(141,132,163,0.3)";
      for (let y = y1 - 8; y > y1 - 60; y -= 12) g.fillRect(x + bw * 0.3, y, bw * 0.4, 5);
    }
    if (i % 5 === 0) cap(g, r.day.slice(5, 10), x + bw / 2, y1 + 40, 24, "#a99cc8", "center");
  });
  // blocks: a violet line
  g.strokeStyle = VIOLET;
  g.lineWidth = 6;
  g.shadowColor = VIOLET;
  g.shadowBlur = 12;
  g.beginPath();
  d.forEach((r, i) => {
    const x = x0 + i * bw + bw / 2,
      y = y1 - (r.blocks / maxB) * (y1 - y0);
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  });
  g.stroke();
  g.shadowBlur = 0;
  // NU7's day
  const k = d.findIndex((r) => r.day.slice(0, 10) >= NU7.date);
  if (k >= 0) {
    const x = x0 + k * bw;
    g.strokeStyle = "#ffffff";
    g.lineWidth = 3;
    g.setLineDash([12, 10]);
    g.beginPath();
    g.moveTo(x, y0);
    g.lineTo(x, y1);
    g.stroke();
    g.setLineDash([]);
    cap(g, "NU7", x + 10, y0 + 30, 34, "#ffffff");
  }
  // the scales
  const before = d.filter((r) => r.day.slice(0, 10) < NU7.date && r.issued > 0);
  const after = d.filter((r) => r.day.slice(0, 10) > NU7.date && r.has_txs !== false && r.issued > 0);
  const avg = (rows: typeof d, fn: (r: (typeof d)[number]) => number) => (rows.length ? rows.reduce((a, r) => a + fn(r), 0) / rows.length : null);
  cap(g, "BLOCKS", 40, y0 + 30, 28, VIOLET);
  cap(g, num(maxB / 1.15), 40, y0 + 64, 26, "#a99cc8");
  cap(g, "ZEC", W - 40, y0 + 30, 28, GOLD, "right");
  cap(g, num(maxI / 1.15 / 1e8), W - 40, y0 + 64, 26, "#a99cc8", "right");
  const bB = avg(before, (r) => r.blocks),
    bA = avg(after, (r) => r.blocks),
    iB = avg(before, (r) => r.issued),
    iA = avg(after, (r) => r.issued);
  cap(g, bB && bA ? `BLOCKS ${num(bB)} → ${num(bA)}` : "", x0, H - 34, 32, VIOLET);
  cap(g, iB && iA ? `ZEC ${num(iB / 1e8)} → ${num(iA / 1e8)}` : "", x1, H - 34, 32, GOLD, "right");
  scan(g, W, H, 4);
}

function drawGauge(g: CanvasRenderingContext2D, W: number, live: Nu7Live) {
  const c = W / 2;
  g.fillStyle = "#06040b";
  g.fillRect(0, 0, W, W);
  const h = live.halving;
  const p = live.tip ? Math.max(0, Math.min(1, (live.tip - NU7.lastHalving) / (h.height - NU7.lastHalving))) : 0;
  g.lineWidth = 70;
  g.strokeStyle = "rgba(255,255,255,0.07)";
  g.beginPath();
  g.arc(c, c, c - 90, 0, Math.PI * 2);
  g.stroke();
  g.strokeStyle = GOLD;
  g.shadowColor = GOLD;
  g.shadowBlur = 30;
  g.beginPath();
  g.arc(c, c, c - 90, -Math.PI / 2, -Math.PI / 2 + p * Math.PI * 2);
  g.stroke();
  g.shadowBlur = 0;
  // NU7's tick on the ring
  const a = -Math.PI / 2 + ((NU7.height - NU7.lastHalving) / (h.height - NU7.lastHalving)) * Math.PI * 2;
  g.strokeStyle = VIOLET;
  g.lineWidth = 10;
  g.beginPath();
  g.moveTo(c + Math.cos(a) * (c - 140), c + Math.sin(a) * (c - 140));
  g.lineTo(c + Math.cos(a) * (c - 40), c + Math.sin(a) * (c - 40));
  g.stroke();
  glow(g, `${(p * 100).toFixed(1)} %`, c, c + 40, 150, GOLD, "center", 0.3);
  cap(g, h.left !== null ? `${num(h.left)} TO GO` : "", c, c + 130, 54, "#c9bde6", "center");
  cap(g, "半減期", c, c - 130, 64, VIOLET, "center");
  scan(g, W, W, 4);
}

// ---- what a click shows ----------------------------------------------------------------------------------

function halvingInfo(live: Nu7Live): PickInfo {
  const h = live.halving;
  return {
    eyebrow: "HALVING OBSERVATORY",
    title: `Next halving · #${num(h.height)}`,
    mono: true,
    stats: [
      ["Blocks to go", h.left !== null ? num(h.left) : "—"],
      ["ETA", h.eta ? new Date(h.eta).toISOString().slice(0, 10) : "—"],
      ["Subsidy now", `${NU7.subsidy} ZEC`],
      ["Subsidy then", "0.26041666 ZEC"],
    ],
  };
}

function subsidyInfo(live: Nu7Live): PickInfo {
  const E = eras(live);
  return {
    eyebrow: "HALVING OBSERVATORY · block subsidy",
    title: "Per block, per hour",
    stats: [
      ["Before NU7", "1.5625 ZEC · 75 s"],
      ["After NU7", `${NU7.subsidy} ZEC · 25 s`],
      ["Per hour", "75 ZEC · both"],
      ["Next halving", "37.5 ZEC / hour"],
    ],
    body: `<p>${E.map((e) => `${new Date(e.from).toISOString().slice(0, 10)} · ${e.block} ZEC a block · ${e.secs} s · ${(e.block * 3600) / e.secs} ZEC an hour`).join("<br>")}</p>`,
  };
}

function dailyInfo(live: Nu7Live): PickInfo {
  const d = live.daily;
  const before = d.filter((r) => r.day.slice(0, 10) < NU7.date && r.issued > 0);
  const after = d.filter((r) => r.day.slice(0, 10) > NU7.date && r.has_txs !== false && r.issued > 0);
  const avg = (rows: typeof d, fn: (r: (typeof d)[number]) => number) => (rows.length ? rows.reduce((a, r) => a + fn(r), 0) / rows.length : null);
  const f2 = (v: number | null, k = 1) => (v === null ? "—" : num(v / k));
  return {
    eyebrow: "HALVING OBSERVATORY · per day",
    title: "Blocks and ZEC issued",
    stats: [
      ["Blocks / day before", f2(avg(before, (r) => r.blocks))],
      ["Blocks / day after", f2(avg(after, (r) => r.blocks))],
      ["ZEC / day before", f2(avg(before, (r) => r.issued), 1e8)],
      ["ZEC / day after", f2(avg(after, (r) => r.issued), 1e8)],
    ],
  };
}
