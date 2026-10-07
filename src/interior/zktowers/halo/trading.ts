import * as THREE from "three";
import { Market } from "../../../data/market";
import type { Snark } from "../../../scene/snark";
import { chair, coffeeMachine, desk, plant } from "../../furniture";
import { chart, drawPools, drawPrice, POOL_COLOR, POOL_NAME, POOLS, poolsInfo, priceInfo } from "../../reserve/data";
import { drawBlocks, drawTicker, MONO, num, paint, rr, SANS, type SkyKit, usd } from "../kit";
import { LIFT, liveSurface, PAL, Screens, tapeBand } from "./shared";

/**
 * 10 · the trading floor: four rows of desks, each with its bank of screens (price, blocks, the
 * pools, the mempool, all live), facing the video wall; the tape running round the room under the
 * ceiling; the bell by the wall, rung at every block; the head of desk in his glass corner office;
 * the coffee point; the city all round through the glass, forty metres up.
 */

const f = 1;
const X0 = -18,
  X1 = 18,
  Z0 = -30,
  Z1 = 0,
  H = 5.4;

export function trading(k: SkyKit) {
  const g = k.groups[f];

  // ---- floor, ceiling, light strips that turn with the tower ---------------------------------------
  const carpet = paint(256, 256, (c, W) => {
    c.fillStyle = PAL.carpet;
    c.fillRect(0, 0, W, W);
    for (let i = 0; i < 4; i++)
      for (let j = 0; j < 4; j++) {
        c.fillStyle = (i + j) % 2 ? "#20262e" : "#1a1f26";
        c.fillRect(i * 64, j * 64, 64, 64);
        c.strokeStyle = "rgba(0,0,0,0.35)";
        c.strokeRect(i * 64 + 0.5, j * 64 + 0.5, 63, 63);
      }
  }, 18, 15);
  k.flat(f, X1 - X0, Z1 - Z0, new THREE.MeshStandardMaterial({ map: carpet, roughness: 0.95 }), 0, (Z0 + Z1) / 2);
  k.box(f, X1 - X0, 0.3, Z1 - Z0, 0, H, (Z0 + Z1) / 2, "#22272e");
  {
    const a = 0.22;
    const dx = Math.cos(a),
      dz = Math.sin(a);
    for (let zc = -34; zc <= 6; zc += 2.6) {
      // the line through (0, zc) along (dx, dz), clipped to the room
      let t0 = -40,
        t1 = 40;
      const clip = (p: number, d: number, lo: number, hi: number) => {
        if (Math.abs(d) < 1e-6) return;
        const ta = (lo - p) / d,
          tb = (hi - p) / d;
        t0 = Math.max(t0, Math.min(ta, tb));
        t1 = Math.min(t1, Math.max(ta, tb));
      };
      clip(0, dx, X0 + 0.4, X1 - 0.4);
      clip(zc, dz, Z0 + 0.6, Z1 - 0.4);
      if (t1 - t0 < 1) continue;
      const tm = (t0 + t1) / 2;
      k.box(f, t1 - t0, 0.04, 0.14, dx * tm, H - 0.05, zc + dz * tm, "#eaf6ff", "glow", -a);
    }
  }

  // ---- the walls: glass round three sides, the video wall at the back -------------------------------
  k.curtain(f, X0, Z1, X1, Z1, H, "#2a3038", 2.25, { transom: 4.6 });
  k.curtain(f, X0, Z0, X0, Z1, H, "#2a3038", 2.5, { transom: 4.6 });
  k.curtain(f, X1, Z0, X1, Z1, H, "#2a3038", 2.5, { transom: 4.6 });
  k.wall(f, X0, Z0, X1, Z0, H, "#0c1016", "matte", 0.4);
  const zw = Z0 + 0.25;
  const price = liveSurface(k, f, 1280, 512, (c, W, Hh) => drawPrice(c, W, Hh, "ZEC / USD · HALO DESK"), 5);
  k.plane(f, 11, 4, price.mat, 0, 2.55, zw);
  const pools = liveSurface(k, f, 768, 560, (c, W, Hh) => drawPools(c, W, Hh), 6);
  k.plane(f, 6, 4, pools.mat, -8.8, 2.55, zw);
  const blocks = liveSurface(k, f, 768, 560, (c, W, Hh) => drawBlocks(c, W, Hh, k.blocks, { title: "BLOCKS", accent: PAL.cyan }), 4);
  k.plane(f, 6, 4, blocks.mat, 8.8, 2.55, zw);
  for (const [x, w] of [
    [-8.8, 6],
    [0, 11],
    [8.8, 6],
  ] as const)
    k.box(f, w + 0.16, 4.16, 0.08, x, 0.47, zw - 0.05, "#05070a", "polish");
  // side panels: the pools' 24 h flows, one per pool, and the clock of the last block
  const flows = liveSurface(k, f, 256, 640, (c, W, Hh) => drawFlows(c, W, Hh), 8);
  k.plane(f, 1.8, 4, flows.mat, -15.4, 2.55, zw);
  const clock = liveSurface(k, f, 256, 640, (c, W, Hh) => drawClock(c, W, Hh, k), 1);
  k.plane(f, 1.8, 4, clock.mat, 15.4, 2.55, zw);
  k.hit(f, 11, 4.4, 0.2, 0, 0.55, zw + 0.1, `<b>ZEC / USD</b><span>the desk's main screen</span>`, () => priceInfo());
  k.hit(f, 6, 4.4, 0.2, -8.8, 0.55, zw + 0.1, `<b>Value pools</b><span>live</span>`, () => poolsInfo());
  k.hit(f, 6, 4.4, 0.2, 8.8, 0.55, zw + 0.1, `<b>Blocks</b><span>live</span>`, () => ({
    eyebrow: "ZK TOWER HALO · trading floor",
    title: `Block #${num(k.height)}`,
    mono: true,
    body: k.blocks
      .slice(0, 6)
      .map((b) => `<p style="font-family:${MONO}">#${num(b.height)} · ${b.miner_pool ?? "unknown"} · ${b.tx_count || "·"} tx</p>`)
      .join(""),
  }));
  // the tape round the room, under the ceiling
  const m = 0.32;
  tapeBand(
    k,
    f,
    [
      [X0 + 0.6, zw + 0.02, X1 - 0.6, zw + 0.02],
      [X1 - m, Z1 - m, X0 + m, Z1 - m],
      [X1 - m, Z0 + 0.5, X1 - m, Z1 - m],
      [X0 + m, Z1 - m, X0 + m, Z0 + 0.5],
    ],
    H - 0.4,
    0.4,
  );

  // ---- the desks: four rows of twelve, four screens each, facing the wall ---------------------------
  const scr = new Screens();
  const kinds = [
    liveSurface(k, f, 384, 240, (c, W, Hh) => deskChart(c, W, Hh), 6),
    liveSurface(k, f, 384, 240, (c, W, Hh) => drawBlocks(c, W, Hh, k.blocks, { title: "BLOCKS", accent: PAL.cyan }), 5),
    liveSurface(k, f, 384, 240, (c, W, Hh) => deskPools(c, W, Hh), 8),
    liveSurface(k, f, 384, 240, (c, W, Hh) => deskMempool(c, W, Hh, k), 3),
    liveSurface(k, f, 384, 240, (c, W, Hh) => drawTicker(c, W, Hh, { label: "ZEC/USD · LAST" }), 4),
  ];
  const ROWS = [-23, -18.4, -13.8, -9.2];
  const seats: [number, number][] = [];
  ROWS.forEach((z, r) => {
    for (let i = 0; i < 12; i++) {
      const x = -9.35 + i * 1.7;
      k.vox(f, `halo-desk${(i + r) % 4}`, () => desk((i + r) % 4), x, z, 0);
      k.vox(f, "halo-chair", () => chair("#1e242c", true), x, z + 0.85, Math.PI, { solid: false });
      seats.push([x, z + 0.85]);
      // the screens: three across on the arm, one above in the middle
      const sy = 0.75 + 0.36,
        sz = z - 0.22;
      for (let s = 0; s < 3; s++) {
        const sx = x + (s - 1) * 0.5;
        const ry = (s - 1) * -0.18;
        k.box(f, 0.5, 0.32, 0.03, sx, sy - 0.16, sz - 0.02, "#0a0c10", "polish", ry);
        scr.add(kinds[(i * 3 + s + r * 2) % kinds.length], 0.46, 0.28, sx, k.y(f) + sy, sz + 0.002, ry);
      }
      k.box(f, 0.5, 0.32, 0.03, x, sy + 0.18, sz - 0.04, "#0a0c10", "polish");
      scr.add(kinds[(i + r) % kinds.length], 0.46, 0.28, x, k.y(f) + sy + 0.34, sz - 0.018);
      k.box(f, 0.03, 0.5, 0.03, x, 0.75, sz - 0.06, "#2a2e34", "metal");
      // keyboard and a phone turret
      k.box(f, 0.42, 0.02, 0.14, x, 0.75, z + 0.12, "#2a2e34", "matte");
      k.box(f, 0.22, 0.06, 0.16, x + 0.5, 0.75, z + 0.08, "#1a1e24", "matte");
      k.box(f, 0.16, 0.005, 0.1, x + 0.5, 0.81, z + 0.08, PAL.cyan, "glow");
    }
    // the cable spine down the row and its desk lamp of a light bar
    k.box(f, 20.6, 0.02, 0.03, 0, 0.75, z - 0.43, "#1f8a96", "glow");
    k.box(f, 0.04, 0.8, 0.04, -10.3, 0.75, z - 0.3, PAL.chrome, "metal");
    k.box(f, 0.04, 0.8, 0.04, 10.3, 0.75, z - 0.3, PAL.chrome, "metal");
    k.label(f, ["ZEC SPOT", "SHIELDED FLOW", "BLOCK DESK", "MACRO"][r], -10.6, 1.25, z, { h: 0.2, color: PAL.cyan, ry: -Math.PI / 2 });
  });
  scr.build(g);

  // ---- the bell by the wall, rung at every block -----------------------------------------------------
  const BX = -14.6,
    BZ = -26.4;
  k.box(f, 1.2, 1.0, 1.2, BX, 0, BZ, "#14181e", "polish");
  k.box(f, 1.24, 0.06, 1.24, BX, 1.0, BZ, PAL.brass, "metal");
  for (const s of [-0.45, 0.45]) k.box(f, 0.06, 1.5, 0.06, BX + s, 1.06, BZ, PAL.brass, "metal");
  k.box(f, 1.0, 0.06, 0.06, BX, 2.52, BZ, PAL.brass, "metal");
  const bell = new THREE.Group();
  const bellM = new THREE.MeshStandardMaterial({ color: "#d9b25a", metalness: 0.95, roughness: 0.22 });
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.3, 0.42, 24, 1, true), bellM);
  cup.position.y = -0.3;
  const top = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), bellM);
  top.position.y = -0.09;
  bell.add(cup, top);
  bell.traverse((o) => ((o as THREE.Mesh).raycast = () => {}));
  k.add(f, bell, BX, 2.5, BZ);
  k.label(f, "THE BLOCK BELL", BX, 0.62, BZ + 0.61, { h: 0.14, color: PAL.brass });
  k.solid(f, BX - 0.65, BZ - 0.65, BX + 0.65, BZ + 0.65);
  let ring = 0;
  k.ticks[f].push((dt) => {
    if (ring <= 0) return void (bell.rotation.z = 0);
    ring -= dt;
    bell.rotation.z = Math.sin(ring * 22) * 0.4 * Math.min(1, ring);
  });
  const traders: Snark[] = [];
  const CHEER = ["Block!", "DING! New block!", "Ring it!", "Shielded volume up!", "Mark it!", "Next block!"];
  const ringBell = (h?: number) => {
    ring = 2.4;
    traders.forEach((s, i) => setTimeout(() => (k.current === f ? s.say(i === 0 && h ? `Block ${num(h)}!` : CHEER[(i + (h ?? 0)) % CHEER.length], 2.4, "shout") : null), 200 + i * 260));
  };
  k.blockFns.push((h) => k.current === f && ringBell(h));
  k.hit(f, 1.3, 2.6, 1.3, BX, 0, BZ, `<b>The block bell</b><span>ring it</span>`, () => {
    ringBell();
    return { eyebrow: "ZK TOWER HALO · trading floor", title: "The block bell", stats: [["Rings", "every block"], ["Last block", `#${num(k.height)}`]] };
  });

  // ---- the head of desk's glass office, front right ----------------------------------------------------
  {
    const ox0 = 12,
      oz0 = -7.2;
    k.curtain(f, ox0, oz0, X1, oz0, 2.9, PAL.chrome, 1.2, {});
    k.curtain(f, ox0, oz0, ox0, -2.8, 2.9, PAL.chrome, 1.2, {});
    k.box(f, 0.06, 2.9, 0.06, ox0, 0, -1.4, PAL.chrome, "metal");
    k.box(f, X1 - ox0, 0.12, -oz0, (ox0 + X1) / 2, 2.9, oz0 / 2, "#2a3038", "matte");
    k.box(f, 2.2, 0.06, 1.0, 15.2, 0.74, -4.4, PAL.walnut, "polish");
    k.box(f, 0.1, 0.74, 0.9, 14.2, 0, -4.4, "#2a2e34", "metal");
    k.box(f, 0.1, 0.74, 0.9, 16.2, 0, -4.4, "#2a2e34", "metal");
    k.solid(f, 14.1, -4.9, 16.3, -3.9);
    k.vox(f, "halo-boss-chair", () => chair("#3a1a12", true), 15.2, -5.3, 0, { solid: false });
    const boss = new Screens();
    boss.add(kinds[0], 0.6, 0.36, 14.8, k.y(f) + 1.05, -4.68, 0);
    boss.add(kinds[3], 0.6, 0.36, 15.6, k.y(f) + 1.05, -4.68, 0);
    boss.build(g);
    k.box(f, 0.62, 0.38, 0.03, 14.8, 0.86, -4.71, "#0a0c10", "polish");
    k.box(f, 0.62, 0.38, 0.03, 15.6, 0.86, -4.71, "#0a0c10", "polish");
    k.label(f, "HEAD OF DESK", 12.0, 2.5, -4.6, { h: 0.18, color: PAL.cyan, ry: -Math.PI / 2 });
    k.vox(f, "halo-ficus", () => plant("ficus", 3), 17.3, -6.6);
  }

  // ---- the coffee point on the west wall -----------------------------------------------------------
  k.box(f, 0.7, 0.95, 3.2, X0 + 0.55, 0, -16, "#e8ecf0", "polish");
  k.box(f, 0.72, 0.04, 3.24, X0 + 0.55, 0.95, -16, "#1a1e24", "polish");
  k.vox(f, "halo-coffee", coffeeMachine, X0 + 0.5, -16.8, Math.PI / 2, { dy: 0.99, solid: false });
  k.vox(f, "halo-coffee", coffeeMachine, X0 + 0.5, -15.2, Math.PI / 2, { dy: 0.99, solid: false });
  k.solid(f, X0, -17.6, X0 + 0.95, -14.4);
  k.label(f, "COFFEE", X0 + 0.22, 2.2, -16, { h: 0.24, color: PAL.cyan, ry: Math.PI / 2 });
  for (const [x, z, s] of [
    [X0 + 0.7, -21.4, 1],
    [X0 + 0.7, -11, 2],
    [X1 - 0.7, -26.5, 4],
    [X1 - 0.7, -12, 5],
  ] as const)
    k.vox(f, `halo-ficus${s}`, () => plant("ficus", s), x, z);

  // ---- the lifts on the west wall ------------------------------------------------------------------
  k.lifts(f, X0 + 0.2, -7, Math.PI / 2, LIFT);

  // ---- light ---------------------------------------------------------------------------------------
  k.light(f, -5, 4.6, -20.5, "#eaf4ff", 16, 16);
  k.light(f, 5, 4.6, -20.5, "#eaf4ff", 16, 16);
  k.light(f, -5, 4.6, -11.5, "#eaf4ff", 16, 16);
  k.light(f, 5, 4.6, -11.5, "#eaf4ff", 16, 16);
  k.light(f, 0, 4, -27, "#9fe8ff", 10, 12);
  k.light(f, 15, 2.6, -4, "#ffe2c0", 8, 8);

  // ---- people ---------------------------------------------------------------------------------------
  const p = () => Market.state.price;
  const LINES = [
    [() => (p() ? `${usd(p()!.usd)}. Buying.` : "Feed's slow. Hold."), "Shielded volume up again.", "Who's got the Orchard flows?"],
    ["Sell the rumour, shield the news.", () => `Block ${num(k.height)} in. Mark it.`, "My screen says up. My heart says up."],
    [() => `Pools: ${((Market.state.pools?.shielded_ratio ?? 0) * 100).toFixed(1)}% shielded.`, "Hedge it. No, shield it.", "Coffee run in one block."],
    ["Bid! Bid!", "Out of transparent, into Orchard.", () => (p() ? `${p()!.usd_24h_change >= 0 ? "Up" : "Down"} ${Math.abs(p()!.usd_24h_change).toFixed(2)}% on the day.` : "Watching the tape.")],
  ];
  k.onCast(f, () => {
    const pick = [3, 8, 14, 17, 21, 26, 30, 33, 38, 44];
    const ids = [1402, 2213, 3324, 4435, 5546, 6657, 7768, 8879, 9981, 1092];
    pick.forEach((si, i) => {
      const [x, z] = seats[si];
      void k.person(f, ids[i], [x, z], "Trader", { sit: true, face: [0, -1], lines: LINES[i % LINES.length], near: 6, every: [10, 20], tone: i % 3 === 0 ? "shout" : "talk" }).then((s) => s && traders.push(s));
    });
    void k.person(f, 2501, [15.2, -5.3], "Head of desk", { sit: true, face: [0, 1], lines: ["Close the book at the block.", "Risk? We shield it.", () => `Best desk on Wall Street. ${num(k.height)} blocks and counting.`] });
    void k.person(f, 3612, [0, -25.4], "Desk head", {
      wander: [
        [0, -25.4],
        [-11, -20.6],
        [11, -16],
        [-11, -11.4],
        [11, -7],
      ],
      lines: ["Eyes on the tape, people!", "Who sold Sprout? Nobody holds Sprout.", "Quiet. Listen to the bell."],
      near: 9,
    });
    const a = k.person(f, 4723, [-16.6, -14.2], "Quant", { face: [0.3, 1] });
    const b = k.person(f, 5834, [-15.4, -13.2], "Trader", { face: [-0.6, -0.4] });
    k.dialog(f, [a, b], [
      [0, "My model says the shielded share keeps climbing."],
      [1, "Your model said that last block too."],
      [0, "And it was right."],
      [1, "Fine. Espresso's on me."],
    ]);
    void k.person(f, 6945, [-13.8, -26.2], "Bell ringer", { face: [1, 0.2], lines: ["Every block, I ring. Every block.", "Seventy-five seconds. Then I ring again."] });
  });
}

