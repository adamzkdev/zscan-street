import * as THREE from "three";
import { armchair, coffeeTable, nightstand, sofa } from "../furniture";
import { chandelier, doubleVanity, kingBed, palm, velvetChair } from "../hotel/furniture";
import { ZScan } from "../../data/zscan";
import { F, GOLD, LEVELS, marbleTex, MONO, PAL, paint, SERIF, type ArabKit } from "./kit";

/**
 * The Royal Suite, a duplex on the 25th and 26th floors. Downstairs the salon: marble and gold,
 * a leopard-print carpet, the majlis by the glass, the dining table for ten, the bar and the
 * library, columns with gilt capitals; the spiral staircase in gold and red climbs to the
 * bedroom: the canopy bed facing the city, a mirror in the ceiling, the mosaic jacuzzi, the
 * dressing room. Floor-to-ceiling glass on the city side shows ZStreet from 40 metres up.
 */

const X0 = -12,
  X1 = 12,
  Z0 = -22,
  Z1 = 0;
const H = 4.6;
const STAIR = new THREE.Vector3(8, 0, -11);

/** Walls, floor, coffered ceiling and the glass: the shell both levels share. */
function shell(k: ArabKit, f: number, floorColor: string) {
  const g = k.groups[f];
  const floorMat = new THREE.MeshStandardMaterial({ map: marbleTex(k, floorColor, "#8a7450", 512, 4, 6, 6), roughness: 0.16, metalness: 0.05 });
  k.flat(f, X1 - X0, Z1 - Z0, floorMat, 0, (Z0 + Z1) / 2, 0);
  // a gold-and-blue border inlaid round the room
  const border = new THREE.MeshStandardMaterial({ color: "#1a3a8a", roughness: 0.2 });
  for (const [w, d, x, z] of [
    [X1 - X0 - 1, 0.25, 0, Z0 + 0.6],
    [X1 - X0 - 1, 0.25, 0, Z1 - 0.6],
    [0.25, Z1 - Z0 - 1, X0 + 0.6, (Z0 + Z1) / 2],
    [0.25, Z1 - Z0 - 1, X1 - 0.6, (Z0 + Z1) / 2],
  ] as const)
    k.flat(f, w, d, border, x, z, 0.004);
  // the coffered ceiling: gold beams in a grid, cream panels, a lit cove
  k.plane(f, X1 - X0, Z1 - Z0, new THREE.MeshStandardMaterial({ color: "#1a2a5a", roughness: 0.6 }), 0, H, (Z0 + Z1) / 2, Math.PI / 2);
  for (let x = X0 + 3; x < X1; x += 3) k.box(f, 0.22, 0.3, Z1 - Z0, x, H - 0.3, (Z0 + Z1) / 2, PAL.gold, "metal");
  for (let z = Z0 + 3; z < Z1; z += 3) k.box(f, X1 - X0, 0.3, 0.22, 0, H - 0.3, z, PAL.gold, "metal");
  
  // the city side (-z) and the west side: glass from floor to ceiling between gold mullions
  k.wall(f, X0, Z0, X1, Z0, H, "#a8c8e0", "glass", 0.06);
  k.wall(f, X0, Z0, X0, -8, H, "#a8c8e0", "glass", 0.06);
  for (let x = X0; x <= X1; x += 2) k.box(f, 0.12, H, 0.14, x, 0, Z0, PAL.gold, "metal");
  for (let z = Z0; z <= -8; z += 2) k.box(f, 0.14, H, 0.12, X0, 0, z, PAL.gold, "metal");
  k.box(f, X1 - X0, 0.12, 0.3, 0, 0, Z0, PAL.gold, "metal");
  k.box(f, X1 - X0, 0.2, 0.3, 0, H - 0.2, Z0, PAL.gold, "metal");
  // solid walls: silk in royal blue with gold pilasters
  k.wall(f, X0, -8, X0, Z1, H, "#1a3a8a", "matte", 0.3);
  k.wall(f, X1, Z0, X1, Z1, H, "#1a3a8a", "matte", 0.3);
  k.wall(f, X0, Z1, X1, Z1, H, "#1a3a8a", "matte", 0.3);
  for (let z = Z0 + 2; z < Z1; z += 3) k.box(f, 0.3, H, 0.4, X1 - 0.2, 0, z, PAL.gold, "metal");
  for (let x = X0 + 2; x < X1; x += 3) k.box(f, 0.4, H, 0.3, x, 0, Z1 - 0.2, PAL.gold, "metal");
  k.box(f, 0.1, 0.9, Z1 - Z0, X1 - 0.18, 0, (Z0 + Z1) / 2, "#7a1020", "polish");
  void g;
}


