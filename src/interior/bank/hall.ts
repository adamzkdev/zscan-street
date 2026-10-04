import * as THREE from "three";
import type { MarketState } from "../../data/market";
import type { Snark } from "../../scene/snark";
import { VOX } from "../../scene/voxel/model";
import { glowMat } from "../kit";
import type { PickInfo, Rect } from "../types";
import { bandTexture, beamTexture, depositBoxes, drawPools, drawSupply, drawTerminal, drawTicker, fmtSigned, fmtZec, GOLD, JP, marbleFloor, neon, pct, plaque, POOL_NAME, POOLS, SANS, screen, surface, type Surface } from "./art";
import { sleep, type Cast, type Picks } from "./common";
import { V, bankerLamp, bench, ceiling, chandelier, column, counter, elevator, entrance, hallWall, holoKey, kiosk, KIOSK_SCREEN, plant, plinth, stanchion, tellerCage, vaultDoor, vaultWall, vox } from "./props";

/**
 * The banking hall (ground floor): 36 × 36 m, 12 m high. The door is at z = 0; two rows of
 * columns; the key island (four terminals around a hologram) at z = −13; five teller windows in
 * brass cages along z = −29; behind them the great round vault door set in the back wall.
 */

const W = 18,
  D = 36,
  H = 12;
const HV = 72;
const ISLAND = new THREE.Vector3(0, 0, -13);
const WINDOWS = [-15, -9, 9, 15];
const COUNTER_Z = -29;
const HEAD_Z = COUNTER_Z + 0.65;
const ROPE = [-26.6, -24.6];
const QUEUE_IN = -23.2;
const LANE = 5;
const DOOR = new THREE.Vector3(0, 0, -1.2);
const COLS_X = 11;
const COLS_Z = [-4, -10, -16, -21];

const TERMINALS = [
  { dir: new THREE.Vector3(0, 0, 1), label: "TERMINAL A" },
  { dir: new THREE.Vector3(1, 0, 0), label: "TERMINAL B" },
  { dir: new THREE.Vector3(0, 0, -1), label: "TERMINAL C" },
  { dir: new THREE.Vector3(-1, 0, 0), label: "TERMINAL D" },
];

const BANK_PICK: PickInfo = {
  eyebrow: "View key bank",
  title: "Key terminal",
  panel: "bank",
  body: "Paste a viewing key to see what it can see. Decryption runs in this browser; the key is never sent anywhere.",
};

export interface Hall {
  group: THREE.Group;
  colliders: Rect[];
  lights: THREE.PointLight[];
  setMarket(m: MarketState): void;
  block(height: number): void;
  update(dt: number, t: number): void;
}

