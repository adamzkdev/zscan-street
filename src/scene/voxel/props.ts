import { C, E, G, rand, shades, VoxelModel } from "./model";
import { lantern, P } from "./parts";

/** Street furniture and nature, each a small voxel model with its collision radius (metres). */
export interface Prop {
  model: VoxelModel;
  radius: number;
  /** Bulb position (voxels) when the prop is a light source. */
  light?: [number, number, number, string];
  /** Canopy sphere (voxels: x, y, z, radius) the cinematic camera should not sit inside. */
  canopy?: [number, number, number, number];
}

export type TreeKind = "round" | "blossom" | "pine" | "tall" | "bush" | "persimmon";

/** A tree with a branching trunk and a canopy of overlapping blobs, shaded top to bottom. */
export function tree(kind: TreeKind, seed: number): Prop {
  const r = rand(seed);
  const m = new VoxelModel(28, 44, 28);
  const cx = 14,
    cz = 14;
  const leaves =
    kind === "blossom"
      ? P.blossom
      : kind === "pine"
        ? shades(["#1f4a33", "#245a3a", "#1a402c"], 1, seed)
        : kind === "persimmon"
          ? shades(["#3a6a34", "#447a3a", "#355e30"], 1, seed)
          : shades(["#2f6b3c", "#3d8a4a", "#285c33", "#357a42", "#4a9a52"], 1, seed);
  if (kind === "bush") {
    m.blob(cx, 4, cz, 5, leaves, 0.3, seed);
    m.blob(cx + 3, 3, cz - 2, 3.5, leaves, 0.3, seed + 1);
    return { model: m, radius: 0.8 };
  }
  const trunkH = kind === "tall" ? 18 : kind === "pine" ? 8 : 11 + Math.floor(r() * 4);
  m.box(cx - 1, 0, cz - 1, cx + 1, trunkH, cz + 1, P.trunk);
  m.box(cx - 2, 0, cz - 2, cx + 2, 1, cz + 2, P.trunk);
  if (kind === "pine") {
    for (let k = 0; k < 5; k++) m.cylinder(cx, trunkH + k * 5, cz, 9 - k * 1.7, 5, leaves);
    m.box(cx, trunkH + 25, cz, cx + 1, trunkH + 28, cz + 1, leaves);
    return { model: m, radius: 0.5, canopy: [cx, trunkH + 10, cz, 10] };
  }
  // branches
  for (let i = 0; i < 3; i++) {
    const a = r() * Math.PI * 2;
    for (let k = 0; k < 5; k++) m.set(Math.round(cx + Math.cos(a) * k), trunkH - 3 + Math.floor(k * 0.8), Math.round(cz + Math.sin(a) * k), P.trunk);
  }
  const R = kind === "tall" ? 6 : 7 + r() * 2;
  const top = trunkH + 4;
  m.blob(cx, top, cz, R, leaves, 0.3, seed);
  for (let i = 0; i < 4; i++) {
    const a = r() * Math.PI * 2;
    m.blob(cx + Math.cos(a) * R * 0.6, top - 2 + r() * 4, cz + Math.sin(a) * R * 0.6, R * (0.55 + r() * 0.2), leaves, 0.35, seed + i);
  }
  m.blob(cx, top + R * 0.6, cz, R * 0.6, leaves, 0.3, seed + 9);
  if (kind === "blossom") for (let i = 0; i < 18; i++) m.set(Math.floor(cx - 9 + r() * 18), 0, Math.floor(cz - 9 + r() * 18), C("#e8a0c0"));
  if (kind === "persimmon") for (let i = 0; i < 14; i++) m.set(Math.floor(cx - R + r() * R * 2), Math.floor(top - R * 0.6 + r() * R), Math.floor(cz - R + r() * R * 2), C("#f08a2a"));
  return { model: m, radius: 0.35, canopy: [cx, top, cz, R * 1.3] };
}

/** Street lamp: base, pole, arm, head with a glowing lens. Arm reaches toward +z. */
export function streetLamp(color = "#ffb46b"): Prop {
  const m = new VoxelModel(6, 30, 12);
  const pole = C("#24222a");
  m.box(1, 0, 1, 4, 2, 4, pole);
  m.box(2, 2, 2, 3, 27, 3, pole);
  m.box(2, 26, 2, 3, 27, 9, pole);
  m.box(1, 25, 7, 4, 27, 11, C("#1c1b21"));
  m.box(1, 24, 7, 4, 25, 11, E(color, 3));
  return { model: m, radius: 0.18, light: [2.5, 23, 9, color] };
}