/** Red silk drapes with gold tie-backs along the glass, a pelmet over them. */
function curtains(k: ArabKit, f: number) {
  const silk = "#8a1020";
  for (let x = X0 + 1; x <= X1 - 1; x += 4) {
    for (const dx of [-0.45, 0.45]) {
      k.box(f, 0.5, H - 0.5, 0.18, x + dx, 0, Z0 + 0.35, silk, "matte");
      k.box(f, 0.56, 0.08, 0.24, x + dx, 1.2, Z0 + 0.35, PAL.gold, "metal");
    }
  }
  k.box(f, X1 - X0, 0.4, 0.3, 0, H - 0.5, Z0 + 0.4, PAL.gold, "metal");
  for (let z = Z0 + 3; z <= -9; z += 4) for (const dz of [-0.45, 0.45]) k.box(f, 0.18, H - 0.5, 0.5, X0 + 0.35, 0, z + dz, silk, "matte");
}

/** zkSNARK portraits in gilt frames on a wall, facing `ry`; a click shows who it is. */
function portraits(k: ArabKit, f: number, ids: number[], at: [number, number][], y: number, ry: number) {
  const loader = new THREE.TextureLoader();
  loader.setCrossOrigin("anonymous");
  ids.forEach((id, i) => {
    const [x, z] = at[i];
    const grp = new THREE.Group();
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.5, 0.1), new THREE.MeshStandardMaterial({ color: "#c9982a", metalness: 0.9, roughness: 0.3 }));
    const bg = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2), new THREE.MeshStandardMaterial({ color: ["#1a3a8a", "#7a1020", "#0e5a5a"][id % 3], roughness: 0.9 }));
    bg.position.z = 0.055;
    const t = loader.load(ZScan.zkSnarkImage(id));
    t.colorSpace = THREE.SRGBColorSpace;
    t.magFilter = THREE.NearestFilter;
    const art = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 1.15), new THREE.MeshStandardMaterial({ map: t, transparent: true, alphaTest: 0.5, roughness: 0.8 }));
    art.position.z = 0.06;
    grp.add(frame, bg, art);
    k.add(f, grp, x, y, z, ry);
    k.pick(f, art, `<b>zkSNARK #${id}</b><span>portrait</span>`, () => ({ eyebrow: "Royal Suite · portrait", title: `zkSNARK #${id}`, mono: true, image: ZScan.zkSnarkImage(id), stats: [["zkSNARK", `#${id}`]] }));
  });
}

