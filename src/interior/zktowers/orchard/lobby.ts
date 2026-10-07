import * as THREE from "three";
import { armchair, coffeeTable, sofa } from "../../furniture";
import { chandelier, palm } from "../../hotel/furniture";
import { stanchion } from "../../needle/props";
import { drawTape, tape } from "../../reserve/data";
import { drawBlocks, GOLD, MONO, num, Surface, usd, type SkyKit } from "../kit";
import { blackMarble, DECO, lobbyFloor, mat, sunburstCeiling, drawTowerMural } from "./art";
import { F, LIFT } from "./levels";

/**
 * Ground floor: the grand lobby, black marble and gold leaf like the Empire State's. A hall of
 * 24 × 26 m and 9 m high under a gold sunburst ceiling with stepped coves; the compass star in
 * the floor; at the back the relief of the tower bursting with rays, its clock, and the
 * concierge's curved desk below it; the brass lifts on the west wall, the departures board of
 * blocks on the east one with the ticker tape; the newsstand, the shoe-shine stand, chesterfields
 * round the star, the revolving doors onto the street.
 */

const f = F.lobby;
const X0 = -12,
  X1 = 12,
  Z0 = -26,
  Z1 = 0,
  H = 9;

export function lobby(k: SkyKit) {
  const g = k.groups[f];

  // ---- floor and ceiling ------------------------------------------------------------------------
  const floor = new THREE.MeshStandardMaterial({ map: lobbyFloor(X1 - X0, Z1 - Z0), roughness: 0.12, metalness: 0.1 });
  k.flat(f, X1 - X0, Z1 - Z0, floor, 0, (Z0 + Z1) / 2);
  const ceilTex = sunburstCeiling(16, 16);
  const ceil = new THREE.MeshStandardMaterial({ map: ceilTex, emissiveMap: ceilTex, emissive: "#ffffff", emissiveIntensity: 0.14, roughness: 0.4, metalness: 0.6 });
  k.plane(f, 16, 16, ceil, 0, H + 0.6, -13, Math.PI / 2);
  // the stepped coves round the sunburst: three gold steps down to the walls, a light line in each
  for (let i = 0; i < 3; i++) {
    const w = 16 + i * 2.6,
      d = 16 + i * 2.6;
    const y = H + 0.6 - i * 0.35;
    const t = 1.3;
    for (const s of [-1, 1]) {
      k.box(f, w + t * 2, 0.35, t, 0, y - 0.35, -13 + (s * (d + t)) / 2, i % 2 ? "#a8822e" : "#d9b25a", "metal");
      k.box(f, t, 0.35, d, (s * (w + t)) / 2, y - 0.35, -13, i % 2 ? "#a8822e" : "#d9b25a", "metal");
    }
    k.box(f, w + 0.2, 0.05, 0.08, 0, y - 0.4, -13 + d / 2 + 0.05, "#b89a60", "glow");
    k.box(f, w + 0.2, 0.05, 0.08, 0, y - 0.4, -13 - d / 2 - 0.05, "#b89a60", "glow");
  }
  k.box(f, X1 - X0, 0.3, Z1 - Z0, 0, H + 0.95, (Z0 + Z1) / 2, "#1a1410", "matte");

  // ---- walls: black marble to 6 m, a gold frieze, gold pilasters ---------------------------------
  const marble = mat(blackMarble(3, 4, 2), 0.12, 0.1);
  for (const [x0, z0, x1, z1] of [
    [X0, Z0, X1, Z0],
    [X0, Z0, X0, Z1],
    [X1, Z0, X1, Z1],
  ] as const) {
    k.wall(f, x0, z0, x1, z1, H + 1, "#141218", "polish", 0.3);
    const len = Math.hypot(x1 - x0, z1 - z0);
    const p = k.plane(f, len, 6, marble, (x0 + x1) / 2, 3, (z0 + z1) / 2, 0, 0);
    // face into the room
    if (z0 === z1) p.position.z += 0.16;
    else {
      p.rotation.y = x0 < 0 ? Math.PI / 2 : -Math.PI / 2;
      p.position.x += x0 < 0 ? 0.16 : -0.16;
    }
  }
  // the frieze: a gold band with a zigzag of light over it, all round
  for (const [w, d, x, z] of [
    [X1 - X0, 0.12, 0, Z0 + 0.2],
    [0.12, Z1 - Z0, X0 + 0.2, -13],
    [0.12, Z1 - Z0, X1 - 0.2, -13],
  ] as const) {
    k.box(f, w, 0.5, d, x, 6, z, "#d9b25a", "metal");
    k.box(f, w, 0.06, d, x, 6.55, z, "#ffe6b0", "glow");
    k.box(f, w, 0.12, d, x, 5.88, z, "#a8822e", "metal");
  }
  // fluted gold pilasters with stepped capitals
  const pilaster = (x: number, z: number, ry: number) => {
    k.box(f, 0.6, 6, 0.16, x, 0, z, "#c9a24a", "metal", ry);
    for (const o of [-0.18, 0, 0.18]) {
      const dx = Math.cos(ry) * o,
        dz = -Math.sin(ry) * o;
      k.box(f, 0.06, 5.6, 0.2, x + dx, 0.2, z + dz, "#8a6420", "metal", ry);
    }
    k.box(f, 0.8, 0.25, 0.24, x, 5.75, z, "#e8c060", "metal", ry);
    k.box(f, 0.7, 0.2, 0.22, x, 0, z, "#8a6420", "metal", ry);
  };
  for (let z = -23; z <= -3; z += 5) if (Math.abs(z + 13) > 3) pilaster(X0 + 0.2, z, Math.PI / 2), pilaster(X1 - 0.2, z, Math.PI / 2);
  for (const x of [-10, -6, 6, 10]) pilaster(x, Z0 + 0.2, 0);

  // ---- the front: glass and gold, three revolving doors -----------------------------------------
  k.curtain(f, X0, Z1, X1, Z1, H, "#c9a24a", 2, { transom: 3.4 });
  k.box(f, X1 - X0, 0.3, 0.3, 0, 3.3, Z1, "#a8822e", "metal");
  for (const dx of [-3.2, 0, 3.2]) {
    k.cyl(f, 1.25, 1.25, 0.25, dx, 2.75, Z1, "#d9b25a", "metal", 24);
    k.cyl(f, 1.25, 1.25, 0.06, dx, 0, Z1, "#a8822e", "metal", 24);
    k.geo(f, new THREE.CylinderGeometry(1.2, 1.2, 2.75, 24, 1, true).translate(dx, 1.375, Z1), "#cfe4f4", "glass");
    for (let i = 0; i < 4; i++) k.box(f, 1.15, 2.6, 0.05, dx + Math.cos((i * Math.PI) / 4) * 0.58, 0.1, Z1 - Math.sin((i * Math.PI) / 4) * 0.58, "#cfe4f4", "glass", (i * Math.PI) / 4);
    k.cyl(f, 0.06, 0.06, 2.75, dx, 0, Z1, "#d9b25a", "metal", 8);
  }
  // the transom: a gold grille of rays over the doors
  for (let i = 0; i < 15; i++) {
    const a = Math.PI * (i / 14);
    k.geo(f, new THREE.BoxGeometry(0.06, 3.0, 0.05).translate(0, 1.9, 0).rotateZ(a - Math.PI / 2).translate(0, 3.45, Z1 - 0.06), "#d9b25a", "metal");
  }
  for (const r of [1.2, 2.4]) k.geo(f, new THREE.TorusGeometry(r, 0.04, 4, 32, Math.PI).translate(0, 3.45, Z1 - 0.06), "#d9b25a", "metal");
  k.label(f, "ZK TOWER ORCHARD", 0, 7.6, Z1 - 0.2, { h: 0.5, color: GOLD, ry: Math.PI, font: `800 96px ${DECO}` });
  // a red runner from the doors to the star
  k.box(f, 2.4, 0.02, 7.5, 0, 0, -4.2, "#7a1420", "matte");
  k.box(f, 2.6, 0.015, 7.6, 0, 0, -4.2, "#c9a24a", "metal");

  // ---- the relief of the tower and the concierge ---------------------------------------------------
  const mural = new Surface(1024, 768, 1);
  mural.mat.toneMapped = true;
  const drawMural = () => mural.draw((c, W, Hh) => drawTowerMural(c, W, Hh));
  drawMural();
  let minute = -1;
  k.ticks[f].push(() => {
    const m = new Date().getMinutes();
    if (m !== minute) {
      minute = m;
      drawMural();
    }
  });
  k.plane(f, 8, 6, mural.mat, 0, 5.8, Z0 + 0.18);
  // its gold frame, stepped like the tower
  k.box(f, 8.6, 0.3, 0.2, 0, 2.6, Z0 + 0.2, "#d9b25a", "metal");
  k.box(f, 8.6, 0.3, 0.2, 0, 8.8, Z0 + 0.2, "#d9b25a", "metal");
  for (const s of [-1, 1]) k.box(f, 0.3, 6.5, 0.2, s * 4.15, 2.6, Z0 + 0.2, "#d9b25a", "metal");
  k.box(f, 9.4, 0.12, 0.3, 0, 2.45, Z0 + 0.25, "#ffe6b0", "glow");
  k.hit(f, 8, 6, 0.3, 0, 2.8, Z0 + 0.3, `<b>The relief of the tower</b><span>gold leaf on black marble</span>`, () => ({
    eyebrow: "ZK TOWER ORCHARD · lobby",
    title: "The tower in gold",
    stats: [
      ["Height", "138 m"],
      ["Crown", "6 sunburst arches"],
      ["Named after", "Orchard (NU5, 2022)"],
      ["Proofs", "Halo 2, no trusted setup"],
    ],
  }));
  // the curved concierge desk: black marble, a gold top and fins, a lamp each end
  const DZ = -21.6;
  for (let i = 0; i < 9; i++) {
    const a = -0.9 + (i / 8) * 1.8;
    const x = Math.sin(a) * 4.2,
      z = DZ + Math.cos(a) * 1.6 - 1.6;
    k.box(f, 0.98, 1.1, 0.6, x, 0, z, "#141218", "polish", a);
    k.box(f, 1.02, 0.06, 0.72, x, 1.1, z, "#d9b25a", "metal", a);
    k.box(f, 0.06, 0.9, 0.62, x - Math.cos(a) * 0.48, 0.1, z + Math.sin(a) * 0.48, "#c9a24a", "metal", a);
  }
  k.solid(f, -4.4, DZ - 1, 4.4, DZ + 0.4);
  for (const s of [-1, 1]) {
    k.cyl(f, 0.08, 0.08, 0.5, s * 3.4, 1.16, DZ - 0.3, "#d9b25a", "metal", 8);
    k.cyl(f, 0.24, 0.14, 0.26, s * 3.4, 1.62, DZ - 0.3, "#fff0c8", "glow", 12);
  }
  // the concierge's screen on the desk
  const desk = k.screen(f, 0.62, 0.36, (c, W, Hh) => drawBlocks(c, W, Hh, k.blocks, { title: "ARRIVALS" }), 5, 256);
  desk.position.set(0.8, k.y(f) + 1.38, DZ - 0.9);
  desk.rotation.y = Math.PI;
  k.label(f, "CONCIERGE", 0, 0.62, DZ + 0.31, { h: 0.18, color: GOLD, font: `700 96px ${DECO}` });
  for (const s of [-1, 1]) k.vox(f, "orch-palm", () => palm(4 + s, true), s * 7.6, -23.6);

  // ---- the lifts on the west wall, a velvet rope ----------------------------------------------------
  k.lifts(f, X0 + 0.15, -13, Math.PI / 2, LIFT);
  for (const z of [-17.4, -8.6]) k.vox(f, "orch-stanchion", () => stanchion(0), X0 + 2.2, z, 0);
  k.box(f, 0.06, 0.06, 8.8, X0 + 2.2, 0.85, -13, "#8a1420", "matte");

  // ---- the departures board of blocks and the ticker on the east wall --------------------------------
  const board = k.screen(f, 5.2, 2.8, (c, W, Hh) => drawBlocks(c, W, Hh, k.blocks, { title: "ZCASH · LATEST BLOCKS", accent: GOLD, bg: "#08070a" }), 4, 768);
  board.position.set(X1 - 0.3, k.y(f) + 3.6, -13);
  board.rotation.y = -Math.PI / 2;
  k.box(f, 0.2, 3.2, 5.6, X1 - 0.16, 2.2, -13, "#d9b25a", "metal");
  k.hit(f, 0.3, 2.8, 5.2, X1 - 0.3, 2.2, -13, `<b>Latest blocks</b><span>live from the chain</span>`, () => {
    const b = k.blocks[0];
    return { eyebrow: "ZK TOWER ORCHARD · lobby", title: b ? `Block #${num(b.height)}` : "Blocks", mono: true, stats: b ? [["Pool", b.miner_pool ?? "unknown"], ["Txs", String(b.tx_count || "·")], ["Price", k.price ? usd(k.price) : "—"]] : [] };
  });
  const tapeS = new Surface(2048, 64, 1.2);
  const tapeTex = tapeS.tex;
  tapeTex.wrapS = THREE.RepeatWrapping;
  tapeS.draw((c, W, Hh) => drawTape(c, W, Hh, tape(k.height)));
  const strip = k.plane(f, 9, 0.32, tapeS.mat, X1 - 0.3, 5.45, -13, 0, -Math.PI / 2);
  void strip;
  let tapeAcc = 0;
  k.ticks[f].push((dt) => {
    tapeTex.offset.x = (tapeTex.offset.x + dt * 0.035) % 1;
    tapeAcc += dt;
    if (tapeAcc > 20) {
      tapeAcc = 0;
      tapeS.draw((c, W, Hh) => drawTape(c, W, Hh, tape(k.height)));
    }
  });

  // ---- the hall: chesterfields round the star, chandeliers -------------------------------------------
  for (const s of [-1, 1]) {
    const x = s * 6.2,
      z = -9.5;
    k.vox(f, "orch-sofa", () => sofa("#5a1a14", 3, "#d9b25a"), x, z - 1.7, 0);
    k.vox(f, "orch-sofa", () => sofa("#5a1a14", 3, "#d9b25a"), x, z + 1.7, Math.PI);
    k.vox(f, "orch-arm", () => armchair("#1a1418"), x + s * 2.1, z, -s * Math.PI / 2);
    k.vox(f, "orch-coffee", () => coffeeTable(), x, z, 0);
    k.vox(f, "orch-palm", () => palm(9 + s, true), s * 10.6, -2.2);
  }
  for (const z of [-6, -14.5]) k.add(f, chandelier(1.0, 4, "#fff0c8"), 0, H - 1.6, z);

  // ---- the newsstand (east, by the doors) ----------------------------------------------------------
  {
    const nx = 9.2,
      nz = -4.4;
    k.box(f, 2.6, 1.0, 1.0, nx, 0, nz, "#3a2418", "polish");
    k.box(f, 2.8, 0.08, 1.2, nx, 1.0, nz, "#d9b25a", "metal");
    k.box(f, 2.6, 2.2, 0.3, nx, 0, nz - 0.9, "#2a1a12", "polish");
    // magazines and papers on the racks
    for (let r = 0; r < 3; r++)
      for (let i = 0; i < 9; i++) {
        const col = ["#e8e2d4", "#c83a2a", "#2a5aa8", "#f4b728", "#e8e2d4", "#1a1a20", "#3ab07a"][(i * 3 + r) % 7];
        k.box(f, 0.24, 0.32, 0.03, nx - 1.1 + i * 0.27, 1.15 + r * 0.38, nz - 0.72, col, "matte");
      }
    for (let i = 0; i < 6; i++) k.box(f, 0.34, 0.03, 0.26, nx - 1.0 + i * 0.4, 1.06, nz + 0.1, i % 2 ? "#e8e2d4" : "#d8d0c0", "matte");
    k.box(f, 2.9, 0.4, 1.3, nx, 2.3, nz - 0.4, "#141218", "polish");
    k.label(f, "NEWS · 新聞", nx, 2.5, nz + 0.27, { h: 0.26, color: GOLD });
    k.solid(f, nx - 1.35, nz - 1.1, nx + 1.35, nz + 0.55);
    const paper = k.screen(f, 0.5, 0.3, (c, W, Hh) => {
      c.fillStyle = "#f2ede0";
      c.fillRect(0, 0, W, Hh);
      c.fillStyle = "#121014";
      c.font = `900 ${Math.round(Hh * 0.2)}px ${DECO}`;
      c.textAlign = "center";
      c.fillText("THE SHIELDED TIMES", W / 2, Hh * 0.24);
      c.font = `800 ${Math.round(Hh * 0.17)}px ${MONO}`;
      c.fillText(k.price ? `ZEC ${usd(k.price)}` : "ZEC", W / 2, Hh * 0.55);
      c.font = `600 ${Math.round(Hh * 0.12)}px ${MONO}`;
      c.fillText(`BLOCK #${num(k.height)}`, W / 2, Hh * 0.8);
    }, 20, 256);
    paper.position.set(nx + 0.6, k.y(f) + 1.25, nz - 0.7);
    k.hit(f, 2.6, 2.2, 1.2, nx, 0, nz - 0.3, `<b>The newsstand</b><span>today's papers</span>`, () => ({
      eyebrow: "ZK TOWER ORCHARD · newsstand",
      title: "The Shielded Times",
      stats: [
        ["ZEC", k.price ? usd(k.price) : "—"],
        ["Block", `#${num(k.height)}`],
        ["Price", "one shielded penny"],
      ],
    }));
  }

  // ---- the shoe-shine stand (west, by the doors) -----------------------------------------------------
  {
    const sx = -9.4,
      sz = -3.6;
    k.box(f, 2.4, 0.5, 1.4, sx, 0, sz, "#3a2418", "polish");
    k.box(f, 2.5, 0.05, 1.5, sx, 0.5, sz, "#d9b25a", "metal");
    for (const dx of [-0.6, 0.6]) {
      k.box(f, 0.8, 0.5, 0.7, sx + dx, 0.55, sz - 0.2, "#5a1a14", "polish");
      k.box(f, 0.8, 0.8, 0.12, sx + dx, 1.05, sz - 0.55, "#5a1a14", "polish");
      k.box(f, 0.2, 0.25, 0.2, sx + dx, 0, sz + 0.95, "#c9a24a", "metal");
    }
    k.label(f, "SHOE SHINE", sx, 2.2, sz - 0.6, { h: 0.2, color: GOLD });
    k.solid(f, sx - 1.25, sz - 0.75, sx + 1.25, sz + 0.75);
  }

  // ---- light -------------------------------------------------------------------------------------
  k.light(f, 0, 7.2, -6, "#ffe0b0", 26, 22);
  k.light(f, 0, 7.2, -19, "#ffe0b0", 26, 22);
  k.light(f, -8, 5, -13, "#ffd9a0", 12, 14);
  k.light(f, 8, 5, -13, "#ffd9a0", 12, 14);
  k.light(f, 0, 4.5, -3, "#fff2d8", 3, 8);
  void g;

  // ---- people ------------------------------------------------------------------------------------
  k.onCast(f, () => {
    void k.person(f, 4311, [2.2, -1.9], "Doorman", { face: [0, -1], cap: true, lines: ["Good evening. Lifts on your left.", "Observatory's on 86. Bring a coin for the telescopes.", () => `Block ${num(k.height)}. Busy night on the chain.`] });
    void k.person(f, 1930, [0, DZ - 1.0], "Concierge", { face: [0, 1], lines: ["Welcome to ZK TOWER ORCHARD.", "The Nullifier opens at nine. Jazz on 64.", "Orchard Capital is on 18. They're expecting you.", () => (k.price ? `ZEC is ${usd(k.price)} tonight.` : "The market's quiet tonight.")] });
    const a = k.person(f, 7121, [-1.6, -16.4], "Tourist", { face: [0.2, -1] });
    const b = k.person(f, 7122, [0.4, -16.8], "Tourist", { face: [-0.1, -1] });
    k.dialog(f, [a, b], [
      [0, "Look, the whole tower in gold leaf."],
      [1, "Like the Empire State's lobby."],
      [0, "And that crown on top: pure Chrysler."],
      [1, "Built in 410 days, they say."],
      [0, "No trusted setup either."],
    ], { near: 9 });
    void k.person(f, 2468, [-9.6, -10.6], "Banker", { face: [-1, 0], lines: ["Eighteenth floor. Late again.", "These lifts are faster than a block.", "Board meeting. Shielded, of course."] });
    void k.person(f, 6006, [9.4, -3.4], "News vendor", { face: [-1, 0.4], lines: ["Shielded Times! Get your Shielded Times!", () => `Block ${num(k.height)}, read all about it!`, "Price on page one, your balance nowhere."] });
    const shiner = k.person(f, 3321, [-9.4, -2.6], "Shoe shiner", { face: [0, -1] });
    const client = k.person(f, 3322, [-9.0, -3.7], "Broker", { face: [0, 1], sit: true, dy: 0.5 });
    k.dialog(f, [shiner, client], [
      [0, "Big day on Wall Street?"],
      [1, "Moved everything to Orchard."],
      [0, "Smart. Nobody sees your shoes there."],
    ], { near: 8 });
    void k.person(f, 5150, [6, -16], "Security", { face: [0, 1], cap: true, wander: [[6, -16], [-6, -16], [0, -6], [7, -6]], lines: ["Evening.", "No photos of the concierge, please."] });
  });
}