export function buildHall(cast: Cast, picks: Picks): Hall {
  const g = new THREE.Group();
  const rects: Rect[] = [];
  const at = (o: THREE.Object3D, x: number, y: number, z: number, ry = 0) => {
    o.position.set(x, y, z);
    o.rotation.y = ry;
    g.add(o);
    return o;
  };
  const brassMat = new THREE.MeshStandardMaterial({ color: "#c89b3c", metalness: 0.85, roughness: 0.3 });

  // ---- shell ----
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(2 * W, D), new THREE.MeshStandardMaterial({ map: marbleFloor(2 * W, D, W, D + ISLAND.z), roughness: 0.2, metalness: 0.05, envMapIntensity: 0.9 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, -D / 2);
  g.add(floor);
  const wT = 0.25;
  at(vox("hallWallX", () => hallWall(2 * W * 6, HV)), 0, 0, -D - wT, 0);
  at(vox("hallWallX", () => hallWall(2 * W * 6, HV)), 0, 0, wT, Math.PI);
  at(vox("hallWallZ", () => hallWall(D * 6, HV)), -W - wT, 0, -D / 2, Math.PI / 2);
  at(vox("hallWallZ", () => hallWall(D * 6, HV)), W + wT, 0, -D / 2, -Math.PI / 2);
  rects.push([-W - 1, -D - 1, W + 1, -D], [-W - 1, 0, W + 1, 1], [-W - 1, -D, -W, 0], [W, -D, W + 1, 0]);
  at(vox("ceiling", () => ceiling(2 * W * 6, D * 6)), 0, H - 5 * VOX, -D / 2);

  // entrance, elevator and their neon
  const ent = at(vox("entrance", entrance), 0, 0, -0.05, Math.PI);
  ent.scale.setScalar(1.25);
  at(neon("OPEN · 営業中", { h: 0.4, color: "#ff3d8b", font: `700 100px ${JP}`, k: 1.7 }), 0, 8.2, -0.1, Math.PI);
  at(vox("elevator", elevator), W - 0.05, 0, -6, -Math.PI / 2);
  at(neon("▼ THE VAULT", { h: 0.42, color: GOLD }), W - 0.12, 5.3, -6, -Math.PI / 2);
  at(neon("金庫", { h: 0.7, color: "#ff3d8b", font: `700 110px ${JP}`, vertical: true }), W - 0.12, 3.2, -3.6, -Math.PI / 2);

  // ---- columns and chandeliers ----
  for (const x of [-COLS_X, COLS_X])
    for (const z of COLS_Z) {
      at(vox("column", () => column(HV)), x, 0, z);
      rects.push([x - 0.75, z - 0.75, x + 0.75, z + 0.75]);
    }
  const chandeliers: THREE.Object3D[] = [];
  for (const [x, z, k] of [
    [0, -6, 1.3],
    [0, -21, 1.3],
    [-COLS_X, -13, 0.85],
    [COLS_X, -13, 0.85],
    [-COLS_X, -26, 0.85],
    [COLS_X, -26, 0.85],
  ]) {
    const c = at(vox("chandelier", chandelier), x, H - 1 - 16 * VOX * k, z);
    c.scale.setScalar(k);
    chandeliers.push(c);
  }

  // ---- key island: plinth, four terminals, the hologram ----
  at(vox("plinth", plinth), ISLAND.x, 0, ISLAND.z);
  rects.push([-2.75, ISLAND.z - 2.75, 2.75, ISLAND.z + 2.75]);
  const term = surface(512, 340);
  const screenMat = screen(term, 1, 0.667, 1.25).material as THREE.MeshBasicMaterial;
  TERMINALS.forEach((tm) => {
    const k = new THREE.Group();
    k.add(vox("kiosk", kiosk));
    const sc = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.667), screenMat);
    sc.position.set(0, KIOSK_SCREEN.y, KIOSK_SCREEN.z);
    sc.rotation.x = KIOSK_SCREEN.tilt;
    k.add(sc);
    const p = ISLAND.clone().addScaledVector(tm.dir, 2.25);
    at(k, p.x, 0, p.z, Math.atan2(tm.dir.x, tm.dir.z));
    picks.add(k, () => BANK_PICK, () => `<b>Insert viewing key</b><span>${tm.label} · click to open · stays in your browser</span>`);
  });
  const holo = new THREE.Group();
  const key = vox("holoKey", holoKey);
  key.scale.setScalar(0.55);
  holo.add(key);
  // the key floats high, so the vault door at the back stays in view over the island
  at(holo, ISLAND.x, 5.4, ISLAND.z);
  const beamMat = new THREE.MeshBasicMaterial({ map: beamTexture("#f4b728"), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  const beam = at(new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.6, 7.2, 32, 1, true), beamMat), ISLAND.x, 0.85 + 3.6, ISLAND.z);
  beam.rotation.x = Math.PI; // bright end at the plinth
  const bands: THREE.Mesh[] = [];
  for (const [y, r, txt, col] of [
    [6.3, 1.45, "  UNIFIED VIEWING KEY · uview1… · 閲覧鍵 · SAPLING zxviews… · ORCHARD · READ-ONLY ·", "#f4b728"],
    [7.5, 1.15, "  見るだけ · VIEW, NEVER SPEND · DECRYPTED LOCALLY · ", "#3de0ff"],
  ] as const) {
    const tex = bandTexture(txt, col);
    tex.repeat.set(2, 1);
    const m = new THREE.MeshBasicMaterial({ map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    m.color.setScalar(1.5);
    bands.push(at(new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.22, 48, 1, true), m), ISLAND.x, y, ISLAND.z) as THREE.Mesh);
  }
  // gold motes rising in the beam
  const N = 140;
  const motes = new Float32Array(N * 3);
  const speeds = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const a = Math.random() * Math.PI * 2,
      r = Math.random() * 1.3;
    motes.set([Math.cos(a) * r, Math.random() * 8, Math.sin(a) * r], i * 3);
    speeds[i] = 0.2 + Math.random() * 0.5;
  }
  const moteGeo = new THREE.BufferGeometry();
  moteGeo.setAttribute("position", new THREE.BufferAttribute(motes, 3));
  const moteMat = new THREE.PointsMaterial({ color: new THREE.Color(GOLD).multiplyScalar(2.2), size: 0.05, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  at(new THREE.Points(moteGeo, moteMat), ISLAND.x, 0.9, ISLAND.z);

  // the house rule, a brass notice on the first column on the left, facing the door
  const pq = plaque(
    [
      { t: "YOUR KEY NEVER LEAVES THIS BROWSER", font: `700 40px ${SANS}`, color: GOLD },
      { t: "Decryption happens here, on your device.", font: `400 30px ${SANS}`, color: "#f2efe8" },
      { t: "鍵はブラウザの外に出ません", font: `500 30px ${JP}`, color: "#ff6f9e" },
    ],
    1000,
    420,
  );
  const notice = at(screen(pq, 1.45, 0.61, 1.05), -COLS_X, 2.3, COLS_Z[0] + 0.78);
  picks.add(notice, () => ({ eyebrow: "House rule", title: "Your key never leaves this browser", tag: ["Private", "ok"], body: "<p>The viewing key you paste is used only on this page: notes are fetched and trial-decrypted locally. Nothing is stored or sent to ZScan.</p>" }), () => "<b>Privacy</b><span>Decryption happens here, in your browser</span>");

  // ---- teller counter: marble and wood, brass cages, a numbered sign over each window ----
  at(vox("counter", () => counter(2 * W * 6)), 0, 0, COUNTER_Z - 3.5 * VOX);
  rects.push([-W, COUNTER_Z - 7 * VOX, W, COUNTER_Z]);
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(2 * W, 1.6), new THREE.MeshStandardMaterial({ color: "#a8d8ff", transparent: true, opacity: 0.1, roughness: 0.04, metalness: 0.9, depthWrite: false }));
  glass.position.set(0, 7 * VOX + 0.8, COUNTER_Z - 3.5 * VOX - 0.06);
  g.add(glass);
  for (const x of WINDOWS) at(vox("cage", () => tellerCage(36, 11)), x, 7 * VOX, COUNTER_Z - 3.5 * VOX + 0.05);
  WINDOWS.forEach((x, i) => {
    const sign = new THREE.Group();
    const plate = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.62, 0.06), new THREE.MeshStandardMaterial({ color: "#16130e", metalness: 0.4, roughness: 0.5 }));
    const rim = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.72, 0.04), brassMat);
    rim.position.z = -0.03;
    const num = neon(`TELLER ${i + 1}`, { h: 0.3, color: GOLD, font: `700 100px ${SANS}`, k: 1.6 });
    num.position.set(0, 0.07, 0.05);
    const jp = neon(`窓口 ${i + 1}`, { h: 0.16, color: "#ff3d8b", font: `700 100px ${JP}`, k: 1.6 });
    jp.position.set(0, -0.19, 0.05);
    for (const dx of [-0.6, 0.6]) {
      const chain = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.9, 0.03), brassMat);
      chain.position.set(dx, 0.75, 0);
      sign.add(chain);
    }
    sign.add(rim, plate, num, jp);
    at(sign, x, 3.75, COUNTER_Z - 0.35);
    at(vox("lamp", bankerLamp), x + 1.4, 7 * VOX, COUNTER_Z - 0.75);
    // the queue: ropes either side
    for (const side of [-0.8, 0.8])
      for (const zc of ROPE) {
        at(vox("stanchion", stanchion), x + side, 0, zc, Math.PI / 2);
        rects.push([x + side - 0.06, zc - 1, x + side + 0.06, zc + 1]);
      }
  });

  // ---- behind the tellers: the great vault door, deposit boxes, the brand ----
  // the great vault door, raised on its wall so it shows over the counter
  const vw = at(vox("hallVaultWall", () => vaultWall(60, 54, 15, 27, V.marbleDark, V.goldDark)), 0, 0, -D + 0.45);
  vw.scale.set(1, 1, 0.6);
  at(vox("hallVaultDoor", () => vaultDoor(14.6)), 0, (27 - 18) * VOX, -D + 0.75);
  const boxTex = depositBoxes();
  for (const side of [-1, 1]) {
    const t = boxTex.clone();
    t.repeat.set(10 / 1.2, 5 / 1.2);
    t.needsUpdate = true;
    const wallBoxes = new THREE.Mesh(new THREE.PlaneGeometry(10, 5), new THREE.MeshStandardMaterial({ map: t, metalness: 0.55, roughness: 0.38 }));
    at(wallBoxes, side * 11.5, 2.5, -D + 0.3);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(10, 0.05, 0.04), glowMat(GOLD, 1.6));
    at(strip, side * 11.5, 5.1, -D + 0.32);
  }
  at(neon("VIEW KEY BANK", { h: 1.5, color: GOLD, font: `900 120px ${SANS}`, k: 1.9 }), 0, 10.0, -D + 0.12);
  at(neon("ZSCAN · 閲覧鍵銀行 · PRIVATE BY DEFAULT", { h: 0.42, color: "#ff3d8b", font: `500 100px ${JP}`, k: 1.7 }), 0, 8.6, -D + 0.12);
  for (const x of [-11.5, 11.5]) at(neon(x < 0 ? "鍵" : "銀", { h: 1.5, color: x < 0 ? "#3de0ff" : "#ff3d8b", font: `900 120px ${JP}`, frame: true }), x, 8.6, -D + 0.14);
  // ticker over the vault door
  const tick = surface(4096, 72);
  tick.tex.wrapS = THREE.RepeatWrapping;
  tick.tex.repeat.set(1.2, 1);
  const ticker = screen(tick, 22, 0.42, 1.2);
  at(ticker, 0, 7.45, -D + 0.16);

  // ---- live boards on the side walls ----
  const poolsS = surface(2000, 1000);
  const poolsBoard = boardOn(g, poolsS, 10, 5, -W + 0.12, 4.3, -14, Math.PI / 2);
  const supplyS = surface(1600, 1000);
  const supplyBoard = boardOn(g, supplyS, 8, 5, W - 0.12, 4.3, -14, -Math.PI / 2);
  at(neon("価値", { h: 1.0, color: "#ff3d8b", font: `900 110px ${JP}`, vertical: true }), -W + 0.12, 4.3, -20.4, Math.PI / 2);
  at(neon("供給", { h: 1.0, color: "#3de0ff", font: `900 110px ${JP}`, vertical: true }), W - 0.12, 4.3, -19.4, -Math.PI / 2);
  let market: MarketState | null = null;
  let height: number | null = null;
  picks.add(
    poolsBoard,
    () => poolsInfo(market),
    () => `<b>Value pools</b><span>live · ZEC held in each pool</span>`,
  );
  picks.add(
    supplyBoard,
    () => supplyInfo(market, height),
    () => `<b>Supply</b><span>live · issued, inflation, halving</span>`,
  );

  // ---- waiting area: benches, palms ----
  for (const [x, z, ry] of [
    [-16.7, -8, Math.PI / 2],
    [-16.7, -20, Math.PI / 2],
    [16.7, -11, -Math.PI / 2],
    [16.7, -20, -Math.PI / 2],
  ] as const) {
    at(vox("bench", bench), x, 0, z, ry);
    rects.push([x - 0.45, z - 1.4, x + 0.45, z + 1.4]);
  }
  let seed = 3;
  for (const [x, z] of [
    [-17, -1.3],
    [17, -1.3],
    [-17, -22.6],
    [17, -22.6],
    [-6.2, -1.2],
    [6.2, -1.2],
  ]) {
    at(vox(`plant${seed % 3}`, () => plant(seed)), x, 0, z, seed);
    rects.push([x - 0.55, z - 0.55, x + 0.55, z + 0.55]);
    seed++;
  }

  // ---- light: three warm points (the vault has its own) ----
  const lights: THREE.PointLight[] = [];
  for (const [x, y, z, c, i] of [
    [0, 8, -6, "#ffd9a0", 30],
    [0, 7, ISLAND.z, "#ffc04a", 14],
    [0, 6.5, -31, "#ffd9a0", 34],
  ] as const) {
    const l = new THREE.PointLight(c, i, 28, 1.5);
    l.position.set(x, y, z);
    g.add(l);
    lights.push(l);
  }

  // ---- the crowd ----
  const crowd = new Crowd(cast);
  void crowd.start();

  // ---- live updates ----
  const redraw = () => {
    drawPools(poolsS, market?.pools ?? null, height);
    if (market) drawSupply(supplyS, market, height);
    else drawSupply(supplyS, { price: null, supply: null, pools: null, network: null }, height);
    drawTicker(tick, tickerItems(market, height));
  };
  redraw();
  void document.fonts?.ready.then(redraw);
  let blinkT = 0,
    blink = false,
    scan = 0;
  return {
    group: g,
    colliders: rects,
    lights,
    setMarket(m) {
      market = m;
      height = Math.max(height ?? 0, m.supply?.height ?? 0) || null;
      redraw();
    },
    block(h) {
      height = h;
      redraw();
    },
    update(dt, t) {
      key.rotation.y += dt * 0.9;
      holo.position.y = 5.4 + Math.sin(t * 1.3) * 0.1;
      bands[0].rotation.y -= dt * 0.25;
      bands[1].rotation.y += dt * 0.4;
      beamMat.opacity = 0.16 + Math.sin(t * 2.1) * 0.05;
      const p = moteGeo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < N; i++) {
        let y = p.getY(i) + speeds[i] * dt;
        if (y > 8) y = 0;
        p.setY(i, y);
      }
      p.needsUpdate = true;
      tick.tex.offset.x = (t * 0.018) % 1;
      blinkT += dt;
      scan = (scan + dt * 0.35) % 1;
      if (blinkT > 0.12) {
        blinkT = 0;
        blink = Math.floor(t * 2) % 2 === 0;
        drawTerminal(term, blink, scan, "VIEW KEY BANK · LOCAL DECRYPTION");
      }
      lights[1].intensity = 14 + Math.sin(t * 2.1) * 3;
      for (const c of chandeliers) c.rotation.y = Math.sin(t * 0.2 + c.position.x) * 0.05;
    },
  };
}

