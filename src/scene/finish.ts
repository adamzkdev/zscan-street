import * as THREE from "three";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { FullScreenQuad, Pass } from "three/examples/jsm/postprocessing/Pass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { generateMagicSquareNoise, GTAOShader } from "three/examples/jsm/shaders/GTAOShader.js";
import { generatePdSamplePointInitializer, PoissonDenoiseShader } from "three/examples/jsm/shaders/PoissonDenoiseShader.js";
import { encodeGloss, SSRShader } from "./ssr";

encodeGloss();

/**
 * The finish of every frame, city and places alike: multisampled HDR buffers (the canvas's own
 * antialias is lost as soon as a composer draws into its own targets), ambient occlusion read
 * from the depth the scene pass already wrote, screen-space curvature, and a light colour grade.
 */

/**
 * The scene pass: draws into its own multisampled HDR target with a depth texture (the composer's
 * own buffers stay single-sampled, so the post passes after it never pay for a resolve). The
 * finish pass reads its colour and depth.
 */
export class ScenePass extends RenderPass {
  readonly rt: THREE.WebGLRenderTarget;
  constructor(scene: THREE.Scene, camera: THREE.Camera, samples: number) {
    super(scene, camera);
    this.rt = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, samples, depthTexture: new THREE.DepthTexture(2, 2, THREE.FloatType) });
  }
  setSamples(samples: number) {
    if (this.rt.samples === samples) return;
    this.rt.samples = samples;
    this.rt.dispose();
  }
  override setSize(width: number, height: number) {
    this.rt.setSize(width, height);
  }
  override render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, _readBuffer: THREE.WebGLRenderTarget, dt?: number, mask?: boolean) {
    super.render(renderer, writeBuffer, this.rt, dt ?? 0, mask ?? false);
  }
}

function noiseTexture(size = 64) {
  const data = new Uint8Array(size * size * 4);
  let s = 0x2f6b9a1;
  for (let i = 0; i < data.length; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    data[i] = s >>> 24;
  }
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.needsUpdate = true;
  return t;
}

const WHITE = (() => {
  const t = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  t.needsUpdate = true;
  return t;
})();

