import * as THREE from "three";
import { VOX } from "../scene/voxel/model";
import { toObject } from "../scene/voxel/mesher";
import { MAX_COLORS, SWATCHES, emptyModel, template, toVoxel, type PlotModel } from "./model";

export interface EditorResult {
  name: string;
  model: PlotModel;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * The voxel workshop: build your plot's building, 32 × 32 voxels of ground and 48 high (5.3 ×
 * 5.3 × 8 m), with the city's materials. Left click adds a voxel on the face you point at, right
 * click (or the eraser) removes one, drag turns round it, the wheel zooms. Mirror paints both
 * halves at once. Its own little renderer over the city, which pauses meanwhile.
 */
export class Editor {
  private el: HTMLElement;
  private renderer: THREE.WebGLRenderer | null = null;
  private scene = new THREE.Scene();
  private cam = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
  private mesh: THREE.Group | null = null;
  private ghost: THREE.Mesh;
  private grid: THREE.Group;
  private model: PlotModel = emptyModel();
  private undo: Uint8Array[] = [];
  private swatch = 0;
  private tool: "add" | "erase" | "pick" = "add";
  private mirror = false;
  private yaw = 0.7;
  private pitch = 0.5;
  private dist = 21;
  private drag: { x: number; y: number; moved: boolean; button: number } | null = null;
  private raf = 0;
  private resolve: ((r: EditorResult | null) => void) | null = null;
  private dirty = true;
  private ground: THREE.Mesh;

