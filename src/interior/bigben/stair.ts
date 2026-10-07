import * as THREE from "three";
import type { Rect } from "../types";
import { A0, BBKit, canvasTex, DA, DOOR_A, DOOR_HALF, LEVELS, LY, NEWEL, PER_TURN, RISE, SC, SERIF, SHAFT_TOP, SR, STEP_AT, TOP_STEP, Y0, type Zone } from "./kit";

/**
 * The spiral stair: 382 stone steps winding clockwise round a newel in the tower's corner well,
 * from the tower foot to the Ayrton Light (the belfry is the 334th). Lancet slits light it on the
 * outer side, a brass rail follows the wall, the step count is painted every 25 steps, and a door
 * opens onto each landing. Walking it: the ground under you follows the helix (the turn you are on
 * is the one nearest the height you stood at), the well's wall is a ring of colliders that opens at
 * the landing doors only when you stand level with them.
 */

const TAU = Math.PI * 2;
const norm = (a: number) => ((a % TAU) + TAU) % TAU;
/** Doors: one per landing, plus the way in at the foot. */
const DOOR_YS = [Y0, LY.prison, LY.clock, LY.dials, LY.belfry, LY.ayrton];

export function buildStair(k: BBKit) {
  const z: Zone = "stair";
  const g = k.groups.stair;

  // ---- the steps: one wedge, instanced ----------------------------------------------------------
  const s = new THREE.Shape();
  const r0 = NEWEL - 0.02,
    r1 = SR * Math.cos(DA / 2) - 0.02;
  const da = DA + 0.004;
  s.moveTo(r0, 0);
  for (let i = 0; i <= 6; i++) s.lineTo(Math.cos((da * i) / 6) * r1, Math.sin((da * i) / 6) * r1);
  s.lineTo(Math.cos(da) * r0, Math.sin(da) * r0);
  s.lineTo(r0, 0);
  // extruded 0.2 down from the tread; a darker nosing strip on its leading edge
  const tread = new THREE.ExtrudeGeometry(s, { depth: 0.24, bevelEnabled: false });
  tread.rotateX(Math.PI / 2); // shape (x, y) -> (x, 0, y); extrusion goes down
  const stepMat = new THREE.MeshStandardMaterial({ color: "#c9b991", roughness: 0.8 });
  const steps = new THREE.InstancedMesh(tread, stepMat, TOP_STEP);
  const m = new THREE.Matrix4(),
    q = new THREE.Quaternion(),
    up = new THREE.Vector3(0, 1, 0);
  const worn = new THREE.Color();
  for (let i = 0; i < TOP_STEP; i++) {
    // step i covers angles [A0 - (i+1)DA, A0 - i DA]; rotation.y = θ maps angle a to a - θ
    const a = A0 - (i + 1) * DA;
    q.setFromAxisAngle(up, -a);
    m.compose(new THREE.Vector3(SC.x, Y0 + (i + 1) * RISE, SC.z), q, new THREE.Vector3(1, 1, 1));
    steps.setMatrixAt(i, m);
    worn.set(i % 2 ? "#cbbb93" : "#c3b289").multiplyScalar(0.94 + ((i * 37) % 11) / 100);
    steps.setColorAt(i, worn);
  }
  steps.instanceMatrix.needsUpdate = true;
  g.add(steps);

  // ---- the newel, the rail -------------------------------------------------------------------------
  k.cyl(z, k.stoneLt, NEWEL, SHAFT_TOP - Y0, SC.x, Y0, SC.z, 12);
  const pts: THREE.Vector3[] = [];
  const RR = SR - 0.14;
  for (let i = 0; i <= TOP_STEP * 2; i++) {
    const sv = i / 2;
    const a = A0 - sv * DA;
    pts.push(new THREE.Vector3(SC.x + Math.cos(a) * RR, Y0 + sv * RISE + 1.02, SC.z + Math.sin(a) * RR));
  }
  const rail = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), TOP_STEP * 2, 0.035, 5, false);
  k.geo(z, k.brass, rail);
  // rail brackets every 6 steps
  for (let i = 0; i < TOP_STEP; i += 6) {
    const a = A0 - (i + 0.5) * DA;
    const y = Y0 + (i + 0.5) * RISE + 1.02;
    k.beam(z, k.brass, new THREE.Vector3(SC.x + Math.cos(a) * RR, y, SC.z + Math.sin(a) * RR), new THREE.Vector3(SC.x + Math.cos(a) * (SR - 0.02), y, SC.z + Math.sin(a) * (SR - 0.02)), 0.03, 0.03);
  }

  // ---- the well's wall: 24 facets, cut for the doors and the slit windows -------------------------
  const wallMat = new THREE.MeshStandardMaterial({ map: k.stoneTex.clone(), roughness: 0.92, side: THREE.DoubleSide });
  (wallMat.map as THREE.Texture).repeat.set(1, 1);
  (wallMat.map as THREE.Texture).needsUpdate = true;
  const pos: number[] = [],
    uvs: number[] = [];
  const quad = (a0: number, a1: number, y0: number, y1: number) => {
    const x0 = SC.x + Math.cos(a0) * SR,
      z0 = SC.z + Math.sin(a0) * SR,
      x1 = SC.x + Math.cos(a1) * SR,
      z1 = SC.z + Math.sin(a1) * SR;
    pos.push(x0, y0, z0, x1, y0, z1, x1, y1, z1, x0, y0, z0, x1, y1, z1, x0, y1, z0);
    const u0 = (a0 * SR) / 2.4,
      u1 = (a1 * SR) / 2.4,
      v0 = y0 / 2.4,
      v1 = y1 / 2.4;
    uvs.push(u0, v0, u1, v0, u1, v1, u0, v0, u1, v1, u0, v1);
  };
  const windows: [number, number, number][] = []; // column angle, y0, y1
  for (let c = 0; c < PER_TURN; c++) {
    const a1 = A0 - c * DA,
      a0 = a1 - DA;
    const mid = norm((a0 + a1) / 2);
    const holes: [number, number][] = [];
    // landing doors
    let dd = Math.abs(norm(mid - DOOR_A + Math.PI) - Math.PI);
    if (dd < DOOR_HALF + 0.05) for (const y of DOOR_YS) holes.push([y, y + 2.6]);
    // slits on the outer side (toward +x / +z: outside the tower)
    dd = Math.abs(norm(mid - Math.PI / 4 + Math.PI) - Math.PI);
    if (dd < 0.15) {
      // one per turn: the height of the step under this column, plus a metre
      const s0 = norm(A0 - mid) / DA;
      for (let t = 0; t < 17; t++) {
        const y = Y0 + (s0 + t * PER_TURN) * RISE + 1.0;
        if (y + 1.4 > SHAFT_TOP - 0.5) break;
        if (DOOR_YS.some((L) => y > L - 0.4 && y < L + 3.2) && t % 2) continue;
        holes.push([y, y + 1.4]);
        windows.push([mid, y, y + 1.4]);
      }
    }
    holes.sort((a, b) => a[0] - b[0]);
    let y = Y0 - 0.3;
    for (const [h0, h1] of holes) {
      if (h0 > y) quad(a0, a1, y, h0);
      y = Math.max(y, h1);
    }
    quad(a0, a1, y, SHAFT_TOP);
  }
  const wg = new THREE.BufferGeometry();
  wg.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  wg.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  wg.computeVertexNormals();
  g.add(new THREE.Mesh(wg, wallMat));
  // the slits: stone reveals, a leaded pane (open to the view), a sill
  for (const [a, y0, y1] of windows) {
    const cx = SC.x + Math.cos(a) * SR,
      cz = SC.z + Math.sin(a) * SR;
    const ox = Math.cos(a),
      oz = Math.sin(a);
    const tx = -oz,
      tz = ox;
    for (const side of [-1, 1]) {
      const jamb = new THREE.BoxGeometry(0.12, y1 - y0, 0.5);
      jamb.rotateY(-a + Math.PI / 2);
      jamb.translate(cx + tx * side * 0.36 + ox * 0.2, (y0 + y1) / 2, cz + tz * side * 0.36 + oz * 0.2);
      k.geo(z, k.stoneLt, jamb);
    }
    const sill = new THREE.BoxGeometry(0.7, 0.08, 0.45);
    sill.rotateY(-a + Math.PI / 2);
    sill.translate(cx + ox * 0.15, y0 - 0.04, cz + oz * 0.15);
    k.geo(z, k.stoneLt, sill);
    const head = sill.clone();
    head.translate(0, y1 - y0 + 0.08, 0);
    k.geo(z, k.stoneLt, head);
    // the leaded lights: a few cames over the opening
    for (let j = 1; j < 4; j++) {
      const bar = new THREE.BoxGeometry(0.64, 0.015, 0.015);
      bar.rotateY(-a + Math.PI / 2);
      bar.translate(cx + ox * 0.2, y0 + (j * (y1 - y0)) / 4, cz + oz * 0.2);
      k.geo(z, k.iron, bar);
    }
  }

  // ---- landings: a door frame, a step count, a sign --------------------------------------------
  const counts: number[] = [];
  for (let n = 25; n < TOP_STEP; n += 25) counts.push(n);
  counts.push(STEP_AT.prison, STEP_AT.clock, STEP_AT.dials, STEP_AT.belfry, STEP_AT.ayrton);
  const numMat = new Map<number, THREE.Material>();
  for (const n of counts) {
    // painted on the wall at the step's angle, just above it
    const a = A0 - (n - 0.5) * DA;
    const y = Y0 + n * RISE + 1.55;
    const tex = canvasTex(256, 128, (c, w, h) => {
      c.fillStyle = "rgba(0,0,0,0)";
      c.fillRect(0, 0, w, h);
      c.fillStyle = "#3a2c1c";
      c.font = `700 92px ${SERIF}`;
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.fillText(String(n), w / 2, h / 2 + 4);
    });
    let mat = numMat.get(n);
    if (!mat) numMat.set(n, (mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, color: "#ffffff" })));
    const p = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.25), mat);
    // skip the ones that would fall in a door or a slit
    const dd = Math.abs(norm(norm(a) - DOOR_A + Math.PI) - Math.PI);
    const r = SR - 0.02;
    const aa = dd < DOOR_HALF + 0.1 ? a - DOOR_HALF * 1.4 : a;
    p.position.set(SC.x + Math.cos(aa) * r, y, SC.z + Math.sin(aa) * r);
    p.lookAt(SC.x, y, SC.z);
    g.add(p);
  }
  for (const L of DOOR_YS) {
    // the door's frame: two jambs and a lintel, on the outside of the well
    for (const side of [-1, 1]) {
      const a = DOOR_A + side * (DOOR_HALF + 0.04);
      k.box(z, k.stoneLt, 0.3, 2.7, 0.3, SC.x + Math.cos(a) * (SR + 0.05), L - 0.02, SC.z + Math.sin(a) * (SR + 0.05));
    }
    const lint = new THREE.BoxGeometry(2 * Math.sin(DOOR_HALF + 0.1) * (SR + 0.1), 0.35, 0.36);
    lint.rotateY(-DOOR_A + Math.PI / 2);
    lint.translate(SC.x + Math.cos(DOOR_A) * Math.cos(DOOR_HALF) * (SR + 0.05), L + 2.6, SC.z + Math.sin(DOOR_A) * Math.cos(DOOR_HALF) * (SR + 0.05));
    k.geo(z, k.stoneLt, lint);
    // a small brass lamp over each door, inside the well
    k.box(z, k.warm, 0.12, 0.18, 0.12, SC.x + Math.cos(DOOR_A) * (SR - 0.1), L + 2.75, SC.z + Math.sin(DOOR_A) * (SR - 0.1));
  }
  // wall lamps up the well: a warm bracket every half turn
  for (let i = 6; i < TOP_STEP; i += 12) {
    const a = A0 - (i + 0.5) * DA;
    const y = Y0 + i * RISE + 2.2;
    k.box(z, k.warmSoft, 0.1, 0.16, 0.1, SC.x + Math.cos(a) * (SR - 0.07), y, SC.z + Math.sin(a) * (SR - 0.07));
    k.box(z, k.iron, 0.14, 0.03, 0.14, SC.x + Math.cos(a) * (SR - 0.07), y + 0.16, SC.z + Math.sin(a) * (SR - 0.07));
  }
  // a cap over the well
  k.cyl(z, k.stoneDk, SR + 0.05, 0.3, SC.x, SHAFT_TOP, SC.z, 24);
  // the well's floor at the foot
  k.cyl(z, k.stoneDk, SR, 0.05, SC.x, Y0 - 0.05, SC.z, 24);
}

