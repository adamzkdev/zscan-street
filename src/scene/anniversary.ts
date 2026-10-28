import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { CURB } from "./city";
import type { Nu7 } from "./nu7";

/** A birthday installation in Transparent Square. All decoration is local, with no API calls. */
export class Anniversary {
  readonly group = new THREE.Group();
  private floats: THREE.Group[] = [];
  private clock = 0;
  private nextParty = 8;
  private reduced = matchMedia("(prefers-reduced-motion: reduce)");

  constructor(scene: THREE.Scene, private fireworks: Nu7) {
    this.group.name = "Zcash · 10 years · 2016–2026";
    scene.add(this.group);
    const gold = new THREE.MeshStandardMaterial({ color: "#ffc84d", metalness: 0.75, roughness: 0.23, emissive: "#be6a08", emissiveIntensity: 0.25 });
    const mint = new THREE.MeshStandardMaterial({ color: "#79f5c6", metalness: 0.45, roughness: 0.28, emissive: "#16785d", emissiveIntensity: 0.25 });
    const pearl = new THREE.MeshStandardMaterial({ color: "#fff5d8", metalness: 0.5, roughness: 0.25 });
    const string = new THREE.LineBasicMaterial({ color: "#e3cf94" });
    const sphere = new THREE.SphereGeometry(0.48, 12, 8);
    const knot = new THREE.ConeGeometry(0.09, 0.13, 6);
    const anchor = new THREE.CylinderGeometry(0.23, 0.32, 0.22, 8);
    const tether = (g: THREE.Group, x: number, y: number, z: number) => {
      const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(), new THREE.Vector3(x - 0.2, y * 0.55, z + 0.18), new THREE.Vector3(x, y, z));
      g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(12)), string));
    };
    // Bouquets on the edges of the square and the downtown promenade, clear of the bus lanes.
    for (const [x, z] of [[-7.5, 11], [7.5, 11], [-7.5, 25], [7.5, 25], [-18, 7], [21, 7]]) {
      const bunch = new THREE.Group();
      bunch.position.set(x, CURB + 0.25, z);
      bunch.add(new THREE.Mesh(anchor, gold));
      const floating = new THREE.Group();
      for (let i = 0; i < 5; i++) {
        const a = i * Math.PI * 2 / 5;
        const bx = Math.cos(a) * 0.72, bz = Math.sin(a) * 0.5, by = 3.6 + (i % 3) * 0.52;
        const material = [gold, mint, pearl][i % 3];
        const balloon = new THREE.Mesh(sphere, material);
        balloon.scale.y = 1.3;
        balloon.position.set(bx, by, bz);
        const tie = new THREE.Mesh(knot, material);
        tie.position.set(bx, by - 0.66, bz);
        floating.add(balloon, tie);
        tether(floating, bx, by - 0.68, bz);
      }
      // Merge each bouquet by material: four draw calls for its balloons, knots and strings.
      const pieces = new Map<THREE.Material, THREE.BufferGeometry[]>();
      const lines: number[] = [];
      for (const object of floating.children) {
        if (object instanceof THREE.Mesh) {
          object.updateMatrix();
          const parts = pieces.get(object.material) ?? [];
          parts.push(object.geometry.clone().applyMatrix4(object.matrix));
          pieces.set(object.material, parts);
        } else if (object instanceof THREE.Line) {
          const points = object.geometry.getAttribute("position");
          for (let j = 1; j < points.count; j++)
            for (const k of [j - 1, j]) lines.push(points.getX(k), points.getY(k), points.getZ(k));
          object.geometry.dispose();
        }
      }
      floating.clear();
      for (const [material, parts] of pieces) {
        floating.add(new THREE.Mesh(mergeGeometries(parts), material));
        parts.forEach((part) => part.dispose());
      }
      const strings = new THREE.BufferGeometry();
      strings.setAttribute("position", new THREE.Float32BufferAttribute(lines, 3));
      floating.add(new THREE.LineSegments(strings, string));
      bunch.add(floating);
      this.floats.push(floating);
      this.group.add(bunch);
    }
    sphere.dispose();
    knot.dispose();

    // Oversized foil number balloons above the fountain; no ground-level obstacle.
    const ten = new THREE.Group();
    ten.position.set(0, CURB + 8, 19);
    const one = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-2.5, 2.5, 0), new THREE.Vector3(-1.8, 3.1, 0),
      new THREE.Vector3(-1.8, 1.6, 0), new THREE.Vector3(-1.8, 0, 0),
    ], false, "centripetal");
    ten.add(new THREE.Mesh(new THREE.TubeGeometry(one, 32, 0.35, 10, false), gold));
    const zero = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.35, 10, 40), gold);
    zero.position.set(0.7, 1.55, 0);
    zero.scale.y = 1.4;
    ten.add(zero);
    for (const x of [-1.8, 0.7]) {
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x, 0, 0), new THREE.Vector3(x * 0.6, -3, 0)]), string);
      ten.add(line);
    }
    const label = document.createElement("canvas");
    label.width = 1024;
    label.height = 320;
    const g = label.getContext("2d")!;
    g.fillStyle = "#121b22";
    g.fillRect(0, 0, 1024, 320);
    g.strokeStyle = "#f5c85b";
    g.lineWidth = 5;
    g.strokeRect(12, 12, 1000, 296);
    g.textAlign = "center";
    g.fillStyle = "#ffe2a0";
    g.font = "800 77px sans-serif";
    g.fillText("10 YEARS OF ZCASH", 512, 108);
    g.fillStyle = "#8cf5d0";
    g.font = "600 44px monospace";
    g.fillText("2016 — 2026", 512, 182);
    g.fillStyle = "#fff7e3";
    g.font = "500 31px sans-serif";
    g.fillText("A DECADE OF FINANCIAL PRIVACY", 512, 254);
    const texture = new THREE.CanvasTexture(label);
    texture.colorSpace = THREE.SRGBColorSpace;
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(7.4, 2.31), new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide, toneMapped: false }));
    panel.position.set(-0.4, -1.6, 0.05);
    ten.add(panel);
    this.group.add(ten);
    this.floats.push(ten);
  }

  update(dt: number, outside: boolean) {
    this.group.visible = outside;
    if (!outside) return;
    this.clock += dt;
    if (this.reduced.matches) return;
    this.floats.forEach((g, i) => {
      g.rotation.z = Math.sin(this.clock * 0.65 + i * 1.7) * 0.025;
      g.rotation.y = Math.sin(this.clock * 0.4 + i) * 0.06;
    });
    if (this.clock >= this.nextParty) {
      // Reuse the city's bounded particle pool. No extra lights, timers or particle systems.
      this.fireworks.party(5);
      this.nextParty = this.clock + 50;
    }
  }
}
