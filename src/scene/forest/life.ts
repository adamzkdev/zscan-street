import * as THREE from "three";
import { toObject } from "../voxel/mesher";
import { C, VoxelModel } from "../voxel/model";
import { creekAt, F, FALLS, Land, rnd, SITES, trailDist, WATER } from "./land";

/**
 * What moves in Shielded Woods: black-tailed deer grazing (they lift their heads, wander, bolt
 * when you come close), ravens circling over the canopy and little birds flitting between the
 * trees, the falls pouring, mist at their foot, the campfire's flames and sparks, smoke from the
 * cabin's chimney, fog banks drifting through the trunks, and at night the fireflies.
 */

const rand = (a: number, b: number) => a + Math.random() * (b - a);

// ---- soft round texture for fog, glows, mist ------------------------------------------------------
function soft(inner: string, outer: string, size = 128) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  const gr = g.createRadialGradient(size / 2, size / 2, 2, size / 2, size / 2, size / 2 - 1);
  gr.addColorStop(0, inner);
  gr.addColorStop(1, outer);
  g.fillStyle = gr;
  g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  return t;
}
const SOFT = soft("rgba(255,255,255,1)", "rgba(255,255,255,0)");

// ---- deer -----------------------------------------------------------------------------------------
function deerModel(head: "up" | "down", buck: boolean) {
  const m = new VoxelModel(16, 16, 6);
  const coat = C("#a8784a"),
    dark = C("#7a5434"),
    belly = C("#e8dcc4"),
    hoof = C("#2a2420");
  // body, legs, tail (+x is the head end)
  m.box(3, 6, 1, 12, 10, 5, coat);
  m.box(4, 6, 2, 11, 7, 4, belly);
  m.box(3, 9, 1, 12, 10, 5, dark);
  for (const x of [4, 10]) for (const z of [1, 4]) {
    m.box(x, 1, z, x + 1, 6, z + 1, coat);
    m.box(x, 0, z, x + 1, 1, z + 1, hoof);
  }
  m.box(2, 8, 2, 3, 10, 4, C("#f4f0e8"));
  m.box(1, 9, 2, 2, 10, 4, C("#1a1614"));
  if (head === "up") {
    m.box(11, 9, 2, 13, 13, 4, coat);
    m.box(12, 12, 2, 15, 14, 4, coat);
    m.box(14, 12, 2, 15, 13, 4, C("#1a1614"));
    m.box(12, 14, 1, 13, 15, 2, coat);
    m.box(12, 14, 4, 13, 15, 5, coat);
    if (buck) {
      m.box(12, 15, 1, 13, 16, 2, C("#c8b89a"));
      m.box(12, 15, 4, 13, 16, 5, C("#c8b89a"));
      m.box(11, 15, 0, 12, 16, 1, C("#c8b89a"));
      m.box(11, 15, 5, 12, 16, 6, C("#c8b89a"));
    }
  } else {
    m.box(11, 5, 2, 13, 9, 4, coat);
    m.box(12, 2, 2, 14, 5, 4, coat);
    m.box(13, 1, 2, 14, 2, 4, C("#1a1614"));
    m.box(11, 5, 1, 12, 6, 2, coat);
    m.box(11, 5, 4, 12, 6, 5, coat);
  }
  return m;
}

interface Deer {
  root: THREE.Group;
  up: THREE.Object3D;
  down: THREE.Object3D;
  state: "graze" | "look" | "walk" | "flee";
  until: number;
  target: THREE.Vector2;
  speed: number;
  home: THREE.Vector2;
}

// ---- birds ----------------------------------------------------------------------------------------
function birdModel(color: string, span: number, up: boolean) {
  const m = new VoxelModel(span * 2 + 3, 5, 5);
  const c = C(color);
  const cx = span + 1;
  m.box(cx, 2, 0, cx + 1, 3, 5, c);
  m.box(cx, 2, 4, cx + 1, 3, 5, C("#d8a030"));
  for (let k = 1; k <= span; k++) {
    const y = up ? 2 + Math.min(2, Math.floor(k / 2)) : 2 - Math.min(2, Math.floor(k / 2));
    m.box(cx - k, y, 1, cx - k + 1, y + 1, 3, c);
    m.box(cx + k, y, 1, cx + k + 1, y + 1, 3, c);
  }
  return m;
}

