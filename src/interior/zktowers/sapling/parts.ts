import * as THREE from "three";
import { Market } from "../../../data/market";
import { C, E, hash, shades, VoxelModel } from "../../../scene/voxel/model";
import type { PickInfo } from "../../types";
import { GOLD, MONO, num, paint, rr, SANS, type LiftStyle, type SkyKit } from "../kit";

/**
 * ZK TOWER SAPLING's own pieces: its palette and textures (pale oak, terrazzo, lawn, the living
 * wall), creepers, raised beds, the red mesh of the facade seen from inside, the Sapling pool
 * board, and voxel models made for this tower (rattan chairs, a hammock, a playground, hydroponic
 * racks, a DJ booth).
 */

export const GREEN = "#5cff9a";
export const SAP = {
  oak: "#d8b98c",
  oakDark: "#b08a5c",
  teak: "#9a6a40",
  stone: "#e8e2d6",
  stoneDark: "#bfb6a6",
  leaf: "#3d9440",
  leafDark: "#256a2c",
  mesh: ["#b8323a", "#c8444a", "#d0566a", "#a82a34", "#e0705a", "#c43c5c"],
  rattan: "#c89a5a",
  linen: "#efe8da",
  water: "#45d8e6",
};

export const LIFT: LiftStyle = { wall: "#e8e0d0", frame: "#9a6a40", door: "#c8ccd0", ink: "#2a3a2a", lit: "#5cff9a", accent: "#3ee08f", deco: "arch" };

// ---- textures --------------------------------------------------------------------------------------

/** Pale oak planks. */
export function oakTex(rx: number, ry: number, base = SAP.oak) {
  return paint(
    512,
    512,
    (g, W, H) => {
      const n = 8;
      const pw = W / n;
      for (let i = 0; i < n; i++) {
        let y = -hash(i, 1, 3, 4) * 200;
        while (y < H) {
          const len = 140 + hash(i, Math.floor(y), 2, 4) * 160;
          const c = new THREE.Color(base).offsetHSL(0, 0, (hash(i, Math.floor(y), 5, 4) - 0.5) * 0.08);
          g.fillStyle = `#${c.getHexString()}`;
          g.fillRect(i * pw, y, pw, len);
          g.fillStyle = "rgba(60,40,20,0.08)";
          for (let s = 0; s < 5; s++) g.fillRect(i * pw + 4 + s * 11, y, 1, len);
          g.fillStyle = "rgba(60,40,20,0.35)";
          g.fillRect(i * pw, y, pw, 2);
          y += len;
        }
        g.fillStyle = "rgba(60,40,20,0.35)";
        g.fillRect(i * pw, 0, 2, H);
      }
    },
    rx,
    ry,
  );
}

/** Pale terrazzo with green and grey chips. */
export function terrazzoTex(rx: number, ry: number) {
  return paint(
    512,
    512,
    (g, W, H) => {
      g.fillStyle = "#ebe6dc";
      g.fillRect(0, 0, W, H);
      const chips = ["#8aa890", "#5a7a62", "#bdb3a2", "#c8c2b6", "#9a8a78", "#f4f2ee"];
      for (let i = 0; i < 2600; i++) {
        g.fillStyle = chips[Math.floor(hash(i, 1, 9, 1) * chips.length)];
        const s = 2 + hash(i, 2, 9, 1) * 6;
        g.save();
        g.translate(hash(i, 3, 9, 1) * W, hash(i, 4, 9, 1) * H);
        g.rotate(hash(i, 5, 9, 1) * 3);
        g.fillRect(-s / 2, -s / 3, s, s * 0.66);
        g.restore();
      }
    },
    rx,
    ry,
  );
}

/** Lawn with mowing stripes. */
export function lawnTex(rx: number, ry: number) {
  return paint(
    256,
    256,
    (g, W, H) => {
      for (let i = 0; i < 4; i++) {
        g.fillStyle = i % 2 ? "#4f9a3e" : "#5aa846";
        g.fillRect(0, (i * H) / 4, W, H / 4);
      }
      for (let i = 0; i < 3000; i++) {
        g.fillStyle = ["#3f8a32", "#6ab852", "#4a9a3a", "#78c25a"][Math.floor(hash(i, 1, 2, 3) * 4)];
        g.fillRect(hash(i, 2, 2, 3) * W, hash(i, 3, 2, 3) * H, 1.5, 3);
      }
    },
    rx,
    ry,
  );
}

