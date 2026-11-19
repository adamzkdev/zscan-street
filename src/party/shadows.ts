/**
 * The party stage's cast shadows: the scene's sun (k3 world()) throws one shadow map over what the
 * camera looks at, so a pillar, a crate, a tree and every player sit on the ground instead of floating
 * over it. No game asks for it: the stage (post.ts) calls `before()` right before it draws a scene and
 * `after()` right after.
 *
 *   - who casts and who receives is decided here, from the materials: an opaque lit mesh casts and
 *     receives; an unlit one (k3 glow(), the ink outlines, the sky, the sparks) and anything
 *     see-through does neither. `mesh.userData.noShadow = true` opts a mesh out; a mesh a game has
 *     already set `castShadow` on is left as it is. New meshes (a crate dropped in mid-game) are picked
 *     up on the next sweep, a few times a second.
 *   - the map follows the camera: a sphere round the spot the camera looks at, snapped to the map's
 *     texels so the shadows' edges don't crawl when the camera moves. The game's own sun is put back
 *     as it was after the draw (a game moves it as a direction, from the origin).
 *   - quality: a computer's high tier (2048) and mid tier (1024); a touch screen has none, to keep
 *     its frame rate; `?shadows=1` forces them on at any tier, `?shadows=0` off.
 */
import * as THREE from "three";

const Q = typeof location !== "undefined" ? new URLSearchParams(location.search) : new URLSearchParams();
const ASK = Q.get("shadows");
/** `?shadows=0`: none anywhere. */
export const SHADOWS_OFF = ASK === "0";
/** `?shadows=1`: on whatever the tier. */
export const SHADOWS_FORCED = ASK === "1";

/** How dark a cast shadow is (1: only the sky's fill light is left in it). */
const DARK = Number(Q.get("shadowk") ?? 0.72);
/** The share of the sky's fill a cast shadow takes with it. */
const AMBIENT = Number(Q.get("shadowa") ?? 0.45);
/** How often the scene is swept for new meshes, in frames. */
const SWEEP = 20;

// A soft edge of our own. three's PCF reads the map through a hardware comparison sampler, which drew
// no shadow at all on a Mac's Metal; its "basic" map is one hard tap. This swaps that one tap for a
// 3 × 3 tent of bilinear weights over 16 taps, on an ordinary sampler, the same on every GPU.
{
  const chunk = THREE.ShaderChunk as unknown as Record<string, string>;
  const src = chunk.shadowmap_pars_fragment;
  // (the basic map's one test, in the directional light's getShadow: the only place this line is; the
  // published build has no comments in its shaders, so nothing else can mark the spot)
  const was = "shadow = step( shadowCoord.z, depth );";
  const i = src.indexOf(was);
  if (i >= 0 && src.indexOf(was, i + 1) < 0)
    chunk.shadowmap_pars_fragment =
      src.slice(0, i) +
      /* glsl */ `{
						vec2 ptUv = shadowCoord.xy * shadowMapSize - 0.5;
						vec2 ptB = floor( ptUv );
						vec2 ptF = ptUv - ptB;
						vec4 ptWx = vec4( 1.0 - ptF.x, 1.0, 1.0, ptF.x );
						vec4 ptWy = vec4( 1.0 - ptF.y, 1.0, 1.0, ptF.y );
						float ptS = 0.0;
						for ( int j = 0; j < 4; j ++ ) for ( int i = 0; i < 4; i ++ )
							ptS += ptWx[ i ] * ptWy[ j ] * step( shadowCoord.z, texture2D( shadowMap, ( ptB + vec2( float( i ), float( j ) ) - 0.5 ) / shadowMapSize ).r );
						shadow = ptS / 9.0;
					}` +
      src.slice(i + was.length);
  else globalThis.console?.warn("[shadows] three's shadow chunk has changed: hard-edged shadows");

  // The party's light is half sky (k3 world(): a strong hemisphere fill), and three shadows the sun
  // alone: on a bright floor a cast shadow hardly showed. The sun's shadow also takes a share of the
  // sky's fill (AMBIENT of it), as an overcast patch does.
  const lights = chunk.lights_fragment_begin;
  const dirWas = "directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;";
  const hemiWas = "irradiance += getHemisphereLightIrradiance( hemisphereLights[ i ], geometryNormal );";
  if (lights.includes(dirWas) && lights.includes(hemiWas))
    chunk.lights_fragment_begin =
      "float ptShade = 1.0;\n" +
      lights
        .replace(dirWas, dirWas.replace("directLight.color *=", "float ptSh = ").replace(/;$/, "; directLight.color *= ptSh; ptShade = min( ptShade, ptSh );"))
        .replace(hemiWas, `irradiance += getHemisphereLightIrradiance( hemisphereLights[ i ], geometryNormal ) * mix( 1.0, ptShade, ${AMBIENT.toFixed(3)} );`);
  else globalThis.console?.warn("[shadows] three's light chunk has changed: the shadows leave the sky's fill alone");
}

