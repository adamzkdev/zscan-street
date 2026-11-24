import * as THREE from "three";
import { load } from "./load";

/**
 * Fewer draw calls. The city is thousands of small things, each one its own draw, and past the pixels
 * that is what holds the frame rate down (preparing 800 draws costs more than the GPU's drawing).
 *
 * - What stands still is merged, a tile of the city at a time: everything that already shares a
 *   material keeps that very material (whoever changes it changes them all), and what is only a plain
 *   colour takes it into its vertices. The merge is undone for anything that later moves, disappears
 *   or changes colour: it is watched, a few objects a frame, and gets its own draw back.
 * - Whatever is too small to come to more than a couple of pixels is not drawn at all.
 *
 * - What stands still but has a material of its own (a building's own copy, for its hover glow)
 *   cannot be merged for the picture, but its shadow can: a tile's still shadow casters are one
 *   mesh that only the shadow map sees, and they stop casting their own (given back the moment
 *   they move or disappear, like the rest).
 *
 * Both hide an object by its layer, not by `visible`, which stays the property of whoever owns it.
 */
/** A function's identity, as a number (two materials with the same hook share it). */
const fnIds = new WeakMap<object, number>();
let fnN = 0;
const fnId = (f: object) => fnIds.get(f) ?? (fnIds.set(f, ++fnN), fnN);

const MERGED = 30;
const TINY = 29;
const TILE = 96;
/**
 * Merged things watched per frame, at least (all of them, up to a few hundred: a merged thing that
 * starts to move or is hidden shows where it was until it is looked at again).
 */
const WATCH_PER_FRAME = 600;
const TINY_PER_FRAME = 160;
/** Under this radius on the screen, in pixels, it is not drawn. */
const TINY_PX = 2.2;
/** Smaller than this, in metres round, it casts no shadow. */
const SHADOW_MIN = 0.8;
const MAPS = ["map", "emissiveMap", "normalMap", "roughnessMap", "metalnessMap", "aoMap", "lightMap", "alphaMap", "bumpMap", "envMap", "displacementMap"] as const;

type Plain = THREE.MeshStandardMaterial | THREE.MeshBasicMaterial;

/** A shadow caster whose shadow is drawn by a tile's shadows-only mesh. */
interface Shade {
  o: THREE.Mesh;
  g: THREE.BufferGeometry;
  world: Float64Array;
  batch: THREE.Mesh;
  from: number;
  to: number;
}

interface Kept {
  o: THREE.Mesh;
  m: Plain;
  g: THREE.BufferGeometry;
  /** Its material is the batch's own: nothing to compare. */
  shared: boolean;
  /** A material of its own, but the same look as the others' of the batch (drawn with a copy of it). */
  twin?: boolean;
  world: Float64Array;
  color: number;
  emissive: number;
  opacity: number;
  batch: THREE.Mesh;
  from: number;
  to: number;
}

// (rays still hit what is merged: only the drawing has moved)
const proto = THREE.Raycaster.prototype as unknown as { intersectObject(...a: unknown[]): unknown; layers: THREE.Layers };
const intersect = proto.intersectObject;
proto.intersectObject = function (...a: unknown[]) {
  this.layers.enable(MERGED);
  this.layers.enable(TINY);
  return intersect.apply(this, a);
};

/** The shadow map's depth materials for instanced and for batched casters (see splitShared). */
const INSTANCED_DEPTH = new THREE.MeshDepthMaterial();
const BATCHED_DEPTH = new THREE.MeshDepthMaterial();

const v = new THREE.Vector3();
const n = new THREE.Vector3();
const c = new THREE.Color();
const mid = new THREE.Vector3();
const eye3 = new THREE.Vector3();
const nm = new THREE.Matrix3();

