import * as THREE from "three";

/** Small seeded PRNG so the city looks the same on every load. */
export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")!] as const;
}

function tex(c: HTMLCanvasElement, opts: { repeat?: [number, number]; srgb?: boolean; nearest?: boolean } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (opts.srgb !== false) t.colorSpace = THREE.SRGBColorSpace;
  if (opts.repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(...opts.repeat);
  }
  if (opts.nearest) {
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestMipmapLinearFilter;
  }
  t.anisotropy = 4;
  return t;
}

function noise(ctx: CanvasRenderingContext2D, w: number, h: number, amount: number, r: () => number, cell = 2) {
  for (let y = 0; y < h; y += cell)
    for (let x = 0; x < w; x += cell) {
      const v = (r() - 0.5) * amount;
      ctx.fillStyle = v > 0 ? `rgba(255,255,255,${v})` : `rgba(0,0,0,${-v})`;
      ctx.fillRect(x, y, cell, cell);
    }
}

/** Cracked asphalt with lane markings and a zebra crossing. Road spans `len` × `width` world units. */
export function roadTexture(len: number, width: number, crossAt: number[], lanes = 2, day = false) {
  const P = 32;
  const [c, ctx] = canvas(len * P, width * P);
  const r = rng(7);
  // by day: clean light-grey tarmac of a product render, barely any wear
  ctx.fillStyle = day ? "#8e8da6" : "#2a2833";
  ctx.fillRect(0, 0, c.width, c.height);
  noise(ctx, c.width, c.height, day ? 0.04 : 0.12, r, 4);
  // patches and cracks
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = day ? `rgba(${r() > 0.5 ? "150,148,168" : "190,188,204"},${0.15 + r() * 0.15})` : `rgba(${r() > 0.5 ? "20,18,26" : "60,56,70"},${0.25 + r() * 0.3})`;
    ctx.fillRect(r() * c.width, r() * c.height, 20 + r() * 90, 10 + r() * 40);
  }
  ctx.strokeStyle = day ? "rgba(120,118,140,0.25)" : "rgba(10,10,14,0.7)";
  ctx.lineWidth = 2;
  for (let i = 0; i < 30; i++) {
    let x = r() * c.width,
      y = r() * c.height;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let k = 0; k < 5; k++) {
      x += (r() - 0.5) * 40;
      y += (r() - 0.5) * 40;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // centre dashes and edge lines
  ctx.fillStyle = day ? "rgba(255,255,255,0.95)" : "rgba(230,225,215,0.75)";
  if (lanes === 4) {
    // double yellow in the middle, dashed white between the lanes of each direction
    ctx.fillStyle = "rgba(240,190,60,0.8)";
    ctx.fillRect(0, c.height / 2 - 7, c.width, 4);
    ctx.fillRect(0, c.height / 2 + 3, c.width, 4);
    ctx.fillStyle = day ? "rgba(255,255,255,0.95)" : "rgba(230,225,215,0.7)";
    for (const k of [0.25, 0.75]) for (let x = 10; x < c.width; x += 90) ctx.fillRect(x, c.height * k - 3, 46, 6);
  } else for (let x = 10; x < c.width; x += 90) ctx.fillRect(x, c.height / 2 - 3, 46, 6);
  ctx.fillStyle = "rgba(240,190,60,0.7)";
  ctx.fillRect(0, 10, c.width, 4);
  ctx.fillRect(0, c.height - 14, c.width, 4);
  // zebra crossings
  ctx.fillStyle = day ? "rgba(255,255,255,0.97)" : "rgba(235,232,225,0.82)";
  for (const cx of crossAt) {
    const px = cx * P;
    for (let y = 22; y < c.height - 22; y += 26) ctx.fillRect(px - 40, y, 80, 14);
  }
  // "BUS" stop box
  ctx.strokeStyle = "rgba(240,190,60,0.8)";
  ctx.lineWidth = 4;
  return tex(c);
}

/** Square paving slabs for sidewalks; `tiles` slabs across the texture. */
export function pavingTexture(seed: number, tiles = 4, day = false) {
  const [c, ctx] = canvas(256, 256);
  const r = rng(seed);
  const s = 256 / tiles;
  for (let y = 0; y < tiles; y++)
    for (let x = 0; x < tiles; x++) {
      const g = (day ? 214 : 72) + Math.floor(r() * (day ? 12 : 22));
      ctx.fillStyle = `rgb(${g},${g - 2},${Math.min(255, g + 10)})`;
      ctx.fillRect(x * s, y * s, s, s);
    }
  noise(ctx, 256, 256, day ? 0.035 : 0.1, r, 2);
  ctx.strokeStyle = day ? "rgba(150,146,175,0.55)" : "rgba(20,18,26,0.85)";
  ctx.lineWidth = day ? 2 : 3;
  for (let i = 0; i <= tiles; i++) {
    ctx.beginPath();
    ctx.moveTo(i * s, 0);
    ctx.lineTo(i * s, 256);
    ctx.moveTo(0, i * s);
    ctx.lineTo(256, i * s);
    ctx.stroke();
  }
  return tex(c, { repeat: [1, 1] });
}

