import * as THREE from "three";
import { fitText } from "../../scene/fit";
import { hash } from "../../scene/voxel/model";
import type { Game } from "../../ui/arcade";
import * as F from "../furniture";
import { box, glowMat, std } from "../kit";
import { LEVELS, TowerKit, X0, Z0, makeCanvas } from "./kit";
import { memePoster } from "../../scene/memes";
import { nextMeme } from "../../scene/memewalls";

export const ART: Record<string, { name: string; color: string; bg: string; side: string }> = {
  snake: { name: "ZEC SNAKE", color: "#3ee08f", bg: "#06120c", side: "#0f3a24" },
  invaders: { name: "SHIELDED INVADERS", color: "#7dffbe", bg: "#05040c", side: "#1a1040" },
  flappy: { name: "FLAPPY ZEC", color: "#f4b728", bg: "#0a1030", side: "#3a2a08" },
  whack: { name: "WHACK-A-LEAK", color: "#ff3e8a", bg: "#1a1430", side: "#3a0a20" },
  memory: { name: "zkSNARK MEMORY", color: "#b07bff", bg: "#100a1c", side: "#24104a" },
  kart: { name: "ZK KART", color: "#f4b728", bg: "#1f4a2a", side: "#3a2a08" },
  bowling: { name: "ZK BOWLING", color: "#2a78d6", bg: "#0a1428", side: "#102a4a" },
  karaoke: { name: "KARAOKE", color: "#ff7ab0", bg: "#1a0a20", side: "#3a0a2a" },
  dance: { name: "DANCE ZK", color: "#3ee08f", bg: "#0a0614", side: "#103a24" },
  billiards: { name: "BILLIARDS", color: "#3ee08f", bg: "#0a1a10", side: "#103a20" },
};

/** An attract screen for a game: its name, a starfield, PRESS START. */
export function marquee(game: string, w = 256, h = 192) {
  const gm = ART[game];
  return makeCanvas(w, h, (gc) => {
    gc.fillStyle = gm.bg;
    gc.fillRect(0, 0, w, h);
    for (let i = 0; i < 30; i++) {
      gc.fillStyle = `${gm.color}33`;
      gc.fillRect(hash(i, 1, 3, 3) * w, hash(i, 2, 3, 3) * h, 4, 4);
    }
    gc.fillStyle = gm.color;
    gc.textAlign = "center";
    gc.font = `800 ${Math.round(h * 0.16)}px "JetBrains Mono", monospace`;
    fitText(gc, gm.name, w / 2, h * 0.47);
    gc.font = `600 ${Math.round(h * 0.08)}px "JetBrains Mono", monospace`;
    gc.fillStyle = "#e9e0c8";
    gc.fillText("▶ PRESS START", w / 2, h * 0.72);
  }).t;
}

/** A voxel arcade cabinet with the game's attract screen in its recess; click to play. */
export function cabinet(k: TowerKit, f: number, x: number, z: number, rot: number, game: Game) {
  const gm = ART[game];
  const cab = k.put(f, `cab-${game}`, () => F.arcadeCabinet(gm.color, gm.side), x, z, rot);
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.64, 0.56), new THREE.MeshBasicMaterial({ map: marquee(game), toneMapped: false }));
  // the cabinet is a half-scale voxel object: its children are placed in doubled units
  scr.position.set(0, 1.38 * 2, 0.03);
  scr.scale.setScalar(2);
  cab.add(scr);
  k.pick(f, scr, `<b>${gm.name}</b><span>click to play</span>`, () => ({ eyebrow: "ZK Arcade", title: gm.name, game }));
  cab.traverse((o) => o instanceof THREE.Mesh && o !== scr && k.pick(f, o, `<b>${gm.name}</b><span>click to play</span>`, () => ({ eyebrow: "ZK Arcade", title: gm.name, game })));
}