/**
 * Walking the tower: one ground function for every floor and one collider list (the same array
 * for every floor index, rewritten in place when you move from one level to another).
 */
export class Climb {
  /** Height the walker stood at last frame. */
  last = 0;
  readonly rects: Rect[] = [];
  private key = "";
  private ring: Rect[] = [];
  private gap: Rect[] = [];

  constructor(
    private k: BBKit,
    private hallGround: (x: number, z: number) => number,
  ) {
    const post = (a: number, r: number, s: number): Rect => [SC.x + Math.cos(a) * r - s, SC.z + Math.sin(a) * r - s, SC.x + Math.cos(a) * r + s, SC.z + Math.sin(a) * r + s];
    for (let i = 0; i < 56; i++) {
      const a = (i / 56) * TAU;
      const dd = Math.abs(norm(a - DOOR_A + Math.PI) - Math.PI);
      (dd < DOOR_HALF ? this.gap : this.ring).push(post(a, SR + 0.1, 0.17));
    }
    this.ring.push([SC.x - NEWEL, SC.z - NEWEL, SC.x + NEWEL, SC.z + NEWEL]);
  }

  /** The level (zone) whose floor is nearest a height. */
  levelAt(y: number): Zone {
    if (y < Y0 + 0.6) return "hall";
    let best: Zone = "hall",
      d = Infinity;
    for (const l of LEVELS) {
      if (l.zone === "hall" || l.zone === "stair") continue;
      const dd = Math.abs(l.y - y);
      if (dd < d) (d = dd), (best = l.zone);
    }
    return best;
  }

