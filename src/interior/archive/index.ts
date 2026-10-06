import * as THREE from "three";
import { KIND_HELP, KIND_LABEL, type BlockSummary, type Tx } from "../../data/types";
import { get, links, ZScan } from "../../data/zscan";
import { ArchiveBar } from "../../ui/archiveBar";
import { place, column } from "../furniture";
import { box, glowMat, room, std, textPlane } from "../kit";
import type { InteriorContext, PickInfo, Rect } from "../types";
import { Chain, SPAN } from "./chain";
import { Mosaic, valueOf } from "./mosaic";
import { movesOf, NODE_LABEL, zecText, type ArchiveTx, type TxFull } from "./money";
import { drawCard, drawHistory, historyAt, HISTORY_N, Screen, summary, type ArchiveState } from "./walls";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const num = (n: number) => n.toLocaleString("en-US");
const short = (h: string) => `${h.slice(0, 8)}…${h.slice(-6)}`;
/** Transactions read in detail per block (amounts, addresses); the rest are shown from their row. */
const DETAIL_MAX = 40;

/** The room: 16 × 11 m, the elevator in the front wall, the block's mosaic standing in the middle. */
const X0 = -8,
  X1 = 8,
  Z0 = -11,
  Z1 = 0,
  HEIGHT = 6;

