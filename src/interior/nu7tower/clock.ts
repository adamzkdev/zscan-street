import * as THREE from "three";
import type { PickInfo } from "../types";
import { marbleTex, paint, type SkyKit } from "../zktowers/kit";
import { column, cutCorner, gear, rope } from "./props";
import { AMBER, bezel, board, cap, F, glow, GOLD, header, hexA, LIFT, LIFT_STYLE, ledBg, MONO, neon, NU7, num, Nu7Live, PLUM, PX, scan, VIOLET } from "./shared";

/**
 * 25 · the 25-SECOND CLOCK: since NU7 a block every 25 seconds (ZIP 218). A dial ten metres
 * across with 25 seconds round it ticks with the real chain: its hand sweeps from the last block
 * and goes home when the next one lands, its LED ring fills a second at a time, its gears turn
 * behind it. Left, the escapement in its glass case; right, the 75-second dial it replaced,
 * stopped for good at NU7. The next block, the last ones and their spacing on the side walls.
 */

const f = F.clock;
const X0 = -16,
  X1 = 16,
  Z0 = -32,
  Z1 = 0,
  H = 13;
const D = { x: 0, y: 7.0, z: Z0 + 0.62, r: 5.4 };

export function clock(k: SkyKit, live: Nu7Live) {
  // ---- floor, ceiling --------------------------------------------------------------------------------
  const stone = marbleTex(81, "#16121e", "#4a3a6a", 512, 4, 6, 6, "rgba(244,183,40,0.16)");
  k.flat(f, X1 - X0, Z1 - Z0, new THREE.MeshStandardMaterial({ map: stone, roughness: 0.14, metalness: 0.15 }), 0, (Z0 + Z1) / 2);
  k.flat(f, 32, 16, new THREE.MeshStandardMaterial({ map: sundialTex(), transparent: true, roughness: 0.2, metalness: 0.4, emissive: new THREE.Color("#3a2a08"), emissiveIntensity: 0.4 }), 0, Z0 + 8, 0.006);
  k.box(f, X1 - X0, 0.3, Z1 - Z0, 0, H, (Z0 + Z1) / 2, PLUM);
  for (let x = X0 + 4; x < X1; x += 4) k.box(f, 0.3, 0.6, Z1 - Z0, x, H - 0.6, (Z0 + Z1) / 2, "#211a2c", "matte");
  // pendants down the middle of the hall
  for (const z of [-6, -12, -18]) for (const x of [-6, 6]) {
    k.cyl(f, 0.012, 0.012, 3.6, x, H - 3.6, z, "#8a6a2a", "metal", 4);
    k.cyl(f, 0.32, 0.05, 0.42, x, H - 4.0, z, "#1c1626", "metal", 20);
    k.cyl(f, 0.2, 0.2, 0.02, x, H - 4.02, z, "#ffe9c0", "glow", 20);
  }

  // ---- walls ------------------------------------------------------------------------------------------
  const wall = "#1a1522";
  k.wall(f, -12, Z0, 12, Z0, H, wall, "polish", 0.4);
  cutCorner(k, f, X0, -28, -12, Z0, H, wall, 0, -16);
  cutCorner(k, f, 12, Z0, X1, -28, H, wall, 0, -16);
  k.wall(f, X0, -28, X0, -13, H, wall, "polish", 0.4);
  k.wall(f, X1, -28, X1, -13, H, wall, "polish", 0.4);
  k.curtain(f, X0, -13, X0, Z1, H, "#2a2236", 2.2, { transom: 4.2 });
  k.curtain(f, X1, -13, X1, Z1, H, "#2a2236", 2.2, { transom: 4.2 });
  k.wall(f, X0, Z1, X1, Z1, H, wall, "polish", 0.4);
  for (let x = -14; x <= 14; x += 2) if (Math.abs(x) > 4) k.box(f, 0.12, H - 1, 0.16, x, 0.5, Z1 - 0.28, "#6a5226", "metal");
  const back = neon("二十五秒時計 · 25-SECOND CLOCK", 0.7, GOLD);
  k.add(f, back, 0, 7.4, Z1 - 0.3, Math.PI);

  // ---- the great dial ------------------------------------------------------------------------------------
  greatDial(k, live);
  const title = neon("二十五秒", 0.95, VIOLET, { k: 1.8 });
  k.add(f, title, 0, D.y + D.r + 0.95, Z0 + 0.32, 0);
  k.hit(f, D.r * 2, D.r * 2, 0.6, 0, D.y - D.r, D.z + 0.2, `<b>The 25-second clock</b><span>the hand goes home on every block</span>`, () => clockInfo(live));

  // ---- the escapement, left; the retired 75 s dial, right ------------------------------------------------
  escapement(k, -11.6, -28.9);
  retired(k, live, 11.6, -28.9);

  // ---- the side boards -------------------------------------------------------------------------------------
  bezel(k, f, 7.4, 4.2, X0 + 0.26, 4.4, -20.5, Math.PI / 2, VIOLET);
  board(k, f, 7.4, 4.2, X0 + 0.26, 4.4, -20.5, Math.PI / 2, (g, W, Hh) => drawNext(g, W, Hh, live), 0.5, 1024);
  k.hit(f, 0.4, 4.2, 7.4, X0 + 0.4, 2.3, -20.5, `<b>Next block</b><span>25 s target</span>`, () => clockInfo(live));
  bezel(k, f, 7.4, 4.2, X1 - 0.26, 4.4, -20.5, -Math.PI / 2, GOLD);
  board(k, f, 7.4, 4.2, X1 - 0.26, 4.4, -20.5, -Math.PI / 2, (g, W, Hh) => drawTimeline(g, W, Hh, live), 4, 1024);
  k.hit(f, 0.4, 4.2, 7.4, X1 - 0.4, 2.3, -20.5, `<b>The last 40 blocks</b><span>spaced as they came</span>`, () => clockInfo(live));

  // ---- benches facing the dial, columns -------------------------------------------------------------------
  for (const z of [-17.5, -13.5]) for (const x of [-3.4, 3.4]) bench(k, x, z);
  for (const x of [-9.5, 9.5]) for (const z of [-8, -16]) column(k, f, x, z, H);

  // ---- the lifts ---------------------------------------------------------------------------------------
  const [lx, lz, lry] = LIFT[f];
  k.lifts(f, lx, lz, lry, LIFT_STYLE);

  // ---- light --------------------------------------------------------------------------------------------
  k.light(f, 0, 9, -24, "#ffe8c0", 30, 20);
  k.light(f, -11.6, 5, -26.5, VIOLET, 14, 10);
  k.light(f, 11.6, 4.5, -26.5, "#ffd8a0", 14, 10);
  k.light(f, 0, 8, -10, "#fff1d6", 16, 18);
  k.light(f, -12, 5, -20.5, "#fff1d6", 10, 12);
  k.light(f, 12, 5, -20.5, "#fff1d6", 10, 12);

  // ---- people ---------------------------------------------------------------------------------------------
  k.onCast(f, () => {
    void k.person(f, 7401, [-9.2, -27.4], "Clockkeeper", {
      face: [0.4, 1],
      cap: true,
      lines: [
        "One tooth a second. Twenty-five teeth.",
        () => {
          const e = live.elapsed;
          return e === null ? "Wait for the next block. Watch the hand." : e < NU7.target ? `${Math.max(0, Math.round(NU7.target - e))} seconds to the next, give or take.` : `${Math.round(e - NU7.target)} seconds late. It happens.`;
        },
        "When a block lands, the hand goes home.",
      ],
    });
    void k.person(f, 7402, [-3.0, -17.5], "Visitor", { sit: true, dy: 0.46, face: [0, -1], lines: ["I come here to watch the blocks.", () => (live.avg ? `${live.avg.toFixed(1)} seconds on average. Close.` : "Twenty-five seconds. Mostly.")] });
    void k.person(f, 7403, [3.9, -13.5], "Visitor", { sit: true, dy: 0.46, face: [0, -1] });
    void k.person(f, 7404, [9.4, -25.6], "Visitor", {
      face: [0.4, -1],
      lines: ["Seventy-five seconds, almost seven years.", "It stopped at block 3,543,404."],
    });
    void k.person(f, 7405, [-6, -6], "Visitor", { wander: [[-6, -6], [6, -6], [0, -21], [-12, -12], [12, -12]] });
  });
}

