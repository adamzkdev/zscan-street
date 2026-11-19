/**
 * PROVE THE BLOCK · PROOF POINT's world (the plaza itself is built in sign.ts): the lookout floats
 * at dusk over the SHIELDED WOODS. Under it the wooded terraces, GENESIS CREEK winding through them from
 * GENESIS FALLS, a lit footpath to the old watchtower, fireflies in the trees; beyond the woods the
 * city's windows coming on in the haze; clouds drifting under the plaza, a flock going home, pennants
 * on the banner poles.
 */
import * as THREE from "three";
import type { Rnd } from "../../kit";
import { GEO, canvasTex, glow, skyDome } from "../../k3";
import { flock } from "../dig-levels/props";
import { Bobs } from "./parts";
import { boxes, cityGrid, cloudDeck, flags, ground, terrain, trees, type CityLook } from "./vista";

/** The land's base under the plaza (m), the city's streets. */
const Y0 = -46;
/** The terraces' colours, a step at a time from the hollows up. */
const TERRACE = ["#2d2262", "#34286c", "#3d2f78", "#473684", "#523e90", "#5c4698", "#664ea0", "#7056a8", "#7a5eb0", "#8466b6", "#8e6ebc", "#9876c2", "#a27ec8", "#ac86ce"];
const DUSK_CITY: CityLook = {
  street: "#2a1f5c",
  lots: ["#3a2c74", "#42327e", "#352868"],
  park: "#2c4a66",
  walls: ["#5a4a9e", "#4a3d8a", "#6a55ae", "#40347a", "#7460b4"],
  roof: 0.45,
  win: ["#ffd98a", "#2a2058"],
  lit: 0.5,
  shine: 0.9,
  lamp: "#ffb46a",
  cars: ["#fff2c8", "#ff5a5a", "#fff2c8"],
  beacon: "#ff4a5a",
  trees: ["#2f6a72", "#3a7c7a"],
};