/** A Persian carpet: red field, blue border, gold medallion. */
function persian(k: ArabKit, f: number, w: number, d: number, x: number, z: number) {
  const t = paint(512, 512, (c, W, Hh) => {
    c.fillStyle = "#7a1020";
    c.fillRect(0, 0, W, Hh);
    c.fillStyle = "#1a2a6a";
    c.fillRect(0, 0, W, 40);
    c.fillRect(0, Hh - 40, W, 40);
    c.fillRect(0, 0, 40, Hh);
    c.fillRect(W - 40, 0, 40, Hh);
    c.strokeStyle = "#d9a92e";
    c.lineWidth = 6;
    c.strokeRect(46, 46, W - 92, Hh - 92);
    c.fillStyle = "#d9a92e";
    c.beginPath();
    c.ellipse(W / 2, Hh / 2, W * 0.22, Hh * 0.16, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#1a2a6a";
    c.beginPath();
    c.ellipse(W / 2, Hh / 2, W * 0.12, Hh * 0.08, 0, 0, Math.PI * 2);
    c.fill();
    for (let i = 0; i < 120; i++) {
      c.fillStyle = ["#d9a92e", "#efe2c4", "#0e5a5a"][i % 3];
      c.fillRect(60 + k.rnd(i, 61) * (W - 120), 60 + k.rnd(i, 62) * (Hh - 120), 6, 6);
    }
  });
  k.flat(f, w, d, new THREE.MeshStandardMaterial({ map: t, roughness: 0.95 }), x, z, 0.01);
}

/** A wall sconce: a gold arm and a lit shade. */
function sconce(k: ArabKit, f: number, x: number, z: number, ry: number) {
  const dx = Math.sin(ry) * 0.12,
    dz = Math.cos(ry) * 0.12;
  k.box(f, 0.08, 0.3, 0.08, x + dx, 2.3, z + dz, PAL.gold, "metal");
  k.cyl(f, 0.12, 0.08, 0.2, x + dx * 2, 2.6, z + dz * 2, "#ffe2b0", "glow", 10);
}

/** The gold spiral staircase with its red carpet: a click takes you up (or down). */
function spiral(k: ArabKit, f: number, to: number, top: boolean) {
  const { x, z } = STAIR;
  const steps = 18;
  const rise = H / steps;
  const goldMat = PAL.gold;
  k.cyl(f, 0.16, 0.16, top ? 1.2 : H, x, 0, z, goldMat, "metal", 16);
  const n = top ? 4 : steps;
  for (let i = 0; i < n; i++) {
    const a = (i / steps) * Math.PI * 2 * 1.1;
    const y = top ? 0 : i * rise;
    const g1 = new THREE.BoxGeometry(1.15, 0.07, 0.42).translate(0.72, 0, 0).rotateY(-a).translate(x, y + rise - 0.035, z);
    k.geo(f, g1, "#efe2c4", "polish");
    const g2 = new THREE.BoxGeometry(1.0, 0.02, 0.36).translate(0.74, 0, 0).rotateY(-a).translate(x, y + rise + 0.01, z);
    k.geo(f, g2, "#9a1424", "matte");
    // a baluster at the outer end of each step
    const px = x + Math.cos(-a) * 1.26,
      pz = z - Math.sin(-a) * 1.26;
    k.cyl(f, 0.025, 0.025, 0.95, px, y + rise, pz, goldMat, "metal", 6);
  }
  if (!top) {
    // the helical handrail
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 60; i++) {
      const a = (i / 60) * Math.PI * 2 * 1.1 * ((steps - 1) / steps);
      pts.push(new THREE.Vector3(x + Math.cos(-a) * 1.26, (i / 60) * (H - rise) + rise + 0.95, z - Math.sin(-a) * 1.26));
    }
    k.geo(f, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 80, 0.04, 6), goldMat, "metal");
  } else {
    // the stairwell's balustrade round the opening upstairs
    k.geo(f, new THREE.TorusGeometry(1.5, 0.04, 6, 40, Math.PI * 1.5).rotateX(Math.PI / 2).rotateY(Math.PI * 0.25).translate(x, 1.0, z), goldMat, "metal");
    for (let i = 0; i < 14; i++) {
      const a = Math.PI * 0.25 + (i / 13) * Math.PI * 1.5;
      k.cyl(f, 0.02, 0.02, 1.0, x + Math.cos(a) * 1.5, 0, z - Math.sin(a) * 1.5, goldMat, "metal", 6);
    }
    // the stairwell: a dark round hole with the steps going down
    const hole = new THREE.Mesh(new THREE.CircleGeometry(1.45, 40), new THREE.MeshBasicMaterial({ color: "#1a1008" }));
    hole.rotation.x = -Math.PI / 2;
    hole.position.set(x, k.y(f) + 0.006, z);
    hole.raycast = () => {};
    k.groups[f].add(hole);
  }
  k.ring(f, x, z, 1.5);
  const L = LEVELS[to];
  k.hit(f, 3, 2.4, 3, x, 0, z, `<b>Spiral staircase</b><span>${top ? "down to the salon" : "up to the bedroom"}</span>`, () => ({ eyebrow: "Royal Suite", title: top ? "Down to the salon" : "Up to the bedroom", floor: to, stats: [["Floor", L.label]] }));
}

