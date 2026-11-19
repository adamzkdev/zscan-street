import * as THREE from "three";
import { armchair, barCounter, backBar, indoorTree, lounger, sofa, stool, umbrella } from "../furniture";
import { telescope } from "../needle/props";
import type { PickInfo } from "../types";
import { Surface, type SkyKit } from "../zktowers/kit";
import { F, GOLD, LIFT, LIFT_STYLE, neon, NU7, num, Nu7Live, PX, scan, VIOLET, zec } from "./shared";

/**
 * R · the SKY DECK: the roof under the crown, 124 metres over the quarter. Teak, a glass parapet
 * all round, the city on every side and the NU7 GRAND PRIX straight down to the west. Coin
 * telescopes aimed at real places; the SKY BAR under its pergola on the east; a lounge round a
 * fire table facing the circuit; the crown rising out of the deck, its LED band running the
 * tower's numbers, the spire and its beacon over everything.
 */

const f = F.deck;
const X0 = -14,
  X1 = 14,
  Z0 = -28,
  Z1 = 0;
/** The crown's core (the lifts on its south face). */
const CORE = { x0: -4, x1: 4, z0: -18.2, z1: -9.8 };
/** Where the tower stands in the city (the telescopes' bearings). */
const AT = { x: 205.5, z: -84 };
const SIGHTS: { name: string; x: number; z: number; what: string }[] = [
  { name: "NU7 GRAND PRIX", x: 159, z: -82, what: "the circuit, straight down" },
  { name: "ZK UNIVERSITY", x: 102.5, z: -81.4, what: "the campus by the works" },
  { name: "ZEC NEEDLE", x: 141.5, z: -136.5, what: "the tallest tower in the city" },
  { name: "THE COLOSSEUM", x: 86.5, z: -193, what: "the Proof Games" },
  { name: "ZK CEMETERY", x: 159.5, z: -209.5, what: "the hill to the north" },
  { name: "ZK MALL", x: 159.5, z: -22.4, what: "the rain vortex" },
  { name: "ZK TOWER HALO", x: 209.5, z: -22.4, what: "the twisted glass tower" },
  { name: "CENTRAL PARK", x: 0, z: -82, what: "the lake and the bandstand" },
];
const bearing = (dx: number, dz: number) => ((Math.atan2(dx, -dz) * 180) / Math.PI + 360) % 360;
const compass = (b: number) => ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"][Math.round(b / 22.5) % 16];

