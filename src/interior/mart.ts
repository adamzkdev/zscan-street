import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { MartDecals } from "../scene/real/marts";
import type { Chain } from "../scene/real/martdata";
import { loadArt, Snark } from "../scene/snark";
import { coffeeMachine, place, plant } from "./furniture";
import { glowMat } from "./kit";

/**
 * A convenience store's inside (src/interior/building.ts dresses it when the door's name is a
 * chain's, src/scene/real/martdata.ts): the chain's colours on its walls' band and the floor's mat,
 * its fascia over the counter; three aisles of gondolas packed with goods; the drinks fridges along
 * the left wall, lit behind their glass doors; the counter on the right by the door with its till, the
 * hot-snack case and the cashier behind it, the coffee machine and the lit shelf at her back; the ATM
 * and the copier along the right wall; magazines under the front window. Cheap to draw: the shelves,
 * the fridges and the counter are merged per material, every product of a kind is one instanced draw.
 */

export interface DressEnv {
  shell: THREE.Group;
  fit: THREE.Group;
  /** What the next dress disposes of. */
  own: (THREE.BufferGeometry | THREE.Material | THREE.Texture)[];
  solid(x0: number, z0: number, x1: number, z1: number): void;
  mat(c: string, rough?: number, metal?: number): THREE.MeshStandardMaterial;
  r(): number;
  /** The room's half width, its depth, its height (the door in the middle of z = 0, the room toward −z). */
  W: number;
  D: number;
  H: number;
  /** The zkSNARKs inside (ticked while you are in). */
  people: Snark[];
  /** Still this dress (a zkSNARK whose art comes in after the next visit's dress is let go). */
  live(): boolean;
}

/** Boxes merged per material: one mesh each (named, so the breakables leave them be). */
export class Merger {
  private parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
  box(m: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number) {
    const g = new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z);
    const l = this.parts.get(m);
    if (l) l.push(g);
    else this.parts.set(m, [g]);
  }
  geo(m: THREE.Material, g: THREE.BufferGeometry) {
    const gg = g.index ? g.toNonIndexed() : g;
    const l = this.parts.get(m);
    // (all non-indexed: boxes too, once one is in)
    if (l) l.push(gg);
    else this.parts.set(m, [gg]);
  }
  flush(parent: THREE.Object3D, name: string, own: DressEnv["own"]) {
    for (const [m, list] of this.parts) {
      const plain = list.map((g) => (g.index ? g.toNonIndexed() : g));
      const geo = mergeGeometries(plain, false);
      for (const g of list) g.dispose();
      if (!geo) continue;
      own.push(geo);
      const mesh = new THREE.Mesh(geo, m);
      mesh.name = name;
      mesh.userData.noBreak = true;
      parent.add(mesh);
    }
    this.parts.clear();
  }
}

/** A zkSNARK standing (or wandering between spots) in the room, ticked by the building. */
export async function standee(env: DressEnv, id: number, x: number, z: number, face: THREE.Vector3, wander?: [number, number][]) {
  try {
    const art = await loadArt(id);
    if (!env.live()) return null;
    const s = new Snark(id, art);
    s.noClip = true;
    s.state = "resident";
    s.root.position.set(x, 0, z);
    s.faceDir = face;
    s.root.userData.snarkRef = true;
    env.fit.add(s.root);
    env.people.push(s);
    if (wander) {
      void (async () => {
        for (;;) {
          await new Promise((r) => setTimeout(r, 4000 + Math.random() * 7000));
          if (!s.root.parent) return;
          s.faceDir = null;
          const p = wander[Math.floor(Math.random() * wander.length)];
          await s.walk([new THREE.Vector3(p[0], 0, p[1])], 0.8);
          s.faceDir = face;
        }
      })();
    }
    return s;
  } catch {
    return null;
  }
}

