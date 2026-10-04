import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type { Rect } from "./types";

/** Shared pieces for the interiors: a lit scene, rooms with collidable walls, signs. */

let env: THREE.Texture | null = null;

/** An interior scene: dark background, a soft studio environment, a fill light. */
export function makeScene(renderer: THREE.WebGLRenderer, bg = "#0b0a10") {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(bg);
  if (!env) env = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = env;
  scene.environmentIntensity = 0.35;
  scene.add(new THREE.HemisphereLight("#ffffff", "#2a2630", 0.9));
  return scene;
}

export function box(parent: THREE.Object3D, w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y + h / 2, z);
  m.castShadow = m.receiveShadow = false;
  parent.add(m);
  return m;
}

/** A solid wall segment from (x0, z0) to (x1, z1), axis-aligned; returns its collider. */
export function wall(parent: THREE.Object3D, x0: number, z0: number, x1: number, z1: number, h: number, mat: THREE.Material, y = 0, t = 0.2): Rect {
  const w = Math.max(Math.abs(x1 - x0), t),
    d = Math.max(Math.abs(z1 - z0), t);
  box(parent, w, h, d, mat, (x0 + x1) / 2, y, (z0 + z1) / 2);
  return [Math.min(x0, x1) - (x0 === x1 ? t / 2 : 0), Math.min(z0, z1) - (z0 === z1 ? t / 2 : 0), Math.max(x0, x1) + (x0 === x1 ? t / 2 : 0), Math.max(z0, z1) + (z0 === z1 ? t / 2 : 0)];
}

/**
 * Floor plate and ceiling of a rectangular room; walls around it with an optional door gap on +z,
 * or none on +z at all (`open`: a shop window goes there; it still blocks the walker).
 */
export function room(parent: THREE.Object3D, o: { x0: number; z0: number; x1: number; z1: number; y?: number; h: number; floor: THREE.Material; wall: THREE.Material; ceiling?: THREE.Material; door?: [number, number]; open?: boolean }): Rect[] {
  const y = o.y ?? 0;
  const W = o.x1 - o.x0,
    D = o.z1 - o.z0;
  const f = new THREE.Mesh(new THREE.PlaneGeometry(W, D), o.floor);
  f.rotation.x = -Math.PI / 2;
  f.position.set((o.x0 + o.x1) / 2, y, (o.z0 + o.z1) / 2);
  parent.add(f);
  if (o.ceiling) {
    const c = new THREE.Mesh(new THREE.PlaneGeometry(W, D), o.ceiling);
    c.rotation.x = Math.PI / 2;
    c.position.set((o.x0 + o.x1) / 2, y + o.h, (o.z0 + o.z1) / 2);
    parent.add(c);
  }
  const rects: Rect[] = [wall(parent, o.x0, o.z0, o.x1, o.z0, o.h, o.wall, y), wall(parent, o.x0, o.z0, o.x0, o.z1, o.h, o.wall, y), wall(parent, o.x1, o.z0, o.x1, o.z1, o.h, o.wall, y)];
  if (o.open) rects.push([o.x0, o.z1 - 0.1, o.x1, o.z1 + 0.1]);
  else if (o.door) {
    rects.push(wall(parent, o.x0, o.z1, o.door[0], o.z1, o.h, o.wall, y), wall(parent, o.door[1], o.z1, o.x1, o.z1, o.h, o.wall, y));
    // the doorway itself stays shut: you leave with Exit, not by walking out
    rects.push([o.door[0], o.z1 - 0.1, o.door[1], o.z1 + 0.1]);
  } else rects.push(wall(parent, o.x0, o.z1, o.x1, o.z1, o.h, o.wall, y));
  return rects;
}

/** A flat sign with text, as a mesh (canvas texture). Height in metres; width follows the text. */
export function textPlane(text: string, o: { h: number; color?: string; bg?: string; font?: string; glow?: boolean }) {
  const c = document.createElement("canvas");
  const ctx = c.getContext("2d")!;
  const font = o.font ?? '700 96px "JetBrains Mono", Menlo, monospace';
  ctx.font = font;
  const w = Math.ceil(ctx.measureText(text).width) + 48;
  c.width = w;
  c.height = 128;
  if (o.bg) {
    ctx.fillStyle = o.bg;
    ctx.fillRect(0, 0, c.width, c.height);
  }
  ctx.font = font;
  ctx.textBaseline = "middle";
  ctx.fillStyle = o.color ?? "#f4b728";
  if (o.glow) {
    ctx.shadowColor = o.color ?? "#f4b728";
    ctx.shadowBlur = 18;
  }
  ctx.fillText(text, 24, 68);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  const m = new THREE.Mesh(new THREE.PlaneGeometry((o.h * c.width) / c.height, o.h), new THREE.MeshBasicMaterial({ map: t, transparent: !o.bg, toneMapped: !o.glow }));
  return m;
}

/** Emissive strip (neon, light panel). */
export function glowMat(color: string, k = 2) {
  return new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), toneMapped: false });
}

export function std(color: string, roughness = 0.8, metalness = 0.05) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}
