import * as THREE from "three";
import { fitText } from "../../scene/fit";
import { canvasTex, JP, makeCanvas, MONO } from "../factory/canvas";
import { NODE_COLOR, NODE_JP, NODE_LABEL, zecText, type Node, type Route } from "./money";

const TANK_R = 0.5;
const TANK_H = 1.3;
const BASE_H = 0.22;
/** Particles shared by every jet (one draw call). */
const MAX_DOTS = 1600;
const KIND_WORD: Record<string, string> = { "transparent>transparent": "public transfer", "mint>transparent": "block reward" };

interface Tank {
  node: Node;
  pos: THREE.Vector3;
  root: THREE.Group;
  liquid: THREE.Mesh;
  sign: { mesh: THREE.Mesh; g: CanvasRenderingContext2D; tex: THREE.CanvasTexture };
  level: number;
  target: number;
}

interface Jet {
  route: Route;
  /** Path of the jet (null for a loop inside one tank). */
  curve: THREE.QuadraticBezierCurve3 | null;
  loop: THREE.Vector3 | null;
  mesh: THREE.Mesh;
  label: THREE.Sprite;
  start: number;
  dots: number;
  speed: number;
  color: THREE.Color;
}

/** Thickness 0–1 for an amount, on a log scale (1 zat → 0, 10,000 ZEC → 1). */
const weight = (zat: number) => Math.min(1, Math.max(0, Math.log10(1 + zat / 1e4) / 8));

/**
 * The money of a block, flowing: a glass tank per value pool and a golden coin for the mint.
 * Every route value took in the block (transparent → Ironwood, mint → transparent, Orchard →
 * Ironwood…) is a glowing jet arching from tank to tank, as thick as the amount, with particles
 * streaming along it and a floating tag saying how much and how many transactions. Fully shielded
 * transactions swirl inside their own tank: their amount is hidden. Jets light up one by one
 * when a block is loaded; the tanks' liquid rises or falls with the pool's net change.
 */
export class FlowScene {
  readonly group = new THREE.Group();
  readonly pickables: THREE.Object3D[] = [];
  private tanks = new Map<Node, Tank>();
  private jets: Jet[] = [];
  private dots: THREE.InstancedMesh;
  private dotOwner = new Int16Array(MAX_DOTS).fill(-1);
  private dotPhase = new Float32Array(MAX_DOTS);
  private coin: THREE.Group;
  private m = new THREE.Matrix4();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3();
  private q = new THREE.Quaternion();
  private glass = new THREE.MeshStandardMaterial({ color: "#cfe6ff", roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.16, depthWrite: false });
  private frame = new THREE.MeshStandardMaterial({ color: "#2a2834", roughness: 0.35, metalness: 0.7 });

  constructor(
    parent: THREE.Object3D,
    private Y: number,
  ) {
    parent.add(this.group);
    this.dots = new THREE.InstancedMesh(new THREE.BoxGeometry(0.075, 0.075, 0.075), new THREE.MeshBasicMaterial({ toneMapped: false }), MAX_DOTS);
    this.dots.count = 0;
    this.dots.frustumCulled = false;
    this.dots.setColorAt(0, new THREE.Color());
    this.group.add(this.dots);
    this.coin = this.buildCoin();
    for (const n of ["transparent", "sprout", "sapling", "orchard", "ironwood"] as Node[]) this.tanks.set(n, this.buildTank(n));
  }

  /** Arrange the nodes in an arc facing the elevator (left to right: mint, then the pools). */
  setNodes(nodes: Node[]) {
    const pools = nodes.filter((n) => n !== "mint");
    const all: Node[] = ["mint", ...pools];
    // a shallow arc well in front of the transactions wall, so it never hides it
    const R = 7.6,
      cz = 1.2;
    const span = Math.min(0.54, 0.15 * (all.length - 1));
    all.forEach((n, i) => {
      const a = all.length === 1 ? 0 : -span + (2 * span * i) / (all.length - 1);
      const p = new THREE.Vector3(Math.sin(a) * R, this.Y, cz - Math.cos(a) * R);
      if (n === "mint") this.coin.position.copy(p);
      else {
        const t = this.tanks.get(n)!;
        t.pos.copy(p);
        t.root.position.copy(p);
        // face the elevator
        t.root.rotation.y = Math.atan2(-p.x, 0 - p.z);
      }
    });
    for (const [n, t] of this.tanks) t.root.visible = (pools as Node[]).includes(n);
  }

