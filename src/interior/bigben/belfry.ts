import * as THREE from "three";
import { sayAt } from "../../scene/speech";
import { BBKit, canvasTex, LY, ROOM_H, SC, shell, SHELL_WINDOWS, TC, TOWER, type Zone } from "./kit";
import { windowBars } from "./hall";
import { PLANKS } from "./clock";

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** A bell's section turned round its axis: lip at y = 0, crown at the top, `r` its lip radius. */
function bellGeo(r: number) {
  const k = r / 1.37;
  const pts = [
    [0, 2.06],
    [0.55, 1.98],
    [0.7, 1.84],
    [0.74, 1.5],
    [0.82, 0.9],
    [1.02, 0.42],
    [1.2, 0.12],
    [1.27, 0],
    [1.37, 0],
    [1.31, 0.13],
    [1.12, 0.42],
    [0.92, 0.9],
    [0.84, 1.5],
    [0.8, 1.9],
    [0.62, 2.12],
    [0.3, 2.2],
    [0, 2.22],
  ].map(([x, y]) => new THREE.Vector2(x * k, y * k));
  return new THREE.LatheGeometry(pts, 48);
}

/** The sound of a bell: its partials (hum, prime, tierce, quint, nominal…) dying away. */
let audio: AudioContext | null = null;
export function bellSound(freq: number, gain: number, dur = 6, delay = 0) {
  try {
    if (document.hidden || gain <= 0) return;
    audio ??= new AudioContext();
    const ac = audio;
    if (ac.state === "suspended") void ac.resume();
    const t = ac.currentTime + 0.02 + delay;
    const out = ac.createGain();
    out.gain.value = gain;
    const comp = ac.createDynamicsCompressor();
    out.connect(comp).connect(ac.destination);
    const P: [number, number, number][] = [
      [0.5, 0.55, 1.4],
      [1, 1, 1],
      [1.19, 0.45, 0.7],
      [1.5, 0.22, 0.55],
      [2, 0.5, 0.45],
      [2.52, 0.16, 0.32],
      [3.01, 0.12, 0.25],
      [4.16, 0.06, 0.18],
    ];
    for (const [ratio, amp, life] of P) {
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.frequency.value = freq * ratio * (1 + (Math.random() - 0.5) * 0.002);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(amp * 0.22, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur * life);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + dur * life + 0.1);
    }
    // the clang of the hammer
    const n = ac.createBufferSource();
    const buf = ac.createBuffer(1, ac.sampleRate * 0.08, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3);
    n.buffer = buf;
    const ng = ac.createGain();
    ng.gain.value = 0.12;
    const bp = ac.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = freq * 6;
    n.connect(bp).connect(ng).connect(out);
    n.start(t);
  } catch {
    /* no sound */
  }
}