function boardOn(g: THREE.Group, s: Surface, w: number, h: number, x: number, y: number, z: number, ry: number) {
  const b = new THREE.Group();
  const m = screen(s, w, h, 1.1);
  m.position.z = 0.07;
  const back = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, h + 0.3, 0.08), new THREE.MeshStandardMaterial({ color: "#0b0a0d", roughness: 0.6 }));
  const edge = glowMat("#f4b728", 1.8);
  for (const [ew, eh, ex, ey] of [
    [w + 0.34, 0.05, 0, h / 2 + 0.17],
    [w + 0.34, 0.05, 0, -h / 2 - 0.17],
    [0.05, h + 0.34, -w / 2 - 0.17, 0],
    [0.05, h + 0.34, w / 2 + 0.17, 0],
  ]) {
    const e = new THREE.Mesh(new THREE.BoxGeometry(ew, eh, 0.05), edge);
    e.position.set(ex, ey, 0.05);
    b.add(e);
  }
  b.add(back, m);
  b.position.set(x, y, z);
  b.rotation.y = ry;
  g.add(b);
  return b;
}

function tickerItems(m: MarketState | null, height: number | null): string[] {
  const out: string[] = [];
  if (m?.price) out.push(`ZEC/USD|$${m.price.usd.toFixed(2)} ${m.price.usd_24h_change >= 0 ? "▲" : "▼"}${Math.abs(m.price.usd_24h_change).toFixed(2)}%|${m.price.usd_24h_change >= 0 ? "up" : "down"}`);
  if (height) out.push(`BLOCK|#${height.toLocaleString("en-US")}|`);
  if (m?.pools) {
    out.push(`SHIELDED|${pct(m.pools.shielded_ratio)}|`);
    for (const k of POOLS) {
      const ch = m.pools.change_24h[k] ?? 0;
      out.push(`${POOL_NAME[k].toUpperCase()}|${fmtZec(m.pools.pools[k])} ZEC ${ch ? fmtSigned(ch) : ""}|${ch > 0 ? "up" : ch < 0 ? "down" : ""}`);
    }
  }
  if (m?.supply) out.push(`SUPPLY|${fmtZec(m.supply.supply)} / 21,000,000|`);
  out.push("閲覧鍵|YOUR KEY STAYS IN THIS BROWSER|");
  return out;
}

