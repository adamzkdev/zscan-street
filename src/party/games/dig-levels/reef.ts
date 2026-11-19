/**
 * SUNKEN REEF (sunset off Marina Bay): a chunk of seabed floating over the sea, the bay's towers and
 * its glowing grove on the skyline. Only the middle wall stands: the ground is two wide TRENCHES,
 * two miners in each, split down the middle by pink BRAIN CORAL (seven hits) with swim-throughs in
 * it. A sunken junk lies across each trench (its deck, its hold open across both lanes, a chest on
 * its floor, its steel hull with one gap a lane), a steel keel lower down. From 12 s the TIDE comes up from
 * the GENESIS block (faster from 32 s): under it each miner's air runs down (a bubble bar over its
 * head), AIR pockets (blue bubble blocks, one hit) fill it, and out of air it gasps (dazed). Lava
 * still oozes in the basalt; there is no quake: the tide is the squeeze.
 */
import * as THREE from "three";
import { GEO, clouds, glow, skyDome, toon } from "../../k3";
import { DAY_CITY, boxes, cityGrid, cloudDeck, swell } from "../sign-levels/vista";
import { bobbers, flock } from "./props";
import { AIR, AMETH, BEDROCK, CLAY, CRUMB, DIRT, EMPTY, GRANITE, GRASS, HOT, colX, midY, LAVA, LAVA_POOL, MAGMA, ROWS, STONE, type Box, type DigLevel } from "./common";

/** The wreck: its deck, the hold under it (two rows), the hull's steel; the keel lower down. */
const WRECK = 15;
const HULL = 18;
const KEEL = 24;

