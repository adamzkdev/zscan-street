import * as THREE from "three";
import { backBar, barCounter, grandPiano, pianoBench, plant, stool } from "../../furniture";
import { roundTable, velvetChair } from "../../hotel/furniture";
import { textPlane } from "../../kit";
import { drawTicker, GOLD, num, usd, type SkyKit } from "../kit";
import { clubCarpet, DECO, panelling, stageBackdrop } from "./art";
import { F, LIFT } from "./levels";

/**
 * Floor 64: The Nullifier, a jazz club at the top of the second tier. The bandstand in front of
 * the north window (Midtown's lights behind the band, like the great New York rooms): a grand
 * piano, the bass, the saxophone and the singer under their spotlights, notes rising; a black and
 * white dance floor; red velvet banquettes along the south glass; candlelit tables; the long
 * mahogany bar on the east wall under the club's neon shell; the coat check by the lifts.
 */

const f = F.club;
const X0 = -12,
  X1 = 12,
  Z0 = -20,
  Z1 = 0,
  H = 4.2;

export function club(k: SkyKit) {
  const g = k.groups[f];
  const y0 = k.y(f);

  // ---- floor, ceiling --------------------------------------------------------------------------
  k.box(f, X1 - X0, 0.1, Z1 - Z0, 0, -0.1, -10, "#1a0a0e", "matte");
  k.flat(f, X1 - X0 - 0.4, Z1 - Z0 - 0.4, new THREE.MeshStandardMaterial({ map: clubCarpet(10, 8), roughness: 0.95 }), 0, -10, 0.004);
  // the dance floor: black and white squares, a brass edge
  for (let i = 0; i < 8; i++)
    for (let j = 0; j < 5; j++) k.box(f, 0.8, 0.02, 0.8, 0.4 + i * 0.8 + 0.4, 0, -14.8 + j * 0.8 + 0.4, (i + j) % 2 ? "#f0ece4" : "#121014", "polish");
  k.box(f, 6.7, 0.024, 4.3, 4.0, -0.006, -12.8, "#b08a3a", "metal");
  k.box(f, X1 - X0, 0.2, Z1 - Z0, 0, H, -10, "#0a0c1c", "matte");
  // the ceiling: midnight blue with gold deco rings and a stepped cove over the dance floor
  for (const [r, c] of [
    [3.4, "#d9b25a"],
    [2.6, "#a8822e"],
    [1.8, "#d9b25a"],
  ] as const)
    k.geo(f, new THREE.TorusGeometry(r, 0.05, 4, 48).rotateX(Math.PI / 2).translate(4.0, H - 0.06, -12.8), c, "metal");
  k.geo(f, new THREE.CircleGeometry(1.2, 32).rotateX(Math.PI / 2).translate(4.0, H - 0.02, -12.8), "#ffd9a0", "glow");
  // stars: tiny lights in the ceiling
  for (let i = 0; i < 90; i++) k.box(f, 0.04, 0.01, 0.04, -11 + k.rnd(i, 1) * 22, H - 0.01, -19 + k.rnd(i, 2) * 18, "#fff2d8", "glow");

  // ---- walls: mahogany panelling west and east, glass north and south --------------------------
  const wood = new THREE.MeshStandardMaterial({ map: panelling("#3a1610", "#b08a3a", 10, 2), roughness: 0.4 });
  k.wall(f, X0, Z0, X0, Z1, H, "#2a1008", "polish", 0.3);
  k.plane(f, Z1 - Z0, H, wood, X0 + 0.16, H / 2, -10, 0, Math.PI / 2);
  k.wall(f, X1, Z0, X1, Z1, H, "#2a1008", "polish", 0.3);
  k.plane(f, Z1 - Z0, H, wood, X1 - 0.16, H / 2, -10, 0, -Math.PI / 2);
  k.curtain(f, X0, Z0, X1, Z0, H, "#b08a3a", 2.4);
  k.curtain(f, X0, Z1, X1, Z1, H, "#b08a3a", 2.4);
  // heavy red curtains drawn back at each window bay
  for (const z of [Z0 + 0.25, Z1 - 0.25])
    for (let x = X0 + 0.6; x <= X1 - 0.4; x += 4.8)
      for (const s of [-1, 1]) if (x + s * 0.3 > X0 && x + s * 0.3 < X1) k.box(f, 0.5, H - 0.1, 0.18, x + s * 0.3, 0, z, "#6a0c18", "matte");
  k.lifts(f, X0 + 0.15, -10, Math.PI / 2, LIFT);

  // ---- the bandstand in front of the north window -----------------------------------------------
  const SX0 = -1.5,
    SX1 = 9.5,
    SZ0 = Z0 + 0.4,
    SZ1 = -16;
  k.box(f, SX1 - SX0, 0.45, SZ1 - SZ0, (SX0 + SX1) / 2, 0, (SZ0 + SZ1) / 2, "#1a0e08", "polish");
  k.box(f, SX1 - SX0, 0.04, 0.12, (SX0 + SX1) / 2, 0.42, SZ1, "#d9b25a", "metal");
  k.box(f, SX1 - SX0, 0.05, 0.05, (SX0 + SX1) / 2, 0.08, SZ1 + 0.05, "#ffd9a0", "glow");
  k.solid(f, SX0, SZ0, SX1, SZ1);
  k.grounds[f].push((x, z) => (x > SX0 && x < SX1 && z > SZ0 && z < SZ1 ? 0.45 : null));
  k.vox(f, "orch-piano", () => grandPiano(), 7.4, -18.2, -Math.PI / 2, { dy: 0.45 });
  k.vox(f, "orch-pbench", () => pianoBench(), 8.6, -17.9, -Math.PI / 2, { dy: 0.45, solid: false });
  // the double bass on its stand
  k.geo(f, new THREE.SphereGeometry(0.34, 12, 10).scale(1, 1.35, 0.45).translate(0.9, 0.45 + 0.75, -17.6), "#7a3a14", "polish");
  k.box(f, 0.05, 1.0, 0.05, 0.9, 1.4, -17.6, "#1a0e08", "polish");
  k.box(f, 0.1, 0.15, 0.08, 0.9, 2.35, -17.6, "#1a0e08", "polish");
  // drums: kick, snare, cymbals
  k.cyl(f, 0.32, 0.32, 0.5, 4.2, 0.45, -19.0, "#e8e2d4", "polish", 18);
  k.geo(f, new THREE.CylinderGeometry(0.3, 0.3, 0.45, 18).rotateX(Math.PI / 2).translate(4.2, 0.45 + 0.3, -18.9), "#8a1424", "polish");
  k.cyl(f, 0.2, 0.2, 0.14, 3.5, 0.45 + 0.6, -18.6, "#c8ccd4", "metal", 14);
  for (const [x, z, h] of [
    [3.2, -19.2, 1.2],
    [5.1, -19.0, 1.35],
  ] as const) {
    k.box(f, 0.03, h, 0.03, x, 0.45, z, "#c8ccd4", "metal");
    k.cyl(f, 0.32, 0.02, 0.03, x, 0.45 + h, z, "#d9b25a", "metal", 18);
  }
  // the microphone and the music stands
  k.box(f, 0.03, 1.5, 0.03, 2.6, 0.45, -16.6, "#c8ccd4", "metal");
  k.cyl(f, 0.04, 0.04, 0.1, 2.6, 0.45 + 1.5, -16.6, "#2a2830", "metal", 8);
  for (const x of [1.4, 5.6]) {
    k.box(f, 0.03, 1.0, 0.03, x, 0.45, -17.0, "#1a1a20", "metal");
    k.box(f, 0.5, 0.36, 0.03, x, 0.45 + 1.0, -17.0, "#1a1a20", "matte");
  }
  // spotlight cones from the ceiling onto the band (additive, no real light)
  const coneMat = new THREE.MeshBasicMaterial({ color: "#ffd9a0", transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  for (const x of [0.9, 2.6, 4.2, 7.6]) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.75, H - 0.45, 20, 1, true), coneMat);
    cone.position.set(x, y0 + 0.45 + (H - 0.45) / 2, -17.6);
    cone.raycast = () => {};
    g.add(cone);
    k.cyl(f, 0.12, 0.08, 0.2, x, H - 0.2, -17.6, "#1a1a20", "metal", 10);
  }
  k.label(f, "TONIGHT · THE VIEWING KEYS QUARTET", 4, 3.75, Z0 + 0.4, { h: 0.16, color: GOLD, font: `700 96px ${DECO}` });
  k.hit(f, SX1 - SX0, 2.6, SZ1 - SZ0, (SX0 + SX1) / 2, 0.45, (SZ0 + SZ1) / 2, `<b>The bandstand</b><span>the Viewing Keys Quartet</span>`, () => ({
    eyebrow: "The Nullifier · 64",
    title: "The Viewing Keys Quartet",
    stats: [
      ["Set", "Shield Me Tender"],
      ["Tempo", `one block a bar`],
      ["Block", `#${num(k.height)}`],
    ],
  }));

  // notes rising from the band
  const notes: THREE.Mesh[] = [];
  for (let i = 0; i < 8; i++) {
    const n = textPlane(i % 2 ? "♪" : "♫", { h: 0.26, color: i % 3 ? "#ffd9a0" : "#ff9ac0", glow: true });
    (n.material as THREE.MeshBasicMaterial).transparent = true;
    n.raycast = () => {};
    g.add(n);
    notes.push(n);
  }
  const SOURCES = [
    [7.4, -18.2],
    [0.9, -17.6],
    [2.6, -16.6],
    [4.2, -19],
  ];
  k.ticks[f].push((_dt, t) => {
    notes.forEach((n, i) => {
      const u = (t * 0.22 + i / notes.length) % 1;
      const [sx, sz] = SOURCES[i % SOURCES.length];
      n.position.set(sx + Math.sin(t * 1.3 + i) * 0.3, y0 + 2.0 + u * 1.8, sz + 0.6 + u * 0.8);
      (n.material as THREE.MeshBasicMaterial).opacity = Math.sin(u * Math.PI);
      n.lookAt(k.eye);
    });
  });

  // ---- the bar on the east wall under the neon shell ----------------------------------------
  const BX = X1 - 0.5;
  k.vox(f, "orch-backbar", () => backBar(9), BX - 0.15, -9, -Math.PI / 2);
  k.vox(f, "orch-bar", () => barCounter(9, "#d9b25a"), BX - 2.0, -9, -Math.PI / 2);
  const shellTex = stageBackdrop();
  shellTex.repeat.set(1, 0.5);
  shellTex.offset.set(0, 0.5);
  const shell = new THREE.MeshBasicMaterial({ map: shellTex, toneMapped: false });
  shell.color.setScalar(1.05);
  k.plane(f, 5.2, 2.6 * 0.5, shell, X1 - 0.2, 3.25, -9, 0, -Math.PI / 2);
  for (let i = 0; i < 6; i++) k.vox(f, "orch-stool", () => stool("#8a1424"), BX - 3.0, -12.6 + i * 1.3, -Math.PI / 2, { solid: false });
  const tick = k.screen(f, 0.9, 0.5, (c, W, Hh) => drawTicker(c, W, Hh, { bg: "#140806", ink: "#ffd9a0", label: "ZEC · THE BAR'S RATE" }), 6, 256);
  tick.position.set(X1 - 0.24, y0 + 1.6, -3.4);
  tick.rotation.y = -Math.PI / 2;
  k.hit(f, 1.0, 1.4, 9, BX - 2.0, 0, -9, `<b>The bar</b><span>cocktails · shielded tabs</span>`, () => ({
    eyebrow: "The Nullifier · bar",
    title: "Tonight's list",
    stats: [
      ["Nullifier Sour", "rye, lemon, a spent note"],
      ["Orchard Old Fashioned", "Halo 2 bitters"],
      ["The Viewing Key", "only you can taste it"],
      ["Tab", k.price ? `paid in ZEC at ${usd(k.price)}` : "paid in ZEC"],
    ],
  }));

  // ---- banquettes along the south glass, tables with candles --------------------------------
  for (let i = 0; i < 4; i++) {
    const x = -7.6 + i * 4.6;
    // a U of red velvet, tufted, with a brass rail
    k.box(f, 3.0, 0.45, 0.7, x, 0, Z1 - 0.8, "#7a0c18", "matte");
    k.box(f, 3.0, 0.9, 0.22, x, 0.45, Z1 - 0.42, "#6a0a14", "matte");
    for (const s of [-1, 1]) {
      k.box(f, 0.7, 0.45, 1.4, x + s * 1.15, 0, Z1 - 1.8, "#7a0c18", "matte");
      k.box(f, 0.2, 0.9, 1.4, x + s * 1.4, 0.45, Z1 - 1.8, "#6a0a14", "matte");
    }
    k.box(f, 3.0, 0.04, 0.05, x, 1.36, Z1 - 0.42, "#d9b25a", "metal");
    k.cyl(f, 0.5, 0.5, 0.04, x, 0.72, Z1 - 1.6, "#1a0e08", "polish", 20);
    k.cyl(f, 0.06, 0.12, 0.72, x, 0, Z1 - 1.6, "#d9b25a", "metal", 10);
    k.cyl(f, 0.04, 0.04, 0.08, x, 0.76, Z1 - 1.6, "#ffcf70", "glow", 8);
    k.solid(f, x - 1.5, Z1 - 2.5, x + 1.5, Z1 - 0.1);
  }
  const TABLES: [number, number][] = [
    [-7.6, -12.4],
    [-7.6, -7.2],
    [-3.4, -9.8],
    [-2.6, -5.2],
    [1.2, -7.6],
    [5.6, -7.0],
  ];
  for (const [x, z] of TABLES) {
    k.vox(f, "orch-table", () => roundTable(2), x, z, 0);
    for (const s of [-1, 1]) k.vox(f, "orch-vchair", () => velvetChair("#8a1424"), x + s * 0.95, z, s > 0 ? -Math.PI / 2 : Math.PI / 2, { solid: false });
  }
  // the coat check by the lifts
  k.box(f, 0.6, 1.05, 3.2, X0 + 0.9, 0, -17.2, "#2a1008", "polish");
  k.box(f, 0.7, 0.05, 3.3, X0 + 0.9, 1.05, -17.2, "#d9b25a", "metal");
  for (let i = 0; i < 7; i++) k.box(f, 0.32, 0.9, 0.06, X0 + 0.4, 1.3, -18.6 + i * 0.45, ["#1a1a20", "#5a1a14", "#2a3a5a", "#8a6a4a"][i % 4], "matte");
  k.label(f, "COAT CHECK", X0 + 1.27, 1.6, -17.2, { h: 0.14, color: GOLD, ry: Math.PI / 2 });
  k.solid(f, X0 + 0.5, -18.8, X0 + 1.3, -15.6);
  k.vox(f, "orch-plant0", () => plant("ficus", 3), X0 + 0.8, -1.2);
  k.vox(f, "orch-plant1", () => plant("monstera", 4), X0 + 0.8, -19.2);

  // ---- light --------------------------------------------------------------------------------
  k.light(f, 4, 3.6, -17.4, "#ffcf90", 14, 10);
  k.light(f, X1 - 2.4, 3.4, -9, "#ffb070", 9, 9);
  k.light(f, -5, 3.2, -9, "#ff9a70", 5, 10);
  k.light(f, 1, 3.2, -2.5, "#ffb080", 5, 9);
  k.light(f, 4, 3.4, -12.8, "#d080ff", 4, 7);

  // ---- people ---------------------------------------------------------------------------------
  k.onCast(f, () => {
    void k.person(f, 1958, [8.7, -17.9], "Pianist", { face: [-1, 0], sit: true, dy: 0.45 });
    void k.person(f, 1959, [1.3, -17.3], "Bassist", { face: [0.2, 1], dy: 0.45 });
    void k.person(f, 1960, [4.9, -17.9], "Drummer", { face: [0, 1], sit: true, dy: 0.45 });
    void k.person(f, 1961, [2.6, -16.3], "Singer", {
      face: [0, 1],
      dy: 0.45,
      tone: "shout",
      near: 14,
      every: [7, 11],
      lines: ["♪ Shield me tender, shield me true ♪", "♪ Nobody knows my balance but you ♪", "♪ Fly me to the Orchard pool ♪", () => `♪ Block ${num(k.height)}, the night is young ♪`, "♪ Every note I spend, nullified ♪"],
    });
    void k.person(f, 3401, [BX - 1.0, -9.4], "Bartender", { face: [-1, 0], wander: [[BX - 1.0, -12], [BX - 1.0, -6.4], [BX - 1.0, -9.4]], lines: ["What'll it be?", "The Nullifier Sour: you can only drink it once.", () => (k.price ? `Tabs in ZEC tonight. ${usd(k.price)} a coin.` : "Tabs in ZEC tonight.")] });
    const p1 = k.person(f, 3402, [BX - 3.0, -11.3], "Regular", { face: [1, 0], sit: true, dy: 0.25 });
    const p2 = k.person(f, 3403, [BX - 3.0, -10.0], "Saxophone fan", { face: [1, 0], sit: true, dy: 0.25 });
    k.dialog(f, [p1, p2], [
      [0, "Best room in Midtown."],
      [1, "The view behind the band does it."],
      [0, "Coltrane would have loved shielded tips."],
      [1, "Nobody knows who tipped. Only that someone did."],
    ], { near: 9 });
    const d1 = k.person(f, 3501, [3.6, -13.2], "Dancer", { face: [1, 0] });
    const d2 = k.person(f, 3502, [4.6, -13.0], "Dancer", { face: [-1, 0] });
    void d1.then((s) => s && k.ticks[f].push((_, t) => (s.root.position.y = y0 + Math.abs(Math.sin(t * 3.2)) * 0.09)));
    void d2.then((s) => s && k.ticks[f].push((_, t) => (s.root.position.y = y0 + Math.abs(Math.sin(t * 3.2 + 0.5)) * 0.09)));
    const c1 = k.person(f, 3601, [-8.4, Z1 - 1.0], "Guest", { face: [0.4, -1], sit: true, dy: 0.1 });
    const c2 = k.person(f, 3602, [-6.8, Z1 - 1.0], "Guest", { face: [-0.4, -1], sit: true, dy: 0.1 });
    k.dialog(f, [c1, c2], [
      [0, "Order whatever you like."],
      [1, "Even the champagne?"],
      [0, "Paid from my shielded wallet. Nobody will know."],
      [1, "Except me. I'll remember."],
    ], { near: 8 });
    const t1 = k.person(f, 3701, [-8.4, -12.4], "Guest", { face: [1, 0], sit: true });
    const t2 = k.person(f, 3702, [-6.7, -12.4], "Writer", { face: [-1, 0], sit: true });
    k.dialog(f, [t1, t2], [
      [1, "I'm writing a novel about Zcash."],
      [0, "What's it called?"],
      [1, "The Great Nullifier."],
      [0, "Old sport."],
    ], { near: 8 });
    void k.person(f, 3801, [-1, -10], "Waiter", { face: [0, 1], wander: [[-1, -10], [-5, -3.6], [6, -9], [BX - 3.6, -5], [-5, -14]], lines: ["Table for two? Right this way.", "The band takes requests. In ZEC."] });
    void k.person(f, 3901, [X0 + 1.9, -17.2], "Coat check", { face: [1, 0], lines: ["Ticket number 1,687,104. Don't lose it.", "Your coat is safe. Nobody can see whose it is."] });
  });
}
