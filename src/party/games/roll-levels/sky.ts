/**
 * SKY ROAD: the first BIG Z ROLL. A cream and mint sky road high over ZStreet on a sunny
 * afternoon: crates, gaps, walls, low bars, bridges, sliding blocks, swinging balls, conveyor belts.
 * Under it, in layers: balloons and airships at its height, the tall towers' roofs, clouds, and the
 * city's streets far below with their traffic, all sinking into a blue haze.
 */
import * as THREE from "three";
import { rng } from "../../kit";
import { GEO, canvasTex, glow, mixHex, skyDome, toon, toonSteps } from "../../k3";
import { Batch, Boxes, Flock, ballTex, cityMats, crateTex, faceTex, hazTex, panes, slabTex, type Level, type SceneKit } from "./kit";

/** The streets far below, a city block's side (its street included), the haze everything sinks into. */
const GROUND = -150;
const CELL = 44;
const HAZE = "#4f6fc4";

/** A hot-air balloon's envelope: bright gores with a white band. */
const goreTex = () =>
  canvasTex(128, 64, (g) => {
    const cols = ["#ff5fa2", "#ffd23f", "#3ec6ff", "#8ee35b"];
    for (let i = 0; i < 8; i++) {
      g.fillStyle = i % 2 ? "#ffffff" : cols[(i >> 1) % cols.length];
      g.fillRect(i * 16, 0, 16, 64);
    }
    g.fillStyle = "rgba(255,255,255,0.85)";
    g.fillRect(0, 40, 128, 6);
  });
/** An airship's hull: cream, a red belly band, a golden Z on each flank. */
const hullTex = () =>
  canvasTex(256, 128, (g) => {
    g.fillStyle = "#fff4e0";
    g.fillRect(0, 0, 256, 128);
    g.fillStyle = "#ff5a4d";
    g.fillRect(0, 70, 256, 16);
    g.fillStyle = "#3ec6ff";
    g.fillRect(0, 90, 256, 6);
    // (on the flanks, drawn narrow: the hull stretches them back out along its length)
    g.font = "900 44px Geist, Roboto, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillStyle = "#ffb400";
    for (const x of [0, 128, 256]) {
      g.save();
      g.translate(x, 42);
      g.scale(0.3, 1);
      g.fillText("Z", 0, 0);
      g.restore();
    }
  });
/** One city block seen from far above: its lot, a pavement round it, the street's dashes along two sides. */
const blockTex = () =>
  canvasTex(
    128,
    128,
    (g) => {
      g.fillStyle = "#5878c8";
      g.fillRect(0, 0, 128, 128);
      g.fillStyle = "#4262b4";
      g.fillRect(12, 12, 104, 104);
      g.fillStyle = "#3a5aac";
      g.fillRect(18, 18, 92, 92);
      g.fillStyle = "#a9c0f0";
      for (let i = 0; i < 128; i += 16) {
        g.fillRect(i + 4, 0, 8, 2);
        g.fillRect(i + 4, 126, 8, 2);
        g.fillRect(0, i + 4, 2, 8);
        g.fillRect(126, i + 4, 2, 8);
      }
    },
    true,
  );

