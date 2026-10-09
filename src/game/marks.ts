import * as THREE from "three";
import { StreetPay, type Mark, type PayEvent } from "../data/streetpay";

/**
 * Messages on the ground, like the orange runes of Dark Souls, except each one is the memo of a
 * shielded payment: sealed on chain where the visitor stood (on the street, or in a place on a
 * floor). They glow, motes drift up from them, the liked ones burn brighter; walk onto one and
 * press E to read it. Pressing N on foot leaves your own.
 */

const READ_DIST = 2.1;
const MOTES = 8;

let runeTex: THREE.Texture | null = null;
function runeTexture() {
  if (runeTex) return runeTex;
  const S = 256;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d")!;
  const glow = g.createRadialGradient(S / 2, S / 2, 4, S / 2, S / 2, S / 2);
  glow.addColorStop(0, "rgba(255,190,90,0.9)");
  glow.addColorStop(0.3, "rgba(255,110,10,0.6)");
  glow.addColorStop(0.62, "rgba(230,70,0,0.22)");
  glow.addColorStop(1, "rgba(200,50,0,0)");
  g.fillStyle = glow;
  g.fillRect(0, 0, S, S);
  g.translate(S / 2, S / 2);
  g.strokeStyle = "rgba(255,170,60,1)";
  g.shadowColor = "#ff6a00";
  g.shadowBlur = 10;
  g.lineWidth = 3;
  g.beginPath();
  g.arc(0, 0, 78, 0, Math.PI * 2);
  g.stroke();
  g.lineWidth = 1.5;
  g.beginPath();
  g.arc(0, 0, 90, 0, Math.PI * 2);
  g.stroke();
  // the sigil: a Z through three strokes, the ticks of a memo's 512 bytes round the ring
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(-32, -38);
  g.lineTo(32, -38);
  g.lineTo(-32, 38);
  g.lineTo(32, 38);
  g.moveTo(0, -56);
  g.lineTo(0, -38);
  g.moveTo(0, 38);
  g.lineTo(0, 56);
  g.stroke();
  g.lineWidth = 2;
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const r0 = i % 3 ? 80 : 74;
    g.beginPath();
    g.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
    g.lineTo(Math.cos(a) * 88, Math.sin(a) * 88);
    g.stroke();
  }
  runeTex = new THREE.CanvasTexture(c);
  runeTex.colorSpace = THREE.SRGBColorSpace;
  return runeTex;
}

let moteTex: THREE.Texture | null = null;
function moteTexture() {
  if (moteTex) return moteTex;
  const c = document.createElement("canvas");
  c.width = c.height = 32;
  const g = c.getContext("2d")!;
  const r = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  r.addColorStop(0, "rgba(255,230,180,1)");
  r.addColorStop(0.4, "rgba(255,150,50,0.6)");
  r.addColorStop(1, "rgba(255,120,0,0)");
  g.fillStyle = r;
  g.fillRect(0, 0, 32, 32);
  moteTex = new THREE.CanvasTexture(c);
  return moteTex;
}

interface Rune {
  mark: Mark;
  disc: THREE.Mesh;
  phase: number;
  /** Brightness from the likes (1 for none). */
  power: number;
}

/** The runes of one scene (the street, or the place you are in). */
class RuneSet {
  readonly group = new THREE.Group();
  readonly runes: Rune[] = [];
  private motes: THREE.Points;
  private mpos: Float32Array;
  private mlife: Float32Array;
  private mseed: Float32Array;

