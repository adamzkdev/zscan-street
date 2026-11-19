import * as THREE from "three";
import { T } from "../../i18n/lang";
import { profile } from "../../game/profile";
import { levelOf } from "../../game/progress";
import { tableCard, tableStats } from "../../tables/house";
import * as F from "../furniture";
import { glowMat, makeScene, std, wall } from "../kit";
import { ART, marquee } from "../tower/arcade";
import type { Interior, InteriorContext, PickInfo } from "../types";
import { baronsBoard, barMenu, drawLeaderboard, zoneCard } from "./boards";
import { GKit, ROOM, chatLine, makeCanvas, tex, withDayNight, type HoverFn } from "./kit";
import { boardTable, cage, card, cardTable, chips, dais, die, dieUp, pokerTable, qBlock, roomChair, signStand } from "./props";
import { miniWall } from "./wall";
import { drawMark } from "../../party/theme";

/**
 * THE GAME HOUSE (游戏屋), the city's games café on the avenue: one tall hall under string lights.
 *
 * - At the back, the MINI-GAMES WALL (wall.ts): a screen for every ZK PARTY mini-game; a click opens
 *   the party hall on it. Before it the TOURNAMENT desk and its cup.
 * - In the middle, ZK PARTY's board game on a lit dais: the ring of spaces round a little NU7 Quarter
 *   block, four tokens hopping, the Z-Block bobbing, the die turning; a click opens the board.
 * - The table games (src/tables, through the launcher): BLOCK BARONS on two board tables (east, at the
 *   back), LAST SNARK at three card tables (east, at the front), ORCHARD HOLD'EM in THE ORCHARD ROOM,
 *   the poker room behind its arch in the west corner. zkSNARKs play at them all; a table whose game is
 *   not in the house yet says COMING SOON.
 * - The bar (THE LUCKY NONCE) by the doors, a lounge, two ZK PARTY cabinets, and the house
 *   leaderboard on the east wall with your record.
 */

const LATTICE = { x0: ROOM.x0, x1: -8.6, z0: ROOM.z0, z1: -11.4, h: 3.6, arch: [-12.9, -10.5] as [number, number] };
const BARONS: [number, number][] = [
  [11.9, -20.4],
  [11.9, -15.6],
];
const GLYPH: [number, number][] = [
  [9.3, -8.0],
  [13.0, -8.0],
  [11.15, -4.1],
];
const POKER: [number, number][] = [
  [-11.8, -20.5],
  [-11.8, -15.3],
];
const DAIS = { x: 0, z: -10.0 };

export function buildGameHouse(ctx: InteriorContext): Interior {
  const scene = makeScene(ctx.renderer, "#08070c");
  const k = new GKit(ctx, scene);

  shell(k);
  const wall = miniWall(k);
  boardCorner(k);
  latticeRoom(k);
  baronsZone(k);
  glyphZone(k);
  bar(k);
  lounge(k);
  cashier(k);
  leaderboard(k);
  decor(k);
  life(k);

  k.light(0, 5.8, -17.5, "#e4d8ff", 16, 24);
  k.light(0, 5.0, -8.0, "#ffd8b0", 15, 20);
  k.light(-11.8, 3.15, -17.9, "#d8c8ff", 10, 12);
  k.light(11.6, 4.6, -12.5, "#ffe2c4", 18, 20);
  k.light(-10.0, 4.4, -5, "#ffc890", 12, 14);
  k.padLights();
  // a warmer, fuller fill than the default hall's
  scene.traverse((o) => o instanceof THREE.HemisphereLight && ((o.intensity = 1.25), o.groundColor.set("#3a2a40")));

  // the avenue through the front windows (the panorama taken from the doors)
  const view = ctx.cityView("gamehouse", 1.6, 3);
  if (view) scene.background = view;

  const camQuat = new THREE.Quaternion();
  const camRight = new THREE.Vector3();
  const find = (o: THREE.Object3D | null) => {
    for (let x = o; x; x = x.parent) if (k.picks.has(x)) return x;
    return null;
  };
  return withDayNight(
    {
      key: "gamehouse",
      title: "GAME HOUSE",
      scene,
      floors: [{ label: "G", name: "Game hall · mini-games, tables, The Orchard Room", y: 0, spawn: new THREE.Vector3(0, 0, -1.6), yaw: 0 }],
      colliders: () => k.rects,
      pickables: () => k.pickables,
      pick: (hit) => {
        const o = find(hit.object);
        return o ? (k.picks.get(o)!(hit) ?? null) : null;
      },
      hover: (hit) => {
        const o = find(hit.object);
        if (!o) return null;
        const i = wall.screenOf(o);
        if (i >= 0) wall.hovered(i);
        const h = k.hovers.get(o);
        return typeof h === "function" ? h(hit) : (h ?? null);
      },
      update(dt, t, camera) {
        wall.look.camera = camera;
        camera.getWorldQuaternion(camQuat);
        camRight.set(1, 0, 0).applyQuaternion(camQuat);
        for (const p of k.people) p.s.update(dt, t, camQuat, camRight);
        for (const tick of k.ticks) tick(dt, t);
      },
    },
    ctx,
    // (the storefront's glass lets a little of the day in)
    () => 0.3,
  );
}

// ---- the hall ------------------------------------------------------------------------------------

