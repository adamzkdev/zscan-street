/**
 * INSCRIBE!'s boards as data (turf.ts plays them): each a layout (16 × 16 cells: tiles, walls, gates,
 * nothing), its sky and light, its twist, and the scenery round it.
 *
 * - SKY SLAB: the open square board over the city at dusk (the first one, as it always was).
 * - ZK CEMETERY: a walled crypt yard floating over ZStreet at night, among the tombs of the transparent
 *   addresses the TRACKER linked. Stone walls make lanes; the crypt in the middle is the shielded room. Every 7.5 s the
 *   GATES SHIFT: one set of gate tiles rises into walls (flashing red first), the other sinks open; a
 *   risen gate keeps its ink but can't be inscribed.
 * - BAY PIER: a round deck on the sea of The Bay, turning slowly (it carries you).
 *   The sea sends a WAVE now and then: it swells over the rim of the fullest wedge (that wedge flashes
 *   cyan), then sweeps it, washing its tiles back to blank stone and pushing whoever stands there.
 */
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { GEO, canvasTex, glow, qBlock, skyline, toon, toonSteps, type Fx3 } from "../../k3";
import type { AmbienceKind } from "../../../audio/kinds";

export type LevelKey = "slab" | "crypt" | "pier";

export interface TurfLevel {
  key: LevelKey;
  title: string;
  titleZh: string;
  tag: string;
  tagZh: string;
  ambience: AmbienceKind;
  /**
   * The cells, 16 rows (z, far to near) of 16 (x, left to right): '.' a tile, '#' a wall, 'A' / 'B' a
   * gate tile (A risen first), ' ' no tile (the deck's plate). None: every cell a tile.
   */
  map?: string[];
  /** A round deck: the cells whose middle is within this many tiles of the board's (the rest: plate). */
  round?: number;
  /** The four homes' 2 × 2 (top-left cell), seats 0..3 as the corner panels sit. */
  homes: [number, number][];
  /** Is cell (ix, iz) one of the shielded tiles (×2 in Shielded Hour)? */
  makers: (ix: number, iz: number) => boolean;
  /** The shielded patch's "radius" for the AIs (m from the middle). */
  makersR: number;
  sky: [string, string];
  fog: [number, number];
  sun: { pos: [number, number, number]; color: string; k: number };
  hemi: { sky: string; ground: string; k: number };
  /** Blank stone (checkered), its etched pattern's glow, the shielded stone. */
  blank: [string, string];
  glyphBlank: string;
  makersStone: [string, string];
  /** The rim: its stone, its lip, the chase lights' colours. */
  rim: string;
  lip: string;
  bulbs: string[];
  /** A back light (it rims the snarks and props): where from, its colour, its strength. */
  back: { pos: [number, number, number]; color: string; k: number };
  /** The turning deck (rad/s). */
  spin?: number;
  /** The gates: the first shift, then every…, the warning before each, how high a risen gate stands. */
  gates?: { first: number; every: number; warn: number; h: number };
  /** The waves: when each hits (s of play), the warning before, the wedges (sectors outside the hub). */
  waves?: { at: number[]; warn: number; wedges: number; hub: number };
}

const diamond = (ix: number, iz: number) => Math.abs(ix - 7.5) + Math.abs(iz - 7.5) <= 4.01;