  constructor(private max = 120) {
    this.group.name = "marks";
    const n = max * MOTES;
    this.mpos = new Float32Array(n * 3);
    this.mlife = new Float32Array(n);
    this.mseed = new Float32Array(n).map(() => Math.random());
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(this.mpos, 3));
    this.motes = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ map: moteTexture(), size: 0.16, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, color: "#ffb060" }),
    );
    this.motes.frustumCulled = false;
    this.motes.raycast = () => {};
    this.group.add(this.motes);
  }

  set(marks: Mark[]) {
    for (const r of this.runes) {
      this.group.remove(r.disc);
      (r.disc.material as THREE.Material).dispose();
    }
    this.runes.length = 0;
    const geo = new THREE.PlaneGeometry(1.5, 1.5).rotateX(-Math.PI / 2);
    for (const m of marks.slice(0, this.max)) {
      const power = Math.min(2.2, 1 + Math.log2(1 + m.likes) * 0.35);
      // normal blending with a hot colour: it reads on bright marble as well as on night asphalt
      const mat = new THREE.MeshBasicMaterial({ map: runeTexture(), color: new THREE.Color(1.6, 1.15, 0.8), transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2 });
      const disc = new THREE.Mesh(geo, mat);
      disc.position.set(m.x, m.y + 0.04, m.z);
      disc.scale.setScalar(0.9 + 0.15 * power);
      disc.raycast = () => {};
      disc.renderOrder = 2;
      this.group.add(disc);
      this.runes.push({ mark: m, disc, phase: (m.id * 1.7) % 6.28, power });
    }
    this.mlife.fill(0);
    (this.motes.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }

  update(dt: number, t: number, eye: THREE.Vector3 | null) {
    for (const r of this.runes) {
      const k = 0.55 + 0.3 * Math.sin(t * 1.6 + r.phase) + 0.15 * Math.sin(t * 5.3 + r.phase * 2);
      (r.disc.material as THREE.MeshBasicMaterial).opacity = Math.min(1, k * (0.75 + 0.25 * r.power));
      r.disc.rotation.y = t * 0.12 + r.phase;
    }
    // motes rise from the runes near the eye
    const n = this.runes.length;
    for (let i = 0; i < n * MOTES; i++) {
      const r = this.runes[Math.floor(i / MOTES)];
      const o = i * 3;
      const near = !eye || r.disc.position.distanceToSquared(eye) < 900;
      if (this.mlife[i] <= 0) {
        if (!near || Math.random() > dt * 1.4 * r.power) {
          this.mpos[o + 1] = -9999;
          continue;
        }
        const a = this.mseed[i] * 6.28 + t;
        const rad = 0.15 + this.mseed[i] * 0.4;
        this.mpos[o] = r.disc.position.x + Math.cos(a) * rad;
        this.mpos[o + 1] = r.disc.position.y + 0.02;
        this.mpos[o + 2] = r.disc.position.z + Math.sin(a) * rad;
        this.mlife[i] = 1.6 + this.mseed[i];
      }
      this.mlife[i] -= dt;
      this.mpos[o + 1] += dt * (0.35 + this.mseed[i] * 0.3);
      this.mpos[o] += Math.sin(t * 2 + i) * dt * 0.05;
      if (this.mlife[i] <= 0) this.mpos[o + 1] = -9999;
    }
    for (let i = n * MOTES; i < this.max * MOTES; i++) this.mpos[i * 3 + 1] = -9999;
    (this.motes.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }

  nearest(p: THREE.Vector3, feetY: number): Mark | null {
    let best: Mark | null = null,
      bd = READ_DIST;
    for (const r of this.runes) {
      if (Math.abs(r.disc.position.y - feetY) > 1.2) continue;
      const d = Math.hypot(r.disc.position.x - p.x, r.disc.position.z - p.z);
      if (d < bd) (bd = d), (best = r.mark);
    }
    return best;
  }
}

export interface MarksHooks {
  /** Where the walker is: their eye, the place key ('street' outside) and floor, or null off foot. */
  walker(): { eye: THREE.Vector3; place: string; floor: number } | null;
  /** The scene of the place you are in (null on the street). */
  placeScene(): { key: string; scene: THREE.Scene } | null;
  read(m: Mark): void;
}

export class Marks {
  private all: Mark[] = [];
  private street = new RuneSet(160);
  private inside = new RuneSet(60);
  private insideKey = "";
  private insideFloor = -1;
  private prompt: HTMLButtonElement;
  private near: Mark | null = null;
  private scan = 0;
  private t = 0;

  constructor(
    scene: THREE.Scene,
    ui: HTMLElement,
    private hooks: MarksHooks,
  ) {
    scene.add(this.street.group);
    this.prompt = document.createElement("button");
    this.prompt.className = "talk-prompt mark-prompt hud";
    ui.append(this.prompt);
    this.prompt.addEventListener("click", () => this.near && hooks.read(this.near));
    window.addEventListener("keydown", (e) => {
      if (e.code !== "KeyE" || !this.near || (e.target as HTMLElement).closest?.("input,textarea")) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      hooks.read(this.near);
    }, true);
    void this.load();
  }

  async load() {
    const list = await StreetPay.marks();
    if (!list) return;
    this.all = list;
    this.street.set(list.filter((m) => m.place === "street"));
    this.insideFloor = -1;
  }

  /** A payment played: a new rune (or a like count) shows for everyone. */
  onPay(e: PayEvent) {
    if (e.action === "mark") void this.load();
  }

  /** A like or a report changed a rune. */
  onMark(e: { id: number; likes?: number; hidden?: boolean }) {
    const m = this.all.find((x) => x.id === e.id);
    if (!m) return;
    if (e.hidden) this.all = this.all.filter((x) => x.id !== e.id);
    else if (e.likes !== undefined) m.likes = e.likes;
    this.street.set(this.all.filter((x) => x.place === "street"));
    this.insideFloor = -1;
  }

  update(dt: number) {
    this.t += dt;
    const w = this.hooks.walker();
    const ps = this.hooks.placeScene();
    // the runes of the place you are in, on the floor you are on
    if (ps && w && (ps.key !== this.insideKey || w.floor !== this.insideFloor)) {
      this.inside.group.removeFromParent();
      this.insideKey = ps.key;
      this.insideFloor = w.floor;
      this.inside.set(this.all.filter((m) => m.place === ps.key && m.floor === w.floor));
      ps.scene.add(this.inside.group);
    } else if (!ps && this.insideKey) {
      this.inside.group.removeFromParent();
      this.insideKey = "";
    }
    const set = ps ? this.inside : this.street;
    set.update(dt, this.t, w?.eye ?? null);
    if ((this.scan -= dt) > 0) return;
    this.scan = 0.15;
    this.near = w ? set.nearest(w.eye, w.eye.y - 1.6) : null;
    if (!this.near) {
      this.prompt.classList.remove("on");
      return;
    }
    const text = this.near.text.length > 60 ? `${this.near.text.slice(0, 58)}…` : this.near.text;
    const html = `<q>${text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)}</q><span><kbd>E</kbd> read the message</span>`;
    if (this.prompt.innerHTML !== html) this.prompt.innerHTML = html;
    this.prompt.classList.add("on");
  }
}
