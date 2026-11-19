import * as THREE from "three";
import { LINE } from "../../game/nu7quarter";
import { racingSim } from "../furniture";
import type { PickInfo } from "../types";
import { paint, type SkyKit } from "../zktowers/kit";
import { cooler, helmet, kartModel, kartStand, toolChest, trophy } from "./props";
import { bezel, board, cap, F, glow, GOLD, header, hexA, LIFT, LIFT_STYLE, ledBg, mix, neon, NU7, num, Nu7Live, PX, scan, teamName, VIOLET, type Team } from "./shared";

/**
 * P · the PIT GARAGE: the tower's ground floor on the circuit side. Four bays open onto the pit
 * lane and the NU7 GRAND PRIX beyond (the real circuit, through the open doors), a kart on its
 * stand in each, tool chests, tyre stacks; the teams on the pit wall are the mining pools of the last
 * hundred blocks. In the paddock: the RACE terminal (SNARK KART on this circuit), live timing,
 * the podium, the sims, the helmets.
 */

const f = F.pit;
const X0 = -18,
  X1 = 14,
  Z0 = -26,
  Z1 = 0,
  H = 7;
/** The apron and the pit wall, west of the doors. */
const AX = -24;
/** Bays: their middles (z), their liveries. */
const BAYS = [-22.75, -16.25, -9.75, -3.25];
const LIVERY = [VIOLET, GOLD, "#3ef0ff", "#ff3e8a"];
const TRIM = [GOLD, "#1c1a22", "#f2f0ea", "#f2f0ea"];
const RACE: PickInfo = { eyebrow: "PIT GARAGE · SNARK KART", title: "NU7 GRAND PRIX", race: true, stats: [["Circuit", "NU7 GRAND PRIX"], ["Game", "SNARK KART"]] };