interface Bird {
  root: THREE.Group;
  frames: THREE.Object3D[];
  kind: "raven" | "small";
  cx: number;
  cz: number;
  r: number;
  y: number;
  a: number;
  w: number;
  from: THREE.Vector3;
  to: THREE.Vector3;
  t: number;
  dur: number;
}

export class Wildlife {
  readonly group = new THREE.Group();
  private deer: Deer[] = [];
  private birds: Bird[] = [];
  private flies: THREE.Points;
  private flyBase: Float32Array;
  private flyPhase: Float32Array;
  private fog: THREE.Sprite[] = [];
  private fogMat: THREE.SpriteMaterial[] = [];

  private fallsTex: THREE.CanvasTexture;
  private mist: THREE.Sprite[] = [];
  private flames: THREE.Sprite[] = [];
  private glow: THREE.Sprite;
  private sparks: THREE.Points;
  private sparkV: Float32Array;
  private smoke: THREE.Sprite[] = [];
  private night = false;

  constructor(
    private land: Land,
    private fire: THREE.Vector3,
    private chimney: THREE.Vector3,
    private blocked: (x: number, z: number) => boolean,
  ) {
    const R = rnd(77);
    // deer: a few small herds, one with a buck
    const herds: [number, number, number][] = [
      [204, 204, 3],
      [130, 228, 2],
      [222, 224, 2],
      [190, 222, 2],
    ];
    herds.forEach(([hx, hz, n], hi) => {
      for (let i = 0; i < n; i++) {
        const buck = i === 0 && hi % 2 === 0;
        const up = toObject(deerModel("up", buck));
        const down = toObject(deerModel("down", buck));
        const root = new THREE.Group();
        root.add(up, down);
        root.scale.setScalar(0.6 * (buck ? 1.12 : 1));
        const x = hx + rand(-3, 3),
          z = hz + rand(-3, 3);
        root.position.set(x, land.raw(x, z), z);
        root.rotation.y = R() * Math.PI * 2;
        this.group.add(root);
        this.deer.push({ root, up, down, state: "graze", until: rand(0, 6), target: new THREE.Vector2(x, z), speed: 0, home: new THREE.Vector2(hx, hz) });
      }
    });

    // ravens circling high, small birds hopping between treetops
    for (let i = 0; i < 4; i++) {
      const frames = [toObject(birdModel("#1a1a22", 5, true)), toObject(birdModel("#1a1a22", 5, false))];
      const root = new THREE.Group();
      frames.forEach((f) => root.add(f));
      root.scale.setScalar(1.6);
      this.group.add(root);
      this.birds.push({ root, frames, kind: "raven", cx: rand(150, 220), cz: rand(200, 228), r: rand(14, 26), y: rand(32, 44), a: rand(0, 6.28), w: rand(0.18, 0.3) * (i % 2 ? 1 : -1), from: new THREE.Vector3(), to: new THREE.Vector3(), t: 0, dur: 1 });
    }
    for (let i = 0; i < 14; i++) {
      const col = ["#c84a2a", "#3a5aa8", "#7a6a4a", "#e8c040"][i % 4];
      const frames = [toObject(birdModel(col, 2, true)), toObject(birdModel(col, 2, false))];
      const root = new THREE.Group();
      frames.forEach((f) => root.add(f));
      this.group.add(root);
      const p = this.perch();
      root.position.copy(p);
      this.birds.push({ root, frames, kind: "small", cx: 0, cz: 0, r: 0, y: 0, a: 0, w: 0, from: p.clone(), to: p.clone(), t: 1, dur: 1 });
    }

    // fireflies: over the creek, the clearings, the trails
    const N = 360;
    this.flyBase = new Float32Array(N * 3);
    this.flyPhase = new Float32Array(N);
    let k = 0;
    while (k < N) {
      const x = rand(F.x0 + 4, F.x1 - 2),
        z = rand(F.z0, F.z1 - 1);
      if (!land.inside(x, z)) continue;
      const h = land.raw(x, z);
      if (h < WATER + 0.5) continue;
      const near = creekAt(x, z).d < 6 || trailDist(x, z) < 5 || Math.hypot(x - SITES.camp.x, z - SITES.camp.z) < 12;
      if (!near && Math.random() < 0.7) continue;
      this.flyBase.set([x, h + rand(0.4, 2.6), z], k * 3);
      this.flyPhase[k] = rand(0, 100);
      k++;
    }
    const fg = new THREE.BufferGeometry();
    fg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(this.flyBase), 3));
    fg.setAttribute("color", new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    this.flies = new THREE.Points(fg, new THREE.PointsMaterial({ size: 0.22, map: SOFT, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    this.flies.frustumCulled = false;
    this.flies.visible = false;
    this.group.add(this.flies);

    // fog banks drifting through the trunks
    for (let i = 0; i < 26; i++) {
      const mat = new THREE.SpriteMaterial({ map: SOFT, color: "#eef2f4", transparent: true, opacity: 0.3, depthWrite: false, fog: true });
      const s = new THREE.Sprite(mat);
      const size = rand(10, 20);
      s.scale.set(size * 1.6, size * 0.55, 1);
      s.userData.v = rand(0.35, 0.8);
      s.userData.hy = rand(2.5, 9);
      s.position.set(rand(F.x0 + 12, F.x1 - 12), 0, rand(204, 228));
      s.renderOrder = 3;
      this.fog.push(s);
      this.fogMat.push(mat);
      this.group.add(s);
    }

    // the falls: a sheet of water, streaks pouring down, mist at the foot
    const fc = document.createElement("canvas");
    fc.width = 64;
    fc.height = 256;
    const g = fc.getContext("2d")!;
    g.fillStyle = "rgba(170,215,235,0.75)";
    g.fillRect(0, 0, 64, 256);
    for (let i = 0; i < 90; i++) {
      g.fillStyle = `rgba(255,255,255,${rand(0.25, 0.8)})`;
      g.fillRect(rand(0, 64), rand(0, 256), rand(1, 3), rand(20, 70));
    }
    this.fallsTex = new THREE.CanvasTexture(fc);
    this.fallsTex.wrapS = this.fallsTex.wrapT = THREE.RepeatWrapping;
    this.fallsTex.repeat.set(1.5, 1.2);
    const [tx, ty, tz] = FALLS.top,
      [, fy] = FALLS.foot;
    const fall = new THREE.Mesh(new THREE.PlaneGeometry(1.8, ty - fy + 0.4, 1, 4), new THREE.MeshBasicMaterial({ map: this.fallsTex, transparent: true, depthWrite: false, side: THREE.DoubleSide, color: new THREE.Color(1.05, 1.1, 1.15) }));
    fall.position.set(tx - 0.2, (ty + fy) / 2, tz - 0.7);
    fall.rotation.y = Math.atan2(213.6 - 212.4, 224.6 - 221.8);
    fall.rotation.x = -0.18;

    this.group.add(fall);
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: SOFT, color: "#ffffff", transparent: true, opacity: 0.45, depthWrite: false }));
      m.userData.ph = rand(0, 6);
      this.mist.push(m);
      this.group.add(m);
    }

    // the campfire: flames, glow, sparks
    for (let i = 0; i < 7; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: SOFT, color: new THREE.Color(i % 2 ? 3.2 : 2.6, i % 2 ? 1.5 : 0.9, 0.3), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
      s.userData.ph = rand(0, 6);
      this.flames.push(s);
      this.group.add(s);
    }
    this.glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: SOFT, color: new THREE.Color(1.4, 0.6, 0.2), transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    this.glow.position.copy(fire).add(new THREE.Vector3(0, 0.8, 0));
    this.glow.scale.setScalar(5);
    this.group.add(this.glow);
    const SP = 40;
    const sg = new THREE.BufferGeometry();
    sg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(SP * 3), 3));
    this.sparkV = new Float32Array(SP * 4);
    this.sparks = new THREE.Points(sg, new THREE.PointsMaterial({ size: 0.07, color: new THREE.Color(3, 1.6, 0.4), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    this.sparks.frustumCulled = false;
    for (let i = 0; i < SP; i++) this.resetSpark(i, rand(0, 2));
    this.group.add(this.sparks);

    // chimney smoke
    for (let i = 0; i < 8; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: SOFT, color: "#c8c4c0", transparent: true, opacity: 0, depthWrite: false }));
      s.userData.age = (i / 8) * 6;
      this.smoke.push(s);
      this.group.add(s);
    }
  }

  private perch() {
    for (let k = 0; k < 40; k++) {
      const x = rand(110, 232),
        z = rand(200, 234);
      if (!this.land.inside(x, z)) continue;
      return new THREE.Vector3(x, this.land.raw(x, z) + rand(9, 20), z);
    }
    return new THREE.Vector3(190, 25, 220);
  }

  private resetSpark(i: number, age = 0) {
    const p = this.sparks.geometry.getAttribute("position") as THREE.BufferAttribute;
    p.setXYZ(i, this.fire.x + rand(-0.3, 0.3), this.fire.y + 0.3, this.fire.z + rand(-0.3, 0.3));
    this.sparkV.set([rand(-0.25, 0.25), rand(1.2, 2.4), rand(-0.25, 0.25), age], i * 4);
  }

  setNight(night: boolean) {
    this.night = night;
    this.flies.visible = night;
    for (const m of this.fogMat) {
      m.color.set(night ? "#6a7a8e" : "#eef2f4");
    }
    this.glow.material.opacity = night ? 0.65 : 0.25;
  }

  update(dt: number, t: number, viewer: THREE.Vector3 | null, near: boolean) {
    // the falls pour all the time (cheap); the rest only when someone is looking from close by
    this.fallsTex.offset.y += dt * 1.6;
    this.mist.forEach((m, i) => {
      const k = (t * 0.4 + m.userData.ph) % 1;
      m.position.set(212.9 + Math.sin(i * 2.1) * 0.9, FALLS.foot[1] + 0.2 + k * 1.6, 222.8 + Math.cos(i * 1.7) * 0.7);
      m.scale.setScalar(1.2 + k * 2.2);
      m.material.opacity = 0.45 * (1 - k);
    });
    // fog drifts east with the sea breeze, wrapping round
    for (const s of this.fog) {
      s.position.x += s.userData.v * dt;
      if (s.position.x > F.x1 - 10) s.position.x = F.x0 + 10;
      // thin out towards the ends of the headland so nothing hangs past the board
      const edge = Math.min(1, (s.position.x - F.x0 - 10) / 14, (F.x1 - 10 - s.position.x) / 14);
      const gx = Math.min(F.x1 - 1, Math.max(F.x0 + 1, s.position.x));
      s.position.y += (this.land.raw(gx, s.position.z) + s.userData.hy - s.position.y) * Math.min(1, dt * 0.5);
      (s.material as THREE.SpriteMaterial).opacity = Math.max(0, edge) * (this.night ? 0.22 : 0.3) * (0.75 + 0.25 * Math.sin(t * 0.2 + s.userData.v * 10));
    }
    // fire
    this.flames.forEach((s, i) => {
      const f = 0.75 + 0.25 * Math.sin(t * 13 + s.userData.ph) * Math.sin(t * 7.3 + i);
      s.position.set(this.fire.x + Math.sin(t * 3 + i) * 0.12, this.fire.y + 0.25 + (i % 3) * 0.28 + f * 0.1, this.fire.z + Math.cos(t * 2.6 + i) * 0.12);
      s.scale.set(0.7 * f - (i % 3) * 0.12, (1.05 - (i % 3) * 0.18) * f, 1);
    });
    this.glow.scale.setScalar(4.6 + Math.sin(t * 9) * 0.25);
    if (!near) return;
    const sp = this.sparks.geometry.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < sp.count; i++) {
      const v = this.sparkV;
      v[i * 4 + 3] += dt;
      if (v[i * 4 + 3] > 1.6) {
        this.resetSpark(i);
        continue;
      }
      sp.setXYZ(i, sp.getX(i) + v[i * 4] * dt + Math.sin(t * 5 + i) * 0.004, sp.getY(i) + v[i * 4 + 1] * dt, sp.getZ(i) + v[i * 4 + 2] * dt);
    }
    sp.needsUpdate = true;
    // smoke from the chimney
    for (const s of this.smoke) {
      s.userData.age += dt;
      const a = s.userData.age % 6;
      const k = a / 6;
      s.position.set(this.chimney.x + k * 2.2 + Math.sin(a + t * 0.3) * 0.2, this.chimney.y + 0.3 + a * 0.7, this.chimney.z + k * 0.6);
      s.scale.setScalar(0.6 + k * 2.6);
      s.material.opacity = 0.35 * Math.sin(Math.PI * Math.min(1, k * 1.2));
    }
    // fireflies: slow wander, blinking
    if (this.night) {
      const p = this.flies.geometry.getAttribute("position") as THREE.BufferAttribute;
      const c = this.flies.geometry.getAttribute("color") as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) {
        const ph = this.flyPhase[i];
        p.setXYZ(i, this.flyBase[i * 3] + Math.sin(t * 0.3 + ph) * 1.2, this.flyBase[i * 3 + 1] + Math.sin(t * 0.7 + ph * 2) * 0.4, this.flyBase[i * 3 + 2] + Math.cos(t * 0.25 + ph) * 1.2);
        const blink = Math.max(0, Math.sin(t * 1.3 + ph * 3)) ** 6;
        c.setXYZ(i, 1.8 * blink + 0.05, 2.6 * blink + 0.08, 0.5 * blink);
      }
      p.needsUpdate = true;
      c.needsUpdate = true;
    }
    // deer
    for (const d of this.deer) {
      const pos = d.root.position;
      const close = viewer && Math.hypot(viewer.x - pos.x, viewer.z - pos.z) < 9;
      if (close && d.state !== "flee") {
        const away = new THREE.Vector2(pos.x - viewer!.x, pos.z - viewer!.z).normalize().multiplyScalar(14);
        d.target.set(pos.x + away.x, pos.z + away.y);
        d.state = "flee";
        d.speed = 5;
        d.until = t + 4;
      }
      if (d.state === "graze" || d.state === "look") {
        if (t > d.until) {
          if (d.state === "graze" && Math.random() < 0.5) {
            d.state = "look";
            d.until = t + rand(1.5, 3.5);
          } else {
            // wander somewhere nearby, back towards home now and then
            for (let k = 0; k < 8; k++) {
              const x = (Math.random() < 0.3 ? d.home.x : pos.x) + rand(-8, 8),
                z = (Math.random() < 0.3 ? d.home.y : pos.z) + rand(-8, 8);
              if (!this.blocked(x, z) && this.land.raw(x, z) > WATER + 0.8) {
                d.target.set(x, z);
                break;
              }
            }
            d.state = "walk";
            d.speed = 1.1;
            d.until = t + 12;
          }
        }
      } else {
        const dx = d.target.x - pos.x,
          dz = d.target.y - pos.z;
        const dist = Math.hypot(dx, dz);
        const step = d.speed * dt;
        if (dist < 0.3 || t > d.until) {
          d.state = "graze";
          d.until = t + rand(4, 10);
        } else {
          const nx = pos.x + (dx / dist) * step,
            nz = pos.z + (dz / dist) * step;
          if (this.blocked(nx, nz) || this.land.raw(nx, nz) < WATER + 0.6) {
            d.state = "graze";
            d.until = t + rand(1, 3);
          } else {
            pos.x = nx;
            pos.z = nz;
            d.root.rotation.y = Math.atan2(-dz, dx);
          }
        }
      }
      const moving = d.state === "walk" || d.state === "flee";
      pos.y = this.land.raw(pos.x, pos.z) + (moving ? Math.abs(Math.sin(t * (d.speed > 2 ? 9 : 6))) * (d.speed > 2 ? 0.18 : 0.04) : 0);
      d.up.visible = d.state !== "graze";
      d.down.visible = d.state === "graze";
    }
    // birds
    for (const b of this.birds) {
      const flap = Math.floor(t * (b.kind === "raven" ? 3 : 12) + b.a * 3) % 2;
      if (b.kind === "raven") {
        b.a += b.w * dt;
        b.root.position.set(b.cx + Math.cos(b.a) * b.r, b.y + Math.sin(b.a * 2) * 1.5, b.cz + Math.sin(b.a) * b.r);
        const sg = Math.sign(b.w);
        b.root.rotation.y = Math.atan2(-Math.sin(b.a) * sg, Math.cos(b.a) * sg);
        b.root.rotation.z = (b.w > 0 ? 1 : -1) * 0.25;
        // ravens mostly glide
        const glide = Math.sin(t * 0.5 + b.cx) > -0.3;
        b.frames[0].visible = glide || flap === 0;
        b.frames[1].visible = !b.frames[0].visible;
      } else {
        b.t += dt / b.dur;
        if (b.t >= 1) {
          // sit a moment on the treetop, then off to another
          if (b.t > 1 + 3 / b.dur || Math.random() < 0.002) {
            b.from.copy(b.root.position);
            b.to.copy(this.perch());
            b.dur = b.from.distanceTo(b.to) / 7;
            b.t = 0;
          } else {
            b.frames[0].visible = true;
            b.frames[1].visible = false;
            continue;
          }
        }
        const e = b.t;
        b.root.position.lerpVectors(b.from, b.to, e);
        b.root.position.y += Math.sin(e * Math.PI) * 3;
        b.root.rotation.y = Math.atan2(b.to.x - b.from.x, b.to.z - b.from.z);
        b.frames[0].visible = flap === 0;
        b.frames[1].visible = flap === 1;
      }
    }
  }
}
