import * as THREE from "three";
import { neonTexture, roadTexture } from "../textures";
import { toObject } from "../voxel/mesher";
import { streetLamp } from "../voxel/props";
import { C, E, hash, shades, VOX, VoxelModel } from "../voxel/model";
import { mat } from "./kit";
import { CITY, TUNNEL } from "./plan";
import { strataTexture, wet } from "./index";

/** Tunnel model, in voxels: across the road, height, depth into the hill. */
const W = 84;
const H = 70;
const D = TUNNEL.depth * 6;
/** The bore: half its width, the height of its walls, the rise of its vault. */
const HALF = 28;
const WALL = 21;
const RISE = 12;
const HEAD = 46;

const archTop = (x: number, half = HALF) => {
  const u = (x - W / 2) / half;
  return Math.abs(u) >= 1 ? -1 : WALL + RISE * Math.sqrt(1 - u * u);
};

/**
 * A rocky hill with a concrete portal: hazard stripes, a gold light strip around the arch and a
 * row of sodium lamps that fade into the dark. Built facing +z; turned to face the city.
 */
function tunnelModel(seed: number) {
  const m = new VoxelModel(W, H, D);
  const rock = shades(["#4a4450", "#544c58", "#3f3a46", "#5c5460"], 1, seed);
  const moss = shades(["#3d7a44", "#2f6b3c", "#4a8a4e", "#36703f"], 1, seed + 1);
  const concrete = shades(["#8c8894", "#827e8a", "#95919c"], 1, seed + 2);
  const tile = shades(["#4e4a56", "#46424e", "#55505c"], 1, seed + 3);
  // the hill: a rounded mass, highest behind the portal, falling away to the sides
  for (let x = 0; x < W; x++)
    for (let z = 0; z < D - 5; z++) {
      const sx = Math.abs(x - W / 2) / (W / 2);
      const bump = Math.sin(x * 0.21 + seed) * 3 + Math.cos(z * 0.27 + seed * 2) * 3 + hash(x >> 2, 0, z >> 2, seed) * 4;
      const top = Math.round(HEAD + 12 - sx * sx * 26 - (z / D) * 6 + bump);
      // moss on most of the crown, bare rock where it is steep or rough
      const bare = hash(x >> 1, 7, z >> 1, seed) < 0.18 || sx > 0.9;
      for (let y = 0; y < top; y++) m.set(x, y, z, y >= top - 2 && !bare ? moss : rock);
    }
  // a few shrubs and a pine or two on the slope
  for (let k = 0; k < 7; k++) {
    const x = 6 + Math.floor(hash(k, 1, 0, seed) * (W - 12));
    const z = 4 + Math.floor(hash(k, 2, 0, seed) * (D - 16));
    let y = H - 1;
    while (y > 0 && !m.get(x, y, z)) y--;
    if (k % 3 === 0) {
      m.box(x, y, z, x + 1, y + 7, z + 1, C("#4a3426"));
      for (let i = 0; i < 4; i++) m.blob(x, y + 6 + i * 3, z, 5 - i, shades(["#244a33", "#1f3d2b", "#2c5a3c"], 1, k), 0.2, k + i);
    } else m.blob(x, y + 2, z, 3 + (k % 2), moss, 0.35, k);
  }
  // the portal headwall
  m.box(0, 0, D - 6, W, HEAD, D, concrete);
  m.box(0, HEAD, D - 7, W, HEAD + 2, D, C("#6e6a76"));
  // wing walls stepping down either side
  for (const [x0, x1] of [
    [0, 6],
    [W - 6, W],
  ])
    m.box(x0, 0, D - 6, x1, HEAD + 4, D, C("#77737f"));
  // tiled lining, then the bore itself, right through
  for (let x = 0; x < W; x++) {
    const outer = archTop(x, HALF + 2);
    // the bore stops short of the back of the hill, which stays solid rock
    for (let y = 0; y < outer; y++) for (let z = 3; z < D; z++) m.set(x, y, z, tile);
    const inner = archTop(x);
    for (let y = 0; y < inner; y++) for (let z = 6; z < D; z++) m.set(x, y, z, 0);
  }
  // hazard stripes on the arch ring, a gold light strip just outside it
  for (let x = 0; x < W; x++) {
    const ring = archTop(x, HALF + 3);
    const gold = archTop(x, HALF + 5);
    for (let y = 0; y < H; y++) {
      if (y < ring && y >= archTop(x, HALF + 2) - 0.5 && m.get(x, y, D - 1)) m.set(x, y, D - 1, ((x + y) >> 2) % 2 ? C("#f4b728") : C("#1a1a1e"));
      if (y < gold && y >= archTop(x, HALF + 4) && m.get(x, y, D - 1)) m.set(x, y, D - 1, E("#f4b728", 2.4));
    }
  }
  // sodium lamps along the vault, dimmer the deeper they are; a black end swallows the traffic
  for (let z = D - 4; z > 6; z -= 7) {
    const k = z / D;
    for (const x of [W / 2 - 14, W / 2 + 14]) {
      const y = Math.floor(archTop(x)) - 1;
      m.box(x - 2, y, z, x + 2, y + 1, z + 2, E("#ffb46b", 0.6 + k * 1.8));
    }
  }
  // the far end of the bore is pitch black
  for (let x = 0; x < W; x++) for (let y = 0; y < archTop(x); y++) m.set(x, y, 5, C("#050507"));
  // road edge kerbs inside
  m.box(W / 2 - HALF + 1, 0, 6, W / 2 - HALF + 4, 2, D, C("#55515c"));
  m.box(W / 2 + HALF - 4, 0, 6, W / 2 + HALF - 1, 2, D, C("#55515c"));
  return m;
}

