import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { CURB } from "../../city/plan";
import { GROUND } from "../../real/ground";
import { kitGeos, kitMeshes, mergeKit, type KitGeos } from "../../real/kitobj";
import { carObject, type CarKind } from "../../real/cars";
import { realBoat } from "../../real/boats";
import { kBeachSet, kLifeguard, type KSlot, type KW } from "../../real/keysreal";
import { keysMat } from "../../real/keysmats";
import { hex, Kit, type V3 } from "../../real/lmkit";
import { placeProps, type PropSpot } from "../../real/props";
import { heightfield, natureMat } from "../../real/terrain";
import { plantTrees, type TreeSpot, type Species } from "../../real/trees";
import { markingsTexture } from "../../textures";
import type { Box, IsleContent, IsleCtx, IsleFacade } from "../types";
import { BAVE, NLAND, NX, NZ, ONSEN, relief, STATION, TERRACE, TOUGE, TOUGE_W, VOLC } from "./plan";

/**
 * ZAKONE's content (the mountain island north of the city, ./plan.ts), in the realistic kit:
 *
 *  - Mount Zuji: the island's ground off the town — the coastal plain, the cone (grass and forest
 *    low, volcanic scree higher, the snow cap and its crater), one heightfield in tiles;
 *  - the Zuji Touge: its asphalt and paint, guardrails both sides, chevrons on the hairpins, the
 *    Fifth Station's car park, its lodge and its lookout over the city;
 *  - Zuji Shrine at the mountain's foot: the great red torii at the end of Bridge Avenue, the stone
 *    stairs and their lanterns, the terrace, the main hall, the five-storey pagoda;
 *  - the onsen town: machiya along its streets (white plaster, dark timber, lattices, noren, a
 *    lantern at the door, tiled roofs), the great ryokan, the bathhouse, the konbini off the bridge,
 *    ramen, izakaya, the sake brewery, the fish market; every front door faces its street;
 *  - the open-air hot spring on the slopes (a pool you can bathe in, its deck, its steam);
 *  - the harbour: piers into the sea, fishing boats; the beach west of the bridge;
 *  - forests on the lower slopes, lamps and vending machines, cars at the kerbs.
 */

type Face = "s" | "n" | "e" | "w";
const OUT: Record<Face, [number, number]> = { s: [0, 1], n: [0, -1], e: [1, 0], w: [-1, 0] };
const Y0 = CURB;

/** Kit geometry by sector (one set of meshes each, culled on its own). */
class Sectors {
  private parts = new Map<string, KitGeos[]>();
  add(g: KitGeos, x: number, z: number) {
    const k = `${Math.floor(x / 160)},${Math.floor(z / 160)}`;
    const l = this.parts.get(k);
    if (l) l.push(g);
    else this.parts.set(k, [g]);
  }
  build(parent: THREE.Object3D, name: string) {
    for (const [, list] of this.parts) {
      const merged = mergeKit(list);
      const box = new THREE.Box3();
      for (const g of Object.values(merged)) if (g) (g.computeBoundingBox(), box.union(g.boundingBox!));
      const c = box.getCenter(new THREE.Vector3()).setY(0);
      for (const g of Object.values(merged)) if (g) (g.translate(-c.x, 0, -c.z), g.computeBoundingSphere());
      const grp = kitMeshes(merged);
      grp.position.copy(c);
      grp.name = name;
      parent.add(grp);
    }
    this.parts.clear();
  }
}

/** Plain geometries by material, merged per 150 m bin. */
class Bins {
  private parts = new Map<THREE.Material, Map<string, THREE.BufferGeometry[]>>();
  add(m: THREE.Material, g: THREE.BufferGeometry) {
    const gg = g.index ? g.toNonIndexed() : g;
    if (!gg.getAttribute("normal")) gg.computeVertexNormals();
    if (!gg.getAttribute("uv")) gg.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(gg.getAttribute("position").count * 2), 2));
    gg.computeBoundingSphere();
    const c = gg.boundingSphere!.center;
    const k = `${Math.floor(c.x / 150)},${Math.floor(c.z / 150)}`;
    let byBin = this.parts.get(m);
    if (!byBin) this.parts.set(m, (byBin = new Map()));
    const l = byBin.get(k);
    if (l) l.push(gg);
    else byBin.set(k, [gg]);
  }
  build(parent: THREE.Object3D, name: string, shadows = true) {
    for (const [m, byBin] of this.parts)
      for (const list of byBin.values()) {
        const geo = mergeGeometries(list, false);
        if (!geo) continue;
        geo.computeBoundingBox();
        const c = geo.boundingBox!.getCenter(new THREE.Vector3());
        geo.translate(-c.x, -c.y, -c.z);
        geo.computeBoundingSphere();
        const mesh = new THREE.Mesh(geo, m);
        mesh.position.copy(c);
        const lit = (m as THREE.MeshBasicMaterial).isMeshBasicMaterial;
        mesh.castShadow = shadows && !lit;
        mesh.receiveShadow = !lit;
        mesh.name = name;
        mesh.matrixAutoUpdate = false;
        mesh.updateMatrix();
        parent.add(mesh);
      }
    this.parts.clear();
  }
}

/** What stands on the slopes and the terrace (the walker's and the car's own rules there: the game's solid shape does not see that high). */
class Obstacles {
  private cells = new Map<number, { x0: number; z0: number; x1: number; z1: number; r: number }[]>();
  private static key = (i: number, j: number) => (i + 4096) * 8192 + (j + 4096);
  /** A box (round corners `r`, 0: square). */
  box(x0: number, z0: number, x1: number, z1: number, r = 0) {
    const o = { x0, z0, x1, z1, r };
    for (let i = Math.floor(x0 / 16); i <= Math.floor(x1 / 16); i++)
      for (let j = Math.floor(z0 / 16); j <= Math.floor(z1 / 16); j++) {
        const k = Obstacles.key(i, j);
        const l = this.cells.get(k);
        if (l) l.push(o);
        else this.cells.set(k, [o]);
      }
  }
  /** A trunk, a post. */
  circle(x: number, z: number, r: number) {
    this.box(x - r, z - r, x + r, z + r, r);
  }
  /** Within `pad` of something: which. */
  hit(x: number, z: number, pad = 0) {
    const l = this.cells.get(Obstacles.key(Math.floor(x / 16), Math.floor(z / 16)));
    if (!l) return null;
    for (const o of l) {
      const dx = Math.max(o.x0 + o.r - x, 0, x - (o.x1 - o.r)),
        dz = Math.max(o.z0 + o.r - z, 0, z - (o.z1 - o.r));
      if (Math.hypot(dx, dz) < o.r + pad) return o;
    }
    return null;
  }
  /** A body of radius r at p: moved out of whatever it overlaps (true if it did). */
  push(p: { x: number; z: number }, r: number) {
    const o = this.hit(p.x, p.z, r);
    if (!o) return false;
    const cx = Math.max(o.x0 + o.r, Math.min(o.x1 - o.r, p.x)),
      cz = Math.max(o.z0 + o.r, Math.min(o.z1 - o.r, p.z));
    let dx = p.x - cx,
      dz = p.z - cz;
    let d = Math.hypot(dx, dz);
    if (d < 1e-4) {
      // inside a square box: out by the nearest side
      const m = [p.x - o.x0, o.x1 - p.x, p.z - o.z0, o.z1 - p.z];
      const i = m.indexOf(Math.min(...m));
      dx = i === 0 ? -1 : i === 1 ? 1 : 0;
      dz = i === 2 ? -1 : i === 3 ? 1 : 0;
      d = 1;
      p.x += dx * (m[i] + r);
      p.z += dz * (m[i] + r);
      return true;
    }
    const want = o.r + r;
    p.x = cx + (dx / d) * want;
    p.z = cz + (dz / d) * want;
    return true;
  }
}

/**
 * The mountain's ground near the camera: the natural ground's material, its fragments let go just
 * short of the camera's far plane (dithered over the last 30 m; `NEAR_FAR`, set each frame by the far
 * mountain below from the camera that draws): beyond, the far mountain is what you see — the sea and
 * the rest end at the far plane too, so nothing covers it there.
 */
const NEAR_FAR = { value: 500 };
let nearM: THREE.MeshStandardMaterial | null = null;
function nearNature() {
  if (nearM) return nearM;
  const base = natureMat();
  const m = base.clone();
  m.onBeforeCompile = (sh, r) => {
    base.onBeforeCompile(sh, r);
    sh.uniforms.uNearFar = NEAR_FAR;
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nuniform float uNearFar;").replace(
      "#include <clipping_planes_fragment>",
      `#include <clipping_planes_fragment>
      {
        float zkD = length(vViewPosition);
        float zkN = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
        if (zkD > uNearFar - 30.0 * zkN) discard;
      }`,
    );
  };
  m.customProgramCacheKey = () => "real-nature-near";
  m.userData.shared = true;
  nearM = m;
  return m;
}

/**
 * Mount Zuji seen from afar (the city, the bridge, the town): the whole island's ground, coarse, drawn
 * first and through everything else (the sky's layer, no depth): each frame brought within the
 * camera's reach (scaled about the camera: the picture is the same, nothing is clipped by the far
 * plane), hazed by its true distance — the scene's fog up close, a lasting haze far away. Whatever is
 * nearer (the near ground, the town, the sea, the bridge) is drawn over it.
 */
function farMountain(snowAt: (x: number, z: number) => number) {
  const [geo] = heightfield({
    x0: VOLC.x - VOLC.coast - 60,
    x1: VOLC.x + VOLC.coast + 60,
    z0: VOLC.z - VOLC.coast - 60,
    z1: NLAND.z1 + 20,
    step: 12,
    height: (x, z) => (x > NLAND.x0 && x < NLAND.x1 && z > NLAND.z0 && z < NLAND.z1 ? CURB : relief(x, z)),
    keep: (x, z) => relief(x, z) > -2 || (x > NLAND.x0 && x < NLAND.x1 && z > NLAND.z0 && z < NLAND.z1),
    paint: (c, x, z, h) => {
      if (h < 1.2) c.set("#b8aa86");
      else if (h < 118) c.set("#3e5626").lerp(new THREE.Color("#5a6a34"), Math.max(0, (h - 60) / 80));
      else if (h < snowAt(x, z)) c.set("#5e4e42");
      else c.set("#f4f6f8");
    },
  });
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  const corners = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => new THREE.Vector3(i & 1 ? bb.max.x : bb.min.x, i & 2 ? bb.max.y : bb.min.y, i & 4 ? bb.max.z : bb.min.z));
  const u = { uCam: { value: new THREE.Vector3() }, uFogC: { value: new THREE.Color() }, uFogN: { value: 200 }, uFogF: { value: 430 } };
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, fog: false, depthTest: false, depthWrite: false });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nuniform vec3 uCam;\nvarying float vTrue;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvTrue = distance(position, uCam);");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform vec3 uFogC;\nuniform float uFogN, uFogF;\nvarying float vTrue;")
      .replace(
        "#include <dithering_fragment>",
        `#include <dithering_fragment>
        {
          float near = smoothstep(uFogN, uFogF, vTrue);
          float far = 0.24 + 0.3 * clamp((vTrue - 300.0) / 2400.0, 0.0, 1.0);
          gl_FragColor.rgb = mix(gl_FragColor.rgb, uFogC, min(near, far));
        }`,
      );
  };
  m.customProgramCacheKey = () => "zakone-far";
  const mesh = new THREE.Mesh(geo, m);
  mesh.name = "zakone:far";
  mesh.renderOrder = -999;
  mesh.frustumCulled = false;
  mesh.matrixAutoUpdate = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.userData.noField = true;
  const cam = new THREE.Vector3();
  const T = new THREE.Matrix4(),
    Sm = new THREE.Matrix4(),
    Tb = new THREE.Matrix4();
  mesh.onBeforeRender = (_r, scene, camera) => {
    camera.getWorldPosition(cam);
    let far = 0;
    for (const p of corners) far = Math.max(far, p.distanceTo(cam));
    const camFar = (camera as THREE.PerspectiveCamera).far || 500;
    const reach = Math.max(10, camFar * 0.9);
    NEAR_FAR.value = camFar * 0.97;
    const k = Math.min(1, reach / far);
    T.makeTranslation(cam.x, cam.y, cam.z);
    Sm.makeScale(k, k, k);
    Tb.makeTranslation(-cam.x, -cam.y, -cam.z);
    mesh.matrixWorld.copy(T).multiply(Sm).multiply(Tb);
    u.uCam.value.copy(cam);
    const f = scene.fog as THREE.Fog | null;
    if (f && (f as THREE.Fog).isFog) {
      u.uFogC.value.copy(f.color);
      u.uFogN.value = f.near;
      u.uFogF.value = f.far;
    } else {
      u.uFogN.value = 1e5;
      u.uFogF.value = 2e5;
    }
  };
  return mesh;
}

