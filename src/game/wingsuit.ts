import * as THREE from "three";
import { makeSnarkBody, preloadSnarks, type SnarkBody } from "../scene/snarkbody";
import { AirStreaks } from "../scene/swing/streaks";

/**
 * The Needle's base jump: your zkSNARK in a wingsuit off the 150 m deck, west over Midtown and
 * Central Park, through a line of gold rings (one per recent block, its number on it), down into
 * Block Stadium. Steer with A/D (or ←/→), dive with W (↑), pull up with S (↓), the canopy with
 * Space; on a touch screen, drag. Below 30 m the canopy opens by itself; a wall stops you.
 *
 *   wing.start(); wing.update(dt) each frame while wing.active; wing.camera draws it
 */

/** The stadium's lot (src/scene/city/plan.ts LOTS) and its pitch's middle. */
const STADIUM = { x0: -221, x1: -129, z0: -116, z1: -48, cx: -175, cz: -82 };
const NEEDLE = { x: 141.5, z: -136.5 };
const JUMP_Y = 150;
const RINGS = 8;
const RING_R = 7.5;
const CANOPY_Y = 30;

export interface WingResult {
  rings: number;
  of: number;
  seconds: number;
  /** Where it ended. */
  end: "bullseye" | "stadium" | "roof" | "street" | "wall";
  at: THREE.Vector3;
  best: boolean;
}

export interface WingHooks {
  /** The city's top surface at (x, z): a roof, the street (0). */
  height(x: number, z: number): number;
  /** The Needle's building (where its west face is at 150 m). */
  needle(): THREE.Object3D | null;
  /** The last blocks, newest first: one per ring. */
  blocks(): number[];
  /** The visitor's zkSNARK. */
  avatar(): number;
  air(level: number): void;
  ring(n: number): void;
  thud(k: number): void;
  cheer(): void;
  /** It is over (the card shows; `again` / `close` are its buttons). */
  done(r: WingResult): void;
  /** The flight starts or ends: the rest of the HUD hides, the controls go. */
  flying(on: boolean): void;
}

type Mode = "off" | "count" | "fly" | "canopy" | "end";

/** A gold ring with its block's number over it. */
function makeRing(label: string) {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color("#f4b728").multiplyScalar(1.6), toneMapped: false });
  const torus = new THREE.Mesh(new THREE.TorusGeometry(RING_R, 0.42, 8, 48), mat);
  torus.raycast = () => {};
  g.add(torus);
  // a thin inner ring, to read the hoop from far off
  const inner = new THREE.Mesh(new THREE.TorusGeometry(RING_R - 1.1, 0.08, 4, 48), new THREE.MeshBasicMaterial({ color: "#fff1c4", transparent: true, opacity: 0.6, toneMapped: false }));
  inner.raycast = () => {};
  g.add(inner);
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 128;
  const x = c.getContext("2d")!;
  x.font = '400 84px "DotGothic16", "JetBrains Mono", monospace';
  x.textAlign = "center";
  x.textBaseline = "middle";
  x.fillStyle = "#f4b728";
  x.fillText(label, 256, 66);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }));
  sign.scale.set(12, 3, 1);
  sign.position.y = RING_R + 2.6;
  g.add(sign);
  return { g, mat, torus };
}

export class Wingsuit {
  readonly camera = new THREE.PerspectiveCamera(72, 1, 0.3, 1800);
  readonly group = new THREE.Group();
  private holder = new THREE.Group();
  private body: SnarkBody | null = null;
  private wing: THREE.Mesh | null = null;
  private canopyMesh: THREE.Group;
  /** The board out from the deck, under your feet before the jump. */
  private board: THREE.Group;
  /** The target on the pitch. */
  private target: THREE.Group;
  private streaks = new AirStreaks({ count: 90, spread: 22, trail: 0.05 });
  private trails: { line: THREE.Line; pts: Float32Array; col: Float32Array }[] = [];
  private rings: { g: THREE.Group; mat: THREE.MeshBasicMaterial; at: THREE.Vector3; n: THREE.Vector3; passed: boolean }[] = [];
  private mode: Mode = "off";
  private t = 0;
  private clock = 0;
  private pos = new THREE.Vector3();
  private prev = new THREE.Vector3();
  private vel = new THREE.Vector3();
  private yaw = -Math.PI / 2;
  private pitch = -0.22;
  private bank = 0;
  private speed = 0;
  private passed = 0;
  private keys = new Set<string>();
  private stick = new THREE.Vector2();
  private drag: { x: number; y: number; id: number } | null = null;
  private camPos = new THREE.Vector3();
  private camLook = new THREE.Vector3();
  private shake = 0;
  private hud: HTMLElement;
  private start0 = new THREE.Vector3();
  private best = 0;
  readonly focus = new THREE.Vector3();
  /** Where the last flight ended (the map goes there after). */
  readonly landed = new THREE.Vector3();