/** The dial, its rim, its 25 LEDs, the hand, the windows; gears turning behind it. */
function greatDial(k: SkyKit, live: Nu7Live) {
  const R = D.r;
  const g = new THREE.Group();
  const face = paint(1536, 1536, (c, W) => drawDialFace(c, W, 25, [0, 5, 10, 15, 20], false));
  const plate = new THREE.Mesh(new THREE.CircleGeometry(R, 128), new THREE.MeshStandardMaterial({ map: face, roughness: 0.35, metalness: 0.3, emissive: new THREE.Color("#ffffff"), emissiveMap: face, emissiveIntensity: 0.55 }));
  g.add(plate);
  const gold = new THREE.MeshStandardMaterial({ color: GOLD, metalness: 0.95, roughness: 0.18, envMapIntensity: 1.6 });
  const rim = new THREE.Mesh(new THREE.TorusGeometry(R + 0.12, 0.24, 20, 160), gold);
  g.add(rim);
  const glowRim = new THREE.Mesh(new THREE.TorusGeometry(R + 0.5, 0.05, 8, 160), new THREE.MeshBasicMaterial({ color: new THREE.Color(VIOLET).multiplyScalar(2), toneMapped: false }));
  g.add(glowRim);
  // the 25 LEDs on a ring inside the numbers
  const leds: THREE.MeshBasicMaterial[] = [];
  for (let i = 0; i < 25; i++) {
    const a = (i / 25) * Math.PI * 2;
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color("#2a2240"), toneMapped: false });
    const seg = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.16, 0.05), mat);
    const r = R * 0.62;
    seg.position.set(Math.sin(a) * r, Math.cos(a) * r, 0.04);
    seg.rotation.z = -a;
    g.add(seg);
    leds.push(mat);
  }
  // the windows: the tip under the hub, the time to the next block over it
  board(k, f, 2.6, 0.62, 0, D.y - R * 0.36, D.z + 0.05, 0, (c, W, Hh) => {
    ledBg(c, W, Hh, GOLD);
    glow(c, live.tip ? `#${num(live.tip)}` : "—", W / 2, Hh * 0.74, Hh * 0.62, GOLD, "center", 0.25);
    scan(c, W, Hh, 3);
  }, 1, 512);
  board(k, f, 2.0, 0.62, 0, D.y + R * 0.34, D.z + 0.05, 0, (c, W, Hh) => {
    ledBg(c, W, Hh);
    const e = live.elapsed;
    const s = e === null ? "—" : e <= NU7.target ? `${Math.ceil(NU7.target - e)} s` : `+${Math.floor(e - NU7.target)} s`;
    glow(c, s, W / 2, Hh * 0.74, Hh * 0.62, e !== null && e > NU7.target ? AMBER : VIOLET, "center", 0.25);
    scan(c, W, Hh, 3);
  }, 0.25, 512);

  // the hand: a gold blade with a lit tip, its counterweight, the hub
  const hand = new THREE.Group();
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.16, R * 0.86, 0.06), gold);
  blade.position.y = (R * 0.86) / 2 - 0.2;
  const tip = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.5, 0.07), new THREE.MeshBasicMaterial({ color: new THREE.Color(GOLD).multiplyScalar(2.4), toneMapped: false }));
  tip.position.y = R * 0.86 - 0.35;
  const weight = new THREE.Mesh(new THREE.BoxGeometry(0.42, 1.1, 0.07), gold);
  weight.position.y = -0.85;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.06, 10, 32), gold);
  ring.position.y = -1.2;
  hand.add(blade, tip, weight, ring);
  hand.position.z = 0.22;
  g.add(hand);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 32), gold);
  hub.rotation.x = Math.PI / 2;
  hub.position.z = 0.26;
  g.add(hub);
  const cap7 = new THREE.Mesh(new THREE.CircleGeometry(0.3, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color(VIOLET).multiplyScalar(1.8), toneMapped: false }));
  cap7.position.z = 0.42;
  g.add(cap7);
  g.traverse((o) => ((o as THREE.Mesh).raycast = () => {}));
  k.add(f, g, D.x, D.y, D.z, 0);
  // the movement behind: gears meshing round the dial
  const gears: { m: THREE.Mesh; w: number }[] = [];
  for (const [x, y, r, n, w] of [
    [-6.1, 11.0, 1.5, 24, 1],
    [6.3, 10.6, 1.15, 18, -1.3],
    [-6.6, 3.2, 1.05, 16, -1.43],
    [6.5, 3.6, 1.4, 22, 1.07],
    [-3.2, 12.5, 0.75, 12, -2],
    [3.4, 12.6, 0.9, 14, 1.66],
    [7.8, 7.4, 0.7, 10, -2.2],
    [-7.9, 7.0, 0.8, 12, 1.9],
  ] as const) {
    const m = gear(r, n, 0.14, n % 4 ? "#c9a24a" : "#9a7a3a");
    k.add(f, m, x, y, Z0 + 0.38, 0);
    gears.push({ m, w });
    k.geo(f, new THREE.CylinderGeometry(0.1, 0.1, 0.4, 12).rotateX(Math.PI / 2).translate(x, y, Z0 + 0.4), "#3a3844", "metal");
  }
  // the hand's angle, the LEDs, the flash when a block lands
  let flash = 0;
  let home = 0;
  let shown = 0;
  live.onTip(() => {
    flash = 1;
    home = 0.45;
  });
  const lit = new THREE.Color(VIOLET).multiplyScalar(2.2),
    now = new THREE.Color(GOLD).multiplyScalar(2.6),
    late = new THREE.Color(AMBER).multiplyScalar(2.2),
    off = new THREE.Color("#2a2240"),
    white = new THREE.Color(3, 2.8, 2.4);
  k.ticks[f].push((dt, t) => {
    const e = live.elapsed;
    const target = e === null ? 0 : ((e % NU7.target) / NU7.target) * Math.PI * 2;
    if (home > 0) {
      // the hand sweeps home fast, then picks up the new count
      home -= dt;
      shown += (0 - shown) * Math.min(1, dt * 14);
    } else {
      let d = target - shown;
      if (d < -Math.PI) d += Math.PI * 2;
      shown = d > 0 && d < 0.6 ? target : shown + d * Math.min(1, dt * 10);
    }
    hand.rotation.z = -shown;
    const sec = e === null ? -1 : Math.floor(e % NU7.target);
    const over = e !== null && e > NU7.target;
    flash = Math.max(0, flash - dt * 2.2);
    for (let i = 0; i < 25; i++) {
      const c = leds[i].color;
      if (flash > 0) c.copy(white).multiplyScalar(0.4 + flash * 0.6);
      else if (sec < 0) c.copy(off);
      else if (i === sec) c.copy(over ? late : now);
      else if (i < sec || over) c.copy(over ? late : lit).multiplyScalar(over ? 0.55 + 0.25 * Math.sin(t * 6) : 1);
      else c.copy(off);
    }
    (glowRim.material as THREE.MeshBasicMaterial).color.copy(lit).multiplyScalar(0.8 + flash * 1.6);
    // the gears follow the second hand (one turn of the big one per block)
    const w = (Math.PI * 2) / NU7.target;
    for (const gg of gears) gg.m.rotation.z += dt * w * gg.w * 0.5;
  });
  return g;
}

