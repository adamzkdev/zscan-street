import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { BAY, CURB } from "../city/plan";
import { GROUND, terrainMat } from "../real/ground";
import { real } from "../real/tex";
import { markingsTexture } from "../textures";
import { worldUv } from "./deckkit";
import { COURSES } from "./plan";
import type { Isle } from "./types";

/**
 * An island's ground, from its descriptor alone: the raised land (a kerb over the street), its grid of
 * streets (photographed asphalt, its paint), the blocks between them paved and kerbed (lawn on its
 * parks), and round it all the beaches shelving into the sea down to its floor (wade in, then swim).
 * The heights are analytic: the game asks the same function the ground was drawn from.
 */

const WATER = BAY.water;
/** A canal's bed (its water is the sea's, at the sea's level). */
const CANAL_BED = -3.4;

export class IsleLand {
  /** The cuts of the land into cells (x and z), each cell's kind: 1 street, 2 canal, 0 block. */
  private xe: number[] = [];
  private ze: number[] = [];
  private kind: Uint8Array;

  constructor(readonly isle: Isle) {
    const L = isle.land;
    const xs = new Set([L.x0, L.x1]),
      zs = new Set([L.z0, L.z1]);
    for (const r of [...this.rects(), ...this.canalRects()]) {
      xs.add(Math.max(L.x0, Math.min(L.x1, r.x0)));
      xs.add(Math.max(L.x0, Math.min(L.x1, r.x1)));
      zs.add(Math.max(L.z0, Math.min(L.z1, r.z0)));
      zs.add(Math.max(L.z0, Math.min(L.z1, r.z1)));
    }
    this.xe = [...xs].sort((a, b) => a - b);
    this.ze = [...zs].sort((a, b) => a - b);
    const nx = this.xe.length - 1,
      nz = this.ze.length - 1;
    this.kind = new Uint8Array(nx * nz);
    for (let j = 0; j < nz; j++)
      for (let i = 0; i < nx; i++) {
        const cx = (this.xe[i] + this.xe[i + 1]) / 2,
          cz = (this.ze[j] + this.ze[j + 1]) / 2;
        this.kind[j * nx + i] = this.road(cx, cz) ? 1 : this.inCanal(cx, cz) ? 2 : 0;
      }
  }

  /** The canals as rectangles. */
  canalRects() {
    return (this.isle.canals ?? []).map((s) => (s.axis === "x" ? { x0: s.from, x1: s.to, z0: s.at - s.width / 2, z1: s.at + s.width / 2 } : { x0: s.at - s.width / 2, x1: s.at + s.width / 2, z0: s.from, z1: s.to }));
  }

  private canalList: { x0: number; x1: number; z0: number; z1: number }[] | null = null;
  private inCanal(x: number, z: number) {
    this.canalList ??= this.canalRects();
    for (const r of this.canalList) if (x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1) return true;
    return false;
  }

  /** In a canal's water (not on a street's bridge over it)? */
  canal(x: number, z: number) {
    return !this.road(x, z) && this.inCanal(x, z);
  }

  /** Off the land's edge in line with a canal that opens there (its mouth, out to the sea floor)? */
  private mouth(x: number, z: number) {
    const L = this.isle.land;
    for (const c of this.isle.canals ?? []) {
      const h = c.width / 2 - 0.3;
      if (c.axis === "x") {
        if (Math.abs(z - c.at) >= h) continue;
        if ((c.from <= L.x0 + 0.01 && x <= L.x0 + 0.01) || (c.to >= L.x1 - 0.01 && x >= L.x1 - 0.01)) return true;
      } else {
        if (Math.abs(x - c.at) >= h) continue;
        if ((c.from <= L.z0 + 0.01 && z <= L.z0 + 0.01) || (c.to >= L.z1 - 0.01 && z >= L.z1 - 0.01)) return true;
      }
    }
    return false;
  }

