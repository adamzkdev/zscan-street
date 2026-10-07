import * as THREE from "three";
import { BAY, CURB } from "./city/plan";
import type { Director } from "./director";
import { Nav } from "./nav";
import {
  bleachers,
  cellHouse,
  cellWing,
  FERRY,
  ferry,
  gatehouse,
  GATE,
  ground,
  hoop,
  HOUSE,
  LIGHT,
  lighthouse,
  pier,
  PIER,
  TANK,
  TOWER,
  WALL,
  wallModel,
  wardenRuin,
  watchTower,
  waterTower,
  WING,
  type CellKind,
} from "./prison-model";
import type { Snark } from "./snark";
import { toObject } from "./voxel/mesher";
import { half, VOX, type VoxelModel } from "./voxel/model";
import { tree } from "./voxel/props";

/**
 * The ZEC State Penitentiary, 透明刑務所 ("the transparent prison"), on its rock in the bay: the
 * long three-storey cell house, the cell wing on the recreation yard (a grille for a roof, so the
 * cells and their famous inmates can be seen from above), the yard's great steps, four guard
 * towers sweeping searchlights, the water tower, the lighthouse, the warden's burnt-out house, and
 * the sally port onto the ferry pier where the prison boat waits. The cells carry the plates of
 * crypto's most famous falls; one is kept for whoever annoys the police too much.
 */

/** The island (world metres) and the height of its flat top, where everything stands. */
export const PRISON = { ...BAY.rock, floor: CURB + 1.2 };

const F = PRISON.floor;
/** Models with a floor layer sit one voxel down, their floor flush with the island top. */
const BASE = F - VOX + 0.02;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const pick = <T>(a: readonly T[]) => a[Math.floor(Math.random() * a.length)];

/** The cells, west to east: plate, who is inside, what they keep saying. */
const CELLS: { kind: CellKind; plate: string; sub: string; who: string | null; lines: string[] }[] = [
  { kind: "sbf", plate: "S.B.F.", sub: "FTX · 25 YEARS", who: "Inmate · FTX", lines: ["It was a margin thing.", "I'll make everyone whole!", "Effective altruism...", "Anyone up for League?"] },
  { kind: "cz", plate: "C.Z.", sub: "4 MONTHS · RELEASED", who: null, lines: [] },
  { kind: "dok", plate: "DO K.", sub: "TERRA / LUNA", who: "Inmate · LUNA", lines: ["Algorithmic. Stable. Trust me.", "Steady lads, deploying more capital.", "I don't debate the poor."] },
  { kind: "bcc", plate: "BITCONNECT", sub: "PONZI · 2018", who: "Inmate · BitConnect", lines: ["BITCONNEEEEECT!", "Hey hey heeey!", "Lending program, guaranteed!"] },
  { kind: "gox", plate: "MT. GOX", sub: "850,000 BTC", who: "Inmate · Mt. Gox", lines: ["Where did the coins go?", "Transaction malleability!", "Have you tried turning it off?"] },
  { kind: "you", plate: "YOUR CELL", sub: "DISTURBING TRAFFIC", who: null, lines: [] },
];

// ---- layout (world metres) ----------------------------------------------------------------------

/** The cell house body, its portico east of it. */
const HOUSE_X0 = -145.5,
  HOUSE_Z0 = 181;
const HOUSE_X1 = HOUSE_X0 + HOUSE.w * VOX,
  HOUSE_Z1 = HOUSE_Z0 + HOUSE.d * VOX;