/** The Prison Room (step 118), where Charles Bradlaugh MP was held in 1880. */
export function buildPrison(k: BBKit) {
  const z: Zone = "prison";
  const g = k.groups.prison;
  const L = LY.prison,
    H = ROOM_H.prison;
  const boards = new THREE.MeshStandardMaterial({ map: PLANKS(), roughness: 0.85 });
  shell(k, z, L, H, { floor: boards, windows: { y0: 1.3, y1: 2.5, w: 0.7 } });
  windowBars(k, z, SHELL_WINDOWS.map(([a, f, c]) => [a, f, c, L + 1.3, L + 2.5] as ["x" | "z", number, number, number, number]), 0.7);
  // a whitewashed partition and its iron gate: the cell in the west half
  const wash = new THREE.MeshStandardMaterial({ color: "#e2dccb", roughness: 0.95 });
  k.wall(z, wash, -1, TOWER.z0, -1, -57.2, L, H, 0.25);
  k.wall(z, wash, -1, -54.8, -1, TOWER.z1, L, H, 0.25);
  const gate = new THREE.Group();
  for (let i = 0; i < 9; i++) gate.add(new THREE.Mesh(new THREE.BoxGeometry(0.035, 2.3, 0.035).translate(0, 1.15, -1.2 + i * 0.3), k.iron));
  for (const y of [0.15, 1.2, 2.25]) gate.add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 2.4).translate(0, y, 0), k.iron));
  gate.position.set(-1, L, -56);
  gate.rotation.y = -0.9; // standing open
  gate.position.x -= 0.0;
  g.add(gate);
  k.box(z, k.iron, 0.12, 0.1, 2.4, -1, L + H - 0.4, -56);
  // the cell: iron bed, a table and chair, a washstand, a candle, the plaque
  const blanket = new THREE.MeshStandardMaterial({ color: "#6e6a62", roughness: 1 });
  k.box(z, k.iron, 2.0, 0.05, 0.9, -5.5, L + 0.45, -62.6);
  for (const dx of [-0.95, 0.95]) for (const dz of [-0.4, 0.4]) k.box(z, k.iron, 0.05, 0.5, 0.05, -5.5 + dx, L, -62.6 + dz);
  k.box(z, k.iron, 0.05, 0.9, 0.9, -6.5, L, -62.6);
  k.box(z, blanket, 1.9, 0.14, 0.86, -5.5, L + 0.5, -62.6);
  k.box(z, wash, 0.5, 0.1, 0.6, -6.15, L + 0.64, -62.6);
  k.solid(z, -6.6, -63.1, -4.4, -62.1);
  k.box(z, k.oak, 1.4, 0.75, 0.8, -4.5, L, -58.6);
  k.box(z, k.oakDk, 1.5, 0.05, 0.9, -4.5, L + 0.75, -58.6);
  k.solid(z, -5.25, -59.05, -3.75, -58.15);
  k.box(z, k.warm, 0.05, 0.12, 0.05, -4.1, L + 0.8, -58.4);
  k.box(z, k.brass, 0.14, 0.02, 0.14, -4.1, L + 0.8, -58.4);
  k.box(z, wash, 0.3, 0.02, 0.4, -4.7, L + 0.8, -58.6); // papers
  k.box(z, k.oakDk, 0.25, 0.05, 0.35, -4.95, L + 0.8, -58.5); // a book
  k.box(z, k.oak, 0.6, 0.85, 0.5, -7.3, L, -55);
  k.cyl(z, wash, 0.2, 0.12, -7.3, L + 0.85, -55, 16, 0.24);
  k.solid(z, -7.7, -55.3, -6.9, -54.7);
  const plaque = k.plaque(["PRISON ROOM", "CHARLES BRADLAUGH MP · 1880"], 1.4, 0.4);
  plaque.position.set(-1.14, L + 1.7, -59.5);
  plaque.rotation.y = -Math.PI / 2;
  g.add(plaque);
  k.pick(z, plaque, "<b>Prison Room</b><span>1880</span>", () => ({
    eyebrow: "Elizabeth Tower · step 118",
    title: "Prison Room",
    stats: [
      ["Last held", "Charles Bradlaugh MP"],
      ["Date", "23 June 1880"],
      ["Seat", "Northampton"],
    ],
  }));
  // the room outside the cell: a coat stand, a lamp, a bench
  k.box(z, k.oak, 2.0, 0.45, 0.45, 3.5, L, TOWER.z0 + 0.5);
  k.solid(z, 2.5, TOWER.z0, 4.5, TOWER.z0 + 0.75);
  k.box(z, k.warm, 0.4, 0.06, 0.4, -4.5, L + H - 0.1, -58);
  k.box(z, k.warm, 0.4, 0.06, 0.4, 3, L + H - 0.1, -59);
}

