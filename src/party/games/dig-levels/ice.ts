/**
 * ICE CAVE (ZStreet, a winter night): the ground under Central Park, frozen through. No steel slabs:
 * three GALLERIES instead, each across the two lanes of a half (the middle wall stands), floored
 * with slick blue ice. A step onto the ice
 * glides on until a block, a rival or a drop stops it (a glide into a rival SLAMS it on along the
 * ice), and patches of packed snow are the brakes. Under the first gallery's two snow lids (at the
 * outer edges) a chute drops two rows for free, under the second's (in the walls between the
 * lanes) a well drops two: the two miners of each half race for the same few cells. A hole dug in
 * a gallery's ice freezes over behind its digger. Icicles hang in the galleries (they shake,
 * then drop on whoever stopped under them), meltwater pockets freeze whoever is in the way, and from
 * 24 s the ICEFALL shakes ice loose over the leaders.
 */
import * as THREE from "three";
import { GEO, canvasTex, glow, label, skyDome, skyline, toon } from "../../k3";
import { SNOW_CITY, cityGrid, ground } from "../sign-levels/vista";
import { halos } from "./props";
import { AMETH, CLAY, DIRT, EMPTY, GRANITE, GRASS, ICE, LAVA, MAGMA, QB, ROWS, SNOW, STONE, colX, type DigLevel, type GenKit } from "./common";

/** The galleries: the open row; its floor (ice) is the row under. */
const G1 = 8;
const G2 = 19;
const G3 = 28;

/** A gallery across the left half's two lanes (the wall between them too, not the middle one): the row open, the ice floor under it. */
function gallery(k: GenKit, row: number) {
  for (let c = 0; c < 5; c++) {
    k.set(c, row, EMPTY);
    k.set(c, row + 1, ICE);
  }
}

