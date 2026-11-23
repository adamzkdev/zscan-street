import * as THREE from "three";
import { makeSnarkBody, type SnarkBody } from "../scene/snarkbody";
import { sharedObject } from "../scene/voxel/mesher";
import { policeModel, sedanModel, taxiModel, truckModel } from "../scene/voxel/vehicles";
import { BODY_SCALE } from "./foot";
import { gtModel } from "./models";

/**
 * The shared city (src/gta): everyone playing ZStreet at once, in one world (worker/world.ts).
 * A few times a second the page says where its zkSNARK is (on foot or in which car, how fast);
 * the others come back the same way and are drawn a moment behind (so their motion is smooth):
 * their zkSNARK in voxels, or their car, a tag with their number over them. No names, no accounts:
 * a number and a place. Off with `?solo`.
 */

export interface MyState {
  x: number;
  y: number;
  z: number;
  /** Heading, the walker's convention (0 = toward −z). */
  h: number;
  /** The car's kind, or "" on foot. */
  c: string;
  v: number;
  /** The zkSNARK played. */
  s: number;
}

interface Snap {
  t: number;
  x: number;
  y: number;
  z: number;
  h: number;
  v: number;
}

interface Peer {
  id: string;
  s: number;
  c: string;
  root: THREE.Group;
  body: SnarkBody | null;
  car: THREE.Object3D | null;
  tag: THREE.Sprite;
  snaps: Snap[];
  seen: number;
}

/** How far behind the others are drawn (ms): two of their updates. */
const DELAY = 260;
const SEND_EVERY = 0.125;

function tagSprite(text: string) {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 64;
  const g = c.getContext("2d")!;
  g.fillStyle = "rgba(9,11,15,0.78)";
  g.beginPath();
  g.roundRect(8, 10, 240, 44, 22);
  g.fill();
  g.fillStyle = "#f4b728";
  g.beginPath();
  g.arc(34, 32, 8, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#f3f4f1";
  g.font = "800 26px Archivo, Roboto, sans-serif";
  g.textBaseline = "middle";
  g.fillText(text, 52, 33);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthWrite: false, transparent: true, toneMapped: false }));
  s.scale.set(1.6, 0.4, 1);
  s.renderOrder = 5;
  return s;
}

function carOf(kind: string) {
  if (kind === "gt") return sharedObject("gta:gt", () => gtModel());
  if (kind === "taxi") return sharedObject("traffic:taxi", () => taxiModel());
  if (kind === "police") return sharedObject("traffic:police", () => policeModel());
  if (kind === "truck") return sharedObject("traffic:truck:0:proof", () => truckModel("#e8e4dc", "proof"));
  return sharedObject("traffic:sedan:0", () => sedanModel("#c8ccd4", "#3ef0ff"));
}

export class WorldNet {
  readonly group = new THREE.Group();
  private ws: WebSocket | null = null;
  private peers = new Map<string, Peer>();
  private sendT = 0;
  private tries = 0;
  private world = 1;
  private wanted = false;
  myId = "";
  /** People in this world, you included (as the world said when you came in, then counted). */
  get count() {
    return this.ws?.readyState === WebSocket.OPEN ? this.peers.size + 1 : 0;
  }
  readonly enabled = typeof location !== "undefined" && !new URLSearchParams(location.search).has("solo");

  constructor(scene: THREE.Scene) {
    this.group.name = "gta:others";
    scene.add(this.group);
  }

  /** In (the game started) or out. */
  join(on: boolean) {
    this.wanted = on && this.enabled;
    this.group.visible = on;
    if (this.wanted && !this.ws) this.connect();
    if (!this.wanted && this.ws) {
      this.ws.close();
      this.ws = null;
      for (const p of [...this.peers.values()]) this.drop(p);
    }
  }