/** The escapement: a pendulum beating seconds in a tall glass case, the 25-tooth wheel it lets turn. */
function escapement(k: SkyKit, x: number, z: number) {
  const W = 2.4,
    HH = 7.2,
    Dp = 1.6;
  // the case: a black base, gold posts, glass
  k.box(f, W + 0.2, 0.6, Dp + 0.2, x, 0, z, "#120e18", "polish");
  k.box(f, W + 0.24, 0.05, Dp + 0.24, x, 0.6, z, GOLD, "metal");
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(f, 0.08, HH, 0.08, x + (sx * W) / 2, 0.6, z + (sz * Dp) / 2, GOLD, "metal");
  k.box(f, W + 0.2, 0.3, Dp + 0.2, x, 0.6 + HH, z, "#120e18", "polish");
  k.box(f, W, HH, 0.03, x, 0.6, z + Dp / 2, "#cfe4f4", "glass");
  k.box(f, 0.03, HH, Dp, x - W / 2, 0.6, z, "#cfe4f4", "glass");
  k.box(f, 0.03, HH, Dp, x + W / 2, 0.6, z, "#cfe4f4", "glass");
  k.box(f, W, HH, 0.05, x, 0.6, z - Dp / 2, "#1c1626", "polish");
  k.solid(f, x - W / 2 - 0.15, z - Dp / 2 - 0.15, x + W / 2 + 0.15, z + Dp / 2 + 0.15);
  // the escape wheel (25 teeth) and its anchor
  const wheel = gear(0.62, 25, 0.06, GOLD);
  k.add(f, wheel, x, 6.2, z, 0);
  const anchor = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.12, 0.06), new THREE.MeshStandardMaterial({ color: "#c8ccd4", metalness: 0.9, roughness: 0.25 }));
  anchor.raycast = () => {};
  k.add(f, anchor, x, 6.95, z + 0.06, 0);
  // the pendulum: a rod and a violet-lit bob
  const pend = new THREE.Group();
  const rod = new THREE.Mesh(new THREE.BoxGeometry(0.05, 4.4, 0.05), new THREE.MeshStandardMaterial({ color: "#c8ccd4", metalness: 0.9, roughness: 0.25 }));
  rod.position.y = -2.2;
  const bob = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.12, 40), new THREE.MeshStandardMaterial({ color: GOLD, metalness: 0.95, roughness: 0.2 }));
  bob.rotation.x = Math.PI / 2;
  bob.position.y = -4.4;
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.24, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color(VIOLET).multiplyScalar(2.2), toneMapped: false }));
  lens.position.set(0, -4.4, 0.07);
  pend.add(rod, bob, lens);
  pend.traverse((o) => ((o as THREE.Mesh).raycast = () => {}));
  k.add(f, pend, x, 6.8, z + 0.1, 0);
  k.ticks[f].push((_dt, t) => {
    // one beat a second: a swing each way in two
    pend.rotation.z = Math.sin(t * Math.PI) * 0.16;
    anchor.rotation.z = Math.sin(t * Math.PI) * 0.12;
    const s = Math.floor(t);
    // the wheel steps a tooth a beat, with a little snap
    const frac = t - s;
    wheel.rotation.z = -((s + Math.min(1, frac * 6)) / 25) * Math.PI * 2;
  });
  const plaque = paint(512, 128, (c, W2, H2) => {
    c.fillStyle = "#2a2010";
    c.fillRect(0, 0, W2, H2);
    c.strokeStyle = GOLD;
    c.lineWidth = 5;
    c.strokeRect(4, 4, W2 - 8, H2 - 8);
    c.fillStyle = "#ffe08a";
    c.font = PX(48);
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText("脱進機 · 25", W2 / 2, H2 / 2 + 3);
  });
  k.plane(f, 1.2, 0.3, new THREE.MeshStandardMaterial({ map: plaque, metalness: 0.6, roughness: 0.3, emissive: new THREE.Color("#3a2a10"), emissiveMap: plaque }), x, 0.3, z + Dp / 2 + 0.11, 0, 0);
  k.hit(f, W, HH, Dp, x, 0.6, z, `<b>The escapement</b><span>a beat a second · a 25-tooth wheel</span>`, () => ({ eyebrow: "25-SECOND CLOCK · escapement", title: "25 teeth, a beat a second", stats: [["Beat", "1 s"], ["Teeth", "25"], ["Turn", "25 s"], ["Target", "ZIP 218"]] }));
}

