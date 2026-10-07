import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { toObject } from "../voxel/mesher";
import { C, E, G, hash, shades, VoxelModel } from "../voxel/model";
import { BOARDWALKS, CREEK, F, Land, SITES, TRAILS } from "./land";

/**
 * What people built in the woods: the trailhead gate and its map, the boardwalks over the gorge
 * and along the plunge pool, Viewing Key Point's deck over the bluff, the falls overlook, the ranger
 * cabin with its porch and chimney, the campfire ring with log benches and tents, lanterns along
 * the trails, the Genesis Tree's fence and plaque. Wood and stone are merged into one mesh;
 * lanterns are instanced; signs are canvas planes.
 */

const WOOD = ["#8a6040", "#7a5436", "#946a46", "#6e4a30"];
const DARK = "#4a3424";

export interface Built {
  group: THREE.Group;
  /** Solid things to walk round: circles (x, z, r) and boxes (x0, z0, x1, z1). */
  circles: [number, number, number][];
  rects: [number, number, number, number][];
  /** Lantern positions (world), for lights and fireflies. */
  lanterns: THREE.Vector3[];
  lanternMat: THREE.MeshBasicMaterial;
  windows: THREE.MeshBasicMaterial;
  /** The campfire: where the flames go, where the hikers sit. */
  fire: THREE.Vector3;
  seats: { x: number; z: number; y: number }[];
  chimney: THREE.Vector3;
}

class Boxes {
  geos: THREE.BufferGeometry[] = [];
  private col = new THREE.Color();
  add(w: number, h: number, d: number, x: number, y: number, z: number, color: string, rotY = 0, shade = true) {
    const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
    if (rotY) g.rotateY(rotY);
    g.translate(x, y + h / 2, z);
    this.col.set(color);
    const n = g.getAttribute("position").count;
    const c = new Float32Array(n * 3);
    const nrm = g.getAttribute("normal");
    for (let i = 0; i < n; i++) {
      const k = !shade ? 1 : nrm.getY(i) > 0.5 ? 1 : nrm.getY(i) < -0.5 ? 0.6 : 0.8;
      c[i * 3] = this.col.r * k;
      c[i * 3 + 1] = this.col.g * k;
      c[i * 3 + 2] = this.col.b * k;
    }
    g.setAttribute("color", new THREE.BufferAttribute(c, 3));
    g.deleteAttribute("uv");
    this.geos.push(g);
  }
  /** A beam from a to b (a box of section w×h). */
  beam(a: THREE.Vector3, b: THREE.Vector3, w: number, h: number, color: string) {
    const len = a.distanceTo(b);
    const g = new THREE.BoxGeometry(w, h, len).toNonIndexed();
    const m = new THREE.Matrix4().lookAt(a, b, new THREE.Vector3(0, 1, 0));
    g.applyMatrix4(m);
    g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    this.col.set(color);
    const n = g.getAttribute("position").count;
    const c = new Float32Array(n * 3);
    const nrm = g.getAttribute("normal");
    for (let i = 0; i < n; i++) {
      const k = nrm.getY(i) > 0.5 ? 1 : 0.78;
      c[i * 3] = this.col.r * k;
      c[i * 3 + 1] = this.col.g * k;
      c[i * 3 + 2] = this.col.b * k;
    }
    g.setAttribute("color", new THREE.BufferAttribute(c, 3));
    g.deleteAttribute("uv");
    this.geos.push(g);
  }
  mesh() {
    const m = new THREE.Mesh(mergeGeometries(this.geos, false), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }));
    m.castShadow = m.receiveShadow = true;
    return m;
  }
}

const wood = (i: number) => WOOD[Math.abs(i) % WOOD.length];