export function vendingMachine(theme: "red" | "blue" | "white" | "green"): Prop {
  const m = new VoxelModel(7, 12, 5);
  const body = { red: "#b8322e", blue: "#2e5ab8", white: "#e0dcd8", green: "#2e8a5a" }[theme];
  m.box(0, 0, 0, 7, 12, 5, C(body));
  m.box(0, 11, 0, 7, 12, 5, C("#2a2830"));
  // lit display of drinks
  m.box(1, 6, 4, 6, 11, 5, E("#f4f8ff", 1.6));
  const cans = ["#e05a5a", "#5ab0e0", "#e0c05a", "#7ad07a", "#f0f0f0", "#e08a3a"];
  for (let y = 7; y < 11; y += 2) for (let x = 1; x < 6; x++) m.set(x, y, 4, E(cans[(x * 3 + y) % cans.length], 1.2));
  for (let x = 1; x < 6; x++) m.set(x, 5, 4, E("#ff3a3a", 1.6));
  m.box(1, 1, 4, 6, 3, 5, C("#1a1820"));
  m.box(5, 4, 4, 6, 5, 5, C("#c0c0c8"));
  return { model: m, radius: 0.55 };
}

export function bench(): Prop {
  const m = new VoxelModel(12, 6, 4);
  const wood = P.woodLight;
  m.box(0, 3, 0, 12, 4, 3, wood);
  m.box(0, 4, 0, 12, 6, 1, wood);
  for (const x of [1, 10]) m.box(x, 0, 0, x + 1, 3, 3, C("#1c1b21"));
  return { model: m, radius: 0.5 };
}

export function bollard(): Prop {
  const m = new VoxelModel(2, 6, 2);
  m.box(0, 0, 0, 2, 6, 2, C("#2b2a31"));
  m.box(0, 4, 0, 2, 5, 2, C("#d8a02a"));
  return { model: m, radius: 0.18 };
}

export function cone(): Prop {
  const m = new VoxelModel(4, 5, 4);
  m.box(0, 0, 0, 4, 1, 4, C("#2a2a30"));
  m.box(1, 1, 1, 3, 4, 3, C("#ff6a1a"));
  m.box(1, 2, 1, 3, 3, 3, C("#f0f0f0"));
  m.box(1.5, 4, 1.5, 2.5, 5, 2.5, C("#ff6a1a"));
  return { model: m, radius: 0.25 };
}

export function trashBin(): Prop {
  const m = new VoxelModel(4, 6, 4);
  m.cylinder(2, 0, 2, 2, 5, C("#3a5a4a"));
  m.cylinder(2, 5, 2, 2.2, 1, C("#2a3a32"));
  return { model: m, radius: 0.35 };
}

export function trashBags(seed: number): Prop {
  const m = new VoxelModel(8, 4, 6);
  const bag = shades(["#1e1d24", "#26252e", "#2e2c36"], 1, seed);
  m.blob(2.5, 1.6, 2.5, 2.2, bag, 0.2, seed);
  m.blob(5.5, 1.4, 3.5, 2, bag, 0.2, seed + 1);
  m.blob(3.5, 1.2, 4.5, 1.8, C("#3a5a7a"), 0.2, seed + 2);
  return { model: m, radius: 0.5 };
}

export function bicycle(color: string): Prop {
  const m = new VoxelModel(2, 6, 10);
  const frame = C(color);
  for (const z of [0, 6]) {
    m.box(0.5, 0, z + 1, 1.5, 1, z + 3, P.black);
    m.box(0.5, 3, z + 1, 1.5, 4, z + 3, P.black);
    m.box(0.5, 1, z, 1.5, 3, z + 1, P.black);
    m.box(0.5, 1, z + 3, 1.5, 3, z + 4, P.black);
  }
  m.box(0.5, 3, 2, 1.5, 4, 8, frame);
  m.box(0.5, 4, 3, 1.5, 5, 4, P.black);
  m.box(0.5, 4, 7, 1.5, 6, 8, frame);
  m.box(0, 6, 7, 2, 7, 8, P.black);
  m.box(0.5, 5, 8, 1.5, 6, 10, C("#c0c0c8"));
  return { model: m, radius: 0.5 };
}