function shell(k: GKit) {
  const { x0, x1, z0, z1, h } = ROOM;
  // the carpet: void, a scatter of ⓩ marks, squares and pips in the house's colours
  const carpet = tex(256, 14, 11, (g, S) => {
    g.fillStyle = "#17121d";
    g.fillRect(0, 0, S, S);
    // a faint diamond grid under the motifs
    g.strokeStyle = "rgba(196,177,252,0.10)";
    g.lineWidth = 2;
    for (let i = -1; i <= 2; i++) {
      g.beginPath();
      g.moveTo(i * S * 0.5, 0);
      g.lineTo(i * S * 0.5 + S, S);
      g.moveTo(i * S * 0.5 + S, 0);
      g.lineTo(i * S * 0.5, S);
      g.stroke();
    }
    const cols = ["rgba(255,107,53,0.55)", "rgba(196,177,252,0.5)", "rgba(168,216,232,0.45)", "rgba(109,191,138,0.4)"];
    for (let i = 0; i < 14; i++) {
      const x = k.rnd(i, 1) * S,
        y = k.rnd(i, 2) * S,
        s = 5 + k.rnd(i, 3) * 5;
      g.strokeStyle = cols[i % 4];
      g.fillStyle = cols[i % 4];
      g.lineWidth = 2;
      if (i % 3 === 0) {
        drawMark(g, x, y, s * 2.5, cols[i % 4], cols[i % 4]);
      } else if (i % 3 === 1) {
        g.strokeRect(x - s * 0.7, y - s * 0.7, s * 1.4, s * 1.4);
        g.fillRect(x - 2, y - 2, 4, 4);
      } else {
        for (const [u, v] of [
          [-1, -1],
          [1, 1],
          [1, -1],
          [-1, 1],
        ])
          g.fillRect(x + u * s * 0.5 - 2, y + v * s * 0.5 - 2, 4, 4);
      }
    }
  });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), new THREE.MeshStandardMaterial({ map: carpet, emissive: "#ffffff", emissiveMap: carpet, emissiveIntensity: 0.05, roughness: 0.95 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set((x0 + x1) / 2, 0, (z0 + z1) / 2);
  floor.raycast = () => {};
  k.root.add(floor);
  // the ceiling, dark, with beams
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), std("#0c0b10", 0.9));
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set((x0 + x1) / 2, h, (z0 + z1) / 2);
  k.root.add(ceil);
  for (const x of [-13, -8.5, -4, 4, 8.5, 13]) k.box(0.3, 0.4, z1 - z0, k.trim, x, h - 0.4, (z0 + z1) / 2);
  // the walls: plum panels over a walnut wainscot, a neon line round the room
  const panel = std("#231d2c", 0.85);
  k.rects.push(wall(k.root, x0, z0, x1, z0, h, panel), wall(k.root, x0, z0, x0, z1, h, panel), wall(k.root, x1, z0, x1, z1, h, panel));
  for (const [w, d, x, z] of [
    [x1 - x0, 0.06, 0, z0 + 0.12],
    [0.06, z1 - z0, x0 + 0.12, (z0 + z1) / 2],
    [0.06, z1 - z0, x1 - 0.12, (z0 + z1) / 2],
  ] as const) {
    k.box(w, 1.1, d, k.walnut, x, 0, z);
    k.box(w + (d > 1 ? 0 : 0), 0.05, d + 0.02, d > 1 ? k.glacier : k.lilac, x, 3.4, z);
  }
  // the street side: glass either side of the doors (the avenue in it), void above and below
  const glass = new THREE.MeshStandardMaterial({ color: "#9cc3df", transparent: true, opacity: 0.1, roughness: 0.05, metalness: 0.3, depthWrite: false });
  const front = (a: number, b: number) => {
    const w = b - a,
      cx = (a + b) / 2;
    k.box(w, 0.5, 0.2, panel, cx, 0, z1);
    k.box(w, h - 3.6, 0.2, panel, cx, 3.6, z1);
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w, 3.1), glass);
    p.position.set(cx, 2.05, z1);
    p.raycast = () => {};
    k.root.add(p);
    for (let x = a; x <= b + 0.01; x += w / Math.max(1, Math.round(w / 2))) k.box(0.08, 3.1, 0.12, k.trim, x, 0.5, z1);
    k.rects.push([a, z1 - 0.1, b, z1 + 0.1]);
  };
  front(x0, -1.6);
  front(1.6, x1);
  // over the doors, inside: the house's name in neon
  k.box(3.2, h - 2.9, 0.2, panel, 0, 2.9, z1);
  k.label(T("GAME HOUSE · 游戏屋", "游戏屋 · GAME HOUSE"), 0, 3.5, z1 - 0.12, { h: 0.4, color: "#ff6b35", rot: Math.PI });
  // (the doorway itself: the way out, see manager.ts)
  k.rects.push([-1.6, z1 - 0.1, 1.6, z1 + 0.1]);
}

/** The ZK PARTY board on its dais: the ring of spaces, the NU7 Quarter block, tokens, the Z-Block, the die. */
function boardCorner(k: GKit) {
  const { x, z } = DAIS;
  k.put("gh-dais", dais, x, z);
  const top = 0.5;
  const P = 0.52;
  const GW = 8,
    GD = 6;
  // the loop, clockwise from the near-west corner (as the party's board)
  const ring: { x: number; z: number }[] = [];
  const at = (gx: number, gy: number) => ({ x: x + (gx - (GW - 1) / 2) * P, z: z + (gy - (GD - 1) / 2) * P });
  for (let i = 0; i < GW; i++) ring.push(at(i, GD - 1));
  for (let j = GD - 2; j >= 0; j--) ring.push(at(GW - 1, j));
  for (let i = GW - 2; i >= 0; i--) ring.push(at(i, 0));
  for (let j = 1; j < GD - 1; j++) ring.push(at(0, j));
  const kinds = ring.map((_, i) => (i === 0 ? "#ff6b35" : [5, 11, 17, 22].includes(i) ? "#a77bff" : [3, 8, 14, 19, 21].includes(i) ? "#ff4d5e" : "#3ea0ff"));
  const tiles = k.instances(
    new THREE.BoxGeometry(0.46, 0.1, 0.46),
    new THREE.MeshStandardMaterial({ roughness: 0.5, emissive: "#ffffff", emissiveIntensity: 0.08 }),
    ring.map((p) => new THREE.Matrix4().makeTranslation(p.x, top + 0.05, p.z)),
  );
  ring.forEach((_, i) => tiles.setColorAt(i, new THREE.Color(kinds[i])));
  tiles.instanceColor!.needsUpdate = true;
  // the NU7 Quarter in the middle: a few towers, the NU7 TOWER (a mast, a ZEC-gold orb)
  const b: THREE.Matrix4[] = [];
  const bc: string[] = [];
  const pal = ["#e8e6e0", "#a8d8e8", "#c4b1fc", "#3a3442", "#d9bc8a"];
  for (let i = 0; i < 14; i++) {
    const bx = x + (k.rnd(i, 4) - 0.5) * 2.4,
      bz = z + (k.rnd(i, 5) - 0.5) * 1.3;
    if (Math.hypot(bx - x, bz - z) < 0.35) continue;
    const hh = 0.15 + k.rnd(i, 6) * 0.5;
    b.push(new THREE.Matrix4().compose(new THREE.Vector3(bx, top + hh / 2, bz), new THREE.Quaternion(), new THREE.Vector3(0.2 + k.rnd(i, 7) * 0.15, hh, 0.2 + k.rnd(i, 8) * 0.12)));
    bc.push(pal[i % pal.length]);
  }
  const blocks = k.instances(new THREE.BoxGeometry(1, 1, 1), std("#ffffff", 0.6), b);
  bc.forEach((c, i) => blocks.setColorAt(i, new THREE.Color(c)));
  blocks.instanceColor!.needsUpdate = true;
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.06, 0.75, 8), std("#f2eee6", 0.4));
  trunk.position.set(x, top + 0.375, z);
  const egg = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 12), new THREE.MeshStandardMaterial({ color: "#f4b728", emissive: "#f4a300", emissiveIntensity: 0.5, roughness: 0.2, metalness: 0.4 }));
  egg.position.set(x, top + 0.82, z);
  k.root.add(trunk, egg);
  // the tokens: the party's four seat colours
  const seat = ["#ff6b35", "#3ec6ff", "#8ee35b", "#ff5fa2"];
  const baseGeo = new THREE.CylinderGeometry(0.07, 0.09, 0.12, 12);
  const headGeo = new THREE.SphereGeometry(0.075, 12, 10);
  const tokens = seat.map((c, i) => {
    const g = new THREE.Group();
    const m = std(c, 0.4);
    const b0 = new THREE.Mesh(baseGeo, m);
    b0.position.y = 0.06;
    const h0 = new THREE.Mesh(headGeo, m);
    h0.position.y = 0.19;
    g.add(b0, h0);
    k.root.add(g);
    return { g, pos: (i * 6) % ring.length, from: 0, to: 0, hop: 1, left: 0, off: [(i % 2) * 0.12 - 0.06, Math.floor(i / 2) * 0.12 - 0.06] };
  });
  const q = qBlock(0.3);
  k.root.add(q);
  let qAt = 9;
  const dice = die(0.3);
  k.root.add(dice);
  const want = new THREE.Euler();
  let turn = 0,
    wait = 1.2,
    rolling = 0,
    rolled = 1,
    clock = 0;
  const place = (o: THREE.Object3D, p: { x: number; z: number }, dx: number, dz: number, y: number) => o.position.set(p.x + dx, y, p.z + dz);
  for (const t of tokens) place(t.g, ring[t.pos], t.off[0], t.off[1], top + 0.1);
  k.ticks.push((dt) => {
    clock += dt;
    // the Z-Block bobs and turns over its space
    place(q, ring[qAt], 0, 0, top + 0.62 + Math.sin(clock * 2.2) * 0.06);
    q.rotation.y += dt * 0.9;
    // the die: spinning while it rolls, then shows the roll
    if (rolling > 0) {
      rolling -= dt;
      dice.rotation.x += dt * 13;
      dice.rotation.z += dt * 9;
      if (rolling <= 0) dice.rotation.copy(dieUp(rolled, want));
    }
    dice.position.set(x, top + 1.25 + Math.sin(clock * 1.6) * 0.05, z);
    const tk = tokens[turn];
    if (wait > 0) {
      wait -= dt;
      if (wait <= 0) {
        rolled = 1 + Math.floor(Math.random() * 6);
        rolling = 0.7;
        tk.left = rolled;
        tk.hop = 1;
      }
      return;
    }
    if (rolling > 0) return;
    // hop, space by space
    tk.hop += dt / 0.26;
    if (tk.hop >= 1) {
      if (tk.left <= 0) {
        // landed: the Z-Block, bought, moves on
        if (tk.pos === qAt) qAt = (qAt + 7 + Math.floor(Math.random() * 9)) % ring.length;
        turn = (turn + 1) % tokens.length;
        wait = 1.1;
        return;
      }
      tk.from = tk.pos;
      tk.pos = (tk.pos + 1) % ring.length;
      tk.left--;
      tk.hop = 0;
    }
    const a = ring[tk.from],
      b2 = ring[tk.pos];
    const s = Math.min(1, tk.hop);
    tk.g.position.set(a.x + (b2.x - a.x) * s + tk.off[0], top + 0.1 + Math.sin(s * Math.PI) * 0.22, a.z + (b2.z - a.z) * s + tk.off[1]);
  });
  // its name along the dais' front edge
  k.label(T("ZK PARTY · THE BOARD GAME", "ZK PARTY · 派对棋盘"), x, 0.27, z + 1.935, { h: 0.2, color: "#ff6b35" });
  const open = (): PickInfo => ({ eyebrow: "ZK PARTY", title: T("The board game", "派对棋盘"), party: "board" });
  k.hit(5.3, 1.7, 3.9, x, 0, z, `<b>${T("ZK PARTY · board game", "ZK PARTY · 棋盘游戏")}</b><span>${T("roll, hop, buy Z-Blocks · you vs three snarks", "掷骰、前进、买 Z 方块 · 你对三个 zkSNARK")}</span>`, open);
  // two armchairs to watch from
  for (const s of [-1, 1]) k.put("gh-armchair", () => F.armchair("#3a2a6a"), x + s * 1.5, z + 2.95, Math.PI, { solid: false });
}

