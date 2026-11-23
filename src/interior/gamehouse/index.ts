import * as THREE from "three";
import { T } from "../../i18n/lang";
import { profile } from "../../game/profile";
import { levelOf } from "../../game/progress";
import { tableCard, tableStats } from "../../tables/house";
import * as F from "../furniture";
import { glowMat, makeScene, std, wall } from "../kit";
import { ART, marquee } from "../tower/arcade";
import type { StairDecl } from "../lift";
import type { Interior, InteriorContext, PickInfo, Rect } from "../types";
import { arena, DUELS } from "./arena";
import { jumbotron } from "./atrium";
import { baronsBoard, barMenu, drawLeaderboard, zoneCard } from "./boards";
import { GKit, MEZZ, PX, ROOM, chatLine, makeCanvas, tex, withDayNight, type HoverFn } from "./kit";
import { bleachers, boardTable, cage, card, cardTable, chips, dais, die, dieUp, highTable, pokerTable, qBlock, roomChair, signStand } from "./props";
import { miniWall } from "./wall";
import { drawMark } from "../../party/theme";

/**
 * THE GAME HOUSE (游戏屋), the city's games palace on the avenue: one great hall on two levels.
 *
 * - The ATRIUM, two storeys high: ZK PARTY's board game on its lit dais in the middle, under the
 *   JUMBOTRON (atrium.ts), a four-sided LED cube hung on cables; two grand stairs with lit risers up
 *   to the gallery. At its back the ZK LEGENDS ARENA (arena.ts): a stage under a lighting truss, the
 *   great LED DUEL BOARD on the back wall, six duel tables on the floor, its gate.
 * - Under the west gallery: THE LUCKY NONCE (the bar) by the doors, a lounge, and THE ORCHARD ROOM,
 *   the poker room behind its arches (six tables for eight).
 * - Under the east gallery: the cashier's cage and a row of ZK PARTY cabinets by the doors, LAST SNARK
 *   at four card tables, BLOCK BARONS at six board tables, the house leaderboard.
 * - Up on the GALLERY (level 1, round the atrium, the bridge over the doors joining its two sides):
 *   the ZK PARTY DECK on the west side (the MINI-GAMES WALL, a screen for every mini-game, the
 *   TOURNAMENT desk, more cabinets), the HALO LOUNGE on the east side (three more LAST SNARK tables,
 *   stands looking down on the arena, a bar).
 * zkSNARKs play at every table, watch the duels, cheer in the stands; a table whose game is not in the
 * house yet says COMING SOON.
 */

const E = MEZZ.edge;
/** The grand stairs: in the atrium along each gallery's edge, up from the doors' end (z −12) to a landing at z −24 … −27. */
const STAIR = { inner: 11.3, outer: E - 0.3, foot: -12, head: -24, land: -27 };
const STAIRS: StairDecl[] = [-1, 1].map((s) => {
  const x0 = s < 0 ? -STAIR.outer : STAIR.inner,
    x1 = s < 0 ? -STAIR.inner : STAIR.outer;
  return {
    from: 0,
    to: 1,
    zone: [x0, STAIR.head, x1, STAIR.foot] as Rect,
    up: "-z" as const,
    // nobody walks into the flight's head from under it (the landing is overhead)
    walls: [[0, [x0, STAIR.head - 0.5, x1, STAIR.head - 0.38] as Rect]] as [number, Rect][],
  };
});
/** The columns along both gallery edges. */
const COLS_Z = [-8, -16, -24, -32, -40];
const ORCHARD = { x0: ROOM.x0, x1: -E - 0.1, z0: ROOM.z0, z1: -24, h: MEZZ.under, archN: [-21.2, -18.8] as [number, number], archE: [-36.2, -33.8] as [number, number] };
const POKER: [number, number][] = [
  [-22.6, -29],
  [-17.4, -29],
  [-22.6, -35.5],
  [-17.4, -35.5],
  [-22.6, -42],
  [-17.4, -42],
];
const BARONS: [number, number][] = [
  [17.8, -29],
  [22.6, -29],
  [17.8, -35.5],
  [22.6, -35.5],
  [17.8, -42],
  [22.6, -42],
];
const GLYPH: [number, number][] = [
  [17.6, -13.2],
  [22.6, -13.2],
  [17.6, -19.4],
  [22.6, -19.4],
];
/** LAST SNARK upstairs, in the Halo Lounge. */
const GLYPH_UP: [number, number][] = [
  [18.6, -12.6],
  [23.2, -17.0],
  [18.6, -21.2],
];
const DAIS = { x: 0, z: -16 };
const BLEACH = { x: 17.6, z: -37.5, w: 12 };

