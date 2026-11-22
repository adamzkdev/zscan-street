import * as THREE from "three";

/**
 * The dive into a proof: from the map, the camera falls onto the zkSNARK carrying a shielded
 * transaction, through its parcel, and into the proof it carries, drawn as a place:
 *
 *   Orchard (Halo 2, no trusted setup): a nave of the circuit's cells, 2,048 rows (2^11, every 32nd
 *   shown) by its 10 advice columns, lit row after row (the witness); each column drawn into one
 *   point (its commitment); the inner product argument as a sheet of 2,048 cubes folded in half
 *   eleven times, down to one; and the proof, its real size: 2,720 + 2,272 bytes per action.
 *
 *   Sapling (Groth16): the nave lit, everything drawn into three points, A, B and C; 192 bytes a
 *   proof, one per spend and per output.
 *
 * Then back out to the street. A picture of the structure, with the transaction's own numbers, not
 * the proof itself being computed. Escape or a click leaves early.
 */

export interface DiveTx {
  txid: string;
  pool: "orchard" | "sapling";
  /** Orchard actions; Sapling spends and outputs. */
  actions: number;
  spends: number;
  outputs: number;
}

type Phase = "off" | "in" | "proof" | "out";

const FONT = '"DotGothic16", "JetBrains Mono", monospace';
const ROWS = 64; // shown: every 32nd of 2,048
const ADVICE = 10;
const FIXED = 3; // a few fixed and selector columns either side, darker
const COLS = ADVICE + FIXED * 2;
const ARCH = 9;
const STEP = 2.2;
const NAVE = ROWS * STEP;
const SHEET = { w: 64, h: 32, cell: 0.36 };

const GOLD = new THREE.Color("#f4b728");
const TEAL = new THREE.Color("#2fd0b0");
const VIOLET = new THREE.Color("#c17bff");
const DARK = new THREE.Color("#17131f");

const ease = (k: number) => 0.5 - Math.cos(Math.PI * THREE.MathUtils.clamp(k, 0, 1)) / 2;
const clamp01 = (k: number) => THREE.MathUtils.clamp(k, 0, 1);
const fmt = (n: number) => n.toLocaleString("en-US");

/** A line of LED text, as a sprite (the city's pixel font). */
function sign(text: string, h: number, color = "#f4b728") {
  const c = document.createElement("canvas");
  const g = c.getContext("2d")!;
  g.font = `400 96px ${FONT}`;
  c.width = Math.ceil(g.measureText(text).width) + 40;
  c.height = 128;
  g.font = `400 96px ${FONT}`;
  g.fillStyle = color;
  g.textBaseline = "middle";
  g.fillText(text, 20, 68);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }));
  s.scale.set((h * c.width) / c.height, h, 1);
  return s;
}

export interface DiveHooks {
  /** A note per fold, a boom for the proof. */
  ring(n: number): void;
  boom(): void;
  /** The dive starts or ends: the rest of the HUD hides, the map's controls go. */
  diving(on: boolean): void;
}

export class ProofDive {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(60, 1, 0.1, 4000);
  readonly focus = new THREE.Vector3();
  private phase: Phase = "off";
  private t = 0;
  private tx: DiveTx | null = null;
  private at = new THREE.Vector3();
  private from = new THREE.Vector3();
  private root = new THREE.Group();
  private cells: THREE.InstancedMesh;
  private cellBase: THREE.Color[] = [];
  private cellPos: THREE.Vector3[] = [];
  private value = new Float32Array(ROWS * COLS);
  private orbs: THREE.Mesh[] = [];
  private sheet: THREE.InstancedMesh;
  private sheetGroup = new THREE.Group();
  private gem: THREE.Group;
  private labels = new THREE.Group();
  private caption: HTMLElement;
  private flash: HTMLElement;
  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3();
  private c = new THREE.Color();
  private stage = -1;
  private folds = 0;
  private end = 17.5;