export const LEVELS: TurfLevel[] = [
  {
    key: "slab",
    title: "SKY SLAB",
    titleZh: "天空石板",
    tag: "The open board over the city at dusk: no walls, nowhere to hide.",
    tagZh: "黄昏城市上空的开阔石板：没有墙，无处可躲。",
    ambience: "city-day",
    homes: [
      [1, 1],
      [13, 1],
      [1, 13],
      [13, 13],
    ],
    makers: diamond,
    makersR: 4 * 1.2 * 0.7,
    sky: ["#1b1244", "#ff9e72"],
    fog: [60, 250],
    sun: { pos: [-18, 44, 28], color: "#ffe2c6", k: 2.1 },
    hemi: { sky: "#d9ccff", ground: "#4a3458", k: 1.45 },
    blank: ["#3b3654", "#443f60"],
    glyphBlank: "#4a4370",
    makersStone: ["#ae95ff", "#bfa9ff"],
    rim: "#4a4074",
    lip: "#ff6b35",
    bulbs: ["#ff6b35", "#e8e6e0", "#a8d8e8", "#e8e6e0", "#c4b1fc"],
    back: { pos: [34, 16, -34], color: "#ff9a6a", k: 0.9 },
  },
  {
    key: "crypt",
    title: "ZK CEMETERY",
    titleZh: "ZK 墓园",
    tag: "A walled crypt yard at night: lanes, a shielded room, and gates that shift every few seconds.",
    tagZh: "夜晚的围墙墓园：小道、中央密室，闸门每隔几秒就会变换。",
    ambience: "city-night",
    map: [
      "................",
      "................",
      "....###BB###....",
      "................",
      "..#.###AA###.#..",
      "..#.#......#.#..",
      "..#.#......#.#..",
      "..A.B......B.A..",
      "..A.B......B.A..",
      "..#.#......#.#..",
      "..#.#......#.#..",
      "..#.###AA###.#..",
      "................",
      "....###BB###....",
      "................",
      "................",
    ],
    homes: [
      [1, 1],
      [13, 1],
      [1, 13],
      [13, 13],
    ],
    makers: (ix, iz) => ix >= 5 && ix <= 10 && iz >= 5 && iz <= 10,
    makersR: 3 * 1.2,
    sky: ["#0b0a24", "#3d2c66"],
    fog: [70, 260],
    sun: { pos: [-30, 50, 20], color: "#cfd8ff", k: 1.7 },
    hemi: { sky: "#b8a8ff", ground: "#2a3a34", k: 1.55 },
    blank: ["#3a4544", "#424e4c"],
    glyphBlank: "#4d6a62",
    makersStone: ["#9d86e8", "#ab95f0"],
    rim: "#5b5670",
    lip: "#8dffb0",
    bulbs: ["#ffcf7a", "#ffb04a", "#9dff9a", "#ffcf7a", "#c4b1fc"],
    back: { pos: [-20, 34, -46], color: "#8fb0ff", k: 1.0 },
    gates: { first: 7.5, every: 7.5, warn: 1.6, h: 1.05 },
  },
  {
    key: "pier",
    title: "BAY PIER",
    titleZh: "海湾码头",
    tag: "A round deck turning on the sea: the waves wash a wedge back to blank (it flashes first).",
    tagZh: "海上旋转的圆形甲板：海浪会把一块扇区冲回空白（之前会闪烁）。",
    ambience: "sea",
    round: 7.9,
    homes: [
      [2, 2],
      [12, 2],
      [2, 12],
      [12, 12],
    ],
    makers: (ix, iz) => Math.hypot(ix - 7.5, iz - 7.5) <= 3.6,
    makersR: 3.4 * 1.2,
    sky: ["#2f7fd8", "#ffd9b0"],
    fog: [90, 330],
    sun: { pos: [26, 40, 30], color: "#fff0d8", k: 2.0 },
    hemi: { sky: "#cfe8ff", ground: "#2d6070", k: 1.5 },
    blank: ["#2e5368", "#355b70"],
    glyphBlank: "#4b7a92",
    makersStone: ["#9f8cf0", "#ae9cf6"],
    rim: "#f2ebe0",
    lip: "#ff6b35",
    bulbs: ["#ffffff", "#ff6b35", "#a8d8e8", "#ffffff", "#ffd27a"],
    back: { pos: [-30, 26, -34], color: "#ffe2b8", k: 0.7 },
    spin: 0.15,
    waves: { at: [7, 14.5, 22, 29.5, 35.5, 41.3], warn: 2.2, wedges: 6, hub: 3.6 },
  },
];

