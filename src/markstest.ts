// Dev page: one realistic landmark alone (src/scene/real/marks.ts) under the HDR sky — markstest.html?k=eiffel&view=front|three|side|top|close&night&lod=1
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { LOTS } from "./scene/city/plan";
import { landmark, type LandmarkKind } from "./scene/voxel/landmarks";
import { realMark } from "./scene/real/marks";
import { realMat } from "./scene/real/mats";
import { texSetup } from "./scene/real/tex";
import { GLASS_NIGHT } from "./scene/voxel/surface";
import { loadSkies, skyEnv } from "./scene/envmap";
import { plantTrees } from "./scene/real/trees";

const q = new URLSearchParams(location.search);
const kind = (q.get("k") ?? "eiffel") as LandmarkKind;
const view = q.get("view") ?? "three";
const night = q.has("night");
const lod = Number(q.get("lod") ?? 0);
const FACE: Record<string, string> = { museum: "e", shibuya: "e" };
const lot = LOTS.find((l) => l.kind === kind)!;
const ns = (FACE[kind] ?? "s") === "s" || FACE[kind] === "n";
const w = ns ? lot.x1 - lot.x0 : lot.z1 - lot.z0,
  d = ns ? lot.z1 - lot.z0 : lot.x1 - lot.x0;

const canvas = document.getElementById("c") as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
renderer.setSize(innerWidth, innerHeight, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = night ? 1.1 : 0.95;
renderer.outputColorSpace = THREE.SRGBColorSpace;
texSetup(renderer);
GLASS_NIGHT.value = night ? 1 : 0;
const scene = new THREE.Scene();
scene.background = new THREE.Color(night ? "#0b0d1a" : "#a9c3e6");
scene.fog = new THREE.Fog(scene.background, 200, 900);
const hemi = new THREE.HemisphereLight(night ? "#5a64a8" : "#d6e4ff", night ? "#1a1420" : "#a89c8c", night ? 0.6 : 0.8);
scene.add(hemi);
const sun = new THREE.DirectionalLight(night ? "#9fb0ff" : "#ffe8c8", night ? 0.5 : 3.4);
sun.position.set(60, 90, 70);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
const S = Math.max(w, d) * 0.9 + 20;
Object.assign(sun.shadow.camera, { left: -S, right: S, top: S, bottom: -S, near: 1, far: 400 });
sun.shadow.bias = -0.0004;
scene.add(sun);
loadSkies(renderer, () => {
  const sky = skyEnv(40);
  if (sky && !night) {
    scene.environment = sky;
    scene.environmentIntensity = 0.42;
  }
});
const ground = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), new THREE.MeshStandardMaterial({ color: "#5a5a60", roughness: 1 }));
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.08;
ground.receiveShadow = true;
scene.add(ground);

const t0 = performance.now();
const b = landmark(9001, { kind, w, d });
const job = { id: 1, type: "landmark", seed: 9001, opts: { kind, w, d }, along: 0, front: 0, face: "s", district: "downtown", frontRow: false, width: 0 } as never;
const out = realMark(kind, b, job, lod);
const ms = Math.round(performance.now() - t0);
const g = new THREE.Group();
let tris = 0;
for (const [slot, d0] of Object.entries(out.geos)) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(d0.pos, 3));
  geo.setAttribute("normal", new THREE.BufferAttribute(d0.nor, 3));
  geo.setAttribute("uv", new THREE.BufferAttribute(d0.uv, 2));
  geo.setAttribute("color", new THREE.BufferAttribute(d0.col, 3));
  geo.setIndex(d0.idx);
  tris += d0.idx.length / 3;
  const mat = realMat(slot as never);
  if (q.has("double")) mat.side = THREE.DoubleSide;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = mesh.receiveShadow = !slot.startsWith("lm.glow");
  g.add(mesh);
}
scene.add(g);
if (out.trees.length) plantTrees(scene, out.trees.map(([x, y, z, species, seed]) => ({ x, y, z, species: species as never, seed })));
console.log(`mark ${kind} ${w}x${d} m · ${Object.keys(out.geos).length} slots · ${tris} tris · ${ms} ms`);
{
  // the layout's points, door and walls, in the lot's metres (to check the geometry against them)
  const k = b.scale ?? 1, u = k / 6, W = b.model.w, D = b.model.d;
  const P = (v: number[]) => [((v[0] - W / 2) * u).toFixed(1), (v[1] * u).toFixed(1), ((v[2] - D / 2) * u).toFixed(1)].join(",");
  console.log(`mark pts door ${P([b.door[0], 0, b.door[1]])} ` + Object.entries(b.points ?? {}).map(([n, v]) => `${n} ${P(v)}`).join(" · "));
  if (q.has("marks")) {
    // the door (green), the points (gold), the walls (red outlines)
    const dot = (v: number[], c: string) => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.4), new THREE.MeshBasicMaterial({ color: c })); m.position.set((v[0] - W / 2) * u, v[1] * u + 0.4, (v[2] - D / 2) * u); scene.add(m); };
    dot([b.door[0], 0, b.door[1]], "#20ff40");
    for (const v of Object.values(b.points ?? {})) dot(v, "#ffc020");
    for (const w0 of b.walls ?? []) {
      const [x0, z0, x1, z1] = [(w0[0] - W / 2) * u, (w0[1] - D / 2) * u, (w0[2] - W / 2) * u, (w0[3] - D / 2) * u];
      const l = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(x1 - x0, 1.5, z1 - z0)), new THREE.LineBasicMaterial({ color: "#ff2020" }));
      l.position.set((x0 + x1) / 2, 0.75, (z0 + z1) / 2);
      scene.add(l);
    }
  }
}

const cam = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 3000);
const box = new THREE.Box3().setFromObject(g);
const size = box.getSize(new THREE.Vector3()),
  ctr = box.getCenter(new THREE.Vector3());
const R = Math.max(size.x, size.y * 1.2, size.z) * 1.15;
const at = new THREE.Vector3(ctr.x, size.y * 0.4, ctr.z);
const P: Record<string, [number, number, number]> = {
  front: [0, size.y * 0.35 + 4, d / 2 + R],
  three: [R * 0.75, size.y * 0.45 + 8, d / 2 + R * 0.8],
  side: [R + w / 2, size.y * 0.35 + 4, 0],
  top: [0.01, R * 1.6, 0.01],
  close: [w * 0.18, 2.2, d / 2 + 9],
  street: [w * 0.3, 1.7, d / 2 + 6],
  high: [R * 0.35, size.y * 1.3 + 10, d / 2 + R * 0.35],
};
if (view === "high") at.set(0, 0, -d * 0.1);

cam.position.set(...(P[view] ?? P.three));
if (view === "mid") {
  // a tall one from a block away, half way up
  cam.position.set(90, 60, 170);
  at.set(0, 120, 0);
}
if (view === "close" || view === "street") at.set(0, Math.min(size.y * 0.3, 14), 0);
cam.lookAt(at);
const ctl = new OrbitControls(cam, canvas);
ctl.target.copy(at);
(window as unknown as { __ready: boolean }).__ready = true;
function frame() {
  renderer.render(scene, cam);
  requestAnimationFrame(frame);
}
frame();