export function pit(k: SkyKit, live: Nu7Live) {
  // ---- floor: epoxy, the bays marked out; the apron outside -------------------------------------------
  k.flat(f, X1 - X0, Z1 - Z0, new THREE.MeshStandardMaterial({ map: floorTex(), roughness: 0.32, metalness: 0.1 }), (X0 + X1) / 2, (Z0 + Z1) / 2);
  k.flat(f, X0 - AX, Z1 - Z0, new THREE.MeshStandardMaterial({ map: apronTex(), roughness: 0.92 }), (AX + X0) / 2, (Z0 + Z1) / 2, 0.004);
  // ceiling: dark steel deck, trusses, strip lights
  k.box(f, X1 - X0, 0.25, Z1 - Z0, (X0 + X1) / 2, H, (Z0 + Z1) / 2, "#1a1820");
  for (const z of [-26, -19.5, -13, -6.5, 0]) {
    k.box(f, X1 - X0, 0.5, 0.22, (X0 + X1) / 2, H - 0.5, z, "#2c2a34", "metal");
    for (let x = X0 + 1; x < X1; x += 2) k.box(f, 0.05, 0.42, 0.05, x, H - 0.92, z, "#4a4854", "metal", 0.6);
  }
  for (const z of [...BAYS.map((b) => b), -13]) for (const x of [-15, -10.5]) k.box(f, 2.4, 0.06, 0.18, x, H - 0.32, z, "#f6f4ff", "glow");
  for (let x = -4; x < X1 - 1; x += 4) for (const z of [-21, -13, -5]) k.box(f, 2.4, 0.06, 0.18, x, H - 0.32, z, "#f6f4ff", "glow");

  // ---- walls ------------------------------------------------------------------------------------------
  k.wall(f, X0, Z0, X1, Z0, H, "#34303f", "matte", 0.4);
  k.wall(f, X0, Z1, X1, Z1, H, "#34303f", "matte", 0.4);
  k.wall(f, X1, Z0, X1, Z1, H, "#34303f", "matte", 0.4);
  // white acoustic panels over the bays' back walls, lit from the top
  for (const z of [Z0 + 0.22, Z1 - 0.22]) {
    k.box(f, 10.6, 1.4, 0.06, -12.6, 3.2, z, "#d8d6e0", "matte");
    k.box(f, 10.6, 0.06, 0.08, -12.6, 4.6, z, "#f6f4ff", "glow");
  }
  // a violet line along the walls at hand height, gold at the foot
  for (const [a, b, c, d] of [
    [X0, Z0 + 0.22, X1, Z0 + 0.22],
    [X0, Z1 - 0.22, X1, Z1 - 0.22],
    [X1 - 0.22, Z0, X1 - 0.22, Z1],
  ] as const) {
    k.wall(f, a, b, c, d, 0.05, VIOLET, "glow", 0.04, 1.2, false);
    k.wall(f, a, b, c, d, 0.12, GOLD, "metal", 0.04, 0, false);
  }
  // the garage front: columns between the bays, the fascia, the doors rolled up
  for (const z of [Z0, -19.5, -13, -6.5, Z1]) {
    k.box(f, 0.7, H, 0.7, X0, 0, z, "#2c2a34", "metal");
    k.box(f, 0.74, 0.12, 0.74, X0, 1.0, z, GOLD, "metal");
    k.solid(f, X0 - 0.35, z - 0.35, X0 + 0.35, z + 0.35);
  }
  k.box(f, 0.5, 1.6, Z1 - Z0, X0, H - 1.6, (Z0 + Z1) / 2, "#16131c", "matte");
  k.box(f, 0.06, 0.06, Z1 - Z0, X0 - 0.27, H - 1.5, (Z0 + Z1) / 2, VIOLET, "glow");
  BAYS.forEach((z) => {
    // the door rolled up on its drum, a last slat hanging under it
    k.geo(f, new THREE.CylinderGeometry(0.34, 0.34, 5.7, 16).rotateX(Math.PI / 2).translate(X0 + 0.2, H - 2.0, z), "#3a3844", "metal");
    k.box(f, 0.06, 0.32, 5.7, X0 + 0.2, H - 2.62, z, "#5a5866", "metal");
  });
  const fascia = neon("NU7 GRAND PRIX · ピット", 0.7, GOLD);
  k.add(f, fascia, X0 - 0.27, H - 0.8, -13, -Math.PI / 2);
  // the apron's ends, the pit wall and its catch fence
  for (const z of [Z0, Z1]) k.wall(f, AX, z, X0, z, 1.1, "#8a8790", "matte", 0.4);
  const stripes = paint(1024, 64, (g, W, Hh) => {
    for (let x = 0; x < W; x += 64) {
      g.fillStyle = (x / 64) % 2 ? VIOLET : GOLD;
      g.fillRect(x, 0, 64, Hh);
    }
  }, 4, 1);
  stripes.magFilter = THREE.NearestFilter;
  k.box(f, 0.6, 1.1, Z1 - Z0, AX, 0, (Z0 + Z1) / 2, "#8a8790", "matte");
  k.plane(f, Z1 - Z0, 0.5, new THREE.MeshStandardMaterial({ map: stripes, roughness: 0.6 }), AX + 0.31, 0.55, (Z0 + Z1) / 2, 0, Math.PI / 2);
  k.solid(f, AX - 0.3, Z0, AX + 0.3, Z1);
  const mesh = paint(32, 32, (g) => {
    g.strokeStyle = "#c9ccd2";
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(32, 32);
    g.moveTo(32, 0);
    g.lineTo(0, 32);
    g.stroke();
  }, (Z1 - Z0) / 0.6, 2.6 / 0.6);
  k.plane(f, Z1 - Z0, 2.6, new THREE.MeshStandardMaterial({ map: mesh, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, metalness: 0.4, roughness: 0.6 }), AX, 1.1 + 1.3, (Z0 + Z1) / 2, 0, Math.PI / 2);
  for (let z = Z0; z <= Z1; z += 4.33) k.box(f, 0.1, 2.7, 0.1, AX, 1.1, z, "#5a5c64", "metal");
  // the pit board, held over the wall: the last block's gap
  board(k, f, 1.1, 0.7, AX + 0.4, 2.9, -13, Math.PI / 2, (g, W, Hh) => drawPitBoard(g, W, Hh, live), 2, 256);
  k.box(f, 0.05, 0.05, 1.6, AX + 0.4, 2.1, -12.4, "#9aa0aa", "metal", 0.8);

  // ---- the bays ---------------------------------------------------------------------------------------
  BAYS.forEach((zc, i) => bay(k, live, i, zc));
  // partitions between the bays, liveried both sides
  for (const z of [-19.5, -13, -6.5]) {
    k.wall(f, X0 + 0.4, z, -7.4, z, 3.0, "#1c1a22", "matte", 0.16);
    k.box(f, -7.4 - X0 - 0.4, 0.05, 0.2, (X0 + 0.4 + -7.4) / 2, 3.0, z, GOLD, "metal");
  }
  BAYS.forEach((zc, i) => {
    const t = paint(1024, 288, (g, W, Hh) => drawLivery(g, W, Hh, i, LIVERY[i]));
    const mat = new THREE.MeshStandardMaterial({ map: t, roughness: 0.5, metalness: 0.2, emissive: new THREE.Color("#ffffff"), emissiveMap: t, emissiveIntensity: 0.18 });
    for (const side of [-1, 1]) {
      const z = zc + side * 3.25;
      // on a partition, or on the end wall where there is none
      const end = z <= Z0 + 0.1 || z >= Z1 - 0.1;
      k.plane(f, 10.4, end ? 1.6 : 2.92, mat, (X0 + 0.4 + -7.4) / 2, end ? 1.55 : 1.5, end ? z - side * 0.24 : z - side * 0.09, 0, side < 0 ? 0 : Math.PI);
    }
  });

  // ---- the paddock ------------------------------------------------------------------------------------
  // the RACE terminal, facing the lifts
  {
    const TX = 2.4,
      TZ = -13;
    k.cyl(f, 2.4, 2.4, 0.012, TX, 0, TZ, "#141019", "polish", 64);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.3, 0.045, 6, 96), new THREE.MeshBasicMaterial({ color: new THREE.Color(VIOLET).multiplyScalar(2), toneMapped: false }));
    ring.rotation.x = Math.PI / 2;
    ring.raycast = () => {};
    k.add(f, ring, TX, 0.02, TZ);
    const ring2 = new THREE.Mesh(new THREE.TorusGeometry(1.98, 0.035, 6, 96), new THREE.MeshBasicMaterial({ color: new THREE.Color(GOLD).multiplyScalar(2), toneMapped: false }));
    ring2.rotation.x = Math.PI / 2;
    ring2.raycast = () => {};
    k.add(f, ring2, TX, 0.02, TZ);
    // the cabinet: a black body, gold trim, the screen tilted up to you
    k.box(f, 1.0, 1.0, 1.9, TX, 0, TZ, "#120e18", "polish");
    k.box(f, 1.04, 0.05, 1.94, TX, 1.0, TZ, GOLD, "metal");
    k.box(f, 0.05, 0.06, 1.9, TX + 0.52, 0.08, TZ, VIOLET, "glow");
    k.box(f, 0.5, 1.9, 1.9, TX - 0.25, 1.0, TZ, "#120e18", "polish");
    k.box(f, 0.54, 0.06, 1.94, TX - 0.25, 2.9, TZ, GOLD, "metal");
    board(k, f, 1.72, 1.24, TX + 0.03, 1.92, TZ, Math.PI / 2, (g, W, Hh, t) => drawRace(g, W, Hh, t), 0.5, 768);
    // the big start button
    k.cyl(f, 0.2, 0.2, 0.06, TX + 0.3, 1.04, TZ, "#3a1a1a", "matte", 24);
    const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.08, 24), new THREE.MeshBasicMaterial({ color: new THREE.Color("#ff3a3a").multiplyScalar(1.6), toneMapped: false }));
    btn.raycast = () => {};
    k.add(f, btn, TX + 0.3, 1.1, TZ);
    k.ticks[f].push((_dt, t) => (btn.scale.y = 0.8 + 0.3 * (Math.sin(t * 6) > 0 ? 1 : 0)));
    const big = neon("RACE", 1.2, "#ff5a6a", { k: 1.9 });
    k.add(f, big, TX - 0.1, 4.25, TZ, Math.PI / 2);
    const jp = neon("レース · NU7 GRAND PRIX", 0.36, GOLD);
    k.add(f, jp, TX - 0.1, 3.35, TZ, Math.PI / 2);
    k.solid(f, TX - 0.55, TZ - 1.0, TX + 0.55, TZ + 1.0);
    k.hit(f, 1.4, 3.2, 2.2, TX, 0, TZ, `<b>RACE</b><span>SNARK KART · NU7 GRAND PRIX</span>`, () => RACE);
  }
  // live timing on the north wall: the pools as teams
  bezel(k, f, 9.6, 3.6, 2.6, 3.7, Z0 + 0.28, 0, VIOLET);
  board(k, f, 9.6, 3.6, 2.6, 3.7, Z0 + 0.28, 0, (g, W, Hh) => drawTiming(g, W, Hh, live), 2, 2048);
  k.hit(f, 9.6, 3.6, 0.3, 2.6, 1.9, Z0 + 0.4, `<b>Live timing</b><span>the mining pools · last 100 blocks</span>`, () => timingInfo(live));
  // the podium against the south wall, the backdrop over it
  {
    const PX0 = 3.4,
      PZ = -1.2;
    const steps: [number, number, string][] = [
      [0, 0.9, "1"],
      [1.7, 0.6, "2"],
      [-1.7, 0.4, "3"],
    ];
    for (const [dx, h, n] of steps) {
      k.box(f, 1.62, h, 1.4, PX0 + dx, 0, PZ, "#f2f0ea", "polish");
      k.box(f, 1.66, 0.05, 1.44, PX0 + dx, h, PZ, GOLD, "metal");
      const t = paint(256, 160, (g, W, Hh) => {
        g.fillStyle = "#1c1a22";
        g.fillRect(0, 0, W, Hh);
        g.fillStyle = n === "1" ? GOLD : n === "2" ? "#d8dce4" : "#d0884a";
        g.font = PX(130);
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText(n, W / 2, Hh / 2 + 6);
      });
      k.plane(f, 0.7, 0.44, new THREE.MeshBasicMaterial({ map: t, toneMapped: false }), PX0 + dx, Math.min(h - 0.26, 0.5), PZ - 0.71, 0, Math.PI);
    }
    k.vox(f, "nu7-trophy", trophy, PX0, PZ, 0, { dy: 0.95 });
    k.solid(f, PX0 - 2.55, PZ - 0.72, PX0 + 2.55, PZ + 0.72);
    // the top three pools on a board over it
    bezel(k, f, 6.2, 1.6, PX0, 4.0, Z1 - 0.28, Math.PI, GOLD);
    board(k, f, 6.2, 1.6, PX0, 4.0, Z1 - 0.28, Math.PI, (g, W, Hh) => drawPodium(g, W, Hh, live), 4, 1024);
    const banner = paint(2048, 384, (g, W, Hh) => drawBanner(g, W, Hh));
    k.plane(f, 9.6, 1.8, new THREE.MeshStandardMaterial({ map: banner, roughness: 0.6, emissive: new THREE.Color("#ffffff"), emissiveMap: banner, emissiveIntensity: 0.35 }), PX0, 6.0, Z1 - 0.24, 0, Math.PI);
    k.hit(f, 5, 3, 1.6, PX0, 0, PZ, `<b>Podium</b><span>the top three pools · last 100 blocks</span>`, () => timingInfo(live));
  }
  // the sims, the helmets, the cooler, flags
  for (const [x, ry] of [
    [8.2, 0],
    [10.4, 0],
  ] as const) {
    k.vox(f, "nu7-sim", () => racingSim(VIOLET), x, -22.4, ry);
    board(k, f, 1.12, 0.9, x, 1.29, -23.3, 0, (g, W, Hh, t) => drawSim(g, W, Hh, t, x), 0.2, 256);
  }
  k.box(f, 0.5, 0.06, 4.2, X1 - 0.5, 1.2, -21.2, "#3a3844", "metal");
  k.box(f, 0.5, 0.06, 4.2, X1 - 0.5, 1.9, -21.2, "#3a3844", "metal");
  // the circuit's map, a lightbox on the north wall
  {
    const t = paint(1024, 640, (g, W, Hh) => {
      g.fillStyle = "#0b0913";
      g.fillRect(0, 0, W, Hh);
      g.fillStyle = VIOLET;
      g.fillRect(0, 0, W, 64);
      g.fillStyle = "#0b0913";
      g.font = PX(40);
      g.textBaseline = "middle";
      g.fillText("コース  NU7 GRAND PRIX", 26, 34);
      trackMap(g, 60, 100, W - 120, Hh - 150, GOLD);
    });
    k.box(f, 4.1, 2.7, 0.14, -4.6, 1.75, Z0 + 0.27, "#16131c", "matte");
    k.plane(f, 3.9, 2.44, new THREE.MeshBasicMaterial({ map: t, toneMapped: false, color: new THREE.Color(1.15, 1.15, 1.15) }), -4.6, 3.1, Z0 + 0.35, 0, 0);
    k.hit(f, 3.9, 2.44, 0.3, -4.6, 1.88, Z0 + 0.45, `<b>The circuit</b><span>NU7 GRAND PRIX · RACE it</span>`, () => RACE);
  }
  for (let i = 0; i < 6; i++) {
    const c = LIVERY[i % 4];
    k.vox(f, `nu7-helmet${i % 4}`, () => helmet(c, TRIM[i % 4] === "#1c1a22" ? "#1c1a22" : GOLD), X1 - 0.5, -23 + (i % 3) * 0.9, -Math.PI / 2, { dy: i < 3 ? 1.26 : 1.96, solid: false });
  }
  k.solid(f, X1 - 0.8, -23.4, X1, -19);
  k.vox(f, "nu7-cooler", cooler, X1 - 0.55, -3.0, -Math.PI / 2);
  flags(k, X1 - 0.24, 4.9, -5.2);

  // ---- the lifts ---------------------------------------------------------------------------------------
  const [lx, lz, lry] = LIFT[f];
  k.lifts(f, lx, lz, lry, LIFT_STYLE);

  // ---- light ---------------------------------------------------------------------------------------------
  k.light(f, -12, 5.5, -19.5, "#f2f4ff", 30, 18);
  k.light(f, -12, 5.5, -6.5, "#f2f4ff", 30, 18);
  k.light(f, 2.4, 4.5, -13, VIOLET, 22, 12);
  k.light(f, 3, 5, -20, "#fff1d6", 22, 16);
  k.light(f, 3.4, 5, -5, "#fff1d6", 22, 16);
  k.light(f, 11, 4.5, -13, "#fff1d6", 10, 12);

  // ---- people --------------------------------------------------------------------------------------------
  const team = (i: number) => live.teams[i] as Team | undefined;
  k.onCast(f, () => {
    void k.person(f, 7201, [-10.6, -21.6], "Mechanic", {
      face: [-1, 0.3],
      cap: true,
      lines: [() => (team(0) ? `${team(0)!.name}: ${team(0)!.blocks} of the last 100 blocks.` : "Tyres warm, chain fresh."), "Torque check. Again.", "These karts run on 25-second laps."],
    });
    void k.person(f, 7202, [-11.2, -8.4], "Mechanic", {
      face: [-1, -0.4],
      cap: true,
      lines: [() => (team(2) ? `Bay 03 is ${team(2)!.name}. ${team(2)!.blocks} blocks.` : "Bay 03, ready."), () => (live.avg ? `The pace: ${live.avg.toFixed(1)} s a block.` : "Pace is 25 seconds.")],
    });
    void k.person(f, 7203, [4.4, -10.2], "Race steward", {
      face: [1, 0],
      cap: true,
      lines: ["The RACE terminal: step up, press start.", "SNARK KART, on the circuit outside.", "Four laps. Mind the hairpins."],
    });
    void k.person(f, 7204, [5.8, -3.6], "Driver", {
      face: [0, -1],
      lines: [
        () => {
          const best = live.teams.filter((t) => t.best !== null).sort((a, b) => a.best! - b.best!)[0];
          return best ? `Fastest gap: ${Math.max(0, best.best!).toFixed(0)} s, ${best.name}.` : "Pole goes to whoever mines the most.";
        },
        "I'd race the miners, but they never stop.",
      ],
    });
    const a = k.person(f, 7205, [9.3, -19.8], "Visitor", { face: [0, -1] });
    const b = k.person(f, 7206, [10.6, -19.6], "Visitor", { face: [-0.5, -1] });
    k.dialog(f, [a, b], [
      [0, () => (team(0) ? `${team(0)!.name} on pole again.` : "Who's on pole?")],
      [1, () => (team(0) ? `${team(0)!.blocks} blocks in the last hundred.` : "Whoever found the most blocks.")],
      [0, "I'm racing next. The terminal by the bays."],
    ]);
  });
}

