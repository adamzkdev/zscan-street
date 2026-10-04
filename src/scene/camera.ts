import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { busLocal, type BlockBus } from "./bus";
import { BUS } from "./voxel/vehicles";
import { DISTRICTS, type Interior } from "./city";
import type { Snark } from "./snark";

export type Mode = "live" | "overview" | "free" | "district" | "follow" | "inspect";
/** Cinematic angles, as in the design boards. */
export type Shot = "three-quarter" | "street" | "high" | "inside" | "bus-side" | "boarding" | "shop";
export const FOLLOW_SHOTS: Shot[] = ["three-quarter", "street", "high"];

const AZ = THREE.MathUtils.degToRad(34);
const EL = THREE.MathUtils.degToRad(34);
const DIST = 120;
const VIEW = { live: 30, overview: 78, free: 30, district: 30, follow: 30, inspect: 30 };
/** Live view opens on downtown: the MEMPOOL shop, the zebra and the bus stop. */
const HOME = new THREE.Vector3(DISTRICTS[0].crossX + 2, 1, -0.5);
/** Follow shots rotate on their own unless the viewer picks one. */
const AUTO_CYCLE_S = 9;

export interface RigEvents {
  /** A hard cut between cameras (the HUD dips to black). */
  cut(): void;
  shot(shot: Shot | null, mode: Mode): void;
}

/**
 * Two cameras: the orthographic isometric view (live, overview, free roaming) and a perspective
 * camera for cinematic shots (following a zkSNARK, inside the bus, alongside it, boarding).
 */
export class CameraRig {
  readonly iso: THREE.OrthographicCamera;
  readonly persp = new THREE.PerspectiveCamera(38, 1, 0.05, 400);
  readonly controls: OrbitControls;
  /** Orbit around the followed subject, when the viewer drags in follow mode. */
  readonly orbit: OrbitControls;
  private userOrbit = false;
  /** Tree canopies the cinematic camera keeps out of. */
  canopies: THREE.Sphere[] = [];
  mode: Mode = "live";
  shot: Shot | null = null;
  /** Auto cinematics: in live view, cut to the boarding when a bus stops (off unless asked for). */
  auto = false;
  following: Snark | null = null;
  /** The bus the camera is about (followed, boarding, or carrying the followed zkSNARK). */
  bus: BlockBus | null = null;
  /** The shop being looked into. */
  shopSite: Interior | null = null;
  private followBus = false;
  private pickedShot: Shot | null = null;
  private shotSince = 0;
  private viewSize = VIEW.live;
  private flight: { to: THREE.Vector3; zoom: number } | null = null;
  private lookAt = new THREE.Vector3();
  private camPos = new THREE.Vector3();
  private snap = true;
  private aspect = 1;
  private t = 0;
  private boardingUntil = 0;
  private ray = new THREE.Raycaster();
  private keys = new Set<string>();
  private reach = 1;
  private lastProbe = 0;

