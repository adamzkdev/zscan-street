import * as THREE from "three";

/**
 * Thousands of things in the city never move, and every frame three.js made their matrix again and
 * multiplied it down their tree all the same (a fifth of the frame's script time). Here a matrix is
 * made again only when the position, rotation or scale has really changed; what hangs under a
 * changed parent is still carried along, as before.
 */
type Kept = THREE.Object3D & { kept?: Float64Array; lazyHidden?: boolean; nap?: number; napSlot?: number };

/**
 * A weak processor's last levels (scene/load.ts): a branch in which nothing has moved for a while
 * is walked only one frame in `every` (its own turn, `napSlot`). The walk that finds something
 * changed in it wakes it up: it is walked every frame again until it has been still as long. What
 * starts to move in a still branch is late by a frame or two, once. every 1: always walked.
 */
export const naps = { every: 1, frame: 0 };
/** Whether this branch is still (has napped, see naps): nothing in it has moved for a while. */
export const isStill = (o: THREE.Object3D) => ((o as Kept).nap ?? -1) >= QUIET;
/** Walks without a change before a branch may nap. */
const QUIET = 30;
/** Matrices made again (counted: whether a branch's walk changed anything). */
let bumps = 0;

THREE.Object3D.prototype.updateMatrixWorld = function (this: Kept, force?: boolean) {
  if (this.visible === false && this.lazyHidden === true) {
    // (see lazyWhileHidden: the whole branch is made again the frame it shows)
    this.matrixWorldNeedsUpdate = true;
    return;
  }
  let b0 = -1;
  if (this.nap !== undefined && naps.every > 1) {
    if (this.nap >= QUIET && force !== true && this.matrixWorldNeedsUpdate === false && (naps.frame + this.napSlot!) % naps.every !== 0) return;
    b0 = bumps;
  }
  if (this.matrixAutoUpdate) {
    const p = this.position;
    const q = this.quaternion;
    const s = this.scale;
    const k = this.kept;
    if (!k || k[0] !== p.x || k[1] !== p.y || k[2] !== p.z || k[3] !== q.x || k[4] !== q.y || k[5] !== q.z || k[6] !== q.w || k[7] !== s.x || k[8] !== s.y || k[9] !== s.z || this.pivot !== null) {
      this.updateMatrix();
      const n = k ?? (this.kept = new Float64Array(10));
      n[0] = p.x;
      n[1] = p.y;
      n[2] = p.z;
      n[3] = q.x;
      n[4] = q.y;
      n[5] = q.z;
      n[6] = q.w;
      n[7] = s.x;
      n[8] = s.y;
      n[9] = s.z;
    }
  }
  if (this.matrixWorldNeedsUpdate || force) {
    if (this.matrixWorldAutoUpdate === true) {
      if (this.parent === null) this.matrixWorld.copy(this.matrix);
      else this.matrixWorld.multiplyMatrices(this.parent.matrixWorld, this.matrix);
    }
    this.matrixWorldNeedsUpdate = false;
    force = true;
    bumps++;
  }
  const c = this.children;
  for (let i = 0, l = c.length; i < l; i++) c[i].updateMatrixWorld(force);
  if (b0 >= 0) this.nap = bumps === b0 ? this.nap! + 1 : 0;
};

/**
 * The branches of `root` that may nap (see naps): every one with something under it, but none that
 * holds a camera or a light (their matrices are read as the frame is drawn).
 */
export function napBranches(root: THREE.Object3D) {
  let n = 0;
  const mark = (o: Kept): boolean => {
    let live = (o as THREE.Camera).isCamera === true || (o as THREE.Light).isLight === true;
    for (const c of o.children) if (mark(c as Kept)) live = true;
    if (o !== root && o.children.length > 0 && !live) {
      if (o.nap === undefined) (o.nap = 0), (o.napSlot = o.id), n++;
    } else if (live && o.nap !== undefined) delete o.nap;
    return live;
  };
  mark(root as Kept);
  return n;
}

/**
 * A transparent double-sided material is drawn by three.js in two passes, back faces then front
 * faces, and each pass changes the material's side: two shader look-ups per draw, every frame. Added light with no depth written
 * comes out the same in any order, so those are drawn in one pass (an explicit setting still wins).
 */
type SinglePass = THREE.Material & { singlePass?: boolean };
Object.defineProperty(THREE.Material.prototype, "forceSinglePass", {
  configurable: true,
  get(this: SinglePass) {
    return this.singlePass ?? (this.blending === THREE.AdditiveBlending && this.depthWrite === false);
  },
  set(this: SinglePass, v: boolean) {
    // (only a choice of its own is kept: the constructor's default and a copy's read-back are not)
    if (v !== (this.blending === THREE.AdditiveBlending && this.depthWrite === false)) this.singlePass = v;
  },
});

/**
 * Opt-in: while hidden, this object and everything under it are skipped by the matrix pass (a
 * figure's selection glow, a far building's walls-down copy: thousands of hidden things walked every
 * frame for nothing). Its matrices are made again, all of them, the
 * frame it shows. Only for what nothing measures or ray-casts while it is hidden.
 */
export function lazyWhileHidden(o: THREE.Object3D) {
  (o as Lazy).lazyHidden = true;
  return o;
}
type Lazy = THREE.Object3D & { lazyHidden?: boolean };