  /** A hill's rise over the paving at (x, z) (0 off them): a smooth mound, flat-topped. */
  hill(x: number, z: number) {
    let h = 0;
    for (const H of this.isle.hills ?? []) {
      const d = Math.hypot(x - H.x, z - H.z);
      if (d >= H.r) continue;
      const t = d / H.r;
      // (a plateau over its top (a third of it unless said), then down to the foot)
      const p = Math.min(0.9, (H.top ?? H.r * 0.34) / H.r);
      const k = t < p ? 1 : 0.5 + 0.5 * Math.cos(((t - p) / (1 - p)) * Math.PI);
      h = Math.max(h, H.h * k);
    }
    return h;
  }

  /** The streets as rectangles. */
  rects() {
    return this.isle.streets.map((s) => (s.axis === "x" ? { x0: s.from, x1: s.to, z0: s.at - s.width / 2, z1: s.at + s.width / 2 } : { x0: s.at - s.width / 2, x1: s.at + s.width / 2, z0: s.from, z1: s.to }));
  }

  private roadRects: { x0: number; x1: number; z0: number; z1: number }[] | null = null;
  /** On one of its streets' asphalt? */
  road(x: number, z: number) {
    this.roadRects ??= this.rects();
    for (const r of this.roadRects) if (x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1) return true;
    return false;
  }

  /** How wide the sand is at (x, z) outside the land (the wider stretches eased in over 24 m). */
  private beachWidth(x: number, z: number) {
    const S = this.isle.shore,
      L = this.isle.land;
    let w = S.beach;
    for (const b of S.wide ?? []) {
      const on = b.side === "w" ? x < L.x0 : b.side === "e" ? x > L.x1 : b.side === "n" ? z < L.z0 : z > L.z1;
      if (!on) continue;
      const u = b.side === "w" || b.side === "e" ? z : x;
      const k = Math.min(1, Math.max(0, (u - b.from) / 24), Math.max(0, (b.to - u) / 24));
      const e = k * k * (3 - 2 * k);
      w = Math.max(w, S.beach + (b.width - S.beach) * e);
    }
    return w;
  }

  /** Metres outside the land (0 on it). */
  private out(x: number, z: number) {
    const L = this.isle.land;
    return Math.hypot(Math.max(L.x0 - x, 0, x - L.x1), Math.max(L.z0 - z, 0, z - L.z1));
  }

  /** The ground's height at (x, z): a street, a block's paving, the beach, the sea floor (or the island's relief, a mountain, where it stands higher). */
  ground(x: number, z: number) {
    const d = this.out(x, z);
    // (a canal's mouth: its water runs on out into the sea, no bank of sand across it)
    if (this.mouth(x, z)) return d > 0 ? Math.min(this.shore(x, z, d), CANAL_BED) : CANAL_BED;
    if (d <= 0) return this.road(x, z) ? 0 : this.inCanal(x, z) ? CANAL_BED : CURB + this.hill(x, z);
    const r = this.isle.relief;
    return r ? Math.max(this.shore(x, z, d), r(x, z)) : this.shore(x, z, d);
  }

  /** The shore's own ground off the land: the beach shelving into the sea, the sea floor (`d` metres out). */
  private shore(x: number, z: number, d: number) {
    const W = this.beachWidth(x, z);
    const low = WATER - 0.45;
    if (d < W) {
      const t = d / W;
      // a gentle beach that steepens toward the water
      return CURB + (low - CURB) * (t < 0.6 ? t * 0.75 : 0.45 + (t - 0.6) * 1.375);
    }
    const t = Math.min(1, (d - W) / 34);
    return low + (this.isle.shore.bed - low) * t * t * (3 - 2 * t);
  }

  /** Is (x, z) the water's (the floor under the surface)? */
  wet(x: number, z: number) {
    return this.ground(x, z) < WATER - 0.02;
  }

