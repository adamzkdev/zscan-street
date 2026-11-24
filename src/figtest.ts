// Dev page: the game's zkSNARK figures (src/gta/figure.ts) in a sunlit studio, close up — figtest.html?ids=1192,9703&view=front|three|side|back|walk
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { HDRLoader } from "three/examples/jsm/loaders/HDRLoader.js";
import { debugArt, faces } from "./gta/faces";
import { SnarkFigure } from "./gta/figure";
import { artOn, snarkRenderer } from "./gta/snarkmat";

const q = new URLSearchParams(location.search);
const ids = (q.get("ids") ?? "1192,9703,5506,42,777").split(",").map(Number);
const view = q.get("view") ?? "three";
const canvas = document.getElementById("c") as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
renderer.setSize(innerWidth, innerHeight, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
snarkRenderer(renderer);
if (q.has("noart")) artOn.value = 0;
const scene = new THREE.Scene();
scene.background = new THREE.Color("#a9c3e6");
const pm = new THREE.PMREMGenerator(renderer);
scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
// the city's own sky in the reflections (public/hdr), as in the game by day
const night = q.has("night");
const skyReady = new Promise<void>((res) =>
  new HDRLoader().load(`/hdr/${night ? "venice_sunset" : "kloofendal_48d_partly_cloudy_puresky"}.hdr`, (eq) => {
    eq.mapping = THREE.EquirectangularReflectionMapping;
    scene.environment = pm.fromEquirectangular(eq).texture;
    scene.environmentIntensity = night ? 0.15 : 0.5;
    res();
  }, undefined, () => res()),
);
if (night) scene.background = new THREE.Color("#0c1020");
renderer.toneMappingExposure = night ? 0.9 : 1;
scene.add(new THREE.HemisphereLight(night ? "#3a4a7a" : "#cfe2ff", night ? "#151015" : "#6a5a48", night ? 0.35 : 0.9));
const sun = new THREE.DirectionalLight(night ? "#ffc58a" : "#fff1dc", night ? 1.2 : 2.6);
sun.position.set(4, 7, 5);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = sun.shadow.camera.bottom = -6;
sun.shadow.camera.right = sun.shadow.camera.top = 6;
sun.shadow.bias = -0.0004;
scene.add(sun);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ color: "#b8b2aa", roughness: 0.9 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);
const cam = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 0.05, 100);
const figs: SnarkFigure[] = [];
const gap = 1.05;
(async () => {
  faces.want(ids, true);
  for (const id of ids) await faces.wait(id, 15000);
  await skyReady;
  ids.forEach((id, i) => {
    const f = new SnarkFigure(id);
    f.root.position.set((i - (ids.length - 1) / 2) * gap, 0, 0);
    const yaw = view === "front" ? 0 : view === "side" || view === "swim" || view.endsWith("lie") ? Math.PI / 2 : view === "back" ? Math.PI : view === "walk" || view === "run" ? Math.PI / 2 : 0.6;
    f.root.rotation.y = yaw;
    scene.add(f.root);
    figs.push(f);
  });
  const w = ids.length * gap;
  const near = q.has("close") ? 0.62 : 1.15;
  cam.position.set(0, q.has("close") ? 1.05 : 1.2, q.has("close") ? 3.4 : Math.max(2.1, w * near));
  cam.lookAt(0, q.has("close") ? 0.78 : 0.85, 0);
  console.log("verts", figs.map((f) => f.look.head.getAttribute("position").count + f.look.body.getAttribute("position").count).join(","));
  if (q.has("art")) {
    // each look's source cells and what went to the atlas, side by side, the opening drawn
    const c = document.createElement("canvas");
    const S = 8;
    c.width = ids.length * 26 * S * 2 + ids.length * 10;
    c.height = 26 * S;
    Object.assign(c.style, { position: "fixed", left: "0", top: "0", background: "#222", zIndex: "9" });
    const g = c.getContext("2d")!;
    ids.forEach((id, k) => {
      const d = debugArt.get(id);
      if (!d) return;
      for (const [arr, off] of [
        [d.src, 0],
        [d.art, 26 * S],
      ] as const)
        for (let y = 0; y < 26; y++)
          for (let x = 0; x < 26; x++) {
            const v = arr[y * 26 + x];
            if (v < 0) continue;
            g.fillStyle = "#" + v.toString(16).padStart(6, "0");
            g.fillRect(k * (52 * S + 10) + off + x * S, y * S, S, S);
          }
      g.strokeStyle = "#0f0";
      g.beginPath();
      g.ellipse(k * (52 * S + 10) + 26 * S + d.opening.x * S, d.opening.y * S, d.opening.rx * S, d.opening.ry * S, 0, 0, Math.PI * 2);
      g.stroke();
    });
    document.body.append(c);
  }
  (window as unknown as { __figReady: boolean }).__figReady = true;
})();
let last = performance.now();
function frame() {
  const now = performance.now();
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  for (const f of figs) {
    if (view === "swim" || view === "tread") f.act.swim = 1;
    if (view === "back-lie") f.act.lie = 1;
    if (view === "front-lie") f.act.lie = 2;
    if (view === "sit") f.act.seat = 0.03;
    f.update(dt, { speed: view === "walk" || view === "swim" ? 1.4 : view === "run" ? 5.5 : 0, grounded: true });
  }
  renderer.render(scene, cam);
  requestAnimationFrame(frame);
}
frame();
addEventListener("resize", () => {
  renderer.setSize(innerWidth, innerHeight, false);
  cam.aspect = innerWidth / innerHeight;
  cam.updateProjectionMatrix();
});
