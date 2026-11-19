/**
 * SPROUT ICE ROAD: a winter dusk on the Sprout river, frozen below Sprout Falls. The road runs low over
 * the half-frozen river (a fall ends in a splash), past the ZK Mall's tent, the glass pyramid, City
 * Hall's blue dome and the glass sphere, to the white tower holding a golden Z-Block. Twists: ice sheets
 * and floes (you slide: turn early) and the blizzard gusts (a whistle and blowing snow, then a sideways
 * push for two seconds).
 * Round it, in layers: the dark channel under the road and its pack ice, the shore ice (skaters,
 * sledges, anglers), the snowy embankments and their lamps, the city, the low sun in a pink haze.
 */
import * as THREE from "three";
import { rng } from "../../kit";
import { GEO, canvasTex, glow, mixHex, qBlock, skyDome, toon, toonSteps } from "../../k3";
import { Batch, Boxes, Flock, START, ballTex, cityMats, crateTex, faceTex, hazTex, panes, shuffle, slabTex, softTex, type Level, type SceneKit } from "./kit";

const WATER_Y = -2.6;
/** The shore ice's top, the embankments' inner edge, where the pack ice gives way to the shore ice. */
const ICE_Y = WATER_Y + 0.26;
const BANK = 13;
const SHORE = 8.6;

