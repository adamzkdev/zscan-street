import * as THREE from "three";
import { C, CM, E, MAT, shades, VoxelModel } from "../../scene/voxel/model";
import { makeCanvas, rrect } from "./kit";
import { drawMark } from "../../party/theme";

/**
 * The Game House's own furniture: voxel tables at 12 voxels a metre (facing +z, standing on y = 0,
 * centred on x and z, like ../furniture.ts), and a few props built from plain meshes that move (dice,
 * Z-Blocks, cards, chips, the tournament's cup), each sharing its geometry and material.
 */

const m = (w: number, h: number, d: number) => new VoxelModel(w, h, d);
const black = C("#16141c");
const walnut = () => shades(["#4a3020", "#442c1e", "#503424"], 2, 2);
const leather = C("#1c1418");

/** An oval poker table for eight, 3 × 1.6 m: a padded rail, felt with a betting line, a pedestal. */
export function pokerTable(felt: string, line: string) {
  const W = 36,
    D = 20,
    v = m(W, 10, D);
  for (let z = 0; z < D; z++)
    for (let x = 0; x < W; x++) {
      // a stadium shape: a rectangle with round ends
      const r = D / 2;
      const ex = Math.max(0, Math.abs(x + 0.5 - W / 2) - (W / 2 - r));
      const d = Math.hypot(ex, z + 0.5 - D / 2) / r;
      if (d > 1) continue;
      v.set(x, 8, z, d > 0.82 ? leather : d > 0.78 ? C("#6a4a30") : d > 0.6 && d < 0.64 ? C(line) : C(felt));
      if (d > 0.84) v.set(x, 9, z, leather);
      if (d > 0.9) v.set(x, 7, z, walnut());
    }
  // the dealer's tray, set into the near long side (−z)
  v.box(W / 2 - 4, 8, 3, W / 2 + 4, 9, 5, black);
  for (let x = W / 2 - 4; x < W / 2 + 4; x++) v.set(x, 8, 4, C(["#ff6b35", "#c4b1fc", "#a8d8e8", "#e8e6e0"][x % 4]));
  // the pedestal
  v.box(W / 2 - 6, 0, D / 2 - 3, W / 2 + 6, 7, D / 2 + 3, walnut());
  v.box(W / 2 - 9, 0, D / 2 - 5, W / 2 + 9, 1, D / 2 + 5, black);
  return v;
}

/** A square board-game table, 2.2 m a side: a walnut frame round a recessed board (the board is a picture laid on it). */
export function boardTable() {
  const S = 26,
    v = m(S, 10, S);
  v.box(0, 8, 0, S, 9, S, walnut());
  v.box(0, 9, 0, S, 10, 1, walnut());
  v.box(0, 9, S - 1, S, 10, S, walnut());
  v.box(0, 9, 0, 1, 10, S, walnut());
  v.box(S - 1, 9, 0, S, 10, S, walnut());
  for (const [x, z] of [
    [2, 2],
    [S - 4, 2],
    [2, S - 4],
    [S - 4, S - 4],
  ])
    v.box(x, 0, z, x + 2, 8, z + 2, black);
  v.box(2, 3, 2, S - 2, 4, S - 2, C("#2a2430"));
  return v;
}

/** A round card table, 1.7 m across: felt, a padded rim, a single column. */
export function cardTable(felt: string) {
  const R = 10,
    v = m(R * 2, 10, R * 2);
  for (let z = 0; z < R * 2; z++)
    for (let x = 0; x < R * 2; x++) {
      const d = Math.hypot(x + 0.5 - R, z + 0.5 - R) / R;
      if (d > 1) continue;
      v.set(x, 8, z, d > 0.8 ? leather : C(felt));
      if (d > 0.84) v.set(x, 9, z, leather);
    }
  v.box(R - 2, 0, R - 2, R + 2, 8, R + 2, black);
  v.box(R - 5, 0, R - 5, R + 5, 1, R + 5, black);
  return v;
}

/** A low dais for the board game: 5.2 × 3.8 m, 0.5 m high, a felt top inside a void frame edged in light. */
export function dais() {
  const W = 62,
    D = 46,
    v = m(W, 6, D);
  v.box(0, 0, 0, W, 5, D, C("#1a1720"));
  v.box(1, 5, 1, W - 1, 6, D - 1, C("#221c30"));
  for (let x = 0; x < W; x++) {
    v.set(x, 4, 0, x % 2 ? E("#ff6b35", 1.5) : C("#2a2632"));
    v.set(x, 4, D - 1, x % 2 ? E("#ff6b35", 1.5) : C("#2a2632"));
  }
  for (let z = 0; z < D; z++) {
    v.set(0, 4, z, z % 2 ? E("#c4b1fc", 1.4) : C("#2a2632"));
    v.set(W - 1, 4, z, z % 2 ? E("#c4b1fc", 1.4) : C("#2a2632"));
  }
  return v;
}

