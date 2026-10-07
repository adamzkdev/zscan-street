import * as THREE from "three";
import { CITY, gridCells, streetSegments, zoneAt, type Cell } from "../scene/city/plan";
import { Market } from "../data/market";

/**
 * SimCity-style data views: every block wrapped in a tinted glass volume as tall as its tallest
 * building (the streets between them left open), coloured by what the view measures. Zones (what each block is
 * built for), Traffic (live cars on each street), Privacy (each quarter in the colour of its value
 * pool, as bright as the pool is full), Mempool (where the transactions are being carried).
 */

export type View = "off" | "zones" | "traffic" | "privacy" | "mempool";

const VIEWS: { key: View; name: string; jp: string }[] = [
  { key: "zones", name: "Zones", jp: "区域" },
  { key: "traffic", name: "Traffic", jp: "交通" },
  { key: "privacy", name: "Privacy", jp: "秘匿" },
  { key: "mempool", name: "Mempool", jp: "待合" },
];

const ZONE_COLOR: Record<string, [string, string]> = {
  residential: ["#5cff9a", "Residential"],
  commercial: ["#3ef0ff", "Shops"],
  offices: ["#3a7bff", "Offices"],
  industry: ["#f4b728", "Industry"],
  civic: ["#b07bff", "Landmarks"],
  park: ["#2f9a4a", "Parks"],
  heart: ["#ff9f2e", "Downtown"],
};
const POOLS = [
  ["sapling", "Sapling", "#3987e5"],
  ["orchard", "Orchard", "#eb6834"],
  ["ironwood", "Ironwood", "#1baf7a"],
  ["transparent", "Transparent", "#eda100"],
] as const;

function zoneOf(c: Cell): keyof typeof ZONE_COLOR {
  if (c.kind === "core") return "heart";
  if (c.kind === "park" || c.kind === "edge" || c.lot === "green" || c.lot === "gardens") return "park";
  if (c.kind === "lot") return c.lot === "port" ? "industry" : "civic";
  const z = zoneAt((c.x0 + c.x1) / 2, (c.z0 + c.z1) / 2);
  return z === "port" ? "industry" : z === "midtown" || z === "finance" ? "offices" : z === "west" || z === "eastcom" ? "commercial" : "residential";
}

/** The pool a quarter of the city stands for: Orchard west, Ironwood east, Transparent south, Sapling north. */
function poolOf(c: Cell) {
  const x = (c.x0 + c.x1) / 2,
    z = (c.z0 + c.z1) / 2 + 20;
  return Math.abs(x) > Math.abs(z) ? (x < 0 ? "orchard" : "ironwood") : z > 0 ? "transparent" : "sapling";
}

export interface OverlayData {
  /** Cars on the city's streets (and the avenue's). */
  cars(): Iterable<THREE.Vector3>;
  /** Transaction carriers on foot, and how many transactions each one holds. */
  carriers(): Iterable<{ pos: THREE.Vector3; n: number }>;
  mempool(): number;
  /** Building footprints with their heights (the facades), to size each block's volume. */
  buildings: { x0: number; x1: number; z: number; height: number }[];
}

export class Overlays {
  readonly group = new THREE.Group();
  view: View = "off";
  private cells = gridCells();
  private segs = streetSegments();
  private tiles: THREE.InstancedMesh;
  private roads: THREE.InstancedMesh;
  private mat: THREE.MeshBasicMaterial;
  private roadMat: THREE.MeshBasicMaterial;
  private fade = 0;
  private acc = 0;
  private pop: HTMLElement;
  private legend: HTMLElement;
  private btn: HTMLButtonElement;

