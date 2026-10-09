import * as THREE from "three";
import type { City } from "../city";
import type { Director } from "../director";
import { loadArt } from "../snark";
import { sprite, type Px } from "../sprites";
import { VOX } from "../voxel/model";
import { CD, CRYPT, CW, EPITAPHS, FX0, FX1, FZ0, FZ1, GATE, GRAVES, groundV, groundY, laneGraph, pitOf, STONE_T, TOMBS, graveExit, type Grave } from "./layout";
import { Zombie, ZOMBIE_LINES } from "./zombie";

/**
 * ZK CEMETERY, live: zombie zkSNARKs climbing out of their graves now and then (the stone lid
 * slides aside, earth flies) or shambling out of the CRYPT, wandering the alleys, groaning in small
 * bubbles, turning towards whoever walks in; crows on the posts and roofs; mist on the ground;
 * the gate's iron name plate; the epitaphs on the stones you can read; at night more of them, a
 * thicker mist, their eyes glowing, will-o'-the-wisps and a full moon over the chapel.
 * `groundAt` gives the walker on foot the hill's height; `hit` the zombies in the way.
 */

const ZOMBIE_IDS = [66, 404, 666, 1313, 1031, 2113, 3001, 3666, 4040, 4444, 5013, 5555, 6006, 6660, 7013, 7777, 8008, 8086, 9009, 9666, 1666, 2666, 999, 31, 1984, 2016];

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(a: readonly T[]) => a[Math.floor(Math.random() * a.length)];

interface Lid {
  grave: Grave;
  /** 0 shut … 1 slid open. */
  open: number;
  want: number;
  /** A zombie using this grave right now. */
  busy: Zombie | null;
  center: THREE.Vector3;
  top: number;
  pw: number;
  pd: number;
}

interface Crow {
  m: THREE.Mesh;
  perch: number;
  pos: THREE.Vector3;
  fly: { from: THREE.Vector3; to: THREE.Vector3; k: number; len: number; dest: number } | null;
  next: number;
  facing: number;
  caw: number;
}

export class Cemetery {
  readonly group = new THREE.Group();
  private zGroup = new THREE.Group();
  private ok = false;
  private O = new THREE.Vector3();
  private center = new THREE.Vector3();
  private zombies: Zombie[] = [];
  private pool: Zombie[] = [];
  private loading = false;
  private lids: Lid[] = [];
  private lidMesh: THREE.InstancedMesh | null = null;
  private graph = laneGraph();
  private nodes: THREE.Vector3[] = [];
  private spawnIn = 3;
  private talkIn = 4;
  private night: boolean | null = null;
  private dirt: { p: THREE.Points; v: Float32Array; t: number }[] = [];
  private crows: Crow[] = [];
  private crowFrames: Record<"perch" | "caw" | "up" | "down", ReturnType<typeof sprite>>;
  private perches: THREE.Vector3[] = [];
  private wisps: { s: THREE.Sprite; a: THREE.Vector3; b: THREE.Vector3; k: number; speed: number }[] = [];
  private mist: THREE.ShaderMaterial | null = null;
  private moon: THREE.Group | null = null;
  private signMat: THREE.MeshBasicMaterial | null = null;
  private epitaphs: THREE.Mesh | null = null;
  private cryptOut = new THREE.Vector3();
  private cryptIn = new THREE.Vector3();
  private camQuat = new THREE.Quaternion();
  private camRight = new THREE.Vector3();
  private time = 0;
  private built = false;

  constructor(
    scene: THREE.Object3D,
    private city: City,
    private director: Director,
    /** Zombies out at most, by day and by night. */
    private budget: { day: number; night: number },
  ) {
    this.group.name = "cemetery";
    scene.add(this.group);
    this.group.add(this.zGroup);
    this.crowFrames = { perch: crow("perch"), caw: crow("caw"), up: crow("up"), down: crow("down") };
    const lm = city.landmarks.get("cemetery");
    if (!lm) return;
    this.ok = true;
    this.O.copy(lm.toWorld(0, 0, 0));
    this.center.copy(lm.toWorld(CW / 2, 0, CD / 2));
    this.nodes = this.graph.nodes.map(([x, z]) => this.W(x, 0, z).setY(this.groundAt(this.W(x, 0, z).x, this.W(x, 0, z).z) ?? this.O.y));
    this.cryptIn.copy(this.W(CRYPT.door + 0.5, 0, CRYPT.z1 - 8));
    this.cryptOut.copy(this.W(CRYPT.door + 0.5, 0, CRYPT.z1 + 4));
  }

  /** Model voxels → world. */
  private W(x: number, y: number, z: number) {
    return this.city.landmarks.get("cemetery")!.toWorld(x, y, z);
  }

  /** Is (x, z) inside the walls (the walker's hill)? */
  owns(x: number, z: number) {
    if (!this.ok) return false;
    const vx = (x - this.O.x) / VOX,
      vz = (z - this.O.z) / VOX;
    return vx > FX0 + 0.5 && vx < FX1 - 0.5 && vz > FZ0 + 0.5 && vz < FZ1 + 0.5;
  }

