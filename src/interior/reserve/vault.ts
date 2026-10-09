import * as THREE from "three";
import { Market } from "../../data/market";
import { drawTerminal, screen as bankScreen, surface as bankSurface } from "../bank/art";
import { barGeometry, kiosk, KIOSK_SCREEN } from "../bank/props";
import { chair } from "../furniture";
import type { PickInfo } from "../types";
import { bankerLamp, desk } from "./arch";
import { board, drawPoolPlate, poolInfo, POOL_COLOR, POOL_NAME, supplyInfo, type PoolKey } from "./data";
import { C, F, GOLD, LEVELS, MONO, num, paint, SANS, SERIF, zec, type ReserveKit } from "./kit";
import { VAULT_STAIR } from "./stair";

/**
 * Underground. Minus one: the gold vault behind a round door three metres across that swings open
 * when you arrive; one steel cage per value pool, its racks stacked with gold bars in proportion
 * to the ZEC the chain holds there (square-root scale, so Sprout's last bars still show).
 * Minus two: safe deposit boxes floor to ceiling, the NU6 lockbox in its own safe, the coin room
 * where 21 stacks stand for the 21 million (filled to the live supply), a key deposit terminal.
 */

const V = F.vault;
const D = F.deposit;
const BAR = { w: 0.28, h: 0.085, d: 0.13 };

interface Cage {
  k: PoolKey;
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  /** The side its gate opens on (towards the aisle). */
  gate: "e" | "w" | "s";
}

const CAGES: Cage[] = [
  { k: "orchard", x0: -21, z0: -24, x1: -4.5, z1: -13, gate: "e" },
  { k: "sapling", x0: -21, z0: -36, x1: -4.5, z1: -25, gate: "e" },
  { k: "ironwood", x0: 4.5, z0: -24, x1: 21, z1: -13, gate: "w" },
  { k: "sprout", x0: 4.5, z0: -36, x1: 21, z1: -25, gate: "w" },
  { k: "transparent", x0: -14, z0: -47, x1: 14, z1: -38, gate: "s" },
];

/** Bars for a pool: square-root scale. */
const barsFor = (zat: number) => Math.max(4, Math.round(Math.sqrt(zat / 1e8) * 1.6));

