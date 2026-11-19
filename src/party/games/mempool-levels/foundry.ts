/**
 * MEMPOOL RUSH · PROOF FACTORY: a steel deck over the melt. Two conveyor belts cross the plaza the
 * whole way, the back one one way, the front one the other: they carry the snarks (a highway one way,
 * a slog the other) and the parcels that land on them, into the furnace at their end (its door up, its
 * mouth roaring). Now and then the belts stop and run the other way: a klaxon, the chevrons flash
 * orange, the doors change ends. Round it: the melt far below, chimneys, steel tanks, sparks.
 */
import * as THREE from "three";
import { FONT, rr } from "../../kit";
import { GEO, canvasTex, qBlock, toon } from "../../k3";
import { tint } from "../../hud";
import { drawMark } from "../../theme";
import { Bobs, Fall, Parts, city, pools } from "../sign-levels/parts";
import type { PoolCtx, PoolLive, PoolState } from "./types";

/** The belts: their middles (z), their half width (m), their speed (m/s). */
export const BELT_Z = [-2.4, 2.4];
export const BELT_HW = 1.0;
export const BELT_V = 2.4;

export function foundrySet(c: PoolCtx): PoolLive {
  const { scene, rnd } = c;
  c.hemi.color.set("#ffe2c8");
  c.hemi.groundColor.set("#ff7a3a");
  c.hemi.intensity = 1.55;
  c.sun.color.set("#ffc79a");
  c.sun.intensity = 2.0;
  c.sun.position.set(30, 45, 20);
  const XW = c.xw,
    ZD = c.zd;
  const FW = XW * 2,
    FD = ZD * 2;
  const B = new Parts();

  // ---- the deck: steel plates and rivets, the crates' zones, the pads' marks, a little Q in the middle
  const PX = 40;
  const tex = canvasTex(FW * PX, FD * PX, (g) => {
    g.fillStyle = "#2c2a36";
    g.fillRect(0, 0, FW * PX, FD * PX);
    const pl = 2 * PX;
    for (let y = 0; y < FD * PX; y += pl)
      for (let x = 0; x < FW * PX; x += pl) {
        const gr = g.createLinearGradient(x, y, x + pl, y + pl);
        const a = (x / pl + y / pl) % 2 ? ["#5a5868", "#4a4858"] : ["#54525f", "#45434f"];
        gr.addColorStop(0, a[0]);
        gr.addColorStop(1, a[1]);
        g.fillStyle = gr;
        g.fillRect(x + 2, y + 2, pl - 4, pl - 4);
        g.fillStyle = "rgba(255,255,255,0.1)";
        g.fillRect(x + 3, y + 3, pl - 6, 2);
        // the tread: little raised bars, alternating
        g.fillStyle = "rgba(255,255,255,0.09)";
        for (let k = 0; k < 4; k++)
          for (let j = 0; j < 4; j++) {
            const ox = x + 8 + k * 18,
              oy = y + 8 + j * 18;
            if ((k + j) % 2) g.fillRect(ox, oy + 5, 12, 3);
            else g.fillRect(ox + 5, oy, 3, 12);
          }
        g.fillStyle = "rgba(0,0,0,0.45)";
        for (const [rx, ry] of [
          [6, 6],
          [pl - 8, 6],
          [6, pl - 8],
          [pl - 8, pl - 8],
        ])
          g.fillRect(x + rx, y + ry, 3, 3);
      }
    const X = (x: number) => (x + XW) * PX,
      Z = (z: number) => (z + ZD) * PX;
    // oil stains, scorch marks
    for (let k = 0; k < 26; k++) {
      const gr = g.createRadialGradient(0, 0, 1, 0, 0, 30);
      gr.addColorStop(0, "rgba(10,6,16,0.35)");
      gr.addColorStop(1, "rgba(10,6,16,0)");
      g.save();
      g.translate(Math.random() * FW * PX, Math.random() * FD * PX);
      g.scale(1 + Math.random() * 2, 0.6 + Math.random());
      g.fillStyle = gr;
      g.fillRect(-30, -30, 60, 60);
      g.restore();
    }
    // the hazard bands along the front and back edges
    for (const y of [10, FD * PX - 26]) {
      g.fillStyle = "#ffb02e";
      g.fillRect(14, y, FW * PX - 28, 16);
      g.fillStyle = "#1a1820";
      for (let x = 14; x < FW * PX - 28; x += 32) {
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + 14, y);
        g.lineTo(x + 30, y + 16);
        g.lineTo(x + 16, y + 16);
        g.fill();
      }
    }
    c.crates.forEach(([cx, cz], i) => {
      const col = c.players[i].color;
      const h = 2.0;
      g.save();
      rr(g, X(cx - h), Z(cz - h), h * 2 * PX, h * 2 * PX, 14);
      g.clip();
      g.fillStyle = tint(col, -0.55);
      g.fillRect(X(cx - h), Z(cz - h), h * 2 * PX, h * 2 * PX);
      g.strokeStyle = col;
      g.lineWidth = 12;
      for (let k = -12; k < 12; k++) {
        g.beginPath();
        g.moveTo(X(cx - h) + k * 22, Z(cz - h));
        g.lineTo(X(cx - h) + k * 22 + h * 2 * PX, Z(cz + h));
        g.stroke();
      }
      g.fillStyle = tint(col, -0.45);
      rr(g, X(cx - h + 0.3), Z(cz - h + 0.3), (h - 0.3) * 2 * PX, (h - 0.3) * 2 * PX, 10);
      g.fill();
      g.restore();
    });
    for (const [px, pz] of c.pads) {
      g.strokeStyle = "rgba(255,170,60,0.5)";
      g.lineWidth = 5;
      g.setLineDash([12, 9]);
      g.beginPath();
      g.arc(X(px), Z(pz), 1.4 * PX, 0, Math.PI * 2);
      g.stroke();
      g.setLineDash([]);
    }
    // the ⓩ in the middle (its block clock lights sit on the ring)
    g.strokeStyle = "rgba(255,255,255,0.14)";
    g.lineWidth = 0.42 * PX;
    g.beginPath();
    g.arc(X(0), Z(0), 1.05 * PX, 0, Math.PI * 2);
    g.stroke();
    drawMark(g, X(0), Z(0), 1.8 * PX, "rgba(0,0,0,0)", "rgba(255,255,255,0.14)");
    g.font = `900 ${0.62 * PX}px ${FONT}`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillStyle = "rgba(255,170,60,0.22)";
    g.fillText("PROOF FACTORY", X(-5.4), Z(0));
    g.fillText("FURNACE LINE 2", X(5.4), Z(0));
    g.strokeStyle = "#ffb02e";
    g.lineWidth = 6;
    g.strokeRect(6, 6, FW * PX - 12, FD * PX - 12);
  });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(FW, FD).rotateX(-Math.PI / 2), new THREE.MeshToonMaterial({ map: tex, gradientMap: toon("#fff").gradientMap, emissive: 0x2c2638 }));
  scene.add(floor);

  // ---- the belts: a rubber band with chevrons (it slides), hazard rails along both edges, rollers
  const ctex = canvasTex(
    128,
    64,
    (g) => {
      g.fillStyle = "#1f1d26";
      g.fillRect(0, 0, 128, 64);
      g.fillStyle = "#2b2834";
      g.fillRect(0, 0, 128, 6);
      g.fillRect(0, 58, 128, 6);
      g.fillStyle = "#ffffff";
      g.beginPath();
      g.moveTo(34, 10);
      g.lineTo(62, 10);
      g.lineTo(94, 32);
      g.lineTo(62, 54);
      g.lineTo(34, 54);
      g.lineTo(66, 32);
      g.closePath();
      g.fill();
    },
    true,
  );
  const BL = FW + 0.6;
  ctex.repeat.set(BL / 1.6, 1);
  const beltMats: THREE.MeshBasicMaterial[] = [];
  const beltMeshes: THREE.Mesh[] = [];
  for (const bz of BELT_Z) {
    const mat = new THREE.MeshBasicMaterial({ map: ctex, color: "#8a8296" });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(BL, BELT_HW * 2).rotateX(-Math.PI / 2), mat);
    m.position.set(0, 0.02, bz);
    m.renderOrder = 1;
    scene.add(m);
    beltMats.push(mat);
    beltMeshes.push(m);
    for (const sz of [-1, 1]) {
      B.box("#2b2834", BL, 0.09, 0.16, 0, 0, bz + sz * (BELT_HW + 0.06), 0.02);
      for (let x = -XW; x < XW; x += 0.7) B.lit(Math.round((x + XW) / 0.7) % 2 ? "#ffb02e" : "#1a1820", 0.35, 0.02, 0.17, x + 0.175, 0.09, bz + sz * (BELT_HW + 0.06));
    }
    for (const sx of [-1, 1]) B.add("cyl", "#6a6478", 0.5, BELT_HW * 2 + 0.1, 0.5, sx * (XW + 0.25), -0.18, bz, { rx: Math.PI / 2, ink: 0.03 });
  }

  // ---- the furnaces at the belts' ends: brick, a mouth that roars when its door is up, a chimney
  interface Furnace {
    x: number;
    z: number;
    side: number;
    door: THREE.Mesh;
    mouth: THREE.MeshBasicMaterial;
    open: number;
  }
  const furnaces: Furnace[] = [];
  for (const bz of BELT_Z)
    for (const sx of [-1, 1]) {
      const x = sx * (XW + 1.55);
      B.box("#7a3a2e", 2.0, 2.8, 2.9, x, -0.2, bz, 0.05);
      B.box("#5e2c24", 2.3, 0.4, 3.2, x, 2.6, bz, 0.05);
      B.add("cyl", "#4a4458", 0.42, 3.2, 0.42, x + sx * 0.3, 4.6, bz - 0.6, { ink: 0.04 });
      B.lit("#ff6b35", 0.86, 0.12, 0.86, x + sx * 0.3, 6.2, bz - 0.6);
      // the brick courses
      for (let k = 0; k < 4; k++) B.lit("#a85a42", 2.02, 0.04, 2.92, x, 0.2 + k * 0.62, bz);
      const mouth = new THREE.MeshBasicMaterial({ color: "#ff8a2a" });
      const mm = new THREE.Mesh(GEO.plane, mouth);
      mm.scale.set(2.0, 1.25, 1);
      mm.position.set(sx * (XW + 0.54), 0.62, bz);
      mm.rotation.y = -sx * (Math.PI / 2);
      scene.add(mm);
      const door = new THREE.Mesh(GEO.box, toon("#5a5468"));
      door.scale.set(0.16, 1.4, 2.2);
      door.position.set(sx * (XW + 0.46), 0.7, bz);
      scene.add(door);
      furnaces.push({ x, z: bz, side: sx, door, mouth, open: 0 });
    }

  // ---- the rails round the deck (gaps where the belts run out), lamps, the sign
  const railX = (x: number) => {
    const segs: [number, number][] = [
      [-ZD, BELT_Z[0] - BELT_HW - 0.15],
      [BELT_Z[0] + BELT_HW + 0.15, BELT_Z[1] - BELT_HW - 0.15],
      [BELT_Z[1] + BELT_HW + 0.15, ZD],
    ];
    for (const [z0, z1] of segs) {
      B.box("#4a4458", 0.24, 0.5, z1 - z0, x, 0, (z0 + z1) / 2, 0.04);
      B.lit("#ffb02e", 0.26, 0.07, z1 - z0, x, 0.5, (z0 + z1) / 2);
    }
  };
  railX(-XW - 0.15);
  railX(XW + 0.15);
  for (const sz of [-1, 1]) {
    B.box("#4a4458", FW + 0.6, 0.5, 0.24, 0, 0, sz * (ZD + 0.15), 0.04);
    B.lit("#ffb02e", FW + 0.62, 0.07, 0.26, 0, 0.5, sz * (ZD + 0.15));
    for (let x = -XW; x <= XW + 0.1; x += FW / 6) {
      B.box("#2b2834", 0.3, 0.3, 0.3, x, 0.5, sz * (ZD + 0.15), 0.03);
      if (sz < 0) {
        B.add("cyl", "#2b2834", 0.14, 2.4, 0.14, x, 1.9, -ZD - 0.15, { ink: 0.025 });
        B.add("ball", "#ffb070", 0.42, 0.42, 0.42, x, 3.25, -ZD - 0.15, { lit: true });
        B.add("cone", "#2b2834", 0.6, 0.28, 0.6, x, 3.58, -ZD - 0.15, { ry: Math.PI / 4, ink: 0.02 });
      }
    }
  }
  // ---- under the deck: girders and chains down into the glow; the melt far below
  B.box("#2e2b38", FW + 1.0, 0.8, FD + 1.0, 0, -0.8, 0, 0.05);
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      B.box("#3a3646", 0.7, 14, 0.7, sx * (XW - 1), -14.8, sz * (ZD - 1), 0.04);
      B.add("box", "#3a3646", 0.35, 9, 0.35, sx * (XW - 1) * 0.5, -5, sz * (ZD - 1), { rz: sx * 0.7, ink: 0.03 });
    }
  for (let k = 0; k < 28; k++) {
    const u = (k + 0.5) / 28;
    B.lit(k % 2 ? "#ff6b35" : "#ffb02e", 0.5, 0.16, 0.05, -FW / 2 + u * FW, -0.55, FD / 2 + 0.52);
  }
  const lava = canvasTex(
    256,
    256,
    (g) => {
      g.fillStyle = "#ff6a1a";
      g.fillRect(0, 0, 256, 256);
      for (let k = 0; k < 40; k++) {
        g.fillStyle = k % 3 ? "rgba(90,20,10,0.55)" : "rgba(255,220,90,0.6)";
        g.beginPath();
        g.ellipse(Math.random() * 256, Math.random() * 256, 10 + Math.random() * 30, 6 + Math.random() * 18, Math.random() * 3, 0, Math.PI * 2);
        g.fill();
      }
    },
    true,
  );
  lava.repeat.set(10, 10);
  const melt = new THREE.Mesh(new THREE.PlaneGeometry(300, 300).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: lava, color: "#ffb08a", fog: true }));
  melt.position.y = -30;
  scene.add(melt);
  // chimneys and tanks standing in the melt round the deck
  for (let k = 0; k < 9; k++) {
    const a = -Math.PI * 0.95 + (k / 8) * Math.PI * 0.9 + (rnd() - 0.5) * 0.1;
    const d = 40 + rnd() * 20;
    const x = Math.cos(a) * d,
      z = Math.sin(a) * d * 0.8 - 6;
    if (k % 3 === 1) {
      B.add("cyl", "#6a6478", 7, 16, 7, x, -22, z, { ink: 0.08 });
      B.lit("#ffb02e", 7.1, 0.4, 7.1, x, -18, z);
    } else {
      const h = 32 + rnd() * 14;
      B.add("cyl", "#5a3a34", 2.6, h, 2.6, x, -30 + h / 2, z, { ink: 0.07 });
      for (let j = 0; j < 3; j++) B.add("cyl", j % 2 ? "#ffffff" : "#d84a3a", 2.7, 1.2, 2.7, x, -30 + h - 1.5 - j * 1.4, z, {});
    }
  }
  const qbs: THREE.Object3D[] = [];
  for (const [x, y, z] of [
    [-13.5, 6.6, -5],
    [13.5, 7.2, -4],
  ]) {
    const qb = qBlock(1.3);
    qb.position.set(x, y, z);
    scene.add(qb);
    qbs.push(qb);
  }
  B.build(scene, c.ink);
  city(scene, { r: 160, n: 60, y: -30, rnd, pal: ["#4a3a44", "#3a3040", "#5a4048", "#463a50"], win: ["#ffb070", "#1d1418"], lit: 0.35, tall: 1.5, glowK: 0.3 });

  // ---- the heat: embers rising off the melt past the deck, bubbles in the melt, its glow on the deck's rims
  const emb = new Fall(scene, 70, new THREE.MeshBasicMaterial({ color: "#ffb04a", transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }), { x: 0, z: -2, w: 46, d: 34, y0: -28, y1: 9, v: -3.2, size: [0.14, 0.14, 0.14], drift: 0.8 });
  const bub: { x: number; y: number; z: number; s: number; c: string }[] = [];
  for (let k = 0; k < 30; k++) {
    const a = rnd() * Math.PI * 2,
      r = 16 + rnd() * 40;
    bub.push({ x: Math.cos(a) * r, y: -29.8, z: Math.sin(a) * r * 0.8, s: 1.2 + rnd() * 2.2, c: k % 3 ? "#ffd27a" : "#ff6b35" });
  }
  const bubbles = new Bobs(scene, GEO.ball, new THREE.MeshBasicMaterial({ color: 0xffffff }), bub, { twinkle: 1, speed: 0.6 });
  pools(scene, [
    ...BELT_Z.flatMap((bz) => [-1, 1].map((sx) => ({ x: sx * (XW - 0.4), y: 0.03, z: bz, r: 2.2, c: "#ff8a2a", a: 0.35 }))),
    ...[-1, 1].flatMap((sz) => [-6, 0, 6].map((x) => ({ x, y: 0.03, z: sz * (ZD - 0.6), r: 2.0, c: "#ffb070", a: 0.18 }))),
  ]);

  // ---- smoke from the chimneys of the open furnaces (cosmetic)
  const NS = 36;
  const smoke = new THREE.InstancedMesh(GEO.box, new THREE.MeshBasicMaterial({ color: "#5a5060", transparent: true, opacity: 0.55, depthWrite: false }), NS);
  smoke.frustumCulled = false;
  scene.add(smoke);
  const sd = new Float32Array(NS * 4);
  const m4 = new THREE.Matrix4(),
    q = new THREE.Quaternion(),
    pv = new THREE.Vector3(),
    sv = new THREE.Vector3();
  const flare = new THREE.Color("#ff6b35"),
    belt0 = new THREE.Color("#8a8296"),
    hot = new THREE.Color("#ffd27a"),
    cold = new THREE.Color("#4a2a22");
  let off = 0;
  return {
    tick(dt: number, s: PoolState) {
      const t = s.t;
      // the belts slide (the back one at +belt, the front one at −belt; each mesh turned to its way,
      // the chevrons crawl forward), flashing before they turn
      off = (off + (Math.abs(s.belt) * dt) / 1.6) % 1;
      ctex.offset.x = -off;
      const warn = s.warn > 0 && Math.floor(t * 8) % 2 === 0;
      for (let k = 0; k < 2; k++) {
        const v = k === 0 ? s.belt : -s.belt;
        beltMeshes[k].rotation.y = v >= 0 ? 0 : Math.PI;
        beltMats[k].color.copy(warn ? flare : belt0);
      }
      // the furnaces: the door up where the belt runs in
      let si = 0;
      for (const f of furnaces) {
        const v = f.z < 0 ? s.belt : -s.belt;
        const goal = Math.sign(v) === f.side ? 1 : 0;
        f.open += (goal - f.open) * Math.min(1, dt * 4);
        f.door.position.y = 0.7 + f.open * 1.45;
        f.mouth.color.copy(cold).lerp(hot, f.open * (0.8 + 0.2 * Math.sin(t * 13 + f.x)));
        // its smoke
        for (let j = 0; j < NS / 4; j++, si++) {
          let life = sd[si * 4 + 3];
          life -= dt * (0.5 + f.open * 0.4);
          if (life <= 0) {
            life = 1;
            sd[si * 4] = f.x + f.side * 0.3 + (Math.random() - 0.5) * 0.4;
            sd[si * 4 + 1] = 6.3;
            sd[si * 4 + 2] = f.z - 0.6 + (Math.random() - 0.5) * 0.4;
          }
          sd[si * 4 + 3] = life;
          sd[si * 4 + 1] += dt * (1.2 + f.open);
          sd[si * 4] += dt * 0.5;
          const sc = (0.3 + (1 - life) * 1.1) * (0.4 + f.open * 0.6);
          m4.compose(pv.set(sd[si * 4], sd[si * 4 + 1], sd[si * 4 + 2]), q, sv.set(sc, sc, sc));
          smoke.setMatrixAt(si, m4);
        }
      }
      smoke.instanceMatrix.needsUpdate = true;
      lava.offset.set((t * 0.006) % 1, (t * 0.004) % 1);
      emb.tick(dt, t, 0.4);
      bubbles.tick(t);
      for (let k = 0; k < qbs.length; k++) ((qbs[k].rotation.y = t * (0.9 + k * 0.3)), (qbs[k].position.y = (k ? 7.2 : 6.6) + Math.sin(t * 1.4 + k * 2) * 0.3));
    },
  };
}

