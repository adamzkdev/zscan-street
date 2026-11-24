// Dev page: the walk-in places' furniture (src/interior/furniture.ts, drawn by src/scene/real/voxreal.ts) in a lit room —
// furntest.html?items=sofa,armchair&view=three|front|top&vox (the old voxel meshing, to compare)
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import * as F from "./interior/furniture";
import { toObject } from "./scene/voxel/mesher";
import { realObject } from "./scene/real/remesh";
import type { VoxelModel } from "./scene/voxel/model";

const q = new URLSearchParams(location.search);
const MAKE: Record<string, () => VoxelModel> = {
  sofa: () => F.sofa("#3a5a8a"),
  armchair: () => F.armchair("#8a3a3a"),
  chair: () => F.chair("#c8a070"),
  office: () => F.chair("#2a2a30", true),
  stool: () => F.stool("#c84a3a"),
  coffeeTable: F.coffeeTable,
  diningTable: () => F.diningTable(4),
  bookshelf: () => F.bookshelf(1),
  wardrobe: () => F.wardrobe(),
  nightstand: F.nightstand,
  tvUnit: () => F.tvUnit(),
  bed: () => F.bed("#5a6a8a"),
  kitchen: () => F.kitchen(30, "#e8e4dc"),
  fridge: F.fridge,
  toilet: F.toilet,
  vanity: () => F.vanity("#e8e4dc"),
  bathtub: F.bathtub,
  monstera: () => F.plant("monstera", 1),
  ficus: () => F.plant("ficus", 2),
  cactus: () => F.plant("cactus", 3),
  floorLamp: F.floorLamp,
  desk: () => F.desk(1),
  coffeeMachine: F.coffeeMachine,
  arcade: () => F.arcadeCabinet("#2a2a6a", "#ff3e8a"),
  poolTable: F.poolTable,
  barCounter: () => F.barCounter(30, "#f4b728"),
  receptionDesk: F.receptionDesk,
  grandPiano: F.grandPiano,
  bistroTable: F.bistroTable,
  pastryCase: F.pastryCase,
  bench: F.bench,
  kiosk: F.kiosk,
  indoorTree: () => F.indoorTree(1),
  lounger: () => F.lounger("#e8e4dc"),
};
const items = (q.get("items") ?? Object.keys(MAKE).join(",")).split(",").filter((k) => MAKE[k]);
const view = q.get("view") ?? "three";
const canvas = document.getElementById("c") as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
renderer.setSize(innerWidth, innerHeight, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
scene.background = new THREE.Color("#3a3a40");
const pm = new THREE.PMREMGenerator(renderer);
scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.7;
scene.add(new THREE.HemisphereLight("#fff4e8", "#40382f", 0.6));
const key = new THREE.DirectionalLight("#fff1dc", 2.2);
key.position.set(5, 9, 7);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.left = key.shadow.camera.bottom = -14;
key.shadow.camera.right = key.shadow.camera.top = 14;
key.shadow.bias = -0.0005;
scene.add(key);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshStandardMaterial({ color: "#8a7f72", roughness: 0.8 }));
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);
const cols = Math.max(1, Math.min(6, Math.ceil(Math.sqrt(items.length * 1.6))));
const gap = 3.2;
items.forEach((k, i) => {
  let o: THREE.Object3D;
  if (q.has("vox")) {
    o = toObject(MAKE[k](), { shadows: true });
    o.scale.setScalar(0.5);
  } else {
    const v = MAKE[k]() as VoxelModel & { realize?: () => THREE.Object3D };
    if (v.realize) o = v.realize();
    else {
      o = realObject(v);
      o.scale.setScalar(0.5);
    }
  }
  const r = Math.floor(i / cols),
    c = i % cols;
  o.position.set((c - (cols - 1) / 2) * gap, 0, (r - (Math.ceil(items.length / cols) - 1) / 2) * gap);
  o.traverse((m) => ((m as THREE.Mesh).castShadow = true));
  scene.add(o);
});
const rows = Math.ceil(items.length / cols);
const span = Math.max(cols, rows) * gap;
const cam = new THREE.PerspectiveCamera(34, innerWidth / innerHeight, 0.05, 200);
if (view === "front") cam.position.set(0, span * 0.35, span * 1.25);
else if (view === "top") cam.position.set(0, span * 1.4, span * 0.25);
else cam.position.set(span * 0.55, span * 0.6, span * 1.0);
cam.lookAt(0, 0.4, 0);
(window as unknown as { __furnReady: boolean }).__furnReady = false;
setTimeout(() => ((window as unknown as { __furnReady: boolean }).__furnReady = true), 2500);
function frame() {
  renderer.render(scene, cam);
  requestAnimationFrame(frame);
}
frame();
