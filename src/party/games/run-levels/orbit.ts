/**
 * LOW ORBIT: CONSENSUS RUN high above the Earth, on a relay of satellite platforms. Its twist is LOW
 * GRAVITY: jumps go high and float far (the gaps between the asteroid islands are twice the city's),
 * and every knock flings you a long way. And METEORS: a red ring glows where one is about to strike,
 * filling up as it comes; be out of it when it lands. Then the SOLAR SWEEP (two spinning panel arms),
 * the DOCKING RINGS (modules gliding to and fro over the void), the DEBRIS FIELD (panels that crumble
 * under you) and the RELAY CLIMB (islands rising to the dish at the top).
 */
import * as THREE from "three";
import { rng } from "../../kit";
import { GEO, canvasTex, glow, label, qTex, skyDome, toonSteps } from "../../k3";
import { Bake, Blinkers, Pieces, TAU, cel, far, lit, sunAt, type Level } from "./kit";

const FIN = 192;

/** A value noise that wraps round the globe (`fx` × `fy` knots), smooth between them. */
function field(rnd: () => number, fx: number, fy: number) {
  const g: number[] = [];
  for (let i = 0; i < fx * fy; i++) g.push(rnd());
  const at = (x: number, y: number) => g[(((x % fx) + fx) % fx) + Math.max(0, Math.min(fy - 1, y)) * fx];
  return (u: number, v: number) => {
    const x = u * fx,
      y = v * (fy - 1);
    const x0 = Math.floor(x),
      y0 = Math.floor(y);
    const tx = x - x0,
      ty = y - y0;
    const sx = tx * tx * (3 - 2 * tx),
      sy = ty * ty * (3 - 2 * ty);
    const a = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * sx;
    const b = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * sx;
    return a + (b - a) * sy;
  };
}
/** The Earth from orbit, in the city's own voxels: deep seas and pale coasts, green and tan land, ice at the poles, weather over it. */
function earthTex(rnd: () => number) {
  const CW = 192,
    CH = 96,
    PX = 4;
  const n1 = field(rnd, 7, 5),
    n2 = field(rnd, 15, 9),
    n3 = field(rnd, 34, 18),
    w1 = field(rnd, 9, 7),
    w2 = field(rnd, 26, 14);
  const tex = canvasTex(CW * PX, CH * PX, (g) => {
    for (let y = 0; y < CH; y++)
      for (let x = 0; x < CW; x++) {
        const u = x / CW,
          v = y / CH;
        const lat = Math.abs(v - 0.5) * 2;
        const fine = n3(u, v);
        const h = n1(u, v) * 0.5 + n2(u, v) * 0.32 + fine * 0.18 - lat * lat * 0.06;
        let c: string;
        if (lat > 0.9 - fine * 0.1) c = "#f2f8ff";
        else if (h < 0.44) c = "#1a52b4";
        else if (h < 0.49) c = "#2468cc";
        else if (h < 0.515) c = "#4f9ae8";
        else if (h < 0.535) c = "#dcc98c";
        else if (h < 0.6) c = lat < 0.3 && n2(u, v) > 0.56 ? "#cdae70" : "#66bb5c";
        else if (h < 0.67) c = "#3f9a52";
        else c = "#a8947a";
        g.fillStyle = c;
        g.fillRect(x * PX, y * PX, PX, PX);
      }
    // the weather: bands and swirls of cloud, their edges thinner
    for (let y = 0; y < CH; y++)
      for (let x = 0; x < CW; x++) {
        const u = x / CW,
          v = y / CH;
        const w = w1(u, v) * 0.55 + w2(u, v) * 0.45;
        if (w < 0.585) continue;
        g.fillStyle = w > 0.64 ? "rgba(255,255,255,0.94)" : "rgba(255,255,255,0.5)";
        g.fillRect(x * PX, y * PX, PX, PX);
      }
  });
  tex.magFilter = THREE.NearestFilter;
  return tex;
}
/** The Moon: grey, its seas and craters in squares. */
function moonTex(rnd: () => number) {
  const tex = canvasTex(128, 64, (g) => {
    g.fillStyle = "#c6ccda";
    g.fillRect(0, 0, 128, 64);
    for (let i = 0; i < 46; i++) {
      const s = 2 + Math.floor(rnd() * 4) * 2;
      g.fillStyle = i % 3 ? "#a7aec0" : "#dfe4ee";
      g.fillRect(Math.floor(rnd() * 64) * 2, 6 + Math.floor(rnd() * 26) * 2, s, s);
    }
  });
  tex.magFilter = THREE.NearestFilter;
  return tex;
}
/** A solar panel's cells: dark blue squares on a silver grid. */
function cellTex() {
  return canvasTex(
    64,
    64,
    (g) => {
      g.fillStyle = "#c9d2e8";
      g.fillRect(0, 0, 64, 64);
      g.fillStyle = "#1e3a8a";
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) g.fillRect(x * 16 + 1, y * 16 + 1, 14, 14);
      g.fillStyle = "#3f64c8";
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) g.fillRect(x * 16 + 2, y * 16 + 2, 6, 3);
    },
    true,
  );
}

