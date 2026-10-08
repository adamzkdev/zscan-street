import * as THREE from "three";
import { FILM_SLOTS, FILMS, NETWORK_PAGE, type Film } from "../data/films";
import type { PickInfo } from "../interior/types";
import { fitText } from "./fit";

/**
 * ZK CINEMA's films (data/films.ts): their posters (one texture per film, shared by every copy in
 * the mall and in the street), and what the info panel says about them. Films not made yet fill
 * the remaining slots as "coming soon".
 */

const BASE = import.meta.env?.BASE_URL ?? "/";
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const MONO = '"JetBrains Mono", Menlo, monospace';
const SANS = '"Avenir Next", "Helvetica Neue", Arial, sans-serif';

export { FILMS, FILM_SLOTS, type Film };
export const filmUrl = (p: string) => `${BASE}${p}`;
export const ACCENT = ["#ff4a5a", "#f4b728", "#3ef0ff", "#b07bff", "#3ee08f", "#ff7ab0", "#ffd27a"];

const images = new Map<string, HTMLImageElement>();
/** A same-origin image (a portrait, a still), loaded once; `then` runs when it is ready. */
export function filmImage(path: string, then?: (img: HTMLImageElement) => void) {
  let img = images.get(path);
  if (!img) {
    img = new Image();
    img.decoding = "async";
    img.src = filmUrl(path);
    images.set(path, img);
  }
  if (then) {
    if (img.complete && img.naturalWidth) then(img);
    else img.addEventListener("load", () => then(img!), { once: true });
  }
  return img;
}

const posters = new Map<number, THREE.CanvasTexture>();
/** The poster of slot `i` (a film, or "coming soon" past the last film), 2 : 3. */
export function filmPoster(i: number): THREE.CanvasTexture {
  let t = posters.get(i);
  if (t) return t;
  const c = document.createElement("canvas");
  c.width = 320;
  c.height = 480;
  const g = c.getContext("2d")!;
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  posters.set(i, t);
  const f = FILMS[i];
  const acc = ACCENT[i % ACCENT.length];
  const W = c.width,
    H = c.height;
  const draw = (still?: HTMLImageElement, art?: HTMLImageElement) => {
    g.fillStyle = "#07060a";
    g.fillRect(0, 0, W, H);
    if (!f) {
      // a slot for a film still to come
      g.strokeStyle = "#3a3640";
      g.lineWidth = 4;
      g.setLineDash([14, 10]);
      g.strokeRect(22, 22, W - 44, H - 44);
      g.setLineDash([]);
      g.textAlign = "center";
      g.fillStyle = "#6a6672";
      g.font = `800 120px ${SANS}`;
      g.fillText("?", W / 2, H * 0.46);
      g.fillStyle = "#c8c4d0";
      g.font = `800 34px ${SANS}`;
      fitText(g, "COMING SOON", W / 2, H * 0.64);
      g.fillStyle = "#8a8692";
      g.font = `600 17px ${MONO}`;
      fitText(g, `HOLDER SPOTLIGHT ${String(i + 1).padStart(3, "0")}`, W / 2, H * 0.71);
      g.fillText("zksnarks.net/network", W / 2, H - 40);
      t!.needsUpdate = true;
      return;
    }
    // the film's still across the top, the holder's zkSNARK in front, the name below
    if (still) {
      const sh = H * 0.5;
      const sw = (still.naturalWidth / still.naturalHeight) * sh;
      g.drawImage(still, (W - sw) / 2, 0, sw, sh);
      const grd = g.createLinearGradient(0, sh * 0.45, 0, sh);
      grd.addColorStop(0, "rgba(7,6,10,0)");
      grd.addColorStop(1, "rgba(7,6,10,1)");
      g.fillStyle = grd;
      g.fillRect(0, 0, W, sh + 1);
    }
    const ps = 150;
    if (art) {
      g.fillStyle = acc;
      g.fillRect(W / 2 - ps / 2 - 5, H * 0.33 - 5, ps + 10, ps + 10);
      g.imageSmoothingEnabled = false;
      g.drawImage(art, W / 2 - ps / 2, H * 0.33, ps, ps);
      g.imageSmoothingEnabled = true;
    }
    g.textAlign = "center";
    g.fillStyle = acc;
    g.font = `700 16px ${MONO}`;
    fitText(g, `HOLDER SPOTLIGHT ${String(i + 1).padStart(3, "0")}`, W / 2, H * 0.71);
    g.fillStyle = "#ffffff";
    g.font = `900 46px ${SANS}`;
    fitText(g, f.name.toUpperCase(), W / 2, H * 0.8, W - 30);
    g.fillStyle = "#c8c4d0";
    g.font = `600 17px ${MONO}`;
    fitText(g, `zkSNARK #${f.snark} · ${f.runtime}`, W / 2, H * 0.87);
    g.fillStyle = "#8a8692";
    g.font = `600 14px ${MONO}`;
    g.fillText("ZK CINEMA · zksnarks.net", W / 2, H - 22);
    t!.needsUpdate = true;
  };
  draw();
  if (f) {
    let still: HTMLImageElement | undefined, art: HTMLImageElement | undefined;
    filmImage(f.still, (img) => draw((still = img), art));
    filmImage(f.art, (img) => draw(still, (art = img)));
  }
  return t;
}

