import * as THREE from "three";
import type { Tx } from "../../data/types";
import { KIND_COLOR } from "../../scene/snark";
import type { Rect } from "../types";
import { Boxes, GLOW, SOLID, voxObj } from "./batch";
import { beltTexture, canvasTex, GOLD, JP, makeCanvas, MONO, neonSign } from "./canvas";
import { AGV_STOP, BELT, DOCKS, PRESS, ROBOT, X1 } from "./layout";
import { agv, type Fleet, type Vehicle } from "./vehicles";
import { consoleModel, parcelTexture, pressModel, ramModel } from "./voxels";

/**
 * The line: every real block is stamped into a gold crate by the PROOF PRESS under the wall screen
 * (and every shielded transaction into a parcel), rides the conveyor along the back wall and down
 * the east side, is lifted by the robot onto the AGV, which drives it to a truck at the docks.
 */

export interface BlockInfo {
  height: number;
  txs: number;
  pool: string;
  size: number;
  fees: number | null;
  time: number;
}

export interface Item {
  mesh: THREE.Mesh;
  block: BlockInfo | null;
  tx: Tx | null;
  state: "queue" | "press" | "belt" | "robot" | "agv" | "truck";
  s: number;
  size: number;
}

const K = 1.6; // the press model's scale
const DIE_Y = (5 / 6) * K;
const RAM_UP = 3.95,
  CRATE = 1.0,
  PARCEL = 0.5;
const SPEED = 1.6;

/** Gold steel crate with the block's height and transaction count stencilled on every face. */
function crateTexture(b: BlockInfo) {
  const { c, g } = makeCanvas(256, 256);
  g.fillStyle = "#d9a21f";
  g.fillRect(0, 0, 256, 256);
  // ribs and corner plates
  g.fillStyle = "#b8861a";
  for (let x = 0; x < 256; x += 32) g.fillRect(x, 0, 6, 256);
  g.fillStyle = "#2a2420";
  g.fillRect(0, 0, 256, 14);
  g.fillRect(0, 242, 256, 14);
  g.fillRect(0, 0, 14, 256);
  g.fillRect(242, 0, 14, 256);
  // stencil
  g.fillStyle = "#1a1612";
  g.textAlign = "center";
  g.font = '900 30px "JetBrains Mono", monospace';
  g.fillText("BLOCK", 128, 58);
  g.font = '900 44px "JetBrains Mono", monospace';
  g.fillText(`#${b.height.toLocaleString("en-US")}`, 128, 106, 220);
  g.fillStyle = "#f2efe6";
  g.fillRect(34, 128, 188, 52);
  g.fillStyle = "#1a1612";
  g.font = '900 36px "JetBrains Mono", monospace';
  g.fillText(`${b.txs} TX`, 128, 166);
  g.font = '800 22px "JetBrains Mono", monospace';
  g.fillText(b.pool.toUpperCase().slice(0, 16), 128, 214, 220);
  const t = canvasTex(c);
  t.anisotropy = 8;
  return t;
}

/** Truck trailer side: the livery. */
function liveryTexture(n: number) {
  const { c, g } = makeCanvas(1024, 256);
  g.fillStyle = "#e8e6e0";
  g.fillRect(0, 0, 1024, 256);
  g.fillStyle = "#14131a";
  g.fillRect(0, 170, 1024, 86);
  g.fillStyle = GOLD;
  g.fillRect(0, 160, 1024, 14);
  g.font = '900 92px "JetBrains Mono", monospace';
  g.fillStyle = "#14131a";
  g.fillText("ⓩ PROOF FREIGHT", 40, 120);
  g.font = '800 40px "JetBrains Mono", monospace';
  g.fillStyle = GOLD;
  g.fillText(`FACTORY → MEMPOOL · UNIT ${String(n).padStart(2, "0")}`, 40, 228);
  g.fillStyle = "rgba(0,0,0,0.08)";
  for (let x = 0; x < 1024; x += 64) g.fillRect(x, 0, 3, 160);
  return canvasTex(c);
}