export function deck(k: SkyKit, live: Nu7Live) {
  // ---- the deck: teak, and the SKY WALK, a glass floor along the west (over the circuit) and the
  // south (over the plaza and the avenue): the city 124 m down under your feet ---------------------
  const GX = -9.6,
    GZ = -3.6;
  for (let z = Z0; z < GZ; z += 0.5) k.box(f, X1 - GX, 0.06, 0.46, (X1 + GX) / 2, -0.06, z + 0.25, (Math.round(z * 2) & 1) === 0 ? "#6b4a30" : "#74513a", "matte");
  k.box(f, X1 - GX + 0.3, 0.5, GZ - Z0 + 0.3, (X1 + GX) / 2 + 0.15, -0.56, (Z0 + GZ) / 2 - 0.15, "#1c1824", "matte");
  // the walk: a steel grid under clear glass, violet light along its edge
  k.box(f, GX - X0, 0.03, Z1 - Z0, (X0 + GX) / 2, -0.03, (Z0 + Z1) / 2, "#cfe4f4", "glass");
  k.box(f, X1 - GX, 0.03, Z1 - GZ, (X1 + GX) / 2, -0.03, (GZ + Z1) / 2, "#cfe4f4", "glass");
  for (const x of [X0, (X0 + GX) / 2, GX]) k.box(f, 0.05, 0.08, Z1 - Z0, x, -0.1, (Z0 + Z1) / 2, "#3a3644", "metal");
  for (let z = Z0; z <= Z1 + 0.01; z += 2.8) k.box(f, GX - X0, 0.08, 0.05, (X0 + GX) / 2, -0.1, z, "#3a3644", "metal");
  for (const z of [GZ, (GZ + Z1) / 2, Z1]) k.box(f, X1 - GX, 0.08, 0.05, (X1 + GX) / 2, -0.1, z, "#3a3644", "metal");
  for (let x = GX; x <= X1 + 0.01; x += 2.8) k.box(f, 0.05, 0.08, Z1 - GZ, x, -0.1, (GZ + Z1) / 2, "#3a3644", "metal");
  k.box(f, 0.06, 0.02, GZ - Z0, GX, 0.0, (Z0 + GZ) / 2, VIOLET, "glow");
  k.box(f, X1 - GX, 0.02, 0.06, (X1 + GX) / 2, 0.0, GZ, VIOLET, "glow");
  const walk = neon("SKY WALK · ガラスの床", 0.34, GOLD);
  k.add(f, walk, 3.5, 0.015, -2.0, 0);
  walk.rotation.set(-Math.PI / 2, 0, Math.PI);
  // the parapet: glass to the floor over the walk, on a steel kerb elsewhere
  for (const [a, b, c, d, low] of [
    [X0, Z0, X1, Z0, false],
    [X0, Z1, X1, Z1, true],
    [X0, Z0, X0, Z1, true],
    [X1, Z0, X1, Z1, false],
  ] as const) {
    if (!low) k.wall(f, a, b, c, d, 0.3, "#2a2632", "metal", 0.36);
    else k.wall(f, a, b, c, d, 0.05, "#2a2632", "metal", 0.12);
    k.wall(f, a, b, c, d, low ? 1.25 : 1.0, "#cfe4f4", "glass", 0.05, low ? 0.05 : 0.3, false);
    k.wall(f, a, b, c, d, 0.07, GOLD, "metal", 0.1, 1.3, false);
    k.wall(f, a, b, c, d, 0.04, VIOLET, "glow", 0.06, low ? 0.06 : 0.32, false);
  }
  for (let x = X0; x <= X1; x += 2.8) for (const z of [Z0, Z1]) k.box(f, 0.08, 1.3, 0.08, x, 0.3, z, "#8a8e98", "metal");
  for (let z = Z0; z <= Z1; z += 2.8) for (const x of [X0, X1]) k.box(f, 0.08, 1.3, 0.08, x, 0.3, z, "#8a8e98", "metal");
  // beacons on the corners
  for (const [x, z] of [
    [X0 + 0.4, Z0 + 0.4],
    [X1 - 0.4, Z0 + 0.4],
    [X0 + 0.4, Z1 - 0.4],
    [X1 - 0.4, Z1 - 0.4],
  ] as const) {
    k.box(f, 0.2, 2.2, 0.2, x, 0, z, "#2a2632", "metal");
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color("#ff4a3a").multiplyScalar(2), toneMapped: false }));
    b.raycast = () => {};
    k.add(f, b, x, 2.3, z, 0);
    k.ticks[f].push((_dt, t) => (b.visible = Math.sin(t * 3 + x) > 0));
  }

  // ---- the crown ------------------------------------------------------------------------------------------
  crown(k, live);

  // ---- telescopes, each aimed at a real place ----------------------------------------------------------------
  const spots: [number, number][] = [
    [X0 + 0.75, -4],
    [X0 + 0.75, -12],
    [X0 + 0.75, -20],
    [-3, Z0 + 0.75],
    [5, Z0 + 0.75],
    [-3, Z1 - 0.75],
    [5, Z1 - 0.75],
  ];
  const used = new Set<number>();
  spots.forEach(([x, z], i) => {
    const onX = Math.abs(x - (X0 + 0.75)) < 0.01;
    const ox = onX ? -1 : (x / 14) * 0.3,
      oz = onX ? (z + 14) / 14 * 0.3 : z < -14 ? -1 : 1;
    const b = bearing(ox, oz);
    let best = -1,
      bd = 1e9;
    SIGHTS.forEach((s, j) => {
      if (used.has(j)) return;
      const sb = bearing(s.x - AT.x, s.z - AT.z);
      let d = Math.abs(sb - b);
      d = Math.min(d, 360 - d);
      if (d < bd) (bd = d), (best = j);
    });
    used.add(best);
    const s = SIGHTS[best];
    const dx = s.x - AT.x,
      dz = s.z - AT.z;
    const dist = Math.hypot(dx, dz);
    const sb = bearing(dx, dz);
    k.vox(f, "nu7-scope", () => telescope(), x, z, Math.atan2(-dx, -dz));
    k.hit(f, 0.8, 1.6, 0.8, x, 0, z, `<b>Telescope</b><span>${s.name}</span>`, (): PickInfo => ({
      eyebrow: `SKY DECK · telescope ${i + 1}`,
      title: s.name,
      stats: [
        ["Looking", `${compass(sb)} · ${Math.round(sb)}°`],
        ["Distance", `${Math.round(dist)} m`],
        ["Down", "124 m"],
        ["What", s.what],
      ],
      body: s.name === "NU7 GRAND PRIX" ? "<p>RACE it: the PIT GARAGE (lift to P), or the pit gate on the street.</p>" : undefined,
    }));
  });

  // ---- the SKY BAR, east, under its pergola -----------------------------------------------------------------
  {
    const BX = 9.4;
    k.vox(f, "nu7-bar", () => barCounter(11, VIOLET), BX, -14, -Math.PI / 2);
    k.vox(f, "nu7-backbar", () => backBar(9), X1 - 1.0, -14, -Math.PI / 2);
    for (let z = -18.6; z <= -9.4; z += 1.15) k.vox(f, "nu7-stool", () => stool(GOLD), BX - 1.0, z, Math.PI / 2, { solid: false });
    // the pergola: posts, beams, slats, bulbs
    for (const x of [BX - 1.6, X1 - 0.5]) {
      for (const z of [-20.5, -7.5]) k.box(f, 0.22, 3.4, 0.22, x, 0, z, "#2a2632", "metal");
      k.box(f, 0.24, 0.3, 13.2, x, 3.4, -14, "#3a2a1c", "polish");
    }
    for (let z = -20.4; z <= -7.6; z += 0.55) k.box(f, X1 - 0.5 - (BX - 1.6) + 0.4, 0.08, 0.14, (X1 - 0.5 + BX - 1.6) / 2, 3.72, z, "#4a3624", "matte");
    for (let z = -20.2; z <= -7.8; z += 0.8) for (const x of [BX - 1.6, X1 - 0.5]) {
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color("#ffd8a0").multiplyScalar(2.2), toneMapped: false }));
      bulb.raycast = () => {};
      k.add(f, bulb, x, 3.28, z, 0);
    }
    const sign = neon("SKY BAR · 天空", 0.6, VIOLET);
    k.add(f, sign, X1 - 0.62, 2.85, -14, -Math.PI / 2);
    k.box(f, 0.08, 0.04, 6.4, X1 - 0.6, 2.45, -14, GOLD, "glow");
    // its menu board: the house's numbers
    const menu = new Surface(512, 768, 1.1);
    const drawMenu = () =>
      menu.draw((g, W, Hh) => {
        g.fillStyle = "#14101c";
        g.fillRect(0, 0, W, Hh);
        g.strokeStyle = GOLD;
        g.lineWidth = 6;
        g.strokeRect(10, 10, W - 20, Hh - 20);
        g.fillStyle = GOLD;
        g.font = PX(52);
        g.textAlign = "center";
        g.fillText("天空", W / 2, 90);
        g.font = PX(30);
        g.fillStyle = "#efe6ff";
        const rows: [string, string][] = [
          ["THE 25 SECOND", "25"],
          ["BRANCH 0x77190AD9", "7"],
          ["NSM SOUR", "60"],
          ["HALVING FIZZ", "26"],
          ["BLOCK 3,543,405", "52"],
        ];
        rows.forEach(([a, b], i) => {
          const y = 190 + i * 104;
          g.textAlign = "left";
          g.fillStyle = "#efe6ff";
          g.fillText(a, 40, y);
          g.textAlign = "right";
          g.fillStyle = VIOLET;
          g.fillText(`ⓩ ${b}`, W - 40, y);
        });
        g.textAlign = "left";
        scan(g, W, Hh, 4);
      });
    drawMenu();
    const mm = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.5), menu.mat);
    mm.raycast = () => {};
    k.add(f, mm, BX - 1.62, 1.6, -21.0, -Math.PI / 2 + 0.6);
    k.box(f, 0.06, 1.1, 0.06, BX - 1.6, 0, -21.0, "#2a2632", "metal");
    k.hit(f, 2.2, 1.4, 12, BX, 0, -14, `<b>SKY BAR · 天空</b><span>124 m up</span>`, () => ({
      eyebrow: "SKY DECK · SKY BAR",
      title: "天空 · SKY BAR",
      stats: [
        ["Height", "124 m"],
        ["Tip", live.tip ? `#${num(live.tip)}` : "—"],
        ["Since NU7", live.since !== null ? `${num(live.since)} blocks` : "—"],
        ["Payment", "ⓩ, play money"],
      ],
    }));
  }

  // ---- loungers at the edge of the walk, facing the circuit ------------------------------------------------
  for (const z of [-6.4, -8.4, -16.2, -18.2, -24.4]) k.vox(f, "nu7-lounger", () => lounger(VIOLET), -8.4, z, Math.PI / 2);
  for (const z of [-7.4, -17.2]) {
    k.vox(f, "nu7-umbrella", () => umbrella(VIOLET), -6.6, z, 0, { solid: false });
    k.solid(f, -6.75, z - 0.15, -6.45, z + 0.15);
  }
  // ---- the fire pit, north of the crown: sofas round a long flame, umbrellas -------------------------------------
  const PZ = -23.2;
  k.vox(f, "nu7-deck-sofa", () => sofa("#e8e2f0", 3, VIOLET), 0, PZ + 1.9, Math.PI);
  k.vox(f, "nu7-deck-sofa", () => sofa("#e8e2f0", 3, VIOLET), 0, PZ - 1.9, 0);
  k.vox(f, "nu7-deck-arm", () => armchair("#e8e2f0"), -2.6, PZ, Math.PI / 2);
  k.vox(f, "nu7-deck-arm", () => armchair("#e8e2f0"), 2.6, PZ, -Math.PI / 2);
  const fire = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.12, 0.3), new THREE.MeshBasicMaterial({ color: new THREE.Color("#ff9a3c").multiplyScalar(2), toneMapped: false }));
  fire.raycast = () => {};
  k.box(f, 3.0, 0.45, 1.0, 0, 0, PZ, "#1c1824", "polish");
  k.box(f, 3.04, 0.04, 1.04, 0, 0.45, PZ, GOLD, "metal");
  k.add(f, fire, 0, 0.5, PZ, 0);
  k.solid(f, -1.5, PZ - 0.5, 1.5, PZ + 0.5);
  for (const x of [-5.2, 5.2]) {
    k.vox(f, "nu7-umbrella", () => umbrella(VIOLET), x, PZ, 0, { solid: false });
    k.solid(f, x - 0.15, PZ - 0.15, x + 0.15, PZ + 0.15);
  }
  // string lights over the walk, post to post
  for (let z = Z0 + 2; z <= Z1 - 2; z += 4) {
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(i % 2 ? "#ffd8a0" : "#e8c8ff").multiplyScalar(2.2), toneMapped: false }));
      bulb.raycast = () => {};
      k.add(f, bulb, X0 + 0.2 + (GX - 0.6 - X0) * t, 2.9 - Math.sin(t * Math.PI) * 0.45, z, 0);
    }
    k.box(f, 0.08, 3.0, 0.08, GX - 0.4, 0, z, "#2a2632", "metal");
    k.box(f, 0.08, 3.0, 0.08, X0 + 0.2, 0, z, "#2a2632", "metal");
  }
  k.ticks[f].push((_dt, t) => {
    fire.scale.y = 1 + Math.sin(t * 9) * 0.3 + Math.sin(t * 23) * 0.2;
    (fire.material as THREE.MeshBasicMaterial).color.setRGB(2 + Math.sin(t * 7) * 0.3, 0.9 + Math.sin(t * 5) * 0.2, 0.5);
  });
  // planters at the corners
  for (const [x, z, s] of [
    [GX + 1.0, GZ - 1.0, 81],
    [X1 - 1.2, GZ - 1.0, 82],
    [GX + 1.0, Z0 + 1.2, 83],
    [X1 - 1.2, Z0 + 1.2, 84],
  ] as const) {
    k.box(f, 1.4, 0.7, 1.4, x, 0, z, "#2a2632", "polish");
    k.box(f, 1.44, 0.04, 1.44, x, 0.7, z, GOLD, "metal");
    k.vox(f, `nu7-deck-tree${s}`, () => indoorTree(s), x, z, 0, { dy: 0.7, k: 0.6 });
    k.solid(f, x - 0.75, z - 0.75, x + 0.75, z + 0.75);
  }

  // ---- the lifts ---------------------------------------------------------------------------------------
  const [lx, lz, lry] = LIFT[f];
  k.lifts(f, lx, lz, lry, LIFT_STYLE);

  // ---- light --------------------------------------------------------------------------------------------
  k.light(f, 11, 3, -14, "#ffd8a0", 16, 12);
  k.light(f, -9, 2.5, -13.6, "#ffe2b8", 10, 12);
  k.light(f, 0, 10, -14, VIOLET, 22, 20);
  k.light(f, 0, 3, -5, "#fff1d6", 8, 12);
  k.light(f, 0, 3, -23, "#fff1d6", 8, 12);
  k.light(f, -11.6, 1.2, -9.9, "#ff9a3c", 8, 6);

  // ---- people ---------------------------------------------------------------------------------------------
  k.onCast(f, () => {
    void k.person(f, 7601, [11.6, -14], "Bartender", {
      face: [-1, 0],
      lines: ["What can I get you? The 25 Second is the house special.", () => (live.tip ? `Block ${num(live.tip)}. Cheers.` : "Cheers."), "Best seat in ZStreet. The circuit's right below."],
    });
    void k.person(f, 7602, [BX_STOOL, -12.3], "Guest", { sit: true, dy: 0.74, face: [1, 0], lines: ["One more block and I'm going down to race."] });
    void k.person(f, 7603, [BX_STOOL, -16.9], "Guest", { sit: true, dy: 0.74, face: [1, 0] });
    const a = k.person(f, 7604, [-0.6, PZ - 1.8], "Resident", { sit: true, dy: 0.45, face: [0, 1] });
    const b = k.person(f, 7605, [0.7, PZ + 1.8], "Resident", { sit: true, dy: 0.45, face: [0, -1] });
    k.dialog(f, [a, b], [
      [0, "Look at them go down there."],
      [1, "Five karts. They never stop."],
      [0, () => (live.burnedSince ? `${zec(live.burnedSince.zat, 2)} ZEC burned since NU7.` : "Every block burns a little.")],
      [1, "And the tower counts every one of them."],
    ]);
    void k.person(f, 7606, [-12.4, -10.6], "Photographer", { face: [-1, 0.2], lines: ["The whole circuit fits in one frame from here.", "Look down. Right under your feet."] });
    void k.person(f, 7607, [-11.6, -2], "Visitor", { face: [-0.4, 1], wander: [[-11.6, -2], [-12, -24], [4, -1.8], [-12.4, -14]], lines: ["Glass. 124 metres. Don't look down.", "I can see the karts from here!"] });
    void k.person(f, 7608, [-8.3, -16.2], "Resident", { sit: true, dy: 0.42, face: [-1, 0] });
  });
}
const BX_STOOL = 8.45;

