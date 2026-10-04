import * as THREE from "three";

/** Surfaces and signs of the gallery: parquet, wall paint, pools of light, painted panels. */

export const MONO = '"JetBrains Mono", Menlo, monospace';
export const SANS = "Roboto, ui-sans-serif, system-ui, sans-serif";

function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")!] as const;
}

let parquet: THREE.CanvasTexture | null = null;
/** Dark herringbone-ish parquet in big pixels (one texel = 2 cm, tile = 1 m). */
export function floorTexture(repeatX: number, repeatY: number) {
  if (!parquet) {
    const [c, g] = canvas(64, 64);
    const tones = ["#1c1714", "#211a16", "#18130f", "#251d18", "#1e1813"];
    for (let by = 0; by < 4; by++)
      for (let bx = 0; bx < 4; bx++) {
        const vertical = (bx + by) % 2 === 0;
        for (let k = 0; k < 4; k++) {
          g.fillStyle = tones[(bx * 7 + by * 3 + k * 5) % tones.length];
          if (vertical) g.fillRect(bx * 16 + k * 4, by * 16, 4, 16);
          else g.fillRect(bx * 16, by * 16 + k * 4, 16, 4);
        }
        g.fillStyle = "rgba(0,0,0,0.35)";
        g.fillRect(bx * 16, by * 16, 16, 1);
        g.fillRect(bx * 16, by * 16, 1, 16);
      }
    parquet = new THREE.CanvasTexture(c);
    parquet.colorSpace = THREE.SRGBColorSpace;
    parquet.magFilter = THREE.NearestFilter;
    parquet.wrapS = parquet.wrapT = THREE.RepeatWrapping;
    parquet.anisotropy = 8;
  }
  const t = parquet.clone();
  t.repeat.set(repeatX, repeatY);
  t.needsUpdate = true;
  return t;
}

export function floorMaterial(w: number, d: number) {
  return new THREE.MeshStandardMaterial({ map: floorTexture(w, d), roughness: 0.72, metalness: 0, envMapIntensity: 0.35 });
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

/** Neon text: a bright core over a wide coloured glow. */
export function neonText(g: CanvasRenderingContext2D, text: string, x: number, y: number, font: string, color: string, blur = 24) {
  g.font = font;
  g.shadowColor = color;
  g.shadowBlur = blur;
  g.fillStyle = color;
  g.fillText(text, x, y);
  g.shadowBlur = blur / 2;
  g.fillText(text, x, y);
  g.shadowBlur = 0;
  g.fillStyle = "rgba(255,255,255,0.75)";
  g.globalAlpha = 0.55;
  g.fillText(text, x, y);
  g.globalAlpha = 1;
}

/** A vertical neon sign of stacked glyphs (katakana reads top to bottom). */
export function verticalNeon(text: string, color: string, heightM: number) {
  const chars = [...text];
  const cell = 112;
  const p = new Panel(160, cell * chars.length + 48, (heightM * 160) / (cell * chars.length + 48), { glow: true });
  p.draw((g, w) => {
    g.fillStyle = "rgba(8,6,10,0.92)";
    g.fillRect(8, 0, w - 16, cell * chars.length + 48);
    g.strokeStyle = color;
    g.lineWidth = 4;
    g.shadowColor = color;
    g.shadowBlur = 16;
    g.strokeRect(14, 6, w - 28, cell * chars.length + 36);
    g.shadowBlur = 0;
    g.textAlign = "center";
    g.textBaseline = "middle";
    chars.forEach((ch, i) => neonText(g, ch, w / 2, 24 + cell * i + cell / 2, `700 92px "Hiragino Sans", "Noto Sans JP", ${SANS}`, color, 20));
  });
  return p.mesh;
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

/** "1 234" style thousands for wall text. */
export const num = (n: number) => n.toLocaleString("en-US");
/** Zatoshis to a short ZEC figure. */
export const zec = (zat: number | null | undefined, digits = 2) => (zat == null ? "—" : `${(zat / 1e8).toFixed(zat < 1e8 ? Math.max(digits, 3) : digits)} ZEC`);