export function buildGameHouse(ctx: InteriorContext): Interior {
  const scene = makeScene(ctx.renderer, "#08070c");
  const k = new GKit(ctx, scene);

  shell(k);
  gallery(k);
  boardCorner(k);
  jumbotron(k, DAIS.x, DAIS.z);
  arena(k);
  orchardRoom(k);
  baronsZone(k);
  glyphZone(k);
  bar(k);
  lounge(k);
  cashier(k);
  leaderboard(k);
  const wall = k.on(1, () => partyDeck(k));
  k.on(1, () => haloLounge(k));
  decor(k);
  life(k);

  k.light(0, 10.6, -16, "#ffe2c4", 40, 34);
  k.light(0, 9.4, -34, "#e8dcff", 42, 30);
  k.light(-20, 4.4, -12, "#ffc890", 16, 18);
  k.light(-20, 4.3, -35, "#d8c8ff", 15, 17);
  k.light(20, 4.4, -24, "#ffe2c4", 22, 26);
  k.light(0, 12.2, -26, "#fff1e0", 30, 44);
  k.padLights();
  // a warmer, fuller fill than the default hall's
  scene.traverse((o) => o instanceof THREE.HemisphereLight && ((o.intensity = 1.35), o.groundColor.set("#3a2a40")));
  k.bake();

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
      floors: [
        { label: "G", name: "Great hall · ZK LEGENDS arena, the tables, The Orchard Room", y: 0, spawn: new THREE.Vector3(0, 0, -1.6), yaw: 0 },
        { label: "2F", name: "Gallery · ZK PARTY deck, Halo Lounge", y: MEZZ.y, spawn: new THREE.Vector3(-19.4, MEZZ.y, -24), yaw: Math.PI / 2 },
      ],
      colliders: (f) => k.rectsOf[f] ?? k.rectsOf[0],
      stairs: STAIRS,
      lifts: () => [],
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

/** The house's carpet: void, a scatter of ⓩ marks, squares and pips in the house's colours. */
function carpet(k: GKit, rx: number, ry: number, base = "#17121d", seed = 0) {
  return tex(256, rx, ry, (g, S) => {
    g.fillStyle = base;
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
      const x = k.rnd(i + seed, 1) * S,
        y = k.rnd(i + seed, 2) * S,
        s = 5 + k.rnd(i + seed, 3) * 5;
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
}

function shell(k: GKit) {
  const { x0, x1, z0, z1, h } = ROOM;
  const W = x1 - x0,
    D = z1 - z0;
  const floorTex = carpet(k, W / 2.15, D / 2.15);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ map: floorTex, emissive: "#ffffff", emissiveMap: floorTex, emissiveIntensity: 0.05, roughness: 0.95 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set((x0 + x1) / 2, 0, (z0 + z1) / 2);
  floor.raycast = () => {};
  k.root.add(floor);
  // the atrium's floor round the board: polished void, stepped rings of light round the dais
  const ring = makeCanvas(1024, 1024, (g) => {
    g.fillStyle = "#121019";
    g.fillRect(0, 0, 1024, 1024);
    g.fillStyle = "rgba(255,255,255,0.025)";
    for (let y = 0; y < 1024; y += 64) for (let x = (y / 64) % 2 ? 0 : 64; x < 1024; x += 128) g.fillRect(x, y, 64, 64);
    for (const [r, c, w] of [
      [470, "rgba(255,107,53,0.55)", 8],
      [440, "rgba(196,177,252,0.30)", 4],
      [300, "rgba(244,183,40,0.22)", 4],
    ] as [number, string, number][]) {
      g.strokeStyle = c;
      g.lineWidth = w;
      g.beginPath();
      // a stepped circle (pixel ring)
      const n = 72;
      for (let i = 0; i <= n; i++) {
        const a = (i / n) * Math.PI * 2;
        const px = 512 + Math.round((Math.cos(a) * r) / 16) * 16,
          py = 512 + Math.round((Math.sin(a) * r) / 16) * 16;
        if (i) g.lineTo(px, py);
        else g.moveTo(px, py);
      }
      g.stroke();
    }
  }).t;
  k.flat(15, 15, new THREE.MeshStandardMaterial({ map: ring, roughness: 0.35, metalness: 0.2, emissive: "#ffffff", emissiveMap: ring, emissiveIntensity: 0.12 }), DAIS.x, DAIS.z, 0.006);
  // the ceiling, dark, with beams over the atrium
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, D), std("#0c0b10", 0.9));
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set((x0 + x1) / 2, h, (z0 + z1) / 2);
  k.root.add(ceil);
  for (const x of [-E, -9, -4.5, 0, 4.5, 9, E]) k.box(0.32, 0.5, MEZZ.bridge - z0 + 0.4, k.trim, x, h - 0.5, (MEZZ.bridge + z0) / 2);
  for (const z of [-12, -20, -28, -36, -44]) k.box(2 * E, 0.3, 0.22, k.trim, 0, h - 0.4, z);

  // ---- the walls: plum panels over a walnut wainscot, a neon line round each level
  const panel = std("#231d2c", 0.85);
  k.rects.push(wall(k.root, x0, z0, x1, z0, h, panel), wall(k.root, x0, z0, x0, z1, h, panel), wall(k.root, x1, z0, x1, z1, h, panel));
  for (const [ww, d, x, z] of [
    [W, 0.06, (x0 + x1) / 2, z0 + 0.12],
    [0.06, D, x0 + 0.12, (z0 + z1) / 2],
    [0.06, D, x1 - 0.12, (z0 + z1) / 2],
  ] as const) {
    k.box(ww, 1.1, d, k.walnut, x, 0, z);
    k.box(ww, 0.05, d + 0.02, d > 1 ? k.glacier : k.lilac, x, 3.5, z);
    k.box(ww, 0.9, d, k.walnut, x, MEZZ.y, z);
    k.box(ww, 0.05, d + 0.02, d > 1 ? k.lilac : k.flare, x, MEZZ.y + 3.1, z);
  }

  // ---- the street side: glass either side of the doors (the avenue in it), the gallery's tall windows above
  const glass = new THREE.MeshStandardMaterial({ color: "#9cc3df", transparent: true, opacity: 0.1, roughness: 0.05, metalness: 0.3, depthWrite: false });
  const front = (a: number, b: number) => {
    const w = b - a,
      cx = (a + b) / 2;
    k.box(w, 0.5, 0.2, panel, cx, 0, z1);
    k.box(w, MEZZ.y + 0.5 - 3.6, 0.2, panel, cx, 3.6, z1);
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w, 3.1), glass);
    p.position.set(cx, 2.05, z1);
    p.raycast = () => {};
    k.root.add(p);
    for (let x = a; x <= b + 0.01; x += w / Math.max(1, Math.round(w / 2))) k.box(0.08, 3.1, 0.12, k.trim, x, 0.5, z1);
    k.rects.push([a, z1 - 0.1, b, z1 + 0.1]);
  };
  front(x0, -1.6);
  front(1.6, x1);
  // upstairs: one tall window from wall to wall, mullions every few metres, a void band at the top
  {
    const top = MEZZ.y + 0.5;
    const gh = h - 0.7 - top;
    const p = new THREE.Mesh(new THREE.PlaneGeometry(W, gh), glass);
    p.position.set(0, top + gh / 2, z1);
    p.raycast = () => {};
    k.root.add(p);
    k.box(W, 0.7, 0.2, panel, 0, h - 0.7, z1);
    for (let i = 0; i <= 16; i++) k.box(0.1, gh, 0.14, k.trim, x0 + (i * W) / 16, top, z1);
    k.box(W, 0.06, 0.16, k.trim, 0, top + gh * 0.5, z1);
  }
  // over the doors, inside: the house's name in neon
  k.box(3.2, MEZZ.under - 2.9, 0.2, panel, 0, 2.9, z1);
  k.sign(T("GAME HOUSE", "游戏屋"), 0.42, "#ff6b35", 0, 3.6, z1 - 0.13, Math.PI);
  // (the doorway itself: the way out, see manager.ts)
  k.rects.push([-1.6, z1 - 0.1, 1.6, z1 + 0.1]);

  // ---- the gallery's slab: both sides, the bridge over the doors, the stairs' landings
  const slab = std("#14121a", 0.7, 0.2);
  const under = MEZZ.under,
    th = MEZZ.y - MEZZ.under;
  const slabs: [number, number, number, number][] = [
    [x0, z0, -E, z1],
    [E, z0, x1, z1],
    [-E, MEZZ.bridge, E, z1],
    [-E, STAIR.land, -STAIR.inner, STAIR.head],
    [STAIR.inner, STAIR.land, E, STAIR.head],
  ];
  for (const [a, b, c, d] of slabs) k.box(c - a, th, d - b, slab, (a + c) / 2, under, (b + d) / 2);
  // its underside: light strips down the middle of each side bay, under the bridge
  for (const sx of [-1, 1]) for (const dx of [-3.2, 3.2]) k.box(0.12, 0.03, D - 1.4, glowMat(sx < 0 ? "#ffd8b0" : "#ffe2c4", 1.2), sx * 20 + dx, under - 0.03, (z0 + z1) / 2);
  for (const dz of [-2.4, -5.6]) k.box(2 * E - 1, 0.03, 0.12, glowMat("#ffd8b0", 1.2), 0, under - 0.03, dz);
  // ---- the fascias round the well: LED ribbon boards with the house's line running
  const ribbon = makeCanvas(2048, 64);
  const drawRibbon = () => {
    const g = ribbon.g;
    g.fillStyle = "#07060c";
    g.fillRect(0, 0, 2048, 64);
    g.font = PX(40);
    g.textBaseline = "middle";
    const parts: [string, string][] = [
      [T("ZK LEGENDS ARENA ▸", "零知传奇竞技场 ▸"), "#f4b728"],
      [T("ZK PARTY DECK · 2F ▴", "ZK PARTY 平台 · 二楼 ▴"), "#ff6b35"],
      [T("THE ORCHARD ROOM ◂", "果园厅 ◂"), "#c4b1fc"],
      [T("BLOCK BARONS · LAST SNARK ▸", "区块大亨 · 最后一证 ▸"), "#a8d8e8"],
      [T("ⓩ PLAY CHIPS · NEVER REAL ZEC", "ⓩ 游戏筹码 · 绝非真实 ZEC"), "#6dbf8a"],
    ];
    let x = 10;
    for (const [s, c] of parts) {
      g.fillStyle = c;
      g.fillText(s, x, 34);
      x += g.measureText(s).width + 70;
    }
    g.fillStyle = "rgba(0,0,0,0.42)";
    for (let i = 0; i < 2048; i += 4) g.fillRect(i, 0, 1, 64);
    for (let j = 0; j < 64; j += 4) g.fillRect(0, j, 2048, 1);
    ribbon.t.needsUpdate = true;
  };
  drawRibbon();
  ribbon.t.wrapS = THREE.RepeatWrapping;
  const ribMat = new THREE.MeshBasicMaterial({ map: ribbon.t, toneMapped: false });
  const fascia = (len: number, x: number, z: number, rot: number) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(len, th - 0.08), ribMat);
    m.position.set(x, under + th / 2, z);
    m.rotation.y = rot;
    m.raycast = () => {};
    k.root.add(m);
    // (the repeat per metre is the same everywhere: one texture, uvs stretched to the length)
    const uv = m.geometry.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * (len / 18));
  };
  for (const sx of [-1, 1]) {
    const rot = -sx * (Math.PI / 2);
    // the side galleries' edges (behind the landings, and over the stairwells)
    fascia(STAIR.land - z0, sx * (E - 0.012), (STAIR.land + z0) / 2, rot);
    fascia(MEZZ.bridge - STAIR.head, sx * (E - 0.012), (STAIR.head + MEZZ.bridge) / 2, rot);
    // the landings' inner and back edges
    fascia(STAIR.head - STAIR.land, sx * (STAIR.inner - 0.012), (STAIR.head + STAIR.land) / 2, rot);
    fascia(E - STAIR.inner, (sx * (E + STAIR.inner)) / 2, STAIR.land - 0.012, Math.PI);
  }
  // the bridge's edge over the well
  fascia(2 * E, 0, MEZZ.bridge - 0.012, Math.PI);
  k.ticks.push((dt) => (ribbon.t.offset.x = (ribbon.t.offset.x + dt * 0.05) % 1));

  // ---- the columns: void, a neon strip on their atrium face, through both levels to the roof
  const colMat = std("#16141c", 0.5, 0.35);
  for (const s of [-1, 1])
    for (const [i, z] of COLS_Z.entries()) {
      const x = s * E;
      k.box(0.5, h, 0.5, colMat, x, 0, z);
      const neonMat = i % 2 ? k.lilac : k.flare;
      k.box(0.06, MEZZ.under - 0.6, 0.06, neonMat, x - s * 0.27, 0.3, z);
      k.box(0.06, h - MEZZ.y - 1.0, 0.06, neonMat, x - s * 0.27, MEZZ.y + 1.3, z);
      const r: Rect = [x - 0.26, z - 0.26, x + 0.26, z + 0.26];
      k.rectsOf[0].push(r);
      k.rectsOf[1].push(r);
    }
  // kanji banners hung on two columns a side, over the gallery (seen from both levels)
  for (const [x, z, text, col] of [
    [-E + 0.3, -16, "游戏", "#ff6b35"],
    [-E + 0.3, -32, "果园", "#c4b1fc"],
    [E - 0.3, -16, "派对", "#6dbf8a"],
    [E - 0.3, -32, "传奇", "#f4b728"],
  ] as [number, number, string, string][]) {
    const s = Math.sign(x);
    k.box(0.06, 3.4, 0.9, std("#0a0910", 0.6), x - s * 0.02, MEZZ.y + 2.3, z);
    k.sign(text, 1.2, col, x - s * 0.08, MEZZ.y + 4.0, z, -s * (Math.PI / 2), { vertical: true });
  }

  // ---- the grand stairs: lit risers, glass balustrades, a brass rail
  const n = 30;
  const rise = MEZZ.y / n,
    run = (STAIR.foot - STAIR.head) / n;
  const stepMat = std("#1a1622", 0.55, 0.25);
  const riserCols = ["#ff6b35", "#c4b1fc", "#f4b728", "#a8d8e8", "#6dbf8a"].map((c) => glowMat(c, 1.25));
  const balGlass = new THREE.MeshStandardMaterial({ color: "#c4b1fc", transparent: true, opacity: 0.14, roughness: 0.05, metalness: 0.3, depthWrite: false, side: THREE.DoubleSide });
  const sideTex = tex(256, 1, 1, (g, S) => {
    g.fillStyle = "#1f1828";
    g.fillRect(0, 0, S, S);
    // stepped stripes in faint lilac, a gold pip where they turn
    g.fillStyle = "rgba(196,177,252,0.10)";
    for (let i = 0; i < 8; i++) {
      g.fillRect(i * 32, S - (i + 1) * 32, 32, 6);
      g.fillRect(i * 32 + 26, S - (i + 1) * 32, 6, 32);
    }
    g.fillStyle = "rgba(244,183,40,0.35)";
    for (let i = 0; i < 8; i++) g.fillRect(i * 32 + 24, S - (i + 1) * 32 - 2, 8, 8);
  });
  const sidePanel = new THREE.MeshStandardMaterial({ map: sideTex, emissive: "#ffffff", emissiveMap: sideTex, emissiveIntensity: 0.12, roughness: 0.7, side: THREE.DoubleSide });
  for (const s of [-1, 1]) {
    const xa = s < 0 ? -STAIR.outer : STAIR.inner,
      xb = s < 0 ? -STAIR.inner : STAIR.outer;
    const wid = xb - xa,
      cx = (xa + xb) / 2;
    for (let i = 0; i < n; i++) {
      const zt = STAIR.foot - i * run;
      k.box(wid, (i + 1) * rise, run, stepMat, cx, 0, zt - run / 2);
      // the riser's light, set into its face
      k.box(wid - 0.2, 0.035, 0.02, riserCols[i % riserCols.length], cx, i * rise + rise * 0.45, zt + 0.006);
    }
    // its sides: a plum panel cut to the steps, a stepped neon line along the treads, a lit plinth
    const prof: [number, number][] = [[STAIR.foot, 0]];
    for (let i = 0; i < n; i++) prof.push([STAIR.foot - i * run, (i + 1) * rise], [STAIR.foot - (i + 1) * run, (i + 1) * rise]);
    prof.push([STAIR.head, 0]);
    const shape = new THREE.Shape(prof.map(([zz, yy]) => new THREE.Vector2(zz, yy)));
    const sideGeo = new THREE.ShapeGeometry(shape);
    // (uvs: metres, the texture repeats)
    const pos = sideGeo.attributes.position as THREE.BufferAttribute;
    const uvs = sideGeo.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) uvs.setXY(i, pos.getX(i) / 2, pos.getY(i) / 2);
    for (const [bx, face] of [
      [xa - 0.012, -1],
      [xb + 0.012, 1],
    ] as const) {
      const m = new THREE.Mesh(sideGeo, sidePanel);
      // the shape's x is z, its y is y: turned into the plane x = bx (two-sided)
      m.rotation.y = -Math.PI / 2;
      m.position.set(bx, 0, 0);
      k.root.add(m);
      k.keep(m);
      const lineX = bx + face * 0.012;
      const lm = riserCols[(s + 1) % riserCols.length];
      for (let i = 0; i < n; i++) {
        const zt = STAIR.foot - i * run;
        k.box(0.03, 0.03, run, lm, lineX, (i + 1) * rise - 0.04, zt - run / 2);
        k.box(0.03, rise, 0.03, lm, lineX, i * rise - 0.01, zt - 0.015);
      }
      k.box(0.04, 0.05, STAIR.foot - STAIR.head, k.flare, lineX, 0.02, (STAIR.foot + STAIR.head) / 2);
    }
    // the balustrades: glass along the pitch, a rail on top, on both sides
    const len = Math.hypot(STAIR.foot - STAIR.head, MEZZ.y);
    const pitch = Math.atan2(MEZZ.y, STAIR.foot - STAIR.head);
    for (const bx of [xa - 0.03, xb + 0.03]) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.95), balGlass);
      p.rotation.set(0, Math.PI / 2, 0);
      p.rotateZ(pitch);
      p.position.set(bx, MEZZ.y / 2 + 0.55, (STAIR.foot + STAIR.head) / 2);
      p.raycast = () => {};
      k.root.add(p);
      const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, len, 8), k.brass);
      rail.rotation.x = Math.PI / 2 - pitch;
      rail.position.set(bx, MEZZ.y / 2 + 1.02, (STAIR.foot + STAIR.head) / 2);
      k.root.add(rail);
      k.keep(rail);
      const led = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, len), riserCols[1]);
      led.rotation.x = -pitch;
      led.position.set(bx, MEZZ.y / 2 + 0.07, (STAIR.foot + STAIR.head) / 2);
      k.root.add(led);
      k.keep(led);
    }
    // a lit sign hung over the foot
    k.sign(s < 0 ? T("▲ ZK PARTY DECK · 2F", "▲ ZK PARTY 平台 · 二楼") : T("▲ HALO LOUNGE · 2F", "▲ 光环休息室 · 二楼"), 0.3, s < 0 ? "#ff6b35" : "#6dbf8a", cx, 3.1, STAIR.foot + 0.2, 0);
    for (const dx of [-0.9, 0.9]) k.box(0.01, ROOM.h - 3.25, 0.01, k.trim, cx + dx, 3.25, STAIR.foot + 0.2);
  }
}