const FINISH = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    tAO: { value: WHITE as THREE.Texture },
    aoAmount: { value: 0 },
    showAO: { value: 0 },
    tDepth: { value: null as THREE.Texture | null },
    cavity: { value: 0 },
    cavPersp: { value: 1 },
    cavNear: { value: 0.1 },
    cavFar: { value: 1000 },
    cavScale: { value: 1 },
    texel: { value: new THREE.Vector2(1, 1) },
    tSSR: { value: null as THREE.Texture | null },
    ssrOn: { value: 0 },
    ssrTexel: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
  fragmentShader: `
    uniform sampler2D tDiffuse, tAO; uniform float aoAmount;
    uniform float showAO;
    uniform sampler2D tSSR; uniform float ssrOn; uniform vec2 ssrTexel;
    uniform highp sampler2D tDepth; uniform float cavity, cavPersp, cavNear, cavFar, cavScale; uniform vec2 texel;
    varying vec2 vUv;
    float lin(vec2 uv){
      float d = texture2D(tDepth, uv).r;
      return cavPersp > 0.5 ? (cavNear * cavFar) / ((cavFar - cavNear) * d - cavFar) * -1.0 : cavNear + d * (cavFar - cavNear);
    }
    // Screen-space curvature: ridges catch the light, creases go dark (a bevel on every voxel edge
    // and on every piece of furniture, without touching the geometry). Planes give zero: 1/z is
    // affine across the screen in perspective, z itself in orthographic.
    // Rounded edges: how far the surface at this pixel stands out of (or sinks into) the plane
    // through its neighbours a few centimetres away, in units of that distance. A plane gives 0
    // at any slope (1/z is affine across the screen in perspective, z in orthographic); along a
    // convex voxel edge it rises to about 0.5 over a band as wide as the bevel, which reads as a
    // rounded corner catching the light; a crease gives the opposite.
    float plane(float a, float b) {
      return cavPersp > 0.5 ? 2.0 / (1.0 / a + 1.0 / b) : 0.5 * (a + b);
    }
    float axisK(float c, vec2 o, float R) {
      float a = lin(vUv - o), b = lin(vUv + o);
      float k = (plane(a, b) - c) / R;
      // a silhouette, not a fold: leave it alone
      return k * (1.0 - smoothstep(0.9, 1.6, abs(k)));
    }
    float curvature(){
      float c = lin(vUv);
      if (c > cavFar * 0.98) return 0.0;
      // metres per pixel at this depth, and the bevel in pixels
      float mpp = cavPersp > 0.5 ? c * cavScale : cavScale;
      float R = 0.05;
      float px = clamp(R / mpp, 1.0, 16.0);
      float Rm = px * mpp;
      float k = 0.0;
      for (int i = 1; i <= 2; i++) {
        float f = float(i) * 0.5;
        vec2 ox = vec2(texel.x * px * f, 0.0), oy = vec2(0.0, texel.y * px * f);
        k += axisK(c, ox, Rm * f) + axisK(c, oy, Rm * f);
      }
      k *= 0.5;
      // far away a voxel is a pixel or two: the effect hands over to the AO
      return clamp(k, -1.0, 1.0) * (1.0 - smoothstep(50.0, 120.0, c));
    }
    void main(){
      vec4 t = texture2D(tDiffuse, vUv);
      vec3 c = max(t.rgb, vec3(0.0));
      float l0 = dot(c, vec3(0.2126, 0.7152, 0.0722));
      if (cavity > 0.0) {
        float k = curvature();
        // (a ridge brightens, but never pushes a near-white into the bloom)
        c *= 1.0 + cavity * (k > 0.0 ? k * 1.1 * (1.0 - smoothstep(0.5, 0.9, l0)) : k * 0.9);
      }
      // occlusion darkens what is lit by the sky, not the lights themselves (neon, windows)
      float ao = texture2D(tAO, vUv).r;
      c *= mix(1.0, ao, aoAmount * (1.0 - smoothstep(1.2, 3.0, l0)));
      if (ssrOn > 0.5) {
        // the reflections, softened a little (they were traced at a fraction of the resolution)
        // (and drawn out vertically, the way reflections streak on wet ground)
        vec4 r = texture2D(tSSR, vUv) * 0.24;
        r += (texture2D(tSSR, vUv + vec2(ssrTexel.x, 0.0)) + texture2D(tSSR, vUv - vec2(ssrTexel.x, 0.0))) * 0.12;
        r += (texture2D(tSSR, vUv + vec2(0.0, ssrTexel.y * 1.5)) + texture2D(tSSR, vUv - vec2(0.0, ssrTexel.y * 1.5))) * 0.14;
        r += (texture2D(tSSR, vUv + vec2(0.0, ssrTexel.y * 3.5)) + texture2D(tSSR, vUv - vec2(0.0, ssrTexel.y * 3.5))) * 0.12;
        c = c * (1.0 - r.a * 0.35) + r.rgb;
        if (showAO > 1.5) c = vec3(r.a);
      }
      gl_FragColor = vec4(mix(c, vec3(ao), clamp(showAO, 0.0, 1.0) * step(showAO, 1.5)), 1.0);
    }`,
};

