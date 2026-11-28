import { Economy } from "./economy";
import { Home, storeTab, type HomeSite } from "./home";

/**
 * At home (src/gta): furnishing your villa, and its radio. While you are in it (interior/home), a
 * bar at the bottom says what you can do:
 *
 *   B          furnish: pick up the piece in front of you, else choose one from your storage
 *   Q / R      (choosing) the previous / next piece in storage · (carrying) turn it a quarter
 *   F, Enter   (choosing) take it · (carrying) put it down where it shows green
 *   Backspace  (carrying) back into storage
 *   B again    stop (a piece you picked up goes back where it was)
 *   Q . / ,    (not furnishing) the radio: next station / the one before (and off)
 *
 * You carry a piece by walking: it stays in front of you on the floor, on a quarter-metre grid; a
 * print or a sign goes on the nearest wall. The layout is kept by home.ts (this browser).
 */

type Mode = "idle" | "choose" | "carry";

export interface HomeEditHost {
  ui: HTMLElement;
  /** The game is paused (its menu, the map, the store over it). */
  paused(): boolean;
  /** The car radio, played by the hi-fi while you're home. */
  radio: { car(on: boolean): void; turn(d: 1 | -1): void };
  toast(title: string, sub: string): void;
  blip(): void;
}

export class HomeEdit {
  private el: HTMLElement;
  private here = false;
  private mode: Mode = "idle";
  /** Choosing: the stored pieces and which one. */
  private list: string[] = [];
  private at = 0;
  /** Carrying: which, how it's turned (a placed one stays in the layout until it is put down). */
  private id: string | null = null;
  private rot = 0;
  private spot = { x: 0, z: 0, rot: 0, ok: false };
  private ahead: string | null = null;
  private keys: string[] = [];
  private shown = "";

  constructor(private h: HomeEditHost) {
    this.el = document.createElement("div");
    this.el.className = "hm-edit";
    this.el.setAttribute("aria-live", "polite");
    h.ui.append(this.el);
    // (in the capture phase, made before the game's own key guard: it stops B, F, Q, R for the street)
    window.addEventListener(
      "keydown",
      (e) => {
        if (!this.here || this.h.paused() || e.repeat || /input|textarea|select/i.test((e.target as HTMLElement)?.tagName ?? "")) return;
        if (["KeyB", "KeyQ", "KeyR", "KeyF", "Enter", "Backspace", "Delete", "Period", "Comma"].includes(e.code)) this.keys.push(e.code);
      },
      true,
    );
  }

  /** (tests: the very modules the game runs with — a test's own import may get a fresh copy) */
  readonly api = { Home, Economy, storeTab };

  /** At home now? */
  get home() {
    return this.here;
  }
  get carrying() {
    return this.id;
  }

  /**
   * Each frame inside a place (GtaMode.inside): whether it is your home, and where you stand
   * (x, z, facing as the game's player has it: ahead is (−sin, −cos)).
   */
  frame(scene: object | null, x: number, z: number, facing: number) {
    const room = Home.room;
    const home = !!scene && !!room && room.scene === scene;
    if (home !== this.here) {
      this.here = home;
      if (home) {
        Home.ensure();
        this.h.radio.car(true);
      } else {
        this.cancel();
        this.h.radio.car(false);
      }
    }
    if (!home || !room) {
      this.keys.length = 0;
      return this.show("");
    }
    const fx = -Math.sin(facing),
      fz = -Math.cos(facing);
    for (const k of this.keys.splice(0)) this.key(k, x, z, fx, fz);
    if (this.mode === "carry" && this.id) {
      const s = room.size(this.id)!;
      const reach = (Math.abs(Math.sin(this.rot)) > 0.7 ? s.w : s.d) / 2 + 0.85;
      let px = x + fx * reach,
        pz = z + fz * reach,
        rot = this.rot;
      if (s.wall) {
        const w = room.snapWall(x + fx * 1.2, z + fz * 1.2);
        if (w) (px = w.x), (pz = w.z), (rot = w.rot);
      } else {
        px = Math.round(px * 4) / 4;
        pz = Math.round(pz * 4) / 4;
      }
      // (not on you either)
      const ok = room.canPlace(this.id, px, pz, rot) && !this.under(this.id, px, pz, rot, x, z);
      if (px !== this.spot.x || pz !== this.spot.z || rot !== this.spot.rot || ok !== this.spot.ok) {
        this.spot = { x: px, z: pz, rot, ok };
        room.ghost(this.id, px, pz, rot, ok);
      }
    } else this.ahead = this.mode === "idle" ? room.pieceAt(x, z, fx, fz) : null;
    this.render();
  }

  /** You stand on the footprint (a wall piece never). */
  private under(id: string, px: number, pz: number, rot: number, x: number, z: number) {
    const s = Home.room?.size(id);
    if (!s || s.wall || s.walk) return false;
    const side = Math.abs(Math.sin(rot)) > 0.7;
    const hw = (side ? s.d : s.w) / 2 + 0.3,
      hd = (side ? s.w : s.d) / 2 + 0.3;
    return Math.abs(x - px) < hw && Math.abs(z - pz) < hd;
  }