/** The tournament desk: a void counter 4.2 m long, flare stripes down its front, a raised shelf for the cup. */
export function tournamentDesk() {
  const W = 50,
    D = 10,
    v = m(W, 14, D);
  v.box(0, 0, 0, W, 12, D, C("#121016"));
  v.box(0, 12, 0, W, 13, D, C("#2a2632"));
  v.box(-1, 12, D - 1, W + 1, 13, D, C("#3a3442"));
  for (let x = 3; x < W - 2; x += 6) v.box(x, 1, D - 1, x + 1, 11, D, E("#ff6b35", 1.6));
  v.box(0, 11, D - 1, W, 12, D, E("#c4b1fc", 1.4));
  // the shelf for the cup, at the east end
  v.box(W - 12, 13, 2, W - 2, 14, 8, C("#3a3442"));
  return v;
}

/** A card-room chair: low padded back, dark legs, a velvet seat (faces +z). */
export function roomChair(color: string) {
  const v = m(6, 11, 6);
  // (painted, not "brick" or "wood" by its colour: velvet and lacquer)
  const leg = CM("#1e181e", MAT.paint);
  const frame = CM("#2a2230", MAT.paint);
  const seat = CM(color, MAT.paint);
  for (const [x, z] of [
    [0, 0],
    [5, 0],
    [0, 5],
    [5, 5],
  ])
    v.box(x, 0, z, x + 1, 5, z + 1, leg);
  v.box(0, 5, 0, 6, 6, 6, frame);
  v.box(1, 6, 1, 5, 7, 5, seat);
  v.box(0, 6, 0, 6, 10, 1, frame);
  v.box(1, 7, 1, 5, 10, 2, seat);
  v.box(1, 10, 0, 5, 11, 1, frame);
  return v;
}

/** The cage: a counter 3 m long behind a grille, a rack of ⓩ chips on it (faces +z, the cashier behind). */
export function cage() {
  const W = 36,
    v = m(W, 30, 9);
  v.box(0, 0, 2, W, 12, 9, C("#14121a"));
  v.box(0, 12, 1, W, 13, 9, C("#2a2632"));
  for (let x = 2; x < W - 1; x += 4) v.box(x, 1, 8, x + 1, 11, 9, E("#ff6b35", 1.5));
  // the grille up to the canopy
  for (let x = 0; x < W; x += 2) v.box(x, 13, 3, x + 1, 27, 4, C("#5a5662"));
  v.box(0, 27, 1, W, 30, 9, C("#14121a"));
  v.box(0, 27, 8, W, 28, 9, E("#c4b1fc", 1.4));
  // the window in the grille, and the chips racked by it
  v.clear(12, 15, 3, 24, 24, 4);
  const cols = ["#ff6b35", "#c4b1fc", "#a8d8e8", "#e8e6e0", "#6dbf8a"];
  for (let i = 0; i < 5; i++) v.box(4 + i * 6, 13, 5, 7 + i * 6, 15, 7, C(cols[i]));
  return v;
}

/** A tall standing sign frame (the zones' names and their game's card are pictures on it). */
export function signStand() {
  const v = m(14, 30, 4);
  v.box(0, 0, 1, 14, 1, 3, black);
  v.box(1, 1, 2, 2, 29, 3, C("#2a2632"));
  v.box(12, 1, 2, 13, 29, 3, C("#2a2632"));
  v.box(1, 29, 1, 13, 30, 3, C("#2a2632"));
  return v;
}

/**
 * A ZK LEGENDS duel table, 2.0 × 1.2 m (long side along x, the two players at ±z): a void top in a
 * gold-edged frame (the playmat is a picture laid on it), a lit rail down each player's side, two
 * columns on a plinth with a lilac light strip.
 */
