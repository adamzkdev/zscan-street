import * as THREE from "three";
import { API } from "../data/zscan";
import { CURB } from "./city";
import { loadArt, Snark } from "./snark";

/** What visitors can say: an emoji, by index (the server only relays the index). */
export const EMOJIS = ["👋", "🔥", "🚀", "🛡️", "😂", "❤️"];
/** Other visitors drawn at once, nearest first. */
const SHOWN = 40;

interface Other {
  s: Snark;
  avatar: number;
  target: THREE.Vector3;
  marker: THREE.Sprite;
  bubble: THREE.Sprite | null;
  emoji: number;
  seen: number;
}

/** Where this visitor is, for the others: a point on the map, on foot or not, or inside. */
export interface Here {
  x: number;
  z: number;
  mode: 0 | 1 | 2;
}

/**
 * The other people in the city, live: each one is their own zkSNARK (picked once, kept in this
 * browser), walking to wherever they are looking or standing, with a cyan marker over the head and
 * a bubble when they send an emoji. Presence goes through
 * the API's `/v1/street/presence` socket; nothing is stored, no text is ever exchanged.
 */
export class Visitors {
  private ws: WebSocket | null = null;
  private me = 0;
  private others = new Map<number, Other>();
  private loading = new Set<number>();
  private avatar: number;
  private lastSent = "";
  private sentAt = 0;
  private pendingEmoji: number | null = null;
  private count = 0;
  private markerMat: THREE.SpriteMaterial;

  constructor(
    private scene: THREE.Scene,
    ui: HTMLElement,
    private here: () => Here,
  ) {
    let a = 0;
    try {
      a = Number(localStorage.getItem("street.avatar")) || 0;
      if (!a) {
        a = 1 + Math.floor(Math.random() * 10000);
        localStorage.setItem("street.avatar", String(a));
      }
    } catch {
      a = 1 + Math.floor(Math.random() * 10000);
    }
    this.avatar = a;
    this.markerMat = new THREE.SpriteMaterial({ map: markerTexture(), toneMapped: false, depthWrite: false, transparent: true });
    this.connect();
  }

  private connect() {
    let retry = 3000;
    const open = () => {
      const ws = new WebSocket(API.replace(/^http/, "ws") + "/v1/street/presence");
      this.ws = ws;
      ws.onopen = () => {
        retry = 3000;
        this.lastSent = "";
      };
      ws.onmessage = (m) => {
        try {
          const msg = JSON.parse(m.data as string);
          if (msg.type === "hello") this.me = msg.id;
          else if (msg.type === "presence") this.onList(msg.n, msg.v);
        } catch {}
      };
      ws.onclose = () => {
        this.ws = null;
        setTimeout(open, retry);
        retry = Math.min(60_000, retry * 2);
      };
    };
    open();
  }

  private onList(n: number, list: [number, number, number, number, number, number][]) {
    this.count = n;
    const now = performance.now();
    const h = this.here();
    // the nearest ones out on the street (not inside a place), up to SHOWN
    const street = list
      .filter(([id, , , , mode]) => id !== this.me && mode !== 2)
      .sort((a, b) => (a[2] - h.x) ** 2 + (a[3] - h.z) ** 2 - ((b[2] - h.x) ** 2 + (b[3] - h.z) ** 2))
      .slice(0, SHOWN);
    for (const [id, avatar, x, z, , emoji] of street) {
      const o = this.others.get(id);
      if (o) {
        o.target.set(x, CURB, z);
        o.seen = now;
        if (emoji >= 0 && emoji !== o.emoji) this.say(o, emoji);
        o.emoji = emoji;
      } else if (!this.loading.has(id)) void this.add(id, avatar, x, z);
    }
    for (const [id, o] of this.others)
      if (now - o.seen > 2500) {
        this.scene.remove(o.s.root);
        this.others.delete(id);
      }
  }

  private async add(id: number, avatar: number, x: number, z: number) {
    this.loading.add(id);
    try {
      const s = new Snark(avatar, await loadArt(avatar));
      s.state = "resident";
      s.role = "Visitor";
      s.noClip = true;
      s.root.position.set(x, CURB, z);
      const marker = new THREE.Sprite(this.markerMat);
      marker.scale.set(0.32, 0.32, 1);
      marker.position.y = 1.55;
      s.root.add(marker);
      this.scene.add(s.root);
      this.others.set(id, { s, avatar, target: new THREE.Vector3(x, CURB, z), marker, bubble: null, emoji: -1, seen: performance.now() });
    } catch {}
    this.loading.delete(id);
  }

  private say(o: Other, emoji: number) {
    if (o.bubble) o.s.root.remove(o.bubble);
    const b = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTexture(emoji), toneMapped: false, depthWrite: false, transparent: true }));
    b.scale.set(0.75, 0.75, 1);
    b.position.y = 2.1;
    o.s.root.add(b);
    o.bubble = b;
    setTimeout(() => {
      if (o.bubble === b) {
        o.s.root.remove(b);
        o.bubble = null;
      }
    }, 3500);
  }

  update(dt: number, t: number, camQuat: THREE.Quaternion, camRight: THREE.Vector3) {
    // where I am, a few times a second (only when it changed, or with an emoji)
    const now = performance.now();
    if (this.ws?.readyState === WebSocket.OPEN && now - this.sentAt > 250) {
      const h = this.here();
      const msg: Record<string, number> = { a: this.avatar, x: Math.round(h.x * 10) / 10, z: Math.round(h.z * 10) / 10, m: h.mode };
      if (this.pendingEmoji !== null) msg.e = this.pendingEmoji;
      const text = JSON.stringify(msg);
      if (text !== this.lastSent || now - this.sentAt > 5000) {
        this.ws.send(text);
        this.lastSent = text;
        this.sentAt = now;
        this.pendingEmoji = null;
      }
    }
    for (const o of this.others.values()) {
      const p = o.s.root.position;
      const d = Math.hypot(o.target.x - p.x, o.target.z - p.z);
      // stroll there; jump if they are far (a camera that flew across the map)
      if (d > 25) p.copy(o.target);
      else if (d > 0.35 && !o.s.isWalking) void o.s.walk([o.target.clone()], Math.min(4, 1.4 + d * 0.4));
      o.s.update(dt, t, camQuat, camRight);
      o.marker.position.y = 1.55 + Math.sin(t * 3 + o.avatar) * 0.05;
    }
  }

  get others_count() {
    return this.count;
  }
}

function markerTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  g.translate(32, 32);
  g.rotate(Math.PI / 4);
  g.shadowColor = "#3ef0ff";
  g.shadowBlur = 12;
  g.fillStyle = "#3ef0ff";
  g.fillRect(-12, -12, 24, 24);
  return new THREE.CanvasTexture(c);
}

const emojiCache = new Map<number, THREE.Texture>();
function emojiTexture(i: number) {
  let t = emojiCache.get(i);
  if (!t) {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const g = c.getContext("2d")!;
    g.fillStyle = "rgba(255,255,255,0.95)";
    g.beginPath();
    g.arc(64, 60, 52, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.moveTo(52, 104);
    g.lineTo(64, 124);
    g.lineTo(76, 104);
    g.fill();
    g.font = '64px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(EMOJIS[i], 64, 64);
    t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    emojiCache.set(i, t);
  }
  return t;
}
