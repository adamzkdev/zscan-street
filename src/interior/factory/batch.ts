import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { VoxelModel } from "../../scene/voxel/model";
import { meshModel } from "../../scene/voxel/mesher";

/**
 * Static geometry of the hall, merged: thousands of boxes become one mesh per material. Every box
 * carries its colour as vertex colour, so a whole structure (trusses, trays, railings) is one draw.
 */
export class Boxes {
  private geos: THREE.BufferGeometry[] = [];
  private col = new THREE.Color();
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private s = new THREE.Vector3(1, 1, 1);
  private p = new THREE.Vector3();

  /** A box w × h × d with its base centre at (x, y, z), turned `ry` round y (and `rx`, `rz`). */
  add(color: string | THREE.Color, w: number, h: number, d: number, x: number, y: number, z: number, ry = 0, rx = 0, rz = 0) {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(0, h / 2, 0);
    this.e.set(rx, ry, rz, "YXZ");
    this.q.setFromEuler(this.e);
    this.m.compose(this.p.set(x, y, z), this.q, this.s);
    g.applyMatrix4(this.m);
    this.paint(g, color);
    this.geos.push(g);
    return this;
  }

  /** A box between two points (beams, braces, cables): square section `t`. */
  beam(color: string | THREE.Color, a: THREE.Vector3, b: THREE.Vector3, t = 0.15, t2 = t) {
    const len = a.distanceTo(b);
    const g = new THREE.BoxGeometry(t, len, t2);
    const dir = new THREE.Vector3().subVectors(b, a).normalize();
    this.q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    this.m.compose(this.p.addVectors(a, b).multiplyScalar(0.5), this.q, this.s);
    g.applyMatrix4(this.m);
    this.paint(g, color);
    this.geos.push(g);
    return this;
  }

  /** Any geometry (already placed). */
  geo(g: THREE.BufferGeometry, color: string | THREE.Color) {
    const n = g.index ? g.toNonIndexed() : g;
    if (n.getAttribute("uv") === undefined) n.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(n.getAttribute("position").count * 2), 2));
    this.paint(n, color);
    this.geos.push(n);
    return this;
  }

  private paint(g: THREE.BufferGeometry, color: string | THREE.Color) {
    this.col.set(color as THREE.ColorRepresentation);
    const n = g.getAttribute("position").count;
    const a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) a.set([this.col.r, this.col.g, this.col.b], i * 3);
    g.setAttribute("color", new THREE.BufferAttribute(a, 3));
  }

  get count() {
    return this.geos.length;
  }

  /** One mesh of everything added. */
  mesh(mat: THREE.Material) {
    const list = this.geos.map((g) => (g.index ? g.toNonIndexed() : g));
    const merged = list.length ? mergeGeometries(list, false) : new THREE.BufferGeometry();
    for (const g of this.geos) g.dispose();
    this.geos = [];
    const m = new THREE.Mesh(merged ?? new THREE.BufferGeometry(), mat);
    m.matrixAutoUpdate = false;
    m.updateMatrix();
    return m;
  }
}

/** Lit vertex-coloured steel, paint, concrete. */
export const SOLID = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, metalness: 0.25 });
/** Glowing vertex colours (lamps, strips, LEDs): not affected by light or tone mapping. */
export const GLOW = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
/** Smoked glass and polycarbonate. */
export const GLASS = new THREE.MeshStandardMaterial({ color: "#8fb8d8", roughness: 0.08, metalness: 0.4, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide });

/** Voxel models in the hall: solid and glow only, without the city's window flicker. */
const VSOLID = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.05 });
const VGLASS = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.12, metalness: 0.55 });
const VEMIT = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
export function voxObj(m: VoxelModel, scale = 1) {
  const geos = meshModel(m);
  const g = new THREE.Group();
  for (const [kind, geo] of Object.entries(geos) as ["solid" | "glass" | "emit", THREE.BufferGeometry][]) {
    if (!geo) continue;
    if (scale !== 1) geo.scale(scale, scale, scale);
    const mesh = new THREE.Mesh(geo, kind === "solid" ? VSOLID : kind === "glass" ? VGLASS : VEMIT);
    mesh.userData.kind = kind;
    g.add(mesh);
  }
  return g;
}

// ---- GPU-animated materials: blinking LEDs, spinning fans, pool flashes -----------------------

/** Seconds, set every frame. */
export const TIME = { value: 0 };
/** Gold flash per mining pool row (0..1), when it finds a block. */
export const FLASH = { value: [0, 0, 0, 0, 0, 0, 0, 0, 0] };

/**
 * LED material: per instance `aLed` = (seed, pool). Each LED blinks at its own rate and duty;
 * when its pool finds a block, every LED of that pool strobes gold.
 */
export function ledMaterial(blink = true) {
  const m = new THREE.MeshBasicMaterial({ toneMapped: false });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = TIME;
    sh.uniforms.uFlash = FLASH;
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec2 aLed;\nuniform float uTime;\nuniform float uFlash[9];\nvarying float vB;\nvarying float vF;\nvarying float vS;")
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        {
          float s = aLed.x;
          ${blink ? "float rate = 0.35 + fract(s * 13.17) * 2.6;\n          float ph = fract(uTime * rate + s * 3.1);\n          vB = ph < (0.45 + fract(s * 7.31) * 0.5) ? 1.0 : 0.1;" : "vB = 1.0;"}
          int pi = int(aLed.y + 0.5);
          float f = 0.0;
          for (int i = 0; i < 9; i++) if (i == pi) f = uFlash[i];
          vF = f;
          vS = s;
        }`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform float uTime;\nvarying float vB;\nvarying float vF;\nvarying float vS;")
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        diffuseColor.rgb *= vB;
        if (vF > 0.001) {
          float on = step(0.45, fract(uTime * 3.0 + vS * 0.5));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(3.2, 2.1, 0.35) * (0.25 + 0.75 * on), vF);
        }`,
      );
  };
  return m;
}

/** Fan blades turning on the GPU: blades in the local x/y plane, `aSpin` = (speed, phase) per instance. */
export function fanMaterial(color = "#6e6c78") {
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.4 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = TIME;
    const spin = `
      float a = uTime * aSpin.x + aSpin.y;
      float ca = cos(a), sa = sin(a);`;
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec2 aSpin;\nuniform float uTime;")
      .replace("#include <beginnormal_vertex>", `#include <beginnormal_vertex>\n{${spin}\n objectNormal.xy = mat2(ca, sa, -sa, ca) * objectNormal.xy; }`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>\n{${spin}\n transformed.xy = mat2(ca, sa, -sa, ca) * transformed.xy; }`);
  };
  return m;
}

/** A fan rotor: `n` twisted blades round a hub, radius r, in the x/y plane. */
export function rotorGeometry(r: number, n = 5, thick = 0.02) {
  const parts: THREE.BufferGeometry[] = [];
  const hub = new THREE.CylinderGeometry(r * 0.28, r * 0.28, thick * 2.5, 10);
  hub.rotateX(Math.PI / 2);
  parts.push(hub);
  for (let i = 0; i < n; i++) {
    const b = new THREE.BoxGeometry(r * 0.34, r * 0.78, thick);
    b.translate(0, r * 0.58, 0);
    b.rotateY(0.45);
    b.rotateZ((i / n) * Math.PI * 2);
    parts.push(b);
  }
  const g = mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)), false)!;
  parts.forEach((p) => p.dispose());
  return g;
}