function bay(k: SkyKit, live: Nu7Live, i: number, zc: number) {
  const c = LIVERY[i];
  k.vox(f, "nu7-stand", kartStand, -12.6, zc, -Math.PI / 2);
  k.vox(f, `nu7-kart${i}`, () => kartModel(c, TRIM[i]), -12.6, zc, -Math.PI / 2, { dy: 0.42 });
  k.hit(f, 2.4, 1.4, 1.8, -12.6, 0, zc, `<b>Kart ${String(i + 1).padStart(2, "0")}</b><span>RACE the NU7 GRAND PRIX</span>`, () => RACE);
  k.vox(f, `nu7-chest${i}`, () => toolChest(i === 1 ? "#d8303a" : c, i + 3), -9.2, zc - 2.75, 0);
  k.vox(f, `nu7-chest${i}`, () => toolChest(i === 1 ? "#d8303a" : c, i + 3), -16.4, zc - 2.75, 0);
  // tyre stacks by the door
  for (const [x, z, n] of [
    [-16.6, zc + 2.3, 4],
    [-15.9, zc + 2.6, 3],
    [-9.4, zc + 2.4, 4],
  ] as const) {
    for (let j = 0; j < n; j++) {
      k.cyl(f, 0.3, 0.3, 0.22, x, j * 0.23, z, "#151318", "matte", 18);
      k.cyl(f, 0.31, 0.31, 0.03, x, j * 0.23 + 0.1, z, j % 2 ? c : "#f2f0ea", "matte", 18);
    }
    k.solid(f, x - 0.32, z - 0.32, x + 0.32, z + 0.32);
  }
  // a jack under the kart's nose, the bay's own lamp over it
  k.box(f, 0.9, 0.12, 0.24, -14.4, 0, zc, "#d8303a", "matte");
  k.box(f, 0.24, 0.24, 0.6, -12.6, H - 1.4, zc, "#2c2a34", "metal");
  k.box(f, 0.2, 0.02, 0.56, -12.6, H - 1.42, zc, "#fff6e0", "glow");
  // the team over the bay, facing in
  bezel(k, f, 5.4, 1.1, X0 + 0.42, 4.25, zc, Math.PI / 2, c);
  board(k, f, 5.4, 1.1, X0 + 0.42, 4.25, zc, Math.PI / 2, (g, W, Hh) => drawTeam(g, W, Hh, i, live.teams[i], c), 4, 1024);
}