const GRADE = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    lift: { value: new THREE.Vector3(0, 0, 0) },
    gain: { value: new THREE.Vector3(1, 1, 1) },
    saturation: { value: 1.06 },
    contrast: { value: 1.0 },
    vignette: { value: 0.22 },
    aspect: { value: 1.6 },
  },
  vertexShader: FINISH.vertexShader,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform vec3 lift, gain; uniform float saturation, contrast, vignette, aspect;
    varying vec2 vUv;
    void main(){
      vec4 t = texture2D(tDiffuse, vUv);
      vec3 c = max(t.rgb, vec3(0.0));
      // contrast round middle grey in the shadows and mid-tones; highlights left as they are
      vec3 k = 0.18 * pow(c / 0.18 + 1e-5, vec3(contrast));
      c = mix(k, c, smoothstep(0.35, 0.9, c));
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = max(mix(vec3(l), c, saturation), vec3(0.0));
      c = c * gain + lift * (1.0 - smoothstep(0.0, 0.35, l));
      vec2 d = (vUv - 0.5) * vec2(aspect, 1.0);
      c *= 1.0 - vignette * smoothstep(0.25, 1.05, dot(d, d) * 1.6);
      gl_FragColor = vec4(c, t.a);
    }`,
};

/** Colour grade in linear light, after the bloom and before tone mapping (it never feeds the bloom). */
export class GradePass extends ShaderPass {
  constructor() {
    super(GRADE);
  }
  setTheme(day: boolean) {
    const u = this.uniforms;
    if (day) {
      u.lift.value.set(0.004, 0.003, 0.0);
      u.gain.value.set(1.02, 1.0, 0.97);
      u.saturation.value = 1.07;
      u.contrast.value = 1.0;
      u.vignette.value = 0.16;
    } else {
      u.lift.value.set(0.0, 0.002, 0.008);
      u.gain.value.set(1.0, 0.99, 1.03);
      u.saturation.value = 1.1;
      u.contrast.value = 1.0;
      u.vignette.value = 0.26;
    }
  }
  override setSize(w: number, h: number) {
    this.uniforms.aspect.value = w / Math.max(1, h);
  }
}

/**
 * Ambient occlusion (GTAO at half resolution, Poisson-denoised) and the curvature shading. The AO
 * reads the depth of the buffer the scene was just drawn into (the composer swaps them), with
 * normals rebuilt from depth: no second geometry pass. Follows whichever camera draws the
 * frame, perspective (on foot, in places) or orthographic (the iso map).
 */
export class FinishPass extends Pass {
  /** The camera of the frame (set by the app, with the render pass's). */
  camera: THREE.Camera;
  /** AO on (the render tier decides). */
  ao = true;
  /** How much of the AO is applied (0 … 1). */
  aoAmount = 0.85;
  /** Ridge highlight / crease shade (0 off). */
  cavity = 0.5;
  /** The AO buffer is the frame divided by this (2: half resolution). */
  aoScale = 2;
  /** Screen-space reflections on glossy surfaces (the render tier decides). */
  ssr = true;
  /** How far a reflection ray goes (m). */
  ssrDist = 30;
  private ssrRT: THREE.WebGLRenderTarget;
  private ssrMat: THREE.ShaderMaterial;
  private gtaoRT: THREE.WebGLRenderTarget;
  private pdRT: THREE.WebGLRenderTarget;
  private gtao: THREE.ShaderMaterial;
  private pd: THREE.ShaderMaterial;
  private finish: THREE.ShaderMaterial;
  private quad = new FullScreenQuad();
  private w = 2;
  private h = 2;
  private persp = 1;
  /** Debug: show the AO buffer alone. */
  set showAO(on: boolean) {
    this.finish.uniforms.showAO.value = on ? 1 : 0;
  }
  /** Debug: show the reflection weight alone. */
  set showSSR(on: boolean) {
    this.finish.uniforms.showAO.value = on ? 2 : 0;
  }

  constructor(
    camera: THREE.Camera,
    private source: ScenePass,
  ) {
    super();
    this.camera = camera;
    this.gtaoRT = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, depthBuffer: false });
    this.pdRT = this.gtaoRT.clone();
    this.ssrRT = this.gtaoRT.clone();
    this.ssrMat = new THREE.ShaderMaterial({ name: "FinishSSR", defines: { ...SSRShader.defines }, uniforms: THREE.UniformsUtils.clone(SSRShader.uniforms), vertexShader: SSRShader.vertexShader, fragmentShader: SSRShader.fragmentShader, blending: THREE.NoBlending, depthTest: false, depthWrite: false });
    this.gtao = new THREE.ShaderMaterial({
      name: "FinishGTAO",
      defines: { ...GTAOShader.defines, NORMAL_VECTOR_TYPE: 0, SAMPLES: 12 },
      uniforms: THREE.UniformsUtils.clone(GTAOShader.uniforms),
      vertexShader: GTAOShader.vertexShader,
      fragmentShader: GTAOShader.fragmentShader,
      blending: THREE.NoBlending,
      depthTest: false,
      depthWrite: false,
    });
    const g = this.gtao.uniforms;
    g.tNoise.value = generateMagicSquareNoise();
    g.radius.value = 2.0;
    g.distanceExponent.value = 1.6;
    g.thickness.value = 2.5;
    g.distanceFallOff.value = 1;
    g.scale.value = 2.4;
    this.pd = new THREE.ShaderMaterial({
      name: "FinishDenoise",
      defines: { ...PoissonDenoiseShader.defines, NORMAL_VECTOR_TYPE: 0, SAMPLES: 12, SAMPLE_VECTORS: generatePdSamplePointInitializer(12, 2, 2) },
      uniforms: THREE.UniformsUtils.clone(PoissonDenoiseShader.uniforms),
      vertexShader: PoissonDenoiseShader.vertexShader,
      fragmentShader: PoissonDenoiseShader.fragmentShader,
      depthTest: false,
      depthWrite: false,
    });
    const p = this.pd.uniforms;
    p.tDiffuse.value = this.gtaoRT.texture;
    p.tNoise.value = noiseTexture();
    p.lumaPhi.value = 10;
    p.depthPhi.value = 2;
    p.normalPhi.value = 3;
    p.radius.value = 6;
    this.finish = new THREE.ShaderMaterial({ name: "Finish", uniforms: THREE.UniformsUtils.clone(FINISH.uniforms), vertexShader: FINISH.vertexShader, fragmentShader: FINISH.fragmentShader, depthTest: false, depthWrite: false });
  }

  private fw = 2;
  private fh = 2;
  setSize(width: number, height: number) {
    this.fw = width;
    this.fh = height;
    this.w = Math.max(1, Math.round(width / this.aoScale));
    this.h = Math.max(1, Math.round(height / this.aoScale));
    this.gtaoRT.setSize(this.w, this.h);
    this.pdRT.setSize(this.w, this.h);
    this.ssrRT.setSize(this.w, this.h);
    this.ssrMat.uniforms.resolution.value.set(width, height);
    this.finish.uniforms.ssrTexel.value.set(1 / this.w, 1 / this.h);
    this.gtao.uniforms.resolution.value.set(this.w, this.h);
    this.pd.uniforms.resolution.value.set(this.w, this.h);
  }

  render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget) {
    // colour and depth straight from the scene pass's target (resolved from its MSAA)
    const depth = this.source.rt.depthTexture;
    const f = this.finish.uniforms;
    if (this.ao && depth && this.aoAmount > 0) {
      const cam = this.camera as THREE.PerspectiveCamera;
      const persp = cam.isPerspectiveCamera ? 1 : 0;
      if (persp !== this.persp) {
        this.persp = persp;
        this.gtao.defines.PERSPECTIVE_CAMERA = persp;
        this.gtao.needsUpdate = true;
      }
      const g = this.gtao.uniforms;
      g.tDepth.value = depth;
      g.cameraNear.value = cam.near;
      g.cameraFar.value = cam.far;
      g.cameraProjectionMatrix.value.copy(cam.projectionMatrix);
      g.cameraProjectionMatrixInverse.value.copy(cam.projectionMatrixInverse);
      g.cameraWorldMatrix.value.copy(cam.matrixWorld);
      this.pd.uniforms.tDepth.value = depth;
      this.pd.uniforms.cameraProjectionMatrixInverse.value.copy(cam.projectionMatrixInverse);
      const clear = renderer.getClearColor(new THREE.Color());
      const alpha = renderer.getClearAlpha();
      renderer.setClearColor(0xffffff, 1);
      renderer.setRenderTarget(this.gtaoRT);
      renderer.clear(true, false, false);
      this.quad.material = this.gtao;
      this.quad.render(renderer);
      renderer.setRenderTarget(this.pdRT);
      renderer.clear(true, false, false);
      this.quad.material = this.pd;
      this.quad.render(renderer);
      renderer.setClearColor(clear, alpha);
      f.tAO.value = this.pdRT.texture;
      f.aoAmount.value = this.aoAmount;
    } else {
      f.tAO.value = WHITE;
      f.aoAmount.value = 0;
    }
    f.tDiffuse.value = this.source.rt.texture;
    if (this.ssr && depth) {
      const c = this.camera as THREE.PerspectiveCamera;
      const m = this.ssrMat;
      const persp = c.isPerspectiveCamera ? 1 : 0;
      if (m.defines.PERSPECTIVE !== persp) {
        m.defines.PERSPECTIVE = persp;
        m.needsUpdate = true;
      }
      const u = m.uniforms;
      u.tColor.value = this.source.rt.texture;
      u.tDepth.value = depth;
      u.proj.value.copy(c.projectionMatrix);
      u.projInv.value.copy(c.projectionMatrixInverse);
      u.near.value = c.near;
      u.far.value = c.far;
      u.maxDist.value = this.ssrDist;
      u.upView.value.set(0, 1, 0).transformDirection(c.matrixWorldInverse);
      renderer.setRenderTarget(this.ssrRT);
      this.quad.material = m;
      this.quad.render(renderer);
      f.tSSR.value = this.ssrRT.texture;
      f.ssrOn.value = 1;
    } else f.ssrOn.value = 0;
    const cam = this.camera as THREE.PerspectiveCamera & THREE.OrthographicCamera;
    if (this.ao && depth && this.cavity > 0) {
      f.tDepth.value = depth;
      f.cavity.value = this.cavity;
      f.cavNear.value = cam.near;
      f.cavFar.value = cam.far;
      f.texel.value.set(1 / this.fw, 1 / this.fh);
      // metres per pixel: per metre of depth in perspective, flat in orthographic
      if (cam.isPerspectiveCamera) {
        f.cavPersp.value = 1;
        f.cavScale.value = (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2)) / this.fh;
      } else {
        f.cavPersp.value = 0;
        f.cavScale.value = (cam.top - cam.bottom) / cam.zoom / this.fh;
      }
    } else f.cavity.value = 0;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.material = this.finish;
    this.quad.render(renderer);
  }

  dispose() {
    this.gtaoRT.dispose();
    this.pdRT.dispose();
    this.ssrRT.dispose();
    this.ssrMat.dispose();
    this.gtao.dispose();
    this.pd.dispose();
    this.finish.dispose();
    this.quad.dispose();
  }
}
