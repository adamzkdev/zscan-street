import * as THREE from "three";
import { profile } from "../game/profile";
import type { WalkControls } from "../interior/walk";
import type { CityTraffic } from "../scene/citytraffic";
import type { Nav } from "../scene/nav";
import { CAR_VIEWS, GtaCamera } from "./camera";
import { StreetSolid } from "./collide";
import { Doors, type DoorSpot } from "./doors";
import { FootPlayer } from "./foot";
import { Garage } from "./garage";
import { DEFAULTS, GtaHud, type Settings } from "./hud";
import { GtaInput } from "./input";
import { Missions } from "./missions";
import { WorldNet } from "./net";
import { People3D, type Person3 } from "./people3d";
import { Peds } from "./peds";
import { Debris } from "./debris";
import { Breakables } from "./breakables";
import { StreetProps } from "./streetprops";
import { Heat } from "./police";
import { Roads } from "./roads";
import { GtaSound, type AudioOut } from "./sound";
import { DriveCar, SPECS, type VehicleKind } from "./vehicle";
import { MOTO_SEAT } from "./models";

/**
 * ZStreet as an open-world game: you are a zkSNARK, in the third person, in the city as it is
 * (its live traffic, its people, the chain's blocks), on foot or at the wheel of any car you walk
 * up to. The street's first-person walker (interior/walk.ts) stays the source of truth for where
 * you are, so everything that already listens to it (doors into the places, talking to people,
 * the traffic stopping for you, the ambience) works unchanged; this mode moves it, draws your body
 * and your car, and films it all with its own camera.
 *
 *   main.ts: `gta.update(dt)` after the walker's, `gta.camera` while `gta.active`,
 *   `gta.garage.open` → draw `gta.garage.scene`. Esc → `gta.escape()`.
 */

export interface GtaHost {
  scene: THREE.Scene;
  renderer: THREE.WebGLRenderer;
  /** What moves in the street (left out of its solid shape). */
  movers(): THREE.Object3D[];
  /** Somewhere with its own ground rules (the rock, the bridge, the woods, a platform): the walker's own collisions there. */
  footSpecial(x: number, z: number): boolean;
  /** A post, a trunk, a bench, a rail there. */
  footSmall(x: number, z: number): boolean;
  /** Someone or something moving there (people, vehicles, trams). */
  dynamicHit(x: number, z: number): boolean;
  /** The walk-in places' doors, and going in. */
  doors(): DoorSpot[];
  enter(key: string): void;
  /** The city's buildings' fronts on the streets (the bigger city's included). */
  facades(): { type: string; face: string; x0: number; x1: number; z: number; out: THREE.Vector3 }[];
  /** Into any building of the city (a generic ground floor dressed after it). */
  enterBuilding(v: { x: number; z: number; fx: number; fz: number; type: string; name: string; seed: number }): void;
  /** A lift is carrying the walker (its doors closing, moving, opening). */
  riding(): boolean;
  /** Inside a place: its walker (the source of truth there), its scene. */
  interior(): { walk: WalkControls; scene: THREE.Scene } | null;
  /** The places' walker (its own movement steps aside for the game's), and the camera their clicks pick through. */
  interiorWalker: WalkControls;
  pickCamera(cam: THREE.Camera | null): void;
  /** The street's people within `r` of (x, z), to be drawn in 3D. */
  people3d(x: number, z: number, r: number): Person3[];
  /** The street trees (their crowns stop the camera, not the walk). */
  trees(): { x: number; z: number }[];
  /** Knock over whoever stands within `r` of (x, z), flung along (fx, fz): how many went down. */
  knock(x: number, z: number, fx: number, fz: number, r: number): number;
  canvas: HTMLCanvasElement;
  ui: HTMLElement;
  walker: WalkControls;
  /** The street's on-foot mode (and whether it is on). */
  setWalking(on: boolean): void;
  walking(): boolean;
  /** Inside a place (the walker went through a door). */
  indoors(): boolean;
  /** The walker's collisions (static and moving): true where a body cannot stand. */
  footBlocked(x: number, z: number): boolean;
  ground(x: number, z: number): number | null;
  curb: number;
  nav: Nav;
  bounds: { x0: number; x1: number; z0: number; z1: number };
  traffic: CityTraffic;
  /** The other vehicles as boxes (the avenue's, the buses, the trams). */
  vehicles(): Iterable<{ x: number; z: number; hx: number; hz: number }>;
  people(): Iterable<{ x: number; z: number }>;
  baseMap(): HTMLCanvasElement | null;
  places(): { x: number; z: number; label: string; icon?: string }[];
  hq(): { x: number; z: number } | null;
  audio(): AudioOut | null;
  soundOn(): boolean;
  toggleSound(): void;
  night(): boolean;
  cycleTheme(): void;
  /** The street's sky: day, night, or the visitor's clock. */
  setSky(t: "day" | "night" | "auto"): void;
  skyPref(): "day" | "night" | "auto";
  height(): number;
  lastBlockAt(): number;
  mempool(): number;
  quality(): { level: number; pinned: boolean; tiers: number };
  pinQuality(level: number | null): void;
  /** The camera's motion blur amount (0 off). */
  blur(amount: number): void;
  /** People in a car's way react (a shout, a jump): from (x, z) along (fx, fz). */
  react(x: number, z: number, fx: number, fz: number): void;
  /** The street's arrest: a patrol, a night on the rock. */
  arrest(): void;
}

const SETTINGS_KEY = "zstreet.gta.settings";
/** The game's day and night (s). */
const DAY_S = 9 * 60;
const NIGHT_S = 5 * 60;
const ACTIVE_KEY = "zstreet.gta.alive";

export class GtaMode {
  active = false;
  /** In a menu or the map: the world runs, you do not. */
  paused = false;
  readonly cam = new GtaCamera();
  readonly input: GtaInput;
  readonly hud: GtaHud;
  readonly garage: Garage;
  readonly roads = new Roads();
  readonly player = new FootPlayer();
  readonly missions: Missions;
  readonly sound: GtaSound;
  readonly heat: Heat;
  readonly solid: StreetSolid;
  readonly doors: Doors;
  readonly net: WorldNet;
  readonly people: People3D;
  readonly peds: Peds;
  readonly debris = new Debris();
  readonly breakables: Breakables;
  readonly props: StreetProps;
  car: DriveCar | null = null;
  /** The bike's seat you sit on, while riding one. */
  private riding: THREE.Group | null = null;
  /** Every building's door the game could put on a facade (found once the solid shape is in), and those drawn now. */
  private buildingSpots: (DoorSpot & { type: string; seed: number })[] | null = null;
  private placeSpots: DoorSpot[] = [];
  private nearT = 0;
  /** A lift's ride under way, and the steps out of it after. */
  private rode = false;
  private liftOut = 0;
  /** Where the game last put the walker (a move it did not make is the street's: a lift, a stair, a cut). */
  private lastWalk = new THREE.Vector3();
  /** Cars you left (and your own ZK-GT), parked where you got out. */
  parked: DriveCar[] = [];
  private settings: Settings;
  readonly focus = new THREE.Vector3();
  private hits = 0;
  private horn = false;
  private lastHitAt = 0;
  private wasIndoors = false;
  private heartbeat = 0;
  private reactT = 0;
  /** The game's own day: seconds into it (−1: set it again from the setting). */
  private skyT = -1;
  /** The street's sky before the game (put back after). */
  private skyWas: "day" | "night" | "auto" = "auto";
  /** The walker was placed by the street itself (a door, the prison): the body follows. */
  private placed = false;