export const ASTANA: Level = {
  key: "astana",
  title: "SPROUT ICE ROAD",
  titleZh: "Sprout 冰路",
  tag: "Over the frozen Sprout river: ice sheets you slide on, blizzard gusts that blow you sideways.",
  tagZh: "冰封的 Sprout 河上：冰面会打滑，暴风雪阵风把你吹向一边。",
  song: "frost",
  ambience: "wind",
  sky: ["#6a84e6", "#f4d0cc"],
  fog: [100, 400],
  hemi: ["#e6eeff", "#7f86b0", 1.6],
  // (the low sun ahead and to the left: long shadows across the road, toward the camera)
  sun: ["#ffd6bc", 1.6, -30, 44, -42],
  road: {
    slab: ["#d9e3f2", "#c6d3e8"],
    tex: (c) => slabTex(c, { frost: "rgba(255,255,255,0.8)", rnd: rng(31), line: "#7fa8ee", seam: "rgba(30,50,100,0.3)" }),
    body: "#4c5d86",
    girder: "#2f3b5c",
    kerb: ["#ffffff", "#2f8cff"],
    plank: ["#b07a4e", "#c98f5c"],
    beam: "#6a4630",
    pylon: ["#4c5d86", WATER_Y - 0.6],
  },
  props: {
    crate: () => crateTex("#d94b4b", "#f07a6a", "#7a1f2a", "#ffffff"),
    wall: ["#3f6fd8", "#ffffff"],
    bar: () => hazTex("#ffffff", "#2f6bff"),
    mover: () => faceTex("#ff8a1f", "#ffc070", "#a04a00", "#1d1b2b"),
    track: "#5a6a90",
    ball: () => ballTex(),
    chain: "#3a3550",
    gantry: ["#2f3b5c", "#fec50c"],
    belt: ["#2f3350", "#ff9f1c"],
    arch: ["#3ec6ff", "#f4b728"],
    flags: ["#3ec6ff", "#f4b728", "#ffffff", "#3ee08f"],
    lamp: "#dff4ff",
    post: "#2f3b5c",
    dust: ["#ffffff", "#e6f6ff", "#c8ecff"],
    bits: [
      ["#d94b4b", "#ffffff"],
      ["#3f6fd8", "#ffffff"],
      ["#ffffff", "#2f6bff"],
      ["#ff8a1f", "#ffc070", "#ffffff"],
    ],
  },
  waterY: WATER_Y,
  deep: -40,
  gusts: true,
  layout(c, r) {
    // easy: the ice, a gap, the walls, the floes
    c.rink(2);
    c.gap(2.2);
    c.plain(4);
    c.walls(2, 9);
    c.boosts();
    c.floes(2, false);
    c.plain(3);
    // medium
    c.some([() => c.iceSlalom(2), () => c.bridge(r() < 0.5 ? "twin" : "one"), () => c.holes(2), () => c.pushers(2, 1.5), () => c.rink(3), () => c.floes(2), () => c.gap(2.6)], 5, 3);
    // hard: always the long floes, then four more
    const hard = shuffle([() => c.bridge("zig"), () => c.iceSlalom(3), () => c.gapCrates(), () => c.pushers(3, 2.1), () => c.doubleGap(), () => c.barGap(), () => c.rink(3)], r).slice(0, 4);
    hard.splice(1 + Math.floor(r() * 4), 0, () => c.floes(3));
    c.seq(hard, 1.5);
  },
  scenery(k: SceneKit) {
    const s = k.scene;
    const rnd = rng(0xa57a);
    const fin = k.fin;
    const z0 = 300,
      z1 = -(fin + 320);
    const zc = (z0 + z1) / 2,
      zl = z0 - z1;
    const sides = [-1, 1];
    // the dusk sky all round: pink streaks of cloud, the low sun ahead where the light comes from
    skyDome(s, { sky: ASTANA.sky, clouds: 16, cloud: "#ffd2cc", cloudShade: "#c7a6dc", disc: { az: 306, el: 12, color: "#ffe9c8", size: 8, glow: 7 }, haze: 0.5, ground: "#dccfe0", rnd });
    // the river: a dark channel under the road (calm ripples), pack ice either side of it, then the shore ice
    const rip = canvasTex(
      128,
      128,
      (g) => {
        g.fillStyle = "#2b5a88";
        g.fillRect(0, 0, 128, 128);
        g.fillStyle = "#35699a";
        for (let i = 0; i < 10; i++) g.fillRect(Math.floor(rnd() * 100), 6 + i * 12 + Math.floor(rnd() * 5), 14 + Math.floor(rnd() * 14), 3);
      },
      true,
    );
    rip.repeat.set(4, zl / 8);
    const water = new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ map: rip }));
    water.rotation.x = -Math.PI / 2;
    water.scale.set(32, zl, 1);
    water.position.set(0, WATER_Y, zc);
    water.userData.noShadow = true;
    s.add(water);
    const shore = new Batch(s, GEO.box, toon("#9dc0de"), 2);
    for (const side of sides) shore.put(side * (SHORE + BANK + 1) * 0.5, ICE_Y - 0.15, zc, BANK + 1 - SHORE, 0.3, zl);
    shore.done();
    // (the pack ice: big flat plates with a ragged edge on the channel, a crack of dark water between each)
    const plates = new Batch(s, GEO.box, toon("#ffffff"), Math.ceil(zl / 5) * 2 + 8);
    const plateC = ["#a6c8e4", "#98bcdc", "#b0d0ea"];
    for (const side of sides) {
      let z = z0;
      while (z > z1) {
        const len = 5 + rnd() * 6.5;
        const xin = 5.1 + rnd() * 2.1;
        plates.put(side * (xin + SHORE + 0.4) * 0.5, ICE_Y - 0.19, z - len / 2, SHORE + 0.4 - xin, 0.3, len, plateC[Math.floor(rnd() * 3)], (rnd() - 0.5) * 0.06);
        z -= len + 0.16 + rnd() * 0.3;
      }
    }
    plates.done();
    // (loose floes adrift in the channel)
    const crust = new Batch(s, GEO.box, toon("#ffffff"), 150);
    for (let i = 0; i < 150; i++) {
      const w = 0.7 + rnd() * 1.5;
      crust.put((rnd() * 2 - 1) * 4.7, WATER_Y + 0.06, z1 + rnd() * zl, w, 0.18, w * (0.5 + rnd() * 0.8), i % 3 ? "#eaf6ff" : "#cfe6f8", rnd() * 3);
    }
    crust.done();
    // (the shore ice is never blank: wind-blown snow in long patches, hairline cracks)
    const snowP = new Batch(s, GEO.disc, toon("#f2f8ff"), 150);
    for (let i = 0; i < 150; i++) {
      const side = i % 2 ? 1 : -1;
      const l = 2.2 + rnd() * 4.5;
      snowP.put(side * (SHORE + 0.9 + rnd() * (BANK - SHORE - 1.2)), ICE_Y + 0.012, z1 + rnd() * zl, 0.9 + rnd() * 1.5, l, 1, undefined, (rnd() - 0.5) * 0.5, true);
    }
    snowP.done();
    const cracks = new Batch(s, GEO.box, toon("#6f9cc6"), 160);
    for (let i = 0; i < 160; i++) {
      const side = i % 2 ? 1 : -1;
      cracks.put(side * (SHORE + 0.4 + rnd() * (BANK - SHORE - 0.6)), ICE_Y + 0.006, z1 + rnd() * zl, 0.07, 0.012, 1.4 + rnd() * 3, undefined, (rnd() - 0.5) * 2.4);
    }
    cracks.done();
    // the snowy banks (the embankments close by: the river is a wide canal here), their granite edges
    const bank = new Batch(s, GEO.box, toon("#eef4ff", "#2e3a5e"), 2);
    const edge = new Batch(s, GEO.box, toon("#8a90a8"), 2);
    const rail = new Batch(s, GEO.box, toon("#2f3b5c"), 2);
    for (const side of sides) {
      bank.put(side * (BANK + 300), -3.2, zc, 600, 4.4, zl + 400);
      edge.put(side * (BANK + 0.4), -2.0, zc, 1.0, 3.6, zl);
      rail.put(side * (BANK + 0.6), 0.25, zc, 0.15, 0.15, zl);
    }
    bank.done();
    edge.done();
    rail.done();
    // firs in the snow
    const firGeo = new THREE.ConeGeometry(0.5, 1, 7);
    const NF = Math.floor(zl / 4.6);
    const firs = new Batch(s, firGeo, toon("#2f6b56"), NF);
    const caps = new Batch(s, firGeo, toon("#ffffff"), NF);
    const firAt: number[] = [];
    for (let i = 0; i < NF; i++) {
      const side = i % 2 ? 1 : -1;
      const near = i < NF * 0.55;
      const x = side * (BANK + 2.5 + rnd() * (near ? 9 : 44));
      const z = z1 + 40 + rnd() * (zl - 40);
      const h = 3.5 + rnd() * 4;
      const w = h * 0.5;
      firs.put(x, -1 + h / 2, z, w, h, w);
      caps.put(x, -1 + h * 0.78, z, w * 0.5, h * 0.44, w * 0.5);
      if (near && firAt.length < 240) firAt.push(x, z, h);
    }
    firs.done();
    caps.done();
    // the snow on the banks is never flat: drifts, snowmen, a trodden path
    const ND = Math.floor(zl / 6);
    const drifts = new Batch(s, GEO.ball, toon("#f2f7ff", "#2a3456"), ND);
    for (let i = 0; i < ND; i++) {
      const side = i % 2 ? 1 : -1;
      const r = 1 + rnd() * 2.2;
      drifts.put(side * (BANK + 1.5 + rnd() * 20), -1, z1 + rnd() * zl, r * 2.4, r * 0.7, r * 1.6);
    }
    drifts.done();
    const NS = 16;
    const snowmen = new Batch(s, GEO.ball, toon("#ffffff"), NS * 3);
    const noses = new Batch(s, GEO.cone, toon("#ff8a1f"), NS);
    const hats = new Batch(s, GEO.cyl, toon("#2a2a3a"), NS);
    for (let i = 0; i < NS; i++) {
      const side = i % 2 ? 1 : -1;
      const x = side * (BANK + 3 + rnd() * 5),
        z = -rnd() * (fin + 40);
      snowmen.put(x, -1 + 0.6, z, 1.3, 1.2, 1.3);
      snowmen.put(x, -1 + 1.5, z, 0.95, 0.9, 0.95);
      snowmen.put(x, -1 + 2.2, z, 0.65, 0.65, 0.65);
      noses.put(x - side * 0.45, -1 + 2.2, z, 0.14, 0.4, 0.14, undefined, side * (Math.PI / 2), true);
      hats.put(x, -1 + 2.62, z, 0.5, 0.35, 0.5);
    }
    snowmen.done();
    noses.done();
    hats.done();
    const path = new Batch(s, GEO.plane, toon("#cfd8ee"), 2);
    for (const side of sides) path.put(side * (BANK + 3.2), -0.98, zc, 1.6, zl, 1, undefined, 0, true);
    path.done();
    // the city on the banks: glass towers, warm-windowed blocks, golden pyramid tops, snow on the roofs
    // (the near ones in rows behind the firs, the far ones a skyline in the haze)
    const city = new Boxes(12, 14);
    const tops = new Batch(s, GEO.cone, toon("#ffd27a", "#3a2600"), 90).far();
    const pal = ["#86b8f0", "#6f9fd8", "#efe6d6", "#d9e4f2", "#b8b0e8", "#7cc6c8", "#f2d2b8"];
    let n = 0;
    for (const side of sides)
      for (let row = 0; row < 5; row++) {
        let z = z0 - rnd() * 20;
        while (z > z1) {
          const far = row > 1;
          const w = 9 + 3 * Math.floor(rnd() * (far ? 5 : 3)),
            d = 9 + 3 * Math.floor(rnd() * 4);
          const x = side * (far ? 74 + (row - 2) * 52 + rnd() * 30 : BANK + 20 + row * 21 + rnd() * 6);
          const h = far ? 24 + rnd() * rnd() * 90 : 9 + rnd() * (14 + row * 16);
          const c = pal[n++ % pal.length];
          const cap = rnd() < 0.28;
          city.add(x, z - d / 2, -1, -1 + h, w, d, c, mixHex(c, "#8f9fd0", 0.35), cap ? mixHex(c, "#ffffff", 0.3) : "#ffffff", Math.floor(rnd() * 4) / 4);
          if (cap) tops.put(x, -1 + h + w * 0.3, z - d / 2, w * 1.42, w * 0.6, d * 1.42, rnd() < 0.5 ? "#ffd27a" : "#9fd4ff", Math.PI / 4);
          z -= d + (far ? 10 + rnd() * 50 : 5 + rnd() * 16);
        }
      }
    const lit = { lit: 0.42, on: ["#ffe2a8", "#ffd08a", "#fff0cc"], off: "#5f7aa8" };
    const mats = cityMats(panes(rng(11), lit), panes(rng(11), { ...lit, glow: true }), "#ffc27a");
    city.build(s, mats.wall, mats.roof);
    tops.done();
    // the landmarks, along the way: the glass pyramid, the ZK Mall's tent, City Hall, the sphere, the tower
    // (too big and too far to shade the road: none of them casts)
    const glass = new THREE.MeshToonMaterial({ color: "#9fd4ff", emissive: "#1d3a5a", gradientMap: toonSteps() });
    const pyr = new THREE.Mesh(GEO.cone, glass);
    pyr.scale.set(30, 26, 30);
    pyr.rotation.y = Math.PI / 4;
    pyr.position.set(36, -1 + 13, -fin * 0.14);
    const pyrTop = new THREE.Mesh(GEO.cone, glow("#ffe680"));
    pyrTop.scale.set(7, 6, 7);
    pyrTop.rotation.y = Math.PI / 4;
    pyrTop.position.set(36, -1 + 26 - 3, -fin * 0.14);
    const tentGeo = new THREE.ConeGeometry(0.5, 1, 22);
    const tent = new THREE.Mesh(tentGeo, new THREE.MeshToonMaterial({ color: "#f6e7b8", emissive: "#4a3a10", gradientMap: toonSteps() }));
    tent.scale.set(38, 46, 34);
    tent.rotation.z = 0.1;
    tent.position.set(-40, -1 + 23, -fin * 0.34);
    const mast = new THREE.Mesh(GEO.cyl, toon("#c9c2a8"));
    mast.scale.set(0.8, 12, 0.8);
    mast.position.set(-42.3, 49, -fin * 0.34);
    mast.rotation.z = 0.1;
    const palace = new THREE.Mesh(GEO.box, toon("#f4f2ea"));
    palace.scale.set(30, 14, 16);
    palace.position.set(38, -1 + 7, -fin * 0.6);
    const dome = new THREE.Mesh(GEO.ball, toon("#3ea8ff", "#0a2a4a"));
    dome.scale.set(12, 12, 12);
    dome.position.set(38, 14, -fin * 0.6);
    const spire = new THREE.Mesh(GEO.cyl, toon("#ffd23f", "#4a3000"));
    spire.scale.set(0.7, 9, 0.7);
    spire.position.set(38, 23.5, -fin * 0.6);
    const sphere = new THREE.Mesh(GEO.ball, new THREE.MeshToonMaterial({ color: "#7ec8ff", emissive: "#1a3f66", gradientMap: toonSteps() }));
    sphere.scale.set(22, 22, 22);
    sphere.position.set(-38, 13, -fin * 0.82);
    // the white tower and its golden Z-Block, past the goal: a ring of trunks that open up round it
    const bz = -(fin + 58);
    const plinth = new THREE.Mesh(GEO.box, toon("#e8ecf4"));
    plinth.scale.set(16, 3, 16);
    plinth.position.set(0, WATER_Y + 1.5, bz);
    const core = new THREE.Mesh(GEO.cyl, toon("#ffffff"));
    core.scale.set(3.2, 34, 3.2);
    core.position.set(0, 16, bz);
    const ball = qBlock(7.2);
    ball.position.set(0, 38, bz);
    const rods = new THREE.InstancedMesh(GEO.box, toon("#ffffff"), 24);
    const m = new THREE.Matrix4(),
      q = new THREE.Quaternion(),
      e = new THREE.Euler(),
      p = new THREE.Vector3(),
      sc = new THREE.Vector3();
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      // the trunk's ribs, then the branches that cup the block
      e.set(Math.sin(a) * -0.04, 0, Math.cos(a) * 0.04, "XYZ");
      m.compose(p.set(Math.cos(a) * 2.2, 16, bz + Math.sin(a) * 2.2), q.setFromEuler(e), sc.set(0.45, 34, 0.45));
      rods.setMatrixAt(i, m);
      e.set(Math.sin(a) * -0.55, 0, Math.cos(a) * 0.55, "XYZ");
      m.compose(p.set(Math.cos(a) * 4.4, 35.5, bz + Math.sin(a) * 4.4), q.setFromEuler(e), sc.set(0.5, 9, 0.5));
      rods.setMatrixAt(12 + i, m);
    }
    rods.instanceMatrix.needsUpdate = true;
    rods.computeBoundingSphere();
    for (const o of [pyr, pyrTop, tent, mast, palace, dome, spire, sphere, plinth, core, ball, rods]) {
      o.userData.noShadow = true;
      s.add(o);
    }
    // lamps along both embankments, a soft warm pool of light on the snow under each
    const lampN = Math.ceil(zl / 14) * 2 + 2;
    const lposts = new Batch(s, GEO.box, toon("#2f3b5c"), lampN);
    const lheads = new Batch(s, GEO.box, glow("#ffe2a0"), lampN);
    const pools = new Batch(s, GEO.plane, new THREE.MeshBasicMaterial({ map: softTex(), color: "#ff9d4a", transparent: true, opacity: 0.6, depthWrite: false }), lampN);
    for (let z = z0; z > z1; z -= 14)
      for (const side of sides) {
        const x = side * (BANK + 1.4),
          zz = z + (side > 0 ? 7 : 0);
        lposts.put(x, -1 + 1.9, zz, 0.18, 3.8, 0.18);
        lheads.put(x, -1 + 3.9, zz, 0.55, 0.4, 0.55);
        pools.put(x + side * 0.6, -0.95, zz, 5.4, 5.4, 1, undefined, 0, true);
      }
    lposts.done();
    lheads.done();
    pools.done();
    // fairy lights wound round the near firs (they twinkle)
    const fl = new Batch(s, GEO.box, glow("#ffffff"), (firAt.length / 3) * 6);
    const flc = ["#ffd23f", "#ff5fa2", "#3ec6ff", "#8ee35b", "#ffffff"];
    for (let i = 0; i < firAt.length; i += 3) {
      const h = firAt[i + 2];
      for (let j = 0; j < 6; j++) {
        const kk = 0.15 + (j / 6) * 0.6;
        const a = j * 2.1 + i;
        const rr = (1 - kk) * h * 0.26;
        fl.put(firAt[i] + Math.cos(a) * rr, -1 + kk * h, firAt[i + 1] + Math.sin(a) * rr, 0.2, 0.2, 0.2, flc[(i / 3 + j) % flc.length]);
      }
    }
    fl.done();
    // on the shore ice: little rinks swept clear (skaters circling), anglers at their holes, sledges gliding by
    const rinks: { x: number; z: number; r: number }[] = [];
    for (let z = 60; z > z1 + 60; z -= 40 + rnd() * 26) rinks.push({ x: (rnd() < 0.5 ? -1 : 1) * (SHORE + 1.9 + rnd() * 0.3), z, r: 1.5 + rnd() * 0.25 });
    const rim = new Batch(s, GEO.cyl, toon("#ffffff"), rinks.length);
    const rinkB = new Batch(s, GEO.cyl, toon("#78aede"), rinks.length);
    for (const r of rinks) {
      rim.put(r.x, ICE_Y + 0.03, r.z, r.r * 2 + 0.5, 0.1, r.r * 2 + 0.5);
      rinkB.put(r.x, ICE_Y + 0.05, r.z, r.r * 2, 0.1, r.r * 2);
    }
    rim.done();
    rinkB.done();
    const NSL = 12;
    const NSK = rinks.length * 3;
    const NA = Math.max(1, rinks.length - 1);
    const skB = new Batch(s, GEO.box, toon("#ffffff"), NSK + NSL + NA);
    const skH = new Batch(s, GEO.box, toon("#f2c9a0"), NSK + NSL + NA);
    const skC = ["#ff4d5e", "#3ec6ff", "#ffd23f", "#8ee35b", "#ff8a1f", "#a98bff"];
    const skaters: { k: number; ph: number; sp: number; rr: number }[] = [];
    for (let kk = 0; kk < rinks.length; kk++) for (let j = 0; j < 3; j++) skaters.push({ k: kk, ph: (j / 3) * Math.PI * 2 + rnd(), sp: (0.8 + rnd() * 0.6) * (j === 2 ? -1 : 1), rr: 0.5 + rnd() * 0.7 });
    const sled: { x: number; z: number; v: number }[] = [];
    for (let i = 0; i < NSL; i++) sled.push({ x: (i % 2 ? 1 : -1) * (BANK - 0.9), z: rnd() * zl, v: (i % 2 ? 1 : -1) * (2.6 + rnd() * 1.6) });
    const sleds = new Batch(s, GEO.box, toon("#7a4a26"), NSL);
    // (an angler between two rinks: a dark hole, a figure sat by it, a little tent)
    const holes = new Batch(s, GEO.disc, toon("#1f4468"), NA);
    const tents = new Batch(s, GEO.cone, toon("#ffffff"), NA);
    const tentC = ["#ff7a3d", "#00afca", "#fec50c", "#e0503a"];
    for (let i = 0; i < NA; i++) {
      const a = rinks[i],
        b = rinks[i + 1] ?? a;
      const side = i % 2 ? 1 : -1;
      const x = side * (SHORE + 1.2 + rnd() * 1.6),
        z = (a.z + b.z) / 2 + (rnd() - 0.5) * 8;
      holes.put(x, ICE_Y + 0.02, z, 0.9, 0.9, 1, undefined, 0, true);
      tents.put(x + side * 1.3, ICE_Y + 0.7, z - 0.8, 1.7, 1.4, 1.7, tentC[i % tentC.length], Math.PI / 4);
      skB.put(x + 0.1, ICE_Y + 0.3, z + 0.75, 0.45, 0.55, 0.4, skC[(i + 3) % skC.length]);
      skH.put(x + 0.1, ICE_Y + 0.75, z + 0.7, 0.32, 0.32, 0.32);
    }
    holes.done();
    tents.done();
    const putSk = (t: number, first: boolean) => {
      for (let i = 0; i < NSK; i++) {
        const sk = skaters[i];
        const r = rinks[sk.k];
        const a = sk.ph + t * sk.sp;
        const x = r.x + Math.cos(a) * sk.rr,
          z = r.z + Math.sin(a) * sk.rr;
        const y = ICE_Y + 0.1 + Math.abs(Math.sin(t * 4 + i)) * 0.06;
        skB.put(x, y + 0.45, z, 0.42, 0.7, 0.32, first ? skC[i % skC.length] : undefined, -a, false, first ? -1 : NA + i);
        skH.put(x, y + 0.98, z, 0.32, 0.32, 0.32, undefined, -a, false, first ? -1 : NA + i);
      }
      // (a sledge and whoever kicks it along, up the river on one shore, down it on the other)
      for (let i = 0; i < NSL; i++) {
        const sl = sled[i];
        const z = z0 - ((((sl.z + t * sl.v) % zl) + zl) % zl);
        const lean = Math.sin(t * 3 + i) * 0.05;
        sleds.put(sl.x, ICE_Y + 0.14, z, 0.5, 0.16, 1.5, undefined, 0, false, first ? -1 : i);
        skB.put(sl.x, ICE_Y + 0.62 + lean, z + (sl.v > 0 ? -0.35 : 0.35), 0.42, 0.72, 0.34, first ? skC[(i + 1) % skC.length] : undefined, 0, false, first ? -1 : NA + NSK + i);
        skH.put(sl.x, ICE_Y + 1.16 + lean, z + (sl.v > 0 ? -0.35 : 0.35), 0.32, 0.32, 0.32, undefined, 0, false, first ? -1 : NA + NSK + i);
      }
    };
    putSk(0, true);
    skB.done();
    skH.done();
    sleds.done();
    const crows = new Flock(s, 7, "#2a2a3a", 50, -15, rnd);
    // the snow falling round the camera (one draw), light and low so it never hides the road; blown sideways by the gusts
    const N = 380;
    const pos = new Float32Array(N * 3);
    const box = { w: 70, h: 15, d: 90 };
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (rnd() - 0.5) * box.w;
      pos[i * 3 + 1] = rnd() * box.h;
      pos[i * 3 + 2] = -(START - 10) + (rnd() - 0.5) * box.d;
    }
    const geo = new THREE.BufferGeometry();
    const attr = new THREE.BufferAttribute(pos, 3);
    attr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute("position", attr);
    const flakeTex = canvasTex(16, 16, (g) => {
      const gr = g.createRadialGradient(8, 8, 0, 8, 8, 8);
      gr.addColorStop(0, "rgba(255,255,255,1)");
      gr.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = gr;
      g.fillRect(0, 0, 16, 16);
    });
    const flakes = new THREE.Points(geo, new THREE.PointsMaterial({ map: flakeTex, size: 0.36, transparent: true, depthWrite: false, opacity: 0.8 }));
    flakes.frustumCulled = false;
    s.add(flakes);
    const base = new Float32Array(N);
    for (let i = 0; i < N; i++) base[i] = 1.4 + rnd() * 1.4;
    let wx = 0;
    return {
      tick(dt, t, at, wind) {
        rip.offset.x = (rip.offset.x + dt * 0.012) % 1;
        putSk(t, false);
        fl.mesh.visible = Math.sin(t * 2.6) > -0.6;
        crows.tick(t, at);
        // (the flakes stay put in the world, wrapped round the camera's target as it moves on)
        wx += (wind * 22 - wx) * Math.min(1, dt * 3);
        const cz = at.z + 12;
        for (let i = 0; i < N; i++) {
          let x = pos[i * 3] + (wx + Math.sin(t * 1.3 + i) * 0.6) * dt;
          let y = pos[i * 3 + 1] - base[i] * (1 + Math.abs(wind) * 0.6) * dt;
          let z = pos[i * 3 + 2];
          if (y < 0) y += box.h;
          if (x > at.x + box.w / 2) x -= box.w;
          else if (x < at.x - box.w / 2) x += box.w;
          if (z > cz + box.d / 2) z -= box.d;
          else if (z < cz - box.d / 2) z += box.d;
          pos[i * 3] = x;
          pos[i * 3 + 1] = y;
          pos[i * 3 + 2] = z;
        }
        attr.needsUpdate = true;
      },
    };
  },
};
