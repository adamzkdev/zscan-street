/**
 * The board in 3D: the islands, paths and spaces from the map's data, the landmarks, the sunset
 * sky over a sea of clouds, the four zkSNARKs and everything that moves on the board: the
 * GENESIS Z-BLOCK, the dice blocks, THE TRACKER ("shor" in the code), the ZEC LINE's train, the drawbridge, the hash wheel,
 * the junction arrows, the finality locks. The game (game.ts) tells it what to do and waits.
 *
 * Draw calls stay low: the scenery is batched by Vox (a few instanced draws for hundreds of
 * pieces), the spaces are instanced by kind. Nothing is allocated per frame.
 */
import * as THREE from "three";
import type { Player } from "../kit";
import { Avatar, CamRig, Fx3, GEO, blob, canvasTex, disposeScene, glow, label, outline, qBlock, skyline, toScreen, toon, toonSteps, world, type World } from "../k3";
import type { Graph } from "./core";
import type { MapDef } from "./maps";
import { Ground, INK_C, KEEP, KIND_C, SHAPES, Vox, buildLandmark, cloudSea, diceFace, fences, glowTex, halo, inside, island, spaceTops, truss, type Moving } from "./props";
import { Falls, Painter, Pools, Water, Words, cliffs, harbour, highClouds, lamp, roads, skyDome, styleOf, terraces, type Kit, type MapArt, type Style } from "./decor";
import { artOf } from "./art";
import { Life } from "./life";

const UP = new THREE.Vector3(0, 1, 0);
/** The snarks a bit bigger than life on the board (readable from the turn's camera). */
export const AV = 1.3;
/** The dice blocks' height over the space. */
const DICE_Y = 1.6 * AV + 1.55;
/** A space's disc: how tall (its top is where the snarks stand). */
const SPACE_H = 0.3;
const WHITE = new THREE.Color("#ffffff");
/** The Z-Block's beam: its three shafts' opacity, core to halo. */
const BEAM_OP = [0.65, 0.3, 0.13];
/** The Z-Block floats this high over its space's top. */
const Q_UP = 2.7;
const tv = new THREE.Vector3();
const tv2 = new THREE.Vector3();
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));

type MoveKind = "hop" | "zip" | "fly" | "warp";
interface Motion {
  kind: MoveKind;
  t: number;
  dur: number;
  a: THREE.Vector3;
  b: THREE.Vector3;
  h: number;
  spin: boolean;
}

interface Die {
  mesh: THREE.Mesh;
  mat: THREE.MeshToonMaterial;
  v: number;
  spin: boolean;
  t: number;
  /** Shown (0…1 pop in), and going (shrinking away). */
  k: number;
  gone: boolean;
}

export type CamMode = "follow" | "shot" | "map" | "track";

export class BoardView {
  readonly w: World;
  readonly av: Avatar[];
  readonly fx: Fx3;
  readonly cam: CamRig;
  /** Where each seat stands (a space), and who walks now (to the middle of the space). */
  readonly at: number[];
  walker = -1;
  private mv: (Motion | null)[] = [null, null, null, null];
  private ink: THREE.MeshBasicMaterial;
  private islandMat: THREE.MeshToonMaterial;
  private spaceObjs: THREE.Object3D[] = [];
  private moving: Moving = { gears: [], beams: [], blink: [], blimps: [], smoke: [], falls: [], toll: [], lights: [] };
  private t = 0;
  /** The board alive (crowd, birds, boats, flags…) and its water. */
  readonly life: Life;
  /** Its look, and its own art module (board/art/<key>.ts), if any. */
  readonly style: Style;
  readonly art: MapArt | null;
  private water: Water;
  private falls: Falls;
  private words: Words;
  private qPool: THREE.Mesh;
  private qBeamMats: THREE.MeshBasicMaterial[] = [];
  /** A ring popping off a space someone lands on. */
  private pop: THREE.Mesh;
  private popT = 1;
  private qSpark = 0;
  private seaTex: THREE.Texture;
  // the Z-Block
  readonly q: THREE.Group;
  private qBox: THREE.Mesh;
  private qBeam: THREE.Group;
  private qRing: THREE.Mesh;
  private qShadow: THREE.Mesh;
  qAt = -1;
  private qFly: { t: number; dur: number; a: THREE.Vector3; b: THREE.Vector3; h: number } | null = null;
  private qGrab: { t: number; seat: number } | null = null;
  qHidden = true;
  // the dice blocks
  private dice: Die[] = [];
  private diceSeat = -1;
  // THE TRACKER
  readonly shor: THREE.Group;
  private shorEye: THREE.Group;
  private shorPupil: THREE.Object3D;
  private shorLid: THREE.Object3D;
  private shorAura: THREE.Sprite;
  private shorK = 0;
  private shorWant = 0;
  private shorSeat = 0;
  shorLaugh = 0;
  private zap: THREE.Mesh;
  private zapT = 0;
  // the metro
  private curve: THREE.CatmullRomCurve3 | null = null;
  private curveLen = 1;
  private cars: THREE.Group[] = [];
  private carBody: number[] = [];
  private trainU = 0;
  private trainGo: { t: number; dur: number; a: number; b: number } | null = null;
  private stationU = new Map<number, number>();
  rider = -1;
  /** Seats held standing at a point off the board once their move ends (NU7 QUARTER: on top of the NU7 TOWER's crown); null: free. */
  readonly hold: (THREE.Vector3 | null)[] = [null, null, null, null];
  // the drawbridge
  private leaves: THREE.Group[] = [];
  private bridgeK = 0;
  bridgeWant = 0;
  // the hash wheel
  private wheel: THREE.Group | null = null;
  private wheelA = 0;
  private wheelSpin: { t: number; dur: number; a: number; b: number } | null = null;
  // the arrows at a junction
  private arrows: THREE.Group[] = [];
  private arrowSel = -1;
  // the locks
  private locks = new Map<number, THREE.Group>();
  // the camera
  mode: CamMode = "shot";
  followSeat = 0;
  zoom = 1;
  readonly shotEye = new THREE.Vector3(0, 40, 60);
  readonly shotAt = new THREE.Vector3(0, 0, 0);
  track: (() => THREE.Vector3) | null = null;
  camK = 3.2;
  private zipCable: [THREE.Vector3, THREE.Vector3] | null = null;
  private smokeT = 0;
  private tollLift = 0;