/** The 75-second dial, stopped at NU7: brass, a crack across its glass, on a pedestal behind a rope. */
function retired(k: SkyKit, live: Nu7Live, x: number, z: number) {
  k.box(f, 1.6, 1.4, 1.0, x, 0, z, "#120e18", "polish");
  k.box(f, 1.64, 0.05, 1.04, x, 1.4, z, GOLD, "metal");
  k.box(f, 0.3, 0.8, 0.3, x, 1.45, z, "#3a2c16", "metal");
  const R = 1.75;
  const face = paint(1024, 1024, (c, W) => drawDialFace(c, W, 75, [0, 15, 30, 45, 60], true));
  const g = new THREE.Group();
  const plate = new THREE.Mesh(new THREE.CircleGeometry(R, 96), new THREE.MeshStandardMaterial({ map: face, roughness: 0.6, metalness: 0.3, emissive: new THREE.Color("#ffffff"), emissiveMap: face, emissiveIntensity: 0.22 }));
  const brass = new THREE.MeshStandardMaterial({ color: "#8a6a3a", metalness: 0.85, roughness: 0.45 });
  const rim = new THREE.Mesh(new THREE.TorusGeometry(R + 0.06, 0.14, 14, 96), brass);
  const hand = new THREE.Mesh(new THREE.BoxGeometry(0.08, R * 0.8, 0.04), brass);
  hand.position.set(0, (R * 0.8) / 2 - 0.1, 0.1);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.12, 20), brass);
  hub.rotation.x = Math.PI / 2;
  hub.position.z = 0.1;
  g.add(plate, rim, hand, hub);
  g.traverse((o) => ((o as THREE.Mesh).raycast = () => {}));
  k.add(f, g, x, 2.25 + R, z + 0.1, 0);
  g.rotation.z = 0.03;
  // the plaque on its pedestal: the era, from the API
  board(k, f, 1.4, 0.7, x, 0.75, z + 0.51, 0, (c, W, Hh) => {
    c.fillStyle = "#2a2010";
    c.fillRect(0, 0, W, Hh);
    c.strokeStyle = GOLD;
    c.lineWidth = 6;
    c.strokeRect(5, 5, W - 10, Hh - 10);
    const blossom = live.upgrade("Blossom");
    const from = blossom?.activated_at?.slice(0, 10) ?? "2019-12-11";
    const h0 = blossom?.activation_height ?? NU7.blossom;
    c.textAlign = "center";
    c.fillStyle = "#ffe08a";
    c.font = PX(66);
    c.fillText("75 s", W / 2, 86);
    c.font = MONO(28, 700);
    c.fillStyle = "#e9c55a";
    c.fillText(`${from} → ${NU7.date}`, W / 2, 146);
    c.fillText(`#${num(h0)} → #${num(NU7.height - 1)}`, W / 2, 192);
    c.fillStyle = "#c9a24a";
    c.font = MONO(24, 600);
    c.fillText(`${num(NU7.height - h0)} BLOCKS`, W / 2, 234);
  }, 30, 512);
  rope(k, f, [
    [x - 1.4, z + 1.3],
    [x + 1.4, z + 1.3],
  ]);
  k.solid(f, x - 0.85, z - 0.55, x + 0.85, z + 0.55);
  k.hit(f, 3.6, 4, 1.2, x, 1.4, z, `<b>The 75-second dial</b><span>retired at NU7</span>`, () => retiredInfo(live));
}

