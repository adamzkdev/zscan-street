import * as THREE from "three";
import { ZScan } from "../data/zscan";
import { Purge, type PApp } from "../interior/museum/purge";
import { ST } from "../scene/city/plan";
import type { Decor } from "../scene/decor";
import { loadArt, poseCell, Snark } from "../scene/snark";
import { FLASH_CELL } from "../scene/sprites";
import type { MailKind } from "./ui";

/** The parades, New York time (the audience is American): noon and 8 PM. */
const TIMES_NY = [12, 20];
/** How long the walk down the red carpet takes (seconds). */
const DURATION = 300;
/** Barriers and the crowd are out this long before (seconds); the road closes 2 minutes before. */
const SETUP = 15 * 60;
const CLOSE = 2 * 60;
/** The route: the north boulevard, west to east, ending at the Shibuya scramble (x −54) and past it. */
const ROUTE = { z: ST.blvdN, x0: -112, x1: -2, half: 7 };
/** The star walks at this pace (m/s): the whole carpet in DURATION. */
const PACE = (ROUTE.x1 - ROUTE.x0 - 10) / DURATION;
/** Spectators along the barriers, by quality tier (two rows deep). */
const CROWD = [120, 96, 70, 44, 24];
const MAILED = "zstreet.parade.mailed";

