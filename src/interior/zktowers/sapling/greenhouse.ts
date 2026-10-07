import * as THREE from "three";
import { drawPrice } from "../../reserve/data";
import { chair, coffeeMachine, plant, stool } from "../../furniture";
import { drawBlocks, drawTicker, type Line, type SkyKit } from "../kit";
import { creepers, drawSapling, GREEN, hydroRack, LIFT, meshScreen, oakTex, saplingInfo, SAP } from "./parts";

/**
 * 58 — the greenhouse: a coworking floor under a glass roof on white steel ribs. Hydroponic racks
 * glowing pink in rows on the east side (a botanist checking the lettuces), long oak work tables
 * with people coding, a glass meeting pod with the ZEC chart on its screen, a coffee bar by the
 * lifts, creepers along the ribs, the facade's red mesh outside the glass and the city beyond.
 */

const f = 2;
const H = 4.6;
const X0 = -12,
  X1 = 12,
  Z0 = -24,
  Z1 = 0;

export function greenhouse(k: SkyKit) {
  const g = k.groups[f];
  // ---- floor, the glass roof on its ribs -------------------------------------------------------
  k.flat(f, 24, 24, new THREE.MeshStandardMaterial({ map: oakTex(5, 5, "#e2c8a0"), roughness: 0.55 }), 0, -12, 0);
  k.box(f, 24, 0.04, 24, 0, H + 0.6, -12, "#cfe4e4", "glass");
  for (let z = Z0; z <= Z1; z += 2) {
    k.box(f, 24, 0.14, 0.1, 0, H, z, "#f4f4f0", "metal");
    // the pitched ribs up to the ridge
    for (const s of [-1, 1]) k.box(f, 12.2, 0.1, 0.08, s * 6, H + 0.3, z, "#f4f4f0", "metal", 0);
  }
  for (let x = X0; x <= X1; x += 3) k.box(f, 0.08, 0.1, 24, x, H + 0.5, -12, "#f4f4f0", "metal");
  // grow-light bars hanging from the ribs over the work tables
  for (let z = -4; z >= -20; z -= 4) k.box(f, 7, 0.05, 0.12, -3, H - 0.5, z, "#fff4e0", "glow");

  // ---- the shell: core wall west (the lifts), glass on three sides, the red mesh outside -------
  k.wall(f, X0, Z0, X0, Z1, H, "#e8e0d0", "matte", 0.3);
  for (let z = Z0 + 0.2; z < Z1; z += 0.3) k.box(f, 0.05, H, 0.12, X0 + 0.17, 0, z, SAP.oak);
  k.curtain(f, X0, Z1, X1, Z1, H, "#e8e8e4", 2, { transom: 2.6 });
  k.curtain(f, X1, Z1, X1, Z0, H, "#e8e8e4", 2, { transom: 2.6 });
  k.curtain(f, X1, Z0, X0, Z0, H, "#e8e8e4", 2, { transom: 2.6 });
  meshScreen(k, f, X1 + 0.7, -0.5, X1 + 0.7, -9, H + 0.6, 81, -0.3, 0.6);
  meshScreen(k, f, X1 + 0.7, -16, X1 + 0.7, -23.5, H + 0.6, 82, -0.3, 0.6);
  meshScreen(k, f, -11.5, 0.7, -5, 0.7, H + 0.6, 83, -0.3, 0.6);
  creepers(k, f, X0 + 0.5, -2, X1 - 0.5, -2, H, 1.2, 84, 0.3);
  creepers(k, f, X0 + 0.5, -22, X1 - 0.5, -22, H, 1.2, 85, 0.3);
  k.lifts(f, X0 + 0.16, -12, Math.PI / 2, LIFT);
  k.label(f, "GREENHOUSE · 58", X0 + 0.2, 4.0, -18.5, { h: 0.34, color: GREEN, ry: Math.PI / 2 });

  // ---- hydroponics: four rows of racks under pink light on the east side ----------------------
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 2; c++) {
      const z = -4 - r * 3.4,
        x = 5.6 + c * 2.5;
      k.vox(f, `sap-hydro${(r + c) % 3}`, () => hydroRack((r + c) % 3), x, z, 0);
    }
  k.box(f, 5.6, 0.02, 13.4, 6.85, 0.004, -9.1, "#d0d4d0", "polish");
  // pink glow on the floor under them
  const pink = new THREE.MeshBasicMaterial({ color: new THREE.Color("#ff6ad8").multiplyScalar(0.5), transparent: true, opacity: 0.25, toneMapped: false, depthWrite: false });
  for (let r = 0; r < 4; r++) k.flat(f, 5.2, 0.9, pink, 6.85, -4 - r * 3.4, 0.01);

  // ---- the work tables -------------------------------------------------------------------------
  const desks: [number, number, number][] = [];
  for (const z of [-5, -9.5, -14]) {
    k.box(f, 7, 0.74, 1.6, -3, 0, z, "#f4f0e8");
    k.box(f, 7.1, 0.05, 1.7, -3, 0.74, z, SAP.oak, "polish");
    for (let i = 0; i < 4; i++) {
      const x = -5.6 + i * 1.75;
      for (const s of [-1, 1]) {
        desks.push([x, z + s * 1.0, s]);
        // a laptop, its screen, a mug, a little plant
        k.box(f, 0.36, 0.02, 0.26, x, 0.79, z + s * 0.4, "#c8ccd0", "metal");
        k.box(f, 0.36, 0.24, 0.02, x, 0.8, z + s * 0.27, "#2a2c30", "metal");
        k.box(f, 0.32, 0.2, 0.005, x, 0.82, z + s * 0.28 + s * 0.012, (i + (s > 0 ? 1 : 0)) % 3 ? "#3a6a8a" : "#2a5a3a", "glow");
        if ((i + s) % 2) k.cyl(f, 0.04, 0.04, 0.1, x + 0.3, 0.79, z + s * 0.5, "#f4f0e8", "matte", 8);
        k.vox(f, "sap-chair", () => chair("#3a5a3a", true), x, z + s * 1.0, s > 0 ? Math.PI : 0, { solid: false });
      }
    }
    k.cyl(f, 0.09, 0.07, 0.16, -3, 0.79, z, "#c86a3a", "matte", 8);
    k.box(f, 0.3, 0.25, 0.3, -3, 0.95, z, "#3d9440", "matte");
    k.solid(f, -6.5, z - 0.8, 0.5, z + 0.8);
  }

  // ---- the meeting pod: glass box, a table, the chart on the screen ---------------------------
  {
    const x0 = -10.6,
      x1 = -3.6,
      z0 = -23.4,
      z1 = -18.4;
    k.box(f, x1 - x0, 0.02, z1 - z0, (x0 + x1) / 2, 0.004, (z0 + z1) / 2, "#2a3a2e", "matte");
    k.wall(f, x1, z0, x1, z1, 2.8, "#d8ecec", "glass", 0.05);
    k.wall(f, x0, z1, x1 - 1.2, z1, 2.8, "#d8ecec", "glass", 0.05);
    k.box(f, x1 - x0, 0.1, z1 - z0, (x0 + x1) / 2, 2.8, (z0 + z1) / 2, "#f4f4f0", "metal");
    k.box(f, 3.4, 0.74, 1.4, (x0 + x1) / 2, 0, -20.8, SAP.oak);
    k.solid(f, (x0 + x1) / 2 - 1.7, -21.5, (x0 + x1) / 2 + 1.7, -20.1);
    for (const dx of [-1.1, 0, 1.1]) {
      k.vox(f, "sap-chair2", () => chair("#e8e2d0", true), (x0 + x1) / 2 + dx, -19.7, Math.PI, { solid: false });
      k.vox(f, "sap-chair2", () => chair("#e8e2d0", true), (x0 + x1) / 2 + dx, -21.9, 0, { solid: false });
    }
    const s = k.screen(f, 3.0, 1.7, (c, W, Hh) => drawPrice(c, W, Hh, "ZEC / USD"), 8);
    s.position.set((x0 + x1) / 2, k.y(f) + 1.7, Z0 + 0.25);
    k.box(f, 3.2, 1.9, 0.06, (x0 + x1) / 2, 0.75, Z0 + 0.2, "#14140f");
    k.hit(f, 3, 1.7, 0.1, (x0 + x1) / 2, 0.85, Z0 + 0.3, "<b>ZEC / USD</b><span>14 days</span>", () => {
      const p = k.price;
      return { eyebrow: "Greenhouse · meeting pod", title: p ? `$${p.toFixed(2)}` : "ZEC / USD", mono: true };
    });
  }

  // ---- the coffee bar by the lifts -------------------------------------------------------------
  k.box(f, 0.7, 1.05, 4.2, -9.4, 0, -4.2, SAP.oak);
  k.box(f, 0.8, 0.05, 4.3, -9.4, 1.05, -4.2, "#f4f0e8", "polish");
  k.solid(f, -9.8, -6.3, -9.0, -2.1);
  k.vox(f, "coffeeM", () => coffeeMachine(), -9.6, -3.2, Math.PI / 2, { dy: 1.1, solid: false });
  for (let i = 0; i < 3; i++) k.vox(f, "sap-stool", () => stool("#3a5a3a"), -8.5, -2.8 - i * 1.2, 0, { solid: false });
  k.box(f, 0.05, 1.2, 3.6, X0 + 0.32, 1.6, -4.2, "#1a2a1e");
  {
    const t = k.screen(f, 1.6, 0.9, (c, W, Hh) => drawTicker(c, W, Hh, { bg: "#08120c" }), 6, 256);
    t.position.set(X0 + 0.36, k.y(f) + 2.3, -3.2);
    t.rotation.y = Math.PI / 2;
    const b = k.screen(f, 1.6, 0.9, (c, W, Hh) => drawBlocks(c, W, Hh, k.blocks, { accent: GREEN, bg: "#06100a" }), 4, 384);
    b.position.set(X0 + 0.36, k.y(f) + 2.3, -5.2);
    b.rotation.y = Math.PI / 2;
  }

  // ---- the Sapling board on a stand in the middle --------------------------------------------
  {
    k.box(f, 0.1, 1.2, 0.1, 6.85, 0, -18.6, "#2a2830", "metal");
    k.box(f, 2.6, 1.5, 0.08, 6.85, 1.2, -18.6, "#14140f");
    const s = k.screen(f, 2.4, 1.35, (c, W, Hh) => drawSapling(c, W, Hh), 10);
    s.position.set(6.85, k.y(f) + 1.95, -18.54);
    k.solid(f, 5.5, -18.8, 8.2, -18.4);
    k.hit(f, 2.4, 1.35, 0.1, 6.85, 1.27, -18.5, "<b>Sapling pool</b><span>ZEC shielded in Sapling</span>", saplingInfo);
  }
  for (const [x, z, s] of [
    [10.8, -1.2, 1],
    [-10.6, -16.6, 2],
    [10.8, -22.8, 3],
    [1.4, -1.2, 4],
  ] as const)
    k.vox(f, `sap-gh${s}`, () => plant(s % 2 ? "monstera" : "ficus", s + 20), x, z, s);

  // ---- light ------------------------------------------------------------------------------------
  k.light(f, -3, 3.8, -6, "#fff2dc", 16, 16);
  k.light(f, -3, 3.8, -15, "#fff2dc", 16, 16);
  k.light(f, 6.8, 3, -9, "#ff7ae0", 10, 12);
  k.light(f, -7, 2.4, -21, "#e8f4ff", 8, 10);
  k.light(f, -9, 3.6, -4, "#ffe0b0", 8, 10);

  // ---- people -----------------------------------------------------------------------------------
  k.onCast(f, () => {
    const coders: [number, Line[]][] = [
      [2001, ["My wallet sync finished. Before my coffee.", "Unit tests green. Like the room.", "Shipping a Sapling-to-Orchard migration tool today."]],
      [2002, ["Who took my charger?", "Zero-knowledge stand-up: I did things. I can't say which."]],
      [2003, ["Pull request merged. Lunch on the sky garden?", () => `Block ${k.height.toLocaleString("en-US")}. My build is slower.`]],
      [2004, ["Spec says 'Jubjub curve'. I'm not making that up."]],
      [2005, ["The lettuce next to me grows faster than my backlog."]],
    ];
    const seats = [0, 3, 7, 10, 18];
    coders.forEach(([id, lines], i) => {
      const [x, z, side] = desks[seats[i]];
      void k.person(f, id, [x, z], "Developer", { sit: true, face: [0, -side], lines, near: 5 });
    });
    void k.person(f, 2010, [4.4, -7.4], "Botanist", { face: [1, 0], wander: [[4.4, -7.4], [4.4, -11.0], [4.4, -14.2], [9.2, -14.2]], lines: ["Butterhead, rocket, Thai basil. All grown at 58 metres.", "No soil, no pests, no trusted setup.", "The pink light? Plants only need red and blue."] });
    void k.person(f, 2011, [-10.4, -4.0], "Barista", { face: [1, 0], lines: ["Oat flat white? Paid in shielded ZEC, of course.", "The beans come from the 31st floor. Just kidding.", () => (k.price ? `Coffee: 0.004 ZEC. That's about ${(0.004 * k.price).toFixed(2)} dollars.` : "Coffee is on the house until the price loads.")] });
    const a = k.person(f, 2012, [-8.2, -19.7], "Founder", { sit: true, face: [0, -1] });
    const b = k.person(f, 2013, [-6.0, -21.9], "Investor", { sit: true, face: [0, 1] });
    k.dialog(f, [a, b], [
      [0, "Our users never reveal their balances."],
      [1, "Then how do you know you have users?"],
      [0, "We have proofs. Valid ones."],
      [1, "Show me the chart, then."],
      [0, () => (k.price ? `ZEC is at ${k.price.toFixed(2)}. That's the chart.` : "The chart is loading. Like your term sheet.")],
    ], { near: 8 });
  });
  void g;
}