export function pointWorld(scene: THREE.Scene, cos: Rnd): { tick(t: number): void } {
  // the sky: dusk, a few lit clouds, the first stars, a pale moon coming up behind the block
  skyDome(scene, { sky: ["#2b1a78", "#ff9bc9"], ground: "#ff9bc9", clouds: 11, cloud: "#ffd3e6", cloudShade: "#b86ab8", stars: 260, disc: { az: 292, el: 17, moon: true, size: 8, color: "#fff0f6" }, haze: 0.5, rnd: cos });
  ground(scene, Y0 - 1.2, "#3a2a70");
  // ---- the woods: terraces two metres a step, a plateau at the back left that the creek falls from
  const creekX = (z: number) => -34 + 26 * Math.sin(z * 0.034 + 0.9) + 0.22 * z;
  const plateau = (x: number, z: number) => (x < -22 && z < -44 ? 12 : 0);
  const rise = (x: number, z: number) => {
    const h = 5 + 4.2 * Math.sin(x * 0.047 + 1.3) * Math.cos(z * 0.041 - 0.4) + 2.4 * Math.sin(x * 0.11 + z * 0.083);
    return Math.max(0, Math.round(h / 2) * 2) + plateau(x, z);
  };
  const wet = (x: number, z: number) => Math.abs(x - creekX(z)) < 3.4;
  const CELL = 6;
  terrain(scene, {
    x0: -150,
    x1: 150,
    z0: -132,
    z1: 84,
    cell: CELL,
    y: Y0,
    h: (x, z) => (wet(x, z) ? null : rise(x, z)),
    // (deep violet in the hollows, a warmer plum where the last light still reaches)
    c: (_x, _z, h) => TERRACE[Math.min(TERRACE.length - 1, Math.round(h / 2))],
  });
  // the creek: the sky in it (unlit), a little lower than its banks; the falls down the plateau's edge
  const water = new THREE.Mesh(GEO.plane, glow("#c79ae6"));
  water.rotation.x = -Math.PI / 2;
  water.scale.set(310, 226, 1);
  water.position.set(0, Y0 + 0.9, -24);
  water.userData.noShadow = true;
  scene.add(water);
  const fallTex = canvasTex(
    64,
    128,
    (g) => {
      g.fillStyle = "#e8d6f8";
      g.fillRect(0, 0, 64, 128);
      const r = cos;
      for (let k = 0; k < 26; k++) {
        g.fillStyle = k % 3 ? "#ffffff" : "#c9a6ea";
        const x = Math.floor(r() * 15) * 4;
        const y = Math.floor(r() * 128);
        const h = 14 + r() * 30;
        g.fillRect(x, y, 4, h);
        g.fillRect(x, y - 128, 4, h);
      }
    },
    true,
  );
  const fallM = new THREE.MeshBasicMaterial({ map: fallTex });
  const fz = -44;
  const fx = creekX(fz - 3);
  const falls = new THREE.Mesh(GEO.plane, fallM);
  falls.scale.set(9.2, 13.4, 1);
  falls.position.set(fx, Y0 + 0.9 + 6.7, fz + CELL / 2 + 0.2);
  falls.userData.noShadow = true;
  scene.add(falls);
  // (the pool it falls into, its mist)
  boxes(
    scene,
    [
      ["#e6d2f6", 11, 0.5, 5, fx, Y0 + 1.1, fz + CELL / 2 + 2.6],
      ["#ffffff", 7, 0.5, 2.4, fx, Y0 + 1.3, fz + CELL / 2 + 1.4],
    ],
    true,
  );
  const mist: { x: number; y: number; z: number; s: number; c: string }[] = [];
  for (let k = 0; k < 9; k++) mist.push({ x: fx + (cos() - 0.5) * 10, y: Y0 + 1.8 + cos() * 2.4, z: fz + CELL / 2 + 1 + cos() * 4, s: 1.1 + cos() * 1.3, c: "#ffeef6" });
  const spray = new Bobs(scene, GEO.box, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, depthWrite: false }), mist, { bob: 0.9, twinkle: 0.6, speed: 1.6, drift: 0.8 });
  spray.mesh.userData.noShadow = true;
  // ---- the trees: thick on the terraces, none on the banks' lip or under the plaza's own stone
  const wood: { x: number; y: number; z: number; s: number; c: string; tip?: string }[] = [];
  // (dusk greens, close in value to the ground: the woods stay behind the play floor)
  const greens = ["#2a4f72", "#30597a", "#26486c", "#356282"];
  for (let k = 0; k < 1500; k++) {
    const x = -146 + cos() * 292;
    const z = -128 + cos() * 208;
    if (Math.abs(x - creekX(z)) < 6.5) continue;
    const s = 2.2 + cos() * 1.9;
    wood.push({ x, y: Y0 + rise(Math.round(x / CELL) * CELL, Math.round(z / CELL) * CELL), z, s, c: greens[k % 4], tip: cos() < 0.14 ? "#d88ab8" : "#4a7f96" });
  }
  trees(scene, wood);
  // ---- the footpath: lit posts from the front right up to the old watchtower on its knoll
  const lit: [string, number, number, number, number, number, number, number?][] = [];
  const dark: [string, number, number, number, number, number, number, number?][] = [];
  for (let k = 0; k < 15; k++) {
    const u = k / 14;
    const x = 30 + 24 * u + Math.sin(u * 5) * 5;
    const z = 22 - 66 * u;
    const y = Y0 + rise(Math.round(x / CELL) * CELL, Math.round(z / CELL) * CELL);
    dark.push(["#2a1f5c", 0.5, 4.4, 0.5, x, y + 2.2, z]);
    lit.push([k % 2 ? "#8af0ff" : "#c4b1fc", 0.9, 0.9, 0.9, x, y + 4.8, z]);
  }
  const tx = 56;
  const tz = -50;
  const ty = Y0 + rise(Math.round(tx / CELL) * CELL, Math.round(tz / CELL) * CELL);
  dark.push(["#4a3d96", 5, 13, 5, tx, ty + 6.5, tz], ["#3a2f7c", 7, 1.2, 7, tx, ty + 13.4, tz], ["#2a2160", 3.2, 3.4, 3.2, tx, ty + 15.6, tz]);
  lit.push(["#ffd98a", 5.1, 1.1, 2.2, tx, ty + 9.5, tz + 1.5], ["#ffd98a", 2.2, 1.1, 5.1, tx + 1.5, ty + 5.5, tz], ["#ff6b35", 1.4, 1.4, 1.4, tx, ty + 18, tz]);
  boxes(scene, dark);
  boxes(scene, lit, true);
  // fireflies over the woods (small, far below the play floor: nothing a snark could reach)
  const fly: { x: number; y: number; z: number; s: number; c: string }[] = [];
  for (let k = 0; k < 70; k++) {
    const x = -110 + cos() * 220;
    const z = -110 + cos() * 150;
    fly.push({ x, y: Y0 + rise(Math.round(x / CELL) * CELL, Math.round(z / CELL) * CELL) + 5 + cos() * 5, z, s: 0.55, c: ["#fff2a8", "#8af0ff", "#ffd0f0"][k % 3] });
  }
  const flies = new Bobs(scene, GEO.box, new THREE.MeshBasicMaterial({ color: 0xffffff }), fly, { bob: 0.8, twinkle: 1, drift: 1.6, speed: 0.6 });
  flies.mesh.userData.noShadow = true;
  // ---- the city beyond the woods (its windows coming on), the hills behind it
  const city = cityGrid(scene, {
    y: Y0 + 1,
    x0: -270,
    x1: 270,
    z0: -330,
    z1: -165,
    pitch: 30,
    street: 9,
    tall: (x, z) => 16 + 78 * Math.exp(-((x - 40) * (x - 40)) / 16000) * (0.5 + 0.5 * Math.exp(-((z + 240) * (z + 240)) / 6000)),
    rnd: cos,
    look: DUSK_CITY,
    cars: 46,
    carSize: 2.2,
    parks: 0.08,
  });
  // ---- clouds under the plaza's sides (never under the floor itself), a flock, the poles' pennants
  const cl = cloudDeck(scene, { n: 9, x0: -120, x1: 120, y0: -27, y1: -17, z0: -105, z1: -62, rnd: cos, color: "#ffd9ec", shade: "#c890d0", speed: 0.7, size: 1.1 });
  const birds = flock(scene, 7, 8, -20, -40, 46, "#3a2a70", 0.07, 1.3);
  const pen = flags(
    scene,
    [-1, 1].flatMap((sx) => [
      { x: sx * 12.2 - 1.7, y: 8.9, z: -3, ry: 0.2, w: 1.5, h: 0.6, c: sx < 0 ? "#c4b1fc" : "#ff6b35", c2: "#ffffff" },
      { x: sx * 12.2 + 1.7, y: 8.9, z: -3, ry: 0.2, w: 1.5, h: 0.6, c: sx < 0 ? "#c4b1fc" : "#ff6b35", c2: "#ffffff" },
    ]),
  );
  return {
    tick(t: number) {
      fallTex.offset.y = (t * 0.9) % 1;
      spray.tick(t);
      flies.tick(t);
      city.tick(t);
      cl.tick(t);
      birds(t);
      pen.tick(t);
    },
  };
}