export function vault(k: ReserveKit) {
  const L = LEVELS[V];
  const H = L.h;

  // ---- shell: epoxy floor with yellow lines, concrete walls, strip lights ----
  const floorTex = paint(
    256,
    256,
    (c, W, Hh) => {
      c.fillStyle = "#3a3c42";
      c.fillRect(0, 0, W, Hh);
      for (let n = 0; n < 900; n++) {
        c.fillStyle = `rgba(255,255,255,${k.rnd(n, 1) * 0.05})`;
        c.fillRect(k.rnd(n, 2) * W, k.rnd(n, 3) * Hh, 2, 2);
      }
      c.strokeStyle = "rgba(0,0,0,0.35)";
      c.lineWidth = 2;
      c.strokeRect(0, 0, W, Hh);
    },
    22,
    24,
  );
  k.flat(V, 44, 48, new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.35, metalness: 0.2 }), 0, -24, 0);
  for (const x of [-3.2, 3.2]) k.box(V, 0.14, 0.01, 36, x, 0.006, -29.5, "#e8b923", "matte");
  k.box(V, 6.4, 0.01, 0.14, 0, 0.006, -11.6, "#e8b923", "matte");
  for (let z = -13; z > -37; z -= 1.2) k.box(V, 0.6, 0.01, 0.12, 0, 0.006, z, "#e8b923", "matte");
  k.box(V, 44, 0.3, 48, 0, H, -24, "#2a2a2f", "matte");
  for (let z = -13; z > -47; z -= 4) for (const x of [-12, 0, 12]) k.box(V, 0.2, 0.06, 2.4, x, H - 0.08, z, "#e8f2ff", "glow");
  const conc = "#4a4a50";
  k.wall(V, -22, -48, 22, -48, H, conc);
  // the west wall, with the doorway of the governors' stair in its north-west corner (stair.ts)
  const [sd0, sd1, sdh] = VAULT_STAIR.vaultDoor;
  k.wall(V, -22, -48, -22, sd0, H, conc);
  k.wall(V, -22, sd1, -22, -11, H, conc);
  k.box(V, 0.3, H - sdh, sd1 - sd0, -22, sdh, (sd0 + sd1) / 2, conc);
  k.wall(V, 22, -48, 22, -11, H, conc);
  // the lobby
  k.wall(V, -7, 0, 7, 0, H, "#55555c");
  k.wall(V, -7, -9, -7, 0, H, "#55555c");
  k.wall(V, 7, -9, 7, 0, H, "#55555c");
  k.box(V, 14, 0.3, 9, 0, H, -4.5, "#2a2a2f", "matte");
  for (const x of [-6.85, 6.85]) k.box(V, 0.04, 0.12, 8.6, x, 0.15, -4.5, GOLD, "glow");
  for (const z of [-2, -6]) k.box(V, 3, 0.06, 0.2, 0, H - 0.08, z, "#e8f2ff", "glow");
  k.lifts(V, 0, -0.16, Math.PI);
  k.label(V, "GOLD VAULT", -6.84, 4.2, -4.5, { h: 0.5, color: GOLD, font: `800 96px ${SANS}`, ry: Math.PI / 2 });
  k.label(V, "金庫", 6.84, 4.2, -4.5, { h: 0.7, color: GOLD, font: `800 110px ${SANS}`, ry: -Math.PI / 2 });

  // ---- the vault wall: two metres of steel and concrete with a round opening ----
  const R = 2.9,
    CY = 2.82;
  const a0 = Math.asin((0 - CY) / R);
  const hx = Math.cos(a0) * R;
  // the outline runs along the floor, up and over the opening, and round the wall
  const shape = new THREE.Shape();
  shape.moveTo(-22, 0);
  shape.lineTo(-hx, 0);
  shape.absarc(0, CY, R, Math.PI - a0, a0, true);
  shape.lineTo(22, 0);
  shape.lineTo(22, H);
  shape.lineTo(-22, H);
  shape.lineTo(-22, 0);
  const wallGeo = new THREE.ExtrudeGeometry(shape, { depth: 2, bevelEnabled: false, curveSegments: 40 });
  wallGeo.translate(0, 0, -11);
  k.geo(V, wallGeo, "#6a6d76", "metal");
  // a gold ring round the opening, rivets on the face
  const rimGeo = new THREE.TorusGeometry(R + 0.12, 0.12, 8, 64, Math.PI - 2 * a0).rotateZ(a0).translate(0, CY, -8.95);
  k.geo(V, rimGeo, GOLD, "metal");
  for (let x = -21; x <= 21; x += 1) for (let y = 0.5; y < H; y += 1) if (Math.hypot(x, y - CY) > R + 0.6) k.cyl(V, 0.05, 0.05, 0.04, x, y, -8.98, "#9a9da6", "metal", 6);
  for (let x = -7; x <= 7; x += 0.6) if (Math.abs(x) > Math.cos(a0) * R + 0.2) k.box(V, 0.3, 0.02, 0.4, x, 0.01, -8.8, Math.round(x / 0.6) % 2 ? "#e8b923" : "#111", "matte");
  const hw = Math.cos(a0) * R - 0.2;
  k.solid(V, -22, -11, -hw, -9);
  k.solid(V, hw, -11, 22, -9);

  // the door: a steel disc on a hinge, bolts round the rim, the wheel, the seal
  const doorPivot = new THREE.Group();
  const door = new THREE.Group();
  door.position.x = -(R + 0.05);
  doorPivot.add(door);
  const steel = new THREE.MeshStandardMaterial({ color: "#5c6068", metalness: 0.85, roughness: 0.38 });
  const steelDark = new THREE.MeshStandardMaterial({ color: "#4a4d55", metalness: 0.85, roughness: 0.4 });
  const gold = new THREE.MeshStandardMaterial({ color: "#d9a632", metalness: 0.95, roughness: 0.22 });
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.05, R + 0.05, 0.9, 64).rotateX(Math.PI / 2), steel);
  disc.position.z = 0.45;
  door.add(disc);
  for (let r = R - 0.4; r > 0.8; r -= 0.45) {
    const t = new THREE.Mesh(new THREE.TorusGeometry(r, 0.05, 6, 64), r > 2 ? gold : steelDark);
    t.position.z = 0.92;
    door.add(t);
  }
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.7, 12), steel);
    b.position.set(Math.cos(a) * (R + 0.2), Math.sin(a) * (R + 0.2), 0.45);
    b.rotation.z = a + Math.PI / 2;
    door.add(b);
  }
  const wheel = new THREE.Group();
  wheel.add(new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.07, 8, 40), gold));
  for (let i = 0; i < 3; i++) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.09, 0.09), gold);
    s.rotation.z = (i / 3) * Math.PI;
    wheel.add(s);
  }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.3, 24).rotateX(Math.PI / 2), gold);
  wheel.add(hub);
  wheel.position.z = 1.15;
  door.add(wheel);
  const seal = paint(256, 256, (c, W, Hh) => {
    c.fillStyle = "#1a1408";
    c.beginPath();
    c.arc(W / 2, Hh / 2, 126, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = GOLD;
    c.font = `900 170px ${SERIF}`;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText("Z", W / 2, Hh / 2 + 8);
  });
  const sealM = new THREE.Mesh(new THREE.CircleGeometry(0.26, 32), new THREE.MeshBasicMaterial({ map: seal, toneMapped: false }));
  sealM.position.z = 1.31;
  door.add(sealM);
  // the hinge
  for (const y of [-1.6, 0, 1.6]) {
    const h = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.9, 16), steelDark);
    h.position.set(R + 0.15, y, 0.5);
    door.add(h);
  }
  door.traverse((o) => (o.raycast = () => {}));
  k.add(V, doorPivot, R + 0.05, CY, -9.05, 0);
  let open = 0,
    target = 0;
  k.arrive[V].push(() => {
    open = 0;
    target = 0;
    setTimeout(() => (target = 1), 600);
  });
  k.ticks[V].push((dt) => {
    if (open < target) open = Math.min(target, open + dt * 0.3);
    const e = open < 0.5 ? 2 * open * open : 1 - Math.pow(-2 * open + 2, 2) / 2;
    doorPivot.rotation.y = e * 1.85;
    wheel.rotation.z = Math.min(1, open * 4) * Math.PI * 2;
  });
  k.solid(V, R - 0.3, -9, R + 2.0, -3.1);
  k.hit(V, 2 * R, 2 * R, 1.6, 0, CY - R, -9.2, "<b>Vault door</b><span>Gold vault</span>", () => ({ eyebrow: "Gold vault", title: "Vault door", stats: [["Diameter", "6 m"], ["Bolts", "16"]] }));

  // ---- cages, racks, gold ----
  const mesh = paint(128, 128, (c, W, Hh) => {
    c.clearRect(0, 0, W, Hh);
    c.strokeStyle = "#9aa0aa";
    c.lineWidth = 5;
    for (let i = -W; i < W * 2; i += 32) {
      c.beginPath();
      c.moveTo(i, 0);
      c.lineTo(i + Hh, Hh);
      c.stroke();
      c.beginPath();
      c.moveTo(i + Hh, 0);
      c.lineTo(i, Hh);
      c.stroke();
    }
  });
  mesh.wrapS = mesh.wrapT = THREE.RepeatWrapping;
  const barGeo = barGeometry(BAR.w, BAR.h, BAR.d);
  const barMat = new THREE.MeshStandardMaterial({ color: "#f0b52a", metalness: 1, roughness: 0.22, emissive: "#3a2600", envMapIntensity: 1.6 });
  const updaters: (() => void)[] = [];
  for (const cage of CAGES) updaters.push(buildCage(k, cage, mesh, barGeo, barMat));
  Market.subscribe(() => updaters.forEach((u) => u()));

  // ---- the aisle: a scale, a cart, a clerk's desk ----
  k.box(V, 1.4, 0.9, 0.8, 0, 0, -26, "#2a2c33", "metal");
  k.box(V, 1.5, 0.05, 0.9, 0, 0.9, -26, "#cfd3da", "polish");
  k.cyl(V, 0.03, 0.03, 0.6, 0, 0.95, -26, C.brass, "metal", 6);
  k.box(V, 1.0, 0.04, 0.04, 0, 1.52, -26, C.brass, "metal");
  for (const x of [-0.5, 0.5]) {
    k.cyl(V, 0.18, 0.18, 0.02, x, 1.2, -26, C.brass, "metal", 16);
    k.box(V, 0.01, 0.32, 0.01, x, 1.22, -26, C.brass, "metal");
  }
  k.box(V, BAR.w, BAR.h, BAR.d, -0.5, 1.22, -26, "#f0b52a", "metal");
  k.solid(V, -0.75, -26.45, 0.75, -25.55);
  k.label(V, "400 oz · 99.99", 0, 1.0, -25.58, { h: 0.08, color: "#e8e2d0", glow: false });
  // a trolley of bars
  k.box(V, 1.0, 0.06, 0.6, 1.5, 0.35, -31, "#5d6470", "metal");
  for (const x of [1.05, 1.95]) for (const z of [-31.25, -30.75]) k.cyl(V, 0.08, 0.08, 0.05, x, 0.05, z, "#222", "matte", 10);
  k.box(V, 0.04, 0.9, 0.6, 1.0, 0.35, -31, "#5d6470", "metal");
  for (let i = 0; i < 12; i++) k.box(V, BAR.w, BAR.h, BAR.d, 1.3 + (i % 3) * 0.3, 0.41 + Math.floor(i / 6) * BAR.h, -31.2 + (Math.floor(i / 3) % 2) * 0.3, "#f0b52a", "metal");
  k.solid(V, 0.95, -31.35, 2.05, -30.65);
  // the clerk's desk in the lobby
  desk(k, V, -4.8, -5.5, 1.6, 0.8, Math.PI / 2);
  bankerLamp(k, V, -4.8, 0.78, -6, Math.PI / 2);
  k.box(V, 0.5, 0.04, 0.35, -4.7, 0.78, -5.2, "#3a1a10", "matte");

  // ---- light: one per pair of cages, the lobby, the transparent cage ----
  k.light(V, 0, 5, -4, "#e8f0ff", 14, 14);
  k.light(V, -12, 5, -18.5, "#ffe2a8", 22, 18);
  k.light(V, 12, 5, -18.5, "#ffe2a8", 22, 18);
  k.light(V, -12, 5, -30.5, "#ffe2a8", 22, 18);
  k.light(V, 12, 5, -30.5, "#ffe2a8", 22, 18);
  k.light(V, 0, 5, -42, "#ffe2a8", 26, 20);

  k.onCast(V, () => {
    const g1 = k.person(V, 5101, [-2.2, -7.6], "Vault guard", { face: [0, 1], lines: ["Vault's open. Look, don't touch.", "Sixteen bolts. Six metres of steel.", "Every bar is counted. Every block."] });
    const g2 = k.person(V, 5102, [2.0, -12.6], "Vault guard", { face: [-1, 0] });
    k.dialog(V, [g1, g2], [
      [0, "Door's open."],
      [1, "Copy. Cages clear."],
      [0, () => `Block ${num(k.height)}. Recount the Ironwood cage.`],
      [1, "On it."],
    ], { near: 14 });
    k.person(V, 5103, [-4.8, -4.6], "Vault clerk", { face: [-1, 0], sit: true, lines: ["Signing you in.", "Ledger reconciled to the zatoshi."] });
    k.person(V, 5104, [0.0, -25.1], "Assayer", { face: [0, -1], lines: ["Four hundred ounces. Nine nine nine nine.", "Weighs the same shielded or not."] });
    k.person(V, 5105, [2.2, -30.2], "Porter", { face: [0, -1], wander: [[2.2, -30.2], [-1.8, -20], [1.8, -34], [-1.5, -36.5]], lines: ["Bars for the Ironwood cage.", "Mind your feet."] });
    const a = k.person(V, 5106, [-2.0, -18], "Auditor", { face: [-1, 0] });
    const b = k.person(V, 5107, [-2.2, -19.2], "Auditor", { face: [1, 0] });
    k.dialog(V, [a, b], [
      [0, () => `Orchard: ${zec(Market.state.pools?.pools.orchard ?? 0)}.`],
      [1, "Matches the chain."],
      [0, () => `Ironwood: ${zec(Market.state.pools?.pools.ironwood ?? 0)}.`],
      [1, "Matches the chain. Next."],
    ]);
    k.person(V, 5108, [0, -36.8], "Visitor", { face: [0, -1], lines: ["So that's the transparent pile…", "Everyone can count that one."] });
  });
}