  /** Arrived on a floor by the lift: stand at its height. */
  reset(y: number) {
    this.last = y;
    this.update();
  }

  inWell(x: number, z: number) {
    return Math.hypot(x - SC.x, z - SC.z) < SR + 0.02;
  }

  ground(x: number, z: number): number {
    let h: number;
    if (this.inWell(x, z)) {
      const a = Math.atan2(z - SC.z, x - SC.x);
      const s0 = norm(A0 - a) / DA; // [0, 24)
      let best: number | null = null;
      for (let t = -1; t <= Math.ceil(TOP_STEP / PER_TURN) + 1; t++) {
        const sv = s0 + t * PER_TURN;
        let y: number;
        if (sv < 0) {
          if (sv < -4) continue;
          y = Y0;
        } else if (sv >= TOP_STEP) y = Y0 + TOP_STEP * RISE;
        else y = Y0 + (Math.floor(sv) + 1) * RISE;
        if (best === null || Math.abs(y - this.last) < Math.abs(best - this.last)) best = y;
      }
      h = best ?? this.last;
    } else {
      const lv = this.levelAt(this.last);
      h = lv === "hall" ? this.hallGround(x, z) : LY[lv];
    }
    this.last = h;
    this.update();
    return h;
  }

  /** Rewrite the collider list for the level you are on (and open the well's door at a landing). */
  update() {
    const lv = this.levelAt(this.last);
    const open = DOOR_YS.some((L) => Math.abs(this.last - L) < 0.5);
    const key = `${lv}|${open}`;
    if (key === this.key) return;
    this.key = key;
    this.rects.length = 0;
    this.rects.push(...this.k.rects[lv], ...this.ring);
    if (!open) this.rects.push(...this.gap);
  }

  get zone(): Zone {
    return this.inWellZone ? "stair" : this.levelAt(this.last);
  }
  inWellZone = false;
}
