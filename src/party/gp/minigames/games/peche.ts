/**
 * PARTIE DE PÊCHE (chacun pour soi, 45 s): four anglers at the end of a wooden pier on a mountain
 * lake. A starts the cast at the power shown by the gauge (farther = bigger fish). Wait for the
 * bite: when "!" pops over the bobber, press A quickly to hook (too early scares the fish). Then
 * mash A to reel in while the tension stays out of the red: when the fish pulls, ease off or the
 * line snaps. Small fish 1, medium 3, big 5, old boot 0, golden fish 8. Most points wins.
 */
import * as THREE from "three";
import { BaseMini, type CpuPad } from "../base";
import type { MiniCtx, MiniDef } from "../types";
import { GEO, ball, box, canvasTex, cone, cyl, flat, group, pine, toon, cloud } from "../../engine/gfx";
import { clamp, damp, lerp } from "../../engine/util";
import { music } from "../../engine/audio";
import { T } from "../../../../i18n/lang";

const TIME = 45;
const DECK = 0.8;
const PZ = -1.25; // where the anglers stand
const EDGE = -0.75; // the pier's front edge
const ROD = 2.5;

type State = "ready" | "cast" | "wait" | "bite" | "reel" | "catch" | "lost";
type Kind = "petit" | "moyen" | "gros" | "botte" | "dore";

interface FishType {
  pts: number;
  /** Its name, English and Chinese (read with T when shown). */
  name: [string, string];
  /** Tension added per second while it pulls. */
  pull: number;
  /** Reeling per press (units). */
  reel: number;
  /** Reaction window to hook (s). */
  win: number;
  color: string;
}
const FISH: Record<Kind, FishType> = {
  petit: { pts: 1, name: ["Small fish", "小鱼"], pull: 0.32, reel: 0.34, win: 0.62, color: "#9fd8ff" },
  moyen: { pts: 3, name: ["Nice fish", "好鱼"], pull: 0.55, reel: 0.27, win: 0.56, color: "#ff9a4a" },
  gros: { pts: 5, name: ["Big fish!", "大鱼！"], pull: 0.78, reel: 0.22, win: 0.5, color: "#3f8fa8" },
  botte: { pts: 0, name: ["An old boot…", "一只旧靴子……"], pull: 0, reel: 0.32, win: 0.62, color: "#7a5a3a" },
  dore: { pts: 8, name: ["GOLDEN FISH!", "金鱼！"], pull: 0.92, reel: 0.2, win: 0.45, color: "#ffd23f" },
};

interface Angler {
  x: number;
  st: State;
  stT: number;
  /** Power gauge 0..1 (ready), its phase. */
  pw: number;
  pwPh: number;
  /** Bobber. */
  bx: number;
  bz: number;
  by: number;
  tx: number;
  tz: number;
  castFrom: THREE.Vector3;
  waitFor: number;
  nibbles: number[];
  fish: Kind;
  tension: number;
  pulling: number;
  nextPull: number;
  pts: number;
  catches: number;
  rod: THREE.Group;
  rodPitch: number;
  line: THREE.Mesh;
  bob: THREE.Group;
  panel: HTMLElement;
  pow: HTMLElement;
  ten: HTMLElement;
  msg: HTMLElement;
  bang: HTMLElement;
  shown: THREE.Object3D | null;
  cpuTarget: number;
  cpuWait: number;
  cpuFooled: boolean;
  cpuReact: number;
}

const CSS = `
.pe-box{display:flex;flex-direction:column;align-items:center;gap:calc(var(--u)*.3);min-width:calc(var(--u)*9)}
.pe-msg{font-size:calc(var(--u)*1.2);font-weight:700;white-space:nowrap}
.pe-pow{position:relative;width:calc(var(--u)*9);height:calc(var(--u)*1.1);border-radius:9px;background:linear-gradient(90deg,#3fcf5a,#ffd23f 60%,#ff4b3e);overflow:hidden;border:calc(var(--u)*.18) solid #fff}
.pe-pow i{position:absolute;top:-10%;bottom:-10%;width:calc(var(--u)*.5);margin-left:calc(var(--u)*-.25);background:#1d1630;border-radius:4px;box-shadow:0 0 0 2px #fff}
.pe-ten{position:relative;width:calc(var(--u)*9);height:calc(var(--u)*1.1);border-radius:9px;background:linear-gradient(90deg,#2a8a3a 0 62%,#ffb02e 62% 82%,#e8233f 82%);overflow:hidden;border:calc(var(--u)*.18) solid #fff}
.pe-ten i{position:absolute;left:0;top:0;bottom:0;background:rgba(255,255,255,.55)}
.pe-ten.pull{animation:pepull .25s infinite alternate}
@keyframes pepull{to{box-shadow:0 0 calc(var(--u)*1.2) #ff3b3b;transform:scale(1.08)}}
.pe-bang{background:none!important;padding:0!important}
.pe-b{display:inline-block;font-family:var(--title);font-size:calc(var(--u)*6);line-height:1;color:#ffe14a;-webkit-text-stroke:calc(var(--u)*.35) #1d1630;paint-order:stroke fill;animation:pebang .45s ease-in-out infinite alternate}
@keyframes pebang{from{transform:scale(.8) rotate(-8deg)}to{transform:scale(1.15) rotate(8deg)}}
`;