  constructor(root: HTMLElement) {
    this.el = document.createElement("div");
    this.el.className = "editor";
    root.append(this.el);
    this.scene.background = new THREE.Color("#15131d");
    this.scene.add(new THREE.HemisphereLight("#ffffff", "#40384f", 1.6));
    const sun = new THREE.DirectionalLight("#ffffff", 1.8);
    sun.position.set(6, 12, 8);
    this.scene.add(sun);
    const W = this.model.w * VOX,
      D = this.model.d * VOX;
    // the plot: a slab and a voxel grid
    this.ground = new THREE.Mesh(new THREE.BoxGeometry(W, 0.05, D), new THREE.MeshStandardMaterial({ color: "#2b2838" }));
    this.ground.position.y = -0.025;
    this.scene.add(this.ground);
    this.grid = new THREE.Group();
    const g = new THREE.GridHelper(W, this.model.w, "#f4b728", "#4a4560");
    (g.material as THREE.Material).transparent = true;
    (g.material as THREE.Material).opacity = 0.35;
    g.position.y = 0.002;
    this.grid.add(g);
    // the street side: an arrow on the ground
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1, 3), new THREE.MeshBasicMaterial({ color: "#f4b728" }));
    arrow.rotation.x = Math.PI / 2;
    arrow.position.set(0, 0.05, D / 2 + 0.9);
    this.grid.add(arrow);
    // the height limit
    const lim = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(W, this.model.h * VOX, D)), new THREE.LineBasicMaterial({ color: "#4a4560", transparent: true, opacity: 0.5 }));
    lim.position.y = (this.model.h * VOX) / 2;
    this.grid.add(lim);
    this.scene.add(this.grid);
    this.ghost = new THREE.Mesh(new THREE.BoxGeometry(VOX * 1.02, VOX * 1.02, VOX * 1.02), new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.45, depthTest: false }));
    this.ghost.visible = false;
    this.scene.add(this.ghost);
    // the toolbar and keys (the canvas is bound per session, in bind())
    this.el.addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>("button");
      if (!b) return;
      if (b.dataset.t) this.tool = b.dataset.t as typeof this.tool;
      if (b.dataset.s) {
        this.swatch = Number(b.dataset.s);
        if (this.tool !== "add") this.tool = "add";
      }
      if (b.dataset.tpl) {
        this.push();
        this.model = template(b.dataset.tpl as "shop");
        this.dirty = true;
      }
      const a = b.dataset.a;
      if (a === "mirror") this.mirror = !this.mirror;
      if (a === "undo") this.pop();
      if (a === "clear") {
        this.push();
        this.model = emptyModel();
        this.dirty = true;
      }
      if (a === "cancel") return this.finish(null);
      if (a === "save") {
        const name = (this.el.querySelector(".ed-name") as HTMLInputElement).value.trim() || "My building";
        if (!this.model.cells.some((c) => c)) return;
        return this.finish({ name, model: this.compact() });
      }
      this.renderUi();
    });
    this.el.addEventListener("keydown", (e) => e.stopPropagation());
    this.el.addEventListener("keyup", (e) => e.stopPropagation());
    window.addEventListener("keydown", (e) => {
      if (!this.open) return;
      if ((e.ctrlKey || e.metaKey) && e.key === "z") this.pop();
      if (e.key === "Escape") this.finish(null);
    });
    window.addEventListener("resize", () => this.open && this.resize());
  }

  get open() {
    return this.el.classList.contains("open");
  }

  /** Build (or rebuild) a plot. Resolves with the result on Save, null on Cancel. */
  edit(name: string, model: PlotModel | null): Promise<EditorResult | null> {
    this.model = model ? { ...model, palette: [...model.palette], cells: model.cells.slice() } : emptyModel();
    this.undo = [];
    this.el.innerHTML = `
      <canvas></canvas>
      <div class="ed-top hud"><label>建築 · BUILDERS' ROW</label><input class="ed-name" maxlength="24" placeholder="Name your building" value="${esc(name)}" /><button data-a="cancel">Cancel</button><button data-a="save" class="go">Save &amp; publish</button></div>
      <div class="ed-tools hud">
        <button data-t="add" title="Add (left click)">＋</button>
        <button data-t="erase" title="Erase (right click)">－</button>
        <button data-t="pick" title="Pick a colour">◉</button>
        <button data-a="mirror" title="Mirror left/right">⇋</button>
        <button data-a="undo" title="Undo (Ctrl+Z)">↶</button>
        <button data-a="clear" title="Start over">✕</button>
        <span>start from</span>
        <button data-tpl="shop">Shop</button><button data-tpl="apartment">Flat</button><button data-tpl="tower">Tower</button>
      </div>
      <div class="ed-pal hud">${SWATCHES.map((s, i) => `<button data-s="${i}" title="${s.name}" class="${s.kind}" style="--sw:${s.hex}"></button>`).join("")}</div>
      <div class="ed-help">drag to turn · wheel to zoom · left click add · right click erase · the arrow is the street</div>`;
    const canvas = this.el.querySelector("canvas")!;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(2, devicePixelRatio));
    this.el.classList.add("open");
    this.bind(canvas);
    this.resize();
    this.dirty = true;
    this.renderUi();
    const loop = () => {
      this.raf = requestAnimationFrame(loop);
      this.frame();
    };
    loop();
    return new Promise((r) => (this.resolve = r));
  }

  private finish(r: EditorResult | null) {
    cancelAnimationFrame(this.raf);
    this.el.classList.remove("open");
    if (this.mesh) this.scene.remove(this.mesh);
    this.mesh = null;
    this.renderer?.dispose();
    this.renderer = null;
    this.el.innerHTML = "";
    this.resolve?.(r);
    this.resolve = null;
  }

  private bind(canvas: HTMLCanvasElement) {
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    canvas.addEventListener("pointerdown", (e) => {
      this.drag = { x: e.clientX, y: e.clientY, moved: false, button: e.button };
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener("pointermove", (e) => {
      if (this.drag && (e.buttons & 1 || e.buttons & 2)) {
        const dx = e.clientX - this.drag.x,
          dy = e.clientY - this.drag.y;
        if (Math.hypot(dx, dy) > 4) this.drag.moved = true;
        if (this.drag.moved) {
          this.yaw -= dx * 0.008;
          this.pitch = Math.max(-0.1, Math.min(1.45, this.pitch + dy * 0.006));
          this.drag.x = e.clientX;
          this.drag.y = e.clientY;
        }
      }
      this.hover(e.clientX, e.clientY);
    });
    canvas.addEventListener("pointerup", (e) => {
      const d = this.drag;
      this.drag = null;
      if (!d || d.moved) return;
      const erase = e.button === 2 || this.tool === "erase";
      this.click(e.clientX, e.clientY, erase);
    });
    canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      this.dist = Math.max(5, Math.min(30, this.dist * (1 + Math.sign(e.deltaY) * 0.1)));
    });
  }

  private resize() {
    const w = window.innerWidth,
      h = window.innerHeight;
    this.renderer?.setSize(w, h, false);
    this.cam.aspect = w / h;
    this.cam.updateProjectionMatrix();
  }

  private push() {
    this.undo.push(this.model.cells.slice());
    if (this.undo.length > 40) this.undo.shift();
  }

  private pop() {
    const c = this.undo.pop();
    if (!c) return;
    this.model.cells = c;
    this.dirty = true;
  }

  /** A palette index for the current swatch (adds it to the model's palette). */
  private colour() {
    const s = SWATCHES[this.swatch];
    let i = this.model.palette.findIndex((p) => p.hex === s.hex && p.kind === s.kind);
    if (i < 0) {
      if (this.model.palette.length >= MAX_COLORS) return 1;
      i = this.model.palette.push({ hex: s.hex, kind: s.kind }) - 1;
    }
    return i + 1;
  }

  /** Drop palette entries no cell uses (and renumber). */
  private compact(): PlotModel {
    const used = new Set(this.model.cells);
    const keep = this.model.palette.map((_, i) => used.has(i + 1));
    const remap = new Uint8Array(this.model.palette.length + 1);
    const palette: PlotModel["palette"] = [];
    this.model.palette.forEach((p, i) => {
      if (keep[i]) remap[i + 1] = palette.push(p);
    });
    const cells = this.model.cells.map((c) => remap[c]);
    return { ...this.model, palette, cells };
  }

  private cell(x: number, y: number, z: number) {
    const m = this.model;
    return x >= 0 && y >= 0 && z >= 0 && x < m.w && y < m.h && z < m.d ? x + m.w * (z + m.d * y) : -1;
  }

  /** The cell under the cursor: the one hit, and the empty one in front of the face hit. */
  private target(cx: number, cy: number) {
    const ndc = new THREE.Vector2((cx / window.innerWidth) * 2 - 1, -(cy / window.innerHeight) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.cam);
    const objs: THREE.Object3D[] = [this.ground];
    if (this.mesh) objs.push(this.mesh);
    const hit = ray.intersectObjects(objs, true)[0];
    if (!hit || !hit.face) return null;
    const m = this.model;
    const toCell = (p: THREE.Vector3) => [Math.floor(p.x / VOX + m.w / 2), Math.floor(p.y / VOX), Math.floor(p.z / VOX + m.d / 2)] as const;
    const n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
    const inside = toCell(hit.point.clone().addScaledVector(n, -VOX / 2));
    const front = toCell(hit.point.clone().addScaledVector(n, VOX / 2));
    return { hit: hit.object === this.ground ? null : inside, add: front };
  }

  private hover(cx: number, cy: number) {
    const t = this.target(cx, cy);
    const c = t ? (this.tool === "add" ? t.add : t.hit) : null;
    if (!c || this.cell(c[0], c[1], c[2]) < 0) return void (this.ghost.visible = false);
    const m = this.model;
    this.ghost.visible = true;
    this.ghost.position.set((c[0] - m.w / 2 + 0.5) * VOX, (c[1] + 0.5) * VOX, (c[2] - m.d / 2 + 0.5) * VOX);
    (this.ghost.material as THREE.MeshBasicMaterial).color.set(this.tool === "add" ? SWATCHES[this.swatch].hex : "#ff5a5a");
  }

  private click(cx: number, cy: number, erase: boolean) {
    const t = this.target(cx, cy);
    if (!t) return;
    const m = this.model;
    if (this.tool === "pick" && t.hit) {
      const v = m.cells[this.cell(...t.hit)];
      const p = m.palette[v - 1];
      const i = p ? SWATCHES.findIndex((s) => s.hex === p.hex && s.kind === p.kind) : -1;
      if (i >= 0) this.swatch = i;
      this.tool = "add";
      return this.renderUi();
    }
    const c = erase ? t.hit : t.add;
    if (!c) return;
    const value = erase ? 0 : this.colour();
    const targets = [c];
    if (this.mirror) targets.push([m.w - 1 - c[0], c[1], c[2]]);
    this.push();
    for (const [x, y, z] of targets) {
      const i = this.cell(x, y, z);
      if (i >= 0) m.cells[i] = value;
    }
    this.dirty = true;
  }

  private renderUi() {
    this.el.querySelectorAll<HTMLElement>("[data-t]").forEach((b) => b.classList.toggle("on", b.dataset.t === this.tool));
    this.el.querySelectorAll<HTMLElement>("[data-s]").forEach((b) => b.classList.toggle("on", Number(b.dataset.s) === this.swatch));
    this.el.querySelector('[data-a="mirror"]')?.classList.toggle("on", this.mirror);
  }

  private frame() {
    if (this.dirty) {
      this.dirty = false;
      if (this.mesh) {
        this.scene.remove(this.mesh);
        this.mesh.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
      }
      this.mesh = toObject(toVoxel(this.model), { shadows: false });
      this.scene.add(this.mesh);
    }
    const h = (this.model.h * VOX) / 3;
    this.cam.position.set(Math.sin(this.yaw) * Math.cos(this.pitch) * this.dist, h + Math.sin(this.pitch) * this.dist, Math.cos(this.yaw) * Math.cos(this.pitch) * this.dist);
    this.cam.lookAt(0, h, 0);
    this.renderer?.render(this.scene, this.cam);
  }
}
