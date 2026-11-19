/**
 * CHAIN STACK · STORM AT SEA: four cargo ships side by side in a gale, a chain on each deck. The ships
 * roll: each tower leans with its deck, so its top swings under the rig (the glowing slot follows it),
 * and the storm grows. Round it: a faceted sea heaving, spray over the bows, rain, lightning, a
 * lighthouse on its rock, ships far off.
 */
import * as THREE from "three";
import { rng } from "../../kit";
import { GEO, glow, skyDome } from "../../k3";
import { Fall, Parts, softGlow } from "../sign-levels/parts";
import { blinkers, boxes, cloudDeck, swell } from "../sign-levels/vista";
import type { StackCtx, StackLive, StackState } from "./types";

/** The sea's surface (m, under the decks at 0). */
export const SEA_Y = -1.5;

export function seaSet(c: StackCtx): StackLive {
  const { scene, rnd } = c;
  c.hemi.color.set("#cbd6ea");
  c.hemi.groundColor.set("#2a3a50");
  c.hemi.intensity = 1.45;
  c.sun.color.set("#e8eef8");
  c.sun.intensity = 1.7;
  // (from straight in front, as on every level: a block's shadow falls dead under it; a storm's light: soft shadows)
  c.sun.position.set(-4, 40, 34);
  scene.userData.shadowK = 0.7;
  const hemi0 = c.hemi.intensity;

  // ---- the ships: a hull on each seat's tower, rolling round its deck's middle
  const ships: THREE.Group[] = [];
  for (let i = 0; i < 4; i++) {
    const B = new Parts();
    const col = c.players[i].color;
    // the hull: red below the water, navy above, the seat's stripe, a pointed bow toward us
    B.box("#a8342a", 4.4, 1.3, 8.8, 0, -2.9, -1.0, 0.06);
    B.box("#1f2a4a", 4.4, 1.6, 8.8, 0, -1.6, -1.0, 0.06);
    B.add("box", "#a8342a", 3.1, 1.3, 3.1, 0, -2.25, 3.4, { ry: Math.PI / 4, ink: 0.06 });
    B.add("box", "#1f2a4a", 3.1, 1.6, 3.1, 0, -0.8, 3.4, { ry: Math.PI / 4, ink: 0.06 });
    B.lit(col, 4.46, 0.28, 8.82, 0, -0.75, -1.0);
    B.add("box", col, 3.14, 0.28, 3.14, 0, -0.61, 3.4, { ry: Math.PI / 4, lit: true });
    // the deck, its white rails
    B.box("#7a6a5a", 4.2, 0.1, 8.6, 0, -0.1, -1.0, 0);
    for (const sx of [-1, 1]) B.box("#eef2f8", 0.08, 0.5, 8.4, sx * 2.1, 0, -1.0, 0.02);
    // the bridge at the stern, its windows, the funnel in the seat's colour
    B.box("#eef2f8", 3.6, 2.2, 1.8, 0, 0, -4.6, 0.04);
    B.box("#eef2f8", 2.6, 1.0, 1.5, 0, 2.2, -4.6, 0.03);
    B.lit("#ffe9a8", 2.4, 0.3, 0.05, 0, 2.6, -3.84);
    B.lit("#ffe9a8", 3.3, 0.25, 0.05, 0, 1.4, -3.69);
    B.box(col, 0.9, 1.6, 0.9, 0.9, 3.2, -4.9, 0.03);
    B.box("#1a1033", 0.92, 0.3, 0.92, 0.9, 4.8, -4.9, 0);
    B.add("ball", "#ff3d5a", 0.3, 0.3, 0.3, -1.0, 3.5, -4.6, { lit: true });
    // containers between the tower and the bridge
    const cc = ["#d9483b", "#2f8fd8", "#f2b53a", "#3fae6a", "#e9eef4", "#8a5cd8"];
    for (let j = 0; j < 3; j++) {
      const n = 1 + Math.floor(rnd() * 2);
      for (let k = 0; k < n; k++) B.box(cc[Math.floor(rnd() * cc.length)], 1.25, 1.1, 2.0, -1.4 + j * 1.4, k * 1.12, -2.55, 0.03);
    }
    const g = new THREE.Group();
    g.position.set(c.tx[i], 0, 0);
    B.build(g, c.ink);
    scene.add(g);
    ships.push(g);
  }

  // foam round each hull at the waterline (it stays on the water as the ship rolls)
  const foamM = new THREE.MeshBasicMaterial({ map: softGlow(), color: "#e8f6ff", transparent: true, opacity: 0.45, depthWrite: false });
  for (let i = 0; i < 4; i++) {
    const f = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), foamM);
    f.scale.set(7.5, 1, 13.5);
    f.position.set(c.tx[i], SEA_Y + 0.12, -0.6);
    f.renderOrder = 1;
    scene.add(f);
  }
  // ---- the sea: a faceted heaving patch round the ships, flat water beyond
  const W = 150,
    D = 100,
    NX = 50,
    NZ = 34;
  const geo = new THREE.PlaneGeometry(W, D, NX, NZ).rotateX(-Math.PI / 2);
  geo.translate(0, SEA_Y, -26);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const base = new Float32Array(pos.array.length);
  base.set(pos.array as Float32Array);
  const seaM = new THREE.MeshLambertMaterial({ color: "#2b6184", flatShading: true, emissive: new THREE.Color("#081a2a") });
  const sea = new THREE.Mesh(geo, seaM);
  scene.add(sea);
  const far = new THREE.Mesh(new THREE.PlaneGeometry(1700, 1700).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: "#244a66" }));
  far.position.y = SEA_Y - 0.6;
  far.userData.noShadow = true;
  scene.add(far);
  // (the set's own dice from here on: the sky, the swell, the far shore)
  const cos = rng(0x5ea5);
  // the sky: the storm's cloud bank all round, a pale gap low in the west
  skyDome(scene, { sky: ["#141a2e", "#5b6782"], ground: "#5b6782", clouds: 26, cloud: "#6a7690", cloudShade: "#2c3448", haze: 0.5, rnd: cos });
  // the swell: long pale crests rolling in over the heaving patch and far past it, to the horizon
  const rollers = swell(scene, { n: 90, x0: -150, x1: 150, z0: -230, z1: 14, y: SEA_Y + 0.42, rnd: cos, color: "#a9c6dc", len: [7, 22], wide: 0.8, speed: 1.6, opacity: 0.5 });
  // the far shore: stacks of dark rock off to the right, a headland behind the lighthouse
  const rock: [string, number, number, number, number, number, number, number?][] = [];
  for (let k = 0; k < 9; k++) {
    const x = 84 + k * 17 + cos() * 8;
    const h = 5 + cos() * 15;
    rock.push([k % 2 ? "#343a4e" : "#2c3244", 9 + cos() * 9, h, 9 + cos() * 7, x, SEA_Y + h / 2 - 1, -150 - cos() * 60, cos()]);
  }
  for (let k = 0; k < 6; k++) {
    const h = 7 + cos() * 9 - k;
    rock.push(["#2f3548", 16, h, 14, -112 - k * 13, SEA_Y + h / 2 - 1, -128 - k * 5, cos()]);
  }
  boxes(scene, rock);
  // the storm's low scud racing over the horizon
  const scud = cloudDeck(scene, { n: 14, x0: -260, x1: 260, y0: 26, y1: 60, z0: -300, z1: -150, rnd: cos, color: "#55607a", shade: "#2a3144", speed: 5, size: 3 });
  // two channel buoys off the row's ends, riding the swell, their lamps blinking (red to port, green to starboard)
  const buoys: THREE.Group[] = [];
  const lampAt: [number, number, number, number, string, number][] = [];
  for (const sx of [-1, 1]) {
    const g = new THREE.Group();
    const col = sx < 0 ? "#d8402a" : "#2fae6a";
    const P2 = new Parts();
    P2.cyl(col, 0.8, 1.1, 0, -0.3, 0, 0.05);
    P2.cyl("#eef2f8", 0.55, 0.5, 0, 0.8, 0, 0.04);
    P2.box("#2b2d3c", 0.16, 1.9, 0.16, 0, 1.3, 0, 0);
    P2.build(g, c.ink);
    g.position.set(sx * 22.5, SEA_Y, 5.5);
    g.traverse((o) => (o.userData.noShadow = true));
    scene.add(g);
    buoys.push(g);
    lampAt.push([0, 3.5, 0, 0.5, sx < 0 ? "#ff5a4a" : "#6dffa8", sx < 0 ? 0 : 0.7]);
  }
  const lamps = lampAt.map((l, i) => {
    const b = blinkers(buoys[i], [l]);
    return b;
  });
  // whitecaps on the patch (cosmetic), spray over the bows
  const caps = new THREE.InstancedMesh(GEO.box, glow("#e8f4ff", 0.7), 70);
  caps.frustumCulled = false;
  scene.add(caps);
  const capP = new Float32Array(70 * 3);
  for (let k = 0; k < 70; k++) ((capP[k * 3] = (rnd() - 0.5) * W * 0.8), (capP[k * 3 + 1] = -26 + (rnd() - 0.5) * D * 0.8), (capP[k * 3 + 2] = rnd() * 6));
  const NS = 80;
  const spray = new THREE.InstancedMesh(GEO.box, glow("#ffffff", 0.85), NS);
  spray.frustumCulled = false;
  scene.add(spray);
  const sp = new Float32Array(NS * 7);
  let spN = 0;

  // ---- the lighthouse on its rock (left, far), ships far off, the rain, the lightning
  const L = new Parts();
  L.add("cone", "#3a3a48", 22, 9, 16, -96, SEA_Y + 2.5, -120, { ry: 0.5, ink: 0.1 });
  for (let k = 0; k < 6; k++) L.cyl(k % 2 ? "#d84a3a" : "#f4f4f8", 2.4 - k * 0.15, 3, -96, SEA_Y + 6 + k * 3, -120, 0.08);
  L.cyl("#2b2d3c", 1.6, 2, -96, SEA_Y + 24, -120, 0.06);
  L.add("ball", "#fff2b0", 2.2, 2.2, 2.2, -96, SEA_Y + 25, -120, { lit: true });
  for (let k = 0; k < 3; k++) {
    const x = 40 + k * 30,
      z = -110 - k * 30;
    L.box("#2a3040", 18, 3, 4, x, SEA_Y, z, 0);
    L.box("#3a4050", 4, 4, 3, x - 6, SEA_Y + 3, z, 0);
    L.lit("#ffe9a8", 0.6, 0.6, 0.6, x + 8, SEA_Y + 3.2, z);
  }
  L.build(scene, c.ink);
  const beamM = new THREE.MeshBasicMaterial({ color: "#fff2b0", transparent: true, opacity: 0.09, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const beam = new THREE.Mesh(new THREE.ConeGeometry(6, 60, 16, 1, true).rotateZ(Math.PI / 2).translate(30, 0, 0), beamM);
  beam.position.set(-96, SEA_Y + 25, -120);
  scene.add(beam);
  const rain = new Fall(scene, 240, new THREE.MeshBasicMaterial({ color: "#c8daf0", transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false }), { x: 0, z: 2, w: 60, d: 26, y0: -2, y1: 30, v: 24, size: [0.03, 1.0, 0.03] });
  const bm = glow("#f4f0ff");
  const bolts: THREE.InstancedMesh[] = [];
  for (let b = 0; b < 2; b++) {
    const n = 8;
    const im = new THREE.InstancedMesh(GEO.box, bm, n);
    let x = -40 + b * 70,
      y = 60;
    const z = -120;
    const m = new THREE.Matrix4(),
      q = new THREE.Quaternion(),
      p = new THREE.Vector3(),
      s = new THREE.Vector3(),
      e = new THREE.Euler();
    for (let k = 0; k < n; k++) {
      const nx = x + (rnd() - 0.5) * 14,
        ny = y - 8 - rnd() * 5;
      e.set(0, 0, -Math.atan2(nx - x, ny - y));
      q.setFromEuler(e);
      m.compose(p.set((x + nx) / 2, (y + ny) / 2, z), q, s.set(0.8, Math.hypot(nx - x, ny - y), 0.8));
      im.setMatrixAt(k, m);
      x = nx;
      y = ny;
    }
    im.visible = false;
    im.frustumCulled = false;
    scene.add(im);
    bolts.push(im);
  }
  const m4 = new THREE.Matrix4(),
    q4 = new THREE.Quaternion(),
    pv = new THREE.Vector3(),
    sv = new THREE.Vector3();
  const prevRoll = [0, 0, 0, 0];
  let bolt = -1;
  return {
    tick(dt: number, s: StackState) {
      const t = s.t;
      const amp = 0.4 + 0.55 * s.storm;
      // the heave
      const a = pos.array as Float32Array;
      for (let k = 0; k < a.length; k += 3) {
        const x = base[k],
          z = base[k + 2];
        a[k + 1] = base[k + 1] + amp * (Math.sin(0.33 * x + 1.25 * t) + 0.6 * Math.sin(0.27 * z - 0.9 * t + x * 0.05));
      }
      pos.needsUpdate = true;
      // the ships roll (round their decks' middle), the spray off their bows as they dig in
      for (let i = 0; i < 4; i++) {
        const g = ships[i];
        g.rotation.z = -s.roll[i];
        const rv = dt > 0 ? (s.roll[i] - prevRoll[i]) / dt : 0;
        prevRoll[i] = s.roll[i];
        if (s.playing && Math.abs(rv) > 0.035 && Math.random() < dt * (3 + s.storm * 6)) {
          for (let k = 0; k < 6; k++) {
            const j = spN++ % NS;
            sp[j * 7] = c.tx[i] + (Math.random() - 0.5) * 3;
            sp[j * 7 + 1] = SEA_Y + 0.4;
            sp[j * 7 + 2] = 4.6 + Math.random();
            sp[j * 7 + 3] = (Math.random() - 0.5) * 3;
            sp[j * 7 + 4] = 3 + Math.random() * 3;
            sp[j * 7 + 5] = 1 + Math.random() * 2;
            sp[j * 7 + 6] = 1;
          }
        }
      }
      for (let j = 0; j < NS; j++) {
        let life = sp[j * 7 + 6];
        if (life > 0) {
          life -= dt * 1.4;
          sp[j * 7 + 6] = life;
          sp[j * 7 + 4] -= 12 * dt;
          sp[j * 7] += sp[j * 7 + 3] * dt;
          sp[j * 7 + 1] += sp[j * 7 + 4] * dt;
          sp[j * 7 + 2] += sp[j * 7 + 5] * dt;
        }
        const sc = life > 0 ? 0.12 + life * 0.18 : 0;
        m4.compose(pv.set(sp[j * 7], sp[j * 7 + 1], sp[j * 7 + 2]), q4, sv.set(sc, sc, sc));
        spray.setMatrixAt(j, m4);
      }
      spray.instanceMatrix.needsUpdate = true;
      for (let k = 0; k < 70; k++) {
        const ph = (t * 0.6 + capP[k * 3 + 2]) % 6;
        const sc = ph < 1.2 ? Math.sin((ph / 1.2) * Math.PI) * (0.5 + s.storm) : 0;
        const x = capP[k * 3],
          z = capP[k * 3 + 1];
        const y = SEA_Y + amp * (Math.sin(0.33 * x + 1.25 * t) + 0.6 * Math.sin(0.27 * (z + 26) - 0.9 * t + x * 0.05)) + 0.1;
        m4.compose(pv.set(x, y, z), q4, sv.set(sc * 1.6, sc * 0.12, sc * 0.7));
        caps.setMatrixAt(k, m4);
      }
      caps.instanceMatrix.needsUpdate = true;
      rain.tick(dt, t, 3 + s.storm * 5, -0.12 - s.storm * 0.12);
      rollers.tick(t);
      scud.tick(t);
      for (let i = 0; i < buoys.length; i++) {
        const b = buoys[i];
        b.position.y = SEA_Y + amp * (Math.sin(0.33 * b.position.x + 1.25 * t) + 0.6 * Math.sin(0.27 * (b.position.z + 26) - 0.9 * t + b.position.x * 0.05));
        b.rotation.z = Math.sin(t * 1.3 + i * 2) * 0.16;
        b.rotation.x = Math.sin(t * 1.1 + i) * 0.12;
        lamps[i].tick(t);
      }
      beam.rotation.y = t * 0.8;
      // the lightning: the light up, a bolt far off
      if (s.flash > 0.3) {
        if (bolt < 0) bolt = Math.floor(Math.random() * bolts.length);
      } else bolt = -1;
      for (let b = 0; b < bolts.length; b++) bolts[b].visible = b === bolt;
      c.hemi.intensity = hemi0 * (1 + s.flash * 1.2);
      foamM.opacity = 0.32 + 0.18 * Math.sin(t * 1.7) + s.storm * 0.12;
    },
  };
}
