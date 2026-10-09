import { Surface, type SkyKit } from "../zktowers/kit";
import { SANS } from "../zktowers/kit";

/**
 * The marks of the projects with a hall of their own, as their sites serve them (copied to
 * public/university/logos): Zakura's pink flower and its wordmark (zakura.com), Tachyon's orange
 * T in its ring (tachyon.z.cash).
 */
export type Mark = "zakura" | "tachyon";

const FILES: Record<Mark, { mark: string; word?: string; name: string; color: string }> = {
  zakura: { mark: "/university/logos/zakura-flower.svg", word: "/university/logos/zakura-text.svg", name: "Zakura", color: "#fd6798" },
  tachyon: { mark: "/university/logos/tachyon.png", name: "Tachyon", color: "#f08a00" },
};

const cache = new Map<string, Promise<HTMLImageElement | null>>();
function image(src: string) {
  let p = cache.get(src);
  if (!p) {
    p = new Promise((res) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => res(null);
      i.src = src;
    });
    cache.set(src, p);
  }
  return p;
}

export async function logoImages(m: Mark) {
  const f = FILES[m];
  const [mark, word] = await Promise.all([image(f.mark), f.word ? image(f.word) : Promise.resolve(null)]);
  return { ...f, mark, word };
}

/** Draw the mark and the name (the wordmark if there is one) into a box, left to right, centred. */
export async function drawLogo(g: CanvasRenderingContext2D, m: Mark, x: number, y: number, w: number, h: number, o: { ink?: string; stacked?: boolean } = {}) {
  const L = await logoImages(m);
  const ink = o.ink ?? "#1a1410";
  if (o.stacked) {
    const s = Math.min(w, h * 0.62);
    if (L.mark) g.drawImage(L.mark, x + (w - s) / 2, y, s, s);
    const ty = y + s + h * 0.06,
      th = h - s - h * 0.06;
    drawName(g, L, x, ty, w, th, ink);
    return;
  }
  const s = h;
  if (L.mark) g.drawImage(L.mark, x, y, s, s);
  drawName(g, L, x + s * 1.12, y + h * 0.12, w - s * 1.12, h * 0.76, ink);
}

function drawName(g: CanvasRenderingContext2D, L: Awaited<ReturnType<typeof logoImages>>, x: number, y: number, w: number, h: number, ink: string) {
  if (L.word) {
    const r = L.word.width / L.word.height || 3.36;
    const ww = Math.min(w, h * r);
    // the wordmark is black ink: tint it for dark grounds
    const c = document.createElement("canvas");
    c.width = Math.ceil(ww);
    c.height = Math.ceil(ww / r);
    const cg = c.getContext("2d")!;
    cg.drawImage(L.word, 0, 0, c.width, c.height);
    cg.globalCompositeOperation = "source-in";
    cg.fillStyle = ink;
    cg.fillRect(0, 0, c.width, c.height);
    g.drawImage(c, x, y + (h - c.height) / 2);
  } else {
    g.fillStyle = L.color;
    g.textBaseline = "middle";
    let px = Math.round(h * 0.8);
    g.font = `800 ${px}px ${SANS}`;
    const tw = g.measureText(L.name.toUpperCase()).width;
    if (tw > w) {
      px = Math.floor((px * w) / tw);
      g.font = `800 ${px}px ${SANS}`;
    }
    const left = g.measureText(L.name.toUpperCase()).width;
    // centred when stacked under the mark (the box is then as wide as the banner)
    g.fillText(L.name.toUpperCase(), h > w * 0.3 ? x + (w - left) / 2 : x, y + h / 2);
  }
}

/** A logo as a transparent sign on a wall, `w` metres wide. */
export function logoSign(k: SkyKit, f: number, m: Mark, w: number, h: number, x: number, y: number, z: number, ry = 0, ink?: string) {
  const s = new Surface(1024, Math.round((1024 * h) / w), 1.0);
  s.mat.transparent = true;
  s.mat.depthWrite = false;
  void document.fonts?.ready.then(() =>
    void (async () => {
      s.g.clearRect(0, 0, s.W, s.H);
      await drawLogo(s.g, m, 0, 0, s.W, s.H, { ink });
      s.tex.needsUpdate = true;
    })(),
  );
  return k.plane(f, w, h, s.mat, x, y, z, 0, ry);
}

/** A hanging banner in the project's colour: its mark, its name, a line under it. */
export function logoBanner(k: SkyKit, f: number, m: Mark, x: number, y: number, z: number, ry = 0, line = "", w = 2.4, h = 5.2) {
  const s = new Surface(512, Math.round((512 * h) / w), 1.0);
  const col = FILES[m].color;
  void (async () => {
    await document.fonts?.ready;
    const g = s.g,
      W = s.W,
      H = s.H;
    g.fillStyle = "#14110d";
    g.fillRect(0, 0, W, H);
    g.fillStyle = col;
    g.fillRect(0, 0, W, 14);
    g.fillRect(0, H - 60, W, 60);
    // the swallowtail cut at the bottom
    g.fillStyle = "#000";
    g.globalCompositeOperation = "destination-out";
    g.beginPath();
    g.moveTo(0, H);
    g.lineTo(W / 2, H - 56);
    g.lineTo(W, H);
    g.fill();
    g.globalCompositeOperation = "source-over";
    await drawLogo(g, m, 60, 90, W - 120, H * 0.5, { stacked: true, ink: "#f4ead6" });
    if (line) {
      g.fillStyle = "rgba(244,234,214,0.75)";
      g.font = `600 30px ${SANS}`;
      g.textAlign = "center";
      g.textBaseline = "top";
      line.split("\n").forEach((l, i) => g.fillText(l, W / 2, H * 0.68 + i * 40));
      g.textAlign = "left";
    }
    s.tex.needsUpdate = true;
  })();
  s.mat.transparent = true;
  const p = k.plane(f, w, h, s.mat, x, y, z, 0, ry);
  // the rod it hangs from
  k.box(f, w + 0.3, 0.06, 0.06, x, y + h / 2 + 0.02, z, "#c8a040", "metal", ry);
  return p;
}
