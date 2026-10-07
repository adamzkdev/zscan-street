import * as THREE from "three";
import { SPHERE, std } from "./kit";

/**
 * The luminous sphere in the middle of the atrium (the auditorium): white ribbed panels pierced
 * by thousands of points of light. Every new block sends a gold band up it, bottom to top.
 */

const VERT = /* glsl */ `
varying vec3 vN;
varying vec3 vP;
varying vec3 vW;
void main() {
  vN = normalize(normal);
  vP = position;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const FRAG = /* glsl */ `
uniform float uTime;
uniform float uPulse;
uniform float uNight;
varying vec3 vN;
varying vec3 vP;
varying vec3 vW;
#define PI 3.14159265
void main() {
  vec3 n = normalize(vN);
  float lat = asin(clamp(n.y, -1.0, 1.0));
  float lon = atan(n.z, n.x);
  // panels: 36 meridians, 18 parallels; a groove between panels
  float u = lon / (2.0 * PI) * 36.0;
  float v = (lat / PI + 0.5) * 18.0;
  vec2 cell = fract(vec2(u, v));
  float groove = smoothstep(0.0, 0.05, cell.x) * smoothstep(0.0, 0.05, 1.0 - cell.x) * smoothstep(0.0, 0.06, cell.y) * smoothstep(0.0, 0.06, 1.0 - cell.y);
  // perforations: a 4 x 4 grid of points in every panel, fewer near the poles
  vec2 g = fract(cell * 4.0) - 0.5;
  float dotR = 0.17 * cos(lat);
  float hole = 1.0 - smoothstep(dotR - 0.05, dotR, length(g));
  // light: a soft key from above the front, the room's warm fill, a rim
  vec3 V = normalize(cameraPosition - vW);
  float key = 0.55 + 0.45 * max(dot(n, normalize(vec3(0.3, 0.8, 0.5))), 0.0);
  float rim = pow(1.0 - max(dot(n, V), 0.0), 3.0);
  vec3 base = vec3(0.74, 0.73, 0.71) * key * mix(0.72, 1.0, groove);
  vec3 col = base + rim * vec3(0.22, 0.2, 0.17);
  // the points glow warm, twinkling a little
  float tw = 0.75 + 0.25 * sin(uTime * 1.3 + floor(u * 4.0) * 1.7 + floor(v * 4.0) * 2.3);
  vec3 lightCol = mix(vec3(1.0, 0.86, 0.62), vec3(1.0, 0.95, 0.85), 0.5 + 0.5 * n.y);
  col = mix(col, lightCol * (1.05 + 0.8 * uNight) * tw, hole * 0.95);
  // the new block: a gold band climbing the sphere
  float band = exp(-pow((lat / (PI * 0.5) - (uPulse * 2.4 - 1.2)) * 7.0, 2.0)) * step(0.001, uPulse) * step(uPulse, 0.999);
  col += vec3(1.0, 0.72, 0.16) * band * (0.9 + 1.4 * hole);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

export interface Sphere {
  group: THREE.Group;
  shell: THREE.Mesh;
  door: THREE.Mesh;
  uniforms: { uTime: { value: number }; uPulse: { value: number }; uNight: { value: number } };
  /** A new block: the gold band goes up. */
  pulse(): void;
  tick(dt: number): void;
}

export function buildSphere(): Sphere {
  const group = new THREE.Group();
  const uniforms = { uTime: { value: 0 }, uPulse: { value: 0 }, uNight: { value: 1 } };
  const shell = new THREE.Mesh(new THREE.SphereGeometry(SPHERE.r, 96, 64), new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms }));
  shell.position.set(SPHERE.x, SPHERE.y, SPHERE.z);
  group.add(shell);
  // its plinth and the halo of light on the floor under it
  const white = std("#f3f0ea", 0.5);
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.8, 0.7, 48), white);
  plinth.position.set(SPHERE.x, 0.35, SPHERE.z);
  plinth.raycast = () => {};
  group.add(plinth);
  const pool = new THREE.Mesh(
    new THREE.CircleGeometry(8.8, 64),
    new THREE.MeshBasicMaterial({
      map: (() => {
        const c = document.createElement("canvas");
        c.width = c.height = 256;
        const g = c.getContext("2d")!;
        const grd = g.createRadialGradient(128, 128, 20, 128, 128, 128);
        grd.addColorStop(0, "rgba(255,226,170,0.55)");
        grd.addColorStop(0.6, "rgba(255,220,160,0.18)");
        grd.addColorStop(1, "rgba(255,220,160,0)");
        g.fillStyle = grd;
        g.fillRect(0, 0, 256, 256);
        const t = new THREE.CanvasTexture(c);
        t.colorSpace = THREE.SRGBColorSpace;
        return t;
      })(),
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  pool.rotation.x = -Math.PI / 2;
  pool.position.set(SPHERE.x, 0.015, SPHERE.z);
  pool.raycast = () => {};
  group.add(pool);

  // the way in: a short white porch on the front with lit glass doors, on a platform with steps
  const { doorZ, yDoor, pw, ph } = PORCH;
  const porch = new THREE.Group();
  const add = (w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    b.position.set(x, y + h / 2, z);
    b.raycast = () => {};
    porch.add(b);
    return b;
  };
  const back = doorZ - 2.6,
    out = doorZ + 1.6;
  add(pw + 0.9, 0.25, out - back, 0, yDoor + ph, (back + out) / 2, white);
  add(0.3, ph, out - back, -pw / 2 - 0.15, yDoor, (back + out) / 2, white);
  add(0.3, ph, out - back, pw / 2 + 0.15, yDoor, (back + out) / 2, white);
  add(pw + 0.9, yDoor, out - SPHERE.z + 0.4 - 4, 0, 0, (SPHERE.z + 4 + out) / 2 - 0.2, white);
  for (let k = 0; k < 2; k++) add(pw + 0.9, (yDoor * (2 - k)) / 3, 0.45, 0, 0, out + 0.225 + k * 0.45, white);
  const doorMat = new THREE.MeshBasicMaterial({ color: new THREE.Color("#ffd9a0").multiplyScalar(1.3), toneMapped: false });
  const door = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph - 0.1), doorMat);
  door.position.set(0, yDoor + ph / 2 - 0.05, doorZ);
  porch.add(door);
  const frameMat = std("#2a2622", 0.4, 0.5);
  add(0.06, ph - 0.1, 0.06, 0, yDoor, doorZ + 0.03, frameMat);
  add(pw, 0.06, 0.06, 0, yDoor + 2.3, doorZ + 0.03, frameMat);
  // a soft light spilling out on the platform
  const spill = new THREE.Mesh(new THREE.PlaneGeometry(pw, 1.5), new THREE.MeshBasicMaterial({ color: "#ffdcaa", transparent: true, opacity: 0.25, depthWrite: false, toneMapped: false }));
  spill.rotation.x = -Math.PI / 2;
  spill.position.set(0, yDoor + 0.01, doorZ + 0.8);
  spill.raycast = () => {};
  porch.add(spill);
  porch.position.x = SPHERE.x;
  group.add(porch);

  let pulseT = -1;
  return {
    group,
    shell,
    door,
    uniforms,
    pulse() {
      pulseT = 0;
    },
    tick(dt) {
      uniforms.uTime.value += dt;
      if (pulseT >= 0) {
        pulseT += dt / 4.5;
        uniforms.uPulse.value = Math.min(1, pulseT);
        if (pulseT >= 1) {
          pulseT = -1;
          uniforms.uPulse.value = 0;
        }
      }
    },
  };
}

/** The porch: its doors' plane, floor height and size. */
const PORCH_TOP = 0.7 + 3.0;
export const PORCH = { yDoor: 0.7, pw: 3.0, ph: 3.0, doorZ: SPHERE.z + Math.sqrt(SPHERE.r * SPHERE.r - (SPHERE.y - PORCH_TOP) ** 2) + 0.15 };

/** The porch and its platform, for the colliders: [x0, z0, x1, z1]. */
export function porchBox(): [number, number, number, number] {
  return [SPHERE.x - PORCH.pw / 2 - 0.45, SPHERE.z, SPHERE.x + PORCH.pw / 2 + 0.45, PORCH.doorZ + 1.6 + 0.9];
}
