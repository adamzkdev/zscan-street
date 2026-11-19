import * as THREE from "three";
import { links } from "../../data/zscan";
import { armchair, coffeeTable, floorLamp, indoorTree, rug, sofa } from "../furniture";
import { marbleTex, paint, type SkyKit } from "../zktowers/kit";
import { column, cutCorner } from "./props";
import { bezel, board, cap, F, glow, GOLD, header, hexA, LEVELS, LIFT, LIFT_STYLE, ledBg, mix, MONO, neon, NU7, num, Nu7Live, PLUM, PX, scan, span, VIOLET } from "./shared";

/**
 * G · NU7 HALL: the lobby. In the middle the activation monument, the block NU7 went live on
 * (#3,543,405) turning in a column of violet light over a granite pedestal engraved with its date
 * and its consensus branch id; at the back the 25 s ERA board (blocks since NU7, the spacing of the
 * last hundred, the live tip), the NU7 spec and the arrivals; reception on the east, the lifts and
 * the directory on the west, a lounge by the windows, the city through the glass.
 */

const f = F.hall;
const X0 = -15,
  X1 = 15,
  Z0 = -30,
  Z1 = 0,
  H = 10;
const MZ = -15;

export function hall(k: SkyKit, live: Nu7Live) {
  // ---- floor, ceiling --------------------------------------------------------------------------------
  const stone = marbleTex(71, "#1a1522", "#6a4fa0", 512, 4, 6, 6, "rgba(244,183,40,0.22)");
  k.flat(f, X1 - X0, Z1 - Z0, new THREE.MeshStandardMaterial({ map: stone, roughness: 0.12, metalness: 0.15 }), 0, (Z0 + Z1) / 2);
  k.box(f, X1 - X0, 0.3, Z1 - Z0, 0, H, (Z0 + Z1) / 2, PLUM);
  // a coffered ceiling: gold ribs every three metres
  for (let x = X0 + 3; x < X1; x += 3) k.box(f, 0.08, 0.14, Z1 - Z0, x, H - 0.14, (Z0 + Z1) / 2, "#8a6a2a", "metal");
  for (let z = Z0 + 3; z < Z1; z += 3) k.box(f, X1 - X0, 0.14, 0.08, 0, H - 0.14, z, "#8a6a2a", "metal");
  // rings of light over the monument, violet and gold
  for (const [r, c] of [
    [3.2, VIOLET],
    [4.8, GOLD],
    [6.4, VIOLET],
  ] as const) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.05, 6, 96), new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(1.7), toneMapped: false }));
    ring.rotation.x = Math.PI / 2;
    ring.raycast = () => {};
    k.add(f, ring, 0, H - 0.3, MZ, 0);
  }
  medallion(k);

  // ---- the walls: glass to the street and the sides, stone at the back, the tower's cut corners --------
  const mull = "#2a2236";
  k.curtain(f, X0, Z1, -2.6, Z1, H, mull, 2.2, { transom: 3.8 });
  k.curtain(f, 2.6, Z1, X1, Z1, H, mull, 2.2, { transom: 3.8 });
  k.curtain(f, X0, -12, X0, Z1, H, mull, 2.4, { transom: 3.8 });
  k.wall(f, X0, -26, X0, -12, H, "#211a2c", "polish", 0.4);
  k.curtain(f, X1, -26, X1, -19, H, mull, 2.4, { transom: 3.8 });
  k.curtain(f, X1, -5, X1, Z1, H, mull, 2.4, { transom: 3.8 });
  k.wall(f, X1, -19, X1, -5, H, "#1d1727", "polish", 0.4);
  k.wall(f, -11, Z0, 11, Z0, H, "#1d1727", "polish", 0.4);
  cutCorner(k, f, X0, -26, -11, Z0, H, "#211a2c", 0, MZ);
  cutCorner(k, f, 11, Z0, X1, -26, H, "#211a2c", 0, MZ);
  // the doors: a gold portal, violet neon up its posts, shut behind you (you walk out through it)
  k.box(f, 5.6, 0.34, 0.5, 0, 3.6, Z1, GOLD, "glow");
  for (const x of [-2.7, 2.7]) {
    k.box(f, 0.34, 3.6, 0.5, x, 0, Z1, "#2a2236", "metal");
    k.box(f, 0.06, 3.4, 0.06, x - Math.sign(x) * 0.2, 0.1, Z1 - 0.27, VIOLET, "glow");
  }
  k.box(f, 5.0, 3.6, 0.05, 0, 0, Z1, "#cfe4f4", "glass");
  k.solid(f, -2.6, Z1 - 0.2, 2.6, Z1 + 2);
  const over = neon("NU7 TOWER", 0.5, GOLD);
  k.add(f, over, 0, 4.35, Z1 - 0.3, Math.PI);
  // a runner from the doors to the monument
  k.flat(f, 2.4, 9.4, new THREE.MeshStandardMaterial({ map: runnerTex(), roughness: 0.9 }), 0, -5.4, 0.008);

  // ---- columns ---------------------------------------------------------------------------------------
  for (const x of [-6.5, 6.5]) for (const z of [-7.5, -22.5]) column(k, f, x, z, H);

  // ---- the monument ----------------------------------------------------------------------------------
  monument(k);

  // ---- the back wall: the 25 s ERA, the spec, the arrivals --------------------------------------------
  const zw = Z0 + 0.25;
  bezel(k, f, 12.4, 5.2, 0, 4.9, zw + 0.06, 0);
  board(k, f, 12.4, 5.2, 0, 4.9, zw + 0.06, 0, (g, W, Hh) => drawEra(g, W, Hh, live), 2, 2048);
  bezel(k, f, 3.6, 5.2, -8.6, 4.9, zw + 0.06, 0, VIOLET);
  board(k, f, 3.6, 5.2, -8.6, 4.9, zw + 0.06, 0, (g, W, Hh) => drawSpec(g, W, Hh, live), 30, 512);
  bezel(k, f, 3.6, 5.2, 8.6, 4.9, zw + 0.06, 0, VIOLET);
  board(k, f, 3.6, 5.2, 8.6, 4.9, zw + 0.06, 0, (g, W, Hh) => drawArrivals(g, W, Hh, live), 2, 512);
  const big = neon("二十五秒時代 · THE 25 s ERA", 0.62, VIOLET);
  k.add(f, big, 0, 8.45, zw + 0.08, 0);
  k.hit(f, 12.4, 5.2, 0.3, 0, 2.3, zw + 0.2, `<b>The 25 s era</b><span>blocks since NU7 · spacing · tip</span>`, () => eraInfo(live));
  k.hit(f, 3.6, 5.2, 0.3, -8.6, 2.3, zw + 0.2, `<b>NU7</b><span>the upgrade's numbers</span>`, () => specInfo());
  k.hit(f, 3.6, 5.2, 0.3, 8.6, 2.3, zw + 0.2, `<b>Arrivals</b><span>the last blocks</span>`, () => eraInfo(live));

  // ---- reception, east ----------------------------------------------------------------------------------
  {
    const DX = 9.8,
      z0 = -16,
      z1 = -8;
    k.box(f, 1.0, 1.08, z1 - z0, DX, 0, (z0 + z1) / 2, "#120e18", "polish");
    k.box(f, 1.14, 0.06, z1 - z0 + 0.14, DX, 1.08, (z0 + z1) / 2, GOLD, "metal");
    k.box(f, 0.04, 0.05, z1 - z0, DX - 0.52, 0.06, (z0 + z1) / 2, VIOLET, "glow");
    for (let z = z0 + 0.5; z < z1; z += 0.5) k.box(f, 0.03, 0.9, 0.03, DX - 0.51, 0.12, z, "#8a6a2a", "metal");
    // a raised counter on the visitor's side, glass, lit from under
    k.box(f, 0.32, 0.04, z1 - z0 - 1, DX - 0.62, 1.22, (z0 + z1) / 2, "#cfe4f4", "glass");
    k.box(f, 0.3, 0.02, z1 - z0 - 1, DX - 0.62, 1.2, (z0 + z1) / 2, GOLD, "glow");
    k.solid(f, DX - 0.7, z0 - 0.1, DX + 0.6, z1 + 0.1);
    // the desk's screen (live tip)
    board(k, f, 0.62, 0.38, DX - 0.05, 1.42, -10.2, -Math.PI / 2 - 0.25, (g, W, Hh) => drawDesk(g, W, Hh, live), 1, 256);
    k.box(f, 0.06, 0.3, 0.06, DX + 0.02, 1.12, -10.2, "#2a2236", "metal");
    // flowers
    k.cyl(f, 0.12, 0.09, 0.3, DX, 1.14, -14.6, "#f2eee6", "polish", 12);
    for (let i = 0; i < 7; i++) k.cyl(f, 0.07, 0.07, 0.08, DX + Math.cos(i) * 0.1, 1.46 + (i % 3) * 0.05, -14.6 + Math.sin(i) * 0.1, i % 2 ? VIOLET : "#ffe2f0", "matte", 8);
    // the backdrop: a violet-black panel with gold fins, the tower's name and its 七
    const bx = X1 - 0.25;
    for (let z = -18.4; z <= -5.6; z += 1.6) k.box(f, 0.1, H - 1.2, 0.12, bx - 0.06, 0.6, z, "#8a6a2a", "metal");
    const seven = neon("七", 3.2, VIOLET, { k: 1.8 });
    k.add(f, seven, bx - 0.14, 6.1, -12, -Math.PI / 2);
    const name = neon("NU7 TOWER", 0.58, GOLD);
    k.add(f, name, bx - 0.14, 3.2, -12, -Math.PI / 2);
    const sub = neon("七番塔", 0.34, "#efe6ff", { k: 1.2 });
    k.add(f, sub, bx - 0.14, 2.6, -12, -Math.PI / 2);
    k.box(f, 0.08, 0.06, 13.4, bx - 0.1, H - 0.6, -12, VIOLET, "glow");
    k.box(f, 0.08, 0.06, 13.4, bx - 0.1, 0.5, -12, VIOLET, "glow");
    k.hit(f, 1.2, 1.4, 8, DX, 0, -12, `<b>Reception</b><span>NU7 TOWER</span>`, () => ({
      eyebrow: "NU7 TOWER · reception",
      title: "NU7 TOWER",
      stats: LEVELS.slice()
        .reverse()
        .slice(0, 4)
        .map((l) => [l.label, l.name.split(" · ")[0]] as [string, string]),
      body: `<p>${LEVELS.map((l) => `<b>${l.label}</b> ${l.name.split(" · ")[0]}`).join(" · ")}</p>`,
    }));
  }

  // ---- the lifts and the directory, west -----------------------------------------------------------------
  const [lx, lz, lry] = LIFT[f];
  k.lifts(f, lx, lz, lry, LIFT_STYLE);
  bezel(k, f, 2.6, 3.4, X0 + 0.3, 2.6, -14.0, Math.PI / 2, VIOLET);
  board(k, f, 2.6, 3.4, X0 + 0.3, 2.6, -14.0, Math.PI / 2, (g, W, Hh) => drawDirectory(g, W, Hh), 60, 512);
  const lab = neon("LIFTS · エレベーター", 0.3, "#efe6ff", { k: 1.2 });
  k.add(f, lab, X0 + 0.32, 4.7, lz, Math.PI / 2);

  // ---- the lounge by the west windows -------------------------------------------------------------------
  k.vox(f, "nu7-rug", () => rug(5.6, 4.2, "#2a1f3d", "#c9a24a"), -9.4, -5.6, 0, { solid: false });
  k.vox(f, "nu7-sofa", () => sofa("#3a2a55", 3, "#f4b728"), -12.6, -5.6, Math.PI / 2);
  k.vox(f, "nu7-sofa", () => sofa("#3a2a55", 3, "#f4b728"), -6.2, -5.6, -Math.PI / 2);
  k.vox(f, "nu7-table", coffeeTable, -9.4, -5.6, 0);
  k.vox(f, "nu7-arm", () => armchair("#5a3a88"), -9.4, -2.6, Math.PI);
  k.vox(f, "nu7-lamp", floorLamp, -13.6, -8.2, 0);
  k.vox(f, "nu7-lamp", floorLamp, -13.6, -2.4, 0);
  // plants in tall black planters with a gold lip
  for (const [x, z, s] of [
    [-13.3, -1.4, 71],
    [13.3, -1.4, 72],
    [-11.6, -24.6, 73],
    [11.6, -24.6, 74],
  ] as const) {
    k.cyl(f, 0.62, 0.72, 0.75, x, 0, z, "#141019", "polish", 24);
    k.cyl(f, 0.74, 0.74, 0.03, x, 0.75, z, GOLD, "metal", 24);
    k.vox(f, `nu7-tree${s}`, () => indoorTree(s), x, z, 0, { dy: 0.75, k: 0.72 });
    k.solid(f, x - 0.78, z - 0.78, x + 0.78, z + 0.78);
  }

  // ---- light -------------------------------------------------------------------------------------------
  k.light(f, 0, 6.5, MZ, VIOLET, 34, 18);
  k.light(f, 0, 5, -25, "#fff1d6", 16, 16);
  k.light(f, 10.6, 4, -12, "#ffe2b8", 14, 12);
  k.light(f, -9.4, 3.6, -5.6, "#ffe2b8", 12, 12);
  k.light(f, -11, 4.5, -19, "#fff1d6", 12, 12);
  k.light(f, 0, 4, -3, "#ffffff", 10, 12);

  // ---- people ------------------------------------------------------------------------------------------
  const since = () => live.since;
  k.onCast(f, () => {
    void k.person(f, 7101, [11.2, -12.4], "Concierge", {
      face: [-1, 0],
      lines: [
        "Welcome to the NU7 TOWER.",
        () => (since() !== null ? `${num(since()!)} blocks since NU7.` : "NU7 went live at block 3,543,405."),
        "The lifts are on your left. P for the PIT GARAGE.",
        "Block 3,543,405, 6 November 2026, 02:34 UTC.",
      ],
    });
    void k.person(f, 7102, [3.6, -2.2], "Doorman", { face: [0, -1], cap: true, lines: ["Good evening.", "The race is downstairs: lift to P.", "One block every 25 seconds now."] });
    const a = k.person(f, 7103, [-3.9, -10.4], "Visitor", { face: [0.8, -1] });
    const b = k.person(f, 7104, [-2.5, -10.1], "Visitor", { face: [-0.6, -1] });
    k.dialog(f, [a, b], [
      [0, "Block 3,543,405. That's where it switched."],
      [1, () => (since() !== null ? `${num(since()!)} blocks since then.` : "Every 25 seconds now.")],
      [0, () => (live.avg ? `Last hundred: ${live.avg.toFixed(1)} s on average.` : "Right on target.")],
      [1, "A third of the subsidy a block. Same ZEC per hour."],
      [0, "And 60 % of the fees burned. Upstairs, the vault."],
    ]);
    void k.person(f, 7105, [-12.2, -5.9], "Resident", { sit: true, dy: 0.45, face: [1, 0], lines: ["I watch the board. It never stops.", "The circuit's right outside. Hear them?"] });
    void k.person(f, 7106, [4, -24], "Visitor", { wander: [[4, -24], [-4, -24], [-9, -10], [8, -4], [2, -19]], lines: ["That board counts every NU7 block.", "Twenty-five seconds. You can feel it."] });
  });
}

