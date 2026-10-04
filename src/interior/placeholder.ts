import * as THREE from "three";
import { makeScene, room, std, textPlane } from "./kit";
import type { Interior } from "./types";

/** A bare room standing in for a place that is still being fitted out. */
export function placeholder(renderer: THREE.WebGLRenderer, key: Interior["key"], title: string): Interior {
  const scene = makeScene(renderer);
  const rects = room(scene, { x0: -8, z0: -12, x1: 8, z1: 0, h: 4, floor: std("#2a2830"), wall: std("#3a3644"), ceiling: std("#1a1820"), door: [-1, 1] });
  const sign = textPlane(title, { h: 0.6, glow: true });
  sign.position.set(0, 2.4, -11.85);
  scene.add(sign, new THREE.PointLight("#ffe0b0", 20, 20));
  return {
    key,
    title,
    scene,
    floors: [{ label: "G", name: "Ground floor", y: 0, spawn: new THREE.Vector3(0, 0, -1.5), yaw: 0 }],
    colliders: () => rects,
    pickables: () => [],
    pick: () => null,
    update: () => {},
  };
}
