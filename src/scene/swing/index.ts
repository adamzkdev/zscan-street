import * as THREE from "three";
import type { WalkControls } from "../../interior/walk";
import { SwingControls } from "../../ui/swing";
import { SwingAim } from "./aim";
import { FieldBuilder, type HeightField } from "./field";
import { CameraGait, FootHands } from "./hands";
import { Swing } from "./physics";
import { SwingSound } from "./sound";

/** What the street gives the swing (main.ts). */
export interface StreetSwingHost {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  canvas: HTMLCanvasElement;
  ui: HTMLElement;
  /** The street's first-person walker. */
  walker: WalkControls;
  /** On foot in the street (not on the map, not inside a place). */
  street(): boolean;
  /** …and nothing over the view (a talk, a panel, photo mode): a line can be thrown. */
  free(): boolean;
  /** The depth of the frame on screen (the scene pass's). */
  depth(): THREE.Texture | null;
  /** The street plan's solid ground (building footprints, posts), for the low part of a swing. */
  solid(x: number, z: number): boolean;
  /** The walker's own raised floors (bridge decks, platforms) at (x, z), or null: the street. */
  ground(x: number, z: number): number | null;
  curb: number;
  bounds: { x0: number; x1: number; z0: number; z1: number };
  /** Everything that moves, left out of the height field (people, cars, trams, the blimp). */
  movers(): THREE.Object3D[];
  /** The street's sound is on. */
  sound(): boolean;
}

/**
 * The swing on foot, wired into the street: the physics (physics.ts) as the walker's mover, the
 * visible-point aim (aim.ts) from the frame's own depth, the city's height field (field.ts) drawn
 * once on the first walk, the first-person hands (hands.ts), the reticle and the touch button
 * (ui/swing.ts). main.ts calls `update` once a frame before drawing, nothing else.
 */
export class StreetSwing {
  readonly physics: Swing;
  readonly hands: FootHands;
  readonly picker: SwingAim;
  readonly controls: SwingControls;
  private field: HeightField | null = null;
  private builder: FieldBuilder;
  private preparing = false;
  /** Seconds on foot in the street so far this walk (the field waits for the buildings to stand). */
  private walked = 0;
  private gait = new CameraGait();
  private ndc = new THREE.Vector2();
  private spot = new THREE.Vector3();
  private polled = 0;
  private asked = 0;
  /** The hands are up while the swing runs and a moment after; plain walking keeps the view clear. */
  private handsUp = 0;
  private lastUpdate = 0;
  /** The view's width at rest. */
  private readonly fov: number;

  constructor(private host: StreetSwingHost) {
    const w = host.walker;
    this.fov = w.camera.fov;
    this.picker = new SwingAim(host.renderer);
    this.physics = new Swing(
      {
        camera: w.camera,
        heading: () => w.heading,
        target: (out) => this.picker.hit(this.controls.ndc(this.ndc), out),
        velocity: (out) => w.velocity(out),
        lean: (v) => (w.roll = v),
        nod: (v) => (w.nod = v),
        // (the thud of a landing is the physics' own)
        landed: (_level, vx, vz, floor) => w.resume(floor, vx, vz),
        field: () => this.field,
        solid: (x, z) => host.solid(x, z),
        ground: (x, z) => host.ground(x, z),
        curb: host.curb,
        fov: this.fov,
        bounds: host.bounds,
      },
      host.scene,
      new SwingSound(() => host.sound()),
    );
    // the reticle's hold is looked for here, off the frame's back (see update)
    this.physics.pollAim = false;
    this.hands = new FootHands(w.camera, host.scene, this.fov);
    this.builder = new FieldBuilder(host.renderer, host.scene, host.bounds, () => [...host.movers(), ...this.physics.objects, this.hands.root]);
    this.controls = new SwingControls(host.canvas, host.ui, {
      allowed: () => host.free() && w.enabled,
      street: () => host.street(),
      hold: (on) => this.hold(on),
      turn: (dyaw, dpitch) => w.turn(dyaw, dpitch),
    });
    w.mover = this.physics.move;
    // a teleport, a door, the map: whatever was swinging stops where it was
    w.onPlace = () => this.reset();
  }