export class Thrift {
  private kept: Kept[] = [];
  private keptOf = new Set<THREE.Object3D>();
  private refused = new WeakSet<THREE.Object3D>();
  private seen = new Map<THREE.Mesh, Float64Array>();
  private useCount = new Map<Plain, number>();
  private at = 0;
  private tinyAt = 0;
  private tiny: THREE.Mesh[] = [];
  private tinyList = 0;
  private shades: Shade[] = [];
  private shadeAt = 0;

  constructor(private scene: THREE.Scene) {}

  private candidate(o: THREE.Object3D): o is THREE.Mesh {
    const m = o as THREE.Mesh;
    if (!m.isMesh || (m as unknown as THREE.InstancedMesh).isInstancedMesh || (m as unknown as THREE.BatchedMesh).isBatchedMesh) return false;
    // (a downtown building's mesh: the city's own batch draws it, see cityBatch)
    if (this.refused.has(o) || this.keptOf.has(o) || Array.isArray(m.material) || m.userData.cityBatch) return false;
    const mat = m.material as Plain;
    if (mat.transparent || mat.alphaTest > 0 || !mat.visible) return false;
    if (m.onBeforeRender !== THREE.Object3D.prototype.onBeforeRender || m.renderOrder !== 0 || m.morphTargetInfluences || m.layers.mask !== 1) return false;
    const g = m.geometry;
    return !!g.attributes.position && !g.morphAttributes.position && !g.attributes.tangent && !(g as unknown as { isInstancedBufferGeometry?: boolean }).isInstancedBufferGeometry;
  }

  /** A material that a copy can stand in for: no textures, nothing clipped, opaque. */
  private twinnable(mat: Plain) {
    if (mat.type !== "MeshStandardMaterial" && mat.type !== "MeshBasicMaterial") return false;
    if (mat.clippingPlanes?.length || mat.transparent) return false;
    // the realistic city's own clones (a building's, a landmark's: walls down clips them on the map;
    // real/mats.ts realMat, marksmat.ts): their maps and hooks read UVs, vertex colours and the world
    // position from the view, never the model's own coordinates — a copy merged per tile draws them the
    // same, a few draws a tile instead of one per slot per building (a third of the frame's draws)
    const u = mat.userData as Record<string, unknown>;
    if (u.realSlot || u.real || u.realGround || /^lm\./.test(mat.name ?? "") || /^(real:|lm\.)/.test(mat.customProgramCacheKey())) return true;
    for (const k of MAPS) if ((mat as unknown as Record<string, unknown>)[k]) return false;
    // (no shader hook either: a hook may read the model's own coordinates, which merging changes)
    return mat.onBeforeCompile === THREE.Material.prototype.onBeforeCompile;
  }
  /** Everything about a material's look, for telling two own copies apart. */
  private look(mat: Plain) {
    const m = mat as THREE.MeshStandardMaterial;
    const maps = MAPS.map((k) => ((m as unknown as Record<string, THREE.Texture | null>)[k]?.uuid ?? "")).join("/");
    return [maps, fnId(m.onBeforeCompile), m.name, m.normalScale?.x, m.aoMapIntensity, m.type, m.color.getHex(), m.emissive?.getHex(), m.emissiveIntensity, m.roughness, m.metalness, m.vertexColors, m.side, m.shadowSide, m.flatShading, m.toneMapped, m.fog, m.depthWrite, m.depthTest, m.colorWrite, m.polygonOffset, m.polygonOffsetFactor, m.polygonOffsetUnits, m.opacity, m.envMapIntensity, m.alphaTest, m.blending, m.dithering, m.wireframe, m.clipShadows, m.customProgramCacheKey(), JSON.stringify(m.userData)].join();
  }

  /** Only a colour, with nothing that makes its material its own. */
  private plain(mat: Plain) {
    if ((mat.type !== "MeshStandardMaterial" && mat.type !== "MeshBasicMaterial") || mat.vertexColors) return false;
    for (const k of MAPS) if ((mat as unknown as Record<string, unknown>)[k]) return false;
    return mat.onBeforeCompile === THREE.Material.prototype.onBeforeCompile;
  }