/** The living wall: ferns, philodendron and flowering clumps in a dense mat. */
export function livingTex(rx: number, ry: number, seed = 1) {
  return paint(
    512,
    512,
    (g, W, H) => {
      g.fillStyle = "#2a5a2c";
      g.fillRect(0, 0, W, H);
      const greens = ["#2f7a34", "#3d9440", "#256a2c", "#4aa84a", "#5cb84e", "#7ac860", "#1f5a26", "#8ad070"];
      for (let i = 0; i < 1500; i++) {
        const x = hash(i, 1, seed, 7) * W,
          y = hash(i, 2, seed, 7) * H;
        const r = 5 + hash(i, 3, seed, 7) * 16;
        g.fillStyle = greens[Math.floor(hash(Math.floor(x / 90), Math.floor(y / 90), i % 3, seed) * greens.length)];
        g.beginPath();
        g.ellipse(x, y, r, r * 0.5, hash(i, 4, seed, 7) * 3, 0, Math.PI * 2);
        g.fill();
      }
      const fl = ["#f06aa0", "#ffd04a", "#ff8a4a", "#f4f0f0", "#c070ff"];
      for (let i = 0; i < 50; i++) {
        const cx = hash(i, 5, seed, 7) * W,
          cy = hash(i, 6, seed, 7) * H;
        g.fillStyle = fl[Math.floor(hash(Math.floor(cx / 120), Math.floor(cy / 120), 9, seed) * fl.length)];
        for (let p = 0; p < 6; p++) g.fillRect(cx + (hash(i, p, 8, seed) - 0.5) * 14, cy + (hash(i, p, 9, seed) - 0.5) * 14, 3, 3);
      }
    },
    rx,
    ry,
  );
}

// ---- pieces ---------------------------------------------------------------------------------------

/** A living wall between (x0, z0) and (x1, z1) from y to y + h: textured mat, a voxel relief of leaves on it. */
export function livingWall(k: SkyKit, f: number, x0: number, z0: number, x1: number, z1: number, h: number, seed = 1, y = 0) {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const ry = -Math.atan2(z1 - z0, x1 - x0);
  const nx = Math.sin(ry),
    nz = Math.cos(ry);
  // the normal points to the room side: callers give the wall left-to-right as seen from the room
  const mat = new THREE.MeshStandardMaterial({ map: livingTex(Math.max(1, len / 4), Math.max(1, h / 4), seed), roughness: 0.95 });
  k.plane(f, len, h, mat, (x0 + x1) / 2 + nx * 0.02, y + h / 2, (z0 + z1) / 2 + nz * 0.02, 0, ry);
  // clumps standing off the mat
  const greens = ["#2f7a34", "#3d9440", "#4aa84a", "#5cb84e", "#256a2c", "#7ac860", "#1f5a26", "#3d9440", "#2f7a34", "#4aa84a", "#5cb84e", "#256a2c", "#3d9440", "#f06aa0", "#2f7a34", "#4aa84a", "#5cb84e", "#256a2c", "#3d9440", "#ffd04a"];
  const n = Math.round(len * h * 7);
  for (let i = 0; i < n; i++) {
    const t = hash(i, 1, seed, 3),
      yy = y + 0.1 + hash(i, 2, seed, 3) * (h - 0.2);
    const s = 0.07 + hash(i, 3, seed, 3) * 0.12;
    const px = x0 + (x1 - x0) * t + nx * s * 0.5,
      pz = z0 + (z1 - z0) * t + nz * s * 0.5;
    k.box(f, s * 1.3, s, s, px, yy, pz, greens[i % greens.length], "matte", ry + (hash(i, 4, seed, 3) - 0.5));
  }
  k.wall(f, x0, z0, x1, z1, h, "#2a3a2a", "matte", 0.1, y);
}