// ---- the desks' small screens ----------------------------------------------------------------------

function deskChart(g: CanvasRenderingContext2D, W: number, H: number) {
  g.fillStyle = "#05070c";
  g.fillRect(0, 0, W, H);
  const p = Market.state.price;
  g.fillStyle = "#8f8a80";
  g.font = `700 22px ${MONO}`;
  g.textBaseline = "alphabetic";
  g.fillText("ZEC 14D", 12, 30);
  if (p) {
    g.fillStyle = "#f2eee6";
    g.textAlign = "right";
    g.fillText(usd(p.usd), W - 12, 30);
    g.textAlign = "left";
  }
  chart(g, 10, 44, W - 20, H - 54, 3);
}

function deskPools(g: CanvasRenderingContext2D, W: number, H: number) {
  g.fillStyle = "#05070c";
  g.fillRect(0, 0, W, H);
  const P = Market.state.pools;
  g.fillStyle = "#8f8a80";
  g.font = `700 22px ${MONO}`;
  g.fillText("POOLS", 12, 30);
  if (!P) return;
  const total = POOLS.reduce((a, k) => a + P.pools[k], 0) || 1;
  POOLS.forEach((k, i) => {
    const y = 48 + i * 36;
    g.fillStyle = POOL_COLOR[k];
    g.font = `800 20px ${SANS}`;
    g.fillText(POOL_NAME[k].toUpperCase(), 12, y + 18);
    g.fillStyle = "rgba(255,255,255,0.08)";
    rr(g, 150, y + 4, W - 166, 18, 4);
    g.fill();
    g.fillStyle = POOL_COLOR[k];
    rr(g, 150, y + 4, Math.max(4, (W - 166) * (P.pools[k] / total)), 18, 4);
    g.fill();
  });
}

