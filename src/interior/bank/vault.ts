import * as THREE from "three";
import type { MarketState } from "../../data/market";
import { VOX } from "../../scene/voxel/model";
import { glowMat, std, wall } from "../kit";
import type { PickInfo, Rect } from "../types";
import { depositBoxes, drawVaultSign, fmtSigned, fmtZec, GOLD, JP, neon, pct, POOL_COLOR, POOL_JP, POOL_NAME, screen, surface, vaultFloor, zecOf, type PoolKey, type Surface } from "./art";
import { sleep, type Cast, type Picks } from "./common";
import { barGeometry, elevator, pallet, vaultDoor, vaultWall, vox } from "./props";

/**
 * The vault, one floor down: a lobby, the round door, a corridor and one strongroom per value
 * pool, each holding a pile of gold bars sized by the ZEC in that pool (square-root scale).
 */

export const VAULT_Y = -6;
const H = 4.5;
const BAR = { w: 0.44, h: 0.13, d: 0.22 };
const MAX_BARS = 900;

interface Room {
  k: PoolKey;
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  /** Where the door is: the corridor side. */
  door: "e" | "w" | "s";
}

const ROOMS: Room[] = [
  { k: "orchard", x0: 3, z0: -18, x1: 11, z1: -9, door: "w" },
  { k: "sapling", x0: -11, z0: -18, x1: -3, z1: -9, door: "e" },
  { k: "ironwood", x0: 3, z0: -27, x1: 11, z1: -18, door: "w" },
  { k: "sprout", x0: -11, z0: -27, x1: -3, z1: -18, door: "e" },
  { k: "transparent", x0: -5.5, z0: -39, x1: 5.5, z1: -30, door: "s" },
];

export interface Vault {
  group: THREE.Group;
  colliders: Rect[];
  lights: THREE.PointLight[];
  setMarket(m: MarketState): void;
  update(dt: number, t: number): void;
}

/** Bars for `zat` held: sqrt scale, at least a handful so even Sprout has a pile. */
export function barsFor(zat: number) {
  return THREE.MathUtils.clamp(Math.round(Math.sqrt(zecOf(zat)) * 0.2), 6, MAX_BARS);
}

/** Stepped pyramid slots, bottom layer first, each layer centred; it narrows every second layer. */
function pileSlots(n: number) {
  let a = 1;
  const cap = (s: number) => {
    let c = 0;
    for (let k = 1; k <= s; k++) c += 2 * k * 2 * k;
    return c;
  };
  while (cap(a) < n) a++;
  // every cell of the full pyramid, then the n "innermost" ones: what lies under a bar always
  // comes first, so any count makes a mound, never a flat bottom layer
  const cells: { p: THREE.Vector3; m: number; l: number }[] = [];
  for (let l = 0; l < 2 * a; l++) {
    const cols = a - Math.floor(l / 2),
      rows = 2 * cols;
    for (let i = 0; i < cols; i++)
      for (let j = 0; j < rows; j++) {
        const x = i - (cols - 1) / 2,
          z = (j - (rows - 1) / 2) / 2;
        cells.push({ p: new THREE.Vector3(x * BAR.w * 1.02, l * BAR.h, z * 2 * BAR.d * 1.04), m: l / 2 + Math.max(Math.abs(x), Math.abs(z)) + (x * x + z * z) * 0.001, l });
      }
  }
  cells.sort((p, q) => p.m - q.m || p.l - q.l);
  const out = cells.slice(0, n).map((c) => c.p);
  let w = 0;
  for (const p of out) w = Math.max(w, Math.abs(p.x) / (BAR.w * 1.02) + 0.5, Math.abs(p.z) / (2 * BAR.d * 1.04) + 0.25);
  return { slots: out, side: Math.max(1, Math.ceil(w * 2)) };
}