/** A lit board with a name on it (one draw: a canvas on a plane). */
function sign(text: string, w: number, h: number, color: string, bg = "rgba(0,0,0,0)", vertical = false) {
  const c = document.createElement("canvas");
  c.width = vertical ? 256 : 1024;
  c.height = Math.round((c.width * h) / w);
  const g = c.getContext("2d")!;
  g.fillStyle = bg;
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = color;
  g.textAlign = "center";
  g.textBaseline = "middle";
  if (vertical) {
    // (top to bottom, a character a line: the Japanese shop sign)
    const chars = [...text];
    const fs = Math.min(c.width * 0.8, (c.height * 0.92) / chars.length);
    g.font = `700 ${Math.round(fs)}px "Hiragino Mincho ProN", "Yu Mincho", serif`;
    chars.forEach((ch, i) => g.fillText(ch, c.width / 2, c.height * 0.04 + fs * (i + 0.5)));
  } else {
    g.font = `800 ${Math.round(c.height * 0.66)}px "Hiragino Sans", "Helvetica Neue", Arial, sans-serif`;
    g.fillText(text, c.width / 2, c.height * 0.54, c.width * 0.94);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  const m = new THREE.MeshBasicMaterial({ map: t, transparent: true, toneMapped: false, color: new THREE.Color(1.25, 1.25, 1.25) });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
  mesh.name = `zakone:sign:${text}`;
  return mesh;
}
function put(mesh: THREE.Object3D, x: number, y: number, z: number, face: Face) {
  mesh.position.set(x, y, z);
  mesh.rotation.y = face === "s" ? 0 : face === "n" ? Math.PI : face === "e" ? Math.PI / 2 : -Math.PI / 2;
  return mesh;
}

/** A frame on a building's front: (u along the front, y up, d out of it) → world, for a front facing `face` at `front`, centred `at`. */
function frame(face: Face, front: number, at: number) {
  const [ox, oz] = OUT[face];
  return (u: number, y: number, d: number): V3 => (ox === 0 ? [at + u * (oz > 0 ? 1 : -1), y, front + d * oz] : [front + d * ox, y, at + u * (ox > 0 ? -1 : 1)]);
}

/** A hipped roof over a rectangle (eaves `over` out, at `y`, its ridge `rise` up), in slot `slot`, a ridge cap and the eaves' fascia. */
function hipRoof(K: Kit, x0: number, z0: number, x1: number, z1: number, y: number, rise: number, over: number, col: V3, slot: "tile" | "lm.paint" = "tile", fascia: V3 = hex("#3a2a20")) {
  const X0 = x0 - over,
    X1 = x1 + over,
    Z0 = z0 - over,
    Z1 = z1 + over;
  const along = X1 - X0 >= Z1 - Z0;
  const cx = (X0 + X1) / 2,
    cz = (Z0 + Z1) / 2;
  const hw = (along ? Z1 - Z0 : X1 - X0) / 2;
  const top = y + rise;
  const uvS = (p: V3): [number, number] => [(along ? p[0] : p[2]) / 1.6, (p[1] - y) / 0.9];
  if (along) {
    const r0: V3 = [X0 + hw, top, cz],
      r1: V3 = [X1 - hw, top, cz];
    K.quad(slot, [X0, y, Z1], [X1, y, Z1], r1, r0, [0, 0.7, 0.7], uvS, col);
    K.quad(slot, [X1, y, Z0], [X0, y, Z0], r0, r1, [0, 0.7, -0.7], uvS, col);
    K.tri(slot, [X0, y, Z0], [X0, y, Z1], r0, [-0.7, 0.7, 0], uvS, col);
    K.tri(slot, [X1, y, Z1], [X1, y, Z0], r1, [0.7, 0.7, 0], uvS, col);
    if (r1[0] > r0[0]) K.box("lm.dark", r0[0] - 0.2, top - 0.15, cz - 0.22, r1[0] + 0.2, top + 0.22, cz + 0.22, hex("#2c2e32"));
  } else {
    const r0: V3 = [cx, top, Z0 + hw],
      r1: V3 = [cx, top, Z1 - hw];
    K.quad(slot, [X1, y, Z0], [X1, y, Z1], r1, r0, [0.7, 0.7, 0], uvS, col);
    K.quad(slot, [X0, y, Z1], [X0, y, Z0], r0, r1, [-0.7, 0.7, 0], uvS, col);
    K.tri(slot, [X0, y, Z0], [X1, y, Z0], r0, [0, 0.7, -0.7], uvS, col);
    K.tri(slot, [X1, y, Z1], [X0, y, Z1], r1, [0, 0.7, 0.7], uvS, col);
    if (r1[2] > r0[2]) K.box("lm.dark", cx - 0.22, top - 0.15, r0[2] - 0.2, cx + 0.22, top + 0.22, r1[2] + 0.2, hex("#2c2e32"));
  }
  // the soffit under the eaves, the fascia board round them
  K.quad("wood", [X0, y - 0.02, Z0], [X1, y - 0.02, Z0], [X1, y - 0.02, Z1], [X0, y - 0.02, Z1], [0, -1, 0], (p) => [p[0] / 2, p[2] / 2], hex("#6a4c36"));
  K.box("wood", X0 - 0.06, y - 0.28, Z0 - 0.06, X1 + 0.06, y + 0.02, Z0 + 0.1, fascia);
  K.box("wood", X0 - 0.06, y - 0.28, Z1 - 0.1, X1 + 0.06, y + 0.02, Z1 + 0.06, fascia);
  K.box("wood", X0 - 0.06, y - 0.28, Z0, X0 + 0.1, y + 0.02, Z1, fascia);
  K.box("wood", X1 - 0.1, y - 0.28, Z0, X1 + 0.06, y + 0.02, Z1, fascia);
}

export default async function build(ctx: IsleCtx, roots: unknown): Promise<IsleContent> {
  const { root, near } = roots as { root: THREE.Group; near: THREE.Group };
  const S = new Sectors();
  const B = new Bins();
  const ob = new Obstacles();
  const facades: IsleFacade[] = [];
  const places: { name: string; box: Box }[] = [];
  const props: PropSpot[] = [];
  const trees: TreeSpot[] = [];
  const signs = new THREE.Group();
  signs.name = "zakone:signs";
  root.add(signs);
  let seed = 7171;
  const rnd = () => ((seed = (Math.imul(seed ^ (seed >>> 15), 0x2c1b3c6d) + 0x9e3779b9) >>> 0) / 4294967296);
  const inLand = (x: number, z: number, m = 0) => x > NLAND.x0 - m && x < NLAND.x1 + m && z > NLAND.z0 - m && z < NLAND.z1 + m;

  /**
   * A front door on a building's front (`face`, the front line `front`, centred `at`): a wooden frame,
   * sliding lattice doors with the warm light of the room behind, a noren curtain over them, a paper
   * lantern either side. The game's door (a building type for the interiors) faces the street.
   */
  const door = (K: Kit, face: Face, at: number, front: number, type: string, o: { w?: number; h?: number; noren?: string; y?: number; lanterns?: boolean } = {}) => {
    const w = o.w ?? 2.6,
      h = o.h ?? 2.4,
      y0 = o.y ?? Y0;
    const P = frame(face, front, at);
    const box = (slot: string, u0: number, u1: number, ya: number, yb: number, d0: number, d1: number, col: V3) => {
      const a = P(u0, ya, d0),
        b = P(u1, yb, d1);
      K.box(slot as never, Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2]), Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.max(a[2], b[2]), col);
    };
    // the room's light behind, the two leaves (glass in a lattice), the frame
    box("lm.glow", -w / 2, w / 2, y0 + 0.02, y0 + h, 0.01, 0.04, hex("#ffd8a0", 0.5));
    box("lm.glass", -w / 2, w / 2, y0 + 0.02, y0 + h, 0.05, 0.08, hex("#2a2620"));
    for (let u = -w / 2; u <= w / 2 + 1e-6; u += w / 6) box("wood", u - 0.03, u + 0.03, y0, y0 + h, 0.06, 0.12, hex("#4a3426"));
    for (const yy of [0.9, 1.7]) box("wood", -w / 2, w / 2, y0 + yy - 0.03, y0 + yy + 0.03, 0.06, 0.12, hex("#4a3426"));
    box("wood", -w / 2 - 0.18, -w / 2, y0, y0 + h + 0.2, 0.02, 0.22, hex("#3a281c"));
    box("wood", w / 2, w / 2 + 0.18, y0, y0 + h + 0.2, 0.02, 0.22, hex("#3a281c"));
    box("wood", -w / 2 - 0.18, w / 2 + 0.18, y0 + h, y0 + h + 0.24, 0.02, 0.24, hex("#3a281c"));
    // the noren: split cloth hanging from a rod over the door
    const nc = hex(o.noren ?? "#2a3a6a");
    for (let k = 0; k < 3; k++) {
      const u0 = -w / 2 + 0.05 + (k * (w - 0.1)) / 3,
        u1 = u0 + (w - 0.1) / 3 - 0.06;
      box("fabric", u0, u1, y0 + h - 0.85, y0 + h - 0.02, 0.26, 0.3, nc);
    }
    box("wood", -w / 2 - 0.1, w / 2 + 0.1, y0 + h - 0.04, y0 + h + 0.02, 0.24, 0.32, hex("#2a1e16"));
    // the step, the lanterns
    box("lm.Concrete034", -w / 2 - 0.4, w / 2 + 0.4, y0 - 0.02, y0 + 0.08, 0, 0.7, hex("#b8b2a8"));
    if (o.lanterns !== false)
      for (const s of [-1, 1]) {
        const p = P(s * (w / 2 + 0.55), y0 + 2.0, 0.35);
        K.sphere("lm.glow", p[0], p[1], p[2], 0.2, hex("#ff6a3a", 0.75), { segs: 10, sy: 1.35 });
        K.box("lm.dark", p[0] - 0.13, p[1] + 0.3, p[2] - 0.13, p[0] + 0.13, p[1] + 0.36, p[2] + 0.13, hex("#222"));
      }
    const d = P(0, 0, 0.45);
    const [ox] = OUT[face];
    facades.push({ type, face, x0: ox === 0 ? at - w / 2 : front, x1: ox === 0 ? at + w / 2 : front, z: ox === 0 ? front : at, out: { x: OUT[face][0], y: 0, z: OUT[face][1] }, door: { x: d[0], z: d[2] } });
  };

  /** A footprint behind a front: `frontage` wide, `depth` deep. */
  const lot = (face: Face, front: number, at: number, frontage: number, depth: number): Box => {
    const h = frontage / 2;
    if (face === "s") return { x0: at - h, x1: at + h, z0: front - depth, z1: front };
    if (face === "n") return { x0: at - h, x1: at + h, z0: front, z1: front + depth };
    if (face === "e") return { x0: front - depth, x1: front, z0: at - h, z1: at + h };
    return { x0: front, x1: front + depth, z0: at - h, z1: at + h };
  };

  const PLASTER = ["#ece6d8", "#e6dccb", "#efe9de", "#d9cdb8", "#e2d8c6"];
  const TIMBER = ["#d2aa7e", "#c49a6c", "#dcb48a", "#b88e62"];
  const NOREN = ["#2a3a6a", "#7a1e22", "#1e3a2e", "#3a2a4a", "#c8b48a", "#24405a"];

  /**
   * A machiya: two storeys of white plaster and dark timber, the shop's open front below (its lattice,
   * its lit room, the noren and the door), the upper floor's slatted lattice, a small eave between
   * the floors, the tiled roof with its ridge along the street; a sign (vertical, or a board).
   */
  const machiya = (face: Face, front: number, at: number, frontage: number, depth: number, type: string, label?: string) => {
    const K = new Kit({ lod: 0 });
    const b = lot(face, front, at, frontage, depth);
    const wallC = hex(PLASTER[Math.floor(rnd() * PLASTER.length)]);
    const woodC = hex(TIMBER[Math.floor(rnd() * TIMBER.length)]);
    const h1 = 3.4,
      h2 = 3.0 + (rnd() < 0.3 ? 0.8 : 0);
    const H = h1 + h2;
    K.box("plaster", b.x0, Y0, b.z0, b.x1, Y0 + H, b.z1, wallC, { skip: "-y" });
    // timber: the corner posts, the floor band, the sill
    for (const [x, z] of [
      [b.x0, b.z0],
      [b.x1, b.z0],
      [b.x0, b.z1],
      [b.x1, b.z1],
    ])
      K.box("wood", x - 0.16, Y0, z - 0.16, x + 0.16, Y0 + H, z + 0.16, woodC);
    K.box("wood", b.x0 - 0.1, Y0 + h1 - 0.15, b.z0 - 0.1, b.x1 + 0.1, Y0 + h1 + 0.15, b.z1 + 0.1, woodC);
    const P = frame(face, front, at);
    const fb = (slot: string, u0: number, u1: number, y0: number, y1: number, d0: number, d1: number, col: V3) => {
      const a = P(u0, y0, d0),
        c = P(u1, y1, d1);
      K.box(slot as never, Math.min(a[0], c[0]), Math.min(a[1], c[1]), Math.min(a[2], c[2]), Math.max(a[0], c[0]), Math.max(a[1], c[1]), Math.max(a[2], c[2]), col);
    };
    const half = frontage / 2;
    // the ground floor's front: posts every 1.8 m, lattice and glass between (the door in the middle)
    const dw = Math.min(2.6, frontage * 0.3);
    for (let u = -half + 0.2; u < half; u += 1.8) fb("wood", u - 0.09, u + 0.09, Y0, Y0 + h1 - 0.15, 0, 0.14, woodC);
    for (const s of [-1, 1]) {
      const u0 = s < 0 ? -half + 0.3 : dw / 2 + 0.25,
        u1 = s < 0 ? -dw / 2 - 0.25 : half - 0.3;
      if (u1 - u0 < 0.4) continue;
      // (a shop window with its lit room behind, in a timber frame; plaster round it)
      fb("lm.glow", u0, u1, Y0 + 0.7, Y0 + h1 - 0.6, 0.0, 0.03, hex("#ffe2bc", 0.85));
      fb("lm.glass", u0, u1, Y0 + 0.7, Y0 + h1 - 0.6, 0.04, 0.07, hex("#9a968a"));
      for (let u = u0; u < u1; u += 0.6) fb("wood", u, u + 0.05, Y0 + 0.7, Y0 + h1 - 0.6, 0.07, 0.11, woodC);
      fb("wood", u0 - 0.06, u1 + 0.06, Y0 + h1 - 0.66, Y0 + h1 - 0.54, 0.0, 0.12, woodC);
      fb("wood", u0 - 0.06, u1 + 0.06, Y0 + 0.62, Y0 + 0.74, 0.0, 0.12, woodC);
      fb("plaster", u0, u1, Y0, Y0 + 0.62, 0.0, 0.06, hex("#e8e2d6"));
    }
    // the upper floor: a slatted lattice window (mushiko) in the plaster, its room lit behind at night
    {
      const lw = Math.min(frontage * 0.62, 6.5);
      fb("lm.glow", -lw / 2, lw / 2, Y0 + h1 + 0.75, Y0 + H - 0.65, 0.0, 0.03, hex("#ffd8a8", 0.22));
      for (let u = -lw / 2; u < lw / 2; u += 0.2) fb("wood", u, u + 0.06, Y0 + h1 + 0.75, Y0 + H - 0.65, 0.04, 0.09, woodC);
      fb("wood", -lw / 2 - 0.12, lw / 2 + 0.12, Y0 + h1 + 0.65, Y0 + h1 + 0.78, 0.0, 0.12, woodC);
      fb("wood", -lw / 2 - 0.12, lw / 2 + 0.12, Y0 + H - 0.68, Y0 + H - 0.55, 0.0, 0.12, woodC);
    }
    // the eave between the floors (tiles on a timber bracket)
    {
      const a = P(-half - 0.2, Y0 + h1 + 0.45, 0),
        c = P(half + 0.2, Y0 + h1 + 0.45, 0),
        d1 = P(half + 0.2, Y0 + h1 + 0.05, 1.0),
        d0 = P(-half - 0.2, Y0 + h1 + 0.05, 1.0);
      const [ox, oz] = OUT[face];
      K.quad("tile", a, c, d1, d0, [ox * 0.6, 0.8, oz * 0.6], (p) => [(ox === 0 ? p[0] : p[2]) / 1.6, p[1] / 0.9], hex("#5a5c62"));
    }
    // the roof: a gable, its ridge along the street
    {
      const over = 0.7;
      const yE = Y0 + H;
      const rise = Math.min(2.6, depth * 0.3);
      const [ox] = OUT[face];
      if (ox === 0) {
        const cz = (b.z0 + b.z1) / 2;
        const X0 = b.x0 - 0.3,
          X1 = b.x1 + 0.3;
        const uv = (p: V3): [number, number] => [p[0] / 1.6, p[1] / 0.9];
        K.quad("tile", [X0, yE, b.z1 + over], [X1, yE, b.z1 + over], [X1, yE + rise, cz], [X0, yE + rise, cz], [0, 0.8, 0.6], uv, hex("#55585e"));
        K.quad("tile", [X1, yE, b.z0 - over], [X0, yE, b.z0 - over], [X0, yE + rise, cz], [X1, yE + rise, cz], [0, 0.8, -0.6], uv, hex("#55585e"));
        for (const x of [b.x0, b.x1]) K.tri("plaster", [x, yE, b.z0], [x, yE, b.z1], [x, yE + rise - 0.05, cz], [x === b.x0 ? -1 : 1, 0, 0], (p) => [p[2] / 2.5, p[1] / 2.5], wallC);
        K.box("lm.dark", X0 - 0.1, yE + rise - 0.12, cz - 0.2, X1 + 0.1, yE + rise + 0.22, cz + 0.2, hex("#2c2e32"));
      } else {
        const cx = (b.x0 + b.x1) / 2;
        const Z0 = b.z0 - 0.3,
          Z1 = b.z1 + 0.3;
        const uv = (p: V3): [number, number] => [p[2] / 1.6, p[1] / 0.9];
        K.quad("tile", [b.x1 + over, yE, Z1], [b.x1 + over, yE, Z0], [cx, yE + rise, Z0], [cx, yE + rise, Z1], [0.6, 0.8, 0], uv, hex("#55585e"));
        K.quad("tile", [b.x0 - over, yE, Z0], [b.x0 - over, yE, Z1], [cx, yE + rise, Z1], [cx, yE + rise, Z0], [-0.6, 0.8, 0], uv, hex("#55585e"));
        for (const z of [b.z0, b.z1]) K.tri("plaster", [b.x0, yE, z], [b.x1, yE, z], [cx, yE + rise - 0.05, z], [0, 0, z === b.z0 ? -1 : 1], (p) => [p[0] / 2.5, p[1] / 2.5], wallC);
        K.box("lm.dark", cx - 0.2, yE + rise - 0.12, Z0 - 0.1, cx + 0.2, yE + rise + 0.22, Z1 + 0.1, hex("#2c2e32"));
      }
    }
    door(K, face, at, front, type, { w: dw, noren: NOREN[Math.floor(rnd() * NOREN.length)] });
    S.add(kitGeos(K.out()), (b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2);
    ob.box(b.x0, b.z0, b.x1, b.z1);
    // the sign: a vertical board by the door (Japanese), or a board under the eave (English)
    if (label) {
      const [ox, oz] = OUT[face];
      const v = /[^\x00-\x7f]/.test(label);
      const at2 = v ? P(-half + 0.55, Y0 + h1 + 1.6, 0.35) : P(0, Y0 + h1 + 0.95, 0.62);
      const m = v ? sign(label, 0.7, 2.6, "#f6efe2", "rgba(40,26,18,0.92)", true) : sign(label, Math.min(frontage - 1, 6), 0.8, "#2a1e16", "rgba(236,226,206,0.96)");
      put(m, at2[0] + ox * 0.01, at2[1], at2[2] + oz * 0.01, face);
      signs.add(m);
    }
    return b;
  };

  /** A row of machiya along a street front from u0 to u1 (lots of 8–13 m), some named. */
  const row = (face: Face, front: number, from: number, to: number, depth: number, names: string[] = [], types: string[] = ["machiya", "shophouse", "izakaya"]) => {
    let u = from;
    let i = 0;
    while (to - u > 7.5) {
      const f = Math.min(to - u, 8 + Math.floor(rnd() * 5));
      if (to - u - f < 7.5 && to - u - f > 0) {
        // (the last lot takes what is left)
        const g = to - u;
        machiya(face, front, u + g / 2, g - 0.3, depth, types[i % types.length], names[i]);
        break;
      }
      machiya(face, front, u + f / 2, f - 0.3, depth, types[i % types.length], names[i]);
      u += f;
      i++;
    }
  };

  // ---------------------------------------------------------------------------------------------------
  // Mount Zuji: the island's ground off the town (the coastal plain, the cone, the snow, the crater)
  {
    const isle = ctx.isle;
    const bx = isle.box;
    const TILE = 100;
    const step = 4;
    const mat = nearNature();
    const snowAt = (x: number, z: number) => 198 + 12 * Math.sin(x * 0.05 + z * 0.03) + 9 * Math.sin(Math.atan2(x - VOLC.x, z - VOLC.z) * 11);
    const keep = (x: number, z: number) => {
      if (inLand(x, z, -0.5)) return false;
      const r = relief(x, z);
      return r >= ctx.ground(x, z) - 0.35;
    };
    for (let tx = bx.x0; tx < bx.x1; tx += TILE)
      for (let tz = bx.z0; tz < bx.z1; tz += TILE) {
        const x1 = Math.min(bx.x1, tx + TILE),
          z1 = Math.min(bx.z1, tz + TILE);
        // (a tile all sea or all town: nothing to draw)
        let any = false;
        for (let x = tx; x <= x1 && !any; x += 20) for (let z = tz; z <= z1 && !any; z += 20) if (keep(x, z) && relief(x, z) > -3) any = true;
        if (!any) continue;
        const [geo] = heightfield({
          x0: tx,
          x1,
          z0: tz,
          z1,
          step,
          height: (x, z) => (inLand(x, z, 0) ? CURB - 0.05 : relief(x, z)),
          keep: (x, z) => keep(x, z),
          paint: (c, x, z, h, slope) => {
            const n = Math.sin(x * 0.37 + z * 0.11) * 0.5 + Math.sin(x * 0.07 - z * 0.13) * 0.5;
            const road = TOUGE.project(x, z);
            if (road && Math.abs(road.off) < TOUGE_W.rail + 2.2) {
              c.set("#7e786c");
              return;
            }
            // (patches at three scales: groves' shade, meadows, bare earth)
            const big = Math.sin(x * 0.011 + 1.3) * Math.cos(z * 0.013 - 0.4);
            const mid = Math.sin(x * 0.043 - z * 0.031) * 0.5 + Math.sin(x * 0.021 + z * 0.057) * 0.5;
            const snow = snowAt(x, z);
            if (h < 0.6) c.set(h < -1.2 ? "#5e5a4c" : "#cdbb92");
            else if (h < 1.6) c.set("#9aa266").lerp(new THREE.Color("#cdbb92"), 1 - (h - 0.6));
            else if (h < 110) {
              c.set(big > 0.2 ? "#3e5a24" : mid > 0.35 ? "#7a8a3e" : n > 0.3 ? "#4e6a2c" : "#5c7a34");
              if (mid < -0.55 && big < 0) c.lerp(new THREE.Color("#7a6648"), 0.55);
              c.lerp(new THREE.Color("#6a7238"), Math.max(0, (h - 55) / 90));
            } else if (h < snow) {
              // the scree: grey-brown, banded by the gullies; darker lava rock on the steep
              c.set(mid > 0 ? "#7a6a5a" : "#665a50").lerp(new THREE.Color("#4e4640"), Math.min(1, (h - 110) / 80));
              if (h < 125) c.lerp(new THREE.Color("#6a7238"), (125 - h) / 15);
            } else c.set("#f4f6f8").lerp(new THREE.Color("#c4c8d0"), Math.max(0, n) * 0.35 + (h < snow + 6 ? 0.35 : 0));
            if (slope > 0.62 && h < snow - 4) c.lerp(new THREE.Color("#5a524c"), Math.min(0.85, (slope - 0.62) * 1.6));
          },
        });
        geo.computeBoundingBox();
        const ctr = geo.boundingBox!.getCenter(new THREE.Vector3());
        geo.translate(-ctr.x, 0, -ctr.z);
        geo.computeBoundingSphere();
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(ctr.x, 0, ctr.z);
        mesh.receiveShadow = true;
        mesh.castShadow = true;
        mesh.name = "zakone:mountain";
        mesh.matrixAutoUpdate = false;
        mesh.updateMatrix();
        root.add(mesh);
        await ctx.yieldFrame();
      }
    places.push({ name: "Mount Zuji", box: { x0: VOLC.x - 300, x1: VOLC.x + 300, z0: VOLC.z - 300, z1: VOLC.z + 300 } });
    root.add(farMountain(snowAt));
  }

  // ---------------------------------------------------------------------------------------------------
  // the Zuji Touge: asphalt and paint, the guardrails, chevrons on the hairpins, the Fifth Station
  {
    const asphalt = GROUND.asphalt(markingsTexture(16, TOUGE_W.half * 2, [], 2));
    const railM = new THREE.MeshStandardMaterial({ color: "#d6d9dc", roughness: 0.35, metalness: 0.75 });
    const postM = new THREE.MeshStandardMaterial({ color: "#9a9ea2", roughness: 0.5, metalness: 0.6 });
    const chevM = new THREE.MeshStandardMaterial({ color: "#f2c230", roughness: 0.6 });
    const chevB = new THREE.MeshStandardMaterial({ color: "#1c1c1e", roughness: 0.6 });
    const reflM = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.1, 0.4), toneMapped: false });
    // where the road leaves the town's paving
    let s0 = 0;
    while (s0 < TOUGE.length && inLand(TOUGE.at(s0).x, TOUGE.at(s0).z, -1)) s0 += 1;
    const s1 = TOUGE.length;
    const pos: number[] = [],
      uv: number[] = [];
    const hw = TOUGE_W.half;
    for (let s = s0; s < s1 - 1e-6; s += 2) {
      const q = Math.min(s1, s + 2);
      const A = TOUGE.point(s, -hw, 0.05),
        Bq = TOUGE.point(s, hw, 0.05),
        C = TOUGE.point(q, hw, 0.05),
        D = TOUGE.point(q, -hw, 0.05);
      const T = [
        [s / 16, 1],
        [s / 16, 0],
        [q / 16, 0],
        [q / 16, 1],
      ];
      const P = [A, Bq, C, D];
      for (const o of [0, 2, 1, 0, 3, 2]) pos.push(...P[o]), uv.push(...T[o]);
    }
    const road = new THREE.BufferGeometry();
    road.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    road.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    road.computeVertexNormals();
    // (normals up whatever the winding: the ribbon faces the sky)
    {
      const n = road.getAttribute("normal");
      let up = 0;
      for (let i = 0; i < n.count; i++) up += n.getY(i);
      if (up < 0) {
        const p = road.getAttribute("position");
        for (let i = 0; i < p.count; i += 3) {
          for (let k = 0; k < 3; k++) {
            const t = p.getX(i + 1),
              u = p.getY(i + 1),
              v = p.getZ(i + 1);
            p.setXYZ(i + 1, p.getX(i + 2), p.getY(i + 2), p.getZ(i + 2));
            p.setXYZ(i + 2, t, u, v);
            const a = uv[(i + 1) * 2],
              b = uv[(i + 1) * 2 + 1];
            uv[(i + 1) * 2] = uv[(i + 2) * 2];
            uv[(i + 1) * 2 + 1] = uv[(i + 2) * 2 + 1];
            uv[(i + 2) * 2] = a;
            uv[(i + 2) * 2 + 1] = b;
            break;
          }
        }
        road.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
        road.computeVertexNormals();
      }
    }
    B.add(asphalt, road);
    // the shoulders: gravel strips out to the rails
    // the guardrails (a W-beam on posts every 4 m, both sides, from the plain up), reflectors every 12 m
    const g0 = s0 + 26,
      g1 = s1 - 18;
    for (const sd of [-1, 1]) {
      const off = sd * TOUGE_W.rail;
      const beam: number[] = [];
      for (let s = g0; s < g1 - 1e-6; s += 2) {
        const q = Math.min(g1, s + 2);
        const prof: [number, number][] = [
          [0, 0.55],
          [0.12, 0.62],
          [0.04, 0.7],
          [0.12, 0.78],
          [0, 0.86],
        ];
        for (let k = 0; k + 1 < prof.length; k++) {
          const A = TOUGE.point(s, off + sd * prof[k][0], prof[k][1]),
            Bp = TOUGE.point(s, off + sd * prof[k + 1][0], prof[k + 1][1]),
            C = TOUGE.point(q, off + sd * prof[k + 1][0], prof[k + 1][1]),
            D = TOUGE.point(q, off + sd * prof[k][0], prof[k][1]);
          for (const P of [A, Bp, C, A, C, D, A, C, Bp, A, D, C]) beam.push(...P);
        }
      }
      const bg = new THREE.BufferGeometry();
      bg.setAttribute("position", new THREE.Float32BufferAttribute(beam, 3));
      bg.computeVertexNormals();
      B.add(railM, bg);
      for (let s = g0; s < g1; s += 4) {
        const [x, y, z] = TOUGE.point(s, off - sd * 0.08, 0);
        const p = new THREE.BoxGeometry(0.12, 0.95, 0.12).translate(x, y + 0.47, z);
        B.add(postM, p);
        if (Math.round(s) % 12 < 4) {
          const [rx, ry, rz] = TOUGE.point(s, off - sd * 0.16, 0.74);
          B.add(reflM, new THREE.BoxGeometry(0.06, 0.08, 0.06).translate(rx, ry, rz));
        }
      }
    }
    // chevrons on the outside of each hairpin (where the road turns hard), facing the oncoming cars
    {
      let last = -999;
      for (let s = g0; s < g1; s += 3) {
        const a = TOUGE.at(s),
          b = TOUGE.at(s + 6);
        const turn = Math.atan2(a.tx * b.tz - a.tz * b.tx, a.tx * b.tx + a.tz * b.tz);
        if (Math.abs(turn) < 0.32 || s - last < 7) continue;
        last = s;
        const sd = turn > 0 ? -1 : 1;
        const [x, y, z] = TOUGE.point(s + 3, sd * (TOUGE_W.rail + 0.35), 0);
        const yaw = Math.atan2(-b.tx, -b.tz);
        const g = new THREE.BoxGeometry(1.1, 0.75, 0.05).rotateY(yaw).translate(x, y + 1.35, z);
        B.add(chevM, g);
        const arrow = new THREE.BoxGeometry(0.16, 0.5, 0.06).rotateZ(sd * 0.6).rotateY(yaw).translate(x, y + 1.35, z);
        B.add(chevB, arrow);
        B.add(postM, new THREE.BoxGeometry(0.08, 1.0, 0.08).translate(x, y + 0.5, z));
      }
    }
    // the Fifth Station: the car park, its lines, the lodge, the lookout's railing, vending machines
    {
      const st = STATION;
      const pad = new THREE.CircleGeometry(st.r, 40).rotateX(-Math.PI / 2).translate(st.x, st.y + 0.04, st.z);
      B.add(GROUND.asphalt(), pad);
      const lineM = new THREE.MeshBasicMaterial({ color: "#e8e6e0" });
      for (let k = -5; k <= 5; k++) {
        const g = new THREE.PlaneGeometry(0.12, 4.8).rotateX(-Math.PI / 2).translate(st.x + k * 2.6, st.y + 0.06, st.z - 8);
        B.add(lineM, g);
      }
      const K = new Kit({ lod: 0 });
      // the lodge: timber and stone, a wide roof, its door to the south (the lot)
      const lx = st.x,
        lz = st.z - st.r + 6;
      const lb = { x0: lx - 9, x1: lx + 9, z0: lz - 7, z1: lz + 2 };
      K.box("lm.Bricks083", lb.x0, st.y, lb.z0, lb.x1, st.y + 1.2, lb.z1, hex("#9a948a"), { skip: "-y" });
      K.box("wood", lb.x0, st.y + 1.2, lb.z0, lb.x1, st.y + 4.2, lb.z1, hex("#6a4a32"), { skip: "-y" });
      hipRoof(K, lb.x0, lb.z0, lb.x1, lb.z1, st.y + 4.2, 2.4, 1.4, hex("#4a4c50"));
      door(K, "s", lx, lb.z1, "shophouse", { w: 2.6, y: st.y, noren: "#7a1e22" });
      S.add(kitGeos(K.out()), lx, lz);
      ob.box(lb.x0, lb.z0, lb.x1, lb.z1);
      const m = sign("五合目  FIFTH STATION", 9, 0.9, "#f6efe2", "rgba(40,26,18,0.94)");
      put(m, lx, st.y + 3.6, lb.z1 + 0.05, "s");
      signs.add(m);
      for (const dx of [-12, -13.3]) props.push({ type: "vending", args: ["red"], x: lx + dx, z: lb.z1 - 1, y: st.y, rot: 0 });
      places.push({ name: "the Fifth Station", box: { x0: st.x - st.r, x1: st.x + st.r, z0: st.z - st.r, z1: st.z + st.r } });
    }
    places.push({ name: "Zuji Touge", box: { x0: TOUGE.box.x0, x1: TOUGE.box.x1, z0: TOUGE.box.z0, z1: NLAND.z0 - 20 } });
  }
  await ctx.yieldFrame();

  // ---------------------------------------------------------------------------------------------------
  // Zuji Shrine: the great torii at the end of Bridge Avenue, the stairs, the terrace, the hall, the pagoda
  {
    const K = new Kit({ lod: 0 });
    const red = hex("#c8401c"),
      black = hex("#1e1c1c");
    const T = TERRACE;
    const ax = NX.bridge;
    /** A torii: two round pillars (black feet), the tie beam, the great lintel with its upturned ends. */
    const torii = (x: number, z: number, y: number, w: number, h: number) => {
      for (const s of [-1, 1]) {
        K.cyl("lm.paint", x + s * w / 2, z, h * 0.045, h * 0.04, y + 0.9, y + h * 0.93, red, { sides: 18 });
        K.cyl("lm.dark", x + s * w / 2, z, h * 0.055, h * 0.052, y, y + 0.9, black, { sides: 18, caps: "top" });
        ob.circle(x + s * w / 2, z, h * 0.05);
      }
      K.box("lm.paint", x - w / 2 - h * 0.08, y + h * 0.72, z - h * 0.035, x + w / 2 + h * 0.08, y + h * 0.78, z + h * 0.035, red);
      K.box("lm.paint", x - 0.25, y + h * 0.78, z - h * 0.03, x + 0.25, y + h * 0.9, z + h * 0.03, red);
      K.box("lm.paint", x - w / 2 - h * 0.18, y + h * 0.9, z - h * 0.05, x + w / 2 + h * 0.18, y + h * 0.96, z + h * 0.05, red);
      // the kasagi: black, its ends swept up
      const L = w / 2 + h * 0.26;
      const n = 10;
      for (let k = 0; k < n; k++) {
        const u0 = -L + (2 * L * k) / n,
          u1 = -L + (2 * L * (k + 1)) / n;
        const lift = (u: number) => 0.55 * Math.pow(Math.abs(u) / L, 2.4) * (h / 12);
        K.bar("lm.dark", [x + u0, y + h * 0.985 + lift(u0), z], [x + u1, y + h * 0.985 + lift(u1), z], h * 0.075, black);
      }
    };
    // the great torii on the Sando's north side, at the foot of the stairs
    torii(ax, NLAND.z0 + 4.5, Y0, 11, 13);
    // the stairs up the slope: stone steps between low walls, lanterns either side
    const zA = NLAND.z0 - 1,
      zB = T.z1 + 1;
    const nSteps = 30;
    for (let k = 0; k < nSteps; k++) {
      const z0 = zA - ((zA - zB) * k) / nSteps,
        z1 = zA - ((zA - zB) * (k + 1)) / nSteps;
      const yk = ctx.ground(ax, (z0 + z1) / 2);
      K.box("lm.Bricks008", ax - 6, yk - 0.5, z1, ax + 6, yk + 0.05, z0, hex("#bcb6ac"));
    }
    for (const s of [-1, 1]) {
      for (let z = zA - 2; z > zB + 1; z -= 5) {
        const y = ctx.ground(ax + s * 7.5, z);
        props.push({ type: "stoneLantern", args: [], x: ax + s * 7.6, z, y, rot: 0 });
        ob.circle(ax + s * 7.6, z, 0.45);
      }
    }
    // the terrace: gravel, a stone kerb round it, the second torii, the hall, the pagoda, the purification basin
    K.box("lm.Gravel022", T.x0 + 2, T.y - 0.4, T.z0 + 2, T.x1 - 2, T.y + 0.03, T.z1 - 2, hex("#d4ccc0"), { skip: "-y" });
    torii(ax, T.z1 - 6, T.y, 7, 8.5);
    // the main hall (haiden): a stone base, vermilion posts and white walls, a great hipped roof
    {
      const hb = { x0: ax - 15, x1: ax + 15, z0: T.z0 + 12, z1: T.z0 + 34 };
      K.box("lm.Bricks008", hb.x0 - 1.5, T.y, hb.z0 - 1.5, hb.x1 + 1.5, T.y + 1.1, hb.z1 + 1.5, hex("#aaa49a"), { skip: "-y" });
      K.box("plaster", hb.x0, T.y + 1.1, hb.z0, hb.x1, T.y + 7.4, hb.z1, hex("#f0ebe2"), { skip: "-y" });
      for (let x = hb.x0; x <= hb.x1 + 0.01; x += 3) for (const z of [hb.z0, hb.z1]) K.cyl("lm.paint", x, z, 0.32, 0.32, T.y + 1.1, T.y + 7.4, red, { sides: 12 });
      for (let z = hb.z0; z <= hb.z1 + 0.01; z += 3.6) for (const x of [hb.x0, hb.x1]) K.cyl("lm.paint", x, z, 0.32, 0.32, T.y + 1.1, T.y + 7.4, red, { sides: 12 });
      K.box("lm.paint", hb.x0 - 0.3, T.y + 6.6, hb.z0 - 0.3, hb.x1 + 0.3, T.y + 7.4, hb.z1 + 0.3, red);
      hipRoof(K, hb.x0, hb.z0, hb.x1, hb.z1, T.y + 7.4, 7.2, 3.4, hex("#3c4046"));
      // the front: open lattice doors, the offering box, the rope and its bell, the steps
      K.box("lm.glow", ax - 6, T.y + 1.2, hb.z1 + 0.02, ax + 6, T.y + 5.6, hb.z1 + 0.05, hex("#ffcf90", 0.35));
      for (let x = ax - 6; x <= ax + 6; x += 0.5) K.box("wood", x - 0.04, T.y + 1.2, hb.z1 + 0.05, x + 0.04, T.y + 5.6, hb.z1 + 0.12, hex("#5a3a26"));
      for (let k = 0; k < 5; k++) K.box("lm.Bricks008", ax - 7, T.y + k * 0.22, hb.z1 + 1.5 + (4 - k) * 0.5, ax + 7, T.y + (k + 1) * 0.22, hb.z1 + 1.5 + (5 - k) * 0.5, hex("#b4aea4"));
      K.box("wood", ax - 1.6, T.y + 1.1, hb.z1 + 1.6, ax + 1.6, T.y + 2.1, hb.z1 + 2.6, hex("#5a3a26"));
      K.cyl("lm.paint", ax, hb.z1 + 0.6, 0.12, 0.12, T.y + 2.6, T.y + 6.4, hex("#e8dcc0"), { sides: 8 });
      K.sphere("lm.Metal032.metal", ax, T.y + 6.5, hb.z1 + 0.6, 0.35, hex("#c8a050"), { segs: 10 });
      ob.box(hb.x0 - 1.5, hb.z0 - 1.5, hb.x1 + 1.5, hb.z1 + 1.5);
      places.push({ name: "Zuji Shrine", box: { x0: T.x0, x1: T.x1, z0: T.z0, z1: T.z1 } });
    }
    // the five-storey pagoda, east of the hall
    {
      const px = T.x1 - 22,
        pz = T.z0 + 26;
      const base = 8.4;
      K.box("lm.Bricks008", px - base / 2 - 1.2, T.y, pz - base / 2 - 1.2, px + base / 2 + 1.2, T.y + 1.0, pz + base / 2 + 1.2, hex("#aaa49a"), { skip: "-y" });
      let y = T.y + 1.0;
      for (let k = 0; k < 5; k++) {
        const w = base * (1 - k * 0.09);
        const hh = k === 0 ? 5.4 : 4.4;
        K.box("plaster", px - w / 2, y, pz - w / 2, px + w / 2, y + hh - 1.2, pz + w / 2, hex("#efe8dc"), { skip: "-y" });
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) K.box("lm.paint", px + sx * w / 2 - 0.25, y, pz + sz * w / 2 - 0.25, px + sx * w / 2 + 0.25, y + hh - 1.2, pz + sz * w / 2 + 0.25, red);
        K.box("lm.paint", px - w / 2 - 0.1, y + hh - 1.6, pz - w / 2 - 0.1, px + w / 2 + 0.1, y + hh - 1.2, pz + w / 2 + 0.1, red);
        // its roof: wide, shallow, a hip; the brackets under it
        hipRoof(K, px - w / 2, pz - w / 2, px + w / 2, pz + w / 2, y + hh - 1.2, 1.2, 2.6 - k * 0.15, hex("#3c4046"));
        y += hh;
      }
      // the spire: the nine bronze rings and the jewel
      K.cyl("lm.Metal032.metal", px, pz, 0.22, 0.18, y - 1.5, y + 9, hex("#b88a3a"), { sides: 10 });
      for (let k = 0; k < 9; k++) K.cyl("lm.Metal032.metal", px, pz, 0.62 - k * 0.03, 0.62 - k * 0.03, y + 0.6 + k * 0.78, y + 0.82 + k * 0.78, hex("#b88a3a"), { sides: 14 });
      K.sphere("lm.Metal032.metal", px, y + 9.3, pz, 0.45, hex("#d8aa50"), { segs: 10 });
      ob.box(px - base / 2 - 1.2, pz - base / 2 - 1.2, px + base / 2 + 1.2, pz + base / 2 + 1.2);
    }
    // the purification basin (temizuya) by the stairs' head, a small roof over it
    {
      const bx = ax - 16,
        bz = T.z1 - 12;
      K.box("lm.Bricks008", bx - 1.6, T.y, bz - 0.8, bx + 1.6, T.y + 0.8, bz + 0.8, hex("#8e8a84"));
      K.box("lm.glass", bx - 1.4, T.y + 0.7, bz - 0.6, bx + 1.4, T.y + 0.78, bz + 0.6, hex("#304858"));
      for (const s of [-1, 1]) for (const t of [-1, 1]) K.cyl("lm.paint", bx + s * 2, bz + t * 1.4, 0.14, 0.14, T.y, T.y + 2.8, red, { sides: 8 });
      hipRoof(K, bx - 2, bz - 1.4, bx + 2, bz + 1.4, T.y + 2.8, 1.2, 0.7, hex("#3c4046"));
      ob.box(bx - 2.2, bz - 1.6, bx + 2.2, bz + 1.6);
    }
    for (const [x, z] of [
      [ax - 24, T.z1 - 8],
      [ax + 24, T.z1 - 8],
      [ax - 30, T.z0 + 50],
      [ax + 30, T.z0 + 50],
    ])
      props.push({ type: "stoneLantern", args: [], x, z, y: T.y, rot: 0 });
    // the terrace's trees: maples and pines round its edge
    for (let k = 0; k < 22; k++) {
      const t = k / 22;
      const per = 2 * (T.x1 - T.x0 + T.z1 - T.z0);
      let d = t * per;
      let x: number, z: number;
      const W = T.x1 - T.x0 - 8,
        D = T.z1 - T.z0 - 8;
      d = (d / per) * 2 * (W + D);
      if (d < W) (x = T.x0 + 4 + d), (z = T.z0 + 4);
      else if (d < W + D) (x = T.x1 - 4), (z = T.z0 + 4 + d - W);
      else if (d < 2 * W + D) (x = T.x1 - 4 - (d - W - D)), (z = T.z1 - 4);
      else (x = T.x0 + 4), (z = T.z1 - 4 - (d - 2 * W - D));
      if (Math.abs(x - ax) < 12) continue;
      trees.push({ x, z, y: T.y, species: k % 3 === 0 ? "pine" : "maple", seed: 300 + k });
      ob.circle(x, z, 0.5);
    }
    S.add(kitGeos(K.out()), ax, T.z0 + 30);
    const sg = sign("瑞士神社  ZUJI SHRINE", 7, 0.8, "#f6efe2", "rgba(30,20,14,0.94)");
    put(sg, ax, Y0 + 11.6, NLAND.z0 + 4.5 + 0.5, "s");
    signs.add(sg);
  }
  await ctx.yieldFrame();

  // ---------------------------------------------------------------------------------------------------
  // the onsen town
  {
    const fN = NZ.onsen - 6,
      fS = NZ.onsen + 6;
    // the south blocks (between Shore Road and Onsen Dori) and the north ones (Onsen Dori … the Sando)
    const shoreN = NZ.shore - 5;
    const sandoS = NZ.sando + 5;
    const xs: [number, number][] = [
      [NX.yumoto + 5, NX.gora - 5],
      [NX.gora + 5, NX.bridge - BAVE],
      [NX.bridge + BAVE, NX.miya - 5],
      [NX.miya + 5, NX.minato - 5],
    ];
    // ---- the grand ryokan: north half of the block west of Bridge Avenue, on Onsen Dori ----
    {
      const K = new Kit({ lod: 0 });
      const [x0, x1] = xs[1];
      const b = { x0: x0 + 1, x1: x1 - 1, z0: fS + 1, z1: fS + 30 };
      const wallC = hex("#eee8dc"),
        woodC = hex("#3e2c20");
      // three storeys stepping back, a deep roof on each
      const hs = [4.2, 3.6, 3.6];
      let y = Y0;
      for (let k = 0; k < 3; k++) {
        const ins = k * 1.6;
        const bb = { x0: b.x0 + ins, x1: b.x1 - ins, z0: b.z0 + ins, z1: b.z1 - ins };
        K.box("plaster", bb.x0, y, bb.z0, bb.x1, y + hs[k], bb.z1, wallC, { skip: "-y" });
        // the timber frame: posts every 3 m on the front, the floor band
        for (let x = bb.x0; x <= bb.x1 + 0.01; x += 3) K.box("wood", x - 0.14, y, bb.z0 - 0.14, x + 0.14, y + hs[k], bb.z0 + 0.14, woodC);
        K.box("wood", bb.x0 - 0.1, y + hs[k] - 0.3, bb.z0 - 0.1, bb.x1 + 0.1, y + hs[k], bb.z1 + 0.1, woodC);
        // the windows: shoji glowing behind lattice, every bay
        for (let x = bb.x0 + 0.6; x < bb.x1 - 2; x += 3) {
          K.box("lm.glow", x, y + 1.0, bb.z0 - 0.05, x + 1.8, y + hs[k] - 0.8, bb.z0 - 0.02, hex("#ffe6c0", 0.5));
          for (let u = x; u < x + 1.8; u += 0.3) K.box("wood", u, y + 1.0, bb.z0 - 0.09, u + 0.04, y + hs[k] - 0.8, bb.z0 - 0.05, woodC);
        }
        if (k < 2) hipRoof(K, bb.x0, bb.z0, bb.x1, bb.z1, y + hs[k], 1.1, 1.3, hex("#40444a"));
        y += hs[k];
      }
      hipRoof(K, b.x0 + 3.2, b.z0 + 3.2, b.x1 - 3.2, b.z1 - 3.2, y, 4.2, 1.8, hex("#40444a"));
      // the gate: a roofed entrance out to the street, lanterns, pines either side
      const gx = (b.x0 + b.x1) / 2;
      for (const s of [-1, 1]) K.box("wood", gx + s * 3.2 - 0.25, Y0, b.z0 - 4.2, gx + s * 3.2 + 0.25, Y0 + 4.4, b.z0 - 3.7, woodC);
      hipRoof(K, gx - 3.6, b.z0 - 4.6, gx + 3.6, b.z0 - 3.3, Y0 + 4.4, 1.0, 0.9, hex("#40444a"));
      door(K, "n", gx, b.z0, "izakaya", { w: 3.6, h: 2.8, noren: "#1e2a4a" });
      S.add(kitGeos(K.out()), gx, (b.z0 + b.z1) / 2);
      ob.box(b.x0, b.z0, b.x1, b.z1);
      for (const s of [-1, 1]) trees.push({ x: gx + s * 6.5, z: b.z0 - 3, y: Y0, species: "pine", seed: 90 + s });
      const sg = sign("旅館  瑞士屋", 0.9, 4.2, "#f6efe2", "rgba(30,20,14,0.94)", true);
      put(sg, gx - 4.4, Y0 + 3.4, b.z0 - 4.0, "n");
      signs.add(sg);
      const sg2 = sign("RYOKAN ZUJI-YA", 8, 0.9, "#2a1e16", "rgba(236,226,206,0.96)");
      put(sg2, gx, Y0 + 5.2, b.z0 - 4.65, "n");
      signs.add(sg2);
      places.push({ name: "Ryokan Zuji-ya", box: b });
      // the south half of that block: machiya on Shore Road and on Bridge Avenue
      row("s", shoreN, x0 + 1, x1 - 30, 11, ["土産  SOUVENIRS", "", "甘味  SWEETS"]);
      row("e", x1, shoreN - 28, shoreN - 2, 11, ["", "茶  TEA"]);
    }
    // ---- the block east of Bridge Avenue (south): the konbini on the corner, ramen, izakaya ----
    {
      const [x0, x1] = xs[2];
      // the konbini: glass front on the corner of Shore Road and Bridge Avenue (the first thing off the bridge)
      const K = new Kit({ lod: 0 });
      const b = { x0: x0 + 1, x1: x0 + 21, z0: shoreN - 16, z1: shoreN - 0.5 };
      K.box("plaster", b.x0, Y0, b.z0, b.x1, Y0 + 4.6, b.z1, hex("#f2f2f0"), { skip: "-y" });
      K.box("lm.glow", b.x0 + 0.5, Y0 + 0.1, b.z1 + 0.01, b.x1 - 0.5, Y0 + 3.2, b.z1 + 0.04, hex("#f4fbff", 0.7));
      K.box("lm.glass", b.x0 + 0.5, Y0 + 0.1, b.z1 + 0.05, b.x1 - 0.5, Y0 + 3.2, b.z1 + 0.09, hex("#3a4a52"));
      K.box("lm.paint", b.x0 - 0.1, Y0 + 3.3, b.z1 - 0.1, b.x1 + 0.1, Y0 + 3.8, b.z1 + 0.2, hex("#2aa05a"));
      K.box("lm.paint", b.x0 - 0.1, Y0 + 3.8, b.z1 - 0.1, b.x1 + 0.1, Y0 + 4.2, b.z1 + 0.2, hex("#f4f4f2"));
      K.box("lm.paint", b.x0 - 0.1, Y0 + 4.2, b.z1 - 0.1, b.x1 + 0.1, Y0 + 4.6, b.z1 + 0.2, hex("#2a6ab0"));
      K.box("lm.Concrete034", b.x0 - 0.2, Y0 + 4.6, b.z0 - 0.2, b.x1 + 0.2, Y0 + 5.2, b.z1 + 0.2, hex("#c8c4bc"));
      door(K, "s", b.x1 - 4, b.z1, "streetshop", { w: 2.4, noren: "#f4f4f2", lanterns: false });
      S.add(kitGeos(K.out()), (b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2);
      ob.box(b.x0, b.z0, b.x1, b.z1);
      const sg = sign("ZK MART", 6, 1.2, "#ffffff", "rgba(42,106,176,0.0)");
      put(sg, (b.x0 + b.x1) / 2 - 4, Y0 + 4.0, b.z1 + 0.25, "s");
      signs.add(sg);
      for (const dx of [2.5, 3.9]) props.push({ type: "vending", args: ["blue"], x: b.x0 + dx, z: b.z1 + 1.2, y: Y0, rot: 0 });
      row("s", shoreN, x0 + 22, x1 - 1, 11, ["ラーメン  RAMEN", "", "居酒屋  IZAKAYA", ""], ["izakaya", "shophouse", "izakaya", "machiya"]);
      row("w", x0, shoreN - 70, shoreN - 17, 11, ["寿司  SUSHI", "", "酒  SAKE BAR", "", "宿  INN"], ["izakaya", "shophouse", "izakaya", "machiya", "machiya"]);
      row("n", fS, x0 + 14, x1 - 1, 11, ["蕎麦  SOBA", "", "", "工芸  CRAFTS"]);
    }
    // ---- the sake brewery: Onsen Dori, east block ----
    {
      const [x0, x1] = xs[3];
      const K = new Kit({ lod: 0 });
      const b = { x0: x0 + 1, x1: x0 + 46, z0: fS + 1, z1: fS + 24 };
      K.box("lm.paint", b.x0, Y0, b.z0, b.x1, Y0 + 1.6, b.z1, hex("#2a2624"), { skip: "-y" });
      K.box("plaster", b.x0, Y0 + 1.6, b.z0, b.x1, Y0 + 7.2, b.z1, hex("#f2ede4"), { skip: "-y" });
      // the charred-cedar lower walls' boards, the white storehouse walls, the namako tiles' diamond band
      for (let x = b.x0; x < b.x1; x += 0.4) K.box("wood", x, Y0, b.z0 - 0.06, x + 0.36, Y0 + 1.6, b.z0, hex("#221c18"));
      hipRoof(K, b.x0, b.z0, b.x1, b.z1, Y0 + 7.2, 3.6, 1.2, hex("#3a3e44"));
      // the sugidama (the cedar ball) over the door
      door(K, "n", b.x0 + 12, b.z0, "izakaya", { w: 3.0, noren: "#2a3a2a" });
      K.sphere("lm.Grass004", b.x0 + 12, Y0 + 3.6, b.z0 - 0.9, 0.7, hex("#7a6a3a"), { segs: 12 });
      S.add(kitGeos(K.out()), (b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2);
      ob.box(b.x0, b.z0, b.x1, b.z1);
      const sg = sign("ZUJI SAKE BREWERY", 14, 1.1, "#2a1e16", "rgba(236,226,206,0.96)");
      put(sg, b.x0 + 26, Y0 + 5.6, b.z0 - 0.05, "n");
      signs.add(sg);
      places.push({ name: "Zuji Sake Brewery", box: b });
      row("s", shoreN, x0 + 1, x1 - 1, 11, ["", "魚  FISH", "", "喫茶  CAFE", ""], ["machiya", "izakaya", "shophouse", "izakaya", "machiya"]);
      row("e", x1, fS + 30, NZ.sando - 6, 11, ["市場  MARKET", ""], ["shophouse", "machiya"]);
      row("e", x1, shoreN - 70, shoreN - 16, 11, ["", "", ""]);
      row("n", fS, x0 + 48, x1 - 1, 11, ["", ""]);
    }
    // ---- the west blocks: inns and houses ----
    {
      const [x0, x1] = xs[0];
      row("s", shoreN, x0 + 1, x1 - 1, 12, ["", "宿  INN", "", "", "", ""], ["machiya", "machiya", "shophouse", "machiya"]);
      row("n", fS, x0 + 1, x1 - 1, 12, ["", "湯  BATHS", "", "", ""], ["machiya", "izakaya", "machiya"]);
      row("e", x1, shoreN - 70, shoreN - 14, 11, ["", ""]);
      row("s", NZ.onsen - 6, x0 + 1, x1 - 1, 12, ["旅館  RYOKAN", "", "", ""], ["machiya"]);
      row("n", sandoS, x0 + 1, x1 - 1, 12, ["", "", "宿  INN", ""], ["machiya"]);
    }
    // ---- north of Onsen Dori, east of Bridge Avenue: shrine-side shops on the Sando and on the avenue ----
    {
      const [x0, x1] = xs[2];
      row("n", sandoS, x0 + 1, x1 - 1, 11, ["御守  CHARMS", "", "団子  DANGO", ""], ["shophouse", "machiya", "izakaya"]);
      row("w", x0, sandoS + 13, fN - 13, 11, ["", "茶屋  TEA HOUSE", ""], ["machiya", "izakaya"]);
      row("s", fN, x0 + 12, x1 - 1, 11, ["", "", ""]);
      const [y0, y1] = xs[3];
      row("n", sandoS, y0 + 1, y1 - 1, 11, ["", "", "", ""]);
      row("s", fN, y0 + 1, y1 - 1, 11, ["", "居酒屋  IZAKAYA", "", ""], ["machiya", "izakaya"]);
      row("w", y0, sandoS + 13, fN - 13, 11, ["", ""]);
    }
    // ---- Yumoto Garden: the bathhouse on Onsen Dori, a pond's stones, lanterns, maples ----
    {
      const [x0, x1] = xs[1];
      const K = new Kit({ lod: 0 });
      const b = { x0: x0 + 4, x1: x0 + 34, z0: fN - 20, z1: fN - 1 };
      K.box("lm.Bricks008", b.x0, Y0, b.z0, b.x1, Y0 + 0.8, b.z1, hex("#a8a298"), { skip: "-y" });
      K.box("wood", b.x0, Y0 + 0.8, b.z0, b.x1, Y0 + 5.4, b.z1, hex("#7a5a3e"), { skip: "-y" });
      for (let x = b.x0 + 1; x < b.x1 - 1; x += 3.4) K.box("lm.glow", x, Y0 + 2.0, b.z1 + 0.01, x + 2.2, Y0 + 4.2, b.z1 + 0.04, hex("#ffdcae", 0.5));
      hipRoof(K, b.x0, b.z0, b.x1, b.z1, Y0 + 5.4, 3.8, 1.4, hex("#40444a"));
      // the karahafu: a curved gable over the entrance
      const gx = (b.x0 + b.x1) / 2;
      for (let k = 0; k < 12; k++) {
        const u0 = -3.4 + (6.8 * k) / 12,
          u1 = -3.4 + (6.8 * (k + 1)) / 12;
        const yy = (u: number) => Y0 + 5.2 + 1.3 * Math.cos((u / 3.4) * (Math.PI / 2)) ** 1.5;
        K.bar("tile", [gx + u0, yy(u0), b.z1 + 1.4], [gx + u1, yy(u1), b.z1 + 1.4], 2.4, hex("#40444a"));
      }
      door(K, "s", gx, b.z1, "izakaya", { w: 3.2, noren: "#24405a" });
      S.add(kitGeos(K.out()), gx, (b.z0 + b.z1) / 2);
      ob.box(b.x0, b.z0, b.x1, b.z1);
      const sg = sign("ゆ", 1.6, 1.6, "#ffffff", "rgba(36,64,90,0.95)");
      put(sg, gx, Y0 + 3.4, b.z1 + 0.6, "s");
      signs.add(sg);
      const sg2 = sign("YUMOTO ONSEN", 8, 0.9, "#2a1e16", "rgba(236,226,206,0.96)");
      put(sg2, gx, Y0 + 7.4, b.z1 + 2.6, "s");
      signs.add(sg2);
      places.push({ name: "Yumoto Onsen", box: b });
      // the garden: stepping stones, lanterns, maples, a pine, bamboo
      for (let k = 0; k < 9; k++) props.push({ type: "stoneLantern", args: [], x: x0 + 40 + (k % 3) * 12, z: NZ.sando + 12 + Math.floor(k / 3) * 22, y: Y0, rot: rnd() * 6 });
      for (let k = 0; k < 16; k++) trees.push({ x: x0 + 38 + rnd() * (x1 - x0 - 44), z: NZ.sando + 10 + rnd() * (fN - NZ.sando - 34), y: Y0, species: (k % 4 === 0 ? "pine" : k % 3 === 0 ? "blossom" : "maple") as Species, seed: 500 + k });
      for (let k = 0; k < 6; k++) props.push({ type: "bamboo", args: [], x: x0 + 3, z: NZ.sando + 10 + k * 7, y: Y0, rot: rnd() * 6 });
      places.push({ name: "Yumoto Garden", box: { x0, x1, z0: NZ.sando + 5, z1: fN } });
    }
    places.push({ name: "Zakone", box: NLAND });
  }
  await ctx.yieldFrame();

  // ---------------------------------------------------------------------------------------------------
  // the open-air hot spring on the slopes: the pool's rocks, the deck round it, the fence, the steam
  const steam: THREE.Object3D[] = [];
  {
    const O = ONSEN;
    const K = new Kit({ lod: 0 });
    // the rocks round the rim
    for (let k = 0; k < 44; k++) {
      const a = (k / 44) * Math.PI * 2;
      const x = O.x + Math.cos(a) * O.rx * 1.02,
        z = O.z + Math.sin(a) * O.rz * 1.02;
      const r = 0.7 + rnd() * 0.6;
      K.sphere("lm.Rock030", x, O.deck - 0.2, z, r, hex(rnd() < 0.5 ? "#b2aca2" : "#9c968c"), { segs: 7, sy: 0.6 });
    }
    // the deck (timber, round the pool's far side), the bamboo fence behind it, the changing hut
    const dz0 = O.z - O.rz * 1.5,
      dz1 = O.z - O.rz * 1.05;
    K.box("wood", O.x - O.rx * 1.2, O.deck - 0.1, dz0, O.x + O.rx * 1.2, O.deck + 0.08, dz1, hex("#8a6a4a"));
    for (let x = O.x - O.rx * 1.4; x < O.x + O.rx * 1.4; x += 0.18) K.cyl("lm.paint", x, dz0 - 1.2, 0.07, 0.07, O.deck, O.deck + 2.2, hex("#9a9a5a"), { sides: 6, caps: "top" });
    ob.box(O.x - O.rx * 1.4, dz0 - 1.4, O.x + O.rx * 1.4, dz0 - 1.0);
    const hx = O.x + O.rx * 1.5,
      hz = O.z - O.rz * 0.4;
    K.box("wood", hx - 3, O.deck, hz - 3.5, hx + 3, O.deck + 3.0, hz + 3.5, hex("#6a4a32"), { skip: "-y" });
    hipRoof(K, hx - 3, hz - 3.5, hx + 3, hz + 3.5, O.deck + 3.0, 1.6, 0.9, hex("#40444a"));
    door(K, "w", hz, hx - 3, "izakaya", { w: 1.8, y: O.deck, noren: "#7a1e22" });
    ob.box(hx - 3, hz - 3.5, hx + 3, hz + 3.5);
    for (const [x, z] of [
      [O.x - O.rx * 1.3, O.z + O.rz * 0.6],
      [O.x + O.rx * 1.15, O.z + O.rz * 0.9],
    ])
      props.push({ type: "stoneLantern", args: [], x, z, y: ctx.ground(x, z), rot: 0 });
    S.add(kitGeos(K.out()), O.x, O.z);
    // the water: milky, warm, steaming
    const wm = new THREE.MeshStandardMaterial({ color: "#8ac8c0", roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.86 });
    const water = new THREE.Mesh(new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2).scale(O.rx * 1.05, 1, O.rz * 1.05), wm);
    water.position.set(O.x, O.surface, O.z);
    water.name = "zakone:onsen:water";
    near.add(water);
    const st = document.createElement("canvas");
    st.width = st.height = 64;
    const g = st.getContext("2d")!;
    const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
    grad.addColorStop(0, "rgba(255,255,255,0.5)");
    grad.addColorStop(0.45, "rgba(255,255,255,0.22)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    const stT = new THREE.CanvasTexture(st);
    for (let k = 0; k < 22; k++) {
      const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: stT, transparent: true, depthWrite: false, opacity: 0, color: "#f4f6f8", fog: true }));
      m.position.set(O.x + (rnd() - 0.5) * O.rx * 1.5, O.surface + 0.3, O.z + (rnd() - 0.5) * O.rz * 1.4);
      m.userData.t = rnd();
      m.userData.x = m.position.x;
      m.userData.z = m.position.z;
      m.name = "zakone:steam";
      steam.push(m);
      near.add(m);
    }
    places.push({ name: "Zuji Rotenburo", box: { x0: O.x - O.rx * 1.6, x1: O.x + O.rx * 1.6, z0: O.z - O.rz * 1.8, z1: O.z + O.rz * 1.4 } });
  }
  await ctx.yieldFrame();

  // ---------------------------------------------------------------------------------------------------
  // the harbour east of the town: two piers on piles, the fishing boats, the fish market's shed on the quay
  {
    const K = new Kit({ lod: 0 });
    const piers: [number, number, number][] = [
      [-1392, NLAND.x1 + 4, NLAND.x1 + 84],
      [-1446, NLAND.x1 + 4, NLAND.x1 + 70],
    ];
    const deckY = CURB + 0.55;
    for (const [z, x0, x1] of piers) {
      K.box("lm.Planks021" as never, x0, deckY - 0.3, z - 3, x1, deckY, z + 3, hex("#9a8a74"));
      for (let x = x0 + 2; x < x1; x += 4) for (const s of [-1, 1]) K.cyl("wood", x, z + s * 2.7, 0.2, 0.2, -6, deckY - 0.3, hex("#4a3a2c"), { sides: 6, caps: "none" });
      for (let x = x0 + 6; x < x1; x += 10) for (const s of [-1, 1]) K.cyl("lm.dark", x, z + s * 2.8, 0.18, 0.15, deckY, deckY + 0.5, hex("#2a2a2a"), { sides: 8 });
    }
    // the quay along the town's east edge, out over the beach
    K.box("lm.Concrete034", NLAND.x1 - 0.5, -6, -1470, NLAND.x1 + 6, deckY, -1376, hex("#b8b4ac"));
    S.add(kitGeos(K.out()), NLAND.x1 + 40, -1420);
    const boats: [string, string][] = [
      ["#e8e6e2", "#2a6ab0"],
      ["#2a4a7a", "#f2f0ea"],
      ["#c8302a", "#f2f0ea"],
      ["#f0ece2", "#3a7a4a"],
      ["#1e3a5a", "#e8e2d4"],
      ["#e8e6e2", "#c8302a"],
    ];
    let k = 0;
    for (const [z, x0, x1] of piers)
      for (let x = x0 + 12; x < x1 - 6; x += 14)
        for (const s of [-1, 1]) {
          if (rnd() < 0.25) continue;
          const [h, c] = boats[k++ % boats.length];
          const bt = realBoat(h, c);
          bt.position.set(x, -1.6, z + s * 5.6);
          bt.rotation.y = rnd() < 0.5 ? 0 : Math.PI;
          near.add(bt);
        }
    places.push({ name: "Zakone Harbour", box: { x0: NLAND.x1, x1: NLAND.x1 + 90, z0: -1470, z1: -1370 } });
  }
  await ctx.yieldFrame();

  // ---------------------------------------------------------------------------------------------------
  // the streets' lamps and trees, vending machines at corners
  {
    const LAMP = "#ffc890";
    for (const s of ctx.isle.streets) {
      const len = s.to - s.from;
      for (let u = 10; u < len - 6; u += 26) {
        const along = s.from + u;
        for (const side of [-1, 1]) {
          if ((Math.round(u / 26) + (side > 0 ? 1 : 0)) % 2) continue;
          const off = s.width / 2 + 0.9;
          const [x, z] = s.axis === "x" ? [along, s.at + side * off] : [s.at + side * off, along];
          // (not in a junction)
          if (ctx.isle.streets.some((t) => t !== s && t.axis !== s.axis && Math.abs((s.axis === "x" ? x : z) - t.at) < t.width / 2 + 4)) continue;
          if (ob.hit(x, z, 0.3)) continue;
          props.push({ type: "lamp", args: [LAMP], x, z, y: Y0, rot: s.axis === "x" ? (side > 0 ? Math.PI : 0) : side > 0 ? -Math.PI / 2 : Math.PI / 2 });
        }
      }
    }
    // the promenade along the beach (south of Shore Road) and the quay: lamps, benches, pines
    for (let x = NLAND.x0 + 6; x < NLAND.x1 - 4; x += 16) {
      props.push({ type: "bench", args: [], x, z: NLAND.z1 - 1.4, y: Y0, rot: 0 });
      if (Math.abs(x - NX.bridge) > 22) trees.push({ x: x + 8, z: NLAND.z1 - 2.5, y: Y0, species: "pine", seed: 700 + Math.round(x) });
    }
    for (const [x, z] of [
      [NX.gora + 6.6, NZ.onsen + 7.6],
      [NX.miya - 6.6, NZ.sando - 7.4],
      [NX.minato - 6.6, NZ.onsen - 7.6],
    ])
      props.push({ type: "vending", args: ["red"], x, z, y: Y0, rot: 0 });
  }

  // ---------------------------------------------------------------------------------------------------
  // the forests on the plain and the cone's lower slopes
  {
    const O = ONSEN,
      T = TERRACE;
    for (let x = ctx.isle.box.x0 + 20; x < ctx.isle.box.x1 - 20; x += 13)
      for (let z = ctx.isle.box.z0 + 20; z < NLAND.z0 + 30; z += 13) {
        const px = x + (rnd() - 0.5) * 10,
          pz = z + (rnd() - 0.5) * 10;
        const r = Math.hypot(px - VOLC.x, pz - VOLC.z);
        if (r < 230) continue;
        const h = relief(px, pz);
        if (h < 2.2 || h > 125) continue;
        if (inLand(px, pz, 14)) continue;
        const road = TOUGE.project(px, pz);
        if (road && Math.abs(road.off) < TOUGE_W.rail + 6) continue;
        if (Math.hypot(px - STATION.x, pz - STATION.z) < STATION.r + 10) continue;
        if (px > T.x0 - 6 && px < T.x1 + 6 && pz > T.z0 - 6 && pz < T.z1 + 10) continue;
        if (Math.hypot((px - O.x) / O.rx, (pz - O.z) / O.rz) < 2.4) continue;
        // (thicker low down, thinning out up the cone; a clearing here and there)
        const grove = Math.sin(px * 0.019 + 0.7) * Math.cos(pz * 0.023 - 1.1) + 0.5 * Math.sin(px * 0.047 - pz * 0.039);
        const dense = (grove > 0.35 ? 0.85 : grove > 0 ? 0.32 : 0.06) * (1 - (h / 125) * 0.6);
        if (rnd() > dense) continue;
        const sp: Species = h > 70 ? "pine" : rnd() < 0.55 ? "pine" : rnd() < 0.7 ? "maple" : "broad";
        trees.push({ x: px, z: pz, y: h, species: sp, seed: Math.floor(rnd() * 1e6) });
        ob.circle(px, pz, 0.45);
      }
  }
  // ---------------------------------------------------------------------------------------------------
  // boulders on the slopes and the scree, a tea garden's terraced rows by the town, bicycles at the kerbs
  {
    const K = new Kit({ lod: 0 });
    let n = 0;
    for (let k = 0; k < 900 && n < 160; k++) {
      const a = rnd() * Math.PI * 2,
        r = 120 + rnd() * 420;
      const x = VOLC.x + Math.sin(a) * r,
        z = VOLC.z + Math.cos(a) * r;
      if (inLand(x, z, 20) || z > NLAND.z0 + 10) continue;
      const road = TOUGE.project(x, z);
      if (road && Math.abs(road.off) < TOUGE_W.rail + 5) continue;
      if (Math.hypot(x - STATION.x, z - STATION.z) < STATION.r + 8) continue;
      if (x > TERRACE.x0 - 8 && x < TERRACE.x1 + 8 && z > TERRACE.z0 - 8 && z < TERRACE.z1 + 12) continue;
      if (Math.hypot((x - ONSEN.x) / ONSEN.rx, (z - ONSEN.z) / ONSEN.rz) < 2.6) continue;
      const h = relief(x, z);
      if (h < 3 || h > 205) continue;
      const big = rnd();
      const rr = big < 0.15 ? 2.2 + rnd() * 1.8 : 0.6 + rnd() * 1.1;
      K.sphere("lm.Rock030", x, h - rr * 0.35, z, rr, hex(rnd() < 0.5 ? "#8a847a" : "#6e6860"), { segs: 7, sy: 0.62 + rnd() * 0.3 });
      ob.circle(x, z, rr * 0.85);
      n++;
    }
    // the tea garden: rows of clipped bushes on the gentle ground north-east of the town
    const tx0 = 96,
      tx1 = 176,
      tz0 = -1640,
      tz1 = -1584;
    for (let z = tz0; z < tz1; z += 2.1) {
      for (let x = tx0; x < tx1; x += 4) {
        const road = TOUGE.project(x + 2, z);
        if (road && Math.abs(road.off) < TOUGE_W.rail + 4) continue;
        const y = relief(x + 2, z);
        K.box("lm.Grass004", x, y - 0.1, z - 0.55, x + 3.9, y + 0.85, z + 0.55, hex("#3e5a28"));
        K.box("lm.Grass004", x + 0.1, y + 0.85, z - 0.45, x + 3.8, y + 1.0, z + 0.45, hex("#4e6e30"));
      }
    }
    places.push({ name: "Zuji Tea Garden", box: { x0: tx0, x1: tx1, z0: tz0, z1: tz1 } });
    S.add(kitGeos(K.out()), VOLC.x, VOLC.z + 300);
    // bicycles leaning at the kerbs, every few lots
    let bk = 0;
    for (const st of ctx.isle.streets) {
      for (let u = 12; u < st.to - st.from - 8; u += 23) {
        bk++;
        if (bk % 3 === 0) continue;
        const side = bk % 2 ? 1 : -1;
        const off = st.width / 2 + 0.7;
        const along = st.from + u;
        const [x, z] = st.axis === "x" ? [along, st.at + side * off] : [st.at + side * off, along];
        if (ob.hit(x, z, 0.4) || facades.some((f) => Math.hypot(f.door.x - x, f.door.z - z) < 3)) continue;
        props.push({ type: "bicycle", args: [["#c03a3a", "#2a5aa0", "#e8e4da", "#2a2a2a", "#3a7a4a"][bk % 5]], x, z, y: Y0, rot: st.axis === "x" ? 0 : Math.PI / 2 });
      }
    }
  }
  placeProps(near, props);
  plantTrees(near, trees);
  await ctx.yieldFrame();

  // ---------------------------------------------------------------------------------------------------
  // the beach west of the bridge: umbrellas, towels, a lifeguard
  const walks: [number, number, number, number][] = [];
  {
    const parts = new Map<KSlot, THREE.BufferGeometry[]>();
    const add = (kw: KW, x: number, z: number, yaw: number) => {
      const y = ctx.ground(x, z);
      const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(1, 1, 1));
      for (const [slot, d] of Object.entries(kw.out()) as [KSlot, { pos: Float32Array; nor: Float32Array; uv: Float32Array; col: Float32Array; idx: number[] }][]) {
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.BufferAttribute(d.pos, 3));
        g.setAttribute("normal", new THREE.BufferAttribute(d.nor, 3));
        g.setAttribute("uv", new THREE.BufferAttribute(d.uv, 2));
        g.setAttribute("color", new THREE.BufferAttribute(d.col, 3));
        g.setIndex(Array.from(d.idx));
        g.applyMatrix4(m);
        (parts.get(slot) ?? parts.set(slot, []).get(slot)!).push(g);
      }
    };
    const S0 = 0; // (facing the sea: south)
    add(kLifeguard(31), NX.gora - 30, NLAND.z1 + 26, S0);
    for (let x = NLAND.x0 + 10; x < NX.gora + 26; x += 9)
      for (let z = NLAND.z1 + 8; z < NLAND.z1 + 34; z += 8.5) {
        if (rnd() < 0.3) continue;
        const px = x + (rnd() - 0.5) * 3,
          pz = z + (rnd() - 0.5) * 3;
        if (ctx.ground(px, pz) < -0.9) continue;
        add(kBeachSet(Math.floor(rnd() * 12)), px, pz, S0 + (rnd() - 0.5) * 0.5);
      }
    for (const [slot, list] of parts) {
      const geo = list.length === 1 ? list[0] : mergeGeometries(list, false);
      if (!geo) continue;
      geo.computeBoundingBox();
      const c = geo.boundingBox!.getCenter(new THREE.Vector3());
      geo.translate(-c.x, 0, -c.z);
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, keysMat(slot));
      mesh.position.set(c.x, 0, c.z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.name = "zakone:beach";
      near.add(mesh);
    }
    places.push({ name: "Zakone Beach", box: { x0: NLAND.x0 - 10, x1: NX.gora + 30, z0: NLAND.z1, z1: NLAND.z1 + 46 } });
    // where the passers-by walk: the promenade, the quay, the stairs and the terrace, the onsen's deck
    walks.push([NLAND.x0 + 3, NLAND.z1 - 2.5, NLAND.x1 - 3, NLAND.z1 - 2.5]);
    // the town's pavements, both sides of every street (the passers-by of the onsen town)
    for (const st of ctx.isle.streets) {
      const o = st.width / 2 + 1.6;
      for (const sd of [-1, 1]) walks.push(st.axis === "x" ? [st.from + 4, st.at + sd * o, st.to - 4, st.at + sd * o] : [st.at + sd * o, st.from + 4, st.at + sd * o, st.to - 4]);
    }
    // the garden's paths, the market corner, the shrine's terrace round the hall
    walks.push([NX.gora + 12, NZ.onsen - 12, NX.bridge - BAVE - 5, NZ.onsen - 12]);
    walks.push([NX.gora + 12, NZ.sando + 12, NX.gora + 12, NZ.onsen - 12]);
    walks.push([TERRACE.x0 + 8, TERRACE.z0 + 8, TERRACE.x1 - 8, TERRACE.z0 + 8]);
    walks.push([NLAND.x1 + 3, -1466, NLAND.x1 + 3, -1380]);
    walks.push([NX.bridge - 3, NLAND.z0 - 2, NX.bridge - 3, TERRACE.z1 - 4]);
    walks.push([TERRACE.x0 + 8, TERRACE.z1 - 8, TERRACE.x1 - 8, TERRACE.z1 - 8]);
    walks.push([ONSEN.x - ONSEN.rx, ONSEN.z - ONSEN.rz * 1.3, ONSEN.x + ONSEN.rx, ONSEN.z - ONSEN.rz * 1.3]);
  }

  // ---------------------------------------------------------------------------------------------------
  // cars parked along the kerbs (the game can take them)
  const parked: { obj: THREE.Group; kind: CarKind }[] = [];
  {
    const kinds: CarKind[] = ["sedan", "van", "sedan", "suv", "convertible", "sports", "sedan", "pickup", "taxi"];
    const paints = ["#e8e6e2", "#22242a", "#8a2a3a", "#2a4a7a", "#c8ccd4", "#3a5a40", "#d8d2c4", "#f0f0ee", "#5a5e66"];
    let k = 0;
    for (const s of ctx.isle.streets) {
      if (s.width >= 14 || s.name === "Sando") continue;
      for (const side of [-1, 1]) {
        for (let u = 16; u < s.to - s.from - 12; u += 7.4) {
          k++;
          if ((k * 7) % 5 < 2) continue;
          const along = s.from + u;
          const off = s.width / 2 - 1.15;
          const [x, z] = s.axis === "x" ? [along, s.at + side * off] : [s.at + side * off, along];
          if (ctx.isle.streets.some((t) => t !== s && t.axis !== s.axis && Math.abs((s.axis === "x" ? x : z) - t.at) < t.width / 2 + 7)) continue;
          if (facades.some((f) => Math.hypot(f.door.x - x, f.door.z - z) < 5)) continue;
          const kind = kinds[k % kinds.length];
          const obj = carObject(kind, { paint: kind === "taxi" ? "#2a2a2e" : paints[(k * 5) % paints.length] });
          obj.position.set(x, 0.012, z);
          obj.rotation.y = s.axis === "x" ? (side > 0 ? 0 : Math.PI) : side > 0 ? Math.PI / 2 : -Math.PI / 2;
          obj.userData.kind = kind;
          near.add(obj);
          parked.push({ obj, kind });
          if (parked.length >= 36) break;
        }
      }
    }
    // a few at the Fifth Station
    for (let i = 0; i < 4; i++) {
      const kind: CarKind = (["sports", "sedan", "suv", "convertible"] as CarKind[])[i];
      const obj = carObject(kind, { paint: paints[(i * 3 + 1) % paints.length] });
      obj.position.set(STATION.x - 6.5 + i * 2.6 * 1.5, STATION.y + 0.05, STATION.z - 8);
      obj.rotation.y = Math.PI / 2;
      obj.userData.kind = kind;
      near.add(obj);
      parked.push({ obj, kind });
    }
  }

  S.build(root, "zakone:buildings");
  B.build(root, "zakone:roads");

  // ---------------------------------------------------------------------------------------------------
  const O = ONSEN;
  let clock = 0;
  return {
    facades,
    parked,
    walks,
    places,
    update(dt) {
      clock += dt;
      // the steam: each puff rises off the water, swells, drifts with the breeze and fades
      for (const m of steam) {
        const t = (m.userData.t += dt * 0.16);
        const u = t % 1;
        m.position.set(m.userData.x + u * 1.6 + Math.sin(clock * 0.3 + m.userData.x) * 0.3, O.surface + 0.2 + u * 3.6, m.userData.z + Math.sin(clock * 0.2 + m.userData.z) * 0.3);
        m.scale.setScalar(1.2 + u * 3.4);
        (m as THREE.Sprite).material.opacity = 0.32 * Math.sin(Math.PI * u) * (1 - u * 0.5);
      }
    },
    hold(p, r) {
      // the mountain road: kept between its guardrails (outside them: kept out); off the town's paving
      // the road is ours all the way (the solid shape would read its climb as a kerb)
      const q = inLand(p.x, p.z) ? null : TOUGE.project(p.x, p.z);
      if (q && (q.s <= 30 || q.s >= TOUGE.length - 20) && Math.abs(q.off) < TOUGE_W.rail + 3) return true;
      if (q && q.s > 30 && q.s < TOUGE.length - 20) {
        const a = Math.abs(q.off);
        const R = TOUGE_W.rail;
        if (a < R + r + 0.4) {
          const c = TOUGE.at(q.s);
          const want = a < R ? Math.min(a, R - r) : Math.max(a, R + r + 0.4);
          if (want !== a) {
            const sd = Math.sign(q.off || 1);
            const d = sd * (want - a);
            p.x += -c.tz * d;
            p.z += c.tx * d;
          }
          return true;
        }
      }
      // on the slopes and the terrace (over what the solid shape sees): what stands there
      if (relief(p.x, p.z) > CURB + 0.3 && !inLand(p.x, p.z)) {
        ob.push(p, r);
        return true;
      }
      return false;
    },
    water(x, z) {
      const e = Math.hypot((x - O.x) / O.rx, (z - O.z) / O.rz);
      if (e > 1.0) return null;
      return { floor: relief(x, z), surface: O.surface };
    },
    blocked(x, z) {
      return !!ob.hit(x, z, 0.22);
    },
  };
}