  constructor(
    ui: HTMLElement,
    private hooks: DiveHooks,
  ) {
    this.scene.background = new THREE.Color("#07060c");
    this.scene.fog = new THREE.FogExp2("#07060c", 0.012);
    this.scene.add(this.root);
    // the nave: the circuit's cells round an arch, row after row
    const box = new THREE.BoxGeometry(1.5, 1.5, 1.7);
    this.cells = new THREE.InstancedMesh(box, new THREE.MeshBasicMaterial({ toneMapped: false }), ROWS * COLS);
    this.cells.frustumCulled = false;
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++) {
        const a = THREE.MathUtils.lerp(-1.75, 1.75, c / (COLS - 1));
        const p = new THREE.Vector3(Math.sin(a) * ARCH, 1.2 + Math.cos(a) * ARCH * 0.85, -r * STEP);
        this.cellPos.push(p);
        const kind = c < FIXED || c >= COLS - FIXED ? (c === 0 || c === COLS - 1 ? VIOLET : TEAL) : GOLD;
        this.cellBase.push(kind);
        this.m4.compose(p, this.q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), -a), this.s.set(1, 1, 1));
        this.cells.setMatrixAt(r * COLS + c, this.m4);
        this.cells.setColorAt(r * COLS + c, DARK);
      }
    this.root.add(this.cells);
    // the floor's grid under the nave
    const grid = new THREE.GridHelper(400, 160, "#2a2238", "#1a1526");
    grid.position.set(0, -7, -NAVE / 2);
    this.root.add(grid);
    // the commitments: one point per advice column
    for (let i = 0; i < ADVICE; i++) {
      const o = new THREE.Mesh(new THREE.IcosahedronGeometry(0.9, 1), new THREE.MeshBasicMaterial({ color: GOLD.clone().multiplyScalar(1.8), toneMapped: false }));
      o.visible = false;
      this.root.add(o);
      this.orbs.push(o);
    }
    // the argument's sheet: 2,048 cubes, folded in half eleven times
    this.sheet = new THREE.InstancedMesh(new THREE.BoxGeometry(SHEET.cell * 0.82, SHEET.cell * 0.82, SHEET.cell * 0.3), new THREE.MeshBasicMaterial({ toneMapped: false }), SHEET.w * SHEET.h);
    this.sheet.frustumCulled = false;
    this.sheetGroup.add(this.sheet);
    this.sheetGroup.visible = false;
    this.root.add(this.sheetGroup);
    // the proof
    this.gem = new THREE.Group();
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(2.2, 0), new THREE.MeshBasicMaterial({ color: GOLD.clone().multiplyScalar(2.2), toneMapped: false }));
    const shell = new THREE.Mesh(new THREE.OctahedronGeometry(3.1, 0), new THREE.MeshBasicMaterial({ color: "#fff1c4", wireframe: true, transparent: true, opacity: 0.5, toneMapped: false }));
    this.gem.add(core, shell);
    this.gem.visible = false;
    this.root.add(this.gem);
    this.root.add(this.labels);
    // the caption (the city's pixel panel) and the white of the way in and out
    this.caption = document.createElement("div");
    this.caption.className = "dive-cap hud";
    this.flash = document.createElement("div");
    this.flash.className = "dive-flash";
    ui.append(this.caption, this.flash);
    window.addEventListener("keydown", (e) => {
      if (this.phase === "proof" && e.code === "Escape") this.leave();
    });
  }

  get active() {
    return this.phase !== "off";
  }
  /** The camera is in the street (falling onto the parcel, or pulling back out). */
  get inCity() {
    return this.phase === "in" || this.phase === "out";
  }
  get inProof() {
    return this.phase === "proof";
  }
  get state() {
    return { phase: this.phase, t: Math.round(this.t * 10) / 10, stage: this.stage, folds: this.folds };
  }

  /** Bytes of this transaction's proofs. */
  private bytes() {
    const tx = this.tx!;
    return tx.pool === "orchard" ? 2720 + 2272 * tx.actions : 192 * (tx.spends + tx.outputs);
  }

  /**
   * Into `tx`'s proof, from the map looking at `at` (the parcel's place in the street) along the
   * direction `look` (where the map camera was looking from).
   */
  start(tx: DiveTx, at: THREE.Vector3, fromCam: THREE.Vector3) {
    if (this.active) return;
    this.tx = tx;
    this.at.copy(at);
    // from high above, on the map's side of the parcel
    const dir = fromCam.clone().sub(at).setY(0);
    if (dir.lengthSq() < 1) dir.set(1, 0, 1);
    dir.normalize();
    this.from.copy(at).addScaledVector(dir, 38).add(new THREE.Vector3(0, 46, 0));
    this.phase = "in";
    this.t = 0;
    this.stage = -1;
    this.folds = 0;
    this.end = tx.pool === "orchard" ? 17.5 : 14;
    this.build();
    this.hooks.diving(true);
    this.caption.classList.remove("on");
    this.flash.style.opacity = "0";
    this.cityCam(0);
  }

  /** Out early (Escape, a click). */
  leave() {
    if (this.phase !== "proof") return;
    this.phase = "out";
    this.t = 0;
    this.caption.classList.remove("on");
  }

  stop() {
    this.phase = "off";
    this.caption.classList.remove("on");
    this.flash.style.opacity = "0";
    this.hooks.diving(false);
  }

  /** This transaction's circuit: values in the cells, the labels, the sheet laid flat. */
  private build() {
    const tx = this.tx!;
    let seed = parseInt(tx.txid.slice(0, 8), 16) || 7;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < this.value.length; i++) {
      const r = rnd();
      this.value[i] = r < 0.22 ? 0.08 : 0.3 + r * 1.0;
      this.cells.setColorAt(i, DARK);
    }
    if (this.cells.instanceColor) this.cells.instanceColor.needsUpdate = true;
    for (const o of this.orbs) o.visible = false;
    this.gem.visible = false;
    this.sheetGroup.visible = false;
    for (const l of [...this.labels.children]) {
      ((l as THREE.Sprite).material.map as THREE.Texture)?.dispose();
      l.removeFromParent();
    }
    // at the nave's door and along it
    const title = sign(tx.pool === "orchard" ? "ORCHARD · HALO 2" : "SAPLING · GROTH16", 2.2);
    title.position.set(0, 5.4, -16);
    this.labels.add(title);
    const tid = sign(`tx ${tx.txid.slice(0, 10)}…${tx.txid.slice(-6)}`, 0.9, "#e9d8b0");
    tid.position.set(0, 3.7, -16);
    this.labels.add(tid);
    if (tx.pool === "orchard")
      for (const r of [0, 16, 32, 48, 63]) {
        const l = sign(`ROW ${fmt(r === 63 ? 2047 : r * 32)}`, 0.7, "#8a849c");
        l.position.set(-ARCH * 0.55, -4.4, -r * STEP);
        this.labels.add(l);
      }
    // the sheet, flat and whole
    for (let j = 0; j < SHEET.h; j++)
      for (let i = 0; i < SHEET.w; i++) {
        const k = j * SHEET.w + i;
        this.m4.makeTranslation((i - SHEET.w / 2 + 0.5) * SHEET.cell, (j - SHEET.h / 2 + 0.5) * SHEET.cell, 0);
        this.sheet.setMatrixAt(k, this.m4);
        this.sheet.setColorAt(k, this.c.copy(GOLD).multiplyScalar(0.4 + rnd() * 0.8));
      }
    this.sheet.instanceMatrix.needsUpdate = true;
    if (this.sheet.instanceColor) this.sheet.instanceColor.needsUpdate = true;
    this.sheetGroup.position.set(0, 1.4, -NAVE - 26);
    this.sheetGroup.scale.setScalar(1);
  }

  /** The street part: falling from the map's height onto the parcel (k 0 → 1), or back up. */
  private cityCam(k: number) {
    const e = this.phase === "in" ? k * k * (3 - 2 * k) * 0.3 + k * k * k * 0.7 : 1 - ease(k);
    const near = this.at.clone().add(new THREE.Vector3(0.6, 1.4, 1.4));
    this.camera.position.lerpVectors(this.from, near, e);
    this.camera.lookAt(this.v.copy(this.at).add(new THREE.Vector3(0, 1.0, 0)));
    this.camera.fov = THREE.MathUtils.lerp(55, 34, e);
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.near = 0.1;
    this.camera.far = 1500;
    this.camera.updateProjectionMatrix();
    this.focus.copy(this.at).setY(0);
  }

  private setCaption(stage: number) {
    if (stage === this.stage) return;
    this.stage = stage;
    const tx = this.tx!;
    const o = tx.pool === "orchard";
    const n = o ? tx.actions : tx.spends + tx.outputs;
    const lines = o
      ? [
          ["1 · WITNESS", `2,048 rows × ${ADVICE} advice columns · ${n} action${n === 1 ? "" : "s"}`],
          ["2 · COMMIT", "one Pallas point per column"],
          ["3 · OPEN", "inner product argument · 11 rounds · 2,048 → 1"],
          ["4 · PROOF", `${fmt(this.bytes())} bytes · no trusted setup`],
        ]
      : [
          ["1 · WITNESS", `${tx.spends} spend${tx.spends === 1 ? "" : "s"} · ${tx.outputs} output${tx.outputs === 1 ? "" : "s"} · one circuit each`],
          ["2 · PROVE", "three points: A, B, C"],
          ["3 · PROOF", `${fmt(this.bytes())} bytes · 192 per proof`],
        ];
    const [h, d] = lines[Math.min(stage, lines.length - 1)];
    this.caption.innerHTML = `<em>${o ? "ORCHARD · HALO 2" : "SAPLING · GROTH16"}</em><b>${h}</b><span>${d}</span>`;
    this.caption.classList.add("on");
  }

  update(dt: number) {
    if (!this.active) return;
    dt = Math.min(dt, 0.05);
    this.t += dt;
    if (this.phase === "in") {
      const T = 2.4;
      this.cityCam(clamp01(this.t / T));
      // white at the end of the fall, through the parcel
      this.flash.style.opacity = String(clamp01((this.t - (T - 0.35)) / 0.35));
      if (this.t >= T) {
        this.phase = "proof";
        this.t = 0;
        this.hooks.boom();
      }
      return;
    }
    if (this.phase === "out") {
      const T = 2.2;
      this.cityCam(clamp01(this.t / T));
      this.flash.style.opacity = String(1 - clamp01(this.t / 0.5));
      if (this.t >= T) this.stop();
      return;
    }
    // ---- in the proof
    this.flash.style.opacity = String(1 - clamp01(this.t / 0.45));
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.near = 0.1;
    this.camera.far = 4000;
    if (this.tx!.pool === "orchard") this.orchard();
    else this.sapling();
    this.camera.updateProjectionMatrix();
    if (this.t >= this.end) {
      this.phase = "out";
      this.t = 0;
      this.caption.classList.remove("on");
    }
  }

  /** The witness: the camera down the nave while its rows light up ahead of it. */
  private witness(k: number, camEnd: number) {
    const z = THREE.MathUtils.lerp(9, camEnd, ease(k));
    // the rows are set a little ahead of you, all the way to the end
    const front = Math.min(ROWS + 2, -z / STEP + 9 + k * 6);
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++) {
        const i = r * COLS + c;
        const lit = clamp01(front - r);
        if (lit <= 0) continue;
        // a white flash as it is set, settling to its value
        const f = clamp01(1 - (front - r) * 0.9);
        this.c.copy(DARK).lerp(this.cellBase[i], lit).multiplyScalar(0.2 + this.value[i] * 0.8);
        this.c.lerp(new THREE.Color(1.6, 1.6, 1.5), f * 0.8);
        this.cells.setColorAt(i, this.c);
      }
    if (this.cells.instanceColor) this.cells.instanceColor.needsUpdate = true;
    this.camera.position.set(Math.sin(this.t * 0.6) * 1.2, 0.6 + Math.sin(this.t * 0.9) * 0.4, z);
    this.camera.lookAt(0, 1.4, z - 20);
    this.camera.fov = 72;
  }

  /** The columns drawn into points, in a ring ahead. */
  private commit(k: number, n: number, ringZ: number) {
    for (let i = 0; i < this.orbs.length; i++) {
      const o = this.orbs[i];
      o.visible = i < n && k > 0;
      if (!o.visible) continue;
      // from its column at the far end of the nave, to its place on the ring
      const col = FIXED + Math.round((i / Math.max(1, n - 1)) * (ADVICE - 1));
      const p0 = this.cellPos[(ROWS - 1) * COLS + col];
      const a = (i / n) * Math.PI * 2;
      const p1 = this.v.set(Math.cos(a) * 5.5, 1.4 + Math.sin(a) * 5.5, ringZ);
      const kk = ease(clamp01(k * 1.4 - i * 0.04));
      o.position.lerpVectors(p0, p1, kk);
      o.scale.setScalar(0.6 + kk * 0.6);
      o.rotation.y += 0.03;
    }
    // the nave dims behind them
    const dim = 1 - k * 0.6;
    for (let i = 0; i < ROWS * COLS; i++) {
      this.c.copy(this.cellBase[i]).multiplyScalar((0.2 + this.value[i] * 0.8) * dim);
      this.cells.setColorAt(i, this.c);
    }
    if (this.cells.instanceColor) this.cells.instanceColor.needsUpdate = true;
  }

  private orchard() {
    const t = this.t;
    const camEnd = -NAVE + 8;
    if (t < 6) {
      this.setCaption(0);
      this.witness(t / 6, camEnd);
      return;
    }
    if (t < 9) {
      this.setCaption(1);
      const k = (t - 6) / 3;
      this.commit(k, ADVICE, -NAVE - 12);
      this.camera.position.set(0, 1.0, THREE.MathUtils.lerp(camEnd, -NAVE + 4, ease(k)));
      this.camera.lookAt(0, 1.4, -NAVE - 20);
      return;
    }
    if (t < 15) {
      // the argument: the points gather into one sheet of 2,048, folded in half eleven times
      this.setCaption(2);
      const k = t - 9;
      for (const o of this.orbs) {
        o.position.lerp(this.v.set(0, 1.4, -NAVE - 26), 0.12);
        o.scale.multiplyScalar(0.9);
        if (k > 0.6) o.visible = false;
      }
      this.sheetGroup.visible = k > 0.4;
      const foldT = 0.48;
      const f = Math.min(11, Math.floor(Math.max(0, k - 0.6) / foldT));
      const within = clamp01((Math.max(0, k - 0.6) - f * foldT) / (foldT * 0.8));
      this.fold(f, f < 11 ? ease(within) : 0);
      if (f > this.folds) {
        this.folds = f;
        this.hooks.ring(f);
      }
      // the camera closes in as the sheet shrinks
      const size = Math.max(this.sheetSize(Math.min(11, f)).w, 1) * SHEET.cell;
      const dist = Math.max(4.5, size * 0.95 + 3);
      const camZ = -NAVE - 26 + dist;
      this.camera.position.lerp(this.v.set(0, 1.4, camZ), 0.06);
      this.camera.lookAt(0, 1.4, -NAVE - 26);
      this.camera.fov = 60;
      return;
    }
    // the proof
    this.setCaption(3);
    this.proofGem(t - 15);
  }

  private sapling() {
    const t = this.t;
    const camEnd = -NAVE + 8;
    if (t < 6) {
      this.setCaption(0);
      this.witness(t / 6, camEnd);
      return;
    }
    if (t < 10) {
      this.setCaption(1);
      const k = (t - 6) / 4;
      this.commit(Math.min(1, k * 1.3), 3, -NAVE - 12);
      // A, B, C: the three closing in to a triangle
      if (!this.labels.getObjectByName("A")) {
        for (const n of ["A", "B", "C"]) {
          const l = sign(n, 1.4, "#fff1c4");
          l.name = n;
          this.labels.add(l);
        }
      }
      ["A", "B", "C"].forEach((n, i) => {
        const l = this.labels.getObjectByName(n)!;
        l.position.copy(this.orbs[i].position).add(this.v.set(0, 1.8, 0));
        l.visible = k > 0.5;
      });
      this.camera.position.set(0, 1.0, THREE.MathUtils.lerp(camEnd, -NAVE + 2, ease(k)));
      this.camera.lookAt(0, 1.4, -NAVE - 12);
      return;
    }
    this.setCaption(2);
    for (const n of ["A", "B", "C"]) this.labels.getObjectByName(n)?.removeFromParent();
    for (const o of this.orbs) {
      o.position.lerp(this.v.set(0, 1.4, -NAVE - 26), 0.1);
      o.scale.multiplyScalar(0.9);
      if (this.t > 10.6) o.visible = false;
    }
    this.proofGem(t - 10, true);
  }

  /** The sheet's size after `f` folds (the longer side halves each time). */
  private sheetSize(f: number) {
    let w = SHEET.w,
      h = SHEET.h;
    for (let i = 0; i < f; i++) {
      if (w >= h) w /= 2;
      else h /= 2;
    }
    return { w, h };
  }

  /**
   * The sheet after `f` folds, the next fold `k` of the way: the far half turns over onto the near
   * one about the middle line; cells folded away before are hidden (they merged).
   */
  private fold(f: number, k: number) {
    const cur = this.sheetSize(f);
    const alongX = cur.w >= cur.h && cur.w > 1;
    const glow = 1 + f * 0.12;
    for (let j = 0; j < SHEET.h; j++)
      for (let i = 0; i < SHEET.w; i++) {
        const idx = j * SHEET.w + i;
        if (i >= cur.w || j >= cur.h) {
          this.sheet.setMatrixAt(idx, this.m4.makeScale(0, 0, 0));
          continue;
        }
        let x = (i + 0.5) * SHEET.cell,
          y = (j + 0.5) * SHEET.cell,
          z = 0;
        if (f < 11 && k > 0) {
          const mid = (alongX ? cur.w : cur.h) / 2;
          const d = (alongX ? i : j) + 0.5 - mid;
          if (d > 0) {
            const a = Math.PI * k;
            const fold = mid * SHEET.cell;
            const off = d * SHEET.cell;
            if (alongX) {
              x = fold + off * Math.cos(a);
              z = off * Math.sin(a);
            } else {
              y = fold + off * Math.cos(a);
              z = off * Math.sin(a);
            }
          }
        }
        this.m4.makeTranslation(x - (cur.w * SHEET.cell) / 2, y - (cur.h * SHEET.cell) / 2, z);
        this.sheet.setMatrixAt(idx, this.m4);
      }
    this.sheet.instanceMatrix.needsUpdate = true;
    // brighter as it folds (what merges adds up)
    (this.sheet.material as THREE.MeshBasicMaterial).color.setScalar(glow);
    // the last one: a single cube, bigger
    this.sheetGroup.scale.setScalar(f >= 11 ? 1 + k * 2 : 1);
  }

  private proofGem(k: number, sapling = false) {
    this.sheetGroup.visible = !sapling && k < 0.3;
    const g = this.gem;
    if (!g.visible) {
      g.visible = true;
      g.position.set(0, 1.4, -NAVE - 26);
      this.hooks.boom();
      const big = sign(`${fmt(this.bytes())} BYTES`, 1.6);
      big.position.set(0, -2.6, -NAVE - 26);
      big.name = "bytes";
      this.labels.add(big);
      const p = sign("PROOF", 1.0, "#fff1c4");
      p.position.set(0, 5.2, -NAVE - 26);
      this.labels.add(p);
    }
    const s = ease(clamp01(k / 0.6));
    g.scale.setScalar(0.2 + s * 0.8 + Math.sin(k * 3) * 0.03);
    g.rotation.y += 0.02;
    g.rotation.x = Math.sin(k * 0.8) * 0.3;
    this.camera.position.lerp(this.v.set(Math.sin(k * 0.4) * 3, 1.8, -NAVE - 26 + 13), 0.05);
    this.camera.lookAt(0, 1.0, -NAVE - 26);
    this.camera.fov = 55;
  }
}
