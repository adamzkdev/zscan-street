import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { MEME_ATLAS, MEMES, MEMES_PAGE } from "../data/memes";
import type { PickInfo } from "../interior/types";

/**
 * Meme posters round the city and in the places: the zkSNARKs community's memes
 * (data/memes.ts, vendored under public/memes), framed on walls, pasted on hoardings, in backlit ad
 * boxes. Every poster starts on the shared atlas (all 48 memes at 128 px in one texture, one
 * material: a hundred posters cost one texture), and the few nearest the camera swap to their own
 * 512 px picture, loaded when first needed and given back when no poster has used it for a while.
 * A click on one shows its title and the link to zksnarks.net/memes (main.ts, interior/manager.ts).
 */

const BASE = import.meta.env?.BASE_URL ?? "/";
const TOUCH = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export const memeCount = MEMES.length;
export const memeUrl = (i: number) => `${BASE}memes/${MEMES[i % MEMES.length][0]}.webp`;
export const memeTitle = (i: number) => MEMES[i % MEMES.length][1];
/** Index of a meme by its slug (-1: none). */
export const memeIndex = (slug: string) => MEMES.findIndex((m) => m[0] === slug);

export type PosterKind = "frame" | "paste" | "lightbox" | "bare";
export interface PosterOpts {
  kind?: PosterKind;
  /** Frame colour (frame, lightbox). */
  frame?: string;
}

// ---- textures and materials -----------------------------------------------------------------------

let atlasTex: THREE.Texture | null = null;
function atlas() {
  if (!atlasTex) {
    atlasTex = new THREE.TextureLoader().load(`${BASE}${MEME_ATLAS.file}`);
    atlasTex.colorSpace = THREE.SRGBColorSpace;
    atlasTex.anisotropy = 4;
  }
  return atlasTex;
}
let lowLit: THREE.MeshStandardMaterial | null = null;
let lowGlow: THREE.MeshBasicMaterial | null = null;
/** Printed paper: lit by the scene, with a little light of its own so it reads in dim rooms and at night. */
const litMat = (map: THREE.Texture) => new THREE.MeshStandardMaterial({ map, roughness: 0.62, metalness: 0, emissive: "#ffffff", emissiveMap: map, emissiveIntensity: 0.22 });
const glowMat = (map: THREE.Texture) => new THREE.MeshBasicMaterial({ map, toneMapped: false, color: new THREE.Color(1.12, 1.12, 1.12) });
function low(glow: boolean) {
  if (glow) return (lowGlow ??= glowMat(atlas()));
  return (lowLit ??= litMat(atlas()));
}

/** One unit plane per meme on its atlas cell; one with the whole texture for the hi version. */
const cellGeo = new Map<number, THREE.PlaneGeometry>();
function cell(i: number) {
  let g = cellGeo.get(i);
  if (!g) {
    g = new THREE.PlaneGeometry(1, 1);
    const c = i % MEME_ATLAS.cols,
      r = Math.floor(i / MEME_ATLAS.cols);
    const u0 = c / MEME_ATLAS.cols,
      u1 = (c + 1) / MEME_ATLAS.cols,
      v1 = 1 - r / MEME_ATLAS.rows,
      v0 = 1 - (r + 1) / MEME_ATLAS.rows;
    // a hair inside the cell, so mipmaps do not bleed the neighbours in
    const e = 0.004;
    const uv = g.attributes.uv as THREE.BufferAttribute;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) ? u1 - e : u0 + e, uv.getY(k) ? v1 - e : v0 + e);
    cellGeo.set(i, g);
  }
  return g;
}
const fullGeo = new THREE.PlaneGeometry(1, 1);