  /** On the line, in the air or on a roof: the walker's doors and talks wait. */
  get active() {
    return this.physics.active;
  }

  hold(on: boolean) {
    // (the first throw of a visit: the city's heights are needed now)
    if (on && !this.field && this.host.street()) this.buildField();
    this.physics.hold(on);
  }

  reset() {
    this.physics.reset();
    this.gait.reset();
  }

  /** The field at once (a throw came before the prepared one). */
  private buildField() {
    const t0 = performance.now();
    this.field = this.builder.now();
    if (import.meta.env?.DEV) console.info(`swing: height field ${this.field.size}² at once, ${Math.round(performance.now() - t0)} ms`);
  }

  /** The field in the background: shaders compiled in parallel, read back without a stall. */
  private prepareField() {
    if (this.preparing || this.field) return;
    this.preparing = true;
    const t0 = performance.now();
    this.builder.prepare().then(
      (f) => {
        this.field ??= f;
        if (import.meta.env?.DEV) console.info(`swing: height field ${f.size}² ready in ${Math.round(performance.now() - t0)} ms`);
      },
      (e) => {
        this.preparing = false;
        console.warn("swing: height field", e);
      },
    );
  }

  /** The height field (built on demand). */
  heights() {
    if (!this.field) this.buildField();
    return this.field!;
  }

  /**
   * Once a frame on the street, before the frame is drawn, with the camera about to draw it. The
   * frame before is still in the depth buffer: the reticle's hold is read from it (without a
   * stall), then this frame's camera is kept for the next pick.
   */
  update(dt: number, cam: THREE.Camera) {
    const now = performance.now();
    const gap = now - this.lastUpdate > 250;
    this.lastUpdate = now;
    const w = this.host.walker;
    const street = this.host.street() && w.enabled && cam === w.camera;
    const free = street && this.host.free();
    if (!street) {
      this.walked = 0;
      this.picker.clear();
      this.hands.hide();
      this.physics.aim = null;
      if (!this.host.street() && this.physics.active) {
        this.reset();
        this.physics.sound.hush();
      }
      this.controls.sync(false, false, false);
      return;
    }
    if (gap) this.picker.clear();
    // the field once the walk has settled (the map's cut-away walls back up), unless a throw came first
    // (what moves is noted over the first moments: watched a few frames in, compared once the walls stand)
    const before = this.walked;
    this.walked += dt;
    if (!this.field && before < 0.15 && this.walked >= 0.15) this.builder.watch();
    if (!this.field && this.walked > 0.8) this.prepareField();
    // the reticle: is there a hold under it? (asked of the last frame, answered a frame or two later)
    if (free && this.picker.captured && (this.polled -= dt) <= 0) {
      this.polled = 0.1;
      const ask = ++this.asked;
      void this.picker.hitLater(this.controls.ndc(this.ndc), this.spot).then((hit) => {
        // (an answer to an older question, or one that came back after the view closed: dropped)
        if (hit === undefined || ask !== this.asked || !this.host.free()) return;
        this.physics.aim = hit && this.physics.holdable(hit) ? hit.clone() : null;
      });
    }
    if (!free) this.physics.aim = null;
    // the hands: up for the swing (and a moment after landing), the walk's stride, the swing's air;
    // put away for plain walking and while something is open over the view
    const p = w.camera.position;
    const air = this.physics.active && !this.physics.grounded;
    this.handsUp = this.physics.active || this.physics.holding ? 1.2 : Math.max(0, this.handsUp - dt);
    const gait = this.gait.update(dt, p, this.physics.active ? p.y - 1.6 : w.floor, this.physics.active ? 1 : 1.6, air);
    this.hands.update(dt, gait, this.physics.reach, !free || this.handsUp <= 0);
    this.controls.sync(free, this.physics.canCatch, this.physics.holding && !!this.physics.anchor);
    // this frame's camera, for the picks until the next one
    this.picker.capture(cam, this.host.depth());
  }
}