function poolsInfo(m: MarketState | null): PickInfo {
  const p = m?.pools;
  if (!p) return { eyebrow: "Live board", title: "Value pools", body: "<p>Waiting for the chain…</p>" };
  return {
    eyebrow: "Live board",
    title: "Value pools",
    tag: [`${pct(p.shielded_ratio)} shielded`, "ok"],
    stats: [
      ["Shielded", `${fmtZec(p.shielded)} ZEC`],
      ["Transparent", `${fmtZec(p.pools.transparent)} ZEC`],
      ["Orchard", `${fmtZec(p.pools.orchard)} ZEC`],
      ["Ironwood", `${fmtZec(p.pools.ironwood)} ZEC`],
    ],
    body: `<p>Sapling ${fmtZec(p.pools.sapling)} ZEC · Sprout ${fmtZec(p.pools.sprout)} ZEC. Take the elevator down to the vault to see each reserve.</p>`,
  };
}

function supplyInfo(m: MarketState | null, height: number | null): PickInfo {
  const s = m?.supply;
  if (!s) return { eyebrow: "Live board", title: "Supply", body: "<p>Waiting for the chain…</p>" };
  return {
    eyebrow: "Live board",
    title: `${fmtZec(s.supply)} ZEC`,
    mono: true,
    tag: [`${pct(s.supply / s.max_supply, 1)} of 21M`, "info"],
    stats: [
      ["Block", (height ?? s.height).toLocaleString("en-US")],
      ["Inflation", pct(s.inflation_rate)],
      ["Subsidy", `${(s.block_subsidy / 1e8).toFixed(4)} ZEC`],
      ["Next halving", s.next_halving_eta.slice(0, 10)],
    ],
  };
}

