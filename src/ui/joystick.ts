import type { WalkControls } from "../interior/walk";

/** Touch screens get the stick; mouse-and-keyboard setups never see it. */
const TOUCH = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;

/**
 * On-screen stick for walking on touch screens (on foot in the street and inside places): the
 * thumb on the pad moves, any other finger dragged on the scene looks around. Pushed to the rim
 * it runs. Shown only while a walker is active.
 */
export class Joystick {
  private el: HTMLElement;
  private knob: HTMLElement;
  private walker: WalkControls | null = null;
  private finger: number | null = null;
  private center = { x: 0, y: 0 };
  private radius = 1;

  constructor(parent: HTMLElement) {
    this.el = document.createElement("div");
    this.el.className = "stick";
    this.el.innerHTML = '<div class="stick-pad"><i class="stick-knob"></i></div><span class="stick-hint">歩 MOVE · DRAG TO LOOK</span>';
    this.knob = this.el.querySelector(".stick-knob")!;
    parent.appendChild(this.el);
    const pad = this.el.querySelector<HTMLElement>(".stick-pad")!;
    pad.addEventListener("pointerdown", (e) => {
      if (this.finger !== null) return;
      e.preventDefault();
      e.stopPropagation();
      this.finger = e.pointerId;
      pad.setPointerCapture(e.pointerId);
      const r = pad.getBoundingClientRect();
      this.center = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      this.radius = r.width / 2;
      this.move(e);
      this.el.classList.add("held");
    });
    pad.addEventListener("pointermove", (e) => e.pointerId === this.finger && this.move(e));
    const end = (e: PointerEvent) => {
      if (e.pointerId !== this.finger) return;
      this.finger = null;
      this.set(0, 0);
      this.el.classList.remove("held");
    };
    pad.addEventListener("pointerup", end);
    pad.addEventListener("pointercancel", end);
  }

  private move(e: PointerEvent) {
    let x = (e.clientX - this.center.x) / this.radius,
      y = (e.clientY - this.center.y) / this.radius;
    const m = Math.hypot(x, y);
    if (m > 1) (x /= m), (y /= m);
    // a small dead zone so a resting thumb doesn't drift
    const k = m < 0.12 ? 0 : 1;
    this.set(x * k, y * k);
  }

  private set(x: number, y: number) {
    this.knob.style.transform = `translate(${x * 34}px, ${y * 34}px)`;
    if (this.walker) {
      this.walker.stick.x = x;
      this.walker.stick.y = -y;
    }
  }

  /** Called every frame with the walker in use (null on the map): shows the stick for it. */
  sync(walker: WalkControls | null) {
    const w = TOUCH && walker?.enabled ? walker : null;
    if (w === this.walker) return;
    if (this.walker) this.walker.stick.x = this.walker.stick.y = 0;
    this.walker = w;
    this.finger = null;
    this.set(0, 0);
    this.el.classList.toggle("on", !!w);
  }
}
