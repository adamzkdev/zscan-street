import * as THREE from "three";
import { live, type LiveSource, type LiveSpec } from "../../audio/live";
import { Snark, loadArt } from "../../scene/snark";
import { type Kind, type Rig, rig, tutu } from "./instruments";

/**
 * Live musicians for the places: zkSNARKs holding real voxel instruments (./instruments.ts) with
 * arms that reach them, playing in time with a real recording heard from where they stand
 * (src/audio/live.ts: positional, louder near, duller far). A pianist at the lobby's grand piano,
 * a jazz trio, a violinist between the tables, a saxophone on a roof, and the Opera's soloists and
 * dancers.
 *
 * A band animates itself: an invisible mesh in its group is drawn every frame its floor is shown,
 * and its `onBeforeRender` (which has the camera) turns the players to the viewer and moves their
 * hands. The place only adds the band's group to its floor.
 *
 * The zkSNARKs are paper cut-outs that always face the viewer; their own pixel arms hang at their
 * sides, so a player's are hidden and drawn here instead: shoulder (on the cut-out) to elbow to the
 * hand on the instrument (in the world), so the hands stay on the keys from any side.
 */

/** Pixel size of a zkSNARK (snark.ts: BODY 1.75 m over 26 cells) and its shoulders on the portrait grid. */
const PX = 1.75 / 26;
const SHOULDER_Y = 12 * PX;
const SHOULDER_NEAR = 8.5 * PX,
  SHOULDER_FAR = -6.5 * PX;
/** The bust's centre is drawn right of the cut-out's middle (snark.ts BUST_X). */
const BUST_X = 2.5 * PX;

interface SnarkInternals {
  armFront?: THREE.Object3D;
  armBack?: THREE.Object3D;
  cloth?: string;
  skin?: string;
}

export interface PlayerOpts {
  /** zkSNARK id (its portrait). */
  id: number;
  /** Where its feet are (the seat's height when seated), in the band's group. */
  x: number;
  y: number;
  z: number;
  /** Which way it faces (radians about y; 0 faces +z). */
  yaw?: number;
  /** Scale (1 = the street's size; the orchestra plays at 0.78). */
  k?: number;
  role?: string;
  /** Seated players: the seat's height over the floor (feet on the floor). */
  seatH?: number;
  /** Arms hang free and the instrument is hidden (between pieces, taking a bow). */
  resting?: boolean;
}

export class Player {
  readonly frame = new THREE.Group();
  readonly rig: Rig;
  snark: Snark | null = null;
  /** 0..1: how much it plays (the arms reach the instrument), eased. */
  private on = 1;
  resting = false;
  /** Bowing (0..1): the whole body dips forward. */
  bowing = 0;
  /** Seat height over the floor (seated players), and the cut-out's own offset once seated. */
  private seatH: number;
  private baseVY = 0;
  /** Hopping (ballet): metres off the floor. */
  lift = 0;
  private arms: THREE.Mesh[] = [];
  private fists: THREE.Mesh[] = [];
  private base = new THREE.Vector3();
  readonly yaw: number;
  readonly k: number;
  private ph = Math.random() * 10;
  private tut: THREE.Object3D | null = null;

  constructor(readonly band: Band, readonly kind: Kind, o: PlayerOpts) {
    this.k = o.k ?? 1;
    this.yaw = o.yaw ?? 0;
    this.seatH = o.seatH ?? 0.45;
    this.resting = !!o.resting;
    this.on = this.resting ? 0 : 1;
    this.rig = rig(kind, this.k);
    this.base.set(o.x, o.y, o.z);
    this.frame.position.copy(this.base);
    this.frame.rotation.y = this.yaw;
    this.frame.add(this.rig.obj);
    band.group.add(this.frame);
    if (kind === "ballet") {
      this.tut = tutu(this.k);
      this.tut.position.y = 0.5 * this.k;
      this.frame.add(this.tut);
    }
    // the instrument waits for its player (the portraits API can be busy: a few retries)
    this.frame.visible = false;
    let tries = 0;
    const load = () =>
      void loadArt(o.id)
        .then((art) => this.arrive(art, o, band))
        .catch(() => {
          if (++tries < 6) setTimeout(load, 6000 + Math.random() * 8000 * tries);
        });
    load();
  }