export const ORBIT: Level = {
  key: "orbit",
  title: "LOW ORBIT",
  titleZh: "近地轨道",
  tag: "Low gravity: float over wide gaps; get out of the red rings before the meteors hit",
  tagZh: "低重力：飘过宽缝；陨石落下前离开红圈",
  song: "lattice",
  ambience: "space",
  look: {
    sky: ["#02030d", "#070b26"],
    fog: [0, 0],
    hemi: ["#d0dcff", "#27407a", 1.6],
    sun: ["#fff6e8", 2.6],
    post: "#2a3050",
    gate: ["#ffffff", "#ff6b35"],
    slabTh: 0.9,
    thrusters: true,
    lips: true,
    movers: ["#e8ecf8", "#ffd23f", "#7ad8ff"],
    jet: "#7ad8ff",
  },
  grav: 13,
  jumpV: 8.6,
  secs: [
    { s: -8, en: "LAUNCH PAD", zh: "发射台", sh: "LAUNCH", shZh: "发射", c: "#7ad8ff" },
    { s: 9, en: "ASTEROID HOPS", zh: "小行星跳跃", sh: "HOPS", shZh: "跳跃", c: "#ffb02e" },
    { s: 68, en: "SOLAR SWEEP", zh: "太阳翼横扫", sh: "SOLAR", shZh: "太阳翼", c: "#3ec6ff" },
    { s: 99, en: "DOCKING RINGS", zh: "对接环", sh: "DOCKING", shZh: "对接", c: "#c4b1fc" },
    { s: 132, en: "DEBRIS FIELD", zh: "碎片带", sh: "DEBRIS", shZh: "碎片", c: "#ff6b35" },
    { s: 154, en: "RELAY CLIMB", zh: "中继攀升", sh: "CLIMB", shZh: "攀升", c: "#8ee35b" },
  ],
  pal: [
    ["#c6d0e6", "#dfe6f5", "#5a6a90"],
    ["#c9a27a", "#e0c4a0", "#6a4a32"],
    ["#4a7fd6", "#7ab0ff", "#1c3a7a"],
    ["#e3e7f2", "#c4cbe0", "#4a5274"],
    ["#a89a8a", "#c9bcac", "#4a4038"],
    ["#86df55", "#c0f09c", "#2e6a1a"],
  ],
  slabs: [
    [-6, 6, -8, 8, 0, 0, 0],
    [-4, 4, 13, 20, 0, 0, 1],
    [-1.5, 5.5, 25.5, 31.5, 0.8, 0.8, 1],
    [-6, 1, 37, 43, 1.6, 1.6, 1],
    [-2, 5, 48.5, 54.5, 2.4, 2.4, 1],
    [-4.5, 2.5, 60.5, 67, 1.2, 1.2, 1],
    [-8, 8, 72, 98, 0, 0, 2],
    [-5, 5, 127, 132, 0, 0, 3],
    [-5, 5, 154.6, 161, 0, 0, 5],
    [-3, 3, 165, 169, 1.6, 1.6, 5],
    [-4, 2, 173, 177, 3.2, 3.2, 5],
    [-2, 4, 181, 185, 4.8, 4.8, 5],
    [-7, 7, 189, 201, 6.2, 6.2, 5],
  ],
  cps: [
    { s: 0, y: 0, x0: -4, x1: 4 },
    { s: 26.5, y: 0.8, x0: -0.5, x1: 4.5 },
    { s: 49.5, y: 2.4, x0: -0.5, x1: 3.5 },
    { s: 73, y: 0, x0: -4, x1: 4 },
    { s: 93.5, y: 0, x0: -4, x1: 4 },
    { s: 128, y: 0, x0: -3.5, x1: 3.5 },
    { s: 155.6, y: 0, x0: -3.5, x1: 3.5 },
  ],
  fin: { s: FIN, y: 6.2, x0: -7, x1: 7 },
  gateW: 12.4,
  zones: [
    { k: "go", s1: 8, w: 2, lim: 4 },
    { k: "hops", s1: 68 },
    { k: "sweep", s1: 98.5, w: 3.6 },
    { k: "blocks", s1: 132 },
    { k: "blocks", s1: 154.6 },
    { k: "hops", s1: 1e9 },
  ],
  arches: [
    [-7.8, -6, 6, 0, "LAUNCH PAD", "发射台", "#2f6fd6"],
    [9.5, -4, 4, 0, "LOW GRAVITY · MIND THE RINGS", "低重力 · 小心红圈", "#d65a14", 0.8],
    [72.5, -8, 8, 0, "SOLAR SWEEP", "太阳翼横扫", "#1f8fd6"],
    [97.6, -8, 8, 0, "DOCKING RINGS", "对接环", "#6a52d6"],
    [132, -5, 5, 0, "DEBRIS FIELD", "碎片带", "#e04a14"],
    [155, -5, 5, 0, "RELAY CLIMB", "中继攀升", "#3d9a1c"],
    [FIN, -7, 7, 6.2, "FINALITY!", "最终确认！", "#ff6b35", 1.5, 7.2],
  ],
  sweeps: [
    { cx: 0, cs: 78.5, R: 6.4, n: 2, w: 0.95 },
    { cx: 0, cs: 91.5, R: 6.4, n: 2, w: -0.85 },
  ],
  lanes: [
    { s0: 103, s1: 106.5, per: 3.6, ph: 0, cs: [-4, 4], amp: 3.0, hw: 1.9 },
    { s0: 111, s1: 114.5, per: 3.1, ph: Math.PI / 2, cs: [-4, 4], amp: 3.0, hw: 1.9 },
    { s0: 119, s1: 122.5, per: 4.0, ph: Math.PI, cs: [-4, 4], amp: 3.0, hw: 1.9 },
  ],
  tiles: { rows: [136, 141, 146, 151], cols: [-4.3, 0, 4.3], size: 3.7, colors: ["#b9b0a4", "#8f8578"] },
  meteors: [
    { s0: 10, s1: 67, x0: -6, x1: 5.5, every: [1.3, 2.1], warn: 1.6, R: 1.7 },
    { s0: 127, s1: 161, x0: -6, x1: 6, every: [1.3, 2.1], warn: 1.5, R: 1.7 },
    { s0: 163, s1: 189, x0: -4, x1: 4, every: [1.8, 2.7], warn: 1.6, R: 1.6 },
  ],

  scenery(k) {
    const { scene: sc, rnd, ink, slabs, deco, lights, fx, world } = k;
    // (the scenery's own stream. The game's `rnd` is only drawn from where it always was, and as often:
    // the race that follows depends on how many numbers the scenery took)
    const dr = rng(0x0b17a);
    const DISH = new THREE.SphereGeometry(1, 24, 12, 0, TAU, 0, Math.PI / 2.6);
    // the sun low on the right, a little ahead (where the sky shows it): long shadows across the decks
    sunAt(world, 214, 37);
    sc.userData.shadowK = 1.1;
    skyDome(sc, { sky: ["#02030d", "#070b26"], ground: "#02030d", stars: 1400, band: true, disc: { az: 214, el: 37, color: "#fff6d8", size: 5, glow: 8 }, haze: 0, rnd: dr });
    // (the stars were boxes of the game's stream: the sky dome paints them now)
    for (let i = 0; i < 260; i++) (rnd(), rnd(), rnd(), rnd());

    // the Earth far below in the city's own voxels, its blue haze
    const earthGeo = new THREE.SphereGeometry(1, 64, 40);
    const earth = far(new THREE.Mesh(earthGeo, new THREE.MeshToonMaterial({ map: earthTex(dr), gradientMap: toonSteps(), emissive: 0x06122a })));
    earth.scale.setScalar(300);
    earth.position.set(40, -372, -140);
    earth.rotation.set(0.3, 0, 0.2);
    sc.add(earth);
    for (const [r, op] of [
      [306, 0.34],
      [322, 0.16],
    ]) {
      const haze = far(new THREE.Mesh(earthGeo, new THREE.MeshBasicMaterial({ color: "#5aa8ff", transparent: true, opacity: op, side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false })));
      haze.scale.setScalar(r);
      haze.position.copy(earth.position);
      sc.add(haze);
    }
    // the Moon, small and far
    const moon = far(new THREE.Mesh(earthGeo, new THREE.MeshToonMaterial({ map: moonTex(dr), gradientMap: toonSteps(), emissive: 0x15171f })));
    moon.scale.setScalar(24);
    moon.position.set(-190, 150, -430);
    sc.add(moon);

    // the station far off: a wheel turning round its hub, its solar arrays, its lights
    const cells = cel({ map: cellTex() });
    (cells.map as THREE.Texture).repeat.set(6, 2);
    const steel = cel({ color: "#e6ebf7" });
    const truss = cel({ color: "#9aa6c4" });
    const station = new THREE.Group();
    station.position.set(-150, 60, -230);
    station.rotation.set(1.1, 0.4, 0);
    sc.add(station);
    const wheel = new THREE.Group();
    station.add(wheel);
    wheel.add(far(new THREE.Mesh(new THREE.TorusGeometry(46, 3.2, 8, 56), steel)));
    for (let i = 0; i < 4; i++) {
      const sp = far(new THREE.Mesh(GEO.box, truss));
      sp.scale.set(92, 1.6, 1.6);
      sp.rotation.z = (i / 4) * Math.PI;
      wheel.add(sp);
    }
    const winMat = lit(1);
    winMat.color.set("#ffe9a8");
    for (let i = 0; i < 12; i++) {
      const w = far(new THREE.Mesh(GEO.box, winMat));
      const a = (i / 12) * TAU;
      w.scale.set(3, 1.2, 6.6);
      w.position.set(Math.cos(a) * 46, Math.sin(a) * 46, 0);
      w.rotation.z = a + Math.PI / 2;
      wheel.add(w);
    }
    const hubM = far(new THREE.Mesh(GEO.cyl, steel));
    hubM.scale.set(13, 30, 13);
    hubM.rotation.x = Math.PI / 2;
    station.add(hubM);
    const mast = far(new THREE.Mesh(GEO.box, truss));
    mast.scale.set(1.6, 1.6, 96);
    station.add(mast);
    for (const e of [-1, 1]) {
      const arr = far(new THREE.Mesh(GEO.box, cells));
      arr.scale.set(44, 0.5, 15);
      arr.position.z = e * 42;
      station.add(arr);
    }
    const stBlink = far(new THREE.Mesh(GEO.box, glow("#ff5a6e")));
    stBlink.scale.setScalar(3.2);
    stBlink.position.z = 50;
    station.add(stBlink);

    // relay satellites in the mid distance, turning slowly, their beacons blinking
    const sats: { g: THREE.Group; b: THREE.Mesh; w: number }[] = [];
    for (const [x, y, z, s, w] of [
      [62, 24, -96, 1.5, 0.12],
      [-70, -8, -168, 1.9, -0.09],
      [48, 34, -236, 1.3, 0.1],
    ]) {
      const g = new THREE.Group();
      g.position.set(x, y, z);
      g.scale.setScalar(s);
      g.rotation.set(0.5, x * 0.1, 0.3);
      const body = far(new THREE.Mesh(GEO.box, steel));
      body.scale.set(2.2, 2.2, 3.4);
      const band = far(new THREE.Mesh(GEO.box, cel({ color: "#ff6b35" })));
      band.scale.set(2.3, 2.3, 0.7);
      g.add(body, band);
      for (const sx of [-1, 1]) {
        const p = far(new THREE.Mesh(GEO.box, cells));
        p.scale.set(7, 0.15, 2.4);
        p.position.x = sx * 4.9;
        g.add(p);
        const arm = far(new THREE.Mesh(GEO.box, truss));
        arm.scale.set(1.4, 0.2, 0.2);
        arm.position.x = sx * 1.7;
        g.add(arm);
      }
      const dish = far(new THREE.Mesh(DISH, cel({ color: "#f2f5ff", side: THREE.DoubleSide })));
      dish.scale.set(1.5, 0.8, 1.5);
      dish.position.set(0, 1.5, 0.8);
      dish.rotation.x = Math.PI;
      g.add(dish);
      const b = far(new THREE.Mesh(GEO.box, glow("#ff5a6e")));
      b.scale.setScalar(0.5);
      b.position.set(0, 1.4, -1.3);
      g.add(b);
      sc.add(g);
      sats.push({ g, b, w });
    }

    // solar wings beside the SOLAR SWEEP, trusses under the islands
    for (const side of [-1, 1])
      for (const s of [78, 91]) {
        const wing = new THREE.Mesh(GEO.box, cells);
        wing.scale.set(10, 0.2, 7);
        wing.position.set(side * 15.5, -1.2, -s);
        wing.rotation.z = side * 0.25;
        sc.add(wing);
        slabs.box("#9aa6c4", 7.5, 0.4, 0.4, side * 9.8, -0.9, -s);
      }
    const L2 = ORBIT.slabs;
    // the asteroid islands: rough rock under their decks (never through them: the deck is what you stand on)
    const rock = new Bake();
    const eul = new THREE.Euler();
    const rot = new THREE.Matrix4();
    for (const [x0, x1, s0, s1, y0, , sec] of L2) {
      if (sec !== 1) continue;
      const w = x1 - x0,
        d = s1 - s0;
      for (let j = 0; j < 7; j++) {
        const sz = 1.6 + rnd() * 2.2;
        const sx = sz * (w / 5),
          sy = sz * 0.9,
          sd = sz * (d / 6);
        const x = x0 + w * (0.2 + rnd() * 0.6);
        let y = y0 - 1.0 - rnd() * 1.8;
        const z = -(s0 + d * (0.15 + rnd() * 0.7));
        const rx = rnd() * 0.8,
          ry = rnd() * 3,
          rz = rnd() * 0.8;
        // (its highest corner stays under the deck's top)
        const e = rot.makeRotationFromEuler(eul.set(rx, ry, rz)).elements;
        const up = (Math.abs(e[1]) * sx + Math.abs(e[5]) * sy + Math.abs(e[9]) * sd) / 2;
        y = Math.min(y, y0 - 0.35 - up);
        rock.box(["#8a7a6a", "#a08c78", "#6f6458", "#97806a"][j % 4], sx, sy, sd, x, y, z, rx, ry, rz);
      }
    }
    rock.build(sc, GEO.box, cel(), 0.05, ink);
    // the lights at the decks' corners: red to port, green to starboard, blinking in turn
    const beacons = new Blinkers();
    L2.forEach(([x0, x1, s0, s1, y0], i) => {
      const cx = (x0 + x1) / 2,
        cs = (s0 + s1) / 2;
      deco.box("#7a86a8", 0.3, 3.2, 0.3, cx - 1, y0 - 2.4, -cs);
      deco.box("#7a86a8", 0.3, 3.2, 0.3, cx + 1, y0 - 2.4, -cs);
      deco.box("#3a4466", 0.16, 0.5, 0.16, x0, y0 + 0.1, -s0);
      deco.box("#3a4466", 0.16, 0.5, 0.16, x1, y0 + 0.1, -s0);
      beacons.add(x0, y0 + 0.45, -s0, 0.3, "#ff5a6e", 1.8, i * 0.13, 0.5);
      beacons.add(x1, y0 + 0.45, -s0, 0.3, "#8ee35b", 1.8, i * 0.13 + 0.5, 0.5);
    });

    // the relay at the finish: a big dish on its mast over the platform's end, a module behind it
    const dish = new THREE.Mesh(DISH, cel({ color: "#f2f5ff", side: THREE.DoubleSide }));
    dish.scale.set(5, 2.4, 5);
    dish.position.set(9.5, 12, -(FIN + 6));
    dish.rotation.set(-2.3, 0, 0.5);
    sc.add(dish);
    slabs.box("#9aa6c4", 0.6, 7, 0.6, 9.5, 8.5, -(FIN + 6));
    beacons.add(9.5, 12.4, -(FIN + 6), 0.5, "#ff5a6e", 1.1, 0, 0.5);
    const big = far(new THREE.Mesh(DISH, cel({ color: "#e6ebf7", side: THREE.DoubleSide })));
    big.scale.set(11, 5, 11);
    big.position.set(-3, 21, -(FIN + 22));
    big.rotation.set(-2.05, 0, -0.25);
    sc.add(big);
    const hubB = new Bake();
    hubB.box("#9aa6c4", 1.2, 16, 1.2, -3, 12, -(FIN + 22));
    hubB.box("#dfe6f5", 9, 4.4, 6, -3, 3.4, -(FIN + 22));
    hubB.box("#ff6b35", 9.2, 0.8, 6.2, -3, 4.6, -(FIN + 22));
    hubB.box("#9aa6c4", 22, 0.4, 0.4, -3, 2.6, -(FIN + 22));
    far(hubB.build(sc, GEO.box, cel(), 0.06, ink));
    for (const sx of [-1, 1]) {
      const p = far(new THREE.Mesh(GEO.box, cells));
      p.scale.set(8, 0.2, 5);
      p.position.set(-3 + sx * 11, 2.6, -(FIN + 22));
      sc.add(p);
    }
    for (let i = 0; i < 4; i++) lights.box("#ffe9a8", 1.1, 0.9, 0.1, -6 + i * 2, 3.2, -(FIN + 18.97));
    beacons.add(-3, 20.3, -(FIN + 22), 0.7, "#ff5a6e", 1.4, 0.3, 0.4);

    // the launch pad behind the start: the rocket that brought them up, its tower, on a deck of its own
    {
      const z = 18;
      const pad = new Bake();
      pad.box("#5a6a90", 13, 1.2, 11, 0, -3.8, z);
      pad.box("#c8463a", 1.5, 17, 1.5, -5.2, 5.7, z + 1);
      for (const y of [1.5, 6, 10.5]) pad.box("#c8463a", 3.4, 0.4, 0.5, -3.1, y, z + 1);
      for (const sx of [-1, 1]) pad.box("#ff6b35", 1.5, 3.0, 0.3, sx * 3.75, -1.3, z, 0, 0, sx * -0.35);
      far(pad.build(sc, GEO.box, cel(), 0.06, ink));
      const tube = new Bake();
      tube.box("#f2f5ff", 3.4, 13, 3.4, 0, 4.3, z);
      tube.box("#ff6b35", 3.5, 1.3, 3.5, 0, 7.6, z);
      tube.box("#2a3050", 3.5, 0.9, 3.5, 0, 1.2, z);
      for (const sx of [-1, 1]) tube.box("#dfe6f5", 1.7, 8, 1.7, sx * 2.5, 1.5, z);
      tube.box("#3a4466", 2.4, 1.4, 2.4, 0, -2.6, z);
      far(tube.build(sc, GEO.cyl, cel(), 0.06, ink));
      const tips = new Bake();
      tips.box("#ff6b35", 3.6, 4.4, 3.6, 0, 13.0, z);
      for (const sx of [-1, 1]) tips.box("#ff6b35", 1.8, 2.2, 1.8, sx * 2.5, 6.6, z);
      far(tips.build(sc, GEO.cone, cel(), 0.06, ink));
      const qMark = label("Z", 2.2, "#ff6b35", "");
      qMark.position.set(0, 4.4, z - 1.72);
      qMark.rotation.y = Math.PI;
      sc.add(qMark);
      for (const sx of [-4.5, 4.5]) {
        deco.box("#54486e", 1.2, 0.8, 1.2, sx, -4.7, z);
        lights.box("#7ad8ff", 0.8, 0.5, 0.8, sx, -5.3, z);
      }
      beacons.add(-5.2, 14.5, z + 1, 0.6, "#ff5a6e", 1.2, 0.2, 0.45);
    }
    beacons.build(sc);

    // tumbling rocks round the course; the Z-Block relays far out (big, and far: nothing to pick up); grit drifting by
    const rocks: { x: number; y: number; z: number; ph: number; s: number; w: number }[] = [];
    const pRock = far(new Pieces(sc, GEO.box, cel(), 22, 0.05, ink));
    for (let i = 0; i < 22; i++) {
      const side = i % 2 ? 1 : -1;
      rocks.push({ x: side * (15 + rnd() * 30), y: -8 + rnd() * 24, z: -(rnd() * 200), ph: rnd() * TAU, s: 1 + rnd() * 3.5, w: 0.2 + rnd() * 0.5 });
      pRock.tint(i, ["#8a7a6a", "#a08c78", "#6f6458"][i % 3]);
    }
    const qs: typeof rocks = [];
    const pQ = far(new Pieces(sc, GEO.box, cel({ map: qTex(), emissive: 0x3a2600 }), 12, 0.08, ink));
    for (let i = 0; i < 12; i++) {
      const side = i % 2 ? 1 : -1;
      qs.push({ x: side * (30 + rnd() * 14), y: -6 + rnd() * 20, z: -(i * 18 + rnd() * 6), ph: rnd() * TAU, s: 2.6 + rnd() * 1.2, w: 0.12 + rnd() * 0.12 });
    }
    const parcels: typeof rocks = [];
    const pParcel = far(new Pieces(sc, GEO.box, cel(), 18));
    for (let i = 0; i < 18; i++) {
      const side = rnd() < 0.5 ? 1 : -1;
      parcels.push({ x: side * (12 + rnd() * 14), y: -6 + rnd() * 16, z: -(rnd() * 190), ph: rnd() * TAU, s: 0.22 + rnd() * 0.3, w: 0.3 + rnd() * 0.6 });
      pParcel.tint(i, rnd() < 0.6 ? "#aab4cc" : "#7f8aa8");
    }
    // a satellite passing far off (its light blinks), shuttles crossing, shooting stars, the islands' jets
    const sat = new THREE.Group();
    const body = far(new THREE.Mesh(GEO.box, steel));
    body.scale.set(2, 2, 3);
    sat.add(body);
    for (const sx of [-1, 1]) {
      const p = far(new THREE.Mesh(GEO.box, cells));
      p.scale.set(7, 0.15, 2.2);
      p.position.x = sx * 4.6;
      sat.add(p);
    }
    const blink = far(new THREE.Mesh(GEO.box, glow("#ff5a6e")));
    blink.scale.setScalar(0.6);
    blink.position.y = 1.4;
    sat.add(blink);
    sc.add(sat);
    const ships: { y: number; z: number; v: number; ph: number }[] = [];
    for (let i = 0; i < 4; i++) ships.push({ y: 18 + dr() * 50, z: -40 - dr() * 230, v: (i % 2 ? 1 : -1) * (13 + dr() * 9), ph: dr() * 400 });
    const pShip = far(new Pieces(sc, GEO.box, cel(), ships.length * 2, 0.05, ink));
    const pFlame = far(new Pieces(sc, GEO.box, lit(1), ships.length));
    ships.forEach((_, i) => (pShip.tint(i * 2, "#f2f5ff"), pShip.tint(i * 2 + 1, i % 2 ? "#ff6b35" : "#3ec6ff"), pFlame.tint(i, "#9fe4ff")));
    const pStreak = far(new Pieces(sc, GEO.box, glow("#ffffff", 0.9, true), 3));
    const streaks = [0, 1, 2].map(() => ({ t: -1 - dr() * 3, x: 0, y: 0, z: 0, dx: 0, dy: 0 }));
    const cam = world.camera;
    const at = new THREE.Vector3();
    let jet = 0,
      vent = 0;
    return (now, dt) => {
      sat.position.set(Math.cos(now * 0.05) * 140, 70 + Math.sin(now * 0.05) * 20, -120 + Math.sin(now * 0.05) * 140);
      sat.rotation.set(now * 0.2, now * 0.1, 0);
      const on = Math.floor(now * 2) % 2 === 0;
      blink.visible = stBlink.visible = on;
      for (const s of sats) {
        s.g.rotation.y += dt * s.w;
        s.b.visible = !on;
      }
      earth.rotation.y = 0.3 + now * 0.004;
      wheel.rotation.z = now * 0.05;
      beacons.tick(now);
      ships.forEach((sh, i) => {
        const x = ((((sh.ph + now * sh.v) % 400) + 400) % 400) - 200;
        const d = Math.sign(sh.v);
        pShip.put(i * 2, x, sh.y, sh.z, 5.4, 1.3, 1.8);
        pShip.put(i * 2 + 1, x - d * 1.2, sh.y + 0.2, sh.z, 2.2, 0.3, 5.6);
        const f = 1.6 + Math.sin(now * 31 + i) * 0.5;
        pFlame.put(i, x - d * (2.9 + f / 2), sh.y, sh.z, f, 0.7, 0.9);
      });
      pShip.flush();
      pFlame.flush();
      streaks.forEach((st, i) => {
        st.t += dt;
        if (st.t > 0.9) {
          st.t = -2 - dr() * 4;
          const side = dr() < 0.5 ? -1 : 1;
          st.x = cam.position.x + side * (40 + dr() * 120);
          st.y = 60 + dr() * 90;
          st.z = cam.position.z - 160 - dr() * 120;
          st.dx = -side * (90 + dr() * 60);
          st.dy = -(30 + dr() * 30);
        }
        if (st.t < 0) return pStreak.put(i, 0, -999, 0, 0, 0, 0);
        const a = Math.atan2(st.dy, st.dx);
        pStreak.put(i, st.x + st.dx * st.t, st.y + st.dy * st.t, st.z, 9, 0.35, 0.35, 0, 0, a);
      });
      pStreak.flush();
      // (a puff from the jets under an island near the camera)
      jet -= dt;
      if (jet <= 0) {
        jet = 0.09;
        // (an island with thrusters, near the camera: a few tries)
        for (let n = 0; n < 6; n++) {
          const [x0, x1, s0, s1, y0] = L2[Math.floor(dr() * L2.length)];
          if (s1 - s0 <= 6 || x1 - x0 <= 4 || Math.abs((s0 + s1) / 2 + cam.position.z - 12) > 40) continue;
          const f = dr() < 0.5 ? 0.3 : 0.7;
          fx.burst(at.set((x0 + x1) / 2, y0 - 1.8, -(s0 + (s1 - s0) * f)), 2, ["#7ad8ff", "#ffffff"], { speed: 0.6, up: -2.5, gravity: 2, size: 0.22, life: 0.5 });
          break;
        }
      }
      // (the rocket on the pad vents, while the camera is near the start)
      vent -= dt;
      if (vent <= 0 && cam.position.z > -45) {
        vent = 0.12;
        fx.burst(at.set((dr() - 0.5) * 3, -2.6, 18), 2, ["#ffffff", "#dfe6f5"], { speed: 1.2, up: -0.6, gravity: -0.8, size: 0.4, life: 1.3 });
      }
      rocks.forEach((q, i) => pRock.put(i, q.x, q.y + Math.sin(now * 0.3 + q.ph) * 0.8, q.z, q.s, q.s * 0.8, q.s * 0.9, now * q.w + q.ph, now * q.w * 0.7, q.ph));
      pRock.flush();
      qs.forEach((q, i) => pQ.put(i, q.x, q.y + Math.sin(now * 0.4 + q.ph) * 0.8, q.z, q.s, q.s, q.s, now * q.w * 0.5, now * q.w + q.ph, 0));
      pQ.flush();
      parcels.forEach((q, i) => pParcel.put(i, q.x + Math.sin(now * 0.4 + q.ph) * 1.2, q.y + Math.sin(now * 0.5 + q.ph * 2) * 1.0, q.z, q.s, q.s, q.s, now * q.w + q.ph, now * q.w * 0.6, 0));
      pParcel.flush();
    };
  },
};