// ---- the monument ------------------------------------------------------------------------------------------

function monument(k: SkyKit) {
  // three granite tiers edged in gold
  const tiers: [number, number, number][] = [
    [6.6, 0, 0.3],
    [5.2, 0.3, 0.3],
    [3.8, 0.6, 0.35],
  ];
  for (const [w, y, h] of tiers) {
    k.box(f, w, h, w, 0, y, MZ, "#120e18", "polish");
    k.box(f, w + 0.04, 0.04, w + 0.04, 0, y + h - 0.04, MZ, GOLD, "metal");
    k.box(f, w + 0.02, 0.02, w + 0.02, 0, y + 0.02, MZ, VIOLET, "glow");
  }
  // the pedestal and its four engraved plates
  k.box(f, 2.4, 1.3, 2.4, 0, 0.95, MZ, "#0e0b14", "polish");
  k.box(f, 2.5, 0.08, 2.5, 0, 2.25, MZ, GOLD, "metal");
  const plates: [string, string, string, number][] = [
    ["七 · NU7", "MAINNET", "ZIPS 218 · 235 · 237", 0],
    ["ACTIVATION BLOCK", `#${num(NU7.height)}`, "25 s · ZIP 218", Math.PI / 2],
    ["CONSENSUS BRANCH ID", NU7.branch, "ZIP 259", Math.PI],
    ["ACTIVATED", NU7.date, NU7.time, -Math.PI / 2],
  ];
  for (const [a, b, c, ry] of plates) {
    const t = paint(768, 384, (g, W, Hh) => drawPlate(g, W, Hh, a, b, c));
    const mat = new THREE.MeshStandardMaterial({ map: t, roughness: 0.35, metalness: 0.6, emissive: new THREE.Color("#3a2a10"), emissiveMap: t, emissiveIntensity: 0.9 });
    k.plane(f, 2.1, 1.05, mat, Math.sin(ry) * 1.21, 1.62, MZ + Math.cos(ry) * 1.21, 0, ry);
  }
  k.solid(f, -3.4, MZ - 3.4, 3.4, MZ + 3.4);

  // the activation block: a lit cube turning over the pedestal, gold edges, a halo
  const cube = new THREE.Group();
  const S = 2.3;
  const face = (draw: (g: CanvasRenderingContext2D, W: number, Hh: number) => void) => {
    const t = paint(512, 512, draw);
    return new THREE.MeshBasicMaterial({ map: t, toneMapped: false, color: new THREE.Color(1.25, 1.25, 1.25), transparent: true, opacity: 0.94 });
  };
  const faces = [
    face((g, W, Hh) => drawCubeFace(g, W, Hh, `#${num(NU7.height)}`, "BLOCK")),
    face((g, W, Hh) => drawCubeFace(g, W, Hh, "NU7", "七")),
    face((g, W, Hh) => drawCubeFace(g, W, Hh, NU7.branch, "BRANCH ID")),
    face((g, W, Hh) => drawCubeFace(g, W, Hh, NU7.date, NU7.time)),
    face((g, W, Hh) => drawCubeFace(g, W, Hh, "七", "")),
    face((g, W, Hh) => drawCubeFace(g, W, Hh, "七", "")),
  ];
  const body = new THREE.Mesh(new THREE.BoxGeometry(S, S, S), [faces[1], faces[3], faces[4], faces[5], faces[0], faces[2]]);
  body.raycast = () => {};
  cube.add(body);
  const edge = new THREE.MeshBasicMaterial({ color: new THREE.Color(GOLD).multiplyScalar(2.2), toneMapped: false });
  const e = S / 2 + 0.03;
  for (const [ax, ay, az] of [
    [0, 1, 1],
    [0, 1, -1],
    [0, -1, 1],
    [0, -1, -1],
  ])
    for (const [w, h, d, p] of [
      [S + 0.12, 0.07, 0.07, [ax, ay * e, az * e]],
      [0.07, S + 0.12, 0.07, [ay * e, ax, az * e]],
      [0.07, 0.07, S + 0.12, [ay * e, az * e, ax]],
    ] as [number, number, number, number[]][]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), edge);
      bar.position.set(p[0], p[1], p[2]);
      bar.raycast = () => {};
      cube.add(bar);
    }
  k.add(f, cube, 0, 4.7, MZ, 0);
  const halo = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.04, 8, 96), new THREE.MeshBasicMaterial({ color: new THREE.Color(VIOLET).multiplyScalar(2.2), toneMapped: false }));
  halo.rotation.x = Math.PI / 2;
  halo.raycast = () => {};
  k.add(f, halo, 0, 4.7, MZ, 0);
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(1.0, 1.25, 3.4, 48, 1, true),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(VIOLET).multiplyScalar(0.6), transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
  );
  beam.raycast = () => {};
  k.add(f, beam, 0, 2.3 + 1.7, MZ, 0);
  k.ticks[f].push((dt, t) => {
    cube.rotation.y += dt * 0.35;
    cube.position.y = k.y(f) + 4.7 + Math.sin(t * 0.9) * 0.12;
    halo.position.y = cube.position.y + Math.sin(t * 0.6) * 0.5;
    halo.rotation.z = Math.sin(t * 0.4) * 0.12;
  });
  k.hit(f, 6.6, 6.6, 6.6, 0, 0, MZ, `<b>NU7 · block ${num(NU7.height)}</b><span>${NU7.date} · ${NU7.time}</span>`, () => specInfo());
}