// ---- the scenery ---------------------------------------------------------------------------------

/** What a level's scenery needs, and what it hands back: its own animation, ticked every frame. */
export interface SceneryKit {
  scene: THREE.Scene;
  fx: Fx3;
  /** The board's half width (m) and its rim's outer distance. */
  half: number;
  rimOut: number;
}
export interface Scenery {
  tick(dt: number, now: number): void;
}

const IDENT = new THREE.Quaternion();

/**
 * ZK CEMETERY: a floating crypt island at night. A rock keel under the slab, an iron fence on the
 * rim, the big tombstones of the dead (P2PKH, SPROUT, P2SH) and small graves round the yard,
 * dead trees, lanterns, a full moon, will-o'-wisps rising off the graves.
 */
export function buildCrypt(k: SceneryKit): Scenery {
  const s = k.scene;
  const W2 = k.half * 2;
  const m = new THREE.Matrix4();
  const v = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const col = new THREE.Color();
  // the island's earth and grass round the slab and behind it (one draw), then a jagged rock keel
  const ground: [string, number, number, number, number, number, number][] = [
    ["#3b2e30", W2 + 1.6, 1.6, W2 + 1.6, 0, -2.0, 0],
    ["#3b2e30", W2 + 1.6, 1.6, 4.6, 0, -0.4, -(k.rimOut + 2.6)],
    ["#4f7a4a", W2 + 1.6, 0.2, 4.6, 0, 0.45, -(k.rimOut + 2.6)],
    ["#4f7a4a", 4.2, 0.2, W2 + 1.6, -(k.rimOut + 1.9), -0.15, 0],
    ["#4f7a4a", 4.2, 0.2, W2 + 1.6, k.rimOut + 1.9, -0.15, 0],
    ["#3b2e30", 4.2, 1.6, W2 + 1.6, -(k.rimOut + 1.9), -1.0, 0],
    ["#3b2e30", 4.2, 1.6, W2 + 1.6, k.rimOut + 1.9, -1.0, 0],
  ];
  const earth = new THREE.InstancedMesh(GEO.box, toon("#ffffff"), ground.length);
  ground.forEach(([c, w, h, d, x, y, z], i) => {
    earth.setMatrixAt(i, m.compose(v.set(x, y, z), IDENT, sc.set(w, h, d)));
    earth.setColorAt(i, col.set(c));
  });
  s.add(earth);
  const keel = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1, 7), toon("#4a3d52", "#120c18"));
  keel.rotation.x = Math.PI;
  keel.scale.set(W2 * 1.32, 13, W2 * 1.32);
  keel.position.y = -2.8 - 6.5;
  s.add(keel);
  const keel2 = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1, 5), toon("#3a2f44"));
  keel2.rotation.set(Math.PI, 0.6, 0);
  keel2.scale.set(9, 9, 9);
  keel2.position.set(-6, -16, 4);
  s.add(keel2);
  // the iron fence round the rim: spikes, a rail (one draw for the spikes)
  const per = 30;
  const L = k.rimOut + 0.15;
  const spikes = new THREE.InstancedMesh(GEO.box, toon("#2a2438", "#0a0610"), per * 4 + 8);
  let n = 0;
  for (let side = 0; side < 4; side++)
    for (let i = 0; i < per; i++) {
      const u = ((i + 0.5) / per) * 2 - 1;
      // (the near side's fence low: the yard stays in view)
      const near = side === 1;
      const x = side < 2 ? u * L : side === 2 ? -L : L;
      const z = side < 2 ? (side === 0 ? -L : L) : u * L;
      const h = near ? 0.55 : 1.15 + ((i * 7) % 3) * 0.08;
      spikes.setMatrixAt(n++, m.compose(v.set(x, 0.3 + h / 2, z), IDENT, sc.set(0.09, h, 0.09)));
    }
  for (let side = 0; side < 4; side++) {
    // (the rails)
    const along = side < 2;
    const x = along ? 0 : side === 2 ? -L : L;
    const z = along ? (side === 0 ? -L : L) : 0;
    const y = side === 1 ? 0.7 : 1.2;
    spikes.setMatrixAt(n++, m.compose(v.set(x, y, z), IDENT, sc.set(along ? L * 2 : 0.07, 0.07, along ? 0.07 : L * 2)));
    spikes.setMatrixAt(n++, m.compose(v.set(x, 0.5, z), IDENT, sc.set(along ? L * 2 : 0.07, 0.07, along ? 0.07 : L * 2)));
  }
  spikes.count = n;
  s.add(spikes);
  // the dead's tombstones behind the yard, their names cut in them (stones, ink, faces: three draws)
  const names = [
    ["P2PKH", "2016 – LINKED"],
    ["SPROUT", "2016 – RETIRED"],
    ["P2SH", "2016 – EXPOSED"],
  ];
  const faceTex = canvasTex(384, 160, (g) => {
    names.forEach(([nm, yrs], i) => {
      const x0 = i * 128;
      g.fillStyle = "#8c8aa6";
      g.fillRect(x0, 0, 128, 160);
      g.fillStyle = "rgba(255,255,255,0.08)";
      for (let k2 = 0; k2 < 30; k2++) g.fillRect(x0 + ((k2 * 37) % 120), (k2 * 53) % 160, 6, 3);
      g.fillStyle = "#3a3450";
      g.textAlign = "center";
      g.font = "900 24px Geist, Roboto, sans-serif";
      g.fillText("R.I.P.", x0 + 64, 44);
      g.font = `900 ${nm.length > 6 ? 21 : 26}px Geist, Roboto, sans-serif`;
      g.fillText(nm, x0 + 64, 84);
      g.font = "800 13px Geist, Roboto, sans-serif";
      g.fillText(yrs, x0 + 64, 112);
      g.fillStyle = "#6fae7a";
      g.fillRect(x0, 146, 128, 14);
    });
  });
  const stoneGeo = new RoundedBoxGeometry(2.6, 3.3, 0.6, 3, 0.25);
  const stones = new THREE.InstancedMesh(stoneGeo, toon("#8c8aa6", "#14101c"), 3);
  const stoneInk = new THREE.InstancedMesh(stoneGeo, new THREE.MeshBasicMaterial({ color: 0x15101f, side: THREE.BackSide }), 3);
  const faces: THREE.BufferGeometry[] = [];
  const e = new THREE.Euler();
  const q = new THREE.Quaternion();
  for (let i = 0; i < 3; i++) {
    const big = i === 1 ? 1.15 : 1;
    v.set((i - 1) * 6.2, 1.2 + (i === 1 ? 0.3 : 0), -(k.rimOut + 2.6 + (i === 1 ? 0.6 : 0)));
    q.setFromEuler(e.set(-0.12, (i - 1) * -0.18, (i - 1) * 0.06));
    stones.setMatrixAt(i, m.compose(v, q, sc.setScalar(big)));
    stoneInk.setMatrixAt(i, m.compose(v, q, sc.set(big * 1.05, big * 1.04, big * 1.2)));
    const f = new THREE.PlaneGeometry(2.3, 2.9);
    const uv = f.attributes.uv as THREE.BufferAttribute;
    for (let j = 0; j < uv.count; j++) uv.setX(j, (i + uv.getX(j)) / 3);
    f.translate(0, 0, 0.31);
    f.applyMatrix4(m.compose(v, q, sc.setScalar(big)));
    faces.push(f);
  }
  const faceGeo = mergeGeometries(faces);
  for (const f of faces) f.dispose();
  s.add(stones, stoneInk, new THREE.Mesh(faceGeo, new THREE.MeshToonMaterial({ map: faceTex, gradientMap: toonSteps() })));
  // small graves on the sides of the island (one draw), crosses and slabs
  const graves = new THREE.InstancedMesh(new RoundedBoxGeometry(1, 1, 1, 2, 0.12), toon("#7a7894", "#0e0a16"), 28);
  n = 0;
  for (let i = 0; i < 14; i++) {
    const side = i < 7 ? -1 : 1;
    const j = i % 7;
    const x = side * (k.rimOut + 1.4 + (j % 2) * 0.9);
    const z = -k.half + 1.6 + j * 2.9;
    const tilt = ((i * 13) % 7) * 0.05 - 0.15;
    q.setFromEuler(e.set(0, Math.PI / 2, tilt));
    graves.setMatrixAt(n++, m.compose(v.set(x, 0.75, z), q, sc.set(1.0, 1.5, 0.3)));
    if (j % 3 === 1) graves.setMatrixAt(n++, m.compose(v.set(x, 1.0, z), q, sc.set(1.5, 0.3, 0.32)));
  }
  graves.count = n;
  s.add(graves);
  // dead trees (one draw of boughs)
  const boughs = new THREE.InstancedMesh(GEO.box, toon("#2e2236", "#0c0812"), 40);
  n = 0;
  const tree = (x: number, z: number, h: number, a: number) => {
    boughs.setMatrixAt(n++, m.compose(v.set(x, h / 2, z), IDENT, sc.set(0.45, h, 0.45)));
    for (let b = 0; b < 4; b++) {
      const an = a + b * 1.7;
      const y = h * (0.55 + b * 0.12);
      const len = 1.6 - b * 0.25;
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, an, 0.9 - b * 0.15));
      const off = new THREE.Vector3(len / 2, 0, 0).applyQuaternion(q);
      boughs.setMatrixAt(n++, m.compose(v.set(x + off.x, y + off.y, z + off.z), q, sc.set(len, 0.22, 0.22)));
    }
  };
  tree(-(k.rimOut + 2.2), -k.half + 0.5, 4.2, 0.3);
  tree(k.rimOut + 2.4, -k.half + 2.4, 3.6, 2.2);
  tree(-(k.rimOut + 2.6), k.half - 3, 3.2, 1.1);
  tree(k.rimOut + 2.2, k.half - 1.4, 3.9, 4.0);
  boughs.count = n;
  s.add(boughs);
  // lanterns on posts at the far corners and by the tombs (posts and lids, flames: two draws; they flicker)
  const spots = [
    [-(k.rimOut + 0.9), -(k.rimOut + 0.9)],
    [k.rimOut + 0.9, -(k.rimOut + 0.9)],
    [-3.1, -(k.rimOut + 2.2)],
    [3.1, -(k.rimOut + 2.2)],
  ];
  const posts = new THREE.InstancedMesh(GEO.box, toon("#2a2438", "#0a0610"), spots.length * 2);
  const flames = new THREE.InstancedMesh(GEO.box, glow("#9dff9a"), spots.length);
  spots.forEach(([x, z], i) => {
    posts.setMatrixAt(i * 2, m.compose(v.set(x, 1.3, z), IDENT, sc.set(0.18, 2.6, 0.18)));
    posts.setMatrixAt(i * 2 + 1, m.compose(v.set(x, 3.3, z), IDENT, sc.set(0.7, 0.14, 0.7)));
    flames.setMatrixAt(i, m.compose(v.set(x, 2.85, z), IDENT, sc.set(0.42, 0.55, 0.42)));
  });
  s.add(posts, flames);
  // the full moon and its halo
  const moon = new THREE.Mesh(GEO.ball, glow("#f6f1d6"));
  moon.scale.setScalar(26);
  moon.position.set(-70, 62, -190);
  s.add(moon);
  const haloTex = canvasTex(128, 128, (g) => {
    const gr = g.createRadialGradient(64, 64, 10, 64, 64, 64);
    gr.addColorStop(0, "rgba(220,210,255,0.55)");
    gr.addColorStop(0.45, "rgba(170,150,255,0.18)");
    gr.addColorStop(1, "rgba(120,100,220,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
  });
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, transparent: true, depthWrite: false, fog: false }));
  halo.scale.setScalar(110);
  halo.position.copy(moon.position).add(new THREE.Vector3(0, 0, 10));
  s.add(halo);
  // Z-Blocks adrift, glowing faintly
  const qs: THREE.Object3D[] = [];
  for (const [x, y, z, sz] of [
    [16.5, 3.2, -6, 1.3],
    [-16.5, 4.4, 4, 1.1],
  ]) {
    const q = qBlock(sz);
    q.position.set(x, y, z);
    q.userData.y = y;
    q.userData.a = x * 0.3 + z;
    s.add(q);
    qs.push(q);
  }
  let wisp = 0;
  const wv = new THREE.Vector3();
  return {
    tick(dt, now) {
      for (let i = 0; i < spots.length; i++) {
        const k2 = 0.42 + Math.sin(now * 13 + i * 2.1) * 0.06 + Math.sin(now * 7.3 + i) * 0.05;
        flames.setMatrixAt(i, m.compose(wv.set(spots[i][0], 2.85, spots[i][1]), IDENT, sc.set(k2, k2 * 1.3, k2)));
      }
      flames.instanceMatrix.needsUpdate = true;
      for (const q of qs) {
        q.rotation.y = now * 0.8 + q.userData.a;
        q.position.y = q.userData.y + Math.sin(now * 1.5 + q.userData.a) * 0.35;
      }
      // will-o'-wisps off the graves
      if ((wisp -= dt) <= 0) {
        wisp = 0.35 + Math.random() * 0.5;
        const side = Math.random() < 0.5 ? -1 : 1;
        const behind = Math.random() < 0.4;
        if (behind) wv.set((Math.random() - 0.5) * k.half * 1.6, 1.2, -(k.rimOut + 2 + Math.random() * 2));
        else wv.set(side * (k.rimOut + 1.2 + Math.random() * 1.6), 1.0, (Math.random() * 2 - 1) * k.half);
        k.fx.burst(wv, 2, ["#9dff9a", "#d6ffe0", "#c4b1fc"], { speed: 0.4, up: 1.2, gravity: -0.6, size: 0.2, life: 2.2, drag: 1.5 });
      }
    },
  };
}

