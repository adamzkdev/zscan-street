import * as THREE from "three";
import { Market } from "../../data/market";
import { fitText } from "../../scene/fit";
import { hash } from "../../scene/voxel/model";
import * as F from "../furniture";
import { box, glowMat, std } from "../kit";
import * as H from "./furniture";
import { pianist } from "../music/acts";
import { HotelKit, LEVELS, LIFT_Z, makeCanvas, marble, num, reward, usd, water } from "./kit";
import { STAIR } from "./stair";

/** The piano's tune, played with the Web Audio API. */
let audio: AudioContext | null = null;
export function playTune(notes = [67, 71, 74, 79, 78, 74, 71, 72, 76, 79, 84, 83, 79, 76]) {
  try {
    audio ??= new AudioContext();
    const ac = audio;
    notes.forEach((n, i) => {
      const t = ac.currentTime + i * 0.3;
      const o = ac.createOscillator(),
        g = ac.createGain();
      o.type = "triangle";
      o.frequency.value = 440 * Math.pow(2, (n - 69) / 12);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.16, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + 1.1);
      o.connect(g).connect(ac.destination);
      o.start(t);
      o.stop(t + 1.2);
    });
  } catch {}
}

/** The leaning face of tower 1 seen from inside the atrium: floors of balconies, lit rooms, planters. */
function leanTexture() {
  const W = 512,
    Hh = 1024;
  const base = makeCanvas(W, Hh, (g) => {
    g.fillStyle = "#d8d2c6";
    g.fillRect(0, 0, W, Hh);
    const rows = 14;
    for (let r = 0; r < rows; r++) {
      const y0 = (r / rows) * Hh;
      const hh = Hh / rows;
      g.fillStyle = "#1a1820";
      g.fillRect(0, y0 + hh * 0.2, W, hh * 0.62);
      for (let c = 0; c < 16; c++) {
        const x = (c / 16) * W;
        const lit = hash(r, c, 5) > 0.35;
        g.fillStyle = lit ? `hsl(${36 + hash(r, c, 6) * 10} 80% ${55 + hash(r, c, 7) * 20}%)` : "#2a3040";
        g.fillRect(x + 3, y0 + hh * 0.26, W / 16 - 6, hh * 0.5);
      }
      g.fillStyle = "#b8b0a2";
      g.fillRect(0, y0 + hh * 0.82, W, hh * 0.06);
      g.fillStyle = "#3a7a3a";
      for (let c = 0; c < 40; c++) g.fillRect(hash(r, c, 9) * W, y0 + hh * 0.76, 10 + hash(r, c, 8) * 14, hh * 0.08);
    }
  });
  const glow = makeCanvas(W, Hh, (g) => {
    g.fillStyle = "#000";
    g.fillRect(0, 0, W, Hh);
    const rows = 14;
    for (let r = 0; r < rows; r++) {
      const y0 = (r / rows) * Hh,
        hh = Hh / rows;
      for (let c = 0; c < 16; c++) {
        if (hash(r, c, 5) <= 0.35) continue;
        g.fillStyle = `hsl(${36 + hash(r, c, 6) * 10} 80% ${35 + hash(r, c, 7) * 25}%)`;
        g.fillRect((c / 16) * W + 3, y0 + hh * 0.26, W / 16 - 6, hh * 0.5);
      }
    }
  });
  return { map: base.t, emissive: glow.t };
}

/** G — the grand atrium: tower 1 leaning over a glass roof, the Rain Oculus, the flock of gold
 *  coins, check-in, the concierge, the lounge and its piano, the water wall, trolleys, guests. */
