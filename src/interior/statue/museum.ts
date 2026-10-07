import * as THREE from "three";
import { Market } from "../../data/market";
import { C, E, hash, shades, VoxelModel, type Paint } from "../../scene/voxel/model";
import { SNARK1, SNARK1_PALETTE } from "../../scene/voxel/landmarks/statue-art";
import type { StatueKit } from "./kit";
import type { Shell } from "./shell";

/**
 * Floor 0: the pedestal museum, in the casemates of Fort Wood, the eleven-point star fort the statue
 * stands on. A granite nave under a brick barrel vault, lower aisles behind granite piers, the
 * star's points as V-shaped bastions with loopholes. The original torch at the end of the nave,
 * the full-size copper replica of the hooded face, a cutaway scale model of the statue, plaques,
 * the shielded pools live, the rangers' desk, visitors.
 */

const X = 13,
  Z0 = -16,
  Z1 = 13,
  NAVE = 5,
  WALL_H = 6.4;
export const SPAWN0 = { pos: new THREE.Vector3(0, 0, Z1 - 1.6), yaw: 0 };

function tex(w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

/** World-scale UVs: each face takes the two axes it spans, divided by `scale`. */
function worldUV(geo: THREE.BufferGeometry, scale: number) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const p = g.getAttribute("position"),
    n = g.getAttribute("normal");
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)),
      ay = Math.abs(n.getY(i)),
      az = Math.abs(n.getZ(i));
    let u: number, v: number;
    if (ay >= ax && ay >= az) (u = p.getX(i)), (v = p.getZ(i));
    else if (ax >= az) (u = p.getZ(i)), (v = p.getY(i));
    else (u = p.getX(i)), (v = p.getY(i));
    uv[i * 2] = u / scale;
    uv[i * 2 + 1] = v / scale;
  }
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return g;
}

const ashlar = () =>
  tex(512, 512, (g, w, h) => {
    // coursed granite: 4 courses, staggered blocks, mortar, speckle
    g.fillStyle = "#6e675e";
    g.fillRect(0, 0, w, h);
    const rows = 4;
    for (let r = 0; r < rows; r++) {
      const y0 = (r * h) / rows;
      const n = 3;
      for (let i = -1; i < n; i++) {
        const x0 = ((i + (r % 2) * 0.5) * w) / n;
        const s = 150 + Math.floor(hash(r, i, 1) * 40);
        g.fillStyle = `rgb(${s},${s - 8},${s - 18})`;
        g.fillRect(x0 + 4, y0 + 4, w / n - 8, h / rows - 8);
        for (let k = 0; k < 260; k++) {
          const q = Math.floor(hash(r, i, k) * 60) - 30;
          g.fillStyle = `rgba(${q > 0 ? 255 : 0},${q > 0 ? 250 : 0},${q > 0 ? 240 : 0},0.07)`;
          g.fillRect(x0 + 6 + hash(i, k, r) * (w / n - 12), y0 + 6 + hash(k, r, i) * (h / rows - 12), 3, 3);
        }
      }
    }
  });
const bricks = () =>
  tex(512, 512, (g, w, h) => {
    g.fillStyle = "#4a3028";
    g.fillRect(0, 0, w, h);
    const rows = 16,
      bw = w / 4;
    for (let r = 0; r < rows; r++)
      for (let i = -1; i < 5; i++) {
        const s = hash(r, i, 3);
        g.fillStyle = `rgb(${130 + s * 40},${70 + s * 22},${52 + s * 14})`;
        g.fillRect(i * bw + (r % 2) * (bw / 2) + 2, (r * h) / rows + 2, bw - 4, h / rows - 4);
      }
  });
const flags = () =>
  tex(512, 512, (g, w, h) => {
    g.fillStyle = "#4e4a44";
    g.fillRect(0, 0, w, h);
    for (let r = 0; r < 2; r++)
      for (let i = 0; i < 2; i++) {
        const s = 120 + hash(r, i, 9) * 30;
        g.fillStyle = `rgb(${s},${s - 6},${s - 14})`;
        g.fillRect((i * w) / 2 + 3, (r * h) / 2 + 3, w / 2 - 6, h / 2 - 6);
      }
  });

