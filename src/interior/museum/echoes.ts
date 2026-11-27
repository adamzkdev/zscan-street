import * as THREE from "three";
import { type Echo, echoesFeed, type EchoesState, echoInspiration, echoLink, echoNum, traitOf } from "../../data/echoes";
import { ZScan } from "../../data/zscan";
import { snarkPixels } from "../../scene/drones";
import type { Snark } from "../../scene/snark";
import { TOUCH } from "../../scene/quality";
import { echoTexture, echoWindowMaterial, figureCells, GRID, haze, maskTexture, projected, projectionUniforms, ROOM, silhouetteMaterial } from "./blankfx";
import { FEDOS_SNARK, SAYS } from "./fedosart";
import { Atlas, boxGeo, canvas, FLOOR_Y, type MuseumKit } from "./kit";
import { beamGeo } from "./parts";
import { dot } from "./planetfx";
import { nameSprite, sparkTexture } from "./planetarium";
import { imageTexture } from "./planetshow";

/**
 * Floor 7, ECHOES: zkSNARKs' Experiment_002, live. 26 Echoes imagined by FedosArt: 20 through the
 * public purge (a holder burns 13 zkSNARKs, receives one Echo at random), 6 through the Signals draw.
 * The teaser's warehouse at night (wet concrete, pillars, factory windows on the city, trusses and
 * skylights), its black monolith with a zkSNARK's figure cut out of it, glowing white: the blank
 * canvas. Then, for one Echo after another, the ritual: its 13 purged zkSNARKs rise round the monolith
 * and are drawn into the figure; the painting it was imagined after is thrown across every wall and
 * through the figure; and the figure condenses, pixel by pixel, into the Echo, its star lit. Typed in
 * the teaser's letters: EXPERIMENT_002 // ECHOES_, then each step.
 *
 * Down both sides, the 26: small monoliths numbered 01–26, each with its Echo's pixels, or a "?"
 * while it is hidden. Walk up to one and it wakes; click it and its ritual plays on the monolith (and
 * its panel opens). An Echo revealed while you are here plays at once (LIVE). Over the hall an LED
 * board counts them; either side of the monolith, the purge's and the draw's steles. FedosArt
 * (#9593) stands before the monolith, visitors photograph it. Sound: ../../audio/blank.ts.
 */
const sound = (name: string) => window.dispatchEvent(new CustomEvent("zstreet:sound", { detail: { name } }));

const F = 7;
/** The corridor from the lift: half width, height. */
const VX = 3.2,
  VH = 4.2;
const { XW, Z0, ZB, PX } = ROOM;
/** The hall's height; the pillars' z (bays between them). */
const HH = 11;
const PILLARS = [Z0, -15.6, -23.2, -30.8, -38.4, ZB];
/** The monolith: a zkSNARK's canvas, U metres a pixel, on a low plinth at z MZ. */
const U = 0.27,
  SLAB = GRID * U,
  MZ = -32,
  DEPTH = 0.5,
  PLINTH = 0.25;
/** The small monoliths: side, plinth height, the rows' x, how many. */
const S = 1.3,
  PH = 0.42,
  ROW_X = 11.4,
  N = 26;
const FONT = '"Helvetica Neue", Inter, Roboto, Arial, sans-serif';
const LED = '"DotGothic16", "JetBrains Mono", monospace';
/** Holds: the blank canvas, the painting before it condenses, an Echo, one asked for; Echoes between two blanks. */
const BLANK_HOLD = 6.5,
  LOOK = 2.6,
  ECHO_HOLD = 9,
  CHOSEN_HOLD = 20,
  RUN = 3;
/** The steps: the 13 drawn in, the painting thrown on, the condensing. */
const PURGE = 3.6,
  CHANGE = 2.6,
  CONDENSE = 2.4;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const utc = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })}, ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" })} UTC`;
};

/**
 * A line typed in, letter by letter, a caret after it (the teaser's titles). Centred on the whole
 * line, so it grows in place; white on black, or on nothing (additive, for light on a surface).
 */
class Typewriter {
  readonly tex: THREE.CanvasTexture;
  private g: CanvasRenderingContext2D;
  private target = "";
  private n = 0;
  private acc = 0;
  private idle = 0;
  private shown = -1;
  constructor(
    readonly W: number,
    readonly H: number,
    readonly px: number,
    readonly bg: string | null,
    readonly onKey?: () => unknown,
  ) {
    const [c, g] = canvas(W, H);
    this.g = g;
    this.tex = new THREE.CanvasTexture(c);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 8;
    this.draw(false);
  }
  type(s: string) {
    this.target = s;
    this.n = 0;
    this.acc = 0;
    this.idle = 0;
    this.shown = -1;
  }
  update(dt: number, t: number) {
    if (this.n < this.target.length) {
      this.acc += dt * 17;
      while (this.acc >= 1 && this.n < this.target.length) {
        this.acc -= 1;
        this.n++;
        if (this.target[this.n - 1] !== " ") this.onKey?.();
      }
      this.idle = 0;
    } else this.idle += dt;
    const caret = this.n < this.target.length || (this.idle < 3.5 && Math.floor(t * 2.2) % 2 === 0);
    const key = this.n * 2 + (caret ? 1 : 0);
    if (key !== this.shown) {
      this.shown = key;
      this.draw(caret);
    }
  }
  private draw(caret: boolean) {
    const { g, W, H } = this;
    g.clearRect(0, 0, W, H);
    if (this.bg) {
      g.fillStyle = this.bg;
      g.fillRect(0, 0, W, H);
    }
    let px = this.px;
    const font = () => {
      g.font = `700 ${px}px ${FONT}`;
      g.letterSpacing = `${Math.round(px * 0.06)}px`;
    };
    font();
    const full = g.measureText(`${this.target} |`).width;
    if (full > W * 0.94) {
      px = Math.floor((px * W * 0.94) / full);
      font();
    }
    const text = this.target.slice(0, this.n);
    const x0 = (W - g.measureText(this.target).width) / 2;
    g.fillStyle = "#ffffff";
    g.textBaseline = "middle";
    g.fillText(text, x0, H / 2);
    if (caret) g.fillRect(x0 + g.measureText(text).width + px * 0.22, H / 2 - px * 0.42, Math.max(2, px * 0.07), px * 0.84);
    this.tex.needsUpdate = true;
  }
}

/** An Echo's pixels, loaded once: the monolith's texture, its star (brightest white cluster), the pixels. */
interface Look {
  tex: THREE.DataTexture;
  star: [number, number] | null;
  px: string[];
}
const looks = new Map<number, Promise<Look | null>>();
function lookOf(e: Echo) {
  let p = looks.get(e.echo);
  if (!p) {
    p = snarkPixels(e.item).then((px) => {
      if (!px) {
        looks.delete(e.echo);
        return null;
      }
      return { tex: echoTexture(px), star: starOf(px), px };
    });
    looks.set(e.echo, p);
  }
  return p;
}
/** The star: the near-white pixel with the most near-white neighbours (cell, from the bottom left). */
function starOf(px: string[]): [number, number] | null {
  const white = px.map((v) => {
    const m = /rgb\((\d+),(\d+),(\d+)\)/.exec(v);
    return !!m && +m[1] > 215 && +m[2] > 215 && +m[3] > 215;
  });
  let best = -1,
    at: [number, number] | null = null;
  for (let i = 0; i < px.length; i++) {
    if (!white[i]) continue;
    const x = i % GRID,
      y = Math.floor(i / GRID);
    let n = 0;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (white[(y + dy) * GRID + x + dx] && x + dx >= 0 && x + dx < GRID) n++;
    if (n > best) {
      best = n;
      at = [x, GRID - 1 - y];
    }
  }
  return at;
}

