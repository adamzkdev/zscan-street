import * as THREE from "three";
import type { Collection } from "./data";
import { boxGeo, FACE, type MuseumKit } from "./kit";
import { goldMosaic, limestone, skylight, versailles } from "./look";
import { lifts, SERIF } from "./parts";
import { banquette, stanchions, wingedVictory } from "./voxels";
import { API } from "../../data/zscan";
import { ZScan } from "../../data/zscan";

/**
 * Floor 2. The Daru staircase: a monumental flight of grey stone rising to a landing where the
 * winged Victory, a zkSNARK in marble, strides on the prow of her ship under a gold mosaic vault;
 * two flights go on up left and right. Through the west door, the Salle des États: dark blue walls
 * under a great skylight, and on a free-standing wall in the middle, behind bulletproof glass and
 * a curved wooden rail, the original: zkSNARKs #1, with the crowd and its phones up. Facing it,
 * the largest canvas in the house, all 10,000 zkSNARKs at once.
 */

const MONA = 1;

export function etats(k: MuseumKit, data: Collection) {
  const f = 2;
  const g = k.groups[f];
  const stone = new THREE.MeshStandardMaterial({ map: limestone("#9a948a"), roughness: 0.85 });
  const stoneLight = new THREE.MeshStandardMaterial({ color: "#c8c2b6", roughness: 0.7 });
  const step = new THREE.MeshStandardMaterial({ color: "#a8a298", roughness: 0.6 });

  // ================= the Daru staircase hall: x −10…10, z 0…−42 =================================
  const DX = 10,
    DL = -42,
    DH = 19;
  const pt = versailles("#8a6040");
  k.plane(f, new THREE.MeshStandardMaterial({ color: "#bdb6aa", roughness: 0.5, envMapIntensity: 0.6 }), 2 * DX, 8, 0, 0, -4);
  k.wall(f, stone, -DX, 0, DX, 0, DH, 0.5, 4);
  k.wall(f, stone, -DX, DL, DX, DL, DH, 0.5, 4);
  k.wall(f, stone, DX, 0, DX, DL, DH, 0.5, 4);
  k.wall(f, stone, -DX, DL, -DX, -6, DH, 0.5, 4);
  k.wall(f, stone, -DX, -2, -DX, 0, DH, 0.5, 4);
  k.box(f, stone, 0.5, DH - 4.2, 4, -DX, 4.2, -4, { uv: 4 });
  // the stairs: 23 steps up to the landing, full width between stone balustrades
  const N = 23,
    RISE = 0.2,
    RUN = 0.48,
    S0 = -7,
    SW = 7.6;
  for (let i = 0; i < N; i++) {
    const z = S0 - i * RUN;
    k.geo(f, step, boxGeo(2 * SW, RISE * (i + 1), RUN, 0, 0, z - RUN / 2));
    k.geo(f, stoneLight, boxGeo(2 * SW, 0.03, 0.06, 0, RISE * (i + 1), z - 0.03));
  }
  const LY = N * RISE,
    LZ0 = S0 - N * RUN,
    LZ1 = -31;
  k.geo(f, step, boxGeo(2 * SW, LY, LZ0 - LZ1, 0, 0, (LZ0 + LZ1) / 2));
  // the two upper flights, left and right of the Victory, to the galleries above
  const M = 20;
  for (const s of [-1, 1]) {
    for (let i = 0; i < M; i++) {
      const z = LZ1 - i * 0.5;
      k.geo(f, step, boxGeo(4.2, LY + RISE * (i + 1), 0.5, s * 5.4, 0, z - 0.25));
    }
    k.geo(f, step, boxGeo(4.2, LY + RISE * M, -1 - (LZ1 - M * 0.5 - DL), s * 5.4, 0, (LZ1 - M * 0.5 + DL) / 2));
    // a lit archway at the top of each flight
    const arch = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 4.4), k.lit("#ffe9c4", 1.2));
    arch.position.set(s * 5.4, LY + RISE * M + 2.2, DL + 0.27);
    g.add(arch);
    k.geo(f, k.gold, new THREE.TorusGeometry(1.7, 0.1, 6, 20, Math.PI).translate(s * 5.4, LY + RISE * M + 4.4, DL + 0.3));
  }
  // the central block between the upper flights: the Victory's backdrop wall of rough stone
  const dark = new THREE.MeshStandardMaterial({ map: limestone("#4e4a46"), roughness: 0.9 });
  k.geo(f, dark, boxGeo(6.4, LY + 9, 1.5, 0, 0, LZ1 - 0.75), 4);
  // balustrades: solid stone parapets with a moulded rail, following the flights
  for (const s of [-1, 1]) {
    const x = s * (SW + 0.2);
    for (let i = 0; i < N; i++) {
      const z = S0 - i * RUN;
      k.geo(f, stoneLight, boxGeo(0.4, RISE * (i + 1) + 1.0, RUN, x, 0, z - RUN / 2));
    }
    k.geo(f, stoneLight, boxGeo(0.4, LY + 1.0, LZ0 - LZ1, x, 0, (LZ0 + LZ1) / 2));
    k.geo(f, stoneLight, boxGeo(0.5, 1.2, 0.5, x, 0, S0 + 0.2));
    k.geo(f, stoneLight, boxGeo(0.7, 0.2, 0.7, x, 1.2, S0 + 0.2));
    // the upper flights' inner parapets
    for (let i = 0; i < M; i += 2) k.geo(f, stoneLight, boxGeo(0.3, LY + RISE * (i + 2) + 1.0, 1.0, s * 3.15, 0, LZ1 - i * 0.5 - 0.5));
  }
  // walkable: the first flight to the landing, the landing round the Victory, the upper flights
  k.solid(f, -DX, DL, -SW, S0);
  k.solid(f, SW, DL, DX, S0);
  k.solid(f, -3.3, DL, 3.3, LZ1);
  k.solid(f, -3.3, -29, 3.3, -23);
  k.solid(f, -SW, DL, -3.3, DL + 0.8);
  k.solid(f, 3.3, DL, SW, DL + 0.8);
  k.grounds[f].push((x, z) => {
    const ax = Math.abs(x);
    if (ax < SW && z <= S0 && z > LZ0) return RISE * (Math.min(N - 1, Math.floor((S0 - z) / RUN)) + 1);
    if (ax < SW && z <= LZ0 && z > LZ1) return LY;
    if (ax > 3.2 && ax < SW && z <= LZ1 && z > DL) return LY + RISE * (Math.min(M - 1, Math.floor((LZ1 - z) / 0.5)) + 1);
    return null;
  });
  // the Victory on her prow, on the landing
  k.vox(f, "victory", wingedVictory, 0, LY, -26, 0, 1.3);
  const vHit = new THREE.Mesh(new THREE.BoxGeometry(8.6, 7.8, 6.5), new THREE.MeshBasicMaterial({ visible: false }));
  vHit.position.set(0, LY + 3.9, -26);
  g.add(vHit);
  k.pick(f, vHit, `<b>Victoire de Samothrace</b><span>the winged zkSNARK</span>`, () => ({ eyebrow: "Escalier Daru", title: "Victoire de Samothrace · zkSNARK", tag: ["Marble", "muted"] }));
  // the vault: gold mosaic over the landing, a skylight, cream coffers elsewhere
  const mos = goldMosaic();
  mos.repeat.set(5, 4);
  k.plane(f, new THREE.MeshStandardMaterial({ map: mos, roughness: 0.35, metalness: 0.6, emissive: "#2a1c06", envMapIntensity: 1.5 }), 2 * DX, -DL, 0, DH, DL / 2, Math.PI / 2);
  const st = skylight();
  st.repeat.set(4, 4);
  k.plane(f, k.lit("#f6faff", 1.2, "sky", st), 8, 8, 0, DH - 0.05, -24, Math.PI / 2);
  // cornices and string courses
  for (const y of [4.2, DH - 1.2]) {
    k.geo(f, stoneLight, boxGeo(2 * DX, 0.35, 0.5, 0, y, -0.4));
    k.geo(f, stoneLight, boxGeo(2 * DX, 0.35, 0.5, 0, y, DL + 0.4));
    k.geo(f, stoneLight, boxGeo(0.5, 0.35, -DL, DX - 0.4, y, DL / 2));
    k.geo(f, stoneLight, boxGeo(0.5, 0.35, -DL, -DX + 0.4, y, DL / 2));
  }
  k.geo(f, k.gold, boxGeo(2 * DX, 0.12, 0.3, 0, DH - 0.85, DL + 0.5));
  // tall arched niches in the side walls above the stairs
  for (const s of [-1, 1])
    for (const z of [-14, -24, -34]) {
      const n = new THREE.Mesh(new THREE.PlaneGeometry(3, 6), new THREE.MeshStandardMaterial({ color: "#8e887e", roughness: 0.9 }));
      n.position.set(s * (DX - 0.26), 8.5, z);
      n.rotation.y = s < 0 ? FACE.px : FACE.nx;
      g.add(n);
      k.geo(f, stoneLight, new THREE.TorusGeometry(1.5, 0.12, 6, 20, Math.PI).rotateY(Math.PI / 2).translate(s * (DX - 0.3), 11.5, z));
    }
  k.light(f, 7, 11, -17, "#fff2dc", 40, 30);
  k.light(f, 0, 5, -4, "#ffe6c4", 25, 16);
  k.pool(f, 0, -4, 4, "#fff0d8");
  // lifts on the front wall; the sign to the Salle des États
  lifts(k, f, 4.5, -0.27, FACE.nz, 2.3);
  const toEtats = k.panel(f, 1024, 300, 3.2, (c, w, h) => {
    c.fillStyle = "#26272b";
    c.fillRect(0, 0, w, h);
    c.fillStyle = "#4a7ad8";
    c.fillRect(0, 0, 22, h);
    c.fillStyle = "#fff";
    c.font = `700 92px Helvetica, Arial, sans-serif`;
    c.fillText("← Salle des États", 60, 130);
    c.font = `400 52px Helvetica, Arial, sans-serif`;
    c.fillStyle = "#c9c9cc";
    c.fillText("zkSNARKs #1 · the original", 62, 230);
  });
  toEtats.position.set(-DX + 0.27, 5.6, -4);
  toEtats.rotation.y = FACE.px;

  // ================= the Salle des États: x −42…−12, z 4…−24 ======================================
  const X0 = -42,
    X1 = -12,
    Z0 = 4,
    Z1 = -24,
    H = 10;
  const blue = new THREE.MeshStandardMaterial({ color: "#2a3a52", roughness: 0.9 });
  const cream = new THREE.MeshStandardMaterial({ color: "#e4d8bc", roughness: 0.75 });
  pt.repeat.set((X1 - X0) / 2, (Z0 - Z1) / 2);
  k.plane(f, new THREE.MeshStandardMaterial({ map: pt, roughness: 0.4, envMapIntensity: 0.7 }), X1 - X0, Z0 - Z1, (X0 + X1) / 2, 0, (Z0 + Z1) / 2);
  // the passage from the Daru
  k.plane(f, new THREE.MeshStandardMaterial({ color: "#bdb6aa", roughness: 0.5 }), 2.2, 4, -11, 0.003, -4);
  k.wall(f, stone, -12, -6, -10, -6, 4.2, 0.3);
  k.wall(f, stone, -12, -2, -10, -2, 4.2, 0.3);
  k.box(f, stone, 2, 0.4, 4, -11, 4.2, -4);
  k.wall(f, blue, X0, Z0, X1, Z0, H, 0.4);
  k.wall(f, blue, X0, Z1, X1, Z1, H, 0.4);
  k.wall(f, blue, X0, Z0, X0, Z1, H, 0.4);
  k.wall(f, blue, X1, Z0, X1, -2, H, 0.4);
  k.wall(f, blue, X1, -6, X1, Z1, H, 0.4);
  k.box(f, blue, 0.4, H - 4.2, 4, X1, 4.2, -4);
  // dado, cornice, a gilt picture rail
  for (const [x0, z0, x1, z1] of [
    [X0, Z0 - 0.2, X1, Z0 - 0.2],
    [X0, Z1 + 0.2, X1, Z1 + 0.2],
    [X0 + 0.2, Z0, X0 + 0.2, Z1],
    [X1 - 0.2, Z0, X1 - 0.2, Z1],
  ]) {
    const ax = z0 === z1;
    const len = ax ? x1 - x0 : z0 - z1;
    const cx = (x0 + x1) / 2,
      cz = (z0 + z1) / 2;
    k.geo(f, k.black, boxGeo(ax ? len : 0.1, 0.25, ax ? 0.1 : len, cx, 0, cz));
    k.geo(f, cream, boxGeo(ax ? len : 0.5, 0.6, ax ? 0.5 : len, cx, H - 0.6, cz));
    k.geo(f, k.gold, boxGeo(ax ? len : 0.56, 0.08, ax ? 0.56 : len, cx, H - 0.68, cz));
    k.geo(f, k.gold, boxGeo(ax ? len : 0.08, 0.04, ax ? 0.08 : len, cx, H - 1.4, cz));
  }
  // the ceiling: a cream coffered border round one great skylight
  const cw = X1 - X0,
    cd = Z0 - Z1;
  const sk = skylight();
  sk.repeat.set(cw / 2.5, cd / 2.5);
  k.plane(f, k.lit("#f2f6ff", 1.05, "sky", sk), cw - 6, cd - 6, (X0 + X1) / 2, H + 0.6, (Z0 + Z1) / 2, Math.PI / 2);
  const ring = [
    [cw, 3, (X0 + X1) / 2, Z0 - 1.5],
    [cw, 3, (X0 + X1) / 2, Z1 + 1.5],
    [3, cd - 6, X0 + 1.5, (Z0 + Z1) / 2],
    [3, cd - 6, X1 - 1.5, (Z0 + Z1) / 2],
  ];
  for (const [w, d, x, z] of ring) k.geo(f, cream, boxGeo(w, 0.3, d, x, H, z));
  // the light well's sloping sides up to the glass
  for (const [w, d, x, z] of [
    [cw - 6, 0.2, (X0 + X1) / 2, Z0 - 3],
    [cw - 6, 0.2, (X0 + X1) / 2, Z1 + 3],
    [0.2, cd - 6, X0 + 3, (Z0 + Z1) / 2],
    [0.2, cd - 6, X1 - 3, (Z0 + Z1) / 2],
  ])
    k.geo(f, cream, boxGeo(w, 0.6, d, x, H, z));
  k.geo(f, k.gold, boxGeo(cw - 6, 0.08, 0.1, (X0 + X1) / 2, H - 0.02, Z0 - 3));
  k.geo(f, k.gold, boxGeo(cw - 6, 0.08, 0.1, (X0 + X1) / 2, H - 0.02, Z1 + 3));

  // ---- the original, zkSNARKs #1, on its own wall behind glass ---------------------------------
  const WX = -34.5,
    WZ = -10;
  const panelMat = new THREE.MeshStandardMaterial({ color: "#1e2a3c", roughness: 0.8 });
  k.box(f, panelMat, 0.9, 6, 11, WX - 0.45, 0, WZ, { solid: true });
  k.geo(f, k.gold, boxGeo(0.95, 0.06, 11.05, WX - 0.45, 6, WZ));
  k.geo(f, k.gold, boxGeo(0.95, 0.04, 11.05, WX - 0.45, 0.3, WZ));
  // the painting: a full-resolution portrait in a heavy gilt frame
  const P = 1.05;
  const monaTex = k.texture(ZScan.zkSnarkImage(MONA), f);
  const frame = new THREE.Group();
  frame.position.set(WX + 0.05, 2.55, WZ);
  frame.rotation.y = FACE.px;
  const fm = new THREE.Mesh(new THREE.BoxGeometry(P * 1.5, P * 1.5, 0.14), k.gold);
  fm.position.z = 0.07;
  const fm2 = new THREE.Mesh(new THREE.BoxGeometry(P * 1.24, P * 1.24, 0.18), new THREE.MeshStandardMaterial({ color: "#8a6420", roughness: 0.4, metalness: 0.8 }));
  fm2.position.z = 0.1;
  const pic = new THREE.Mesh(new THREE.PlaneGeometry(P, P), new THREE.MeshBasicMaterial({ map: monaTex, color: "#f4eee4" }));
  pic.position.z = 0.2;
  frame.add(fm, fm2, pic);
  g.add(frame);
  // the bulletproof vitrine: a glass box with a dark bronze frame, a little lamp above
  const vx = WX + 0.45;
  const vglass = new THREE.MeshStandardMaterial({ color: "#8a9aa2", roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.05, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 0.5 });
  k.box(f, vglass, 0.04, 2.7, 2.6, vx + 0.3, 1.2, WZ);
  k.box(f, new THREE.MeshStandardMaterial({ color: "#3a3028", roughness: 0.4, metalness: 0.7 }), 0.7, 1.2, 2.7, vx, 0, WZ);
  for (const dz of [-1.3, 1.3]) k.box(f, k.black, 0.7, 2.7, 0.06, vx, 1.2, WZ + dz);
  k.box(f, k.black, 0.7, 0.08, 2.7, vx, 3.9, WZ);
  k.box(f, vglass, 0.7, 0.02, 2.6, vx, 3.92, WZ);
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.04, 1.6), k.lit("#fff2d8", 2));
  lamp.position.set(vx + 0.2, 3.85, WZ);
  g.add(lamp);
  k.wash(f, WX + 0.02, WZ, FACE.px, 2.4, 3.2, 5.6, "#b8a888");
  k.pool(f, WX + 2.2, WZ, 3.2, "#fff0d8", 0.012, 1.2);
  k.solid(f, WX, WZ - 1.4, vx + 0.4, WZ + 1.4);
  // its cartel, bigger than the others
  const cartel = k.panel(f, 900, 300, 0.75, (c, w, h) => {
    c.fillStyle = "#efe9dc";
    c.fillRect(0, 0, w, h);
    c.fillStyle = "#1d1a17";
    c.font = `700 72px ${SERIF}`;
    c.fillText("zkSNARKs #1", 30, 95);
    c.font = `italic 44px ${SERIF}`;
    c.fillStyle = "#5a544c";
    c.fillText("the original", 30, 165);
    c.font = `500 40px "JetBrains Mono", Menlo, monospace`;
    c.fillStyle = "#6a1c1c";
    c.fillText("mint 2026-09-17", 30, 245);
  });
  cartel.position.set(WX + 0.02, 1.7, WZ + 1.75);
  cartel.rotation.y = FACE.px;
  const monaHit = [pic, fm, fm2];
  for (const o of monaHit)
    k.pick(
      f,
      o,
      () => data.hover(MONA),
      () => data.info(MONA, "Salle des États · the original"),
    );
  // the curved wooden rail in front, then the rope that holds the crowd
  const RR = 3.4;
  for (let i = 0; i < 18; i++) {
    const a0 = -Math.PI / 2 + (i / 18) * Math.PI,
      a1 = -Math.PI / 2 + ((i + 1) / 18) * Math.PI;
    const p = new THREE.Vector3(WX + Math.cos(a0) * RR, 0, WZ + Math.sin(a0) * RR),
      q = new THREE.Vector3(WX + Math.cos(a1) * RR, 0, WZ + Math.sin(a1) * RR);
    const len = p.distanceTo(q) + 0.02;
    const mid = p.clone().add(q).multiplyScalar(0.5);
    const ang = Math.atan2(q.x - p.x, q.z - p.z);
    const geoRail = new THREE.BoxGeometry(0.3, 1.05, len).rotateY(ang).translate(mid.x, 0.525, mid.z);
    k.geo(f, k.oak, geoRail);
    k.geo(f, k.gold, new THREE.BoxGeometry(0.34, 0.05, len).rotateY(ang).translate(mid.x, 1.06, mid.z));
    k.solid(f, Math.min(p.x, q.x) - 0.15, Math.min(p.z, q.z) - 0.15, Math.max(p.x, q.x) + 0.15, Math.max(p.z, q.z) + 0.15);
  }
  const RQ = 5.6;
  for (let i = 0; i < 8; i++) {
    const a0 = -Math.PI / 2 + 0.02 + (i / 8) * (Math.PI - 0.04),
      a1 = -Math.PI / 2 + 0.02 + ((i + 1) / 8) * (Math.PI - 0.04);
    const p = [WX + Math.cos(a0) * RQ, WZ + Math.sin(a0) * RQ],
      q = [WX + Math.cos(a1) * RQ, WZ + Math.sin(a1) * RQ];
    const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
    const ang = Math.atan2(q[0] - p[0], q[1] - p[1]);
    k.vox(f, "rope2", () => stanchions(2), (p[0] + q[0]) / 2, 0, (p[1] + q[1]) / 2, ang - Math.PI / 2, 0.5 * (len / 2.15));
    k.solid(f, Math.min(p[0], q[0]) - 0.1, Math.min(p[1], q[1]) - 0.1, Math.max(p[0], q[0]) + 0.1, Math.max(p[1], q[1]) + 0.1);
  }

  // ---- facing it: all 10,000, the largest canvas in the house -----------------------------------
  const MS = 6.8,
    MZ = -13.4;
  const mosaicTex = k.texture(`${API}/v1/collections/zksnarks/map/image`, f);
  mosaicTex.minFilter = THREE.LinearMipmapLinearFilter;
  const mosaic = new THREE.Mesh(new THREE.PlaneGeometry(MS, MS), new THREE.MeshBasicMaterial({ map: mosaicTex, color: "#ece6dc" }));
  mosaic.position.set(X1 - 0.34, 1.6 + MS / 2, MZ);
  mosaic.rotation.y = FACE.nx;
  g.add(mosaic);
  const fr = (dz: number, dy: number, w: number, h: number) => k.geo(f, k.gold, boxGeo(0.32, h, w, X1 - 0.36, dy, MZ + dz));
  fr(0, 1.1, MS + 1, 0.5);
  fr(0, 1.6 + MS, MS + 1, 0.5);
  fr(-(MS / 2 + 0.25), 1.1, 0.5, MS + 1);
  fr(MS / 2 + 0.25, 1.1, 0.5, MS + 1);
  for (const dz of [-(MS / 2 + 0.25), MS / 2 + 0.25]) for (const dy of [1.1, 1.6 + MS]) k.geo(f, k.gold, boxGeo(0.4, 0.62, 0.62, X1 - 0.4, dy - 0.06, MZ + dz));
  k.wash(f, X1 - 0.33, MZ - 2.2, FACE.nx, 4, 7, H - 0.8, "#fff0d8");
  k.wash(f, X1 - 0.33, MZ + 2.2, FACE.nx, 4, 7, H - 0.8, "#fff0d8");
  const mlab = k.panel(f, 900, 220, 1.2, (c, w, h) => {
    c.fillStyle = "#efe9dc";
    c.fillRect(0, 0, w, h);
    c.fillStyle = "#1d1a17";
    c.font = `700 64px ${SERIF}`;
    c.fillText("Les 10 000", 30, 90);
    c.font = `500 38px "JetBrains Mono", Menlo, monospace`;
    c.fillStyle = "#6a1c1c";
    c.fillText("zkSNARKs #1 → #10,000", 30, 170);
  });
  mlab.position.set(X1 - 0.35, 0.9, MZ + MS / 2 + 1.1);
  mlab.rotation.y = FACE.nx;
  k.pick(
    f,
    mosaic,
    (hit) => {
      const id = mosaicId(hit);
      return id ? data.hover(id) : null;
    },
    (hit) => {
      const id = mosaicId(hit);
      return id ? data.info(id, "Salle des États · Les 10 000") : null;
    },
  );
  for (const dz of [-2.4, 2.4]) {
    k.vox(f, "banq", () => banquette(2.4), X1 - 5.5, 0, MZ + dz, Math.PI / 2, 0.5);
    k.solid(f, X1 - 5.85, MZ + dz - 1.2, X1 - 5.15, MZ + dz + 1.2);
  }

  // ---- the Venetians on the long walls ------------------------------------------------------------
  let rank = 71;
  for (const [z, yaw] of [
    [Z0 - 0.2, FACE.nz],
    [Z1 + 0.2, FACE.pz],
  ] as const)
    for (const x of [-37, -29, -21]) {
      k.hang(f, { x, y: 3.6, z, yaw, s: 2.7, rank: rank++ });
      k.wash(f, x, z, yaw, 5, 6, H - 1, "#ffe8c8");
    }
  k.hang(f, { x: X0 + 0.2, y: 3.4, z: -2, yaw: FACE.px, s: 2.2, rank: rank++ });
  k.hang(f, { x: X0 + 0.2, y: 3.4, z: -18, yaw: FACE.px, s: 2.2, rank: rank++ });

  // ---- lights -------------------------------------------------------------------------------
  k.light(f, -26, 8, -10, "#fff4e4", 90, 30);
  k.light(f, WX + 4, 5.5, WZ, "#fff0d8", 10, 10);
  k.light(f, X1 - 4, 7, MZ, "#fff0d8", 40, 16);
  k.pool(f, -24, -10, 9, "#f4f6ff", 0.011, 0.7);

  // ---- people: the crowd before #1, phones up; the Daru's climbers; guards -------------------------
  let n = 0;
  const id = () => k.visitor(2000 + n++);
  for (let row = 0; row < 4; row++) {
    const r = RQ + 0.6 + row * 0.75;
    const cnt = 7 + row * 2;
    for (let i = 0; i < cnt; i++) {
      const a = -Math.PI / 2 + 0.35 + ((i + (row % 2) * 0.5) / cnt) * (Math.PI - 0.7);
      void k.person(f, id(), [WX + Math.cos(a) * r, WZ + Math.sin(a) * r], { face: [WX, WZ], phone: (i + row) % 3 !== 2, screen: monaTex });
    }
  }
  void k.person(f, id(), [WX + 2.2, WZ - 1.9], { guard: true, face: [WX + 6, WZ - 2] });
  void k.person(f, id(), [WX + 2.2, WZ + 1.9], { guard: true, face: [WX + 6, WZ + 2] });
  void k.person(f, id(), [X1 - 3, MZ + 0.6], { face: [X1, MZ] });
  void k.person(f, id(), [X1 - 3.4, MZ - 1.4], { face: [X1, MZ - 1], phone: true, screen: mosaicTex });
  void k.person(f, id(), [X1 - 5.4, MZ + 2.6], { perch: 0.5, face: [X1, MZ + 2.6] });
  for (const [x, z] of [
    [-30, 1.4],
    [-22, -21.6],
    [-36, -21.4],
  ])
    void k.person(f, id(), [x, z], { face: [x, z + (z > 0 ? 3 : -3)] });
  const salleWalk: [number, number][] = [
    [-16, 0],
    [-16, -20],
    [-24, -20],
    [-24, 1],
    [-20, -10],
  ];
  for (let i = 0; i < 3; i++) void k.person(f, id(), salleWalk[i], { wander: salleWalk });
  // on the Daru: a few on the steps looking up, one photographing
  for (const [x, i, ph] of [
    [-3, 4, false],
    [2.5, 8, true],
    [-1.2, 13, false],
    [4.6, 17, true],
    [-5, 19, false],
  ] as const) {
    void k.person(f, id(), [x, S0 - i * RUN - RUN / 2], { face: [0, -26], phone: ph }).then((s) => {
      if (s) s.root.position.y = RISE * (i + 1);
    });
  }
  void k.person(f, id(), [-2.4, -2.4], { face: [0, -20] });
  void k.person(f, id(), [6.5, -4.5], { guard: true, face: [0, -4] });

  k.finish(f);
  return { spawn: new THREE.Vector3(0, 0, -2.4), yaw: 0 };
}

/** The item under a point of the 10,000 (atlas: item n at row ⌊(n−1)/100⌋, column (n−1) mod 100). */
function mosaicId(hit: THREE.Intersection) {
  if (!hit.uv) return null;
  const col = Math.min(99, Math.floor(hit.uv.x * 100)),
    row = Math.min(99, Math.floor((1 - hit.uv.y) * 100));
  return row * 100 + col + 1;
}
