import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { CITY, CURB, GRID } from "./city/plan";
import type { Director } from "./director";
import type { Nav } from "./nav";
import type { Snark } from "./snark";

/**
 * The ZEC State Penitentiary, 透明刑務所 ("the transparent prison"): on its own ground past the
 * city's north-west corner, at the end of the north street. A wall with barbed wire, four watch
 * towers sweeping searchlights, a cell block on a yard. The cells carry the plates of crypto's
 * most famous falls; one is kept for whoever annoys the police too much.
 */

export const PRISON = { x0: CITY.minX - 62, x1: CITY.minX, z0: -136, z1: -92 };
const WALL_H = 6;
const GATE_Z = GRID.zs[0];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const pick = <T>(a: readonly T[]) => a[Math.floor(Math.random() * a.length)];

/** The cells, west to east: plate, who is inside, what they keep saying. */
const CELLS: { plate: string; sub: string; who: string | null; lines: string[] }[] = [
  { plate: "S.B.F.", sub: "FTX · 25 YEARS", who: "Inmate · FTX", lines: ["It was a margin thing.", "I'll make everyone whole!", "Effective altruism...", "Anyone up for League?"] },
  { plate: "C.Z.", sub: "4 MONTHS · RELEASED", who: null, lines: [] },
  { plate: "DO K.", sub: "TERRA / LUNA", who: "Inmate · LUNA", lines: ["Algorithmic. Stable. Trust me.", "Steady lads, deploying more capital.", "I don't debate the poor."] },
  { plate: "BITCONNECT", sub: "PONZI · 2018", who: "Inmate · BitConnect", lines: ["BITCONNEEEEECT!", "Hey hey heeey!", "Lending program, guaranteed!"] },
  { plate: "MT. GOX", sub: "850,000 BTC", who: "Inmate · Mt. Gox", lines: ["Where did the coins go?", "Transaction malleability!", "Have you tried turning it off?"] },
  { plate: "YOUR CELL", sub: "DISTURBING TRAFFIC", who: null, lines: [] },
];

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

