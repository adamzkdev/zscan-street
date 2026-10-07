import * as THREE from "three";
import { coffeeTable, plant, rug } from "../../furniture";
import { drawBlocks, drawTicker, paint, type SkyKit } from "../kit";
import { bed, creepers, drawSapling, saplingInfo, eggChair, GREEN, LIFT, livingWall, oakTex, rattanChair, SAP, terrazzoTex, tree } from "./parts";

/**
 * G — the green atrium: a double-height lobby in pale oak and terrazzo. The west wall is a living
 * wall from floor to ceiling with the tower's name in green light and the reception desk at its
 * foot; a reflecting pool with a tree on its island in the middle; a slate water wall at the back
 * beside the lifts, the live boards over them; rattan egg chairs and a lounge by the glass on the
 * east; creepers hanging from the oak-slat ceiling. Glass onto the plaza at the front.
 */

const f = 0;
const H = 7.5;
const X0 = -12,
  X1 = 12,
  Z0 = -24,
  Z1 = 0;

export function lobby(k: SkyKit) {
  const g = k.groups[f];

  // ---- floor, ceiling --------------------------------------------------------------------------
  k.flat(f, 24, 24, new THREE.MeshStandardMaterial({ map: terrazzoTex(6, 6), roughness: 0.35 }), 0, -12, 0);
  // an oak path from the door to the lifts
  k.flat(f, 3.2, 20, new THREE.MeshStandardMaterial({ map: oakTex(1, 5), roughness: 0.5 }), -5, -12.5, 0.01);
  k.box(f, 24, 0.3, 24, 0, H, -12, "#2a2a26");
  for (let z = Z0 + 0.3; z < Z1; z += 0.42) k.box(f, 24, 0.14, 0.16, 0, H - 0.16, z, SAP.oak);
  // pendant lights: rows of warm globes on long cords
  for (let x = -6; x <= 9; x += 5)
    for (let z = -4; z >= -20; z -= 5) {
      k.box(f, 0.015, 2.2, 0.015, x, H - 2.2, z, "#222");
      k.cyl(f, 0.2, 0.2, 0.36, x, H - 2.5, z, "#ffe2b0", "glow", 12);
    }

  // ---- the shell: living wall west, glass east and front, timber back ---------------------------
  livingWall(k, f, X0, Z1, X0, Z0, H, 3);
  k.curtain(f, X1, Z1, X1, Z0, H, "#3a3a34", 2, { transom: 3.2 });
  k.curtain(f, X0, Z1, -1.8, Z1, H, "#3a3a34", 2, { transom: 3.2 });
  k.curtain(f, 1.8, Z1, X1, Z1, H, "#3a3a34", 2, { transom: 3.2 });
  // the doors: a timber portal, glass leaves, the way out
  k.solid(f, -1.8, Z1 - 0.1, 1.8, Z1 + 0.1);
  k.box(f, 3.8, 0.4, 0.4, 0, 3.2, Z1, SAP.teak);
  for (const s of [-1, 1]) k.box(f, 0.25, 3.2, 0.4, s * 1.9, 0, Z1, SAP.teak);
  k.box(f, 3.4, 3.1, 0.04, 0, 0.05, Z1 - 0.05, "#b8d8d0", "glass");
  k.box(f, 0.03, 3.1, 0.06, 0, 0.05, Z1 - 0.05, "#3a3a34", "metal");
  // the back: oak-clad wall
  k.wall(f, X0, Z0, X1, Z0, H, SAP.oakDark, "matte", 0.3);
  for (let x = X0 + 0.2; x < X1; x += 0.3) k.box(f, 0.12, H, 0.06, x, 0, Z0 + 0.17, SAP.oak);
  // creepers hanging from the ceiling along the glass
  creepers(k, f, X1 - 0.4, Z1 - 0.3, X1 - 0.4, Z0 + 0.3, H, 2.2, 11);
  creepers(k, f, X0 + 0.5, Z1 - 0.3, X1 - 0.5, Z1 - 0.3, H, 1.6, 12);

  // ---- reception at the foot of the living wall ------------------------------------------------
  {
    const x = -8.6;
    // a timber counter with a moss front, along z
    k.box(f, 0.8, 1.1, 5.2, x, 0, -10.5, SAP.oak, "matte");
    k.box(f, 1.0, 0.06, 5.4, x, 1.1, -10.5, "#f4f0e8", "polish");
    k.box(f, 0.04, 0.8, 5.0, x + 0.42, 0.18, -10.5, "#3d7a34", "matte");
    for (let z = -12.8; z <= -8.2; z += 0.25) k.box(f, 0.06, 0.12, 0.12, x + 0.45, 0.2 + ((z * 7) % 0.6 + 0.6) % 0.6, z, "#5cb84e", "matte");
    k.box(f, 0.02, 0.05, 5.0, x + 0.42, 0.12, -10.5, GREEN, "glow");
    k.solid(f, x - 0.5, -13.2, x + 0.5, -7.8);
    // the desk screen: ZEC price
    const t = k.screen(f, 0.6, 0.36, (c, W, Hh) => drawTicker(c, W, Hh, { bg: "#08120c" }), 6, 256);
    t.position.set(x - 0.1, 1.42, -9.2);
    t.rotation.y = -Math.PI / 2 + 0.25;
    k.box(f, 0.05, 0.2, 0.05, x - 0.12, 1.12, -9.2, "#2a2a2a");
    k.vox(f, "sap-orchid", () => plant("cactus", 4), x, -12.4, 0, { dy: 1.16, solid: false });
    // the name in light on the living wall over the desk
    k.label(f, "ZK TOWER SAPLING", X0 + 0.32, 4.6, -10.5, { h: 0.62, color: GREEN, ry: Math.PI / 2 });
    k.label(f, "サプリング", X0 + 0.32, 3.9, -10.5, { h: 0.36, color: "#c8ffd8", ry: Math.PI / 2 });
  }

  // ---- the reflecting pool and its island tree ------------------------------------------------
  const P = { x: 3, z: -12.5, w: 7, d: 8 };
  {
    // a stone kerb round a dark basin
    k.box(f, P.w, 0.04, P.d, P.x, 0, P.z, "#0e2224", "polish");
    for (const s of [-1, 1]) {
      k.box(f, P.w + 0.6, 0.34, 0.3, P.x, 0, P.z + s * (P.d / 2 + 0.15), SAP.stone, "polish");
      k.box(f, 0.3, 0.34, P.d, P.x + s * (P.w / 2 + 0.15), 0, P.z, SAP.stone, "polish");
    }
    const ripple = paint(256, 256, (c, W, Hh) => {
      c.fillStyle = "#1a4a4a";
      c.fillRect(0, 0, W, Hh);
      for (let i = 0; i < 60; i++) {
        c.strokeStyle = `rgba(160,240,230,${0.08 + (i % 5) * 0.03})`;
        c.lineWidth = 2;
        c.beginPath();
        const y = (i * 37) % Hh;
        for (let x = 0; x <= W; x += 8) c.lineTo(x, y + Math.sin(x * 0.05 + i) * 4);
        c.stroke();
      }
    }, 2, 2);
    const water = new THREE.MeshStandardMaterial({ map: ripple, color: "#9ad8d0", roughness: 0.05, metalness: 0.3, emissive: "#0a3a38", emissiveIntensity: 0.6 });
    k.flat(f, P.w, P.d, water, P.x, P.z, 0.2);
    k.ticks[f].push((dt) => {
      ripple.offset.x += dt * 0.02;
      ripple.offset.y += dt * 0.011;
    });
    k.solid(f, P.x - P.w / 2 - 0.3, P.z - P.d / 2 - 0.3, P.x + P.w / 2 + 0.3, P.z + P.d / 2 + 0.3);
    // the island, its tree, stepping stones, river pebbles
    k.cyl(f, 1.3, 1.2, 0.4, P.x + 0.6, 0, P.z - 0.4, "#5a5048", "matte", 14);
    k.cyl(f, 1.15, 1.15, 0.05, P.x + 0.6, 0.4, P.z - 0.4, "#4f9a3e", "matte", 14);
    tree(k, f, P.x + 0.6, P.z - 0.4, 5.6, 2.2, 21);
    for (let i = 0; i < 6; i++) k.cyl(f, 0.3, 0.28, 0.32, P.x - 2.8 + i * 0.95, 0, P.z + 3.1 - (i % 2) * 0.4, "#c8c0b0", "matte", 10);
    for (let i = 0; i < 30; i++) k.box(f, 0.14, 0.06, 0.1, P.x - 3.2 + k.rnd(i, 1) * 6.4, 0.24, P.z - 3.6 + k.rnd(i, 2) * 7.2, ["#d8d0c4", "#8a8478", "#b8b0a2"][i % 3], "polish", k.rnd(i, 3) * 3);
    // uplights in the water
    for (const [dx, dz] of [[-2.6, -3.2], [2.8, -3.0], [-2.4, 2.4], [2.6, 2.6]]) k.cyl(f, 0.08, 0.08, 0.04, P.x + dx, 0.25, P.z + dz, "#fff2c8", "glow", 8);
  }

  // ---- the water wall at the back, the live boards over the lifts ------------------------------
  {
    const wx0 = 3.4,
      wx1 = 11.4,
      wh = 4.6;
    k.box(f, wx1 - wx0, wh, 0.2, (wx0 + wx1) / 2, 0, Z0 + 0.4, "#1a1c1e", "polish");
    const sheet = paint(128, 512, (c, W, Hh) => {
      c.fillStyle = "rgba(20,40,44,0.2)";
      c.fillRect(0, 0, W, Hh);
      for (let i = 0; i < 90; i++) {
        c.fillStyle = `rgba(200,250,255,${0.12 + (i % 4) * 0.08})`;
        c.fillRect((i * 13) % W, (i * 71) % Hh, 1.5, 30 + (i % 7) * 14);
      }
    }, 4, 1);
    const sheetMat = new THREE.MeshBasicMaterial({ map: sheet, transparent: true, color: new THREE.Color("#c8f4ff").multiplyScalar(1.2), toneMapped: false, depthWrite: false });
    k.plane(f, wx1 - wx0 - 0.2, wh - 0.3, sheetMat, (wx0 + wx1) / 2, wh / 2 + 0.15, Z0 + 0.52);
    k.ticks[f].push((dt) => (sheet.offset.y += dt * 0.9));
    k.box(f, wx1 - wx0 + 0.4, 0.45, 0.9, (wx0 + wx1) / 2, 0, Z0 + 0.75, SAP.stoneDark, "polish");
    k.box(f, wx1 - wx0, 0.02, 0.6, (wx0 + wx1) / 2, 0.44, Z0 + 0.75, "#7adce4", "glow");
    k.solid(f, wx0 - 0.2, Z0, wx1 + 0.2, Z0 + 1.25);
    k.box(f, wx1 - wx0 + 0.3, 0.12, 0.6, (wx0 + wx1) / 2, wh, Z0 + 0.45, SAP.teak);
  }
  k.lifts(f, -5, Z0 + 0.16, 0, LIFT);
  {
    const b = k.screen(f, 3.6, 2.0, (c, W, Hh) => drawBlocks(c, W, Hh, k.blocks, { accent: GREEN, bg: "#06100a" }), 4);
    b.position.set(-5, 6.0, Z0 + 0.2);
    const s = k.screen(f, 3.6, 2.0, (c, W, Hh) => drawSapling(c, W, Hh), 10);
    s.position.set(7.4, 6.0, Z0 + 0.2);
    for (const x of [-5, 7.4]) k.box(f, 3.8, 2.2, 0.06, x, 4.9, Z0 + 0.16, "#14140f", "polish");
    k.hit(f, 3.6, 2, 0.2, -5, 5.0, Z0 + 0.25, "<b>Blocks</b><span>live from the chain</span>", () => ({ eyebrow: "ZK TOWER SAPLING · Lobby", title: `Block #${k.height.toLocaleString("en-US")}`, mono: true, stats: k.blocks.slice(0, 4).map((b) => [`#${b.height}`, b.miner_pool ?? "—"] as [string, string]) }));
    k.hit(f, 3.6, 2, 0.2, 7.4, 5.0, Z0 + 0.25, "<b>Sapling pool</b><span>ZEC shielded in Sapling</span>", saplingInfo);
  }

  // ---- the lounge by the east glass -------------------------------------------------------------
  k.vox(f, "sap-rug", () => rug(4.4, 3.4, "#d8ccb4", "#7a8a62"), 8.6, -5.6, 0, { solid: false });
  k.vox(f, "sap-egg-g", () => eggChair("#e8e2d0"), 10.6, -4.2, -Math.PI / 2 - 0.4);
  k.vox(f, "sap-egg-s", () => eggChair("#9ab89a"), 10.6, -7.2, -Math.PI / 2 + 0.4);
  k.vox(f, "sap-rattan-l", () => rattanChair("#efe8da"), 7.0, -4.4, Math.PI / 2 - 0.3);
  k.vox(f, "sap-rattan-l", () => rattanChair("#efe8da"), 7.0, -7.0, Math.PI / 2 + 0.3);
  k.vox(f, "coffee", () => coffeeTable(), 8.8, -5.7, Math.PI / 2);
  for (const [x, z, s] of [[10.8, -1.4, 1], [10.9, -10, 2], [6.2, -1.3, 3], [-10.6, -1.4, 4], [-10.6, -16, 5]] as const) k.vox(f, `sap-ficus${s}`, () => plant(s % 2 ? "ficus" : "monstera", s), x, z, s);
  bed(k, f, 9.5, -14.5, 3.2, 1.2, 31, true);
  bed(k, f, 9.5, -18.5, 3.2, 1.2, 32, true);
  // a long oak bench along the front glass
  k.box(f, 7, 0.45, 0.55, -7, 0, -0.7, SAP.oak);
  k.box(f, 7, 0.08, 0.6, -7, 0.45, -0.7, SAP.oakDark);
  k.solid(f, -10.5, -1, -3.5, -0.4);

  // ---- light ------------------------------------------------------------------------------------
  k.light(f, -4, 6.2, -6, "#ffe2b8", 26, 22);
  k.light(f, 6, 6.2, -6, "#ffe2b8", 22, 22);
  k.light(f, 3, 5.5, -16, "#fff0d0", 22, 22);
  k.light(f, -8, 4.5, -18, "#ffdcb0", 16, 18);
  k.light(f, 7.4, 2.5, -22, "#9ae8f0", 8, 10);

  // ---- people -----------------------------------------------------------------------------------
  k.onCast(f, () => {
    void k.person(f, 3131, [-10.0, -10.6], "Concierge", {
      face: [1, 0],
      lines: [
        "Welcome to ZK TOWER SAPLING. The sky garden is on 31, the pool on the roof.",
        () => `Block ${k.height.toLocaleString("en-US")} just landed. The lifts run on time.`,
        "The living wall has twenty thousand plants. I watered none of them.",
        "Residents above 58. Visitors: the garden and the roof.",
      ],
    });
    const a = k.person(f, 4242, [7.0, -4.4], "Resident", { sit: true, face: [1, -0.2] });
    const b = k.person(f, 5151, [10.4, -4.3], "Resident", { sit: true, face: [-1, 0] });
    k.dialog(f, [a, b], [
      [0, "I moved to the 84th floor for the view."],
      [1, "I moved here for the garden on 31."],
      [0, "Sapling made shielded payments fast enough for phones."],
      [1, "And this tower made gardening fast enough for us."],
      [0, () => `${(k.price ?? 0).toFixed(2)} dollars a ZEC today.`],
      [1, "Shielded, it's nobody's business."],
    ], { near: 9 });
    void k.person(f, 6262, [-11.0, -18.4], "Gardener", { face: [-1, 0], wander: [[-11.0, -18.4], [-11.0, -3.6], [-11.0, -14]], lines: ["Ferns at the bottom, orchids at the top. Like the tower.", "This wall drinks a thousand litres a week.", "Every plant here is shielded. Nobody knows how many there are."] });
    void k.person(f, 7373, [1.6, -7.6], "Kid", { face: [0, -1], wander: [[1.6, -7.6], [-1.2, -10], [-1.0, -16.6], [6.6, -7.6]], lines: ["There are fish in the pool! Maybe.", "I counted the blocks to 100. Then I stopped.", "Race you to the lift!"] });
    const c = k.person(f, 8484, [-3.6, -20.6], "Courier", { face: [0, -1] });
    const d = k.person(f, 9191, [-6.6, -20.4], "Developer", { face: [0.6, -1] });
    k.dialog(f, [c, d], [
      [0, "Parcel for 8401. Shielded delivery."],
      [1, "Who's it from?"],
      [0, "No idea. That's the point."],
      [1, "Fair. Going up?"],
    ], { near: 8 });
  });
  void g;
}
