import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { armchair, coffeeTable, sofa } from "../furniture";
import { chandelier, frontDesk, palm } from "../hotel/furniture";
import { grandPiano, pianoBench } from "../furniture";
import { pianist, pianoSeat } from "../music/acts";
import { F, GOLD, marbleTex, MONO, PAL, paint, SERIF, type ArabKit } from "./kit";

/**
 * Ground floor: the Gold Atrium. A V-shaped hall closed at the front by the sail (lit from the
 * outside in slow washes of colour), its two sides rising in sixteen tiers of balconies with gold
 * and turquoise wave fascias and a line of light under each; at the bottom the dancing fountain in
 * a ring of gold columns, two floor-to-ceiling aquariums at the entrance, the reception and the
 * concierge, the panoramic lifts climbing the back wall and the lift lobby at the apex.
 */

const f = F.atrium;
/** Half width of the V at z: 16 m at the sail (z = 6), 5 m at the apex (z = -34). */
export const hwA = (z: number) => 5 + (11 * (z + 34)) / 40;
const Z0 = -34,
  Z1 = 6;
const TIER0 = 7.2,
  TIER = 3.3,
  TIERS = 16;
const TOP = TIER0 + TIER * TIERS + 1.5;
const FOUNTAIN = new THREE.Vector3(0, 0, -15);

