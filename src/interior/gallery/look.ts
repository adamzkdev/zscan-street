import * as THREE from "three";

/** Surfaces and signs of the gallery: parquet, wall paint, pools of light, painted panels. */

export const MONO = '"JetBrains Mono", Menlo, monospace';

function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")!] as const;
}

let pool: THREE.CanvasTexture | null = null;
/** Soft round pool of light, for the floor under spots (additive). */
export function poolTexture() {
  if (pool) return pool;
  const [c, g] = canvas(128, 128);
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, "rgba(255,255,255,0.9)");
  r.addColorStop(0.35, "rgba(255,255,255,0.45)");
  r.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = r;
  g.fillRect(0, 0, 128, 128);
  pool = new THREE.CanvasTexture(c);
  return pool;
}

let wash: THREE.CanvasTexture | null = null;
/** Wall wash: light fanning down from a ceiling spot (additive, on the wall). */
export function washTexture() {
  if (wash) return wash;
  const [c, g] = canvas(64, 128);
  // an elliptical scallop: narrow and bright under the lamp, fading to nothing at the sides
  g.scale(0.25, 1);
  const r = g.createRadialGradient(128, -8, 0, 128, -8, 128);
  r.addColorStop(0, "rgba(255,255,255,0.9)");
  r.addColorStop(0.45, "rgba(255,255,255,0.32)");
  r.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = r;
  g.fillRect(0, 0, 256, 128);
  wash = new THREE.CanvasTexture(c);
  return wash;
}

export function additive(map: THREE.Texture, color: string, k = 1) {
  return new THREE.MeshBasicMaterial({ map, color: new THREE.Color(color).multiplyScalar(k), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
}

/** A painted panel (canvas texture on a plane) that can be redrawn when data arrives. */
export class Panel {
  readonly mesh: THREE.Mesh;
  readonly ctx: CanvasRenderingContext2D;
  private tex: THREE.CanvasTexture;
  constructor(
    readonly w: number,
    readonly h: number,
    widthM: number,
    o: { glow?: boolean; transparent?: boolean } = {},
  ) {
    const [c, g] = canvas(w, h);
    this.ctx = g;
    this.tex = new THREE.CanvasTexture(c);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 8;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(widthM, (widthM * h) / w), new THREE.MeshBasicMaterial({ map: this.tex, transparent: o.transparent ?? true, toneMapped: !o.glow }));
  }
  draw(fn: (g: CanvasRenderingContext2D, w: number, h: number) => void) {
    this.ctx.clearRect(0, 0, this.w, this.h);
    fn(this.ctx, this.w, this.h);
    this.tex.needsUpdate = true;
    return this;
  }
}

/** Wall label in museum style: a dark plate with a ruled title and small caption. */
export function label(title: string, caption: string, accent: string, widthM = 1.6) {
  const p = new Panel(640, 200, widthM);
  p.draw((g, w, h) => {
    g.fillStyle = "rgba(10,9,12,0.94)";
    g.fillRect(0, 0, w, h);
    g.fillStyle = accent;
    g.fillRect(0, 0, 10, h);
    g.font = `700 64px ${MONO}`;
    g.fillStyle = "#f1f1f1";
    g.textBaseline = "alphabetic";
    g.fillText(title, 36, 92);
    g.fillStyle = accent;
    g.fillRect(36, 116, w - 72, 3);
    g.font = `500 36px ${MONO}`;
    g.fillStyle = "#a3a3a3";
    g.fillText(caption, 36, 168);
  });
  return p.mesh;
}
