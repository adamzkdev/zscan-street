import * as THREE from "three";
import type { Rect } from "../types";
import { bigPortrait, CardSet, cardMaterial, type Slot } from "./cards";
import { label, MONO, neonText, num, Panel, SANS, verticalNeon, zec } from "./look";
import { Shell } from "./shell";
import { andon, bench, desk, elevator, Furnisher, plant, plinth, rope, strut } from "./voxels";

/** One rank band of the collection, one floor of the building. */
export interface Band {
  from: number;
  to: number;
  name: string;
  /** Wall paint and neon of its floor; katakana for the vertical sign. */
  wall: string;
  accent: string;
  kana: string;
}

export const BANDS: Band[] = [
  { from: 1, to: 10, name: "Legendary", wall: "#3a1216", accent: "#f4b728", kana: "伝説" },
  { from: 11, to: 100, name: "Epic", wall: "#2a1434", accent: "#ff4fd8", kana: "叙事詩" },
  { from: 101, to: 500, name: "Rare", wall: "#0e2a31", accent: "#3ee6ff", kana: "レア" },
  { from: 501, to: 1000, name: "Superior", wall: "#13301f", accent: "#5dff9a", kana: "上等" },
  { from: 1001, to: 2500, name: "Uncommon", wall: "#141d3c", accent: "#6aa8ff", kana: "珍品" },
  { from: 2501, to: 5000, name: "Common", wall: "#231c33", accent: "#b48cff", kana: "一般" },
  { from: 5001, to: 10000, name: "Core", wall: "#341a10", accent: "#ff7a3a", kana: "基本" },
];

export const bandSize = (b: Band) => b.to - b.from + 1;
export const ranks = (b: Band) => `${num(b.from)}–${num(b.to)}`;

/** One item of the collection map: [id, rank, ask, bid, last, sales, volume, trait indices]. */
export type MapTuple = [number, number | null, number | null, number | null, number | null, number, number, number[]];

export interface GalleryData {
  supply: number;
  floor: number | null;
  listings: number | null;
  sales24: number | null;
  volume24: number | null;
  /** Items of each band, best rank first. */
  byBand: MapTuple[][];
  /** Median sale of the last 7 days per band, when trusted. */
  reference: (number | null)[];
}

export interface Built {
  group: THREE.Group;
  rects: Rect[];
  spawn: THREE.Vector3;
  yaw: number;
  /** Instanced cards: instance i is item i of the floor's band. */
  cards?: CardSet;
  /** Big portraits: the band's item `index`. */
  bigs: { pic: THREE.Mesh; band: number; index: number }[];
  /** Extra clickable things (the info desk, the mosaic, the street board). */
  extra: THREE.Object3D[];
  refresh(d: GalleryData): void;
}

const WARM = "#ffe6c0";

/** Facing helpers: the yaw of a plane whose front faces +x, −x, +z, −z. */
const FACE = { px: Math.PI / 2, nx: -Math.PI / 2, pz: 0, nz: Math.PI };

/** Six ceiling lights per floor on every floor, so changing floors never recompiles a shader. */
function lights(group: THREE.Group, pts: [number, number, number][], color = "#ffd9a8", intensity = 3) {
  for (let i = 0; i < 6; i++) {
    const [x, y, z] = pts[i % pts.length];
    const l = new THREE.PointLight(color, intensity, 16, 1.4);
    l.position.set(x, y, z);
    group.add(l);
  }
}

/** Neon floor number over the elevator plus its band name. */
function elevatorSign(f: Furnisher, group: THREE.Group, accent: string, big: string, small: string, z = 0) {
  f.add(`elev-${accent}`, () => elevator(accent), 0, 0, z - 0.32, Math.PI);
  const p = new Panel(512, 160, 2.6, { glow: true });
  p.draw((g, w, h) => {
    g.textBaseline = "middle";
    g.textAlign = "center";
    neonText(g, big, 70, h / 2 + 6, `800 120px ${MONO}`, accent, 26);
    g.textAlign = "left";
    neonText(g, small.toUpperCase(), 150, h / 2 + 4, `700 52px ${MONO}`, "#f6e7c8", 12);
    void w;
  });
  p.mesh.position.set(0, 4.05, z - 0.17);
  p.mesh.rotation.y = FACE.nz;
  group.add(p.mesh);
}