function medallion(k: SkyKit) {
  const t = paint(1024, 1024, (g, W) => {
    const c = W / 2;
    g.clearRect(0, 0, W, W);
    g.fillStyle = "#0d0a14";
    g.beginPath();
    g.arc(c, c, c - 6, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = GOLD;
    g.lineWidth = 10;
    g.stroke();
    g.lineWidth = 3;
    g.beginPath();
    g.arc(c, c, c - 92, 0, Math.PI * 2);
    g.stroke();
    // the inscription round the rim
    const text = `NU7 · BLOCK ${num(NU7.height)} · ${NU7.date} · ${NU7.time} · ${NU7.branch} · `;
    g.font = MONO(40, 700);
    g.fillStyle = GOLD;
    g.textAlign = "center";
    g.textBaseline = "middle";
    const n = text.length;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 - Math.PI / 2;
      g.save();
      g.translate(c + Math.cos(a) * (c - 50), c + Math.sin(a) * (c - 50));
      g.rotate(a + Math.PI / 2);
      g.fillText(text[i], 0, 0);
      g.restore();
    }
    // 25 rays for the 25 seconds
    for (let i = 0; i < 25; i++) {
      const a = (i / 25) * Math.PI * 2 - Math.PI / 2;
      g.strokeStyle = i % 5 ? hexA(VIOLET, 0.55) : GOLD;
      g.lineWidth = i % 5 ? 4 : 8;
      g.beginPath();
      g.moveTo(c + Math.cos(a) * 250, c + Math.sin(a) * 250);
      g.lineTo(c + Math.cos(a) * (c - 110), c + Math.sin(a) * (c - 110));
      g.stroke();
    }
  });
  const mat = new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 0.2, metalness: 0.5, emissive: new THREE.Color("#2a1e08"), emissiveMap: t, emissiveIntensity: 0.6 });
  k.flat(f, 11.6, 11.6, mat, 0, MZ, 0.006);
}