  /** Ground height on the hill inside the fence (and in the gateway), or null outside. */
  groundAt(x: number, z: number): number | null {
    if (!this.ok) return null;
    const vx = (x - this.O.x) / VOX,
      vz = (z - this.O.z) / VOX;
    if (vx > FX0 + 0.5 && vx < FX1 - 0.5 && vz > FZ0 + 0.5 && vz < FZ1 - 0.5) return this.O.y + groundY(vz) * VOX;
    // the gateway: the gravel ramps from the pavement up to the hill
    if (vx > GATE.x0 && vx < GATE.x1 && vz >= FZ1 - 0.5 && vz < CD) return this.O.y + VOX + (groundY(FZ1 - 1) - 1) * VOX * Math.max(0, Math.min(1, (CD - 4 - vz) / (CD - 4 - FZ1)));
    return null;
  }

  /** A zombie (out of its grave) standing at (x, z): you walk round them. */
  hit(x: number, z: number) {
    for (const zb of this.zombies) {
      if (zb.state !== "out") continue;
      const p = zb.root.position;
      if ((x - p.x) ** 2 + (z - p.z) ** 2 < 0.45 * 0.45) return true;
    }
    return false;
  }

  /** The readable stones in world space (debug, shots): where to stand to read one. */
  stones() {
    return GRAVES.filter((g) => g.epi >= 0).map((g) => {
      const p = this.W(g.x + 0.5, 0, g.z + STONE_T);
      return { x: p.x, z: p.z, epi: g.epi, row: g.z, text: EPITAPHS[g.epi][0] };
    });
  }

  /** How many are out right now (debug, shots). */
  get count() {
    return this.zombies.filter((z) => z.state !== "buried").length;
  }

  // ---- the static live bits, built the first time someone comes near ---------------------------

  private build() {
    this.built = true;
    this.buildLids();
    this.buildSign();
    this.buildEpitaphs();
    this.buildMist();
    this.buildMoon();
    this.buildWisps();
    this.buildCrows();
  }