/** 2 — the game hall: a Japanese arcade with every game, racing sims, UFO catchers, paintball. */
export function arcade(k: TowerKit) {
  const f = 2,
    g = k.groups[f],
    y = LEVELS[f].y,
    h = LEVELS[f].h;
  const carpet = makeCanvas(256, 256, (gc) => {
    gc.fillStyle = "#0e0b24";
    gc.fillRect(0, 0, 256, 256);
    const cols = ["#ff3e8a", "#3ef0ff", "#f4b728", "#b07bff", "#3ee08f"];
    for (let i = 0; i < 26; i++) {
      gc.strokeStyle = cols[i % cols.length];
      gc.lineWidth = 3;
      const x = hash(i, 1, 9, 9) * 256,
        yy = hash(i, 2, 9, 9) * 256,
        s = 8 + hash(i, 3, 9, 9) * 10;
      gc.beginPath();
      if (i % 3 === 0) (gc.moveTo(x, yy - s), gc.lineTo(x + s, yy + s), gc.lineTo(x - s, yy + s), gc.closePath());
      else if (i % 3 === 1) gc.arc(x, yy, s * 0.7, 0, Math.PI * 2);
      else (gc.moveTo(x - s, yy), gc.bezierCurveTo(x - s / 2, yy - s, x + s / 2, yy + s, x + s, yy));
      gc.stroke();
    }
  }).t;
  carpet.wrapS = carpet.wrapT = THREE.RepeatWrapping;
  carpet.repeat.set(9, 7);
  k.shell(f, new THREE.MeshStandardMaterial({ map: carpet, emissive: "#ffffff", emissiveMap: carpet, emissiveIntensity: 0.16, roughness: 0.95 }), std("#09071a", 0.9), { wallMat: std("#1a1430", 0.8), panels: "none" });
  k.elevators(f);
  for (const [i, z] of [-3, -7.5, -12, -16].entries()) box(g, 22, 0.04, 0.05, glowMat(["#ff3e8a", "#3ef0ff", "#b07bff", "#f4b728"][i], 1.4), 0.5, y + h - 0.12, z);
  for (const [i, x] of [-6, 0, 6].entries()) box(g, 0.05, 0.04, 17, glowMat(["#3ef0ff", "#ff3e8a", "#3ee08f"][i], 1.1), x, y + h - 0.1, -9);
  // the entrance arch from the elevators
  for (const z of [-12.6, -5.4]) {
    box(g, 0.4, 3.6, 0.4, std("#1c1430", 0.5), -8.4, y, z);
    box(g, 0.06, 3.5, 0.06, glowMat("#ff3e8a", 1.8), -8.18, y, z);
  }
  box(g, 0.5, 0.7, 7.6, std("#1c1430", 0.5), -8.4, y + 3.6, -9);
  k.label(f, "ZK ARCADE · ゲームセンター", -8.7, 3.95, -9, { h: 0.42, color: "#ff3e8a", rot: -Math.PI / 2 });
  k.label(f, "ZK ARCADE · ゲームセンター", -8.1, 3.95, -9, { h: 0.42, color: "#3ef0ff", rot: Math.PI / 2 });
  k.rects[f].push([-8.7, -12.9, -8.1, -12.3], [-8.7, -5.7, -8.1, -5.1]);
  for (const [z, c] of [
    [-4.5, "#ff3e8a"],
    [-2.2, "#3ef0ff"],
  ] as const) {
    const p = memePoster(nextMeme(), 1.3, { kind: "lightbox", frame: c });
    p.position.set(X0 + 0.12, y + 1.95, z);
    p.rotation.y = Math.PI / 2;
    g.add(p);
  }
  // the arcade row along the north glass
  (["snake", "invaders", "flappy", "whack", "memory", "snake", "invaders", "flappy", "whack"] as Game[]).forEach((game, i) => cabinet(k, f, -6.4 + i * 1.0, Z0 + 0.75, 0, game));
  k.label(f, "VIDEO GAMES · ビデオゲーム", -2.4, 3.5, Z0 + 0.3, { h: 0.3, color: "#3ef0ff" });
  void k.person(f, 5555, [-5.4, -16.4], "Gamer", { face: new THREE.Vector3(0, 0, -1) });
  void k.person(f, 6666, [-1.4, -16.4], "Gamer", { face: new THREE.Vector3(0, 0, -1), bob: 4 });
  // three ZK KART racing simulators
  for (let i = 0; i < 3; i++) {
    const x = 6.4 + i * 1.9;
    const sim = k.put(f, `race${i}`, () => F.racingSim(["#d0303a", "#2a78d6", "#f4b728"][i]), x, -14.6, 0);
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 0.9), new THREE.MeshBasicMaterial({ map: marquee("kart", 320, 250), toneMapped: false }));
    scr.position.set(0, 1.29 * 2, -0.92 * 2 + 0.01);
    scr.scale.setScalar(2);
    sim.add(scr);
    sim.traverse((o) => o instanceof THREE.Mesh && k.pick(f, o, "<b>ZK KART</b><span>sit down and race</span>", () => ({ eyebrow: "Racing", title: "ZK KART", game: "kart" })));
  }
  k.label(f, "RACING · レース", 8.3, 3.6, -16.9, { h: 0.34, color: "#f4b728" });
  void k.person(f, 2601, [6.4, -13.5], "Racer", { face: new THREE.Vector3(0, 0, -1), sit: true, dy: 0.42 });
  // the console lounge: TV on a unit, a sofa
  const tv = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 1.7), new THREE.MeshBasicMaterial({ map: marquee("kart", 512, 290), toneMapped: false }));
  tv.position.set(11.6, y + 1.65, -3);
  tv.rotation.y = -Math.PI / 2;
  g.add(tv);
  box(g, 0.1, 1.82, 3.12, k.dark, 11.7, y + 0.74, -3);
  k.put(f, "tvUnit", () => F.tvUnit(28), 11.3, -3, -Math.PI / 2);
  k.put(f, "sofaPurple", () => F.sofa("#3a2a6a", 3, "#ff7ab0"), 8.2, -3, Math.PI / 2);
  k.pick(f, tv, "<b>ZK KART · console</b><span>grab a controller</span>", () => ({ eyebrow: "Console lounge", title: "ZK KART", game: "kart" }));
  k.label(f, "CONSOLE LOUNGE", 9.6, 3.4, -0.3, { h: 0.28, color: "#3ef0ff", rot: Math.PI });
  void k.person(f, 2602, [8.2, -2.4], "Gamer", { face: new THREE.Vector3(1, 0, 0), sit: true, dy: 0.42 });
  void k.person(f, 2604, [8.2, -3.6], "Gamer", { face: new THREE.Vector3(1, 0, 0), sit: true, dy: 0.42 });
  // air hockey (playable), the basketball machine
  const ah = k.put(f, "airHockey", F.airHockey, -3, -9.5);
  ah.traverse((o) => o instanceof THREE.Mesh && k.pick(f, o, "<b>Air hockey</b><span>play the house</span>", () => ({ eyebrow: "ZK Arcade", title: "AIR HOCKEY", game: "hockey" })));
  const puck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.02, 16), std("#ff3e8a", 0.4));
  g.add(puck);
  k.ticks[f].push((_, t) => puck.position.set(-3 + Math.sin(t * 2.9) * 0.45, y + 0.86, -9.5 + Math.sin(t * 1.9) * 0.9));
  k.label(f, "AIR HOCKEY", -3, 2.6, -10.9, { h: 0.24, color: "#3ef0ff" });
  const hoop = new THREE.Group();
  hoop.position.set(1, y, -10);
  box(hoop, 1.3, 0.9, 2.4, std("#2a1a3a", 0.5), 0, 0, 0);
  box(hoop, 1.3, 1.6, 0.06, std("#ececf4", 0.4), 0, 1.4, -1.2);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.015, 6, 20), std("#ff6a2a", 0.4));
  rim.rotation.x = Math.PI / 2;
  rim.position.set(0, 2.1, -0.95);
  hoop.add(rim);
  for (let i = 0; i < 5; i++) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 10), std("#e8742a", 0.7));
    b.position.set(-0.4 + i * 0.2, 1.0, 0.9);
    hoop.add(b);
  }
  box(hoop, 1.3, 0.08, 0.06, glowMat("#f4b728", 1.5), 0, 2.25, -1.2);
  g.add(hoop);
  k.rects[f].push([0.3, -11.3, 1.7, -8.8]);
  let shots = 0,
    baskets = 0;
  k.pick(f, hoop.children[0], "<b>Basketball</b><span>shoot a ball</span>", () => {
    shots++;
    const ok = Math.random() < 0.45;
    if (ok) baskets++;
    return { eyebrow: "Basketball", title: ok ? "Swish! 🏀" : "Off the rim…", body: `<p>${baskets} / ${shots}</p>` };
  });
  // UFO catchers by the core
  let tries = 0,
    won = 0;
  for (const [i, z] of [-14.2, -15.7, -17.2].entries()) {
    const claw = k.put(f, `claw${i}`, () => F.clawMachine(["#ff7ab0", "#3ef0ff", "#f4b728"][i], i), -10.8, z, Math.PI / 2);
    claw.traverse((o) =>
      o instanceof THREE.Mesh &&
      k.pick(f, o, "<b>UFO catcher</b><span>try your luck</span>", () => {
        tries++;
        const win = Math.random() < 0.25;
        if (win) won++;
        return { eyebrow: "UFO catcher", title: win ? "You got a plush zkSNARK! 🧸" : "So close…", body: `<p>${won} won out of ${tries} tries.</p>` };
      }),
    );
  }
  k.label(f, "UFO CATCHER · クレーンゲーム", -10.1, 3.3, -15.7, { h: 0.24, color: "#ff7ab0", rot: Math.PI / 2 });
  // the prize counter
  k.put(f, "prizeCounter", () => F.barCounter(3, "#f4b728"), -9.4, -1.5, Math.PI);
  for (let r = 0; r < 3; r++) {
    box(g, 3.2, 0.04, 0.4, k.walnut, -9.4, y + 1.25 + r * 0.45, -0.3);
    for (let c = 0; c < 6; c++) box(g, 0.25, 0.25, 0.25, std(["#3ee08f", "#f4b728", "#b07bff", "#3ef0ff", "#ff7ab0"][(r + c) % 5], 0.8), -10.8 + c * 0.5, y + 1.29 + r * 0.45, -0.3);
  }
  k.label(f, "PRIZES · 景品", -9.4, 3.0, -0.2, { h: 0.3, color: "#f4b728", rot: Math.PI });
  void k.person(f, 2603, [-9.4, -0.7], "Concierge", { face: new THREE.Vector3(0, 0, -1) });
  const counter = new THREE.Mesh(new THREE.BoxGeometry(3, 1.1, 0.7), new THREE.MeshBasicMaterial({ visible: false }));
  counter.position.set(-9.4, y + 0.55, -1.5);
  g.add(counter);
  k.pick(f, counter, "<b>Prize counter</b><span>your tickets</span>", () => {
    let tickets = 0;
    for (const key of ["snake", "invaders", "flappy", "whack", "hockey", "memory", "kart", "bowling", "karaoke", "dance", "billiards", "paintball"])
      try {
        tickets += Math.round(Number(localStorage.getItem(`street.best.${key}`) ?? 0)) % 1000;
      } catch {}
    return { eyebrow: "Prize counter", title: `${tickets} tickets 🎟️`, body: `<p>Your best scores, all games together. ${tickets >= 300 ? "Enough for the giant plush zkSNARK!" : `${300 - tickets} more for the giant plush zkSNARK.`}</p>` };
  });
  paintball(k, f);
  k.light(f, -3, -9, "#c8a0ff", 9);
  k.light(f, 7, -12, "#7fe3ff", 8);
  k.light(f, -1, -3, "#a0ffc8", 8);
  k.light(f, 8, -3, "#ff7ab0", 7);
}

