import * as THREE from "three";
import { TOUCH } from "../../scene/quality";
import { type Work, workImage } from "./fedosart";

/**
 * The FedosArt Planetarium's show. The dome is a night sky (nebulae, three layers of stars) that
 * becomes a screen: one after another his works bloom across it out of the clouds, a violet front
 * burning in, drift and grow slowly for a while, and burn away again into stars. A click on a work
 * sends it up there at once. A warp (stars streaking out from a point, hyperspace) crosses the sky
 * when you come through the portal. Round the foot of the dome an LED ticker names what is up, and
 * the projector throws three cones of light at it, all in the work's own colour.
 */

const SPAN = 1.62;
const IN = 3.6,
  HOLD = 17,
  OUT = 3.2,
  GAP = 3.4;

/** A work's image as a texture, and its average colour, loaded once. */
const cache = new Map<string, Promise<{ tex: THREE.Texture; color: THREE.Color }>>();
export function workTexture(w: Work) {
  return imageTexture(w.slug, workImage(w));
}

/** Any painting by URL as a texture, and its average colour, loaded once (other origins: CORS). */
export function imageTexture(key: string, url: string) {
  let p = cache.get(key);
  if (!p) {
    p = new Promise((res, rej) => {
      const im = new Image();
      im.decoding = "async";
      if (/^https?:/.test(url) && !url.startsWith(location.origin)) im.crossOrigin = "anonymous";
      im.onload = () => {
        const tex = new THREE.Texture(im);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 8;
        tex.needsUpdate = true;
        // its colour: the mean of a tiny copy, pushed brighter and more saturated (a light, not a paint)
        const c = document.createElement("canvas");
        c.width = c.height = 8;
        const g = c.getContext("2d", { willReadFrequently: true })!;
        g.drawImage(im, 0, 0, 8, 8);
        const d = g.getImageData(0, 0, 8, 8).data;
        let r = 0,
          gg = 0,
          b = 0;
        for (let i = 0; i < 64; i++) {
          r += d[i * 4];
          gg += d[i * 4 + 1];
          b += d[i * 4 + 2];
        }
        const color = new THREE.Color().setRGB(r / 64 / 255, gg / 64 / 255, b / 64 / 255, THREE.SRGBColorSpace);
        const hsl = { h: 0, s: 0, l: 0 };
        color.getHSL(hsl);
        color.setHSL(hsl.h, Math.min(1, hsl.s * 1.6 + 0.15), 0.55);
        res({ tex, color });
      };
      im.onerror = () => {
        cache.delete(key);
        rej(new Error(`no image ${key}`));
      };
      im.src = url;
    });
    cache.set(key, p);
  }
  return p;
}

type Phase = "sky" | "in" | "hold" | "out";

export class DomeShow {
  readonly material: THREE.ShaderMaterial;
  /** What is in the sky (or coming), its colour, how far it is shown (0…1). */
  current: Work | null = null;
  readonly color = new THREE.Color("#7a6cff");
  reveal = 0;
  private phase: Phase = "sky";
  private t = 0;
  private queue: Work[];
  private next = 0;
  private wanted: Work | null = null;
  private warpT = -1;
  private loading = false;
  /** How fast the work on show goes when another is asked for. */
  private fast = 1;
  private blank = new THREE.Texture();
  /** The point the work is centred on and the warp's focus, in the room's frame (the dome turns). */
  readonly centre = new THREE.Vector3(0, Math.sin(0.98), -Math.cos(0.98)).normalize();
  readonly right = new THREE.Vector3(1, 0, 0);
  private readonly up = new THREE.Vector3();
  private readonly focus = new THREE.Vector3(0, Math.sin(0.5), -Math.cos(0.5)).normalize();
  private readonly Y = new THREE.Vector3(0, 1, 0);
  /** Told when a work starts to bloom (the music, the room's colour, the ticker). */
  onWork?: (w: Work) => void;
  onWarp?: () => void;

  constructor(order: Work[]) {
    this.queue = order;
    this.up.copy(this.Y).addScaledVector(this.centre, -this.Y.dot(this.centre)).normalize();
    this.right.crossVectors(this.centre, this.up).normalize();
    this.material = new THREE.ShaderMaterial({
      vertexShader: DOME_VERT,
      fragmentShader: (TOUCH ? "#define OCT 4\n" : "#define OCT 5\n") + DOME_FRAG,
      uniforms: {
        uTime: { value: 0 },
        uArt: { value: this.blank },
        uShow: { value: 0 },
        uSpan: { value: new THREE.Vector2(SPAN * 0.75, SPAN) },
        uPan: { value: new THREE.Vector2() },
        uZoom: { value: 1 },
        uC: { value: new THREE.Vector3() },
        uR: { value: new THREE.Vector3() },
        uU: { value: new THREE.Vector3() },
        uWarp: { value: 0 },
        uWarpF: { value: new THREE.Vector3() },
        uRim: { value: new THREE.Color() },
      },
      side: THREE.BackSide,
    });
  }