  constructor(
    scene: THREE.Object3D,
    root: HTMLElement,
    private data: OverlayData,
  ) {
    const plane = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const cube = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    this.mat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
    this.roadMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -4 });
    this.tiles = new THREE.InstancedMesh(cube, this.mat, this.cells.length);
    // each block as tall as what stands on it (a low slab for parks and empty lots)
    const tall = this.cells.map(() => 1.2);
    for (const b of data.buildings) {
      const i = this.cellAt((b.x0 + b.x1) / 2, b.z);
      if (i >= 0) tall[i] = Math.max(tall[i], b.height + 2);
    }
    this.roads = new THREE.InstancedMesh(plane, this.roadMat, this.segs.length + 1);
    const m = new THREE.Matrix4();
    this.cells.forEach((c, i) => {
      const inset = 0.8;
      m.compose(new THREE.Vector3((c.x0 + c.x1) / 2, 0.25, (c.z0 + c.z1) / 2), new THREE.Quaternion(), new THREE.Vector3(c.x1 - c.x0 - inset * 2, tall[i], c.z1 - c.z0 - inset * 2));
      this.tiles.setMatrixAt(i, m);
      this.tiles.setColorAt(i, new THREE.Color());
    });
    this.segs.forEach((s, i) => {
      const len = s.to - s.from,
        mid = (s.from + s.to) / 2;
      m.compose(s.axis === "x" ? new THREE.Vector3(mid, 0.06, s.at) : new THREE.Vector3(s.at, 0.06, mid), new THREE.Quaternion(), s.axis === "x" ? new THREE.Vector3(len, 1, s.width * 0.6) : new THREE.Vector3(s.width * 0.6, 1, len));
      this.roads.setMatrixAt(i, m);
      this.roads.setColorAt(i, new THREE.Color());
    });
    // the avenue
    const av = this.segs.length;
    m.compose(new THREE.Vector3(0, 0.06, (CITY.road.z0 + CITY.road.z1) / 2), new THREE.Quaternion(), new THREE.Vector3(CITY.maxX - CITY.minX, 1, 4.8));
    this.roads.setMatrixAt(av, m);
    this.roads.setColorAt(av, new THREE.Color());
    for (const o of [this.tiles, this.roads]) {
      o.frustumCulled = false;
      o.renderOrder = 5;
      this.group.add(o);
    }
    this.group.visible = false;
    scene.add(this.group);

    // the button on the camera rail, its menu, the legend
    const rail = root.querySelector(".rail")!;
    this.btn = document.createElement("button");
    this.btn.title = "Data views";
    this.btn.innerHTML = `<svg class="px" viewBox="0 0 12 12" shape-rendering="crispEdges"><path fill="currentColor" d="M1 1h4v4h-4zM7 1h4v4h-4zM1 7h4v4h-4z"/><path fill="currentColor" opacity=".45" d="M7 7h4v4h-4z"/></svg>`;
    const walk = rail.querySelector(".walk");
    rail.insertBefore(this.btn, walk);
    rail.insertBefore(document.createElement("i"), walk);
    this.pop = document.createElement("div");
    this.pop.className = "campop hud hidden dataviews";
    rail.appendChild(this.pop);
    this.btn.addEventListener("click", () => this.pop.classList.toggle("hidden"));
    this.pop.addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>("[data-view]");
      if (!b) return;
      this.set(b.dataset.view as View);
    });
    this.legend = document.createElement("div");
    this.legend.className = "dvlegend hud hidden";
    root.appendChild(this.legend);
    this.renderMenu();
    Market.subscribe(() => this.view === "privacy" && this.paint());
  }

  set(v: View) {
    this.view = this.view === v ? "off" : v;
    this.btn.classList.toggle("on", this.view !== "off");
    this.renderMenu();
    if (this.view !== "off") this.paint();
    this.legend.classList.toggle("hidden", this.view === "off");
  }

  private renderMenu() {
    this.pop.innerHTML = `<div class="mh">Data views · データ</div>${VIEWS.map((v) => `<button class="row ${this.view === v.key ? "on" : ""}" data-view="${v.key}"><span class="jp">${v.jp}</span><span>${v.name}</span></button>`).join("")}`;
  }

  /** Colour the tiles (and streets) for the current view, and write its legend. */
  private paint() {
    const col = new THREE.Color();
    const dim = new THREE.Color("#1a1824");
    const leg: string[] = [];
    const roadsOn = this.view === "traffic";
    if (this.view === "zones") {
      this.cells.forEach((c, i) => this.tiles.setColorAt(i, col.set(ZONE_COLOR[zoneOf(c)][0])));
      for (const [color, name] of Object.values(ZONE_COLOR)) leg.push(`<span><i style="background:${color}"></i>${name}</span>`);
    } else if (this.view === "privacy") {
      const p = Market.state.pools;
      const max = p ? Math.max(...POOLS.map(([k]) => p.pools[k])) : 1;
      this.cells.forEach((c, i) => {
        const k = poolOf(c);
        const share = p ? p.pools[k] / max : 0.5;
        this.tiles.setColorAt(i, col.set(POOLS.find((q) => q[0] === k)![2]).lerp(dim, 1 - (0.25 + 0.75 * share)));
      });
      const total = p ? Object.values(p.pools).reduce((a, b) => a + b, 0) : 0;
      for (const [k, n, c] of POOLS) leg.push(`<span><i style="background:${c}"></i>${n}<b>${p ? `${(p.pools[k] / 1e8 / 1e6).toFixed(2)}M · ${((p.pools[k] / total) * 100).toFixed(1)}%` : "—"}</b></span>`);
      if (p) leg.push(`<span class="sum">${Math.round(p.shielded_ratio * 100)}% shielded</span>`);
    } else if (this.view === "mempool") {
      const heat = new Map<number, number>();
      let carried = 0;
      for (const { pos, n } of this.data.carriers()) {
        const i = this.cellAt(pos.x, pos.z);
        if (i >= 0) heat.set(i, (heat.get(i) ?? 0) + n);
        carried += n;
      }
      const top = Math.max(1, ...heat.values());
      this.cells.forEach((_c, i) => this.tiles.setColorAt(i, col.set("#ff3e8a").lerp(dim, 1 - Math.min(1, (heat.get(i) ?? 0) / top) * 0.9 - 0.05)));
      leg.push(`<span><i style="background:#ff3e8a"></i>Being carried<b>${carried} tx</b></span>`, `<span><i style="background:#3a2a3a"></i>In the mempool<b>${this.data.mempool()} tx</b></span>`);
    } else if (roadsOn) {
      this.cells.forEach((_c, i) => this.tiles.setColorAt(i, col.set("#ffffff")));
      const count = new Array(this.segs.length + 1).fill(0);
      for (const p of this.data.cars()) {
        if (p.z > CITY.road.z0 - 1 && p.z < CITY.road.z1 + 1) {
          count[this.segs.length]++;
          continue;
        }
        const i = this.segs.findIndex((s) => (s.axis === "x" ? Math.abs(p.z - s.at) < s.width / 2 + 0.5 && p.x >= s.from && p.x <= s.to : Math.abs(p.x - s.at) < s.width / 2 + 0.5 && p.z >= s.from && p.z <= s.to));
        if (i >= 0) count[i]++;
      }
      const len = [...this.segs.map((s) => s.to - s.from), CITY.maxX - CITY.minX];
      count.forEach((n, i) => {
        // cars per 100 m: free-flowing green, busy amber, jammed red
        const d = (n / len[i]) * 100;
        this.roads.setColorAt(i, col.set(d === 0 ? "#2a3a32" : d < 2 ? "#38ff9c" : d < 4 ? "#ffd23e" : "#ff3e3e"));
      });
      this.roads.instanceColor!.needsUpdate = true;
      leg.push(`<span><i style="background:#38ff9c"></i>Free</span>`, `<span><i style="background:#ffd23e"></i>Busy</span>`, `<span><i style="background:#ff3e3e"></i>Jammed</span>`, `<span class="sum">${[...this.data.cars()].length} vehicles</span>`);
    }
    this.tiles.instanceColor!.needsUpdate = true;
    this.roads.visible = roadsOn;
    const v = VIEWS.find((q) => q.key === this.view);
    if (v) this.legend.innerHTML = `<div class="mh">${v.jp} · ${v.name}</div><div class="dvrows">${leg.join("")}</div>`;
  }

  private cellAt(x: number, z: number) {
    return this.cells.findIndex((c) => x >= c.x0 && x <= c.x1 && z >= c.z0 && z <= c.z1);
  }

  update(dt: number) {
    const on = this.view !== "off";
    this.fade = THREE.MathUtils.clamp(this.fade + (on ? dt : -dt) * 3, 0, 1);
    this.group.visible = this.fade > 0.01;
    if (!this.group.visible) return;
    this.mat.opacity = 0.42 * this.fade;
    this.roadMat.opacity = 0.9 * this.fade;
    // live views refresh twice a second
    this.acc += dt;
    if (on && this.acc > 0.5 && (this.view === "traffic" || this.view === "mempool")) {
      this.acc = 0;
      this.paint();
    }
  }
}