/** One cage: mesh walls with a gate, a plate over it, racks with the pool's bars, a glow in its colour. */
function buildCage(k: ReserveKit, c: Cage, mesh: THREE.Texture, barGeo: THREE.BufferGeometry, barMat: THREE.Material) {
  const H = 3.6;
  const col = POOL_COLOR[c.k];
  const grid = (len: number) => {
    const t = mesh.clone();
    t.repeat.set(len / 0.5, H / 0.5);
    t.needsUpdate = true;
    return new THREE.MeshStandardMaterial({ map: t, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, metalness: 0.7, roughness: 0.4 });
  };
  const sides: [number, number, number, number, boolean][] = [
    [c.x0, c.z0, c.x1, c.z0, false],
    [c.x0, c.z1, c.x1, c.z1, c.gate === "s"],
    [c.x0, c.z0, c.x0, c.z1, c.gate === "w"],
    [c.x1, c.z0, c.x1, c.z1, c.gate === "e"],
  ];
  const gateMid = c.gate === "s" ? (c.x0 + c.x1) / 2 : (c.z0 + c.z1) / 2;
  for (const [x0, z0, x1, z1, gated] of sides) {
    const alongX = z0 === z1;
    const a = alongX ? x0 : z0,
      b = alongX ? x1 : z1;
    const segs: [number, number][] = gated ? [[a, gateMid - 1.1], [gateMid + 1.1, b]] : [[a, b]];
    for (const [s, e] of segs) {
      const len = e - s;
      if (len < 0.1) continue;
      const mid = (s + e) / 2;
      const px = alongX ? mid : x0,
        pz = alongX ? z0 : mid;
      k.plane(V, len, H, grid(len), px, H / 2, pz, 0, alongX ? 0 : Math.PI / 2).raycast = () => {};
      k.box(V, alongX ? len : 0.08, 0.1, alongX ? 0.08 : len, px, H - 0.1, pz, "#5d6470", "metal");
      k.box(V, alongX ? len : 0.08, 0.1, alongX ? 0.08 : len, px, 0, pz, "#5d6470", "metal");
      for (let t = s; t <= e + 0.01; t += 1.5) k.box(V, 0.09, H, 0.09, alongX ? t : x0, 0, alongX ? z0 : t, "#5d6470", "metal");
      k.solid(V, (alongX ? s : x0) - 0.06, (alongX ? z0 : s) - 0.06, (alongX ? e : x0) + 0.06, (alongX ? z0 : e) + 0.06);
    }
    if (gated) {
      // the gate, swung open against the cage, a padlock hanging off it
      const gx = alongX ? gateMid - 1.1 : x0,
        gz = alongX ? z0 : gateMid - 1.1;
      const gp = k.plane(V, 2.2, H - 0.2, grid(2.2), 0, 0, 0);
      gp.raycast = () => {};
      const out = c.gate === "e" ? 1 : c.gate === "w" ? -1 : 1;
      if (alongX) {
        gp.position.set(gx - 0.05, LEVELS[V].y + H / 2 - 0.1, gz + 1.1 * out);
        gp.rotation.y = Math.PI / 2;
      } else {
        gp.position.set(gx + 1.1 * out, LEVELS[V].y + H / 2 - 0.1, gz - 0.05);
        gp.rotation.y = 0;
      }
      k.box(V, 0.12, H, 0.12, alongX ? gateMid - 1.1 : x0, 0, alongX ? z0 : gateMid - 1.1, "#3a3d44", "metal");
      k.box(V, 0.12, H, 0.12, alongX ? gateMid + 1.1 : x0, 0, alongX ? z0 : gateMid + 1.1, "#3a3d44", "metal");
      k.box(V, alongX ? 2.3 : 0.14, 0.14, alongX ? 0.14 : 2.3, alongX ? gateMid : x0, H - 0.14, alongX ? z0 : gateMid, "#3a3d44", "metal");
      // the plate over the gate
      const plate = k.screen(V, 2.4, 1.0, (g, W, Hh) => drawPoolPlate(g, W, Hh, c.k), 8, 512);
      const ox = alongX ? gateMid : x0 + (c.gate === "e" ? 0.08 : -0.08),
        oz = alongX ? z0 + 0.08 : gateMid;
      k.add(V, plate, ox, H + 0.75, oz, c.gate === "e" ? Math.PI / 2 : c.gate === "w" ? -Math.PI / 2 : 0);
      k.box(V, alongX ? 2.6 : 0.1, 1.2, alongX ? 0.1 : 2.6, alongX ? gateMid : x0, H + 0.15, alongX ? z0 : gateMid, "#16161b", "polish");
      k.pick(V, plate, `<b>${POOL_NAME[c.k]}</b><span>gold vault · cage</span>`, () => poolInfo(c.k));
    }
  }
  // a glow strip in the pool's colour along the top of the cage
  for (const [x0, z0, x1, z1] of sides) k.box(V, Math.max(0.05, Math.abs(x1 - x0)), 0.05, Math.max(0.05, Math.abs(z1 - z0)), (x0 + x1) / 2, H + 0.02, (z0 + z1) / 2, new THREE.Color(col).multiplyScalar(1.6), "glow");
  k.hit(V, c.x1 - c.x0 - 1, 2.6, c.z1 - c.z0 - 1, (c.x0 + c.x1) / 2, 0.2, (c.z0 + c.z1) / 2, `<b>${POOL_NAME[c.k]} cage</b><span>gold vault</span>`, () => poolInfo(c.k));

  // racks: rows of steel shelving, three shelves high; bars fill them in order
  const slots: THREE.Matrix4[] = [];
  const along = c.gate === "s";
  const RW = along ? c.x1 - c.x0 - 2.4 : c.z1 - c.z0 - 2.4;
  const rows: number[] = [];
  if (along) for (let z = c.z0 + 1.3; z < c.z1 - 2.2; z += 2.0) rows.push(z);
  else {
    const inner = c.gate === "e" ? -1 : 1;
    const xs = [];
    const edge = c.gate === "e" ? c.x1 : c.x0;
    for (let d = 3.4; d < c.x1 - c.x0 - 1; d += 2.0) xs.push(edge + inner * d);
    rows.push(...xs);
  }
  const shelfY = [0.15, 0.95, 1.75, 2.55];
  for (const r of rows) {
    const cx = along ? (c.x0 + c.x1) / 2 : r,
      cz = along ? r : (c.z0 + c.z1) / 2;
    const w = along ? RW : 0.62,
      d = along ? 0.62 : RW;
    for (const y of shelfY) k.box(V, w, 0.04, d, cx, y, cz, "#6a707a", "metal");
    for (const s of [-0.5, 0.5])
      for (const e of [-1, 1]) {
        const px = along ? cx + s * RW : cx + e * 0.3,
          pz = along ? cz + e * 0.3 : cz + s * RW;
        k.box(V, 0.06, 3.0, 0.06, px, 0, pz, "#3a3d44", "metal");
      }
    k.solid(V, cx - w / 2 - 0.05, cz - d / 2 - 0.05, cx + w / 2 + 0.05, cz + d / 2 + 0.05);
    // slots on each shelf: bars across the shelf, stacked in alternating layers
    for (const y of shelfY.slice(0, 3)) {
      const n = Math.floor((RW - 0.2) / (BAR.d + 0.015));
      for (let layer = 0; layer < 3; layer++)
        for (let i = 0; i < n - layer; i++)
          for (let j = 0; j < 2; j++) {
            const u = -RW / 2 + 0.1 + (i + layer / 2 + 0.5) * (BAR.d + 0.015);
            const v = (j - 0.5) * (BAR.w + 0.02);
            const m = new THREE.Matrix4().compose(
              new THREE.Vector3(along ? cx + u : cx + v, LEVELS[V].y + y + 0.04 + layer * BAR.h, along ? cz + v : cz + u),
              new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), along ? Math.PI / 2 : 0),
              new THREE.Vector3(1, 1, 1),
            );
            slots.push(m);
          }
    }
  }
  // fill order: shelf by shelf, bottom layer first, so a pool's gold reads as how far it reaches
  const im = new THREE.InstancedMesh(barGeo, barMat, Math.max(1, slots.length));
  im.count = 0;
  im.raycast = () => {};
  k.groups[V].add(im);
  return () => {
    const zat = Market.state.pools?.pools[c.k];
    if (zat == null) return;
    const n = Math.min(slots.length, barsFor(zat));
    for (let i = 0; i < n; i++) im.setMatrixAt(i, slots[i]);
    im.count = n;
    im.instanceMatrix.needsUpdate = true;
    im.computeBoundingSphere();
  };
}

