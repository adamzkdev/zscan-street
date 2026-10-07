import * as THREE from "three";
import { bench, kiosk, plant } from "../../furniture";
import { drawBlocks, type SkyKit } from "../kit";
import { bed, creepers, drawSapling, GREEN, hammock, lawnTex, LIFT, meshScreen, oakTex, playground, saplingInfo, SAP, tree, yogaMat } from "./parts";

/**
 * 31 — the sky garden: a double-height storey open on all four sides, 31 m over the marina. A
 * lawn under an oak soffit, the lift core in the middle, the facade's red mesh and its creepers
 * wrapping the four corner columns; a yoga class on the front lawn, a playground, raised kitchen
 * beds, a hammock, the neighbours' long table behind the core, trees all round, creepers hanging
 * from the soffit edge, and nothing but a glass balustrade between you and the city.
 */

const f = 1;
const H = 8;
const X0 = -12,
  X1 = 12,
  Z0 = -24,
  Z1 = 0;
const CORE = { x0: -4, x1: 4, z0: -18, z1: -10 };

export function garden(k: SkyKit) {
  // ---- lawn, deck paths, soffit ----------------------------------------------------------------
  k.flat(f, 24, 24, new THREE.MeshStandardMaterial({ map: lawnTex(6, 6), roughness: 0.95 }), 0, -12, 0);
  const deck = new THREE.MeshStandardMaterial({ map: oakTex(1, 4, "#c8a070"), roughness: 0.7 });
  k.flat(f, 2.4, 10, deck, 0, -5, 0.012);
  k.flat(f, 20, 2.2, deck, 0, -8.9, 0.014);
  k.flat(f, 2.2, 14, deck, -7.8, -16, 0.013);
  k.flat(f, 2.2, 14, deck, 7.8, -16, 0.013);
  k.flat(f, 17.8, 2.2, deck, 0, -21, 0.012);
  // the slab edge and the soffit: oak slats with lights between
  k.box(f, 24.4, 0.5, 24.4, 0, -0.5, -12, SAP.stone, "matte");
  k.box(f, 24.4, 0.6, 24.4, 0, H, -12, SAP.stone, "matte");
  for (let z = Z0 + 0.3; z < Z1; z += 0.5) k.box(f, 23.6, 0.14, 0.2, 0, H - 0.14, z, SAP.oak);
  for (let x = -9; x <= 9; x += 4.5) for (let z = -3; z >= -21; z -= 4.5) if (!(x > CORE.x0 - 1 && x < CORE.x1 + 1 && z < CORE.z1 + 1 && z > CORE.z0 - 1)) k.box(f, 0.5, 0.04, 0.5, x, H - 0.2, z, "#ffe6b8", "glow");

  // ---- the edge: glass balustrade with an oak rail, fairy lights, creepers off the soffit -------
  const rail = (x0: number, z0: number, x1: number, z1: number) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const ry = -Math.atan2(z1 - z0, x1 - x0);
    k.box(f, len, 1.1, 0.04, (x0 + x1) / 2, 0, (z0 + z1) / 2, "#cfe8e8", "glass", ry);
    k.box(f, len, 0.08, 0.14, (x0 + x1) / 2, 1.1, (z0 + z1) / 2, SAP.teak, "matte", ry);
    k.box(f, len, 0.12, 0.2, (x0 + x1) / 2, 0, (z0 + z1) / 2, SAP.stoneDark, "matte", ry);
    k.line(f, x0, z0, x1, z1, 0.3);
    const n = Math.round(len / 0.6);
    for (let i = 0; i <= n; i++) k.box(f, 0.06, 0.06, 0.06, x0 + ((x1 - x0) * i) / n, 1.2, z0 + ((z1 - z0) * i) / n, i % 2 ? "#fff0c0" : "#c8ffd8", "glow");
  };
  rail(X0 + 1, Z1, X1 - 1, Z1);
  rail(X0 + 1, Z0, X1 - 1, Z0);
  rail(X0, Z0 + 1, X0, Z1 - 1);
  rail(X1, Z0 + 1, X1, Z1 - 1);
  // low flower troughs inside the balustrade
  const trough = (x: number, z: number, w: number, d: number, seed: number) => bed(k, f, x, z, w, d, seed, true);
  trough(-1.2, -0.9, 2.4, 0.6, 201);
  trough(-11.1, -12.5, 0.6, 2.6, 202);
  trough(11.1, -12.5, 0.6, 3.6, 203);
  trough(-3.0, -23.1, 2.6, 0.6, 204);
  trough(3.0, -23.1, 2.6, 0.6, 205);
  creepers(k, f, X0, Z1, X1, Z1, H, 2.4, 41, 0.18);
  creepers(k, f, X0, Z0, X1, Z0, H, 2.4, 42, 0.18);
  creepers(k, f, X0, Z0, X0, Z1, H, 2.4, 43, 0.18);
  creepers(k, f, X1, Z0, X1, Z1, H, 2.4, 44, 0.18);
  // the corner columns: wrapped in the facade's red mesh and creepers
  for (const [cx, cz] of [
    [X0, Z0],
    [X1, Z0],
    [X0, Z1],
    [X1, Z1],
  ]) {
    k.box(f, 1, H, 1, cx, 0, cz, "#7a2a2a");
    meshScreen(k, f, cx - 0.55, cz + 0.55, cx + 0.55, cz + 0.55, H, cx + cz, 0, 0.5);
    meshScreen(k, f, cx - 0.55, cz - 0.55, cx + 0.55, cz - 0.55, H, cx - cz, 0, 0.5);
    meshScreen(k, f, cx - 0.55, cz - 0.55, cx - 0.55, cz + 0.55, H, cx * 3 + cz, 0, 0.5);
    meshScreen(k, f, cx + 0.55, cz - 0.55, cx + 0.55, cz + 0.55, H, cx + cz * 3, 0, 0.5);
    k.solid(f, cx - 0.6, cz - 0.6, cx + 0.6, cz + 0.6);
  }

  // ---- the core: oak-clad, the lifts on its front, a creeper-covered back --------------------
  const { x0, x1, z0, z1 } = CORE;
  k.wall(f, x0, z1, x1, z1, H, "#e8e0d0", "matte", 0.3);
  k.wall(f, x0, z0, x1, z0, H, SAP.oakDark, "matte", 0.3);
  k.wall(f, x0, z0, x0, z1, H, SAP.oakDark, "matte", 0.3);
  k.wall(f, x1, z0, x1, z1, H, SAP.oakDark, "matte", 0.3);
  for (const x of [x0 - 0.16, x1 + 0.16]) for (let z = z0 + 0.2; z < z1; z += 0.3) k.box(f, 0.05, H, 0.12, x, 0, z, SAP.oak);
  meshScreen(k, f, x1 + 0.1, z0 - 0.2, x0 - 0.1, z0 - 0.2, H, 51, 0, 0.8);
  k.lifts(f, 0, z1 + 0.16, 0, LIFT);
  k.label(f, "SKY GARDEN · 31", 0, 5.6, z1 + 0.18, { h: 0.5, color: GREEN });

  // ---- front left: the yoga lawn -----------------------------------------------------------------
  const mats: [number, number][] = [
    [-9.6, -3.0],
    [-7.6, -3.0],
    [-5.6, -3.0],
    [-9.6, -6.2],
    [-5.6, -6.2],
  ];
  mats.forEach(([x, z], i) => k.vox(f, `sap-mat${i % 3}`, () => yogaMat(["#1f9a7a", "#d0406a", "#3a6ad0"][i % 3]), x, z, 0, { solid: false }));
  k.vox(f, "sap-mat-t", () => yogaMat("#f4c428"), -7.6, -7.2, Math.PI, { solid: false });

  // ---- front right: the playground ---------------------------------------------------------------
  k.box(f, 5.2, 0.03, 4.2, 7.6, 0, -4.4, "#3a8a6a");
  k.vox(f, "sap-play", () => playground(), 7.6, -4.4, Math.PI);
  k.vox(f, "sap-bench", () => bench(), 3.6, -6.6, Math.PI / 2);

  // ---- back left: kitchen beds -------------------------------------------------------------------
  bed(k, f, -10, -13.2, 2.6, 1.1, 61);
  bed(k, f, -10, -16.2, 2.6, 1.1, 62);
  bed(k, f, -10, -19.2, 2.6, 1.1, 63, true);
  k.box(f, 0.5, 0.6, 0.5, -6.5, 0, -13.5, "#5a8aa8", "polish");
  k.cyl(f, 0.1, 0.1, 0.5, -6.5, 0.6, -13.5, "#3a6a88", "polish", 8);
  // ---- back right: the hammock, a bench, a reading spot ------------------------------------------
  k.vox(f, "sap-hammock", () => hammock("#e88a4a"), 9.6, -15.2, Math.PI / 2);
  k.vox(f, "sap-bench", () => bench(), 10.4, -20.6, -Math.PI / 2);
  // ---- behind the core: the neighbours' long table -----------------------------------------------
  k.box(f, 5.6, 0.75, 1.0, 0, 0, -21.4, SAP.teak);
  k.box(f, 5.8, 0.06, 1.1, 0, 0.75, -21.4, SAP.oak);
  for (const s of [-1, 1]) k.box(f, 5.6, 0.45, 0.35, 0, 0, -21.4 + s * 0.85, SAP.oakDark);
  k.solid(f, -2.9, -22.4, 2.9, -20.4);
  for (let i = 0; i < 6; i++) k.cyl(f, 0.05, 0.04, 0.16, -2.2 + i * 0.9, 0.81, -21.4 + (i % 2 ? 0.2 : -0.2), ["#f4f0e8", "#5cff9a", "#f4b728"][i % 3], "matte", 8);

  // ---- trees ---------------------------------------------------------------------------------
  const trees: [number, number, number, number][] = [
    [-10.4, -9.6, 5.6, 1.8],
    [10.4, -9.6, 5.8, 1.9],
    [-6.2, -22.4, 5.2, 1.6],
    [6.2, -22.4, 5.4, 1.7],
    [-2.6, -1.6, 4.4, 1.3],
    [10.6, -1.4, 4.6, 1.3],
  ];
  trees.forEach(([x, z, h, r], i) => tree(k, f, x, z, h, r, 70 + i, i % 2 ? undefined : ["#3d9440", "#4aa84a", "#7ac860", "#5cb84e", "#f0a0c0"]));
  for (const [x, z, s] of [
    [-4.6, -11, 1],
    [4.6, -11, 2],
    [-11, -22.8, 3],
    [11, -22.8, 4],
  ] as const)
    k.vox(f, `sap-gplant${s}`, () => plant(s % 2 ? "monstera" : "ficus", s + 10), x, z, s);

  // ---- the totem by the lifts: blocks and the Sapling pool -------------------------------------
  k.vox(f, "kiosk", () => kiosk(), 5.6, -9.6, Math.PI / 6);
  {
    const a = k.screen(f, 1.4, 0.8, (c, W, Hh) => drawBlocks(c, W, Hh, k.blocks, { accent: GREEN, bg: "#06100a" }), 4, 384);
    a.position.set(5.6 + Math.sin(Math.PI / 6) * 0.04, k.y(f) + 1.62, -9.6 + Math.cos(Math.PI / 6) * 0.04);
    a.rotation.y = Math.PI / 6;
    k.box(f, 0.12, 2.6, 0.12, -5.8, 0, -9.4, "#2a2830", "metal");
    const b = k.screen(f, 1.4, 0.8, (c, W, Hh) => drawSapling(c, W, Hh), 10, 384);
    b.position.set(-5.8, k.y(f) + 2.2, -9.32);
    k.box(f, 1.5, 0.9, 0.08, -5.8, 1.75, -9.4, "#14140f");
    k.hit(f, 1.4, 0.8, 0.1, -5.8, 1.8, -9.3, "<b>Sapling pool</b><span>ZEC shielded in Sapling</span>", saplingInfo);
  }

  // ---- light ------------------------------------------------------------------------------------
  k.light(f, -7, 7, -5, "#ffe6c0", 22, 20);
  k.light(f, 7, 7, -5, "#ffe6c0", 22, 20);
  k.light(f, -8, 7, -18, "#ffe6c0", 18, 18);
  k.light(f, 8, 7, -18, "#ffe6c0", 18, 18);
  k.light(f, 0, 6.5, -22, "#ffdcb0", 14, 14);

  // ---- people -----------------------------------------------------------------------------------
  k.onCast(f, () => {
    const t = k.person(f, 1201, [-7.6, -7.0], "Yoga teacher", { face: [0, 1] });
    const s1 = k.person(f, 1202, [-9.6, -2.6], "Resident", { face: [0, -1] });
    const s2 = k.person(f, 1203, [-5.6, -2.6], "Resident", { face: [0, -1] });
    void k.person(f, 1204, [-9.6, -5.8], "Resident", { face: [0, -1] });
    k.dialog(f, [t, s1, s2], [
      [0, "Breathe in. Hold it, like a shielded note."],
      [1, "How long do we hold?"],
      [0, "One block. About seventy-five seconds."],
      [2, "I can see the Needle from here."],
      [0, "Eyes closed. The Needle can wait."],
    ], { near: 10, gap: 10 });
    void k.person(f, 1205, [6.4, -2.6], "Kid", { wander: [[6.4, -2.6], [9.6, -6.2], [5.2, -6.8], [9.8, -2.4]], lines: ["Push me on the swing!", "The slide is faster than a block.", "I'm the tallest kid in the city. Thirty-one metres!"] });
    void k.person(f, 1206, [8.8, -6.6], "Kid", { wander: [[8.8, -6.6], [5.6, -3.2], [10.2, -4.4]], lines: ["Tag! You're transparent!", "Can't catch me, I'm shielded!"] });
    void k.person(f, 1207, [3.6, -7.2], "Parent", { sit: true, face: [1, 0.3], lines: ["Careful on the slide!", "Five more blocks, then dinner.", "Best playground in the city. Nobody's under us but the marina."] });
    void k.person(f, 1208, [-7.6, -14.8], "Gardener", { face: [-1, 0], wander: [[-7.6, -14.8], [-7.6, -18.6], [-7.8, -12.4]], lines: ["Basil, chilli, lettuce. Lunch for the 40th floor.", "The tomatoes ripen faster up here. More sun, fewer snails.", "Help yourself to a sprig of mint."] });
    void k.person(f, 1209, [8.2, -18.4], "Resident", { face: [-1, 0.2], lines: ["Shh, I'm reading the Sapling spec. It's a page-turner.", "Groth16 proofs. Two hundred bytes. Beautiful.", "Best hammock in town, if you can get it."] });
    const n1 = k.person(f, 1210, [-1.6, -20.6], "Neighbour", { sit: true, face: [0, -1] });
    const n2 = k.person(f, 1211, [1.4, -22.2], "Neighbour", { sit: true, face: [0, 1] });
    k.dialog(f, [n1, n2], [
      [0, "Did you see the price today?"],
      [1, () => (k.price ? `${k.price.toFixed(2)} dollars. I didn't look twice.` : "I never check. Too shielded for that.")],
      [0, "My grandmother still uses a transparent address."],
      [1, "Get her a Sapling wallet. It runs on her phone."],
    ], { near: 9 });
  });
}