  constructor(
    dom: HTMLElement,
    private ev: RigEvents,
  ) {
    this.iso = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 600);
    const offset = this.isoOffset();
    this.iso.position.copy(HOME).add(offset);
    this.iso.lookAt(HOME);
    this.controls = new OrbitControls(this.iso, dom);
    this.controls.target.copy(HOME);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minZoom = 0.35;
    this.controls.maxZoom = 4;
    this.controls.screenSpacePanning = false;
    // a map, not a model viewer: drag to move around, right-drag to turn, wheel zooms where you point
    // the wheel button (and right button) turns around the city; the wheel itself still zooms
    this.controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.ROTATE, RIGHT: THREE.MOUSE.ROTATE };
    this.controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };
    this.controls.zoomToCursor = true;
    this.controls.panSpeed = 1.2;
    this.controls.zoomSpeed = 1.4;
    this.controls.addEventListener("start", () => (this.flight = null));
    this.controls.addEventListener("change", () => this.clampTarget());
    dom.addEventListener("wheel", () => this.interrupt(), { passive: true });
    window.addEventListener("keydown", (e) => this.keys.add(e.key.toLowerCase()));
    window.addEventListener("keyup", (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener("blur", () => this.keys.clear());
    this.orbit = new OrbitControls(this.persp, dom);
    this.orbit.enableDamping = true;
    this.orbit.dampingFactor = 0.1;
    this.orbit.enablePan = false;
    this.orbit.minDistance = 2.5;
    this.orbit.maxDistance = 22;
    this.orbit.maxPolarAngle = Math.PI / 2 - 0.05;
    this.orbit.enabled = false;
    this.orbit.addEventListener("start", () => {
      if (this.mode !== "follow") return;
      // the viewer takes the camera: stop the automatic cuts
      this.userOrbit = true;
      this.pickedShot = null;
      this.ev.shot(this.shot, this.mode);
    });
    this.limits();
  }

  get camera(): THREE.Camera {
    return this.shot ? this.persp : this.iso;
  }

  /** The point the scene is about (for lights and shadows). */
  get focus(): THREE.Vector3 {
    return this.shot ? this.lookAt : this.controls.target;
  }

  private isoOffset() {
    return new THREE.Vector3(Math.sin(AZ) * Math.cos(EL), Math.sin(EL), Math.cos(AZ) * Math.cos(EL)).multiplyScalar(DIST);
  }

  /** Full turn around the city in every view; tilt from almost top-down to a low angle. */
  private limits() {
    const c = this.controls;
    c.minAzimuthAngle = -Infinity;
    c.maxAzimuthAngle = Infinity;
    c.minPolarAngle = 0.12;
    c.maxPolarAngle = 1.22;
  }

  resize(w: number, h: number) {
    this.aspect = w / h;
    const v = this.aspect < 1 ? (this.viewSize * 1.25) / this.aspect : this.viewSize;
    Object.assign(this.iso, { left: (-v * this.aspect) / 2, right: (v * this.aspect) / 2, top: v / 2, bottom: -v / 2 });
    this.iso.updateProjectionMatrix();
    this.persp.aspect = this.aspect;
    this.persp.fov = this.aspect < 1 ? 55 : 38;
    this.persp.updateProjectionMatrix();
  }

  setMode(m: Exclude<Mode, "follow" | "district">) {
    this.following = null;
    this.followBus = false;
    this.mode = m;
    this.viewSize = VIEW[m];
    this.limits();
    this.resize(window.innerWidth, window.innerHeight);
    this.setShot(null);
    if (m !== "free") this.flyTo(m === "overview" ? new THREE.Vector3(0, 1, -4) : HOME, 1);
    this.ev.shot(this.shot, this.mode);
  }

  district(center: THREE.Vector3, zoom: number) {
    this.following = null;
    this.followBus = false;
    this.mode = "district";
    this.viewSize = VIEW.district;
    this.limits();
    this.resize(window.innerWidth, window.innerHeight);
    this.setShot(null);
    this.flyTo(center, zoom);
    this.ev.shot(this.shot, this.mode);
  }

  flyTo(to: THREE.Vector3, zoom: number) {
    this.flight = { to: to.clone(), zoom };
  }

  follow(s: Snark | null) {
    if (!s) return this.setMode("live");
    this.following = s;
    this.followBus = false;
    this.mode = "follow";
    this.pickedShot = null;
    this.setShot(this.shotFor(s) ?? "three-quarter");
    this.ev.shot(this.shot, this.mode);
  }

  followTheBus(bus: BlockBus) {
    this.bus = bus;
    this.following = null;
    this.followBus = true;
    this.mode = "follow";
    this.setShot("bus-side");
    this.ev.shot(this.shot, this.mode);
  }

  /** Look inside a walk-in building (the MEMPOOL shop, the mining hall, the card shop, the bank). */
  lookIn(site: Interior) {
    this.following = null;
    this.followBus = false;
    this.shopSite = site;
    this.mode = "inspect";
    this.setShot("shop");
    this.ev.shot(this.shot, this.mode);
  }

  /** Viewer picked an angle (null = let the director cycle). */
  pick(shot: Shot | null) {
    this.pickedShot = shot;
    this.userOrbit = false;
    this.snap = true;
    if (shot) this.setShot(shot);
  }

  get picked() {
    return this.pickedShot;
  }

  /** True while the viewer is steering the follow camera by hand. */
  get orbiting() {
    return this.userOrbit;
  }

  /** A drag on the scene during an automatic cut hands the view back to the viewer. */
  interrupt() {
    if (this.mode === "live" && this.shot) this.setShot(null);
  }

  /** Called by the block choreography so live view can cut to the action. */
  busEvent(phase: "arriving" | "boarding" | "departing" | "confirmed", bus: BlockBus) {
    if (!this.auto || this.mode !== "live") return;
    if (this.shot && this.bus !== bus) return;
    if (phase === "boarding") {
      this.bus = bus;
      // a few seconds outside at the doors, then inside to watch them take their seats
      this.boardingUntil = this.t + 3.2;
      this.setShot("boarding");
    }
    if (phase === "departing" && (this.shot === "boarding" || this.shot === "inside")) this.setShot("bus-side");
    if (phase === "confirmed" && (this.shot === "bus-side" || this.shot === "boarding")) this.setShot(null);
  }

  private setShot(s: Shot | null) {
    if (s === this.shot) return;
    const wasPersp = !!this.shot;
    this.shot = s;
    this.shotSince = this.t;
    this.snap = true;
    this.controls.enabled = !s;
    this.orbit.enabled = !!s && this.mode === "follow";
    if (!s) this.userOrbit = false;
    if (wasPersp || s) this.ev.cut();
    this.ev.shot(s, this.mode);
  }

  /** The angle a followed zkSNARK calls for right now. */
  private shotFor(s: Snark): Shot | null {
    if (s.bus && (s.state === "riding" || s.root.parent === s.bus.cabin)) {
      this.bus = s.bus;
      return s.bus.phase === "departing" ? "bus-side" : "inside";
    }
    if (s.state === "shopping" && s.shop && s.root.position.distanceTo(s.shop.inside) < 4.5) {
      this.shopSite = s.shop;
      return "shop";
    }
    return null;
  }

  update(dt: number) {
    this.t += dt;
    // follow mode: pick the shot, then frame it
    if (this.mode === "follow") {
      const s = this.following;
      if (s) {
        const forced = this.shotFor(s);
        if (forced) this.setShot(forced);
        else if (this.shot === "inside" || this.shot === "bus-side" || this.shot === "shop") this.setShot("three-quarter");
        else if (this.pickedShot && this.shot !== this.pickedShot) this.setShot(this.pickedShot);
        else if (!this.pickedShot && !this.userOrbit && this.t - this.shotSince > AUTO_CYCLE_S) {
          const i = FOLLOW_SHOTS.indexOf(this.shot as Shot);
          this.setShot(FOLLOW_SHOTS[(i + 1) % FOLLOW_SHOTS.length]);
        }
      } else if (this.followBus && (!this.bus || !this.bus.group.parent)) this.setMode("live");
    }
    const bp = this.bus?.phase;
    if (this.mode === "live" && this.shot === "boarding" && this.t > this.boardingUntil && bp === "stopped") this.setShot("inside");
    if (this.mode === "live" && (this.shot === "inside" || this.shot === "boarding") && bp === "departing") this.setShot("bus-side");
    if (this.mode === "live" && this.shot === "bus-side" && this.t - this.shotSince > 6) this.setShot(null);

    if (this.shot) this.framePersp(dt);
    else this.frameIso(dt);
  }

  /** Keep the view over the city. */
  private clampTarget() {
    const t = this.controls.target;
    const cx = THREE.MathUtils.clamp(t.x, -86, 86),
      cz = THREE.MathUtils.clamp(t.z, -34, 30);
    if (cx !== t.x || cz !== t.z) {
      const d = new THREE.Vector3(cx - t.x, 0, cz - t.z);
      t.add(d);
      this.iso.position.add(d);
    }
    t.y = 1;
  }

  /** Arrow keys / WASD / ZQSD move across the map, Q/E (A/E on AZERTY) turn it. */
  private keyboard(dt: number) {
    if (!this.keys.size || this.shot || (document.activeElement && /input|textarea/i.test(document.activeElement.tagName))) return;
    const k = this.keys;
    const left = this.azerty ? "q" : "a",
      turnLeft = this.azerty ? "a" : "q";
    const fwd = (k.has("w") || k.has("z") || k.has("arrowup") ? 1 : 0) - (k.has("s") || k.has("arrowdown") ? 1 : 0);
    const side = (k.has("d") || k.has("arrowright") ? 1 : 0) - (k.has(left) || k.has("arrowleft") ? 1 : 0);
    const turn = (k.has("e") ? 1 : 0) - (k.has(turnLeft) ? 1 : 0);
    if (fwd || side) {
      const dir = new THREE.Vector3().subVectors(this.controls.target, this.iso.position).setY(0).normalize();
      const right = new THREE.Vector3(-dir.z, 0, dir.x);
      const speed = (22 / this.iso.zoom) * dt;
      const move = dir.multiplyScalar(fwd * speed).add(right.multiplyScalar(side * speed));
      this.controls.target.add(move);
      this.iso.position.add(move);
      this.flight = null;
      this.clampTarget();
    }
    if (turn) {
      const off = this.iso.position.clone().sub(this.controls.target).applyAxisAngle(new THREE.Vector3(0, 1, 0), -turn * dt * 1.4);
      this.iso.position.copy(this.controls.target).add(off);
      this.iso.lookAt(this.controls.target);
    }
  }

  /** French keyboards: Z/Q instead of W/A. Detected from the first Z or W pressed. */
  private azerty = /^fr/i.test(navigator.language);

  private frameIso(dt: number) {
    this.keyboard(dt);
    if (Math.abs(this.turnLeft) > 1e-4) {
      const step = this.turnLeft * (1 - Math.exp(-dt * 6));
      this.turnLeft -= step;
      const off = this.iso.position.clone().sub(this.controls.target).applyAxisAngle(new THREE.Vector3(0, 1, 0), step);
      this.iso.position.copy(this.controls.target).add(off);
      this.iso.lookAt(this.controls.target);
    }
    if (this.flight) {
      const k = 1 - Math.exp(-dt * 3);
      const delta = this.flight.to.clone().sub(this.controls.target).multiplyScalar(k);
      this.controls.target.add(delta);
      this.iso.position.add(delta);
      this.iso.zoom += (this.flight.zoom - this.iso.zoom) * (1 - Math.exp(-dt * 2.5));
      this.iso.updateProjectionMatrix();
      if (this.controls.target.distanceTo(this.flight.to) < 0.05 && Math.abs(this.iso.zoom - this.flight.zoom) < 0.01) this.flight = null;
    }
    this.controls.update();
  }

  private framePersp(dt: number) {
    if (this.userOrbit && this.shot !== "inside") {
      // hand-held: the orbit target rides along with the subject
      const p = this.following ? this.following.root.getWorldPosition(new THREE.Vector3()) : (this.bus?.group.position ?? this.lookAt);
      const goal = new THREE.Vector3(p.x, p.y + 1.1, p.z);
      const delta = goal.sub(this.orbit.target);
      this.orbit.target.add(delta);
      this.persp.position.add(delta);
      this.orbit.update();
      this.lookAt.copy(this.orbit.target);
      this.camPos.copy(this.persp.position);
      return;
    }
    const pos = new THREE.Vector3();
    const look = new THREE.Vector3();
    const bus = this.bus?.group ?? new THREE.Group();
    const s = this.following;
    const p = s ? s.root.getWorldPosition(new THREE.Vector3()) : bus.position;
    switch (this.shot) {
      case "three-quarter":
        pos.set(p.x + 4.4, p.y + 3.3, p.z + 6.2);
        look.set(p.x, p.y + 1.1, p.z);
        break;
      case "street":
        pos.set(p.x - 1.4, p.y + 1.25, p.z + 5.4);
        look.set(p.x + 0.5, p.y + 1.15, p.z);
        break;
      case "high":
        pos.set(p.x + 8, p.y + 10, p.z + 9);
        look.set(p.x, p.y + 0.5, p.z);
        break;
      case "inside":
        // a CCTV corner high at the back: the aisle, both rows of seats, the doors on the right
        pos.copy(bus.localToWorld(busLocal(3.2, BUS.h - 4.2, 2.6)));
        look.copy(bus.localToWorld(busLocal(BUS.w - 16, BUS.floor + 3, 9.5)));
        break;
      case "bus-side":
        // high enough to clear the shelters and plaza trees, a little ahead of the bus
        pos.set(bus.position.x - 4, 6.2, bus.position.z + 8.5);
        look.set(bus.position.x + 2.5, 1.4, bus.position.z);
        break;
      case "boarding":
        pos.set(bus.position.x + 3, 3.6, 10.8);
        look.set(bus.position.x - 0.5, 1.4, 2.4);
        break;
      case "shop":
        if (this.shopSite) {
          pos.copy(this.shopSite.camPos);
          look.copy(this.shopSite.camLook);
        }
        break;
    }
    if (this.shot !== "inside" && this.shot !== "shop") this.unblock(pos, look);
    const k = this.snap ? 1 : 1 - Math.exp(-dt * (this.shot === "inside" || this.shot === "bus-side" ? 12 : 3.5));
    this.snap = false;
    this.camPos.lerp(pos, k);
    this.lookAt.lerp(look, k);
    if (k === 1) {
      this.camPos.copy(pos);
      this.lookAt.copy(look);
    }
    this.persp.position.copy(this.camPos);
    this.persp.lookAt(this.lookAt);
    const fov = this.shot === "inside" || this.shot === "shop" ? 66 : this.aspect < 1 ? 55 : 38;
    if (this.persp.fov !== fov) {
      this.persp.fov = fov;
      this.persp.updateProjectionMatrix();
    }
    // keep the hand-held orbit ready to take over from this exact framing
    this.orbit.target.copy(this.lookAt);
  }

  /**
   * Keep the lens in front of whatever stands between it and the subject (trees, awnings, walls):
   * probe a few times a second and slide the camera in along the line of sight.
   */
  private unblock(pos: THREE.Vector3, look: THREE.Vector3) {
    const dir = pos.clone().sub(look);
    const dist = dir.length();
    if (this.t - this.lastProbe > 0.1 || this.snap) {
      this.lastProbe = this.t;
      this.ray.set(look, dir.clone().normalize());
      let near = dist;
      const hit = new THREE.Vector3();
      for (const c of this.canopies) {
        if (c.center.distanceTo(look) > dist + c.radius) continue;
        if (this.ray.ray.intersectSphere(c, hit)) near = Math.min(near, hit.distanceTo(look));
      }
      const target = near < dist ? Math.max(0.35, (near - 0.4) / dist) : 1;
      this.reach = this.snap ? target : target < this.reach ? target : this.reach + (target - this.reach) * 0.2;
    }
    pos.copy(look).addScaledVector(dir, this.reach);
  }

  // ---- map controls (the + − ⟲ ⟳ ⌂ buttons) ----

  /** Zoom the map in (k > 1) or out, around the centre of the view. */
  zoomBy(k: number) {
    if (this.shot) return;
    const c = this.controls;
    const to = THREE.MathUtils.clamp(this.iso.zoom * k, c.minZoom, c.maxZoom);
    this.flight = { to: c.target.clone(), zoom: to };
  }

  /** Turn the map around its centre (radians, smoothed over a few frames). */
  turnBy(rad: number) {
    if (this.shot) return;
    this.turnLeft += rad;
  }
  private turnLeft = 0;

  /** Back to the opening view. */
  home() {
    this.setMode("live");
    const off = this.isoOffset();
    this.iso.position.copy(this.controls.target).add(off);
    this.iso.lookAt(this.controls.target);
  }

  /** Back to live from anywhere (Esc). */
  exit() {
    this.setMode("live");
  }

  /** For the HUD: is the camera currently on this zkSNARK? */
  isFollowing(s: Snark) {
    return this.following === s;
  }

  get zoomedOut() {
    return this.mode === "overview";
  }
}
