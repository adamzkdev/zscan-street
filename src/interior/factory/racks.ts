import * as THREE from "three";
import { hash } from "../../scene/voxel/model";
import { Boxes, GLASS, GLOW, SOLID, fanMaterial, ledMaterial } from "./batch";
import { canvasTex, makeCanvas, minerName, MONO, neonSign, POOL_COLORS, type MinerRow, type Miners } from "./canvas";
import { PODS, RACK, SEG_LEN, SEGS, SHELVES, SLOTS } from "./layout";
import type { Rect } from "../types";

/**
 * The ASIC pods: thousands of miners on open racks, two lines back to back round a closed hot
 * aisle, every pod given to a real mining pool (by its share of the last week's blocks). Racks,
 * units, fans and LEDs are instanced; fans turn and LEDs blink on the GPU.
 */

const UNIT = { w: 0.27, h: 0.38, d: 0.92 };
const PER_RACK = SHELVES * SLOTS;
/** The "everyone else" row and the unassigned colour. */
const OTHERS = 7,
  NONE = 8;

export interface Segment {
  pod: string;
  half: string;
  x: number;
  z0: number;
  z1: number;
  /** First rack index. */
  first: number;
  pool: number;
}
export interface PoolRow {
  index: number;
  name: string;
  color: string;
  share: number;
  miner: MinerRow | null;
  segments: number;
}

function unitAtlas() {
  // left half: the miner's front (housing, fan grille, PSU label); right half: its side
  const { c, g } = makeCanvas(256, 180);
  g.fillStyle = "#b9bcc4";
  g.fillRect(0, 0, 128, 180);
  g.fillStyle = "#d4d7de";
  g.fillRect(4, 4, 120, 4);
  g.fillStyle = "#8d9099";
  g.fillRect(0, 172, 128, 8);
  // control strip on top: ports, label
  g.fillStyle = "#24262c";
  g.fillRect(10, 14, 108, 30);
  g.fillStyle = "#3a8ad8";
  g.fillRect(14, 20, 16, 12);
  g.fillStyle = "#e8e8ec";
  g.fillRect(34, 20, 10, 10);
  g.fillRect(48, 20, 10, 10);
  g.font = '800 13px "JetBrains Mono", monospace';
  g.fillStyle = "#f4b728";
  g.fillText("Z15", 70, 34);
  // grille
  const cx = 64,
    cy = 108,
    r = 52;
  g.fillStyle = "#16171b";
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = "#6a6d76";
  g.lineWidth = 3;
  for (const rr of [r - 2, r * 0.7, r * 0.4]) {
    g.beginPath();
    g.arc(cx, cy, rr, 0, Math.PI * 2);
    g.stroke();
  }
  for (let a = 0; a < 4; a++) {
    g.beginPath();
    g.moveTo(cx + Math.cos(a * 0.785 * 2) * r, cy + Math.sin(a * 0.785 * 2) * r);
    g.lineTo(cx - Math.cos(a * 0.785 * 2) * r, cy - Math.sin(a * 0.785 * 2) * r);
    g.stroke();
  }
  g.fillStyle = "#2a2c33";
  g.beginPath();
  g.arc(cx, cy, 12, 0, Math.PI * 2);
  g.fill();
  // screws
  g.fillStyle = "#5d6068";
  for (const [x, y] of [
    [10, 56],
    [118, 56],
    [10, 166],
    [118, 166],
  ])
    g.fillRect(x - 2, y - 2, 4, 4);
  // side: ribbed aluminium with a sticker
  for (let x = 128; x < 256; x += 6) {
    g.fillStyle = (x / 6) % 2 ? "#9a9da6" : "#a9acb5";
    g.fillRect(x, 0, 6, 180);
  }
  g.fillStyle = "#e9e6dc";
  g.fillRect(150, 70, 60, 34);
  g.fillStyle = "#3a3c44";
  for (let i = 0; i < 4; i++) g.fillRect(156, 76 + i * 7, 30 + ((i * 13) % 18), 3);
  const t = canvasTex(c);
  t.anisotropy = 8;
  return t;
}

