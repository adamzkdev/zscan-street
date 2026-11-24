import * as THREE from "three";
import { get, ZScan } from "../data/zscan";
import { profile } from "../game/profile";
import { MATERIALS } from "../scene/voxel/mesher";
import { faces } from "./faces";
import { SnarkFigure } from "./figure";
import { Mosaic } from "./mosaic";
import { DriveCar } from "./vehicle";
import { CATS, Store, type StoreCat, type StoreItem } from "./store";
import { Wallet, openSheet } from "./wallet";
import type { StoreTab, StoreTabContext } from "./economy";
import { Economy } from "./economy";

/**
 * The STORE's tabs other modules bring (economy.ts `StoreTab`): Zilk Road's zkSNARKs (zilk.ts), the
 * furniture of your home (home.ts), ⓩ for ZEC (zecshop.ts). Found at build time, loaded when their
 * tab first opens (so one that fails to load takes only its tab with it): a tab whose module isn't
 * there says so.
 */
const EXT = import.meta.glob<{ storeTab?: StoreTab }>("./{zilk,home,zecshop}.ts");
const EXT_FILE: Record<StoreTab["key"], string> = { zksnarks: "./zilk.ts", home: "./home.ts", getz: "./zecshop.ts" };
const extLoaded: Partial<Record<StoreTab["key"], StoreTab | null>> = {};
async function loadTab(key: StoreTab["key"]): Promise<StoreTab | null> {
  if (key in extLoaded) return extLoaded[key] ?? null;
  const load = EXT[EXT_FILE[key]];
  let t: StoreTab | null = null;
  if (load)
    try {
      const m = await load();
      t = m.storeTab?.key === key ? m.storeTab : null;
    } catch (e) {
      console.warn(`store: ${EXT_FILE[key]} did not load`, e);
    }
  return (extLoaded[key] = t);
}
/** (a tab already loaded, for its keys) */
const extTab = (key: StoreTab["key"]) => extLoaded[key] ?? null;

/** The STORE's tabs; VEHICLES has its own (paint, neon, rims, bike, horn). */
type Tab = "zksnarks" | "vehicles" | "home" | "getz";
const TABS: { key: Tab; label: string }[] = [
  { key: "zksnarks", label: "zkSNARKs" },
  { key: "vehicles", label: "Vehicles" },
  { key: "home", label: "Home" },
  { key: "getz", label: "Get ⓩ" },
];
/** ↑/↓ through the store: every tab, VEHICLES' own included. */
const FLAT: { tab: Tab; cat?: StoreCat }[] = [{ tab: "zksnarks" }, ...CATS.map((c) => ({ tab: "vehicles" as Tab, cat: c.key })), { tab: "home" }, { tab: "getz" }];
import "./front.css";

/**
 * The game's front end (src/gta): what you see before you play, in the street itself. The main
 * menu (after ZK CARDS' hub: the wordmark, Play, Store, Garage, Missions…, your ⓩ and the wallet top
 * right) straight over golden hour on a street of the city, your ZK-GT at the kerb and a few
 * zkSNARKs hanging out round it, the camera drifting slowly. The store dresses that car. Choosing
 * your zkSNARK is a line-up on the pavement: the camera glides from one to the next, the one in
 * front steps out and waves, its card says who it is (rank, rarity, traits). Play puts you in the
 * street right there, by your car.
 *
 * It draws nothing of its own: main.ts renders the street with `camera` while `open`, lights and
 * shadows round `focus`.
 */

const LAST = "zstreet.gta.snark";
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const TOUCH = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;

export interface FrontHost {
  scene: THREE.Scene;
  ui: HTMLElement;
  /** The ground's height (0 on the asphalt, the kerb's on the pavement). */
  surface(x: number, z: number): number;
  /** On the asphalt. */
  road(x: number, z: number): boolean;
  /** Something stands there (a post, a tree, a wall). */
  blocked(x: number, z: number): boolean;
  /** The first gesture: the city's sound on (unless it was switched off). */
  startSound(): void;
  /** The golden-hour look while the front end is up (false: the street's own sky again). */
  look(on: boolean): void;
  /** The settings (the game's menu panel) over the front end, at a tab ("controls": how to play). */
  settings(tab?: string): void;
  /** The city now, for the menu's chips and its card: the chain, the hour and the weather, who is in town. */
  live?(): { block: number; nextIn: number | null; mempool: number; online: number; clock: string; weather: string; weatherIcon: string };
  /** Sound the horn a moment (the store's horn, as picked). */
  honk?(): void;
}

/** Where it is all set: a point on the kerb, and the way out from the pavement to the road (yaw). */
export interface Stage {
  x: number;
  z: number;
  yaw: number;
  /** The camera looks along the kerb from this side (+1: from +u). */
  look?: 1 | -1;
}
/** The street the menu is shot on: Park Row's north kerb, looking west down the street to the low sun. */
export const STAGE: Stage = { x: -30, z: -128, yaw: 0, look: 1 };

/** Where play starts: you, facing your car, and the car. */
export interface StartAt {
  x: number;
  z: number;
  heading: number;
  car: { x: number; z: number; yaw: number };
}

/** (the STORE is two modes: "select", its ZKSNARKS tab — the line-up — and "store", the others) */
type Mode = "menu" | "select" | "store" | "howto";

/** The crew round the car under the menu: where (along the kerb, out to the road), facing, doing what. */
interface Crew {
  fig: SnarkFigure;
  u: number;
  v: number;
  face: number;
  gesture: SnarkFigure["act"]["gesture"];
  seat: number;
  /** Talks in turns with this one. */
  pair?: number;
  hero?: boolean;
}

interface Slot {
  id: number;
  tag: string;
  fig: SnarkFigure;
  u: number;
  /** 0 in line … 1 stepped out. */
  out: number;
}

/** The collection's map (ranks and traits), read once. */
type Tuple = [number, number | null, number | null, number | null, number | null, number, number, number[]];
interface MapDoc {
  traits: { trait_type: string; values: string[] }[];
  items: Tuple[];
}
let mapDoc: Promise<MapDoc | null> | null = null;
const BANDS = [
  { to: 10, name: "Legendary", color: "#ff5ad1" },
  { to: 100, name: "Epic", color: "#b07bff" },
  { to: 500, name: "Rare", color: "#3fa8ff" },
  { to: 1000, name: "Superior", color: "#3fd6c6" },
  { to: 2500, name: "Uncommon", color: "#7fd46b" },
  { to: 5000, name: "Common", color: "#d8d2c8" },
  { to: 10000, name: "Core", color: "#9a958e" },
];
const SHOWN = ["Lineage", "Head", "Eyes", "Skin", "Accessory"];

const damp = (k: number, dt: number) => 1 - Math.exp(-k * dt);

export class FrontEnd {
  readonly camera = new THREE.PerspectiveCamera(36, 1, 0.1, 700);
  /** Lights and shadows follow this point. */
  readonly focus = new THREE.Vector3();
  /** Everything it puts in the street (left out of the street's solid shape). */
  readonly group = new THREE.Group();
  open = false;
  mode: Mode = "menu";
  id: number;
  /** Opened from the game (pause › zkSNARK): no menu, Back returns to the game. */
  private inGame = false;
  private el: HTMLElement;
  private mosaic: Mosaic;
  private stage: Stage = { ...STAGE };
  private al = new THREE.Vector3();
  private ou = new THREE.Vector3();
  private crew: Crew[] = [];
  private car: DriveCar | null = null;
  private line: Slot[] = [];
  private sel = 0;
  private menuAt = 0;
  private t = 0;
  private camPos = new THREE.Vector3();
  private camAim = new THREE.Vector3();
  private wantPos = new THREE.Vector3();
  private wantAim = new THREE.Vector3();
  private cut = true;
  private onPlay: ((id: number, at: StartAt | null, then?: "map") => void) | null = null;
  private onClose: (() => void) | null = null;
  private rare: { id: number; rank: number }[] = [];
  private picks: number[] = [];
  /** A number typed or picked from the 10,000 (it joins the line). */
  private chosen: number | null = null;
  private dragX: number | null = null;
  private dragged = 0;
  /** When the mode last changed (a tap's click lands a moment later on what just came up). */
  private wentAt = 0;
  private settled() {
    return performance.now() - this.wentAt > 450;
  }
  private fading = false;
  private v = new THREE.Vector3();

