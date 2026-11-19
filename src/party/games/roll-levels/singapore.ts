/**
 * MARINA ROOFTOPS: a warm night over Marina Bay's shophouses by the river. The road runs over shophouse
 * roofs (gaps between them, the street far below), plank bridges, an alley, and rooftop pools where
 * rafts glide side to side: time the jump on, ride, jump off. Red lanterns swing, hawker carts slide,
 * laundry poles trip. Past the goal: three towers under one sky deck; on the way, the big wheel and
 * the glowing garden trees.
 * Round it, in layers, all darker than the road: the roofs under and beside it (lit windows, festoon
 * bulbs, neon, lantern strings, steam from the vents), the river with its bumboats on one side and a
 * boulevard's traffic on the other, the housing blocks, the towers lit for the night, the bay's haze.
 */
import * as THREE from "three";
import { rng, type Rnd } from "../../kit";
import { GEO, canvasTex, glow, skyDome, toon, toonSteps } from "../../k3";
import { markGlow } from "../../post";
import { Batch, Boxes, HALF, POOL_Y, cityMats, crateTex, faceTex, panes, shuffle, slabTex, softTex, type Level, type SceneKit } from "./kit";

const STREET = -20;
/** The river beside the road (its two quays, its water), the boulevard on the other side. */
const RIVER0 = -44;
const RIVER1 = -16.5;
const WATER = STREET + 0.08;
const BLVD0 = 32.5;
const BLVD1 = 46.5;

/** A red lantern: gold bands round a red belly. */
const lanternTex = () =>
  canvasTex(128, 64, (g) => {
    g.fillStyle = "#e3262f";
    g.fillRect(0, 0, 128, 64);
    g.fillStyle = "#ff5a4a";
    for (let i = 0; i < 8; i++) g.fillRect(i * 16 + 3, 0, 4, 64);
    g.fillStyle = "#ffcc33";
    g.fillRect(0, 0, 128, 8);
    g.fillRect(0, 56, 128, 8);
    g.fillRect(0, 29, 128, 6);
  });
/** A bamboo laundry pole with shirts on it. */
const laundryTex = () =>
  canvasTex(128, 64, (g) => {
    g.fillStyle = "#3a2a3a";
    g.fillRect(0, 0, 128, 64);
    const cols = ["#ffffff", "#ff7aa8", "#5ad1ff", "#ffd23f", "#8ee35b", "#ffffff"];
    for (let i = 0; i < 6; i++) {
      g.fillStyle = cols[i];
      const x = 4 + i * 21;
      g.fillRect(x, 14, 17, 40);
      g.fillRect(x - 3, 14, 23, 10);
    }
    g.fillStyle = "#d9b25a";
    g.fillRect(0, 6, 128, 9);
    g.fillStyle = "#a07a2a";
    for (let x = 10; x < 128; x += 28) g.fillRect(x, 6, 3, 9);
  });
/**
 * Shophouse fronts: tall shuttered windows in rows (multiplied by the house's colour); `lit`: the same
 * front with only its lit windows, on black (the emissive map: give both the same seed).
 */
const houseTex = (rnd: Rnd, lit = false) =>
  canvasTex(
    64,
    128,
    (g) => {
      g.fillStyle = lit ? "#000000" : "#ffffff";
      g.fillRect(0, 0, 64, 128);
      for (let y = 6; y < 128; y += 21) {
        for (let x = 6; x < 64; x += 20) {
          const on = rnd() < 0.32;
          const warm = rnd() < 0.82;
          if (lit) {
            if (!on) continue;
            g.fillStyle = warm ? "#ffbe5c" : "#8fdcff";
            g.fillRect(x, y, 12, 14);
            continue;
          }
          g.fillStyle = on ? "#5a4630" : "#1a2238";
          g.fillRect(x, y, 12, 14);
          g.fillStyle = "#2c8272";
          g.fillRect(x - 3, y, 3, 14);
          g.fillRect(x + 12, y, 3, 14);
        }
        if (!lit) {
          g.fillStyle = "rgba(0,0,0,0.16)";
          g.fillRect(0, y + 16, 64, 3);
        }
      }
    },
    true,
  );
/** The river at night: dark water, short pale ripples. */
const riverTex = (rnd: Rnd) =>
  canvasTex(
    128,
    128,
    (g) => {
      g.fillStyle = "#14264e";
      g.fillRect(0, 0, 128, 128);
      g.fillStyle = "#213a70";
      for (let i = 0; i < 30; i++) g.fillRect(Math.floor(rnd() * 108), Math.floor(rnd() * 126), 10 + Math.floor(rnd() * 14), 2);
      g.fillStyle = "#3a5a9c";
      for (let i = 0; i < 12; i++) g.fillRect(Math.floor(rnd() * 116), Math.floor(rnd() * 126), 7, 2);
    },
    true,
  );
