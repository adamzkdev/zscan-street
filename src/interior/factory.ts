import * as THREE from "three";
import { Market } from "../data/market";
import type { BlockSummary } from "../data/types";
import { get, links, ZScan } from "../data/zscan";
import { Snark, loadArt } from "../scene/snark";
import { hash } from "../scene/voxel/model";
import { MATERIALS } from "../scene/voxel/mesher";
import { barrel, crates as crateProp, vendingMachine } from "../scene/voxel/props";
import { beltTexture, canvasTex, endCap, drawFloor, drawPlate, drawWall as wallTexture, GOLD, hazardSign, JP, makeCanvas, minerName, MONO, neonSign, POOL_COLORS, verticalNeon, type FloorPlan, type MinerRow, type Miners } from "./factory/canvas";
import { drawMonitor, drawWall, WALL_PX, type HallState, type MonitorKind } from "./factory/screens";
import {
  bezelModel,
  CAB,
  cabinetModel,
  columnModel,
  consoleModel,
  conveyorModel,
  crateTexture,
  deskModel,
  elevatorModel,
  fanBladeModel,
  ledSlots,
  lockersModel,
  monitorStand,
  palletModel,
  pipeModel,
  pressModel,
  railingModel,
  ramModel,
  roofModel,
  shutterModel,
  trayModel,
  vox,
  voxGeos,
  wallFanHousing,
  wallFanRotor,
  boxStackModel,
} from "./factory/voxels";
import { makeScene } from "./kit";
import type { Interior, InteriorContext, PickInfo, Rect } from "./types";

/**
 * MINING HALL, inside the Proof Factory. Ground floor: rows of ASIC cabinets (one row per top
 * mining pool, sized by its share of the last week), a block press stamping a gold crate for every
 * real block, a conveyor, a porter who carries each crate to the dispatch bay ("to the bus"), and a
 * live wall. Upper floor: the control-room mezzanine overlooking the hall.
 */

// hall layout (metres)
const X0 = -16,
  X1 = 16,
  Z0 = -22,
  Z1 = 0,
  HH = 10;
const MEZ_Y = 4.5,
  MEZ_Z = -5;
/** Pool rows run along z, two lines of cabinets back to back, from ROW_ZF toward the back wall. */
const ROW_X = [-12.5, -6.5, -0.5, 5.5];
const ROW_ZF = -7.4,
  PITCH = 1.05,
  MAX_CAB = 24;
/** Cross aisle in front of the rows. */
const FRONT_Z = -6.3;
const PRESS = new THREE.Vector3(12.5, 0, -19.7);
const BELT_Z0 = -18.5,
  BELT_Z1 = -12,
  BELT_X = 12.5,
  BELT_Y = 4 / 6 + 0.005;
const END_Z = -12.45;
const PALLET = new THREE.Vector3(15, 0, -8.75);
const BAY: [number, number] = [-10.5, -7];
/** The live wall: it fills the end of the hall (ratio of its canvas, 1920 × 610). */
const SCREEN = { x: -3, y: 5.55, w: 19.5, h: 6.2 };
const CRATE = 0.5;
const LEDS = ledSlots();

const fmt = (n: number, d = 0) => n.toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: d });
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

interface Row {
  letter: string;
  miner: MinerRow;
  name: string;
  color: string;
  share: number;
  n: number;
  x: number;
  /** First instance index of its cabinets. */
  first: number;
  /** Gold flash after it found a block (seconds of `t`). */
  flashUntil: number;
}

interface Crate {
  mesh: THREE.Mesh;
  height: number;
  pool: string | null;
  at: number;
  state: "press" | "belt" | "end" | "carried" | "pallet" | "leaving";
  t: number;
  detail: { tx_count: number; size: number; fees: number | null } | null;
}