  constructor(
    readonly map: MapDef,
    readonly g: Graph,
    readonly players: Player[],
    rnd: () => number,
  ) {
    // (the board's look: its ArtStyle over GENESIS HARBOR's sunset; its own art module, if any)
    const st = (this.style = styleOf(map));
    this.art = artOf(map.key);
    this.w = world({ sky: map.sky, fog: [st.fog[1], st.fog[2]], fov: 46 });
    const s = this.w.scene;
    if (s.fog) (s.fog as THREE.Fog).color.set(st.fog[0]);
    this.w.hemi.color.set(st.hemi[0]);
    this.w.hemi.groundColor.set(st.hemi[1]);
    this.w.hemi.intensity = st.hemi[2];
    this.w.sun.color.set(st.key[0]);
    this.w.sun.intensity = st.key[1];
    this.w.sun.position.set(...st.key[2]);
    this.ink = new THREE.MeshBasicMaterial({ color: INK_C, side: THREE.BackSide });
    this.islandMat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonSteps() });
    // the sky: a dome of sunset bands and first stars, a low sun, the far city rising out of the clouds, the cloud sea
    const sunAt = new THREE.Vector3(-170, 30, -330);
    s.add(skyDome(sunAt, st));
    const sunGlow = halo(map.sun, 260, 0.75);
    sunGlow.position.copy(sunAt);
    (sunGlow.material as THREE.SpriteMaterial).fog = false;
    const sunCore = halo("#fff1d6", 70, 1);
    sunCore.position.set(-170, 30, -329);
    (sunCore.material as THREE.SpriteMaterial).fog = false;
    s.add(sunGlow, sunCore);
    // (a rim of sunset pink from behind, on top of the warm key light)
    const rim = new THREE.DirectionalLight(st.rim[0], st.rim[1]);
    rim.position.set(-70, 38, -130);
    s.add(rim, rim.target);
    if (st.city !== "none") skyline(s, { r: 340, n: 90, y: -52, tall: 1.5, night: st.city === "night", rnd });
    const sea = cloudSea(s, map.sea, rnd, st.puffs);
    this.seaTex = sea.tex;
    const high = highClouds(rnd, st.clouds);
    s.add(high);
    // the islands, their painted ground
    for (const d of map.islands) s.add(island(d, rnd, this.islandMat));
    const paint = new Painter();
    s.add(paint.tops(map.islands));
    const v = new Vox(this.ink);
    this.words = new Words();
    this.water = new Water(st);
    this.falls = new Falls();
    const pools = new Pools();
    this.life = new Life(this.ink, v);
    this.life.drift(sea.puffs);
    this.life.drift(high);
    // the paths' segments (the ground keeps clear of them)
    const segs: [number, number, number, number][] = [];
    const paintSegs: [number, number, number, number, boolean][] = [];
    const lamps: [number, number][] = [];
    for (const sp of g.spaces)
      for (const e of sp.next) {
        if (e.zip) continue;
        const b = g.spaces[e.to];
        segs.push([sp.x, sp.z, b.x, b.z]);
        paintSegs.push([sp.x, sp.z, b.x, b.z, !!(sp.pier || b.pier || (sp.bridge && b.bridge))]);
        const yaw = Math.atan2(b.x - sp.x, b.z - sp.z);
        // a lamp post every few steps, beside the way on its far side (lit: it's sunset)
        if (!(sp.pier || b.pier) && sp.i % 3 === 0) {
          const side = Math.sin(yaw) >= 0 ? 1 : -1;
          lamps.push([(sp.x + b.x) / 2 + Math.cos(yaw) * 1.85 * side, (sp.z + b.z) / 2 - Math.sin(yaw) * 1.85 * side]);
        }
      }
    // the pier: planks round its spaces, piles down into the harbour's water
    for (const sp of g.spaces)
      if (sp.pier) {
        v.frame(0, 0, 0, 0);
        v.box("#a8693e", 3.4, 0.36, 3.4, sp.x, -0.14, sp.z, { ry: Math.atan2(sp.x, sp.z), ink: 0.04 });
        for (const [dx, dz] of [
          [1.5, 1.5],
          [-1.5, -1.5],
          [1.5, -1.5],
          [-1.5, 1.5],
        ])
          v.cyl("#7a4a2b", 0.22, 3.2, sp.x + dx, -1.7, sp.z + dz, { ink: 0.02 }, "cyl8");
      }
    // what the landmarks keep for themselves
    const keep: [number, number, number][] = [];
    for (const l of map.landmarks) if (KEEP[l.kind] || l.keep) keep.push([l.x, l.z, l.keep ?? KEEP[l.kind]!]);
    if (map.wheel) keep.push([map.wheel.x, map.wheel.z, 3]);
    // (the ceremony's stage and the camera's way to it)
    if (map.stage) keep.push([map.stage.x, map.stage.z, 4.6], [map.stage.x, map.stage.z + 5.5, 3.8], [map.stage.x, map.stage.z + 10, 3.2]);
    const ground = new Ground(map.islands, segs, keep, g.spaces.map((sp) => [sp.x, sp.z]));
    const kit: Kit = { v, words: this.words, ground, paint, water: this.water, falls: this.falls, pools, life: this.life, parent: s, mv: this.moving, rnd, ink: this.ink, islandMat: this.islandMat, map, g, style: st, art: this.art };
    roads(kit);
    harbour(kit);
    cliffs(v, map.islands, rnd, st);
    // the landmarks, then the set dressing, then the lamps, the woods and gardens last (they fill what is left)
    const late = new Set(["trees", "garden", "woods", "park", "beach", "crowd"]);
    for (const l of map.landmarks) if (!late.has(l.kind)) buildLandmark(l, kit);
    this.art?.build?.(kit);
    for (const [lx, lz] of lamps) {
      if (!ground.land(lx, lz, 0.6) || ground.onPath(lx, lz, 0.4)) continue;
      lamp(kit, lx, lz);
    }
    this.buildMetro(v);
    this.buildBridge(v);
    this.buildWheel(v);
    this.buildZip(v);
    fences(v, map.islands, ground);
    for (const kind of ["park", "woods", "beach", "crowd"]) for (const l of map.landmarks) if (l.kind === kind) buildLandmark(l, kit);
    terraces(kit, st.terraces);
    for (const kind of ["trees", "garden"]) for (const l of map.landmarks) if (l.kind === kind) buildLandmark(l, kit);
    v.build(s);
    this.words.build(s);
    this.water.build(s);
    this.falls.build(s);
    pools.build(s);
    this.life.build(s);
    paint.paint(map, paintSegs, rnd, st);
    // the spaces
    this.buildSpaces();
    // the Z-Block, its beam of light, its ring on the space
    this.q = new THREE.Group();
    this.qBox = qBlock(1.3);
    this.q.add(this.qBox);
    const qh = halo("#ffe27a", 5, 0.7);
    this.q.add(qh);
    s.add(this.q);
    // (the beam: nested shafts fading upward, seen across the board; a pool of gold under it)
    this.qBeam = new THREE.Group();
    const beamTex = canvasTex(4, 128, (gg) => {
      const gr = gg.createLinearGradient(0, 0, 0, 128);
      gr.addColorStop(0, "rgba(255,255,255,0)");
      gr.addColorStop(0.55, "rgba(255,255,255,0.5)");
      gr.addColorStop(1, "rgba(255,255,255,1)");
      gg.fillStyle = gr;
      gg.fillRect(0, 0, 4, 128);
    });
    for (const [r0, r1, op, c] of [
      [0.32, 0.55, 0.65, "#fff8dc"],
      [0.9, 1.35, 0.3, "#ffe27a"],
      [1.9, 2.7, 0.13, "#ffc23f"],
    ] as [number, number, number, string][]) {
      const m = new THREE.MeshBasicMaterial({ map: beamTex, color: c, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
      this.qBeamMats.push(m);
      const sh = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, 90, 24, 1, true), m);
      sh.position.y = 45;
      sh.raycast = () => {};
      this.qBeam.add(sh);
    }
    s.add(this.qBeam);
    this.qPool = new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ map: glowTex(), color: "#ffd23f", transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.qPool.rotation.x = -Math.PI / 2;
    this.qPool.scale.set(7, 7, 1);
    this.qPool.renderOrder = 2;
    s.add(this.qPool);
    this.qRing = new THREE.Mesh(GEO.ring, glow("#ffd23f", 0.85, true));
    this.qRing.rotation.x = -Math.PI / 2;
    this.qRing.renderOrder = 3;
    s.add(this.qRing);
    this.qShadow = blob(0.7);
    s.add(this.qShadow);
    this.q.visible = this.qBeam.visible = this.qRing.visible = this.qShadow.visible = this.qPool.visible = false;
    this.pop = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.5, 40), new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.pop.rotation.x = -Math.PI / 2;
    this.pop.renderOrder = 3;
    this.pop.visible = false;
    s.add(this.pop);
    // THE TRACKER
    const sh = this.buildShor();
    this.shor = sh.root;
    this.shorEye = sh.eye;
    this.shorPupil = sh.pupil;
    this.shorLid = sh.lid;
    this.shorAura = sh.aura;
    this.shor.visible = false;
    s.add(this.shor);
    this.zap = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.35, 1, 8, 1, true), new THREE.MeshBasicMaterial({ color: "#ff4d8a", transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.zap.visible = false;
    s.add(this.zap);
    // the arrows (up to three at a junction)
    for (let k = 0; k < 3; k++) {
      const a = new THREE.Group();
      const shaft = new THREE.Mesh(GEO.box, toon("#ffffff"));
      shaft.scale.set(0.42, 0.22, 1.0);
      shaft.position.z = 0.4;
      outline(shaft, 0.05);
      const head = new THREE.Mesh(GEO.cone, toon("#ffffff"));
      head.rotation.x = Math.PI / 2;
      head.rotation.y = Math.PI / 4;
      head.scale.set(1.3, 0.8, 0.3);
      head.position.z = 1.2;
      outline(head, 0.05);
      a.add(shaft, head);
      a.visible = false;
      s.add(a);
      this.arrows.push(a);
    }
    // the players
    this.at = [0, 1, 2, 3].map(() => g.start);
    this.av = players.map((p) => {
      const a = new Avatar(s, p, { ring: true, scale: AV });
      const sp = g.spaces[g.start];
      a.pos.set(sp.x, sp.y, sp.z);
      a.sync(0);
      return a;
    });
    this.fx = new Fx3(s, 700);
    this.cam = new CamRig(this.w.camera);
    this.cam.set(new THREE.Vector3(70, 60, 90), new THREE.Vector3(0, 0, -10));
    this.cam.apply(0);
  }

  // ---- building ----------------------------------------------------------------------------------

  /** How high space i's disc sits on its ground (a stone plinth; the pier's planks; a leaf's deck). */
  private lift(i: number) {
    const sp = this.g.spaces[i];
    return sp.bridge ? 0.06 : sp.pier ? 0.04 : 0.22;
  }
  /** Where feet stand on space i: its disc's top. */
  floorY(i: number) {
    return this.g.spaces[i].y + this.lift(i) + SPACE_H;
  }

  /**
   * The spaces, chunky candy buttons by kind: a body in the kind's deep colour (inked), a pale glossy
   * rim, a painted top (one atlas for every kind: gloss, bevel, icon); the drawbridge's on its leaves.
   */
  buildSpaces() {
    for (const o of this.spaceObjs) {
      o.parent?.remove(o);
      const im = o as THREE.InstancedMesh;
      if (im.isInstancedMesh) im.dispose();
      if (im.geometry && !im.geometry.userData.shared) im.geometry.dispose();
    }
    this.spaceObjs = [];
    const s = this.w.scene;
    const kinds = Object.keys(KIND_C);
    const mtx = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const flat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
    const ring = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
    const c = new THREE.Color();
    const white = new THREE.Color("#ffffff");
    const groups = new Map<string, { i: number; x: number; y: number; z: number; parent: THREE.Object3D }[]>();
    const add = (key: string, i: number, x: number, y: number, z: number, parent: THREE.Object3D) => {
      let a = groups.get(key);
      if (!a) groups.set(key, (a = []));
      a.push({ i, x, y, z, parent });
    };
    for (const sp of this.g.spaces) {
      if (sp.bridge) {
        const leaf = this.leafOf(sp.z);
        const lz = sp.z - (leaf === 0 ? this.map.drawbridge!.z0 : this.map.drawbridge!.z1);
        add(`${leaf}`, sp.i, 0, this.lift(sp.i), lz, this.leaves[leaf]);
      } else add("main", sp.i, sp.x, sp.y + this.lift(sp.i), sp.z, s);
    }
    if (!this.topMat) {
      const m = new THREE.MeshBasicMaterial({ map: spaceTops(), color: "#f4f0ff" });
      // (a glint sweeping across the board's tops in a slow wave)
      const time = this.life.time;
      m.onBeforeCompile = (sh) => {
        sh.uniforms.uTime = time;
        sh.vertexShader =
          "attribute vec2 aCell;\nvarying vec2 vShine;\n" +
          sh.vertexShader.replace("#include <uv_vertex>", "#include <uv_vertex>\nvMapUv = vMapUv * vec2(0.25, 0.5) + aCell;").replace("#include <project_vertex>", "#include <project_vertex>\nvShine = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xz;");
        sh.fragmentShader = "uniform float uTime;\nvarying vec2 vShine;\n" + sh.fragmentShader.replace("#include <opaque_fragment>", "outgoingLight += vec3(0.32) * pow(max(0.0, sin(uTime * 1.4 - vShine.x * 0.16 - vShine.y * 0.11)), 30.0) * diffuseColor.a;\n#include <opaque_fragment>");
      };
      m.customProgramCacheKey = () => "board-space-top";
      this.topMat = m;
    }
    for (const [, list] of groups) {
      const parent = list[0].parent;
      const n = list.length;
      const base = new THREE.InstancedMesh(GEO.cyl, toon("#ffffff"), n);
      const ink = new THREE.InstancedMesh(GEO.cyl, this.ink, n);
      const rim = new THREE.InstancedMesh(SHAPES.torus, toon("#ffffff"), n);
      const dg = new THREE.CircleGeometry(0.5, 36);
      const cell = new Float32Array(n * 2);
      const top: THREE.InstancedMesh = new THREE.InstancedMesh(dg, this.topMat as THREE.Material, n);
      list.forEach((e, k) => {
        const kind = this.g.spaces[e.i].kind;
        const ki = Math.max(0, kinds.indexOf(kind));
        const yTop = e.y + SPACE_H;
        base.setMatrixAt(k, mtx.compose(tv.set(e.x, e.y + SPACE_H / 2, e.z), q, tv2.set(2.2, SPACE_H, 2.2)));
        base.setColorAt(k, c.set(KIND_C[kind]).multiplyScalar(0.7));
        ink.setMatrixAt(k, mtx.compose(tv.set(e.x, e.y + SPACE_H / 2, e.z), q, tv2.set(2.34, SPACE_H + 0.1, 2.34)));
        rim.setMatrixAt(k, mtx.compose(tv.set(e.x, yTop - 0.01, e.z), ring, tv2.set(2.06, 2.06, 1.6)));
        rim.setColorAt(k, c.set(KIND_C[kind]).lerp(white, 0.6));
        top.setMatrixAt(k, mtx.compose(tv.set(e.x, yTop + 0.012, e.z), flat, tv2.set(1.98, 1.98, 1)));
        cell[k * 2] = (ki % 4) * 0.25;
        cell[k * 2 + 1] = ki < 4 ? 0.5 : 0;
      });
      dg.setAttribute("aCell", new THREE.InstancedBufferAttribute(cell, 2));
      for (const m of [base, ink, rim, top] as THREE.InstancedMesh[]) (m.computeBoundingSphere(), (m.raycast = () => {}), parent.add(m), this.spaceObjs.push(m));
      top.renderOrder = 1;
    }
  }
  private topMat: THREE.MeshBasicMaterial | null = null;

  private leafOf(z: number) {
    const b = this.map.drawbridge!;
    return z > (b.z0 + b.z1) / 2 ? 0 : 1;
  }

  private buildBridge(v: Vox) {
    const b = this.map.drawbridge;
    if (!b) return;
    const L = (b.z0 - b.z1) / 2;
    for (let k = 0; k < 2; k++) {
      const leaf = new THREE.Group();
      const z0 = k === 0 ? b.z0 : b.z1;
      leaf.position.set(b.x, 0, z0);
      const lv = new Vox(this.ink);
      // (leaf 0 reaches toward −z from its hinge, leaf 1 toward +z: built toward −z, turned round)
      const g = new THREE.Group();
      lv.box("#8c87a6", 3.0, 0.4, L - 0.05, 0, -0.2, -L / 2, { ink: 0.04 });
      lv.box("#d9d4f0", 2.4, 0.06, L - 0.1, 0, 0.02, -L / 2);
      truss(lv, L - 0.05, -1.45);
      truss(lv, L - 0.05, 1.45);
      lv.build(g);
      if (k === 1) g.rotation.y = Math.PI;
      leaf.add(g);
      this.w.scene.add(leaf);
      this.leaves.push(leaf);
    }
    // the towers at either end, with their lights
    v.frame(0, 0, 0, 0);
    for (const z of [b.z0 + 0.6, b.z1 - 0.6])
      for (const side of [-1, 1]) {
        v.box("#4b3f74", 0.8, 4.2, 0.8, b.x + side * 2.1, 2.1, z, { ink: 0.05 });
        v.roof("#ff6b35", 1.0, 0.8, 1.0, b.x + side * 2.1, 4.6, z, { ink: 0.04 });
        v.ball("#3ec6ff", 0.22, 0.22, 0.22, b.x + side * 2.1, 3.6, z + (z > b.z0 ? 0.42 : -0.42), { glow: true });
      }
    v.box("#2a1f55", 3.6, 0.7, 0.16, b.x, 4.1, b.z0 + 0.95, { ink: 0.03 });
    for (const sd of [-1, 1]) v.box("#2a1f55", 0.14, 0.14, 1.3, b.x + sd * 1.75, 4.1, b.z0 + 0.6);
    this.words.add("SAPLING BRIDGE", 0.55, b.x, 4.1, b.z0 + 1.05, 0, { w: 3.4 });
  }

  private buildWheel(v: Vox) {
    const wd = this.map.wheel;
    if (!wd) return;
    v.frame(wd.x, 0, wd.z, wd.rot);
    v.box("#2a1f55", 4.4, 0.5, 1.6, 0, 0.25, 0, { ink: 0.05 });
    v.box("#3a2f5c", 0.5, 4.4, 0.5, -1.7, 2.4, -0.3, { rz: -0.25, ink: 0.04 });
    v.box("#3a2f5c", 0.5, 4.4, 0.5, 1.7, 2.4, -0.3, { rz: 0.25, ink: 0.04 });
    // the pointer at the top
    v.cone("#ff3d56", 0.4, 0.9, 0, 7.75, 0.35, { rx: Math.PI, ink: 0.04 });
    const g = new THREE.Group();
    const R = 2.9;
    const tex = wheelTex();
    const face = new THREE.Mesh(new THREE.CircleGeometry(R, 48), new THREE.MeshToonMaterial({ map: tex, gradientMap: toonSteps(), emissive: "#2a1a40" }));
    face.position.z = 0.16;
    const rimM = new THREE.Mesh(GEO.cyl, toon("#ffd23f"));
    rimM.rotation.x = Math.PI / 2;
    rimM.scale.set(R * 2 + 0.3, 0.3, R * 2 + 0.3);
    outline(rimM, 0.05);
    const hub = new THREE.Mesh(GEO.cyl, toon("#ffffff"));
    hub.rotation.x = Math.PI / 2;
    hub.scale.set(0.8, 0.5, 0.8);
    hub.position.z = 0.2;
    g.add(rimM, face, hub);
    // bulbs round the rim (one draw)
    const bv = new Vox(this.ink);
    for (let k = 0; k < 18; k++) {
      const a = (k / 18) * Math.PI * 2;
      bv.ball(k % 2 ? "#fff3c4" : "#ff6b35", 0.11, 0.11, 0.11, Math.cos(a) * (R + 0.05), Math.sin(a) * (R + 0.05), 0.2, { glow: true });
    }
    bv.build(g);
    g.position.set(wd.x, 4.4, wd.z).add(tv.set(Math.sin(wd.rot) * 0.2, 0, Math.cos(wd.rot) * 0.2));
    g.rotation.y = wd.rot;
    g.rotation.order = "YXZ";
    this.w.scene.add(g);
    this.wheel = g;
    this.words.add("HASH WHEEL", 0.5, wd.x + Math.sin(wd.rot) * 0.85, 0.85, wd.z + Math.cos(wd.rot) * 0.85, wd.rot, { bg: "#ff6b35", w: 3.2 });
  }

  private buildZip(v: Vox) {
    const top = this.map.zipTop;
    if (!top) return;
    // the zipline's ends: the Needle's deck, the space it lands on
    for (const sp of this.g.spaces)
      for (const e of sp.next)
        if (e.zip) {
          const b = this.g.spaces[e.to];
          const a = new THREE.Vector3(top[0] + 1.8, top[1] - 0.2, top[2] + 4.6);
          const bb = new THREE.Vector3(b.x + 1.5, 4.2, b.z - 0.4);
          this.zipCable = [a, bb];
          const len = a.distanceTo(bb);
          const mid = a.clone().add(bb).multiplyScalar(0.5);
          const dir = bb.clone().sub(a).normalize();
          const cable = new THREE.Mesh(GEO.cyl, toon("#2a1f55"));
          cable.scale.set(0.09, len, 0.09);
          cable.position.copy(mid);
          cable.quaternion.setFromUnitVectors(UP, dir);
          this.w.scene.add(cable);
          v.frame(0, 0, 0, 0);
          v.box("#3a2f5c", 0.35, 4.6, 0.35, bb.x, 2.3, bb.z, { ink: 0.04 });
          v.box("#ff6b35", 1.0, 0.4, 0.6, bb.x, 4.5, bb.z, { ink: 0.04 });
          this.words.add("ZIPLINE", 0.4, bb.x, 5.1, bb.z + 0.35, 0, { bg: "#ff6b35", w: 2.2 });
        }
  }

  private buildMetro(v: Vox) {
    const m = this.map.metro;
    const map = this.map;
    if (!m) return;
    const pts = m.track.map((p) => new THREE.Vector3(p[0], p[2] ?? m.y, p[1]));
    const curve = new THREE.CatmullRomCurve3(pts, true, "centripetal");
    this.curve = curve;
    this.curveLen = curve.getLength();
    const n = Math.round(this.curveLen / 2.2);
    const P = curve.getSpacedPoints(n);
    v.frame(0, 0, 0, 0);
    for (let i = 0; i < n; i++) {
      const a = P[i],
        b = P[i + 1];
      const len = a.distanceTo(b);
      const yaw = Math.atan2(b.x - a.x, b.z - a.z);
      const mx = (a.x + b.x) / 2,
        mz = (a.z + b.z) / 2,
        my = (a.y + b.y) / 2;
      const pitch = Math.atan2(b.y - a.y, Math.hypot(b.x - a.x, b.z - a.z));
      v.box("#e8e4ff", 1.9, 0.45, len + 0.06, mx, my - 0.3, mz, { ry: yaw, rx: -pitch });
      v.box("#ff6b35", 2.0, 0.14, len + 0.06, mx, my - 0.58, mz, { ry: yaw, rx: -pitch });
      for (const side of [-0.62, 0.62]) v.box("#5a4e8a", 0.16, 0.14, len + 0.06, mx + Math.cos(yaw) * side, my + 0.0, mz - Math.sin(yaw) * side, { ry: yaw, rx: -pitch });
      // pillars where there is land under it
      if (i % 4 === 0 && my > 3 && map.islands.some((isl) => inside(isl.pts, a.x, a.z))) v.cyl("#c4b1fc", 0.35, a.y - 0.5, a.x, (a.y - 0.5) / 2, a.z, { ink: 0.04 }, "cyl8");
    }
    // the stations: a platform by the track nearest each station space, stairs down toward it
    for (const st of this.g.stations) {
      const sp = this.g.spaces[st];
      let best = 0,
        bd = Infinity;
      for (let i = 0; i <= 400; i++) {
        const p = curve.getPointAt(i / 400, tv);
        const d = Math.hypot(p.x - sp.x, p.z - sp.z);
        if (d < bd) ((bd = d), (best = i / 400));
      }
      this.stationU.set(st, best);
      const p = curve.getPointAt(best, new THREE.Vector3());
      const tg = curve.getTangentAt(best, new THREE.Vector3());
      const yaw = Math.atan2(tg.x, tg.z);
      // (the platform on the side toward the space)
      const side = Math.sign((sp.x - p.x) * Math.cos(yaw) - (sp.z - p.z) * Math.sin(yaw)) || 1;
      const py = p.y;
      v.frame(p.x, 0, p.z, yaw);
      v.box("#f6f3ff", 2.4, 0.4, 7.5, side * 2.2, py - 0.3, 0, { ink: 0.04 });
      v.box("#ff6b35", 2.45, 0.12, 7.6, side * 2.2, py - 0.05, 0);
      // (a street-level stop has no roof: nothing tall in the cameras' way)
      if (py > 4) {
        v.box("#3a2f5c", 0.18, 2.6, 0.18, side * 3.2, py + 1.2, -3);
        v.box("#3a2f5c", 0.18, 2.6, 0.18, side * 3.2, py + 1.2, 3);
        v.box("#c4b1fc", 3.0, 0.2, 8, side * 2.4, py + 2.5, 0, { ink: 0.04 });
      }
      const steps = Math.max(2, Math.round(py / 1.1));
      for (let k = 0; k < steps; k++) v.box("#e8e4ff", 1.6, 0.25, 0.6, side * (3.6 + k * 0.55), py - 0.6 - k * ((py - 0.6) / steps), 2.6, { ink: 0.02 });
      if (py > 3) v.cyl("#c4b1fc", 0.3, py - 0.4, side * 2.2, (py - 0.4) / 2, -2.6, { ink: 0.04 }, "cyl8");
      const off = new THREE.Vector3(side * 3.3, py > 4 ? py + 1.6 : py + 0.9, 0).applyAxisAngle(UP, yaw);
      this.words.add(`${m.name} · ${sp.station ?? ""}`, 0.55, p.x + off.x, off.y, p.z + off.z, yaw + (side > 0 ? -Math.PI / 2 : Math.PI / 2), { bg: "#ff6b35", w: 4.2 });
    }
    // the train: three cars (bodies on life's moving batcher: a few draws for the whole train)
    const dv = this.life.dyn;
    for (let k = 0; k < 3; k++) {
      const car = new THREE.Group();
      this.carBody.push(dv.body());
      dv.box("#ffffff", 1.7, 1.5, 4.2, 0, 1.0, 0, { ink: 0.05 });
      dv.box("#ff6b35", 1.74, 0.42, 4.24, 0, 0.45, 0);
      dv.box("#7fd8ff", 1.76, 0.5, 3.4, 0, 1.25, 0, { glow: true });
      for (let w = 0; w < 4; w++) for (const sd of [-1, 1]) dv.box("#ffffff", 0.06, 0.52, 0.12, sd * 0.89, 1.25, -1.35 + w * 0.9);
      dv.box("#c4b1fc", 1.4, 0.18, 3.8, 0, 1.84, 0);
      for (const sd of [-1, 1]) dv.add("cyl8", "#2a2440", 0.5, 0.2, 0.5, sd * 0.7, 0.15, (k === 0 ? 1.4 : 1.5) * 1, { rz: Math.PI / 2 });
      for (const sd of [-1, 1]) dv.add("cyl8", "#2a2440", 0.5, 0.2, 0.5, sd * 0.7, 0.15, -1.5, { rz: Math.PI / 2 });
      if (k === 0) {
        dv.box("#ffffff", 1.6, 1.2, 0.9, 0, 0.85, 2.4, { rx: -0.35, ink: 0.04 });
        dv.add("orb", "#fff6c8", 0.36, 0.36, 0.2, 0.5, 0.6, 2.75, { glow: true });
        dv.add("orb", "#fff6c8", 0.36, 0.36, 0.2, -0.5, 0.6, 2.75, { glow: true });
        dv.box("#ff3d56", 0.9, 0.3, 0.1, 0, 1.55, 2.66, { rx: -0.35 });
      }
      this.cars.push(car);
    }
    this.trainU = 0.1;
  }

  private buildShor() {
    const root = new THREE.Group();
    const v = new Vox(this.ink);
    // the drone rig: four rotor arms, their lit rotors; a mast with a radar dish and a red beacon
    for (const a of [Math.PI / 4, -Math.PI / 4]) v.box("#3a1b66", 4.6, 0.2, 0.32, 0, 2.35, 0, { ry: a, ink: 0.04 });
    for (const [sx, sz] of [
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ]) {
      v.cyl("#2a1450", 0.22, 0.4, sx * 1.6, 2.55, sz * 1.6, { ink: 0.03 }, "cyl8");
      v.cyl("#c9b8ff", 0.95, 0.05, sx * 1.6, 2.8, sz * 1.6, { ink: 0.02 });
      v.add("torus", "#ff8a4c", 2.0, 2.0, 1, sx * 1.6, 2.82, sz * 1.6, { rx: Math.PI / 2, glow: true });
    }
    v.cyl("#2a1450", 0.16, 2.0, 0, 3.3, 0, { ink: 0.03 }, "cyl8");
    v.cyl("#e8e4ff", 0.8, 0.14, 0, 4.0, -0.15, { rx: -0.5, ink: 0.03 });
    v.cyl("#ff8a4c", 0.07, 0.6, 0, 4.25, 0.05, { rx: -0.5, glow: true }, "cyl8");
    v.cone("#ff3d56", 0.25, 0.5, 0, 4.55, 0, { glow: true });
    // the head: a dark violet orb, a jagged grin
    v.ball("#4a2484", 1.55, 1.4, 1.45, 0, 0.9, 0, { ink: 0.07 });
    for (let k = 0; k < 7; k++) v.box("#ffffff", 0.24, 0.3, 0.2, -0.75 + k * 0.25, 0.12 + (k % 2 ? 0.08 : -0.02), 1.3 - Math.abs(k - 3) * 0.07, { rz: k % 2 ? 0.2 : -0.2, ink: 0.02 });
    v.box("#1a0a30", 1.9, 0.18, 0.2, 0, 0.0, 1.25);
    // two cable arms with claws
    for (const side of [-1, 1]) {
      v.cyl("#2a1450", 0.12, 1.8, side * 1.65, 0.0, 0.2, { rz: side * 0.5 }, "cyl8");
      v.box("#ff8a4c", 0.5, 0.18, 0.18, side * 2.1, -0.85, 0.2, { rz: side * 0.6, ink: 0.02 });
      v.box("#ff8a4c", 0.5, 0.18, 0.18, side * 2.1, -0.85, 0.2, { rz: side * -0.6, ink: 0.02 });
    }
    v.build(root);
    // the eye: white, a red iris, a slit pupil, an angry lid
    const eye = new THREE.Group();
    const white = new THREE.Mesh(GEO.ball, toon("#ffffff"));
    white.scale.set(1.1, 0.95, 0.6);
    outline(white, 0.05);
    const iris = new THREE.Mesh(GEO.ball, glow("#ff2d4a"));
    iris.scale.set(0.5, 0.5, 0.2);
    iris.position.z = 0.22;
    const pupil = new THREE.Mesh(GEO.ball, toon("#14051f"));
    pupil.scale.set(0.12, 0.38, 0.1);
    pupil.position.z = 0.3;
    const pupilG = new THREE.Group();
    pupilG.add(iris, pupil);
    const lid = new THREE.Mesh(GEO.box, toon("#2a1450"));
    lid.scale.set(1.5, 0.5, 0.75);
    lid.position.set(0, 0.55, 0.05);
    outline(lid, 0.04);
    eye.add(white, pupilG, lid);
    eye.position.set(0, 1.25, 1.05);
    root.add(eye);
    const aura = halo("#a040ff", 9, 0.55);
    aura.position.y = 1.5;
    root.add(aura);
    const nameplate = label("TRACKER", 0.5, "#ffffff", "#ff3d56");
    nameplate.position.set(0, 3.0, 1.95);
    nameplate.scale.x = 1.7;
    root.add(nameplate);
    return { root, eye, pupil: pupilG, lid, aura };
  }

  // ---- the board's state -------------------------------------------------------------------------

  spacePos(i: number, out = new THREE.Vector3()) {
    const s = this.g.spaces[i];
    return out.set(s.x, s.y, s.z);
  }

  /** Where a seat stands on its space (players sharing one stand round it; the walker in the middle). */
  private standPos(seat: number, out: THREE.Vector3) {
    if (this.ceremony) return out.copy(this.ceremony[seat]);
    const sp = this.at[seat];
    this.spacePos(sp, out).y = this.floorY(sp);
    if (seat === this.walker) return out;
    let n = 0,
      k = 0;
    for (let i = 0; i < 4; i++)
      if (this.at[i] === sp && i !== this.walker) {
        if (i === seat) k = n;
        n++;
      }
    if (this.walker >= 0 && this.at[this.walker] === sp) ((n += 1), (k += 1));
    if (n <= 1) return out;
    const a = (k / n) * Math.PI * 2 + Math.PI / 4;
    return out.add(tv2.set(Math.sin(a) * 1.05, 0, Math.cos(a) * 1.05));
  }

  /** Snap everyone to where they stand. */
  place(pos: number[]) {
    for (let i = 0; i < 4; i++) {
      this.at[i] = pos[i];
      this.mv[i] = null;
      this.standPos(i, this.av[i].pos);
    }
  }

  /** A move of `seat` to space `to` (a hop along the path, a zipline ride, a flight, a warp), `dur` long. */
  move(seat: number, to: number, kind: MoveKind, dur: number, h = 0.5) {
    const a = this.av[seat];
    const target = new THREE.Vector3();
    this.at[seat] = to;
    this.standPos(seat, target);
    this.mv[seat] = { kind, t: 0, dur, a: a.pos.clone(), b: target, h, spin: kind === "fly" };
    if (kind === "warp") this.fx.burst(tv.copy(a.pos).setY(1), 30, ["#c4b1fc", "#7fd8ff", "#ffffff"], { speed: 5, up: 3 });
  }
  busy(seat: number) {
    return !!this.mv[seat];
  }
  /** A jump to a point off the board (onto the train's roof), its space unchanged. */
  flyTo(seat: number, p: THREE.Vector3, dur: number, h = 2) {
    const a = this.av[seat];
    this.mv[seat] = { kind: "fly", t: 0, dur, a: a.pos.clone(), b: p.clone(), h, spin: false };
  }
  /** The ceremony: everyone lined up here (null: back on their spaces). */
  lineUp(pts: THREE.Vector3[] | null) {
    this.ceremony = pts;
    if (pts) for (let i = 0; i < 4; i++) (this.av[i].pos.copy(pts[i]), (this.mv[i] = null));
  }
  ceremony: THREE.Vector3[] | null = null;

  // ---- the Z-Block -------------------------------------------------------------------------------

  qPos(out = new THREE.Vector3()) {
    return out.copy(this.q.position);
  }
  /** Show it on a space (the first time: dropped from above). */
  qPlace(i: number) {
    this.qAt = i;
    this.qHidden = false;
    this.qFly = null;
    this.qGrab = null;
    this.spacePos(i, this.q.position).y = this.floorY(i) + Q_UP;
  }
  /** It flies from where it is (or the sky) to a new space in an arc. */
  qMove(to: number, dur: number) {
    const a = this.qHidden ? this.spacePos(this.qAt >= 0 ? this.qAt : to, new THREE.Vector3()).setY(26) : this.q.position.clone();
    this.qHidden = false;
    this.qGrab = null;
    this.qAt = to;
    const b = this.spacePos(to, new THREE.Vector3()).setY(this.floorY(to) + Q_UP);
    this.qFly = { t: 0, dur, a, b, h: Math.max(8, a.distanceTo(b) * 0.35) };
  }
  /** The buyer takes it: it flies to their arms and goes. */
  qTake(seat: number) {
    this.qFly = null;
    this.qGrab = { t: 0, seat };
  }

  // ---- the dice ----------------------------------------------------------------------------------

  diceUp(seat: number, n: number, fixed = 0) {
    this.diceDown();
    this.diceSeat = seat;
    for (let k = 0; k < n; k++) {
      const mat = new THREE.MeshToonMaterial({ map: diceFace(fixed || 0), gradientMap: toonSteps() });
      const mesh = new THREE.Mesh(GEO.box, mat);
      outline(mesh, 0.05);
      mesh.scale.setScalar(0.001);
      this.w.scene.add(mesh);
      this.dice.push({ mesh, mat, v: fixed, spin: !fixed, t: Math.random(), k: 0, gone: false });
    }
  }
  /** Die k is hit: it shows v. */
  diceHit(k: number, v: number) {
    const d = this.dice[k];
    if (!d) return;
    d.v = v;
    d.spin = false;
    d.t = 0;
    d.mat.map = diceFace(v);
    const p = d.mesh.position;
    this.fx.burst(p, 26, ["#ffffff", "#ff6b35", "#c4b1fc", this.players[this.diceSeat]?.color ?? "#fff"], { speed: 7, up: 4, size: 0.2 });
    this.cam.shake(0.25);
  }
  /** Where die k is (for the number on the HUD). */
  diePos(k: number, out = new THREE.Vector3()) {
    return out.copy(this.dice[k]?.mesh.position ?? this.av[Math.max(0, this.diceSeat)].pos);
  }
  diceGo() {
    for (const d of this.dice) d.gone = true;
  }
  diceDown() {
    for (const d of this.dice) {
      d.mesh.parent?.remove(d.mesh);
      d.mat.dispose();
    }
    this.dice = [];
    this.diceSeat = -1;
  }
  get diceCount() {
    return this.dice.length;
  }

  // ---- THE TRACKER --------------------------------------------------------------------------------------

  shorIn(seat: number) {
    this.shorSeat = seat;
    this.shorWant = 1;
    if (this.shorK <= 0.01) this.shorK = 0;
    this.shor.visible = true;
  }
  shorOut() {
    this.shorWant = 0;
  }
  /** A zap from THE TRACKER's eye to a seat. */
  shorZap(seat: number) {
    this.zapT = 0.55;
    this.zap.visible = true;
    const a = this.shorEye.getWorldPosition(new THREE.Vector3());
    const b = tv.copy(this.av[seat].pos).setY(this.av[seat].pos.y + 1);
    this.zap.position.copy(a).add(b).multiplyScalar(0.5);
    this.zap.scale.set(1, a.distanceTo(b), 1);
    this.zap.quaternion.setFromUnitVectors(UP, tv2.copy(b).sub(a).normalize());
    this.fx.burst(b, 40, ["#ff4d8a", "#c4b1fc", "#ffffff"], { speed: 7, up: 5 });
    this.cam.shake(0.5);
  }
  shorPos(out = new THREE.Vector3()) {
    return out.copy(this.shor.position);
  }

  // ---- the metro ---------------------------------------------------------------------------------

  private carPos(k: number, out: THREE.Vector3) {
    if (!this.curve) return out.set(0, 0, 0);
    const u = (((this.trainU - (k * 4.7) / this.curveLen) % 1) + 1) % 1;
    return this.curve.getPointAt(u, out);
  }
  /** Drive the train to a station's stop (forward round the loop): how long it takes. */
  trainTo(space: number, speed = 26) {
    const u = this.stationU.get(space);
    if (u === undefined || !this.curve) return 0;
    const d = (((u - this.trainU) % 1) + 1) % 1;
    const dur = Math.max(1.6, Math.min(5, (d * this.curveLen) / speed));
    this.trainGo = { t: 0, dur, a: this.trainU, b: this.trainU + d };
    return dur;
  }
  /** The rider's spot: on the first car's roof. */
  roof(out = new THREE.Vector3()) {
    return this.carPos(0, out).setY(out.y + 1.95);
  }
  trainHas() {
    return !!this.curve;
  }
  /** Out of the way (the ceremony): the train waits at the far side of its loop. */
  parkTrain() {
    this.trainGo = null;
    this.trainU = 0.5;
    this.parked = true;
  }

  // ---- the drawbridge and the toll ---------------------------------------------------------------

  bridgeTo(up: boolean) {
    this.bridgeWant = up ? 1 : 0;
  }
  bridgeSnap(up: boolean) {
    this.bridgeWant = this.bridgeK = up ? 1 : 0;
  }
  tollOpen() {
    this.tollLift = 1.6;
  }

  // ---- the hash wheel ----------------------------------------------------------------------------

  /** Spin to segment k (of six) under the pointer: how long it takes. */
  wheelTo(k: number, dur = 3.4) {
    if (!this.wheel) return 0;
    const want = -k * (Math.PI / 3);
    const a = this.wheelA;
    const TAU = Math.PI * 2;
    const d = (((a - want) % TAU) + TAU) % TAU;
    this.wheelSpin = { t: 0, dur, a, b: a - TAU * 4 - d };
    return dur;
  }
  wheelPos(out = new THREE.Vector3()) {
    return this.wheel ? out.copy(this.wheel.position) : out.set(0, 3, 0);
  }
  wheelFacing() {
    return this.map.wheel?.rot ?? 0;
  }

  // ---- arrows and locks --------------------------------------------------------------------------

  /** Arrows at a junction toward these spaces; `sel` the one picked; null hides them. */
  showArrows(from: number, tos: number[] | null, sel = 0, color = "#ff6b35") {
    for (let k = 0; k < this.arrows.length; k++) {
      const a = this.arrows[k];
      const to = tos?.[k];
      if (to === undefined) {
        a.visible = false;
        continue;
      }
      const f = this.g.spaces[from];
      const t = this.g.spaces[to];
      const yaw = Math.atan2(t.x - f.x, t.z - f.z);
      a.visible = true;
      a.position.set(f.x + Math.sin(yaw) * 1.5, this.floorY(from) + 0.35, f.z + Math.cos(yaw) * 1.5);
      a.rotation.set(0, yaw, 0);
      a.userData.base = a.position.clone();
      a.userData.yaw = yaw;
      const on = k === sel;
      for (const c of a.children) ((c as THREE.Mesh).material = toon(on ? color : "#ffffff"));
    }
    this.arrowSel = sel;
  }
  arrowPos(k: number, out = new THREE.Vector3()) {
    return out.copy(this.arrows[k]?.userData.base ?? this.arrows[k]?.position ?? out);
  }
  /** Past an arrow's tip (where its name goes, clear of the player). */
  arrowTip(k: number, out = new THREE.Vector3()) {
    const a = this.arrows[k];
    if (!a?.userData.base) return out.set(0, 0, 0);
    const yaw = a.userData.yaw as number;
    return out.copy(a.userData.base as THREE.Vector3).add(tv2.set(Math.sin(yaw) * 2.1, 0.2, Math.cos(yaw) * 2.1));
  }

  setLocks(traps: Map<number, number>) {
    for (const [sp, g] of this.locks)
      if (!traps.has(sp)) {
        g.parent?.remove(g);
        for (const c of g.children) ((c as THREE.Mesh).material as THREE.Material).userData.shared || ((c as THREE.Mesh).material as THREE.Material).dispose();
        this.locks.delete(sp);
      }
    for (const [sp, owner] of traps) {
      if (this.locks.has(sp)) continue;
      const g = new THREE.Group();
      const c = this.players[owner].color;
      const body = new THREE.Mesh(GEO.box, toon(c));
      body.scale.set(0.8, 0.65, 0.35);
      outline(body, 0.04);
      const shackle = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.07, 8, 16, Math.PI), toon("#d9d4f0"));
      shackle.position.y = 0.32;
      const key = new THREE.Mesh(GEO.box, toon("#1a1033"));
      key.scale.set(0.12, 0.22, 0.05);
      key.position.set(0, -0.02, 0.18);
      g.add(body, shackle, key);
      this.spacePos(sp, g.position).y += 1.4;
      this.w.scene.add(g);
      this.locks.set(sp, g);
    }
  }

  // ---- the frame ---------------------------------------------------------------------------------

  update(dt: number) {
    this.t += dt;
    const t = this.t;
    // the players' moves
    for (let i = 0; i < 4; i++) {
      const a = this.av[i];
      const m = this.mv[i];
      const hd = this.hold[i];
      if (hd && !m) {
        a.pos.copy(hd);
        a.grounded = true;
        a.vy = 0;
        a.legs = 0;
        a.sync(dt, t);
        continue;
      }
      if (i === this.rider) {
        this.roof(a.pos);
        a.grounded = true;
        a.vy = 0;
        a.legs = 0;
        a.sync(dt, t);
        continue;
      }
      if (m) {
        m.t += dt;
        const k = clamp01(m.t / m.dur);
        if (m.kind === "zip" && this.zipCable) {
          // up to the Needle's deck, then down the cable
          const [top, low] = this.zipCable;
          if (k < 0.35) {
            const f = ease(k / 0.35);
            a.pos.lerpVectors(m.a, top, f);
            a.pos.y += Math.sin(f * Math.PI) * 3;
          } else if (k < 0.88) {
            const f = (k - 0.35) / 0.53;
            a.pos.lerpVectors(top, low, f * f * (1.6 - 0.6 * f));
            a.pos.y -= 1.6 + Math.sin(f * Math.PI) * 1.2;
          } else {
            const f = ease((k - 0.88) / 0.12);
            a.pos.lerpVectors(tv.copy(low).setY(low.y - 1.6), m.b, f);
          }
          a.face(Math.atan2(low.x - top.x, low.z - top.z), dt, 10);
          a.legs = 0;
          a.grounded = false;
          a.vy = -1;
        } else if (m.kind === "warp") {
          const s = k < 0.45 ? 1 - ease(k / 0.45) : k < 0.55 ? 0 : ease((k - 0.55) / 0.45);
          a.body.root.scale.setScalar(Math.max(0.001, s));
          a.pos.copy(k < 0.5 ? m.a : m.b);
          if (k >= 0.5 && m.a.distanceToSquared(m.b) > 0) {
            this.fx.burst(tv.copy(m.b).setY(1), 30, ["#c4b1fc", "#7fd8ff", "#ffffff"], { speed: 5, up: 3 });
            m.a.copy(m.b);
          }
          a.legs = 0;
        } else {
          const f = m.kind === "fly" ? ease(k) : k;
          a.pos.lerpVectors(m.a, m.b, f);
          a.pos.y += Math.sin(k * Math.PI) * m.h;
          const dx = m.b.x - m.a.x,
            dz = m.b.z - m.a.z;
          if (dx * dx + dz * dz > 0.01) a.face(Math.atan2(dx, dz), dt, 16);
          a.grounded = m.kind === "hop";
          a.vy = m.kind === "fly" ? 4 - k * 8 : 0;
          a.legs = m.kind === "hop" ? 7 : 0;
          if (m.spin) a.yaw += dt * 14;
        }
        if (m.t >= m.dur) {
          this.mv[i] = null;
          a.body.root.scale.setScalar(1);
          a.legs = null;
          if (m.kind === "fly") (a.body.land(6), this.fx.burst(tv.copy(m.b).setY(0.3), 16, ["#ffffff", "#e9dcc6"], { speed: 4, up: 2 }));
        }
      } else if (!a.grounded || a.vy !== 0) {
        // a jump (the dice): gravity down to the space
        a.physics(dt, this.floorY(this.at[i]));
      } else {
        this.standPos(i, tv);
        a.pos.x += (tv.x - a.pos.x) * Math.min(1, dt * 8);
        a.pos.z += (tv.z - a.pos.z) * Math.min(1, dt * 8);
        a.pos.y = tv.y;
        a.legs = null;
        if (i !== this.walker) a.face(0, dt, 4);
      }
      a.sync(dt, t);
    }
    // the dice over the roller's head
    if (this.dice.length) {
      const a = this.av[this.diceSeat];
      const n = this.dice.length;
      this.dice.forEach((d, k) => {
        d.t += dt;
        d.k = Math.min(1, d.k + dt * 4);
        if (d.spin && Math.floor(d.t * 14) !== Math.floor((d.t - dt) * 14)) d.mat.map = diceFace(1 + Math.floor(Math.random() * 10));
        const pop = d.gone ? Math.max(0, 1 - d.t * 3) : d.k < 1 ? 1 + Math.sin(d.k * Math.PI) * 0.25 : 1;
        const bounce = !d.spin && !d.gone ? Math.max(0, Math.sin(Math.min(1, d.t * 3) * Math.PI)) * 0.6 : 0;
        d.mesh.scale.setScalar(Math.max(0.001, 1.15 * pop));
        d.mesh.position.set(a.pos.x + (k - (n - 1) / 2) * 1.6, this.floorY(this.at[this.diceSeat]) + DICE_Y + Math.sin(t * 3 + k) * 0.08 + bounce, a.pos.z);
        if (d.spin) d.mesh.rotation.set(Math.sin(t * 2.3 + k) * 0.25, t * 1.6 + k, Math.sin(t * 1.7) * 0.2);
        else {
          d.mesh.rotation.x *= 1 - Math.min(1, dt * 10);
          d.mesh.rotation.z *= 1 - Math.min(1, dt * 10);
          d.mesh.rotation.y += (Math.round(d.mesh.rotation.y / (Math.PI / 2)) * (Math.PI / 2) - d.mesh.rotation.y) * Math.min(1, dt * 10);
        }
      });
    }
    // the Z-Block
    const qOn = !this.qHidden && this.qAt >= 0;
    this.q.visible = qOn || !!this.qGrab;
    if (this.qFly) {
      const f = this.qFly;
      f.t += dt;
      const k = clamp01(f.t / f.dur);
      this.q.position.lerpVectors(f.a, f.b, ease(k));
      this.q.position.y += Math.sin(k * Math.PI) * f.h;
      this.qBox.rotation.y += dt * (4 + Math.sin(k * Math.PI) * 10);
      if (k >= 1) {
        this.qFly = null;
        this.fx.burst(this.q.position, 50, ["#ffd23f", "#fff3c4", "#ffffff"], { speed: 8, up: 5 });
        this.cam.shake(0.35);
      }
    } else if (this.qGrab) {
      const gr = this.qGrab;
      gr.t += dt;
      const a = this.av[gr.seat];
      tv.copy(a.pos).setY(a.pos.y + 1.6 * AV + 1.1 + Math.min(1, gr.t * 2) * 0.6);
      this.q.position.lerp(tv, Math.min(1, dt * 8));
      this.qBox.rotation.y += dt * 9;
      const s = gr.t < 1.2 ? 1 : Math.max(0.001, 1 - (gr.t - 1.2) * 2.5);
      this.q.scale.setScalar(s);
      if (gr.t > 1.6) ((this.qGrab = null), (this.qHidden = true), this.q.scale.setScalar(1));
    } else if (qOn) {
      const sp = this.g.spaces[this.qAt];
      this.q.position.set(sp.x, this.floorY(this.qAt) + Q_UP + Math.sin(t * 2.2) * 0.18, sp.z);
      this.qBox.rotation.y += dt * 1.4;
      this.q.scale.setScalar(1);
    }
    const qStill = qOn && !this.qFly && !this.qGrab;
    this.qBeam.visible = this.qRing.visible = this.qShadow.visible = this.qPool.visible = qStill;
    if (qStill) {
      const sp = this.g.spaces[this.qAt];
      const fy = this.floorY(this.qAt);
      this.qBeam.position.set(sp.x, fy, sp.z);
      this.qBeam.rotation.y = t * 0.6;
      const pulse = 0.82 + Math.sin(t * 3) * 0.18;
      for (let k = 0; k < this.qBeamMats.length; k++) this.qBeamMats[k].opacity = BEAM_OP[k] * pulse;
      this.qRing.position.set(sp.x, fy + 0.03, sp.z);
      this.qRing.scale.setScalar(2.5 + Math.sin(t * 4) * 0.12);
      this.qShadow.position.set(sp.x, fy + 0.02, sp.z);
      this.qPool.position.set(sp.x, Math.max(0.06, sp.y + 0.06), sp.z);
      this.qPool.scale.setScalar(7.5 + Math.sin(t * 3) * 0.6);
      // gold motes rising up the beam
      this.qSpark -= dt;
      if (this.qSpark <= 0) {
        this.qSpark = 0.1;
        const a = Math.random() * Math.PI * 2,
          r = Math.random() * 1.1;
        this.fx.burst(tv.set(sp.x + Math.cos(a) * r, fy + 0.4 + Math.random() * 2, sp.z + Math.sin(a) * r), 1, ["#ffe27a", "#fff8dc", "#ffd23f"], { speed: 0.3, up: 4.5, gravity: -1.5, size: 0.13, life: 1.8, drag: 0.3 });
      }
    }
    // THE TRACKER: down from the sky over his victim, bobbing, his eye on them
    this.shorK += (this.shorWant - this.shorK) * Math.min(1, dt * (this.shorWant ? 2.2 : 3));
    if (this.shorK < 0.01 && !this.shorWant) this.shor.visible = false;
    if (this.shor.visible) {
      const a = this.av[this.shorSeat];
      const k = this.shorK;
      this.shor.position.set(a.pos.x - 0.5, a.pos.y + 5.6 + (1 - k) * 26 + Math.sin(t * 2.1) * 0.3, a.pos.z - 2.6);
      this.shor.rotation.y = Math.sin(t * 0.9) * 0.25;
      this.shor.rotation.z = Math.sin(t * 1.4) * 0.06 + (this.shorLaugh > 0 ? Math.sin(t * 30) * 0.05 : 0);
      this.shorLaugh = Math.max(0, this.shorLaugh - dt);
      this.shorLid.position.y = this.shorLaugh > 0 ? 0.3 : 0.55;
      this.shorLid.rotation.z = this.shorLaugh > 0 ? 0 : 0.12;
      this.shorPupil.position.x = Math.sin(t * 0.7) * 0.15;
      this.shorPupil.position.y = -0.12;
      (this.shorAura.material as THREE.SpriteMaterial).opacity = 0.4 + Math.sin(t * 5) * 0.15;
    }
    if (this.zapT > 0) {
      this.zapT -= dt;
      (this.zap.material as THREE.MeshBasicMaterial).opacity = Math.max(0, this.zapT * 1.8) * (0.6 + Math.random() * 0.4);
      if (this.zapT <= 0) this.zap.visible = false;
    }
    // the train
    if (this.curve) {
      if (this.trainGo) {
        const g = this.trainGo;
        g.t += dt;
        const k = clamp01(g.t / g.dur);
        this.trainU = (g.a + (g.b - g.a) * ease(k)) % 1;
        if (k >= 1) this.trainGo = null;
      } else if (this.rider < 0 && !this.parked) this.trainU = (this.trainU + (dt * 8) / this.curveLen) % 1;
      for (let k = 0; k < this.cars.length; k++) {
        const car = this.cars[k];
        this.carPos(k, car.position);
        const u = (((this.trainU - (k * 4.7) / this.curveLen) % 1) + 1) % 1;
        const tg = this.curve.getTangentAt(u, tv);
        car.rotation.y = Math.atan2(tg.x, tg.z);
        car.position.y -= 0.42;
        car.updateMatrix();
        this.life.dyn.bodies[this.carBody[k]].copy(car.matrix);
      }
    }
    // the drawbridge
    this.bridgeK += (this.bridgeWant - this.bridgeK) * Math.min(1, dt * 2.4);
    if (this.leaves.length) {
      this.leaves[0].rotation.x = this.bridgeK * 1.15;
      this.leaves[1].rotation.x = -this.bridgeK * 1.15;
    }
    // the wheel
    if (this.wheel) {
      if (this.wheelSpin) {
        const s = this.wheelSpin;
        s.t += dt;
        const k = clamp01(s.t / s.dur);
        const was = this.wheelA;
        this.wheelA = s.a + (s.b - s.a) * (1 - Math.pow(1 - k, 3));
        if (Math.floor(was / (Math.PI / 9)) !== Math.floor(this.wheelA / (Math.PI / 9))) this.wheelTick = true;
        if (k >= 1) this.wheelSpin = null;
      }
      this.wheel.rotation.z = this.wheelA;
    }
    // arrows bob, the picked one leans out
    for (let k = 0; k < this.arrows.length; k++) {
      const a = this.arrows[k];
      if (!a.visible) continue;
      const on = k === this.arrowSel;
      const base = a.userData.base as THREE.Vector3;
      const yaw = a.userData.yaw as number;
      const out = on ? 0.35 + Math.sin(t * 6) * 0.25 : 0;
      a.position.set(base.x + Math.sin(yaw) * out, base.y + (on ? Math.abs(Math.sin(t * 6)) * 0.2 : 0), base.z + Math.cos(yaw) * out);
      a.scale.setScalar(on ? 1.25 : 0.9);
    }
    // locks turn
    for (const [, g] of this.locks) g.rotation.y += dt * 1.5;
    // the landmarks
    for (const g of this.moving.gears) g.rotateZ(dt * 0.8);
    for (const b of this.moving.beams) b.rotation.y = Math.sin(t * 0.5) * 1.4;
    for (const l of this.moving.lights) l.rotation.y = t * 0.9;
    for (const b of this.moving.blink) (b as THREE.Sprite).material.opacity = Math.sin(t * 4) > 0 ? 0.9 : 0.25;
    for (let k = 0; k < this.moving.blimps.length; k++) {
      const bl = this.moving.blimps[k];
      bl.position.y = 9 + Math.sin(t * 0.6 + k * 2) * 0.5;
      bl.rotation.z = Math.sin(t * 0.4 + k) * 0.03;
      bl.updateMatrix();
      if (bl.userData.body !== undefined) this.life.dyn.bodies[bl.userData.body as number].copy(bl.matrix);
    }
    for (const f of this.moving.falls) f.offset.y = (f.offset.y + dt * 0.6) % 1;
    this.tollLift = Math.max(0, this.tollLift - dt);
    for (const a of this.moving.toll) a.rotation.z += ((this.tollLift > 0 ? 1.3 : 0) - a.rotation.z) * Math.min(1, dt * 6);
    this.smokeT -= dt;
    if (this.smokeT <= 0 && this.moving.smoke.length) {
      this.smokeT = 0.35;
      const p = this.moving.smoke[Math.floor(Math.random() * this.moving.smoke.length)];
      this.fx.burst(p, 2, ["#d9d4f0", "#b9b4d0", "#ffffff"], { speed: 0.6, up: 2.2, gravity: -0.6, size: 0.55, life: 2.6, drag: 0.4 });
    }
    // the landing ring
    if (this.popT < 1) {
      this.popT = Math.min(1, this.popT + dt * 2.2);
      const k = this.popT;
      this.pop.scale.setScalar(2.2 + k * 3.6);
      (this.pop.material as THREE.MeshBasicMaterial).opacity = (1 - k) * 0.9;
      if (k >= 1) this.pop.visible = false;
    }
    // the board alive: the crowd watches the walker
    this.life.focus = this.walker >= 0 ? this.av[this.walker].pos : null;
    this.life.update(dt, this.cam.at, this.fx);
    this.art?.update?.(dt, t);
    this.water.mat.uniforms.uTime.value = t;
    this.falls.tex.offset.y = (this.falls.tex.offset.y + dt * 0.9) % 1;
    this.seaTex.offset.x = (this.seaTex.offset.x + dt * 0.0035) % 1;
    this.seaTex.offset.y = (this.seaTex.offset.y + dt * 0.0015) % 1;
    this.fx.update(dt);
    this.camera(dt);
  }
  /** A ring pops off space i in its kind's colour (someone landed). */
  flashSpace(i: number) {
    const sp = this.g.spaces[i];
    this.pop.position.set(sp.x, this.floorY(i) + 0.04, sp.z);
    (this.pop.material as THREE.MeshBasicMaterial).color.set(KIND_C[sp.kind] ?? "#ffffff").lerp(WHITE, 0.35);
    this.popT = 0;
    this.pop.visible = true;
  }
  /** The crowd round a spot cheers (a player passing, landing). */
  cheer(x: number, z: number, r = 9, k = 0.8) {
    this.life.cheer(x, z, r, k);
  }
  /** Everyone cheers (a Z-Block bought). */
  cheerAll() {
    this.life.cheerAll();
  }
  /** A tick of the wheel passing its pins (the game plays the click). */
  wheelTick = false;
  /** The train waits at its station (someone is getting on). */
  parked = false;
  /** The map's top view, over whatever the camera was doing. */
  mapOn = false;

  private camera(dt: number) {
    const eye = tv,
      at = tv2;
    if (this.mapOn) {
      eye.set(4, 104, 34);
      at.set(4, 0, -12);
    } else if (this.mode === "follow") {
      // (a little lower than straight down the board: the zone behind the player shows)
      const p = this.av[this.followSeat].pos;
      const z = this.zoom;
      at.set(p.x, Math.max(0, p.y) * 0.5 + 1.25, p.z - 1.3);
      eye.set(p.x, at.y + 7.9 * z, at.z + 11.2 * z);
    } else if (this.mode === "track" && this.track) {
      const p = this.track();
      const z = this.zoom;
      at.copy(p);
      eye.set(p.x, p.y + 8.0 * z, p.z + 10.9 * z);
    } else if (this.mode === "map") {
      eye.set(4, 104, 34);
      at.set(4, 0, -12);
    } else {
      eye.copy(this.shotEye);
      at.copy(this.shotAt);
    }
    this.cam.to(eye, at, dt, this.camK, this.camK * 1.4);
    this.cam.apply(dt);
  }

  view(): World {
    return this.w;
  }

  toScreen(v: THREE.Vector3) {
    return toScreen(v, this.w.camera);
  }

  /** Over a seat's head (the HUD's bubbles). */
  head(seat: number, up = 2.6, out = new THREE.Vector3()) {
    const a = this.av[seat];
    return out.copy(a.pos).setY(a.pos.y + up);
  }

  dispose() {
    this.life.dispose();
    this.diceDown();
    for (const a of this.av) a.dispose();
    disposeScene(this.w.scene);
    this.ink.dispose();
    this.islandMat.dispose();
  }
}