/** The quays' lights lying on the water: warm streaks along both edges (across the river: the canvas's x). */
const shineTex = (rnd: Rnd) =>
  canvasTex(
    256,
    256,
    (g) => {
      const cols = ["255,190,100", "255,120,90", "120,230,255", "255,220,140"];
      for (let i = 0; i < 26; i++) {
        const near = i % 2 === 0;
        const y = rnd() * 256;
        const len = 40 + rnd() * 70;
        const x0 = near ? 256 : 0;
        const gr = g.createLinearGradient(x0, 0, near ? 256 - len : len, 0);
        const c = cols[Math.floor(rnd() * cols.length)];
        gr.addColorStop(0, `rgba(${c},0.5)`);
        gr.addColorStop(1, `rgba(${c},0)`);
        g.fillStyle = gr;
        const h = 5 + rnd() * 9;
        for (const dy of [-256, 0, 256]) g.fillRect(near ? 256 - len : 0, y + dy, len, h);
      }
    },
    true,
  );
/** The boulevard: asphalt, a dashed line down each lane, a paler median. */
const blvdTex = () =>
  canvasTex(
    64,
    64,
    (g) => {
      g.fillStyle = "#211e3a";
      g.fillRect(0, 0, 64, 64);
      g.fillStyle = "#34305a";
      g.fillRect(29, 0, 6, 64);
      g.fillStyle = "#6a66a0";
      for (const x of [14, 48]) g.fillRect(x, 8, 2, 28);
    },
    true,
  );