function deskMempool(g: CanvasRenderingContext2D, W: number, H: number, k: SkyKit) {
  g.fillStyle = "#05070c";
  g.fillRect(0, 0, W, H);
  const list = k.ctx.director.mempoolList();
  g.fillStyle = "#3ef0ff";
  g.font = `800 22px ${SANS}`;
  g.fillText(`MEMPOOL · ${list.length}`, 12, 30);
  g.font = `600 17px ${MONO}`;
  const now = Date.now();
  list
    .slice(-6)
    .reverse()
    .forEach((t, i) => {
      const y = 58 + i * 30;
      g.fillStyle = "#b8b2a6";
      g.fillText(t.txid.slice(0, 10), 12, y);
      g.fillStyle = t.kind === "shielded" ? "#3ee08f" : t.kind === "transparent" ? "#eda100" : "#f4b728";
      g.fillText(String(t.kind).slice(0, 11), 150, y);
      g.fillStyle = "#8f8a80";
      g.textAlign = "right";
      g.fillText(`${Math.max(0, Math.round((now - t.seenAt) / 1000))}s`, W - 12, y);
      g.textAlign = "left";
    });
  if (!list.length) {
    g.fillStyle = "#8f8a80";
    g.fillText("empty · waiting", 12, 70);
  }
}