/** THE ORCHARD ROOM: the poker room in the west corner, behind its arch: two tables for eight, lilac lamps. */
function latticeRoom(k: GKit) {
  const L = LATTICE;
  const wallMat = std("#17121f", 0.8);
  // an orchard trellis on its walls: lilac lines on void, gold fruit where they cross
  const lattice = tex(256, 3, 1, (g, S) => {
    g.fillStyle = "#17121f";
    g.fillRect(0, 0, S, S);
    g.strokeStyle = "rgba(196,177,252,0.55)";
    g.lineWidth = 2;
    const b1 = [38, 10],
      b2 = [14, 34];
    for (let i = -8; i < 16; i++) {
      g.beginPath();
      g.moveTo(i * b1[0], i * b1[1]);
      g.lineTo(i * b1[0] + b2[0] * 12, i * b1[1] + b2[1] * 12);
      g.stroke();
      g.beginPath();
      g.moveTo(i * b2[0], i * b2[1]);
      g.lineTo(i * b2[0] + b1[0] * 12, i * b2[1] + b1[1] * 12);
      g.stroke();
    }
    g.fillStyle = "#f4b728";
    for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) g.fillRect(i * b1[0] + j * b2[0] - 2, i * b1[1] + j * b2[1] - 2, 4, 4);
  });
  const latticeMat = new THREE.MeshStandardMaterial({ map: lattice, emissive: "#ffffff", emissiveMap: lattice, emissiveIntensity: 0.25, roughness: 0.8 });
  const back = new THREE.Mesh(new THREE.PlaneGeometry(L.x1 - L.x0 - 0.3, L.h - 1.2), latticeMat);
  back.position.set((L.x0 + L.x1) / 2, 1.2 + (L.h - 1.2) / 2, L.z0 + 0.13);
  back.raycast = () => {};
  k.root.add(back);
  // the partitions: east with a long window onto the hall, south with the arch
  const y = 0;
  k.rects.push(wall(k.root, L.x1, L.z0, L.x1, L.z1, 1.0, wallMat, y, 0.16));
  k.box(0.16, L.h - 2.8, L.z1 - L.z0, wallMat, L.x1, 2.8, (L.z0 + L.z1) / 2);
  const glass = new THREE.MeshStandardMaterial({ color: "#c4b1fc", transparent: true, opacity: 0.12, roughness: 0.05, metalness: 0.3, depthWrite: false });
  const win = new THREE.Mesh(new THREE.PlaneGeometry(L.z1 - L.z0, 1.8), glass);
  win.rotation.y = Math.PI / 2;
  win.position.set(L.x1, 1.9, (L.z0 + L.z1) / 2);
  win.raycast = () => {};
  k.root.add(win);
  for (let z = L.z0; z <= L.z1 + 0.01; z += (L.z1 - L.z0) / 6) k.box(0.1, 1.8, 0.1, k.trim, L.x1, 1.0, z);
  k.rects.push(wall(k.root, L.x0, L.z1, L.arch[0], L.z1, L.h, wallMat, y, 0.16), wall(k.root, L.arch[1], L.z1, L.x1, L.z1, L.h, wallMat, y, 0.16));
  k.box(L.arch[1] - L.arch[0], L.h - 2.9, 0.16, wallMat, (L.arch[0] + L.arch[1]) / 2, 2.9, L.z1);
  // the arch's neon and its name
  const ax = (L.arch[0] + L.arch[1]) / 2;
  for (const s of [L.arch[0], L.arch[1]]) k.box(0.06, 2.9, 0.06, k.lilac, s, 0, L.z1 + 0.1);
  k.box(L.arch[1] - L.arch[0], 0.06, 0.06, k.lilac, ax, 2.9, L.z1 + 0.1);
  k.label(T("THE ORCHARD ROOM", "果园厅"), ax, 3.25, L.z1 + 0.1, { h: 0.34, color: "#c4b1fc" });
  // its ceiling, lower than the hall's, and a lilac cove
  k.box(L.x1 - L.x0, 0.15, L.z1 - L.z0, std("#0e0b14", 0.9), (L.x0 + L.x1) / 2, L.h, (L.z0 + L.z1) / 2);
  k.box(L.x1 - L.x0 - 0.4, 0.04, 0.04, k.lilac, (L.x0 + L.x1) / 2, L.h - 0.1, L.z0 + 0.3);
  // a dark rug
  k.flat(L.x1 - L.x0 - 0.6, L.z1 - L.z0 - 0.6, std("#1d1530", 0.95), (L.x0 + L.x1) / 2, (L.z0 + L.z1) / 2);
  // the two tables: felt, eight velvet chairs, a lamp bar over each, cards and chips on the felt
  POKER.forEach(([tx, tz], n) => {
    k.put("gh-poker", () => pokerTable("#103844", "#4a8a98"), tx, tz);
    // the lamp: a void shade, its light underneath
    k.box(2.1, 0.14, 0.42, k.dark, tx, L.h - 1.05, tz).raycast = () => {};
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(1.95, 0.3), glowMat("#e6dcff", 0.95));
    glow.rotation.x = Math.PI / 2;
    glow.position.set(tx, L.h - 1.055, tz);
    glow.raycast = () => {};
    k.root.add(glow);
    for (const s of [-1, 1]) k.box(0.02, 0.9, 0.02, k.trim, tx + s * 0.8, L.h - 0.91, tz);
    const seats = pokerSeats(tx, tz);
    seats.forEach((p) => k.put("gh-roomChairL", () => roomChair("#35285c"), p.x, p.z, p.rot, { solid: false }));
    felt(k, tx, tz, n);
    const def = tableCard("holdem");
    const info = (): PickInfo => ({ eyebrow: T("The Orchard Room", "果园厅"), title: def.title, table: "holdem" });
    k.hit(3.3, 1.2, 1.9, tx, 0, tz, tableHover("holdem"), info);
  });
}