export const ICE_CAVE: DigLevel = {
  key: "ice",
  title: "ICE CAVE",
  titleZh: "冰洞",
  tag: "Under Central Park in the snow: glide along the ice galleries, slam rivals, race for the snow lids",
  tagZh: "雪中的中央公园地下：沿冰廊滑行、撞飞对手、抢雪盖",
  song: "frost",
  ambience: "cave",
  sky: ["#0e1640", "#5a6fb8"],
  fog: [120, 420],
  fill: ["#9fc8ff", 0.55],
  shade: 0.85,
  night: true,
  hemi: ["#cfe0ff", "#3a3a66", 1.65],
  sun: ["#c8d8ff", 1.35],
  layers: [
    { to: 1, mat: GRASS, en: "SNOW", zh: "积雪", c: "#f4f8ff", c2: "#e2ecfa", wall: "#7a8cb8", ore: ["#ffffff"] },
    { to: 4, mat: DIRT, en: "SNOWPACK", zh: "压实雪", c: "#dfe8f6", c2: "#cfdaec", wall: "#5a6a90", ore: ["#ffffff", "#b8c8e0"] },
    { to: 9, mat: CLAY, en: "FROZEN SOIL", zh: "冻土", c: "#a08a7c", c2: "#8f796c", wall: "#3e302c", ore: ["#e6f0fa", "#6a5a50", "#c9d6e2"] },
    { to: 20, mat: STONE, en: "GLACIAL TILL", zh: "冰碛土", c: "#7fb8cc", c2: "#6ca6bc", wall: "#22485a", ore: ["#e6f8ff", "#bfe6f2"] },
    { to: 29, mat: AMETH, en: "FROST STONE", zh: "霜岩", c: "#8e9ed0", c2: "#7d8dc0", wall: "#262f5e", ore: ["#ffffff"], shine: ["#bfefff", "#ffffff"] },
    { to: ROWS, mat: MAGMA, en: "DEEP FROST", zh: "深层冻岩", c: "#4d5d9c", c2: "#42518c", wall: "#121836", ore: ["#2a3462"], shine: ["#7fe8ff", "#d8f8ff"] },
  ],
  walls: [2, 5, 8],
  slabs: [],
  galleries: [G1, G2, G3],
  ice: true,
  quake: ["ICEFALL! WATCH THE ROOF!", "冰崩！小心头顶！"],
  pool: {
    en: "MELTWATER!",
    zh: "融水！",
    tex: ["#2f8fd6", "#7fd4ff", "#d6f6ff", "#1a5a96"],
    hurt: ["FROZEN!", "冻住了！"],
    hurtC: "#8af0ff",
    bits: ["#ffffff", "#bfefff", "#7fd4ff"],
    cool: ICE,
    sparks: ["#ffffff", "#bfefff"],
    steam: ["#ffffff", "#e6f6ff", "#9fdcff"],
  },
  pal: {
    granite: ["#5a6f9a", "#647aa8"],
    obsid: ["#3a4a7a", "#44558a"],
    crumb: ["#e6eef8", "#f2f7fc"],
    hot: ["#a8331f", "#bb3f27"],
    ice: ["#8fd2ff", "#a6dcff"],
    snow: ["#eef4fc", "#ffffff"],
  },
  rock: "#c4d4ec",
  top: "#f4f8ff",
  isle: ["#5e6684", "#f4f8ff"],
  crown: "fir",
  fence: ["#9cc8f0", "#cfe8ff", "#ffffff"],
  wood: ["#5a4232", "#6e5240"],
  sign: ["#bfe8ff", "#3f6ea8", "#13285a"],
  says: { 2: ["FROZEN SOIL · 3 HITS", "冻土 · 三下", "#ffffff"], 3: ["GLACIAL TILL · 4 HITS", "冰碛土 · 四下", "#bfefff"], 4: ["FROST STONE · 5 HITS", "霜岩 · 五下", "#ffffff"], 5: ["DEEP FROST · MIND THE MELTWATER!", "深层冻岩 · 小心融水！", "#8af0ff"] },
  caveSay: ["ICE GALLERY! ◀ ▶ GLIDE TO THE SNOW", "冰廊！◀ ▶ 滑到雪盖上", "#8af0ff"],

  gen(k) {
    const { set, pick, any, vein, boulder, nonce } = k;
    const A = [0, 1];
    const B = [3, 4];
    // SNOWPACK (1…3), FROZEN SOIL (4…7)
    boulder(pick(A), any(2, 3));
    boulder(pick(B), any(3, 4));
    nonce(2, any(3, 5));
    vein(pick(A), 5, 6);
    vein(pick(B), 6, 7);
    // GALLERY 1: a snow lid at the outer edge, a chute under it (a nonce where it lands)
    gallery(k, G1);
    set(0, G1 + 1, SNOW);
    for (let r = G1 + 2; r <= G1 + 3; r++) set(0, r, EMPTY);
    nonce(0, G1 + 4);
    k.stal(2, G1, G1);
    // GLACIAL CLAY (10…18)
    for (const L of [A, B]) {
      const c = L === A ? 1 : pick(B);
      const r = any(13, 15);
      set(c, r, GRANITE);
      set(c, r + 1, GRANITE);
      vein(L[0] + L[1] - c, r, r + 1);
    }
    nonce(5, any(12, 14));
    boulder(pick(B), any(10, 11));
    // GALLERY 2: a well down the wall between the two lanes, its snow lid
    gallery(k, G2);
    set(2, G2 + 1, SNOW);
    k.open(2, G2 + 1);
    for (let r = G2 + 2; r <= G2 + 3; r++) set(2, r, EMPTY);
    k.stal(4, G2, G2);
    // FROST STONE (21…27)
    for (const L of [A, B]) {
      const c = pick(L);
      const r = any(22, 25);
      set(c, r, GRANITE);
      set(c, r + 1, GRANITE);
      vein(L[0] + L[1] - c, r, r + 1);
    }
    nonce(2, any(22, 24));
    boulder(pick(A), any(25, 26));
    // GALLERY 3: a nonce crate standing on the ice between the lanes (it stops a glide), an icicle
    gallery(k, G3);
    set(2, G3, QB);
    k.open(2, G3);
    k.stal(pick([0, 4]), G3, G3);
    // DEEP FROST (30…39): a meltwater pocket in each lane, slush round it
    const pocket = (L: number[], r: number) => {
      const c = pick(L);
      const o = L[0] + L[1] - c;
      set(c, r, LAVA);
      set(c, r + 1, SNOW);
      set(o, r, SNOW);
      set(o, r + 1, SNOW);
    };
    const first = k.R() < 0.5;
    pocket(A, first ? any(32, 33) : any(35, 37));
    pocket(B, first ? any(35, 37) : any(32, 33));
    {
      const L = pick([0, 1]) ? A : B;
      const a = any(33, 34);
      vein(pick(L), a, a + 1);
    }
    nonce(5, any(36, 38));
  },

  /**
   * A snowy top (firs, snowmen, a pavilion), ZStreet by night far below: its towers lit, the NU7
   * TOWER with its golden crown, the ZK MALL's great tent; an aurora over it all.
   */
  scenery(k) {
    const { put, cos, deco, lights, cones, scene } = k;
    const EW = (5.5 + 1.6) * 2;
    // firs: three cones each, snow on the tips
    for (let i = 0; i < 9; i++) {
      const fx = (cos() - 0.5) * (EW - 1.2);
      const fz = -2.2 - cos() * 2.6;
      const fs = 0.7 + cos() * 0.6;
      put(deco, fx, 0.2 * fs, fz, 0.18 * fs, 0.4 * fs, 0.18 * fs, "#5a3e2a");
      for (let t = 0; t < 3; t++) {
        const w = (1.1 - t * 0.28) * fs;
        cones.push({ x: fx, y: (0.55 + t * 0.42) * fs, z: fz, w, h: 0.7 * fs, d: w, c: t === 2 ? "#e8f2ff" : i % 2 ? "#2f6a4a" : "#2a5e44" });
      }
    }
    // snowmen (voxel balls), carrot noses, hats
    for (const [sx, sz] of [
      [-4.6, -1.6],
      [3.8, -3.4],
    ]) {
      put(deco, sx, 0.32, sz, 0.62, 0.56, 0.62, "#f6faff");
      put(deco, sx, 0.82, sz, 0.46, 0.44, 0.46, "#f6faff");
      put(deco, sx, 1.18, sz, 0.34, 0.32, 0.34, "#f6faff");
      put(deco, sx, 1.18, sz + 0.24, 0.07, 0.07, 0.2, "#ff8a2a");
      put(deco, sx, 1.4, sz, 0.36, 0.06, 0.36, "#1a1a2a");
      put(deco, sx, 1.52, sz, 0.24, 0.22, 0.24, "#1a1a2a");
      put(deco, sx, 0.86, sz + 0.2, 0.5, 0.08, 0.1, "#d8304a");
    }
    // a pavilion: white walls, a band, a domed roof (in Zcash green)
    put(deco, -1.6, 0.45, -3.9, 1.6, 0.9, 1.6, "#f2ead8");
    put(deco, -1.6, 0.7, -3.9, 1.64, 0.16, 1.64, "#2fb877");
    cones.push({ x: -1.6, y: 1.2, z: -3.9, w: 1.9, h: 0.7, d: 1.9, c: "#2fb877" });
    put(deco, -1.6, 0.35, -3.08, 0.4, 0.7, 0.05, "#2fb877");
    // snow drifts and ice crystals on the top
    for (let i = 0; i < 12; i++) put(deco, (cos() - 0.5) * (EW - 0.4), 0.16, -0.8 - cos() * 3.8, 0.5 + cos() * 0.6, 0.18, 0.4 + cos() * 0.4, "#ffffff");
    for (let i = 0; i < 6; i++) put(lights, (cos() - 0.5) * (EW - 1), 0.3, -0.9 - cos() * 3.4, 0.12, 0.42, 0.12, "#bff4ff", 0, (cos() - 0.5) * 0.6);
    // icicles along the rims' fronts
    for (let i = 0; i < 16; i++) {
      const side = i % 2 ? 1 : -1;
      put(lights, side * (5.5 + 0.2 + cos() * 1.2), -0.12 - cos() * 0.1, 0.56, 0.08, 0.3 + cos() * 0.3, 0.06, "#dff6ff");
    }
    // the night all round: stars, the galaxy's band, the moon low to the right
    skyDome(scene, { sky: ["#0e1640", "#5a6fb8"], ground: "#5a6fb8", stars: 700, band: true, disc: { az: 305, el: 9, moon: true, size: 6 }, haze: 0.45, rnd: cos });
    // the city by night far below, lit: its blocks under the snow, its towers closer in round the island
    ground(scene, -136, "#31447e");
    const town = cityGrid(scene, {
      y: -135,
      x0: -384,
      x1: 384,
      z0: -560,
      z1: -128,
      pitch: 32,
      street: 9,
      keep: (x, z) => !(Math.abs(x - 58) < 30 && Math.abs(z + 150) < 30) && !(Math.abs(x + 70) < 44 && Math.abs(z + 175) < 40),
      tall: (x, z) => 14 + 46 * Math.exp(-(x * x) / 40000) * Math.exp(-((z + 300) * (z + 300)) / 30000),
      rnd: cos,
      look: SNOW_CITY,
      cars: 70,
      carSize: 3.2,
      parks: 0.16,
    });
    skyline(scene, { r: 170, y: -135, tall: 1.5, rnd: cos, night: true });
    // the NU7 TOWER: a pale lilac trunk, fins up round a golden crown, its name down the front
    const bay = new THREE.Group();
    const white = toon("#e4dcfa");
    const trunk = new THREE.Mesh(GEO.box, white);
    trunk.scale.set(5, 70, 5);
    trunk.position.y = 35;
    bay.add(trunk);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const br = new THREE.Mesh(GEO.box, white);
      br.scale.set(1.6, 18, 1.6);
      br.position.set(Math.cos(a) * 5, 76, Math.sin(a) * 5);
      br.rotation.set(Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35);
      bay.add(br);
    }
    const ball = new THREE.Mesh(GEO.ball, glow("#ffc23a"));
    ball.scale.setScalar(15);
    ball.position.y = 84;
    bay.add(ball);
    const nu7 = label("NU7", 4.4, "#6a3fc0");
    nu7.position.set(0, 58, 2.6);
    bay.add(nu7);
    bay.position.set(58, -135, -150);
    scene.add(bay);
    // the ZK MALL's great tent, lit from inside
    const tent = new THREE.Mesh(GEO.cone, glow("#ffd9a0", 0.85));
    tent.scale.set(40, 70, 30);
    tent.position.set(-70, -100, -175);
    tent.rotation.z = 0.12;
    scene.add(tent);
    // the aurora: soft green and violet curtains high behind
    const tex = canvasTex(
      16,
      128,
      (g) => {
        const gr = g.createLinearGradient(0, 0, 0, 128);
        gr.addColorStop(0, "rgba(255,255,255,0)");
        gr.addColorStop(0.55, "rgba(255,255,255,0.75)");
        gr.addColorStop(1, "rgba(255,255,255,0)");
        g.fillStyle = gr;
        g.fillRect(0, 0, 16, 128);
      },
      false,
    );
    const aurora: THREE.MeshBasicMaterial[] = [];
    for (let i = 0; i < 4; i++) {
      const mat = new THREE.MeshBasicMaterial({ map: tex, color: i % 2 ? "#6affc8" : "#a07aff", transparent: true, opacity: 0.38, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
      const m = new THREE.Mesh(GEO.plane, mat);
      m.scale.set(150 + i * 30, 60, 1);
      m.position.set(-90 + i * 60, 40 + (i % 2) * 18, -320);
      m.rotation.set(0, 0, (cos() - 0.5) * 0.3);
      scene.add(m);
      aurora.push(mat);
    }
    // a shooting star now and then, the crown's glow, the mall's
    const sphereGlow = halos(scene, [
      [58, -51, -150, 60, "#ffb030"],
      [-70, -100, -175, 70, "#ffcc80"],
    ]);
    const shoot = new THREE.Mesh(GEO.box, new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0, fog: false, depthWrite: false, blending: THREE.AdditiveBlending }));
    shoot.scale.set(26, 0.5, 0.5);
    scene.add(shoot);
    let shootT = 3;
    let sx = 0;
    let sy = 0;
    // each frame: snow falling round the camera, the aurora breathing, the sky alive
    let snowT = 0;
    return (t) => {
      snowT -= t.dt;
      if (snowT <= 0) {
        snowT = 0.05;
        t.burst(colX(Math.random() * 11) * 1.6, t.camY + 6.5, -0.6 + Math.random() * 2.4, 1, SNOWFLAKE, FLAKE);
      }
      for (let i = 0; i < aurora.length; i++) aurora[i].opacity = 0.28 + 0.14 * Math.sin(t.now * 0.7 + i * 1.7);
      town.tick(t.now);
      sphereGlow(t.now);
      shootT -= t.dt;
      const sm = shoot.material as THREE.MeshBasicMaterial;
      if (shootT <= 0) {
        shootT = 5 + Math.random() * 6;
        sx = -160 + Math.random() * 200;
        sy = 30 + Math.random() * 60;
      }
      const k = 1 - shootT / 1.2;
      if (shootT < 1.2 && shootT > 0) {
        shoot.position.set(sx + k * 140, sy - k * 50, -330);
        shoot.rotation.z = -0.34;
        sm.opacity = Math.sin(Math.PI * Math.min(1, k)) * 0.9;
      } else sm.opacity = 0;
    };
  },
};

const SNOWFLAKE = ["#ffffff", "#e6f2ff"];
const FLAKE = { speed: 0.4, up: 0, gravity: 1.2, size: 0.07, life: 4.5, drag: 0.6 };