/** The gallery (level 1): its floor, the railings round the well, its colliders over the void. */
function gallery(k: GKit) {
  const { x0, x1, z0, z1 } = ROOM;
  k.on(1, () => {
    // the floor: a deeper carpet than the hall's
    const gc = carpet(k, 12 / 2.15, 46 / 2.15, "#1a1222", 40);
    const gm = new THREE.MeshStandardMaterial({ map: gc, emissive: "#ffffff", emissiveMap: gc, emissiveIntensity: 0.05, roughness: 0.95 });
    for (const s of [-1, 1]) k.flat(12, 46, gm, s * 20, (z0 + z1) / 2, 0.004);
    const bc = carpet(k, 28 / 2.15, 8 / 2.15, "#1a1222", 40);
    k.flat(2 * E, -MEZZ.bridge, new THREE.MeshStandardMaterial({ map: bc, emissive: "#ffffff", emissiveMap: bc, emissiveIntensity: 0.05, roughness: 0.95 }), 0, MEZZ.bridge / 2, 0.004);
    for (const s of [-1, 1]) k.flat(E - STAIR.inner, STAIR.head - STAIR.land, gm, s * (E + STAIR.inner) / 2, (STAIR.head + STAIR.land) / 2, 0.004);
    // the walls' colliders up here (the walls themselves rise from the ground)
    k.rects.push([x0 - 0.1, z0 - 0.1, x1 + 0.1, z0 + 0.1], [x0 - 0.1, z0, x0 + 0.1, z1], [x1 - 0.1, z0, x1 + 0.1, z1], [x0, z1 - 0.1, x1, z1 + 0.1]);
    // the void: the well and the stairwells (the flights are cut out of it by the stairs themselves)
    k.rects.push(
      [-STAIR.inner, z0, STAIR.inner, MEZZ.bridge],
      [-E, z0, -STAIR.inner, STAIR.land],
      [STAIR.inner, z0, E, STAIR.land],
      [-E, STAIR.head, -STAIR.inner, MEZZ.bridge],
      [STAIR.inner, STAIR.head, E, MEZZ.bridge],
    );
    // the railings: glass, a neon top rail, posts
    const glass = new THREE.MeshStandardMaterial({ color: "#c4b1fc", transparent: true, opacity: 0.13, roughness: 0.05, metalness: 0.3, depthWrite: false, side: THREE.DoubleSide });
    const rail = (ax: number, az: number, bx: number, bz: number, col: THREE.Material) => {
      const len = Math.hypot(bx - ax, bz - az);
      const rot = Math.atan2(bx - ax, bz - az) - Math.PI / 2;
      const p = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.95), glass);
      p.position.set((ax + bx) / 2, 0.55, (az + bz) / 2);
      p.rotation.y = rot;
      p.raycast = () => {};
      k.root.add(p);
      const top = k.box(len, 0.06, 0.08, k.brass, (ax + bx) / 2, 1.02, (az + bz) / 2);
      top.rotation.y = rot;
      const lit = k.box(len, 0.03, 0.03, col, (ax + bx) / 2, 0.06, (az + bz) / 2);
      lit.rotation.y = rot;
      const np = Math.max(1, Math.round(len / 1.6));
      for (let i = 0; i <= np; i++) k.box(0.05, 1.02, 0.05, k.trim, ax + ((bx - ax) * i) / np, 0, az + ((bz - az) * i) / np);
    };
    for (const s of [-1, 1]) {
      const col = s < 0 ? k.flare : k.glacier;
      rail(s * E, MEZZ.bridge, s * E, STAIR.head, col);
      rail(s * STAIR.inner, STAIR.head, s * STAIR.inner, STAIR.land, col);
      rail(s * E, STAIR.land, s * STAIR.inner, STAIR.land, col);
      rail(s * E, STAIR.land, s * E, z0 + 0.2, col);
    }
    rail(-E, MEZZ.bridge, E, MEZZ.bridge, k.lilac);
  });
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
  // armchairs to watch from, all round
  for (const s of [-1, 1]) k.put("gh-armchair", () => F.armchair("#3a2a6a"), x + s * 1.5, z + 2.95, Math.PI, { solid: false });
  for (const s of [-1, 1]) k.put("gh-armchair", () => F.armchair("#3a2a6a"), x + s * 3.9, z, s < 0 ? Math.PI / 2 : -Math.PI / 2, { solid: false });
}