export const REEF: DigLevel = {
  key: "reef",
  title: "SUNKEN REEF",
  titleZh: "沉没珊瑚礁",
  tag: "Off Marina Bay at sunset: two shared trenches, and the tide rising — break AIR bubbles or gasp",
  tagZh: "日落时分的滨海湾外海：两条共用海沟，潮水上涨——打破气泡，否则窒息",
  song: "marina",
  ambience: "sea",
  sky: ["#3a3a8e", "#ffad7a"],
  fog: [110, 400],
  fill: ["#8fb0ff", 0.45],
  hemi: ["#ffe2c8", "#5a4a7a", 1.75],
  sun: ["#ffc89a", 1.95],
  layers: [
    { to: 1, mat: GRASS, en: "BEACH", zh: "沙滩", c: "#f6e2a6", c2: "#ecd38f", wall: "#8a7448", ore: ["#ffffff"] },
    { to: 9, mat: DIRT, en: "SEABED SAND", zh: "海床沙", c: "#e8c98a", c2: "#dcb977", wall: "#6a5030", ore: ["#ffffff", "#f6a8b8", "#c9a070"] },
    { to: WRECK, mat: CLAY, en: "CORAL", zh: "珊瑚", c: "#ff8f86", c2: "#f27a74", wall: "#6a2438", ore: ["#ffe0e8", "#ffd23f"], shine: ["#ff9ad0", "#ffd2a0"] },
    { to: KEEL, mat: STONE, en: "LIMESTONE", zh: "石灰岩", c: "#e6d9b8", c2: "#d6c7a2", wall: "#5a4e38", ore: ["#fff8e6", "#c9b48a"] },
    { to: 32, mat: AMETH, en: "PEARL ROCK", zh: "珍珠岩", c: "#b9b2e2", c2: "#a79ed6", wall: "#3a3466", ore: ["#ffffff"], shine: ["#ffffff", "#ffe6fa"] },
    { to: ROWS, mat: MAGMA, en: "BASALT", zh: "玄武岩", c: "#47626e", c2: "#3c5662", wall: "#141e26", ore: ["#22323a"], shine: ["#ff7a1a", "#ffb02e"] },
  ],
  walls: [5],
  slabs: [HULL, KEEL],
  tide: { delay: 12, rate: 0.42, rate2: 0.7, fast: 32, top: 4 },
  pool: LAVA_POOL,
  pal: {
    granite: ["#e0609a", "#ec74ab"],
    obsid: ["#2a3a48", "#334656"],
    crumb: ["#a0703e", "#b07c46"],
    hot: ["#a8331f", "#bb3f27"],
    ice: ["#9fd8ff", "#b6e4ff"],
    snow: ["#f6faff", "#ffffff"],
  },
  rock: "#ffb4a0",
  top: "#f6e2a6",
  isle: ["#c9a070", "#f6e2a6"],
  crown: "palm",
  fence: ["#7a5a3a", "#d8b07a", "#ff6b5a"],
  wood: ["#7a5a3a", "#9a7048"],
  sign: ["#5fd8ff", "#1f7ab0", "#0c2a4a"],
  says: { 2: ["CORAL · 3 HITS", "珊瑚 · 三下", "#ffb0c0"], 3: ["LIMESTONE · 4 HITS", "石灰岩 · 四下", "#ffffff"], 5: ["BASALT · MIND THE LAVA!", "玄武岩 · 小心岩浆！", "#ff8a3c"] },

  /**
   * The left trench is columns 0…4 (lanes 0, 1 and 3, 4), the brain coral down column 2 between
   * them from the coral to the pearl rock, with swim-throughs (and an air pocket) in it, broken by
   * the wreck lying across the trench.
   */
  gen(k) {
    const { set, pick, any, vein, boulder, nonce, slab } = k;
    const A = [0, 1];
    const B = [3, 4];
    // SEABED SAND (1…8): coral heads, a nonce in the open sand between the two
    boulder(pick(A), any(2, 3));
    boulder(pick(B), any(3, 4));
    nonce(2, any(4, 6));
    // CORAL (9…14): the brain coral down the middle (from row 8), a swim-through in it
    for (let r = 8; r < WRECK; r++) set(2, r, GRANITE);
    set(2, any(10, 12), EMPTY);
    for (const L of [A, B]) {
      const c = pick(L);
      const r = any(9, 12);
      set(c, r, GRANITE);
      set(c, r + 1, GRANITE);
      vein(L[0] + L[1] - c, r, r + 1);
    }
    nonce(5, any(10, 13));
    // THE WRECK (15…18): its deck (old planks), the hold open across the trench, a chest on the
    // hull's floor in the middle, the hull's steel with one gap a lane
    for (let c = 0; c < 5; c++) {
      set(c, WRECK, CRUMB);
      set(c, WRECK + 1, EMPTY);
      set(c, WRECK + 2, EMPTY);
    }
    nonce(2, WRECK + 2);
    slab(HULL);
    set(2, HULL, BEDROCK);
    // LIMESTONE (19…23): the brain coral again, an air pocket in it
    for (let r = HULL + 1; r < 30; r++) if (r !== KEEL) set(2, r, GRANITE);
    set(2, any(20, 22), AIR);
    set(2, any(27, 28), EMPTY);
    set(pick(A), any(20, 22), GRANITE);
    set(pick(B), any(20, 22), GRANITE);
    vein(pick(A), 22, 23);
    // the KEEL
    slab(KEEL);
    set(2, KEEL, BEDROCK);
    // PEARL ROCK (25…31): an air pocket in each lane, one in the middle wall
    set(pick(A), any(26, 27), AIR);
    set(pick(B), any(28, 29), AIR);
    set(5, any(29, 31), AIR);
    for (const L of [A, B]) {
      const c = pick(L);
      const r = any(29, 30);
      set(c, r, GRANITE);
      vein(L[0] + L[1] - c, r, r + 1);
    }
    // BASALT (32…39): air pockets lower down, a lava pocket, hot rock round it
    set(pick(A), any(33, 34), AIR);
    set(pick(B), any(33, 34), AIR);
    set(pick(A), any(37, 38), AIR);
    set(pick(B), any(37, 38), AIR);
    {
      const L = pick([0, 1]) ? A : B;
      const c = pick(L);
      const o = L[0] + L[1] - c;
      const r = any(35, 36);
      set(c, r, LAVA);
      set(c, r + 1, HOT);
      set(o, r, HOT);
      set(o, r + 1, HOT);
    }
    nonce(2, any(35, 37));
    nonce(5, any(36, 38));
  },

  /**
   * The beach on top (palms, a striped umbrella, a lifebuoy, crabs), the sea far below, the bay's
   * three towers with their sky park and the glowing grove on the skyline, a low sun.
   */
  scenery(k) {
    const { put, cos, deco, lights, cones, scene } = k;
    const EW = (5.5 + 1.6) * 2;
    // palms: a leaning trunk of blocks, a crown of fronds, coconuts
    for (const [px, pz, lean] of [
      [-5.8, -2.0, -0.25],
      [5.4, -3.4, 0.3],
      [2.2, -4.6, -0.15],
    ]) {
      for (let i = 0; i < 7; i++) put(deco, px + lean * i * 0.32, 0.2 + i * 0.4, pz, 0.32 - i * 0.015, 0.42, 0.32 - i * 0.015, i % 2 ? "#a8784a" : "#94683e", 0, -lean * 0.5);
      const tx = px + lean * 7 * 0.32;
      const ty = 0.2 + 7 * 0.4;
      for (let f = 0; f < 6; f++) {
        const a = (f / 6) * Math.PI * 2;
        put(deco, tx + Math.cos(a) * 0.7, ty - 0.12, pz + Math.sin(a) * 0.7, 1.5, 0.1, 0.42, f % 2 ? "#3fae4a" : "#52c25a", Math.sin(a) * 0.5, -Math.cos(a) * 0.5);
      }
      put(deco, tx, ty - 0.3, pz + 0.2, 0.2, 0.2, 0.2, "#6a4a2a");
      put(deco, tx + 0.2, ty - 0.32, pz - 0.1, 0.2, 0.2, 0.2, "#6a4a2a");
    }
    // a striped umbrella and a towel, a lifebuoy, crabs, shells
    put(deco, -2.4, 0.9, -1.8, 0.07, 1.8, 0.07, "#ffffff");
    cones.push({ x: -2.4, y: 1.9, z: -1.8, w: 2.0, h: 0.5, d: 2.0, c: "#ff5a6a" });
    cones.push({ x: -2.4, y: 1.92, z: -1.8, w: 1.2, h: 0.36, d: 1.2, c: "#ffffff" });
    put(deco, -1.6, 0.16, -1.3, 1.2, 0.04, 0.6, "#5fd8ff");
    put(deco, 3.4, 0.2, -1.2, 0.7, 0.14, 0.7, "#ff5a3a");
    put(deco, 3.4, 0.22, -1.2, 0.36, 0.16, 0.36, "#f6e2a6");
    for (let i = 0; i < 4; i++) {
      const cx = (cos() - 0.5) * (EW - 2);
      const cz = -0.9 - cos() * 3.5;
      put(deco, cx, 0.2, cz, 0.36, 0.14, 0.24, "#ff4a3a");
      for (const sx of [-1, 1]) put(deco, cx + sx * 0.24, 0.26, cz + 0.08, 0.1, 0.1, 0.1, "#ff4a3a");
    }
    for (let i = 0; i < 14; i++) put(deco, (cos() - 0.5) * (EW - 0.6), 0.17, -0.7 - cos() * 4, 0.14, 0.08, 0.12, ["#ffffff", "#ffb0c0", "#ffe0a0"][i % 3]);
    // seaweed and starfish on the rims (the sea's edge)
    for (let i = 0; i < 10; i++) {
      const side = i % 2 ? 1 : -1;
      put(lights, side * (5.5 + 0.3 + cos() * 1.1), -1.2 - cos() * 30, 0.55, 0.14, 0.14, 0.05, cos() < 0.5 ? "#ffb02e" : "#ff7aa8", 0, Math.PI / 4);
    }
    // the wrecks' holds: dark planks behind, ribs across
    for (const side of [-1, 1]) {
      const cx = side * (colX(0) + colX(4)) * -0.5;
      put(k.earth, cx, midY(WRECK + 1) - 0.5, -0.49, 5, 2, 0.02, "#3a2416");
      for (let c = 0; c < 5; c++) put(deco, side < 0 ? colX(c) : -colX(c), midY(WRECK + 1) - 0.5, -0.44, 0.12, 2, 0.06, "#6a4426");
      put(lights, cx, midY(WRECK + 1) + 0.3, -0.42, 0.22, 0.26, 0.1, "#ffc23a");
    }
    // the sky: sunset all round, the sun low over the water to the left of the bay
    skyDome(scene, { sky: ["#3a3a8e", "#ffad7a"], ground: "#ffad7a", clouds: 14, cloud: "#ffd9c0", cloudShade: "#b8688c", disc: { az: 252, el: 4.5, color: "#fff0c0", size: 9, glow: 6 }, haze: 0.5, rnd: cos });
    // the sea far below, its swell rolling in
    const sea = new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ color: "#2a7fbf" }));
    sea.rotation.x = -Math.PI / 2;
    sea.scale.set(1760, 1760, 1);
    sea.position.y = -95;
    sea.userData.noShadow = true;
    scene.add(sea);
    const rollers = swell(scene, { n: 110, x0: -300, x1: 300, z0: -330, z1: -30, y: -94.7, rnd: cos, color: "#8fd0f2", len: [10, 34], wide: 1.5, speed: 2.2, opacity: 0.6 });
    // the bay's shore behind: the city on its quay (its windows coming on), where the old ring of towers stood
    boxes(scene, [
      ["#d9c8a0", 760, 3, 250, 0, -95.5, -318],
      ["#bfae88", 764, 1.2, 6, 0, -94.6, -193],
    ]);
    const town = cityGrid(scene, {
      y: -94,
      x0: -352,
      x1: 352,
      z0: -420,
      z1: -212,
      pitch: 32,
      street: 9,
      keep: (x, z) => !(Math.abs(x - 62) < 44 && z > -230),
      tall: (x, z) => 18 + 56 * Math.exp(-((x + 40) * (x + 40)) / 36000) * Math.exp(-((z + 300) * (z + 300)) / 20000),
      rnd: cos,
      look: { ...DAY_CITY, street: "#8a7a8e", win: ["#ffe2a0", "#8a6a8c"], lit: 0.5, shine: 0.55, trees: ["#3f9a52", "#52ae5a"] },
      cars: 50,
      carSize: 3.2,
      parks: 0.12,
    });
    // the three towers on their podium, the boat-shaped sky park across their tops
    const tw = toon("#e2dccf");
    const grp = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const t = new THREE.Mesh(GEO.box, tw);
      t.scale.set(9, 92, 12);
      t.position.set(i * 16 - 16, 46, 0);
      t.rotation.z = (i - 1) * 0.02;
      grp.add(t);
    }
    const park = new THREE.Mesh(GEO.box, toon("#cfd8e0"));
    park.scale.set(62, 4, 13);
    park.position.set(4, 94, 0);
    grp.add(park);
    const podium = new THREE.Mesh(GEO.box, tw);
    podium.scale.set(50, 10, 20);
    podium.position.set(-2, 5, 4);
    grp.add(podium);
    grp.position.set(62, -95, -170);
    grp.rotation.y = -0.35;
    scene.add(grp);
    // the grove: trunks of light, canopies like open umbrellas
    for (let i = 0; i < 5; i++) {
      const gx = -70 + i * 13 + (cos() - 0.5) * 6;
      const gz = -150 - cos() * 20;
      const h = 30 + cos() * 22;
      const trunk = new THREE.Mesh(GEO.cone, glow(i % 2 ? "#ff5fd2" : "#a05fff"));
      trunk.scale.set(4, h, 4);
      trunk.rotation.x = Math.PI;
      trunk.position.set(gx, -95 + h / 2, gz);
      scene.add(trunk);
      const cap = new THREE.Mesh(GEO.box, glow(i % 2 ? "#ffd25f" : "#5fe8ff"));
      cap.scale.set(14, 1.4, 14);
      cap.position.set(gx, -95 + h, gz);
      scene.add(cap);
    }
    const cl = clouds(scene, { n: 3, r: 140, y: 10, rnd: cos });
    const deck = cloudDeck(scene, { n: 10, x0: -280, x1: 280, y0: -70, y1: -44, z0: -330, z1: -90, rnd: cos, color: "#ffd2b8", shade: "#b06a8a", speed: 1, size: 2.4 });
    // a glitter path on the water under the sun
    const glint: (Box & { g: number })[] = [];
    for (let i = 0; i < 18; i++) glint.push({ x: -120 + (cos() - 0.5) * 30 * (1 + i * 0.1), y: -94.8, z: -360 + i * 14, w: 5 + cos() * 6, h: 0.1, d: 1.2, c: "#ffe6b0", g: i });
    const glitter = bobbers(scene, glint, 0.25);
    // junks and yachts on the bay, gulls wheeling
    const boats: THREE.Group[] = [];
    for (let i = 0; i < 4; i++) {
      const b = new THREE.Group();
      const hull = new THREE.Mesh(GEO.box, toon(i % 2 ? "#7a3a2a" : "#ffffff"));
      hull.scale.set(7, 1.6, 2.4);
      b.add(hull);
      const sail = new THREE.Mesh(GEO.box, toon(i % 2 ? "#d8402a" : "#5fd8ff"));
      sail.scale.set(4.2, 6, 0.2);
      sail.position.set(0.4, 4, 0);
      b.add(sail);
      b.position.set(0, -94, 0);
      b.userData.r = 90 + i * 35;
      b.userData.a = cos() * 6;
      b.userData.v = (i % 2 ? 1 : -1) * (0.012 + cos() * 0.01);
      scene.add(b);
      boats.push(b);
    }
    const gulls = flock(scene, 6, -10, -12, -45, 40, "#ffffff", 0.09, 0.9);
    const gulls2 = flock(scene, 4, 20, -30, -60, 55, "#f6f6f6", -0.07, 1.1);
    // each frame: the sea glinting, the boats sailing, bubbles up through the tide, fish by the rims
    const seaMat = sea.material as THREE.MeshBasicMaterial;
    const base = new THREE.Color("#2a7fbf");
    const hi = new THREE.Color("#3f9ad4");
    let bubT = 0;
    let fishT = 2;
    return (t) => {
      seaMat.color.copy(base).lerp(hi, 0.5 + 0.5 * Math.sin(t.now * 0.8));
      rollers.tick(t.now);
      town.tick(t.now);
      deck.tick(t.now);
      glitter(t.now * 3);
      gulls(t.now);
      gulls2(t.now);
      cl.rotation.y = t.now * 0.003;
      for (const b of boats) {
        const a = b.userData.a + t.now * b.userData.v;
        b.position.x = Math.cos(a) * b.userData.r;
        b.position.z = -200 + Math.sin(a) * b.userData.r * 0.6;
        b.rotation.y = -a + (b.userData.v > 0 ? 0 : Math.PI);
        b.rotation.z = Math.sin(t.now * 1.1 + a) * 0.05;
      }
      if (t.tideY > -60) {
        bubT -= t.dt;
        if (bubT <= 0) {
          bubT = 0.07;
          const y = -ROWS + Math.random() * Math.max(0.5, t.tideY + ROWS - 0.5);
          if (Math.abs(y - t.camY) < 8) t.burst((Math.random() - 0.5) * 14, y, 0.66, 1, BUBBLE_C, RISE);
        }
        fishT -= t.dt;
        if (fishT <= 0 && t.tideY > -ROWS + 2) {
          fishT = 1.2 + Math.random() * 2;
          const side = Math.random() < 0.5 ? -1 : 1;
          const y = Math.max(-ROWS + 0.6, Math.min(t.tideY - 0.6, t.camY + (Math.random() - 0.5) * 7));
          t.burst(side * (6.3 + (Math.random() - 0.5) * 1.2), y, 0.7, 3, FISH, FISH_SWIM);
        }
      }
    };
  },
};

const BUBBLE_C = ["#e6fbff", "#bff0ff"];
const RISE = { speed: 0.2, up: 1.4, gravity: -2.5, size: 0.07, life: 1.6, drag: 0.8 };
const FISH = ["#ffb02e", "#ff7aa8", "#5fe8ff"];
const FISH_SWIM = { speed: 1.2, up: 0.1, gravity: 0, size: 0.13, life: 1.4, drag: 0.2 };