function bench(k: SkyKit, x: number, z: number) {
  k.box(f, 3.2, 0.1, 0.62, x, 0.4, z, "#3a2a1c", "polish");
  k.box(f, 3.24, 0.03, 0.66, x, 0.5, z, GOLD, "metal");
  for (const dx of [-1.4, 1.4]) k.box(f, 0.12, 0.4, 0.5, x + dx, 0, z, "#1c1626", "metal");
  k.solid(f, x - 1.62, z - 0.33, x + 1.62, z + 0.33);
}

// ---- textures -------------------------------------------------------------------------------------------

/** A dial face: guilloché rings, a tick a second, numbers every few, the era's mark. */
function drawDialFace(c: CanvasRenderingContext2D, W: number, secs: number, labels: number[], old: boolean) {
  const r = W / 2;
  const grad = c.createRadialGradient(r, r, 10, r, r, r);
  grad.addColorStop(0, old ? "#5a4a34" : "#2a1e44");
  grad.addColorStop(1, old ? "#2e2418" : "#0e0a18");
  c.fillStyle = grad;
  c.fillRect(0, 0, W, W);
  // guilloché
  c.strokeStyle = old ? "rgba(255,220,160,0.08)" : "rgba(176,123,255,0.1)";
  c.lineWidth = 1.5;
  for (let i = 0; i < 70; i++) {
    c.beginPath();
    c.arc(r + Math.cos(i * 0.9) * 10, r + Math.sin(i * 0.9) * 10, r * 0.15 + i * (r * 0.0075), 0, Math.PI * 2);
    c.stroke();
  }
  const ink = old ? "#c9b48a" : "#f6e7c0";
  const accent = old ? "#a08050" : GOLD;
  for (let i = 0; i < secs; i++) {
    const a = (i / secs) * Math.PI * 2 - Math.PI / 2;
    const major = labels.includes(i);
    const r0 = major ? r * 0.8 : r * 0.86;
    c.strokeStyle = major ? accent : ink;
    c.lineWidth = major ? W * 0.012 : W * (secs > 30 ? 0.003 : 0.006);
    c.beginPath();
    c.moveTo(r + Math.cos(a) * r0, r + Math.sin(a) * r0);
    c.lineTo(r + Math.cos(a) * r * 0.94, r + Math.sin(a) * r * 0.94);
    c.stroke();
  }
  c.fillStyle = accent;
  c.font = PX(W * 0.085);
  c.textAlign = "center";
  c.textBaseline = "middle";
  for (const n of labels) {
    const a = (n / secs) * Math.PI * 2 - Math.PI / 2;
    c.fillText(String(n), r + Math.cos(a) * r * 0.71, r + Math.sin(a) * r * 0.71);
  }
  if (old) {
    c.fillStyle = "#a08a60";
    c.font = PX(W * 0.045);
    c.fillText("75 s · BLOSSOM", r, r * 1.28);
  } else {
    // the maker's mark, small, between the window over the hub and the 0
    c.fillStyle = hexA(VIOLET, 0.85);
    c.font = PX(W * 0.03);
    c.fillText("NU7 · ZIP 218", r, r * 0.5);
  }
  if (old) {
    // the crack across its glass, the dust
    c.strokeStyle = "rgba(255,255,255,0.45)";
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(W * 0.12, W * 0.3);
    c.lineTo(W * 0.38, W * 0.46);
    c.lineTo(W * 0.5, W * 0.42);
    c.lineTo(W * 0.72, W * 0.62);
    c.lineTo(W * 0.9, W * 0.66);
    c.stroke();
    c.beginPath();
    c.moveTo(W * 0.5, W * 0.42);
    c.lineTo(W * 0.56, W * 0.24);
    c.stroke();
    c.fillStyle = "rgba(200,190,170,0.08)";
    for (let i = 0; i < 400; i++) c.fillRect((i * 7919) % W, (i * 104729) % W, 3, 3);
  }
}

