import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

/** What the city's glossy things reflect, prefiltered once per theme (PMREM), a few milliseconds. */

const cache = new Map<string, THREE.Texture>();

function emissive(color: THREE.ColorRepresentation, k: number) {
  return new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), side: THREE.DoubleSide, fog: false, toneMapped: false });
}

/**
 * The studio room the city has always been lit by (its soft, neutral fill is the look), with what
 * the city adds for the glossy things to catch: by night neon and lit windows all
 * round low down, and the warm pools of the street lamps.
 */
function build(day: boolean) {
  const s = new RoomEnvironment();
  const rnd = (() => {
    let a = day ? 7 : 11;
    return () => ((a = (a * 16807) % 2147483647) / 2147483647);
  })();
  if (day) {
    // no sun in the reflections: the shadow light already gives every surface its highlight, and a
    // second sun here put a hard white glint on everything glossy
  } else {
    const warm = emissive("#ffcf8a", 6);
    const cool = emissive("#a8d8ff", 5);
    const neons = ["#ff3fa4", "#37e6ff", "#b46cff", "#ffd23a", "#3dff9e"].map((c) => emissive(c, 12));
    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * Math.PI * 2 + rnd() * 0.05;
      const h = 0.8 + rnd() * 3.5;
      const w = 0.3 + rnd() * 0.7;
      const neon = rnd() < 0.22;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(neon ? w * 0.25 : w, h), neon ? neons[Math.floor(rnd() * neons.length)] : rnd() < 0.7 ? warm : cool);
      m.position.set(Math.cos(a) * 14, -1.5 + h / 2 + rnd() * 1.5, Math.sin(a) * 14);
      m.lookAt(0, m.position.y, 0);
      s.add(m);
    }
    for (let i = 0; i < 12; i++) {
      const a = rnd() * Math.PI * 2;
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), emissive("#ffb46b", 30));
      l.position.set(Math.cos(a) * 10, 0.5 + rnd() * 1.5, Math.sin(a) * 10);
      s.add(l);
    }
  }
  return s;
}

export function cityEnvironment(renderer: THREE.WebGLRenderer, day: boolean) {
  const key = day ? "day" : "night";
  let t = cache.get(key);
  if (!t) {
    const pm = new THREE.PMREMGenerator(renderer);
    const scene = build(day);
    t = pm.fromScene(scene, 0.04).texture;
    pm.dispose();
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mat = m.material as THREE.MeshBasicMaterial | undefined;
      mat?.dispose();
    });
    cache.set(key, t);
  }
  return t;
}