/** A routed park sign: cream letters cut into dark-stained wood. */
export function signTexture(lines: string[], w = 512, h = 160, big = 64) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  g.fillStyle = "#4a2e1c";
  g.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 6) {
    g.fillStyle = `rgba(0,0,0,${0.06 + ((y * 7) % 5) * 0.02})`;
    g.fillRect(0, y, w, 2);
  }
  g.strokeStyle = "#2a1a10";
  g.lineWidth = 10;
  g.strokeRect(5, 5, w - 10, h - 10);
  g.fillStyle = "#f2dfae";
  g.textAlign = "center";
  g.textBaseline = "middle";
  lines.forEach((l, i) => {
    const size = i === 0 ? big : big * 0.5;
    let fit = size;
    g.font = `800 ${fit}px "Trebuchet MS", "Verdana", sans-serif`;
    while (fit > 12 && g.measureText(l).width > w - 44) g.font = `800 ${(fit -= 2)}px "Trebuchet MS", "Verdana", sans-serif`;
    const y = lines.length === 1 ? h / 2 : i === 0 ? h * 0.4 : h * 0.4 + big * 0.55 + (i - 1) * size * 1.2;
    g.fillText(l, w / 2, y);
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** The trail map at the trailhead, drawn from the plan itself. */
function mapTexture(land: Land) {
  const W = 512,
    H = 300;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  g.fillStyle = "#4a2e1c";
  g.fillRect(0, 0, W, H);
  const k = (W - 40) / (F.x1 - F.x0);
  const px = (x: number) => 20 + (x - F.x0) * k;
  // north is the city: draw it at the top
  const pz = (z: number) => 50 + (z - F.z0) * k * 1.0;
  g.fillStyle = "#2e5a6e";
  g.fillRect(14, 44, W - 28, H - 58);
  for (let x = F.x0; x < F.x1; x += 2)
    for (let z = F.z0; z < F.z1; z += 2) {
      const h = land.raw(x + 1, z + 1);
      if (h < -1.2) continue;
      g.fillStyle = h > 9 ? "#2c5a2a" : h > 4 ? "#386a32" : h > 0 ? "#4f7a3a" : "#b8984e";
      g.fillRect(px(x), pz(z), 2 * k + 0.6, 2 * k + 0.6);
    }
  g.strokeStyle = "#7ac0e0";
  g.lineWidth = 3;
  g.beginPath();
  CREEK.forEach(([x, z], i) => (i ? g.lineTo(px(x), pz(z)) : g.moveTo(px(x), pz(z))));
  g.stroke();
  g.strokeStyle = "#f2dfae";
  g.lineWidth = 3;
  g.setLineDash([6, 4]);
  for (const t of TRAILS) {
    g.beginPath();
    t.forEach(([x, z], i) => (i ? g.lineTo(px(x), pz(z)) : g.moveTo(px(x), pz(z))));
    g.stroke();
  }
  g.setLineDash([]);
  const dot = (x: number, z: number, label: string, color: string) => {
    g.fillStyle = color;
    g.beginPath();
    g.arc(px(x), pz(z), 6, 0, Math.PI * 2);
    g.fill();
    g.font = '700 15px "Trebuchet MS", sans-serif';
    g.fillStyle = "#fff4d6";
    g.textAlign = "center";
    g.fillText(label, px(x), pz(z) - 11);
  };
  dot(SITES.plaza.x, SITES.plaza.z, "YOU ARE HERE", "#f4b728");
  dot(SITES.lookout.x, SITES.lookout.z, "Viewing Key Point", "#fff4d6");
  dot(SITES.camp.x, SITES.camp.z, "Campfire", "#ff7a2a");
  dot(213, 223, "Sprout Falls", "#7ac0e0");
  dot(SITES.cabin.x, SITES.cabin.z, "Ranger", "#fff4d6");
  dot(SITES.genesis.x, SITES.genesis.z, "Genesis Tree", "#fff4d6");
  g.font = '800 30px "Trebuchet MS", sans-serif';
  g.fillStyle = "#f2dfae";
  g.textAlign = "left";
  g.fillText("SHIELDED WOODS", 18, 30);
  g.font = '700 16px "Trebuchet MS", sans-serif';
  g.textAlign = "right";
  g.fillText("TRAIL MAP · 6.2 km", W - 18, 30);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function signPlane(tex: THREE.Texture, w: number, h: number) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 }));
  m.castShadow = true;
  return m;
}

