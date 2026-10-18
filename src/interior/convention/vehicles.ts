import * as THREE from "three";
import { std } from "../kit";

/**
 * The cars of the reveal, low-poly: the roadster (a white wedge, black glass canopy, a light bar at
 * each end, ten air thrusters) and the row it flies over (a robotaxi pod, two saloons, the steel
 * pickup, a semi's cab). Each is built nose along +z, wheels on y = 0, centred on the origin.
 */

const glow = (color: string, k = 2) => new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), toneMapped: false });

/** A side profile ([z, y] points, nose at +z) extruded `width` across, centred. */
function profile(pts: [number, number][], width: number, bevel = 0.05) {
  const s = new THREE.Shape();
  pts.forEach(([z, y], i) => (i ? s.lineTo(z, y) : s.moveTo(z, y)));
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: width - bevel * 2, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 4 });
  // profile x → z, extrusion → -x; then centre across
  g.rotateY(-Math.PI / 2);
  g.translate(width / 2 - bevel, 0, 0);
  return g;
}

const tyreM = std("#0c0d0f", 0.85);
const rimM = std("#c9ccd1", 0.25, 0.9);
function wheels(g: THREE.Group, half: number, axles: number[], r = 0.36, w = 0.3) {
  const tyre = new THREE.CylinderGeometry(r, r, w, 22).rotateZ(Math.PI / 2);
  const rim = new THREE.CylinderGeometry(r * 0.62, r * 0.62, w + 0.02, 14).rotateZ(Math.PI / 2);
  const out: THREE.Group[] = [];
  for (const z of axles)
    for (const sx of [-1, 1]) {
      const wg = new THREE.Group();
      wg.add(new THREE.Mesh(tyre, tyreM), new THREE.Mesh(rim, rimM));
      wg.position.set(sx * half, r, z);
      g.add(wg);
      out.push(wg);
    }
  return out;
}

export interface Roadster {
  group: THREE.Group;
  /** Wheels (spun by distance travelled). */
  wheels: THREE.Group[];
  /** Air jets: under the car (lift, flight) and over it (pressed to the loop). */
  jetsDown: THREE.Mesh[];
  jetsUp: THREE.Mesh[];
  /** Where the jets leave the car, in its own space (for the puffs). */
  nozzlesDown: THREE.Vector3[];
  nozzlesUp: THREE.Vector3[];
  head: THREE.MeshBasicMaterial;
  tail: THREE.MeshBasicMaterial;
}

/** The roadster: 4.4 m of white wedge. */
export function roadster(): Roadster {
  const g = new THREE.Group();
  const paint = new THREE.MeshPhysicalMaterial({ color: "#f3f4f6", roughness: 0.18, metalness: 0.15, clearcoat: 1, clearcoatRoughness: 0.08 });
  const body = new THREE.Mesh(
    profile(
      [
        [-2.2, 0.26],
        [-2.22, 0.9],
        [-1.5, 0.98],
        [-0.55, 1.08],
        [0.45, 0.9],
        [1.55, 0.7],
        [2.2, 0.52],
        [2.26, 0.3],
        [1.9, 0.16],
        [-1.95, 0.16],
      ],
      1.96,
      0.08,
    ),
    paint,
  );
  g.add(body);
  const canopy = new THREE.Mesh(
    profile(
      [
        [-1.25, 0.97],
        [-0.65, 1.24],
        [0.05, 1.2],
        [0.75, 0.88],
        [-1.25, 0.88],
      ],
      1.42,
      0.06,
    ),
    std("#07080a", 0.05, 0.6),
  );
  g.add(canopy);
  // the sills, black, and a splitter
  const black = std("#111216", 0.5, 0.3);
  for (const sx of [-1, 1]) {
    const sill = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.14, 2.4), black);
    sill.position.set(sx * 1.0, 0.3, 0);
    g.add(sill);
  }
  const head = glow("#eaf6ff", 1.5);
  const tail = glow("#ff1a2a", 2.2);
  const hb = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.04, 0.04), head);
  hb.position.set(0, 0.55, 2.2);
  g.add(hb);
  const tb = new THREE.Mesh(new THREE.BoxGeometry(1.86, 0.05, 0.04), tail);
  tb.position.set(0, 0.86, -2.23);
  g.add(tb);
  const ws = wheels(g, 0.9, [1.38, -1.42], 0.36, 0.32);

  // ten thrusters: six under the car, four on its back
  const jetGeo = new THREE.ConeGeometry(0.16, 1.6, 12, 1, true).translate(0, -0.8, 0);
  const jetMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.8, 1.0, 1.3), transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
  const nozzlesDown = [
    [-0.75, 0.15, 1.7],
    [0.75, 0.15, 1.7],
    [-0.75, 0.15, -1.75],
    [0.75, 0.15, -1.75],
    [-0.8, 0.15, 0],
    [0.8, 0.15, 0],
  ].map(([x, y, z]) => new THREE.Vector3(x, y, z));
  const nozzlesUp = [
    [-0.6, 0.95, 1.2],
    [0.6, 0.95, 1.2],
    [-0.6, 1.0, -1.5],
    [0.6, 1.0, -1.5],
  ].map(([x, y, z]) => new THREE.Vector3(x, y, z));
  const jetsDown = nozzlesDown.map((p) => {
    const j = new THREE.Mesh(jetGeo, jetMat);
    j.position.copy(p);
    j.visible = false;
    g.add(j);
    return j;
  });
  const jetsUp = nozzlesUp.map((p) => {
    const j = new THREE.Mesh(jetGeo, jetMat);
    j.position.copy(p);
    j.rotation.x = Math.PI;
    j.visible = false;
    g.add(j);
    return j;
  });
  for (const p of [...nozzlesDown, ...nozzlesUp]) {
    const n = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.05, 10), std("#2a2c30", 0.3, 0.9));
    n.position.copy(p);
    g.add(n);
  }
  return { group: g, wheels: ws, jetsDown, jetsUp, nozzlesDown, nozzlesUp, head, tail };
}

