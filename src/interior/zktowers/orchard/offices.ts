import * as THREE from "three";
import { Market } from "../../../data/market";
import { bookshelf, chair, coffeeMachine, plant } from "../../furniture";
import { clubChair, writingDesk } from "../../hotel/furniture";
import { drawMarket, drawPools, drawPrice, drawSupply, drawTape, tape } from "../../reserve/data";
import { drawBlocks, drawTicker, GOLD, num, Surface, usd, type SkyKit } from "../kit";
import { DECO, panelling } from "./art";
import { F, LIFT } from "./levels";

/**
 * Floor 18: Orchard Capital, a fund's trading floor in an art-deco tower. Walnut core with the
 * brass lifts and the firm's name in gold, glass on three sides onto Midtown (the Needle right
 * there to the east), three benches of traders with their screens (price, pools, blocks, supply),
 * a video wall, the ticker running round the core, the partner's corner office with its bar
 * cart, the glass meeting room, the coffee point.
 */

const f = F.offices;
const X0 = -12,
  X1 = 12,
  Z0 = -20,
  Z1 = 0,
  H = 3.8;

export function offices(k: SkyKit) {
  const g = k.groups[f];
  const y0 = k.y(f);

  // ---- slab, carpet, ceiling --------------------------------------------------------------------
  k.box(f, X1 - X0, 0.1, Z1 - Z0, 0, -0.1, (Z0 + Z1) / 2, "#2a2630", "matte");
  k.box(f, X1 - X0 - 2, 0.012, Z1 - Z0 - 2, 0, 0, (Z0 + Z1) / 2, "#33303a", "matte");
  // a walnut walkway round the floor along the glass
  for (const [w, d, x, z] of [
    [X1 - X0, 1.0, 0, Z0 + 0.5],
    [X1 - X0, 1.0, 0, Z1 - 0.5],
    [1.0, Z1 - Z0, X1 - 0.5, -10],
  ] as const)
    k.box(f, w, 0.016, d, x, 0, z, "#5a3a22", "polish");
  k.box(f, X1 - X0, 0.2, Z1 - Z0, 0, H, (Z0 + Z1) / 2, "#1c1a20", "matte");
  // light slots in a deco grid, a gold cornice
  for (let x = -8; x <= 9; x += 4.25) k.box(f, 0.14, 0.02, 17, x, H - 0.02, -10, "#fff2dc", "glow");
  for (const z of [-16, -10, -4]) k.box(f, 21, 0.02, 0.08, 0.5, H - 0.03, z, "#c9a24a", "glow");
  k.box(f, X1 - X0, 0.12, 0.12, 0, H - 0.12, Z0 + 0.1, "#c9a24a", "metal");
  k.box(f, X1 - X0, 0.12, 0.12, 0, H - 0.12, Z1 - 0.1, "#c9a24a", "metal");

  // ---- the walnut core with the lifts, the firm's name, the ticker -----------------------------
  const walnut = new THREE.MeshStandardMaterial({ map: panelling("#4a2e1c", "#b08a3a", 10, 2), roughness: 0.45 });
  k.wall(f, X0, Z0, X0, Z1, H, "#3a2416", "polish", 0.3);
  const core = k.plane(f, Z1 - Z0, H, walnut, X0 + 0.16, H / 2, (Z0 + Z1) / 2, 0, Math.PI / 2);
  void core;
  k.lifts(f, X0 + 0.15, -10, Math.PI / 2, LIFT);
  k.label(f, "ORCHARD CAPITAL", X0 + 0.2, 2.4, -16.6, { h: 0.42, color: GOLD, ry: Math.PI / 2, font: `800 96px ${DECO}` });
  k.label(f, "SHIELDED ASSET MANAGEMENT · EST. BLOCK 1,687,104", X0 + 0.2, 1.95, -16.6, { h: 0.12, color: "#c9a24a", ry: Math.PI / 2 });
  // reception: a curved walnut and brass desk in front of the name
  for (let i = 0; i < 5; i++) {
    const a = -0.6 + (i / 4) * 1.2;
    k.box(f, 0.8, 1.05, 0.5, X0 + 2.6 + Math.cos(a) * 0.2, 0, -16.6 + Math.sin(a) * 1.6, "#4a2e1c", "polish", a + Math.PI / 2);
    k.box(f, 0.84, 0.05, 0.62, X0 + 2.6 + Math.cos(a) * 0.2, 1.05, -16.6 + Math.sin(a) * 1.6, "#d9b25a", "metal", a + Math.PI / 2);
  }
  k.solid(f, X0 + 2.2, -18.4, X0 + 3.1, -14.8);
  // the ticker round the top of the core
  const tapeS = new Surface(2048, 64, 1.2);
  tapeS.tex.wrapS = THREE.RepeatWrapping;
  tapeS.tex.repeat.x = 2;
  tapeS.draw((c, W, Hh) => drawTape(c, W, Hh, tape(k.height)));
  k.plane(f, Z1 - Z0 - 0.4, 0.28, tapeS.mat, X0 + 0.18, H - 0.35, -10, 0, Math.PI / 2);
  let acc = 0;
  k.ticks[f].push((dt) => {
    tapeS.tex.offset.x = (tapeS.tex.offset.x + dt * 0.03) % 1;
    acc += dt;
    if (acc > 20) {
      acc = 0;
      tapeS.draw((c, W, Hh) => drawTape(c, W, Hh, tape(k.height)));
    }
  });

  // ---- glass on three sides ---------------------------------------------------------------------
  k.curtain(f, X0, Z0, X1, Z0, H, "#b08a3a", 2);
  k.curtain(f, X1, Z0, X1, -14, H, "#b08a3a", 2);
  k.curtain(f, X1, -6, X1, Z1, H, "#b08a3a", 2);
  k.curtain(f, X0, Z1, X1, Z1, H, "#b08a3a", 2);
  // the radiator benches under the windows (walnut, brass grilles)
  for (const [w, d, x, z] of [
    [X1 - X0 - 0.6, 0.4, 0, Z0 + 0.3],
    [X1 - X0 - 0.6, 0.4, 0, Z1 - 0.3],
  ] as const) {
    k.box(f, w, 0.42, d, x, 0, z, "#4a2e1c", "polish");
    k.box(f, w, 0.04, d + 0.04, x, 0.42, z, "#3a2416", "polish");
  }

  // ---- the video wall on the east: price, pools, blocks ---------------------------------------
  k.wall(f, X1, -14, X1, -6, H, "#3a2416", "polish", 0.3);
  k.plane(f, 8, H, walnut, X1 - 0.16, H / 2, -10, 0, -Math.PI / 2);
  const panels: [number, (c: CanvasRenderingContext2D, W: number, Hh: number) => void][] = [
    [-12.2, (c, W, Hh) => drawPools(c, W, Hh)],
    [-10, (c, W, Hh) => drawPrice(c, W, Hh, "ZEC / USD")],
    [-7.8, (c, W, Hh) => drawBlocks(c, W, Hh, k.blocks, { title: "BLOCKS" })],
  ];
  for (const [z, draw] of panels) {
    const s = k.screen(f, 2.1, 1.3, draw, 6, 768);
    s.position.set(X1 - 0.32, y0 + 1.95, z);
    s.rotation.y = -Math.PI / 2;
    k.box(f, 0.08, 1.4, 2.2, X1 - 0.25, 1.25, z, "#0c0c10", "polish");
  }
  k.box(f, 0.1, 0.06, 6.8, X1 - 0.24, 2.68, -10, "#d9b25a", "metal");
  k.label(f, "MARKETS", X1 - 0.3, 3.0, -10, { h: 0.2, color: GOLD, ry: -Math.PI / 2, font: `800 96px ${DECO}` });
  k.hit(f, 0.4, 1.4, 6.6, X1 - 0.5, 1.25, -10, `<b>The video wall</b><span>price · pools · blocks</span>`, () => {
    return {
      eyebrow: "Orchard Capital · markets",
      title: k.price ? `ZEC ${usd(k.price)}` : "ZEC",
      mono: true,
      stats: [
        ["Block", `#${num(k.height)}`],
        ["Pool", k.blocks[0]?.miner_pool ?? "—"],
      ],
    };
  });

  // ---- the trading benches: three double rows, screens on each seat ----------------------------
  const surfaces = [new Surface(512, 320, 1.05), new Surface(512, 320, 1.05), new Surface(512, 320, 1.05), new Surface(512, 320, 1.05)];
  const redraw = () => {
    surfaces[0].draw((c, W, Hh) => drawPrice(c, W, Hh, "ZEC"));
    surfaces[1].draw((c, W, Hh) => drawPools(c, W, Hh, "POOLS"));
    surfaces[2].draw((c, W, Hh) => drawBlocks(c, W, Hh, k.blocks));
    surfaces[3].draw((c, W, Hh) => (Math.floor(Date.now() / 8000) % 2 ? drawSupply(c, W, Hh, k.height) : drawMarket(c, W, Hh)));
  };
  redraw();
  void document.fonts?.ready.then(redraw);
  let racc = 0;
  k.ticks[f].push((dt) => {
    racc += dt;
    if (racc > 5) {
      racc = 0;
      redraw();
    }
  });
  const monGeo = new THREE.PlaneGeometry(0.56, 0.35);
  const mons = surfaces.map((s) => ({ s, at: [] as THREE.Matrix4[] }));
  const ROWS = [-6.2, -1.4, 3.4];
  const SEATS = [-16, -13.6, -11.2, -8.8, -6.4, -4];
  let seat = 0;
  const q = new THREE.Quaternion();
  for (const rx of ROWS) {
    // the bench: a long walnut top on brass legs, a privacy screen down the middle
    k.box(f, 1.7, 0.05, 13.6, rx, 0.72, -10, "#5a3a22", "polish");
    k.box(f, 1.74, 0.03, 13.64, rx, 0.69, -10, "#b08a3a", "metal");
    for (const z of [-16.7, -10, -3.3]) for (const s of [-1, 1]) k.box(f, 0.06, 0.7, 0.06, rx + s * 0.75, 0, z, "#b08a3a", "metal");
    k.box(f, 0.04, 0.3, 13.6, rx, 0.77, -10, "#1a1820", "matte");
    k.solid(f, rx - 0.9, -16.9, rx + 0.9, -3.1);
    for (const z of SEATS)
      for (const side of [-1, 1]) {
        // two screens per seat on a bar, facing the trader
        const ry = side < 0 ? -Math.PI / 2 : Math.PI / 2;
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry);
        for (const dz of [-0.3, 0.3]) {
          const x = rx + side * 0.12,
            zz = z + dz;
          k.box(f, 0.03, 0.4, 0.6, x - side * 0.02, 0.98, zz, "#0c0c10", "polish");
          const m = new THREE.Matrix4().compose(new THREE.Vector3(x + side * 0.0, y0 + 1.18, zz), q, new THREE.Vector3(1, 1, 1));
          mons[(seat + (dz > 0 ? 1 : 0)) % mons.length].at.push(m);
        }
        k.box(f, 0.05, 0.25, 0.05, rx, 0.75, z, "#2a2830", "metal");
        // keyboard, a phone, a coffee cup
        k.box(f, 0.18, 0.02, 0.42, rx + side * 0.55, 0.75, z, "#1a1820", "matte");
        if (seat % 3 === 0) k.cyl(f, 0.04, 0.04, 0.1, rx + side * 0.6, 0.75, z + 0.42, "#f2ede0", "matte", 8);
        if (seat % 4 === 1) k.box(f, 0.16, 0.06, 0.2, rx + side * 0.55, 0.75, z - 0.42, "#2a2830", "matte");
        k.vox(f, "orch-ochair", () => chair("#1c1a22", true), rx + side * 1.2, z, side < 0 ? Math.PI / 2 : -Math.PI / 2, { solid: false });
        seat++;
      }
  }
  for (const { s, at } of mons) {
    const im = new THREE.InstancedMesh(monGeo, s.mat, at.length);
    at.forEach((m, i) => im.setMatrixAt(i, m));
    im.raycast = () => {};
    g.add(im);
  }
  k.hit(f, 12, 1.4, 14, -1.4, 0.7, -10, `<b>The trading desks</b><span>Orchard Capital</span>`, () => ({
    eyebrow: "Orchard Capital · 18",
    title: k.price ? `ZEC ${usd(k.price)}` : "ZEC",
    mono: true,
    stats: [
      ["24h", Market.state.price ? `${Market.state.price.usd_24h_change >= 0 ? "+" : ""}${Market.state.price.usd_24h_change.toFixed(2)}%` : "—"],
      ["Shielded", Market.state.pools ? `${(Market.state.pools.shielded_ratio * 100).toFixed(1)}%` : "—"],
      ["Block", `#${num(k.height)}`],
    ],
  }));

  // ---- the partner's corner office (north-east, glass walls) ----------------------------------
  {
    const ox0 = 6,
      oz1 = -14.6;
    k.curtain(f, ox0, Z0, ox0, oz1 - 1.2, H, "#b08a3a", 1.4);
    k.curtain(f, ox0, oz1, X1, oz1, H, "#b08a3a", 1.4);
    k.box(f, 0.08, H, 1.2, ox0, 0, oz1 - 0.6, "#b08a3a", "metal");
    k.box(f, 5.8, 0.02, 5.2, 9, 0.016, -17.4, "#6a1a1a", "matte");
    k.vox(f, "orch-wdesk", () => writingDesk(), 9.4, -18.2, 0);
    k.vox(f, "orch-club", () => clubChair("#5a1a14"), 9.4, -19.1, 0, { solid: false });
    k.vox(f, "orch-club2", () => clubChair("#1a1418"), 8.4, -16.2, Math.PI);
    k.vox(f, "orch-club2", () => clubChair("#1a1418"), 10.4, -16.2, Math.PI);
    k.vox(f, "orch-books", () => bookshelf(5, 16), ox0 + 0.4, -18.2, Math.PI / 2);
    // the bar cart: brass, decanters
    k.box(f, 0.8, 0.04, 0.45, 11.2, 0.75, -15.3, "#d9b25a", "metal");
    k.box(f, 0.8, 0.04, 0.45, 11.2, 0.3, -15.3, "#d9b25a", "metal");
    for (const s of [-1, 1]) k.box(f, 0.03, 0.8, 0.03, 11.2 + s * 0.38, 0, -15.3, "#d9b25a", "metal");
    for (let i = 0; i < 3; i++) k.cyl(f, 0.07, 0.05, 0.24, 10.95 + i * 0.25, 0.79, -15.3, ["#8a4a1a", "#c8d8e8", "#a86a2a"][i], "glass", 10);
    const tick = k.screen(f, 0.5, 0.32, (c, W, Hh) => drawTicker(c, W, Hh), 5, 256);
    tick.position.set(9.4, y0 + 1.22, -18.45);
    k.label(f, "MANAGING PARTNER", ox0 + 1.1, 2.2, oz1 + 0.04, { h: 0.1, color: GOLD });
  }

  // ---- the meeting room (south-east, glass) ---------------------------------------------------
  {
    const mx0 = 5,
      mz0 = -5;
    k.curtain(f, mx0, mz0, mx0, Z1, H, "#b08a3a", 1.25);
    k.curtain(f, mx0 + 1.4, mz0, X1, mz0, H, "#b08a3a", 1.4);
    k.box(f, 4.6, 0.06, 1.3, 8.6, 0.74, -2.6, "#2a1a12", "polish");
    k.box(f, 4.2, 0.72, 0.6, 8.6, 0, -2.6, "#1a1210", "polish");
    k.solid(f, 6.3, -3.25, 10.9, -1.95);
    for (let i = 0; i < 4; i++)
      for (const s of [-1, 1]) k.vox(f, "orch-mchair", () => chair("#5a1a14", true), 6.9 + i * 1.15, -2.6 + s * 1.05, s > 0 ? Math.PI : 0, { solid: false });
    const scr = k.screen(f, 2.0, 1.15, (c, W, Hh) => drawPools(c, W, Hh, "ORCHARD POOL REPORT"), 8, 768);
    scr.position.set(X1 - 0.35, y0 + 1.7, -2.6);
    scr.rotation.y = -Math.PI / 2;
    k.label(f, "BOARDROOM", mx0 + 0.05, 2.5, -1.4, { h: 0.12, color: GOLD, ry: -Math.PI / 2 });
  }

  // ---- the coffee point by the lifts, plants -----------------------------------------------------
  k.box(f, 2.2, 0.92, 0.6, -9.6, 0, -1.0, "#3a2416", "polish");
  k.box(f, 2.24, 0.04, 0.64, -9.6, 0.92, -1.0, "#e8e2d4", "polish");
  k.vox(f, "orch-coffee", () => coffeeMachine(), -10.1, -1.05, Math.PI, { dy: 0.96, solid: false });
  k.solid(f, -10.7, -1.3, -8.5, -0.7);
  for (const [x, z, s] of [
    [-10.8, -19, 1],
    [4.6, -19, 2],
    [-10.8, -4.0, 3],
    [4.4, -1.0, 4],
  ] as const)
    k.vox(f, "orch-plant" + (s % 2), () => plant(s % 2 ? "monstera" : "ficus", s), x, z);

  k.light(f, -3, 3.3, -14, "#fff0dc", 9, 16);
  k.light(f, -3, 3.3, -5, "#fff0dc", 9, 16);
  k.light(f, 9, 3.2, -17.4, "#ffd9a0", 6, 9);
  k.light(f, 8.6, 3.2, -2.6, "#ffe6c0", 5, 8);

  // ---- people -----------------------------------------------------------------------------------
  k.onCast(f, () => {
    const lines = [
      () => (k.price ? `ZEC at ${usd(k.price)}. Hold the line.` : "Waiting on the feed."),
      "Moving the book into Orchard.",
      () => `New block, #${num(k.height)}. Shipping it.`,
      "My client wants privacy. Shielded, done.",
      "Who touched my second monitor?",
      "Sapling to Orchard migration: 80% done.",
    ];
    const traders: [number, number, number, number][] = [
      [ROWS[0], -13.6, -1, 1021],
      [ROWS[0], -8.8, 1, 1022],
      [ROWS[1], -16, -1, 1023],
      [ROWS[1], -6.4, -1, 1024],
      [ROWS[2], -11.2, 1, 1025],
      [ROWS[2], -4, -1, 1026],
    ];
    const ppl = traders.map(([rx, z, side, id], i) => k.person(f, id, [rx + side * 1.2, z], "Trader", { face: [-side, 0], sit: true, lines: [lines[i % lines.length], lines[(i + 3) % lines.length]], near: 5, every: [12, 20] }));
    const a = k.person(f, 1101, [ROWS[1] - 1.0, -10.4], "Analyst", { face: [1, 0] });
    const b = k.person(f, 1102, [ROWS[1] - 1.1, -11.6], "Portfolio manager", { face: [1, 0.2] });
    k.dialog(f, [a, b], [
      [0, () => (k.price ? `ZEC's at ${usd(k.price)}.` : "The feed's slow.")],
      [1, "And the shielded pools?"],
      [0, "Orchard's growing again."],
      [1, "Good. Keep the book private."],
      [0, "Always. Not even the auditors see it."],
    ], { near: 10 });
    void ppl;
    void k.person(f, 2201, [X0 + 1.8, -16.6], "Receptionist", { face: [1, 0], lines: ["Welcome to Orchard Capital.", "The partner will see you now. Corner office.", "Coffee's by the lifts."] });
    void k.person(f, 2202, [9.4, -19.4], "Managing partner", { face: [0, 1], sit: true, lines: ["Buy the rumour, shield the news.", "This office has the best view of the Needle.", "Our fees are public. Our clients aren't."] });
    const c = k.person(f, 2301, [7.5, -1.5], "Lawyer", { face: [0, -1], sit: true });
    const d = k.person(f, 2302, [9.8, -3.7], "Client", { face: [0, 1], sit: true });
    k.dialog(f, [c, d], [
      [1, "Can the auditors see my balance?"],
      [0, "With your viewing key, yes. Without it, no."],
      [1, "Then I keep the key."],
      [0, "That's the whole point."],
    ], { near: 8 });
    void k.person(f, 2401, [-7.6, -1.6], "Intern", { face: [-1, 0], wander: [[-7.6, -1.6], [-8.2, -8], [0, -18.6], [-3.8, -1.6]], lines: ["Coffee run! Who wants what?", "Is it always this busy after a block?"] });
  });
}
