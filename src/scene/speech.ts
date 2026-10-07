import * as THREE from "three";

/**
 * Comic speech bubbles: a white rounded box with a black outline and a tail, bold text inside.
 * Sprites, so they always face the camera and never read backwards (the characters' cut-outs
 * flip to face where they walk; the words must not). `tone` colours the text.
 */
export type Tone = "talk" | "shout" | "honk";

const cache = new Map<string, { tex: THREE.CanvasTexture; aspect: number }>();

/** Break a line into a few short lines, at spaces. */
function wrap(text: string, max = 22) {
  const out: string[] = [];
  let line = "";
  for (const w of text.split(" ")) {
    if (line && (line + " " + w).length > max) {
      out.push(line);
      line = w;
    } else line = line ? `${line} ${w}` : w;
  }
  if (line) out.push(line);
  return out.slice(0, 4);
}

function texture(text: string, tone: Tone) {
  const key = `${tone}|${text}`;
  let t = cache.get(key);
  if (t) return t;
  const c = document.createElement("canvas");
  const g = c.getContext("2d")!;
  const font = `${tone === "talk" ? 600 : 900} 40px "DotGothic16", "JetBrains Mono", monospace`;
  g.font = font;
  const lines = wrap(text);
  const lh = 46;
  const tw = Math.max(...lines.map((l) => g.measureText(l).width));
  const w = Math.ceil(tw) + 60;
  const h = lines.length * lh + 40;
  c.width = w + 8;
  c.height = h + 30;
  g.font = font;
  const r = 24;
  const fill = tone === "honk" ? "#ffe24a" : tone === "shout" ? "#fff4d6" : "#fbf8f0";
  // a soft drop shadow, then the bubble: rounded box with its tail bottom left
  const path = (dx: number, dy: number) => {
    g.beginPath();
    g.moveTo(r + 3 + dx, 3 + dy);
    g.arcTo(w - 3 + dx, 3 + dy, w - 3 + dx, h - 3 + dy, r);
    g.arcTo(w - 3 + dx, h - 3 + dy, 3 + dx, h - 3 + dy, r);
    g.lineTo(56 + dx, h - 3 + dy);
    g.lineTo(28 + dx, h + 24 + dy);
    g.lineTo(36 + dx, h - 3 + dy);
    g.arcTo(3 + dx, h - 3 + dy, 3 + dx, 3 + dy, r);
    g.arcTo(3 + dx, 3 + dy, w - 3 + dx, 3 + dy, r);
    g.closePath();
  };
  g.fillStyle = "rgba(10,8,20,0.35)";
  path(6, 6);
  g.fill();
  g.fillStyle = fill;
  g.strokeStyle = tone === "shout" ? "#d0202a" : "#16141c";
  g.lineWidth = tone === "shout" ? 7 : 5;
  path(0, 0);
  g.fill();
  g.stroke();
  g.fillStyle = tone === "shout" ? "#d0202a" : "#16141c";
  g.textBaseline = "middle";
  lines.forEach((l, i) => g.fillText(l, 30, 20 + lh / 2 + i * lh + 2));
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  t = { tex, aspect: c.width / c.height };
  cache.set(key, t);
  return t;
}

/** A bubble sprite: bottom-left corner (the tail) at its position. `height` in metres. */
export function speechSprite(text: string, tone: Tone = "talk", height = 0.85) {
  const { tex, aspect } = texture(text, tone);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  s.center.set(0.1, 0);
  // `height` is a one-line bubble's (metres); more lines make it taller, the letters stay the same
  const px = (tex.image as HTMLCanvasElement).height;
  const k = height / 116;
  s.scale.set(k * px * aspect, k * px, 1);
  s.renderOrder = 6;
  return s;
}

/**
 * How much bigger bubbles are drawn right now: zoomed out over the map they grow so the words stay
 * readable (main sets it every frame from the camera); 1 at street level.
 */
let zoomK = 1;
export function setBubbleScale(k: number) {
  zoomK = k;
}

/** Show a bubble over `parent` at height `y` for `seconds`, popping in and out. */
export function sayAt(parent: THREE.Object3D, text: string, tone: Tone, y: number, seconds: number, height?: number) {
  const s = speechSprite(text, tone, height);
  s.position.set(0, y, 0);
  const full = s.scale.clone();
  s.scale.multiplyScalar(0.01);
  parent.add(s);
  const t0 = performance.now();
  const tick = () => {
    const age = (performance.now() - t0) / 1000;
    const k = Math.max(0.01, Math.min(1, age * 7, (seconds - age) * 6)) * zoomK;
    s.scale.set(full.x * k, full.y * k, 1);
    if (age < seconds) requestAnimationFrame(tick);
    else parent.remove(s);
  };
  requestAnimationFrame(tick);
  return s;
}