/** A leopard-print carpet, the suite's famous touch. */
function leopard(k: ArabKit, f: number, w: number, d: number, x: number, z: number) {
  const t = paint(512, 512, (c, W, Hh) => {
    c.fillStyle = "#d8a050";
    c.fillRect(0, 0, W, Hh);
    for (let i = 0; i < 140; i++) {
      const px = k.rnd(i, 41) * W,
        py = k.rnd(i, 42) * Hh,
        r = 8 + k.rnd(i, 43) * 12;
      c.fillStyle = "#3a2410";
      for (let j = 0; j < 5; j++) {
        const a = (j / 5) * Math.PI * 2 + k.rnd(i, 44);
        c.beginPath();
        c.ellipse(px + Math.cos(a) * r, py + Math.sin(a) * r, 5, 3.5, a, 0, Math.PI * 2);
        c.fill();
      }
      c.fillStyle = "#b07a30";
      c.beginPath();
      c.arc(px, py, r * 0.6, 0, Math.PI * 2);
      c.fill();
    }
    c.strokeStyle = "#d9a92e";
    c.lineWidth = 14;
    c.strokeRect(7, 7, W - 14, Hh - 14);
  });
  k.flat(f, w, d, new THREE.MeshStandardMaterial({ map: t, roughness: 0.95 }), x, z, 0.012);
}