/** The sea's texture: a deep teal with lighter wavelets (it scrolls). */
function seaTex() {
  const t = canvasTex(
    128,
    128,
    (g) => {
      g.fillStyle = "#1c8fb0";
      g.fillRect(0, 0, 128, 128);
      g.fillStyle = "#29a9c8";
      for (let i = 0; i < 14; i++) {
        const x = (i * 47) % 128,
          y = (i * 29) % 128;
        g.fillRect(x, y, 22, 4);
      }
      g.fillStyle = "#bdf0ff";
      for (let i = 0; i < 6; i++) {
        const x = (i * 71 + 13) % 128,
          y = (i * 43 + 7) % 128;
        g.fillRect(x, y, 10, 2);
      }
    },
    true,
  );
  t.magFilter = THREE.NearestFilter;
  return t;
}

/**
 * BAY PIER: the sea (scrolling), the deck's plinth standing in it with a ring of foam, a striped
 * lighthouse on its rock, sailboats and buoys bobbing, ZStreet's towers across the water.
 */
export function buildPier(k: SceneryKit): Scenery {
  const s = k.scene;
  const SEA = -2.6;
  const tex = seaTex();
  tex.repeat.set(160, 160);
  const sea = new THREE.Mesh(GEO.plane, new THREE.MeshToonMaterial({ map: tex, gradientMap: toonSteps(), emissive: 0x062a38 }));
  sea.rotation.x = -Math.PI / 2;
  sea.scale.set(1400, 1400, 1);
  sea.position.y = SEA;
  s.add(sea);
  // the plinth: a fat round drum into the sea, a coral band, barnacled foot
  const R = k.rimOut;
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.2, R + 0.6, 3.2, 48), toon("#e9e0cf", "#2a2218"));
  drum.position.y = -1.85;
  s.add(drum);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.32, R + 0.32, 0.45, 48), toon("#ff6b35", "#3a1000"));
  band.position.y = -0.95;
  s.add(band);
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.9, R + 1.4, 1.2, 48), toon("#3d5b5e"));
  foot.position.y = SEA - 0.2;
  s.add(foot);
  // the foam round it (one draw of bobbing voxels)
  const NF = 56;
  const foam = new THREE.InstancedMesh(GEO.box, glow("#f2fdff"), NF);
  foam.frustumCulled = false;
  s.add(foam);
  // the lighthouse on its rock, its lamp and the beam that sweeps
  const lh = new THREE.Group();
  // (far out, for the fly-over: the play camera looks down past it)
  lh.position.set(-40, SEA, -46);
  const rock = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 6), toon("#5a5a66", "#121218"));
  rock.scale.set(9, 6, 8);
  rock.position.y = 1.2;
  lh.add(rock);
  for (let i = 0; i < 6; i++) {
    const r0 = 2.0 - i * 0.16;
    const c = new THREE.Mesh(GEO.cyl, toon(i % 2 ? "#ffffff" : "#e8432e"));
    c.scale.set(r0 * 2, 2.2, r0 * 2);
    c.position.y = 4.4 + i * 2.2;
    lh.add(c);
  }
  const cab = new THREE.Mesh(GEO.cyl, glow("#fff3b0"));
  cab.scale.set(2.4, 1.6, 2.4);
  cab.position.y = 4.4 + 6 * 2.2 - 0.3;
  lh.add(cab);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 12), toon("#e8432e"));
  cap.scale.set(1.9, 1.6, 1.9);
  cap.position.y = cab.position.y + 1.6;
  lh.add(cap);
  const beam = new THREE.Mesh(new THREE.ConeGeometry(4, 40, 16, 1, true), new THREE.MeshBasicMaterial({ color: "#fff6c8", transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  beam.geometry.translate(0, -20, 0);
  const beamG = new THREE.Group();
  beamG.position.y = cab.position.y;
  beam.rotation.z = Math.PI / 2;
  beamG.add(beam);
  lh.add(beamG);
  s.add(lh);
  // sailboats (hulls and sails, two draws) and buoys (one), bobbing on the swell
  const NB = 5;
  const hulls = new THREE.InstancedMesh(GEO.box, toon("#ffffff", "#20262e"), NB * 2);
  const sails = new THREE.InstancedMesh(new THREE.ConeGeometry(0.5, 1, 3), toon("#ffffff"), NB);
  const boats: { x: number; z: number; a: number; c: string }[] = [
    { x: 34, z: -30, a: 0.6, c: "#ff6b35" },
    { x: -26, z: -60, a: 2.2, c: "#3ec6ff" },
    { x: 58, z: -12, a: 4.1, c: "#c4b1fc" },
    { x: 18, z: -72, a: 1.3, c: "#8ee35b" },
    { x: -62, z: -18, a: 3.0, c: "#ff5fa2" },
  ];
  const col = new THREE.Color();
  boats.forEach((b, i) => {
    sails.setColorAt(i, col.set(b.c).lerp(new THREE.Color("#ffffff"), 0.35));
    hulls.setColorAt(i * 2, col.set("#ffffff"));
    hulls.setColorAt(i * 2 + 1, col.set(b.c));
  });
  s.add(hulls, sails);
  const NBU = 8;
  const buoys = new THREE.InstancedMesh(GEO.cyl, toon("#ff4a3a", "#3a0800"), NBU);
  s.add(buoys);
  // ZStreet across the water, puffy clouds
  skyline(s, { r: 210, n: 70, y: SEA, rnd: Math.random, tall: 1.1 });
  const puffs = new THREE.InstancedMesh(GEO.box, toon("#ffffff", "#7a6a7a"), 36);
  const m = new THREE.Matrix4();
  const v = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const q = new THREE.Quaternion();
  let n = 0;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + Math.random() * 0.4;
    const d = 110 + Math.random() * 80;
    const y = 30 + Math.random() * 30;
    for (let p = 0; p < 3; p++) {
      const w = (p === 1 ? 14 : 9) * (0.8 + Math.random() * 0.5);
      puffs.setMatrixAt(n++, m.compose(v.set(Math.cos(a) * d + (p - 1) * 9, y + (p === 1 ? 2 : 0), Math.sin(a) * d), q, sc.set(w, w * 0.6, w * 0.8)));
    }
  }
  puffs.count = n;
  s.add(puffs);
  const qs: THREE.Object3D[] = [];
  for (const [x, y, z, sz] of [
    [16.5, 3.4, -5, 1.3],
    [-15.5, 4.6, 6, 1.1],
    [9.5, 6.2, -17, 1.2],
  ]) {
    const qb = qBlock(sz);
    qb.position.set(x, y, z);
    qb.userData.y = y;
    qb.userData.a = x * 0.3 + z;
    s.add(qb);
    qs.push(qb);
  }
  const e = new THREE.Euler();
  return {
    tick(dt, now) {
      tex.offset.set((now * 0.02) % 1, (now * 0.035) % 1);
      // the foam ring bobs
      for (let i = 0; i < NF; i++) {
        const a = (i / NF) * Math.PI * 2 + Math.sin(now * 0.3 + i) * 0.02;
        const r = R + 0.9 + Math.sin(now * 2.1 + i * 1.7) * 0.25;
        const h = 0.25 + Math.max(0, Math.sin(now * 2.6 + i * 0.9)) * 0.35;
        foam.setMatrixAt(i, m.compose(v.set(Math.cos(a) * r, SEA + 0.05 + h / 2, Math.sin(a) * r), q.setFromAxisAngle(v.set(0, 1, 0), -a), sc.set(0.55, h, 0.9)));
      }
      foam.instanceMatrix.needsUpdate = true;
      beamG.rotation.y = now * 0.9;
      boats.forEach((b, i) => {
        const bob = Math.sin(now * 1.4 + i * 2) * 0.25;
        const roll = Math.sin(now * 1.1 + i) * 0.08;
        e.set(0, b.a, roll);
        q.setFromEuler(e);
        hulls.setMatrixAt(i * 2, m.compose(v.set(b.x, SEA + 0.4 + bob, b.z), q, sc.set(5.2, 0.9, 1.8)));
        hulls.setMatrixAt(i * 2 + 1, m.compose(v.set(b.x, SEA + 0.95 + bob, b.z), q, sc.set(5.0, 0.25, 1.85)));
        sails.setMatrixAt(i, m.compose(v.set(b.x, SEA + 3.4 + bob, b.z), q, sc.set(3.2, 4.6, 0.2)));
      });
      hulls.instanceMatrix.needsUpdate = true;
      sails.instanceMatrix.needsUpdate = true;
      for (let i = 0; i < NBU; i++) {
        const a = (i / NBU) * Math.PI * 2 + 0.3;
        // (the ones on the left side ride closer in: the sandbar and the lighthouse stand out there)
        const d = Math.cos(a) < -0.5 ? R + 3.2 : R + 7 + (i % 3) * 3;
        e.set(Math.sin(now * 1.7 + i) * 0.15, 0, Math.cos(now * 1.3 + i) * 0.15);
        buoys.setMatrixAt(i, m.compose(v.set(Math.cos(a) * d, SEA + 0.35 + Math.sin(now * 1.9 + i * 1.3) * 0.18, Math.sin(a) * d), q.setFromEuler(e), sc.set(0.7, 1.1, 0.7)));
      }
      buoys.instanceMatrix.needsUpdate = true;
      for (const qb of qs) {
        qb.rotation.y = now * 0.8 + qb.userData.a;
        qb.position.y = qb.userData.y + Math.sin(now * 1.5 + qb.userData.a) * 0.35;
      }
      void dt;
    },
  };
}
