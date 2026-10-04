import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Rect } from "../types";
import { additive, floorMaterial, poolTexture, washTexture } from "./look";

/**
 * Architecture of a gallery floor, batched: every wall of a floor (with its black skirting and
 * brass cornice) is merged into three meshes, light strips and neon edges into one each, and pools
 * and washes of light are instanced. A floor stays around twenty draw calls before its cards.
 */

const lacquer = new THREE.MeshStandardMaterial({ color: "#0c0b0e", roughness: 0.35, metalness: 0.2 });
const brassMat = new THREE.MeshStandardMaterial({ color: "#b08024", roughness: 0.4, metalness: 0.8, envMapIntensity: 1.2 });

export class Shell {
  readonly rects: Rect[] = [];
  private walls: THREE.BufferGeometry[] = [];
  private trims: THREE.BufferGeometry[] = [];
  private brass: THREE.BufferGeometry[] = [];
  private glow = new Map<string, THREE.BufferGeometry[]>();
  private pools: [number, number, number, string][] = [];
  private washes: [number, number, number, number, number, string][] = [];

  constructor(
    readonly group: THREE.Group,
    readonly h: number,
    readonly wallColor: string,
  ) {}

  private boxGeo(w: number, h: number, d: number, x: number, y: number, z: number) {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(x, y + h / 2, z);
    return g;
  }

  /** Axis-aligned wall from (x0, z0) to (x1, z1), full height, with skirting and cornice. */
  wall(x0: number, z0: number, x1: number, z1: number, t = 0.3, h = this.h, collide = true) {
    const alongX = Math.abs(x1 - x0) >= Math.abs(z1 - z0);
    const w = alongX ? Math.abs(x1 - x0) : t,
      d = alongX ? t : Math.abs(z1 - z0);
    const cx = (x0 + x1) / 2,
      cz = (z0 + z1) / 2;
    this.walls.push(this.boxGeo(w, h, d, cx, 0, cz));
    this.trims.push(this.boxGeo(w + (alongX ? 0 : 0.05), 0.16, d + (alongX ? 0.05 : 0), cx, 0, cz));
    this.brass.push(this.boxGeo(w + (alongX ? 0 : 0.07), 0.05, d + (alongX ? 0.07 : 0), cx, h - 0.32, cz));
    this.brass.push(this.boxGeo(w + (alongX ? 0 : 0.03), 0.02, d + (alongX ? 0.03 : 0), cx, 0.16, cz));
    if (collide) this.rects.push([cx - w / 2, cz - d / 2, cx + w / 2, cz + d / 2]);
  }

  /** Solid block (column, plinth footprint…) in the wall paint. */
  block(w: number, h: number, d: number, x: number, y: number, z: number, collide = true) {
    this.walls.push(this.boxGeo(w, h, d, x, y, z));
    if (collide) this.rects.push([x - w / 2, z - d / 2, x + w / 2, z + d / 2]);
  }

  brassBox(w: number, h: number, d: number, x: number, y: number, z: number) {
    this.brass.push(this.boxGeo(w, h, d, x, y, z));
  }

  lacquerBox(w: number, h: number, d: number, x: number, y: number, z: number) {
    this.trims.push(this.boxGeo(w, h, d, x, y, z));
  }

  /** Emissive strip (ceiling light, neon edge). */
  strip(color: string, w: number, h: number, d: number, x: number, y: number, z: number, k = 1.6) {
    const key = `${color}|${k}`;
    let l = this.glow.get(key);
    if (!l) this.glow.set(key, (l = []));
    l.push(this.boxGeo(w, h, d, x, y, z));
  }

  pool(x: number, z: number, r: number, color = "#ffe2b0") {
    this.pools.push([x, z, r, color]);
  }

  /** Light fanning down a wall from the ceiling: centre (x, z), facing `yaw`, width w. */
  wash(x: number, z: number, yaw: number, w: number, hh: number, color = "#ffe6c0") {
    this.washes.push([x, z, yaw, w, hh, color]);
  }

  /** Floor and ceiling plates over [x0, x1] × [z1, z0] (z0 > z1). */
  plates(x0: number, x1: number, z0: number, z1: number, ceiling = "#121014") {
    const W = x1 - x0,
      D = z0 - z1;
    const f = new THREE.Mesh(new THREE.PlaneGeometry(W, D), floorMaterial(W, D));
    f.rotation.x = -Math.PI / 2;
    f.position.set((x0 + x1) / 2, 0, (z0 + z1) / 2);
    const c = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ color: ceiling, roughness: 0.95 }));
    c.rotation.x = Math.PI / 2;
    c.position.set((x0 + x1) / 2, this.h, (z0 + z1) / 2);
    this.group.add(f, c);
  }

  build() {
    const g = this.group;
    const add = (geos: THREE.BufferGeometry[], mat: THREE.Material) => {
      if (!geos.length) return;
      g.add(new THREE.Mesh(mergeGeometries(geos), mat));
      geos.forEach((x) => x.dispose());
    };
    add(this.walls, new THREE.MeshStandardMaterial({ color: this.wallColor, roughness: 0.92, metalness: 0 }));
    add(this.trims, lacquer);
    add(this.brass, brassMat);
    for (const [key, geos] of this.glow) {
      const [color, k] = key.split("|");
      add(geos, new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(Number(k)), toneMapped: false }));
    }

    const m = new THREE.Matrix4(),
      q = new THREE.Quaternion(),
      p = new THREE.Vector3(),
      s = new THREE.Vector3(),
      col = new THREE.Color();
    if (this.pools.length) {
      const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
      const im = new THREE.InstancedMesh(geo, additive(poolTexture(), "#ffffff", 0.16), this.pools.length);
      this.pools.forEach(([x, z, r, c], i) => {
        im.setMatrixAt(i, m.compose(p.set(x, 0.012 + i * 0.0004, z), q.identity(), s.set(r * 2, 1, r * 2)));
        im.setColorAt(i, col.set(c));
      });
      im.renderOrder = 2;
      g.add(im);
    }
    if (this.washes.length) {
      const geo = new THREE.PlaneGeometry(1, 1).translate(0, -0.5, 0);
      const im = new THREE.InstancedMesh(geo, additive(washTexture(), "#ffffff", 0.09), this.washes.length);
      const up = new THREE.Vector3(0, 1, 0);
      this.washes.forEach(([x, z, yaw, w, hh, c], i) => {
        im.setMatrixAt(i, m.compose(p.set(x + Math.sin(yaw) * 0.075, this.h - 0.35, z + Math.cos(yaw) * 0.075), q.setFromAxisAngle(up, yaw), s.set(w, hh, 1)));
        im.setColorAt(i, col.set(c));
      });
      im.renderOrder = 3;
      g.add(im);
    }
    return this.rects;
  }
}
