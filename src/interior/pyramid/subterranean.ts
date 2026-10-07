import * as THREE from "three";
import { place } from "../furniture";
import { glowMat, textPlane } from "../kit";
import { bake, Geo } from "./geo";
import type { PyramidKit } from "./kit";
import { SUB_X, SUB_Z } from "./labyrinth";
import { jar, sand, skeleton } from "./models";

/**
 * Level −1: the SUBTERRANEAN CHAMBER. From the entrance gallery's west wall the descending passage
 * drops 5 m down 50 steps cut in the rock, to the unfinished room under the pyramid: rough bedrock
 * walls, a floor left in ridges and trenches, the pit Perring and Vyse dug in 1837 looking for a
 * hidden chamber (they found nothing), a blind passage going nowhere. Built in world coordinates
 * (no offset): it lies west of the entrance gallery, clear of the maze.
 */

export const SUB_LEN = 15,
  SUB_DROP = 5;
const NSTEP = 50,
  SD = SUB_LEN / NSTEP,
  SH = SUB_DROP / NSTEP;
/** The room: x from RX0 to RX1 (the passage comes in on the east wall), z from RZ0 to RZ1. */
const RX1 = SUB_X - SUB_LEN,
  RX0 = RX1 - 11,
  RZ0 = SUB_Z - 4.5,
  RZ1 = SUB_Z + 4.5,
  H = 4.2;
