import "./gta.css";
import { MAP_FRAME } from "../ui/minimap";
import { KIND_COLOR, KIND_LABEL, type Kind, type Spot } from "./missions";

/**
 * The game's HUD (src/gta), in the open-world style: a round radar bottom-left that turns with the
 * camera, the district and the street under it; the speedometer bottom-right at the wheel (revs,
 * gear, nitrous); "what's next" at the top; the chain's live clock top-left; MAP and MENU top-right;
 * a coach card for the first steps; toasts; the whole map (Tab) with the challenges; the pause menu.
 * Dark glass, Archivo wide for names, JetBrains Mono for labels, Zcash gold for what matters.
 */

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const kbd = (k: string) => `<kbd>${k}</kbd>`;
const fmtDist = (m: number) => (m < 950 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`);

/** An arc on the dial (degrees, 0 = right, clockwise). */
function arc(cx: number, cy: number, r: number, a0: number, a1: number) {
  const p = (a: number) => [cx + r * Math.cos((a * Math.PI) / 180), cy + r * Math.sin((a * Math.PI) / 180)];
  const [x0, y0] = p(a0),
    [x1, y1] = p(a1);
  return `M${x0.toFixed(2)} ${y0.toFixed(2)}A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

const KIND_ICON: Record<Kind, string> = {
  run: '<path d="M4 8l8-4 8 4v8l-8 4-8-4z M4 8l8 4 8-4 M12 12v8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  ride: '<path d="M4 15v-3l2-5h12l2 5v3zM4 12h16M7 15v2M17 15v2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  board: '<path d="M4 5h16v10H4zM8 15v5M16 15v5M7 9h10" fill="none" stroke="currentColor" stroke-width="1.8"/>',
  trap: '<circle cx="12" cy="13" r="7" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 13l4-4M12 4v2" stroke="currentColor" stroke-width="1.8" fill="none"/>',
};
const icon = (k: Kind) => `<svg viewBox="0 0 24 24" aria-hidden="true">${KIND_ICON[k]}</svg>`;

export interface HudState {
  /** Feet / car position, the camera's heading (the radar turns with it), the body's or car's heading. */
  x: number;
  z: number;
  camYaw: number;
  heading: number;
  inCar: boolean;
  speed: number;
  rpm: number;
  gear: number;
  nos: number;
  nosOn: boolean;
  drift: number;
  district: string;
  street: string;
  next: string | null;
  spots: Spot[];
  /** The street's own places for the maps. */
  places: { x: number; z: number; label: string; icon?: string }[];
  /** Other people about (dots). */
  people: { x: number; z: number }[];
  cars: { x: number; z: number }[];
  goal: (Spot & { dist: number }) | null;
  live: { height: number; since: number; mempool: number };
  heat: { stars: number; chasing: boolean; losing: number; pin: number };
  cops: { x: number; z: number }[];
  /** The other players in this city, and how many of you there are (0: offline). */
  players: { x: number; z: number }[];
  online: number;
}

export interface MenuHost {
  resume(): void;
  leave(): void;
  garage(): void;
  teleport(x: number, z: number): void;
  settings: Settings;
  apply(s: Settings): void;
  progress(): { rows: [string, string][]; balance: number };
  quality(): { level: number; pinned: boolean; tiers: number };
  pinQuality(level: number | null): void;
  sound(): boolean;
  toggleSound(): void;
}

export interface Settings {
  /** How many passers-by the game keeps round you. */
  crowd: "few" | "normal" | "busy";
  /** The sky in the game: a day-night cycle of its own, the visitor's clock, or fixed. */
  sky: "cycle" | "clock" | "day" | "night";
  /** On foot: the camera follows behind by itself (W ahead, A/D turn), or the mouse turns it. */
  follow: boolean;
  carView: 0 | 1 | 2;
  footFar: boolean;
  fovAdd: number;
  sens: number;
  vibe: boolean;
  blur: "off" | "subtle" | "strong";
  hud: "full" | "min";
  units: "kmh" | "mph";
  volume: number;
}
export const DEFAULTS: Settings = { crowd: "normal", sky: "cycle", follow: true, carView: 0, footFar: false, fovAdd: 0, sens: 1, vibe: true, blur: "subtle", hud: "full", units: "kmh", volume: 1 };

const TOUCH = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
const COACH = TOUCH
  ? [
      { eye: "Welcome to ZStreet · 1 / 4", title: "Move", text: `The left stick runs (all the way out: sprint) · JUMP · drag anywhere else to look round.` },
      { eye: "Get a ride · 2 / 4", title: "Take a car", text: `By any car, press CAR. At the wheel the stick drives: up the gas, down the brake · DRIFT · NOS.` },
      { eye: "The chain is the clock · 3 / 4", title: "Beat the block", text: `Blocks are real. The gold beam is the MEMPOOL HQ: take a parcel there and deliver it before the next block is mined.` },
      { eye: "Find your way · 4 / 4", title: "The map", text: `MAP: tap a street to go there. Walk up to a lit door and tap ENTER to go in. MENU for the camera, the graphics and your zkSNARK.` },
    ]
  : [
      { eye: "Welcome to ZStreet · 1 / 4", title: "Move", text: `${kbd("W")} or ${kbd("Z")} to run, ${kbd("A")}${kbd("D")} or ${kbd("Q")}${kbd("D")} to turn, ${kbd("S")} back · ${kbd("Shift")} sprint · ${kbd("Space")} jump. The camera follows you (Menu › Camera for a free one).` },
      { eye: "Get a ride · 2 / 4", title: "Take a car", text: `${kbd("X")} punches and smashes things. Walk up to any car and press ${kbd("F")}. ${kbd("Space")} handbrake to drift · ${kbd("Shift")} nitrous · ${kbd("C")} camera · ${kbd("E")} horn · ${kbd("R")} back on the road.` },
      { eye: "The chain is the clock · 3 / 4", title: "Beat the block", text: `Blocks are real. The gold beam is the MEMPOOL HQ: take a parcel there and deliver it before the next block is mined.` },
      { eye: "Find your way · 4 / 4", title: "The map", text: `${kbd("M")} opens the map: click a street to go there. Walk up to a lit door and press ${kbd("E")} to go in. ${kbd("Esc")} for the menu, ${kbd("T")} day or night.` },
    ];

export class GtaHud {
  readonly root: HTMLElement;
  private $ = <T extends HTMLElement = HTMLElement>(s: string) => this.root.querySelector<T>(s)!;
  private radar: HTMLCanvasElement;
  private rg: CanvasRenderingContext2D;
  private bigCv: HTMLCanvasElement;
  private toasts: HTMLElement;
  private cardTimer: (() => string) | null = null;
  private coachStep = -1;
  private liveAcc = 1;
  base: () => HTMLCanvasElement | null = () => null;
  /** The whole map: open, its zoom and centre (world), the kinds shown. */
  mapOpen = false;
  private mapZoom = 1;
  private mapAt = { x: 0, z: -40 };
  private mapDrag: { x: number; y: number; moved: number } | null = null;
  private shown = new Set<Kind>(["run", "ride", "board", "trap"]);
  private last: HudState | null = null;
  paused = false;
  private tab = "camera";
  onMap: (open: boolean) => void = () => {};
  onTouch: (btn: string, down: boolean) => void = () => {};

  constructor(
    ui: HTMLElement,
    private menu: MenuHost,
  ) {
    this.root = document.createElement("div");
    this.root.className = "gta-hud";
    this.root.innerHTML = `
      <div class="gh-live"><i></i><span class="gh-live-t"></span></div>
      <div class="gh-next"><span class="gh-ni"></span><span class="gh-nt"><em class="gh-ne"></em><b class="gh-nl"></b></span><span class="gh-nd"></span></div>
      <div class="gh-top"><button class="gta-chip" data-act="map" title="Map (M)">Map</button><button class="gta-chip" data-act="menu" title="Menu (Esc)">Menu</button></div>
      <div class="gh-heat"><span class="gh-stars"></span><b>Exposed</b><i class="gh-lose"><i></i></i></div>
      <div class="gh-card"><em></em><b></b><p></p><span class="gh-timer"></span></div>
      <div class="gh-coach"><em></em><b></b><p></p><div class="gh-cf"><span class="gh-dots"></span><button class="gta-btn ghost" data-act="skip">Skip</button><button class="gta-btn gold" data-act="nextc">Next ↵</button></div></div>
      <div class="gh-toasts"></div>
      <div class="gh-prompt"></div>
      <div class="gh-drift">Drift</div>
      <div class="gh-mini"><canvas></canvas><b class="gh-n">N</b></div>
      <div class="gh-where"><b class="gh-dist gta-disp"></b><span class="gh-st"></span><span class="gh-nx"></span></div>
      <div class="gh-speed">
        <svg viewBox="0 0 240 240" aria-hidden="true">
          <circle class="face" cx="120" cy="120" r="104"/>
          <g class="ticks"></g>
          <path class="trk" d="${arc(120, 120, 96, 135, 405)}"/>
          <path class="red" d="${arc(120, 120, 96, 351, 405)}"/>
          <path class="rpm" d="${arc(120, 120, 96, 135, 405)}" pathLength="100"/>
          <path class="nosT" d="${arc(120, 120, 82, 150, 240)}"/>
          <path class="nos" d="${arc(120, 120, 82, 150, 240)}" pathLength="100"/>
        </svg>
        <div class="gh-sc"><b class="gh-sv gta-disp">000</b><small class="gh-su">KM/H</small><span class="gh-gear">1</span></div>
      </div>
      <div class="gh-touch">
        <button data-t="drift">Drift</button><button data-t="nos">NOS</button><button data-t="jump">Jump</button><button data-t="car">Car</button><button data-t="door">Enter</button><button data-t="hit">Hit</button>
      </div>
      <div class="gh-map">
        <canvas></canvas>
        <header><h2 class="gta-disp">ZStreet</h2><span class="gh-msub"></span></header>
        <aside class="gh-legend"></aside>
        <div class="gh-mctl"><button data-act="zin" title="Zoom in">+</button><button data-act="zout" title="Zoom out">−</button><button data-act="me" title="On me">◎</button><button data-act="mclose" title="Close (M)">×</button></div>
        <footer>Scroll to zoom · drag to move · click a street to go there · M / Esc to close</footer>
      </div>
      <div class="gh-pause" role="dialog" aria-modal="true" aria-label="Menu"><div class="gh-pcard">
        <nav><h2>Menu<small>Paused</small></h2><div class="gh-tabs"></div><div class="grow"></div><button class="gta-btn white" data-act="resume">Resume</button></nav>
        <section class="gh-pane"></section>
      </div></div>`;
    ui.append(this.root);
    this.radar = this.$<HTMLCanvasElement>(".gh-mini canvas");
    this.rg = this.radar.getContext("2d")!;
    this.bigCv = this.$<HTMLCanvasElement>(".gh-map canvas");
    this.toasts = this.$(".gh-toasts");
    // the dial's ticks
    const ticks = this.$(".gh-speed .ticks");
    let t = "";
    for (let i = 0; i <= 8; i++) {
      const a = ((135 + (i / 8) * 270) * Math.PI) / 180;
      const [c, s] = [Math.cos(a), Math.sin(a)];
      t += `<line x1="${120 + c * 84}" y1="${120 + s * 84}" x2="${120 + c * 90}" y2="${120 + s * 90}"/><text x="${120 + c * 70}" y="${124 + s * 70}">${i}</text>`;
    }
    ticks.innerHTML = t;
    this.root.addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>("[data-act]");
      if (!b) return;
      const a = b.dataset.act!;
      if (a === "map") this.toggleMap();
      else if (a === "menu") this.pause(true);
      else if (a === "resume") this.menu.resume();
      else if (a === "skip") this.coach(-1);
      else if (a === "nextc") this.coach(this.coachStep + 1 < COACH.length ? this.coachStep + 1 : -1);
      else if (a === "zin") this.zoomMap(1.4);
      else if (a === "zout") this.zoomMap(1 / 1.4);
      else if (a === "me" && this.last) (this.mapAt = { x: this.last.x, z: this.last.z }), this.drawMap();
      else if (a === "mclose") this.toggleMap(false);
    });
    // touch buttons: held like keys
    for (const b of this.root.querySelectorAll<HTMLElement>(".gh-touch [data-t]")) {
      const k = b.dataset.t!;
      b.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        b.classList.add("on");
        this.onTouch(k, true);
      });
      const up = () => {
        b.classList.remove("on");
        this.onTouch(k, false);
      };
      b.addEventListener("pointerup", up);
      b.addEventListener("pointercancel", up);
      b.addEventListener("pointerleave", up);
    }
    this.mapEvents();
  }

  /** Inside a place: no street radar, no street objective. */
  inside(on: boolean) {
    this.root.classList.toggle("inside", on);
    this.root.classList.remove("car");
    if (on) this.toggleMap(false);
  }

  /** Inside a place, each frame (the toasts and the prompt carry on; the street's parts are hidden). */
  indoor(_dt: number, _s: { speed: number }) {}

  /** The touch "Enter" button, shown at a door. */
  doorButton(on: boolean) {
    this.root.classList.toggle("gh-at-door", on);
  }

  show(on: boolean) {
    this.root.classList.toggle("on", on);
    if (!on) {
      this.toggleMap(false);
      this.pause(false);
    }
  }

  // ---- every frame ----------------------------------------------------------------------------------

  update(dt: number, s: HudState, settings: Settings) {
    this.last = s;
    this.root.classList.toggle("car", s.inCar);
    this.root.classList.toggle("min", settings.hud === "min");
    // the chain, twice a second
    this.liveAcc += dt;
    if (this.liveAcc > 0.5) {
      this.liveAcc = 0;
      const left = Math.round(75 - s.live.since);
      this.$(".gh-live-t").innerHTML = s.live.height
        ? TOUCH
          ? `<b>${s.live.height.toLocaleString("en-US")}</b> · ${left > 0 ? `~${left}s` : "any second"}`
          : `Block <b>${s.live.height.toLocaleString("en-US")}</b> · ${left > 0 ? `next ~${left}s` : "next any second"} · <b>${s.live.mempool}</b> tx waiting${s.online ? ` · <b>${s.online}</b> in town` : ""}`
        : "Connecting to the chain…";
      this.$(".gh-where .gh-dist").textContent = s.district;
      this.$(".gh-where .gh-st").textContent = s.street;
      this.$(".gh-where .gh-nx").textContent = s.next ? `Next · ${s.next}` : "";
    }
    // what's next
    const g = s.goal;
    const next = this.$(".gh-next");
    next.classList.toggle("on", !!g);
    if (g) {
      next.style.setProperty("--k", KIND_COLOR[g.kind]);
      this.$(".gh-ni").innerHTML = icon(g.kind);
      this.$(".gh-ne").textContent = g.goal ? `Objective · ${KIND_LABEL[g.kind]}` : `What's next · ${KIND_LABEL[g.kind]}`;
      this.$(".gh-nl").textContent = g.label;
      this.$(".gh-nd").textContent = fmtDist(g.dist);
    }
    if (this.cardTimer) this.$(".gh-timer").textContent = this.cardTimer();
    // the dial
    if (s.inCar) {
      const mph = settings.units === "mph";
      const v = Math.round(s.speed * (mph ? 2.237 : 3.6));
      this.$(".gh-sv").textContent = String(Math.min(999, v)).padStart(3, "0");
      this.$(".gh-su").textContent = mph ? "MPH" : "KM/H";
      this.$(".gh-gear").textContent = s.gear < 0 ? "R" : s.speed < 0.3 ? "N" : String(s.gear);
      this.$<SVGPathElement & HTMLElement>(".gh-speed .rpm").style.strokeDasharray = `${(s.rpm * 100).toFixed(1)} 100`;
      this.$<SVGPathElement & HTMLElement>(".gh-speed .nos").style.strokeDasharray = `${(s.nos * 100).toFixed(1)} 100`;
      this.$(".gh-speed").classList.toggle("nos-on", s.nosOn);
      this.$(".gh-speed").classList.toggle("redline", s.rpm > 0.9);
    }
    // the wanted level
    const heat = this.$(".gh-heat");
    heat.classList.toggle("on", s.heat.stars > 0);
    heat.classList.toggle("chase", s.heat.chasing);
    if (s.heat.stars > 0) {
      this.$(".gh-stars").textContent = "★".repeat(s.heat.stars) + "☆".repeat(3 - s.heat.stars);
      this.$(".gh-heat b").textContent = s.heat.pin > 0.05 ? "Pull away!" : s.heat.losing > 0.05 ? "Losing them" : "Exposed";
      this.$<HTMLElement>(".gh-lose i").style.width = `${Math.round((s.heat.pin > 0.05 ? s.heat.pin : s.heat.losing) * 100)}%`;
    }
    const drift = this.$(".gh-drift");
    drift.classList.toggle("on", s.inCar && s.drift > 0.15);
    if (s.drift > 0.15) drift.textContent = `Drift ×${(1 + s.drift * 2).toFixed(1)}`;
    this.drawRadar(s);
    if (this.mapOpen) this.drawMap();
  }

  // ---- the radar ------------------------------------------------------------------------------------

  private fit(cv: HTMLCanvasElement) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(cv.clientWidth * dpr),
      h = Math.round(cv.clientHeight * dpr);
    if (w && h && (cv.width !== w || cv.height !== h)) (cv.width = w), (cv.height = h);
    return dpr;
  }

  private drawRadar(s: HudState) {
    const base = this.base();
    const cv = this.radar,
      g = this.rg;
    const dpr = this.fit(cv);
    const W = cv.width,
      H = cv.height;
    if (!W) return;
    const R = W / 2;
    const range = s.inCar ? 70 + Math.min(60, s.speed * 1.2) : 55;
    const k = R / range;
    const cx = R,
      cy = R;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, W, H);
    g.save();
    g.beginPath();
    g.arc(cx, cy, R - dpr, 0, Math.PI * 2);
    g.clip();
    g.fillStyle = "#0b0d12";
    g.fillRect(0, 0, W, H);
    // the city turns so the camera's way is up
    const rot = s.camYaw;
    g.save();
    g.translate(cx, cy);
    g.rotate(rot);
    g.scale(k, k);
    g.translate(-s.x, -s.z);
    if (base) {
      const span = MAP_FRAME.span,
        res = MAP_FRAME.res;
      const sc = res / span;
      const x0 = MAP_FRAME.cx - span / 2,
        z0 = MAP_FRAME.cz - span / 2;
      const m = range * 1.5;
      g.globalAlpha = 0.92;
      g.drawImage(base, (s.x - m - x0) * sc, (s.z - m - z0) * sc, 2 * m * sc, 2 * m * sc, s.x - m, s.z - m, 2 * m, 2 * m);
      g.globalAlpha = 1;
    }
    // the way to the objective: a line
    if (s.goal?.goal) {
      g.strokeStyle = KIND_COLOR[s.goal.kind];
      g.lineWidth = 3 / k;
      g.setLineDash([6 / k, 5 / k]);
      g.beginPath();
      g.moveTo(s.x, s.z);
      g.lineTo(s.goal.x, s.goal.z);
      g.stroke();
      g.setLineDash([]);
    }
    g.restore();
    const cos = Math.cos(rot),
      sin = Math.sin(rot);
    const to = (x: number, z: number) => {
      const dx = (x - s.x) * k,
        dz = (z - s.z) * k;
      return [dx * cos - dz * sin, dx * sin + dz * cos] as const;
    };
    // people and cars as small dots
    g.fillStyle = "rgba(255,255,255,0.55)";
    for (const p of s.cars) {
      const [rx, ry] = to(p.x, p.z);
      if (rx * rx + ry * ry < R * R) g.fillRect(cx + rx - 1.5 * dpr, cy + ry - 1.5 * dpr, 3 * dpr, 3 * dpr);
    }
    g.fillStyle = "rgba(95,215,255,0.8)";
    for (const p of s.people) {
      const [rx, ry] = to(p.x, p.z);
      if (rx * rx + ry * ry < R * R) {
        g.beginPath();
        g.arc(cx + rx, cy + ry, 1.6 * dpr, 0, Math.PI * 2);
        g.fill();
      }
    }
    // the other players: gold rings
    for (const o of s.players) {
      const [rx, ry] = to(o.x, o.z);
      if (rx * rx + ry * ry > (R - 6 * dpr) ** 2) continue;
      g.beginPath();
      g.arc(cx + rx, cy + ry, 4 * dpr, 0, Math.PI * 2);
      g.fillStyle = "#0b0b11";
      g.fill();
      g.lineWidth = 2 * dpr;
      g.strokeStyle = "#ffd56b";
      g.stroke();
    }
    // the police: red and blue, pinned to the rim
    const blink = Math.floor(performance.now() / 250) % 2 === 0;
    for (const c of s.cops) {
      let [rx, ry] = to(c.x, c.z);
      const d = Math.hypot(rx, ry),
        lim = R - 9 * dpr;
      if (d > lim) (rx *= lim / d), (ry *= lim / d);
      this.dot(g, cx + rx, cy + ry, blink ? "#ff3b3b" : "#3b7bff", dpr * 1.1);
    }
    // the places, the challenges; the objective pinned to the rim
    for (const p of s.places) {
      const [rx, ry] = to(p.x, p.z);
      if (rx * rx + ry * ry > (R - 8 * dpr) ** 2) continue;
      this.badge(g, cx + rx, cy + ry, "#f4b728", p.icon ?? "•", dpr, 6.5);
    }
    for (const p of s.spots) {
      if (!this.shown.has(p.kind) && !p.goal) continue;
      let [rx, ry] = to(p.x, p.z);
      const d = Math.hypot(rx, ry);
      const lim = R - 10 * dpr;
      if (d > lim) {
        if (!p.goal && p.kind !== "run") continue;
        rx *= lim / d;
        ry *= lim / d;
      }
      this.dot(g, cx + rx, cy + ry, KIND_COLOR[p.kind], dpr, p.goal, p.done);
    }
    // you
    this.arrow(g, cx, cy, -(s.heading - s.camYaw), dpr);
    g.restore();
    // the rim and north
    g.beginPath();
    g.arc(cx, cy, R - dpr, 0, Math.PI * 2);
    g.strokeStyle = "rgba(243,244,241,0.85)";
    g.lineWidth = 2 * dpr;
    g.stroke();
    const n = this.$(".gh-n");
    const nr = R / dpr - 2;
    n.style.transform = `translate(${(sin * nr).toFixed(1)}px, ${(-cos * nr).toFixed(1)}px) translate(-50%, -50%)`;
  }

  private badge(g: CanvasRenderingContext2D, x: number, y: number, c: string, ch: string, dpr: number, r: number) {
    g.beginPath();
    g.arc(x, y, r * dpr, 0, Math.PI * 2);
    g.fillStyle = "rgba(10,11,16,0.92)";
    g.fill();
    g.strokeStyle = c;
    g.lineWidth = 1.3 * dpr;
    g.stroke();
    g.fillStyle = c;
    g.font = `${8.5 * dpr}px DotGothic16, monospace`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(ch, x, y + 0.5 * dpr);
  }

  private dot(g: CanvasRenderingContext2D, x: number, y: number, c: string, dpr: number, goal = false, done = false) {
    const r = (goal ? 6 : 4.2) * dpr;
    if (goal) {
      const pulse = (performance.now() / 900) % 1;
      g.beginPath();
      g.arc(x, y, r + pulse * 8 * dpr, 0, Math.PI * 2);
      g.strokeStyle = c;
      g.globalAlpha = 1 - pulse;
      g.lineWidth = 1.5 * dpr;
      g.stroke();
      g.globalAlpha = 1;
    }
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fillStyle = done ? "rgba(120,120,130,0.7)" : c;
    g.fill();
    g.strokeStyle = "#0a0b10";
    g.lineWidth = 1.4 * dpr;
    g.stroke();
  }

  private arrow(g: CanvasRenderingContext2D, x: number, y: number, rot: number, dpr: number) {
    g.save();
    g.translate(x, y);
    g.rotate(rot);
    const s = dpr * 1.15;
    g.beginPath();
    g.moveTo(0, -8 * s);
    g.lineTo(6 * s, 6.5 * s);
    g.lineTo(0, 3.2 * s);
    g.lineTo(-6 * s, 6.5 * s);
    g.closePath();
    g.fillStyle = "#f4b728";
    g.fill();
    g.strokeStyle = "#0b0b11";
    g.lineWidth = 1.5 * dpr;
    g.stroke();
    g.restore();
  }

  // ---- the whole map ---------------------------------------------------------------------------------

  toggleMap(open = !this.mapOpen) {
    if (open === this.mapOpen) return;
    this.mapOpen = open;
    this.$(".gh-map").classList.toggle("on", open);
    if (open && this.last) {
      this.mapAt = { x: this.last.x, z: this.last.z };
      this.legend();
      this.drawMap();
    }
    this.onMap(open);
  }

  private zoomMap(f: number) {
    this.mapZoom = Math.max(0.6, Math.min(8, this.mapZoom * f));
    this.drawMap();
  }

  /** World → map canvas (device pixels) and back. */
  private mapScale() {
    const cv = this.bigCv;
    const D = Math.max(cv.width, cv.height);
    return (D / MAP_FRAME.span) * this.mapZoom;
  }

  private mapEvents() {
    const cv = this.bigCv;
    cv.addEventListener("wheel", (e) => {
      e.preventDefault();
      this.zoomMap(e.deltaY < 0 ? 1.15 : 1 / 1.15);
    });
    cv.addEventListener("pointerdown", (e) => {
      this.mapDrag = { x: e.clientX, y: e.clientY, moved: 0 };
      cv.setPointerCapture(e.pointerId);
    });
    cv.addEventListener("pointermove", (e) => {
      if (!this.mapDrag) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const k = this.mapScale() / dpr;
      const dx = e.clientX - this.mapDrag.x,
        dy = e.clientY - this.mapDrag.y;
      this.mapDrag.moved += Math.abs(dx) + Math.abs(dy);
      this.mapDrag.x = e.clientX;
      this.mapDrag.y = e.clientY;
      this.mapAt.x -= dx / k;
      this.mapAt.z -= dy / k;
      this.drawMap();
    });
    cv.addEventListener("pointerup", (e) => {
      const d = this.mapDrag;
      this.mapDrag = null;
      if (!d || d.moved > 6) return;
      // a click: go there
      const r = cv.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const k = this.mapScale() / dpr;
      const x = this.mapAt.x + (e.clientX - r.left - r.width / 2) / k;
      const z = this.mapAt.z + (e.clientY - r.top - r.height / 2) / k;
      this.menu.teleport(x, z);
      this.toggleMap(false);
    });
  }

  private legend() {
    const s = this.last;
    if (!s) return;
    const count = (k: Kind) => {
      const all = s.spots.filter((p) => p.kind === k && !p.goal);
      return { done: all.filter((p) => p.done).length, of: all.length };
    };
    const kinds: Kind[] = ["run", "ride", "board", "trap"];
    const fixed: Kind[] = ["board", "trap"];
    const total = fixed.reduce((a, k) => a + count(k).of, 0),
      done = fixed.reduce((a, k) => a + count(k).done, 0);
    this.$(".gh-msub").textContent = `Map · ${s.district} · challenges ${done} / ${total}`;
    this.$(".gh-legend").innerHTML =
      `<h3>Challenges <span>${done} / ${total}</span></h3>` +
      kinds
        .map((k) => {
          const c = count(k);
          return `<button class="gh-lg ${this.shown.has(k) ? "on" : ""}" data-k="${k}" style="--k:${KIND_COLOR[k]}"><i>${icon(k)}</i><span>${KIND_LABEL[k]}</span><small>${k === "run" || k === "ride" ? "live" : `${c.done}/${c.of}`}</small></button>`;
        })
        .join("");
    for (const b of this.root.querySelectorAll<HTMLElement>(".gh-lg"))
      b.addEventListener("click", () => {
        const k = b.dataset.k as Kind;
        if (this.shown.has(k)) this.shown.delete(k);
        else this.shown.add(k);
        this.legend();
        this.drawMap();
      });
  }

  private drawMap() {
    const s = this.last;
    const base = this.base();
    if (!s) return;
    const cv = this.bigCv;
    const dpr = this.fit(cv);
    const g = cv.getContext("2d")!;
    const W = cv.width,
      H = cv.height;
    const k = this.mapScale();
    const at = (x: number, z: number) => [W / 2 + (x - this.mapAt.x) * k, H / 2 + (z - this.mapAt.z) * k] as const;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = "#07080b";
    g.fillRect(0, 0, W, H);
    if (base) {
      const span = MAP_FRAME.span;
      const [bx, by] = at(MAP_FRAME.cx - span / 2, MAP_FRAME.cz - span / 2);
      g.imageSmoothingEnabled = true;
      g.globalAlpha = 0.95;
      g.drawImage(base, bx, by, span * k, span * k);
      g.globalAlpha = 1;
    }
    // the street names along the big roads
    g.font = `${10 * dpr}px 'JetBrains Mono', monospace`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    const labels: [number, number, string, string][] = [];
    for (const p of s.places) {
      const [x, y] = at(p.x, p.z);
      if (x < -20 || y < -20 || x > W + 20 || y > H + 20) continue;
      this.badge(g, x, y, "#f4b728", p.icon ?? "•", dpr, 7.5);
      if (this.mapZoom > 1.6) labels.push([x, y + 14 * dpr, p.label, "#f3e6c0"]);
    }
    if (s.goal?.goal) {
      const [x0, y0] = at(s.x, s.z),
        [x1, y1] = at(s.goal.x, s.goal.z);
      g.strokeStyle = KIND_COLOR[s.goal.kind];
      g.lineWidth = 3 * dpr;
      g.setLineDash([8 * dpr, 6 * dpr]);
      g.beginPath();
      g.moveTo(x0, y0);
      g.lineTo(x1, y1);
      g.stroke();
      g.setLineDash([]);
    }
    for (const p of s.spots) {
      if (!this.shown.has(p.kind) && !p.goal) continue;
      const [x, y] = at(p.x, p.z);
      if (x < -20 || y < -20 || x > W + 20 || y > H + 20) continue;
      this.dot(g, x, y, KIND_COLOR[p.kind], dpr * 1.3, p.goal, p.done);
      if (p.goal || this.mapZoom > 1.15) labels.push([x, y - 14 * dpr, p.label, KIND_COLOR[p.kind]]);
    }
    for (const [x, y, l, c] of labels) {
      g.font = `600 ${10.5 * dpr}px 'JetBrains Mono', monospace`;
      g.lineWidth = 3.5 * dpr;
      g.strokeStyle = "rgba(7,8,11,0.92)";
      g.strokeText(l, x, y);
      g.fillStyle = c;
      g.fillText(l, x, y);
    }
    const [px, py] = at(s.x, s.z);
    this.arrow(g, px, py, -s.heading, dpr * 1.4);
  }

  // ---- toasts, cards, prompts, the coach ---------------------------------------------------------------

  toast(title: string, sub = "", tone?: "gold" | "teal" | "bad") {
    const t = document.createElement("div");
    t.className = `gh-toast ${tone ?? ""}`;
    t.innerHTML = `<b class="gta-disp">${esc(title)}</b>${sub ? `<span>${esc(sub)}</span>` : ""}`;
    this.toasts.prepend(t);
    while (this.toasts.children.length > 3) this.toasts.lastElementChild!.remove();
    requestAnimationFrame(() => t.classList.add("in"));
    setTimeout(() => {
      t.classList.remove("in");
      setTimeout(() => t.remove(), 400);
    }, 3400);
  }

  card(c: { eyebrow: string; title: string; text: string; timer?: () => string } | null) {
    const el = this.$(".gh-card");
    el.classList.toggle("on", !!c);
    this.cardTimer = c?.timer ?? null;
    if (!c) return;
    el.querySelector("em")!.textContent = c.eyebrow;
    el.querySelector("b")!.textContent = c.title;
    el.querySelector("p")!.textContent = c.text;
    el.querySelector(".gh-timer")!.textContent = c.timer?.() ?? "";
  }

  prompt(html: string | null) {
    const el = this.$(".gh-prompt");
    if (el.dataset.html === (html ?? "")) return;
    el.dataset.html = html ?? "";
    el.innerHTML = html ?? "";
    el.classList.toggle("on", !!html);
  }

  /** The coach card at step `i` (−1: gone, remembered). */
  coach(i: number) {
    this.coachStep = i;
    const el = this.$(".gh-coach");
    el.classList.toggle("on", i >= 0);
    if (i < 0) {
      try {
        localStorage.setItem("zstreet.gta.coach", "1");
      } catch {}
      return;
    }
    const c = COACH[i];
    el.querySelector("em")!.textContent = c.eye;
    el.querySelector("b")!.textContent = c.title;
    el.querySelector("p")!.innerHTML = c.text;
    el.querySelector(".gh-dots")!.innerHTML = COACH.map((_, j) => `<i class="${j === i ? "on" : ""}"></i>`).join("");
    el.querySelector<HTMLElement>("[data-act=nextc]")!.textContent = i === COACH.length - 1 ? "Let's go ↵" : "Next ↵";
  }

  get coaching() {
    return this.coachStep >= 0;
  }

  static coached() {
    try {
      return localStorage.getItem("zstreet.gta.coach") === "1";
    } catch {
      return false;
    }
  }

  // ---- the menu ------------------------------------------------------------------------------------

  pause(on: boolean) {
    this.paused = on;
    this.$(".gh-pause").classList.toggle("on", on);
    if (on) this.renderMenu();
  }

  private renderMenu() {
    const tabs: [string, string][] = [
      ["camera", "Camera"],
      ["display", "Display"],
      ["graphics", "Graphics"],
      ["sound", "Sound"],
      ["progress", "Progress"],
      ["snark", "zkSNARK"],
      ["controls", "Controls"],
    ];
    this.$(".gh-tabs").innerHTML = tabs.map(([k, l]) => `<button class="gh-tab ${k === this.tab ? "on" : ""}" data-tab="${k}">${l}</button>`).join("") + `<button class="gh-tab gh-quit" data-tab="leave">Leave the game</button>`;
    for (const b of this.root.querySelectorAll<HTMLElement>(".gh-tab"))
      b.addEventListener("click", () => {
        if (b.dataset.tab === "leave") return this.menu.leave();
        this.tab = b.dataset.tab!;
        this.renderMenu();
      });
    const S = this.menu.settings;
    const seg = (key: string, opts: [string, string, string?][], cur: string) =>
      `<div class="gh-seg" data-key="${key}">${opts.map(([v, l, sub]) => `<button data-v="${v}" class="${v === cur ? "on" : ""}">${l}${sub ? `<small>${sub}</small>` : ""}</button>`).join("")}</div>`;
    const slider = (key: string, min: number, max: number, step: number, v: number, unit = "") => `<div class="gh-slide"><input type="range" data-key="${key}" min="${min}" max="${max}" step="${step}" value="${v}"/><b>${v}${unit}</b></div>`;
    let body = "";
    if (this.tab === "camera")
      body = `<h3>Camera</h3>${seg("follow", [["1", "Follows you", "always behind · A/D turn"], ["0", "Free", "the mouse turns it"]], S.follow ? "1" : "0")}
        <h3>At the wheel <span>C</span></h3>${seg("carView", [["0", "Chase"], ["1", "Far chase"], ["2", "Bonnet"]], String(S.carView))}
        <h3>On foot <span>C</span></h3>${seg("footFar", [["0", "Near", "over the shoulder"], ["1", "Far", "more of the street"]], S.footFar ? "1" : "0")}
        <h3>Field of view</h3>${slider("fovAdd", -10, 20, 1, S.fovAdd, "°")}
        <h3>Mouse and stick</h3>${slider("sens", 0.4, 2.2, 0.1, S.sens, "×")}
        <h3>Camera vibration</h3>${seg("vibe", [["1", "On", "the road felt at speed"], ["0", "Off", "a steady camera"]], S.vibe ? "1" : "0")}`;
    else if (this.tab === "display")
      body = `<h3>Motion blur</h3>${seg("blur", [["off", "Off"], ["subtle", "Subtle", "crisp in town"], ["strong", "Strong", "edges streak at speed"]], S.blur)}
        <h3>HUD</h3>${seg("hud", [["full", "Full", "radar, speed, what's next"], ["min", "Minimal", "radar and speed"]], S.hud)}
        <h3>Speed</h3>${seg("units", [["kmh", "km/h"], ["mph", "mph"]], S.units)}
        <h3>Streets</h3>${seg("crowd", [["few", "Quiet"], ["normal", "Lively"], ["busy", "Busy", "the most people about"]], S.crowd)}
        <h3>Day and night <span>T</span></h3>${seg("sky", [["cycle", "Cycle", "a day every 14 min"], ["clock", "My clock", "night 19:00–7:00"], ["day", "Day"], ["night", "Night"]], S.sky)}`;
    else if (this.tab === "graphics") {
      const q = this.menu.quality();
      const names = ["Ultra", "High", "Balanced", "Light", "Battery saver"];
      const opts: [string, string, string?][] = [["auto", "Auto", "what this device runs best"]];
      for (let i = 0; i < q.tiers; i++) opts.push([String(i), names[i] ?? `Level ${i}`]);
      body = `<h3>Graphics quality</h3>${seg("quality", opts, q.pinned ? String(q.level) : "auto")}<p class="gh-note">Auto watches the frame rate and steps down before it stutters (now: ${names[q.level] ?? q.level}).</p>`;
    } else if (this.tab === "sound")
      body = `<h3>Sound</h3>${seg("sound", [["1", "On"], ["0", "Off"]], this.menu.sound() ? "1" : "0")}<h3>Engine and effects</h3>${slider("volume", 0, 1.5, 0.1, S.volume, "×")}`;
    else if (this.tab === "progress") {
      const p = this.menu.progress();
      body = `<h3>Your record</h3><dl class="gh-stats">${p.rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd class="gta-disp">${esc(v)}</dd></div>`).join("")}</dl><p class="gh-note">Play money (ⓩ) stays in this browser: ${p.balance.toLocaleString("en-US")} ⓩ.</p>`;
    } else if (this.tab === "snark") body = `<h3>Who you play</h3><p class="gh-note">Any of the 10,000 zkSNARKs: your own, a rare one, any number.</p><button class="gta-btn gold" data-do="garage">Open the garage</button>`;
    else
      body = `<h3>Keyboard</h3><dl class="gh-keys">
        <div><dt>${kbd("W")}${kbd("A")}${kbd("S")}${kbd("D")} / ${kbd("Z")}${kbd("Q")}${kbd("S")}${kbd("D")}</dt><dd>move · throttle, brake, steer</dd></div>
        <div><dt>${kbd("Shift")}</dt><dd>sprint · nitrous</dd></div>
        <div><dt>${kbd("Space")}</dt><dd>jump · handbrake (drift)</dd></div>
        <div><dt>${kbd("F")}</dt><dd>get in / out of a car</dd></div>
        <div><dt>${kbd("X")}</dt><dd>punch · smash things, inside and out</dd></div>
        <div><dt>${kbd("E")}</dt><dd>enter a door · talk · horn</dd></div>
        <div><dt>${kbd("C")} ${kbd("B")}</dt><dd>camera · look back</dd></div>
        <div><dt>${kbd("R")}</dt><dd>back on the road</dd></div>
        <div><dt>${kbd("M")} ${kbd("Esc")} ${kbd("T")}</dt><dd>map · menu · day / night</dd></div>
      </dl><h3>Gamepad</h3><p class="gh-note">RT / LT gas and brake, left stick steer, right stick camera, A jump / handbrake, X nitrous, Y car, B sprint, Start menu.</p><button class="gta-btn" data-do="coach">Show the first steps again</button>`;
    const pane = this.$(".gh-pane");
    pane.innerHTML = `<header><h2>${tabs.find(([k]) => k === this.tab)?.[1] ?? ""}</h2><button class="gh-px" data-act="resume" aria-label="Close">×</button></header>${body}`;
    for (const sg of pane.querySelectorAll<HTMLElement>(".gh-seg"))
      for (const b of sg.querySelectorAll<HTMLElement>("button"))
        b.addEventListener("click", () => {
          const key = sg.dataset.key!,
            v = b.dataset.v!;
          if (key === "quality") this.menu.pinQuality(v === "auto" ? null : Number(v));
          else if (key === "sound") {
            if ((v === "1") !== this.menu.sound()) this.menu.toggleSound();
          } else {
            const s = { ...S } as Record<string, unknown>;
            s[key] = key === "carView" ? Number(v) : key === "footFar" || key === "vibe" || key === "follow" ? v === "1" : v;
            this.menu.apply(s as unknown as Settings);
          }
          this.renderMenu();
        });
    for (const r of pane.querySelectorAll<HTMLInputElement>("input[type=range]"))
      r.addEventListener("input", () => {
        const s = { ...S } as Record<string, unknown>;
        s[r.dataset.key!] = Number(r.value);
        this.menu.apply(s as unknown as Settings);
        r.nextElementSibling!.textContent = `${r.value}${r.dataset.key === "fovAdd" ? "°" : "×"}`;
      });
    pane.querySelector("[data-do=garage]")?.addEventListener("click", () => this.menu.garage());
    pane.querySelector("[data-do=coach]")?.addEventListener("click", () => {
      this.menu.resume();
      this.coach(0);
    });
  }
}
