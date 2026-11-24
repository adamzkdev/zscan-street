import * as THREE from "three";
import { profile } from "../game/profile";
import type { WalkControls } from "../interior/walk";
import type { CityTraffic } from "../scene/citytraffic";
import type { Nav } from "../scene/nav";
import { viaductBents } from "../scene/city/plan";
import { CAR_VIEWS, GtaCamera } from "./camera";
import { StreetSolid } from "./collide";
import { KEYS } from "../scene/keys/plan";
import { DOOR_HALF, Doors, ropes, type DoorSpot } from "./doors";
import { FootPlayer } from "./foot";
import { FrontEnd, type StartAt } from "./frontend";
import { DEFAULTS, GtaHud, type MapData, type Settings } from "./hud";
import { PLACE_CAT, WAYPOINT, type Cat } from "./mapkit";
import { NU7_LINE, ZEC_LINE } from "../scene/metro";
import { GtaInput } from "./input";
import { KIND_COLOR, Missions } from "./missions";
import { WorldNet } from "./net";
import { People3D, type Person3 } from "./people3d";
import { useAtlasCells } from "../scene/snarkbody";
import { Peds } from "./peds";
import { Debris, Fallen } from "./debris";
import { PROP_HOLES, PROP_HOLE_N } from "../scene/voxel/mesher";
import { Breakables } from "./breakables";
import { StreetProps } from "./streetprops";
import { Heat } from "./police";
import { Roads } from "./roads";
import { GtaSound, type AudioOut } from "./sound";
import { CarRadio } from "./radio";
import { SkyClock, WEATHER_NAME, weatherIcon } from "./skyclock";
import type { Daylight } from "../scene/daylight";
import { SwimFx } from "./swim";
import { Beach } from "./beach";
import { DriveCar, SPECS, type CarBox, type VehicleKind } from "./vehicle";
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
 *   `gta.front.open` → draw the street with `gta.front.camera` (the title, the menu, the line-up).
 *   Esc → `gta.escape()`.
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
  /** The street furniture as the plan has it (what a car can knock down). */
  furniture(): { type: string; x: number; z: number; y: number }[];
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
  places(): { x: number; z: number; label: string; icon?: string; key?: string }[];
  hq(): { x: number; z: number } | null;
  audio(): AudioOut | null;
  soundOn(): boolean;
  toggleSound(): void;
  /** The sound on at a first gesture (unless the visitor switched it off). */
  startSound(): void;
  /** The front end's golden-hour look over the street (false: the street's own sky again). */
  menuLook(on: boolean): void;
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
  /** The game's colour grade on the street's picture (on while playing). */
  grade?(on: boolean): void;
  /** The game's time of day and weather painted on the street every frame (null: back to the street's own theme). */
  tod?(d: Daylight | null): void;
  /** A thunderclap (after the lightning). */
  thunder?(): void;
  /** A car of some other traffic (the bridge's) knocked out of it: its body and kind, or null. */
  takeCar?(ref: unknown): { group: THREE.Group; kind: VehicleKind } | null;
  /** People in a car's way react (a shout, a jump): from (x, z) along (fx, fz). */
  react(x: number, z: number, fx: number, fz: number): void;
  /** The street's arrest: a patrol, a night on the rock. */
  arrest(): void;
  /** A conversation with zkSNARK #id (the street's talk, in character); false if it can't open. */
  talk(id: number, done: () => void): boolean;
  talking(): boolean;
  closeTalk(): void;
  /** Inside a place: use what is at (x, y) on the screen (talk, a panel, a game); false if nothing. */
  useAt(x: number, y: number): boolean;
  useLabel(x: number, y: number): string | null;
  /** Across the Golden Gate: the height under a wheel where it is not the street's (the deck, the tunnel, the sand), or null. */
  carSurface(x: number, z: number): number | null;
  /** On the bridge's deck a car is held between its railings (true: the deck's to rule, not the solid shape's). */
  carHold(p: THREE.Vector3, r: number): boolean;
  /** The Golden Gate's deck, Orchard Keys and its tunnel: outside what the street's own plan (its nav) knows. */
  beyond(x: number, z: number): boolean;
  /** The sea you can wade and swim in there (Orchard Keys' beaches): its floor and its surface, or null. */
  sea?(x: number, z: number): { floor: number; surface: number } | null;
  /** The ear under the water (muffled) or not. */
  underwater?(on: boolean): void;
}

const SETTINGS_KEY = "zstreet.gta.settings";
/** The game's day and night (s). */
const ACTIVE_KEY = "zstreet.gta.alive";

export class GtaMode {
  active = false;
  /** In a menu or the map: the world runs, you do not. */
  paused = false;
  readonly cam = new GtaCamera();
  readonly input: GtaInput;
  readonly hud: GtaHud;
  /** The title, the main menu, the line-up to choose your zkSNARK (src/gta/frontend.ts). */
  readonly front: FrontEnd;
  /** (the front end's old name, for the tests) */
  get garage() {
    return this.front;
  }
  readonly roads = new Roads();
  readonly player = new FootPlayer();
  readonly missions: Missions;
  readonly sound: GtaSound;
  readonly radio: CarRadio;
  readonly swim: SwimFx;
  readonly beach: Beach;
  readonly heat: Heat;
  readonly solid: StreetSolid;
  readonly doors: Doors;
  readonly net: WorldNet;
  readonly people: People3D;
  readonly peds: Peds;
  readonly debris = new Debris();
  readonly fallen = new Fallen();
  /** The furniture knocked down (keys), in the order it went (the oldest stands up again past 48). */
  private down: string[] = [];
  private furnGrid: Map<string, { type: string; x: number; z: number; y: number; key: string }[]> | null = null;
  readonly breakables: Breakables;
  readonly props: StreetProps;
  car: DriveCar | null = null;
  /** The bike's seat you sit on, while riding one. */
  private riding: THREE.Group | null = null;
  /** Every building's door the game could put on a facade (found once the solid shape is in), and those drawn now. */
  private buildingSpots: (DoorSpot & { type: string; seed: number; kind?: string })[] | null = null;
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
  private viewDir = new THREE.Vector3();
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
  /** Your health (0…100): fists hurt, it comes back a little at a time out of a fight. */
  hp = 100;
  private hurtAt = 0;
  /** Down and out: seconds into it (−1: on your feet). */
  private wastedT = -1;
  /** The passer-by you are talking with (the street's talk is open), and when the last talk closed. */
  private talkWith: import("./peds").Ped | null = null;
  private talkShut = 0;