/** The belfry (step 334): the Great Bell and the four quarter bells in their iron frame. */
export function buildBelfry(k: BBKit) {
  const z: Zone = "belfry";
  const g = k.groups.belfry;
  const L = LY.belfry,
    H = ROOM_H.belfry;
  const boards = new THREE.MeshStandardMaterial({ map: PLANKS(), roughness: 0.9 });
  shell(k, z, L, H, { floor: boards, windows: { y0: 1.2, y1: 6.6, w: 3.2 } });
  // louvres in every opening: tilted boards with the city between them
  const louv = new THREE.MeshStandardMaterial({ color: "#5a5048", roughness: 0.8 });
  for (const [a, f, c] of SHELL_WINDOWS) {
    for (let y = L + 1.35; y < L + 6.5; y += 0.42) {
      const b = new THREE.BoxGeometry(a === "x" ? 3.2 : 0.04, 0.32, a === "x" ? 0.04 : 3.2);
      if (a === "x") b.rotateX(f > -56 ? 0.75 : -0.75);
      else b.rotateZ(f > 0 ? -0.75 : 0.75);
      b.translate(a === "x" ? c : f, y, a === "x" ? f : c);
      k.geo(z, louv, b);
    }
    // a pointed head in stone over the opening
    for (let j = 0; j < 5; j++) {
      const w = 3.2 - j * 0.62;
      if (a === "x") k.box(z, k.stoneLt, w, 0.12, 0.6, c, L + 6.6 + j * 0.1, f);
      else k.box(z, k.stoneLt, 0.6, 0.12, w, f, L + 6.6 + j * 0.1, c);
    }
  }
  // the frame: two great girders across the tower, the quarter bells' cross-beams
  const BX = -1.2,
    BZ = -57.4;
  const lip = 2.0;
  for (const dz of [-0.75, 0.75]) k.box(z, k.iron, 16.4, 0.45, 0.3, 0, L + 4.6, BZ + dz);
  for (const dx of [-6.2, 4.6]) k.box(z, k.iron, 0.3, 0.35, 15.6, dx, L + 4.75, -56);
  for (const [x0, x1] of [
    [-7.9, -6.4],
    [4.8, 7.9],
  ])
    for (const dz of [-0.75, 0.75]) k.beam(z, k.iron, V(x0 < 0 ? -8 : 8, L + 2.6, BZ + dz), V(x0 < 0 ? x1 : x0, L + 4.6, BZ + dz), 0.18, 0.18);
  // the Great Bell
  const bell = new THREE.Group();
  bell.position.set(BX, L + lip, BZ);
  const bellMat = new THREE.MeshStandardMaterial({ color: "#6e5a3a", roughness: 0.38, metalness: 0.88, side: THREE.DoubleSide });
  const bm = new THREE.Mesh(bellGeo(1.37), bellMat);
  bell.add(bm);
  // inscription band and the crack (the bell was turned an eighth after it cracked in 1859)
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.83, 0.85, 0.16, 48, 1, true), new THREE.MeshStandardMaterial({ color: "#8a7044", roughness: 0.3, metalness: 0.9, side: THREE.DoubleSide }));
  band.position.y = 1.62;
  bell.add(band);
  const crack = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.5, 0.02), new THREE.MeshBasicMaterial({ color: "#16120c" }));
  crack.position.set(Math.cos(0.8) * 1.12, 0.62, Math.sin(0.8) * 1.12);
  crack.rotation.z = 0.25;
  bell.add(crack);
  // the clapper inside, the headstock on top
  const clap = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.4, 8).translate(0, 1.1, 0), k.iron);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8).translate(0, 0.42, 0), k.iron);
  bell.add(clap, ball);
  g.add(bell);
  k.box(z, k.iron, 1.0, 0.4, 1.8, BX, L + lip + 2.18, BZ);
  k.box(z, k.oakDk, 1.2, 0.25, 1.8, BX, L + lip + 2.4, BZ);
  k.pick(z, bm, "<b>Big Ben</b><span>the Great Bell</span>", () => ({
    eyebrow: "Belfry · step 334",
    title: "Big Ben",
    stats: [
      ["Weight", "13.7 t"],
      ["Note", "E"],
      ["Cast", "Whitechapel, 1858"],
      ["Last strike", last ? `#${last.toLocaleString("en-US")}` : "—"],
    ],
  }));
  // a rail round it
  {
    const r0 = 2.1;
    const corners = [V(BX - r0, 0, BZ - r0), V(BX + r0, 0, BZ - r0), V(BX + r0, 0, BZ + r0), V(BX - r0, 0, BZ + r0)];
    for (let i = 0; i < 4; i++) {
      const a = corners[i],
        b = corners[(i + 1) % 4];
      for (const y of [0.55, 1.05]) k.beam(z, k.brass, a.clone().setY(L + y), b.clone().setY(L + y), 0.04, 0.04);
      for (let j = 0; j < 4; j++) {
        const p = a.clone().lerp(b, j / 4);
        k.box(z, k.brass, 0.05, 1.08, 0.05, p.x, L, p.z);
      }
    }
    k.solid(z, BX - r0 - 0.05, BZ - r0 - 0.05, BX + r0 + 0.05, BZ + r0 + 0.05);
  }
  // the hammer: an iron head on a lever, pulled by the wire from the striking train below
  const ham = new THREE.Group();
  const pivot = V(BX - 2.55, L + 3.35, BZ);
  ham.position.copy(pivot);
  const headAt = V(1.13, -0.98, 0);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 1).translate(0, 0, 0.5), k.iron);
  arm.lookAt(headAt);
  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.42, 16).rotateZ(Math.PI / 2), k.iron);
  head.position.copy(headAt);
  ham.add(arm, head);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.6).translate(0, 0, 0.3), k.iron);
  tail.lookAt(-0.5, 0.2, 0);
  ham.add(tail);
  g.add(ham);
  k.beam(z, k.iron, pivot.clone().add(V(0, 0.1, 0)), V(BX - 2.55, L + 4.6, BZ), 0.12, 0.12);
  const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 1, 4).translate(0, 0.5, 0), k.iron);
  g.add(wire);
  const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.2, 0.5), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.4, 0.03, 6, 64).rotateX(Math.PI / 2), ringMat);
  ring.position.set(BX, L + lip + 0.05, BZ);
  g.add(ring);
  // the four quarter bells (G♯, F♯, E, B) with their little hammers
  const QB: { x: number; z: number; r: number; note: string; f: number }[] = [
    { x: -5.6, z: -61.6, r: 0.62, note: "G♯", f: 415.3 },
    { x: 3.2, z: -61.6, r: 0.68, note: "F♯", f: 370.0 },
    { x: -5.6, z: -51.4, r: 0.75, note: "E", f: 329.6 },
    { x: 4.6, z: -56.6, r: 0.95, note: "B", f: 246.9 },
  ];
  const quarters = QB.map((q) => {
    const b = new THREE.Group();
    const top = L + 4.45;
    const hgt = (2.22 * q.r) / 1.37;
    b.position.set(q.x, top - hgt, q.z);
    b.add(new THREE.Mesh(bellGeo(q.r), bellMat));
    g.add(b);
    k.box(z, k.iron, 0.4, top + 0.15 - (top - 0.02), 0.4, q.x, top - 0.02, q.z);
    k.beam(z, k.iron, V(q.x, top + 0.1, q.z), V(q.x, L + 4.6, q.z < -56 ? BZ - 0.75 : q.z), 0.1, 0.1);
    const hm = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), k.iron);
    const hx = q.x + q.r + 0.13;
    hm.position.set(hx, top - hgt + 0.2, q.z);
    g.add(hm);
    k.solid(z, q.x - q.r - 0.1, q.z - q.r - 0.1, q.x + q.r + 0.25, q.z + q.r + 0.1);
    const mesh = b.children[0] as THREE.Mesh;
    k.pick(z, mesh, `<b>Quarter bell</b><span>${q.note}</span>`, () => ({ eyebrow: "Belfry", title: `Quarter bell · ${q.note}`, stats: [["Note", q.note], ["Chimes", "Westminster Quarters"]] }));
    return { b, hm, q, t: 9, x0: hx };
  });
  // lamps in the belfry
  for (const [x, zz] of [
    [-6, -62],
    [2, -62],
    [-6, -50],
  ])
    k.box(z, k.warm, 0.3, 0.06, 0.3, x, L + H - 0.08, zz);
  // a sign by the stair door
  const sign = k.plaque(["THE BELFRY", "334 STEPS"], 1.1, 0.4, true);
  sign.position.set(SC.x - 2.8, L + 1.8, SC.z - 2.9);
  sign.lookAt(TC.x, L + 1.8, TC.z);
  g.add(sign);

  // ---- striking ---------------------------------------------------------------------------
  let last: number | null = null;
  let tau = 99;
  let struck = true;
  const listeners: ((h: number) => void)[] = [];
  let pending: number | null = null;
  const tick = (dt: number) => {
    tau += dt;
    // the hammer pulls back, swings in, rebounds
    let a: number;
    if (tau < 0.7) a = -0.06 - 0.5 * Math.sin((tau / 0.7) * (Math.PI / 2));
    else if (tau < 0.8) a = -0.56 + 0.58 * ((tau - 0.7) / 0.1);
    else if (tau < 1.4) a = 0.02 - 0.08 * Math.min(1, (tau - 0.8) / 0.4);
    else a = -0.06;
    ham.rotation.z = a;
    if (!struck && tau >= 0.78) {
      struck = true;
      if (pending != null) for (const fn of listeners) fn(pending);
    }
    // the bell shivers, the ring of sound spreads out
    const s = tau - 0.78;
    bell.rotation.z = s > 0 && s < 3 ? Math.sin(s * 55) * 0.006 * Math.exp(-s * 1.5) : 0;
    ringMat.opacity = s > 0 && s < 1.6 ? 0.6 * (1 - s / 1.6) : 0;
    ring.scale.setScalar(1 + Math.max(0, s) * 3.5);
    // the wire follows the hammer's tail
    const tailEnd = V(-0.5, 0.2, 0).normalize().multiplyScalar(0.6).applyAxisAngle(V(0, 0, 1), a).add(pivot);
    wire.position.set(tailEnd.x, L, tailEnd.z);
    wire.scale.y = Math.max(0.1, tailEnd.y - L);
    for (const qb of quarters) {
      qb.t += dt;
      qb.hm.position.x = qb.x0 + (qb.t < 0.12 ? -0.13 * (1 - qb.t / 0.12) : qb.t < 0.4 ? 0.15 * Math.min(1, (qb.t - 0.12) / 0.1) : 0.15);
      qb.b.rotation.z = qb.t < 2 ? Math.sin(qb.t * 70) * 0.01 * Math.exp(-qb.t * 2) : 0;
    }
  };
  return {
    tick,
    bell,
    lipY: L + lip,
    /** Strike for block `h`; `onHit` hears the moment the hammer meets the bell. */
    strike(h: number) {
      last = h;
      pending = h;
      tau = 0;
      struck = false;
    },
    onHit(fn: (h: number) => void) {
      listeners.push(fn);
    },
    /** Play one of the quarter bells (0–3). */
    quarter(i: number) {
      quarters[i].t = 0;
    },
    notes: QB.map((q) => q.f),
    bubble(text: string) {
      sayAt(bell, text, "shout", 2.6, 2.6, 0.9);
    },
  };
}