  constructor(
    scene: THREE.Scene,
    ui: HTMLElement,
    private hooks: WingHooks,
  ) {
    this.group.name = "wingsuit";
    this.group.visible = false;
    this.group.add(this.holder, this.streaks.root);
    // the canopy: a gold-and-black ram-air wing on its lines
    this.canopyMesh = new THREE.Group();
    const cells = 7;
    for (let i = 0; i < cells; i++) {
      const a = (i / (cells - 1) - 0.5) * 1.1;
      const cell = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.22, 1.5), new THREE.MeshLambertMaterial({ color: i % 2 ? "#14121a" : "#f4b728" }));
      cell.position.set(Math.sin(a) * 2.6, Math.cos(a) * 2.6 - 2.6 + 4.2, 0);
      cell.rotation.z = -a;
      this.canopyMesh.add(cell);
    }
    const lines = new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints([-2.3, -1, 1, 2.3].flatMap((x) => [new THREE.Vector3(0, 0.9, 0), new THREE.Vector3(x, 3.9 - Math.abs(x) * 0.25, 0)])),
      new THREE.LineBasicMaterial({ color: "#d8d2c4" }),
    );
    this.canopyMesh.add(lines);
    this.canopyMesh.visible = false;
    this.holder.add(this.canopyMesh);
    this.board = new THREE.Group();
    const plank = new THREE.Mesh(new THREE.BoxGeometry(1, 0.16, 1.2), new THREE.MeshLambertMaterial({ color: "#1a1820" }));
    plank.name = "plank";
    this.board.add(plank);
    for (const z of [-0.62, 0.62]) {
      const edge = new THREE.Mesh(new THREE.BoxGeometry(1, 0.2, 0.08), new THREE.MeshBasicMaterial({ color: new THREE.Color("#f4b728").multiplyScalar(1.3), toneMapped: false }));
      edge.name = "edge";
      edge.position.z = z;
      this.board.add(edge);
    }
    this.group.add(this.board);
    // the landing target on the pitch: a gold ring and cross, lit
    this.target = new THREE.Group();
    const gold = new THREE.MeshBasicMaterial({ color: new THREE.Color("#f4b728").multiplyScalar(1.4), toneMapped: false, side: THREE.DoubleSide });
    for (const [r0, r1] of [
      [9.4, 10],
      [4.6, 5.1],
    ]) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(r0, r1, 48), gold);
      ring.rotation.x = -Math.PI / 2;
      this.target.add(ring);
    }
    for (const a of [0, Math.PI / 2]) {
      const bar = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 20), gold);
      bar.rotation.set(-Math.PI / 2, 0, a);
      this.target.add(bar);
    }
    this.target.traverse((o) => (o.raycast = () => {}));
    this.target.visible = false;
    this.group.add(this.target);
    // a gold trail off each hand
    for (let i = 0; i < 2; i++) {
      const N = 48;
      const pts = new Float32Array(N * 3);
      const col = new Float32Array(N * 3);
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(pts, 3));
      g.setAttribute("color", new THREE.BufferAttribute(col, 3));
      const line = new THREE.Line(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      line.frustumCulled = false;
      line.raycast = () => {};
      this.group.add(line);
      this.trails.push({ line, pts, col });
    }
    scene.add(this.group);
    this.hud = document.createElement("div");
    this.hud.className = "wing";
    ui.append(this.hud);
    try {
      this.best = Number(localStorage.getItem("street.wingsuit.best")) || 0;
    } catch {}
    window.addEventListener("keydown", (e) => {
      if (!this.active || (e.target as HTMLElement).closest?.("input,textarea")) return;
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "KeyA", "KeyD", "KeyW", "KeyS", "Space", "Escape"].includes(e.code)) e.preventDefault();
      this.keys.add(e.code);
      if ((e.code === "Space" || e.code === "Escape") && this.mode === "fly") this.pull();
      else if (e.code === "Escape" && this.mode === "end") this.stop();
    });
    window.addEventListener("keyup", (e) => this.keys.delete(e.code));
    window.addEventListener("blur", () => this.keys.clear());
    // on a touch screen (and with a mouse): drag anywhere, the way you want to go
    const canvas = document.querySelector("canvas");
    const down = (e: PointerEvent) => {
      if (!this.active || (e.target as HTMLElement).closest?.(".wing")) return;
      this.drag = { x: e.clientX, y: e.clientY, id: e.pointerId };
    };
    const move = (e: PointerEvent) => {
      if (!this.drag || e.pointerId !== this.drag.id) return;
      const k = Math.min(innerWidth, innerHeight) * 0.16;
      this.stick.set(THREE.MathUtils.clamp((e.clientX - this.drag.x) / k, -1, 1), THREE.MathUtils.clamp((e.clientY - this.drag.y) / k, -1, 1));
    };
    const up = (e: PointerEvent) => {
      if (!this.drag || e.pointerId !== this.drag.id) return;
      this.drag = null;
      this.stick.set(0, 0);
    };
    (canvas ?? window).addEventListener("pointerdown", down as EventListener);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  }

  get active() {
    return this.mode !== "off";
  }

  /** What is happening, for the films and tests. */
  get state() {
    return { mode: this.mode, t: Math.round(this.t * 10) / 10, alt: Math.round(this.pos.y), speed: Math.round(this.speed * 3.6), rings: this.passed, at: this.pos.toArray().map(Math.round) };
  }

  /** The rings (where, passed), for the films and tests. */
  get course() {
    return { pos: this.pos.toArray(), yaw: this.yaw, rings: this.rings.map((r) => ({ at: r.at.toArray(), passed: r.passed })) };
  }

  /** The films and tests steer it: x turn (−1 left … 1 right), y pitch (−1 dive … 1 pull up). */
  steer(x: number, y: number) {
    this.stick.set(x, y);
  }

  /** Off the deck: your zkSNARK on the edge, three seconds, then the air. */
  async start() {
    if (this.active) return;
    const id = this.hooks.avatar();
    await preloadSnarks([id], 6000);
    this.body?.dispose();
    const b = makeSnarkBody(id);
    this.body = b;
    b.holdArms(true);
    this.holder.clear();
    this.holder.add(b.root, this.canopyMesh);
    this.pose(b);
    // the deck's edge on the Needle's west face, 150 m up
    const face = this.westFace(JUMP_Y);
    // (the end of the board, out from the face: the camera behind you stays outside the tower)
    this.start0.set(face - 9, JUMP_Y, NEEDLE.z + 2);
    this.pos.copy(this.start0);
    this.prev.copy(this.pos);
    // the board from the face to the jumper's toes
    const len = face - this.start0.x + 0.8;
    this.board.position.set(this.start0.x - 0.8 + len / 2, JUMP_Y - 0.08, this.start0.z);
    this.board.scale.set(len, 1, 1);
    this.board.visible = true;
    this.yaw = Math.atan2(STADIUM.cx - this.pos.x, STADIUM.cz - this.pos.z);
    this.pitch = -0.1;
    this.bank = 0;
    this.speed = 0;
    this.passed = 0;
    this.t = 0;
    this.clock = 0;
    this.shake = 0;
    this.keys.clear();
    this.stick.set(0, 0);
    this.canopyMesh.visible = false;
    this.layRings();
    this.target.position.set(STADIUM.cx, this.hooks.height(STADIUM.cx, STADIUM.cz) + 0.06, STADIUM.cz);
    this.target.visible = true;
    for (const tr of this.trails) {
      for (let i = 0; i < tr.pts.length; i += 3) tr.pts.set([this.pos.x, this.pos.y, this.pos.z], i);
      tr.col.fill(0);
    }
    this.mode = "count";
    this.group.visible = true;
    this.hooks.flying(true);
    this.place();
    this.camPos.copy(this.pos).add(new THREE.Vector3(Math.sin(this.yaw) * -6, 2.4, Math.cos(this.yaw) * -6));
    this.camLook.copy(this.pos);
    this.render();
  }

  /** Back to where you were (the card's Close, Escape on the card). */
  stop() {
    if (!this.active) return;
    this.mode = "off";
    this.group.visible = false;
    this.streaks.hide();
    this.hooks.air(0);
    this.hud.innerHTML = "";
    this.hud.classList.remove("on");
    this.body?.dispose();
    this.body = null;
    for (const r of this.rings) r.g.removeFromParent();
    this.rings = [];
    this.target.visible = false;
    this.board.visible = false;
    this.hooks.flying(false);
  }

  /** How far west the Needle's face is at height y (a ray from the west). */
  private westFace(y: number) {
    const obj = this.hooks.needle();
    if (obj) {
      obj.updateWorldMatrix(true, true);
      const ray = new THREE.Raycaster(new THREE.Vector3(NEEDLE.x - 120, y, NEEDLE.z), new THREE.Vector3(1, 0, 0));
      const hit = ray.intersectObject(obj, true).find((h) => (h.object as THREE.Mesh).isMesh);
      if (hit) return hit.point.x;
    }
    return NEEDLE.x - 10;
  }

  /** The rings: from the deck down to the stadium, weaving a little, one per recent block. */
  private layRings() {
    for (const r of this.rings) r.g.removeFromParent();
    this.rings = [];
    const blocks = this.hooks.blocks();
    const from = this.start0;
    // the last one over the stadium's east rim, high enough to clear it
    const to = new THREE.Vector3(STADIUM.x1 + 10, 52, STADIUM.cz);
    const along = to.clone().sub(from).setY(0);
    const side = new THREE.Vector3(-along.z, 0, along.x).normalize();
    let last = from.clone();
    for (let i = 0; i < RINGS; i++) {
      const k = (i + 1) / (RINGS + 0.6);
      const at = from.clone().lerp(to, k);
      // the line drops a little faster than the suit glides at rest: dive to make the low ones
      at.y = from.y - (from.y - to.y) * Math.pow(k, 0.92);
      at.addScaledVector(side, Math.sin(k * Math.PI * 2.2) * 26 * (1 - k * 0.5));
      // never inside a building: over its roof
      at.y = Math.max(at.y, this.hooks.height(at.x, at.z) + RING_R + 3);
      const n = at.clone().sub(last).normalize();
      const label = blocks[RINGS - 1 - i] ? `#${blocks[RINGS - 1 - i].toLocaleString("en-US")}` : `${i + 1}/${RINGS}`;
      const r = makeRing(label);
      r.g.position.copy(at);
      r.g.lookAt(at.clone().add(n));
      this.group.add(r.g);
      this.rings.push({ g: r.g, mat: r.mat, at, n, passed: false });
      last = at;
    }
  }

  /** Arms and legs spread, the suit's membranes between them. */
  private pose(b: SnarkBody) {
    const [, , , shR, elR, shL, elL, legR, , legL] = b.puppet.rig.bones;
    b.update(0, { speed: 0, grounded: true });
    shR.rotation.set(0, 0, -1.35);
    shL.rotation.set(0, 0, 1.35);
    elR.rotation.set(0, 0, 0);
    elL.rotation.set(0, 0, 0);
    legR.rotation.set(0, 0, -0.32);
    legL.rotation.set(0, 0, 0.32);
    b.root.updateMatrixWorld(true);
    const inv = b.root.matrixWorld.clone().invert();
    const local = (o: THREE.Object3D, dy = 0) => o.localToWorld(new THREE.Vector3(0, dy, 0)).applyMatrix4(inv);
    const hR = local(b.handR),
      hL = local(b.handL),
      sR = local(shR),
      sL = local(shL),
      fR = local(legR, -0.34),
      fL = local(legL, -0.34),
      pR = local(legR),
      pL = local(legL);
    const tri = [sR, hR, fR, sR, fR, pR, sL, fL, hL, sL, pL, fL, pR, fR, fL, pR, fL, pL];
    const g = new THREE.BufferGeometry().setFromPoints(tri);
    g.computeVertexNormals();
    this.wing?.geometry.dispose();
    this.wing = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: "#f4b728", side: THREE.DoubleSide }));
    this.wing.position.z = -0.03;
    this.wing.raycast = () => {};
    b.root.add(this.wing);
  }

  /** Into the canopy (Space, Escape, or low). */
  private pull() {
    if (this.mode !== "fly") return;
    this.mode = "canopy";
    this.t = 0;
    this.canopyMesh.visible = true;
    this.canopyMesh.scale.setScalar(0.2);
    this.hooks.thud(0.25);
  }

  private input() {
    const k = this.keys;
    let x = (k.has("KeyD") || k.has("ArrowRight") ? 1 : 0) - (k.has("KeyA") || k.has("ArrowLeft") ? 1 : 0);
    let y = (k.has("KeyS") || k.has("ArrowDown") ? 1 : 0) - (k.has("KeyW") || k.has("ArrowUp") ? 1 : 0);
    if (!x && !y) {
      x = this.stick.x;
      y = this.stick.y;
    }
    return { x, y };
  }

  update(dt: number) {
    if (!this.active || !this.body) return;
    dt = Math.min(dt, 0.05);
    this.t += dt;
    const b = this.body;
    if (this.mode === "count") {
      // on the edge: three, two, one
      const left = 3 - this.t;
      if (left <= 0) {
        this.mode = "fly";
        this.t = 0;
        this.speed = 14;
        this.pitch = -0.55;
        this.hooks.thud(0.15);
      }
    } else if (this.mode === "fly") {
      this.clock += dt;
      if (this.clock > 4) this.board.visible = false;
      const { x, y } = this.input();
      // turn by banking (right: the right wing down, the heading round to the right); the nose:
      // glide at rest, dive or flare
      this.bank += (x * 0.75 - this.bank) * Math.min(1, dt * 4);
      this.yaw -= this.bank * 1.25 * dt;
      const want = -0.22 + y * 0.34;
      this.pitch += (want - this.pitch) * Math.min(1, dt * 2.2);
      // speed: what this angle holds (diving gains, flaring bleeds)
      const vt = 27 - 42 * Math.sin(this.pitch + 0.22);
      this.speed += (vt - this.speed) * Math.min(1, dt * (vt > this.speed ? 0.7 : 1.1));
      this.vel.set(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch)).multiplyScalar(this.speed);
      this.vel.y -= 3.2;
      // too slow: the suit stalls and drops
      this.vel.y -= Math.max(0, 17 - this.speed) * 0.9;
      this.prev.copy(this.pos);
      this.pos.addScaledVector(this.vel, dt);
      this.checkRings();
      // a wall, a roof, the street: the end of the flight
      const h = this.hooks.height(this.pos.x, this.pos.z);
      if (this.pos.y < h + 0.4) return this.finish(h > 3 && this.prev.y > h + 0.2 ? "wall" : h > 3 ? "roof" : "street", true);
      // low, or over the stadium: the canopy, to come down into the bowl
      const over = this.pos.x > STADIUM.x0 - 4 && this.pos.x < STADIUM.x1 + 4 && this.pos.z > STADIUM.z0 - 4 && this.pos.z < STADIUM.z1 + 4;
      if (this.pos.y < CANOPY_Y + Math.max(0, h * 0.2) || over) this.pull();
    } else if (this.mode === "canopy") {
      this.clock += dt;
      const { x, y } = this.input();
      this.canopyMesh.scale.setScalar(Math.min(1, 0.2 + this.t * 2.4));
      this.bank += (x * 0.35 - this.bank) * Math.min(1, dt * 3);
      this.yaw -= this.bank * 1.1 * dt;
      // under the canopy: W runs on, S brakes (both for where you put down)
      this.speed += (7 - y * 3 - this.speed) * Math.min(1, dt * 1.6);
      this.pitch += (0 - this.pitch) * Math.min(1, dt * 3);
      this.vel.set(Math.sin(this.yaw) * this.speed, -6 + y * 1.5 - Math.max(0, 1.2 - this.t) * 8, Math.cos(this.yaw) * this.speed);
      this.prev.copy(this.pos);
      this.pos.addScaledVector(this.vel, dt);
      this.checkRings();
      const h = this.hooks.height(this.pos.x, this.pos.z);
      if (this.pos.y < h + 0.05) {
        this.pos.y = h;
        const inStadium = this.pos.x > STADIUM.x0 && this.pos.x < STADIUM.x1 && this.pos.z > STADIUM.z0 && this.pos.z < STADIUM.z1;
        const bull = Math.hypot(this.pos.x - STADIUM.cx, this.pos.z - STADIUM.cz) < 10;
        return this.finish(bull ? "bullseye" : inStadium ? "stadium" : h > 3 ? "roof" : "street", false);
      }
    } else if (this.mode === "end") {
      // the card is up: the body where it came down (celebrating, or flat on its back)
      b.update(dt, { speed: 0, grounded: true });
      this.streaks.update(dt, this.camPos.x, this.camPos.y, this.camPos.z, 0, 0, 0, 0);
      this.render();
      return;
    }
    this.place();
    // the stride stays still; the arms and legs keep the suit spread, the head looks ahead
    b.update(dt, { speed: 0, grounded: true });
    const [, chest, neck, shR, elR, shL, elL, legR, , legL] = b.puppet.rig.bones;
    const flap = this.mode === "fly" ? Math.sin(this.clock * 9) * 0.03 * Math.min(1, this.speed / 30) : 0;
    shR.rotation.set(0, 0, this.mode === "canopy" ? -2.6 : -1.35 + flap);
    shL.rotation.set(0, 0, this.mode === "canopy" ? 2.6 : 1.35 - flap);
    elR.rotation.set(0, 0, 0);
    elL.rotation.set(0, 0, 0);
    legR.rotation.set(0, 0, this.mode === "canopy" ? -0.05 : -0.32);
    legL.rotation.set(0, 0, this.mode === "canopy" ? 0.05 : 0.32);
    chest.rotation.set(0, 0, 0);
    neck.rotation.set(this.mode === "canopy" ? 0.2 : -0.9, 0, 0);
    if (this.wing) this.wing.visible = this.mode !== "canopy";
    this.render();
    this.trail();
    const sp = this.mode === "fly" ? this.speed : this.mode === "canopy" ? 4 : 0;
    this.streaks.update(dt, this.camPos.x, this.camPos.y, this.camPos.z, this.vel.x, this.vel.y, this.vel.z, THREE.MathUtils.clamp((sp - 18) / 22, 0, 0.9));
    this.hooks.air(this.mode === "fly" ? THREE.MathUtils.clamp(this.speed / 42, 0.2, 1) : this.mode === "canopy" ? 0.12 : 0);
    this.drawHud();
  }

  /** The body in the air: belly down, head first, banked into the turn; upright under the canopy. */
  private place() {
    const b = this.body!;
    this.holder.position.copy(this.pos);
    this.holder.rotation.set(0, 0, 0);
    this.holder.rotation.order = "YXZ";
    if (this.mode === "fly" || this.mode === "count") {
      const lie = this.mode === "count" ? 0 : 1;
      this.holder.rotation.set(-this.pitch * lie, this.yaw, this.bank * lie);
      b.root.rotation.set((Math.PI / 2) * lie, 0, 0);
      b.root.position.set(0, -b.height * 0.5 * (1 - lie), -b.height * 0.5 * lie);
    } else {
      this.holder.rotation.set(0, this.yaw, this.bank * 0.6);
      b.root.rotation.set(0, 0, 0);
      b.root.position.set(0, 0, 0);
    }
    this.focus.copy(this.pos).setY(0);
  }

  private checkRings() {
    for (let i = 0; i < this.rings.length; i++) {
      const r = this.rings[i];
      if (r.passed) continue;
      // crossed the ring's plane this frame, inside the hoop
      const a = this.prev.clone().sub(r.at).dot(r.n);
      const c = this.pos.clone().sub(r.at).dot(r.n);
      if (a < 0 && c >= 0) {
        const k = -a / (c - a);
        const hit = this.prev.clone().lerp(this.pos, k);
        if (hit.distanceTo(r.at) < RING_R + 0.6) {
          r.passed = true;
          this.passed++;
          r.mat.color.set("#3ee08f").multiplyScalar(1.4);
          this.speed += 3;
          this.hooks.ring(this.passed);
        }
      }
    }
    for (const r of this.rings) r.g.rotation.z += 0.004;
  }

  /** The chase camera: behind and above, wider the faster you go. */
  private render() {
    const fwd = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const speedK = THREE.MathUtils.clamp((this.speed - 14) / 30, 0, 1);
    const back = this.mode === "canopy" ? 7 : this.mode === "count" ? 5.5 : 4.6 + speedK * 1.6;
    const up = this.mode === "canopy" ? 2.4 : this.mode === "count" ? 1.6 : 1.3;
    const want = this.pos.clone().addScaledVector(fwd, -back).add(new THREE.Vector3(0, up, 0));
    if (this.mode === "end") {
      // down: from the way it came in (open air), pushing in slowly
      const d = 7 - Math.min(2.5, this.t * 0.4);
      want.copy(this.pos).addScaledVector(fwd, -d).add(new THREE.Vector3(0, 2.6, 0));
    } else if (this.mode === "count") {
      // on the edge: from out in front and to the side, the drop and the city beyond it
      const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
      want.copy(this.pos).addScaledVector(fwd, 4.5).addScaledVector(right, 3.2).add(new THREE.Vector3(0, 0.6, 0));
    }
    if (this.mode === "fly") want.y -= this.vel.y * 0.08;
    // never inside a building
    want.y = Math.max(want.y, this.hooks.height(want.x, want.z) + 1.5);
    const k = this.mode === "count" ? 1 : 1 - Math.exp(-(this.mode === "fly" ? 10 : 4) / 60);
    this.camPos.lerp(want, k);
    const look =
      this.mode === "count" || this.mode === "end"
        ? this.pos.clone().add(new THREE.Vector3(0, this.mode === "end" ? 0.9 : 0.2, 0))
        : this.mode === "canopy"
          ? this.pos.clone().addScaledVector(fwd, 6).add(new THREE.Vector3(0, 1.2, 0))
          : this.pos.clone().addScaledVector(fwd, 12).add(new THREE.Vector3(0, -2.5, 0));
    this.camLook.lerp(look, this.mode === "count" ? 1 : this.mode === "end" ? 0.08 : 0.25);
    this.camera.position.copy(this.camPos);
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - 1 / 60);
      this.camera.position.add(new THREE.Vector3((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake));
    }
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(this.camLook);
    if (this.mode === "fly") this.camera.rotateZ(-this.bank * 0.35);
    const fov = 70 + speedK * 18;
    if (Math.abs(this.camera.fov - fov) > 0.05 || this.camera.aspect !== innerWidth / innerHeight) {
      this.camera.fov += (fov - this.camera.fov) * 0.1;
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
    }
  }

  /** The gold threads off the hands, fading behind. */
  private trail() {
    const b = this.body!;
    const on = this.mode === "fly" ? THREE.MathUtils.clamp((this.speed - 16) / 20, 0.15, 1) : 0;
    [b.handR, b.handL].forEach((hand, i) => {
      const tr = this.trails[i];
      const p = hand.getWorldPosition(new THREE.Vector3());
      tr.pts.copyWithin(3, 0, tr.pts.length - 3);
      tr.pts.set([p.x, p.y, p.z], 0);
      const N = tr.pts.length / 3;
      for (let j = 0; j < N; j++) {
        const f = (1 - j / N) * on;
        tr.col.set([0.96 * f, 0.72 * f, 0.16 * f], j * 3);
      }
      tr.line.geometry.attributes.position.needsUpdate = true;
      tr.line.geometry.attributes.color.needsUpdate = true;
    });
  }

  private drawHud() {
    if (this.mode === "count") {
      const n = Math.max(1, Math.ceil(3 - this.t));
      this.hud.classList.add("on");
      this.hud.innerHTML = `<div class="wing-count">${n}</div><div class="wing-keys hud">${matchMedia("(pointer: coarse)").matches ? "Drag to steer · down to pull up" : "<kbd>A</kbd><kbd>D</kbd> turn · <kbd>W</kbd> dive · <kbd>S</kbd> pull up · <kbd>Space</kbd> canopy"}</div>`;
      return;
    }
    const ground = this.hooks.height(this.pos.x, this.pos.z);
    this.hud.innerHTML = `<div class="wing-bar hud"><span><em>ALT</em><b>${Math.max(0, Math.round(this.pos.y - ground))}</b><small>M</small></span><span><em>SPEED</em><b>${Math.round((this.mode === "fly" ? this.speed : this.vel.length()) * 3.6)}</b><small>KM/H</small></span><span><em>RINGS</em><b>${this.passed}</b><small>/${RINGS}</small></span><span><em>TIME</em><b>${this.clock.toFixed(1)}</b><small>S</small></span></div>`;
  }

  private finish(end: WingResult["end"], hard: boolean) {
    this.mode = "end";
    this.t = 0;
    this.hooks.air(0);
    if (hard) {
      this.shake = 1.2;
      this.hooks.thud(end === "wall" ? 1 : 0.7);
    } else if (end === "stadium" || end === "bullseye") this.hooks.cheer();
    this.canopyMesh.visible = false;
    if (this.wing) this.wing.visible = false;
    // on its feet where it came down (on its back after a hit)
    const b = this.body!;
    this.holder.position.copy(this.pos);
    this.holder.rotation.set(0, this.yaw, 0);
    b.root.rotation.set(hard ? -Math.PI / 2 : 0, 0, 0);
    b.root.position.set(0, hard ? 0.3 : 0, 0);
    b.holdArms(hard);
    b.update(0, { speed: 0, grounded: true });
    if (!hard) b.celebrate(30);
    const score = this.passed * 100 + (end === "bullseye" ? 500 : end === "stadium" ? 300 : 0) + (hard ? 0 : 50);
    const isBest = score > this.best;
    if (isBest) {
      this.best = score;
      try {
        localStorage.setItem("street.wingsuit.best", String(score));
      } catch {}
    }
    this.landed.copy(this.pos);
    const r: WingResult = { rings: this.passed, of: RINGS, seconds: Math.round(this.clock * 10) / 10, end, at: this.pos.clone(), best: isBest };
    const WHERE = { bullseye: "Bullseye · Block Stadium", stadium: "Landed in Block Stadium", roof: hard ? "Hit a roof" : "Landed on a roof", street: hard ? "Hit the street" : "Landed in the street", wall: "Hit a wall" };
    this.hud.innerHTML = `<div class="wing-card hud${hard ? " bad" : ""}">
        <em>WINGSUIT · THE NEEDLE · 150 M</em>
        <b>${WHERE[end]}</b>
        <dl><div><dt>RINGS</dt><dd>${r.rings}<small>/${r.of}</small></dd></div><div><dt>TIME</dt><dd>${r.seconds.toFixed(1)}<small>S</small></dd></div><div><dt>SCORE</dt><dd>${score}</dd></div><div><dt>BEST</dt><dd>${this.best}</dd></div></dl>
        <div class="wing-btns"><button class="btn primary" data-wing="again">Jump again</button><button class="btn" data-wing="close">Close</button></div>
      </div>`;
    this.hud.querySelector<HTMLElement>("[data-wing=again]")!.onclick = () => {
      this.stop();
      void this.start();
    };
    this.hud.querySelector<HTMLElement>("[data-wing=close]")!.onclick = () => this.stop();
    this.hooks.done(r);
  }
}
