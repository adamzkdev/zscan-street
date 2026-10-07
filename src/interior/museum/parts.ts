import * as THREE from "three";
import { boxGeo, canvasTex, FACE, type MuseumKit } from "./kit";

/** Architectural pieces shared by the floors: rods, columns, escalators, lifts, signs. */

export const SERIF = '"Times New Roman", "Didot", Georgia, serif';
export const SANS = '"Helvetica Neue", Roboto, Arial, sans-serif';

export const FLOORS = [
  { label: "0", name: "Hall Napoléon", sub: "Pyramid · information · tickets" },
  { label: "1", name: "Grande Galerie", sub: "Ranks 1–70" },
  { label: "2", name: "Salle des États", sub: "Victoire · zkSNARKs #1" },
  { label: "3", name: "Appartements Napoléon III", sub: "Grand salon · salle à manger" },
];

/** A cylinder from a to b (radius r), as a geometry. */
export function rodGeo(a: THREE.Vector3, b: THREE.Vector3, r: number, seg = 6) {
  const len = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(r, r, len, seg, 1, true);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  g.applyQuaternion(q);
  const mid = a.clone().add(b).multiplyScalar(0.5);
  g.translate(mid.x, mid.y, mid.z);
  return g;
}

/** A box `len` long between two points (thickness w × h), as a geometry. */
export function beamGeo(a: THREE.Vector3, b: THREE.Vector3, w: number, h: number) {
  const len = a.distanceTo(b);
  const g = new THREE.BoxGeometry(w, h, len);
  const m = new THREE.Matrix4().lookAt(b, a, new THREE.Vector3(0, 1, 0));
  g.applyMatrix4(m);
  const mid = a.clone().add(b).multiplyScalar(0.5);
  g.translate(mid.x, mid.y, mid.z);
  return g;
}

/** A classical column: base, shaft (marble), a gilt Corinthian-ish capital. */
export function column(k: MuseumKit, f: number, x: number, z: number, h: number, shaft: THREE.Material, r = 0.35, cap = k.gold, plinth = k.white) {
  k.geo(f, plinth, boxGeo(r * 2.6, 0.5, r * 2.6, x, 0, z));
  k.geo(f, plinth, new THREE.CylinderGeometry(r * 1.2, r * 1.3, 0.25, 16).translate(x, 0.625, z));
  k.geo(f, shaft, new THREE.CylinderGeometry(r * 0.92, r, h - 1.6, 16).translate(x, 0.75 + (h - 1.6) / 2, z), 2);
  k.geo(f, cap, new THREE.CylinderGeometry(r * 1.35, r * 0.95, 0.6, 16).translate(x, h - 0.85 + 0.3, z));
  k.geo(f, cap, boxGeo(r * 3, 0.25, r * 3, x, h - 0.25, z));
  k.geo(f, cap, new THREE.TorusGeometry(r * 1.05, 0.05, 6, 16).rotateX(Math.PI / 2).translate(x, h - 0.9, z));
  k.solid(f, x - r * 1.3, z - r * 1.3, x + r * 1.3, z + r * 1.3);
}

/**
 * An escalator from (x, z) on the floor rising `rise` metres over `run` metres along `dir`
 * (unit vector), `w` wide: steps, glass balustrades, black handrails, chrome combs. Clickable.
 */