/** Eight seats round an oval poker table (the dealer's place, −z, left free): positions and the chairs' turn. */
function pokerSeats(tx: number, tz: number) {
  const spots: [number, number][] = [
    [-1.75, 0],
    [-1.05, 0.95],
    [-0.35, 1.05],
    [0.35, 1.05],
    [1.05, 0.95],
    [1.75, 0],
    [1.05, -0.95],
    [-1.05, -0.95],
  ];
  return spots.map(([dx, dz]) => ({ x: tx + dx, z: tz + dz, rot: Math.atan2(-dx, -dz), face: new THREE.Vector3(-dx, 0, -dz).normalize() }));
}

/** What lies on a poker table: five cards in the middle (three turned up), the players' cards, chips, the pot; a card turns now and then. */
function felt(k: GKit, tx: number, tz: number, n: number) {
  const y = 0.755;
  const board = ["A◆", "Q♠", "7♥", "back", "back"];
  const cards = board.map((f, i) => {
    const c = card(f);
    c.position.set(tx - 0.24 + i * 0.12, y, tz);
    k.root.add(c);
    return c;
  });
  for (const p of pokerSeats(tx, tz).filter((_, i) => (i + n) % 2 === 0)) {
    for (const s of [-1, 1]) {
      const c = card("back");
      const ix = tx + (p.x - tx) * 0.55 + s * 0.04,
        iz = tz + (p.z - tz) * 0.55;
      c.position.set(ix, y + 0.001, iz);
      c.rotation.y = Math.atan2(p.x - tx, p.z - tz) + s * 0.12;
      k.root.add(c);
    }
    const st = chips(["#ff6b35", "#c4b1fc", "#a8d8e8", "#e8e6e0"][(p.x * 7) & 3], 6 + Math.floor(k.rnd(p.x, p.z) * 10));
    st.position.set(tx + (p.x - tx) * 0.72, y, tz + (p.z - tz) * 0.72);
    k.root.add(st);
  }
  const pot = chips("#ff6b35", 14);
  pot.position.set(tx + 0.05, y, tz + 0.22);
  k.root.add(pot);
  const pot2 = chips("#c4b1fc", 9);
  pot2.position.set(tx - 0.06, y, tz + 0.25);
  k.root.add(pot2);
  // the turn and the river come and go
  let tt = n * 3;
  const faces = ["K◆", "9♣", "2♥", "J♠", "5◆", "10♣"];
  k.ticks.push((dt) => {
    tt += dt;
    const phase = tt % 14;
    for (const i of [3, 4]) {
      const show = phase > (i === 3 ? 4 : 8);
      const c = cards[i];
      const wantFace = show ? faces[Math.floor(tt / 14 + i) % faces.length] : "back";
      if ((c.userData.face ?? "back") !== wantFace) {
        c.userData.face = wantFace;
        c.material = card(wantFace).material;
        c.userData.flip = 1;
      }
      if (c.userData.flip > 0) {
        c.userData.flip = Math.max(0, c.userData.flip - dt * 3);
        c.position.y = y + Math.sin(c.userData.flip * Math.PI) * 0.05;
        c.rotation.z = c.userData.flip * Math.PI;
      }
    }
  });
}

/** BLOCK BARONS: two board tables at the back on the east side, eight chairs each, the board, dice that tumble. */
function baronsZone(k: GKit) {
  const boardTex = baronsBoard().t;
  const boardMat = new THREE.MeshStandardMaterial({ map: boardTex, roughness: 0.7 });
  const houseMat = std("#ffffff", 0.5);
  BARONS.forEach(([tx, tz], n) => {
    k.put("gh-baronsTable", boardTable, tx, tz);
    const b = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 2.0), boardMat);
    b.rotation.x = -Math.PI / 2;
    b.rotation.z = (n * Math.PI) / 2;
    b.position.set(tx, 0.756, tz);
    k.root.add(b);
    // little blocks built on the board (houses), and the tokens
    const hm: THREE.Matrix4[] = [];
    const hc: string[] = [];
    for (let i = 0; i < 10; i++) {
      const side = i % 4,
        t = -0.7 + k.rnd(i, n) * 1.4;
      const [dx, dz] = [
        [t, 0.82],
        [0.82, t],
        [t, -0.82],
        [-0.82, t],
      ][side];
      hm.push(new THREE.Matrix4().compose(new THREE.Vector3(tx + dx, 0.79, tz + dz), new THREE.Quaternion(), new THREE.Vector3(0.06, 0.07, 0.06)));
      hc.push(i % 3 ? "#6dbf8a" : "#ff6b35");
    }
    const houses = k.instances(new THREE.BoxGeometry(1, 1, 1), houseMat, hm);
    hc.forEach((c, i) => houses.setColorAt(i, new THREE.Color(c)));
    houses.instanceColor!.needsUpdate = true;
    // two dice that tumble across the middle now and then
    const d = [die(0.06), die(0.06)];
    for (const x of d) k.root.add(x);
    const want = new THREE.Euler();
    let tt = n * 2.5,
      roll = -1;
    const rest = d.map((_, i) => new THREE.Vector3(tx - 0.12 + i * 0.16, 0.786, tz + 0.1 - i * 0.08));
    d.forEach((x, i) => {
      x.position.copy(rest[i]);
      x.rotation.copy(dieUp(1 + ((i * 3 + n) % 6), want));
    });
    k.ticks.push((dt) => {
      tt += dt;
      if (tt > 7) {
        tt = 0;
        roll = 0;
        rest.forEach((r) => r.set(tx + (Math.random() - 0.5) * 0.5, 0.786, tz + (Math.random() - 0.5) * 0.5));
      }
      if (roll < 0) return;
      roll += dt;
      const s = Math.min(1, roll / 0.9);
      d.forEach((x, i) => {
        const from = new THREE.Vector3(tx - 0.6 + i * 0.1, 0.9, tz + 0.6);
        x.position.lerpVectors(from, rest[i], 1 - Math.pow(1 - s, 2));
        x.position.y = 0.786 + Math.abs(Math.sin(s * Math.PI * 3)) * (1 - s) * 0.12;
        if (s < 1) {
          x.rotation.x += dt * 14;
          x.rotation.y += dt * 9;
        } else x.rotation.copy(dieUp(1 + Math.floor(Math.random() * 6), want));
      });
      if (s >= 1) roll = -1;
    });
    // eight chairs, two a side
    for (const [dx, dz] of baronsSeats()) k.put("gh-roomChairB", () => roomChair("#8a3a1e"), tx + dx, tz + dz, Math.atan2(-dx, -dz), { solid: false });
    const def = tableCard("barons");
    k.hit(2.5, 1.2, 2.5, tx, 0, tz, tableHover("barons"), (): PickInfo => ({ eyebrow: T("Table game", "牌桌游戏"), title: def.title, table: "barons" }));
  });
  k.label(T("BLOCK BARONS", "区块大亨"), 11.9, 4.2, ROOM.z0 + 0.14, { h: 0.6, color: "#ff6b35" });
  k.label(T("区块大亨 · property board game", "BLOCK BARONS · 地产棋盘游戏"), 11.9, 3.7, ROOM.z0 + 0.14, { h: 0.24, color: "#ffb08a" });
}
const baronsSeats = (): [number, number][] => [
  [-0.5, 1.45],
  [0.5, 1.45],
  [1.45, 0.5],
  [1.45, -0.5],
  [0.5, -1.45],
  [-0.5, -1.45],
  [-1.45, -0.5],
  [-1.45, 0.5],
];

