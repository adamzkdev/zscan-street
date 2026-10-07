import * as THREE from "three";
import { GOLD, HX, HZ, ROOF, SILVER, rng } from "./layout";

/**
 * Goal celebrations: confetti cannons round the pitch and fireworks over the roof. Both are point
 * clouds animated entirely in the shader from the moment of the burst.
 */

const CONF_V = /* glsl */ `
attribute vec3 aVel;
attribute vec3 aCol;
attribute float aSeed;
uniform float uT;
varying vec3 vCol;
varying float vA;
void main() {
  float t = uT - aSeed * 0.9;
  vCol = aCol;
  if (t < 0.0 || t > 11.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; vA = 0.0; return; }
  float k = 1.3, vt = 1.1;
  float e = (1.0 - exp(-k * t)) / k;
  vec3 p = position;
  p.x += aVel.x * e + sin(t * 2.7 + aSeed * 40.0) * 0.6 * min(t, 1.0);
  p.z += aVel.z * e + cos(t * 2.1 + aSeed * 30.0) * 0.6 * min(t, 1.0);
  p.y += (aVel.y + vt / k) * e - vt * t;
  if (p.y < 0.03) p.y = 0.03;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float flick = 0.35 + 0.65 * abs(sin(t * 7.0 + aSeed * 60.0));
  gl_PointSize = 150.0 * flick / -mv.z;
  vA = clamp((11.0 - t) / 2.0, 0.0, 1.0);
  gl_Position = projectionMatrix * mv;
}`;
const CONF_F = /* glsl */ `
varying vec3 vCol;
varying float vA;
void main() {
  if (vA <= 0.0) discard;
  gl_FragColor = vec4(vCol, vA);
  #include <colorspace_fragment>
}`;

const FW_V = /* glsl */ `
attribute vec3 aVel;
attribute vec3 aCol;
attribute float aSeed;
uniform float uT;
varying vec3 vCol;
varying float vA;
void main() {
  float t = uT - aSeed;
  vCol = aCol;
  if (t < 0.0 || t > 2.6) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; vA = 0.0; return; }
  vec3 p = position + aVel * (1.0 - exp(-2.2 * t)) / 2.2 - vec3(0.0, 1.6 * t * t, 0.0);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = (900.0 * (1.0 - t / 3.2)) / -mv.z;
  vA = (1.0 - t / 2.6) * (0.75 + 0.25 * sin(t * 30.0 + aSeed * 99.0));
  gl_Position = projectionMatrix * mv;
}`;
const FW_F = /* glsl */ `
varying vec3 vCol;
varying float vA;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  if (d > 0.5 || vA <= 0.0) discard;
  float a = smoothstep(0.5, 0.0, d);
  gl_FragColor = vec4(vCol * (1.0 + 2.0 * a), a * vA);
}`;

export class Celebration {
  private conf: THREE.Points;
  private fw: THREE.Points;
  private cu = { uT: { value: 99 } };
  private fu = { uT: { value: 99 } };
  private R = rng(31);

  constructor(scene: THREE.Scene) {
    const mk = (n: number, v: string, f: string, u: { uT: { value: number } }, additive: boolean) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
      g.setAttribute("aVel", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
      g.setAttribute("aCol", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
      g.setAttribute("aSeed", new THREE.BufferAttribute(new Float32Array(n), 1));
      const m = new THREE.ShaderMaterial({ vertexShader: v, fragmentShader: f, uniforms: u, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
      const p = new THREE.Points(g, m);
      p.frustumCulled = false;
      p.visible = false;
      scene.add(p);
      return p;
    };
    this.conf = mk(6000, CONF_V, CONF_F, this.cu, false);
    this.fw = mk(9 * 260, FW_V, FW_F, this.fu, true);
  }

  burst(team: 0 | 1) {
    const R = this.R;
    const cols = (team === 0 ? [GOLD, "#ffe08a", "#ffffff", GOLD, "#d49a16"] : [SILVER, "#ffffff", "#8fa0c8", SILVER, "#e6e9f2"]).map((c) => new THREE.Color(c));
    // confetti: from cannons along the boards and the front of the stands, up and over the pitch
    {
      const g = this.conf.geometry;
      const P = g.attributes.position as THREE.BufferAttribute,
        V = g.attributes.aVel as THREE.BufferAttribute,
        C = g.attributes.aCol as THREE.BufferAttribute,
        S = g.attributes.aSeed as THREE.BufferAttribute;
      for (let i = 0; i < P.count; i++) {
        const a = R() * Math.PI * 2;
        const x = Math.cos(a) * (HX + 2),
          z = Math.sin(a) * (HZ + 2);
        const y = 1 + R() * 8;
        P.setXYZ(i, x, y, z);
        V.setXYZ(i, -x * (0.25 + R() * 0.35) + (R() - 0.5) * 6, 8 + R() * 12, -z * (0.25 + R() * 0.35) + (R() - 0.5) * 6);
        const c = cols[Math.floor(R() * cols.length)];
        C.setXYZ(i, c.r, c.g, c.b);
        S.setX(i, R());
      }
      for (const a of [P, V, C, S]) a.needsUpdate = true;
    }
    // fireworks: nine shells bursting above the roof, a fraction of a second apart
    {
      const g = this.fw.geometry;
      const P = g.attributes.position as THREE.BufferAttribute,
        V = g.attributes.aVel as THREE.BufferAttribute,
        C = g.attributes.aCol as THREE.BufferAttribute,
        S = g.attributes.aSeed as THREE.BufferAttribute;
      const per = P.count / 9;
      for (let b = 0; b < 9; b++) {
        const a = (b / 9) * Math.PI * 2 + R();
        const cx = Math.cos(a) * HX * (0.2 + R() * 0.6),
          cz = Math.sin(a) * HZ * (0.15 + R() * 0.5);
        const cy = ROOF.y + 8 + R() * 16;
        const c = cols[b % cols.length];
        const sp = 11 + R() * 7;
        const delay = b * 0.32 + R() * 0.2;
        for (let i = 0; i < per; i++) {
          const k = b * per + i;
          const u = R() * 2 - 1,
            th = R() * Math.PI * 2;
          const r = Math.sqrt(1 - u * u);
          P.setXYZ(k, cx, cy, cz);
          V.setXYZ(k, r * Math.cos(th) * sp, u * sp, r * Math.sin(th) * sp);
          C.setXYZ(k, c.r, c.g, c.b);
          S.setX(k, delay);
        }
      }
      for (const a of [P, V, C, S]) a.needsUpdate = true;
    }
    this.cu.uT.value = 0;
    this.fu.uT.value = 0;
    this.conf.visible = this.fw.visible = true;
  }

  tick(dt: number) {
    this.cu.uT.value += dt;
    this.fu.uT.value += dt;
    if (this.cu.uT.value > 13) this.conf.visible = false;
    if (this.fu.uT.value > 6) this.fw.visible = false;
  }
}
