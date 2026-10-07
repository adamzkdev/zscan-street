import * as THREE from "three";
import { backBar, barCounter, stool } from "../../furniture";
import { cabana, palm, teakLounger } from "../../hotel/furniture";
import { drawBlocks, drawTicker, paint, type SkyKit } from "../kit";
import { creepers, djBooth, drawSapling, eggChair, GREEN, LIFT, meshScreen, oakTex, saplingInfo, SAP } from "./parts";
import { soloist } from "../../music/acts";

/**
 * R — the rooftop, 110 m up: an infinity pool the width of the tower along its front, glowing
 * turquoise, its water running out to the edge and the city beyond; a teak deck with loungers,
 * cabanas and palms; the sky bar under its pergola at the back, a DJ, a fire-pit lounge; round the
 * back and the sides the facade's red mesh rises into the open lattice crown, thick with creepers.
 * Every new block sets off a burst of green and gold fireworks over the marina.
 */

const f = 4;
const X0 = -14,
  X1 = 14,
  Z0 = -28;
const PZ = -9.6; // the pool's back edge

export function rooftop(k: SkyKit) {
  const g = k.groups[f];
  const y0 = k.y(f);

  // ---- deck --------------------------------------------------------------------------------------
  k.flat(f, 28, PZ - Z0, new THREE.MeshStandardMaterial({ map: oakTex(7, 5, "#a87a4c"), roughness: 0.75 }), 0, (Z0 + PZ) / 2, 0);
  k.box(f, 28.6, 0.6, PZ - Z0 + 0.3, 0, -0.62, (Z0 - 0.3 + PZ) / 2, SAP.stone);

  // ---- the infinity pool ------------------------------------------------------------------------
  const caustic = paint(256, 256, (c, W, Hh) => {
    c.fillStyle = "#1fa8c0";
    c.fillRect(0, 0, W, Hh);
    c.strokeStyle = "rgba(220,255,255,0.45)";
    c.lineWidth = 2;
    for (let i = 0; i < 40; i++) {
      c.beginPath();
      const cx = (i * 61) % W,
        cy = (i * 97) % Hh;
      for (let a = 0; a <= 7; a++) c.lineTo(cx + Math.cos(a) * (14 + (i % 5) * 4), cy + Math.sin(a * 1.3) * (10 + (i % 3) * 5));
      c.stroke();
    }
  }, 6, 2);
  const water = new THREE.MeshStandardMaterial({ map: caustic, color: "#9ff0ff", roughness: 0.08, metalness: 0.1, emissive: new THREE.Color("#1ab8d0"), emissiveIntensity: 0.55, transparent: true, opacity: 0.88, depthWrite: false });
  const pw = 26.4,
    pd = -PZ;
  k.box(f, pw, 0.05, pd, 0, -1.45, PZ / 2, "#2ab8d0", "glow");
  k.box(f, 0.3, 1.45, pd, -pw / 2 - 0.15, -1.45, PZ / 2, "#e8f4f4", "polish");
  k.box(f, 0.3, 1.45, pd, pw / 2 + 0.15, -1.45, PZ / 2, "#e8f4f4", "polish");
  k.box(f, pw, 1.45, 0.3, 0, -1.45, PZ - 0.15, "#e8f4f4", "polish");
  const wplane = k.flat(f, pw, pd, water, 0, PZ / 2, -0.12);
  wplane.renderOrder = 3;
  k.ticks[f].push((dt) => {
    caustic.offset.x += dt * 0.015;
    caustic.offset.y -= dt * 0.025;
  });
  // the coping round three sides; the front has none: the water runs to the edge
  k.box(f, pw + 0.9, 0.12, 0.45, 0, -0.1, PZ - 0.2, SAP.stone, "polish");
  for (const s of [-1, 1]) k.box(f, 0.45, 0.12, pd, s * (pw / 2 + 0.2), -0.1, PZ / 2, SAP.stone, "polish");
  // the overflow lip, its glow, the glass balustrade beyond it (set lower, out of the eye line)
  k.box(f, pw + 0.6, 0.04, 0.12, 0, -0.16, -0.06, "#bff8ff", "glow");
  k.box(f, pw + 0.6, 0.55, 0.3, 0, -0.75, 0.25, "#d8e4e4", "polish");
  k.box(f, pw + 0.6, 0.02, 0.24, 0, -0.22, 0.25, "#7ff0ff", "glow");
  k.solid(f, -pw / 2 - 0.45, PZ - 0.45, pw / 2 + 0.45, 0.4);
  // underwater lights along the back wall
  for (let x = -12; x <= 12; x += 3) k.box(f, 0.3, 0.12, 0.04, x, -0.7, PZ + 0.02, "#e8ffff", "glow");
  // sides of the deck by the pool: glass balustrades
  for (const s of [-1, 1]) {
    k.box(f, 0.04, 1.1, 10, s * 14, 0, -5, "#cfe8e8", "glass");
    k.box(f, 0.12, 0.08, 10, s * 14, 1.1, -5, SAP.teak);
    k.line(f, s * 14, 0, s * 14, -10, 0.3);
  }

  // ---- the crown: the red mesh lattice round the back and sides, creepers -----------------------
  meshScreen(k, f, X0, Z0, X1, Z0, 9, 101, 0, 0.55);
  meshScreen(k, f, X0, Z0, X0, -10, 9, 102, 0, 0.55);
  meshScreen(k, f, X1, -10, X1, Z0, 9, 103, 0, 0.55);
  k.line(f, X0, Z0, X1, Z0);
  k.line(f, X0, Z0, X0, -10);
  k.line(f, X1, -10, X1, Z0);
  for (const [x, z] of [[X0, Z0], [X1, Z0], [X0, -10], [X1, -10]] as const) k.box(f, 0.5, 9.4, 0.5, x, 0, z, "#9a2430");
  // its lit top edge
  k.box(f, 28, 0.06, 0.06, 0, 9.1, Z0, GREEN, "glow");
  for (const s of [-1, 1]) k.box(f, 0.06, 0.06, 18, s * 14, 9.1, -19, GREEN, "glow");
  creepers(k, f, X0 + 0.3, Z0 + 0.2, X1 - 0.3, Z0 + 0.2, 9, 3.5, 104, 0.2);

  // ---- the lift core at the back left ---------------------------------------------------------
  {
    const x0 = -14,
      x1 = -7,
      z1 = -23;
    k.wall(f, x0, z1, x1, z1, 4.6, "#e8e0d0", "matte", 0.3);
    k.wall(f, x1, Z0, x1, z1, 4.6, SAP.oakDark, "matte", 0.3);
    k.box(f, 7.4, 0.3, 5.4, (x0 + x1) / 2, 4.6, (Z0 + z1) / 2, SAP.oakDark);
    for (let z = Z0 + 0.2; z < z1; z += 0.3) k.box(f, 0.05, 4.6, 0.12, x1 + 0.17, 0, z, SAP.oak);
    k.lifts(f, -10.5, z1 + 0.16, 0, LIFT);
    k.label(f, "ROOFTOP · 110 m", -10.5, 4.4, z1 + 0.18, { h: 0.34, color: GREEN });
  }

  // ---- loungers, umbrellas, palms, cabanas -----------------------------------------------------
  for (let i = 0; i < 7; i++) {
    const x = -10.2 + i * 3.4;
    k.vox(f, "sap-lounger", () => teakLounger(i % 2 ? "#5cff9a" : "#f4f0e8"), x, -11.9, Math.PI);
    if (i % 2 === 0 && i < 6) {
      k.cyl(f, 0.04, 0.04, 2.4, x + 1.7, 0, -12.6, "#e8e2d4", "matte", 6);
      k.geo(f, new THREE.ConeGeometry(1.5, 0.5, 10).translate(x + 1.7, 2.55, -12.6), i % 4 ? "#f4f0e4" : "#2a8a5a");
    }
  }
  for (const [x, z, s] of [[-12.4, -11.2, 1], [12.4, -11.2, 2], [-12.4, -20.6, 3], [5.4, -19.6, 4]] as const) k.vox(f, `sap-palm${s}`, () => palm(s + 50), x, z, s);
  k.vox(f, "sap-cabana", () => cabana("#2a8a5a"), 11.8, -15.6, -Math.PI / 2);
  k.vox(f, "sap-cabana", () => cabana("#2a8a5a"), 11.8, -19.6, -Math.PI / 2);
  // the fire-pit lounge
  k.cyl(f, 0.7, 0.7, 0.4, -6.4, 0, -16.4, "#3a3a3a", "matte", 16);
  k.cyl(f, 0.55, 0.55, 0.02, -6.4, 0.4, -16.4, "#ff8a3a", "glow", 16);
  for (let i = 0; i < 6; i++) k.box(f, 0.06, 0.18 + (i % 3) * 0.08, 0.06, -6.4 + Math.cos(i) * 0.3, 0.4, -16.4 + Math.sin(i) * 0.3, i % 2 ? "#ffd04a" : "#ff6a2a", "glow");
  k.solid(f, -7.1, -17.1, -5.7, -15.7);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    k.vox(f, "sap-egg-r", () => eggChair("#efe8da"), -6.4 + Math.sin(a) * 2.1, -16.4 + Math.cos(a) * 2.1, a + Math.PI);
  }

  // ---- the sky bar under its pergola ------------------------------------------------------------
  {
    const bx = 1,
      bz0 = -27.6,
      bz1 = -21.4;
    k.vox(f, "sap-backbar", () => backBar(7), bx, bz0 + 0.3, 0);
    k.vox(f, "sap-bar", () => barCounter(7, GREEN), bx, -23.2, Math.PI);
    k.box(f, 7.2, 0.04, 0.5, bx, 1.05, -22.95, SAP.oak, "polish");
    for (let i = 0; i < 6; i++) k.vox(f, "sap-bstool", () => stool("#2f4a3a"), bx - 2.9 + i * 1.15, -22.2, 0, { solid: false });
    // the pergola: posts, slats, creepers on it, string lights under
    for (const x of [bx - 4.2, bx + 4.2]) for (const z of [bz0 + 0.2, bz1]) k.box(f, 0.22, 3.4, 0.22, x, 0, z, SAP.teak);
    for (let x = bx - 4.3; x <= bx + 4.3; x += 0.45) k.box(f, 0.1, 0.18, bz1 - bz0 + 0.6, x, 3.4, (bz0 + bz1) / 2, SAP.teak);
    creepers(k, f, bx - 4.2, bz1 + 0.2, bx + 4.2, bz1 + 0.2, 3.4, 1.0, 111, 0.2);
    for (let r = 0; r < 4; r++) {
      const z = bz0 + 1 + r * 1.6;
      for (let i = 0; i <= 16; i++) {
        const t = i / 16;
        k.box(f, 0.08, 0.08, 0.08, bx - 4.2 + t * 8.4, 3.2 - Math.sin(t * Math.PI) * 0.4, z, i % 2 ? "#fff0c0" : "#ffd28a", "glow");
      }
    }
    k.label(f, "SAPLING SKY BAR", bx, 3.0, bz1 + 0.12, { h: 0.34, color: GREEN });
    const s = k.screen(f, 2.4, 1.35, (c, W, Hh) => drawBlocks(c, W, Hh, k.blocks, { accent: GREEN, bg: "#05080a" }), 4);
    s.position.set(bx - 1.4, y0 + 2.6, bz0 + 0.42);
    const t = k.screen(f, 1.5, 0.84, (c, W, Hh) => drawTicker(c, W, Hh, { bg: "#08120c" }), 6, 256);
    t.position.set(bx + 1.8, y0 + 2.85, bz0 + 0.42);
    const sp = k.screen(f, 1.5, 0.84, (c, W, Hh) => drawSapling(c, W, Hh), 10, 384);
    sp.position.set(bx + 1.8, y0 + 1.95, bz0 + 0.42);
    k.hit(f, 1.5, 0.84, 0.1, bx + 1.8, 1.53, bz0 + 0.45, "<b>Sapling pool</b><span>ZEC shielded in Sapling</span>", saplingInfo);
  }

  // ---- the DJ ------------------------------------------------------------------------------------
  // a saxophonist by the sky bar (a real recording, heard from where he plays: src/interior/music)
  soloist(g, "sax", { x: -5.6, y: y0, z: -22.4, yaw: 0.3 }, { place: "tower-sapling", floor: f, track: "sax-park", id: 4420, role: "Saxophonist", level: 0.85 });
  k.solid(f, -6.0, -22.8, -5.2, -22.0);
  k.vox(f, "sap-dj", () => djBooth(), 9.2, -25.2, 0);
  for (const x of [7.4, 11.0]) {
    k.box(f, 0.7, 1.6, 0.6, x, 0, -26.2, "#1a1a20", "matte");
    k.cyl(f, 0.22, 0.22, 0.04, x, 1.0, -25.88, "#3a3a44", "metal", 14, 0);
  }
  k.solid(f, 7.0, -26.6, 11.4, -24.7);
  const beams: THREE.Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.5, 9, 10, 1, true).translate(0, 4.5, 0), new THREE.MeshBasicMaterial({ color: [GREEN, "#ff4ad8", "#3ef0ff"][i], transparent: true, opacity: 0.14, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
    m.position.set(8 + i * 1.2, y0 + 1.6, -25.6);
    m.raycast = () => {};
    g.add(m);
    beams.push(m);
  }
  k.ticks[f].push((_dt, t) => beams.forEach((b, i) => b.rotation.set(Math.sin(t * 0.8 + i * 2) * 0.6, 0, Math.cos(t * 0.6 + i) * 0.5)));

  // ---- fireworks on every block -----------------------------------------------------------------
  const N = 140;
  const spark = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), new THREE.MeshBasicMaterial({ toneMapped: false, transparent: true, depthWrite: false }), N);
  spark.frustumCulled = false;
  spark.raycast = () => {};
  const vel = Array.from({ length: N }, (_, i) => new THREE.Vector3(k.rnd(i, 1) - 0.5, k.rnd(i, 2) - 0.3, k.rnd(i, 3) - 0.5).normalize().multiplyScalar(9 + k.rnd(i, 4) * 6));
  const cols = [new THREE.Color(GREEN).multiplyScalar(2), new THREE.Color("#f4b728").multiplyScalar(2), new THREE.Color("#ffffff").multiplyScalar(2)];
  for (let i = 0; i < N; i++) spark.setColorAt(i, cols[i % 3]);
  spark.visible = false;
  g.add(spark);
  let age = 99;
  const at = new THREE.Vector3();
  const burst = () => {
    age = 0;
    at.set((k.rnd(Math.floor(performance.now()), 7) - 0.5) * 40, y0 + 24 + k.rnd(Math.floor(performance.now()), 8) * 10, 50 + k.rnd(Math.floor(performance.now()), 9) * 30);
    spark.visible = true;
  };
  k.blockFns.push(() => burst());
  k.arrive[f].push(() => setTimeout(burst, 2500));
  const mm = new THREE.Matrix4(),
    p = new THREE.Vector3();
  k.ticks[f].push((dt) => {
    if (age > 3.2) {
      spark.visible = false;
      return;
    }
    age += dt;
    const s = Math.max(0.01, 1 - age / 3.2);
    for (let i = 0; i < N; i++) {
      p.copy(vel[i]).multiplyScalar(age * (1 - age * 0.12)).add(at);
      p.y -= age * age * 1.6;
      mm.makeScale(s, s, s).setPosition(p);
      spark.setMatrixAt(i, mm);
    }
    spark.instanceMatrix.needsUpdate = true;
    (spark.material as THREE.MeshBasicMaterial).opacity = s;
  });

  // ---- light ------------------------------------------------------------------------------------
  k.light(f, 1, 3, -24.5, "#ffcf8a", 16, 14);
  k.light(f, 0, 0.6, -4.5, "#5ae8ff", 14, 20);
  k.light(f, -8, 3.5, -14, "#ffe2b8", 12, 16);
  k.light(f, 8, 3.5, -14, "#ffe2b8", 12, 16);
  k.light(f, 9.2, 2.5, -24, "#ff6ad8", 8, 10);
  k.light(f, -6.4, 1, -16.4, "#ff9a4a", 6, 8);

  // ---- people -----------------------------------------------------------------------------------
  k.onCast(f, () => {
    void k.person(f, 4401, [1, -25.2], "Bartender", { face: [0, 1], wander: [[1, -25.2], [-1.8, -25.2], [3.6, -25.2]], lines: ["A Shielded Sour? Lime, gin, a secret.", "The Sapling Spritz: green, light, very fast.", () => (k.price ? `Cocktails are 0.01 ZEC. About ${(0.01 * k.price).toFixed(2)} dollars.` : "Cocktails are 0.01 ZEC tonight.")] });
    const g1 = k.person(f, 4402, [-1.0, -21.8], "Guest", { face: [0, -1] });
    const g2 = k.person(f, 4403, [1.4, -21.8], "Guest", { face: [0, -1] });
    k.dialog(f, [g1, g2], [
      [0, "Best rooftop in the city."],
      [1, "The Burj has a helipad."],
      [0, "The Burj doesn't have creepers."],
      [1, "Fair. Two Sapling Spritzes, please."],
    ], { near: 9 });
    void k.person(f, 4404, [9.2, -26.0], "DJ", { face: [0, 1], lines: ["This one's called Proof of Groove.", "Next track drops on the next block.", "Hands up if your wallet is shielded!"], tone: "shout" });
    const s1 = k.person(f, 4405, [-4.2, -3.0], "Swimmer", { dy: -0.95, face: [0, 1] });
    const s2 = k.person(f, 4406, [-2.6, -2.2], "Swimmer", { dy: -0.95, face: [-1, 0.4] });
    k.dialog(f, [s1, s2], [
      [0, "It feels like swimming off the edge."],
      [1, "One hundred and ten metres. Don't look down."],
      [0, "I can see the Needle and the Opera House."],
      [1, "And the bus with our block on it."],
    ], { near: 12 });
    void k.person(f, 4407, [6.4, -4.6], "Swimmer", { dy: -0.95, face: [0, 1], lines: ["Every block, fireworks. Best pool in town.", "The water's warm. The city's cold."] });
    void k.person(f, 4408, [-6.8, -11.9], "Guest", { sit: true, face: [0, 1], lines: ["Wake me at the next halving.", "Sunbathing at 110 metres. Shielded from everything but the sun."] });
    void k.person(f, 4409, [-8.4, -15.0], "Guest", { sit: true, face: [0.8, -0.6] });
    void k.person(f, 4410, [-4.6, -17.6], "Guest", { sit: true, face: [-0.8, 0.6], lines: ["The fire pit's the warmest wallet up here.", "We met at the sky garden. Twenty-seven floors down."] });
  });
}