/** LAST SNARK: three round card tables at the front on the east side; a card is played onto the pile now and then. */
function glyphZone(k: GKit) {
  const colors = ["#ff6b35", "#c4b1fc", "#a8d8e8", "#6dbf8a"];
  GLYPH.forEach(([tx, tz], n) => {
    k.put("gh-cardTable", () => cardTable("#3a2c66"), tx, tz);
    for (const [dx, dz] of glyphSeats()) k.put("gh-roomChairG", () => roomChair("#3e3070"), tx + dx, tz + dz, Math.atan2(-dx, -dz), { solid: false });
    const y = 0.755;
    // the pile in the middle, the draw stack, hands at the seats
    const pile: THREE.Mesh[] = [];
    for (let i = 0; i < 3; i++) {
      const c = card(`glyph:${colors[(i + n) % 4]}`);
      c.position.set(tx + (k.rnd(i, n) - 0.5) * 0.06, y + i * 0.002, tz + (k.rnd(i + 3, n) - 0.5) * 0.06);
      c.rotation.y = k.rnd(i, n + 5) * 3;
      k.root.add(c);
      pile.push(c);
    }
    const stack = k.box(0.09, 0.04, 0.13, k.dark, tx + 0.22, y, tz - 0.12);
    stack.raycast = () => {};
    const deck = card("back");
    deck.position.set(tx + 0.22, y + 0.045, tz - 0.12);
    k.root.add(deck);
    for (const [dx, dz] of glyphSeats())
      for (let i = 0; i < 3; i++) {
        const c = card("back");
        c.position.set(tx + dx * 0.5 + (i - 1) * 0.035 * Math.cos(Math.atan2(dx, dz)), y + 0.001 * i, tz + dz * 0.5 - (i - 1) * 0.035 * Math.sin(Math.atan2(dx, dz)));
        c.rotation.y = Math.atan2(dx, dz) + (i - 1) * 0.2;
        k.root.add(c);
      }
    // a card flies from a seat onto the pile
    const fly = card(`glyph:${colors[n]}`);
    fly.visible = false;
    k.root.add(fly);
    let tt = n * 1.3,
      seatI = 0;
    const from = new THREE.Vector3(),
      to = new THREE.Vector3();
    k.ticks.push((dt) => {
      tt += dt;
      if (tt > 3.6) {
        tt = 0;
        const [dx, dz] = glyphSeats()[seatI++ % 5];
        from.set(tx + dx * 0.5, y + 0.01, tz + dz * 0.5);
        to.set(tx + (Math.random() - 0.5) * 0.08, y + 0.008, tz + (Math.random() - 0.5) * 0.08);
        fly.material = card(`glyph:${colors[Math.floor(Math.random() * 4)]}`).material;
        fly.visible = true;
      }
      if (!fly.visible) return;
      const s = Math.min(1, tt / 0.45);
      fly.position.lerpVectors(from, to, s);
      fly.position.y += Math.sin(s * Math.PI) * 0.12;
      fly.rotation.set(0, s * 5, (1 - s) * Math.PI);
      if (s >= 1) {
        // it lands: it becomes the pile's top card
        const top = pile.shift()!;
        top.material = fly.material;
        top.position.copy(to);
        top.rotation.set(0, fly.rotation.y, 0);
        pile.push(top);
        pile.forEach((c, i) => (c.position.y = y + i * 0.002));
        fly.visible = false;
      }
    });
    const def = tableCard("glyph");
    k.hit(2.0, 1.2, 2.0, tx, 0, tz, tableHover("glyph"), (): PickInfo => ({ eyebrow: T("Table game", "牌桌游戏"), title: def.title, table: "glyph" }));
  });
  k.label(T("LAST SNARK", "最后一证"), ROOM.x1 - 0.14, 4.1, -6.1, { h: 0.6, color: "#c4b1fc", rot: -Math.PI / 2 });
  k.label(T("最后一证 · the shedding card game", "LAST SNARK · 出牌游戏"), ROOM.x1 - 0.14, 3.6, -6.1, { h: 0.24, color: "#d8ccff", rot: -Math.PI / 2 });
}
const glyphSeats = (): [number, number][] => [0, 1, 2, 3, 4].map((i) => [Math.sin((i / 5) * Math.PI * 2 + 0.3) * 1.25, Math.cos((i / 5) * Math.PI * 2 + 0.3) * 1.25]);

/** A table's hover line: its game's name, and whether it is open. */
function tableHover(key: string): HoverFn {
  const c = tableCard(key);
  return `<b>${c.title}</b><span>${c.ready ? T(`${c.seats} players · click to sit down`, `${c.seats} 人 · 点击入座`) : T("coming soon", "即将开放")}</span>`;
}

/** The zones' standing cards, turned to the doors: the game's picture, PLAY or COMING SOON. */
function zoneCards(k: GKit) {
  const spots: [string, number, number][] = [
    ["holdem", -9.4, -10.4],
    ["barons", 8.4, -12.9],
    ["glyph", 7.0, -4.2],
  ];
  for (const [key, x, z] of spots) {
    const rot = Math.atan2(0 - x, -1.6 - z);
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = rot;
    k.root.add(g);
    k.put("gh-signStand", signStand, 0, 0, 0, { parent: g, solid: false });
    const pic = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.5), new THREE.MeshBasicMaterial({ map: zoneCard(key).t, toneMapped: false }));
    pic.position.set(0, 1.68, 0.1);
    g.add(pic);
    k.rects.push([x - 0.35, z - 0.35, x + 0.35, z + 0.35]);
    const c = tableCard(key);
    k.pickAll(g, tableHover(key), (): PickInfo => ({ eyebrow: T("Table game", "牌桌游戏"), title: c.title, table: key }));
  }
}

