import * as THREE from "three";
import { KIND_HELP, KIND_LABEL, type BlockSummary } from "../../data/types";
import { get, links, ZScan } from "../../data/zscan";
import { ArchiveBar } from "../../ui/archiveBar";
import { place, column } from "../furniture";
import { box, glowMat, room, std, textPlane } from "../kit";
import type { InteriorContext, PickInfo, Rect } from "../types";
import { Chain, SPAN } from "./chain";
import { FlowScene } from "./flows";
import { movesOf, NODE_LABEL, routesOf, zecText, type ArchiveTx, type Node, type Route, type TxFull } from "./money";
import { cardAt, drawCard, drawCards, drawHistory, historyAt, HISTORY_N, Screen, summary, type ArchiveState } from "./walls";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const num = (n: number) => n.toLocaleString("en-US");
const short = (h: string) => `${h.slice(0, 8)}…${h.slice(-6)}`;
/** Transactions read in detail per block (amounts, addresses); the rest are shown from their row. */
const DETAIL_MAX = 40;
/** Activation heights that decide which pools stand in the room. */
const SAPLING = 419_200,
  CANOPY = 1_046_400,
  NU5 = 1_687_104,
  IRONWOOD = 3_428_143;

/** The room: 16 × 11 m, the elevator in the front wall, the pools' tanks in an arc in the middle. */
const X0 = -8,
  X1 = 8,
  Z0 = -11,
  Z1 = 0,
  HEIGHT = 6;