function runnerTex() {
  return paint(256, 1024, (g, W, Hh) => {
    g.fillStyle = "#2a1838";
    g.fillRect(0, 0, W, Hh);
    g.fillStyle = GOLD;
    g.fillRect(10, 0, 8, Hh);
    g.fillRect(W - 18, 0, 8, Hh);
    g.fillStyle = hexA(VIOLET, 0.35);
    for (let y = 0; y < Hh; y += 64) {
      g.beginPath();
      g.moveTo(W / 2, y + 8);
      g.lineTo(W / 2 + 40, y + 32);
      g.lineTo(W / 2, y + 56);
      g.lineTo(W / 2 - 40, y + 32);
      g.closePath();
      g.fill();
    }
  });
}

// ---- what the boards draw --------------------------------------------------------------------------------

function drawPlate(g: CanvasRenderingContext2D, W: number, H: number, a: string, b: string, c: string) {
  const grad = g.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, "#3a2e1a");
  grad.addColorStop(1, "#1e170c");
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  g.strokeStyle = GOLD;
  g.lineWidth = 8;
  g.strokeRect(14, 14, W - 28, H - 28);
  g.lineWidth = 2;
  g.strokeRect(30, 30, W - 60, H - 60);
  g.textAlign = "center";
  g.fillStyle = "#e9c55a";
  g.font = MONO(34, 700);
  g.fillText(a, W / 2, 98);
  g.font = b.length > 9 ? MONO(84, 800) : PX(110);
  g.fillStyle = "#ffe08a";
  g.fillText(b, W / 2, 222);
  g.font = MONO(30, 600);
  g.fillStyle = "#c9a24a";
  g.fillText(c, W / 2, 318);
}