export function atrium(k: ArabKit) {
  const g = k.groups[f];

  // ---- floor: cream marble, a mosaic medallion round the fountain, a runner to the door --------
  const floorMat = new THREE.MeshStandardMaterial({ map: marbleTex(k, "#efe8da", "#a89470", 512, 4, 8, 10), roughness: 0.18, metalness: 0.05 });
  k.flat(f, 34, 42, floorMat, 0, -14, 0);
  const medallion = paint(1024, 1024, (c, W) => {
    const R = W / 2;
    c.translate(R, R);
    const rings: [number, string][] = [
      [1, "#1a3a8a"],
      [0.94, "#d9a92e"],
      [0.9, "#0e6a7a"],
      [0.78, "#efe2c4"],
      [0.74, "#d9a92e"],
      [0.66, "#1a3a8a"],
      [0.5, "#efe2c4"],
    ];
    for (const [r, col] of rings) {
      c.fillStyle = col;
      c.beginPath();
      c.arc(0, 0, r * R, 0, Math.PI * 2);
      c.fill();
    }
    // the sixteen-point star and the wave band
    c.fillStyle = "#d9a92e";
    c.beginPath();
    for (let i = 0; i < 32; i++) {
      const a = (i / 32) * Math.PI * 2;
      const r = (i % 2 ? 0.52 : 0.76) * R;
      c.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    c.closePath();
    c.fill();
    c.strokeStyle = "#18a0b0";
    c.lineWidth = 6;
    c.beginPath();
    for (let i = 0; i <= 360; i++) {
      const a = (i / 360) * Math.PI * 2;
      const r = (0.84 + 0.025 * Math.sin(a * 24)) * R;
      c.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    c.stroke();
  });
  const med = new THREE.Mesh(new THREE.CircleGeometry(8.2, 64), new THREE.MeshStandardMaterial({ map: medallion, roughness: 0.2, metalness: 0.15 }));
  med.rotation.x = -Math.PI / 2;
  med.position.set(FOUNTAIN.x, k.y(f) + 0.008, FOUNTAIN.z);
  med.raycast = () => {};
  g.add(med);
  const runner = new THREE.MeshStandardMaterial({ map: paint(64, 512, (c, W, H) => {
    c.fillStyle = "#8a1022";
    c.fillRect(0, 0, W, H);
    c.fillStyle = "#d9a92e";
    c.fillRect(0, 0, 4, H);
    c.fillRect(W - 4, 0, 4, H);
    for (let y = 0; y < H; y += 32) c.fillRect(W / 2 - 6, y + 10, 12, 12);
  }), roughness: 0.9 });
  k.flat(f, 2.4, 13, runner, 0, -0.6, 0.012);

  // ---- the walls round the bottom: gold-veined marble, gold pilasters ----------------------------
  for (const s of [-1, 1]) {
    k.wall(f, s * hwA(Z1), Z1, s * hwA(Z0), Z0, TIER0, "#203a7a", "polish", 0.4);
    for (let z = Z1 - 3; z > Z0 + 2; z -= 4) {
      const x = s * (hwA(z) - 0.25);
      k.box(f, 0.5, TIER0, 0.5, x, 0, z, PAL.gold, "metal");
    }
    // the dado and the cornice under the first tier
    k.wall(f, s * (hwA(Z1) - 0.22), Z1, s * (hwA(Z0) - 0.22), Z0, 0.9, "#7a1020", "polish", 0.06, 0, false);
    k.wall(f, s * (hwA(Z1) - 0.3), Z1, s * (hwA(Z0) - 0.3), Z0, 0.18, PAL.gold, "metal", 0.12, 0.9, false);
  }
  // the front wall with the doors, the back wall at the apex
  k.wall(f, -hwA(Z1), Z1, -1.6, Z1, TIER0, "#203a7a", "polish", 0.4);
  k.wall(f, 1.6, Z1, hwA(Z1), Z1, TIER0, "#203a7a", "polish", 0.4);
  k.solid(f, -1.6, Z1 - 0.1, 1.6, Z1 + 0.1);
  k.box(f, 3.6, 0.4, 0.5, 0, 3.4, Z1, PAL.gold, "metal");
  for (const s of [-1, 1]) k.box(f, 0.3, 3.4, 0.5, s * 1.65, 0, Z1, PAL.gold, "metal");
  k.box(f, 3.0, 3.3, 0.06, 0, 0.05, Z1 - 0.05, "#a8c8d8", "glass");
  k.wall(f, -hwA(Z0), Z0, hwA(Z0), Z0, TOP, "#1a2a5a", "polish", 0.4);

  // ---- the sail: the front of the atrium above the doors, washed in colour -------------------------
  const sailTex = paint(512, 1024, (c, W, H) => {
    const gr = c.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, "#ffffff");
    gr.addColorStop(1, "#e8ecf4");
    c.fillStyle = gr;
    c.fillRect(0, 0, W, H);
    c.strokeStyle = "rgba(150,160,180,0.55)";
    c.lineWidth = 3;
    for (let x = 0; x <= W; x += W / 8) {
      c.beginPath();
      c.moveTo(x, 0);
      c.lineTo(x, H);
      c.stroke();
    }
    // the fabric's catenary seams between the ribs
    c.lineWidth = 2;
    for (let y = 40; y < H; y += 64)
      for (let x = 0; x < W; x += W / 8) {
        c.beginPath();
        c.moveTo(x, y);
        c.quadraticCurveTo(x + W / 16, y + 18, x + W / 8, y);
        c.stroke();
      }
  });
  const sailMat = new THREE.MeshBasicMaterial({ map: sailTex, toneMapped: false });
  const sail = k.plane(f, 2 * hwA(Z1), TOP - TIER0, sailMat, 0, TIER0 + (TOP - TIER0) / 2, Z1 - 0.3, 0, Math.PI);
  sail.rotation.y = Math.PI;
  const wash = ["#c8b8ff", "#b8d8ff", "#ffc8e8", "#ffe6b0", "#b8fff0"].map((c) => new THREE.Color(c));
  const tmpC = new THREE.Color();
  k.ticks[f].push((_dt, t) => {
    const u = (t / 14) % wash.length;
    const i = Math.floor(u);
    tmpC.copy(wash[i]).lerp(wash[(i + 1) % wash.length], u - i);
    sailMat.color.copy(tmpC).multiplyScalar(0.95);
  });

  // ---- the tiers: balconies all the way up ----------------------------------------------------------
  const fasciaTex = paint(2048, 64, (c, W, H) => {
    c.fillStyle = "#d9a92e";
    c.fillRect(0, 0, W, H);
    // gold, turquoise and royal blue waves, the famous rippled balcony fronts
    const cols = ["#18a0b0", "#1a3a8a", "#2ad0a0"];
    for (let x = 0; x < W; x += 128) {
      c.fillStyle = cols[(x / 128) % 3];
      c.beginPath();
      c.moveTo(x, H);
      for (let i = 0; i <= 128; i += 4) c.lineTo(x + i, H * 0.42 + Math.sin((i / 128) * Math.PI * 2) * H * 0.18);
      c.lineTo(x + 128, H);
      c.fill();
    }
    c.fillStyle = "#f0cf72";
    c.fillRect(0, 0, W, 6);
    c.fillRect(0, H - 4, W, 4);
  });
  const fascias: THREE.BufferGeometry[] = [];
  const corridorTex = paint(512, 256, (c, W, H) => {
    c.fillStyle = "#2a1a3a";
    c.fillRect(0, 0, W, H);
    c.fillStyle = "#3a2a52";
    c.fillRect(0, H * 0.82, W, H * 0.18);
    for (let x = 32; x < W; x += 128) {
      c.fillStyle = "#d9a92e";
      c.fillRect(x - 4, H * 0.18 - 4, 72, H * 0.64 + 4);
      c.fillStyle = "#4a2a18";
      c.fillRect(x, H * 0.18, 64, H * 0.64);
      c.fillStyle = "#ffd890";
      c.fillRect(x + 92, H * 0.3, 10, 18);
    }
  });
  const corridors: THREE.BufferGeometry[] = [];
  const sideLen = Math.hypot(11, 40);
  for (const s of [-1, 1]) {
    const ang = -Math.atan2(Z0 - Z1, s * (hwA(Z0) - hwA(Z1)));
    const mid = (Z0 + Z1) / 2;
    for (let n = 0; n < TIERS; n++) {
      const y = TIER0 + n * TIER;
      const inset = 1.8;
      const xm = s * (hwA(mid) - inset);
      // the slab and its soffit light
      k.wall(f, s * (hwA(Z1) - inset / 2), Z1, s * (hwA(Z0 + 2) - inset / 2), Z0 + 2, 0.32, "#efe6d2", "matte", inset, y - 0.32, false);
      k.wall(f, s * (hwA(Z1) - inset), Z1, s * (hwA(Z0 + 2) - inset), Z0 + 2, 0.06, "#ffcf70", "glow", 0.08, y - 0.4, false);
      // the gold rail
      k.wall(f, s * (hwA(Z1) - inset + 0.04), Z1, s * (hwA(Z0 + 2) - inset + 0.04), Z0 + 2, 0.07, PAL.gold, "metal", 0.1, y + 1.05, false);
      // the fascia (the wave band), facing the void
      const p = new THREE.PlaneGeometry(sideLen - 2, 0.9);
      p.rotateY(ang + (s > 0 ? Math.PI : 0));
      p.translate(xm - s * 0.02, y + 0.1, mid - 1);
      fascias.push(p);
      // the corridor wall behind the balcony, with its doors
      const q = new THREE.PlaneGeometry(sideLen, TIER);
      q.rotateY(ang + (s > 0 ? Math.PI : 0));
      q.translate(s * (hwA(mid) - 0.05), y + TIER / 2 - 0.3, mid);
      corridors.push(q);
    }
  }
  // fascia UVs repeat along the run
  const fasc = mergeGeometries(fascias, false)!;
  fasciaTex.wrapS = THREE.RepeatWrapping;
  const fasciaMat = new THREE.MeshStandardMaterial({ map: fasciaTex, emissiveMap: fasciaTex, emissive: "#ffffff", emissiveIntensity: 0.3, metalness: 0.6, roughness: 0.3, side: THREE.DoubleSide });
  const fm = new THREE.Mesh(fasc, fasciaMat);
  fm.raycast = () => {};
  g.add(fm);
  fasciaTex.repeat.set(2, 1);
  corridorTex.wrapS = THREE.RepeatWrapping;
  corridorTex.repeat.set(8, 1);
  const cm = new THREE.Mesh(mergeGeometries(corridors, false)!, new THREE.MeshStandardMaterial({ map: corridorTex, emissiveMap: corridorTex, emissive: "#ffffff", emissiveIntensity: 0.25, roughness: 0.7, side: THREE.DoubleSide }));
  cm.raycast = () => {};
  g.add(cm);
  // the back tiers over the lifts
  for (let n = 0; n < TIERS; n++) {
    const y = TIER0 + n * TIER;
    k.box(f, 2 * hwA(Z0 + 2) - 3.6, 0.32, 1.6, 0, y - 0.32, Z0 + 1.0, "#efe6d2");
    k.box(f, 2 * hwA(Z0 + 2) - 3.6, 0.06, 0.08, 0, y - 0.4, Z0 + 1.8, "#ffcf70", "glow");
    k.box(f, 2 * hwA(Z0 + 2) - 3.6, 0.7, 0.06, 0, y, Z0 + 1.8, PAL.gold, "metal");
  }
  // the ceiling: a gilded sunburst on blue
  const ceil = paint(1024, 1024, (c, W) => {
    const R = W / 2;
    const gr = c.createRadialGradient(R, R, 10, R, R, R);
    gr.addColorStop(0, "#fff2c0");
    gr.addColorStop(0.25, "#f0b83a");
    gr.addColorStop(0.55, "#1a3a8a");
    gr.addColorStop(1, "#0a1440");
    c.fillStyle = gr;
    c.fillRect(0, 0, W, W);
    c.strokeStyle = "rgba(255,210,120,0.6)";
    c.lineWidth = 5;
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      c.beginPath();
      c.moveTo(R + Math.cos(a) * 80, R + Math.sin(a) * 80);
      c.lineTo(R + Math.cos(a) * R, R + Math.sin(a) * R);
      c.stroke();
    }
  });
  k.plane(f, 34, 42, new THREE.MeshBasicMaterial({ map: ceil, toneMapped: false }), 0, TOP, -14, Math.PI / 2);

  // ---- guests leaning on the balcony rails: zkSNARK busts from the collection ----------------------
  {
    const at: [number, number, number, number, number][] = [];
    for (let i = 0; i < 46; i++) {
      const n = Math.floor(k.rnd(i, 1) * 12);
      const s = k.rnd(i, 2) < 0.5 ? -1 : 1;
      const z = Z1 - 3 - k.rnd(i, 3) * 32;
      at.push([s * (hwA(z) - 1.2), TIER0 + n * TIER + 0.05, z, 1 + Math.floor(k.rnd(i, 4) * 9999), 1.0]);
    }
    k.crowd(f, at);
  }

  // ---- the dancing fountain in its ring of gold columns ---------------------------------------------
  const FX = FOUNTAIN.x,
    FZ = FOUNTAIN.z;
  k.cyl(f, 4.4, 4.4, 0.55, FX, 0, FZ, "#e8dcc0", "polish", 48);
  k.cyl(f, 4.5, 4.5, 0.1, FX, 0.55, FZ, PAL.gold, "metal", 48);
  const waterMat = new THREE.MeshStandardMaterial({ color: "#1a7aa0", emissive: "#0a5a7a", emissiveIntensity: 0.9, roughness: 0.08, metalness: 0.3 });
  const water = new THREE.Mesh(new THREE.CircleGeometry(4.1, 48), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.set(FX, k.y(f) + 0.5, FZ);
  water.raycast = () => {};
  g.add(water);
  k.ring(f, FX, FZ, 4.5);
  // the tiered gold sculpture in the middle
  k.cyl(f, 0.5, 0.35, 1.4, FX, 0.5, FZ, PAL.gold, "metal", 20);
  k.cyl(f, 0.3, 1.5, 0.4, FX, 1.9, FZ, PAL.gold, "metal", 32);
  k.cyl(f, 0.18, 0.18, 0.9, FX, 2.3, FZ, PAL.gold, "metal", 12);
  k.cyl(f, 0.18, 0.8, 0.3, FX, 3.2, FZ, PAL.gold, "metal", 24);
  // jets: an outer ring, an inner ring, the central plume
  const jetMat = new THREE.MeshBasicMaterial({ color: new THREE.Color("#cfefff").multiplyScalar(1.3), transparent: true, opacity: 0.5, depthWrite: false, toneMapped: false });
  const jetGeo = new THREE.CylinderGeometry(0.035, 0.07, 1, 6).translate(0, 0.5, 0);
  const jets: { m: THREE.Mesh; ring: number; i: number }[] = [];
  const addJet = (x: number, y: number, z: number, ring: number, i: number, w = 1) => {
    const m = new THREE.Mesh(jetGeo, jetMat);
    m.position.set(x, k.y(f) + y, z);
    m.scale.set(w, 1, w);
    m.raycast = () => {};
    g.add(m);
    jets.push({ m, ring, i });
  };
  for (let i = 0; i < 16; i++) addJet(FX + Math.sin((i / 16) * Math.PI * 2) * 3.4, 0.55, FZ + Math.cos((i / 16) * Math.PI * 2) * 3.4, 0, i);
  for (let i = 0; i < 8; i++) addJet(FX + Math.sin((i / 8) * Math.PI * 2 + 0.2) * 1.15, 2.3, FZ + Math.cos((i / 8) * Math.PI * 2 + 0.2) * 1.15, 1, i);
  addJet(FX, 3.5, FZ, 2, 0, 2.2);
  // the spray at the top of the plume: a few glowing droplets
  const drops = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.06, 0), jetMat, 60);
  drops.raycast = () => {};
  drops.frustumCulled = false;
  g.add(drops);
  const dm = new THREE.Matrix4();
  // underwater lights round the basin, changing colour
  const glowMat = new THREE.MeshBasicMaterial({ color: "#7fe3ff", toneMapped: false });
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.04, 0.18), glowMat);
    b.position.set(FX + Math.sin(a) * 3.9, k.y(f) + 0.52, FZ + Math.cos(a) * 3.9);
    b.raycast = () => {};
    g.add(b);
  }
  const fl = k.light(f, FX, 5, FZ, "#7fe3ff", 22, 20);
  const hue = new THREE.Color();
  const WHITE = new THREE.Color("#ffffff");
  k.ticks[f].push((_dt, t) => {
    // a show in four movements, eight seconds each, and a plume to the roof every half minute
    const mv = Math.floor(t / 8) % 4;
    const shot = t % 30;
    for (const j of jets) {
      let h = 0.2;
      if (j.ring === 0) {
        if (mv === 0) h = 1.2 + 1.6 * Math.sin(t * 2.2 + (j.i * Math.PI) / 8) ** 2;
        else if (mv === 1) h = (j.i + Math.floor(t * 1.5)) % 2 ? 3.2 : 0.4;
        else if (mv === 2) h = 0.5 + ((t * 0.5) % 1) * 3.4;
        else h = 2 + Math.sin(t * 3 + j.i) * 0.8;
      } else if (j.ring === 1) h = mv === 1 ? 1.6 : 0.8 + Math.abs(Math.sin(t * 1.7 + j.i)) * 1.8;
      else h = shot < 3.5 ? 4 + Math.sin((shot / 3.5) * Math.PI) * 32 : 2.6 + Math.sin(t * 2) * 0.6;
      j.m.scale.y = h;
      if (j.ring === 0) j.m.rotation.set(Math.cos((j.i / 16) * Math.PI * 2) * -0.25, 0, Math.sin((j.i / 16) * Math.PI * 2) * 0.25);
    }
    hue.setHSL((t * 0.03) % 1, 0.7, 0.72);
    jetMat.color.copy(hue).lerp(WHITE, 0.45).multiplyScalar(1.1);
    glowMat.color.copy(hue).multiplyScalar(1.6);
    waterMat.emissive.copy(hue).multiplyScalar(0.35);
    if (fl) fl.color.copy(hue);
    const top = jets[jets.length - 1].m.scale.y + 3.5;
    for (let i = 0; i < 60; i++) {
      const a = i * 2.4 + t * 0.6;
      const r = 0.3 + ((i * 0.37 + t * 0.9) % 1) * 1.6;
      const y = top - ((i * 0.53 + t * 1.3) % 1) * Math.min(top - 1, 6);
      dm.makeTranslation(FX + Math.cos(a) * r, k.y(f) + y, FZ + Math.sin(a) * r);
      drops.setMatrixAt(i, dm);
    }
    drops.instanceMatrix.needsUpdate = true;
  });
  k.hit(f, 9, 3, 9, FX, 0, FZ, `<b>The dancing fountain</b><span>a plume to the 16th tier every 30 s</span>`, () => ({
    eyebrow: "Gold Atrium",
    title: "The dancing fountain",
    stats: [
      ["Jets", "25"],
      ["Plume", "36 m"],
      ["Show", "every 30 s"],
      ["Block", k.height ? `#${k.height.toLocaleString("en-US")}` : "…"],
    ],
  }));
  // gold columns round it
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    const x = FX + Math.sin(a) * 7.2,
      z = FZ + Math.cos(a) * 7.2;
    k.cyl(f, 0.62, 0.62, 0.5, x, 0, z, "#efe2c4", "polish", 8);
    k.cyl(f, 0.5, 0.5, TIER0 - 1.0, x, 0.5, z, PAL.gold, "metal", 16);
    k.cyl(f, 0.5, 0.78, 0.5, x, TIER0 - 0.5, z, PAL.goldPale, "metal", 16);
    for (let r = 0; r < 4; r++) k.cyl(f, 0.53, 0.53, 0.08, x, 1.4 + r * 1.3, z, PAL.goldDeep, "metal", 16);
    k.solid(f, x - 0.6, z - 0.6, x + 0.6, z + 0.6);
  }

  // ---- the aquariums at the entrance ----------------------------------------------------------------
  const tankBack = paint(256, 512, (c, W, H) => {
    const gr = c.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, "#5ad8f0");
    gr.addColorStop(0.5, "#1a7ab0");
    gr.addColorStop(1, "#0a2a5a");
    c.fillStyle = gr;
    c.fillRect(0, 0, W, H);
    c.globalAlpha = 0.25;
    c.fillStyle = "#ffffff";
    for (let i = 0; i < 10; i++) {
      c.beginPath();
      const x = (i / 10) * W;
      c.moveTo(x, 0);
      c.lineTo(x + 30, 0);
      c.lineTo(x + 70, H);
      c.lineTo(x + 50, H);
      c.fill();
    }
    c.globalAlpha = 1;
  });
  const tankBackMat = new THREE.MeshBasicMaterial({ map: tankBack, toneMapped: false });
  const tankWater = new THREE.MeshStandardMaterial({ color: "#2a9ad0", transparent: true, opacity: 0.38, roughness: 0.05, metalness: 0.2, depthWrite: false, emissive: "#0a4a6a", emissiveIntensity: 0.6 });
  for (const s of [-1, 1]) {
    const x0 = s * 5.2,
      x1 = s * 10.4;
    const cx = (x0 + x1) / 2,
      w = Math.abs(x1 - x0),
      z0 = -2.6,
      z1 = 2.6,
      H = 6.2;
    k.box(f, w + 0.4, 0.6, z1 - z0 + 0.4, cx, 0, 0, "#1a2a5a", "polish");
    k.box(f, w + 0.4, 0.4, z1 - z0 + 0.4, cx, H + 0.6, 0, PAL.gold, "metal");
    for (const xx of [x0, x1]) for (const zz of [z0, z1]) k.box(f, 0.2, H, 0.2, xx, 0.6, zz, PAL.gold, "metal");
    // sand, rocks, coral
    k.box(f, w, 0.3, z1 - z0, cx, 0.6, 0, "#e8d4a0");
    for (let i = 0; i < 9; i++) {
      const x = cx + (k.rnd(i, s, 1) - 0.5) * (w - 1),
        z = (k.rnd(i, s, 2) - 0.5) * 4;
      const col = ["#ff6a5a", "#ff9a3a", "#c84aff", "#f4d04a", "#5ad8a0"][i % 5];
      k.cyl(f, 0.25 + k.rnd(i, s, 3) * 0.3, 0.02, 0.6 + k.rnd(i, s, 4) * 1.6, x, 0.9, z, col, "matte", 6);
    }
    for (let i = 0; i < 4; i++) k.cyl(f, 0.6, 0.3, 0.5 + i * 0.2, cx + (i - 1.5) * 1.1, 0.9, (i % 2 ? 1 : -1) * 1.2, "#6a6460", "matte", 7);
    // the water: a lit backdrop on the outer side, a translucent body
    k.plane(f, z1 - z0, H, tankBackMat, s * 10.35, 0.6 + H / 2, 0, 0, s > 0 ? -Math.PI / 2 : Math.PI / 2);
    const body = new THREE.Mesh(new THREE.BoxGeometry(w - 0.1, H - 0.1, z1 - z0 - 0.1), tankWater);
    body.position.set(cx, k.y(f) + 0.6 + H / 2, 0);
    body.renderOrder = 3;
    body.raycast = () => {};
    g.add(body);
    k.fish(f, 34, { box: [Math.min(x0, x1) + 0.2, 1.1, z0 + 0.2, Math.max(x0, x1) - 0.2, H + 0.4, z1 - 0.2], seed: s + 5 });
    k.solid(f, Math.min(x0, x1) - 0.2, z0 - 0.2, Math.max(x0, x1) + 0.2, z1 + 0.2);
    k.hit(f, w, H, z1 - z0, cx, 0.6, 0, `<b>Aquarium</b><span>reef fish, 120 000 litres</span>`, () => ({ eyebrow: "Gold Atrium", title: "The entrance aquariums", stats: [["Volume", "2 × 120 000 L"], ["Fish", "68"], ["Species", "34"]] }));
    k.light(f, s * 8, 5.5, 0, "#5ac8ff", 9, 12);
  }

  // ---- reception and concierge ----------------------------------------------------------------------
  k.vox(f, "arab-desk", () => frontDesk(5), -7.4, -10.5, Math.PI / 2);
  k.vox(f, "arab-desk", () => frontDesk(5), 7.4, -10.5, -Math.PI / 2);
  for (const s of [-1, 1]) {
    const z = -10.5;
    const x = s * (hwA(z) - 0.26);
    // a gilt panel with the sail emblem behind each desk
    const emblem = paint(512, 512, (c, W, H) => {
      c.fillStyle = "#1a3a8a";
      c.fillRect(0, 0, W, H);
      c.strokeStyle = "#d9a92e";
      c.lineWidth = 14;
      c.strokeRect(14, 14, W - 28, H - 28);
      c.fillStyle = "#f0cf72";
      c.beginPath();
      c.moveTo(W * 0.62, H * 0.16);
      c.quadraticCurveTo(W * 0.2, H * 0.5, W * 0.3, H * 0.84);
      c.lineTo(W * 0.66, H * 0.84);
      c.closePath();
      c.fill();
      c.font = `700 44px ${SERIF}`;
      c.textAlign = "center";
      c.fillText(s < 0 ? "RECEPTION" : "CONCIERGE", W / 2, H * 0.95);
    });
    const p = k.plane(f, 3.2, 3.2, new THREE.MeshStandardMaterial({ map: emblem, roughness: 0.4, metalness: 0.3 }), x, 3.6, z, 0, s < 0 ? Math.PI / 2 - 0.27 : -Math.PI / 2 + 0.27);
    void p;
  }
  // the welcome screen: the chain, live
  const scr = k.screen(f, 2.6, 1.2, (c, W, H, t) => {
    c.fillStyle = "#07060c";
    c.fillRect(0, 0, W, H);
    c.fillStyle = GOLD;
    c.font = `700 30px ${SERIF}`;
    c.fillText("BURJ AL ZEC", 22, 46);
    c.font = `600 22px ${MONO}`;
    c.fillStyle = "#f6e7c4";
    c.fillText(`Block   #${k.height ? k.height.toLocaleString("en-US") : "…"}`, 22, 100);
    c.fillText(`ZEC     ${k.price ? `$${k.price.toFixed(2)}` : "…"}`, 22, 136);
    c.fillText(`Guests  shielded`, 22, 172);
    c.fillStyle = "#7fe3ff";
    c.fillText(`Fountain show in ${Math.ceil(30 - (t % 30))} s`, 22, 214);
  }, 1);
  scr.position.set(-7.4, k.y(f) + 2.4, -13.6);
  scr.rotation.y = Math.PI / 2;

  // ---- seating, palms, chandeliers -----------------------------------------------------------------
  for (const s of [-1, 1]) {
    const x = s * 9.6,
      z = -5.6;
    k.vox(f, "arab-sofa-red", () => sofa("#9a1424", 3, "#d9a92e"), x, z - 1.6, 0);
    k.vox(f, "arab-arm-gold", () => armchair("#d9a92e"), x - 1.9, z + 0.4, Math.PI / 2);
    k.vox(f, "arab-arm-gold", () => armchair("#d9a92e"), x + 1.9, z + 0.4, -Math.PI / 2);
    k.vox(f, "arab-coffee", () => coffeeTable(), x, z + 0.2, 0);
    k.vox(f, "arab-palm", () => palm(3 + s, true), s * 10, -20);
    k.vox(f, "arab-palm", () => palm(7 + s, true), s * 4.2, 3.6);
  }
  for (const [x, z] of [
    [0, -6],
    [0, -24],
  ]) {
    const ch = chandelier(1.4, 4);
    k.add(f, ch, x, TIER0 - 0.6, z);
  }

  // ---- the grand piano by the lifts: a pianist plays a Chopin waltz (src/interior/music) -------------
  {
    const piano = { x: -3.6, y: k.y(f), z: -29.6, rot: Math.PI * 0.8 };
    k.vox(f, "arab-piano", grandPiano, piano.x, piano.z, piano.rot);
    const seat = pianoSeat(piano);
    k.vox(f, "arab-pbench", pianoBench, seat.x, seat.z, piano.rot, { solid: false });
    pianist(g, piano, { place: "arab", floor: f, track: "piano-waltz", id: 1849, level: 0.85, ref: 4 });
  }

  // ---- the panoramic lifts on the back wall, gliding up and down ------------------------------------
  const capsMat = new THREE.MeshStandardMaterial({ color: "#a8d8f0", transparent: true, opacity: 0.35, roughness: 0.05, metalness: 0.5, depthWrite: false });
  const capsFrame = new THREE.MeshStandardMaterial({ color: "#d9a92e", metalness: 0.95, roughness: 0.2 });
  const capsLight = new THREE.MeshBasicMaterial({ color: new THREE.Color("#fff0c8").multiplyScalar(1.6), toneMapped: false });
  for (const s of [-1, 1]) {
    const cap = new THREE.Group();
    cap.add(new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 2.6, 20, 1, true), capsMat));
    const ring1 = new THREE.Mesh(new THREE.CylinderGeometry(1.08, 1.08, 0.25, 20), capsFrame);
    ring1.position.y = -1.3;
    const ring2 = ring1.clone();
    ring2.position.y = 1.3;
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.05, 16), capsLight);
    lamp.position.y = 1.15;
    cap.add(ring1, ring2, lamp);
    cap.traverse((o) => ((o as THREE.Mesh).raycast = () => {}));
    cap.position.set(s * 2.6, 20, Z0 + 1.6);
    g.add(cap);
    k.box(f, 0.12, TOP - TIER0, 0.12, s * 2.6 - 1.05, TIER0, Z0 + 0.6, PAL.gold, "metal");
    k.box(f, 0.12, TOP - TIER0, 0.12, s * 2.6 + 1.05, TIER0, Z0 + 0.6, PAL.gold, "metal");
    const ph = s > 0 ? 0 : 2.4;
    k.ticks[f].push((_dt, t) => {
      const u = (Math.sin(t * 0.12 + ph) + 1) / 2;
      cap.position.y = k.y(f) + TIER0 + 2 + u * (TOP - TIER0 - 6);
    });
  }
  k.lifts(f, 0, Z0 + 0.2, 0);
  k.label(f, "BURJ AL ZEC", 0, 5.6, Z0 + 0.3, { h: 0.7, color: GOLD, font: `700 96px ${SERIF}` });

  // the rest of the light
  k.light(f, 0, 5.5, 2, "#ffe2b0", 10, 16);
  k.light(f, 0, TIER0 + 26, -12, "#ffd890", 30, 60);
  k.light(f, 0, 5, -27, "#ffe2b0", 10, 14);

  // ---- people --------------------------------------------------------------------------------------
  k.onCast(f, () => {
    void k.person(f, 4012, [-2.4, 3.6], "Doorman", { face: [0, -1], lines: ["Welcome to the Burj Al ZEC. Your arrival was not recorded.", "Valet takes the car. Nobody takes your address.", "Shielded guests, this way. Transparent ones… also this way, but slower."] });
    void k.person(f, 777, [-9.0, -10.5], "Receptionist", { face: [1, 0], lines: ["Your suite is paid. By whom? We will never know. Lovely.", "Check-in takes one block. About seventy-five seconds.", "A transparent address? There is a hostel on the Palm.", () => `Block ${k.height ? k.height.toLocaleString("en-US") : "…"}. Your key card is ready.`] });
    void k.person(f, 2311, [9.0, -10.5], "Concierge", { face: [-1, 0], lines: ["The helicopter leaves from the top. Next block, sir.", "Al Mahara is downstairs. The fish are the only ones watching you.", "Tennis on the helipad? Bring spare balls. Many spare balls."] });
    void k.person(f, 5120, [3.2, -9], "Butler", { wander: [[3.2, -9], [-3, -20], [4, -22], [-4, -8]], lines: ["I'll press your shirts and back up your seed phrase. Separately.", "Your gold iPad is on the bed. The iPad is from 2012. The gold is forever."] });
    void k.person(f, 9001, [6.5, -1.2], "Influencer", { face: [-1, 0.2], lines: ["Story time: gold everything. Receipt? Shielded, sorry.", "Hashtag no doxx.", "Do I look rich in this light? Don't answer. Zero knowledge."] });
    // two guests at the fountain
    const a = k.person(f, 1337, [-3.6, -9.4], "Guest", { face: [1, 0] });
    const b = k.person(f, 4242, [-1.6, -9.0], "Guest", { face: [-1, 0] });
    k.dialog(f, [a, b], [
      [0, "I paid for the Royal Suite in shielded ZEC."],
      [1, "How much was it?"],
      [0, "That's the beauty of it. Nobody knows. Not even me."],
      [1, "Is that fountain plated in gold?"],
      [0, "Everything is. I asked them to plate my viewing key."],
      [1, "Please don't."],
    ]);
    const c = k.person(f, 6060, [5.6, -18.6], "Tourist", { face: [-1, 0.3] });
    const d = k.person(f, 3003, [7.2, -17.0], "Security", { face: [-1, -0.4] });
    k.dialog(f, [c, d], [
      [0, "I just came to look. Is looking free?"],
      [1, "Looking is free. Photos are five ZEC."],
      [0, "Can I pay with a transparent address?"],
      [1, "Then everybody will know you paid five ZEC for a photo."],
    ]);
    const e = k.person(f, 8123, [9.2, -6.9], "Whale", { sit: true, face: [0, 1] }); // on the red sofa, not the coffee table
    const h = k.person(f, 2024, [10.2, -6.6], "Accountant", { face: [-0.4, 1] });
    k.dialog(f, [e, h], [
      [1, "Sir, where did the money go?"],
      [0, "I can prove it went somewhere nice."],
      [1, "Can you show me?"],
      [0, "No. That's what makes it a proof."],
    ]);
  });
  void g;
}