/** Four flat blades (8 triangles), in the x/y plane facing +z. */
function bladeGeometry(r: number) {
  const pos: number[] = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const w = 0.42;
    const p = (ang: number, rr: number) => [Math.cos(ang) * rr, Math.sin(ang) * rr, 0];
    const a0 = p(a - w, r * 0.22),
      a1 = p(a + w, r * 0.22),
      b0 = p(a - w * 0.6 + 0.25, r),
      b1 = p(a + w * 0.9 + 0.25, r);
    pos.push(...a0, ...b0, ...b1, ...a0, ...b1, ...a1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

export function buildRacks(root: THREE.Object3D) {
  const segs: Segment[] = [];
  const rackPos: THREE.Vector3[] = [];
  const rackSide: number[] = [];
  const rackSeg: number[] = [];
  for (const p of PODS)
    for (const s of SEGS) {
      const seg: Segment = { pod: p.name, half: s.name, x: p.x, z0: s.z0, z1: s.z0 - SEG_LEN, first: rackPos.length, pool: NONE };
      for (const side of [-1, 1])
        for (let k = 0; k < RACK.per; k++) {
          rackPos.push(new THREE.Vector3(p.x + side * (RACK.hot + RACK.d / 2), 0, s.z0 - RACK.pitch / 2 - k * RACK.pitch));
          rackSide.push(side);
          rackSeg.push(segs.length);
        }
      segs.push(seg);
    }
  const R = rackPos.length;
  const U = R * PER_RACK;
  const rackQ = rackSide.map((s) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (s * Math.PI) / 2));

  // ---- rack frames (neutral) and their front beams (the pool's colour) -------------------------
  const frame = new Boxes();
  const beams = new Boxes();
  const hw = RACK.w / 2 - 0.03,
    hd = RACK.d / 2 - 0.03;
  for (const sx of [-hw, hw]) for (const sz of [-hd, hd]) frame.add("#3a3d47", 0.06, RACK.h, 0.06, sx, 0, sz);
  for (let k = 0; k < SHELVES; k++) {
    const y = 0.1 + k * 0.45;
    frame.add("#2a2c34", RACK.w - 0.04, 0.02, RACK.d - 0.06, 0, y, 0);
    beams.add("#ffffff", RACK.w, 0.06, 0.05, 0, y - 0.04, hd + 0.02);
    frame.add("#2a2c34", RACK.w, 0.05, 0.05, 0, y - 0.04, -hd);
  }
  frame.add("#24262d", RACK.w, 0.06, RACK.d, 0, RACK.h - 0.06, 0);
  beams.add("#ffffff", RACK.w, 0.12, 0.05, 0, RACK.h - 0.12, hd + 0.03);
  // cable bundle down the back
  frame.add("#121216", 0.08, RACK.h - 0.2, 0.08, hw - 0.1, 0.1, -hd + 0.05);
  frame.add("#2a5ad8", 0.05, RACK.h - 0.2, 0.05, hw - 0.18, 0.1, -hd + 0.05);
  const frameGeo = frame.mesh(SOLID).geometry;
  const beamGeo = beams.mesh(SOLID).geometry;
  const frames = new THREE.InstancedMesh(frameGeo, SOLID, R);
  const beamMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.3 });
  const beamIM = new THREE.InstancedMesh(beamGeo, beamMat, R);

  // ---- units, fans, LEDs ---------------------------------------------------------------------
  const box = new THREE.BoxGeometry(UNIT.w, UNIT.h, UNIT.d);
  const uv = box.getAttribute("uv") as THREE.BufferAttribute;
  for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) {
    const i = f * 4 + v;
    uv.setX(i, f === 4 ? uv.getX(i) * 0.5 : 0.5 + uv.getX(i) * 0.5);
  }
  const unitMat = new THREE.MeshStandardMaterial({ map: unitAtlas(), roughness: 0.45, metalness: 0.55 });
  const units = new THREE.InstancedMesh(box, unitMat, U);
  const fanMat = fanMaterial("#4a4c55");
  const fans = new THREE.InstancedMesh(bladeGeometry(0.1), fanMat, U);
  const spin = new Float32Array(U * 2);
  const ledMat = ledMaterial(true);
  const leds = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.026, 0.02), ledMat, U * 2);
  const ledAttr = new Float32Array(U * 2 * 2);
  const strips = new THREE.InstancedMesh(new THREE.PlaneGeometry(RACK.w - 0.06, 0.05), ledMaterial(false), R);
  const stripAttr = new Float32Array(R * 2);

  const m = new THREE.Matrix4();
  const one = new THREE.Vector3(1, 1, 1);
  const off = new THREE.Vector3();
  const tint = new THREE.Color();
  const C_GREEN = new THREE.Color("#3ddc97").multiplyScalar(2.4),
    C_AMBER = new THREE.Color("#ffb02a").multiplyScalar(2.4),
    C_RED = new THREE.Color("#ff3030").multiplyScalar(3),
    C_BLUE = new THREE.Color("#4ad0ff").multiplyScalar(2.2);
  const TINTS = [new THREE.Color("#ffffff"), new THREE.Color("#c9ccd6"), new THREE.Color("#8f939e")];
  /** Unit u's slot centre in its rack's frame (front +z). */
  const slot = (u: number) => {
    const s = u % PER_RACK;
    const shelf = Math.floor(s / SLOTS),
      j = s % SLOTS;
    return [-0.45 + j * 0.3, 0.1 + 0.012 + shelf * 0.45 + UNIT.h / 2, 0.02] as const;
  };
  const place = (im: THREE.InstancedMesh, i: number, r: number, lx: number, ly: number, lz: number) => {
    off.set(lx, ly, lz).applyQuaternion(rackQ[r]).add(rackPos[r]);
    m.compose(off, rackQ[r], one);
    im.setMatrixAt(i, m);
  };
  /** Draw unit u, pulled `out` metres out of its slot (a technician swapping it). */
  const placeUnit = (u: number, out = 0) => {
    const r = Math.floor(u / PER_RACK);
    const [x, y, z] = slot(u);
    place(units, u, r, x, y, z + out);
    place(fans, u, r, x, y - 0.035, z + UNIT.d / 2 + 0.012 + out);
    place(leds, u * 2, r, x + 0.075, y + 0.14, z + UNIT.d / 2 + 0.004 + out);
    place(leds, u * 2 + 1, r, x + 0.105, y + 0.14, z + UNIT.d / 2 + 0.004 + out);
  };
  for (let r = 0; r < R; r++) {
    place(frames, r, r, 0, 0, 0);
    place(beamIM, r, r, 0, 0, 0);
    place(strips, r, r, 0, RACK.h - 0.06, RACK.d / 2 + 0.06);
    stripAttr[r * 2] = r * 0.37;
    stripAttr[r * 2 + 1] = NONE;
    const seg = rackSeg[r];
    for (let s = 0; s < PER_RACK; s++) {
      const u = r * PER_RACK + s;
      placeUnit(u);
      // a few empty slots, a few older units
      const h = hash(u, 3, 7, 11);
      tint.copy(TINTS[(seg + Math.floor(hash(r, 1, 2, 3) * 1.4)) % 3]);
      units.setColorAt(u, tint);
      spin[u * 2] = 18 + hash(u, 1, 1, 1) * 14;
      spin[u * 2 + 1] = hash(u, 2, 2, 2) * 6.28;
      const red = h < 0.006;
      leds.setColorAt(u * 2, red ? C_RED : C_GREEN);
      leds.setColorAt(u * 2 + 1, red ? C_RED : hash(u, 5, 5, 5) < 0.75 ? C_AMBER : C_BLUE);
      for (const k of [0, 1]) {
        ledAttr[(u * 2 + k) * 2] = hash(u, k, 9, 4) * 10;
        ledAttr[(u * 2 + k) * 2 + 1] = NONE;
      }
    }
  }
  fans.geometry.setAttribute("aSpin", new THREE.InstancedBufferAttribute(spin, 2));
  const ledA = new THREE.InstancedBufferAttribute(ledAttr, 2);
  leds.geometry.setAttribute("aLed", ledA);
  const stripA = new THREE.InstancedBufferAttribute(stripAttr, 2);
  strips.geometry.setAttribute("aLed", stripA);
  for (let r = 0; r < R; r++) {
    strips.setColorAt(r, new THREE.Color("#8a8f9c").multiplyScalar(1.4));
    beamIM.setColorAt(r, new THREE.Color("#5a5e6a"));
  }
  for (const im of [frames, beamIM, units, fans, leds, strips]) {
    im.frustumCulled = false;
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    root.add(im);
  }
  units.userData.racks = true;
  frames.userData.racks = true;
  beamIM.userData.racks = true;

  // ---- containment, trays, busbars -------------------------------------------------------------
  const st = new Boxes();
  const glow = new Boxes();
  const glass = new Boxes();
  const colliders: Rect[] = [];
  for (const s of segs) {
    const { x, z0, z1 } = s;
    const len = z0 - z1;
    const zc = (z0 + z1) / 2;
    colliders.push([x - RACK.hot - RACK.d - 0.05, z1 - 0.05, x + RACK.hot + RACK.d + 0.05, z0 + 0.05]);
    // hot-aisle roof: smoked panels on a frame, an orange glow line inside
    glass.add("#ffffff", RACK.hot * 2, 0.02, len, x, RACK.h + 0.02, zc);
    for (let z = z1; z <= z0 + 0.01; z += RACK.pitch * 3) st.add("#2a2c34", RACK.hot * 2 + 0.1, 0.06, 0.06, x, RACK.h, z);
    glow.add(new THREE.Color("#ff6a1a").multiplyScalar(1.3), 0.06, 0.03, len - 0.6, x, RACK.h - 0.05, zc);
    // end doors at both ends: frame, glass, a stripe, a little sign
    for (const [ze, dir] of [
      [z0, 1],
      [z1, -1],
    ] as [number, number][]) {
      st.add("#2a2c34", 0.08, RACK.h, 0.08, x - RACK.hot, 0, ze);
      st.add("#2a2c34", 0.08, RACK.h, 0.08, x + RACK.hot, 0, ze);
      st.add("#2a2c34", RACK.hot * 2, 0.1, 0.08, x, RACK.h - 0.1, ze);
      st.add("#2a2c34", 0.04, RACK.h - 0.3, 0.06, x, 0, ze);
      glass.add("#ffffff", RACK.hot * 2 - 0.1, RACK.h - 0.2, 0.02, x, 0.05, ze);
      st.add("#c8c8d0", 0.03, 0.4, 0.04, x - 0.08, 1.0, ze + dir * 0.04);
      st.add("#c8c8d0", 0.03, 0.4, 0.04, x + 0.08, 1.0, ze + dir * 0.04);
      // the rack ends: side panels of the two lines with a ventilated look
      for (const side of [-1, 1]) {
        const xc = x + side * (RACK.hot + RACK.d / 2);
        st.add("#30333d", RACK.d, RACK.h, 0.04, xc, 0, ze + dir * 0.02);
        st.add("#d9a21f", RACK.d, 0.08, 0.05, xc, 0.04, ze + dir * 0.03);
      }
    }
    // inside the hot aisle: dull orange glow on the floor
    glow.add(new THREE.Color("#3a1606"), RACK.hot * 2 - 0.05, 0.01, len - 0.1, x, 0.005, zc);
    // cable trays over both lines, busbar over the hot aisle, drops into each rack
    for (const side of [-1, 1]) {
      const xt = x + side * (RACK.hot + RACK.d / 2);
      st.add("#d9a21f", 0.5, 0.03, len + 0.4, xt, 2.95, zc);
      st.add("#d9a21f", 0.03, 0.12, len + 0.4, xt - 0.25, 2.95, zc);
      st.add("#d9a21f", 0.03, 0.12, len + 0.4, xt + 0.25, 2.95, zc);
      // cables in the tray
      st.add("#14141a", 0.3, 0.06, len + 0.3, xt, 2.98, zc);
      st.add("#2a5ad8", 0.1, 0.07, len + 0.3, xt + 0.12, 2.99, zc);
      for (let z = z0 - 0.3; z > z1; z -= RACK.pitch * 2) {
        st.add("#3a3d47", 0.03, 1.6, 0.03, xt, 3.05, z);
        st.add("#14141a", 0.05, 0.55, 0.05, xt + side * 0.2, RACK.h, z - 0.4);
      }
    }
    st.add("#3a3c44", 0.24, 0.3, len + 0.4, x, 3.35, zc);
    for (let z = z0 - 0.6; z > z1; z -= RACK.pitch * 2) st.add("#c8641e", 0.32, 0.26, 0.3, x, 3.1, z);
    for (let z = z0 - 0.6; z > z1; z -= RACK.pitch * 6) st.add("#3a3d47", 0.04, 1.4, 0.04, x, 3.65, z);
  }
  root.add(st.mesh(SOLID), glow.mesh(GLOW));
  const gm = glass.mesh(GLASS);
  gm.renderOrder = 2;
  root.add(gm);

  // ---- pools ---------------------------------------------------------------------------------
  const pools: PoolRow[] = [];
  const signs: THREE.Object3D[] = [];
  const signGroup = new THREE.Group();
  root.add(signGroup);

  function assign(mm: Miners) {
    const tot = mm.total_blocks || 1;
    const top = mm.miners.slice(0, 7);
    const S = segs.length;
    const rows: PoolRow[] = top.map((r, i) => ({ index: i, name: minerName(r), color: POOL_COLORS[i], share: r.blocks / tot, miner: r, segments: Math.max(1, Math.round((r.blocks / tot) * S)) }));
    const rest = 1 - rows.reduce((a, r) => a + r.share, 0);
    if (rest > 0.01) rows.push({ index: OTHERS, name: "Other miners", color: POOL_COLORS[OTHERS], share: rest, miner: null, segments: Math.max(1, Math.round(rest * S)) });
    let used = rows.reduce((a, r) => a + r.segments, 0);
    while (used > S) {
      const big = rows.reduce((a, r) => (r.segments > a.segments ? r : a));
      big.segments--;
      used--;
    }
    while (used < S) {
      rows[0].segments++;
      used++;
    }
    pools.length = 0;
    pools.push(...rows);
    // fill pods west to east, south half then north half, so each pool's pods stand together
    let k = 0;
    const order = segs.map((_, i) => i);
    for (const r of rows) for (let n = 0; n < r.segments; n++) segs[order[k++]].pool = r.index;
    // colours
    const c = new THREE.Color();
    for (let r = 0; r < R; r++) {
      const p = segs[rackSeg[r]].pool;
      c.set(POOL_COLORS[p] ?? "#8a8f9c");
      beamIM.setColorAt(r, c.clone().multiplyScalar(0.85));
      strips.setColorAt(r, c.clone().multiplyScalar(2.6));
      stripAttr[r * 2 + 1] = p;
      for (let s = 0; s < PER_RACK * 2; s++) ledAttr[(r * PER_RACK * 2 + s) * 2 + 1] = p;
    }
    beamIM.instanceColor!.needsUpdate = true;
    strips.instanceColor!.needsUpdate = true;
    ledA.needsUpdate = true;
    stripA.needsUpdate = true;
    // hanging signs over both ends of every half pod
    for (const s of signs) {
      signGroup.remove(s);
      s.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          (o.material as THREE.MeshBasicMaterial).map?.dispose();
          (o.material as THREE.Material).dispose();
          o.geometry.dispose();
        }
      });
    }
    signs.length = 0;
    banners(rows);
    for (const s of segs) {
      const row = rows.find((r) => r.index === s.pool);
      if (!row) continue;
      const sign = podSign(s, row);
      for (const [z, ry] of [
        [s.z0 + 0.6, 0],
        [s.z1 - 0.6, Math.PI],
      ] as [number, number][]) {
        const o = sign.clone();
        o.position.set(s.x, 4.3, z);
        o.rotation.y = ry;
        signGroup.add(o);
        signs.push(o);
      }
    }
  }

  /** Big banners over the middle aisle, one per pool, over the middle of its pods (both faces). */
  function banners(rows: PoolRow[]) {
    for (const r of rows) {
      const mine = segs.filter((s) => s.pool === r.index);
      if (!mine.length) continue;
      const xs = mine.map((s) => s.x);
      const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
      const w = Math.min(10, Math.max(5.5, Math.max(...xs) - Math.min(...xs) + 3));
      const name = r.name.length > 18 ? r.name.slice(0, 17) + "…" : r.name;
      const plate = neonSign(
        [
          { text: name.toUpperCase(), font: MONO(120, 900) },
          { text: `${(r.share * 100).toFixed(1)}% OF BLOCKS · POD${mine.length > 1 ? "S" : ""} ${mine[0].pod}${mine[0].half}${mine.length > 1 ? `–${mine[mine.length - 1].pod}${mine[mine.length - 1].half}` : ""}`, font: MONO(54, 700), color: "#e8e0c8" },
        ],
        { color: r.color, w, h: 2.0, px: 110 },
      );
      for (const ry of [0, Math.PI]) {
        const o = plate.clone();
        o.rotation.y = ry;
        o.position.set(cx, 7.3, -39 + (ry ? -0.03 : 0.03));
        signGroup.add(o);
        signs.push(o);
      }
      const rodM = new THREE.MeshStandardMaterial({ color: "#2a2c34" });
      for (const dx of [-w / 2 + 0.4, w / 2 - 0.4]) {
        const rod = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.6, 0.04), rodM);
        rod.position.set(cx + dx, 9.0, -39);
        signGroup.add(rod);
        signs.push(rod);
      }
    }
  }

  /** A pod's sign: its number, the pool, the pool's share, hung from two rods. */
  function podSign(s: Segment, row: PoolRow) {
    const g = new THREE.Group();
    const name = row.name.length > 16 ? row.name.slice(0, 15) + "…" : row.name;
    const plate = neonSign(
      [
        { text: `${s.pod}${s.half} · ${name.toUpperCase()}`, font: MONO(64, 800) },
        { text: `${(row.share * 100).toFixed(1)}% of blocks · 7d`, font: MONO(40, 600), color: "#e8e0c8" },
      ],
      { color: row.color, w: 3.3, h: 0.95 },
    );
    g.add(plate);
    const rodM = new THREE.MeshStandardMaterial({ color: "#2a2c34" });
    for (const x of [-1.3, 1.3]) {
      const rod = new THREE.Mesh(new THREE.BoxGeometry(0.03, 7, 0.03), rodM);
      rod.position.set(x, 4, 0);
      g.add(rod);
    }
    return g;
  }

  // ---- queries -------------------------------------------------------------------------------
  return {
    segs,
    pools,
    colliders,
    units,
    racks: R,
    unitsCount: U,
    assign,
    placeUnit,
    finish() {
      for (const im of [units, fans, leds]) im.instanceMatrix.needsUpdate = true;
    },
    rackOfUnit: (u: number) => Math.floor(u / PER_RACK),
    segOfRack: (r: number) => segs[rackSeg[r]],
    poolOfRack: (r: number) => pools.find((p) => p.index === segs[rackSeg[r]].pool) ?? null,
    /** Where a technician stands to work on rack r (in the cold aisle, facing it) and which way it faces. */
    serviceSpot(r: number) {
      const side = rackSide[r];
      return { at: rackPos[r].clone().add(new THREE.Vector3(side * 1.25, 0, 0)), face: new THREE.Vector3(-side, 0, 0) };
    },
    unitsOf: (r: number) => Array.from({ length: PER_RACK }, (_, i) => r * PER_RACK + i),
    rackIndex(seg: number, side: number, k: number) {
      return segs[seg].first + (side > 0 ? RACK.per : 0) + k;
    },
  };
}

export type Racks = ReturnType<typeof buildRacks>;