/** Creepers hanging from a ceiling edge between two points, at height `top`, up to `drop` long. */
export function creepers(k: SkyKit, f: number, x0: number, z0: number, x1: number, z1: number, top: number, drop = 1.6, seed = 1, every = 0.22) {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const n = Math.round(len / every);
  const greens = ["#2f7a34", "#3d9440", "#4aa84a", "#256a2c", "#5cb84e"];
  for (let i = 0; i < n; i++) {
    const t = (i + hash(i, 1, seed, 5) * 0.5) / n;
    const L = 0.2 + Math.pow(hash(i, 2, seed, 5), 1.5) * drop;
    const x = x0 + (x1 - x0) * t + (hash(i, 3, seed, 5) - 0.5) * 0.12,
      z = z0 + (z1 - z0) * t + (hash(i, 4, seed, 5) - 0.5) * 0.12;
    k.box(f, 0.05, L, 0.05, x, top - L, z, "#2f6a2c");
    for (let s = 0.1; s < L; s += 0.16) k.box(f, 0.13, 0.08, 0.09, x + (hash(i, Math.round(s * 10), seed, 6) - 0.5) * 0.1, top - s, z, greens[(i + Math.round(s * 10)) % greens.length], "matte", hash(i, Math.round(s * 10), seed, 8) * 3);
  }
}

/** A raised timber bed of greens (herbs, lettuce, flowers) w × d, its top at 0.55 m. */
export function bed(k: SkyKit, f: number, x: number, z: number, w: number, d: number, seed = 1, flowers = false) {
  k.box(f, w, 0.5, d, x, 0, z, SAP.teak);
  k.box(f, w - 0.12, 0.02, d - 0.12, x, 0.5, z, "#3a2a1c");
  const greens = flowers ? ["#3d9440", "#f06aa0", "#ffd04a", "#4aa84a", "#f4f0f0", "#ff8a4a"] : ["#3d9440", "#5cb84e", "#7ac860", "#2f7a34", "#a8d870"];
  const n = Math.round(w * d * 14);
  for (let i = 0; i < n; i++) {
    const px = x - w / 2 + 0.12 + hash(i, 1, seed, 2) * (w - 0.24),
      pz = z - d / 2 + 0.12 + hash(i, 2, seed, 2) * (d - 0.24);
    const s = 0.08 + hash(i, 3, seed, 2) * 0.12;
    k.box(f, s, s * 0.9, s, px, 0.52, pz, greens[Math.floor(hash(i, 4, seed, 2) * greens.length)], "matte", hash(i, 5, seed, 2) * 3);
  }
  k.solid(f, x - w / 2, z - d / 2, x + w / 2, z + d / 2);
}

/** A tree with a real trunk and a voxel canopy, growing out of the floor (a lawn or a planter). */
export function tree(k: SkyKit, f: number, x: number, z: number, h: number, r: number, seed = 1, palette = ["#2f7a34", "#3d9440", "#4aa84a", "#256a2c", "#5cb84e"]) {
  k.cyl(f, 0.16, 0.1, h * 0.65, x, 0, z, "#5a4030", "matte", 8);
  k.cyl(f, 0.06, 0.04, r * 0.9, x, h * 0.45, z, "#5a4030", "matte", 6, 0);
  const n = Math.round(r * r * 70);
  for (let i = 0; i < n; i++) {
    const a = hash(i, 1, seed, 9) * Math.PI * 2;
    const rr = Math.sqrt(hash(i, 2, seed, 9)) * r;
    const yy = h * 0.55 + hash(i, 3, seed, 9) * r * 1.1 - (rr / r) * r * 0.35;
    const s = 0.12 + hash(i, 4, seed, 9) * 0.14;
    k.box(f, s, s, s, x + Math.cos(a) * rr, yy, z + Math.sin(a) * rr, palette[i % palette.length], "matte", a);
  }
  k.solid(f, x - 0.3, z - 0.3, x + 0.3, z + 0.3);
}