/** Directory of the floors, as by any museum lift. */
function directory(widthM: number, here: number) {
  const p = new Panel(720, 720, widthM, { transparent: false });
  p.draw((g, w, h) => {
    g.fillStyle = "#0a090c";
    g.fillRect(0, 0, w, h);
    g.strokeStyle = "#f4b728";
    g.lineWidth = 3;
    g.strokeRect(16, 16, w - 32, h - 32);
    g.font = `700 40px ${MONO}`;
    g.fillStyle = "#f4b728";
    g.fillText("FLOOR GUIDE  案内", 48, 84);
    g.fillRect(48, 104, w - 96, 2);
    type Row = [string, string, string, string];
    const rows: Row[] = [["G", "Lobby · the ten Legendaries", "", "#f4b728"] as Row, ...BANDS.map((b, i): Row => [String(i + 1), b.name, `#${ranks(b)}`, b.accent])].reverse();
    rows.forEach(([k, name, r, c], i) => {
      const y = 160 + i * 66;
      const on = (k === "G" ? 0 : Number(k)) === here;
      if (on) {
        g.fillStyle = "rgba(244,183,40,0.14)";
        g.fillRect(36, y - 40, w - 72, 58);
      }
      g.fillStyle = c;
      g.fillRect(48, y - 30, 44, 44);
      g.fillStyle = "#0a090c";
      g.font = `800 32px ${MONO}`;
      g.textAlign = "center";
      g.fillText(k, 70, y + 3);
      g.textAlign = "left";
      g.fillStyle = on ? "#ffffff" : "#d8d4cc";
      g.font = `600 30px ${SANS}`;
      g.fillText(name, 112, y);
      g.fillStyle = "#8a8590";
      g.font = `500 24px ${MONO}`;
      g.textAlign = "right";
      g.fillText(r, w - 52, y);
      g.textAlign = "left";
    });
  });
  return p.mesh;
}


// ---------------------------------------------------------------------------------------------
// Upper floors: a nave with bays on both sides, cards hung salon style on three walls of each bay

interface HallOpts {
  band: number;
  /** Card size and spacing (metres), rows per wall, centre height of the lowest row. */
  s: number;
  pitch: number;
  rows: number;
  y0: number;
  bayW: number;
  bayD: number;
  nave: number;
}