export function duelTable() {
  const W = 24,
    D = 14,
    v = m(W, 10, D);
  const gold = C("#d8a838");
  v.box(0, 8, 0, W, 9, D, black);
  for (let x = 0; x < W; x++) {
    v.set(x, 9, 0, x % 3 ? C("#2a2632") : gold);
    v.set(x, 9, D - 1, x % 3 ? C("#2a2632") : gold);
  }
  for (let z = 0; z < D; z++) {
    v.set(0, 9, z, gold);
    v.set(W - 1, 9, z, gold);
  }
  // under the top: a skirt with a light strip along each player's side
  v.box(1, 7, 1, W - 1, 8, D - 1, C("#121016"));
  for (let x = 2; x < W - 2; x++) {
    v.set(x, 7, 0, E(x % 2 ? "#f4b728" : "#c4b1fc", 1.5));
    v.set(x, 7, D - 1, E(x % 2 ? "#f4b728" : "#c4b1fc", 1.5));
  }
  for (const x of [4, W - 6]) v.box(x, 1, D / 2 - 1, x + 2, 7, D / 2 + 1, black);
  v.box(2, 0, D / 2 - 3, W - 2, 1, D / 2 + 3, black);
  for (let x = 3; x < W - 3; x++) v.set(x, 1, D / 2 + 2, E("#c4b1fc", 1.3));
  return v;
}

/** Spectator tiers: `rows` stepped benches `w` m wide, rising away from +z (they face +z), a rail at the top. */
export function bleachers(w: number, rows = 3) {
  const W = Math.round(w * 12),
    D = rows * 9 + 2,
    v = m(W, rows * 5 + 12, D);
  const seat = (i: number) => C(i % 2 ? "#2a2440" : "#34285c");
  for (let r = 0; r < rows; r++) {
    const z0 = D - 2 - (r + 1) * 9,
      top = 5 + r * 5;
    v.box(0, 0, z0, W, top - 1, z0 + 9, C("#16141c"));
    v.box(0, top - 1, z0 + 1, W, top, z0 + 8, seat(r));
    // the riser's edge in light
    for (let x = 0; x < W; x += 2) v.set(x, top - 2, z0 + 8, E(r % 2 ? "#c4b1fc" : "#f4b728", 1.4));
  }
  // the top rail
  for (let x = 0; x < W; x += 6) v.box(x, rows * 5 + 4, 0, x + 1, rows * 5 + 11, 1, C("#5a5662"));
  v.box(0, rows * 5 + 11, 0, W, rows * 5 + 12, 1, C("#a9bcc4"));
  return v;
}

/** A high bar table, 0.7 m across, 1.1 m tall: a disc top on a column. */
export function highTable(top = "#2a2440") {
  const v = m(9, 14, 9);
  for (let z = 0; z < 9; z++)
    for (let x = 0; x < 9; x++) if (Math.hypot(x - 4, z - 4) <= 4.4) v.set(x, 13, z, C(top));
  v.box(4, 1, 4, 5, 13, 5, black);
  v.box(2, 0, 2, 7, 1, 7, black);
  for (let x = 2; x < 7; x++) v.set(x, 12, 4, E("#f4b728", 1.3));
  return v;
}

// ---- moving props (plain meshes) -------------------------------------------------------------------

const PIPS: number[][][] = [[], [[0, 0]], [[-1, -1], [1, 1]], [[-1, -1], [0, 0], [1, 1]], [[-1, -1], [1, -1], [-1, 1], [1, 1]], [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]]];

let dieMat: THREE.MeshStandardMaterial | null = null;
let dieGeo: THREE.BoxGeometry | null = null;
/**
 * A die (unit cube, scale it): one draw call, its six faces from one picture (a 3 × 2 atlas), the 1
 * in flare. Faces: +x 3, −x 4, +y 1, −y 6, +z 2, −z 5 (opposite faces add up to seven).
 */