  private buildLids() {
    const open = GRAVES.filter((g) => g.open);
    for (const g of open) {
      const [x0, z0, x1, z1] = pitOf(g);
      const base = groundV(g.z + 6);
      const a = this.W(x0, base + 1, z0),
        b = this.W(x1, base + 1, z1);
      this.lids.push({ grave: g, open: 0, want: 0, busy: null, center: a.clone().add(b).multiplyScalar(0.5), top: a.y, pw: Math.abs(b.x - a.x) + 0.08, pd: Math.abs(b.z - a.z) + 0.08 });
    }
    const mat = new THREE.MeshStandardMaterial({ color: "#8e8c86", roughness: 0.9 });
    this.lidMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, this.lids.length);
    this.lidMesh.castShadow = this.lidMesh.receiveShadow = true;
    this.group.add(this.lidMesh);
    this.poseLids();
  }

  private lidM = new THREE.Matrix4();
  private lidQ = new THREE.Quaternion();
  private lidE = new THREE.Euler();
  private poseLids() {
    if (!this.lidMesh) return;
    this.lids.forEach((l, i) => {
      // slides west most of its width and tips, one edge down on the grass
      const k = l.open;
      const pos = l.center.clone();
      pos.x -= l.pw * 0.78 * k;
      pos.y = l.top - 0.05 + 0.06 * Math.sin(k * Math.PI) - 0.04 * k;
      this.lidE.set(0, 0.25 * k, -0.18 * k);
      this.lidQ.setFromEuler(this.lidE);
      this.lidM.compose(pos, this.lidQ, new THREE.Vector3(l.pw, 0.1, l.pd));
      this.lidMesh!.setMatrixAt(i, this.lidM);
    });
    this.lidMesh.instanceMatrix.needsUpdate = true;
  }

  private buildSign() {
    const lm = this.city.landmarks.get("cemetery")!;
    const at = lm.points.archSign;
    if (!at) return;
    let c = document.createElement("canvas");
    let ctx = c.getContext("2d")!;
    const draw = (front: boolean) => {
      c = document.createElement("canvas");
      c.width = 1024;
      c.height = 384;
      ctx = c.getContext("2d")!;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineJoin = "round";
      const big = front ? "ZK CEMETERY" : "REST IN PRIVACY";
      const small = front ? "✝  GRAVEYARD OF LOST KEYS  ✝" : "✝  NOT YOUR KEYS, NOT YOUR COINS  ✝";
      ctx.font = '700 150px Georgia, "Times New Roman", serif';
      let w = ctx.measureText(big).width;
      const k = Math.min(1, 960 / w);
      ctx.font = `700 ${Math.floor(150 * k)}px Georgia, "Times New Roman", serif`;
      w = ctx.measureText(big).width;
      ctx.lineWidth = 14;
      ctx.strokeStyle = "#0e0d10";
      ctx.strokeText(big, 512, 150);
      ctx.fillStyle = "#cbb27a";
      ctx.fillText(big, 512, 150);
      ctx.fillStyle = "rgba(255,240,200,0.35)";
      ctx.fillText(big, 512, 146);
      ctx.font = '700 54px Georgia, "Times New Roman", serif';
      ctx.lineWidth = 8;
      ctx.strokeText(small, 512, 300);
      ctx.fillStyle = "#a89366";
      ctx.fillText(small, 512, 300);
      void w;
    };
    const plate = (front: boolean) => {
      draw(front);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 4;
      return t;
    };
    this.signMat = new THREE.MeshBasicMaterial({ map: plate(true), transparent: true, toneMapped: false });
    const back = new THREE.MeshBasicMaterial({ map: plate(false), transparent: true, toneMapped: false });
    this.signMat.userData.back = back;
    const geo = new THREE.PlaneGeometry(3.4, 3.4 * (384 / 1024));
    const f = new THREE.Mesh(geo, this.signMat);
    f.position.copy(at).add(new THREE.Vector3(0, 0, 0.02));
    const b = new THREE.Mesh(geo, back);
    b.position.copy(at).add(new THREE.Vector3(0, 0, -0.2));
    b.rotation.y = Math.PI;
    this.group.add(f, b);
  }

  /** The readable stones' epitaphs: one atlas (dark letters for pale stones, pale for dark granite), one mesh. */
  private buildEpitaphs() {
    const CWp = 256,
      CHp = 176,
      cols = 8;
    const n = EPITAPHS.length;
    const rows = Math.ceil((n * 2) / cols);
    const c = document.createElement("canvas");
    c.width = CWp * cols;
    c.height = CHp * rows;
    const ctx = c.getContext("2d")!;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const wrap = (text: string, max: number) => {
      const words = text.split(" ");
      const lines: string[] = [];
      let line = "";
      for (const w of words) {
        const t = line ? `${line} ${w}` : w;
        if (ctx.measureText(t).width > max && line) {
          lines.push(line);
          line = w;
        } else line = t;
      }
      if (line) lines.push(line);
      return lines;
    };
    for (let v = 0; v < 2; v++)
      for (let i = 0; i < n; i++) {
        const cell = v * n + i;
        const x0 = (cell % cols) * CWp,
          y0 = Math.floor(cell / cols) * CHp;
        const ink = v === 0 ? "#2b2620" : "#d8c890";
        const hi = v === 0 ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.5)";
        const [title, line] = EPITAPHS[i];
        const cx = x0 + CWp / 2;
        const text = (s: string, y: number, font: string) => {
          ctx.font = font;
          ctx.fillStyle = hi;
          ctx.fillText(s, cx + 1.5, y + 1.5);
          ctx.fillStyle = ink;
          ctx.fillText(s, cx, y);
        };
        text("R · I · P", y0 + 22, '700 20px Georgia, serif');
        // the title on one line if it fits at a fair size, else two, shrunk until it does
        let ts = 30,
          tl: string[] = [];
        for (; ts >= 15; ts--) {
          ctx.font = `700 ${ts}px Georgia, serif`;
          tl = wrap(title, CWp - 24);
          if (tl.length === 1 && ts >= 24) break;
          if (tl.length <= 2 && ts < 24) break;
        }
        tl.slice(0, 2).forEach((s, k) => text(s, y0 + 58 + k * (ts + 3) - (tl.length > 1 ? 6 : 0), `700 ${ts}px Georgia, serif`));
        ctx.font = 'italic 20px Georgia, serif';
        const ll = wrap(line, CWp - 30);
        const ly = y0 + (tl.length > 1 ? 118 : 104);
        ll.slice(0, 3).forEach((s, k) => text(s, ly + k * 22, 'italic 20px Georgia, serif'));
      }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    const pos: number[] = [],
      uv: number[] = [],
      nor: number[] = [],
      idx: number[] = [];
    for (const g of GRAVES) {
      if (g.epi < 0) continue;
      const hw = Math.floor(g.w / 2);
      const base = groundV(g.z + 6);
      const top = g.kind === "round" ? 2.3 : g.kind === "pointed" ? hw + 0.6 : 1.6;
      const a = this.W(g.x - hw + 0.35, base + 1.3, g.z + STONE_T),
        b = this.W(g.x + hw + 1 - 0.35, base + g.h - top, g.z + STONE_T);
      const z = a.z + 0.006;
      const cell = (g.stone === 1 ? n : 0) + g.epi;
      const u0 = ((cell % cols) * CWp) / c.width,
        u1 = ((cell % cols) * CWp + CWp) / c.width;
      const v1 = 1 - (Math.floor(cell / cols) * CHp) / c.height,
        v0 = 1 - (Math.floor(cell / cols) * CHp + CHp) / c.height;
      const k = pos.length / 3;
      pos.push(a.x, a.y, z, b.x, a.y, z, b.x, b.y, z, a.x, b.y, z);
      uv.push(u0, v0, u1, v0, u1, v1, u0, v1);
      nor.push(0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1);
      idx.push(k, k + 1, k + 2, k, k + 2, k + 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    geo.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
    geo.setIndex(idx);
    const mat = new THREE.MeshLambertMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this.epitaphs = new THREE.Mesh(geo, mat);
    this.epitaphs.name = "epitaphs";
    this.group.add(this.epitaphs);
  }

  /** Mist on the ground: two drifting layers of noise over the hill, thicker at night. */
  private buildMist() {
    const a = this.W(FX0 + 1, 0, FZ0 + 1),
      b = this.W(FX1, 0, FZ1 + 6);
    const geo = new THREE.PlaneGeometry(b.x - a.x, b.z - a.z, 1, 12).rotateX(-Math.PI / 2);
    const p = geo.attributes.position as THREE.BufferAttribute;
    const cx = (a.x + b.x) / 2,
      cz = (a.z + b.z) / 2;
    for (let i = 0; i < p.count; i++) {
      const wz = cz + p.getZ(i);
      const vz = Math.min(FZ1 - 1, (wz - this.O.z) / VOX);
      p.setY(i, groundY(vz) * VOX);
    }
    geo.translate(cx, this.O.y, cz);
    this.mist = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      fog: false,
      uniforms: { t: { value: 0 }, density: { value: 0.3 }, color: { value: new THREE.Color("#c8d8cc") }, lift: { value: 0.35 }, rect: { value: new THREE.Vector4(a.x, a.z, b.x, b.z) } },
      vertexShader: `uniform float lift; varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); w.y += lift; vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `uniform float t; uniform float density; uniform vec3 color; uniform vec4 rect; varying vec3 vW;
        float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
        float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++){ v += a * n(p); p *= 2.03; a *= 0.5; } return v; }
        void main(){
          vec2 p = vW.xz * 0.16;
          float m = fbm(p + vec2(t * 0.05, t * 0.022)) * 0.65 + fbm(p * 1.9 - vec2(t * 0.03, -t * 0.04)) * 0.45;
          m = smoothstep(0.38, 0.95, m);
          float ex = min(vW.x - rect.x, rect.z - vW.x), ez = min(vW.z - rect.y, rect.w - vW.z);
          float edge = smoothstep(0.0, 4.0, min(ex, ez));
          gl_FragColor = vec4(color, m * density * edge);
        }`,
    });
    const low = new THREE.Mesh(geo, this.mist);
    const high = new THREE.Mesh(geo, this.mist.clone());
    (high.material as THREE.ShaderMaterial).uniforms.lift.value = 0.95;
    (high.material as THREE.ShaderMaterial).uniforms.density.value = 0.15;
    low.renderOrder = high.renderOrder = 3;
    low.frustumCulled = high.frustumCulled = false;
    low.name = "mist";
    high.name = "mist2";
    this.group.add(low, high);
    this.mist.userData.high = high.material;
  }

  /** The full moon over the chapel, with its halo (night only). */
  private buildMoon() {
    const g = new THREE.Group();
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const ctx = c.getContext("2d")!;
    const grd = ctx.createRadialGradient(118, 112, 10, 128, 128, 120);
    grd.addColorStop(0, "#fffbe8");
    grd.addColorStop(0.85, "#efe6c4");
    grd.addColorStop(1, "#d8cfae");
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(128, 128, 120, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(150,140,110,0.35)";
    for (const [x, y, r] of [
      [90, 96, 26],
      [160, 80, 16],
      [150, 160, 30],
      [96, 170, 14],
      [184, 132, 12],
    ]) {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    // bright, but not a light source: it no longer sets off the bloom like a second sun
    const disc = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), color: new THREE.Color(0.92, 0.92, 0.86), toneMapped: false, fog: false, depthWrite: false }));
    disc.scale.setScalar(8);
    const h = document.createElement("canvas");
    h.width = h.height = 128;
    const hc = h.getContext("2d")!;
    const hg = hc.createRadialGradient(64, 64, 8, 64, 64, 64);
    hg.addColorStop(0, "rgba(220,255,220,0.22)");
    hg.addColorStop(0.35, "rgba(160,220,180,0.07)");
    hg.addColorStop(1, "rgba(120,200,160,0)");
    hc.fillStyle = hg;
    hc.fillRect(0, 0, 128, 128);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(h), blending: THREE.AdditiveBlending, toneMapped: false, fog: false, depthWrite: false, transparent: true }));
    halo.scale.setScalar(26);
    g.add(halo, disc);
    g.position.copy(this.W(CW * 0.62, 0, -260)).setY(46);
    g.visible = false;
    g.renderOrder = -1;
    this.moon = g;
    this.group.add(g);
  }

  /** Will-o'-the-wisps: green lights drifting between the graves at night. */
  private buildWisps() {
    const h = document.createElement("canvas");
    h.width = h.height = 64;
    const hc = h.getContext("2d")!;
    const hg = hc.createRadialGradient(32, 32, 1, 32, 32, 32);
    hg.addColorStop(0, "rgba(230,255,230,1)");
    hg.addColorStop(0.25, "rgba(120,255,160,0.6)");
    hg.addColorStop(1, "rgba(60,255,120,0)");
    hc.fillStyle = hg;
    hc.fillRect(0, 0, 64, 64);
    const mat = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(h), blending: THREE.AdditiveBlending, color: new THREE.Color(1.6, 2.6, 1.8), toneMapped: false, depthWrite: false, transparent: true });
    for (let i = 0; i < 7; i++) {
      const s = new THREE.Sprite(mat);
      s.scale.setScalar(0.55);
      s.visible = false;
      this.group.add(s);
      const a = this.randomSpot(),
        b = this.randomSpot();
      this.wisps.push({ s, a, b, k: Math.random(), speed: rand(0.04, 0.09) });
    }
  }

  private randomSpot() {
    const vx = rand(FX0 + 12, FX1 - 12),
      vz = rand(70, FZ1 - 6);
    return this.W(vx, groundY(vz) + rand(3, 8), vz);
  }

  /** Crows: on the fence posts, the chapel's ridge, the crypt's pediment, the tombs' pinnacles. */
  private buildCrows() {
    const P = (x: number, y: number, z: number) => this.W(x, y, z);
    const lm = this.city.landmarks.get("cemetery")!;
    const top = (z: number) => Math.max(groundV(Math.min(FZ1 - 1, Math.max(FZ0 + 1, z))), 3) + 2 + 13 + 1;
    for (let x = FX0; x <= FX1; x += 36) {
      this.perches.push(P(x + 0.5, top(FZ0), FZ0 + 0.5));
      if (x < GATE.x0 - 10 || x > GATE.x1 + 10) this.perches.push(P(x + 0.5, top(FZ1), FZ1 + 0.5));
    }
    const ridge = groundV(62) + 2 + 26 + 21 + 1;
    for (const z of [26, 36, 44]) this.perches.push(P(183.5, ridge, z));
    const cr = lm.raw.crypt;
    if (cr) this.perches.push(P(cr[0], cr[1] + 17, cr[2] - 6));
    const t0 = TOMBS[0];
    this.perches.push(P(t0.x0 + 0.5, groundV(t0.z1) + 1 + 31, t0.z1 - 1.5), P(t0.x1 - 1.5, groundV(t0.z1) + 1 + 31, t0.z0 + 0.5));
    this.perches.push(P(GATE.cx + 0.5, 55, FZ1 + 1.5));
    const n = 7;
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: this.crowFrames.perch.texture, transparent: true, alphaTest: 0.5 }));
      const f = this.crowFrames.perch;
      m.geometry.scale(f.w * 0.05, f.h * 0.05, 1).translate(0, (f.h * 0.05) / 2, 0);
      const perch = (i * 3) % this.perches.length;
      const pos = this.perches[perch].clone();
      m.position.copy(pos);
      this.group.add(m);
      this.crows.push({ m, perch, pos, fly: null, next: rand(3, 15), facing: Math.random() < 0.5 ? 1 : -1, caw: 0 });
    }
  }

  // ---- zombies ----------------------------------------------------------------------------------

  private async loadZombies() {
    if (this.loading) return;
    this.loading = true;
    const max = Math.max(this.budget.day, this.budget.night);
    const ids = [...ZOMBIE_IDS].sort(() => Math.random() - 0.5).slice(0, max);
    for (const id of ids) {
      try {
        const art = await loadArt(id);
        const img = art.texture.image as HTMLCanvasElement;
        const z = new Zombie(id, img, art.skin);
        z.setNight(!!this.night);
        this.zGroup.add(z.root);
        this.pool.push(z);
        this.zombies.push(z);
      } catch {}
    }
  }

  /** The path along the alleys from the node nearest `from` to node `to`. */
  private route(from: THREE.Vector3, to: number) {
    let best = 0,
      bd = Infinity;
    this.nodes.forEach((n, i) => {
      const d = (n.x - from.x) ** 2 + (n.z - from.z) ** 2;
      if (d < bd) ((bd = d), (best = i));
    });
    // breadth-first by distance (a dozen nodes: Dijkstra the simple way)
    const dist = this.nodes.map(() => Infinity);
    const prev = this.nodes.map(() => -1);
    dist[best] = 0;
    const open = new Set([best]);
    while (open.size) {
      let u = -1;
      for (const i of open) if (u < 0 || dist[i] < dist[u]) u = i;
      open.delete(u);
      if (u === to) break;
      for (const v of this.graph.edges[u]) {
        const d = dist[u] + this.nodes[u].distanceTo(this.nodes[v]);
        if (d < dist[v]) {
          dist[v] = d;
          prev[v] = u;
          open.add(v);
        }
      }
    }
    const out: THREE.Vector3[] = [];
    for (let v = to; v >= 0; v = prev[v]) out.unshift(this.nodes[v].clone());
    // a little wobble so they don't all walk the same line
    return out.map((p) => p.add(new THREE.Vector3(rand(-0.35, 0.35), 0, rand(-0.35, 0.35))));
  }

  private worldGround = (x: number, z: number) => this.groundAt(x, z) ?? this.O.y;

  /** One more out: from a free grave (the lid slides, earth flies) or out of the crypt's door. */
  private spawn() {
    const z = this.pool.find((q) => q.state === "buried");
    if (!z) return;
    const free = this.lids.filter((l) => !l.busy && l.open < 0.05);
    const fromCrypt = !free.length || Math.random() < 0.25;
    z.lifeLeft = this.night ? rand(70, 170) : rand(35, 80);
    z.speed = rand(0.32, 0.5);
    z.sayCool = rand(2, 8);
    z.look = null;
    if (fromCrypt) {
      z.home = -1;
      z.state = "out";
      z.root.position.copy(this.cryptIn).setY(this.worldGround(this.cryptIn.x, this.cryptIn.z));
      z.clipY.value = -100;
      z.root.visible = true;
      z.path = [this.cryptOut.clone(), ...this.route(this.cryptOut, Math.floor(Math.random() * this.nodes.length))];
      z.idle = 0;
      return;
    }
    const l = pick(free);
    l.busy = z;
    l.want = 1;
    z.home = this.lids.indexOf(l);
    z.state = "rising";
    z.stateT = -1.3;
    z.root.position.set(l.center.x + 0.1, l.top - 2.1, l.center.z);
    z.clipY.value = l.top - 0.02;
    z.root.visible = true;
  }

  /** Time to go back: to its grave (or the nearest free one), or into the crypt. */
  private sendHome(z: Zombie) {
    let l = z.home >= 0 ? this.lids[z.home] : null;
    if (!l || (l.busy && l.busy !== z)) {
      const free = this.lids.filter((q) => !q.busy);
      l = free.sort((a, b) => a.center.distanceTo(z.root.position) - b.center.distanceTo(z.root.position))[0] ?? null;
    }
    if (!l || Math.random() < 0.3) {
      if (l?.busy === z) l.busy = null;
      z.home = -1;
      z.path = [...this.route(z.root.position, this.nearestNode(this.cryptOut)), this.cryptOut.clone(), this.cryptIn.clone()];
      return;
    }
    l.busy = z;
    z.home = this.lids.indexOf(l);
    const [ex, ez] = graveExit(l.grave);
    const exit = this.W(ex + 0.5, 0, ez);
    exit.y = this.worldGround(exit.x, exit.z);
    z.path = [...this.route(z.root.position, this.nearestNode(exit)), exit, l.center.clone().setY(this.worldGround(l.center.x, l.center.z))];
  }

  private nearestNode(p: THREE.Vector3) {
    let best = 0,
      bd = Infinity;
    this.nodes.forEach((n, i) => {
      const d = (n.x - p.x) ** 2 + (n.z - p.z) ** 2;
      if (d < bd) ((bd = d), (best = i));
    });
    return best;
  }

  private earth(at: THREE.Vector3) {
    const n = 40;
    const pos = new Float32Array(n * 3),
      v = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = at.x + rand(-0.4, 0.4);
      pos[i * 3 + 1] = at.y + 0.05;
      pos[i * 3 + 2] = at.z + rand(-0.7, 0.7);
      v[i * 3] = rand(-1.2, 1.2);
      v[i * 3 + 1] = rand(1.5, 3.6);
      v[i * 3 + 2] = rand(-1.2, 1.2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const p = new THREE.Points(g, new THREE.PointsMaterial({ color: "#4a3626", size: 0.09 }));
    this.group.add(p);
    this.dirt.push({ p, v, t: 0 });
  }

  private setNight(on: boolean) {
    this.night = on;
    for (const z of this.zombies) z.setNight(on);
    if (this.moon) this.moon.visible = on;
    for (const w of this.wisps) w.s.visible = on;
    if (this.mist) {
      this.mist.uniforms.density.value = on ? 0.62 : 0.12;
      this.mist.uniforms.color.value.set(on ? "#a8d0b8" : "#dfe6e2");
      const hi = this.mist.userData.high as THREE.ShaderMaterial;
      hi.uniforms.density.value = on ? 0.3 : 0.04;
      hi.uniforms.color.value.set(on ? "#98c8ac" : "#e6ece8");
    }
    if (this.signMat) {
      this.signMat.color.setRGB(on ? 0.9 : 1, on ? 1.45 : 1, on ? 1.0 : 1);
      (this.signMat.userData.back as THREE.MeshBasicMaterial).color.copy(this.signMat.color);
    }
  }

  update(dt: number, _t: number, cam: THREE.Camera, focus: THREE.Vector3, night: boolean, walking: boolean, wide: boolean) {
    if (!this.ok) return;
    this.time += dt;
    const viewer = walking ? cam.position : focus;
    const dist = Math.hypot(viewer.x - this.center.x, viewer.z - this.center.z);
    const ortho = cam as THREE.OrthographicCamera;
    const span = ortho.isOrthographicCamera ? (ortho.top - ortho.bottom) / ortho.zoom : 30;
    // close enough to care: within a couple of blocks, and not the whole-city map
    const near = !wide && dist < 140 + span * 0.4;
    if (!near && !this.built) return;
    if (!this.built) this.build();
    if (night !== this.night) this.setNight(night);
    // the whole-city map: the voxel cemetery is enough (no mist, crows or plates to draw)
    this.group.visible = !wide;
    this.zGroup.visible = near;
    if (this.epitaphs) this.epitaphs.visible = near && (walking || span < 120);
    if (this.mist) {
      this.mist.uniforms.t.value = this.time;
      (this.mist.userData.high as THREE.ShaderMaterial).uniforms.t.value = this.time;
    }
    if (near && !this.loading) void this.loadZombies();

    cam.getWorldQuaternion(this.camQuat);
    this.camRight.set(1, 0, 0).applyQuaternion(this.camQuat);
    const close = near && dist < 110;

    // ---- lids
    let lidsMoved = false;
    for (const l of this.lids) {
      const target = l.want;
      if (Math.abs(l.open - target) > 1e-3) {
        l.open += Math.sign(target - l.open) * Math.min(Math.abs(target - l.open), dt * 0.9);
        lidsMoved = true;
      }
    }
    if (lidsMoved) this.poseLids();

    // ---- earth flying out of the opened graves
    for (let i = this.dirt.length - 1; i >= 0; i--) {
      const d = this.dirt[i];
      d.t += dt;
      const a = d.p.geometry.attributes.position as THREE.BufferAttribute;
      for (let k = 0; k < a.count; k++) {
        d.v[k * 3 + 1] -= 9.8 * dt;
        a.setXYZ(k, a.getX(k) + d.v[k * 3] * dt, Math.max(this.O.y, a.getY(k) + d.v[k * 3 + 1] * dt), a.getZ(k) + d.v[k * 3 + 2] * dt);
      }
      a.needsUpdate = true;
      if (d.t > 1.6) {
        this.group.remove(d.p);
        d.p.geometry.dispose();
        (d.p.material as THREE.Material).dispose();
        this.dirt.splice(i, 1);
      }
    }

    // ---- how many should be out: more at night
    const target = night ? this.budget.night : this.budget.day;
    const out = this.zombies.filter((z) => z.state !== "buried").length;
    this.spawnIn -= dt;
    if (near && this.spawnIn <= 0 && out < target && this.pool.length) {
      this.spawn();
      this.spawnIn = night ? rand(4, 10) : rand(9, 20);
      // the first ones come quickly
      if (out < 2) this.spawnIn = rand(1.5, 3);
    }

    const me = walking ? cam.position : null;
    for (const z of this.zombies) {
      if (z.state === "buried") continue;
      const p = z.root.position;
      if (z.state === "rising") {
        z.stateT += dt;
        const l = this.lids[z.home];
        if (z.stateT > -0.6 && z.stateT - dt <= -0.6) this.earth(l.center.clone().setY(l.top));
        if (z.stateT > 0) {
          // up through the earth, shaking
          const k = Math.min(1, z.stateT / 3.2);
          p.y = l.top - 2.1 + (2.1 - 0.02 + 0.03) * (1 - (1 - k) * (1 - k));
          p.x = l.center.x + 0.1 + Math.sin(z.stateT * 40) * 0.03 * (1 - k);
          if (k >= 1) {
            z.state = "out";
            z.clipY.value = -100;
            const [ex, ez] = graveExit(l.grave);
            const exit = this.W(ex + 0.5 + rand(-0.4, 0.4), 0, ez);
            exit.y = this.worldGround(exit.x, exit.z);
            z.path = [exit];
            z.idle = rand(0.5, 2);
            if (close) z.say(pick(["Uuuuurgh...", "Braaains...", "Who... buried me... with my seed?", "Is it... the halving?"]), 3);
            // the lid slides back a while later
            setTimeout(() => {
              if (l.busy === z && z.state === "out") {
                l.busy = null;
                l.want = 0;
              }
            }, 9000);
          }
        }
        z.update(dt, this.camQuat, this.camRight, near, () => p.y);
        continue;
      }
      if (z.state === "sinking") {
        z.stateT += dt;
        const l = z.home >= 0 ? this.lids[z.home] : null;
        if (!l) {
          z.state = "buried";
          z.root.visible = false;
          continue;
        }
        const k = Math.min(1, z.stateT / 2.8);
        p.y = l.top - 2.1 * k * k;
        if (k >= 1) {
          z.state = "buried";
          z.root.visible = false;
          z.clipY.value = -100;
          l.busy = null;
          setTimeout(() => (l.want = 0), 1200);
        }
        z.update(dt, this.camQuat, this.camRight, near, () => p.y);
        continue;
      }
      // out and about
      z.lifeLeft -= dt;
      if (z.lifeLeft <= 0 && z.lifeLeft + dt > 0) this.sendHome(z);
      if (z.lifeLeft <= 0 && !z.walking) {
        // arrived home: into the grave, or through the crypt's door
        if (z.home >= 0) {
          const l = this.lids[z.home];
          l.want = 1;
          l.busy = z;
          if (l.open > 0.9) {
            z.state = "sinking";
            z.stateT = 0;
            z.clipY.value = l.top - 0.02;
            p.set(l.center.x + 0.1, l.top, l.center.z);
          }
        } else {
          z.state = "buried";
          z.root.visible = false;
        }
        z.update(dt, this.camQuat, this.camRight, near, this.worldGround);
        continue;
      }
      // the walker: they turn to you, some shuffle closer, and say so
      z.look = null;
      if (me && z.lifeLeft > 0) {
        const d = Math.hypot(me.x - p.x, me.z - p.z);
        if (d < 8) {
          z.look = me;
          if (d > 1.7 && !z.walking && Math.random() < dt * 0.6) z.path = [new THREE.Vector3(p.x + (me.x - p.x) * 0.5, 0, p.z + (me.z - p.z) * 0.5).setY(this.worldGround(p.x, p.z))];
          if (d < 3.5 && z.sayCool <= 0) {
            z.say(pick(["Braaains... I mean, private keys...", "Your seed phrase... give it...", "Fresh... keys...", "Are you... shielded?", "Show me... your viewing key..."]), 3);
            z.sayCool = rand(7, 12);
          }
        }
      }
      z.sayCool -= dt;
      if (!z.walking && z.lifeLeft > 0) {
        z.idle -= dt;
        if (z.idle <= 0) {
          z.path = this.route(p, Math.floor(Math.random() * this.nodes.length)).slice(0, 4);
          z.idle = rand(2, 7);
        }
      }
      z.update(dt, this.camQuat, this.camRight, close, this.worldGround);
    }

    // ---- groans in bubbles, where someone can read them
    this.talkIn -= dt;
    if (close && this.talkIn <= 0) {
      const outNow = this.zombies.filter((z) => z.state === "out" && z.sayCool <= 0);
      if (outNow.length) {
        const z = pick(outNow);
        const h = this.director.blockHeight;
        const line = Math.random() < 0.12 && h ? `Block ${h.toLocaleString("en-US")}... too late... for me...` : pick(ZOMBIE_LINES);
        z.say(line, 3.4);
        z.sayCool = rand(8, 16);
      }
      this.talkIn = night ? rand(3, 7) : rand(6, 12);
    }

    if (!near) return;
    // ---- crows
    const flap = Math.floor(this.time * 12) % 2 === 0;
    for (const c of this.crows) {
      c.next -= dt;
      const mat = c.m.material as THREE.MeshBasicMaterial;
      if (c.fly) {
        const f = c.fly;
        f.k = Math.min(1, f.k + dt / f.len);
        c.pos.lerpVectors(f.from, f.to, f.k);
        c.pos.y += Math.sin(f.k * Math.PI) * (2 + f.len);
        mat.map = (f.k > 0.92 ? this.crowFrames.perch : flap ? this.crowFrames.up : this.crowFrames.down).texture;
        if (f.k >= 1) {
          c.fly = null;
          c.perch = f.dest;
          c.next = rand(6, 22);
        }
      } else {
        const scared = (me && c.pos.distanceTo(me) < 4) || this.zombies.some((z) => z.state === "rising" && z.root.position.distanceTo(c.pos) < 6);
        if (c.next <= 0 || scared) {
          const dest = Math.floor(Math.random() * this.perches.length);
          const to = this.perches[dest].clone();
          if (this.crows.some((o) => o !== c && o.perch === dest)) to.x += rand(-0.3, 0.3);
          const len = Math.max(1.2, c.pos.distanceTo(to) / 7);
          c.facing = (to.x - c.pos.x) * this.camRight.x + (to.z - c.pos.z) * this.camRight.z >= 0 ? 1 : -1;
          c.fly = { from: c.pos.clone(), to, k: 0, len, dest };
        } else {
          c.caw -= dt;
          if (c.caw <= 0 && Math.random() < dt * 0.15) c.caw = 0.5;
          mat.map = (c.caw > 0 ? this.crowFrames.caw : this.crowFrames.perch).texture;
        }
      }
      c.m.position.copy(c.pos);
      c.m.quaternion.copy(this.camQuat);
      c.m.scale.set(c.facing, 1, 1);
    }
    // ---- wisps
    if (night)
      for (const w of this.wisps) {
        w.k += dt * w.speed;
        if (w.k >= 1) {
          w.k = 0;
          w.a.copy(w.b);
          w.b.copy(this.randomSpot());
        }
        const e = w.k * w.k * (3 - 2 * w.k);
        w.s.position.lerpVectors(w.a, w.b, e);
        w.s.position.y += Math.sin(this.time * 2.3 + w.speed * 100) * 0.25;
        const pulse = 0.45 + 0.2 * Math.sin(this.time * 5 + w.speed * 50);
        w.s.scale.setScalar(pulse);
      }
  }
}

/** A crow on the zkSNARKs' pixel grid: perched, cawing (beak open), wings up, wings down. */
function crow(pose: "perch" | "caw" | "up" | "down") {
  const body = "#141318",
    sheen = "#2a2f44",
    beak = "#2a2830",
    eye = "#c8c8c8";
  return sprite(12, 9, (px: Px) => {
    if (pose === "up" || pose === "down") {
      px(2, 4, 7, 2, body);
      px(8, 3, 2, 2, body);
      px(10, 4, 2, 1, beak);
      px(9, 3, 1, 1, eye);
      px(0, 4, 2, 1, body);
      px(0, 5, 1, 1, body);
      if (pose === "up") {
        px(3, 0, 2, 4, body);
        px(5, 1, 2, 3, sheen);
      } else {
        px(3, 6, 2, 3, body);
        px(5, 6, 2, 2, sheen);
      }
      return;
    }
    px(2, 3, 6, 4, body);
    px(3, 4, 3, 2, sheen);
    px(0, 5, 2, 2, body);
    px(7, 1, 3, 3, body);
    px(8, 2, 1, 1, eye);
    if (pose === "caw") {
      px(10, 1, 2, 1, beak);
      px(10, 3, 2, 1, beak);
    } else px(10, 2, 2, 1, beak);
    px(4, 7, 1, 2, "#3a3840");
    px(6, 7, 1, 2, "#3a3840");
  });
}