export function museum(k: StatueKit, shell: Shell) {
  const f = 0;
  const granite = new THREE.MeshStandardMaterial({ map: ashlar(), roughness: 0.85 });
  const brick = new THREE.MeshStandardMaterial({ map: bricks(), roughness: 0.92, side: THREE.DoubleSide });
  const floor = new THREE.MeshStandardMaterial({ map: flags(), roughness: 0.6, metalness: 0.05 });
  const R = k.rects[f];
  const block = (w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material, scale = 2.4) => {
    const g = new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z);
    k.addGeo(f, worldUV(g, scale), mat);
  };
  const solid = (w: number, d: number, x: number, z: number) => R.push([x - w / 2, z - d / 2, x + w / 2, z + d / 2]);

  // ---- floor, walls, the star's bastions -----------------------------------------------------------
  k.addGeo(f, worldUV(new THREE.BoxGeometry(X * 2, 0.1, Z1 - Z0).translate(0, -0.05, (Z0 + Z1) / 2), 2.4), floor);
  // back and entrance walls
  block(X * 2, WALL_H + 2, 0.8, 0, 0, Z0 - 0.4, granite);
  block(X - 2, WALL_H + 2, 0.8, -X / 2 - 1, 0, Z1 + 0.4, granite);
  block(X - 2, WALL_H + 2, 0.8, X / 2 + 1, 0, Z1 + 0.4, granite);
  block(4, WALL_H + 2 - 3.6, 0.8, 0, 3.6, Z1 + 0.4, granite);
  R.push([-X, Z0 - 0.8, X, Z0], [-X, Z1, -2, Z1 + 0.8], [2, Z1, X, Z1 + 0.8], [-2, Z1 + 0.5, 2, Z1 + 0.8]);
  // the sally port: an oak door in an arched frame (the way out)
  k.slab(f, 3.6, 3.4, 0.1, 0, 0, Z1 + 0.75, k.wood);
  for (let i = -1.6; i <= 1.6; i += 0.4) k.slab(f, 0.04, 3.4, 0.04, i, 0, Z1 + 0.68, k.dark);
  k.slab(f, 4.4, 0.4, 0.9, 0, 3.4, Z1 + 0.4, k.granite);
  // side walls with two bastions each: a V into the wall, a loophole at its point
  const slit = k.glow("#bcd6ff", 1.4, 0.5);
  const bastions = [-9, 3];
  for (const sx of [-1, 1]) {
    let z = Z0;
    for (const bz of bastions) {
      const a = bz - 3,
        b = bz + 3;
      block(0.8, WALL_H + 2, a - z, sx * (X + 0.4), 0, (z + a) / 2, granite);
      R.push([sx > 0 ? X : -X - 0.8, z, sx > 0 ? X + 0.8 : -X, a]);
      // the V: two angled walls meeting 3 m out
      for (const [p, q] of [
        [a, bz],
        [b, bz],
      ]) {
        const A = new THREE.Vector3(sx * X, 0, p),
          B = new THREE.Vector3(sx * (X + 3), 0, q);
        const len = A.distanceTo(B);
        const g = new THREE.BoxGeometry(0.6, WALL_H + 2, len + 0.6);
        g.rotateY(Math.atan2(B.x - A.x, B.z - A.z));
        g.translate((A.x + B.x) / 2 + sx * 0.25, (WALL_H + 2) / 2, (A.z + B.z) / 2);
        k.addGeo(f, worldUV(g, 2.4), granite);
        for (let t = 0.15; t < 1; t += 0.2) {
          const x = A.x + (B.x - A.x) * t,
            zz = A.z + (B.z - A.z) * t;
          R.push([x - 0.35, zz - 0.35, x + 0.35, zz + 0.35]);
        }
      }
      // loophole: a tall slit of daylight at the point, and its splay
      k.slab(f, 0.05, 1.6, 0.18, sx * (X + 2.75), 1.4, bz, slit);
      k.slab(f, 0.4, 0.3, 1.4, sx * (X + 2.6), 0.9, bz, k.graniteDark);
      z = b;
    }
    block(0.8, WALL_H + 2, Z1 - z, sx * (X + 0.4), 0, (z + Z1) / 2, granite);
    R.push([sx > 0 ? X : -X - 0.8, z, sx > 0 ? X + 0.8 : -X, Z1]);
  }
  // bastion ceilings
  for (const sx of [-1, 1]) for (const bz of bastions) block(3.2, 0.6, 6.4, sx * (X + 1.6), WALL_H - 0.2, bz, granite);

  // ---- the nave's piers, arcades and the brick vaults --------------------------------------------
  const piersZ = [-12, -6, 0, 6];
  for (const sx of [-1, 1])
    for (const z of piersZ) {
      block(0.9, 4.6, 0.9, sx * NAVE, 0, z, granite, 1.2);
      block(1.2, 0.3, 1.2, sx * NAVE, 0, z, k.graniteDark);
      block(1.15, 0.25, 1.15, sx * NAVE, 4.6, z, k.granite);
      solid(1.0, 1.0, sx * NAVE, z);
    }
  // arches between the piers (segments), and the springing course along the nave
  for (const sx of [-1, 1]) {
    block(0.7, 0.5, Z1 - Z0, sx * NAVE, 4.85, (Z0 + Z1) / 2, granite, 1.2);
    for (let i = 0; i < piersZ.length + 1; i++) {
      const za = i === 0 ? Z0 : piersZ[i - 1],
        zb = i === piersZ.length ? Z1 : piersZ[i];
      const m = 10;
      for (let j = 0; j < m; j++) {
        const t0 = j / m,
          t1 = (j + 1) / m;
        const A = new THREE.Vector3(sx * NAVE, 3.6 + Math.sin(t0 * Math.PI) * 1.2, za + (zb - za) * t0),
          B = new THREE.Vector3(sx * NAVE, 3.6 + Math.sin(t1 * Math.PI) * 1.2, za + (zb - za) * t1);
        k.beam(f, A, B, 0.72, k.granite, 0.3);
      }
    }
  }
  // the vaults: half cylinders seen from below
  const vault = (cx: number, w: number, spring: number, rise: number) => {
    const n = 24;
    const pos: number[] = [],
      uv: number[] = [],
      idx: number[] = [];
    for (let i = 0; i <= n; i++) {
      const th = (i / n) * Math.PI;
      const x = cx + (w / 2) * Math.cos(th),
        y = spring + rise * Math.sin(th);
      const arc = (i / n) * Math.PI * Math.sqrt(((w / 2) ** 2 + rise ** 2) / 2);
      for (const z of [Z0, Z1]) {
        pos.push(x, y, z);
        uv.push(arc / 2.4, (z - Z0) / 2.4);
      }
      if (i) idx.push((i - 1) * 2, i * 2, (i - 1) * 2 + 1, (i - 1) * 2 + 1, i * 2, i * 2 + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    k.addGeo(f, g, brick);
  };
  vault(0, NAVE * 2, 5.1, 2.4);
  vault(-(X + NAVE) / 2, X - NAVE, 5.1, 1.2);
  vault((X + NAVE) / 2, X - NAVE, 5.1, 1.2);
  // the vault lamps: iron rings hanging in the nave
  const bulb = k.glow("#ffd9a0", 1.2, 2.2);
  for (const z of [-9, -3, 3, 9]) {
    k.beam(f, new THREE.Vector3(0, 7.4, z), new THREE.Vector3(0, 5.6, z), 0.03, k.iron);
    k.addGeo(f, new THREE.TorusGeometry(0.7, 0.04, 6, 24).rotateX(Math.PI / 2).translate(0, 5.6, z), k.iron);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      k.slab(f, 0.1, 0.16, 0.1, Math.cos(a) * 0.7, 5.62, z + Math.sin(a) * 0.7, bulb);
    }
  }

  // ---- the original torch, at the end of the nave ----------------------------------------------------
  const tz = -12.6;
  block(3.0, 0.7, 3.0, 0, 0, tz, k.granite, 1.2);
  block(3.3, 0.15, 3.3, 0, 0, tz, k.graniteDark);
  solid(3.4, 3.4, 0, tz);
  const torchObj = k.put(f, "statue-torch", torchModel, 0, 0.7, tz, 0, false);
  k.pick(f, torchObj, "<b>The original torch</b><span>1886 – 1986</span>", () => ({
    eyebrow: "Pedestal museum · the original torch",
    title: "The original torch",
    tag: ["1886 – 1986", "info"],
    stats: [
      ["Held up", "100 years"],
      ["Flame", "amber glass, lit inside"],
      ["Replaced by", "gold leaf, 1986"],
    ],
    body: "<p>It leaked when it rained and it glowed when it didn't. Retired after a century in the hand; the new flame is solid gold leaf. The light, not the privacy, was the problem.</p>",
  }));
  k.label(f, "THE ORIGINAL TORCH · 1886 — 1986", 0, 0.24, tz + 1.53, { h: 0.22, color: "#f4b728" });
  k.plaque(f, 1.1, 0.75, 2.05, 0.95, tz + 1.72, -0.35, "The Original Torch", "1886 – 1986", "Amber glass panes in a copper frame, lit from inside. A hundred years in the hand, then retired for leaking. The flame up there now is gold leaf: it shines, it doesn't let the rain in, and it reveals nothing about you.", { style: "panel" });

  // ---- the copper face: full-size replica, left aisle --------------------------------------------
  const fx = -10.8,
    fz = -3;
  block(1.6, 0.5, 4.6, fx, 0, fz, k.graniteDark);
  solid(1.8, 4.8, fx, fz);
  const face = k.put(f, "statue-face", faceModel, fx + 0.1, 0.5, fz, Math.PI / 2, false);
  k.pick(f, face, "<b>The face</b><span>copper replica, full size</span>", () => ({
    eyebrow: "Pedestal museum · copper skin",
    title: "The face, full size",
    stats: [
      ["Skin", "2.4 mm copper"],
      ["Rivets", "≈ 300,000"],
      ["Patina", "≈ 30 years to green"],
    ],
    body: "<p>Hammered over wooden moulds, sheet by sheet: this is the colour she was when she arrived. Give copper thirty years of sea air and it turns the green you see outside. The void stays a void.</p>",
  }));
  k.plaque(f, 1.2, 0.85, fx + 1.3, 1.3, fz + 3.0, Math.PI / 2 - 0.25, "The Copper Skin", "Repoussé · 2.4 mm", "Thinner than two coins stacked, hammered from the inside, riveted to iron straps. Before the patina she was the colour of a new penny. The eyes are Volt glass: from the inside, you can look out through them (floor 2).", { style: "panel" });
  // a sheet of copper going from new to green, to touch
  const sheet = new THREE.Mesh(
    new THREE.PlaneGeometry(1.6, 1.0, 1, 1),
    new THREE.MeshStandardMaterial({
      map: tex(256, 128, (g, w, h) => {
        const gr = g.createLinearGradient(0, 0, w, 0);
        gr.addColorStop(0, "#c8784a");
        gr.addColorStop(0.45, "#7a4a2a");
        gr.addColorStop(0.7, "#4a6a50");
        gr.addColorStop(1, "#6fb39a");
        g.fillStyle = gr;
        g.fillRect(0, 0, w, h);
        g.fillStyle = "rgba(0,0,0,0.35)";
        for (let x = 8; x < w; x += 24) for (let y = 8; y < h; y += 24) g.fillRect(x, y, 3, 3);
      }),
      roughness: 0.35,
      metalness: 0.7,
    }),
  );
  sheet.position.set(-8.6, 1.2, 6.5);
  sheet.rotation.set(-0.5, Math.PI / 2, 0, "YXZ");
  k.groups[f].add(sheet);
  block(0.5, 0.95, 1.4, -8.85, 0, 6.5, k.graniteDark);
  solid(0.7, 1.6, -8.8, 6.5);
  k.label(f, "1886 → 1916: TOUCH IT", -8.5, 0.62, 6.5, { h: 0.12, color: "#e8d8b8", rot: Math.PI / 2, glow: false });
  k.pick(f, sheet, "<b>Copper, new to green</b><span>30 years of sea air</span>", () => ({ eyebrow: "Pedestal museum", title: "Copper, new to green", body: "<p>Copper oxidises brown in months and grows its green verdigris over decades. The green is a skin on the skin: it protects the metal under it. Privacy works the same way.</p>" }));

  // ---- the scale model, a cutaway, right aisle ---------------------------------------------------------
  const mx = 9.6,
    mz = -3;
  block(2.2, 0.9, 2.2, mx, 0, mz, k.graniteDark);
  solid(2.4, 2.4, mx, mz);
  const model = new THREE.Group();
  const copy = shell.object.clone();
  model.add(copy);
  const s = 3.4 / (294 * (1.75 / 6));
  model.scale.setScalar(s);
  model.position.set(mx, 0.9, mz);
  model.rotation.y = -Math.PI / 2;
  k.groups[f].add(model);
  // its glass case
  const caseMat = new THREE.MeshPhysicalMaterial({ color: "#d8ecff", transparent: true, opacity: 0.1, roughness: 0.02, metalness: 0.1, depthWrite: false });
  const glass = new THREE.Mesh(new THREE.BoxGeometry(2.0, 3.8, 2.0), caseMat);
  glass.position.set(mx, 0.9 + 1.9, mz);
  k.groups[f].add(glass);
  k.pick(f, glass, "<b>Scale model</b><span>1 : 25, cutaway</span>", () => ({
    eyebrow: "Pedestal museum · scale model",
    title: "The zkSNARK of Liberty, 1 : 25",
    stats: [
      ["Pedestal", "19 m"],
      ["Crown", "35 m"],
      ["Torch", "45 m"],
    ],
    body: "<p>The same statue you are standing under, cut open: the copper skin, the double helix inside, the deck in the head. Floors 1 to T on the lift.</p>",
  }));
  k.plaque(f, 1.1, 0.75, mx - 1.4, 1.1, mz + 1.6, -Math.PI / 2 + 0.3, "Inside Her", "Iron frame · copper skin", "A copper skin on an iron skeleton designed by Gustave Eiffel. The skin carries nothing but itself; the frame carries everything. Take the lift to the balcony and climb the helix to see it.", { style: "panel" });

  // ---- the New Colossus, the plaques along the nave ------------------------------------------------
  k.plaque(f, 2.0, 1.6, -X + 0.06, 2.5, 9.0, Math.PI / 2, "The New Colossus", "Bronze tablet · after Emma Lazarus", "“Give me your tired, your poor,\nYour huddled UTXOs yearning to breathe free,\nThe wretched refuse of your teeming mempool.\nSend these, the unlinkable, tempest-tost, to me:\nI lift my torch beside the shielded door!”", { style: "bronze" });
  const lectern = (x: number, z: number, rot: number, title: string, sub: string, body: string) => {
    block(0.7, 0.95, 0.5, x, 0, z, k.dark, 1);
    solid(0.8, 0.6, x, z);
    k.plaque(f, 0.9, 0.62, x + Math.sin(rot) * 0.26, 1.18, z + Math.cos(rot) * 0.26, rot, title, sub, body, { style: "panel" }).rotateX(-0.55);
  };
  lectern(-2.6, -6, Math.PI / 2, "Zero Knowledge", "Goldwasser · Micali · Rackoff, 1985", "Prove a statement is true without revealing anything else. Like proving you're over 21 without showing your birthday, your name, or the bad photo.");
  lectern(2.6, -6, -Math.PI / 2, "The Ceremony", "2016 · six participants", "Zcash's first parameters were made by six people in six places; each destroyed their share of the secret. If even one of them did it right, nobody can forge a coin. The hardware was smashed on camera.");
  lectern(-2.6, 0, Math.PI / 2, "Halo 2", "Orchard · May 2022", "Recursive proofs with no trusted setup at all. No ceremony, no toxic waste, nothing to smash. The torch passed to maths.");
  lectern(2.6, 0, -Math.PI / 2, "Sapling", "October 2018", "Shielded transactions in about two seconds on a phone instead of forty on a laptop. Privacy you can carry in your pocket.");
  k.plaque(f, 1.3, 0.9, X + 2.4, 2.0, -9 - 1.6, -Math.PI / 2 - 0.86, "Fort Wood", "1808 – 1811 · eleven points", "The star fort under the statue was built to defend the harbour. Its walls now defend something else: the right to keep your business to yourself.", { style: "stone" });

  // ---- the shielded pools, live ----------------------------------------------------------------------
  const zec = (zat: number) => (zat / 1e8).toLocaleString("en-US", { maximumFractionDigits: 0 });
  k.screen(
    f,
    3.2,
    1.9,
    X - 0.06,
    2.6,
    8.2,
    -Math.PI / 2,
    (g, W, H) => {
      g.fillStyle = "#0b0d10";
      g.fillRect(0, 0, W, H);
      g.fillStyle = "#f4b728";
      g.font = '700 34px "JetBrains Mono", Menlo, monospace';
      g.fillText("SHIELDED POOLS · LIVE", 28, 52);
      const p = Market.state.pools;
      const rows: [string, number, string][] = p
        ? [
            ["ORCHARD", p.pools.orchard, "#3ee08f"],
            ["SAPLING", p.pools.sapling, "#7fe3ff"],
            ["SPROUT", p.pools.sprout, "#9a8cff"],
            ["TRANSPARENT", p.pools.transparent, "#8a8690"],
          ]
        : [];
      const max = Math.max(1, ...rows.map((r) => r[1]));
      rows.forEach(([name, v, col], i) => {
        const y = 100 + i * 70;
        g.fillStyle = "#c8c0b0";
        g.font = '600 24px "JetBrains Mono", Menlo, monospace';
        g.fillText(name, 28, y + 22);
        g.fillStyle = "#1c2026";
        g.fillRect(230, y, W - 260, 30);
        g.fillStyle = col;
        g.fillRect(230, y, ((W - 260) * v) / max, 30);
        g.fillStyle = "#ffffff";
        g.font = '700 22px "JetBrains Mono", Menlo, monospace';
        g.fillText(`${zec(v)} ZEC`, 240, y + 23);
      });
      g.fillStyle = "#f4b728";
      g.font = '700 26px "JetBrains Mono", Menlo, monospace';
      const h = k.height;
      g.fillText(p ? `SHIELDED ${(p.shielded_ratio * 100).toFixed(1)}%` : "LOADING…", 28, H - 30);
      g.fillStyle = "#8a8690";
      g.fillText(h ? `BLOCK ${h.toLocaleString("en-US")}` : "", W - 300, H - 30);
    },
    5,
  );
  Market.subscribe(() => {});

  // ---- rangers' desk and the crown stand by the door ---------------------------------------------
  block(3.2, 1.05, 0.8, 7.2, 0, 9.4, k.wood, 1);
  block(3.4, 0.06, 1.0, 7.2, 1.05, 9.4, k.graniteDark);
  solid(3.4, 1.0, 7.2, 9.4);
  k.label(f, "RANGERS · INFORMATION", 7.2, 1.25, 9.92, { h: 0.18, color: "#3ee08f" }).rotation.y = 0;
  k.put(f, "statue-crowns", crownStand, -7.4, 0, 9.6, 0);
  k.label(f, "FOAM CROWNS", -7.4, 2.25, 9.6, { h: 0.2, color: "#7fe3a8" });

  // ---- lights ------------------------------------------------------------------------------------------
  k.light(f, 0, 3.4, tz + 3.2, "#ffc888", 16, 10);
  k.light(f, fx + 3, 3.0, fz, "#ffd0a0", 10, 8);
  k.light(f, mx - 2.6, 3.4, mz, "#e8f0ff", 8, 8);
  k.light(f, 0, 5.4, 0, "#ffe2b8", 8, 14);
  k.light(f, 0, 4.4, 9, "#ffe2b8", 7, 12);
  k.light(f, 9.5, 3.2, 7.5, "#ffe8c8", 5, 8);

  // ---- people --------------------------------------------------------------------------------------------
  const P = (n: number, at: [number, number], role: string, face: [number, number], o: { cap?: boolean; wander?: [number, number][] } = {}) => k.person(f, k.visitor(n), at, role, { face, ...o });
  const ranger = P(1, [7.2, 10.4], "Ranger", [7.2, 12], { cap: true });
  const asker = P(2, [6.0, 8.0], "Visitor", [7.2, 9.4]);
  k.chat(f, [ranger, asker], [
    [[1, "Two tickets to the crown, please."], [0, "Crown's included. The stairs are the ticket."], [1, "How many stairs?"], [0, "Enough to earn the view."]],
    [[1, "Can I bring my wallet up?"], [0, "Bring it. Nobody will see what's in it."], [1, "Not even you?"], [0, "Especially not me."]],
  ]);
  const guide = P(3, [1.8, -9.4], "Guide", [0, -12.6]);
  const t1 = P(4, [-1.0, -8.6], "Visitor", [0, -12.6]);
  const t2 = P(5, [0.4, -8.2], "Photographer", [0, -12.6]);
  const t3 = P(6, [-2.0, -9.6], "Kid", [0, -12.6]);
  k.chat(f, [guide, t1, t2, t3], [
    [[0, "This is the original torch. A hundred years up there."], [1, "Why did they take it down?"], [0, "It leaked. Glass and rain don't mix."], [3, "Like my phone!"]],
    [[0, "The flame was lit from inside, amber glass."], [2, "No flash, right?"], [0, "No flash. It's shy."], [1, "A torch that's shy. Fitting."]],
    [[3, "Is it gold?"], [0, "Copper and glass. The new one is gold."], [3, "Can I touch it?"], [0, "Absolutely not."]],
  ]);
  const kid = P(7, [-8.4, -4.2], "Kid", [fx, fz]);
  const dad = P(8, [-8.0, -2.0], "Visitor", [fx, fz]);
  k.chat(f, [kid, dad], [
    [[0, "Why doesn't she have a face?"], [1, "She does. It's just private."], [0, "Her eyes are green!"], [1, "Volt green. They light up at night."]],
    [[0, "Was she really this orange?"], [1, "Brand new copper. Like a penny."], [0, "Then she went green?"], [1, "Thirty years outside. Happens to everyone."]],
  ]);
  const reader1 = P(9, [-1.4, -1.6], "Couple", [-2.6, 0]);
  const reader2 = P(10, [-0.6, -2.2], "Couple", [-2.6, -6]);
  k.chat(f, [reader1, reader2], [
    [[0, "No trusted setup at all?"], [1, "None. Halo 2 just... doesn't need one."], [0, "So no one smashed a laptop?"], [1, "Sadly, no."]],
    [[1, "“Your huddled UTXOs yearning to breathe free.”"], [0, "Who wrote that?"], [1, "Emma Lazarus. With some help."]],
  ]);
  void P(11, [8.0, -0.8], "Visitor", [mx, mz], { wander: [[8.0, -0.8], [7.6, -5.2], [3.6, 4.0], [-3.6, 4.4]] });
  void P(12, [-3.6, 6.0], "Vendor", [-7.4, 9.6], { wander: [[-6.2, 8.6], [-4.0, 7.0]] });
}

