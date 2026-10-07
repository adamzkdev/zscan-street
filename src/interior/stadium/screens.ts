import { GOLD, MONO, SILVER } from "./layout";

/** What the jumbotrons show. */
export interface BoardState {
  mode: "watch" | "play";
  block: { height: number; home: number; away: number } | null;
  match: [number, number];
  clock: number;
  ratio: number | undefined;
  goal: { team: 0 | 1; at: number; you: boolean } | null;
  now: number;
}

let mask: HTMLCanvasElement | null = null;
/** The LED grid laid over everything drawn. */
function ledMask(w: number, h: number) {
  if (mask && mask.width === w && mask.height === h) return mask;
  mask = document.createElement("canvas");
  mask.width = w;
  mask.height = h;
  const g = mask.getContext("2d")!;
  g.fillStyle = "rgba(0,0,0,0.32)";
  for (let y = 0; y < h; y += 4) g.fillRect(0, y, w, 1);
  for (let x = 0; x < w; x += 4) g.fillRect(x, 0, 1, h);
  const v = g.createRadialGradient(w / 2, h / 2, h * 0.3, w / 2, h / 2, w * 0.7);
  v.addColorStop(0, "rgba(0,0,0,0)");
  v.addColorStop(1, "rgba(0,0,0,0.35)");
  g.fillStyle = v;
  g.fillRect(0, 0, w, h);
  return mask;
}

const fmt = (n: number) => n.toLocaleString("en-US");

function shield(g: CanvasRenderingContext2D, x: number, y: number, s: number, color: string, filled: boolean) {
  g.save();
  g.translate(x, y);
  g.beginPath();
  g.moveTo(0, -s);
  g.lineTo(s * 0.85, -s * 0.62);
  g.lineTo(s * 0.78, s * 0.2);
  g.quadraticCurveTo(s * 0.5, s * 0.8, 0, s * 1.05);
  g.quadraticCurveTo(-s * 0.5, s * 0.8, -s * 0.78, s * 0.2);
  g.lineTo(-s * 0.85, -s * 0.62);
  g.closePath();
  g.lineWidth = s * 0.16;
  g.strokeStyle = color;
  g.fillStyle = color;
  if (filled) g.fill();
  else g.stroke();
  g.fillStyle = filled ? "#07080c" : color;
  g.font = `900 ${s * 1.05}px ${MONO}`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(filled ? "Z" : "T", 0, s * 0.08);
  g.restore();
}

