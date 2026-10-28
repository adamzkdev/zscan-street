import { portraitTexture } from "../../../data/portrait";
import * as THREE from "three";
import { ZScan } from "../../../data/zscan";
import { armchair, bed as bedModel, bookshelf, chair, coffeeTable, desk, diningTable, floorLamp, fridge, kitchen, nightstand, pendant, plant, rug, sofa, stool, tvUnit, wardrobe } from "../../furniture";
import { drawBlocks, drawTicker, type SkyKit } from "../kit";
import { creepers, eggChair, GREEN, LIFT, meshScreen, oakTex, SAP } from "./parts";

/**
 * 84 — Residence 8401, a family's flat: the lift opens on the hall; to the south an open-plan
 * kitchen (island, stools, dining table at the window) and a living room (an L of sofas, the TV
 * on the live chain, a window seat over the city); to the north a study with a gaming corner and
 * the bedroom. Pale oak floors, a white ceiling with a cove of light, the facade's red mesh and
 * its creepers outside the bedroom glass, the city everywhere else.
 */

const f = 3;
const H = 3.8;
const X0 = -12,
  X1 = 12,
  Z0 = -24,
  Z1 = 0;

export function residence(k: SkyKit) {
  const g = k.groups[f];
  // ---- floor, ceiling --------------------------------------------------------------------------
  k.flat(f, 24, 24, new THREE.MeshStandardMaterial({ map: oakTex(5, 5, "#dcc29a"), roughness: 0.5 }), 0, -12, 0);
  k.box(f, 24, 0.2, 24, 0, H, -12, "#f4f2ee");
  // the cove: a lowered border with a strip of light along the glass
  for (const [w, d, x, z] of [
    [24, 0.6, 0, -0.3],
    [24, 0.6, 0, -23.7],
    [0.6, 24, 11.7, -12],
  ] as const) {
    k.box(f, w, 0.3, d, x, H - 0.3, z, "#f4f2ee");
    k.box(f, w === 24 ? 23.4 : 0.04, 0.03, d === 24 ? 23.4 : 0.04, x + (w === 24 ? 0 : -0.32), H - 0.32, z + (d === 24 ? 0 : z > -1 ? -0.32 : 0.32), "#ffe6c0", "glow");
  }
  for (const [x, z] of [[-7, -5], [-3, -5], [5, -5], [8, -5], [-6, -19], [6, -19]]) k.cyl(f, 0.09, 0.09, 0.02, x, H - 0.02, z, "#fff4e0", "glow", 10);

  // ---- the shell -------------------------------------------------------------------------------
  k.wall(f, X0, Z0, X0, Z1, H, "#ece8e0", "matte", 0.3);
  k.curtain(f, X0, Z1, X1, Z1, H, "#d8d4cc", 2.4);
  k.curtain(f, X1, Z1, X1, Z0, H, "#d8d4cc", 2.4);
  k.curtain(f, X1, Z0, X0, Z0, H, "#d8d4cc", 2.4);
  meshScreen(k, f, X1 + 0.7, -13, X1 + 0.7, -23.8, H + 0.4, 91, -0.2, 0.7);
  creepers(k, f, X1 + 0.5, -13, X1 + 0.5, -23.8, H + 0.2, 2.2, 92, 0.2);
  creepers(k, f, -11.6, Z1 + 0.5, -2, Z1 + 0.5, H + 0.2, 1.6, 93, 0.25);
  // partitions: the hall (z -13.6 … -10.6), the study | bedroom wall
  const wallC = "#f0ece4";
  k.wall(f, 0, -10.6, X1, -10.6, H, wallC, "matte", 0.14);
  k.wall(f, X0, -13.6, -6.6, -13.6, H, wallC, "matte", 0.14);
  k.wall(f, -5.2, -13.6, 4.4, -13.6, H, wallC, "matte", 0.14);
  k.wall(f, 5.8, -13.6, X1, -13.6, H, wallC, "matte", 0.14);
  k.wall(f, 0, Z0, 0, -13.6, H, wallC, "matte", 0.14);
  for (const x of [-5.9, 5.1]) k.box(f, 1.5, H - 2.3, 0.16, x, 2.3, -13.6, wallC);
  k.lifts(f, X0 + 0.16, -12, Math.PI / 2, LIFT);
  // the door panel in the hall: the flat's number, a little screen
  // the hall: a runner, a console with a mirror and a lamp, the family's shoes, a plant
  k.box(f, 9, 0.01, 1.3, -6.8, 0.004, -12.1, "#5a8a6a");
  k.box(f, 8.6, 0.012, 1.0, -6.8, 0.006, -12.1, "#e8dcc4");
  k.box(f, 1.8, 0.8, 0.4, -3.6, 0, -13.35, SAP.oak);
  k.box(f, 1.2, 1.2, 0.04, -3.6, 1.3, -13.52, "#c8d8e0", "metal");
  k.cyl(f, 0.12, 0.1, 0.35, -2.9, 0.8, -13.35, "#efe8da", "matte", 10);
  k.cyl(f, 0.14, 0.14, 0.12, -2.9, 1.15, -13.35, "#fff0c8", "glow", 10);
  k.solid(f, -4.5, -13.6, -2.7, -13.1);
  for (let i = 0; i < 4; i++) k.box(f, 0.12, 0.08, 0.28, -9.6 + i * 0.3, 0, -13.25, ["#e04a3a", "#f4f0e8", "#3a6ad0", "#2a2830"][i]);
  k.vox(f, "sap-hplant", () => plant("ficus", 44), -1.0, -13.1, 0);
  k.label(f, "8401", -3.6, 2.3, -13.5, { h: 0.22, color: "#2a3a2a", glow: false });
  {
    const p = k.screen(f, 0.5, 0.32, (c, W, Hh) => drawTicker(c, W, Hh, { bg: "#08120c" }), 6, 256);
    p.position.set(-7.6, k.y(f) + 1.5, -13.52);
  }

  // ---- kitchen: a run on the core wall, an island, the dining table at the window --------------
  k.vox(f, "sap-kitchen", () => kitchen(5.2, "#e8e4da", "#3a3a36"), X0 + 0.5, -6.4, Math.PI / 2);
  k.vox(f, "sap-fridge", () => fridge(), X0 + 0.55, -9.6, Math.PI / 2);
  k.box(f, 1.0, 0.9, 2.8, -7.4, 0, -6.2, "#2f4a3a");
  k.box(f, 1.2, 0.06, 3.0, -7.4, 0.9, -6.2, "#f4f2ee", "polish");
  k.solid(f, -8.0, -7.7, -6.8, -4.7);
  for (let i = 0; i < 3; i++) k.vox(f, "sap-stool2", () => stool("#c89a5a"), -6.4, -7.2 + i * 1.0, 0, { solid: false });
  // a bowl of fruit, a chopping board, a pot on the hob
  k.cyl(f, 0.2, 0.14, 0.1, -7.4, 0.96, -5.4, "#e8e2d4", "polish", 12);
  for (let i = 0; i < 5; i++) k.box(f, 0.09, 0.09, 0.09, -7.45 + (i % 3) * 0.08, 1.02, -5.45 + (i % 2) * 0.08, ["#e04a3a", "#f4c428", "#7ac860"][i % 3]);
  k.box(f, 0.4, 0.03, 0.28, -7.3, 0.96, -6.8, SAP.oak);
  for (let x = -7.5; x <= -6; x += 0.75) k.vox(f, "sap-pend", () => pendant(0.9), x, -6.2, 0, { dy: H - 1.0, solid: false });
  k.vox(f, "sap-dining", () => diningTable(4), -5.2, -2.4, 0);
  for (const [dx, dz, r] of [[-0.6, -0.8, 0], [0.6, -0.8, 0], [-0.6, 0.8, Math.PI], [0.6, 0.8, Math.PI]] as const) k.vox(f, "sap-dchair", () => chair("#c89a5a"), -5.2 + dx, -2.4 + dz, r, { solid: false });
  k.cyl(f, 0.06, 0.05, 0.22, -5.2, 0.76, -2.4, "#f4f0e8", "polish", 8);
  k.box(f, 0.14, 0.18, 0.14, -5.2, 0.98, -2.4, "#f06aa0");

  // ---- living room -----------------------------------------------------------------------------
  k.vox(f, "sap-rug2", () => rug(4.6, 3.4, "#e8e0cc", "#5a8a6a"), 6, -6.6, 0, { solid: false });
  k.vox(f, "sap-sofa", () => sofa("#6a8a6a", 3, "#efe8da"), 6, -4.6, Math.PI);
  k.vox(f, "sap-sofa2", () => sofa("#6a8a6a", 2, "#efe8da"), 2.6, -6.8, Math.PI / 2);
  k.vox(f, "coffee", () => coffeeTable(), 6, -6.8, 0);
  k.vox(f, "sap-arm", () => armchair("#c89a5a"), 9.6, -7.4, -Math.PI / 2 - 0.3);
  k.vox(f, "sap-flamp", () => floorLamp(), 10.6, -5.2, 0);
  k.vox(f, "sap-tv", () => tvUnit(30), 6, -10.25, 0);
  {
    const tv = k.screen(f, 2.2, 1.24, (c, W, Hh) => drawBlocks(c, W, Hh, k.blocks, { accent: GREEN, bg: "#05080a", title: "LIVE · BLOCKS" }), 4);
    tv.position.set(6, k.y(f) + 1.45, -10.44);
    k.box(f, 2.3, 1.34, 0.05, 6, 0.78, -10.5, "#101012", "polish");
    k.hit(f, 2.2, 1.24, 0.1, 6, 0.83, -10.4, "<b>The TV</b><span>the chain, live</span>", () => ({ eyebrow: "Residence 8401 · TV", title: `Block #${k.height.toLocaleString("en-US")}`, mono: true, stats: k.blocks.slice(0, 4).map((b) => [`#${b.height}`, b.miner_pool ?? "—"] as [string, string]) }));
  }
  // the window seat along the front glass, cushions, plants
  k.box(f, 7, 0.45, 0.7, 6.4, 0, -0.55, SAP.oak);
  k.box(f, 7, 0.12, 0.66, 6.4, 0.45, -0.55, "#efe8da");
  for (let i = 0; i < 5; i++) k.box(f, 0.45, 0.4, 0.14, 3.6 + i * 1.4, 0.55, -0.82, ["#5a8a6a", "#e88a4a", "#efe8da", "#c89a5a", "#5a8a6a"][i], "matte", 0.1);
  k.solid(f, 2.9, -0.95, 9.9, -0.2);
  for (const [x, z, s] of [[11.0, -1.0, 1], [1.2, -9.8, 2], [-1.0, -0.9, 3]] as const) k.vox(f, `sap-rp${s}`, () => plant(s % 2 ? "monstera" : "ficus", s + 30), x, z, s);
  // a zkSNARK portrait over the sofa: the family's own
  {
    const tex = portraitTexture(ZScan.zkSnarkImage(4321));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.magFilter = THREE.NearestFilter;
    k.box(f, 0.1, 1.3, 1.3, 1.85, 1.2, -6.8, SAP.oakDark);
    const art = k.plane(f, 1.1, 1.1, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 }), 1.92, 1.85, -6.8, 0, Math.PI / 2);
    void art;
    k.hit(f, 0.2, 1.3, 1.3, 1.95, 1.2, -6.8, "<b>zkSNARK #4321</b><span>a portrait</span>", () => ({ eyebrow: "Residence 8401", title: "zkSNARK #4321", mono: true, image: ZScan.zkSnarkImage(4321) }));
  }

  // ---- study: a desk at the glass, books, the gaming corner -----------------------------------
  k.vox(f, "sap-desk", () => desk(3), -6, -23.1, 0);
  k.vox(f, "sap-dchair2", () => chair("#3a5a3a", true), -6, -22.3, Math.PI, { solid: false });
  k.vox(f, "sap-shelf", () => bookshelf(5, 20), X0 + 0.45, -19, Math.PI / 2);
  k.vox(f, "sap-shelf2", () => bookshelf(6, 20), X0 + 0.45, -16.4, Math.PI / 2);
  k.vox(f, "sap-egg-k", () => eggChair("#e88a4a"), -2.0, -17.6, Math.PI / 2 + 0.6);
  {
    k.box(f, 1.6, 0.5, 0.45, -1.0, 0, -22.9, "#2a2830");
    const s = k.screen(f, 1.5, 0.85, (c, W, Hh, t) => {
      // a little racing game, the zkSNARK kart on the track
      c.fillStyle = "#1a3a1a";
      c.fillRect(0, 0, W, Hh);
      c.fillStyle = "#3a3a42";
      const off = (t * 220) % 80;
      c.beginPath();
      c.moveTo(W * 0.42, 0);
      c.lineTo(W * 0.58, 0);
      c.lineTo(W * 0.95, Hh);
      c.lineTo(W * 0.05, Hh);
      c.fill();
      c.fillStyle = "#f4f0e8";
      for (let y = -80 + off; y < Hh; y += 80) c.fillRect(W / 2 - 4, y, 8, 34);
      c.fillStyle = "#f4b728";
      c.fillRect(W / 2 - 40 + Math.sin(t * 2) * 60, Hh * 0.72, 80, 46);
      c.fillStyle = "#e04a3a";
      c.fillRect(W / 2 - 30 + Math.sin(t * 1.3 + 1) * 90, Hh * 0.35, 50, 30);
      c.fillStyle = GREEN;
      c.font = "700 28px monospace";
      c.fillText(`LAP ${1 + (Math.floor(t / 20) % 3)}/3`, 16, 36);
    }, 0.08, 384);
    s.position.set(-1.0, k.y(f) + 1.0, -22.6);
    k.solid(f, -1.9, -23.3, -0.1, -22.5);
  }
  k.vox(f, "sap-rug3", () => rug(2.6, 2, "#e88a4a", "#3a5a3a"), -2.2, -19.6, 0, { solid: false });

  // ---- bedroom -----------------------------------------------------------------------------------
  k.vox(f, "sap-bed", () => bedModel("#e8e0cc", "#f4f2ee"), 1.4, -19.2, Math.PI / 2);
  k.vox(f, "sap-ns", () => nightstand(), 0.5, -20.9, Math.PI / 2);
  k.vox(f, "sap-ns", () => nightstand(), 0.5, -17.5, Math.PI / 2);
  k.vox(f, "sap-ward", () => wardrobe("#e8e2d4"), 9.5, -14.1, Math.PI);
  k.vox(f, "sap-ward", () => wardrobe("#e8e2d4"), 8.1, -14.1, Math.PI);
  k.vox(f, "sap-bplant", () => plant("monstera", 41), 11.0, -23.0, 0);
  k.vox(f, "sap-arm2", () => armchair("#efe8da"), 10.6, -20.6, -Math.PI / 2 - 0.5);

  // ---- light ------------------------------------------------------------------------------------
  k.light(f, -6.8, 3.2, -5, "#ffe2b8", 12, 14);
  k.light(f, 6, 3.2, -5, "#ffe2b8", 12, 14);
  k.light(f, -6, 3.2, -19, "#ffe6c8", 9, 12);
  k.light(f, 6, 3.2, -19, "#ffdcb0", 8, 12);
  k.light(f, -8, 3.2, -12, "#fff0dc", 6, 8);

  // ---- people -----------------------------------------------------------------------------------
  k.onCast(f, () => {
    const a = k.person(f, 3301, [-10.6, -6.6], "Resident", { face: [-1, 0] });
    const b = k.person(f, 3302, [-6.6, -5.6], "Resident", { face: [-1, 0] });
    k.dialog(f, [a, b], [
      [0, "Laksa tonight. The chillies are from the sky garden."],
      [1, "Not too hot. The kid's still at 1 star."],
      [0, "Did you pay the grocer?"],
      [1, "Shielded, from my phone. Sapling made that easy."],
      [0, "Remember when that took a minute and a laptop?"],
      [1, "Remember when we lived on the ground floor?"],
    ], { near: 9 });
    void k.person(f, 3303, [-2.0, -17.6], "Kid", { sit: true, face: [0, -1], lines: ["Lap three! Don't talk to me.", "I named my kart Jubjub.", "Grandpa says he mined ZEC on a laptop. Cool."] });
    void k.person(f, 3304, [5.0, -0.8], "Grandpa", { sit: true, face: [0, 1], lines: ["Eighty-four floors up. I can see where I was born.", "In 2016 I mined my first ZEC on this very laptop. Well, a laptop.", () => `Block ${k.height.toLocaleString("en-US")}. I remember block one.`] });
  });
  void g;
}