// ---- voxel pieces (12 voxels a metre, see interior/furniture.ts) --------------------------------------

/** The original torch: bronze handle, gold cup with the ⓩ, gallery and rail, amber-glass flame. */
function torchModel() {
  const W = 52,
    H = 70;
  const m = new VoxelModel(W, H, W);
  const c = W / 2;
  const gold = shades(["#c99a34", "#bf902c", "#d3a63e"], 2, 4);
  const bronze = C("#6a4a24");
  const cyl = (y0: number, y1: number, r: (y: number) => number, p: Paint, hollow = false) => {
    for (let y = y0; y < y1; y++) m.cylinder(c, y, c, r(y), 1, p, hollow);
  };
  cyl(0, 6, () => 7, C("#3a2a18"));
  cyl(6, 18, (y) => 4 + (y - 6) * 0.08, bronze);
  m.cylinder(c, 10, c, 6, 1, gold);
  cyl(18, 33, (y) => 7 + (y - 18) * 0.42, gold);
  // the ⓩ on the cup's front
  const ey = 25,
    ez = c + 11;
  for (let a = -5; a <= 5; a++)
    for (let b = -5; b <= 5; b++) {
      const r2 = a * a + b * b;
      if (r2 > 27) continue;
      const ring = r2 >= 16;
      const zed = (Math.abs(b) === 2 && Math.abs(a) <= 2) || (Math.abs(b) < 2 && a === b);
      if (ring || zed) m.set(c + a, ey + b, ez, C("#f4c84a"));
    }
  // gallery and railing
  m.cylinder(c, 31, c, 22, 1, gold);
  m.cylinder(c, 32, c, 22, 1, C("#8a6a28"), true);
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    m.box(c + Math.cos(a) * 21.3, 32, c + Math.sin(a) * 21.3, c + Math.cos(a) * 21.3 + 1, 37, c + Math.sin(a) * 21.3 + 1, bronze);
  }
  m.cylinder(c, 37, c, 22, 1, gold, true);
  // the flame: amber panes in a copper lattice, lit from inside
  const amber = [E("#ff9a30", 1.05), E("#f07a20", 0.95), E("#ffb347", 1.2)];
  const frame = C("#7a4a24");
  for (let y = 33; y < H; y++) {
    const t = (y - 33) / (H - 33);
    const r = 12 * Math.pow(Math.sin(Math.PI * Math.min(1, 0.22 + t * 0.85)), 0.8) * (1 - t * 0.3);
    for (let z = Math.floor(c - r); z <= c + r; z++)
      for (let x = Math.floor(c - r); x <= c + r; x++) {
        const d = Math.hypot(x + 0.5 - c, z + 0.5 - c);
        const ang = Math.atan2(z - c, x - c);
        const lick = 0.78 + 0.3 * Math.sin(ang * 5 + y * 0.28);
        if (d > r * lick || d < r * lick - 2.2) continue;
        const lattice = y % 6 === 0 || Math.floor(((ang + Math.PI) / (Math.PI * 2)) * 18 + y * 0.03) !== Math.floor(((ang + Math.PI) / (Math.PI * 2)) * 18 + y * 0.03 + 0.12);
        m.set(x, y, z, lattice ? frame : amber[Math.floor(hash(x >> 1, y >> 2, z >> 1, 3) * 3)]);
      }
  }
  return m;
}

