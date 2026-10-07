import * as THREE from "three";
import { fitText } from "../../scene/fit";
import { hash } from "../../scene/voxel/model";
import * as F from "../furniture";
import { box, glowMat, std } from "../kit";
import { GOLD, LEVELS, MONO, NeedleKit, fmt, makeCanvas } from "./kit";
import * as P from "./props";

const X0 = -14,
  X1 = 14,
  Z0 = -11,
  Z1 = 11;

/** Pale oak planks. */
function oak() {
  const { t } = makeCanvas(256, 256, (g) => {
    for (let j = 0; j < 16; j++) {
      const off = hash(j, 1, 5) * 256;
      for (let i = -1; i < 2; i++) {
        g.fillStyle = ["#c8b08a", "#c2a882", "#ceb690", "#bea47e"][Math.floor(hash(j, i, 6) * 4)];
        g.fillRect(off + i * 256, j * 16, 256, 16);
        g.fillStyle = "rgba(60,40,20,0.25)";
        g.fillRect(off + i * 256, j * 16, 2, 16);
      }
      g.fillStyle = "rgba(60,40,20,0.2)";
      g.fillRect(0, j * 16, 256, 1);
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(7, 5.5);
  return t;
}

/** 11 — ZEC Residences, Suite 1101 at 40 m: a full-floor apartment, Armani-like — stone, oak,
 *  bronze — glass all round: living room, dining, kitchen, the master bedroom, a bath at the glass. */
export function residence(k: NeedleKit) {
  const f = 1,
    g = k.groups[f],
    y = LEVELS[f].y,
    h = LEVELS[f].h;
  const c = 3.5;
  // floor, ceiling with a cove, glass on four sides
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(X1 - X0, Z1 - Z0), new THREE.MeshStandardMaterial({ map: oak(), roughness: 0.45 }));
  fl.rotation.x = -Math.PI / 2;
  fl.position.y = y;
  g.add(fl);
  box(g, X1 - X0, 0.15, Z1 - Z0, std("#e8e2d8", 0.9), 0, y + h, 0);
  for (const [w, d, x, z] of [[X1 - X0 - 1, 0.05, 0, Z0 + 0.5], [X1 - X0 - 1, 0.05, 0, Z1 - 0.5], [0.05, Z1 - Z0 - 1, X0 + 0.5, 0], [0.05, Z1 - Z0 - 1, X1 - 0.5, 0]] as const) box(g, w, 0.04, d, glowMat("#ffe2b0", 1.2), x, y + h - 0.06, z);
  const sides: [number, number, number, number][] = [
    [X0, Z0, X1, Z0],
    [X1, Z0, X1, Z1],
    [X0, Z1, X1, Z1],
    [X0, Z0, X0, Z1],
  ];
  for (const [x0, z0, x1, z1] of sides) {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const p = new THREE.Mesh(new THREE.PlaneGeometry(len, h), k.glass);
    p.position.set((x0 + x1) / 2, y + h / 2, (z0 + z1) / 2);
    p.rotation.y = x0 === x1 ? Math.PI / 2 : 0;
    p.raycast = () => {};
    g.add(p);
    const n = Math.round(len / 2);
    for (let i = 0; i <= n; i++) box(g, 0.08, h, 0.08, k.mullion, x0 + ((x1 - x0) * i) / n, y, z0 + ((z1 - z0) * i) / n);
    const along = x0 === x1 ? [0.1, len] : [len, 0.1];
    box(g, along[0], 0.1, along[1], k.bronze, (x0 + x1) / 2, y, (z0 + z1) / 2);
    k.rects[f].push([Math.min(x0, x1) - 0.15, Math.min(z0, z1) - 0.15, Math.max(x0, x1) + 0.15, Math.max(z0, z1) + 0.15]);
  }
  k.core(f, c, new THREE.MeshStandardMaterial({ color: "#d6ccbc", roughness: 0.4 }));
  // sheer curtains gathered at the corners
  for (const [x, z, r] of [[X0 + 0.4, Z1 - 0.3, 0], [X1 - 0.6, Z1 - 0.3, 0], [X0 + 0.3, Z0 + 0.4, Math.PI / 2], [X1 - 0.3, Z0 + 0.6, -Math.PI / 2]] as const) k.put(f, "nCurtain", () => F.curtain("#e8e0d0", h - 0.1), x, z, r, { solid: false });

  // ---- living room (south): a sofa and armchairs round a rug, the TV, a piano in the corner
  k.put(f, "nRugLiving", () => F.rug(6.4, 4.6, "#cfc4b0", "#8a6a3a"), -3.4, 7.2, 0, { solid: false });
  k.put(f, "nSofaSand", () => F.sofa("#d8ccb4", 3, "#8a6a3a"), -3.4, 9.4, Math.PI);
  k.put(f, "nArmBronze", () => F.armchair("#6a4a2a"), -6.4, 7.0, Math.PI / 2);
  k.put(f, "nArmBronze", () => F.armchair("#6a4a2a"), -0.4, 7.0, -Math.PI / 2);
  k.put(f, "coffee", F.coffeeTable, -3.4, 7.2);
  k.put(f, "nSideLamp", P.sideLamp, -5.6, 9.6);
  k.put(f, "nSideLamp", P.sideLamp, -1.2, 9.6);
  k.put(f, "nTV", () => F.tvUnit(26), -3.4, 4.6, 0);
  const tv = k.screen(f, 2.0, 1.1, (gc, W, H) => {
    gc.fillStyle = "#06050a";
    gc.fillRect(0, 0, W, H);
    const p = k.price;
    gc.fillStyle = "#c9b48a";
    gc.font = `700 24px ${MONO}`;
    gc.fillText("ZEC / USD", 20, 40);
    if (p) {
      gc.fillStyle = "#f4ecd8";
      gc.font = `800 56px ${MONO}`;
      gc.fillText(`$${p.usd.toFixed(2)}`, 20, 104);
      const hs = p.history.map((q) => q[1]);
      const lo = Math.min(...hs),
        hi = Math.max(...hs);
      gc.strokeStyle = GOLD;
      gc.lineWidth = 3;
      gc.beginPath();
      hs.forEach((v, i) => {
        const px = 20 + ((W - 40) * i) / Math.max(1, hs.length - 1),
          py = H - 20 - ((H - 150) * (v - lo)) / (hi - lo || 1);
        if (i) gc.lineTo(px, py);
        else gc.moveTo(px, py);
      });
      gc.stroke();
    }
    gc.fillStyle = "#8a7a5a";
    gc.font = `600 20px ${MONO}`;
    gc.textAlign = "right";
    fitText(gc, k.height ? `#${fmt(k.height)}` : "", W - 20, 40);
    gc.textAlign = "left";
  }, 2);
  tv.position.set(-3.4, y + 1.5, 4.5);
  k.put(f, "piano", F.grandPiano, X0 + 2.4, Z1 - 2.2, Math.PI * 0.8);
  k.put(f, "nPalmR", () => P.palmTree(7), X1 - 1.2, Z1 - 1.2);
  // a reading corner at the south-west glass, a sculpture on a plinth
  k.put(f, "nArmCream", () => F.armchair("#e8dcc4"), X0 + 1.4, 4.6, Math.PI * 0.75);
  k.put(f, "nArmCream", () => F.armchair("#e8dcc4"), X0 + 3.4, 3.4, Math.PI * 1.05);
  k.put(f, "nSideLamp", P.sideLamp, X0 + 1.0, 3.0);
  k.put(f, "floorLamp", F.floorLamp, X0 + 0.7, 6.0);
  k.put(f, "nRugRead", () => F.rug(3.2, 2.6, "#8a6a3a", "#e8dcc4"), X0 + 2.4, 4.2, 0.3, { solid: false });
  k.put(f, "nPlinthR", () => P.plinth(0.35), 2.6, 9.6);
  const orb = new THREE.Mesh(new THREE.TorusKnotGeometry(0.22, 0.06, 64, 8), k.gold);
  orb.position.set(2.6, y + 1.12, 9.6);
  g.add(orb);
  k.ticks[f].push((dt) => (orb.rotation.y += dt * 0.4));
  k.put(f, "plantR", () => F.plant("ficus", 12), 0.9, 10.2);
  void k.person(f, 5151, [-3.0, 9.35], "Resident", { sit: true, dy: 0.42, face: new THREE.Vector3(0, 0, -1), phone: true });

  // ---- dining (east): a table for eight under a bronze pendant line, the champagne trolley
  k.put(f, "nDining8", () => F.diningTable(8), 8.6, 2.6, Math.PI / 2);
  for (let i = 0; i < 4; i++) {
    const z = 1.6 + i * 0.66;
    k.put(f, "nDchair", () => P.velvetChair("#8a7a5a"), 7.8, z - 0.4, Math.PI / 2, { solid: false });
    k.put(f, "nDchair", () => P.velvetChair("#8a7a5a"), 9.4, z - 0.4, -Math.PI / 2, { solid: false });
  }
  for (let i = 0; i < 3; i++) F.place(g, "nPendantB", () => F.pendant(1.3, "#ffd8a0"), 8.6, y + h - 1.3, 1.6 + i * 0.9, 0);
  k.put(f, "nCart", P.champagneCart, 11.8, 5.6, -0.4);
  void k.person(f, 5252, [10.8, 6.6], "Butler", { face: new THREE.Vector3(-1, 0, 0), wander: [[10.8, 6.6], [6, 6], [2, 5.4], [8, -2]] });

  // ---- kitchen (north-east): the run along the glass side, an island, the fridge
  k.put(f, "nKitchen", () => F.kitchen(4.8, "#e8e2d8", "#2a2228"), 8.8, Z0 + 0.7, 0);
  k.put(f, "nIsland", () => F.kitchen(3.0, "#4a3020", "#f2eee6"), 8.8, -6.6, Math.PI);
  k.put(f, "fridge", F.fridge, 12.6, Z0 + 0.7, 0);
  for (let i = 0; i < 3; i++) k.put(f, "nStoolK", () => F.stool("#c9a227"), 7.8 + i * 1.0, -5.5, 0, { solid: false });

  // ---- the master bedroom (west), behind a stone wall with a door; the bath at the glass
  const wallMat = std("#d6ccbc", 0.6);
  k.rects[f].push(...wallXZ(g, -c - 0.1, 1.5, X0, 1.5, h, wallMat, y, [-8.2, -6.8]));
  k.put(f, "nBed", () => F.bed("#e8e0d0", "#8a6a3a"), -9.8, -4.0, Math.PI / 2);
  k.put(f, "nightstand", F.nightstand, -10.6, -5.6, Math.PI / 2);
  k.put(f, "nightstand", F.nightstand, -10.6, -2.4, Math.PI / 2);
  k.put(f, "nWardrobe", () => F.wardrobe("#4a3020"), -5.2, -1.0 + 0.3, Math.PI);
  k.put(f, "nRugBed", () => F.rug(3.4, 4.4, "#e8e0d0", "#8a6a3a"), -8.6, -4.0, 0, { solid: false });
  // the bath and the vanity in the north-west corner
  k.put(f, "nTub", P.stoneTub, -11.6, -9.4, 0);
  k.put(f, "nVanity", () => F.vanity("#4a3020"), -6.6, Z0 + 0.5, 0);
  k.put(f, "plantB", () => F.plant("monstera", 13), X0 + 0.8, Z0 + 0.8);
  for (let i = 0; i < 2; i++) F.place(g, "sconceB", () => F.sconce("#ffe2b0"), -10.6, y + 1.5, -6.5 + i * 5, Math.PI / 2);

  // ---- the study (north, behind the core): a desk facing the glass, a bookcase
  k.put(f, "nDesk", () => F.desk(4), 0, -8.4, Math.PI);
  k.put(f, "nChairD", () => F.chair("#2a2228", true), 0, -7.6, Math.PI, { solid: false });
  k.put(f, "nShelf", () => F.bookshelf(4, 20), 0, -c - 0.25, Math.PI);
  const mon = k.screen(f, 0.7, 0.4, (gc, W, H) => {
    gc.fillStyle = "#0a0910";
    gc.fillRect(0, 0, W, H);
    gc.fillStyle = "#3ee08f";
    gc.font = `700 30px ${MONO}`;
    fitText(gc, "Shielded balance", 20, 46);
    gc.fillStyle = "#f4ecd8";
    gc.font = `800 44px ${MONO}`;
    fitText(gc, "•••••• ZEC", 20, 110);
    gc.fillStyle = "#8a7a5a";
    gc.font = `600 22px ${MONO}`;
    fitText(gc, k.height ? `synced #${fmt(k.height)}` : "syncing…", 20, H - 30);
  }, 3);
  mon.position.set(0, y + 1.05, -8.75);
  mon.rotation.y = Math.PI;

  // the suite's plate by the lift
  k.label(f, "SUITE 1101", -2.3, 1.6, c + 0.06, { h: 0.2, color: GOLD });
  k.hit(f, 6, 1.2, 4, -3.4, 7.2, 0, "<b>Suite 1101</b><span>ZEC Residences</span>", () => ({
    eyebrow: "ZEC Residences · L11",
    title: "Suite 1101",
    stats: [
      ["Area", "616 m²"],
      ["Altitude", "40 m"],
      ["Bedrooms", "1 + study"],
      ["Price", k.price ? `${fmt(9_800_000 / k.price.usd)} ZEC` : "…"],
    ],
  }));
  k.light(f, -3.4, 7.2, "#ffe2b8", 9, -0.4, 14);
  k.light(f, 8.6, 1.6, "#ffd8a8", 8, -0.4, 14);
  k.light(f, -8.8, -5.0, "#ffd8b0", 7, -0.4, 12);
  k.light(f, 8.8, -8.0, "#fff0e0", 6, -0.4, 10);
}

/** A straight wall along x or z with an optional doorway [from, to]; returns one collider per run. */
function wallXZ(g: THREE.Object3D, x0: number, z0: number, x1: number, z1: number, h: number, mat: THREE.Material, y: number, gap?: [number, number]): [number, number, number, number][] {
  const lo = Math.min(x0, x1),
    hi = Math.max(x0, x1);
  const runs: [number, number][] = gap ? [[lo, gap[0]], [gap[1], hi]] : [[lo, hi]];
  for (const [a, b] of runs) box(g, b - a, h, 0.14, mat, (a + b) / 2, y, z0);
  if (gap) box(g, gap[1] - gap[0], h - 2.3, 0.14, mat, (gap[0] + gap[1]) / 2, y + 2.3, z0);
  void z1;
  return runs.map(([a, b]) => [a, z0 - 0.1, b, z0 + 0.1] as [number, number, number, number]);
}
