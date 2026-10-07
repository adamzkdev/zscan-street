import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { Market } from "../../data/market";
import { CURB } from "../city/plan";
import { zLogo } from "../decor";
import type { Snark } from "../snark";
import { Banter, canvasTex, clean, FONT, person, portraitSheet, sign, tube, v3 } from "./common";

/**
 * The ZEC FLYER: a 52 m observation wheel on the south bank (London Eye / Singapore Flyer), its
 * rim a lit truss on cable spokes, 30 glass capsules kept level as it turns (one lap in 90 s),
 * zkSNARKs inside each. A boarding deck with its canopy, stairs, a queue and a ticket booth.
 * Ride it: you stand in a capsule among other passengers, the real city outside.
 */
export const FLY = { x: -70, z: 84, r: 21, hub: 27, n: 30, out: 2.1 };
/** The capsule: an ellipsoid (semi-axes, long axis along the wheel's axle), its floor. */
export const POD = { a: 1.8, b: 1.6, c: 3.2, floor: -1.0 };
const HUB_Y = CURB + FLY.hub;
/** The boarding deck: level with a capsule's floor at the bottom of the wheel. */
export const PLAT_Y = HUB_Y - (FLY.r + FLY.out) + POD.floor;
const OMEGA = (Math.PI * 2) / 90;
const BOTTOM = -Math.PI / 2;
const DECK = { x0: -81.2, x1: -58.8, z0: 87.6, z1: 91.6 };
const STAIRS = [-78, -62].map((x) => ({ x0: x - 1.5, x1: x + 1.5, z0: DECK.z1, z1: DECK.z1 + 4.8 }));
const RIDERS = 3;
/** The blimp's mooring mast, on the river promenade. */
export const MAST = { x: -80.6, z: 78.4, h: 12 };

const std = (color: string, o: Partial<THREE.MeshStandardMaterialParameters> = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.1, ...o });

/** Geometries sorted by material, merged at the end into one mesh per material. */
class Parts {
  private by = new Map<THREE.Material, THREE.BufferGeometry[]>();
  add(m: THREE.Material, ...g: THREE.BufferGeometry[]) {
    const l = this.by.get(m) ?? [];
    l.push(...g.map(clean));
    this.by.set(m, l);
  }
  box(m: THREE.Material, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) {
    this.add(m, new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0).translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2));
  }
  build(parent: THREE.Object3D, shadows = true) {
    for (const [m, l] of this.by) {
      const mesh = new THREE.Mesh(mergeGeometries(l, false), m);
      mesh.castShadow = shadows;
      mesh.receiveShadow = true;
      parent.add(mesh);
    }
  }
}

/** The capsule's frame (local, centred): belly, mount hoop, ribs, floor, bench, lamp strip. */
function podFrame(detail: boolean) {
  const { a, b, c, floor } = POD;
  const belly = new THREE.SphereGeometry(1, detail ? 40 : 20, detail ? 12 : 6, 0, Math.PI * 2, Math.PI * 0.66, Math.PI * 0.34).scale(a * 1.005, b * 1.005, c * 1.005);
  const ribs: THREE.BufferGeometry[] = [];
  // the hoop that turns in the rim, and two rings round the long axis
  ribs.push(new THREE.TorusGeometry(1, detail ? 0.06 : 0.11, 6, 40).scale(a + 0.08, b + 0.08, 1));
  for (const z of [-1.7, 1.7]) {
    const k = Math.sqrt(1 - (z / c) ** 2);
    ribs.push(new THREE.TorusGeometry(1, detail ? 0.022 : 0.045, 4, 36).scale(a * k + 0.02, b * k + 0.02, 1).translate(0, 0, z));
  }
  for (const z of [-2.8, 2.8]) {
    const k = Math.sqrt(1 - (z / c) ** 2);
    ribs.push(new THREE.TorusGeometry(1, detail ? 0.03 : 0.06, 4, 28).scale(a * k + 0.02, b * k + 0.02, 1).translate(0, 0, z));
  }
  // meridians from end to end (the glazing bars)
  for (const phi of [0, Math.PI / 4, Math.PI / 2, (3 * Math.PI) / 4, Math.PI]) {
    const pts: THREE.Vector3[] = [];
    for (let s = 0; s <= 20; s++) {
      const th = (s / 20) * Math.PI;
      pts.push(v3(Math.cos(phi) * Math.sin(th) * (a + 0.02), Math.sin(phi) * Math.sin(th) * (b + 0.02), Math.cos(th) * (c + 0.02)));
    }
    ribs.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), detail ? 28 : 12, detail ? 0.02 : 0.04, 4, false));
  }
  const fk = Math.sqrt(1 - (floor / b) ** 2);
  const floorG = new THREE.CylinderGeometry(1, 1, 0.08, 36).scale(a * fk, 1, c * fk).translate(0, floor, 0);
  const bench = [new THREE.BoxGeometry(0.62, 0.42, 2.2).translate(0, floor + 0.21, 0)];
  const cushion = [new THREE.BoxGeometry(0.66, 0.08, 2.24).translate(0, floor + 0.45, 0)];
  const strip = new THREE.TorusGeometry(1, 0.03, 4, 40)
    .rotateX(Math.PI / 2)
    .scale(a * fk - 0.04, 1, c * fk - 0.04)
    .translate(0, floor + 0.06, 0);
  return { belly, ribs: mergeGeometries(ribs.map(clean), false), floor: floorG, bench: mergeGeometries(bench.map(clean), false), cushion: mergeGeometries(cushion.map(clean), false), strip };
}

