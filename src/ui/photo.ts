const I = (d: string) => `<svg class="i" viewBox="0 0 24 24">${d}</svg>`;
const CAMERA = I('<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>');

/** Looks for the shot: a CSS filter on the live view, burnt into the picture on capture. */
const FILTERS: [string, string][] = [
  ["Normal", "none"],
  ["Noir", "grayscale(1) contrast(1.25) brightness(1.05)"],
  ["Neon", "saturate(1.7) contrast(1.12) hue-rotate(-8deg)"],
  ["Vintage", "sepia(0.45) contrast(1.05) saturate(0.85) brightness(1.04)"],
  ["Dream", "saturate(1.25) brightness(1.08) blur(0.4px)"],
];

export interface PhotoCallbacks {
  /** Calls back with the WebGL canvas right after the next frame is drawn. */
  grab(fn: (canvas: HTMLCanvasElement) => void): void;
  /** For the caption: the latest block height. */
  height(): number | null;
}

/**
 * Photo mode: the HUD steps aside so the city fills the screen, the camera stays free (drag,
 * rotate, zoom), a filter can be picked, and the shot is saved as a PNG signed "ZStreet" with the
 * block height and the date, or handed to the phone's share sheet.
 */
export class Photo {
  private bar: HTMLElement;
  private filter = 0;
  private on = false;

  constructor(
    private root: HTMLElement,
    private scene: HTMLCanvasElement,
    private cb: PhotoCallbacks,
  ) {
    const btn = document.createElement("button");
    btn.className = "hbtn photo-btn";
    btn.title = "Photo mode";
    btn.setAttribute("aria-label", "Photo mode");
    btn.innerHTML = CAMERA;
    root.querySelector(".corner")?.prepend(btn);
    btn.addEventListener("click", () => this.toggle(true));

    this.bar = document.createElement("div");
    this.bar.className = "photo-bar hud";
    this.bar.innerHTML = `
      <span class="pb-jp">写真</span>
      <div class="pb-filters">${FILTERS.map(([n], i) => `<button data-f="${i}" class="${i ? "" : "on"}">${n}</button>`).join("")}</div>
      <button class="pb-shot" data-a="shot">${CAMERA} Capture</button>
      <button data-a="done">Done</button>`;
    root.append(this.bar);
    this.bar.addEventListener("click", (e) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>("[data-f],[data-a]");
      if (!el) return;
      if (el.dataset.f !== undefined) {
        this.filter = Number(el.dataset.f);
        this.scene.style.filter = FILTERS[this.filter][1] === "none" ? "" : FILTERS[this.filter][1];
        this.bar.querySelectorAll("[data-f]").forEach((b) => b.classList.toggle("on", b === el));
      } else if (el.dataset.a === "shot") this.shoot();
      else if (el.dataset.a === "done") this.toggle(false);
    });
    window.addEventListener("keydown", (e) => {
      if (this.on && e.key === "Escape") this.toggle(false);
    });
  }

  get active() {
    return this.on;
  }

  toggle(on: boolean) {
    this.on = on;
    this.root.classList.toggle("photo", on);
    if (!on) this.scene.style.filter = "";
    else if (FILTERS[this.filter][1] !== "none") this.scene.style.filter = FILTERS[this.filter][1];
  }

  private shoot() {
    this.cb.grab((gl) => {
      const W = gl.width,
        H = gl.height;
      const c = document.createElement("canvas");
      c.width = W;
      c.height = H;
      const g = c.getContext("2d")!;
      const f = FILTERS[this.filter][1];
      if (f !== "none") g.filter = f;
      g.drawImage(gl, 0, 0);
      g.filter = "none";
      // the signature, bottom right
      const s = Math.max(1, W / 1440);
      const h = this.cb.height();
      const pad = 28 * s;
      g.textAlign = "right";
      g.textBaseline = "alphabetic";
      g.shadowColor = "rgba(0,0,0,0.7)";
      g.shadowBlur = 12 * s;
      g.fillStyle = "#f4b728";
      g.font = `400 ${34 * s}px "DotGothic16", monospace`;
      g.fillText("ZSTREET", W - pad, H - pad - 30 * s);
      g.fillStyle = "#ffffff";
      g.font = `600 ${17 * s}px "JetBrains Mono", Menlo, monospace`;
      g.fillText(`${h ? `block #${h.toLocaleString("en-US")} · ` : ""}${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC · zstreet.cash`, W - pad, H - pad);
      c.toBlob(async (blob) => {
        if (!blob) return;
        const name = `zstreet-${h ?? "city"}-${Date.now()}.png`;
        const file = new File([blob], name, { type: "image/png" });
        const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
        try {
          if (nav.canShare?.({ files: [file] }) && matchMedia("(pointer: coarse)").matches) return void (await navigator.share({ files: [file], title: "ZStreet" }));
        } catch {
          return;
        }
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        this.flash();
      }, "image/png");
    });
  }

  private flash() {
    const b = this.bar.querySelector<HTMLElement>(".pb-shot")!;
    b.classList.add("done");
    setTimeout(() => b.classList.remove("done"), 900);
  }
}
