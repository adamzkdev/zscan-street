import * as THREE from "three";
import { Market } from "../../data/market";
import type { Snark } from "../../scene/snark";
import { drawTerminal, screen as bankScreen, surface as bankSurface } from "../bank/art";
import { kiosk, KIOSK_SCREEN } from "../bank/props";
import { desk as officeDesk, chair } from "../furniture";
import type { PickInfo } from "../types";
import { bankerLamp, bench, chandelier, clubChair, coffers, column, desk, pilaster, stanchion, urn } from "./arch";
import { drawPools, drawPrice, drawSupply, drawTape, poolsInfo, priceInfo, supplyInfo, tape } from "./data";
import { C, F, GOLD, JP, LEVELS, num, paint, SERIF, Surface, usd, zec, type ReserveKit } from "./kit";

/**
 * Ground floor: the banking hall. 40 × 46 m under a 14 m coffered ceiling with a stained-glass
 * laylight; two rows of fluted columns; security arches at the bronze doors; an information booth
 * with a four-faced clock; the viewing-key terminals on a green marble dais; eight teller windows
 * behind bronze grilles; and over them the live wall: price, supply, pools.
 */

const f = F.hall;
const L = LEVELS[f];
const H = L.h;
const COLS_X = 11;
const COLS_Z = [-7, -14, -21, -28];
const BOOTH = new THREE.Vector3(-6.5, 0, -9.5);
const QUOTE = new THREE.Vector3(6.5, 0, -9.5);
const ISLAND = new THREE.Vector3(0, 0, -19.5);
const COUNTER_Z = -36;
const WINDOWS = Array.from({ length: 8 }, (_, i) => -14.875 + i * 4.25);
const QUEUE_W = [2, 3, 4, 5];

const KEY_PICK: PickInfo = { eyebrow: "ZEC Reserve", title: "Viewing key terminal", panel: "bank" };

