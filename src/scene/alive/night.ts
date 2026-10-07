import * as THREE from "three";
import { CURB } from "../city/plan";
import { Crowd, Kind, type Person } from "./crowd";
import type { AliveCtx, AliveFrame, AlivePart } from "./types";

/**
 * The city after dark: rooftop parties on the outer districts' flat roofs (strings of lights, a DJ
 * booth glowing, people dancing) and the searchlights crossing the sky, only over the stadium and
 * round the Eiffel Tower. Everything here only shows at night.
 */

const rnd = (() => {
  let a = 31337;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
})();
const range = (a: number, b: number) => a + rnd() * (b - a);

const COLORS = ["#ff3e8a", "#3ef0ff", "#f4b728", "#b07bff", "#38ff9c"];

/** A soft additive cone (light beam), apex at the origin pointing +y. */
function beamGeo(len: number, r: number) {
  const g = new THREE.CylinderGeometry(r, 0.15, len, 16, 1, true).translate(0, len / 2, 0);
  // fade along its length with the vertex colours
  const pos = g.getAttribute("position");
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const k = 1 - pos.getY(i) / len;
    col.set([k, k, k], i * 3);
  }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return g;
}

export async function buildNight(ctx: AliveCtx): Promise<AlivePart> {
  const { city, group } = ctx;
  const root = new THREE.Group();
  group.add(root);
  const people: Person[] = [];
  const bulbs: THREE.Vector3[] = [];
  const bulbCol: THREE.Color[] = [];
  const booths: THREE.Matrix4[] = [];
  const beams: { m: THREE.Mesh; ph: number; sp: number }[] = [];

  // the outer city's buildings stream in after the city is up: wait for them
  for (let i = 0; i < 60 && city.facades.filter((f) => f.ext).length < 300; i++) await new Promise((r) => setTimeout(r, 500));
  // the parties: flat roofs of mid-rise blocks out of the heart, spread over the city
  const cands = city.facades.filter((f) => f.ext && (f.face === "s" || f.face === "n") && (f.type === "apartment" || f.type === "office") && f.height > 10 && f.height < 45 && f.x1 - f.x0 > 6.5 && Math.hypot((f.x0 + f.x1) / 2, f.z) > 70);
  cands.sort(() => rnd() - 0.5);
  const chosen: typeof cands = [];
  for (const f of cands) {
    const cx = (f.x0 + f.x1) / 2;
    if (chosen.some((g) => Math.hypot((g.x0 + g.x1) / 2 - cx, g.z - f.z) < 70)) continue;
    chosen.push(f);
    if (chosen.length >= Math.round(12 * Math.max(0.4, ctx.budget))) break;
  }
  const beamMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  for (const f of chosen) {
    const inward = f.out!.clone().negate();
    const cx = (f.x0 + f.x1) / 2;
    const y = CURB + f.height;
    const c = new THREE.Vector3(cx, y, f.z).addScaledVector(inward, 3.4);
    const half = Math.min(5, (f.x1 - f.x0) / 2 - 1);
    // dancers round the booth
    for (let i = 0; i < 12; i++) people.push({ kind: Kind.Dance, a: [c.x + range(-half, half), c.z + range(-2, 2), 0, 0], y: y + 0.02, scale: 0.9 });
    // the booth
    booths.push(new THREE.Matrix4().makeTranslation(c.x, y + 0.5, c.z + inward.z * 2.2));
    // two strings of bulbs across the roof, sagging
    const colA = new THREE.Color(COLORS[Math.floor(rnd() * COLORS.length)]);
    for (const dz of [-2.4, 2.4]) {
      for (let k = 0; k <= 16; k++) {
        const t = k / 16;
        const x = c.x - half - 0.5 + t * (2 * half + 1);
        bulbs.push(new THREE.Vector3(x, y + 2.6 - Math.sin(t * Math.PI) * 0.7, c.z + dz));
        bulbCol.push(k % 2 ? colA : new THREE.Color("#ffd9a0"));
      }
    }
  }
  // searchlights over the stadium
  const st = city.landmarks.get("stadium");
  if (st) {
    for (const [x, z] of [
      [-215, -112],
      [-135, -112],
      [-215, -55],
      [-135, -55],
    ]) {
      const b = new THREE.Mesh(beamGeo(160, 6), beamMat.clone());
      (b.material as THREE.MeshBasicMaterial).color.set("#fff3c8");
      (b.material as THREE.MeshBasicMaterial).opacity = 0.14;
      b.position.set(x, CURB + 26, z);
      b.raycast = () => {};
      root.add(b);
      beams.push({ m: b, ph: rnd() * 10, sp: range(0.2, 0.35) });
    }
  }
  // and round the Eiffel Tower, on the Champ de Mars corners (only these two places get searchlights)
  if (city.landmarks.get("eiffel")) {
    for (const [x, z] of [
      [-112, -220],
      [-61, -220],
      [-112, -199],
      [-61, -199],
    ]) {
      const b = new THREE.Mesh(beamGeo(170, 6), beamMat.clone());
      (b.material as THREE.MeshBasicMaterial).color.set("#ffe6a8");
      (b.material as THREE.MeshBasicMaterial).opacity = 0.14;
      b.position.set(x, CURB + 0.5, z);
      b.raycast = () => {};
      root.add(b);
      beams.push({ m: b, ph: rnd() * 10, sp: range(0.2, 0.35) });
    }
  }

  // bulbs: one instanced mesh
  const bulbMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, 0.16, 0.16), new THREE.MeshBasicMaterial({ toneMapped: false }), Math.max(1, bulbs.length));
  const m4 = new THREE.Matrix4();
  bulbs.forEach((p, i) => {
    bulbMesh.setMatrixAt(i, m4.makeTranslation(p.x, p.y, p.z));
    bulbMesh.setColorAt(i, bulbCol[i].clone().multiplyScalar(3));
  });
  bulbMesh.count = bulbs.length;
  bulbMesh.raycast = () => {};
  root.add(bulbMesh);
  // the booths: a dark desk with a glowing front
  const boothMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(2, 1, 0.8), new THREE.MeshBasicMaterial({ color: new THREE.Color("#ff3e8a").multiplyScalar(1.6), toneMapped: false }), Math.max(1, booths.length));
  booths.forEach((m, i) => boothMesh.setMatrixAt(i, m));
  boothMesh.count = booths.length;
  boothMesh.raycast = () => {};
  root.add(boothMesh);
  const crowd = new Crowd(people, 99);
  root.add(crowd.mesh, crowd.shadows);
  root.visible = false;

  const up = new THREE.Vector3(0, 1, 0);
  const q = new THREE.Quaternion();
  const dir = new THREE.Vector3();
  return Object.assign(
    {
      update(f: AliveFrame) {
        root.visible = f.night;
        if (!f.night) return;
        crowd.update(f.t, f.focus, f.wide ? 1e5 : 260, -1);
        for (const b of beams) {
          const a = f.t * b.sp + b.ph;
          dir.set(Math.sin(a) * 0.45, 1, Math.cos(a * 0.7) * 0.45).normalize();
          b.m.quaternion.copy(q.setFromUnitVectors(up, dir));
        }
        // the booth pulses to the beat
        (boothMesh.material as THREE.MeshBasicMaterial).color.setHSL((f.t * 0.05) % 1, 1, 0.5 + 0.25 * Math.max(0, Math.sin(f.t * 13))).multiplyScalar(1.6);
      },
    },
    { parties: chosen.map((f) => [(f.x0 + f.x1) / 2, f.z, f.height]) },
  );
}