  /** First look: where everything stands now. */
  observe() {
    this.seen.clear();
    this.scene.traverseVisible((o) => {
      if (this.candidate(o)) {
        o.updateWorldMatrix(true, false);
        // (in full: the matrices are doubles, and a float copy differs from nearly every one of them,
        // which counted almost everything as moving and left it unmerged)
        this.seen.set(o, Float64Array.from(o.matrixWorld.elements));
      }
    });
  }

  /** Second look, a moment later: whatever has not stirred is merged. */
  merge() {
    const groups = new Map<string, Kept[]>();
    const shadeGroups = new Map<string, THREE.Mesh[]>();
    this.useCount.clear();
    for (const o of this.seen.keys()) this.useCount.set(o.material as Plain, (this.useCount.get(o.material as Plain) ?? 0) + 1);
    for (const [o, was] of this.seen) {
      if (!o.parent || !this.candidate(o) || !this.showing(o)) continue;
      const e = o.matrixWorld.elements;
      let still = true;
      for (let i = 0; i < 16; i++) if (e[i] !== was[i]) still = false;
      // (moving now: the next look may find it still; only what moves once merged is refused for good)
      if (!still) continue;
      // (one broken shape must not take a whole merged tile out of the picture)
      const sphere = o.geometry.boundingSphere ?? (o.geometry.computeBoundingSphere(), o.geometry.boundingSphere);
      if (!sphere || !Number.isFinite(sphere.radius)) {
        this.refused.add(o);
        continue;
      }
      const m = o.material as THREE.MeshStandardMaterial;
      const tile = [o.castShadow, o.receiveShadow, Math.floor(e[12] / TILE), Math.floor(e[14] / TILE)].join();
      // (an attribute whose copy was let go once on the GPU cannot be merged for the picture: its shadow still can)
      const whole = Object.values(o.geometry.attributes).every((a) => (a as THREE.BufferAttribute).array?.length >= a.count * a.itemSize);
      const attrs = Object.keys(o.geometry.attributes).filter((a) => a !== "color" || m.vertexColors).sort().join();
      // the same material already: it stays that material. Otherwise, if it is only a colour: by look
      const plain = this.plain(m);
      const uses = this.useCount.get(m) ?? 0;
      if (!plain && uses < 2 && whole && this.twinnable(m)) {
        // a material of its own that looks just like others' (a building's own copy): merged with
        // those, drawn with a copy of it; given back its own draw if its own changes (a hover's glow,
        // walls cut down)
        const key = "twin|" + this.look(m) + tile + attrs;
        let list = groups.get(key);
        if (!list) groups.set(key, (list = []));
        list.push({ o, m, g: o.geometry, shared: false, twin: true, world: was, color: m.color?.getHex() ?? 0, emissive: m.emissive?.getHex() ?? 0, opacity: m.opacity, batch: null!, from: 0, to: 0 });
        continue;
      }
      if ((!plain && uses < 2) || !whole) {
        this.refused.add(o);
        // its shadow can still go with the tile's
        const P = o.geometry.attributes.position;
        if (o.castShadow && P.array.length >= P.count * 3 && !m.displacementMap && !m.clippingPlanes?.length && !(o as unknown as { customDepthMaterial?: unknown }).customDepthMaterial) {
          const k = [Math.floor(e[12] / TILE), Math.floor(e[14] / TILE), m.side, m.shadowSide].join();
          let sl = shadeGroups.get(k);
          if (!sl) shadeGroups.set(k, (sl = []));
          sl.push(o);
          this.seenAt.set(o, was);
        }
        continue;
      }
      const shared = uses >= 2 && !(plain && uses < 4);
      const key = (shared ? m.uuid : [m.type, m.roughness, m.metalness, m.emissive?.getHex(), m.emissiveIntensity, m.envMapIntensity, m.side, m.flatShading, m.toneMapped, m.fog, m.depthWrite, m.depthTest, m.polygonOffset, m.opacity].join()) + tile + attrs;
      let list = groups.get(key);
      if (!list) groups.set(key, (list = []));
      list.push({ o, m, g: o.geometry, shared, world: was, color: m.color?.getHex() ?? 0, emissive: m.emissive?.getHex() ?? 0, opacity: m.opacity, batch: null!, from: 0, to: 0 });
    }
    this.seen.clear();
    for (const list of groups.values()) if (list.length > 1) this.build(list);
    for (const list of shadeGroups.values()) if (list.length > 1) this.buildShade(list);
    this.seenAt.clear();
    this.smallShadows();
    this.splitShared();
    this.tinyList = 0;
  }