const PORTICO = { x0: HOUSE_X1, x1: HOUSE_X1 + HOUSE.portico * VOX, z0: HOUSE_Z0 + 8 * VOX, z1: HOUSE_Z1 - 8 * VOX };
/** The cell wing: west wall of the first cell, cell pitch, the bars, the plates. */
const WING_X0 = -142;
const CELL_W = WING.cell * VOX;
const WING_Z0 = HOUSE_Z1;
const BARS_Z = WING_Z0 + WING.bars * VOX;
const FRONT_Z = WING_Z0 + WING.depth * VOX;
const cellX = (i: number) => WING_X0 + i * CELL_W;
/** Middle of a cell's free floor. */
const cellMid = (i: number) => cellX(i) + 2 * VOX + (WING.cell - 2) * VOX * 0.5;
/** The yard: inside the walls west of the inner wall, south of the cells. */
const YARD = { x0: -149, x1: -111, z0: WING_Z0, z1: 207 };
const COURT = { x0: -134, x1: -120, z0: 197, z1: 204 };
const BLEACH = { x0: -149, x1: -142, z0: 190.5, z1: 203.3 };
const TOWERS: [number, number][] = [
  [-147.8, 180.2],
  [-147.8, 205.8],
  [-94.2, 180.2],
  [-94.2, 205.8],
];
const WATER_TOWER = { x: -96, z: 188.5 };
const LIGHTHOUSE = { x: -102.5, z: 201.5 };
const RUIN = { x0: -110.5, z0: 185 };
const GATE_X0 = -110 - VOX;
const GATE_Z0 = 178 - 2 * VOX;
const GATE_MID = GATE_X0 + ((GATE.passage[0] + GATE.passage[1]) / 2) * VOX;
const PIER_X0 = GATE_MID - (PIER.w / 2) * VOX;
const PIER_Z0 = 178 - PIER.d * VOX;
const FERRY_X0 = PIER_X0 + PIER.w * VOX + 0.05;
const FERRY_Z0 = 163;