interface Hi {
  tex: THREE.Texture | null;
  lit: THREE.MeshStandardMaterial | null;
  glow: THREE.MeshBasicMaterial | null;
  loading: boolean;
  /** Last time (s) a poster wanted it. */
  used: number;
}
const hi = new Map<number, Hi>();
const loader = new THREE.TextureLoader();
function wantHi(i: number, now: number): Hi {
  let h = hi.get(i);
  if (!h) {
    h = { tex: null, lit: null, glow: null, loading: true, used: now };
    hi.set(i, h);
    const entry = h;
    loader.load(
      memeUrl(i),
      (t) => {
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = 4;
        entry.tex = t;
        entry.loading = false;
        // given back while it loaded
        if (hi.get(i) !== entry) t.dispose();
      },
      undefined,
      () => (entry.loading = false),
    );
  }
  h.used = now;
  return h;
}
function freeHi(i: number) {
  const h = hi.get(i);
  if (!h) return;
  hi.delete(i);
  h.lit?.dispose();
  h.glow?.dispose();
  h.tex?.dispose();
}

// ---- posters ----------------------------------------------------------------------------------------

const frameMats = new Map<string, THREE.Material>();
function frameMat(color: string, glow = false) {
  const key = `${color}|${glow}`;
  let m = frameMats.get(key);
  if (!m) frameMats.set(key, (m = glow ? new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(1.6), toneMapped: false }) : new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.3 })));
  return m;
}
const boxGeo = new THREE.BoxGeometry(1, 1, 1);

/** Every poster's picture (a mesh), for the LOD and for picking. */
const posters: THREE.Mesh[] = [];

/**
 * A meme poster `h` metres tall (its width from the meme's own shape), facing +z, centred on the
 * group's origin, its back at z = 0 (put it right on a wall). `i`: index into MEMES (wraps).
 */
export function memePoster(i: number, h: number, o: PosterOpts = {}) {
  i = ((i % MEMES.length) + MEMES.length) % MEMES.length;
  const kind = o.kind ?? "frame";
  const [, , mw, mh] = MEMES[i];
  const w = (h * mw) / mh;
  const g = new THREE.Group();
  g.name = `meme:${MEMES[i][0]}`;
  const glow = kind === "lightbox";
  const pic = new THREE.Mesh(cell(i), low(glow));
  pic.scale.set(w, h, 1);
  pic.userData.meme = i;
  pic.userData.glow = glow;
  let z = 0.006;
  if (kind === "frame" || kind === "lightbox") {
    const b = glow ? 0.07 : 0.05;
    const d = glow ? 0.14 : 0.04;
    const fr = new THREE.Mesh(boxGeo, frameMat(o.frame ?? (glow ? "#1a1a22" : "#1c1712")));
    fr.scale.set(w + b * 2, h + b * 2, d);
    fr.position.z = d / 2;
    fr.userData.memePart = true;
    g.add(fr);
    if (glow) {
      // a lit rim round the box
      const rim = new THREE.Mesh(boxGeo, frameMat(o.frame ?? "#f4b728", true));
      rim.scale.set(w + b * 2 + 0.02, h + b * 2 + 0.02, 0.02);
      rim.position.z = 0.01;
      rim.userData.memePart = true;
      g.add(rim);
    }
    z = d + 0.004;
  } else if (kind === "paste") {
    // paper pasted on the wall, a little crooked
    g.rotation.z = (((i * 37) % 9) - 4) * 0.008;
  }
  pic.position.z = z;
  g.add(pic);
  posters.push(pic);
  return g;
}

/** Forget the posters under `root` (a place or a city part being thrown away). */
export function dropPosters(root: THREE.Object3D) {
  const gone = new Set<THREE.Object3D>();
  root.traverse((o) => o.userData.meme !== undefined && gone.add(o));
  for (let k = posters.length - 1; k >= 0; k--) if (gone.has(posters[k])) posters.splice(k, 1);
  root.traverse((o) => clickables.delete(o));
}

/**
 * Merge the posters under `root` (built, placed, not moving) into one mesh per material: a hundred
 * posters in a handful of draw calls. Their own pictures stay (hidden) for picking and for the
 * close-up version, which shows in front of the batch when the camera comes near.
 */