  constructor(private host: FrontHost) {
    this.id = FrontEnd.chosen();
    this.group.name = "gta:front";
    this.el = document.createElement("div");
    this.el.className = "gta-front";
    this.el.setAttribute("role", "dialog");
    this.el.setAttribute("aria-label", "ZStreet");
    this.el.innerHTML = `
      <div class="gf-shade"></div>
      <section class="gf-menu" aria-label="Main menu">
        <h1 class="gf-mark small" aria-label="ZStreet"><span>Z</span>STREET<small>The zkSNARK city · live on Zcash</small></h1>
        <nav class="gf-items" role="menu"></nav>
        <div class="gf-me" role="button" tabindex="-1" aria-label="Choose your zkSNARK"></div>
        <div class="gf-live"></div>
      </section>
      <div class="gf-wallet"><div class="gf-purse" aria-label="Your ⓩ and the city now"></div><button class="gf-connect" type="button"></button></div>
      <nav class="gf-stabs" role="tablist" aria-label="Store"></nav>
      <section class="gf-store" aria-label="Store">
        <header class="gf-phead"><button class="gf-back" type="button" aria-label="Back"><i></i></button><h2>Store</h2></header>
        <nav class="gf-vtabs" role="tablist" aria-label="Vehicles"></nav>
        <div class="gf-shelf" role="listbox" aria-label="Items"></div>
        <div class="gf-sbar"></div>
        <div class="gf-ext"></div>
      </section>
      <section class="gf-howto" aria-label="How to play">
        <header class="gf-phead"><button class="gf-back" type="button" aria-label="Back"><i></i></button><h2>How to play</h2></header>
        <div class="gf-pbody"></div>
      </section>
      <section class="gf-select" aria-label="Choose your zkSNARK">
        <header class="gf-shead"><button class="gf-back" type="button" aria-label="Back"><i></i></button><h2>Store</h2><span class="gf-count"></span></header>
        <div class="gf-card"></div>
        <div class="gf-nav"><button class="gf-arrow" data-step="-1" type="button" aria-label="Previous">‹</button><div class="gf-dots"></div><button class="gf-arrow" data-step="1" type="button" aria-label="Next">›</button></div>
        <div class="gf-tools">
          <form class="gf-num"><input type="number" min="1" max="10000" placeholder="#1–10000" aria-label="zkSNARK number"/><button class="gta-btn" type="submit">Find</button></form>
          <button class="gta-btn ghost" data-do="draw" type="button">Draw again</button>
          <button class="gta-btn ghost" data-do="all" type="button">All 10,000</button>
          <button class="gta-btn ghost gf-zilk" data-do="zilk" type="button">Buy on Zilk Road</button>
        </div>
        <button class="gta-btn gold gf-play" type="button"><span>Play</span>${TOUCH ? "" : "<small>Enter</small>"}</button>
      </section>
      <footer class="gf-hints"></footer>
      <div class="gf-fade"></div>`;
    host.ui.append(this.el);
    this.mosaic = new Mosaic(this.el, (id) => this.choose(id));
    this.el.addEventListener("pointerdown", (e) => this.down(e));
    window.addEventListener("pointermove", (e) => this.move(e));
    window.addEventListener("pointerup", (e) => this.up(e));
    window.addEventListener("keydown", (e) => this.key(e), true);
    for (const b of this.el.querySelectorAll<HTMLElement>(".gf-back")) b.addEventListener("click", () => this.settled() && this.back());
    this.el.querySelector(".gf-connect")!.addEventListener("click", () => void Wallet.open(this.el));
    this.el.querySelector(".gf-me")!.addEventListener("click", () => this.settled() && this.tab("zksnarks"));
    this.el.querySelector("[data-do=zilk]")!.addEventListener("click", () => void this.zilk());
    // what you own or wear changed, your ⓩ, the wallet: the menus say it at once (the car too)
    Store.onChange(() => {
      if (!this.open) return;
      this.dressStage();
      this.renderWallet();
      if (this.mode === "store" && this.storeTab === "vehicles") this.renderStore();
      if (this.mode === "menu") this.renderMenu();
    });
    Wallet.onChange(() => this.open && this.renderWallet());
    this.el.querySelector(".gf-play")!.addEventListener("click", () => this.settled() && this.play());
    for (const b of this.el.querySelectorAll<HTMLElement>(".gf-arrow")) b.addEventListener("click", () => this.step(Number(b.dataset.step)));
    this.el.querySelector("[data-do=draw]")!.addEventListener("click", () => this.draw());
    this.el.querySelector("[data-do=all]")!.addEventListener("click", () => this.mosaic.show(true));
    const form = this.el.querySelector<HTMLFormElement>(".gf-num")!;
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const input = form.querySelector("input")!;
      const v = Math.round(Number(input.value));
      if (v >= 1 && v <= 10000) {
        input.value = "";
        input.blur();
        this.choose(v);
      }
    });
    this.setStage(this.stage);
  }

  /** The zkSNARK picked last time (else the one the city gave this visitor). */
  static chosen() {
    try {
      const v = Number(localStorage.getItem(LAST));
      if (v >= 1 && v <= 10000) return v;
    } catch {}
    const a = profile.p.avatar;
    return a >= 1 && a <= 10000 ? a : 1 + Math.floor(Math.random() * 10000);
  }

  // ---- in and out ---------------------------------------------------------------------------------

  /**
   * Up: the main menu over the street (from the map), or straight to the line-up (from the game).
   * `play` gets the zkSNARK picked and, from the menu, where to start; `close` is called on the way
   * out without.
   */
  show(o: { select?: boolean; inGame?: boolean; play: (id: number, at: StartAt | null, then?: "map") => void; close: () => void }) {
    this.onPlay = o.play;
    this.onClose = o.close;
    this.inGame = !!o.inGame;
    this.open = true;
    this.cut = true;
    this.t = 0;
    this.sounded = false;
    this.el.classList.add("on");
    this.el.classList.toggle("ingame", this.inGame);
    this.host.ui.classList.add("gta-front-on");
    this.host.look(true);
    this.host.scene.add(this.group);
    this.stageUp();
    this.go(o.select ? "select" : "menu");
    if (!this.rare.length)
      void ZScan.rarest(12).then((r) => {
        this.rare = r;
        if (this.open && this.mode === "select") this.lineUp(true);
      });
  }

  /** Away, nothing picked (Back to the map, Esc from the line-up in the game). */
  close() {
    if (!this.open) return;
    this.down_();
    this.onClose?.();
  }

  private down_() {
    this.open = false;
    this.mosaic.show(false);
    // (what was only being looked at in the store is not what you drive away in)
    Store.clearPreview();
    this.unmountExt();
    this.el.classList.remove("on", "fade");
    this.host.ui.classList.remove("gta-front-on");
    this.host.look(false);
    this.clearStage();
    this.group.removeFromParent();
  }

  resize(w: number, h: number) {
    this.camera.aspect = w / h;
    // a phone held upright: wider, so the scene still fits
    this.camera.fov = w / h < 1 ? 58 : w / h < 1.4 ? 44 : 36;
    this.camera.updateProjectionMatrix();
  }

  /** Move the stage (debug: `street.gta.front.setStage({x, z, yaw})`), onto the kerb near there. */
  setStage(s: Stage) {
    const ou = new THREE.Vector3(Math.sin(s.yaw), 0, Math.cos(s.yaw));
    // slide out along `ou` to where the pavement meets the asphalt
    let x = s.x,
      z = s.z;
    let was: boolean | null = null;
    for (let d = -8; d <= 8; d += 0.1) {
      const px = s.x + ou.x * d,
        pz = s.z + ou.z * d;
      const r = this.host.road(px, pz);
      if (was === false && r) {
        x = px;
        z = pz;
        break;
      }
      was = r;
    }
    this.stage = { x, z, yaw: s.yaw, look: s.look ?? 1 };
    this.ou.copy(ou);
    this.al.set(Math.cos(s.yaw), 0, -Math.sin(s.yaw));
    if (this.open) {
      this.clearStage();
      this.stageUp();
      this.cut = true;
    }
  }

  /** Stage point (u along the kerb, v out over the road), on the ground. */
  private P(u: number, v: number, out = new THREE.Vector3()) {
    out.set(this.stage.x + this.al.x * u + this.ou.x * v, 0, this.stage.z + this.al.z * u + this.ou.z * v);
    out.y = this.host.surface(out.x, out.z);
    return out;
  }
  /** A heading (figure convention: facing +z at 0) from stage axes. */
  private H(du: number, dv: number) {
    const dx = this.al.x * du + this.ou.x * dv,
      dz = this.al.z * du + this.ou.z * dv;
    return Math.atan2(dx, dz);
  }

  // ---- the set ------------------------------------------------------------------------------------

  private stageUp() {
    this.car = new DriveCar("gt");
    const c = this.P(0, 1.75);
    // (its nose toward the camera)
    this.car.place(c.x, c.z, this.carYaw());
    this.group.add(this.car.group);
    // the crew, like a cover shot (k·u toward the camera): you at the car's nose on the road side,
    // one sitting on the nose, one on the kerb by it, one filming the car from the road; past the
    // car's far end a pair talking and one on the phone, on the pavement
    const ids = this.crewIds();
    const k = this.stage.look ?? 1;
    const spec: Omit<Crew, "fig">[] = [
      { u: k * 3.15, v: 3.45, face: this.H(k, 0.3), gesture: null, seat: 0, hero: true },
      { u: k * 2.78, v: 1.2, face: this.H(k, 0.1), gesture: null, seat: 0.56 },
      { u: k * 3.7, v: 0.36, face: this.H(k, 0.45), gesture: null, seat: 0.21 },
      { u: -k * 0.4, v: 4.3, face: this.H(-k * 0.25, -1), gesture: "film", seat: 0 },
      { u: -k * 3.3, v: -0.55, face: this.H(-k, 0.35), gesture: "talk", seat: 0, pair: 0 },
      { u: -k * 4.25, v: -0.2, face: this.H(k, 0.1), gesture: null, seat: 0, pair: 1 },
      { u: -k * 5.7, v: -1.25, face: this.H(k * 0.6, 1), gesture: "phone", seat: 0 },
    ];
    this.crew = spec.map((s, i) => {
      const fig = new SnarkFigure(s.hero ? this.id : ids[i]);
      fig.act.gesture = s.gesture;
      fig.act.seat = s.seat;
      const at = s.seat > 0.4 ? this.P(s.u, s.v).setY(0) : this.P(s.u, s.v);
      fig.root.position.copy(at);
      fig.root.rotation.y = s.face;
      this.group.add(fig.root);
      return { fig, ...s };
    });
    faces.want([this.id, ...ids], true);
  }

  private carYaw() {
    return this.stage.yaw + ((this.stage.look ?? 1) > 0 ? 0 : Math.PI);
  }

  /** The ZK-R beside the car while the store is up (its paint is for sale too). */
  private bike: DriveCar | null = null;
  private bikeAt() {
    return this.P(-(this.stage.look ?? 1) * 4.6, 2.3);
  }
  /** The car (and the bike) again in what you wear or what you are looking at in the store. */
  private dressStage() {
    if (!this.car) return;
    this.car.dispose();
    this.car.group.removeFromParent();
    this.car = new DriveCar("gt");
    const c = this.P(0, 1.75);
    this.car.place(c.x, c.z, this.carYaw());
    this.group.add(this.car.group);
    this.bike?.dispose();
    this.bike?.group.removeFromParent();
    this.bike = null;
    if (this.mode === "store") {
      this.bike = new DriveCar("moto");
      const b = this.bikeAt();
      this.bike.place(b.x, b.z, this.carYaw() + 0.35);
      this.group.add(this.bike.group);
    }
  }

  private crewIds() {
    // the same faces for a visit (a different crew another day)
    let seed = Math.floor(Date.now() / 864e5) * 7919 + 17;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    return Array.from({ length: 7 }, () => 1 + Math.floor(rnd() * 10000));
  }

  private clearStage() {
    for (const c of this.crew) c.fig.dispose();
    this.crew = [];
    for (const s of this.line) s.fig.dispose();
    this.line = [];
    this.car?.dispose();
    this.car?.group.removeFromParent();
    this.car = null;
    this.bike?.dispose();
    this.bike?.group.removeFromParent();
    this.bike = null;
  }

  /** The line-up along the pavement, past the car (rebuilt keeps those already standing). */
  private lineUp(keep = false) {
    const list = this.list();
    const old = new Map(this.line.map((s) => [s.id, s]));
    const next: Slot[] = [];
    // (away from the camera's side of the car, past the crew)
    const dir = -(this.stage.look ?? 1);
    let u = dir * 6.6;
    for (const it of list) {
      // (round a lamp post or a tree: a step further)
      for (let k = 0; k < 6 && this.host.blocked(this.P(u, -0.9).x, this.P(u, -0.9).z); k++) u += dir * 0.5;
      let s = keep ? old.get(it.id) : undefined;
      if (s) {
        old.delete(it.id);
        s.tag = it.tag;
        s.u = u;
      } else {
        const fig = new SnarkFigure(it.id);
        fig.root.rotation.y = this.H(0, 1);
        this.group.add(fig.root);
        s = { id: it.id, tag: it.tag, fig, u, out: 0 };
        fig.root.position.copy(this.P(u, -0.9));
      }
      next.push(s);
      u += dir * 1.55;
    }
    // (those not in the new line go: all of the old ones when it is drawn afresh)
    for (const s of old.values()) s.fig.dispose();
    this.line = next;
    faces.want(
      next.map((s) => s.id),
      true,
    );
    const at = next.findIndex((s) => s.id === this.id);
    this.sel = at >= 0 ? at : 0;
    this.renderSelect();
  }

  private list() {
    const mine = profile.p.avatar;
    const out: { id: number; tag: string }[] = [];
    const seen = new Set<number>();
    const add = (id: number, tag: string) => {
      if (seen.has(id) || !(id >= 1 && id <= 10000)) return;
      seen.add(id);
      out.push({ id, tag });
    };
    if (mine >= 1) add(mine, "Yours");
    add(this.id, this.id === mine ? "Yours" : "Last played");
    if (this.chosen) add(this.chosen, "Picked");
    for (const r of this.rare.slice(0, 4)) add(r.id, `Rank ${r.rank}`);
    if (!this.picks.length) this.picks = Array.from({ length: 4 }, () => 1 + Math.floor(Math.random() * 10000));
    for (const p of this.picks) add(p, "Random");
    return out;
  }

  private draw() {
    this.picks = Array.from({ length: 4 }, () => 1 + Math.floor(Math.random() * 10000));
    const cur = this.line[this.sel]?.id;
    this.lineUp(true);
    // stay on a random one: the first new face
    const first = this.line.findIndex((s) => s.tag === "Random");
    this.sel = cur && this.line[this.sel]?.tag !== "Random" ? this.line.findIndex((s) => s.id === cur) : Math.max(0, first);
    this.focusSlot();
  }

  /** A number typed or picked in the 10,000: it joins the line and comes to the front. */
  private choose(id: number) {
    if (!(id >= 1 && id <= 10000)) return;
    if (this.mode !== "select") this.go("select");
    if (!this.line.some((s) => s.id === id)) this.chosen = id;
    this.lineUp(true);
    this.sel = Math.max(0, this.line.findIndex((s) => s.id === id));
    this.focusSlot();
  }

  private step(d: number) {
    if (!this.line.length) return;
    this.sel = (this.sel + d + this.line.length) % this.line.length;
    this.focusSlot();
  }

  private focusSlot() {
    const s = this.line[this.sel];
    if (!s) return;
    s.fig.wave(1.6);
    this.renderSelect();
  }

  // ---- the modes ----------------------------------------------------------------------------------

  private go(m: Mode) {
    const was = this.mode;
    this.mode = m;
    this.wentAt = performance.now();
    this.el.dataset.mode = m;
    // the store's previews stop when you leave it; the bike comes and goes with it
    if (was === "store" && m !== "store") {
      Store.clearPreview();
      this.dressStage();
    }
    if (m === "store" && was !== "store") {
      this.dressStage();
      this.renderStore(true);
    }
    if (m !== "store") this.unmountExt();
    // the line-up: the STORE's first tab (from the game: the zkSNARKs alone)
    if (m === "select") this.el.querySelector(".gf-select h2")!.textContent = this.inGame ? "zkSNARKs" : "Store";
    if (m === "select" || m === "store") this.renderTabs();
    if (m === "howto") this.renderHowto();
    this.renderWallet();
    if (m === "menu") this.renderMenu();
    if (m === "select") {
      if (!this.line.length) this.lineUp();
      else this.renderSelect();
      // you step into the line: the one by the car goes
      for (const c of this.crew) if (c.hero) c.fig.root.visible = false;
    } else for (const c of this.crew) c.fig.root.visible = true;
    // in the store the car stands alone (the crew would stand between it and you)
    if (m === "store") for (const c of this.crew) c.fig.root.visible = false;
    this.renderHints();
  }

  /** To the line-up (the settings' "zkSNARK" tab). */
  select() {
    if (this.open) this.go("select");
  }

  private back() {
    if (this.mosaic.isOpen) return this.mosaic.show(false);
    if (this.mode === "store" || this.mode === "howto") return this.go("menu");
    if (this.mode === "select") return this.inGame ? this.close() : this.go("menu");
    // (the menu: back to the map)
    this.close();
  }

  private items(): { k: string; label: string; badge?: string; hot?: boolean }[] {
    const can = Store.affordable();
    return [
      { k: "play", label: "Play", badge: `#${this.id}` },
      { k: "store", label: "Store", ...(can ? { badge: `${can} to unlock`, hot: true } : {}) },
      // (the city as it was before the game: the free camera over the districts, click a place)
      { k: "map", label: "Map" },
      { k: "howto", label: "How to play" },
      { k: "settings", label: "Settings" },
    ];
  }

  /** Top right: your ⓩ, the block, who is in town, and the wallet (ZK Cards' purse and its connect button). */
  private renderWallet() {
    const n = (v: number) => v.toLocaleString("en-US");
    const l = this.host.live?.();
    const purse = this.el.querySelector(".gf-purse")!;
    purse.innerHTML = `<span title="Your ⓩ: earned in the missions, spent in the store"><i class="gf-coin">ⓩ</i><b>${n(Store.balance())}</b></span><span title="The last block"><i class="gf-cube"></i><b>${l?.block ? n(l.block) : "—"}</b></span><span title="Players in town"><i class="gf-dotp"></i><b>${l ? n(l.online) : "—"}</b></span>`;
    const w = Wallet.state();
    const btn = this.el.querySelector(".gf-connect")!;
    btn.classList.toggle("on", !!w.address);
    btn.innerHTML = w.address ? `<i></i><b>${esc(w.label!)}</b>` : `<b>Connect wallet</b>`;
    btn.setAttribute("aria-label", w.address ? `Wallet ${w.label}` : "Connect wallet");
  }

  /** Bottom right: the chain's next block, the hour and the weather. */
  private renderLive() {
    const l = this.host.live?.();
    const card = this.el.querySelector(".gf-live");
    if (!card) return;
    if (!l) return void (card.innerHTML = "");
    const n = (v: number) => v.toLocaleString("en-US");
    const eta = l.nextIn === null || l.nextIn <= 1 ? "any second" : `in ~${Math.round(l.nextIn)} s`;
    card.innerHTML = `<span class="gf-who"><small>Live on the chain</small><b>Block ${l.block ? n(l.block + 1) : "—"}</b><em>${eta} · ${n(l.mempool)} tx waiting</em><em class="dim">${esc(l.clock)} · ${esc(l.weather)}</em></span><span class="gf-zec" aria-hidden="true">ⓩ</span>`;
    this.renderWallet();
  }

  private renderMenu() {
    const items = this.items();
    this.menuAt = Math.min(this.menuAt, items.length - 1);
    const nav = this.el.querySelector(".gf-items")!;
    nav.innerHTML = items
      .map((it, i) => `<button class="gf-item ${i === this.menuAt ? "on" : ""}" role="menuitem" data-k="${it.k}" data-i="${i}" type="button"><b>${esc(it.label)}</b>${it.badge ? `<em class="gf-badge ${it.hot ? "hot" : ""}">${esc(it.badge)}</em>` : ""}</button>`)
      .join("");
    for (const b of nav.querySelectorAll<HTMLElement>(".gf-item")) {
      b.addEventListener("pointerenter", () => {
        if (TOUCH) return;
        this.menuAt = Number(b.dataset.i);
        for (const o of nav.querySelectorAll(".gf-item")) o.classList.toggle("on", o === b);
      });
      b.addEventListener("click", () => this.settled() && this.pick(b.dataset.k!));
    }
    this.renderLive();
    const mine = this.id === profile.p.avatar;
    const me = this.el.querySelector<HTMLElement>(".gf-me")!;
    me.innerHTML = `<span class="gf-face"><img src="${esc(ZScan.zkSnarkImage(this.id))}" alt=""/></span><span class="gf-who"><small>Playing as</small><b>zkSNARK #${this.id}</b><em>${mine ? "Yours" : "Store · change"}</em></span>`;
  }

  private pick(k: string) {
    if (k === "play") this.play();
    else if (k === "store") this.tab(this.storeTab);
    else if (k === "howto") this.go("howto");
    else if (k === "settings") this.host.settings();
    else if (k === "map") this.close();
  }

  // ---- the store ---------------------------------------------------------------------------------

  private storeTab: Tab = "vehicles";
  private storeCat: StoreCat = "paint";
  private storeAt = 0;
  private storeMsg = "";

  /** To a tab of the STORE (zkSNARKs: the line-up). */
  private tab(t: Tab, cat?: StoreCat) {
    if (t !== "zksnarks") this.storeTab = t;
    if (t === "zksnarks") return this.mode === "select" ? this.renderTabs() : this.go("select");
    if (cat && cat !== this.storeCat) {
      Store.preview(this.storeCat, null);
      this.storeCat = cat;
      this.storeMsg = "";
      if (this.mode === "store") this.renderStore(true);
    }
    if (this.mode !== "store") return this.go("store");
    this.renderStore(true);
    this.renderTabs();
  }

  private renderTabs() {
    const on: Tab = this.mode === "select" ? "zksnarks" : this.storeTab;
    const tabs = this.el.querySelector(".gf-stabs")!;
    tabs.innerHTML = TABS.map((c) => `<button type="button" role="tab" data-tab="${c.key}" class="${c.key === on ? "on" : ""}" aria-selected="${c.key === on}">${c.label}</button>`).join("");
    for (const b of tabs.querySelectorAll<HTMLElement>("button")) b.addEventListener("click", () => this.settled() && this.tab(b.dataset.tab as Tab));
    this.el.dataset.tab = on;
    this.renderHints();
  }

  /** HOME and GET ⓩ: their module's tab, mounted in the store (or what is coming). */
  private extOff: (() => void) | null = null;
  private extKey: Tab | null = null;
  private unmountExt() {
    this.extOff?.();
    this.extOff = null;
    this.extKey = null;
    const el = this.el.querySelector<HTMLElement>(".gf-ext");
    if (el) el.innerHTML = "";
  }
  private ctx(): StoreTabContext {
    return {
      economy: Economy,
      root: this.el,
      play: (id) => (id ? this.choose(id) : undefined, this.settled() && this.play()),
      choose: (id) => this.choose(id),
      say: (t) => {
        const n = this.el.querySelector<HTMLElement>(".gf-ext-note");
        if (n) n.textContent = t;
      },
    };
  }
  private mountExt() {
    const key = this.storeTab;
    if (this.extKey === key) return;
    this.unmountExt();
    this.extKey = key;
    const el = this.el.querySelector<HTMLElement>(".gf-ext")!;
    const k = key === "home" ? "home" : "getz";
    if (!(k in extLoaded)) {
      void loadTab(k).then(() => {
        if (this.open && this.mode === "store" && this.extKey === key) {
          this.extKey = null;
          this.mountExt();
        }
      });
      return;
    }
    const t = extTab(k);
    if (!t) {
      el.innerHTML =
        key === "home"
          ? `<div class="gf-soon gf-plate"><small>Home</small><b>Your house, furnished</b><p>You start the game in one of your houses: its furniture is sold here, for ⓩ, and stays where you put it. Coming to the store.</p></div>`
          : `<div class="gf-soon gf-plate"><small>Get ⓩ</small><b>ⓩ for ZEC</b><p>Play money bought with real ZEC, from your own wallet. Coming to the store. Until then ⓩ are earned in the missions (the map, <kbd>M</kbd>, shows them all).</p></div>`;
      return;
    }
    el.innerHTML = `<div class="gf-ext-body"></div><p class="gf-ext-note gf-snote"></p>`;
    const off = t.mount(el.querySelector<HTMLElement>(".gf-ext-body")!, this.ctx());
    this.extOff = typeof off === "function" ? off : null;
  }

  /** Zilk Road's market (zilk.ts) over the line-up: buy a zkSNARK for real. */
  private async zilk() {
    const t = await loadTab("zksnarks");
    if (!this.open || this.el.querySelector(".gfw")) return;
    const s = openSheet(
      this.el,
      t
        ? `<h2>Zilk Road</h2><div class="gfw-ext"></div>`
        : `<h2>Zilk Road</h2><p class="gfw-note">The zkSNARKs for sale on Zilk Road, their prices, and buying one from your wallet: coming to the store. You can already play as any of the 10,000 here.</p>`,
      () => off?.(),
      t ? "wide" : "",
    );
    const r = t?.mount(s.el.querySelector<HTMLElement>(".gfw-ext")!, { ...this.ctx(), choose: (id) => (this.choose(id), s.close()) });
    const off = typeof r === "function" ? r : null;
  }

  /** The items of the tab, the one in focus previewed on the car (or the bike). */
  private renderStore(reset = false) {
    this.el.dataset.tab = this.storeTab;
    if (this.storeTab !== "vehicles") {
      Store.clearPreview();
      return this.mountExt();
    }
    this.unmountExt();
    const list = Store.of(this.storeCat);
    if (reset) this.storeAt = Math.max(0, list.findIndex((i) => i.id === Store.wearing(this.storeCat)));
    this.storeAt = Math.min(this.storeAt, list.length - 1);
    const it = list[this.storeAt];
    const tabs = this.el.querySelector(".gf-vtabs")!;
    tabs.innerHTML = CATS.map((c) => `<button type="button" role="tab" data-cat="${c.key}" class="${c.key === this.storeCat ? "on" : ""}" aria-selected="${c.key === this.storeCat}">${c.label}</button>`).join("");
    for (const b of tabs.querySelectorAll<HTMLElement>("button")) b.addEventListener("click", () => this.storeSub(b.dataset.cat as StoreCat));
    const shelf = this.el.querySelector(".gf-shelf")!;
    shelf.innerHTML = list
      .map((x, i) => {
        const owned = Store.owns(x.id),
          worn = Store.wearing(x.cat) === x.id;
        const tag = worn ? `<em class="gf-tag gold">Wearing</em>` : owned ? `<em class="gf-tag">Owned</em>` : `<em class="gf-price">ⓩ ${x.price.toLocaleString("en-US")}</em>`;
        return `<button type="button" role="option" class="gf-tile ${i === this.storeAt ? "on" : ""} ${worn ? "worn" : ""}" data-i="${i}" aria-selected="${i === this.storeAt}">${this.swatch(x)}<b>${esc(x.name)}</b>${tag}</button>`;
      })
      .join("");
    for (const b of shelf.querySelectorAll<HTMLElement>(".gf-tile"))
      b.addEventListener("click", () => {
        const i = Number(b.dataset.i);
        if (i === this.storeAt) return this.storeAct();
        this.storeAt = i;
        this.storeFocus();
      });
    shelf.querySelector(".gf-tile.on")?.scrollIntoView({ block: "nearest", inline: "nearest" });
    // the bar: your ⓩ, and buy / wear / wearing
    const bal = Store.balance();
    const owned = it ? Store.owns(it.id) : false,
      worn = it ? Store.wearing(it.cat) === it.id : false;
    const short = it && !owned ? it.price - bal : 0;
    const main = !it ? "" : worn ? `<button class="gf-btn gold" type="button" disabled>Wearing</button>` : owned ? `<button class="gf-btn gold" data-act type="button">Wear <small>Enter</small></button>` : short > 0 ? `<button class="gf-btn gold" type="button" disabled>ⓩ ${short.toLocaleString("en-US")} short</button>` : `<button class="gf-btn gold" data-act type="button">Buy <small>ⓩ ${it.price.toLocaleString("en-US")}</small></button>`;
    const note = this.storeMsg || (it?.horn ? it.horn.line : short > 0 ? "Earn ⓩ in the missions (Block Run, Shielded Ride, Proof Boards, Speed Traps), or get them at Get ⓩ." : this.storeCat === "bike" ? "The ZK-R parked by your car, in this paint." : "Your ZK-GT, in the street behind.");
    this.el.querySelector(".gf-sbar")!.innerHTML = `<span class="gf-bal"><b>${bal.toLocaleString("en-US")}</b><small>Your ⓩ</small></span>${main}<button class="gf-btn" data-play type="button">Play</button>${it?.horn ? `<button class="gf-btn" data-honk type="button">Sound it</button>` : ""}<p class="gf-snote">${esc(note)}</p>`;
    this.el.querySelector(".gf-sbar [data-act]")?.addEventListener("click", () => this.storeAct());
    this.el.querySelector(".gf-sbar [data-play]")?.addEventListener("click", () => this.settled() && this.play());
    this.el.querySelector(".gf-sbar [data-honk]")?.addEventListener("click", () => this.host.honk?.());
  }

  private swatch(x: StoreItem) {
    if (x.cat === "horn") return `<span class="gf-sw horn" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round"/></svg></span>`;
    if (x.cat === "neon") return x.color ? `<span class="gf-sw neon" style="--c:${x.color}" aria-hidden="true"></span>` : `<span class="gf-sw off" aria-hidden="true"></span>`;
    if (x.cat === "rims") return `<span class="gf-sw rim" style="--c:${x.color}" aria-hidden="true"></span>`;
    return `<span class="gf-sw paint ${x.finish ?? ""}" style="--c:${x.color};--a:${x.accent ?? "#141418"}" aria-hidden="true"></span>`;
  }

  private storeSub(cat: StoreCat) {
    if (cat === this.storeCat) return;
    Store.preview(this.storeCat, null);
    this.storeCat = cat;
    this.storeMsg = "";
    this.renderStore(true);
    this.storeFocus();
  }

  /** The item in focus on the car (or the horn, sounded). */
  private storeFocus() {
    const it = Store.of(this.storeCat)[this.storeAt];
    this.storeMsg = "";
    if (!it) return;
    // (what you wear needs no preview)
    Store.preview(it.cat, Store.wearing(it.cat) === it.id ? null : it.id);
    if (it.cat === "horn") this.host.honk?.();
    this.renderStore();
  }

  /** Buy (or wear) the item in focus. */
  private storeAct() {
    const it = Store.of(this.storeCat)[this.storeAt];
    if (!it) return;
    if (Store.wearing(it.cat) === it.id) return;
    const owned = Store.owns(it.id);
    if (owned ? Store.wear(it.id) : Store.buy(it.id)) {
      Store.preview(it.cat, null);
      this.storeMsg = owned ? `${it.name}: on.` : `${it.name}: yours. ⓩ ${it.price.toLocaleString("en-US")} spent.`;
    } else this.storeMsg = `Not enough ⓩ for ${it.name}.`;
    this.renderStore();
  }

  // ---- how to play -----------------------------------------------------------------------------------

  private renderHowto() {
    const k = (s: string) => `<kbd>${s}</kbd>`;
    const step = (n: string, title: string, html: string) => `<article class="gf-step gf-plate"><i>${n}</i><h4>${title}</h4><p>${html}</p></article>`;
    const body = this.el.querySelector(".gf-howto .gf-pbody")!;
    body.innerHTML = `<div class="gf-steps">
        ${step("1", "On foot", `${k("W")}${k("A")}${k("S")}${k("D")} walk (${k("Z")}${k("Q")}${k("S")}${k("D")} too), ${k("Shift")} sprint, ${k("Space")} jump. ${k("E")} opens a door, talks to someone, uses what is in front of you.`)}
        ${step("2", "Any ride", `${k("F")} by any car, taxi, cruiser, van, bike or scooter: its driver is pulled out (and may fight back). ${k("F")} again to get out.`)}
        ${step("3", "Driving", `${k("Shift")} nitrous, ${k("Space")} handbrake drift, ${k("C")} camera, ${k("B")} look back, ${k("Q")} next radio station, ${k("H")} horn, ${k("R")} back on the road.`)}
        ${step("4", "Missions", `${k("M")} the map: Block Run, Shielded Ride, Proof Boards, Speed Traps. Each pays ⓩ — spend them in the store: your car and bike (paint, neon, rims, the horn), your home's furniture.`)}
        ${step("5", "Fists", `${k("Click")} punch, ${k("Right click")} guard (it turns you to whoever is in front). Hit someone and the street reacts: they run, film, call the police.`)}
        ${step("6", "The city", "Walk into 30+ places, cross the Golden Gate to Orchard Keys, swim off Orchard Beach. Every block of Zcash arrives live: on the metro, the screens, the radio.")}
      </div>
      <div class="gf-pbar"><button class="gf-btn gold" data-play type="button">Play</button><button class="gf-btn" data-keys type="button">All the controls</button></div>`;
    body.querySelector("[data-play]")!.addEventListener("click", () => this.settled() && this.play());
    body.querySelector("[data-keys]")!.addEventListener("click", () => this.host.settings("controls"));
  }

  private renderSelect() {
    const s = this.line[this.sel];
    if (!s) return;
    const dots = this.el.querySelector(".gf-dots")!;
    dots.innerHTML = this.line.map((x, i) => `<button class="gf-dot ${i === this.sel ? "on" : ""} ${x.tag === "Yours" ? "gold" : ""}" data-i="${i}" type="button" aria-label="#${x.id}"><img src="${esc(ZScan.zkSnarkImage(x.id))}" alt="" loading="lazy"/></button>`).join("");
    for (const b of dots.querySelectorAll<HTMLElement>(".gf-dot"))
      b.addEventListener("click", () => {
        this.sel = Number(b.dataset.i);
        this.focusSlot();
      });
    this.el.querySelector(".gf-count")!.textContent = `${this.sel + 1} / ${this.line.length}`;
    const card = this.el.querySelector(".gf-card")!;
    const id = s.id;
    const head = `<div class="gf-cname gta-disp">zkSNARK <em>#${id}</em></div><div class="gf-ctags">${s.tag === "Yours" ? `<b class="gta-tag gold">Yours</b>` : s.tag === "Random" || s.tag.startsWith("Rank") ? "" : `<b class="gta-tag">${esc(s.tag)}</b>`}<span class="gf-band"></span></div><dl class="gf-traits"></dl>`;
    card.innerHTML = head;
    void (mapDoc ??= get<MapDoc>("/v1/collections/zksnarks/map").catch(() => null)).then((doc) => {
      if (!doc || this.line[this.sel]?.id !== id) return;
      const t = doc.items.find((x) => x[0] === id);
      if (!t) return;
      const rank = t[1];
      const band = rank ? BANDS.find((b) => rank <= b.to) : null;
      const bandEl = card.querySelector(".gf-band")!;
      bandEl.innerHTML = band ? `<b class="gta-tag" style="--c:${band.color}"><i></i>${band.name}</b>${rank ? `<span>Rank ${rank.toLocaleString("en-US")}</span>` : ""}` : "";
      const rows = SHOWN.map((n) => {
        const ti = doc.traits.findIndex((x) => x.trait_type === n);
        const vi = ti >= 0 ? t[7][ti] : undefined;
        const v = vi !== undefined && vi >= 0 ? doc.traits[ti].values[vi] : null;
        return v ? `<div><dt>${esc(n)}</dt><dd>${esc(v)}</dd></div>` : "";
      }).join("");
      card.querySelector(".gf-traits")!.innerHTML = rows;
    });
    this.el.querySelector(".gf-play span")!.textContent = this.inGame ? `Be #${id}` : `Play as #${id}`;
  }

  private renderHints() {
    const k = (s: string) => `<kbd>${s}</kbd>`;
    const h = this.el.querySelector(".gf-hints")!;
    if (TOUCH) return void (h.innerHTML = "");
    h.innerHTML =
      this.mode === "howto"
        ? `<span>${k("Enter")} Play</span><span>${k("Esc")} Back</span>`
        : this.mode === "menu"
          ? `<span>${k("↑")}${k("↓")} Choose</span><span>${k("Enter")} Select</span><span>${k("Esc")} Map</span>`
          : this.mode === "store"
            ? `<span>${k("←")}${k("→")} Browse</span><span>${k("↑")}${k("↓")} Tabs</span><span>${k("Enter")} Buy · wear</span><span>${k("Esc")} Back</span>`
            : `<span>${k("←")}${k("→")} Browse</span>${this.inGame ? "" : `<span>${k("↑")}${k("↓")} Tabs</span>`}<span>${k("Enter")} ${this.inGame ? "Wear" : "Play"}</span><span>${k("Esc")} Back</span>`;
  }

  // ---- input -------------------------------------------------------------------------------------

  /** The first gesture in the front end (a key, a click, a tap: the browser wants one): the city's sound on. */
  private sounded = false;
  private gesture() {
    if (this.sounded) return;
    this.sounded = true;
    this.host.startSound();
  }

  private key(e: KeyboardEvent) {
    if (!this.open || this.fading) return;
    if (!e.metaKey && !e.ctrlKey) this.gesture();
    const tag = (e.target as HTMLElement)?.tagName ?? "";
    if (/input|textarea|select/i.test(tag)) {
      if (e.key === "Escape") (e.target as HTMLElement).blur();
      return;
    }
    // the game's settings panel is over us: it has its own keys (the wallet's sheet too)
    if (this.host.ui.querySelector(".gta-hud.front .gh-pause.on") || this.el.querySelector(".gfw")) return;
    if (this.mosaic.isOpen) {
      if (e.key === "Escape") {
        this.mosaic.show(false);
        e.preventDefault();
        e.stopImmediatePropagation();
      }
      return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (["Shift", "Meta", "Control", "Alt", "CapsLock", "Tab"].includes(e.key)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.key === "Escape" || e.key === "Backspace") return this.back();
    // ↑/↓ through the store's tabs (the line-up's too, from the menu)
    const down = e.key === "ArrowDown" || e.key === "s" || e.key === "S",
      up = e.key === "ArrowUp" || e.key === "w" || e.key === "W" || e.key === "z" || e.key === "Z";
    if ((this.mode === "store" || (this.mode === "select" && !this.inGame)) && (down || up)) {
      const at = this.mode === "select" ? 0 : FLAT.findIndex((f) => f.tab === this.storeTab && (f.tab !== "vehicles" || f.cat === this.storeCat));
      const f = FLAT[(at + (down ? 1 : FLAT.length - 1)) % FLAT.length];
      return this.tab(f.tab, f.cat);
    }
    if (this.mode === "store") {
      if (this.storeTab !== "vehicles") {
        extTab(this.storeTab === "home" ? "home" : "getz")?.onKey?.(e);
        return;
      }
      const list = Store.of(this.storeCat);
      if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") (this.storeAt = (this.storeAt + 1) % list.length), this.storeFocus();
      else if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A" || e.key === "q" || e.key === "Q") (this.storeAt = (this.storeAt + list.length - 1) % list.length), this.storeFocus();
      else if (e.key === "Enter" || e.key === " ") this.storeAct();
      return;
    }
    if (this.mode === "howto") {
      if (e.key === "Enter" || e.key === " ") this.play();
      return;
    }
    if (this.mode === "menu") {
      const n = this.items().length;
      if (e.key === "ArrowDown" || e.key === "s" || e.key === "S") this.menuAt = (this.menuAt + 1) % n;
      else if (e.key === "ArrowUp" || e.key === "w" || e.key === "W" || e.key === "z" || e.key === "Z") this.menuAt = (this.menuAt + n - 1) % n;
      else if (e.key === "Enter" || e.key === " ") return this.pick(this.items()[this.menuAt].k);
      this.renderMenu();
      return;
    }
    if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") this.step(1);
    else if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A" || e.key === "q" || e.key === "Q") this.step(-1);
    else if (e.key === "Enter" || e.key === " ") this.play();
  }

  private down(e: PointerEvent) {
    if (!this.open || this.fading) return;
    const t = e.target as HTMLElement;
    this.gesture();
    if (this.mode !== "select" || t.closest("button,input,form,.gg-mosaic,.gf-card")) return;
    this.dragX = e.clientX;
    this.dragged = 0;
  }

  private move(e: PointerEvent) {
    if (this.dragX === null) return;
    const dx = e.clientX - this.dragX;
    this.dragged = Math.max(this.dragged, Math.abs(dx));
    // a swipe: one along per ~90 px
    if (Math.abs(dx) > 90) {
      this.step(dx < 0 ? 1 : -1);
      this.dragX = e.clientX;
    }
  }

  private up(e: PointerEvent) {
    if (this.dragX === null) return;
    this.dragX = null;
    if (this.dragged > 8 || this.mode !== "select") return;
    // a tap: the figure nearest it on screen
    const w = window.innerWidth,
      h = window.innerHeight;
    let best = -1,
      bd = 80 * 80;
    this.line.forEach((s, i) => {
      this.v.copy(s.fig.root.position).setY(s.fig.root.position.y + 0.6).project(this.camera);
      if (this.v.z > 1) return;
      const d = ((this.v.x * 0.5 + 0.5) * w - e.clientX) ** 2 + ((-this.v.y * 0.5 + 0.5) * h - e.clientY) ** 2;
      if (d < bd) (bd = d), (best = i);
    });
    if (best < 0) return;
    if (best === this.sel) return this.play();
    this.sel = best;
    this.focusSlot();
  }

  // ---- play ---------------------------------------------------------------------------------------

  private play(then?: "map") {
    if (this.fading || !this.open) return;
    const id = this.mode === "select" ? (this.line[this.sel]?.id ?? this.id) : this.id;
    try {
      localStorage.setItem(LAST, String(id));
    } catch {}
    this.id = id;
    // where you start: where you stood under the menu, by the car's nose, looking down the street
    // the way the menu's camera did (the game's camera comes in behind you, where it was)
    const k = this.stage.look ?? 1;
    const p = this.P(k * 3.15, 3.45);
    const c = this.P(0, 1.75);
    const at: StartAt | null = this.inGame
      ? null
      : {
          x: p.x,
          z: p.z,
          heading: Math.atan2(k * this.al.x, k * this.al.z),
          car: { x: c.x, z: c.z, yaw: this.carYaw() },
        };
    this.host.startSound();
    // a short fade to black, the street in the game behind it
    this.fading = true;
    this.el.classList.add("fade");
    setTimeout(() => {
      this.down_();
      this.onPlay?.(id, at, then);
      this.fading = false;
    }, 420);
  }

  // ---- every frame --------------------------------------------------------------------------------

  private liveT = 0;
  update(dt: number) {
    if (!this.open) return;
    this.t += dt;
    const t = this.t;
    // the chips and the chain's card tick on (the next block's countdown, the hour)
    if ((this.liveT -= dt) <= 0) {
      this.liveT = 1;
      if (this.mode === "menu") this.renderLive();
      else this.renderWallet();
    }
    // the store's bike stands by (its wheels and lean settled)
    this.bike?.group.updateMatrixWorld();
    // the crew: the pair talking in turns, you waving now and then
    for (const c of this.crew) {
      if (c.pair !== undefined) {
        const turn = (Math.floor(t / 3.4) + c.pair) % 2 === 0;
        c.fig.act.gesture = turn ? "talk" : null;
        c.fig.act.lookYaw = turn ? 0 : Math.sin(t * 0.7 + c.u) * 0.15;
      }
      if (c.hero && (t % 9 < dt || (t > 1.4 && t - dt <= 1.4))) c.fig.wave(1.8);
      c.fig.update(dt, { speed: 0 });
      // (a wave ends the gesture: a phone or a camera goes back up)
      if (c.gesture && !c.fig.act.gesture) c.fig.act.gesture = c.gesture;
    }
    // the line-up: the one in front steps out, turns a little toward the camera
    this.line.forEach((s, i) => {
      const on = this.mode === "select" && i === this.sel;
      s.out += ((on ? 1 : 0) - s.out) * damp(6, dt);
      const p = this.P(s.u, -0.9 + s.out * 0.75, this.v);
      const sp = Math.abs(s.out - (on ? 1 : 0)) > 0.05 ? 1.1 : 0;
      s.fig.root.position.copy(p);
      s.fig.root.rotation.y = this.H(-0.12 * s.out, 1);
      // the others look at the one picked
      if (this.mode === "select" && !on) s.fig.act.lookYaw += (Math.sign(this.sel - i) * 0.6 - s.fig.act.lookYaw) * damp(3, dt);
      else s.fig.act.lookYaw *= 1 - damp(3, dt);
      s.fig.root.visible = this.mode === "select" || s.out > 0.02;
      s.fig.update(dt, { speed: sp });
    });
    this.aim(dt);
  }

  /** The camera: a slow drift round the car on the title, the group to the right under the menu, along the line-up. */
  private aim(dt: number) {
    const t = this.t;
    const narrow = this.camera.aspect < 1;
    if (this.mode === "store") {
      const k = this.stage.look ?? 1;
      const bike = this.storeCat === "bike";
      const c = bike ? this.bikeAt() : this.P(0, 1.75);
      this.wantAim.set(c.x, bike ? 0.75 : 0.62, c.z);
      // a slow turn round it, from the road side, a little above
      const a = (bike ? 0.9 : 0.75) + Math.sin(t * 0.12) * 0.32;
      const r = narrow ? (bike ? 6.2 : 8.4) : bike ? 5.2 : 6.3;
      const du = Math.cos(a) * r * k,
        dv = Math.sin(a) * r;
      const p = this.P(0, 0, this.wantPos);
      p.set(c.x + this.al.x * du + this.ou.x * dv, (bike ? 1.4 : 1.7) + Math.sin(t * 0.1) * 0.12, c.z + this.al.z * du + this.ou.z * dv);
      // (the thing a little above the middle of the picture: the shelf and the bar take the bottom)
      this.wantAim.y -= narrow ? 0.55 : 0.32;
    } else if (this.mode === "select" && this.line[this.sel]) {
      // across the road at the one in front of the line, a little to its side; the card on the left
      const s = this.line[this.sel];
      const k = this.stage.look ?? 1;
      this.P(s.u, -0.3, this.wantAim).y = 0.78;
      // (from up the line a little: the line goes off at an angle behind the one in front)
      this.P(s.u + k * 2.1, narrow ? 6.6 : 4.7, this.wantPos).y = 1.25;
      if (!narrow) {
        const right = this.v.subVectors(this.wantAim, this.wantPos).cross(THREE.Object3D.DEFAULT_UP).normalize();
        this.wantAim.addScaledVector(right, -0.8);
      }
    } else {
      // a cover shot down the street: from out in the road past the car's nose, a little above the
      // crew's heads, the street going on behind to the low sun; under the menu a little wider. It sways.
      const menu = this.mode === "menu" || this.mode === "howto";
      const k = this.stage.look ?? 1;
      const a = (menu ? 0.36 : 0.3) + Math.sin(t * 0.085) * 0.06;
      const r = (narrow ? 15 : menu ? 12 : 11) + Math.sin(t * 0.05) * 0.7;
      const cu = k * 0.3;
      this.P(cu, 1.0, this.wantAim).y = 0.95;
      this.P(cu + k * Math.cos(a) * r, 1.0 + Math.sin(a) * r, this.wantPos).y = (menu ? 2.2 : 2.0) + Math.sin(t * 0.11) * 0.15;
      // the group sits to the right of the picture (the wordmark, the menu on the left)
      if (!narrow) {
        const right = this.v.subVectors(this.wantAim, this.wantPos).cross(THREE.Object3D.DEFAULT_UP).normalize();
        this.wantAim.addScaledVector(right, menu ? -2.6 : -1.7);
      }
    }
    if (this.cut) {
      this.cut = false;
      this.camPos.copy(this.wantPos);
      this.camAim.copy(this.wantAim);
    } else {
      const k = damp(this.mode === "select" ? 4 : 1.6, dt);
      this.camPos.lerp(this.wantPos, k);
      this.camAim.lerp(this.wantAim, k);
    }
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camAim);
    this.camera.updateMatrixWorld();
    this.focus.copy(this.camAim).setY(0);
  }
}