export function die(size: number) {
  if (!dieMat) {
    const F = 128;
    const { t } = makeCanvas(F * 3, F * 2, (g) => {
      const order = [3, 4, 1, 6, 2, 5];
      order.forEach((n, i) => {
        const ox = (i % 3) * F,
          oy = Math.floor(i / 3) * F;
        g.fillStyle = "#f2eee6";
        g.fillRect(ox, oy, F, F);
        g.fillStyle = "#dcd6cb";
        g.fillRect(ox, oy, F, 4);
        g.fillRect(ox, oy, 4, F);
        g.fillStyle = n === 1 ? "#ff6b35" : "#16141c";
        for (const [u, v] of PIPS[n]) {
          g.beginPath();
          g.arc(ox + F / 2 + u * F * 0.27, oy + F / 2 + v * F * 0.27, F * (n === 1 ? 0.13 : 0.095), 0, Math.PI * 2);
          g.fill();
        }
      });
    });
    dieMat = new THREE.MeshStandardMaterial({ map: t, roughness: 0.35 });
    dieGeo = new THREE.BoxGeometry(1, 1, 1);
    const uv = dieGeo.attributes.uv as THREE.BufferAttribute;
    for (let f = 0; f < 6; f++) {
      const col = f % 3,
        row = Math.floor(f / 3);
      for (let k = 0; k < 4; k++) {
        const i = f * 4 + k;
        uv.setXY(i, (col + uv.getX(i)) / 3, 1 - (row + 1 - uv.getY(i)) / 2);
      }
    }
    uv.needsUpdate = true;
  }
  const mesh = new THREE.Mesh(dieGeo!, dieMat);
  mesh.scale.setScalar(size);
  return mesh;
}
/** The die's rotation that shows `n` on top. */
export function dieUp(n: number, out: THREE.Euler) {
  // +y shows 1; the others are brought up by a quarter turn
  const R: Record<number, [number, number, number]> = { 1: [0, 0, 0], 6: [Math.PI, 0, 0], 2: [-Math.PI / 2, 0, 0], 5: [Math.PI / 2, 0, 0], 3: [0, 0, Math.PI / 2], 4: [0, 0, -Math.PI / 2] };
  const r = R[n] ?? R[1];
  return out.set(r[0], r[1], r[2]);
}

let qMat: THREE.MeshStandardMaterial | null = null;
/** The party's Z-Block: flare, a "Z" on every side, a frame of rivets. */
export function qBlock(size: number) {
  if (!qMat) {
    const { t } = makeCanvas(128, 128, (g) => {
      g.fillStyle = "#ff6b35";
      g.fillRect(0, 0, 128, 128);
      g.fillStyle = "#ff8a5c";
      g.fillRect(6, 6, 116, 10);
      g.fillStyle = "#c2461c";
      g.fillRect(6, 112, 116, 10);
      g.strokeStyle = "#8a2f14";
      g.lineWidth = 6;
      g.strokeRect(3, 3, 122, 122);
      g.fillStyle = "#8a2f14";
      for (const [x, y] of [
        [16, 16],
        [112, 16],
        [16, 112],
        [112, 112],
      ]) {
        g.beginPath();
        g.arc(x, y, 5, 0, Math.PI * 2);
        g.fill();
      }
      g.font = '900 86px Geist, "Arial Black", sans-serif';
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillStyle = "#8a2f14";
      g.fillText("Z", 68, 72);
      g.fillStyle = "#fff6e8";
      g.fillText("Z", 64, 68);
    });
    qMat = new THREE.MeshStandardMaterial({ map: t, emissive: "#ffffff", emissiveMap: t, emissiveIntensity: 0.55, roughness: 0.5 });
  }
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), qMat);
  return mesh;
}

/** The tournament's cup: a polished bowl on a stem and a two-step plinth, a flare band round it. */
export function cup(chrome: THREE.Material, flare: THREE.Material) {
  const g = new THREE.Group();
  const pts: THREE.Vector2[] = [];
  const prof: [number, number][] = [
    [0, 0],
    [0.16, 0],
    [0.16, 0.05],
    [0.11, 0.07],
    [0.04, 0.1],
    [0.035, 0.24],
    [0.06, 0.27],
    [0.14, 0.32],
    [0.18, 0.42],
    [0.19, 0.5],
    [0.17, 0.5],
    [0.16, 0.42],
    [0.12, 0.34],
    [0, 0.3],
  ];
  for (const [x, y] of prof) pts.push(new THREE.Vector2(x, y));
  const bowl = new THREE.Mesh(new THREE.LatheGeometry(pts, 28), chrome);
  g.add(bowl);
  for (const s of [-1, 1]) {
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.012, 6, 16, Math.PI), chrome);
    handle.position.set(s * 0.19, 0.42, 0);
    handle.rotation.z = s > 0 ? -Math.PI / 2 : Math.PI / 2;
    g.add(handle);
  }
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.165, 0.012, 6, 28), flare);
  band.rotation.x = Math.PI / 2;
  band.position.y = 0.4;
  g.add(band);
  return g;
}

let cardGeo: THREE.PlaneGeometry | null = null;
const cardMats = new Map<string, THREE.MeshStandardMaterial>();
/**
 * A playing card lying on the felt (0.09 × 0.13 m), its face `face` up or its back: the house's backs
 * are void with a lilac ⓩ mark; faces are drawn per kind ("glyph" cards in the four colours, "poker"
 * cards with a rank and a suit).
 */