export function buildFactory(ctx: InteriorContext): Interior {
  const scene = makeScene(ctx.renderer, "#09080c");
  const hemi = scene.children.find((c) => c instanceof THREE.HemisphereLight) as THREE.HemisphereLight | undefined;
  if (hemi) {
    hemi.intensity = 0.38;
    hemi.color.set("#d8d0ff");
    hemi.groundColor.set("#2a2018");
  }
  scene.fog = new THREE.Fog("#09080c", 26, 60);
  scene.environmentIntensity = 0.22;
  const st: HallState = { miners: null, last: null, recent: [], flashUntil: 0, stamped: 0, porter: "WAITING" };
  const ground: Rect[] = [];
  const upper: Rect[] = [];
  const pickables: THREE.Object3D[] = [];
  const debug = new URLSearchParams(location.search).has("debug");

  // ---- shell -----------------------------------------------------------------------------------
  const floorMat = new THREE.MeshStandardMaterial({ roughness: 0.78, metalness: 0.15, color: "#ffffff" });
  const plan: FloorPlan = {
    x0: X0,
    z0: Z0,
    x1: X1,
    z1: Z1,
    rows: [],
    spare: [],
    hazards: [
      [11, -21.5, 14.2, -18.2],
      [11.7, -18.4, 13.3, -11.8],
      [14, -11, 16, -6.5],
    ],
    walkway: [
      [14.4, -13.4],
      [14.4, -9.8],
      [15.6, -9.8],
    ],
  };
  floorMat.map = drawFloor(plan);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(X1 - X0, Z1 - Z0), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set((X0 + X1) / 2, 0, (Z0 + Z1) / 2);
  scene.add(floor);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(X1 - X0, Z1 - Z0), new THREE.MeshStandardMaterial({ color: "#0d0c11", roughness: 1 }));
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set(0, HH, (Z0 + Z1) / 2);
  scene.add(ceil);

  const wallTex = wallTexture(HH);
  const wallMats = new Map<number, THREE.MeshStandardMaterial>();
  const wallMat = (len: number) => {
    const k = Math.round(len * 4);
    let m = wallMats.get(k);
    if (!m) {
      const t = wallTex.clone();
      t.repeat.set(len / 8, 1);
      t.needsUpdate = true;
      m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.7, metalness: 0.3 });
      wallMats.set(k, m);
    }
    return m;
  };
  /** Wall from (x0,z0) to (x1,z1), axis aligned, from y0 to y1; collider on `rects`. */
  const wall = (x0: number, z0: number, x1: number, z1: number, y0 = 0, y1 = HH, rects: Rect[][] = [ground, upper]) => {
    const alongX = z0 === z1;
    const len = alongX ? Math.abs(x1 - x0) : Math.abs(z1 - z0);
    const m = new THREE.Mesh(new THREE.BoxGeometry(alongX ? len : 0.3, y1 - y0, alongX ? 0.3 : len), wallMat(len));
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    scene.add(m);
    const r: Rect = alongX ? [Math.min(x0, x1), z0 - 0.15, Math.max(x0, x1), z0 + 0.15] : [x0 - 0.15, Math.min(z0, z1), x0 + 0.15, Math.max(z0, z1)];
    for (const list of rects) list.push(r);
  };
  wall(X0 - 0.15, Z0, X0 - 0.15, Z1);
  wall(X0, Z0 - 0.15, X1, Z0 - 0.15);
  wall(X0, Z1 + 0.15, X1, Z1 + 0.15);
  wall(X1 + 0.15, Z0, X1 + 0.15, BAY[0]);
  wall(X1 + 0.15, BAY[1], X1 + 0.15, Z1);
  wall(X1 + 0.15, BAY[0], X1 + 0.15, BAY[1], 3.6, HH, []);
  ground.push([X1, BAY[0], X1 + 0.3, BAY[1]]);

  // roof trusses and high-bay lamps (one voxel model over the whole hall)
  const lampsAt: [number, number][] = [];
  for (const x of [-9.5, -3.5, 2.5]) for (const z of [-19, -14, -9]) lampsAt.push([x, z]);
  lampsAt.push([9, -12], [14, -15], [-14.6, -14]);
  const roof = vox(roofModel((X1 - X0) * 6, (Z1 - Z0) * 6, lampsAt.map(([x, z]) => [Math.round((x - X0) * 6), Math.round((z - Z0) * 6)])));
  roof.position.set((X0 + X1) / 2, HH - 2, (Z0 + Z1) / 2);
  scene.add(roof);

  // ---- lights (7 point lights; everything else glows by emissive strips) -----------------------
  const pressLight = new THREE.PointLight(GOLD, 0, 10, 1.4);
  pressLight.position.set(PRESS.x - 1, 2.2, PRESS.z + 2);
  const screenLight = new THREE.PointLight("#8fd0ff", 14, 16, 1.2);
  screenLight.position.set(SCREEN.x, 4.6, Z0 + 3);
  const bayLight = new THREE.PointLight("#ffc46a", 11, 10, 1.3);
  bayLight.position.set(15, 2.6, -8.75);
  const mezLight = new THREE.PointLight("#a8c8ff", 14, 14, 1.2);
  mezLight.position.set(0, 7.2, -2.5);
  const lobbyLight = new THREE.PointLight("#ffd8a0", 10, 10, 1.3);
  lobbyLight.position.set(-4, 3.6, -2.4);
  scene.add(pressLight, screenLight, bayLight, mezLight, lobbyLight);
  for (const x of [-8, 4]) {
    const l = new THREE.PointLight("#ffe6c4", 34, 26, 1.1);
    l.position.set(x, 7, -13);
    scene.add(l);
  }

  // ---- the live wall ---------------------------------------------------------------------------
  const wallCanvas = makeCanvas(WALL_PX.w, WALL_PX.h);
  const wallScreenTex = canvasTex(wallCanvas.c);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(SCREEN.w, SCREEN.h), new THREE.MeshBasicMaterial({ map: wallScreenTex, toneMapped: false, color: new THREE.Color(1.25, 1.25, 1.25) }));
  screen.position.set(SCREEN.x, SCREEN.y, Z0 + 0.12);
  scene.add(screen);
  pickables.push(screen);
  const bezel = vox(bezelModel(Math.round(SCREEN.w * 6), Math.round(SCREEN.h * 6)));
  bezel.position.set(SCREEN.x, SCREEN.y - SCREEN.h / 2 - 1 / 6, Z0 - 0.05);
  scene.add(bezel);
  // header neon above it

  // vertical neons and hazard placards on the back wall
  const vn1 = verticalNeon("採掘中", "#ff3ad0", 0.7);
  vn1.position.set(-14.4, 4.6, Z0 + 0.12);
  const vn2 = verticalNeon("高電圧", "#4ad0ff", 0.6);
  vn2.position.set(8.2, 4.4, Z0 + 0.12);
  const vn3 = verticalNeon("ブロック", GOLD, 0.55);
  vn3.position.set(X1 - 0.02, 4.9, -14.5);
  vn3.rotation.y = -Math.PI / 2;
  scene.add(vn1, vn2, vn3);
  const hz = [hazardSign("volt", "高電圧", "HIGH VOLTAGE"), hazardSign("press", "挟まれ注意", "CRUSH HAZARD"), hazardSign("fan", "回転注意", "MOVING BLADES"), hazardSign("volt", "危険", "DANGER")];
  hz[0].position.set(7.2, 1.7, Z0 + 0.12);
  hz[1].position.set(10.4, 1.7, Z0 + 0.12);
  hz[2].position.set(X0 + 0.12, 1.7, -14);
  hz[2].rotation.y = Math.PI / 2;
  hz[3].position.set(X0 + 0.12, 1.7, -19.5);
  hz[3].rotation.y = Math.PI / 2;
  scene.add(...hz);

  // ---- wall fans, pipes, columns ---------------------------------------------------------------
  const rotors: THREE.Object3D[] = [];
  const housing = wallFanHousing(),
    rotorM = wallFanRotor();
  for (const z of [-8.5, -13.5, -18.5]) {
    const h = vox(housing);
    h.rotation.y = Math.PI / 2;
    h.position.set(X0 + 0.25, 4.6, z);
    const r = vox(rotorM);
    r.position.set(0, 0.0, 0);
    const pivot = new THREE.Group();
    pivot.position.set(X0 + 0.3, 4.6 + 7 / 6, z);
    pivot.rotation.y = Math.PI / 2;
    r.position.set(0, -5 / 6, 0);
    pivot.add(r);
    scene.add(h, pivot);
    rotors.push(pivot);
  }
  for (const [y, color] of [
    [9.55, "#8a2a26"],
    [9.2, "#2a6a4a"],
    [8.85, "#6e6a78"],
  ] as [number, string][]) {
    const back = vox(pipeModel((X1 - X0) * 6, color));
    back.position.set(0, y, Z0 + 0.35);
    const left = vox(pipeModel((Z1 - Z0 - 5) * 6, color));
    left.rotation.y = Math.PI / 2;
    left.position.set(X0 + 0.35, y, (Z0 + MEZ_Z) / 2);
    scene.add(back, left);
  }
  // pipe drops beside the press
  for (const [x, c] of [
    [14.6, "#8a2a26"],
    [15.0, "#2a6a4a"],
  ] as [number, string][]) {
    const d = vox(pipeModel(42, c));
    d.rotation.z = Math.PI / 2;
    d.position.set(x, 3.5, Z0 + 0.35);
    scene.add(d);
  }
  const colM = columnModel(Math.round(MEZ_Y * 6) - 2);
  for (const x of ROW_X) {
    const c = vox(colM);
    c.position.set(x, 0, MEZ_Z + 0.05);
    scene.add(c);
    ground.push([x - 0.3, MEZ_Z - 0.25, x + 0.3, MEZ_Z + 0.35]);
  }

  // ---- production line -------------------------------------------------------------------------
  const press = vox(pressModel());
  press.position.copy(PRESS);
  scene.add(press);
  const ram = vox(ramModel());
  ram.position.set(PRESS.x, 2.45, PRESS.z);
  scene.add(ram);
  ground.push([PRESS.x - 1.4, Z0, PRESS.x + 1.4, PRESS.z + 1.2]);
  const cons = vox(consoleModel());
  cons.position.set(PRESS.x - 2.2, 0, PRESS.z + 1.6);
  cons.rotation.y = 0.5;
  scene.add(cons);
  ground.push([PRESS.x - 2.9, PRESS.z + 1.1, PRESS.x - 1.5, PRESS.z + 2.1]);
  const pressSign = neonSign([{ text: "BLOCK PRESS", font: MONO(54, 800) }, { text: "ブロック製造機", font: JP(44) }], { color: GOLD, w: 2.4, h: 0.8, bg: "#0b0a0e" });
  pressSign.position.set(PRESS.x, 5.2, PRESS.z);
  scene.add(pressSign);

  const beltLen = Math.round((BELT_Z1 - BELT_Z0) * 6);
  const conveyor = vox(conveyorModel(beltLen));
  conveyor.position.set(BELT_X, 0, (BELT_Z0 + BELT_Z1) / 2);
  scene.add(conveyor);
  const beltTex = beltTexture();
  beltTex.repeat.set(1, (BELT_Z1 - BELT_Z0) / 0.9);
  const belt = new THREE.Mesh(new THREE.PlaneGeometry(5 / 6, BELT_Z1 - BELT_Z0), new THREE.MeshStandardMaterial({ map: beltTex, roughness: 0.9 }));
  belt.rotation.x = -Math.PI / 2;
  belt.position.set(BELT_X, BELT_Y, (BELT_Z0 + BELT_Z1) / 2);
  scene.add(belt);
  ground.push([BELT_X - 0.6, BELT_Z0, BELT_X + 0.6, BELT_Z1]);

  // dispatch bay: shutter, the light of the street outside, the pallet
  const shut = vox(shutterModel(21, 22, 6));
  shut.rotation.y = -Math.PI / 2;
  shut.position.set(X1 + 0.1, 0, (BAY[0] + BAY[1]) / 2);
  scene.add(shut);
  const outside = (() => {
    // the loading dock at night: wet asphalt, a lamp, the block bus waiting with its lights on
    const { c, g } = makeCanvas(384, 384);
    const gr = g.createLinearGradient(0, 0, 0, 384);
    gr.addColorStop(0, "#07070d");
    gr.addColorStop(0.55, "#141226");
    gr.addColorStop(0.62, "#2a2016");
    gr.addColorStop(1, "#0d0b08");
    g.fillStyle = gr;
    g.fillRect(0, 0, 384, 384);
    // the bus: dark body, a row of lit gold windows, a destination board
    g.fillStyle = "#1c1a22";
    g.fillRect(20, 150, 344, 120);
    g.fillStyle = "#f4b728";
    for (let x = 34; x < 340; x += 52) g.fillRect(x, 172, 40, 42);
    g.fillStyle = "#ffe08a";
    g.fillRect(34, 156, 120, 10);
    g.fillStyle = "#0b0a0e";
    g.fillRect(50, 255, 46, 40);
    g.fillRect(280, 255, 46, 40);
    g.fillStyle = "#e8e0c8";
    g.font = MONO(14, 800);
    g.fillText("BLOCK BUS", 40, 165);
    // reflections on the wet ground
    g.fillStyle = "rgba(244,183,40,0.25)";
    for (let x = 34; x < 340; x += 52) g.fillRect(x, 300, 40, 50);
    // lamp glow
    const lg = g.createRadialGradient(330, 60, 0, 330, 60, 120);
    lg.addColorStop(0, "rgba(255,210,140,0.9)");
    lg.addColorStop(1, "rgba(255,210,140,0)");
    g.fillStyle = lg;
    g.fillRect(200, 0, 184, 200);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(BAY[1] - BAY[0], 3.6), new THREE.MeshBasicMaterial({ map: canvasTex(c), toneMapped: false, color: new THREE.Color(1.4, 1.4, 1.4) }));
    m.rotation.y = -Math.PI / 2;
    m.position.set(X1 + 0.9, 1.8, (BAY[0] + BAY[1]) / 2);
    return m;
  })();
  scene.add(outside);
  const busSign = neonSign([{ text: "TO THE BUS →", font: MONO(70, 800) }, { text: "バス行き · 出荷", font: JP(52) }], { color: GOLD, w: 3.2, h: 0.95, bg: "#0b0a0e" });
  busSign.rotation.y = -Math.PI / 2;
  busSign.position.set(X1 - 0.02, 4.3, (BAY[0] + BAY[1]) / 2);
  scene.add(busSign);
  const pallet = vox(palletModel());
  pallet.position.copy(PALLET);
  scene.add(pallet);
  ground.push([PALLET.x - 0.7, PALLET.z - 0.7, PALLET.x + 0.7, PALLET.z + 0.7]);
  for (const [x, z, k] of [
    [14.3, -5.8, 0],
    [15.2, -5.7, 1],
    [15.3, -12.1, 2],
  ]) {
    const b = vox(barrel(k === 1 ? "#8a2a26" : "#3a5a8a").model);
    b.position.set(x, 0, z);
    scene.add(b);
    ground.push([x - 0.35, z - 0.35, x + 0.35, z + 0.35]);
  }
  const stock = vox(crateProp(7).model);
  stock.position.set(10.4, 0, -21.2);
  scene.add(stock);

  // ---- mezzanine (control room) ----------------------------------------------------------------
  const plateTex = drawPlate();
  plateTex.repeat.set((X1 - X0) / 1.5, (Z1 - MEZ_Z) / 1.5);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(X1 - X0, 0.3, Z1 - MEZ_Z), [
    new THREE.MeshStandardMaterial({ color: "#1c1b22" }),
    new THREE.MeshStandardMaterial({ color: "#1c1b22" }),
    new THREE.MeshStandardMaterial({ map: plateTex, roughness: 0.55, metalness: 0.5 }),
    new THREE.MeshStandardMaterial({ color: "#16151b" }),
    new THREE.MeshStandardMaterial({ color: "#1c1b22" }),
    new THREE.MeshStandardMaterial({ color: "#1c1b22" }),
  ]);
  deck.position.set(0, MEZ_Y - 0.15, (MEZ_Z + Z1) / 2);
  scene.add(deck);
  // light strips under the deck
  const stripM = new THREE.MeshBasicMaterial({ color: new THREE.Color("#fff0d2").multiplyScalar(1.6), toneMapped: false });
  for (const z of [-1.5, -3.6]) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(X1 - X0 - 2, 0.04, 0.12), stripM);
    s.position.set(0, MEZ_Y - 0.32, z);
    scene.add(s);
  }
  const railing = vox(railingModel((X1 - X0) * 12), 0.5);
  railing.position.set(0, MEZ_Y, MEZ_Z + 0.1);
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(X1 - X0, 5 / 6), new THREE.MeshStandardMaterial({ color: "#7fd3ff", transparent: true, opacity: 0.12, roughness: 0.05, metalness: 0.6, side: THREE.DoubleSide, depthWrite: false }));
  glass.position.set(0, MEZ_Y + 0.6, MEZ_Z + 0.1);
  scene.add(railing, glass);
  upper.push([X0, MEZ_Z - 0.1, X1, MEZ_Z + 0.25]);
  const fascia = neonSign([{ text: "採掘場 ─ MINING HALL ─ 証明工場", font: JP(70, 900) }], { color: "#ff3ad0", w: 9, h: 0.7, bg: "#0b0a0e" });
  fascia.rotation.y = Math.PI;
  fascia.position.set(-2, MEZ_Y - 0.75, MEZ_Z - 0.06);
  scene.add(fascia);
  const ctrl = neonSign([{ text: "制御室  CONTROL ROOM", font: JP(70, 900) }], { color: "#4ad0ff", w: 6, h: 0.7, bg: "#0b0a0e" });
  ctrl.rotation.y = Math.PI;
  ctrl.position.set(-3, MEZ_Y + 2.6, Z1 - 0.02);
  scene.add(ctrl);

  // elevators, both levels
  for (const y of [0, MEZ_Y]) {
    const e = vox(elevatorModel());
    e.rotation.y = Math.PI;
    e.position.set(12, y, Z1 - 0.05);
    scene.add(e);
    const lab = neonSign([{ text: y ? "EV · 1F" : "EV · G", font: MONO(60, 800) }], { color: GOLD, w: 1.1, h: 0.35 });
    lab.rotation.y = Math.PI;
    lab.position.set(12, y + 3.3, Z1 - 0.04);
    scene.add(lab);
  }

  // desks and their monitors
  const monitors: { kind: MonitorKind; g: CanvasRenderingContext2D; tex: THREE.CanvasTexture; mesh: THREE.Mesh }[] = [];
  const kinds: MonitorKind[][] = [
    ["leaderboard", "blocks"],
    ["nakamoto", "network"],
    ["recent", "line"],
  ];
  const stand = monitorStand();
  [-7, 0, 7].forEach((x, i) => {
    const d = vox(deskModel(i), 0.5);
    d.position.set(x, MEZ_Y, -4.1);
    scene.add(d);
    upper.push([x - 1.25, -4.55, x + 1.25, -3.65]);
    kinds[i].forEach((kind, j) => {
      const { c, g } = makeCanvas(512, 288);
      const tex = canvasTex(c);
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.05, 0.59), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, color: new THREE.Color(1.15, 1.15, 1.15) }));
      const back = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.64, 0.04), new THREE.MeshStandardMaterial({ color: "#121117", roughness: 0.5 }));
      const grp = new THREE.Group();
      mesh.position.z = 0.022;
      grp.add(back, mesh);
      const dx = j ? 0.56 : -0.56;
      grp.position.set(x + dx, MEZ_Y + 0.75 + 0.1 + 0.32, -4.32);
      grp.rotation.y = j ? -0.18 : 0.18;
      grp.rotation.x = -0.08;
      const sv = vox(stand, 0.5);
      sv.position.set(x + dx, MEZ_Y + 0.75, -4.38);
      scene.add(grp, sv);
      mesh.userData.monitor = kind;
      pickables.push(mesh);
      monitors.push({ kind, g, tex, mesh });
    });
  });
  // a chair-height stool row and a coffee machine
  const vend = vox(vendingMachine("white").model);
  vend.rotation.y = Math.PI;
  vend.position.set(-13.5, MEZ_Y, -0.45);
  scene.add(vend);
  upper.push([-14.2, -0.9, -12.8, 0]);

  // ---- lobby under the mezzanine ---------------------------------------------------------------
  const lockers = vox(lockersModel(8), 0.5);
  lockers.rotation.y = Math.PI;
  lockers.position.set(-11.5, 0, -0.3);
  scene.add(lockers);
  ground.push([-13.6, -0.6, -9.4, 0]);
  for (const [x, th] of [
    [-7.4, "blue"],
    [-6.5, "red"],
  ] as [number, "blue" | "red"][]) {
    const v = vox(vendingMachine(th).model);
    v.rotation.y = Math.PI;
    v.position.set(x, 0, -0.45);
    scene.add(v);
  }
  ground.push([-8, -0.9, -5.9, 0]);
  const door = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.6, 0.08), new THREE.MeshStandardMaterial({ color: "#121117", roughness: 0.4, metalness: 0.6 }));
  door.position.set(0, 1.3, Z1 - 0.02);
  scene.add(door);
  const exit = neonSign([{ text: "出口 EXIT", font: JP(64, 900) }], { color: "#3ddc97", w: 1.4, h: 0.4 });
  exit.rotation.y = Math.PI;
  exit.position.set(0, 2.95, Z1 - 0.04);
  scene.add(exit);

  // ---- cabinet rows (from /v1/miners) ----------------------------------------------------------
  const rows: Row[] = [];
  const cabRow: number[] = [];
  const cabPos: THREE.Vector3[] = [];
  const cabSide: number[] = [];
  let leds: THREE.InstancedMesh | null = null;
  let fans: THREE.InstancedMesh | null = null;
  const ledColor = new THREE.Color();
  const C_GREEN = new THREE.Color("#3ddc97").multiplyScalar(2.2),
    C_DIM = new THREE.Color("#0c3a28"),
    C_AMBER = new THREE.Color("#ffb02a").multiplyScalar(2.4),
    C_RED = new THREE.Color("#ff2a2a").multiplyScalar(2.6),
    C_GOLD = new THREE.Color(GOLD).multiplyScalar(3),
    C_CYAN = new THREE.Color("#4ad0ff").multiplyScalar(2.4);

  function buildRows(m: Miners) {
    const top = m.miners.slice(0, ROW_X.length);
    const tot = m.total_blocks || 1;
    const max = top[0]?.blocks || 1;
    let first = 0;
    top.forEach((mm, i) => {
      const n = Math.max(4, Math.round((MAX_CAB * mm.blocks) / max));
      rows.push({ letter: "ABCD"[i], miner: mm, name: minerName(mm), color: POOL_COLORS[i], share: mm.blocks / tot, n, x: ROW_X[i], first, flashUntil: 0 });
      first += n;
    });
    const N = first;
    const geos = voxGeos(cabinetModel(), 0.5);
    const solid = new THREE.InstancedMesh(geos.solid!, MATERIALS.solid, N);
    const emit = new THREE.InstancedMesh(geos.emit!, MATERIALS.emit, N);
    const strip = new THREE.InstancedMesh(new THREE.BoxGeometry(0.84, 0.045, 0.02), new THREE.MeshBasicMaterial({ toneMapped: false }), N);
    leds = new THREE.InstancedMesh(new THREE.BoxGeometry(0.05, 0.034, 0.02), new THREE.MeshBasicMaterial({ toneMapped: false }), N * LEDS.length);
    const fanGeo = voxGeos(fanBladeModel(4), 0.5).solid!;
    fans = new THREE.InstancedMesh(fanGeo, MATERIALS.solid, N);
    const mtx = new THREE.Matrix4();
    const rq = new THREE.Quaternion();
    const off = new THREE.Vector3();
    const one = new THREE.Vector3(1, 1, 1);
    const place = (im: THREE.InstancedMesh, i: number, base: THREE.Vector3, lx: number, ly: number, lz: number) => {
      off.set(lx, ly, lz).applyQuaternion(rq).add(base);
      mtx.compose(off, rq, one);
      im.setMatrixAt(i, mtx);
    };
    let k = 0;
    for (const [ri, r] of rows.entries()) {
      const col = new THREE.Color(r.color).multiplyScalar(2.6);
      const slots = Math.ceil(r.n / 2);
      for (let i = 0; i < r.n; i++) {
        // alternate sides: east line faces +x, west line faces -x
        const side = i % 2 ? -1 : 1;
        const z = ROW_ZF - PITCH / 2 - Math.floor(i / 2) * PITCH;
        const base = V(r.x + side * 0.44, 0, z);
        rq.setFromAxisAngle(V(0, 1, 0), (side * Math.PI) / 2);
        const idx = r.first + i;
        cabRow[idx] = ri;
        cabPos[idx] = base;
        cabSide[idx] = side;
        place(solid, idx, base, 0, 0, 0);
        place(emit, idx, base, 0, 0, 0);
        place(strip, idx, base, 0, 25.5 * CAB.s, (CAB.d / 2) * CAB.s + 0.012);
        strip.setColorAt(idx, col);
        place(fans, idx, base, 0, 26 * CAB.s + 0.004, -0.04);
        for (const [lx, ly, lz] of LEDS) {
          place(leds, k, base, lx, ly, lz);
          leds.setColorAt(k, C_GREEN);
          k++;
        }
      }
      const zEnd = ROW_ZF - slots * PITCH;
      // room left for the row to grow: a painted bay and spare boxes waiting to be racked
      const zMin = ROW_ZF - (MAX_CAB / 2) * PITCH;
      if (zEnd - zMin > 1.4) {
        plan.spare.push([r.x - 0.9, zMin, r.x + 0.9, zEnd - 0.4]);
        const st = vox(boxStackModel(ri * 3 + 1), 0.5);
        st.position.set(r.x + (ri % 2 ? -0.35 : 0.35), 0, zEnd - 1.1);
        st.rotation.y = (ri % 2 ? 0.2 : -0.15) + Math.PI / 2;
        scene.add(st);
        ground.push([r.x - 0.75, zEnd - 1.9, r.x + 0.75, zEnd - 0.3]);
      }
      ground.push([r.x - 0.9, zEnd - 0.05, r.x + 0.9, ROW_ZF + 0.05]);
      // tray over the row with a drop to each pair of cabinets
      const tz0 = ROW_ZF + 0.2;
      const len = Math.ceil((tz0 - zEnd + 0.2) * 6);
      const drops = Array.from({ length: slots }, (_, i) => Math.round((PITCH / 2 + 0.2 + i * PITCH) * 6));
      const tray = vox(trayModel(len, drops, 9));
      tray.rotation.y = Math.PI / 2;
      tray.position.set(r.x, 27 * CAB.s, tz0 - len / 12);
      scene.add(tray);
      // the pool's sign over the head of the row
      const sign = neonSign(
        [
          { text: `${r.letter} · ${r.name.toUpperCase()}`, font: MONO(64, 800) },
          { text: `${(r.share * 100).toFixed(1)}% · ${fmt(r.miner.blocks)} blocks / 7d`, font: MONO(40, 600), color: "#e8e0c8" },
        ],
        { color: r.color, w: 2.5, h: 0.7 },
      );
      sign.position.set(r.x, 3.95, ROW_ZF - 1.4);
      scene.add(sign);
      // and its back, for the far end
      const back = sign.clone();
      back.rotation.y = Math.PI;
      back.position.set(r.x, 3.95, zEnd + 1.4);
      scene.add(back);
      // end caps: the row's letter in neon on the head and the tail of the row
      for (const [zc, ry] of [
        [ROW_ZF + 0.01, 0],
        [zEnd - 0.01, Math.PI],
      ]) {
        const cap = endCap(r.letter, r.name.toUpperCase().slice(0, 12), r.color);
        cap.rotation.y = ry;
        cap.position.set(r.x, 1.2, zc);
        scene.add(cap);
      }
    }
    for (const im of [solid, emit, strip, leds, fans]) {
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.frustumCulled = false;
      scene.add(im);
    }
    solid.userData.cabinets = true;
    emit.userData.cabinets = true;
    pickables.push(solid, emit);
    plan.rows = rows.map((r) => ({ x0: r.x - 0.9, z0: ROW_ZF - Math.ceil(r.n / 2) * PITCH, x1: r.x + 0.9, z1: ROW_ZF, letter: r.letter, name: r.name, color: r.color }));
    floorMat.map?.dispose();
    floorMat.map = drawFloor(plan);
    floorMat.needsUpdate = true;
  }

  const loadMiners = async () => {
    const m = await get<Miners>("/v1/miners");
    if (!m) return;
    st.miners = m;
    if (!rows.length && m.miners.length) buildRows(m);
  };
  void loadMiners();
  const minersTimer = setInterval(() => void loadMiners(), 5 * 60_000);
  void minersTimer;
  Market.subscribe(() => {});

  // ---- crates and the line ---------------------------------------------------------------------
  const crates: Crate[] = [];
  const crateGeo = new THREE.BoxGeometry(CRATE, CRATE, CRATE);
  let pressT = 99;
  const seen = new Set<number>();
  let lastUpdate = 0;

  // sparks when the press stamps
  const SPARKS = 40;
  const sparks = new THREE.InstancedMesh(new THREE.BoxGeometry(0.05, 0.05, 0.05), new THREE.MeshBasicMaterial({ color: new THREE.Color(GOLD).multiplyScalar(4), toneMapped: false }), SPARKS);
  const sparkV = Array.from({ length: SPARKS }, () => new THREE.Vector3());
  const sparkP = Array.from({ length: SPARKS }, () => new THREE.Vector3());
  let sparkT = 9;
  sparks.frustumCulled = false;
  scene.add(sparks);
  const hide = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < SPARKS; i++) sparks.setMatrixAt(i, hide);

  function makeCrate(height: number, pool: string | null, at: number, state: Crate["state"]): Crate {
    const tex = crateTexture(height);
    const mat = new THREE.MeshStandardMaterial({ map: tex, emissive: "#ffffff", emissiveMap: tex, emissiveIntensity: 0.12, roughness: 0.45, metalness: 0.25 });
    const mesh = new THREE.Mesh(crateGeo, mat);
    const c: Crate = { mesh, height, pool, at, state, t: 0, detail: null };
    mesh.userData.crate = c;
    scene.add(mesh);
    pickables.push(mesh);
    void get<{ tx_count: number; size: number; fees: number | null }>(`/v1/blocks/${height}`).then((d) => (c.detail = d));
    return c;
  }

  function dropCrate(c: Crate) {
    scene.remove(c.mesh);
    (c.mesh.material as THREE.MeshStandardMaterial).map?.dispose();
    (c.mesh.material as THREE.Material).dispose();
    pickables.splice(pickables.indexOf(c.mesh), 1);
    crates.splice(crates.indexOf(c), 1);
  }

  /** Put a crate on the pallet; the oldest beyond five leaves through the door. */
  function toPallet(c: Crate) {
    c.state = "pallet";
    const onPallet = crates.filter((x) => x.state === "pallet").sort((a, b) => a.height - b.height);
    while (onPallet.length > 5) {
      const old = onPallet.shift()!;
      old.state = "leaving";
      old.t = 0;
    }
    layoutPallet();
  }
  const SLOTS: [number, number, number][] = [
    [-0.3, 0, -0.3],
    [0.3, 0, -0.3],
    [-0.3, 0, 0.3],
    [0.3, 0, 0.3],
    [0, 1, 0],
  ];
  function layoutPallet() {
    const onPallet = crates.filter((x) => x.state === "pallet").sort((a, b) => a.height - b.height);
    onPallet.forEach((c, i) => {
      const [dx, lvl, dz] = SLOTS[i];
      c.mesh.position.set(PALLET.x + dx, 1 / 6 + CRATE / 2 + lvl * CRATE, PALLET.z + dz);
      c.mesh.rotation.set(0, (hash(c.height, 0, 0, 1) - 0.5) * 0.3, 0);
    });
  }

  function remember(height: number, pool: string | null, at: number) {
    if (!st.last || st.last.height <= height) st.last = { height, pool, at };
    st.recent = [{ height, pool, at }, ...st.recent.filter((r) => r.height !== height)].sort((a, b) => b.height - a.height).slice(0, 12);
  }

  /** A real block: the press stamps it, or (while nobody is inside) it goes straight on the pallet. */
  function onBlock(height: number, pool: string | null) {
    if (seen.has(height)) return;
    seen.add(height);
    remember(height, pool, Date.now());
    const row = rows.find((r) => pool && (r.miner.pool === pool || r.name === pool));
    if (performance.now() - lastUpdate > 1500) {
      const c = makeCrate(height, pool, Date.now(), "pallet");
      crates.push(c);
      toPallet(c);
      return;
    }
    st.flashUntil = performance.now() + 5000;
    st.stamped++;
    if (row) row.flashUntil = clock + 6;
    pressT = 0;
    const c = makeCrate(height, pool, Date.now(), "press");
    c.mesh.visible = false;
    c.mesh.position.set(PRESS.x, 5 / 6 + CRATE / 2, PRESS.z);
    crates.push(c);
  }
  ctx.onBlock(onBlock);
  if (debug) Object.assign(window, { __factoryTestBlock: (h: number, pool: string | null = "Foundry") => onBlock(h, pool), __factoryCrates: () => crates.map((c) => [c.height, c.state, +c.mesh.position.z.toFixed(2), pressT.toFixed(1)]) });

  // pre-populate: the last blocks on the pallet, the newest through the press on the first visit
  void (async () => {
    const list = await get<BlockSummary[]>("/v1/blocks?limit=5");
    if (!list?.length) return;
    const sorted = [...list].sort((a, b) => a.height - b.height);
    for (const b of sorted.slice(0, -1)) {
      if (seen.has(b.height)) continue;
      seen.add(b.height);
      remember(b.height, b.miner_pool, Date.parse(b.time));
      const c = makeCrate(b.height, b.miner_pool, Date.parse(b.time), "pallet");
      crates.push(c);
      toPallet(c);
    }
    const nb = sorted[sorted.length - 1];
    if (seen.has(nb.height)) return;
    seen.add(nb.height);
    remember(nb.height, nb.miner_pool, Date.parse(nb.time));
    const c = makeCrate(nb.height, nb.miner_pool, Date.parse(nb.time), "press");
    c.mesh.visible = false;
    c.mesh.position.set(PRESS.x, 5 / 6 + CRATE / 2, PRESS.z);
    crates.push(c);
    pressT = -1.5;
  })();

  // ---- the people ------------------------------------------------------------------------------
  const people: Snark[] = [];
  let porter: Snark | null = null;
  const PORTER_HOME = V(14.5, 0, -13.4);

  /** Where a worker stands to service a cabinet: in the aisle, facing it. */
  const standAt = (idx: number) => V(cabPos[idx].x + cabSide[idx] * 0.95, 0, cabPos[idx].z);
  function route(from: THREE.Vector3, to: THREE.Vector3) {
    const lo = Math.min(from.x, to.x),
      hi = Math.max(from.x, to.x);
    // same aisle: straight there; otherwise round the heads of the rows
    if (!ROW_X.some((x) => x > lo - 0.9 && x < hi + 0.9) || (from.z > ROW_ZF && to.z > ROW_ZF)) return [to];
    return [V(from.x, 0, FRONT_Z + hash(from.x, from.z, 1, 1) * 0.6), V(to.x, 0, FRONT_Z + hash(to.x, 1, 2, 3) * 0.6), to];
  }

  async function worker(s: Snark, seed: number) {
    let n = seed;
    await sleep(500 + seed * 300);
    for (;;) {
      n++;
      if (!cabPos.length) {
        await sleep(1000);
        continue;
      }
      const idx = Math.floor(hash(n, seed, 7, 9) * cabPos.length);
      s.faceDir = null;
      await s.walk(route(s.root.position, standAt(idx)), 1.2 + hash(n, 2, 3, 4) * 0.5);
      s.faceDir = V(-cabSide[idx], 0, 0);
      working.set(s, idx);
      await sleep(3500 + hash(n, 5, 6, 7) * 5000);
      working.delete(s);
    }
  }
  const working = new Map<Snark, number>();

  async function porterLoop(s: Snark) {
    for (;;) {
      st.porter = "WAITING";
      s.faceDir = V(-1, 0, 0);
      let c: Crate | undefined;
      while (!(c = crates.filter((x) => x.state === "end").sort((a, b) => b.mesh.position.z - a.mesh.position.z)[0])) await sleep(300);
      st.porter = "PICKING UP";
      s.faceDir = null;
      await s.walk([V(13.45, 0, c.mesh.position.z)], 1.6);
      s.faceDir = V(-1, 0, 0);
      await sleep(500);
      c.state = "carried";
      st.porter = `CARRYING #${c.height}`;
      await sleep(300);
      s.faceDir = null;
      await s.walk([V(14.4, 0, -11.2), V(14.25, 0, PALLET.z)], 1.5);
      s.faceDir = V(1, 0, 0);
      await sleep(400);
      toPallet(c);
      st.porter = "SHIPPED";
      await sleep(900);
      s.faceDir = null;
      await s.walk([V(14.4, 0, -11.2), PORTER_HOME], 1.4);
    }
  }

  let operator: Snark | null = null;
  async function operatorLoop(s: Snark) {
    const spots = [-7, 0, 7];
    for (let i = 0; ; i++) {
      s.faceDir = null;
      await s.walk([V(spots[i % 3] + (hash(i, 1, 1, 1) - 0.5), MEZ_Y, -3.05)], 1.1);
      s.faceDir = V(0, 0, -1);
      await sleep(5000 + hash(i, 2, 2, 2) * 5000);
    }
  }

  async function addSnark(id: number, at: THREE.Vector3, role: string) {
    try {
      const s = new Snark(id, await loadArt(id));
      s.noClip = true;
      s.role = role;
      s.state = "resident";
      s.showParcels(false);
      s.root.position.copy(at);
      scene.add(s.root);
      pickables.push(s.body);
      people.push(s);
      return s;
    } catch {
      return null;
    }
  }
  void addSnark(3141, PORTER_HOME, "Porter").then((s) => s && ((porter = s), void porterLoop(s)));
  [2718, 1618, 1732, 1414].forEach((id, i) => void addSnark(id, V([-9.5, -3.5, 2.5, -9.5][i], 0, -10 - i * 2.5), "Miner").then((s) => s && void worker(s, i * 11 + 3)));
  void addSnark(1123, V(0, MEZ_Y, -3.05), "Shift supervisor").then((s) => s && ((operator = s), void operatorLoop(s)));

  // ---- frame -----------------------------------------------------------------------------------
  const camQuat = new THREE.Quaternion();
  const camRight = new THREE.Vector3();
  const camFwd = new THREE.Vector3();
  const mtx = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const pos = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  let clock = 0;
  let nextLed = 0,
    nextWall = 0,
    nextMon = 0,
    monI = 0;

  function updateLeds(t: number) {
    if (!leds) return;
    const tick = Math.floor(t * 7);
    const wk = new Set(working.values());
    let k = 0;
    for (let idx = 0; idx < cabRow.length; idx++) {
      const r = rows[cabRow[idx]];
      const flash = t < r.flashUntil;
      const serviced = wk.has(idx);
      for (let j = 0; j < LEDS.length; j++, k++) {
        const h = hash(k, tick, 3, 1);
        if (flash) ledColor.copy((tick + j + idx) % 2 ? C_GOLD : C_DIM);
        else if (serviced) ledColor.copy((tick + j) % 3 ? C_CYAN : C_DIM);
        else if (j % 3 === 2) ledColor.copy(h < 0.5 ? C_AMBER : C_DIM);
        else if (hash(k, 0, 0, 2) < 0.012) ledColor.copy(tick % 2 ? C_RED : C_DIM);
        else ledColor.copy(h < 0.22 ? C_DIM : C_GREEN);
        leds.setColorAt(k, ledColor);
      }
    }
    if (leds.instanceColor) leds.instanceColor.needsUpdate = true;
  }

  function updateLine(dt: number, t: number) {
    // press: down fast, hold, back up; flash and sparks at the hit
    const prev = pressT;
    pressT += dt;
    const p = pressT;
    let ry = 2.45;
    if (p >= 0 && p < 0.35) ry = 2.45 - (p / 0.35) ** 2 * (2.45 - (5 / 6 + CRATE));
    else if (p >= 0.35 && p < 0.6) ry = 5 / 6 + CRATE;
    else if (p >= 0.6 && p < 1.5) ry = 5 / 6 + CRATE + ((p - 0.6) / 0.9) * (2.45 - 5 / 6 - CRATE);
    ram.position.y = ry;
    pressLight.intensity = p >= 0.33 && p < 1.4 ? 60 * Math.max(0, 1 - (p - 0.33) / 1.0) : 0;
    if (prev < 0.35 && p >= 0.35) {
      sparkT = 0;
      for (let i = 0; i < SPARKS; i++) {
        const a = Math.random() * Math.PI * 2;
        sparkP[i].set(PRESS.x + Math.cos(a) * 0.3, 1.0, PRESS.z + Math.sin(a) * 0.3);
        sparkV[i].set(Math.cos(a) * (1 + Math.random() * 2.5), 1.5 + Math.random() * 3, Math.sin(a) * (1 + Math.random() * 2.5));
      }
    }
    if (sparkT < 1.2) {
      sparkT += dt;
      for (let i = 0; i < SPARKS; i++) {
        sparkV[i].y -= 9.8 * dt;
        sparkP[i].addScaledVector(sparkV[i], dt);
        if (sparkP[i].y < 0.03) {
          sparkP[i].y = 0.03;
          sparkV[i].multiplyScalar(0.3);
        }
        const s = Math.max(0, 1 - sparkT / 1.2);
        mtx.compose(sparkP[i], q.identity(), pos.set(s, s, s));
        sparks.setMatrixAt(i, mtx);
      }
      sparks.instanceMatrix.needsUpdate = true;
    }

    // crates
    const belt = crates.filter((c) => c.state === "belt" || c.state === "end").sort((a, b) => b.mesh.position.z - a.mesh.position.z);
    for (const c of [...crates]) {
      const m = c.mesh;
      c.t += dt;
      if (c.state === "press") {
        if (pressT < 0.35) continue;
        m.visible = true;
        const k = pressT - 0.35;
        m.scale.setScalar(k < 0.15 ? 0.7 + k * 2 : 1);
        if (pressT > 1.5) {
          const s = Math.min(1, (pressT - 1.5) / 0.7);
          m.position.z = PRESS.z + s * (BELT_Z0 + 0.3 - PRESS.z);
          m.position.y = s < 0.85 ? 5 / 6 + CRATE / 2 : BELT_Y + CRATE / 2;
          if (s >= 1) c.state = "belt";
        }
      } else if (c.state === "belt") {
        const i = belt.indexOf(c);
        const limit = i <= 0 ? END_Z : belt[i - 1].mesh.position.z - CRATE - 0.1;
        m.position.y = BELT_Y + CRATE / 2;
        m.position.z = Math.min(limit, m.position.z + dt * 1.0);
        if (i <= 0 && m.position.z >= END_Z - 0.001) c.state = "end";
      } else if (c.state === "carried" && porter) {
        camFwd.set(0, 0, -1).applyQuaternion(camQuat).setY(0).normalize();
        m.position.copy(porter.root.position).addScaledVector(camFwd, -0.32);
        m.position.y = 0.95 + Math.sin(t * 9) * 0.015;
        m.rotation.y += (Math.atan2(camFwd.x, camFwd.z) - m.rotation.y) * 0.2;
      } else if (c.state === "leaving") {
        m.position.x += dt * 1.2;
        m.position.y = Math.max(CRATE / 2, m.position.y - dt);
        if (m.position.x > X1 + 1.2) dropCrate(c);
      }
    }
    // crates ride at 1 m/s towards +z; one tile is 0.9 m and the canvas top faces −z
    beltTex.offset.y += dt / 0.9;
  }

  return {
    key: "factory",
    title: "MINING HALL",
    scene,
    floors: [
      { label: "G", name: "Mining hall", y: 0, spawn: V(-3.5, 0, -2.4), yaw: 0 },
      { label: "1", name: "Control room", y: MEZ_Y, spawn: V(-3.5, MEZ_Y, -3.2), yaw: 0 },
    ],
    colliders: (f) => (f === 0 ? ground : upper),
    pickables: () => pickables,
    pick(hit): PickInfo | null {
      const o = hit.object;
      const c = o.userData.crate as Crate | undefined;
      if (c) {
        const fresh = Date.now() - c.at < 10 * 60_000;
        const stats: [string, string][] = [["Mined by", c.pool ?? "unknown"]];
        if (c.detail) stats.push(["Transactions", fmt(c.detail.tx_count)], ["Size", `${fmt(c.detail.size / 1000, 1)} kB`], ["Fees", `${((c.detail.fees ?? 0) / 1e8).toFixed(5)} ZEC`]);
        else stats.push(["Found", new Date(c.at).toLocaleTimeString()]);
        return {
          eyebrow: fresh ? "Block · just mined" : "Block · shipped",
          title: fmt(c.height),
          mono: true,
          tag: [c.state === "pallet" || c.state === "leaving" ? "Waiting for the bus" : "On the line", c.state === "pallet" ? "info" : "ok"],
          stats,
          body: `<p>Stamped by the press when the block was found, ${esc(new Date(c.at).toLocaleTimeString())}. The porter takes it to the dispatch bay, where the block bus picks it up.</p>`,
          link: { href: links.block(c.height), label: "Block on ZScan" },
        };
      }
      if (o.userData.cabinets && hit.instanceId !== undefined) {
        const r = rows[cabRow[hit.instanceId]];
        if (!r) return null;
        const m = r.miner;
        return {
          eyebrow: `Row ${r.letter} · mining pool · 7 days`,
          title: r.name,
          tag: [clock < r.flashUntil ? "Found a block" : "Hashing", "ok"],
          stats: [
            ["Blocks (7d)", fmt(m.blocks)],
            ["Share", `${(r.share * 100).toFixed(1)}%`],
            ["Rewards", `${fmt(m.rewards / 1e8, 1)} ZEC`],
            ["Last block", `#${fmt(m.last_block)}`],
          ],
          body: `<p>${r.n} cabinets in this row: one for every ~${fmt(rows[0].miner.blocks / MAX_CAB)} blocks found this week.</p><p style="font-family:monospace;word-break:break-all;opacity:.7">${esc(m.address)}${m.tag ? `<br>coinbase tag: ${esc(m.tag)}` : ""}</p>`,
          link: { href: links.block(m.last_block), label: "Its last block on ZScan" },
        };
      }
      if (o === screen || o.userData.monitor) {
        const n = Market.state.network;
        const kind = o.userData.monitor as MonitorKind | undefined;
        if (kind === "leaderboard" || kind === "blocks" || kind === "nakamoto") {
          const m = st.miners;
          const tot = m?.total_blocks || 1;
          return {
            eyebrow: "Control room · mining pools · 7 days",
            title: kind === "nakamoto" ? `Nakamoto coefficient ${m?.nakamoto_coefficient ?? "—"}` : "Pool leaderboard",
            stats: [
              ["Blocks (7d)", m ? fmt(m.total_blocks) : "—"],
              ["Miners", m ? fmt(m.miners.length) : "—"],
              ["Largest", m?.miners[0] ? `${((m.miners[0].blocks / tot) * 100).toFixed(1)}%` : "—"],
              ["Nakamoto", m?.nakamoto_coefficient ? String(m.nakamoto_coefficient) : "—"],
            ],
            body: (m?.miners.slice(0, 8) ?? []).map((x, i) => `<div style="display:flex;justify-content:space-between;gap:12px"><span>${i + 1}. ${esc(minerName(x))}</span><span style="font-family:monospace">${fmt(x.blocks)} · ${((x.blocks / tot) * 100).toFixed(1)}%</span></div>`).join(""),
          };
        }
        return {
          eyebrow: "Network · live",
          title: n ? `${(n.solps / 1e9).toFixed(2)} GSol/s` : "Network",
          mono: true,
          tag: ["Equihash (200,9)", "info"],
          stats: [
            ["Difficulty", n ? `${fmt(n.difficulty / 1e6, 1)} M` : "—"],
            ["Avg block", n ? `${n.avg_block_time.toFixed(0)} s` : "—"],
            ["Txs (24h)", n ? fmt(n.txs_24h) : "—"],
            ["Last block", st.last ? `#${fmt(st.last.height)}` : "—"],
          ],
          link: st.last ? { href: links.block(st.last.height), label: "Last block on ZScan" } : undefined,
        };
      }
      const s = o.userData.snark as Snark | undefined;
      if (s) {
        return {
          eyebrow: `Mining hall · ${s.role ?? "Miner"}`,
          title: s.name,
          image: ZScan.zkSnarkImage(s.id),
          body: s === porter ? "<p>Takes every freshly stamped block from the end of the conveyor to the dispatch bay, where the bus picks it up.</p>" : s === operator ? "<p>Watches the pools and the network from the control room.</p>" : "<p>Keeps the ASIC cabinets hashing: checks the boards, swaps fans, watches the LEDs.</p>",
        };
      }
      return null;
    },
    hover(hit) {
      const o = hit.object;
      const c = o.userData.crate as Crate | undefined;
      if (c) return `Block #${fmt(c.height)} · ${c.pool ?? "unknown miner"}`;
      if (o.userData.cabinets && hit.instanceId !== undefined) {
        const r = rows[cabRow[hit.instanceId]];
        return r ? `Row ${r.letter} · ${r.name} · ${(r.share * 100).toFixed(1)}% of blocks` : null;
      }
      if (o === screen) return "Live network wall";
      if (o.userData.monitor) return `Control room · ${o.userData.monitor}`;
      const s = o.userData.snark as Snark | undefined;
      if (s) return `${s.name} · ${s.role}`;
      return null;
    },
    update(dt, t, camera) {
      lastUpdate = performance.now();
      clock = t;
      camera.getWorldQuaternion(camQuat);
      camRight.set(1, 0, 0).applyQuaternion(camQuat);
      for (const s of people) s.update(dt, t, camQuat, camRight);
      for (const r of rotors) r.rotation.z = t * 5;
      // rooftop fans of the cabinets
      if (fans) {
        for (let i = 0; i < cabPos.length; i++) {
          const p = cabPos[i];
          q.setFromAxisAngle(up, t * 9 + i * 1.3);
          mtx.compose(pos.set(p.x - cabSide[i] * 0.04, 26 * CAB.s + 0.004, p.z), q, one);
          fans.setMatrixAt(i, mtx);
        }
        fans.instanceMatrix.needsUpdate = true;
      }
      if (t >= nextLed) {
        nextLed = t + 0.14;
        updateLeds(t);
      }
      updateLine(dt, t);
      // screens: the wall at 4 Hz, one desk monitor at a time
      if (t >= nextWall) {
        nextWall = t + 0.25;
        drawWall(wallCanvas.g, t, st);
        wallScreenTex.needsUpdate = true;
        screenLight.color.set(performance.now() < st.flashUntil ? GOLD : "#8fd0ff");
      }
      if (t >= nextMon && monitors.length) {
        nextMon = t + 0.2;
        const m = monitors[monI++ % monitors.length];
        drawMonitor(m.g, m.kind, t, st);
        m.tex.needsUpdate = true;
      }
    },
  };
}