  /** The whole ground: beaches and sea floor, streets, blocks and kerbs, the parks' lawns. Meshes at their own centres. */
  build(): THREE.Group {
    const g = new THREE.Group();
    g.name = `isle:${this.isle.key}:ground`;
    const B = this.isle.box,
      L = this.isle.land;
    // ---- the beaches and the sea floor (a height field round the land, left out over it) ----
    const STEP = 2;
    const pos: number[] = [],
      col: number[] = [];
    const dry = new THREE.Color("#e8d6a6"),
      wet = new THREE.Color("#b09468"),
      deep = new THREE.Color("#6e6a58"),
      foam = new THREE.Color("#f2f0e8"),
      c = new THREE.Color();
    const tint = (x: number, y: number, z: number) => {
      const n = Math.sin(x * 0.7) * Math.cos(z * 0.55) * 0.04 + Math.sin((x + z) * 1.3) * 0.02;
      if (Math.abs(y - (WATER - 0.06)) < 0.12) c.copy(foam);
      else if (y < WATER - 0.5) c.copy(wet).lerp(deep, Math.min(1, (WATER - 0.5 - y) / 2.5));
      else c.copy(dry).lerp(wet, Math.min(1, Math.max(0, (0 - y) / 1.4)));
      return c.multiplyScalar(1 + n);
    };
    const cx = (B.x0 + B.x1) / 2,
      cz = (B.z0 + B.z1) / 2;
    const rel = this.isle.relief;
    // (a tunnel's ramp up out of the sea: its road is cut through the sand, between its walls)
    const course = COURSES.get(this.isle.key);
    const tubed = !!course && (course.c.kind === "tunnel" || course.c.kind === "bridge-tunnel");
    const cut = (x: number, z: number) => {
      if (!tubed) return false;
      const p = course!.project(x, z);
      return !!p && Math.abs(p.off) < course!.c.section.road + 3.4 && course!.y(p.s) < Math.min(CURB, this.ground(x, z)) + 0.3;
    };
    for (let x = B.x0; x < B.x1; x += STEP)
      for (let z = B.z0; z < B.z1; z += STEP) {
        // (only round the land: over it the blocks and the streets are the ground)
        const d1 = Math.max(this.out(x, z), this.out(x + STEP, z), this.out(x, z + STEP), this.out(x + STEP, z + STEP));
        if (d1 <= 0) continue;
        if (cut(x + STEP / 2, z + STEP / 2)) continue;
        // (where the relief stands over the shore at all four corners, the island's content draws its ground)
        if (rel && [x, x + STEP].every((px) => [z, z + STEP].every((pz) => rel(px, pz) > this.shore(px, pz, this.out(px, pz)) + 0.02))) continue;
        const q: [number, number][] = [
          [x, z],
          [x, z + STEP],
          [x + STEP, z],
          [x + STEP, z],
          [x, z + STEP],
          [x + STEP, z + STEP],
        ];
        for (const [px, pz] of q) {
          // (on the land's edge the sand meets the paving at the kerb's height)
          const y = this.out(px, pz) <= 0 && !this.mouth(px, pz) ? CURB : Math.min(CURB, this.ground(px, pz));
          pos.push(px - cx, y, pz - cz);
          const t = tint(px, y, pz);
          col.push(t.r, t.g, t.b);
        }
      }
    const sand = new THREE.BufferGeometry();
    sand.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    sand.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    sand.computeVertexNormals();
    sand.computeBoundingSphere();
    const shore = new THREE.Mesh(sand, terrainMat());
    shore.position.set(cx, 0, cz);
    shore.receiveShadow = true;
    shore.name = `isle:${this.isle.key}:shore`;
    g.add(shore);

    // ---- the land: a floor under it all, the streets, the blocks ----
    const lx = (L.x0 + L.x1) / 2,
      lz = (L.z0 + L.z1) / 2;
    const parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
    const add = (m: THREE.Material, geo: THREE.BufferGeometry) => {
      const gg = geo.index ? geo.toNonIndexed() : geo;
      gg.deleteAttribute("normal");
      gg.computeVertexNormals();
      (parts.get(m) ?? parts.set(m, []).get(m)!).push(gg.translate(-lx, 0, -lz));
    };
    // (a floor the colour of the asphalt: no glimpse of the sea through a seam — none over a canal)
    const nx0 = this.xe.length - 1,
      nz0 = this.ze.length - 1;
    if (!this.isle.canals?.length) add(GROUND.asphalt(), new THREE.PlaneGeometry(L.x1 - L.x0, L.z1 - L.z0).rotateX(-Math.PI / 2).translate(lx, -0.02, lz));
    else
      for (let j = 0; j < nz0; j++)
        for (let i = 0; i < nx0; ) {
          if (this.kind[j * nx0 + i] === 2) {
            i++;
            continue;
          }
          let k = i;
          while (k + 1 < nx0 && this.kind[j * nx0 + k + 1] !== 2) k++;
          const x0 = this.xe[i],
            x1 = this.xe[k + 1],
            z0 = this.ze[j],
            z1 = this.ze[j + 1];
          add(GROUND.asphalt(), new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2).translate((x0 + x1) / 2, -0.02, (z0 + z1) / 2));
          i = k + 1;
        }
    // the streets: strips of tarmac with their paint (every 16 m along), north–south a hair over east–west
    const roadMats = new Map<string, THREE.Material>();
    const roadMat = (width: number) => {
      // (an old town's streets: setts, no paint)
      if (this.isle.paving === "setts") return (roadMats.get("setts") ?? roadMats.set("setts", GROUND.setts()).get("setts"))!;
      const k = `${width}`;
      let m = roadMats.get(k);
      if (!m) roadMats.set(k, (m = GROUND.asphalt(markingsTexture(16, width, [], width >= 12 ? 4 : 2))));
      return m;
    };
    for (const s of this.isle.streets) {
      const len = s.to - s.from;
      const geo = new THREE.PlaneGeometry(len, s.width);
      const uv = geo.getAttribute("uv");
      for (let i = 0; i < uv.count; i++) uv.setX(i, (uv.getX(i) * len) / 16);
      geo.rotateX(-Math.PI / 2);
      if (s.axis === "z") geo.rotateY(Math.PI / 2);
      const mid = (s.from + s.to) / 2;
      add(roadMat(s.width), s.axis === "x" ? geo.translate(mid, 0.011, s.at) : geo.translate(s.at, 0.013, mid));
    }
    // the blocks: paved cells kerbed where they meet a street (merged along each row)
    const paving = this.isle.paving === "setts" ? [GROUND.plaza(), GROUND.slabs(), GROUND.stone()] : [GROUND.slabs(), GROUND.plaza(), GROUND.pavement()];
    const kerbM = GROUND.kerb(),
      lawn = GROUND.lawn();
    const nx = this.xe.length - 1,
      nz = this.ze.length - 1;
    const isRoad = (i: number, j: number) => i >= 0 && j >= 0 && i < nx && j < nz && this.kind[j * nx + i] === 1;
    const isCanal = (i: number, j: number) => i >= 0 && j >= 0 && i < nx && j < nz && this.kind[j * nx + i] === 2;
    for (let j = 0; j < nz; j++) {
      let i = 0;
      while (i < nx) {
        if (isRoad(i, j) || isCanal(i, j)) {
          i++;
          continue;
        }
        let k = i;
        while (k + 1 < nx && !isRoad(k + 1, j) && !isCanal(k + 1, j)) k++;
        const x0 = this.xe[i],
          x1 = this.xe[k + 1],
          z0 = this.ze[j],
          z1 = this.ze[j + 1];
        const m = paving[Math.abs(Math.round(x0 * 7 + z0 * 13)) % 3];
        add(m, new THREE.BoxGeometry(x1 - x0, CURB + 0.4, z1 - z0).translate((x0 + x1) / 2, (CURB - 0.4) / 2, (z0 + z1) / 2));
        i = k + 1;
      }
    }
    // the kerbs: along every side of a block cell that meets a street cell
    const t = 0.18;
    const kh = CURB + 0.03;
    for (let j = 0; j < nz; j++)
      for (let i = 0; i < nx; i++) {
        if (isRoad(i, j) || isCanal(i, j)) continue;
        const x0 = this.xe[i],
          x1 = this.xe[i + 1],
          z0 = this.ze[j],
          z1 = this.ze[j + 1];
        if (isRoad(i, j - 1)) add(kerbM, new THREE.BoxGeometry(x1 - x0, kh, t).translate((x0 + x1) / 2, kh / 2, z0 + t / 2));
        if (isRoad(i, j + 1)) add(kerbM, new THREE.BoxGeometry(x1 - x0, kh, t).translate((x0 + x1) / 2, kh / 2, z1 - t / 2));
        if (isRoad(i - 1, j)) add(kerbM, new THREE.BoxGeometry(t, kh, z1 - z0).translate(x0 + t / 2, kh / 2, (z0 + z1) / 2));
        if (isRoad(i + 1, j)) add(kerbM, new THREE.BoxGeometry(t, kh, z1 - z0).translate(x1 - t / 2, kh / 2, (z0 + z1) / 2));
      }
    // the canals: stone quay walls down to the bed (a coping along the top), the bridges' arches
    if (this.isle.canals?.length) this.canalWorks(add, isRoad, isCanal);
    // the parks: lawn over their blocks' paving, a path round
    for (const p of this.isle.parks) add(lawn, new THREE.PlaneGeometry(p.x1 - p.x0, p.z1 - p.z0).rotateX(-Math.PI / 2).translate((p.x0 + p.x1) / 2, CURB + 0.006, (p.z0 + p.z1) / 2));
    for (const [m, list] of parts) {
      const geo = mergeGeometries(list, false);
      if (!geo) continue;
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.set(lx, 0, lz);
      mesh.receiveShadow = true;
      mesh.name = `isle:${this.isle.key}:land`;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      g.add(mesh);
    }
    return g;
  }

  /** The canal (if any) whose water holds (x, z) — its axis says which way it runs. */
  private canalOf(x: number, z: number) {
    for (const c of this.isle.canals ?? []) {
      const r = c.axis === "x" ? { x0: c.from, x1: c.to, z0: c.at - c.width / 2, z1: c.at + c.width / 2 } : { x0: c.at - c.width / 2, x1: c.at + c.width / 2, z0: c.from, z1: c.to };
      if (x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1) return c;
    }
    return null;
  }

  /**
   * The canals' stonework: along every edge of a canal cell that meets dry land, a quay wall from the
   * bed up to the paving (its coping a hand over it) or up to the street where a canal ends at one;
   * under a street crossing a canal, the bridge — a flat stone arch in its face each side (the water
   * runs a metre and a half under the street), its vault overhead, its parapets along the street.
   */
  private canalWorks(add: (m: THREE.Material, g: THREE.BufferGeometry) => void, isRoad: (i: number, j: number) => boolean, isCanal: (i: number, j: number) => boolean) {
    const nx = this.xe.length - 1,
      nz = this.ze.length - 1;
    const wall = real("Bricks060", { tint: "#a08672", roughness: 0.95 });
    const stone = real("Concrete034", { tint: "#cfc7b8", roughness: 0.9 });
    const T = 0.6;
    const put = (m: THREE.Material, g: THREE.BufferGeometry, tile: number) => add(m, worldUv(g.index ? g.toNonIndexed() : g, tile));
    const L = this.isle.land;
    const cellMid = (i: number, j: number): [number, number] => [(this.xe[i] + this.xe[i + 1]) / 2, (this.ze[j] + this.ze[j + 1]) / 2];
    const bridge = (i: number, j: number) => isRoad(i, j) && this.inCanal(...cellMid(i, j));
    for (let j = 0; j < nz; j++)
      for (let i = 0; i < nx; i++) {
        if (!isCanal(i, j)) continue;
        const x0 = this.xe[i],
          x1 = this.xe[i + 1],
          z0 = this.ze[j],
          z1 = this.ze[j + 1];
        // (each side: its neighbour; a quay where it is a block, an abutment up to the street where a canal ends at one)
        const sides: [number, number, number, number, number, number, number, number][] = [
          [i, j - 1, x0, z0 - T, x1, z0, 0, -1],
          [i, j + 1, x0, z1, x1, z1 + T, 0, 1],
          [i - 1, j, x0 - T, z0, x0, z1, -1, 0],
          [i + 1, j, x1, z0, x1 + T, z1, 1, 0],
        ];
        for (const [ni, nj, a, b, c, d] of sides) {
          if (isCanal(ni, nj) || bridge(ni, nj)) continue;
          // (at the land's edge the canal opens into the sea)
          if (ni < 0 || nj < 0 || ni >= nx || nj >= nz) continue;
          if (a < L.x0 - 0.1 || c > L.x1 + 0.1 || b < L.z0 - 0.1 || d > L.z1 + 0.1) continue;
          const top = isRoad(ni, nj) ? 0.02 : CURB + 0.06;
          put(wall, new THREE.BoxGeometry(c - a, top - CANAL_BED, d - b).translate((a + c) / 2, (top + CANAL_BED) / 2, (b + d) / 2), 1.6);
          if (!isRoad(ni, nj)) put(stone, new THREE.BoxGeometry(c - a, 0.16, d - b).translate((a + c) / 2, top + 0.06, (b + d) / 2), 2);
        }
        // the canal's bed
        add(stone, new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2).translate((x0 + x1) / 2, CANAL_BED, (z0 + z1) / 2));
      }
    // the bridges: a street's cell over a canal
    const springY = WATER - 0.35,
      crown = -0.34;
    const rise = crown - springY;
    for (let j = 0; j < nz; j++)
      for (let i = 0; i < nx; i++) {
        if (!bridge(i, j)) continue;
        const x0 = this.xe[i],
          x1 = this.xe[i + 1],
          z0 = this.ze[j],
          z1 = this.ze[j + 1];
        const [mx, mz] = cellMid(i, j);
        const cnl = this.canalOf(mx, mz);
        if (!cnl) continue;
        // (the water runs along x under a street running along z: the bridge's faces at x0 and x1, its span along z)
        const runX = cnl.axis === "x";
        const span = runX ? z1 - z0 : x1 - x0;
        const width = runX ? x1 - x0 : z1 - z0;
        const r = span / 2 - 0.6;
        for (const face of [0, 1]) {
          const at = runX ? (face ? x1 : x0) : face ? z1 : z0;
          const shp = new THREE.Shape([new THREE.Vector2(-span / 2, CANAL_BED), new THREE.Vector2(span / 2, CANAL_BED), new THREE.Vector2(span / 2, 0.02), new THREE.Vector2(-span / 2, 0.02)]);
          const hole = new THREE.Path();
          hole.moveTo(-r, CANAL_BED + 0.2);
          for (let k = 0; k <= 20; k++) {
            const a = Math.PI - (k / 20) * Math.PI;
            hole.lineTo(Math.cos(a) * r, springY + Math.sin(a) * rise);
          }
          hole.lineTo(r, CANAL_BED + 0.2);
          shp.holes.push(hole);
          const geo = new THREE.ShapeGeometry(shp, 2);
          // (the face square to the water: turned out from the bridge)
          if (runX) geo.rotateY(face ? Math.PI / 2 : -Math.PI / 2).translate(at, 0, mz);
          else geo.rotateY(face ? 0 : Math.PI).translate(mx, 0, at);
          put(wall, geo, 1.6);
          // its parapet (a stone wall along the street's edge, its coping)
          const pw = 0.45;
          if (runX) put(stone, new THREE.BoxGeometry(pw, 0.95, span + 0.8).translate(at + (face ? -pw / 2 : pw / 2), 0.475, mz), 2);
          else put(stone, new THREE.BoxGeometry(span + 0.8, 0.95, pw).translate(mx, 0.475, at + (face ? -pw / 2 : pw / 2)), 2);
        }
        // the vault overhead: a half cylinder squashed to the arch's rise, its axis along the water
        const vault = new THREE.CylinderGeometry(r, r, width, 20, 1, true, 0, Math.PI);
        vault.scale(rise / r, 1, 1);
        vault.rotateZ(Math.PI / 2);
        if (!runX) vault.rotateY(Math.PI / 2);
        vault.translate(mx, springY, mz);
        const inner = vault.toNonIndexed();
        // (seen from under it: the triangles turned round)
        const pa = inner.getAttribute("position");
        for (let t = 0; t < pa.count; t += 3) {
          const ax = pa.getX(t + 1),
            ay = pa.getY(t + 1),
            az = pa.getZ(t + 1);
          pa.setXYZ(t + 1, pa.getX(t + 2), pa.getY(t + 2), pa.getZ(t + 2));
          pa.setXYZ(t + 2, ax, ay, az);
        }
        inner.computeVertexNormals();
        put(wall, inner, 1.6);
        // the deck's underside between the vault's crown and the street (no glimpse of the sky through it)
        put(stone, new THREE.BoxGeometry(runX ? width : span, 0.3, runX ? span : width).translate(mx, -0.16, mz), 2);
      }
  }
}

