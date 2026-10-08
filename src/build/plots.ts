import * as THREE from "three";
import { API, get } from "../data/zscan";
import { visitorToken } from "../data/token";
import { CURB } from "../scene/city";
import { plotSlots, type PlotSlot } from "../scene/city/plan";
import { VOX } from "../scene/voxel/model";
import { toObject } from "../scene/voxel/mesher";
import { decode, encode, toVoxel, type PlotModel } from "./model";
import type { Editor } from "./editor";

interface PlotRow {
  plot: number;
  name: string;
  model: { w: number; h: number; d: number; palette: PlotModel["palette"]; data: string };
  updated_at?: string;
}

export interface PlotHooks {
  /** A message for the game toast. */
  say(html: string): void;
  /** The city pauses while the workshop is open. */
  pause(on: boolean): void;
}

const MINE = "street.myplots";
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function mine(): number[] {
  try {
    return JSON.parse(localStorage.getItem(MINE) ?? "[]");
  } catch {
    return [];
  }
}
function setMine(list: number[]) {
  try {
    localStorage.setItem(MINE, JSON.stringify(list));
  } catch {}
}

/** A canvas sign over a free plot. */
function freeSign() {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 96;
  const g = c.getContext("2d")!;
  g.fillStyle = "rgba(11,9,19,0.86)";
  g.fillRect(0, 0, 256, 96);
  g.strokeStyle = "#f4b728";
  g.lineWidth = 4;
  g.strokeRect(4, 4, 248, 88);
  g.fillStyle = "#f4b728";
  g.font = "700 30px 'DotGothic16', monospace";
  g.textAlign = "center";
  g.fillText("空き地 FREE", 128, 44);
  g.font = "400 20px 'DotGothic16', monospace";
  g.fillStyle = "#ffffff";
  g.fillText("click to build", 128, 76);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * Builders' Row: sixteen plots where visitors put up their own building, made in the voxel
 * workshop and kept by the API for everyone to see. A free plot shows a sign; click it to build.
 * Your own plot (this browser built it) reopens in the workshop; someone else's shows its name.
 */
export class Plots {
  readonly group = new THREE.Group();
  private slots: PlotSlot[] = plotSlots();
  private built = new Map<number, { row: PlotRow; obj: THREE.Group }>();
  private free = new Map<number, THREE.Group>();
  private hitBoxes: THREE.Mesh[] = [];
  private panel: HTMLElement;
  private signTex = freeSign();

  constructor(
    scene: THREE.Scene,
    ui: HTMLElement,
    private editor: Editor,
    private hooks: PlotHooks,
  ) {
    scene.add(this.group);
    const boxMat = new THREE.MeshBasicMaterial({ visible: false });
    for (const s of this.slots) {
      const hb = new THREE.Mesh(new THREE.BoxGeometry(s.x1 - s.x0, 8, s.z1 - s.z0), boxMat);
      hb.position.set(s.cx, CURB + 4, (s.z0 + s.z1) / 2);
      hb.userData.plot = s.id;
      this.group.add(hb);
      this.hitBoxes.push(hb);
      this.markFree(s);
    }
    this.panel = document.createElement("div");
    this.panel.className = "plotpanel hud";
    ui.append(this.panel);
    this.panel.addEventListener("click", (e) => {
      const a = (e.target as HTMLElement).closest<HTMLElement>("[data-a]");
      if (!a) return;
      const id = Number(a.dataset.p);
      if (a.dataset.a === "close") this.panel.classList.remove("open");
      if (a.dataset.a === "build") void this.build(id);
      if (a.dataset.a === "report") void this.report(id);
    });
    void this.load();
  }

  async load() {
    const rows = await get<PlotRow[]>("/v1/street/plots");
    if (!rows) return;
    const seen = new Set<number>();
    for (const r of rows) {
      seen.add(r.plot);
      const have = this.built.get(r.plot);
      if (have && have.row.updated_at === r.updated_at && r.updated_at) continue;
      this.place(r);
    }
    for (const id of [...this.built.keys()]) if (!seen.has(id)) this.clear(id);
  }

  private markFree(s: PlotSlot) {
    if (this.free.has(s.id)) return;
    const g = new THREE.Group();
    // a low gold kerb round the plot and a sign on a post
    const w = s.x1 - s.x0,
      d = s.z1 - s.z0;
    const kerb = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(w - 0.2, 0.12, d - 0.2)), new THREE.LineBasicMaterial({ color: "#f4b728" }));
    kerb.position.set(s.cx, CURB + 0.08, (s.z0 + s.z1) / 2);
    const sign = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.signTex, toneMapped: false }));
    sign.scale.set(2.4, 0.9, 1);
    sign.position.set(s.cx, CURB + 1.6, s.face === "n" ? s.z0 + 0.6 : s.z1 - 0.6);
    g.add(kerb, sign);
    this.group.add(g);
    this.free.set(s.id, g);
  }

  private clear(id: number) {
    const b = this.built.get(id);
    if (b) {
      this.group.remove(b.obj);
      b.obj.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
      this.built.delete(id);
    }
    const s = this.slots[id];
    if (s) this.markFree(s);
  }

  private place(r: PlotRow) {
    const s = this.slots[r.plot];
    const m = s && decode(r.model);
    if (!s || !m) return;
    this.clear(r.plot);
    const f = this.free.get(r.plot);
    if (f) {
      this.group.remove(f);
      this.free.delete(r.plot);
    }
    const obj = toObject(toVoxel(m));
    // the model's front faces +z: turn it to face its street, its front on the plot's front edge
    const depth = m.d * VOX;
    obj.rotation.y = s.face === "n" ? Math.PI : 0;
    obj.position.set(s.cx, CURB, s.face === "n" ? s.front + depth / 2 : s.front - depth / 2);
    obj.userData.plot = r.plot;
    this.group.add(obj);
    this.built.set(r.plot, { row: r, obj });
  }

  /** A click in the city: true when it was on a plot. */
  click(ray: THREE.Raycaster) {
    const hit = ray.intersectObjects(this.hitBoxes, false)[0];
    if (!hit) return false;
    this.show(hit.object.userData.plot as number);
    return true;
  }

  private show(id: number) {
    const b = this.built.get(id);
    const own = mine().includes(id);
    this.panel.innerHTML = `<header><label>建築 · PLOT ${id + 1}</label><button data-a="close">×</button></header>
      ${
        b
          ? `<h3>${esc(b.row.name)}</h3><p>${own ? "Your building." : "Built by a visitor."}</p>
             ${own ? `<button class="go" data-a="build" data-p="${id}">Rebuild in the workshop</button>` : `<button data-a="report" data-p="${id}">Report</button>`}`
          : `<h3>Free plot</h3><p>32 × 32 voxels of ground, 48 high. Build anything; it stays in the city for everyone.</p>
             <button class="go" data-a="build" data-p="${id}">Build here</button>`
      }`;
    this.panel.classList.add("open");
  }

  private async build(id: number) {
    this.panel.classList.remove("open");
    const b = this.built.get(id);
    if (b && !mine().includes(id)) return;
    this.hooks.pause(true);
    const res = await this.editor.edit(b?.row.name ?? "", b ? decode(b.row.model) : null);
    this.hooks.pause(false);
    if (!res) return;
    const token = visitorToken();
    if (!token) return this.hooks.say("<b>CAN'T SAVE</b> · this browser blocks storage");
    const body = { plot: id, token, name: res.name, model: encode(res.model) };
    try {
      const r = await fetch(`${API}/v1/street/plots`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      if (r.status === 429) return this.hooks.say("<b>EASY</b> · one save a minute, try again shortly");
      if (r.status === 403) return this.hooks.say("<b>TAKEN</b> · someone else owns this plot now");
      if (!r.ok) throw new Error(String(r.status));
      setMine([...new Set([...mine(), id])]);
      this.place({ plot: id, name: res.name, model: body.model, updated_at: new Date().toISOString() });
      this.hooks.say(`<b>${esc(res.name)}</b> · built on plot ${id + 1}, everyone can see it`);
    } catch {
      // keep it in this browser's view anyway
      this.place({ plot: id, name: res.name, model: body.model });
      this.hooks.say("<b>NOT PUBLISHED</b> · the city's server didn't answer, your building is only on your screen");
    }
  }

  private async report(id: number) {
    this.panel.classList.remove("open");
    try {
      await fetch(`${API}/v1/street/plots/${id}/report`, { method: "POST" });
    } catch {}
    this.hooks.say("<b>REPORTED</b> · thanks, the city will take a look");
  }

  /** Somebody saved a plot (presence ping): fetch the row again. */
  changed() {
    void this.load();
  }
}