const POD_TALK: [number, string][][] = [
  [
    [0, "Look, you can see the whole bay from up here!"],
    [1, "There's the Golden Gate."],
    [0, "And not one shielded tx in sight. Perfect."],
  ],
  [
    [1, "How high do we go?"],
    [0, "Fifty-two metres at the top."],
    [2, "Hold the rail, it's a long way down."],
  ],
  [
    [2, "A new block every 75 seconds."],
    [0, "Almost one per lap of this wheel."],
  ],
  [
    [0, "Is that the Burj Al Zec over there?"],
    [1, "By the Palm, yes. Gold everywhere."],
  ],
  [
    [1, "My memo says: meet me at the top."],
    [2, "Encrypted, I hope."],
    [1, "Always shielded."],
  ],
  [
    [2, "The Proof Factory never sleeps."],
    [0, "Halo 2 proofs. No trusted setup."],
    [1, "Respect."],
  ],
  [
    [0, "The block buses look like toys from here."],
    [2, "Every one of them full of private txs."],
  ],
  [
    [1, "Who paid for the tickets?"],
    [0, "Me. Shielded, of course."],
    [1, "So nobody will ever know."],
  ],
];

export class Flyer {
  readonly group = new THREE.Group();
  readonly wheel = new THREE.Group();
  /** The capsule you ride in: modelled inside, put on the boarded capsule each frame. */
  readonly cabin = new THREE.Group();
  angle = 0;
  ride: { pod: number; left: number; top: boolean } | null = null;
  private glass: THREE.InstancedMesh;
  private frames: THREE.InstancedMesh[] = [];
  private leds: THREE.InstancedMesh;
  private ledN: number;
  private riders: THREE.Mesh;
  private riderSlots: { x: number; z: number; h: number; k: number }[] = [];
  private queue: Snark[] = [];
  private passengers: Banter;
  private screen: { g: CanvasRenderingContext2D; tex: THREE.CanvasTexture; t: number };
  private glassMat: THREE.MeshStandardMaterial;
  private night: boolean | null = null;
  private hitBox = new THREE.Box3(v3(-82.5, 0, 86.8), v3(-57.5, 10, 100));
  private mastBox = new THREE.Box3(v3(MAST.x - 1.4, 0, MAST.z - 1.2), v3(MAST.x + 1.4, CURB + MAST.h + 1.8, MAST.z + 1.2));
  private qT = 0;
  height: number | null = null;