  constructor(private host: GtaHost) {
    this.input = new GtaInput(host.canvas);
    this.input.stick = host.walker.stick;
    this.settings = { ...DEFAULTS, ...this.loadSettings() };
    this.sound = new GtaSound(() => host.audio());
    this.swim = new SwimFx(host.scene, host.ui, () => host.audio(), (on) => host.underwater?.(on));
    this.radio = new CarRadio(() => host.audio(), host.ui, { height: () => host.height(), mempool: () => host.mempool() });
    this.front = new FrontEnd({
      scene: host.scene,
      ui: host.ui,
      surface: (x, z) => this.roads.surface(x, z),
      road: (x, z) => this.roads.road(x, z),
      blocked: (x, z) => host.footBlocked(x, z),
      startSound: () => host.startSound(),
      look: (on) => host.menuLook(on),
      settings: (tab) => {
        if (tab) this.hud.openTab(tab);
        this.hud.front(true);
      },
      live: () => {
        const at = host.lastBlockAt();
        const g = this.clock.glyph;
        let online = 1;
        for (const _ of this.net.others()) online++;
        return {
          block: host.height(),
          // (a block every 75 s on average)
          nextIn: at ? Math.max(0, 75 - (Date.now() - at) / 1000) : null,
          mempool: host.mempool(),
          online,
          clock: this.clock.time,
          weather: WEATHER_NAME[g.kind],
          weatherIcon: weatherIcon(g.kind, g.night),
        };
      },
    });
    this.hud = new GtaHud(host.ui, {
      // (over the front end, the menu panel is its settings: closing it goes back to the front end)
      resume: () => (this.front.open ? this.hud.front(false) : this.resume()),
      leave: () => this.stop(),
      garage: () => {
        if (!this.front.open) return this.openGarage();
        this.hud.front(false);
        this.front.select();
      },
      teleport: (x, z) => this.teleport(x, z),
      waypoint: (p) => this.setWaypoint(p),
      where: (x, z) => this.roads.where(x, z),
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
    this.hud.mapData = () => this.mapData();
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
    // Orchard Beach's own people, and the passers-by's walks along its sand
    this.beach = new Beach(host.scene);
    this.peds.extra = Beach.walks();
    this.peds.events = {
      hitMe: (dmg, x, z) => this.hurtMe(dmg, x, z),
      report: (why) => this.heat.raise(1, why),
    };
    this.people = new People3D(host.scene, (x, z, r) => [...this.peds.near(x, z, r), ...this.beach.near(x, z, r), ...host.people3d(x, z, r)]);
    this.breakables = new Breakables(this.debris);
    this.props = new StreetProps(host.scene, this.debris);
    host.interiorWalker.mover = () => this.active;
    this.solid = new StreetSolid({
      renderer: host.renderer,
      scene: host.scene,
      area: { x0: host.bounds.x0 - 4, x1: host.bounds.x1 + 4, z0: host.bounds.z0 - 4, z1: host.bounds.z1 + 4 },
      // (and Orchard Keys, across the bridge, in a picture of its own)
      extra: [{ x0: KEYS.x0, x1: KEYS.x1, z0: KEYS.z0, z1: KEYS.z1 }],
      movers: () => [...host.movers(), this.player.group, this.doors.group, this.missions.group, this.net.group, this.people.group, this.props.group, this.debris.mesh, this.peds.group, this.front.group, ...this.parked.map((c) => c.group), ...this.heat.chasers.map((c) => c.car.group), ...(this.car ? [this.car.group] : [])],
      surface: (x, z) => this.roads.surface(x, z),
      road: (x, z) => this.roads.road(x, z),
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
        const own = ["Tab", "KeyF", "KeyC", "KeyT", "KeyB", "KeyP", "KeyM", "KeyR", "KeyX"].includes(e.code) || (this.car && ["KeyE", "Space", "KeyQ", "KeyH", "Period", "Comma"].includes(e.code)) || (!this.car && (e.code === "KeyE" || e.code === "KeyQ"));
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

  /** The title screen (in the street), its menu, then play as the zkSNARK picked there. */
  start(): void {
    if (this.active) return this.openGarage();
    if (this.front.open) return;
    if (document.pointerLockElement) document.exitPointerLock();
    // the street's people in 3D round the shot, as in the game
    useAtlasCells(true);
    this.people.show(true);
    this.front.show({
      play: (id, at, then) => {
        this.play(id, at);
        // Missions: straight to the big map and its list of challenges
        if (then === "map" && this.active) setTimeout(() => this.active && this.hud.toggleMap(true), 700);
      },
      close: () => {
        if (!this.active) this.people.show(false);
      },
    });
  }

  /** In the game: the line-up, to be someone else. */
  private openGarage(): void {
    if (!this.active) return this.start();
    this.hud.pause(false);
    this.paused = true;
    if (document.pointerLockElement) document.exitPointerLock();
    this.front.show({
      select: true,
      inGame: true,
      play: (id) => {
        this.player.wear(id);
        this.paused = false;
        this.hud.toast(`zkSNARK #${id}`, "that's you now", "gold");
      },
      close: () => {
        this.paused = this.hud.paused;
      },
    });
  }

  /** Into the street as zkSNARK #id (from the title: by your car, where it was shot). */
  play(id = FrontEnd.chosen(), at: StartAt | null = null) {
    const h = this.host;
    if (!h.walking()) h.setWalking(true);
    if (!h.walking()) return;
    if (at) h.walker.place(new THREE.Vector3(at.x, h.curb, at.z), at.heading, h.curb);
    this.active = true;
    this.paused = false;
    h.grade?.(true);
    // the city's sound with the game (its ambiences, the monuments' music, the car radio): on the
    // first key or click, unless it was switched off (browsers only let it start on a gesture)
    if (!h.soundOn()) {
      const wake = () => {
        window.removeEventListener("keydown", wake, true);
        window.removeEventListener("pointerdown", wake, true);
        if (this.active) h.startSound();
      };
      window.addEventListener("keydown", wake, true);
      window.addEventListener("pointerdown", wake, true);
    }
    this.skyWas = h.skyPref();
    this.clock.reset();
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
    this.host.scene.add(this.fallen.group);
    this.peds.show(true);
    this.peds.crowd = this.settings.crowd;
    // dozens of zkSNARKs in 3D: their pictures from the collection's atlas, not a request each
    useAtlasCells(true);
    this.debris.into(this.host.scene);
    this.hud.show(true);
    // the street's solid shape (once, and again when the far city has streamed in)
    if (!this.solid.ready) {
      void this.solid.build().then(() => {
        if (!this.active) return;
        this.placeSpots = this.host.doors().flatMap((d) => this.snapDoor(d) ?? []);
        this.buildingSpots = null;
        this.doors.set(this.placeSpots);
        this.computeAccess();
      });
      setTimeout(() => this.active && void this.solid.build(), 40_000);
    }
    // your own car: where the title showed it, else parked on the nearest street
    if (at && !this.parked.some((c) => c.kind === "gt")) {
      const car = new DriveCar("gt");
      car.place(at.car.x, at.car.z, at.car.yaw);
      this.host.scene.add(car.group);
      this.parked.push(car);
    }
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
    h.ui.classList.remove("gta-on", "gta-map-on");
    this.hud.pause(false);
    this.hud.toggleMap(false);
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
    // everything knocked down stands again
    this.fallen.clear();
    this.down = [];
    PROP_HOLE_N.value = 0;
    this.breakables.restore();
    this.host.pickCamera(null);
    this.host.tod?.(null);
    this.hud.clock(null);
    this.host.setSky(this.skyWas);
    if (this.player.group.parent !== this.host.scene) this.host.scene.add(this.player.group);
    this.heat.clear();
    this.sound.siren(0);
    this.radio.car(false);
    this.swim.reset();
    this.beach.hide();
    h.grade?.(false);
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
    if (this.talkWith || performance.now() - this.talkShut < 300) return this.host.closeTalk();
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
        const kind = m.kind as VehicleKind;
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
    this.radio.car(true);
    this.swim.reset();
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
    this.radio.car(false);
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
    // (the hips on the saddle: the riding pose sits them 0.1 m over the feet's origin)
    seat.position.set(MOTO_SEAT.x - 0.08, MOTO_SEAT.y - 0.1, 0);
    // facing along the bike (its +x): the body's own front is +z
    seat.rotation.y = Math.PI / 2;
    seat.add(b.root);
    b.root.position.set(0, 0, 0);
    b.root.rotation.set(0, 0, 0);
    pivot.add(seat);
    this.player.riding = true;
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
    this.player.riding = false;
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
    if (this.front.open) {
      this.front.update(dt);
      // the street's people round the shot, in 3D
      const c = this.front.camera;
      this.people.update(dt, this.front.focus.x, this.front.focus.z, null, c.position, c.getWorldDirection(this.viewDir));
    }
    if (!this.active) return;
    this.radio.update(dt);
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
    this.loose(dt);
    // the walker stands where you are: doors, talk, traffic, sound all follow
    const at = this.car ? this.car.group.position : this.player.pos;
    h.walker.camera.position.set(at.x, (this.car ? Math.max(0, this.car.group.position.y) : this.player.pos.y) + 1.6, at.z);
    h.walker.setFloor(this.car ? h.curb : this.player.floor);
    const heading = this.car ? this.car.yaw - Math.PI / 2 : this.player.facing;
    h.walker.aim(heading, -0.08);
    // the lights and shadows follow a point ahead of you
    const ahead = this.car ? 6 + this.car.speed * 0.3 : 4;
    this.focus.set(at.x - Math.sin(heading) * ahead, 0, at.z - Math.cos(heading) * ahead);
    this.missions.update(dt, { x: at.x, z: at.z, inCar: !!this.car, speed: this.car?.speed ?? this.player.speed, hits: this.hits });
    const vel = this.car ? { vx: this.car.vel.x, vz: this.car.vel.y } : { vx: this.player.vel.x, vz: this.player.vel.z };
    const near = this.heat.update(dt, { x: at.x, z: at.z, ...vel, speed: this.car?.speed ?? this.player.speed, inCar: !!this.car }, (self) => this.carWorld(self));
    for (const ch of this.heat.chasers) this.shove(ch.car);
    this.sound.siren(this.heat.chasers.length ? Math.max(0.15, 1 - near / 140) : 0);
    if (!this.front.open) this.people.update(dt, at.x, at.z, this.car ? null : this.player.pos, this.cam.camera.position, this.cam.camera.getWorldDirection(this.viewDir));
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
      this.hud.toast(this.settings.sky === "cycle" ? "Day and night cycle" : this.settings.sky === "clock" ? "Sky follows your clock" : this.settings.sky === "day" ? "Afternoon" : "Night", "sky · T");
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
    // the car radio: Q (or . and ,, or the pad's left and right) to the next station
    if (this.car && i.hit("KeyQ", "Period", "pad:right")) this.radio.turn(1);
    if (this.car && i.hit("Comma", "pad:left")) this.radio.turn(-1);
    if (!this.car && this.wastedT < 0 && i.hit("KeyX", "Mouse0", "pad:x", "touch:hit")) this.player.punch();
    // someone to talk to (no door in reach): E, and the street's talk opens with them
    if (!this.car && !this.doors.at && this.talkable && !this.talkWith && i.hit("KeyE", "touch:door")) this.startTalk(this.talkable);
    // at a door: in
    if (!this.car && this.doors.at && i.hit("KeyE", "pad:x", "touch:door")) {
      this.sound.blip("door");
      const d = this.doors.at as DoorSpot & { type?: string; seed?: number; to?: { x: number; z: number } };
      if (d.key.startsWith("ferry:") && d.to) {
        const t = d.to;
        this.hud.toast(d.label, "across the bay", "teal");
        this.player.place(t.x, this.solid.topAt(t.x, t.z) ?? 0.2, t.z, d.fz > 0 ? Math.PI : 0);
        this.cam.behind(this.player.facing, -0.15);
        this.cam.snap(this.player.pos.clone().setY(this.player.pos.y + 1.35));
      } else if (d.key.startsWith("building:")) this.host.enterBuilding({ x: d.x, z: d.z, fx: d.fx, fz: d.fz, type: d.type ?? "office", name: d.label, seed: d.seed ?? 1 });
      else this.host.enter(d.key);
    }
    if (this.hud.coaching && i.hit("Enter")) this.hud.coach(-1);
  }

  private walk(dt: number) {
    const h = this.host;
    const i = this.input;
    // (the talk closed some other way: you are free again)
    if (this.talkWith && !this.host.talking()) {
      this.peds.listen(this.talkWith, false);
      this.talkWith = null;
    }
    const held = this.paused || this.wastedT >= 0 || !!this.talkWith;
    const m = held ? { x: 0, y: 0, mag: 0 } : i.move();
    const solid = this.solid;
    const pl = this.player;
    this.life(dt);
    // fists up (the right button, Q): you face the nearest one in front, the way the games lock on
    pl.guard = !held && i.guard;
    if (pl.guard) {
      const t = this.peds.talkable(pl.pos.x, pl.pos.z, -Math.sin(pl.facing), -Math.cos(pl.facing)) ?? this.lockOn();
      if (t) {
        const want = Math.atan2(-(t.pos.x - pl.pos.x), -(t.pos.z - pl.pos.z));
        let d = want - pl.facing;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        pl.facing += d * Math.min(1, dt * 10);
      }
    }
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
    // the sea at your feet (Orchard Keys' beaches): how deep it is there; the camera may follow you under
    const seaHere = h.sea?.(pl.pos.x, pl.pos.z) ?? null;
    {
      const c = this.camera.position;
      const under = h.sea?.(c.x, c.z);
      this.cam.minY = under ? under.floor + 0.3 : seaHere ? seaHere.floor + 0.3 : 0.35;
    }
    pl.water = seaHere ? Math.max(0, seaHere.surface - seaHere.floor) : 0;
    this.player.update(dt, mx, my, follow ? Math.abs(my) + (m.x !== 0 && my === 0 ? 0 : 0) : m.mag, !this.paused && i.sprint && my > 0, !this.paused && i.jump, ref, {
      blocked: (x, z, feet) => {
        if (this.parkedAt(x, z) && feet < 1.2) return true;
        // the low sand and the sea: walked, waded, swum; what stands up out of them stops you (a
        // pier's pile, a tower's legs, a sandcastle), and the sea's far edge
        const sea = h.sea?.(x, z);
        if (sea) {
          if (h.footSmall(x, z)) return true;
          if (!solid.ready) return false;
          const t = solid.topAt(x, z);
          const top = t !== undefined && t === t ? t : -99;
          // up on something over the water (the sand, a pier's deck): a step up is climbed, more stops
          // you; off its edge you drop in (a jump off the pier)
          if (pl.floor > sea.surface + 0.3) return top > Math.max(pl.floor, feet) + 0.62;
          // in the water: what stands up out of it stops you (a pile, a tower's legs, a sandcastle)
          return top > Math.max(sea.floor, Math.min(feet, sea.surface - 0.4)) + 0.62;
        }
        // a door is shut: its leaves stop you (E opens it)
        if (this.doorShut(x, z)) return true;
        // in front of a door: always a way in (whatever stands there, short of water)
        if (solid.ready && this.doorway(x, z)) {
          const t = solid.topAt(x, z);
          return t === undefined || t !== t || t < -0.35;
        }
        // (the rock, the bridge, the woods, the platforms: their own rules)
        if (!solid.ready || h.footSpecial(x, z)) return h.footBlocked(x, z);
        if (!h.beyond(x, z) && (x < h.bounds.x0 || x > h.bounds.x1 || z < h.bounds.z0 || z > h.bounds.z1)) return true;
        // in the air: what is under the feet is cleared (a hedge, a bench, a low wall)
        const up = Math.max(pl.floor, feet);
        return !solid.foot(x, z, up).ok || (feet < pl.floor + 0.5 && (h.footSmall(x, z) || h.dynamicHit(x, z)));
      },
      floor: (x, z, feet) => {
        const sea = h.sea?.(x, z);
        if (sea && solid.ready && pl.floor > sea.surface + 0.3) {
          // on the sand or a deck over the water: its own floor while there is one within a step
          const t = solid.topAt(x, z);
          if (t !== undefined && t === t && Math.abs(t - pl.floor) < 0.66) return t;
        }
        if (sea) {
          // waist deep and more you float: low and flat in a crawl, upright treading water; the
          // floor again as it shallows (one continuous height, no step)
          const depth = sea.surface - sea.floor;
          const go = Math.min(1, Math.max(0, (pl.speed - 0.25) / 1.1));
          // (Space held: a dive, down under the surface)
          const dive = this.input.down("Space") || this.input.pad.a ? 1.5 : 0;
          const afloat = Math.max(sea.floor + 0.15, sea.surface - (0.9 - 0.52 * go) - dive);
          const w = Math.min(1, Math.max(0, (depth - 0.95) / 0.4));
          return sea.floor + (afloat - sea.floor) * w * w * (3 - 2 * w);
        }
        if (solid.ready && this.doorway(x, z)) {
          // the steps up to a door: climbed; anything higher walked past
          const t = solid.topAt(x, z) ?? pl.floor;
          return t === t && t < pl.floor + 1.05 ? Math.max(-0.05, t) : pl.floor;
        }
        const g = h.ground(x, z);
        if (g !== null) return g;
        if (!solid.ready) return h.curb;
        const f = solid.foot(x, z, Math.max(pl.floor, feet));
        return f.ok && Number.isFinite(f.floor) ? Math.max(-0.05, f.floor) : pl.floor;
      },
    }, !follow || my >= 0);
    // behind you again a moment after a look round (always, with the follow camera)
    if (follow && i.idleLook > 0.6) this.cam.follow(dt, pl.facing, pl.speed);
    // (the camera stops at what would hide you: a building, a tree's crown; not a lamp post, a sign,
    // a bus shelter's roof or a stall, which it passes, the way the games' cameras do)
    this.cam.foot(dt, this.player.pos, { wall: (x, z) => (solid.ready && solid.wall(x, z) && (solid.topAt(x, z) ?? 0) > 3.6 && !solid.thinAt(x, z)) || (!h.beyond(x, z) && h.nav.wall(x, z)) || this.crown(x, z) });
    pl.group.visible = this.cam.armLength > 0.8;
    // in the sea: rings, splashes, the view under the surface
    {
      const here = h.sea?.(pl.pos.x, pl.pos.z) ?? null;
      const c = this.camera.position;
      const camSea = h.sea?.(c.x, c.z) ?? null;
      this.swim.update(dt, pl.pos, here ? Math.max(0, here.surface - here.floor) : 0, pl.speed, pl.facing, here?.surface ?? 0, this.camera, camSea ? camSea.surface - camSea.floor : null);
    }
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
    this.talkable = door || this.talkWith || this.wastedT >= 0 || pl.guard ? null : this.peds.talkable(pl.pos.x, pl.pos.z, -Math.sin(pl.facing), -Math.cos(pl.facing));
    this.hud.prompt(
      this.wastedT >= 0 || this.talkWith
        ? null
        : door
          ? `<kbd>${touch ? "Tap" : "E"}</kbd> ${door.key.startsWith("ferry:") ? "Board" : "Enter"} · ${door.label}`
          : r
            ? `<kbd>F</kbd> ${r.car ? (r.kind === "gt" ? "Get in your ZK-GT" : `Get in the ${r.name.toLowerCase()}`) : `Take the ${r.name.toLowerCase()}`}`
            : this.talkable
              ? `<kbd>${touch ? "Tap" : "E"}</kbd> Talk · zkSNARK #${this.talkable.id}`
              : null,
    );
    this.hud.doorButton(!!door || !!this.talkable);
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
    this.fallen.update(dt);
    const car = this.car;
    if (car && car.speed > 4) this.knockFurniture(car);
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
      this.peds.room = Math.round(this.people.limit * 0.6);
      const at = this.car ? this.car.group.position : this.player.pos;
      const fy = this.cam.yaw;
      this.beach.update(dt, at);
      this.peds.update(dt, { x: at.x, z: at.z, onFoot: !this.car, speed: this.car?.speed ?? this.player.speed, id: this.player.id, fx: -Math.sin(fy), fz: -Math.cos(fy), guard: !this.car && this.player.guard, down: this.wastedT >= 0 }, this.pedWorld(), { height: this.host.height(), at: this.host.lastBlockAt(), mempool: this.host.mempool() });
    }
    if (this.player.landed) this.punchLanded(null);
  }

  /** The sky: the setting's, or the game's own cycle (9 min of day, 5 of night). */
  /**
   * The game's day and weather (skyclock.ts): the hour moves on (not while the menu or the map is
   * open), the weather turns now and then, and the street paints itself with it every frame
   * (scene/daylight.ts through the host); the clock on the location card.
   */
  readonly clock = new SkyClock();
  private clockT = 0;
  private sky(dt: number) {
    if (this.skyT < 0) this.skyT = 0;
    const d = this.clock.update(this.paused ? 0 : dt, this.settings.sky, this.settings.weather ?? "dynamic");
    this.host.tod?.(d);
    if (this.clock.struck) this.host.thunder?.();
    this.clockT -= dt;
    if (this.clockT <= 0) {
      this.clockT = 1;
      const g = this.clock.glyph;
      this.hud.clock(this.clock.time, weatherIcon(g.kind, g.night));
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

  /** Kinds a car knocks down: how close it must come, the column taken out of the city (radius, height), the pieces. */
  private static FURN: Record<string, { hit: number; r: number; h: number; colors: string[]; slow: number }> = {
    lamp: { hit: 0.35, r: 1.5, h: 7.5, colors: ["#2a2a32", "#3a3a44", "#fff1d6"], slow: 0.8 },
    tree: { hit: 0.45, r: 2.7, h: 11, colors: ["#3f8a3a", "#2f6b2c", "#5a3d26", "#4f9a44"], slow: 0.75 },
    maple: { hit: 0.45, r: 2.7, h: 11, colors: ["#c0482e", "#e06a3a", "#5a3d26"], slow: 0.75 },
    bench: { hit: 0.7, r: 1.2, h: 1.6, colors: ["#7a5236", "#2a2a32"], slow: 0.9 },
    bollard: { hit: 0.3, r: 0.5, h: 2, colors: ["#1a1a20", "#f4b728"], slow: 0.95 },
    hydrant: { hit: 0.35, r: 0.5, h: 2, colors: ["#c0302e", "#e8e4dc"], slow: 0.9 },
    trashBin: { hit: 0.45, r: 0.7, h: 2, colors: ["#2a4a3a", "#1a1a20"], slow: 0.93 },
    vending: { hit: 0.6, r: 0.9, h: 2.8, colors: ["#e8e4dc", "#3fa8ff", "#c0302e"], slow: 0.85 },
    bicycle: { hit: 0.6, r: 1, h: 1.8, colors: ["#c0302e", "#1a1a20"], slow: 0.95 },
    cone: { hit: 0.3, r: 0.4, h: 1.2, colors: ["#ff6a1a", "#f2f2ee"], slow: 0.98 },
    mailbox: { hit: 0.35, r: 0.5, h: 2, colors: ["#c0302e"], slow: 0.93 },
    streetSign: { hit: 0.3, r: 0.5, h: 3.5, colors: ["#2a4fa8", "#e8e4dc"], slow: 0.95 },
    stopPole: { hit: 0.3, r: 0.5, h: 3.5, colors: ["#e8e4dc", "#c0302e"], slow: 0.95 },
    taxiSign: { hit: 0.3, r: 0.5, h: 3.5, colors: ["#f2c230", "#1a1a20"], slow: 0.95 },
    planter: { hit: 0.6, r: 1, h: 2.5, colors: ["#6a6470", "#3f8a3a"], slow: 0.88 },
    stoneLantern: { hit: 0.4, r: 0.6, h: 2.2, colors: ["#8a8690"], slow: 0.9 },
    barrel: { hit: 0.4, r: 0.6, h: 1.6, colors: ["#7a5236"], slow: 0.93 },
  };

  /** The car's front sweeps the street furniture: what it touches goes down. */
  private knockFurniture(car: DriveCar) {
    if (!this.furnGrid) {
      this.furnGrid = new Map();
      for (const [i, f] of this.host.furniture().entries()) {
        if (!GtaMode.FURN[f.type]) continue;
        const k = `${Math.floor(f.x / 4)},${Math.floor(f.z / 4)}`;
        (this.furnGrid.get(k) ?? this.furnGrid.set(k, []).get(k)!).push({ ...f, key: `f${i}` });
      }
    }
    const p = car.group.position;
    const fx = Math.cos(car.yaw),
      fz = -Math.sin(car.yaw);
    const dir = Math.sign(car.vF) || 1;
    const cx = Math.floor(p.x / 4),
      cz = Math.floor(p.z / 4);
    for (let i = -1; i <= 1; i++)
      for (let j = -1; j <= 1; j++)
        for (const f of this.furnGrid.get(`${cx + i},${cz + j}`) ?? []) {
          if (this.down.includes(f.key)) continue;
          const spec = GtaMode.FURN[f.type];
          // in the car's box (along its length, across its width), the front half when going forward
          const dx = f.x - p.x,
            dz = f.z - p.z;
          const along = (dx * fx + dz * fz) * dir,
            across = Math.abs(-dx * fz + dz * fx);
          if (along < -car.spec.len * 0.1 || along > car.spec.len / 2 + spec.hit || across > car.spec.wid / 2 + spec.hit) continue;
          this.knockDown(f, spec, car.vel.x, car.vel.y);
          car.vel.multiplyScalar(spec.slow);
          car.vF *= spec.slow;
          this.cam.shake(spec.slow < 0.85 ? 0.35 : 0.15);
          this.sound.crash(spec.slow < 0.85 ? 0.5 : 0.25);
        }
  }

  private knockDown(f: { type: string; x: number; z: number; y: number; key: string }, spec: (typeof GtaMode.FURN)[string], vx: number, vz: number) {
    // the standing copy folded away (the oldest knocked down stands again past 48)
    if (this.down.length >= 48) {
      const back = this.down.shift()!;
      this.fallen.raise(back);
    }
    this.down.push(f.key);
    const H = PROP_HOLES.value;
    const n = this.down.length - 1;
    // (the holes in the same order as `down`: the list rewritten when the oldest goes)
    if (n < H.length) H[n].set(f.x, f.z, spec.r, f.y + spec.h);
    if (this.down.length === 48) {
      const all = this.host.furniture();
      this.down.forEach((k, i) => {
        const g = all[Number(k.slice(1))];
        const sp = GtaMode.FURN[g.type];
        H[i].set(g.x, g.z, sp.r, g.y + sp.h);
      });
    }
    PROP_HOLE_N.value = this.down.length;
    this.fallen.fall(f.key, f.type, f.x, f.y, f.z, vx, vz);
    const box = new THREE.Box3(new THREE.Vector3(f.x - spec.r * 0.4, f.y, f.z - spec.r * 0.4), new THREE.Vector3(f.x + spec.r * 0.4, f.y + Math.min(spec.h, 3), f.z + spec.r * 0.4));
    this.debris.into(this.host.scene);
    this.debris.burst(box, spec.colors.map((c) => new THREE.Color(c)), new THREE.Vector3(vx, 0, vz).multiplyScalar(0.5), f.y, f.type === "lamp" || f.type === "tree" || f.type === "maple" ? 10 : undefined);
  }

  /** Everyone hit within `r` of (x, z): the street's people and the game's passers-by. */
  private knockAll(x: number, z: number, vx: number, vz: number, r: number) {
    return this.host.knock(x, z, vx, vz, r) + this.peds.knock(x, z, vx, vz, r);
  }

  /** The people in the road the traffic must wait for (you on foot, passers-by crossing). */
  /** Orchard Keys has been built (across the bridge): its solid shape drawn, its doors and pavements found. */
  keysReady() {
    // (the game not started yet: its first build will see the town; started and still building: once it is done)
    if (!this.active && !this.solid.ready) return;
    if (!this.solid.ready) return void setTimeout(() => this.keysReady(), 1500);
    void this.solid.buildMore().then(() => {
      this.buildingSpots = null;
      this.peds.relines();
    });
  }

  trafficBlockers(): { x: number; z: number }[] {
    if (!this.active || this.wasIndoors) return [];
    const out = [...this.peds.inRoad(this.pedWorld())];
    if (!this.car && this.roads.road(this.player.pos.x, this.player.pos.z)) out.push({ x: this.player.pos.x, z: this.player.pos.z });
    // a wreck in the road: the traffic stops behind it (it drove through them) until it is towed
    for (const c of this.wrecks.keys()) {
      const p = c.group.position;
      if (c !== this.car && this.roads.road(p.x, p.z)) out.push({ x: p.x, z: p.z });
    }
    return out;
  }

  private pedWorldCache: { free(x: number, z: number): boolean; wall(x: number, z: number): boolean; floor(x: number, z: number): number; road(x: number, z: number): boolean; stand(x: number, z: number): boolean; seen(x: number, z: number): boolean } | null = null;
  private pedWorld() {
    // (the beach's low sand, down to the water's edge, is ground to walk on: the solid shape calls
    // anything that low a hole)
    const sand = (x: number, z: number) => {
      const s = this.host.sea?.(x, z);
      return s && s.floor > s.surface + 0.04 ? s.floor : null;
    };
    const propOnSand = (x: number, z: number, f: number) => {
      const t = this.solid.topAt(x, z);
      return (t !== undefined && t === t && t > f + 0.5) || this.host.footSmall(x, z);
    };
    return (this.pedWorldCache ??= {
      free: (x: number, z: number) => {
        const sf = sand(x, z);
        if (sf !== null) return !propOnSand(x, z, sf);
        if (!this.solid.ready) return !this.host.nav.wall(x, z);
        const t = this.solid.topAt(x, z);
        return t !== undefined && t === t && t > -0.3 && t < 0.7 && !this.host.footSmall(x, z);
      },
      floor: (x: number, z: number) => {
        const sf = sand(x, z);
        if (sf !== null) return sf;
        const t = this.solid.topAt(x, z);
        if (t !== undefined && t === t && t > -0.3 && t < 2.2) return t;
        return this.host.ground(x, z) ?? 0.2;
      },
      stand: (x: number, z: number) => {
        if (!this.solid.ready) return false;
        const t = this.solid.topAt(x, z);
        if (t === undefined || t !== t || t < -0.3 || t > 2.2 || this.host.footSmall(x, z)) return false;
        // flat round it (not the edge of a step)
        for (const [dx, dz] of [[0.45, 0], [-0.45, 0], [0, 0.45], [0, -0.45]]) {
          const u = this.solid.topAt(x + dx, z + dz);
          if (u === undefined || u !== u || Math.abs(u - t) > 0.3) return false;
        }
        return true;
      },
      wall: (x: number, z: number) => {
        const sf = sand(x, z);
        if (sf !== null) return propOnSand(x, z, sf);
        if (!this.solid.ready) return this.host.nav.wall(x, z);
        const t = this.solid.topAt(x, z);
        return !(t !== undefined && t === t && t > -0.3 && t < 0.7);
      },
      road: (x: number, z: number) => this.roads.road(x, z),
      seen: (x: number, z: number) => this.seen(x, z),
    });
  }

  /** Is (x, z) in the camera's view, with no building in between? (where nobody should pop in or out) */
  private seenDir = new THREE.Vector3();
  seen(x: number, z: number) {
    const cam = this.camera;
    const e = cam.position;
    const d = cam.getWorldDirection(this.seenDir);
    const ox = x - e.x,
      oz = z - e.z;
    const l = Math.hypot(ox, oz);
    if (l < 1) return true;
    const fl = Math.hypot(d.x, d.z) || 1;
    // (a wide cone: the sides of the picture, and a turn of the head)
    if ((ox * d.x + oz * d.z) / (l * fl) < 0.25) return false;
    if (!this.solid.ready) return true;
    // a building in between hides it
    for (let t = 1.5; t < l - 1; t += 1) if (this.solid.wall(e.x + (ox / l) * t, e.z + (oz / l) * t)) return false;
    return true;
  }

  /** Inside: what E would use (checked a few times a second), and where on the screen it is. */
  private useT = 0;
  private useLabel: string | null = null;
  private useSpot: { x: number; y: number } | null = null;

  /** Someone you could talk to now (in front, in reach). */
  private talkable: import("./peds").Ped | null = null;

  /** A conversation with a passer-by: it stops and faces you; walk off (or Esc) and it is over. */
  private startTalk(p: import("./peds").Ped) {
    const ok = this.host.talk(p.id, () => {
      this.peds.listen(p, false);
      this.talkWith = null;
      this.talkShut = performance.now();
    });
    if (!ok) return;
    this.talkWith = p;
    this.peds.listen(p, true);
    this.input.release();
    if (document.pointerLockElement) document.exitPointerLock();
  }

  /** The nearest passer-by in front within a few metres (the guard turns you to it). */
  private lockOn() {
    const pl = this.player;
    const fx = -Math.sin(pl.facing),
      fz = -Math.cos(pl.facing);
    let best: import("./peds").Ped | null = null,
      bd = 6;
    for (const p of this.peds.all) {
      if (p.knockT >= 0) continue;
      const ox = p.pos.x - pl.pos.x,
        oz = p.pos.z - pl.pos.z;
      const d = Math.hypot(ox, oz);
      if (d < bd && (ox * fx + oz * fz) / Math.max(0.01, d) > 0.5) ((best = p), (bd = d));
    }
    return best;
  }

  /** A fist on you: it hurts, you reel; at nothing left, you go down. */
  private hurtMe(dmg: number, x: number, z: number) {
    if (this.wastedT >= 0 || this.car || !this.active) return;
    const pl = this.player;
    // the guard takes most of it, if you face the one hitting you
    const fx = -Math.sin(pl.facing),
      fz = -Math.cos(pl.facing);
    const front = (x - pl.pos.x) * fx + (z - pl.pos.z) * fz > 0;
    const k = pl.guard && front ? 0.35 : 1;
    this.hp = Math.max(0, this.hp - dmg * k);
    this.hurtAt = performance.now();
    pl.hit(front ? 1 : -1);
    this.cam.shake(0.2 * k + 0.05);
    this.sound.crash(0.25);
    this.hud.hurt(this.hp, k);
    if (this.settings.vibe) navigator.vibrate?.(40);
    if (this.hp <= 0) this.wasted();
  }

  /** Down and out: the screen goes grey, a moment, and you are back on your feet nearby. */
  private wasted() {
    this.wastedT = 0;
    this.player.guard = false;
    this.hud.wasted(true);
    this.sound.blip("fail");
  }

  /** Health back a little at a time (out of a fight); getting up after going down. */
  private life(dt: number) {
    const pl = this.player;
    if (this.wastedT >= 0) {
      this.wastedT += dt;
      pl.down = Math.min(1, this.wastedT / 0.5);
      if (this.wastedT > 4.5) {
        // back on your feet on the nearest pavement, healed, the street calmer
        this.wastedT = -1;
        pl.down = 0;
        this.hp = 100;
        const r = this.roads.nearest(pl.pos.x, pl.pos.z);
        const nx = r.axis === "x" ? 0 : 1,
          nz = r.axis === "x" ? 1 : 0;
        found: for (let k = 3; k < 16; k += 0.5)
          for (const sgn of [1, -1]) {
            const x = r.x + nx * k * sgn,
              z = r.z + nz * k * sgn;
            if (!this.roads.road(x, z) && this.solid.ready && this.solid.foot(x, z, 0.2).ok) {
              pl.place(x, this.solid.topAt(x, z) ?? 0.2, z, pl.facing);
              break found;
            }
          }
        this.hud.wasted(false);
        this.hud.hurt(this.hp, 0);
        this.hud.toast("Back on your feet", "the hospital bill is on the house", "teal");
      }
      return;
    }
    if (this.hp < 100 && performance.now() - this.hurtAt > 6000 && !this.peds.fightingMe()) {
      this.hp = Math.min(100, this.hp + dt * 6);
      this.hud.hurt(this.hp, 0);
    }
  }

  /** The fist lands: a thing in reach breaks (inside), a street thing flies, a person goes down. */
  private punchLanded(inside: { walk: WalkControls; scene: THREE.Scene } | null) {
    const pl = this.player;
    const dir = new THREE.Vector3(-Math.sin(pl.facing), 0, -Math.cos(pl.facing));
    const at = pl.pos.clone().addScaledVector(dir, 0.75).setY(pl.pos.y + 1);
    let hit = false;
    let person = false;
    if (inside) hit = this.breakables.hit(inside.scene, at, dir, pl.floor, [inside.walk.colliders, inside.walk.extra]);
    else {
      // a passer-by in reach takes it (harder on the run); else the street's things and people
      const who = this.peds.punch(pl.pos.x, pl.pos.z, dir.x, dir.z, 24 + Math.random() * 10 + (pl.speed > 3 ? 10 : 0));
      if (who) hit = person = true;
      else {
        hit = this.props.push(at.x, at.z, 0.45, dir.x * 7, dir.z * 7, 1.6) > 0;
        if (this.knockAll(at.x, at.z, dir.x * 6, dir.z * 6, 0.8)) hit = person = true;
      }
    }
    if (hit) {
      this.sound.crash(person ? 0.22 : 0.35);
      this.cam.shake(person ? 0.12 : 0.18);
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
      if (i.hit("KeyX", "Mouse0", "pad:x", "touch:hit")) pl.punch();
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
    this.people.update(dt, pl.pos.x, pl.pos.z, pl.pos, this.cam.camera.position, this.cam.camera.getWorldDirection(this.viewDir));
    // the walker where you are
    w.camera.position.set(pl.pos.x, pl.pos.y + 1.6, pl.pos.z);
    w.setFloor(pl.floor);
    w.aim(pl.facing, -0.08);
    this.lastWalk.copy(w.camera.position);
    this.life(dt);
    // the way out: E (a door is a door: you don't walk through it)
    const ex = w.exitAhead();
    const near = !!ex && ex.dist < 2.4 && ex.facing;
    const touch = matchMedia("(pointer: coarse)").matches;
    // what is in front of you (a person, a counter, a screen, a cabinet): E uses it, as a click did
    let use: string | null = null;
    let useAt: { x: number; y: number } | null = null;
    if (!near) {
      this.useT -= dt;
      if (this.useT <= 0) {
        this.useT = 0.15;
        const p = new THREE.Vector3(pl.pos.x - Math.sin(pl.facing) * 1.1, pl.pos.y + 1.25, pl.pos.z - Math.cos(pl.facing) * 1.1).project(this.cam.camera);
        this.useSpot = p.z < 1 && Math.abs(p.x) < 1 && Math.abs(p.y) < 1 ? { x: ((p.x + 1) / 2) * innerWidth, y: ((1 - p.y) / 2) * innerHeight } : null;
        const label = this.useSpot ? this.host.useLabel(this.useSpot.x, this.useSpot.y) : null;
        this.useLabel = label ? label.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 48) : null;
      }
      use = this.useLabel;
      useAt = this.useSpot;
    }
    this.hud.prompt(near ? `<kbd>${touch ? "Tap" : "E"}</kbd> Exit to the street` : use ? `<kbd>${touch ? "Tap" : "E"}</kbd> ${use.replace(/[<>&]/g, "")}` : null);
    this.hud.doorButton(near || !!use);
    if (!this.paused && i.hit("KeyE", "pad:y", "touch:door")) {
      if (near) w.onExit?.();
      else if (useAt) this.host.useAt(useAt.x, useAt.y);
    }
    this.hud.indoor(dt, { speed: pl.speed });
  }

  /**
   * The way in to every place, from the street: the cheapest path on a half-metre grid from the
   * nearest road to its door, where what blocks a body costs a lot but is not impossible (water is),
   * kept clear on foot 1.5 m wide. Whatever the place or the street put in the way, you get in.
   */
  private access: Set<string> | null = null;
  private computeAccess() {
    const s = this.solid,
      h = this.host;
    if (!s.ready) return;
    const set = new Set<string>();
    const C = 0.5;
    for (const d of this.placeSpots) {
      const st = this.roads.nearest(d.x + d.fx * 6, d.z + d.fz * 6);
      const R = Math.ceil(Math.max(50, Math.hypot(st.x - d.x, st.z - d.z) + 12));
      const N = (2 * R) / C;
      const ox = d.x - R,
        oz = d.z - R;
      // a cell's own cost (what stands there), its floor; a step up of more than a body climbs costs too
      const cellCost = (x: number, z: number) => {
        const t = s.topAt(x, z);
        if (t === undefined || t !== t || t < -0.35) return Infinity;
        if (h.footSpecial(x, z)) return h.footBlocked(x, z) ? 40 : 1;
        return s.foot(x, z, Math.max(0.2, Math.min(t, 1))).ok && !h.footSmall(x, z) ? 1 : 40;
      };
      const floorOf = (x: number, z: number) => {
        const g = h.ground(x, z);
        if (g !== null) return g;
        const t = s.topAt(x, z) ?? 0.2;
        return t === t ? t : 0.2;
      };
      const si = Math.round((st.x - ox) / C),
        sj = Math.round((st.z - oz) / C);
      const ti = Math.round((d.x + d.fx * 0.8 - ox) / C),
        tj = Math.round((d.z + d.fz * 0.8 - oz) / C);
      if (si < 0 || sj < 0 || si >= N || sj >= N) continue;
      const dist = new Float32Array(N * N).fill(Infinity);
      const prev = new Int32Array(N * N).fill(-1);
      // a small binary heap of [cost, cell]
      const heap: [number, number][] = [];
      const push = (c: number, k: number) => {
        heap.push([c, k]);
        let i = heap.length - 1;
        while (i > 0) {
          const pi = (i - 1) >> 1;
          if (heap[pi][0] <= heap[i][0]) break;
          [heap[pi], heap[i]] = [heap[i], heap[pi]];
          i = pi;
        }
      };
      const pop = () => {
        const top = heap[0];
        const last = heap.pop()!;
        if (heap.length) {
          heap[0] = last;
          let i = 0;
          for (;;) {
            const l = i * 2 + 1,
              r = l + 1;
            let m = i;
            if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
            if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
            if (m === i) break;
            [heap[m], heap[i]] = [heap[i], heap[m]];
            i = m;
          }
        }
        return top;
      };
      const s0 = sj * N + si,
        t0 = tj * N + ti;
      dist[s0] = 0;
      push(0, s0);
      const cache = new Float32Array(N * N).fill(-1);
      const tops = new Float32Array(N * N).fill(NaN);
      const topOf = (k: number) => {
        if (tops[k] !== tops[k]) tops[k] = floorOf(ox + (k % N) * C, oz + ((k / N) | 0) * C);
        return tops[k];
      };
      // (what each cell on the path cost to step onto: the cleared stretch is where it was more than 1)
      const stepCost = new Float32Array(N * N);
      while (heap.length) {
        const [c, k] = pop();
        if (c > dist[k]) continue;
        if (k === t0) break;
        const i = k % N,
          j = (k / N) | 0;
        for (const [di, dj] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const ni = i + di,
            nj = j + dj;
          if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
          const nk = nj * N + ni;
          if (cache[nk] < 0) cache[nk] = cellCost(ox + ni * C, oz + nj * C);
          const climb = topOf(nk) - topOf(k) > 0.6 ? 40 : 0;
          const sc = Math.max(cache[nk], climb || 1);
          const nc = c + sc;
          if (nc < dist[nk]) {
            dist[nk] = nc;
            prev[nk] = k;
            stepCost[nk] = sc;
            push(nc, nk);
          }
        }
      }
      // and straight out from the door to the street (or the water), whatever is in between
      for (let k = 0; k < 26; k += 0.5) {
        const x = d.x + d.fx * k,
          z = d.z + d.fz * k;
        const t = s.topAt(x, z);
        if (t === undefined || t !== t || t < -0.35 || this.roads.road(x, z)) break;
        for (let a = -1.5; a <= 1.5; a += 0.5) set.add(`${Math.floor((x - d.fz * a) * 2)},${Math.floor((z + d.fx * a) * 2)}`);
      }
      if (!Number.isFinite(dist[t0])) continue;
      // the path back from the door, widened: only the stretch that needed it is cleared
      // (the whole way, not only what was in the way: a narrow gap the grid just fits is no way in)
      for (let k = t0; k >= 0; k = prev[k]) {
        if (stepCost[k] <= 1 && k !== t0 && dist[k] < 2 && this.roads.road(ox + (k % N) * C, oz + ((k / N) | 0) * C)) continue;
        const i = k % N,
          j = (k / N) | 0;
        const x = ox + i * C,
          z = oz + j * C;
        for (let a = -1.5; a <= 1.5; a += 0.5) for (let b = -1.5; b <= 1.5; b += 0.5) set.add(`${Math.floor((x + a) * 2)},${Math.floor((z + b) * 2)}`);
      }
    }
    this.access = set;
    // the big sights get a line of visitors at the door
    const QUEUED = new Set(["museum", "colosseum", "stadium", "bigben", "opera", "eiffel", "needle", "mall", "convention", "pyramid", "library", "gardens"]);
    this.peds.queues = this.placeSpots.filter((d) => QUEUED.has(d.key) && !d.bare).map((d) => ({ key: d.key, x: d.x, z: d.z, fx: d.fx, fz: d.fz }));
    this.ferries = this.findFerries();
    this.doors.set([...this.placeSpots, ...this.ferries]);
  }

  /**
   * The places on the bay's islands (Liberty, the rock) can't be walked to: a ferry from the quay
   * across from each, E on the landing stage takes you over, and back.
   */
  private ferries: DoorSpot[] = [];
  private findFerries(): DoorSpot[] {
    const s = this.solid;
    const out: DoorSpot[] = [];
    const walk = (x: number, z: number) => {
      const t = s.topAt(x, z);
      return t !== undefined && t === t && t > -0.3 && t < 2 && s.foot(x, z, Math.max(0.2, t)).ok;
    };
    for (const d of this.placeSpots) {
      if (d.key !== "statue" && d.key !== "prison") continue;
      // the landing on the island: the nearest spot a body can stand, round the door
      let land: { x: number; z: number } | null = null;
      for (let r = 1.5; r < 12 && !land; r += 0.5)
        for (let a = 0; a < Math.PI * 2 && !land; a += Math.PI / 12) {
          const x = d.x + Math.cos(a) * r,
            z = d.z + Math.sin(a) * r;
          if (walk(x, z)) land = { x, z };
        }
      if (!land) continue;
      // the quay across the water, north of it (toward the city)
      let quay: { x: number; z: number } | null = null;
      let wet = false;
      for (let z = land.z - 1; z > land.z - 90; z -= 0.5) {
        const t = s.topAt(land.x, z);
        if (t === undefined) break;
        if (t !== t || t < -0.35) wet = true;
        else if (wet && walk(land.x, z - 1.5)) {
          quay = { x: land.x, z: z - 1.5 };
          break;
        }
      }
      if (!quay) continue;
      const name = d.label;
      out.push({ key: `ferry:${d.key}:go`, x: quay.x, z: quay.z, fx: 0, fz: -1, y: s.topAt(quay.x, quay.z) ?? 0.2, label: `Ferry · ${name}`, bare: true, to: land } as DoorSpot & { to: { x: number; z: number } });
      out.push({ key: `ferry:${d.key}:back`, x: land.x, z: land.z, fx: 0, fz: 1, y: s.topAt(land.x, land.z) ?? 0.2, label: "Ferry · back to the city", bare: true, to: quay } as DoorSpot & { to: { x: number; z: number } });
    }
    return out;
  }

  /**
   * In front of a place's door (a lane 3.4 m wide, 6 m out from it): the game keeps it clear on foot,
   * whatever the place or the street put there (a queue's rails, planters, a kerb's posts).
   */
  doorway(x: number, z: number) {
    // (never past the door's own line: what is behind a door is the building, and the door is shut)
    for (const d of this.placeSpots) {
      const dx = x - d.x,
        dz = z - d.z;
      if (dx * dx + dz * dz > 100) continue;
      const along = dx * d.fx + dz * d.fz,
        across = Math.abs(-dx * d.fz + dz * d.fx);
      if (along < 0.4 && along > -9 && across < 3.2) return false;
    }
    if (this.access?.has(`${Math.floor(x * 2)},${Math.floor(z * 2)}`)) return true;
    for (const d of this.placeSpots) {
      const dx = x - d.x,
        dz = z - d.z;
      if (dx * dx + dz * dz > 49) continue;
      const along = dx * d.fx + dz * d.fz,
        across = Math.abs(-dx * d.fz + dz * d.fx);
      if (along >= 0.4 && along < 6 && across < 1.7) return true;
    }
    return false;
  }

  /** At a drawn door's leaves (within its width, right in front of it or past it): shut. */
  private doorShut(x: number, z: number) {
    return this.shutIn(this.placeSpots, x, z) || this.shutIn(this.nearSpots, x, z);
  }
  private shutIn(list: DoorSpot[], x: number, z: number) {
    for (const d of list) {
      if (d.bare) continue;
      const dx = x - d.x,
        dz = z - d.z;
      if (dx * dx + dz * dz > 16) continue;
      const along = dx * d.fx + dz * d.fz,
        across = Math.abs(-dx * d.fz + dz * d.fx);
      if (along < 0.34 && along > -2.5 && across < DOOR_HALF + (d.wall === false ? 0.35 : 0.1)) return true;
      // a grand entrance's brass posts and velvet ropes: you walk up the carpet, not through them
      const r = ropes(d);
      if (r && along > r.from - 0.2 && along < r.to + 0.2 && Math.abs(across - r.half) < 0.3) return true;
    }
    return false;
  }
  private nearSpots: DoorSpot[] = [];

  /**
   * The doors of the city's buildings: one in the middle of each street front, against its wall
   * (the solid shape says where the wall is and that the pavement in front is free), not near a
   * place's own door. Only the nearest dozen are drawn.
   */
  private nearDoors(x: number, z: number) {
    if (!this.solid.ready) return;
    if (!this.buildingSpots) {
      const s = this.solid;
      const out: (DoorSpot & { type: string; seed: number; kind?: string })[] = [];
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
        const own = (f as { door?: { x: number; z: number } }).door;
        if (own) {
          // (a door of its own: Orchard Keys' shops and houses say where theirs is)
          cx = own.x;
          cz = own.z;
        } else if (fx === 0) {
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
        // the wall right behind, the pavement free in front (a door of its own is where it says)
        let k = 0;
        if (!own) {
          for (k = -1; k < 4; k += 0.1) if (wallAt(cx - fx * k, cz - fz * k)) break;
          if (k >= 4) return;
        }
        const dx = cx - fx * (k - 0.06),
          dz = cz - fz * (k - 0.06);
        if (!own)
          for (const d of [1, 2.5]) {
            const t = s.topAt(dx + fx * d, dz + fz * d);
            if (t === undefined || t !== t || t > 0.7 || t < -0.3) return;
          }
        // on a street (not a back yard): a road within a few metres in front
        let road = false;
        for (let d = 2; d < (own ? 28 : 14) && !road; d += 1) road = this.roads.road(dx + fx * d, dz + fz * d);
        if (!road) return;
        if (this.placeSpots.some((p) => Math.hypot(p.x - dx, p.z - dz) < 8)) return;
        if (out.some((p) => Math.hypot(p.x - dx, p.z - dz) < 6)) return;
        const seed = (Math.abs(Math.round(dx * 13 + dz * 7)) % 997) + i;
        const kind = f.type === "cafe" || f.type === "bar" ? f.type : kindOf(f.type, seed);
        const names = NAMES[kind];
        out.push({ key: `building:${i}`, x: dx, z: dz, fx, fz, y: s.topAt(dx + fx, dz + fz) ?? 0.2, label: (f as { name?: string }).name ?? names[seed % names.length], type: f.type, seed, wall: true, kind });
      });
      this.buildingSpots = out;
    }
    const near = this.buildingSpots
      .map((b) => ({ b, d: Math.hypot(b.x - x, b.z - z) }))
      .filter((o) => o.d < 55)
      .sort((p, q) => p.d - q.d)
      .slice(0, 12)
      .map((o) => o.b);
    this.nearSpots = near;
    this.doors.set([...this.placeSpots, ...this.ferries, ...near]);
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
    // (how much clear pavement lies in front of it: a grand entrance's carpet and ropes fit in that)
    const room = (o: DoorSpot): DoorSpot => {
      let k = 0.3;
      for (; k < 6; k += 0.2) {
        const x = o.x + o.fx * k,
          z = o.z + o.fz * k;
        const t = s.topAt(x, z);
        if (this.roads.road(x, z) || t === undefined || t !== t || t > o.y + 0.6 || t < o.y - 0.6) break;
      }
      return { ...o, room: k };
    };
    if (wall(0)) {
      for (let k = -0.1; k > -3; k -= 0.1) if (!wall(k)) return room({ ...d, x: d.x - d.fx * (k - 0.05), z: d.z - d.fz * (k - 0.05), wall: true });
      return room({ ...d, wall: false });
    }
    for (let k = 0.1; k < 7; k += 0.1) if (wall(k)) return room({ ...d, x: d.x - d.fx * (k - 0.06), z: d.z - d.fz * (k - 0.06), wall: true });
    return room({ ...d, wall: false });
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
    this.shove(car);
    if (car.hit && car.hit.what === "car" && car.hit.speed > 7) {
      if (this.heat.near(car.hit.x, car.hit.z, 4.5)) this.heat.raise(0.9, "you rammed a police cruiser");
      else this.heat.raise(0.45, `you hit a car at ${Math.round(car.hit.speed * 3.6)} km/h`);
    }
    this.doors.update(dt, null);
    this.player.group.visible = !!this.riding;
    if (this.riding) this.player.poseOnly(dt);
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
    const horn = !this.paused && i.down("KeyE", "KeyH");
    if (horn !== this.horn) this.sound.hornOn((this.horn = horn));
    this.cam.back = !this.paused && i.down("KeyB");
    this.cam.car(dt, car.group.position, car.yaw, car.speed, car.vF < 0, this.settings.follow ? Math.max(i.idleLook, i.idleLook > 0.5 ? 2 : 0) : i.idleLook, { wall: (x, z) => (this.solid.ready && this.solid.wall(x, z)) || (!h.beyond(x, z) && h.nav.wall(x, z)) }, car.spec.len);
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
        // (the Golden Gate's deck: over the bay, between its railings)
        if (h.carHold(p, r)) return;
        if (!this.solid.ready) return h.nav.resolve(p, r);
        this.solid.resolve(p, r);
      },
      outside: (x: number, z: number) => !h.beyond(x, z) && (x < h.bounds.x0 || x > h.bounds.x1 || z < h.bounds.z0 || z > h.bounds.z1),
      surface: (x: number, z: number) => h.carSurface(x, z) ?? this.roads.surface(x, z),
      boxes: () => this.boxes(self),
    };
  }

  private legs: [number, number][] | null = null;

  /**
   * The crashes, the games' way: what `car` ran into trades momentum with it (by their masses, a
   * little extra for the show) — the one hit is shoved off, sliding and spinning, metres away, and
   * may hit the next. A car of the traffic hit hard leaves its lane and is a car on its own (in
   * `parked`, simulated while it moves; you can take it); a parked car, a cruiser, is shoved.
   */
  private shove(car: DriveCar) {
    // (one trade per car met: the steps of a frame note the same touch several times)
    const met = new Set<unknown>();
    for (const c of car.contacts) {
      const b = c.box;
      const key = this.refKey(c.ref);
      if (met.has(key)) continue;
      met.add(key);
      const mA = car.spec.mass,
        mB = b.mass ?? 1.4;
      // its velocity now (a car already shoved this frame has moved on from the box's note)
      const was = this.refCar(c.ref);
      const vbx = was ? was.vel.x : (b.vx ?? 0),
        vbz = was ? was.vel.y : (b.vz ?? 0);
      // closing speed along the normal (from it to the car): negative when they meet
      const vrel = (car.vel.x - vbx) * c.nx + (car.vel.y - vbz) * c.nz;
      if (vrel > -0.8) continue;
      const J = (-(1 + 0.3) * vrel) / (1 / mA + 1 / mB);
      // the car: its share back
      const dA = J / mA;
      car.push(c.nx * dA, c.nz * dA, 0, dA > 7 ? 0.5 : 0);
      // the other: shoved along the normal (a little more than physics: you see it go), spun by
      // where it was hit
      const dB = (J / mB) * 1.3;
      const dvx = -c.nx * dB,
        dvz = -c.nz * dB;
      const rx = c.x - b.x,
        rz = c.z - b.z;
      const spin = Math.max(-5, Math.min(5, (rz * dvx - rx * dvz) * 0.55));
      const stun = Math.min(3.2, 1.2 + dB * 0.12);
      const other = this.loosen(c.ref, b, dB);
      if (other) other.push(dvx, dvz, spin, stun);
      // the bang
      const hs = -vrel;
      if (hs > 1.5 && (!car.hit || hs > car.hit.speed)) car.hit = { speed: hs, x: c.x, z: c.z, what: "car" };
      if (car !== this.car && hs > 3) this.sound.crash(Math.min(0.4, hs / 50));
    }
  }

  /** The thing behind a box's ref (the traffic's mover, the bridge's car, a car of ours). */
  private refKey(ref: unknown) {
    const r = ref as { t?: string; m?: unknown; car?: unknown };
    return r.t === "mover" ? r.m : r.t === "car" ? r.car : ref;
  }
  /** Out of the traffic already (or ours): the car it is now. */
  private knocked = new WeakMap<object, DriveCar>();
  private refCar(ref: unknown): DriveCar | null {
    const r = ref as { t?: string; car?: DriveCar };
    if (r.t === "car") return r.car!;
    return this.knocked.get(this.refKey(ref) as object) ?? null;
  }

  /** The car behind a box, as a car of its own (out of its traffic if it was in one), or null. */
  private loosen(ref: unknown, b: CarBox, dv: number): DriveCar | null {
    const r = ref as { t: string; m?: unknown; car?: DriveCar };
    const already = this.refCar(ref);
    // a car of ours (parked: it wakes; a cruiser drives itself), or one knocked out of the traffic before
    if (already) return already;
    // (a touch moves no one out of the traffic: a real knock does)
    if (dv < 2.5) return null;
    let group: THREE.Group | null = null,
      kind: VehicleKind = "sedan";
    if (r.t === "mover") {
      const m = r.m as { kind: string };
      kind = (m.kind in SPECS ? m.kind : "sedan") as VehicleKind;
      group = this.host.traffic.take(r.m as Parameters<CityTraffic["take"]>[0]);
      if (kind === "police") this.heat.raise(1.2, "you rammed a police cruiser");
    } else {
      const t = this.host.takeCar?.(ref);
      if (t) ((group = t.group), (kind = t.kind));
    }
    if (!group) return null;
    const car = new DriveCar(kind, group);
    this.knocked.set(this.refKey(ref) as object, car);
    this.wrecks.set(car, 0);
    if (!car.group.parent) this.host.scene.add(car.group);
    car.vel.set(b.vx ?? 0, b.vz ?? 0);
    car.damage = 0.3;
    this.parked.push(car);
    // (a street full of wrecks: the oldest out of sight go, never your GT nor the bikes)
    const wrecks = this.parked.filter((c) => c.kind !== "gt" && c.kind !== "moto");
    if (wrecks.length > 10) {
      const me = this.car?.group.position ?? this.player.pos;
      const far = wrecks.filter((c) => c !== car && !this.seen(c.group.position.x, c.group.position.z)).sort((a, z2) => z2.group.position.distanceTo(me) - a.group.position.distanceTo(me))[0];
      if (far) {
        this.parked.splice(this.parked.indexOf(far), 1);
        far.dispose();
      }
    }
    return car;
  }

  /** Cars knocked out of the traffic, and how long each has been at rest (towed away once out of sight). */
  private wrecks = new Map<DriveCar, number>();

  /** The cars knocked about (in `parked`, not yours): on their own until they come to rest, hitting what is in their way. */
  private loose(dt: number) {
    // the tow truck: a wreck at rest a while, out of sight and not near you, goes (the traffic behind it moves on)
    const me = this.car?.group.position ?? this.player.pos;
    for (const [c, t] of this.wrecks) {
      if (c === this.car || !this.parked.includes(c)) {
        this.wrecks.delete(c);
        continue;
      }
      const rest = c.speed < 0.1 && c.stun <= 0 ? t + dt : 0;
      this.wrecks.set(c, rest);
      const p = c.group.position;
      if (rest > 15 && Math.hypot(p.x - me.x, p.z - me.z) > 25 && !this.seen(p.x, p.z)) {
        this.parked.splice(this.parked.indexOf(c), 1);
        this.wrecks.delete(c);
        c.dispose();
      }
    }
    const still = { throttle: 0, brake: 0.25, steer: 0, handbrake: false, nitro: false };
    for (const c of [...this.parked]) {
      if (c === this.car) continue;
      if (c.stun <= 0 && Math.hypot(c.vel.x, c.vel.y) < 0.08) continue;
      c.update(dt, still, this.carWorld(c));
      this.shove(c);
      if (c.speed > 0.05 && c.speed < 0.25 && c.stun <= 0) c.vel.set(0, 0);
      // people in its way go down
      if (c.speed > 3) {
        const p = c.group.position;
        const n = this.knockAll(p.x, p.z, c.vel.x, c.vel.y, c.spec.wid * 0.7);
        if (n) this.peds.panic(p.x, p.z, 12);
      }
    }
  }

  /** Everything a car can hit that moves: the traffic, the avenue's cars and buses, the trams, your parked cars, the cruisers (and the viaducts' legs). */
  private *boxes(self: DriveCar): Generator<CarBox> {
    for (const m of this.host.traffic.movers) {
      const p = m.group.position;
      const along = m.line.axis === "x";
      const half = m.len / 2;
      const yaw = m.group.rotation.y;
      yield { x: p.x, z: p.z, hx: along ? half : 0.95, hz: along ? 0.95 : half, ref: { t: "mover", m }, vx: Math.cos(yaw) * m.v, vz: -Math.sin(yaw) * m.v, mass: SPECS[m.kind as VehicleKind]?.mass ?? 1.35 };
    }
    yield* this.host.vehicles();
    // the other players' cars
    for (const o of this.net.others())
      if (o.car) {
        const cs = Math.abs(Math.cos(o.yaw)),
          sn = Math.abs(Math.sin(o.yaw));
        yield { x: o.x, z: o.z, hx: (cs * 4.4 + sn * 2) / 2.2, hz: (sn * 4.4 + cs * 2) / 2.2 };
      }
    // the viaducts' legs: concrete, thin enough for the solid shape to call them a post a car goes
    // through — they stop it
    const sp = self.group.position;
    for (const [lx, lz] of (this.legs ??= viaductBents().flatMap((b) => b.legs))) if (Math.abs(lx - sp.x) < 24 && Math.abs(lz - sp.z) < 24) yield { x: lx, z: lz, hx: 0.5, hz: 0.5 };
    for (const c of [...this.parked, ...this.heat.chasers.map((x) => x.car), ...(this.car ? [this.car] : [])]) {
      if (c === self) continue;
      const p = c.group.position;
      const cs = Math.abs(Math.cos(c.yaw)),
        sn = Math.abs(Math.sin(c.yaw));
      yield { x: p.x, z: p.z, hx: (cs * c.spec.len + sn * c.spec.wid) / 2.2, hz: (sn * c.spec.len + cs * c.spec.wid) / 2.2, ref: { t: "car", car: c }, vx: c.vel.x, vz: c.vel.y, mass: c.spec.mass };
    }
  }

  /** The waypoint set on the map (the GPS takes you there), the way, its colour. */
  private waypoint: { x: number; z: number } | null = null;
  private route: { x: number; z: number }[] | null = null;
  private routeColor = WAYPOINT;
  private routeT = 0;
  private routeKey = "";

  setWaypoint(p: { x: number; z: number } | null) {
    this.waypoint = p;
    this.routeT = 0;
    if (p) this.sound.blip("click");
  }

  /** The GPS: the way by the streets to the waypoint (purple), else to the objective (its colour); asked again every second or so. */
  private gps(dt: number, at: THREE.Vector3) {
    const w = this.waypoint;
    if (w && Math.hypot(w.x - at.x, w.z - at.z) < 14) {
      this.waypoint = null;
      this.hud.toast("You've arrived", this.roads.where(at.x, at.z).street, "teal");
      this.sound.blip("door");
    }
    const goal = this.missions.next(at.x, at.z);
    const target = this.waypoint ?? (goal?.goal ? goal : null);
    if (!target) {
      this.route = null;
      return;
    }
    const key = `${target.x.toFixed(1)},${target.z.toFixed(1)}`;
    this.routeT -= dt;
    if (this.routeT > 0 && key === this.routeKey && this.route) {
      // (only where you are moves: the way from you to its next turn)
      this.route[0] = { x: at.x, z: at.z };
      return;
    }
    this.routeT = 1.1;
    this.routeKey = key;
    this.route = this.roads.gps(at.x, at.z, target.x, target.z);
    this.routeColor = this.waypoint ? WAYPOINT : goal ? KIND_COLOR[goal.kind] : WAYPOINT;
  }

  /** The places for the maps, each with its kind. */
  private placesCache: { x: number; z: number; label: string; icon?: string; cat: Cat }[] | null = null;
  private mapPlaces() {
    return (this.placesCache ??= this.host.places().map((p) => ({ ...p, cat: PLACE_CAT[p.key ?? ""] ?? ("sight" as Cat) })));
  }

  /** What the big map knows for good: the streets' names, the districts, the doors by kind, the metro, the ferries. */
  private mapCache: MapData | null = null;
  mapData(): MapData | null {
    if (this.mapCache) return this.mapCache;
    if (!this.solid.ready) return null;
    const lines = [ZEC_LINE(), NU7_LINE()].map((l) => ({
      name: l.name,
      color: l.stripe,
      points: l.points.map((p) => ({ x: p.x, z: p.z })),
      stations: l.stations.map(([name, , x, z]) => ({ name: name.charAt(0) + name.slice(1).toLowerCase(), x, z })),
    }));
    const CATS: Record<string, Cat> = { shop: "shop", cafe: "food", bar: "bar", office: "work" };
    const buildings = (this.buildingSpots ?? []).flatMap((b) => {
      const c = CATS[b.kind ?? ""];
      return c ? [{ x: b.x, z: b.z, label: b.label, cat: c }] : [];
    });
    const data: MapData = {
      streets: this.roads.labels(),
      districts: this.roads.districts(),
      buildings,
      lines,
      ferries: this.ferries.filter((f) => f.key.endsWith(":go")).map((f) => ({ x: f.x, z: f.z, label: f.label })),
    };
    // (kept once the buildings' doors are known)
    if (this.buildingSpots) this.mapCache = data;
    return data;
  }

  private hudFrame(dt: number, at: THREE.Vector3, heading: number) {
    this.gps(dt, at);
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
        places: this.mapPlaces(),
        route: this.route,
        routeColor: this.routeColor,
        waypoint: this.waypoint,
        car: (() => {
          const gt = this.parked.find((c) => c.kind === "gt");
          return gt && gt !== this.car ? { x: gt.group.position.x, z: gt.group.position.z } : null;
        })(),
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