/** The facade's red mesh seen from inside, a strip from (x0, z0) to (x1, z1) up to h: a lattice with creepers. */
export function meshScreen(k: SkyKit, f: number, x0: number, z0: number, x1: number, z1: number, h: number, seed = 1, y = 0, green = 0.35) {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const ry = -Math.atan2(z1 - z0, x1 - x0);
  const cols = Math.round(len / 0.5);
  const rows = Math.round(h / 0.5);
  for (let i = 0; i <= cols; i++) {
    const t = i / cols;
    const x = x0 + (x1 - x0) * t,
      z = z0 + (z1 - z0) * t;
    k.box(f, 0.06, h, 0.06, x, y, z, SAP.mesh[Math.floor(hash(i >> 2, 1, seed, 4) * SAP.mesh.length)], "matte", ry);
  }
  for (let j = 0; j <= rows; j++) k.wall(f, x0, z0, x1, z1, 0.05, SAP.mesh[j % SAP.mesh.length], "matte", 0.05, y + (j * h) / rows, false);
  const greens = ["#2f7a34", "#3d9440", "#4aa84a", "#256a2c"];
  for (let i = 0; i < cols; i++) {
    const reach = Math.pow(hash(i >> 1, 3, seed, 4), 1.4) * h * green * 2.4;
    for (let s = 0; s < reach; s += 0.14) {
      const t = (i + 0.5 + (hash(i, Math.round(s * 10), seed, 5) - 0.5) * 0.8) / cols;
      k.box(f, 0.14, 0.12, 0.1, x0 + (x1 - x0) * t, y + s, z0 + (z1 - z0) * t, greens[(i + Math.round(s * 7)) % 4], "matte", ry + hash(i, Math.round(s * 9), seed, 6));
    }
  }
}

// ---- voxel models (12 per metre, facing +z, centred) ---------------------------------------------

const vm = (w: number, h: number, d: number) => new VoxelModel(w, h, d);

/** A rattan egg chair on a stand, cushion inside. */
export function eggChair(cushion: string) {
  const v = vm(14, 22, 14);
  const r = shades([SAP.rattan, "#b8884a", "#d4a868"], 1, 3);
  for (let y = 4; y < 20; y++) {
    const t = (y - 4) / 16;
    const R = 6.5 * Math.sin(Math.PI * (0.15 + t * 0.75));
    for (let z = 0; z < 14; z++)
      for (let x = 0; x < 14; x++) {
        const d = Math.hypot(x + 0.5 - 7, z + 0.5 - 7);
        // open at the front (+z) from y 7 to 18
        if (d <= R && d > R - 1.2 && !(z > 7 && y > 7 && y < 18)) v.set(x, y, z, (x + y) % 3 === 0 ? C("#a8783a") : r);
      }
  }
  v.box(3, 7, 3, 11, 9, 11, C(cushion));
  v.box(4, 9, 3, 10, 14, 5, C(cushion));
  v.box(6, 0, 6, 8, 4, 8, C("#2a2830"));
  v.box(3, 0, 3, 11, 1, 11, C("#2a2830"));
  return v;
}

/** A low rattan lounge chair. */
export function rattanChair(cushion: string) {
  const v = vm(10, 10, 10);
  const r = shades([SAP.rattan, "#b8884a"], 1, 5);
  v.box(0, 0, 0, 10, 4, 10, r);
  v.box(0, 4, 0, 10, 10, 2, r);
  v.box(0, 4, 0, 1, 7, 10, r);
  v.box(9, 4, 0, 10, 7, 10, r);
  v.box(1, 4, 2, 9, 5, 10, C(cushion));
  v.box(1, 5, 2, 9, 9, 3, C(cushion));
  return v;
}

/** A hammock between two timber posts (along x, 3 m). */
export function hammock(color: string) {
  const v = vm(38, 18, 10);
  const post = shades([SAP.teak, "#8a5e38"], 1, 2);
  v.box(0, 0, 4, 2, 18, 6, post);
  v.box(36, 0, 4, 38, 18, 6, post);
  for (let x = 2; x < 36; x++) {
    const t = (x - 2) / 34;
    const y = Math.round(15 - Math.sin(t * Math.PI) * 9);
    v.box(x, y, 2, x + 1, y + 1, 8, C((x >> 2) % 2 ? color : "#f4f0e8"));
  }
  return v;
}