// ---- the crowd ---------------------------------------------------------------------------------

const v = (x: number, z: number) => new THREE.Vector3(x, 0, z);
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

/** Clients come in, queue for a teller, try a terminal, read the boards, and go. */
class Crowd {
  private queues: Snark[][] = WINDOWS.map(() => []);
  private terminals: (Snark | null)[] = TERMINALS.map(() => null);

  constructor(private cast: Cast) {}

  async start() {
    // staff first: a teller behind each window, a guard at the door, two clients resting
    WINDOWS.forEach((x, i) => void this.cast.spawn([4400, 4401, 4402, 4407][i], v(x, COUNTER_Z - 1.3), `Teller · window ${i + 1}`, { face: v(0, 1), pickBody: "<p>Behind the glass. For your balance, use a key terminal — a teller never asks for your key.</p>" }));
    void this.cast.spawn(4403, v(3.6, -1.9), "Door guard", { face: v(0, -1) });
    for (const [id, x, z] of [
      [4534, -16.5, -7.6],
      [4545, 16.5, -11.4],
    ]) {
      void this.cast.spawn(id, new THREE.Vector3(x, 0.42, z), "Client · waiting").then((s) => {
        s?.sit(true);
        if (s) s.faceDir = v(-Math.sign(x), 0);
      });
    }
    const ids = [4410, 4421, 4433, 4444, 4455, 4466, 4477, 4488, 4499, 4512, 4523, 4556, 4567, 4578];
    ids.forEach((id, i) => {
      void this.cast.spawn(id, DOOR.clone(), "Client").then((s) => {
        if (s) void this.life(s, i);
      });
    });
  }

