import * as THREE from "three";

/**
 * Shader warm-up. three.js compiles a material's program the first time it is drawn, and a place
 * or a district seen for the first time stalled its first frame for 0.3–0.9 s. This compiles them
 * ahead (renderer.compileAsync: with KHR_parallel_shader_compile the driver links in the
 * background and the promise resolves when every program is ready).
 *
 * compile() works out a program for every object of the tree (thousands in the city), so only one
 * object per distinct variant is handed over: same material(s), same kind of object, same
 * attributes, same shadow and instance-colour flags.
 *
 * The render target matters: drawn through the post-processing composer, a material renders into
 * a linear, untonemapped target, a different program from the one for the screen. `into` is that
 * target (the composer's read buffer); null warms for the screen.
 */
let into: () => THREE.WebGLRenderTarget | null = () => null;
/** Where the app draws its scenes (the composer's read buffer). */
export function warmTarget(fn: () => THREE.WebGLRenderTarget | null) {
  into = fn;
}

export function warm(renderer: THREE.WebGLRenderer, root: THREE.Object3D, camera: THREE.Camera, lights: THREE.Scene = root as THREE.Scene): Promise<unknown> {
  const reps = new Map<string, THREE.Object3D>();
  root.traverse((o) => add(reps, o));
  return compile(renderer, [...reps.values()], camera, lights);
}

/** Warm loose objects (built but not in the scene yet: overlays, rides) against `lights`' scene. */
export function warmObjects(renderer: THREE.WebGLRenderer, objects: THREE.Object3D[], camera: THREE.Camera, lights: THREE.Scene): Promise<unknown> {
  const reps = new Map<string, THREE.Object3D>();
  for (const r of objects) r.traverse((o) => add(reps, o));
  return compile(renderer, [...reps.values()], camera, lights);
}

function add(reps: Map<string, THREE.Object3D>, o: THREE.Object3D) {
  const m = o as THREE.Mesh;
  if (!(m.isMesh || (o as THREE.Points).isPoints || (o as THREE.Line).isLine || (o as THREE.Sprite).isSprite) || !m.material) return;
  const mats = Array.isArray(m.material) ? m.material : [m.material];
  const g = m.geometry as THREE.BufferGeometry | undefined;
  let k = mats.map((x) => x.uuid).join(",") + "|" + o.type + "|" + (o.receiveShadow ? 1 : 0) + "|" + ((o as THREE.InstancedMesh).instanceColor ? 1 : 0);
  if (g?.attributes) {
    k += "|" + Object.keys(g.attributes).sort().join(".");
    const morph = Object.entries((g.morphAttributes ?? {}) as Record<string, unknown[]>);
    if (morph.length) k += "|m" + morph.map(([n, a]) => n + a.length).join(".");
  }
  if (!reps.has(k)) reps.set(k, o);
}

function compile(renderer: THREE.WebGLRenderer, list: THREE.Object3D[], camera: THREE.Camera, lights: THREE.Scene) {
  if (!list.length) return Promise.resolve();
  // a stand-in "scene" whose traversal visits only the representatives; the lights, fog and
  // environment come from the real scene
  const proxy = { traverse: (fn: (o: THREE.Object3D) => void) => list.forEach(fn), traverseVisible: () => {} } as unknown as THREE.Object3D;
  const prev = renderer.getRenderTarget();
  try {
    renderer.setRenderTarget(into());
    return renderer.compileAsync(proxy, camera, lights);
  } catch (e) {
    console.warn("shader warm-up:", e);
    return Promise.resolve();
  } finally {
    renderer.setRenderTarget(prev);
  }
}

/** Run when the main thread is idle (or after `timeout` ms at the latest). */
export function idle(fn: () => void, timeout = 2000) {
  const ric = (window as unknown as { requestIdleCallback?: (f: () => void, o: { timeout: number }) => number }).requestIdleCallback;
  if (ric) ric(fn, { timeout });
  else setTimeout(fn, 60);
}
