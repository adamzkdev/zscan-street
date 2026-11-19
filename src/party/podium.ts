/**
 * The podium after every mini-game, in 3D: the four snarks on their steps (gold, silver, bronze,
 * the floor for the last), the winner jumping for joy under the spotlights and the confetti, the
 * last one sulking. The host draws the names and the prizes over it (spots()).
 */
import * as THREE from "three";
import type { Player } from "./kit";
import { SEAT } from "./kit";
import { Avatar, CamRig, Fx3, GEO, block, canvasTex, disposeScene, glow, label, outline, toScreen, toon, world, type World } from "./k3";

const STEPS = [
  { x: 0, h: 1.5, c: "#ffd23f" },
  { x: -2.3, h: 1.0, c: "#d6dde8" },
  { x: 2.3, h: 0.65, c: "#e39a5f" },
  { x: 4.9, h: 0, c: "" },
];

export class Podium3D {
  private w: World;
  private av: Avatar[] = [];
  private fx: Fx3;
  private cam: CamRig;
  private t = 0;
  private beams: THREE.Mesh[] = [];
  /** The sunburst behind the steps, turning slowly. */
  private burst: THREE.Mesh;
  private next = [0.2, 0.9, 1.3, 1.6];

  constructor(players: Player[], order: number[]) {
    this.w = world({ sky: ["#140c3a", "#4a2c8c"], fog: [30, 90], fov: 38 });
    const s = this.w.scene;
    this.w.hemi.intensity = 2.0;
    // the floor: a dark stage with a glowing rim
    const floor = new THREE.Mesh(GEO.cyl, toon("#2a1f55"));
    floor.scale.set(18, 0.4, 18);
    floor.position.y = -0.2;
    s.add(floor);
    const rim = new THREE.Mesh(GEO.ring, glow("#ffd23f", 0.6, true));
    rim.rotation.x = -Math.PI / 2;
    rim.scale.setScalar(18.6);
    rim.position.y = 0.02;
    s.add(rim);
    // the steps
    STEPS.forEach((st, place) => {
      if (!st.h) return;
      const b = block(st.c, 2.1, st.h, 2.1, st.x, st.h / 2, 0, s);
      outline(b, 0.04);
      const n = label(String(place + 1), 0.7, place === 0 ? "#7a5200" : "#2a2340");
      n.position.set(st.x, st.h / 2, 1.07);
      s.add(n);
    });
    // far behind: a sunburst of gold rays, fading out at its rim
    const rays = canvasTex(512, 512, (g) => {
      const n = 18;
      for (let i = 0; i < n; i++) {
        g.beginPath();
        g.moveTo(256, 256);
        g.arc(256, 256, 256, (i / n) * Math.PI * 2, ((i + 0.5) / n) * Math.PI * 2);
        g.closePath();
        g.fillStyle = i % 2 ? "rgba(255,210,63,0.55)" : "rgba(255,140,200,0.4)";
        g.fill();
      }
      g.globalCompositeOperation = "destination-in";
      const fade = g.createRadialGradient(256, 256, 30, 256, 256, 256);
      fade.addColorStop(0, "rgba(0,0,0,1)");
      fade.addColorStop(0.6, "rgba(0,0,0,0.6)");
      fade.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = fade;
      g.fillRect(0, 0, 512, 512);
    });
    this.burst = new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ map: rays, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    this.burst.scale.set(30, 30, 1);
    this.burst.position.set(0.4, 2.4, -9);
    s.add(this.burst);
    // behind: a wall of lights
    for (let i = 0; i < 13; i++) {
      const c = SEAT[i % 4];
      const b = block(c, 0.5, 4 + (i % 3), 0.5, -9 + i * 1.5, 2.5, -6, s, glow(c, 0.9));
      b.userData.i = i;
    }
    // spotlights' beams on the winner
    for (const side of [-1, 1]) {
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 1.4, 9, 24, 1, true), new THREE.MeshBasicMaterial({ color: "#fff3c4", transparent: true, opacity: 0.13, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      beam.position.set(side * 2.2, 5.5, 0.5);
      beam.rotation.z = side * 0.42;
      s.add(beam);
      this.beams.push(beam);
    }
    // the players, on their steps, facing the camera
    order.forEach((seat, place) => {
      const p = players[seat];
      if (!p) return;
      const a = new Avatar(s, p, { marker: place === 0, ring: false });
      const st = STEPS[place] ?? STEPS[3];
      a.pos.set(st.x, st.h, place === 3 ? 0.4 : 0);
      a.floor = st.h;
      a.yaw = place === 3 ? -0.5 : 0;
      if (place === 3) a.angry = true;
      this.av[place] = a;
      a.sync(0);
    });
    this.fx = new Fx3(s, 700);
    this.cam = new CamRig(this.w.camera);
    this.cam.set(new THREE.Vector3(0.6, 3.4, 15), new THREE.Vector3(0.8, 1.6, 0));
    this.cam.apply(0);
  }

  update(dt: number) {
    this.t += dt;
    const t = this.t;
    this.cam.to(new THREE.Vector3(0.8 + Math.sin(t * 0.4) * 0.8, 2.7, 9.4), new THREE.Vector3(0.9, 1.7, 0), dt, 1.6);
    this.cam.apply(dt);
    this.av.forEach((a, place) => {
      if (!a) return;
      this.next[place] -= dt;
      if (this.next[place] <= 0) {
        if (place === 0) {
          a.jump(7.5);
          a.cheer(1.6);
          this.next[place] = 1.1;
        } else if (place === 3) {
          a.hit();
          this.next[place] = 2.6;
        } else {
          a.cheer(1.2);
          this.next[place] = 2.2 + place * 0.4;
        }
      }
      a.physics(dt, STEPS[place]?.h ?? 0);
      a.sync(dt);
    });
    // confetti over the winner
    if (Math.random() < dt * 9) this.fx.burst(new THREE.Vector3((Math.random() - 0.5) * 7, 7, (Math.random() - 0.5) * 3), 6, [...SEAT, "#ffd23f", "#ffffff"], { speed: 2, up: 0, gravity: 3, size: 0.14, life: 3, drag: 1.5 });
    if (t < 0.05) this.fx.burst(new THREE.Vector3(0, 3.5, 0), 80, [...SEAT, "#ffd23f"], { speed: 9, up: 6, gravity: 10, size: 0.16, life: 2 });
    this.fx.update(dt);
    for (const b of this.beams) (b.material as THREE.MeshBasicMaterial).opacity = 0.1 + Math.sin(t * 3) * 0.03;
    this.burst.rotation.z = -t * 0.18;
    (this.burst.material as THREE.MeshBasicMaterial).opacity = Math.min(0.55, t * 0.8);
    this.w.scene.traverse((o) => {
      if (o.userData.i !== undefined) o.visible = Math.sin(t * 6 + o.userData.i) > -0.6;
    });
  }

  view() {
    return this.w;
  }

  /** Where each place's name goes on the HUD (under its step), by place. */
  spots() {
    return STEPS.map((st, place) => toScreen(new THREE.Vector3(st.x, 0, place === 3 ? 1.6 : 1.3), this.w.camera));
  }

  dispose() {
    for (const a of this.av) a?.dispose();
    disposeScene(this.w.scene);
  }
}