/** A playground: a slide, a climbing frame and a swing, on rubber. */
export function playground() {
  const v = vm(48, 34, 36);
  v.box(0, 0, 0, 48, 1, 36, C("#3a8a6a"));
  const red = C("#e04a3a"),
    yel = C("#f4c428"),
    blu = C("#3a8ae0"),
    wood = shades([SAP.teak, "#8a5e38"], 1, 7);
  // tower and slide
  for (const [x, z] of [[4, 4], [15, 4], [4, 15], [15, 15]]) v.box(x, 1, z, x + 2, 26, z + 2, wood);
  v.box(4, 13, 4, 17, 14, 17, wood);
  v.box(4, 26, 4, 17, 28, 17, red);
  v.box(5, 28, 5, 16, 30, 16, red);
  v.box(4, 14, 4, 17, 17, 5, yel);
  for (let s = 0; s < 20; s++) v.box(17 + s, 13 - Math.round(s * 0.62), 8, 18 + s, 14 - Math.round(s * 0.62), 13, s % 2 ? yel : C("#f8d850"));
  for (let s = 0; s < 6; s++) v.box(8, 1 + s * 2, 17 + s, 13, 2 + s * 2, 18 + s, blu);
  // swing frame
  v.box(26, 1, 26, 28, 24, 28, blu);
  v.box(44, 1, 26, 46, 24, 28, blu);
  v.box(26, 24, 26, 46, 26, 28, blu);
  for (const x of [31, 39]) {
    v.box(x, 8, 27, x + 1, 24, 28, C("#2a2830"));
    v.box(x + 3, 8, 27, x + 4, 24, 28, C("#2a2830"));
    v.box(x, 7, 25, x + 4, 8, 30, red);
  }
  return v;
}

/** A hydroponic rack: three trays of greens under pink grow lights. */
export function hydroRack(seed = 1) {
  const v = vm(28, 24, 8);
  const steel = C("#c8ccd0");
  for (const x of [0, 27]) for (const z of [0, 7]) v.box(x, 0, z, x + 1, 24, z + 1, steel);
  const greens = shades(["#3d9440", "#5cb84e", "#7ac860", "#a8d870"], 1, seed);
  for (const y of [2, 10, 18]) {
    v.box(0, y, 0, 28, y + 1, 8, C("#f4f4f0"));
    for (let x = 1; x < 27; x++) for (let z = 1; z < 7; z++) if (hash(x, y, z, seed) < 0.7) v.box(x, y + 1, z, x + 1, y + 2 + (hash(z, x, y, seed) < 0.4 ? 1 : 0), z + 1, greens);
    v.box(1, y + 6, 1, 27, y + 7, 7, E("#ff6ad8", 1.8));
  }
  return v;
}

/** A DJ booth: a timber desk with decks and a lit front. */
export function djBooth() {
  const v = vm(24, 14, 10);
  v.box(0, 0, 0, 24, 11, 10, shades([SAP.teak, "#8a5e38"], 1, 9));
  v.box(1, 2, 9, 23, 9, 10, (x, y) => ((x + y) % 4 === 0 ? E(GREEN, 2) : C("#1a1a20")));
  v.box(0, 11, 0, 24, 12, 10, C("#1a1a20"));
  v.box(3, 12, 2, 9, 13, 8, C("#2a2830"));
  v.box(15, 12, 2, 21, 13, 8, C("#2a2830"));
  v.box(10, 12, 3, 14, 13, 7, E("#3ef0ff", 1.6));
  return v;
}

/** A yoga mat (flat). */
export function yogaMat(color: string) {
  const v = vm(8, 1, 22);
  v.box(0, 0, 0, 8, 1, 22, C(color));
  return v;
}

// ---- live boards -----------------------------------------------------------------------------------

