import * as THREE from "three";
import { ZScan } from "../data/zscan";
import { profile } from "../game/profile";
import { makeSnarkBody, preloadSnarks, type SnarkBody } from "../scene/snarkbody";
import { BODY_SCALE } from "./foot";
import { Mosaic } from "./mosaic";

/**
 * The garage (src/gta): before you play, you pick who you are. Your zkSNARK stands on a turntable
 * under a row of light tubes, in voxels, turning slowly; the cards below are the ones you can be —
 * your own (the one the city gave you), the rarest of the collection, a few drawn at random, or any
 * number you type. PLAY puts you in the street as that one.
 *
 * Its own small scene, drawn by the street's renderer and post (main.ts asks `open` each frame).
 */

const LAST = "zstreet.gta.snark";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export class Garage {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(34, 1, 0.1, 80);
  private el: HTMLElement;
  private body: SnarkBody | null = null;
  private stand = new THREE.Group();
  private turn = 0;
  private dragX: number | null = null;
  private spin = 0;
  open = false;
  id: number;
  private onPlay: ((id: number) => void) | null = null;
  private onClose: (() => void) | null = null;
  private rare: { id: number; rank: number }[] = [];
  private picks: number[] = [];
  private tubes: THREE.Mesh[] = [];
  private t = 0;
  private mosaic: Mosaic;

  constructor(ui: HTMLElement) {
    this.id = Garage.chosen();
    this.camera.position.set(0, 0.95, 4.6);
    this.camera.lookAt(0, 0.5, 0);
    this.build();
    this.el = document.createElement("div");
    this.el.className = "gta-garage";
    this.el.setAttribute("role", "dialog");
    this.el.setAttribute("aria-label", "Choose your zkSNARK");
    ui.append(this.el);
    this.mosaic = new Mosaic(this.el, (id) => this.pick(id));
    this.el.addEventListener("pointerdown", (e) => {
      if ((e.target as HTMLElement).closest("button,input,.gg-cards,.gg-mosaic")) return;
      this.dragX = e.clientX;
    });
    window.addEventListener("pointermove", (e) => {
      if (this.dragX === null) return;
      this.spin = (e.clientX - this.dragX) * 0.012;
      this.turn += this.spin;
      this.dragX = e.clientX;
    });
    window.addEventListener("pointerup", () => (this.dragX = null));
    window.addEventListener("keydown", (e) => {
      if (!this.open || (e.target as HTMLElement)?.tagName === "INPUT") return;
      if (this.mosaic.isOpen) return;
      if (e.key === "Enter") this.play();
      else if (e.key === "Escape") this.close();
      else if (e.key === "ArrowRight" || e.key === "ArrowLeft") this.step(e.key === "ArrowRight" ? 1 : -1);
    });
  }

  /** The zkSNARK picked last time (else the one the city gave this visitor). */
  static chosen() {
    try {
      const v = Number(localStorage.getItem(LAST));
      if (v >= 1 && v <= 10000) return v;
    } catch {}
    const a = profile.p.avatar;
    return a >= 1 && a <= 10000 ? a : 1 + Math.floor(Math.random() * 10000);
  }

  private build() {
    const s = this.scene;
    s.background = new THREE.Color("#06070a");
    s.fog = new THREE.Fog("#06070a", 7, 16);
    s.add(new THREE.HemisphereLight("#9fb3d8", "#0a0a10", 0.5));
    const key = new THREE.SpotLight("#fff4e0", 60, 12, 0.55, 0.6, 1.4);
    key.position.set(1.4, 5, 3.2);
    key.target.position.set(0, 0.8, 0);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    s.add(key, key.target);
    for (const [x, c, k] of [
      [-2.6, "#7fb2ff", 14],
      [2.6, "#f4b728", 16],
    ] as const) {
      const rim = new THREE.PointLight(c, k, 6, 1.6);
      rim.position.set(x, 2.2, -1.6);
      s.add(rim);
    }
    // the floor: dark, a little glossy
    const floor = new THREE.Mesh(new THREE.CircleGeometry(14, 64), new THREE.MeshStandardMaterial({ color: "#0d0f14", roughness: 0.32, metalness: 0.55 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    s.add(floor);
    // the turntable and its gold ring
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.2, 0.06, 64), new THREE.MeshStandardMaterial({ color: "#16181f", roughness: 0.4, metalness: 0.7 }));
    disc.position.y = 0.03;
    disc.receiveShadow = true;
    s.add(disc);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.17, 0.012, 8, 96), new THREE.MeshBasicMaterial({ color: new THREE.Color("#f4b728").multiplyScalar(2.2), toneMapped: false }));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.062;
    s.add(ring);
    this.stand.position.y = 0.06;
    s.add(this.stand);
    // the light tubes, in an arc behind
    const tubeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color("#e8eeff").multiplyScalar(2.4), toneMapped: false });
    const tubeGeo = new THREE.BoxGeometry(0.07, 7, 0.07);
    for (let i = 0; i < 9; i++) {
      const a = (i / 8 - 0.5) * 2.3;
      const t = new THREE.Mesh(tubeGeo, tubeMat.clone());
      t.position.set(Math.sin(a) * 6.2, 3.2, -Math.cos(a) * 6.2 + 1.2);
      s.add(t);
      this.tubes.push(t);
    }
  }

  /** Open it; `play` is called with the zkSNARK picked. */
  show(play: (id: number) => void, close?: () => void) {
    this.onPlay = play;
    this.onClose = close ?? null;
    this.open = true;
    this.el.classList.add("on");
    if (!this.picks.length) this.draw();
    this.wear(this.id);
    this.render();
    if (!this.rare.length)
      void ZScan.rarest(12).then((r) => {
        this.rare = r;
        this.render();
      });
  }

  close() {
    if (!this.open) return;
    this.open = false;
    this.el.classList.remove("on");
    this.onClose?.();
  }

  resize(w: number, h: number) {
    this.camera.aspect = w / h;
    // a narrow screen: step back so the body fits
    this.camera.position.z = w / h < 1 ? 6.6 : 4.6;
    this.camera.updateProjectionMatrix();
  }

  private draw() {
    const set = new Set<number>([this.id, profile.p.avatar].filter((x) => x >= 1 && x <= 10000));
    while (set.size < 7) set.add(1 + Math.floor(Math.random() * 10000));
    this.picks = [...set];
    void preloadSnarks(this.picks, 2500);
  }

  private wear(id: number) {
    this.id = id;
    const old = this.body;
    const b = makeSnarkBody(id);
    b.root.scale.setScalar(BODY_SCALE);
    b.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = !o.userData.noShadow;
    });
    this.stand.add(b.root);
    this.body = b;
    old?.dispose();
    b.wave(1.8);
  }

  private step(d: number) {
    const all = this.list();
    const i = all.findIndex((x) => x.id === this.id);
    const n = all[(i + d + all.length) % all.length];
    if (n) this.pick(n.id);
  }

  private list() {
    const mine = profile.p.avatar;
    const out: { id: number; tag: string }[] = [];
    const seen = new Set<number>();
    const add = (id: number, tag: string) => {
      if (seen.has(id) || id < 1 || id > 10000) return;
      seen.add(id);
      out.push({ id, tag });
    };
    if (mine >= 1) add(mine, "Yours");
    add(this.id, this.id === mine ? "Yours" : "Picked");
    for (const r of this.rare.slice(0, 4)) add(r.id, `Rank ${r.rank}`);
    for (const p of this.picks) add(p, "Random");
    return out;
  }

  pick(id: number) {
    if (id < 1 || id > 10000 || !Number.isFinite(id)) return;
    this.wear(id);
    this.render();
  }

  private play() {
    try {
      localStorage.setItem(LAST, String(this.id));
    } catch {}
    const id = this.id;
    this.close();
    this.onPlay?.(id);
  }

  private render() {
    const keep = this.mosaic?.el;
    const all = this.list();
    const rank = this.rare.find((r) => r.id === this.id)?.rank;
    const mine = this.id === profile.p.avatar;
    this.el.innerHTML = `
      <header class="gg-head">
        <h1 class="gta-disp">Garage</h1>
        <div class="gg-chip"><i>?</i><span>Pick who you play · drag to turn</span></div>
        <button class="gg-x" type="button" aria-label="Close" title="Close (Esc)">×</button>
      </header>
      <div class="gg-who">
        <div class="gg-name gta-disp">zkSNARK <em>#${this.id}</em></div>
        <div class="gg-tags">${mine ? `<b class="gta-tag gold">Yours</b>` : ""}${rank ? `<b class="gta-tag">Rank ${rank}</b>` : ""}<span>One of 10,000 · its own pixel art, in voxels</span></div>
      </div>
      <button class="gta-btn gold gg-play" type="button">Play<small>Enter</small></button>
      <div class="gg-cards" role="listbox" aria-label="zkSNARKs">
        ${all
          .map(
            (c) => `<button class="gg-card ${c.id === this.id ? "on" : ""}" data-id="${c.id}" role="option" aria-selected="${c.id === this.id}">
              <span class="gg-img"><img src="${esc(ZScan.zkSnarkImage(c.id))}" alt="" loading="lazy"/></span>
              <b class="gta-tag ${c.tag === "Yours" ? "gold" : ""}">${esc(c.tag)}</b>
              <span class="gg-cn gta-disp">#${c.id}</span>
            </button>`,
          )
          .join("")}
        <form class="gg-card gg-num">
          <span class="gg-plus">#</span>
          <input type="number" min="1" max="10000" placeholder="1–10000" aria-label="zkSNARK number" />
          <button class="gta-btn" type="submit">Wear</button>
          <button class="gg-dice" type="button" title="Another seven">Draw again</button>
        </form>
        <button class="gg-card gg-all" type="button"><span class="gg-grid"></span><b class="gta-disp">All 10,000</b><small>filter by rarity and traits</small></button>
      </div>`;
    if (keep) this.el.append(keep);
    this.el.querySelector(".gg-x")!.addEventListener("click", () => this.close());
    this.el.querySelector(".gg-play")!.addEventListener("click", () => this.play());
    for (const b of this.el.querySelectorAll<HTMLElement>(".gg-card[data-id]")) b.addEventListener("click", () => this.pick(Number(b.dataset.id)));
    const form = this.el.querySelector<HTMLFormElement>(".gg-num")!;
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const v = Math.round(Number(form.querySelector("input")!.value));
      if (v >= 1 && v <= 10000) this.pick(v);
    });
    this.el.querySelector(".gg-all")!.addEventListener("click", () => this.mosaic.show(true));
    form.querySelector(".gg-dice")!.addEventListener("click", () => {
      this.draw();
      this.render();
    });
  }

  update(dt: number) {
    this.t += dt;
    if (this.dragX === null) {
      this.spin *= Math.exp(-dt * 3);
      this.turn += this.spin + dt * 0.35;
    }
    this.stand.rotation.y = this.turn;
    this.body?.update(dt, { speed: 0, grounded: true });
    // the tubes breathe a little, one after the other
    this.tubes.forEach((t, i) => (t.material as THREE.MeshBasicMaterial).color.setScalar(2 + Math.sin(this.t * 1.3 + i * 0.7) * 0.35));
  }
}
