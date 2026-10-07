import * as THREE from "three";
import { Market } from "../../../data/market";
import { drawPools, drawPrice, priceInfo, poolsInfo } from "../../reserve/data";
import { indoorTree, receptionDesk, turnstile } from "../../furniture";
import { loungeSofa, sideLamp } from "../../needle/props";
import { drawBlocks, MONO, num, type SkyKit } from "../kit";
import { LIFT, liveSurface, outline, PAL, stoneTex, tapeBand, triPoints, triSlab } from "./shared";

/**
 * G · the lobby: white stone under a ceiling of rounded triangles that turn as they climb to the
 * oculus (the tower's twist, seen from inside), the chart wall at the back (blocks, ZEC, pools and
 * the tape), the security line, reception, a lounge, olive trees; glass onto the avenue.
 */

const f = 0;
const X0 = -15,
  X1 = 15,
  Z0 = -28,
  Z1 = 0,
  H = 9;

export function lobby(k: SkyKit) {
  const g = k.groups[f];

  // ---- floor, ceiling ------------------------------------------------------------------------------
  const floor = new THREE.MeshStandardMaterial({ map: stoneTex(5, 9), roughness: 0.18, metalness: 0.05 });
  k.flat(f, X1 - X0, Z1 - Z0, floor, 0, (Z0 + Z1) / 2);
  k.box(f, X1 - X0, 0.3, Z1 - Z0, 0, H, (Z0 + Z1) / 2, "#f4f4f2");

  // ---- the walls: glass to the street and the sides, stone at the back -----------------------------
  k.curtain(f, X0, Z1, -2.2, Z1, H, PAL.chrome, 2.2, { transom: 3.4 });
  k.curtain(f, 2.2, Z1, X1, Z1, H, PAL.chrome, 2.2, { transom: 3.4 });
  // the door: revolving drum, its canopy; the way out stays shut (you leave with Exit)
  k.cyl(f, 1.9, 1.9, 0.08, 0, 0, Z1, "#9aa0a8", "metal", 32);
  k.cyl(f, 1.9, 1.9, 0.2, 0, 3.0, Z1, PAL.chrome, "metal", 32);
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(1.85, 1.85, 3, 32, 1, true), new THREE.MeshStandardMaterial({ color: "#cfe4f4", transparent: true, opacity: 0.16, roughness: 0.05, side: THREE.DoubleSide, depthWrite: false }));
  drum.raycast = () => {};
  k.add(f, drum, 0, 1.5, Z1);
  const wings = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const w = new THREE.Mesh(new THREE.BoxGeometry(0.04, 2.9, 1.8), new THREE.MeshStandardMaterial({ color: "#cfe4f4", transparent: true, opacity: 0.25, roughness: 0.05 }));
    w.position.set(Math.sin((i * Math.PI) / 2) * 0.9, 1.45, Math.cos((i * Math.PI) / 2) * 0.9);
    w.rotation.y = (i * Math.PI) / 2;
    w.raycast = () => {};
    wings.add(w);
  }
  k.add(f, wings, 0, 0, Z1);
  k.ticks[f].push((dt) => (wings.rotation.y += dt * 0.25));
  k.solid(f, -2.2, Z1 - 0.2, 2.2, Z1 + 2);
  k.curtain(f, X0, Z0, X0, Z1, H, PAL.chrome, 2.4, { transom: 3.4 });
  k.curtain(f, X1, Z0, X1, Z1, H, PAL.chrome, 2.4, { transom: 3.4 });
  k.wall(f, X0, Z0, X1, Z0, H, PAL.stone, "polish", 0.4);
  // stone fins up the back wall
  for (let x = -14; x <= 14; x += 2) if (Math.abs(x) > 11.6) k.box(f, 0.14, H, 0.2, x, 0, Z0 + 0.3, PAL.stoneShade, "polish");

  // ---- the spiral ceiling: rounded triangles turning as they climb, cyan on their lips --------------
  const CX = 0,
    CZ = -13;
  for (let i = 0; i < 12; i++) {
    const R = 12.5 - i * 0.85;
    const rot = i * 0.17;
    const y = 6.0 + i * 0.25;
    const pts = triPoints(R, rot, 60);
    outline(k, f, pts, CX, CZ, y, 0.5, 0.22, i % 2 ? "#f6f6f4" : "#e8e8e6", "matte");
    outline(k, f, triPoints(R - 0.24, rot, 60), CX, CZ, y - 0.03, 0.06, 0.05, i % 3 === 0 ? PAL.cyan : "#fff6e6", "glow");
  }
  // the oculus: a lit disc at the top, a ring of cyan
  k.cyl(f, 2.3, 2.3, 0.05, CX, H - 0.06, CZ, "#eaf8ff", "glow", 40);
  outline(k, f, triPoints(2.6, 2.0, 40), CX, CZ, H - 0.2, 0.12, 0.12, PAL.cyan, "glow");
  // the floor inlay under it: the same triangles in cyan and grey
  outline(k, f, triPoints(9.5, 0, 72), CX, CZ, 0.005, 0.08, 0.01, PAL.cyan, "glow");
  outline(k, f, triPoints(10.1, 0, 72), CX, CZ, 0.005, 0.12, 0.01, "#9aa0a8", "polish");

  // ---- the model of the tower in the middle: thin slabs turning up a glass rod ----------------------
  {
    k.cyl(f, 1.6, 1.7, 0.5, CX, 0, CZ, "#2a2f36", "polish", 40);
    k.cyl(f, 1.62, 1.62, 0.04, CX, 0.5, CZ, PAL.cyan, "glow", 40);
    for (let i = 0; i < 20; i++) {
      const s = 1 - (i / 20) * 0.32;
      triSlab(k, f, 1.1 * s, (i / 20) * 1.9, CX, CZ, 0.6 + i * 0.11, 0.05, i % 5 === 4 ? PAL.cyan : "#dfe8f0", i % 5 === 4 ? "glow" : "metal");
    }
    const halo = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.03, 8, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color(PAL.cyan).multiplyScalar(2), toneMapped: false }));
    halo.rotation.x = Math.PI / 2;
    halo.raycast = () => {};
    k.add(f, halo, CX, 2.5, CZ);
    k.ticks[f].push((_dt, t) => (halo.position.y = k.y(f) + 2.5 + Math.sin(t * 0.8) * 0.05));
    k.cyl(f, 0.04, 0.04, 0.8, CX, 2.8, CZ, PAL.chrome, "metal", 6);
    k.ring(f, CX, CZ, 1.7);
    k.hit(f, 3.4, 5, 3.4, CX, 0, CZ, `<b>ZK TOWER HALO</b><span>the model</span>`, () => ({
      eyebrow: "ZK TOWER HALO",
      title: "Twisted glass tower",
      stats: [
        ["Height", "140 m"],
        ["Twist", "110°"],
        ["Floors", "33"],
        ["Helipad", "roof"],
      ],
    }));
  }

  // ---- the chart wall: blocks · ZEC · pools, the tape under them -------------------------------------
  const zw = Z0 + 0.4;
  const price = liveSurface(k, f, 1024, 470, (c, W, Hh) => drawPrice(c, W, Hh, "ZEC / USD"), 5);
  k.plane(f, 10.4, 4.8, price.mat, 0, 4.6, zw + 0.02);
  const blocks = liveSurface(k, f, 640, 640, (c, W, Hh) => drawBlocks(c, W, Hh, k.blocks, { title: "LAST BLOCKS", accent: PAL.cyan }), 4);
  k.plane(f, 5.2, 5.2, blocks.mat, -8.7, 4.4, zw + 0.02);
  const pools = liveSurface(k, f, 640, 640, (c, W, Hh) => drawPools(c, W, Hh, "VALUE POOLS"), 6);
  k.plane(f, 5.2, 5.2, pools.mat, 8.7, 4.4, zw + 0.02);
  // bezels
  k.box(f, 10.7, 5.1, 0.1, 0, 2.05, zw - 0.04, "#0a0c10", "polish");
  for (const x of [-8.7, 8.7]) k.box(f, 5.5, 5.5, 0.1, x, 1.65, zw - 0.04, "#0a0c10", "polish");
  tapeBand(k, f, [[-11.4, zw + 0.03, 11.4, zw + 0.03]], 1.05, 0.5);
  k.label(f, "ZK TOWER HALO", 0, 7.6, zw + 0.05, { h: 0.7, color: PAL.cyan });
  k.hit(f, 10.4, 4.8, 0.2, 0, 2.2, zw + 0.1, `<b>ZEC / USD</b><span>live</span>`, () => priceInfo());
  k.hit(f, 5.2, 5.2, 0.2, 8.7, 1.8, zw + 0.1, `<b>Value pools</b><span>live</span>`, () => poolsInfo());
  k.hit(f, 5.2, 5.2, 0.2, -8.7, 1.8, zw + 0.1, `<b>Last blocks</b><span>live</span>`, () => ({
    eyebrow: "ZK TOWER HALO · chart wall",
    title: `Block #${num(k.height)}`,
    mono: true,
    body: k.blocks
      .slice(0, 6)
      .map((b) => `<p style="font-family:${MONO}">#${num(b.height)} · ${b.miner_pool ?? "unknown"} · ${b.tx_count || "·"} tx</p>`)
      .join(""),
  }));

  // ---- the security line: turnstiles across the hall, glass barriers to the walls ------------------
  const TZ = -19.5;
  const gates = [-9.6, -7.6, -5.6, 5.6, 7.6, 9.6];
  for (const x of gates) k.vox(f, "turnstile", turnstile, x, TZ, 0);
  for (const [a, b] of [
    [X0, -10.4],
    [-4.8, 4.8],
    [10.4, X1],
  ] as const) {
    k.box(f, b - a, 1.05, 0.04, (a + b) / 2, 0, TZ, PAL.glass, "glass");
    k.box(f, b - a, 0.05, 0.08, (a + b) / 2, 1.05, TZ, PAL.chrome, "metal");
    k.solid(f, a, TZ - 0.1, b, TZ + 0.1);
  }
  k.label(f, "SECURITY · BADGES", 0, 1.35, TZ + 0.06, { h: 0.18, color: PAL.cyan });

  // ---- reception on the east side, facing the hall --------------------------------------------------
  k.vox(f, "reception", receptionDesk, 10.6, -10, -Math.PI / 2);
  k.box(f, 0.3, 3.2, 6.4, 13.8, 0, -10, PAL.walnut, "polish");
  k.label(f, "HALO", 13.62, 2.3, -10, { h: 0.6, color: PAL.cyan, ry: -Math.PI / 2 });
  k.label(f, "RECEPTION", 13.62, 1.7, -10, { h: 0.2, color: "#e8eef4", ry: -Math.PI / 2 });

  // ---- the lounge on the west side: sofas round a low table, lamps, trees ---------------------------
  k.vox(f, "halo-sofa-w", () => loungeSofa("#e8e4dc", 3), -10.4, -6.6, Math.PI / 2);
  k.vox(f, "halo-sofa-w", () => loungeSofa("#e8e4dc", 3), -6.4, -6.6, -Math.PI / 2);
  k.box(f, 1.4, 0.42, 2.4, -8.4, 0, -6.6, "#2a2f36", "polish");
  k.box(f, 1.2, 0.02, 2.2, -8.4, 0.42, -6.6, PAL.cyan, "glow");
  k.solid(f, -9.1, -7.8, -7.7, -5.4);
  k.vox(f, "halo-lamp", sideLamp, -10.6, -4.4);
  for (const [x, z, s] of [
    [-13.4, -2, 1],
    [13.4, -2, 2],
    [-13.4, -16, 3],
    [13.4, -16, 4],
  ] as const) {
    k.cyl(f, 0.7, 0.6, 0.7, x, 0, z, "#f4f4f2", "polish", 24);
    k.vox(f, `halo-tree${s}`, () => indoorTree(s), x, z, 0, { dy: 0.7, k: 0.7 });
    k.solid(f, x - 0.75, z - 0.75, x + 0.75, z + 0.75);
  }

  // ---- the lifts beyond the security line, on the west wall ----------------------------------------
  k.lifts(f, X0 + 0.2, -24, Math.PI / 2, LIFT);
  k.label(f, "TRADING 10 · VIP 25 · HELIPAD", X0 + 0.3, 5.2, -24, { h: 0.22, color: "#14202a", ry: Math.PI / 2, glow: false });

  // ---- light ----------------------------------------------------------------------------------------
  k.light(f, 0, 5.5, -13, "#f2f8ff", 18, 26);
  k.light(f, 0, 4, -22, "#e8f4ff", 14, 16);
  k.light(f, -9, 4, -6, "#ffe8cc", 14, 14);
  k.light(f, 10, 4, -9, "#ffe8cc", 14, 14);
  k.light(f, 0, 4, -3, "#ffffff", 12, 12);

  // ---- people ---------------------------------------------------------------------------------------
  const p = () => Market.state.price?.usd;
  k.onCast(f, () => {
    void k.person(f, 3301, [12.2, -10], "Receptionist", { face: [-1, 0], lines: ["Welcome to HALO. Trading is on 10, the lounge on 25.", "Badge at the gates, please.", "The helipad? Lift to the top, mind the rotor."] });
    void k.person(f, 4402, [-4.2, TZ + 0.9], "Security", { face: [0, 1], lines: ["Badge, please.", "No badge, no lift. Shielded or not.", "Nice try. The turnstile reads keys, not smiles."] });
    const a = k.person(f, 5510, [-2.6, -25.4], "Analyst", { face: [0.4, -1] });
    const b = k.person(f, 6620, [-0.8, -25.6], "Analyst", { face: [-0.4, -1] });
    k.dialog(f, [a, b], [
      [0, () => (p() ? `ZEC at $${p()!.toFixed(2)}. Not bad.` : "Waiting for the price feed.")],
      [1, () => `Block ${num(k.height)}. Another one.`],
      [0, () => `Shielded pools hold ${((Market.state.pools?.shielded_ratio ?? 0) * 100).toFixed(1)}% now.`],
      [1, "Up to the floor. The bell rings at every block."],
    ]);
    const c = k.person(f, 7731, [-9.6, -6.6], "Visitor", { sit: true, face: [1, 0] });
    const d = k.person(f, 8842, [-7.2, -6.6], "Visitor", { sit: true, face: [-1, 0] });
    k.dialog(f, [c, d], [
      [0, "The whole tower turns 110 degrees."],
      [1, "Like my portfolio."],
      [0, "Lunch at the lounge on 25?"],
      [1, "Only if it's shielded."],
    ]);
    void k.person(f, 9953, [4, -12], "Courier", { wander: [[4, -12], [8, -4], [-3, -9], [2, -16.8]], lines: ["Parcel for the trading floor.", "Signed, sealed, shielded."] });
    void k.person(f, 1207, [5.8, -23.6], "Trader", { wander: [[5.8, -23.6], [-6, -24], [-11.2, -23]], lines: ["Late again. The open was at block one.", "Coffee, then charts."] });
  });

  void g;
}