export function buildVault(cast: Cast, picks: Picks): Vault {
  const g = new THREE.Group();
  g.position.y = VAULT_Y;
  const rects: Rect[] = [];
  const at = (o: THREE.Object3D, x: number, y: number, z: number, ry = 0) => {
    o.position.set(x, y, z);
    o.rotation.y = ry;
    g.add(o);
    return o;
  };

  // ---- floor and ceiling ----
  const ft = vaultFloor();
  ft.repeat.set(22 / 2, 39 / 2);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(22, 39), new THREE.MeshStandardMaterial({ map: ft, roughness: 0.42, metalness: 0.55 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, -19.5);
  g.add(floor);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(22, 39), std("#121116", 0.9));
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set(0, H, -19.5);
  g.add(ceil);

  const concrete = std("#26252b", 0.85, 0.1);
  const steel = std("#34343c", 0.45, 0.6);
  const W = (x0: number, z0: number, x1: number, z1: number, mat: THREE.Material = concrete) => rects.push(wall(g, x0, z0, x1, z1, H, mat));

  // ---- lobby: elevator, the vault wall with its round door ----
  W(-4, 0, 4, 0, steel);
  W(-4, -6, -4, 0, steel);
  W(4, -6, 4, 0, steel);
  at(vox("elevator", elevator), 0, 0, -0.12);
  at(neon("B1 · THE VAULT", { h: 0.36, color: GOLD }), 0, 3.85, -0.12 - 0.02, 0);
  // the lobby looks toward −z; signs on the back of the lobby face −z… so put them on the side walls
  at(neon("金庫", { h: 0.7, color: "#ff3d8b", font: `700 110px ${JP}`, vertical: true }), -3.88, 2.4, -2.2, Math.PI / 2);
  at(neon("RESERVES", { h: 0.32, color: "#3de0ff", k: 1.8 }), 3.88, 3.2, -2.6, -Math.PI / 2);
  at(vox("vaultWall", () => vaultWall(48, 27, 10.5)), 0, 0, -6.4);
  rects.push([-4, -6.82, -1.75, -5.98], [1.75, -6.82, 4, -5.98]);
  const DOOR_RY = -Math.PI / 2 + 0.5;
  const door = at(vox("vaultDoor", () => vaultDoor(10.2)), 2.83, -0.5, -4.24, DOOR_RY);
  rects.push([1.75, -5.9, 3.95, -2.5]);
  // strip lights along the lobby floor
  for (const x of [-3.9, 3.9]) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 5.8), glowMat(GOLD, 1.6));
    s.position.set(x, 0.05, -3);
    g.add(s);
  }

  // ---- corridor ----
  const doorAt = (c: number) => [c - 1.3, c + 1.3];
  const [a0, a1] = doorAt(-13.5),
    [b0, b1] = doorAt(-22.5);
  for (const x of [-3, 3]) {
    W(x, -6.82, x, a1);
    W(x, a0, x, b1);
    W(x, b0, x, -30);
    for (const [z0, z1] of [
      [a0, a1],
      [b0, b1],
    ]) {
      // lintel over each strongroom door
      const l = new THREE.Mesh(new THREE.BoxGeometry(0.2, H - 2.8, z1 - z0), concrete);
      l.position.set(x, 2.8 + (H - 2.8) / 2, (z0 + z1) / 2);
      g.add(l);
    }
  }
  for (const x of [-2.9, 2.9]) {
    for (const y of [0.05, H - 0.08]) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 23.2), glowMat(GOLD, y < 1 ? 1.4 : 1.8));
      s.position.set(x, y, -18.4);
      g.add(s);
    }
  }
  // ceiling strip down the middle, broken into panels
  for (let z = -8; z > -30; z -= 2.2) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.04, 1.5), glowMat("#ffe6b8", 1.3));
    p.position.set(0, H - 0.03, z);
    g.add(p);
  }

  // ---- strongrooms ----
  const boxTex = depositBoxes();
  const barGeo = barGeometry(BAR.w, BAR.h, BAR.d);
  const lights: THREE.PointLight[] = [];
  let market: MarketState | null = null;
  const rooms = ROOMS.map((r) => {
    const col = POOL_COLOR[r.k];
    const cx = (r.x0 + r.x1) / 2,
      cz = (r.z0 + r.z1) / 2;
    // walls: everything but the corridor side, which the corridor already has (with the doorway)
    if (r.door !== "w") W(r.x0, r.z0, r.x0, r.z1);
    if (r.door !== "e") W(r.x1, r.z0, r.x1, r.z1);
    W(r.x0, r.z0, r.x1, r.z0);
    if (r.door === "s") {
      W(r.x0, r.z1, -3, r.z1);
      W(3, r.z1, r.x1, r.z1);
      // the transparent room's gate: a lintel over the corridor end
      const l = new THREE.Mesh(new THREE.BoxGeometry(6, H - 3, 0.2), concrete);
      l.position.set(0, 3 + (H - 3) / 2, r.z1);
      g.add(l);
    } else W(r.x0, r.z1, r.x1, r.z1);
    // deposit boxes lining the walls (up to 3.2 m)
    const faces: [number, number, number, number][] = []; // centre x, z, width, rotation
    if (r.door === "s") {
      faces.push([cx, r.z0 + 0.11, r.x1 - r.x0, 0], [r.x0 + 0.11, cz, r.z1 - r.z0, Math.PI / 2], [r.x1 - 0.11, cz, r.z1 - r.z0, -Math.PI / 2]);
    } else {
      const back = r.door === "w" ? r.x1 - 0.11 : r.x0 + 0.11;
      faces.push([back, cz, r.z1 - r.z0, r.door === "w" ? -Math.PI / 2 : Math.PI / 2], [cx, r.z0 + 0.11, r.x1 - r.x0, 0], [cx, r.z1 - 0.11, r.x1 - r.x0, Math.PI]);
    }
    for (const [x, z, w, ry] of faces) {
      const t = boxTex.clone();
      t.repeat.set(w / 1.2, 3.2 / 1.2);
      t.needsUpdate = true;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.1, 3.2), new THREE.MeshStandardMaterial({ map: t, metalness: 0.55, roughness: 0.38 }));
      at(m, x, 1.6, z, ry);
      // a pool-coloured strip above the boxes
      const s = new THREE.Mesh(new THREE.BoxGeometry(w - 0.1, 0.05, 0.03), glowMat(col, 2));
      at(s, x, 3.3, z, ry);
    }
    // the sign on the wall facing the door
    const sign = surface(1400, 380);
    const sx = r.door === "s" ? cx : r.door === "w" ? r.x1 - 0.14 : r.x0 + 0.14;
    const sz = r.door === "s" ? r.z0 + 0.14 : cz;
    const sry = r.door === "s" ? 0 : r.door === "w" ? -Math.PI / 2 : Math.PI / 2;
    const signMesh = at(screen(sign, 3.7, 1.0, 1.3), sx, 3.9, sz, sry);
    // corridor neon over the doorway
    const ln = neon(`${POOL_NAME[r.k].toUpperCase()} ${POOL_JP[r.k]}`, { h: 0.32, color: col, font: `700 100px ${JP}`, k: 1.9 });
    if (r.door === "s") at(ln, 0, 3.75, r.z1 + 0.12, 0);
    else at(ln, r.door === "w" ? 2.88 : -2.88, 3.62, cz, r.door === "w" ? -Math.PI / 2 : Math.PI / 2);
    // the pile on its pallet, a glowing ring around it
    const pal = vox("pallet", () => pallet(24, 24));
    at(pal, cx, 0, cz);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.97, 1, 64), glowMat(col, 2.2));
    at(ring, cx, 0.02, cz).rotation.x = -Math.PI / 2;
    const mat = new THREE.MeshStandardMaterial({ color: r.k === "transparent" ? "#a67a22" : "#e0aa36", metalness: 0.7, roughness: 0.38, emissive: new THREE.Color("#6a4200"), emissiveIntensity: r.k === "transparent" ? 0.06 : 0.25, envMapIntensity: r.k === "transparent" ? 0.7 : 1.2 });
    const pile = new THREE.InstancedMesh(barGeo, mat, MAX_BARS);
    pile.count = 0;
    pile.frustumCulled = false;
    at(pile, cx, VOX, cz);
    const rect: Rect = [cx - 1.5, cz - 1.5, cx + 1.5, cz + 1.5];
    rects.push(rect);
    let glassCase: THREE.Object3D | null = null;
    // the transparent pool sits in a glass case: everyone can see it
    if (r.k === "transparent") {
      const caseGeo = new THREE.BoxGeometry(3.6, 1.6, 3.6);
      const glass = new THREE.Mesh(caseGeo, new THREE.MeshStandardMaterial({ color: "#cfe8ff", transparent: true, opacity: 0.07, roughness: 0.15, metalness: 0, envMapIntensity: 0.2, depthWrite: false }));
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(caseGeo), new THREE.LineBasicMaterial({ color: new THREE.Color(GOLD).multiplyScalar(1.6), toneMapped: false }));
      glassCase = new THREE.Group();
      glassCase.add(glass, edges);
      glass.position.set(0, 0.8 + VOX, 0);
      edges.position.set(0, 0.8 + VOX, 0);
      at(glassCase, cx, 0, cz);
    }
    const light = new THREE.PointLight(col, r.k === "transparent" ? 2.2 : 12, 11, 1.7);
    light.position.set(cx, 3.6, cz);
    g.add(light);
    lights.push(light);
    // glints dancing over the gold
    const glints: THREE.Sprite[] = [];
    const gm = new THREE.SpriteMaterial({ map: glintTex(), color: new THREE.Color("#fff3c8").multiplyScalar(2), blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    for (let i = 0; i < 5; i++) {
      const s = new THREE.Sprite(gm);
      s.scale.setScalar(0.25);
      at(s, cx, 0.5, cz);
      glints.push(s);
    }
    const info = (): PickInfo => roomInfo(r.k, market);
    const hov = () => {
      const p = market?.pools;
      return `<b>${POOL_NAME[r.k]} reserve</b><span>${p ? `${fmtZec(p.pools[r.k])} ZEC · click for details` : "counting…"}</span>`;
    };
    // clicks hit a plain box around the pile (cheaper than testing every bar)
    const hitBox = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), new THREE.MeshBasicMaterial({ visible: false }));
    at(hitBox, cx, VOX, cz);
    picks.add(hitBox, info, hov);
    picks.add(signMesh, info, hov);
    return { r, sign, pile, hitBox, glints, cx, cz, n: -1, slots: [] as THREE.Vector3[], pal, ring, rect, glassCase };
  });

  // ---- the people down here ----
  void cast.spawn(4405, new THREE.Vector3(-2.6, VAULT_Y, -4.8), "Vault guard", { face: new THREE.Vector3(1, 0, 0) });
  void cast.spawn(4406, new THREE.Vector3(-4, VAULT_Y, -33.5), "Auditor · Transparent pool", { face: new THREE.Vector3(1, 0, 0), pickBody: "<p>Counts the transparent pool, in plain sight: every amount there is public.</p>" });
  void cast.spawn(4404, new THREE.Vector3(0, VAULT_Y, -8), "Vault keeper").then(async (s) => {
    if (!s) return;
    const P = (x: number, z: number) => new THREE.Vector3(x, VAULT_Y, z);
    const stops = [
      [P(0, -13.5), P(4.2, -10.4)],
      [P(0, -13.5), P(-4.2, -10.4)],
      [P(0, -22.5), P(4.2, -19.4)],
      [P(0, -22.5), P(-4.2, -19.4)],
      [P(0, -28), P(0, -30.9)],
    ];
    for (let i = 0; ; i = (i + 1) % stops.length) {
      s.faceDir = null;
      await s.walk(stops[i], 1.3);
      const tgt = stops[i][1];
      s.faceDir = tgt.x > 0 ? new THREE.Vector3(1, 0, 0) : tgt.x < 0 ? new THREE.Vector3(-1, 0, 0) : new THREE.Vector3(0, 0, -1);
      await sleep(3500 + Math.random() * 3000);
      s.faceDir = null;
      await s.walk([stops[i][0]], 1.3);
    }
  });

  const setPile = (rm: (typeof rooms)[number], n: number) => {
    if (n === rm.n) return;
    rm.n = n;
    const { slots, side } = pileSlots(n);
    rm.slots = slots;
    // pallet, ring, case and collider follow the pile's footprint
    const fx = side * BAR.w * 1.02 + 0.5,
      fz = side * 2 * BAR.d * 1.04 + 0.5;
    rm.pal.scale.set(fx / 4, 1, fz / 4);
    rm.hitBox.scale.set(fx - 0.3, Math.max(0.3, ...slots.map((p) => p.y + BAR.h)), fz - 0.3);
    rm.ring.scale.setScalar(Math.max(fx, fz) * 0.72 + 0.4);
    if (rm.glassCase) rm.glassCase.scale.set((fx + 0.3) / 3.6, (2 * side * BAR.h + 0.4) / 1.6, (fz + 0.3) / 3.6);
    const hx = fx / 2 + 0.1,
      hz = fz / 2 + 0.1;
    rm.rect.splice(0, 4, rm.cx - hx, rm.cz - hz, rm.cx + hx, rm.cz + hz);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const c = new THREE.Color();
    slots.forEach((p, i) => {
      // a few bars sit a touch askew, the pile looks stacked by hand
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), (Math.sin(i * 12.9898) * 0.5 + 0.5) * 0.08 - 0.04);
      m.compose(p, q, new THREE.Vector3(1, 1, 1));
      rm.pile.setMatrixAt(i, m);
      const k = 0.88 + ((i * 7919) % 13) / 13 * 0.2;
      rm.pile.setColorAt(i, c.setRGB(k, k * 0.98, k * 0.92));
    });
    rm.pile.count = slots.length;
    rm.pile.instanceMatrix.needsUpdate = true;
    if (rm.pile.instanceColor) rm.pile.instanceColor.needsUpdate = true;
    rm.pile.computeBoundingSphere();
    rm.pile.computeBoundingBox();
  };
  rooms.forEach((rm) => drawVaultSign(rm.sign, rm.r.k, null, null));

  return {
    group: g,
    colliders: rects,
    lights,
    setMarket(mk) {
      market = mk;
      for (const rm of rooms) {
        drawVaultSign(rm.sign, rm.r.k, mk.pools, mk.supply?.supply ?? null);
        if (mk.pools) setPile(rm, barsFor(mk.pools.pools[rm.r.k]));
      }
    },
    update(_dt, t) {
      door.rotation.y = DOOR_RY + Math.sin(t * 0.25) * 0.015;
      rooms.forEach((rm, ri) => {
        rm.glints.forEach((s, i) => {
          const ph = t * 0.7 + i * 1.7 + ri;
          const cyc = Math.floor(ph / Math.PI);
          const slot = rm.slots.length ? rm.slots[(cyc * 31 + i * 17 + ri * 7) % rm.slots.length] : null;
          s.visible = !!slot;
          if (!slot) return;
          s.position.set(rm.cx + slot.x, VOX + slot.y + BAR.h + 0.02, rm.cz + slot.z);
          s.scale.setScalar(0.32 * Math.max(0, Math.sin(ph)));
        });
      });
    },
  };
}