/** The ranger station: a log cabin, stone chimney, shingled roof, porch, flag. Front faces +z. */
function cabinModel() {
  const m = new VoxelModel(52, 44, 44);
  const logs = (x: number, y: number, z: number) => C(["#7a4a2e", "#8a5634", "#6e4228"][(Math.floor(y / 2) + (hash(x, Math.floor(y / 2), z, 3) > 0.7 ? 1 : 0)) % 3]);
  const x0 = 4,
    x1 = 46,
    z0 = 4,
    z1 = 30;
  // stone foundation
  m.box(x0 - 1, 0, z0 - 1, x1 + 1, 3, z1 + 1, shades(["#7a7680", "#6a6670", "#86828c"], 2, 4));
  // log walls with the ends crossing at the corners
  m.box(x0, 3, z0, x1, 22, z1, logs);
  m.clear(x0 + 1, 3, z0 + 1, x1 - 1, 22, z1 - 1);
  for (let y = 3; y < 22; y += 2)
    for (const [x, z] of [
      [x0 - 1, z0 - 1],
      [x1, z0 - 1],
      [x0 - 1, z1],
      [x1, z1],
    ])
      m.box(x, y, z, x + 1, y + 1, z + 1, C("#9a6a44"));
  // door and windows on the front, windows on the sides
  m.box(22, 3, z1 - 1, 29, 16, z1, C("#4a2e1c"));
  m.box(28, 9, z1, 29, 10, z1 + 1, C("#d8b030"));
  for (const x of [9, 35]) {
    m.box(x, 9, z1 - 1, x + 7, 16, z1, G("#2a3440"));
    m.box(x - 1, 8, z1, x + 8, 9, z1 + 1, C("#5a3a24"));
    m.box(x + 3, 9, z1 - 1, x + 4, 16, z1, C("#5a3a24"));
  }
  for (const z of [10, 20]) for (const x of [x0, x1 - 1]) m.box(x, 9, z, x + 1, 16, z + 6, G("#2a3440"));
  // roof: shingles, a steep gable along x
  const roof = shades(["#3a4a3a", "#344234", "#40503e"], 1, 7);
  for (let k = 0; k < 18; k++) m.box(x0 - 3, 22 + k, z0 - 3 + k, x1 + 3, 23 + k, z1 + 3 - k, roof);
  m.box(x0 - 3, 40, 16, x1 + 3, 41, 18, C("#2a3428"));
  // gable ends: logs
  for (let k = 0; k < 17; k++) {
    m.box(x0, 22 + k, z0 + k, x0 + 1, 23 + k, z1 - k, logs);
    m.box(x1 - 1, 22 + k, z0 + k, x1, 23 + k, z1 - k, logs);
  }
  // stone chimney on the east end
  m.box(x1, 0, 13, x1 + 5, 44, 20, shades(["#7a7680", "#6a6670", "#8c8892", "#5e5a64"], 1, 9));
  // the porch: a deck, posts, a lean-to roof, a bench
  m.box(x0, 3, z1, x1, 4, z1 + 11, shades(["#9a6e48", "#8a6040"], 1, 2));
  for (const x of [x0, 15, 34, x1 - 2]) m.box(x, 4, z1 + 9, x + 2, 20, z1 + 11, C("#6e4a30"));
  for (let k = 0; k < 4; k++) m.box(x0 - 1, 20 + k, z1 + 12 - k * 3, x1 + 1, 21 + k, z1 + 12 - k * 3 + 3, roof);
  m.box(x0 + 2, 4, z1 + 1, x0 + 14, 7, z1 + 3, C("#8a6040"));
  m.box(x0 + 2, 7, z1 + 1, x0 + 14, 9, z1 + 2, C("#8a6040"));
  // steps
  m.box(22, 0, z1 + 11, 30, 1, z1 + 14, C("#7a7680"));
  m.box(22, 1, z1 + 11, 30, 3, z1 + 12, C("#8a6040"));
  // firewood stacked by the chimney
  for (let y = 0; y < 8; y++) for (let z = 22; z < 30; z++) m.set(x1 + 1 + (y % 2), y, z, C((y + z) % 3 ? "#9a6a40" : "#c8925a"));
  return m;
}

