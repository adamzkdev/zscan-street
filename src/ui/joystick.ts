import type { WalkControls } from "../interior/walk";

/** Touch screens get the stick; mouse-and-keyboard setups never see it. */
const TOUCH = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;

/** How far the knob travels from the centre (px), and the dead zone near it (a share of that). */
const TRAVEL = 50;
const DEAD = 0.16;
/** Past this the walker runs (the rim, like Shift). */
const RUN = 0.92;

/**
 * On-screen stick for walking on touch screens (on foot in the street and inside places), the same
 * feel as the party's: a thumb anywhere in the lower left brings the stick under
 * it, the knob follows to its rim, a dead zone in the middle; pushed to the rim it runs. Any other
 * finger dragged on the scene looks around. A big jump button sits under the right thumb. Shown
 * only while a walker is active.
 */
export class Joystick {
  /** The zone (the lower left of the screen, clear of the edges' system swipes). */
  private el: HTMLElement;
  private base: HTMLElement;
  private knob: HTMLElement;
  private jump: HTMLButtonElement;
  private walker: WalkControls | null = null;
  private finger: number | null = null;
  private jumpFinger: number | null = null;
  /** Where the thumb landed, in the zone's pixels. */
  private at = { x: 0, y: 0 };

  constructor(parent: HTMLElement) {
    this.el = document.createElement("div");
    this.el.className = "stick";
    this.el.innerHTML = `<div class="stick-pad"><i class="stick-knob"></i></div><span class="stick-hint">歩 MOVE · DRAG TO LOOK</span>`;
    this.base = this.el.querySelector(".stick-pad")!;
    this.knob = this.el.querySelector(".stick-knob")!;
    this.jump = document.createElement("button");
    this.jump.className = "stick-jump";
    this.jump.setAttribute("aria-label", "Jump");
    this.jump.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4l-6 7h4v6h4v-6h4z"/><path d="M6 20h12"/></svg>`;
    parent.append(this.el, this.jump);

    this.el.addEventListener("pointerdown", (e) => {
      if (this.finger !== null) return;
      e.preventDefault();
      e.stopPropagation();
      this.finger = e.pointerId;
      this.el.setPointerCapture(e.pointerId);
      const r = this.el.getBoundingClientRect();
      // the stick comes to the thumb (kept whole inside the zone)
      const R = TRAVEL + 16;
      this.at = {
        x: Math.max(R, Math.min(r.width - R, e.clientX - r.left)),
        y: Math.max(R, Math.min(r.height - R, e.clientY - r.top)),
      };
      this.base.style.left = `${this.at.x}px`;
      this.base.style.top = `${this.at.y}px`;
      this.el.classList.add("held");
      this.move(e);
    });
    this.el.addEventListener("pointermove", (e) => e.pointerId === this.finger && this.move(e));
    const end = (e: PointerEvent) => {
      if (e.pointerId !== this.finger) return;
      this.finger = null;
      this.el.classList.remove("held", "run");
      this.base.style.left = this.base.style.top = "";
      this.set(0, 0, 0, 0);
    };
    this.el.addEventListener("pointerup", end);
    this.el.addEventListener("pointercancel", end);
    this.el.addEventListener("lostpointercapture", end);

    // the jump: held like the space bar
    this.jump.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (this.jumpFinger !== null) return;
      this.jumpFinger = e.pointerId;
      this.jump.setPointerCapture(e.pointerId);
      this.jump.classList.add("on");
      this.walker?.hold(" ", true);
    });
    const letGo = (e: PointerEvent) => {
      if (e.pointerId !== this.jumpFinger) return;
      this.jumpFinger = null;
      this.jump.classList.remove("on");
      this.walker?.hold(" ", false);
    };
    this.jump.addEventListener("pointerup", letGo);
    this.jump.addEventListener("pointercancel", letGo);
    this.jump.addEventListener("lostpointercapture", letGo);
  }

  private move(e: PointerEvent) {
    const r = this.el.getBoundingClientRect();
    const dx = e.clientX - r.left - this.at.x;
    const dy = e.clientY - r.top - this.at.y;
    const d = Math.hypot(dx, dy);
    const k = Math.min(1, d / TRAVEL);
    const nx = d ? dx / d : 0,
      ny = d ? dy / d : 0;
    // a small dead zone so a resting thumb doesn't drift, the rest of the travel rescaled to 0…1
    const m = k < DEAD ? 0 : (k - DEAD) / (1 - DEAD);
    this.set(nx * k * TRAVEL, ny * k * TRAVEL, nx * m, ny * m);
    this.el.classList.toggle("run", m > RUN);
  }

  /** The knob at (kx, ky) px from the centre; the walker gets (x, y) in -1…1. */
  private set(kx: number, ky: number, x: number, y: number) {
    this.knob.style.transform = `translate(${kx}px, ${ky}px)`;
    if (this.walker) {
      this.walker.stick.x = x;
      this.walker.stick.y = -y;
    }
  }

  /** Called every frame with the walker in use (null on the map): shows the stick for it. */
  sync(walker: WalkControls | null) {
    const w = TOUCH && walker?.enabled ? walker : null;
    if (w === this.walker) return;
    if (this.walker) {
      this.walker.stick.x = this.walker.stick.y = 0;
      this.walker.hold(" ", false);
    }
    this.walker = w;
    this.finger = this.jumpFinger = null;
    this.el.classList.remove("held", "run");
    this.jump.classList.remove("on");
    this.base.style.left = this.base.style.top = "";
    this.set(0, 0, 0, 0);
    this.el.classList.toggle("on", !!w);
    this.jump.classList.toggle("on-foot", !!w);
  }
}