/** The Sapling pool: ZEC held, share of the shielded supply, 24 h move, and the other pools under it. */
export function drawSapling(g: CanvasRenderingContext2D, W: number, H: number) {
  const s = Math.min(H / 300, W / 520);
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#0a1a12");
  bg.addColorStop(1, "#040a07");
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  g.fillStyle = GREEN;
  g.fillRect(0, 0, W, Math.max(3, 4 * s));
  g.textAlign = "left";
  g.textBaseline = "alphabetic";
  g.font = `800 ${Math.round(28 * s)}px ${SANS}`;
  g.fillText("SAPLING POOL", 18 * s, 44 * s);
  const P = Market.state.pools;
  if (!P) return;
  const zec = (zat: number) => Math.round(zat / 1e8);
  g.fillStyle = "#f2f6ee";
  g.font = `800 ${Math.round(62 * s)}px ${MONO}`;
  g.fillText(`${num(zec(P.pools.sapling))}`, 18 * s, 116 * s);
  g.fillStyle = "#8fb89a";
  g.font = `600 ${Math.round(20 * s)}px ${MONO}`;
  g.fillText("ZEC", 18 * s, 142 * s);
  const ch = P.change_24h.sapling ?? 0;
  g.textAlign = "right";
  g.fillStyle = ch > 0 ? "#3ee08f" : ch < 0 ? "#ff5d6c" : "#8fb89a";
  g.font = `700 ${Math.round(24 * s)}px ${MONO}`;
  g.fillText(`${ch >= 0 ? "▲" : "▼"} ${num(Math.abs(zec(ch)))} 24H`, W - 18 * s, 142 * s);
  g.textAlign = "left";
  const keys = ["orchard", "ironwood", "sapling", "sprout", "transparent"] as const;
  const col: Record<string, string> = { transparent: "#eda100", sprout: "#9085e9", sapling: "#5cff9a", orchard: "#eb6834", ironwood: "#1baf7a" };
  const total = keys.reduce((a, k) => a + P.pools[k], 0) || 1;
  // one bar, split by pool
  let x = 18 * s;
  const bw = W - 36 * s;
  for (const k of keys) {
    const w = (P.pools[k] / total) * bw;
    g.fillStyle = col[k];
    rr(g, x, 160 * s, Math.max(2, w - 2), 22 * s, 4);
    g.fill();
    x += w;
  }
  keys.forEach((k, i) => {
    const cx = 18 * s + (i % 3) * (bw / 3),
      cy = 214 * s + Math.floor(i / 3) * 40 * s;
    g.fillStyle = col[k];
    g.fillRect(cx, cy - 14 * s, 12 * s, 12 * s);
    g.fillStyle = k === "sapling" ? "#f2f6ee" : "#a8b8ac";
    g.font = `${k === "sapling" ? 800 : 600} ${Math.round(16 * s)}px ${MONO}`;
    g.fillText(`${k.toUpperCase()} ${((P.pools[k] / total) * 100).toFixed(1)}%`, cx + 18 * s, cy - 2 * s);
  });
  g.fillStyle = GOLD;
  g.font = `700 ${Math.round(16 * s)}px ${MONO}`;
  g.fillText(`SHIELDED ${(P.shielded_ratio * 100).toFixed(1)}%`, 18 * s, H - 14 * s);
}

/** The Sapling pool's panel. */
export function saplingInfo(): PickInfo {
  const P = Market.state.pools;
  const zec = (zat: number) => `${num(Math.round(zat / 1e8))} ZEC`;
  if (!P) return { eyebrow: "Value pool", title: "Sapling", tag: ["loading", "muted"] };
  const total = P.pools.orchard + P.pools.ironwood + P.pools.sapling + P.pools.sprout + P.pools.transparent || 1;
  const ch = P.change_24h.sapling ?? 0;
  return {
    eyebrow: "Value pool · since 2018",
    title: "Sapling",
    tag: [`${((P.pools.sapling / total) * 100).toFixed(1)}% of all ZEC`, "info"],
    stats: [
      ["Held", zec(P.pools.sapling)],
      ["24 h", `${ch >= 0 ? "+" : "−"}${zec(Math.abs(ch))}`],
      ["Shielded total", zec(P.shielded)],
      ["Shielded share", `${(P.shielded_ratio * 100).toFixed(1)}%`],
    ],
  };
}