/** The floor in front of the dial: 25 gold rays fanning out like a sundial. */
function sundialTex() {
  return paint(2048, 1024, (c, W, Hh) => {
    c.clearRect(0, 0, W, Hh);
    const ox = W / 2,
      oy = 0;
    const ppm = W / 32;
    for (let i = 0; i <= 24; i++) {
      const a = (i / 24) * Math.PI;
      const major = i % 6 === 0;
      c.strokeStyle = major ? GOLD : hexA(GOLD, 0.45);
      c.lineWidth = major ? 7 : 3;
      c.beginPath();
      c.moveTo(ox + Math.cos(a) * ppm * 6.4, oy + Math.sin(a) * ppm * 6.4);
      c.lineTo(ox + Math.cos(a) * ppm * 14.5, oy + Math.sin(a) * ppm * 14.5);
      c.stroke();
    }
    for (const rr of [6.2, 14.7]) {
      c.strokeStyle = hexA(VIOLET, 0.7);
      c.lineWidth = 5;
      c.beginPath();
      c.arc(ox, oy, ppm * rr, 0, Math.PI);
      c.stroke();
    }
    c.fillStyle = GOLD;
    c.font = PX(ppm * 0.8);
    c.textAlign = "center";
    c.textBaseline = "middle";
    for (const [i, s] of [
      [0, "0"],
      [6, "5"],
      [12, "12.5"],
      [18, "20"],
      [24, "25"],
    ] as const) {
      const a = (i / 24) * Math.PI;
      c.save();
      c.translate(ox + Math.cos(a) * ppm * 15.4, oy + Math.sin(a) * ppm * 15.4);
      c.rotate(a - Math.PI / 2);
      c.fillText(s, 0, 0);
      c.restore();
    }
  });
}

