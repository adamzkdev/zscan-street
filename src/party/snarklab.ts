/**
 * The zkSNARK bodies on their own (partylab.html?snarks[=id,id,…][&night]): a row of players close
 * up (idle, running, jumping, cheering, waving, hit), a crowd behind them, the camera slowly round.
 * For checking the voxel bodies (scene/snarkbody.ts) and their animations; window.lab.done when
 * every body's art is in.
 */
import * as THREE from "three";
import { Avatar, Fx3, world } from "./k3";
import { makePlayer } from "./kit";
import { SnarkCrowd, preloadSnarks } from "../scene/snarkbody";

export async function snarkLab(root: HTMLElement, q: URLSearchParams) {
  const ids = (q.get("snarks") || "4071,1337,77,9001,1234,42").split(",").map(Number).filter((n) => n > 0);
  await preloadSnarks(ids, 8000);
  const w = world({ night: q.has("night") });
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio));
  renderer.setSize(root.clientWidth || innerWidth, root.clientHeight || innerHeight);
  renderer.shadowMap.enabled = true;
  root.append(renderer.domElement);
  w.camera.aspect = (root.clientWidth || innerWidth) / (root.clientHeight || innerHeight);
  w.camera.updateProjectionMatrix();
  w.sun.castShadow = true;
  w.sun.shadow.mapSize.set(2048, 2048);
  Object.assign(w.sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12 });
  const ground = new THREE.Mesh(new THREE.CircleGeometry(16, 48), new THREE.MeshToonMaterial({ color: "#6fbf73" }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  w.scene.add(ground);
  const avs = ids.map((id, i) => {
    const a = new Avatar(w.scene, makePlayer(i % 4, id, i === 0, 0.5), { marker: i === 0 });
    a.pos.set((i - (ids.length - 1) / 2) * 1.6, 0, 0);
    a.body.root.traverse((o) => ((o as THREE.Mesh).isMesh && !o.userData.noShadow ? ((o.castShadow = true), (o.receiveShadow = true)) : 0));
    return a;
  });
  const crowd = new SnarkCrowd(w.scene);
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * Math.PI * 1.2 - Math.PI * 0.6 + Math.PI;
    crowd.add([211, 1448, 2685, 3922, 5159, 6396][k % 6], Math.sin(a) * 9, 0, Math.cos(a) * 9, a + Math.PI, 1);
  }
  crowd.build();
  const fx = new Fx3(w.scene);
  const lab = (window as unknown as { lab: Record<string, unknown> }).lab;
  lab.snarks = ids.length;
  let t = 0;
  let last = performance.now();
  const cam = q.get("cam");
  const loop = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    t += dt;
    avs.forEach((a, i) => {
      const mode = i % 6;
      if (mode === 1) {
        // running on the spot (the legs read the speed)
        a.legs = 6;
        a.yaw = Math.sin(t * 0.6) * 0.3;
      } else if (mode === 2) {
        if (a.grounded && t % 1.6 < dt) a.jump(9);
        a.physics(dt, 0);
      } else if (mode === 3 && t % 2.4 < dt) a.cheer(2);
      else if (mode === 4 && t % 2.2 < dt) a.body.wave(1.8);
      else if (mode === 5 && t % 1.8 < dt) a.hit();
      a.sync(dt, t);
    });
    crowd.update(dt);
    fx.update(dt);
    if (cam === "close") {
      w.camera.position.set(Math.sin(t * 0.25) * 2.2, 1.5, 3.2);
      w.camera.lookAt(0, 0.85, 0);
    } else {
      w.camera.position.set(Math.sin(t * 0.15) * 7, 3, Math.cos(t * 0.15) * 7 + 2);
      w.camera.lookAt(0, 0.9, 0);
    }
    renderer.render(w.scene, w.camera);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  setTimeout(() => (lab.done = true), 1500);
}