export function buildHall(o: HallOpts): Built {
  const b = BANDS[o.band];
  const count = bandSize(b);
  const group = new THREE.Group();
  const T = 0.3;
  const H = Math.max(4.2, o.y0 + (o.rows - 1) * o.pitch + o.s / 2 + 1.15);
  const shell = new Shell(group, H, b.wall);
  const f = new Furnisher();
  const V = 5; // vestibule depth
  const E = 4; // end court depth
  const X = o.nave / 2 + o.bayD;
  const cols = (L: number) => Math.max(1, Math.floor((L - 0.5) / o.pitch));
  const perBay = (2 * cols(o.bayD - T / 2) + cols(o.bayW)) * o.rows;
  const nb = Math.ceil(count / (2 * perBay));
  const zPart = (k: number) => -V - k * (o.bayW + T);
  const L = V + nb * (o.bayW + T) + E;

  // outer walls, partitions
  shell.wall(-X - T / 2, 0, X + T / 2, 0);
  shell.wall(-X - T / 2, -L, X + T / 2, -L);
  shell.wall(-X, 0, -X, -L);
  shell.wall(X, 0, X, -L);
  for (let k = 0; k <= nb; k++)
    for (const sg of [-1, 1]) {
      const z = zPart(k);
      shell.wall(sg * X, z, sg * (o.nave / 2), z, T);
      // neon edge on the partition's nave end, and a brass cap
      shell.strip(b.accent, 0.03, H - 1.0, 0.03, sg * (o.nave / 2) - sg * 0.015, 0.5, z + 0.1, 1.15);
      shell.strip(b.accent, 0.03, H - 1.0, 0.03, sg * (o.nave / 2) - sg * 0.015, 0.5, z - 0.1, 1.15);
    }
  shell.plates(-X, X, 0, -L);

  // ceiling: twin light lines down the nave, a wall-washer line in every bay
  for (const x of [-0.9, 0.9]) shell.strip(WARM, 0.12, 0.04, L - 1, x, H - 0.04, -L / 2, 1.15);
  shell.lacquerBox(o.nave - 0.6, 0.12, L - 0.6, 0, H - 0.12, -L / 2);
  for (const x of [-0.9, 0.9]) shell.strip(WARM, 0.1, 0.03, L - 1.2, x, H - 0.15, -L / 2, 1.15);

  // the cards
  const slots: Slot[] = [];
  const hang = (ax: number, az: number, bx: number, bz: number, yaw: number) => {
    const len = Math.hypot(bx - ax, bz - az);
    const n = cols(len);
    const ux = (bx - ax) / len,
      uz = (bz - az) / len;
    const off = (len - n * o.pitch) / 2;
    for (let c = 0; c < n; c++)
      for (let r = o.rows - 1; r >= 0; r--) {
        if (slots.length >= count) return;
        const d = off + o.pitch * (c + 0.5);
        slots.push({ x: ax + ux * d, y: o.y0 + r * o.pitch, z: az + uz * d, yaw, s: o.s });
      }
    // spots washing this wall
    const nw = Math.max(1, Math.round(len / 1.5));
    for (let i = 0; i < nw; i++) {
      const d = (len * (i + 0.5)) / nw;
      shell.wash(ax + ux * d, az + uz * d, yaw, Math.min(2.2, (len / nw) * 1.5), H - 0.4);
    }
  };
  const signs: { mesh: THREE.Mesh; first: number; last: number }[] = [];
  for (let k = 0; k < nb; k++)
    for (const sg of [-1, 1]) {
      const zA = zPart(k) - T / 2,
        zC = zPart(k + 1) + T / 2;
      const xin = sg * (o.nave / 2),
        xout = sg * (X - T / 2);
      const first = slots.length;
      if (first >= count) continue;
      // walking into the bay from the nave: the near partition, the back wall, the far partition
      hang(xin, zA, xout, zA, FACE.nz);
      hang(xout, zA, xout, zC, sg < 0 ? FACE.px : FACE.nx);
      hang(xout, zC, xin, zC, FACE.pz);
      const last = slots.length - 1;
      const zc = (zA + zC) / 2;
      shell.strip(WARM, 0.08, 0.03, o.bayW - 0.8, xout - sg * 0.9, H - 0.03, zc, 1.15);
      shell.strip(WARM, Math.abs(xout - xin) - 1.2, 0.03, 0.08, (xin + xout) / 2, H - 0.03, zA - 0.7, 1.15);
      shell.strip(WARM, Math.abs(xout - xin) - 1.2, 0.03, 0.08, (xin + xout) / 2, H - 0.03, zC + 0.7, 1.15);
      shell.pool((xin + xout) / 2, zc, Math.min(o.bayW, o.bayD) * 0.42, "#ffe0b0");
      // hanging sign at the bay mouth, facing the nave
      const sign = new Panel(640, 220, 1.7, { transparent: true });
      sign.mesh.position.set(xin - sg * 0.02, H - 0.62, zc);
      sign.mesh.rotation.y = sg < 0 ? FACE.px : FACE.nx;
      group.add(sign.mesh);
      shell.brassBox(0.02, 0.45, 0.02, xin - sg * 0.02, H - 0.45, zc - 0.7);
      shell.brassBox(0.02, 0.45, 0.02, xin - sg * 0.02, H - 0.45, zc + 0.7);
      signs.push({ mesh: sign.mesh, first, last });
      drawBaySign(sign, b, first, last, k * 2 + (sg > 0 ? 1 : 0), null);
      (sign.mesh.userData as { panel: Panel }).panel = sign;
      // a bench to look from, every bay
      if (sg > 0) {
        f.add("bench2", () => bench(2), 0, 0, zc, Math.PI / 2);
        shell.rects.push([-0.36, zc - 1.02, 0.36, zc + 1.02]);
        shell.pool(0, zc, 1.5, b.accent);
      }
    }
  const cards = new CardSet(slots);
  cards.addTo(group);

  // vestibule: elevator, floor guide, the floor's statement
  elevatorSign(f, group, b.accent, String(o.band + 1), `${b.name}`, 0);
  shell.rects.push([-1.6, -0.6, 1.6, 0]);
  const guide = directory(1.5, o.band + 1);
  guide.position.set(-2.9, 1.75, -0.16);
  guide.rotation.y = FACE.nz;
  group.add(guide);
  const intro = new Panel(1024, 640, 2.6);
  intro.mesh.position.set(3.3, 1.8, -0.16);
  intro.mesh.rotation.y = FACE.nz;
  group.add(intro.mesh);
  const drawIntro = (d: GalleryData | null) =>
    intro.draw((g, w, h) => {
      g.fillStyle = "rgba(10,9,12,0.94)";
      g.fillRect(0, 0, w, h);
      g.fillStyle = b.accent;
      g.fillRect(0, 0, 14, h);
      g.font = `600 40px ${MONO}`;
      g.fillText(`FLOOR ${o.band + 1}  ·  ${b.kana}`, 60, 80);
      g.font = `800 112px ${SANS}`;
      g.fillStyle = "#f6f2ea";
      g.fillText(b.name, 56, 210);
      g.font = `500 44px ${MONO}`;
      g.fillStyle = "#cfcac2";
      g.fillText(`Ranks #${ranks(b)}`, 60, 290);
      g.fillText(`${num(count)} portraits, rarest first`, 60, 350);
      const items = d?.byBand[o.band] ?? [];
      const asks = items.map((i) => i[2]).filter((a): a is number => a != null);
      g.fillStyle = "#f4b728";
      g.font = `600 40px ${MONO}`;
      g.fillText(d ? `${num(asks.length)} listed · cheapest ${asks.length ? zec(Math.min(...asks)) : "—"}` : "Loading the market…", 60, 450);
      g.fillStyle = "#a3a3a3";
      g.fillText(d ? `Band median 7d: ${zec(d.reference[o.band])}` : "", 60, 510);
      g.font = `400 30px ${MONO}`;
      g.fillStyle = "#737373";
      g.fillText("Walk the nave · click any portrait", 60, 590);
    });
  drawIntro(null);
  for (const sg of [-1, 1]) {
    f.add("andon", andon, sg * (o.nave / 2 + 0.6), 0, zPart(0) + 0.65);
    f.add(`bamboo-${sg}`, () => plant("bamboo", 40 + sg), sg * (X - 0.8), 0, -0.9);
    shell.rects.push([sg * (X - 0.8) - 0.6, -1.5, sg * (X - 0.8) + 0.6, -0.3]);
    shell.rects.push([sg * (o.nave / 2 + 0.6) - 0.4, zPart(0) + 0.3, sg * (o.nave / 2 + 0.6) + 0.4, zPart(0) + 1]);
  }
  shell.pool(0, -2.4, 2.2, b.accent);

  // end court: the floor's name in neon, katakana signs, a bench
  const title = new Panel(1400, 300, 7.5, { glow: true });
  title.draw((g, w, h) => {
    g.textAlign = "center";
    g.textBaseline = "middle";
    neonText(g, b.name.toUpperCase(), w / 2, h / 2 - 20, `800 150px ${MONO}`, b.accent, 34);
    g.font = `600 44px ${MONO}`;
    g.fillStyle = "#f6e7c8";
    g.fillText(`RANKS ${ranks(b)}`, w / 2, h - 34);
  });
  title.mesh.position.set(0, H - 1.6, -L + 0.17);
  group.add(title.mesh);
  for (const sg of [-1, 1]) {
    const v = verticalNeon(b.kana, sg < 0 ? b.accent : "#f4b728", Math.min(2.6, H - 1.6));
    v.position.set(sg * (X - 0.7), H / 2 + 0.2, -L + 0.17);
    group.add(v);
    f.add(`shrub-${sg}`, () => plant("shrub", 50 + sg), sg * (X - 0.7), 0, -L + 0.9);
    shell.rects.push([sg * (X - 0.7) - 0.6, -L, sg * (X - 0.7) + 0.6, -L + 1.5]);
  }
  f.add("bench3", () => bench(3), 0, 0, -L + 2, 0);
  shell.rects.push([-1.55, -L + 1.6, 1.55, -L + 2.4]);
  shell.pool(0, -L + 1.8, 3.2, b.accent);

  const rects = shell.build();
  group.add(f.build());
  lights(
    group,
    Array.from({ length: 6 }, (_, i) => [0, H - 0.5, -V + 1 - ((L - V - 1) * i) / 5] as [number, number, number]),
  );
  return {
    group,
    rects,
    spawn: new THREE.Vector3(0, 0, -2.2),
    yaw: 0,
    cards,
    bigs: [],
    extra: [],
    refresh(d) {
      drawIntro(d);
      signs.forEach((s, i) => drawBaySign((s.mesh.userData as { panel: Panel }).panel, b, s.first, s.last, i, d.byBand[o.band]));
      cards.setItems(d.byBand[o.band].map((t) => t[0]));
    },
  };
}