  private key(k: string, x: number, z: number, fx: number, fz: number) {
    const room = Home.room!;
    if (this.mode === "idle") {
      if (k === "KeyB") {
        const near = room.pieceAt(x, z, fx, fz);
        if (near) return this.take(near);
        this.list = Home.stored();
        this.at = 0;
        this.mode = "choose";
      } else if (k === "KeyQ" || k === "Period") this.h.radio.turn(1);
      else if (k === "Comma") this.h.radio.turn(-1);
      return;
    }
    if (this.mode === "choose") {
      this.list = Home.stored();
      if (k === "KeyB") this.mode = "idle";
      else if (k === "KeyQ" && this.list.length) this.at = (this.at + this.list.length - 1) % this.list.length;
      else if (k === "KeyR" && this.list.length) this.at = (this.at + 1) % this.list.length;
      else if ((k === "KeyF" || k === "Enter") && this.list[this.at]) this.take(this.list[this.at]);
      return;
    }
    // carrying
    if (k === "KeyB") this.cancel();
    else if (k === "KeyR") this.rot = norm(this.rot - Math.PI / 2);
    else if (k === "KeyQ") this.rot = norm(this.rot + Math.PI / 2);
    else if (k === "KeyF" || k === "Enter") this.drop();
    else if (k === "Backspace" || k === "Delete") {
      const id = this.id!;
      this.end();
      Home.store(id);
      this.h.blip();
      this.h.toast(Home.piece(id)?.name ?? id, "back in storage · B to furnish");
    }
  }

  /** Pick up a piece: one standing in the villa, or one from storage. */
  take(id: string) {
    if (!Home.owns(id) || !Home.room?.size(id)) return false;
    const q = Home.placed().find((p) => p.id === id);
    this.id = id;
    this.rot = q ? q.rot : 0;
    this.mode = "carry";
    this.spot = { x: NaN, z: NaN, rot: NaN, ok: false };
    return true;
  }

  /** Put it down where the ghost is, if it fits there. */
  drop() {
    const id = this.id;
    if (!id || !this.spot.ok) {
      if (id) this.h.toast("It doesn't fit there", "walk it somewhere clear · Q/R turn it");
      return false;
    }
    const { x, z, rot } = this.spot;
    this.end();
    Home.place(id, x, z, rot);
    this.h.blip();
    return true;
  }

  /** Stop carrying: a piece you picked up stays where it was. */
  cancel() {
    if (this.mode === "idle") return;
    this.end();
  }

  private end() {
    this.id = null;
    this.mode = "idle";
    Home.room?.ghost(null);
  }

  private render() {
    let html = "";
    if (this.mode === "idle") {
      html = this.ahead ? `<span><kbd>B</kbd>Move <b>${esc(Home.piece(this.ahead)?.name ?? this.ahead)}</b></span>` : `<span><kbd>B</kbd>Furnish</span>`;
      html += `<span><kbd>Q</kbd><kbd>,</kbd>Radio</span>`;
    } else if (this.mode === "choose") {
      const l = this.list;
      if (!l.length) html = `<span>Your storage is empty: buy furniture in the <b>Store</b> (Home tab) · look at a piece and press <kbd>B</kbd> to move it</span><span><kbd>B</kbd>Close</span>`;
      else {
        const win = [-1, 0, 1].map((d) => l[(this.at + d + l.length) % l.length]).filter((v, i, a) => l.length > 2 || a.indexOf(v) === i);
        html = `<span>Storage ${this.at + 1}/${l.length}</span><span class="hm-list">${win.map((id) => `<i class="${id === l[this.at] ? "on" : ""}">${esc(Home.piece(id)?.name ?? id)}</i>`).join("")}</span><span><kbd>Q</kbd><kbd>R</kbd>Choose</span><span><kbd>F</kbd>Take</span><span><kbd>B</kbd>Close</span>`;
      }
    } else if (this.id) {
      html = `<b>${esc(Home.piece(this.id)?.name ?? this.id)}</b>${this.spot.ok ? "" : `<span class="hm-bad">doesn't fit here</span>`}<span><kbd>Q</kbd><kbd>R</kbd>Turn</span><span><kbd>F</kbd>Put down</span><span><kbd>⌫</kbd>Storage</span><span><kbd>B</kbd>Cancel</span>`;
    }
    this.show(html);
  }

  private show(html: string) {
    if (html === this.shown) return;
    this.shown = html;
    this.el.innerHTML = html;
    this.el.classList.toggle("on", !!html);
  }
}

const norm = (a: number) => {
  const q = Math.round(a / (Math.PI / 2));
  return (((q % 4) + 4) % 4 === 3 ? -1 : ((q % 4) + 4) % 4) * (Math.PI / 2);
};
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/**
 * Where PLAY puts you at home: on the porch by the villa's front door, facing out (the game then
 * takes you in), and where your car waits in the forecourt.
 */
export function homeStart(site: HomeSite) {
  const { door, out } = site;
  return {
    x: door.x + out.x * 1.8,
    z: door.z + out.z * 1.8,
    heading: Math.atan2(-out.x, -out.z),
    car: { ...site.car },
  };
}