/** Wooden utility pole with crossarms, insulators and a transformer drum. */
export function utilityPole(): Prop {
  const m = new VoxelModel(16, 50, 4);
  const wood = C("#5a4a3a");
  m.box(7, 0, 1, 9, 48, 3, wood);
  for (const y of [40, 45]) {
    m.box(1, y, 1, 15, y + 1, 3, C("#3a3a40"));
    for (const x of [2, 6, 10, 13]) m.box(x, y + 1, 1.5, x + 1, y + 2, 2.5, C("#e0dcd0"));
  }
  m.cylinder(10.5, 30, 2, 2, 6, C("#7a7a84"));
  m.box(9, 33, 1, 10, 34, 3, P.metal);
  m.box(6, 20, 0, 10, 23, 1, C("#e0d050"));
  return { model: m, radius: 0.25 };
}

export function hydrant(): Prop {
  const m = new VoxelModel(3, 5, 3);
  m.box(0.5, 0, 0.5, 2.5, 4, 2.5, C("#c0302a"));
  m.box(0, 2, 1, 3, 3, 2, C("#c0302a"));
  m.box(1, 4, 1, 2, 5, 2, C("#a0201a"));
  return { model: m, radius: 0.2 };
}

export function mailbox(): Prop {
  const m = new VoxelModel(4, 9, 4);
  m.box(1.5, 0, 1.5, 2.5, 4, 2.5, C("#2a2830"));
  m.box(0, 4, 0, 4, 9, 4, C("#c0302a"));
  m.box(0.5, 7, 3.9, 3.5, 7.6, 4, P.black);
  return { model: m, radius: 0.35 };
}

export function crates(seed: number): Prop {
  const r = rand(seed);
  const m = new VoxelModel(10, 8, 8);
  const woods = [C("#8a6a44"), C("#7a5a38"), C("#9a7a50")];
  for (let i = 0; i < 4; i++) {
    const s = 3 + Math.floor(r() * 2);
    const x = Math.floor(r() * (10 - s)),
      z = Math.floor(r() * (8 - s));
    let y = 0;
    while (y < 6 && m.get(x + 1, y, z + 1)) y++;
    m.box(x, y, z, x + s, y + s, z + s, woods[i % 3]);
    m.box(x, y + s - 1, z, x + s, y + s, z + 1, C("#5a4028"));
  }
  return { model: m, radius: 0.8 };
}

export function barrel(color = "#3a5a8a"): Prop {
  const m = new VoxelModel(4, 6, 4);
  m.cylinder(2, 0, 2, 2, 6, C(color));
  m.cylinder(2, 1, 2, 2.1, 1, C("#2a2830"), true);
  m.cylinder(2, 4, 2, 2.1, 1, C("#2a2830"), true);
  return { model: m, radius: 0.35 };
}

/** Shipping container, 2.4 × 2.6 × 6 m, ribbed with doors at the +z end. */
export function container(color: string, seed: number): Prop {
  const m = new VoxelModel(15, 16, 36);
  const a = C(color),
    dark = C(darker(color, 0.8));
  m.box(0, 0, 0, 15, 16, 36, (x, _y, z) => ((x === 0 || x === 14 ? z : x) % 2 ? a : dark));
  m.box(0, 15, 0, 15, 16, 36, C(darker(color, 0.7)));
  for (const x of [3, 7, 11]) m.box(x, 1, 35, x + 1, 15, 36, C("#2a2830"));
  void seed;
  return { model: m, radius: 0 };
}

function darker(hex: string, k: number) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.round(v * k).toString(16).padStart(2, "0");
  return `#${f(n >> 16)}${f((n >> 8) & 255)}${f(n & 255)}`;
}

/** Bus shelter: glass back, roof with a light strip, bench and a lit advert panel. */
export function busShelter(): Prop {
  const m = new VoxelModel(28, 18, 10);
  const frame = C("#1c1b22");
  for (const x of [0, 27]) for (const z of [0, 9]) m.box(x, 0, z, x + 1, 16, z + 1, frame);
  m.box(-1, 16, -1, 29, 17, 11, C("#2a2832"));
  m.box(1, 15, 9, 27, 16, 10, E("#ffd9a0", 2.6));
  m.box(1, 2, 0, 27, 14, 1, G("#6a90b0"));
  m.box(3, 3, 1, 25, 4, 4, P.woodLight);
  m.box(26, 1, 1, 28, 15, 9, frame);
  m.box(26, 3, 9, 28, 14, 10, E("#f4b728", 1.4));
  return { model: m, radius: 0, light: [14, 14, 6, "#ffd28a"] };
}