function drawBaySign(p: Panel, b: Band, first: number, last: number, bay: number, items: MapTuple[] | null) {
  p.draw((g, w, h) => {
    g.fillStyle = "rgba(8,7,10,0.96)";
    g.fillRect(0, 0, w, h);
    g.strokeStyle = b.accent;
    g.lineWidth = 4;
    g.strokeRect(6, 6, w - 12, h - 12);
    g.textBaseline = "alphabetic";
    g.font = `600 30px ${MONO}`;
    g.fillStyle = b.accent;
    g.fillText(`ROOM ${String(bay + 1).padStart(2, "0")}  ·  ${b.name.toUpperCase()}`, 34, 58);
    g.font = `800 92px ${MONO}`;
    g.fillStyle = "#f6f2ea";
    const lo = items?.[first]?.[1] ?? b.from + first,
      hi = items?.[last]?.[1] ?? b.from + last;
    g.fillText(`#${num(lo)}–${num(hi)}`, 30, 158);
    g.font = `500 28px ${MONO}`;
    g.fillStyle = "#a3a3a3";
    const listed = items ? items.slice(first, last + 1).filter((t) => t[2] != null).length : null;
    g.fillText(`${last - first + 1} portraits${listed != null ? ` · ${listed} listed` : ""}`, 34, 200);
  });
}

