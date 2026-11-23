import * as THREE from "three";
import { ZScan } from "../../data/zscan";
import type { Snark } from "../../scene/snark";
import { TOUCH } from "../../scene/quality";
import { GRID, haze, maskTexture, projected, projectionUniforms, ROOM, silhouetteMaterial, windowMaterial } from "./blankfx";
import { CORRIDOR, FEDOS_SNARK, SAYS, type Work, WORKS, workImage, workPrints } from "./fedosart";
import { Atlas, boxGeo, canvas, FLOOR_Y, type MuseumKit } from "./kit";
import { beamGeo } from "./parts";
import { dot } from "./planetfx";
import { nameSprite, sparkTexture } from "./planetarium";
import { workTexture } from "./planetshow";

/**
 * Floor 7, A BLANK CANVAS: zkSNARKs' Experiment_002, FedosArt's pieces, a first look. After the
 * teaser: a bare warehouse at night (wet concrete, pillars, factory windows on the city, trusses and
 * skylights), and in the middle a black monolith, a zkSNARK's 26 × 26 canvas with the figure cut
 * out of it, glowing white: the blank canvas. Then a piece is thrown across every wall of the
 * room, and through the figure, spreading out from it; another, another; back to white. Typed in
 * the teaser's letters: EXPERIMENT_002 // A BLANK CANVAS_, then each piece as it lands.
 *
 * Down both sides, the pieces one by one: small monoliths, each with its piece in the figure,
 * numbered. Walk up to one and it wakes; click it and it goes up on the monolith and the walls
 * (and its panel opens: the piece whole, its print). FedosArt (#9593) stands before the monolith,
 * visitors photograph it. Sound: ../../audio/blank.ts.
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
/** The small monoliths: side, plinth height, the rows' x. */
const S = 1.3,
  PH = 0.42,
  ROW_X = 11.4;
const FONT = '"Helvetica Neue", Inter, Roboto, Arial, sans-serif';
/** How long the blank canvas stays, a piece stays, the change takes; pieces between two blanks. */
const BLANK_HOLD = 6.5,
  WORK_HOLD = 11,
  CHOSEN_HOLD = 20,
  CHANGE = 2.6,
  RUN = 3;

const ALL: Work[] = [...WORKS, ...CORRIDOR];
const num = (i: number) => String(i + 1).padStart(2, "0");

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

/** The piece's panel: the work whole, its print. */
function workInfo(i: number) {
  const w = ALL[i];
  return {
    eyebrow: `Experiment_002 // ${num(i)}`,
    title: w.title,
    image: workImage(w),
    tag: ["On the walls", "info"] as [string, "info"],
    body: `<p><img src="${workImage(w)}" alt="" style="width:100%;height:auto;display:block"></p>`,
    link: { href: workPrints(w), label: "Prints on INPRNT" },
  };
}

