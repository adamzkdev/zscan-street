import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { C, hash, VoxelModel } from "../../scene/voxel/model";
import type { Rect } from "../types";
import { buildFans, crowdIds, type FanSeat, type Fans } from "../stadium/fans";
import { AX, AZ, at, canvasTex, D_OUT, D_TOP, D_WALL, dOf, GATE_H, GATE_W, meshAt, one, patch, POD, radius, ROWS, VS, Y_ATTIC, Y_TOP } from "./geo";

/**
 * The bowl in voxels (four a metre): the marble podium round the arena with its balustrade, the
 * senators' terrace and benches, the cavea's three maeniana (marble, travertine, then wooden seats
 * at the top) with radial stairways and vomitoria in the balteus walls, the top portico on its
 * columns, the attic wall with arched windows onto the city, the emperor's pulvinar; then the
 * velarium half drawn on its ropes and masts, the sand, braziers, and the crowd.
 */
export interface Bowl {
  group: THREE.Group;
  /** Floor 0 (sand) and floor 2 (terrace) colliders. */
  arenaRects: Rect[];
  terraceRects: Rect[];
  /** The crowd: a zkSNARK on every seat. */
  fans: Fans;
  flames: THREE.Object3D[];
  /** Where the emperor sits (on the terrace, -x side) and where the gate is. */
  throne: THREE.Vector3;
  sand: THREE.Mesh;
}

const X0 = -(AX + D_OUT + 0.5),
  Z0 = -(AZ + D_OUT + 0.5);
const PULV_Z = 3.2; // the emperor's box spans |z| < PULV_Z on the -x side