export function buildLine(root: THREE.Object3D, ground: Rect[], fleet: Fleet) {
  const items: Item[] = [];
  const queue: Item[] = [];
  const pickables: THREE.Object3D[] = [];

  // ---- the press -----------------------------------------------------------------------------
  const press = voxObj(pressModel(), K);
  press.position.copy(PRESS);
  root.add(press);
  const ram = voxObj(ramModel(), K);
  ram.position.set(PRESS.x, RAM_UP, PRESS.z);
  root.add(ram);
  ground.push([PRESS.x - 2.4, PRESS.z - 2.2, PRESS.x + 2.4, PRESS.z + 2.2]);
  const cons = voxObj(consoleModel());
  cons.position.set(PRESS.x - 3.6, 0, PRESS.z + 2.4);
  cons.rotation.y = 0.4;
  root.add(cons);
  ground.push([PRESS.x - 4.4, PRESS.z + 1.8, PRESS.x - 2.8, PRESS.z + 3]);
  const sign = neonSign([{ text: "PROOF PRESS · 証明プレス", font: JP(76, 900) }, { text: "1 BLOCK = 1 CRATE", font: MONO(46, 800), color: "#e8e0c8" }], { color: GOLD, w: 5.2, h: 1.2 });
  sign.position.set(PRESS.x, 6.45, PRESS.z + 1.95);
  root.add(sign);
  const pressLight = new THREE.PointLight(GOLD, 0, 16, 1.3);
  pressLight.position.set(PRESS.x, 3.2, PRESS.z + 3.5);
  root.add(pressLight);

  // sparks when the ram hits
  const SPARKS = 60;
  const sparks = new THREE.InstancedMesh(new THREE.BoxGeometry(0.06, 0.06, 0.06), new THREE.MeshBasicMaterial({ color: new THREE.Color(GOLD).multiplyScalar(4), toneMapped: false }), SPARKS);
  const sv = Array.from({ length: SPARKS }, () => new THREE.Vector3());
  const sp = Array.from({ length: SPARKS }, () => new THREE.Vector3());
  let sparkT = 9;
  sparks.frustumCulled = false;
  const hide = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < SPARKS; i++) sparks.setMatrixAt(i, hide);
  root.add(sparks);

  // ---- the conveyor --------------------------------------------------------------------------
  const segLen = BELT.slice(1).map((p, i) => p.distanceTo(BELT[i]));
  const total = segLen.reduce((a, b) => a + b, 0);
  const beltTex = beltTexture();
  const beltMat = new THREE.MeshStandardMaterial({ map: beltTex, roughness: 0.85 });
  const st = new Boxes();
  const glow = new Boxes();
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < BELT.length - 1; i++) {
    const a = BELT[i],
      b = BELT[i + 1];
    const len = segLen[i];
    const dir = new THREE.Vector3().subVectors(b, a).normalize();
    const side = new THREE.Vector3().crossVectors(dir, up).normalize();
    // belt: a strip whose v runs along the travel
    const g = new THREE.PlaneGeometry(1.2, len);
    const uv = g.getAttribute("uv") as THREE.BufferAttribute;
    for (let k = 0; k < uv.count; k++) uv.setY(k, uv.getY(k) * (len / 0.9));
    const belt = new THREE.Mesh(g, beltMat);
    // plane's +y → -dir (so the chevrons, drawn down the canvas, point along the travel)
    const m = new THREE.Matrix4().makeBasis(side.clone().negate(), dir.clone().negate(), new THREE.Vector3().crossVectors(side.clone().negate(), dir.clone().negate()));
    belt.quaternion.setFromRotationMatrix(m);
    belt.position.addVectors(a, b).multiplyScalar(0.5).add(new THREE.Vector3(0, 0.01, 0));
    root.add(belt);
    // frame: side rails with hazard stripes, the bed, legs to the floor
    for (const s of [-1, 1]) {
      const o = side.clone().multiplyScalar(s * 0.68);
      st.beam("#26252d", a.clone().add(o).add(new THREE.Vector3(0, -0.1, 0)), b.clone().add(o).add(new THREE.Vector3(0, -0.1, 0)), 0.12, 0.3);
      st.beam(GOLD, a.clone().add(o).add(new THREE.Vector3(0, 0.12, 0)), b.clone().add(o).add(new THREE.Vector3(0, 0.12, 0)), 0.1, 0.1);
    }
    st.beam("#3a3944", a.clone().add(new THREE.Vector3(0, -0.22, 0)), b.clone().add(new THREE.Vector3(0, -0.22, 0)), 0.2, 1.3);
    const legs = Math.max(1, Math.floor(len / 3));
    for (let k = 0; k <= legs; k++) {
      const p = a.clone().lerp(b, k / legs);
      const h = p.y - 0.3;
      if (h < 0.2) continue;
      for (const s of [-1, 1]) {
        const o = side.clone().multiplyScalar(s * 0.55);
        st.add("#3a3944", 0.12, h, 0.12, p.x + o.x, 0, p.z + o.z);
      }
      if (h > 2.5) {
        st.beam("#3a3944", p.clone().add(side.clone().multiplyScalar(-0.55)).setY(1.2), p.clone().add(side.clone().multiplyScalar(0.55)).setY(h - 0.2), 0.06);
        // safety net under the raised belt
        st.add("#4a4855", 1.5, 0.04, Math.min(3, len), p.x, h - 0.45, p.z, Math.atan2(dir.x, dir.z));
      }
      if (h < 2.3) {
        const r = 0.8;
        ground.push([p.x - r, p.z - r, p.x + r, p.z + r]);
      } else ground.push([p.x - 0.7, p.z - 0.15, p.x + 0.7, p.z + 0.15].map((v, j) => (Math.abs(dir.x) > 0.5 ? [p.x - 0.15, p.z - 0.7, p.x + 0.15, p.z + 0.7][j] : v)) as Rect);
    }
    // a light strip along the underside
    glow.beam(new THREE.Color(GOLD).multiplyScalar(1.6), a.clone().add(new THREE.Vector3(0, -0.34, 0)), b.clone().add(new THREE.Vector3(0, -0.34, 0)), 0.06, 0.06);
  }
  // low parts of the belt block the way (the raised ones you walk under)
  ground.push([BELT[0].x - 0.2, BELT[0].z - 0.8, 12.5, BELT[0].z + 0.8]);
  ground.push([BELT[5].x - 0.8, -29.6, BELT[5].x + 0.8, BELT[6].z + 0.3]);
  // the corner turntable over the east side
  const turn = new THREE.CylinderGeometry(0.95, 0.95, 0.2, 20);
  turn.translate(BELT[3].x, BELT[3].y - 0.12, BELT[3].z);
  st.geo(turn, "#3a3944");
  // sign over the belt where it comes down
  const bs = neonSign([{ text: "OUTBOUND · 出荷ライン", font: JP(70, 900) }], { color: "#4ad0ff", w: 4.4, h: 0.7 });
  bs.position.set(BELT[4].x, 7.4, -40);
  bs.rotation.y = -Math.PI / 2;
  root.add(bs);
  const bs2 = bs.clone();
  bs2.rotation.y = Math.PI / 2;
  root.add(bs2);

  /** Position on the belt at distance s (and its direction). */
  const at = (s: number, out: THREE.Vector3, dir?: THREE.Vector3) => {
    let d = THREE.MathUtils.clamp(s, 0, total);
    for (let i = 0; i < segLen.length; i++) {
      if (d <= segLen[i] || i === segLen.length - 1) {
        out.lerpVectors(BELT[i], BELT[i + 1], Math.min(1, d / segLen[i]));
        dir?.subVectors(BELT[i + 1], BELT[i]).normalize();
        return out;
      }
      d -= segLen[i];
    }
    return out;
  };

  // ---- robot arm -----------------------------------------------------------------------------
  const robot = new THREE.Group();
  robot.position.copy(ROBOT);
  root.add(robot);
  const orange = new THREE.MeshStandardMaterial({ color: "#ff7a1a", roughness: 0.45, metalness: 0.3 });
  const darkM = new THREE.MeshStandardMaterial({ color: "#26252d", roughness: 0.5, metalness: 0.5 });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.65, 0.9, 16), darkM);
  base.position.y = 0.45;
  robot.add(base);
  const turret = new THREE.Group();
  turret.position.y = 0.9;
  robot.add(turret);
  const tb = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.45, 16), orange);
  tb.position.y = 0.22;
  turret.add(tb);
  const SH = 0.75,
    L1 = 1.55,
    L2 = 1.45;
  const shoulder = new THREE.Group();
  shoulder.position.y = SH;
  turret.add(shoulder);
  const arm1 = new THREE.Mesh(new THREE.BoxGeometry(0.34, L1, 0.4), orange);
  arm1.position.y = L1 / 2;
  shoulder.add(arm1);
  const j1 = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.5, 14), darkM);
  j1.rotation.x = Math.PI / 2;
  shoulder.add(j1);
  const elbow = new THREE.Group();
  elbow.position.y = L1;
  shoulder.add(elbow);
  const j2 = j1.clone();
  elbow.add(j2);
  const arm2 = new THREE.Mesh(new THREE.BoxGeometry(0.26, L2, 0.3), orange);
  arm2.position.y = L2 / 2;
  elbow.add(arm2);
  const wrist = new THREE.Group();
  wrist.position.y = L2;
  elbow.add(wrist);
  const pad = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.12, 0.6), darkM);
  wrist.add(pad);
  const padGlow = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.03, 0.62), new THREE.MeshBasicMaterial({ color: new THREE.Color("#4ad0ff").multiplyScalar(2.5), toneMapped: false }));
  padGlow.position.y = -0.07;
  wrist.add(padGlow);
  // the arm reaches (yaw, r, y) in the robot's frame; two-link IK in the vertical plane
  const arm = { yaw: Math.PI, r: 1.6, y: 3.0 };
  function pose() {
    turret.rotation.y = arm.yaw;
    const dx = arm.r,
      dy = arm.y + 0.12 - (0.9 + SH);
    const d = Math.min(L1 + L2 - 0.01, Math.hypot(dx, dy));
    const a2 = Math.acos(THREE.MathUtils.clamp((L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2), -1, 1));
    const a1 = Math.atan2(dx, dy) - Math.asin(THREE.MathUtils.clamp((L2 * Math.sin(a2)) / d, -1, 1));
    // shoulder tilts from vertical toward +x (local), elbow bends back
    shoulder.rotation.z = -a1;
    elbow.rotation.z = -(Math.PI - a2);
    wrist.rotation.z = a1 + (Math.PI - a2);
  }
  pose();
  // fence and light curtain round the cell
  const FX0 = ROBOT.x - 1.3,
    FX1 = ROBOT.x + 4,
    FZ0 = ROBOT.z - 2.6,
    FZ1 = ROBOT.z + 2.6;
  for (const [x0, z0, x1] of [
    [FX0, FZ0, FX1, FZ0],
    [FX0, FZ1, FX1 - 2.2, FZ1],
  ] as [number, number, number, number][]) {
    for (let x = x0; x <= x1 + 0.01; x += 1.3) st.add("#e0a820", 0.08, 1.6, 0.08, x, 0, z0);
    st.add("#e0a820", x1 - x0, 0.06, 0.06, (x0 + x1) / 2, 1.55, z0);
    st.add("#e0a820", x1 - x0, 0.06, 0.06, (x0 + x1) / 2, 0.8, z0);
    glow.add(new THREE.Color("#ff2a2a").multiplyScalar(1.5), x1 - x0, 0.015, 0.015, (x0 + x1) / 2, 1.2, z0);
    ground.push([x0, z0 - 0.15, x1, z0 + 0.15]);
  }
  ground.push([ROBOT.x - 0.8, ROBOT.z - 0.8, ROBOT.x + 0.8, ROBOT.z + 0.8]);
  const rs = neonSign([{ text: "ROBOT CELL · R-01", font: MONO(64, 900) }], { color: "#ff7a1a", w: 2.8, h: 0.5 });
  rs.position.set(ROBOT.x + 1.2, 2.5, FZ1 + 0.05);
  root.add(rs);
  const robotLight = new THREE.PointLight("#ffd0a0", 18, 14, 1.4);
  robotLight.position.set(ROBOT.x + 1, 5, ROBOT.z + 1);
  root.add(robotLight);

  root.add(st.mesh(SOLID), glow.mesh(GLOW));

  // ---- the AGV and the trucks ----------------------------------------------------------------
  const agvM = agv();
  const agvV: Vehicle = fleet.add("AGV-01", "agv", agvM, 0, [], 1.4);
  agvV.scripted = true;
  agvV.pos.copy(AGV_STOP);
  agvV.heading = Math.PI / 2;
  agvM.g.rotation.y = agvV.heading;

  interface Truck {
    g: THREE.Group;
    dock: number;
    load: Item[];
    x: number;
    state: "docked" | "leaving" | "away" | "arriving";
    t: number;
  }
  const trucks: Truck[] = [];
  const YARD = -1.25;
  function truckModel(n: number) {
    const g = new THREE.Group();
    const b = new Boxes();
    // trailer: floor level with the dock, box body, open rear doors folded back
    const L = 12,
      W = 2.5,
      H = 3.0;
    b.add("#3a3944", W, 0.3, L, 0, -0.3, L / 2 + 0.3);
    b.add("#dcdad4", 0.06, H, L, -W / 2, 0, L / 2 + 0.3);
    b.add("#dcdad4", 0.06, H, L, W / 2, 0, L / 2 + 0.3);
    b.add("#dcdad4", W, 0.08, L, 0, H, L / 2 + 0.3);
    b.add("#dcdad4", W, H, 0.06, 0, 0, L + 0.3);
    b.add("#8a6a44", W - 0.1, 0.03, L, 0, 0, L / 2 + 0.3);
    b.add("#c8c6c0", 0.04, H, 1.2, -W / 2 - 0.6, 0, 0.3, Math.PI / 2);
    b.add("#c8c6c0", 0.04, H, 1.2, W / 2 + 0.6, 0, 0.3, -Math.PI / 2);
    for (let z = 1; z < L; z += 1.5) {
      b.add("#a8a6a0", 0.04, H, 0.06, -W / 2 + 0.05, 0, z);
      b.add("#a8a6a0", 0.04, H, 0.06, W / 2 - 0.05, 0, z);
    }
    // under-run, wheels down on the yard
    for (const z of [L - 2.6, L - 1.4])
      for (const x of [-1.0, 1.0]) {
        const w = new THREE.CylinderGeometry(0.5, 0.5, 0.35, 14);
        w.rotateZ(Math.PI / 2);
        w.translate(x, YARD + 0.5, z);
        b.geo(w, "#16151a");
      }
    b.add("#26252d", W - 0.4, 0.8, L - 4, 0, YARD + 0.45, L / 2 - 0.5);
    // the tractor
    b.add("#2a3a6a", 2.5, 2.6, 2.6, 0, YARD + 0.9, L + 2.0);
    b.add("#121220", 2.3, 0.9, 0.05, 0, YARD + 2.4, L + 3.31);
    b.add("#2a3a6a", 2.5, 0.9, 1.0, 0, YARD + 0.9, L + 3.8);
    for (const z of [L + 1.2, L + 3.6])
      for (const x of [-1.1, 1.1]) {
        const w = new THREE.CylinderGeometry(0.5, 0.5, 0.35, 14);
        w.rotateZ(Math.PI / 2);
        w.translate(x, YARD + 0.5, z);
        b.geo(w, "#16151a");
      }
    const gl = new Boxes();
    gl.add(new THREE.Color("#ffb02a").multiplyScalar(2.4), W, 0.05, 0.05, 0, H - 0.05, 0.3);
    gl.add(new THREE.Color("#ff2a2a").multiplyScalar(2.6), 0.2, 0.1, 0.05, -1.0, -0.1, 0.26);
    gl.add(new THREE.Color("#ff2a2a").multiplyScalar(2.6), 0.2, 0.1, 0.05, 1.0, -0.1, 0.26);
    gl.add(new THREE.Color("#fff0d0").multiplyScalar(1.5), 0.3, 0.04, L - 1, 0, H - 0.06, L / 2 + 0.5);
    g.add(b.mesh(SOLID), gl.mesh(GLOW));
    const tex = liveryTexture(n);
    for (const s of [-1, 1]) {
      const side = new THREE.Mesh(new THREE.PlaneGeometry(L - 0.4, H - 0.2), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 }));
      side.position.set(s * (W / 2 + 0.04), H / 2, L / 2 + 0.3);
      side.rotation.y = (s * Math.PI) / 2;
      g.add(side);
    }
    // the trailer lies along +x from the dock
    const holder = new THREE.Group();
    g.rotation.y = Math.PI / 2;
    holder.add(g);
    return holder;
  }
  DOCKS.forEach((dz, i) => {
    const g = truckModel(i + 1);
    g.position.set(X1 + 0.1, 0, dz);
    root.add(g);
    trucks.push({ g, dock: i, load: [], x: 0, state: i === 2 ? "away" : "docked", t: i === 2 ? 4 : 0 });
  });
  /** Slot k inside a trailer (dock frame): rows of two across, two high, from the front wall back. */
  const slot = (tr: Truck, k: number, size: number) => {
    const deep = Math.floor(k / 4),
      across = k % 2,
      high = Math.floor(k / 2) % 2;
    return new THREE.Vector3(X1 + 11.4 - deep * 1.1 + tr.x, size / 2 + high * 1.02, DOCKS[tr.dock] + (across ? 0.6 : -0.6));
  };
  const CAP = 32;

  // ---- items ---------------------------------------------------------------------------------
  const crateGeo = new THREE.BoxGeometry(CRATE, CRATE, CRATE);
  const parcelGeo = new THREE.BoxGeometry(PARCEL, PARCEL, PARCEL);
  function make(block: BlockInfo | null, tx: Tx | null): Item {
    const tex = block ? crateTexture(block) : parcelTexture(tx!.txid, KIND_COLOR[tx!.kind]);
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: block ? 0.4 : 0.8, metalness: block ? 0.45 : 0, emissive: "#ffffff", emissiveMap: tex, emissiveIntensity: block ? 0.12 : 0.06 });
    const mesh = new THREE.Mesh(block ? crateGeo : parcelGeo, mat);
    const it: Item = { mesh, block, tx, state: "queue", s: 0, size: block ? CRATE : PARCEL };
    mesh.userData.item = it;
    root.add(mesh);
    pickables.push(mesh);
    items.push(it);
    return it;
  }
  function drop(it: Item) {
    root.remove(it.mesh);
    (it.mesh.material as THREE.MeshStandardMaterial).map?.dispose();
    (it.mesh.material as THREE.Material).dispose();
    pickables.splice(pickables.indexOf(it.mesh), 1);
    items.splice(items.indexOf(it), 1);
  }
  /** Into a docked truck (the fullest that still has room). */
  function load(it: Item) {
    const tr = trucks.filter((t) => t.state === "docked" && t.load.length < CAP).sort((a, b) => b.load.length - a.load.length)[0];
    if (!tr) return drop(it);
    it.state = "truck";
    tr.load.push(it);
    it.mesh.position.copy(slot(tr, tr.load.length - 1, it.size));
    it.mesh.rotation.set(0, 0, 0);
    if (tr.load.length >= CAP) {
      tr.state = "leaving";
      tr.t = 0;
    }
  }

  // ---- the press cycle -----------------------------------------------------------------------
  let pressT = 99;
  let current: Item | null = null;
  const tmp = new THREE.Vector3();
  const dir = new THREE.Vector3();
  let onStamp: ((it: Item) => void) | null = null;

  function feed(block: BlockInfo | null, tx: Tx | null, watched: boolean) {
    const it = make(block, tx);
    if (!watched) return load(it);
    it.mesh.visible = false;
    queue.push(it);
  }

  /** Put an item straight onto the belt at distance s (when the hall opens, the line is already busy). */
  function seed(block: BlockInfo | null, tx: Tx | null, s: number) {
    const it = make(block, tx);
    it.state = "belt";
    it.s = s;
  }
  function seedTruck(block: BlockInfo | null, tx: Tx | null) {
    load(make(block, tx));
  }

  // ---- the robot's cycle and the AGV's runs --------------------------------------------------
  let robotPhase: "idle" | "reach" | "grip" | "lift" | "swing" | "lower" | "release" | "back" = "idle";
  let robotT = 0;
  let held: Item | null = null;
  const from = { yaw: Math.PI, r: 1.6, y: 3.0 };
  let to = { ...from };
  const go = (p: typeof robotPhase, target: typeof to) => {
    robotPhase = p;
    robotT = 0;
    Object.assign(from, arm);
    to = target;
  };
  const BELT_END = BELT[BELT.length - 1];
  const reachBelt = Math.hypot(BELT_END.x - ROBOT.x, BELT_END.z - ROBOT.z);
  const reachAgv = Math.hypot(AGV_STOP.x - ROBOT.x, AGV_STOP.z - ROBOT.z);
  const onDeck: Item[] = [];
  let agvState: "wait" | "out" | "unload" | "back" = "wait";
  let agvWait = 0;
  let agvPath: THREE.Vector3[] = [];
  let agvTruck: Truck | null = null;
  let agvUnload = 0;

  let agvJam = 0;
  function agvDrive(dt: number) {
    const v = agvV;
    const target = agvPath[0];
    if (!target) return true;
    tmp.subVectors(target, v.pos).setY(0);
    const d = tmp.length();
    // wait for anyone in front
    const fwd = new THREE.Vector3(Math.sin(v.heading), 0, Math.cos(v.heading));
    let blocked = false;
    for (const o of fleet.vehicles) {
      if (o === v) continue;
      const rel = new THREE.Vector3().subVectors(o.pos, v.pos).setY(0);
      const a = rel.dot(fwd);
      if (a > 0.4 && a < 2.8 && Math.abs(rel.x * fwd.z - rel.z * fwd.x) < 1.2) blocked = true;
    }
    agvJam = blocked ? agvJam + dt : 0;
    if (agvJam > 3.5) blocked = false;
    const want = blocked ? 0 : d < 1.5 ? 0.6 : 2.0;
    v.speed += THREE.MathUtils.clamp(want - v.speed, -3 * dt, 1.2 * dt);
    const h = Math.atan2(tmp.x, tmp.z);
    let dh = h - v.heading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    // omnidirectional (mecanum wheels): it drives backwards rather than turning round
    if (Math.abs(dh) > Math.PI / 2) dh -= Math.sign(dh) * Math.PI;
    if (d > 0.5 && Math.abs(dh) > 0.02) v.heading += THREE.MathUtils.clamp(dh, -1.2 * dt, 1.2 * dt);
    v.pos.addScaledVector(tmp.normalize(), Math.min(d, v.speed * dt));
    agvM.g.rotation.y = v.heading;
    if (d < 0.08) agvPath.shift();
    v.busy = v.speed > 0.05;
    return agvPath.length === 0;
  }

  function update(dt: number, t: number) {
    // press: down fast, hold, up; a crate appears on the die and is pushed onto the belt
    // the press waits while the start of the belt is full; a long queue ships the parcels directly
    while (queue.length > 12) {
      const it = queue.find((i) => !i.block) ?? queue[0];
      queue.splice(queue.indexOf(it), 1);
      it.mesh.visible = true;
      load(it);
    }
    const tail = items.reduce((m, i) => (i.state === "belt" ? Math.min(m, i.s) : m), Infinity);
    if (!current && queue.length && pressT > 2.3 && tail > 2) {
      current = queue.shift()!;
      current.state = "press";
      pressT = 0;
    }
    const prev = pressT;
    pressT += dt;
    const p = pressT;
    const DOWN = DIE_Y + (current?.size ?? CRATE) + 0.02;
    let ry = RAM_UP;
    if (p < 0.35) ry = RAM_UP - (p / 0.35) ** 2 * (RAM_UP - DOWN);
    else if (p < 0.65) ry = DOWN;
    else if (p < 1.6) ry = DOWN + ((p - 0.65) / 0.95) * (RAM_UP - DOWN);
    ram.position.y = ry;
    pressLight.intensity = p >= 0.33 && p < 1.6 ? 90 * Math.max(0, 1 - (p - 0.33) / 1.2) : 0;
    if (prev < 0.35 && p >= 0.35) {
      sparkT = 0;
      for (let i = 0; i < SPARKS; i++) {
        const a = Math.random() * Math.PI * 2;
        sp[i].set(PRESS.x + Math.cos(a) * 0.6, DIE_Y + 0.2, PRESS.z + Math.sin(a) * 0.6);
        sv[i].set(Math.cos(a) * (1 + Math.random() * 3), 1.5 + Math.random() * 3.5, Math.sin(a) * (1 + Math.random() * 3));
      }
      if (current) onStamp?.(current);
    }
    if (sparkT < 1.4) {
      sparkT += dt;
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      for (let i = 0; i < SPARKS; i++) {
        sv[i].y -= 9.8 * dt;
        sp[i].addScaledVector(sv[i], dt);
        if (sp[i].y < 0.03) {
          sp[i].y = 0.03;
          sv[i].multiplyScalar(0.3);
        }
        const s = Math.max(0, 1 - sparkT / 1.4);
        m.compose(sp[i], q, tmp.set(s, s, s));
        sparks.setMatrixAt(i, m);
      }
      sparks.instanceMatrix.needsUpdate = true;
    }
    if (current) {
      const m = current.mesh;
      if (p >= 0.35) m.visible = true;
      m.scale.setScalar(p < 0.5 ? 0.8 + (p - 0.35) * 1.3 : 1);
      m.position.set(PRESS.x, DIE_Y + current.size / 2, PRESS.z);
      if (p > 1.6) {
        // pushed sideways off the die onto the belt
        const k = Math.min(1, (p - 1.6) / 0.6);
        m.position.x = PRESS.x + k * (BELT[0].x + 0.4 - PRESS.x);
        m.position.y = THREE.MathUtils.lerp(DIE_Y, BELT[0].y, k) + current.size / 2;
        if (k >= 1) {
          current.state = "belt";
          current.s = 0.4;
          current = null;
        }
      }
    }

    // belt: items ride at SPEED, queue up behind the one at the end
    const onBelt = items.filter((i) => i.state === "belt").sort((a, b) => b.s - a.s);
    let limit = total - 0.55;
    for (const it of onBelt) {
      it.s = Math.min(it.s + SPEED * dt, limit);
      limit = it.s - it.size / 2 - 0.25 - 0.3;
      at(it.s, tmp, dir);
      it.mesh.position.copy(tmp).add(new THREE.Vector3(0, it.size / 2 + 0.02, 0));
      it.mesh.rotation.set(0, Math.atan2(dir.x, dir.z), 0);
      // tilt on the ramps
      it.mesh.rotation.x = 0;
      it.mesh.rotateX(-Math.asin(THREE.MathUtils.clamp(dir.y, -1, 1)));
    }
    beltTex.offset.y -= (SPEED * dt) / 0.9;

    // robot
    robotT += dt;
    const k = (dur: number) => Math.min(1, robotT / dur);
    const ease = (x: number) => x * x * (3 - 2 * x);
    const lerpArm = (dur: number) => {
      const e = ease(k(dur));
      let dy = to.yaw - from.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      arm.yaw = from.yaw + dy * e;
      arm.r = THREE.MathUtils.lerp(from.r, to.r, e);
      arm.y = THREE.MathUtils.lerp(from.y, to.y, e);
      return k(dur) >= 1;
    };
    const yawBelt = Math.PI; // the belt end is at -x of the robot; the turret's local +x is its reach
    const yawAgv = 0;
    const endItem = onBelt[0] && onBelt[0].s >= total - 0.56 ? onBelt[0] : null;
    switch (robotPhase) {
      case "idle":
        lerpArm(1);
        if (endItem && agvState === "wait" && onDeck.length < 6) go("reach", { yaw: yawBelt, r: reachBelt, y: BELT_END.y + endItem.size + 0.06 });
        else if (k(1) >= 1 && arm.y !== 3.2) go("idle", { yaw: yawBelt, r: 1.6, y: 3.2 });
        break;
      case "reach":
        if (lerpArm(1.0)) {
          held = endItem;
          if (held) held.state = "robot";
          go("grip", { ...to });
        }
        break;
      case "grip":
        if (k(0.25) >= 1) go("lift", { yaw: yawBelt, r: reachBelt - 0.3, y: 3.4 });
        break;
      case "lift":
        if (lerpArm(0.7)) go("swing", { yaw: yawAgv, r: reachAgv, y: 3.4 });
        break;
      case "swing":
        if (lerpArm(1.2)) go("lower", { yaw: yawAgv, r: reachAgv, y: 0.42 + (held?.size ?? 0.5) + 0.06 + Math.floor(onDeck.length / 1) * 0 });
        break;
      case "lower":
        if (lerpArm(0.8)) go("release", { ...to });
        break;
      case "release":
        if (k(0.25) >= 1) {
          if (held) {
            held.state = "agv";
            onDeck.push(held);
            agvWait = held.block ? 0.6 : Math.max(agvWait, 0);
          }
          held = null;
          go("back", { yaw: yawBelt, r: 1.6, y: 3.2 });
        }
        break;
      case "back":
        if (lerpArm(1.0)) go("idle", { ...to });
        break;
    }
    pose();
    if (held) {
      wrist.getWorldPosition(tmp);
      held.mesh.position.copy(tmp).add(new THREE.Vector3(0, -0.07 - held.size / 2, 0));
      held.mesh.rotation.set(0, arm.yaw, 0);
    }
    padGlow.visible = !!held;

    // AGV: leaves with a block crate at once, with parcels when it has four (or has waited)
    const deckLayout = () =>
      onDeck.forEach((it, i) => {
        const lx = onDeck.length > 1 ? (i % 2 ? 0.27 : -0.27) : 0,
          lz = onDeck.length > 2 ? (i < 2 ? -0.3 : 0.3) : 0;
        const o = new THREE.Vector3(lx, 0.42 + it.size / 2 + (i >= 4 ? it.size : 0), lz).applyAxisAngle(up, agvV.heading);
        it.mesh.position.copy(agvV.pos).add(o);
        it.mesh.rotation.set(0, agvV.heading, 0);
      });
    if (agvState === "wait") {
      if (onDeck.length) agvWait += dt;
      const go2 = onDeck.some((i) => i.block) ? agvWait > 1.2 : onDeck.length >= 3 || agvWait > 12;
      if (onDeck.length && go2 && (robotPhase === "idle" || robotPhase === "back")) {
        agvTruck = trucks.filter((t) => t.state === "docked" && t.load.length < CAP).sort((a, b) => a.load.length - b.load.length)[0] ?? null;
        if (agvTruck) {
          const dz = DOCKS[agvTruck.dock];
          agvPath = [new THREE.Vector3(55.5, 0, AGV_STOP.z), new THREE.Vector3(55.5, 0, dz), new THREE.Vector3(X1 - 1.6, 0, dz)];
          agvState = "out";
        }
      }
    } else if (agvState === "out") {
      if (agvDrive(dt)) {
        agvState = "unload";
        agvUnload = 0;
      }
    } else if (agvState === "unload") {
      agvUnload += dt;
      if (agvUnload > 0.8 && onDeck.length) {
        const it = onDeck.shift()!;
        if (agvTruck && agvTruck.state === "docked") {
          it.state = "truck";
          agvTruck.load.push(it);
          it.mesh.position.copy(slot(agvTruck, agvTruck.load.length - 1, it.size));
          it.mesh.rotation.set(0, 0, 0);
          if (agvTruck.load.length >= CAP) {
            agvTruck.state = "leaving";
            agvTruck.t = 0;
          }
        } else drop(it);
        agvUnload = 0;
      }
      if (!onDeck.length && agvUnload > 0.6) {
        const dz = agvTruck ? DOCKS[agvTruck.dock] : AGV_STOP.z;
        agvPath = [new THREE.Vector3(55.5, 0, dz), new THREE.Vector3(55.5, 0, AGV_STOP.z), AGV_STOP.clone(), AGV_STOP.clone().add(new THREE.Vector3(0, 0, 0.001))];
        agvState = "back";
      }
    } else if (agvState === "back") {
      if (agvDrive(dt)) {
        agvState = "wait";
        agvWait = 0;
      }
    }
    // the AGV faces +x while it waits for the robot
    if (agvState === "wait") {
      let dh = Math.PI / 2 - agvV.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      agvV.heading += THREE.MathUtils.clamp(dh, -1.5 * dt, 1.5 * dt);
      agvM.g.rotation.y = agvV.heading;
      agvV.busy = false;
    }
    deckLayout();

    // trucks: leave when full, a new one backs in
    for (const tr of trucks) {
      tr.t += dt;
      if (tr.state === "leaving") {
        tr.x += dt * Math.min(6, tr.t * 1.2);
        if (tr.x > 40) {
          for (const it of tr.load) drop(it);
          tr.load = [];
          tr.state = "away";
          tr.t = 0;
        }
      } else if (tr.state === "away" && tr.t > 10) {
        tr.state = "arriving";
        tr.x = 30;
        tr.t = 0;
      } else if (tr.state === "arriving") {
        tr.x = Math.max(0, tr.x - dt * Math.max(0.6, Math.min(5, tr.x * 0.5)));
        if (tr.x <= 0) tr.state = "docked";
      }
      tr.g.position.x = X1 + 0.1 + tr.x;
      tr.g.visible = tr.state !== "away";
      for (const [k, it] of tr.load.entries()) it.mesh.position.copy(slot(tr, k, it.size));
    }
    void t;
  }

  return {
    items,
    pickables,
    feed,
    seed,
    seedTruck,
    update,
    total,
    agv: agvV,
    set onStamp(fn: ((it: Item) => void) | null) {
      onStamp = fn;
    },
    get busy() {
      return queue.length + (current ? 1 : 0);
    },
    robotAt: ROBOT,
    debug: () => `robot ${robotPhase} agv ${agvState} deck ${onDeck.length} path ${agvPath.length}`,
    /** What the AGV is doing, for the control room's line monitor. */
    status: () => {
      const dock = agvTruck ? `D${agvTruck.dock + 1}` : "";
      return agvState === "wait" ? (onDeck.length ? `AGV LOADING · ${onDeck.length} ON DECK` : "AGV WAITING FOR R-01") : agvState === "out" ? `AGV TO ${dock}` : agvState === "unload" ? `UNLOADING AT ${dock}` : "AGV RETURNING";
    },
  };
}

export type Line = ReturnType<typeof buildLine>;
