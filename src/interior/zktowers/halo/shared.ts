import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { drawTape, tape } from "../../reserve/data";
import { type Finish, type LiftStyle, paint, type SkyKit, Surface } from "../kit";

/** HALO's palette, its lift, and the pieces its floors share (the twisted triangle, screens). */

export const PAL = {
  stone: "#eceae6",
  stoneShade: "#d6d4d0",
  chrome: "#c8ccd4",
  steel: "#8a929c",
  ink: "#0c1218",
  cyan: "#3ef0ff",
  cyanSoft: "#7ff6ff",
  glass: "#bfe0f0",
  walnut: "#3a2418",
  walnutLight: "#5a3a26",
  leather: "#5a2a1c",
  leatherDark: "#3a1a12",
  brass: "#c9a24a",
  carpet: "#1c2128",
};

export const LIFT: LiftStyle = { wall: "#dfe3e8", frame: "#c8ccd4", door: "#e8eef4", ink: "#14202a", lit: "#3ef0ff", accent: "#3ef0ff", deco: "bar" };
export const LIFT_DARK: LiftStyle = { wall: "#2a1c14", frame: "#c9a24a", door: "#b8bcc4", ink: "#f0e6d0", lit: "#3ef0ff", accent: "#c9a24a", deco: "bar" };

/** The HALO plan: a rounded triangle `R` across its corners, turned `rot`; n points round it. */
export function triPoints(R: number, rot: number, n = 72): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    // corners bulge out where cos(3(a - rot)) peaks; a flat-ish side between
    const r = R * (0.86 + 0.14 * Math.cos(3 * (a - rot)));
    out.push([Math.sin(a) * r, Math.cos(a) * r]);
  }
  return out;
}

/** A strip following a closed outline (a ring of boxes), at height y, `w` wide and `h` high. */
export function outline(k: SkyKit, f: number, pts: [number, number][], cx: number, cz: number, y: number, w: number, h: number, color: THREE.ColorRepresentation, finish: Finish = "matte") {
  for (let i = 0; i < pts.length; i++) {
    const [ax, az] = pts[i],
      [bx, bz] = pts[(i + 1) % pts.length];
    const len = Math.hypot(bx - ax, bz - az) + 0.02;
    k.box(f, len, h, w, cx + (ax + bx) / 2, y, cz + (az + bz) / 2, color, finish, -Math.atan2(bz - az, bx - ax));
  }
}

/** A filled rounded-triangle slab (top at y + h). */
export function triSlab(k: SkyKit, f: number, R: number, rot: number, cx: number, cz: number, y: number, h: number, color: THREE.ColorRepresentation, finish: Finish = "matte") {
  const shape = new THREE.Shape(triPoints(R, rot, 48).map(([x, z]) => new THREE.Vector2(x, -z)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false, curveSegments: 1 });
  g.rotateX(-Math.PI / 2);
  g.translate(cx, y, cz);
  k.geo(f, g, color, finish);
}

/**
 * Screens that share a few live textures, merged per texture: one draw call per kind of screen,
 * however many desks carry it.
 */
export class Screens {
  private lists = new Map<Surface, THREE.BufferGeometry[]>();
  add(s: Surface, w: number, h: number, x: number, y: number, z: number, ry = 0, rx = 0) {
    const g = new THREE.PlaneGeometry(w, h);
    if (rx) g.rotateX(rx);
    if (ry) g.rotateY(ry);
    g.translate(x, y, z);
    let l = this.lists.get(s);
    if (!l) this.lists.set(s, (l = []));
    l.push(g);
  }
  build(parent: THREE.Object3D) {
    for (const [s, list] of this.lists) {
      const geo = mergeGeometries(list, false);
      list.forEach((g) => g.dispose());
      if (!geo) continue;
      const m = new THREE.Mesh(geo, s.mat);
      m.raycast = () => {};
      parent.add(m);
    }
  }
}

/** A live surface redrawn every `every` seconds while you are on floor f. */
export function liveSurface(k: SkyKit, f: number, W: number, H: number, draw: (g: CanvasRenderingContext2D, W: number, H: number, t: number) => void, every = 3, bright = 1.1) {
  const s = new Surface(W, H, bright);
  let acc = 0;
  k.ticks[f].push((dt, t) => {
    acc += dt;
    if (acc < every) return;
    acc = 0;
    s.draw((g, w, h) => draw(g, w, h, t));
  });
  s.draw((g, w, h) => draw(g, w, h, 0));
  void document.fonts?.ready.then(() => s.draw((g, w, h) => draw(g, w, h, 0)));
  return s;
}

/** A ticker tape band (one canvas, scrolling) laid along straight runs: [x0, z0, x1, z1] each. */
export function tapeBand(k: SkyKit, f: number, runs: [number, number, number, number][], y: number, h = 0.36) {
  const s = new Surface(4096, 64, 1.2);
  s.tex.wrapS = THREE.RepeatWrapping;
  const redraw = () => s.draw((c, W, H) => drawTape(c, W, H, tape(k.height), "#03070c"));
  redraw();
  void document.fonts?.ready.then(redraw);
  let acc = 0;
  const mats: THREE.MeshBasicMaterial[] = [];
  for (const [x0, z0, x1, z1] of runs) {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const tex = s.tex.clone();
    tex.repeat.set(len / 22, 1);
    const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
    mats.push(mat);
    const p = k.plane(f, len, h, mat, (x0 + x1) / 2, y, (z0 + z1) / 2, 0, -Math.atan2(z1 - z0, x1 - x0));
    p.renderOrder = 3;
  }
  k.ticks[f].push((dt, t) => {
    acc += dt;
    if (acc > 20) {
      acc = 0;
      redraw();
      for (const m of mats) m.map!.needsUpdate = true;
    }
    for (const m of mats) m.map!.offset.x = (t * 0.025) % 1;
  });
}

/** Light stone: pale ground, soft grey veins, large tiles. */
export function stoneTex(rx: number, ry: number, base = PAL.stone, vein = "#9aa0a8") {
  return paint(
    512,
    512,
    (g, W, H) => {
      g.fillStyle = base;
      g.fillRect(0, 0, W, H);
      g.globalAlpha = 0.18;
      g.strokeStyle = vein;
      for (let n = 0; n < 50; n++) {
        g.lineWidth = 0.5 + ((n * 37) % 10) / 6;
        g.beginPath();
        let x = ((n * 97) % 512) as number,
          y = ((n * 211) % 512) as number;
        g.moveTo(x, y);
        for (let s = 0; s < 6; s++) {
          x += Math.sin(n * 3.1 + s) * 60;
          y += Math.cos(n * 1.7 + s * 2) * 60;
          g.lineTo(x, y);
        }
        g.stroke();
      }
      g.globalAlpha = 1;
      g.strokeStyle = "rgba(120,124,132,0.4)";
      g.lineWidth = 2;
      g.strokeRect(1, 1, W - 2, H - 2);
      g.beginPath();
      g.moveTo(W / 2, 0);
      g.lineTo(W / 2, H);
      g.stroke();
    },
    rx,
    ry,
  );
}