/** The pools' 24 h flows, a column of figures. */
function drawFlows(g: CanvasRenderingContext2D, W: number, H: number) {
  g.fillStyle = "#06080e";
  g.fillRect(0, 0, W, H);
  g.fillStyle = "#3ef0ff";
  g.fillRect(0, 0, W, 5);
  g.font = `800 26px ${SANS}`;
  g.fillText("24H FLOW", 14, 44);
  const P = Market.state.pools;
  if (!P) return;
  POOLS.forEach((k, i) => {
    const y = 90 + i * 104;
    const ch = (P.change_24h[k] ?? 0) / 1e8;
    g.fillStyle = POOL_COLOR[k];
    g.font = `800 24px ${SANS}`;
    g.fillText(POOL_NAME[k].toUpperCase(), 14, y);
    g.fillStyle = ch > 0 ? "#3ee08f" : ch < 0 ? "#ff5d6c" : "#8f8a80";
    g.font = `800 30px ${MONO}`;
    g.fillText(`${ch >= 0 ? "+" : "−"}${Math.abs(ch).toLocaleString("en-US", { maximumFractionDigits: 0 })}`, 14, y + 40);
  });
}

/** Seconds since the last block, big. */
function drawClock(g: CanvasRenderingContext2D, W: number, H: number, k: SkyKit) {
  g.fillStyle = "#06080e";
  g.fillRect(0, 0, W, H);
  g.fillStyle = "#3ef0ff";
  g.fillRect(0, 0, W, 5);
  g.font = `800 26px ${SANS}`;
  g.fillText("LAST BLOCK", 14, 44);
  const b = k.blocks[0];
  const t = k.ctx.director.lastBlockTime || (b ? Date.parse(b.time) : 0);
  g.fillStyle = "#f2eee6";
  g.font = `800 34px ${MONO}`;
  g.fillText(`#${num(k.height)}`, 14, 100);
  if (t) {
    const s = Math.max(0, Math.round((Date.now() - t) / 1000));
    g.fillStyle = s < 75 ? "#3ee08f" : "#f4b728";
    g.font = `800 96px ${MONO}`;
    g.fillText(`${s}`, 14, 260);
    g.font = `700 26px ${MONO}`;
    g.fillStyle = "#8f8a80";
    g.fillText("SECONDS AGO", 14, 300);
  }
  g.fillStyle = "#8f8a80";
  g.font = `700 24px ${MONO}`;
  g.fillText("POOL", 14, 400);
  g.fillStyle = "#f2eee6";
  g.font = `800 28px ${MONO}`;
  g.fillText((b?.miner_pool ?? "unknown").slice(0, 12), 14, 440);
  g.fillStyle = "#8f8a80";
  g.font = `700 24px ${MONO}`;
  g.fillText("TXS", 14, 520);
  g.fillStyle = "#f2eee6";
  g.font = `800 40px ${MONO}`;
  g.fillText(b?.tx_count ? String(b.tx_count) : "·", 14, 570);
}