export function hall(k: ReserveKit) {

  // ---- floor: cream marble with green cabochons, a green border and the Reserve's seal ----
  const PX = 40;
  const floorTex = paint(40 * PX, 46 * PX, (c, W, Hh) => {
    for (let i = 0; i < 20; i++)
      for (let j = 0; j < 23; j++) {
        c.fillStyle = (i + j) % 2 ? "#e8dfcc" : "#efe7d6";
        c.fillRect(i * 2 * PX, j * 2 * PX, 2 * PX, 2 * PX);
      }
    // veins
    c.globalAlpha = 0.18;
    c.strokeStyle = "#9c8f78";
    for (let n = 0; n < 260; n++) {
      c.lineWidth = 0.6 + k.rnd(n, 1) * 1.6;
      c.beginPath();
      let x = k.rnd(n, 2) * W,
        y = k.rnd(n, 3) * Hh;
      c.moveTo(x, y);
      for (let s = 0; s < 5; s++) {
        x += (k.rnd(n, s + 4) - 0.5) * 90;
        y += (k.rnd(n, s + 9) - 0.5) * 90;
        c.lineTo(x, y);
      }
      c.stroke();
    }
    c.globalAlpha = 1;
    c.strokeStyle = "rgba(120,105,80,0.5)";
    c.lineWidth = 2;
    for (let i = 0; i <= 20; i++) {
      c.beginPath();
      c.moveTo(i * 2 * PX, 0);
      c.lineTo(i * 2 * PX, Hh);
      c.stroke();
    }
    for (let j = 0; j <= 23; j++) {
      c.beginPath();
      c.moveTo(0, j * 2 * PX);
      c.lineTo(W, j * 2 * PX);
      c.stroke();
    }
    // cabochons at the tile corners
    c.fillStyle = "#1f3b31";
    for (let i = 1; i < 20; i++)
      for (let j = 1; j < 23; j++) {
        c.save();
        c.translate(i * 2 * PX, j * 2 * PX);
        c.rotate(Math.PI / 4);
        c.fillRect(-9, -9, 18, 18);
        c.restore();
      }
    // the border
    c.fillStyle = "#1f3b31";
    const b = 1.4 * PX;
    c.fillRect(0, 0, W, b);
    c.fillRect(0, Hh - b, W, b);
    c.fillRect(0, 0, b, Hh);
    c.fillRect(W - b, 0, b, Hh);
    c.strokeStyle = "#c9a24a";
    c.lineWidth = 6;
    c.strokeRect(b + 8, b + 8, W - 2 * b - 16, Hh - 2 * b - 16);
    // the seal round the key dais
    const cx = 20 * PX,
      cy = (46 + ISLAND.z) * PX;
    const ring = (r: number, col: string) => {
      c.fillStyle = col;
      c.beginPath();
      c.arc(cx, cy, r * PX, 0, Math.PI * 2);
      c.fill();
    };
    ring(6.4, "#c9a24a");
    ring(6.25, "#1f3b31");
    ring(5.4, "#c9a24a");
    ring(5.3, "#efe7d6");
    // a 16-point star
    for (let p = 0; p < 32; p++) {
      const a = (p / 32) * Math.PI * 2;
      const r = p % 2 ? 3.8 : 5.25;
      c.fillStyle = p % 4 === 0 ? "#c9a24a" : p % 2 ? "#e0d4b8" : "#1f3b31";
      c.beginPath();
      c.moveTo(cx, cy);
      c.lineTo(cx + Math.cos(a - 0.1) * 3.2 * PX, cy + Math.sin(a - 0.1) * 3.2 * PX);
      c.lineTo(cx + Math.cos(a) * r * PX, cy + Math.sin(a) * r * PX);
      c.lineTo(cx + Math.cos(a + 0.1) * 3.2 * PX, cy + Math.sin(a + 0.1) * 3.2 * PX);
      c.fill();
    }
    ring(3.5, "#c9a24a");
    ring(3.4, "#13261e");
    // a runner of brass letters round the seal
    c.fillStyle = "#c9a24a";
    c.font = `700 ${0.42 * PX}px ${SERIF}`;
    c.textAlign = "center";
    c.textBaseline = "middle";
    const motto = "ZEC RESERVE · PRIVACY IS NORMAL · 準備銀行 · EST. 2016 · ";
    for (let i = 0; i < motto.length; i++) {
      const a = (i / motto.length) * Math.PI * 2 - Math.PI / 2;
      c.save();
      c.translate(cx + Math.cos(a) * 5.82 * PX, cy + Math.sin(a) * 5.82 * PX);
      c.rotate(a + Math.PI / 2);
      c.fillText(motto[i], 0, 0);
      c.restore();
    }
  });
  floorTex.anisotropy = 16;
  k.flat(f, 40, 46, new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.16, metalness: 0.05, envMapIntensity: 1.1 }), 0, -23, 0);
  // a red runner from the doors to the booth
  const runner = paint(64, 512, (c, W, Hh) => {
    c.fillStyle = "#6e1422";
    c.fillRect(0, 0, W, Hh);
    c.fillStyle = "#c9a24a";
    c.fillRect(4, 0, 3, Hh);
    c.fillRect(W - 7, 0, 3, Hh);
  });
  k.flat(f, 2.6, 5.4, new THREE.MeshStandardMaterial({ map: runner, roughness: 0.95 }), 0, -3.3, 0.01);

  // ---- walls: travertine ashlar, a frieze, a cornice ----
  const ashlar = (rx: number, ry: number) =>
    paint(
      512,
      512,
      (c, W, Hh) => {
        c.fillStyle = "#d9cbb0";
        c.fillRect(0, 0, W, Hh);
        for (let n = 0; n < 1400; n++) {
          c.fillStyle = `rgba(${150 + k.rnd(n, 1) * 60},${130 + k.rnd(n, 2) * 50},${100 + k.rnd(n, 3) * 40},0.25)`;
          c.fillRect(k.rnd(n, 4) * W, k.rnd(n, 5) * Hh, 1 + k.rnd(n, 6) * 5, 1 + k.rnd(n, 7) * 2);
        }
        c.fillStyle = "rgba(90,75,55,0.55)";
        for (let r = 0; r < 5; r++) {
          c.fillRect(0, r * 102.4, W, 3);
          const off = r % 2 ? 128 : 0;
          for (let x = off; x < W + 256; x += 256) c.fillRect(x % W, r * 102.4, 3, 102.4);
        }
      },
      rx,
      ry,
    );
  const wallMat = (len: number) => new THREE.MeshStandardMaterial({ map: ashlar(len / 4, 12 / 4), roughness: 0.55 });
  k.plane(f, 40, 12, wallMat(40), 0, 6, -45.99);
  k.plane(f, 40, 12, wallMat(40), 0, 6, -0.01, 0, Math.PI);
  k.plane(f, 46, 12, wallMat(46), -19.99, 6, -23, 0, Math.PI / 2);
  k.plane(f, 46, 12, wallMat(46), 19.99, 6, -23, 0, -Math.PI / 2);
  k.solid(f, -21, -46.3, 21, -46);
  k.solid(f, -21, 0, 21, 0.3);
  k.solid(f, -20.3, -46, -20, 0);
  k.solid(f, 20, -46, 20.3, 0);
  // the frieze (gilt letters on green) and the cornice above it
  const frieze = paint(2048, 64, (c, W, Hh) => {
    c.fillStyle = "#1f3b31";
    c.fillRect(0, 0, W, Hh);
    c.fillStyle = "#e0b84a";
    c.font = `700 40px ${SERIF}`;
    c.textBaseline = "middle";
    c.fillText("ZEC RESERVE  ·  準備銀行  ·  PRIVACY IS NORMAL  ·  EST. 2016  ·  ZEC RESERVE  ·  準備銀行  ·  SHIELDED BY DEFAULT  ·  ", 10, Hh / 2 + 2);
    c.fillRect(0, 2, W, 3);
    c.fillRect(0, Hh - 5, W, 3);
  });
  frieze.wrapS = THREE.RepeatWrapping;
  for (const [w, x, z, ry] of [
    [40, 0, -45.97, 0],
    [40, 0, -0.03, Math.PI],
    [46, -19.97, -23, Math.PI / 2],
    [46, 19.97, -23, -Math.PI / 2],
  ] as const) {
    const t = frieze.clone();
    t.repeat.set(w / 30, 1);
    t.needsUpdate = true;
    k.plane(f, w, 0.9, new THREE.MeshBasicMaterial({ map: t, color: new THREE.Color(0.85, 0.85, 0.85) }), x, 12.35, z, 0, ry);
  }
  // cornice and skirting all round
  for (const [w, d, x, z] of [
    [40, 0.6, 0, -45.7],
    [40, 0.6, 0, -0.3],
    [0.6, 46, -19.7, -23],
    [0.6, 46, 19.7, -23],
  ] as const) {
    k.box(f, w, 0.4, d, x, 12.8, z, C.cream, "polish");
    k.box(f, w, 0.12, d * 1.3, x, 13.2, z, GOLD, "metal");
    k.box(f, w, 0.6, d * 0.5, x, 11.7, z, C.cream, "polish");
    k.box(f, w, 0.35, d * 0.4, x, 0, z, C.greenMarble, "polish");
  }
  // pilasters
  for (const z of [-4, -10, -18, -25, -32, -39, -44])
    for (const x of [-19.85, 19.85]) {
      if (x < 0 && z === -44) continue;
      pilaster(k, f, x, z, 12, "z");
    }
  for (const x of [-17, -12, 12, 17]) pilaster(k, f, x, -45.85, 12, "x");
  for (const x of [-17, -12, -5.5, 5.5, 12, 17]) pilaster(k, f, x, -0.15, 12, "x");

  // ---- the bronze doors and the fanlight over them ----
  for (const [x, w, h] of [
    [0, 3.4, 6.2],
    [-8.75, 2.4, 4.6],
    [8.75, 2.4, 4.6],
  ] as const) {
    k.box(f, w + 0.8, h + 0.6, 0.2, x, 0, -0.12, C.greenMarble, "polish");
    k.box(f, w, h, 0.12, x, 0, -0.24, C.bronze, "metal");
    for (const s of [-1, 1]) {
      // panels on each leaf
      for (let r = 0; r < 3; r++) k.box(f, w / 2 - 0.4, h / 3 - 0.45, 0.04, x + (s * w) / 4, 0.3 + (r * h) / 3, -0.32, "#a8823e", "metal");
      k.box(f, 0.05, 0.8, 0.08, x + s * 0.12, 1.0, -0.36, GOLD, "metal");
    }
    k.box(f, 0.03, h, 0.14, x, 0, -0.3, "#2a1f12", "matte");
  }
  const fan = paint(512, 256, (c, W, Hh) => {
    c.fillStyle = "#1a1408";
    c.fillRect(0, 0, W, Hh);
    const gr = c.createRadialGradient(W / 2, Hh, 10, W / 2, Hh, W / 2);
    gr.addColorStop(0, "#fff2cc");
    gr.addColorStop(1, "#d9a441");
    c.fillStyle = gr;
    c.beginPath();
    c.arc(W / 2, Hh, W / 2 - 8, Math.PI, 0);
    c.fill();
    c.strokeStyle = "#3a2a12";
    c.lineWidth = 8;
    for (let i = 0; i <= 12; i++) {
      const a = Math.PI + (i / 12) * Math.PI;
      c.beginPath();
      c.moveTo(W / 2, Hh);
      c.lineTo(W / 2 + Math.cos(a) * W, Hh + Math.sin(a) * W);
      c.stroke();
    }
    for (const r of [70, 150, W / 2 - 8]) {
      c.beginPath();
      c.arc(W / 2, Hh, r, Math.PI, 0);
      c.stroke();
    }
  });
  const fl = k.plane(f, 7, 3.5, new THREE.MeshBasicMaterial({ map: fan, transparent: true, toneMapped: false, color: new THREE.Color(1.15, 1.1, 1) }), 0, 8.3, -0.2, 0, Math.PI);
  (fl.material as THREE.MeshBasicMaterial).alphaTest = 0.1;
  k.label(f, "ZEC RESERVE", 0, 10.9, -0.22, { h: 0.9, color: GOLD, font: `700 96px ${SERIF}`, ry: Math.PI });

  // ---- security: two walk-through arches by the doors ----
  for (const x of [-4.2, 4.2]) {
    for (const dx of [-0.55, 0.55]) k.box(f, 0.22, 2.3, 0.6, x + dx, 0, -4.5, "#cfd3da", "polish");
    k.box(f, 1.32, 0.3, 0.6, x, 2.3, -4.5, "#cfd3da", "polish");
    k.box(f, 0.6, 0.06, 0.04, x, 2.42, -4.19, "#3ee08f", "glow");
    k.solid(f, x - 0.7, -4.8, x - 0.4, -4.2);
    k.solid(f, x + 0.4, -4.8, x + 0.7, -4.2);
  }
  // brass posts with ropes funnel visitors through the arches
  stanchion(k, f, -6.2, -4.5, [-8.6, -4.5]);
  stanchion(k, f, 6.2, -4.5, [8.6, -4.5]);
  stanchion(k, f, -8.6, -4.5);
  stanchion(k, f, 8.6, -4.5);
  stanchion(k, f, -1.6, -4.5, [-3.4, -4.5]);
  stanchion(k, f, 1.6, -4.5, [3.4, -4.5]);

  // ---- columns, ceiling, chandeliers, laylight ----
  for (const x of [-COLS_X, COLS_X]) for (const z of COLS_Z) column(k, f, x, z, H - 0.55, 0.72);
  coffers(k, f, -20, -46, -6, 0, H, 2.33);
  coffers(k, f, 6, -46, 20, 0, H, 2.33);
  coffers(k, f, -6, -12, 6, 0, H, 2.4);
  coffers(k, f, -6, -46, 6, -27, H, 2.4);
  // the laylight: amber and cream glass in an iron grid, the seal in the middle
  const lay = paint(768, 960, (c, W, Hh) => {
    c.fillStyle = "#2a1d0e";
    c.fillRect(0, 0, W, Hh);
    const n = 12,
      m = 15;
    for (let i = 0; i < n; i++)
      for (let j = 0; j < m; j++) {
        const d = Math.hypot(i - n / 2 + 0.5, j - m / 2 + 0.5);
        c.fillStyle = d < 3 ? "#ffe9b8" : (i + j) % 2 ? "#f3d79a" : "#eac57a";
        c.fillRect(i * (W / n) + 4, j * (Hh / m) + 4, W / n - 8, Hh / m - 8);
      }
    c.fillStyle = "#2a1d0e";
    c.beginPath();
    c.arc(W / 2, Hh / 2, 200, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#ffd36a";
    c.beginPath();
    c.arc(W / 2, Hh / 2, 186, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#2a1d0e";
    c.beginPath();
    c.arc(W / 2, Hh / 2, 150, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#ffcf4a";
    c.font = `900 210px ${SERIF}`;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText("Z", W / 2, Hh / 2 + 10);
    c.fillRect(W / 2 - 12, Hh / 2 - 130, 24, 40);
    c.fillRect(W / 2 - 12, Hh / 2 + 92, 24, 40);
    c.strokeStyle = "#2a1d0e";
    c.lineWidth = 6;
    for (let a = 0; a < 24; a++) {
      const r0 = 200,
        r1 = 470;
      const t = (a / 24) * Math.PI * 2;
      c.beginPath();
      c.moveTo(W / 2 + Math.cos(t) * r0, Hh / 2 + Math.sin(t) * r0);
      c.lineTo(W / 2 + Math.cos(t) * r1, Hh / 2 + Math.sin(t) * r1);
      c.stroke();
    }
  });
  k.plane(f, 12, 15, new THREE.MeshBasicMaterial({ map: lay, toneMapped: false, color: new THREE.Color(0.95, 0.88, 0.76) }), 0, H - 0.02, -19.5, Math.PI / 2);
  for (const [w, d, x, z] of [
    [12.6, 0.4, 0, -12],
    [12.6, 0.4, 0, -27],
    [0.4, 15, -6, -19.5],
    [0.4, 15, 6, -19.5],
  ] as const) {
    k.box(f, w, 0.7, d, x, H - 0.7, z, C.cream, "polish");
    k.box(f, w, 0.12, d + 0.1, x, H - 0.82, z, GOLD, "metal");
  }
  chandelier(k, f, 0, -6.5, H, 1.3);
  chandelier(k, f, 0, -31.5, H, 1.3);
  for (const x of [-15.5, 15.5]) for (const z of [-10.5, -24.5]) chandelier(k, f, x, z, H, 0.85);

  // ---- the information booth and its four-faced clock ----
  const ring = 16;
  for (let i = 0; i < ring; i++) {
    const a = (i / ring) * Math.PI * 2;
    k.box(f, 0.72, 1.05, 0.3, BOOTH.x + Math.cos(a) * 1.7, 0, BOOTH.z + Math.sin(a) * 1.7, C.mahogany, "polish", -a + Math.PI / 2);
    k.box(f, 0.76, 0.06, 0.45, BOOTH.x + Math.cos(a) * 1.72, 1.05, BOOTH.z + Math.sin(a) * 1.72, C.cream, "polish", -a + Math.PI / 2);
    k.box(f, 0.72, 0.05, 0.05, BOOTH.x + Math.cos(a) * 1.87, 0.5, BOOTH.z + Math.sin(a) * 1.87, GOLD, "metal", -a + Math.PI / 2);
  }
  k.cyl(f, 0.22, 0.18, 3.0, BOOTH.x, 0, BOOTH.z, C.brass, "metal", 12);
  k.box(f, 1.0, 1.0, 1.0, BOOTH.x, 3.0, BOOTH.z, C.brass, "metal");
  k.geo(f, new THREE.SphereGeometry(0.28, 14, 10).translate(BOOTH.x, 4.25, BOOTH.z), GOLD, "metal");
  k.cyl(f, 0.2, 0.06, 0.25, BOOTH.x, 4.0, BOOTH.z, C.brass, "metal", 8);
  k.solid(f, BOOTH.x - 1.95, BOOTH.z - 1.95, BOOTH.x + 1.95, BOOTH.z + 1.95);
  const clock = k.surface(
    f,
    256,
    256,
    (c, W, Hh) => {
      c.fillStyle = "#3a2a10";
      c.fillRect(0, 0, W, Hh);
      c.fillStyle = "#f6efd8";
      c.beginPath();
      c.arc(W / 2, Hh / 2, 118, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = "#b8892a";
      c.lineWidth = 8;
      c.stroke();
      c.fillStyle = "#1a1408";
      c.font = `700 26px ${SERIF}`;
      c.textAlign = "center";
      c.textBaseline = "middle";
      ["XII", "I", "II", "III", "IIII", "V", "VI", "VII", "VIII", "IX", "X", "XI"].forEach((r, i) => {
        const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
        c.fillText(r, W / 2 + Math.cos(a) * 92, Hh / 2 + Math.sin(a) * 92);
      });
      const d = new Date();
      const hand = (a: number, len: number, w: number, col: string) => {
        c.strokeStyle = col;
        c.lineWidth = w;
        c.lineCap = "round";
        c.beginPath();
        c.moveTo(W / 2, Hh / 2);
        c.lineTo(W / 2 + Math.cos(a - Math.PI / 2) * len, Hh / 2 + Math.sin(a - Math.PI / 2) * len);
        c.stroke();
      };
      hand(((d.getHours() % 12) + d.getMinutes() / 60) * (Math.PI / 6), 52, 8, "#1a1408");
      hand((d.getMinutes() + d.getSeconds() / 60) * (Math.PI / 30), 80, 5, "#1a1408");
      hand(d.getSeconds() * (Math.PI / 30), 88, 2, "#b02020");
      c.fillStyle = "#b8892a";
      c.beginPath();
      c.arc(W / 2, Hh / 2, 8, 0, Math.PI * 2);
      c.fill();
    },
    1,
  );
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const m = new THREE.Mesh(new THREE.CircleGeometry(0.44, 32), clock.mat);
    m.material = new THREE.MeshBasicMaterial({ map: clock.tex, toneMapped: false });
    k.add(f, m, BOOTH.x + Math.sin(a) * 0.51, 3.5, BOOTH.z + Math.cos(a) * 0.51, a);
  }
  k.label(f, "INFORMATION", BOOTH.x, 1.25, BOOTH.z + 1.9, { h: 0.16, color: GOLD, font: `700 80px ${SERIF}` });

  // ---- the quote pillar opposite: four price screens on a green marble drum ----
  k.cyl(f, 1.0, 1.0, 0.3, QUOTE.x, 0, QUOTE.z, C.greenMarble, "polish", 24);
  k.cyl(f, 1.05, 1.05, 0.06, QUOTE.x, 0.3, QUOTE.z, GOLD, "metal", 24);
  k.cyl(f, 0.7, 0.62, 2.0, QUOTE.x, 0.36, QUOTE.z, C.greenMarble, "polish", 24);
  k.box(f, 1.5, 1.2, 1.5, QUOTE.x, 2.36, QUOTE.z, "#16130e", "polish");
  k.box(f, 1.62, 0.1, 1.62, QUOTE.x, 3.56, QUOTE.z, GOLD, "metal");
  k.box(f, 1.62, 0.1, 1.62, QUOTE.x, 2.3, QUOTE.z, GOLD, "metal");
  k.cyl(f, 0.5, 0.02, 0.6, QUOTE.x, 3.66, QUOTE.z, C.brass, "metal", 4, Math.PI / 4);
  k.geo(f, new THREE.SphereGeometry(0.16, 12, 8).translate(QUOTE.x, 4.35, QUOTE.z), GOLD, "metal");
  k.solid(f, QUOTE.x - 1.05, QUOTE.z - 1.05, QUOTE.x + 1.05, QUOTE.z + 1.05);
  const quote = k.surface(f, 512, 400, (c, W, Hh) => drawPrice(c, W, Hh, "ZEC / USD"), 5);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.36, 1.06), quote.mat);
    k.add(f, m, QUOTE.x + Math.sin(a) * 0.76, 2.43 + 0.53, QUOTE.z + Math.cos(a) * 0.76, a);
    k.pick(f, m, "<b>ZEC / USD</b><span>live</span>", priceInfo);
  }

  // ---- the viewing-key dais ----
  k.cyl(f, 3.4, 3.4, 0.2, ISLAND.x, 0, ISLAND.z, C.greenMarble, "polish", 48);
  k.cyl(f, 3.45, 3.45, 0.05, ISLAND.x, 0.2, ISLAND.z, GOLD, "metal", 48);
  k.cyl(f, 3.2, 3.2, 0.06, ISLAND.x, 0.2, ISLAND.z, C.deepGreen, "polish", 48);
  k.cyl(f, 0.9, 1.1, 1.0, ISLAND.x, 0.25, ISLAND.z, C.greenMarble, "polish", 24);
  k.cyl(f, 1.15, 1.15, 0.08, ISLAND.x, 1.25, ISLAND.z, GOLD, "metal", 24);
  k.solid(f, ISLAND.x - 3.1, ISLAND.z - 3.1, ISLAND.x + 3.1, ISLAND.z + 3.1);
  const term = bankSurface(512, 340);
  const termMat = bankScreen(term, 1, 0.667, 1.25).material as THREE.MeshBasicMaterial;
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const dir = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
    const kg = new THREE.Group();
    k.vox(f, "bankKiosk", kiosk, ISLAND.x + dir.x * 2.3, ISLAND.z + dir.z * 2.3, a, { k: 1, dy: 0.26, solid: false });
    const sc = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.667), termMat);
    sc.position.set(0, KIOSK_SCREEN.y, KIOSK_SCREEN.z);
    sc.rotation.x = KIOSK_SCREEN.tilt;
    kg.add(sc);
    k.add(f, kg, ISLAND.x + dir.x * 2.3, 0.26, ISLAND.z + dir.z * 2.3, a);
    k.hit(f, 1.3, 1.9, 1.0, ISLAND.x + dir.x * 2.3, 0.26, ISLAND.z + dir.z * 2.3, `<b>Viewing key terminal</b><span>Terminal ${"ABCD"[i]}</span>`, () => KEY_PICK, a);
  }
  // the key turning over the dais, in a cone of light
  const key = new THREE.Group();
  k.add(f, key, ISLAND.x, 3.6, ISLAND.z, 0);
  const holo = holoObject();
  key.add(holo);
  const beamTex = paint(64, 256, (c, W, Hh) => {
    const gr = c.createLinearGradient(0, 0, 0, Hh);
    gr.addColorStop(0, "rgba(255,220,140,0)");
    gr.addColorStop(1, "rgba(255,210,120,0.22)");
    c.fillStyle = gr;
    c.fillRect(0, 0, W, Hh);
  });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.2, 4.2, 32, 1, true), new THREE.MeshBasicMaterial({ map: beamTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
  k.add(f, beam, ISLAND.x, 1.33 + 2.1, ISLAND.z, 0);
  const ringSign = paint(2048, 96, (c, W, Hh) => {
    c.clearRect(0, 0, W, Hh);
    c.fillStyle = "#ffd36a";
    c.font = `700 64px ${SERIF}`;
    c.textBaseline = "middle";
    c.fillText("VIEWING KEY TERMINALS  ·  閲覧鍵  ·  VIEW, NEVER SPEND  ·  VIEWING KEY TERMINALS  ·  閲覧鍵  ·  VIEW, NEVER SPEND  ·", 0, Hh / 2);
  });
  const band = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 0.32, 48, 1, true), new THREE.MeshBasicMaterial({ map: ringSign, transparent: true, side: THREE.DoubleSide, toneMapped: false, depthWrite: false, color: new THREE.Color(1.4, 1.3, 1.1) }));
  k.add(f, band, ISLAND.x, 5.2, ISLAND.z, 0);
  k.ticks[f].push((dt, t) => {
    holo.rotation.y += dt * 0.8;
    key.position.y = L.y + 3.6 + Math.sin(t * 1.2) * 0.08;
    band.rotation.y -= dt * 0.15;
  });
  let blinkT = 0;
  k.ticks[f].push((dt, t) => {
    blinkT += dt;
    if (blinkT < 0.15) return;
    blinkT = 0;
    drawTerminal(term, Math.floor(t * 2) % 2 === 0, (t * 0.35) % 1, "ZEC RESERVE · LOCAL DECRYPTION");
  });

  // ---- the teller counter, its bronze grille, the windows ----
  const cz = COUNTER_Z - 0.45;
  k.box(f, 34, 0.18, 1.0, 0, 0, cz, C.greenMarble, "polish");
  k.box(f, 34, 0.95, 0.9, 0, 0.18, cz, C.mahogany, "polish");
  for (let x = -16.5; x <= 16.5; x += 1.5) k.box(f, 1.2, 0.6, 0.04, x, 0.35, COUNTER_Z + 0.02, "#6a2c1c", "polish");
  k.box(f, 34.2, 0.08, 1.1, 0, 1.13, cz, C.cream, "polish");
  k.box(f, 34.2, 0.04, 0.06, 0, 1.13, COUNTER_Z + 0.06, GOLD, "metal");
  k.solid(f, -17.1, COUNTER_Z - 0.95, 17.1, COUNTER_Z + 0.05);
  // the queue lanes before the four middle windows
  for (const x of [-8.5, -4.25, 0, 4.25, 8.5]) {
    stanchion(k, f, x, -34.9, [x, -32.9]);
    stanchion(k, f, x, -32.9, [x, -30.9]);
    stanchion(k, f, x, -30.9);
  }
  // gates at both ends
  for (const s of [-1, 1]) {
    k.box(f, 2.9, 1.1, 0.08, s * 18.55, 0, cz, C.bronze, "metal");
    for (let x = 17.2; x < 19.9; x += 0.18) k.box(f, 0.025, 1.0, 0.025, s * x, 0.05, cz + 0.06, GOLD, "metal");
    k.solid(f, s > 0 ? 17 : -20, cz - 0.1, s > 0 ? 20 : -17, cz + 0.1);
  }
  // the grille: bronze bars, rails, an arched opening at each window
  const gz = cz - 0.1;
  for (let x = -17; x <= 17.001; x += 0.15) {
    const w = WINDOWS.find((wx) => Math.abs(x - wx) < 0.72);
    k.box(f, 0.03, w !== undefined ? 0.6 : 1.95, 0.03, x, w !== undefined ? 2.55 : 1.2, gz, C.bronze, "metal");
  }
  for (const y of [1.2, 2.5, 3.1]) k.box(f, 34, 0.06, 0.06, 0, y, gz, C.bronze, "metal");
  k.box(f, 34.2, 0.3, 0.3, 0, 3.15, gz, C.bronze, "metal");
  for (let x = -16.5; x <= 16.5; x += 0.75) k.cyl(f, 0.0, 0.06, 0.28, x, 3.45, gz, GOLD, "metal", 4);
  const glassMat = new THREE.MeshStandardMaterial({ color: "#cfe6f0", transparent: true, opacity: 0.08, roughness: 0.05, metalness: 0.6, depthWrite: false });
  WINDOWS.forEach((x, i) => {
    const arch = new THREE.TorusGeometry(0.7, 0.04, 6, 24, Math.PI).translate(x, 2.5 - 0.7 + 0.7, gz);
    k.geo(f, arch, GOLD, "metal");
    k.box(f, 1.4, 0.04, 0.4, x, 1.2, gz + 0.2, C.cream, "polish");
    // the window number, hung on chains
    k.box(f, 0.62, 0.42, 0.06, x, 3.6, gz + 0.12, "#16130e", "polish");
    k.box(f, 0.7, 0.5, 0.04, x, 3.56, gz + 0.08, GOLD, "metal");
    k.label(f, String(i + 1), x, 3.81, gz + 0.16, { h: 0.34, color: "#ffd36a", font: `700 96px ${SERIF}` });
    bankerLamp(k, f, x + 0.95, 1.21, cz + 0.2, 0);
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.3), glassMat);
    pane.raycast = () => {};
    k.add(f, pane, x, 1.9, gz + 0.02, 0);
  });
  // behind the counter: clerks' desks, cabinets, the back office
  for (const x of [-12, -4, 4, 12]) {
    k.vox(f, "rsvDesk", () => officeDesk(3), x, -41.2, Math.PI, { solid: false });
    k.vox(f, "rsvChairOffice", () => chair("#2a1a12", true), x, -40.4, Math.PI, { solid: false });
  }
  for (let x = -18; x <= 18; x += 1.2) {
    k.box(f, 1.1, 2.0, 0.6, x, 0, -45.6, "#3a2a1a", "polish");
    for (let r = 0; r < 4; r++) {
      k.box(f, 0.9, 0.38, 0.03, x, 0.1 + r * 0.48, -45.28, "#5a4128", "polish");
      k.box(f, 0.14, 0.04, 0.03, x, 0.3 + r * 0.48, -45.25, GOLD, "metal");
    }
  }

  // ---- the live wall over the tellers ----
  const wall = k.surface(f, 2048, 552, (c, W, Hh) => drawLiveWall(c, W, Hh, k.height), 4);
  const lw = new THREE.Mesh(new THREE.PlaneGeometry(26, 7), wall.mat);
  k.add(f, lw, 0, 4.4 + 3.5, -45.7, 0);
  k.box(f, 26.6, 7.6, 0.2, 0, 4.1, -45.85, "#16130e", "polish");
  k.box(f, 26.9, 0.16, 0.3, 0, 11.7, -45.8, GOLD, "metal");
  k.box(f, 26.9, 0.16, 0.3, 0, 4.0, -45.8, GOLD, "metal");
  const panes: [number, () => PickInfo, string][] = [
    [-8.7, priceInfo, "<b>ZEC / USD</b><span>live</span>"],
    [0, () => supplyInfo(k.height), "<b>Supply</b><span>live</span>"],
    [8.7, poolsInfo, "<b>Value pools</b><span>live</span>"],
  ];
  for (const [x, info, hover] of panes) k.hit(f, 8.6, 7, 0.1, x, 4.4, -45.6, hover, info);
  // the tape under it
  const tapeS = new Surface(4096, 64);
  tapeS.tex.wrapS = THREE.RepeatWrapping;
  tapeS.tex.repeat.set(0.7, 1);
  const redrawTape = () => tapeS.draw((c, W, Hh) => drawTape(c, W, Hh, tape(k.height)));
  redrawTape();
  const tp = new THREE.Mesh(new THREE.PlaneGeometry(30, 0.5), tapeS.mat);
  k.add(f, tp, 0, 3.55, -45.65, 0);
  k.box(f, 30.4, 0.7, 0.12, 0, 3.2, -45.78, "#0a0a0c", "polish");
  let tapeT = 0;
  k.ticks[f].push((dt, t) => {
    tapeS.tex.offset.x = (t * 0.02) % 1;
    tapeT += dt;
    if (tapeT > 10) {
      tapeT = 0;
      redrawTape();
    }
  });
  k.label(f, "準備銀行", -16.2, 9.2, -45.75, { h: 1.0, color: "#ffd36a", font: `700 110px ${JP}` });
  k.label(f, "準備銀行", 16.2, 9.2, -45.75, { h: 1.0, color: "#ffd36a", font: `700 110px ${JP}` });

  // ---- the lifts, banners, boards, private banking ----
  k.lifts(f, -19.95, -14, Math.PI / 2);
  for (const [x, z, ry] of [
    [-19.9, -28.5, Math.PI / 2],
    [-19.9, -35.5, Math.PI / 2],
    [19.9, -28.5, -Math.PI / 2],
    [19.9, -35.5, -Math.PI / 2],
    [-19.9, -6.9, Math.PI / 2],
    [19.9, -6.9, -Math.PI / 2],
  ] as const)
    banner(k, x, z, ry);
  // a board of the pools by the lifts, the supply opposite
  const pb = k.screen(f, 4.4, 2.6, (c, W, Hh) => drawPools(c, W, Hh), 6, 768);
  k.add(f, pb, -19.85, 4.6, -21.5, Math.PI / 2);
  k.box(f, 0.14, 2.9, 4.7, -19.92, 3.15, -21.5, "#16130e", "polish");
  k.pick(f, pb, "<b>Value pools</b><span>live</span>", poolsInfo);
  const sb = k.screen(f, 4.4, 2.6, (c, W, Hh) => drawSupply(c, W, Hh, k.height), 6, 768);
  k.add(f, sb, 19.85, 4.6, -32, -Math.PI / 2);
  k.box(f, 0.14, 2.9, 4.7, 19.92, 3.15, -32, "#16130e", "polish");
  k.pick(f, sb, "<b>Supply</b><span>live</span>", () => supplyInfo(k.height));
  // private banking along the east wall: three desks, an advisor and a client at each
  const DESKS = [-10, -17, -24];
  for (const z of DESKS) {
    desk(k, f, 17.4, z, 1.8, 0.9, -Math.PI / 2);
    bankerLamp(k, f, 17.4, 0.78, z - 0.6, -Math.PI / 2);
    clubChair(k, f, 18.6, z, -Math.PI / 2, "#3a1a10");
    clubChair(k, f, 16.0, z, Math.PI / 2, "#6a2a1a");
    k.box(f, 0.24, 0.02, 0.3, 17.2, 0.78, z + 0.15, "#f4f1ea", "matte");
  }
  k.label(f, "PRIVATE BANKING", 19.85, 4.2, -17, { h: 0.3, color: GOLD, font: `700 80px ${SERIF}`, ry: -Math.PI / 2 });
  k.painting(f, 1888, 19.82, 7.6, -10, -Math.PI / 2, 1.4, "First Governor");
  k.painting(f, 4096, 19.82, 7.6, -24, -Math.PI / 2, 1.4, "Second Governor");
  // benches between the columns, urns in the corners
  bench(k, f, -COLS_X, -17.5, 3.2, true);
  bench(k, f, COLS_X, -17.5, 3.2, true);
  bench(k, f, -COLS_X, -24.5, 3.2, true);
  bench(k, f, COLS_X, -24.5, 3.2, true);
  for (const [x, z] of [
    [-18.6, -1.6],
    [18.6, -1.6],
    [-18.6, -33.6],
    [18.6, -33.6],
    [-11, -3.2],
    [11, -3.2],
  ])
    urn(k, f, x, z, x + z);

  // ---- light ----
  k.light(f, 0, 11, -8, "#ffd59a", 22, 30);
  k.light(f, 0, 12.4, -19.5, "#ffe6c0", 26, 28);
  k.light(f, 0, 8, -31, "#ffd09a", 24, 26);
  k.light(f, -14.5, 7, -17, "#ffc988", 14, 20);
  k.light(f, 14.5, 7, -17, "#ffc988", 14, 20);
  k.light(f, 0, 5, -40.5, "#ffe2b8", 12, 14);

  // ---- people ----
  k.onCast(f, () => cast(k));
}