function plateTexture(title: string, sub: string) {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 160;
  const g = c.getContext("2d")!;
  g.fillStyle = "#1a1a20";
  g.fillRect(0, 0, 512, 160);
  g.strokeStyle = "#f4b728";
  g.lineWidth = 6;
  g.strokeRect(6, 6, 500, 148);
  g.fillStyle = "#f2f2f6";
  g.font = '900 58px "JetBrains Mono", Menlo, monospace';
  g.textAlign = "center";
  g.fillText(title, 256, 78);
  g.fillStyle = "#f4b728";
  g.font = '700 30px "JetBrains Mono", Menlo, monospace';
  g.fillText(sub, 256, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** The painted sign over the sally port: black stencil on the whitewash, red brush underneath. */
function gateSignTexture() {
  const c = document.createElement("canvas");
  c.width = 2048;
  c.height = 496;
  const g = c.getContext("2d")!;
  g.fillStyle = "#e6e0d2";
  g.fillRect(0, 0, c.width, c.height);
  // weathering: blotches and drips
  for (let i = 0; i < 260; i++) {
    g.fillStyle = `rgba(120,110,95,${Math.random() * 0.08})`;
    g.fillRect(Math.random() * c.width, Math.random() * c.height, 8 + Math.random() * 80, 4 + Math.random() * 30);
  }
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillStyle = "#18161a";
  g.font = '900 150px "JetBrains Mono", Menlo, monospace';
  g.fillText("ZEC STATE PENITENTIARY", c.width / 2, 150, c.width - 120);
  g.fillStyle = "#b8281e";
  g.font = '900 150px "Hiragino Sans", "Noto Sans JP", sans-serif';
  g.fillText("透明刑務所", c.width / 2, 360, c.width - 200);
  g.fillStyle = "rgba(184,40,30,0.85)";
  for (let i = 0; i < 9; i++) g.fillRect(c.width / 2 - 360 + Math.random() * 720, 430, 5, 10 + Math.random() * 50);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** The warning painted on the outside of the walls. */
function warningTexture() {
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 284;
  const g = c.getContext("2d")!;
  g.fillStyle = "#e6e0d2";
  g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = "#b8281e";
  g.lineWidth = 10;
  g.strokeRect(14, 14, c.width - 28, c.height - 28);
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillStyle = "#b8281e";
  g.font = '900 64px "JetBrains Mono", Menlo, monospace';
  g.fillText("WARNING · 立入禁止", c.width / 2, 72, c.width - 80);
  g.fillStyle = "#18161a";
  g.font = '700 30px "JetBrains Mono", Menlo, monospace';
  g.fillText("PERSONS PROCURING OR CONCEALING THE ESCAPE", c.width / 2, 140, c.width - 80);
  g.fillText("OF PRISONERS ARE SUBJECT TO PROSECUTION", c.width / 2, 180, c.width - 80);
  g.fillText("BOATS KEEP OFF 200 YARDS", c.width / 2, 228, c.width - 80);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Red brush graffiti on the water tower, as on the real rock. */
function graffitiTexture() {
  const c = document.createElement("canvas");
  c.width = 1536;
  c.height = 384;
  const g = c.getContext("2d")!;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillStyle = "rgba(176,36,28,0.92)";
  g.font = 'italic 900 120px "Arial Black", Impact, sans-serif';
  g.fillText("PRIVACY IS NORMAL", c.width / 2, 120, c.width - 80);
  g.font = '900 96px "Hiragino Sans", "Noto Sans JP", sans-serif';
  g.fillText("透明刑務所 · ZEC", c.width / 2, 270, c.width - 300);
  for (let i = 0; i < 14; i++) g.fillRect(200 + Math.random() * 1100, 170 + Math.random() * 10, 6, 20 + Math.random() * 60);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function noteTexture(text: string) {
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 256;
  const g = c.getContext("2d")!;
  g.fillStyle = "#f4b728";
  g.font = '900 120px "JetBrains Mono", monospace';
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, 512, 128, 980);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A soft round pool of light for the ground at night. */
function poolTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, "rgba(255,248,225,1)");
  r.addColorStop(0.5, "rgba(255,240,205,0.45)");
  r.addColorStop(1, "rgba(255,240,205,0)");
  g.fillStyle = r;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

export class Prison {
  readonly group = new THREE.Group();
  /** Where an arrested walker stands inside their cell, and where they come out (the city quay, there is no bridge). */
  readonly cell = new THREE.Vector3();
  readonly release = new THREE.Vector3(-121, CURB, 142);
  /** The island's own obstacles (the bay is one big obstacle in the city's nav). */
  readonly nav = new Nav();
  /** The guard on the yard (released walkers get a word), and the one on the pier. */
  guard: Snark | null = null;
  gateGuard: Snark | null = null;
  private lights: THREE.Mesh[] = [];
  private beams: THREE.Object3D | null = null;
  private nightOnly: THREE.Object3D[] = [];
  private night: boolean | null = null;
  private boat: THREE.Object3D | null = null;
  private clock = 0;
  private jobs: (() => void)[] = [];

  constructor(
    scene: THREE.Object3D,
    _cityNav: Nav,
    private director: Director,
  ) {
    scene.add(this.group);
    this.build();
    void this.mesh();
    void this.people();
  }

  private lods: { near: THREE.Group; far: THREE.Group }[] = [];
  private farNow = false;
  /** Far from where the camera looks, the island swaps to its half-resolution copy. */
  lod(focus: THREE.Vector3, mid: number) {
    const P = PRISON;
    const far = Math.hypot(focus.x - (P.x0 + P.x1) / 2, focus.z - (P.z0 + P.z1) / 2) > mid + 30;
    if (far === this.farNow) return;
    this.farNow = far;
    for (const l of this.lods) (l.near.visible = !far), (l.far.visible = far);
  }

  /** Mesh the voxel parts one per task. */
  private async mesh() {
    for (const job of this.jobs) {
      await sleep(0);
      job();
    }
    this.jobs = [];
  }

  /** Floor height on the island (the rock's top and the pier), null elsewhere. */
  groundAt(x: number, z: number): number | null {
    const P = PRISON;
    if (x > P.x0 && x < P.x1 && z > P.z0 && z < P.z1) return F;
    if (x > PIER_X0 && x < PIER_X0 + PIER.w * VOX && z > PIER_Z0 && z <= P.z0) return F;
    return null;
  }

  /** Is this spot on the island free for a body of radius `rad`? */
  free(x: number, z: number, rad: number) {
    return this.nav.free(x, z, rad);
  }

  /** A voxel model into the group: (x0, z0) is its north-west corner, unless `center` is given. */
  private put(m: VoxelModel, x: number, y: number, z: number, o: { rot?: number; center?: boolean; shadows?: boolean } = {}) {
    // placed now, meshed a part at a time (see mesh()), so building the island never stalls a frame for long
    const obj = new THREE.Group();
    const near = new THREE.Group(),
      far = new THREE.Group();
    far.visible = false;
    obj.add(near, far);
    this.lods.push({ near, far });
    this.jobs.push(() => {
      near.add(...toObject(m, { shadows: o.shadows, own: true }).children);
      // and its copy for afar, half the voxels (meshed at double size)
      for (const c of toObject(half(m), { shadows: false, own: true }).children) {
        (c as THREE.Mesh).geometry.scale(2, 2, 2);
        far.add(c);
      }
    });
    const rot = o.rot ?? 0;
    obj.rotation.y = rot;
    if (o.center) obj.position.set(x, y, z);
    else {
      const swap = Math.abs(Math.sin(rot)) > 0.5;
      obj.position.set(x + ((swap ? m.d : m.w) * VOX) / 2, y, z + ((swap ? m.w : m.d) * VOX) / 2);
    }
    this.group.add(obj);
    return obj;
  }

  private block(x0: number, z0: number, x1: number, z1: number) {
    this.nav.addRect(x0, z0, x1, z1);
  }

  private build() {
    const P = PRISON;
    // ---- the island top: yard, court, paths, gardens, gravel ----
    const GW = Math.round((P.x1 - P.x0) / VOX),
      GD = Math.round((P.z1 - P.z0) / VOX);
    const inR = (x: number, z: number, r: { x0: number; x1: number; z0: number; z1: number }) => x >= r.x0 && x < r.x1 && z >= r.z0 && z < r.z1;
    const cc = { x: (COURT.x0 + COURT.x1) / 2, z: (COURT.z0 + COURT.z1) / 2 };
    const zone = (vx: number, vz: number) => {
      const x = P.x0 + (vx + 0.5) * VOX,
        z = P.z0 + (vz + 0.5) * VOX;
      if (inR(x, z, COURT)) {
        const edge = x < COURT.x0 + VOX || x > COURT.x1 - VOX || z < COURT.z0 + VOX || z > COURT.z1 - VOX;
        const mid = Math.abs(x - cc.x) < VOX / 2;
        const ring = Math.abs(Math.hypot(x - cc.x, z - cc.z) - 1.8) < VOX / 2;
        const key = (x < COURT.x0 + 4.2 || x > COURT.x1 - 4.2) && Math.abs(z - cc.z) < 1.8;
        const keyEdge = key && (Math.abs(Math.abs(z - cc.z) - 1.8) < VOX || Math.abs(x - (COURT.x0 + 4.2)) < VOX / 2 || Math.abs(x - (COURT.x1 - 4.2)) < VOX / 2);
        return edge || mid || ring || keyEdge ? "line" : "court";
      }
      if (inR(x, z, YARD)) return "yard";
      // the gate path, and the walk west to the cell house door
      if (inR(x, z, { x0: GATE_MID - 1.6, x1: GATE_MID + 1.6, z0: 178, z1: 185.8 })) return "path";
      if (inR(x, z, { x0: PORTICO.x1, x1: GATE_MID + 1.6, z0: 184.4, z1: 186.6 })) return "path";
      if (Math.hypot(x - LIGHTHOUSE.x, z - LIGHTHOUSE.z) < 3.6) return "path";
      if (inR(x, z, { x0: LIGHTHOUSE.x - 0.8, x1: LIGHTHOUSE.x + 0.8, z0: 194, z1: LIGHTHOUSE.z })) return "path";
      if (inR(x, z, { x0: -149, x1: -110, z0: 179, z1: 181 }) || inR(x, z, { x0: -149, x1: HOUSE_X0, z0: 179, z1: 190 })) return "road";
      if (inR(x, z, { x0: -110.2, x1: -93, z0: 194.4, z1: 207 })) return "garden";
      if (inR(x, z, { x0: -99.6, x1: -93, z0: 183, z1: 194.4 })) return "garden";
      return "gravel";
    };
    this.put(ground(GW, GD, zone), P.x0, BASE, P.z0, { shadows: false });

    // ---- the cell house and its wing of cells ----
    const houseX = (x: number) => Math.round((x - (HOUSE_X0 - HOUSE.margin * VOX)) / VOX);
    this.put(cellHouse([houseX(WING_X0), houseX(cellX(CELLS.length) + 2 * VOX)]), HOUSE_X0 - HOUSE.margin * VOX, F, HOUSE_Z0 - HOUSE.margin * VOX);
    this.block(HOUSE_X0, HOUSE_Z0, HOUSE_X1, HOUSE_Z1);
    this.block(PORTICO.x0, PORTICO.z0, PORTICO.x1, PORTICO.z1);
    this.put(cellWing(CELLS.map((c) => c.kind)), WING_X0 - WING.margin * VOX, BASE, WING_Z0);
    const plateGeo = new THREE.PlaneGeometry(2.56, 0.8);
    CELLS.forEach((cell, i) => {
      const x0 = cellX(i);
      const mid = cellMid(i);
      // side walls, the bars, the bunk, the toilet and table
      this.block(x0, WING_Z0, x0 + 2 * VOX, FRONT_Z);
      const fx = x0 + 2 * VOX;
      const ux = x0 + CELL_W;
      this.block(fx + VOX, WING_Z0, fx + 14 * VOX, WING_Z0 + 7 * VOX);
      this.block(ux - 5 * VOX, WING_Z0, ux - 2 * VOX, WING_Z0 + 4 * VOX);
      this.block(ux - 7 * VOX, WING_Z0 + 12 * VOX, ux - VOX, WING_Z0 + 18 * VOX);
      const plate = new THREE.Mesh(plateGeo, new THREE.MeshBasicMaterial({ map: plateTexture(cell.plate, cell.sub), toneMapped: false }));
      plate.position.set(mid, BASE + ((WING.lintel + WING.top) / 2) * VOX, FRONT_Z + 0.02);
      this.group.add(plate);
      if (cell.kind === "cz") {
        // an empty cell, a message on the wall
        const note = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.6), new THREE.MeshBasicMaterial({ map: noteTexture("FUNDS ARE SAFU"), transparent: true, toneMapped: false }));
        note.position.set(mid, F + 2.95, WING_Z0 + 0.03);
        this.group.add(note);
      }
      if (cell.kind === "you") this.cell.set(mid, F, BARS_Z - 2.1);
    });
    this.block(cellX(CELLS.length), WING_Z0, cellX(CELLS.length) + 2 * VOX, FRONT_Z);
    this.block(WING_X0, BARS_Z - 0.08, cellX(CELLS.length) + 2 * VOX, BARS_Z + 0.25);

    // ---- walls: the perimeter, the yard's inner wall, the little barred gate at the yard's west end ----
    const WD = WALL.back + WALL.thick + 8;
    const len = (a: number, b: number) => Math.round((b - a) / VOX);
    const gateU: [number, number] = [len(P.x0, -110), len(P.x0, -100)];
    // north: inside face on z = 179, a gap for the gatehouse
    this.put(wallModel(len(P.x0, P.x1), { lights: 60, gaps: [gateU], seed: 41 }), P.x0, F, 179 - (WALL.back + WALL.thick) * VOX);
    // south: inside face on z = 207, the guards' catwalk over the yard
    this.put(wallModel(len(P.x0, P.x1), { catwalk: true, lights: 54, seed: 42 }), (P.x0 + P.x1) / 2, F, 207 - (WD / 2 - (WALL.back + WALL.thick)) * VOX, { rot: Math.PI, center: true });
    // west and east
    this.put(wallModel(len(P.z0, P.z1), { lights: 48, seed: 43 }), P.x0 + 1 - (WALL.back + WALL.thick) * VOX + (WD * VOX) / 2, F, (P.z0 + P.z1) / 2, { rot: Math.PI / 2, center: true });
    this.put(wallModel(len(P.z0, P.z1), { lights: 48, seed: 44 }), P.x1 - 1 + (WALL.back + WALL.thick) * VOX - (WD * VOX) / 2, F, (P.z0 + P.z1) / 2, { rot: -Math.PI / 2, center: true });
    // the yard's east wall, catwalk on the yard side
    this.put(wallModel(len(189, 207), { catwalk: true, lights: 40, seed: 45 }), -111 + (WALL.back + WALL.thick) * VOX - (WD * VOX) / 2, F, 198, { rot: -Math.PI / 2, center: true });
    // the yard's west gate, between the west wall and the cell house
    this.put(wallModel(len(P.x0 + 1, HOUSE_X0), { gate: [4, 18], seed: 46 }), P.x0 + 1, F, 190 - (WALL.back + WALL.thick) * VOX);
    this.block(P.x0, P.z0, -110, 179);
    this.block(-100, P.z0, P.x1, 179);
    this.block(P.x0, 207, P.x1, P.z1);
    this.block(P.x0, P.z0, P.x0 + 1, P.z1);
    this.block(P.x1 - 1, P.z0, P.x1, P.z1);
    this.block(-111, 189, -111 + WALL.thick * VOX, 207);
    this.block(P.x0 + 1, 190 - WALL.thick * VOX, HOUSE_X0, 190);
    // barbed wire: coils along the tops
    const coil = new THREE.TorusGeometry(0.26, 0.022, 4, 10);
    const wire: THREE.BufferGeometry[] = [];
    const along = (ax: number, az: number, bx: number, bz: number) => {
      const n = Math.floor(Math.hypot(bx - ax, bz - az) / 0.42);
      for (let k = 0; k < n; k++) {
        const c = coil.clone();
        if (Math.abs(bx - ax) > Math.abs(bz - az)) c.rotateY(Math.PI / 2);
        wire.push(c.translate(ax + ((bx - ax) * k) / n, F + (WALL.h + 4.6) * VOX, az + ((bz - az) * k) / n));
      }
    };
    const t = WALL.thick * VOX;
    along(P.x0, 179 - t / 2, -110, 179 - t / 2);
    along(-100, 179 - t / 2, P.x1, 179 - t / 2);
    along(P.x0, 207 + t / 2, P.x1, 207 + t / 2);
    along(P.x0 + 1 - t / 2, P.z0, P.x0 + 1 - t / 2, P.z1);
    along(P.x1 - 1 + t / 2, P.z0, P.x1 - 1 + t / 2, P.z1);
    along(-111 + t / 2, 189, -111 + t / 2, 207);
    const wireMesh = new THREE.Mesh(
      (() => {
        const g = new THREE.BufferGeometry();
        const parts = wire.map((w) => w.toNonIndexed());
        const n = parts.reduce((s, p) => s + p.attributes.position.count, 0);
        const pos = new Float32Array(n * 3),
          nor = new Float32Array(n * 3);
        let o = 0;
        for (const p of parts) {
          pos.set(p.attributes.position.array as Float32Array, o * 3);
          nor.set(p.attributes.normal.array as Float32Array, o * 3);
          o += p.attributes.position.count;
        }
        g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
        g.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
        return g;
      })(),
      new THREE.MeshStandardMaterial({ color: "#6a6872", metalness: 0.8, roughness: 0.35 }),
    );
    this.group.add(wireMesh);

    // painted warnings on the outside of the walls, for anyone rowing too close
    const wt = warningTexture();
    const warn = new THREE.MeshStandardMaterial({ map: wt, roughness: 0.9, emissive: "#ffffff", emissiveMap: wt, emissiveIntensity: 0.18 });
    const warnGeo = new THREE.PlaneGeometry(7.2, 2.0);
    for (const [x, z, ry] of [
      [-129, 207 + t + 0.03, 0],
      [-101, 207 + t + 0.03, 0],
      [P.x1 - 1 + t + 0.03, 196, Math.PI / 2],
    ] as const) {
      const s = new THREE.Mesh(warnGeo, warn);
      s.position.set(x, F + 2.3, z);
      s.rotation.y = ry;
      this.group.add(s);
    }

    // ---- the sally port, the pier, the ferry ----
    this.put(gatehouse(), GATE_X0, F, GATE_Z0);
    const gx0 = GATE_X0 + VOX,
      gx1 = GATE_X0 + (GATE.w + 1) * VOX;
    const pass0 = GATE_X0 + GATE.passage[0] * VOX,
      pass1 = GATE_X0 + GATE.passage[1] * VOX;
    const gz0 = GATE_Z0 + VOX,
      gz1 = GATE_Z0 + (GATE.d + 1) * VOX;
    this.block(gx0, gz0, pass0, gz1);
    this.block(pass1, gz0, gx1, gz1);
    const barsZ = GATE_Z0 + (1 + GATE.d / 2) * VOX;
    this.block(pass0, barsZ - 0.1, pass1, barsZ + 0.25);
    const sign = gateSignTexture();
    const signY = F + ((GATE.sign[0] + GATE.sign[1] + 1) / 2) * VOX;
    for (const side of [-1, 1]) {
      const s = new THREE.Mesh(
        new THREE.PlaneGeometry((GATE.w - 8) * VOX, (GATE.sign[1] - GATE.sign[0] + 1) * VOX),
        new THREE.MeshStandardMaterial({ map: sign, roughness: 0.9, emissive: "#ffffff", emissiveMap: sign, emissiveIntensity: 0.22 }),
      );
      s.position.set(GATE_X0 + ((GATE.w + 2) / 2) * VOX, signY, side < 0 ? GATE_Z0 - 0.02 : GATE_Z0 + (GATE.d + 2) * VOX + 0.02);
      if (side < 0) s.rotation.y = Math.PI;
      this.group.add(s);
    }
    this.put(pier(), PIER_X0, F - PIER.deck * VOX, PIER_Z0);
    this.boat = this.put(ferry(), FERRY_X0, BAY.water - FERRY.water * VOX, FERRY_Z0);

    // ---- towers, the water tower, the lighthouse, the ruin, the yard's steps and hoops ----
    const beam = new THREE.ConeGeometry(4.5, 16, 20, 1, true);
    beam.translate(0, -8, 0);
    beam.rotateX(Math.PI);
    const beamMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.5, 1.1), transparent: true, opacity: 0.05, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.FrontSide, toneMapped: false });
    TOWERS.forEach(([x, z], i) => {
      this.put(watchTower(), x, F, z, { center: true });
      this.block(x - 1.6, z - 1.6, x + 1.6, z + 1.6);
      const light = new THREE.Mesh(beam, beamMat);
      light.position.set(x, F + (TOWER.lens - 1) * VOX, z);
      light.rotation.z = 0.8;
      light.userData.phase = i * 1.7;
      this.lights.push(light);
      this.group.add(light);
      this.nightOnly.push(light);
    });
    this.put(waterTower(), WATER_TOWER.x, F, WATER_TOWER.z, { center: true });
    for (const dx of [-1, 1]) for (const dz of [-1, 1]) this.block(WATER_TOWER.x + dx * 2.3 - 0.3, WATER_TOWER.z + dz * 2.3 - 0.3, WATER_TOWER.x + dx * 2.3 + 0.3, WATER_TOWER.z + dz * 2.3 + 0.3);
    const tankR = TANK.r * VOX + 0.04;
    const az = THREE.MathUtils.degToRad(34);
    const graffiti = new THREE.Mesh(
      new THREE.CylinderGeometry(tankR, tankR, 2.6, 32, 1, true, az - 1.0, 2.0),
      new THREE.MeshStandardMaterial({ map: graffitiTexture(), transparent: true, roughness: 0.9, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
    );
    graffiti.position.set(WATER_TOWER.x, F + (TANK.y0 + TANK.h / 2) * VOX, WATER_TOWER.z);
    this.group.add(graffiti);
    this.put(lighthouse(), LIGHTHOUSE.x, F, LIGHTHOUSE.z, { center: true });
    this.block(LIGHTHOUSE.x - 2, LIGHTHOUSE.z - 2, LIGHTHOUSE.x + 2, LIGHTHOUSE.z + 2);
    // the lighthouse's two beams, turning
    const lbeam = new THREE.ConeGeometry(3.2, 46, 16, 1, true);
    lbeam.translate(0, -23, 0);
    lbeam.rotateZ(Math.PI / 2);
    const lmat = beamMat.clone();
    lmat.opacity = 0.06;
    const beams = new THREE.Group();
    beams.position.set(LIGHTHOUSE.x, F + LIGHT.lamp * VOX, LIGHTHOUSE.z);
    for (const r of [0, Math.PI]) {
      const b = new THREE.Mesh(lbeam, lmat);
      b.rotation.y = r;
      beams.add(b);
    }
    this.group.add(beams);
    this.beams = beams;
    this.nightOnly.push(beams);
    const ruin = wardenRuin();
    this.put(ruin, RUIN.x0, F, RUIN.z0);
    this.block(RUIN.x0 + 2 * VOX, RUIN.z0 + 2 * VOX, RUIN.x0 + (ruin.w - 2) * VOX, RUIN.z0 + (ruin.d - 4) * VOX);
    this.put(bleachers(len(BLEACH.x0, BLEACH.x1), len(BLEACH.z0, BLEACH.z1)), BLEACH.x0, F, BLEACH.z0);
    this.block(BLEACH.x0, BLEACH.z0, BLEACH.x1, BLEACH.z1);
    const hm = hoop();
    for (const [x, rot] of [
      [COURT.x0 - 0.2, 0],
      [COURT.x1 + 0.2, Math.PI],
    ] as const) {
      this.put(hm, x, F, (COURT.z0 + COURT.z1) / 2, { rot, center: true });
      this.block(x - 0.4, (COURT.z0 + COURT.z1) / 2 - 0.4, x + 0.4, (COURT.z0 + COURT.z1) / 2 + 0.4);
    }
    // a few trees in the gardens
    for (const [x, z, kind, seed] of [
      [-96.5, 197, "round", 7],
      [-108.2, 203.5, "tall", 9],
      [-95.8, 203.2, "bush", 4],
      [-107.5, 197.2, "bush", 5],
    ] as const) {
      const t = tree(kind, seed);
      this.put(t.model, x, F, z, { center: true });
      this.nav.addCircle(x, z, t.radius);
    }

    // ---- night: pools of floodlight on the yard and the paths ----
    const pool = new THREE.MeshBasicMaterial({ map: poolTexture(), color: new THREE.Color(0.55, 0.52, 0.45), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -4 });
    for (const [x, z, r] of [
      [-139, 199, 5],
      [-127, 199.5, 6],
      [-116, 198.5, 5],
      [-127, 205, 4],
      [GATE_MID, 184, 4],
      [-104, 196, 4.5],
      [GATE_MID, 170, 3.5],
      [GATE_MID, 163, 3],
    ] as const) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 2), pool);
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, F + 0.05, z);
      this.group.add(m);
      this.nightOnly.push(m);
    }
  }

  /** The inmates in their cells, a guard on the yard, one at the pier. */
  private async people() {
    let seq = 3100;
    for (const [i, cell] of CELLS.entries()) {
      if (!cell.who) continue;
      const s = await this.director.newSnark((seq += 523));
      this.director.adopt(s);
      s.role = cell.who;
      s.root.position.set(cellMid(i) - 0.85, F, BARS_Z - 0.75);
      s.faceDir = new THREE.Vector3(0, 0, 1);
      void (async () => {
        await sleep(2000 + Math.random() * 8000);
        while (this.director.snarks.has(s)) {
          s.say(pick(cell.lines), 3.4);
          await sleep(9000 + Math.random() * 12000);
        }
      })();
    }
    const g = await this.director.newSnark(4242);
    this.director.adopt(g);
    g.role = "Prison guard";
    g.setCap();
    g.root.position.set(cellMid(CELLS.length - 1) + 1.6, F, FRONT_Z + 2.4);
    g.faceDir = new THREE.Vector3(0, 0, -1);
    this.guard = g;
    const gg = await this.director.newSnark(4243);
    this.director.adopt(gg);
    gg.role = "Prison guard · ferry";
    gg.setCap();
    gg.root.position.set(GATE_MID + 0.4, F, PIER_Z0 + 5);
    gg.faceDir = new THREE.Vector3(0, 0, -1);
    this.gateGuard = gg;
  }

  update(dt: number) {
    this.clock += dt;
    const night = document.documentElement.dataset.theme !== "day";
    if (night !== this.night) {
      this.night = night;
      for (const o of this.nightOnly) o.visible = night;
    }
    for (const l of this.lights) l.rotation.y = this.clock * 0.35 + l.userData.phase;
    if (this.beams) this.beams.rotation.y = this.clock * 0.6;
    if (this.boat) {
      this.boat.position.y = BAY.water - FERRY.water * VOX + Math.sin(this.clock * 0.9) * 0.05;
      this.boat.rotation.z = Math.sin(this.clock * 0.7 + 1) * 0.012;
    }
  }
}
