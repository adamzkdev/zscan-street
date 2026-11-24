// Dev page: the realistic vehicles (src/scene/real/cars.ts) in a sunlit studio under an HDR sky —
// carstest.html?kinds=sedan,taxi&view=three|front|side|back|top&hdr=kloofendal_48d_partly_cloudy_puresky&night
import * as THREE from "three";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";
import { carLamps } from "./scene/real/carkit";
import { bikeObject, busObject, carObject, carSize, type CarKind } from "./scene/real/cars";
import { BUS, BUS_SEATS } from "./scene/voxel/vehicles";

const q = new URLSearchParams(location.search);
const kinds = (q.get("kinds") ?? "sedan,taxi,police,sports,gt,convertible,suv,pickup,van,limo,ambulance,truck").split(",") as CarKind[];
const view = q.get("view") ?? "three";
const night = q.has("night");
const canvas = document.getElementById("c") as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
renderer.setSize(innerWidth, innerHeight, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = night ? 0.6 : 1;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
const pm = new THREE.PMREMGenerator(renderer);
new RGBELoader().load(`/hdr/${q.get("hdr") ?? "kloofendal_48d_partly_cloudy_puresky"}.hdr`, (t) => {
  t.mapping = THREE.EquirectangularReflectionMapping;
  scene.environment = pm.fromEquirectangular(t).texture;
  scene.background = night ? new THREE.Color("#0a0c14") : t;
  scene.environmentIntensity = night ? 0.25 : 1;
  (window as unknown as { __carsReady: boolean }).__carsReady = true;
});
carLamps(night ? 1 : 0);
const sun = new THREE.DirectionalLight("#fff1dc", night ? 0.2 : 2.6);
sun.position.set(6, 9, 7);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = sun.shadow.camera.bottom = -22;
sun.shadow.camera.right = sun.shadow.camera.top = 22;
sun.shadow.bias = -0.0004;
scene.add(sun);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), new THREE.MeshStandardMaterial({ color: "#4a4a4e", roughness: 0.9 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);
const cols = Math.min(4, kinds.length);
const gapX = 7.4,
  gapZ = 7.2;
const PAINT: Record<string, object> = { sedan: { paint: "#2a4a7a" }, taxi: { paint: "#f2c230" }, police: { paint: "#141418", accent: "#f2f2ee" }, sports: { paint: "#d62f2f", glow: "#3ef0ff" }, gt: { paint: "#e8a91c", accent: "#141418", glow: "#f4b728" }, convertible: { paint: "#2ec4b6", seats: "#e8dcc8" }, suv: { paint: "#16161c" }, pickup: { paint: "#9aa0a8", load: true }, van: { paint: "#f2f2ee", accent: "#ff3e8a" }, limo: { paint: "#0e0e14" }, ambulance: { paint: "#f4f2f6", accent: "#d0202a" }, truck: { livery: "#5a3a8a", label: "proof" } };
kinds.forEach((k, i) => {
  const c = (k as string) === "bus" ? busObject(BUS, BUS_SEATS) : (k as string) === "moto" ? bikeObject("moto", { paint: "#e8a91c", accent: "#141418" }) : (k as string) === "scooter" ? bikeObject("scooter", { paint: "#c0303a", accent: "#f4b728" }) : carObject(k, PAINT[k] ?? {});
  const r = Math.floor(i / cols),
    col = i % cols;
  const yaw = view === "front" ? -Math.PI / 2 : view === "back" ? Math.PI / 2 : view === "side" ? 0 : -0.75;
  c.rotation.y = yaw;
  c.position.set((col - (cols - 1) / 2) * gapX, 0, (r - (Math.ceil(kinds.length / cols) - 1) / 2) * gapZ * (view === "side" ? 1.4 : 1));
  scene.add(c);
  if ((k as string) !== "bus" && (k as string) !== "moto" && (k as string) !== "scooter") void carSize(k);
});
const rows = Math.ceil(kinds.length / cols);
const cam = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 0.1, 400);
if (view === "top") {
  cam.position.set(0, 30, 0.1);
  cam.lookAt(0, 0, 0);
} else {
  const dist = kinds.length === 1 ? 7.5 : Math.max(9, cols * 6.4 + rows * 3);
  cam.position.set(0, q.has("low") ? 1.4 : dist * 0.32, dist);
  cam.lookAt(0, 0.6, 0);
}
function frame() {
  renderer.render(scene, cam);
  requestAnimationFrame(frame);
}
frame();