function flags(k: SkyKit, x: number, y: number, z: number) {
  const chk = paint(128, 96, (g) => {
    for (let i = 0; i < 8; i++) for (let j = 0; j < 6; j++) (g.fillStyle = (i + j) % 2 ? "#111" : "#f2f2f2"), g.fillRect(i * 16, j * 16, 16, 16);
  });
  chk.magFilter = THREE.NearestFilter;
  for (const s of [-1, 1]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 2.2, 8), new THREE.MeshStandardMaterial({ color: "#c9ccd2", metalness: 0.8, roughness: 0.3 }));
    pole.rotation.x = s * 0.6;
    pole.raycast = () => {};
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.8), new THREE.MeshStandardMaterial({ map: chk, side: THREE.DoubleSide, roughness: 0.8 }));
    flag.position.set(0, 0.7, s * 0.55);
    flag.rotation.y = Math.PI / 2;
    flag.raycast = () => {};
    pole.add(flag);
    k.add(f, pole, x, y, z, 0);
  }
}

// ---- textures ---------------------------------------------------------------------------------------------

const PPM = 32;
function floorTex() {
  return paint((X1 - X0) * PPM, (Z1 - Z0) * PPM, (g, W, Hh) => {
    g.fillStyle = "#3a3a42";
    g.fillRect(0, 0, W, Hh);
    // epoxy mottling
    for (let i = 0; i < 2200; i++) {
      g.fillStyle = `rgba(${i % 2 ? 255 : 0},${i % 2 ? 255 : 0},${i % 2 ? 255 : 0},0.025)`;
      const r = 3 + ((i * 37) % 23);
      g.fillRect((i * 9973) % W, (i * 7919) % Hh, r, r);
    }
    const cx = (x: number) => (x - X0) * PPM,
      cz = (z: number) => (z - Z0) * PPM;
    // the paddock: darker, a violet grid
    g.fillStyle = "#2a2932";
    g.fillRect(cx(-7), 0, W - cx(-7), Hh);
    g.strokeStyle = hexA(VIOLET, 0.12);
    g.lineWidth = 2;
    for (let x = -7; x < X1; x += 2) {
      g.beginPath();
      g.moveTo(cx(x), 0);
      g.lineTo(cx(x), Hh);
      g.stroke();
    }
    for (let z = Z0; z < Z1; z += 2) {
      g.beginPath();
      g.moveTo(cx(-7), cz(z));
      g.lineTo(W, cz(z));
      g.stroke();
    }
    // the bays: their livery boxes, numbers by the doors, the yellow line behind
    BAYS.forEach((z, i) => {
      g.strokeStyle = LIVERY[i];
      g.lineWidth = 6;
      g.strokeRect(cx(X0 + 0.8), cz(z - 2.9), (11.2 - 0.8) * PPM, 5.8 * PPM);
      g.save();
      g.translate(cx(X0 + 1.6), cz(z));
      g.rotate(-Math.PI / 2);
      g.fillStyle = hexA(LIVERY[i], 0.85);
      g.font = PX(2.2 * PPM);
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(String(i + 1).padStart(2, "0"), 0, 0);
      g.restore();
    });
    g.fillStyle = "#ffcf3a";
    g.fillRect(cx(-7.2), 0, 0.12 * PPM, Hh);
    // the way from the lifts to the RACE terminal
    g.fillStyle = hexA(VIOLET, 0.55);
    for (let x = 4.6; x < 12; x += 1.2) {
      g.beginPath();
      g.moveTo(cx(x), cz(-13) - 14);
      g.lineTo(cx(x) - 16, cz(-13));
      g.lineTo(cx(x), cz(-13) + 14);
      g.closePath();
      g.fill();
    }
  });
}