  private connect() {
    if (!this.wanted) return;
    const url = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/world/street${this.world > 1 ? `-${this.world}` : ""}`;
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch {
      return this.retry();
    }
    this.ws = ws;
    ws.onmessage = (e) => this.message(String(e.data));
    ws.onopen = () => (this.tries = 0);
    ws.onclose = (e) => {
      if (this.ws !== ws) return;
      this.ws = null;
      for (const p of [...this.peers.values()]) this.drop(p);
      // full (the world answered 503: the socket never opened): the next world
      if (e.code === 1006 && this.tries === 0 && this.world < 8) this.world++;
      this.retry();
    };
  }

  private retry() {
    if (!this.wanted) return;
    const wait = [500, 2000, 5000, 10000, 30000][Math.min(4, this.tries++)];
    setTimeout(() => !this.ws && this.connect(), wait);
  }

  private message(line: string) {
    let m: Record<string, unknown>;
    try {
      m = JSON.parse(line);
    } catch {
      return;
    }
    if (m.t === "hi") {
      this.myId = String(m.id);
      return;
    }
    const id = typeof m.id === "string" ? m.id : "";
    if (!id) return;
    if (m.gone) {
      const p = this.peers.get(id);
      if (p) this.drop(p);
      return;
    }
    const num = (k: string) => (typeof m[k] === "number" ? (m[k] as number) : 0);
    const s = Math.max(1, Math.min(10000, Math.round(num("s")) || 1));
    const c = typeof m.c === "string" ? m.c : "";
    let p = this.peers.get(id);
    if (!p || p.s !== s) {
      if (p) this.drop(p);
      const root = new THREE.Group();
      const tag = tagSprite(`#${s}`);
      root.add(tag);
      this.group.add(root);
      p = { id, s, c: "", root, body: null, car: null, tag, snaps: [], seen: 0 };
      this.peers.set(id, p);
    }
    if (p.c !== c || (!p.body && !p.car)) this.dress(p, c);
    p.seen = performance.now();
    p.snaps.push({ t: p.seen, x: num("x"), y: num("y"), z: num("z"), h: num("h"), v: num("v") });
    if (p.snaps.length > 8) p.snaps.shift();
  }

  /** On foot: its zkSNARK; in a car: the car. */
  private dress(p: Peer, c: string) {
    p.c = c;
    if (p.car) (p.root.remove(p.car), (p.car = null));
    if (c) {
      p.body?.dispose();
      p.body = null;
      const g = new THREE.Group();
      const m = carOf(c);
      g.add(m);
      p.car = g;
      p.root.add(g);
      p.tag.position.y = 2.6;
    } else {
      if (!p.body) {
        const b = makeSnarkBody(p.s);
        b.root.scale.setScalar(BODY_SCALE);
        p.body = b;
        p.root.add(b.root);
      }
      p.tag.position.y = 2.15;
    }
  }

  private drop(p: Peer) {
    p.body?.dispose();
    p.root.removeFromParent();
    (p.tag.material as THREE.SpriteMaterial).map?.dispose();
    p.tag.material.dispose();
    this.peers.delete(p.id);
  }

  /** Each frame: say where you are (now and then), draw the others. */
  update(dt: number, me: MyState | null) {
    if (!this.wanted) return;
    this.sendT -= dt;
    if (me && this.sendT <= 0 && this.ws?.readyState === WebSocket.OPEN) {
      this.sendT = SEND_EVERY;
      this.ws.send(JSON.stringify(me));
    }
    const now = performance.now();
    const at = now - DELAY;
    for (const p of [...this.peers.values()]) {
      if (now - p.seen > 8000) {
        this.drop(p);
        continue;
      }
      // between the two snapshots round `at` (or the last one)
      const S = p.snaps;
      let a = S[S.length - 1],
        b = a;
      for (let i = S.length - 1; i > 0; i--)
        if (S[i - 1].t <= at) {
          a = S[i - 1];
          b = S[i];
          break;
        }
      const k = b.t > a.t ? Math.min(1, Math.max(0, (at - a.t) / (b.t - a.t))) : 1;
      let dh = b.h - a.h;
      dh = Math.atan2(Math.sin(dh), Math.cos(dh));
      const h = a.h + dh * k;
      p.root.position.set(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k, a.z + (b.z - a.z) * k);
      if (p.car) p.car.rotation.y = h + Math.PI / 2;
      if (p.body) {
        p.body.root.rotation.y = h + Math.PI;
        p.body.update(dt, { speed: (a.v + (b.v - a.v) * k) / BODY_SCALE, grounded: true, heading: h });
      }
    }
  }

  /** The others, for the maps and the collisions. */
  *others(): Generator<{ x: number; z: number; car: boolean; yaw: number }> {
    for (const p of this.peers.values()) yield { x: p.root.position.x, z: p.root.position.z, car: !!p.car, yaw: p.car ? p.car.rotation.y : 0 };
  }
}