// ---------------------------------------------------------------------------------------------
// Floor 1: the Legendary vault, ten big portraits

export function buildVault(): Built {
  const b = BANDS[0];
  const group = new THREE.Group();
  const H = 5.4,
    X = 7,
    L = 19;
  const shell = new Shell(group, H, b.wall);
  const f = new Furnisher();
  shell.wall(-X - 0.15, 0, X + 0.15, 0);
  shell.wall(-X - 0.15, -L, X + 0.15, -L);
  shell.wall(-X, 0, -X, -L);
  shell.wall(X, 0, X, -L);
  shell.plates(-X, X, 0, -L, "#100c0e");
  // coffered ceiling: brass grid and warm panels
  for (let z = -3; z > -L + 1; z -= 3) shell.brassBox(2 * X - 0.4, 0.08, 0.08, 0, H - 0.1, z);
  for (const x of [-3.5, 0, 3.5]) shell.brassBox(0.08, 0.08, L - 0.4, x, H - 0.1, -L / 2);
  for (const x of [-1.75, 1.75]) shell.strip(WARM, 0.18, 0.03, L - 2, x, H - 0.03, -L / 2, 1.15);
  const bigs: Built["bigs"] = [];
  for (let i = 0; i < 10; i++) {
    const sg = i % 2 === 0 ? -1 : 1;
    const z = -4.2 - Math.floor(i / 2) * 3;
    const { group: pg, pic } = bigPortrait(1.5);
    pg.position.set(sg * (X - 0.15), 2.05, z);
    pg.rotation.y = sg < 0 ? FACE.px : FACE.nx;
    group.add(pg);
    bigs.push({ pic, band: 0, index: i });
    shell.wash(sg * (X - 0.15), z, sg < 0 ? FACE.px : FACE.nx, 2.6, H - 0.3, "#ffd9a0");
    shell.pool(sg * (X - 1.4), z, 1.3, "#ffd9a0");
    // rope in front of each portrait
    f.add("rope2", () => rope(2), sg * (X - 1.1), 0, z, Math.PI / 2);
    shell.rects.push([sg * (X - 1.1) - 0.15 - (sg > 0 ? 0 : 0), z - 1.1, sg * (X - 1.1) + 0.15, z + 1.1]);
    const lab = label(`#${i + 1}`, "Rank · Legendary", b.accent, 0.62);
    lab.position.set(sg * (X - 0.16), 1.0, z + 1.15);
    lab.rotation.y = sg < 0 ? FACE.px : FACE.nx;
    lab.userData.rankLabel = i;
    group.add(lab);
  }
  for (const z of [-7, -13]) {
    f.add("bench3", () => bench(3), 0, 0, z, Math.PI / 2);
    shell.rects.push([-0.36, z - 1.52, 0.36, z + 1.52]);
  }
  elevatorSign(f, group, b.accent, "1", "Legendary", 0);
  shell.rects.push([-1.6, -0.6, 1.6, 0]);
  const guide = directory(1.4, 1);
  guide.position.set(-3, 1.75, -0.16);
  guide.rotation.y = FACE.nz;
  group.add(guide);
  const title = new Panel(1400, 300, 8, { glow: true });
  title.draw((g, w, h) => {
    g.textAlign = "center";
    g.textBaseline = "middle";
    neonText(g, "LEGENDARY", w / 2, h / 2 - 20, `800 160px ${MONO}`, b.accent, 36);
    g.font = `600 44px ${MONO}`;
    g.fillStyle = "#f6e7c8";
    g.fillText("THE TEN RAREST zkSNARKs · RANKS 1–10", w / 2, h - 30);
  });
  title.mesh.position.set(0, 3.3, -L + 0.17);
  group.add(title.mesh);
  for (const sg of [-1, 1]) {
    const v = verticalNeon(b.kana, sg < 0 ? "#ff4f5e" : b.accent, 2.4);
    v.position.set(sg * 4.6, 2.4, -L + 0.17);
    group.add(v);
    f.add("andon", andon, sg * 5.8, 0, -L + 0.8);
    shell.rects.push([sg * 5.8 - 0.4, -L, sg * 5.8 + 0.4, -L + 1.2]);
    f.add(`bamboo-${sg}`, () => plant("bamboo", 40 + sg), sg * 5.6, 0, -0.9);
    shell.rects.push([sg * 5.6 - 0.6, -1.5, sg * 5.6 + 0.6, -0.3]);
  }
  shell.pool(0, -L + 2, 3, b.accent);
  shell.pool(0, -2.4, 2, b.accent);
  const rects = shell.build();
  group.add(f.build());
  lights(group, [
    [-4, H - 0.6, -5],
    [4, H - 0.6, -5],
    [-4, H - 0.6, -11],
    [4, H - 0.6, -11],
    [-4, H - 0.6, -16],
    [4, H - 0.6, -16],
  ], "#ffcf94", 4);
  return {
    group,
    rects,
    spawn: new THREE.Vector3(0, 0, -2.2),
    yaw: 0,
    bigs,
    extra: [],
    refresh() {},
  };
}

