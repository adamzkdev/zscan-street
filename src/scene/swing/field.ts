import * as THREE from "three";
import { PACK_GLSL, unpack } from "./pack";

/** The city seen from straight above: how high it stands at each cell (world metres). */
export interface HeightField {
  x0: number;
  z0: number;
  cell: number;
  size: number;
  h: Float32Array;
}

type Area = { x0: number; x1: number; z0: number; z1: number };

const VERTEX = `varying float vY;
  #include <batching_pars_vertex>
  void main(){ vec4 w = vec4(position, 1.);
  #include <batching_vertex>
  #ifdef USE_BATCHING
  w = batchingMatrix * w;
  #endif
  #ifdef USE_INSTANCING
  w = instanceMatrix * w;
  #endif
  w = modelMatrix * w; vY = w.y; gl_Position = projectionMatrix * viewMatrix * w; }`;
/** Heights from −64 m to 960 m, packed into the pixel's four bytes (pack.ts). */
const LOW = -64;
const SPAN = 1024;
const FRAGMENT = `varying float vY; ${PACK_GLSL} void main(){ gl_FragColor = packUnit((vY - (${LOW}.)) / ${SPAN}.); }`;

/**
 * The city's height field: the whole scene rendered from above, each pixel the
 * height of the highest surface there (about a metre a pixel). What a line holds and what a body
 * lands on. Built from what is drawn, so the batched buildings (whose vertices live on the GPU only)
 * are in it like everything else. Left out: light (sprites, points, lines, additive glows), the huge
 * planes (sky, sea), anything marked `userData.noField`, and whatever moves, which would leave walls
 * in the air once gone: `hide()` (people, cars, trams, the blimp), and anything seen moving since
 * `watch()` (the wheel's capsules, birds, helicopters, crowds of instances).
 *
 * `prepare()` makes it without a stall: the shader variants it needs compile in parallel first
 * (KHR_parallel_shader_compile), the picture is read back asynchronously. `now()` makes it at once.
 */
export class FieldBuilder {
  private material = new THREE.ShaderMaterial({ side: THREE.DoubleSide, vertexShader: VERTEX, fragmentShader: FRAGMENT });
  private size: number;
  private half: number;
  private cx: number;
  private cz: number;
  private top: THREE.OrthographicCamera;
  private pending: Promise<HeightField> | null = null;
  /** Where every mesh stood when `watch()` was called (its world matrix, or its instances' version). */
  private seen = new Map<THREE.Object3D, Float32Array | number>();

  /** What a pixel with nothing drawn reads as (the swing: the ground, 0; the game: NaN). */
  private empty: number;

  constructor(
    private renderer: THREE.WebGLRenderer,
    private scene: THREE.Scene,
    area: Area,
    private hide: () => THREE.Object3D[],
    /** A finer picture (`size` pixels a side), only what is between `band` heights (world m), an `empty` value. */
    opts: { size?: number; band?: [number, number]; empty?: number; shear?: number } = {},
  ) {
    const w = Math.max(area.x1 - area.x0, area.z1 - area.z0);
    // (a metre or so a pixel, no finer: reading it back is the slow part)
    this.size = opts.size ?? Math.min(1024, Math.ceil(w));
    this.empty = opts.empty ?? 0;
    this.half = w / 2;
    this.cx = (area.x0 + area.x1) / 2;
    this.cz = (area.z0 + area.z1) / 2;
    const h = this.half;
    const band = opts.band;
    // a band: the camera just over its top, the far plane at its bottom
    this.top = new THREE.OrthographicCamera(-h, h, h, -h, band ? 0.5 : 1, band ? 0.5 + band[1] - band[0] : 1400);
    this.top.position.set(this.cx, band ? band[1] + 0.5 : 900, this.cz);
    this.top.up.set(0, 0, -1);
    this.top.lookAt(this.cx, 0, this.cz);
    this.top.updateMatrixWorld();
    // A slant (the game's collisions): seen straight down a wall has no width and draws nothing;
    // sheared a little along the diagonal, every wall shows as a thin strip, the ground stays put.
    if (opts.shear) {
      const a = opts.shear,
        y = this.top.position.y;
      const S = new THREE.Matrix4().set(1, 0, a, a * y, 0, 1, -a, -a * y, 0, 0, 1, 0, 0, 0, 0, 1);
      this.top.projectionMatrix.multiply(S);
      this.top.projectionMatrixInverse.copy(this.top.projectionMatrix).invert();
    }
  }