  constructor(private host: GtaHost) {
    this.input = new GtaInput(host.canvas);
    this.input.stick = host.walker.stick;
    this.settings = { ...DEFAULTS, ...this.loadSettings() };
    this.sound = new GtaSound(() => host.audio());
    this.garage = new Garage(host.ui);
    this.hud = new GtaHud(host.ui, {
      resume: () => this.resume(),
      leave: () => this.stop(),
      garage: () => this.openGarage(),
      teleport: (x, z) => this.teleport(x, z),
      settings: this.settings,
      apply: (s) => this.apply(s),
      progress: () => this.progressRows(),
      quality: () => host.quality(),
      pinQuality: (l) => host.pinQuality(l),
      sound: () => host.soundOn(),
      toggleSound: () => host.toggleSound(),
    });
    this.hud.base = () => host.baseMap();
    this.hud.onMap = (open) => {
      this.paused = open || this.hud.paused;
      if (open && document.pointerLockElement) document.exitPointerLock();
    };
    this.hud.onTouch = (btn, down) => {
      if (btn === "car" || btn === "jump" || btn === "door" || btn === "hit") {
        if (down) this.input.tap(`touch:${btn}`);
      } else if (down) this.input.touch.add(btn);
      else this.input.touch.delete(btn);
    };
    this.missions = new Missions({
      scene: host.scene,
      roads: this.roads,
      hq: () => host.hq(),
      places: () => host.places(),
      height: () => host.height(),
      lastBlockAt: () => host.lastBlockAt(),
      toast: (t, s, tone) => this.hud.toast(t, s, tone),
      card: (c) => this.hud.card(c),
      blip: (k) => this.sound.blip(k),
      shake: (k) => this.cam.shake(k),
    });
    this.missions.setVisible(false);
    this.heat = new Heat({
      scene: host.scene,
      roads: this.roads,
      toast: (t, s, tone) => this.hud.toast(t, s, tone),
      busted: () => this.busted(),
      wall: (x, z) => host.nav.wall(x, z),
    });
    // the street moved the walker on its own (out of a door, into a cell): the body goes there
    const placed = host.walker.onPlace;
    host.walker.onPlace = () => {
      placed?.();
      this.placed = true;
    };
    this.apply(this.settings);
    this.doors = new Doors(host.scene);
    this.net = new WorldNet(host.scene);
    this.peds = new Peds(host.scene);
    this.people = new People3D(host.scene, (x, z, r) => [...this.peds.near(x, z, r), ...host.people3d(x, z, r)]);
    this.breakables = new Breakables(this.debris);
    this.props = new StreetProps(host.scene, this.debris);
    host.interiorWalker.mover = () => this.active;
    this.solid = new StreetSolid({
      renderer: host.renderer,
      scene: host.scene,
      area: { x0: host.bounds.x0 - 4, x1: host.bounds.x1 + 4, z0: host.bounds.z0 - 4, z1: host.bounds.z1 + 4 },
      movers: () => [...host.movers(), this.player.group, this.doors.group, this.missions.group, this.net.group, this.people.group, this.props.group, this.debris.mesh, this.peds.group, ...this.parked.map((c) => c.group), ...this.heat.chasers.map((c) => c.car.group), ...(this.car ? [this.car.group] : [])],
      surface: (x, z) => this.roads.surface(x, z),
    });
    host.scene.add(this.player.group);
    this.player.group.visible = false;
    // the walker's own movement steps aside while the game moves it
    host.walker.mover = () => this.active;
    // the mouse: locked to the view while playing on a desktop
    host.canvas.addEventListener("click", () => {
      if (!this.active || this.paused || this.settings.follow || matchMedia("(pointer: coarse)").matches) return;
      if (document.pointerLockElement !== host.canvas) void host.canvas.requestPointerLock?.()?.catch?.(() => {});
    });
    document.addEventListener("pointerlockchange", () => {
      // the browser let go of the mouse (Esc): the menu, as games do
      if (this.active && !document.pointerLockElement && !this.paused && !this.garage.open) this.pause(true);
    });
    // keys the game owns while it runs (before the street's own handlers see them)
    window.addEventListener(
      "keydown",
      (e) => {
        if (!this.active || this.garage.open || /input|textarea|select/i.test((e.target as HTMLElement)?.tagName ?? "")) return;
        const own = ["Tab", "KeyF", "KeyC", "KeyT", "KeyB", "KeyP", "KeyM", "KeyR", "KeyX"].includes(e.code) || (this.car && ["KeyE", "Space", "KeyQ"].includes(e.code)) || (!this.car && e.code === "KeyE" && !!this.doors.at);
        if (own) {
          e.preventDefault();
          e.stopImmediatePropagation();
        }
      },
      true,
    );
    window.addEventListener("resize", () => this.resize());
    this.resize();
    // the street was closed while playing (a crash, a killed tab): next time, start lighter
    try {
      const prev = JSON.parse(localStorage.getItem(ACTIVE_KEY) || "null");
      if (prev && Date.now() - prev.t < 60_000 && !host.quality().pinned) {
        const q = host.quality();
        if (q.level < q.tiers - 1) {
          host.pinQuality(q.level + 1);
          setTimeout(() => this.hud.toast("Running lighter", "after an interrupted session · Menu › Graphics to change", undefined), 4000);
        }
      }
      localStorage.removeItem(ACTIVE_KEY);
    } catch {}
    addEventListener("pagehide", () => {
      try {
        localStorage.removeItem(ACTIVE_KEY);
      } catch {}
    });
  }

  get camera() {
    return this.cam.camera;
  }

  /** At the wheel. */
  get driving() {
    return !!this.car;
  }

  private loadSettings(): Partial<Settings> {
    try {
      return JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
    } catch {
      return {};
    }
  }