export function escalator(k: MuseumKit, f: number, x: number, z: number, dir: [number, number], run: number, rise: number, w = 1.2) {
  const parts: THREE.BufferGeometry[] = [],
    glass: THREE.BufferGeometry[] = [],
    rails: THREE.BufferGeometry[] = [],
    steel: THREE.BufferGeometry[] = [];
  const flat = 1.2;
  const n = Math.round(rise / 0.2);
  const slope = run - 2 * flat;
  // in a local frame: along = +z' (towards the top), across = x'
  for (let i = 0; i < n; i++) {
    const t0 = flat + (slope * i) / n;
    parts.push(boxGeo(w - 0.1, 0.06, slope / n, 0, (rise * i) / n + 0.14, t0 + slope / n / 2));
  }
  steel.push(boxGeo(w, 0.15, flat, 0, 0, flat / 2), boxGeo(w, 0.15, flat, 0, rise, run - flat / 2));
  // the truss under the steps: a sloped box
  const a = new THREE.Vector3(0, -0.3, flat),
    b = new THREE.Vector3(0, rise - 0.3, run - flat);
  steel.push(beamGeo(a, b, w + 0.25, 0.7));
  for (const s of [-1, 1]) {
    const ox = (s * (w + 0.1)) / 2;
    // balustrade: glass panels along the slope, handrail on top, a steel skirt below
    const pa = new THREE.Vector3(ox, 0.15, 0),
      pb = new THREE.Vector3(ox, 0.15, flat),
      pc = new THREE.Vector3(ox, rise + 0.15, run - flat),
      pd = new THREE.Vector3(ox, rise + 0.15, run);
    for (const [p, q] of [
      [pa, pb],
      [pb, pc],
      [pc, pd],
    ]) {
      glass.push(beamGeo(p.clone().setY(p.y + 0.5), q.clone().setY(q.y + 0.5), 0.03, 0.9));
      rails.push(beamGeo(p.clone().setY(p.y + 1.0), q.clone().setY(q.y + 1.0), 0.09, 0.1));
      steel.push(beamGeo(p.clone().setY(p.y), q.clone().setY(q.y), 0.12, 0.25));
    }
    // a lit skirt line along the steps
    rails.push(beamGeo(pb.clone().setX(ox * 0.92).setY(0.3), pc.clone().setX(ox * 0.92).setY(rise + 0.3), 0.02, 0.03));
  }
  const yaw = Math.atan2(dir[0], dir[1]);
  const m = new THREE.Matrix4().makeRotationY(yaw).setPosition(x, 0, z);
  const add = (list: THREE.BufferGeometry[], mat: THREE.Material) => list.forEach((g) => k.geo(f, mat, g.applyMatrix4(m)));
  add(parts, k.steel);
  add(steel, k.chrome);
  add(glass, k.glass);
  add(rails, k.black);
  // footprint
  const ex = x + dir[0] * run,
    ez = z + dir[1] * run;
  const hw = (w + 0.4) / 2;
  const px = Math.abs(dir[1]) * hw,
    pz = Math.abs(dir[0]) * hw;
  k.solid(f, Math.min(x, ex) - px, Math.min(z, ez) - pz, Math.max(x, ex) + px, Math.max(z, ez) + pz);
  // an invisible hit box over it, for the click
  const hit = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, rise + 1.2, run), new THREE.MeshBasicMaterial({ visible: false }));
  hit.position.set((x + ex) / 2, (rise + 1.2) / 2, (z + ez) / 2);
  hit.rotation.y = yaw;
  k.groups[f].add(hit);
  return hit;
}

/** A wayfinding sign in the Louvre's style: dark slate, white lettering, a coloured tab. */
export function wayfinding(k: MuseumKit, f: number, title: string, sub: string, accent: string, widthM: number) {
  return k.panel(f, 1024, 300, widthM, (g, w, h) => {
    g.fillStyle = "#26272b";
    g.fillRect(0, 0, w, h);
    g.fillStyle = accent;
    g.fillRect(0, 0, 22, h);
    g.fillStyle = "#ffffff";
    g.font = `700 120px ${SANS}`;
    g.textBaseline = "alphabetic";
    g.fillText(title, 60, 150);
    g.font = `400 52px ${SANS}`;
    g.fillStyle = "#c9c9cc";
    g.fillText(sub, 62, 240);
  });
}

/**
 * The lift lobby of a floor: one bronze door per other floor, a lit number over each, all on a
 * wall facing `yaw` at (x, z) along the wall. Clicking a door takes you there.
 */