/** THE ORCHARD ROOM: the poker room at the back of the west bay, behind its arches: six tables for eight, lilac lamps. */
function orchardRoom(k: GKit) {
  const L = ORCHARD;
  const wallMat = std("#17121f", 0.8);
  // an orchard trellis on its walls: lilac lines on void, gold fruit where they cross
  const lattice = tex(256, 6, 1, (g, S) => {
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
  k.keep(back);
  const glass = new THREE.MeshStandardMaterial({ color: "#c4b1fc", transparent: true, opacity: 0.12, roughness: 0.05, metalness: 0.3, depthWrite: false });
  // the east partition onto the atrium: low wall, a long window above it, an arch in the middle
  const ex = L.x1;
  const eastSegs: [number, number][] = [
    [L.z0, L.archE[0]],
    [L.archE[1], L.z1],
  ];
  for (const [za, zb] of eastSegs) {
    k.rects.push(wall(k.root, ex, za, ex, zb, 1.0, wallMat, 0, 0.16));
    k.box(0.16, L.h - 2.8, zb - za, wallMat, ex, 2.8, (za + zb) / 2);
    const win = new THREE.Mesh(new THREE.PlaneGeometry(zb - za, 1.8), glass);
    win.rotation.y = Math.PI / 2;
    win.position.set(ex, 1.9, (za + zb) / 2);
    win.raycast = () => {};
    k.root.add(win);
    for (let z = za; z <= zb + 0.01; z += (zb - za) / Math.max(1, Math.round((zb - za) / 1.6))) k.box(0.1, 1.8, 0.1, k.trim, ex, 1.0, z);
  }
  // the north partition with its arch (the way in from the lounge)
  k.rects.push(wall(k.root, L.x0, L.z1, L.archN[0], L.z1, L.h, wallMat, 0, 0.16), wall(k.root, L.archN[1], L.z1, L.x1, L.z1, L.h, wallMat, 0, 0.16));
  k.box(L.archN[1] - L.archN[0], L.h - 2.9, 0.16, wallMat, (L.archN[0] + L.archN[1]) / 2, 2.9, L.z1);
  // the arches' neon and their names
  const archs: [number, number, number, number][] = [
    [(L.archN[0] + L.archN[1]) / 2, L.z1 + 0.1, L.archN[1] - L.archN[0], 0],
    [ex + 0.1, (L.archE[0] + L.archE[1]) / 2, L.archE[1] - L.archE[0], -Math.PI / 2],
  ];
  k.box(0.16, L.h - 2.9, L.archE[1] - L.archE[0], wallMat, ex, 2.9, (L.archE[0] + L.archE[1]) / 2);
  for (const [ax, az, w, rot] of archs) {
    const along = rot === 0;
    for (const s of [-w / 2, w / 2]) k.box(0.06, 2.9, 0.06, k.lilac, ax + (along ? s : 0), 0, az + (along ? 0 : s));
    k.box(along ? w : 0.06, 0.06, along ? 0.06 : w, k.lilac, ax, 2.9, az);
    k.sign(T("THE ORCHARD ROOM", "果园厅"), 0.34, "#c4b1fc", ax, 3.35, az + (along ? 0.02 : 0), rot === 0 ? 0 : Math.PI / 2);
  }
  // its lilac cove under the gallery
  k.box(L.x1 - L.x0 - 0.4, 0.04, 0.04, k.lilac, (L.x0 + L.x1) / 2, L.h - 0.12, L.z0 + 0.3);
  k.box(0.04, 0.04, L.z1 - L.z0 - 0.4, k.lilac, L.x0 + 0.3, L.h - 0.12, (L.z0 + L.z1) / 2);
  // a dark rug
  k.flat(L.x1 - L.x0 - 0.6, L.z1 - L.z0 - 0.6, std("#1d1530", 0.95), (L.x0 + L.x1) / 2, (L.z0 + L.z1) / 2);
  // the tables: felt, eight velvet chairs, a lamp bar over each, cards and chips on the felt
  POKER.forEach(([tx, tz], n) => {
    k.put("gh-poker", () => pokerTable("#103844", "#4a8a98"), tx, tz);
    // the lamp: a void shade, its light underneath
    k.box(2.1, 0.14, 0.42, k.dark, tx, L.h - 1.05, tz);
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(1.95, 0.3), glowMat("#e6dcff", 0.95));
    glow.rotation.x = Math.PI / 2;
    glow.position.set(tx, L.h - 1.055, tz);
    glow.raycast = () => {};
    k.root.add(glow);
    k.keep(glow);
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
    if (i < 3) k.keep(c);
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
      k.keep(c);
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

/** BLOCK BARONS: six board tables at the back of the east bay, eight chairs each, the board, dice that tumble. */
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
    k.keep(b);
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
  k.sign(T("BLOCK BARONS", "区块大亨"), 0.5, "#ff6b35", ROOM.x1 - 0.14, 4.05, -35.5, -Math.PI / 2);
  k.label(T("区块大亨 · property board game", "BLOCK BARONS · 地产棋盘游戏"), ROOM.x1 - 0.14, 3.6, -35.5, { h: 0.22, color: "#ffb08a", rot: -Math.PI / 2 });
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

/** LAST SNARK: round card tables; a card is played onto the pile now and then. */
function glyphTables(k: GKit, spots: [number, number][], first: number) {
  const colors = ["#ff6b35", "#c4b1fc", "#a8d8e8", "#6dbf8a"];
  spots.forEach(([tx, tz], i) => {
    const n = first + i;
    k.put("gh-cardTable", () => cardTable("#3a2c66"), tx, tz);
    for (const [dx, dz] of glyphSeats()) k.put("gh-roomChairG", () => roomChair("#3e3070"), tx + dx, tz + dz, Math.atan2(-dx, -dz), { solid: false });
    const y = 0.755;
    // the pile in the middle, the draw stack, hands at the seats
    const pile: THREE.Mesh[] = [];
    for (let j = 0; j < 3; j++) {
      const c = card(`glyph:${colors[(j + n) % 4]}`);
      c.position.set(tx + (k.rnd(j, n) - 0.5) * 0.06, y + j * 0.002, tz + (k.rnd(j + 3, n) - 0.5) * 0.06);
      c.rotation.y = k.rnd(j, n + 5) * 3;
      k.root.add(c);
      pile.push(c);
    }
    k.box(0.09, 0.04, 0.13, k.dark, tx + 0.22, y, tz - 0.12);
    const deck = card("back");
    deck.position.set(tx + 0.22, y + 0.045, tz - 0.12);
    k.root.add(deck);
    k.keep(deck);
    for (const [dx, dz] of glyphSeats())
      for (let j = 0; j < 3; j++) {
        const c = card("back");
        c.position.set(tx + dx * 0.5 + (j - 1) * 0.035 * Math.cos(Math.atan2(dx, dz)), y + 0.001 * j, tz + dz * 0.5 - (j - 1) * 0.035 * Math.sin(Math.atan2(dx, dz)));
        c.rotation.y = Math.atan2(dx, dz) + (j - 1) * 0.2;
        k.root.add(c);
        k.keep(c);
      }
    // a card flies from a seat onto the pile
    const fly = card(`glyph:${colors[n % 4]}`);
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
        pile.forEach((c, j) => (c.position.y = y + j * 0.002));
        fly.visible = false;
      }
    });
    const def = tableCard("glyph");
    k.hit(2.0, 1.2, 2.0, tx, 0, tz, tableHover("glyph"), (): PickInfo => ({ eyebrow: T("Table game", "牌桌游戏"), title: def.title, table: "glyph" }));
  });
}
const glyphSeats = (): [number, number][] => [0, 1, 2, 3, 4].map((i) => [Math.sin((i / 5) * Math.PI * 2 + 0.3) * 1.25, Math.cos((i / 5) * Math.PI * 2 + 0.3) * 1.25]);

function glyphZone(k: GKit) {
  glyphTables(k, GLYPH, 0);
  k.sign(T("LAST SNARK", "最后一证"), 0.5, "#c4b1fc", ROOM.x1 - 0.14, 4.05, -16.3, -Math.PI / 2);
  k.label(T("最后一证 · the shedding card game", "LAST SNARK · 出牌游戏"), ROOM.x1 - 0.14, 3.6, -16.3, { h: 0.22, color: "#d8ccff", rot: -Math.PI / 2 });
}

/** A table's hover line: its game's name, and whether it is open. */
function tableHover(key: string): HoverFn {
  const c = tableCard(key);
  return `<b>${c.title}</b><span>${c.ready ? T(`${c.seats} players · click to sit down`, `${c.seats} 人 · 点击入座`) : T("coming soon", "即将开放")}</span>`;
}

/** The zones' standing cards, turned to the doors: the game's picture, PLAY or COMING SOON. */
function zoneCards(k: GKit) {
  const spots: [string, number, number][] = [
    ["holdem", -16.6, -22.6],
    ["barons", 16.0, -25.6],
    ["glyph", 16.0, -9.8],
    ["legends", -4.4, -23.2],
    ["legends", 4.4, -23.2],
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

/** THE LUCKY NONCE: the bar along the west wall by the doors, its stools, its menu. */
function bar(k: GKit) {
  const z = -7.6;
  k.put("gh-bar9", () => F.barCounter(9, "#c4b1fc"), -22.0, z, Math.PI / 2);
  k.put("gh-backBar9", () => F.backBar(9), -25.72, z, Math.PI / 2);
  for (let s = z - 4; s <= z + 4.01; s += 1.0) k.put("gh-stool", () => F.stool("#ff6b35"), -21.15, s, 0, { solid: false });
  const menu = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.875), new THREE.MeshBasicMaterial({ map: barMenu().t, toneMapped: false }));
  menu.position.set(ROOM.x0 + 0.2, 3.25, z);
  menu.rotation.y = Math.PI / 2;
  k.root.add(menu);
  k.sign(T("THE LUCKY NONCE", "幸运随机数"), 0.36, "#ff6b35", ROOM.x0 + 0.16, 4.5, z, Math.PI / 2);
  k.sign("酒場", 0.62, "#c4b1fc", ROOM.x0 + 0.16, 2.9, z - 5.5, Math.PI / 2, { vertical: true });
  const drinks: [string, string, string, string][] = [
    ["Zero-Knowledge Sour", "零知识酸酒", "Nobody can tell what's in it, yet it's provably sour.", "没人知道里面是什么，但可以证明它是酸的。"],
    ["Orchard Spritz", "果园气泡酒", "Apple, elderflower and bubbles, fully shielded. The Tracker can't trace a drop.", "苹果、接骨木花和气泡，全程屏蔽。追踪者一滴也查不到。"],
    ["Sprout Old Fashioned", "萌芽古典", "From the first shielded pool: retired, still poured.", "来自第一个屏蔽池：已退役，照样倒酒。"],
    ["Equihash Mule", "Equihash 骡子", "Ginger, lime, and a memory-hard round on the ice.", "姜、青柠，冰块上再加一轮内存困难计算。"],
    ["Lucky Nonce", "幸运随机数", "Alcohol-free. The house swears it finds blocks.", "无酒精。店家发誓它能帮你出块。"],
    ["Halo Highball", "光环高球", "Recursive: every sip proves the last one.", "递归的：每一口都证明上一口。"],
  ];
  let poured = 0;
  const hover = `<b>${T("The Lucky Nonce", "幸运随机数酒吧")}</b><span>${T("order a drink", "点一杯")}</span>`;
  const order = (): PickInfo => {
    const [en, zh, den, dzh] = drinks[poured++ % drinks.length];
    return { eyebrow: T("The Lucky Nonce · bar", "幸运随机数 · 酒吧"), title: T(`${en} 🍸`, `${zh} 🍸`), body: `<p>${T(den, dzh)}</p><p>${T("On the house: the chips stay yours.", "本店请客：筹码还是你的。")}</p>` };
  };
  k.hit(0.8, 1.2, 9.1, -22.0, 0, z, hover, order);
  k.pick(menu, hover, order);
}

/** A lounge in the west bay before The Orchard Room: two sofas, a low table, plants; the ZK PARTY cabinets by the doors in the east bay. */
function lounge(k: GKit) {
  k.put("gh-sofaA", () => F.sofa("#2a2440", 3, "#ff6b35"), -19.6, -15.0, Math.PI);
  k.put("gh-sofaA", () => F.sofa("#2a2440", 3, "#ff6b35"), -19.6, -18.6, 0);
  k.put("gh-coffee", F.coffeeTable, -19.6, -16.8);
  const d = die(0.16);
  d.position.set(-19.3, 0.5, -16.8);
  d.rotation.set(0.2, 0.6, 0);
  k.root.add(d);
  for (const [x, z, s] of [
    [-25.3, -0.8, 1],
    [25.3, -0.8, 2],
    [-15.0, -21.5, 3],
    [-25.2, -21.6, 4],
    [-15.0, -1.2, 5],
    [15.0, -1.2, 6],
    [-3.6, -11.0, 7],
    [3.6, -11.0, 8],
  ] as const)
    k.put(`gh-plant${s % 2}`, () => F.plant(s % 2 ? "monstera" : "ficus", s), x, z);
  // the ZK PARTY cabinets (the arcade's), their attract screens on, in a row along the east wall
  const gm = ART.party;
  for (const [i, z] of [-2.8, -3.9, -5.0, -6.1, -7.2, -8.3].entries()) {
    const cab = k.put("gh-cab", () => F.arcadeCabinet(gm.color, gm.side), ROOM.x1 - 0.55, z, -Math.PI / 2);
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.64, 0.56), new THREE.MeshBasicMaterial({ map: marquee("party"), toneMapped: false }));
    scr.position.set(0, 1.38 * 2, 0.03);
    scr.scale.setScalar(2);
    cab.add(scr);
    const info = (): PickInfo => ({ eyebrow: T("ZK Arcade", "ZK 街机厅"), title: "ZK PARTY", party: i % 2 ? "practice" : "board" });
    k.pickAll(cab, `<b>ZK PARTY</b><span>${T("play for ⓩ against three snarks", "与三个 zkSNARK 对战赢 ⓩ")}</span>`, info);
  }
  k.sign(T("ZK ARCADE", "ZK 街机"), 0.42, "#ff6b35", ROOM.x1 - 0.14, 4.1, -5.5, -Math.PI / 2);
}

