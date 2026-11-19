import * as THREE from "three";
import { FullScreenQuad } from "three/examples/jsm/postprocessing/Pass.js";
import { PACK_GLSL, unpack } from "./pack";

/**
 * The visible surface under the aim, picked from the depth of the frame on screen: one pixel of
 * the scene's own depth buffer (no second rendering of the city, no ray through hidden or batched
 * geometry). What you see is what the line holds: the nearest thing drawn there, or the sky.
 */
export class SwingAim {
  private rt = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false });
  private pixel = new Uint8Array(4);
  private world = new THREE.Matrix4();
  private inverse = new THREE.Matrix4();
  private ready = false;
  /** The depth's size when it was drawn: a resize since reallocates it, empty until the next frame. */
  private size = { w: 0, h: 0 };
  /** The size of the target a depth texture is drawn into (its own, if it has none). */
  private sizeOf(depth: THREE.Texture | null | undefined) {
    const t = depth as (THREE.Texture & { renderTarget?: { width: number; height: number } | null }) | null | undefined;
    const img = t?.image as { width?: number; height?: number } | undefined;
    return { w: t?.renderTarget?.width ?? img?.width ?? 0, h: t?.renderTarget?.height ?? img?.height ?? 0 };
  }
  /** A pick on its way back from the GPU (one at a time), since when (ms), and the latest one asked. */
  private pending = false;
  private since = 0;
  private asked = 0;
  private material = new THREE.ShaderMaterial({
    uniforms: { depth: { value: null as THREE.Texture | null }, at: { value: new THREE.Vector2() } },
    vertexShader: "void main(){gl_Position=vec4(position.xy,0.,1.);}",
    fragmentShader: `uniform highp sampler2D depth; uniform vec2 at; ${PACK_GLSL} void main(){ gl_FragColor = packUnit(texture2D(depth, at).r); }`,
    depthTest: false,
    depthWrite: false,
  });
  private quad = new FullScreenQuad(this.material);

  constructor(private renderer: THREE.WebGLRenderer) {}

  /** The camera that drew the frame now on screen, and that frame's depth. */
  capture(camera: THREE.Camera, depth: THREE.Texture | null) {
    this.ready = !!depth;
    this.size = this.sizeOf(depth);
    this.material.uniforms.depth.value = depth;
    camera.updateMatrixWorld();
    this.world.copy(camera.matrixWorld);
    this.inverse.copy(camera.projectionMatrixInverse);
  }

  /** Nothing on screen to pick from (indoors, on the map). */
  clear() {
    this.ready = false;
  }

  /** A frame to pick from: captured, and its depth not reallocated by a resize since. */
  get captured() {
    if (!this.ready) return false;
    const now = this.sizeOf(this.material.uniforms.depth.value);
    // (sampled before the scene is drawn into it again, it would be read empty, or worse, set up
    // as a plain texture ahead of its render target)
    return now.w === this.size.w && now.h === this.size.h;
  }

  /** Draw the depth under `ndc` into the one-pixel target; false when there is nothing to pick from. */
  private sample(ndc: THREE.Vector2) {
    if (!this.captured || Math.abs(ndc.x) > 1 || Math.abs(ndc.y) > 1) return false;
    this.material.uniforms.at.value.set(ndc.x * 0.5 + 0.5, ndc.y * 0.5 + 0.5);
    const previous = this.renderer.getRenderTarget();
    try {
      this.renderer.setRenderTarget(this.rt);
      this.quad.render(this.renderer);
    } finally {
      this.renderer.setRenderTarget(previous);
    }
    return true;
  }

  private unproject(ndc: THREE.Vector2, depth: number, out: THREE.Vector3, inverse: THREE.Matrix4, world: THREE.Matrix4) {
    // (the far plane is the sky: nothing to hold)
    if (!(depth > 0 && depth < 1)) return null;
    return out.set(ndc.x, ndc.y, depth * 2 - 1).applyMatrix4(inverse).applyMatrix4(world);
  }

  /** The visible point under `ndc` (normalized device coordinates), now; null for the sky. */
  hit(ndc: THREE.Vector2, out: THREE.Vector3) {
    if (!this.sample(ndc)) return null;
    const previous = this.renderer.getRenderTarget();
    try {
      this.renderer.readRenderTargetPixels(this.rt, 0, 0, 1, 1, this.pixel);
    } finally {
      this.renderer.setRenderTarget(previous);
    }
    return this.unproject(ndc, unpack(this.pixel), out, this.inverse, this.world);
  }

  /**
   * The same, without stalling the frame: the answer comes back from the GPU a frame or two later
   * (for the reticle). Resolves to null for the sky; to undefined when there is no answer: nothing
   * to pick from, one still on its way (unless lost: a resize, a busy GPU), overtaken by a later one.
   */
  async hitLater(ndc: THREE.Vector2, out: THREE.Vector3): Promise<THREE.Vector3 | null | undefined> {
    if (this.pending && performance.now() - this.since < 400) return undefined;
    if (!this.sample(ndc)) return this.captured ? null : undefined;
    this.pending = true;
    this.since = performance.now();
    const ask = ++this.asked;
    const at = ndc.clone();
    const inverse = this.inverse.clone();
    const world = this.world.clone();
    const px = new Uint8Array(4);
    try {
      await this.renderer.readRenderTargetPixelsAsync(this.rt, 0, 0, 1, 1, px);
      return ask === this.asked ? this.unproject(at, unpack(px), out, inverse, world) : undefined;
    } catch {
      return undefined;
    } finally {
      if (ask === this.asked) this.pending = false;
    }
  }

  dispose() {
    this.rt.dispose();
    this.material.dispose();
    this.quad.dispose();
  }
}