export function lifts(k: MuseumKit, f: number, x: number, z: number, yaw: number, spacing = 2.4) {
  const others = FLOORS.map((_, i) => i).filter((i) => i !== f);
  const rx = Math.cos(yaw),
    rz = -Math.sin(yaw);
  const nx = Math.sin(yaw),
    nz = Math.cos(yaw);
  const bronze = new THREE.MeshStandardMaterial({ color: "#6a5236", roughness: 0.35, metalness: 0.85, envMapIntensity: 1.2 });
  others.forEach((to, i) => {
    const d = (i - (others.length - 1) / 2) * spacing;
    const cx = x + rx * d,
      cz = z + rz * d;
    // stone surround, bronze doors, the split line, the lit number
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.8, 2.9, 0.12), k.white);
    frame.position.set(cx + nx * 0.06, 1.45, cz + nz * 0.06);
    frame.rotation.y = yaw;
    const doors = new THREE.Mesh(new THREE.BoxGeometry(1.3, 2.4, 0.08), bronze);
    doors.position.set(cx + nx * 0.14, 1.2, cz + nz * 0.14);
    doors.rotation.y = yaw;
    const split = new THREE.Mesh(new THREE.BoxGeometry(0.02, 2.4, 0.09), k.black);
    split.position.copy(doors.position);
    split.rotation.y = yaw;
    k.groups[f].add(frame, doors, split);
    const sign = k.panel(
      f,
      512,
      200,
      1.5,
      (g, w, h) => {
        g.fillStyle = "#16161a";
        g.fillRect(0, 0, w, h);
        g.fillStyle = "#f4b728";
        g.font = `700 110px ${SANS}`;
        g.textBaseline = "middle";
        g.fillText(FLOORS[to].label, 26, h / 2 + 6);
        g.fillStyle = "#ffffff";
        g.font = `600 38px ${SANS}`;
        const words = FLOORS[to].name.split(" ");
        const l1 = words.slice(0, 2).join(" "),
          l2 = words.slice(2).join(" ");
        g.fillText(l1, 120, l2 ? h / 2 - 22 : h / 2 + 4);
        if (l2) g.fillText(l2, 120, h / 2 + 30);
      },
      { glow: true, transparent: false },
    );
    sign.position.set(cx + nx * 0.13, 3.25, cz + nz * 0.13);
    sign.rotation.y = yaw;
    const btn = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.18, 0.04), k.lit("#ffd27a", 2));
    btn.position.set(cx + rx * 0.85 + nx * 0.14, 1.2, cz + rz * 0.85 + nz * 0.14);
    btn.rotation.y = yaw;
    k.groups[f].add(btn);
    const info = () => ({ eyebrow: "Lift", title: `${FLOORS[to].label} · ${FLOORS[to].name}`, floor: to });
    const hov = `<b>Lift · ${FLOORS[to].label}</b><span>${FLOORS[to].name}</span>`;
    k.pick(f, doors, hov, info);
    k.pick(f, sign, hov, info);
  });
  const w = others.length * spacing;
  k.solid(f, Math.min(x - rx * w / 2, x + rx * w / 2) - Math.abs(nx) * 0.3, Math.min(z - rz * w / 2, z + rz * w / 2) - Math.abs(nz) * 0.3, Math.max(x - rx * w / 2, x + rx * w / 2) + Math.abs(nx) * 0.3, Math.max(z - rz * w / 2, z + rz * w / 2) + Math.abs(nz) * 0.3);
}

/** A gilt moulding (cornice / dado) running along a wall from (x0, z0) to (x1, z1) at height y. */
export function moulding(k: MuseumKit, f: number, x0: number, z0: number, x1: number, z1: number, y: number, h: number, depth: number, mat: THREE.Material) {
  const alongX = Math.abs(x1 - x0) >= Math.abs(z1 - z0);
  const len = alongX ? Math.abs(x1 - x0) : Math.abs(z1 - z0);
  k.geo(f, mat, boxGeo(alongX ? len : depth * 2, h, alongX ? depth * 2 : len, (x0 + x1) / 2, y, (z0 + z1) / 2));
}

/** A canvas texture that wraps round a cylinder: a band of text repeated. */
export function bandTexture(text: string, color: string, bg: string) {
  return canvasTex(
    2048,
    128,
    (g, w, h) => {
      g.fillStyle = bg;
      g.fillRect(0, 0, w, h);
      g.fillStyle = color;
      g.font = `700 72px ${SANS}`;
      g.textBaseline = "middle";
      const t = `${text}   ·   `;
      const tw = g.measureText(t).width;
      const n = Math.max(1, Math.floor(w / tw));
      g.textAlign = "center";
      for (let i = 0; i < n; i++) g.fillText(t, (w / n) * (i + 0.5), h / 2 + 4);
    },
    { repeat: true },
  );
}

export { FACE };
