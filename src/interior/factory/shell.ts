import * as THREE from "three";
import { hash } from "../../scene/voxel/model";
import { vendingMachine } from "../../scene/voxel/props";
import type { Theme } from "../../scene/theme";
import type { Rect } from "../types";
import { Boxes, fanMaterial, GLASS, GLOW, rotorGeometry, SOLID, voxObj } from "./batch";
import { canvasTex, drawWall as wallTexture, GOLD, hazardSign, JP, makeCanvas, MONO, neonSign, verticalNeon } from "./canvas";
import { BACK_Z, BELT, CTRL, DOCKS, DOOR_H, DOOR_W, EAVE, LANES_X, LANES_Z, MAIN_Z, MID_Z, PODS, PRESS, RACK, RIDGE, ROBOT, SEG_LEN, SEGS, X0, X1, Z0, Z1, AGV_STOP } from "./layout";
import { lockersModel } from "./voxels";
import { memePoster } from "../../scene/memes";
import { nextMeme } from "../../scene/memewalls";

/**
 * The building around the miners: painted floor, clad walls, the sawtooth roof with its glazing
 * (sky by day, violet at night, like the outside), trusses and high-bay lamps, the overhead cranes,
 * the cooling wall of giant fans, the dock doors, the lobby under the control room, the charging
 * bay, the workshop and the pallet racking along the back wall.
 */

const TEETH = 12;
const TOOTH = (Z1 - Z0) / TEETH;

function stripes(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, k = 10) {
  g.save();
  g.beginPath();
  g.rect(x, y, w, h);
  g.clip();
  g.fillStyle = "#16151a";
  g.fillRect(x, y, w, h);
  g.fillStyle = "#e0a820";
  for (let i = -h - w; i < w + h; i += k * 2) {
    g.beginPath();
    g.moveTo(x + i, y + h);
    g.lineTo(x + i + k, y + h);
    g.lineTo(x + i + k + h, y);
    g.lineTo(x + i + h, y);
    g.fill();
  }
  g.restore();
}

