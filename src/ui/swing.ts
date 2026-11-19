import * as THREE from "three";
import "./swing.css";

/** What the swing's controls drive (src/scene/swing). */
export interface SwingInput {
  /** Can a line be thrown now (on foot in the street, nothing open over the view)? */
  allowed(): boolean;
  /** On foot in the street at all (the right button and its menu belong to the swing there). */
  street(): boolean;
  hold(on: boolean): void;
  /** Turn the look (radians), from the thumb that holds the touch button. */
  turn(dyaw: number, dpitch: number): void;
}

/** A finger on glass: radians per pixel (the walker's own touch drag). */
const TOUCH_LOOK = 0.0065;

/**
 * The swing's controls and its reticle. Keyboard: hold R. Mouse: hold the right button; with the
 * cursor free (ZStreet's look is a drag) the line goes where the cursor is, with the pointer locked
 * to the centre. Touch: hold the HOLD · SWING button (the line goes to the centre reticle), drag
 * that thumb to look, the left stick moves. A blur, a hidden tab or a turned phone lets go.
 */
export class SwingControls {
  private aimEl: HTMLElement;
  private btn: HTMLButtonElement;
  private pointer = new THREE.Vector2();
  /** The mouse is over the view, at `pointer` (else the aim is the centre). */
  private mouseIn = false;
  private finger: number | null = null;
  private fingerAt = { x: 0, y: 0 };
  private keyHeld = false;
  private buttonHeld = false;
  private coarse = typeof matchMedia === "function" ? matchMedia("(pointer: coarse)") : null;
  /** The view's box on the page, read again only when the window changes (not every frame). */
  private box: DOMRect | null = null;

  constructor(
    private canvas: HTMLCanvasElement,
    root: HTMLElement,
    private input: SwingInput,
  ) {
    this.aimEl = document.createElement("div");
    this.aimEl.className = "swing-aim";
    this.aimEl.innerHTML = `<svg viewBox="0 0 18 18" aria-hidden="true" shape-rendering="crispEdges"><path d="M0 0h6v2H2v4H0zM12 0h6v6h-2V2h-4zM0 12h2v4h4v2H0zM16 12h2v6h-6v-2h4z"/><rect x="8" y="8" width="2" height="2"/></svg>`;
    this.btn = document.createElement("button");
    this.btn.type = "button";
    this.btn.className = "swing-btn";
    this.btn.setAttribute("aria-label", "Hold to swing, drag to look, let go to fly on");
    this.btn.setAttribute("aria-pressed", "false");
    this.btn.innerHTML = `<b>振</b><span>HOLD · SWING</span>`;
    root.append(this.aimEl, this.btn);

    // the mouse: where the cursor is over the view
    canvas.addEventListener("pointermove", (e) => {
      if (e.pointerType !== "mouse") return;
      this.pointer.set(e.clientX, e.clientY);
      this.mouseIn = true;
    });
    canvas.addEventListener("pointerleave", (e) => {
      if (e.pointerType === "mouse") this.mouseIn = false;
    });
    // the right button (mousedown: it fires even while the left one drags the look)
    canvas.addEventListener("mousedown", (e) => {
      if (e.button !== 2 || !input.allowed()) return;
      this.pointer.set(e.clientX, e.clientY);
      this.mouseIn = true;
      this.buttonHeld = true;
      input.hold(true);
    });
    window.addEventListener("mouseup", (e) => {
      if (e.button !== 2 || !this.buttonHeld) return;
      this.buttonHeld = false;
      if (!this.keyHeld && this.finger === null) input.hold(false);
    });
    canvas.addEventListener("contextmenu", (e) => {
      if (input.street()) e.preventDefault();
    });
    // R, held
    window.addEventListener("keydown", (e) => {
      if (e.code !== "KeyR" || e.repeat || e.metaKey || e.ctrlKey || e.altKey || (e.target as HTMLElement).closest?.("input,textarea,select,[contenteditable]")) return;
      if (!input.allowed()) return;
      e.preventDefault();
      this.keyHeld = true;
      input.hold(true);
    });
    window.addEventListener("keyup", (e) => {
      if (e.code !== "KeyR" || !this.keyHeld) return;
      this.keyHeld = false;
      if (!this.buttonHeld && this.finger === null) input.hold(false);
    });
    // the touch button: held like the key, its thumb dragged to look
    this.btn.addEventListener("pointerdown", (e) => {
      if (this.finger !== null || !input.allowed()) return;
      e.preventDefault();
      e.stopPropagation();
      this.finger = e.pointerId;
      this.fingerAt = { x: e.clientX, y: e.clientY };
      try {
        this.btn.setPointerCapture(e.pointerId);
      } catch {
        // (a synthetic pointer: no capture, the button still works)
      }
      this.btn.classList.add("held");
      this.btn.setAttribute("aria-pressed", "true");
      input.hold(true);
    });
    this.btn.addEventListener("pointermove", (e) => {
      if (e.pointerId !== this.finger) return;
      input.turn(-(e.clientX - this.fingerAt.x) * TOUCH_LOOK, -(e.clientY - this.fingerAt.y) * TOUCH_LOOK);
      this.fingerAt = { x: e.clientX, y: e.clientY };
    });
    const up = (e: PointerEvent) => {
      if (e.pointerId === this.finger) this.releaseButton();
    };
    this.btn.addEventListener("pointerup", up);
    this.btn.addEventListener("pointercancel", up);
    this.btn.addEventListener("lostpointercapture", up);
    this.btn.addEventListener("contextmenu", (e) => e.preventDefault());
    // whatever takes the page away lets go of the line
    window.addEventListener("resize", () => (this.box = null));
    window.addEventListener("blur", () => this.letGo());
    document.addEventListener("visibilitychange", () => document.hidden && this.letGo());
    if (typeof matchMedia === "function") matchMedia("(orientation: portrait)").addEventListener("change", () => this.letGo());
  }