class Peche extends BaseMini {
  private ang: Angler[] = [];
  private water!: THREE.Mesh;
  private waterTex!: THREE.Texture;
  private ducks: THREE.Group[] = [];
  private fishProto: Record<Kind, THREE.Group> = {} as Record<Kind, THREE.Group>;
  private hurried = false;
  private over = false;
  private endIn = 0;
  cardVals: HTMLElement[] = [];
  private flying: { o: THREE.Object3D; from: THREE.Vector3; to: THREE.Vector3; t: number; i: number }[] = [];
  private hR = new THREE.Vector3();
  private hL = new THREE.Vector3();

  constructor(ctx: MiniCtx) {
    super(ctx, { sky: ["#5fb4ff", "#fff0d8"], size: 18, sun: [-0.5, 1, 0.6], fog: { near: 50, far: 130 } });
    this.hud.add(`<style>${CSS}</style>`);
    this.buildLake();
    this.buildFishes();
    const n = this.players.length;
    this.players.forEach((p, i) => {
      const x = (i - (n - 1) / 2) * 4.2;
      const a = this.spawn(i, x, PZ, 0);
      a.pos.y = DECK;
      a.groundY = DECK;
      a.anim = "hold";
      a.setRing(p.char.color);
      // rod: built along +z from the hands (it follows the zkSNARK's hands, updateAngler)
      const rod = group(this.scene, { x, y: DECK + 0.6, z: PZ + 0.4 });
      cyl(rod, "#3a2a1a", 0.045, 0.5, { z: 0.15, rx: Math.PI / 2, seg: 6 });
      cyl(rod, p.char.color, 0.03, ROD, { z: ROD / 2, rx: Math.PI / 2, seg: 6, rTop: 0.012 });
      cyl(rod, "#c0c4d0", 0.07, 0.09, { x: 0.08, z: 0.25, rz: Math.PI / 2, seg: 10 });
      const line = new THREE.Mesh(GEO.cylLo, flat("#ffffff", 0.9));
      this.scene.add(line);
      const bob = group(this.scene, {});
      ball(bob, "#ff3b3b", [0.2, 0.17, 0.2], { y: 0.07 });
      ball(bob, "#ffffff", [0.19, 0.12, 0.19], { y: -0.04 });
      cyl(bob, "#1d1630", 0.025, 0.24, { y: 0.28, seg: 5 });
      bob.visible = false;
      const panel = this.hud.label(a.root, `<div class="pe-box"><div class="pe-msg"></div><div class="pe-pow"><i></i></div><div class="pe-ten"><i></i></div></div>`, { dy: 2.1, color: "rgba(20,14,40,.82)" });
      panel.style.border = `calc(var(--u)*0.25) solid ${p.char.color}`;
      panel.style.borderRadius = "calc(var(--u)*1)";
      panel.style.padding = "calc(var(--u)*0.4) calc(var(--u)*0.7)";
      const bang = this.hud.label(bob, `<span class="pe-b">!</span>`, { dy: 0.75, cls: "pe-bang" });
      bang.style.visibility = "hidden";
      this.ang.push({
        x,
        st: "ready",
        stT: 0,
        pw: 0,
        pwPh: Math.random(),
        bx: x,
        bz: 2,
        by: 0,
        tx: x,
        tz: 2,
        castFrom: new THREE.Vector3(),
        waitFor: 2,
        nibbles: [],
        fish: "petit",
        tension: 0,
        pulling: 0,
        nextPull: 1,
        pts: 0,
        catches: 0,
        rod,
        rodPitch: 1.0,
        line,
        bob,
        panel,
        pow: panel.querySelector(".pe-pow")!,
        ten: panel.querySelector(".pe-ten")!,
        msg: panel.querySelector(".pe-msg")!,
        bang,
        shown: null,
        cpuTarget: 0.8,
        cpuWait: 0.4,
        cpuFooled: false,
        cpuReact: 0,
      });
    });
    const cards = this.hud.players(this.players, () => "🐟 0");
    this.cardVals = this.players.map((_, i) => cards.children[i]?.querySelector(".val") as HTMLElement);
    this.hud.timer(TIME);
    this.ang.forEach((_, i) => this.setState(i, "ready"));
    this.setCam([0, 3.2, 24], [0, 1.6, 0], 42);
  }

  // ------------------------------------------------------------ the lake