/** THE LUCKY NONCE: the bar by the doors, its stools, its menu. */
function bar(k: GKit) {
  k.put("gh-bar", () => F.barCounter(6.2, "#c4b1fc"), -12.0, -6.5, Math.PI / 2);
  k.put("gh-backBar", () => F.backBar(6.2), -14.72, -6.5, Math.PI / 2);
  for (let z = -9.0; z <= -4.0; z += 1.0) k.put("gh-stool", () => F.stool("#ff6b35"), -11.15, z, 0, { solid: false });
  const menu = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.875), new THREE.MeshBasicMaterial({ map: barMenu().t, toneMapped: false }));
  menu.position.set(ROOM.x0 + 0.2, 3.35, -6.5);
  menu.rotation.y = Math.PI / 2;
  k.root.add(menu);
  k.label(T("THE LUCKY NONCE · 酒吧", "幸运随机数 · BAR"), ROOM.x0 + 0.14, 4.75, -6.5, { h: 0.42, color: "#ff6b35", rot: Math.PI / 2 });
  const drinks: [string, string, string, string][] = [
    ["Zero-Knowledge Sour", "零知识酸酒", "Nobody can tell what's in it, yet it's provably sour.", "没人知道里面是什么，但可以证明它是酸的。"],
    ["Orchard Spritz", "果园气泡酒", "Apple, elderflower and bubbles, fully shielded. The Tracker can't trace a drop.", "苹果、接骨木花和气泡，全程屏蔽。追踪者一滴也查不到。"],
    ["Sprout Old Fashioned", "萌芽古典", "From the first shielded pool: retired, still poured.", "来自第一个屏蔽池：已退役，照样倒酒。"],
    ["Equihash Mule", "Equihash 骡子", "Ginger, lime, and a memory-hard round on the ice.", "姜、青柠，冰块上再加一轮内存困难计算。"],
    ["Lucky Nonce", "幸运随机数", "Alcohol-free. The house swears it finds blocks.", "无酒精。店家发誓它能帮你出块。"],
  ];
  let poured = 0;
  const hover = `<b>${T("The Lucky Nonce", "幸运随机数酒吧")}</b><span>${T("order a drink", "点一杯")}</span>`;
  const order = (): PickInfo => {
    const [en, zh, den, dzh] = drinks[poured++ % drinks.length];
    return { eyebrow: T("The Lucky Nonce · bar", "幸运随机数 · 酒吧"), title: T(`${en} 🍸`, `${zh} 🍸`), body: `<p>${T(den, dzh)}</p><p>${T("On the house: the chips stay yours.", "本店请客：筹码还是你的。")}</p>` };
  };
  k.hit(0.8, 1.2, 6.3, -12.0, 0, -6.5, hover, order);
  k.pick(menu, hover, order);
}

/** A lounge between the bar and the board: two sofas, a low table, plants; two ZK PARTY cabinets by the east wall. */
function lounge(k: GKit) {
  k.put("gh-sofaA", () => F.sofa("#2a2440", 3, "#ff6b35"), -6.0, -4.0, Math.PI);
  k.put("gh-sofaA", () => F.sofa("#2a2440", 3, "#ff6b35"), -6.0, -7.6, 0);
  k.put("gh-coffee", F.coffeeTable, -6.0, -5.8);
  const d = die(0.16);
  d.position.set(-5.7, 0.5, -5.8);
  d.rotation.set(0.2, 0.6, 0);
  k.root.add(d);
  for (const [x, z, s] of [
    [-14.3, -0.8, 1],
    [14.3, -0.8, 2],
    [-8.1, -10.6, 3],
    [8.1, -23.3, 4],
    [-3.6, -23.4, 5],
    [3.6, -23.4, 6],
  ] as const)
    k.put(`gh-plant${s % 2}`, () => F.plant(s % 2 ? "monstera" : "ficus", s), x, z);
  // two ZK PARTY cabinets (the arcade's), their attract screens on
  const gm = ART.party;
  for (const [i, z] of [-1.6, -2.6].entries()) {
    const cab = k.put("gh-cab", () => F.arcadeCabinet(gm.color, gm.side), ROOM.x1 - 0.55, z, -Math.PI / 2);
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.64, 0.56), new THREE.MeshBasicMaterial({ map: marquee("party"), toneMapped: false }));
    scr.position.set(0, 1.38 * 2, 0.03);
    scr.scale.setScalar(2);
    cab.add(scr);
    const info = (): PickInfo => ({ eyebrow: T("ZK Arcade", "ZK 街机厅"), title: "ZK PARTY", party: i ? "practice" : "board" });
    k.pickAll(cab, `<b>ZK PARTY</b><span>${T("play for ⓩ against three snarks", "与三个 zkSNARK 对战赢 ⓩ")}</span>`, info);
  }
}

/** The house leaderboard on the east wall: your record, the regulars. */
function leaderboard(k: GKit) {
  const s = k.screen(3.9, 2.2, drawLeaderboard, 4, 1024);
  s.position.set(ROOM.x1 - 0.2, 2.65, -11.8);
  s.rotation.y = -Math.PI / 2;
  k.box(0.08, 2.4, 4.1, k.dark, ROOM.x1 - 0.14, 1.45, -11.8);
  k.box(0.06, 0.05, 4.1, k.lilac, ROOM.x1 - 0.2, 3.85, -11.8);
  k.pick(s, `<b>${T("House leaderboard", "游戏屋排行榜")}</b><span>${T("your record", "你的战绩")}</span>`, () => {
    const p = profile.p;
    const lv = levelOf(p.xp);
    const ts = tableStats();
    const rows = Object.entries(ts)
      .map(([key, r]) => `<p><b>${tableCard(key).title}</b> · ${T(`${r.wins} won of ${r.played}, best ⓩ ${r.best.toLocaleString("en-US")}`, `${r.played} 局赢 ${r.wins} 局，最高 ⓩ ${r.best.toLocaleString("en-US")}`)}</p>`)
      .join("");
    return {
      eyebrow: T("Game House", "游戏屋"),
      title: T("House leaderboard", "游戏屋排行榜"),
      stats: [
        [T("Level", "等级"), String(lv.level)],
        [T("Chips", "筹码"), `ⓩ ${p.z.toLocaleString("en-US")}`],
        [T("Parties won", "派对胜场"), String(p.party.wins)],
        [T("Mini-games won", "小游戏胜场"), String(p.party.miniWins)],
      ],
      body: `${rows || `<p>${T("No table game played yet: pick a table and sit down.", "还没玩过牌桌游戏：挑一张桌子坐下吧。")}</p>`}<p>${T("ⓩ play chips, in this browser · never real ZEC", "ⓩ 游戏筹码，只在本浏览器 · 绝非真实 ZEC")}</p>`,
    };
  });
  profile.subscribe(() => s.redraw());
}