export function lobby(k: HotelKit) {
  const f = 0,
    g = k.groups[f],
    y = 0,
    h = LEVELS[f].h;
  const floor = new THREE.MeshStandardMaterial({ map: marble("#ece7de", "120,110,100", 12, 9), roughness: 0.12, metalness: 0.15 });
  k.shell(f, floor, null, { door: true, wallMat: std("#3a2e28", 0.7), step: 3, westDoor: STAIR.footDoor });
  k.lifts(f);

  // the leaning face of tower 1, east: rows of balconies rising over the atrium
  const lt = leanTexture();
  const lean = new THREE.BufferGeometry();
  lean.setAttribute("position", new THREE.Float32BufferAttribute([14.9, 0, 0, 14.9, 0, -22, 8.9, 9, -22, 8.9, 9, 0], 3));
  lean.setAttribute("uv", new THREE.Float32BufferAttribute([1, 0, 0, 0, 0, 1, 1, 1], 2));
  lean.setIndex([0, 1, 2, 0, 2, 3]);
  lean.computeVertexNormals();
  g.add(new THREE.Mesh(lean, new THREE.MeshStandardMaterial({ map: lt.map, emissive: "#ffffff", emissiveMap: lt.emissive, emissiveIntensity: 0.9, roughness: 0.7, side: THREE.DoubleSide })));
  for (let r = 1; r < 6; r++) {
    const yy = r * 1.5,
      xx = 14.9 - (6 * yy) / 9;
    box(g, 0.5, 0.12, 22, std("#cfc8bc", 0.6), xx - 0.25, y + yy, -11);
    box(g, 0.3, 0.22, 22, std("#2f6a34", 0.95), xx - 0.3, y + yy + 0.12, -11);
  }
  k.rects[f].push([13.4, -22, 15, 0]);

  // the glass roof: a grid of steel over the sky
  const roofG = new THREE.Mesh(new THREE.PlaneGeometry(24, 22), k.glass);
  roofG.rotation.x = Math.PI / 2;
  roofG.position.set(-3, y + h, -11);
  roofG.raycast = () => {};
  g.add(roofG);
  for (let x = -15; x <= 9; x += 2) box(g, 0.12, 0.3, 22, k.mullion, x, y + h - 0.3, -11);
  for (let z = -22; z <= 0; z += 2.75) box(g, 24, 0.22, 0.1, k.mullion, -3, y + h - 0.22, z);
  box(g, 24, 0.5, 0.5, std("#cfc8bc", 0.6), -3, y + h - 0.5, -0.25);
  box(g, 24, 0.5, 0.5, std("#cfc8bc", 0.6), -3, y + h - 0.5, -21.75);

  // the Rain Oculus: water pouring from a bowl in the roof into a basin in the floor
  const OX = 0,
    OZ = -9;
  const basin = new THREE.Mesh(new THREE.CylinderGeometry(2.7, 2.9, 0.55, 48), std("#2a2630", 0.4, 0.3));
  basin.position.set(OX, y + 0.27, OZ);
  g.add(basin);
  const swirlT = makeCanvas(256, 256, (gc) => {
    gc.fillStyle = "#0e5a7a";
    gc.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 26; i++) {
      gc.strokeStyle = `rgba(190,245,255,${0.18 + hash(i, 1, 1) * 0.3})`;
      gc.lineWidth = 2 + hash(i, 2, 1) * 3;
      gc.beginPath();
      gc.arc(128, 128, 20 + i * 4, hash(i, 3, 1) * 6, hash(i, 3, 1) * 6 + 1.6 + hash(i, 4, 1) * 2);
      gc.stroke();
    }
  }).t;
  const swirl = new THREE.Mesh(new THREE.CircleGeometry(2.55, 48), new THREE.MeshStandardMaterial({ map: swirlT, emissive: "#1a8ab0", emissiveMap: swirlT, emissiveIntensity: 0.9, roughness: 0.05 }));
  swirl.rotation.x = -Math.PI / 2;
  swirl.position.set(OX, y + 0.5, OZ);
  g.add(swirl);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(2.75, 0.06, 6, 64), glowMat("#7fe3ff", 1.4));
  rim.rotation.x = Math.PI / 2;
  rim.position.set(OX, y + 0.56, OZ);
  g.add(rim);
  const fallT = water(1, 3, "#3aa8d0");
  const fall = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.8, h - 0.5, 32, 1, true), new THREE.MeshStandardMaterial({ map: fallT, emissive: "#3ab8e0", emissiveMap: fallT, emissiveIntensity: 0.7, transparent: true, opacity: 0.4, depthWrite: false, side: THREE.DoubleSide }));
  fall.position.set(OX, y + 0.5 + (h - 0.5) / 2, OZ);
  fall.raycast = () => {};
  g.add(fall);
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 0.5, 0.6, 48, 1, true), new THREE.MeshStandardMaterial({ color: "#a8d8ec", transparent: true, opacity: 0.35, roughness: 0.05, metalness: 0.4, side: THREE.DoubleSide }));
  bowl.position.set(OX, y + h - 0.3, OZ);
  g.add(bowl);
  const oc = new THREE.Mesh(new THREE.TorusGeometry(3.2, 0.07, 6, 64), glowMat("#bfefff", 1.6));
  oc.rotation.x = Math.PI / 2;
  oc.position.set(OX, y + h - 0.02, OZ);
  g.add(oc);
  k.rects[f].push([OX - 2.8, OZ - 2.8, OX + 2.8, OZ + 2.8]);
  k.ticks[f].push((dt) => {
    swirl.rotation.z += dt * 0.6;
    fallT.offset.y -= dt * 1.4;
  });
  k.pick(f, swirl, "<b>Rain Oculus</b><span>22 m³ a minute</span>", () => ({ eyebrow: "Grand atrium", title: "Rain Oculus", stats: [["Block", k.height ? num(k.height) : "…"], ["Since last block", k.since != null ? `${k.since} s` : "…"]] }));

  // the flock: two hundred gold ⓩ coins drifting under the roof
  const N = 220;
  const coin = new THREE.CylinderGeometry(0.16, 0.16, 0.025, 20);
  coin.rotateX(Math.PI / 2);
  const flock = new THREE.InstancedMesh(coin, new THREE.MeshStandardMaterial({ color: "#f4b728", emissive: "#a8741a", emissiveIntensity: 0.6, roughness: 0.25, metalness: 0.9 }), N);
  g.add(flock);
  const mtx = new THREE.Matrix4(),
    q = new THREE.Quaternion(),
    e = new THREE.Euler(),
    p = new THREE.Vector3(),
    one = new THREE.Vector3(1, 1, 1);
  const seeds = Array.from({ length: N }, (_, i) => ({ a: hash(i, 1, 9) * Math.PI * 2, r: 2.2 + hash(i, 2, 9) * 9, y: 5.6 + hash(i, 3, 9) * 2.6, s: 0.04 + hash(i, 4, 9) * 0.05, ph: hash(i, 5, 9) * 6 }));
  const flockTick = (t: number) => {
    seeds.forEach((s, i) => {
      const a = s.a + t * s.s;
      p.set(OX - 2 + Math.cos(a) * s.r, y + s.y + Math.sin(t * 0.7 + s.ph) * 0.25, OZ - 1 + Math.sin(a) * s.r * 0.7);
      e.set(Math.sin(t * 0.5 + s.ph) * 0.4, -a, 0);
      q.setFromEuler(e);
      flock.setMatrixAt(i, mtx.compose(p, q, one));
    });
    flock.instanceMatrix.needsUpdate = true;
  };
  flockTick(0);
  k.ticks[f].push((_, t) => flockTick(t));
  k.pick(f, flock, "<b>“Shielded flock”</b><span>220 gold coins</span>", () => ({ eyebrow: "Art installation", title: "“Shielded flock”", stats: [["Coins", "220"], ["Block reward", `${reward()} ZEC`]] }));

  // check-in: the long marble desk, a wall of walnut behind, the name in gold, receptionists
  box(g, 14, 6.6, 0.4, std("#3a2418", 0.6), 0, y, -20.6);
  for (let x = -6.5; x <= 6.5; x += 1) box(g, 0.06, 6.6, 0.1, k.gold, x, y, -20.38);
  box(g, 14.4, 0.1, 0.5, glowMat("#ffd28a", 1.2), 0, y + 6.6, -20.5);
  k.label(f, "MARINA ZEC HOTEL", 0, 5.4, -20.3, { h: 0.9, color: "#f4b728" });
  k.label(f, "ⓩ", 0, 4.0, -20.3, { h: 1.2, color: "#f4b728" });
  k.rects[f].push([-7, -21, 7, -20.3]);
  k.put(f, "frontDesk", () => H.frontDesk(9), 0, -17.6, 0);
  k.label(f, "RECEPTION · CHECK-IN", 0, 1.35, -16.74, { h: 0.18, color: "#3a2418", glow: false });
  const board = k.screen(f, 4.2, 1.1, (gc, W, Hh) => {
    gc.fillStyle = "#0a0806";
    gc.fillRect(0, 0, W, Hh);
    gc.fillStyle = "#f4b728";
    gc.font = '700 30px "JetBrains Mono", monospace';
    gc.textAlign = "center";
    fitText(gc, `BLOCK ${k.height ? num(k.height) : "…"}  ·  ${k.ctx.director.mempoolList().length} TX PENDING`, W / 2, Hh * 0.42);
    const pr = Market.state.price;
    gc.fillStyle = "#e9e0c8";
    gc.font = '500 24px "JetBrains Mono", monospace';
    fitText(gc, `ZEC ${pr ? usd(pr.usd) : "…"}  ·  ${new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`, W / 2, Hh * 0.78);
    gc.textAlign = "left";
  }, 2);
  board.position.set(0, y + 2.9, -20.36);
  [[-3, 7001, "Receptionist"], [0.2, 7002, "Receptionist"], [3, 7003, "Receptionist"]].forEach(([x, id, r]) => void k.person(f, id as number, [x as number, -18.8], r as string));
  k.hit(f, 9, 1.2, 0.9, 0, 0, -17.6, "<b>Check-in</b><span>key card</span>", () => {
    const room = 2001 + Math.floor(Math.random() * 8);
    return { eyebrow: "Reception", title: `Room ${room}`, mono: true, stats: [["Floor", "20"], ["Key", `ⓩ…${(k.height || 0).toString(16).slice(-4)}`], ["Check-out", "12:00"]], floor: 2 };
  });
  for (const [i, x] of [-4.6, 4.6].entries()) k.put(f, `orchid${i}`, () => F.plant("monstera", 40 + i), x, -18.6);
  // guests queuing with a trolley
  void k.person(f, 7010, [-1.5, -15.2], "Guest", { face: new THREE.Vector3(0, 0, -1) });
  void k.person(f, 7011, [-0.6, -15.4], "Guest", { face: new THREE.Vector3(0, 0, -1) });
  k.put(f, "trolley1", () => H.trolley(1), -2.9, -15.0, 0.2);

  // the water wall, north-east: eight metres of falling water into a long pond
  const wt = water(2, 4);
  const wfall = new THREE.Mesh(new THREE.PlaneGeometry(5, 7.4), new THREE.MeshStandardMaterial({ map: wt, emissive: "#2a8ab0", emissiveMap: wt, emissiveIntensity: 0.7, roughness: 0.1, metalness: 0.2 }));
  wfall.position.set(10.4, y + 4.0, -21.6);
  g.add(wfall);
  box(g, 5.6, 8.2, 0.2, std("#1a1820", 0.6), 10.4, y + 0.1, -21.82);
  box(g, 5.6, 0.1, 0.4, glowMat("#7fe3ff", 1.2), 10.4, y + 7.7, -21.6);
  const pond = water();
  const pm = new THREE.Mesh(new THREE.PlaneGeometry(5.4, 1.4), new THREE.MeshStandardMaterial({ map: pond, emissive: "#1a6a8a", emissiveIntensity: 0.5, roughness: 0.05 }));
  pm.rotation.x = -Math.PI / 2;
  pm.position.set(10.4, y + 0.36, -20.9);
  g.add(pm);
  box(g, 5.6, 0.34, 1.6, std("#2a2630", 0.5), 10.4, y, -20.9);
  k.rects[f].push([7.6, -22, 13.4, -20.1]);
  k.ticks[f].push((dt) => {
    wt.offset.y += dt * 0.6;
    pond.offset.x += dt * 0.04;
  });
  k.pick(f, wfall, "<b>Water wall</b><span>8 m</span>", () => ({ eyebrow: "Grand atrium", title: "Water wall" }));

  // the concierge, by the entrance: a desk, a live board with the ZEC rate
  k.put(f, "conciergeDesk", () => H.frontDesk(3), 10.6, -6.5, -Math.PI / 2);
  void k.person(f, 2024, [11.8, -6.5], "Concierge", { face: new THREE.Vector3(-1, 0, 0) });
  const rate = k.screen(f, 2.6, 1.5, (gc, W, Hh) => {
    const pr = Market.state.price,
      sp = Market.state.supply;
    gc.fillStyle = "#0a0806";
    gc.fillRect(0, 0, W, Hh);
    gc.strokeStyle = "#c9a227";
    gc.lineWidth = 6;
    gc.strokeRect(6, 6, W - 12, Hh - 12);
    gc.fillStyle = "#c9a227";
    gc.font = '700 30px "JetBrains Mono", monospace';
    fitText(gc, "CONCIERGE", 28, 52);
    gc.fillStyle = "#f4ead0";
    gc.font = '800 74px "JetBrains Mono", monospace';
    fitText(gc, pr ? `ZEC ${usd(pr.usd)}` : "ZEC …", 28, 140);
    if (pr) {
      gc.fillStyle = pr.usd_24h_change >= 0 ? "#3ee08f" : "#ff5a5a";
      gc.font = '700 30px "JetBrains Mono", monospace';
      fitText(gc, `${pr.usd_24h_change >= 0 ? "▲" : "▼"} ${Math.abs(pr.usd_24h_change).toFixed(2)}% 24h`, 28, 190);
      const hs = pr.history.map((h) => h[1]);
      if (hs.length > 1) {
        const lo = Math.min(...hs),
          hi = Math.max(...hs);
        gc.strokeStyle = "#f4b728";
        gc.lineWidth = 3;
        gc.beginPath();
        hs.forEach((v, i) => gc.lineTo(28 + (i / (hs.length - 1)) * (W - 56), Hh - 30 - ((v - lo) / (hi - lo || 1)) * 60));
        gc.stroke();
      }
    }
    gc.fillStyle = "#a89a7a";
    gc.font = '500 22px "JetBrains Mono", monospace';
    fitText(gc, sp ? `Supply ${num(Math.round(sp.supply))} ZEC` : "", W - 28 - 300, 52, 300);
  }, 5);
  rate.position.set(12.6, y + 2.9, -6.5);
  rate.rotation.y = -Math.PI / 2;
  box(g, 0.3, 4.2, 3.0, std("#3a2418", 0.6), 12.8, y, -6.5);
  k.rects[f].push([12.6, -8, 13.4, -5]);
  k.label(f, "CONCIERGE", 12.62, 4.0, -6.5, { h: 0.3, color: "#f4b728", rot: -Math.PI / 2 });
  k.hit(f, 0.9, 1.2, 3, 10.6, 0, -6.5, "<b>Concierge</b><span>ZEC rate</span>", () => {
    const pr = Market.state.price,
      sp = Market.state.supply;
    return { eyebrow: "Concierge", title: pr ? `ZEC ${usd(pr.usd)}` : "ZEC …", tag: pr ? [`${pr.usd_24h_change >= 0 ? "+" : ""}${pr.usd_24h_change.toFixed(2)}% 24h`, pr.usd_24h_change >= 0 ? "ok" : "warn"] : undefined, stats: pr ? [["Market cap", `$${(pr.market_cap_usd / 1e9).toFixed(2)} B`], ["Volume 24h", `$${(pr.volume_24h_usd / 1e6).toFixed(1)} M`], ["Supply", sp ? `${num(Math.round(sp.supply))} ZEC` : "…"], ["Next halving", sp ? num(sp.next_halving_height) : "…"]] : undefined };
  });
  // bell desk, luggage trolleys and a bellboy by the doors
  k.put(f, "trolley2", () => H.trolley(2), 5.0, -2.6, -0.3);
  k.put(f, "trolley3", () => H.trolley(4), 6.4, -2.2, 0.2);
  void k.person(f, 7020, [4.4, -3.6], "Bellboy", { face: new THREE.Vector3(-0.4, 0, 1), wander: [[4.4, -3.6], [3, -12], [-2, -14], [6, -9]] });
  k.put(f, "bellDesk", () => H.frontDesk(1.4), 8.6, -1.2, Math.PI);
  k.label(f, "BELL DESK", 8.6, 1.5, -0.68, { h: 0.14, color: "#f4b728", rot: Math.PI });

  // the lounge, south-west: sofas and club chairs on a rug, the grand piano and its pianist
  k.put(f, "rugLounge", () => F.rug(7, 4.6, "#2a3a5a", "#c9a227"), -8.6, -4.2, 0, { solid: false });
  k.put(f, "sofaLobby", () => F.sofa("#e8dcc4", 3, "#c9a227"), -8.6, -6.2, 0);
  k.put(f, "clubTeal", () => H.clubChair("#2f6a6a"), -11.4, -3.6, Math.PI / 2);
  k.put(f, "clubTeal", () => H.clubChair("#2f6a6a"), -11.4, -2.0, Math.PI / 2);
  k.put(f, "clubRust", () => H.clubChair("#8a4a3a"), -5.8, -3.0, -Math.PI / 2);
  k.put(f, "coffeeL", F.coffeeTable, -8.6, -4.0);
  k.put(f, "sideLamp", () => H.sideTable(), -11.4, -5.0, 0, { solid: false });
  k.put(f, "sideLamp", () => H.sideTable(), -5.6, -6.4, 0, { solid: false });
  void k.person(f, 1111, [-9.2, -6.1], "Guest", { sit: true, dy: 0.42 });
  void k.person(f, 1112, [-11.3, -3.6], "Guest", { sit: true, dy: 0.42, face: new THREE.Vector3(1, 0, 0) });
  void k.person(f, 1113, [-5.9, -3.0], "Guest", { sit: true, dy: 0.42, face: new THREE.Vector3(-1, 0, 0) });
  k.put(f, "piano", F.grandPiano, -6.0, -10.6, Math.PI * 0.75);
  k.put(f, "pianoBench", F.pianoBench, -6.9, -9.6, Math.PI * 0.75, { solid: false });
  // the pianist plays Chopin for the lounge (a real recording, heard from the piano: src/interior/music)
  pianist(g, { x: -6.0, y: 0, z: -10.6, rot: Math.PI * 0.75 }, { place: "hotel", floor: f, track: "piano-nocturne", id: 4545, level: 0.8 });
  let requests = 0;
  k.hit(f, 1.6, 1.2, 2.0, -6.0, 0, -10.6, "<b>Grand piano</b><span>live: Chopin</span>", () => ({ eyebrow: "Grand piano · live", title: "♪ Chopin · Nocturne Op. 9 No. 2", stats: [["Pianist", "zkSNARK #4545"], ["Requests", `${++requests}`]] }), Math.PI * 0.75);
  k.put(f, "rugPiano", () => F.rug(3.6, 3.6, "#5a1a2a", "#c9a227"), -6.2, -10.4, 0.2, { solid: false });

  // the lobby bar, north-west
  k.put(f, "lobbyBar", () => F.barCounter(4.5, "#f4b728"), -10.2, -17.4, 0);
  k.put(f, "lobbyBackBar", () => F.backBar(4.5), -10.2, -20.6, 0);
  k.label(f, "ATRIUM BAR", -10.2, 3.4, -20.3, { h: 0.4, color: "#f4b728" });
  for (let i = 0; i < 5; i++) k.put(f, "stoolGold", () => F.stool("#5a1a2a"), -12.0 + i * 0.9, -16.5, 0, { solid: false });
  void k.person(f, 4444, [-10.2, -19.2], "Bartender");
  void k.person(f, 1357, [-11.1, -16.4], "Guest", { face: new THREE.Vector3(0, 0, -1), sit: true, dy: 0.7 });
  const drinks = ["a Marina Sling", "a Shielded Sour", "an Orchard Spritz", "a Halving Highball"];
  let served = 0;
  k.hit(f, 4.5, 1.1, 0.9, -10.2, 0, -17.4, "<b>Atrium Bar</b><span>order</span>", () => ({ eyebrow: "Atrium Bar", title: `${drinks[served++ % drinks.length]} 🍸`, stats: [["Orders", `${served}`], ["Block", k.height ? num(k.height) : "…"]] }));

  // trees, chandeliers of light, plants, the floor directory, guests
  for (const [i, [x, z]] of ([[-4.6, -13.6], [5.2, -13.2], [-3.6, -1.6], [3.6, -1.6], [9.6, -15.4]] as [number, number][]).entries()) k.put(f, `atTree${i}`, () => F.indoorTree(i + 3), x, z);
  const dir = k.screen(f, 1.8, 2.1, (gc, W, Hh) => {
    gc.fillStyle = "#0a0806";
    gc.fillRect(0, 0, W, Hh);
    gc.fillStyle = "#f4b728";
    gc.font = '700 34px "JetBrains Mono", monospace';
    fitText(gc, "MARINA ZEC", 24, 52);
    gc.font = '500 22px "JetBrains Mono", monospace';
    LEVELS.slice()
      .reverse()
      .forEach((l, i) => {
        gc.fillStyle = "#f4b728";
        gc.fillText(l.label, 24, 108 + i * 72);
        gc.fillStyle = "#f4ead0";
        fitText(gc, l.name.split(" · ")[0], 88, 108 + i * 72);
        gc.fillStyle = "#8a7e66";
        fitText(gc, l.name.split(" · ")[1] ?? "", 88, 136 + i * 72);
      });
  }, 60);
  dir.position.set(LEVELS[f].x0 + 0.22, y + 1.9, LIFT_Z + 4.6);
  dir.rotation.y = Math.PI / 2;
  k.painting(f, 777, LEVELS[f].x0 + 0.22, 3.4, LIFT_Z - 6, Math.PI / 2, 1.8);
  // (the grand staircase's doorway is in the corner behind the bar)
  k.sconces(f, [LEVELS[f].x0 + 0.15, -18.5], [LEVELS[f].x0 + 0.15, -15.3], 2, Math.PI / 2, 3.4);
  k.sconces(f, [LEVELS[f].x0 + 0.15, -7.5], [LEVELS[f].x0 + 0.15, -1.5], 3, Math.PI / 2, 3.4);
  void k.person(f, 1212, [2, -6], "Guest", { wander: [[2, -6], [-3, -14], [6, -11], [0, -3], [8, -14], [-12, -11]] });
  void k.person(f, 1213, [-3, -5], "Guest", { wander: [[-3, -5], [4, -15], [-12, -10], [2, -3]] });
  void k.person(f, 1214, [6.5, -12], "Guest", { face: new THREE.Vector3(0.4, 0, -1) });
  k.light(f, OX, OZ, "#e8f8ff", 26, -1.5, 30);
  k.light(f, 0, -16, "#ffe2b0", 16, -2.5, 24);
  k.light(f, -8.6, -5, "#ffd8a8", 12, -3.5);
  k.light(f, 10, -8, "#ffe6c8", 10, -3.5);
  k.light(f, -10, -18, "#ffc890", 10, -4);
}