/** Market stall: posts, striped cloth roof, crates of produce, a paper lantern. */
export function stall(cloth: string, seed: number): Prop {
  const r = rand(seed);
  const m = new VoxelModel(16, 16, 10);
  const post = C("#3a2a20");
  for (const x of [0, 15]) for (const z of [0, 9]) m.box(x, 0, z, x + 1, 13, z + 1, post);
  m.box(0, 0, 2, 16, 6, 8, P.wood);
  m.box(0, 6, 2, 16, 7, 8, P.woodLight);
  const produce = ["#e05a3a", "#f0a030", "#7ad05a", "#e0d05a", "#c03a6a", "#f08a2a"];
  for (let x = 1; x < 15; x += 3) m.box(x, 7, 3, x + 2, 8, 7, C(produce[Math.floor(r() * produce.length)]));
  const a = C(cloth),
    b = C("#e8e0d0");
  for (let k = 0; k < 6; k++) m.box(-1, 13 + Math.floor(k / 2), k + 2, 17, 14 + Math.floor(k / 2), k + 3, (x) => (Math.floor(x / 2) % 2 ? a : b));
  m.box(-1, 13, 7, 17, 14, 10, (x) => (Math.floor(x / 2) % 2 ? a : b));
  lantern(m, 1, 8, 8);
  m.box(4, 12, 8, 12, 13, 9, E("#ffd28a", 2));
  return { model: m, radius: 0, light: [8, 11, 8, "#ffcf8a"] };
}

export function planter(seed: number, flowers = false): Prop {
  const m = new VoxelModel(9, 9, 9);
  m.box(0, 0, 0, 9, 3, 9, C("#4a4552"));
  m.box(1, 3, 1, 8, 4, 8, P.soil);
  m.blob(4.5, 5.5, 4.5, 3.6, flowers ? P.blossom : P.leaf, 0.3, seed);
  return { model: m, radius: 0.75 };
}

export function fenceSegment(len: number): Prop {
  const m = new VoxelModel(len, 9, 1);
  const metal = C("#2a2832");
  for (let x = 0; x < len; x += 3) m.box(x, 0, 0, x + 1, 9, 1, metal);
  m.box(0, 8, 0, len, 9, 1, metal);
  m.box(0, 4, 0, len, 5, 1, metal);
  return { model: m, radius: 0 };
}

export function streetSign(): Prop {
  const m = new VoxelModel(6, 18, 2);
  m.box(2.5, 0, 0.5, 3.5, 16, 1.5, C("#9a98a0"));
  m.box(0, 13, 1, 6, 17, 2, C("#2a5aa8"));
  m.box(1, 14, 1.9, 5, 16, 2, C("#e8e8f0"));
  return { model: m, radius: 0.15 };
}

/** Stone lantern (tōrō) for the park paths. */
export function stoneLantern(): Prop {
  const m = new VoxelModel(6, 12, 6);
  const stone = shades(["#8a8680", "#7e7a74", "#94908a"], 1, 4);
  m.box(1, 0, 1, 5, 1, 5, stone);
  m.box(2, 1, 2, 4, 5, 4, stone);
  m.box(1, 5, 1, 5, 6, 5, stone);
  m.box(1, 6, 1, 5, 9, 5, E("#ffcf7a", 1.6));
  m.box(2, 6, 2, 4, 9, 4, stone);
  m.box(0, 9, 0, 6, 10, 6, stone);
  m.box(2, 10, 2, 4, 12, 4, stone);
  return { model: m, radius: 0.4, light: [3, 7, 3, "#ffcf7a"] };
}

