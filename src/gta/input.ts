/**
 * The game's controls (src/gta): the keyboard by physical key (`e.code`, so ZQSD on a French
 * keyboard is the same keys as WASD), a gamepad (standard mapping), the touch stick the street
 * already has, and the mouse for the camera (pointer lock on a desktop, a drag elsewhere).
 *
 * Read once a frame with `poll()`; `hit(code)` is a key pressed since the last poll.
 */
export interface Stick {
  x: number;
  y: number;
}

export class GtaInput {
  /** Keys held (e.code). */
  private held = new Set<string>();
  /** Keys pressed since the last poll. */
  private fresh = new Set<string>();
  private hits = new Set<string>();
  /** Camera turn since the last poll (pixels). */
  look = { x: 0, y: 0 };
  private lookAcc = { x: 0, y: 0 };
  /** The wheel since the last poll. */
  wheel = 0;
  private wheelAcc = 0;
  /** Seconds since the camera was last turned by hand. */
  idleLook = 99;
  /** The touch stick (the street's joystick writes it). */
  stick: Stick = { x: 0, y: 0 };
  /** On-screen buttons held (touch): "gas", "brake", "drift", "nos", "jump", "car". */
  touch = new Set<string>();
  active = false;
  private drag: { id: number; x: number; y: number } | null = null;
  pad = { lx: 0, ly: 0, rx: 0, ry: 0, rt: 0, lt: 0, a: false, b: false, x: false, y: false, lb: false, rb: false, start: false, back: false, down: false, connected: false };
  private padWas: Record<string, boolean> = {};

  constructor(private canvas: HTMLCanvasElement) {
    window.addEventListener(
      "keydown",
      (e) => {
        if (!this.active || /input|textarea|select/i.test((e.target as HTMLElement)?.tagName ?? "")) return;
        if (!this.held.has(e.code)) this.fresh.add(e.code);
        this.held.add(e.code);
      },
      true,
    );
    window.addEventListener("keyup", (e) => this.held.delete(e.code), true);
    window.addEventListener("blur", () => this.held.clear());
    window.addEventListener("mousemove", (e) => {
      if (!this.active || document.pointerLockElement !== this.canvas) return;
      this.lookAcc.x += e.movementX;
      this.lookAcc.y += e.movementY;
    });
    canvas.addEventListener("pointerdown", (e) => {
      if (!this.active || document.pointerLockElement === this.canvas) return;
      if (this.drag) return;
      this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
    });
    window.addEventListener("pointermove", (e) => {
      if (!this.active || !this.drag || e.pointerId !== this.drag.id) return;
      const k = e.pointerType === "touch" ? 1.6 : 1;
      this.lookAcc.x += (e.clientX - this.drag.x) * k;
      this.lookAcc.y += (e.clientY - this.drag.y) * k;
      this.drag.x = e.clientX;
      this.drag.y = e.clientY;
    });
    const up = (e: PointerEvent) => {
      if (this.drag?.id === e.pointerId) this.drag = null;
    };
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    canvas.addEventListener(
      "wheel",
      (e) => {
        if (!this.active) return;
        this.wheelAcc += Math.sign(e.deltaY);
      },
      { passive: true },
    );
  }

  down(...codes: string[]) {
    return codes.some((c) => this.held.has(c));
  }

  /** Pressed this frame (keyboard codes, or "pad:a" … for the gamepad's buttons). */
  hit(...codes: string[]) {
    return codes.some((c) => this.hits.has(c));
  }

  /** Forget everything held (a menu opened over the game). */
  release() {
    this.held.clear();
    this.fresh.clear();
    this.hits.clear();
    this.touch.clear();
    this.drag = null;
  }

  poll(dt: number) {
    this.hits = this.fresh;
    this.fresh = new Set();
    this.look.x = this.lookAcc.x;
    this.look.y = this.lookAcc.y;
    this.lookAcc.x = this.lookAcc.y = 0;
    this.wheel = this.wheelAcc;
    this.wheelAcc = 0;
    this.readPad();
    // the right stick turns the camera too
    if (Math.abs(this.pad.rx) > 0.15 || Math.abs(this.pad.ry) > 0.15) {
      this.look.x += this.pad.rx * 900 * dt;
      this.look.y += this.pad.ry * 600 * dt;
    }
    if (Math.abs(this.look.x) + Math.abs(this.look.y) > 0.5) this.idleLook = 0;
    else this.idleLook += dt;
  }