/** PAINTBALL: an arena behind a low barrier; START, then shoot the targets that rise. */
function paintball(k: TowerKit, f: number) {
  const g = k.groups[f],
    y = LEVELS[f].y,
    h = LEVELS[f].h;
  const AX0 = -6.5,
    AX1 = 4.6,
    AZ0 = -6.2,
    AZ1 = -0.5;
  box(g, AX1 - AX0, 1.1, 0.15, std("#2a2a34", 0.6), (AX0 + AX1) / 2, y, AZ0);
  box(g, AX1 - AX0, 0.05, 0.18, glowMat("#3ee08f", 1.3), (AX0 + AX1) / 2, y + 1.1, AZ0);
  for (const x of [AX0, AX1]) box(g, 0.15, 1.1, AZ1 - AZ0, std("#2a2a34", 0.6), x, y, (AZ0 + AZ1) / 2);
  k.rects[f].push([AX0 - 0.1, AZ0 - 0.1, AX1 + 0.1, AZ1 + 0.3]);
  const net = makeCanvas(64, 64, (gc) => {
    gc.strokeStyle = "rgba(220,255,230,0.35)";
    gc.lineWidth = 2;
    gc.strokeRect(0, 0, 64, 64);
  }).t;
  net.wrapS = net.wrapT = THREE.RepeatWrapping;
  net.repeat.set(22, 6);
  const netMesh = new THREE.Mesh(new THREE.PlaneGeometry(AX1 - AX0, h - 1.1), new THREE.MeshBasicMaterial({ map: net, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
  netMesh.position.set((AX0 + AX1) / 2, y + 1.1 + (h - 1.1) / 2, AZ0 - 0.02);
  netMesh.raycast = () => {};
  g.add(netMesh);
  for (const [i, [x, z, kind]] of ([[-5, -3, 0], [-2.2, -2, 1], [0.5, -3.8, 2], [3, -2.4, 0], [-3.8, -4.6, 2], [2, -1.2, 1]] as [number, number, number][]).entries()) {
    const col = std(["#3ee08f", "#ff3e8a", "#f4b728", "#3ef0ff"][i % 4], 0.6);
    const mesh = kind === 0 ? new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 1.3, 16), col) : kind === 1 ? new THREE.Mesh(new THREE.ConeGeometry(0.6, 1.6, 16), col) : new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.9, 0.6), col);
    mesh.position.set(x, y + (kind === 2 ? 0.45 : kind === 1 ? 0.8 : 0.65), z);
    g.add(mesh);
  }
  k.label(f, "PAINTBALL · ペイントボール", (AX0 + AX1) / 2, 3.7, AZ0 - 0.03, { h: 0.4, color: "#3ee08f", rot: Math.PI });
  const bull = makeCanvas(128, 128, (gc) => {
    for (let r = 6; r > 0; r--) {
      gc.fillStyle = r % 2 ? "#e8e2d4" : "#d0303a";
      gc.beginPath();
      gc.arc(64, 64, r * 10, 0, Math.PI * 2);
      gc.fill();
    }
  }).t;
  const targets: { mesh: THREE.Mesh; base: number; up: number; until: number }[] = [];
  for (const [x, z] of [[-5, -3.5], [-2.2, -2.5], [0.5, -4.3], [3, -2.9], [-3.8, -5.0], [2, -1.6]] as [number, number][]) {
    const m = new THREE.Mesh(new THREE.CircleGeometry(0.32, 24), new THREE.MeshStandardMaterial({ map: bull, side: THREE.DoubleSide }));
    m.rotation.y = Math.PI;
    m.position.set(x, y + 0.2, z);
    g.add(m);
    targets.push({ mesh: m, base: y + 0.2, up: 0, until: 0 });
  }
  let round = 0,
    hits = 0,
    best = 0;
  try {
    best = Number(localStorage.getItem("street.best.paintball") ?? 0);
  } catch {}
  const board = k.screen(f, 2.4, 0.9, (gc, W) => {
    gc.fillStyle = "#04100a";
    gc.fillRect(0, 0, W, 200);
    gc.fillStyle = "#3ee08f";
    gc.font = '700 30px "JetBrains Mono", monospace';
    fitText(gc, round > 0 ? `TIME ${Math.ceil(round)}s   HITS ${hits}` : `PRESS START · BEST ${best}`, 20, 72);
    gc.fillStyle = "#e9eef7";
    gc.font = '500 20px "JetBrains Mono", monospace';
    fitText(gc, "30 s · click the targets · splat!", 20, 130);
  }, 0.25);
  board.position.set((AX0 + AX1) / 2, y + 2.45, AZ0 - 0.05);
  board.rotation.y = Math.PI;
  const start = box(g, 0.5, 1.0, 0.5, std("#14121c", 0.4), AX1 + 0.6, y, AZ0 - 0.6);
  const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.08, 20), glowMat("#3ee08f", 1.8));
  btn.position.set(AX1 + 0.6, y + 1.04, AZ0 - 0.6);
  g.add(btn);
  k.rects[f].push([AX1 + 0.3, AZ0 - 0.9, AX1 + 0.9, AZ0 - 0.3]);
  for (const o of [start, btn])
    k.pick(f, o, "<b>Paintball · START</b><span>a 30 second round</span>", () => {
      round = 30;
      hits = 0;
      return null;
    });
  const paint = ["#3ee08f", "#ff3e8a", "#f4b728", "#3ef0ff", "#b07bff"];
  for (const t of targets)
    k.pick(f, t.mesh, "<b>Target</b><span>shoot!</span>", (hit) => {
      if (round <= 0) return { eyebrow: "Paintball", title: "Press START first", body: "<p>The green button right of the arena starts a 30 second round.</p>" };
      if (t.up < 0.5) return null;
      hits++;
      const s = new THREE.Mesh(new THREE.CircleGeometry(0.08 + Math.random() * 0.06, 10), new THREE.MeshBasicMaterial({ color: paint[hits % paint.length], side: THREE.DoubleSide }));
      if (hit) s.position.copy(t.mesh.worldToLocal(hit.point.clone()));
      s.position.z = 0.01;
      t.mesh.add(s);
      t.until = 0;
      return null;
    });
  k.ticks[f].push((dt) => {
    if (round > 0) {
      round -= dt;
      if (round <= 0) {
        round = 0;
        if (hits > best) {
          best = hits;
          try {
            localStorage.setItem("street.best.paintball", String(best));
          } catch {}
        }
      }
      for (const t of targets) {
        if (t.until <= 0 && t.up <= 0.01 && Math.random() < dt * 0.9) t.until = 1 + Math.random() * 1.2;
        t.until -= dt;
      }
    } else for (const t of targets) t.until = 0;
    for (const t of targets) {
      t.up += ((t.until > 0 ? 1 : 0) - t.up) * Math.min(1, dt * 10);
      t.mesh.position.y = t.base + t.up * 1.2;
      if (round === 0 && t.mesh.children.length) t.mesh.clear();
    }
  });
}