/** A tall banner: deep green with a gold seal, hanging from a brass rod. */
function banner(k: ReserveKit, x: number, z: number, ry: number) {
  const t = paint(256, 768, (c, W, Hh) => {
    c.fillStyle = "#14382a";
    c.fillRect(0, 0, W, Hh);
    c.fillStyle = "#c9a24a";
    c.fillRect(10, 0, 6, Hh);
    c.fillRect(W - 16, 0, 6, Hh);
    c.beginPath();
    c.moveTo(0, Hh - 60);
    c.lineTo(W / 2, Hh);
    c.lineTo(W, Hh - 60);
    c.lineTo(W, Hh);
    c.lineTo(0, Hh);
    c.fillStyle = "#0b0a08";
    c.fill();
    c.fillStyle = "#c9a24a";
    c.beginPath();
    c.arc(W / 2, 250, 86, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#14382a";
    c.beginPath();
    c.arc(W / 2, 250, 70, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#e8c45a";
    c.font = `900 110px ${SERIF}`;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText("Z", W / 2, 256);
    c.font = `700 80px ${JP}`;
    c.fillText("準", W / 2, 440);
    c.fillText("備", W / 2, 540);
  });
  const m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.9, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide });
  const p = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 4.8), m);
  const off = 0.12;
  k.add(F.hall, p, x + Math.sin(ry) * off, 8.6, z + Math.cos(ry) * off, ry);
  k.box(F.hall, 1.9, 0.06, 0.06, x + Math.sin(ry) * off, 11.05, z + Math.cos(ry) * off, GOLD, "metal", ry);
}

