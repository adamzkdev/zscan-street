import * as THREE from "three";
import { Market } from "../data/market";
import type { BlockSummary, Tx } from "../data/types";
import { KIND_LABEL } from "../data/types";
import { get, links, ZScan } from "../data/zscan";
import type { Snark } from "../scene/snark";
import { hash } from "../scene/voxel/model";
import type { Theme } from "../scene/theme";
import { FLASH, TIME } from "./factory/batch";
import { canvasTex, GOLD, makeCanvas, minerName, type Miners } from "./factory/canvas";
import { Crew, crewId, LINES, type Person } from "./factory/crew";
import { BACK_Z, CAT_Y, CTRL, LANES_X, MAIN_Z, MID_Z, Z0 } from "./factory/layout";
import { buildLine, type BlockInfo, type Item } from "./factory/line";
import { buildRacks } from "./factory/racks";
import { drawWall, WALL_PX, type HallState, type MonitorKind } from "./factory/screens";
import { buildShell } from "./factory/shell";
import { buildCatwalks, buildControl } from "./factory/upper";
import { buildFleet, forklift, scissorLift, setLift, tuggerCart, tuggerTractor, utilityCart, type Vehicle } from "./factory/vehicles";
import { bezelModel } from "./factory/voxels";
import { voxObj } from "./factory/batch";
import { makeScene } from "./kit";
import type { Interior, InteriorContext, PickInfo, Rect } from "./types";

/**
 * Inside the Proof Factory: a hyperscale mining hall. Ground floor: thirteen pods of ASIC racks
 * (about fifteen thousand miners, each pod given to a real mining pool by its share of the week's
 * blocks), the cooling wall, overhead cranes, and the line: every real block is stamped into a
 * crate by the press under the wall screen, rides the conveyor round the hall, is lifted by the
 * robot onto the AGV and shipped from the docks. Forklifts, tugger trains, carts and scissor
 * lifts work the aisles. Upstairs: the control room over the hall, and the catwalks under the roof.
 */

const fmt = (n: number, d = 0) => n.toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: d });
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const shortId = (h: string) => `${h.slice(0, 6)}…${h.slice(-4)}`;

/** The wall screen over the press. */
const SCREEN = { w: 28, y: 9.15 };

