import { type Mark } from "../../data/streetpay";
import { SERIF } from "../zktowers/kit";

/**
 * The wallet desk's pieces in the towers' lobbies: a giant phone whose screen shows the live QR
 * code that tips ZStreet from the visitor's own wallet, and the guestbook board (the latest lines
 * signed with a shielded memo).
 */

export function drawPhone(g: CanvasRenderingContext2D, W: number, H: number, name: string, color: string, kind: string, qr: HTMLCanvasElement | null, on: boolean) {
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#14131a");
  bg.addColorStop(1, "#07070a");
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  // status bar
  g.fillStyle = "#cfcfd6";
  g.font = `600 22px ui-monospace, monospace`;
  g.textBaseline = "middle";
  g.textAlign = "left";
  g.fillText("ZEC", 26, 34);
  g.textAlign = "right";
  g.fillText("◐ 100%", W - 26, 34);
  // the wallet's name
  g.textAlign = "center";
  g.fillStyle = color;
  g.font = `800 76px ${SERIF}`;
  g.fillText(name, W / 2, 140);
  g.fillStyle = "#8f8f99";
  g.font = `500 24px ui-sans-serif, sans-serif`;
  g.fillText(kind, W / 2, 196);
  // the code
  const s = W - 90;
  const y = 250;
  g.fillStyle = "#f6efe0";
  g.fillRect(45 - 10, y - 10, s + 20, s + 20);
  if (qr && on) g.drawImage(qr, 45, y, s, s);
  else {
    g.fillStyle = "#2a2a30";
    g.font = `600 30px ui-sans-serif, sans-serif`;
    g.fillText(on ? "…" : "Soon", W / 2, y + s / 2);
  }
  g.fillStyle = "#f1f1f1";
  g.font = `700 34px ui-sans-serif, sans-serif`;
  g.fillText(on ? "Scan to tip the city" : "Wallet desk opening", W / 2, y + s + 60);
  g.fillStyle = "#a3a3a3";
  g.font = `500 24px ui-sans-serif, sans-serif`;
  g.fillText("shielded · fireworks for everyone", W / 2, y + s + 100);
  // the action row
  const by = H - 150;
  g.fillStyle = color;
  roundRect(g, 60, by, W - 120, 70, 35);
  g.fill();
  g.fillStyle = "#0d0b08";
  g.font = `700 28px ui-sans-serif, sans-serif`;
  g.fillText("Tap · guestbook · tips", W / 2, by + 36);
  g.fillStyle = "#5a5a64";
  roundRect(g, W / 2 - 80, H - 40, 160, 8, 4);
  g.fill();
}

export interface BoardInk {
  bg: string;
  frame: string;
  head: string;
  ink: string;
  accent: string;
  muted: string;
}

export function drawGuestbook(g: CanvasRenderingContext2D, W: number, H: number, lines: Mark[], c: BoardInk) {
  g.fillStyle = c.bg;
  g.fillRect(0, 0, W, H);
  g.strokeStyle = c.frame;
  g.lineWidth = 3;
  g.strokeRect(16, 16, W - 32, H - 32);
  g.textBaseline = "top";
  g.textAlign = "left";
  if (!lines.length) {
    g.textAlign = "center";
    g.fillStyle = c.head;
    g.font = `italic 600 44px ${SERIF}`;
    g.fillText("Be the first to sign.", W / 2, H / 2 - 50);
    g.fillStyle = c.muted;
    g.font = `500 28px ui-sans-serif, sans-serif`;
    g.fillText("A line here is the memo of a shielded payment.", W / 2, H / 2 + 14);
    return;
  }
  let y = 44;
  for (const m of lines.slice(0, 7)) {
    const text = m.text.replace(/\s+/g, " ");
    g.fillStyle = c.ink;
    g.font = `italic 500 34px ${SERIF}`;
    g.fillText(`“${text.length > 64 ? `${text.slice(0, 62)}…` : text}”`, 50, y);
    g.fillStyle = c.accent;
    g.font = `500 20px ui-monospace, monospace`;
    g.fillText(`block ${m.height.toLocaleString("en-US")}`, 50, y + 42);
    y += 80;
    if (y > H - 80) break;
  }
  g.textAlign = "right";
  g.fillStyle = c.muted;
  g.font = `500 22px ui-sans-serif, sans-serif`;
  g.fillText("click to sign from your wallet", W - 44, H - 52);
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