/** The house leaderboard on the east wall: your record, the regulars. */
function leaderboard(k: GKit) {
  const z = -24.4;
  const s = k.screen(3.9, 2.2, drawLeaderboard, 4, 1024);
  s.position.set(ROOM.x1 - 0.2, 2.45, z);
  s.rotation.y = -Math.PI / 2;
  k.box(0.08, 2.4, 4.1, k.dark, ROOM.x1 - 0.14, 1.25, z);
  k.box(0.06, 0.05, 4.1, k.lilac, ROOM.x1 - 0.2, 3.65, z);
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

// ---- the gallery ---------------------------------------------------------------------------------------

/** THE ZK PARTY DECK (level 1, west): the MINI-GAMES WALL and its TOURNAMENT desk, cabinets, sofas at the rail. */
function partyDeck(k: GKit) {
  const w = miniWall(k, { x: ROOM.x0, z: -24, rot: Math.PI / 2 });
  // cabinets in a row at the back
  const gm = ART.party;
  for (const [i, z] of [-37.4, -38.5, -39.6, -40.7, -41.8].entries()) {
    const cab = k.put("gh-cab", () => F.arcadeCabinet(gm.color, gm.side), ROOM.x0 + 0.55, z, Math.PI / 2);
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.64, 0.56), new THREE.MeshBasicMaterial({ map: marquee("party"), toneMapped: false }));
    scr.position.set(0, 1.38 * 2, 0.03);
    scr.scale.setScalar(2);
    cab.add(scr);
    const info = (): PickInfo => ({ eyebrow: T("ZK Arcade", "ZK 街机厅"), title: "ZK PARTY", party: i % 2 ? "board" : "practice" });
    k.pickAll(cab, `<b>ZK PARTY</b><span>${T("play for ⓩ against three snarks", "与三个 zkSNARK 对战赢 ⓩ")}</span>`, info);
  }
  // sofas at the rail looking down on the atrium, at the front of the deck
  for (const z of [-4.0, -10.6]) k.put("gh-sofaD", () => F.sofa("#3a1a14", 3, "#c4b1fc"), -E - 1.4, z, -Math.PI / 2);
  for (const z of [-5.4, -9.2]) k.put("gh-highT", () => highTable("#2a2440"), -20.5, z);
  k.sign(T("ZK PARTY DECK", "ZK PARTY 平台"), 0.6, "#ff6b35", -20, 3.6, ROOM.z0 + 0.16, 0);
  k.sign("二階", 0.5, "#c4b1fc", -24.6, 2.8, ROOM.z0 + 0.16, 0, { vertical: true });
  for (const [x, z, s] of [
    [-25.3, -1.0, 11],
    [-15.0, -44.8, 12],
  ] as const)
    k.put(`gh-plant${s % 2}`, () => F.plant(s % 2 ? "monstera" : "ficus", s), x, z);
  return w;
}