export const SINGAPORE: Level = {
  key: "singapore",
  title: "MARINA ROOFTOPS",
  titleZh: "滨海湾屋顶",
  tag: "Shophouse roofs by night: gaps between the roofs, rafts gliding over the rooftop pools.",
  tagZh: "夜晚的店屋屋顶：屋顶间有缺口，屋顶泳池里的筏子左右滑行。",
  song: "marina",
  ambience: "city-night",
  sky: ["#0b0a2c", "#553587"],
  fog: [70, 330],
  // (a night lit for play: a cool moon from ahead and to the right, a violet sky, the lanterns' warm bounce from below)
  hemi: ["#b4acf2", "#6a3d58", 1.35],
  sun: ["#eeeaff", 1.6, 30, 46, -38],
  post: { hot: 0.8, bloom: 1.2 },
  shadowK: 0.9,
  road: {
    slab: ["#fff3e2", "#f1dfc8"],
    tex: (c) => slabTex(c, { grid: 6, grout: "rgba(120,70,60,0.26)", line: "#2ec4b0", seam: "rgba(90,50,50,0.34)" }),
    lift: 0.2,
    body: "#8a5a4a",
    girder: null,
    kerb: ["#fff4e0", "#2ec4b0"],
    plank: ["#c98a5a", "#ddb07a"],
    beam: "#6a4a3a",
    pylon: null,
  },
  props: {
    crate: () => crateTex("#3fb6a8", "#7fe0d0", "#1f6f68", "#16504c"),
    wall: ["#ff9fb8", "#ffe0ea"],
    bar: laundryTex,
    mover: () => faceTex("#e8423f", "#ffffff", "#9c1f2a", "#ffffff"),
    track: "#4a2f5a",
    ball: lanternTex,
    chain: "#2a1a20",
    gantry: ["#b0102a", "#ffcc33"],
    belt: ["#2f3350", "#ff9f1c"],
    arch: ["#2ad4c0", "#ff4d8d"],
    flags: ["#ff3b3b", "#ffcc33", "#ff3b3b", "#ff7a3d"],
    lamp: "#ffd88a",
    post: "#3a2a3a",
    dust: ["#fff0d8", "#f2d6b4", "#f2a07b"],
    bits: [
      ["#3fb6a8", "#1f6f68"],
      ["#ff9fb8", "#ffe0ea"],
      ["#d9b25a", "#ff7aa8", "#5ad1ff"],
      ["#e8423f", "#ffffff"],
    ],
  },
  deep: STREET + 0.5,
  sideY: -8,
  layout(c, r) {
    // easy: crates, the first roofs, a gentle pool, a laundry pole
    c.crates(2);
    c.roofs(2, false);
    c.plain(2);
    c.pool(1, 1.25, 3.4);
    c.plain(3);
    c.boosts();
    c.bar();
    // medium
    c.some([() => c.roofs(2), () => c.pool(2, 1.45, 3.2), () => c.alley(), () => c.swing(1), () => c.pushers(2, 1.5), () => c.crates(3), () => c.bridge(r() < 0.5 ? "twin" : "one")], 5, 3);
    // hard: always a fast double pool, then five more
    const hard = shuffle([() => c.roofs(3), () => c.bridgeSwing(), () => c.pushers(3, 2.1), () => c.doubleGap(), () => c.gapCrates(), () => c.barGap(), () => c.alley()], r).slice(0, 5);
    hard.splice(1 + Math.floor(r() * 4), 0, () => c.pool(2, 1.65, 3.0, 0.15 + r() * 0.35));
    c.seq(hard, 1.5);
  },
  scenery(k: SceneKit) {
    const s = k.scene;
    const rnd = rng(0x51a9);
    const fin = k.fin;
    const z0 = 250,
      z1 = -(fin + 290);
    const zl = z0 - z1,
      zc = (z0 + z1) / 2;
    // the night sky all round: stars, a milky band, a low moon over the bay where the light comes from
    skyDome(s, { sky: SINGAPORE.sky, stars: 700, band: true, disc: { az: 238, el: 15, moon: true, size: 9, color: "#fff1d0" }, haze: 0.5, ground: "#2a1c4a", rnd });
    // the street far below
    const street = new THREE.Mesh(GEO.plane, toon("#1d1a36"));
    street.rotation.x = -Math.PI / 2;
    street.scale.set(1100, zl + 500, 1);
    street.position.set(0, STREET, zc);
    street.userData.noShadow = true;
    s.add(street);
    // the shophouses: under every roof of the road, and in rows on both sides; night colours, lit windows that glow
    const houseMat = markGlow(new THREE.MeshToonMaterial({ map: houseTex(rng(5)), emissiveMap: houseTex(rng(5), true), emissive: "#ffffff", gradientMap: toonSteps() }), 0.4);
    const pal = ["#4f7480", "#7a5870", "#7c7058", "#566690", "#665a90", "#806458", "#5e7654"];
    const roofC = ["#5e3f46", "#664546", "#57394a", "#5e3f46", "#664546", "#4c4a62"];
    let nh = 0;
    for (const f of k.floors) if (!f.wood) nh += Math.ceil((f.s1 - f.s0) / 4.5);
    nh += k.pools.length;
    // (the rows: beside the road, stepping up away from it; then past the river and past the boulevard)
    const rows = [-9, 9, 15.6, 22.2, 28.8, RIVER0 - 7, RIVER0 - 13.6, BLVD1 + 3.5, BLVD1 + 10.1];
    const NEAR = 5;
    const per = Math.ceil(zl / 3.9);
    const under = new Batch(s, GEO.box, houseMat, nh);
    const houses = new Batch(s, GEO.box, houseMat, NEAR * per);
    const housesFar = new Batch(s, GEO.box, houseMat, (rows.length - NEAR) * per).far();
    // (a pitched roof: a triangular prism, flat-shaded, its base at y 0)
    let prism: THREE.BufferGeometry = new THREE.CylinderGeometry(1, 1, 1, 3);
    prism.rotateX(-Math.PI / 2);
    prism.scale(1 / Math.sqrt(3), 1 / 1.5, 1);
    prism.translate(0, 1 / 3, 0);
    prism = prism.toNonIndexed();
    prism.computeVertexNormals();
    const NSH = rows.length * per;
    const roofs = new Batch(s, prism, toon("#ffffff"), NSH);
    const eaves = new Batch(s, GEO.box, toon("#2e1f2c"), NSH);
    const flats = new Batch(s, GEO.box, toon("#6f6a84"), NSH);
    const tanks = new Batch(s, GEO.cyl, toon("#5c6c86"), NSH);
    const acs = new Batch(s, GEO.box, toon("#9a9aaa"), NSH);
    const plants = new Batch(s, GEO.box, toon("#2f6a4a"), NSH);
    const bulbs = new Batch(s, GEO.box, glow("#ffffff"), per * 14);
    const neonA = new Batch(s, GEO.plane, glow("#ffffff"), per);
    const neonB = new Batch(s, GEO.plane, glow("#ffffff"), per);
    const bulbC = ["#ffd23f", "#ff5fa2", "#7ff0ff", "#ff8a3d", "#b6ff7a"];
    const neonC = ["#ff3d8b", "#3ef0ff", "#ffe14d", "#7dff6a", "#c06bff"];
    const vents: number[] = [];
    let ci = 0;
    const top = -0.9;
    for (const f of k.floors) {
      if (f.wood) continue;
      const len = f.s1 - f.s0;
      const n = Math.ceil(len / 4.5);
      const u = len / n;
      for (let i = 0; i < n; i++) under.put((f.x0 + f.x1) / 2, (top + STREET) / 2, -(f.s0 + (i + 0.5) * u), f.x1 - f.x0 - 0.04, top - STREET, u - 0.04, pal[ci++ % pal.length]);
    }
    for (const p of k.pools) under.put(0, (POOL_Y - 0.4 + STREET) / 2, -(p.s0 + p.s1) / 2, p.x1 - p.x0, POOL_Y - 0.4 - STREET, p.s1 - p.s0, "#6f7a98");
    under.done();
    // (what the rows leave room for: the three towers past the goal, the wheel's legs, the garden's trees)
    const bz = -(fin + 72);
    const wz = -fin * 0.46;
    const gz = -fin * 0.72;
    const clear = (x: number, z: number) => (Math.abs(z - bz) < 13 && Math.abs(x) < 26) || (x > 48 && Math.abs(z - wz) < 9) || (x < RIVER0 && Math.abs(z - gz) < 36);
    rows.forEach((x, row) => {
      const side = Math.sign(x);
      const near = row < NEAR;
      const B = near ? houses : housesFar;
      const step = near ? Math.round((Math.abs(x) - 9) / 6.6) : 3;
      let z = z0;
      while (z > z1) {
        const u = 4 + rnd() * 2.2;
        const h = STREET + 11 + step * 2.6 - rnd() * 3;
        const w = 5;
        const zm = z - u / 2;
        z -= u;
        const pitched = rnd() < 0.72;
        const r1 = rnd(),
          r2 = rnd(),
          r3 = rnd(),
          r4 = rnd();
        if (clear(x, zm)) continue;
        B.put(x, (h + STREET) / 2, zm, w, h - STREET, u - 0.5, pal[ci++ % pal.length]);
        if (pitched) {
          // a tiled pitched roof over a dark eave
          eaves.put(x, h + 0.08, zm, w + 0.6, 0.16, u - 0.3);
          roofs.put(x, h + 0.16, zm, w + 0.5, 1.5, u - 0.35, roofC[Math.floor(r1 * roofC.length)]);
        } else {
          // a flat roof terrace: a water tank, an air-con box, potted plants
          flats.put(x, h + 0.1, zm, w + 0.2, 0.2, u - 0.4);
          tanks.put(x + (r1 - 0.5) * 2, h + 0.9, zm + (r2 - 0.5) * (u - 2), 1.3, 1.5, 1.3);
          acs.put(x + (r3 - 0.5) * 3, h + 0.5, zm + (r4 - 0.5) * (u - 1.6), 1, 0.7, 0.7);
          plants.put(x - side * 1.8, h + 0.45, zm, 0.6, 0.7, u - 1.2);
          // (the kitchens' vents steam, on the terraces by the road)
          if (row < 3 && zm < 30 && zm > -(fin + 30) && vents.length < 3 * 22 && r2 < 0.5) vents.push(x + (r3 - 0.5) * 3, h + 0.9, zm + (r4 - 0.5) * (u - 1.6));
        }
        if (row < 2) {
          // festoon bulbs along the eave facing the road; a neon sign down every third front (half of them blink)
          const ex = side * (9 - w / 2 - 0.35);
          for (let b = 0; b < Math.floor(u / 1.1); b++) bulbs.put(ex, h - 0.15 - (b % 2) * 0.12, zm + u / 2 - 0.5 - b * 1.1, 0.22, 0.22, 0.22, bulbC[(ci + b) % bulbC.length]);
          if (ci % 3 === 0) (ci % 2 ? neonA : neonB).put(side * (9 - w / 2 - 0.04), h - 2.8, zm, 0.9, 3, 1, neonC[ci % neonC.length], -side * (Math.PI / 2));
        }
      }
    });
    for (const b of [houses, housesFar, roofs, eaves, flats, tanks, acs, plants, bulbs, neonA, neonB]) b.done();
    // the river: dark water that drifts, the quays' lights lying on it, stone quays, lamps along both
    const rw = RIVER1 - RIVER0;
    const rtex = riverTex(rng(8));
    rtex.repeat.set(2, (zl / rw) * 2);
    const river = new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ map: rtex }));
    river.rotation.x = -Math.PI / 2;
    river.scale.set(rw, zl, 1);
    river.position.set((RIVER0 + RIVER1) / 2, WATER, zc);
    const stex = shineTex(rng(9));
    stex.repeat.set(1, zl / (rw * 2));
    const shine = new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ map: stex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    shine.rotation.x = -Math.PI / 2;
    shine.scale.set(rw, zl, 1);
    shine.position.set((RIVER0 + RIVER1) / 2, WATER + 0.03, zc);
    for (const o of [river, shine]) {
      o.userData.noShadow = true;
      s.add(o);
    }
    const quay = new Batch(s, GEO.box, toon("#ffffff"), 4).far();
    quay.put(RIVER1 + 0.3, STREET + 0.35, zc, 0.6, 0.7, zl, "#5a5478");
    quay.put(RIVER0 - 0.3, STREET + 0.35, zc, 0.6, 0.7, zl, "#5a5478");
    // (the promenades: paler paving along each quay)
    quay.put(RIVER1 + 2.6, STREET + 0.04, zc, 3.6, 0.1, zl, "#3a3558");
    quay.put(RIVER0 - 2.2, STREET + 0.04, zc, 2.8, 0.1, zl, "#3a3558");
    quay.done();
    const NQ = Math.ceil(zl / 11) * 2 + 2;
    const qposts = new Batch(s, GEO.box, toon("#2a2440"), NQ).far();
    const qheads = new Batch(s, GEO.box, glow("#ffd27a"), NQ).far();
    const qpool = new Batch(s, GEO.plane, new THREE.MeshBasicMaterial({ map: softTex(), color: "#ff9d4a", transparent: true, opacity: 0.5, depthWrite: false }), NQ).far();
    for (let z = z0; z > z1; z -= 11)
      for (const x of [RIVER1 + 1.2, RIVER0 - 1.2]) {
        const zz = z + (x < RIVER0 ? 5.5 : 0);
        qposts.put(x, STREET + 1.7, zz, 0.2, 3.4, 0.2);
        qheads.put(x, STREET + 3.5, zz, 0.6, 0.45, 0.6);
        qpool.put(x, STREET + 0.12, zz, 6, 6, 1, undefined, 0, true);
      }
    qposts.done();
    qheads.done();
    qpool.done();
    // the bumboats: a dark hull, a painted canopy, a lantern fore and aft, their light on the water
    const NBT = 10;
    const hulls = new Batch(s, GEO.box, toon("#8a6450"), NBT).far();
    const canopy = new Batch(s, GEO.box, toon("#ffffff"), NBT).far();
    const blamp = new Batch(s, GEO.box, glow("#ffcf6a"), NBT * 2).far();
    const bshine = new Batch(s, GEO.plane, new THREE.MeshBasicMaterial({ map: softTex(), color: "#ffb060", transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false }), NBT).far();
    const canC = ["#d0483c", "#2fa090", "#d8a83a", "#9a54b4"];
    const boats: { x: number; z: number; v: number }[] = [];
    for (let i = 0; i < NBT; i++) boats.push({ x: RIVER1 - 4 - (i % 2 ? 11 + rnd() * 6 : rnd() * 6), z: (i / NBT) * zl + rnd() * 30, v: (i % 2 ? 1 : -1) * (2.4 + rnd() * 1.4) });
    const putBoats = (t: number, first: boolean) => {
      for (let j = 0; j < NBT; j++) {
        const b = boats[j];
        const i = first ? -1 : j;
        const z = z0 - ((((b.z + t * b.v) % zl) + zl) % zl);
        const y = WATER + Math.sin(t * 1.4 + j) * 0.05;
        hulls.put(b.x, y + 0.35, z, 2.5, 0.9, 8.4, undefined, 0, false, i);
        canopy.put(b.x, y + 1.2, z + 0.4, 2.1, 0.8, 4.4, first ? canC[j % canC.length] : undefined, 0, false, i);
        blamp.put(b.x, y + 1.15, z - 3.6, 0.45, 0.5, 0.45, undefined, 0, false, first ? -1 : j * 2);
        blamp.put(b.x, y + 1.15, z + 3.6, 0.45, 0.5, 0.45, undefined, 0, false, first ? -1 : j * 2 + 1);
        bshine.put(b.x, WATER + 0.06, z, 9, 13, 1, undefined, 0, true, i);
      }
    };
    putBoats(0, true);
    hulls.done();
    canopy.done();
    blamp.done();
    bshine.done();
    // the boulevard on the other side: asphalt, lamps down its median, headlights one way and tail-lights the other
    const btex = blvdTex();
    btex.repeat.set(1, zl / 14);
    const blvd = new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ map: btex }));
    blvd.rotation.x = -Math.PI / 2;
    blvd.scale.set(BLVD1 - BLVD0, zl, 1);
    blvd.position.set((BLVD0 + BLVD1) / 2, STREET + 0.05, zc);
    blvd.userData.noShadow = true;
    s.add(blvd);
    const NL = Math.ceil(zl / 16) + 1;
    const mposts = new Batch(s, GEO.box, toon("#2a2440"), NL).far();
    const mheads = new Batch(s, GEO.box, glow("#ffe2a0"), NL).far();
    for (let i = 0; i < NL; i++) {
      mposts.put((BLVD0 + BLVD1) / 2, STREET + 2.4, z0 - i * 16, 0.25, 4.8, 0.25);
      mheads.put((BLVD0 + BLVD1) / 2, STREET + 4.9, z0 - i * 16, 2.6, 0.3, 0.5);
    }
    mposts.done();
    mheads.done();
    const NC = 46;
    const heads = new Batch(s, GEO.box, glow("#fff2c0"), NC / 2).far();
    const tails = new Batch(s, GEO.box, glow("#ff3b4a"), NC / 2).far();
    const cars: { x: number; z: number; v: number }[] = [];
    for (let i = 0; i < NC; i++) {
      const up = i % 2 === 0;
      cars.push({ x: (BLVD0 + BLVD1) / 2 + (up ? 1 : -1) * (2 + (i % 4 < 2 ? 0 : 2.6)), z: rnd() * zl, v: (up ? 1 : -1) * (10 + rnd() * 5) });
      (up ? tails : heads).put(cars[i].x, STREET + 0.6, 0, 1.5, 0.5, 0.7);
    }
    heads.done();
    tails.done();
    // the housing blocks beyond the rows, then the towers, lit for the night (one mesh: walls that tile their windows)
    const city = new Boxes(12, 14);
    const bpal = ["#3a4474", "#46407a", "#34507a", "#4a3d6e", "#3d4a80"];
    const HZ = "#2c2456";
    for (const x0 of [RIVER0 - 27, RIVER0 - 49, BLVD1 + 22, BLVD1 + 44]) {
      let z = z0 - rnd() * 14;
      while (z > z1) {
        const d = 18 + 3 * Math.floor(rnd() * 5),
          w = 12 + 3 * Math.floor(rnd() * 2);
        const h = 24 + rnd() * 24 + (Math.abs(x0) > 80 ? 10 : 0);
        const zm = z - d / 2;
        z -= d + 5 + rnd() * 9;
        if (clear(x0, zm)) continue;
        const c = bpal[Math.floor(rnd() * bpal.length)];
        city.add(x0 + (rnd() - 0.5) * 4, zm, STREET, STREET + h, w, d, c, HZ, "#2a2a4c", Math.floor(rnd() * 4) / 4);
      }
    }
    const beacons: number[] = [];
    const tpal = ["#3c4a86", "#4a4690", "#365a8c", "#54468a", "#40508e"];
    for (let i = 0; i < 120; i++) {
      const side = i % 2 ? 1 : -1;
      const x = side * (112 + rnd() * rnd() * 190);
      const z = z1 + rnd() * zl;
      const w = 12 + 3 * Math.floor(rnd() * 4);
      const h = 44 + rnd() * rnd() * 110;
      const c = tpal[i % tpal.length];
      city.add(x, z, STREET, STREET + h, w, w + 3 * Math.floor(rnd() * 3), c, HZ, "#30305a", Math.floor(rnd() * 4) / 4);
      if (h > 84) beacons.push(x, STREET + h + 0.6, z);
    }
    // past the goal: three towers under one long sky deck
    for (let i = 0; i < 3; i++) city.add((i - 1) * 15, bz, STREET, STREET + 72, 9, 9, "#5a66a8", "#3a3a7a", "#30305a", i / 3);
    const wl = { lit: 0.5, on: ["#ffe3a0", "#ffd08a", "#bfe8ff", "#fff0c0"], off: "#20264a", frame: "#b8bce0" };
    const mats = cityMats(panes(rng(13), wl), panes(rng(13), { ...wl, glow: true }), "#ffffff");
    markGlow(mats.wall, 0.45);
    city.build(s, mats.wall, mats.roof);
    const beaconB = new Batch(s, GEO.box, glow("#ff3048"), beacons.length / 3 + 3).far();
    for (let i = 0; i < beacons.length; i += 3) beaconB.put(beacons[i], beacons[i + 1], beacons[i + 2], 1.3, 1.3, 1.3);
    for (let i = 0; i < 3; i++) beaconB.put((i - 1) * 15 + 4, STREET + 77.2, bz, 0.9, 1.6, 0.9);
    beaconB.done();
    const deck = new THREE.Mesh(GEO.box, toon("#c9cdf0", "#20204a"));
    deck.scale.set(58, 3, 11);
    deck.position.set(4, STREET + 73.5, bz);
    const garden = new THREE.Mesh(GEO.box, toon("#3f9a5a", "#0a2a14"));
    garden.scale.set(56, 0.8, 9.5);
    garden.position.set(4, STREET + 75.4, bz);
    const deckLight = new THREE.Mesh(GEO.box, glow("#ffe3a0"));
    deckLight.scale.set(58.2, 0.5, 11.2);
    deckLight.position.set(4, STREET + 72.4, bz);
    // the big wheel, its pods lit
    const wheelGeo = new THREE.TorusGeometry(20, 0.6, 6, 56);
    const wheel = new THREE.Mesh(wheelGeo, toon("#b9c0ee", "#2a2f55"));
    wheel.position.set(56, 14, wz);
    const legs = new Batch(s, GEO.box, toon("#8088c0"), 2).far();
    legs.put(56, -3, wz - 3, 1.2, 34, 1.2, undefined, 0);
    legs.put(56, -3, wz + 3, 1.2, 34, 1.2, undefined, 0);
    legs.done();
    const pods = new THREE.InstancedMesh(GEO.box, glow("#9ff3ff"), 28);
    pods.frustumCulled = false;
    for (const o of [deck, garden, deckLight, wheel, pods]) {
      o.userData.noShadow = true;
      s.add(o);
    }
    // the garden's glowing trees: purple trunks that flare into lit canopies, on a dark lawn by the river
    const lawn = new THREE.Mesh(GEO.plane, toon("#1f4a3a"));
    lawn.rotation.x = -Math.PI / 2;
    lawn.scale.set(44, 72, 1);
    lawn.position.set(RIVER0 - 23, STREET + 0.06, gz);
    lawn.userData.noShadow = true;
    s.add(lawn);
    const trunkGeo = new THREE.CylinderGeometry(0.5, 0.14, 1, 10);
    const trunks = new Batch(s, trunkGeo, toon("#8a3fb8", "#2a0a3a"), 7).far();
    const crowns = new Batch(s, GEO.cyl, glow("#ff6ad5"), 7).far();
    const crowns2 = new Batch(s, GEO.cyl, glow("#6affd8"), 7).far();
    for (let i = 0; i < 7; i++) {
      const x = RIVER0 - 6 - rnd() * 30,
        z = gz + (rnd() - 0.5) * 56;
      const h = 18 + rnd() * 14;
      trunks.put(x, STREET + h / 2, z, 9, h, 9);
      (i % 2 ? crowns : crowns2).put(x, STREET + h + 0.3, z, 10, 0.6, 10);
    }
    trunks.done();
    crowns.done();
    crowns2.done();
    // strings of red lanterns from the road's edge down to the first roofs, swaying (a cord, five lanterns)
    const cordP: number[] = [];
    const lant: number[] = [];
    let ls = 0;
    for (let a = 4; a < fin + 34; a += 10.5) {
      const side = ls++ % 2 ? 1 : -1;
      if (!k.ground(a, side * (HALF - 0.2))) continue;
      const ax = side * (HALF + 0.55),
        ay = -0.25,
        bx = side * 8.2,
        by = -6.3;
      for (let i = 0; i <= 6; i++) {
        const u = i / 6;
        // (the cord sags between its ends)
        const x = ax + (bx - ax) * u,
          y = ay + (by - ay) * u - Math.sin(u * Math.PI) * 0.7;
        if (i > 0) cordP.push(x, y, -a);
        if (i < 6) cordP.push(x, y, -a);
        if (i > 0 && i < 6) lant.push(x, y - 0.32, -a, u, ls);
      }
    }
    const cg = new THREE.BufferGeometry();
    cg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(cordP), 3));
    const cords = new THREE.LineSegments(cg, new THREE.LineBasicMaterial({ color: "#1a1024" }));
    s.add(cords);
    const NLN = lant.length / 5;
    const lanterns = new Batch(s, GEO.box, glow("#ff4a34"), NLN).far();
    const lcaps = new Batch(s, GEO.box, glow("#ffcc4d"), NLN).far();
    const putLant = (t: number, first: boolean) => {
      for (let j = 0; j < NLN; j++) {
        const o = j * 5;
        const sw = Math.sin(t * 1.5 + lant[o + 4] * 1.9) * 0.16 * Math.sin(lant[o + 3] * Math.PI);
        const i = first ? -1 : j;
        lanterns.put(lant[o], lant[o + 1], lant[o + 2] + sw, 0.42, 0.5, 0.42, undefined, 0, false, i);
        lcaps.put(lant[o], lant[o + 1] + 0.3, lant[o + 2] + sw * 0.8, 0.26, 0.1, 0.26, undefined, 0, false, i);
      }
    };
    putLant(0, true);
    lanterns.done();
    lcaps.done();
    // steam off the kitchens' vents: puffs that rise, swell and thin out
    const NV = vents.length / 3;
    const PUFF = 3;
    const steam = new Batch(s, GEO.box, new THREE.MeshBasicMaterial({ color: "#d4d0f0", transparent: true, opacity: 0.26, depthWrite: false }), NV * PUFF).far();
    const putSteam = (t: number, first: boolean) => {
      for (let v = 0; v < NV; v++)
        for (let j = 0; j < PUFF; j++) {
          const u = (((t * 0.3 + v * 0.37 + j / PUFF) % 1) + 1) % 1;
          const sz = (0.3 + u * 0.8) * (u > 0.8 ? (1 - u) * 5 : 1);
          steam.put(vents[v * 3] + u * 0.9, vents[v * 3 + 1] + u * 3.4, vents[v * 3 + 2], sz, sz, sz, undefined, u * 2 + v, false, first ? -1 : v * PUFF + j);
        }
    };
    putSteam(0, true);
    steam.done();
    // searchlights from the tower tops, sweeping the sky
    const beamGeo = new THREE.ConeGeometry(5, 110, 18, 1, true);
    beamGeo.rotateX(Math.PI);
    beamGeo.translate(0, 55, 0);
    const beamMat = new THREE.MeshBasicMaterial({ color: "#bfe8ff", transparent: true, opacity: 0.09, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
    const beams: { m: THREE.Mesh; ph: number }[] = [];
    for (const [bx, by, bzz] of [
      [-15, STREET + 72, bz],
      [15, STREET + 72, bz],
      [-120, 40, -fin * 0.55],
      [124, 30, -fin * 0.2],
    ]) {
      const b = new THREE.Mesh(beamGeo, beamMat);
      b.position.set(bx, by, bzz);
      s.add(b);
      beams.push({ m: b, ph: rnd() * 6 });
    }
    // fireworks over the bay ahead: bursts of sparks (one draw, additive, fading)
    const FW = 900;
    const fp = new Float32Array(FW * 3),
      fc = new Float32Array(FW * 3);
    const fv = new Float32Array(FW * 3),
      fl = new Float32Array(FW),
      fbase = new Float32Array(FW * 3);
    for (let i = 0; i < FW; i++) fp[i * 3 + 1] = -999;
    const fgeo = new THREE.BufferGeometry();
    const fpa = new THREE.BufferAttribute(fp, 3),
      fca = new THREE.BufferAttribute(fc, 3);
    fpa.setUsage(THREE.DynamicDrawUsage);
    fca.setUsage(THREE.DynamicDrawUsage);
    fgeo.setAttribute("position", fpa);
    fgeo.setAttribute("color", fca);
    const fireworks = new THREE.Points(fgeo, new THREE.PointsMaterial({ size: 1.3, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    fireworks.frustumCulled = false;
    s.add(fireworks);
    const fwC = [new THREE.Color("#ff4d8d"), new THREE.Color("#ffd23f"), new THREE.Color("#3ef0ff"), new THREE.Color("#8cff6a"), new THREE.Color("#c06bff"), new THREE.Color("#ffffff")];
    // (their own random: the scenery never draws from the game's, nor from Math.random while it plays)
    const fr = rng(0xf12e);
    let fnext = 1,
      fi = 0;
    const m = new THREE.Matrix4(),
      q = new THREE.Quaternion(),
      p = new THREE.Vector3(),
      sc = new THREE.Vector3(1.6, 1.4, 1.6);
    return {
      tick(dt, t, at) {
        for (const b of beams) {
          b.m.rotation.z = Math.sin(t * 0.35 + b.ph) * 0.55;
          b.m.rotation.x = -0.25 + Math.cos(t * 0.27 + b.ph) * 0.3;
        }
        // the river drifts, the boats and the traffic go by, the lanterns sway, the vents steam, the signs blink
        rtex.offset.y = (rtex.offset.y + dt * 0.02) % 1;
        rtex.offset.x = (rtex.offset.x + dt * 0.006) % 1;
        putBoats(t, false);
        for (let i = 0; i < NC; i++) {
          const c = cars[i];
          const z = z0 - ((((c.z + t * c.v) % zl) + zl) % zl);
          (i % 2 === 0 ? tails : heads).put(c.x, STREET + 0.6, z, 1.5, 0.5, 0.7, undefined, 0, false, i >> 1);
        }
        putLant(t, false);
        putSteam(t, false);
        neonB.mesh.visible = (t * 0.9) % 1 > 0.18 && Math.sin(t * 23) > -0.6;
        beaconB.mesh.visible = (t * 0.7) % 1 > 0.4;
        // a new burst now and then
        fnext -= dt;
        if (fnext <= 0) {
          fnext = 0.7 + fr() * 1.3;
          const cx = at.x + (fr() * 2 - 1) * 70,
            cy = 30 + fr() * 30,
            cz = at.z - 90 - fr() * 90;
          const col = fwC[Math.floor(fr() * fwC.length)];
          const sp = 7 + fr() * 5;
          for (let j = 0; j < 80; j++) {
            const i = fi;
            fi = (fi + 1) % FW;
            const u = fr() * 2 - 1,
              a = fr() * Math.PI * 2,
              rr = Math.sqrt(1 - u * u);
            fp[i * 3] = cx;
            fp[i * 3 + 1] = cy;
            fp[i * 3 + 2] = cz;
            fv[i * 3] = Math.cos(a) * rr * sp;
            fv[i * 3 + 1] = u * sp;
            fv[i * 3 + 2] = Math.sin(a) * rr * sp;
            fl[i] = 1.4 + fr() * 0.6;
            fbase[i * 3] = col.r;
            fbase[i * 3 + 1] = col.g;
            fbase[i * 3 + 2] = col.b;
          }
        }
        for (let i = 0; i < FW; i++) {
          if (fl[i] <= 0) continue;
          fl[i] -= dt;
          const kk = Math.max(0, Math.min(1, fl[i] / 1.2));
          fv[i * 3 + 1] -= 3.2 * dt;
          const d = Math.exp(-1.4 * dt);
          fv[i * 3] *= d;
          fv[i * 3 + 1] *= d;
          fv[i * 3 + 2] *= d;
          fp[i * 3] += fv[i * 3] * dt;
          fp[i * 3 + 1] += fv[i * 3 + 1] * dt;
          fp[i * 3 + 2] += fv[i * 3 + 2] * dt;
          fc[i * 3] = fbase[i * 3] * kk;
          fc[i * 3 + 1] = fbase[i * 3 + 1] * kk;
          fc[i * 3 + 2] = fbase[i * 3 + 2] * kk;
          if (fl[i] <= 0) fp[i * 3 + 1] = -999;
        }
        fpa.needsUpdate = true;
        fca.needsUpdate = true;
        wheel.rotation.z = t * 0.06;
        for (let i = 0; i < 28; i++) {
          const a = t * 0.06 + (i / 28) * Math.PI * 2;
          m.compose(p.set(56 + Math.cos(a) * 20, 14 + Math.sin(a) * 20 - 1, wz), q, sc);
          pods.setMatrixAt(i, m);
        }
        pods.instanceMatrix.needsUpdate = true;
      },
    };
  },
};