  private slot(q: number, i: number) {
    return v(WINDOWS[q], HEAD_Z + i * 0.95);
  }

  private side(x: number) {
    return x === 0 ? (Math.random() < 0.5 ? -1 : 1) : Math.sign(x);
  }

  private async life(s: Snark, i: number) {
    // first steps: fill the queues and terminals so the hall is busy from the start
    if (i < 7) await this.teller(s, i % WINDOWS.length, true);
    else if (i < 10) await this.terminal(s, i - 7, true);
    else await this.wander(s);
    for (;;) {
      const r = Math.random();
      if (r < 0.45) await this.teller(s);
      else if (r < 0.8) await this.terminal(s);
      else await this.browse(s);
      if (Math.random() < 0.4) await this.leave(s);
    }
  }

  private async walk(s: Snark, pts: THREE.Vector3[]) {
    s.faceDir = null;
    await s.walk(pts, rnd(1.2, 1.7));
  }

  /** From wherever it stands to `to`, along the lane on one side of the island. */
  private route(s: Snark, to: THREE.Vector3, side = this.side(to.x)) {
    const p = s.root.position;
    const lx = side * LANE;
    return [v(lx, THREE.MathUtils.clamp(p.z, QUEUE_IN, -2.5)), v(lx, THREE.MathUtils.clamp(to.z, QUEUE_IN, -2.5)), to];
  }

