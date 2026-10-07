import * as THREE from "three";
import { BBKit, canvasTex, gearGeo, handAngles, londonTime, LY, ROOM_H, SERIF, shell, SHELL_WINDOWS, TC, TOWER, type Zone } from "./kit";
import { windowBars } from "./hall";

/**
 * The Clock Room (step 262): the Great Clock of 1859 on its cast-iron bed, three trains side by side
 * (the hour striking train, the going train with Grimthorpe's double three-legged gravity
 * escapement and its fly, the quarter chiming train), the pendulum swinging in its pit under a glass
 * floor with the old pennies on its bob, the leading-off rods rising to the dials.
 *
 * Behind the Dials (step 286): the four opal-glass dials in their iron frames, the city through the
 * glass, the hands' silhouettes turning outside on London time, the motion work in the middle.
 */
export function buildClock(k: BBKit) {
  const z: Zone = "clock";
  const g = k.groups.clock;
  const L = LY.clock,
    H = ROOM_H.clock;
  const V = (x: number, y: number, zz: number) => new THREE.Vector3(x, y, zz);
  const boards = new THREE.MeshStandardMaterial({ map: planks(), roughness: 0.85 });
  const PIT: [number, number, number, number] = [-2.0, -61.2, 0.0, -59.8];
  shell(k, z, L, H, { floor: boards, windows: { y0: 1.0, y1: 2.6, w: 0.9 }, pit: PIT });
  windowBars(k, z, SHELL_WINDOWS.map(([a, f, c]) => [a, f, c, L + 1.0, L + 2.6] as ["x" | "z", number, number, number, number]), 0.9);
  // whitewashed upper walls: a band of light paint over the stone
  const wash = new THREE.MeshStandardMaterial({ color: "#e8e2d2", roughness: 0.95 });
  for (const [x0, z0, x1, z1] of [
    [TOWER.x0, TOWER.z0, TOWER.x1, TOWER.z0],
    [TOWER.x0, TOWER.z0, TOWER.x0, TOWER.z1],
  ] as [number, number, number, number][]) {
    if (z0 === z1) k.box(z, wash, x1 - x0, 0.6, 0.02, (x0 + x1) / 2, L + H - 0.6, z0 + 0.02);
    else k.box(z, wash, 0.02, 0.6, z1 - z0, x0 + 0.02, L + H - 0.6, (z0 + z1) / 2);
  }

  // ---- the bed and the trains -----------------------------------------------------------------
  const MX = -1.0,
    MZ = -57.6; // centre of the mechanism
  const bedLen = 4.8;
  for (const dz of [-0.55, 0.55]) {
    k.box(z, k.green, bedLen, 0.2, 0.22, MX, L + 0.9, MZ + dz);
    k.box(z, k.gold, bedLen, 0.03, 0.23, MX, L + 1.1, MZ + dz);
  }
  for (const dx of [-2.2, 0, 2.2]) for (const dz of [-0.55, 0.55]) k.box(z, k.green, 0.22, 0.9, 0.22, MX + dx, L, MZ + dz);
  for (const dx of [-2.2, 2.2]) k.box(z, k.green, 0.22, 0.12, 1.32, MX + dx, L + 0.5, MZ);
  k.solid(z, MX - bedLen / 2 - 0.15, MZ - 0.75, MX + bedLen / 2 + 0.15, MZ + 0.75);
  const wheels: { m: THREE.Object3D; speed: number; kind: "going" | "strike" | "chime" }[] = [];
  const wheel = (x: number, y: number, r: number, teeth: number, kind: "going" | "strike" | "chime", speed: number, spokes = 4) => {
    const m = new THREE.Mesh(gearGeo(r, teeth, 0.05, 0.05, r > 0.18 ? spokes : 0), k.brass);
    m.position.set(MX + x, L + y, MZ + (kind === "going" ? 0 : kind === "strike" ? -0.18 : 0.18));
    g.add(m);
    const arbor = new THREE.CylinderGeometry(0.025, 0.025, 1.12, 6);
    arbor.rotateX(Math.PI / 2);
    arbor.translate(MX + x, L + y, MZ);
    k.geo(z, k.iron, arbor);
    wheels.push({ m, speed, kind });
    return m;
  };
  // frames: three pairs of cast-iron A-frames, green with gilt lines
  const frame = (x: number, h: number) => {
    for (const dz of [-0.5, 0.5]) {
      k.beam(z, k.green, V(MX + x - 0.55, L + 1.1, MZ + dz), V(MX + x - 0.1, L + h, MZ + dz), 0.12, 0.06);
      k.beam(z, k.green, V(MX + x + 0.55, L + 1.1, MZ + dz), V(MX + x + 0.1, L + h, MZ + dz), 0.12, 0.06);
      k.beam(z, k.green, V(MX + x - 0.35, L + 1.6, MZ + dz), V(MX + x + 0.35, L + 1.6, MZ + dz), 0.08, 0.06);
      k.box(z, k.gold, 0.3, 0.06, 0.07, MX + x, L + h - 0.03, MZ + dz);
    }
  };
  // striking train (hours): the great barrel with its wire, wheels, the big fly
  frame(-1.6, 2.4);
  const barrelS = new THREE.CylinderGeometry(0.34, 0.34, 0.8, 24);
  barrelS.rotateX(Math.PI / 2);
  barrelS.translate(MX - 1.6, L + 1.5, MZ);
  k.geo(z, k.iron, barrelS);
  for (let i = 0; i < 9; i++) {
    const ring = new THREE.TorusGeometry(0.35, 0.012, 4, 24);
    ring.translate(MX - 1.6, L + 1.5, MZ - 0.36 + i * 0.09);
    k.geo(z, k.brass, ring);
  }
  wheel(-1.6, 1.5, 0.55, 96, "strike", 0.25, 6);
  wheel(-1.25, 2.0, 0.22, 40, "strike", -0.8);
  wheel(-1.6, 2.3, 0.14, 24, "strike", 2.4);
  const flyS = fly(k, MX - 1.6, L + 2.55, MZ, 0.7);
  g.add(flyS);
  // going train: great wheel, centre wheel, escape, the gravity escapement and its fly
  frame(0, 2.6);
  wheel(-0.2, 1.4, 0.42, 80, "going", 0.02, 6);
  wheel(0.25, 1.75, 0.26, 48, "going", -0.12);
  wheel(-0.1, 2.15, 0.16, 30, "going", 0.5);
  // the double three-legged gravity escapement: two star wheels and the two gravity arms
  const legs = new THREE.Group();
  for (const dz of [-0.12, 0.12]) {
    const star = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.42, 0.03).translate(0, 0.21, 0), k.brass);
      leg.rotation.z = (i / 3) * Math.PI * 2 + (dz > 0 ? Math.PI / 3 : 0);
      star.add(leg);
    }
    star.position.z = dz;
    legs.add(star);
  }
  legs.position.set(MX, L + 2.42, MZ);
  g.add(legs);
  for (const s of [-1, 1]) k.beam(z, k.gold, V(MX + s * 0.05, L + 2.85, MZ), V(MX + s * 0.42, L + 1.9, MZ), 0.04, 0.04);
  const flyG = fly(k, MX, L + 2.95, MZ, 0.45);
  g.add(flyG);
  // quarter chiming train: the pinned cam barrel, wheels, fly
  frame(1.6, 2.4);
  const cam = new THREE.Group();
  const camBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.8, 24).rotateX(Math.PI / 2), k.iron);
  cam.add(camBarrel);
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    const pin = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.05), k.brass);
    pin.position.set(Math.cos(a) * 0.3, Math.sin(a) * 0.3, -0.33 + ((i * 7) % 5) * 0.16);
    cam.add(pin);
  }
  cam.position.set(MX + 1.6, L + 1.5, MZ);
  g.add(cam);
  wheel(1.95, 1.9, 0.3, 60, "chime", -0.3);
  wheel(1.6, 2.3, 0.14, 24, "chime", 2.2);
  const flyC = fly(k, MX + 1.6, L + 2.55, MZ, 0.6);
  g.add(flyC);
  // the leading-off rod up through the ceiling to the dials
  k.beam(z, k.iron, V(MX, L + 2.95, MZ), V(TC.x, L + H + 0.3, TC.z), 0.05, 0.05);
  k.box(z, k.green, 0.3, 0.3, 0.3, TC.x, L + H - 0.3, TC.z);

  // ---- the pendulum and its pit -----------------------------------------------------------------
  const PX = (PIT[0] + PIT[2]) / 2,
    PZ = (PIT[1] + PIT[3]) / 2;
  const pitD = 4.3;
  const pitMat = new THREE.MeshStandardMaterial({ color: "#8e7d5e", roughness: 0.9, side: THREE.DoubleSide });
  k.box(z, pitMat, PIT[2] - PIT[0], 0.1, PIT[3] - PIT[1], PX, L - pitD, PZ);
  for (const s of [-1, 1]) {
    k.box(z, pitMat, 0.05, pitD, PIT[3] - PIT[1], s < 0 ? PIT[0] : PIT[2], L - pitD, PZ);
    k.box(z, pitMat, PIT[2] - PIT[0], pitD, 0.05, PX, L - pitD, s < 0 ? PIT[1] : PIT[3]);
  }
  k.box(z, k.warm, 0.3, 0.06, 0.3, PX + 0.7, L - 0.4, PZ);
  const pitGlass = new THREE.Mesh(new THREE.PlaneGeometry(PIT[2] - PIT[0], PIT[3] - PIT[1]).rotateX(-Math.PI / 2), k.glass);
  pitGlass.position.set(PX, L + 0.01, PZ);
  g.add(pitGlass);
  for (const s of [-1, 1]) {
    k.box(z, k.brass, PIT[2] - PIT[0] + 0.1, 0.05, 0.05, PX, L, s < 0 ? PIT[1] : PIT[3]);
    k.box(z, k.brass, 0.05, 0.05, PIT[3] - PIT[1], s < 0 ? PIT[0] : PIT[2], L, PZ);
  }
  // suspension from the bed, rod, the bob with the pennies
  k.box(z, k.green, 0.4, 0.15, 0.5, PX, L + 0.75, PZ + 0.4);
  const pend = new THREE.Group();
  pend.position.set(PX, L + 0.75, PZ);
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 3.9).translate(0, -1.95, 0), k.iron);
  const bob = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.42, 24).translate(0, -3.9, 0), k.iron);
  const shelf = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.03, 12).translate(0, -3.5, 0), k.brass);
  pend.add(rod, bob, shelf);
  for (let i = 0; i < 5; i++) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.004, 10).translate(0.03, -3.483 + i * 0.005, 0), k.bronze);
    pend.add(p);
  }
  g.add(pend);
  k.pick(z, bob, "<b>The pendulum</b><span>pennies on the bob</span>", () => ({
    eyebrow: "The Great Clock",
    title: "The pendulum",
    stats: [
      ["Length", "3.9 m"],
      ["Bob", "300 kg"],
      ["Beat", "every 2 s"],
      ["One penny", "−0.4 s a day"],
    ],
  }));
  // the clock's plaque
  const plate = k.plaque(["THE GREAT CLOCK", "E. B. DENISON · E. J. DENT · 1859"], 1.6, 0.42);
  plate.position.set(MX, L + 0.6, MZ + 0.67);
  g.add(plate);
  const mechPick = new THREE.Mesh(new THREE.BoxGeometry(bedLen, 2.0, 1.2), new THREE.MeshBasicMaterial({ visible: false }));
  mechPick.position.set(MX, L + 1.9, MZ);
  g.add(mechPick);
  k.pick(z, mechPick, "<b>The Great Clock</b><span>1859</span>", () => {
    const t = londonTime();
    return {
      eyebrow: "Clock Room",
      title: "The Great Clock",
      stats: [
        ["Started", "31 May 1859"],
        ["Trains", "going · hour · quarters"],
        ["Escapement", "double three-legged gravity"],
        ["London", `${String(t.h).padStart(2, "0")}:${String(t.m).padStart(2, "0")}`],
      ],
    };
  });

  // ---- the workbench, the regulator on the wall --------------------------------------------
  {
    const bx = 6.9;
    k.box(z, k.oak, 1.0, 0.9, 4.2, bx, L, -61);
    k.box(z, k.oakDk, 1.1, 0.06, 4.3, bx, L + 0.9, -61);
    k.solid(z, bx - 0.55, -63.2, 8, -58.8);
    const board = new THREE.MeshStandardMaterial({ color: "#3a2a1a", roughness: 0.8 });
    k.box(z, board, 0.05, 1.3, 4, 7.9, L + 1.2, -61);
    for (let i = 0; i < 12; i++) k.box(z, i % 3 ? k.iron : k.brass, 0.05, 0.25 + (i % 4) * 0.1, 0.06, 7.85, L + 1.5 + (i % 2) * 0.5, -62.7 + i * 0.3);
    // oil cans, a log book, a lamp
    k.cyl(z, k.brass, 0.08, 0.2, bx - 0.2, L + 0.96, -60, 10);
    k.beam(z, k.brass, V(bx - 0.2, L + 1.12, -60), V(bx - 0.45, L + 1.25, -60), 0.02, 0.02);
    k.box(z, k.red, 0.3, 0.06, 0.42, bx - 0.1, L + 0.96, -61.6);
    k.box(z, k.warm, 0.14, 0.2, 0.14, bx + 0.2, L + 0.96, -62.6);
  }
  const reg = document.createElement("canvas");
  reg.width = reg.height = 256;
  const regT = new THREE.CanvasTexture(reg);
  regT.colorSpace = THREE.SRGBColorSpace;
  const drawReg = () => {
    const c = reg.getContext("2d")!;
    c.fillStyle = "#f2ead6";
    c.beginPath();
    c.arc(128, 128, 124, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = "#2a2018";
    c.lineWidth = 6;
    c.stroke();
    c.fillStyle = "#2a2018";
    c.font = `600 26px ${SERIF}`;
    c.textAlign = "center";
    c.textBaseline = "middle";
    ["XII", "I", "II", "III", "IIII", "V", "VI", "VII", "VIII", "IX", "X", "XI"].forEach((n, i) => {
      const a = (i / 12) * Math.PI * 2;
      c.fillText(n, 128 + Math.sin(a) * 96, 128 - Math.cos(a) * 96);
    });
    const { hour, minute, t } = handAngles();
    const hand = (a: number, len: number, w: number) => {
      c.lineWidth = w;
      c.beginPath();
      c.moveTo(128, 128);
      c.lineTo(128 + Math.sin(a) * len, 128 - Math.cos(a) * len);
      c.stroke();
    };
    hand(hour, 56, 8);
    hand(minute, 86, 5);
    c.strokeStyle = "#a01818";
    hand((t.s / 60) * Math.PI * 2, 90, 2);
    regT.needsUpdate = true;
  };
  drawReg();
  const regM = new THREE.Mesh(new THREE.CircleGeometry(0.4, 32), new THREE.MeshBasicMaterial({ map: regT }));
  regM.position.set(TOWER.x0 + 0.08, L + 1.9, -58);
  regM.rotation.y = Math.PI / 2;
  g.add(regM);
  k.box(z, k.oakDk, 0.08, 1.9, 0.9, TOWER.x0 + 0.02, L + 0.7, -58);
  k.pick(z, regM, "<b>London</b><span>regulator</span>", () => {
    const t = londonTime();
    return { eyebrow: "Clock Room", title: "London time", mono: true, stats: [["Time", `${String(t.h).padStart(2, "0")}:${String(t.m).padStart(2, "0")}:${String(Math.floor(t.s)).padStart(2, "0")}`]] };
  });
  // lamps
  for (const [x, zz] of [
    [-1, -57.6],
    [4, -60],
    [-5, -52],
  ])
    k.box(z, k.warm, 0.5, 0.06, 0.5, x, L + H - 0.08, zz);

  // ---- motion: pendulum, escapement steps, wheels; trains run on a strike / a chime -------
  let beat = -1,
    stepT = 1,
    strikeT = 0,
    chimeT = 0;
  const legsFrom = { a: 0 };
  let regAcc = 0;
  k.ticks.clock.push((dt, t) => {
    pend.rotation.z = Math.sin((t * Math.PI * 2) / 4) * 0.055;
    const b = Math.floor(t / 2);
    if (b !== beat) {
      beat = b;
      stepT = 0;
      legsFrom.a = legs.rotation.z;
    }
    stepT = Math.min(1, stepT + dt * 6);
    const e = 1 - Math.pow(1 - stepT, 3);
    legs.rotation.z = legsFrom.a - (Math.PI / 3) * e * (stepT < 1 ? 1 : 1) + (stepT >= 1 ? 0 : 0);
    if (stepT >= 1) legsFrom.a = legs.rotation.z;
    flyG.rotation.y += dt * (stepT < 1 ? 14 : 0.4);
    strikeT = Math.max(0, strikeT - dt);
    chimeT = Math.max(0, chimeT - dt);
    flyS.rotation.y += dt * (strikeT > 0 ? 22 : 0);
    flyC.rotation.y += dt * (chimeT > 0 ? 20 : 0);
    cam.rotation.z -= dt * (chimeT > 0 ? 0.5 : 0);
    for (const w of wheels) {
      const run = w.kind === "going" ? 1 : w.kind === "strike" ? (strikeT > 0 ? 6 : 0) : chimeT > 0 ? 6 : 0;
      w.m.rotation.z += dt * w.speed * run;
    }
    regAcc += dt;
    if (regAcc > 0.5) {
      regAcc = 0;
      drawReg();
    }
  });
  return {
    strike() {
      strikeT = 3;
    },
    chime(seconds: number) {
      chimeT = seconds;
    },
  };
}

