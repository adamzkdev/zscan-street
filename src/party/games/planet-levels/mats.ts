/**
 * PLANET GRAB's materials of its own, two small patches on three's:
 *
 * - `seeThrough()`: a prop never hides the runner. The camera rides behind and above; a tree, a tower
 *   or a chimney between it and the runner is cut open by a dithered hole round the line of sight (a
 *   cone: nothing at the runner, full a couple of metres toward the camera), above knee height only
 *   (the ground's flowers and plates stay whole). Its cast shadow stays: the prop is still there.
 * - `sway()`: instanced blades (tufts, flowers, leaves, fronds) lean in the wind, their foot still.
 *
 * Both read one shared value each (SEE, WIND), set once a frame by the game.
 */
import * as THREE from "three";

/** The runner the camera follows (world), the hole's radius (m; 0: none), the radius from the planet's middle under which nothing is cut. */
export const SEE = { at: { value: new THREE.Vector3() }, r: { value: 0 }, floor: { value: 0 } };
/** The wind's clock (s). */
export const WIND = { t: { value: 0 } };

type Shader = { uniforms: Record<string, { value: unknown }>; vertexShader: string; fragmentShader: string };

/** Chain a patch after whatever the material already does when it compiles (the stage's glow mark). */
function patch<M extends THREE.Material>(m: M, key: string, f: (sh: Shader) => void): M {
  const was = m.onBeforeCompile;
  const wasKey = m.customProgramCacheKey();
  m.onBeforeCompile = function (this: THREE.Material, sh, gl) {
    was.call(this, sh, gl);
    f(sh as unknown as Shader);
  };
  m.customProgramCacheKey = () => `${wasKey}|${key}`;
  m.needsUpdate = true;
  return m;
}

export function seeThrough<M extends THREE.Material>(m: M): M {
  return patch(m, "pgSee", (sh) => {
    sh.uniforms.uSeeAt = SEE.at;
    sh.uniforms.uSeeR = SEE.r;
    sh.uniforms.uSeeFloor = SEE.floor;
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nuniform vec3 uSeeAt;\nvarying vec3 vSeeV;\nvarying vec3 vSeeP;\nvarying float vSeeH;")
      .replace(
        "#include <project_vertex>",
        /* glsl */ `#include <project_vertex>
        vSeeV = mvPosition.xyz;
        vSeeP = ( viewMatrix * vec4( uSeeAt, 1.0 ) ).xyz;
        vec4 seeW = vec4( transformed, 1.0 );
        #ifdef USE_INSTANCING
        seeW = instanceMatrix * seeW;
        #endif
        vSeeH = length( ( modelMatrix * seeW ).xyz );`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform float uSeeR;\nuniform float uSeeFloor;\nvarying vec3 vSeeV;\nvarying vec3 vSeeP;\nvarying float vSeeH;")
      .replace(
        "#include <clipping_planes_fragment>",
        /* glsl */ `#include <clipping_planes_fragment>
        if ( uSeeR > 0.0 && vSeeH > uSeeFloor ) {
          float seeT = dot( vSeeV, vSeeP ) / dot( vSeeP, vSeeP );
          if ( seeT > 0.02 && seeT < 0.97 ) {
            float seeRad = uSeeR * ( 1.0 - smoothstep( 0.84, 0.97, seeT ) );
            float seeK = smoothstep( seeRad * 0.5, seeRad, length( vSeeV - vSeeP * seeT ) );
            if ( seeK < fract( 52.9829189 * fract( dot( gl_FragCoord.xy, vec2( 0.06711056, 0.00583715 ) ) ) ) + 0.02 ) discard;
          }
        }`,
      );
  });
}

/**
 * `amp`: how far a blade's top goes sideways, in its own units (a thin box: its width is its scale).
 * `along` "z": a frond instead, its far end (+z) bobbing up and down.
 */
export function sway<M extends THREE.Material>(m: M, amp: number, along: "y" | "z" = "y"): M {
  return patch(m, `pgSway${along}${amp.toFixed(2)}`, (sh) => {
    sh.uniforms.uWindT = WIND.t;
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nuniform float uWindT;").replace(
      "#include <begin_vertex>",
      /* glsl */ `#include <begin_vertex>
      #ifdef USE_INSTANCING
      float swP = instanceMatrix[ 3 ].x * 1.7 + instanceMatrix[ 3 ].y * 2.3 + instanceMatrix[ 3 ].z * 1.3;
      ${
        along === "z"
          ? `transformed.y += sin( uWindT * 2.4 + swP ) * ( position.z + 0.5 ) * ${amp.toFixed(3)};`
          : `float swK = ( position.y + 0.5 ) * ${amp.toFixed(3)};
      transformed.x += sin( uWindT * 2.1 + swP ) * swK;
      transformed.z += sin( uWindT * 1.6 + swP * 1.3 ) * swK * 0.6;`
      }
      #endif`,
    );
  });
}