/** The air: string lights under the ceiling, hanging Z-Blocks and dice, the zones' cards. */
function decor(k: GKit) {
  zoneCards(k);
  // string lights: five runs across the hall, drooping between the beams
  const bulbs: THREE.Matrix4[] = [];
  for (const z of [-3.5, -7.5, -11.5, -15.5, -19.5])
    for (let i = 0; i <= 40; i++) {
      const x = ROOM.x0 + 0.5 + (i / 40) * (ROOM.x1 - ROOM.x0 - 1);
      const sag = Math.abs(Math.sin(((x - ROOM.x0) / 6) * Math.PI)) * 0.45;
      if (x < LATTICE.x1 + 0.3 && z < LATTICE.z1) continue;
      bulbs.push(new THREE.Matrix4().makeTranslation(x, ROOM.h - 0.55 - sag, z));
    }
  k.instances(new THREE.SphereGeometry(0.05, 8, 6), glowMat("#ffe2b8", 1.7), bulbs);
  // hanging Z-Blocks and dice, turning slowly
  const hang: { o: THREE.Object3D; y: number; s: number }[] = [];
  for (const [x, y, z, s] of [
    [-5.5, 5.5, -16.5, 0.9],
    [5.6, 5.7, -7.0, 0.8],
    [-2.8, 5.9, -4.2, 0.7],
  ]) {
    const q = qBlock(s);
    q.position.set(x, y, z);
    q.raycast = () => {};
    k.root.add(q);
    k.box(0.02, ROOM.h - y - s / 2, 0.02, k.trim, x, y + s / 2, z);
    hang.push({ o: q, y, s: 0.5 + x * 0.05 });
  }
  for (const [x, y, z, s] of [
    [6.6, 5.4, -16.8, 0.75],
    [-7.4, 5.6, -9.2, 0.65],
  ]) {
    const d = die(s);
    d.position.set(x, y, z);
    d.rotation.set(0.5, 0.3, 0.7);
    d.raycast = () => {};
    k.root.add(d);
    k.box(0.02, ROOM.h - y - s / 2, 0.02, k.trim, x, y + s / 2, z);
    hang.push({ o: d, y, s: -0.4 - z * 0.01 });
  }
  let t0 = 0;
  k.ticks.push((dt) => {
    t0 += dt;
    for (const h of hang) {
      h.o.rotation.y += dt * h.s * 0.4;
      h.o.position.y = h.y + Math.sin(t0 * 0.8 + h.s * 5) * 0.06;
    }
  });
  // rugs under the table zones
  k.flat(7.0, 10.6, std("#241a16", 0.95), 11.9, -18.0);
  k.flat(7.6, 7.4, std("#1c1530", 0.95), 11.2, -6.0);
  // pendant lamps over the BLOCK BARONS and LAST SNARK tables (one draw call for the shades, one for the light, one for the cords)
  const over: [number, number, number][] = [...BARONS.map(([x, z]) => [x, z, 2.6] as [number, number, number]), ...GLYPH.map(([x, z]) => [x, z, 2.3] as [number, number, number])];
  const q = new THREE.Quaternion();
  const one = new THREE.Vector3(1, 1, 1);
  k.instances(new THREE.CylinderGeometry(0.22, 0.42, 0.3, 18, 1, true), new THREE.MeshStandardMaterial({ color: "#16141c", roughness: 0.5, metalness: 0.4, side: THREE.DoubleSide }), over.map(([x, z, y]) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q, one)));
  k.instances(new THREE.CircleGeometry(0.38, 18).rotateX(Math.PI / 2), glowMat("#ffe6c4", 1.25), over.map(([x, z, y]) => new THREE.Matrix4().makeTranslation(x, y - 0.12, z)));
  k.instances(new THREE.CylinderGeometry(0.01, 0.01, 1, 4), k.trim, over.map(([x, z, y]) => new THREE.Matrix4().compose(new THREE.Vector3(x, (y + 0.15 + ROOM.h) / 2, z), q, new THREE.Vector3(1, ROOM.h - y - 0.15, 1))));
  // the runner from the doors to the board: dark, edged in flare, a ⓩ every metre
  const run = makeCanvas(64, 512, (g) => {
    g.fillStyle = "#1a1018";
    g.fillRect(0, 0, 64, 512);
    g.fillStyle = "#ff6b35";
    g.fillRect(0, 0, 4, 512);
    g.fillRect(60, 0, 4, 512);
    g.fillStyle = "rgba(255,107,53,0.35)";
    g.fillRect(7, 0, 2, 512);
    g.fillRect(55, 0, 2, 512);
    // (the canvas is stretched 4× across on the floor: the marks are drawn 4× tall to land round)
    for (let y = 48; y < 512; y += 96) {
      g.save();
      g.translate(32, y);
      g.scale(1, 4);
      drawMark(g, 0, 0, 20, "rgba(196,177,252,0.5)", "rgba(255,107,53,0.7)");
      g.restore();
    }
  }).t;
  k.flat(2.6, 5.2, new THREE.MeshStandardMaterial({ map: run, roughness: 0.95 }), 0, -4.4, 0.012);
  // neon line art on the upper walls: dice, cards, chips, Z-Blocks, a joystick, a cup
  for (const side of [-1, 1]) {
    const art = makeCanvas(2048, 220, (g) => drawNeonArt(g, 2048, 220, side));
    const p = new THREE.Mesh(new THREE.PlaneGeometry(22, 22 * (220 / 2048)), new THREE.MeshBasicMaterial({ map: art.t, transparent: true, toneMapped: false, depthWrite: false }));
    p.position.set(side * (ROOM.x1 - 0.16), 5.25, -12.2);
    p.rotation.y = -side * (Math.PI / 2);
    p.raycast = () => {};
    k.root.add(p);
  }
}