/** A fly (air brake): two vanes on a vertical arbor. */
function fly(k: BBKit, x: number, y: number, z: number, span: number) {
  const f = new THREE.Group();
  f.position.set(x, y, z);
  f.add(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 6), k.iron));
  for (const s of [-1, 1]) {
    const v = new THREE.Mesh(new THREE.BoxGeometry(span / 2, 0.24, 0.015), k.green);
    v.position.set((s * span) / 4, 0.08, 0);
    f.add(v);
  }
  return f;
}

/** Wide floorboards, scrubbed oak. */
function planks() {
  return canvasTex(512, 512, (c, w, h) => {
    for (let i = 0; i < 8; i++) {
      const k2 = 0.85 + ((i * 37) % 7) / 30;
      c.fillStyle = `rgb(${150 * k2},${112 * k2},${74 * k2})`;
      c.fillRect(0, (i * h) / 8, w, h / 8);
      c.fillStyle = "rgba(40,25,10,0.5)";
      c.fillRect(0, (i * h) / 8, w, 2);
      c.fillRect(((i * 173) % w) | 0, (i * h) / 8, 2, h / 8);
      for (let n = 0; n < 40; n++) {
        c.fillStyle = "rgba(60,40,20,0.12)";
        c.fillRect(((n * 97 + i * 31) % w) | 0, (i * h) / 8 + ((n * 13) % (h / 8)), 30 + (n % 5) * 12, 1);
      }
    }
  }, [1, 1]);
}

