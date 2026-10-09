import * as THREE from "three";

/**
 * Screen-space reflections: wet tarmac that mirrors the neon, polished marble that mirrors the
 * columns, curtain walls that mirror the street. How glossy a pixel is travels from the scene
 * pass to here in its alpha (opaque standard materials only: 1 matte … 0.5 mirror; see
 * `encodeGloss`), so no extra geometry pass and no G-buffer.
 */

let patched = false;
/** Opaque standard materials write their gloss into the alpha of the scene target. */
export function encodeGloss() {
  if (patched) return;
  patched = true;
  const lib = THREE.ShaderLib.physical;
  lib.fragmentShader = lib.fragmentShader.replace(
    "#include <opaque_fragment>",
    `#include <opaque_fragment>
    #ifdef OPAQUE
    gl_FragColor.a = 1.0 - 0.5 * (1.0 - smoothstep(0.1, 0.55, roughnessFactor));
    #endif`,
  );
}

export const SSRShader = {
  defines: { PERSPECTIVE: 1, STEPS: 16 },
  uniforms: {
    tColor: { value: null as THREE.Texture | null },
    tDepth: { value: null as THREE.Texture | null },
    proj: { value: new THREE.Matrix4() },
    projInv: { value: new THREE.Matrix4() },
    near: { value: 0.1 },
    far: { value: 1000 },
    resolution: { value: new THREE.Vector2(1, 1) },
    maxDist: { value: 30 },
    strength: { value: 1 },
    upView: { value: new THREE.Vector3(0, 1, 0) },
  },
  vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
  fragmentShader: /* glsl */ `
    #include <packing>
    uniform sampler2D tColor;
    uniform highp sampler2D tDepth;
    uniform mat4 proj, projInv;
    uniform float near, far, maxDist, strength;
    uniform vec2 resolution;
    uniform vec3 upView;
    varying vec2 vUv;
    float viewZ(float d) {
      #if PERSPECTIVE == 1
      return perspectiveDepthToViewZ(d, near, far);
      #else
      return orthographicDepthToViewZ(d, near, far);
      #endif
    }
    vec3 viewPos(vec2 uv, float d) {
      vec4 v = projInv * vec4(vec3(uv, d) * 2.0 - 1.0, 1.0);
      return v.xyz / v.w;
    }
    vec2 toUv(vec3 q) {
      vec4 c = proj * vec4(q, 1.0);
      return c.xy / c.w * 0.5 + 0.5;
    }
    vec3 normalAt(vec2 uv, vec3 c) {
      vec2 px = 1.0 / resolution;
      vec3 l = viewPos(uv - vec2(px.x, 0.0), texture2D(tDepth, uv - vec2(px.x, 0.0)).r);
      vec3 r = viewPos(uv + vec2(px.x, 0.0), texture2D(tDepth, uv + vec2(px.x, 0.0)).r);
      vec3 b = viewPos(uv - vec2(0.0, px.y), texture2D(tDepth, uv - vec2(0.0, px.y)).r);
      vec3 t = viewPos(uv + vec2(0.0, px.y), texture2D(tDepth, uv + vec2(0.0, px.y)).r);
      vec3 dx = abs(l.z - c.z) < abs(r.z - c.z) ? c - l : r - c;
      vec3 dy = abs(b.z - c.z) < abs(t.z - c.z) ? c - b : t - c;
      return normalize(cross(dx, dy));
    }
    void main() {
      vec4 col = texture2D(tColor, vUv);
      float gloss = clamp((1.0 - col.a) * 2.0, 0.0, 1.0);
      float d = texture2D(tDepth, vUv).r;
      if (gloss < 0.2 || d >= 1.0) { gl_FragColor = vec4(0.0); return; }
      vec3 P = viewPos(vUv, d);
      vec3 N = normalAt(vUv, P);
      // floors, roads, water: what faces the sky (walls rebuilt from depth only give noise)
      float upw = smoothstep(0.75, 0.95, dot(N, upView));
      if (upw <= 0.0) { gl_FragColor = vec4(0.0); return; }
      #if PERSPECTIVE == 1
      vec3 V = normalize(P);
      #else
      vec3 V = vec3(0.0, 0.0, -1.0);
      #endif
      vec3 R = normalize(reflect(V, N));
      float cosT = clamp(dot(-V, N), 0.0, 1.0);
      // an artist's Fresnel: some mirror face-on, a lot at a grazing angle
      float fres = mix(0.18, 1.0, pow(1.0 - cosT, 3.0));
      float jit = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
      float dist = maxDist;
      float tPrev = 0.0, tHit = -1.0;
      for (int i = 1; i <= STEPS; i++) {
        float k = (float(i) - jit) / float(STEPS);
        float t = dist * k * k;
        vec3 Q = P + R * t;
        #if PERSPECTIVE == 1
        if (Q.z > -near) break;
        #endif
        vec2 q = toUv(Q);
        if (q.x < 0.0 || q.x > 1.0 || q.y < 0.0 || q.y > 1.0) break;
        float diff = viewZ(texture2D(tDepth, q).r) - Q.z;
        if (diff > 0.0 && diff < 0.25 + t * 0.06) {
          float a = tPrev, b = t;
          for (int j = 0; j < 4; j++) {
            float m = (a + b) * 0.5;
            vec3 M = P + R * m;
            if (viewZ(texture2D(tDepth, toUv(M)).r) - M.z > 0.0) b = m; else a = m;
          }
          tHit = b;
          break;
        }
        tPrev = t;
      }
      if (tHit < 0.0) { gl_FragColor = vec4(0.0); return; }
      vec2 h = toUv(P + R * tHit);
      vec2 e = smoothstep(0.0, 0.1, h) * smoothstep(0.0, 0.1, 1.0 - h);
      float w = gloss * upw * fres * e.x * e.y * (1.0 - smoothstep(0.55, 1.0, tHit / dist)) * strength;
      gl_FragColor = vec4(texture2D(tColor, h).rgb * w, w);
    }`,
};