/** The holographic key over the dais (the VIEW KEY BANK's key, smaller, in light). */
function holoObject() {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color("#ffd36a").multiplyScalar(1.6), toneMapped: false, transparent: true, opacity: 0.85 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.09, 10, 32), mat);
  ring.position.y = 0.55;
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.2, 0.08), mat);
  shaft.position.y = -0.4;
  const t1 = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.12, 0.08), mat);
  t1.position.set(0.2, -0.85, 0);
  const t2 = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.12, 0.08), mat);
  t2.position.set(0.16, -0.6, 0);
  g.add(ring, shaft, t1, t2);
  g.traverse((o) => (o.raycast = () => {}));
  return g;
}

/** The live wall: price and chart, the block and supply, the pools. */
function drawLiveWall(c: CanvasRenderingContext2D, W: number, Hh: number, height: number) {
  const third = Math.floor(W / 3);
  const sub = (x: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void) => {
    c.save();
    c.translate(x, 0);
    c.beginPath();
    c.rect(0, 0, third, Hh);
    c.clip();
    draw(c, third, Hh);
    c.restore();
  };
  sub(0, (g, w, h) => drawPrice(g, w, h, "ZEC / USD"));
  sub(third, (g, w, h) => drawSupply(g, w, h, height));
  sub(third * 2, (g, w, h) => drawPools(g, w, h));
  c.fillStyle = "#c9a24a";
  c.fillRect(third - 2, 0, 4, Hh);
  c.fillRect(third * 2 - 2, 0, 4, Hh);
}