function drawCubeFace(g: CanvasRenderingContext2D, W: number, H: number, big: string, small: string) {
  const grad = g.createRadialGradient(W / 2, H / 2, 20, W / 2, H / 2, W * 0.7);
  grad.addColorStop(0, "rgba(90,50,160,0.92)");
  grad.addColorStop(1, "rgba(18,10,34,0.95)");
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  // a voxel grid, like a block of the city
  g.strokeStyle = "rgba(176,123,255,0.22)";
  g.lineWidth = 2;
  for (let i = 1; i < 8; i++) {
    g.beginPath();
    g.moveTo((i * W) / 8, 0);
    g.lineTo((i * W) / 8, H);
    g.moveTo(0, (i * H) / 8);
    g.lineTo(W, (i * H) / 8);
    g.stroke();
  }
  g.textAlign = "center";
  g.textBaseline = "middle";
  const px = big.length > 8 ? 62 : big.length > 4 ? 120 : 220;
  g.font = PX(px);
  g.shadowColor = GOLD;
  g.shadowBlur = 24;
  g.fillStyle = "#ffe7a8";
  g.fillText(big, W / 2, small ? H * 0.46 : H / 2);
  g.shadowBlur = 0;
  if (small) {
    g.font = PX(46);
    g.fillStyle = "#d9c6ff";
    g.fillText(small, W / 2, H * 0.72);
  }
}