function apronTex() {
  return paint((X0 - AX) * PPM, (Z1 - Z0) * PPM, (g, W, Hh) => {
    g.fillStyle = "#2c2b31";
    g.fillRect(0, 0, W, Hh);
    for (let i = 0; i < 1600; i++) {
      g.fillStyle = `rgba(255,255,255,${0.015 + (i % 5) * 0.004})`;
      g.fillRect((i * 7919) % W, (i * 104729) % Hh, 2, 2);
    }
    const cx = (x: number) => (x - AX) * PPM,
      cz = (z: number) => (z - Z0) * PPM;
    // the fast lane's line, the pit boxes in front of each bay
    g.fillStyle = "#f2f2f2";
    g.fillRect(cx(-21.2), 0, 0.12 * PPM, Hh);
    BAYS.forEach((z, i) => {
      g.strokeStyle = "#f2f2f2";
      g.lineWidth = 5;
      g.strokeRect(cx(-20.8), cz(z - 2.4), 2.4 * PPM, 4.8 * PPM);
      g.fillStyle = hexA(LIVERY[i], 0.7);
      g.fillRect(cx(-20.6), cz(z - 0.2), 2.0 * PPM, 0.4 * PPM);
    });
    g.save();
    g.translate(cx(-22.6), cz(-13));
    g.rotate(-Math.PI / 2);
    g.fillStyle = "rgba(242,242,242,0.85)";
    g.font = PX(1.6 * PPM);
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText("PIT  ピット", 0, 0);
    g.restore();
  });
}