/** A material per colour and finish for this dress (merged boxes of one colour share their draw). */
export function memoMat(env: DressEnv) {
  const made = new Map<string, THREE.MeshStandardMaterial>();
  return (c: string, rough = 0.7, metal = 0.05) => {
    const k = `${c}|${rough}|${metal}`;
    let m = made.get(k);
    if (!m) made.set(k, (m = env.mat(c, rough, metal)));
    return m;
  };
}

export function dressMart(env: DressEnv, c: Chain, seed: number) {
  const { shell, fit, own, solid, r, W, D, H } = env;
  const mat = memoMat(env);
  const M = new Merger();
  const band = mat(c.wall, 0.5);
  const stripe = mat(c.stripe, 0.5);
  // the chain's band round the walls under the ceiling, its stripe under it
  for (const [w, d, x, z] of [
    [2 * W - 0.1, 0.04, 0, -D + 0.1],
    [0.04, D - 0.2, -W + 0.1, -D / 2],
    [0.04, D - 0.2, W - 0.1, -D / 2],
  ] as const) {
    M.box(band, w, 0.42, d, x, H - 0.62, z);
    M.box(stripe, w + 0.01, 0.07, d + 0.01, x, H - 0.69, z);
  }
  // its fascia over the counter's back and over the back wall (the atlas's own: the street's sign)
  const A = new MartDecals();
  A.facing(`fascia:${c.key}`, 0, H - 1.05, -D + 0.14, [0, 0, 1], 6.4, 0.8);
  A.facing(`fascia:${c.key}`, W - 0.14, 2.62, -3.7, [-1, 0, 0], 3.6, 0.45);
  A.facing("menu", W - 0.9, 1.55, -1.5, [0, 0, 1], 0.5, 0.5);
  A.facing(`open:${c.key}`, -2.6, 2.55, -0.2, [0, 0, -1], 1.4, 0.36);
  for (let k = 0; k < 2; k++) A.facing(`poster:${(k + seed) % 4}`, -6.2 + k * 1.1, 1.6, -0.2, [0, 0, -1], 0.7, 1.4);
  const dm = A.mesh("mart-signs");
  if (dm) {
    dm.userData.noBreak = true;
    shell.add(dm);
  }
  // a mat at the door in the chain's colour
  M.box(band, 2.4, 0.012, 1.4, 0, 0, -0.9);

  // ---- the drinks fridges along the left wall: a cabinet, lit shelves of bottles behind glass doors ----
  const cab = mat("#e8eaec", 0.4, 0.4);
  const back = glowMat("#eaf8ff", 1.05);
  own.push(back);
  const fz0 = -1.9,
    fz1 = -D + 0.6;
  const fx = -W + 0.05;
  // (an open-fronted cabinet: its back, plinth, top and ends; the lit panel at the back)
  const fl = fz0 - fz1,
    fm = (fz0 + fz1) / 2;
  M.box(cab, 0.08, 2.25, fl, fx + 0.04, 0, fm);
  M.box(cab, 0.95, 0.18, fl, fx + 0.475, 0, fm);
  M.box(cab, 0.95, 0.2, fl, fx + 0.475, 2.05, fm);
  for (const ez of [fz0, fz1]) M.box(cab, 0.95, 2.25, 0.06, fx + 0.475, 0, ez);
  M.box(back, 0.02, 1.86, fl - 0.2, fx + 0.1, 0.18, fm);
  const glassM = new THREE.MeshPhysicalMaterial({ color: "#dff2fa", roughness: 0.05, metalness: 0, transparent: true, opacity: 0.16, depthWrite: false });
  own.push(glassM);
  const doorW = 0.78;
  const nDoors = Math.floor((fz0 - fz1) / doorW);
  const bottles: THREE.Matrix4[] = [],
    bcol: THREE.Color[] = [];
  const drinks = ["#e8463a", "#3fa8ff", "#f4b728", "#43d17a", "#ff8a1f", "#f2f0ea", "#2a2a30", "#b07bff", "#8ad8ff"];
  const q = new THREE.Quaternion(),
    sc = new THREE.Vector3(),
    ps = new THREE.Vector3();
  for (let k = 0; k < nDoors; k++) {
    const z = fz0 - (k + 0.5) * doorW;
    // the frame round each door, its handle
    M.box(cab, 0.06, 2.0, 0.05, fx + 0.96, 0.18, z - doorW / 2);
    const g = new THREE.Mesh(new THREE.BoxGeometry(0.02, 1.86, doorW - 0.06), glassM);
    g.position.set(fx + 0.97, 0.18 + 0.93, z);
    g.name = "fridge-glass";
    g.userData.noBreak = true;
    own.push(g.geometry);
    fit.add(g);
    M.box(mat("#9aa0a8", 0.3, 0.8), 0.04, 0.6, 0.03, fx + 1.0, 0.9, z + doorW / 2 - 0.1);
    // five shelves of bottles, cans and cartons in facings
    for (let sh = 0; sh < 5; sh++) {
      const y = 0.24 + sh * 0.37;
      M.box(mat("#c8ccd2", 0.4, 0.5), 0.8, 0.02, doorW - 0.06, fx + 0.52, y, z);
      const col = new THREE.Color(drinks[Math.floor(r() * drinks.length)]);
      const tall = 0.2 + r() * 0.1;
      for (let i = 0; i < 6; i++) {
        bottles.push(new THREE.Matrix4().compose(ps.set(fx + 0.82, y + 0.02 + tall / 2, z - doorW / 2 + 0.08 + i * ((doorW - 0.16) / 5)), q, sc.set(0.075, tall, 0.075)));
        bcol.push(i % 3 === 2 ? new THREE.Color(drinks[Math.floor(r() * drinks.length)]) : col);
      }
    }
  }
  solid(-W, fz1, fx + 1.05, fz0);
  {
    const bg = new THREE.CylinderGeometry(0.45, 0.5, 1, 10);
    const bm = new THREE.MeshStandardMaterial({ roughness: 0.2, metalness: 0.1 });
    own.push(bg, bm);
    const im = new THREE.InstancedMesh(bg, bm, bottles.length);
    bottles.forEach((m, i) => (im.setMatrixAt(i, m), im.setColorAt(i, bcol[i])));
    im.name = "drinks";
    im.userData.noBreak = true;
    fit.add(im);
  }

  // ---- the aisles: gondolas (a base, a spine, four shelves each side, the price rail in the chain's colour), packed ----
  const shelfM = mat("#eceef0", 0.35, 0.45);
  const spineM = mat("#d0d4d8", 0.55, 0.2);
  const railM = mat(c.band, 0.45, 0.1);
  const packGeo = new THREE.BoxGeometry(1, 1, 1);
  const canGeo = new THREE.CylinderGeometry(0.5, 0.5, 1, 10);
  const stock: { geo: THREE.BufferGeometry; m: THREE.Matrix4[]; c: THREE.Color[]; mat: THREE.MeshStandardMaterial }[] = [
    { geo: packGeo, m: [], c: [], mat: new THREE.MeshStandardMaterial({ roughness: 0.55 }) },
    { geo: canGeo, m: [], c: [], mat: new THREE.MeshStandardMaterial({ roughness: 0.3, metalness: 0.45 }) },
  ];
  own.push(packGeo, canGeo, ...stock.map((s) => s.mat));
  const goods = ["#e8463a", "#f4b728", "#3fa8ff", "#43d17a", "#ff8a1f", "#b07bff", "#f2f0ea", "#ff5aa8", "#7a5236"];
  const z0 = -4.4,
    len = 6.0;
  for (const x of [-4.0, -0.8, 2.4]) {
    const zc = z0 - len / 2;
    M.box(spineM, 0.95, 0.14, len, x, 0, zc);
    M.box(spineM, 0.06, 1.62, len, x, 0.14, zc);
    // the end caps, a promotion on each
    for (const ez of [z0, z0 - len]) M.box(railM, 0.98, 1.7, 0.04, x, 0, ez + (ez === z0 ? 0.02 : -0.02));
    solid(x - 0.52, z0 - len - 0.05, x + 0.52, z0 + 0.05);
    for (const side of [-1, 1])
      for (let shelf = 0; shelf < 4; shelf++) {
        const y = 0.16 + shelf * 0.4;
        M.box(shelfM, 0.42, 0.025, len, x + side * 0.24, y, zc);
        M.box(railM, 0.012, 0.04, len, x + side * 0.455, y, zc);
        for (let zz = z0 - 0.1; zz > z0 - len + 0.12; ) {
          const kind = r(),
            n = 2 + Math.floor(r() * 4),
            col = new THREE.Color(goods[Math.floor(r() * goods.length)]);
          const w = kind < 0.6 ? 0.13 + r() * 0.09 : 0.07 + r() * 0.02,
            h = kind < 0.6 ? 0.18 + r() * 0.14 : 0.12;
          const st = stock[kind < 0.6 ? 0 : 1];
          for (let i = 0; i < n && zz > z0 - len + 0.12; i++) {
            st.m.push(new THREE.Matrix4().compose(ps.set(x + side * 0.27, y + 0.025 + h / 2, zz - w / 2), q, sc.set(kind < 0.6 ? 0.28 : w, h, w)));
            st.c.push(col);
            zz -= w + 0.012;
          }
          zz -= 0.03;
        }
      }
  }
  for (const st of stock) {
    const im = new THREE.InstancedMesh(st.geo, st.mat, st.m.length);
    st.m.forEach((m, i) => (im.setMatrixAt(i, m), im.setColorAt(i, st.c[i])));
    im.name = "goods";
    im.userData.noBreak = true;
    fit.add(im);
  }

  // ---- the counter: along the right side by the door, its top, the till, the hot-snack case ----
  const cx = W - 2.3,
    cz0 = -1.7,
    cz1 = -5.9;
  const front = mat(c.counter, 0.45, 0.15);
  M.box(front, 0.7, 0.98, cz0 - cz1, cx, 0, (cz0 + cz1) / 2);
  M.box(mat("#f4f4f2", 0.25, 0.05), 0.8, 0.05, cz0 - cz1 + 0.1, cx, 0.98, (cz0 + cz1) / 2);
  M.box(band, 0.02, 0.12, cz0 - cz1, cx - 0.36, 0.78, (cz0 + cz1) / 2);
  solid(cx - 0.45, cz1 - 0.1, cx + 0.45, cz0 + 0.1);
  // (behind it: the back counter, the lit shelf of cigarettes and tickets, the cashier's way out at the back)
  M.box(mat("#d8dadc", 0.5, 0.2), 0.55, 0.92, 3.4, W - 0.3, 0, -3.6);
  M.box(mat("#24262c", 0.5, 0.3), 0.3, 1.1, 3.4, W - 0.18, 1.3, -3.6);
  const lit = glowMat("#fff4e0", 0.9);
  own.push(lit);
  M.box(lit, 0.02, 1.0, 3.3, W - 0.34, 1.35, -3.6);
  solid(W - 0.6, -5.4, W, -1.8);
  for (let k = 0; k < 40; k++) M.box(mat(goods[k % goods.length], 0.5), 0.06, 0.12, 0.07, W - 0.4, 1.4 + (k % 4) * 0.25, -1.95 - Math.floor(k / 4) * 0.33);
  const till = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.3, 0.38), mat("#16161c", 0.3, 0.6));
  till.position.set(cx + 0.05, 1.18, -4.4);
  till.name = "till";
  own.push(till.geometry);
  fit.add(till);
  {
    // the hot-snack case: a glass box on the counter, its warm light, fried chicken and buns on its trays
    const g = new THREE.Group();
    g.name = "hot-snacks";
    const glass = new THREE.MeshPhysicalMaterial({ color: "#fff2dc", roughness: 0.05, transparent: true, opacity: 0.22, depthWrite: false });
    const warm = glowMat("#ffb860", 1.4);
    own.push(glass, warm);
    const caseG = new THREE.BoxGeometry(0.62, 0.48, 0.95);
    own.push(caseG);
    const cg = new THREE.Mesh(caseG, glass);
    cg.position.set(0, 0.24, 0);
    g.add(cg);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.02, 0.85), warm);
    lamp.position.set(0, 0.46, 0);
    g.add(lamp);
    own.push(lamp.geometry);
    const food = mat("#c8782a", 0.6);
    const bun = mat("#f2ead8", 0.7);
    for (let k = 0; k < 10; k++) {
      const m = new THREE.Mesh(k % 2 ? new THREE.SphereGeometry(0.06, 8, 6) : new THREE.BoxGeometry(0.1, 0.06, 0.08), k % 2 ? bun : food);
      m.position.set(-0.16 + (k % 3) * 0.16, 0.08 + (k > 5 ? 0.2 : 0), -0.35 + Math.floor(k / 2) * 0.16);
      own.push(m.geometry);
      g.add(m);
    }
    g.position.set(cx, 1.03, -2.5);
    fit.add(g);
  }
  // the coffee machine on the back counter, the menu over it
  place(fit, "coffee-machine", coffeeMachine, W - 0.35, 0.92, -2.0, -Math.PI / 2);
  // ---- along the right wall past the counter: the ATM, the copier ----
  {
    const atm = new THREE.Group();
    atm.name = "atm";
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.75, 0.8), mat("#c9ced4", 0.35, 0.6));
    body.position.y = 0.875;
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.14, 0.84), mat(c.band, 0.4));
    top.position.y = 1.82;
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.3), glowMat("#58c8ff", 1.1));
    scr.position.set(0, 1.32, 0.41);
    scr.rotation.x = -0.25;
    const pad = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.05, 0.22), mat("#3a3a42", 0.4, 0.5));
    pad.position.set(0, 1.02, 0.42);
    own.push(body.geometry, top.geometry, scr.geometry, scr.material as THREE.Material, pad.geometry);
    atm.add(body, top, scr, pad);
    atm.position.set(W - 0.5, 0, -7.0);
    atm.rotation.y = -Math.PI / 2;
    fit.add(atm);
    solid(W - 0.95, -7.45, W, -6.55);
    const cop = new THREE.Mesh(new THREE.BoxGeometry(0.75, 1.1, 0.65), mat("#e4e6e8", 0.45, 0.2));
    cop.position.set(W - 0.45, 0.55, -8.4);
    cop.name = "copier";
    own.push(cop.geometry);
    fit.add(cop);
    solid(W - 0.85, -8.8, W, -8.0);
  }
  // ---- under the front window: the magazine rack; a plant by the door ----
  {
    const rack = mat("#d8dadc", 0.4, 0.5);
    M.box(rack, 4.2, 0.9, 0.42, -4.3, 0, -0.62);
    // (the magazines on its shop side, facing in)
    for (let k = 0; k < 26; k++) M.box(mat(goods[(k * 5) % goods.length], 0.6), 0.14, 0.2, 0.02, -6.2 + (k % 13) * 0.3, 0.55 + Math.floor(k / 13) * 0.25, -0.845);
    solid(-6.45, -0.85, -2.15, -0.35);
    place(fit, "monstera-mart", () => plant("monstera", 2), -1.85, 0, -1.1, 0);
    solid(-2.2, -1.45, -1.5, -0.75);
  }
  M.flush(fit, "mart-fittings", own);
  // the cashier behind the counter, facing the shop; a shopper or two in the aisles
  void standee(env, 3100 + (seed % 900), W - 1.35, -3.6, new THREE.Vector3(-1, 0, 0));
  void standee(env, 4100 + (seed % 700), -2.4, -6.5, new THREE.Vector3(1, 0, 0), [
    [-2.4, -6.5],
    [-2.4, -9.4],
    [0.8, -11.2],
    [-5.5, -11.2],
    [4.0, -8.5],
  ]);
}
