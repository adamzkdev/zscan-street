/**
 * ZK PARTY's hall in 3D, behind the hub (index.ts): the ゲーム館 at night. Your zkSNARK and three
 * rivals on their podiums, a giant LED wall showing the game picked in the dock, rows of arcade
 * cabinets playing the others, neon signs, a grid of light on the floor. Its own little renderer,
 * drawn only while the hub is up (stopped under a game, a table, a cabinet, a hidden page).
 *
 *   const h = new Hall3D(parent);  h.cast(ids);  h.feature(thumbUrl, color);  h.cheer();  h.run(true);
 */
import * as THREE from "three";
import { Avatar } from "./gp/engine/chars3d";
import { Fx } from "./gp/engine/fx";
import { box, canvasTex, cyl, flat, makeStage, toon } from "./gp/engine/gfx";
import { snarkChar } from "./gp/shared/chars";
import { SEAT, SEAT_DARK } from "./kit";

const TOUCH = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
const BASE = `${import.meta.env?.BASE_URL ?? "/"}party/thumbs/`;

/** The LED wall: two pictures crossfading, its pixels, its scan lines. */
const LED_VERT = `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const LED_FRAG = `
uniform sampler2D a; uniform sampler2D b; uniform float k; uniform float t; uniform vec2 res;
varying vec2 vUv;
void main() {
  vec3 ca = texture2D(a, vUv).rgb;
  vec3 cb = texture2D(b, vUv).rgb;
  vec3 c = mix(ca, cb, smoothstep(0.0, 1.0, k));
  // the panel's LEDs: a fine grid, each cell a little dark at its edges
  vec2 cell = fract(vUv * res);
  float led = smoothstep(0.0, 0.18, cell.x) * smoothstep(1.0, 0.82, cell.x) * smoothstep(0.0, 0.18, cell.y) * smoothstep(1.0, 0.82, cell.y);
  c *= 0.62 + 0.48 * led;
  // a slow scan band
  float band = 0.06 * smoothstep(0.08, 0.0, abs(fract(vUv.y - t * 0.07) - 0.5));
  c += band;
  gl_FragColor = vec4(c * 1.08, 1.0);
}`;

function loadTex(url: string, cb?: (t: THREE.Texture) => void) {
  const t = new THREE.TextureLoader().load(url, (x) => cb?.(x));
  t.colorSpace = THREE.SRGBColorSpace;
  t.minFilter = THREE.LinearFilter;
  t.generateMipmaps = false;
  return t;
}

/** A neon sign: its letters lit on a dark plate (a canvas texture on a plane, w × h units). */
function neon(text: string, w: number, h: number, color: string, font: string, vertical = false) {
  const px = 64;
  const cw = Math.round(w * px * 2),
    ch = Math.round(h * px * 2);
  const tex = canvasTex(cw, ch, (g) => {
    g.fillStyle = "#0c0915";
    g.fillRect(0, 0, cw, ch);
    g.strokeStyle = color;
    g.globalAlpha = 0.5;
    g.lineWidth = 6;
    g.strokeRect(8, 8, cw - 16, ch - 16);
    g.globalAlpha = 1;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillStyle = color;
    g.shadowColor = color;
    g.shadowBlur = 26;
    if (vertical) {
      const n = [...text].length;
      const fs = Math.min(cw * 0.7, (ch * 0.86) / n);
      g.font = `${fs}px ${font}`;
      [...text].forEach((c, i) => g.fillText(c, cw / 2, ch * 0.07 + fs * (i + 0.55)));
    } else {
      g.font = `${Math.round(ch * 0.62)}px ${font}`;
      g.fillText(text, cw / 2, ch / 2 + ch * 0.04);
    }
    g.shadowBlur = 0;
    g.fillStyle = "rgba(255,255,255,0.85)";
    g.globalAlpha = 0.45;
    if (!vertical) g.fillText(text, cw / 2, ch / 2 + ch * 0.04);
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  return m;
}

export class Hall3D {
  readonly canvas: HTMLCanvasElement;
  private r: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private cam: THREE.PerspectiveCamera;
  private fx: Fx;
  private stageG = new THREE.Group();
  private avatars: Avatar[] = [];
  private pods: THREE.Group[] = [];
  private led: THREE.ShaderMaterial;
  private ledKey = "";
  private cabs: { mat: THREE.MeshBasicMaterial; next: number }[] = [];
  private cabPool: string[] = [];
  private lights: THREE.PointLight[] = [];
  private raf = 0;
  private on = false;
  private last = 0;
  private t = 0;
  private w = 0;
  private h = 0;
  private danceIn = 3;
  private ro: ResizeObserver;
  private hidden = () => this.loop(!document.hidden && this.on);

  /** `visible`: whether the hub is what's on screen now (nothing drawn otherwise). */
  constructor(
    parent: HTMLElement,
    private visible: () => boolean = () => true,
  ) {
    this.canvas = document.createElement("canvas");
    this.canvas.className = "zc-3d";
    parent.prepend(this.canvas);
    this.r = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: !TOUCH, powerPreference: "high-performance" });
    this.r.outputColorSpace = THREE.SRGBColorSpace;
    this.r.toneMapping = THREE.NeutralToneMapping;
    this.r.setPixelRatio(Math.min(window.devicePixelRatio || 1, TOUCH ? 1.25 : 1.75));
    const st = makeStage({ sky: ["#05030c", "#1a1036"], fog: { color: "#0d0820", near: 14, far: 42 }, night: true, size: 10, hemi: ["#8a7cff", "#1a1030", 0.75], sunIntensity: 1.5, sun: [0.3, 1, 0.6] });
    this.scene = st.scene;
    this.cam = st.camera;
    this.cam.fov = 40;
    this.fx = new Fx(this.scene);
    this.scene.add(this.stageG);
    this.build();
    this.led = new THREE.ShaderMaterial({
      vertexShader: LED_VERT,
      fragmentShader: LED_FRAG,
      uniforms: { a: { value: new THREE.Texture() }, b: { value: new THREE.Texture() }, k: { value: 1 }, t: { value: 0 }, res: { value: new THREE.Vector2(160, 90) } },
      toneMapped: false,
    });
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(9.6, 5.4), this.led);
    screen.position.set(0, 4.15, -4.42);
    this.stageG.add(screen);
    this.ro = new ResizeObserver(() => this.fit());
    this.ro.observe(parent);
    document.addEventListener("visibilitychange", this.hidden);
    this.fit();
  }

  // ---- the room ---------------------------------------------------------------------------------

  private build() {
    const s = this.scene;
    const g = this.stageG;
    // the floor: dark, a grid of light in it
    const grid = canvasTex(
      256,
      256,
      (c, w, h) => {
        c.fillStyle = "#0b0816";
        c.fillRect(0, 0, w, h);
        c.strokeStyle = "rgba(160,110,255,0.55)";
        c.lineWidth = 3;
        c.strokeRect(0, 0, w, h);
        c.strokeStyle = "rgba(62,198,255,0.18)";
        c.lineWidth = 1;
        c.beginPath();
        c.moveTo(w / 2, 0);
        c.lineTo(w / 2, h);
        c.moveTo(0, h / 2);
        c.lineTo(w, h / 2);
        c.stroke();
      },
      true,
    );
    grid.repeat.set(24, 24);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshToonMaterial({ map: grid, color: "#ffffff" }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    s.add(floor);
    // the back wall and the LED wall's frame
    box(s, "#120d22", 40, 14, 0.6, { y: 7, z: -5.2 });
    box(g, "#1a1430", 10.3, 6.1, 0.4, { y: 4.15, z: -4.7 });
    const tube = (x: number, y: number, w: number, h: number, c: string) => box(g, flat(c), w, h, 0.08, { x, y, z: -4.45 });
    tube(0, 7.27, 10.3, 0.08, "#ff5fa2");
    tube(0, 1.03, 10.3, 0.08, "#3ec6ff");
    tube(-5.15, 4.15, 0.08, 6.3, "#ff5fa2");
    tube(5.15, 4.15, 0.08, 6.3, "#3ec6ff");
    // the signs: ZK PARTY over the wall, the hall's name down its side
    const title = neon("ZK PARTY", 6.2, 1.15, "#ff6b35", '"DotGothic16", monospace');
    title.position.set(0, 8.1, -4.6);
    g.add(title);
    const side = neon("ゲーム館", 1.1, 4.2, "#ff5fa2", '"DotGothic16", monospace', true);
    side.position.set(-6.1, 4.3, -4.5);
    g.add(side);
    const side2 = neon("遊べ", 1.1, 2.4, "#3ec6ff", '"DotGothic16", monospace', true);
    side2.position.set(6.1, 3.4, -4.5);
    g.add(side2);
    // the stage: a step with a lit edge, four podiums in the seats' colours
    cyl(g, "#1d1532", 5.4, 0.5, { y: 0.25, z: -0.6, seg: 48 });
    const rim = new THREE.Mesh(new THREE.TorusGeometry(5.4, 0.06, 6, 72), flat("#a98bff"));
    rim.rotation.x = Math.PI / 2;
    rim.position.set(0, 0.5, -0.6);
    g.add(rim);
    const spots: [number, number, number][] = [
      [0, 1.4, 1],
      [-2.6, -0.6, 0.9],
      [2.6, -0.6, 0.9],
      [0, -2.1, 0.85],
    ];
    spots.forEach(([x, z], i) => {
      const p = new THREE.Group();
      p.position.set(x, 0.5, z);
      cyl(p, "#efe9ff", 0.82, i === 0 ? 0.62 : 0.42, { y: (i === 0 ? 0.62 : 0.42) / 2, seg: 28 });
      cyl(p, SEAT[i], 0.88, 0.1, { y: i === 0 ? 0.62 : 0.42, seg: 28 });
      g.add(p);
      this.pods.push(p);
    });
    // the cabinets: two rows along the sides, each screen a game
    for (const side of [-1, 1]) {
      for (let k = 0; k < 5; k++) {
        const cab = new THREE.Group();
        cab.position.set(side * (8.2 + k * 0.35), 0, -3.4 + k * 2.3);
        cab.rotation.y = -side * (Math.PI / 2 - 0.35);
        const hue = ["#ff6b35", "#3ec6ff", "#8ee35b", "#ff5fa2", "#a98bff"][(k + (side > 0 ? 2 : 0)) % 5];
        box(cab, "#171126", 1.5, 2.6, 1.1, { y: 1.3 });
        box(cab, toon(hue, hue, 0.5), 1.52, 0.42, 1.12, { y: 2.42 });
        box(cab, "#0a0812", 1.3, 0.12, 0.7, { y: 1.15, z: 0.4 });
        const mat = new THREE.MeshBasicMaterial({ color: "#ffffff", toneMapped: false });
        const scr = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.8), mat);
        scr.position.set(0, 1.75, 0.56);
        scr.rotation.x = -0.12;
        cab.add(scr);
        g.add(cab);
        this.cabs.push({ mat, next: 0.5 + Math.random() * 4 });
      }
    }
    // the light: a pink and a cyan wash on the stage
    const pink = new THREE.PointLight("#ff5fa2", 26, 18, 1.6);
    pink.position.set(-5, 5, 2);
    const cyan = new THREE.PointLight("#3ec6ff", 26, 18, 1.6);
    cyan.position.set(5, 5, 2);
    g.add(pink, cyan);
    this.lights.push(pink, cyan);
  }

  // ---- what it shows ------------------------------------------------------------------------------

  /** Who stands on the podiums: you first (the big one, front), then three rivals. */
  cast(ids: number[], names: string[]) {
    for (const a of this.avatars) a.dispose();
    this.avatars = ids.slice(0, 4).map((id, i) => {
      const a = new Avatar(snarkChar(id, names[i] ?? "", SEAT[i], SEAT_DARK[i]), { scale: i === 0 ? 1.12 : 0.95, ring: null });
      const p = this.pods[i];
      a.pos.set(p.position.x, p.position.y + (i === 0 ? 0.62 : 0.42), p.position.z);
      a.groundY = a.pos.y;
      a.yaw = 0;
      a.anim = "idle";
      this.stageG.add(a.root);
      return a;
    });
  }

  /** The LED wall shows this game (its thumbnail), crossfading from the last. */
  feature(key: string) {
    if (key === this.ledKey) return;
    this.ledKey = key;
    const u = this.led.uniforms;
    loadTex(`${BASE}${key}.jpg`, (tx) => {
      if (this.ledKey !== key) return tx.dispose();
      const old = u.a.value as THREE.Texture;
      u.a.value = u.k.value > 0.5 ? u.b.value : u.a.value;
      if (old !== u.a.value) old.dispose();
      u.b.value = tx;
      u.k.value = 0;
    });
  }

  /** The games the cabinets cycle through. */
  pool(keys: string[]) {
    this.cabPool = keys;
    for (const c of this.cabs) c.next = Math.random() * 1.5;
  }

  /** You, pleased: a hop (a pick in the dock), or a victory dance (a game starting). */
  cheer(big = false) {
    const a = this.avatars[0];
    if (!a) return;
    a.play(big ? "win" : "jump");
    setTimeout(() => a.anim === "jump" && (a.anim = "idle"), 450);
    if (big) this.fx.confetti(new THREE.Vector3(a.pos.x, a.pos.y + 2.4, a.pos.z), 70);
  }

  // ---- the frame ----------------------------------------------------------------------------------

  private fit() {
    const p = this.canvas.parentElement;
    const w = p?.clientWidth || innerWidth,
      h = p?.clientHeight || innerHeight;
    if (w === this.w && h === this.h) return;
    this.w = w;
    this.h = h;
    this.r.setSize(w, h, false);
    this.cam.aspect = w / h;
    this.cam.updateProjectionMatrix();
    this.frame();
  }

  /** Wide: the stage on the right (the menu's words on the left); upright: centred, high. */
  private frame() {
    const a = this.w / Math.max(1, this.h);
    const wide = a > 1.15;
    this.stageG.position.x = wide ? Math.min(6.4, 3.2 + (a - 1.15) * 4.2) : 0;
    this.cam.fov = wide ? 34 : 54;
    this.cam.updateProjectionMatrix();
  }

  run(on: boolean) {
    this.on = on;
    this.loop(on && !document.hidden);
  }

  private loop(on: boolean) {
    if (on && !this.raf) {
      this.last = performance.now();
      const step = (now: number) => {
        this.raf = requestAnimationFrame(step);
        const dt = Math.min(0.05, (now - this.last) / 1000);
        this.last = now;
        this.tick(dt);
      };
      this.raf = requestAnimationFrame(step);
    } else if (!on && this.raf) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    }
  }

  private tick(dt: number) {
    if (!this.visible()) return;
    this.t += dt;
    const t = this.t;
    const u = this.led.uniforms;
    u.t.value = t;
    if (u.k.value < 1) u.k.value = Math.min(1, u.k.value + dt * 2.6);
    // the camera: a slow drift round the stage
    const wide = this.w / Math.max(1, this.h) > 1.15;
    const cx = Math.sin(t * 0.13) * 0.9;
    // (upright: the stage sits in the screen's top half, the words and the dock under it)
    if (wide) {
      this.cam.position.set(cx + this.stageG.position.x * 0.25, 4.2, 18);
      this.cam.lookAt(this.stageG.position.x * 0.45 + cx * 0.3, 2.5, -1.5);
    } else {
      this.cam.position.set(cx * 0.6, 5.5, 21);
      this.cam.lookAt(cx * 0.2, -1.6, -1.5);
    }
    // the rivals dance now and then; you idle, a hop when asked
    this.danceIn -= dt;
    if (this.danceIn < 0) {
      this.danceIn = 3 + Math.random() * 4;
      const k = 1 + Math.floor(Math.random() * 3);
      const a = this.avatars[k];
      if (a) {
        a.anim = a.anim === "dance" ? "idle" : "dance";
      }
    }
    this.avatars.forEach((a, i) => {
      a.yaw = Math.sin(t * 0.6 + i * 1.7) * 0.3;
      a.update(dt);
    });
    // the cabinets change games
    if (this.cabPool.length)
      for (const c of this.cabs) {
        c.next -= dt;
        if (c.next > 0) continue;
        c.next = 4 + Math.random() * 5;
        const key = this.cabPool[Math.floor(Math.random() * this.cabPool.length)];
        const old = c.mat.map;
        c.mat.map = loadTex(`${BASE}${key}.jpg`, () => (c.mat.needsUpdate = true));
        c.mat.needsUpdate = true;
        old?.dispose();
      }
    // the washes breathe
    this.lights[0].intensity = 22 + Math.sin(t * 1.3) * 6;
    this.lights[1].intensity = 22 + Math.cos(t * 1.1) * 6;
    this.fx.update(dt);
    this.r.render(this.scene, this.cam);
  }

  dispose() {
    this.run(false);
    this.ro.disconnect();
    document.removeEventListener("visibilitychange", this.hidden);
    for (const a of this.avatars) a.dispose();
    this.r.dispose();
    this.canvas.remove();
  }
}
