/**
 * GENESIS HARBOR's own look (art only): its landmarks, built on the shared kit (decor.ts, props.ts,
 * life.ts). The MEMPOOL plaza and its market, the PROOF FACTORY's molten works, the ZEC NEEDLE,
 * the ZEC STATE PENITENTIARY (THE TRACKER's lair), the harbour's blimps and crates, the GENESIS BLOCK #1
 * monument in GENESIS PARK, the Needle district's neon street; and a few touches of its own
 * (the harbour's big fall into the chasm, flags on the basin's rim).
 *
 * A board's art module exports a MapArt as its default (art/index.ts finds it by its key).
 */
import * as THREE from "three";
import { label } from "../../k3";
import type { LandmarkDef } from "../maps";
import { FLOWERS, WOOD_D, bench, lamp, pick, pond, tree, type Kit, type MapArt } from "../decor";
import { P3, ROCKS, STONE, Vox, W3, WOOD, crateAt, halo, sign } from "../props";

function landmark(d: LandmarkDef, k: Kit): boolean {
  const { v, mv, ground, rnd, ink, paint, pools, life, words } = k;
  const parent = k.parent;
  const { x, z } = d;
  const r = d.rot ?? 0;
  switch (d.kind) {
    case "mempool": {
      // the plaza: round paving, a ring of market stalls and parcels (transparent orange, shielded lilac)
      const stalls: [number, number, string, string][] = [
        [-5.8, -2.5, "#ff6b35", "orange"],
        [-6.2, 2.8, "#c4b1fc", "fruit"],
        [-2.8, -6.2, "#3ec6ff", "parcels"],
        [3.4, -6.4, "#ff5fa2", "sweets"],
        [-7.6, -0.1, "#33d67c", "fruit"],
        [0.3, -7.2, "#ffd23f", "parcels"],
      ];
      for (const [sx, sz, c, goods] of stalls) {
        if (!ground.free(x + sx, z + sz, 0.4, 0.6) && Math.hypot(sx, sz) > 7.4) continue;
        const yaw = Math.atan2(-sx, -sz);
        v.frame(x + sx, 0, z + sz, yaw);
        v.box("#f6efe2", 2.4, 1.0, 1.4, 0, 0.5, 0, { ink: 0.04 });
        v.box(c, 2.44, 0.18, 1.44, 0, 0.92, 0);
        v.box(WOOD, 0.12, 2.3, 0.12, -1.1, 1.15, -0.6);
        v.box(WOOD, 0.12, 2.3, 0.12, 1.1, 1.15, -0.6);
        v.box(WOOD, 0.12, 2.0, 0.12, -1.1, 1.0, 0.6);
        v.box(WOOD, 0.12, 2.0, 0.12, 1.1, 1.0, 0.6);
        // striped awning, a scalloped edge
        for (let i = 0; i < 4; i++) v.box(i % 2 ? "#ffffff" : c, 0.62, 0.12, 1.9, -0.93 + i * 0.62, 2.25, 0.15, { rx: 0.25, ink: 0.015 });
        for (let i = 0; i < 8; i++) v.add("orb", i % 2 ? "#ffffff" : c, 0.3, 0.22, 0.12, -1.05 + i * 0.3, 1.98, 1.12);
        if (goods === "fruit") for (let i = 0; i < 9; i++) v.add("orb", ["#ff3d56", "#ffd23f", "#7ad35a", "#ff8a2e"][i % 4], 0.22, 0.22, 0.22, -0.8 + (i % 5) * 0.4, 1.12 + Math.floor(i / 5) * 0.12, 0.2 + Math.floor(i / 5) * 0.2);
        else if (goods === "sweets") for (let i = 0; i < 5; i++) (v.cyl("#ffffff", 0.025, 0.5, -0.8 + i * 0.4, 1.25, 0.3, {}, "cyl8"), v.add("orb", ["#ff5fa2", "#3ec6ff", "#ffd23f"][i % 3], 0.24, 0.24, 0.08, -0.8 + i * 0.4, 1.55, 0.3));
        else {
          v.box(c, 0.5, 0.4, 0.4, -0.5, 1.2, 0.2, { ink: 0.02 });
          v.box("#ffd23f", 0.4, 0.3, 0.4, 0.3, 1.15, 0.2, { ink: 0.02 });
          v.box("#ffffff", 0.3, 0.3, 0.3, 0.75, 1.15, 0.25, { ink: 0.02 });
        }
        v.add("orb", "#fff3c4", 0.14, 0.14, 0.14, 0, 1.95, 0.55, { glow: true });
        pools.add(x + sx - Math.sin(yaw) * 0.9, z + sz - Math.cos(yaw) * 0.9, 1.6, "#ffcf7a", 0.1, 0.45);
        paint.shadow(x + sx, z + sz, 1.5, 1.1, 0.3);
      }
      // parcel stacks
      const parcels: [number, number][] = [
        [5.2, 4.6],
        [5.4, -1.8],
        [-6.4, 4.2],
      ];
      for (const [px, pz] of parcels) {
        v.frame(x + px, 0, z + pz, rnd() * 3);
        for (let i = 0; i < 5; i++) {
          const c = i % 2 ? "#ff6b35" : "#c4b1fc";
          const yy = i < 3 ? 0.4 : i < 4 ? 1.2 : 2.0;
          const xx = i < 3 ? (i - 1) * 0.85 : i === 3 ? -0.4 : 0.1;
          v.box(c, 0.8, 0.8, 0.8, xx, yy, 0, { ink: 0.035 });
          v.box("#ffffff", 0.82, 0.14, 0.2, xx, yy + 0.1, 0);
        }
        paint.shadow(x + px, z + pz, 1.4, 0.9, 0.3);
      }
      // the arch over the way out (north-east, off the cameras' side), with MEMPOOL on it
      const ax = x + 10.6,
        az = z - 5.2,
        ay = 2.36;
      v.frame(ax, 0, az, ay);
      v.box("#2a1f55", 0.5, 4.2, 0.5, -2.3, 2.1, 0, { ink: 0.05 });
      v.box("#2a1f55", 0.5, 4.2, 0.5, 2.3, 2.1, 0, { ink: 0.05 });
      v.box("#ff6b35", 5.4, 0.9, 0.5, 0, 4.4, 0, { ink: 0.05 });
      v.box("#ffd23f", 5.5, 0.12, 0.55, 0, 3.92, 0);
      for (const s of [-2.3, 2.3]) v.add("orb", "#ffd23f", 0.5, 0.5, 0.5, s, 4.45, 0, { ink: 0.02 });
      words.add(d.label ?? "MEMPOOL", 0.7, ax - Math.sin(ay) * 0.27, 4.42, az - Math.cos(ay) * 0.27, ay + Math.PI, { w: 4.6 });
      words.add(d.label ?? "MEMPOOL", 0.7, ax + Math.sin(ay) * 0.27, 4.42, az + Math.cos(ay) * 0.27, ay, { w: 4.6 });
      life.bunting(P3(ax, az, ay, -2.3, 0.3, 3.6), P3(ax, az, ay, 2.3, 0.3, 3.6), 8, 0.35);
      // string lights round the plaza, lanterns on the poles, banners
      const rr = 7.4;
      const poles: [number, number][] = [];
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        v.frame(x, 0, z, 0);
        if (i % 6 === 0) {
          v.box("#3a2f5a", 0.16, 3.4, 0.16, Math.sin(a) * rr, 1.7, Math.cos(a) * rr);
          v.add("orb", "#ffd23f", 0.26, 0.26, 0.26, Math.sin(a) * rr, 3.5, Math.cos(a) * rr);
          poles.push([x + Math.sin(a) * rr, z + Math.cos(a) * rr]);
        }
        v.add("orb", ["#ff6b35", "#c4b1fc", "#3ec6ff", "#ffd23f"][i % 4], 0.26, 0.26, 0.26, Math.sin(a) * rr, 3.0 - Math.abs(Math.sin((i % 6) * 0.52)) * 0.4, Math.cos(a) * rr, { glow: true });
      }
      for (let i = 0; i < poles.length; i++) {
        const [px, pz] = poles[i];
        if (i % 2 === 0) life.flag(px, 2.9, pz, Math.atan2(px - x, pz - z), ["#ff6b35", "#7b5cff", "#3ec6ff", "#ff5fa2"][i % 4], 0.8);
        pools.add(px, pz, 2.4, "#ffc46a", 0.08, 0.5);
      }
      // strands across the north half (behind the hash wheel), paper lanterns on them
      life.bunting([poles[2][0], 3.3, poles[2][1]], [poles[1][0], 3.3, poles[1][1]], 14, 0.7);
      life.bunting([poles[2][0], 3.3, poles[2][1]], [poles[3][0], 3.3, poles[3][1]], 14, 0.7);
      break;
    }
    case "foundry": {
      v.frame(x, 0, z, r);
      // the hall, lit windows along it, pipes
      v.box("#4b3f74", 9, 5, 7, 0, 2.5, 0, { ink: 0.06 });
      v.box("#3a2f5c", 9.3, 0.4, 7.3, 0, 5.1, 0);
      for (let i = 0; i < 5; i++)
        for (const s of [-1, 1]) {
          v.box("#ffb347", 0.9, 1.1, 0.06, -3.4 + i * 1.7, 3.4, s * 3.52, { glow: true });
          v.box("#2a1f45", 0.12, 1.1, 0.08, -3.4 + i * 1.7, 3.4, s * 3.53);
        }
      for (let i = 0; i < 3; i++) v.cyl("#8c87a6", 0.2, 9.2, 0, 1.2 + i * 0.55, -3.75, { rz: Math.PI / 2, ink: 0.02 }, "cyl8");
      // a sawtooth roof
      for (let i = 0; i < 3; i++) {
        v.box("#5d4f8c", 2.9, 0.25, 7, -3 + i * 3, 5.9, 0, { rz: 0.5, ink: 0.04 });
        v.box("#ffcf7a", 0.16, 1.3, 6.6, -1.75 + i * 3, 5.8, 0, { glow: true });
      }
      // the furnace mouth, glowing, and the hash gear over it
      v.box("#2a1f45", 3.4, 3, 0.5, 0, 1.5, 3.55, { ink: 0.04 });
      v.box("#ff7a2f", 2.8, 2.4, 0.2, 0, 1.3, 3.7, { glow: true });
      v.box("#ffd23f", 2.0, 1.2, 0.22, 0, 0.9, 3.72, { glow: true });
      // the molten channel out of it, ingot moulds along it
      v.box("#2a2038", 1.2, 0.2, 5.6, 0, 0.1, 6.6, { ink: 0.03 });
      v.box("#ff8a2e", 0.8, 0.06, 5.4, 0, 0.22, 6.6, { glow: true });
      v.box("#ffd23f", 0.36, 0.07, 5.4, 0, 0.24, 6.6, { glow: true });
      for (let i = 0; i < 4; i++) {
        v.box("#3a2f5c", 0.9, 0.3, 0.7, 1.1, 0.15, 4.6 + i * 1.3, { ink: 0.03 });
        v.box(i % 2 ? "#ff9a3c" : "#ffcf2e", 0.6, 0.06, 0.45, 1.1, 0.31, 4.6 + i * 1.3, { glow: i < 2 });
      }
      {
        const [wx, wz] = W3(x, z, r, 0, 5.5);
        pools.add(wx, wz, 4.2, "#ff7a2f", 0.07, 0.95);
        life.sparkAt(...P3(x, z, r, 0, 3.9, 0.6), 1.4);
        life.sparkAt(...P3(x, z, r, 0, 8.6, 0.35), 0.7);
      }
      // a ladle on a gantry pouring into the channel's end
      v.frame(x, 0, z, r);
      for (const s of [-1.5, 1.5]) v.box("#ffb02e", 0.25, 4.2, 0.25, s, 2.1, 9.5, { ink: 0.025 });
      v.box("#ffb02e", 3.3, 0.3, 0.3, 0, 4.2, 9.5, { ink: 0.025 });
      v.cyl("#4b3f74", 0.75, 0.9, 0, 3.1, 9.5, { rz: 0.6, ink: 0.04 });
      v.cyl("#ffd23f", 0.6, 0.05, 0.12, 3.5, 9.5, { rz: 0.6, glow: true });
      v.box("#ff9a2e", 0.16, 2.7, 0.16, 0.55, 1.6, 9.5, { glow: true });
      // the chimneys (striped, flare-lit tops, smoke) and a blast furnace
      for (const [cx, cz, h] of [
        [-3.2, -2, 7],
        [-1.2, -2.4, 7],
        [1.2, -2.2, 8.5],
        [3.3, -1.8, 6],
      ]) {
        v.cyl("#6a5a92", 0.7, h, cx, 1 + h / 2 + 0.5, cz, { ink: 0.05 });
        for (let i = 0; i < 3; i++) v.cyl(i % 2 ? "#ffffff" : "#ff3d56", 0.74, 0.5, cx, 2.5 + h - i * 1.2, cz);
        v.cyl("#ff6b35", 0.78, 0.5, cx, 1.6 + h + 0.4, cz, { glow: true });
        const w = new THREE.Vector3(cx, 2.4 + h + 0.6, cz).applyAxisAngle(new THREE.Vector3(0, 1, 0), r).add(new THREE.Vector3(x, 0, z));
        mv.smoke.push(w);
      }
      v.cyl("#5a4e8a", 1.05, 7, -5.5, 3.5, -1.6, { ink: 0.05 }, "hex");
      for (let i = 0; i < 4; i++) v.cyl("#ff8a2e", 1.09, 0.16, -5.5, 1.3 + i * 1.6, -1.6, { glow: true }, "hex");
      v.cone("#3a2f5c", 1.15, 1.2, -5.5, 7.6, -1.6, { ink: 0.04 });
      v.cyl("#8c87a6", 0.25, 3.0, -4.4, 6.6, -1.6, { rz: Math.PI / 2, ink: 0.02 }, "cyl8");
      // stacks of mined blocks and a conveyor out, blocks riding it (life)
      for (let i = 0; i < 6; i++) v.box(i % 2 ? "#ffcf2e" : "#ff9a3c", 0.9, 0.9, 0.9, 3 + (i % 3) * 0.95, 0.45 + Math.floor(i / 3) * 0.9, 4.6, { ink: 0.03 });
      v.box("#2a2440", 6.0, 0.3, 1.2, 4.4, 0.9, -5.0, { ink: 0.03 });
      v.box("#4a4466", 6.0, 0.06, 1.0, 4.4, 1.07, -5.0);
      for (let i = 0; i < 4; i++) v.box("#3a2f5c", 0.2, 0.9, 1.0, 1.8 + i * 1.7, 0.45, -5.0);
      v.box("#ffb02e", 1.4, 1.6, 1.4, 7.8, 1.1, -5.0, { ink: 0.04 });
      {
        const [a0, a1] = W3(x, z, r, 1.6, -5.0);
        const [b0, b1] = W3(x, z, r, 7.1, -5.0);
        life.belt(a0, 1.38, a1, b0, 1.38, b1, 6);
      }
      // ore heaps, a rail cart
      for (let i = 0; i < 9; i++) v.add("orb", i % 3 ? "#5f4c7e" : "#ffcf2e", 0.6 + rnd() * 0.3, 0.45, 0.55, -6 + (i % 3) * 0.7, 0.2 + Math.floor(i / 3) * 0.28, 5.2 + (rnd() - 0.5) * 0.6, { ink: 0.02 });
      v.box("#8c87a6", 1.5, 0.8, 1.0, -3.2, 0.6, 6.4, { ink: 0.035 });
      v.box("#ffcf2e", 1.3, 0.3, 0.8, -3.2, 1.05, 6.4);
      for (const s of [-0.5, 0.5]) for (const q of [-0.4, 0.4]) v.cyl("#2a2440", 0.18, 0.12, -3.2 + s, 0.18, 6.4 + q, { rx: Math.PI / 2 }, "cyl8");
      const gear = new THREE.Group();
      const gv = new Vox(ink);
      gv.cyl("#ffcf2e", 1.7, 0.4, 0, 0, 0, { rx: Math.PI / 2, ink: 0.05 }, "hex");
      gv.cyl("#2a1f45", 0.6, 0.5, 0, 0, 0, { rx: Math.PI / 2 }, "cyl8");
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        gv.box("#ffb02e", 0.55, 0.6, 0.36, Math.cos(a) * 1.85, Math.sin(a) * 1.85, 0, { rz: a, ink: 0.03 });
      }
      gv.build(gear);
      gear.position.set(0, 4.0, 3.9).applyAxisAngle(new THREE.Vector3(0, 1, 0), r).add(new THREE.Vector3(x, 0, z));
      gear.rotation.y = r;
      parent.add(gear);
      mv.gears.push(gear);
      paint.shadow(x, z, 5.4, 5.4, 0.4);
      life.flag(...P3(x, z, r, -4.4, 3.4, 6.4), r + Math.PI / 2, "#ff6b35", 1);
      v.frame(...P3(x, z, r, -4.4, 3.4, 0), 0);
      v.cyl("#e8e4ff", 0.06, 2.0, 0, 6.0, 0, {}, "cyl8");
      sign(k, d.label ?? "PROOF FACTORY", x + Math.sin(r) * 5.6 + Math.cos(r) * 3.6, 3.4, z + Math.cos(r) * 5.6 - Math.sin(r) * 3.6, r, 5.5, "#ff6b35");
      break;
    }
    case "needle": {
      v.frame(x, 0, z, 0);
      // the plinth (stepped) and three legs
      v.cyl("#d9ccf2", 4.6, 0.3, 0, 0.15, 0, { ink: 0.05 }, "hex");
      v.cyl(STONE, 3.6, 0.6, 0, 0.5, 0, { ink: 0.05 }, "hex");
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        v.box("#f2f0ff", 0.55, 13, 0.55, Math.sin(a) * 1.4, 6.5, Math.cos(a) * 1.4, { rx: Math.cos(a) * -0.1, rz: Math.sin(a) * 0.1, ink: 0.05 });
        v.box("#3ef0ff", 0.12, 11, 0.12, Math.sin(a) * 1.62, 6.5, Math.cos(a) * 1.62, { rx: Math.cos(a) * -0.1, rz: Math.sin(a) * 0.1, glow: true });
      }
      v.cyl("#e8e4ff", 0.95, 22, 0, 11.5, 0, { ink: 0.05 });
      for (let i = 0; i < 6; i++) v.cyl(i % 2 ? "#ff4fd8" : "#3ef0ff", 0.98, 0.12, 0, 3 + i * 2.8, 0, { glow: true });
      v.cyl("#c4b1fc", 1.3, 0.6, 0, 9, 0, { ink: 0.04 });
      v.cyl("#c4b1fc", 1.15, 0.5, 0, 15, 0, { ink: 0.04 });
      // the deck: a saucer with a ring of lit windows
      v.cyl("#f6f3ff", 5.0, 0.7, 0, 21.6, 0, { ink: 0.07 });
      v.cyl("#ffb27a", 4.8, 1.1, 0, 22.4, 0, { glow: true });
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        v.box("#3a2f5c", 0.22, 1.12, 0.22, Math.sin(a) * 4.82, 22.4, Math.cos(a) * 4.82, { ry: a });
      }
      v.cyl("#ff6b35", 5.3, 0.4, 0, 23.1, 0, { ink: 0.06 });
      v.cyl("#ff4fd8", 5.36, 0.1, 0, 21.2, 0, { glow: true });
      v.cone("#f6f3ff", 4.2, 1.8, 0, 24.2, 0, { ink: 0.06 });
      v.cyl("#e8e4ff", 0.22, 7, 0, 28.5, 0);
      v.ball("#ff3d56", 0.4, 0.4, 0.4, 0, 32.2, 0, { glow: true });
      const tip = halo("#ff5a6a", 4, 0.9);
      tip.position.set(x, 32.2, z);
      parent.add(tip);
      mv.blink.push(tip);
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 + 0.5;
        life.flag(x + Math.sin(a) * 5.2, 24.4, z + Math.cos(a) * 5.2, a + Math.PI / 2, ["#ff6b35", "#7b5cff", "#3ef0ff"][i], 1.1);
        v.frame(x + Math.sin(a) * 5.2, 0, z + Math.cos(a) * 5.2, 0);
        v.cyl("#e8e4ff", 0.05, 1.6, 0, 24.1, 0, {}, "cyl8");
      }
      pools.add(x, z, 7.5, "#9a6bff", 0.06, 0.55);
      pools.add(x, z, 3.6, "#3ef0ff", 0.07, 0.5);
      paint.shadow(x, z, 4.4, 4.4, 0.35);
      sign(k, d.label ?? "ZEC NEEDLE", x + 3.4, 1.9, z + 3.6, 0.6, 5.2);
      break;
    }
    case "prison": {
      v.frame(x, 0, z, 0);
      // the rock it sits on
      v.box("#6e5a8c", 12, 1.6, 9, 0, 0.6, 0, { ink: 0.05 });
      v.box("#7d6698", 10.5, 0.8, 7.6, 0.2, 1.7, -0.2);
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2;
        v.add("orb", ROCKS[i % ROCKS.length], 1.6 + rnd(), 1.0 + rnd() * 0.8, 1.4, Math.sin(a) * 6.2, 0.3, Math.cos(a) * 4.8, { ink: 0.035 });
      }
      const wy = 2.1;
      // the walls, striped, spiked
      for (const [w, d2, px, pz] of [
        [9.4, 0.7, 0, 3.2],
        [9.4, 0.7, 0, -3.4],
        [0.7, 6.6, -4.4, -0.1],
        [0.7, 6.6, 4.4, -0.1],
      ] as [number, number, number, number][]) {
        v.box("#8c87a6", w, 3, d2, px, wy + 1.5, pz, { ink: 0.05 });
        v.box("#ff6b35", w + 0.04, 0.3, d2 + 0.04, px, wy + 2.4, pz);
        const n = Math.round(Math.max(w, d2) / 0.6);
        for (let i = 0; i < n; i++) {
          const f = (i + 0.5) / n - 0.5;
          v.add("cone6", "#2a2440", 0.18, 0.5, 0.18, px + (w > d2 ? f * w : 0), wy + 3.25, pz + (w > d2 ? 0 : f * d2));
        }
      }
      // the gate in the south wall, its bars, THE TRACKER's eye over it
      v.box("#2a1f45", 2.0, 2.4, 0.2, 0, wy + 1.2, 3.58);
      for (let i = 0; i < 5; i++) v.box("#c9c2d8", 0.1, 2.3, 0.1, -0.8 + i * 0.4, wy + 1.2, 3.7);
      v.add("orb", "#ffffff", 2.4, 1.3, 0.3, 0, wy + 6.6, 1.5, { ink: 0.05 });
      v.add("orb", "#ff2d4a", 1.0, 1.0, 0.32, 0, wy + 6.6, 1.6, { glow: true });
      v.add("orb", "#14051f", 0.26, 0.8, 0.34, 0, wy + 6.6, 1.68);
      v.box("#2a1450", 2.8, 0.36, 0.3, 0, wy + 7.4, 1.5, { rz: 0.12, ink: 0.03 });
      // the keep, its barred windows
      v.box("#6b6688", 4.6, 5.2, 3.6, 0, wy + 2.6, -0.4, { ink: 0.05 });
      for (let i = 0; i < 3; i++) for (let f = 0; f < 2; f++) v.box("#1d1530", 0.5, 0.8, 0.1, -1.4 + i * 1.4, wy + 2.4 + f * 1.6, 1.42);
      for (let i = 0; i < 3; i++) for (let f = 0; f < 2; f++) v.box(f ? "#ffcf7a" : "#c77dff", 0.36, 0.6, 0.08, -1.4 + i * 1.4, wy + 2.4 + f * 1.6, 1.4, { glow: true });
      // the corner towers with their cone roofs
      for (const [tx, tz] of [
        [-4.4, 3.2],
        [4.4, 3.2],
        [-4.4, -3.4],
        [4.4, -3.4],
      ]) {
        v.cyl("#7a7596", 1.0, 5, tx, wy + 2.5, tz, { ink: 0.05 }, "hex");
        v.cyl("#c77dff", 1.04, 0.16, tx, wy + 4.2, tz, { glow: true }, "hex");
        v.cone("#3a2f5c", 1.3, 1.6, tx, wy + 5.8, tz, { ink: 0.04 });
      }
      // a giant broken key, in pieces, in the yard (a transparent address's, linked by THE TRACKER)
      v.frame(x + 2.6, wy, z + 1.8, 0.4);
      v.cyl("#b88a5a", 0.7, 0.3, 0, 0.45, 0, { rx: Math.PI / 2, ink: 0.04 }, "torus");
      v.box("#b88a5a", 2.2, 0.3, 0.3, 1.5, 0.3, 0.1, { rz: 0.1, ink: 0.03 });
      v.box("#b88a5a", 1.3, 0.3, 0.3, 3.4, 0.18, 0.4, { rz: -0.2, ink: 0.03 });
      // THE TRACKER's crystals growing out of the rock, violet glow round it
      for (let i = 0; i < 16; i++) {
        const a = rnd() * Math.PI * 2;
        const cx = x + Math.sin(a) * (6.6 + rnd() * 1.6),
          cz = z + Math.cos(a) * (5.4 + rnd() * 1.4);
        if (ground.onPath(cx, cz, 0.4)) continue;
        const h = 0.8 + rnd() * 1.6;
        v.frame(cx, 0, cz, rnd() * 3);
        v.cyl(rnd() < 0.6 ? "#c77dff" : "#ff4fd8", 0.22 + rnd() * 0.12, h, 0, h / 2 - 0.1, 0, { glow: true, rz: (rnd() - 0.5) * 0.7 }, "hex");
        v.cyl("#e9c8ff", 0.14, h * 0.6, 0.3, h * 0.3, 0.1, { glow: true, rz: 0.5 }, "hex");
      }
      life.motesAt(x, 2.5, z, 8, 3, 24, ["#c77dff", "#ff4fd8", "#e9c8ff"]);
      pools.add(x, z, 11, "#a040ff", 0.06, 0.55);
      // the keep's searchlight
      life.searchlight(x, wy + 5.6, z - 0.4, 1, 14, Math.PI);
      v.frame(x, 0, z, 0);
      v.cyl("#2a2440", 0.4, 0.5, 0, wy + 5.45, -0.4);
      // chains, a flag of THE TRACKER's eye
      for (let i = 0; i < 6; i++) v.cyl("#9a94b0", 0.2, 0.2, -4.9 + i * 0.3, 1.0 - Math.sin((i / 5) * Math.PI) * 0.4, 3.75, { rx: Math.PI / 2, ry: i % 2 ? 0 : Math.PI / 2 }, "torus");
      life.flag(x - 4.4, wy + 6.4, z - 3.4, Math.PI / 2, "#3a1b66", 1.1);
      v.frame(x - 4.4, 0, z - 3.4, 0);
      v.cyl("#e8e4ff", 0.05, 1.8, 0, wy + 6.6, 0, {}, "cyl8");
      // the perimeter: an iron fence between the watchtowers, violet-lit spikes, a gap at the gate
      const towers = k.map.landmarks.filter((l) => l.kind === "watchtower" && Math.hypot(l.x - x, l.z - z) < 14);
      if (towers.length === 4) {
        const ring = [...towers].sort((p, q) => Math.atan2(p.x - x, p.z - z) - Math.atan2(q.x - x, q.z - z));
        for (let i = 0; i < 4; i++) {
          const p = ring[i],
            q = ring[(i + 1) % 4];
          const len = Math.hypot(q.x - p.x, q.z - p.z);
          const yaw = Math.atan2(q.x - p.x, q.z - p.z);
          const n = Math.floor(len / 0.8);
          for (let j = 1; j < n; j++) {
            const f = j / n;
            const fx = p.x + (q.x - p.x) * f,
              fz = p.z + (q.z - p.z) * f;
            if (Math.abs(fx - x) < 1.6 && fz > z) continue;
            if (ground.onPath(fx, fz, 0.2)) continue;
            v.frame(fx, 0, fz, yaw);
            v.box("#2a2440", 0.09, 1.5, 0.09, 0, 0.75, 0);
            v.add("cone6", "#c77dff", 0.14, 0.3, 0.14, 0, 1.62, 0, { glow: true });
            v.box("#2a2440", 0.05, 0.06, 0.8, 0, 0.5, 0);
            v.box("#2a2440", 0.05, 0.06, 0.8, 0, 1.25, 0);
          }
        }
      }
      paint.shadow(x, z, 7, 5.5, 0.4);
      sign(k, d.label ?? "ZEC STATE PENITENTIARY", x - 3.5, 2.6, z + 4.9, 0, 6.5, "#3a2f5c");
      break;
    }
    case "docks": {
      // the blimps moored off the pier
      for (const [bx, bz, c, yaw] of [
        [47, -4, "#c4b1fc", 0.3],
        [47.5, -19, "#ff6b35", -0.4],
      ] as [number, number, string, number][]) {
        const b = new THREE.Group();
        // (its hull on life's moving batcher, a body that follows this group)
        const dv = life.dyn;
        b.userData.body = dv.body();
        dv.add("ball", c, 8.4, 3.4, 3.4, 0, 0, 0, { ink: 0.07 });
        dv.add("ball", "#ffffff", 8.5, 0.7, 3.44, 0, 0, 0);
        dv.box("#2a1f55", 1.8, 0.7, 0.9, 0.4, -1.95, 0, { ink: 0.04 });
        dv.box("#ffcf7a", 1.4, 0.3, 0.92, 0.4, -1.9, 0, { glow: true });
        dv.box(c, 1.2, 1.6, 0.12, -3.9, 0.8, 0, { ink: 0.03 });
        dv.box(c, 1.2, 0.12, 2.4, -3.9, 0, 0, { ink: 0.03 });
        for (let i = 0; i < 4; i++) dv.add("orb", "#fff3a0", 0.22, 0.22, 0.22, -2.4 + i * 1.6, -1.62 + Math.abs(i - 1.5) * 0.12, 0, { glow: true });
        const lb = label("ZSTREET BLIMP", 0.6, "#1a1033");
        lb.position.set(0.3, 0.05, 1.75);
        lb.scale.x = 3.4;
        b.add(lb);
        b.position.set(bx, 9, bz);
        b.rotation.y = yaw + Math.PI / 2;
        parent.add(b);
        mv.blimps.push(b);
        // its tether to a post on the rim
        v.frame(0, 0, 0, 0);
        v.box("#3a2f5a", 0.3, 1.2, 0.3, bx - 5.5, 0.6 - 0.75, bz);
        const len = Math.hypot(5.5, 8);
        v.box("#ffffff", 0.05, len, 0.05, bx - 2.75, 4.6, bz, { rz: Math.atan2(5.5, 8) });
      }
      // crates, barrels, nets, bollards
      v.frame(0, 0, 0, 0);
      for (const [cx, cz] of [
        [33.5, -1.6],
        [36, -20.2],
        [22.6, -0.2],
        [18.4, -16],
      ]) {
        if (!ground.land(cx, cz, 0.6)) continue;
        crateAt(v, cx, cz, rnd);
        paint.shadow(cx, cz, 0.9, 0.9, 0.3);
      }
      sign(k, d.label ?? "HARBOR", 31.5, 2.4, -6.4, 0, 3.8, "#3ec6ff", "#1a1033");
      // flags on the pier's corners
      for (const [fx, fz, c] of [
        [41.6, -9.8, "#3ec6ff"],
        [37.6, -2.6, "#ff6b35"],
        [37.2, -18.6, "#ffd23f"],
      ] as [number, number, string][]) {
        v.frame(fx, 0, fz, 0);
        v.cyl("#e8e4ff", 0.07, 4.2, 0, 2.1 - 0.4, 0, { ink: 0.02 }, "cyl8");
        life.flag(fx, 3.2, fz, 0.4, c, 1);
      }
      break;
    }
    case "monument": {
      // GENESIS BLOCK #1: Zcash's first block, mined on 28 Oct 2016, a giant voxel on a plinth in a pond
      pond(k, x, z, 4.4);
      v.frame(x, 0, z, 0.3);
      v.cyl("#e9dcc6", 2.2, 0.8, 0, 0.4, 0, { ink: 0.05 }, "hex");
      v.box("#d9ccff", 2.6, 0.6, 2.6, 0, 1.1, 0, { ink: 0.05 });
      v.box("#ffcf2e", 2.2, 2.2, 2.2, 0, 2.5, 0, { ry: 0.785, ink: 0.06 });
      v.box("#fff1a6", 2.24, 0.3, 2.24, 0, 3.3, 0, { ry: 0.785 });
      v.box("#e0a000", 2.24, 0.3, 2.24, 0, 1.7, 0, { ry: 0.785 });
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + 0.785;
        v.ball("#fff3c4", 0.18, 0.18, 0.18, Math.sin(a) * 2.6, 0.9, Math.cos(a) * 2.6, { glow: true });
        v.box("#c4b1fc", 0.25, 1.0, 0.25, Math.sin(a) * 2.6, 0.5, Math.cos(a) * 2.6, { ink: 0.02 });
      }
      for (let i = 0; i < 7; i++) {
        const a = rnd() * Math.PI * 2;
        v.cyl("#4fbf5a", 0.3, 0.03, Math.cos(a) * 3.1, 0.16, Math.sin(a) * 3.1, {}, "cyl8");
      }
      words.add(d.label ?? "GENESIS BLOCK #1", 0.42, x + Math.sin(0.3) * 1.32, 1.1, z + Math.cos(0.3) * 1.32, 0.3, { fg: "#1a1033", bg: "#ffffff", w: 2.4 });
      const h = halo("#ffe27a", 7, 0.35);
      h.position.set(x, 2.6, z);
      parent.add(h);
      pools.add(x, z, 5, "#ffe27a", 0.2, 0.5);
      life.motesAt(x, 3, z, 3, 2, 10, ["#ffe27a", "#ffffff"]);
      break;
    }
    case "district":
      neonStreet(k, d);
      break;
    case "park":
      park(k, d);
      break;
    default:
      return false;
  }
  return true;
}