// ---- the boards -------------------------------------------------------------------------------------------

function drawNext(g: CanvasRenderingContext2D, W: number, H: number, live: Nu7Live) {
  ledBg(g, W, H);
  header(g, W, 64, "次のブロック", "NEXT BLOCK", VIOLET);
  const e = live.elapsed;
  const late = e !== null && e > NU7.target;
  const big = e === null ? "—" : late ? `+${Math.floor(e - NU7.target)} s` : `${Math.ceil(NU7.target - e)} s`;
  glow(g, big, 50, 300, 220, late ? AMBER : VIOLET, "left", 0.3);
  cap(g, late ? "OVER TARGET" : "TO TARGET", 56, 352, 36, "#a99cc8");
  // the progress bar of the 25 seconds
  const p = e === null ? 0 : Math.min(1, e / NU7.target);
  g.fillStyle = "rgba(255,255,255,0.06)";
  g.fillRect(50, 392, W - 100, 30);
  g.fillStyle = late ? AMBER : VIOLET;
  g.fillRect(50, 392, (W - 100) * p, 30);
  for (let i = 1; i < 25; i++) {
    g.fillStyle = "#06040b";
    g.fillRect(50 + ((W - 100) * i) / 25 - 2, 392, 4, 30);
  }
  const rows: [string, string, string][] = [
    ["LAST BLOCK", live.tip ? `#${num(live.tip)}` : "—", GOLD],
    ["SINCE", e === null ? "—" : `${Math.floor(e)} s`, "#efe6ff"],
    ["AVG · LAST 100", live.avg ? `${live.avg.toFixed(1)} s` : "—", "#efe6ff"],
  ];
  rows.forEach(([l, v, c], i) => {
    const x = 56 + i * ((W - 100) / 3);
    cap(g, l, x, 494, 30);
    glow(g, v, x, 562, 52, c, "left", 0.2);
  });
  scan(g, W, H, 4);
}

