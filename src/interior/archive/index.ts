import * as THREE from "three";
import { KIND_HELP, KIND_LABEL, type BlockTxRow } from "../../data/types";
import { links, ZScan } from "../../data/zscan";
import { ArchiveBar } from "../../ui/archiveBar";
import { place, column } from "../furniture";
import { box, glowMat, room, std, textPlane } from "../kit";
import type { InteriorContext, PickInfo, Rect } from "../types";
import { Bricks } from "./bricks";
import { Chain, SPAN } from "./chain";
import { boardBusy, drawBoard, drawCard, drawFlows, Screen, type ArchiveState } from "./walls";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const num = (n: number) => n.toLocaleString("en-US");
const short = (h: string) => `${h.slice(0, 8)}…${h.slice(-6)}`;

/** The room: 16 × 11 m, the elevator in the front wall, the tower in the middle. */
const X0 = -8,
  X1 = 8,
  Z0 = -11,
  Z1 = 0,
  HEIGHT = 4.6;
const PLINTH = new THREE.Vector3(0, 0, -5.4);

/**
 * MEMPOOL 1F, the Block Archive: any block from genesis to the tip, rebuilt in the room. The
 * block stands on the plinth as a tower of bricks (one per transaction), the walls read it out
 * (its card, value flowing through the pools, a departures board of its transactions) and the
 * chain runs along the back wall, a pillar per neighbouring block. The console steps through
 * blocks, takes any height, follows new blocks live or jumps to a landmark.
 */
