/**
 * Life round the arena (cosmetic: it never touches the game): a flock of pigeons pecking on the
 * ground that takes off when a snark runs at it or a bomb goes off, circles over the rooftops and
 * lands again somewhere quiet. Two instanced draws (bodies and heads, wings).
 */
import * as THREE from "three";
import { rng } from "../../kit";
import { GEO, toonSteps } from "../../k3";
import type { Level, Weather } from "./set";

interface Bird {
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** 0 pecking on the ground, 1 flying off, 2 coming down to land. */
  st: number;
  t: number;
  next: number;
  vx: number;
  vy: number;
  vz: number;
  tx: number;
  tz: number;
  cruise: number;
  ph: number;
  peck: number;
}

export class Flock {
  private birds: Bird[] = [];
  private body: THREE.InstancedMesh;
  private wings: THREE.InstancedMesh;
  private M = new THREE.Matrix4();
  private Q = new THREE.Quaternion();
  private E = new THREE.Euler();
  private P = new THREE.Vector3();
  private S = new THREE.Vector3();
  private O = new THREE.Vector3();
  /** (the flock's own random: seeded, never the game's stream) */
  private R = rng(0xf10c4);

  constructor(
    scene: THREE.Scene,
    private level: Level,
    n: number,
    pal: string[],
    head: string,
    /** (cartoon birds: bigger than life, to read from the camera) */
    private k = 1.7,
  ) {
    const mat = new THREE.MeshToonMaterial({ color: "#ffffff", gradientMap: toonSteps() });
    this.body = new THREE.InstancedMesh(GEO.box, mat, n * 2);
    this.wings = new THREE.InstancedMesh(GEO.box, mat, n * 2);
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      this.body.setColorAt(i * 2, c.set(pal[i % pal.length]));
      this.body.setColorAt(i * 2 + 1, c.set(head));
      this.wings.setColorAt(i * 2, c.set(pal[(i + 1) % pal.length]).multiplyScalar(0.85));
      this.wings.setColorAt(i * 2 + 1, c.set(pal[(i + 1) % pal.length]).multiplyScalar(0.85));
    }
    for (const m of [this.body, this.wings]) {
      m.frustumCulled = false;
      m.raycast = () => {};
      scene.add(m);
    }
    for (let i = 0; i < n; i++) {
      const b: Bird = { x: 0, y: 0, z: 0, yaw: this.R() * 6.28, st: 0, t: 0, next: this.R(), vx: 0, vy: 0, vz: 0, tx: 0, tz: 0, cruise: 6, ph: this.R() * 6.28, peck: 0 };
      this.spot(b, null);
      b.x = b.tx;
      b.z = b.tz;
      this.birds.push(b);
    }
  }

  /** A quiet spot to land on (in b.tx, b.tz): near the arena's edges, off the props, away from the snarks. */
  private spot(b: Bird, w: Weather | null) {
    const L = this.level;
    for (let k = 0; k < 30; k++) {
      let x: number, z: number;
      if (L.round) {
        const a = this.R() * Math.PI * 2,
          r = L.xw * (0.72 + this.R() * 0.22);
        x = Math.sin(a) * r;
        z = Math.cos(a) * r;
      } else {
        x = (this.R() * 2 - 1) * (L.xw - 0.7);
        z = (this.R() * 2 - 1) * (L.zd - 0.7);
        // (the edges of the plaza, not its middle)
        if (Math.abs(x) < L.xw * 0.6 && Math.abs(z) < L.zd * 0.6) continue;
      }
      if (L.circles.some((c) => Math.hypot(x - c.x, z - c.z) < c.r + 0.5)) continue;
      if (L.boxes.some((q) => Math.abs(x - q.x) < q.hx + 0.4 && Math.abs(z - q.z) < q.hz + 0.4)) continue;
      if (w && w.players.some((p) => Math.hypot(p.x - x, p.z - z) < 3.5)) continue;
      b.tx = x;
      b.tz = z;
      return;
    }
    b.tx = L.xw * 0.8 * (this.R() < 0.5 ? -1 : 1);
    b.tz = -L.zd * 0.8;
  }

  update(dt: number, clk: number, w: Weather) {
    const { M, Q, E, P, S, O, k } = this;
    for (let i = 0; i < this.birds.length; i++) {
      const b = this.birds[i];
      b.t += dt;
      if (b.st === 0) {
        // a snark running at it, a blast: off it goes
        let fx = 0,
          fz = 0,
          scared = false;
        for (const p of w.players) {
          const d = Math.hypot(b.x - p.x, b.z - p.z);
          if (d < 1.8) ((scared = true), (fx += (b.x - p.x) / (d || 1)), (fz += (b.z - p.z) / (d || 1)));
        }
        if (w.boom && Math.hypot(b.x - w.boomX, b.z - w.boomZ) < 6) ((scared = true), (fx += b.x - w.boomX), (fz += b.z - w.boomZ));
        if (scared) {
          const l = Math.hypot(fx, fz) || 1;
          const a = Math.atan2(fx / l, fz / l) + (this.R() - 0.5) * 1.2;
          b.st = 1;
          b.t = 0;
          b.vx = Math.sin(a) * 4.5;
          b.vz = Math.cos(a) * 4.5;
          b.vy = 4.5 + this.R() * 1.5;
          b.cruise = 6 + this.R() * 4;
          b.next = 2.2 + this.R() * 2.2;
          b.yaw = a;
        } else {
          // peck, peck, a little hop, a turn
          b.next -= dt;
          if (b.next <= 0) {
            b.next = 0.35 + this.R() * 0.9;
            const r = this.R();
            if (r < 0.35) b.yaw += (this.R() - 0.5) * 2;
            else if (r < 0.6) ((b.x += Math.sin(b.yaw) * 0.18), (b.z += Math.cos(b.yaw) * 0.18), (b.y = 0.08));
            else b.peck = 1;
          }
          b.y = Math.max(0, b.y - dt * 0.6);
          b.peck = Math.max(0, b.peck - dt * 4);
        }
      } else if (b.st === 1) {
        // up and away, circling
        b.vy += ((b.y < b.cruise ? 3 : -2) - b.vy * 0.5) * dt;
        b.yaw += dt * 0.8;
        const sp = 5;
        b.vx += (Math.sin(b.yaw) * sp - b.vx) * Math.min(1, dt * 1.5);
        b.vz += (Math.cos(b.yaw) * sp - b.vz) * Math.min(1, dt * 1.5);
        if (b.t > b.next) ((b.st = 2), this.spot(b, w));
      } else {
        // down to its spot
        const dx = b.tx - b.x,
          dz = b.tz - b.z;
        const d = Math.hypot(dx, dz);
        const sp = Math.min(5, d * 1.6 + 0.6);
        b.vx += ((dx / (d || 1)) * sp - b.vx) * Math.min(1, dt * 2.5);
        b.vz += ((dz / (d || 1)) * sp - b.vz) * Math.min(1, dt * 2.5);
        b.vy += ((-b.y * 1.4) / Math.max(0.6, d / 4) - b.vy) * Math.min(1, dt * 3);
        b.yaw = Math.atan2(b.vx, b.vz);
        if (d < 0.25 && b.y < 0.25) ((b.st = 0), (b.y = 0), (b.vx = b.vy = b.vz = 0), (b.next = 0.5));
      }
      if (b.st !== 0) {
        b.x += b.vx * dt;
        b.y = Math.max(0, b.y + b.vy * dt);
        b.z += b.vz * dt;
      }
      // the bird: body, head (bobbing as it pecks), two wings (beating in flight)
      const fly = b.st !== 0;
      const bob = fly ? 0 : -b.peck * 0.09 + Math.sin(clk * 6 + b.ph) * 0.01;
      E.set(fly ? -0.25 : 0.12, b.yaw, 0, "YXZ");
      Q.setFromEuler(E);
      M.compose(P.set(b.x, b.y + 0.13 * k, b.z), Q, S.set(0.17 * k, 0.15 * k, 0.3 * k));
      this.body.setMatrixAt(i * 2, M);
      O.set(0, (0.1 + bob) * k, (0.15 + b.peck * 0.04) * k).applyQuaternion(Q);
      M.compose(P.set(b.x + O.x, b.y + 0.13 * k + O.y, b.z + O.z), Q, S.set(0.1 * k, 0.1 * k, 0.12 * k));
      this.body.setMatrixAt(i * 2 + 1, M);
      const flap = fly ? Math.sin(clk * 26 + b.ph) * 0.9 : 0.15;
      for (const side of [-1, 1]) {
        E.set(fly ? -0.25 : 0.12, b.yaw, side * flap, "YXZ");
        Q.setFromEuler(E);
        O.set(side * (fly ? 0.15 : 0.09) * k, 0.02 * k, -0.02 * k).applyQuaternion(Q);
        M.compose(P.set(b.x + O.x, b.y + 0.15 * k + O.y, b.z + O.z), Q, S.set((fly ? 0.26 : 0.05) * k, 0.03 * k, 0.2 * k));
        this.wings.setMatrixAt(i * 2 + (side > 0 ? 1 : 0), M);
      }
    }
    this.body.instanceMatrix.needsUpdate = this.wings.instanceMatrix.needsUpdate = true;
  }
}