  private readPad() {
    const p = this.pad;
    const gp = (navigator.getGamepads?.() ?? []).find((g) => g && g.connected && g.mapping === "standard") ?? null;
    p.connected = !!gp;
    if (!gp) return;
    const dz = (v: number) => (Math.abs(v) < 0.12 ? 0 : (v - Math.sign(v) * 0.12) / 0.88);
    p.lx = dz(gp.axes[0] ?? 0);
    p.ly = dz(gp.axes[1] ?? 0);
    p.rx = dz(gp.axes[2] ?? 0);
    p.ry = dz(gp.axes[3] ?? 0);
    const b = (i: number) => !!gp.buttons[i]?.pressed;
    p.rt = gp.buttons[7]?.value ?? 0;
    p.lt = gp.buttons[6]?.value ?? 0;
    const map: [keyof typeof p, number][] = [
      ["a", 0],
      ["b", 1],
      ["x", 2],
      ["y", 3],
      ["lb", 4],
      ["rb", 5],
      ["back", 8],
      ["start", 9],
      ["down", 13],
    ];
    for (const [k, i] of map) {
      const on = b(i);
      if (on && !this.padWas[k]) this.hits.add(`pad:${k}`);
      this.padWas[k] = on;
      (p as Record<string, unknown>)[k] = on;
    }
  }

  /** On foot: right and forward in [-1, 1], camera-relative. */
  move() {
    const k = (a: string[], b: string[]) => (this.down(...a) ? 1 : 0) - (this.down(...b) ? 1 : 0);
    let x = k(["KeyD", "ArrowRight"], ["KeyA", "ArrowLeft"]) + this.stick.x + this.pad.lx;
    let y = k(["KeyW", "ArrowUp"], ["KeyS", "ArrowDown"]) + this.stick.y - this.pad.ly;
    const l = Math.hypot(x, y);
    if (l > 1) (x /= l), (y /= l);
    return { x, y, mag: Math.min(1, l) };
  }

  /** At the wheel: throttle and brake in [0, 1], steering in [-1, 1] (right is +). */
  drive() {
    const kb = (c: string[]) => (this.down(...c) ? 1 : 0);
    // the touch stick: up is the gas, down the brake, sideways steers
    const sy = this.stick.y,
      sx = this.stick.x;
    const throttle = Math.min(1, Math.max(kb(["KeyW", "ArrowUp"]), this.pad.rt, sy > 0.15 ? sy : 0, this.touch.has("gas") ? 1 : 0));
    const brake = Math.min(1, Math.max(kb(["KeyS", "ArrowDown"]), this.pad.lt, sy < -0.15 ? -sy : 0, this.touch.has("brake") ? 1 : 0));
    let steer = kb(["KeyD", "ArrowRight"]) - kb(["KeyA", "ArrowLeft"]) + this.pad.lx + sx;
    steer = Math.max(-1, Math.min(1, steer));
    const handbrake = this.down("Space") || this.pad.a || this.touch.has("drift");
    const nitro = this.down("ShiftLeft", "ShiftRight", "KeyN") || this.pad.x || this.touch.has("nos");
    return { throttle, brake, steer, handbrake, nitro, analog: Math.abs(this.pad.lx) > 0 || Math.abs(sx) > 0 };
  }

  get sprint() {
    return this.down("ShiftLeft", "ShiftRight") || this.pad.b || Math.hypot(this.stick.x, this.stick.y) > 0.92;
  }

  get jump() {
    return this.hit("Space", "pad:a", "touch:jump");
  }

  /** An on-screen button tapped: a press like a key's ("touch:car", "touch:jump"). */
  tap(code: string) {
    this.fresh.add(code);
  }
}