function drawLivery(g: CanvasRenderingContext2D, W: number, H: number, i: number, c: string) {
  g.fillStyle = "#16131c";
  g.fillRect(0, 0, W, H);
  g.fillStyle = c;
  g.beginPath();
  g.moveTo(W * 0.42, H);
  g.lineTo(W * 0.62, 0);
  g.lineTo(W * 0.74, 0);
  g.lineTo(W * 0.54, H);
  g.closePath();
  g.fill();
  g.fillStyle = mix(c, "#000000", 0.4);
  g.beginPath();
  g.moveTo(W * 0.56, H);
  g.lineTo(W * 0.76, 0);
  g.lineTo(W * 0.8, 0);
  g.lineTo(W * 0.6, H);
  g.closePath();
  g.fill();
  g.fillStyle = "#f2f0ea";
  g.font = PX(82);
  g.textBaseline = "middle";
  g.fillText("NU7 GRAND PRIX", 40, H * 0.36);
  g.fillStyle = c;
  g.font = PX(56);
  g.fillText(`ピット ${String(i + 1).padStart(2, "0")}`, 40, H * 0.7);
}

function drawBanner(g: CanvasRenderingContext2D, W: number, H: number) {
  g.fillStyle = "#0b0913";
  g.fillRect(0, 0, W, H);
  for (let x = 0; x < W; x += 32) for (let y = 0; y < 64; y += 32) (g.fillStyle = (x / 32 + y / 32) % 2 ? "#f2f2f2" : "#111"), g.fillRect(x, y, 32, 32);
  for (let x = 0; x < W; x += 32) for (let y = H - 64; y < H; y += 32) (g.fillStyle = (x / 32 + y / 32) % 2 ? "#f2f2f2" : "#111"), g.fillRect(x, y, 32, 32);
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.font = PX(150);
  g.shadowColor = VIOLET;
  g.shadowBlur = 30;
  g.fillStyle = "#ffffff";
  g.fillText("NU7 GRAND PRIX", W / 2, H / 2 - 6);
  g.shadowBlur = 0;
  g.fillStyle = GOLD;
  g.font = PX(48);
  g.fillText("カート · ZSTREET", W / 2, H / 2 + 92);
}