export function buildArchive(ctx: InteriorContext, scene: THREE.Scene, Y: number) {
  const group = new THREE.Group();
  scene.add(group);
  const rects: Rect[] = [];
  const pickables: THREE.Object3D[] = [];

  // ---- the room --------------------------------------------------------------------------------
  rects.push(
    ...room(group, {
      x0: X0,
      z0: Z0,
      x1: X1,
      z1: Z1,
      y: Y,
      h: HEIGHT,
      floor: new THREE.MeshStandardMaterial({ map: floorTexture(), roughness: 0.22, metalness: 0.35 }),
      wall: std("#1e1a2c", 0.75),
      ceiling: std("#0d0c12", 0.9),
    }),
  );
  // neon runs along the walls, orange over teal like the shop below
  for (const [y, c] of [
    [HEIGHT - 0.25, "#ff9f2e"],
    [HEIGHT - 0.4, "#3ec9b0"],
  ] as const) {
    box(group, X1 - X0 - 0.2, 0.06, 0.02, glowMat(c, 1.5), 0, Y + y, Z0 + 0.12);
    box(group, 0.02, 0.06, Z1 - Z0 - 0.2, glowMat(c, 1.5), X0 + 0.12, Y + y, (Z0 + Z1) / 2);
    box(group, 0.02, 0.06, Z1 - Z0 - 0.2, glowMat(c, 1.5), X1 - 0.12, Y + y, (Z0 + Z1) / 2);
  }
  // ceiling light bars along the room
  for (const x of [-4.5, 4.5]) box(group, 0.08, 0.04, 8, glowMat("#fff4e0", 0.9), x, Y + HEIGHT - 0.05, -5.5);
  // columns in the corners and the elevator you came out of, in the front wall
  for (const [x, z] of [
    [X0 + 0.5, Z0 + 0.5],
    [X1 - 0.5, Z0 + 0.5],
    [X0 + 0.5, Z1 - 0.5],
    [X1 - 0.5, Z1 - 0.5],
  ])
    place(group, "column-4.6", () => column(HEIGHT), x, Y, z);
  const steel = std("#8a8e98", 0.35, 0.8);
  box(group, 1.0, 2.5, 0.06, steel, -0.52, Y, Z1 - 0.12);
  box(group, 1.0, 2.5, 0.06, steel, 0.52, Y, Z1 - 0.12);
  box(group, 2.4, 0.12, 0.1, glowMat("#3ec9b0", 1.2), 0, Y + 2.6, Z1 - 0.12);
  const lift = textPlane("1F  ARCHIVE · 記録保管所", { h: 0.2, color: "#3ec9b0", glow: true });
  lift.position.set(0, Y + 2.95, Z1 - 0.14);
  lift.rotation.y = Math.PI;
  group.add(lift);
  // LED pinstripes down the side walls, either side of the screens
  for (const x of [X0 + 0.11, X1 - 0.11])
    for (const z of [-10.1, -9.4, -1.6, -0.9]) box(group, 0.02, HEIGHT - 0.9, 0.05, glowMat(z < -5 ? "#b07bff" : "#3ec9b0", 1.1), x, Y + 0.3, z);

  // ---- the plinth --------------------------------------------------------------------------------
  const base = std("#1c1b24", 0.4, 0.5);
  box(group, 3.2, 0.42, 3.2, base, PLINTH.x, Y, PLINTH.z);
  box(group, 3.26, 0.05, 3.26, glowMat("#f4b728", 1.3), PLINTH.x, Y + 0.38, PLINTH.z);
  const top = new THREE.Mesh(new THREE.PlaneGeometry(2.9, 2.9), new THREE.MeshStandardMaterial({ map: plinthTexture(), roughness: 0.2, metalness: 0.6 }));
  top.rotation.x = -Math.PI / 2;
  top.position.set(PLINTH.x, Y + 0.431, PLINTH.z);
  group.add(top);
  rects.push([PLINTH.x - 1.8, PLINTH.z - 1.8, PLINTH.x + 1.8, PLINTH.z + 1.8]);
  // a shaft of light from the ceiling onto the block
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 1.75, HEIGHT - 0.45, 32, 1, true),
    new THREE.MeshBasicMaterial({ color: new THREE.Color("#ffd98a"), transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }),
  );
  beam.position.set(PLINTH.x, Y + 0.43 + (HEIGHT - 0.45) / 2, PLINTH.z);
  group.add(beam);
  box(group, 1.1, 0.06, 1.1, glowMat("#fff4e0", 1.6), PLINTH.x, Y + HEIGHT - 0.07, PLINTH.z);
  const bricks = new Bricks(group, new THREE.Vector3(PLINTH.x, Y + 0.46, PLINTH.z));
  pickables.push(bricks.mesh);

  // ---- the walls' screens -------------------------------------------------------------------------
  const card = new Screen(1024, 560, 5.6);
  card.mesh.position.set(X0 + 0.13, Y + 2.25, PLINTH.z);
  card.mesh.rotation.y = Math.PI / 2;
  group.add(card.mesh);
  pickables.push(card.mesh);
  const flows = new Screen(1024, 560, 5.6);
  flows.mesh.position.set(X1 - 0.13, Y + 2.25, PLINTH.z);
  flows.mesh.rotation.y = -Math.PI / 2;
  group.add(flows.mesh);
  const board = new Screen(1536, 400, 9);
  board.mesh.position.set(0, Y + 3.0, Z0 + 0.13);
  group.add(board.mesh);

  // ---- the chain along the back wall -------------------------------------------------------------
  const chain = new Chain(group, -6.8, 6.8, Z0 + 0.75, Y);
  pickables.push(chain.pillars);
  rects.push([-7.2, Z0, 7.2, Z0 + 1.15]);

  // ---- the console by the elevator: a lectern with its own screen ------------------------------
  const desk = new THREE.Group();
  desk.position.set(-2.6, Y, -2.2);
  desk.rotation.y = 0.35;
  group.add(desk);
  const dark = std("#22202c", 0.5, 0.4);
  box(desk, 0.5, 0.95, 0.36, dark, 0, 0, 0);
  box(desk, 0.54, 0.04, 0.4, glowMat("#f4b728", 1.2), 0, 0.95, 0);
  const screen = new Screen(512, 300, 0.62);
  screen.mesh.position.set(0, 1.22, -0.02);
  screen.mesh.rotation.x = -0.5;
  desk.add(screen.mesh);
  box(desk, 0.7, 0.42, 0.04, dark, 0, 1.0, 0.1).rotation.x = -0.5;
  desk.traverse((o) => (o.userData.console = true));
  pickables.push(desk);
  rects.push([-3.0, -2.6, -2.2, -1.8]);
  const deskSign = textPlane("CONSOLE · 操作", { h: 0.13, color: "#f4b728", glow: true });
  deskSign.position.set(0, 1.72, 0.0);
  desk.add(deskSign);
  const drawConsole = () =>
    screen.draw((g, W, H) => {
      g.strokeStyle = "#f4b728";
      g.lineWidth = 4;
      g.strokeRect(8, 8, W - 16, H - 16);
      g.fillStyle = "#f4b728";
      g.font = '700 26px "JetBrains Mono", Menlo, monospace';
      g.fillText("PICK A BLOCK", 30, 58);
      g.fillStyle = "#ffffff";
      g.font = '800 64px "JetBrains Mono", Menlo, monospace';
      g.textAlign = "center";
      g.fillText(`◀ ${want >= 0 ? num(want) : "…"} ▶`, W / 2, 160, W - 40);
      g.font = '600 22px "JetBrains Mono", Menlo, monospace';
      g.fillStyle = st.live ? "#3ee08f" : "#8a8a94";
      g.fillText(st.live ? "● LIVE · FOLLOWING THE CHAIN" : "TAP · TYPE ANY HEIGHT", W / 2, 230);
    });

  // lights: fixed in number and always in the scene (no shader recompiles changing floors)
  for (const [x, z, c, i] of [
    [0, PLINTH.z, "#fff4e0", 9],
    [-5, -3, "#ffb070", 3],
    [5, -3, "#80d8ff", 3],
    [0, -9.5, "#ffd890", 4],
  ] as const) {
    const l = new THREE.PointLight(c, i, 11, 1.4);
    l.position.set(x, Y + 3.9, z);
    scene.add(l);
  }

  // ---- state and data ------------------------------------------------------------------------------
  const st: ArchiveState = { block: null, loading: null, error: null, era: "", tip: 0, live: true, shownAt: 0 };
  let clock = 0;
  let want = -1;
  const counts = new Map<number, number>();
  let upgrades: { label: string; height: number }[] = [];
  const eraOf = (h: number) => upgrades.filter((u) => u.height <= h).at(-1)?.label ?? "Sprout";

  const bar = new ArchiveBar(document.getElementById("ui")!, {
    go: (h) => {
      setLive(false);
      void load(h);
    },
    step: (d) => {
      setLive(false);
      const from = want >= 0 ? want : (st.block?.height ?? st.tip);
      void load(from + d);
    },
    live: (on) => {
      setLive(on);
      if (on) void load(st.tip);
    },
  });
  const setLive = (on: boolean) => {
    st.live = on;
    bar.set(want >= 0 ? want : null, on);
    drawConsole();
  };

  void ZScan.upgrades().then((u) => {
    if (!u) return;
    st.tip = Math.max(st.tip, u.height);
    upgrades = u.upgrades.filter((x) => x.activation_height !== null && x.activated).map((x) => ({ label: x.label, height: x.activation_height! }));
    upgrades.sort((a, b) => a.height - b.height);
    bar.setLandmarks([["Genesis", 0], ...upgrades.map((x) => [x.label, x.height] as [string, number]), ["Latest", st.tip]]);
    if (st.block) st.era = eraOf(st.block.height);
  });

  async function load(height: number) {
    if (!st.tip) {
      const lb = await ZScan.latestBlock();
      if (lb) st.tip = lb.height;
    }
    const h = Math.max(0, Math.min(st.tip || height, Math.floor(height)));
    want = h;
    st.loading = h;
    st.error = null;
    bar.set(h, st.live);
    chain.set(h, st.tip, counts);
    drawConsole();
    const b = await ZScan.blockDetail(h);
    if (want !== h) return;
    st.loading = null;
    if (!b) {
      st.error = `Block #${num(h)} not found`;
      return;
    }
    st.block = b;
    st.era = eraOf(h);
    st.shownAt = clock;
    counts.set(h, b.tx_count);
    bricks.set(b.txs, clock);
    drawCard(card, st);
    void neighbours(h);
  }

  /** Transaction counts around `h`, for the pillars: one list call in the indexed range, else a few singles. */
  async function neighbours(h: number) {
    const list = await ZScan.blocksBelow(h + SPAN + 1, SPAN * 2 + 1);
    if (want !== h) return;
    for (const b of list ?? []) counts.set(b.height, b.tx_count);
    chain.set(h, st.tip, counts);
    // not indexed yet (the archive is still filling back to genesis): fetch the closest ones
    for (const d of [1, -1, 2, -2, 3, -3]) {
      const k = h + d;
      if (k < 0 || k > st.tip || counts.has(k)) continue;
      const b = await ZScan.blockDetail(k);
      if (want !== h) return;
      if (b) counts.set(k, b.tx_count);
      chain.set(h, st.tip, counts);
    }
  }

  ctx.onBlock((height) => {
    st.tip = Math.max(st.tip, height);
    if (st.live && group.visible) void load(height);
    else if (st.block && Math.abs(height - st.block.height) <= SPAN) chain.set(st.block.height, st.tip, counts);
  });

  let active = false;
  let flowAcc = 0,
    cardAcc = 0;
  // [ and ] step through blocks while you're on the floor
  window.addEventListener("keydown", (e) => {
    if (!group.visible || !active || /input|textarea|select/i.test((e.target as HTMLElement).tagName)) return;
    if (e.key === "[" || e.key === "]") {
      setLive(false);
      void load((want >= 0 ? want : st.tip) + (e.key === "]" ? 1 : -1));
    }
  });

  // ---- picking -------------------------------------------------------------------------------------
  const txInfo = (r: BlockTxRow, i: number): PickInfo => {
    const parts = [
      ["Sapling", (r.n_sapling_spends ?? 0) + (r.n_sapling_outputs ?? 0)],
      ["Orchard", r.n_orchard_actions ?? 0],
      ["Ironwood", r.n_ironwood_actions ?? 0],
    ].filter(([, n]) => n) as [string, number][];
    return {
      eyebrow: `Block #${num(st.block!.height)} · transaction ${i + 1} of ${st.block!.txs.length}`,
      title: short(r.txid),
      mono: true,
      tag: [KIND_LABEL[r.kind], r.kind === "coinbase" ? "warn" : "info"],
      stats: [
        ["Fee", r.fee == null ? "—" : (r.fee / 1e8).toFixed(6)],
        ["Size", `${(r.size / 1000).toFixed(1)} kB`],
        ["In / out", `${r.n_tin ?? 0} / ${r.n_tout ?? 0}`],
        ["Shielded", parts.length ? parts.map(([k, n]) => `${k} ${n}`).join(" · ") : "—"],
      ],
      body: `<div class="note">${esc(KIND_HELP[r.kind])}.${r.transparent_out ? ` Public outputs: ${(r.transparent_out / 1e8).toLocaleString("en-US", { maximumFractionDigits: 4 })} ZEC.` : ""} The brick's volume follows the transaction's size in bytes, its colour its kind.</div>`,
      link: { href: links.tx(r.txid), label: "Transaction on ZScan" },
    };
  };
  const blockInfo = (): PickInfo | null => {
    const b = st.block;
    if (!b) return null;
    return {
      eyebrow: `Block archive · ${st.era}`,
      title: `#${num(b.height)}`,
      mono: true,
      tag: [b.miner_pool ?? "Block", "muted"],
      stats: [
        ["Transactions", num(b.tx_count)],
        ["Size", `${(b.size / 1000).toFixed(1)} kB`],
        ["Fees", b.fees == null ? "—" : (b.fees / 1e8).toFixed(5)],
        ["Mined", new Date(b.time).toISOString().slice(0, 10)],
      ],
      body: `<div class="note mono">${esc(b.hash)}</div>`,
      link: { href: links.block(b.height), label: "Block on ZScan" },
    };
  };

  return {
    group,
    rects,
    pickables,
    floor: { label: "1F", name: "Block archive · any block, genesis to now", y: Y, spawn: new THREE.Vector3(0, Y, -1.0), yaw: 0 },
    /** The floor is shown (true) or left (false). */
    setActive(on: boolean) {
      active = on;
      group.visible = on;
      if (on && !st.block && st.loading === null) void load(st.tip || Number.MAX_SAFE_INTEGER);
    },
    pick(hit: THREE.Intersection): PickInfo | null {
      const r = bricks.at(hit);
      if (r) return txInfo(r, bricks.txs.indexOf(r));
      const h = chain.at(hit);
      if (h !== null) {
        setLive(false);
        void load(h);
        return null;
      }
      if (hit.object.userData.console) {
        bar.focus();
        return {
          eyebrow: "Block archive · console",
          title: "Any block, genesis to now",
          body: `<div class="note">Type a height in the console at the top, step with ◀ ▶ (or the [ and ] keys), follow new blocks with LIVE, or jump to a network upgrade. Tap a brick for its transaction, a pillar for that block.</div>`,
        };
      }
      if (hit.object === card.mesh) return blockInfo();
      return null;
    },
    hover(hit: THREE.Intersection): string | null {
      const r = bricks.at(hit);
      if (r) return `<b>${short(r.txid)}</b><span>${KIND_LABEL[r.kind]} · ${(r.size / 1000).toFixed(1)} kB</span>`;
      const h = chain.at(hit);
      if (h !== null) return `<b>#${num(h)}</b><span>${counts.has(h) ? `${num(counts.get(h)!)} tx · ` : ""}open this block</span>`;
      if (hit.object.userData.console) return "<b>Console</b><span>pick a block</span>";
      if (hit.object === card.mesh && st.block) return `<b>#${num(st.block.height)}</b><span>block details</span>`;
      return null;
    },
    update(dt: number) {
      clock += dt;
      bar.tick();
      bricks.update(clock);
      chain.update(dt);
      flowAcc += dt;
      if (flowAcc > 0.05) {
        flowAcc = 0;
        drawFlows(flows, st, clock);
        if (boardBusy(st, clock)) drawBoard(board, st, clock);
      }
      cardAcc += dt;
      if (cardAcc > (st.loading !== null ? 0.3 : 1)) {
        cardAcc = 0;
        drawCard(card, st);
      }
    },
  };
}

/** The plinth's top: a dark slab engraved with a fine gold grid. */
function plinthTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  g.fillStyle = "#0b0a10";
  g.fillRect(0, 0, 256, 256);
  g.fillStyle = "rgba(244,183,40,0.35)";
  for (let i = 0; i <= 256; i += 32) {
    g.fillRect(i, 0, 1, 256);
    g.fillRect(0, i, 256, 1);
  }
  g.strokeStyle = "rgba(244,183,40,0.8)";
  g.lineWidth = 3;
  g.strokeRect(3, 3, 250, 250);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Dark polished stone, a faint gold grid like a vault's floor. */
function floorTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  g.fillStyle = "#121118";
  g.fillRect(0, 0, 256, 256);
  g.fillStyle = "#1a1922";
  g.fillRect(4, 4, 120, 120);
  g.fillRect(132, 132, 120, 120);
  g.fillStyle = "rgba(244,183,40,0.18)";
  g.fillRect(0, 0, 256, 2);
  g.fillRect(0, 0, 2, 256);
  g.fillRect(0, 128, 256, 1);
  g.fillRect(128, 0, 1, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(8, 5.5);
  return t;
}