  /** Where a node's jets leave from and land (the top of its tank, the rim of the coin). */
  private top(n: Node) {
    if (n === "mint") return this.coin.position.clone().setY(this.Y + 1.75);
    return this.tanks.get(n)!.pos.clone().setY(this.Y + BASE_H + TANK_H + 0.12);
  }

  /** Show a block's routes; they fire one after another from time `t`. `net`: each pool's net change. */
  show(routes: Route[], net: Partial<Record<Node, number>>, t: number) {
    for (const j of this.jets) {
      this.group.remove(j.mesh, j.label);
      j.mesh.geometry.dispose();
      (j.mesh.material as THREE.Material).dispose();
      (j.label.material as THREE.SpriteMaterial).map?.dispose();
      j.label.material.dispose();
      this.pickables.splice(this.pickables.indexOf(j.mesh), 1);
    }
    this.jets = [];
    const maxW = Math.max(1e-6, ...routes.map((r) => weight(r.zat)));
    let dotsLeft = MAX_DOTS;
    routes.forEach((r, i) => {
      const w = r.zat ? weight(r.zat) / maxW : 0.15;
      const color = new THREE.Color(NODE_COLOR[r.to === "transparent" && r.from !== "transparent" ? r.from : r.to]);
      let curve: THREE.QuadraticBezierCurve3 | null = null;
      let loop: THREE.Vector3 | null = null;
      let geo: THREE.BufferGeometry;
      if (r.from === r.to) {
        loop = this.top(r.to).setY(this.Y + BASE_H + TANK_H * 0.55);
        geo = new THREE.TorusGeometry(TANK_R + 0.16, 0.025 + 0.05 * w, 8, 48);
      } else {
        const a = this.top(r.from),
          b = this.top(r.to);
        const mid = a.clone().lerp(b, 0.5);
        // arcs stay under the transactions wall's lower edge
        mid.y = Math.max(a.y, b.y) + Math.min(0.8, 0.35 + a.distanceTo(b) * 0.1);
        curve = new THREE.QuadraticBezierCurve3(a, mid, b);
        geo = new THREE.TubeGeometry(curve, 64, 0.025 + 0.085 * w, 8, false);
        geo.setDrawRange(0, 0);
      }
      const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(1.4), transparent: true, opacity: 0.55, toneMapped: false, depthWrite: false, blending: THREE.AdditiveBlending }));
      if (loop) {
        mesh.position.copy(loop);
        mesh.rotation.x = Math.PI / 2;
        mesh.scale.setScalar(0.001);
      }
      mesh.userData.route = r;
      this.group.add(mesh);
      this.pickables.push(mesh);
      const label = this.tag(r);
      label.position.copy(curve ? curve.getPoint(0.5).add(new THREE.Vector3(0, 0.24, 0)) : loop!.clone().setY(this.Y + BASE_H + TANK_H + 0.5));
      label.visible = false;
      this.group.add(label);
      const dots = Math.min(dotsLeft, Math.round(curve ? 14 + 46 * w : 10 + 14 * w));
      dotsLeft -= dots;
      this.jets.push({ route: r, curve, loop, mesh, label, start: t + 0.55 * i, dots, speed: curve ? 0.22 + 0.1 * (1 - w) : 0.35, color });
    });
    // particles: who owns which, colours
    let k = 0;
    this.jets.forEach((j, ji) => {
      for (let d = 0; d < j.dots; d++, k++) {
        this.dotOwner[k] = ji;
        this.dotPhase[k] = d / j.dots + Math.random() * 0.02;
        this.dots.setColorAt(k, j.color.clone().multiplyScalar(1.6));
      }
    });
    this.dots.count = k;
    if (this.dots.instanceColor) this.dots.instanceColor.needsUpdate = true;
    // liquid: up for a pool that gained, down for one that lost (log scale), back to rest otherwise
    for (const [n, tank] of this.tanks) {
      const d = net[n] ?? 0;
      tank.target = 0.55 + Math.sign(d) * Math.min(0.3, weight(Math.abs(d)) * 0.4);
      this.drawSign(tank, d, routes.filter((r) => r.from === n || r.to === n).reduce((a, r) => a + r.txs.length, 0));
    }
  }

  update(dt: number, t: number) {
    this.coin.rotation.y += dt * 1.2;
    for (const tank of this.tanks.values()) {
      tank.level += (tank.target - tank.level) * Math.min(1, dt * 2);
      tank.liquid.scale.y = tank.level;
      tank.liquid.position.y = BASE_H + (TANK_H * tank.level) / 2;
    }
    for (const j of this.jets) {
      const k = THREE.MathUtils.clamp((t - j.start) / 0.8, 0, 1);
      if (j.curve) {
        const g = j.mesh.geometry as THREE.BufferGeometry;
        g.setDrawRange(0, Math.floor((g.index?.count ?? 0) * k / 6) * 6);
      } else {
        j.mesh.scale.setScalar(Math.max(0.001, k));
        j.mesh.rotation.z += dt * 0.8;
      }
      j.label.visible = k >= 1;
    }
    for (let i = 0; i < this.dots.count; i++) {
      const j = this.jets[this.dotOwner[i]];
      const on = t - j.start > 0.8;
      if (!on) {
        this.s.setScalar(0);
        this.v.set(0, -99, 0);
      } else if (j.curve) {
        j.curve.getPoint((this.dotPhase[i] + t * j.speed) % 1, this.v);
        this.s.setScalar(1);
      } else {
        const a = (this.dotPhase[i] + t * j.speed) * Math.PI * 2;
        const y = Math.sin(a * 2 + i) * 0.35;
        this.v.set(j.loop!.x + Math.cos(a) * (TANK_R + 0.16), j.loop!.y + y, j.loop!.z + Math.sin(a) * (TANK_R + 0.16));
        this.s.setScalar(0.8);
      }
      this.m.compose(this.v, this.q, this.s);
      this.dots.setMatrixAt(i, this.m);
    }
    this.dots.instanceMatrix.needsUpdate = true;
  }

  /** The route behind a clicked jet, or the pool behind a clicked tank. */
  routeAt(o: THREE.Object3D): Route | null {
    return (o.userData.route as Route) ?? null;
  }
  nodeAt(o: THREE.Object3D): Node | null {
    for (let x: THREE.Object3D | null = o; x; x = x.parent) if (x.userData.node) return x.userData.node as Node;
    return null;
  }

  // ---- builders ------------------------------------------------------------------------------------

  private buildTank(n: Node): Tank {
    const root = new THREE.Group();
    root.userData.node = n;
    const color = new THREE.Color(NODE_COLOR[n]);
    // base ring, glowing collar, glass, cap
    const base = new THREE.Mesh(new THREE.CylinderGeometry(TANK_R + 0.12, TANK_R + 0.18, BASE_H, 32), this.frame);
    base.position.y = BASE_H / 2;
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(TANK_R + 0.13, TANK_R + 0.13, 0.04, 32), new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(1.5), toneMapped: false }));
    collar.position.y = BASE_H;
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(TANK_R, TANK_R, TANK_H, 32, 1, true), this.glass);
    glass.position.y = BASE_H + TANK_H / 2;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(TANK_R + 0.06, TANK_R + 0.06, 0.1, 32), this.frame);
    cap.position.y = BASE_H + TANK_H + 0.05;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(TANK_R + 0.06, 0.02, 6, 40), new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(1.5), toneMapped: false }));
    rim.rotation.x = Math.PI / 2;
    rim.position.y = BASE_H + TANK_H + 0.1;
    // the liquid: a unit-high cylinder scaled to the level
    const liquid = new THREE.Mesh(
      new THREE.CylinderGeometry(TANK_R - 0.05, TANK_R - 0.05, TANK_H, 32),
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.55, roughness: 0.2, transparent: true, opacity: 0.82 }),
    );
    liquid.scale.y = 0.55;
    root.add(base, collar, liquid, glass, cap, rim);
    // the sign at its foot
    const { c, g } = makeCanvas(512, 200);
    const tex = canvasTex(c);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.39), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
    sign.position.set(0, 0.2, TANK_R + 0.22);
    sign.rotation.x = -0.35;
    root.add(sign);
    this.group.add(root);
    this.pickables.push(root);
    const tank: Tank = { node: n, pos: new THREE.Vector3(), root, liquid, sign: { mesh: sign, g, tex }, level: 0.55, target: 0.55 };
    this.drawSign(tank, 0, 0);
    return tank;
  }

  private drawSign(t: Tank, delta: number, txs: number) {
    const { g, tex } = t.sign;
    const col = NODE_COLOR[t.node];
    g.fillStyle = "#07070b";
    g.fillRect(0, 0, 512, 200);
    g.strokeStyle = col;
    g.lineWidth = 5;
    g.strokeRect(6, 6, 500, 188);
    g.fillStyle = col;
    g.shadowColor = col;
    g.shadowBlur = 12;
    g.font = JP(34);
    const w = fitText(g, NODE_JP[t.node], 22, 58);
    g.font = MONO(32, 800);
    fitText(g, ` ${NODE_LABEL[t.node]}`, 22 + w, 56);
    g.shadowBlur = 0;
    g.fillStyle = delta > 0 ? "#3ee08f" : delta < 0 ? "#ffb04a" : "#6a6a76";
    g.font = MONO(54, 800);
    fitText(g, delta ? `${delta > 0 ? "+" : "−"}${zecText(Math.abs(delta))} ZEC` : "no net change", 22, 132, 470);
    g.fillStyle = "#9a9aa6";
    g.font = MONO(24, 600);
    fitText(g, txs ? `${txs} tx touched this pool` : "quiet in this block", 22, 176);
    tex.needsUpdate = true;
  }

  private tag(r: Route): THREE.Sprite {
    const { c, g } = makeCanvas(640, 200);
    const col = NODE_COLOR[r.to === "transparent" && r.from !== "transparent" ? r.from : r.to];
    g.fillStyle = "rgba(7,7,11,0.86)";
    g.fillRect(0, 0, 640, 200);
    g.strokeStyle = col;
    g.lineWidth = 5;
    g.strokeRect(5, 5, 630, 190);
    g.textAlign = "center";
    g.fillStyle = "#ffffff";
    g.shadowColor = col;
    g.shadowBlur = 16;
    g.font = MONO(70, 800);
    const amount = r.zat ? `${zecText(r.zat)} ZEC${r.hidden ? " +🔒" : ""}` : "🔒 hidden";
    fitText(g, amount, 320, 96, 600);
    g.shadowBlur = 0;
    g.fillStyle = col;
    g.font = MONO(30, 700);
    const what = r.from === r.to ? (r.from === "transparent" ? "public transfer" : `private · stays in ${NODE_LABEL[r.to].toLowerCase()}`) : (KIND_WORD[`${r.from}>${r.to}`] ?? `${NODE_LABEL[r.from].toLowerCase()} → ${NODE_LABEL[r.to].toLowerCase()}`);
    fitText(g, `${what} · ${r.txs.length} tx`, 320, 158, 600);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: canvasTex(c), toneMapped: false, depthWrite: false }));
    s.scale.set(1.35, 0.42, 1);
    s.userData.route = r;
    return s;
  }

  private buildCoin() {
    const g = new THREE.Group();
    g.userData.node = "mint";
    const gold = new THREE.MeshStandardMaterial({ color: "#f4b728", metalness: 0.9, roughness: 0.25, emissive: new THREE.Color("#f4b728"), emissiveIntensity: 0.25 });
    const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.12, 48), gold);
    coin.rotation.x = Math.PI / 2;
    coin.position.y = 1.1;
    // the ⓩ on its faces
    const { c, g: ctx } = makeCanvas(256, 256);
    ctx.fillStyle = "#c8901a";
    ctx.beginPath();
    ctx.arc(128, 128, 120, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff2c4";
    ctx.font = MONO(180, 900);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Z", 128, 136);
    const face = new THREE.MeshBasicMaterial({ map: canvasTex(c), toneMapped: false });
    for (const z of [0.062, -0.062]) {
      const f = new THREE.Mesh(new THREE.CircleGeometry(0.53, 48), face);
      f.position.set(0, 1.1, z);
      if (z < 0) f.rotation.y = Math.PI;
      g.add(f);
    }
    const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.4, 0.45, 24), this.frame);
    stand.position.y = 0.22;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.03, 6, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color("#f4b728").multiplyScalar(1.6), toneMapped: false }));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.46;
    g.add(coin, stand, ring);
    const label = makeCanvas(512, 120);
    label.g.fillStyle = "#f4b728";
    label.g.shadowColor = "#f4b728";
    label.g.shadowBlur = 12;
    label.g.font = JP(40);
    label.g.textAlign = "center";
    label.g.fillText("発行 · NEW COINS", 256, 76);
    const sign = new THREE.Sprite(new THREE.SpriteMaterial({ map: canvasTex(label.c), toneMapped: false, transparent: true }));
    sign.scale.set(1.2, 0.28, 1);
    sign.position.y = 0.3;
    g.add(sign);
    this.group.add(g);
    this.pickables.push(g);
    return g;
  }
}