/** A dome tent, front +z. */
function tentModel(color: string, trim: string) {
  const m = new VoxelModel(18, 10, 16);
  for (let y = 0; y < 10; y++) {
    const r = 8 * Math.sqrt(1 - (y / 10) ** 2);
    m.box(9 - r, y, 2, 9 + r, y + 1, 14, y % 3 === 2 ? C(trim) : C(color));
  }
  m.box(7, 0, 13, 11, 5, 14, C("#2a2420"));
  m.box(8, 9, 2, 10, 10, 14, C(trim));
  return m;
}

/** Campfire ring: stones, crossed logs, embers. */
function fireRing() {
  const m = new VoxelModel(14, 5, 14);
  for (let a = 0; a < 16; a++) {
    const x = 7 + Math.cos((a / 16) * Math.PI * 2) * 5.6,
      z = 7 + Math.sin((a / 16) * Math.PI * 2) * 5.6;
    m.box(x - 0.5, 0, z - 0.5, x + 1, 2, z + 1, C(a % 2 ? "#7a7680" : "#5e5a64"));
  }
  m.box(4, 0, 4, 10, 1, 10, E("#ff6a1a", 2.4));
  m.box(5, 1, 6, 10, 2, 8, C("#4a2e1c"));
  m.box(6, 1, 5, 8, 3, 10, C("#3a2418"));
  m.box(6, 2, 6, 8, 3, 8, E("#ffb03a", 3));
  return m;
}

function binoculars() {
  const m = new VoxelModel(6, 14, 6);
  m.box(2, 0, 2, 4, 9, 4, C("#2e5a3a"));
  m.box(0, 9, 1, 6, 12, 5, C("#3a6a44"));
  m.box(0, 10, 0, 2, 12, 1, C("#1a1a20"));
  m.box(4, 10, 0, 6, 12, 1, C("#1a1a20"));
  m.box(1, 12, 2, 5, 13, 4, C("#d8b030"));
  return m;
}