/** THE HALO LOUNGE (level 1, east): three LAST SNARK tables, the stands over the arena, a bar. */
function haloLounge(k: GKit) {
  glyphTables(k, GLYPH_UP, 10);
  k.put("gh-bleach", () => bleachers(BLEACH.w, 3), BLEACH.x, BLEACH.z, -Math.PI / 2);
  // its collider: the tiers are a solid block (the rail behind them too)
  k.sign(T("HALO LOUNGE", "光环休息室"), 0.6, "#6dbf8a", 20, 3.6, ROOM.z0 + 0.16, 0);
  k.sign(T("THE STANDS ▸ ZK LEGENDS", "看台 ▸ 零知传奇"), 0.34, "#f4b728", ROOM.x1 - 0.14, 3.3, BLEACH.z, -Math.PI / 2);
  // the bar: a counter along the east wall at the front
  k.put("gh-bar5", () => F.barCounter(5, "#6dbf8a"), 22.2, -5.0, -Math.PI / 2);
  k.put("gh-backBar5", () => F.backBar(5), 25.72, -5.0, -Math.PI / 2);
  for (let z = -7; z <= -3; z += 1) k.put("gh-stool", () => F.stool("#6dbf8a"), 21.35, z, 0, { solid: false });
  const hover = `<b>${T("The Halo bar", "光环吧台")}</b><span>${T("order a drink", "点一杯")}</span>`;
  k.hit(0.8, 1.2, 5.1, 22.2, 0, -5.0, hover, (): PickInfo => ({ eyebrow: T("Halo Lounge · bar", "光环休息室 · 吧台"), title: T("Recursive Spritz 🍸", "递归气泡酒 🍸"), body: `<p>${T("Each glass verifies the one before it. On the house.", "每一杯都验证上一杯。本店请客。")}</p>` }));
  k.sign("光环", 0.6, "#6dbf8a", ROOM.x1 - 0.16, 2.3, -9.2, -Math.PI / 2, { vertical: true });
  for (const z of [-4.2, -10.4]) k.put("gh-sofaH", () => F.sofa("#16302a", 3, "#f4b728"), E + 1.4, z, Math.PI / 2);
  for (const [x, z, s] of [
    [25.3, -1.0, 13],
    [15.0, -44.8, 14],
    [25.2, -27.0, 15],
  ] as const)
    k.put(`gh-plant${s % 2}`, () => F.plant(s % 2 ? "monstera" : "ficus", s), x, z);
}