function drawEra(g: CanvasRenderingContext2D, W: number, H: number, live: Nu7Live) {
  ledBg(g, W, H);
  const hh = 70;
  header(g, W, hh, "二十五秒時代", "THE 25 s ERA", VIOLET, live.tip ? `TIP #${num(live.tip)}` : "");
  // left: blocks since NU7
  cap(g, "BLOCKS SINCE NU7", 64, 170, 44);
  glow(g, live.since !== null ? num(live.since) : "—", 56, 420, 250, VIOLET);
  cap(g, `${NU7.date} ${NU7.time} · ${span(Date.now() - NU7.at)}`, 64, 500, 40, "#c9bde6");
  // right: the spacing
  const rows: [string, string, string][] = [
    ["AVG · LAST 100", live.avg ? `${live.avg.toFixed(1)} s` : "—", GOLD],
    ["AVG · SINCE NU7", live.avgSince ? `${live.avgSince.toFixed(1)} s` : "—", "#efe6ff"],
    ["TARGET", `${NU7.target} s`, VIOLET],
  ];
  rows.forEach(([l, v, c], i) => {
    const y = 160 + i * 128;
    cap(g, l, 1290, y, 38);
    glow(g, v, W - 70, y + 70, 92, c, "right");
  });
  g.fillStyle = hexA(VIOLET, 0.35);
  g.fillRect(1240, 110, 3, 400);
  // the strip: spacing of the last blocks, oldest left
  const gaps = live.gaps.slice().reverse();
  const x0 = 64,
    x1 = W - 64,
    y0 = 590,
    y1 = H - 52;
  cap(g, "LAST 100 BLOCKS · SPACING", x0, y0 - 18, 34);
  const max = Math.max(60, ...gaps.map((x) => x.s));
  cap(g, gaps.length ? `MAX ${Math.round(max)} s` : "", x1, y0 - 18, 34, "#8d84a3", "right");
  g.fillStyle = "rgba(255,255,255,0.04)";
  g.fillRect(x0, y0, x1 - x0, y1 - y0);
  const bw = (x1 - x0) / Math.max(99, gaps.length);
  const yOf = (s: number) => y1 - (Math.min(s, max) / max) * (y1 - y0);
  gaps.forEach((x, i) => {
    const y = yOf(x.s);
    g.fillStyle = x.s <= NU7.target ? VIOLET : mix(GOLD, "#ff7a3a", Math.min(1, (x.s - NU7.target) / 60));
    g.fillRect(x0 + i * bw + 2, y, bw - 4, y1 - y);
  });
  // the target line
  const ty = yOf(NU7.target);
  g.strokeStyle = GOLD;
  g.lineWidth = 3;
  g.setLineDash([14, 10]);
  g.beginPath();
  g.moveTo(x0, ty);
  g.lineTo(x1, ty);
  g.stroke();
  g.setLineDash([]);
  cap(g, "25 s", x0 + 8, ty - 10, 30, GOLD);
  scan(g, W, H, 4);
}