export function buildBowl(): Bowl {
  const group = new THREE.Group();
  const W = Math.ceil((-X0 * 2) / VS),
    D = Math.ceil((-Z0 * 2) / VS),
    H = Math.ceil((Y_ATTIC + 0.6) / VS);
  const m = new VoxelModel(W, H, D);
  const iy = (y: number) => Math.round(y / VS);

  const trav = patch(["#d6caad", "#cfc2a4", "#ddd2b8"], 10, 12, 3);
  const travL = one("#e6dcc4");
  const travD = patch(["#b9aa8c", "#b1a285"], 8, 10, 4);
  const marble = patch(["#ece6da", "#e4ddd0"], 10, 10, 5);
  const marbleD = one("#cfc8ba");
  const porph = one("#7a2a30");
  const serp = one("#3e5e4a");
  const wood = patch(["#7a5a3a", "#6e5034"], 6, 4, 6);
  const woodD = one("#4e3826");
  const dark = one("#1e1a18");
  const roof = one("#a85a3a");
  const tuff = patch(["#9a9484", "#908a7b"], 8, 10, 7);
  const gold = one("#c9a227");

  // aisles: radial stairways at these angles (none over the gates or the emperor's box)
  const AISLES = 28;
  const aisleAt = (x: number, z: number, d: number) => {
    const ph = Math.atan2(z, x);
    const k = (ph / (Math.PI * 2)) * AISLES;
    const off = (k - Math.round(k)) * ((2 * Math.PI * Math.hypot(AX + d, AZ + d)) / Math.SQRT2 / AISLES);
    const idx = ((Math.round(k) % AISLES) + AISLES) % AISLES;
    if (idx === 7 || idx === 21 || idx === 14 || idx === 0) return 99; // over the gates and boxes
    return Math.abs(off);
  };

  for (let iz = 0; iz < D; iz++)
    for (let ix = 0; ix < W; ix++) {
      const x = X0 + (ix + 0.5) * VS,
        z = Z0 + (iz + 0.5) * VS;
      const d = dOf(x, z);
      if (d < 0 || d > D_OUT) continue;
      const gate = Math.abs(x) < GATE_W && Math.abs(z) > AZ - 1;
      const pulv = x < 0 && Math.abs(z) < PULV_Z && d < 3.6;
      const col = (y0: number, y1: number, c: (x: number, y: number, z: number) => number) => {
        for (let y = iy(y0); y < iy(y1); y++) if (!(gate && y < iy(GATE_H))) m.set(ix, y, iz, c(ix, y, iz));
      };
      if (d < 0.5) {
        // podium wall: dark plinth, marble with porphyry panels and serpentine roundels, cornice, balustrade
        const ph = Math.atan2(z, x);
        const along = ph * Math.hypot(AX, AZ) * 0.72;
        const pan = ((along % 2.4) + 2.4) % 2.4;
        col(0, 0.4, marbleD);
        col(0.4, POD - 0.3, (a, b, c) => {
          const y = b * VS;
          if (d < 0.26 && pan > 0.35 && pan < 2.05 && y > 0.8 && y < 2.9) {
            if (Math.hypot(pan - 1.2, y - 1.85) < 0.4) return serp(a, b, c);
            return y > 0.95 && y < 2.75 && pan > 0.5 && pan < 1.9 ? porph(a, b, c) : marbleD(a, b, c);
          }
          return marble(a, b, c);
        });
        col(POD - 0.3, POD, travL);
        if (d > 0.1 && d < 0.4) {
          col(POD, POD + 0.15, marbleD);
          // balusters every 25 cm, a handrail
          if (Math.floor(along / 0.25) % 2 === 0 || pulv) col(POD + 0.15, POD + 0.95, marble);
          col(POD + 0.95, POD + 1.1, travL);
        }
        if (gate) for (let y = iy(GATE_H); y < iy(GATE_H + 0.4); y++) m.set(ix, y, iz, travL(ix, y, iz));
        continue;
      }
      if (d < 3.0 || pulv) {
        col(0, POD, (a, b, c) => (b === iy(POD) - 1 ? ((Math.floor(x) + Math.floor(z)) % 2 ? marble(a, b, c) : marbleD(a, b, c)) : tuff(a, b, c)));
        if (pulv) {
          // the box: purple-and-gold dais
          for (let y = iy(POD); y < iy(POD + 0.15); y++) m.set(ix, y, iz, (Math.abs(z) > PULV_Z - 0.3 || d < 0.75 ? gold : C("#4a1e5a")));
          if (Math.abs(z) > PULV_Z - 0.25 && (z < 0 || d < 2.0)) col(POD, POD + 1.1, marble); // side walls, a way in at the back on +z
        }
        continue;
      }
      if (d < 3.6) {
        // the senators' bench
        col(0, POD + 0.45, tuff);
        for (let y = iy(POD + 0.2); y < iy(POD + 0.45); y++) m.set(ix, y, iz, d < 3.15 ? travL(ix, y, iz) : marble(ix, y, iz));
        if (d > 3.4) col(POD + 0.45, POD + 0.9, marbleD);
        continue;
      }
      if (d < D_TOP) {
        const r = ROWS.find((rr) => d >= rr.d0 && d < rr.d1) ?? ROWS[ROWS.length - 1];
        const ai = aisleAt(x, z, d);
        let top = r.y;
        const aisle = !r.walk && ai < 0.45;
        if (aisle && d < (r.d0 + r.d1) / 2) top -= 0.25;
        const seat = r.mae === 0 ? marble : r.mae === 1 ? trav : wood;
        col(0, top - 0.25, r.walk ? tuff : r.mae === 2 ? woodD : travD);
        col(top - 0.25, top, (a, b, c) => {
          if (aisle) return travL(a, b, c);
          if (r.walk) return travD(a, b, c);
          if (d < r.d0 + 0.2) return r.mae === 2 ? woodD(a, b, c) : travL(a, b, c);
          return seat(a, b, c);
        });
        // the next tier's riser (balteus): a lighter coping, vomitoria every 45 degrees
        if (!r.walk && r === ROWS.find((rr) => !rr.walk && rr.mae === r.mae)) {
          if (r.mae > 0) {
            const ph = Math.atan2(z, x);
            const k = (ph / (Math.PI * 2)) * 8 + 0.5;
            const off = (k - Math.round(k)) * ((2 * Math.PI * Math.hypot(AX + d, AZ + d)) / Math.SQRT2 / 8);
            if (Math.abs(off) < 0.75 && d < r.d0 + 0.7) {
              const yw = r.y - 2.0;
              for (let y = iy(yw); y < iy(yw + 1.3); y++) m.set(ix, y, iz, d > r.d0 + 0.45 ? dark(ix, y, iz) : 0);
              if (Math.abs(off) > 0.55 || d < r.d0 + 0.25) for (let y = iy(yw + 1.3); y < iy(yw + 1.45); y++) m.set(ix, y, iz, travL(ix, y, iz));
            }
          }
        }
        continue;
      }
      if (d < D_WALL) {
        // the top portico: floor, columns, a tiled roof
        col(0, Y_TOP, travD);
        const ph = Math.atan2(z, x);
        const along = ph * Math.hypot(AX + d, AZ + d) * 0.72;
        const pc = ((along % 3) + 3) % 3;
        if (d > D_TOP + 0.3 && d < D_TOP + 0.75 && pc < 0.45) {
          col(Y_TOP, Y_TOP + 0.25, travL);
          col(Y_TOP + 0.25, Y_TOP + 3.2, (a, b, c) => (hash(Math.floor(along / 3), 0, 0, 9) < 0.5 ? C("#8a8590") : C("#a6a0a8")));
          col(Y_TOP + 3.2, Y_TOP + 3.4, travL);
        }
        if (d > D_TOP + 0.2) col(Y_TOP + 3.4, Y_TOP + 3.6, woodD);
        if (d > D_TOP + 0.1) {
          const ty = Y_TOP + 3.6 + (d - D_TOP) * 0.25;
          col(Y_TOP + 3.6, ty, roof);
        }
        continue;
      }
      // the attic wall, arched windows between the portico columns and small square ones above
      const ph = Math.atan2(z, x);
      const along = ph * Math.hypot(AX + d, AZ + d) * 0.72;
      const pc = (((along + 1.5) % 3) + 3) % 3 - 1.5; // 0 between columns
      col(0, Y_ATTIC, (a, b, c) => {
        const y = b * VS;
        const ly = y - (Y_TOP + 0.6);
        if (Math.abs(pc) < 0.7 && ly > 0 && ly < 1.6 + Math.sqrt(Math.max(0, 0.49 - pc * pc))) return 0;
        if (Math.abs(pc) < 0.35 && y > Y_ATTIC - 2.4 && y < Y_ATTIC - 1.6) return 0;
        if (y > Y_ATTIC - 0.35) return travL(a, b, c);
        if (Math.abs(y - (Y_TOP + 4.0)) < 0.12) return travL(a, b, c);
        return trav(a, b, c);
      });
    }

  // the gates: Porta Triumphalis (+z, where you come in) and Porta Libitinensis (-z), both closed by doors
  for (const sz of [1, -1]) {
    const zd = sz * (AZ + 2.5);
    for (let y = 0; y < iy(GATE_H); y++)
      for (let x = -GATE_W; x < GATE_W; x += VS) {
        const ix = Math.floor((x - X0) / VS),
          izz = Math.floor((zd - Z0) / VS);
        m.set(ix, y, izz, Math.abs(x) < 0.08 ? C("#2a2420") : y % 4 === 0 ? C("#4e3826") : C("#6a4a30"));
      }
    // tunnel walls
    for (let z = AZ - 0.4; z < AZ + 2.5; z += VS)
      for (const x of [-GATE_W - VS, GATE_W]) {
        const ix = Math.floor((x - X0) / VS),
          izz = Math.floor((sz * z - Z0) / VS);
        for (let y = 0; y < iy(GATE_H); y++) m.set(ix, y, izz, trav(ix, y, izz));
      }
  }

  const mesh = meshAt(m, X0, 0, Z0);
  group.add(mesh);

  // ---- the sand --------------------------------------------------------------------------------
  const sandTex = canvasTex(1024, 1024, (g) => {
    g.fillStyle = "#d8b67c";
    g.fillRect(0, 0, 1024, 1024);
    for (let i = 0; i < 9000; i++) {
      const v = Math.random();
      g.fillStyle = v < 0.5 ? "rgba(150,110,60,0.18)" : "rgba(255,240,200,0.18)";
      g.fillRect(Math.random() * 1024, Math.random() * 1024, 2 + Math.random() * 3, 2 + Math.random() * 3);
    }
    // raked arcs
    g.strokeStyle = "rgba(140,100,55,0.09)";
    g.lineWidth = 3;
    for (let r = 60; r < 720; r += 26 + Math.random() * 14) {
      g.beginPath();
      g.ellipse(512 + (Math.random() - 0.5) * 30, 512 + (Math.random() - 0.5) * 30, r * 0.62, r, 0, Math.random() * 6, Math.random() * 6 + 3);
      g.stroke();
    }
    // scuffed patches and dark stains
    for (let i = 0; i < 40; i++) {
      const gr = g.createRadialGradient(0, 0, 0, 0, 0, 60);
      gr.addColorStop(0, "rgba(120,80,40,0.22)");
      gr.addColorStop(1, "rgba(120,80,40,0)");
      g.save();
      g.translate(Math.random() * 1024, Math.random() * 1024);
      g.fillStyle = gr;
      g.fillRect(-60, -60, 120, 120);
      g.restore();
    }
  });
  const shape = new THREE.Shape();
  shape.absellipse(0, 0, AX + 0.05, AZ + 0.05, 0, Math.PI * 2, false, 0);
  const sg = new THREE.ShapeGeometry(shape, 96);
  const uv = sg.attributes.uv as THREE.BufferAttribute;
  const pos = sg.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + AZ) / (2 * AZ), (pos.getY(i) + AZ) / (2 * AZ));
  sg.rotateX(-Math.PI / 2);
  const sand = new THREE.Mesh(sg, new THREE.MeshStandardMaterial({ map: sandTex.t, roughness: 1 }));
  sand.position.y = 0.01;
  group.add(sand);
  // the tunnel floor
  const tf = new THREE.Mesh(new THREE.PlaneGeometry(GATE_W * 2, 3.2), new THREE.MeshStandardMaterial({ color: "#8a7a62", roughness: 1 }));
  tf.rotation.x = -Math.PI / 2;
  tf.position.set(0, 0.012, AZ + 1);
  group.add(tf);

  // ---- braziers on the balustrade ----------------------------------------------------------------
  const flames: THREE.Object3D[] = [];
  const bronze = new THREE.MeshStandardMaterial({ color: "#8a6a3a", roughness: 0.45, metalness: 0.7 });
  const fireMat = new THREE.MeshBasicMaterial({ color: new THREE.Color("#ff8a2a").multiplyScalar(2.4), toneMapped: false });
  const fireCore = new THREE.MeshBasicMaterial({ color: new THREE.Color("#ffe08a").multiplyScalar(2.6), toneMapped: false });
  const tripods: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 12; i++) {
    const ph = (i / 12) * Math.PI * 2 + Math.PI / 12;
    const p = at(ph, 0.25);
    const y = POD + 1.1;
    const bowl = new THREE.CylinderGeometry(0.32, 0.18, 0.22, 10).translate(p.x, y + 0.75, p.z);
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2;
      tripods.push(new THREE.BoxGeometry(0.05, 0.7, 0.05).translate(p.x + Math.cos(a) * 0.14, y + 0.35, p.z + Math.sin(a) * 0.14));
    }
    tripods.push(bowl);
    const f = new THREE.Group();
    const o = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.6, 7), fireMat);
    const c2 = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.38, 6), fireCore);
    o.position.y = 0.3;
    c2.position.y = 0.2;
    f.add(o, c2);
    f.position.set(p.x, y + 0.86, p.z);
    f.userData.ph = i * 1.7;
    group.add(f);
    flames.push(f);
  }
  group.add(new THREE.Mesh(mergeGeometries(tripods), bronze));

  // ---- the pulvinar: porphyry columns, a purple canopy, a gold eagle, the throne -----------------------
  const pulvX = -(AX + 0.5),
    pulvX1 = -(AX + 3.5);
  const porphM = new THREE.MeshStandardMaterial({ color: "#6e2228", roughness: 0.35, metalness: 0.1 });
  const goldM = new THREE.MeshStandardMaterial({ color: "#d4a830", roughness: 0.3, metalness: 0.9 });
  const purple = new THREE.MeshStandardMaterial({ color: "#5a1e6e", roughness: 0.85, side: THREE.DoubleSide });
  const cols: THREE.BufferGeometry[] = [];
  const golds: THREE.BufferGeometry[] = [];
  for (const cxp of [pulvX - 0.25, pulvX1 + 0.2])
    for (const czp of [-PULV_Z + 0.25, PULV_Z - 0.25]) {
      cols.push(new THREE.CylinderGeometry(0.16, 0.18, 3.3, 12).translate(cxp, POD + 1.8, czp));
      golds.push(new THREE.BoxGeometry(0.42, 0.14, 0.42).translate(cxp, POD + 3.45, czp), new THREE.BoxGeometry(0.42, 0.14, 0.42).translate(cxp, POD + 0.22, czp));
    }
  golds.push(new THREE.BoxGeometry(pulvX - pulvX1 + 0.6, 0.22, 0.2).translate((pulvX + pulvX1) / 2, POD + 3.6, PULV_Z - 0.25));
  golds.push(new THREE.BoxGeometry(pulvX - pulvX1 + 0.6, 0.22, 0.2).translate((pulvX + pulvX1) / 2, POD + 3.6, -PULV_Z + 0.25));
  golds.push(new THREE.BoxGeometry(0.2, 0.22, PULV_Z * 2).translate(pulvX - 0.25, POD + 3.6, 0));
  // throne
  golds.push(new THREE.BoxGeometry(0.9, 0.5, 0.9).translate(-(AX + 2.75), POD + 0.4, 0), new THREE.BoxGeometry(0.2, 1.5, 1.0).translate(-(AX + 3.25), POD + 0.9, 0));
  group.add(new THREE.Mesh(mergeGeometries(cols), porphM), new THREE.Mesh(mergeGeometries(golds), goldM));
  const cushion = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.12, 0.8), purple);
  cushion.position.set(-(AX + 2.72), POD + 0.71, 0);
  group.add(cushion);
  // the canopy, a shallow gable
  const canopy = new THREE.BufferGeometry();
  const cy = POD + 3.7;
  const v = [pulvX + 0.2, cy, -PULV_Z, pulvX + 0.2, cy, PULV_Z, (pulvX + pulvX1) / 2, cy + 0.9, PULV_Z, (pulvX + pulvX1) / 2, cy + 0.9, -PULV_Z, pulvX1 - 0.2, cy, -PULV_Z, pulvX1 - 0.2, cy, PULV_Z];
  canopy.setAttribute("position", new THREE.Float32BufferAttribute(v, 3));
  canopy.setIndex([0, 1, 2, 0, 2, 3, 3, 2, 5, 3, 5, 4]);
  canopy.computeVertexNormals();
  group.add(new THREE.Mesh(canopy, purple));
  // gold fringe and the eagle on the ridge
  const fringe = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.25, PULV_Z * 2), goldM);
  fringe.position.set(pulvX + 0.2, cy - 0.12, 0);
  group.add(fringe);
  const eagle = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.45, 0.25), goldM);
  const wingL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.35, 0.7), goldM);
  wingL.position.set(0, 0.15, 0.4);
  wingL.rotation.x = 0.5;
  const wingR = wingL.clone();
  wingR.position.z = -0.4;
  wingR.rotation.x = -0.5;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.18), goldM);
  head.position.set(0.12, 0.3, 0);
  eagle.add(body, wingL, wingR, head);
  eagle.position.set((pulvX + pulvX1) / 2, cy + 1.15, 0);
  group.add(eagle);
  // SPQR banners hanging from the box's balustrade into the arena
  for (const zz of [-1.6, 1.6]) {
    const b = canvasTex(128, 256, (g) => {
      g.fillStyle = "#7a1e22";
      g.fillRect(0, 0, 128, 256);
      g.fillStyle = "#d4a830";
      g.fillRect(6, 6, 116, 6);
      g.fillRect(6, 230, 116, 6);
      g.font = '800 34px "Times New Roman", serif';
      g.textAlign = "center";
      g.fillText("S·P", 64, 90);
      g.fillText("Q·R", 64, 140);
      for (let x = 8; x < 128; x += 16) {
        g.beginPath();
        g.moveTo(x, 236);
        g.lineTo(x + 8, 256);
        g.lineTo(x + 16, 236);
        g.fill();
      }
    });
    const p = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.8), new THREE.MeshStandardMaterial({ map: b.t, roughness: 0.9, side: THREE.DoubleSide }));
    p.position.set(-AX - 0.08, POD + 0.15, zz);
    p.rotation.y = Math.PI / 2;
    group.add(p);
  }

  // ---- velarium: sail panels drawn over the sunny half, ropes and masts all round ------------------------
  {
    const N = 96;
    const inD = 6.2,
      inY = 15.6,
      outD = D_OUT,
      outY = Y_ATTIC + 0.3;
    const posA: number[] = [],
      colA: number[] = [];
    const cream = new THREE.Color("#efe4c8"),
      red = new THREE.Color("#b0432e");
    for (let i = 0; i < N; i++) {
      const a0 = (i / N) * Math.PI * 2,
        a1 = ((i + 1) / N) * Math.PI * 2;
      const mid = (a0 + a1) / 2;
      // covered: from the east round the north to the west (the sunny side)
      const cov = Math.sin(mid - 0.3) < 0.25;
      if (!cov) continue;
      const pi0 = at(a0, inD),
        pi1 = at(a1, inD),
        po0 = at(a0, outD),
        po1 = at(a1, outD),
        pm = at(mid, (inD + outD) / 2);
      const sag = 0.5;
      const ym = (inY + outY) / 2 - sag;
      const tri = (p: { x: number; z: number }, y: number) => posA.push(p.x, y, p.z);
      const c = i % 4 < 2 ? cream : red;
      // two triangles fanned from the sagging middle to each edge
      for (const [a, ay, b, by] of [
        [pi0, inY, pi1, inY],
        [pi1, inY, po1, outY],
        [po1, outY, po0, outY],
        [po0, outY, pi0, inY],
      ] as [typeof pi0, number, typeof pi0, number][]) {
        tri(pm, ym);
        tri(a, ay);
        tri(b, by);
        for (let k = 0; k < 3; k++) colA.push(c.r, c.g, c.b);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(posA, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(colA, 3));
    g.computeVertexNormals();
    const sail = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, side: THREE.DoubleSide, transparent: true, opacity: 0.93 }));
    sail.raycast = () => {};
    group.add(sail);
    // ropes from every mast to the inner ring, and the ring itself
    const rp: number[] = [];
    const MASTS = 48;
    const masts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < MASTS; i++) {
      const a = (i / MASTS) * Math.PI * 2;
      const o = at(a, D_OUT - 0.4),
        ii = at(a, inD);
      rp.push(o.x, Y_ATTIC + 3, o.z, ii.x, inY, ii.z);
      masts.push(new THREE.CylinderGeometry(0.09, 0.12, 3.6, 6).translate(o.x, Y_ATTIC + 1.4, o.z));
    }
    for (let i = 0; i < 128; i++) {
      const a = at((i / 128) * Math.PI * 2, inD),
        b = at(((i + 1) / 128) * Math.PI * 2, inD);
      rp.push(a.x, inY, a.z, b.x, inY, b.z);
    }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute("position", new THREE.Float32BufferAttribute(rp, 3));
    group.add(new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: "#6a5a44" })));
    group.add(new THREE.Mesh(mergeGeometries(masts), new THREE.MeshStandardMaterial({ color: "#6a4a30", roughness: 0.8 })));
  }

  // ---- the crowd -----------------------------------------------------------------------------------
  let fans: Fans;
  {
    const seats: { x: number; y: number; z: number; ph: number }[] = [];
    ROWS.forEach((r, ri) => {
      if (r.walk) return;
      const d = (r.d0 + r.d1) / 2 + 0.05;
      const L = (2 * Math.PI * Math.hypot(AX + d, AZ + d)) / Math.SQRT2;
      const n = Math.floor(L / 0.56);
      for (let i = 0; i < n; i++) {
        const ph = ((i + (ri % 2) * 0.5) / n) * Math.PI * 2;
        const p = at(ph, d);
        if (aisleAt(p.x, p.z, d) < 0.55) continue;
        if (hash(i, ri, 7, 3) > 0.84) continue;
        // keep the vomitoria free on the first row of each upper tier
        if (r.mae > 0 && r === ROWS.find((rr) => !rr.walk && rr.mae === r.mae)) {
          const k = (ph / (Math.PI * 2)) * 8 + 0.5;
          if (Math.abs(k - Math.round(k)) * (L / 8) < 1) continue;
        }
        seats.push({ x: p.x, y: r.y, z: p.z, ph });
      }
    });
    // zkSNARKs in togas: the gold end round the emperor, the silver end across, mixed in between
    const tunics = ["#e8e2d4", "#efe9dc", "#b03a2e", "#d8c8a0", "#7a3a8a"];
    const ids = crowdIds(seats.length, 79);
    const fanSeats: FanSeat[] = seats.map((s, i) => {
      const mix = Math.abs(s.x) < 4 ? 0.5 : 0.12;
      const team = (s.x < 0) !== hash(i, 5, 5, 3) < mix ? 0 : 1;
      const h = hash(i, 1, 2, 3);
      const f = hash(i, 9, 9, 1);
      return {
        x: s.x,
        y: s.y - 0.36,
        z: s.z,
        rot: Math.atan2(-s.x, -s.z),
        ang: s.ph,
        team,
        kind: f < 0.03 ? 2 : f < 0.12 ? 1 : 0,
        shirt: h < 0.55 ? (team === 0 ? "#f4b728" : "#c8ccd8") : tunics[Math.floor(hash(i, 2, 2, 3) * tunics.length)],
        id: ids[i],
      };
    });
    fans = buildFans(fanSeats, { lod: 40, bright: 1.1 });
    group.add(fans.group);
  }

  // ---- colliders ------------------------------------------------------------------------------------
  const arenaRects: Rect[] = [
    ...ring(-0.15, 0.7, (x, z) => Math.abs(x) < GATE_W && z > 0),
    // the tunnel's walls and its doors (the way out)
    [-GATE_W - 0.3, AZ - 0.6, -GATE_W, AZ + 2.6],
    [GATE_W, AZ - 0.6, GATE_W + 0.3, AZ + 2.6],
    [-GATE_W, AZ + 2.3, GATE_W, AZ + 2.6],
  ];
  const terraceRects: Rect[] = [
    ...ring(0.3, 0.6, (x, z) => x < 0 && Math.abs(z) < PULV_Z),
    ...ring(3.15, 0.6, (x, z) => x < 0 && Math.abs(z) < PULV_Z),
    // the emperor's box: closed on its -z side, open on +z behind the front half wall
    [-(AX + 3.6), -PULV_Z - 0.15, -(AX + 0.3), -PULV_Z + 0.15],
    [-(AX + 2.0), PULV_Z - 0.15, -(AX + 0.3), PULV_Z + 0.15],
    [-(AX + 3.6), -PULV_Z, -(AX + 3.25), PULV_Z],
    [-(AX + 0.6), -PULV_Z, -(AX + 0.2), PULV_Z],
    [-(AX + 3.3), -0.55, -(AX + 2.25), 0.55], // the throne
  ];
  return { group, arenaRects, terraceRects, fans, flames, throne: new THREE.Vector3(-(AX + 2.75), POD + 0.47, 0), sand };
}

/** Colliders along an ellipse offset `d` (local copy to keep geo.ts import-light). */
function ring(d: number, size: number, skip?: (x: number, z: number) => boolean): Rect[] {
  const out: Rect[] = [];
  const L = (2 * Math.PI * Math.hypot(AX + d, AZ + d)) / Math.SQRT2;
  const n = Math.ceil(L / (size * 0.6));
  for (let i = 0; i < n; i++) {
    const ph = (i / n) * Math.PI * 2;
    const c = Math.cos(ph),
      s = Math.sin(ph);
    const r = radius(c, s, AX, AZ) + d;
    const x = c * r,
      z = s * r;
    if (skip?.(x, z)) continue;
    out.push([x - size / 2, z - size / 2, x + size / 2, z + size / 2]);
  }
  return out;
}