/** A painting the Echo was imagined after, as a texture. */
const inspiration = (e: Echo) => imageTexture(`echo-${e.echo}`, echoInspiration(e.echo));

/** The Echo's panel: its pixels, its painting, its 13. */
export function echoInfo(e: Echo, where = "Experiment_002") {
  const skin = traitOf(e.traits, "Skin"),
    eyes = traitOf(e.traits, "Eyes");
  return {
    eyebrow: `${where} // Echo ${echoNum(e.echo)}`,
    title: e.name,
    image: ZScan.zkSnarkImage(e.item),
    tag: ["Echo", "info"] as [string, "info"],
    stats: [
      ["Skin", skin || "—"],
      ["Eyes", eyes || "—"],
      ["Purged", String(e.purged.length)],
    ] as [string, string][],
    body:
      `<p>After <b>${esc(e.inspiration || "a painting")}</b> by FedosArt · revealed ${esc(utc(e.unlockedAt))}</p>` +
      `<p><img src="${echoInspiration(e.echo)}" alt="" style="width:100%;height:auto;display:block;border-radius:4px"></p>` +
      `<p>Purged for it: ${e.purged.map((p) => `#${p.item}`).join(" ")}</p>` +
      `<p>zkSNARKs #${e.item}</p>`,
    link: { href: echoLink(e.echo), label: "Zilk Road" },
  };
}

function hiddenInfo(n: number, s: EchoesState | null) {
  const revealed = s?.echoes.length ?? 0;
  const drawn = s ? Math.max(0, revealed - s.claimed) : 0;
  return {
    eyebrow: `Experiment_002 // Echo ${echoNum(n)}`,
    title: "Hidden Echo",
    tag: ["Hidden", "muted"] as [string, "muted"],
    stats: [
      ["Revealed", `${revealed} / ${s?.total ?? N}`],
      ["Purge", `${s?.claimed ?? 0} / ${s?.public ?? 20}`],
      ["Signals draw", `${drawn} / ${s?.draw ?? 6}`],
    ] as [string, string][],
    link: { href: "https://zilkroad.com/echoes", label: "Zilk Road" },
  };
}

/** A "?" in pixels (5 × 7, drawn on the 26 grid), for a hidden Echo's screen. */
const QMARK = [".###.", "#...#", "....#", "...#.", "..#..", ".....", "..#.."];

