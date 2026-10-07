import * as THREE from "three";
import type { Rect } from "../types";
import { BACK, BX, BZ, GD, GH, GOLD, GW, HX, HZ, LOWER, MONO, PL, PW, RC, ROOF, SILVER, UPPER, WALK, along, canvasTex, rng } from "./layout";
import { Merge, ribbonGeo } from "./merge";

/**
 * The ground itself: the striped pitch with its lines, the two-tier bowl with its walkway,
 * vomitories and the players' tunnel, the ring roof on trusses, floodlight masts, LED boards, the
 * goals and their nets, dugouts, corner flags, photographers. Everything static is merged into a
 * handful of meshes.
 */

export interface Bowl {
  /** Walker colliders: the stand's walkway (0) and the pitch (1). */
  rects: Rect[][];
  /** The two jumbotrons' screens (canvas textures drawn by screens.ts). */
  screens: { mesh: THREE.Mesh; g: CanvasRenderingContext2D; t: THREE.CanvasTexture }[];
  /** Goal nets: shaken when the ball hits them. */
  nets: THREE.Mesh[][];
  tick(dt: number, t: number): void;
}

/** Vomitories: centres along x on the north (-1) and south (+1) straights. The south one at x = 0 is the way out. */
export const VOMS: [number, 1 | -1][] = [
  [0, 1],
  [-20, 1],
  [20, 1],
  [-14, -1],
  [14, -1],
  [0, -1],
];
const VOM_D1 = UPPER.d0 + 3 * UPPER.dd; // they cut the first three upper rows
const VOM_TOP = UPPER.y0 + 2 * UPPER.dy + 0.35;
const TUN_D1 = LOWER.d0 + 5 * LOWER.dd;
const TUN_TOP = LOWER.y0 + 4 * LOWER.dy + 0.3;

/** Is (x, z) in a gap of the bowl (vomitory, tunnel) for a band starting at d? */
export function holeAt(x: number, z: number, d: number) {
  if (d >= UPPER.d0 - 0.01 && d < VOM_D1 - 0.05) for (const [c, s] of VOMS) if (Math.sign(z) === s && Math.abs(z) > HZ && Math.abs(x - c) < 2) return true;
  if (d < TUN_D1 - 0.05 && z > HZ - 0.5 && Math.abs(x) < 2) return true;
  return false;
}