  constructor(parent: THREE.Object3D) {
    parent.add(this.group);
    const white = std("#f4f2f6", { roughness: 0.32, metalness: 0.45 });
    white.userData.dayColor = "#ffffff";
    const steel = std("#a8aeb8", { roughness: 0.4, metalness: 0.6 });
    const dark = std("#26242c", { roughness: 0.6 });
    const gold = std("#f4b728", { roughness: 0.3, metalness: 0.7 });
    const stone = std("#d6d0c8", { roughness: 0.85 });
    const stoneDark = std("#a59e96", { roughness: 0.9 });
    const deckMat = std("#b9b2aa", { roughness: 0.7 });
    const grass = std("#6faa6a", { roughness: 0.95 });
    const leaf = std("#4f9a5a", { roughness: 0.9, flatShading: true });
    const leaf2 = std("#7cc06a", { roughness: 0.9, flatShading: true });
    const bark = std("#6a4a34", { roughness: 0.9 });
    const red = std("#c8323a", { roughness: 0.6 });
    const glassRail = new THREE.MeshStandardMaterial({ color: "#bfe4ff", roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.35, depthWrite: false });
    const glowGold = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.5, 0.35), toneMapped: false });
    const glowWhite = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.8, 1.7, 1.5), toneMapped: false });
    const lampNight = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 1.9, 1.2), toneMapped: false });
    lampNight.userData.night = true;

    // ---- the wheel (turns): rim truss, cable spokes, hub, the capsules' bearings ----
    const R = FLY.r;
    const rim: THREE.BufferGeometry[] = [];
    rim.push(new THREE.TorusGeometry(R, 0.3, 8, 180).translate(0, 0, 1.0), new THREE.TorusGeometry(R, 0.3, 8, 180).translate(0, 0, -1.0), new THREE.TorusGeometry(R - 2.4, 0.24, 8, 180));
    const P = (ang: number, r: number, z: number) => v3(Math.cos(ang) * r, Math.sin(ang) * r, z);
    const SEG = 120;
    for (let i = 0; i < SEG; i++) {
      const a0 = (i / SEG) * Math.PI * 2,
        a1 = ((i + 1) / SEG) * Math.PI * 2,
        am = (a0 + a1) / 2;
      rim.push(tube(P(a0, R, 1), P(am, R - 2.4, 0), 0.08, 0.08, 5), tube(P(a0, R, -1), P(am, R - 2.4, 0), 0.08, 0.08, 5));
      rim.push(tube(P(am, R - 2.4, 0), P(a1, R, 1), 0.08, 0.08, 5), tube(P(am, R - 2.4, 0), P(a1, R, -1), 0.08, 0.08, 5));
      rim.push(tube(P(a0, R, 1), P(a0, R, -1), 0.07, 0.07, 4));
      if (i % 2 === 0) rim.push(tube(P(a0, R, 1), P(a1, R, -1), 0.05, 0.05, 4));
    }
    // cable spokes, from both hub flanges to the inner ring, crossing
    const spokes: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 32; i++) {
      const a = (i / 32) * Math.PI * 2;
      spokes.push(tube(P(a, 2.6, 3.0), P(a + 0.06, R - 2.4, 0), 0.05, 0.05, 4), tube(P(a + Math.PI / 32, 2.6, -3.0), P(a + Math.PI / 32 - 0.06, R - 2.4, 0), 0.05, 0.05, 4));
    }
    // hub and flanges
    const hub: THREE.BufferGeometry[] = [new THREE.CylinderGeometry(1.9, 1.9, 6.4, 24).rotateX(Math.PI / 2)];
    for (const z of [-3, 3]) hub.push(new THREE.CylinderGeometry(2.9, 2.9, 0.35, 28).rotateX(Math.PI / 2).translate(0, 0, z));
    // the capsules' bearings on the rim
    const bear: THREE.BufferGeometry[] = [];
    for (let i = 0; i < FLY.n; i++) {
      const a = (i / FLY.n) * Math.PI * 2;
      bear.push(new THREE.BoxGeometry(0.45, 0.6, 2.3).rotateZ(a).translate(Math.cos(a) * (R + 0.3), Math.sin(a) * (R + 0.3), 0));
    }
    const wheelMesh = new THREE.Mesh(mergeGeometries([...rim, ...hub, ...bear].map(clean), false), white);
    wheelMesh.castShadow = true;
    this.wheel.add(wheelMesh, new THREE.Mesh(mergeGeometries(spokes.map(clean), false), steel));
    // the Zcash mark on the hub, facing the river and the city
    const logo = new THREE.Mesh(
      new THREE.CircleGeometry(2.75, 40),
      new THREE.MeshBasicMaterial({
        map: canvasTex(256, 256, (g, w, h) => {
          g.fillStyle = "#16141c";
          g.fillRect(0, 0, w, h);
          zLogo(g, w / 2, h / 2, w * 0.8, "#f4b728");
        }),
        toneMapped: false,
        color: new THREE.Color(1.3, 1.3, 1.3),
      }),
    );
    logo.position.z = -3.2;
    logo.rotation.y = Math.PI;
    this.wheel.add(logo);
    // rim LEDs: two rings of lights, colours chasing round at night
    this.ledN = 168;
    this.leds = new THREE.InstancedMesh(new THREE.BoxGeometry(0.26, 0.26, 0.26), new THREE.MeshBasicMaterial({ color: "#ffffff", toneMapped: false }), this.ledN * 2 + 64);
    (this.leds.material as THREE.Material).userData.night = true;
    const m4 = new THREE.Matrix4();
    let li = 0;
    for (const z of [1.0, -1.0])
      for (let i = 0; i < this.ledN; i++) {
        const a = (i / this.ledN) * Math.PI * 2;
        this.leds.setMatrixAt(li++, m4.makeTranslation(Math.cos(a) * (R + 0.36), Math.sin(a) * (R + 0.36), z * 1.12));
      }
    // and a lit dot halfway down each spoke pair
    for (let i = 0; i < 64; i++) {
      const a = (i / 64) * Math.PI * 2;
      this.leds.setMatrixAt(li++, m4.makeTranslation(Math.cos(a) * (R - 2.6), Math.sin(a) * (R - 2.6), 0));
    }
    this.leds.frustumCulled = false;
    this.wheel.add(this.leds);
    this.wheel.position.set(FLY.x, HUB_Y, FLY.z);
    this.group.add(this.wheel);

    // ---- static: the spindle, the A-frame, the backstays ----
    const st = new Parts();
    st.add(white, new THREE.CylinderGeometry(0.95, 0.95, 10.2, 18).rotateX(Math.PI / 2).translate(FLY.x, HUB_Y, FLY.z + 0.9));
    st.add(steel, new THREE.CylinderGeometry(1.5, 1.5, 1.4, 18).rotateX(Math.PI / 2).translate(FLY.x, HUB_Y, FLY.z + 5.6));
    const apex = v3(FLY.x, HUB_Y, FLY.z + 5.6);
    const feet = [v3(FLY.x - 11, CURB, 98.2), v3(FLY.x + 11, CURB, 98.2)];
    for (const f of feet) {
      st.add(white, tube(f, apex.clone().add(v3(Math.sign(f.x - FLY.x) * 1.0, -0.6, 0)), 0.85, 0.5, 12));
      st.box(stoneDark, f.x - 1.4, CURB - 0.1, f.z - 1.4, f.x + 1.4, CURB + 0.7, f.z + 1.4);
    }
    for (const t of [0.3, 0.58]) {
      const a = feet[0].clone().lerp(apex, t),
        b = feet[1].clone().lerp(apex, t);
      st.add(white, tube(a, b, 0.32, 0.32, 8));
    }
    for (const dx of [-3.5, 3.5]) {
      const anchor = v3(FLY.x + dx, CURB + 0.6, 99.3);
      st.add(steel, tube(anchor, apex.clone().add(v3(dx * 0.15, 0.4, 0.5)), 0.09, 0.09, 5));
      st.box(stoneDark, anchor.x - 0.8, CURB - 0.1, anchor.z - 0.6, anchor.x + 0.8, CURB + 0.8, anchor.z + 0.6);
    }

    // ---- the riverside park: paving, lawns, trees, the river railing ----
    st.box(stone, -82, CURB - 0.04, 77, -58, CURB + 0.03, 100);
    for (let x = -82; x < -58; x += 2) st.box(stoneDark, x, CURB + 0.03, 77, x + 0.06, CURB + 0.035, 100);
    for (const [x0, x1] of [
      [-81.4, -75.2],
      [-64.8, -58.6],
    ]) {
      st.box(stoneDark, x0 - 0.25, CURB, 78.2, x1 + 0.25, CURB + 0.32, 86.4);
      st.box(grass, x0, CURB, 78.45, x1, CURB + 0.36, 86.15);
    }
    st.box(steel, -82, CURB + 1.0, 77.15, -58, CURB + 1.08, 77.25);
    for (let x = -82; x <= -58; x += 1.2) st.box(steel, x - 0.04, CURB, 77.16, x + 0.04, CURB + 1.0, 77.24);
    // (only along the river: the capsules sweep low over the lawns)
    const trees = [
      [-76, 79.2],
      [-64, 79.2],
      [-59.4, 79.3],
    ];
    for (const [x, z] of trees) {
      st.add(bark, new THREE.CylinderGeometry(0.16, 0.22, 2.4, 6).translate(x, CURB + 1.4, z));
      st.add(leaf, new THREE.IcosahedronGeometry(1.3, 0).translate(x, CURB + 3.2, z));
      st.add(leaf2, new THREE.IcosahedronGeometry(0.95, 0).translate(x + 0.3, CURB + 4.1, z - 0.2));
    }
    // lamps along the promenade and the plaza
    for (const [x, z] of [
      [-74, 78.2],
      [-66, 78.2],
      [-82, 92.5],
      [-58, 92.5],
      [-63.4, 99.2],
      [-74.5, 99.2],
    ]) {
      st.add(dark, new THREE.CylinderGeometry(0.07, 0.09, 4, 6).translate(x, CURB + 2, z));
      st.box(dark, x - 0.22, CURB + 4, z - 0.22, x + 0.22, CURB + 4.12, z + 0.22);
      st.add(glowWhite, new THREE.BoxGeometry(0.34, 0.12, 0.34).translate(x, CURB + 3.94, z));
    }

    // ---- the boarding deck: slab on columns, safety edge, glass balustrade, canopy ----
    const D = DECK,
      y = PLAT_Y;
    st.box(deckMat, D.x0, y - 0.35, D.z0, D.x1, y, D.z1);
    st.box(glowGold, D.x0, y + 0.002, D.z0, D.x1, y + 0.012, D.z0 + 0.12);
    st.box(gold, D.x0, y - 0.5, D.z0 - 0.02, D.x1, y - 0.35, D.z1);
    for (let x = D.x0 + 1; x < D.x1; x += 4.4)
      for (const z of [D.z0 + 0.6, D.z1 - 0.5]) st.box(white, x - 0.25, CURB, z - 0.25, x + 0.25, y - 0.35, z + 0.25);
    // balustrade on the south edge (openings at the stairs) and the two ends
    const rail = (x0: number, z0: number, x1: number, z1: number) => {
      st.box(glassRail, Math.min(x0, x1) - 0.02, y, Math.min(z0, z1) - 0.02, Math.max(x0, x1) + 0.02, y + 1.05, Math.max(z0, z1) + 0.02);
      st.box(steel, Math.min(x0, x1) - 0.05, y + 1.05, Math.min(z0, z1) - 0.05, Math.max(x0, x1) + 0.05, y + 1.12, Math.max(z0, z1) + 0.05);
    };
    rail(D.x0, D.z1, STAIRS[0].x0, D.z1);
    rail(STAIRS[0].x1, D.z1, STAIRS[1].x0, D.z1);
    rail(STAIRS[1].x1, D.z1, D.x1, D.z1);
    rail(D.x0, D.z0 + 0.3, D.x0, D.z1);
    rail(D.x1, D.z0 + 0.3, D.x1, D.z1);
    // canopy: a thin white roof, gold fascia, slim posts
    const cy = y + 3.5;
    st.box(white, D.x0 - 0.2, cy, D.z0 + 0.2, D.x1 + 0.2, cy + 0.22, D.z1 + 0.8);
    st.box(gold, D.x0 - 0.25, cy - 0.12, D.z1 + 0.6, D.x1 + 0.25, cy + 0.3, D.z1 + 0.85);
    st.box(glowWhite, D.x0, cy - 0.03, D.z0 + 1.2, D.x1, cy, D.z0 + 1.35);
    for (let x = D.x0 + 0.4; x <= D.x1; x += 5.6) st.add(steel, new THREE.CylinderGeometry(0.09, 0.09, 3.5, 6).translate(x, y + 1.75, D.z1 - 0.25));
    // boarding gate at the bottom of the wheel: two posts and a lit header
    for (const dx of [-1.6, 1.6]) st.box(dark, FLY.x + dx - 0.12, y, D.z0 + 0.25, FLY.x + dx + 0.12, y + 2.5, D.z0 + 0.5);
    st.box(dark, FLY.x - 1.75, y + 2.5, D.z0 + 0.2, FLY.x + 1.75, y + 2.85, D.z0 + 0.55);
    // stairs: 16 steps down to the plaza, side walls and rails
    for (const s of STAIRS) {
      const n = 16,
        rise = (y - CURB) / n,
        run = (s.z1 - s.z0) / n;
      for (let k = 0; k < n; k++) st.box(stone, s.x0, CURB, s.z0 + k * run, s.x1, y - k * rise, s.z0 + (k + 1) * run);
      for (const x of [s.x0 - 0.15, s.x1 + 0.15]) {
        st.box(white, x - 0.1, CURB, s.z0, x + 0.1, y + 0.1, s.z0 + 0.3);
        st.add(steel, tube(v3(x, y + 1.0, s.z0), v3(x, CURB + 1.0, s.z1), 0.04, 0.04, 5));
        for (let k = 0; k <= 4; k++) {
          const z = s.z0 + (k / 4) * (s.z1 - s.z0) - 0.01,
            yy = y - (k / 4) * (y - CURB);
          st.add(steel, new THREE.CylinderGeometry(0.03, 0.03, 1.0, 4).translate(x, yy + 0.5, z));
        }
      }
    }

    // ---- the ticket booth and the queue's stanchions ----
    const B = { x0: -69, x1: -65, z0: 96.6, z1: 99.1 };
    st.box(white, B.x0, CURB, B.z0, B.x1, CURB + 1.0, B.z1);
    st.box(glassRail, B.x0 + 0.1, CURB + 1.0, B.z1 - 0.12, B.x1 - 0.1, CURB + 2.3, B.z1 - 0.04);
    st.box(white, B.x0, CURB + 1.0, B.z0, B.x1, CURB + 2.3, B.z0 + 0.15);
    st.box(white, B.x0, CURB + 1.0, B.z0, B.x0 + 0.15, CURB + 2.3, B.z1);
    st.box(white, B.x1 - 0.15, CURB + 1.0, B.z0, B.x1, CURB + 2.3, B.z1);
    st.box(gold, B.x0 - 0.3, CURB + 2.3, B.z0 - 0.3, B.x1 + 0.3, CURB + 2.6, B.z1 + 0.5);
    st.box(dark, B.x0 + 0.2, CURB + 0.95, B.z1 - 0.05, B.x1 - 0.2, CURB + 1.05, B.z1 + 0.35);
    const qLanes = [97.3, 98.3];
    for (const z of qLanes)
      for (let x = -76.4; x <= -70.4; x += 1.2) {
        st.add(steel, new THREE.CylinderGeometry(0.04, 0.05, 0.95, 6).translate(x, CURB + 0.48, z));
        st.add(steel, new THREE.CylinderGeometry(0.15, 0.15, 0.04, 8).translate(x, CURB + 0.02, z));
        if (x + 1.2 <= -70.3) st.box(red, x, CURB + 0.86, z - 0.025, x + 1.2, CURB + 0.92, z + 0.025);
      }
    // the blimp's mooring mast by the river: a lattice tower, its gold nose cone, the tours sign
    const M = MAST;
    const corner = (k: number, r: number, yy: number) => v3(M.x + (k & 1 ? r : -r), yy, M.z + (k & 2 ? r : -r));
    for (let k = 0; k < 4; k++) st.add(white, tube(corner(k, 0.9, CURB), corner(k, 0.35, CURB + M.h), 0.07, 0.07, 5));
    for (let i = 0; i < 6; i++) {
      const y0 = CURB + (i / 6) * M.h,
        y1 = CURB + ((i + 1) / 6) * M.h;
      const r0 = 0.9 - (i / 6) * 0.55,
        r1 = 0.9 - ((i + 1) / 6) * 0.55;
      for (const [a, b] of [
        [0, 1],
        [1, 3],
        [3, 2],
        [2, 0],
      ]) {
        st.add(white, tube(corner(a, r0, y0), corner(b, r1, y1), 0.035, 0.035, 4));
        st.add(white, tube(corner(a, r1, y1), corner(b, r1, y1), 0.035, 0.035, 4));
      }
    }
    st.add(gold, new THREE.ConeGeometry(0.75, 1.6, 12).translate(M.x, CURB + M.h + 0.8, M.z));
    st.add(gold, new THREE.CylinderGeometry(0.85, 0.85, 0.3, 12).translate(M.x, CURB + M.h + 0.05, M.z));
    st.box(stoneDark, M.x - 1.3, CURB, M.z - 1.0, M.x + 1.3, CURB + 0.4, M.z + 1.0);
    st.build(this.group);
    const tours = sign(2.6, 0.62, 80, (g, w, h) => {
      g.fillStyle = "#16141c";
      g.fillRect(0, 0, w, h);
      g.font = `800 ${h * 0.44}px ${FONT}`;
      g.fillStyle = "#f4b728";
      g.textBaseline = "middle";
      g.textAlign = "center";
      g.fillText("ZEC BLIMP", w / 2, h * 0.34);
      g.font = `600 ${h * 0.26}px ${FONT}`;
      g.fillStyle = "#ffffff";
      g.fillText("CITY TOURS · BOARD HERE", w / 2, h * 0.76);
    });
    tours.position.set(M.x, CURB + 2.6, M.z + 1.0);
    this.group.add(tours);
    for (const side of [-1, 1]) {
      const back = tours.clone();
      back.position.set(M.x, CURB + 2.6, M.z - 1.0);
      back.rotation.y = Math.PI;
      if (side > 0) this.group.add(back);
    }

    // the signs: ZEC FLYER on the canopy, TICKETS over the booth, a totem by the street
    const title = sign(9, 1.0, 96, (g, w, h) => {
      g.fillStyle = "#16141c";
      g.fillRect(0, 0, w, h);
      zLogo(g, h * 0.62, h / 2, h * 0.78, "#f4b728");
      g.font = `900 ${h * 0.62}px ${FONT}`;
      g.fillStyle = "#f4b728";
      g.textBaseline = "middle";
      g.fillText("ZEC FLYER", h * 1.25, h / 2 + 3);
      g.font = `600 ${h * 0.3}px ${FONT}`;
      g.fillStyle = "#ffffff";
      g.fillText("52 m · 30 capsules", w - h * 3.5, h / 2 + 2);
    });
    title.position.set(FLY.x, cy + 0.9, D.z1 + 0.86);
    this.group.add(title);
    const tickets = sign(3.6, 0.5, 64, (g, w, h) => {
      g.fillStyle = "#16141c";
      g.fillRect(0, 0, w, h);
      g.font = `800 ${h * 0.6}px ${FONT}`;
      g.fillStyle = "#f4b728";
      g.textBaseline = "middle";
      g.textAlign = "center";
      g.fillText("TICKETS · ⓩ 0.01", w / 2, h / 2 + 2);
    });
    tickets.position.set((B.x0 + B.x1) / 2, CURB + 2.95, B.z1 + 0.52);
    this.group.add(tickets);
    const totem = sign(1.3, 4.2, 300, (g, w, h) => {
      g.fillStyle = "#16141c";
      g.fillRect(0, 0, w, h);
      zLogo(g, w / 2, w * 0.62, w * 0.78, "#f4b728");
      g.fillStyle = "#f4b728";
      g.font = `900 ${w * 0.5}px ${FONT}`;
      g.textAlign = "center";
      "FLYER".split("").forEach((ch, i) => g.fillText(ch, w / 2, w * 1.5 + i * w * 0.56));
    });
    totem.position.set(-74.6, CURB + 2.3, 99.55);
    this.group.add(totem);
    const totemBack = new THREE.Mesh(new THREE.BoxGeometry(1.5, 4.6, 0.3), dark);
    totemBack.position.set(-74.6, CURB + 2.3, 99.35);
    this.group.add(totemBack);

    // ---- the capsules: glass (instanced), frame (instanced, one per material), riders ----
    const f = podFrame(false);
    const frameMats: [THREE.BufferGeometry, THREE.Material][] = [
      [f.belly, white],
      [f.ribs, white],
      [f.floor, std("#3a3640")],
      [f.bench, dark],
      [f.cushion, gold],
      [f.strip, lampNight],
    ];
    for (const [g, m] of frameMats) {
      const im = new THREE.InstancedMesh(g, m, FLY.n);
      im.frustumCulled = false;
      this.frames.push(im);
      this.group.add(im);
    }
    this.glassMat = new THREE.MeshStandardMaterial({ color: "#d4ecff", roughness: 0.05, metalness: 0.55, transparent: true, opacity: 0.42, depthWrite: false, emissive: "#ffcf7a", emissiveIntensity: 0 });
    this.glass = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 28, 14, 0, Math.PI * 2, 0, Math.PI * 0.66).scale(POD.a, POD.b, POD.c), this.glassMat, FLY.n);
    this.glass.frustumCulled = false;
    this.glass.renderOrder = 2;
    this.group.add(this.glass);
    // riders: cut-out portraits standing in each capsule, turned to the camera every frame
    const ids = Array.from({ length: 40 }, (_, i) => 1 + ((i * 2477 + 913) % 10000));
    const sheet = portraitSheet(ids);
    const nq = FLY.n * RIDERS;
    const pos = new Float32Array(nq * 12),
      uv = new Float32Array(nq * 8),
      idx: number[] = [];
    for (let q = 0; q < nq; q++) {
      const [u0, v0, u1, v1] = sheet.uv((q * 7) % ids.length);
      uv.set([u0, v0, u1, v0, u1, v1, u0, v1], q * 8);
      idx.push(q * 4, q * 4 + 1, q * 4 + 2, q * 4, q * 4 + 2, q * 4 + 3);
      const s = q % RIDERS;
      this.riderSlots.push({ x: [-0.8, 0.75, 0.1][s] + (Math.random() - 0.5) * 0.3, z: [-1.6, 0.4, 1.9][s] + (Math.random() - 0.5) * 0.6, h: 1.25 + Math.random() * 0.15, k: q });
    }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute("position", new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    rg.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    rg.setIndex(idx);
    this.riders = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ map: sheet.tex, alphaTest: 0.5, side: THREE.DoubleSide }));
    this.riders.frustumCulled = false;
    this.group.add(this.riders);

    // ---- the capsule you ride in ----
    const fd = podFrame(true);
    const cabinFloor = std("#4a4450", { roughness: 0.7 });
    for (const [g, m] of [
      [fd.belly, white],
      [fd.ribs, white],
      [fd.floor, cabinFloor],
      [fd.bench, dark],
      [fd.cushion, gold],
      [fd.strip, glowGold],
    ] as [THREE.BufferGeometry, THREE.Material][])
      this.cabin.add(new THREE.Mesh(g, m));
    const inner = new THREE.MeshStandardMaterial({ color: "#dff2ff", roughness: 0.02, metalness: 0.2, transparent: true, opacity: 0.07, depthWrite: false, side: THREE.DoubleSide });
    const shell = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24, 0, Math.PI * 2, 0, Math.PI * 0.66).scale(POD.a, POD.b, POD.c), inner);
    shell.renderOrder = 3;
    this.cabin.add(shell);
    // handrail round the glass at waist height, on posts
    const ry = POD.floor + 1.0;
    const rk = Math.sqrt(1 - (ry / POD.b) ** 2);
    const ra = POD.a * rk - 0.2,
      rc = POD.c * rk - 0.25;
    const railG: THREE.BufferGeometry[] = [new THREE.TorusGeometry(1, 0.03, 6, 64).rotateX(Math.PI / 2).scale(ra, 1, rc).translate(0, ry, 0)];
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + 0.3;
      railG.push(new THREE.CylinderGeometry(0.022, 0.022, 1.0, 5).translate(Math.cos(a) * ra, POD.floor + 0.5, Math.sin(a) * rc));
    }
    this.cabin.add(new THREE.Mesh(mergeGeometries(railG.map(clean), false), steel));
    // the door frame at the south end, a little ZEC plate on the floor
    // a live screen on the bench's end: height, block, price
    const sc = document.createElement("canvas");
    sc.width = 512;
    sc.height = 256;
    const stex = new THREE.CanvasTexture(sc);
    stex.colorSpace = THREE.SRGBColorSpace;
    this.screen = { g: sc.getContext("2d")!, tex: stex, t: 0 };
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.31), new THREE.MeshBasicMaterial({ map: stex, toneMapped: false }));
    scr.position.set(0, POD.floor + 0.62, 1.185);
    scr.rotation.x = -0.5;
    const scrBox = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.4, 0.08), dark);
    scrBox.position.set(0, POD.floor + 0.6, 1.13);
    scrBox.rotation.x = -0.5;
    const stand = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.45, 0.12), dark);
    stand.position.set(0, POD.floor + 0.22, 1.2);
    this.cabin.add(scrBox, scr, stand);
    this.cabin.visible = false;
    this.group.add(this.cabin);
    // three passengers: two at the north glass, one on the bench
    const people = [
      person(this.cabin, 1 + Math.floor(Math.random() * 10000), v3(-1.0, POD.floor, -1.9), { scale: 0.62 }),
      person(this.cabin, 1 + Math.floor(Math.random() * 10000), v3(1.0, POD.floor, -1.5), { scale: 0.62 }),
      person(this.cabin, 1 + Math.floor(Math.random() * 10000), v3(0.1, POD.floor + 0.42, -0.7), { scale: 0.62, sit: true }),
    ];
    this.passengers = new Banter([null, null, null], POD_TALK, 0.62, 0.26);
    people.forEach((p, i) => void p.then((s) => (this.passengers.people[i] = s)));

    // ---- the queue on the plaza, the stairs and the deck; staff at the gate and the booth ----
    const spots: [number, number, number, boolean?][] = [
      [-70.9, CURB, 97.8],
      [-72.2, CURB, 97.8],
      [-73.6, CURB, 97.8],
      [-75.0, CURB, 97.8],
      [-77.9, CURB, 97.4],
      [-78.1, this.stairY(94.9), 94.9],
      [-77.9, this.stairY(93.3), 93.3],
      [-77.0, y, 90.7],
      [-75.4, y, 90.3],
      [-73.9, y, 89.9],
      [-71.9, y, 89.1, true],
      [-67.0, CURB, 97.6, true],
      [-62.2, this.stairY(93.6), 93.6],
      [-66.5, y, 90.2],
    ];
    spots.forEach(([x, yy, z, staff], i) => {
      void person(this.group, 300 + i * 611, v3(x, yy, z), { cap: !!staff, role: staff ? "ZEC Flyer staff" : undefined, face: i >= 12 ? v3(0, 0, 1) : v3(-1, 0, -0.2).normalize() }).then((s) => s && this.queue.push(s));
    });
  }

  /** Floor height of the boarding stairs at z (both flights). */
  private stairY(z: number) {
    const s = STAIRS[0];
    return PLAT_Y - THREE.MathUtils.clamp((z - s.z0) / (s.z1 - s.z0), 0, 1) * (PLAT_Y - CURB);
  }

  /** Floor height on foot over the deck and its stairs. */
  groundAt(x: number, z: number): number | null {
    if (x > DECK.x0 && x < DECK.x1 && z > DECK.z0 && z < DECK.z1) return PLAT_Y;
    for (const s of STAIRS) if (x > s.x0 && x < s.x1 && z >= s.z0 && z < s.z1) return this.stairY(z);
    return null;
  }

  /** Where you step out after a lap: on the deck by the gate, looking along it. */
  get exit() {
    return { pos: v3(FLY.x + 0.5, PLAT_Y, DECK.z0 + 1.6), yaw: -Math.PI / 2 };
  }

  podAngle(i: number) {
    return this.angle + (i / FLY.n) * Math.PI * 2;
  }

  podCentre(i: number, out: THREE.Vector3) {
    const a = this.podAngle(i);
    return out.set(FLY.x + Math.cos(a) * (FLY.r + FLY.out), HUB_Y + Math.sin(a) * (FLY.r + FLY.out), FLY.z);
  }

  /** The wheel's disc (or its deck and booth) under the ray? */
  hit(ray: THREE.Raycaster) {
    const r = ray.ray;
    if (Math.abs(r.direction.z) > 1e-4) {
      const t = (FLY.z - r.origin.z) / r.direction.z;
      if (t > 0) {
        const p = r.at(t, new THREE.Vector3());
        if (Math.hypot(p.x - FLY.x, p.y - HUB_Y) < FLY.r + FLY.out + 1.8) return t;
      }
    }
    const p = r.intersectBox(this.hitBox, new THREE.Vector3());
    return p ? p.distanceTo(r.origin) : null;
  }

  /** The mooring mast (boards the blimp) under the ray? */
  hitMast(ray: THREE.Raycaster) {
    const p = ray.ray.intersectBox(this.mastBox, new THREE.Vector3());
    return p ? p.distanceTo(ray.ray.origin) : null;
  }

  /** Board the capsule that just passed the bottom: one full lap. */
  board() {
    let best = 0,
      lag = Infinity;
    for (let i = 0; i < FLY.n; i++) {
      const d = (((this.podAngle(i) - BOTTOM) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      if (d < lag) (lag = d), (best = i);
    }
    this.ride = { pod: best, left: (Math.PI * 2 - lag) / OMEGA, top: false };
    this.cabin.visible = true;
    this.passengers.hush(2.5);
    this.place();
  }

  stop() {
    this.ride = null;
    this.cabin.visible = false;
  }

  /** The eye of the rider, world space: standing at the south end, the city ahead. */
  eye(out: THREE.Vector3) {
    return out.copy(this.cabin.position).add(v3(0, POD.floor + 1.5, 1.95));
  }

  /** A new block: someone in the capsule says so. */
  block(h: number) {
    if (this.ride) this.passengers.say(1, `New block! #${h.toLocaleString("en-US")}`, 3.2), this.passengers.hush(4);
  }

  private place() {
    if (!this.ride) return;
    this.podCentre(this.ride.pod, this.cabin.position);
    this.cabin.updateMatrixWorld(true);
  }

  update(dt: number, t: number, camQuat: THREE.Quaternion, camRight: THREE.Vector3, night: boolean) {
    this.angle += dt * OMEGA;
    this.wheel.rotation.z = this.angle;
    if (night !== this.night) {
      this.night = night;
      this.glassMat.emissiveIntensity = night ? 0.22 : 0;
      this.glassMat.opacity = night ? 0.5 : 0.42;
      this.leds.visible = night;
      this.frames[5].visible = night;
    }
    // the capsules, level whatever the wheel's angle; the ridden one is the modelled cabin
    const m = new THREE.Matrix4(),
      c = new THREE.Vector3(),
      zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < FLY.n; i++) {
      this.podCentre(i, c);
      const mm = this.ride?.pod === i ? zero : m.makeTranslation(c.x, c.y, c.z);
      this.glass.setMatrixAt(i, mm);
      for (const f of this.frames) f.setMatrixAt(i, mm);
    }
    this.glass.instanceMatrix.needsUpdate = true;
    for (const f of this.frames) f.instanceMatrix.needsUpdate = true;
    // riders: quads turned to the camera (around the vertical)
    const P = this.riders.geometry.getAttribute("position") as THREE.BufferAttribute;
    const arr = P.array as Float32Array;
    const rx = camRight.x,
      rz = camRight.z,
      rl = Math.hypot(rx, rz) || 1;
    const hx = (rx / rl) * 0.5,
      hz = (rz / rl) * 0.5;
    for (const s of this.riderSlots) {
      const pod = Math.floor(s.k / RIDERS);
      const o = s.k * 12;
      if (this.ride?.pod === pod) {
        arr.fill(0, o, o + 12);
        continue;
      }
      this.podCentre(pod, c);
      const bx = c.x + s.x,
        by = c.y + POD.floor + 0.18 + Math.sin(t * 1.3 + s.k) * 0.01,
        bz = c.z + s.z,
        h = s.h;
      arr[o] = bx - hx * h;
      arr[o + 1] = by;
      arr[o + 2] = bz - hz * h;
      arr[o + 3] = bx + hx * h;
      arr[o + 4] = by;
      arr[o + 5] = bz + hz * h;
      arr[o + 6] = bx + hx * h;
      arr[o + 7] = by + h;
      arr[o + 8] = bz + hz * h;
      arr[o + 9] = bx - hx * h;
      arr[o + 10] = by + h;
      arr[o + 11] = bz - hz * h;
    }
    P.needsUpdate = true;
    // rim lights at night: the colours of a slow rainbow, a bright pulse chasing round
    if (night) {
      const col = new THREE.Color();
      let li = 0;
      for (let ring = 0; ring < 2; ring++)
        for (let i = 0; i < this.ledN; i++) {
          const u = i / this.ledN;
          const chase = Math.pow((((u * 4 - t * 0.35 + ring * 0.5) % 1) + 1) % 1, 8);
          col.setHSL((u * 2 + t * 0.05) % 1, 0.95, 0.5).multiplyScalar(1.1 + chase * 3.2);
          this.leds.setColorAt(li++, col);
        }
      for (let i = 0; i < 64; i++) this.leds.setColorAt(li++, col.setRGB(2.4, 1.6, 0.3).multiplyScalar(0.6 + 0.4 * Math.sin(t * 2 + i * 0.7)));
      if (this.leds.instanceColor) this.leds.instanceColor.needsUpdate = true;
    }
    // the ride
    if (this.ride) {
      this.ride.left -= dt;
      this.place();
      const a = this.podAngle(this.ride.pod);
      if (!this.ride.top && Math.sin(a) > 0.995) {
        this.ride.top = true;
        this.passengers.say(0, "We're at the top! 52 metres.", 3.4);
        this.passengers.hush(4.5);
      }
      this.passengers.update(dt);
      for (const s of this.passengers.people) s?.update(dt, t, camQuat, camRight);
      if ((this.screen.t -= dt) <= 0) {
        this.screen.t = 0.5;
        this.drawScreen(this.cabin.position.y - CURB + POD.floor);
      }
      if (this.ride.left <= 0) this.ride = null;
    }
    for (const s of this.queue) s.update(dt, t, camQuat, camRight);
    // now and then someone in the queue reacts
    if ((this.qT -= dt) <= 0 && this.queue.length) {
      this.qT = 3 + Math.random() * 4;
      this.queue[Math.floor(Math.random() * this.queue.length)].emote((["note", "!", "heart", "zec", "up", "star"] as const)[Math.floor(Math.random() * 6)], 2.2);
    }
  }

  private drawScreen(alt: number) {
    const { g, tex } = this.screen;
    const w = 512,
      h = 256;
    g.fillStyle = "#0b0a10";
    g.fillRect(0, 0, w, h);
    g.fillStyle = "#f4b728";
    g.fillRect(0, 0, w, 44);
    g.fillStyle = "#0b0a10";
    g.font = `800 28px ${FONT}`;
    g.textBaseline = "middle";
    g.fillText("ⓩ ZEC FLYER", 16, 23);
    g.textAlign = "right";
    g.fillText(this.ride ? `${Math.max(0, Math.ceil(this.ride.left))} s` : "", w - 16, 23);
    g.textAlign = "left";
    g.fillStyle = "#ffffff";
    g.font = `800 64px ${FONT}`;
    g.fillText(`${alt.toFixed(0)} m`, 18, 102);
    g.fillStyle = "#8a86a0";
    g.font = `600 22px ${FONT}`;
    g.fillText("ALTITUDE", 22, 146);
    const p = Market.state.price;
    g.fillStyle = "#f4b728";
    g.font = `700 30px ${FONT}`;
    g.fillText(`BLOCK #${this.height?.toLocaleString("en-US") ?? "—"}`, 18, 192);
    g.fillStyle = p && p.usd_24h_change < 0 ? "#ff5a6a" : "#5cff9a";
    g.fillText(p ? `ZEC $${p.usd.toFixed(2)} ${p.usd_24h_change >= 0 ? "▲" : "▼"}${Math.abs(p.usd_24h_change).toFixed(1)}%` : "ZEC —", 18, 232);
    // the lap, as a ring
    const lap = this.ride ? 1 - this.ride.left / 90 : 0;
    g.strokeStyle = "#2a2834";
    g.lineWidth = 14;
    g.beginPath();
    g.arc(w - 92, 128, 56, 0, Math.PI * 2);
    g.stroke();
    g.strokeStyle = "#f4b728";
    g.beginPath();
    g.arc(w - 92, 128, 56, Math.PI / 2, Math.PI / 2 + lap * Math.PI * 2);
    g.stroke();
    tex.needsUpdate = true;
  }
}