export function echoesFloor(k: MuseumKit) {
  const f = F;
  const g = k.groups[f];
  const P = projectionUniforms(FLOOR_Y[f]);
  const mask = maskTexture();

  // ---- materials ---------------------------------------------------------------------------------
  const concrete = projected(new THREE.MeshStandardMaterial({ color: "#6a6762", roughness: 0.88, envMapIntensity: 0.2 }), P);
  const pillarMat = projected(new THREE.MeshStandardMaterial({ color: "#77736c", roughness: 0.8, envMapIntensity: 0.2 }), P);
  const floorMat = new THREE.MeshStandardMaterial({ map: concreteFloor(), color: "#5a5a5c", roughness: 0.2, metalness: 0.05, envMapIntensity: 0.5 });
  floorMat.userData.polished = true;
  projected(floorMat, P, "floor");
  const ceiling = new THREE.MeshStandardMaterial({ color: "#141518", roughness: 0.92 });
  const steel = new THREE.MeshStandardMaterial({ color: "#2b2d31", roughness: 0.5, metalness: 0.7 });
  const slabMat = new THREE.MeshStandardMaterial({ color: "#050506", roughness: 0.55, metalness: 0.1, envMapIntensity: 0.08 });
  const matte = new THREE.MeshStandardMaterial({ color: "#0d0d0f", roughness: 0.9 });

  // ---- the corridor from the lift: black, a line of white light down each side -------------------
  tile(k.plane(f, floorMat, 2 * VX, -Z0, 0, 0, Z0 / 2), 2 * VX, -Z0);
  k.plane(f, matte, 2 * VX, -Z0, 0, VH, Z0 / 2, Math.PI / 2);
  k.wall(f, matte, -VX, 0, VX, 0, VH, 0.4);
  k.wall(f, matte, -VX, 0, -VX, Z0, VH, 0.4);
  k.wall(f, matte, VX, 0, VX, Z0, VH, 0.4);
  const line = k.lit("#e8ecff", 1.1);
  for (const s of [-1, 1]) k.geo(f, line, boxGeo(0.025, 0.025, -Z0 - 0.4, s * (VX - 0.22), 0.04, Z0 / 2));
  // the title over the way in, typed as you come
  const TITLE = "EXPERIMENT_002 // ECHOES_";
  const sign = new Typewriter(2048, 176, 84, "#000000", () => Math.hypot(k.cam.x, k.cam.z - Z0) < 9 && sound("canvas-type"));
  const signMesh = new THREE.Mesh(new THREE.PlaneGeometry(5.8, (5.8 * 176) / 2048), new THREE.MeshBasicMaterial({ map: sign.tex, toneMapped: false, color: new THREE.Color(1.25, 1.25, 1.25) }));
  signMesh.position.set(0, 3.55, Z0 + 0.45);
  g.add(signMesh);
  for (const s of [-1, 1]) k.geo(f, steel, new THREE.CylinderGeometry(0.01, 0.01, VH - 3.8, 6).translate(s * 2.6, 3.8 + (VH - 3.8) / 2, Z0 + 0.43));

  // ---- the warehouse --------------------------------------------------------------------------------
  const DZ = Z0 - ZB;
  tile(k.plane(f, floorMat, 2 * XW, DZ, 0, 0, (Z0 + ZB) / 2), 2 * XW, DZ);
  k.plane(f, ceiling, 2 * XW, DZ, 0, HH, (Z0 + ZB) / 2, Math.PI / 2);
  // back wall; front wall either side of the corridor and over it
  k.wall(f, concrete, -XW, ZB, XW, ZB, HH, 0.5);
  k.wall(f, concrete, -XW, Z0, -VX - 0.2, Z0, HH, 0.5);
  k.wall(f, concrete, VX + 0.2, Z0, XW, Z0, HH, 0.5);
  k.geo(f, concrete, boxGeo(2 * VX + 0.4, HH - VH, 0.5, 0, VH, Z0));
  // side walls: solid to 6.2 m, a band of factory windows to 9.6 m (the city outside), solid above
  const WIN0 = 6.2,
    WIN1 = 9.6;
  const glass = new THREE.MeshStandardMaterial({ color: "#9fb2c8", roughness: 0.08, metalness: 0.3, transparent: true, opacity: 0.18, depthWrite: false });
  for (const s of [-1, 1]) {
    const x = s * XW;
    k.wall(f, concrete, x, ZB, x, Z0, WIN0, 0.5);
    k.geo(f, concrete, boxGeo(0.5, HH - WIN1, DZ + 0.5, x, WIN1, (Z0 + ZB) / 2));
    for (let b = 0; b < PILLARS.length - 1; b++) {
      const za = PILLARS[b] - 0.45,
        zb = PILLARS[b + 1] + 0.45;
      const len = za - zb,
        zc = (za + zb) / 2;
      const pane = new THREE.Mesh(new THREE.PlaneGeometry(len, WIN1 - WIN0), glass);
      pane.rotation.y = Math.PI / 2;
      pane.position.set(x, (WIN0 + WIN1) / 2, zc);
      pane.raycast = () => {};
      g.add(pane);
      // the steel grid: a sill, a head, mullions, two transoms
      k.geo(f, steel, boxGeo(0.16, 0.12, len, x, WIN0, zc));
      k.geo(f, steel, boxGeo(0.16, 0.12, len, x, WIN1 - 0.12, zc));
      const cols = Math.round(len / 1.1);
      for (let c = 0; c <= cols; c++) k.geo(f, steel, boxGeo(0.1, WIN1 - WIN0, 0.06, x, WIN0, zb + (len * c) / cols));
      for (const y of [WIN0 + (WIN1 - WIN0) / 3, WIN0 + (2 * (WIN1 - WIN0)) / 3]) k.geo(f, steel, boxGeo(0.1, 0.05, len, x, y, zc));
    }
  }
  // the pillars, against the side walls
  for (const z of PILLARS)
    for (const s of [-1, 1]) {
      const x = s * (XW - 0.65);
      const zc = Math.min(Z0 - 0.45, Math.max(ZB + 0.45, z));
      k.geo(f, pillarMat, boxGeo(0.9, HH, 0.9, x, 0, zc));
      k.solid(f, x - 0.45, zc - 0.45, x + 0.45, zc + 0.45);
    }
  // the trusses over every pair of pillars, and the skylights between them
  const sky = k.lit("#46587e", 0.5);
  for (const z of PILLARS.slice(1, -1)) {
    const y0 = 9.5,
      y1 = 10.8;
    k.geo(f, steel, boxGeo(2 * XW, 0.22, 0.3, 0, y0, z));
    k.geo(f, steel, boxGeo(2 * XW, 0.22, 0.3, 0, y1, z));
    const n = 12;
    for (let i = 0; i <= n; i++) {
      const x = -XW + (2 * XW * i) / n;
      k.geo(f, steel, boxGeo(0.12, y1 - y0, 0.12, x, y0 + 0.2, z));
      if (i < n) {
        const xb = -XW + (2 * XW * (i + 1)) / n;
        const up = i % 2 === 0;
        k.geo(f, steel, beamGeo(new THREE.Vector3(x, up ? y0 + 0.2 : y1, z), new THREE.Vector3(xb, up ? y1 : y0 + 0.2, z), 0.08, 0.08));
      }
    }
  }
  for (let b = 0; b < PILLARS.length - 1; b++) {
    const za = PILLARS[b] - 0.5,
      zb = PILLARS[b + 1] + 0.5;
    k.plane(f, sky, 4.8, za - zb, 0, HH - 0.03, (za + zb) / 2, Math.PI / 2);
    for (const x of [-2.4, -1.2, 0, 1.2, 2.4]) k.geo(f, steel, boxGeo(0.07, 0.07, za - zb, x, HH - 0.12, (za + zb) / 2));
  }

  // ---- the monolith -------------------------------------------------------------------------------
  k.box(f, slabMat, SLAB + 1.1, PLINTH, 1.7, 0, 0, MZ, { solid: true });
  k.box(f, slabMat, SLAB, SLAB, DEPTH, 0, PLINTH, MZ, { solid: true });
  const FRONT = MZ + DEPTH / 2 + 0.004;
  const faces: THREE.Mesh[] = [];
  for (const back of [false, true]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(SLAB, SLAB), silhouetteMaterial(P, mask, U, back));
    m.position.set(0, PLINTH + SLAB / 2, back ? MZ - DEPTH / 2 - 0.004 : FRONT);
    if (back) m.rotation.y = Math.PI;
    g.add(m);
    faces.push(m);
  }
  /** A cell of the monolith's front face, in the floor's frame. */
  const cellAt = (cx: number, cy: number, out = new THREE.Vector3()) => out.set(((cx + 0.5) / GRID) * SLAB - SLAB / 2, PLINTH + ((cy + 0.5) / GRID) * SLAB, FRONT + 0.02);
  // the lamp over it, its spark
  k.geo(f, steel, new THREE.CylinderGeometry(0.012, 0.012, HH - 8.9, 5).translate(0, 8.9 + (HH - 8.9) / 2, MZ + 2.2));
  k.geo(f, steel, new THREE.CylinderGeometry(0.12, 0.42, 0.34, 20, 1, true).translate(0, 8.72, MZ + 2.2));
  k.geo(f, k.lit("#fff4e2", 2.2), new THREE.SphereGeometry(0.1, 12, 8).translate(0, 8.6, MZ + 2.2));
  const sparkTex = sparkTexture();
  const spark = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: sparkTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, color: new THREE.Color(1.8, 1.75, 1.9) }));
  spark.position.set(0, 8.55, MZ + 2.22);
  spark.raycast = () => {};
  g.add(spark);
  k.pool(f, PX, MZ + 3.2, 3.4, "#ffffff", 0.012, 0.5);
  // the Echo's star, lit when it has condensed
  const starMat = new THREE.MeshBasicMaterial({ map: sparkTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, color: new THREE.Color(1.4, 1.38, 1.45), opacity: 0 });
  const star = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), starMat);
  star.raycast = () => {};
  star.visible = false;
  g.add(star);

  // ---- what is typed: in the black over the figure, as on the teaser's black screen -----------------
  const TOP = PLINTH + 21 * U;
  const typed = new Typewriter(2048, 160, 64, null, () => k.cam.z < Z0 - 2 && sound("canvas-type"));
  const typedLine = new THREE.Mesh(
    new THREE.PlaneGeometry(SLAB - 0.5, ((SLAB - 0.5) * 160) / 2048),
    new THREE.MeshBasicMaterial({ map: typed.tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, color: new THREE.Color(1.15, 1.15, 1.2) }),
  );
  typedLine.position.set(0, (TOP + PLINTH + SLAB) / 2 + 0.12, FRONT + 0.004);
  typedLine.raycast = () => {};
  g.add(typedLine);

  // ---- the 13, drawn in: portraits rising round the monolith, then into the figure ------------------
  const CELLS = figureCells();
  const ring = new Atlas(13, 1, 104, 104, true);
  const ringMeshes = Array.from({ length: 13 }, (_, i) => {
    const o = ring.off(i);
    const geo = new THREE.PlaneGeometry(1, 1);
    const uv = geo.getAttribute("uv");
    for (let v = 0; v < uv.count; v++) uv.setXY(v, o[0] + uv.getX(v) * o[2], o[1] + uv.getY(v) * o[3]);
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: ring.tex, transparent: true, depthWrite: false, toneMapped: false, color: new THREE.Color(1.15, 1.15, 1.15) }));
    m.visible = false;
    m.raycast = () => {};
    g.add(m);
    return { m, mat: m.material as THREE.MeshBasicMaterial, target: new THREE.Vector3(), angle: 0, arrived: false };
  });
  const loadRing = async (e: Echo) => {
    ring.g.clearRect(0, 0, ring.canvas.width, ring.canvas.height);
    ring.tex.needsUpdate = true;
    await Promise.all(
      e.purged.slice(0, 13).map(async (p, i) => {
        const im = await k.image(ZScan.zkSnarkImage(p.item)).catch(() => null);
        if (!im) return;
        ring.cell(i, (c, w, h) => {
          c.imageSmoothingEnabled = false;
          c.drawImage(im, 0, 0, w, h);
        });
      }),
    );
  };
  const RING_R = 4.3;
  const ringStart = () => {
    const pick = [...CELLS].sort(() => Math.random() - 0.5);
    ringMeshes.forEach((r, i) => {
      r.angle = Math.PI * (0.08 + (0.84 * i) / 12);
      cellAt(pick[i % pick.length][0], pick[i % pick.length][1], r.target);
      r.arrived = false;
      r.m.visible = true;
      r.mat.opacity = 0;
    });
  };
  const ease = (x: number) => x * x * (3 - 2 * x);
  const tmp = new THREE.Vector3();
  /** The ring at time t of the purge step (0 … PURGE). */
  const ringAt = (t: number) => {
    ringMeshes.forEach((r, i) => {
      if (r.arrived) return;
      // each rises out of the floor on its spot in an arc before the monolith …
      const rise = ease(Math.min(1, t / 0.9));
      const ox = PX + Math.cos(r.angle) * RING_R,
        oz = FRONT + Math.sin(r.angle) * RING_R * 0.9;
      const oy = 0.4 + rise * (1.7 + 0.5 * Math.sin(i * 1.7));
      // … then is drawn into the figure, one after another, turning as it goes, shrinking to a pixel
      const t0 = 1.05 + i * 0.13;
      const kk = Math.min(1, Math.max(0, (t - t0) / 0.85));
      const e2 = kk * kk;
      tmp.set(ox, oy, oz).lerp(r.target, e2);
      tmp.y += Math.sin(kk * Math.PI) * 0.6;
      r.m.position.copy(tmp);
      r.m.quaternion.copy(k.camQuat);
      r.m.rotateZ(kk * Math.PI * 1.5 * (i % 2 ? 1 : -1));
      r.m.scale.setScalar(1.0 * (1 - e2) + U * e2);
      r.mat.opacity = Math.min(1, t / 0.5);
      if (kk >= 1) {
        r.arrived = true;
        r.m.visible = false;
        P.uPulse.value = 1;
        if (k.current === f) sound("echo-in");
      }
    });
  };
  const ringOff = () => ringMeshes.forEach((r) => (r.m.visible = false));

  // ---- the 26, down both sides ------------------------------------------------------------------------
  const minis = Array.from({ length: N }, (_, i) => {
    const left = i % 2 === 0;
    const r = Math.floor(i / 2);
    const x = left ? -ROW_X : ROW_X,
      z = left ? -11.6 - r * 2.55 : -12.4 - r * 2.55;
    return { i, n: i + 1, x, z, yaw: left ? Math.PI / 2 : -Math.PI / 2 };
  });
  for (const m of minis) {
    k.box(f, slabMat, 0.55, PH, S + 0.2, m.x, 0, m.z, { solid: true });
    k.box(f, slabMat, 0.1, S, S, m.x, PH, m.z);
  }
  const CW = TOUCH ? 104 : 156;
  const atlas = new Atlas(7, Math.ceil(N / 7), CW, CW, true);
  atlas.g.fillStyle = "#000000";
  atlas.g.fillRect(0, 0, atlas.canvas.width, atlas.canvas.height);
  const win = echoWindowMaterial(atlas.tex, N);
  const plates = new Atlas(4, Math.ceil(N / 4), 512, 96);
  const winGeo = new THREE.BufferGeometry(),
    plateGeo = new THREE.BufferGeometry();
  {
    const pos: number[] = [],
      uv: number[] = [],
      idx: number[] = [],
      off: number[] = [],
      ind: number[] = [];
    const ppos: number[] = [],
      puv: number[] = [],
      pind: number[] = [];
    const quad = (P2: number[], I2: number[], cx: number, cy: number, cz: number, yaw: number, w: number, h: number, onVertex: (u: number, v: number) => void) => {
      const rx = Math.cos(yaw),
        rz = -Math.sin(yaw);
      const b = P2.length / 3;
      for (const [u, v] of [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
      ]) {
        const lx = (u - 0.5) * w,
          ly = (v - 0.5) * h;
        P2.push(cx + rx * lx, cy + ly, cz + rz * lx);
        onVertex(u, v);
      }
      I2.push(b, b + 1, b + 2, b, b + 2, b + 3);
    };
    for (const m of minis) {
      const nx = Math.sin(m.yaw),
        nz = Math.cos(m.yaw);
      const o = atlas.off(m.i);
      quad(pos, ind, m.x + nx * 0.054, PH + S / 2, m.z + nz * 0.054, m.yaw, S, S, (u, v) => {
        uv.push(u, v);
        idx.push(m.i);
        off.push(...o);
      });
      const po = plates.off(m.i);
      quad(ppos, pind, m.x + nx * 0.279, PH * 0.5, m.z + nz * 0.279, m.yaw, S, (S * 96) / 512, (u, v) => puv.push(po[0] + u * po[2], po[1] + v * po[3]));
    }
    winGeo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    winGeo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    winGeo.setAttribute("aIdx", new THREE.Float32BufferAttribute(idx, 1));
    winGeo.setAttribute("aOff", new THREE.Float32BufferAttribute(off, 4));
    winGeo.setIndex(ind);
    plateGeo.setAttribute("position", new THREE.Float32BufferAttribute(ppos, 3));
    plateGeo.setAttribute("uv", new THREE.Float32BufferAttribute(puv, 2));
    plateGeo.setIndex(pind);
  }
  const windows = new THREE.Mesh(winGeo, win);
  windows.frustumCulled = false;
  g.add(windows);
  const plateMesh = new THREE.Mesh(plateGeo, new THREE.MeshBasicMaterial({ map: plates.tex, toneMapped: false, color: new THREE.Color(1.15, 1.15, 1.15) }));
  plateMesh.raycast = () => {};
  g.add(plateMesh);

  const plate = (i: number, e: Echo | null) =>
    plates.cell(i, (c, w, h) => {
      c.fillStyle = "#000000";
      c.fillRect(0, 0, w, h);
      c.fillStyle = "#ffffff";
      c.textBaseline = "middle";
      c.font = `700 40px ${FONT}`;
      c.letterSpacing = "3px";
      c.fillText(echoNum(i + 1), 18, h / 2 + 2);
      c.font = `500 25px ${FONT}`;
      c.letterSpacing = "2px";
      let t = e ? `ECHO · ${(e.inspiration || "").toUpperCase()}` : "HIDDEN ECHO";
      while (c.measureText(t).width > w - 104 && t.length > 4) t = `${t.slice(0, -2).trimEnd()}…`;
      c.fillStyle = e ? "#c9c9cf" : "#6c6c74";
      c.fillText(t, 88, h / 2 + 2);
    });
  const screen = (i: number, px: string[] | null) =>
    atlas.cell(i, (c, w, h) => {
      c.fillStyle = "#000000";
      c.fillRect(0, 0, w, h);
      const u = w / GRID;
      if (px)
        px.forEach((v, j) => {
          if (!v) return;
          c.fillStyle = v;
          c.fillRect((j % GRID) * u, Math.floor(j / GRID) * u, Math.ceil(u), Math.ceil(u));
        });
      else {
        // hidden: a "?" in the middle, in white pixels, two pixels a dot
        c.fillStyle = "#e8e8ee";
        QMARK.forEach((row, y) => {
          for (let x = 0; x < row.length; x++) if (row[x] === "#") c.fillRect((8 + x * 2) * u, (6 + y * 2) * u, 2 * u, 2 * u);
        });
      }
    });
  for (const m of minis) {
    plate(m.i, null);
    screen(m.i, null);
  }

  // ---- the LED board over the hall, the purge's and the draw's steles ----------------------------------
  const board = canvas(2048, 400);
  const boardTex = new THREE.CanvasTexture(board[0]);
  boardTex.colorSpace = THREE.SRGBColorSpace;
  boardTex.anisotropy = 8;
  const BW = 9.2,
    BH = (BW * 400) / 2048,
    BZ = -15.6 + 0.3,
    BY = 8.2;
  k.box(f, matte, BW + 0.3, BH + 0.3, 0.2, 0, BY - BH / 2 - 0.15, BZ - 0.12);
  const boardMesh = new THREE.Mesh(new THREE.PlaneGeometry(BW, BH), new THREE.MeshBasicMaterial({ map: boardTex, toneMapped: false, color: new THREE.Color(1.3, 1.3, 1.3) }));
  boardMesh.position.set(0, BY, BZ);
  boardMesh.raycast = () => {};
  g.add(boardMesh);
  for (const s of [-1, 1]) k.geo(f, steel, new THREE.CylinderGeometry(0.012, 0.012, 9.5 - (BY + BH / 2), 5).translate((s * BW) / 2.4, BY + BH / 2 + (9.5 - BY - BH / 2) / 2, BZ - 0.12));

  const STW = 2.3,
    STH = 3.0,
    STX = 6.6,
    STZ = MZ + 0.4;
  const steles = [-1, 1].map((s) => {
    k.box(f, slabMat, STW + 0.2, STH + 0.35, 0.3, s * STX, 0, STZ, { solid: true });
    const [c, cg] = canvas(768, 1000);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(STW, STH), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, color: new THREE.Color(1.15, 1.15, 1.15) }));
    m.position.set(s * STX, 0.3 + STH / 2, STZ + 0.155);
    g.add(m);
    return { m, c: cg, tex };
  });
  /** The draw's 6 thumbnails, the purge's last 6 (images by Echo number). */
  const thumbs = new Map<number, HTMLImageElement>();

  const drawBoard = (s: EchoesState | null, flash: string | null) => {
    const c = board[1];
    const W = 2048,
      H = 400;
    c.fillStyle = "#030304";
    c.fillRect(0, 0, W, H);
    c.textBaseline = "middle";
    c.textAlign = "left";
    const revealed = s?.echoes.length ?? 0;
    const drawn = s ? Math.max(0, revealed - s.claimed) : 0;
    if (flash) {
      c.fillStyle = "#ffffff";
      c.font = `400 150px ${LED}`;
      c.textAlign = "center";
      c.fillText(flash, W / 2, H / 2);
    } else {
      c.fillStyle = "#ffffff";
      c.font = `400 132px ${LED}`;
      c.fillText("ECHOES", 60, 118);
      c.textAlign = "right";
      c.fillText(`${revealed} / ${s?.total ?? N}`, W - 60, 118);
      c.textAlign = "left";
      c.font = `400 58px ${LED}`;
      c.fillStyle = "#cfd2da";
      c.fillText(`PUBLIC PURGE ${s?.claimed ?? 0} / ${s?.public ?? 20}`, 60, 250);
      c.textAlign = "right";
      c.fillText(`SIGNALS DRAW ${drawn} / ${s?.draw ?? 6}`, W - 60, 250);
      c.textAlign = "left";
      c.fillStyle = "#8d909a";
      const last = s?.echoes[s.echoes.length - 1];
      const purgedHere = s ? s.echoes.reduce((a, e) => a + e.purged.length, 0) : 0;
      c.fillText(`${purgedHere} PURGED`, 60, 340);
      c.textAlign = "right";
      c.fillText(s && !s.hidden.length ? "ALL 26 REVEALED" : last ? `LAST · ECHO #${last.echo} · ${utc(last.unlockedAt).toUpperCase()}` : "", W - 60, 340);
    }
    // the LED grid: a dark line between the dots
    c.fillStyle = "rgba(3,3,4,0.6)";
    for (let x = 0; x < W; x += 8) c.fillRect(x, 0, 2, H);
    for (let y = 0; y < H; y += 8) c.fillRect(0, y, W, 2);
    boardTex.needsUpdate = true;
  };

  const drawSteles = (s: EchoesState | null) => {
    const revealed = s?.echoes.length ?? 0;
    const drawn = s ? Math.max(0, revealed - s.claimed) : 0;
    steles.forEach((st, side) => {
      const c = st.c;
      const W = 768,
        H = 1000;
      c.fillStyle = "#050506";
      c.fillRect(0, 0, W, H);
      c.textBaseline = "alphabetic";
      c.textAlign = "left";
      c.fillStyle = "#ffffff";
      c.font = `700 54px ${FONT}`;
      c.letterSpacing = "4px";
      c.fillText(side === 0 ? "PUBLIC PURGE" : "SIGNALS DRAW", 48, 104);
      c.font = `500 30px ${FONT}`;
      c.letterSpacing = "2px";
      c.fillStyle = "#a9abb3";
      c.fillText(side === 0 ? `${s?.public ?? 20} ECHOES` : `${s?.draw ?? 6} ECHOES`, 48, 152);
      c.fillStyle = "#ffffff";
      c.font = `700 40px ${FONT}`;
      const lines =
        side === 0
          ? [`PURGE ${s?.perPurge ?? 13} zkSNARKs`, "RECEIVE 1 ECHO", "AT RANDOM"]
          : [`${(s?.rule.mark ?? "Mark II").toUpperCase()} · ${s?.rule.days ?? 26}+ DAYS HELD`, `CHROMA ${(s?.rule.chroma ?? "Gold").toUpperCase()} · ${s?.rule.traits ?? 50}+ TRAITS`, s?.rule.closeAt ? `ENTRIES CLOSED ${utc(s.rule.closeAt).toUpperCase()}` : "ENTRIES CLOSED"];
      c.font = `600 ${side === 0 ? 44 : 30}px ${FONT}`;
      lines.forEach((l, i) => c.fillText(l, 48, 250 + i * (side === 0 ? 62 : 52)));
      // the count, big
      c.font = `400 150px ${LED}`;
      c.fillStyle = "#ffffff";
      c.fillText(side === 0 ? `${s?.claimed ?? 0}/${s?.public ?? 20}` : `${drawn}/${s?.draw ?? 6}`, 44, 560);
      // six squares: the purge's last six, or the draw's six (a "?" while hidden)
      const list = side === 0 ? (s?.echoes ?? []).slice(0, s?.claimed ?? 0).slice(-6) : (s?.echoes ?? []).slice(s?.claimed ?? 0).slice(0, 6);
      for (let j = 0; j < 6; j++) {
        const x = 48 + (j % 3) * 228,
          y = 620 + Math.floor(j / 3) * 186;
        c.fillStyle = "#121216";
        c.fillRect(x, y, 200, 170);
        const e = list[j];
        const im = e && thumbs.get(e.echo);
        if (im) {
          c.imageSmoothingEnabled = false;
          c.drawImage(im, x + 15, y, 170, 170);
        } else if (side === 1 || !e) {
          c.fillStyle = "#3a3a42";
          c.font = `700 90px ${FONT}`;
          c.textAlign = "center";
          c.fillText("?", x + 100, y + 118);
          c.textAlign = "left";
        }
      }
      st.tex.needsUpdate = true;
    });
  };
  drawBoard(null, null);
  drawSteles(null);

  // ---- the show ------------------------------------------------------------------------------------------
  /** What the monolith shows (A side), the step under way, the Echo asked for next. */
  let cur: Echo | null = null;
  let condensed = false;
  type Step = { kind: "purge" | "change" | "condense" | "hold"; t: number; dur: number; e: Echo | null; chosen: boolean; live: boolean };
  let step: Step = { kind: "hold", t: 0, dur: BLANK_HOLD, e: null, chosen: false, live: false };
  let wanted: { e: Echo; live: boolean } | null = null;
  let busy = false;
  let hurry = false;
  let run = 0;
  let order: number[] = [];
  let glitch = 0;
  let starT = -1;
  const crowd: Snark[] = [];
  const list = () => echoesFeed.state?.echoes ?? [];
  const nextAuto = (): Echo | null => {
    const l = list();
    if (!l.length) return null;
    if (!order.length) {
      order = l.map((e) => e.echo);
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
      }
    }
    const n = order.pop()!;
    return l.find((e) => e.echo === n) ?? null;
  };
  const say = (line: string) => typed.type(line);
  const cheer = (p = 0.45) => {
    if (k.current === f) for (const s of crowd) if (Math.random() < p) s.emote(Math.random() < 0.5 ? "!" : Math.random() < 0.5 ? "heart" : "star", 2.2 + Math.random() * 2);
  };

  /** Start an Echo's ritual: the 13 first. */
  const purge = (e: Echo, chosen: boolean, live: boolean) => {
    step = { kind: "purge", t: 0, dur: PURGE, e, chosen, live };
    starT = -1;
    star.visible = false;
    ringStart();
    void loadRing(e);
    say(live ? `LIVE // ECHO #${echoNum(e.echo)} REVEALED_` : `${e.purged.length || 13} PURGED // ECHO #${echoNum(e.echo)}_`);
    if (k.current === f) sound(live ? "echo-live" : "echo-purge");
    if (live) {
      drawBoard(echoesFeed.state, `ECHO #${e.echo} · LIVE`);
      boardFlash = 8;
    }
    // its painting and its pixels, meanwhile
    void inspiration(e).catch(() => {});
    void lookOf(e);
  };
  /** The painting thrown on (B), or the blank canvas (e null). */
  const change = async (e: Echo | null, chosen: boolean, live: boolean) => {
    busy = true;
    try {
      if (e) {
        const [x, look] = await Promise.all([inspiration(e), lookOf(e)]);
        const im = x.tex.image as HTMLImageElement;
        P.uB.value = x.tex;
        P.uAspB.value = im.width / im.height;
        P.uColB.value.copy(x.color);
        P.uWhiteB.value = 0;
        if (look) P.uEB.value = look.tex;
      } else {
        P.uWhiteB.value = 1;
        P.uColB.value.set("#ffffff");
      }
    } catch {
      busy = false;
      step = { kind: "hold", t: 0, dur: 1, e: null, chosen: false, live: false };
      return;
    }
    busy = false;
    P.uEchoB.value = 0;
    P.uMix.value = 0;
    step = { kind: "change", t: 0, dur: hurry ? 1.4 : CHANGE, e, chosen, live };
    glitch = 1;
    starT = -1;
    star.visible = false;
    say(e ? `${(e.inspiration || "A PAINTING").toUpperCase()} // FEDOR_` : TITLE);
    if (k.current === f) {
      sound(e ? "canvas-hit" : "canvas-blank");
      if (e) cheer();
    }
  };
  const settle = () => {
    P.uA.value = P.uB.value;
    P.uAspA.value = P.uAspB.value;
    P.uWhiteA.value = P.uWhiteB.value;
    P.uColA.value.copy(P.uColB.value);
    P.uEA.value = P.uEB.value;
    P.uEchoA.value = P.uEchoB.value;
    P.uMix.value = 0;
    cur = step.e;
    condensed = false;
  };
  const hold = (dur: number, e: Echo | null, chosen = false, live = false) => {
    step = { kind: "hold", t: 0, dur, e, chosen, live };
  };
  /** An Echo asked for (a small monolith clicked, or just revealed): its ritual comes next, now. */
  const ask = (e: Echo, live = false) => {
    if (cur?.echo === e.echo && condensed && step.kind === "hold" && !live) {
      step.dur = step.t + CHOSEN_HOLD;
      return;
    }
    wanted = { e, live };
    if (step.kind === "hold") step.dur = 0;
    else hurry = true;
  };
  /** Back to the start: the blank canvas, the title typed again. */
  const restart = () => {
    wanted = null;
    hurry = false;
    P.uWhiteA.value = P.uWhiteB.value = 1;
    P.uMix.value = 0;
    P.uEchoA.value = P.uEchoB.value = 0;
    P.uColA.value.set("#ffffff");
    cur = null;
    condensed = false;
    run = 0;
    ringOff();
    star.visible = false;
    hold(BLANK_HOLD, null);
    sign.type(TITLE);
    say(TITLE);
  };
  /** After a step: what comes next. */
  const advance = () => {
    const s = step;
    if (s.kind === "purge") {
      ringOff();
      void change(s.e, s.chosen, s.live);
    } else if (s.kind === "change") {
      settle();
      if (cur) hold(hurry ? 0.4 : LOOK, cur, s.chosen, s.live);
      else hold(BLANK_HOLD, null);
    } else if (s.kind === "condense") {
      condensed = true;
      hurry = false;
      hold(s.chosen || s.live ? CHOSEN_HOLD : ECHO_HOLD, cur, s.chosen, s.live);
    } else if (s.kind === "hold") {
      // the painting has been seen: it condenses into the Echo
      if (cur && !condensed && !wanted) {
        step = { kind: "condense", t: 0, dur: CONDENSE, e: cur, chosen: s.chosen, live: s.live };
        say(`ECHO #${echoNum(cur.echo)} // ${traitOf(cur.traits, "Skin").toUpperCase() || "REVEALED"}_`);
        if (k.current === f) sound("echo-condense");
        return;
      }
      if (wanted) {
        const w = wanted;
        wanted = null;
        run = 0;
        purge(w.e, true, w.live);
        return;
      }
      hurry = false;
      const next = run >= RUN ? null : nextAuto();
      if (cur && !next) {
        run = 0;
        void change(null, false, false);
      } else if (next) {
        run++;
        purge(next, false, false);
      } else hold(BLANK_HOLD, null);
    }
  };

  // for the films (shots/film/echoes-capture.mjs): steer the show from the page
  g.userData.echoShow = {
    ask: (n: number, live = false) => {
      const e = list().find((x) => x.echo === n);
      if (e) ask(e, live);
    },
    restart,
    state: () => ({ cur: cur?.echo ?? null, condensed, step: step.kind, t: step.t, busy }),
  };

  // ---- the data: screens, plates, the board, the steles; an Echo revealed while you are here ------------
  let boardFlash = 0;
  const fill = (s: EchoesState) => {
    const byN = new Map(s.echoes.map((e) => [e.echo, e]));
    for (const m of minis) {
      const e = byN.get(m.n) ?? null;
      plate(m.i, e);
      if (!e) screen(m.i, null);
      else
        void lookOf(e).then((l) => {
          if (!l) return;
          screen(m.i, l.px);
          // a thumbnail for the steles
          const [c, cg] = canvas(GRID * 4, GRID * 4);
          cg.imageSmoothingEnabled = false;
          const u = 4;
          l.px.forEach((v, j) => {
            if (!v) return;
            cg.fillStyle = v;
            cg.fillRect((j % GRID) * u, Math.floor(j / GRID) * u, u, u);
          });
          const im = new Image();
          im.onload = () => {
            thumbs.set(e.echo, im);
            drawSteles(echoesFeed.state);
          };
          im.src = c.toDataURL();
        });
    }
    if (boardFlash <= 0) drawBoard(s, null);
    drawSteles(s);
  };
  const fresh = new Map<number, number>();
  void k.whenVisited(f).then(async () => {
    await echoesFeed.ready();
    echoesFeed.onChange(fill);
    echoesFeed.onReveal((got) => {
      for (const e of got) fresh.set(e.echo, 0);
      // the newest plays at once if you are here
      if (k.current === f) {
        ask(got[got.length - 1], true);
        cheer(0.8);
      }
    });
  });

  // ---- picking -----------------------------------------------------------------------------------------
  const echoOf = (n: number) => list().find((e) => e.echo === n) ?? null;
  k.pick(
    f,
    windows,
    (hit) => {
      const i = hit.faceIndex != null ? Math.floor(hit.faceIndex / 2) : -1;
      if (i < 0 || i >= N) return null;
      const e = echoOf(i + 1);
      return e ? `<b>${esc(e.name)}</b><span>after ${esc(e.inspiration)} · ${e.purged.length} purged</span>` : `<b>Echo ${echoNum(i + 1)}</b><span>hidden</span>`;
    },
    (hit) => {
      const i = hit.faceIndex != null ? Math.floor(hit.faceIndex / 2) : -1;
      if (i < 0 || i >= N) return null;
      const e = echoOf(i + 1);
      if (!e) return hiddenInfo(i + 1, echoesFeed.state);
      ask(e);
      return echoInfo(e);
    },
  );
  for (const m of faces)
    k.pick(
      f,
      m,
      () => (cur ? `<b>${esc(cur.name)}</b><span>after ${esc(cur.inspiration)} · FedosArt</span>` : "<b>Echoes</b><span>Experiment_002</span>"),
      () => {
        if (!cur) {
          const e = nextAuto();
          if (e) ask(e);
          return null;
        }
        return echoInfo(cur);
      },
    );
  for (const [i, st] of steles.entries())
    k.pick(f, st.m, i === 0 ? "<b>Public purge</b><span>13 zkSNARKs → 1 Echo</span>" : "<b>Signals draw</b><span>6 Echoes</span>", () => {
      const s = echoesFeed.state;
      const revealed = s?.echoes.length ?? 0;
      return {
        eyebrow: "Experiment_002 // Echoes",
        title: i === 0 ? "Public purge" : "Signals draw",
        tag: [s?.open ? "Open" : "Closed", s?.open ? "ok" : "muted"] as [string, "ok" | "muted"],
        stats:
          i === 0
            ? ([
                ["Claimed", `${s?.claimed ?? 0} / ${s?.public ?? 20}`],
                ["Per Echo", String(s?.perPurge ?? 13)],
                ["Purged", String(s ? s.echoes.slice(0, s.claimed).reduce((a, e) => a + e.purged.length, 0) : 0)],
              ] as [string, string][])
            : ([
                ["Revealed", `${s ? Math.max(0, revealed - s.claimed) : 0} / ${s?.draw ?? 6}`],
                ["Mark", s?.rule.mark ?? "Mark II"],
                ["Chroma", `${s?.rule.chroma ?? "Gold"} · ${s?.rule.traits ?? 50}+`],
              ] as [string, string][]),
        link: { href: "https://zilkroad.com/echoes", label: "Zilk Road" },
      };
    });

  // ---- FedosArt, the visitors ----------------------------------------------------------------------------
  const AX = -4.6,
    AZ = MZ + 5.2;
  let artist: Snark | null = null;
  const nameTag = nameSprite();
  const artistInfo = () => ({
    eyebrow: "Experiment_002 // Echoes",
    title: "FedosArt",
    image: ZScan.zkSnarkImage(FEDOS_SNARK),
    tag: [`zkSNARKs #${FEDOS_SNARK}`, "info"] as [string, "info"],
    stats: [["Echoes", `${list().length} / ${echoesFeed.state?.total ?? N}`]] as [string, string][],
    link: { href: "https://www.inprnt.com/gallery/fedosart/", label: "Prints on INPRNT" },
  });
  void k.person(f, FEDOS_SNARK, [AX, AZ], { face: [PX, MZ] }).then((s) => {
    if (!s) return;
    artist = s;
    s.role = "Artist";
    nameTag.position.set(0, 2.42, 0);
    s.root.add(nameTag);
    const hit = new THREE.Mesh(new THREE.BoxGeometry(1, 2.3, 1), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.set(0, 1.15, 0);
    s.root.add(hit);
    k.pick(f, hit, "<b>FedosArt</b><span>the artist behind zkSNARKs</span>", artistInfo);
  });
  let n = 0;
  const id = () => k.visitor(7100 + n++);
  // before the monolith, either side of the way to it, phones up
  for (const [x, z, o] of [
    [-3.0, MZ + 6.4, "phone"],
    [-2.0, MZ + 7.8, ""],
    [3.4, MZ + 6.0, "phone"],
    [4.4, MZ + 7.6, ""],
    [2.4, MZ + 9.4, "selfie"],
  ] as const)
    void k.person(f, id(), [x, z], { face: [PX, MZ], phone: o === "phone", selfie: o === "selfie" }).then((s) => s && crowd.push(s));
  // at the small monoliths, and two walking the rows
  for (const i of [2, 7, 12, 19]) {
    const m = minis[i];
    const nx = Math.sin(m.yaw);
    void k.person(f, id(), [m.x + nx * 1.7, m.z + 0.3], { face: [m.x, m.z], phone: i === 12 }).then((s) => s && crowd.push(s));
  }
  for (const side of [-1, 1]) {
    const x = side * (ROW_X - 2.2);
    void k.person(f, id(), [x, -14], { wander: [-12, -18, -24, -30, -36, -41].map((z) => [x, z] as [number, number]) }).then((s) => s && crowd.push(s));
  }

  // ---- lights (six a floor) ----------------------------------------------------------------------------
  k.light(f, 0, 3.5, -4, "#dfe4ff", 4, 8);
  const lamp = k.light(f, 0, 8.3, MZ + 2.2, "#ffeedd", 7, 12);
  const spill = k.light(f, PX, 3.2, MZ + 2.4, "#ffffff", 14, 11);
  const fills = [k.light(f, -9, 5, -20, "#000000", 0, 22), k.light(f, 9, 5, -20, "#000000", 0, 22), k.light(f, 0, 6, -42, "#000000", 0, 20)];
  void lamp;

  // the dust in the light
  const air = haze(new THREE.Vector3(0, 0, -27), 2 * XW - 3, DZ - 4, 9, dot(), TOUCH);
  g.add(air.points);

  // ---- the floor's clock --------------------------------------------------------------------------------
  let lastT = -10,
    ft = 0,
    nextLine = 9,
    said = 0,
    talking = 0;
  const wake = win.uniforms.uWake.value as number[];
  const glow = win.uniforms.uGlow.value as number[];
  const awake = minis.map(() => false);
  const col = new THREE.Color(),
    white = new THREE.Color("#ffffff");
  const toMonolith = new THREE.Vector3(PX - AX, 0, MZ - AZ).normalize();

  k.ticks[f].push((dt, t) => {
    // arriving on the floor: the blank canvas, the title typed again
    if (t - lastT > 1) restart();
    lastT = t;
    P.uTime.value = t;
    P.uDrift.value += dt;
    win.uniforms.uTime.value = t;

    // the step under way
    if (!busy) {
      const sdt = hurry && step.kind !== "change" ? dt * 3 : dt;
      step.t += sdt;
      if (step.kind === "purge") ringAt(step.t);
      else if (step.kind === "change") P.uMix.value = Math.min(1, step.t / step.dur);
      else if (step.kind === "condense") {
        P.uEchoA.value = Math.min(1, step.t / step.dur);
        if (step.t > step.dur * 0.8 && starT < 0 && cur) {
          starT = t;
          glitch = 0.6;
          cheer(0.5);
          const e = cur;
          void lookOf(e).then((l) => {
            if (!l?.star || cur !== e || starT < 0) return;
            cellAt(l.star[0], l.star[1], star.position);
            star.position.z += 0.03;
            star.visible = true;
          });
        }
      }
      if (step.t >= step.dur) advance();
    }
    // the star of the Echo on the monolith: a burst when it has condensed, then it breathes
    if (starT >= 0 && star.visible) {
      const a = t - starT;
      // one short four-point flash as the star's pixels land, then nothing: the pixels are the star
      const burst = Math.exp(-a * 3.2);
      star.scale.setScalar(0.4 + burst * 1.4);
      starMat.opacity = Math.min(1, a * 8) * burst;
      if (burst < 0.02) star.visible = false;
      star.quaternion.identity();
    }
    // glitches: hard at a change, a flicker now and then
    glitch *= Math.exp(-dt * 3);
    if (Math.random() < dt * 0.12) glitch = Math.max(glitch, 0.45);
    P.uGlitch.value = glitch > 0.05 ? glitch : 0;
    P.uPulse.value *= Math.exp(-dt * 7);

    // the room's light: the mix of the two paintings' colours (white for the blank canvas)
    const m = P.uMix.value;
    const ca = P.uWhiteA.value > 0.5 ? white : P.uColA.value,
      cb = P.uWhiteB.value > 0.5 ? white : P.uColB.value;
    col.copy(ca).lerp(cb, m);
    const lit = (1 - P.uWhiteA.value) * (1 - m) + (1 - P.uWhiteB.value) * m;
    if (spill) {
      spill.color.copy(col);
      spill.intensity = 5 + 10 * (1 - lit) + 3 * P.uPulse.value;
    }
    for (const l of fills)
      if (l) {
        l.color.copy(col);
        l.intensity = 9 * lit;
      }
    air.update(t, col, lit);
    spark.scale.setScalar(1.3 + 0.4 * Math.sin(t * 1.3) ** 2);
    spark.quaternion.copy(k.camQuat);

    sign.update(dt, t);
    typed.update(dt, t);
    if (boardFlash > 0) {
      boardFlash -= dt;
      if (boardFlash <= 0) drawBoard(echoesFeed.state, null);
    }
    if (k.current !== f) return;

    // the small monoliths: the one you walk up to wakes; the one on the monolith breathes; a hidden one
    // waits; one just revealed flashes for a while
    for (const mm of minis) {
      const d = Math.hypot(k.cam.x - mm.x, k.cam.z - mm.z);
      const near = d < 2.8;
      wake[mm.i] += ((near ? 1 : 0) - wake[mm.i]) * Math.min(1, dt * 3);
      if (near && !awake[mm.i]) {
        awake[mm.i] = true;
        sound("canvas-wake");
      } else if (d > 3.6) awake[mm.i] = false;
      const on = cur?.echo === mm.n ? 0.5 + 0.25 * Math.sin(t * 2.4) : 0;
      const hidden = !echoesFeed.state?.echoes.some((e) => e.echo === mm.n);
      let gl = hidden ? 0.35 + 0.25 * Math.sin(t * 1.6 + mm.i) ** 2 : 0.6 + 0.9 * wake[mm.i] + on;
      const fr = fresh.get(mm.n);
      if (fr != null) {
        const a = fr + dt;
        fresh.set(mm.n, a);
        gl += a < 30 ? 1.2 * Math.max(0, Math.sin(a * 6)) : 0;
        if (a > 30) fresh.delete(mm.n);
      }
      glow[mm.i] = gl;
    }

    // FedosArt: now and then he turns to whoever came, and says a line of his own
    ft += dt;
    const s = artist as Snark | null;
    if (!s) return;
    if (talking && ft > talking) {
      talking = 0;
      s.faceDir = toMonolith.clone();
      nameTag.visible = true;
    }
    const dx = k.cam.x - s.root.position.x,
      dz = k.cam.z - s.root.position.z;
    if (!talking && ft > nextLine && Math.hypot(dx, dz) < 8) {
      s.faceDir = new THREE.Vector3(dx, 0, dz).normalize();
      nameTag.visible = false;
      s.say(SAYS[said++ % SAYS.length], 5.5);
      talking = ft + 6;
      nextLine = ft + 16 + Math.random() * 10;
    }
  });

  k.finish(f);
  return { spawn: new THREE.Vector3(0, 0, -2.6), yaw: 0 };
}