let glint: THREE.Texture | null = null;
function glintTex() {
  if (glint) return glint;
  const s: Surface = surface(64, 64);
  const { ctx } = s;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.2, "rgba(255,230,160,.5)");
  g.addColorStop(1, "rgba(255,200,80,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = "rgba(255,255,255,.9)";
  ctx.fillRect(30, 0, 4, 64);
  ctx.fillRect(0, 30, 64, 4);
  s.tex.needsUpdate = true;
  glint = s.tex;
  return glint;
}

function roomInfo(k: PoolKey, m: MarketState | null): PickInfo {
  const p = m?.pools;
  if (!p) return { eyebrow: "The vault", title: `${POOL_NAME[k]} pool`, body: "<p>Counting…</p>" };
  const amt = p.pools[k];
  const sup = m?.supply?.supply ?? 0;
  const ch = p.change_24h[k] ?? 0;
  const shielded = k !== "transparent";
  return {
    eyebrow: `The vault · ${POOL_JP[k]}`,
    title: `${POOL_NAME[k]} pool`,
    tag: shielded ? ["Shielded", "ok"] : ["Public", "warn"],
    stats: [
      ["Held", `${fmtZec(amt)} ZEC`],
      ["Share of supply", sup ? pct(amt / sup, amt / sup < 0.01 ? 2 : 1) : "—"],
      ["24 h change", `${fmtSigned(ch)} ZEC`],
      ["Gold bars", `${barsFor(amt)} (√ scale)`],
    ],
    body: `<p>${
      shielded
        ? k === "sprout"
          ? "The first shielded pool (2016), closed to new deposits: it can only drain."
          : "Amounts inside are encrypted; only the pool total is public. A viewing key reveals your own notes here."
        : "Every balance and transfer here is public on the chain, like Bitcoin."
    }</p>`,
  };
}
