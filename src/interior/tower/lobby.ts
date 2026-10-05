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

/** G — the grand lobby: double height, marble, concierge, a water wall, the lounge. */
export function lobby(k: TowerKit) {
  const f = 0,
    g = k.groups[f],
    y = 0;
  k.shell(f, new THREE.MeshStandardMaterial({ map: marble(), roughness: 0.16, metalness: 0.1 }), std("#1a1720", 0.9), { door: true, wallMat: std("#3a3040", 0.7), panels: "none" });
  k.elevators(f);
  // the concierge desk facing the lounge, the concierge behind it
  k.put(f, "reception", F.receptionDesk, 7.6, -6, -Math.PI / 2);
  k.label(f, "CONCIERGE · コンシェルジュ", 11.85, 3.4, -6, { h: 0.34, rot: -Math.PI / 2 });
  void k.person(f, 2024, [9, -6], "Concierge", { face: new THREE.Vector3(-1, 0, 0) });
  // the water wall on the north side: dark stone, falling water, a pool at its foot
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
  // the lounge: a rug, two sofas face to face, armchairs, a low table, lamps, plants
  k.put(f, "rugLobby", () => F.rug(6.4, 4.4, "#5a3a4a", "#c9a227"), -5, -12.5, 0, { solid: false });
  k.put(f, "sofaNavy", () => F.sofa("#2e3e62", 3, "#e8d8b0"), -5, -14.5, 0);
  k.put(f, "sofaNavy", () => F.sofa("#2e3e62", 3, "#e8d8b0"), -5, -10.5, Math.PI);
  k.put(f, "armRust", () => F.armchair("#8a4a3a"), -8.2, -12.5, Math.PI / 2);
  k.put(f, "coffee", F.coffeeTable, -5, -12.5);
  k.put(f, "floorLamp", F.floorLamp, -8.4, -14.6);
  k.put(f, "floorLamp", F.floorLamp, -1.6, -10.4);
  for (const [i, [x, z]] of ([[-2.6, -0.8], [2.6, -0.8], [10.8, -16.8], [-10.6, -16.8], [10.8, -1], [-1.6, -15]] as [number, number][]).entries()) k.put(f, `plant${i % 3}`, () => F.plant((["monstera", "ficus", "cactus"] as const)[i % 3], i), x, z);
  // a chandelier of glowing rings
  for (let r = 0; r < 3; r++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.4 - r * 0.35, 0.04, 6, 48), glowMat("#ffe2b0", 1.6));
    ring.rotation.x = Math.PI / 2;
    ring.position.set(0, y + 5.1 - r * 0.4, -8);
    g.add(ring);
  }
  // mailboxes, the directory, paintings and sconces on the core wall
  box(g, 0.2, 1.5, 2.7, k.dark, 11.8, y + 0.8, -13.05);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 6; c++) {
    box(g, 0.05, 0.3, 0.38, std(r % 2 ? "#5a6a8a" : "#4a4a5a", 0.4, 0.5), 11.68, y + 0.9 + r * 0.34, -12 - c * 0.42);
    box(g, 0.03, 0.03, 0.1, glowMat("#ffd28a", 1), 11.64, y + 1.0 + r * 0.34, -12 - c * 0.42);
  }
  k.rects[f].push([11.4, -14.5, 12, -11.6]);
  k.label(f, "MAIL · 郵便", 11.62, 2.6, -13.05, { h: 0.2, rot: -Math.PI / 2 });
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
  dir.position.set(X0 + 0.22, y + 1.7, -4.2);
  dir.rotation.y = Math.PI / 2;
  k.painting(f, 777, X0 + 0.2, 2.4, -14.2, Math.PI / 2, 1.3);
  k.painting(f, 4242, X0 + 0.2, 2.4, -2, Math.PI / 2, 1.0);
  k.sconces(f, [X0 + 0.15, -15.8], [X0 + 0.15, -12.6], 2, Math.PI / 2, 3.4);
  void k.person(f, 1111, [-5, -14.3], "Guest", { sit: true, dy: 0.42 });
  void k.person(f, 1212, [3, -5], "Resident", { wander: [[3, -5], [-3, -7], [6, -12], [0, -3]] });
  k.light(f, 0, -8, "#ffe2b0", 14);
  k.light(f, 7, -6, "#ffd8a8", 8);
  k.light(f, -5, -12.5, "#ffe6c8", 9);
  k.light(f, 0, -16, "#7fd8ff", 7);
}