/** The hall floor: sealed concrete, lanes with their lines, crossings, pod numbers, hatched zones. */
function hallFloor() {
  const S = 16;
  const W = (X1 - X0) * S,
    H = (Z1 - Z0) * S;
  const { c, g } = makeCanvas(W, H);
  const X = (x: number) => (x - X0) * S,
    Z = (z: number) => (z - Z0) * S;
  g.fillStyle = "#34343b";
  g.fillRect(0, 0, W, H);
  for (let y = 0; y < H; y += 8)
    for (let x = 0; x < W; x += 8) {
      const n = hash(x, y, 7, 1);
      if (n > 0.6) {
        g.fillStyle = n > 0.9 ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.08)";
        g.fillRect(x, y, 8, 8);
      }
    }
  // saw cuts every 6 m
  g.fillStyle = "rgba(0,0,0,0.35)";
  for (let x = 0; x < W; x += 6 * S) g.fillRect(x, 0, 2, H);
  for (let y = 0; y < H; y += 6 * S) g.fillRect(0, y, W, 2);
  // tyre marks along the lanes
  for (let i = 0; i < 400; i++) {
    const lx = LANES_X[i % LANES_X.length];
    const z = -14 - hash(i, 2, 3, 4) * 48;
    g.fillStyle = "rgba(0,0,0,0.12)";
    g.fillRect(X(lx + (hash(i, 1, 1, 1) - 0.5) * 1.6), Z(z), 3, (2 + hash(i, 5, 5, 5) * 5) * S);
  }
  // cross aisles: dark band, yellow edges, white dashed centre line
  for (const [z, xe] of LANES_Z) {
    g.fillStyle = "#2a2a30";
    g.fillRect(X(-62.5), Z(z - 2.4), X(xe + 2.4) - X(-62.5), 4.8 * S);
    g.fillStyle = "#e0a820";
    g.fillRect(X(-62.5), Z(z - 2.4), X(xe + 2.4) - X(-62.5), 0.12 * S);
    g.fillRect(X(-62.5), Z(z + 2.3), X(xe + 2.4) - X(-62.5), 0.12 * S);
    g.fillStyle = "rgba(240,240,236,0.8)";
    for (let x = -61; x < xe; x += 3) g.fillRect(X(x), Z(z) - 1, 1.5 * S, 3);
  }
  // north–south lanes: dashed centre, zebra crossings where they meet the cross aisles
  for (const x of LANES_X) {
    const xe = x;
    g.fillStyle = "rgba(240,240,236,0.55)";
    for (let z = BACK_Z + 3; z < MAIN_Z - 3; z += 3) if (Math.abs(z - MID_Z) > 3 || xe < 40) g.fillRect(X(x) - 1, Z(z), 3, 1.5 * S);
    for (const [zc, xend] of LANES_Z) {
      if (x > xend + 0.1) continue;
      g.fillStyle = "rgba(240,240,236,0.75)";
      for (let k = -1.2; k <= 1.2; k += 0.6) g.fillRect(X(x + k) - 0.18 * S, Z(zc + 2.6), 0.36 * S, 0.9 * S);
      g.fillStyle = "rgba(240,240,236,0.9)";
      g.fillRect(X(x - 1.5), Z(zc - 3.1), 3 * S, 0.25 * S);
    }
  }
  // the avenue: wider, a gold line down its middle, arrows both ways
  g.fillStyle = "#2a2a30";
  g.fillRect(X(-4.6), Z(BACK_Z), 9.2 * S, Z(MAIN_Z) - Z(BACK_Z));
  g.fillStyle = GOLD;
  g.fillRect(X(-0.08), Z(BACK_Z), 0.16 * S, Z(MAIN_Z) - Z(BACK_Z));
  g.fillStyle = "#e0a820";
  g.fillRect(X(-4.6), Z(BACK_Z), 0.12 * S, Z(MAIN_Z) - Z(BACK_Z));
  g.fillRect(X(4.5), Z(BACK_Z), 0.12 * S, Z(MAIN_Z) - Z(BACK_Z));
  const arrow = (x: number, z: number, dir: number) => {
    g.save();
    g.translate(X(x), Z(z));
    g.rotate(dir);
    g.fillStyle = "rgba(240,240,236,0.7)";
    g.beginPath();
    g.moveTo(0, -1.2 * S);
    g.lineTo(0.6 * S, -0.3 * S);
    g.lineTo(0.2 * S, -0.3 * S);
    g.lineTo(0.2 * S, 0.9 * S);
    g.lineTo(-0.2 * S, 0.9 * S);
    g.lineTo(-0.2 * S, -0.3 * S);
    g.lineTo(-0.6 * S, -0.3 * S);
    g.fill();
    g.restore();
  };
  for (let z = -20; z > -60; z -= 9) {
    arrow(-2, z, 0);
    arrow(2, z - 4, Math.PI);
  }
  for (let x = -55; x < 55; x += 14) {
    arrow(x, MAIN_Z - 1.1, -Math.PI / 2);
    arrow(x + 7, MAIN_Z + 1.1, Math.PI / 2);
  }
  // pods: yellow outline, hatched ends, the pod's name painted in front of each end
  for (const p of PODS)
    for (const s of SEGS) {
      const x0 = p.x - RACK.hot - RACK.d - 0.25,
        x1 = p.x + RACK.hot + RACK.d + 0.25;
      const z0 = s.z0 + 0.25,
        z1 = s.z0 - SEG_LEN - 0.25;
      g.strokeStyle = "#e0a820";
      g.lineWidth = 3;
      g.strokeRect(X(x0), Z(z1), (x1 - x0) * S, (z0 - z1) * S);
      stripes(g, X(x0), Z(z0) - 0.4 * S, (x1 - x0) * S, 0.4 * S);
      stripes(g, X(x0), Z(z1), (x1 - x0) * S, 0.4 * S);
      g.fillStyle = "rgba(240,240,236,0.82)";
      g.font = MONO(30, 800);
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(`${p.name}${s.name}`, X(p.x), Z(s.z0 + 1.2));
    }
  // green pedestrian walkway along the lobby edge and across the avenue
  g.fillStyle = "rgba(61,200,120,0.55)";
  g.fillRect(X(-62), Z(-9.2), 124 * S, 1.2 * S);
  g.fillStyle = "rgba(240,240,236,0.8)";
  for (let x = -4.4; x < 4.4; x += 0.8) g.fillRect(X(x), Z(-15.4), 0.4 * S, 5.6 * S);
  // hatched no-go zones: press, robot cell, dock aprons, under the crane hooks
  const zone = (x0: number, z0: number, x1: number, z1: number) => {
    stripes(g, X(x0), Z(z0), (x1 - x0) * S, 0.3 * S);
    stripes(g, X(x0), Z(z1) - 0.3 * S, (x1 - x0) * S, 0.3 * S);
    stripes(g, X(x0), Z(z0), 0.3 * S, (z1 - z0) * S);
    stripes(g, X(x1) - 0.3 * S, Z(z0), 0.3 * S, (z1 - z0) * S);
  };
  zone(PRESS.x - 4, PRESS.z - 4.5, PRESS.x + 4, PRESS.z + 3.2);
  zone(ROBOT.x - 2.6, ROBOT.z - 2.6, ROBOT.x + 1.6, ROBOT.z + 2.6);
  for (const dz of DOCKS) {
    zone(X1 - 6, dz - DOOR_W / 2, X1 - 0.2, dz + DOOR_W / 2);
    g.save();
    g.translate(X(X1 - 4), Z(dz));
    g.rotate(-Math.PI / 2);
    g.fillStyle = "rgba(240,240,236,0.85)";
    g.font = MONO(44, 900);
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(`D${DOCKS.indexOf(dz) + 1}`, 0, 0);
    g.restore();
  }
  // AGV track: a blue guide line from the robot to the docks
  g.strokeStyle = "rgba(74,160,255,0.85)";
  g.lineWidth = 0.14 * S;
  g.beginPath();
  g.moveTo(X(AGV_STOP.x), Z(AGV_STOP.z));
  g.lineTo(X(55.5), Z(AGV_STOP.z));
  g.lineTo(X(55.5), Z(DOCKS[3]));
  g.stroke();
  for (const dz of DOCKS) {
    g.beginPath();
    g.moveTo(X(55.5), Z(dz));
    g.lineTo(X(X1 - 1.5), Z(dz));
    g.stroke();
  }
  // the lobby: polished dark tiles, the entrance mat, the gold inlay
  g.fillStyle = "#24242b";
  g.fillRect(X(CTRL.x0), Z(CTRL.z0 + 0.4), (CTRL.x1 - CTRL.x0) * S, (Z1 - CTRL.z0 - 0.4) * S);
  g.fillStyle = "#1a1a20";
  for (let x = CTRL.x0; x < CTRL.x1; x += 1.2) g.fillRect(X(x), Z(CTRL.z0 + 0.4), 2, (Z1 - CTRL.z0) * S);
  for (let z = CTRL.z0 + 0.4; z < Z1; z += 1.2) g.fillRect(X(CTRL.x0), Z(z), (CTRL.x1 - CTRL.x0) * S, 2);
  g.fillStyle = "#121216";
  g.fillRect(X(-2), Z(-2.2), 4 * S, 2.2 * S);
  g.strokeStyle = GOLD;
  g.lineWidth = 3;
  g.strokeRect(X(-2) + 4, Z(-2.2) + 4, 4 * S - 8, 2.2 * S - 8);
  g.strokeStyle = "rgba(244,183,40,0.6)";
  g.lineWidth = 4;
  g.beginPath();
  g.arc(X(0), Z(-4.6), 1.3 * S, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = "rgba(244,183,40,0.75)";
  g.font = MONO(34, 900);
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText("ⓩ", X(0), Z(-4.6));
  g.font = JP(26, 900);
  g.fillText("安全第一", X(-7), Z(-4.6));
  g.font = MONO(18, 900);
  g.fillText("SAFETY FIRST", X(7), Z(-4.6));
  // painted words by the lobby
  g.fillStyle = "rgba(244,183,40,0.75)";
  g.font = JP(40, 900);
  g.textAlign = "center";
  g.fillText("歩行者通路", X(-12), Z(-8.6));
  g.font = MONO(26, 900);
  g.fillText("PEDESTRIANS", X(12), Z(-8.6));
  const t = canvasTex(c);
  t.anisotropy = 16;
  return t;
}