/** What the panel says about a film (all of it data, escaped), or about a slot to come. */
export function filmInfo(i: number, where = "ZK CINEMA"): PickInfo {
  const f = FILMS[i];
  if (!f)
    return {
      eyebrow: `${where} · coming soon`,
      title: `Holder spotlight ${String(i + 1).padStart(3, "0")}`,
      body: `<p>The zkSNARKs network has room for ${FILM_SLOTS} spotlights; ${FILMS.length} are showing. The next one plays here when it is out.</p>`,
      link: { href: NETWORK_PAGE, label: "The network on zksnarks.net" },
    };
  return {
    eyebrow: `${where} · holder spotlight`,
    title: esc(f.name),
    image: filmUrl(f.art),
    stats: [
      ["Runtime", esc(f.runtime)],
      ["zkSNARK", `#${f.snark}`],
      ["On X", `<a href="https://x.com/${encodeURIComponent(f.handle)}" target="_blank" rel="noopener">@${esc(f.handle)}</a>`],
    ],
    body: `<p><i>“${esc(f.quote)}”</i></p><p>${esc(f.bio)}</p>`,
    link: { href: NETWORK_PAGE, label: "The network on zksnarks.net" },
  };
}

/** A film poster as a mesh, w metres wide, facing +z (a thin dark frame round it). */
export function filmPosterMesh(i: number, w: number, glow = true) {
  const h = w * 1.5;
  const g = new THREE.Group();
  const frame = new THREE.Mesh(new THREE.BoxGeometry(w + 0.1, h + 0.1, 0.06), new THREE.MeshStandardMaterial({ color: "#16121a", roughness: 0.5, metalness: 0.4 }));
  frame.position.z = 0.03;
  const pic = new THREE.Mesh(new THREE.PlaneGeometry(w, h), glow ? new THREE.MeshBasicMaterial({ map: filmPoster(i), toneMapped: false }) : new THREE.MeshStandardMaterial({ map: filmPoster(i), roughness: 0.6 }));
  pic.position.z = 0.065;
  g.add(frame, pic);
  return { group: g, pic };
}

/** A screen ad (decor.ts's Ad) for the mall's LED walls: now showing, film after film. */
export function filmAd(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
  if (!FILMS.length) return;
  const i = Math.floor(t / 5) % FILMS.length;
  const f = FILMS[i];
  const still = filmImage(f.still),
    art = filmImage(f.art);
  ctx.fillStyle = "#07060a";
  ctx.fillRect(0, 0, w, h);
  if (still.complete && still.naturalWidth) {
    ctx.globalAlpha = 0.85;
    const s = Math.max(w / still.naturalWidth, h / still.naturalHeight);
    ctx.drawImage(still, (w - still.naturalWidth * s) / 2, (h - still.naturalHeight * s) / 2, still.naturalWidth * s, still.naturalHeight * s);
    ctx.globalAlpha = 1;
  }
  const grd = ctx.createLinearGradient(0, h * 0.4, 0, h);
  grd.addColorStop(0, "rgba(7,6,10,0)");
  grd.addColorStop(1, "rgba(7,6,10,0.92)");
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, w, h);
  const ps = h * 0.34;
  if (art.complete && art.naturalWidth) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(art, w * 0.05, h * 0.6, ps, ps);
    ctx.imageSmoothingEnabled = true;
  }
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = ACCENT[i % ACCENT.length];
  ctx.font = `800 ${Math.round(h * 0.09)}px ${MONO}`;
  fitText(ctx, "ZK CINEMA · NOW SHOWING · LEVEL 4", w * 0.05, h * 0.14, w * 0.9);
  ctx.fillStyle = "#ffffff";
  ctx.font = `900 ${Math.round(h * 0.17)}px ${SANS}`;
  fitText(ctx, f.name.toUpperCase(), w * 0.07 + ps, h * 0.8, w * 0.88 - ps);
  ctx.fillStyle = "#c8c4d0";
  ctx.font = `600 ${Math.round(h * 0.07)}px ${MONO}`;
  fitText(ctx, `HOLDER SPOTLIGHT · ${f.runtime}`, w * 0.07 + ps, h * 0.9, w * 0.88 - ps);
}
