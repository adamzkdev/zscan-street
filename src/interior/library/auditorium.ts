import * as THREE from "three";
import { AUD_Y, canvasTex, fmt, glow, std, type Level } from "./kit";
import type { Upgrade } from "./data";
import { buildCrowd, type Crowd } from "./crowd";
import { WHISPERS } from "./data";

/**
 * Inside the sphere: a domed auditorium. The dome is a planetarium of the chain: a night sky,
 * the network upgrades strung along an arc in front of the seats, the live height at the zenith.
 * Rows of seats in arcs face the lecturer's stage.
 */

export const AUD = { cx: 0, cz: 0, r: 7.8, up: 3.2 };

export interface Auditorium {
  crowd: Crowd;
  redraw(height: number, ups: Upgrade[]): void;
}

export function buildAuditorium(lv: Level): Auditorium {
  const Y = AUD_Y;
  const { cx, cz, r, up } = AUD;
  const cy = Y + up;
  // the dome's sky: equirect, mirrored (seen from inside)
  const W = 4096,
    H = 2048;
  let height = 0;
  let ups: Upgrade[] = [];
  const sky = canvasTex(W, H, (g) => {
    const grd = g.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, "#04050c");
    grd.addColorStop(0.45, "#0b1024");
    grd.addColorStop(0.5, "#1a1830");
    grd.addColorStop(1, "#0a0910");
    g.fillStyle = grd;
    g.fillRect(0, 0, W, H);
    let a = 7;
    const R = () => ((a = (a * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 2600; i++) {
      const x = R() * W,
        y = R() * H * 0.52;
      const s = R() < 0.06 ? 3 : R() < 0.3 ? 2 : 1;
      g.fillStyle = `rgba(255,${230 + Math.floor(R() * 25)},${200 + Math.floor(R() * 55)},${0.4 + R() * 0.6})`;
      g.fillRect(x, y, s, s);
    }
    // canvas x: 0.25·W is straight ahead (−z), right is +x; y: elevation e at (0.5 − e/π)·H
    const X = (lon: number) => (0.25 + lon / (2 * Math.PI)) * W;
    const Yy = (e: number) => (0.5 - e / Math.PI) * H;
    // the upgrades along an arc in front of the seats
    const list = ups.filter((u) => u.activation_height);
    const n = Math.max(2, list.length + 1);
    const pts: [number, number][] = [];
    for (let i = 0; i < n; i++) {
      const lon = -1.15 + (2.3 * i) / (n - 1);
      const e = 0.42 + 0.22 * Math.cos(((i / (n - 1)) * 2 - 1) * 1.2);
      pts.push([X(lon), Yy(e)]);
    }
    g.strokeStyle = "rgba(244,183,40,0.8)";
    g.lineWidth = 5;
    g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.stroke();
    const labels = [{ label: "SPROUT", h: 0, year: "2016" }, ...list.map((u) => ({ label: u.label.toUpperCase(), h: u.activation_height!, year: u.activated_at ? u.activated_at.slice(0, 4) : "" }))];
    labels.forEach((l, i) => {
      if (!pts[i]) return;
      const [x, y] = pts[i];
      const gr = g.createRadialGradient(x, y, 0, x, y, 40);
      gr.addColorStop(0, "rgba(255,230,160,1)");
      gr.addColorStop(0.3, "rgba(244,183,40,0.8)");
      gr.addColorStop(1, "rgba(244,183,40,0)");
      g.fillStyle = gr;
      g.fillRect(x - 40, y - 40, 80, 80);
      g.textAlign = "center";
      g.fillStyle = "#fff4dc";
      g.font = '800 34px "JetBrains Mono", monospace';
      g.fillText(l.label, x, y - 52);
      g.fillStyle = "#c9b48a";
      g.font = '500 24px "JetBrains Mono", monospace';
      g.fillText(`#${fmt(l.h)}${l.year ? " · " + l.year : ""}`, x, y + 66);
    });
    // the live height over the stage, and a title
    g.textAlign = "center";
    g.fillStyle = "#f4b728";
    g.font = '800 92px "JetBrains Mono", monospace';
    g.fillText(height ? `#${fmt(height)}` : "THE CHAIN", X(0), Yy(1.02));
    g.fillStyle = "#e8e0cc";
    g.font = '600 40px "JetBrains Mono", monospace';
    g.fillText("THE EYE · AUDITORIUM", X(0), Yy(1.17));
    g.fillText("ZCASH · 2016 — TODAY", X(0), Yy(0.26));
  });
  sky.t.wrapS = THREE.RepeatWrapping;
  sky.t.repeat.x = -1;
  const dome = new THREE.Mesh(new THREE.SphereGeometry(r, 96, 48), new THREE.MeshBasicMaterial({ map: sky.t, side: THREE.BackSide, toneMapped: false }));
  dome.position.set(cx, cy, cz);
  dome.raycast = () => {};
  lv.group.add(dome);
  // the floor disc, a ring of light round its edge, the stage
  const fr = Math.sqrt(r * r - up * up);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(fr + 0.05, 96), std("#2a2420", 0.6));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(cx, Y, cz);
  lv.group.add(floor);
  const edge = new THREE.Mesh(new THREE.RingGeometry(fr - 0.25, fr - 0.18, 96), glow("#ffd9a0", 1.4));
  edge.rotation.x = -Math.PI / 2;
  edge.position.set(cx, Y + 0.01, cz);
  lv.group.add(edge);
  const m = lv.m;
  const white = std("#f1eee8", 0.5);
  m.cyl(white, 2.2, 2.3, 0.4, cx, Y, cz - 4.2, 48);
  m.box(std("#3a2a20", 0.5), 0.6, 1.1, 0.4, cx, Y + 0.4, cz - 4.4);
  m.box(glow("#ffd9a0", 1.2), 0.5, 0.02, 0.3, cx, Y + 1.5, cz - 4.4);
  // seats in arcs, facing the stage
  const spots: THREE.Vector3[] = [];
  const seatMat = std("#7a2030", 0.8);
  for (let row = 0; row < 4; row++) {
    const rr = 2.4 + row * 1.15;
    const n = 9 + row * 3;
    for (let i = 0; i < n; i++) {
      const a = Math.PI * (0.18 + (0.64 * (i + 0.5)) / n);
      // the arc opens towards the stage at −z; the aisle down the middle
      // (rows with an even count lose their two middle seats, so the aisle runs straight through)
      if (Math.abs(i - (n - 1) / 2) < 1) continue;
      const x = cx + Math.cos(a) * rr * 1.25,
        z = cz - 4.2 + Math.sin(a) * rr * 1.6;
      if (Math.hypot(x - cx, z - cz) > fr - 0.8) continue;
      const yaw = Math.atan2(cx - x, cz - 4.2 - z);
      const g = new THREE.BoxGeometry(0.5, 0.42, 0.5);
      g.rotateY(yaw);
      g.translate(x, Y + 0.21, z);
      m.add(seatMat, g);
      const b = new THREE.BoxGeometry(0.5, 0.55, 0.08);
      b.translate(0, 0, -0.25);
      b.rotateY(yaw + Math.PI);
      b.translate(x, Y + 0.6, z);
      m.add(seatMat, b);
      spots.push(new THREE.Vector3(x, Y + 0.42, z));
      lv.rects.push([x - 0.3, z - 0.3, x + 0.3, z + 0.3]);
    }
  }
  const crowd = buildCrowd(spots.filter((_, i) => i % 4 !== 1), 4141, 0.66);
  lv.group.add(crowd.mesh);
  // the walls: the floor's round edge, in rects
  for (let k = 0; k < 48; k++) {
    const a = (k / 48) * Math.PI * 2;
    const x = cx + Math.cos(a) * (fr + 0.2),
      z = cz + Math.sin(a) * (fr + 0.2);
    lv.rects.push([x - 0.7, z - 0.7, x + 0.7, z + 0.7]);
  }
  lv.rects.push([cx - 2.3, cz - 6.5, cx + 2.3, cz - 2.0]);
  const l = new THREE.PointLight("#ffe2b8", 10, 14, 1.5);
  l.position.set(cx, Y + 6, cz - 2);
  lv.group.add(l);
  void lv.person(1, cx, Y + 0.4, cz - 4.0, "Lecturer", { lines: WHISPERS.lecturer, near: 12, face: new THREE.Vector3(0, 0, 1) });
  return {
    crowd,
    redraw(h, u) {
      height = h;
      ups = u;
      sky.redraw();
    },
  };
}