export function freezePosters(root: THREE.Object3D) {
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert();
  const bins = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const drop: THREE.Object3D[] = [];
  const m4 = new THREE.Matrix4();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || m.userData.frozen || m.userData.batch) return;
    const pic = m.userData.meme !== undefined;
    if (!pic && !m.userData.memePart) return;
    const mat = pic ? low(!!m.userData.glow) : (m.material as THREE.Material);
    const geo = (pic ? cell(m.userData.meme) : m.geometry).clone().applyMatrix4(m4.multiplyMatrices(inv, m.matrixWorld));
    for (const k of Object.keys(geo.attributes)) if (k !== "position" && k !== "normal" && k !== "uv") geo.deleteAttribute(k);
    if (!bins.has(mat)) bins.set(mat, []);
    bins.get(mat)!.push(geo.index ? geo.toNonIndexed() : geo);
    if (pic) {
      m.userData.frozen = true;
      m.userData.z0 = m.position.z;
      m.visible = false;
    } else drop.push(m);
  });
  for (const o of drop) o.removeFromParent();
  for (const [mat, geos] of bins) {
    const merged = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    if (!merged) continue;
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, mat);
    mesh.userData.batch = true;
    mesh.raycast = () => {};
    mesh.matrixAutoUpdate = false;
    root.add(mesh);
  }
}

// ---- level of detail ----------------------------------------------------------------------------------

/** How many posters may show their own picture at once, and from how far (metres × height). */
const MAX_HI = TOUCH ? 4 : 10;
const HI_RANGE = TOUCH ? 4 : 6.5;
let acc = 0;
let clock = 0;
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

/** The scene `o` is drawn in (null: hidden). A frozen poster's own picture is hidden: its batch shows it. */
function sceneOf(o: THREE.Object3D): THREE.Object3D | null {
  if (!o.parent) return null;
  let x: THREE.Object3D | null = o.userData.frozen ? o.parent : o;
  while (x) {
    if (!x.visible) return null;
    if (!x.parent) return x;
    x = x.parent;
  }
  return null;
}

function setLow(m: THREE.Mesh) {
  const i = m.userData.meme as number;
  // frozen: back into the batch
  if (m.userData.frozen) {
    m.visible = false;
    m.position.z = m.userData.z0;
  }
  if (m.geometry !== cell(i)) m.geometry = cell(i);
  const want = low(!!m.userData.glow);
  if (m.material !== want) m.material = want;
}

/**
 * Every frame: the posters nearest `camera` in `scene` (the city or the place you are in) get
 * their own picture; the rest show the atlas. Cheap: it looks every 0.3 s.
 */
export function updateMemes(dt: number, camera: THREE.Camera, scene: THREE.Object3D) {
  clock += dt;
  acc += dt;
  if (acc < 0.3) return;
  acc = 0;
  camera.getWorldPosition(_p);
  const near: { m: THREE.Mesh; d: number }[] = [];
  for (const m of posters) {
    if (sceneOf(m) !== scene) {
      if (m.userData.hi) (m.userData.hi = false), setLow(m);
      continue;
    }
    m.getWorldPosition(_s);
    const d = _s.distanceTo(_p);
    m.getWorldScale(_s);
    if (d < HI_RANGE * Math.max(1, _s.y)) near.push({ m, d });
    else if (m.userData.hi) (m.userData.hi = false), setLow(m);
  }
  near.sort((a, b) => a.d - b.d);
  near.forEach(({ m }, k) => {
    const i = m.userData.meme as number;
    if (k >= MAX_HI) {
      if (m.userData.hi) (m.userData.hi = false), setLow(m);
      return;
    }
    const h = wantHi(i, clock);
    if (!h.tex) return;
    const glow = !!m.userData.glow;
    const mat = glow ? (h.glow ??= glowMat(h.tex)) : (h.lit ??= litMat(h.tex));
    m.geometry = fullGeo;
    m.material = mat;
    m.userData.hi = true;
    // frozen: shown just in front of its copy in the batch
    if (m.userData.frozen) {
      m.visible = true;
      m.position.z = m.userData.z0 + 0.004;
    }
  });
  // pictures nobody has looked at for 20 s go back (a dozen kept warm)
  if (hi.size > MAX_HI + 2)
    for (const [i, h] of [...hi].sort((a, b) => a[1].used - b[1].used)) {
      if (hi.size <= MAX_HI + 2 || clock - h.used < 20) break;
      if (posters.some((m) => m.userData.meme === i && m.userData.hi)) continue;
      freeHi(i);
    }
}

