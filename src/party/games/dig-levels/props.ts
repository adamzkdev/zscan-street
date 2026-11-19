/**
 * PROOF OF DIG's moving set dressing, shared by the levels: islets bobbing round the island, flocks
 * crossing the sky, soft halos. Each is one instanced mesh (one draw), moved each frame with no
 * allocation.
 */
import * as THREE from "three";
import { GEO, canvasTex, toon } from "../../k3";
import type { Box } from "./common";

const M4 = new THREE.Matrix4();
const Q = new THREE.Quaternion();
const E = new THREE.Euler();
const V = new THREE.Vector3();
const S = new THREE.Vector3();
const C = new THREE.Color();

/** A soft round glow (white: tint it), for halos round lamps, the sun, crystals. */
export function haloTex() {
  return canvasTex(64, 64, (g) => {
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, "rgba(255,255,255,1)");
    gr.addColorStop(0.25, "rgba(255,255,255,0.55)");
    gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
  });
}

/** Additive halos (x, y, z, size, colour): one draw; `pulse` makes them breathe. */
export function halos(scene: THREE.Scene, spots: [number, number, number, number, string][]) {
  const mat = new THREE.MeshBasicMaterial({ map: haloTex(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.8, fog: false });
  const mesh = new THREE.InstancedMesh(GEO.plane, mat, spots.length);
  spots.forEach(([x, y, z, s, c], i) => {
    M4.compose(V.set(x, y, z), Q.identity(), S.set(s, s, 1));
    mesh.setMatrixAt(i, M4);
    mesh.setColorAt(i, C.set(c));
  });
  mesh.renderOrder = 5;
  mesh.raycast = () => {};
  scene.add(mesh);
  return (now: number) => void (mat.opacity = 0.72 + Math.sin(now * 3.1) * 0.08 + Math.sin(now * 7.3) * 0.04);
}

/**
 * Boxes in groups that bob (and turn a little) together: islets drifting round the island. Each box
 * carries its group's number; the group's centre is its first box's.
 */
export function bobbers(scene: THREE.Scene, boxes: (Box & { g: number })[], amp = 0.35) {
  const mesh = new THREE.InstancedMesh(GEO.box, toon("#ffffff"), boxes.length);
  boxes.forEach((b, i) => mesh.setColorAt(i, C.set(b.c)));
  mesh.raycast = () => {};
  mesh.frustumCulled = false;
  scene.add(mesh);
  const place = (now: number) => {
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      const dy = Math.sin(now * 0.55 + b.g * 1.7) * amp;
      E.set(b.rx ?? 0, Math.sin(now * 0.2 + b.g) * 0.06, b.rz ?? 0);
      Q.setFromEuler(E);
      M4.compose(V.set(b.x, b.y + dy, b.z), Q, S.set(b.w, b.h, b.d));
      mesh.setMatrixAt(i, M4);
    }
    mesh.instanceMatrix.needsUpdate = true;
  };
  place(0);
  return place;
}

/**
 * A flock of `n` birds (a body, two flapping wings) flying a loop round (cx, cy, cz), `r` wide:
 * one draw. `color`: their feathers.
 */
export function flock(scene: THREE.Scene, n: number, cx: number, cy: number, cz: number, r: number, color: string, speed = 0.12, size = 1) {
  const mesh = new THREE.InstancedMesh(GEO.box, toon(color), n * 3);
  mesh.raycast = () => {};
  mesh.frustumCulled = false;
  scene.add(mesh);
  const off: [number, number, number][] = [];
  for (let i = 0; i < n; i++) off.push([((i % 3) - 1) * 2.2 * size + (i * 0.37) % 1, Math.floor(i / 3) * -1.3 * size, -Math.abs((i % 3) - 1) * 2 * size]);
  return (now: number) => {
    const a = now * speed;
    const hx = cx + Math.cos(a) * r;
    const hz = cz + Math.sin(a) * r * 0.35;
    const yaw = -a - Math.PI / 2;
    const cyw = Math.cos(yaw);
    const syw = Math.sin(yaw);
    for (let i = 0; i < n; i++) {
      const [ox, oy, oz] = off[i];
      const x = hx + ox * cyw - oz * syw;
      const z = hz + ox * syw + oz * cyw;
      const y = cy + oy + Math.sin(now * 1.3 + i) * 0.4;
      const flap = Math.sin(now * 9 + i * 1.3) * 0.7;
      E.set(0, yaw, 0);
      Q.setFromEuler(E);
      M4.compose(V.set(x, y, z), Q, S.set(0.35 * size, 0.3 * size, 0.9 * size));
      mesh.setMatrixAt(i * 3, M4);
      for (const k of [-1, 1]) {
        E.set(0, yaw, k * flap);
        Q.setFromEuler(E);
        M4.compose(V.set(x + k * 0.55 * size * cyw, y + Math.abs(flap) * 0.2 * size, z + k * 0.55 * size * syw), Q, S.set(1.0 * size, 0.08 * size, 0.42 * size));
        mesh.setMatrixAt(i * 3 + (k < 0 ? 1 : 2), M4);
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
  };
}

/** A field of small stars far out (one draw), twinkling as a whole. */
export function stars(scene: THREE.Scene, n: number, rnd: () => number) {
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2;
    const h = 0.15 + rnd() * 0.85;
    const d = 420;
    pos[i * 3] = Math.cos(a) * d * Math.cos(h);
    pos[i * 3 + 1] = -40 + Math.sin(h) * d;
    pos[i * 3 + 2] = Math.sin(a) * d * Math.cos(h) - 120;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ color: "#ffffff", size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0.85, fog: false, depthWrite: false });
  const pts = new THREE.Points(geo, mat);
  pts.raycast = () => {};
  scene.add(pts);
  return (now: number) => void (mat.opacity = 0.7 + Math.sin(now * 1.7) * 0.15);
}