// ---- the golden hour -----------------------------------------------------------------------------

/** What the look changes (main.ts gives its own; the street's theme puts it all back after). */
export interface LookTargets {
  scene: THREE.Scene;
  renderer: THREE.WebGLRenderer;
  hemi: THREE.HemisphereLight;
  sun: THREE.DirectionalLight;
  bloom: { strength: number; threshold: number };
  /** The sun's offset from the point it lights (main.ts moves the shadow light with it). */
  offset: THREE.Vector3;
}

/** The sun low in the south-west: long shadows, warm fronts, a dusk sky. */
const GOLD_SUN = new THREE.Vector3(-30, 13, 31);

/** Over a day-themed street: the low warm sun, a violet-to-gold sky, a warm haze, the neon up. */
export function goldenHour(t: LookTargets) {
  t.offset.copy(GOLD_SUN);
  t.scene.background = duskSky(GOLD_SUN.clone().normalize());
  t.scene.fog = new THREE.Fog("#d8a28c", 130, 400);
  t.scene.environmentIntensity = 0.32;
  t.renderer.toneMappingExposure = 0.98;
  t.hemi.color.set("#ffd2b0");
  t.hemi.groundColor.set("#5d4470");
  t.hemi.intensity = 0.78;
  t.sun.color.set("#ffb06a");
  t.sun.intensity = 3.3;
  t.sun.shadow.radius = 2.5;
  t.bloom.strength = 0.16;
  t.bloom.threshold = 1.05;
  MATERIALS.emit.color.setRGB(0.95, 0.92, 0.9);
}

