/**
 * A liquid far below an arena, shared by the levels that float over one (SAFE BLOCK's sea, canal and
 * pit of molten gold; LASER SWEEP's foundry; FORGERY GAP's night sea).
 */
import * as THREE from "three";

/** What the void far below is made of: the sea's swell, a canal at night, a pit of molten gold under its crust. */
export type Liquid = "sea" | "canal" | "melt";

/**
 * The void far below, as a liquid in big flat texels (the city's own voxels, seen from above): the
 * sea's swell in three tones with foam on its crests, a canal with lantern light dancing on it, a
 * crust of cooling gold with glowing cracks. Far away the pattern melts into one calm tone (no shimmer).
 */
export function liquid(s: THREE.Scene, o: { kind: Liquid; y: number; deep: string; mid: string; hot: string; foam: string; fog: string; cell?: number; near?: number; far?: number; glow?: number }) {
  const u = { value: 0 };
  const col = (hex: string) => ({ value: new THREE.Color(hex) });
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(1100, 1100),
    new THREE.ShaderMaterial({
      defines: { KIND: o.kind === "sea" ? 0 : o.kind === "canal" ? 1 : 2 },
      uniforms: { uT: u, uFog: col(o.fog), uDeep: col(o.deep), uMid: col(o.mid), uHot: col(o.hot), uFoam: col(o.foam), uCell: { value: o.cell ?? 0.8 }, uNear: { value: o.near ?? 70 }, uFar: { value: o.far ?? 330 }, uGlow: { value: o.glow ?? 1 } },
      vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: /* glsl */ `uniform float uT; uniform vec3 uFog; uniform vec3 uDeep; uniform vec3 uMid; uniform vec3 uHot; uniform vec3 uFoam; uniform float uCell; uniform float uNear; uniform float uFar; uniform float uGlow; varying vec3 vW;
        float hash(vec2 p){ p = fract(p * vec2(0.1031, 0.1030)); p += dot(p, p.yx + 33.33); return fract((p.x + p.y) * p.x); }
        float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
        void main(){
          vec2 p = vW.xz;
          // (a texel smaller than a pixel would shimmer: the pattern fades out before that)
          float lod = smoothstep(0.28, 1.0, max(fwidth(p.x), fwidth(p.y)) / uCell);
          vec2 c = (floor(p / uCell) + 0.5) * uCell;
          float r = length(c);
          float near = exp(-r * 0.03);
          float t = uT;
          vec3 col;
        #if KIND == 0
          // two swells crossing: three flat tones close together, a line of foam on the crests, a glint here and there
          float w1 = sin(c.x * 0.29 + sin(c.y * 0.17 + t * 0.4) * 1.5 + t * 0.75);
          float w2 = sin(c.y * 0.41 - c.x * 0.13 + sin(c.x * 0.14 - t * 0.3) * 1.2 - t * 0.55);
          float h = w1 * 0.55 + w2 * 0.45;
          col = mix(uDeep, uMid, 0.2 + 0.2 * step(-0.2, h) + 0.2 * step(0.4, h));
          col = mix(col, uFoam, step(0.9, h) * 0.5);
          col = mix(col, uFoam, step(0.996, hash(c * 0.37 + floor(t * 2.5) * 7.1)) * step(0.1, h) * 0.8);
          col = mix(col, mix(uDeep, uMid, 0.4), lod);
          // (rings of light pulsing out from under the arena)
          float ring = smoothstep(0.9, 1.0, fract(r / 24.0 - t * 0.1)) * smoothstep(8.0, 26.0, r) * (1.0 - lod);
          col += uHot * uGlow * (near * near * 0.3 + ring * (0.08 + 0.3 * near));
        #elif KIND == 1
          // slow ripples in two tones, the lanterns' light dancing on them (more of it near the market)
          float w = sin(c.x * 0.5 + t * 0.6 + sin(c.y * 0.3 + t * 0.2) * 1.2) * sin(c.y * 0.37 - t * 0.45);
          col = mix(uDeep, uMid, 0.2 + 0.4 * step(0.25, w));
          col = mix(col, uFoam, step(0.82, w) * 0.3);
          col = mix(col, uHot, step(0.991 - 0.012 * near, hash(c * 0.37 + floor(t * 1.5) * 3.3)) * 0.6);
          col = mix(col, mix(uDeep, uMid, 0.36), lod);
          col += uHot * uGlow * near * near * 0.12;
        #else
          // big plates of dark crust drifting, the melt glowing in the thin cracks between them and in a few open pools
          vec2 q = c * 0.05 + vec2(t * 0.012, t * 0.007);
          float n = vnoise(q) * 0.7 + vnoise(q * 2.1 + 7.0) * 0.3;
          float vein = 1.0 - smoothstep(0.0, 0.022, abs(n - 0.5));
          float pool = smoothstep(0.76, 0.8, n);
          col = mix(uDeep, uMid, 0.5 * step(0.5, n) + 0.35 * step(0.64, n));
          col = mix(col, uHot, max(vein * 0.85, pool) * (0.85 + 0.15 * sin(t * 1.7 + n * 24.0)));
          col = mix(col, uFoam, pool * step(0.93, hash(c * 0.37 + floor(t * 2.0) * 5.1)));
          col = mix(col, mix(uDeep, uHot, 0.12), lod);
          col += uHot * uGlow * near * near * 0.16;
        #endif
          float f = smoothstep(uNear, uFar, distance(cameraPosition, vW));
          gl_FragColor = vec4(mix(col, uFog, f), 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = o.y;
  sea.raycast = () => {};
  s.add(sea);
  return u;
}