  private releaseButton() {
    const id = this.finger;
    this.finger = null;
    if (id !== null && this.btn.hasPointerCapture?.(id)) this.btn.releasePointerCapture(id);
    this.btn.classList.remove("held");
    this.btn.setAttribute("aria-pressed", "false");
    if (id !== null && !this.keyHeld && !this.buttonHeld) this.input.hold(false);
  }

  /** Every hold let go (the key, the right button, the touch button). */
  letGo() {
    const any = this.keyHeld || this.buttonHeld || this.finger !== null;
    this.keyHeld = this.buttonHeld = false;
    this.releaseButton();
    if (any) this.input.hold(false);
  }

  private rect() {
    return (this.box ??= this.canvas.getBoundingClientRect());
  }

  /** Aim at the centre: a finger, a locked pointer, or a mouse that is not over the view. */
  private get centred() {
    return this.finger !== null || document.pointerLockElement === this.canvas || !!this.coarse?.matches || !this.mouseIn;
  }

  /** Where the line would go, in normalized device coordinates. */
  ndc(out: THREE.Vector2) {
    if (this.centred) return out.set(0, 0);
    const r = this.rect();
    return out.set(((this.pointer.x - r.left) / r.width) * 2 - 1, 1 - ((this.pointer.y - r.top) / r.height) * 2);
  }

  /**
   * Each frame. `on`: the swing can be used now (the reticle shows, the touch button too on a
   * touch screen); `catchable`: a hold under the aim; `holding`: on the line.
   */
  sync(on: boolean, catchable: boolean, holding: boolean) {
    const touch = !!this.coarse?.matches;
    this.btn.classList.toggle("on", on && touch);
    if (!on && (this.finger !== null || this.keyHeld || this.buttonHeld)) this.letGo();
    this.aimEl.classList.toggle("on", on);
    this.aimEl.classList.toggle("catch", on && catchable);
    this.aimEl.classList.toggle("held", on && holding);
    this.btn.classList.toggle("catch", on && catchable);
    if (!on) return;
    const r = this.rect();
    const x = this.centred ? r.left + r.width / 2 : this.pointer.x;
    const y = this.centred ? r.top + r.height / 2 : this.pointer.y;
    this.aimEl.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    this.aimEl.classList.toggle("centre", this.centred);
  }
}