// ---- the air -------------------------------------------------------------------------------------------

/** Pendant lamps over tables (one draw call for the shades, one for the light, one for the cords). */
function pendants(k: GKit, spots: [number, number][], y: number, ceil: number, color = "#ffe6c4") {
  const q = new THREE.Quaternion();
  const one = new THREE.Vector3(1, 1, 1);
  k.instances(new THREE.CylinderGeometry(0.22, 0.42, 0.3, 18, 1, true), new THREE.MeshStandardMaterial({ color: "#16141c", roughness: 0.5, metalness: 0.4, side: THREE.DoubleSide }), spots.map(([x, z]) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q, one)));
  k.instances(new THREE.CircleGeometry(0.38, 18).rotateX(Math.PI / 2), glowMat(color, 1.25), spots.map(([x, z]) => new THREE.Matrix4().makeTranslation(x, y - 0.12, z)));
  k.instances(new THREE.CylinderGeometry(0.01, 0.01, 1, 4), k.trim, spots.map(([x, z]) => new THREE.Matrix4().compose(new THREE.Vector3(x, (y + 0.15 + ceil) / 2, z), q, new THREE.Vector3(1, ceil - y - 0.15, 1))));
}

/** The air: string lights over the atrium, hanging Z-Blocks and dice, lamps over the tables, the zones' cards, neon. */
function decor(k: GKit) {
  zoneCards(k);
  // string lights: runs across the atrium under its roof, drooping between the beams
  const bulbs: THREE.Matrix4[] = [];
  for (let z = -10; z >= -44; z -= 4)
    for (let i = 0; i <= 40; i++) {
      const x = -E + 0.4 + (i / 40) * (2 * E - 0.8);
      const sag = Math.abs(Math.sin(((x + E) / 7) * Math.PI)) * 0.5;
      bulbs.push(new THREE.Matrix4().makeTranslation(x, ROOM.h - 0.7 - sag, z));
    }
  // over the galleries, from the well's edge to the walls
  for (const sx of [-1, 1])
    for (let z = -2.5; z >= -44; z -= 4.2)
      for (let i = 0; i <= 16; i++) {
        const x = sx * (E + 0.4 + (i / 16) * (ROOM.x1 - E - 0.8));
        bulbs.push(new THREE.Matrix4().makeTranslation(x, ROOM.h - 0.75 - Math.abs(Math.sin((i / 16) * Math.PI)) * 0.55, z));
      }
  // and under the gallery, along the bays
  for (const sx of [-1, 1])
    for (let z = -1.5; z >= -44; z -= 0.75) {
      if (sx < 0 && z < ORCHARD.z1) continue;
      bulbs.push(new THREE.Matrix4().makeTranslation(sx * (E + 0.6), MEZZ.under - 0.25 - Math.abs(Math.sin(z * 0.8)) * 0.12, z));
    }
  k.instances(new THREE.SphereGeometry(0.05, 8, 6), glowMat("#ffe2b8", 1.7), bulbs);
  // hanging Z-Blocks and dice over the atrium, turning slowly
  const hang: { o: THREE.Object3D; y: number; s: number }[] = [];
  for (const [x, y, z, s] of [
    [-8.5, 9.6, -12.5, 1.1],
    [8.2, 10.1, -20.5, 1.0],
    [-6.8, 10.4, -27.5, 0.9],
    [7.4, 9.2, -10.8, 0.8],
  ]) {
    const q = qBlock(s);
    q.position.set(x, y, z);
    q.raycast = () => {};
    k.root.add(q);
    k.box(0.02, ROOM.h - y - s / 2, 0.02, k.trim, x, y + s / 2, z);
    hang.push({ o: q, y, s: 0.5 + x * 0.05 });
  }
  for (const [x, y, z, s] of [
    [-9.0, 9.0, -20.0, 0.9],
    [9.2, 10.4, -29.0, 0.8],
    [4.6, 10.8, -24.8, 0.7],
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
  k.flat(10.6, 19.6, std("#241a16", 0.95), 20.2, -35.6);
  k.flat(10.6, 11.6, std("#1c1530", 0.95), 20.1, -16.3);
  // lamps over the tables: the bays (under the gallery), the arena (from the roof)
  pendants(k, [...BARONS, ...GLYPH], 2.5, MEZZ.under);
  k.on(1, () => pendants(k, GLYPH_UP, 2.4, ROOM.h - MEZZ.y));
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
  k.flat(2.6, 8.2, new THREE.MeshStandardMaterial({ map: run, roughness: 0.95 }), 0, -4.4, 0.012);
  // neon line art on the upper east wall over the Halo Lounge: dice, cards, chips, Z-Blocks, a joystick, a cup
  const art = makeCanvas(2048, 220, (g) => drawNeonArt(g, 2048, 220, 1));
  const p = new THREE.Mesh(new THREE.PlaneGeometry(30, 30 * (220 / 2048)), new THREE.MeshBasicMaterial({ map: art.t, transparent: true, toneMapped: false, depthWrite: false }));
  p.position.set(ROOM.x1 - 0.16, MEZZ.y + 5.2, -22.5);
  p.rotation.y = -Math.PI / 2;
  p.raycast = () => {};
  k.root.add(p);
  // and over the doors inside, facing the hall from the bridge's front: the house's name, big
  k.sign(T("GAME HOUSE", "游戏屋"), 1.1, "#ff6b35", -2.6, MEZZ.y + 4.2, ROOM.z1 - 0.18, Math.PI);
  k.sign("游戏屋", 0.9, "#c4b1fc", 5.6, MEZZ.y + 4.2, ROOM.z1 - 0.18, Math.PI);
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
  const x = 19.6,
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
 * The house's zkSNARKs: at the tables (dealing, playing, duelling), watching the board and the arena,
 * at the bars, in the stands, before the wall; every few seconds one of them says something or reacts.
 */
function life(k: GKit) {
  const pid = 9100;
  const face = (dx: number, dz: number) => new THREE.Vector3(dx, 0, dz).normalize();
  // the board's watchers
  for (const s of [-1, 1]) void k.person(pid + 5 + s, [DAIS.x + s * 1.5, DAIS.z + 2.85], T("Party player", "派对玩家"), { face: face(0, -1), sit: true, dy: 0.42, chat: "party" });
  void k.person(pid + 7, [DAIS.x + 3.0, DAIS.z - 2.2], T("Party player", "派对玩家"), { face: face(-1, 0.4), chat: "party" });
  void k.person(pid + 8, [DAIS.x - 2.8, DAIS.z - 2.4], T("Party player", "派对玩家"), { face: face(1, 0.5), chat: "party", wander: [[-2.8, -18.4], [-4.5, -12.5], [2.5, -12.2]] });
  // The Orchard Room: dealers and players at four tables
  POKER.forEach((p, n) => {
    if (n > 3) return;
    if (n < 2) void k.person(pid + 10 + n, [p[0], p[1] - 1.2], T("Dealer", "荷官"), { face: face(0, 1), chat: "poker" });
    pokerSeats(p[0], p[1])
      .filter((_, i) => (n % 2 ? i === 1 || i === 4 : n ? i === 2 || i === 5 : i === 0 || i === 2 || i === 4))
      .forEach((q, i) => void k.person(pid + 14 + n * 4 + i, [q.x, q.z], T("Poker player", "扑克玩家"), { face: q.face, sit: true, dy: 0.52, chat: "poker" }));
  });
  // BLOCK BARONS: players at three tables
  BARONS.forEach(([bx, bz], n) => {
    if (n % 2) return;
    baronsSeats()
      .filter((_, i) => (n === 0 ? i === 1 || i === 3 || i === 6 : i === 2 || i === 5))
      .forEach(([dx, dz], i) => void k.person(pid + 32 + n * 3 + i, [bx + dx, bz + dz], T("Baron", "大亨"), { face: face(-dx, -dz), sit: true, dy: 0.52, chat: "barons" }));
  });
  // LAST SNARK: three at the first table, one at the second, two at the fourth
  const seats = glyphSeats();
  const atGlyph = (t: [number, number], pick: number[], base: number) =>
    pick.forEach((si, i) => {
      const [dx, dz] = seats[si];
      void k.person(base + i, [t[0] + dx, t[1] + dz], T("Card player", "牌手"), { face: face(-dx, -dz), sit: true, dy: 0.52, chat: "glyph" });
    });
  atGlyph(GLYPH[0], [0, 2, 3], pid + 46);
  atGlyph(GLYPH[1], [2], pid + 49);
  atGlyph(GLYPH[3], [1, 4], pid + 92);
  // ZK LEGENDS: two at four of the duel tables, the finalists on the stage, their host, the crowd
  [0, 1, 3, 4].forEach((ti, n) => {
    const [x, z] = DUELS[ti];
    for (const s of [1, -1]) void k.person(pid + 52 + n * 2 + (s > 0 ? 0 : 1), [x + s * 1.18, z], T("Duellist", "对决者"), { face: face(-s, 0), sit: true, dy: 0.52, chat: "legends" });
  });
  for (const s of [1, -1]) void k.person(pid + 60 + (s > 0 ? 0 : 1), [s * 1.18, -43.0], T("Finalist", "决赛选手"), { face: face(-s, 0), sit: true, dy: 0.7 + 0.52, chat: "legends" });
  void k.person(pid + 62, [-5.5, -41.8], T("Arena host", "竞技场主持"), { face: face(0.6, 1), dy: 0.7, chat: "legends" });
  for (const [i, [x, z]] of (
    [
      [-3.6, -31.2],
      [3.8, -27.0],
      [10.2, -36.8],
      [-2.2, -38.0],
    ] as [number, number][]
  ).entries())
    void k.person(pid + 63 + i, [x, z], T("Spectator", "观众"), { face: face(-x * 0.1, -1), chat: "legends" });
  // the bar
  void k.person(pid + 70, [-23.6, -7.0], T("Bartender", "调酒师"), { face: face(1, 0), chat: "bar" });
  void k.person(pid + 71, [-21.15, -6.6], T("Regular", "常客"), { face: face(-1, 0), sit: true, dy: 0.72, chat: "bar" });
  void k.person(pid + 72, [-21.15, -9.6], T("Regular", "常客"), { face: face(-1, 0), sit: true, dy: 0.72, chat: "bar" });
  // the lounge
  void k.person(pid + 73, [-20.4, -15.0], T("Regular", "常客"), { face: face(0, -1), sit: true, dy: 0.42, chat: "party" });
  // up on the ZK PARTY deck: gamers before the wall, the tournament host, someone at the cabinets
  k.on(1, () => {
    void k.person(pid + 1, [-19.8, -20.5], T("Gamer", "玩家"), { face: face(-1, 0), chat: "wall" });
    void k.person(pid + 2, [-20.6, -28.6], T("Gamer", "玩家"), { face: face(-1, 0.1), chat: "wall", wander: [[-20.6, -28.6], [-19.2, -18.0], [-21.0, -31.5]] });
    void k.person(pid + 3, [-24.4, -24.0], T("Tournament host", "锦标赛主持"), { face: face(1, 0), chat: "wall" });
    void k.person(pid + 4, [-24.2, -39.0], T("Gamer", "玩家"), { face: face(-1, 0), chat: "wall" });
    void k.person(pid + 9, [-E - 1.6, -10.6], T("Gamer", "玩家"), { face: face(1, 0), sit: true, dy: 0.42, chat: "deck" });
    // the bridge: two at the rail
    void k.person(pid + 74, [-3.2, -8.6], T("Visitor", "访客"), { face: face(0, -1), chat: "deck" });
    void k.person(pid + 75, [5.0, -8.6], T("Visitor", "访客"), { face: face(0, -1), chat: "deck" });
    // the Halo Lounge: the stands, the tables, the bar
    const rowsAt = [0.67, -0.08, -0.83];
    const heights = [0.42, 0.83, 1.25];
    [
      [0, -2.6],
      [0, 1.2],
      [1, -4.4],
      [1, 0.2],
      [1, 3.6],
      [2, -1.0],
      [2, 2.6],
    ].forEach(([r, along], i) => void k.person(pid + 76 + i, [BLEACH.x - rowsAt[r], BLEACH.z + along], T("Fan", "观众"), { face: face(-1, -0.25), sit: true, dy: heights[r] + 0.05, chat: "stands" }));
    atGlyph(GLYPH_UP[0], [0, 3], pid + 84);
    atGlyph(GLYPH_UP[1], [1, 2, 4], pid + 86);
    void k.person(pid + 89, [24.0, -5.0], T("Bartender", "调酒师"), { face: face(-1, 0), chat: "bar" });
  });
  // now and then someone speaks up, or reacts
  const emotes = ["zec", "star", "!", "note", "heart", "up"] as const;
  let next = 2,
    n = 0;
  k.ticks.push((dt) => {
    next -= dt;
    if (next > 0 || !k.people.length) return;
    next = 1.4 + Math.random() * 1.8;
    const p = k.people[Math.floor(Math.random() * k.people.length)];
    if (!p.chat) return;
    if (Math.random() < 0.6) p.s.say(chatLine(p.chat, n++ + Math.floor(Math.random() * 7)), 2.8);
    else p.s.emote(emotes[Math.floor(Math.random() * emotes.length)], 2.2);
  });
}
