/**
 * The HTML layer over the 3D (scores, timer, banners, labels). Sizes are in `--u` units:
 * 1 u = 1 % of a 16:9 frame's width, so the HUD looks the same on a phone-sized window and a 4K TV.
 *
 *   const hud = new Hud();                         // a fresh layer (removed by hud.dispose())
 *   hud.players(players, (p) => `${score[p.seat]}`);  // the four corner cards
 *   hud.setScore(seat, "12");  hud.timer(30);  hud.banner("GO !");
 *   const el = hud.add(`<div class="my-thing">…</div>`);   // anything custom
 */
import * as THREE from "three";
import { portrait } from "./chars3d";
import { toScreen } from "./gfx";
import { esc } from "./util";
import type { MiniPlayer } from "../minigames/types";

export class Hud {
  readonly root: HTMLDivElement;
  private cards = new Map<number, HTMLElement>();
  private timerEl: HTMLElement | null = null;
  private labels: { el: HTMLElement; obj: THREE.Object3D; dy: number }[] = [];

  constructor(parent: HTMLElement = document.getElementById("hud") ?? document.body) {
    this.root = document.createElement("div");
    this.root.className = "hud-layer";
    parent.appendChild(this.root);
  }

  /** Any HTML, positioned by its own CSS (the layer is a full-screen box). */
  add(html: string, cls = ""): HTMLElement {
    const d = document.createElement("div");
    if (cls) d.className = cls;
    d.innerHTML = html;
    this.root.appendChild(d);
    return d;
  }

  /**
   * The players' cards in the four corners (seat 0 top-left, 1 top-right, 2 bottom-left,
   * 3 bottom-right), each with portrait, name and a value. `teams`: colours the card's edge by team.
   */
  players(players: MiniPlayer[], value: (p: MiniPlayer) => string = () => "", o: { teams?: boolean; corner?: "top" | "all" } = {}) {
    const box = this.add("", `hud-corners ${o.corner === "top" ? "only-top" : ""}`);
    players.forEach((p, i) => {
      const c = document.createElement("div");
      const pos = o.corner === "top" ? ["tl", "tr", "tl2", "tr2"][i] : players.length === 2 ? ["tl", "tr"][i] : ["tl", "tr", "bl", "br"][i];
      c.className = `hud-card ${pos} ${p.cpu ? "cpu" : ""}`;
      const teamCol = o.teams ? (p.team === 0 ? "#ff5a4e" : "#3d8bff") : p.char.color;
      c.style.setProperty("--pc", p.char.color);
      c.style.setProperty("--tc", teamCol);
      c.innerHTML = `<div class="pic" style="background-image:url(${portrait(p.char.id)})"></div><div class="txt"><div class="nm">${esc(p.name)}</div><div class="val">${value(p)}</div></div>`;
      box.appendChild(c);
      this.cards.set(p.seat, c);
    });
    return box;
  }
  /** Update one card's value (HTML allowed); `bump: false` for values that change all the time. */
  setScore(seat: number, html: string | number, bump = true) {
    const v = this.cards.get(seat)?.querySelector(".val") as HTMLElement | null;
    // (compare with what we wrote, not innerHTML: the browser normalises markup)
    if (v && v.dataset.raw !== String(html)) {
      v.dataset.raw = String(html);
      v.innerHTML = String(html);
      if (!bump) return;
      v.classList.remove("bump");
      void (v as HTMLElement).offsetWidth;
      v.classList.add("bump");
    }
  }
  /** Mark a card (out, winner, …): adds/removes a CSS class. */
  mark(seat: number, cls: "out" | "win" | "hot" | "", on = true) {
    const c = this.cards.get(seat);
    if (!c || !cls) return;
    c.classList.toggle(cls, on);
  }

  /** The big clock at the top centre (seconds, rounded up); hidden with null. */
  timer(sec: number | null) {
    if (sec === null) {
      this.timerEl?.remove();
      this.timerEl = null;
      return;
    }
    if (!this.timerEl) this.timerEl = this.add("", "hud-timer");
    const s = Math.max(0, Math.ceil(sec));
    const t = String(s);
    if (this.timerEl.textContent !== t) {
      this.timerEl.textContent = t;
      this.timerEl.classList.toggle("low", s <= 5);
      if (s <= 5) {
        this.timerEl.classList.remove("tick");
        void this.timerEl.offsetWidth;
        this.timerEl.classList.add("tick");
      }
    }
  }

  /** A big text popping in the middle, gone after `ms`. */
  banner(text: string, o: { color?: string; ms?: number; size?: number; sub?: string } = {}) {
    // (a new banner replaces the one still showing, instead of piling on it)
    for (const old of this.root.querySelectorAll(".hud-banner:not(.out)")) {
      old.classList.add("out");
      setTimeout(() => old.remove(), 350);
    }
    const el = this.add(`<div class="t" style="color:${o.color ?? "#fff"};font-size:calc(var(--u)*${o.size ?? 9})">${esc(text)}</div>${o.sub ? `<div class="s">${esc(o.sub)}</div>` : ""}`, "hud-banner");
    setTimeout(() => el.classList.add("out"), o.ms ?? 1200);
    setTimeout(() => el.remove(), (o.ms ?? 1200) + 400);
    return el;
  }

  /** A small line of text at the bottom centre (instructions, phase). null hides it. */
  private tipEl: HTMLElement | null = null;
  tip(html: string | null) {
    if (html === null) {
      this.tipEl?.remove();
      this.tipEl = null;
      return;
    }
    if (!this.tipEl) this.tipEl = this.add("", "hud-tip");
    if (this.tipEl.innerHTML !== html) this.tipEl.innerHTML = html;
  }

  /** A label that follows a 3D object (BaseMini updates it). Hide one with `el.classList.add("hidden")`. */
  label(obj: THREE.Object3D, html: string, o: { dy?: number; cls?: string; color?: string } = {}) {
    const el = this.add(html, `hud-label ${o.cls ?? ""}`);
    if (o.color) el.style.setProperty("--lc", o.color);
    this.labels.push({ el, obj, dy: o.dy ?? 2 });
    return el;
  }
  removeLabel(el: HTMLElement) {
    this.labels = this.labels.filter((l) => l.el !== el);
    el.remove();
  }
  /** A number popping up from a 3D point and floating away (+1, -3…). */
  pop(at: THREE.Vector3, text: string, color = "#ffe14a", cam?: THREE.Camera) {
    if (!cam) return;
    const s = toScreen(at, cam);
    if (s.behind) return;
    const el = this.add(esc(text), "hud-pop");
    el.style.left = `${s.x}px`;
    el.style.top = `${s.y}px`;
    el.style.color = color;
    setTimeout(() => el.remove(), 900);
  }

  /** Keeps the labels on their objects. */
  update(cam: THREE.Camera) {
    const v = new THREE.Vector3();
    for (const l of this.labels) {
      l.obj.getWorldPosition(v);
      v.y += l.dy;
      const s = toScreen(v, cam);
      l.el.style.display = s.behind || !l.obj.visible ? "none" : "";
      l.el.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%, -100%)`;
    }
  }

  dispose() {
    this.root.remove();
    this.cards.clear();
    this.labels = [];
  }
}

/** Inline icons for HUD text: `${COIN} 12`, `${STAR} 2`. */
export const COIN = '<i class="ic-coin"></i>';
export const STAR = '<i class="ic-star"></i>';