  private apply(s: Settings) {
    Object.assign(this.settings, s);
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
    } catch {}
    this.skyT = -1;
    if (this.peds) this.peds.crowd = this.settings.crowd;
    this.cam.carView = this.settings.carView;
    this.cam.footFar = this.settings.footFar;
    this.cam.fovAdd = this.settings.fovAdd;
    this.cam.sensitivity = this.settings.sens;
    this.cam.vibe = this.settings.vibe;
    this.sound.volume = this.settings.volume;
  }

  private resize() {
    const w = window.innerWidth,
      h = window.innerHeight;
    this.cam.resize(w, h);
    this.garage.resize(w, h);
  }

  // ---- in and out ---------------------------------------------------------------------------------

  /** Open the garage, then play as the zkSNARK picked there. */
  start() {
    this.openGarage();
  }

  private openGarage() {
    if (this.active) {
      this.hud.pause(false);
      this.paused = true;
    }
    if (document.pointerLockElement) document.exitPointerLock();
    this.host.ui.classList.add("gta-garage-on");
    this.garage.show(
      (id) => {
        this.host.ui.classList.remove("gta-garage-on");
        if (this.active) {
          this.player.wear(id);
          this.paused = false;
          this.hud.toast(`zkSNARK #${id}`, "that's you now", "gold");
        } else this.play(id);
      },
      () => {
        this.host.ui.classList.remove("gta-garage-on");
        if (this.active) this.paused = this.hud.paused;
      },
    );
  }

  /** Into the street as zkSNARK #id. */
  play(id = Garage.chosen()) {
    const h = this.host;
    if (!h.walking()) h.setWalking(true);
    if (!h.walking()) return;
    this.active = true;
    this.paused = false;
    this.skyWas = h.skyPref();
    this.skyT = -1;
    h.ui.classList.add("gta-on");
    this.input.active = true;
    this.input.release();
    this.player.wear(id);
    const w = h.walker.camera.position;
    this.player.place(w.x, h.walker.floor, w.z, h.walker.heading);
    this.player.group.visible = true;
    this.cam.behind(h.walker.heading, -0.22);
    this.cam.snap(this.player.pos.clone().setY(this.player.pos.y + 1.55));
    this.missions.setVisible(true);
    this.placeSpots = this.host.doors().flatMap((d) => this.snapDoor(d) ?? []);
    this.doors.set(this.placeSpots);
    this.doors.show(true);
    this.net.join(true);
    this.people.show(true);
    this.props.show(true);
    this.peds.show(true);
    this.peds.crowd = this.settings.crowd;
    this.debris.into(this.host.scene);
    this.hud.show(true);
    // the street's solid shape (once, and again when the far city has streamed in)
    if (!this.solid.ready) {
      void this.solid.build().then(() => {
        if (!this.active) return;
        this.placeSpots = this.host.doors().flatMap((d) => this.snapDoor(d) ?? []);
        this.buildingSpots = null;
        this.doors.set(this.placeSpots);
      });
      setTimeout(() => this.active && void this.solid.build(), 40_000);
    }
    // your own car, parked on the nearest street
    if (!this.parked.some((c) => c.kind === "gt")) this.spawnGt();
    this.scatterBikes();
    if (!GtaHud.coached()) this.hud.coach(0);
    else this.hud.toast(`zkSNARK #${id}`, "in ZStreet · the chain is live", "gold");
    this.alive();
  }

  /** Out of the game, back to the city view. */
  stop() {
    if (!this.active) return;
    const h = this.host;
    if (this.car) this.getOut(true);
    this.active = false;
    this.paused = false;
    this.input.active = false;
    this.input.release();
    h.ui.classList.remove("gta-on");
    this.hud.show(false);
    this.hud.card(null);
    this.hud.prompt(null);
    this.missions.stop();
    this.missions.setVisible(false);
    this.doors.show(false);
    this.net.join(false);
    this.people.show(false);
    this.props.show(false);
    this.peds.show(false);
    this.props.reset();
    this.breakables.restore();
    this.host.pickCamera(null);
    this.host.setSky(this.skyWas);
    if (this.player.group.parent !== this.host.scene) this.host.scene.add(this.player.group);
    this.heat.clear();
    this.sound.siren(0);
    this.player.group.visible = false;
    this.sound.drive(null);
    this.sound.hornOn(false);
    h.blur(0);
    for (const c of this.parked) c.dispose();
    this.parked = [];
    if (document.pointerLockElement) document.exitPointerLock();
    try {
      localStorage.removeItem(ACTIVE_KEY);
    } catch {}
    if (h.walking()) h.setWalking(false);
  }

  /** Esc: the menu (or close what is open). */
  escape() {
    if (this.garage.open) return this.garage.close();
    if (this.hud.mapOpen) return this.hud.toggleMap(false);
    this.pause(!this.hud.paused);
  }

  private pause(on: boolean) {
    this.hud.pause(on);
    this.paused = on || this.hud.mapOpen;
    this.input.release();
    if (on && document.pointerLockElement) document.exitPointerLock();
    if (on) this.sound.hornOn(false);
  }

  private resume() {
    this.pause(false);
  }

  private alive() {
    try {
      localStorage.setItem(ACTIVE_KEY, JSON.stringify({ t: Date.now() }));
    } catch {}
  }

  // ---- cars -----------------------------------------------------------------------------------------

  private spawnGt() {
    const p = this.player.pos;
    const r = this.roads.nearest(p.x + 6, p.z + 6);
    const car = new DriveCar("gt");
    const yaw = r.axis === "x" ? 0 : -Math.PI / 2;
    car.place(r.x, r.z, yaw);
    // not on top of you, nor in a wall
    const n = car.spec;
    if (Math.hypot(r.x - p.x, r.z - p.z) < 3) car.place(r.x + (r.axis === "x" ? n.len + 1 : 0), r.z + (r.axis === "z" ? n.len + 1 : 0), yaw);
    this.host.scene.add(car.group);
    this.parked.push(car);
    // and a bike beside it
    if (!this.parked.some((c) => c.kind === "moto")) {
      const bike = new DriveCar("moto");
      const back = car.spec.len / 2 + 2.2;
      const fx = Math.cos(car.yaw),
        fz = -Math.sin(car.yaw);
      bike.place(car.group.position.x - fx * back, car.group.position.z - fz * back, car.yaw);
      this.host.scene.add(bike.group);
      this.parked.push(bike);
    }
  }

  /** A few bikes parked about the city (once a game). */
  private scatterBikes() {
    if (this.parked.filter((c) => c.kind === "moto").length > 2) return;
    const pts = this.roads.midpoints(40);
    let seed = 5;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < 8 && pts.length; i++) {
      const p = pts.splice(Math.floor(rnd() * pts.length), 1)[0];
      const bike = new DriveCar("moto");
      // by the kerb, along the street
      const off = 3.1;
      const x = p.axis === "x" ? p.x : p.x + off,
        z = p.axis === "x" ? p.z + off : p.z;
      bike.place(x, z, p.axis === "x" ? 0 : -Math.PI / 2);
      this.host.scene.add(bike.group);
      this.parked.push(bike);
    }
  }

  /** The nearest car you could get into, within reach: one of yours, or one of the traffic's. */
  private reachable(): { car?: DriveCar; mover?: unknown; kind: VehicleKind; name: string; d: number } | null {
    const p = this.player.pos;
    let best: { car?: DriveCar; mover?: unknown; kind: VehicleKind; name: string; d: number } | null = null;
    for (const c of this.parked) {
      const d = Math.hypot(c.group.position.x - p.x, c.group.position.z - p.z) - c.spec.wid * 0.5;
      if (d < 3 && (!best || d < best.d)) best = { car: c, kind: c.kind, name: c.spec.name, d };
    }
    for (const m of this.host.traffic.movers) {
      const g = m.group.position;
      const d = Math.hypot(g.x - p.x, g.z - p.z) - 1;
      if (d < 3 && (!best || d < best.d)) {
        const kind: VehicleKind = m.kind === "taxi" ? "taxi" : m.kind === "police" ? "police" : m.kind === "truck" ? "truck" : "sedan";
        best = { mover: m, kind, name: SPECS[kind].name, d };
      }
    }
    return best;
  }

  private getIn() {
    const r = this.reachable();
    if (!r) return;
    let car = r.car ?? null;
    if (!car && r.mover) {
      const g = this.host.traffic.take(r.mover as Parameters<CityTraffic["take"]>[0]);
      car = new DriveCar(r.kind, g);
      this.host.scene.add(car.group);
      // a car taken from the street keeps going for a moment
      if (r.kind === "police") this.heat.raise(1.2, "you took a police cruiser");
      else this.hud.toast(`You took a ${SPECS[r.kind].name.toLowerCase()}`, "its driver steps out");
    } else if (car) this.parked.splice(this.parked.indexOf(car), 1);
    if (!car) return;
    this.car = car;
    this.player.group.visible = false;
    // on a bike you ride it: your body on its seat, leaning with it
    if (car.spec.bike) this.mount(car);
    this.cam.behind(car.yaw - Math.PI / 2, -0.16);
    this.cam.snap(car.group.position.clone().setY(1.15));
    this.sound.blip("door");
    if (this.hud.coaching) this.hud.coach(2);
  }

  /** Out of the car: on the driver's side if there is room, else the other. */
  private getOut(force = false) {
    const car = this.car;
    if (!car) return;
    if (!force && car.speed > 6) return;
    const p = car.group.position;
    const rx = Math.sin(car.yaw),
      rz = Math.cos(car.yaw);
    let spot = { x: p.x - rx * (car.spec.wid / 2 + 0.9), z: p.z - rz * (car.spec.wid / 2 + 0.9) };
    if (this.host.footBlocked(spot.x, spot.z)) spot = { x: p.x + rx * (car.spec.wid / 2 + 0.9), z: p.z + rz * (car.spec.wid / 2 + 0.9) };
    this.car = null;
    if (car.spec.bike) this.dismount();
    car.vel.set(0, 0);
    car.vF = car.vR = 0;
    car.lamps = false;
    this.parked.push(car);
    // keep a handful of cars about (your own GT and the bikes stay)
    while (this.parked.filter((c) => c.kind !== "moto").length > 5) {
      const old = this.parked.find((c) => c.kind !== "gt" && c.kind !== "moto" && c !== car) ?? this.parked.find((c) => c.kind !== "moto")!;
      this.parked.splice(this.parked.indexOf(old), 1);
      old.dispose();
    }
    const floor = this.host.ground(spot.x, spot.z) ?? this.host.curb;
    this.player.place(spot.x, floor, spot.z, car.yaw - Math.PI / 2);
    this.player.group.visible = true;
    this.cam.behind(car.yaw - Math.PI / 2, -0.2);
    this.cam.snap(this.player.pos.clone().setY(this.player.pos.y + 1.55));
    this.sound.drive(null);
    this.sound.hornOn(false);
    this.sound.blip("door");
    this.host.blur(0);
  }

  /** On the bike's seat: the body in the bike's frame (it leans with it), sitting, hands on the bars. */
  private mount(car: DriveCar) {
    const b = this.player.body;
    if (!b) return;
    const pivot = car.group.children.find((c) => c.type === "Group" && c !== b.root) ?? car.group;
    const seat = new THREE.Group();
    seat.name = "gta:seat";
    seat.position.set(MOTO_SEAT.x, MOTO_SEAT.y - 0.34 * 0.86, 0);
    // facing along the bike (its +x): the body's own front is +z
    seat.rotation.y = Math.PI / 2;
    seat.add(b.root);
    b.root.position.set(0, 0, 0);
    b.root.rotation.set(0.25, 0, 0);
    pivot.add(seat);
    b.puppet.motion.sit = 0.3;
    b.holdArms(true);
    b.armR.rotation.set(-1.3, 0, 0.2);
    b.armL.rotation.set(-1.3, 0, -0.2);
    this.player.group.visible = true;
    this.riding = seat;
  }

  private dismount() {
    const b = this.player.body;
    const seat = this.riding;
    this.riding = null;
    if (!b || !seat) return;
    this.player.group.add(b.root);
    b.root.position.set(0, 0, 0);
    b.root.rotation.set(0, 0, 0);
    b.puppet.motion.sit = 0;
    b.holdArms(false);
    seat.removeFromParent();
  }

  /** Pinned down by a cruiser: the street's arrest takes over. */
  private busted() {
    this.hud.toast("Busted", "a night on the rock", "bad");
    this.sound.siren(0);
    this.sound.blip("fail");
    if (this.car) this.getOut(true);
    setTimeout(() => this.active && this.host.arrest(), 700);
  }

  /** Back on the road (R): the nearest lane, the way the street runs. */
  private reset() {
    const car = this.car;
    if (!car) return;
    const p = car.group.position;
    const r = this.roads.nearest(p.x, p.z);
    const fx = Math.cos(car.yaw);
    const yaw = r.axis === "x" ? (fx >= 0 ? 0 : Math.PI) : -Math.sin(car.yaw) >= 0 ? -Math.PI / 2 : Math.PI / 2;
    car.place(r.x, r.z, yaw);
    this.cam.behind(yaw - Math.PI / 2);
  }

  private teleport(x: number, z: number) {
    const b = this.host.bounds;
    x = Math.max(b.x0 + 2, Math.min(b.x1 - 2, x));
    z = Math.max(b.z0 + 2, Math.min(b.z1 - 2, z));
    if (this.car) {
      const r = this.roads.nearest(x, z);
      this.car.place(r.x, r.z, r.axis === "x" ? 0 : -Math.PI / 2);
      this.cam.behind(this.car.yaw - Math.PI / 2);
      this.cam.snap(this.car.group.position.clone().setY(1.15));
      return;
    }
    // the first free spot round where you clicked
    for (let r = 0; r < 30; r += 1.2)
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
        const px = x + Math.cos(a) * r,
          pz = z + Math.sin(a) * r;
        const top = this.solid.topAt(px, pz);
        const free = this.solid.ready && !this.host.footSpecial(px, pz) ? top !== undefined && top === top && top > -0.3 && top < 0.5 && this.solid.foot(px, pz, top).ok && !this.host.footSmall(px, pz) : !this.host.footBlocked(px, pz);
        if (free) {
          this.player.place(px, this.host.ground(px, pz) ?? (top !== undefined && top === top ? Math.max(0, top) : this.host.curb), pz, this.cam.yaw);
          this.cam.snap(this.player.pos.clone().setY(this.player.pos.y + 1.55));
          return;
        }
      }
  }

  // ---- every frame ------------------------------------------------------------------------------------

  update(dt: number) {
    if (this.garage.open) this.garage.update(dt);
    if (!this.active) return;
    const h = this.host;
    // the street left on-foot mode on its own (an event, a cut to the map): the game ends quietly
    if (!h.walking() && !h.indoors()) return this.stop();
    // through a door into a place: the game goes in with you (third person, its walls, things to smash)
    const inside = h.interior();
    if (inside) return this.inside(dt, inside);
    if (this.wasIndoors) {
      this.wasIndoors = false;
      this.hud.inside(false);
      this.breakables.restore();
      this.people.source = null;
      this.people.into(h.scene);
      h.pickCamera(null);
      h.scene.add(this.player.group);
      this.debris.into(h.scene);
      const w = h.walker.camera.position;
      this.player.place(w.x, h.walker.floor, w.z, h.walker.heading);
      this.player.group.visible = true;
      this.cam.behind(h.walker.heading);
      this.cam.snap(this.player.pos.clone().setY(this.player.pos.y + 1.55));
    }
    if (this.placed) {
      this.placed = false;
      if (this.car) this.getOut(true);
      const w = h.walker.camera.position;
      this.player.place(w.x, h.walker.floor, w.z, h.walker.heading);
      this.cam.behind(h.walker.heading);
      this.cam.snap(this.player.pos.clone().setY(this.player.pos.y + 1.35));
    }
    this.sky(dt);
    this.heartbeat += dt;
    if (this.heartbeat > 10) {
      this.heartbeat = 0;
      this.alive();
    }
    const inp = this.input;
    inp.poll(dt);
    // the street holds you (an arrest, a cut): no moving
    if (!h.walker.enabled) inp.release();
    if (!this.paused) this.cam.turn(inp.look.x, inp.look.y);
    if (!this.paused) this.keys();
    else if (this.hud.mapOpen && inp.hit("Tab", "KeyM", "pad:back", "pad:b")) this.hud.toggleMap(false);
    if (this.car) this.drive(dt);
    else this.walk(dt);
    // the walker stands where you are: doors, talk, traffic, sound all follow
    const at = this.car ? this.car.group.position : this.player.pos;
    h.walker.camera.position.set(at.x, (this.car ? 0 : this.player.pos.y) + 1.6, at.z);
    h.walker.setFloor(this.car ? h.curb : this.player.floor);
    const heading = this.car ? this.car.yaw - Math.PI / 2 : this.player.facing;
    h.walker.aim(heading, -0.08);
    // the lights and shadows follow a point ahead of you
    const ahead = this.car ? 6 + this.car.speed * 0.3 : 4;
    this.focus.set(at.x - Math.sin(heading) * ahead, 0, at.z - Math.cos(heading) * ahead);
    this.missions.update(dt, { x: at.x, z: at.z, inCar: !!this.car, speed: this.car?.speed ?? this.player.speed, hits: this.hits });
    const vel = this.car ? { vx: this.car.vel.x, vz: this.car.vel.y } : { vx: this.player.vel.x, vz: this.player.vel.z };
    const near = this.heat.update(dt, { x: at.x, z: at.z, ...vel, speed: this.car?.speed ?? this.player.speed, inCar: !!this.car }, (self) => this.carWorld(self));
    this.sound.siren(this.heat.chasers.length ? Math.max(0.15, 1 - near / 140) : 0);
    this.people.update(dt, at.x, at.z, this.car ? null : this.player.pos, this.cam.camera.position);
    this.streetThings(dt);
    this.net.update(dt, { x: at.x, y: this.car ? 0 : this.player.pos.y, z: at.z, h: heading, c: this.car?.kind ?? "", v: this.car?.speed ?? this.player.speed, s: this.player.id });
    this.hudFrame(dt, at, heading);
  }

  private keys() {
    const i = this.input;
    if (i.hit("Tab", "KeyM", "pad:back")) this.hud.toggleMap();
    if (i.hit("KeyP", "pad:start")) this.pause(true);
    if (i.hit("KeyT")) {
      // T: the next sky (the cycle stops: a fixed one)
      const order: ("cycle" | "day" | "night" | "clock")[] = ["cycle", "day", "night", "clock"];
      this.settings.sky = order[(order.indexOf(this.settings.sky) + 1) % order.length];
      this.apply(this.settings);
      this.hud.toast(this.settings.sky === "cycle" ? "Day and night cycle" : this.settings.sky === "clock" ? "Sky follows your clock" : this.settings.sky === "day" ? "Day" : "Night", "sky · T");
    }
    // (Enter is the coach card's: it must not also put you in a car)
    if (i.hit("KeyF", "pad:y", "touch:car")) {
      if (this.car) this.getOut();
      else this.getIn();
    }
    if (i.hit("KeyC", "pad:rb")) {
      if (this.car) {
        this.settings.carView = ((this.settings.carView + 1) % 3) as 0 | 1 | 2;
        this.apply(this.settings);
        this.hud.toast(CAR_VIEWS[this.settings.carView], "camera");
      } else {
        this.settings.footFar = !this.settings.footFar;
        this.apply(this.settings);
      }
    }
    if (i.hit("KeyR", "pad:down") && this.car) this.reset();
    if (!this.car && i.hit("KeyX", "pad:x", "touch:hit")) this.player.punch();
    // at a door: in
    if (!this.car && this.doors.at && i.hit("KeyE", "pad:x", "touch:door")) {
      this.sound.blip("door");
      const d = this.doors.at as DoorSpot & { type?: string; seed?: number };
      if (d.key.startsWith("building:")) this.host.enterBuilding({ x: d.x, z: d.z, fx: d.fx, fz: d.fz, type: d.type ?? "office", name: d.label, seed: d.seed ?? 1 });
      else this.host.enter(d.key);
    }
    if (this.hud.coaching && i.hit("Enter")) this.hud.coach(-1);
  }

  private walk(dt: number) {
    const h = this.host;
    const i = this.input;
    const m = this.paused ? { x: 0, y: 0, mag: 0 } : i.move();
    const solid = this.solid;
    const pl = this.player;
    // the follow camera: A/D turn the body, W/S go ahead and back; the camera swings in behind
    const follow = this.settings.follow;
    let mx = m.x,
      my = m.y,
      ref = this.cam.yaw;
    if (follow) {
      pl.facing += -m.x * (pl.speed > 5 ? 2.2 : 2.8) * dt;
      ref = pl.facing;
      mx = 0;
      my = m.y < 0 ? m.y * 0.4 : m.y;
    }
    this.player.update(dt, mx, my, follow ? Math.abs(my) + (m.x !== 0 && my === 0 ? 0 : 0) : m.mag, !this.paused && i.sprint && my > 0, !this.paused && i.jump, ref, {
      blocked: (x, z, feet) => {
        if (this.parkedAt(x, z) && feet < 1.2) return true;
        // (the rock, the bridge, the woods, the platforms: their own rules)
        if (!solid.ready || h.footSpecial(x, z)) return h.footBlocked(x, z);
        if (x < h.bounds.x0 || x > h.bounds.x1 || z < h.bounds.z0 || z > h.bounds.z1) return true;
        // in the air: what is under the feet is cleared (a hedge, a bench, a low wall)
        const up = Math.max(pl.floor, feet);
        return !solid.foot(x, z, up).ok || (feet < pl.floor + 0.5 && (h.footSmall(x, z) || h.dynamicHit(x, z)));
      },
      floor: (x, z, feet) => {
        const g = h.ground(x, z);
        if (g !== null) return g;
        if (!solid.ready) return h.curb;
        const f = solid.foot(x, z, Math.max(pl.floor, feet));
        return f.ok && Number.isFinite(f.floor) ? Math.max(-0.05, f.floor) : pl.floor;
      },
    }, !follow || my >= 0);
    // behind you again a moment after a look round (always, with the follow camera)
    if (follow && i.idleLook > 0.6) this.cam.follow(dt, pl.facing, pl.speed);
    this.cam.foot(dt, this.player.pos, { wall: (x, z) => (solid.ready && solid.wall(x, z)) || h.nav.wall(x, z) || this.crown(x, z) });
    pl.group.visible = this.cam.armLength > 1.15;
    // sprinting into people: they go down
    if (pl.speed > 6 && !this.paused) {
      this.reactT -= dt;
      if (this.reactT <= 0) {
        this.reactT = 0.12;
        const l = Math.hypot(pl.vel.x, pl.vel.z) || 1;
        this.knockAll(pl.pos.x + (pl.vel.x / l) * 0.5, pl.pos.z + (pl.vel.z / l) * 0.5, pl.vel.x / l, pl.vel.z / l, 0.75);
      }
    }
    // the nearest buildings get their doors
    this.nearT -= dt;
    if (this.nearT <= 0) {
      this.nearT = 0.5;
      this.nearDoors(pl.pos.x, pl.pos.z);
    }
    // a door within reach first, then a car
    this.doors.update(dt, { x: pl.pos.x, z: pl.pos.z, heading: pl.facing });
    const door = this.doors.at;
    const r = door ? null : this.reachable();
    const touch = matchMedia("(pointer: coarse)").matches;
    this.hud.prompt(
      door
        ? `<kbd>${touch ? "Tap" : "E"}</kbd> Enter · ${door.label}`
        : r
          ? `<kbd>F</kbd> ${r.car ? (r.kind === "gt" ? "Get in your ZK-GT" : `Get in the ${r.name.toLowerCase()}`) : `Take the ${r.name.toLowerCase()}`}`
          : null,
    );
    this.hud.doorButton(!!door);
    this.host.blur(0);
  }

  /** The street's knock-about things and the pieces flying: placed once the solid shape is in, pushed by you. */
  private streetThings(dt: number) {
    const h = this.host;
    const world = {
      blocked: (x: number, z: number) => (this.solid.ready ? !this.solid.foot(x, z, this.roads.surface(x, z), 0.12).ok : h.nav.wall(x, z)),
      floor: (x: number, z: number) => {
        const t = this.solid.topAt(x, z);
        return t !== undefined && t === t && t > -0.3 && t < 0.6 ? t : this.roads.surface(x, z);
      },
    };
    if (this.solid.ready) this.props.place(this.roads, { blocked: (x, z) => !this.solid.foot(x, z, this.roads.surface(x, z), 0.5).ok, floor: world.floor });
    const car = this.car;
    if (car && car.speed > 1) {
      const f = car.fwd();
      const p = car.group.position;
      const n = this.props.push(p.x + f.x * car.spec.len * 0.3, p.z + f.y * car.spec.len * 0.3, car.spec.wid * 0.65, car.vel.x, car.vel.y);
      if (n) this.sound.crash(Math.min(0.4, car.speed / 50));
    } else if (!car && this.player.speed > 2.5) this.props.push(this.player.pos.x, this.player.pos.z, 0.35, this.player.vel.x * 0.7, this.player.vel.z * 0.7, 0.5);
    this.props.update(dt, world);
    this.debris.update(dt);
    // the passers-by
    if (this.solid.ready) {
      this.peds.build(this.roads, this.pedWorld());
      const at = this.car ? this.car.group.position : this.player.pos;
      const fy = this.cam.yaw;
      this.peds.update(dt, { x: at.x, z: at.z, onFoot: !this.car, speed: this.car?.speed ?? this.player.speed, id: this.player.id, fx: -Math.sin(fy), fz: -Math.cos(fy) }, this.pedWorld(), { height: this.host.height(), at: this.host.lastBlockAt(), mempool: this.host.mempool() });
    }
    if (this.player.landed) this.punchLanded(null);
  }

  /** The sky: the setting's, or the game's own cycle (9 min of day, 5 of night). */
  private sky(dt: number) {
    const s = this.settings.sky;
    if (this.skyT < 0) {
      this.skyT = 0;
      if (s !== "cycle") return this.host.setSky(s === "clock" ? "auto" : s);
      // the cycle starts where the street is
      this.skyT = this.host.night() ? DAY_S : 0.1;
    }
    if (s !== "cycle") return;
    const was = this.skyT < DAY_S;
    this.skyT = (this.skyT + dt) % (DAY_S + NIGHT_S);
    const day = this.skyT < DAY_S;
    if (day !== was || this.host.night() === day) {
      this.host.setSky(day ? "day" : "night");
      this.hud.toast(day ? "Morning" : "Night falls", day ? "the city wakes up" : "the neon comes on");
    }
  }

  /** A tree's crown over (x, z): the camera stops short of it (it would sit inside the leaves). */
  private treeGrid: Map<string, { x: number; z: number }[]> | null = null;
  private crown(x: number, z: number) {
    if (!this.treeGrid) {
      this.treeGrid = new Map();
      for (const t of this.host.trees()) {
        const k = `${Math.floor(t.x / 4)},${Math.floor(t.z / 4)}`;
        (this.treeGrid.get(k) ?? this.treeGrid.set(k, []).get(k)!).push(t);
      }
    }
    const cx = Math.floor(x / 4),
      cz = Math.floor(z / 4);
    for (let i = -1; i <= 1; i++)
      for (let j = -1; j <= 1; j++) for (const t of this.treeGrid.get(`${cx + i},${cz + j}`) ?? []) if ((t.x - x) ** 2 + (t.z - z) ** 2 < 1.5 * 1.5) return true;
    return false;
  }

  /** Everyone hit within `r` of (x, z): the street's people and the game's passers-by. */
  private knockAll(x: number, z: number, vx: number, vz: number, r: number) {
    return this.host.knock(x, z, vx, vz, r) + this.peds.knock(x, z, vx, vz, r);
  }

  /** The people in the road the traffic must wait for (you on foot, passers-by crossing). */
  trafficBlockers(): { x: number; z: number }[] {
    if (!this.active || this.wasIndoors) return [];
    const out = [...this.peds.inRoad(this.pedWorld())];
    if (!this.car && this.roads.road(this.player.pos.x, this.player.pos.z)) out.push({ x: this.player.pos.x, z: this.player.pos.z });
    return out;
  }

  private pedWorldCache: { free(x: number, z: number): boolean; wall(x: number, z: number): boolean; floor(x: number, z: number): number; road(x: number, z: number): boolean } | null = null;
  private pedWorld() {
    return (this.pedWorldCache ??= {
      free: (x: number, z: number) => {
        if (!this.solid.ready) return !this.host.nav.wall(x, z);
        const t = this.solid.topAt(x, z);
        return t !== undefined && t === t && t > -0.3 && t < 0.7 && !this.host.footSmall(x, z);
      },
      floor: (x: number, z: number) => {
        const t = this.solid.topAt(x, z);
        return t !== undefined && t === t && t > -0.3 && t < 0.7 ? t : 0.2;
      },
      wall: (x: number, z: number) => {
        if (!this.solid.ready) return this.host.nav.wall(x, z);
        const t = this.solid.topAt(x, z);
        return !(t !== undefined && t === t && t > -0.3 && t < 0.7);
      },
      road: (x: number, z: number) => this.roads.road(x, z),
    });
  }

  /** The fist lands: a thing in reach breaks (inside), a street thing flies, a person goes down. */
  private punchLanded(inside: { walk: WalkControls; scene: THREE.Scene } | null) {
    const pl = this.player;
    const dir = new THREE.Vector3(-Math.sin(pl.facing), 0, -Math.cos(pl.facing));
    const at = pl.pos.clone().addScaledVector(dir, 0.75).setY(pl.pos.y + 1);
    let hit = false;
    if (inside) hit = this.breakables.hit(inside.scene, at, dir, pl.floor, [inside.walk.colliders, inside.walk.extra]);
    else {
      hit = this.props.push(at.x, at.z, 0.45, dir.x * 7, dir.z * 7, 1.6) > 0;
      if (this.knockAll(at.x, at.z, dir.x * 6, dir.z * 6, 0.8)) hit = true;
    }
    if (hit) {
      this.sound.crash(0.35);
      this.cam.shake(0.18);
      if (!inside) this.peds.panic(at.x, at.z, 9);
    } else this.sound.blip("click");
  }

  /** Inside a place, in the third person: its walker moved by your body, its walls, its things. */
  private inside(dt: number, inn: { walk: WalkControls; scene: THREE.Scene }) {
    const h = this.host;
    const w = inn.walk;
    const pl = this.player;
    if (!this.wasIndoors) {
      this.wasIndoors = true;
      this.hud.inside(true);
      this.sound.drive(null);
      this.sound.siren(0);
      inn.scene.add(pl.group);
      this.debris.into(inn.scene);
      // the place's people in 3D too: the zkSNARKs standing in its scene
      this.people.into(inn.scene);
      let found: THREE.Object3D[] = [];
      let foundAt = 0;
      const keys = new WeakMap<object, string>();
      let n = 0;
      this.people.source = (x, z, r) => {
        const now = performance.now();
        if (now - foundAt > 2000) {
          foundAt = now;
          found = [];
          inn.scene.traverse((o) => {
            if (o.userData.snarkRef && o.visible) found.push(o);
          });
        }
        const out: Person3[] = [];
        const at = new THREE.Vector3();
        for (const root of found) {
          const sn = root.userData.snarkRef as { root: THREE.Object3D; id: number; faceDir: THREE.Vector3 | null; seatHeight: number; down: { k: number; side: number }; set3D(on: boolean): void };
          root.getWorldPosition(at);
          if ((at.x - x) ** 2 + (at.z - z) ** 2 > r * r || Math.abs(at.y - pl.pos.y) > 2.5) continue;
          let k = keys.get(sn);
          if (!k) keys.set(sn, (k = `in${++n}`));
          out.push({ key: k, id: sn.id, pos: (o) => root.getWorldPosition(o), down: () => sn.down, face: () => sn.faceDir, seat: () => sn.seatHeight, hide: (on) => sn.set3D(on), alive: () => root.visible && !!root.parent });
        }
        return out;
      };
      pl.group.visible = true;
      pl.place(w.camera.position.x, w.floor, w.camera.position.z, w.heading);
      this.lastWalk.copy(w.camera.position);
      this.cam.behind(w.heading, -0.15);
      this.cam.snap(pl.pos.clone().setY(pl.pos.y + 1.35));
      h.pickCamera(this.cam.camera);
    }
    // the place moved the walker itself (a lift's ride, a stair's landing, a floor picked): the body follows
    if (w.camera.position.distanceTo(this.lastWalk) > 0.05) {
      pl.place(w.camera.position.x, w.floor, w.camera.position.z, pl.facing);
      this.cam.snap(pl.pos.clone().setY(pl.pos.y + 1.35));
    }
    const i = this.input;
    i.poll(dt);
    if (!w.enabled) i.release();
    if (!this.paused) {
      this.cam.turn(i.look.x, i.look.y);
      if (i.hit("KeyP", "pad:start")) this.pause(true);
      if (i.hit("KeyX", "pad:x", "touch:hit")) pl.punch();
    }
    const m = this.paused ? { x: 0, y: 0, mag: 0 } : i.move();
    const follow = this.settings.follow;
    let mx = m.x,
      my = m.y,
      ref = this.cam.yaw;
    if (follow) {
      pl.facing += -m.x * 2.6 * dt;
      ref = pl.facing;
      mx = 0;
      my = m.y < 0 ? m.y * 0.4 : m.y;
    }
    // a lift's ride: you face the doors with it, and once they open you walk out by yourself
    const riding = h.riding();
    if (riding) {
      pl.facing = w.heading;
      this.cam.follow(dt, pl.facing, 0);
      this.liftOut = 0;
      this.rode = true;
    } else if (this.rode) {
      this.rode = false;
      this.liftOut = 1.15;
      this.cam.behind(pl.facing, -0.15);
    }
    if (this.liftOut > 0) {
      this.liftOut -= dt;
      mx = 0;
      my = 0.75;
      ref = pl.facing;
    }
    pl.update(dt, mx, my, follow || this.liftOut > 0 ? Math.abs(my) : m.mag, !this.paused && i.sprint && my > 0, false, ref, {
      blocked: (x, z) => w.blockedAt(x, z),
      floor: (x, z) => w.ground?.(x, z) ?? w.base,
    }, !follow || my >= 0);
    if (follow && i.idleLook > 0.6) this.cam.follow(dt, pl.facing, pl.speed);
    // a room's camera: closer, stopped by the walls (checked finely: they are thin)
    const keep = this.cam.footFar;
    this.cam.footFar = false;
    this.cam.foot(dt, pl.pos, { wall: (x, z) => w.blockedAt(x, z) });
    this.cam.footFar = keep;
    pl.group.visible = this.cam.armLength > 1.15;
    if (pl.landed) this.punchLanded(inn);
    this.debris.update(dt);
    this.people.update(dt, pl.pos.x, pl.pos.z, pl.pos, this.cam.camera.position);
    // the walker where you are
    w.camera.position.set(pl.pos.x, pl.pos.y + 1.6, pl.pos.z);
    w.setFloor(pl.floor);
    w.aim(pl.facing, -0.08);
    this.lastWalk.copy(w.camera.position);
    // the way out: E, or walking into it
    const ex = w.exitAhead();
    const near = !!ex && ex.dist < 2.4 && ex.facing;
    const touch = matchMedia("(pointer: coarse)").matches;
    this.hud.prompt(near ? `<kbd>${touch ? "Tap" : "E"}</kbd> Exit to the street` : null);
    this.hud.doorButton(near);
    if (near && !this.paused && (i.hit("KeyE", "pad:y", "touch:door") || (ex!.dist < 0.9 && pl.speed > 0.5))) w.onExit?.();
    this.hud.indoor(dt, { speed: pl.speed });
  }

  /**
   * The doors of the city's buildings: one in the middle of each street front, against its wall
   * (the solid shape says where the wall is and that the pavement in front is free), not near a
   * place's own door. Only the nearest dozen are drawn.
   */
  private nearDoors(x: number, z: number) {
    if (!this.solid.ready) return;
    if (!this.buildingSpots) {
      const s = this.solid;
      const out: (DoorSpot & { type: string; seed: number })[] = [];
      const wallAt = (px: number, pz: number) => {
        const t = s.topAt(px, pz);
        return t !== undefined && t === t && t > 2;
      };
      const NAMES: Record<string, string[]> = {
        shop: ["KONBINI 24", "ZEC MART", "SHIELD STORE", "NULLIFIER MARKET", "BLOCK SHOP", "MEMO MART"],
        office: ["ORCHARD CAPITAL", "SAPLING & CO", "HALO OFFICES", "PROOF PARTNERS", "VIEWING KEY LTD", "JUBJUB HOLDINGS", "EQUIHASH HOUSE", "TURNSTILE TRUST"],
        home: ["RESIDENCE", "SPROUT COURT", "CANOPY HOUSE", "BLOSSOM MANSION", "NOTE HEIGHTS"],
        cafe: ["CAFÉ ZEC", "THE NONCE", "SHIELDED BEANS", "MEMO CAFÉ"],
        bar: ["BAR 21M", "THE DARK POOL", "BAR NU7", "IZAKAYA ZK"],
      };
      const kindOf = (type: string, seed: number) =>
        type === "streetshop" || type === "kiosk" || type === "bookshop" ? "shop" : type === "izakaya" || type === "machiya" ? (seed % 2 ? "bar" : "cafe") : type === "apartment" || type === "house" ? "home" : type === "shophouse" ? (seed % 3 === 0 ? "cafe" : "shop") : "office";
      const facades = this.host.facades();
      facades.forEach((f, i) => {
        if (["mempool", "depot", "factory", "construction", "landmark", "shrine", "pavilion"].includes(f.type)) return;
        const fx = Math.round(f.out.x),
          fz = Math.round(f.out.z);
        // the wall's run along the front: s/n facades carry it; e/w ones are found along the wall
        let cx: number, cz: number;
        if (fx === 0) {
          cx = (f.x0 + f.x1) / 2;
          cz = f.z;
        } else {
          let a = -0.5,
            b = 0.5;
          while (a > -30 && wallAt(f.x0 - fx * 0.4, f.z + a)) a -= 0.5;
          while (b < 30 && wallAt(f.x0 - fx * 0.4, f.z + b)) b += 0.5;
          cx = f.x0;
          cz = f.z + (a + b) / 2;
        }
        // the wall right behind, the pavement free in front
        let k = 0;
        for (k = -1; k < 4; k += 0.1) if (wallAt(cx - fx * k, cz - fz * k)) break;
        if (k >= 4) return;
        const dx = cx - fx * (k - 0.06),
          dz = cz - fz * (k - 0.06);
        for (const d of [1, 2.5]) {
          const t = s.topAt(dx + fx * d, dz + fz * d);
          if (t === undefined || t !== t || t > 0.7 || t < -0.3) return;
        }
        // on a street (not a back yard): a road within a few metres in front
        let road = false;
        for (let d = 2; d < 14 && !road; d += 1) road = this.roads.road(dx + fx * d, dz + fz * d);
        if (!road) return;
        if (this.placeSpots.some((p) => Math.hypot(p.x - dx, p.z - dz) < 8)) return;
        if (out.some((p) => Math.hypot(p.x - dx, p.z - dz) < 6)) return;
        const seed = (Math.abs(Math.round(dx * 13 + dz * 7)) % 997) + i;
        const kind = kindOf(f.type, seed);
        const names = NAMES[kind];
        out.push({ key: `building:${i}`, x: dx, z: dz, fx, fz, y: s.topAt(dx + fx, dz + fz) ?? 0.2, label: names[seed % names.length], type: f.type, seed });
      });
      this.buildingSpots = out;
    }
    const near = this.buildingSpots
      .map((b) => ({ b, d: Math.hypot(b.x - x, b.z - z) }))
      .filter((o) => o.d < 55)
      .sort((p, q) => p.d - q.d)
      .slice(0, 12)
      .map((o) => o.b);
    this.doors.set([...this.placeSpots, ...near]);
  }

  /**
   * A door against its building: from the place's door point, back to the first wall the street's
   * solid shape has (a facade a few metres behind a forecourt), or out of one it stands in.
   */
  private snapDoor(d: DoorSpot): DoorSpot | null {
    // (the MEMPOOL HQ and the GAME HOUSE have grand entrances of their own)
    if (d.key === "mempool" || d.key === "gamehouse") return { ...d, bare: true };
    const s = this.solid;
    if (!s.ready) return d;
    const wall = (k: number) => {
      const t = s.topAt(d.x - d.fx * k, d.z - d.fz * k);
      return t !== undefined && t === t && t > d.y + 2;
    };
    if (wall(0)) {
      for (let k = -0.1; k > -3; k -= 0.1) if (!wall(k)) return { ...d, x: d.x - d.fx * (k - 0.05), z: d.z - d.fz * (k - 0.05) };
      return d;
    }
    for (let k = 0.1; k < 7; k += 0.1) if (wall(k)) return { ...d, x: d.x - d.fx * (k - 0.06), z: d.z - d.fz * (k - 0.06) };
    return d;
  }

  /** Inside one of the parked cars' boxes (you walk round them). */
  private parkedAt(x: number, z: number) {
    for (const c of this.parked) {
      const p = c.group.position;
      const fx = Math.cos(c.yaw),
        fz = -Math.sin(c.yaw);
      const dx = x - p.x,
        dz = z - p.z;
      const along = dx * fx + dz * fz,
        across = -dx * fz + dz * fx;
      if (Math.abs(along) < c.spec.len / 2 + 0.25 && Math.abs(across) < c.spec.wid / 2 + 0.25) return true;
    }
    return false;
  }

  private drive(dt: number) {
    const car = this.car!;
    const h = this.host;
    const i = this.input;
    const d = this.paused ? { throttle: 0, brake: 0, steer: 0, handbrake: false, nitro: false } : i.drive();
    car.lamps = h.night();
    this.doors.night(h.night());
    car.update(dt, d, this.carWorld(car));
    if (car.hit && car.hit.what === "car" && car.hit.speed > 7) {
      if (this.heat.near(car.hit.x, car.hit.z, 4.5)) this.heat.raise(0.9, "you rammed a police cruiser");
      else this.heat.raise(0.45, `you hit a car at ${Math.round(car.hit.speed * 3.6)} km/h`);
    }
    this.doors.update(dt, null);
    this.player.group.visible = !!this.riding;
    if (this.riding && this.player.body) this.player.body.update(dt, { speed: 0, grounded: true });
    this.hud.doorButton(false);
    // people in the way: hit, they go down (stunned a moment); further ahead, a shout
    this.reactT -= dt;
    if (car.speed > 2.5 && this.reactT <= 0) {
      this.reactT = 0.08;
      const f = car.fwd();
      const p = car.group.position;
      const dir = Math.sign(car.vF) || 1;
      const nx = p.x + f.x * dir * car.spec.len * 0.42,
        nz = p.z + f.y * dir * car.spec.len * 0.42;
      const n = this.knockAll(nx, nz, car.vel.x, car.vel.y, car.spec.wid * 0.65 + Math.min(0.6, car.speed * 0.02));
      if (n) {
        this.sound.crash(Math.min(0.5, car.speed / 40));
        this.cam.shake(0.2);
        if (car.speed > 8) this.heat.raise(0.3 * n, n > 1 ? `you knocked ${n} people down` : "you knocked someone down");
      }
      if (car.speed > 6) h.react(p.x, p.z, f.x, f.y);
    }
    if (car.hit) {
      const k = Math.min(1, car.hit.speed / 18);
      this.cam.shake(k);
      this.sound.crash(k);
      const now = performance.now();
      if (now - this.lastHitAt > 600) this.hits++;
      this.lastHitAt = now;
      if (car.hit.speed > 8) this.peds.panic(car.hit.x, car.hit.z, 16);
      if (car.hit.speed > 14) this.hud.toast("Crash", `${Math.round(car.hit.speed * 3.6)} km/h into ${car.hit.what === "car" ? "a car" : "a wall"}`, "bad");
    }
    // the horn on E (held), the look back on B
    const horn = !this.paused && i.down("KeyE", "KeyQ");
    if (horn !== this.horn) this.sound.hornOn((this.horn = horn));
    this.cam.back = !this.paused && i.down("KeyB");
    this.cam.car(dt, car.group.position, car.yaw, car.speed, car.vF < 0, this.settings.follow ? Math.max(i.idleLook, i.idleLook > 0.5 ? 2 : 0) : i.idleLook, { wall: (x, z) => (this.solid.ready && this.solid.wall(x, z)) || h.nav.wall(x, z) }, car.spec.len);
    this.sound.drive({ rpm: car.rpm, throttle: d.throttle, drift: car.drifting, nitro: car.nosOn, speed: car.speed });
    const strong = this.settings.blur === "strong";
    const blur = this.settings.blur === "off" ? 0 : Math.max(0, car.speed - (strong ? 12 : 28)) / (strong ? 30 : 70);
    h.blur(Math.min(1, blur + (car.nosOn && this.settings.blur !== "off" ? (strong ? 0.25 : 0.12) : 0)));
    this.hud.prompt(null);
  }

  /** The street for a car (yours or a cruiser): its walls, its surface, everything else that moves. */
  private carWorld(self: DriveCar) {
    const h = this.host;
    return {
      resolve: (p: THREE.Vector3, r: number) => {
        if (!this.solid.ready) return h.nav.resolve(p, r);
        this.solid.resolve(p, r);
        h.nav.resolveSmall(p, r);
      },
      outside: (x: number, z: number) => x < h.bounds.x0 || x > h.bounds.x1 || z < h.bounds.z0 || z > h.bounds.z1,
      surface: (x: number, z: number) => this.roads.surface(x, z),
      boxes: () => this.boxes(self),
    };
  }

  /** Everything a car can hit that moves: the traffic, the avenue's cars and buses, the trams, your parked cars, the cruisers. */
  private *boxes(self: DriveCar) {
    for (const m of this.host.traffic.movers) {
      const p = m.group.position;
      const along = m.line.axis === "x";
      const half = m.len / 2;
      yield { x: p.x, z: p.z, hx: along ? half : 0.95, hz: along ? 0.95 : half };
    }
    yield* this.host.vehicles();
    // the other players' cars
    for (const o of this.net.others())
      if (o.car) {
        const cs = Math.abs(Math.cos(o.yaw)),
          sn = Math.abs(Math.sin(o.yaw));
        yield { x: o.x, z: o.z, hx: (cs * 4.4 + sn * 2) / 2.2, hz: (sn * 4.4 + cs * 2) / 2.2 };
      }
    for (const c of [...this.parked, ...this.heat.chasers.map((x) => x.car), ...(this.car ? [this.car] : [])]) {
      if (c === self) continue;
      const p = c.group.position;
      const cs = Math.abs(Math.cos(c.yaw)),
        sn = Math.abs(Math.sin(c.yaw));
      yield { x: p.x, z: p.z, hx: (cs * c.spec.len + sn * c.spec.wid) / 2.2, hz: (sn * c.spec.len + cs * c.spec.wid) / 2.2 };
    }
  }

  private hudFrame(dt: number, at: THREE.Vector3, heading: number) {
    const h = this.host;
    const w = this.roads.where(at.x, at.z, -Math.sin(heading), -Math.cos(heading));
    const people: { x: number; z: number }[] = [];
    for (const p of h.people()) people.push(p);
    for (const p of this.peds.positions()) people.push(p);
    const cars: { x: number; z: number }[] = [];
    for (const m of h.traffic.movers) cars.push({ x: m.group.position.x, z: m.group.position.z });
    for (const c of this.parked) cars.push({ x: c.group.position.x, z: c.group.position.z });
    const car = this.car;
    this.hud.update(
      dt,
      {
        x: at.x,
        z: at.z,
        camYaw: this.cam.yaw,
        heading,
        inCar: !!car,
        speed: car?.speed ?? this.player.speed,
        rpm: car?.rpm ?? 0,
        gear: car?.gear ?? 1,
        nos: car?.nos ?? 0,
        nosOn: car?.nosOn ?? false,
        drift: car?.drifting ?? 0,
        district: w.district,
        street: w.street,
        next: w.next,
        spots: this.missions.spots(),
        places: h.places(),
        people,
        cars,
        goal: this.missions.next(at.x, at.z),
        live: { height: h.height(), since: h.lastBlockAt() ? (Date.now() - h.lastBlockAt()) / 1000 : 0, mempool: h.mempool() },
        heat: { stars: this.heat.stars, chasing: this.heat.chasers.length > 0, losing: this.heat.losing, pin: this.heat.pin },
        cops: this.heat.chasers.map((c) => ({ x: c.car.group.position.x, z: c.car.group.position.z })),
        players: [...this.net.others()].map((o) => ({ x: o.x, z: o.z })),
        online: this.net.count,
      },
      this.settings,
    );
  }

  private progressRows() {
    const p = this.missions.progress;
    const c = this.missions.counts();
    const best = Math.max(0, ...Object.values(p.traps));
    return {
      rows: [
        ["Block runs", `${p.runs}`],
        ["Beat the block", `${p.beat}`],
        ["Shielded rides", `${p.rides}`],
        ["Proof boards", `${c.board.done} / ${c.board.of}`],
        ["Speed traps ★★★", `${c.trap.done} / ${c.trap.of}`],
        ["Top speed", best ? `${Math.round(best)} km/h` : "–"],
        ["Earned here", `${p.earned.toLocaleString("en-US")} ⓩ`],
        ["Playing as", `#${this.player.id}`],
      ] as [string, string][],
      balance: profile.p.z,
    };
  }
}