// ---------------------------------------------------------------------------------------------
// Ground floor: the lobby

export interface Lobby extends Built {
  /** The whole collection as one wall mosaic (the atlas, 100 × 100). */
  mosaic: THREE.Mesh;
  desk: THREE.Object3D;
  /** "On the street right now": thumbnails of the zkSNARKs walking outside. */
  street: CardSet;
  streetBoard: Panel;
}

export function buildLobby(): Lobby {
  const group = new THREE.Group();
  const H = 9,
    X = 14,
    L = 28;
  const gold = "#f4b728";
  const shell = new Shell(group, H, "#17141a");
  const f = new Furnisher();
  shell.wall(-X - 0.15, 0, X + 0.15, 0);
  shell.wall(-X - 0.15, -L, X + 0.15, -L);
  shell.wall(-X, 0, -X, -L);
  shell.wall(X, 0, X, -L);
  shell.plates(-X, X, 0, -L, "#0f0d11");
  // black lacquer columns with brass capitals and neon edges, carrying a brass ceiling grid
  for (const sg of [-1, 1])
    for (const z of [-6, -13, -20]) {
      const x = sg * 8.5;
      shell.lacquerBox(0.8, H, 0.8, x, 0, z);
      shell.rects.push([x - 0.4, z - 0.4, x + 0.4, z + 0.4]);
      shell.brassBox(1.0, 0.3, 1.0, x, H - 0.5, z);
      shell.brassBox(1.0, 0.2, 1.0, x, 0, z);
      shell.strip(gold, 0.04, H - 1.4, 0.04, x - sg * 0.41, 0.6, z + 0.41);
      shell.strip(gold, 0.04, H - 1.4, 0.04, x - sg * 0.41, 0.6, z - 0.41);
    }
  for (const z of [-6, -13, -20]) shell.brassBox(17, 0.18, 0.18, 0, H - 0.4, z);
  for (const sg of [-1, 1]) shell.brassBox(0.18, 0.18, L - 1, sg * 8.5, H - 0.4, -L / 2);
  // light coffers between the beams
  for (const z of [-3, -9.5, -16.5, -24]) shell.strip(WARM, 14, 0.03, 0.1, 0, H - 0.03, z, 1.15);
  for (const x of [-4, 0, 4]) shell.strip(WARM, 0.1, 0.03, L - 2, x, H - 0.03, -L / 2, 1.15);
  // a long gold runner from the elevator to the desk
  const runner = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 19), new THREE.MeshStandardMaterial({ color: "#5a1420", roughness: 0.95 }));
  runner.rotation.x = -Math.PI / 2;
  runner.position.set(0, 0.006, -11);
  group.add(runner);
  for (const sg of [-1, 1]) shell.strip(gold, 0.04, 0.01, 19, sg * 1.22, 0.004, -11);

  // the ten Legendaries on plinths, two rows facing the runner
  const bigs: Built["bigs"] = [];
  for (let i = 0; i < 10; i++) {
    const sg = i % 2 === 0 ? -1 : 1;
    const z = -5 - Math.floor(i / 2) * 3.4;
    const x = sg * 4.4;
    f.add("plinth", () => plinth(1.1, 0.9), x, 0, z);
    shell.rects.push([x - 0.75, z - 0.75, x + 0.75, z + 0.75]);
    f.add("strut", () => strut(1.3), x + sg * 0.25, 0.9, z, sg < 0 ? Math.PI / 2 : -Math.PI / 2);
    const { group: pg, pic } = bigPortrait(1.2);
    pg.position.set(x - sg * 0.05, 0.9 + 0.75, z);
    pg.rotation.y = sg < 0 ? FACE.px : FACE.nx;
    pg.rotateX(-0.06);
    group.add(pg);
    bigs.push({ pic, band: 0, index: i });
    shell.pool(x - sg * 0.6, z, 1.5, "#ffd9a0");
    const lab = label(`#${i + 1}`, "Legendary", gold, 0.5);
    lab.position.set(x - sg * 0.67, 0.55, z);
    lab.rotation.y = sg < 0 ? FACE.px : FACE.nx;
    lab.rotateX(-0.5);
    group.add(lab);
  }

  // info desk under the neon sign
  f.add("desk", () => desk(4.5), 0, 0, -L + 3.2);
  const deskHit = new THREE.Mesh(new THREE.BoxGeometry(4.6, 1.3, 1.1), new THREE.MeshBasicMaterial({ visible: false }));
  deskHit.position.set(0, 0.65, -L + 3.2);
  group.add(deskHit);
  shell.rects.push([-2.4, -L + 2.6, 2.4, -L + 3.8]);
  f.add("bamboo-d1", () => plant("bamboo", 61), -3.4, 0, -L + 3);
  f.add("bamboo-d2", () => plant("bamboo", 62), 3.4, 0, -L + 3);
  shell.rects.push([-4, -L + 2.4, -2.8, -L + 3.6], [2.8, -L + 2.4, 4, -L + 3.6]);
  const info = new Panel(512, 128, 1.1, { glow: true });
  info.draw((g, w, h) => {
    g.textAlign = "center";
    g.textBaseline = "middle";
    neonText(g, "INFO · 案内", w / 2, h / 2, `800 64px ${MONO}`, "#5ad8ff", 18);
  });
  info.mesh.position.set(0, 2.25, -L + 3.0);
  group.add(info.mesh);
  shell.pool(0, -L + 4.6, 2.4, gold);

  // back wall: zkCARDS in neon over the market figures
  const sign = new Panel(1600, 420, 12, { glow: true });
  sign.draw((g, w, h) => {
    g.textAlign = "center";
    g.textBaseline = "middle";
    neonText(g, "zkCARDS", w / 2, h / 2 - 34, `800 250px ${MONO}`, gold, 48);
    g.font = `600 44px ${MONO}`;
    g.fillStyle = "#ffe9b8";
    g.fillText("ジーケー・カード  ·  MUSEUM OF THE 10,000 zkSNARKs", w / 2, h - 40);
  });
  sign.mesh.position.set(0, 6.9, -L + 0.17);
  group.add(sign.mesh);
  shell.strip(gold, 12.4, 0.04, 0.04, 0, 5.35, -L + 0.2);
  const stats = new Panel(1600, 360, 9);
  stats.mesh.position.set(0, 4.15, -L + 0.17);
  group.add(stats.mesh);
  const drawStats = (d: GalleryData | null) =>
    stats.draw((g, w, h) => {
      g.fillStyle = "rgba(8,7,10,0.9)";
      g.fillRect(0, 0, w, h);
      const cells: [string, string][] = [
        ["SUPPLY", d ? num(d.supply) : "10,000"],
        ["FLOOR", d ? zec(d.floor) : "…"],
        ["LISTED", d?.listings != null ? num(d.listings) : "…"],
        ["24H SALES", d?.sales24 != null ? `${d.sales24} · ${zec(d.volume24, 1)}` : "…"],
      ];
      cells.forEach(([k, v], i) => {
        const x = (w / 4) * i;
        if (i) {
          g.fillStyle = "rgba(244,183,40,0.35)";
          g.fillRect(x, 50, 2, h - 100);
        }
        g.textAlign = "center";
        g.fillStyle = "#a3a3a3";
        g.font = `600 40px ${MONO}`;
        g.fillText(k, x + w / 8, 120);
        g.fillStyle = "#f6f2ea";
        g.font = `700 ${v.length > 12 ? 50 : 72}px ${MONO}`;
        g.fillText(v, x + w / 8, 240);
      });
      g.textAlign = "left";
    });
  drawStats(null);
  for (const sg of [-1, 1]) {
    const v = verticalNeon(sg < 0 ? "ギャラリー" : "カード", sg < 0 ? "#ff4f8a" : "#5ad8ff", 4.2);
    v.position.set(sg * 8.5, 4.6, -L + 0.17);
    group.add(v);
  }

  // left wall: the whole collection, every one of the 10,000 portraits in one mosaic
  const M = 7;
  const mosaic = new THREE.Mesh(new THREE.PlaneGeometry(M, M), new THREE.MeshBasicMaterial({ map: cardMaterial().map, color: "#e8e8e8" }));
  mosaic.position.set(-X + 0.25, 1.5 + M / 2, -14);
  mosaic.rotation.y = FACE.px;
  group.add(mosaic);
  shell.lacquerBox(0.12, M + 0.4, M + 0.4, -X + 0.15, 1.3, -14);
  shell.brassBox(0.1, 0.08, M + 0.5, -X + 0.2, 1.26, -14);
  shell.brassBox(0.1, 0.08, M + 0.5, -X + 0.2, 1.3 + M + 0.36, -14);
  for (const dz of [-2.6, 0, 2.6]) shell.wash(-X + 0.22, -14 + dz, FACE.px, 3.4, H - 0.3, "#fff0d0");
  const mlab = label("THE WHOLE COLLECTION", "10,000 zkSNARKs · #1 top left → #10,000", gold, 2.6);
  mlab.position.set(-X + 0.27, 0.78, -14);
  mlab.rotation.y = FACE.px;
  group.add(mlab);
  f.add("rope4a", () => rope(4), -X + 1.5, 0, -12, Math.PI / 2);
  f.add("rope4a", () => rope(4), -X + 1.5, 0, -16, Math.PI / 2);
  shell.rects.push([-X, -18.2, -X + 1.7, -9.8]);
  for (const z of [-11.5, -16.5]) {
    f.add("bench2", () => bench(2), -X + 4.2, 0, z, Math.PI / 2);
    shell.rects.push([-X + 3.84, z - 1.02, -X + 4.56, z + 1.02]);
  }

  // right wall: the street board and the floor guide
  const boardW = 6.6;
  const streetBoard = new Panel(1320, 300, boardW);
  streetBoard.mesh.position.set(X - 0.17, 5.6, -14);
  streetBoard.mesh.rotation.y = FACE.nx;
  group.add(streetBoard.mesh);
  shell.lacquerBox(0.1, 3.5, boardW + 0.3, X - 0.12, 1.15, -14);
  shell.strip(gold, 0.04, 0.04, boardW + 0.3, X - 0.2, 4.68, -14);
  const sslots: Slot[] = [];
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 12; c++) sslots.push({ x: X - 0.2, y: 4.15 - r * 0.72, z: -14 + boardW / 2 - 0.33 - c * 0.545, yaw: FACE.nx, s: 0.46 });
  const street = new CardSet(sslots);
  street.addTo(group);
  for (const dz of [-2.2, 0, 2.2]) shell.wash(X - 0.24, -14 + dz, FACE.nx, 3, H - 0.3, "#d0f0ff");
  for (const z of [-11.5, -16.5]) {
    f.add("bench2", () => bench(2), X - 4.2, 0, z, Math.PI / 2);
    shell.rects.push([X - 4.56, z - 1.02, X - 3.84, z + 1.02]);
  }
  for (const sg of [-1, 1]) {
    for (const z of [-4, -24]) {
      f.add("andon", andon, sg * (X - 0.6), 0, z);
      shell.rects.push([sg * (X - 0.6) - 0.4, z - 0.4, sg * (X - 0.6) + 0.4, z + 0.4]);
      shell.pool(sg * (X - 0.9), z, 1.4, "#ffb45e");
    }
    f.add(`shrub-${sg}`, () => plant("shrub", 70 + sg), sg * (X - 1.0), 0, -L + 1.0);
    shell.rects.push([sg * (X - 1.0) - 0.6, -L, sg * (X - 1.0) + 0.6, -L + 1.6]);
  }
  const guide = directory(2.2, 0);
  guide.position.set(X - 0.17, 2.4, -22.8);
  guide.rotation.y = FACE.nx;
  group.add(guide);

  // front: elevator, andons, plants
  elevatorSign(f, group, gold, "G", "Lobby", 0);
  shell.rects.push([-1.6, -0.6, 1.6, 0]);
  for (const sg of [-1, 1]) {
    f.add("andon", andon, sg * 2.4, 0, -0.6);
    f.add(`bamboo-${sg}`, () => plant("bamboo", 40 + sg), sg * 3.4, 0, -0.8);
    shell.rects.push([sg * 2.9 - 1, -1.4, sg * 2.9 + 1, 0]);
  }
  const welcome = new Panel(1400, 220, 10, { glow: true });
  welcome.draw((g, w, h) => {
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.font = `600 52px ${MONO}`;
    g.fillStyle = "#ffe9b8";
    g.fillText("Seven floors of portraits, ranked by rarity", w / 2, h / 2 - 34);
    g.font = `500 38px ${MONO}`;
    g.fillStyle = "#a3a3a3";
    g.fillText("Take the elevator ↑ to visit every rank", w / 2, h / 2 + 40);
  });
  welcome.mesh.position.set(0, 6.1, -0.17);
  welcome.mesh.rotation.y = FACE.nz;
  group.add(welcome.mesh);
  shell.pool(0, -2.4, 2.4, gold);
  shell.pool(-7, -26, 2.5, "#ff4f8a");
  shell.pool(7, -26, 2.5, "#5ad8ff");

  const rects = shell.build();
  group.add(f.build());
  lights(group, [
    [-4.5, 6.5, -6],
    [4.5, 6.5, -6],
    [-4.5, 6.5, -15],
    [4.5, 6.5, -15],
    [-9, 7, -24],
    [9, 7, -24],
  ], "#ffd6a0", 9);
  return {
    group,
    rects,
    spawn: new THREE.Vector3(0, 0, -2.4),
    yaw: 0,
    bigs,
    extra: [deskHit, mosaic],
    mosaic,
    desk: deskHit,
    street,
    streetBoard,
    refresh(d) {
      drawStats(d);
    },
  };
}