/** The Ayrton Light (step 382): the lantern over the belfry, lit when the House sits after dark. */
export function buildAyrton(k: BBKit) {
  const z: Zone = "ayrton";
  const g = k.groups.ayrton;
  const L = LY.ayrton,
    H = ROOM_H.ayrton;
  const floor = new THREE.MeshStandardMaterial({ color: "#3a3a40", roughness: 0.6, metalness: 0.5 });
  const blue = new THREE.MeshStandardMaterial({ color: "#1f2d58", roughness: 0.45, metalness: 0.5, side: THREE.DoubleSide });
  shell(k, z, L, H, { floor, ceiling: null, wall: blue, windows: { y0: 0.5, y1: 4.1, w: 3.6 } });
  // glazing bars and the glass of the lantern
  for (const [a, f, c] of SHELL_WINDOWS) {
    for (let i = 1; i < 4; i++) {
      const o = -1.8 + i * 0.9;
      if (a === "x") k.box(z, k.gold, 0.05, 3.6, 0.05, c + o, L + 0.5, f);
      else k.box(z, k.gold, 0.05, 3.6, 0.05, f, L + 0.5, c + o);
    }
    for (const y of [1.4, 2.3, 3.2]) {
      if (a === "x") k.box(z, k.iron, 3.6, 0.04, 0.04, c, L + y, f);
      else k.box(z, k.iron, 0.04, 0.04, 3.6, f, L + y, c);
    }
    const p = new THREE.PlaneGeometry(3.6, 3.6);
    if (a === "z") p.rotateY(Math.PI / 2);
    p.translate(a === "x" ? c : f, L + 2.3, a === "x" ? f : c);
    k.geo(z, k.glass, p);
  }
  // the iron roof of the spire above, ribs meeting at the top
  const apex = V(TC.x, L + 15, TC.z);
  const cone = new THREE.ConeGeometry(11.6, 15 - H, 4, 1, true);
  cone.rotateY(Math.PI / 4);
  cone.translate(TC.x, L + H + (15 - H) / 2, TC.z);
  k.geo(z, blue, cone);
  for (const [x, zz] of [
    [-8, -64],
    [8, -64],
    [-8, -48],
    [8, -48],
    [0, -64],
    [0, -48],
    [-8, -56],
    [8, -56],
  ])
    k.beam(z, k.gold, V(x, L + H, zz), apex, 0.14, 0.14);
  for (const t of [0.3, 0.6]) {
    const h = L + H + (15 - H) * t;
    const r = 8 * (1 - t);
    for (const [ax, az, bx, bz] of [
      [-r, -r, r, -r],
      [r, -r, r, r],
      [r, r, -r, r],
      [-r, r, -r, -r],
    ])
      k.beam(z, k.iron, V(TC.x + ax, h, TC.z + az), V(TC.x + bx, h, TC.z + bz), 0.12, 0.12);
  }
  k.box(z, k.gold, 16.4, 0.2, 16.4, TC.x, L + H - 0.1, TC.z);
  // the light: a brass lantern on a column, its lamps behind ribbed glass
  const lampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color("#ffd890").multiplyScalar(1.6), toneMapped: false });
  k.dayNight.push((n) => lampMat.color.set(new THREE.Color("#ffd890").multiplyScalar(n ? 3.2 : 1.3)));
  k.cyl(z, k.brass, 0.18, 1.6, TC.x, L, TC.z, 16);
  k.cyl(z, k.brass, 0.6, 0.1, TC.x, L, TC.z, 24);
  const lantern = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 1.3, 12), lampMat);
  lantern.position.set(TC.x, L + 2.3, TC.z);
  g.add(lantern);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    k.box(z, k.brass, 0.05, 1.4, 0.05, TC.x + Math.cos(a) * 0.77, L + 1.6, TC.z + Math.sin(a) * 0.77);
  }
  k.cyl(z, k.brass, 0.85, 0.12, TC.x, L + 1.55, TC.z, 24);
  k.cyl(z, k.brass, 0.4, 0.4, TC.x, L + 2.95, TC.z, 24, 0.85);
  k.solid(z, TC.x - 0.95, TC.z - 0.95, TC.x + 0.95, TC.z + 0.95);
  const glow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: canvasTex(128, 128, (c, w, h) => {
        const grd = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
        grd.addColorStop(0, "rgba(255,220,150,0.9)");
        grd.addColorStop(1, "rgba(255,180,80,0)");
        c.fillStyle = grd;
        c.fillRect(0, 0, w, h);
      }),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }),
  );
  glow.position.copy(lantern.position);
  glow.scale.setScalar(4.5);
  g.add(glow);
  k.dayNight.push((n) => (glow.material.opacity = n ? 1 : 0.45));
  k.pick(z, lantern, "<b>The Ayrton Light</b><span>1873</span>", () => ({
    eyebrow: "Elizabeth Tower · step 382",
    title: "The Ayrton Light",
    stats: [
      ["Installed", "1873"],
      ["Named for", "Acton Smee Ayrton"],
      ["Lit", "when either House sits after dark"],
    ],
  }));
  // a rail round the gallery inside the glass
  for (const [a, f] of [
    ["x", TOWER.z0 + 1],
    ["z", TOWER.x0 + 1],
  ] as ["x" | "z", number][]) {
    for (const y of [0.55, 1.05]) {
      if (a === "x") k.box(z, k.brass, 14, 0.04, 0.04, -1, L + y, f);
      else k.box(z, k.brass, 0.04, 0.04, 14, f, L + y, -57);
    }
    if (a === "x") k.solid(z, -8, f - 0.05, 6, f + 0.05);
    else k.solid(z, f - 0.05, -64, f + 0.05, -50);
  }
}
