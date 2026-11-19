/**
 * ZK PARTY's HUD lettering and glyphs, drawn on the 960×540 canvas: the toy letters of the
 * announcer (a light-to-colour fill, a dark ink line, a rim), a player's portrait badge, the
 * leader's crown, key caps and pad buttons for the rules card. k3.ts's HUD helpers (tag, corners,
 * clock, banner) and host.ts (the card, the 3-2-1, the finish, the podium) draw with these.
 */
import { FONT, HUD, rr, shade, stickOf, type Btn, type MiniDef, type Player } from "./kit";
import { actIcon, type Act } from "./acts";

/** shade() for any colour a game hands over: #rgb and #rrggbb are shaded, anything else is kept. */
export function tint(c: string, k: number) {
  if (/^#[0-9a-f]{6}$/i.test(c)) return shade(c, k);
  if (/^#[0-9a-f]{3}$/i.test(c)) return shade(`#${c[1]}${c[1]}${c[2]}${c[2]}${c[3]}${c[3]}`, k);
  return c;
}

export const INK = "#1a1033";

/** True on a phone or a tablet: the touch pad is the controller. */
const coarse = typeof matchMedia !== "undefined" ? matchMedia("(pointer: coarse)") : null;
export const touchy = () => !!coarse?.matches;

/** The controls in a touch screen's words, where the arrows are a stick (MiniDef.stick). */
const STICK_WORDS: [RegExp, string][] = [
  [/▲ run, ◀ ▶ dodge/g, "Stick up: run, sideways: dodge"],
  [/◀ ▶ steer/g, "Stick steers"],
  [/\bArrows (run|aim|roll)\b/g, "Stick $1s"],
  [/\bthe arrows\b/g, "the stick"],
  [/▲ 奔跑，◀ ▶ 闪避/g, "摇杆向上奔跑，左右闪避"],
  [/◀ ▶ 转向/g, "摇杆转向"],
  [/方向键/g, "摇杆"],
];

/** A game's rules or hint as the player reads them here: "Arrows run" is "Stick runs" on a touch screen whose arrows are a stick; a computer keeps the keys' words. */
export function touchWords(s: string, def: Pick<MiniDef, "pad" | "stick">) {
  if (!touchy() || !stickOf(def)) return s;
  for (const [re, to] of STICK_WORDS) s = s.replace(re, to);
  return s;
}

/**
 * Toy letters: a fill from light to `color`, a dark ink line with a hard drop under it, a rim
 * round all of it (white, or `rim`). One pass per layer, so letters drawn together never cover
 * each other's fill.
 */
export function toy(
  g: CanvasRenderingContext2D,
  s: string,
  x: number,
  y: number,
  size: number,
  color = "#ffd23f",
  o: { rim?: string | false; ink?: string; align?: CanvasTextAlign; drop?: number; top?: string } = {},
) {
  g.font = `900 ${size}px ${FONT}`;
  g.textAlign = o.align ?? "center";
  g.textBaseline = "middle";
  g.lineJoin = "round";
  g.miterLimit = 2;
  const ink = o.ink ?? INK;
  const d = o.drop ?? Math.max(2, size * 0.07);
  if (o.rim !== false) {
    g.strokeStyle = o.rim ?? "#ffffff";
    g.lineWidth = size * 0.36;
    g.strokeText(s, x, y);
    g.strokeText(s, x, y + d);
  }
  g.strokeStyle = ink;
  g.lineWidth = size * 0.2;
  g.strokeText(s, x, y + d);
  g.fillStyle = ink;
  g.fillText(s, x, y + d);
  g.strokeText(s, x, y);
  const gr = g.createLinearGradient(0, y - size * 0.45, 0, y + size * 0.4);
  gr.addColorStop(0, o.top ?? tint(color, 0.62));
  gr.addColorStop(0.52, color);
  gr.addColorStop(1, tint(color, -0.12));
  g.fillStyle = gr;
  g.fillText(s, x, y);
}

/** Toy letters one by one (a banner's bounce): `dy(i)` lifts letter i, `sc(i)` scales it. */
export function toyLetters(
  g: CanvasRenderingContext2D,
  s: string,
  x: number,
  y: number,
  size: number,
  color: string,
  dy: (i: number) => number,
  sc: (i: number) => number,
  o: { rim?: string | false; ink?: string } = {},
) {
  const ch = Array.from(s);
  g.font = `900 ${size}px ${FONT}`;
  const ws = ch.map((c) => g.measureText(c).width);
  const total = g.measureText(s).width;
  const k = total / Math.max(1, ws.reduce((a, b) => a + b, 0));
  let cx = x - total / 2;
  const xs = ws.map((w) => {
    const at = cx + (w * k) / 2;
    cx += w * k;
    return at;
  });
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.lineJoin = "round";
  g.miterLimit = 2;
  const ink = o.ink ?? INK;
  const d = Math.max(2, size * 0.07);
  const each = (f: (c: string, x: number, y: number, s: number) => void) => {
    for (let i = 0; i < ch.length; i++) {
      const s2 = sc(i);
      if (s2 <= 0.01 || ch[i] === " ") continue;
      f(ch[i], xs[i], y + dy(i), s2);
    }
  };
  // (each letter at its bounce's size: the small print's floor would pop it in full grown)
  const font = (s2: number) => ((HUD.raw = true), (g.font = `900 ${size * s2}px ${FONT}`), (HUD.raw = false));
  if (o.rim !== false) {
    g.strokeStyle = o.rim ?? "#ffffff";
    each((c, cx2, cy, s2) => {
      font(s2);
      g.lineWidth = size * s2 * 0.36;
      g.strokeText(c, cx2, cy);
      g.strokeText(c, cx2, cy + d * s2);
    });
  }
  g.strokeStyle = ink;
  g.fillStyle = ink;
  each((c, cx2, cy, s2) => {
    font(s2);
    g.lineWidth = size * s2 * 0.2;
    g.strokeText(c, cx2, cy + d * s2);
    g.fillText(c, cx2, cy + d * s2);
    g.strokeText(c, cx2, cy);
  });
  const gr = g.createLinearGradient(0, y - size * 0.6, 0, y + size * 0.45);
  gr.addColorStop(0, tint(color, 0.62));
  gr.addColorStop(0.55, color);
  gr.addColorStop(1, tint(color, -0.12));
  g.fillStyle = gr;
  each((c, cx2, cy, s2) => {
    font(s2);
    g.fillText(c, cx2, cy);
  });
}

/** A figure for a panel: white, a thick ink outline and a hard drop (the score numerals). */
export function numeral(g: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, color = "#ffffff", align: CanvasTextAlign = "right") {
  g.font = `900 ${size}px ${FONT}`;
  g.textAlign = align;
  g.textBaseline = "middle";
  g.lineJoin = "round";
  g.miterLimit = 2;
  g.lineWidth = Math.max(4, size * 0.24);
  g.strokeStyle = INK;
  g.fillStyle = INK;
  g.strokeText(s, x, y + 2.5);
  g.fillText(s, x, y + 2.5);
  g.strokeText(s, x, y);
  g.fillStyle = color;
  g.fillText(s, x, y);
}

/** A player's portrait in a rounded square of their colour (`s` px wide, centred on x, y). */
export function badge(g: CanvasRenderingContext2D, p: Player, x: number, y: number, s: number, o: { dim?: boolean; shadow?: boolean; rim?: string } = {}) {
  const r = s * 0.3;
  const x0 = x - s / 2;
  const y0 = y - s / 2;
  if (o.shadow !== false) {
    rr(g, x0, y0 + 3, s, s, r);
    g.fillStyle = "rgba(6,3,18,0.45)";
    g.fill();
  }
  if (o.rim) {
    rr(g, x0 - 2.5, y0 - 2.5, s + 5, s + 5, r + 2.5);
    g.fillStyle = o.rim;
    g.fill();
  }
  rr(g, x0, y0, s, s, r);
  const fr = g.createLinearGradient(0, y0, 0, y0 + s);
  fr.addColorStop(0, tint(p.color, 0.25));
  fr.addColorStop(1, tint(p.color, -0.18));
  g.fillStyle = o.dim ? "#5a566e" : fr;
  g.fill();
  const ins = Math.max(3, s * 0.1);
  g.save();
  rr(g, x0 + ins, y0 + ins, s - ins * 2, s - ins * 2, Math.max(3, r - ins * 0.7));
  g.clip();
  g.fillStyle = o.dim ? "#2a2738" : p.dark;
  g.fillRect(x0, y0, s, s);
  if (p.img.complete && p.img.naturalWidth) {
    g.imageSmoothingEnabled = false;
    if (o.dim) g.globalAlpha *= 0.45;
    g.drawImage(p.img, x0 + ins * 0.5, y0 + ins * 0.5, s - ins, s - ins);
    g.imageSmoothingEnabled = true;
  } else {
    g.font = `900 ${s * 0.46}px ${FONT}`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillStyle = "#fff";
    g.fillText(p.name.slice(0, 1).toUpperCase(), x, y + 1);
  }
  g.restore();
  // a gloss along the frame's top
  rr(g, x0 + s * 0.18, y0 + 1.5, s * 0.64, Math.max(2, s * 0.06), 2);
  g.fillStyle = "rgba(255,255,255,0.45)";
  g.fill();
}

/** The leader's crown, `s` px wide, its base on y. */
export function crown(g: CanvasRenderingContext2D, x: number, y: number, s: number, bob = 0) {
  const h = s * 0.62;
  y += bob;
  g.save();
  g.lineJoin = "round";
  g.beginPath();
  g.moveTo(x - s / 2, y);
  g.lineTo(x - s / 2, y - h * 0.78);
  g.lineTo(x - s * 0.22, y - h * 0.42);
  g.lineTo(x, y - h);
  g.lineTo(x + s * 0.22, y - h * 0.42);
  g.lineTo(x + s / 2, y - h * 0.78);
  g.lineTo(x + s / 2, y);
  g.closePath();
  g.lineWidth = Math.max(2.5, s * 0.14);
  g.strokeStyle = INK;
  g.stroke();
  const gr = g.createLinearGradient(0, y - h, 0, y);
  gr.addColorStop(0, "#fff1a6");
  gr.addColorStop(0.5, "#ffd23f");
  gr.addColorStop(1, "#e59a00");
  g.fillStyle = gr;
  g.fill();
  g.fillStyle = "#ff4d6d";
  g.beginPath();
  g.arc(x, y - h * 0.32, s * 0.08, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

/** A key cap (`w` wide): a light key on a darker edge. */
export function keycap(g: CanvasRenderingContext2D, label: string, x: number, y: number, w = 30, h = 30, o: { size?: number; on?: boolean } = {}) {
  const r = Math.min(8, h * 0.28);
  rr(g, x - w / 2, y - h / 2 + 4, w, h, r);
  g.fillStyle = "#8d88a8";
  g.fill();
  rr(g, x - w / 2, y - h / 2 + (o.on ? 3 : 0), w, h, r);
  const gr = g.createLinearGradient(0, y - h / 2, 0, y + h / 2);
  gr.addColorStop(0, "#ffffff");
  gr.addColorStop(1, "#dedbec");
  g.fillStyle = gr;
  g.fill();
  g.font = `900 ${o.size ?? Math.round(h * 0.46)}px ${FONT}`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillStyle = INK;
  g.fillText(label, x, y + 1 + (o.on ? 3 : 0));
}

export const BTN_C: Record<"a" | "b", string> = { a: "#ff6b35", b: "#3ec6ff" };

/** A round pad button (A or B), `r` px. */
export function padBtn(g: CanvasRenderingContext2D, b: "a" | "b", x: number, y: number, r = 15, act?: Act) {
  g.beginPath();
  g.arc(x, y + 3, r, 0, Math.PI * 2);
  g.fillStyle = tint(BTN_C[b], -0.45);
  g.fill();
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  const gr = g.createLinearGradient(0, y - r, 0, y + r);
  gr.addColorStop(0, tint(BTN_C[b], 0.3));
  gr.addColorStop(1, BTN_C[b]);
  g.fillStyle = gr;
  g.fill();
  g.lineWidth = 2;
  g.strokeStyle = "rgba(255,255,255,0.85)";
  g.stroke();
  // (what it does in this game, as on the touch button: acts.ts; else its letter)
  if (act) return actIcon(g, act, x, y, r * 1.2);
  g.font = `900 ${Math.round(r * 1.05)}px ${FONT}`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillStyle = "#fff";
  g.fillText(b.toUpperCase(), x, y + 1);
}

/** The touch stick as a glyph (a ring and its knob, leaning), `r` its radius: what moves you on a phone. */
export function stickIcon(g: CanvasRenderingContext2D, x: number, y: number, r: number) {
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fillStyle = "rgba(255,255,255,0.12)";
  g.fill();
  g.lineWidth = Math.max(1.5, r * 0.1);
  g.strokeStyle = "rgba(255,255,255,0.7)";
  g.stroke();
  g.beginPath();
  g.arc(x + r * 0.26, y - r * 0.22, r * 0.52, 0, Math.PI * 2);
  g.fillStyle = "#fff";
  g.fill();
}

/** A touch pad's cross (the arrows on a phone), `s` px across. */
export function dpad(g: CanvasRenderingContext2D, x: number, y: number, s = 40, dirs: Btn[] = ["left", "right", "up", "down"]) {
  const t = s / 3;
  const arm = (dx: number, dy: number, on: boolean) => {
    rr(g, x + dx * t - t / 2, y + dy * t - t / 2, t, t, 3);
    g.fillStyle = on ? "#ffffff" : "rgba(255,255,255,0.25)";
    g.fill();
  };
  rr(g, x - t / 2, y - t / 2, t, t, 2);
  g.fillStyle = "#dedbec";
  g.fill();
  arm(-1, 0, dirs.includes("left"));
  arm(1, 0, dirs.includes("right"));
  arm(0, -1, dirs.includes("up"));
  arm(0, 1, dirs.includes("down"));
}

/** Words wrapped to `w` px in the current font: the lines. */
export function wrap(g: CanvasRenderingContext2D, s: string, w: number) {
  // (Chinese has no spaces: it breaks anywhere)
  const words = /\s/.test(s) ? s.split(/\s+/) : Array.from(s);
  const join = /\s/.test(s) ? " " : "";
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const tryL = line ? line + join + word : word;
    if (g.measureText(tryL).width > w && line) {
      lines.push(line);
      line = word;
    } else line = tryL;
  }
  if (line) lines.push(line);
  return lines;
}

/** The mini-game's thumbnail as drawn without a picture: its colour, a pattern, its title. */
export function thumbFallback(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string, title: string, key: string) {
  const gr = g.createLinearGradient(x, y, x + w, y + h);
  gr.addColorStop(0, tint(color, 0.25));
  gr.addColorStop(1, tint(color, -0.35));
  g.fillStyle = gr;
  g.fillRect(x, y, w, h);
  g.save();
  g.beginPath();
  g.rect(x, y, w, h);
  g.clip();
  g.fillStyle = "rgba(255,255,255,0.13)";
  const pat = patternOf(key);
  const st = h / 5;
  if (pat === 0) for (let i = -h; i < w + h; i += st * 1.4) (g.beginPath(), g.moveTo(x + i, y), g.lineTo(x + i + st * 0.6, y), g.lineTo(x + i + st * 0.6 - h, y + h), g.lineTo(x + i - h, y + h), g.fill());
  else if (pat === 1) for (let yy = 0; yy < h + st; yy += st) for (let xx = (yy / st) % 2 ? st / 2 : 0; xx < w + st; xx += st) (g.beginPath(), g.arc(x + xx, y + yy, st * 0.18, 0, Math.PI * 2), g.fill());
  else if (pat === 2) for (let yy = 0; yy < h; yy += st) for (let xx = (yy / st) % 2 ? st : 0; xx < w; xx += st * 2) g.fillRect(x + xx, y + yy, st, st);
  else
    for (let yy = st / 2; yy < h + st; yy += st) {
      g.beginPath();
      for (let xx = 0; xx <= w; xx += st / 2) g.lineTo(x + xx, y + yy + ((xx / (st / 2)) % 2 ? st * 0.22 : -st * 0.22));
      g.lineWidth = st * 0.16;
      g.strokeStyle = "rgba(255,255,255,0.13)";
      g.stroke();
    }
  g.restore();
  g.font = `900 ${Math.round(h * 0.2)}px ${FONT}`;
  const lines = wrap(g, title, w * 0.86);
  const lh = h * 0.21;
  lines.forEach((l, i) => toy(g, l, x + w / 2, y + h / 2 + (i - (lines.length - 1) / 2) * lh, Math.round(h * 0.17), "#ffffff", { ink: tint(color, -0.6), rim: false }));
}

/** One of four patterns, the same for a game everywhere (the stand-in thumbnail). */
export function patternOf(key: string) {
  let h = 0;
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h % 4;
}