export const SKY: Level = {
  key: "sky",
  title: "SKY ROAD",
  titleZh: "天空大道",
  tag: "High over ZStreet: crates, gaps, sliding blocks, swinging balls.",
  tagZh: "高悬在 ZStreet 上空：木箱、缺口、滑块和摆锤。",
  song: "hero",
  ambience: "city-day",
  sky: ["#3f9dff", "#ffe3c4"],
  fog: [120, 440],
  hemi: ["#ffffff", "#8f8670", 1.45],
  // (the afternoon sun from the left and a little ahead: every shadow falls across the road, toward the camera)
  sun: ["#fff0d6", 2.0, -46, 50, -12],
  road: {
    slab: ["#d6f8ef", "#b4ecde"],
    tex: (c) => slabTex(c, { line: "#4fc4b0", dash: "#ffffff", seam: "rgba(20,90,90,0.3)" }),
    body: "#5a4fb8",
    girder: "#2f2870",
    kerb: ["#ffffff", "#ff4d5e"],
    plank: ["#d38f4e", "#e6a865"],
    beam: "#7a4a26",
    pylon: ["#3a3380", GROUND],
  },
  props: {
    crate: () => crateTex(),
    wall: ["#8c6cff", "#c3b3ff"],
    bar: () => hazTex(),
    mover: () => faceTex(),
    track: "#3b3566",
    ball: () => ballTex(),
    chain: "#3a3550",
    gantry: ["#4a3b8c", "#ffd23f"],
    belt: ["#2f3350", "#ff9f1c"],
    arch: ["#3ec6ff", "#ff4d8d"],
    flags: ["#ff6b35", "#3ec6ff", "#8ee35b", "#ff5fa2", "#ffd23f", "#a98bff"],
    lamp: "#fff1b8",
    post: "#2f2870",
    dust: ["#ffffff", "#d2f7ee", "#a6e8d8"],
    bits: [
      ["#e89a4f", "#9c5a22"],
      ["#8c6cff", "#c3b3ff"],
      ["#ffd23f", "#1d1b2b"],
      ["#6a63e0", "#8f89ff", "#ffffff"],
    ],
  },
  deep: -40,
  layout(c, r) {
    // easy: one of each
    c.crates(2);
    c.gap(2.2);
    c.plain(4);
    c.walls(2, 9);
    c.boosts();
    c.bar();
    c.plain(3);
    // medium, in any order
    c.some([() => c.bridge(r() < 0.5 ? "twin" : "one"), () => c.belt(), () => c.swing(1), () => c.holes(2), () => c.pushers(2, 1.5), () => c.crates(3), () => c.gap(2.7)], 6, 3);
    // hard: back to back
    c.some([() => c.gapCrates(), () => c.bridge("zig"), () => c.bridgeSwing(), () => c.walls(3, 7.5), () => c.pushers(3, 2.1), () => c.doubleGap(), () => c.barGap(), () => c.holes(3)], 6, 1.5);
  },
  scenery(k: SceneKit) {
    const s = k.scene;
    const rnd = rng(0x5ca1);
    const fin = k.fin;
    // the sky all round: an afternoon's blue down to a peach haze, painted clouds, the sun where the light comes from
    skyDome(s, { sky: SKY.sky, clouds: 18, cloudShade: "#e9cfd0", disc: { az: 345, el: 46, size: 8 }, haze: 0.45, ground: mixHex("#ffe3c4", HAZE, 0.55), rnd });
    // the city's ground far below: blocks and streets, as far as the haze
    const z0 = 440,
      z1 = -(fin + 520);
    const gtex = blockTex();
    gtex.repeat.set(1320 / CELL, Math.round((z0 - z1) / CELL));
    const ground = new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ map: gtex }));
    ground.rotation.x = -Math.PI / 2;
    ground.scale.set(1320, Math.round((z0 - z1) / CELL) * CELL, 1);
    ground.position.set(0, GROUND, z0 - ground.scale.y / 2);
    ground.userData.noShadow = true;
    s.add(ground);
    // the towers, one to a block: low ones under the road, tall ones beside it, a few giants far out
    // (their walls sink into the haze toward the street; a set-back storey on most tops)
    const city = new Boxes(12, 14);
    const pal = ["#f0c9a0", "#9fb8e8", "#f4a98a", "#8fa4d8", "#c4a8f0", "#f2d7a8", "#ff9fb8", "#7fc8c0"];
    // (the roofs the camera looks down on get dressed: gardens, helipads, masts with a blinking light)
    const gardens = new Batch(s, GEO.box, toon("#6fd36a"), 80).far();
    const trees = new Batch(s, GEO.ball, toon("#3fae5a"), 240).far();
    const pads = new Batch(s, GEO.cyl, toon("#3a3550"), 80).far();
    const padH = new Batch(s, GEO.box, glow("#ffd23f"), 160).far();
    const masts = new Batch(s, GEO.box, toon("#e8e8f0"), 80).far();
    const blinks: number[] = [];
    let n = 0;
    const j0 = Math.ceil(-z0 / CELL),
      j1 = Math.floor(-z1 / CELL);
    for (let j = j0; j < j1; j++)
      for (let i = -15; i < 15; i++) {
        const cx = (i + 0.5) * CELL,
          cz = -(j + 0.5) * CELL;
        const ax = Math.abs(cx);
        // (fewer far out, where the haze has them anyway)
        if (rnd() > (ax < 100 ? 0.82 : ax < 240 ? 0.6 : 0.42)) continue;
        const w = 12 + 3 * Math.floor(rnd() * 5),
          d = 12 + 3 * Math.floor(rnd() * 5);
        const x = cx + (rnd() - 0.5) * (CELL - 10 - w),
          z = cz + (rnd() - 0.5) * (CELL - 10 - d);
        const top = ax < 30 ? (rnd() < 0.3 ? -72 + rnd() * 22 : -104 + rnd() * 26) : ax < 100 ? (rnd() < 0.45 ? -30 + rnd() * 24 : -96 + rnd() * 50) : ax < 200 ? -90 + rnd() * rnd() * 110 : -100 + rnd() * rnd() * 190;
        const c = pal[n++ % pal.length];
        city.add(x, z, GROUND, top, w, d, c, mixHex(c, HAZE, 0.85), mixHex(c, "#5a66a6", 0.34), Math.floor(rnd() * 4) / 4);
        const kind = n % 4;
        if (kind === 3) {
          const h = 3 + rnd() * 5;
          city.add(x + (rnd() - 0.5) * 3, z + (rnd() - 0.5) * 3, top, top + h, w - 6, d - 6, mixHex(c, "#ffffff", 0.12), c, mixHex(c, "#5a66a6", 0.2));
        } else if (top > -72 && ax < 110) {
          if (kind === 0) {
            gardens.put(x, top + 0.15, z, w - 2, 0.3, d - 2);
            for (let t = 0; t < 3; t++) trees.put(x + (rnd() - 0.5) * (w - 5), top + 1.3, z + (rnd() - 0.5) * (d - 5), 2.6, 2.4, 2.6, t % 2 ? "#2f8f4a" : "#4fb85c");
          } else if (kind === 1) {
            const r = Math.min(w, d) * 0.7;
            pads.put(x, top + 0.12, z, r, 0.24, r);
            padH.put(x - r * 0.17, top + 0.26, z, 0.5, 0.05, r * 0.5);
            padH.put(x + r * 0.17, top + 0.26, z, 0.5, 0.05, r * 0.5);
            padH.put(x, top + 0.26, z, r * 0.34, 0.05, 0.5);
          } else {
            const mh = 4 + rnd() * 6;
            masts.put(x + w * 0.25, top + mh / 2, z, 0.3, mh, 0.3);
            if (blinks.length < 240) blinks.push(x + w * 0.25, top + mh + 0.2, z);
          }
        }
      }
    const mats = cityMats(panes(rng(7), { lit: 0.2, off: "#8fa9d2" }));
    city.build(s, mats.wall, mats.roof);
    for (const b of [gardens, trees, pads, padH, masts]) b.done();
    const blinkB = new Batch(s, GEO.box, glow("#ff3d5a"), blinks.length / 3).far();
    for (let i = 0; i < blinks.length; i += 3) blinkB.put(blinks[i], blinks[i + 1], blinks[i + 2], 0.6, 0.6, 0.6);
    blinkB.done();
    // the traffic on the avenues far below (unlit dots that crawl along the streets, each its own way)
    const NCAR = 150;
    const cars = new Batch(s, GEO.box, new THREE.MeshBasicMaterial({ color: "#ffffff" }), NCAR).far();
    const carC = ["#ffffff", "#ffd23f", "#ff5a4d", "#3ec6ff", "#fff4c4", "#ff9f1c"];
    const span = z0 - z1 - 80;
    const car: { x: number; z: number; v: number }[] = [];
    for (let i = 0; i < NCAR; i++) {
      const lane = Math.floor(rnd() * 7) - 3;
      const dir = i % 2 ? 1 : -1;
      car.push({ x: lane * CELL + dir * 1.6, z: rnd() * span, v: dir * (9 + rnd() * 7) });
      cars.put(car[i].x, GROUND + 0.9, 0, 2.6, 1.8, 5.6, carC[i % carC.length]);
    }
    cars.done();
    // puffy clouds under the road (the gaps show them) and beside it; they drift
    const drift = new THREE.Group();
    s.add(drift);
    const cl = new Batch(drift, GEO.box, toon("#ffffff", "#2a2f55"), 200).far();
    for (let i = 0; i < 64; i++) {
      const side = i % 2 ? 1 : -1;
      const high = i < 10;
      const x = high ? side * (60 + rnd() * 90) : side * (22 + rnd() * 110);
      const y = high ? 24 + rnd() * 26 : -64 + rnd() * 28;
      const z = 120 - rnd() * (fin + 300);
      const parts = 2 + Math.floor(rnd() * 2);
      for (let j = 0; j < parts; j++) cl.put(x + (j - parts / 2) * 5 + rnd() * 2, y + rnd() * 2, z + rnd() * 4, 6 + rnd() * 6, 2.5 + rnd() * 2, 5 + rnd() * 5);
    }
    cl.done();
    // hot-air balloons drifting beside the road, their baskets and burner glows
    const NB = 9;
    const env = new Batch(s, GEO.ball, new THREE.MeshToonMaterial({ map: goreTex(), gradientMap: toonSteps() }), NB).far();
    const bask = new Batch(s, GEO.box, toon("#9c5a22"), NB).far();
    const fire = new Batch(s, GEO.box, glow("#ffb347"), NB).far();
    const balloons: { x: number; y: number; s: number; ph: number; r: number }[] = [];
    for (let i = 0; i < NB; i++) balloons.push({ x: (i % 2 ? 1 : -1) * (15 + rnd() * 20), y: -4 + rnd() * 12, s: 30 + (i / NB) * fin + rnd() * 20, ph: rnd() * 6, r: 2.2 + rnd() * 1.2 });
    const putB = (t: number, first: boolean) => {
      for (let j = 0; j < NB; j++) {
        const b = balloons[j];
        const i = first ? -1 : j;
        const y = b.y + Math.sin(t * 0.4 + b.ph) * 1.2;
        const x = b.x + Math.sin(t * 0.13 + b.ph) * 1.5;
        env.put(x, y, -b.s, b.r * 2, b.r * 2.3, b.r * 2, undefined, t * 0.15 + b.ph, false, i);
        bask.put(x, y - b.r * 1.45, -b.s, 0.8, 0.6, 0.8, undefined, 0, false, i);
        const f = 0.25 + Math.max(0, Math.sin(t * 3 + b.ph * 3)) * 0.25;
        fire.put(x, y - b.r * 1.05, -b.s, f, f * 1.6, f, undefined, 0, false, i);
      }
    };
    putB(0, true);
    env.done();
    bask.done();
    fire.done();
    // airships cruising along the road, below its level (never over it): a hull, a gondola, tail fins
    const NA = 4;
    const hull = new Batch(s, GEO.ball, new THREE.MeshToonMaterial({ map: hullTex(), gradientMap: toonSteps() }), NA).far();
    const gond = new Batch(s, GEO.box, toon("#3a3380"), NA).far();
    const fins = new Batch(s, GEO.box, toon("#ff5a4d"), NA * 2).far();
    const ships: { x: number; y: number; z: number; v: number; ph: number }[] = [];
    const lane = fin + 360;
    for (let i = 0; i < NA; i++) ships.push({ x: (i % 2 ? -1 : 1) * (40 + rnd() * 16), y: -24 - rnd() * 10, z: (i / NA) * lane + rnd() * 30, v: 3.2 + rnd() * 1.2, ph: rnd() * 6 });
    const putA = (t: number, first: boolean) => {
      for (let j = 0; j < NA; j++) {
        const a = ships[j];
        const i = first ? -1 : j;
        const z = 140 - ((a.z + t * a.v) % lane);
        const y = a.y + Math.sin(t * 0.5 + a.ph) * 0.8;
        hull.put(a.x, y, z, 6, 6, 21, undefined, 0, false, i);
        gond.put(a.x, y - 3.4, z - 1, 1.7, 1.3, 6, undefined, 0, false, i);
        fins.put(a.x, y, z + 8.8, 0.35, 7.4, 3.8, undefined, 0, false, first ? -1 : j * 2);
        fins.put(a.x, y, z + 8.8, 7.4, 0.35, 3.8, undefined, 0, false, first ? -1 : j * 2 + 1);
      }
    };
    putA(0, true);
    hull.done();
    gond.done();
    fins.done();
    const birds = new Flock(s, 9, "#3a3560", 46, 22, rnd);
    return {
      tick(_dt, t, at) {
        drift.position.x = Math.sin(t * 0.045) * 26;
        blinkB.mesh.visible = Math.sin(t * 4) > -0.2;
        putB(t, false);
        putA(t, false);
        for (let i = 0; i < NCAR; i++) {
          const c = car[i];
          const z = (((c.z + t * c.v) % span) + span) % span;
          cars.put(c.x, GROUND + 0.9, z0 - 40 - z, 2.6, 1.8, 5.6, undefined, 0, false, i);
        }
        birds.tick(t, at);
      },
    };
  },
};