// ---- minus two: safe deposit, the lockbox, the coin room ----------------------------------------

export function deposit(k: ReserveKit) {
  const L = LEVELS[D];
  const H = L.h;
  const floorTex = paint(
    256,
    256,
    (c, W, Hh) => {
      c.fillStyle = "#1c1a17";
      c.fillRect(0, 0, W, Hh);
      c.fillStyle = "#2a2620";
      c.fillRect(0, 0, W / 2, Hh / 2);
      c.fillRect(W / 2, Hh / 2, W / 2, Hh / 2);
      c.strokeStyle = "#8a6a35";
      c.lineWidth = 3;
      c.strokeRect(0, 0, W, Hh);
    },
    16,
    15,
  );
  k.flat(D, 32, 30, new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.25, metalness: 0.1 }), 0, -15, 0);
  k.box(D, 32, 0.3, 30, 0, H, -15, "#1a1816", "matte");
  for (let x = -12; x <= 12; x += 6) k.box(D, 4, 0.04, 0.3, x, H - 0.05, -15, "#ffe6b8", "glow");
  for (let x = -12; x <= 12; x += 6) k.box(D, 4, 0.04, 0.3, x, H - 0.05, -5, "#ffe6b8", "glow");
  k.wall(D, -16, -30, 16, -30, H, "#3a3328");
  k.wall(D, -16, -30, -16, 0, H, "#3a3328");
  k.wall(D, 16, -30, 16, 0, H, "#3a3328");
  k.wall(D, -16, 0, 16, 0, H, "#3a3328");
  k.lifts(D, -15.95, -15, Math.PI / 2);

  // safe deposit boxes: brass doors, numbered, floor to ceiling on three walls
  const boxes = paint(512, 512, (c, W, Hh) => {
    c.fillStyle = "#3a2c16";
    c.fillRect(0, 0, W, Hh);
    const cw = W / 4,
      ch = Hh / 6;
    for (let i = 0; i < 4; i++)
      for (let j = 0; j < 6; j++) {
        const x = i * cw + 4,
          y = j * ch + 4;
        const g = c.createLinearGradient(x, y, x + cw, y + ch);
        g.addColorStop(0, "#d4ac5a");
        g.addColorStop(1, "#9a7434");
        c.fillStyle = g;
        c.fillRect(x, y, cw - 8, ch - 8);
        c.strokeStyle = "#6a4c1c";
        c.lineWidth = 3;
        c.strokeRect(x + 6, y + 6, cw - 20, ch - 20);
        c.fillStyle = "#2a1c08";
        c.beginPath();
        c.arc(x + cw - 30, y + ch / 2, 7, 0, Math.PI * 2);
        c.fill();
        c.fillRect(x + cw - 32, y + ch / 2, 4, 10);
        c.fillStyle = "#3a2a10";
        c.font = `700 18px ${MONO}`;
        c.fillText(String(100 + ((i * 37 + j * 11) % 900)), x + 14, y + 26);
      }
  });
  boxes.wrapS = boxes.wrapT = THREE.RepeatWrapping;
  const boxWall = (w: number, x: number, z: number, ry: number) => {
    const t = boxes.clone();
    t.repeat.set(w / 1.6, (H - 0.6) / 1.4);
    t.needsUpdate = true;
    k.plane(D, w, H - 0.6, new THREE.MeshStandardMaterial({ map: t, metalness: 0.75, roughness: 0.35 }), x, 0.3 + (H - 0.6) / 2, z, 0, ry);
  };
  boxWall(31.4, 0, -29.84, 0);
  boxWall(20, 15.84, -10, -Math.PI / 2);
  boxWall(10, -15.84, -5, Math.PI / 2);
  boxWall(10, -15.84, -25.5, Math.PI / 2);
  boxWall(31.4, 0, -0.16, Math.PI);
  k.hit(D, 31, H - 0.6, 0.2, 0, 0.3, -29.8, "<b>Safe deposit boxes</b><span>4,212 boxes</span>", () => ({ eyebrow: "Safe deposit", title: "Safe deposit boxes", stats: [["Boxes", "4,212"], ["Keys", "2 per box"]] }));

  // the viewing tables down the middle, a booth with curtains
  for (const x of [-6, 0, 6]) {
    k.box(D, 2.6, 0.9, 1.1, x, 0, -9, "#1f3b31", "polish");
    k.box(D, 2.7, 0.06, 1.2, x, 0.9, -9, C.cream, "polish");
    k.solid(D, x - 1.35, -9.6, x + 1.35, -8.4);
    k.box(D, 0.5, 0.18, 0.3, x - 0.6, 0.96, -9, "#9a7434", "metal");
    bankerLamp(k, D, x + 0.8, 0.96, -9.3, 0);
  }

  // the lockbox: a safe of its own with the NU6 dev fund lockbox balance
  const lx = 10,
    lz = -19;
  k.box(D, 3.6, 0.3, 3.0, lx, 0, lz, "#111", "polish");
  k.box(D, 3.2, 3.2, 2.6, lx, 0.3, lz, "#2d3038", "metal");
  k.box(D, 3.3, 0.12, 2.7, lx, 3.5, lz, GOLD, "metal");
  k.box(D, 2.6, 2.6, 0.08, lx, 0.6, lz + 1.32, "#3a3e48", "metal");
  k.cyl(D, 0.42, 0.42, 0.12, lx, 1.9, lz + 1.36, GOLD, "metal", 32, 0);
  k.geo(D, new THREE.TorusGeometry(0.62, 0.05, 8, 32).translate(lx - 0.7, 1.9, lz + 1.46), GOLD, "metal");
  for (const y of [1.0, 2.8]) k.box(D, 0.18, 0.3, 0.2, lx - 1.35, y, lz + 1.3, "#1a1a1e", "metal");
  k.solid(D, lx - 1.8, lz - 1.5, lx + 1.8, lz + 1.6);
  const lockPlate = k.screen(
    D,
    2.4,
    0.9,
    (g, W, Hh) => {
      board(g, W, Hh, "LOCKBOX", "NU6 · ZIP 1015");
      const s = Market.state.supply;
      g.fillStyle = "#f6f1e6";
      g.font = `800 ${Math.round(Hh * 0.34)}px ${MONO}`;
      g.fillText(s ? `${zec(s.lockbox)} ZEC` : "…", 18, Hh * 0.82);
    },
    10,
    512,
  );
  k.add(D, lockPlate, lx, 3.95 + 0.45, lz + 1.31, 0);
  const lockInfo = (): PickInfo => {
    const s = Market.state.supply;
    const p = Market.state.price?.usd ?? 0;
    return { eyebrow: "Safe deposit · lockbox", title: s ? `${zec(s.lockbox)} ZEC` : "Lockbox", mono: true, tag: ["NU6 · ZIP 1015", "info"], stats: s ? [["Since", "NU6 · 2,726,400"], ["Value", p ? `$${Math.round((s.lockbox / 1e8) * p).toLocaleString("en-US")}` : "—"]] : [] };
  };
  k.pick(D, lockPlate, "<b>Lockbox</b><span>NU6 dev fund</span>", lockInfo);
  k.hit(D, 3.2, 3.2, 2.6, lx, 0.3, lz, "<b>Lockbox</b><span>NU6 dev fund</span>", lockInfo);

  // the coin room: 21 stacks for 21 million, filled to the live supply
  const stacks: THREE.Mesh[] = [];
  const stackGold = new THREE.MeshStandardMaterial({ color: "#e8ac2a", metalness: 1, roughness: 0.25, emissive: "#3a2600" });
  const ghost = new THREE.MeshStandardMaterial({ color: "#9ab", transparent: true, opacity: 0.12, roughness: 0.1, depthWrite: false });
  const coinTex = paint(64, 256, (c, W, Hh) => {
    c.fillStyle = "#e8ac2a";
    c.fillRect(0, 0, W, Hh);
    c.fillStyle = "#a8781a";
    for (let y = 0; y < Hh; y += 8) c.fillRect(0, y, W, 2);
  });
  coinTex.wrapT = THREE.RepeatWrapping;
  stackGold.map = coinTex;
  for (let i = 0; i < 21; i++) {
    const x = -13 + (i % 7) * 2.0,
      z = -26 + Math.floor(i / 7) * 2.6;
    k.cyl(D, 0.5, 0.5, 0.15, x, 0, z, "#1f3b31", "polish", 24);
    k.cyl(D, 0.52, 0.52, 0.03, x, 0.15, z, GOLD, "metal", 24);
    const gh = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 2.6, 24).translate(0, 1.3, 0), ghost);
    gh.raycast = () => {};
    k.add(D, gh, x, 0.18, z, 0);
    const st = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 1, 24).translate(0, 0.5, 0), stackGold);
    st.scale.y = 0.001;
    k.add(D, st, x, 0.18, z, 0);
    stacks.push(st);
    k.solid(D, x - 0.5, z - 0.5, x + 0.5, z + 0.5);
    k.label(D, `${i + 1}M`, x, 0.06, z + 0.53, { h: 0.08, color: GOLD });
    k.pick(D, st, `<b>${i + 1},000,000 ZEC</b><span>coin room</span>`, () => supplyInfo(k.height));
    k.pick(D, gh, `<b>${i + 1},000,000 ZEC</b><span>coin room</span>`, () => supplyInfo(k.height));
  }
  const fillStacks = () => {
    const s = Market.state.supply;
    if (!s) return;
    const m = s.supply / 1e8 / 1e6;
    stacks.forEach((st, i) => {
      const f = THREE.MathUtils.clamp(m - i, 0, 1);
      st.scale.y = Math.max(0.001, f * 2.6);
      st.visible = f > 0;
      (st.material as THREE.MeshStandardMaterial).map!.repeat.set(1, 1);
    });
  };
  Market.subscribe(fillStacks);
  const roomSign = k.screen(
    D,
    4.6,
    1.0,
    (g, W, Hh) => {
      board(g, W, Hh, "21,000,000", "COIN ROOM");
      const s = Market.state.supply;
      g.fillStyle = GOLD;
      g.font = `800 ${Math.round(Hh * 0.36)}px ${MONO}`;
      g.fillText(s ? `${zec(s.supply)} ZEC` : "…", 18, Hh * 0.84);
    },
    10,
    768,
  );
  k.add(D, roomSign, -7, 3.3, -29.7, 0);
  k.pick(D, roomSign, "<b>Supply</b><span>live</span>", () => supplyInfo(k.height));

  // the key deposit terminal: the viewing-key panel
  const term = bankSurface(512, 340);
  const termMat = bankScreen(term, 1, 0.667, 1.25).material as THREE.MeshBasicMaterial;
  k.vox(D, "bankKiosk", kiosk, 4, -3.5, Math.PI, { k: 1, solid: true });
  const sc = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.667), termMat);
  sc.position.set(0, KIOSK_SCREEN.y, KIOSK_SCREEN.z);
  sc.rotation.x = KIOSK_SCREEN.tilt;
  const kg = new THREE.Group();
  kg.add(sc);
  k.add(D, kg, 4, 0, -3.5, Math.PI);
  k.hit(D, 1.3, 1.9, 1.0, 4, 0, -3.5, "<b>Viewing key terminal</b><span>key deposit</span>", () => ({ eyebrow: "ZEC Reserve · safe deposit", title: "Viewing key terminal", panel: "bank" }));
  let bt = 0;
  k.ticks[D].push((dt, t) => {
    bt += dt;
    if (bt < 0.15) return;
    bt = 0;
    drawTerminal(term, Math.floor(t * 2) % 2 === 0, (t * 0.35) % 1, "KEY DEPOSIT · LOCAL DECRYPTION");
  });
  // the attendant's desk
  desk(k, D, -9, -4, 1.8, 0.9, 0);
  bankerLamp(k, D, -8.4, 0.78, -4.1, 0);
  k.vox(D, "rsvChairOffice", () => chair("#2a1a12", true), -9, -4.9, 0, { solid: false });

  k.light(D, -6, 3.8, -8, "#ffe0b0", 12, 16);
  k.light(D, 6, 3.8, -8, "#ffe0b0", 12, 16);
  k.light(D, -7, 3.8, -22, "#ffd590", 16, 16);
  k.light(D, 10, 3.8, -16, "#ffe0b0", 14, 14);

  k.onCast(D, () => {
    k.person(D, 5201, [-9, -4.9], "Attendant", { face: [0, 1], sit: true, lines: ["Two keys per box. Yours and ours.", "Booths are free.", () => `Block ${num(k.height)}. The lockbox grew again.`] });
    const a = k.person(D, 5202, [0, -8.1], "Client", { face: [0, -1] });
    const b = k.person(D, 5203, [1.1, -8.2], "Client", { face: [0, -1] });
    k.dialog(D, [a, b], [
      [0, "Grandma's coins. Sprout, 2016."],
      [1, "Still in Sprout?"],
      [0, "Moving them to Ironwood today."],
      [1, "About time."],
    ]);
    k.person(D, 5204, [10, -16.6], "Guard", { face: [0, 1], lines: ["The lockbox opens by vote.", () => `${zec(Market.state.supply?.lockbox ?? 0)} ZEC inside.`] });
    const c = k.person(D, 5205, [-6, -22.5], "Visitor", { face: [0, -1] });
    const d = k.person(D, 5206, [-4.8, -22.8], "Visitor", { face: [-1, 0] });
    k.dialog(D, [c, d], [
      [0, "Twenty-one stacks for twenty-one million."],
      [1, () => `${((Market.state.supply?.supply ?? 0) / 1e8 / 1e6).toFixed(2)} filled.`],
      [0, "The rest comes block by block."],
    ]);
    k.person(D, 5207, [4, -2.4], "Client", { face: [0, -1], lines: ["Key in. It decrypts right here.", "Viewing key, not spending key."] });
  });
}