type Lit = THREE.Material & { isMeshToonMaterial?: boolean; isMeshLambertMaterial?: boolean; isMeshStandardMaterial?: boolean; isMeshPhongMaterial?: boolean };
const isLit = (m: Lit) => !!(m.isMeshToonMaterial || m.isMeshLambertMaterial || m.isMeshStandardMaterial || m.isMeshPhongMaterial);

const fwd = new THREE.Vector3();
const dir = new THREE.Vector3();
const right = new THREE.Vector3();
const up = new THREE.Vector3();
const focus = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const X = new THREE.Vector3(1, 0, 0);

export class SunShadows {
  private marked = new WeakSet<THREE.Object3D>();
  private scene: THREE.Scene | null = null;
  private sun: THREE.DirectionalLight | null = null;
  private frame = 0;
  private r = 0;
  // the sun as the game left it, put back by after()
  private keep: THREE.DirectionalLight | null = null;
  private pos = new THREE.Vector3();
  private tgt = new THREE.Vector3();

  /** `onMesh`: called once for every mesh the sweep meets (the stage sharpens its textures there, post.ts). */
  constructor(
    gl: THREE.WebGLRenderer,
    private onMesh?: (mesh: THREE.Mesh) => void,
  ) {
    gl.shadowMap.enabled = !SHADOWS_OFF;
    gl.shadowMap.type = THREE.BasicShadowMap;
  }

  /** Whether the sun casts in this scene right now (k3's blob shadows fade under a real one). */
  static on(scene: THREE.Scene) {
    return scene.userData.sunShadows === true;
  }