/** The crown rising out of the deck: gold fins and glass, a violet band, NU7 on every face, the LED band, the spire. */
function crown(k: SkyKit, live: Nu7Live) {
  const { x0, x1, z0, z1 } = CORE;
  const cx = (x0 + x1) / 2,
    cz = (z0 + z1) / 2;
  const w = x1 - x0,
    d = z1 - z0;
  // tier one: slab, glass between gold fins, the band of violet neon at the top
  k.box(f, w, 9, d, cx, 0, cz, "#2a2838", "matte");
  k.solid(f, x0, z0, x1, z1);
  const glass = "#5b45b0";
  for (const [ax, az, bx, bz, n] of [
    [x0, z0, x1, z0, [0, -1]],
    [x0, z1, x1, z1, [0, 1]],
    [x0, z0, x0, z1, [-1, 0]],
    [x1, z0, x1, z1, [1, 0]],
  ] as const) {
    const len = Math.hypot(bx - ax, bz - az);
    const ry = -Math.atan2(bz - az, bx - ax);
    const steps = Math.round(len / 0.7);
    // (the south face holds the lifts up to 4.4 m: the fins start over them there)
    const south = n[1] === 1;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      k.box(f, 0.1, south ? 4.4 : 8.8, 0.14, ax + (bx - ax) * t + n[0] * 0.06, south ? 4.4 : 0.1, az + (bz - az) * t + n[1] * 0.06, "#d9a63a", "metal", ry);
    }
    k.box(f, len - 0.1, south ? 3.8 : 7.6, 0.04, (ax + bx) / 2 + n[0] * 0.02, south ? 4.6 : 0.6, (az + bz) / 2 + n[1] * 0.02, glass, "polish", ry);
    k.box(f, len + 0.12, 0.22, 0.2, (ax + bx) / 2 + n[0] * 0.08, 8.3, (az + bz) / 2 + n[1] * 0.08, VIOLET, "glow", ry);
  }
  // the LED band round it, the tower's numbers running
  const band = new Surface(2048, 96, 1.5);
  band.tex.wrapS = THREE.RepeatWrapping;
  const drawBand = () =>
    band.draw((g, W, Hh) => {
      g.fillStyle = "#06040b";
      g.fillRect(0, 0, W, Hh);
      const b = live.burnedSince;
      const h = live.halving;
      const text = [`NU7 · ${NU7.branch}`, live.tip ? `TIP #${num(live.tip)}` : null, live.since !== null ? `${num(live.since)} BLOCKS SINCE NU7` : null, live.avg ? `AVG ${live.avg.toFixed(1)} s` : "25 s", b ? `NSM ${zec(b.zat, 4)} ZEC BURNED` : null, h.left !== null ? `HALVING #${num(h.height)} IN ${num(h.left)}` : null]
        .filter(Boolean)
        .join("   ◆   ");
      g.font = PX(62);
      g.textBaseline = "middle";
      g.fillStyle = GOLD;
      g.shadowColor = GOLD;
      g.shadowBlur = 12;
      const tw = g.measureText(`${text}   ◆   `).width;
      for (let x = 10; x < W; x += tw) g.fillText(`${text}   ◆   `, x, Hh / 2 + 3);
      g.shadowBlur = 0;
      scan(g, W, Hh, 3);
    });
  drawBand();
  live.on(drawBand);
  for (const [px, pz, ry, len] of [
    [cx, z1 + 0.13, 0, w],
    [cx, z0 - 0.13, Math.PI, w],
    [x0 - 0.13, cz, -Math.PI / 2, d],
    [x1 + 0.13, cz, Math.PI / 2, d],
  ] as const) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.5), band.mat);
    m.raycast = () => {};
    k.add(f, m, px, 7.6, pz, ry);
  }
  k.ticks[f].push((dt) => (band.tex.offset.x = (band.tex.offset.x + dt * 0.035) % 1));
  // NU7 on every face, over the band
  for (const [px, pz, ry] of [
    [cx, z1 + 0.16, 0],
    [cx, z0 - 0.16, Math.PI],
    [x0 - 0.16, cz, -Math.PI / 2],
    [x1 + 0.16, cz, Math.PI / 2],
  ] as const) {
    const s = neon("NU7", 1.4, VIOLET, { k: 2 });
    k.add(f, s, px, 10.2, pz, ry);
  }
  // tiers two and three, and the spire
  k.box(f, w - 1.6, 3.2, d - 1.6, cx, 9, cz, "#d9a63a", "metal");
  k.box(f, w - 1.5, 0.18, d - 1.5, cx, 11.6, cz, VIOLET, "glow");
  k.box(f, w - 3.4, 2.6, d - 3.6, cx, 12.2, cz, "#2a2838", "matte");
  k.box(f, w - 3.3, 0.16, d - 3.5, cx, 14.4, cz, GOLD, "glow");
  k.cyl(f, 1.2, 0.9, 4, cx, 14.8, cz, "#d9a63a", "metal", 24);
  k.cyl(f, 0.5, 0.18, 13, cx, 18.8, cz, "#d9a63a", "metal", 16);
  for (const y of [21, 24, 27]) k.cyl(f, 0.6, 0.6, 0.12, cx, y, cz, GOLD, "glow", 20);
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.32, 16, 10), new THREE.MeshBasicMaterial({ color: new THREE.Color(VIOLET).multiplyScalar(3), toneMapped: false }));
  beacon.raycast = () => {};
  k.add(f, beacon, cx, 32, cz, 0);
  k.ticks[f].push((_dt, t) => beacon.scale.setScalar(0.8 + 0.4 * Math.max(0, Math.sin(t * 2.4))));
  k.hit(f, w, 9, d, cx, 0, cz, `<b>The crown</b><span>NU7 TOWER · 36 floors</span>`, () => ({
    eyebrow: "SKY DECK · the crown",
    title: "NU7 TOWER",
    stats: [
      ["Floors", "36"],
      ["Crown", "gold · violet neon"],
      ["Upgrade", `NU7 · #${num(NU7.height)}`],
      ["Branch ID", NU7.branch],
    ],
  }));
}