// ---- the boards ---------------------------------------------------------------------------------------------

/** The circuit's outline, fitted to a box (the real NU7 GRAND PRIX line). */
function trackMap(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string, head?: number) {
  const xs = LINE.map((p) => p[0]),
    ys = LINE.map((p) => p[1]);
  const [ax, bx, ay, by] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const s = Math.min(w / (bx - ax), h / (by - ay));
  const px = (p: number[]) => [x + (p[0] - ax) * s + (w - (bx - ax) * s) / 2, y + (p[1] - ay) * s + (h - (by - ay) * s) / 2];
  // a smooth closed loop through the points
  const pts = LINE.map(px);
  g.beginPath();
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n],
      p1 = pts[i],
      p2 = pts[(i + 1) % n],
      p3 = pts[(i + 2) % n];
    if (i === 0) g.moveTo(p1[0], p1[1]);
    g.bezierCurveTo(p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6, p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6, p2[0], p2[1]);
  }
  g.closePath();
  g.lineJoin = "round";
  g.strokeStyle = "#2a2440";
  g.lineWidth = 22;
  g.stroke();
  g.shadowColor = color;
  g.shadowBlur = 16;
  g.strokeStyle = color;
  g.lineWidth = 7;
  g.stroke();
  g.shadowBlur = 0;
  if (head !== undefined) {
    const i = Math.floor(head) % n;
    const p = pts[i],
      q = pts[(i + 1) % n];
    const u = head - Math.floor(head);
    g.fillStyle = "#ffffff";
    g.beginPath();
    g.arc(p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u, 9, 0, Math.PI * 2);
    g.fill();
  }
}

function drawRace(g: CanvasRenderingContext2D, W: number, H: number, t: number) {
  ledBg(g, W, H, "#ff5a6a");
  header(g, W, 70, "レース", "SNARK KART", "#ff5a6a");
  trackMap(g, 70, 110, W * 0.55, H - 190, VIOLET, (t * 1.6) % LINE.length);
  glow(g, "NU7", W - 60, 250, 120, GOLD, "right");
  glow(g, "GRAND PRIX", W - 60, 360, 64, "#efe6ff", "right", 0.25);
  const on = Math.floor(t * 2) % 2 === 0;
  g.fillStyle = on ? "#ff5a6a" : hexA("#ff5a6a", 0.3);
  g.fillRect(W - 420, H - 220, 360, 120);
  g.fillStyle = "#0b0913";
  g.font = PX(80);
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText("▶ RACE", W - 240, H - 158);
  g.textAlign = "left";
  scan(g, W, H, 4);
}

function drawSim(g: CanvasRenderingContext2D, W: number, H: number, t: number, seed: number) {
  ledBg(g, W, H);
  trackMap(g, 20, 30, W - 40, H - 60, seed > 9 ? GOLD : VIOLET, (t * (seed > 9 ? 2.1 : 1.7) + seed) % LINE.length);
  scan(g, W, H, 3);
}

function drawTeam(g: CanvasRenderingContext2D, W: number, H: number, i: number, team: Team | undefined, c: string) {
  ledBg(g, W, H, c);
  g.fillStyle = c;
  g.fillRect(0, 0, 150, H);
  g.fillStyle = "#0b0913";
  g.font = PX(110);
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(String(i + 1).padStart(2, "0"), 75, H / 2 + 4);
  glow(g, team ? teamName(team.name).slice(0, 16) : "—", 190, H * 0.62, 84, "#efe6ff", "left", 0.25);
  if (team) {
    glow(g, `${team.blocks}`, W - 40, H * 0.58, 92, c, "right", 0.3);
    cap(g, "BLOCKS · LAST 100", W - 40, H * 0.88, 26, "#a99cc8", "right");
  }
  scan(g, W, H, 3);
}