/** Glass greenhouse with rows of seedlings and a green glow. */
export function greenhouse(): Prop {
  const m = new VoxelModel(72, 26, 36);
  const frame = C("#2a3a2e");
  const glass = G("#5a8a6a");
  m.box(0, 0, 0, 72, 2, 36, C("#5a5464"));
  for (let x = 0; x < 72; x += 8) m.box(x, 2, 0, x + 1, 18, 36, frame);
  m.box(0, 2, 0, 72, 18, 1, glass);
  m.box(0, 2, 35, 72, 18, 36, glass);
  m.box(0, 2, 0, 1, 18, 36, glass);
  m.box(71, 2, 0, 72, 18, 36, glass);
  for (let k = 0; k < 18; k++) {
    m.box(0, 18 + Math.floor(k / 2.2), k, 72, 19 + Math.floor(k / 2.2), k + 1, k % 6 ? glass : frame);
    m.box(0, 18 + Math.floor(k / 2.2), 35 - k, 72, 19 + Math.floor(k / 2.2), 36 - k, k % 6 ? glass : frame);
  }
  for (let x = 0; x < 72; x += 8) for (let k = 0; k < 18; k++) {
    m.set(x, 18 + Math.floor(k / 2.2), k, frame);
    m.set(x, 18 + Math.floor(k / 2.2), 35 - k, frame);
  }
  for (const z of [6, 16, 26]) {
    m.box(4, 2, z, 68, 5, z + 5, P.soil);
    for (let x = 5; x < 67; x += 3) m.blob(x, 6, z + 2.5, 1.6, P.leaf, 0.3, x * z);
  }
  m.box(2, 16, 2, 70, 17, 3, E("#9cffc0", 1.4));
  m.box(2, 16, 33, 70, 17, 34, E("#9cffc0", 1.4));
  return { model: m, radius: 0, light: [36, 12, 18, "#7dffb0"] };
}

/** Factory chimney with two violet ring lights. */
export function chimney(h: number): Prop {
  const m = new VoxelModel(14, h + 2, 14);
  m.cylinder(7, 0, 7, 6.5, 4, C("#3a3446"));
  m.cylinder(7, 4, 7, 5, h - 4, shades(["#4a4058", "#433a50", "#504662"], 2, h));
  m.cylinder(7, h - 1, 7, 5.6, 2, C("#2a2632"));
  for (const y of [Math.floor(h * 0.55), h - 4]) m.cylinder(7, y, 7, 5.6, 1, E("#b07bff", 2.6), true);
  for (let y = 6; y < h - 4; y += 2) m.set(12, y, 7, C("#2a2632"));
  return { model: m, radius: 1.1 };
}

/** Gantry crane over the container yard. */
export function gantry(span: number, len: number): Prop {
  const m = new VoxelModel(span, 72, len);
  const steel = C("#2e2a3a");
  for (const x of [0, span - 4]) for (const z of [0, len - 4]) m.box(x, 0, z, x + 4, 66, z + 4, steel);
  for (const x of [0, span - 4]) m.box(x, 62, 0, x + 4, 66, len, steel);
  for (const z of [0, len - 4]) m.box(0, 62, z, span, 66, z + 4, steel);
  m.box(0, 66, Math.floor(len / 2) - 2, span, 70, Math.floor(len / 2) + 2, steel);
  m.box(Math.floor(span / 2) - 8, 56, Math.floor(len / 2) - 6, Math.floor(span / 2) + 8, 62, Math.floor(len / 2) + 6, C("#7a52b0"));
  m.box(Math.floor(span / 2) - 6, 55, Math.floor(len / 2) + 6, Math.floor(span / 2) + 6, 56, Math.floor(len / 2) + 7, E("#d9a6ff", 2.4));
  for (const x of [2, span - 2]) m.box(x - 1, 60, len - 1, x + 1, 61, len, E("#d9a6ff", 3));
  for (let y = 4; y < 62; y += 8) for (const x of [0, span - 4]) m.box(x, y, 1, x + 4, y + 1, len - 1, C("#3a3446"));
  return { model: m, radius: 0, light: [Math.floor(span / 2), 54, Math.floor(len / 2), "#b07bff"] };
}

/** Round stone fountain basin with a jet stand (the water surface is added as a plane). */
export function fountain(): Prop {
  const m = new VoxelModel(40, 8, 40);
  const stone = shades(["#8a8490", "#827c88", "#928c98"], 1, 2);
  m.cylinder(20, 0, 20, 19.5, 4, stone, true);
  m.cylinder(20, 0, 20, 18, 1, C("#3a4a5a"));
  m.cylinder(20, 0, 20, 3, 7, stone);
  m.cylinder(20, 7, 20, 4, 1, stone);
  return { model: m, radius: 3.4 };
}