let dusk: THREE.Texture | null = null;
/** An equirectangular dusk: indigo overhead, violet, pink, a gold band at the horizon round the sun. */
function duskSky(sun: THREE.Vector3) {
  if (dusk) return dusk;
  const W = 2048,
    H = 1024;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#141a44");
  g.addColorStop(0.18, "#2a2c66");
  g.addColorStop(0.32, "#5a3f86");
  g.addColorStop(0.41, "#a8558e");
  g.addColorStop(0.46, "#e2748a");
  g.addColorStop(0.49, "#f7a06e");
  g.addColorStop(0.5, "#fbc488");
  g.addColorStop(0.53, "#c98a7a");
  g.addColorStop(1, "#3a2a3e");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // where the sun is: (three's equirect mapping, flipped in y)
  const sx = (Math.atan2(sun.z, sun.x) / (Math.PI * 2) + 0.5) * W;
  const sy = (1 - (Math.asin(sun.y) / Math.PI + 0.5)) * H;
  for (const off of [-W, 0, W]) {
    // the warm half of the sky round the sun, wide and low
    const wide = ctx.createRadialGradient(sx + off, sy, 0, sx + off, sy, 620);
    wide.addColorStop(0, "rgba(255,196,120,0.75)");
    wide.addColorStop(0.35, "rgba(255,160,96,0.35)");
    wide.addColorStop(1, "rgba(255,140,90,0)");
    ctx.fillStyle = wide;
    ctx.fillRect(sx + off - 620, sy - 620, 1240, 1240);
    const core = ctx.createRadialGradient(sx + off, sy, 0, sx + off, sy, 46);
    core.addColorStop(0, "rgba(255,246,220,1)");
    core.addColorStop(0.5, "rgba(255,226,170,0.85)");
    core.addColorStop(1, "rgba(255,200,130,0)");
    ctx.fillStyle = core;
    ctx.fillRect(sx + off - 46, sy - 46, 92, 92);
  }
  // long thin clouds low over the horizon, lit from below
  let seed = 23;
  const r = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let k = 0; k < 70; k++) {
    const elev = 0.03 + Math.pow(r(), 1.8) * 0.32;
    const y = (0.5 - elev / Math.PI) * H;
    const x = r() * W;
    const w = 120 + r() * 420;
    const h = 3 + r() * 7;
    // nearer the sun, brighter and warmer
    const d = Math.min(Math.abs(x - sx), W - Math.abs(x - sx)) / (W / 2);
    const warm = 1 - d;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, h / w);
    const cg = ctx.createRadialGradient(0, 0, 0, 0, 0, w);
    const lit = `rgba(${255},${Math.round(150 + warm * 70)},${Math.round(120 + warm * 40)},${0.22 + warm * 0.3})`;
    cg.addColorStop(0, lit);
    cg.addColorStop(1, "rgba(255,150,130,0)");
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.arc(0, 0, w, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  dusk = tex;
  return tex;
}