function drawTiming(g: CanvasRenderingContext2D, W: number, H: number, live: Nu7Live) {
  ledBg(g, W, H);
  header(g, W, 84, "ライブタイミング", "LIVE TIMING", VIOLET, live.blocks.length ? `#${num(live.blocks[live.blocks.length - 1].height)} → #${num(live.blocks[0].height)}` : "");
  const teams = live.teams.slice(0, 7);
  const fastest = Math.min(...live.teams.map((t) => t.best ?? Infinity));
  const cols = [70, 210, 1180, 1500, 1820];
  const heads = ["POS", "TEAM", "BLOCKS", "BEST", "LAST"];
  heads.forEach((h, i) => cap(g, h, cols[i] + (i >= 2 ? 120 : 0), 148, 36, "#8d84a3", i >= 2 ? "right" : "left"));
  const rowH = (H - 180) / 7;
  teams.forEach((t, i) => {
    const y = 180 + i * rowH;
    if (i % 2 === 0) {
      g.fillStyle = "rgba(255,255,255,0.035)";
      g.fillRect(0, y, W, rowH);
    }
    const c = LIVERY[i] ?? "#efe6ff";
    g.fillStyle = c;
    g.fillRect(cols[1] - 34, y + rowH * 0.18, 12, rowH * 0.64);
    glow(g, String(i + 1), cols[0], y + rowH * 0.7, rowH * 0.56, i === 0 ? GOLD : "#efe6ff", "left", 0.25);
    glow(g, teamName(t.name).slice(0, 22), cols[1], y + rowH * 0.7, rowH * 0.5, "#efe6ff", "left", 0.2);
    glow(g, String(t.blocks), cols[2] + 120, y + rowH * 0.7, rowH * 0.56, GOLD, "right", 0.25);
    glow(g, t.best !== null ? `${Math.max(0, t.best).toFixed(0)} s` : "—", cols[3] + 120, y + rowH * 0.7, rowH * 0.5, t.best === fastest ? VIOLET : "#efe6ff", "right", 0.25);
    glow(g, t.last !== null ? `${t.last.toFixed(0)} s` : "—", cols[4] + 120, y + rowH * 0.7, rowH * 0.5, t.last !== null && t.last <= NU7.target ? "#efe6ff" : "#ffb347", "right", 0.2);
  });
  scan(g, W, H, 4);
}

function drawPodium(g: CanvasRenderingContext2D, W: number, H: number, live: Nu7Live) {
  ledBg(g, W, H, GOLD);
  const t = live.teams;
  const spots: [number, number, string][] = [
    [1, W * 0.2, "#d8dce4"],
    [0, W * 0.5, GOLD],
    [2, W * 0.8, "#d0884a"],
  ];
  for (const [i, x, c] of spots) {
    cap(g, ["P1", "P2", "P3"][i], x, 56, 34, c, "center");
    glow(g, t[i] ? teamName(t[i].name).slice(0, 12) : "—", x, 150, 58, c, "center", 0.3);
    cap(g, t[i] ? `${t[i].blocks} BLOCKS` : "", x, 214, 30, "#a99cc8", "center");
  }
  scan(g, W, H, 3);
}

function drawPitBoard(g: CanvasRenderingContext2D, W: number, H: number, live: Nu7Live) {
  g.fillStyle = "#101014";
  g.fillRect(0, 0, W, H);
  g.strokeStyle = GOLD;
  g.lineWidth = 6;
  g.strokeRect(3, 3, W - 6, H - 6);
  const gap = live.gaps[0];
  g.fillStyle = "#ffffff";
  g.font = PX(52);
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(gap ? `+${gap.s.toFixed(0)} s` : "P1", W / 2, H * 0.36);
  g.fillStyle = GOLD;
  g.font = PX(34);
  g.fillText(live.blocks[0] ? `#${num(live.blocks[0].height).slice(-7)}` : "", W / 2, H * 0.74);
}

function timingInfo(live: Nu7Live): PickInfo {
  const t = live.teams;
  return {
    eyebrow: "PIT GARAGE · live timing",
    title: t[0] ? `P1 · ${t[0].name}` : "Live timing",
    stats: t.slice(0, 4).map((x, i) => [`P${i + 1} ${x.name}`, `${x.blocks} blocks`] as [string, string]),
    body: live.blocks.length ? `<p>Mining pools by blocks found, last ${live.blocks.length} blocks (#${num(live.blocks[live.blocks.length - 1].height)} to #${num(live.blocks[0].height)}). BEST: the shortest gap before one of its blocks.</p>` : undefined,
  };
}