  private arrive(art: Awaited<ReturnType<typeof loadArt>>, o: PlayerOpts, band: Band) {
    const s = new Snark(o.id, art);
    s.noClip = true;
    s.state = "resident";
    s.role = o.role ?? null;
    s.faceDir = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    // seated players sit on their bench or throne (the root on the seat, shins down to the floor)
    s.setScale(this.k);
    if (this.rig.sit) s.sit(true, this.seatH);
    this.baseVY = s.visual.position.y;
    s.root.position.copy(this.base);
    const inner = s as unknown as SnarkInternals;
    // its own arms give way to the ones drawn here
    if (inner.armFront) inner.armFront.visible = false;
    if (inner.armBack) inner.armBack.visible = false;
    const sleeve = new THREE.MeshBasicMaterial({ color: inner.cloth ?? "#3a3848" });
    const skin = new THREE.MeshBasicMaterial({ color: inner.skin ?? inner.cloth ?? "#e8c8a0" });
    const seg = new THREE.BoxGeometry(1, 1, 1).translate(0, 0, 0.5);
    const fist = new THREE.BoxGeometry(1, 1, 1);
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(seg, sleeve);
      m.raycast = () => {};
      this.arms.push(m);
      band.group.add(m);
    }
    for (let i = 0; i < 2; i++) {
      const m = new THREE.Mesh(fist, skin);
      m.raycast = () => {};
      m.scale.setScalar(0.12 * this.k);
      this.fists.push(m);
      band.group.add(m);
    }
    band.group.add(s.root);
    this.snark = s;
    this.setVisible(this.shown);
    band.onSnark?.(this, s);
  }

  private shown = true;
  /** Show or hide the player (and its instrument). */
  setVisible(on: boolean) {
    this.shown = on;
    this.frame.visible = on && !!this.snark;
    if (this.snark) this.snark.root.visible = on;
    for (const m of [...this.arms, ...this.fists]) m.visible = on;
  }

  /** Move the player (its feet). */
  moveTo(x: number, y: number, z: number) {
    this.base.set(x, y, z);
  }

  private v = new THREE.Vector3();
  private L = new THREE.Vector3();
  private R = new THREE.Vector3();
  private sh = [new THREE.Vector3(), new THREE.Vector3()];
  private inv = new THREE.Matrix4();

  tick(dt: number, t: number, e: number, camQuat: THREE.Quaternion, camRight: THREE.Vector3) {
    const s = this.snark;
    const tt = t + this.ph;
    this.on += ((this.resting ? 0 : 1) - this.on) * Math.min(1, dt * 4);
    this.rig.obj.visible = this.on > 0.05 || this.kind === "drums" || this.kind === "bass";
    // the player's frame follows the bust (drawn off the cut-out's middle, mirrored as it turns)
    this.frame.position.copy(this.base);
    if (!s) {
      this.rig.anim(tt, e);
      return;
    }
    s.root.position.copy(this.base);
    s.root.position.y += this.lift;
    s.update(dt, t, camQuat, camRight);
    // a bow: the cut-out dips (it has no waist to bend)
    s.visual.position.y = this.baseVY - this.bowing * 0.25 * this.k;
    s.root.updateMatrixWorld(true);
    const facing = Math.sign(s.visual.scale.x) || 1;
    this.v.set(BUST_X * facing, 0, 0).applyQuaternion(s.visual.quaternion);
    this.frame.position.x += this.v.x * this.k;
    this.frame.position.z += this.v.z * this.k;
    this.frame.position.y += this.lift;
    if (this.tut) this.tut.rotation.y = tt * 2;
    this.rig.anim(tt, e);
    this.frame.updateMatrixWorld(true);
    // hands: on the instrument while playing, hanging (or in a bow) otherwise
    this.rig.hands(tt, e, this.L, this.R);
    const rest = (side: number, out: THREE.Vector3) => out.set(side * 0.42 * this.k, (this.rig.sit ? 0.55 : 0.45) * this.k - this.bowing * 0.2, 0.08 * this.k + this.bowing * 0.25);
    const hang = new THREE.Vector3();
    this.L.lerp(rest(-1, hang), 1 - this.on);
    this.R.lerp(rest(1, hang), 1 - this.on);
    this.L.applyMatrix4(this.frame.matrixWorld);
    this.R.applyMatrix4(this.frame.matrixWorld);
    // shoulders, on the cut-out (near one on the bust's right as drawn, mirrored with it)
    const vis = s.visual;
    this.sh[0].set(SHOULDER_NEAR, SHOULDER_Y, 0.02);
    this.sh[1].set(SHOULDER_FAR, SHOULDER_Y, 0.02);
    for (const p of this.sh) vis.localToWorld(p);
    // each shoulder takes the hand on its side as seen (arms never cross, from any side)
    const nearRight = this.sh[0].dot(camRight) > this.sh[1].dot(camRight);
    const rHand = this.R.dot(camRight) >= this.L.dot(camRight) ? this.R : this.L;
    const lHand = rHand === this.R ? this.L : this.R;
    this.inv.copy(this.band.group.matrixWorld).invert();
    this.limb(0, this.sh[0], nearRight ? rHand : lHand);
    this.limb(1, this.sh[1], nearRight ? lHand : rHand);
  }

  /** One arm: shoulder → elbow → fist, elbow bent down and out. */
  private limb(i: number, shoulder: THREE.Vector3, hand: THREE.Vector3) {
    const k = this.k;
    const a = 0.36 * k,
      b = 0.36 * k;
    const d = hand.clone().sub(shoulder);
    const len = Math.min(d.length(), a + b - 1e-3);
    const dir = d.normalize();
    // the elbow: off the line by the triangle's height, towards down and away from the body's middle
    const h = Math.sqrt(Math.max(0, a * a - (len / 2) ** 2));
    const mid = shoulder.clone().addScaledVector(dir, len / 2);
    const out = shoulder.clone().sub(this.frame.getWorldPosition(new THREE.Vector3())).setY(0).normalize();
    const pole = new THREE.Vector3(0, -1, 0).addScaledVector(out, 0.8);
    pole.addScaledVector(dir, -pole.dot(dir)).normalize();
    const elbow = mid.addScaledVector(pole, h);
    const wrist = shoulder.clone().addScaledVector(dir, len);
    const th = 0.115 * k;
    this.seg(this.arms[i * 2], shoulder, elbow, th);
    this.seg(this.arms[i * 2 + 1], elbow, wrist, th * 0.95);
    const f = this.fists[i];
    f.position.copy(wrist).applyMatrix4(this.inv);
  }

  private seg(m: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3, th: number) {
    const pa = a.clone().applyMatrix4(this.inv),
      pb = b.clone().applyMatrix4(this.inv);
    m.position.copy(pa);
    const d = pb.sub(pa);
    const l = d.length();
    m.scale.set(th, th, Math.max(0.01, l));
    if (l > 1e-5) m.quaternion.setFromUnitVectors(Z, d.divideScalar(l));
  }
}