export function buildProps(land: Land): Built {
  const group = new THREE.Group();
  const B = new Boxes();
  const circles: [number, number, number][] = [];
  const rects: [number, number, number, number][] = [];
  const lanterns: THREE.Vector3[] = [];
  const at = (x: number, z: number) => land.raw(x, z);

  // ---- boardwalks: planks, stringers, posts down to the ground, rails both sides --------------
  for (const w of land.walks) {
    for (let s = 1; s < w.pts.length; s++) {
      const [ax, az] = w.pts[s - 1],
        [bx, bz] = w.pts[s];
      const len = Math.hypot(bx - ax, bz - az);
      const yaw = Math.atan2(bx - ax, bz - az);
      const n = Math.ceil(len / 0.4);
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n;
        const x = ax + (bx - ax) * t,
          z = az + (bz - az) * t;
        const y = w.y[s - 1] + (w.y[s] - w.y[s - 1]) * t;
        B.add(1.9, 0.08, 0.36, x, y - 0.08, z, wood(i + s), yaw);
      }
      const nx = Math.cos(yaw),
        nz = -Math.sin(yaw);
      const posts = Math.ceil(len / 1.6);
      for (let i = 0; i <= posts; i++) {
        const t = i / posts;
        const x = ax + (bx - ax) * t,
          z = az + (bz - az) * t;
        const y = w.y[s - 1] + (w.y[s] - w.y[s - 1]) * t;
        for (const sd of [-1, 1]) {
          const px = x + nx * 0.95 * sd,
            pz = z + nz * 0.95 * sd;
          const g = Math.min(at(px, pz), y - 0.1);
          B.add(0.14, y - g + 0.95, 0.14, px, g, pz, DARK);
        }
      }
      for (const sd of [-1, 1]) {
        const a = new THREE.Vector3(ax + nx * 0.95 * sd, w.y[s - 1] + 0.9, az + nz * 0.95 * sd),
          b = new THREE.Vector3(bx + nx * 0.95 * sd, w.y[s] + 0.9, bz + nz * 0.95 * sd);
        B.beam(a, b, 0.1, 0.1, "#9a6e48");
        B.beam(a.clone().setY(a.y - 0.42), b.clone().setY(b.y - 0.42), 0.06, 0.06, "#7a5436");
        B.beam(a.clone().setY(a.y - 1.0), b.clone().setY(b.y - 1.0), 0.22, 0.22, DARK);
      }
    }
  }

  // ---- Viewing Key Point: a deck out over the bluff, rails on three sides, binoculars facing the city --
  const deck = (d: (typeof land.decks)[number], rails: ("n" | "e" | "w" | "s")[]) => {
    for (let z = d.z0 + 0.2; z < d.z1; z += 0.4) B.add(d.x1 - d.x0, 0.08, 0.36, (d.x0 + d.x1) / 2, d.y - 0.08, z, wood(Math.round(z * 3)));
    for (let x = d.x0 + 0.1; x <= d.x1; x += (d.x1 - d.x0 - 0.2) / Math.ceil((d.x1 - d.x0) / 1.6))
      for (let z = d.z0 + 0.1; z <= d.z1; z += (d.z1 - d.z0 - 0.2) / Math.ceil((d.z1 - d.z0) / 1.6)) {
        const g = Math.min(at(x, z), d.y - 0.2) - 0.4;
        B.add(0.2, d.y - g, 0.2, x, g, z, DARK);
      }
    const rail = (ax: number, az: number, bx: number, bz: number) => {
      const a = new THREE.Vector3(ax, d.y + 1.0, az),
        b = new THREE.Vector3(bx, d.y + 1.0, bz);
      B.beam(a, b, 0.12, 0.12, "#9a6e48");
      B.beam(a.clone().setY(d.y + 0.5), b.clone().setY(d.y + 0.5), 0.06, 0.06, "#7a5436");
      const n = Math.ceil(Math.hypot(bx - ax, bz - az) / 1.2);
      for (let i = 0; i <= n; i++) B.add(0.12, 1.0, 0.12, ax + ((bx - ax) * i) / n, d.y, az + ((bz - az) * i) / n, DARK);
    };
    if (rails.includes("n")) rail(d.x0, d.z0, d.x1, d.z0);
    if (rails.includes("s")) rail(d.x0, d.z1, d.x1, d.z1);
    if (rails.includes("w")) rail(d.x0, d.z0, d.x0, d.z1);
    if (rails.includes("e")) rail(d.x1, d.z0, d.x1, d.z1);
  };
  const L = land.decks[0];
  deck(L, ["n", "e", "w"]);
  for (const x of [L.x0 + 1.4, L.x1 - 1.4]) {
    const b = toObject(binoculars());
    b.position.set(x, L.y, L.z0 + 0.7);
    b.scale.setScalar(0.55);
    b.rotation.y = Math.PI;
    group.add(b);
    circles.push([x, L.z0 + 0.7, 0.35]);
  }
  // a bench facing the view
  B.add(2.4, 0.1, 0.5, (L.x0 + L.x1) / 2, L.y + 0.42, L.z1 - 1.2, "#9a6e48");
  B.add(2.4, 0.5, 0.08, (L.x0 + L.x1) / 2, L.y + 0.52, L.z1 - 0.95, "#8a6040");
  for (const dx of [-1, 1]) B.add(0.1, 0.42, 0.45, (L.x0 + L.x1) / 2 + dx * 1.05, L.y, L.z1 - 1.2, DARK);
  rects.push([(L.x0 + L.x1) / 2 - 1.25, L.z1 - 1.5, (L.x0 + L.x1) / 2 + 1.25, L.z1 - 0.9]);
  // the falls overlook
  const FD = land.decks[1];
  deck(FD, ["n", "e", "w"]);

  // ---- signs ---------------------------------------------------------------------------------------
  const sign = (lines: string[], x: number, z: number, yaw: number, w = 2.4, h = 0.75, postH = 1.4, big = 64) => {
    const y = at(x, z);
    const p = signPlane(signTexture(lines, 512, Math.round((512 * h) / w), big), w, h);
    p.position.set(x, y + postH + h / 2, z);
    p.rotation.y = yaw;
    const back = p.clone();
    back.rotation.y = yaw + Math.PI;
    back.position.add(new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)).multiplyScalar(-0.09));
    group.add(p, back);
    const bx = Math.cos(yaw),
      bz = -Math.sin(yaw);
    B.add(w + 0.2, h + 0.16, 0.08, x - Math.sin(yaw) * 0.045, y + postH - 0.08, z - Math.cos(yaw) * 0.045, "#3a2416", yaw);
    for (const s of [-1, 1]) {
      B.add(0.16, postH + h + 0.2, 0.16, x + bx * (w / 2 - 0.1) * s - Math.sin(yaw) * 0.12, y - 0.2, z + bz * (w / 2 - 0.1) * s - Math.cos(yaw) * 0.12, "#5a3a24");
      circles.push([x + bx * (w / 2 - 0.1) * s, z + bz * (w / 2 - 0.1) * s, 0.2]);
    }
  };
  // the trailhead: a log arch over the trail, the name on it; the map board beside
  {
    const P = SITES.plaza;
    const gx = 170.5,
      gz = 221;
    const y = at(gx, gz);
    const yaw = Math.atan2(174.5 - 166, 215.5 - 226);
    const ax = Math.cos(yaw),
      az = -Math.sin(yaw);
    for (const s of [-1, 1]) {
      B.add(0.42, 4.2, 0.42, gx + ax * 1.7 * s, y - 0.3, gz + az * 1.7 * s, "#6e4228");
      circles.push([gx + ax * 1.7 * s, gz + az * 1.7 * s, 0.3]);
    }
    B.beam(new THREE.Vector3(gx - ax * 2.3, y + 3.75, gz - az * 2.3), new THREE.Vector3(gx + ax * 2.3, y + 3.75, gz + az * 2.3), 0.4, 0.4, "#7a4a2e");
    const name = signPlane(signTexture(["SHIELDED WOODS"], 1024, 170, 104), 3.2, 0.55);
    name.position.set(gx, y + 3.1, gz);
    name.rotation.y = yaw + Math.PI;
    const nameBack = name.clone();
    nameBack.rotation.y = yaw;
    group.add(name, nameBack);
    B.add(3.36, 0.66, 0.06, gx, y + 2.77, gz, "#3a2416", yaw);
    // the map under a little roof
    const mx = P.x - 3.8,
      mz = P.z + 1.4;
    const my = at(mx, mz);
    const map = signPlane(mapTexture(land), 2.2, 1.3);
    map.position.set(mx, my + 1.55, mz);
    map.rotation.y = Math.PI * 0.8;
    group.add(map);
    B.add(2.4, 1.5, 0.08, mx + Math.sin(Math.PI * 0.8) * -0.05, my + 0.82, mz + Math.cos(Math.PI * 0.8) * -0.05, "#3a2416", Math.PI * 0.8);
    B.add(2.8, 0.1, 0.9, mx, my + 2.35, mz, "#4a3424", Math.PI * 0.8);
    for (const s of [-1, 1]) {
      const px = mx + Math.cos(Math.PI * 0.8) * 1.15 * s,
        pz = mz - Math.sin(Math.PI * 0.8) * 1.15 * s;
      B.add(0.16, 2.4, 0.16, px, my - 0.1, pz, "#5a3a24");
      circles.push([px, pz, 0.2]);
    }
  }
  sign(["VIEWING KEY POINT", "VIEW OF THE CITY · ELEV 14 m"], SITES.lookout.x + 2.6, SITES.lookout.z + 3.4, Math.PI * 0.85, 1.9, 0.62, 1.0, 58);
  sign(["SPROUT FALLS", "6 m DROP"], SITES.fallsDeck.x - 2.1, SITES.fallsDeck.z - 1.6, Math.PI * 0.25, 1.7, 0.55, 1.0, 58);
  sign(["RANGER STATION"], SITES.cabin.x - 7.5, SITES.cabin.z + 2.2, -Math.PI / 2, 2.2, 0.5, 1.2, 64);
  sign(["CAMPGROUND", "NO FIRES OUTSIDE THE RING"], 190.5, 210.8, Math.PI * 0.6, 1.8, 0.55, 1.0, 54);
  sign(["GENESIS TREE", "THE OLDEST · BLOCK 0 · 28 OCT 2016"], SITES.genesis.x + 3.4, SITES.genesis.z - 3.0, Math.PI * 1.1, 2.2, 0.6, 0.9, 58);

  // ---- the Genesis Tree's fence: a low split-rail round the giant ---------------------------------
  {
    const G0 = SITES.genesis;
    const n = 14;
    for (let i = 0; i < n; i++) {
      if (i === 3 || i === 4) continue; // the opening, toward the boardwalk
      const a0 = (i / n) * Math.PI * 2,
        a1 = ((i + 1) / n) * Math.PI * 2;
      const p0 = new THREE.Vector3(G0.x + Math.cos(a0) * 4.2, 0, G0.z + 4.2 * Math.sin(a0) - 1);
      const p1 = new THREE.Vector3(G0.x + Math.cos(a1) * 4.2, 0, G0.z + 4.2 * Math.sin(a1) - 1);
      p0.y = at(p0.x, p0.z) + 0.7;
      p1.y = at(p1.x, p1.z) + 0.7;
      B.beam(p0, p1, 0.12, 0.12, "#9a7a54");
      B.beam(p0.clone().setY(p0.y - 0.35), p1.clone().setY(p1.y - 0.35), 0.1, 0.1, "#8a6a44");
      B.add(0.16, 0.85, 0.16, p0.x, p0.y - 0.75, p0.z, "#6a4a30");
    }
  }

  // ---- the ranger cabin -----------------------------------------------------------------------------
  const CB = SITES.cabin;
  const cabinY = at(CB.x, CB.z) - 0.05;
  const cabin = toObject(cabinModel());
  cabin.position.set(CB.x, cabinY, CB.z);
  cabin.rotation.y = -Math.PI / 2; // the porch faces the trail, west
  group.add(cabin);
  // model (mx, my, mz) lands at world (x - (mz - 22) / 6, y + my / 6, z + (mx - 26) / 6): the porch faces -x
  rects.push([CB.x - 3.3, CB.z - 3.9, CB.x + 3.2, CB.z + 4.3]);
  const windows = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.25, 0.2, 0.12), toneMapped: false });
  for (const mx of [12.5, 38.5]) {
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(7 / 6, 7 / 6), windows);
    pane.position.set(CB.x - 8 / 6 - 0.02, cabinY + 12.5 / 6, CB.z + (mx - 26) / 6);
    pane.rotation.y = -Math.PI / 2;
    group.add(pane);
  }
  // flag pole with the ZEC flag
  {
    const fx = CB.x - 6.8,
      fz = CB.z - 4;
    const fy = at(fx, fz);
    B.add(0.12, 7, 0.12, fx, fy, fz, "#c8c8d0");
    const flagC = document.createElement("canvas");
    flagC.width = 96;
    flagC.height = 64;
    const fg = flagC.getContext("2d")!;
    fg.fillStyle = "#f4b728";
    fg.fillRect(0, 0, 96, 64);
    fg.fillStyle = "#1a1820";
    fg.font = "900 46px sans-serif";
    fg.textAlign = "center";
    fg.textBaseline = "middle";
    fg.fillText("ⓩ", 48, 34);
    const ft = new THREE.CanvasTexture(flagC);
    ft.colorSpace = THREE.SRGBColorSpace;
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1, 6, 1), new THREE.MeshStandardMaterial({ map: ft, side: THREE.DoubleSide, roughness: 0.8 }));
    flag.position.set(fx + 0.78, fy + 6.4, fz);
    flag.name = "flag";
    group.add(flag);
    circles.push([fx, fz, 0.2]);
  }

  // ---- campfire, log benches, tents ----------------------------------------------------------------
  const CP = SITES.camp;
  const fy = at(CP.x, CP.z);
  const ring = toObject(fireRing());
  ring.position.set(CP.x, fy - 0.05, CP.z);
  group.add(ring);
  circles.push([CP.x, CP.z, 1.25]);
  const seats: { x: number; z: number; y: number }[] = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.3;
    const x = CP.x + Math.cos(a) * 2.7,
      z = CP.z + Math.sin(a) * 2.7;
    const y = at(x, z);
    // a split log, flat side up
    B.add(1.7, 0.42, 0.5, x, y - 0.02, z, i % 2 ? "#7a4a2e" : "#8a5634", -a + Math.PI / 2);
    B.add(1.6, 0.04, 0.42, x, y + 0.4, z, "#c8925a", -a + Math.PI / 2);
    seats.push({ x: CP.x + Math.cos(a) * 2.85, z: CP.z + Math.sin(a) * 2.85, y: y + 0.44 });
  }
  for (const [dx, dz, yaw, col, trim] of [
    [-5.2, -3.6, 0.6, "#e07a2a", "#3a4a5a"],
    [4.8, -4.4, -0.5, "#3a7a4a", "#e8d06a"],
    [-1.5, -6.2, 0.05, "#c83a3a", "#e8e4dc"],
  ] as const) {
    const t = toObject(tentModel(col, trim));
    t.position.set(CP.x + dx, at(CP.x + dx, CP.z + dz) - 0.05, CP.z + dz);
    t.rotation.y = yaw;
    group.add(t);
    circles.push([CP.x + dx, CP.z + dz, 1.4]);
  }

  // ---- lanterns along the trails: a post every ten metres or so, alternating sides ----------------
  let side = 1;
  for (const t of TRAILS) {
    let carry = 4;
    for (let s = 1; s < t.length; s++) {
      const [ax, az] = t[s - 1],
        [bx, bz] = t[s];
      const len = Math.hypot(bx - ax, bz - az);
      for (let d = carry; d < len; d += 9.5) {
        const x = ax + ((bx - ax) * d) / len + ((bz - az) / len) * 1.25 * side,
          z = az + ((bz - az) * d) / len - ((bx - ax) / len) * 1.25 * side;
        side = -side;
        if (land.walkAt(x, z) !== null) continue;
        if (Math.hypot(x - CP.x, z - CP.z) < 7) continue;
        lanterns.push(new THREE.Vector3(x, land.floor(x, z), z));
        carry = d + 9.5 - len;
      }
      carry = Math.max(0, carry);
    }
  }
  // the boardwalks get theirs on the rail posts
  for (const w of land.walks)
    for (let s = 1; s < w.pts.length; s++) {
      const [ax, az] = w.pts[s - 1],
        [bx, bz] = w.pts[s];
      const yaw = Math.atan2(bx - ax, bz - az);
      lanterns.push(new THREE.Vector3((ax + bx) / 2 + Math.cos(yaw) * 0.95, (w.y[s - 1] + w.y[s]) / 2 + 0.05 - 0.2, (az + bz) / 2 - Math.sin(yaw) * 0.95));
    }
  const lanternMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 0.36, 0.18), toneMapped: false });
  const postGeo = new THREE.BoxGeometry(0.12, 1.25, 0.12).translate(0, 0.625, 0);
  const capGeo = mergeGeometries([new THREE.BoxGeometry(0.34, 0.06, 0.34).translate(0, 1.66, 0), new THREE.BoxGeometry(0.3, 0.05, 0.3).translate(0, 1.27, 0), new THREE.BoxGeometry(0.06, 0.12, 0.06).translate(0, 1.74, 0)]);
  const glassGeo = new THREE.BoxGeometry(0.22, 0.32, 0.22).translate(0, 1.46, 0);
  const posts = new THREE.InstancedMesh(postGeo, new THREE.MeshStandardMaterial({ color: "#4a3424", roughness: 0.9 }), lanterns.length);
  const caps = new THREE.InstancedMesh(capGeo, new THREE.MeshStandardMaterial({ color: "#2a2a30", roughness: 0.5, metalness: 0.6 }), lanterns.length);
  const glass = new THREE.InstancedMesh(glassGeo, lanternMat, lanterns.length);
  const mtx = new THREE.Matrix4();
  lanterns.forEach((p, i) => {
    mtx.makeTranslation(p.x, p.y - 0.05, p.z);
    posts.setMatrixAt(i, mtx);
    caps.setMatrixAt(i, mtx);
    glass.setMatrixAt(i, mtx);
    circles.push([p.x, p.z, 0.15]);
  });
  posts.castShadow = caps.castShadow = true;
  group.add(posts, caps, glass);
  for (const p of lanterns) p.y += 1.46;

  group.add(B.mesh());
  return {
    group,
    circles,
    rects,
    lanterns,
    lanternMat,
    windows,
    fire: new THREE.Vector3(CP.x, fy + 0.25, CP.z),
    seats,
    chimney: new THREE.Vector3(CB.x + 0.92, cabinY + 44 / 6, CB.z + 3.75),
  };
}

export { BOARDWALKS };