/** Its own touches once the shared kit is built: the harbour's big fall into the chasm, flags on the basin's rim. */
function build(k: Kit) {
  const L = k.map.lagoon;
  if (!L) return;
  k.falls.add(31.1, -9.3, -Math.PI / 2 - 0.1, 3.6, L.y, 24);
  k.v.frame(31.1, 0, -9.3, -Math.PI / 2 - 0.1);
  k.v.box("#ffffff", 3.6, 0.12, 0.5, 0, L.y + 0.02, 0.2, { glow: true });
  for (const [fx, fz, c] of [
    [45.6, -9, "#3ec6ff"],
    [43.4, -19.4, "#ff6b35"],
    [41.4, -2.1, "#33d67c"],
  ] as [number, number, string][]) {
    k.v.frame(fx, L.y + 0.37, fz, 0);
    k.v.cyl("#e8e4ff", 0.07, 3.6, 0, 1.8, 0, { ink: 0.02 }, "cyl8");
    k.v.add("orb", "#ffd23f", 0.2, 0.2, 0.2, 0, 3.68, 0);
    k.life.flag(fx, L.y + 0.37 + 3.6 - 0.45, fz, 0.3, c, 1);
  }
}

/** The Needle district's street (low: the cameras look over it): neon kiosks, arches, a ramen bar, lamps. */
function neonStreet(k: Kit, d: LandmarkDef) {
  const { v, words, pools, life, ground, paint } = k;
  const { x, z } = d;
  // shopfronts along the north side of the street (just south of the Needle's loop: kept low)
  const shops: [number, number, string, string, number][] = [
    [-5.2, -38.2, "#ff4fd8", "HASH BAR", 2.7],
    [-0.4, -37.6, "#3ef0ff", "ZEC SWAP", 3.0],
    [4.6, -38.3, "#ffd23f", "RAMEN", 2.6],
  ];
  for (const [sx, sz, c, name, h] of shops) {
    const px = sx,
      pz = sz;
    const room = ground.maxH(px, pz, 1.6);
    const hh = Math.max(2.2, Math.min(h, room));
    v.frame(px, 0, pz, 0);
    v.box("#4a3f78", 3.6, hh, 2.6, 0, hh / 2, 0, { ink: 0.045 });
    v.box("#6a5fa0", 3.8, 0.22, 2.8, 0, hh + 0.11, 0);
    for (const [ex, ez, ew, ed] of [
      [0, 1.4, 3.8, 0.08],
      [0, -1.4, 3.8, 0.08],
      [1.9, 0, 0.08, 2.8],
      [-1.9, 0, 0.08, 2.8],
    ])
      v.box(c, ew, 0.08, ed, ex, hh + 0.26, ez, { glow: true });
    v.box("#c9c2d8", 0.8, 0.5, 0.6, -0.9, hh + 0.47, -0.4, { ink: 0.02 });
    v.cyl("#8c87a6", 0.25, 0.4, 0.9, hh + 0.42, 0.2, { ink: 0.02 }, "cyl8");
    v.box("#ffe3a0", 2.6, 1.0, 0.06, 0, 1.0, 1.31, { glow: true });
    v.box("#2a2450", 0.9, 1.5, 0.08, 1.2, 0.75, 1.32);
    v.box(c, 3.7, 0.12, 0.12, 0, hh - 0.2, 1.38, { glow: true });
    // an awning
    for (let i = 0; i < 5; i++) v.box(i % 2 ? "#ffffff" : c, 0.72, 0.1, 0.9, -1.44 + i * 0.72, 1.85, 1.65, { rx: 0.3 });
    words.add(name, 0.5, px, hh - 0.55, pz + 1.35, 0, { fg: c, neon: true, w: 3.2 });
    pools.add(px, pz + 2.4, 2.6, c, 0.08, 0.75);
    paint.shadow(px, pz, 2.2, 1.6, 0.3);
    ground.take(px, pz, 2.2);
  }
  // neon arches over the street's ends
  for (const [ax, ac] of [
    [-7.4, "#3ef0ff"],
    [8.2, "#ff4fd8"],
  ] as [number, string][]) {
    v.frame(ax, 0, -40.6, Math.PI / 2);
    for (const s of [-1.6, 1.6]) v.box("#2a2450", 0.3, 3.2, 0.3, s, 1.6, 0, { ink: 0.03 });
    v.box("#2a2450", 3.6, 0.36, 0.36, 0, 3.3, 0, { ink: 0.03 });
    v.box(ac, 3.7, 0.1, 0.1, 0, 3.08, 0.2, { glow: true });
    v.box(ac, 0.1, 2.9, 0.1, -1.6, 1.55, 0.2, { glow: true });
    v.box(ac, 0.1, 2.9, 0.1, 1.6, 1.55, 0.2, { glow: true });
    pools.add(ax, -40.6, 2.4, ac, 0.08, 0.7);
  }
  // food carts, crates of glowing parcels, lamps
  for (const [cx, cz, c] of [
    [-3.2, -42.2, "#ff6b35"],
    [2.3, -42.6, "#7b5cff"],
  ] as [number, number, string][]) {
    v.frame(cx, 0, cz, 0.2);
    v.box(c, 1.5, 0.9, 0.9, 0, 0.75, 0, { ink: 0.035 });
    for (const s of [-0.55, 0.55]) v.cyl("#2a2440", 0.2, 0.12, s, 0.22, 0.46, { rx: Math.PI / 2 }, "cyl8");
    for (let i = 0; i < 4; i++) v.box(i % 2 ? "#ffffff" : c, 0.4, 0.08, 1.2, -0.6 + i * 0.4, 1.9, 0, { rx: 0.2 });
    for (const s of [-0.65, 0.65]) v.box("#2a2440", 0.08, 1.1, 0.08, s, 1.4, -0.4);
    v.add("orb", "#ffe27a", 0.16, 0.16, 0.16, 0, 1.75, 0.3, { glow: true });
    paint.shadow(cx, cz, 1.0, 0.7, 0.3);
  }
  for (const [lx, lz] of [
    [-6.5, -36],
    [6.5, -36],
    [-1.2, -43.6],
  ])
    lamp(k, lx, lz, "#c8f6ff", 2.4);
  // sparkles in the air (the district never sleeps)
  life.motesAt(x, 2.5, z, 9, 5, 26, ["#3ef0ff", "#ff4fd8", "#ffd23f"]);
}

