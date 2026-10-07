import * as THREE from "three";
import { atlasBitmap } from "../../data/atlas";
import { loadArt, Snark } from "../snark";
import { sayAt } from "../speech";

/** A tube between two points (merged into bigger meshes), optionally tapered. */
export function tube(a: THREE.Vector3, b: THREE.Vector3, r: number, r1 = r, sides = 8) {
  const len = a.distanceTo(b);
  const geo = new THREE.CylinderGeometry(r1, r, len, sides, 1).translate(0, len / 2, 0);
  geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()));
  return geo.translate(a.x, a.y, a.z);
}

export const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Merge-ready: every geometry non-indexed with position/normal/uv only. */
export function clean(g: THREE.BufferGeometry) {
  const n = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(n.attributes)) if (k !== "position" && k !== "normal" && k !== "uv") n.deleteAttribute(k);
  if (!n.attributes.uv) n.setAttribute("uv", new THREE.BufferAttribute(new Float32Array((n.attributes.position.count * 2) | 0), 2));
  return n;
}

/** A canvas texture drawn once (signs, logos). */
export function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  draw(g, w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** A glowing sign: a plane of `w` × `h` metres with its canvas. */
export function sign(w: number, h: number, px: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, glow = 1.25) {
  const tex = canvasTex(Math.round(px * (w / h)), px, draw);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, color: new THREE.Color(glow, glow, glow), transparent: true }));
  return m;
}

export const FONT = '"JetBrains Mono", Menlo, monospace';

/**
 * Portraits of the collection, cut out of the atlas (dark background keyed out), on one small sheet:
 * cell `i` is at uv(i). Used for the riders seen through the capsules' glass.
 */
export function portraitSheet(ids: number[], cols = 8) {
  const rows = Math.ceil(ids.length / cols);
  const c = document.createElement("canvas");
  c.width = cols * 32;
  c.height = rows * 32;
  const g = c.getContext("2d")!;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  const uv = (i: number): [number, number, number, number] => {
    const k = i % ids.length;
    const x = k % cols,
      y = Math.floor(k / cols);
    return [x / cols, 1 - (y + 1) / rows, (x + 1) / cols, 1 - y / rows];
  };
  void (async () => {
    try {
      // one shared download for the whole app (retried on API trouble)
      const bmp = await atlasBitmap();
      const cell = bmp.width / 100;
      g.imageSmoothingEnabled = false;
      ids.forEach((id, i) => g.drawImage(bmp, ((id - 1) % 100) * cell, Math.floor((id - 1) / 100) * cell, cell, cell, (i % cols) * 32, Math.floor(i / cols) * 32, 32, 32));
      bmp.close();
      const img = g.getImageData(0, 0, c.width, c.height);
      const d = img.data,
        W = c.width;
      for (let k = 0; k < ids.length; k++) {
        const ox = (k % cols) * 32,
          oy = Math.floor(k / cols) * 32;
        const seen = new Uint8Array(1024);
        const stack: number[] = [];
        for (let t = 0; t < 32; t++) stack.push(t, 31 * 32 + t, t * 32, t * 32 + 31);
        while (stack.length) {
          const q = stack.pop()!;
          if (seen[q]) continue;
          seen[q] = 1;
          const x = q % 32,
            y = (q / 32) | 0;
          const i = ((oy + y) * W + ox + x) * 4;
          if (!(d[i] <= 38 && d[i + 1] <= 38 && d[i + 2] <= 38)) continue;
          d[i + 3] = 0;
          if (x > 0) stack.push(q - 1);
          if (x < 31) stack.push(q + 1);
          if (y > 0) stack.push(q - 32);
          if (y < 31) stack.push(q + 32);
        }
      }
      g.putImageData(img, 0, 0);
    } catch {
      ids.forEach((id, i) => {
        const ox = (i % cols) * 32,
          oy = Math.floor(i / cols) * 32;
        g.fillStyle = `hsl(${(id * 47) % 360},45%,42%)`;
        g.fillRect(ox + 9, oy + 19, 16, 13);
        g.fillStyle = `hsl(${(id * 47 + 40) % 360},35%,70%)`;
        g.fillRect(ox + 11, oy + 6, 12, 13);
      });
    }
    tex.needsUpdate = true;
  })();
  return { tex, uv };
}

/** A zkSNARK for a ride (a passenger, the pilot, someone in the queue): never in the street's crowd. */
export async function person(parent: THREE.Object3D, id: number, at: THREE.Vector3, o: { sit?: boolean; scale?: number; cap?: boolean; face?: THREE.Vector3; role?: string } = {}) {
  try {
    const s = new Snark(id, await loadArt(id));
    s.state = "resident";
    s.noClip = true;
    s.role = o.role ?? null;
    s.root.position.copy(at);
    s.faceDir = o.face ?? null;
    if (o.sit) s.sit(true);
    if (o.cap) s.setCap();
    if (o.scale) s.setScale(o.scale);
    parent.add(s.root);
    return s;
  } catch {
    return null;
  }
}

/** Height of a zkSNARK's head over its root (for its speech bubble). */
export function headOf(s: Snark, scale = 1) {
  return (s.isSeated ? 1.75 : 2.15) * scale + 0.1;
}

/**
 * People talking to each other in small bubbles: conversations (speaker index, words) in turn,
 * one line every few seconds, a pause between conversations. `say` can also be called directly.
 */
export class Banter {
  private k = Math.floor(Math.random() * 100);
  private line = 0;
  private wait = 2.5;
  constructor(
    public people: (Snark | null)[],
    public script: [number, string][][],
    private scale = 0.82,
    private size = 0.36,
  ) {}

  say(i: number, words: string, seconds = 3.6) {
    const s = this.people[i];
    if (!s) return;
    sayAt(s.root, words, "talk", headOf(s, this.scale), seconds, this.size);
    for (const p of this.people) if (p && p !== s) p.faceDir = s.root.position.clone().sub(p.root.position).setY(0).normalize();
  }

  /** Hold the next line back for a moment (someone else just spoke). */
  hush(seconds: number) {
    this.wait = Math.max(this.wait, seconds);
  }

  update(dt: number) {
    if (!this.script.length) return;
    this.wait -= dt;
    if (this.wait > 0) return;
    const conv = this.script[this.k % this.script.length];
    const [i, words] = conv[this.line];
    this.say(i, words);
    this.line++;
    this.wait = 3.8;
    if (this.line >= conv.length) {
      this.line = 0;
      this.k++;
      this.wait = 7 + Math.random() * 5;
    }
  }
}