export function buildFactory(ctx: InteriorContext): Interior {
  const scene = makeScene(ctx.renderer, "#0b0a12");
  const hemi = scene.children.find((c) => c instanceof THREE.HemisphereLight) as THREE.HemisphereLight;
  scene.fog = new THREE.Fog("#0e0d16", 45, 150);
  scene.environmentIntensity = 0.3;
  const sun = new THREE.DirectionalLight("#fff2dc", 0);
  sun.position.set(20, 40, 30);
  scene.add(sun);
  const hall = new THREE.Group();
  scene.add(hall);
  const st: HallState = { miners: null, last: null, recent: [], flashUntil: 0, stamped: 0, porter: "WAITING" };
  const ground: Rect[] = [],
    upper: Rect[] = [],
    cat: Rect[] = [];
  const pickables: THREE.Object3D[] = [];
  let floorNow = 0;

  const shell = buildShell(hall, ground);
  const racks = buildRacks(hall);
  ground.push(...racks.colliders);
  const fleet = buildFleet(hall);
  const line = buildLine(hall, ground, fleet);
  const control = buildControl(hall, upper, pickables);
  buildCatwalks(hall, cat);
  const crew = new Crew();

  // ---- lights: six point lights in all (the press and the robot cell are the line's) ----------
  for (const [x, z, c, k] of [
    [-30, -38, "#ffe6c4", 60],
    [22, -38, "#ffe6c4", 60],
  ] as [number, number, string, number][]) {
    const l = new THREE.PointLight(c, k, 60, 1.1);
    l.position.set(x, 11, z);
    hall.add(l);
  }

  // ---- the wall screen ------------------------------------------------------------------------
  const wallCanvas = makeCanvas(WALL_PX.w, WALL_PX.h);
  const wallTex = canvasTex(wallCanvas.c);
  const SH = (SCREEN.w * WALL_PX.h) / WALL_PX.w;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(SCREEN.w, SH), new THREE.MeshBasicMaterial({ map: wallTex, toneMapped: false, color: new THREE.Color(1.3, 1.3, 1.3) }));
  screen.position.set(0, SCREEN.y, Z0 + 0.5);
  hall.add(screen);
  pickables.push(screen);
  const bezel = voxObj(bezelModel(Math.round(SCREEN.w * 6), Math.round(SH * 6)));
  bezel.position.set(0, SCREEN.y - SH / 2 - 1 / 6, Z0 + 0.3);
  hall.add(bezel);
  const screenGlow = new THREE.PointLight("#8fd0ff", 30, 30, 1.2);
  screenGlow.position.set(0, SCREEN.y - 2, Z0 + 6);
  hall.add(screenGlow);

  // ---- mining pools -----------------------------------------------------------------------------
  const loadMiners = async () => {
    const m = await get<Miners>("/v1/miners");
    if (!m) return;
    st.miners = m;
    racks.assign(m);
  };
  void loadMiners();
  setInterval(() => void loadMiners(), 5 * 60_000);
  Market.subscribe(() => {});

  // ---- blocks and proofs on the line ----------------------------------------------------------
  const blocksSeen = new Set<number>();
  const seenTx = new Set<string>();
  let lastUpdate = 0;
  const watched = () => performance.now() - lastUpdate < 1500;
  const info = (b: BlockSummary & { miner?: string | null }): BlockInfo => ({ height: b.height, txs: b.tx_count, pool: b.miner_pool ?? (st.miners?.miners.find((m) => m.address === b.miner) ? minerName(st.miners!.miners.find((m) => m.address === b.miner)!) : b.miner ? `${b.miner.slice(0, 5)}…${b.miner.slice(-4)}` : "Unknown"), size: b.size, fees: b.fees, time: Date.parse(b.time) });
  function remember(height: number, pool: string | null, at: number) {
    if (!st.last || st.last.height <= height) st.last = { height, pool, at };
    st.recent = [{ height, pool, at }, ...st.recent.filter((r) => r.height !== height)].sort((a, b) => b.height - a.height).slice(0, 12);
  }
  /** The pool row (rack colour) that mined a block. */
  const poolIndex = (pool: string | null, miner?: string | null) => {
    const r = racks.pools.find((p) => p.miner && ((pool && (p.miner.pool === pool || p.name === pool)) || (miner && p.miner.address === miner)));
    return r ? r.index : racks.pools.find((p) => !p.miner)?.index ?? -1;
  };
  const flashUntil = new Array(9).fill(0);
  let clock = 0;

  async function onBlock(height: number, pool: string | null) {
    if (blocksSeen.has(height)) return;
    blocksSeen.add(height);
    remember(height, pool, Date.now());
    st.flashUntil = performance.now() + 6000;
    let b: (BlockSummary & { miner?: string | null }) | undefined;
    for (let k = 0; k < 4 && !b; k++) {
      const list = await get<(BlockSummary & { miner?: string | null })[]>("/v1/blocks?limit=4");
      b = list?.find((x) => x.height === height);
      if (!b) await sleep(2500);
    }
    const bi: BlockInfo = b ? info(b) : { height, txs: 1, pool: pool ?? "Unknown", size: 0, fees: null, time: Date.now() };
    const pi = poolIndex(pool ?? b?.miner_pool ?? null, b?.miner);
    if (pi >= 0) flashUntil[pi] = clock + 8;
    line.feed(bi, null, watched());
    if (watched()) {
      const quips = [`Block ${fmt(height)}! ${bi.pool} found it.`, "Another block, another crate!", `${bi.txs} transactions in that one!`, "Press, stamp it!"];
      crew.shout(quips[Math.floor(hash(height, 1, 2, 3) * quips.length)], 22);
    }
  }
  ctx.onBlock((h, p) => void onBlock(h, p));
  function onProof(tx: Tx) {
    if (seenTx.has(tx.txid)) return;
    seenTx.add(tx.txid);
    line.feed(null, tx, watched());
  }
  ctx.director.onProof(onProof);
  // the line is busy from the start: the last blocks on the belt and in the trucks
  void (async () => {
    const list = await get<(BlockSummary & { miner?: string | null })[]>("/v1/blocks?limit=10");
    const sorted = [...(list ?? [])].sort((a, b) => a.height - b.height);
    for (const b of sorted) {
      blocksSeen.add(b.height);
      remember(b.height, b.miner_pool, Date.parse(b.time));
    }
    const recent = sorted.slice(-3);
    const older = sorted.slice(0, -3);
    for (const b of older) line.seedTruck(info(b), null);
    recent.forEach((b, i) => line.seed(info(b), null, line.total * (0.2 + i * 0.32)));
    const proved = ctx.director.mempoolList().filter((t) => t.pool || t.kind === "shielded" || t.kind === "migration");
    proved.slice(-8).forEach((t, i) => {
      if (seenTx.has(t.txid)) return;
      seenTx.add(t.txid);
      if (i % 2) line.seedTruck(null, t);
      else line.seed(null, t, line.total * (0.08 + i * 0.1));
    });
  })();
  line.onStamp = (it: Item) => {
    st.stamped++;
    if (it.block) st.flashUntil = Math.max(st.flashUntil, performance.now() + 3000);
  };

  // ---- vehicles and their drivers ---------------------------------------------------------------
  const nodes = fleet.nodes;
  const onX = (x: number) => fleet.where((p) => Math.abs(p.x - x) < 0.1);
  const crossAisles = fleet.where((p) => [MAIN_Z, MID_Z, BACK_Z].some((z) => Math.abs(p.z - z) < 0.1));
  const prod = fleet.where((p) => p.x > 50 || (Math.abs(p.z - BACK_Z) < 0.1 && p.x > 0));
  const coldAisle = LANES_X.filter((x) => x > -62 && x < 40 && Math.abs(x) > 1);
  let driverN = 100;
  const drive = (v: Vehicle, role: string, lines: string[]) => {
    const seat = v.m.seat;
    if (!seat) return;
    void crew.person(crewId(driverN++), v.m.g, seat, role, { sit: true, scale: 0.82, lines, near: 7 }).then((p) => {
      if (!p) return;
      v.onBeep = () => p.s.say(hash(clock, 1, 1, 1) < 0.5 ? "Beep beep!" : "Coming through!", 2.4, "honk");
      p.s.root.userData.vehicle = v;
    });
  };
  const startAt = (i: number) => {
    const free = nodes.map((_, k) => k).filter((k) => !fleet.vehicles.some((v) => v.node === k));
    return free[Math.floor(hash(i, 5, 5, 5) * free.length)];
  };
  const cartColors = ["#e8e8ec", "#3ddc97", "#e8e8ec", "#4ad0ff", "#e8e8ec", "#ff8a3a"];
  for (let i = 0; i < 6; i++) {
    const v = fleet.add(`CART-0${i + 1}`, "cart", utilityCart(cartColors[i]), startAt(i), nodes.map((_, k) => k), 3.4);
    drive(v, "Cart driver", LINES.cart);
  }
  for (let i = 0; i < 3; i++) {
    const carts = [0, 1, 2].map((k) => tuggerCart(i * 3 + k));
    const v = fleet.add(`TUG-0${i + 1}`, "tugger", tuggerTractor(["#2e7ad8", "#c0302a", "#2e8a5a"][i]), crossAisles[Math.floor(hash(i, 9, 9, 9) * crossAisles.length)], crossAisles, 2.2, carts);
    drive(v, "Tugger driver", LINES.tugger);
  }
  for (let i = 0; i < 3; i++) {
    const m = forklift(i === 1 ? "#e06a1a" : "#e8b020");
    const v = fleet.add(`FL-0${i + 1}`, "forklift", m, prod[Math.floor(hash(i, 3, 3, 3) * prod.length)], prod.concat(crossAisles.filter((k) => nodes[k].p.x > 20)), 2.4);
    // a pallet of spares on the forks, now and then
    if (i !== 1) {
      const pal = tuggerCart(i * 3);
      pal.scale.set(0.9, 0.7, 0.6);
      pal.position.set(0, -0.2, 1.6);
      m.forks!.add(pal);
    }
    drive(v, "Forklift driver", LINES.forklift);
  }
  // scissor lifts drive into a cold aisle, raise the platform to the trays and work there
  for (let i = 0; i < 3; i++) {
    const m = scissorLift(["#e06a1a", "#2e5ab8", "#e06a1a"][i]);
    setLift(m, 0);
    const v = fleet.add(`LIFT-0${i + 1}`, "lift", m, startAt(20 + i), [], 1.2);
    v.next = (vv) => {
      const x = coldAisle[Math.floor(hash(clock * 3, i, 2, 2) * coldAisle.length)];
      const z = hash(clock, i, 4, 4) < 0.5 ? MAIN_Z : MID_Z;
      const to = onX(x).find((k) => Math.abs(nodes[k].p.z - z) < 0.1) ?? vv.node;
      const into = V(x + 0.6, 0, z - 4 - hash(clock, i, 6, 6) * 12);
      return [to, [into]];
    };
    v.job = async () => {
      for (let h = 0; h <= 1; h += 0.02) {
        setLift(m, h * 2.6);
        await sleep(40);
      }
      await sleep(7000 + hash(clock, i, 1, 1) * 6000);
      for (let h = 1; h >= 0; h -= 0.02) {
        setLift(m, h * 2.6);
        await sleep(30);
      }
    };
    void crew.person(crewId(200 + i), m.platform!, V(0, 0.12, -0.3), "Lift operator", { lines: LINES.lift, scale: 0.85, near: 8 });
  }

  // parked at the chargers (front wall, west of the lobby)
  [utilityCart("#e8e8ec"), forklift(), utilityCart("#3ddc97"), forklift("#e06a1a"), utilityCart("#4ad0ff"), tuggerTractor("#2e7ad8")].forEach((m, i) => {
    m.g.position.set(-60 + i * 4.2 + (i === 5 ? 4.2 : 0), 0, -2.6);
    m.g.rotation.y = Math.PI;
    if (m.beacon) m.beacon.visible = false;
    hall.add(m.g);
    ground.push([m.g.position.x - 0.7, -4.0, m.g.position.x + 0.7, -1.2]);
  });

  // ---- people on foot -------------------------------------------------------------------------
  /** Technicians: each keeps to a few neighbouring pods, walks to a rack and swaps a miner. */
  async function tech(p: Person, segs: number[], seed: number) {
    const s = p.s;
    let n = seed;
    await sleep(800 + seed * 120);
    for (;;) {
      n++;
      const seg = segs[Math.floor(hash(n, seed, 1, 1) * segs.length)];
      const side = hash(n, seed, 2, 2) < 0.5 ? -1 : 1;
      const k = Math.floor(hash(n, seed, 3, 3) * 15);
      const r = racks.rackIndex(seg, side, k);
      const spot = racks.serviceSpot(r);
      const crossZ = racks.segs[seg].z0 + 1.0;
      s.faceDir = null;
      await s.walk([V(s.root.position.x, 0, crossZ), V(spot.at.x, 0, crossZ), spot.at], 1.3 + hash(n, 4, 4, 4) * 0.4);
      s.faceDir = spot.face;
      const units = racks.unitsOf(r);
      const u = units[Math.floor(hash(n, seed, 5, 5) * units.length)];
      await sleep(600);
      for (let f = 0; f <= 1; f += 0.1) {
        racks.placeUnit(u, f * 0.45);
        racks.finish();
        await sleep(60);
      }
      await sleep(2500 + hash(n, 6, 6, 6) * 4000);
      for (let f = 1; f >= 0; f -= 0.1) {
        racks.placeUnit(u, f * 0.45);
        racks.finish();
        await sleep(60);
      }
      racks.placeUnit(u, 0);
      racks.finish();
      await sleep(1500 + hash(n, 7, 7, 7) * 3000);
    }
  }
  const segOf = (pod: string, half: string) => racks.segs.findIndex((s) => s.pod === pod && s.half === half);
  const groups: [string[], string][] = [
    [["W7", "W8"], "S"],
    [["E1", "E2"], "S"],
    [["W5", "W6"], "S"],
    [["E3", "E4"], "S"],
    [["W2", "W3"], "S"],
    [["W7", "W8"], "N"],
    [["E1", "E2"], "N"],
    [["W4", "W5"], "N"],
    [["E4", "E5"], "S"],
    [["W1", "W2"], "N"],
  ];
  groups.forEach(([pods, half], i) => {
    const segs = pods.map((p) => segOf(p, half)).filter((k) => k >= 0);
    const s0 = racks.segs[segs[0]];
    const start = V(s0.x + 3.3, 0, s0.z0 + 1);
    void crew.person(crewId(i), hall, start, "Technician", { lines: LINES.tech, vest: i % 3 ? "#ff7a1a" : "#c8f030" }).then((p) => p && void tech(p, segs, i * 17 + 3));
  });
  // the line's people
  void crew.person(crewId(300), hall, V(-21.8, 0, -65.4), "Press operator", { lines: LINES.press, face: V(0.5, 0, -1).normalize(), hat: "#dcdce2" });
  void crew.person(crewId(301), hall, V(46.4, 0, -17.4), "Robot cell operator", { lines: LINES.robot, face: V(0, 0, -1) });
  void crew.person(crewId(302), hall, V(60.5, 0, -28.5), "Dock lead", { lines: LINES.dock, face: V(1, 0, 0), vest: "#c8f030" }).then((p) => {
    if (!p) return;
    void (async () => {
      for (let i = 0; ; i++) {
        await sleep(6000 + hash(i, 1, 1, 1) * 6000);
        p.s.faceDir = null;
        await p.s.walk([V(60.5, 0, i % 2 ? -46.5 : -28.5)], 1.2);
        p.s.faceDir = V(1, 0, 0);
      }
    })();
  });
  void crew.person(crewId(303), hall, V(-5.5, 0, -6.4), "Security", { lines: LINES.guard, face: V(0, 0, 1), hat: "#dcdce2", vest: "#c8f030" });
  void crew.person(crewId(304), hall, V(11.9, 0, -3.2), "Reception", { lines: ["Welcome to the Proof Factory!", "Visitors: hard hats on the rack.", "The control room is upstairs."], face: V(0, 0, 1), vest: null, hat: "#4ad0ff" });
  void crew.person(crewId(305), hall, V(28, 0, -2.3), "Repair tech", { lines: ["Hashboard three is toast.", "Reflowing this one.", "Who brought a coffee near the PSU?"], face: V(0, 0, 1) });
  // the control room: operators at the desks, the shift supervisor walking the tiers
  control.seats.forEach((p, i) => {
    if (i % 2 && i !== 11) return;
    void crew.person(crewId(400 + i), hall, p, i === 11 ? "Shift lead" : "Operator", { lines: LINES.control, face: V(0, 0, -1), hat: null, vest: null, perch: 0.45, near: 7 });
  });
  void crew.person(crewId(420), hall, V(-10, CTRL.y, -6.6), "Shift supervisor", { lines: ["Keep the pods green, people.", "Who's on the press tonight?", "Nice block, everyone."], hat: null, vest: null }).then((p) => {
    if (!p) return;
    void (async () => {
      for (let i = 0; ; i++) {
        p.s.faceDir = null;
        await p.s.walk([V(-14 + (i % 4) * 9, CTRL.y, -6.7)], 1.0);
        p.s.faceDir = V(0, 0, -1);
        await sleep(5000 + hash(i, 3, 3, 3) * 5000);
      }
    })();
  });
  // inspectors on the catwalks
  const catRoutes: THREE.Vector3[][] = [
    [V(0, CAT_Y, -14), V(0, CAT_Y, -38.9), V(-33.9, CAT_Y, -38.9), V(-33.9, CAT_Y, -62.9), V(-9, CAT_Y, -62.9), V(-33.9, CAT_Y, -62.9), V(-33.9, CAT_Y, -38.9), V(0, CAT_Y, -38.9)],
    [V(33.1, CAT_Y, -12.5), V(33.1, CAT_Y, -62.9), V(9, CAT_Y, -62.9), V(33.1, CAT_Y, -62.9), V(33.1, CAT_Y, -38.9), V(0, CAT_Y, -38.9), V(0, CAT_Y, -12.5)],
  ];
  catRoutes.forEach((route, i) => {
    void crew.person(crewId(500 + i), hall, route[0].clone(), "Inspector", { lines: LINES.catwalk, vest: "#c8f030" }).then((p) => {
      if (!p) return;
      void (async () => {
        for (let k = 1; ; k++) {
          await p.s.walk([route[k % route.length]], 1.1);
          await sleep(1500);
        }
      })();
    });
  });

  if (new URLSearchParams(location.search).has("debug")) Object.assign(window, { __factory: { fleet, line, racks, crew } });

  // ---- floors ---------------------------------------------------------------------------------
  function setFloor(n: number) {
    floorNow = n;
  }
  function setTheme(theme: Theme) {
    const day = theme === "day";
    shell.setTheme(theme);
    hemi.intensity = day ? 0.75 : 0.42;
    hemi.color.set(day ? "#e8f0ff" : "#c8c0ff");
    hemi.groundColor.set("#2a2420");
    sun.intensity = day ? 1.1 : 0;
    scene.environmentIntensity = day ? 0.45 : 0.28;
    (scene.fog as THREE.Fog).color.set(day ? "#2a2c36" : "#0e0d16");
    scene.background = new THREE.Color(day ? "#2a2c36" : "#0b0a12");
  }
  setTheme(ctx.theme);

  // ---- picking ------------------------------------------------------------------------------------
  const vehicleOf = (o: THREE.Object3D | null): Vehicle | null => {
    for (let x = o; x; x = x.parent) if (x.userData.vehicle) return x.userData.vehicle as Vehicle;
    return null;
  };
  for (const v of fleet.vehicles) pickables.push(v.m.g);
  pickables.push(...line.pickables);
  const allPicks = () => [...pickables, racks.units, ...crew.people.map((p) => p.s.body)];
  const VEH_NAME: Record<string, string> = { forklift: "Forklift", tugger: "Tugger train", cart: "Utility cart", lift: "Scissor lift", agv: "Automated guided vehicle" };

  // ---- frame --------------------------------------------------------------------------------------
  const camQuat = new THREE.Quaternion();
  const camRight = new THREE.Vector3();
  const camPos = new THREE.Vector3();
  let nextWall = 0,
    nextMon = 0;

  return {
    key: "factory",
    title: "PROOF FACTORY",
    scene,
    floors: [
      { label: "G", name: "Mining floor", y: 0, spawn: V(0, 0, -3.2), yaw: 0 },
      { label: "1", name: "Control room", y: CTRL.y, spawn: V(0, CTRL.y, -1.6), yaw: 0 },
      { label: "2", name: "Catwalks", y: CAT_Y, spawn: V(0, CAT_Y, -7.5), yaw: 0 },
    ],
    colliders: (f) => (f === 0 ? ground : f === 1 ? upper : cat),
    setFloor,
    setTheme,
    groundAt: (f, x, z) => (f === 1 ? control.groundAt(x, z) : null),
    pickables: allPicks,
    pick(hit): PickInfo | null {
      const o = hit.object;
      const it = o.userData.item as Item | undefined;
      if (it?.block) {
        const b = it.block;
        return {
          eyebrow: "Block crate · stamped by the press",
          title: `#${fmt(b.height)}`,
          mono: true,
          tag: [it.state === "truck" ? "Loaded, waiting to ship" : it.state === "agv" ? "On the AGV" : it.state === "robot" ? "In the robot's grip" : "On the line", it.state === "truck" ? "info" : "ok"],
          stats: [
            ["Transactions", fmt(b.txs)],
            ["Miner", b.pool],
            ["Size", b.size ? `${fmt(b.size / 1000, 1)} kB` : "—"],
            ["Fees", b.fees == null ? "—" : `${(b.fees / 1e8).toFixed(5)} ZEC`],
          ],
          link: { href: links.block(b.height), label: "Block on ZScan" },
        };
      }
      if (it?.tx) {
        const t = it.tx;
        return {
          eyebrow: "Parcel · proved transaction",
          title: shortId(t.txid),
          mono: true,
          tag: [it.state === "truck" ? "Waiting for the truck to leave" : "On the line", it.state === "truck" ? "info" : "ok"],
          stats: [
            ["Kind", KIND_LABEL[t.kind]],
            ["Actions", String(t.actions)],
            ["Size", `${fmt(t.size / 1000, 1)} kB`],
            ["Fee", t.fee == null ? "—" : `${(t.fee / 1e8).toFixed(5)} ZEC`],
          ],
          link: { href: links.tx(t.txid), label: "Transaction on ZScan" },
        };
      }
      if (o === racks.units && hit.instanceId !== undefined) {
        const r = racks.rackOfUnit(hit.instanceId);
        const seg = racks.segOfRack(r);
        const pool = racks.poolOfRack(r);
        const m = pool?.miner;
        const n = racks.segs.filter((s) => s.pool === seg.pool).length;
        return {
          eyebrow: `Pod ${seg.pod}${seg.half} · rack ${(r - seg.first) % 15 + 1} · ${pool ? "mining pool" : "unassigned"}`,
          title: pool?.name ?? "Pod",
          tag: [clock < flashUntil[seg.pool] ? "Found a block" : "Hashing", "ok"],
          stats: m
            ? [
                ["Blocks (7d)", fmt(m.blocks)],
                ["Share", `${(pool!.share * 100).toFixed(1)}%`],
                ["Rewards", `${fmt(m.rewards / 1e8, 1)} ZEC`],
                ["Half-pods", String(n)],
              ]
            : [
                ["Share", pool ? `${(pool.share * 100).toFixed(1)}%` : "—"],
                ["Half-pods", String(n)],
              ],
          body: m ? `<p style="font-family:monospace;word-break:break-all;opacity:.7">${esc(m.address)}${m.tag ? `<br>${esc(m.tag)}` : ""}</p>` : undefined,
          link: m ? { href: links.block(m.last_block), label: "Its last block on ZScan" } : undefined,
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
          eyebrow: `Proof Factory · ${s.role ?? "Crew"}`,
          title: s.name,
          image: ZScan.zkSnarkImage(s.id),
        };
      }
      const v = vehicleOf(o);
      if (v) {
        const load = v.kind === "agv" ? line.items.filter((i) => i.state === "agv") : [];
        return {
          eyebrow: `Fleet · ${VEH_NAME[v.kind]}`,
          title: v.id,
          mono: true,
          tag: [v.busy ? "Working" : v.speed > 0.05 ? "Driving" : v.blocked ? "Waiting" : "Parked", v.speed > 0.05 || v.busy ? "ok" : "muted"],
          stats: [
            ["Speed", `${(v.speed * 3.6).toFixed(1)} km/h`],
            ...(v.kind === "agv" ? ([["Load", load.length ? load.map((i) => (i.block ? `#${fmt(i.block.height)}` : "parcel")).join(", ") : "empty"]] as [string, string][]) : []),
          ],
        };
      }
      return null;
    },
    hover(hit) {
      const o = hit.object;
      const it = o.userData.item as Item | undefined;
      if (it?.block) return `<b>Block #${fmt(it.block.height)}</b><span>${it.block.txs} tx · ${esc(it.block.pool)}</span>`;
      if (it?.tx) return `<b>${shortId(it.tx.txid)}</b><span>${KIND_LABEL[it.tx.kind]} · proved</span>`;
      if (o === racks.units && hit.instanceId !== undefined) {
        const r = racks.rackOfUnit(hit.instanceId);
        const seg = racks.segOfRack(r);
        const pool = racks.poolOfRack(r);
        return `<b>Pod ${seg.pod}${seg.half}</b><span>${esc(pool?.name ?? "—")}${pool ? ` · ${(pool.share * 100).toFixed(1)}% of blocks` : ""}</span>`;
      }
      if (o === screen) return "Live network wall";
      if (o.userData.monitor) return `Control room · ${o.userData.monitor}`;
      const s = o.userData.snark as Snark | undefined;
      if (s) return `${s.name} · ${s.role}`;
      const v = vehicleOf(o);
      if (v) return `<b>${v.id}</b><span>${VEH_NAME[v.kind]}</span>`;
      return null;
    },
    update(dt, t, camera) {
      lastUpdate = performance.now();
      clock = t;
      TIME.value = t;
      for (let i = 0; i < 9; i++) FLASH.value[i] = t < flashUntil[i] ? Math.min(1, (flashUntil[i] - t) / 1.5) : 0;
      camera.getWorldQuaternion(camQuat);
      camera.getWorldPosition(camPos);
      camRight.set(1, 0, 0).applyQuaternion(camQuat);
      crew.eye.copy(camPos);
      crew.update(dt, t, camQuat, camRight);
      shell.update(dt, t);
      fleet.update(dt, t, camPos, floorNow === 0);
      line.update(dt, t);
      st.porter = line.status();
      if (t >= nextWall) {
        nextWall = t + 0.25;
        drawWall(wallCanvas.g, t, st);
        wallTex.needsUpdate = true;
        screenGlow.color.set(performance.now() < st.flashUntil ? GOLD : "#8fd0ff");
      }
      if (t >= nextMon) {
        nextMon = t + 0.15;
        control.update(t, st, floorNow === 1);
      }
    },
  };
}