export function salon(k: ArabKit) {
  const f = F.salon;
  shell(k, f, "#f2ece0");
  k.lifts(f, 0, Z1 - 0.15, Math.PI);
  spiral(k, f, F.bedroom, false);

  curtains(k, f);
  persian(k, f, 9, 5, -6.5, -5.5);
  portraits(k, f, [1, 42, 777, 2016], [[-8, Z1 - 0.12], [-4, Z1 - 0.12], [4, Z1 - 0.12], [8, Z1 - 0.12]], 2.2, Math.PI);
  for (const x of [-10, -6, -2, 2, 6, 10]) sconce(k, f, x, Z1 - 0.2, Math.PI);
  for (const z of [-16, -12]) sconce(k, f, X1 - 0.2, z, -Math.PI / 2);
  // the grand piano by the glass, lid up
  {
    const px = 6.5,
      pz = -15.5;
    k.box(f, 1.5, 0.35, 2.2, px, 0.62, pz, "#0a0a0e", "polish");
    k.box(f, 1.5, 0.05, 2.2, px - 0.05, 1.05, pz, "#0a0a0e", "polish", 0);
    k.geo(f, new THREE.BoxGeometry(1.4, 0.04, 2.1).rotateZ(-0.6).translate(px + 0.35, 1.45, pz), "#0a0a0e", "polish");
    k.box(f, 1.4, 0.06, 0.25, px, 0.92, pz + 1.2, "#f4f0e6", "polish");
    for (const [dx, dz] of [[-0.6, -0.9], [0.6, -0.9], [0, 0.9]] as const) k.box(f, 0.12, 0.62, 0.12, px + dx, 0, pz + dz, "#0a0a0e", "polish");
    k.box(f, 0.9, 0.5, 0.4, px, 0, pz + 1.7, "#0a0a0e", "polish");
    k.solid(f, px - 0.8, pz - 1.2, px + 0.8, pz + 1.3);
  }
  // vases of white orchids on gold stands
  for (const [x, z] of [[-9.6, -13], [4.6, -20.4], [-0.6, -8.6]] as const) {
    k.cyl(f, 0.22, 0.28, 0.9, x, 0, z, PAL.gold, "metal", 12);
    k.cyl(f, 0.18, 0.12, 0.4, x, 0.9, z, "#1a3a8a", "polish", 12);
    for (let i = 0; i < 7; i++) k.box(f, 0.12, 0.08, 0.12, x + Math.sin(i * 2.4) * 0.22, 1.3 + (i % 3) * 0.12, z + Math.cos(i * 2.4) * 0.22, "#f8f4ff", "matte");
    k.solid(f, x - 0.3, z - 0.3, x + 0.3, z + 0.3);
  }

  // the majlis by the glass: blue and gold sofas round a leopard carpet
  leopard(k, f, 7, 5, -2, -17);
  k.vox(f, "suite-sofa-blue", () => sofa("#1a3a8a", 4, "#d9a92e"), -2, -14.2, Math.PI);
  k.vox(f, "suite-sofa-gold", () => sofa("#d9a92e", 3, "#9a1424"), -5.6, -17, Math.PI / 2);
  k.vox(f, "suite-sofa-gold", () => sofa("#d9a92e", 3, "#9a1424"), 1.6, -17, -Math.PI / 2);
  k.vox(f, "suite-coffee", () => coffeeTable(), -2, -17);
  k.box(f, 0.5, 0.35, 0.5, -2, 0.42, -17, PAL.gold, "metal");
  k.cyl(f, 0.18, 0.1, 0.25, -2, 0.77, -17, "#e8f4ff", "glass", 10);

  // the dining table for ten with its chandelier
  k.box(f, 4.6, 0.08, 1.5, -6.5, 0.74, -5.5, PAL.walnut, "polish");
  k.box(f, 4.4, 0.7, 0.3, -6.5, 0.04, -5.5, PAL.gold, "metal");
  k.flat(f, 4.2, 0.5, new THREE.MeshStandardMaterial({ color: "#9a1424", roughness: 0.8 }), -6.5, -5.5, 0.83);
  for (let i = 0; i < 5; i++)
    for (const s of [-1, 1]) k.vox(f, "suite-chair", () => velvetChair("#9a1424"), -8.4 + i * 0.95, -5.5 + s * 1.05, s > 0 ? Math.PI : 0, { solid: false });
  k.solid(f, -9, -6.6, -4, -4.4);
  for (let i = 0; i < 6; i++) k.cyl(f, 0.05, 0.03, 0.3, -8.5 + i * 0.8, 0.82, -5.5, "#f4f0e6", "glass", 8);
  k.add(f, chandelier(1.1, 4), -6.5, H - 0.9, -5.5);
  k.add(f, chandelier(1.4, 5), -2, H - 0.9, -17);

  // four columns in marble with gilt capitals
  for (const [x, z] of [
    [-6, -11],
    [3, -11],
    [-6, -2],
    [3, -2],
  ]) {
    k.cyl(f, 0.32, 0.32, H - 0.6, x, 0.3, z, "#efe9de", "polish", 16);
    k.box(f, 0.8, 0.3, 0.8, x, 0, z, PAL.gold, "metal");
    k.cyl(f, 0.32, 0.55, 0.3, x, H - 0.6, z, PAL.gold, "metal", 16);
    k.solid(f, x - 0.4, z - 0.4, x + 0.4, z + 0.4);
  }

  // the bar on the east wall, the library, a palm, art
  k.box(f, 0.7, 1.1, 4, X1 - 1.0, 0, -18, PAL.walnut, "polish");
  k.box(f, 0.8, 0.06, 4.1, X1 - 1.0, 1.1, -18, "#efe2c4", "polish");
  k.box(f, 0.3, 2.0, 4, X1 - 0.35, 1.3, -18, "#1a1008", "polish");
  for (let i = 0; i < 4; i++) k.box(f, 0.32, 0.03, 3.8, X1 - 0.36, 1.55 + i * 0.5, -18, "#ffd890", "glow");
  for (let i = 0; i < 18; i++) k.cyl(f, 0.04, 0.04, 0.3, X1 - 0.35, 1.6 + Math.floor(i / 6) * 0.5, -19.6 + (i % 6) * 0.65, ["#3a8a3a", "#9a1424", "#d9a92e"][i % 3], "glass", 6);
  k.solid(f, X1 - 1.4, -20, X1, -16);
  for (let i = 0; i < 3; i++) k.vox(f, "suite-stool", () => velvetChair("#d9a92e"), X1 - 1.9, -19.2 + i * 1.2, -Math.PI / 2, { solid: false });
  for (let z = -8; z > -14; z -= 1.6) {
    k.box(f, 0.4, 2.6, 1.5, X1 - 0.4, 0, z, PAL.walnut, "polish");
    for (let r = 0; r < 5; r++) for (let b = 0; b < 6; b++) k.box(f, 0.25, 0.32, 0.12, X1 - 0.6, 0.12 + r * 0.5, z - 0.6 + b * 0.22, ["#7a1020", "#1a3a8a", "#2a5a2a", "#d9a92e", "#4a2e1c"][(r + b * 3) % 5], "matte");
  }
  k.solid(f, X1 - 0.7, -14.2, X1, -7.2);
  k.vox(f, "suite-palm", () => palm(4, true), X0 + 1.4, -1.6);
  k.vox(f, "suite-palm", () => palm(9, true), X0 + 1.4, -20.2);

  // the live screen in the private cinema corner: the chain
  const scr = k.screen(f, 3.2, 1.8, (c, W, Hh) => {
    c.fillStyle = "#07060c";
    c.fillRect(0, 0, W, Hh);
    c.fillStyle = GOLD;
    c.font = `700 36px ${SERIF}`;
    c.fillText("ROYAL SUITE · 25", 26, 54);
    c.font = `600 26px ${MONO}`;
    c.fillStyle = "#f6e7c4";
    c.fillText(`Block  #${k.height ? k.height.toLocaleString("en-US") : "…"}`, 26, 120);
    c.fillText(`ZEC    ${k.price ? `$${k.price.toFixed(2)}` : "…"}`, 26, 160);
    c.fillText(`Night  ${k.price ? `${(24000 / k.price).toFixed(1)} ZEC` : "…"}`, 26, 200);
    c.fillStyle = "#7fe3ff";
    c.fillText("Paid from a shielded address", 26, 250);
  }, 5);
  scr.position.set(X1 - 0.2, k.y(f) + 2.2, -3.6);
  scr.rotation.y = -Math.PI / 2;
  k.vox(f, "suite-arm", () => armchair("#9a1424"), 7.2, -3.0, Math.PI / 2);
  k.vox(f, "suite-arm", () => armchair("#9a1424"), 7.2, -4.6, Math.PI / 2);

  // light: chandeliers and the windows' cove
  k.light(f, -2, H - 1.4, -17, "#ffe2b8", 8, 14);
  k.light(f, -6.5, H - 1.4, -5.5, "#ffe2b8", 6, 12);
  k.light(f, 6, H - 2, -14, "#ffd8a0", 5, 12);
  k.light(f, 4, H - 2, -4, "#ffd8a0", 5, 12);

  k.onCast(f, () => {
    void k.person(f, 1201, [1.8, -2.2], "Butler", { face: [0, -1], lines: ["Welcome to the Royal Suite. Two floors, one view, zero records.", "The staircase is 24-carat. Please don't scratch it with your hardware wallet.", "Dinner for ten? I'll set eleven. You never know who's shielded."] });
    const a = k.person(f, 8800, [-3.2, -15.6], "Royal guest", { sit: true, face: [0.4, -1] });
    const b = k.person(f, 6501, [-0.6, -18.6], "Royal guest", { face: [-0.6, 1] });
    k.dialog(f, [a, b], [
      [0, "Seven hundred square metres and I lost my seed phrase."],
      [1, "Did you check under the gold?"],
      [0, "Everything here is gold."],
      [1, "Then it's going to be a long night."],
      [0, "At least nobody can see my balance from up here."],
      [1, "Nobody can see it from anywhere. That's the point."],
    ]);
    void k.person(f, 3456, [X1 - 2.2, -18], "Bartender", { face: [-1, 0], dy: 0, lines: ["A Shielded Sour? Gold flakes, no receipt.", "This whisky is older than Bitcoin. Not older than privacy.", "Ice from the Arctic. Payment from the Orchard."] });
    void k.person(f, 7171, [-9.6, -9.2], "Chef", { wander: [[-9.6, -9.2], [-4.2, -8.2], [-9, -3]], lines: ["The lobster is from the Sapling reef.", "Saffron, gold leaf, and a pinch of zero knowledge."] });
  });
}

