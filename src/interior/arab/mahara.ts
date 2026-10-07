import * as THREE from "three";
import { roundTable, velvetChair } from "../hotel/furniture";
import { soloist } from "../music/acts";
import { F, GOLD, MONO, PAL, paint, SERIF, type ArabKit } from "./kit";

/**
 * Basement: Al Mahara, the restaurant round a great aquarium. A round room under a rippling
 * blue-and-gold ceiling, walls painted as the deep sea and lit from within; in the middle the
 * floor-to-ceiling tank (reef, fish circling, two sharks and a ray, bubbles); tables in a ring
 * round it, the wine wall, the maître d' at his lectern.
 */

const f = F.mahara;
const C0 = new THREE.Vector3(0, 0, -16);
const R = 14;
const H = 4.6;
const TANK = 4.4;

export function mahara(k: ArabKit) {
  const g = k.groups[f];
  const y0 = k.y(f);

  // ---- floor: dark blue terrazzo with a gold wave inlay ring ------------------------------------
  const floorTex = paint(1024, 1024, (c, W) => {
    c.fillStyle = "#0c1a3a";
    c.fillRect(0, 0, W, W);
    for (let i = 0; i < 2600; i++) {
      c.fillStyle = ["#1a2a5a", "#0a1430", "#2a3a6a", "#c9a227"][i % 23 === 0 ? 3 : i % 3];
      c.fillRect(k.rnd(i, 1) * W, k.rnd(i, 2) * W, 3, 3);
    }
    c.translate(W / 2, W / 2);
    c.strokeStyle = "#d9a92e";
    for (const [r, lw] of [
      [0.36, 8],
      [0.6, 5],
      [0.97, 10],
    ]) {
      c.lineWidth = lw;
      c.beginPath();
      for (let i = 0; i <= 720; i++) {
        const a = (i / 720) * Math.PI * 2;
        const rr = (r + 0.012 * Math.sin(a * 36)) * (W / 2);
        c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      c.stroke();
    }
  });
  const fl = new THREE.Mesh(new THREE.CircleGeometry(R, 72), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.25, metalness: 0.1 }));
  fl.rotation.x = -Math.PI / 2;
  fl.position.set(C0.x, y0, C0.z);
  fl.raycast = () => {};
  g.add(fl);

  // ---- walls: the deep sea, painted and lit from within ----------------------------------------
  const sea = paint(4096, 512, (c, W, Hh) => {
    const gr = c.createLinearGradient(0, 0, 0, Hh);
    gr.addColorStop(0, "#1a8ab8");
    gr.addColorStop(0.45, "#0a4a7a");
    gr.addColorStop(1, "#04142e");
    c.fillStyle = gr;
    c.fillRect(0, 0, W, Hh);
    // light shafts
    c.globalAlpha = 0.12;
    c.fillStyle = "#e8fbff";
    for (let i = 0; i < 40; i++) {
      const x = k.rnd(i, 11) * W;
      c.beginPath();
      c.moveTo(x, 0);
      c.lineTo(x + 40, 0);
      c.lineTo(x + 140, Hh);
      c.lineTo(x + 90, Hh);
      c.fill();
    }
    c.globalAlpha = 1;
    // reef along the bottom
    for (let i = 0; i < 160; i++) {
      const x = k.rnd(i, 12) * W,
        h = 30 + k.rnd(i, 13) * 120;
      c.fillStyle = ["#ff6a5a", "#ff9a3a", "#c84aff", "#f4d04a", "#2ad0a0", "#3a2a4a"][i % 6];
      c.beginPath();
      c.moveTo(x - 14, Hh);
      c.quadraticCurveTo(x + (k.rnd(i, 14) - 0.5) * 60, Hh - h, x + 14, Hh);
      c.fill();
    }
    // silhouettes: a school, a turtle, a whale shark far off
    c.fillStyle = "rgba(4,20,40,0.55)";
    for (let i = 0; i < 90; i++) {
      const x = 400 + (i % 30) * 22 + k.rnd(i, 15) * 20,
        y = 120 + Math.floor(i / 30) * 18 + k.rnd(i, 16) * 12;
      c.beginPath();
      c.ellipse(x, y, 8, 3, 0, 0, Math.PI * 2);
      c.fill();
    }
    c.beginPath();
    c.ellipse(2600, 200, 180, 40, -0.05, 0, Math.PI * 2);
    c.fill();
    c.beginPath();
    c.moveTo(2420, 200);
    c.lineTo(2350, 150);
    c.lineTo(2360, 250);
    c.fill();
    c.beginPath();
    c.ellipse(1500, 300, 50, 34, 0.2, 0, Math.PI * 2);
    c.fill();
  });
  const wallMat = new THREE.MeshBasicMaterial({ map: sea, side: THREE.BackSide, toneMapped: false });
  wallMat.color.setScalar(0.85);
  // open where the entrance hall meets the room
  const gapA = 0.32;
  const wallGeo = new THREE.CylinderGeometry(R, R, H, 96, 1, true, gapA, Math.PI * 2 - 2 * gapA);
  const wl = new THREE.Mesh(wallGeo, wallMat);
  wl.position.set(C0.x, y0 + H / 2, C0.z);
  wl.raycast = () => {};
  g.add(wl);
  k.ring(f, C0.x, C0.z, R - 0.2, gapA, Math.PI * 2 - gapA);
  // gold frames: the wall is seen through a ring of arched panels
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    if (Math.abs(((a + Math.PI) % (Math.PI * 2)) - Math.PI) < gapA + 0.05) continue;
    k.box(f, 0.22, H, 0.22, C0.x + Math.sin(a) * (R - 0.15), 0, C0.z + Math.cos(a) * (R - 0.15), PAL.gold, "metal");
  }
  k.geo(f, new THREE.CylinderGeometry(R - 0.05, R - 0.05, 0.5, 96, 1, true, gapA, Math.PI * 2 - 2 * gapA).translate(C0.x, 0.25, C0.z), "#0a1430", "polish");
  // the ceiling: blue and gold ripples, a gilded rim
  const ceilTex = paint(1024, 1024, (c, W) => {
    c.fillStyle = "#0a2a5a";
    c.fillRect(0, 0, W, W);
    c.translate(W / 2, W / 2);
    for (let r = 40; r < W / 2; r += 34) {
      c.strokeStyle = r % 68 < 34 ? "#d9a92e" : "#18a0b0";
      c.lineWidth = 6;
      c.beginPath();
      for (let i = 0; i <= 360; i++) {
        const a = (i / 360) * Math.PI * 2;
        const rr = r + 8 * Math.sin(a * 12 + r * 0.1);
        c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      c.stroke();
    }
  });
  const ce = new THREE.Mesh(new THREE.CircleGeometry(R, 72), new THREE.MeshBasicMaterial({ map: ceilTex, toneMapped: false }));
  (ce.material as THREE.MeshBasicMaterial).color.setScalar(0.8);
  ce.rotation.x = Math.PI / 2;
  ce.position.set(C0.x, y0 + H, C0.z);
  ce.raycast = () => {};
  g.add(ce);
  for (const r of [R - 0.5, TANK + 2.2])
    k.geo(f, new THREE.TorusGeometry(r, 0.12, 6, 96).rotateX(Math.PI / 2).translate(C0.x, H - 0.15, C0.z), PAL.gold, "metal");
  // a glow ring round the ceiling's edge
  k.geo(f, new THREE.TorusGeometry(R - 0.9, 0.05, 4, 96).rotateX(Math.PI / 2).translate(C0.x, H - 0.3, C0.z), "#7fe3ff", "glow");

  // ---- the entrance hall with the lifts ---------------------------------------------------------
  const hallZ = C0.z + Math.sqrt(R * R - 16);
  k.box(f, 8, 0.02, 0.4 - hallZ + 0.4, 0, 0, (hallZ + 0.4) / 2, "#1a2a5a", "polish");
  for (const s of [-1, 1]) k.wall(f, s * 4, hallZ, s * 4, 0.4, H, "#0e1a3a", "polish", 0.3);
  k.box(f, 8.4, 0.3, 0.4 - hallZ + 0.6, 0, H, (hallZ + 0.4) / 2, PAL.gold, "metal");
  k.lifts(f, 0, 0.3, Math.PI);
  k.label(f, "AL MAHARA", 0, 3.85, hallZ - 0.1, { h: 0.42, color: GOLD, ry: Math.PI, font: `700 96px ${SERIF}` });
  k.label(f, "AL MAHARA", 0, 3.85, hallZ + 0.1, { h: 0.42, color: GOLD, font: `700 96px ${SERIF}` });
  // the maître d's lectern
  k.box(f, 0.8, 1.1, 0.5, -2.6, 0, hallZ - 1.4, PAL.walnut, "polish");
  k.box(f, 0.9, 0.06, 0.6, -2.6, 1.1, hallZ - 1.4, PAL.gold, "metal");
  k.solid(f, -3.0, hallZ - 1.7, -2.2, hallZ - 1.1);

  // ---- the great aquarium ------------------------------------------------------------------------
  const tankBack = paint(1024, 256, (c, W, Hh) => {
    const gr = c.createLinearGradient(0, 0, 0, Hh);
    gr.addColorStop(0, "#6ae0ff");
    gr.addColorStop(0.5, "#1a8ac8");
    gr.addColorStop(1, "#0a3a6a");
    c.fillStyle = gr;
    c.fillRect(0, 0, W, Hh);
    c.globalAlpha = 0.2;
    c.fillStyle = "#ffffff";
    for (let i = 0; i < 24; i++) {
      const x = (i / 24) * W;
      c.beginPath();
      c.moveTo(x, 0);
      c.lineTo(x + 12, 0);
      c.lineTo(x + 30, Hh);
      c.lineTo(x + 20, Hh);
      c.fill();
    }
  });
  // an inner column of lit water (the core of the tank, so the fish read against light)
  const core = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, H - 1.0, 32, 1, true), new THREE.MeshBasicMaterial({ map: tankBack, toneMapped: false }));
  core.position.set(C0.x, y0 + 0.5 + (H - 1.0) / 2, C0.z);
  core.raycast = () => {};
  g.add(core);
  const shell = new THREE.Mesh(new THREE.CylinderGeometry(TANK, TANK, H - 1.0, 64, 1, true), new THREE.MeshStandardMaterial({ color: "#3ab8e8", transparent: true, opacity: 0.2, roughness: 0.04, metalness: 0.3, emissive: "#0a5a8a", emissiveIntensity: 0.5, depthWrite: false, side: THREE.DoubleSide }));
  shell.position.copy(core.position);
  shell.renderOrder = 3;
  shell.raycast = () => {};
  g.add(shell);
  k.cyl(f, TANK + 0.25, TANK + 0.25, 0.5, C0.x, 0, C0.z, "#0e1a3a", "polish", 64);
  k.cyl(f, TANK + 0.3, TANK + 0.3, 0.12, C0.x, 0.5, C0.z, PAL.gold, "metal", 64);
  k.cyl(f, TANK + 0.3, TANK + 0.3, 0.5, C0.x, H - 0.5, C0.z, PAL.gold, "metal", 64);
  k.cyl(f, TANK, TANK, 0.25, C0.x, 0.5, C0.z, "#e8d4a0", "matte", 48);
  // reef on the sand
  for (let i = 0; i < 26; i++) {
    const a = k.rnd(i, 21) * Math.PI * 2,
      r = 1.6 + k.rnd(i, 22) * (TANK - 2);
    const col = ["#ff6a5a", "#ff9a3a", "#c84aff", "#f4d04a", "#2ad0a0", "#ff4a9a"][i % 6];
    k.cyl(f, 0.18 + k.rnd(i, 23) * 0.25, 0.02, 0.4 + k.rnd(i, 24) * 1.1, C0.x + Math.sin(a) * r, 0.75, C0.z + Math.cos(a) * r, col, "matte", 6);
  }
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    k.cyl(f, 0.55, 0.25, 0.5 + (i % 3) * 0.25, C0.x + Math.sin(a) * 2.2, 0.75, C0.z + Math.cos(a) * 2.2, "#5a5458", "matte", 7);
  }
  k.ring(f, C0.x, C0.z, TANK + 0.45);
  k.fish(f, 70, { ring: [C0.x, C0.z, 1.8, TANK - 0.4, 1.0, H - 1.2], seed: 11 });
  // two reef sharks and a ray, slower, bigger
  k.fish(f, 2, { ring: [C0.x, C0.z, 3.2, 3.6, 1.6, 2.6], size: [0.95, 1.1], seed: 31, colors: ["#8a9aa8", "#7a8a98"] });
  const ray = new THREE.Mesh(new THREE.ConeGeometry(0.55, 0.12, 4).rotateY(Math.PI / 4), new THREE.MeshStandardMaterial({ color: "#4a5a6a", roughness: 0.6 }));
  ray.scale.set(1.4, 1, 1);
  ray.raycast = () => {};
  g.add(ray);
  // bubbles rising in a curtain
  const bubbles = new THREE.InstancedMesh(new THREE.SphereGeometry(0.035, 6, 4), new THREE.MeshBasicMaterial({ color: new THREE.Color("#e8fbff").multiplyScalar(1.4), toneMapped: false, transparent: true, opacity: 0.7 }), 80);
  bubbles.raycast = () => {};
  bubbles.frustumCulled = false;
  g.add(bubbles);
  const bm = new THREE.Matrix4();
  k.ticks[f].push((_dt, t) => {
    const a = t * 0.18;
    ray.position.set(C0.x + Math.sin(a) * 2.6, y0 + 1.3 + Math.sin(t * 0.5) * 0.15, C0.z + Math.cos(a) * 2.6);
    ray.rotation.set(Math.sin(t * 2) * 0.12, a + Math.PI / 2, 0);
    for (let i = 0; i < 80; i++) {
      const aa = (i % 8) * 0.785 + 0.3;
      const rr = 3.4 + (i % 3) * 0.2;
      const yy = 0.8 + (((i * 0.37 + t * 0.35) % 1) * (H - 2));
      bm.makeTranslation(C0.x + Math.sin(aa) * rr + Math.sin(t * 3 + i) * 0.05, y0 + yy, C0.z + Math.cos(aa) * rr);
      bubbles.setMatrixAt(i, bm);
    }
    bubbles.instanceMatrix.needsUpdate = true;
  });
  k.hit(f, TANK * 2, H - 1, TANK * 2, C0.x, 0.5, C0.z, `<b>The great aquarium</b><span>one million litres of the Gulf</span>`, () => ({
    eyebrow: "Al Mahara",
    title: "The great aquarium",
    stats: [
      ["Volume", "1,000,000 L"],
      ["Fish", "72"],
      ["Sharks", "2"],
      ["Ray", "1"],
    ],
  }));
  k.light(f, C0.x, 3.6, C0.z, "#5ad0ff", 18, 16);

  // ---- tables in a ring, the wine wall, the menu ---------------------------------------------------
  const tables: [number, number][] = [];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + 0.35;
    if (Math.abs(((a + Math.PI) % (Math.PI * 2)) - Math.PI) < 0.5) continue;
    const r = 8.6;
    const x = C0.x + Math.sin(a) * r,
      z = C0.z + Math.cos(a) * r;
    tables.push([x, z]);
    k.vox(f, "mahara-table", () => roundTable(4), x, z, a);
    for (let c = 0; c < 4; c++) {
      const ca = a + (c / 4) * Math.PI * 2 + Math.PI / 4;
      k.vox(f, "mahara-chair", () => velvetChair("#1a3a8a"), x + Math.sin(ca) * 0.95, z + Math.cos(ca) * 0.95, ca + Math.PI, { solid: false });
    }
  }
  // red velvet banquettes round the wall, a gold lamp between each pair
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    if (Math.abs(((a + Math.PI) % (Math.PI * 2)) - Math.PI) < gapA + 0.2) continue;
    const x = C0.x + Math.sin(a) * (R - 0.75),
      z = C0.z + Math.cos(a) * (R - 0.75);
    k.box(f, 1.6, 0.45, 0.9, x, 0, z, "#7a1020", "matte", a);
    k.box(f, 1.6, 0.7, 0.25, C0.x + Math.sin(a) * (R - 0.32), 0.45, C0.z + Math.cos(a) * (R - 0.32), "#8a1424", "matte", a);
    if (i % 2 === 0) {
      k.cyl(f, 0.04, 0.04, 1.4, C0.x + Math.sin(a + 0.11) * (R - 0.3), 0, C0.z + Math.cos(a + 0.11) * (R - 0.3), PAL.gold, "metal", 6);
      k.cyl(f, 0.16, 0.08, 0.22, C0.x + Math.sin(a + 0.11) * (R - 0.3), 1.4, C0.z + Math.cos(a + 0.11) * (R - 0.3), "#ffd890", "glow", 10);
    }
  }
  k.ring(f, C0.x, C0.z, R - 1.3, gapA + 0.2, Math.PI * 2 - gapA - 0.2);
  const menu = k.screen(f, 1.4, 0.9, (c, W, Hh) => {
    c.fillStyle = "#0a1430";
    c.fillRect(0, 0, W, Hh);
    c.strokeStyle = GOLD;
    c.lineWidth = 6;
    c.strokeRect(10, 10, W - 20, Hh - 20);
    c.fillStyle = GOLD;
    c.font = `700 40px ${SERIF}`;
    c.textAlign = "center";
    c.fillText("Tonight", W / 2, 70);
    c.font = `500 24px ${MONO}`;
    c.fillStyle = "#f6e7c4";
    const lines = ["Sapling reef lobster", "Orchard sea bream", "Sprout ceviche", "Halo 2 caviar", "Gold-leaf ⓩ soufflé"];
    lines.forEach((l, i) => c.fillText(l, W / 2, 118 + i * 34));
    c.fillStyle = "#7fe3ff";
    c.fillText(k.price ? `Bill in ZEC · $${k.price.toFixed(2)}` : "Bill in ZEC", W / 2, Hh - 28);
  }, 15);
  menu.position.set(-3.82, y0 + 1.7, -0.9);
  menu.rotation.y = Math.PI / 2;
  for (const [x, z] of tables.slice(0, 4)) k.light(f, x, 3.4, z, "#ffd8a0", 6, 7);

  // a violinist between the aquarium and the tables (src/interior/music)
  soloist(g, "violin", { x: C0.x + 6.1, y: y0, z: C0.z - 1.1, yaw: Math.PI / 2 }, { place: "arab", floor: f, track: "violin-bach", id: 1720, role: "Violinist", level: 0.75 });
  k.solid(f, C0.x + 5.7, C0.z - 1.5, C0.x + 6.5, C0.z - 0.7);

  // ---- people ---------------------------------------------------------------------------------------
  k.onCast(f, () => {
    void k.person(f, 1888, [-2.6, hallZ - 2.2], "Maître d'", { face: [0, 1], lines: ["Welcome to Al Mahara. Your table is by the sharks.", "Reservation under which name? Don't worry, we never write it down.", "Dress code: smart. Privacy: total."] });
    const T = tables;
    const w1 = k.person(f, 3401, [T[0][0] + 1.2, T[0][1] + 0.2], "Waiter", { wander: T.map(([x, z]) => [x + 1.3, z + 0.3] as [number, number]), lines: ["Tonight's catch is fully shielded. Even the fish doesn't know where it came from.", "Would sir like the tasting menu, or the Merkle tree of desserts?", "The caviar is from the Halo 2 farm. No trusted setup."] });
    void w1;
    void k.person(f, 6420, [T[2][0] + 1.1, T[2][1] - 0.6], "Sommelier", { face: [-1, 0.5], lines: ["A 2016 vintage. Very good year. The year of Sprout.", "This wine was aged in the dark, like a good shielded note.", "Red goes with lobster here. We don't judge."] });
    // diners
    const a = k.person(f, 512, [T[1][0] - 0.7, T[1][1]], "Diner", { sit: true, face: [1, 0] });
    const b = k.person(f, 9876, [T[1][0] + 0.7, T[1][1]], "Diner", { sit: true, face: [-1, 0] });
    k.dialog(f, [a, b], [
      [0, "That shark keeps staring at me."],
      [1, "It's auditing you. Relax, our notes are encrypted."],
      [0, "What if it has a viewing key?"],
      [1, "Then it knows you ordered the cheap wine."],
    ]);
    const c = k.person(f, 3141, [T[3][0] - 0.7, T[3][1]], "Diner", { sit: true, face: [1, 0] });
    const d = k.person(f, 2718, [T[3][0] + 0.7, T[3][1]], "Diner", { sit: true, face: [-1, 0] });
    k.dialog(f, [c, d], [
      [0, "The bill came in a sealed envelope."],
      [1, "Shielded, like everything here."],
      [0, "How much was it?"],
      [1, "Zero knowledge. I just proved I could pay."],
    ]);
    const e = k.person(f, 7777, [T[5][0], T[5][1] - 0.7], "Diner", { sit: true, face: [0, 1] });
    void e;
    void k.person(f, 4096, [C0.x + TANK + 1.0, C0.z + 0.6], "Marine biologist", { face: [-1, 0], lines: ["The grouper is called Satoshi. He hides from everyone.", "Seventy-two fish, one million litres, zero leaks.", "The sharks are vegetarian on Mondays."] });
  });
  void g;
}