function drawSpec(g: CanvasRenderingContext2D, W: number, H: number, live: Nu7Live) {
  ledBg(g, W, H, GOLD);
  header(g, W, 52, "仕様", "NU7", GOLD);
  const nu7 = live.upgrade("Nu7");
  const rows: [string, string][] = [
    ["ACTIVATION", `#${num(nu7?.activation_height ?? NU7.height)}`],
    ["DATE", NU7.date],
    ["UTC", NU7.time.replace(" UTC", "")],
    ["BRANCH ID", nu7?.branch_id ? `0x${nu7.branch_id.toUpperCase()}` : NU7.branch],
    ["TARGET", `${nu7?.target_block_time ?? NU7.target} s`],
    ["SUBSIDY", `${NU7.subsidy}`],
    ["FEES → NSM", "60 %"],
    ["HALVING", `#${num(NU7.halving)}`],
  ];
  rows.forEach(([l, v], i) => {
    const y = 108 + i * 75;
    cap(g, l, 26, y, 24);
    glow(g, v, W - 24, y + 36, 38, i % 2 ? "#efe6ff" : GOLD, "right", 0.25);
    g.fillStyle = "rgba(255,255,255,0.06)";
    g.fillRect(20, y + 50, W - 40, 2);
  });
  scan(g, W, H, 3);
}