// ---- the people of the hall ----------------------------------------------------------------------

function cast(k: ReserveKit) {
  const P = (id: number, x: number, z: number, role: string, o: Parameters<ReserveKit["person"]>[4] = {}) => k.person(f, id, [x, z], role, o);
  const price = () => {
    const p = Market.state.price;
    return p ? `ZEC is ${usd(p.usd)}, ${p.usd_24h_change >= 0 ? "up" : "down"} ${Math.abs(p.usd_24h_change).toFixed(1)}% today.` : "The board says we're up. Probably.";
  };
  const shielded = () => {
    const p = Market.state.pools;
    return p ? `${zec(p.shielded)} ZEC shielded. ${(p.shielded_ratio * 100).toFixed(1)}% of everything.` : "Most of it shielded, they say.";
  };
  // guards at the arches
  P(2711, -5.4, -3.9, "Guard", { face: [0, 1], lines: ["Welcome to the ZEC Reserve.", "Through the arch, please.", "Viewing keys only. Spending keys stay home."] });
  P(2712, 5.4, -3.9, "Guard", { face: [0, 1], lines: ["Good day. Mind the step.", "No photos near the vault lift.", "Bags on the left, please."] });
  P(2713, -18.2, -9.6, "Guard", { face: [1, 0], lines: ["Vault access by appointment.", "Lifts to the right."] });
  // the booth
  P(3001, BOOTH.x, BOOTH.z - 0.6, "Concierge", { face: [0, 1], lines: [() => `Block ${num(k.height)}. All windows are open.`, "Trading floor on 2, museum on 3.", "The gold vault is on minus one.", price] });
  // tellers and clerks
  WINDOWS.forEach((x, i) => P(3101 + i * 7, x, COUNTER_Z - 1.4, `Teller · window ${i + 1}`, { face: [0, 1], lines: ["Next, please!", `Window ${i + 1} open.`, "Shielded or transparent today?", "Sign here. Or don't. It's private."], every: [9, 18], near: 8 }));
  for (const [x, id] of [
    [-12, 3301],
    [4, 3302],
    [12, 3303],
  ] as const)
    P(id, x, -40.2, "Clerk", { face: [0, -1], sit: true, lines: ["Counting. To the zatoshi.", "Ledger balances.", () => `Block ${num(k.height)} filed.`], every: [12, 22] });
  // private banking: advisors and their clients
  const DESKS = [-10, -17, -24];
  const scripts: [number, string | (() => string)][][] = [
    [
      [1, "I'd like to open a shielded account."],
      [0, "Orchard or Ironwood?"],
      [1, "Whatever keeps my balance mine."],
      [0, "Ironwood, then. Sign here."],
    ],
    [
      [1, "What's your interest rate?"],
      [0, "Zero. And zero knowledge."],
      [1, "I'll take both."],
    ],
    [
      [0, shielded],
      [1, "And the rest?"],
      [0, "Still transparent. For now."],
      [1, "Not mine. Shield it all."],
    ],
  ];
  DESKS.forEach((z, i) => {
    const a = P(3401 + i, 18.6, z, "Private banker", { face: [-1, 0], sit: true });
    const b = P(3501 + i * 11, 16.0, z, "Client", { face: [1, 0], sit: true });
    k.dialog(f, [a, b], scripts[i], { near: 11 });
  });
  // bench sitters
  P(3601, -COLS_X, -17.0, "Client · waiting", { face: [1, 0], sit: true, lines: ["This queue moves slower than 150-second blocks.", "I'm only here to shield my coins."], every: [14, 24] });
  P(3602, COLS_X, -24.0, "Client · waiting", { face: [-1, 0], sit: true, lines: ["Do they take Ironwood here?", "My number is up next."], every: [14, 24] });
  // talkers between the columns
  k.dialog(f, [P(3701, -7.6, -12.6, "Visitor", { face: [1, 0] }), P(3702, -6.4, -12.9, "Visitor", { face: [-1, 0] })], [
    [0, "Did you see the price this morning?"],
    [1, price],
    [0, "I don't look. I just shield."],
  ]);
  k.dialog(f, [P(3703, 7.2, -26.2, "Tourist", { face: [-1, 0] }), P(3704, 6.0, -26.6, "Tourist", { face: [1, 0] })], [
    [0, "Is the vault really under us?"],
    [1, "Gold vault on minus one. Real pools."],
    [0, "Can we see it?"],
    [1, "Take the lift. Mind the door."],
  ]);
  k.dialog(f, [P(3705, 13.6, -6.2, "Investor", { face: [0, -1] }), P(3706, 13.4, -7.4, "Investor", { face: [0, 1] })], [
    [0, "I heard the bell upstairs."],
    [1, () => `New block. #${num(k.height)}.`],
    [0, "Every 75 seconds, a bell."],
    [1, "Music to my ears."],
  ]);
  // at the terminals
  for (let i = 0; i < 3; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const x = ISLAND.x + Math.sin(a) * 3.75,
      z = ISLAND.z + Math.cos(a) * 3.75;
    P(3801 + i * 5, x, z, "Client · key terminal", { face: [-Math.sin(a), -Math.cos(a)], lines: ["My viewing key, my business.", "It decrypts right here. Nothing leaves.", "Balance… shielded. Nice."], every: [16, 26] });
  }
  // the queues
  new Queues(k, P);
}