  /** Note where everything stands now: whatever has moved by the time the field is drawn is left out. */
  watch() {
    this.seen.clear();
    // (current matrices: one only just shown or made would else read as a move)
    this.scene.updateMatrixWorld();
    this.scene.traverseVisible((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      this.seen.set(o, Float32Array.from(o.matrixWorld.elements));
      const v = this.instances(o);
      if (v !== null) this.seen.set(o, v);
    });
  }

  /** For instances and batches: the version of their matrices (they move inside one object). */
  private instances(o: THREE.Object3D): number | null {
    const im = o as THREE.InstancedMesh;
    if (im.isInstancedMesh) return im.instanceMatrix.version;
    const bm = o as THREE.BatchedMesh & { _matricesTexture?: THREE.DataTexture | null };
    if (bm.isBatchedMesh) return bm._matricesTexture?.version ?? null;
    return null;
  }

  private moved(o: THREE.Object3D) {
    const was = this.seen.get(o);
    if (was === undefined) return false;
    if (typeof was === "number") return this.instances(o) !== was;
    const e = o.matrixWorld.elements;
    for (let i = 0; i < 16; i++) if (Math.abs(e[i] - was[i]) > 1e-4) return true;
    return false;
  }

  private target() {
    return new THREE.WebGLRenderTarget(this.size, this.size, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true, generateMipmaps: false });
  }

  /** The scene with only what belongs in the field shown, for `fn`; everything put back after. */
  private staged<T>(fn: (rt: THREE.WebGLRenderTarget) => T): T {
    const { renderer, scene } = this;
    const hidden: THREE.Object3D[] = [];
    const out = (o: THREE.Object3D | null | undefined) => {
      if (o?.visible) (o.visible = false), hidden.push(o);
    };
    scene.traverse((o) => {
      if (!o.visible) return;
      if (o.userData.noField || this.moved(o)) return out(o);
      const m = o as THREE.Mesh;
      const mat = (Array.isArray(m.material) ? m.material[0] : m.material) as THREE.Material | undefined;
      // (a batch's vertices may be on the GPU only; it knows its own bounds)
      const huge =
        !!m.geometry && !(o as THREE.BatchedMesh).isBatchedMesh && !!m.geometry.attributes.position?.array.length && (m.geometry.boundingSphere ?? (m.geometry.computeBoundingSphere(), m.geometry.boundingSphere))!.radius > 700;
      // (glass stops a body and holds a line; light does not)
      const light = !!mat && mat.transparent && mat.blending !== THREE.NormalBlending;
      if ((o as THREE.Sprite).isSprite || (o as THREE.Points).isPoints || (o as THREE.Line).isLine || (m.isMesh && (!mat || light || huge))) out(o);
    });
    for (const o of this.hide()) out(o);
    const was = { o: scene.overrideMaterial, b: scene.background, f: scene.fog, c: renderer.getClearColor(new THREE.Color()), a: renderer.getClearAlpha(), rt: renderer.getRenderTarget(), shadows: renderer.shadowMap.autoUpdate };
    const rt = this.target();
    scene.overrideMaterial = this.material;
    scene.background = null;
    scene.fog = null;
    renderer.shadowMap.autoUpdate = false;
    renderer.setClearColor(0, 0);
    try {
      return fn(rt);
    } finally {
      renderer.setRenderTarget(was.rt);
      renderer.setClearColor(was.c, was.a);
      renderer.shadowMap.autoUpdate = was.shadows;
      scene.overrideMaterial = was.o;
      scene.background = was.b;
      scene.fog = was.f;
      for (const o of hidden) o.visible = true;
    }
  }

  private draw(rt: THREE.WebGLRenderTarget) {
    this.renderer.setRenderTarget(rt);
    this.renderer.clear();
    this.renderer.render(this.scene, this.top);
  }

  private field(px: Uint8Array): HeightField {
    const size = this.size;
    const h = new Float32Array(size * size);
    // (the bottom row of the picture is the far side of the map; nothing drawn: the ground, 0)
    for (let j = 0; j < size; j++)
      for (let i = 0; i < size; i++) {
        const k = ((size - 1 - j) * size + i) * 4;
        h[j * size + i] = px[k] | px[k + 1] | px[k + 2] | px[k + 3] ? unpack(px, k) * SPAN + LOW : this.empty;
      }
    return { x0: this.cx - this.half, z0: this.cz - this.half, cell: (2 * this.half) / this.size, size, h };
  }

  /** At once (a throw before the prepared one is in). */
  now(): HeightField {
    const px = new Uint8Array(this.size * this.size * 4);
    let rt: THREE.WebGLRenderTarget | null = null;
    try {
      this.staged((target) => {
        rt = target;
        this.draw(target);
        this.renderer.readRenderTargetPixels(target, 0, 0, this.size, this.size, px);
      });
    } finally {
      (rt as THREE.WebGLRenderTarget | null)?.dispose();
    }
    return this.field(px);
  }

  /** Without a stall: the shaders compiled in parallel, the drawing read back a few frames later. */
  prepare(): Promise<HeightField> {
    return (this.pending ??= this.compile()
      .then(() => {
        const px = new Uint8Array(this.size * this.size * 4);
        let rt: THREE.WebGLRenderTarget | null = null;
        const read = this.staged((target) => {
          rt = target;
          this.draw(target);
          return this.renderer.readRenderTargetPixelsAsync(target, 0, 0, this.size, this.size, px);
        });
        return read.then(
          () => this.field(px),
          (e) => {
            throw e;
          },
        ).finally(() => (rt as THREE.WebGLRenderTarget | null)?.dispose());
      })
      .catch((e) => {
        this.pending = null;
        throw e;
      }));
  }

  /**
   * The field's shader in every variant the city will ask of it (plain, instanced, batched, with
   * their colours, receiving shadows or not), compiled in parallel on stand-ins before the one
   * drawing: else the first drawing links them one by one, a long stall on a phone.
   */
  private compile(): Promise<void> {
    const { renderer, scene } = this;
    const seen = new Map<string, THREE.Object3D>();
    const box = new THREE.BoxGeometry(0.1, 0.1, 0.1);
    scene.traverseVisible((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || (o as THREE.Sprite).isSprite) return;
      const im = o as THREE.InstancedMesh;
      const bm = o as THREE.BatchedMesh & { _colorsTexture?: THREE.Texture | null };
      const kind = bm.isBatchedMesh ? "b" : im.isInstancedMesh ? "i" : "m";
      const colour = bm.isBatchedMesh ? !!bm._colorsTexture : im.isInstancedMesh ? !!im.instanceColor : false;
      const key = `${kind}${colour ? "c" : ""}${o.receiveShadow ? "r" : ""}${o.castShadow ? "s" : ""}`;
      if (seen.has(key)) return;
      let proxy: THREE.Mesh;
      if (kind === "b") {
        const b = new THREE.BatchedMesh(1, 24, 36, this.material);
        b.addInstance(b.addGeometry(box));
        if (colour) b.setColorAt(0, new THREE.Color());
        proxy = b as unknown as THREE.Mesh;
      } else if (kind === "i") {
        const i = new THREE.InstancedMesh(box, this.material, 1);
        if (colour) i.setColorAt(0, new THREE.Color());
        proxy = i;
      } else proxy = new THREE.Mesh(box, this.material);
      proxy.receiveShadow = o.receiveShadow;
      proxy.castShadow = o.castShadow;
      seen.set(key, proxy);
    });
    const stand = new THREE.Group();
    for (const p of seen.values()) stand.add(p);
    const was = renderer.getRenderTarget();
    const rt = this.target();
    // (compiled for a target, as it will be drawn: no tone mapping, linear output)
    renderer.setRenderTarget(rt);
    let ready: Promise<unknown>;
    try {
      ready = renderer.compileAsync(stand, this.top, scene);
    } finally {
      renderer.setRenderTarget(was);
    }
    return ready.finally(() => {
      rt.dispose();
      box.dispose();
      for (const p of seen.values()) if ((p as unknown as THREE.BatchedMesh).isBatchedMesh) (p as unknown as THREE.BatchedMesh).dispose();
    }) as Promise<void>;
  }
}