  /**
   * Before a scene is drawn: `size` the shadow map's side in texels (0: no shadows at this tier).
   */
  before(scene: THREE.Scene, camera: THREE.Camera, size: number) {
    if (scene !== this.scene) {
      this.scene = scene;
      this.sun = null;
      this.frame = 0;
      this.r = 0;
    }
    const sweep = this.frame++ % SWEEP === 0;
    if (sweep) this.sweep(scene);
    if (SHADOWS_OFF) return;
    const sun = this.sun;
    const on = size > 0 && !!sun && sun.visible && sun.intensity > 0.25 && scene.userData.noShadows !== true;
    scene.userData.sunShadows = on;
    if (!sun) return;
    if (!on) {
      if (sun.castShadow) sun.castShadow = false;
      return;
    }
    sun.castShadow = true;
    const sh = sun.shadow;
    if (sh.mapSize.x !== size) sh.mapSize.set(size, size);
    sh.intensity = DARK * ((scene.userData.shadowK as number | undefined) ?? 1);

    // where the camera looks: the ground under its aim, else a point ahead
    camera.getWorldDirection(fwd);
    const eye = camera.getWorldPosition(focus);
    const ey = eye.y;
    let d = 28;
    if (fwd.y < -0.08) d = Math.max(6, Math.min(80, (ey - ((scene.userData.shadowY as number | undefined) ?? 0)) / -fwd.y));
    if (!(d > 0)) d = 28;
    focus.addScaledVector(fwd, d);
    // (the radius moves in steps, so a slow zoom does not re-grid the map every frame)
    const want = Math.max(14, Math.min(90, d * 1.15)) * ((scene.userData.shadowR as number | undefined) ?? 1);
    if (!(this.r > 0) || want > this.r || want < this.r * 0.62) this.r = Math.pow(1.3, Math.ceil(Math.log(want) / Math.log(1.3)));
    const R = this.r;

    // the light's direction, as the game set it (from its target to it)
    this.keep = sun;
    this.pos.copy(sun.position);
    this.tgt.copy(sun.target.position);
    dir.copy(sun.position).sub(sun.target.position);
    if (dir.lengthSq() < 1e-6) dir.set(0.4, 1, 0.3);
    dir.normalize();
    // (a sun on the horizon would smear its shadows across the whole arena: never under ~25°)
    if (dir.y < 0.42) {
      dir.y = 0.42;
      dir.normalize();
    }
    right.crossVectors(Math.abs(dir.y) > 0.99 ? X : UP, dir).normalize();
    up.crossVectors(dir, right).normalize();
    // snap the centre to the map's texels, across the light
    const texel = (2 * R) / size;
    const fx = Math.round(focus.dot(right) / texel) * texel;
    const fy = Math.round(focus.dot(up) / texel) * texel;
    const fz = focus.dot(dir);
    focus.set(0, 0, 0).addScaledVector(right, fx).addScaledVector(up, fy).addScaledVector(dir, fz);

    const back = R + 70;
    sun.target.position.copy(focus);
    sun.position.copy(focus).addScaledVector(dir, back);
    sun.updateMatrixWorld();
    sun.target.updateMatrixWorld();
    const c = sh.camera;
    if (c.right !== R || c.far !== back + R) {
      c.left = -R;
      c.right = R;
      c.top = R;
      c.bottom = -R;
      c.near = 1;
      c.far = back + R;
      c.updateProjectionMatrix();
    }
    sh.bias = -0.0002;
    sh.normalBias = texel * 1.6;
  }

  /** After the draw: the game's sun as it was. */
  after() {
    const sun = this.keep;
    if (!sun) return;
    this.keep = null;
    sun.position.copy(this.pos);
    sun.target.position.copy(this.tgt);
    sun.updateMatrixWorld();
    sun.target.updateMatrixWorld();
  }

  /** Find the sun, and say of every new mesh whether it casts and receives. */
  private sweep(scene: THREE.Scene) {
    let sun = (scene.userData.sun as THREE.DirectionalLight | undefined) ?? null;
    let best: THREE.DirectionalLight | null = null;
    scene.traverse((o) => {
      if (!sun && (o as THREE.DirectionalLight).isDirectionalLight) {
        const l = o as THREE.DirectionalLight;
        if (!best || l.intensity > best.intensity) best = l;
        return;
      }
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || this.marked.has(mesh)) return;
      this.marked.add(mesh);
      this.onMesh?.(mesh);
      if (mesh.userData.noShadow) return;
      const mat = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as Lit | undefined;
      if (!mat) return;
      const lit = isLit(mat);
      // (see-through, unlit, an inverted hull: no shadow; nor a custom shader without its own depth material)
      const solid = lit && !mat.transparent && mat.opacity >= 1 && mat.depthWrite && mat.side !== THREE.BackSide && mat.visible;
      if (solid && !mesh.castShadow) mesh.castShadow = true;
      if (lit && !mesh.receiveShadow) mesh.receiveShadow = true;
    });
    // (a scene with no world(): its brightest directional light)
    this.sun = sun && sun.parent ? sun : best;
  }
}