  private buildLake() {
    const s = this.scene;
    // water: a gently scrolling ripple texture
    this.waterTex = canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = "#3aa6d6";
      g.fillRect(0, 0, w, h);
      g.strokeStyle = "rgba(255,255,255,0.22)";
      g.lineWidth = 3;
      for (let i = 0; i < 40; i++) {
        const x = Math.random() * w,
          y = Math.random() * h,
          l = 14 + Math.random() * 26;
        g.beginPath();
        g.moveTo(x, y);
        g.quadraticCurveTo(x + l / 2, y - 4, x + l, y);
        g.stroke();
      }
    }, true);
    this.waterTex.repeat.set(10, 8);
    this.water = new THREE.Mesh(new THREE.PlaneGeometry(160, 90), new THREE.MeshToonMaterial({ map: this.waterTex, color: "#ffffff" }));
    this.water.rotation.x = -Math.PI / 2;
    this.water.position.set(0, 0, 20);
    this.water.receiveShadow = true;
    s.add(this.water);
    // the far shore: grass bank, forest, cabin, mountains
    box(s, "#7ac25a", 160, 1.2, 30, { y: 0.1, z: -21 });
    box(s, "#c9b07a", 160, 0.5, 2.5, { y: 0.0, z: -6.4 });
    const shore = new THREE.Mesh(new THREE.PlaneGeometry(160, 6), toon("#d8c08a"));
    shore.rotation.x = -Math.PI / 2;
    shore.position.set(0, 0.02, -7.2);
    s.add(shore);
    for (let k = 0; k < 26; k++) {
      const x = -44 + k * 3.5 + Math.random() * 1.5;
      if (Math.abs(x) < 3) continue;
      pine(s, x, -10 - Math.random() * 7, 2.4 + Math.random() * 1.6, k % 2 ? "#2f8e57" : "#3aa064", 0.7);
    }
    // a log cabin
    const cab = group(s, { x: 9, y: 0.7, z: -10.5, ry: -0.2 });
    for (let k = 0; k < 6; k++) box(cab, k % 2 ? "#9a6236" : "#8a5530", 5, 0.45, 3.6, { y: 0.25 + k * 0.45 });
    // a triangular prism along x: one edge up
    const roof = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 5.6, 3, 1, false, Math.PI / 2), toon("#b8433a"));
    roof.rotation.z = Math.PI / 2;
    roof.scale.set(0.6, 1, 0.9);
    roof.position.set(0, 2.7 + 2.6 * 0.5 * 0.6, 0);
    roof.castShadow = true;
    cab.add(roof);
    box(cab, "#5a3a20", 0.9, 1.6, 0.1, { y: 0.8, z: 1.82 });
    box(cab, "#ffe9a0", 0.8, 0.7, 0.1, { x: 1.5, y: 1.5, z: 1.82 });
    cyl(cab, "#7a7a8a", 0.25, 1.4, { x: -1.6, y: 4.4, seg: 8 });
    // mountains
    for (let k = 0; k < 7; k++) {
      const x = -60 + k * 20 + Math.random() * 6;
      const h = 16 + Math.random() * 10;
      const r = 12 + Math.random() * 6;
      cone(s, k % 2 ? "#6d8aa8" : "#7d96b2", r, h, { x, y: h / 2 - 1, z: -48 - Math.random() * 8, lo: true, cast: false, receive: false });
      cone(s, "#ffffff", r * 0.34, h * 0.34, { x, y: h - 1 - h * 0.17 + 0.1, z: -48 - 0.1, lo: true, cast: false, receive: false });
    }
    for (let k = 0; k < 6; k++) cloud(s, -40 + k * 16, 20 + Math.random() * 6, -60, 2.2 + Math.random());
    // the pier: a long deck along the shore, posts in the water, a walkway back to land
    const planks = canvasTex(256, 64, (g, w, h) => {
      g.fillStyle = "#b07a4a";
      g.fillRect(0, 0, w, h);
      for (let k = 0; k < 4; k++) {
        g.fillStyle = k % 2 ? "#a06c3e" : "#ba8452";
        g.fillRect(0, (k * h) / 4 + 1, w, h / 4 - 2);
      }
      g.fillStyle = "rgba(60,30,10,0.4)";
      for (let k = 0; k < 6; k++) g.fillRect(Math.random() * w, 0, 2, h);
    }, true);
    planks.repeat.set(10, 3);
    const L = this.players.length * 4.2 + 3;
    const deck = new THREE.Mesh(new THREE.BoxGeometry(L, 0.22, 3.2), [toon("#8a5a32"), toon("#8a5a32"), new THREE.MeshToonMaterial({ map: planks }), toon("#8a5a32"), toon("#9a6a3a"), toon("#8a5a32")]);
    deck.position.set(0, DECK - 0.11, -2.35);
    deck.castShadow = deck.receiveShadow = true;
    s.add(deck);
    for (let k = 0; k <= this.players.length * 2; k++) {
      const x = -L / 2 + 0.3 + ((L - 0.6) / (this.players.length * 2)) * k;
      for (const z of [EDGE - 0.1, -3.8]) cyl(s, "#6a4224", 0.13, 1.6, { x, y: 0.0, z, seg: 8 });
    }
    box(s, "#9a6a3a", 2.2, 0.22, 4, { y: DECK - 0.11, z: -5.6 });
    // railings at the ends
    for (const sx of [-1, 1]) {
      cyl(s, "#6a4224", 0.08, 1.1, { x: sx * (L / 2 - 0.15), y: DECK + 0.55, z: EDGE - 0.2, seg: 6 });
      cyl(s, "#6a4224", 0.08, 1.1, { x: sx * (L / 2 - 0.15), y: DECK + 0.55, z: -3.7, seg: 6 });
      box(s, "#7a4a2a", 0.1, 0.1, 3.0, { x: sx * (L / 2 - 0.15), y: DECK + 1.05, z: -2.25 });
    }
    // a lantern post in the middle, a moored rowboat
    cyl(s, "#3a3a48", 0.07, 2.6, { x: 0, y: DECK + 1.3, z: -3.5, seg: 6 });
    ball(s, toon("#fff3b0", "#ffcc33", 0.8), 0.22, { x: 0, y: DECK + 2.7, z: -3.5 });
    const boat = group(s, { x: -L / 2 - 2.2, y: 0.1, z: -0.5, ry: 0.4 });
    box(boat, "#c94a3a", 1.4, 0.5, 3.2, { y: 0.1 });
    box(boat, "#ffffff", 1.5, 0.12, 3.3, { y: 0.38 });
    box(boat, "#8a5a32", 1.2, 0.08, 0.3, { y: 0.32, z: 0.3 });
    // lily pads and reeds
    for (let k = 0; k < 16; k++) {
      const x = (Math.random() < 0.5 ? -1 : 1) * (11 + Math.random() * 12);
      const z = 1 + Math.random() * 12;
      cyl(s, "#3f9a3a", 0.5 + Math.random() * 0.3, 0.04, { x, y: 0.03, z, seg: 12, cast: false });
      if (k % 3 === 0) ball(s, "#ff9ad5", 0.16, { x: x + 0.15, y: 0.15, z, lo: true });
    }
    for (let k = 0; k < 30; k++) {
      const x = (k % 2 ? -1 : 1) * (L / 2 + 1 + Math.random() * 8);
      cone(s, "#5a9a3a", 0.08, 1.4 + Math.random(), { x, y: 0.6, z: -1.5 - Math.random() * 3, lo: true, cast: false });
    }
    // ducks
    for (let k = 0; k < 3; k++) {
      const d = group(s, {});
      ball(d, "#ffffff", [0.32, 0.24, 0.42], { y: 0.12 });
      ball(d, "#2f8e57", 0.17, { y: 0.42, z: 0.28 });
      cone(d, "#ffb02e", 0.07, 0.18, { y: 0.4, z: 0.48, rx: Math.PI / 2 });
      d.userData = { r: 6 + k * 3, c: new THREE.Vector3((k - 1) * 9, 0, 12 + k * 3), ph: k * 2, sp: 0.15 + k * 0.05 };
      this.ducks.push(d);
    }
  }

  private buildFishes() {
    const mk = (k: Kind) => {
      const g = new THREE.Group();
      const f = FISH[k];
      if (k === "botte") {
        box(g, "#7a5a3a", 0.32, 0.6, 0.34, { y: 0.15 });
        box(g, "#7a5a3a", 0.32, 0.26, 0.62, { y: -0.12, z: 0.16 });
        box(g, "#3a2a1a", 0.34, 0.07, 0.66, { y: -0.27, z: 0.16 });
        box(g, "#5a3a20", 0.36, 0.1, 0.38, { y: 0.42 });
        return g;
      }
      const mat = k === "dore" ? toon("#ffd23f", "#b88a00", 0.6) : toon(f.color);
      ball(g, mat, [0.16, 0.26, 0.5], {});
      cone(g, mat, 0.22, 0.3, { z: -0.6, rx: -Math.PI / 2 });
      cone(g, mat, 0.1, 0.22, { y: 0.26, z: -0.05, rx: -0.4 });
      for (const sx of [-1, 1]) {
        ball(g, flat("#ffffff"), 0.07, { x: sx * 0.12, y: 0.07, z: 0.32 });
        ball(g, flat("#1d1630"), 0.04, { x: sx * 0.15, y: 0.07, z: 0.35 });
      }
      if (k === "moyen") for (let s = 0; s < 3; s++) box(g, "#2f6a3a", 0.33, 0.4, 0.06, { z: 0.15 - s * 0.2 });
      return g;
    };
    for (const k of Object.keys(FISH) as Kind[]) this.fishProto[k] = mk(k);
  }

  // ------------------------------------------------------------ helpers

  private setState(i: number, st: State) {
    const A = this.ang[i];
    A.st = st;
    A.stT = 0;
    const show = (pow: boolean, ten: boolean, msg: string) => {
      A.pow.style.display = pow ? "" : "none";
      A.ten.style.display = ten ? "" : "none";
      A.msg.innerHTML = msg;
      A.panel.style.visibility = pow || ten || msg ? "visible" : "hidden";
    };
    A.bang.style.visibility = st === "bite" ? "visible" : "hidden";
    A.msg.dataset.k = "";
    if (st === "ready") {
      show(true, false, T(`<span class="key a" style="font-size:.9em">A</span> Cast`, `<span class="key a" style="font-size:.9em">A</span> 抛竿`));
      A.bob.visible = false;
      A.tension = 0;
      A.cpuWait = 0.25 + Math.random() * 0.5;
      const lv = this.players[i].level;
      A.cpuTarget = clamp(lerp(0.45 + Math.random() * 0.4, 0.82 + Math.random() * 0.14, lv), 0.2, 0.97);
    } else if (st === "cast") show(false, false, "");
    else if (st === "wait") show(false, false, "…");
    else if (st === "bite") show(false, false, "");
    else if (st === "reel") show(false, true, T(`Mash <span class="key a" style="font-size:.9em">A</span>!`, `狂按 <span class="key a" style="font-size:.9em">A</span>！`));
    else show(false, false, "");
  }

  private pickFish(pw: number): Kind {
    const r = this.rnd();
    const table: [Kind, number][] =
      pw < 0.4
        ? [
            ["petit", 0.55],
            ["moyen", 0.24],
            ["botte", 0.15],
            ["gros", 0.05],
            ["dore", 0.01],
          ]
        : pw < 0.75
          ? [
              ["petit", 0.36],
              ["moyen", 0.33],
              ["gros", 0.18],
              ["botte", 0.09],
              ["dore", 0.04],
            ]
          : [
              ["petit", 0.2],
              ["moyen", 0.32],
              ["gros", 0.3],
              ["botte", 0.07],
              ["dore", 0.11],
            ];
    let acc = 0;
    for (const [k, p] of table) {
      acc += p;
      if (r < acc) return k;
    }
    return "petit";
  }

  private tip(i: number) {
    const A = this.ang[i];
    A.rod.updateMatrixWorld();
    return A.rod.localToWorld(new THREE.Vector3(0, 0, ROD));
  }

  // ------------------------------------------------------------ CPUs

  protected cpu(i: number, dt: number): CpuPad {
    const A = this.ang[i];
    const lv = this.players[i].level;
    if (this.over) return {};
    switch (A.st) {
      case "ready": {
        A.cpuWait -= dt;
        if (A.cpuWait > 0 || TIME - this.t < 2.5) return {};
        return { a: Math.abs(A.pw - A.cpuTarget) < 0.05 };
      }
      case "wait": {
        // a nibble can fool a beginner
        const nib = A.nibbles.some((t) => A.stT > t && A.stT < t + 0.12);
        if (nib && !A.cpuFooled) {
          A.cpuFooled = true;
          if (this.cpuChance(i, 0.22, 0.0)) return { a: true };
        }
        if (!nib) A.cpuFooled = false;
        return {};
      }
      case "bite":
        return { a: A.stT > 0.2 + (1 - lv) * 0.42 + A.cpuReact };
      case "reel": {
        // ease off when the fish pulls (seen after a reaction delay) or when the tension is high
        const seen = A.pulling > 0 && this.cpuAfter(i, "pull", 0.15 + (1 - lv) * 0.5);
        if (A.pulling <= 0) this.cpuReset(i, "pull");
        const limit = 0.55 + 0.25 * lv;
        if (seen && A.tension > 0.25) return {};
        if (A.tension > limit) return {};
        return { a: this.mashing(i, 9) };
      }
    }
    return {};
  }

  // ------------------------------------------------------------ the game

  protected idle(dt: number) {
    this.animWorld(dt);
    this.ang.forEach((A, i) => {
      A.pwPh += dt;
      A.pw = 0.5 - 0.5 * Math.cos((A.pwPh * Math.PI) / 0.85);
      this.updateAngler(i, dt);
    });
    this.moveCam([0, 7.6, 14.2], [0, 0.8, 2.2], dt, 1.4);
  }

  protected step(dt: number) {
    const left = TIME - this.t;
    this.hud.timer(left);
    this.animWorld(dt);
    this.moveCam([0, 7.6, 14.2], [0, 0.8, 2.2], dt, 3);
    if (!this.hurried && left <= 10) {
      this.hurried = true;
      this.hud.banner(T("10 SECONDS LEFT!", "还剩 10 秒！"), { color: "#ffd23f" });
      music.speed(1.15);
      this.sound("bell");
    }

    this.ang.forEach((A, i) => {
      const p = this.pad(i);
      const a = this.avatars[i];
      A.stT += dt;
      const press = p.aDown && !this.over;
      switch (A.st) {
        case "ready": {
          A.pwPh += dt;
          A.pw = 0.5 - 0.5 * Math.cos((A.pwPh * Math.PI) / 0.85);
          (A.pow.firstElementChild as HTMLElement).style.left = `${(A.pw * 100).toFixed(1)}%`;
          A.rodPitch = damp(A.rodPitch, 1.1, 6, dt);
          if (press) this.cast(i);
          break;
        }
        case "cast": {
          const k = clamp(A.stT / 0.6, 0, 1);
          A.bx = lerp(A.castFrom.x, A.tx, k);
          A.bz = lerp(A.castFrom.z, A.tz, k);
          A.by = lerp(A.castFrom.y, 0, k) + Math.sin(k * Math.PI) * 2.6;
          A.rodPitch = A.stT < 0.12 ? damp(A.rodPitch, 1.5, 20, dt) : damp(A.rodPitch, 0.35, 10, dt);
          if (k >= 1) {
            this.fx.splash(new THREE.Vector3(A.bx, 0.05, A.bz));
            this.sound("splash");
            A.waitFor = 0.9 + this.rnd() * 2.3;
            A.nibbles = [];
            const nn = Math.floor(this.rnd() * 3);
            for (let k2 = 0; k2 < nn; k2++) A.nibbles.push(0.4 + this.rnd() * (A.waitFor - 0.8));
            A.fish = this.pickFish(A.pw);
            this.setState(i, "wait");
          }
          break;
        }
        case "wait": {
          A.by = Math.sin(this.t * 3 + i) * 0.03;
          A.rodPitch = damp(A.rodPitch, 0.42, 4, dt);
          for (const t of A.nibbles) {
            if (A.stT > t && A.stT < t + 0.25) {
              A.by = -0.08 * Math.sin(((A.stT - t) / 0.25) * Math.PI);
              if (A.stT - dt <= t) {
                this.fx.ring(new THREE.Vector3(A.bx, 0.02, A.bz), "#ffffff", 0.8, 0.4);
                if (!this.players[i].cpu) this.sound("tick");
              }
            }
          }
          if (press) {
            // too early: the fish is scared away
            this.hud.pop(new THREE.Vector3(A.bx, 1, A.bz), T("Too early!", "太早了！"), "#ff9a5a", this.camera);
            this.sound("wrong");
            this.setState(i, "lost");
            A.msg.textContent = T("Too early!", "太早了！");
            A.panel.style.visibility = "visible";
          } else if (A.stT >= A.waitFor) {
            this.setState(i, "bite");
            A.cpuReact = Math.random() * 0.15;
            this.fx.splash(new THREE.Vector3(A.bx, 0.05, A.bz), "#dff4ff");
            this.sound("pop");
            this.buzz(i, [40, 30, 40]);
          }
          break;
        }
        case "bite": {
          A.by = -0.2 + Math.sin(this.t * 30) * 0.05;
          A.rodPitch = damp(A.rodPitch, 0.3, 8, dt);
          if (press) {
            this.setState(i, "reel");
            A.tension = 0.25;
            A.pulling = 0;
            A.nextPull = 0.5 + this.rnd() * 1.0;
            this.sound("confirm");
            this.hud.pop(new THREE.Vector3(A.bx, 1.2, A.bz), T("Hooked!", "上钩了！"), "#7dff7a", this.camera);
            this.buzz(i, 60);
          } else if (A.stT > FISH[A.fish].win) {
            this.hud.pop(new THREE.Vector3(A.bx, 1, A.bz), T("Too late…", "太晚了……"), "#ff9a5a", this.camera);
            this.sound("aww");
            this.setState(i, "lost");
            A.msg.textContent = T("It got away!", "鱼跑了！");
            A.panel.style.visibility = "visible";
          }
          break;
        }
        case "reel": {
          const f = FISH[A.fish];
          // the fish fights in bursts
          if (A.pulling > 0) {
            A.pulling -= dt;
            A.tension += f.pull * dt;
            const away = 0.9 * f.pull * dt;
            const dz = A.bz - EDGE,
              dx = A.bx - A.x;
            const d = Math.hypot(dx, dz) || 1;
            A.bx += (dx / d) * away;
            A.bz = Math.min(7.4, A.bz + (dz / d) * away);
            if (Math.random() < dt * 14) this.fx.burst({ x: A.bx, y: 0.1, z: A.bz }, { count: 3, colors: ["#ffffff", "#bfe8ff"], speed: 2.4, up: 3, gravity: 12, size: 0.1, life: 0.5, shape: "ball" });
            if (A.pulling <= 0) A.nextPull = 0.7 + this.rnd() * 1.3;
          } else if (f.pull > 0) {
            A.nextPull -= dt;
            if (A.nextPull <= 0) {
              A.pulling = 0.6 + this.rnd() * 0.7 * (0.6 + f.pull);
              if (!this.players[i].cpu) this.buzz(i, [30, 20, 30, 20, 30]);
            }
          }
          A.tension = Math.max(0, A.tension - 0.75 * dt);
          if (press) {
            A.tension += 0.1;
            const dz = A.bz - EDGE,
              dx = A.bx - A.x;
            const d = Math.hypot(dx, dz) || 1;
            const k = Math.min(d, f.reel);
            A.bx -= (dx / d) * k;
            A.bz -= (dz / d) * k;
            if (!this.players[i].cpu) this.sound("tick");
          }
          A.by = -0.12 + Math.sin(this.t * (A.pulling > 0 ? 28 : 8)) * (A.pulling > 0 ? 0.08 : 0.03);
          A.rodPitch = damp(A.rodPitch, 0.75 + A.tension * 0.4 + (A.pulling > 0 ? Math.sin(this.t * 30) * 0.06 : 0), 10, dt);
          const tn = clamp(A.tension, 0, 1);
          (A.ten.firstElementChild as HTMLElement).style.width = `${(tn * 100).toFixed(1)}%`;
          A.ten.classList.toggle("pull", A.pulling > 0);
          const want = A.pulling > 0 && f.pull > 0 ? `<span style="color:#ff6a6a">${T("It pulls! Easy…", "它在拉！松手……")}</span>` : T(`Mash <span class="key a" style="font-size:.9em">A</span>!`, `狂按 <span class="key a" style="font-size:.9em">A</span>！`);
          if (A.msg.dataset.k !== String(A.pulling > 0 && f.pull > 0)) {
            A.msg.dataset.k = String(A.pulling > 0 && f.pull > 0);
            A.msg.innerHTML = want;
          }
          if (A.tension >= 1) {
            // snap!
            this.hud.pop(new THREE.Vector3(A.bx, 1, A.bz), T("Line snapped!", "线断了！"), "#ff5a5a", this.camera);
            this.sound("crash");
            this.fx.splash(new THREE.Vector3(A.bx, 0.05, A.bz));
            this.buzz(i, [80, 40, 80]);
            a.flash();
            this.setState(i, "lost");
            A.msg.textContent = T("Line snapped!", "线断了！");
            A.panel.style.visibility = "visible";
          } else if (Math.hypot(A.bx - A.x, A.bz - EDGE) < 0.45) this.land(i);
          break;
        }
        case "catch": {
          A.rodPitch = damp(A.rodPitch, 1.25, 6, dt);
          if (A.stT > 1.1) {
            if (A.shown) {
              A.shown.removeFromParent();
              A.shown = null;
            }
            this.setState(i, "ready");
          }
          break;
        }
        case "lost": {
          // reel the empty line back in
          const k = clamp(A.stT / 0.7, 0, 1);
          A.bz = lerp(A.bz, EDGE + 0.2, k * 0.3);
          A.bx = lerp(A.bx, A.x, k * 0.3);
          A.by = 0;
          A.rodPitch = damp(A.rodPitch, 1.1, 5, dt);
          if (A.stT > 1.0) this.setState(i, "ready");
          break;
        }
      }
      // the angler's body language
      a.anim = A.st === "catch" ? (A.fish === "botte" ? "lose" : "win") : A.st === "lost" && A.stT < 0.8 ? "stun" : "hold";
      a.pos.y = DECK;
      this.updateAngler(i, dt);
    });

    // caught fish flying into the angler's hands
    for (const f of this.flying) {
      f.t += dt;
      const k = clamp(f.t / 0.55, 0, 1);
      f.o.position.lerpVectors(f.from, f.to, k);
      f.o.position.y += Math.sin(k * Math.PI) * 2.2;
      f.o.rotation.z = Math.sin(this.t * 18) * 0.4;
      f.o.rotation.y += dt * 3;
    }
    this.flying = this.flying.filter((f) => f.t < 0.55);

    if (!this.over && left <= 0) {
      this.over = true;
      this.endIn = 0.3;
      this.ang.forEach((A, i) => {
        if (A.st === "reel" || A.st === "bite") {
          this.setState(i, "lost");
          A.msg.textContent = T("Too late!", "太晚了！");
          A.panel.style.visibility = "visible";
        }
      });
    }
    if (this.over) {
      this.endIn -= dt;
      if (this.endIn <= 0) {
        const scores = this.ang.map((A) => A.pts);
        this.finishByScore(scores, false);
      }
    }
  }

  private cast(i: number) {
    const A = this.ang[i];
    const pw = A.pw;
    this.setState(i, "cast");
    A.pw = pw;
    A.castFrom.copy(this.tip(i));
    A.tx = A.x + (this.rnd() - 0.5) * 1.6;
    A.tz = 1.4 + pw * 5.4;
    A.bob.visible = true;
    this.sound("whoosh");
    this.avatars[i].anim = "throw";
  }

  private land(i: number) {
    const A = this.ang[i];
    const f = FISH[A.fish];
    const p = this.players[i];
    A.pts += f.pts;
    A.catches++;
    this.setState(i, "catch");
    A.bob.visible = false;
    const o = this.fishProto[A.fish].clone();
    o.scale.setScalar(A.fish === "gros" ? 1.5 : A.fish === "dore" ? 1.3 : A.fish === "moyen" ? 1.15 : 0.95);
    this.scene.add(o);
    A.shown = o;
    const from = new THREE.Vector3(A.bx, 0, A.bz);
    const to = new THREE.Vector3(A.x, DECK + 2.3, PZ + 0.2);
    this.flying.push({ o, from, to, t: 0, i });
    this.fx.splash(from);
    this.hud.pop(new THREE.Vector3(A.x, DECK + 3.4, PZ), f.pts > 0 ? `+${f.pts} ${T(...f.name)}` : T(...f.name), A.fish === "dore" ? "#ffe14a" : f.pts ? "#ffffff" : "#c9b29a", this.camera);
    if (A.fish === "dore") {
      this.sound("star");
      this.fx.sparkle(to, "#ffe14a", 30);
      this.fx.confetti(to, 40);
      this.shake = 0.25;
    } else if (A.fish === "botte") this.sound("boing");
    else this.sound(f.pts >= 5 ? "coins" : "coin");
    if (f.pts > 0) this.buzz(i, 50);
    this.hud.setScore(p.seat, `🐟 ${A.pts}`);
  }

  private updateAngler(i: number, dt: number) {
    const A = this.ang[i];
    // the rod's butt between the zkSNARK's two hands (their height depends on the zkSNARK)
    const sn = this.avatars[i]?.snark;
    if (sn) {
      sn.handR.getWorldPosition(this.hR);
      sn.handL.getWorldPosition(this.hL);
      this.hR.add(this.hL).multiplyScalar(0.5);
      const k = 1 - Math.exp(-25 * dt);
      A.rod.position.lerp(this.hR, k);
    }
    A.rod.rotation.x = -A.rodPitch;
    A.bob.position.set(A.bx, A.by, A.bz);
    if (A.shown && !this.flying.some((f) => f.o === A.shown)) {
      A.shown.position.set(A.x, DECK + 2.3 + Math.sin(this.t * 6) * 0.06, PZ + 0.2);
      A.shown.rotation.y += dt * 2;
      A.shown.rotation.z = Math.sin(this.t * 14) * 0.3;
    }
    // the line: from the rod tip to the bobber (or hanging when reeled in)
    const tip = this.tip(i);
    const end = A.bob.visible ? new THREE.Vector3(A.bx, A.by + 0.1, A.bz) : tip.clone().add(new THREE.Vector3(0, -0.7, 0));
    if (A.st === "catch" && A.shown) end.copy(A.shown.position);
    const d = end.clone().sub(tip);
    const len = d.length();
    A.line.position.copy(tip).addScaledVector(d, 0.5);
    A.line.scale.set(0.014, Math.max(0.01, len), 0.014);
    A.line.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  }

  private animWorld(dt: number) {
    this.waterTex.offset.x += dt * 0.01;
    this.waterTex.offset.y += dt * 0.004;
    for (const d of this.ducks) {
      const u = d.userData as { r: number; c: THREE.Vector3; ph: number; sp: number };
      u.ph += dt * u.sp;
      d.position.set(u.c.x + Math.cos(u.ph) * u.r, Math.sin(u.ph * 9) * 0.02, u.c.z + Math.sin(u.ph) * u.r * 0.4);
      d.rotation.y = Math.atan2(-Math.sin(u.ph), Math.cos(u.ph) * 0.4) + Math.PI / 2;
    }
  }

  protected outroStep(dt: number) {
    this.animWorld(dt);
    this.ang.forEach((_, i) => this.updateAngler(i, dt));
  }
}

const def: MiniDef = {
  id: "peche",
  name: "Fishing Trip",
  icon: "🎣",
  color: "#2fb7c9",
  tagline: "Strike on time and reel in the biggest fish.",
  rules: "A to cast (farther = bigger fish). At “!” press A fast to strike, then mash A to reel… but let go when the fish pulls or the line snaps!",
  controls: { a: "Cast, strike, reel" },
  modes: ["ffa"],
  length: 45,
  music: "amsterdam",
  create: (ctx) => new Peche(ctx),
};
export default def;