/** zkSNARKs #1's hooded face in new copper, full size: the pixel art with a rounded depth. */
function faceModel() {
  const P = 2,
    GW = 26 * P,
    R = 10;
  const D = 28;
  const m = new VoxelModel(GW + 2, GW + 2, D);
  const tones: Record<string, Paint> = {
    a: shades(["#a85a32", "#9e5430"], 1, 1),
    b: shades(["#f0ac80", "#e8a074"], 1, 2),
    c: C("#5e301c"),
    d: shades(["#d4844e", "#cc7c48"], 1, 3),
    e: C("#120a08"),
    f: E(SNARK1_PALETTE.f, 1.4),
  };
  const art = SNARK1.map((r) => r.split(""));
  for (let j = 9; j <= 18; j++) {
    const last = art[j].lastIndexOf("e");
    if (last >= 0 && art[j][last + 1] === ".") art[j][last + 1] = "c";
  }
  // loose pixels (small pieces on their own) float off as cubes
  const comp = new Int32Array(26 * 26).fill(-1);
  const size: number[] = [];
  for (let j = 0; j < 26; j++)
    for (let i = 0; i < 26; i++) {
      if (art[j][i] === "." || comp[i + j * 26] >= 0) continue;
      const id = size.length;
      let n = 0;
      const st = [[i, j]];
      comp[i + j * 26] = id;
      while (st.length) {
        const [a, b] = st.pop()!;
        n++;
        for (const [da, db] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const na = a + da,
            nb = b + db;
          if (na < 0 || nb < 0 || na > 25 || nb > 25 || art[nb][na] === "." || comp[na + nb * 26] >= 0) continue;
          comp[na + nb * 26] = id;
          st.push([na, nb]);
        }
      }
      size.push(n);
    }
  const loose = (i: number, j: number) => size[comp[i + j * 26]] <= 3;
  const filled = (u: number, v: number) => u >= 0 && v >= 0 && u < GW && v < GW && art[Math.floor(v / P)][Math.floor(u / P)] !== "." && !loose(Math.floor(u / P), Math.floor(v / P));
  const zc = 10;
  for (let j = 0; j < 26; j++)
    for (let i = 0; i < 26; i++) {
      if (art[j][i] === "." || !loose(i, j)) continue;
      const z = zc + Math.round((hash(i, j, 5) - 0.5) * 10);
      m.box(i * P + 1, GW - (j + 1) * P + 1, z, i * P + 1 + P, GW - j * P + 1, z + P, tones[art[j][i]]);
    }
  for (let v = 0; v < GW; v++)
    for (let u = 0; u < GW; u++) {
      if (!filled(u, v)) continue;
      const ch = art[Math.floor(v / P)][Math.floor(u / P)];
      let best = R * R;
      for (let b = -R; b <= R; b++) for (let a = -R; a <= R; a++) if (a * a + b * b < best && !filled(u + a, v + b)) best = a * a + b * b;
      const dd = Math.min(R, Math.sqrt(best) - 0.5);
      const hd = Math.sqrt(R * R - (R - dd) * (R - dd));
      let front = zc + Math.round(hd);
      if (ch === "e") front -= 4;
      if (ch === "f") front -= 2;
      const y = GW - 1 - v;
      for (let z = Math.max(0, zc - Math.round(hd * 0.6)); z <= front; z++) m.set(u + 1, y + 1, z, z >= front - 1 ? tones[ch] : tones.a);
    }
  return m;
}

/** A stand of foam crowns, the gift-shop classic. */
function crownStand() {
  const m = new VoxelModel(24, 26, 14);
  m.box(1, 0, 1, 23, 2, 13, C("#3a2e26"));
  m.box(2, 2, 6, 22, 24, 8, C("#4a3a2e"));
  const foam = C("#6fd0a8");
  for (const [x, y] of [
    [4, 6],
    [12, 6],
    [20, 6],
    [8, 14],
    [16, 14],
    [12, 21],
  ]) {
    m.box(x - 3, y, 9, x + 3, y + 2, 11, foam);
    for (let i = -2; i <= 2; i++) m.box(x + i, y + 2, 9, x + i + 1, y + 3 + (2 - Math.abs(i)), 10, foam);
  }
  return m;
}