function signTexture(lines: [string, string, string][], w = 1024, h = 256) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  g.fillStyle = "#101014";
  g.fillRect(0, 0, w, h);
  g.textAlign = "center";
  lines.forEach(([text, color, font], i) => {
    g.fillStyle = color;
    g.font = font;
    g.fillText(text, w / 2, 90 + i * 90);
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Prison {
  readonly group = new THREE.Group();
  /** Where an arrested walker stands inside their cell, and where they come out. */
  readonly cell = new THREE.Vector3();
  readonly release = new THREE.Vector3();
  /** The guard at the gate, and the one on the block (released walkers get a word). */
  guard: Snark | null = null;
  private lights: THREE.Mesh[] = [];
  private clock = 0;

  constructor(
    scene: THREE.Object3D,
    private nav: Nav,
    private director: Director,
  ) {
    scene.add(this.group);
    this.build();
    void this.people();
  }

  private build() {
    const P = PRISON;
    const W = P.x1 - P.x0,
      D = P.z1 - P.z0;
    const cx = (P.x0 + P.x1) / 2,
      cz = (P.z0 + P.z1) / 2;
    const concrete = new THREE.MeshStandardMaterial({ color: "#8a8690", roughness: 0.9 });
    concrete.userData.dayColor = "#b8b4bc";
    const dark = new THREE.MeshStandardMaterial({ color: "#3a3842", roughness: 0.7 });
    const steel = new THREE.MeshStandardMaterial({ color: "#5a5a66", metalness: 0.7, roughness: 0.35 });
    const ground = new THREE.MeshStandardMaterial({ color: "#5c5866", roughness: 0.95 });
    const bins = new Map<THREE.Material, THREE.BufferGeometry[]>();
    const box = (m: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number, solid = true) => {
      const list = bins.get(m) ?? [];
      list.push(new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z));
      bins.set(m, list);
      if (solid && y < 1.5) this.nav.addRect(x - w / 2, z - d / 2, x + w / 2, z + d / 2);
    };
    // the ground it stands on, and the road in from the north street
    box(ground, W, CURB + 3.2, D, cx, -3.2, cz, false);
    box(new THREE.MeshStandardMaterial({ color: "#34333c", roughness: 0.5 }), 8, 0.02, GRID.street, P.x1 - 4, CURB, GATE_Z, false);
    // the wall, with the gate on the east side
    const t = 0.8;
    const inset = 1.2;
    const wx0 = P.x0 + inset,
      wx1 = P.x1 - inset,
      wz0 = P.z0 + inset,
      wz1 = P.z1 - inset;
    box(concrete, wx1 - wx0, WALL_H, t, (wx0 + wx1) / 2, CURB, wz0);
    box(concrete, wx1 - wx0, WALL_H, t, (wx0 + wx1) / 2, CURB, wz1);
    box(concrete, t, WALL_H, wz1 - wz0, wx0, CURB, (wz0 + wz1) / 2);
    const g0 = GATE_Z - 3.2,
      g1 = GATE_Z + 3.2;
    box(concrete, t, WALL_H, g0 - wz0, wx1, CURB, (wz0 + g0) / 2);
    box(concrete, t, WALL_H, wz1 - g1, wx1, CURB, (g1 + wz1) / 2);
    // gate bars (shut: you come and go by the police)
    for (let z = g0 + 0.3; z < g1; z += 0.45) box(steel, 0.08, 4.2, 0.08, wx1, CURB, z, false);
    this.nav.addRect(wx1 - 0.3, g0, wx1 + 0.3, g1);
    box(steel, 0.2, 0.2, g1 - g0, wx1, CURB + 4.2, GATE_Z, false);
    // barbed wire: coils along the top of the wall
    const coil = new THREE.TorusGeometry(0.28, 0.025, 4, 10);
    const wire: THREE.BufferGeometry[] = [];
    const along = (a: THREE.Vector3, b: THREE.Vector3) => {
      const n = Math.floor(a.distanceTo(b) / 0.5);
      for (let k = 0; k < n; k++) {
        const p = a.clone().lerp(b, k / n);
        const c = coil.clone();
        if (Math.abs(b.x - a.x) > Math.abs(b.z - a.z)) c.rotateY(Math.PI / 2);
        wire.push(c.translate(p.x, CURB + WALL_H + 0.25, p.z));
      }
    };
    along(new THREE.Vector3(wx0, 0, wz0), new THREE.Vector3(wx1, 0, wz0));
    along(new THREE.Vector3(wx0, 0, wz1), new THREE.Vector3(wx1, 0, wz1));
    along(new THREE.Vector3(wx0, 0, wz0), new THREE.Vector3(wx0, 0, wz1));
    along(new THREE.Vector3(wx1, 0, wz0), new THREE.Vector3(wx1, 0, g0));
    along(new THREE.Vector3(wx1, 0, g1), new THREE.Vector3(wx1, 0, wz1));
    bins.set(steel, [...(bins.get(steel) ?? []), ...wire.map((w) => w.toNonIndexed())]);
    // watch towers at the corners, a searchlight on each
    const beam = new THREE.ConeGeometry(4.5, 16, 20, 1, true);
    beam.translate(0, -8, 0);
    beam.rotateX(Math.PI);
    const beamMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.5, 1.1), transparent: true, opacity: 0.045, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.FrontSide, toneMapped: false });
    beamMat.userData.night = true;
    for (const [x, z] of [
      [wx0 + 1.5, wz0 + 1.5],
      [wx1 - 1.5, wz0 + 1.5],
      [wx0 + 1.5, wz1 - 1.5],
      [wx1 - 1.5, wz1 - 1.5],
    ]) {
      box(concrete, 1.4, 11, 1.4, x, CURB, z);
      box(dark, 3.4, 2.4, 3.4, x, CURB + 11, z, false);
      box(new THREE.MeshBasicMaterial({ color: new THREE.Color(1.8, 1.7, 1.2), toneMapped: false }), 3.5, 0.7, 3.5, x, CURB + 11.9, z, false);
      box(dark, 4, 0.3, 4, x, CURB + 13.4, z, false);
      const light = new THREE.Mesh(beam, beamMat);
      light.position.set(x, CURB + 12.4, z);
      light.rotation.z = 0.8;
      light.userData.phase = Math.random() * 6;
      this.lights.push(light);
      this.group.add(light);
    }
    // the cell block: a long building on the north side, six cells opening onto the yard
    const bx0 = wx0 + 6,
      bx1 = wx0 + 6 + 6 * 4.4,
      bz0 = wz0 + 2,
      bz1 = bz0 + 5.2;
    box(concrete, bx1 - bx0, 0.1, bz1 - bz0, (bx0 + bx1) / 2, CURB, (bz0 + bz1) / 2, false);
    box(concrete, bx1 - bx0 + 0.6, 3.6, 0.4, (bx0 + bx1) / 2, CURB, bz0);
    box(concrete, bx1 - bx0 + 0.6, 0.5, bz1 - bz0 + 1.2, (bx0 + bx1) / 2, CURB + 3.6, (bz0 + bz1) / 2 + 0.3, false);
    box(concrete, bx1 - bx0 + 0.4, 3.4, bz1 - bz0 - 1, (bx0 + bx1) / 2, CURB + 4.1, (bz0 + bz1) / 2 - 0.5, false);
    const plateGeo = new THREE.PlaneGeometry(2.6, 0.8);
    CELLS.forEach((cell, i) => {
      const x0 = bx0 + i * 4.4;
      // side walls, a bunk, a tiny window high on the back wall
      box(concrete, 0.3, 3.6, bz1 - bz0, x0, CURB, (bz0 + bz1) / 2);
      if (i === CELLS.length - 1) box(concrete, 0.3, 3.6, bz1 - bz0, x0 + 4.4, CURB, (bz0 + bz1) / 2);
      box(dark, 1.8, 0.5, 0.9, x0 + 1.4, CURB, bz0 + 0.7, false);
      box(new THREE.MeshStandardMaterial({ color: "#d8d4cc" }), 1.8, 0.12, 0.9, x0 + 1.4, CURB + 0.5, bz0 + 0.7, false);
      // the bars at the front
      for (let x = x0 + 0.35; x < x0 + 4.3; x += 0.32) box(steel, 0.07, 3.4, 0.07, x, CURB, bz1, false);
      this.nav.addRect(x0, bz1 - 0.1, x0 + 4.4, bz1 + 0.1);
      // the plate over the door
      const plate = new THREE.Mesh(plateGeo, new THREE.MeshBasicMaterial({ map: plateTexture(cell.plate, cell.sub), toneMapped: false }));
      plate.position.set(x0 + 2.2, CURB + 3.3, bz1 + 0.25);
      this.group.add(plate);
      if (cell.plate === "C.Z.") {
        // an empty cell, a message on the wall
        const note = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.9), new THREE.MeshBasicMaterial({ map: signTexture([["FUNDS ARE SAFU", "#f4b728", '900 70px "JetBrains Mono", monospace']], 1024, 160), transparent: true, toneMapped: false }));
        note.position.set(x0 + 2.4, CURB + 2.2, bz0 + 0.22);
        this.group.add(note);
      }
      if (i === CELLS.length - 1) {
        this.cell.set(x0 + 2.4, CURB, (bz0 + bz1) / 2 + 0.6);
        this.release.set(P.x1 + 3, CURB, GATE_Z + 4.6);
      }
    });
    // the yard: a basketball court and a bench
    const court = new THREE.Mesh(new THREE.PlaneGeometry(14, 9), new THREE.MeshStandardMaterial({ color: "#a0522d", roughness: 0.8 }));
    court.rotation.x = -Math.PI / 2;
    court.position.set(cx + 6, CURB + 0.02, cz + 8);
    this.group.add(court);
    box(steel, 0.2, 3, 0.2, cx + 6 - 7.2, CURB, cz + 8);
    box(new THREE.MeshStandardMaterial({ color: "#f2f2f6" }), 0.1, 1, 1.6, cx + 6 - 7.1, CURB + 2.6, cz + 8, false);
    // the sign over the gate, both faces
    const sign = signTexture([
      ["ZEC STATE PENITENTIARY", "#f2f2f6", '900 68px "JetBrains Mono", monospace'],
      ["透明刑務所 · transparent wallets welcome", "#f4b728", '700 40px "Hiragino Sans", "Noto Sans JP", sans-serif'],
    ]);
    for (const side of [-1, 1]) {
      const s = new THREE.Mesh(new THREE.PlaneGeometry(9, 2.25), new THREE.MeshBasicMaterial({ map: sign, toneMapped: false }));
      s.position.set(wx1 + side * 0.5, CURB + WALL_H + 1.4, GATE_Z);
      s.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
      this.group.add(s);
    }
    box(dark, 0.4, 2.6, 9.4, wx1, CURB + WALL_H, GATE_Z, false);
    for (const [m, list] of bins) {
      const mesh = new THREE.Mesh(mergeGeometries(list.map((g) => (g.index ? g.toNonIndexed() : g)), false), m);
      mesh.castShadow = m !== ground;
      mesh.receiveShadow = true;
      this.group.add(mesh);
    }
  }

  /** The inmates in their cells, a guard on the yard. */
  private async people() {
    const P = PRISON;
    const bx0 = P.x0 + 1.2 + 6,
      bz0 = P.z0 + 1.2 + 2;
    let seq = 3100;
    for (const [i, cell] of CELLS.entries()) {
      if (!cell.who) continue;
      const s = await this.director.newSnark(seq += 523);
      this.director.adopt(s);
      s.role = cell.who;
      s.root.position.set(bx0 + i * 4.4 + 2.6, CURB, bz0 + 3);
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
    g.root.position.set(P.x1 - 4.5, CURB, GATE_Z - 5);
    g.faceDir = new THREE.Vector3(-1, 0, 0);
    this.guard = g;
  }

  update(dt: number) {
    this.clock += dt;
    for (const l of this.lights) l.rotation.y = this.clock * 0.35 + l.userData.phase;
  }
}