  private async teller(s: Snark, q = -1, instant = false) {
    if (q < 0) q = this.queues.reduce((b, x, k) => (x.length < this.queues[b].length ? k : b), Math.floor(Math.random() * WINDOWS.length));
    if (this.queues[q].length >= 4) return this.browse(s);
    const queue = this.queues[q];
    queue.push(s);
    const wx = WINDOWS[q];
    if (instant) s.root.position.copy(this.slot(q, queue.length - 1));
    else await this.walk(s, [...this.route(s, v(wx, QUEUE_IN), this.side(wx)), this.slot(q, queue.length - 1)]);
    s.faceDir = v(0, -1);
    // shuffle forward until served
    while (queue[0] !== s) {
      await sleep(400);
      const want = this.slot(q, queue.indexOf(s));
      if (s.root.position.distanceTo(want) > 0.1 && !s.isWalking) {
        await this.walk(s, [want]);
        s.faceDir = v(0, -1);
      }
    }
    if (s.root.position.distanceTo(this.slot(q, 0)) > 0.1) await this.walk(s, [this.slot(q, 0)]);
    s.faceDir = v(0, -1);
    await sleep(rnd(5000, 11000));
    queue.shift();
    const ex = wx + 1.55 * (wx === 0 ? this.side(0) : Math.sign(wx));
    await this.walk(s, [v(ex, HEAD_Z), v(ex, QUEUE_IN)]);
  }

  private async terminal(s: Snark, j = -1, instant = false) {
    if (j < 0) {
      const free = this.terminals.map((x, k) => (x ? -1 : k)).filter((k) => k >= 0);
      if (!free.length) return this.browse(s);
      j = free[Math.floor(Math.random() * free.length)];
    }
    this.terminals[j] = s;
    const dir = TERMINALS[j].dir;
    const spot = ISLAND.clone().addScaledVector(dir, 3.05);
    if (instant) s.root.position.copy(spot);
    else await this.walk(s, this.route(s, spot, dir.x !== 0 ? Math.sign(dir.x) : this.side(0)));
    s.faceDir = dir.clone().negate();
    await sleep(rnd(6000, 14000));
    this.terminals[j] = null;
    await this.walk(s, [ISLAND.clone().addScaledVector(dir, 3.8)]);
  }

  private async browse(s: Snark) {
    const side = Math.random() < 0.5 ? -1 : 1;
    const spot = v(side * rnd(13.5, 15), rnd(-15.5, -12.5));
    await this.walk(s, [...this.route(s, v(side * LANE, spot.z), side), spot]);
    s.faceDir = v(side, 0);
    await sleep(rnd(4000, 9000));
    await this.walk(s, [v(side * LANE, spot.z)]);
  }

  private async wander(s: Snark) {
    await this.walk(s, this.route(s, v(this.side(0) * LANE, -7)));
  }

  private async leave(s: Snark) {
    const side = this.side(s.root.position.x);
    await this.walk(s, [...this.route(s, v(side * LANE, -3), side), v(side * 1.2, -2), DOOR.clone()]);
    s.setVisible(false);
    await sleep(rnd(3000, 9000));
    s.root.position.copy(DOOR);
    s.setVisible(true);
  }
}