/** Wooden gate frame (two posts and lintels) for district entrances. */
export function gate(w: number): Prop {
  const m = new VoxelModel(w, 30, 4);
  const post = C("#2a2632");
  m.box(1, 0, 1, 3, 27, 3, post);
  m.box(w - 3, 0, 1, w - 1, 27, 3, post);
  m.box(0, 26, 0, w, 28, 4, post);
  m.box(1, 22, 1, w - 1, 23, 3, post);
  return { model: m, radius: 0 };
}

/** Bus stop pole: a round ⓩ plate and a lit timetable. */
export function stopPole(): Prop {
  const m = new VoxelModel(6, 22, 3);
  m.box(2.5, 0, 1, 3.5, 20, 2, C("#3a3842"));
  m.cylinder(3, 16, 1.5, 3, 1, E("#f4b728", 1.4));
  m.box(1, 16.5, 1, 5, 17.5, 2, C("#1a1a20"));
  m.box(1, 8, 2, 5, 14, 3, E("#fff0d0", 0.9));
  m.box(1, 8, 1, 5, 14, 2, C("#2a2830"));
  return { model: m, radius: 0.18 };
}

/** Taxi rank sign: a pole with a lit TAXI box. */
export function taxiSign(): Prop {
  const m = new VoxelModel(8, 24, 3);
  m.box(3.5, 0, 1, 4.5, 20, 2, C("#3a3842"));
  m.box(0, 18, 0, 8, 23, 3, C("#2a2a30"));
  m.box(1, 19, 2.5, 7, 22, 3, E("#ffc84a", 1.3));
  for (const x of [2, 4, 6]) m.box(x, 20, 2.8, x + 1, 21, 3, C("#2a2a30"));
  return { model: m, radius: 0.2 };
}

/** Low queue rail along the kerb. */
export function rail(len: number): Prop {
  const m = new VoxelModel(len * 6, 6, 1);
  const metal = C("#8a8894");
  for (let x = 0; x < len * 6; x += 6) m.box(x, 0, 0, x + 1, 6, 1, metal);
  m.box(0, 5, 0, len * 6, 6, 1, metal);
  return { model: m, radius: 0 };
}

/** Japanese maple: dark trunk, layered canopy in deep reds and orange. */
export function maple(seed: number): Prop {
  const r = rand(seed);
  const m = new VoxelModel(26, 34, 26);
  const leaves = shades(["#b8322a", "#d0452e", "#9a2420", "#e0602e", "#c03a2a"], 1, seed);
  m.box(12, 0, 12, 14, 9, 14, P.trunk);
  for (let i = 0; i < 3; i++) {
    const a = r() * Math.PI * 2;
    for (let k = 0; k < 6; k++) m.set(Math.round(13 + Math.cos(a) * k), 7 + Math.floor(k * 0.6), Math.round(13 + Math.sin(a) * k), P.trunk);
  }
  // flat, tiered clouds of leaves, like a pruned maple
  for (const [y, rad] of [
    [10, 9],
    [14, 8],
    [18, 6],
  ] as const) {
    for (let i = 0; i < 4; i++) {
      const a = r() * Math.PI * 2;
      m.blob(13 + Math.cos(a) * rad * 0.35, y + r() * 2, 13 + Math.sin(a) * rad * 0.35, rad * 0.62, leaves, 0.35, seed + y + i);
    }
  }
  for (let i = 0; i < 16; i++) m.set(Math.floor(4 + r() * 18), 0, Math.floor(4 + r() * 18), C("#c0402a"));
  return { model: m, radius: 0.35, canopy: [13, 14, 13, 9] };
}

/** A clump of bamboo: green canes with joints, leaves at the top. */
export function bamboo(seed: number): Prop {
  const r = rand(seed);
  const m = new VoxelModel(12, 40, 12);
  for (let i = 0; i < 9; i++) {
    const x = 2 + Math.floor(r() * 8),
      z = 2 + Math.floor(r() * 8),
      h = 22 + Math.floor(r() * 16);
    for (let y = 0; y < h; y++) m.set(x, y, z, y % 6 === 5 ? C("#5a7a3a") : C(r() > 0.5 ? "#7aa04a" : "#6a9040"));
    m.blob(x, h, z, 2.6, shades(["#4a8a3a", "#5aa04a", "#3a7a30"], 1, seed + i), 0.4, seed + i);
  }
  return { model: m, radius: 0.6 };
}

