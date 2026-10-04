import * as THREE from "three";
import { hash } from "../../scene/voxel/model";

/** Canvas art of the mining hall: floor paint, wall cladding, neon signs, the screens. */

export const MONO = (px: number, w = 700) => `${w} ${px}px "JetBrains Mono", Menlo, monospace`;
export const JP = (px: number, w = 800) => `${w} ${px}px "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", "Yu Gothic", sans-serif`;
export const GOLD = "#f4b728";

export interface MinerRow {
  pool: string | null;
  tag: string | null;
  address: string;
  blocks: number;
  rewards: number;
  fees: number;
  last_block: number;
}
export interface Miners {
  total_blocks: number;
  nakamoto_coefficient?: number;
  top_share?: number;
  miners: MinerRow[];
}

/** What a miner is called: its pool, else a cleaned coinbase tag, else a short address. */
export function minerName(m: Pick<MinerRow, "pool" | "tag" | "address">) {
  if (m.pool) return m.pool;
  const tag = (m.tag ?? "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/^[^a-z0-9]*(mined by)?\s*/i, "")
    .replace(/[^\w .#-]/g, "")
    .trim();
  if (tag.length >= 3) return tag.slice(0, 18);
  return `${m.address.slice(0, 5)}…${m.address.slice(-4)}`;
}

export function canvasTex(c: HTMLCanvasElement, nearest = false) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (nearest) t.magFilter = THREE.NearestFilter;
  return t;
}

export function makeCanvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return { c, g: c.getContext("2d")! };
}

function stripes(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, k = 14) {
  g.save();
  g.beginPath();
  g.rect(x, y, w, h);
  g.clip();
  g.fillStyle = "#141317";
  g.fillRect(x, y, w, h);
  g.fillStyle = "#d9a21f";
  for (let i = -h; i < w + h; i += k * 2) {
    g.beginPath();
    g.moveTo(x + i, y + h);
    g.lineTo(x + i + k, y + h);
    g.lineTo(x + i + k + h, y);
    g.lineTo(x + i + h, y);
    g.fill();
  }
  g.restore();
}

// ---- floor ------------------------------------------------------------------------------------

export interface FloorPlan {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  rows: { x0: number; z0: number; x1: number; z1: number; letter: string; name: string; color: string }[];
  hazards: [number, number, number, number][];
  /** Empty bays where a row could grow. */
  spare: [number, number, number, number][];
  walkway: [number, number][];
}

/** The hall floor: dark concrete slabs, yellow walkway lines, hazard zones, painted row letters. */
export function drawFloor(p: FloorPlan, S = 40) {
  const W = (p.x1 - p.x0) * S,
    H = (p.z1 - p.z0) * S;
  const { c, g } = makeCanvas(W, H);
  const X = (x: number) => (x - p.x0) * S,
    Z = (z: number) => (z - p.z0) * S;
  g.fillStyle = "#1a191e";
  g.fillRect(0, 0, W, H);
  // concrete mottling in 0.25 m cells
  for (let y = 0; y < H; y += 10)
    for (let x = 0; x < W; x += 10) {
      const n = hash(x, y, 7, 1);
      if (n > 0.55) {
        g.fillStyle = n > 0.85 ? "rgba(255,255,255,0.035)" : "rgba(0,0,0,0.12)";
        g.fillRect(x, y, 10, 10);
      }
    }
  // slab seams every 2 m
  g.fillStyle = "#0e0d11";
  for (let x = 0; x < W; x += 2 * S) g.fillRect(x, 0, 2, H);
  for (let y = 0; y < H; y += 2 * S) g.fillRect(0, y, W, 2);
  // oil stains
  for (let i = 0; i < 26; i++) {
    const x = hash(i, 1, 2, 3) * W,
      y = hash(i, 4, 5, 6) * H,
      r = 12 + hash(i, 7, 8, 9) * 40;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, "rgba(0,0,0,0.35)");
    gr.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = gr;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // rows: a yellow box around each, the letter and pool painted at the head of the aisle
  for (const r of p.rows) {
    g.strokeStyle = "#d9a21f";
    g.lineWidth = 5;
    g.strokeRect(X(r.x0 - 0.3), Z(r.z0 - 0.3), (r.x1 - r.x0 + 0.6) * S, (r.z1 - r.z0 + 0.6) * S);
    // aisle centre dashes either side
    g.fillStyle = "rgba(217,162,31,0.5)";
    for (const ax of [r.x0 - 2.1, r.x1 + 2.1]) for (let z = r.z0; z < r.z1; z += 1.2) g.fillRect(X(ax) - 2, Z(z), 4, 0.6 * S);
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillStyle = "rgba(244,183,40,0.85)";
    g.font = MONO(64, 800);
    const cx = (r.x0 + r.x1) / 2;
    g.fillText(r.letter, X(cx), Z(r.z1 + 0.75));
    g.font = MONO(18, 800);
    g.fillStyle = r.color;
    g.fillText(r.name.toUpperCase().slice(0, 14), X(cx), Z(r.z1 + 1.4));
    g.textAlign = "left";
  }
  for (const [x0, z0, x1, z1] of p.spare) {
    g.save();
    g.setLineDash([14, 10]);
    g.strokeStyle = "rgba(232,224,200,0.45)";
    g.lineWidth = 4;
    g.strokeRect(X(x0), Z(z0), (x1 - x0) * S, (z1 - z0) * S);
    g.restore();
    g.save();
    g.translate(X((x0 + x1) / 2), Z((z0 + z1) / 2));
    g.rotate(-Math.PI / 2);
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillStyle = "rgba(232,224,200,0.4)";
    g.font = MONO(26, 800);
    g.fillText("EXPANSION BAY", 0, -14);
    g.font = JP(26, 800);
    g.fillText("増設予定", 0, 20);
    g.restore();
  }
  for (const [x0, z0, x1, z1] of p.hazards) {
    stripes(g, X(x0), Z(z0), (x1 - x0) * S, 0.25 * S);
    stripes(g, X(x0), Z(z1) - 0.25 * S, (x1 - x0) * S, 0.25 * S);
    stripes(g, X(x0), Z(z0), 0.25 * S, (z1 - z0) * S);
    stripes(g, X(x1) - 0.25 * S, Z(z0), 0.25 * S, (z1 - z0) * S);
  }
  // walkway arrows (green) along a polyline
  g.fillStyle = "rgba(61,220,151,0.75)";
  for (let i = 0; i < p.walkway.length - 1; i++) {
    const [ax, az] = p.walkway[i],
      [bx, bz] = p.walkway[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    const ang = Math.atan2(Z(bz) - Z(az), X(bx) - X(ax));
    for (let d = 0.5; d < len - 0.3; d += 1.1) {
      const x = X(ax + ((bx - ax) * d) / len),
        y = Z(az + ((bz - az) * d) / len);
      g.save();
      g.translate(x, y);
      g.rotate(ang);
      g.beginPath();
      g.moveTo(14, 0);
      g.lineTo(-8, -12);
      g.lineTo(-2, 0);
      g.lineTo(-8, 12);
      g.fill();
      g.restore();
    }
  }
  // painted words
  g.save();
  g.fillStyle = "rgba(244,183,40,0.7)";
  g.font = JP(46);
  g.textAlign = "center";
  g.fillText("足元注意", X(10.2), Z(-3.4));
  g.font = MONO(22, 800);
  g.fillText("MIND YOUR STEP", X(10.2), Z(-2.6));
  g.restore();
  const t = canvasTex(c);
  t.anisotropy = 16;
  return t;
}

/** Diamond-plate steel (mezzanine deck), tiling. */
export function drawPlate() {
  const { c, g } = makeCanvas(128, 128);
  g.fillStyle = "#2a2930";
  g.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 128; y += 16)
    for (let x = 0; x < 128; x += 16) {
      const o = (y / 16) % 2 ? 8 : 0;
      g.fillStyle = "#3a3943";
      g.save();
      g.translate(x + o + 4, y + 8);
      g.rotate((y / 16) % 2 ? 0.7 : -0.7);
      g.fillRect(-5, -1.5, 10, 3);
      g.restore();
    }
  const t = canvasTex(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Wall cladding: corrugated dark panels, a concrete skirt, a hazard band, 8 m tall (tiles in x). */
export function drawWall(h: number) {
  const S = 32;
  const { c, g } = makeCanvas(256, h * S);
  const H = h * S;
  for (let x = 0; x < 256; x += 8) {
    g.fillStyle = (x / 8) % 2 ? "#24232a" : "#1d1c22";
    g.fillRect(x, 0, 8, H);
    g.fillStyle = "rgba(255,255,255,0.03)";
    g.fillRect(x, 0, 1, H);
  }
  // panel joints and rivet lines
  g.fillStyle = "#121116";
  for (let y = 0; y < H; y += 2 * S) g.fillRect(0, y, 256, 3);
  g.fillRect(0, 0, 3, H);
  // grime toward the bottom
  const gr = g.createLinearGradient(0, H - 2.5 * S, 0, H);
  gr.addColorStop(0, "rgba(0,0,0,0)");
  gr.addColorStop(1, "rgba(0,0,0,0.4)");
  g.fillStyle = gr;
  g.fillRect(0, H - 2.5 * S, 256, 2.5 * S);
  // skirt
  g.fillStyle = "#2e2c33";
  g.fillRect(0, H - 1.1 * S, 256, 1.1 * S);
  stripes(g, 0, H - 1.3 * S, 256, 0.2 * S, 8);
  const t = canvasTex(c);
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

// ---- signs ------------------------------------------------------------------------------------

/** Neon panel sign: a dark plate, a lit border in `color`, lines of text. Returns a mesh h metres tall. */
export function neonSign(lines: { text: string; font: string; color?: string }[], o: { color: string; w: number; h: number; px?: number; bg?: string; align?: CanvasTextAlign }) {
  const px = o.px ?? 160;
  const W = Math.round(o.w * px),
    H = Math.round(o.h * px);
  const { c, g } = makeCanvas(W, H);
  g.fillStyle = o.bg ?? "#08070b";
  g.fillRect(0, 0, W, H);
  g.shadowColor = o.color;
  g.shadowBlur = 14;
  g.strokeStyle = o.color;
  g.lineWidth = 5;
  g.strokeRect(8, 8, W - 16, H - 16);
  g.textBaseline = "middle";
  g.textAlign = o.align ?? "center";
  const n = lines.length;
  lines.forEach((l, i) => {
    g.font = l.font;
    // shrink to fit the plate
    for (let k = 0; k < 12 && g.measureText(l.text).width > W - 56; k++) g.font = g.font.replace(/(\d+)px/, (_m, n) => `${Math.floor(Number(n) * 0.9)}px`);
    g.fillStyle = l.color ?? o.color;
    g.shadowColor = l.color ?? o.color;
    g.shadowBlur = 18;
    const x = g.textAlign === "left" ? 28 : W / 2;
    g.fillText(l.text, x, (H * (i + 0.5)) / n + 2);
  });
  const t = canvasTex(c);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(o.w, o.h), new THREE.MeshBasicMaterial({ map: t, toneMapped: false, color: new THREE.Color(1.5, 1.5, 1.5) }));
  return m;
}

/** Vertical Japanese neon (one character per cell). */
export function verticalNeon(text: string, color: string, cell = 0.55) {
  const chars = [...text];
  const S = 128;
  const { c, g } = makeCanvas(S, S * chars.length);
  g.fillStyle = "#0a090d";
  g.fillRect(0, 0, S, S * chars.length);
  g.strokeStyle = color;
  g.lineWidth = 6;
  g.shadowColor = color;
  g.shadowBlur = 16;
  g.strokeRect(6, 6, S - 12, S * chars.length - 12);
  g.font = JP(88, 900);
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillStyle = "#fff4e0";
  g.shadowBlur = 24;
  chars.forEach((ch, i) => g.fillText(ch, S / 2, S * i + S / 2 + 4));
  const m = new THREE.Mesh(new THREE.PlaneGeometry(cell, cell * chars.length), new THREE.MeshBasicMaterial({ map: canvasTex(c), toneMapped: false, color: new THREE.Color(1.6, 1.6, 1.6) }));
  return m;
}

/** Hazard placard: yellow triangle pictogram, Japanese and English. */
export function hazardSign(icon: "volt" | "fan" | "press", jp: string, en: string) {
  const { c, g } = makeCanvas(256, 320);
  g.fillStyle = "#f2c230";
  g.fillRect(0, 0, 256, 320);
  g.fillStyle = "#141317";
  g.fillRect(0, 0, 256, 14);
  g.fillRect(0, 306, 256, 14);
  // triangle
  g.beginPath();
  g.moveTo(128, 30);
  g.lineTo(220, 188);
  g.lineTo(36, 188);
  g.closePath();
  g.lineWidth = 14;
  g.lineJoin = "round";
  g.strokeStyle = "#141317";
  g.stroke();
  g.fillStyle = "#141317";
  if (icon === "volt") {
    g.beginPath();
    g.moveTo(138, 80);
    g.lineTo(104, 140);
    g.lineTo(128, 140);
    g.lineTo(116, 176);
    g.lineTo(154, 116);
    g.lineTo(130, 116);
    g.closePath();
    g.fill();
  } else if (icon === "fan") {
    for (let i = 0; i < 3; i++) {
      g.save();
      g.translate(128, 138);
      g.rotate((i * Math.PI * 2) / 3);
      g.beginPath();
      g.ellipse(0, -20, 10, 22, 0.4, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
  } else {
    g.fillRect(96, 84, 64, 26);
    g.fillRect(120, 110, 16, 30);
    g.fillRect(84, 156, 88, 16);
    g.fillRect(104, 140, 48, 10);
  }
  g.font = JP(40, 900);
  g.textAlign = "center";
  g.fillText(jp, 128, 238);
  g.font = MONO(22, 800);
  g.fillText(en, 128, 282);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.75), new THREE.MeshStandardMaterial({ map: canvasTex(c), roughness: 0.6, emissive: "#ffffff", emissiveIntensity: 0.12, emissiveMap: null }));
  (m.material as THREE.MeshStandardMaterial).emissiveMap = (m.material as THREE.MeshStandardMaterial).map;
  return m;
}

/** Animated conveyor belt: dark rubber with gold chevrons (scroll its offset). */
export function beltTexture() {
  const { c, g } = makeCanvas(64, 64);
  g.fillStyle = "#121116";
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = "#1c1b21";
  for (let y = 0; y < 64; y += 8) g.fillRect(0, y, 64, 3);
  g.fillStyle = "rgba(244,183,40,0.5)";
  g.beginPath();
  // the chevron points down the canvas: on the belt (laid flat, canvas top towards −z) that is +z,
  // the way the crates travel
  g.moveTo(16, 24);
  g.lineTo(32, 44);
  g.lineTo(48, 24);
  g.lineTo(40, 24);
  g.lineTo(32, 34);
  g.lineTo(24, 24);
  g.fill();
  const t = canvasTex(c, true);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// ---- screens ----------------------------------------------------------------------------------

export function scanlines(g: CanvasRenderingContext2D, W: number, H: number, step = 3) {
  g.fillStyle = "rgba(0,0,0,0.22)";
  for (let y = 0; y < H; y += step) g.fillRect(0, y, W, 1);
}

export function fmtAgo(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  return s < 90 ? `${s}s ago` : s < 5400 ? `${Math.round(s / 60)} min ago` : `${Math.round(s / 3600)} h ago`;
}

export const POOL_COLORS = ["#f4b728", "#4ad0ff", "#ff3ad0", "#3ddc97", "#ff8a3a", "#b07bff", "#e8e0c8", "#7a8a84"];

/** Row end cap: a big neon letter, the miner's name, the row label. w × h metres. */
export function endCap(letter: string, name: string, color: string, w = 1.7, h = 1.9) {
  const px = 180;
  const W = Math.round(w * px),
    H = Math.round(h * px);
  const { c, g } = makeCanvas(W, H);
  g.fillStyle = "#08070b";
  g.fillRect(0, 0, W, H);
  // vent slots
  g.fillStyle = "#121117";
  for (let y = 20; y < H - 20; y += 12) g.fillRect(16, y, W - 32, 5);
  g.shadowColor = color;
  g.shadowBlur = 16;
  g.strokeStyle = color;
  g.lineWidth = 6;
  g.strokeRect(10, 10, W - 20, H - 20);
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillStyle = "#fff4e0";
  g.shadowBlur = 30;
  g.font = MONO(190, 900);
  g.fillText(letter, W / 2, H * 0.36);
  g.shadowBlur = 12;
  g.fillStyle = color;
  g.font = MONO(Math.min(40, Math.floor((W - 40) / (name.length * 0.62))), 800);
  g.fillText(name, W / 2, H * 0.7);
  g.font = JP(30, 800);
  g.fillStyle = "#e8e0c8";
  g.fillText(`${letter}列 · 採掘中`, W / 2, H * 0.84);
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: canvasTex(c), toneMapped: false, color: new THREE.Color(1.4, 1.4, 1.4) }));
}