  /** Put this work up now (the one up goes first, quickly). */
  play(w: Work) {
    this.wanted = w;
    if (this.phase === "in" || this.phase === "hold" || this.phase === "out") {
      this.phase = "out";
      this.t = OUT * (1 - Math.min(1, this.reveal));
      this.fast = 2.6;
    }
  }

  /** The stars streak out from a point ahead: hyperspace (2.6 s). */
  warp() {
    this.warpT = 0;
    this.onWarp?.();
  }

  /** A work is coming, up, or going. */
  get on() {
    return this.phase !== "sky" || this.loading;
  }

  /** Back to an empty sky, the show starting over after `delay` s (arriving on the floor). */
  reset(delay = GAP) {
    this.phase = "sky";
    this.t = GAP - delay;
    this.reveal = 0;
    this.warpT = -1;
  }

  update(dt: number, t: number, domeYaw: number) {
    const u = this.material.uniforms;
    u.uTime.value = t;
    // the frame the shader works in turns with the dome: hold the work and the focus still
    (u.uC.value as THREE.Vector3).copy(this.centre).applyAxisAngle(this.Y, -domeYaw);
    (u.uR.value as THREE.Vector3).copy(this.right).applyAxisAngle(this.Y, -domeYaw);
    (u.uU.value as THREE.Vector3).copy(this.up).applyAxisAngle(this.Y, -domeYaw);
    (u.uWarpF.value as THREE.Vector3).copy(this.focus).applyAxisAngle(this.Y, -domeYaw);
    // the warp: up fast, a long streak, out
    if (this.warpT >= 0) {
      this.warpT += dt;
      const w = this.warpT;
      u.uWarp.value = w < 0.5 ? (w / 0.5) ** 2 : w < 1.7 ? 1 : Math.max(0, 1 - (w - 1.7) / 0.9);
      if (w > 2.6) this.warpT = -1;
    } else u.uWarp.value = 0;

    this.t += dt * this.fast;
    switch (this.phase) {
      case "sky":
        this.reveal = 0;
        if ((this.t >= GAP || (this.wanted && this.t >= 0.5)) && !this.loading) this.load();
        break;
      case "in":
        this.reveal = Math.min(1, this.t / IN);
        if (this.t >= IN) this.go("hold");
        break;
      case "hold":
        this.reveal = 1;
        if (this.t >= HOLD) this.go("out");
        break;
      case "out":
        this.reveal = Math.max(0, 1 - this.t / OUT);
        if (this.t >= OUT) this.go("sky");
        break;
    }
    u.uShow.value = this.reveal;
    // a slow drift and growth over the whole time it is up
    const life = this.phase === "in" ? this.t : this.phase === "hold" ? IN + this.t : this.phase === "out" ? IN + HOLD + this.t : 0;
    const k = life / (IN + HOLD + OUT);
    u.uZoom.value = 1 + k * 0.14;
    (u.uPan.value as THREE.Vector2).set((k - 0.5) * 0.05, (k - 0.5) * 0.03);
    (u.uRim.value as THREE.Color).copy(this.color).lerp(new THREE.Color("#c8b8ff"), 0.5);
  }

  private go(p: Phase) {
    this.phase = p;
    this.t = 0;
    this.fast = 1;
  }

  private load() {
    const w = this.wanted ?? this.queue[this.next++ % this.queue.length];
    this.wanted = null;
    this.loading = true;
    void workTexture(w)
      .then(({ tex, color }) => {
        const u = this.material.uniforms;
        u.uArt.value = tex;
        const a = w.w / w.h;
        // tall works keep the span high; wide ones spread, kept under ~150°
        const h = a > 1 ? Math.min(SPAN, 2.6 / a) : SPAN;
        (u.uSpan.value as THREE.Vector2).set(h * a, h);
        this.current = w;
        this.color.copy(color);
        this.go("in");
        this.onWork?.(w);
      })
      .catch(() => this.go("sky"))
      .finally(() => (this.loading = false));
  }
}

