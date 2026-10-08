import * as THREE from "three";
import { fitText } from "../../scene/fit";
import { hash } from "../../scene/voxel/model";
import * as F from "../furniture";
import { box, glowMat, std } from "../kit";
import { LEVELS, TowerKit, X0, Z0, makeCanvas } from "./kit";

/** Polished marble tiles with a faint vein. */
function marble() {
  const { t } = makeCanvas(256, 256, (g) => {
    g.fillStyle = "#e9e5de";
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 40; i++) {
      g.strokeStyle = `rgba(120,110,100,${0.05 + hash(i, 1, 2, 3) * 0.1})`;
      g.lineWidth = 1 + hash(i, 2, 2, 3) * 2;
      g.beginPath();
      g.moveTo(hash(i, 3, 2, 3) * 256, 0);
      g.bezierCurveTo(hash(i, 4, 2, 3) * 256, 90, hash(i, 5, 2, 3) * 256, 170, hash(i, 6, 2, 3) * 256, 256);
      g.stroke();
    }
    g.fillStyle = "rgba(0,0,0,0.12)";
    g.fillRect(0, 0, 256, 2);
    g.fillRect(0, 0, 2, 256);
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(8, 6);
  return t;
}

export function water() {
  const { t } = makeCanvas(256, 256, (g) => {
    g.fillStyle = "#1a8fb8";
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 90; i++) {
      g.strokeStyle = `rgba(200,250,255,${0.15 + hash(i, 1, 4, 4) * 0.25})`;
      g.lineWidth = 1.5;
      g.beginPath();
      const x = hash(i, 2, 4, 4) * 256,
        y = hash(i, 3, 4, 4) * 256,
        r = 6 + hash(i, 4, 4, 4) * 18;
      g.ellipse(x, y, r, r * 0.6, hash(i, 5, 4, 4) * 3, 0, Math.PI * 2);
      g.stroke();
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(4, 3);
  return t;
}

/** "Shield me", on the lobby piano: a little tune, played with the Web Audio API. */
let audio: AudioContext | null = null;
function playTune() {
  try {
    audio ??= new AudioContext();
    const ac = audio;
    const notes = [64, 67, 69, 67, 64, 62, 60, 62, 64, 67, 72, 71, 69, 67];
    notes.forEach((n, i) => {
      const t = ac.currentTime + i * 0.28;
      const o = ac.createOscillator(),
        g = ac.createGain();
      o.type = "triangle";
      o.frequency.value = 440 * Math.pow(2, (n - 69) / 12);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.18, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
      o.connect(g).connect(ac.destination);
      o.start(t);
      o.stop(t + 1);
    });
  } catch {}
}

/** The ⓩ inlaid in the marble: a gold ring and the Z. */
function inlay() {
  const { t } = makeCanvas(512, 512, (g) => {
    g.clearRect(0, 0, 512, 512);
    g.strokeStyle = "#c9a227";
    g.lineWidth = 22;
    g.beginPath();
    g.arc(256, 256, 230, 0, Math.PI * 2);
    g.stroke();
    g.lineWidth = 6;
    g.beginPath();
    g.arc(256, 256, 196, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = "#c9a227";
    g.beginPath();
    g.moveTo(150, 140);
    g.lineTo(362, 140);
    g.lineTo(362, 184);
    g.lineTo(212, 328);
    g.lineTo(362, 328);
    g.lineTo(362, 372);
    g.lineTo(150, 372);
    g.lineTo(150, 328);
    g.lineTo(300, 184);
    g.lineTo(150, 184);
    g.closePath();
    g.fill();
    g.fillRect(240, 92, 32, 48);
    g.fillRect(240, 372, 32, 48);
  });
  return t;
}

/** G — the grand lobby: double height, marble, columns, the concierge and its LED wall, a water
 *  wall, the lounge, a grand piano, the ZK CAFÉ, security gates, parcel lockers. */
export function lobby(k: TowerKit) {
  const f = 0,
    g = k.groups[f],
    y = 0,
    h = LEVELS[f].h;
  k.shell(f, new THREE.MeshStandardMaterial({ map: marble(), roughness: 0.14, metalness: 0.12 }), std("#1a1720", 0.9), { door: true, wallMat: std("#3a3040", 0.7), panels: "none" });
  k.elevators(f);
  // cove lighting round the ceiling, a coffered grid of warm panels
  for (const [w, d, x, z] of [[23.6, 0.06, 0, -17.8], [23.6, 0.06, 0, -0.2], [0.06, 17.6, 11.8, -9], [0.06, 17.6, -11.6, -9]] as const) box(g, w, 0.05, d, glowMat("#ffd8a0", 1.2), x, y + h - 0.3, z);
  for (let x = -7.5; x <= 7.5; x += 5) for (let z = -15; z <= -3; z += 4) box(g, 3.6, 0.02, 2.6, glowMat("#fff0d8", 0.5), x, y + h - 0.02, z);

  // the welcome: a runner from the door, the gold ⓩ inlaid in the middle of the hall
  k.put(f, "runnerIn", () => F.rug(2.4, 6.5, "#5a1a2a", "#c9a227"), 0, -3.3, 0, { solid: false });
  k.put(f, "runnerEl", () => F.rug(2.0, 6.0, "#5a1a2a", "#c9a227"), -7.5, -9, Math.PI / 2, { solid: false });
  const zi = new THREE.Mesh(new THREE.CircleGeometry(2.3, 64), new THREE.MeshStandardMaterial({ map: inlay(), transparent: true, roughness: 0.25, metalness: 0.6 }));
  zi.rotation.x = -Math.PI / 2;
  zi.position.set(0, y + 0.012, -8.4);
  g.add(zi);
  // four marble columns with uplights
  for (const [x, z] of [[-3.8, -4.2], [3.8, -4.2], [-3.8, -12.6], [3.8, -12.6]] as [number, number][]) {
    k.put(f, "column6", () => F.column(h), x, z);
    const up = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.62, 24), glowMat("#ffd28a", 1.4));
    up.rotation.x = -Math.PI / 2;
    up.position.set(x, y + 0.02, z);
    g.add(up);
  }
  // the chandelier of glowing rings over the inlay
  for (let r = 0; r < 4; r++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.7 - r * 0.38, 0.04, 6, 56), glowMat("#ffe2b0", 1.5));
    ring.rotation.x = Math.PI / 2;
    ring.position.set(0, y + 5.2 - r * 0.42, -8.4);
    g.add(ring);
  }
  box(g, 0.02, 1.0, 0.02, k.dark, 0, y + 5.2, -8.4);

  // the concierge desk, and behind it the LED wall: the tower's name, the chain live
  k.put(f, "reception", F.receptionDesk, 7.6, -6, -Math.PI / 2);
  void k.person(f, 2024, [9, -6], "Concierge", { face: new THREE.Vector3(-1, 0, 0) });
  const led = k.screen(f, 6.4, 3.0, (gc, W, H) => {
    const t = performance.now() / 1000;
    const bg = gc.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, "#07061a");
    bg.addColorStop(1, "#1a0e2a");
    gc.fillStyle = bg;
    gc.fillRect(0, 0, W, H);
    for (let i = 0; i < 40; i++) {
      gc.fillStyle = `hsla(${(i * 23 + t * 30) % 360} 80% 60% / 0.18)`;
      gc.fillRect((i * 53 + t * 40) % W, (i * 37) % H, 6, 6);
    }
    gc.textAlign = "center";
    gc.fillStyle = "#3ef0ff";
    gc.font = '800 54px "JetBrains Mono", monospace';
    fitText(gc, "ZK TOWER", W / 2, H * 0.36);
    gc.fillStyle = "#ffd28a";
    gc.font = '600 26px "JetBrains Mono", monospace';
    fitText(gc, "秘密マンション · SHIELDED LIVING", W / 2, H * 0.52);
    gc.fillStyle = "#e9eef7";
    gc.font = '600 24px "JetBrains Mono", monospace';
    fitText(gc, `BLOCK ${k.height ? k.height.toLocaleString("en-US") : "…"}  ·  ${k.ctx.director.mempoolList().length} TX IN THE MEMPOOL`, W / 2, H * 0.74);
    gc.textAlign = "left";
  }, 0.5);
  led.position.set(11.85, y + 3.1, -6);
  led.rotation.y = -Math.PI / 2;
  box(g, 0.1, 3.2, 6.6, k.dark, 11.92, y + 1.5, -6);
  k.pick(f, led, "<b>The LED wall</b><span>the tower, the chain</span>", () => ({ eyebrow: "Lobby", title: "ZK TOWER · 秘密マンション", body: `<p>Block ${k.height ? k.height.toLocaleString("en-US") : "…"}, ${k.ctx.director.mempoolList().length} transactions waiting. Eight floors above you: offices, the arcade, bowling and karaoke, the gym, the pool, flats and the sky bar.</p>` }));
  k.label(f, "CONCIERGE · コンシェルジュ", 11.82, 5.0, -6, { h: 0.34, rot: -Math.PI / 2 });
  k.put(f, "luggage", F.luggageCart, 6.2, -2.4, 0.4);
  // an information kiosk by the door
  k.put(f, "kiosk", F.kiosk, 3.2, -1.6, Math.PI + 0.3);
  const ks = k.screen(f, 0.62, 0.32, (gc, W, H) => {
    gc.fillStyle = "#04121a";
    gc.fillRect(0, 0, W, H);
    gc.fillStyle = "#3ef0ff";
    gc.font = '700 34px "JetBrains Mono", monospace';
    fitText(gc, "WELCOME · ようこそ", 20, 60);
    gc.fillStyle = "#e9eef7";
    gc.font = '500 24px "JetBrains Mono", monospace';
    fitText(gc, "touch for the floors", 20, 120);
  }, 30);
  ks.position.set(3.2 + Math.sin(0.3) * 0.12, y + 1.25, -1.6 + Math.cos(0.3) * 0.12);
  ks.rotation.set(-0.5, 0.3, 0, "YXZ");
  k.pick(f, ks, "<b>Information</b><span>the floors</span>", () => ({ eyebrow: "Information", title: "Welcome to the ZK TOWER", body: `<p>${LEVELS.slice(1).map((l) => `<b>${l.label}</b> ${l.name}`).join("<br>")}</p>` }));

  // the water wall on the north side, a pool at its foot
  const fall = water();
  fall.repeat.set(2, 3);
  const wfall = new THREE.Mesh(new THREE.PlaneGeometry(6, 5.2), new THREE.MeshStandardMaterial({ map: fall, emissive: "#2a8ab0", emissiveMap: fall, emissiveIntensity: 0.6, roughness: 0.1, metalness: 0.2 }));
  wfall.position.set(0, y + 2.9, Z0 + 0.35);
  g.add(wfall);
  box(g, 6.6, 5.8, 0.2, std("#1a1820", 0.6), 0, y + 0.2, Z0 + 0.2);
  box(g, 6.6, 0.08, 0.3, glowMat("#7fe3ff", 1.2), 0, y + 5.6, Z0 + 0.35);
  const pond = water();
  const basin = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 1.2), new THREE.MeshStandardMaterial({ map: pond, emissive: "#1a6a8a", emissiveIntensity: 0.4, roughness: 0.05, transparent: true, opacity: 0.85 }));
  basin.rotation.x = -Math.PI / 2;
  basin.position.set(0, y + 0.32, Z0 + 1.0);
  g.add(basin);
  box(g, 6.6, 0.3, 1.4, std("#2a2630", 0.5), 0, y, Z0 + 1.0);
  k.rects[f].push([-3.3, Z0, 3.3, Z0 + 1.8]);
  k.ticks[f].push((dt) => {
    fall.offset.y += dt * 0.5;
    pond.offset.x += dt * 0.03;
  });
  k.pick(f, wfall, "<b>The water wall</b><span>six metres of falling water</span>", () => ({ eyebrow: "Lobby", title: "The water wall", body: "<p>The infinity pool is on the 5th floor, the sky bar on the roof.</p>" }));
  for (const x of [-4.4, 4.4]) k.put(f, `treeW${x}`, () => F.indoorTree(x > 0 ? 3 : 4), x, -16.6);

  // the lounge, west: sofas face to face on a rug, armchairs, a low table, lamps
  k.put(f, "rugLobby", () => F.rug(6.0, 4.4, "#3a2a4a", "#c9a227"), -7.6, -14.6, 0, { solid: false });
  k.put(f, "sofaNavy", () => F.sofa("#2e3e62", 3, "#e8d8b0"), -7.6, -16.4, 0);
  k.put(f, "sofaNavy", () => F.sofa("#2e3e62", 3, "#e8d8b0"), -7.6, -12.8, Math.PI);
  k.put(f, "armRust", () => F.armchair("#8a4a3a"), -4.6, -14.6, -Math.PI / 2);
  k.put(f, "coffee", F.coffeeTable, -7.6, -14.6);
  k.put(f, "floorLamp", F.floorLamp, -10.8, -16.8);
  void k.person(f, 1111, [-7.2, -16.3], "Guest", { sit: true, dy: 0.42 });
  void k.person(f, 1112, [-8.2, -12.9], "Guest", { sit: true, dy: 0.42, face: new THREE.Vector3(0, 0, -1) });

  // the grand piano by the south-west glass; click it and the pianist plays
  k.put(f, "piano", F.grandPiano, -8.4, -3.2, Math.PI * 0.85);
  k.put(f, "pianoBench", F.pianoBench, -8.9, -1.9, Math.PI * 0.85, { solid: false });
  void k.person(f, 4545, [-8.95, -1.75], "Pianist", { face: new THREE.Vector3(0.4, 0, -1), sit: true, dy: 0.5 }).then((s) => s && k.ticks[f].push((_, t) => (s.root.rotation.z = Math.sin(t * 2) * 0.03)));
  const pianoHit = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.2, 2.0), new THREE.MeshBasicMaterial({ visible: false }));
  pianoHit.position.set(-8.4, y + 0.6, -3.2);
  pianoHit.rotation.y = Math.PI * 0.85;
  g.add(pianoHit);
  let plays = 0;
  k.pick(f, pianoHit, "<b>Grand piano</b><span>ask for a song</span>", () => {
    playTune();
    return { eyebrow: "Grand piano", title: "♪ “Shield me” ♪", body: `<p>The pianist plays the tower's song${++plays > 1 ? " again" : ""}. Sing it upstairs, on the karaoke floor.</p>` };
  });
  k.put(f, "plantPiano", () => F.plant("monstera", 9), -10.8, -1.2);

  // security gates across the lift lobby, clear of the lifts' landing (walk through the gaps)
  const GX = -6.6;
  for (const z of [-6.4, -8.2, -10.0, -11.8]) k.put(f, "turnstile", F.turnstile, GX, z, Math.PI / 2);
  const gate = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.1, 5.6), new THREE.MeshBasicMaterial({ visible: false }));
  gate.position.set(GX, y + 0.55, -9.1);
  g.add(gate);
  k.pick(f, gate, "<b>Security gates</b><span>tap your key</span>", () => ({ eyebrow: "Security", title: "Access granted ✓", body: "<p>Welcome back, resident. Every key here is a viewing key: it shows what you allow, nothing more.</p>" }));
  k.label(f, "RESIDENTS & GUESTS", GX, 1.6, -9.1, { h: 0.14, color: "#3ee08f", rot: Math.PI / 2 });
  void k.person(f, 6060, [-8.4, -5.2], "Concierge", { face: new THREE.Vector3(1, 0, 0) });
  // elevator floor indicators above the doors
  for (const z of [-7.4, -10.6]) {
    let fl = z > -9 ? 3 : 6,
      acc = 0;
    const ind = k.screen(f, 0.9, 0.36, (gc, W, H) => {
      gc.fillStyle = "#0b0a10";
      gc.fillRect(0, 0, W, H);
      gc.fillStyle = "#ff9f2e";
      gc.font = '800 120px "JetBrains Mono", monospace';
      gc.textAlign = "center";
      gc.fillText(`${z > -9 ? "▲" : "▼"} ${LEVELS[fl].label}`, W / 2, H * 0.78);
      gc.textAlign = "left";
    }, 0.5);
    k.ticks[f].push((dt) => {
      acc += dt;
      if (acc > 2.2) {
        acc = 0;
        fl = (fl + (z > -9 ? 1 : LEVELS.length - 1)) % LEVELS.length;
      }
    });
    ind.position.set(X0 + 0.26, y + 4.2, z);
    ind.rotation.y = Math.PI / 2;
  }

  // the ZK CAFÉ in the north-east corner: pastry counter, the machine, bistro tables
  k.put(f, "pastry", F.pastryCase, 9.6, -16.6, 0);
  k.put(f, "coffeeMachine", F.coffeeMachine, 11.0, -17.1, 0, { dy: 1.17, solid: false });
  k.label(f, "ZK CAFÉ · カフェ", 9.6, 3.6, -17.75, { h: 0.4, color: "#ff9f2e" });
  void k.person(f, 9192, [9.6, -17.3], "Barista", { face: new THREE.Vector3(0, 0, 1) });
  for (const [i, [x, z]] of ([[7.2, -14.2], [9.8, -13.6]] as [number, number][]).entries()) {
    k.put(f, "bistro", F.bistroTable, x, z);
    k.put(f, "bistroChair", () => F.chair("#c9a227"), x - 0.6, z, Math.PI / 2, { solid: false });
    k.put(f, "bistroChair", () => F.chair("#c9a227"), x + 0.6, z, -Math.PI / 2, { solid: false });
    if (i === 0) void k.person(f, 9300, [x - 0.6, z], "Guest", { sit: true, dy: 0.42, face: new THREE.Vector3(1, 0, 0) });
  }
  const cafe = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.2, 0.7), new THREE.MeshBasicMaterial({ visible: false }));
  cafe.position.set(9.6, y + 0.6, -16.6);
  g.add(cafe);
  const menu = ["a matcha latte and a melon pan", "a shielded flat white", "an iced Orchard tea and a slice of cake", "an espresso and a croissant shaped like a ⓩ"];
  let orders = 0;
  k.pick(f, cafe, "<b>ZK CAFÉ</b><span>order something</span>", () => ({ eyebrow: "ZK CAFÉ", title: `Here's ${menu[orders++ % menu.length]} ☕`, body: "<p>Paid with a shielded transaction: the barista knows it's paid, nothing else.</p>" }));

  // smart parcel lockers on the east wall: the MEMPOOL's parcels for the residents
  const lockers = k.put(f, "lockers", () => F.parcelLockers(3), 11.65, -11.3, -Math.PI / 2);
  lockers.traverse((o) =>
    o instanceof THREE.Mesh &&
    k.pick(f, o, "<b>Parcel lockers</b><span>anything for you?</span>", () => {
      const n = k.ctx.director.mempoolList().length;
      return { eyebrow: "Parcel lockers", title: n ? `${n} parcel${n > 1 ? "s" : ""} waiting 📦` : "Nothing waiting", body: "<p>Each pending transaction is a parcel in the MEMPOOL next door; a zkSNARK collects it for the next bus.</p>" };
    }),
  );
  k.label(f, "PARCELS · 宅配ボックス", 11.62, 2.6, -11.3, { h: 0.2, rot: -Math.PI / 2 });
  void k.person(f, 8123, [9.8, -11.3], "Guest", { face: new THREE.Vector3(1, 0, 0), wander: [[9.8, -11.3], [1.5, -2], [6, -9]] });

  // the directory, paintings, sconces on the core wall; benches by the south glass
  const dir = k.screen(f, 2, 1.25, (gc, W) => {
    gc.fillStyle = "#0b0a10";
    gc.fillRect(0, 0, W, 400);
    gc.fillStyle = "#7fe3ff";
    gc.font = '700 30px "JetBrains Mono", monospace';
    fitText(gc, "ZK TOWER · DIRECTORY", 22, 42);
    gc.font = '500 20px "JetBrains Mono", monospace';
    LEVELS.slice(1)
      .reverse()
      .forEach((l, i) => {
        gc.fillStyle = "#ffd28a";
        gc.fillText(l.label, 22, 80 + i * 28);
        gc.fillStyle = "#e9eef7";
        fitText(gc, l.name, 64, 80 + i * 28);
      });
  }, 60);
  dir.position.set(X0 + 0.22, y + 1.7, -4.0);
  dir.rotation.y = Math.PI / 2;
  k.painting(f, 777, X0 + 0.2, 2.8, -14.6, Math.PI / 2, 1.6);
  k.sconces(f, [X0 + 0.15, -16.6], [X0 + 0.15, -12.6], 2, Math.PI / 2, 3.6);
  k.sconces(f, [X0 + 0.15, -5.6], [X0 + 0.15, -2.4], 2, Math.PI / 2, 3.6);
  for (const x of [-6.2, 6.6]) k.put(f, "bench", F.bench, x, -0.6, Math.PI);
  for (const [i, [x, z]] of ([[-2.6, -0.8], [2.6, -0.8], [11, -1.0]] as [number, number][]).entries()) k.put(f, `plant${i}`, () => F.plant((["ficus", "ficus", "monstera"] as const)[i], i), x, z);
  void k.person(f, 1212, [2, -6], "Resident", { wander: [[2, -6], [-6, -9], [6, -11], [0, -3], [8, -14]] });
  k.light(f, 0, -8.4, "#ffe2b0", 14);
  k.light(f, 7.5, -6, "#ffd8a8", 8);
  k.light(f, -7.6, -14.6, "#ffe6c8", 8);
  k.light(f, -8, -3, "#ffd8b0", 7);
}