/**
 * MEMPOOL 1F, the Block Archive: any block from genesis to the tip, rebuilt in the room. The block
 * stands in the middle as a glowing mosaic, one tile per transaction sized by the value it moved
 * (Bitfeed-style): tiles fly in and snap into place, the big ones carry their amount, a tap opens
 * the transaction. Following the chain live, the mempool's pending transactions float beside it
 * and fly in when the next block is mined. The left wall is the block's card, the right wall the
 * 60 blocks before it, and the chain runs along the back, a pillar per neighbouring block. The
 * console steps through blocks, takes any height, follows new blocks live or jumps to a landmark.
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
    place(group, `column-${HEIGHT}`, () => column(HEIGHT), x, Y, z);
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

  // ---- the block: a mosaic of its transactions on a pedestal -----------------------------------
  const MOSAIC_Z = -8.4;
  box(group, 5.4, 0.4, 1.4, std("#17161f", 0.4, 0.5), 0, Y, MOSAIC_Z + 0.1);
  box(group, 5.46, 0.04, 1.46, glowMat("#f4b728", 1.2), 0, Y + 0.38, MOSAIC_Z + 0.1);
  const mosaic = new Mosaic(group, new THREE.Vector3(0, Y + 0.42, MOSAIC_Z));
  pickables.push(mosaic.tiles, mosaic.cloud);
  rects.push([-2.9, MOSAIC_Z - 0.7, 2.9, MOSAIC_Z + 1.0]);
  // a title over the block
  // the block's line, lit on the front of the pedestal
  const title = new Screen(1024, 70, 5.3);
  title.mesh.position.set(0, Y + 0.2, MOSAIC_Z + 0.81);
  group.add(title.mesh);

  // ---- the walls' screens -------------------------------------------------------------------------
  const card = new Screen(1024, 560, 5.6);
  card.mesh.position.set(X0 + 0.13, Y + 2.25, -5.4);
  card.mesh.rotation.y = Math.PI / 2;
  group.add(card.mesh);
  pickables.push(card.mesh);
  const history = new Screen(1024, 560, 5.6);
  history.mesh.position.set(X1 - 0.13, Y + 2.25, -5.4);
  history.mesh.rotation.y = -Math.PI / 2;
  group.add(history.mesh);
  pickables.push(history.mesh);

  // ---- the chain along the back wall, under the transactions -------------------------------------
  const chain = new Chain(group, -6.8, 6.8, Z0 + 0.75, Y);
  pickables.push(chain.pillars);
  rects.push([-7.2, Z0, 7.2, Z0 + 1.15]);

  // ---- the console by the elevator: a lectern with its own screen ------------------------------
  const desk = new THREE.Group();
  desk.position.set(-2.9, Y, -2.0);
  desk.rotation.y = 0.35;
  group.add(desk);
  const dark = std("#22202c", 0.5, 0.4);
  box(desk, 0.5, 0.95, 0.36, dark, 0, 0, 0);
  box(desk, 0.54, 0.04, 0.4, glowMat("#f4b728", 1.2), 0, 0.95, 0);
  const screen = new Screen(512, 300, 0.62);
  screen.mesh.position.set(0, 1.22, -0.02);
  screen.mesh.rotation.x = -0.5;
  desk.add(screen.mesh);
  desk.traverse((o) => (o.userData.console = true));
  pickables.push(desk);
  rects.push([-3.3, -2.4, -2.5, -1.6]);
  const deskSign = textPlane("CONSOLE · 操作", { h: 0.13, color: "#f4b728", glow: true });
  deskSign.position.set(0, 1.72, 0.0);
  desk.add(deskSign);
  const drawConsole = () =>
    screen.draw((g, W) => {
      g.strokeStyle = "#f4b728";
      g.lineWidth = 4;
      g.strokeRect(8, 8, W - 16, 284);
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

  /** Over the mosaic: the block in one line. */
  const drawTitle = () =>
    title.draw((g, W, H) => {
      const b = st.block;
      g.textBaseline = "middle";
      g.fillStyle = "#f4b728";
      g.shadowColor = "#f4b728";
      g.shadowBlur = 12;
      g.font = '800 40px "JetBrains Mono", Menlo, monospace';
      const label = st.loading !== null ? `#${num(st.loading)} …` : b ? `#${num(b.height)}` : "";
      g.fillText(label, 24, H / 2 + 2, W * 0.42);
      g.shadowBlur = 0;
      if (b && st.loading === null) {
        const moved = txs.reduce((a, x) => a + (x.row.kind === "coinbase" ? 0 : (valueOf(x) ?? 0)), 0);
        g.textAlign = "right";
        g.fillStyle = "#e8e4da";
        g.font = '700 26px "JetBrains Mono", Menlo, monospace';
        g.fillText(`${num(b.tx_count)} tx · ${zecText(moved)} ZEC moved · ${st.era}`, W - 24, H / 2 + 2, W * 0.56);
      }
    });

  // lights: fixed in number and always in the scene (no shader recompiles changing floors)
  for (const [x, z, c, i] of [
    [0, -6.5, "#fff4e0", 7],
    [-5, -3, "#ffb070", 3],
    [5, -3, "#80d8ff", 3],
    [0, -9.5, "#ffd890", 3],
  ] as const) {
    const l = new THREE.PointLight(c, i, 12, 1.4);
    l.position.set(x, Y + HEIGHT - 0.7, z);
    scene.add(l);
  }

  // ---- state and data ------------------------------------------------------------------------------
  const st: ArchiveState = { block: null, loading: null, error: null, era: "", tip: 0, live: true, shownAt: 0 };
  let clock = 0;
  let want = -1;
  let txs: ArchiveTx[] = [];
  let hist: BlockSummary[] = [];
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

  /** Each load takes a ticket: a later request wins, even one made while this one waits. */
  let ticket = 0;
  async function load(height: number) {
    const mine = ++ticket;
    if (!st.tip) {
      const lb = await ZScan.latestBlock();
      if (lb) st.tip = lb.height;
      if (mine !== ticket) return;
    }
    const h = Math.max(0, Math.min(st.tip || height, Math.floor(height)));
    want = h;
    st.loading = h;
    st.error = null;
    bar.set(h, st.live);
    chain.set(h, st.tip, counts);
    drawConsole();
    drawCard(card, st);
    const b = await ZScan.blockDetail(h);
    if (want !== h) return;
    if (!b) {
      st.loading = null;
      st.error = `Block #${num(h)} not found`;
      return;
    }
    // each transaction's amounts and addresses (a few at a time through the shared rate limit)
    const rows = b.txs;
    const full = await Promise.all(rows.slice(0, DETAIL_MAX).map((r) => get<TxFull>(`/v1/tx/${r.txid}`)));
    if (want !== h) return;
    txs = rows.map((row, i) => ({ row, full: full[i] ?? null, moves: movesOf(row, full[i] ?? null) }));
    st.block = b;
    st.loading = null;
    st.era = eraOf(h);
    st.shownAt = clock;
    counts.set(h, b.tx_count);
    mosaic.set(txs, clock);
    drawTitle();
    drawCard(card, st);
    void neighbours(h);
    void loadHistory(h);
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

  async function loadHistory(h: number) {
    const list = await ZScan.blocksBelow(h + 1, HISTORY_N);
    if (want !== h) return;
    hist = (list ?? []).slice().reverse();
    for (const b of hist) counts.set(b.height, b.tx_count);
    drawHistory(history, st, hist);
  }

  ctx.onBlock((height) => {
    st.tip = Math.max(st.tip, height);
    if (st.live && group.visible) void load(height);
    else if (st.block && Math.abs(height - st.block.height) <= SPAN) chain.set(st.block.height, st.tip, counts);
  });

  // the transaction tracker opens a given block here
  window.addEventListener("zstreet:archive", (e) => {
    setLive(false);
    void load((e as CustomEvent<number>).detail);
  });

  let active = false;
  let cardAcc = 0,
    pendAcc = 0;
  // [ and ] step through blocks while you're on the floor
  window.addEventListener("keydown", (e) => {
    if (!group.visible || !active || /input|textarea|select/i.test((e.target as HTMLElement).tagName)) return;
    if (e.key === "[" || e.key === "]") {
      setLive(false);
      void load((want >= 0 ? want : st.tip) + (e.key === "]" ? 1 : -1));
    }
  });

  // ---- picking -------------------------------------------------------------------------------------
  /** Canvas point of a hit on one of the wall screens. */
  const onCanvas = (hit: THREE.Intersection, s: Screen) => (hit.uv ? { x: hit.uv.x * s.W, y: (1 - hit.uv.y) * s.H } : null);
  const txInfo = (x: ArchiveTx): PickInfo => {
    const r = x.row;
    const sm = summary(x);
    const i = txs.indexOf(x);
    const moves = x.moves
      .map((m) => `<div class="row"><span>${esc(NODE_LABEL[m.from])} → ${esc(NODE_LABEL[m.to])}</span><b class="mono">${m.zat === null ? "hidden" : `${zecText(m.zat)} ZEC`}</b></div>`)
      .join("");
    return {
      eyebrow: `Block #${num(st.block!.height)} · transaction ${i + 1} of ${txs.length}`,
      title: short(r.txid),
      mono: true,
      tag: [KIND_LABEL[r.kind], r.kind === "coinbase" ? "warn" : "info"],
      stats: [
        ["Amount", sm.amount],
        ["Fee", r.fee == null ? "—" : (r.fee / 1e8).toFixed(6)],
        ["From", sm.from],
        ["To", sm.to],
      ],
      body: `${moves}<div class="note">${esc(KIND_HELP[r.kind])}.</div>`,
      link: { href: links.tx(r.txid), label: "Transaction on ZScan" },
    };
  };
  const pendingInfo = (p: Tx): PickInfo => ({
    eyebrow: "Mempool · waiting for the next block",
    title: short(p.txid),
    mono: true,
    tag: [KIND_LABEL[p.kind], "warn"],
    stats: [
      ["Fee", p.fee == null ? "—" : (p.fee / 1e8).toFixed(6)],
      ["Size", `${(p.size / 1000).toFixed(1)} kB`],
    ],
    body: `<div class="note">Pending: it flies into the mosaic when a block takes it.</div>`,
    link: { href: links.tx(p.txid), label: "Transaction on ZScan" },
  });

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
      const o = hit.object;
      const x = mosaic.at(hit);
      if (x) return txInfo(x);
      const p = mosaic.pendingAt(hit);
      if (p) return pendingInfo(p);
      const h = chain.at(hit);
      if (h !== null) {
        setLive(false);
        void load(h);
        return null;
      }
      if (o === history.mesh) {
        const c = onCanvas(hit, history);
        const hh = c && historyAt(hist, c.x, c.y);
        if (hh !== null && hh !== undefined) {
          setLive(false);
          void load(hh);
        }
        return null;
      }
      if (o.userData.console) {
        bar.focus();
        return {
          eyebrow: "Block archive · console",
          title: "Any block, genesis to now",
          body: `<div class="note">Type a height in the console at the top, step with ◀ ▶ (or the [ and ] keys), follow new blocks with LIVE, or jump to a network upgrade. Each tile of the mosaic is a transaction, sized by the value it moved: tap one to open it. Tap a bar or a pillar for another block.</div>`,
        };
      }
      if (o === card.mesh) return blockInfo();
      return null;
    },
    hover(hit: THREE.Intersection): string | null {
      const o = hit.object;
      const x = mosaic.at(hit);
      if (x) {
        const v = valueOf(x);
        return `<b>${v ? `${zecText(v)} ZEC` : "hidden amount"}</b><span>${esc(KIND_LABEL[x.row.kind])} · ${esc(summary(x).from)} → ${esc(summary(x).to)}</span>`;
      }
      const p = mosaic.pendingAt(hit);
      if (p) return `<b>${short(p.txid)}</b><span>pending · ${esc(KIND_LABEL[p.kind])}</span>`;
      const h = chain.at(hit);
      if (h !== null) return `<b>#${num(h)}</b><span>${counts.has(h) ? `${num(counts.get(h)!)} tx · ` : ""}open this block</span>`;
      if (o === history.mesh) {
        const c = onCanvas(hit, history);
        const hh = c && historyAt(hist, c.x, c.y);
        return hh != null ? `<b>#${num(hh)}</b><span>open this block</span>` : null;
      }
      if (o.userData.console) return "<b>Console</b><span>pick a block</span>";
      if (o === card.mesh && st.block) return `<b>#${num(st.block.height)}</b><span>block details</span>`;
      return null;
    },
    update(dt: number) {
      clock += dt;
      bar.tick();
      mosaic.update(clock);
      chain.update(dt);
      // following the tip: the mempool floats beside the block, waiting
      pendAcc += dt;
      if (pendAcc > 2) {
        pendAcc = 0;
        mosaic.setPending(st.live && st.block?.height === st.tip ? ctx.director.mempoolList() : []);
      }
      cardAcc += dt;
      if (cardAcc > (st.loading !== null ? 0.3 : 1)) {
        cardAcc = 0;
        drawCard(card, st);
        drawTitle();
      }
    },
  };
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