/** The hash wheel's face: six outcomes round it (segment k centred at 90° + k·60°, counter-clockwise). */
function wheelTex() {
  const cv = document.createElement("canvas");
  cv.width = cv.height = 512;
  const g = cv.getContext("2d")!;
  const segs: [string, string, string][] = [
    ["AIRDROP", "+5 ALL", "#33d67c"],
    ["FEE BURN", "−5 ALL", "#ff3d56"],
    ["FLUSH", "SHARE", "#3ec6ff"],
    ["REORG", "Z MOVES", "#ffd23f"],
    ["BRIDGE", "FLIP", "#c4b1fc"],
    ["REWARD", "+10", "#ff6b35"],
  ];
  const c = 256;
  for (let k = 0; k < 6; k++) {
    const th = Math.PI / 2 + (k * Math.PI) / 3;
    g.beginPath();
    g.moveTo(c, c);
    // (canvas y runs down: angles flip)
    g.arc(c, c, 252, -(th + Math.PI / 6), -(th - Math.PI / 6));
    g.closePath();
    g.fillStyle = segs[k][2];
    g.fill();
    g.lineWidth = 6;
    g.strokeStyle = "#1a1033";
    g.stroke();
    g.save();
    g.translate(c + Math.cos(th) * 160, c - Math.sin(th) * 160);
    g.rotate(-th + Math.PI / 2);
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.lineJoin = "round";
    g.font = "900 40px Geist, sans-serif";
    g.lineWidth = 8;
    g.strokeStyle = "#1a1033";
    g.strokeText(segs[k][0], 0, -18);
    g.fillStyle = "#ffffff";
    g.fillText(segs[k][0], 0, -18);
    g.font = "800 30px Geist, sans-serif";
    g.lineWidth = 6;
    g.strokeText(segs[k][1], 0, 20);
    g.fillText(segs[k][1], 0, 20);
    g.restore();
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
