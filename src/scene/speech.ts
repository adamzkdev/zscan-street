import * as THREE from "three";

/**
 * Comic speech bubbles: a white rounded box with a black outline and a tail, bold text inside.
 * Sprites, so they always face the camera and never read backwards (the characters' cut-outs
 * flip to face where they walk; the words must not). `tone` colours the text.
 */
export type Tone = "talk" | "shout" | "honk";

const cache = new Map<string, { tex: THREE.CanvasTexture; aspect: number }>();

function texture(text: string, tone: Tone) {
  const key = `${tone}|${text}`;
  let t = cache.get(key);
  if (t) return t;
  const c = document.createElement("canvas");
  const g = c.getContext("2d")!;
  const font = `${tone === "talk" ? 600 : 900} 44px "DotGothic16", "JetBrains Mono", monospace`;
  g.font = font;
  const w = Math.ceil(g.measureText(text).width) + 56;
  const h = 96;
  c.width = w;
  c.height = h + 22;
  g.font = font;
  const r = 22;
  const fill = tone === "honk" ? "#ffe24a" : "#fbf8f0";
  g.fillStyle = fill;
  g.strokeStyle = "#16141c";
  g.lineWidth = 6;
  g.beginPath();
  g.moveTo(r + 3, 3);
  g.arcTo(w - 3, 3, w - 3, h - 3, r);
  g.arcTo(w - 3, h - 3, 3, h - 3, r);
  // the tail, bottom left
  g.lineTo(52, h - 3);
  g.lineTo(30, h + 19);
  g.lineTo(34, h - 3);
  g.arcTo(3, h - 3, 3, 3, r);
  g.arcTo(3, 3, w - 3, 3, r);
  g.closePath();
  g.fill();
  g.stroke();
  g.fillStyle = tone === "shout" ? "#d0202a" : "#16141c";
  g.textBaseline = "middle";
  g.fillText(text, 28, h / 2 + 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  t = { tex, aspect: c.width / c.height };
  cache.set(key, t);
  return t;
}

/** A bubble sprite: bottom-left corner (the tail) at its position. `height` in metres. */
export function speechSprite(text: string, tone: Tone = "talk", height = 0.62) {
  const { tex, aspect } = texture(text, tone);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  s.center.set(0.1, 0);
  s.scale.set(height * aspect, height, 1);
  s.renderOrder = 6;
  return s;
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
    const k = Math.max(0.01, Math.min(1, age * 7, (seconds - age) * 6));
    s.scale.set(full.x * k, full.y * k, 1);
    if (age < seconds) requestAnimationFrame(tick);
    else parent.remove(s);
  };
  requestAnimationFrame(tick);
  return s;
}
