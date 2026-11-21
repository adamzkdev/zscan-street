import * as THREE from "three";
import { portraitImage } from "../data/portrait";
import { get, ZScan } from "../data/zscan";
import type { City } from "./city";
import type { Decor } from "./decor";

/**
 * The Needle's LED screen: the last zkSNARKs sold on Zilk Road, one after another, as 26 × 26
 * lit pixels over the tower's face (front and back, under the anniversary banner), the sale under
 * it. A new sale while you watch takes over every LED screen in the city for a moment.
 */

const FONT = '"DotGothic16", "JetBrains Mono", monospace';
const SHOW = 14;
const POLL = 120;

interface Sale {
  item_id: string;
  price: number;
  time: string;
}

export class LedTower {
  readonly group = new THREE.Group();
  private canvas = document.createElement("canvas");
  private g: CanvasRenderingContext2D;
  private tex: THREE.CanvasTexture;
  private mat: THREE.MeshBasicMaterial;
  private sales: Sale[] = [];
  private imgs = new Map<string, HTMLImageElement>();
  private i = 0;
  private t = SHOW;
  private poll = 0;
  private newest = "";
  private flash = 0;

  constructor(
    scene: THREE.Scene,
    city: City,
    private decor: Decor,
  ) {
    this.canvas.width = 520;
    this.canvas.height = 680;
    this.g = this.canvas.getContext("2d")!;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.magFilter = THREE.NearestFilter;
    this.tex.minFilter = THREE.LinearMipmapLinearFilter;
    this.mat = new THREE.MeshBasicMaterial({ map: this.tex, toneMapped: false });
    this.mat.color.setScalar(1.25);
    scene.add(this.group);
    this.blank();
    const lm = city.landmarks.get("needle");
    if (lm) {
      const h = lm.occluder.box.max.y;
      const out = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), lm.yaw);
      const at = lm.door.clone().addScaledVector(out, 0.5);
      at.y = h * 0.3;
      const height = Math.min(34, h * 0.12);
      this.mount(lm.occluder.full, at, (height * 520) / 680, height, lm.yaw);
      const centre = lm.occluder.box.getCenter(new THREE.Vector3());
      const back = at.clone();
      back.x = centre.x * 2 - at.x;
      back.z = centre.z * 2 - at.z;
      this.mount(lm.occluder.full, back, (height * 520) / 680, height, lm.yaw + Math.PI);
    }
    void this.refresh(true);
  }

  /** A flat LED panel in a dark bezel, hung on the tower's face where a ray from outside meets it. */
  private mount(building: THREE.Object3D, at: THREE.Vector3, width: number, height: number, yaw: number) {
    building.updateWorldMatrix(true, true);
    const out = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const ray = new THREE.Raycaster(at.clone().addScaledVector(out, 150), out.clone().negate());
    const hit = ray.intersectObject(building, true).find((x) => x.object instanceof THREE.Mesh);
    if (!hit) return;
    const g = new THREE.Group();
    g.position.copy(hit.point).addScaledVector(out, 1.2);
    g.rotation.y = yaw;
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(width, height), this.mat);
    screen.position.z = 0.36;
    screen.raycast = () => {};
    const bezel = new THREE.Mesh(new THREE.BoxGeometry(width + 1.2, height + 1.2, 0.6), new THREE.MeshStandardMaterial({ color: "#0c0b10", roughness: 0.4, metalness: 0.6 }));
    bezel.raycast = () => {};
    // brackets back to the wall
    for (const sx of [-1, 1])
      for (const sy of [-1, 1]) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 1.4), bezel.material);
        b.position.set((sx * width) / 2.6, (sy * height) / 2.6, -0.9);
        g.add(b);
      }
    g.add(bezel, screen);
    this.group.add(g);
  }

  private async refresh(first = false) {
    const d = await get<{ venue_sales?: Sale[] }>("/v1/collections/zksnarks?tab=sales");
    const list = (d?.venue_sales ?? []).slice(0, 6);
    if (!list.length) return;
    const key = `${list[0].item_id}@${list[0].time}`;
    // a sale since you came: the whole city hears of it
    if (!first && key !== this.newest) {
      const s = list[0];
      this.decor.alert({
        kind: "game",
        title: "SOLD · ZILK ROAD",
        big: `#${s.item_id}`,
        line: `zkSNARK · ${(s.price / 1e8).toLocaleString("en-US", { maximumFractionDigits: 3 })} ZEC`,
        color: "#7dffb0",
      });
      this.i = 0;
      this.t = SHOW;
      this.flash = 1;
    }
    this.newest = key;
    this.sales = list;
    await Promise.all(
      list.map(async (s) => {
        if (this.imgs.has(s.item_id)) return;
        const im = await portraitImage(ZScan.zkSnarkImage(Number(s.item_id))).catch(() => null);
        if (im) this.imgs.set(s.item_id, im);
      }),
    );
    this.draw();
  }

  private blank() {
    const g = this.g;
    g.fillStyle = "#050407";
    g.fillRect(0, 0, 520, 680);
    this.tex.needsUpdate = true;
  }

  private draw() {
    const s = this.sales[this.i % Math.max(1, this.sales.length)];
    if (!s) return;
    const g = this.g;
    g.fillStyle = "#050407";
    g.fillRect(0, 0, 520, 680);
    const im = this.imgs.get(s.item_id);
    if (im) {
      g.imageSmoothingEnabled = false;
      g.drawImage(im, 0, 0, 520, 520);
    }
    // the LED grid: a dark line between the pixels
    g.fillStyle = "rgba(5,4,7,0.55)";
    for (let k = 0; k <= 26; k++) {
      g.fillRect(k * 20 - 1, 0, 2, 520);
      g.fillRect(0, k * 20 - 1, 520, 2);
    }
    g.textAlign = "center";
    g.fillStyle = "#7dffb0";
    g.font = `400 46px ${FONT}`;
    g.fillText(`SOLD · #${s.item_id}`, 260, 584);
    g.fillStyle = "#f4b728";
    g.font = `400 52px ${FONT}`;
    g.fillText(`${(s.price / 1e8).toLocaleString("en-US", { maximumFractionDigits: 3 })} ZEC`, 260, 650);
    this.tex.needsUpdate = true;
  }

  update(dt: number, night: boolean) {
    this.poll += dt;
    if (this.poll > POLL) {
      this.poll = 0;
      void this.refresh();
    }
    this.t -= dt;
    if (this.t <= 0 && this.sales.length) {
      this.t = SHOW;
      this.i = (this.i + 1) % this.sales.length;
      this.draw();
    }
    // brighter by night; a new sale flashes
    this.flash = Math.max(0, this.flash - dt * 0.5);
    const k = (night ? 1.25 : 0.85) * (1 + this.flash * Math.max(0, Math.sin(this.flash * 40)) * 0.8);
    this.mat.color.setScalar(k);
  }
}