/** The projector's three cones of light, from its head to the work in the sky. */
export function beams(from: THREE.Vector3, to: THREE.Vector3[], color: THREE.Color) {
  const grp = new THREE.Group();
  const mat = new THREE.ShaderMaterial({
    vertexShader: BEAM_VERT,
    fragmentShader: BEAM_FRAG,
    uniforms: { uK: { value: 0 }, uColor: { value: color }, uTime: { value: 0 } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  for (const p of to) {
    const len = from.distanceTo(p);
    const geo = new THREE.CylinderGeometry(len * 0.16, 0.06, 1, 28, 1, true).translate(0, 0.5, 0);
    const m = new THREE.Mesh(geo, mat);
    m.position.copy(from);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), p.clone().sub(from).normalize());
    m.scale.set(1, len, 1);
    m.raycast = () => {};
    m.renderOrder = 4;
    grp.add(m);
  }
  return { group: grp, material: mat };
}

/** The ticker round the foot of the dome: a band of LED text that runs (redrawn per work). */
export function ticker(radius: number, height: number) {
  const W = TOUCH ? 2048 : 4096,
    H = 64;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  // seen from inside, the band's texture runs backwards: mirror it
  tex.repeat.x = -1;
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, height, 128, 1, true),
    new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, toneMapped: false, color: new THREE.Color(1.35, 1.3, 1.4) }),
  );
  mesh.raycast = () => {};
  const draw = (title: string, accent: string) => {
    const g = c.getContext("2d")!;
    g.fillStyle = "#07060b";
    g.fillRect(0, 0, W, H);
    g.font = `400 ${TOUCH ? 30 : 40}px "DotGothic16", monospace`;
    g.textBaseline = "middle";
    const name = `${title.toUpperCase()}   `;
    const by = "FEDOSART      ";
    const pw = g.measureText(`✦  ${name}✦  ${by}`).width;
    // as many repeats as fit, spread evenly so the band closes on itself
    const n = Math.max(1, Math.floor(W / pw));
    const step = W / n;
    for (let i = 0; i < n; i++) {
      let x = i * step;
      for (const [txt, col] of [
        ["✦  ", accent],
        [name, "#ffb26a"],
        ["✦  ", accent],
        [by, "#a69cd0"],
      ]) {
        g.fillStyle = col;
        g.fillText(txt, x, H / 2);
        x += g.measureText(txt).width;
      }
    }
    // the dark grid between the LEDs
    g.fillStyle = "rgba(7,6,11,0.55)";
    for (let y = 0; y < H; y += 4) g.fillRect(0, y, W, 1);
    for (let x = 0; x < W; x += 4) g.fillRect(x, 0, 1, H);
    tex.needsUpdate = true;
  };
  return { mesh, tex, draw };
}

// ---- shaders -------------------------------------------------------------------------------------------

