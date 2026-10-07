import * as THREE from "three";

/**
 * Stone geometry for the pyramid, merged per material: boxes and quads with texture coordinates in
 * world metres (so courses of blocks line up across walls) and torchlight baked into vertex colours
 * (faces are cut into ~0.7 m cells so the light falls off smoothly). A handful of real lights move
 * with the walker for the flicker; the bake does the rest.
 */

export interface Torch {
  p: THREE.Vector3;
  color: THREE.Color;
  /** Reach in metres. */
  r: number;
  /** Maze cell the torch hangs in (-1 outside the maze): light only reaches cells it can see. */
  cell: number;
}

export type Lighting = (p: THREE.Vector3, n: THREE.Vector3) => THREE.Color;

/** Torchlight: warm falloff, a little wrap round the faces, an ambient floor. */
export function bake(torches: Torch[], ambient: THREE.Color, sees?: (p: THREE.Vector3, n: THREE.Vector3, t: Torch) => boolean): Lighting {
  const d = new THREE.Vector3();
  const out = new THREE.Color();
  return (p, n) => {
    out.copy(ambient);
    for (const t of torches) {
      d.subVectors(t.p, p);
      const dist = d.length();
      if (dist > t.r) continue;
      d.divideScalar(dist || 1);
      const lam = n.dot(d);
      if (lam < -0.15) continue;
      if (sees && !sees(p, n, t)) continue;
      const a = (1 - dist / t.r) ** 2 * (0.25 + 0.75 * Math.max(0, lam));
      out.r += t.color.r * a;
      out.g += t.color.g * a;
      out.b += t.color.b * a;
    }
    return out;
  };
}

export class Geo {
  private pos: number[] = [];
  private nor: number[] = [];
  private uv: number[] = [];
  private idx: number[] = [];

  /** `tile`: metres per texture repeat. */
  constructor(readonly tile = 2) {}

  get empty() {
    return this.pos.length === 0;
  }

  /**
   * A quad from corner `o` along `u` and `v` (its normal is u × v), cut into cells of at most
   * `step` metres. UVs follow the world axes across the face (or `uvRect` when given: a decal).
   */
  quad(o: THREE.Vector3, u: THREE.Vector3, v: THREE.Vector3, step = 0.7, uvRect?: [number, number, number, number]) {
    const n = new THREE.Vector3().crossVectors(u, v).normalize();
    const nu = Math.max(1, Math.ceil(u.length() / step)),
      nv = Math.max(1, Math.ceil(v.length() / step));
    const base = this.pos.length / 3;
    // world-axis UVs: the two axes the face spans most
    const ax = Math.abs(n.x),
      ay = Math.abs(n.y),
      az = Math.abs(n.z);
    const p = new THREE.Vector3();
    for (let j = 0; j <= nv; j++)
      for (let i = 0; i <= nu; i++) {
        p.copy(o)
          .addScaledVector(u, i / nu)
          .addScaledVector(v, j / nv);
        this.pos.push(p.x, p.y, p.z);
        this.nor.push(n.x, n.y, n.z);
        if (uvRect) this.uv.push(uvRect[0] + (uvRect[2] - uvRect[0]) * (i / nu), uvRect[1] + (uvRect[3] - uvRect[1]) * (j / nv));
        else if (ay >= ax && ay >= az) this.uv.push(p.x / this.tile, p.z / this.tile);
        else if (ax >= az) this.uv.push((n.x > 0 ? -p.z : p.z) / this.tile, p.y / this.tile);
        else this.uv.push((n.z > 0 ? p.x : -p.x) / this.tile, p.y / this.tile);
      }
    for (let j = 0; j < nv; j++)
      for (let i = 0; i < nu; i++) {
        const a = base + j * (nu + 1) + i;
        const b = a + 1,
          c = a + nu + 1,
          d = c + 1;
        this.idx.push(a, b, d, a, d, c);
      }
  }

  /**
   * Box [x0,x1] × [y0,y1] × [z0,z1]; `skip` leaves out faces nobody sees ("top", "bottom",
   * "px", "nx", "pz", "nz").
   */
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, skip: string[] = [], step = 0.7) {
    const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
    const w = x1 - x0,
      h = y1 - y0,
      d = z1 - z0;
    if (!skip.includes("pz")) this.quad(V(x0, y0, z1), V(w, 0, 0), V(0, h, 0), step);
    if (!skip.includes("nz")) this.quad(V(x1, y0, z0), V(-w, 0, 0), V(0, h, 0), step);
    if (!skip.includes("px")) this.quad(V(x1, y0, z1), V(0, 0, -d), V(0, h, 0), step);
    if (!skip.includes("nx")) this.quad(V(x0, y0, z0), V(0, 0, d), V(0, h, 0), step);
    if (!skip.includes("top")) this.quad(V(x0, y1, z1), V(w, 0, 0), V(0, 0, -d), step);
    if (!skip.includes("bottom")) this.quad(V(x0, y0, z0), V(w, 0, 0), V(0, 0, d), step);
  }

  /** Floor (normal up) or ceiling (normal down) rectangle at height y. */
  flat(x0: number, z0: number, x1: number, z1: number, y: number, up = true, step = 0.7) {
    if (up) this.quad(new THREE.Vector3(x0, y, z1), new THREE.Vector3(x1 - x0, 0, 0), new THREE.Vector3(0, 0, z0 - z1), step);
    else this.quad(new THREE.Vector3(x0, y, z0), new THREE.Vector3(x1 - x0, 0, 0), new THREE.Vector3(0, 0, z1 - z0), step);
  }

  /** The finished geometry: optionally transformed (the sloping gallery), lit by `light`. */
  build(light?: Lighting, m?: THREE.Matrix4) {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.idx);
    if (m) {
      g.applyMatrix4(m);
      g.computeVertexNormals();
    }
    if (light) {
      const P = g.getAttribute("position"),
        N = g.getAttribute("normal");
      const col = new Float32Array(P.count * 3);
      const p = new THREE.Vector3(),
        n = new THREE.Vector3();
      for (let i = 0; i < P.count; i++) {
        p.fromBufferAttribute(P, i);
        n.fromBufferAttribute(N, i);
        const c = light(p, n);
        col[i * 3] = c.r;
        col[i * 3 + 1] = c.g;
        col[i * 3 + 2] = c.b;
      }
      g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    }
    g.computeBoundingSphere();
    return g;
  }

  mesh(mat: THREE.Material, light?: Lighting, m?: THREE.Matrix4) {
    const mesh = new THREE.Mesh(this.build(light, m), mat);
    mesh.matrixAutoUpdate = false;
    return mesh;
  }
}