export const PLANKS = planks;

/** The four dials. Hands outside, turning on London time; opal glass; the motion work. */
export function buildDials(k: BBKit) {
  const z: Zone = "dials";
  const g = k.groups.dials;
  const L = LY.dials,
    H = ROOM_H.dials;
  const R = 3.2;
  const CY = L + 3.7;
  const T = TOWER;
  const V = (x: number, y: number, zz: number) => new THREE.Vector3(x, y, zz);
  const boards = new THREE.MeshStandardMaterial({ map: planks(), roughness: 0.85 });
  // floor and ceiling; walls are drawn with the round openings
  shell(k, z, L, H, { floor: boards, windows: undefined, wall: new THREE.MeshBasicMaterial({ visible: false }) });
  const wallMat = new THREE.MeshStandardMaterial({ map: k.stoneTex.clone(), roughness: 0.9 });
  (wallMat.map as THREE.Texture).repeat.set(1 / 2.4, 1 / 2.4);
  (wallMat.map as THREE.Texture).needsUpdate = true;
  // the dial: opal glass panes in an iron framework, the numerals (seen from behind, mirrored)
  const glassTex = canvasTex(1024, 1024, (c, w, h) => {
    const cx = w / 2,
      cy = h / 2,
      rr = w / 2 - 4;
    const grd = c.createRadialGradient(cx, cy, 10, cx, cy, rr);
    grd.addColorStop(0, "#fffaf0");
    grd.addColorStop(1, "#efe4c8");
    c.fillStyle = grd;
    c.beginPath();
    c.arc(cx, cy, rr, 0, Math.PI * 2);
    c.fill();
    // panes: subtle per-piece tint
    for (let ring = 0; ring < 6; ring++)
      for (let i = 0; i < 52; i++) {
        const a0 = (i / 52) * Math.PI * 2,
          a1 = ((i + 1) / 52) * Math.PI * 2;
        const r0 = (ring / 6) * rr,
          r1 = ((ring + 1) / 6) * rr;
        c.fillStyle = `rgba(${200 + ((i * 7 + ring * 13) % 40)},${180 + ((i * 11) % 30)},${140},0.08)`;
        c.beginPath();
        c.arc(cx, cy, r1, a0, a1);
        c.arc(cx, cy, r0, a1, a0, true);
        c.fill();
      }
    c.strokeStyle = "#2a2622";
    // the iron framework: concentric rings and radial bars (a pattern of 312 pieces)
    c.lineWidth = 7;
    for (let ring = 1; ring <= 6; ring++) {
      c.beginPath();
      c.arc(cx, cy, (ring / 6) * rr, 0, Math.PI * 2);
      c.stroke();
    }
    for (let i = 0; i < 52; i++) {
      const a = (i / 52) * Math.PI * 2;
      const r0 = i % 4 === 0 ? 0.12 : 1 / 3;
      c.lineWidth = i % 13 === 0 ? 10 : 4;
      c.beginPath();
      c.moveTo(cx + Math.cos(a) * rr * r0, cy + Math.sin(a) * rr * r0);
      c.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
      c.stroke();
    }
    // numerals and minute marks, seen through the glass from behind: mirrored and faint
    c.save();
    c.translate(w, 0);
    c.scale(-1, 1);
    c.fillStyle = "rgba(20,18,16,0.55)";
    c.font = `700 92px ${SERIF}`;
    c.textAlign = "center";
    c.textBaseline = "middle";
    ["XII", "I", "II", "III", "IIII", "V", "VI", "VII", "VIII", "IX", "X", "XI"].forEach((n, i) => {
      const a = (i / 12) * Math.PI * 2;
      c.save();
      c.translate(cx + Math.sin(a) * rr * 0.78, cy - Math.cos(a) * rr * 0.78);
      c.rotate(a);
      c.fillText(n, 0, 0);
      c.restore();
    });
    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * Math.PI * 2;
      c.fillRect(cx + Math.sin(a) * rr * 0.93 - 4, cy - Math.cos(a) * rr * 0.93 - 4, 8, 8);
    }
    c.restore();
  });
  const dialMat = new THREE.MeshBasicMaterial({ map: glassTex, transparent: true, opacity: 0.62, depthWrite: false, toneMapped: false, color: new THREE.Color(1, 1, 1) });
  k.dayNight.push((n) => {
    dialMat.opacity = n ? 0.93 : 0.6;
    dialMat.color.set(n ? new THREE.Color(1.5, 1.22, 0.78) : new THREE.Color(1.05, 1.03, 0.98));
  });
  const handMat = new THREE.MeshBasicMaterial({ color: "#141210", side: THREE.DoubleSide, transparent: true, opacity: 0.82, depthWrite: false });
  const handShape = (len: number, w: number, tail: number) => {
    const s = new THREE.Shape();
    s.moveTo(-w * 0.35, -tail);
    s.lineTo(w * 0.35, -tail);
    s.lineTo(w * 0.5, 0);
    s.lineTo(w * 0.45, len * 0.75);
    s.lineTo(w * 1.1, len * 0.8);
    s.lineTo(0, len);
    s.lineTo(-w * 1.1, len * 0.8);
    s.lineTo(-w * 0.45, len * 0.75);
    s.lineTo(-w * 0.5, 0);
    s.lineTo(-w * 0.35, -tail);
    return new THREE.ShapeGeometry(s);
  };
  const minuteGeo = handShape(R * 0.92, 0.12, 0.7);
  const hourGeo = handShape(R * 0.6, 0.18, 0.45);
  const hands: { n: THREE.Vector3; base: THREE.Quaternion; h: THREE.Mesh; m: THREE.Mesh }[] = [];
  const dials: { name: string; n: THREE.Vector3; c: THREE.Vector3 }[] = [
    { name: "South dial", n: V(0, 0, 1), c: V(TC.x, CY, T.z1) },
    { name: "North dial", n: V(0, 0, -1), c: V(TC.x, CY, T.z0) },
    { name: "East dial", n: V(1, 0, 0), c: V(T.x1, CY, TC.z) },
    { name: "West dial", n: V(-1, 0, 0), c: V(T.x0, CY, TC.z) },
  ];
  for (const d of dials) {
    const base = new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), d.n);
    if (d.n.z < -0.5) base.setFromAxisAngle(V(0, 1, 0), Math.PI);
    // the wall: a stone plate with the round opening (built facing +z, turned outward)
    const sh = new THREE.Shape();
    sh.moveTo(-8.5, 0);
    sh.lineTo(8.5, 0);
    sh.lineTo(8.5, H + 0.3);
    sh.lineTo(-8.5, H + 0.3);
    sh.lineTo(-8.5, 0);
    const hole = new THREE.Path();
    hole.absarc(0, CY - L, R + 0.05, 0, Math.PI * 2, true);
    sh.holes.push(hole);
    const wg = new THREE.ExtrudeGeometry(sh, { depth: 0.5, bevelEnabled: false, curveSegments: 48 });
    wg.translate(0, 0, -0.5);
    wg.applyQuaternion(base);
    wg.translate(d.c.x, L, d.c.z);
    k.geo(z, wallMat, wg);
    // the iron rim and the glass
    const rim = new THREE.TorusGeometry(R + 0.04, 0.09, 8, 64);
    rim.applyQuaternion(base);
    rim.translate(d.c.x - d.n.x * 0.1, CY, d.c.z - d.n.z * 0.1);
    k.geo(z, k.iron, rim);
    const glass = new THREE.Mesh(new THREE.CircleGeometry(R + 0.02, 64), dialMat);
    glass.quaternion.copy(base);
    // the front face of the circle looks along +z: from inside we see its back, so flip it inward
    glass.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), Math.PI));
    glass.position.copy(d.c).addScaledVector(d.n, -0.12);
    glass.renderOrder = 2;
    g.add(glass);
    k.pick(z, glass, `<b>${d.name}</b><span>312 pieces of opal glass</span>`, () => {
      const t = londonTime();
      return {
        eyebrow: "Behind the Dials",
        title: d.name,
        stats: [
          ["Diameter", "7 m"],
          ["Glass", "312 pieces"],
          ["Minute hand", "4.2 m"],
          ["London", `${String(t.h).padStart(2, "0")}:${String(t.m).padStart(2, "0")}`],
        ],
      };
    });
    // the hands, outside the glass
    const h = new THREE.Mesh(hourGeo, handMat),
      m = new THREE.Mesh(minuteGeo, handMat);
    for (const [mesh, off] of [
      [h, -0.15],
      [m, -0.17],
    ] as [THREE.Mesh, number][]) {
      // the hands are outside; from in here they are their shadows on the glass
      mesh.position.copy(d.c).addScaledVector(d.n, off);
      mesh.renderOrder = 3;
      g.add(mesh);
    }
    hands.push({ n: d.n, base, h, m });
    // the motion work at the centre, the rod back to the middle of the room
    const boss = new THREE.CylinderGeometry(0.22, 0.22, 0.35, 16);
    boss.rotateX(Math.PI / 2);
    boss.applyQuaternion(base);
    boss.translate(d.c.x - d.n.x * 0.35, CY, d.c.z - d.n.z * 0.35);
    k.geo(z, k.green, boss);
    k.beam(z, k.iron, V(TC.x, CY, TC.z), d.c.clone().addScaledVector(d.n, -0.5), 0.06, 0.06);
    // a rail before the dial, lamps on the floor that light it at night
    const inner = d.c.clone().addScaledVector(d.n, -1.3);
    const tang = V(-d.n.z, 0, d.n.x);
    const a = inner.clone().addScaledVector(tang, -3.4),
      b = inner.clone().addScaledVector(tang, 3.4);
    for (const y of [0.55, 1.05]) k.beam(z, k.brass, a.clone().setY(L + y), b.clone().setY(L + y), 0.04, 0.04);
    for (let i = 0; i <= 6; i++) {
      const p = a.clone().lerp(b, i / 6);
      k.box(z, k.brass, 0.05, 1.08, 0.05, p.x, L, p.z);
    }
    k.solid(z, Math.min(a.x, b.x) - 0.08, Math.min(a.z, b.z) - 0.08, Math.max(a.x, b.x) + 0.08, Math.max(a.z, b.z) + 0.08);
    for (let i = -2; i <= 2; i++) {
      const p = d.c.clone().addScaledVector(d.n, -0.6).addScaledVector(tang, i * 1.2);
      k.box(z, k.iron, 0.3, 0.2, 0.3, p.x, L, p.z);
      k.box(z, k.warm, 0.22, 0.06, 0.22, p.x, L + 0.2, p.z);
    }
  }
  // the outer walls' collisions
  k.solid(z, T.x0 - 0.5, T.z0 - 0.5, T.x1 + 0.5, T.z0);
  k.solid(z, T.x0 - 0.5, T.z1, T.x1 + 0.5, T.z1 + 0.5);
  k.solid(z, T.x0 - 0.5, T.z0, T.x0, T.z1);
  k.solid(z, T.x1, T.z0, T.x1 + 0.5, T.z1);
  // the central gearbox and its rod down to the clock
  k.box(z, k.green, 0.6, 0.6, 0.6, TC.x, CY - 0.3, TC.z);
  k.box(z, k.gold, 0.64, 0.05, 0.64, TC.x, CY + 0.3, TC.z);
  k.cyl(z, k.iron, 0.04, CY - L, TC.x, L, TC.z, 8);
  k.box(z, k.green, 0.5, 0.15, 0.5, TC.x, L, TC.z);
  k.solid(z, TC.x - 0.3, TC.z - 0.3, TC.x + 0.3, TC.z + 0.3);
  const bevel = new THREE.Mesh(gearGeo(0.28, 24, 0.05, 0.05), k.brass);
  bevel.rotation.x = Math.PI / 2;
  bevel.position.set(TC.x, CY + 0.42, TC.z);
  g.add(bevel);
  // the beams of the floor above
  for (const zz of [-62, -58, -54, -50]) k.box(z, k.oakDk, 16, 0.35, 0.3, 0, L + H - 0.35, zz);

  const q = new THREE.Quaternion();
  k.ticks.dials.push((dt) => {
    const { hour, minute } = handAngles();
    for (const hd of hands) {
      // seen from outside the hands turn clockwise: a turn of −θ round the outward normal
      hd.h.quaternion.copy(q.setFromAxisAngle(hd.n, -hour)).multiply(hd.base);
      hd.m.quaternion.copy(q.setFromAxisAngle(hd.n, -minute)).multiply(hd.base);
    }
    bevel.rotation.z += dt * 0.05;
  });
}