/** GENESIS PARK: lawns, flower beds, hedges, a pond with lilies and ducks, a bandstand, benches, trees. */
function park(k: Kit, d: LandmarkDef) {
  const { v, rnd, ground, paint, life, words } = k;
  const { x, z } = d;
  // the bandstand (north of the park: behind the spaces' line of sight)
  const bx = 13.2,
    bz = 16.4;
  if (ground.free(bx, bz, 2.4)) {
    ground.take(bx, bz, 3.0);
    v.frame(bx, 0, bz, 0);
    v.cyl("#f3e7d0", 2.2, 0.5, 0, 0.25, 0, { ink: 0.04 }, "hex");
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      v.box("#ffffff", 0.16, 2.4, 0.16, Math.sin(a) * 1.9, 1.7, Math.cos(a) * 1.9, { ink: 0.02 });
    }
    v.add("cone6", "#c4b1fc", 5.0, 1.6, 5.0, 0, 3.7, 0, { ink: 0.05 });
    v.add("orb", "#ffd23f", 0.36, 0.36, 0.36, 0, 4.6, 0);
    paint.shadow(bx, bz, 2.6, 2.6, 0.32);
    life.bunting([bx - 1.9, 2.8, bz], [bx + 1.9, 2.8, bz], 6, 0.3);
  }
  // the pond round the monument gets lilies; a second pond with ducks
  const px = 11.8,
    pz = 9.4;
  if (ground.free(px, pz, 2.0)) {
    ground.take(px, pz, 2.8);
    pond(k, px, pz, 2.6);
    v.frame(px, 0, pz, 0);
    for (let i = 0; i < 6; i++) {
      const a = rnd() * Math.PI * 2,
        rr = 0.6 + rnd() * 1.4;
      v.cyl("#4fbf5a", 0.28, 0.03, Math.cos(a) * rr, 0.16, Math.sin(a) * rr, {}, "cyl8");
      if (i % 2) v.add("orb", "#ff8fc8", 0.14, 0.12, 0.14, Math.cos(a) * rr, 0.23, Math.sin(a) * rr);
    }
    for (let i = 0; i < 2; i++) life.duck(px, 0.13, pz, 1.1 + i * 0.6, i);
  }
  // flower beds and low hedges round the lawns
  for (let i = 0, made = 0; i < 300 && made < 16; i++) {
    const fx = x + (rnd() - 0.5) * 20,
      fz = z + (rnd() - 0.5) * 22;
    if (!ground.free(fx, fz, 1.0)) continue;
    ground.take(fx, fz, 1.3);
    made++;
    const yaw = Math.round(rnd() * 4) * (Math.PI / 4);
    v.frame(fx, 0, fz, yaw);
    if (made % 3) {
      v.box("#e9dcc6", 2.0, 0.3, 1.0, 0, 0.15, 0, { ink: 0.03 });
      v.box("#7a4a2b", 1.8, 0.06, 0.8, 0, 0.31, 0);
      for (let f = 0; f < 8; f++) v.add("orb", pick(FLOWERS, rnd()), 0.26, 0.24, 0.26, -0.75 + (f % 4) * 0.5, 0.42, f < 4 ? -0.2 : 0.2);
    } else {
      v.box("#3fa451", 2.2, 0.7, 0.7, 0, 0.35, 0, { ink: 0.035 });
      v.box("#56b85a", 2.0, 0.1, 0.5, 0, 0.72, 0);
    }
    paint.shadow(fx, fz, 1.1, 0.7, 0.2);
  }
  // benches and lamps along its paths
  for (let i = 0, made = 0; i < 200 && made < 6; i++) {
    const fx = x + (rnd() - 0.5) * 20,
      fz = z + (rnd() - 0.5) * 22;
    if (!ground.free(fx, fz, 0.8)) continue;
    ground.take(fx, fz, 1.0);
    made++;
    if (made % 2) bench(v, fx, fz, rnd() * Math.PI * 2);
    else lamp(k, fx, fz);
  }
  // a dense grove where the cameras allow it
  for (let i = 0, made = 0; i < 600 && made < 26; i++) {
    const fx = x + (rnd() - 0.5) * 22,
      fz = z + (rnd() - 0.5) * 24;
    if (!ground.free(fx, fz, 0.9)) continue;
    if (tree(k, fx, fz, rnd() < 0.6 ? "round" : "any")) (ground.take(fx, fz, 1.15), made++);
  }
  // its sign, at its north gate
  for (let i = 0; i < 40; i++) {
    const sx = 15 + (rnd() - 0.5) * 3,
      sz = 19.4 + (rnd() - 0.5) * 2;
    if (!ground.free(sx, sz, 0.8)) continue;
    ground.take(sx, sz, 1.2);
    v.frame(sx, 0, sz, 0);
    for (const s of [-0.9, 0.9]) v.box(WOOD_D, 0.18, 1.9, 0.18, s, 0.95, 0, { ink: 0.02 });
    v.box("#33d67c", 2.4, 0.62, 0.16, 0, 1.6, 0, { ink: 0.035 });
    words.add(d.label ?? "GENESIS PARK", 0.42, sx, 1.6, sz + 0.09, 0, { fg: "#ffffff", w: 2.2 });
    for (let f = 0; f < 5; f++) v.box(pick(FLOWERS, rnd()), 0.24, 0.26, 0.24, -1 + f * 0.5, 0.13, 0.35);
    break;
  }
  life.motesAt(x, 1.2, z, 10, 1.5, 22, ["#fff3a0", "#d8ff9a"]);
  for (let i = 0; i < 4; i++) life.bird(x + (rnd() - 0.5) * 8, z + (rnd() - 0.5) * 8, 4 + rnd() * 5, 7 + rnd() * 4, "bird");
}


const GENESIS_ART: MapArt = { key: "genesis", landmark, build };
export default GENESIS_ART;