/** Glazing of a sawtooth: panes in a grid of mullions (tinted by the theme). */
function glazingTexture() {
  const { c, g } = makeCanvas(256, 64);
  const gr = g.createLinearGradient(0, 0, 0, 64);
  gr.addColorStop(0, "#ffffff");
  gr.addColorStop(1, "#c8c8d8");
  g.fillStyle = gr;
  g.fillRect(0, 0, 256, 64);
  g.fillStyle = "#1a1a20";
  for (let x = 0; x < 256; x += 32) g.fillRect(x, 0, 3, 64);
  g.fillRect(0, 0, 256, 3);
  g.fillRect(0, 31, 256, 2);
  g.fillRect(0, 61, 256, 3);
  const t = canvasTex(c);
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

/** The yard outside the docks: sky, the port's cranes and chimneys, the asphalt, lamps. */
function yardTexture(night: boolean) {
  const { c, g } = makeCanvas(1024, 256);
  const gr = g.createLinearGradient(0, 0, 0, 256);
  if (night) {
    gr.addColorStop(0, "#07061a");
    gr.addColorStop(0.6, "#22164a");
    gr.addColorStop(0.62, "#141220");
    gr.addColorStop(1, "#0c0b10");
  } else {
    gr.addColorStop(0, "#7fb4e8");
    gr.addColorStop(0.6, "#d8e8f4");
    gr.addColorStop(0.62, "#5d5f66");
    gr.addColorStop(1, "#45474e");
  }
  g.fillStyle = gr;
  g.fillRect(0, 0, 1024, 256);
  // silhouettes: ship-to-shore cranes, chimneys with stripes, the data centre, the cooling tower
  g.fillStyle = night ? "#0d0c16" : "#6d7686";
  for (const x of [120, 300]) {
    g.fillRect(x, 60, 10, 98);
    g.fillRect(x + 50, 60, 10, 98);
    g.fillRect(x - 60, 60, 190, 12);
    g.fillRect(x + 20, 40, 24, 22);
  }
  for (const x of [560, 610]) {
    g.fillRect(x, 20, 22, 140);
    g.fillStyle = night ? "#3a1416" : "#c8483e";
    for (let y = 30; y < 150; y += 30) g.fillRect(x, y, 22, 10);
    g.fillStyle = night ? "#0d0c16" : "#6d7686";
  }
  g.beginPath();
  g.moveTo(700, 158);
  g.lineTo(720, 70);
  g.lineTo(800, 70);
  g.lineTo(820, 158);
  g.fill();
  g.fillRect(860, 100, 150, 58);
  if (night) {
    g.fillStyle = "#b07bff";
    for (let x = 870; x < 1000; x += 14) g.fillRect(x, 112, 8, 4);
    g.fillStyle = "#ff3a3a";
    for (const x of [571, 621, 732, 790]) g.fillRect(x, 18, 4, 4);
  }
  // lamp posts with their pools of light
  for (const x of [80, 420, 760]) {
    g.fillStyle = night ? "#1c1b22" : "#4a4c55";
    g.fillRect(x, 90, 5, 72);
    const lg = g.createRadialGradient(x + 2, 200, 0, x + 2, 200, 90);
    lg.addColorStop(0, night ? "rgba(255,200,120,0.45)" : "rgba(255,255,255,0)");
    lg.addColorStop(1, "rgba(255,200,120,0)");
    g.fillStyle = lg;
    g.fillRect(x - 90, 160, 184, 96);
    if (night) {
      g.fillStyle = "#ffd890";
      g.fillRect(x - 3, 88, 11, 4);
    }
  }
  // lane markings on the asphalt
  g.fillStyle = night ? "rgba(224,168,32,0.45)" : "rgba(224,168,32,0.8)";
  for (let x = 0; x < 1024; x += 60) g.fillRect(x, 205, 30, 4);
  return canvasTex(c);
}

export function buildShell(root: THREE.Object3D, ground: Rect[]) {
  const st = new Boxes();
  const glow = new Boxes();

  // ---- floor, ceiling deck -------------------------------------------------------------------
  const floorMat = new THREE.MeshStandardMaterial({ map: hallFloor(), roughness: 0.5, metalness: 0.1, envMapIntensity: 0.35 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(X1 - X0, Z1 - Z0), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set((X0 + X1) / 2, 0, (Z0 + Z1) / 2);
  root.add(floor);

  // ---- walls ---------------------------------------------------------------------------------
  const wallTex = wallTexture(EAVE);
  const wallMat = (len: number) => {
    const t = wallTex.clone();
    t.repeat.set(len / 8, 1);
    t.needsUpdate = true;
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.7, metalness: 0.3 });
  };
  const wall = (x0: number, z0: number, x1: number, z1: number, y0 = 0, y1 = EAVE, collide = true) => {
    const alongX = Math.abs(z0 - z1) < 0.01;
    const len = alongX ? Math.abs(x1 - x0) : Math.abs(z1 - z0);
    const m = new THREE.Mesh(new THREE.BoxGeometry(alongX ? len : 0.4, y1 - y0, alongX ? 0.4 : len), wallMat(len));
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    root.add(m);
    if (collide) ground.push(alongX ? [Math.min(x0, x1), z0 - 0.3, Math.max(x0, x1), z0 + 0.3] : [x0 - 0.3, Math.min(z0, z1), x0 + 0.3, Math.max(z0, z1)]);
  };
  wall(X0 - 0.2, Z0, X0 - 0.2, Z1);
  wall(X0, Z0 - 0.2, X1, Z0 - 0.2);
  wall(X0, Z1 + 0.2, X1, Z1 + 0.2);
  // east wall, cut by the dock doors
  const cuts = [...DOCKS].sort((a, b) => a - b);
  let zc = Z0;
  for (const dz of cuts) {
    wall(X1 + 0.2, zc, X1 + 0.2, dz - DOOR_W / 2);
    wall(X1 + 0.2, dz - DOOR_W / 2, X1 + 0.2, dz + DOOR_W / 2, DOOR_H, EAVE, false);
    ground.push([X1 - 0.6, dz - DOOR_W / 2, X1 + 0.4, dz + DOOR_W / 2]);
    zc = dz + DOOR_W / 2;
  }
  wall(X1 + 0.2, zc, X1 + 0.2, Z1);
  // a gable band between the eaves and the sawtooth on all sides
  const band = new THREE.MeshStandardMaterial({ color: "#1c1b22", roughness: 0.8 });
  for (const [w, d, x, z] of [
    [X1 - X0, 0.4, 0, Z0 - 0.2],
    [X1 - X0, 0.4, 0, Z1 + 0.2],
    [0.4, Z1 - Z0, X0 - 0.2, (Z0 + Z1) / 2],
    [0.4, Z1 - Z0, X1 + 0.2, (Z0 + Z1) / 2],
  ]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, RIDGE - EAVE + 0.4, d), band);
    m.position.set(x, (EAVE + RIDGE) / 2, z);
    root.add(m);
  }

  // ---- sawtooth roof: slopes, glazing, trusses, lamps -----------------------------------------
  const glazeTex = glazingTexture();
  glazeTex.repeat.set((X1 - X0) / 8, 1);
  const glazeMat = new THREE.MeshBasicMaterial({ map: glazeTex, toneMapped: false, color: new THREE.Color(1.2, 1.3, 1.5) });
  const slopeMat = new THREE.MeshStandardMaterial({ color: "#26252d", roughness: 0.85, metalness: 0.3, side: THREE.DoubleSide });
  const slopeLen = Math.hypot(TOOTH, RIDGE - EAVE);
  const slopeAng = Math.atan2(RIDGE - EAVE, TOOTH);
  const glazeGeo = new THREE.PlaneGeometry(X1 - X0, RIDGE - EAVE - 0.4);
  const slopeGeo = new THREE.PlaneGeometry(X1 - X0, slopeLen);
  for (let k = 0; k < TEETH; k++) {
    const za = Z0 + k * TOOTH;
    // the first tooth's glazing would be behind the wall screen
    if (k > 0) {
      const gl = new THREE.Mesh(glazeGeo, glazeMat);
      gl.position.set(0, (EAVE + RIDGE) / 2 + 0.2, za + 0.02);
      root.add(gl);
    }
    const sl = new THREE.Mesh(slopeGeo, slopeMat);
    sl.position.set(0, (EAVE + RIDGE) / 2, za + TOOTH / 2);
    sl.rotation.x = slopeAng - Math.PI / 2;
    root.add(sl);
    // purlins along x on the slope
    for (let f = 0.15; f < 1; f += 0.2) st.add("#33323b", X1 - X0, 0.18, 0.12, 0, RIDGE - (RIDGE - EAVE) * f - 0.25, za + TOOTH * f);
    // lattice truss under the glazing, spanning the hall
    const yb = EAVE - 1.6;
    // the first truss stops short of the wall screen (a deep beam carries the roof over it)
    const gap = (x: number) => k === 1 && Math.abs(x) < 15.5;
    const gapLamp = (x: number) => k <= 1 && Math.abs(x) < 15.5;
    for (const yy of [yb, EAVE - 0.15]) {
      if (k === 1) for (const s of [-1, 1]) st.add("#3a3944", X1 - 15.5, 0.22, 0.25, (s * (X1 + 15.5)) / 2, yy, za + 0.3);
      else st.add("#3a3944", X1 - X0, 0.22, 0.25, 0, yy, za + 0.3);
    }
    for (let x = X0 + 1; x < X1; x += 2.5) {
      if (gap(x) || gap(x + 2.5)) continue;
      st.beam("#3a3944", new THREE.Vector3(x, yb + 0.1, za + 0.3), new THREE.Vector3(x + 1.25, EAVE - 0.05, za + 0.3), 0.1);
      st.beam("#3a3944", new THREE.Vector3(x + 1.25, EAVE - 0.05, za + 0.3), new THREE.Vector3(x + 2.5, yb + 0.1, za + 0.3), 0.1);
    }
    // high-bay lamps hung from the truss, every 8 m
    for (let x = X0 + 4; x < X1; x += 8) {
      if (gapLamp(x)) continue;
      const ly = yb - 0.35;
      st.add("#1c1b22", 0.04, (EAVE + RIDGE) / 2 - ly - 0.2, 0.04, x, ly + 0.2, za + 0.3 + TOOTH / 2);
      const cyl = new THREE.CylinderGeometry(0.35, 0.45, 0.25, 10);
      cyl.translate(x, ly + 0.15, za + 0.3 + TOOTH / 2);
      st.geo(cyl, "#2a2930");
      const disc = new THREE.CylinderGeometry(0.4, 0.4, 0.03, 10);
      disc.translate(x, ly + 0.02, za + 0.3 + TOOTH / 2);
      glow.geo(disc, new THREE.Color("#fff3dc").multiplyScalar(1.6));
    }
  }
  // the sun through the glazing on the floor: soft shafts by day
  const shaftMat = new THREE.MeshBasicMaterial({ color: "#fff2d6", transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const shafts = new THREE.Group();
  for (let k = 1; k < TEETH; k += 2) {
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(X1 - X0 - 4, EAVE + 2), shaftMat);
    sh.position.set(0, EAVE / 2, Z0 + k * TOOTH + 3.2);
    sh.rotation.x = -0.5;
    shafts.add(sh);
  }
  root.add(shafts);

  // ---- columns and the overhead cranes -------------------------------------------------------
  const RAIL_Y = 12.2;
  const RAILS = [-16.1, -61.0];
  const colX = [0, 2, 4, 6].map((i) => PODS[i].x - 1.15).concat([0, 2, 4].map((i) => PODS[8 + i].x - 1.15));
  for (const x of colX)
    for (const z of RAILS) {
      st.add("#4a4855", 0.5, RAIL_Y, 0.5, x, 0, z);
      st.add("#e0a820", 0.56, 1.4, 0.56, x, 0, z);
      st.add("#16151a", 0.58, 0.18, 0.58, x, 0.5, z);
      ground.push([x - 0.35, z - 0.35, x + 0.35, z + 0.35]);
    }
  for (const z of RAILS) {
    st.add("#3d3b47", X1 - X0 - 24, 0.6, 0.5, -12, RAIL_Y, z);
    st.add("#8d8a95", X1 - X0 - 24, 0.1, 0.12, -12, RAIL_Y + 0.6, z);
  }
  // wall pilasters every 6 m
  for (let z = Z0 + 6; z < Z1; z += 6) {
    st.add("#3d3b47", 0.6, EAVE, 0.5, X0 + 0.3, 0, z);
    if (!DOCKS.some((d) => Math.abs(d - z) < DOOR_W / 2 + 0.5)) st.add("#3d3b47", 0.6, EAVE, 0.5, X1 - 0.3, 0, z);
  }
  for (let x = X0 + 6; x < X1; x += 6) if (Math.abs(x) > 15.5) st.add("#3d3b47", 0.5, EAVE, 0.6, x, 0, Z0 + 0.3);

  interface Crane {
    g: THREE.Group;
    trolley: THREE.Group;
    hook: THREE.Group;
    cable: THREE.Mesh;
    load: THREE.Object3D;
    x: number;
    tx: number;
    z: number;
    tz: number;
    y: number;
    ty: number;
    wait: number;
    span: [number, number];
  }
  const cranes: Crane[] = [];
  const yellow = new THREE.MeshStandardMaterial({ color: "#e0a820", roughness: 0.55, metalness: 0.35 });
  const dark = new THREE.MeshStandardMaterial({ color: "#1c1b22", roughness: 0.6, metalness: 0.4 });
  const steelM = new THREE.MeshStandardMaterial({ color: "#8d8a95", roughness: 0.4, metalness: 0.7 });
  const span = RAILS[0] - RAILS[1];
  const craneSign = (text: string) => neonSign([{ text, font: MONO(80, 900), color: "#141317" }], { color: "#141317", w: 3.4, h: 0.6, bg: "#e0a820" });
  for (const [x0, x1, name] of [
    [-60, -9, "CRANE 1 · 25 t"],
    [-3, 37, "CRANE 2 · 25 t"],
  ] as [number, number, string][]) {
    const g = new THREE.Group();
    for (const dx of [-0.9, 0.9]) {
      const girder = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.0, span), yellow);
      girder.position.set(dx, RAIL_Y + 1.25, (RAILS[0] + RAILS[1]) / 2);
      g.add(girder);
    }
    for (const z of RAILS) {
      const truck = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.7, 0.9), dark);
      truck.position.set(0, RAIL_Y + 0.95, z);
      g.add(truck);
      for (const dx of [-1.3, 1.3]) {
        const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), new THREE.MeshBasicMaterial({ color: new THREE.Color("#ff8a1a").multiplyScalar(3), toneMapped: false }));
        lamp.position.set(dx, RAIL_Y + 1.4, z);
        g.add(lamp);
      }
    }
    // hazard ends and the crane's name on both faces
    for (const z of [RAILS[0] - 1.2, RAILS[1] + 1.2]) {
      const s = craneSign(name);
      s.position.set(1.16, RAIL_Y + 1.25, z + (z > -40 ? -2 : 2));
      s.rotation.y = Math.PI / 2;
      g.add(s);
      const s2 = s.clone();
      s2.position.x = -1.16;
      s2.rotation.y = -Math.PI / 2;
      g.add(s2);
    }
    const trolley = new THREE.Group();
    const tb = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.8, 1.6), dark);
    tb.position.y = RAIL_Y + 2.15;
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 1.8, 12), yellow);
    drum.rotation.z = Math.PI / 2;
    drum.position.y = RAIL_Y + 2.0;
    trolley.add(tb, drum);
    const cable = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1, 0.05), steelM);
    trolley.add(cable);
    const hook = new THREE.Group();
    const block = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.35), yellow);
    block.position.y = 0.3;
    const h1 = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.05, 6, 12, Math.PI * 1.4), steelM);
    h1.position.y = -0.05;
    hook.add(block, h1);
    // the load: a pallet of boxed miners in a sling
    const load = new THREE.Group();
    const lb = new Boxes();
    lb.add("#7a5a38", 1.3, 0.14, 1.1, 0, 0, 0);
    for (let i = 0; i < 6; i++) lb.add(i % 2 ? "#a8875a" : "#9a7a50", 0.6, 0.42, 0.5, -0.32 + (i % 2) * 0.64, 0.14 + Math.floor(i / 2) * 0.43, i % 4 < 2 ? -0.26 : 0.26);
    for (const [ax, az] of [
      [-0.6, -0.5],
      [0.6, -0.5],
      [-0.6, 0.5],
      [0.6, 0.5],
    ])
      lb.beam("#2a2c34", new THREE.Vector3(ax, 1.4, az), new THREE.Vector3(0, 2.4, 0), 0.03);
    const lm = lb.mesh(SOLID);
    lm.position.y = -2.65;
    load.add(lm);
    hook.add(load);
    trolley.add(hook);
    g.add(trolley);
    root.add(g);
    cranes.push({ g, trolley, hook, cable, load, x: (x0 + x1) / 2, tx: x0, z: -30, tz: -30, y: 6, ty: 6, wait: 0, span: [x0, x1] });
  }

  function updateCranes(dt: number, t: number) {
    for (const [i, c] of cranes.entries()) {
      const near = (a: number, b: number) => Math.abs(a - b) < 0.02;
      if (near(c.x, c.tx) && near(c.z, c.tz) && near(c.y, c.ty)) {
        c.wait -= dt;
        if (c.wait <= 0) {
          // next move: travel, or lower the hook, or raise it
          const r = hash(Math.floor(t * 10), i, 3, 1);
          if (c.ty < 6) c.ty = 7.4;
          else if (r < 0.35) c.ty = 4.2 + hash(i, Math.floor(t), 1, 2) * 1.2;
          else {
            c.tx = c.span[0] + hash(i, Math.floor(t * 3), 2, 2) * (c.span[1] - c.span[0]);
            c.tz = RAILS[1] + 4 + hash(i, Math.floor(t * 3), 5, 5) * (span - 8);
          }
          c.wait = 1.5 + hash(i, Math.floor(t), 9, 9) * 3;
        }
      }
      const step = (v: number, to: number, sp: number) => (Math.abs(to - v) < sp * dt ? to : v + Math.sign(to - v) * sp * dt);
      if (!near(c.y, c.ty)) c.y = step(c.y, c.ty, 0.5);
      else if (!near(c.x, c.tx)) c.x = step(c.x, c.tx, 1.6);
      else c.z = step(c.z, c.tz, 1.2);
      c.g.position.x = c.x;
      c.trolley.position.z = c.z;
      const top = RAIL_Y + 1.8;
      c.hook.position.y = c.y;
      c.cable.position.y = (top + c.y + 0.6) / 2;
      c.cable.scale.y = top - c.y - 0.6;
      c.hook.rotation.y = Math.sin(t * 0.4 + i) * 0.15;
    }
  }

  // ---- cooling wall (west): giant fans and evaporative pads -----------------------------------
  const FANS: [number, number][] = [];
  for (let z = -17.5; z > Z0 + 3; z -= 4.4) for (const y of [4.2, 9.4]) FANS.push([y, z]);
  const padTex = (() => {
    const { c, g } = makeCanvas(64, 64);
    g.fillStyle = "#6a5a3a";
    g.fillRect(0, 0, 64, 64);
    g.strokeStyle = "#4a3e28";
    g.lineWidth = 2;
    for (let i = -64; i < 128; i += 6) {
      g.beginPath();
      g.moveTo(i, 0);
      g.lineTo(i + 32, 64);
      g.stroke();
      g.beginPath();
      g.moveTo(i + 32, 0);
      g.lineTo(i, 64);
      g.stroke();
    }
    const t = canvasTex(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  })();
  padTex.repeat.set(40, 3);
  const pads = new THREE.Mesh(new THREE.PlaneGeometry(Z1 - Z0 - 20, 1.6), new THREE.MeshStandardMaterial({ map: padTex, roughness: 1 }));
  pads.rotation.y = Math.PI / 2;
  pads.position.set(X0 + 0.05, 6.8, (Z0 + 3 - 17) / 2 - 0.5);
  root.add(pads);
  const rotor = rotorGeometry(1.55, 6, 0.06);
  const rotors = new THREE.InstancedMesh(rotor, fanMaterial("#9a97a4"), FANS.length);
  const spin = new Float32Array(FANS.length * 2);
  const mm = new THREE.Matrix4();
  FANS.forEach(([y, z], i) => {
    // housing: a square frame, a deep ring, a grille cross
    st.add("#2a2933", 0.5, 3.8, 3.8, X0 + 0.25, y - 1.9, z);
    const ring = new THREE.TorusGeometry(1.7, 0.12, 6, 24);
    ring.rotateY(Math.PI / 2);
    ring.translate(X0 + 0.55, y, z);
    st.geo(ring, "#5d5a66");
    st.add("#e0a820", 0.06, 0.3, 3.8, X0 + 0.52, y + 1.6, z);
    st.add("#4a4855", 0.05, 3.4, 0.05, X0 + 0.7, y - 1.7, z);
    st.add("#4a4855", 0.05, 0.05, 3.4, X0 + 0.7, y, z);
    glow.add(new THREE.Color("#3ddc97").multiplyScalar(2), 0.04, 0.12, 0.12, X0 + 0.52, y - 1.75, z + 1.7);
    mm.compose(new THREE.Vector3(X0 + 0.45, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2), new THREE.Vector3(1, 1, 1));
    rotors.setMatrixAt(i, mm);
    spin[i * 2] = 4 + hash(i, 1, 2, 3) * 1.5;
    spin[i * 2 + 1] = i;
  });
  rotors.geometry.setAttribute("aSpin", new THREE.InstancedBufferAttribute(spin, 2));
  rotors.frustumCulled = false;
  root.add(rotors);
  const cw = neonSign([{ text: "COOLING WALL · 冷却壁", font: MONO(70, 900) }, { text: "24 × 3.4 m FANS · EVAPORATIVE PADS", font: MONO(38, 700), color: "#e8e0c8" }], { color: "#4ad0ff", w: 6, h: 1.3 });
  cw.rotation.y = Math.PI / 2;
  cw.position.set(X0 + 0.3, 12.3, -40);
  root.add(cw);
  // hazard placards along the walls
  const hz: [ReturnType<typeof hazardSign>, number, number, number, number][] = [
    [hazardSign("fan", "回転注意", "MOVING BLADES"), X0 + 0.45, 1.6, -21, Math.PI / 2],
    [hazardSign("fan", "回転注意", "MOVING BLADES"), X0 + 0.45, 1.6, -47.5, Math.PI / 2],
    [hazardSign("volt", "高電圧", "HIGH VOLTAGE"), X1 - 0.45, 1.6, -60, -Math.PI / 2],
    [hazardSign("press", "挟まれ注意", "CRUSH HAZARD"), PRESS.x - 5.2, 1.6, Z0 + 0.45, 0],
    [hazardSign("volt", "危険", "DANGER"), PRESS.x + 5.2, 1.6, Z0 + 0.45, 0],
  ];
  for (const [s, x, y, z, ry] of hz) {
    s.position.set(x, y, z);
    s.rotation.y = ry;
    s.scale.setScalar(1.3);
    root.add(s);
  }

  // ---- back wall: the screen's place, exhaust fans, neon --------------------------------------
  const vn = [verticalNeon("採掘中", "#ff3ad0", 1.1), verticalNeon("証明工場", GOLD, 1.1), verticalNeon("高電圧", "#4ad0ff", 1.0)];
  vn[0].position.set(-23, 9.6, Z0 + 0.45);
  vn[1].position.set(16.5, 9.4, Z0 + 0.45);
  vn[2].position.set(X1 - 0.45, 8, -14);
  vn[2].rotation.y = -Math.PI / 2;
  root.add(...vn);

  // ---- dock doors (east wall) -----------------------------------------------------------------
  for (const [i, dz] of DOCKS.entries()) {
    const x = X1;
    // frame, the rolled shutter's drum, rubber seals, bumpers, the leveller plate, lights
    st.add("#e0a820", 0.3, DOOR_H, 0.3, x - 0.1, 0, dz - DOOR_W / 2 - 0.15);
    st.add("#e0a820", 0.3, DOOR_H, 0.3, x - 0.1, 0, dz + DOOR_W / 2 + 0.15);
    st.add("#3a3944", 0.8, 0.8, DOOR_W + 0.8, x - 0.4, DOOR_H + 0.05, dz);
    st.add("#141317", 0.25, 0.2, DOOR_W, x - 0.12, DOOR_H - 0.1, dz);
    for (const s of [-1, 1]) st.add("#141317", 0.3, 0.5, 0.25, x - 0.2, 0.9, dz + s * (DOOR_W / 2 - 0.3));
    st.add("#5d5a66", 2.2, 0.06, DOOR_W - 0.4, x - 1.1, 0, dz);
    st.add("#e0a820", 0.08, 0.07, DOOR_W - 0.4, x - 2.2, 0, dz);
    glow.add(new THREE.Color(i % 2 ? "#3ddc97" : "#ff3a3a").multiplyScalar(2.5), 0.08, 0.3, 0.3, x - 0.3, 2.6, dz - DOOR_W / 2 - 0.6);
    glow.add(new THREE.Color("#ffd890").multiplyScalar(1.8), 0.6, 0.12, 0.3, x - 0.5, DOOR_H + 0.95, dz);
    const lab = neonSign([{ text: `D${i + 1}`, font: MONO(110, 900) }], { color: GOLD, w: 1.2, h: 0.8 });
    lab.position.set(x - 0.25, DOOR_H + 1.8, dz);
    lab.rotation.y = -Math.PI / 2;
    root.add(lab);
  }
  const ship = neonSign([{ text: "SHIPPING · 出荷", font: JP(80, 900) }, { text: "BLOCKS OUT → MEMPOOL", font: MONO(44, 800), color: "#e8e0c8" }], { color: GOLD, w: 6.5, h: 1.5 });
  ship.rotation.y = -Math.PI / 2;
  ship.position.set(X1 - 0.3, 9, (DOCKS[1] + DOCKS[2]) / 2);
  root.add(ship);
  // outside: the yard's asphalt and a painted backdrop (trucks are the line's)
  const yardMat = new THREE.MeshBasicMaterial({ map: yardTexture(true), toneMapped: false });
  const yard = new THREE.Mesh(new THREE.PlaneGeometry(80, 26), yardMat);
  yard.position.set(X1 + 30, 9, (DOCKS[0] + DOCKS[3]) / 2);
  yard.rotation.y = -Math.PI / 2;
  root.add(yard);
  const asphaltMat = new THREE.MeshStandardMaterial({ color: "#2a2a30", roughness: 0.9 });
  const asphalt = new THREE.Mesh(new THREE.PlaneGeometry(30, 70), asphaltMat);
  asphalt.rotation.x = -Math.PI / 2;
  asphalt.position.set(X1 + 15, -0.02, (DOCKS[0] + DOCKS[3]) / 2);
  root.add(asphalt);

  // ---- lobby, charging bay, workshop (front strip, under/beside the control room) -------------
  // the control room's slab and its columns
  const slab = new THREE.Mesh(new THREE.BoxGeometry(CTRL.x1 - CTRL.x0, 0.4, CTRL.z1 - CTRL.z0), new THREE.MeshStandardMaterial({ color: "#1c1b22", roughness: 0.8 }));
  slab.position.set((CTRL.x0 + CTRL.x1) / 2, CTRL.y - 0.2, (CTRL.z0 + CTRL.z1) / 2);
  root.add(slab);
  for (const x of [CTRL.x0 + 0.3, -14, -7, 7, 14, CTRL.x1 - 0.3]) {
    st.add("#4a4855", 0.45, CTRL.y - 0.4, 0.45, x, 0, CTRL.z0 + 0.3);
    st.add("#e0a820", 0.5, 1.2, 0.5, x, 0, CTRL.z0 + 0.3);
    ground.push([x - 0.3, CTRL.z0, x + 0.3, CTRL.z0 + 0.6]);
  }
  for (let x = CTRL.x0 + 1; x < CTRL.x1 - 1; x += 3) glow.add(new THREE.Color("#fff0d2").multiplyScalar(1.6), 1.6, 0.04, 0.3, x + 0.8, CTRL.y - 0.45, -4.5);
  // turnstiles between the lobby and the hall
  const flaps = new Boxes();
  const TZ = -8.4;
  for (const x of [-4.4, -2.6, -0.9, 0.9, 2.6, 4.4]) {
    st.add("#3a3944", 0.16, 0.92, 0.7, x, 0, TZ);
    st.add("#a8a6b0", 0.18, 0.04, 0.72, x, 0.92, TZ);
    glow.add(new THREE.Color(Math.abs(x) < 1 ? "#3ddc97" : "#4ad0ff").multiplyScalar(2), 0.03, 0.08, 0.08, x, 0.7, TZ + 0.36);
    for (const s of [-1, 1]) if (Math.abs(x + s * 0.5) < 4.6 && Math.abs(x) > 1.2) flaps.add("#ffffff", 0.42, 0.55, 0.02, x + s * 0.3, 0.3, TZ);
    ground.push([x - 0.12, TZ - 0.35, x + 0.12, TZ + 0.35]);
  }
  const fm = flaps.mesh(GLASS);
  fm.renderOrder = 2;
  root.add(fm);
  ground.push([CTRL.x0 + 0.6, TZ - 0.2, -4.5, TZ + 0.2], [4.5, TZ - 0.2, CTRL.x1 - 0.6, TZ + 0.2]);
  for (const s of [-1, 1]) {
    st.add("#2a2933", 17.2, 0.9, 0.1, s * 13.2, 0, TZ);
    flaps.add("#ffffff", 17.2, 0.5, 0.02, s * 13.2, 0.9, TZ);
    glow.add(new THREE.Color(GOLD).multiplyScalar(1.4), 17.2, 0.03, 0.12, s * 13.2, 0.9, TZ);
  }
  // lockers, PPE racks, vending
  const lockers = voxObj(lockersModel(14), 0.5);
  lockers.rotation.y = Math.PI;
  lockers.position.set(-11, 0, -0.25);
  root.add(lockers);
  ground.push([-18.2, -0.8, -10.8, 0]);
  for (const [x, th] of [
    [-6.2, "blue"],
    [-5.2, "red"],
  ] as [number, "blue" | "red"][]) {
    const v = voxObj(vendingMachine(th).model);
    v.rotation.y = Math.PI;
    v.position.set(x, 0, -0.45);
    root.add(v);
  }
  ground.push([-6.8, -0.95, -4.6, 0]);
  // the break corner's wall: memes pinned up over the lockers (2 m tall, x −14.5…−7.5) and the machines
  for (const [x, y, h] of [
    [-13.2, 2.75, 0.9],
    [-11.0, 2.8, 1.0],
    [-8.8, 2.75, 0.9],
    [-5.7, 2.8, 0.8],
  ]) {
    const p = memePoster(nextMeme(), h, { kind: x < -12 || x > -6 ? "paste" : "frame", frame: "#2a2933" });
    p.position.set(x, y, -0.04);
    p.rotation.y = Math.PI;
    root.add(p);
  }
  // hard hats and vests on their rack
  for (let i = 0; i < 12; i++) {
    const x = 4.6 + i * 0.42;
    st.add("#3a3944", 0.04, 1.8, 0.04, x, 0, -0.25);
    const hat = new THREE.SphereGeometry(0.15, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
    hat.translate(x, 1.85, -0.35);
    st.geo(hat, i % 4 === 3 ? "#f2f2f2" : "#f4c020");
    st.add(i % 3 ? "#ff8a1a" : "#d8f030", 0.36, 0.6, 0.06, x, 1.0, -0.38);
    st.add("#e8e8e8", 0.36, 0.05, 0.065, x, 1.2, -0.38);
  }
  ground.push([4.2, -0.6, 9.8, 0]);
  const ppe = neonSign([{ text: "PPE · 保護具", font: JP(70, 900) }, { text: "HARD HAT · HI-VIS · BOOTS", font: MONO(40, 800), color: "#e8e0c8" }], { color: "#3ddc97", w: 3.6, h: 0.9 });
  ppe.rotation.y = Math.PI;
  ppe.position.set(7, 3.1, -0.22);
  root.add(ppe);
  const brand = neonSign([{ text: "PROOF FACTORY · 証明工場", font: JP(90, 900) }, { text: "ZCASH MINING HALL · EQUIHASH (200,9)", font: MONO(44, 700), color: "#e8e0c8" }], { color: GOLD, w: 9, h: 1.6 });
  brand.rotation.y = Math.PI;
  brand.position.set(0, 3.5, -0.22);
  root.add(brand);
  // reception desk
  st.add("#2a2933", 3.2, 1.05, 0.8, -1.6 + 13.5, 0, -4.2);
  glow.add(new THREE.Color(GOLD).multiplyScalar(1.6), 3.2, 0.04, 0.05, 11.9, 1.05, -3.78);
  ground.push([10.1, -4.7, 13.7, -3.7]);
  // charging bay (west of the lobby): chargers with glowing state, battery racks
  for (let i = 0; i < 9; i++) {
    const x = -60 + i * 4.2;
    st.add("#2a2933", 0.6, 1.6, 0.4, x, 0, -0.4);
    glow.add(new THREE.Color(i % 3 === 1 ? "#ffb02a" : "#3ddc97").multiplyScalar(2.4), 0.4, 0.4, 0.04, x, 1.0, -0.19);
    st.add("#141317", 0.05, 0.05, 1.4, x + 0.2, 0.9, -1.0);
    ground.push([x - 0.4, -0.7, x + 0.4, 0]);
  }
  for (let x = -62; x < -23; x += 6) glow.add(new THREE.Color("#fff0d2").multiplyScalar(1.5), 2.4, 0.08, 0.3, x + 1.2, 4.2, -0.35);
  for (let x = 24; x < 63; x += 6) glow.add(new THREE.Color("#fff0d2").multiplyScalar(1.5), 2.4, 0.08, 0.3, x + 1.2, 4.2, -0.35);
  const chg = neonSign([{ text: "CHARGING · 充電", font: JP(80, 900) }], { color: "#3ddc97", w: 4, h: 0.8 });
  chg.rotation.y = Math.PI;
  chg.position.set(-43, 4.5, -0.22);
  root.add(chg);
  // workshop (east of the lobby): benches with opened miners, tool boards, shelving
  for (let i = 0; i < 6; i++) {
    const x = 26 + i * 5.2;
    st.add("#4a4855", 2.4, 0.9, 0.9, x, 0, -1.2);
    st.add("#8a6a44", 2.4, 0.05, 0.9, x, 0.9, -1.2);
    st.add("#b9bcc4", 0.4, 0.32, 0.8, x - 0.5, 0.95, -1.2);
    st.add("#1d5a2a", 0.6, 0.02, 0.35, x + 0.4, 0.95, -1.3);
    glow.add(new THREE.Color("#ffe6c4").multiplyScalar(1.4), 1.6, 0.03, 0.12, x, 2.1, -1.0);
    st.add("#26252d", 2.4, 1.3, 0.05, x, 1.3, -0.15);
    for (let k = 0; k < 7; k++) st.add(["#c0302a", "#e0a820", "#3a8ad8", "#8d8a95"][k % 4], 0.05, 0.28, 0.04, x - 1 + k * 0.32, 1.7, -0.2);
    ground.push([x - 1.3, -1.75, x + 1.3, 0]);
  }
  const ws = neonSign([{ text: "REPAIR · 修理", font: JP(80, 900) }, { text: "HASHBOARDS · PSU · FANS", font: MONO(40, 800), color: "#e8e0c8" }], { color: "#ff8a3a", w: 4.2, h: 1 });
  ws.rotation.y = Math.PI;
  ws.position.set(39, 4, -0.22);
  root.add(ws);

  // ---- pallet racking along the back wall (spare miners in their boxes) ------------------------
  const RK = { x0: -60, x1: -22.6, z: [-73.2, -67.4], beams: [0.15, 2.0, 3.85, 5.7], bay: 2.7 };
  const boxTex = (() => {
    const { c, g } = makeCanvas(64, 64);
    g.fillStyle = "#a8875a";
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = "#c8b48a";
    g.fillRect(28, 0, 8, 64);
    g.fillStyle = "#e8e4dc";
    g.fillRect(6, 40, 18, 14);
    g.fillStyle = "#2a2830";
    g.fillRect(8, 44, 14, 2);
    g.fillRect(8, 48, 10, 2);
    g.fillStyle = "#c0302a";
    g.fillRect(44, 44, 10, 10);
    return canvasTex(c);
  })();
  const boxes: THREE.Matrix4[] = [];
  for (const z of RK.z) {
    for (let x = RK.x0; x <= RK.x1 + 0.01; x += RK.bay) {
      st.add("#2e5ab8", 0.1, 7.2, 0.1, x, 0, z - 0.5);
      st.add("#2e5ab8", 0.1, 7.2, 0.1, x, 0, z + 0.5);
      for (let y = 1; y < 7; y += 1.2) st.beam("#2e5ab8", new THREE.Vector3(x, y, z - 0.5), new THREE.Vector3(x, y + 1.2, z + 0.5), 0.04);
    }
    for (const y of RK.beams.slice(1)) {
      st.add("#e06a1a", RK.x1 - RK.x0, 0.14, 0.08, (RK.x0 + RK.x1) / 2, y - 0.14, z - 0.5);
      st.add("#e06a1a", RK.x1 - RK.x0, 0.14, 0.08, (RK.x0 + RK.x1) / 2, y - 0.14, z + 0.5);
    }
    for (let x = RK.x0 + RK.bay / 2; x < RK.x1; x += RK.bay)
      for (const y of RK.beams)
        for (const dx of [-0.65, 0.65]) {
          if (hash(x, y, z, 4) < 0.15) continue;
          st.add("#7a5a38", 1.2, 0.14, 1.0, x + dx, y, z);
          const n = 1 + Math.floor(hash(x + dx, y, z, 2) * 3);
          for (let k = 0; k < n; k++) boxes.push(new THREE.Matrix4().compose(new THREE.Vector3(x + dx, y + 0.14 + 0.25 + k * 0.5, z), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1)));
        }
    ground.push([RK.x0 - 0.2, z - 0.6, RK.x1 + 0.2, z + 0.6]);
  }
  const boxIM = new THREE.InstancedMesh(new THREE.BoxGeometry(1.1, 0.5, 0.9), new THREE.MeshStandardMaterial({ map: boxTex, roughness: 0.9 }), boxes.length);
  boxes.forEach((b, i) => boxIM.setMatrixAt(i, b));
  boxIM.frustumCulled = false;
  root.add(boxIM);
  const stock = neonSign([{ text: "SPARE MINERS · 予備機", font: JP(80, 900) }], { color: "#4ad0ff", w: 5, h: 0.8 });
  stock.position.set(-41, 7.8, -66.8);
  root.add(stock);

  // ---- pipes along the back and the west walls ------------------------------------------------
  for (const [y, col] of [
    [12.6, "#8a2a26"],
    [12.1, "#2a6a4a"],
    [11.6, "#3a5a8a"],
  ] as [number, string][]) {
    // (not across the wall screen)
    st.add(col, -15.5 - X0, 0.35, 0.35, (X0 - 15.5) / 2, y, Z0 + 0.6);
    st.add(col, X1 - 15.5, 0.35, 0.35, (X1 + 15.5) / 2, y, Z0 + 0.6);
    st.add(col, 0.35, 0.35, Z1 - Z0 - 12, X0 + 0.6, y, (Z0 + Z1 - 12) / 2);
    for (let x = X0 + 3; x < X1; x += 6) if (Math.abs(x) > 16) st.add("#1c1b22", 0.12, 0.45, 0.45, x, y - 0.05, Z0 + 0.6);
  }

  root.add(st.mesh(SOLID), glow.mesh(GLOW));

  // ---- theme ---------------------------------------------------------------------------------
  const yardDay = yardTexture(false),
    yardNight = yardMat.map!;
  function setTheme(theme: Theme) {
    const day = theme === "day";
    glazeMat.color.set(day ? new THREE.Color(1.35, 1.5, 1.7) : new THREE.Color(0.55, 0.32, 1.1));
    shaftMat.opacity = day ? 0.045 : 0;
    shafts.visible = day;
    yardMat.map = day ? yardDay : yardNight;
    yardMat.needsUpdate = true;
  }

  return { update: updateCranes, setTheme, beltStart: BELT[0], glassMat: GLASS };
}
