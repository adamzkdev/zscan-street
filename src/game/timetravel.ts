import * as THREE from "three";
import { ZScan, links } from "../data/zscan";
import type { Decor } from "../scene/decor";
import type { GameHud } from "./ui";

interface Era {
  key: string;
  year: string;
  name: string;
  height: number;
  /** How far from the heart the city reached (m). */
  radius: number;
  /** A look for the canvas (old photos fade). */
  filter: string;
  line: string;
}

const ERAS: Era[] = [
  { key: "genesis", year: "2016", name: "Genesis · Sprout", height: 1, radius: 55, filter: "sepia(0.75) contrast(1.05) brightness(0.95)", line: "October 28, 2016: the first block. A village round one street, the Sprout pool, slow start." },
  { key: "sapling", year: "2018", name: "Sapling", height: 419200, radius: 95, filter: "sepia(0.45) saturate(0.8)", line: "October 2018: Sapling makes shielded transactions fast enough for phones." },
  { key: "blossom", year: "2019", name: "Blossom", height: 653600, radius: 125, filter: "sepia(0.3) saturate(0.85)", line: "December 2019: Blossom halves the block time to 75 seconds." },
  { key: "canopy", year: "2020", name: "Canopy · first halving", height: 1046400, radius: 165, filter: "sepia(0.18) saturate(0.9)", line: "November 2020: the first halving, the Founders' Reward ends, the Dev Fund begins." },
  { key: "nu5", year: "2022", name: "NU5 · Orchard", height: 1687104, radius: 205, filter: "saturate(0.95)", line: "May 2022: Orchard and Halo 2. No more trusted setup." },
  { key: "nu6", year: "2024", name: "NU6 · second halving", height: 2726400, radius: 600, filter: "none", line: "November 2024: the second halving, the lockbox for the community." },
];

/**
 * The Genesis Line: a ride back through Zcash's history. Pick an era and the megalopolis shrinks
 * to what it was (a village round the heart in 2016, growing ring by ring), the picture fades like
 * an old photo, and the screens show a real block of the time. Hidden things move to a camera
 * layer the city's camera doesn't draw, so the level-of-detail switching never fights it.
 */
export class TimeTravel {
  era: Era | null = null;
  private panel: HTMLElement;
  private spheres = new WeakMap<THREE.Object3D, THREE.Sphere>();
  private hidden: THREE.Object3D[] = [];

  constructor(
    private scene: THREE.Scene,
    private canvas: HTMLCanvasElement,
    private decor: Decor,
    private hud: GameHud,
  ) {
    this.panel = document.createElement("div");
    this.panel.className = "genesis hud";
    hud.root.append(this.panel);
    this.panel.addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>("[data-era]");
      if ((e.target as HTMLElement).closest("[data-x]")) this.panel.classList.remove("open");
      if (b) void this.go(b.dataset.era === "now" ? null : (ERAS.find((x) => x.key === b.dataset.era) ?? null));
    });
    hud.addRow(() => `<dt>Genesis Line</dt><dd><button class="caselink" data-genesis>${this.era ? `in ${this.era.year}` : "⏳ ride"}</button></dd>`);
    hud.root.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).closest("[data-genesis]")) this.open();
    });
  }

  open(block?: { height: number; time: string; txs: number }) {
    const e = this.era;
    this.panel.innerHTML = `<header><label>創世線 · GENESIS LINE</label><button data-x>×</button></header>
      ${e ? `<h3>${e.year} · ${e.name}</h3><p>${e.line}</p>${block ? `<p class="blk">Block <a href="${links.block(block.height)}" target="_blank" rel="noopener">${block.height.toLocaleString("en-US")} ↗</a> · ${new Date(block.time).toUTCString().slice(5, 16)} · ${block.txs} tx</p>` : ""}` : `<p>Ride back through Zcash's history: the city shrinks to what it was.</p>`}
      <div class="eras">${ERAS.map((x) => `<button data-era="${x.key}" class="${e?.key === x.key ? "on" : ""}"><b>${x.year}</b><span>${x.name}</span></button>`).join("")}<button data-era="now" class="${e ? "" : "on"}"><b>${new Date().getFullYear()}</b><span>Today</span></button></div>`;
    this.panel.classList.add("open");
  }

  private sphereOf(o: THREE.Object3D) {
    let s = this.spheres.get(o);
    if (!s) {
      const m = o as THREE.Mesh;
      if (!m.geometry) return null;
      if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
      s = m.geometry.boundingSphere!.clone().applyMatrix4(o.matrixWorld);
      this.spheres.set(o, s);
    }
    return s;
  }

  async go(era: Era | null) {
    // back to everything
    for (const o of this.hidden) o.layers.set(0);
    this.hidden = [];
    this.era = era;
    this.canvas.style.filter = era ? era.filter : "";
    if (!era) {
      this.open();
      this.hud.say(`<b>BACK TO ${new Date().getFullYear()}</b> · the whole city again`);
      return;
    }
    this.scene.updateMatrixWorld();
    const r2 = era.radius * era.radius;
    this.scene.traverse((o) => {
      if (!(o as THREE.Mesh).isMesh && !(o as THREE.Points).isPoints && !(o as THREE.Sprite).isSprite) return;
      const s = this.sphereOf(o);
      // the ground, the water, whole-city meshes stay; what stands beyond the era's edge goes
      if (!s || s.radius > 150) return;
      if (s.center.x * s.center.x + s.center.z * s.center.z > r2) {
        o.layers.set(1);
        this.hidden.push(o);
      }
    });
    const b = await ZScan.block(era.height);
    this.open(b ? { height: b.height, time: new Date(b.time).toISOString(), txs: b.txs.length + 1 } : undefined);
    this.decor.alert({ kind: "game", title: `GENESIS LINE  ${era.year}`, big: era.name.toUpperCase(), line: b ? `BLOCK ${b.height.toLocaleString("en-US")} · ${b.txs.length + 1} TX` : "ZCASH HISTORY", color: "#c9a25b" });
    this.hud.say(`<b>${era.year}</b> · ${era.line}`);
  }
}
