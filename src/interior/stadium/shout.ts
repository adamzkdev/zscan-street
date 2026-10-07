import * as THREE from "three";
import type { Fans } from "./fans";
import { bubbles } from "../../scene/speech";

/**
 * The crowd shouts. A small pool of comic bubbles (sprites, each with its own canvas, redrawn
 * only when it pops) over fans picked in front of the camera: a steady murmur of lines, whole
 * ends chanting together, and bursts when something happens. At most `max` at once.
 */

export type Style = "shout" | "chant" | "talk" | "silver" | "boo";

interface Bubble {
  sprite: THREE.Sprite;
  g: CanvasRenderingContext2D;
  tex: THREE.CanvasTexture;
  aspect: number;
  at: THREE.Vector3;
  age: number;
  life: number;
  on: boolean;
  seat: number;
  wob: number;
  text: string;
}

const CW = 640,
  CH = 230;

const STYLES: Record<Style, { fill: string; stroke: string; ink: string; spiky: boolean; font: string }> = {
  shout: { fill: "#ffe14a", stroke: "#16141c", ink: "#d0202a", spiky: true, font: "Impact, 'Arial Black', 'Helvetica Neue', sans-serif" },
  boo: { fill: "#ff8a5c", stroke: "#16141c", ink: "#16141c", spiky: true, font: "Impact, 'Arial Black', 'Helvetica Neue', sans-serif" },
  chant: { fill: "#f4b728", stroke: "#16141c", ink: "#16141c", spiky: false, font: "Impact, 'Arial Black', 'Helvetica Neue', sans-serif" },
  talk: { fill: "#fbf8f0", stroke: "#16141c", ink: "#16141c", spiky: false, font: "'Arial Black', 'Helvetica Neue', sans-serif" },
  silver: { fill: "#dfe4f0", stroke: "#1b2238", ink: "#1b2238", spiky: false, font: "Impact, 'Arial Black', 'Helvetica Neue', sans-serif" },
};