/** Causeways from both ends of the board to a tunnel portal each. */
export function tunnels(g: THREE.Group) {
  const roadW = CITY.road.z1 - CITY.road.z0;
  const cz = (CITY.road.z0 + CITY.road.z1) / 2;
  const edge = CITY.maxX + 0.3;
  const run = TUNNEL.mouth - edge;
  const deckW = roadW + 2.4;
  const base = new THREE.MeshStandardMaterial({ map: strataTexture(run, deckW), roughness: 0.95 });
  const barrier = mat("#7c7884", 0.8);
  const reflector = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.6, 0.4), toneMapped: false });
  for (const side of [1, -1]) {
    const mid = side * (edge + run / 2);
    // the causeway: strata block, asphalt, a jersey barrier with reflectors on each side
    add(g, new THREE.BoxGeometry(run, 3.2, deckW), base, mid, -1.6, cz);
    add(g, new THREE.BoxGeometry(run + 0.4, 0.2, deckW + 0.4), mat("#141219"), mid, -3.3, cz);
    const len = run + TUNNEL.depth;
    const road = new THREE.Mesh(
      new THREE.PlaneGeometry(len, roadW),
      wet(new THREE.MeshStandardMaterial({ map: roadTexture(len, roadW, [], 4), roughness: 0.34, metalness: 0.22 }), () => roadTexture(len, roadW, [], 4, true)),
    );
    road.rotation.x = -Math.PI / 2;
    road.position.set(side * (edge + len / 2), 0.011, cz);
    road.receiveShadow = true;
    g.add(road);
    for (const z of [CITY.road.z0 - 0.6, CITY.road.z1 + 0.6]) {
      add(g, new THREE.BoxGeometry(run, 0.55, 0.5), barrier, mid, 0.27, z).castShadow = true;
      add(g, new THREE.BoxGeometry(run, 0.18, 1.2), barrier, mid, 0.09, z);
      for (let x = edge + 1; x < TUNNEL.mouth - 0.5; x += 2) add(g, new THREE.BoxGeometry(0.12, 0.1, 0.52), reflector, side * x, 0.42, z);
    }
    // lamps on the barriers, staggered, all the way to the portal
    for (let x = edge + 4, i = 0; x < TUNNEL.mouth - 2; x += 7, i++) {
      const north = i % 2 === 0;
      const lamp = toObject(streetLamp("#ffb46b").model);
      lamp.position.set(side * x, 0.55, north ? CITY.road.z0 - 0.6 : CITY.road.z1 + 0.6);
      lamp.rotation.y = north ? 0 : Math.PI;
      g.add(lamp);
    }
    // the hill and its portal, on its own block of strata
    const model = toObject(tunnelModel(side > 0 ? 7 : 3));
    model.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    const cx = side * (TUNNEL.mouth + TUNNEL.depth / 2);
    model.position.set(cx, 0, cz);
    g.add(model);
    add(g, new THREE.BoxGeometry(TUNNEL.depth, 3.2, W * VOX), new THREE.MeshStandardMaterial({ map: strataTexture(TUNNEL.depth, W * VOX), roughness: 0.95 }), cx, -1.6, cz);
    // where the traffic goes: buses come from the miners in the west and carry blocks into the chain
    const { texture, aspect } = neonTexture(side > 0 ? "INTO THE CHAIN ▸" : "◂ FROM THE MINERS", "#f4b728");
    const sh = 0.75;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(sh * aspect, sh), new THREE.MeshBasicMaterial({ map: texture, transparent: true, toneMapped: false }));
    sign.position.set(side * (TUNNEL.mouth - 0.04), (WALL + RISE + 3.2) * VOX + sh / 2, cz);
    sign.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    g.add(sign);
  }
}

function add(g: THREE.Object3D, geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number) {
  const mesh = new THREE.Mesh(geo, m);
  mesh.position.set(x, y, z);
  mesh.receiveShadow = true;
  g.add(mesh);
  return mesh;
}
