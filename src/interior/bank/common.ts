import * as THREE from "three";
import { ZScan } from "../../data/zscan";
import { loadArt, Snark } from "../../scene/snark";
import type { PickInfo } from "../types";

/** What a click or a hover on one object of the bank says. */
interface Entry {
  pick: () => PickInfo | null;
  hover: () => string | null;
}

export class Picks {
  readonly list: THREE.Object3D[] = [];
  private map = new Map<THREE.Object3D, Entry>();

  add(obj: THREE.Object3D, pick: Entry["pick"], hover: Entry["hover"]) {
    this.list.push(obj);
    this.map.set(obj, { pick, hover });
  }

  find(hit: THREE.Intersection): Entry | null {
    for (let o: THREE.Object3D | null = hit.object; o; o = o.parent) {
      const e = this.map.get(o);
      if (e) return e;
    }
    return null;
  }
}

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Everyone in the bank; each needs `update` with the walking camera every frame. */
export class Cast {
  readonly all: Snark[] = [];
  private right = new THREE.Vector3();

  constructor(
    private parent: THREE.Object3D,
    private picks: Picks,
  ) {}

  /** Bring a zkSNARK in at `pos` (resolves null if its portrait can't be loaded). */
  async spawn(id: number, pos: THREE.Vector3, role: string, o: { face?: THREE.Vector3; pickTitle?: string; pickBody?: string } = {}) {
    try {
      const s = new Snark(id, await loadArt(id));
      s.noClip = true;
      s.role = role;
      s.state = "resident";
      s.root.position.copy(pos);
      if (o.face) s.faceDir = o.face.clone();
      this.parent.add(s.root);
      this.all.push(s);
      this.picks.add(
        s.body,
        () => ({
          eyebrow: o.pickTitle ?? role,
          title: s.name,
          image: ZScan.zkSnarkImage(id),
          mono: true,
          body: o.pickBody,
        }),
        () => `<b>${esc(s.name)}</b><span>${esc(role)}</span>`,
      );
      return s;
    } catch {
      return null;
    }
  }

  update(dt: number, t: number, camera: THREE.Camera) {
    this.right.set(1, 0, 0).applyQuaternion(camera.quaternion);
    for (const s of this.all) s.update(dt, t, camera.quaternion, this.right);
  }
}