/** Four queues before the middle windows: the head is served, walks off, joins again later. */
class Queues {
  private lines: Snark[][] = QUEUE_W.map(() => []);
  constructor(
    private k: ReserveKit,
    P: (id: number, x: number, z: number, role: string, o?: Parameters<ReserveKit["person"]>[4]) => Promise<Snark | null>,
  ) {
    const ids = [4001, 4013, 4026, 4039, 4052, 4065, 4078, 4091, 4104, 4117, 4130, 4143];
    const said = ["Unified address, please.", "Withdrawal. Shielded, of course.", "I'm next!", "How long is this going to take?", "Deposit to Ironwood.", "Cashier's check? In 2026?"];
    ids.forEach((id, i) => {
      const q = i % 4;
      void P(id, WINDOWS[QUEUE_W[q]], this.slot(this.lines[q].length + Math.floor(i / 4)), "Client · queue", { face: [0, -1], lines: [said[i % said.length], said[(i + 3) % said.length]], every: [14, 26], near: 7 }).then((s) => {
        if (!s) return;
        this.lines[q].push(s);
        if (this.lines[q].length === 1) void this.serve(q);
      });
    });
  }
  private slot(i: number) {
    return COUNTER_Z + 0.75 + i * 0.95;
  }
  private async serve(q: number) {
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const x = WINDOWS[QUEUE_W[q]];
    for (;;) {
      await sleep(9000 + Math.random() * 9000);
      if (this.k.current !== f) continue;
      const line = this.lines[q];
      const head = line.shift();
      if (!head) continue;
      // the rest shuffle forward
      line.forEach((s, i) => {
        void s.walk([new THREE.Vector3(x, L.y, this.slot(i))], 0.8).then(() => (s.faceDir = new THREE.Vector3(0, 0, -1)));
      });
      // the one served walks away round the dais, then joins the shortest queue at the back
      head.faceDir = null;
      const side = x < 0 ? -1 : 1;
      void (async () => {
        await head.walk([new THREE.Vector3(x + side * 2.1, L.y, COUNTER_Z + 1.2), new THREE.Vector3(side * 7.5, L.y, -27), new THREE.Vector3(side * (4 + Math.random() * 3), L.y, -15 + Math.random() * 6)], 1.1);
        await sleep(4000 + Math.random() * 8000);
        let best = 0;
        this.lines.forEach((l, i) => l.length < this.lines[best].length && (best = i));
        this.lines[best].push(head);
        const bx = WINDOWS[QUEUE_W[best]];
        await head.walk([new THREE.Vector3(bx + (bx < 0 ? -2.1 : 2.1), L.y, -29.5), new THREE.Vector3(bx, L.y, this.slot(this.lines[best].indexOf(head)))], 1.1);
        head.faceDir = new THREE.Vector3(0, 0, -1);
      })();
    }
  }
}