  /**
   * One material on plain meshes and on instanced or batched ones means a different shader for each,
   * looked up again at every change between them, thousands of lookups a frame. The instanced ones get
   * a stand-in that reads everything from the original (whoever changes it changes both), and so a
   * shader of its own.
   */
  private splitShared() {
    const plain = new Set<THREE.Material>();
    const many: THREE.Mesh[] = [];
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || Array.isArray(m.material)) return;
      if ((m as unknown as THREE.InstancedMesh).isInstancedMesh || (m as unknown as THREE.BatchedMesh).isBatchedMesh) many.push(m);
      else plain.add(m.material);
    });
    const stand = new Map<THREE.Material, THREE.Material>();
    // (the same in the shadow map: three.js draws every caster with one depth material, and each
    // change between an instanced caster and a plain one looked its shader up again; the instanced
    // and the batched ones cast with depth materials of their own, the same)
    for (const m of many) {
      const mat = m.material as Plain & { clippingPlanes?: THREE.Plane[] | null };
      const o = m as THREE.Mesh & { customDepthMaterial?: THREE.Material };
      if (!m.castShadow || o.customDepthMaterial || mat.alphaTest > 0 || mat.alphaToCoverage || (mat as THREE.MeshStandardMaterial).displacementMap || mat.clippingPlanes?.length) continue;
      o.customDepthMaterial = (m as unknown as THREE.BatchedMesh).isBatchedMesh ? BATCHED_DEPTH : INSTANCED_DEPTH;
    }
    for (const m of many) {
      const was = m.material as THREE.Material;
      if (!plain.has(was)) continue;
      let c = stand.get(was);
      if (!c) {
        c = Object.create(was) as THREE.Material;
        Object.defineProperty(c, "id", { value: 1e6 + (was as unknown as { id: number }).id });
        Object.defineProperty(c, "uuid", { value: THREE.MathUtils.generateUUID() });
        stand.set(was, c);
      }
      m.material = c;
    }
  }

  /** Little things leave no shadow worth a draw of their own. */
  private smallShadows() {
    this.scene.traverseVisible((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || !m.castShadow || m.name === "thrift") return;
      // (a batch keeps its own bounds, and its vertices may already be on the GPU only)
      if ((o as THREE.BatchedMesh).isBatchedMesh || !m.geometry.attributes.position?.array.length) return;
      const s = m.geometry.boundingSphere ?? (m.geometry.computeBoundingSphere(), m.geometry.boundingSphere);
      if (s && s.radius * m.matrixWorld.getMaxScaleOnAxis() < SHADOW_MIN) m.castShadow = false;
    });
  }

  private build(list: Kept[]) {
    let verts = 0;
    let idx = 0;
    for (const k of list) {
      verts += k.g.attributes.position.count;
      idx += k.g.index ? k.g.index.count : k.g.attributes.position.count;
    }
    const first = list[0];
    const paintColor = !first.shared && !first.twin;
    const names = Object.keys(first.g.attributes).filter((a) => a !== "color" || !paintColor);
    const out: Record<string, Float32Array> = {};
    const size: Record<string, number> = {};
    for (const a of names) {
      size[a] = first.g.attributes[a].itemSize;
      out[a] = new Float32Array(verts * size[a]);
    }
    const col = paintColor ? new Float32Array(verts * 3) : null;
    const index = new Uint32Array(idx);
    let vi = 0;
    let ii = 0;
    for (const k of list) {
      const g = k.g;
      const P = g.attributes.position;
      const mw = k.o.matrixWorld;
      nm.getNormalMatrix(mw);
      k.from = ii;
      if (g.index) for (let i = 0; i < g.index.count; i++) index[ii++] = vi + g.index.getX(i);
      else for (let i = 0; i < P.count; i++) index[ii++] = vi + i;
      k.to = ii;
      for (const a of names) {
        const A = g.attributes[a];
        const d = out[a];
        const z = size[a];
        for (let i = 0, w = vi * z; i < P.count; i++, w += z) {
          if (a === "position") {
            v.fromBufferAttribute(A, i).applyMatrix4(mw);
            d[w] = v.x;
            d[w + 1] = v.y;
            d[w + 2] = v.z;
          } else if (a === "normal") {
            n.fromBufferAttribute(A, i).applyMatrix3(nm).normalize();
            d[w] = n.x;
            d[w + 1] = n.y;
            d[w + 2] = n.z;
          } else {
            d[w] = A.getX(i);
            if (z > 1) d[w + 1] = A.getY(i);
            if (z > 2) d[w + 2] = A.getZ(i);
            if (z > 3) d[w + 3] = A.getW(i);
          }
        }
      }
      if (col) {
        c.copy(k.m.color);
        for (let i = 0, w = vi * 3; i < P.count; i++, w += 3) {
          col[w] = c.r;
          col[w + 1] = c.g;
          col[w + 2] = c.b;
        }
      }
      vi += P.count;
    }
    const geo = new THREE.BufferGeometry();
    for (const a of names) geo.setAttribute(a, new THREE.BufferAttribute(out[a], size[a]));
    if (col) geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    geo.setIndex(new THREE.BufferAttribute(index, 1));
    let mat: Plain = first.m;
    if (paintColor) {
      mat = first.m.clone();
      mat.vertexColors = true;
      mat.color.set(0xffffff);
    } else if (first.twin) {
      // (a copy: the original stays its owner's, glow and clipping included; its shader hook and
      // program key with it — a material's copy drops them)
      mat = first.m.clone();
      mat.onBeforeCompile = first.m.onBeforeCompile;
      mat.customProgramCacheKey = first.m.customProgramCacheKey;
    }
    const batch = new THREE.Mesh(geo, mat);
    batch.name = "thrift";
    batch.castShadow = first.o.castShadow;
    batch.receiveShadow = first.o.receiveShadow;
    batch.matrixAutoUpdate = false;
    batch.raycast = () => {};
    this.scene.add(batch);
    for (const k of list) {
      k.batch = batch;
      k.o.layers.set(MERGED);
      this.keptOf.add(k.o);
      this.kept.push(k);
    }
  }

  private seenAt = new Map<THREE.Mesh, Float64Array>();

  /** One tile's still shadow casters, as one mesh for the shadow map alone (positions only). */
  private buildShade(list: THREE.Mesh[]) {
    let verts = 0;
    let idx = 0;
    for (const o of list) {
      verts += o.geometry.attributes.position.count;
      idx += o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count;
    }
    const pos = new Float32Array(verts * 3);
    const index = new Uint32Array(idx);
    let vi = 0;
    let ii = 0;
    const m0 = list[0].material as THREE.Material;
    const batch = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ side: m0.side, colorWrite: false, depthWrite: false }));
    (batch.material as THREE.Material).shadowSide = m0.shadowSide;
    for (const o of list) {
      const g = o.geometry;
      const P = g.attributes.position;
      const from = ii;
      if (g.index) for (let i = 0; i < g.index.count; i++) index[ii++] = vi + g.index.getX(i);
      else for (let i = 0; i < P.count; i++) index[ii++] = vi + i;
      for (let i = 0; i < P.count; i++) {
        v.fromBufferAttribute(P, i).applyMatrix4(o.matrixWorld);
        pos[(vi + i) * 3] = v.x;
        pos[(vi + i) * 3 + 1] = v.y;
        pos[(vi + i) * 3 + 2] = v.z;
      }
      vi += P.count;
      this.shades.push({ o, g, world: this.seenAt.get(o)!, batch, from, to: ii });
      o.castShadow = false;
    }
    batch.geometry.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    batch.geometry.setIndex(new THREE.BufferAttribute(index, 1));
    batch.geometry.computeBoundingSphere();
    batch.name = "thrift";
    batch.castShadow = true;
    batch.receiveShadow = false;
    batch.matrixAutoUpdate = false;
    batch.raycast = () => {};
    // (shown for the shadow map's pass alone: see castShades)
    batch.visible = false;
    this.shadeBatches.push(batch);
    this.scene.add(batch);
  }
  private shadeBatches: THREE.Mesh[] = [];

  /**
   * Around the renderer's shadow pass (main.ts wraps it): the shadows-only meshes are there for it
   * and for nothing else (the view's own list is made before the shadow pass, and drawn after it).
   */
  castShades(on: boolean) {
    for (const b of this.shadeBatches) b.visible = on;
  }

  /** A shadow caster moved, changed or went: its triangles leave the tile's, and it casts its own again. */
  private releaseShade(i: number) {
    const k = this.shades[i];
    const index = k.batch.geometry.index!;
    (index.array as Uint32Array).fill(0, k.from, k.to);
    index.addUpdateRange(k.from, k.to - k.from);
    index.needsUpdate = true;
    k.o.castShadow = true;
    this.shades[i] = this.shades[this.shades.length - 1];
    this.shades.pop();
  }

  private shadeChanged(k: Shade) {
    // (walls cut down clip its shadow too: it casts its own again)
    if (k.o.geometry !== k.g || !this.showing(k.o) || (k.o.material as THREE.Material).clippingPlanes?.length) return true;
    const e = k.o.matrixWorld.elements;
    for (let i = 0; i < 16; i++) if (Math.abs(e[i] - k.world[i]) > 1e-4) return true;
    return false;
  }

  /** Is it drawn, as far as its owners are concerned: visible all the way up, in the scene? */
  private showing(o: THREE.Object3D) {
    for (let x: THREE.Object3D | null = o; x; x = x.parent) {
      if (!x.visible) return false;
      if (x === this.scene) return true;
    }
    return false;
  }

  private changed(k: Kept) {
    if (k.o.material !== k.m || k.o.geometry !== k.g || !this.showing(k.o) || k.m.clippingPlanes?.length) return true;
    const e = k.o.matrixWorld.elements;
    for (let i = 0; i < 16; i++) if (Math.abs(e[i] - k.world[i]) > 1e-4) return true;
    if (k.shared) return false;
    const m = k.m as THREE.MeshStandardMaterial;
    return m.color.getHex() !== k.color || (m.emissive?.getHex() ?? 0) !== k.emissive || m.opacity !== k.opacity || m.transparent || !m.visible;
  }

  /**
   * Out of its batch right away, drawn by itself again (walls down is about to clip it, src/main.ts:
   * the watch below would see it only after a few frames, the building whole meanwhile).
   */
  unmerge(root: THREE.Object3D) {
    root.traverse((o) => {
      if (!this.keptOf.has(o)) return;
      const i = this.kept.findIndex((k) => k.o === o);
      if (i >= 0) this.release(i);
    });
  }

  /** Something merged is no longer what it was: its triangles go, and it draws itself again. */
  private release(i: number) {
    const k = this.kept[i];
    const index = k.batch.geometry.index!;
    (index.array as Uint32Array).fill(0, k.from, k.to);
    index.addUpdateRange(k.from, k.to - k.from);
    index.needsUpdate = true;
    k.o.layers.set(0);
    this.keptOf.delete(k.o);
    this.refused.add(k.o);
    this.kept[i] = this.kept[this.kept.length - 1];
    this.kept.pop();
  }

  /** Each frame: a share of the watching, and a share of the too-small. */
  update(cam: THREE.Camera, height: number) {
    // (a weak processor's last levels: a half and a third of the watching, a frame, see load.ts)
    const watch = load.level >= 4 ? WATCH_PER_FRAME / 3 : load.level >= 3 ? WATCH_PER_FRAME / 2 : WATCH_PER_FRAME;
    for (let w = 0, n = Math.min(watch, this.kept.length); w < n && this.kept.length; w++) {
      this.at = this.at >= this.kept.length - 1 ? 0 : this.at + 1;
      if (this.changed(this.kept[this.at])) this.release(this.at);
    }
    for (let w = 0, n = Math.min(watch, this.shades.length); w < n && this.shades.length; w++) {
      this.shadeAt = this.shadeAt >= this.shades.length - 1 ? 0 : this.shadeAt + 1;
      if (this.shadeChanged(this.shades[this.shadeAt])) this.releaseShade(this.shadeAt);
    }
    // (the list of what could be skipped, made again now and then)
    if (this.tinyList-- <= 0) {
      this.tinyList = 240;
      this.tiny.length = 0;
      this.scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh || (m as unknown as THREE.InstancedMesh).isInstancedMesh || (m as unknown as THREE.BatchedMesh).isBatchedMesh || m.name === "thrift" || !m.frustumCulled || m.userData.cityBatch) return;
        if (m.layers.mask === 1 || m.layers.mask === 1 << TINY) this.tiny.push(m);
      });
    }
    const persp = (cam as THREE.PerspectiveCamera).isPerspectiveCamera;
    const pxAt = persp ? height / (2 * Math.tan(((cam as THREE.PerspectiveCamera).fov * Math.PI) / 360)) : 0;
    const orth = cam as THREE.OrthographicCamera;
    const pxFlat = persp ? 0 : (height * orth.zoom) / (orth.top - orth.bottom);
    const eye = cam.matrixWorld.elements;
    // (a processor that cannot keep up: what is a little larger is skipped too, ~3, ~4 and ~5 px
    // round; at its last levels, the small things the fog has mostly taken too, load.cut)
    const least = TINY_PX * (1 + 0.4 * Math.min(3, load.level));
    for (let w = 0; w < TINY_PER_FRAME && this.tiny.length; w++) {
      this.tinyAt = this.tinyAt >= this.tiny.length - 1 ? 0 : this.tinyAt + 1;
      const m = this.tiny[this.tinyAt];
      const g = m.geometry;
      const s = g.boundingSphere ?? (g.computeBoundingSphere(), g.boundingSphere);
      if (!s) continue;
      const e = m.matrixWorld.elements;
      // (the largest scale along an axis, cheaply)
      const scale = Math.max(Math.abs(e[0]) + Math.abs(e[1]) + Math.abs(e[2]), Math.abs(e[4]) + Math.abs(e[5]) + Math.abs(e[6]), Math.abs(e[8]) + Math.abs(e[9]) + Math.abs(e[10]));
      const r = s.radius * scale;
      const px = persp ? (r * pxAt) / Math.max(0.1, Math.hypot(e[12] - eye[12], e[13] - eye[13], e[14] - eye[14])) : r * pxFlat;
      let small = px < least;
      if (!small && persp && load.level >= 3) {
        // (from its centre, a geometry is not always centred on its origin)
        const at = mid.copy(s.center).applyMatrix4(m.matrixWorld);
        small = at.distanceTo(eye3.set(eye[12], eye[13], eye[14])) - r > load.cut(r);
      }
      if (small !== (m.layers.mask === 1 << TINY)) m.layers.set(small ? TINY : 0);
    }
  }

  get stats() {
    return { merged: this.kept.length, draws: new Set(this.kept.map((k) => k.batch)).size, tiny: this.tiny.filter((m) => m.layers.mask === 1 << TINY).length, shadows: this.shades.length, shadowDraws: new Set(this.shades.map((k) => k.batch)).size };
  }
}