export function concreteTexture(seed: number, base = "#3a3646") {
  const [c, ctx] = canvas(128, 128);
  const r = rng(seed);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 128, 128);
  noise(ctx, 128, 128, 0.14, r, 2);
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = `rgba(0,0,0,${0.08 + r() * 0.1})`;
    ctx.fillRect(r() * 128, 0, 2 + r() * 6, 128);
  }
  return tex(c, { repeat: [1, 1] });
}

export interface FacadeOpts {
  seed: number;
  base: string;
  floors: number;
  cols: number;
  /** Share of windows lit. */
  lit: number;
  /** Leave the ground floor blank (shop fronts are added as meshes). */
  groundShop?: boolean;
  /** Warm or cool interiors. */
  tint?: "warm" | "cool" | "mixed";
}

/** A facade with a window grid: returns the colour map and the matching emissive map. */
export function facadeTextures(wUnits: number, hUnits: number, o: FacadeOpts) {
  const P = 32;
  const W = Math.round(wUnits * P),
    H = Math.round(hUnits * P);
  const [c, ctx] = canvas(W, H);
  const [e, ex] = canvas(W, H);
  const r = rng(o.seed);
  ctx.fillStyle = o.base;
  ctx.fillRect(0, 0, W, H);
  noise(ctx, W, H, 0.13, r, 2);
  // panel seams and stains
  ctx.fillStyle = "rgba(0,0,0,0.18)";
  for (let y = 0; y < H; y += H / o.floors) ctx.fillRect(0, y, W, 3);
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = `rgba(0,0,0,${0.06 + r() * 0.1})`;
    ctx.fillRect(r() * W, r() * H * 0.5, 4 + r() * 10, H * (0.2 + r() * 0.5));
  }
  ex.fillStyle = "#000";
  ex.fillRect(0, 0, W, H);

  const fh = H / o.floors;
  const cw = W / o.cols;
  for (let f = 0; f < o.floors; f++) {
    if (o.groundShop && f === o.floors - 1) continue;
    for (let k = 0; k < o.cols; k++) {
      const x = k * cw + cw * 0.18,
        y = f * fh + fh * 0.22,
        w = cw * 0.64,
        h = fh * 0.55;
      const on = r() < o.lit;
      // frame
      ctx.fillStyle = "#15131c";
      ctx.fillRect(x - 3, y - 3, w + 6, h + 6);
      const warm = o.tint === "cool" ? false : o.tint === "warm" ? true : r() > 0.35;
      if (on) {
        const col = warm ? `hsl(${32 + r() * 12}, 90%, ${55 + r() * 15}%)` : `hsl(${185 + r() * 25}, 70%, ${55 + r() * 10}%)`;
        ctx.fillStyle = col;
        ctx.fillRect(x, y, w, h);
        ex.fillStyle = col;
        ex.fillRect(x, y, w, h);
        // blinds / silhouettes
        ctx.fillStyle = ex.fillStyle = "rgba(30,20,20,0.35)";
        if (r() > 0.5) {
          ctx.fillRect(x, y, w, h * (0.2 + r() * 0.4));
          ex.fillRect(x, y, w, h * (0.2 + r() * 0.4));
        }
      } else {
        ctx.fillStyle = "#1e2230";
        ctx.fillRect(x, y, w, h);
        ctx.fillStyle = "rgba(120,140,190,0.12)";
        ctx.fillRect(x, y, w * 0.4, h);
      }
      // mullion
      ctx.fillStyle = "#15131c";
      ctx.fillRect(x + w / 2 - 1.5, y, 3, h);
      // sill
      ctx.fillStyle = "rgba(255,255,255,0.08)";
      ctx.fillRect(x - 4, y + h + 3, w + 8, 3);
    }
  }
  return { map: tex(c), emissive: tex(e) };
}