// ---- picking ---------------------------------------------------------------------------------------

/** Other things clickable the same way (the cinema's posters in the city): hover label, panel. */
const clickables = new Map<THREE.Object3D, { hover: string; info: () => PickInfo }>();
export function clickable(o: THREE.Object3D, hover: string, info: () => PickInfo) {
  clickables.set(o, { hover, info });
}

/** The nearest visible poster (or other clickable) of `scene` the ray hits, within `far`. */
export function posterHit(ray: THREE.Raycaster, scene: THREE.Object3D, far = 60): { hover: string; info: () => PickInfo; distance: number } | null {
  const list: THREE.Object3D[] = posters.filter((m) => sceneOf(m) === scene);
  for (const o of clickables.keys()) if (sceneOf(o) === scene) list.push(o);
  if (!list.length) return null;
  const f = ray.far;
  ray.far = Math.min(f, far);
  const h = ray.intersectObjects(list, false)[0];
  ray.far = f;
  if (!h) return null;
  const c = clickables.get(h.object);
  if (c) return { ...c, distance: h.distance };
  const i = h.object.userData.meme as number;
  return { hover: memeHover(i), info: () => memeInfo(i), distance: h.distance };
}

export const memeHover = (i: number) => `<b>${esc(memeTitle(i))}</b><span>zkSNARKs meme · click</span>`;

/** What the info panel shows for a meme: its title (data only) and the way to all of them. */
export function memeInfo(i: number): PickInfo {
  return {
    eyebrow: "zkSNARKs · meme",
    title: esc(memeTitle(i)),
    image: memeUrl(i),
    body: `<p>From the zkSNARKs community's meme wall: ${MEMES.length} of them, free to share.</p>`,
    link: { href: MEMES_PAGE, label: "All memes on zksnarks.net" },
  };
}

/** For tests (?debug): how many posters, how many showing their own picture, textures held. */
export const memeStats = () => ({ posters: posters.length, hi: posters.filter((m) => m.userData.hi).length, textures: [...hi.values()].filter((h) => h.tex).length });

// ---- on the LED screens ------------------------------------------------------------------------------

const adImgs = new Map<number, HTMLImageElement>();
function adImg(i: number) {
  let img = adImgs.get(i);
  if (!img) {
    img = new Image();
    img.decoding = "async";
    img.src = memeUrl(i);
    adImgs.set(i, img);
    // a few at a time: the oldest go
    if (adImgs.size > 8) adImgs.delete(adImgs.keys().next().value!);
  }
  return img;
}

/**
 * A screen ad (decor.ts's Ad): the memes as a slideshow, a new one every 4.5 s, its title and the
 * address under it. Same-origin pictures, so the screens' canvases stay clean.
 */
export function memeAd(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
  const i = (Math.floor(t / 4.5) * 7 + Math.round(w / 3)) % MEMES.length;
  const img = adImg(i);
  ctx.fillStyle = "#07060a";
  ctx.fillRect(0, 0, w, h);
  const band = h * 0.2;
  if (img.complete && img.naturalWidth) {
    const s = Math.min((w * 0.96) / img.naturalWidth, (h - band) / img.naturalHeight);
    const iw = img.naturalWidth * s,
      ih = img.naturalHeight * s;
    ctx.drawImage(img, (w - iw) / 2, (h - band - ih) / 2, iw, ih);
  }
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#f4b728";
  ctx.font = `800 ${Math.round(band * 0.42)}px "JetBrains Mono", Menlo, monospace`;
  ctx.fillText(MEMES[i][1].toUpperCase(), w / 2, h - band * 0.62, w * 0.94);
  ctx.fillStyle = "#c8c4d0";
  ctx.font = `600 ${Math.round(band * 0.24)}px "JetBrains Mono", Menlo, monospace`;
  ctx.fillText("zksnarks.net/memes", w / 2, h - band * 0.2, w * 0.94);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
}