export function blankCanvas(k: MuseumKit) {
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
  const faces: THREE.Mesh[] = [];
  for (const back of [false, true]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(SLAB, SLAB), silhouetteMaterial(P, mask, U, back));
    m.position.set(0, PLINTH + SLAB / 2, MZ + (back ? -1 : 1) * (DEPTH / 2 + 0.004));
    if (back) m.rotation.y = Math.PI;
    g.add(m);
    faces.push(m);
  }
  // the lamp over it, its spark
  k.geo(f, steel, new THREE.CylinderGeometry(0.012, 0.012, HH - 8.9, 5).translate(0, 8.9 + (HH - 8.9) / 2, MZ + 2.2));
  k.geo(f, steel, new THREE.CylinderGeometry(0.12, 0.42, 0.34, 20, 1, true).translate(0, 8.72, MZ + 2.2));
  k.geo(f, k.lit("#fff4e2", 2.2), new THREE.SphereGeometry(0.1, 12, 8).translate(0, 8.6, MZ + 2.2));
  const spark = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ map: sparkTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, color: new THREE.Color(1.8, 1.75, 1.9) }),
  );
  spark.position.set(0, 8.55, MZ + 2.22);
  spark.raycast = () => {};
  g.add(spark);
  k.pool(f, PX, MZ + 3.2, 3.4, "#ffffff", 0.012, 0.5);

  // ---- what is typed: in the black over the figure, as on the teaser's black screen -----------------
  const TOP = PLINTH + 21 * U;
  const typed = new Typewriter(2048, 160, 64, null, () => k.cam.z < Z0 - 2 && sound("canvas-type"));
  const typedLine = new THREE.Mesh(
    new THREE.PlaneGeometry(SLAB - 0.5, ((SLAB - 0.5) * 160) / 2048),
    new THREE.MeshBasicMaterial({ map: typed.tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, color: new THREE.Color(1.15, 1.15, 1.2) }),
  );
  typedLine.position.set(0, (TOP + PLINTH + SLAB) / 2, MZ + DEPTH / 2 + 0.008);
  typedLine.raycast = () => {};
  g.add(typedLine);

  // ---- the pieces, one by one, down both sides ---------------------------------------------------------
  const minis = ALL.map((w, i) => {
    const left = i % 2 === 0;
    const r = Math.floor(i / 2);
    const x = left ? -ROW_X : ROW_X,
      z = left ? -11.2 - r * 2.05 : -12.2 - r * 2.05;
    return { w, i, x, z, yaw: left ? Math.PI / 2 : -Math.PI / 2 };
  });
  for (const m of minis) {
    k.box(f, slabMat, 0.55, PH, S + 0.2, m.x, 0, m.z, { solid: true });
    k.box(f, slabMat, 0.1, S, S, m.x, PH, m.z);
  }
  const CW = TOUCH ? 160 : 288;
  const atlas = new Atlas(7, Math.ceil(ALL.length / 7), CW, CW);
  atlas.g.fillStyle = "#0b0b0d";
  atlas.g.fillRect(0, 0, atlas.canvas.width, atlas.canvas.height);
  const win = windowMaterial(mask, atlas.tex, ALL.length);
  const plates = new Atlas(4, Math.ceil(ALL.length / 4), 512, 96);
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
      plates.cell(m.i, (c, w, h) => {
        c.fillStyle = "#000000";
        c.fillRect(0, 0, w, h);
        c.fillStyle = "#ffffff";
        c.textBaseline = "middle";
        c.font = `700 40px ${FONT}`;
        c.letterSpacing = "3px";
        c.fillText(num(m.i), 18, h / 2 + 2);
        c.font = `500 25px ${FONT}`;
        c.letterSpacing = "2px";
        let t = m.w.title.toUpperCase();
        while (c.measureText(t).width > w - 104 && t.length > 4) t = `${t.slice(0, -2).trimEnd()}…`;
        c.fillStyle = "#c9c9cf";
        c.fillText(t, 88, h / 2 + 2);
      });
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
  // their pieces, once the floor is visited, cropped to the figure's square
  void k.whenVisited(f).then(() =>
    ALL.forEach((w, i) =>
      void workTexture(w)
        .then(({ tex }) => {
          const im = tex.image as HTMLImageElement;
          atlas.cell(i, (c, cw, ch) => {
            const s = Math.max(cw / im.width, ch / im.height);
            c.drawImage(im, (cw - im.width * s) / 2, (ch - im.height * s) / 2, im.width * s, im.height * s);
          });
        })
        .catch(() => {}),
    ),
  );

  // ---- the show ------------------------------------------------------------------------------------------
  /** On the monolith now (null: the blank canvas); the change under way; a piece asked for. */
  let cur: number | null = null;
  let change: { to: number | null; t: number; dur: number; chosen: boolean } | null = null;
  let wanted: number | null = null;
  let busy = false;
  let hold = BLANK_HOLD;
  let run = 0;
  let order: number[] = [];
  const nextAuto = () => {
    if (!order.length) {
      order = ALL.map((_, i) => i);
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
      }
    }
    return order.pop()!;
  };
  const caption = (to: number | null) => {
    const line = to == null ? "EXPERIMENT_002 // A BLANK CANVAS_" : `${num(to)} // ${ALL[to].title.toUpperCase()} BY FEDOR_`;
    typed.type(line);
  };
  let glitch = 0;
  const crowd: Snark[] = [];
  const go = async (to: number | null, dur = CHANGE, chosen = false) => {
    busy = true;
    try {
      if (to != null) {
        const x = await workTexture(ALL[to]);
        const im = x.tex.image as HTMLImageElement;
        P.uB.value = x.tex;
        P.uAspB.value = im.width / im.height;
        P.uColB.value.copy(x.color);
        P.uWhiteB.value = 0;
      } else {
        P.uWhiteB.value = 1;
        P.uColB.value.set("#ffffff");
      }
    } catch {
      busy = false;
      hold = 1;
      return;
    }
    busy = false;
    P.uMix.value = 0;
    change = { to, t: 0, dur, chosen };
    glitch = 1;
    caption(to);
    if (k.current === f) {
      sound(to == null ? "canvas-blank" : "canvas-hit");
      if (to != null) for (const s of crowd) if (Math.random() < 0.45) s.emote(Math.random() < 0.5 ? "!" : Math.random() < 0.5 ? "heart" : "star", 2.2 + Math.random() * 2);
    }
  };
  const settle = () => {
    if (!change) return;
    P.uA.value = P.uB.value;
    P.uAspA.value = P.uAspB.value;
    P.uWhiteA.value = P.uWhiteB.value;
    P.uColA.value.copy(P.uColB.value);
    P.uMix.value = 0;
    cur = change.to;
    change = null;
    win.uniforms.uOn.value = cur ?? -1;
  };
  /** A piece asked for (a small monolith clicked): it comes next, now. */
  const ask = (i: number) => {
    if (i === cur && !change) {
      hold = CHOSEN_HOLD;
      return;
    }
    wanted = i;
    if (change) change.dur = Math.min(change.dur, change.t + 0.6);
    else if (!busy) hold = 0;
  };
  /** Back to the start: the blank canvas, the title typed again. */
  const restart = () => {
    change = null;
    wanted = null;
    P.uWhiteA.value = P.uWhiteB.value = 1;
    P.uMix.value = 0;
    P.uColA.value.set("#ffffff");
    cur = null;
    run = 0;
    hold = BLANK_HOLD;
    win.uniforms.uOn.value = -1;
    sign.type("EXPERIMENT_002 // A BLANK CANVAS_");
    caption(null);
  };

  // for the films (shots/film/blank-capture.mjs): steer the show from the page
  g.userData.canvasShow = {
    ask,
    restart,
    blank: () => {
      if (cur == null || change || busy) return;
      run = 0;
      void go(null, 2);
    },
    state: () => ({ cur, changing: !!change, busy, hold }),
  };

  // ---- picking -----------------------------------------------------------------------------------------
  k.pick(
    f,
    windows,
    (hit) => {
      const i = hit.faceIndex != null ? Math.floor(hit.faceIndex / 2) : -1;
      return i >= 0 && i < ALL.length ? `<b>${num(i)} · ${ALL[i].title}</b><span>FedosArt</span>` : null;
    },
    (hit) => {
      const i = hit.faceIndex != null ? Math.floor(hit.faceIndex / 2) : -1;
      if (i < 0 || i >= ALL.length) return null;
      ask(i);
      return workInfo(i);
    },
  );
  for (const m of faces)
    k.pick(
      f,
      m,
      () => (cur != null ? `<b>${num(cur)} · ${ALL[cur].title}</b><span>FedosArt</span>` : "<b>A Blank Canvas</b><span>Experiment_002</span>"),
      () => {
        if (cur == null) {
          ask(nextAuto());
          return null;
        }
        return workInfo(cur);
      },
    );

  // ---- FedosArt, the visitors ----------------------------------------------------------------------------
  const AX = -4.9,
    AZ = MZ + 5.2;
  let artist: Snark | null = null;
  const nameTag = nameSprite();
  const artistInfo = () => ({
    eyebrow: "Experiment_002 // A Blank Canvas",
    title: "FedosArt",
    image: ZScan.zkSnarkImage(FEDOS_SNARK),
    tag: [`zkSNARKs #${FEDOS_SNARK}`, "info"] as [string, "info"],
    stats: [["Pieces", String(ALL.length)]] as [string, string][],
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
    [-3.2, MZ + 6.2, "phone"],
    [-2.2, MZ + 7.6, ""],
    [3.4, MZ + 5.8, "phone"],
    [4.4, MZ + 7.4, ""],
    [2.4, MZ + 9.2, "selfie"],
  ] as const)
    void k.person(f, id(), [x, z], { face: [PX, MZ], phone: o === "phone", selfie: o === "selfie" }).then((s) => s && crowd.push(s));
  // at the small monoliths, and two walking the rows
  for (const i of [4, 9, 16, 23]) {
    const m = minis[i];
    const nx = Math.sin(m.yaw);
    void k.person(f, id(), [m.x + nx * 1.7, m.z + 0.3], { face: [m.x, m.z], phone: i === 16 }).then((s) => s && crowd.push(s));
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
  const awake = ALL.map(() => false);
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

    // the change under way, or the wait for the next
    if (change) {
      change.t += dt;
      P.uMix.value = Math.min(1, change.t / change.dur);
      if (change.t >= change.dur) {
        const chosen = change.chosen;
        settle();
        hold = chosen ? CHOSEN_HOLD : cur == null ? BLANK_HOLD : WORK_HOLD;
        if (wanted != null) {
          const w = wanted;
          wanted = null;
          run = 0;
          void go(w, 1.8, true);
        }
      }
    } else if (!busy) {
      hold -= dt;
      if (hold <= 0) {
        if (wanted != null) {
          const w = wanted;
          wanted = null;
          run = 0;
          void go(w, 1.8, true);
        } else if (cur != null && run >= RUN) {
          run = 0;
          void go(null, 2);
        } else {
          run++;
          void go(nextAuto());
        }
      }
    }
    // glitches: hard at a change, a flicker now and then
    glitch *= Math.exp(-dt * 3);
    if (Math.random() < dt * 0.12) glitch = Math.max(glitch, 0.45);
    P.uGlitch.value = glitch > 0.05 ? glitch : 0;

    // the room's light: the mix of the two works' colours (white for the blank canvas)
    const m = P.uMix.value;
    const ca = P.uWhiteA.value > 0.5 ? white : P.uColA.value,
      cb = P.uWhiteB.value > 0.5 ? white : P.uColB.value;
    col.copy(ca).lerp(cb, m);
    const lit = (1 - P.uWhiteA.value) * (1 - m) + (1 - P.uWhiteB.value) * m;
    if (spill) {
      spill.color.copy(col);
      spill.intensity = 5 + 10 * (1 - lit);
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
    if (k.current !== f) return;

    // the small monolith you walk up to wakes
    for (const mm of minis) {
      const d = Math.hypot(k.cam.x - mm.x, k.cam.z - mm.z);
      const near = d < 2.8;
      wake[mm.i] += ((near ? 1 : 0) - wake[mm.i]) * Math.min(1, dt * 3);
      if (near && !awake[mm.i]) {
        awake[mm.i] = true;
        sound("canvas-wake");
      } else if (d > 3.6) awake[mm.i] = false;
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