function drawArrivals(g: CanvasRenderingContext2D, W: number, H: number, live: Nu7Live) {
  ledBg(g, W, H);
  header(g, W, 52, "到着", "ARRIVALS", VIOLET);
  const b = live.blocks;
  const gaps = live.gaps;
  for (let i = 0; i < 9; i++) {
    const r = b[i];
    if (!r) break;
    const y = 112 + i * 76;
    glow(g, `#${num(r.height)}`, 22, y, 34, i === 0 ? GOLD : "#efe6ff", "left", 0.25);
    const s = gaps[i]?.s;
    if (s !== undefined) glow(g, `${Math.round(s)} s`, W - 22, y, 34, s <= NU7.target ? VIOLET : "#ff9a52", "right", 0.25);
    cap(g, (r.miner_pool ?? "—").slice(0, 16).toUpperCase(), 24, y + 30, 22);
    cap(g, `${Math.max(0, r.tx_count - 1)} tx`, W - 22, y + 30, 22, "#8d84a3", "right");
  }
  scan(g, W, H, 3);
}

function drawDirectory(g: CanvasRenderingContext2D, W: number, H: number) {
  ledBg(g, W, H, GOLD);
  header(g, W, 56, "案内", "NU7 TOWER", GOLD);
  const JP: Record<string, string> = { G: "ホール", P: "ピット", "7": "金庫", "25": "時計", "35": "観測所", R: "展望台" };
  const order = [5, 4, 3, 2, 0, 1];
  order.forEach((i, n) => {
    const l = LEVELS[i];
    const y = 128 + n * 104;
    g.fillStyle = hexA(i === 1 ? GOLD : VIOLET, 0.16);
    g.fillRect(16, y - 46, W - 32, 88);
    glow(g, l.label, 40, y + 12, 56, i === 1 ? GOLD : VIOLET, "left", 0.3);
    glow(g, l.name.split(" · ")[0], 140, y - 4, 30, "#efe6ff", "left", 0.2);
    cap(g, JP[l.label] ?? "", 142, y + 32, 24, "#a99cc8");
  });
  scan(g, W, H, 3);
}

function drawDesk(g: CanvasRenderingContext2D, W: number, H: number, live: Nu7Live) {
  ledBg(g, W, H);
  cap(g, "TIP", 14, 40, 26);
  glow(g, live.tip ? `#${num(live.tip)}` : "—", 14, 92, 40, GOLD, "left", 0.2);
  const e = live.elapsed;
  cap(g, e !== null ? `+${Math.floor(e)} s` : "", W - 14, 40, 26, VIOLET, "right");
  scan(g, W, H, 3);
}

// ---- what a click shows ----------------------------------------------------------------------------------

function specInfo() {
  return {
    eyebrow: "NU7 HALL · activation monument",
    title: `NU7 · block ${num(NU7.height)}`,
    mono: true,
    stats: [
      ["Activated", `${NU7.date} ${NU7.time}`],
      ["Branch ID", `${NU7.branch} · ZIP 259`],
      ["Block time", "25 s · ZIP 218"],
      ["Fees burned", "60 % · NSM · ZIP 235"],
    ] as [string, string][],
    body: `<p>Block subsidy ${NU7.oldSubsidy} → ${NU7.subsidy} ZEC (÷ 3): the same issuance per hour. NSM reissuance: ZIP 237. Next halving: block ${num(NU7.halving)}.</p>`,
    link: { href: links.block(NU7.height), label: `Block ${num(NU7.height)} on ZScan` },
  };
}

function eraInfo(live: Nu7Live) {
  return {
    eyebrow: "NU7 HALL · the 25 s era",
    title: live.tip ? `Tip #${num(live.tip)}` : "The 25 s era",
    mono: true,
    stats: [
      ["Since NU7", live.since !== null ? `${num(live.since)} blocks` : "—"],
      ["Avg · last 100", live.avg ? `${live.avg.toFixed(2)} s` : "—"],
      ["Avg · since NU7", live.avgSince ? `${live.avgSince.toFixed(2)} s` : "—"],
      ["Target", "25 s"],
    ] as [string, string][],
    link: live.tip ? { href: links.block(live.blocks[0]?.height ?? live.tip), label: "Latest block on ZScan" } : undefined,
  };
}
