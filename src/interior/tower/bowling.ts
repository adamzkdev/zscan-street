import * as THREE from "three";
import { fitText } from "../../scene/fit";
import * as F from "../furniture";
import { box, glowMat, std } from "../kit";
import { marquee } from "./arcade";
import { LEVELS, TowerKit, X1, Z0, makeCanvas } from "./kit";

/** 3 — bowling & karaoke: four lanes, a karaoke room with a stage, dance machines, billiards. */
export function bowling(k: TowerKit) {
  const f = 3,
    g = k.groups[f],
    y = LEVELS[f].y,
    h = LEVELS[f].h;
  const floor = makeCanvas(128, 128, (gc) => {
    gc.fillStyle = "#16122a";
    gc.fillRect(0, 0, 128, 128);
    gc.fillStyle = "#1e1838";
    for (let i = 0; i < 128; i += 32) for (let j = 0; j < 128; j += 32) if (((i + j) / 32) % 2) gc.fillRect(i, j, 32, 32);
  }).t;
  floor.wrapS = floor.wrapT = THREE.RepeatWrapping;
  floor.repeat.set(12, 9);
  k.shell(f, new THREE.MeshStandardMaterial({ map: floor, roughness: 0.4, metalness: 0.1 }), std("#0c0a18", 0.9), { wallMat: std("#1a1430", 0.8), panels: "none" });
  k.elevators(f);
  for (const [i, z] of [-4, -9, -14].entries()) box(g, 22, 0.04, 0.05, glowMat(["#2a78d6", "#ff7ab0", "#3ee08f"][i], 1.3), 0.5, y + h - 0.12, z);

  // ---- four bowling lanes along the north side, pins at the east end ----
  const LANES = [-16.9, -15.6, -14.3, -13.0];
  LANES.forEach((z, i) => {
    k.put(f, "lane", () => F.bowlingLane(13.5), 3.2, z, -Math.PI / 2, { solid: false });
    // the pins in a triangle on the deck
    let n = 0;
    for (let row = 0; row < 4; row++)
      for (let p = 0; p <= row; p++) {
        k.put(f, "pin", F.pin, 9.0 + row * 0.22, z - row * 0.12 + p * 0.24, 0, { dy: 0.17, solid: false });
        n++;
      }
    void n;
    // the score screen hanging over the approach
    const scr = k.screen(f, 1.1, 0.6, (gc, W, H) => {
      gc.fillStyle = "#0a1428";
      gc.fillRect(0, 0, W, H);
      gc.fillStyle = "#7fb0ff";
      gc.font = '700 30px "JetBrains Mono", monospace';
      fitText(gc, `LANE ${i + 1}`, 20, 50);
      gc.fillStyle = "#e9eef7";
      gc.font = '500 22px "JetBrains Mono", monospace';
      fitText(gc, "click the lane to bowl", 20, 110);
      gc.fillStyle = "#f4b728";
      fitText(gc, "STRIKE  X  SPARE  /", 20, 160);
    }, 30);
    scr.position.set(-2.6, y + 2.7, z);
    scr.rotation.y = -Math.PI / 2;
    const hit = new THREE.Mesh(new THREE.PlaneGeometry(13.5, 1.1), new THREE.MeshBasicMaterial({ visible: false }));
    hit.rotation.x = -Math.PI / 2;
    hit.position.set(3.2, y + 0.2, z);
    g.add(hit);
    k.pick(f, hit, `<b>Lane ${i + 1}</b><span>bowl a game</span>`, () => ({ eyebrow: "Bowling", title: `Lane ${i + 1}`, game: "bowling" }));
  });
  // the lanes are behind a low rail; the walker stays on the approach
  k.rects[f].push([-3.2, Z0, X1, -12.4]);
  box(g, 15.4, 0.9, 0.08, k.chrome, 3.6, y, -12.35);
  k.label(f, "BOWLING · ボウリング", 9.6, 3.6, -12.3, { h: 0.4, color: "#7fb0ff", rot: -Math.PI / 2 });
  // the ball return and benches on the approach
  for (const z of [-15.0, -12.9]) {
    box(g, 0.6, 0.5, 0.9, std("#2a2a34", 0.5), -4, y, z);
    for (let b = 0; b < 3; b++) {
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.11, 14, 10), std(["#2a78d6", "#d0303a", "#6b4c9a"][b], 0.25, 0.3));
      ball.position.set(-4, y + 0.6, z - 0.3 + b * 0.3);
      g.add(ball);
    }
  }
  k.put(f, "benchBowl", () => F.sofa("#24345a", 2, "#7fb0ff"), -6, -14.3, Math.PI / 2);
  void k.person(f, 3101, [-3.4, -15.6], "Bowler", { face: new THREE.Vector3(1, 0, 0) });
  void k.person(f, 3102, [-6, -14.8], "Bowler", { face: new THREE.Vector3(1, 0, 0), sit: true, dy: 0.42 });

  // ---- the karaoke room in the south-west, behind glass ----
  const KX1 = -2,
    KZ0 = -6.5;
  for (const [a, b, c, d] of [
    [-10, KZ0, KX1, KZ0],
    [KX1, KZ0, KX1, 0],
  ] as const) {
    const len = Math.hypot(c - a, d - b);
    const p = new THREE.Mesh(new THREE.PlaneGeometry(len, h), new THREE.MeshStandardMaterial({ color: "#ff7ab0", transparent: true, opacity: 0.12, depthWrite: false }));
    p.position.set((a + c) / 2, y + h / 2, (b + d) / 2);
    p.rotation.y = a === c ? Math.PI / 2 : 0;
    p.raycast = () => {};
    g.add(p);
  }
  k.rects[f].push([-10, KZ0 - 0.1, -6.8, KZ0 + 0.1], [-5.4, KZ0 - 0.1, KX1, KZ0 + 0.1], [KX1 - 0.1, KZ0, KX1 + 0.1, 0]);
  k.label(f, "KARAOKE · カラオケ", -6, 3.7, KZ0 - 0.05, { h: 0.34, color: "#ff7ab0", rot: Math.PI });
  k.put(f, "stage", F.karaokeStage, -6, -1.1, Math.PI);
  // the lyrics screen over the stage, scrolling
  const lyrics = ["Shield me, shield me, under neon rain", "Every note encrypted, nothing in the chain", "Ironwood and Orchard, let the bus go by", "Zero knowledge baby, you don't need to know why"];
  let line = 0,
    acc = 0;
  const lyr = k.screen(f, 3.2, 1.6, (gc, W, H) => {
    gc.fillStyle = "#1a0a20";
    gc.fillRect(0, 0, W, H);
    gc.fillStyle = "#ff7ab0";
    gc.font = '700 28px "JetBrains Mono", monospace';
    gc.textAlign = "center";
    fitText(gc, "♪ SHIELD ME ♪", W / 2, 50);
    gc.fillStyle = "#fff";
    gc.font = '600 24px "JetBrains Mono", monospace';
    fitText(gc, lyrics[line % lyrics.length], W / 2, 130);
    gc.fillStyle = "#8a6a9a";
    gc.font = '500 20px "JetBrains Mono", monospace';
    fitText(gc, lyrics[(line + 1) % lyrics.length], W / 2, 180);
    gc.fillStyle = "#3ef0ff";
    fitText(gc, "click the stage to sing", W / 2, 236);
    gc.textAlign = "left";
  }, 0.5);
  k.ticks[f].push((dt) => ((acc += dt) > 3 ? ((acc = 0), line++) : 0));
  lyr.position.set(-6, y + 2.6, -0.15);
  lyr.rotation.y = Math.PI;
  const stageHit = new THREE.Mesh(new THREE.BoxGeometry(4, 2, 2), new THREE.MeshBasicMaterial({ visible: false }));
  stageHit.position.set(-6, y + 1, -1.1);
  g.add(stageHit);
  for (const o of [stageHit, lyr]) k.pick(f, o, "<b>Karaoke</b><span>take the mic</span>", () => ({ eyebrow: "Karaoke", title: "Sing “Shield me”", game: "karaoke" }));
  k.put(f, "sofaKaraoke", () => F.sofa("#5a1a4a", 3, "#3ef0ff"), -6, -5.4, 0);
  k.put(f, "coffee", F.coffeeTable, -6, -4.2);
  void k.person(f, 3201, [-6, -1.4], "Singer", { face: new THREE.Vector3(0, 0, -1), dy: 0.25, bob: 5 });
  void k.person(f, 3202, [-6.6, -5.4], "Guest", { face: new THREE.Vector3(0, 0, 1), sit: true, dy: 0.42 });
  void k.person(f, 3203, [-5.2, -5.4], "Guest", { face: new THREE.Vector3(0, 0, 1), sit: true, dy: 0.42 });
  // a disco ball turning over the room
  const disco = new THREE.Mesh(new THREE.IcosahedronGeometry(0.28, 1), new THREE.MeshStandardMaterial({ color: "#e8e8f0", metalness: 1, roughness: 0.15, flatShading: true }));
  disco.position.set(-6, y + h - 0.6, -3.2);
  g.add(disco);
  k.ticks[f].push((dt) => (disco.rotation.y += dt * 0.8));

  // ---- dance machines and billiards in the south-east ----
  for (let i = 0; i < 2; i++) {
    const x = 1.2 + i * 2.6;
    const dm = k.put(f, "dance", F.danceMachine, x, -3.6, Math.PI);
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.0), new THREE.MeshBasicMaterial({ map: marquee("dance"), toneMapped: false }));
    scr.position.set(0, 1.67 * 2, -0.5 * 2 + 0.03);
    scr.rotation.y = 0;
    scr.scale.setScalar(2);
    dm.add(scr);
    dm.traverse((o) => o instanceof THREE.Mesh && k.pick(f, o, "<b>DANCE ZK</b><span>step up</span>", () => ({ eyebrow: "Dance machine", title: "DANCE ZK", game: "dance" })));
  }
  k.label(f, "DANCE · ダンス", 2.5, 3.6, -0.25, { h: 0.32, color: "#3ee08f", rot: Math.PI });
  void k.person(f, 3301, [1.2, -4.4], "Gamer", { face: new THREE.Vector3(0, 0, -1), bob: 9 });
  for (const [i, z] of [-9.6, -6.2].entries()) {
    const pt = k.put(f, `poolT`, F.poolTable, 8.6, z, 0);
    pt.traverse((o) => o instanceof THREE.Mesh && k.pick(f, o, "<b>Billiards</b><span>rack them up</span>", () => ({ eyebrow: "Billiards", title: "Eight-ball", game: "billiards" })));
    void i;
  }
  k.label(f, "BILLIARDS · ビリヤード", X1 - 0.15, 3.3, -8, { h: 0.3, color: "#3ee08f", rot: -Math.PI / 2 });
  void k.person(f, 3401, [8.6, -8.6], "Gamer", { face: new THREE.Vector3(0, 0, -1) });
  // a bar corner with stools, plants
  k.put(f, "barBowl", () => F.barCounter(2.5, "#2a78d6"), -0.2, -9.6, Math.PI / 2);
  for (let i = 0; i < 3; i++) k.put(f, "stoolBlue", () => F.stool("#2a78d6"), -1.1, -10.6 + i * 0.9, 0, { solid: false });
  for (const [i, [x, z]] of ([[-10.6, -16.8], [11, -1], [-1.4, -1]] as [number, number][]).entries()) k.put(f, `plantB${i}`, () => F.plant((["monstera", "ficus", "cactus"] as const)[i], i + 20), x, z);
  k.light(f, 3, -15, "#9ab8ff", 9);
  k.light(f, -6, -3, "#ff7ab0", 9);
  k.light(f, 3, -4, "#7fffc0", 7);
  k.light(f, 8.6, -8, "#ffe6c8", 6);
}