/** UTC ms of a wall-clock time in New York on the NY calendar day of `ref`. */
function nyAt(ref: number, hour: number): number {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(ref).map((p) => [p.type, p.value]));
  const guess = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), hour);
  // New York's offset at that moment ("GMT-4" / "GMT-5")
  const off = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", timeZoneName: "shortOffset" }).formatToParts(guess).find((p) => p.type === "timeZoneName")?.value ?? "GMT-5";
  const h = Number(off.replace("GMT", "") || "0");
  return guess - h * 3600_000;
}
/** The NY calendar day number, so everyone gets the same star the same day. */
function nyDay(ref: number) {
  const d = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(ref);
  return Math.floor(Date.parse(`${d}T00:00:00Z`) / 86400_000);
}
const local = (t: number) => new Date(t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const hash = (a: number, b: number) => {
  const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return x - Math.floor(x);
};

export interface ParadeHooks {
  decor: Decor;
  mail(kind: MailKind, title: string, text: string, act?: { label: string; fn: () => void }): void;
  /** Point the camera at (x, z). */
  go(x: number, z: number, zoom?: number): void;
  /** Keep the camera on a character (the star on the carpet). */
  follow(s: Snark): void;
  /** The road is closed: cars stop where these points stand. */
  closeRoad(points: { x: number; z: number }[] | null): void;
  /** Quality tier (0 best): how many spectators to load. */
  tier: number;
}

interface Flash {
  m: THREE.Mesh;
  s: Snark;
  next: number;
  off: number;
}

/**
 * The daily star parade. Twice a day (noon and 8 PM New York time) the Apparition of the day, one of
 * the 26 that the zkSNARKs purge revealed, walks the red carpet down the north boulevard to the
 * Shibuya scramble like a celebrity: the road closes, barriers go up, and a crowd two rows deep
 * lines both pavements, phones held up over the heads, flashes going off as the star passes (the
 * front row's photographers fire in bursts), a few turning their back for a selfie with the star
 * behind. A float with the star's name leads the way, two bodyguards flank it, and behind march the
 * 26 zkSNARKs that were purged to make it appear. Confetti falls round the star. The LED screens
 * count down from 15 minutes; the inbox gets the day's programme and a "Watch" letter. `?parade=now`
 * (or `?parade=soon`) rehearses it.
 */
export class Parade {
  readonly group = new THREE.Group();
  private purge = new Purge();
  private star: PApp | null = null;
  private start = 0;
  private built = false;
  private live = false;
  private closed = false;
  private calledIn = false;
  float: THREE.Group | null = null;
  starSnark: Snark | null = null;
  private guards: Snark[] = [];
  private escort: Snark[] = [];
  private crowd: Snark[] = [];
  private flashes: Flash[] = [];
  private confetti: THREE.InstancedMesh | null = null;
  private conf: { p: THREE.Vector3; v: THREE.Vector3; r: number }[] = [];
  private lastCall = -1;
  private t = 0;
  private override = new URLSearchParams(location.search).get("parade");
  private camQuat = new THREE.Quaternion();
  private camRight = new THREE.Vector3();
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private v = new THREE.Vector3();

  constructor(
    scene: THREE.Scene,
    private o: ParadeHooks,
  ) {
    scene.add(this.group);
    this.group.visible = false;
    void this.purge.ready.then(() => {
      this.schedule();
      this.morningMail();
    });
  }

  /** The next parade (or the one running). */
  private schedule() {
    const now = Date.now();
    if (this.override === "now") this.start = now + 20_000;
    else if (this.override === "soon") this.start = now + 3 * 60_000;
    else {
      const slots = [-1, 0, 1].flatMap((d) => TIMES_NY.map((h) => nyAt(now + d * 86400_000, h))).sort((a, b) => a - b);
      this.start = slots.find((s) => s + DURATION * 1000 > now) ?? slots[slots.length - 1];
    }
    this.override = null;
    const apps = this.purge.apps;
    this.star = apps.length ? apps[nyDay(this.start) % apps.length] : null;
  }

  /** The day's programme, once a day, in the inbox (the NEWS square). */
  private morningMail() {
    const day = String(nyDay(Date.now()));
    try {
      if (localStorage.getItem(MAILED) === day) return;
      localStorage.setItem(MAILED, day);
    } catch {}
    if (!this.star) return;
    const today = TIMES_NY.map((h) => nyAt(Date.now(), h));
    const lines = today.map((t, i) => `${local(t)} · ${i ? "the evening parade" : "the noon parade"}${t + DURATION * 1000 < Date.now() ? " (done)" : ""}`).join("\n");
    this.o.mail("event", `Today in ZStreet: ${this.star.name} walks the red carpet`, `${this.star.name}, today's star, walks the red carpet down the north boulevard to the Shibuya scramble, followed by the 26 zkSNARKs purged to make it appear.\n${lines}\nThe road closes 2 minutes before; get a spot by the barriers.`, { label: "Go there", fn: () => this.watch() });
  }

  /** The camera on the star once it's out, else on the carpet by the scramble. */
  watch() {
    if (this.starSnark && this.live) this.o.follow(this.starSnark);
    else this.o.go(ROUTE.x0 + 30, ROUTE.z + 10, 0.8);
  }

  /** Seconds to the start (negative once it has started), or null before the schedule is known. */
  get eta() {
    return this.start ? (this.start - Date.now()) / 1000 : null;
  }

  update(dt: number, camera: THREE.Camera) {
    this.t += dt;
    if (!this.start || !this.star) return;
    const eta = (this.start - Date.now()) / 1000;
    const since = -eta;
    // the LED screens count down every 3 minutes, then each of the last 3
    if (eta > 0 && eta < SETUP) {
      const call = eta > 180 ? Math.ceil(eta / 180) * 3 : Math.ceil(eta / 60);
      if (call !== this.lastCall) {
        this.lastCall = call;
        this.o.decor.alert({ kind: "game", title: "PARADE · パレード", big: `IN ${Math.ceil(eta / 60)} MIN`, line: `${this.star.name.toUpperCase()} · RED CARPET · SHIBUYA`, color: "#ff3e8a" });
      }
      if (!this.calledIn) {
        this.calledIn = true;
        this.o.mail("event", `The red carpet at ${local(this.start)}`, `${this.star.name} walks the red carpet down the north boulevard in ${Math.ceil(eta / 60)} minutes, to the Shibuya scramble, with its bodyguards and the 26 zkSNARKs purged to make it appear. The road closes 2 minutes before.`, { label: "Watch", fn: () => this.watch() });
      }
    }
    const setup = eta < SETUP && since < DURATION + 60;
    if (setup && !this.built) void this.build();
    if (!setup && this.built) {
      this.teardown();
      this.schedule();
      return;
    }
    const close = eta < CLOSE && since < DURATION + 60;
    if (close !== this.closed) {
      this.closed = close;
      this.o.closeRoad(close ? this.roadblock() : null);
    }
    if (!this.built) return;
    camera.getWorldQuaternion(this.camQuat);
    this.camRight.set(1, 0, 0).applyQuaternion(this.camQuat);

    // off they go: everyone walks the carpet at the same pace
    if (since >= 0 && !this.live) {
      this.live = true;
      this.o.decor.alert({ kind: "game", title: "NOW · LIVE", big: "RED CARPET", line: `${this.star.name.toUpperCase()} · NORTH BOULEVARD`, color: "#ff3e8a" });
      const end = ROUTE.x1 + 4;
      for (const s of [this.starSnark, ...this.guards, ...this.escort]) {
        if (!s) continue;
        void s.walk([new THREE.Vector3(end + (s.root.position.x - ROUTE.x0), 0, s.root.position.z)], PACE);
      }
    }
    const sx = this.starSnark?.root.position.x ?? ROUTE.x0;
    const on = since > -25 && since < DURATION + 40;
    if (this.float) {
      this.float.position.set(sx + 9, 0, ROUTE.z);
      this.float.visible = on;
    }
    for (const s of [this.starSnark, ...this.guards, ...this.escort]) {
      if (!s) continue;
      s.root.visible = on;
      s.update(dt, this.t, this.camQuat, this.camRight);
    }
    // the crowd turns to the star as it comes, phones up; the flashes go off round it
    const passing = this.live && since < DURATION;
    for (const s of this.crowd) {
      const dx = sx - s.root.position.x;
      if (passing && Math.abs(dx) < 30 && s.carry !== "selfie") s.faceDir = this.v.set(dx, 0, ROUTE.z - s.root.position.z).normalize().clone();
      s.update(dt, this.t, this.camQuat, this.camRight);
    }
    for (const f of this.flashes) {
      const d = Math.abs(f.s.root.position.x - sx);
      const near = passing && d < 22;
      if (near && this.t > f.next) {
        f.off = this.t + 0.07;
        // the closer the star, the faster they fire; front-row photographers shoot in bursts
        const burst = f.s.role === "Photographer" && Math.random() < 0.6;
        f.next = this.t + (burst ? 0.16 : 0.5 + (d / 22) * 3 + Math.random() * 1.5);
      }
      f.m.visible = this.t < f.off;
      if (f.m.visible) f.m.scale.setScalar(0.7 + (f.off - this.t) * 6);
    }
    this.updateConfetti(dt, sx, passing);
  }

  /** Points across both lanes, every 3 m, where cars stop. */
  private roadblock() {
    const pts: { x: number; z: number }[] = [];
    for (let x = ROUTE.x0 - 6; x <= ROUTE.x1 + 6; x += 3) for (const dz of [-5, -2.5, 0, 2.5, 5]) pts.push({ x, z: ROUTE.z + dz });
    return pts;
  }

  private async snark(id: number, role: string) {
    const s = new Snark(id, await loadArt(id));
    s.noClip = true;
    s.state = "resident";
    s.role = role;
    return s;
  }

  private async build() {
    this.built = true;
    this.live = false;
    this.group.visible = true;
    const star = this.star!;
    const len = ROUTE.x1 - ROUTE.x0 + 10;
    const mid = (ROUTE.x0 + ROUTE.x1) / 2;
    // red carpet down the middle, gold edges, chrome barriers along both kerbs
    const carpet = new THREE.Mesh(new THREE.PlaneGeometry(len, 3.4), new THREE.MeshStandardMaterial({ color: "#a3122a", roughness: 0.9 }));
    carpet.rotation.x = -Math.PI / 2;
    carpet.position.set(mid, 0.025, ROUTE.z);
    this.group.add(carpet);
    for (const side of [-1, 1]) {
      const edge = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.12), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.6, 0.4), toneMapped: false }));
      edge.rotation.x = -Math.PI / 2;
      edge.position.set(mid, 0.03, ROUTE.z + side * 1.76);
      this.group.add(edge);
    }
    const n = Math.floor(len / 2.2);
    const barrier = new THREE.InstancedMesh(new THREE.BoxGeometry(2, 1, 0.08), new THREE.MeshStandardMaterial({ color: "#c9ced6", metalness: 0.8, roughness: 0.35 }), n * 2);
    let i = 0;
    for (const side of [-1, 1])
      for (let j = 0; j < n; j++) {
        this.m.makeTranslation(ROUTE.x0 - 5 + 1.1 + j * 2.2, 0.7, ROUTE.z + side * (ROUTE.half - 0.4));
        barrier.setMatrixAt(i++, this.m);
      }
    this.group.add(barrier);

    // the lead float: a low stage in neon and gold with the star's name, ahead of the walkers
    const f = new THREE.Group();
    const stage = new THREE.Mesh(new THREE.BoxGeometry(5, 0.9, 2.6), new THREE.MeshStandardMaterial({ color: "#16141c", metalness: 0.6, roughness: 0.35 }));
    stage.position.y = 0.75;
    f.add(stage);
    const skirt = new THREE.Mesh(new THREE.BoxGeometry(5.1, 0.35, 2.7), new THREE.MeshStandardMaterial({ color: "#a3122a", roughness: 0.8 }));
    skirt.position.y = 0.2;
    f.add(skirt);
    for (const s of [-1, 1]) {
      const tube = new THREE.Mesh(new THREE.BoxGeometry(5.05, 0.05, 0.05), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.6, 1.6), toneMapped: false }));
      tube.position.set(0, 1.22, s * 1.3);
      f.add(tube);
    }
    // the star's name on both sides, for the crowd along the barriers
    for (const s of [-1, 1]) {
      const banner = this.banner(star.name);
      banner.position.set(0, 2.1, s * 0.02);
      banner.rotation.y = s > 0 ? 0 : Math.PI;
      f.add(banner);
    }
    for (const s of [-1, 1]) {
      const spot = new THREE.PointLight("#ffd9f0", 10, 12, 1.6);
      spot.position.set(-6, 5, s * 2.5);
      f.add(spot);
    }
    f.visible = false;
    this.group.add(f);
    this.float = f;

    this.confetti = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.1, 0.07), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: false }), 400);
    this.confetti.frustumCulled = false;
    const cols = ["#ff3e8a", "#f4b728", "#3ef0c8", "#ffffff", "#b07bff"];
    for (let c = 0; c < 400; c++) {
      this.confetti.setColorAt(c, new THREE.Color(cols[c % cols.length]).multiplyScalar(1.6));
      this.conf.push({ p: new THREE.Vector3(0, -50, 0), v: new THREE.Vector3(), r: Math.random() * 6 });
    }
    this.group.add(this.confetti);

    // the star (life size, a touch taller), its two bodyguards, the 26 behind
    const at = (x: number, z: number, s: Snark) => {
      s.root.position.set(x, 0, z);
      s.faceDir = new THREE.Vector3(1, 0, 0);
      s.root.visible = false;
      this.group.add(s.root);
    };
    try {
      const s = await this.snark(star.item, "Today's star");
      s.setScale(1.25);
      s.emote("star", 9999);
      at(ROUTE.x0 + 2, ROUTE.z, s);
      this.starSnark = s;
    } catch {}
    try {
      const rare = (await ZScan.rarest(6)).map((r) => r.id).filter((id) => id !== star.item).slice(0, 2);
      for (const [k, id] of rare.entries()) {
        const g = await this.snark(id, "Bodyguard");
        g.setCap("#111111");
        at(ROUTE.x0 + 1.2, ROUTE.z + (k ? 1.3 : -1.3), g);
        this.guards.push(g);
      }
    } catch {}
    const purged = this.purge.of(star).slice(0, 26);
    await Promise.all(
      purged.map(async (p, k) => {
        try {
          const s = await this.snark(p.item, "Purged for the star");
          if (!this.built) return;
          at(ROUTE.x0 - 2 - Math.floor(k / 2) * 1.4, ROUTE.z + (k % 2 ? 0.7 : -0.7), s);
          this.escort.push(s);
        } catch {}
      }),
    );

    // the crowd: two rows deep behind the barriers on both sides, nearly every phone up
    const count = CROWD[Math.min(CROWD.length - 1, this.o.tier)] ?? 40;
    const flashGeo = new THREE.PlaneGeometry(0.9, 0.9);
    const flashMat = new THREE.MeshBasicMaterial({ map: flashTexture(), color: new THREE.Color(2.2, 2.2, 2.4), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const day = nyDay(this.start);
    const perRow = Math.ceil(count / 4);
    const spots = Array.from({ length: count }, (_, c) => {
      const side = c % 2 ? 1 : -1;
      const row = Math.floor(c / 2) % 2; // front row, back row
      const slot = Math.floor(c / 4);
      const x = ROUTE.x0 + ((slot + 0.2 + hash(c, day) * 0.6) / perRow) * (ROUTE.x1 - ROUTE.x0);
      return { c, side, row, x, z: ROUTE.z + side * (ROUTE.half + 0.45 + row * 0.75 + hash(c, 3) * 0.2) };
    });
    // a few at a time, so the browser keeps up
    for (let k = 0; k < spots.length; k += 8) {
      if (!this.built) return;
      await Promise.all(
        spots.slice(k, k + 8).map(async (sp) => {
          const id = 1 + Math.floor(hash(sp.c, day + 7) * 9999);
          try {
            const front = sp.row === 0;
            const s = await this.snark(id, front && sp.c % 3 === 0 ? "Photographer" : "Fan");
            if (!this.built) return;
            s.root.position.set(sp.x, 0.2, sp.z);
            s.faceDir = new THREE.Vector3(0, 0, -sp.side);
            // nearly everyone films; one in seven turns round for a selfie with the star behind
            const kind = sp.c % 7 === 3 ? "selfie" : sp.c % 9 === 5 ? null : "snap";
            if (kind) {
              s.carry = kind;
              s.redrawHold();
              if (kind === "selfie") s.faceDir = new THREE.Vector3(0, 0, sp.side);
              const cell = FLASH_CELL[kind];
              if (cell) {
                const fl = new THREE.Mesh(flashGeo, flashMat);
                fl.position.copy(poseCell(cell[0], cell[1])).setZ(0.06);
                fl.visible = false;
                fl.raycast = () => {};
                s.attachToHold(fl);
                this.flashes.push({ m: fl, s, next: hash(sp.c, 11) * 3, off: 0 });
              }
            } else s.emote("heart", 9999);
            this.group.add(s.root);
            this.crowd.push(s);
          } catch {}
        }),
      );
    }
  }

  private banner(name: string) {
    const c = document.createElement("canvas");
    c.width = 1024;
    c.height = 192;
    const g = c.getContext("2d")!;
    g.fillStyle = "#0b0a10";
    g.fillRect(0, 0, 1024, 192);
    g.strokeStyle = "#f4b728";
    g.lineWidth = 6;
    g.strokeRect(6, 6, 1012, 180);
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillStyle = "#ff3e8a";
    g.font = '800 44px "JetBrains Mono", Menlo, monospace';
    g.fillText("TODAY'S STAR · 今日のスター", 512, 56);
    g.fillStyle = "#ffffff";
    g.font = '900 80px "JetBrains Mono", Menlo, monospace';
    g.fillText(name.toUpperCase(), 512, 132, 980);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return new THREE.Mesh(new THREE.PlaneGeometry(4.6, 0.86), new THREE.MeshBasicMaterial({ map: t, toneMapped: false, color: new THREE.Color(1.15, 1.15, 1.15) }));
  }

  /** Confetti falling round the star while it walks. */
  private updateConfetti(dt: number, x: number, on: boolean) {
    const C = this.confetti;
    if (!C) return;
    for (let i = 0; i < this.conf.length; i++) {
      const c = this.conf[i];
      if (c.p.y < 0) {
        if (!on || Math.random() > 0.08) {
          this.m.makeTranslation(0, -50, 0);
          C.setMatrixAt(i, this.m);
          continue;
        }
        c.p.set(x + (Math.random() - 0.5) * 22, 7 + Math.random() * 4, ROUTE.z + (Math.random() - 0.5) * 14);
        c.v.set((Math.random() - 0.5) * 0.8, -1.1 - Math.random() * 0.6, (Math.random() - 0.5) * 0.8);
      }
      c.p.addScaledVector(c.v, dt);
      c.r += dt * 4;
      this.q.setFromEuler(new THREE.Euler(c.r, c.r * 0.7, 0));
      this.m.compose(c.p, this.q, new THREE.Vector3(1, 1, 1));
      C.setMatrixAt(i, this.m);
    }
    C.instanceMatrix.needsUpdate = true;
  }

  private teardown() {
    this.built = false;
    this.live = false;
    this.group.visible = false;
    for (const o of [...this.group.children]) this.group.remove(o);
    this.float = null;
    this.starSnark = null;
    this.guards = [];
    this.escort = [];
    this.crowd = [];
    this.flashes = [];
    this.confetti = null;
    this.conf = [];
    this.lastCall = -1;
    this.calledIn = false;
  }
}

function flashTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, "rgba(255,255,255,1)");
  r.addColorStop(0.12, "rgba(255,255,250,0.9)");
  r.addColorStop(0.35, "rgba(255,250,235,0.25)");
  r.addColorStop(1, "rgba(255,250,235,0)");
  g.fillStyle = r;
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = "rgba(255,255,255,0.5)";
  g.fillRect(62, 8, 4, 112);
  g.fillRect(8, 62, 112, 4);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
