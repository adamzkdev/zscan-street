import * as THREE from "three";
import { Market } from "../../../data/market";
import { backBar, barCounter, grandPiano, pianoBench, rug, stool } from "../../furniture";
import { clubChair, sideTable, wineWall } from "../../hotel/furniture";
import { sideLamp } from "../../needle/props";
import { drawTicker, num, paint, type SkyKit, usd } from "../kit";
import { LIFT_DARK, liveSurface, PAL } from "./shared";

/**
 * 25 · the VIP lounge: herringbone walnut, leather club chairs round brass tables, a linear fire
 * behind glass, the walnut bar with its lit back bar, the humidor, a black grand piano by the
 * window, leather booths along the glass with their own lamps; the city all round, a hundred
 * metres down.
 */

const f = 2;
const X0 = -14,
  X1 = 14,
  Z0 = -26,
  Z1 = 0,
  H = 4.2;

export function lounge(k: SkyKit) {
  // ---- floor: walnut herringbone ---------------------------------------------------------------------
  const wood = paint(512, 512, (c, W) => {
    c.fillStyle = "#3a2418";
    c.fillRect(0, 0, W, W);
    const L = 128,
      T = 32;
    for (let j = -4; j < 20; j++)
      for (let i = -4; i < 12; i++) {
        const x = i * L + (j % 2) * T,
          y = j * T;
        const tone = ["#4a2e1e", "#553422", "#3e2618", "#5a3a26", "#462a1a"][(i * 7 + j * 3 + 100) % 5];
        c.save();
        c.translate(x, y);
        c.rotate((j % 2 ? 1 : -1) * Math.PI / 4);
        c.fillStyle = tone;
        c.fillRect(0, 0, L * 0.7, T * 0.9);
        c.strokeStyle = "rgba(0,0,0,0.35)";
        c.strokeRect(0, 0, L * 0.7, T * 0.9);
        c.restore();
      }
  }, 16, 15);
  k.flat(f, X1 - X0, Z1 - Z0, new THREE.MeshStandardMaterial({ map: wood, roughness: 0.4, metalness: 0.05 }), 0, (Z0 + Z1) / 2);
  // ceiling: dark walnut, slats, a brass cove all round
  k.box(f, X1 - X0, 0.3, Z1 - Z0, 0, H, (Z0 + Z1) / 2, "#1a120c");
  for (let x = X0 + 0.6; x < X1; x += 0.6) k.box(f, 0.12, 0.16, Z1 - Z0 - 1, x, H - 0.16, (Z0 + Z1) / 2, PAL.walnutLight, "polish");
  for (const [a, b, c, d] of [
    [X0 + 0.5, Z0 + 0.5, X1 - 0.5, Z0 + 0.5],
    [X0 + 0.5, Z1 - 0.5, X1 - 0.5, Z1 - 0.5],
    [X0 + 0.5, Z0 + 0.5, X0 + 0.5, Z1 - 0.5],
    [X1 - 0.5, Z0 + 0.5, X1 - 0.5, Z1 - 0.5],
  ] as const)
    k.wall(f, a, b, c, d, 0.04, "#ffcf8a", "glow", 0.05, H - 0.22, false);

  // ---- walls: glass round three sides, walnut at the back and the lift core -----------------------
  k.curtain(f, X0, Z1, X1, Z1, H, "#1a120c", 2.0, { sill: PAL.brass });
  k.curtain(f, X1, Z0, X1, Z1, H, "#1a120c", 2.0, { sill: PAL.brass });
  k.curtain(f, X0, Z0, X0, -11, H, "#1a120c", 2.0, { sill: PAL.brass });
  k.curtain(f, X0, -3, X0, Z1, H, "#1a120c", 2.0, { sill: PAL.brass });
  k.wall(f, X0, -11, X0, -3, H, PAL.walnut, "polish", 0.6);
  k.wall(f, X0, Z0, X1, Z0, H, PAL.walnut, "polish", 0.4);
  for (let x = X0 + 1; x < X1; x += 1.4) k.box(f, 0.05, H - 0.4, 0.06, x, 0.2, Z0 + 0.22, PAL.brass, "metal");
  k.lifts(f, X0 + 0.3, -7, Math.PI / 2, LIFT_DARK);

  // ---- the bar along the back wall --------------------------------------------------------------------
  k.vox(f, "halo-backbar", () => backBar(9), 7.5, Z0 + 0.5, 0);
  k.vox(f, "halo-bar", () => barCounter(8, "#ffcf8a"), 7.5, -22.6, Math.PI);
  k.box(f, 8.2, 0.05, 0.9, 7.5, 1.08, -22.6, "#e8e0d0", "polish");
  for (let i = 0; i < 6; i++) k.vox(f, "halo-stool", () => stool(PAL.leather), 4.4 + i * 1.25, -21.6, 0, { solid: false });
  k.label(f, "THE HALO BAR", 7.5, 3.5, Z0 + 0.25, { h: 0.34, color: "#ffcf8a" });
  // the price over the bar, small, in brass
  const tick = liveSurface(k, f, 512, 256, (c, W, Hh) => drawTicker(c, W, Hh, { bg: "#140c08", ink: "#ffe6b8", label: "ZEC · TONIGHT" }), 6, 0.9);
  k.plane(f, 1.6, 0.8, tick.mat, 1.5, 2.6, Z0 + 0.25);
  k.box(f, 1.7, 0.9, 0.04, 1.5, 2.15, Z0 + 0.22, PAL.brass, "metal");
  // the humidor: a glass cabinet of cedar boxes
  k.vox(f, "halo-humidor", () => wineWall(3, 2.6), -2.6, Z0 + 0.45, 0);
  k.label(f, "HUMIDOR", -2.6, 2.85, Z0 + 0.72, { h: 0.18, color: "#ffcf8a" });

  // ---- the booths along the window, west side ---------------------------------------------------------
  const BZ = [-23.2, -19.4, -15.6];
  BZ.forEach((z, i) => {
    const x0 = X0 + 0.3;
    // U banquette: back along the glass, arms either side
    k.box(f, 0.5, 1.25, 3.0, x0 + 0.25, 0, z, PAL.leatherDark, "polish");
    k.box(f, 0.6, 0.45, 3.0, x0 + 0.8, 0, z, PAL.leather, "polish");
    for (const s of [-1, 1]) {
      k.box(f, 2.3, 1.25, 0.5, x0 + 1.15, 0, z + s * 1.35, PAL.leatherDark, "polish");
      k.box(f, 2.0, 0.45, 0.6, x0 + 1.3, 0, z + s * 0.85, PAL.leather, "polish");
    }
    // buttons on the backs
    for (let b = 0; b < 6; b++) k.box(f, 0.02, 0.04, 0.04, x0 + 0.52, 0.65 + (b % 2) * 0.3, z - 1.1 + b * 0.44, PAL.brass, "metal");
    // the table, a lamp on it
    k.box(f, 1.1, 0.06, 1.0, x0 + 1.75, 0.72, z, PAL.walnutLight, "polish");
    k.cyl(f, 0.07, 0.07, 0.72, x0 + 1.75, 0, z, PAL.brass, "metal", 10);
    k.cyl(f, 0.05, 0.05, 0.3, x0 + 1.75, 0.78, z - 0.25, PAL.brass, "metal", 8);
    k.cyl(f, 0.14, 0.08, 0.14, x0 + 1.75, 1.06, z - 0.25, "#ffd8a0", "glow", 12);
    // the walnut partition between booths, brass capped
    if (i < BZ.length) {
      k.box(f, 2.6, 1.8, 0.12, x0 + 1.3, 0, z - 1.75, PAL.walnut, "polish");
      k.box(f, 2.6, 0.04, 0.16, x0 + 1.3, 1.8, z - 1.75, PAL.brass, "metal");
    }
    k.solid(f, X0, z - 1.6, x0 + 2.4, z + 1.6);
    k.hit(f, 2.4, 1.3, 3, x0 + 1.2, 0, z, `<b>Private booth ${i + 1}</b><span>window seat</span>`, () => ({ eyebrow: "ZK TOWER HALO · VIP lounge", title: `Booth ${i + 1}`, stats: [["Seats", "4"], ["Minimum", "shielded"], ["View", "Wall Street"]] }));
  });

  // ---- the fire: a linear fireplace in a stone plinth, the club chairs round it ----------------------
  const FX = 2,
    FZ = -13.4;
  k.box(f, 5.6, 0.5, 1.0, FX, 0, FZ, "#2a2420", "polish");
  k.box(f, 5.2, 0.06, 0.4, FX, 0.5, FZ, "#0a0806", "matte");
  k.box(f, 5.6, 0.7, 0.03, FX, 0.5, FZ - 0.48, "#e8c890", "glass");
  k.box(f, 5.6, 0.7, 0.03, FX, 0.5, FZ + 0.48, "#e8c890", "glass");
  const flame = new THREE.Mesh(new THREE.BoxGeometry(5.0, 0.32, 0.12), new THREE.MeshBasicMaterial({ color: new THREE.Color("#ff8a2a").multiplyScalar(2.2), toneMapped: false }));
  flame.raycast = () => {};
  k.add(f, flame, FX, 0.72, FZ);
  const flame2 = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.2, 0.08), new THREE.MeshBasicMaterial({ color: new THREE.Color("#ffd24a").multiplyScalar(2.4), toneMapped: false }));
  flame2.raycast = () => {};
  k.add(f, flame2, FX, 0.62, FZ);
  const fire = k.light(f, FX, 1.2, FZ, "#ff9a4a", 10, 9);
  k.ticks[f].push((_dt, t) => {
    const s = 0.8 + Math.sin(t * 7.3) * 0.12 + Math.sin(t * 13.1) * 0.08;
    flame.scale.y = s;
    flame2.scale.y = 1.6 - s * 0.6;
    if (fire) fire.intensity = 8 + s * 4;
  });
  k.solid(f, FX - 2.85, FZ - 0.55, FX + 2.85, FZ + 0.55);

  const group = (cx: number, cz: number, key: string, ids: number) => {
    k.vox(f, `halo-rug${key}`, () => rug(4.2, 3.6, "#2a1a14", "#c9a24a"), cx, cz, 0, { solid: false });
    k.vox(f, "halo-sidetable", () => sideTable(false), cx, cz, 0);
    for (const [dx, dz, ry] of [
      [-1.1, 0, Math.PI / 2],
      [1.1, 0, -Math.PI / 2],
      [0, -1.1, 0],
      [0, 1.1, Math.PI],
    ] as const)
      k.vox(f, `halo-club${ids % 2}`, () => clubChair(ids % 2 ? PAL.leather : "#2a1810"), cx + dx, cz + dz, ry);
    k.vox(f, "halo-lamp", sideLamp, cx + 1.3, cz - 1.3);
  };
  group(-1.6, -8.6, "a", 0);
  group(5.6, -8.6, "b", 1);
  group(9.4, -16.8, "c", 0);

  // ---- the piano by the front window ----------------------------------------------------------------
  k.vox(f, "halo-piano", grandPiano, -6.4, -4.2, Math.PI, { k: 0.55 });
  k.vox(f, "halo-pbench", pianoBench, -6.4, -2.2, Math.PI, { solid: false });
  k.hit(f, 1.8, 1.4, 2.4, -6.4, 0, -4.2, `<b>The grand piano</b><span>tonight: jazz</span>`, () => ({ eyebrow: "ZK TOWER HALO · VIP lounge", title: "Grand piano", stats: [["Tonight", "jazz standards"], ["Requests", "tip in ZEC"]] }));

  // pendants over the club chairs and the bar
  for (const [x, z] of [
    [-1.6, -8.6],
    [5.6, -8.6],
    [9.4, -16.8],
    [5, -22.6],
    [8, -22.6],
    [11, -22.6],
  ] as const) {
    k.cyl(f, 0.01, 0.01, 1.1, x, H - 1.1, z, "#1a120c", "matte", 4);
    k.cyl(f, 0.22, 0.08, 0.22, x, H - 1.32, z, PAL.brass, "metal", 16);
    k.cyl(f, 0.18, 0.18, 0.02, x, H - 1.34, z, "#ffd8a0", "glow", 16);
  }

  // ---- light: warm and low ----------------------------------------------------------------------------
  k.light(f, 7.5, 3, -22, "#ffc890", 12, 12);
  k.light(f, -10.5, 2.2, -19.4, "#ffb878", 8, 9);
  k.light(f, 2, 3, -8.6, "#ffd0a0", 10, 12);
  k.light(f, -6.4, 3, -3.6, "#ffd8b0", 8, 9);
  k.light(f, 9.4, 3, -16.8, "#ffd0a0", 8, 10);

  // ---- people ---------------------------------------------------------------------------------------
  const p = () => Market.state.price;
  k.onCast(f, () => {
    void k.person(f, 1717, [7.5, -24.4], "Bartender", { face: [0, 1], wander: [[5, -24.4], [7.5, -24.4], [10.6, -24.4]], lines: ["The Shielded Old Fashioned? Coming up.", "The bar takes ZEC. Shielded, of course.", () => (p() ? `ZEC at ${usd(p()!.usd)}. Drinks are the same price as yesterday.` : "What'll it be?")] });
    void k.person(f, 2828, [-6.4, -2.2], "Pianist", { sit: true, face: [0, -1], lines: ["This one's called 'Seventy-Five Seconds'.", "Requests in ZEC, please.", "A little Monk for the trading floor."], near: 8 });
    void k.person(f, 3939, [6.6, -21.6], "Guest", { sit: true, face: [0, -1], lines: ["One more, then the helipad.", () => `Block ${num(k.height)}. Cheers to that.`] });
    const a = k.person(f, 4040, [X0 + 1.1, -23.2], "Fund manager", { sit: true, face: [1, 0] });
    const b = k.person(f, 5151, [X0 + 2.6, -23.9], "Founder", { sit: true, face: [-1, 0.4] });
    k.dialog(f, [a, b], [
      [0, "So, your wallet: shielded by default?"],
      [1, "Orchard only. Unified addresses."],
      [0, "Then I'm in."],
      [1, "Shake on it. No viewing key needed."],
    ], { near: 9 });
    const c = k.person(f, 6262, [-1.6, -9.7], "Collector", { sit: true, face: [0, 1] });
    const d = k.person(f, 7373, [-1.6, -7.5], "Collector", { sit: true, face: [0, -1] });
    k.dialog(f, [c, d], [
      [0, "I bought a zkSNARK today. A rare one."],
      [1, "Which number?"],
      [0, "That's private."],
      [1, "Of course it is."],
    ]);
    void k.person(f, 8484, [5.6, -9.7], "Guest", { sit: true, face: [0, 1], lines: ["The view from 25 never gets old.", "I can see the Needle from here."] });
    void k.person(f, 9595, [2, -11.6], "Host", { wander: [[2, -11.6], [-3, -16], [4, -19.6], [-9, -6]], lines: ["Welcome to the lounge. Booth or bar?", "The fire's real. The bill's shielded."] });
  });
}
