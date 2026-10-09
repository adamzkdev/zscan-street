import * as THREE from "three";

/**
 * The sky behind the city, as an equirectangular panorama painted once per theme: by day a deep
 * blue overhead paling to a warm haze at the horizon, the sun and its glow where the shadows say
 * it is, and soft cumulus banks; by night a near-black sky glowing magenta over the city, a
 * scatter of stars and the moon. It turns slowly (the clouds drift). Its horizon colour is the fog's.
 */

export const SKY_HORIZON = { day: "#e3e9f3", night: "#1c0e28" };

const cache = new Map<string, THREE.Texture>();
const W = 2048,
  H = 1024;

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Canvas position of a direction (three's equirect mapping; the texture is flipped in y). */
function toCanvas(dir: THREE.Vector3) {
  const u = Math.atan2(dir.z, dir.x) / (Math.PI * 2) + 0.5;
  const v = Math.asin(THREE.MathUtils.clamp(dir.y, -1, 1)) / Math.PI + 0.5;
  return [u * W, (1 - v) * H] as const;
}

/** Canvas row of an elevation (radians above the horizon). */
const rowAt = (elev: number) => (0.5 - elev / Math.PI) * H;

function paint(day: boolean, sunDir: THREE.Vector3) {
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;
  const r = rng(day ? 41 : 97);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  if (day) {
    g.addColorStop(0, "#2a62bf");
    g.addColorStop(0.2, "#4a86d8");
    g.addColorStop(0.36, "#86b2ea");
    g.addColorStop(0.46, "#c8daf2");
    g.addColorStop(0.5, SKY_HORIZON.day);
    g.addColorStop(0.53, "#d8dce6");
    g.addColorStop(1, "#c9ccd8");
  } else {
    g.addColorStop(0, "#020309");
    g.addColorStop(0.25, "#060714");
    g.addColorStop(0.4, "#0d0a22");
    g.addColorStop(0.47, "#2a1236");
    g.addColorStop(0.5, SKY_HORIZON.night);
    g.addColorStop(1, "#0c0812");
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  const [sx, sy] = toCanvas(sunDir);
  if (day) {
    // the sun: a small soft brightening of the sky where the shadows say it is, never a glare
    for (const off of [-W, 0, W]) {
      const sg = ctx.createRadialGradient(sx + off, sy, 0, sx + off, sy, 140);
      sg.addColorStop(0, "rgba(255,248,232,0.4)");
      sg.addColorStop(1, "rgba(255,248,232,0)");
      ctx.fillStyle = sg;
      ctx.fillRect(sx + off - 140, sy - 140, 280, 280);
    }
    // cumulus: clusters of soft puffs, flattened, thicker and smaller toward the horizon
    for (let k = 0; k < 46; k++) {
      const elev = 0.04 + Math.pow(r(), 1.6) * 0.55;
      const cx = r() * W;
      const cy = rowAt(elev);
      const scale = 0.35 + (elev / 0.6) * 0.9;
      const puffs = 6 + Math.floor(r() * 10);
      for (let p = 0; p < puffs; p++) {
        const px = cx + (r() - 0.5) * 220 * scale;
        const py = cy + (r() - 0.6) * 26 * scale;
        const pr = (22 + r() * 38) * scale;
        for (const off of [-W, 0, W]) {
          // lit tops, greyer undersides
          const pg = ctx.createRadialGradient(px + off, py - pr * 0.25, 0, px + off, py, pr);
          pg.addColorStop(0, "rgba(255,255,255,0.85)");
          pg.addColorStop(0.55, "rgba(246,248,252,0.55)");
          pg.addColorStop(0.8, "rgba(214,222,236,0.22)");
          pg.addColorStop(1, "rgba(214,222,236,0)");
          ctx.fillStyle = pg;
          ctx.beginPath();
          ctx.ellipse(px + off, py, pr * 1.5, pr, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    // a veil of haze over the horizon
    const hz = ctx.createLinearGradient(0, rowAt(0.12), 0, rowAt(-0.02));
    hz.addColorStop(0, "rgba(227,233,243,0)");
    hz.addColorStop(1, "rgba(227,233,243,0.9)");
    ctx.fillStyle = hz;
    ctx.fillRect(0, rowAt(0.12), W, rowAt(-0.02) - rowAt(0.12));
  } else {
    // stars, fewer and fainter toward the city's glow
    for (let k = 0; k < 2600; k++) {
      const elev = Math.asin(r()) ;
      if (elev < 0.08) continue;
      const x = r() * W,
        y = rowAt(elev);
      const b = r();
      const a = (0.25 + b * 0.75) * Math.min(1, (elev - 0.08) * 4);
      ctx.fillStyle = `rgba(${220 + r() * 35},${225 + r() * 30},255,${a})`;
      const s = b > 0.985 ? 2.2 : b > 0.9 ? 1.5 : 1;
      ctx.fillRect(x, y, s, s);
    }
    // (the moon is the cemetery's, over its chapel: no second one here)
    // thin clouds lit from below by the city
    for (let k = 0; k < 30; k++) {
      const elev = 0.03 + Math.pow(r(), 2) * 0.3;
      const cx = r() * W,
        cy = rowAt(elev);
      const pr = 40 + r() * 90;
      for (const off of [-W, 0, W]) {
        const pg = ctx.createRadialGradient(cx + off, cy, 0, cx + off, cy, pr);
        pg.addColorStop(0, "rgba(90,40,90,0.22)");
        pg.addColorStop(1, "rgba(90,40,90,0)");
        ctx.fillStyle = pg;
        ctx.beginPath();
        ctx.ellipse(cx + off, cy, pr * 2.4, pr * 0.45, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.mapping = THREE.EquirectangularReflectionMapping;
  t.anisotropy = 4;
  return t;
}

/** The sky for a theme; `sunDir` points toward the sun (or the moon). */
export function skyTexture(day: boolean, sunDir: THREE.Vector3) {
  const key = day ? "day" : "night";
  let t = cache.get(key);
  if (!t) cache.set(key, (t = paint(day, sunDir.clone().normalize())));
  return t;
}