/** Neon sign: glowing text in a dark box. Vertical signs stack characters. */
export function neonTexture(text: string, color: string, opts: { vertical?: boolean; bg?: string; font?: string } = {}) {
  const chars = [...text];
  const S = 128;
  const vertical = opts.vertical ?? false;
  const latin = /^[\x20-\x7e]+$/.test(text);
  const w = vertical ? S : latin ? Math.max(S, chars.length * 70 + 60) : chars.length * S + 40;
  const h = vertical ? chars.length * S + 40 : S;
  const [c, ctx] = canvas(w, h);
  ctx.fillStyle = opts.bg ?? "rgba(8,8,14,0.92)";
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = color;
  ctx.lineWidth = 5;
  ctx.shadowColor = color;
  ctx.shadowBlur = 14;
  ctx.strokeRect(8, 8, w - 16, h - 16);
  ctx.font = opts.font ?? `700 ${latin ? 76 : 92}px "Hiragino Sans", "Noto Sans JP", "Yu Gothic", Inter, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#fff";
  ctx.shadowBlur = 22;
  if (vertical) chars.forEach((ch, i) => ctx.fillText(ch, w / 2, 20 + S / 2 + i * S));
  else if (latin) ctx.fillText(text, w / 2, h / 2 + 4);
  else chars.forEach((ch, i) => ctx.fillText(ch, 20 + S / 2 + i * S, h / 2 + 6));
  ctx.globalCompositeOperation = "source-atop";
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.35;
  ctx.fillRect(0, 0, w, h);
  return { texture: tex(c), aspect: w / h };
}

/** Round Zcash ⓩ badge. */
export function zcashBadge(color = "#f4b728", bg = "rgba(10,10,16,0.95)") {
  const [c, ctx] = canvas(128, 128);
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.arc(64, 64, 62, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 10;
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.arc(64, 64, 50, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 11;
  ctx.lineJoin = "miter";
  ctx.beginPath();
  ctx.moveTo(44, 44);
  ctx.lineTo(84, 44);
  ctx.lineTo(44, 84);
  ctx.lineTo(84, 84);
  ctx.stroke();
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(64, 30);
  ctx.lineTo(64, 44);
  ctx.moveTo(64, 84);
  ctx.lineTo(64, 98);
  ctx.stroke();
  return tex(c);
}

/** LED destination sign for the block bus. */
export function busSign(text: string) {
  const [c, ctx] = canvas(512, 96);
  ctx.fillStyle = "#0c0a08";
  ctx.fillRect(0, 0, 512, 96);
  ctx.font = '700 58px "JetBrains Mono", Menlo, monospace';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "#ffae35";
  ctx.shadowBlur = 16;
  ctx.fillStyle = "#ffc260";
  ctx.fillText(text, 256, 52);
  // LED dot mask
  ctx.globalCompositeOperation = "destination-out";
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  for (let y = 0; y < 96; y += 4) ctx.fillRect(0, y, 512, 1);
  for (let x = 0; x < 512; x += 4) ctx.fillRect(x, 0, 1, 96);
  return c;
}

export function updateCanvasTexture(t: THREE.CanvasTexture, c: HTMLCanvasElement) {
  t.image = c;
  t.needsUpdate = true;
}

export function canvasTexture(c: HTMLCanvasElement) {
  return tex(c);
}

/** Soft round blob used for contact shadows and light pools. */
export function blobTexture(inner = "rgba(0,0,0,0.75)", outer = "rgba(0,0,0,0)") {
  const [c, ctx] = canvas(128, 128);
  const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
  g.addColorStop(0, inner);
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return tex(c, { srgb: false });
}

/** Shop-window interior: warm light, shelves stacked with parcels. */
export function shopInterior(seed: number) {
  const [c, ctx] = canvas(256, 128);
  const r = rng(seed);
  const g = ctx.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, "#ffcf8a");
  g.addColorStop(1, "#b0602a");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 128);
  for (let shelf = 0; shelf < 3; shelf++) {
    const y = 20 + shelf * 36;
    ctx.fillStyle = "#4a2a18";
    ctx.fillRect(0, y + 22, 256, 5);
    for (let x = 6; x < 250; x += 14 + r() * 10) {
      const hue = [150, 270, 30, 50][Math.floor(r() * 4)];
      ctx.fillStyle = `hsl(${hue}, 60%, ${45 + r() * 15}%)`;
      ctx.fillRect(x, y + 22 - (8 + r() * 12), 10 + r() * 6, 8 + r() * 12);
    }
  }
  return tex(c);
}

export function grassTexture(seed: number) {
  const [c, ctx] = canvas(128, 128);
  const r = rng(seed);
  ctx.fillStyle = "#2c4a2e";
  ctx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 900; i++) {
    const g = 60 + r() * 50;
    ctx.fillStyle = `rgba(${g * 0.5},${g},${g * 0.5},0.5)`;
    ctx.fillRect(r() * 128, r() * 128, 2, 3);
  }
  return tex(c, { repeat: [1, 1] });
}

/** Corrugated shipping-container side. */
export function containerTexture(color: string, label = "") {
  const [c, ctx] = canvas(256, 96);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 256, 96);
  for (let x = 0; x < 256; x += 8) {
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    ctx.fillRect(x, 0, 3, 96);
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    ctx.fillRect(x + 4, 0, 2, 96);
  }
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.fillRect(0, 0, 256, 5);
  ctx.fillRect(0, 91, 256, 5);
  if (label) {
    ctx.font = '700 30px Inter, sans-serif';
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.fillText(label, 18, 58);
  }
  return tex(c);
}

/** Dark water with a few highlights, for ponds and the fountain. */
export function waterTexture() {
  const [c, ctx] = canvas(128, 128);
  const r = rng(5);
  ctx.fillStyle = "#0e2a3a";
  ctx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = `rgba(120,220,255,${0.08 + r() * 0.15})`;
    ctx.fillRect(r() * 128, r() * 128, 6 + r() * 14, 1.5);
  }
  return tex(c, { repeat: [1, 1] });
}