function drawTimeline(g: CanvasRenderingContext2D, W: number, H: number, live: Nu7Live) {
  ledBg(g, W, H, GOLD);
  header(g, W, 64, "到着間隔", "THE LAST 40 BLOCKS", GOLD);
  const b = live.blocks.slice(0, 40);
  if (b.length < 2) return scan(g, W, H, 4);
  const t1 = Date.parse(b[0].time),
    t0 = Date.parse(b[b.length - 1].time);
  const x0 = 50,
    x1 = W - 50,
    y = 330;
  const xOf = (t: number) => x0 + ((t - t0) / Math.max(1, t1 - t0)) * (x1 - x0);
  // the 25 s grid
  g.fillStyle = "rgba(244,183,40,0.12)";
  for (let t = t0; t <= t1; t += NU7.target * 1000) g.fillRect(xOf(t), 120, 2, 380);
  g.fillStyle = "rgba(255,255,255,0.12)";
  g.fillRect(x0, y, x1 - x0, 3);
  // each block where it landed, its gap as a bar
  b.forEach((r, i) => {
    const x = xOf(Date.parse(r.time));
    const gap = b[i + 1] ? (Date.parse(r.time) - Date.parse(b[i + 1].time)) / 1000 : null;
    const c = gap === null ? "#efe6ff" : gap <= NU7.target ? VIOLET : AMBER;
    g.fillStyle = c;
    g.shadowColor = c;
    g.shadowBlur = 10;
    g.fillRect(x - 3, y - 70, 6, 140);
    g.shadowBlur = 0;
    if (gap !== null) {
      const h = Math.min(160, gap * 2);
      g.fillStyle = hexA(c, 0.35);
      g.fillRect(x - 2, y + 80, 4, h);
    }
    if (i % 8 === 0) {
      g.save();
      g.translate(x, y - 84);
      g.rotate(-Math.PI / 4);
      cap(g, `#${num(r.height)}`, 0, 0, 26, i === 0 ? GOLD : "#c9bde6");
      g.restore();
    }
  });
  cap(g, `${Math.round((t1 - t0) / 60000)} MIN`, x0, H - 40, 30, "#a99cc8");
  cap(g, live.avg ? `AVG ${live.avg.toFixed(1)} s` : "", x1, H - 40, 30, GOLD, "right");
  scan(g, W, H, 4);
}

// ---- what a click shows ----------------------------------------------------------------------------------

function clockInfo(live: Nu7Live): PickInfo {
  const e = live.elapsed;
  return {
    eyebrow: "25-SECOND CLOCK",
    title: live.tip ? `Tip #${num(live.tip)}` : "A block every 25 s",
    mono: true,
    stats: [
      ["Target", "25 s · ZIP 218"],
      ["Since the last", e === null ? "—" : `${Math.floor(e)} s`],
      ["Avg · last 100", live.avg ? `${live.avg.toFixed(2)} s` : "—"],
      ["Avg · since NU7", live.avgSince ? `${live.avgSince.toFixed(2)} s` : "—"],
    ],
  };
}

function retiredInfo(live: Nu7Live): PickInfo {
  const blossom = live.upgrade("Blossom");
  const h0 = blossom?.activation_height ?? NU7.blossom;
  return {
    eyebrow: "25-SECOND CLOCK · retired",
    title: "75 seconds",
    stats: [
      ["From", `${blossom?.activated_at?.slice(0, 10) ?? "2019-12-11"} · Blossom`],
      ["To", `${NU7.date} · NU7`],
      ["Blocks", num(NU7.height - h0)],
      ["Last one", `#${num(NU7.height - 1)}`],
    ],
  };
}
