/**
 * NIGHT MARKET: CONSENSUS RUN at night through a hawker street of old shophouses, over a canal. Its
 * twist is the SHUTTERS: rows of shop gates across the street that slam down on a beat, each with a
 * lamp over it (green: up; blinking amber: about to drop; red: down). Run through on green, or wait
 * a beat in front: caught under one and it throws you back. Then the LANTERN PIER (giant paper
 * lanterns swinging over a narrow pier), the SAMPAN CROSSING (boats drifting to and fro on the
 * canal), the LAZY SUSANS (spinning round tables over the water, each carrying you round) and the
 * LAST CALL (one more row of faster shutters, then the stairs to the rooftop finish).
 */
import * as THREE from "three";
import { T } from "../../../i18n/lang";
import { rng } from "../../kit";
import { GEO, canvasTex, glow, label, qTex, skyDome, skyline } from "../../k3";
import { Bake, Blinkers, Crowd, Pieces, TAU, cel, far, lit, sunAt, type Level } from "./kit";

const WATER = -1.6;
const FIN = 188;
/** The street's stretches, where the shophouses stand along both sides (s0, s1). */
const STREETS: [number, number][] = [
  [-10, 50],
  [152, 202],
];
/** The canal (between the streets). */
const C0 = 50,
  C1 = 152;

/** The canal at night: dark water, short lighter ripples (it drifts). */
function waterTex(rnd: () => number) {
  return canvasTex(
    256,
    256,
    (g) => {
      g.fillStyle = "#10263f";
      g.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 150; i++) {
        g.fillStyle = i % 5 === 0 ? "#2a5880" : i % 2 ? "#173556" : "#1d426a";
        g.fillRect(Math.floor(rnd() * 256), Math.floor(rnd() * 64) * 4, 14 + Math.floor(rnd() * 46), i % 5 === 0 ? 2 : 3);
      }
    },
    true,
  );
}