export function card(face: string) {
  cardGeo ??= new THREE.PlaneGeometry(0.09, 0.13).rotateX(-Math.PI / 2);
  let mat = cardMats.get(face);
  if (!mat) {
    const { t } = makeCanvas(90, 130, (g) => {
      g.fillStyle = "#f2eee6";
      rrect(g, 0, 0, 90, 130, 10);
      g.fill();
      if (face === "back") {
        g.fillStyle = "#16141c";
        rrect(g, 5, 5, 80, 120, 7);
        g.fill();
        drawMark(g, 45, 65, 56, "#c4b1fc", "#ff6b35");
      } else if (face.startsWith("lg:")) {
        // a ZK LEGENDS card: the faction's frame, a cost gem, a hooded zkSNARK, attack and health
        const [, col, n] = face.split(":");
        const k = Number(n) || 0;
        g.fillStyle = "#16141c";
        rrect(g, 3, 3, 84, 124, 8);
        g.fill();
        g.fillStyle = col;
        g.fillRect(8, 8, 74, 64);
        // the zkSNARK: a stepped hood, a face, two eyes
        const hood = ["#1c1a24", "#3a3442", "#e8e6e0", "#2a2440"][k % 4];
        g.fillStyle = hood;
        g.fillRect(27, 18, 36, 54);
        g.fillRect(23, 26, 44, 46);
        g.fillStyle = ["#e9c9a8", "#c4b1fc", "#6dbf8a", "#a8d8e8"][(k >> 1) % 4];
        g.fillRect(33, 30, 24, 22);
        g.fillStyle = ["#ff3b3b", "#16141c", "#f4b728", "#5cc8ff"][k % 4];
        g.fillRect(36, 37, 6, 5);
        g.fillRect(48, 37, 6, 5);
        g.fillStyle = "#e8e6e0";
        g.fillRect(10, 80, 70, 4);
        g.fillRect(10, 90, 52, 4);
        // the gems: cost top-left (Zcash gold), attack bottom-left, health bottom-right
        const gem = (x: number, y: number, c: string, v: number) => {
          g.fillStyle = c;
          g.fillRect(x - 11, y - 11, 22, 22);
          g.fillStyle = "#16141c";
          g.font = "800 17px Geist, sans-serif";
          g.textAlign = "center";
          g.textBaseline = "middle";
          g.fillText(String(v), x, y + 1);
        };
        gem(15, 15, "#f4b728", 1 + (k % 7));
        gem(15, 114, "#ff9a3c", 1 + ((k * 3) % 6));
        gem(75, 114, "#ff4d5e", 2 + ((k * 5) % 6));
      } else if (face.startsWith("glyph:")) {
        const c = face.slice(6);
        g.fillStyle = c;
        rrect(g, 5, 5, 80, 120, 7);
        g.fill();
        drawMark(g, 45, 65, 50, "rgba(255,255,255,0.9)", "#fff");
      } else {
        // poker: "A◆", "Q♠"…
        const red = /[◆♥]/.test(face);
        g.fillStyle = red ? "#c4302a" : "#16141c";
        g.font = "800 30px Geist, sans-serif";
        g.textAlign = "left";
        g.fillText(face.slice(0, -1), 8, 32);
        g.font = "800 48px Geist, sans-serif";
        g.textAlign = "center";
        g.fillText(face.slice(-1), 45, 92);
      }
    });
    mat = new THREE.MeshStandardMaterial({ map: t, roughness: 0.6 });
    cardMats.set(face, mat);
  }
  return new THREE.Mesh(cardGeo, mat);
}

const chipGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.008, 14);
const chipMats = new Map<string, THREE.MeshStandardMaterial>();
/** A stack of `n` chips of one colour (one draw call), its bottom at y = 0. */
export function chips(color: string, n: number) {
  let mat = chipMats.get(color);
  if (!mat) chipMats.set(color, (mat = new THREE.MeshStandardMaterial({ color, roughness: 0.45 })));
  const im = new THREE.InstancedMesh(chipGeo, mat, n);
  const mm = new THREE.Matrix4();
  for (let i = 0; i < n; i++) im.setMatrixAt(i, mm.makeTranslation((i % 3 === 1 ? 0.002 : 0) - 0.001, 0.004 + i * 0.0085, (i % 2) * 0.0015));
  im.raycast = () => {};
  return im;
}