/** The pit: its centre and half-width. */
const PX = RX0 + 5.2,
  PZ = SUB_Z - 2.2,
  PW = 0.95;
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Floor height under (x, z) on this level (the steps, then the room's floor). */
export function subGround(x: number, _z: number) {
  if (x >= SUB_X) return 0;
  return -Math.min(SUB_DROP, Math.ceil((SUB_X - x) / SD - 1e-6) * SH);
}

export function subterranean(k: PyramidKit) {
  const f = 3;
  const Y = k.y(f);
  const g = k.groups[f];
  const rects = k.rects[f];
  const solid = (x0: number, z0: number, x1: number, z1: number) => rects.push([x0, z0, x1, z1]);

  const walls = new Geo(2.4),
    floor = new Geo(2.4),
    ceil = new Geo(2.4),
    rock = new Geo(1.6);

  // ---- the descending passage: steps down, sloping walls and roof
  const z0 = SUB_Z - 0.8,
    z1 = SUB_Z + 0.8,
    PH = 2.55;
  for (let i = 0; i < NSTEP; i++) {
    const top = -SH * (i + 1);
    walls.box(SUB_X - SD * (i + 1), top - SH, z0, SUB_X - SD * i, top, z1, ["bottom", "pz", "nz", "px"], 0.9);
  }
  const down = V(-SUB_LEN, -SUB_DROP, 0),
    tall = V(0, PH + 0.15, 0);
  walls.quad(V(SUB_X, -0.15, z1), down, tall);
  walls.quad(V(SUB_X, -0.15, z0), tall, down);
  ceil.quad(V(SUB_X, PH - 0.15, z0), V(0, 0, 1.6), down);
  solid(SUB_X - SUB_LEN - 0.1, z0 - 0.5, SUB_X + 0.05, z0);
  solid(SUB_X - SUB_LEN - 0.1, z1, SUB_X + 0.05, z1 + 0.5);
  for (let i = 0; i < 3; i++) {
    const x = SUB_X - 3 - i * 5;
    const s = i % 2 ? 1 : -1;
    k.torch(f, V(x, -((SUB_X - x) / SUB_LEN) * SUB_DROP + 1.25, SUB_Z - s * 0.8), V(0, 0, s), -1, 5.5);
  }

  // ---- the room: bedrock, a ragged roof, the walls left rough
  // the floor, round the pit's mouth
  floor.flat(RX0, RZ0, PX - PW, RZ1, Y, true, 0.6);
  floor.flat(PX + PW, RZ0, RX1, RZ1, Y, true, 0.6);
  floor.flat(PX - PW, RZ0, PX + PW, PZ - PW, Y, true, 0.6);
  floor.flat(PX - PW, PZ + PW, PX + PW, RZ1, Y, true, 0.6);
  ceil.flat(RX0, RZ0, RX1, RZ1, Y + H, false, 0.7);
  walls.box(RX0 - 0.6, Y, RZ0, RX0, Y + H, RZ1, ["nx", "bottom", "top"]);
  walls.box(RX0 - 0.6, Y, RZ0 - 0.6, RX1 + 0.6, Y + H, RZ0, ["nz", "bottom", "top"]);
  // east wall, with the passage's mouth
  walls.box(RX1, Y, RZ0, RX1 + 0.6, Y + H, z0, ["px", "bottom", "top"]);
  walls.box(RX1, Y, z1, RX1 + 0.6, Y + H, RZ1, ["px", "bottom", "top"]);
  walls.box(RX1, Y + PH - 0.15, z0, RX1 + 0.6, Y + H, z1, ["px", "top"]);
  solid(RX0 - 0.6, RZ0, RX0, RZ1);
  solid(RX0 - 0.6, RZ0 - 0.6, RX1 + 0.6, RZ0);
  solid(RX1, RZ0, RX1 + 0.6, z0);
  solid(RX1, z1, RX1 + 0.6, RZ1);
  // the roof's rough underside and the walls' unfinished faces: blocks jutting out
  const r = (i: number) => {
    const x = Math.sin(i * 127.1 + 31.7) * 43758.5453;
    return x - Math.floor(x);
  };
  for (let i = 0; i < 26; i++) {
    const x = RX0 + 0.4 + r(i) * 10.2,
      z = RZ0 + 0.4 + r(i + 50) * 8.2;
    const w = 0.6 + r(i + 100) * 1.4,
      d = 0.6 + r(i + 150) * 1.4,
      h = 0.15 + r(i + 200) * 0.6;
    rock.box(x - w / 2, Y + H - h, z - d / 2, x + w / 2, Y + H, z + d / 2, ["top"]);
  }
  // the western half was never levelled: bedrock ridges you walk round
  const ridges: [number, number, number, number, number][] = [
    [RX0, RZ0, RX0 + 2.2, RZ0 + 3.4, 1.5],
    [RX0, RZ0 + 3.4, RX0 + 1.4, RZ1 - 2.2, 1.1],
    [RX0, RZ1 - 2.2, RX0 + 2.8, RZ1, 1.7],
    [RX0 + 2.2, RZ0, RX0 + 4.0, RZ0 + 1.6, 0.8],
    [RX0 + 2.8, RZ1 - 1.2, RX0 + 4.6, RZ1, 0.6],
    [RX0 + 3.4, SUB_Z - 0.7, RX0 + 4.4, SUB_Z + 0.9, 0.45],
  ];
  for (const [ax, az, bx, bz, h] of ridges) {
    rock.box(ax, Y, az, bx, Y + h, bz, ["bottom"]);
    rock.box(ax + 0.2, Y + h, az + 0.2, bx - 0.2, Y + h + 0.25, bz - 0.2, ["bottom"]);
    solid(ax, az, bx, bz);
  }

  // ---- the blind passage: a low tunnel south that goes nowhere
  const BX = RX0 + 6.5;
  floor.flat(BX - 0.6, RZ1, BX + 0.6, RZ1 + 4, Y, true, 0.6);
  ceil.flat(BX - 0.6, RZ1, BX + 0.6, RZ1 + 4, Y + 2.2, false, 0.6);
  walls.box(BX - 1.1, Y, RZ1 + 0.6, BX - 0.6, Y + 2.2, RZ1 + 4, ["nx", "bottom", "top"]);
  walls.box(BX + 0.6, Y, RZ1 + 0.6, BX + 1.1, Y + 2.2, RZ1 + 4, ["px", "bottom", "top"]);
  walls.box(BX - 0.6, Y, RZ1 + 4, BX + 0.6, Y + 2.2, RZ1 + 4.5, ["pz", "bottom", "top"]);
  // the south wall, with the blind passage's doorway
  walls.box(RX0 - 0.6, Y, RZ1, BX - 0.6, Y + H, RZ1 + 0.6, ["pz", "bottom", "top"]);
  walls.box(BX + 0.6, Y, RZ1, RX1 + 0.6, Y + H, RZ1 + 0.6, ["pz", "bottom", "top"]);
  walls.box(BX - 0.6, Y + 2.2, RZ1, BX + 0.6, Y + H, RZ1 + 0.6, ["pz", "top"]);
  solid(RX0 - 0.6, RZ1, BX - 0.6, RZ1 + 0.6);
  solid(BX + 0.6, RZ1, RX1 + 0.6, RZ1 + 0.6);
  solid(BX - 1.1, RZ1 + 0.6, BX - 0.6, RZ1 + 4.5);
  solid(BX + 0.6, RZ1 + 0.6, BX + 1.1, RZ1 + 4.5);
  solid(BX - 0.6, RZ1 + 4, BX + 0.6, RZ1 + 4.5);
  place(g, "pyr-skeleton", skeleton, BX, Y, RZ1 + 3.3, Math.PI);

  // ---- the pit: a square shaft into the dark, a low kerb round it
  const pit = new Geo(1.2);
  pit.box(PX - PW - 0.25, Y, PZ - PW - 0.25, PX + PW + 0.25, Y + 0.35, PZ - PW, ["bottom"]);
  pit.box(PX - PW - 0.25, Y, PZ + PW, PX + PW + 0.25, Y + 0.35, PZ + PW + 0.25, ["bottom"]);
  pit.box(PX - PW - 0.25, Y, PZ - PW, PX - PW, Y + 0.35, PZ + PW, ["bottom"]);
  pit.box(PX + PW, Y, PZ - PW, PX + PW + 0.25, Y + 0.35, PZ + PW, ["bottom"]);
  // the shaft's walls going down
  pit.quad(V(PX - PW, Y - 6, PZ - PW), V(2 * PW, 0, 0), V(0, 6, 0));
  pit.quad(V(PX + PW, Y - 6, PZ + PW), V(-2 * PW, 0, 0), V(0, 6, 0));
  pit.quad(V(PX - PW, Y - 6, PZ + PW), V(0, 0, -2 * PW), V(0, 6, 0));
  pit.quad(V(PX + PW, Y - 6, PZ - PW), V(0, 0, 2 * PW), V(0, 6, 0));
  solid(PX - PW - 0.25, PZ - PW - 0.25, PX + PW + 0.25, PZ + PW + 0.25);
  const bottom = new THREE.Mesh(new THREE.PlaneGeometry(2 * PW, 2 * PW), new THREE.MeshBasicMaterial({ color: "#020101" }));
  bottom.rotation.x = -Math.PI / 2;
  bottom.position.set(PX, Y - 5.9, PZ);
  g.add(bottom);
  // something glints far down
  const glint = new THREE.Sprite(new THREE.SpriteMaterial({ map: k.halo, color: new THREE.Color(1.3, 0.85, 0.25), transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending }));
  glint.position.set(PX + 0.2, Y - 5.6, PZ - 0.1);
  glint.scale.setScalar(0.7);
  glint.raycast = () => {};
  g.add(glint);
  const hit = new THREE.Mesh(new THREE.BoxGeometry(2 * PW + 0.5, 0.5, 2 * PW + 0.5), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
  hit.position.set(PX, Y + 0.2, PZ);
  g.add(hit);
  k.pick(f, hit, "<b>The pit</b><span>dug in 1837 · found nothing</span>", () => ({
    eyebrow: "Subterranean chamber · the pit",
    title: "The pit",
    tag: ["Unfinished", "muted"],
    stats: [
      ["Below the pyramid", "≈ 30 m"],
      ["Dug", "1837"],
    ],
    body: "<p>The lowest room of the Great Pyramid, cut into the bedrock and never finished: its floor was left in ridges, its roof rough. Howard Vyse and John Perring sank this shaft in 1837 hoping for a hidden chamber. There was none. Something still glints down there.</p>",
  }));
  const label = textPlane("SUBTERRANEAN CHAMBER", { h: 0.26, glow: true, color: "#f4b728" });
  label.position.set(RX1 - 0.02, Y + 2.95, SUB_Z);
  label.rotation.y = -Math.PI / 2;
  g.add(label);
  const sill = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.05), glowMat("#ffb050", 1.3));
  sill.rotation.set(-Math.PI / 2, 0, Math.PI / 2);
  sill.position.set(SUB_X - 0.2, -0.09, SUB_Z);
  g.add(sill);

  // ---- light, the odd jar and sand, an explorer at the pit
  k.torch(f, V(RX1, Y + 1.6, SUB_Z - 2.6), V(-1, 0, 0), -1, 7);
  k.torch(f, V(RX1, Y + 1.6, SUB_Z + 2.6), V(-1, 0, 0), -1, 7);
  k.torch(f, V(RX0 + 8, Y + 1.6, RZ0), V(0, 0, 1), -1, 7);
  k.torch(f, V(BX - 2.2, Y + 1.6, RZ1), V(0, 0, -1), -1, 6);
  k.glow(f, V(PX, Y + 0.8, PZ), new THREE.Color(0.5, 0.3, 0.12), 3.5);
  place(g, "pyr-jar2", () => jar(2, false), RX1 - 0.6, Y, RZ0 + 0.7, 0.4);
  solid(RX1 - 1.0, RZ0, RX1, RZ0 + 1.1);
  place(g, "pyr-sand0", () => sand(0), RX0 + 7.5, Y, SUB_Z + 2.8, 1.2);
  place(g, "pyr-sand1", () => sand(1), RX1 - 2.5, Y, SUB_Z - 3.3, 0.3);
  void k.person(f, 1837, [PX + 1.9, PZ + 1.4], "Archaeologist", { y: Y, face: V(-1, 0, -0.6).normalize() });

  const light = bake(k.torches[f], new THREE.Color(0.17, 0.13, 0.1));
  k.add(f, walls, k.stoneDark, light);
  k.add(f, floor, k.floor, light);
  k.add(f, ceil, k.stoneDark, light);
  k.add(f, rock, k.stoneDark, light);
  k.add(f, pit, k.stoneDark, (p, n) => light(p, n).multiplyScalar(Math.max(0.04, 1 + (p.y - Y) / 3)));
  k.lightUp(f);
}