export const MARKET: Level = {
  key: "market",
  title: "NIGHT MARKET",
  titleZh: "夜市",
  tag: "Shop shutters slam on a beat: go on green, wait on red",
  tagZh: "卷帘门按节拍落下：绿灯冲，红灯等",
  song: "neon",
  ambience: "market",
  look: {
    sky: ["#080420", "#3d1a5e"],
    fog: [60, 240],
    night: true,
    hemi: ["#c4b4ff", "#5a3060", 2.1],
    sun: ["#ffd0ec", 1.15],
    post: "#2a1a3a",
    gate: ["#ffd23f", "#d6246e"],
    slabTh: 2.0,
    thrusters: false,
    lips: true,
    ham: ["#3a2626", "#e8202a", "#ffd23f", "#6a3f22"],
    movers: ["#c98a4f", "#b8743f", "#d99a5a"],
    hull: "#6a3a1e",
    splash: ["#ffffff", "#7ad8ff", "#3fa0c8"],
  },
  grav: 30,
  jumpV: 10.6,
  water: WATER,
  secs: [
    { s: -8, en: "MARKET GATE", zh: "夜市入口", sh: "GATE", shZh: "入口", c: "#ff5fa2" },
    { s: 9, en: "SHUTTER STREET", zh: "卷帘街", sh: "SHUTTERS", shZh: "卷帘", c: "#3ec6ff" },
    { s: 50, en: "LANTERN PIER", zh: "灯笼栈桥", sh: "LANTERNS", shZh: "灯笼", c: "#ffb02e" },
    { s: 82, en: "SAMPAN CROSSING", zh: "舢板渡口", sh: "SAMPANS", shZh: "舢板", c: "#3fe0c8" },
    { s: 110, en: "LAZY SUSANS", zh: "转盘桌", sh: "TABLES", shZh: "转盘", c: "#ff6b35" },
    { s: 150, en: "LAST CALL", zh: "收摊冲刺", sh: "LAST CALL", shZh: "收摊", c: "#c4b1fc" },
  ],
  // (a night street: the floor mid-dark and quiet, so the four, the gates and their lamps are the bright things)
  pal: [
    ["#8f6f96", "#a98bb0", "#4a2d52"],
    ["#5f7698", "#7790b2", "#2a3f5e"],
    ["#9a744c", "#b38e62", "#553619"],
    ["#5b958b", "#77b0a5", "#22524a"],
    ["#b0664e", "#c98068", "#6a2a1a"],
    ["#7a6eb4", "#958ace", "#3a2f6a"],
  ],
  slabs: [
    [-7.25, 7.25, -8, 9, 0, 0, 0],
    [-7.25, 7.25, 9, 50, 0, 0, 1],
    [-3, 3, 50, 82, 0, 0, 2],
    [-6, 6, 82, 86, 0, 0, 3],
    [-6, 6, 104.5, 110, 0, 0, 3],
    [-7.25, 7.25, 152, 176, 0, 0, 5],
    [-5, 5, 176, 186, 0, 3.2, 5],
    [-7.6, 7.6, 186, 198, 3.2, 3.2, 5],
  ],
  cps: [
    { s: 0, y: 0, x0: -4.5, x1: 4.5 },
    { s: 51.5, y: 0, x0: -2, x1: 2 },
    { s: 83.2, y: 0, x0: -4, x1: 4 },
    { s: 105.6, y: 0, x0: -4, x1: 4 },
    { s: 153.2, y: 0, x0: -4.5, x1: 4.5 },
  ],
  fin: { s: FIN, y: 3.2, x0: -7.6, x1: 7.6 },
  gateW: 14.4,
  zones: [
    { k: "go", s1: 9, w: 2.4, lim: 5 },
    { k: "shut", s1: 50, lim: 5 },
    { k: "hams", s1: 82, w: 1.3, lim: 1.8 },
    { k: "blocks", s1: 104 },
    { k: "discs", s1: 151.5 },
    { k: "shut", s1: 176, lim: 5 },
    { k: "go", s1: 1e9, w: 2, lim: 3 },
  ],
  arches: [
    [-7.8, -7.25, 7.25, 0, "NIGHT MARKET", "夜市", "#d6246e"],
    [9.5, -7.25, 7.25, 0, "SHUTTERS · GO ON GREEN", "卷帘门 · 绿灯才走", "#1f8fd6", 1.0],
    [50.6, -3, 3, 0, "LANTERN PIER", "灯笼栈桥", "#d66a00", 0.9],
    [82.5, -6, 6, 0, "SAMPAN CROSSING", "舢板渡口", "#16a08c"],
    [109.6, -6, 6, 0, "LAZY SUSANS", "转盘桌", "#e04a14"],
    [152.6, -7.25, 7.25, 0, "LAST CALL", "收摊冲刺", "#6a52d6"],
    [FIN, -7.6, 7.6, 3.2, "FINALITY!", "最终确认！", "#ff6b35", 1.5, 7.2],
  ],
  shutters: [
    { s: 15, x0: -7.25, x1: 7.25, n: 5, per: [4.0], open: 0.4, beat: "sync" },
    { s: 24.5, x0: -7.25, x1: 7.25, n: 5, per: [3.8], open: 0.28, beat: "wave" },
    { s: 34, x0: -7.25, x1: 7.25, n: 5, per: [3.6], open: 0.36, beat: "checker" },
    { s: 43.5, x0: -7.25, x1: 7.25, n: 5, per: [3.9, 3.2, 3.6, 4.1, 3.3], open: 0.3 },
    { s: 159, x0: -7.25, x1: 7.25, n: 5, per: [3.4], open: 0.42, beat: "sync" },
    { s: 167.5, x0: -7.25, x1: 7.25, n: 5, per: [3.2], open: 0.32, beat: "back" },
  ],
  hams: [
    { s: 57, T: 2.9, ph: 0.6 },
    { s: 63.5, T: 2.6, ph: 2.6 },
    { s: 70, T: 2.4, ph: 4.4 },
    { s: 76.5, T: 2.2, ph: 1.4 },
  ],
  lanes: [
    { s0: 88, s1: 91.5, per: 3.2, ph: 0, cs: [-3.6, 3.6], amp: 2.9, hw: 1.8 },
    { s0: 93.7, s1: 97.2, per: 2.7, ph: Math.PI / 2, cs: [-3.6, 3.6], amp: 2.9, hw: 1.8 },
    { s0: 99.4, s1: 102.9, per: 3.5, ph: Math.PI, cs: [-3.6, 3.6], amp: 2.9, hw: 1.8 },
  ],
  discs: [
    { cx: 0, cs: 115.2, R: 3.4, w: 1.2 },
    { cx: -2.8, cs: 123.4, R: 3.1, w: -1.35 },
    { cx: 2.8, cs: 131, R: 3.1, w: 1.45 },
    { cx: 0, cs: 139.2, R: 3.3, w: -1.25 },
    { cx: -2.4, cs: 147.2, R: 3.1, w: 1.35 },
  ],
  solid: [
    [-9.5, -7.3, -10, 50, 4.5],
    [7.3, 9.5, -10, 50, 4.5],
    [-9.5, -7.3, 152, 176, 4.5],
    [7.3, 9.5, 152, 176, 4.5],
  ],

  scenery(k) {
    const { scene: sc, rnd, ink, slabs, deco, lights, fx, world } = k;
    // (the scenery's own stream. The game's `rnd` is only drawn from where it always was, and as often:
    // the race that follows depends on how many numbers the scenery took)
    const dr = rng(0x3a7e7);
    // the moon from behind the start, to the left: a gate's shadow falls up the street, past it
    sunAt(world, 114, 46);
    sc.userData.shadowK = 0.9;
    skyDome(sc, { sky: ["#080420", "#3d1a5e"], ground: "#1c0f38", stars: 900, band: true, clouds: 9, cloud: "#4f3880", cloudShade: "#2e1d55", disc: { az: 114, el: 40, moon: true, size: 9, color: "#fff1d6" }, haze: 0.4, rnd: dr });
    // lit panes that are not lamps (windows, shop boards): unlit, dim, out of the bloom
    const panes = new Bake();
    // roofs, awnings, sills: lit, but far from any shadow that matters
    const trim = new Bake();

    // the canal: dark water drifting by, the neon's streaks on it
    const wtex = waterTex(dr);
    wtex.repeat.set(64, 64);
    const water = far(new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ map: wtex })));
    water.rotation.x = -Math.PI / 2;
    water.scale.set(640, 640, 1);
    water.position.set(0, WATER, -90);
    sc.add(water);
    const streaks = new Bake();
    const neon = ["#ff5fa2", "#3ec6ff", "#ffd23f", "#8ee35b", "#c4b1fc"];
    for (let i = 0; i < 70; i++) {
      const x = (rnd() < 0.5 ? -1 : 1) * (3 + rnd() * 13);
      const s = C0 + rnd() * (C1 - C0);
      streaks.box(neon[i % neon.length], 0.25 + rnd() * 0.5, 0.02, 1.5 + rnd() * 3, x, WATER + 0.02, -s);
    }
    const streakMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false });
    far(streaks.build(sc, GEO.box, streakMat));

    // the shophouses: two storeys and a roof over a shop, dusky fronts (the street is the bright thing),
    // a few dim windows, an awning, now and then a balcony with people on it
    const fronts = new Bake();
    const dusk = ["#4d3b6e", "#3c4c72", "#5c3c5e", "#36526c", "#5a4264", "#454272", "#3f5764"];
    const awnC = ["#a03c4c", "#3a6a9c", "#3c8a6e", "#a8703c", "#7a4ca0"];
    const boardC = ["#d9609e", "#52aede", "#a184e6", "#e6c08a"];
    const crowd = new Crowd();
    /** Where steam rises (shop fronts, stalls). */
    const steamAt: [number, number, number][] = [];
    let nHouse = 0;
    const house = (x: number, side: number, s: number, w: number, y0: number, rn: () => number) => {
      const c = dusk[Math.floor(rn() * dusk.length)];
      // (taller round the rooftop finish: the lantern strings hang between them)
      const h = 7 + Math.floor(rn() * 3) * 1.6 + (s > 176 && Math.abs(x) < 9 ? 5 : 0);
      const d = 5;
      const cx = x + (side * d) / 2;
      const n = nHouse++;
      fronts.box(c, d, h, w - 0.2, cx, y0 + h / 2, -s);
      // the roof's eave (terracotta), a pale band over the shop
      trim.box("#8e4334", d + 0.8, 0.5, w + 0.1, cx - side * 0.2, y0 + h + 0.2, -s);
      trim.box("#6f6590", 0.2, 0.3, w - 0.3, x - side * 0.05, y0 + 3.4, -s);
      // two rows of windows: a few lit (warm, dim), the rest behind dark louvres
      for (let wy = 4.4; wy < h - 0.7; wy += 1.6)
        for (const wz of [-w / 4, w / 4]) {
          const u = rn();
          const v = u < 0.62 ? rn() : 1;
          panes.box(u < 0.3 ? (v < 0.5 ? "#c98a3e" : "#b8705a") : "#272f4c", 0.1, 1.0, 0.9, x - side * 0.04, y0 + wy, -(s + wz));
        }
      // the shop at the foot: a dark mouth, a glow low inside, its board, a striped awning over it
      const sv = rn();
      panes.box("#221830", 0.1, 2.5, w - 1.0, x - side * 0.03, y0 + 1.4, -s);
      panes.box(sv < 0.5 ? "#96682e" : "#8a4c58", 0.12, 1.0, w - 1.7, x - side * 0.05, y0 + 0.8, -s);
      panes.box(boardC[n % boardC.length], 0.14, 0.4, w - 1.5, x - side * 0.07, y0 + 2.9, -s);
      const aw = awnC[(n * 3 + (side > 0 ? 1 : 0)) % awnC.length];
      for (let j = 0; j < 4; j++) trim.box(j % 2 ? "#d8cfc0" : aw, 1.0, 0.1, (w - 0.4) / 4, x - side * 0.5, y0 + 3.78, -(s + (j - 1.5) * ((w - 0.4) / 4)), 0, 0, side * 0.2);
      if (n % 3 === 1 && h > 7.5) {
        // a balcony: two or three watching the race
        trim.box("#6f6590", 0.9, 0.14, w - 0.8, x - side * 0.45, y0 + 4.02, -s);
        trim.box("#b9a8d8", 0.08, 0.1, w - 0.8, x - side * 0.88, y0 + 4.75, -s);
        for (const dz of [-(w - 0.8) / 2, 0, (w - 0.8) / 2]) trim.box("#b9a8d8", 0.08, 0.7, 0.08, x - side * 0.88, y0 + 4.4, -(s + dz));
        for (let j = 0; j < 2 + (n % 2); j++) crowd.add(x - side * 0.5, y0 + 4.09, -(s - 0.9 + j * 0.9), (side * -Math.PI) / 2, dr, 0.9);
      }
      if (n % 4 === 2) steamAt.push([x - side * 0.3, y0 + 2.2, -s]);
    };
    // along the streets: right against the course (the shop fronts are the wall it can't pass)
    for (const [s0, s1] of STREETS)
      for (const side of [-1, 1]) for (let s = s0 + 2; s < s1 - 1; s += 4.2) house(side * 7.5, side, s, 4.2, 0, rnd);
    // across the canal: a row on each bank, the quays in front
    for (const side of [-1, 1]) {
      for (let s = C0 + 2; s < C1; s += 4.4) house(side * 17, side, s, 4.4, 0, rnd);
      slabs.box("#56566e", 6, 2.2, C1 - C0, side * 17.5, -0.6, -(C0 + C1) / 2);
    }

    // neon signs on the fronts (vertical boards over the gates' height; never a lamp's red, green or amber)
    const signs: [number, number, number, string, string, string][] = [
      [-1, 6, 6.9, "夜市", "#ff5fa2", "#3a0a24"],
      [1, 13, 6.9, "麵", "#3ec6ff", "#062a40"],
      [-1, 21, 7.1, "茶", "#b79cff", "#1c0c40"],
      [1, 29, 6.9, "粥", "#ffe2b0", "#3a2a10"],
      [-1, 37, 6.9, "饭", "#ff5fa2", "#3a0a24"],
      [1, 45, 7.1, "粿", "#3ec6ff", "#062a40"],
      [-1, 157, 6.9, "冰", "#3ec6ff", "#062a40"],
      [1, 164, 7.1, "Z", "#ff8ac0", "#3a0a24"],
      [-1, 171, 6.9, "汤", "#b79cff", "#1c0c40"],
    ];
    for (const [side, s, y, txt, c, bg] of signs) {
      const x = side * 7.15;
      lights.box(c, 0.2, 3.0, 1.3, x, y, -s);
      deco.box("#2a1a3a", 0.5, 0.12, 0.12, x + side * 0.2, y + 1.2, -s);
      const lb = label(txt, 0.9, c, bg);
      lb.position.set(x - side * 0.12, y, -s);
      lb.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
      sc.add(lb);
    }
    for (let i = 0; i < 26; i++) {
      const side = i % 2 ? 1 : -1;
      const s = C0 + 2 + (i / 26) * (C1 - C0 - 4) + rnd() * 2;
      lights.box(neon[i % neon.length], 0.2, 1.6 + rnd() * 1.6, 0.7, side * 16.8, 4.6 + rnd() * 2.5, -s);
    }

    // lantern strings across the streets and the canal: paper lanterns that glow, swaying on their lines
    const lant: number[] = [];
    const strings: [number, number][] = [];
    for (let s = -4; s < C0; s += 7) strings.push([s, 7.2]);
    for (let s = C1 + 3; s < 200; s += 6.5) strings.push([s, 7.2]);
    for (let s = 86; s < 150; s += 8) strings.push([s, 13]);
    strings.forEach(([s, half], si) => {
      const n = Math.round(half / 1.6) * 2 + 1;
      for (let i = 0; i < n; i++) {
        const f = i / (n - 1);
        // (x, y, s, how far it swings, its string)
        lant.push(-half + f * half * 2, (s > 176 ? 13.4 : 10.4) - Math.sin(f * Math.PI) * 0.9, s, 0.08 + Math.sin(f * Math.PI) * 0.26, si);
      }
      trim.box("#2a1a1a", half * 2, 0.05, 0.05, 0, s > 176 ? 13.1 : 10.1, -s);
    });
    const nL = lant.length / 5;
    const pLant = far(new Pieces(sc, GEO.box, lit(0.9), nL, 0.035, ink));
    const pCap = far(new Pieces(sc, GEO.box, cel(), nL));
    for (let i = 0; i < nL; i++) (pLant.tint(i, i % 3 === 1 ? "#ffc247" : "#ff6a3c"), pCap.tint(i, "#3a1a1a"));
    const swing = (i: number, now: number) => {
      const o = i * 5;
      const a = Math.sin(now * 1.15 + lant[o + 4] * 1.7) * lant[o + 3] + Math.sin(now * 2.3 + i) * 0.03;
      const z = -(lant[o + 2] + Math.sin(a) * 1.2),
        y = lant[o + 1] + (1 - Math.cos(a)) * 1.2;
      pLant.put(i, lant[o], y, z, 0.58, 0.7, 0.58, a, 0, 0);
      pCap.put(i, lant[o], y, z, 0.3, 0.9, 0.3, a, 0, 0);
    };
    for (let i = 0; i < nL; i++) swing(i, 0);
    pLant.flush();
    pCap.flush();

    // the market gate behind the start: a wall across the street's end, its doors shut, a tiled roof,
    // its name in lights, people on its gallery
    {
      const z = 11.8;
      fronts.box("#4a3058", 27, 11, 3.4, 0, 3.9, z);
      for (const sx of [-1, 1]) fronts.box("#3c2a52", 16, 7.2, 3, sx * 21.5, 2, z + 0.3);
      panes.box("#5c2a2e", 6.4, 5.2, 0.12, 0, 2.6, z - 1.72);
      panes.box("#3a181c", 0.16, 5.2, 0.14, 0, 2.6, z - 1.74);
      for (const sx of [-1, 1]) {
        fronts.box("#7a2c34", 1.1, 6.4, 1.1, sx * 3.9, 3.2, z - 1.8);
        lights.box("#ffc247", 0.5, 0.7, 0.5, sx * 3.9, 5.2, z - 2.5);
      }
      // the gallery over the doors
      trim.box("#6f6590", 12, 0.2, 1.3, 0, 5.7, z - 2.2);
      trim.box("#b9a8d8", 12, 0.1, 0.08, 0, 6.5, z - 2.8);
      for (let i = 0; i <= 6; i++) trim.box("#b9a8d8", 0.08, 0.8, 0.08, -6 + i * 2, 6.1, z - 2.8);
      for (let i = 0; i < 12; i++) crowd.add(-5.3 + i * 0.96 + (dr() - 0.5) * 0.2, 5.8, z - 2.3 + (dr() - 0.5) * 0.3, Math.PI, dr);
      // the roof: two tiers of tiles, their corners turned up
      for (const [w, y, d] of [
        [30, 9.6, 6.2],
        [22, 11.5, 4.6],
      ]) {
        trim.box("#8e4334", w, 0.6, d, 0, y, z);
        trim.box("#6a2c26", w - 3, 1.3, d - 2.4, 0, y + 0.9, z);
        for (const sx of [-1, 1]) trim.box("#8e4334", 1.6, 0.6, d, sx * (w / 2 + 0.3), y + 0.45, z, 0, 0, sx * 0.5);
      }
      trim.box("#ffc247", 1.2, 1.2, 1.2, 0, 13.8, z);
      const name = label(T("NIGHT MARKET", "夜市"), 1.4, "#ffe2b0", "#3a0a24");
      name.position.set(0, 7.9, z - 1.76);
      name.rotation.y = Math.PI;
      sc.add(name);
      for (const sx of [-1, 1]) steamAt.push([sx * 9.5, 1.2, z - 2]);
    }
    // the pagoda past the finish, closing the street: tiers and eaves, lit from inside
    {
      const z = -214;
      fronts.box("#3c2a52", 15, 12, 13, 0, 4.4, z);
      for (const sx of [-1, 1]) fronts.box("#33264a", 14, 15, 9, sx * 14.5, 5.9, z + 3);
      let y = 10.4;
      [11.5, 9.4, 7.4, 5.6].forEach((w, i) => {
        trim.box("#8e4334", w + 4.4, 0.55, w + 4.4, 0, y, z);
        for (const sx of [-1, 1]) trim.box("#8e4334", 1.4, 0.55, w + 4.4, sx * (w / 2 + 2.4), y + 0.35, z, 0, 0, sx * 0.5);
        fronts.box(i % 2 ? "#5c3c5e" : "#4d3b6e", w, 3.6, w, 0, y + 2.05, z);
        for (const sx of [-0.25, 0.25]) panes.box("#c98a3e", w * 0.2, 1.5, 0.1, sx * w, y + 1.9, z + w / 2 + 0.03);
        y += 3.85;
      });
      trim.box("#8e4334", 6.4, 0.55, 6.4, 0, y, z);
      trim.box("#6a2c26", 3.4, 1.6, 3.4, 0, y + 1, z);
      lights.box("#ffc247", 0.9, 2.2, 0.9, 0, y + 2.9, z);
    }
    // a second row behind the banks and the street: taller blocks, a lit window here and there
    for (let i = 0; i < 64; i++) {
      const side = i % 2 ? 1 : -1;
      const s = -30 + (i >> 1) * 8.6 + dr() * 2;
      const h = 11 + dr() * 5.5;
      const x = side * (30.5 + dr() * 3);
      fronts.box(["#33264a", "#2c2f50", "#3a2a52", "#2a3550"][i % 4], 9, h + 1.6, 8.2, x, h / 2 - 0.8, -s);
      for (let j = 0; j < 3; j++) if (dr() < 0.45) panes.box(dr() < 0.5 ? "#c98a3e" : "#8a6aa8", 0.1, 0.9, 0.8, x - side * 4.55, 5 + dr() * (h - 6.5), -(s - 2.6 + j * 2.6));
    }
    far(fronts.build(sc, GEO.box, cel(), 0.04, ink));
    far(trim.build(sc, GEO.box, cel()));

    // the far city at night (its stars and its moon are the sky dome's now)
    const sky = far(skyline(sc, { r: 200, n: 70, y: -2, rnd, night: true, tall: 1.2 }));
    sky.position.z = -80;
    for (let i = 0; i < 140; i++) (rnd(), rnd(), rnd(), rnd());

    // sampans moored along both banks, their canopies
    for (let i = 0; i < 14; i++) {
      const side = i % 2 ? 1 : -1;
      const s = C0 + 4 + (i / 14) * (C1 - C0 - 8) + rnd() * 3;
      const x = side * (11 + rnd() * 1.6);
      slabs.box(["#a0623a", "#8a4f2a", "#b8743f"][i % 3], 1.6, 0.6, 4.2, x, WATER + 0.25, -s);
      deco.box(i % 3 ? "#b8303f" : "#2f7fc6", 1.4, 0.12, 2.0, x, WATER + 1.35, -s);
      for (const dz of [-0.9, 0.9]) deco.box("#3a2626", 0.08, 0.8, 0.08, x, WATER + 0.9, -(s + dz));
    }
    // stalls along the quays: a cart, its awning, its lit counter, people round it
    for (let i = 0; i < 20; i++) {
      const side = i % 2 ? 1 : -1;
      const s = C0 + 6 + (i >> 1) * 9.8 + (side > 0 ? 4.5 : 0);
      const x = side * 16.3;
      slabs.box("#7a4a2a", 1.3, 1.0, 2.2, x, 1.0, -s);
      panes.box(i % 4 < 2 ? "#e0b070" : "#d98aa8", 1.1, 0.1, 2.0, x, 1.55, -s);
      for (let j = 0; j < 4; j++) trim.box(j % 2 ? "#d8cfc0" : awnC[i % awnC.length], 1.9, 0.1, 0.62, x, 2.85, -(s + (j - 1.5) * 0.62), 0, 0, side * -0.14);
      for (const dz of [-1.1, 1.1]) trim.box("#3a2626", 0.08, 1.4, 0.08, x - side * 0.6, 2.15, -(s + dz));
      steamAt.push([x, 1.9, -s]);
      for (let j = 0; j < 3; j++) crowd.add(side * (15.2 + dr() * 0.25), 0.5, -(s + (j - 1) * 0.95 + (dr() - 0.5) * 0.3), (side * Math.PI) / 2, dr);
      for (let j = 0; j < 2; j++) crowd.add(side * (14.95 + dr() * 0.3), 0.5, -(s + 3.6 + j * 1.2 + dr() * 0.5), (side * -Math.PI) / 2, dr);
    }
    crowd.build(sc, ink);
    panes.build(sc, GEO.box, new THREE.MeshBasicMaterial({ color: 0xffffff }));
    // bulbs chasing round the gate's name and up the pagoda (warm: no lamp's colour)
    const bulbs = new Blinkers();
    for (let i = 0; i < 24; i++) bulbs.add(-3.3 + (i >> 1) * 0.6, i % 2 ? 8.9 : 6.92, 9.98, 0.2, (i >> 1) % 2 ? "#ffe2b0" : "#ff8ac0", 1.6, (i >> 1) / 6, 0.6);
    [11.5, 9.4, 7.4, 5.6].forEach((w, t) => {
      const hw = (w + 4.4) / 2;
      for (let i = 0; i < 5; i++) bulbs.add(-hw + (i * hw) / 2, 10.4 + t * 3.85 - 0.42, -214 + hw + 0.12, 0.3, "#ffe2b0", 2.4, t / 4 + i / 10, 0.55);
    });
    bulbs.build(sc);

    // floating river lanterns, drifting and bobbing on the water
    const floats: { x: number; s: number; ph: number; v: number }[] = [];
    for (let i = 0; i < 36; i++) floats.push({ x: (rnd() < 0.5 ? -1 : 1) * (4 + rnd() * 9), s: C0 + rnd() * (C1 - C0), ph: rnd() * TAU, v: 0.2 + rnd() * 0.3 });
    const pFloat = far(new Pieces(sc, GEO.box, glow("#ffc46b"), floats.length));
    const pFloatBase = far(new Pieces(sc, GEO.box, cel({ color: "#ff5fa2", emissive: 0x401028 }), floats.length));
    // sky lanterns let go over the roofs, rising slowly
    const ups: { x: number; z: number; y: number; ph: number; v: number }[] = [];
    for (let i = 0; i < 34; i++) ups.push({ x: (dr() < 0.5 ? -1 : 1) * (20 + dr() * 55), z: 50 - dr() * 330, y: dr() * 60, ph: dr() * TAU, v: 0.5 + dr() * 0.5 });
    const pUp = far(new Pieces(sc, GEO.box, lit(1), ups.length));
    ups.forEach((_, i) => pUp.tint(i, i % 4 ? "#ffb04a" : "#ff7a5a"));
    // fireworks over the canal, steam off the stalls
    const cam = world.camera;
    const at = new THREE.Vector3();
    let boom = 1.5,
      steam = 0,
      si = 0;
    // Q lamps along the quays: a post, an arm, a golden Q lantern hanging from it (fixed there: nothing to pick up)
    const qs: { x: number; y: number; z: number; ph: number; s: number }[] = [];
    const pQ = far(new Pieces(sc, GEO.box, cel({ map: qTex(), emissive: 0x5a3a00 }), 12, 0.04, ink));
    for (let i = 0; i < 12; i++) {
      const side = i % 2 ? 1 : -1;
      const q = { x: side * (13.9 + rnd() * 0.1), y: 4.4 + rnd() * 0.5, z: -(C0 + 4 + i * 8 + rnd() * 3), ph: rnd() * TAU, s: 0.9 + rnd() * 0.3 };
      qs.push(q);
      slabs.box("#2a1a3a", 0.2, 5.4, 0.2, side * 14.64, 3.1, q.z);
      deco.box("#2a1a3a", 0.95, 0.14, 0.14, side * 14.26, 5.7, q.z);
      deco.box("#2a1a3a", 0.04, 5.6 - q.y - q.s / 2, 0.04, q.x, (5.6 + q.y + q.s / 2) / 2, q.z);
    }
    return (now, dt) => {
      const cz = cam.position.z;
      qs.forEach((q, i) => pQ.put(i, q.x, q.y, q.z, q.s, q.s, q.s, 0, Math.sin(now * 0.7 + q.ph) * 0.5, Math.sin(now * 1.1 + q.ph) * 0.06));
      pQ.flush();
      floats.forEach((f, i) => {
        const side = f.x > 0 ? 1 : -1;
        const x = side * (4 + ((Math.abs(f.x) - 4 + now * f.v) % 9));
        const y = WATER + 0.12 + Math.sin(now * 1.6 + f.ph) * 0.05;
        pFloatBase.put(i, x, y, -f.s, 0.55, 0.12, 0.55, 0, now * 0.3 + f.ph, 0);
        pFloat.put(i, x, y + 0.22, -f.s, 0.3, 0.32, 0.3, 0, now * 0.3 + f.ph, 0);
      });
      pFloat.flush();
      pFloatBase.flush();
      // (the lanterns near the camera sway; the far ones hang still in the haze)
      for (let i = 0; i < nL; i++) if (Math.abs(-lant[i * 5 + 2] - cz + 20) < 75) swing(i, now);
      pLant.flush();
      pCap.flush();
      ups.forEach((u, i) => {
        const y = 7 + ((u.y + now * u.v) % 60);
        const s = 0.5 + (y > 60 ? (67 - y) / 7 : 1) * 0.35;
        pUp.put(i, u.x + Math.sin(now * 0.3 + u.ph) * 2.5, y, u.z + Math.cos(now * 0.23 + u.ph) * 2, s, s * 1.25, s, 0, u.ph, 0);
      });
      pUp.flush();
      crowd.tick(now, 0.45);
      bulbs.tick(now);
      wtex.offset.set((now * 0.012) % 1, (now * 0.02) % 1);
      streakMat.opacity = 0.34 + Math.sin(now * 2.1) * 0.08;
      boom -= dt;
      if (boom <= 0) {
        boom = 1.4 + dr() * 1.8;
        const c = neon[Math.floor(dr() * neon.length)];
        at.set((dr() < 0.5 ? -1 : 1) * (14 + dr() * 28), 32 + dr() * 18, cz - 55 - dr() * 60);
        fx.burst(at, 34, [c, c, "#ffffff"], { speed: 9, up: 1, gravity: 3, size: 0.55, life: 1.5, drag: 1.2 });
      }
      steam -= dt;
      if (steam <= 0) {
        steam = 0.14;
        // (the next cooking spot near the camera, in turn)
        for (let n = 0; n < steamAt.length; n++) {
          const [x, y, z] = steamAt[si++ % steamAt.length];
          if (Math.abs(z - cz + 22) > 46) continue;
          fx.burst(at.set(x, y, z), 2, ["#ffffff", "#ece4f4"], { speed: 0.4, up: 1.2, gravity: -1.5, size: 0.32, life: 1.4 });
          break;
        }
      }
    };
  },
};