export function drawJumbo(g: CanvasRenderingContext2D, s: BoardState) {
  const w = g.canvas.width,
    h = g.canvas.height;
  g.textAlign = "center";
  g.textBaseline = "alphabetic";
  const goal = s.goal && s.now - s.goal.at < 6 ? s.goal : null;
  if (goal) {
    const t = s.now - goal.at;
    const col = goal.team === 0 ? GOLD : SILVER;
    const flash = Math.floor(t * 5) % 2 === 0;
    g.fillStyle = flash ? col : "#07080c";
    g.fillRect(0, 0, w, h);
    // light rays sweeping
    g.save();
    g.translate(w / 2, h * 0.5);
    g.rotate(t * 0.8);
    g.fillStyle = flash ? "rgba(0,0,0,0.12)" : goal.team === 0 ? "rgba(244,183,40,0.16)" : "rgba(200,204,216,0.16)";
    for (let i = 0; i < 12; i++) {
      g.rotate((Math.PI * 2) / 12);
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(w, -60);
      g.lineTo(w, 60);
      g.fill();
    }
    g.restore();
    const zoom = Math.min(1, t * 3);
    g.fillStyle = flash ? "#07080c" : col;
    g.font = `900 ${h * 0.46 * (0.6 + 0.4 * zoom)}px ${MONO}`;
    const oo = "O".repeat(2 + Math.min(4, Math.floor(t * 3)));
    g.fillText(`G${oo}AL!`, w / 2, h * 0.6);
    g.font = `800 ${h * 0.1}px ${MONO}`;
    g.fillText(goal.team === 0 ? "SHIELDED SCORES" : "TRANSPARENT SCORES", w / 2, h * 0.82);
    if (s.mode === "play") {
      g.font = `900 ${h * 0.1}px ${MONO}`;
      g.fillText(`${s.match[0]} – ${s.match[1]}`, w / 2, h * 0.95);
    }
    g.drawImage(ledMask(w, h), 0, 0);
    return;
  }
  const bg = g.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, "#0b0c14");
  bg.addColorStop(1, "#05060a");
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  // header
  g.fillStyle = "#14151f";
  g.fillRect(0, 0, w, h * 0.15);
  g.fillStyle = GOLD;
  g.fillRect(0, h * 0.15, w, h * 0.008);
  g.textAlign = "left";
  const live = Math.floor(s.now * 1.5) % 2 === 0;
  g.fillStyle = live ? "#ff3b3b" : "#7a1d1d";
  g.beginPath();
  g.arc(w * 0.04, h * 0.075, h * 0.025, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#ffffff";
  g.font = `800 ${h * 0.07}px ${MONO}`;
  g.fillText("LIVE", w * 0.065, h * 0.1);
  g.fillStyle = GOLD;
  g.fillText("BLOCK STADIUM", w * 0.17, h * 0.1);
  g.textAlign = "right";
  g.fillStyle = "#9a98a8";
  if (s.mode === "play") {
    const m = Math.floor(s.clock / 60),
      sec = Math.floor(s.clock % 60);
    g.fillStyle = "#ffffff";
    g.fillText(`${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`, w * 0.96, h * 0.1);
  } else g.fillText(s.block ? `#${fmt(s.block.height)}` : "—", w * 0.96, h * 0.1);
  g.textAlign = "center";
  // the two sides
  const home = s.mode === "play" ? s.match[0] : (s.block?.home ?? 0);
  const away = s.mode === "play" ? s.match[1] : (s.block?.away ?? 0);
  const lead = home === away ? -1 : home > away ? 0 : 1;
  for (const [i, x, col, name] of [
    [0, w * 0.25, GOLD, "SHIELDED"],
    [1, w * 0.75, SILVER, "TRANSPARENT"],
  ] as const) {
    if (lead === i) {
      const gl = g.createRadialGradient(x, h * 0.52, 0, x, h * 0.52, w * 0.22);
      gl.addColorStop(0, i === 0 ? "rgba(244,183,40,0.22)" : "rgba(200,204,216,0.18)");
      gl.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = gl;
      g.fillRect(x - w * 0.25, h * 0.16, w * 0.5, h * 0.62);
    }
    shield(g, x - w * 0.15, h * 0.29, h * 0.05, col, i === 0);
    g.fillStyle = col;
    g.font = `800 ${h * 0.075}px ${MONO}`;
    g.fillText(name, x + h * 0.03, h * 0.315);
    g.fillStyle = "#ffffff";
    g.font = `900 ${h * 0.36}px ${MONO}`;
    g.fillText(String(home === undefined ? 0 : i === 0 ? home : away), x, h * 0.68);
  }
  g.fillStyle = "#3a3846";
  g.font = `900 ${h * 0.22}px ${MONO}`;
  g.fillText("–", w / 2, h * 0.62);
  g.fillStyle = "#8a8896";
  g.font = `700 ${h * 0.055}px ${MONO}`;
  if (s.mode === "play") g.fillText(s.block ? `BLOCK #${fmt(s.block.height)}  ${s.block.home}–${s.block.away}` : "", w / 2, h * 0.76);
  else g.fillText("TXS IN BLOCK", w / 2, h * 0.76);
  // the season: last 24 h
  const r = s.ratio;
  const bx = w * 0.06,
    bw = w * 0.88,
    by = h * 0.86,
    bh = h * 0.055;
  g.textAlign = "left";
  g.fillStyle = GOLD;
  g.font = `800 ${h * 0.05}px ${MONO}`;
  g.fillText(r !== undefined ? `${(r * 100).toFixed(1)}%` : "", bx, by - h * 0.02);
  g.textAlign = "center";
  g.fillStyle = "#8a8896";
  g.fillText("LAST 24 H", w / 2, by - h * 0.02);
  g.textAlign = "right";
  g.fillStyle = SILVER;
  g.fillText(r !== undefined ? `${(100 - r * 100).toFixed(1)}%` : "", bx + bw, by - h * 0.02);
  g.fillStyle = "#4c5060";
  g.fillRect(bx, by, bw, bh);
  g.fillStyle = SILVER;
  g.fillRect(bx, by, bw, bh);
  g.fillStyle = GOLD;
  g.fillRect(bx, by, bw * (r ?? 0.5), bh);
  g.fillStyle = "rgba(255,255,255,0.35)";
  g.fillRect(bx, by, bw, bh * 0.25);
  g.drawImage(ledMask(w, h), 0, 0);
}