export function buildBowl(scene: THREE.Scene): Bowl {
  const st = new Merge(); // lit, vertex-coloured
  const glow = new Merge(); // emissive
  const R = rng(77);

  // ---- the pitch ---------------------------------------------------------------------------
  const PX = 32;
  const pitchTex = canvasTex(Math.round(2 * HX * PX), Math.round(2 * HZ * PX), (g) => {
    const X = (x: number) => (x + HX) * PX,
      Z = (z: number) => (z + HZ) * PX;
    g.fillStyle = "#2b4f30";
    g.fillRect(0, 0, g.canvas.width, g.canvas.height);
    // mown stripes inside the boards
    for (let i = 0, x = -BX; x < BX; x += 4.2, i++) {
      g.fillStyle = i % 2 ? "#3f8f3e" : "#4b9d46";
      g.fillRect(X(x), Z(-BZ), 4.2 * PX + 1, 2 * BZ * PX);
    }
    // a lighter crosshatch: the second mowing pass
    for (let i = 0, z = -BZ; z < BZ; z += 4.2, i++) {
      g.fillStyle = i % 2 ? "rgba(255,255,255,0.035)" : "rgba(0,0,0,0.03)";
      g.fillRect(X(-BX), Z(z), 2 * BX * PX, 4.2 * PX + 1);
    }
    // turf grain
    const r = rng(5);
    for (let i = 0; i < 26000; i++) {
      g.fillStyle = r() < 0.5 ? "rgba(0,0,0,0.07)" : "rgba(220,255,200,0.05)";
      g.fillRect(r() * g.canvas.width, r() * g.canvas.height, 2 + r() * 3, 2);
    }
    // worn goalmouths
    for (const sx of [-1, 1]) {
      const gr = g.createRadialGradient(X(sx * (PL - 2)), Z(0), 0, X(sx * (PL - 2)), Z(0), 5 * PX);
      gr.addColorStop(0, "rgba(120,100,60,0.35)");
      gr.addColorStop(1, "rgba(120,100,60,0)");
      g.fillStyle = gr;
      g.fillRect(X(sx * (PL - 2)) - 5 * PX, Z(0) - 5 * PX, 10 * PX, 10 * PX);
    }
    // the club crest mown into the centre circle: the Zcash Z
    g.save();
    g.translate(X(0), Z(0));
    g.strokeStyle = "rgba(255,255,255,0.10)";
    g.fillStyle = "rgba(255,255,255,0.10)";
    g.lineWidth = 0.6 * PX;
    g.beginPath();
    g.arc(0, 0, 3.6 * PX, 0, Math.PI * 2);
    g.stroke();
    const u = PX * 0.5;
    g.beginPath();
    g.moveTo(-3.6 * u, -3.4 * u);
    g.lineTo(3.6 * u, -3.4 * u);
    g.lineTo(3.6 * u, -2.0 * u);
    g.lineTo(-1.2 * u, 2.0 * u);
    g.lineTo(3.6 * u, 2.0 * u);
    g.lineTo(3.6 * u, 3.4 * u);
    g.lineTo(-3.6 * u, 3.4 * u);
    g.lineTo(-3.6 * u, 2.0 * u);
    g.lineTo(1.2 * u, -2.0 * u);
    g.lineTo(-3.6 * u, -2.0 * u);
    g.closePath();
    g.fill();
    g.fillRect(-0.6 * u, -5.2 * u, 1.2 * u, 1.8 * u);
    g.fillRect(-0.6 * u, 3.4 * u, 1.2 * u, 1.8 * u);
    g.restore();
    // the lines
    g.strokeStyle = "rgba(226,232,224,0.82)";
    g.fillStyle = "rgba(226,232,224,0.82)";
    g.lineWidth = 0.13 * PX;
    g.strokeRect(X(-PL), Z(-PW), 2 * PL * PX, 2 * PW * PX);
    g.beginPath();
    g.moveTo(X(0), Z(-PW));
    g.lineTo(X(0), Z(PW));
    g.stroke();
    const circle = (x: number, z: number, r: number, a0 = 0, a1 = Math.PI * 2) => {
      g.beginPath();
      g.arc(X(x), Z(z), r * PX, a0, a1);
      g.stroke();
    };
    const spot = (x: number, z: number) => {
      g.beginPath();
      g.arc(X(x), Z(z), 0.16 * PX, 0, Math.PI * 2);
      g.fill();
    };
    circle(0, 0, 5.5);
    spot(0, 0);
    for (const s of [-1, 1]) {
      const gx = s * PL;
      // penalty area 9 × 20, goal area 3 × 10, spot at 8, the D
      g.strokeRect(X(Math.min(gx, gx - s * 9)), Z(-10), 9 * PX, 20 * PX);
      g.strokeRect(X(Math.min(gx, gx - s * 3)), Z(-5), 3 * PX, 10 * PX);
      spot(gx - s * 8, 0);
      const a = Math.acos(1 / 5.5);
      if (s > 0) circle(gx - 8, 0, 5.5, Math.PI - a, Math.PI + a);
      else circle(gx + 8, 0, 5.5, -a, a);
      for (const zs of [-1, 1]) {
        const a0 = s > 0 ? (zs > 0 ? Math.PI : Math.PI / 2) : zs > 0 ? -Math.PI / 2 : 0;
        circle(gx, zs * PW, 1, a0, a0 + Math.PI / 2);
      }
    }
  });
  const pitch = new THREE.Mesh(new THREE.PlaneGeometry(2 * HX, 2 * HZ), new THREE.MeshStandardMaterial({ map: pitchTex.t, roughness: 0.95, metalness: 0 }));
  pitch.rotation.x = -Math.PI / 2;
  scene.add(pitch);

  // ---- the bowl ------------------------------------------------------------------------------
  const concrete = "#34323b",
    riser = "#45424e",
    black = "#16151b",
    steel = "#2c2b34",
    steelL = "#8c8e9a";
  const skipFor = (d: number) => (x: number, z: number) => holeAt(x, z, d);
  // lower tier: padded front wall (black with a gold pinstripe), then the rows
  st.ribbon(0, 0, 0, LOWER.y0 - 0.12, black);
  st.ribbon(-0.02, LOWER.y0 - 0.32, -0.02, LOWER.y0 - 0.22, GOLD);
  st.ribbon(0, LOWER.y0 - 0.12, 0, LOWER.y0, steelL);
  st.ribbon(0, LOWER.y0, LOWER.d0, LOWER.y0, concrete, skipFor(0));
  for (let r = 0; r < LOWER.rows; r++) {
    const d = LOWER.d0 + r * LOWER.dd,
      y = LOWER.y0 + r * LOWER.dy;
    if (r > 0) st.ribbon(d, y - LOWER.dy, d, y, riser, skipFor(d));
    st.ribbon(d, y, d + LOWER.dd, y, concrete, skipFor(d));
  }
  const lowTop = LOWER.y0 + (LOWER.rows - 1) * LOWER.dy;
  // the walkway: a step up, the walk, the glass parapet over the lower tier
  st.ribbon(WALK.d0, lowTop, WALK.d0, WALK.y, riser);
  st.ribbon(WALK.d0, WALK.y, WALK.d1, WALK.y, "#3a3843");
  st.ribbon(WALK.d0 + 0.15, WALK.y + 0.002, WALK.d0 + 0.3, WALK.y + 0.002, GOLD);
  st.ribbon(WALK.d0 - 0.04, WALK.y + 1.02, WALK.d0 + 0.08, WALK.y + 1.02, steelL);
  // upper tier: the LED band is its front riser (built below), then the rows and the back rail
  for (let r = 0; r < UPPER.rows; r++) {
    const d = UPPER.d0 + r * UPPER.dd,
      y = UPPER.y0 + r * UPPER.dy;
    if (r > 0) st.ribbon(d, y - UPPER.dy, d, y, riser, skipFor(d));
    st.ribbon(d, y, d + UPPER.dd, y, concrete, skipFor(d));
  }
  const upTop = UPPER.y0 + (UPPER.rows - 1) * UPPER.dy;
  st.ribbon(BACK, upTop, BACK, upTop + 1.1, black);
  st.ribbon(BACK, upTop + 1.1, BACK + 0.4, upTop + 1.1, steel);
  // glass parapet
  const glass = new THREE.Mesh(ribbonGeo(WALK.d0, lowTop, WALK.d0, WALK.y + 1.0, "#9fb4c8"), new THREE.MeshStandardMaterial({ color: "#9fc0d8", transparent: true, opacity: 0.18, roughness: 0.1, metalness: 0.3, side: THREE.DoubleSide, depthWrite: false }));
  scene.add(glass);

  // ---- vomitories and the tunnel portal ----------------------------------------------------
  for (const [c, s] of VOMS) {
    const z0 = s * (HZ + UPPER.d0),
      z1 = s * (HZ + VOM_D1);
    const zc = (z0 + z1) / 2,
      depth = Math.abs(z1 - z0);
    for (const w of [-1, 1]) st.box(0.6, VOM_TOP - WALK.y, depth, c + w * 2.3, WALK.y, zc, riser);
    st.box(5.2, 0.35, depth, c, VOM_TOP - 0.35, zc, riser);
    st.box(4.0, VOM_TOP - WALK.y, 0.2, c, WALK.y, z1, "#0a0a0e");
    st.box(4.0, 0.1, depth, c, VOM_TOP - 0.45, zc, "#121117");
    // a gold lintel and the number
    glow.box(4.2, 0.08, 0.06, c, VOM_TOP - 0.42, z0 + s * 0.02, new THREE.Color(GOLD).multiplyScalar(1.6));
    st.box(4.0, 0.02, depth, c, WALK.y + 0.002, zc, "#2c2a33");
  }
  {
    const z0 = HZ,
      z1 = HZ + TUN_D1;
    const zc = (z0 + z1) / 2,
      depth = z1 - z0;
    for (const w of [-1, 1]) st.box(0.6, TUN_TOP, depth, w * 2.3, 0, zc, black);
    st.box(5.2, 0.4, depth, 0, TUN_TOP - 0.4, zc, black);
    st.box(4.0, TUN_TOP, 0.2, 0, 0, z1, "#07070a");
    glow.box(4.4, 0.1, 0.08, 0, TUN_TOP - 0.1, z0 - 0.02, new THREE.Color(GOLD).multiplyScalar(2));
    for (const w of [-1, 1]) glow.box(0.1, TUN_TOP - 0.1, 0.08, w * 2.15, 0, z0 - 0.02, new THREE.Color(GOLD).multiplyScalar(2));
  }
  // the players' tunnel out onto the pitch: a ribbed black-and-gold tube through the board gap
  {
    const tz0 = 20.9,
      tz1 = HZ;
    const len = tz1 - tz0;
    const shell = new THREE.CylinderGeometry(2.05, 2.05, len, 18, 1, true, -Math.PI / 2, Math.PI);
    shell.rotateX(Math.PI / 2);
    st.add(shell.scale(1, 1.25, 1), "#121116", new THREE.Matrix4().makeTranslation(0, 0, (tz0 + tz1) / 2));
    for (let i = 0; i <= 4; i++) {
      const rib = new THREE.TorusGeometry(2.1, 0.07, 6, 18, Math.PI).scale(1, 1.25, 1);
      glow.add(rib, new THREE.Color(i === 0 ? GOLD : "#b8851a").multiplyScalar(i === 0 ? 2 : 1.1), new THREE.Matrix4().makeTranslation(0, 0, tz0 + (len * i) / 4));
    }
    const sign = canvasTex(512, 96, (g) => {
      g.fillStyle = "#121116";
      g.fillRect(0, 0, 512, 96);
      g.fillStyle = GOLD;
      g.font = `900 64px ${MONO}`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText("ZEC · ZEC · ZEC", 256, 52);
    });
    const sm = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.6), new THREE.MeshBasicMaterial({ map: sign.t, toneMapped: false }));
    sm.position.set(0, 2.15, tz0 - 0.05);
    scene.add(sm);
  }

  // ---- the roof: ring on radial trusses, open lattice band, floodlight fascia ---------------
  st.ribbon(ROOF.d0, ROOF.y + 1.0, ROOF.d1, ROOF.y + 2.6, "#d9dbe2");
  st.ribbon(ROOF.d0, ROOF.y, ROOF.d1, ROOF.y + 0.4, "#131218");
  st.ribbon(ROOF.d0, ROOF.y - 1.2, ROOF.d0, ROOF.y + 1.0, black);
  glow.add(ribbonGeo(ROOF.d0 - 0.05, ROOF.y - 1.15, ROOF.d0 - 0.05, ROOF.y - 0.95, null), new THREE.Color(GOLD).multiplyScalar(1.8));
  glow.add(ribbonGeo(ROOF.d0 - 0.05, ROOF.y + 0.75, ROOF.d0 - 0.05, ROOF.y + 0.85, null), new THREE.Color(GOLD).multiplyScalar(1.2));
  const trussPts: THREE.Vector3[][] = [];
  along(0, 7.5, (x, z, nx, nz) => {
    const a = new THREE.Vector3(x + nx * ROOF.d0, ROOF.y - 0.6, z + nz * ROOF.d0),
      b = new THREE.Vector3(x + nx * (BACK + 1), ROOF.y - 0.6, z + nz * (BACK + 1));
    st.beam(a, b, 0.3, steel, 0.3);
    st.beam(a.clone().setY(ROOF.y), b.clone().setY(ROOF.y), 0.18, steel);
    // the bracing zig-zag under each truss
    for (let k = 0; k < 6; k++) {
      const p = a.clone().lerp(b, k / 6),
        q = a.clone().lerp(b, (k + 1) / 6).setY(ROOF.y);
      st.beam(p, q, 0.08, steelL);
    }
    // the column at the back holding it up
    const col = new THREE.Vector3(x + nx * (BACK + 0.8), upTop + 1.1, z + nz * (BACK + 0.8));
    st.beam(col, col.clone().setY(ROOF.y), 0.45, steel);
    trussPts.push([a, b]);
  });
  // the back of the bowl: dark cladding fins between the top rail and the roof, the city between them
  along(BACK + 0.9, 1.5, (x, z, nx, nz) => {
    st.box(0.3, ROOF.y - upTop - 1.1, 0.7, x, upTop + 1.1, z, "#1a1920", Math.atan2(nx, nz));
  });
  glow.add(ribbonGeo(BACK + 0.55, upTop + 1.14, BACK + 0.55, upTop + 1.22, null), new THREE.Color(GOLD).multiplyScalar(1.4));
  // floodlight panels along the fascia: white emissive lamps, tilted at the pitch
  {
    const lamps = new THREE.BoxGeometry(1.5, 0.45, 0.25);
    const lampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.25, 1.3, 1.4), toneMapped: false });
    const list: THREE.Matrix4[] = [];
    along(ROOF.d0 - 0.25, 2.4, (x, z, nx, nz) => {
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.7, Math.atan2(-nx, -nz), 0, "YXZ"));
      list.push(new THREE.Matrix4().compose(new THREE.Vector3(x, ROOF.y - 1.45, z), q, new THREE.Vector3(1, 1, 1)));
    });
    const im = new THREE.InstancedMesh(lamps, lampMat, list.length);
    list.forEach((m, i) => im.setMatrixAt(i, m));
    scene.add(im);
    // their housings
    list.forEach((m) => {
      const p = new THREE.Vector3().setFromMatrixPosition(m);
      st.box(1.7, 0.12, 0.5, p.x, p.y + 0.22, p.z, steel, new THREE.Euler().setFromRotationMatrix(m).y);
    });
  }

  // ---- floodlight masts in the four corners --------------------------------------------------
  const lampTex = canvasTex(256, 160, (g) => {
    g.fillStyle = "#15141a";
    g.fillRect(0, 0, 256, 160);
    for (let i = 0; i < 6; i++)
      for (let j = 0; j < 4; j++) {
        const cx = 22 + i * 42.4,
          cy = 22 + j * 39;
        const gr = g.createRadialGradient(cx, cy, 0, cx, cy, 19);
        gr.addColorStop(0, "#ffffff");
        gr.addColorStop(0.55, "#e8f2ff");
        gr.addColorStop(1, "#5c6880");
        g.fillStyle = gr;
        g.beginPath();
        g.arc(cx, cy, 17, 0, Math.PI * 2);
        g.fill();
      }
  });
  const beamMat = new THREE.MeshBasicMaterial({ color: "#cfe0ff", transparent: true, opacity: 0.008, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  for (const [sx, sz] of [
    [1, 1],
    [1, -1],
    [-1, -1],
    [-1, 1],
  ]) {
    const n = new THREE.Vector2(sx, sz).normalize();
    const base = new THREE.Vector3(sx * (HX - RC) + n.x * (RC + BACK + 6), 0, sz * (HZ - RC) + n.y * (RC + BACK + 6));
    const top = 41;
    // a lattice tower
    for (const [ox, oz] of [
      [-0.8, -0.8],
      [0.8, -0.8],
      [0.8, 0.8],
      [-0.8, 0.8],
    ])
      st.beam(new THREE.Vector3(base.x + ox * 1.6, 0, base.z + oz * 1.6), new THREE.Vector3(base.x + ox, top, base.z + oz), 0.22, "#3a3946");
    for (let y = 2; y < top; y += 3) {
      const k = 1.6 - (0.6 * y) / top;
      const w = 1.6 * k;
      st.beam(new THREE.Vector3(base.x - 0.8 * k, y, base.z - 0.8 * k), new THREE.Vector3(base.x + 0.8 * k, y + 3, base.z + 0.8 * k), 0.07, steelL);
      st.beam(new THREE.Vector3(base.x + 0.8 * k, y, base.z - 0.8 * k), new THREE.Vector3(base.x - 0.8 * k, y + 3, base.z + 0.8 * k), 0.07, steelL);
      void w;
    }
    // the head: a lamp bank looking down at the centre spot
    const head = new THREE.Group();
    head.position.set(base.x, top + 2.2, base.z);
    head.lookAt(0, -14, 0);
    const bank = new THREE.Mesh(new THREE.PlaneGeometry(8, 5), new THREE.MeshBasicMaterial({ map: lampTex.t, toneMapped: false, color: new THREE.Color(1.6, 1.6, 1.7) }));
    const backPlate = new THREE.Mesh(new THREE.BoxGeometry(8.4, 5.4, 0.5), new THREE.MeshStandardMaterial({ color: "#24232c", roughness: 0.7 }));
    backPlate.position.z = -0.3;
    head.add(bank, backPlate);
    // the light beam, as a faint cone
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(4, 22, 70, 20, 1, true).translate(0, -35, 0).rotateX(-Math.PI / 2), beamMat);
    head.add(beam);
    scene.add(head);
  }

  // ---- LED boards: the pitch-side cage and the band along the upper tier ---------------------
  const ledTex = canvasTex(2048, 64, (g) => {
    const names = ["ZCASH", "ZEC", "ZSCAN.CASH", "ORCHARD", "SHIELDED", "IRONWOOD", "ZSTREET", "HALO 2"];
    names.forEach((n, i) => {
      const x = i * 256;
      const inv = i % 2 === 1;
      g.fillStyle = inv ? "#0c0b10" : GOLD;
      g.fillRect(x, 0, 256, 64);
      g.fillStyle = inv ? GOLD : "#0c0b10";
      g.font = `900 ${n.length > 8 ? 30 : 40}px ${MONO}`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(n, x + 128, 35);
    });
    // LED dot mask
    g.fillStyle = "rgba(0,0,0,0.28)";
    for (let y = 0; y < 64; y += 3) g.fillRect(0, y, 2048, 1);
    for (let x = 0; x < 2048; x += 3) g.fillRect(x, 0, 1, 64);
  });
  ledTex.t.wrapS = THREE.RepeatWrapping;
  ledTex.t.repeat.x = -1;
  const ledMat = new THREE.MeshBasicMaterial({ map: ledTex.t, toneMapped: false, color: new THREE.Color(1.0, 1.0, 1.0), side: THREE.DoubleSide });
  const upperLed = new THREE.Mesh(ribbonGeo(UPPER.d0 - 0.02, WALK.y + 0.12, UPPER.d0 - 0.02, UPPER.y0 - 0.05, null, skipFor(UPPER.d0), 32 * 1.0), ledMat);
  scene.add(upperLed);
  st.ribbon(UPPER.d0, WALK.y, UPPER.d0, UPPER.y0, black, skipFor(UPPER.d0));
  // pitch-side boards: a strip of planes on frames, u in metres / 32 (one texture = 32 m)
  const ledTex2 = ledTex.t.clone();
  ledTex2.needsUpdate = true;
  const boardMat = new THREE.MeshBasicMaterial({ map: ledTex2, toneMapped: false, color: new THREE.Color(1.05, 1.05, 1.05), side: THREE.DoubleSide });
  const boardH = 0.95;
  const boards: [number, number, number, number][] = [
    // x0, z0, x1, z1 (face looks at the pitch)
    [-BX, BZ, -2.6, BZ],
    [2.6, BZ, BX, BZ],
    [BX, -BZ, -BX, -BZ],
    [BX, BZ, BX, -BZ],
    [-BX, -BZ, -BX, BZ],
  ];
  {
    const pos: number[] = [],
      uv: number[] = [];
    let u = 0;
    for (const [x0, z0, x1, z1] of boards) {
      const len = Math.hypot(x1 - x0, z1 - z0);
      const u0 = u / 32,
        u1 = (u + len) / 32;
      pos.push(x0, 0.05, z0, x1, 0.05, z1, x1, boardH, z1, x0, 0.05, z0, x1, boardH, z1, x0, boardH, z0);
      uv.push(u0, 0, u1, 0, u1, 1, u0, 0, u1, 1, u0, 1);
      u += len;
      // the frame behind it
      const cx = (x0 + x1) / 2,
        cz = (z0 + z1) / 2;
      if (z0 === z1) st.box(len, boardH + 0.05, 0.3, cx, 0, cz + Math.sign(cz) * 0.17, black);
      else st.box(0.3, boardH + 0.05, len, cx + Math.sign(cx) * 0.17, 0, cz, black);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    // nudge the faces a hair towards the pitch
    const p = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i),
        z = p.getZ(i);
      if (Math.abs(Math.abs(z) - BZ) < 0.01 && Math.abs(x) < BX - 0.01) p.setZ(i, z - Math.sign(z) * 0.02);
      else if (Math.abs(Math.abs(x) - BX) < 0.01 && Math.abs(z) < BZ - 0.01) p.setX(i, x - Math.sign(x) * 0.02);
    }
    scene.add(new THREE.Mesh(g, boardMat));
  }
  // the flat padded wall in front of the stands, under the lower tier: dark green turf runs to it

  // ---- goals ---------------------------------------------------------------------------------
  const netTex = canvasTex(64, 64, (g) => {
    g.clearRect(0, 0, 64, 64);
    g.strokeStyle = "rgba(255,255,255,0.95)";
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(0, 32);
    g.lineTo(32, 0);
    g.lineTo(64, 32);
    g.lineTo(32, 64);
    g.closePath();
    g.stroke();
  });
  netTex.t.wrapS = netTex.t.wrapT = THREE.RepeatWrapping;
  const netMat = new THREE.MeshBasicMaterial({ map: netTex.t, transparent: true, alphaTest: 0.25, side: THREE.DoubleSide, color: "#e8eaf0" });
  const nets: THREE.Mesh[][] = [];
  const white = "#f3f4f6";
  for (const s of [-1, 1]) {
    const gx = s * PL;
    for (const z of [-GW, GW]) st.cyl(0.065, GH, gx + s * 0.065, 0, z, white, 10);
    const bar = new THREE.CylinderGeometry(0.065, 0.065, 2 * GW + 0.13, 10).rotateX(Math.PI / 2);
    st.add(bar, white, new THREE.Matrix4().makeTranslation(gx + s * 0.065, GH, 0));
    // back frame
    const bx = gx + s * GD;
    for (const z of [-GW, GW]) {
      st.beam(new THREE.Vector3(gx + s * 0.065, GH, z), new THREE.Vector3(bx, GH - 0.5, z), 0.05, "#c9ccd4");
      st.beam(new THREE.Vector3(bx, 0, z), new THREE.Vector3(bx, GH - 0.5, z), 0.05, "#c9ccd4");
      st.beam(new THREE.Vector3(gx, 0.02, z), new THREE.Vector3(bx, 0.02, z), 0.05, "#c9ccd4");
    }
    st.beam(new THREE.Vector3(bx, 0.02, -GW), new THREE.Vector3(bx, 0.02, GW), 0.05, "#c9ccd4");
    st.beam(new THREE.Vector3(bx, GH - 0.5, -GW), new THREE.Vector3(bx, GH - 0.5, GW), 0.05, "#c9ccd4");
    // nets: back, two sides, roof
    const plane = (w: number, h: number) => {
      const g = new THREE.PlaneGeometry(w, h, 6, 4);
      const uv = g.attributes.uv as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (w / 0.14), uv.getY(i) * (h / 0.14));
      return g;
    };
    const set: THREE.Mesh[] = [];
    const back = new THREE.Mesh(plane(2 * GW, GH - 0.5), netMat);
    back.position.set(bx, (GH - 0.5) / 2, 0);
    back.rotation.y = Math.PI / 2;
    const roofLen = Math.hypot(GD, 0.5);
    const roofN = new THREE.Mesh(plane(roofLen, 2 * GW), netMat);
    roofN.position.set(gx + (s * GD) / 2, GH - 0.25, 0);
    roofN.rotation.set(-Math.PI / 2, 0, -s * Math.atan2(0.5, GD), "ZYX");
    set.push(back, roofN);
    for (const z of [-GW, GW]) {
      const side = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(s * GD, 0), new THREE.Vector2(s * GD, GH - 0.5), new THREE.Vector2(0, GH)])), netMat);
      const uv = side.geometry.attributes.uv as THREE.BufferAttribute;
      const pp = side.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, pp.getX(i) / 0.14, pp.getY(i) / 0.14);
      side.position.set(gx, 0, z);
      set.push(side);
    }
    for (const m of set) {
      m.userData.rest = m.position.clone();
      scene.add(m);
    }
    nets.push(set);
  }

  // ---- corner flags --------------------------------------------------------------------------
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      st.cyl(0.03, 1.6, sx * PL, 0, sz * PW, white, 6);
      st.box(0.02, 0.32, 0.42, sx * PL, 1.26, sz * PW - sz * 0.21, sx > 0 ? SILVER : GOLD, Math.PI / 2 + (sx > 0 ? 0.2 : -0.2));
    }

  // ---- dugouts ----------------------------------------------------------------------------------
  const smoke = new THREE.MeshStandardMaterial({ color: "#a8c4dc", transparent: true, opacity: 0.28, roughness: 0.05, metalness: 0.2, side: THREE.DoubleSide, depthWrite: false });
  for (const sx of [-1, 1]) {
    const cx = sx * 11,
      z0 = BZ + 0.45,
      z1 = HZ - 0.05;
    const kit = sx < 0 ? GOLD : SILVER;
    st.box(7, 0.18, z1 - z0, cx, 0, (z0 + z1) / 2, "#2a2930");
    st.box(7, 2.3, 0.15, cx, 0, z1 - 0.08, black);
    for (const e of [-1, 1]) st.box(0.1, 2.3, z1 - z0, cx + e * 3.5, 0, (z0 + z1) / 2, steelL);
    const shell = new THREE.Mesh(new THREE.CylinderGeometry(z1 - z0, z1 - z0, 7, 16, 1, true, 0, Math.PI / 2).rotateZ(Math.PI / 2).rotateY(Math.PI), smoke);
    shell.position.set(cx, 0.3, z1);
    scene.add(shell);
    for (let i = 0; i < 7; i++) {
      const x = cx - 3 + i;
      st.box(0.5, 0.42, 0.45, x, 0.18, z1 - 0.45, kit);
      st.box(0.5, 0.65, 0.1, x, 0.6, z1 - 0.2, kit);
      if (i % 3 !== 1) {
        // substitutes in tracksuits
        st.box(0.42, 0.62, 0.32, x, 0.6, z1 - 0.48, sx < 0 ? "#1b1a21" : "#3a4256");
        st.box(0.3, 0.3, 0.3, x, 1.22, z1 - 0.48, i % 2 ? "#c99a74" : "#7a5238");
        st.box(0.36, 0.14, 0.42, x, 0.6, z1 - 0.8, sx < 0 ? "#1b1a21" : "#3a4256");
        st.box(0.42, 0.06, 0.32, x, 0.9, z1 - 0.48, kit);
      }
    }
    // the coach, in the technical area
    const cxx = cx + sx * 4.6;
    st.box(0.36, 0.85, 0.24, cxx, 0, BZ + 1.0, "#111015");
    st.box(0.5, 0.75, 0.3, cxx, 0.85, BZ + 1.0, sx < 0 ? "#141318" : "#2e3446");
    st.box(0.32, 0.32, 0.32, cxx, 1.6, BZ + 1.0, "#d2a27c");
    st.box(0.34, 0.09, 0.34, cxx, 1.9, BZ + 1.0, "#2a1d16");
    st.box(0.5, 0.06, 0.32, cxx, 1.5, BZ + 1.0, kit);
  }

  // ---- photographers behind the boards, TV gantry --------------------------------------------
  for (const sx of [-1, 1])
    for (const z of [-11, -7.5, -4, 4.5, 8, 12]) {
      const x = sx * (BX + 1.1);
      const vest = z % 2 ? "#e9ff6a" : "#ff8a3a";
      st.box(0.44, 0.5, 0.38, x, 0, z, "#1d1c22");
      st.box(0.46, 0.5, 0.32, x, 0.5, z, vest);
      st.box(0.28, 0.28, 0.28, x, 1.0, z, z > 0 ? "#c99a74" : "#6e4a33");
      st.box(0.5, 0.16, 0.16, x - sx * 0.4, 0.85, z, "#0d0d10", 0);
      st.box(0.18, 0.2, 0.18, x - sx * 0.08, 0.78, z, "#26262c");
    }
  // TV gantry on the north stand's walkway
  for (const x of [-6, 0, 6]) {
    const z = -(HZ + WALK.d0 + 1.0);
    st.box(1.2, 0.9, 1.2, x, WALK.y, z, "#26252c");
    st.box(0.5, 0.45, 1.0, x, WALK.y + 1.2, z + 0.1, "#18171c");
    st.box(0.2, 0.2, 0.5, x, WALK.y + 1.32, z + 0.7, "#08080a");
    st.cyl(0.05, 1.2, x, WALK.y, z, "#555560", 6);
    st.box(0.42, 1.2, 0.3, x + 0.6, WALK.y, z - 0.2, "#202027");
    st.box(0.3, 0.3, 0.3, x + 0.6, WALK.y + 1.2, z - 0.2, "#c99a74");
  }

  // ---- the stadium's name on the north roof, and big flags hanging at the back ----------------
  {
    const name = canvasTex(1600, 160, (g) => {
      g.clearRect(0, 0, 1600, 160);
      g.font = `900 112px ${MONO}`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.shadowColor = GOLD;
      g.shadowBlur = 24;
      g.fillStyle = GOLD;
      g.fillText("BLOCK STADIUM", 800, 84);
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(26, 2.6), new THREE.MeshBasicMaterial({ map: name.t, transparent: true, toneMapped: false, color: new THREE.Color(1.5, 1.5, 1.5), depthWrite: false }));
    m.position.set(0, ROOF.y + 2.4, -(HZ + ROOF.d0) + 0.02);
    scene.add(m);
    const jp = canvasTex(800, 160, (g) => {
      g.clearRect(0, 0, 800, 160);
      g.font = `800 96px "Hiragino Sans", "Noto Sans JP", sans-serif`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillStyle = "#ffffff";
      g.fillText("ブロック競技場", 400, 84);
    });
    const m2 = new THREE.Mesh(new THREE.PlaneGeometry(13, 2.6), new THREE.MeshBasicMaterial({ map: jp.t, transparent: true, toneMapped: false, depthWrite: false }));
    m2.position.set(0, ROOF.y + 2.4, HZ + ROOF.d0 - 0.02);
    m2.rotation.y = Math.PI;
    scene.add(m2);
  }
  // tifo banners draped over the front of the lower tiers
  const banner = (text: string, bg: string, fg: string, w: number, x: number, z: number, ry: number, sub?: string) => {
    const H = 1.1;
    const cw = 1024,
      ch = Math.round((cw * H) / w);
    const t = canvasTex(cw, ch, (g) => {
      g.fillStyle = bg;
      g.fillRect(0, 0, cw, ch);
      g.fillStyle = fg;
      g.fillRect(0, ch * 0.06, cw, ch * 0.04);
      g.fillRect(0, ch * 0.9, cw, ch * 0.04);
      g.font = `900 ${Math.round(ch * (sub ? 0.5 : 0.62))}px ${MONO}`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(text, cw / 2, ch * (sub ? 0.42 : 0.52));
      if (sub) {
        g.font = `700 ${Math.round(ch * 0.17)}px ${MONO}`;
        g.fillText(sub, cw / 2, ch * 0.76);
      }
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, H), new THREE.MeshStandardMaterial({ map: t.t, roughness: 0.9 }));
    m.position.set(x, 1.15, z);
    m.rotation.y = ry;
    scene.add(m);
  };
  banner("SHIELDED ULTRAS", "#0e0d12", GOLD, 14, -16, -HZ + 0.03, 0, "SINCE BLOCK 0");
  banner("ZEC", GOLD, "#0e0d12", 7, 0, -HZ + 0.03, 0);
  banner("PRIVACY FC", "#0e0d12", GOLD, 12, 16, -HZ + 0.03, 0);
  banner("TRANSPARENT ARMY", "#2a3040", SILVER, 14, HX - 0.03, -9, -Math.PI / 2);
  banner("ZK ULTRAS", GOLD, "#0e0d12", 12, -HX + 0.03, 8, Math.PI / 2);
  banner("SHIELD BY DEFAULT", "#0e0d12", GOLD, 14, 22, HZ - 0.03, Math.PI);

  // ---- the jumbotrons: in the two north corners, hung from the roof, turned to the centre spot --
  const screens: Bowl["screens"] = [];
  for (const sx of [-1, 1]) {
    const n = new THREE.Vector2(sx, -1).normalize();
    const cx = sx * (HX - RC) + n.x * (RC + 6.5),
      cz = -(HZ - RC) + n.y * (RC + 6.5);
    const y = 15.6;
    const W = 13,
      H = 6.0;
    const grp = new THREE.Group();
    grp.position.set(cx, y, cz);
    grp.rotation.y = Math.atan2(-cx, -cz);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(W + 0.8, H + 0.8, 1.2), new THREE.MeshStandardMaterial({ color: "#121116", roughness: 0.6, metalness: 0.3 }));
    frame.position.z = -0.62;
    const c = document.createElement("canvas");
    c.width = 1024;
    c.height = Math.round((1024 * H) / W);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ map: t, toneMapped: false, color: new THREE.Color(1.15, 1.15, 1.15) }));
    scr.position.z = 0.01;
    const trim = new THREE.Mesh(new THREE.BoxGeometry(W + 0.9, 0.12, 0.1), glowMatC(GOLD, 2));
    trim.position.set(0, -H / 2 - 0.42, 0.02);
    const trim2 = trim.clone();
    trim2.position.y = H / 2 + 0.42;
    grp.add(frame, scr, trim, trim2);
    scene.add(grp);
    grp.updateMatrixWorld();
    // the cables up to the roof
    for (const e of [-1, 1]) {
      const p = new THREE.Vector3(e * (W / 2 - 0.5), H / 2 + 0.4, -0.6).applyMatrix4(grp.matrixWorld);
      st.beam(p, p.clone().setY(ROOF.y), 0.06, "#2b2a31");
    }
    screens.push({ mesh: scr, g: c.getContext("2d")!, t });
  }

  // ---- materials, merged meshes --------------------------------------------------------------
  const stMesh = st.build(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.05, side: THREE.DoubleSide }));
  const glowMesh = glow.build(new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, side: THREE.DoubleSide }));
  scene.add(stMesh, glowMesh);
  void trussPts;
  void R;

  // ---- colliders ----------------------------------------------------------------------------
  const zw0 = HZ + WALK.d0,
    zw1 = HZ + WALK.d1;
  const xEnd = HX - RC;
  const walkRects: Rect[] = [
    [-xEnd - 1, zw0 - 0.6, xEnd + 1, zw0 + 0.15],
    [-xEnd - 1, zw1, xEnd + 1, zw1 + 0.5],
    [-xEnd - 0.4, zw0 - 0.6, -xEnd + 0.2, zw1 + 0.5],
    [xEnd - 0.2, zw0 - 0.6, xEnd + 0.4, zw1 + 0.5],
    // the south walkway's gantries at the ends
    ...VOMS.filter(([c, s]) => s > 0 && c !== 0).flatMap(([c]): Rect[] => [
      [c - 2.6, zw1 - 0.05, c - 2.0, zw1 + 0.5],
      [c + 2.0, zw1 - 0.05, c + 2.6, zw1 + 0.5],
    ]),
  ];
  // gates at the ends of the walkway
  for (const e of [-1, 1]) {
    st.box(0.12, 1.1, zw1 - zw0, e * xEnd, WALK.y, (zw0 + zw1) / 2, steelL);
  }
  const pitchRects: Rect[] = [
    [-BX - 0.3, BZ, -2.6, BZ + 0.4],
    [2.6, BZ, BX + 0.3, BZ + 0.4],
    [-BX - 0.3, -BZ - 0.4, BX + 0.3, -BZ],
    [BX, -BZ, BX + 0.4, BZ],
    [-BX - 0.4, -BZ, -BX, BZ],
    // the tunnel's walls and its far end
    [-2.4, BZ - 1.3, -2.0, HZ + TUN_D1],
    [2.0, BZ - 1.3, 2.4, HZ + TUN_D1],
    [-2.4, HZ + TUN_D1 - 0.2, 2.4, HZ + TUN_D1 + 0.2],
  ];
  for (const s of [-1, 1]) {
    const gx = s * PL;
    const xa = Math.min(gx, gx + s * GD),
      xb = Math.max(gx, gx + s * GD);
    pitchRects.push([xa - 0.08, -GW - 0.1, xb + 0.08, -GW + 0.05], [xa - 0.08, GW - 0.05, xb + 0.08, GW + 0.1], [s > 0 ? xb - 0.05 : xa - 0.05, -GW, s > 0 ? xb + 0.05 : xa + 0.05, GW]);
  }

  // scrolling LED
  return {
    rects: [walkRects, pitchRects],
    screens,
    nets,
    tick(dt) {
      ledTex.t.offset.x = (ledTex.t.offset.x + dt * 0.03) % 1;
      ledTex2.offset.x = (ledTex2.offset.x - dt * 0.05) % 1;
    },
  };
}

function glowMatC(color: string, k: number) {
  return new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), toneMapped: false });
}