const Z = new THREE.Vector3(0, 0, 1);

/**
 * A band: its players, the recording they play (registered with the live music), and a driver that
 * animates them whenever their floor is drawn.
 */
export class Band {
  readonly group = new THREE.Group();
  readonly players: Player[] = [];
  source: LiveSource | null = null;
  /** The music's loudness when nobody can hear it (no sound on): a gentle swell. */
  fallback = (t: number) => 0.45 + 0.25 * Math.sin(t * 0.5);
  /** Called once a player's zkSNARK has loaded (to make it clickable, say lines…). */
  onSnark: ((p: Player, s: Snark) => void) | null = null;
  /** Extra per-frame work (a conductor, lights), with the music's loudness. */
  onTick: ((dt: number, t: number, e: number) => void) | null = null;
  private last = -1;
  private camQuat = new THREE.Quaternion();
  private camRight = new THREE.Vector3();
  private energy = 0.4;

  constructor(parent: THREE.Object3D) {
    parent.add(this.group);
    // for tests: every band, its players and whether their zkSNARKs have arrived
    if (import.meta.env?.DEV || location.search.includes("debug")) ((window as unknown as { __bands?: Band[] }).__bands ??= []).push(this);
    // the driver: one degenerate triangle, never culled, invisible
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0], 3));
    const driver = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, depthTest: false }));
    driver.frustumCulled = false;
    driver.raycast = () => {};
    driver.onBeforeRender = (_r, _s, camera) => this.frame(camera);
    this.group.add(driver);
  }

  /** For tests: where the band is and who has arrived. */
  get debug() {
    const p = this.players.map((x) => ({ kind: x.kind, x: x.frame.position.x, y: x.frame.position.y, z: x.frame.position.z, yaw: x.yaw, ready: !!x.snark, shown: x.frame.visible }));
    return { place: this.source?.spec.place, floor: this.source?.spec.floor, track: this.source?.track, players: p };
  }

  add(kind: Kind, o: PlayerOpts) {
    const p = new Player(this, kind, o);
    this.players.push(p);
    return p;
  }

  /** Play a recording (public/audio/music/<track>.m4a) from (x, y, z) in the band's group. */
  play(spec: Omit<LiveSpec, "x" | "y" | "z"> & { at: [number, number, number] }) {
    this.group.updateMatrixWorld(true);
    const p = new THREE.Vector3(...spec.at).applyMatrix4(this.group.matrixWorld);
    const { at, ...rest } = spec;
    void at;
    this.source = live.add({ ...rest, x: p.x, y: p.y, z: p.z });
    return this.source;
  }

  /** The music's loudness now (0..1): measured from the recording when it is heard. */
  get loudness() {
    return this.energy;
  }

  private frame(camera: THREE.Camera) {
    const now = performance.now() / 1000;
    if (now - this.last < 0.004) return;
    const dt = this.last < 0 ? 0.016 : Math.min(0.1, now - this.last);
    this.last = now;
    camera.getWorldQuaternion(this.camQuat);
    this.camRight.set(1, 0, 0).applyQuaternion(this.camQuat);
    const src = this.source;
    const playing = !!src?.track;
    const target = src && src.heard ? Math.min(1, src.meter * 1.6) : playing ? this.fallback(now) : 0.15;
    this.energy += (target - this.energy) * Math.min(1, dt * 3);
    this.group.updateMatrixWorld(true);
    for (const p of this.players) p.tick(dt, now, this.energy, this.camQuat, this.camRight);
    this.onTick?.(dt, now, this.energy);
  }
}
