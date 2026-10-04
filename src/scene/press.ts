import * as THREE from "three";
import { get } from "../data/zscan";

/**
 * The library's news ticker over its door on Transparent Square: the latest Zcash headlines
 * scrolling on an LED band, like the papers' own front page.
 */
export function newsTicker(parent: THREE.Object3D, at: THREE.Vector3, yaw: number, width = 9) {
  const c = document.createElement("canvas");
  c.width = 2048;
  c.height = 112;
  const g = c.getContext("2d")!;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const band = new THREE.Mesh(new THREE.PlaneGeometry(width, (width * c.height) / c.width), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, color: new THREE.Color(1.2, 1.2, 1.2) }));
  band.position.copy(at);
  band.rotation.y = yaw;
  const bezel = new THREE.Mesh(new THREE.BoxGeometry(width + 0.14, (width * c.height) / c.width + 0.14, 0.1), new THREE.MeshStandardMaterial({ color: "#0e0d14", roughness: 0.5, metalness: 0.6 }));
  bezel.position.copy(at).add(new THREE.Vector3(0, 0, -0.06).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw));
  bezel.rotation.y = yaw;
  parent.add(bezel, band);

  let text = "  ZCASH NEWS · news.zscan.cash  ◆";
  const load = () =>
    void get<{ title: string; source_name: string }[]>("/v1/news?limit=15").then((n) => {
      if (n?.length) text = n.map((x) => `  ${x.title.toUpperCase()} — ${x.source_name.toUpperCase()}  ◆`).join("");
    });
  load();
  setInterval(load, 10 * 60_000);

  let x = 0,
    last = 0;
  return {
    update(t: number, dt: number) {
      x -= dt * 130;
      if (t - last < 1 / 20) return;
      last = t;
      g.fillStyle = "#07060a";
      g.fillRect(0, 0, c.width, c.height);
      g.font = '700 58px "JetBrains Mono", monospace';
      const w = g.measureText(text).width;
      if (x < -w) x += w;
      g.fillStyle = "#ffd28a";
      for (let xx = x; xx < c.width; xx += w) g.fillText(text, xx, 76);
      g.fillStyle = "rgba(0,0,0,0.22)";
      for (let y = 0; y < c.height; y += 4) g.fillRect(0, y, c.width, 1);
      tex.needsUpdate = true;
    },
  };
}