/** Arched red wooden bridge for the koi pond (spans x). */
export function bridge(): Prop {
  const m = new VoxelModel(36, 14, 10);
  const red = C("#b8302a");
  for (let x = 0; x < 36; x++) {
    const y = Math.round(Math.sin((x / 35) * Math.PI) * 5);
    m.box(x, y, 2, x + 1, y + 1, 8, P.woodLight);
    m.box(x, y + 1, 1, x + 1, y + 2, 2, red);
    m.box(x, y + 1, 8, x + 1, y + 2, 9, red);
    if (x % 5 === 0) {
      m.box(x, y, 1, x + 1, y + 5, 2, red);
      m.box(x, y, 8, x + 1, y + 5, 9, red);
    }
    m.box(x, y + 5, 1, x + 1, y + 6, 2, red);
    m.box(x, y + 5, 8, x + 1, y + 6, 9, red);
  }
  return { model: m, radius: 0 };
}

/** Stepping stones and a raked-gravel bed. */
export function steppingStones(seed: number): Prop {
  const r = rand(seed);
  const m = new VoxelModel(30, 2, 30);
  for (let z = 0; z < 30; z++) for (let x = 0; x < 30; x++) if (Math.hypot(x - 15, z - 15) < 14.5) m.set(x, 0, z, (x + z) % 3 ? C("#b8b2a6") : C("#a8a296"));
  for (let i = 0; i < 9; i++) {
    const x = 3 + i * 3 + Math.floor(r() * 2),
      z = 4 + Math.floor(Math.sin(i * 0.9) * 6 + 10);
    m.box(x - 1, 1, z - 1, x + 2, 2, z + 2, C("#6a6660"));
  }
  return { model: m, radius: 0 };
}

/** Three-tier fountain: wide basin, middle bowl, top spout, a ring of neon under the lip. */
export function tieredFountain(): Prop {
  const m = new VoxelModel(44, 22, 44);
  const stone = shades(["#8a8490", "#827c88", "#928c98"], 1, 2);
  m.cylinder(22, 0, 22, 21.5, 5, stone, true);
  m.cylinder(22, 0, 22, 20, 1, C("#2a3a4a"));
  m.cylinder(22, 4, 22, 22, 1, E("#3ef0ff", 1.4), true);
  m.cylinder(22, 0, 22, 3, 12, stone);
  m.cylinder(22, 10, 22, 10, 2, stone, true);
  m.cylinder(22, 10, 22, 9, 1, C("#2a3a4a"));
  m.cylinder(22, 11, 22, 10.4, 1, E("#ff3e8a", 1.2), true);
  m.cylinder(22, 12, 22, 2, 7, stone);
  m.cylinder(22, 18, 22, 4.5, 1.5, stone, true);
  return { model: m, radius: 3.7 };
}

/** Rooftop garden kit: a planter bed with small trees, flowers, a bench and string lights. */
export function roofGarden(w: number, d: number, seed: number): Prop {
  const r = rand(seed);
  const m = new VoxelModel(w, 20, d);
  m.box(0, 0, 0, w, 1, d, C("#3a2e28"));
  m.box(1, 1, 1, w - 1, 2, d - 1, P.soil);
  for (let x = 1; x < w - 1; x++) for (let z = 1; z < d - 1; z++) if (r() > 0.55) m.set(x, 2, z, r() > 0.7 ? C(["#e07ab0", "#f0c040", "#ffffff", "#c05ad0"][Math.floor(r() * 4)]) : P.leaf);
  for (let i = 0; i < Math.max(1, Math.floor((w * d) / 260)); i++) {
    const x = 4 + Math.floor(r() * (w - 8)),
      z = 4 + Math.floor(r() * (d - 8));
    m.box(x, 2, z, x + 1, 8, z + 1, P.trunk);
    m.blob(x, 10, z, 3.6, r() > 0.5 ? P.leaf : P.blossom, 0.35, seed + i);
  }
  for (let x = 0; x < w; x += 2) m.set(x, 14 + Math.round(Math.sin(x * 0.4)), 0, E(x % 4 ? "#ffd28a" : "#ff8ac0", 2));
  for (const x of [0, w - 1]) m.box(x, 1, 0, x + 1, 15, 1, P.metal);
  return { model: m, radius: 0 };
}