/** World-scale texture repeat on a plane (a tile every 8 m). */
function tile(m: THREE.Mesh, w: number, d: number) {
  const uv = m.geometry.getAttribute("uv");
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / 8, (uv.getY(i) * d) / 8);
}

/** Wet concrete: a mottled grey, the saw cuts every 4 m, darker damp patches (tiles 8 m). */
function concreteFloor() {
  const [c, g] = canvas(1024, 1024);
  g.fillStyle = "#8a8a8c";
  g.fillRect(0, 0, 1024, 1024);
  let seed = 5;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 2600; i++) {
    const x = rnd() * 1024,
      y = rnd() * 1024,
      r = 6 + rnd() * 60;
    const l = 110 + rnd() * 50;
    g.fillStyle = `rgba(${l},${l},${l + 2},${0.05 + rnd() * 0.08})`;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  for (let i = 0; i < 18; i++) {
    const x = rnd() * 1024,
      y = rnd() * 1024,
      r = 60 + rnd() * 180;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, "rgba(40,40,44,0.35)");
    gr.addColorStop(1, "rgba(40,40,44,0)");
    g.fillStyle = gr;
    g.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
  g.fillStyle = "rgba(30,30,32,0.8)";
  for (const p of [0, 512]) {
    g.fillRect(p, 0, 3, 1024);
    g.fillRect(0, p, 1024, 3);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}
