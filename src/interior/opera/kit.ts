import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { Snark, loadArt } from "../../scene/snark";
import type { PickInfo, Rect } from "../types";

/** Shared pieces for the OPERA HOUSE: floor heights, materials, merged statics, people, picks. */

export const FOYER_Y = 0;
export const HALL_Y = 20;

export function rng(seed: number) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, repeat = false) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return { c, g, t, redraw: () => (draw(g, w, h), (t.needsUpdate = true)) };
}

/** Brush-box timber: warm vertical boards. */
export function timberTex(rep = 1) {
  const { t } = canvasTex(256, 256, (g) => {
    for (let x = 0; x < 256; x += 16) {
      const l = 30 + ((x * 37) % 9);
      g.fillStyle = `hsl(24, 42%, ${l}%)`;
      g.fillRect(x, 0, 16, 256);
      g.fillStyle = "rgba(0,0,0,0.25)";
      g.fillRect(x, 0, 1, 256);
      for (let k = 0; k < 6; k++) {
        g.fillStyle = `rgba(60,30,10,${0.08 + ((x + k) % 3) * 0.03})`;
        g.fillRect(x + 2 + ((k * 5) % 12), (k * 47 + x) % 256, 1, 30 + ((k * 13) % 40));
      }
    }
  }, true);
  t.repeat.set(rep, rep);
  return t;
}

/** White birch ribs (the shells seen from inside). */
export function ribTex(n = 16, tone = "#e8e2d4", line = "#bfb5a0") {
  const { t } = canvasTex(512, 64, (g, w, h) => {
    g.fillStyle = tone;
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < n; i++) {
      const x = (i / n) * w;
      const grd = g.createLinearGradient(x, 0, x + w / n, 0);
      grd.addColorStop(0, line);
      grd.addColorStop(0.15, tone);
      grd.addColorStop(0.85, tone);
      grd.addColorStop(1, "#d8d0c0");
      g.fillStyle = grd;
      g.fillRect(x, 0, w / n, h);
    }
  });
  return t;
}

export const std = (color: string, roughness = 0.8, metalness = 0.05, extra: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
export const glow = (color: string, k = 2) => new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), toneMapped: false });

/** Static geometry collected per material and merged into one mesh each. */
export class Merger {
  private parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
  add(mat: THREE.Material, geo: THREE.BufferGeometry) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (!g.getAttribute("uv")) g.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(g.getAttribute("position").count * 2), 2));
    let l = this.parts.get(mat);
    if (!l) this.parts.set(mat, (l = []));
    l.push(g);
  }
  box(mat: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number, ry = 0, rx = 0) {
    const g = new THREE.BoxGeometry(w, h, d);
    if (rx) g.rotateX(rx);
    if (ry) g.rotateY(ry);
    g.translate(x, y + h / 2, z);
    this.add(mat, g);
  }
  cyl(mat: THREE.Material, r0: number, r1: number, h: number, x: number, y: number, z: number, seg = 10) {
    const g = new THREE.CylinderGeometry(r0, r1, h, seg);
    g.translate(x, y + h / 2, z);
    this.add(mat, g);
  }
  flush(parent: THREE.Object3D) {
    for (const [mat, list] of this.parts) {
      const g = mergeGeometries(list.map((x) => (x.index ? x.toNonIndexed() : x)));
      if (!g) continue;
      const mesh = new THREE.Mesh(g, mat);
      mesh.raycast = () => {};
      parent.add(mesh);
    }
    this.parts.clear();
  }
}

/** One floor: its group, colliders, clickables, people and per-frame ticks. */
export class Level {
  readonly group = new THREE.Group();
  readonly rects: Rect[] = [];
  readonly picks = new Map<THREE.Object3D, { hover: string; info: () => PickInfo | null }>();
  readonly people: Snark[] = [];
  readonly ticks: ((dt: number, t: number) => void)[] = [];
  readonly m = new Merger();
  /** The walker's eye (set every frame). */
  readonly eye = new THREE.Vector3();

  constructor(readonly y: number) {}

  pick(o: THREE.Object3D, hover: string, info: () => PickInfo | null) {
    this.picks.set(o, { hover, info });
  }

  find(o: THREE.Object3D | null) {
    for (let x = o; x; x = x.parent) {
      const p = this.picks.get(x);
      if (p) return p;
    }
    return null;
  }

  /**
   * A zkSNARK: says its lines in a bubble when the walker comes near; `plain` makes it a clickable
   * (no chat), with `info` for the panel.
   */
  async person(id: number, x: number, y: number, z: number, role: string, o: { lines?: string[]; sit?: boolean; scale?: number; face?: THREE.Vector3; near?: number; plain?: () => PickInfo; wander?: [number, number][] } = {}) {
    try {
      const s = new Snark(id, await loadArt(id));
      s.noClip = true;
      s.state = "resident";
      s.role = role;
      s.root.position.set(x, y, z);
      s.faceDir = o.face ?? new THREE.Vector3(0, 0, 1);
      if (o.sit) s.sit(true);
      if (o.scale) s.setScale(o.scale);
      this.group.add(s.root);
      this.people.push(s);
      const lines = o.lines ?? [];
      let said = Math.floor(Math.random() * 7);
      let wait = 1 + Math.random() * 5;
      if (lines.length) {
        const near = o.near ?? 7;
        this.ticks.push((dt) => {
          wait -= dt;
          if (wait > 0) return;
          wait = 1;
          const p = s.root.position;
          if (Math.abs(this.eye.y - 1.6 - p.y) < 2.5 && Math.hypot(this.eye.x - p.x, this.eye.z - p.z) < near) {
            s.say(lines[said++ % lines.length], 3.6);
            wait = 7 + Math.random() * 9;
          }
        });
      }
      if (o.plain) {
        delete s.root.userData.snarkRef;
        const info = o.plain;
        this.pick(s.body, `<b>${role}</b><span>zkSNARK #${id}</span>`, () => {
          if (lines.length) s.say(lines[said++ % lines.length], 3.2);
          return info();
        });
      }
      if (o.wander) {
        const w = o.wander;
        void (async () => {
          for (;;) {
            await new Promise((r) => setTimeout(r, 5000 + Math.random() * 9000));
            if (!this.group.visible) continue;
            s.faceDir = null;
            const p = w[Math.floor(Math.random() * w.length)];
            await s.walk([new THREE.Vector3(p[0], y, p[1])], 0.8);
            s.faceDir = o.face ?? null;
          }
        })();
      }
      return s;
    } catch {
      return null;
    }
  }
}

export const fmt = (n: number) => n.toLocaleString("en-US");
