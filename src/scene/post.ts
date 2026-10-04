import * as THREE from "three";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import type { Lamp } from "./city";

/**
 * Tilt-shift: blur grows with the distance from a horizontal focus band, which makes the city read
 * as a miniature diorama. One pass per direction.
 */
const TiltShift = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    dir: { value: new THREE.Vector2(1, 0) },
    resolution: { value: new THREE.Vector2(1, 1) },
    focus: { value: 0.5 },
    band: { value: 0.18 },
    amount: { value: 0 },
  },
  vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform vec2 dir; uniform vec2 resolution; uniform float focus, band, amount;
    varying vec2 vUv;
    void main(){
      float d = max(0.0, abs(vUv.y - focus) - band);
      float r = clamp(d * 3.0, 0.0, 1.0) * amount;
      vec2 step = dir / resolution * r * 2.4;
      vec4 c = texture2D(tDiffuse, vUv) * 0.2270270270;
      c += texture2D(tDiffuse, vUv + step * 1.3846153846) * 0.3162162162;
      c += texture2D(tDiffuse, vUv - step * 1.3846153846) * 0.3162162162;
      c += texture2D(tDiffuse, vUv + step * 3.2307692308) * 0.0702702703;
      c += texture2D(tDiffuse, vUv - step * 3.2307692308) * 0.0702702703;
      gl_FragColor = c;
    }`,
};

export function tiltShift() {
  const h = new ShaderPass(TiltShift);
  const v = new ShaderPass(TiltShift);
  v.uniforms.dir.value = new THREE.Vector2(0, 1);
  return {
    passes: [h, v],
    set(amount: number, focus = 0.5, band = 0.18) {
      for (const p of [h, v]) {
        p.uniforms.amount.value = amount;
        p.uniforms.focus.value = focus;
        p.uniforms.band.value = band;
        p.enabled = amount > 0.01;
      }
    },
    resize(w: number, hgt: number) {
      for (const p of [h, v]) p.uniforms.resolution.value.set(w, hgt);
    },
  };
}

/**
 * A fixed pool of point lights moved onto the lamps nearest to what the camera looks at. A city
 * has dozens of lamps; forward rendering only affords a handful of real lights.
 */
export class LampLights {
  private lights: THREE.PointLight[] = [];
  private lastPick = -1;
  /** 0 by day: the street lamps are off. */
  scale = 1;

  constructor(
    scene: THREE.Scene,
    private lamps: Lamp[],
    count = 10,
  ) {
    for (let i = 0; i < count; i++) {
      const l = new THREE.PointLight("#ffb46b", 0, 9, 1.7);
      scene.add(l);
      this.lights.push(l);
    }
  }

  update(t: number, focus: THREE.Vector3, force = false) {
    if (!force && t - this.lastPick < 0.3) return;
    this.lastPick = t;
    const near = [...this.lamps].sort((a, b) => a.pos.distanceToSquared(focus) - b.pos.distanceToSquared(focus));
    this.lights.forEach((l, i) => {
      const lamp = near[i];
      if (!lamp) return void (l.intensity = 0);
      l.position.copy(lamp.pos);
      l.color.set(lamp.color);
      l.intensity = (lamp.intensity ?? 14) * this.scale;
    });
  }
}