/** The row the roadster flies over, each across the track (nose along +x once placed). */
export function lineup(): { group: THREE.Group; length: number; height: number; name: string }[] {
  const out: { group: THREE.Group; length: number; height: number; name: string }[] = [];
  const add = (name: string, height: number, length: number, build: (g: THREE.Group) => void) => {
    const g = new THREE.Group();
    build(g);
    out.push({ group: g, length, height, name });
  };
  // the robotaxi: a two-seat pod, champagne gold
  add("ROBOTAXI", 1.45, 4.2, (g) => {
    g.add(
      new THREE.Mesh(
        profile(
          [
            [-2.0, 0.25],
            [-2.05, 0.9],
            [-0.6, 1.45],
            [0.6, 1.3],
            [1.9, 0.75],
            [2.05, 0.3],
            [-2.0, 0.2],
          ],
          1.9,
          0.1,
        ),
        std("#d9b97a", 0.22, 0.8),
      ),
    );
    const glass = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.3, 1.6), std("#0b0c0e", 0.05, 0.5));
    glass.position.set(0, 1.18, -0.1);
    glass.rotation.x = 0.12;
    g.add(glass);
    wheels(g, 0.88, [1.3, -1.3], 0.34);
  });
  // the saloon, deep red
  const saloon = (name: string, color: string, tall: number) =>
    add(name, 1.45 + tall, 4.7, (g) => {
      g.add(
        new THREE.Mesh(
          profile(
            [
              [-2.35, 0.3],
              [-2.4, 0.85 + tall * 0.5],
              [-1.4, 1.0 + tall],
              [-0.5, 1.45 + tall],
              [0.6, 1.4 + tall],
              [1.5, 0.95],
              [2.35, 0.7],
              [2.4, 0.32],
              [-2.35, 0.25],
            ],
            1.92,
            0.1,
          ),
          std(color, 0.22, 0.55),
        ),
      );
      const glass = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.36, 1.9), std("#0b0c0e", 0.05, 0.5));
      glass.position.set(0, 1.12 + tall, -0.1);
      g.add(glass);
      wheels(g, 0.9, [1.5, -1.45], 0.35);
    });
  saloon("SEDAN", "#a5121c", 0);
  saloon("CROSSOVER", "#1c2f6b", 0.25);
  // the steel pickup: flat planes, a triangle in profile
  add("PICKUP", 1.95, 5.7, (g) => {
    g.add(
      new THREE.Mesh(
        profile(
          [
            [-2.85, 0.45],
            [-2.85, 1.25],
            [-0.3, 1.95],
            [2.85, 1.08],
            [2.85, 0.45],
          ],
          2.1,
          0.02,
        ),
        std("#b9bec4", 0.3, 0.92),
      ),
    );
    const bar = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.03, 0.03), glow("#ffffff", 2));
    bar.position.set(0, 1.08, 2.86);
    g.add(bar);
    wheels(g, 0.98, [1.85, -1.85], 0.44, 0.36);
  });
  // the semi's cab, white, a black bumper and chrome stacks
  add("SEMI", 4.0, 6.2, (g) => {
    g.add(
      new THREE.Mesh(
        profile(
          [
            [-3.1, 0.6],
            [-3.1, 3.7],
            [-0.6, 4.0],
            [1.3, 3.7],
            [3.0, 1.8],
            [3.1, 0.6],
          ],
          2.5,
          0.12,
        ),
        std("#eceeef", 0.3, 0.2),
      ),
    );
    const glass = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.7, 0.1), std("#0b0c0e", 0.05, 0.5));
    glass.position.set(0, 2.85, 2.05);
    glass.rotation.x = -0.75;
    g.add(glass);
    const bumper = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.35, 0.3), std("#141518", 0.5));
    bumper.position.set(0, 0.75, 3.05);
    g.add(bumper);
    wheels(g, 1.1, [2.1, -1.2, -2.4], 0.52, 0.4);
  });
  return out;
}
