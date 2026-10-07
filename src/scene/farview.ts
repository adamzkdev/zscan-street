import * as THREE from "three";

const size = new THREE.Vector2();

/**
 * How many screen pixels a metre covers for `camera` (orthographic cameras only; a perspective
 * camera, on foot or in a shot, always counts as close).
 */
export function pxPerMetre(r: THREE.WebGLRenderer, camera: THREE.Camera) {
  const o = camera as THREE.OrthographicCamera;
  if (!o.isOrthographicCamera) return Infinity;
  return (r.getSize(size).y * o.zoom) / (o.top - o.bottom);
}

/**
 * An invisible object that is "drawn" every frame (no draw call: empty geometry) and tells when
 * the view crosses `minPx` pixels per metre, so small things can drop their tiny parts (or hide)
 * on the whole-city map. Add it next to what it governs; `onChange(far)` fires on each crossing.
 */
export function farProbe(minPx: number, onChange: (far: boolean) => void) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(3), 3));
  geo.setDrawRange(0, 0);
  const probe = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }));
  probe.frustumCulled = false;
  probe.matrixAutoUpdate = false;
  let far: boolean | null = null;
  probe.onBeforeRender = (r, _s, camera) => {
    const now = pxPerMetre(r, camera) < minPx;
    if (now !== far) onChange((far = now));
  };
  return probe;
}