const DOME_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const DOME_FRAG = /* glsl */ `
uniform float uTime;
uniform sampler2D uArt;
uniform float uShow;
uniform vec2 uSpan;
uniform vec2 uPan;
uniform float uZoom;
uniform vec3 uC;
uniform vec3 uR;
uniform vec3 uU;
uniform float uWarp;
uniform vec3 uWarpF;
uniform vec3 uRim;
varying vec3 vDir;
float h3(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.yzx + 33.33); return fract((p.x + p.y) * p.z); }
float n3(vec3 x) {
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h3(i), h3(i + vec3(1, 0, 0)), f.x), mix(h3(i + vec3(0, 1, 0)), h3(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(h3(i + vec3(0, 0, 1)), h3(i + vec3(1, 0, 1)), f.x), mix(h3(i + vec3(0, 1, 1)), h3(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float fbm(vec3 p) { float s = 0.0, a = 0.5; for (int i = 0; i < OCT; i++) { s += a * n3(p); p = p * 2.07 + 11.3; a *= 0.5; } return s; }
float stars(vec3 d, float scale, float thresh, float size) {
  vec3 p = d * scale; vec3 id = floor(p); vec3 f = fract(p) - 0.5;
  float r = h3(id);
  if (r < thresh) return 0.0;
  vec3 o = vec3(h3(id + 3.1), h3(id + 7.7), h3(id + 1.9)) - 0.5;
  float dd = length(f - o * 0.7);
  float tw = 0.6 + 0.4 * sin(uTime * (0.8 + r * 3.0) + r * 60.0);
  return smoothstep(size, 0.0, dd) * tw * ((r - thresh) / (1.0 - thresh) * 0.7 + 0.3);
}
void main() {
  vec3 d = normalize(vDir);
  float h = max(d.y, 0.0);
  // the night: a wine-dark horizon going up to near black
  vec3 col = mix(vec3(0.05, 0.010, 0.032), vec3(0.003, 0.003, 0.012), smoothstep(0.0, 0.6, h));
  // nebulae: his violet and his crimson
  float n = fbm(d * 2.4);
  float m = fbm(d * 5.0 + 4.0);
  float vio = smoothstep(0.48, 0.82, n);
  float red = smoothstep(0.52, 0.86, fbm(d * 1.7 + 17.0));
  col += vec3(0.20, 0.13, 0.62) * vio * (0.3 + 0.7 * m) * 0.5;
  col += vec3(0.55, 0.05, 0.10) * red * (0.3 + 0.7 * m) * 0.35;
  float b = dot(d, normalize(vec3(0.42, 0.35, 0.84)));
  float band = exp(-b * b * 14.0) * (0.35 + 0.65 * smoothstep(0.35, 0.75, m));
  col += vec3(0.32, 0.30, 0.55) * band * 0.22;
  float s = stars(d, 70.0, 0.86, 0.2) * 1.6 + stars(d, 160.0, 0.82, 0.22) * 0.7 + stars(d, 300.0, 0.8, 0.25) * 0.35;
  s *= 0.6 + 0.6 * band + 0.3 * vio;
  // ---- the work, projected round the point uC (azimuthal: true angles from the centre outward)
  if (uShow > 0.001) {
    float th = acos(clamp(dot(d, uC), -1.0, 1.0));
    vec2 t2 = vec2(dot(d, uR), dot(d, uU));
    float l = length(t2);
    vec2 p = l > 1e-5 ? t2 / l * th : vec2(0.0);
    vec2 uv = p / uSpan + 0.5;
    vec2 suv = (uv - 0.5) / uZoom + 0.5 + uPan;
    vec3 art = texture2D(uArt, clamp(suv, 0.0, 1.0)).rgb;
    float vig = smoothstep(0.0, 0.14, uv.x) * smoothstep(1.0, 0.86, uv.x) * smoothstep(0.0, 0.12, uv.y) * smoothstep(1.0, 0.88, uv.y);
    // it burns in (and away) along a cloudy front, the edges last
    float nz = fbm(d * 3.2 + 2.0) * 0.62 + (1.0 - vig) * 0.38;
    float front = uShow * 1.3 - 0.12;
    float mk = smoothstep(front + 0.02, front - 0.07, nz) * vig;
    float edge = (1.0 - smoothstep(0.0, 0.05, abs(nz - front))) * step(0.02, vig) * (1.0 - step(0.999, uShow));
    col = mix(col, art * 1.35, mk);
    col += uRim * edge * 1.6;
    s *= 1.0 - mk * 0.7;
  }
  col += vec3(0.85, 0.88, 1.0) * s;
  // ---- the warp: hyperspace, streaks of light rushing out from the focus along their rays
  if (uWarp > 0.001) {
    float rho = acos(clamp(dot(d, uWarpF), -1.0, 1.0));
    vec3 ax = normalize(cross(uWarpF, vec3(0.0, 1.0, 0.0)));
    vec3 ay = cross(ax, uWarpF);
    float phi = atan(dot(d, ay), dot(d, ax));
    float acc = 0.0;
    for (int layer = 0; layer < 2; layer++) {
      float N = layer == 0 ? 210.0 : 330.0;
      float fi = (phi / 6.2831853 + 0.5) * N;
      float id = floor(fi);
      float fr = fract(fi) - 0.5;
      float r1 = h3(vec3(id, 1.7 + float(layer) * 9.1, 3.1));
      float r2 = h3(vec3(id, 5.3, 0.7 + float(layer) * 4.3));
      if (r1 < 0.3) continue;
      float head = fract(r2 + uTime * (0.35 + r1 * 0.9)) * 2.4;
      float len = (0.12 + r1 * 0.5) * uWarp;
      float seg = smoothstep(head - len, head, rho) * (1.0 - smoothstep(head, head + 0.015, rho));
      float w = clamp(0.0035 / (rho * 6.2831853 / N + 1e-4), 0.03, 0.5);
      acc += (1.0 - smoothstep(w * 0.4, w, abs(fr))) * seg * (0.5 + r1);
    }
    col += mix(vec3(0.62, 0.5, 1.0), vec3(0.95, 0.95, 1.0), smoothstep(0.2, 1.2, rho)) * acc * uWarp * 1.7;
    float fo = max(dot(d, uWarpF), 0.0);
    col += vec3(0.55, 0.42, 1.0) * (pow(fo, 30.0) * 2.4 + pow(fo, 5.0) * 0.22) * uWarp;
  }
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

const BEAM_VERT = /* glsl */ `
varying float vY;
varying vec3 vN;
varying vec3 vV;
void main() {
  vY = position.y;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vN = normalize(mat3(modelMatrix) * normal);
  vV = normalize(cameraPosition - wp.xyz);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const BEAM_FRAG = /* glsl */ `
uniform float uK;
uniform vec3 uColor;
varying float vY;
varying vec3 vN;
varying vec3 vV;
void main() {
  float face = abs(dot(normalize(vN), normalize(vV)));
  float a = uK * pow(1.0 - vY, 1.3) * smoothstep(0.0, 0.04, vY) * (0.15 + 0.85 * face * face) * 0.11;
  gl_FragColor = vec4(uColor, a);
}`;