/** Draws a bubble into the left of the canvas; returns the used width. */
function draw(g: CanvasRenderingContext2D, text: string, style: Style) {
  const st = STYLES[style];
  g.clearRect(0, 0, CW, CH);
  let size = 64;
  g.font = `${size}px ${st.font}`;
  let tw = g.measureText(text).width;
  const room = CW - (st.spiky ? 150 : 90);
  if (tw > room) {
    size = Math.floor((size * room) / tw);
    g.font = `${size}px ${st.font}`;
    tw = g.measureText(text).width;
  }
  const pad = st.spiky ? 70 : 40;
  const w = Math.min(CW, Math.ceil(tw + pad * 2));
  const top = 14,
    bot = CH - 50;
  const h = bot - top;
  g.lineJoin = "round";
  g.lineWidth = 7;
  g.fillStyle = st.fill;
  g.strokeStyle = st.stroke;
  g.beginPath();
  if (st.spiky) {
    // a burst: spikes round an ellipse, the tail one longer, down to the shouter
    const cx = w / 2,
      cy = top + h / 2;
    const rx = w / 2 - 6,
      ry = h / 2 - 4;
    const n = 22;
    for (let i = 0; i <= n * 2; i++) {
      const a = (i / (n * 2)) * Math.PI * 2 + 0.07;
      const out = i % 2 === 0;
      const k = out ? 1 : 0.78 + 0.05 * Math.sin(i * 2.3);
      let x = cx + Math.cos(a) * rx * k,
        y = cy + Math.sin(a) * ry * k;
      // the tail: the spike pointing down-left reaches the bottom of the canvas
      if (out && Math.abs(a - Math.PI * 0.68) < 0.16) {
        x = w * 0.2;
        y = CH - 6;
      }
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
  } else {
    const r = 34;
    g.moveTo(r + 4, top);
    g.arcTo(w - 4, top, w - 4, bot, r);
    g.arcTo(w - 4, bot, 4, bot, r);
    g.lineTo(w * 0.32, bot);
    g.lineTo(w * 0.14, CH - 6);
    g.lineTo(w * 0.2, bot);
    g.arcTo(4, bot, 4, top, r);
    g.arcTo(4, top, w - 4, top, r);
  }
  g.closePath();
  g.fill();
  g.stroke();
  // a little shine
  if (!st.spiky) {
    g.fillStyle = "rgba(255,255,255,0.35)";
    g.fillRect(28, top + 12, Math.min(90, w * 0.2), 7);
  }
  g.fillStyle = st.ink;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.font = `${size}px ${st.font}`;
  if (style === "shout" || style === "boo") {
    g.lineWidth = 4;
    g.strokeStyle = "#16141c";
  }
  g.fillText(text, w / 2, top + h / 2 + 3);
  return w;
}

export class Shouts {
  readonly group = new THREE.Group();
  private pool: Bubble[] = [];
  private cam = new THREE.Vector3();
  private fwd = new THREE.Vector3();
  private frustum = new THREE.Frustum();
  private pm = new THREE.Matrix4();
  private tmp = new THREE.Vector3();
  private queue: { text: string; style: Style; seat?: number; delay: number; near?: (i: number) => boolean }[] = [];
  /** Screen size: bubble height = distance × this (metres per metre), clamped. */
  size = 0.032;
  minH = 0.35;
  maxH = 1.4;
  /** Farthest fan who gets a bubble. */
  range = 70;
  /** Ortho cameras (the city's iso view): visible height in metres, else 0. */
  private ortho = 0;
  /** Bubble height (as a share of the view) under an ortho camera. */
  orthoSize = 0.02;

  constructor(
    private fans: Fans,
    readonly max = 12,
    depthTest = false,
  ) {
    for (let i = 0; i < max; i++) {
      const c = document.createElement("canvas");
      c.width = CW;
      c.height = CH;
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest, toneMapped: false }));
      sprite.visible = false;
      sprite.renderOrder = 8;
      this.group.add(sprite);
      this.pool.push({ sprite, g: c.getContext("2d")!, tex, aspect: 1, at: new THREE.Vector3(), age: 0, life: 0, on: false, seat: -1, wob: 0, text: "" });
    }
  }

  /** Visible height of the ortho view (0 for a perspective camera). */
  get orthoView() {
    return this.ortho;
  }

  get busy() {
    return this.pool.filter((b) => b.on).length + this.queue.length;
  }

  /** A fan of the crowd shouts `text` (a fan picked in view when `seat` is not given). */
  say(text: string, style: Style = "talk", o: { seat?: number; delay?: number; near?: (i: number) => boolean } = {}) {
    this.queue.push({ text, style, seat: o.seat, delay: o.delay ?? 0, near: o.near });
  }

  /** A fan in front of the camera, within range, not already talking, matching `ok`. */
  pickSeat(ok?: (i: number) => boolean) {
    const n = this.fans.seats.length;
    if (!n) return -1;
    let best = -1,
      bestD = 1e9;
    for (let k = 0; k < 40; k++) {
      const i = Math.floor(Math.random() * n);
      if (ok && !ok(i)) continue;
      if (this.pool.some((b) => b.on && b.seat === i)) continue;
      const p = this.fans.head(i, this.tmp);
      const d = p.distanceTo(this.cam);
      if (!this.ortho && (d > this.range || d < 2.5)) continue;
      if (!this.frustum.containsPoint(p)) continue;
      // keep bubbles apart on screen
      const dir = p.clone().sub(this.cam).normalize();
      if (this.pool.some((b) => b.on && b.at.clone().sub(this.cam).normalize().dot(dir) > 0.997)) continue;
      // prefer fans nearer the middle of the view and not too far
      const score = this.ortho ? Math.random() : d * (1.6 - dir.dot(this.fwd));
      if (score < bestD) {
        bestD = score;
        best = i;
      }
      if (k > 12 && best >= 0) break;
    }
    return best;
  }

  private pop(text: string, style: Style, seat: number) {
    const b = this.pool.find((x) => !x.on);
    if (!b) return false;
    // the same line twice at once only when it is chanted
    if (style !== "chant" && this.pool.some((x) => x.on && x.text === text)) return false;
    b.text = text;
    const w = draw(b.g, text, style);
    b.tex.repeat.set(w / CW, 1);
    b.tex.offset.set(0, 0);
    b.tex.needsUpdate = true;
    b.aspect = w / CH;
    // the tail's tip sits on the fan
    b.sprite.center.set(STYLES[style].spiky ? 0.2 : 0.14, 0);
    b.on = true;
    b.age = 0;
    b.life = 2.1 + Math.random() * 1.2 + text.length * 0.03;
    b.seat = seat;
    b.wob = Math.random() * 10;
    this.fans.head(seat, b.at);
    b.sprite.visible = true;
    // shown only while the fan can be seen (see scene/speech.ts)
    bubbles.track(b.sprite);
    return true;
  }

  tick(dt: number, camera: THREE.Camera) {
    camera.getWorldPosition(this.cam);
    camera.getWorldDirection(this.fwd);
    camera.updateMatrixWorld();
    const oc = camera as THREE.OrthographicCamera;
    this.ortho = oc.isOrthographicCamera ? (oc.top - oc.bottom) / oc.zoom : 0;
    this.pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.pm);
    // the queue: due lines pop over a fan (dropped if nobody suitable is in view)
    for (let i = 0; i < this.queue.length; i++) {
      const q = this.queue[i];
      q.delay -= dt;
      if (q.delay > 0) continue;
      this.queue.splice(i--, 1);
      if (!this.pool.some((b) => !b.on)) continue;
      const seat = q.seat ?? this.pickSeat(q.near);
      if (seat >= 0) this.pop(q.text, q.style, seat);
    }
    if (this.queue.length > 40) this.queue.splice(0, this.queue.length - 40);
    for (const b of this.pool) {
      if (!b.on) continue;
      b.age += dt;
      if (b.age > b.life) {
        b.on = false;
        b.sprite.visible = false;
        continue;
      }
      // follow the fan (standing up, jumping)
      this.fans.head(b.seat, b.at);
      // the same size on screen as everyone's bubbles (scene/speech.ts), a touch smaller
      const h = this.ortho ? this.ortho * this.orthoSize : bubbles.metres(camera, b.at, 0.9);
      // pop in with an overshoot, shrink away at the end
      const a = b.age;
      const pin = a < 0.22 ? THREE.MathUtils.smoothstep(a, 0, 0.16) * (1 + 0.25 * Math.sin((a / 0.22) * Math.PI)) : 1;
      const out = Math.min(1, (b.life - a) * 5);
      const k = Math.max(0.01, pin * out) * (1 + 0.03 * Math.sin(a * 14 + b.wob));
      b.sprite.scale.set(h * b.aspect * k, h * k, 1);
      b.sprite.position.copy(b.at).add(this.tmp.set(0, h * 0.06 + a * 0.08, 0));
      b.sprite.userData.alpha = Math.min(1, out * 1.5);
    }
  }
}