/**
 * MEMPOOL 1F, the Block Archive: any block from genesis to the tip, rebuilt in the room. Its money
 * flows in the middle: a glass tank per value pool and the mint's coin, with a glowing jet for
 * every route value took (as thick as the amount, tagged with it). The back wall deals a card per
 * transaction (amount, from, to, fee), the left wall is the block's card, the right wall the 60
 * blocks before it, and the chain runs under the cards, a pillar per neighbouring block. The
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

  // ---- the money: tanks for the pools, the mint's coin, jets for every route value took ------------
  const flows = new FlowScene(group, Y);
  pickables.push(...flows.pickables);
  // the tanks stand in an arc: keep the walker out of it
  rects.push([-5.4, -7.0, 5.4, -5.2]);

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
  const cards = new Screen(1536, 470, 9.6);
  // high on the back wall: the jets arc below it
  cards.mesh.position.set(0, Y + 4.42, Z0 + 0.13);
  group.add(cards.mesh);
  pickables.push(cards.mesh);

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
  let routes: Route[] = [];
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
    routes = routesOf(txs);
    st.block = b;
    st.loading = null;
    st.era = eraOf(h);
    st.shownAt = clock;
    counts.set(h, b.tx_count);
    // the pools that existed then, plus any this block touched
    const d = b.pool_deltas ?? {};
    const nodes: Node[] = ["transparent"];
    if (h < CANOPY || d.sprout || routes.some((r) => r.from === "sprout" || r.to === "sprout")) nodes.push("sprout");
    if (h >= SAPLING) nodes.push("sapling");
    if (h >= NU5) nodes.push("orchard");
    if (h >= IRONWOOD) nodes.push("ironwood");
    flows.setNodes(nodes);
    flows.show(routes, d as Partial<Record<Node, number>>, clock);
    drawCard(card, st);
    drawCards(cards, st, txs, clock);
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

  let active = false;
  let cardAcc = 0,
    wallAcc = 0;
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
  const routeInfo = (r: Route): PickInfo => ({
    eyebrow: `Block #${num(st.block!.height)} · money flow`,
    title: r.from === r.to ? `${NODE_LABEL[r.to]} · inside` : `${NODE_LABEL[r.from]} → ${NODE_LABEL[r.to]}`,
    tag: [r.zat ? `${zecText(r.zat)} ZEC` : "hidden amount", r.hidden ? "muted" : "info"],
    stats: [
      ["Transactions", String(r.txs.length)],
      ["Amount", r.zat ? `${zecText(r.zat)} ZEC` : "hidden"],
    ],
    body: r.txs
      .slice(0, 12)
      .map((x) => `<div class="row"><a href="${links.tx(x.row.txid)}" target="_blank" rel="noopener" class="mono">${esc(short(x.row.txid))}</a><b>${esc(summary(x).amount)}</b></div>`)
      .join(""),
  });
  const poolInfo = (n: Node): PickInfo | null => {
    const b = st.block;
    if (!b) return null;
    const d = (b.pool_deltas as Record<string, number> | undefined)?.[n] ?? 0;
    const touching = routes.filter((r) => r.from === n || r.to === n);
    if (n === "mint")
      return {
        eyebrow: `Block #${num(b.height)} · new coins`,
        title: `${zecText(b.coinbase_value ?? 0)} ZEC`,
        tag: [b.miner_pool ?? "Miner", "warn"],
        body: `<div class="note">Every block mints new ZEC: the miner's reward and the development funding, paid by the coinbase transaction, plus the fees of the block's transactions.</div>`,
      };
    return {
      eyebrow: `Block #${num(b.height)} · value pool`,
      title: NODE_LABEL[n],
      tag: [d ? `${d > 0 ? "+" : "−"}${zecText(Math.abs(d))} ZEC` : "no net change", d > 0 ? "ok" : d < 0 ? "warn" : "muted"],
      stats: [
        ["Net change", d ? `${d > 0 ? "+" : "−"}${zecText(Math.abs(d))}` : "0"],
        ["Flows", String(touching.length)],
      ],
      body: touching.map((r) => `<div class="row"><span>${esc(NODE_LABEL[r.from])} → ${esc(NODE_LABEL[r.to])}</span><b class="mono">${r.zat ? `${zecText(r.zat)} ZEC` : "hidden"}</b></div>`).join(""),
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
      const o = hit.object;
      const route = flows.routeAt(o);
      if (route) return routeInfo(route);
      const node = flows.nodeAt(o);
      if (node) return poolInfo(node);
      const h = chain.at(hit);
      if (h !== null) {
        setLive(false);
        void load(h);
        return null;
      }
      if (o === cards.mesh) {
        const p = onCanvas(hit, cards);
        const x = p && cardAt(st, txs, p.x, p.y, clock);
        return x ? txInfo(x) : blockInfo();
      }
      if (o === history.mesh) {
        const p = onCanvas(hit, history);
        const hh = p && historyAt(hist, p.x, p.y);
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
          body: `<div class="note">Type a height in the console at the top, step with ◀ ▶ (or the [ and ] keys), follow new blocks with LIVE, or jump to a network upgrade. Tap a jet or a tank to see where the money went, a card for its transaction, a bar or a pillar for another block.</div>`,
        };
      }
      if (o === card.mesh) return blockInfo();
      return null;
    },
    hover(hit: THREE.Intersection): string | null {
      const o = hit.object;
      const route = flows.routeAt(o);
      if (route) return `<b>${route.zat ? `${zecText(route.zat)} ZEC` : "hidden"}</b><span>${NODE_LABEL[route.from].toLowerCase()} → ${NODE_LABEL[route.to].toLowerCase()} · ${route.txs.length} tx</span>`;
      const node = flows.nodeAt(o);
      if (node) return `<b>${NODE_LABEL[node]}</b><span>${node === "mint" ? "new coins" : "value pool"}</span>`;
      const h = chain.at(hit);
      if (h !== null) return `<b>#${num(h)}</b><span>${counts.has(h) ? `${num(counts.get(h)!)} tx · ` : ""}open this block</span>`;
      if (o === cards.mesh) {
        const p = onCanvas(hit, cards);
        const x = p && cardAt(st, txs, p.x, p.y, clock);
        return x ? `<b>${short(x.row.txid)}</b><span>${esc(summary(x).amount)}</span>` : null;
      }
      if (o === history.mesh) {
        const p = onCanvas(hit, history);
        const hh = p && historyAt(hist, p.x, p.y);
        return hh != null ? `<b>#${num(hh)}</b><span>open this block</span>` : null;
      }
      if (o.userData.console) return "<b>Console</b><span>pick a block</span>";
      if (o === card.mesh && st.block) return `<b>#${num(st.block.height)}</b><span>block details</span>`;
      return null;
    },
    update(dt: number) {
      clock += dt;
      bar.tick();
      flows.update(dt, clock);
      chain.update(dt);
      wallAcc += dt;
      // the cards deal in for a couple of seconds, then the wall turns its page every 8 s
      const since = clock - st.shownAt;
      if (wallAcc > (since < 2.5 ? 0.05 : 1)) {
        wallAcc = 0;
        if (st.block) drawCards(cards, st, txs, clock);
      }
      cardAcc += dt;
      if (cardAcc > (st.loading !== null ? 0.3 : 1)) {
        cardAcc = 0;
        drawCard(card, st);
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
