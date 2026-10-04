import * as THREE from "three";
import { ZScan } from "../data/zscan";
import type { Venue } from "./city";

const CELL = 0.56;
const CARD = 0.44;

/**
 * The card shop's walls: the rarest zkSNARKs, framed, in a grid on the back and side walls.
 * Images come from the collection API; each card knows its id (userData.card) for picking.
 */
export class CardWall {
  readonly group = new THREE.Group();
  readonly cards: THREE.Mesh[] = [];

  constructor(parent: THREE.Object3D, venue: Venue) {
    parent.add(this.group);
    void this.build(venue);
  }

  private async build(venue: Venue) {
    const slots: { pos: THREE.Vector3; yaw: number }[] = [];
    for (const [a, b] of venue.walls) {
      const back = Math.abs(a.z - b.z) < 0.01;
      const span = back ? Math.abs(b.x - a.x) : Math.abs(b.z - a.z);
      const cols = Math.floor(span / CELL),
        rows = Math.floor(Math.abs(a.y - b.y) / CELL);
      for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++) {
          const k = (c + 0.5) / cols;
          const y = Math.max(a.y, b.y) - (r + 0.5) * CELL;
          slots.push(
            back
              ? { pos: new THREE.Vector3(a.x + (b.x - a.x) * k, y, a.z + 0.02), yaw: 0 }
              : { pos: new THREE.Vector3(a.x + 0.02, y, a.z + (b.z - a.z) * k), yaw: Math.PI / 2 },
          );
        }
    }
    const ids = (await ZScan.rarest(slots.length)).map((r) => r.id);
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin("anonymous");
    const frameGeo = new THREE.BoxGeometry(CARD + 0.06, CARD + 0.06, 0.03);
    const frameMat = new THREE.MeshStandardMaterial({ color: "#c9a227", metalness: 0.6, roughness: 0.35 });
    const cardGeo = new THREE.PlaneGeometry(CARD, CARD);
    slots.forEach((s, i) => {
      const id = ids[i % Math.max(1, ids.length)];
      if (!id) return;
      const tex = loader.load(ZScan.zkSnarkImage(id));
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.magFilter = THREE.NearestFilter;
      const card = new THREE.Mesh(cardGeo, new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(0.95, 0.95, 0.95) }));
      const frame = new THREE.Mesh(frameGeo, frameMat);
      card.position.copy(s.pos);
      card.rotation.y = s.yaw;
      frame.position.copy(s.pos).add(new THREE.Vector3(0, 0, -0.02).applyAxisAngle(new THREE.Vector3(0, 1, 0), s.yaw));
      frame.rotation.y = s.yaw;
      card.userData.card = id;
      this.group.add(frame, card);
      this.cards.push(card);
    });
  }
}