/** The pictograms of the upper walls, in neon: a run of the house's toys. */
function drawNeonArt(g: CanvasRenderingContext2D, W: number, H: number, side: number) {
  g.clearRect(0, 0, W, H);
  g.lineWidth = 7;
  g.lineCap = g.lineJoin = "round";
  const cols = ["#ff6b35", "#c4b1fc", "#a8d8e8", "#6dbf8a", "#ff5c8a"];
  const n = 8;
  const step = W / n;
  const kinds = side < 0 ? ["die", "card", "chips", "q", "pad", "cup", "die", "card"] : ["q", "cup", "die", "card", "chips", "pad", "q", "die"];
  kinds.forEach((kind, i) => {
    const c = cols[(i + (side < 0 ? 0 : 2)) % cols.length];
    const x = step * (i + 0.5),
      y = H / 2,
      s = H * 0.34;
    g.strokeStyle = c;
    g.fillStyle = c;
    g.shadowColor = c;
    g.shadowBlur = 18;
    g.save();
    g.translate(x, y);
    g.rotate((i % 2 ? 1 : -1) * 0.12);
    if (kind === "die") {
      rr(g, -s, -s, s * 2, s * 2, s * 0.3);
      g.stroke();
      for (const [u, v] of [
        [-1, -1],
        [1, 1],
        [0, 0],
        [1, -1],
        [-1, 1],
      ]) {
        g.beginPath();
        g.arc(u * s * 0.5, v * s * 0.5, 7, 0, Math.PI * 2);
        g.fill();
      }
    } else if (kind === "card") {
      rr(g, -s * 0.72, -s * 1.05, s * 1.44, s * 2.1, 12);
      g.stroke();
      drawMark(g, 0, 0, s * 1.15, c, c);
    } else if (kind === "chips") {
      for (let k = 0; k < 3; k++) {
        g.beginPath();
        g.ellipse(0, s * 0.6 - k * s * 0.5, s * 0.9, s * 0.32, 0, 0, Math.PI * 2);
        g.stroke();
      }
    } else if (kind === "q") {
      rr(g, -s, -s, s * 2, s * 2, 10);
      g.stroke();
      g.font = `900 ${Math.round(s * 1.5)}px Geist, sans-serif`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText("Z", 0, s * 0.08);
    } else if (kind === "pad") {
      rr(g, -s * 1.2, -s * 0.55, s * 2.4, s * 1.1, s * 0.5);
      g.stroke();
      g.beginPath();
      g.moveTo(-s * 0.75, 0);
      g.lineTo(-s * 0.35, 0);
      g.moveTo(-s * 0.55, -s * 0.2);
      g.lineTo(-s * 0.55, s * 0.2);
      g.stroke();
      for (const [u, v] of [
        [0.5, -0.12],
        [0.8, 0.12],
      ]) {
        g.beginPath();
        g.arc(u * s, v * s, 8, 0, Math.PI * 2);
        g.fill();
      }
    } else {
      // a cup
      g.beginPath();
      g.moveTo(-s * 0.7, -s * 0.9);
      g.lineTo(s * 0.7, -s * 0.9);
      g.quadraticCurveTo(s * 0.68, s * 0.2, 0, s * 0.32);
      g.quadraticCurveTo(-s * 0.68, s * 0.2, -s * 0.7, -s * 0.9);
      g.stroke();
      g.beginPath();
      g.moveTo(0, s * 0.32);
      g.lineTo(0, s * 0.8);
      g.moveTo(-s * 0.45, s * 0.9);
      g.lineTo(s * 0.45, s * 0.9);
      g.stroke();
    }
    g.restore();
  });
}
function rr(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/** THE CAGE, by the doors on the east side: the house's cashier, your chips. */
function cashier(k: GKit) {
  const x = 6.2,
    z = -1.15;
  k.put("gh-cage", cage, x, z, Math.PI);
  void k.person(9150, [x - 0.4, z + 0.55], T("Cashier", "收银员"), { face: new THREE.Vector3(0, 0, -1), chat: "bar" });
  k.label(T("THE CAGE · ⓩ CHIPS", "兑换处 · ⓩ 筹码"), x, 2.75, z - 0.42, { h: 0.26, color: "#c4b1fc", rot: Math.PI });
  const info = (): PickInfo => {
    const p = profile.p;
    return {
      eyebrow: T("The Cage · cashier", "兑换处 · 收银"),
      title: `ⓩ ${p.z.toLocaleString("en-US")}`,
      mono: true,
      stats: [
        [T("Level", "等级"), String(levelOf(p.xp).level)],
        [T("Day streak", "连续天数"), String(p.streak)],
      ],
      body: `<p>${T("ⓩ play chips: free, in this browser, never real ZEC.", "ⓩ 游戏筹码：免费，只在本浏览器，绝非真实 ZEC。")}</p><p>${T("Out of chips? Free refill at the ZK PARTY hall.", "筹码用完了？ZK PARTY 大厅免费补给。")}</p>`,
    };
  };
  k.hit(3.1, 2.4, 0.9, x, 0, z, `<b>${T("The Cage", "兑换处")}</b><span>${T("your chips", "你的筹码")}</span>`, info);
}

/**
 * The house's zkSNARKs: at the tables (dealing, playing), watching the board, at the bar, in front of
 * the wall; every few seconds one of them says something or reacts.
 */
function life(k: GKit) {
  const pid = 9100;
  // the wall and the desk
  void k.person(pid + 1, [-3.4, -19.6], T("Gamer", "玩家"), { face: new THREE.Vector3(0, 0, -1), chat: "wall" });
  void k.person(pid + 2, [4.4, -18.8], T("Gamer", "玩家"), { face: new THREE.Vector3(-0.2, 0, -1), chat: "wall", wander: [[4.4, -18.8], [-1.8, -18.4], [6.2, -17.2]] });
  void k.person(pid + 3, [-0.4, -22.3], T("Tournament host", "锦标赛主持"), { face: new THREE.Vector3(0, 0, 1), chat: "wall" });
  // the board's watchers
  for (const s of [-1, 1]) void k.person(pid + 5 + s, [DAIS.x + s * 1.5, DAIS.z + 2.85], T("Party player", "派对玩家"), { face: new THREE.Vector3(0, 0, -1), sit: true, dy: 0.42, chat: "party" });
  void k.person(pid + 7, [DAIS.x + 3.1, DAIS.z - 0.6], T("Party player", "派对玩家"), { face: new THREE.Vector3(-1, 0, 0), chat: "party" });
  // The Orchard Room: a dealer and three at the first table, one at the second
  const [p1, p2] = POKER;
  void k.person(pid + 10, [p1[0], p1[1] - 1.2], T("Dealer", "荷官"), { face: new THREE.Vector3(0, 0, 1), chat: "poker" });
  pokerSeats(p1[0], p1[1])
    .filter((_, i) => i === 0 || i === 2 || i === 4)
    .forEach((p, i) => void k.person(pid + 11 + i, [p.x, p.z], T("Poker player", "扑克玩家"), { face: p.face, sit: true, dy: 0.52, chat: "poker" }));
  const q = pokerSeats(p2[0], p2[1])[3];
  void k.person(pid + 15, [q.x, q.z], T("Poker player", "扑克玩家"), { face: q.face, sit: true, dy: 0.52, chat: "poker" });
  // BLOCK BARONS: three at the first table
  const [b1] = BARONS;
  baronsSeats()
    .filter((_, i) => i === 1 || i === 3 || i === 6)
    .forEach(([dx, dz], i) => void k.person(pid + 20 + i, [b1[0] + dx, b1[1] + dz], T("Baron", "大亨"), { face: new THREE.Vector3(-dx, 0, -dz).normalize(), sit: true, dy: 0.52, chat: "barons" }));
  // LAST SNARK: three at the first table, one at the second
  const [g1, g2] = GLYPH;
  glyphSeats()
    .filter((_, i) => i !== 1 && i !== 4)
    .forEach(([dx, dz], i) => void k.person(pid + 30 + i, [g1[0] + dx, g1[1] + dz], T("Card player", "牌手"), { face: new THREE.Vector3(-dx, 0, -dz).normalize(), sit: true, dy: 0.52, chat: "glyph" }));
  const [gx, gz] = glyphSeats()[2];
  void k.person(pid + 34, [g2[0] + gx, g2[1] + gz], T("Card player", "牌手"), { face: new THREE.Vector3(-gx, 0, -gz).normalize(), sit: true, dy: 0.52, chat: "glyph" });
  // the bar
  void k.person(pid + 40, [-13.5, -6.0], T("Bartender", "调酒师"), { face: new THREE.Vector3(1, 0, 0), chat: "bar" });
  void k.person(pid + 41, [-11.15, -5.0], T("Regular", "常客"), { face: new THREE.Vector3(-1, 0, 0), sit: true, dy: 0.72, chat: "bar" });
  // now and then someone speaks up, or reacts
  const emotes = ["zec", "star", "!", "note", "heart", "up"] as const;
  let next = 2,
    n = 0;
  k.ticks.push((dt) => {
    next -= dt;
    if (next > 0 || !k.people.length) return;
    next = 2.2 + Math.random() * 2.5;
    const p = k.people[Math.floor(Math.random() * k.people.length)];
    if (!p.chat) return;
    if (Math.random() < 0.6) p.s.say(chatLine(p.chat, n++ + Math.floor(Math.random() * 7)), 2.8);
    else p.s.emote(emotes[Math.floor(Math.random() * emotes.length)], 2.2);
  });
}
