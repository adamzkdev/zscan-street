/**
 * MEMPOOL RUSH · PORT DOCKS (ZStreet's Proof Factory docks): a night on the quay. The plaza is a long concrete pier, the harbour
 * on both sides; each block template rides a barge in its owner's colour that drifts up and down the
 * quay (the chevrons on the water point the way it goes). A parcel that misses the pier sinks.
 * Round it: container stacks behind the fences, buoys and floating lanterns, the bay's towers far off.
 */
import * as THREE from "three";
import { FONT, rr } from "../../kit";
import { GEO, canvasTex, glow, label, qBlock, toon } from "../../k3";
import { INK, tint } from "../../hud";
import { drawMark } from "../../theme";
import { Bobs, Parts, city, containers, pools, softGlow as softGlowTex } from "../sign-levels/parts";
import type { PoolCtx, PoolLive, PoolState } from "./types";

/** The pier: half width and half depth; the barges' path (the crates drift ±AMP round their berths). */
export const DOCK_XW = 10.5;
export const DOCK_ZD = 5.0;

export function docksSet(c: PoolCtx): PoolLive {
  const { scene, rnd } = c;
  c.hemi.color.set("#c4d2ff");
  c.hemi.groundColor.set("#2a2440");
  c.hemi.intensity = 1.6;
  c.sun.color.set("#ffe2c4");
  c.sun.intensity = 1.9;
  c.sun.position.set(-26, 50, 30);
  const XW = c.xw,
    ZD = c.zd;
  const B = new Parts();

  // ---- the pier's top: concrete slabs, the yellow edge lines, the loading marks, the Q in the middle
  const PX = 40;
  const FW = (XW + 0.9) * 2,
    FD = ZD * 2;
  const tex = canvasTex(Math.round(FW * PX), Math.round(FD * PX), (g) => {
    const w = FW * PX,
      h = FD * PX;
    g.fillStyle = "#5d6274";
    g.fillRect(0, 0, w, h);
    const slab = 2.6 * PX;
    for (let y = 0; y < h; y += slab)
      for (let x = 0; x < w; x += slab) {
        g.fillStyle = (x / slab + y / slab) % 2 ? "#666b7e" : "#61667a";
        g.fillRect(x + 2, y + 2, slab - 4, slab - 4);
        for (let k = 0; k < 6; k++) {
          g.fillStyle = `rgba(255,255,255,${0.02 + Math.random() * 0.04})`;
          g.fillRect(x + Math.random() * slab, y + Math.random() * slab, 3 + Math.random() * 8, 2);
        }
      }
    // the edges: yellow lines with black hatching
    for (const y of [10, h - 22]) {
      g.fillStyle = "#ffcc2e";
      g.fillRect(0, y, w, 12);
      g.fillStyle = INK;
      for (let x = 0; x < w; x += 28) {
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + 12, y);
        g.lineTo(x + 6, y + 12);
        g.lineTo(x - 6, y + 12);
        g.fill();
      }
    }
    const X = (x: number) => (x + FW / 2) * PX,
      Z = (z: number) => (z + ZD) * PX;
    // the berths: each barge's lane along the edge, in its owner's colour
    c.crates.forEach(([cx, cz], i) => {
      const col = c.players[i].color;
      const z = cz < 0 ? Z(-ZD + 0.55) : Z(ZD - 0.55);
      g.fillStyle = tint(col, -0.35);
      rr(g, X(cx - 4.2), z - 10, 8.4 * PX, 20, 10);
      g.fill();
      g.fillStyle = col;
      for (let k = -3; k <= 3; k++) g.fillRect(X(cx + k * 1.2) - 9, z - 3, 18, 6);
    });
    // the ⓩ in the middle (its block clock lights sit on the ring)
    g.lineCap = "butt";
    g.strokeStyle = "rgba(255,255,255,0.16)";
    g.lineWidth = 0.9 * PX;
    g.beginPath();
    g.arc(X(0), Z(0), 2.7 * PX, 0, Math.PI * 2);
    g.stroke();
    drawMark(g, X(0), Z(0), 3.4 * PX, "rgba(0,0,0,0)", "rgba(255,255,255,0.16)");
    // the loading marks round the intake pads
    for (const [px, pz] of c.pads) {
      g.strokeStyle = "rgba(255,204,46,0.55)";
      g.lineWidth = 5;
      g.setLineDash([14, 10]);
      g.beginPath();
      g.arc(X(px), Z(pz), 1.5 * PX, 0, Math.PI * 2);
      g.stroke();
      g.setLineDash([]);
    }
    g.font = `900 ${0.9 * PX}px ${FONT}`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillStyle = "rgba(255,255,255,0.12)";
    g.fillText("PIER Z", X(-5.2), Z(0));
    g.fillText("BERTH 12", X(5.2), Z(0));
  });
  const top = new THREE.Mesh(new THREE.PlaneGeometry(FW, FD).rotateX(-Math.PI / 2), new THREE.MeshToonMaterial({ map: tex, gradientMap: toon("#fff").gradientMap }));
  scene.add(top);
  // the pier's body and its walls down to the water, the fenders
  B.box("#4a4f62", FW, 1.6, FD, 0, -1.6, 0, 0.05);
  B.box("#3a3e50", FW + 0.4, 2.0, FD - 0.6, 0, -3.6, 0, 0.04);
  for (const sz of [-1, 1])
    for (let x = -XW + 0.8; x <= XW - 0.7; x += 2.4) {
      B.add("cyl", "#1e1d28", 0.42, 0.9, 0.42, x, -0.62, sz * (ZD + 0.12), { ink: 0.03 });
    }
  // the fences at both ends (the plaza's ends), lamps on them
  for (const sx of [-1, 1]) {
    const x = sx * (XW + 0.15);
    B.box("#c9ccd6", 0.16, 1.0, FD - 0.2, x, 0, 0, 0.03);
    B.lit("#ffcc2e", 0.18, 0.08, FD - 0.2, x, 1.0, 0);
    for (let z = -ZD + 0.4; z <= ZD - 0.3; z += 1.2) B.box("#9aa0b2", 0.1, 1.0, 0.1, x, 0, z, 0);
    for (const sz of [-1, 1]) {
      const z = sz * (ZD - 0.35);
      B.box("#2b2d3c", 0.34, 0.3, 0.34, x, 0, z, 0.03);
      B.add("cyl", "#2b2d3c", 0.14, 3.2, 0.14, x, 1.9, z, { ink: 0.025 });
      B.add("ball", sz < 0 ? "#ff7eb6" : "#7ff0ff", 0.46, 0.46, 0.46, x, 3.65, z, { lit: true });
      B.add("cone", "#2b2d3c", 0.6, 0.26, 0.6, x, 4.0, z, { ry: Math.PI / 4, ink: 0.02 });
    }
  }
  // the land beyond the fences: container stacks, a bollard or two
  const boxCols = ["#d9483b", "#2f8fd8", "#f2b53a", "#3fae6a", "#e9eef4", "#8a5cd8", "#e86a2a"];
  const boxes: { c: string; x: number; y: number; z: number; ry?: number }[] = [];
  for (const sx of [-1, 1]) {
    B.box("#4a4f62", 9, 1.6, FD + 6, sx * (XW + 0.9 + 4.5), -1.6, 0, 0.04);
    for (let k = 0; k < 6; k++) {
      const z = -ZD + 0.9 + k * 1.75;
      const n = 1 + Math.floor(rnd() * 3);
      for (let j = 0; j < n; j++) boxes.push({ c: boxCols[Math.floor(rnd() * boxCols.length)], x: sx * (XW + 3.6 + (k % 2) * 0.3), y: j * 1.62, z, ry: (rnd() - 0.5) * 0.04 });
    }
    B.add("cyl", "#1e1d28", 0.5, 0.5, 0.5, sx * (XW + 1.4), 0.25, -ZD + 0.6, { ink: 0.03 });
    B.add("cyl", "#1e1d28", 0.5, 0.5, 0.5, sx * (XW + 1.4), 0.25, ZD - 0.6, { ink: 0.03 });
  }
  // buoys and lanterns on the water, where the barges turn
  for (const sz of [-1, 1])
    for (const sx of [-1, 1]) {
      B.add("cyl", "#e8e8f0", 0.7, 0.9, 0.7, sx * 11.6, -0.7, sz * (ZD + 1.6), { ink: 0.04 });
      B.add("cone", "#ff3d5a", 0.8, 0.9, 0.8, sx * 11.6, 0.45, sz * (ZD + 1.6), { ink: 0.03 });
      B.add("ball", "#ffe14a", 0.28, 0.28, 0.28, sx * 11.6, 1.0, sz * (ZD + 1.6), { lit: true });
    }
  // the bay far off: three towers and the ship-shaped park across their tops, the ring, the steel trees
  const bay = -95;
  for (let k = 0; k < 3; k++) {
    B.box("#c9d4e8", 7, 46, 6, -14 + k * 9, -1, bay, 0.1, 0.1);
    B.lit("#ffe9b8", 6.2, 0.3, 6.2, -14 + k * 9, 40, bay + 0.1);
  }
  B.box("#dfe6f4", 34, 2.2, 7, -5, 45, bay, 0.1, 0.1);
  B.lit("#7ff0ff", 34.2, 0.3, 7.2, -5, 46.4, bay);
  for (let k = 0; k < 7; k++) {
    const x = 26 + (k % 4) * 6 + (k > 3 ? 3 : 0),
      z = bay + 8 + (k > 3 ? 6 : 0),
      h = 12 + rnd() * 9;
    B.add("cyl", "#5a3d8a", 0.9, h, 0.9, x, h / 2 - 1, z, { ink: 0.05 });
    B.add("cone", "#8a4fd8", 7, 3, 7, x, h - 1, z, { rx: Math.PI, ink: 0.05 });
    B.add("ball", k % 2 ? "#ff7eb6" : "#7ff0ff", 1.0, 1.0, 1.0, x, h + 0.6, z, { lit: true });
  }
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(16, 0.7, 6, 48), glow("#ff7eb6"));
  wheel.position.set(-46, 18, bay + 10);
  wheel.rotation.y = 0.5;
  scene.add(wheel);
  // a Z-Block over each end
  const qbs: THREE.Object3D[] = [];
  for (const [x, y, z] of [
    [-13, 7, -4],
    [13, 6.4, -5],
  ]) {
    const qb = qBlock(1.3);
    qb.position.set(x, y, z);
    scene.add(qb);
    qbs.push(qb);
  }
  const sign = label("PORT DOCKS · PIER Z", 0.62, "#ffffff", "#1f1d3a");
  sign.position.set(0, 2.6, -ZD - 3.4);
  sign.scale.set(9, 1.3, 1);
  scene.add(sign);
  B.box("#1f1d3a", 0.18, 2.0, 0.18, -3.9, 0.3, -ZD - 3.45, 0.02);
  B.box("#1f1d3a", 0.18, 2.0, 0.18, 3.9, 0.3, -ZD - 3.45, 0.02);
  B.box("#1f1d3a", 1.0, 0.9, 1.0, -3.9, -0.6, -ZD - 3.45, 0.02);
  B.box("#1f1d3a", 1.0, 0.9, 1.0, 3.9, -0.6, -ZD - 3.45, 0.02);
  B.build(scene, c.ink);
  containers(scene, boxes, c.ink);
  // the lamps' light on the pier, the berths' lights on the water
  pools(scene, [
    ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => ({ x: sx * (XW - 0.6), y: 0.03, z: sz * (ZD - 0.9), r: 3.2, c: sz < 0 ? "#ff7eb6" : "#7ff0ff", a: 0.35 }))),
    { x: 0, y: 0.03, z: 0, r: 4.2, c: "#ffd98a", a: 0.18 },
  ]);
  city(scene, { r: 170, n: 70, y: -2, rnd, pal: ["#3b3a6e", "#4a3f80", "#2e3a6a", "#5a4a8a", "#36507a"], win: ["#ffd98a", "#1d1a40"], lit: 0.5, tall: 1.2, glowK: 0.4 });

  // ---- the water: ripples drifting, a glow of the city in it
  const wtex = canvasTex(
    256,
    256,
    (g) => {
      g.fillStyle = "#123a5c";
      g.fillRect(0, 0, 256, 256);
      for (let k = 0; k < 70; k++) {
        const y = Math.random() * 256,
          x = Math.random() * 256,
          l = 20 + Math.random() * 50;
        g.strokeStyle = Math.random() < 0.25 ? "rgba(255,126,182,0.35)" : "rgba(160,230,255,0.28)";
        g.lineWidth = 2 + Math.random() * 2;
        g.beginPath();
        g.moveTo(x, y);
        g.quadraticCurveTo(x + l / 2, y - 4, x + l, y);
        g.stroke();
      }
    },
    true,
  );
  wtex.repeat.set(40, 40);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(320, 320).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: wtex, color: "#9fb4d8" }));
  water.position.y = -0.55;
  scene.add(water);
  // foam along the pier's walls
  const foamM = new THREE.MeshBasicMaterial({ color: "#d8f4ff", transparent: true, opacity: 0.5, depthWrite: false });
  for (const sz of [-1, 1]) {
    const f = new THREE.Mesh(GEO.plane, foamM);
    f.rotation.x = -Math.PI / 2;
    f.scale.set(FW + 8, 0.35, 1);
    f.position.set(0, -0.53, sz * (ZD + 0.22));
    scene.add(f);
  }

  // ---- the barges: a hull in each owner's colour under its crate, chevrons ahead of it on the water
  const hulls: THREE.Group[] = [];
  const chev = new THREE.ShapeGeometry(new THREE.Shape([new THREE.Vector2(-0.5, -0.45), new THREE.Vector2(0, -0.45), new THREE.Vector2(0.5, 0), new THREE.Vector2(0, 0.45), new THREE.Vector2(-0.5, 0.45), new THREE.Vector2(0, 0)])).rotateX(-Math.PI / 2);
  const chevs: THREE.Mesh[] = [];
  c.crates.forEach(([, cz], i) => {
    const col = c.players[i].color;
    const g = new THREE.Group();
    // (its deck just under the pier's, the crate leaning on the quay's edge; the rest of it out on the
    // water: the hull in the owner's colour, a lit band, bow and stern blocks, a wheelhouse, running lights)
    const out = Math.sign(cz);
    const zc = out * 0.65;
    const P = new Parts();
    P.add("box", tint(col, -0.15), 4.2, 0.8, 4.0, 0, -0.42, zc, { ink: 0.06 });
    P.add("box", tint(col, 0.45), 4.22, 0.1, 4.02, 0, -0.16, zc, { lit: true });
    P.add("box", "#3a3550", 3.9, 0.06, 3.7, 0, -0.02, zc);
    P.add("box", tint(col, 0.35), 0.5, 0.55, 3.6, 2.3, -0.34, zc, { ink: 0.03 });
    P.add("box", tint(col, 0.35), 0.5, 0.55, 3.6, -2.3, -0.34, zc, { ink: 0.03 });
    P.add("box", "#eef2f8", 1.5, 0.9, 0.7, -1.1, 0.45, out * 2.3, { ink: 0.03 });
    P.add("box", "#ffe9a8", 1.2, 0.22, 0.72, -1.1, 0.6, out * 2.3, { lit: true });
    P.add("ball", "#ff3d5a", 0.22, 0.22, 0.22, -2.1, 0.12, out * 2.45, { lit: true });
    P.add("ball", "#3dff8a", 0.22, 0.22, 0.22, 2.1, 0.12, out * 2.45, { lit: true });
    P.build(g, c.ink);
    g.position.z = cz;
    scene.add(g);
    hulls.push(g);
    for (let k = 0; k < 2; k++) {
      const m = new THREE.Mesh(chev, new THREE.MeshBasicMaterial({ color: tint(col, 0.5), transparent: true, opacity: 0.8, depthWrite: false }));
      m.position.set(0, -0.5, cz + (cz < 0 ? -0.6 : 0.6));
      m.renderOrder = 2;
      scene.add(m);
      chevs.push(m);
    }
  });

  // ---- life on the water: lanterns bobbing, glints, a tug going by behind
  const lan: { x: number; y: number; z: number; s: number; c: string }[] = [];
  for (let k = 0; k < 18; k++) {
    const side = k % 2 ? 1 : -1;
    lan.push({ x: -16 + rnd() * 32, y: -0.35, z: side * (ZD + 3.3 + rnd() * 6), s: 0.34 + rnd() * 0.12, c: ["#ffb070", "#ff7eb6", "#ffe14a", "#7ff0ff"][k % 4] });
  }
  const lanterns = new Bobs(scene, GEO.ball, new THREE.MeshBasicMaterial({ color: 0xffffff }), lan, { bob: 0.07, drift: 0.4, speed: 0.8 });
  const halos = new Bobs(scene, new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: softGlowTex(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), lan.map((l) => ({ ...l, y: -0.5, s: 2.2 })), { drift: 0.4, speed: 0.8, twinkle: 0.25 });
  const gl: { x: number; y: number; z: number; s: number }[] = [];
  for (let k = 0; k < 60; k++) gl.push({ x: -20 + rnd() * 40, y: -0.52, z: (k % 2 ? 1 : -1) * (ZD + 0.8 + rnd() * 10), s: 0.16 + rnd() * 0.14 });
  const glints = new Bobs(scene, new THREE.PlaneGeometry(1, 0.3).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: "#cfeeff", transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }), gl, { twinkle: 1, speed: 1.3 });
  const tug = new THREE.Group();
  {
    const tb = new Parts();
    tb.box("#d9483b", 4.6, 1.0, 1.9, 0, -0.9, 0, 0.05);
    tb.box("#eef2f8", 1.8, 1.0, 1.4, -0.4, 0.1, 0, 0.04);
    tb.lit("#ffe9a8", 1.5, 0.25, 1.42, -0.4, 0.55, 0);
    tb.box("#2b2d3c", 0.4, 0.9, 0.4, 0.7, 0.4, 0, 0.03);
    tb.add("ball", "#ffe14a", 0.3, 0.3, 0.3, -1.8, 0.4, 0, { lit: true });
    tb.build(tug, c.ink);
  }
  tug.position.set(-30, 0, -ZD - 9.5);
  scene.add(tug);
  const px = new Float32Array(4).fill(NaN);
  return {
    tick(dt: number, s: PoolState) {
      const t = s.t;
      wtex.offset.set((t * 0.004) % 1, (t * 0.011) % 1);
      foamM.opacity = 0.38 + Math.sin(t * 2.2) * 0.12;
      for (let k = 0; k < qbs.length; k++) ((qbs[k].rotation.y = t * (0.9 + k * 0.3)), (qbs[k].position.y = (k ? 6.4 : 7) + Math.sin(t * 1.4 + k * 2) * 0.3));
      wheel.rotation.z = t * 0.05;
      lanterns.tick(t);
      halos.tick(t);
      glints.tick(t);
      tug.position.x = ((t * 1.6 + 30) % 64) - 32;
      tug.position.y = Math.sin(t * 1.3) * 0.05;
      tug.rotation.z = Math.sin(t * 1.1) * 0.03;
      for (let i = 0; i < 4; i++) {
        const h = hulls[i];
        const vx = Number.isNaN(px[i]) || dt <= 0 ? 0 : (s.cx[i] - px[i]) / dt;
        px[i] = s.cx[i];
        h.position.x = s.cx[i];
        h.position.y = Math.sin(t * 1.6 + i) * 0.03;
        h.rotation.z = Math.sin(t * 1.3 + i * 2) * 0.02;
        // the chevrons ahead of the bow, the way it drifts (bigger the faster)
        const sp = Math.min(1, Math.abs(vx) / 1.2);
        for (let k = 0; k < 2; k++) {
          const m = chevs[i * 2 + k];
          const d = Math.sign(vx) || 1;
          m.visible = sp > 0.08;
          m.position.x = s.cx[i] + d * (2.9 + k * 0.85 + ((t * 1.4) % 0.85));
          m.rotation.y = d > 0 ? 0 : Math.PI;
          m.scale.setScalar(0.6 + sp * 0.5);
          (m.material as THREE.MeshBasicMaterial).opacity = 0.25 + sp * 0.6;
        }
      }
    },
  };
}