export function bedroom(k: ArabKit) {
  const f = F.bedroom;
  shell(k, f, "#f4efe4");
  spiral(k, f, F.salon, true);

  curtains(k, f);
  persian(k, f, 6, 4, 4, -5);
  portraits(k, f, [3141, 8080], [[-6, Z1 - 0.12], [0, Z1 - 0.12]], 2.2, Math.PI);
  for (const x of [-9, -3, 3]) sconce(k, f, x, Z1 - 0.2, Math.PI);
  k.vox(f, "suite-sofa-red", () => sofa("#9a1424", 3, "#d9a92e"), -8, -18.8, Math.PI);

  // the canopy bed facing the city
  const bx = -3,
    bz = -11;
  k.vox(f, "suite-bed", () => kingBed("#9a1424", "#d9a92e"), bx, bz, Math.PI, { k: 0.62 });
  for (const [dx, dz] of [
    [-1.05, -1.0],
    [1.05, -1.0],
    [-1.05, 1.35],
    [1.05, 1.35],
  ]) k.cyl(f, 0.06, 0.06, 2.9, bx + dx, 0, bz + dz, PAL.gold, "metal", 8);
  k.box(f, 2.3, 0.14, 2.55, bx, 2.9, bz + 0.17, PAL.gold, "metal");
  // the drapes, tied back at the posts, and the canopy in red silk
  const drape = new THREE.MeshStandardMaterial({ color: "#8a1020", roughness: 0.7, side: THREE.DoubleSide });
  k.plane(f, 2.2, 2.45, drape, bx, 2.98, bz + 0.17, -Math.PI / 2);
  for (const dx of [-1.12, 1.12]) for (const dz of [-0.9, 1.25]) k.box(f, 0.08, 2.2, 0.3, bx + dx, 0.7, bz + dz, "#8a1020", "matte");
  k.vox(f, "suite-night", () => nightstand(), bx - 1.6, bz + 1.0);
  k.vox(f, "suite-night", () => nightstand(), bx + 1.6, bz + 1.0);
  // the famous mirror in the ceiling over the bed
  k.box(f, 2.6, 0.04, 2.9, bx, H - 0.06, bz + 0.17, "#e8eef4", "metal");
  leopard(k, f, 4, 3, bx, bz - 2.8);
  k.add(f, chandelier(0.9, 3), bx, H - 0.7, bz - 3.6);

  // the bath: a round jacuzzi in blue and gold mosaic, a double vanity, a rain shower in glass
  const jx = 6.5,
    jz = -18.5;
  const mosaic = paint(256, 256, (c, W) => {
    for (let i = 0; i < 32; i++)
      for (let j = 0; j < 32; j++) {
        c.fillStyle = ["#1a5aaa", "#2a7ac8", "#18a0b0", "#d9a92e", "#0e3a7a"][Math.floor(k.rnd(i, j, 51) * (k.rnd(i, j, 52) < 0.08 ? 5 : 3)) + (k.rnd(i, j, 52) < 0.08 ? 0 : 0)];
        c.fillRect(i * 8, j * 8, 7, 7);
      }
    void W;
  });
  k.flat(f, 6, 6, new THREE.MeshStandardMaterial({ map: mosaic, roughness: 0.3 }), jx - 0.5, jz + 0.5, 0.01);
  k.cyl(f, 1.6, 1.6, 0.6, jx, 0, jz, "#1a5aaa", "polish", 40);
  k.cyl(f, 1.65, 1.65, 0.08, jx, 0.6, jz, PAL.gold, "metal", 40);
  const water = new THREE.Mesh(new THREE.CircleGeometry(1.45, 40), new THREE.MeshStandardMaterial({ color: "#3ac0e8", emissive: "#1a7aa8", emissiveIntensity: 0.8, roughness: 0.05 }));
  water.rotation.x = -Math.PI / 2;
  water.position.set(jx, k.y(f) + 0.62, jz);
  water.raycast = () => {};
  k.groups[f].add(water);
  k.cyl(f, 0.06, 0.06, 0.5, jx + 1.5, 0.6, jz, PAL.gold, "metal", 8);
  k.ring(f, jx, jz, 1.7);
  const bubbles = new THREE.InstancedMesh(new THREE.SphereGeometry(0.04, 6, 4), new THREE.MeshBasicMaterial({ color: "#e8fbff", transparent: true, opacity: 0.8 }), 40);
  bubbles.raycast = () => {};
  k.groups[f].add(bubbles);
  const bm = new THREE.Matrix4();
  k.ticks[f].push((_dt, t) => {
    for (let i = 0; i < 40; i++) {
      const a = i * 2.4 + t * 0.4;
      const r = 0.2 + ((i * 0.37) % 1) * 1.1;
      bm.makeTranslation(jx + Math.cos(a) * r, k.y(f) + 0.63 + Math.abs(Math.sin(t * 3 + i)) * 0.04, jz + Math.sin(a) * r);
      bubbles.setMatrixAt(i, bm);
    }
    bubbles.instanceMatrix.needsUpdate = true;
  });
  k.vox(f, "suite-vanity", () => doubleVanity(), X1 - 0.8, -14.5, -Math.PI / 2);
  k.box(f, 0.05, 1.6, 2.4, X1 - 0.2, 1.1, -14.5, "#e8eef4", "metal");
  k.hit(f, 3.4, 1, 3.4, jx, 0, jz, `<b>Jacuzzi</b><span>mosaic of 24-carat gold and lapis</span>`, () => ({ eyebrow: "Royal Suite", title: "The jacuzzi", stats: [["Tiles", "40,000"], ["Gold", "24 ct"], ["View", "the bay"]] }));
  k.hit(f, 2.4, 1.2, 2.8, bx, 0, bz, `<b>The canopy bed</b><span>it faces ZStreet</span>`, () => ({ eyebrow: "Royal Suite", title: "The canopy bed", stats: [["Silk", "Hermès-red"], ["Mirror", "in the ceiling"], ["Height", `${LEVELS[f].view} m`]] }));
  // a dressing room along the east wall
  for (let z = -3; z > -9; z -= 1.5) {
    k.box(f, 0.6, 2.6, 1.4, X1 - 0.45, 0, z, PAL.walnut, "polish");
    k.box(f, 0.02, 2.2, 1.2, X1 - 0.76, 0.2, z, "#d9a92e", "metal");
  }
  k.solid(f, X1 - 0.8, -9.8, X1, -2.2);
  k.vox(f, "suite-arm", () => armchair("#d9a92e"), -8.6, -18.6, Math.PI * 0.8);
  k.vox(f, "suite-arm", () => armchair("#d9a92e"), -6.6, -19.4, Math.PI * 1.1);
  k.vox(f, "suite-palm", () => palm(12, true), X0 + 1.4, -1.6);

  k.light(f, bx, H - 1.0, bz - 2, "#ffe2b8", 7, 14);
  k.light(f, jx, H - 1.0, jz, "#bfe8ff", 8, 10);
  k.light(f, 5, H - 2, -6, "#ffd8a0", 5, 12);

  k.onCast(f, () => {
    void k.person(f, 2222, [bx + 2.4, bz - 1.6], "Butler", { face: [-1, -0.3], lines: ["The bed turns towards the city at sunset. Like a good wallet: slowly, privately.", "Your pillow menu: seventeen kinds. All shielded.", "The ceiling mirror is for… checking your posture, sir."] });
    void k.person(f, 9090, [jx - 2.2, jz + 1.2], "Spa therapist", { face: [1, -0.3], lines: ["Bath salts from the Dead Sea, gold flakes from the Reserve.", "Relax. Your keys are in the safe, your notes are in the chain."] });
  });
}
