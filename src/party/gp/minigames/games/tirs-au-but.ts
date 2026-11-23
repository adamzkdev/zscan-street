/**
 * PENALTY SHOOTOUT (duel): a penalty shoot-out in a stadium at dusk, 5 kicks each, the roles
 * alternating. Shooter and goalkeeper choose in secret and at the same time: the stick direction
 * held when the 2-second clock runs out (left / centre / right of the screen). The shooter also sets
 * the power by pressing A on a moving gauge (too strong: over the bar; the gold zone: a top corner
 * nobody can stop; too weak: easy to save). A goal when the keeper guesses wrong. After 5 kicks
 * each: sudden death (up to 3 more each), then a draw.
 */
import * as THREE from "three";
import { BaseMini, type CpuPad } from "../base";
import type { MiniCtx, MiniDef, MiniResult } from "../types";
import { T } from "../../../../i18n/lang";
import { GEO, blobShadow, box, canvasTex, cyl, flat, group, toon } from "../../engine/gfx";
import { clamp, damp, lerp } from "../../engine/util";
import type { Avatar } from "../../engine/chars3d";

const GZ = 8.5; // goal line distance from the spot (-z)
const GW = 3.0; // goal half-width
const GH = 2.3; // crossbar height
const GD = 1.6; // net depth
const R = 0.22;
const CHOOSE = 2.0;
const KICKS = 5;
const SUDDEN = 3;
const WEAK = 0.3;
const PERFECT = 0.82;
const OVER = 0.92;

type Dir = -1 | 0 | 1;
type Phase = "setup" | "choose" | "kick" | "result" | "done";
type Outcome = "goal" | "corner" | "save" | "over";

/** Where the shooter waits for the run-up (a zkSNARK's big hood: a step further from the camera than the mascots stood). */
const RUN_X = -1.45;
const RUN_Z = 1.65;

class TirsAuBut extends BaseMini {
  private kick = 0;
  private goals = [0, 0];
  private taken = [0, 0];
  private marks: (boolean | null)[][] = [[], []];
  private phase: Phase = "setup";
  private phaseT = 0;
  private shooter = 0;
  private keeper = 1;
  private power = 0;
  private locked = false;
  private needle = 0;
  private shotDir: Dir = 0;
  private keepDir: Dir = 0;
  private outcome: Outcome = "goal";
  private ballMesh!: THREE.Mesh;
  private ballShadow!: THREE.Mesh;
  private bx = 0;
  private by = R;
  private bz = 0;
  private from = new THREE.Vector3();
  private to = new THREE.Vector3();
  private net!: THREE.Group;
  private netWob = 0;
  private crowd!: THREE.InstancedMesh;
  private crowdBase: THREE.Matrix4[] = [];
  private crowdPh: number[] = [];
  private cheer = 0;
  dummy = new THREE.Object3D();
  private panel!: HTMLElement;
  private rows: HTMLElement[] = [];
  private gauge!: HTMLElement;
  private needleEl!: HTMLElement;
  private chooseEl!: HTMLElement;
  private chooseNum!: HTMLElement;
  private chooseRing!: HTMLElement;
  /** CPU plans for this kick. */
  private cpuDir: Dir[] = [0, 0];
  private cpuPowerAt = 0.8;
  private history: Dir[][] = [[], []];
  private outroDone = false;
  private roles: HTMLElement[] = [];
  private diveX = 0;
  private bvx = 0;
  private bvy = 0;
  private bvz = 0;

  constructor(ctx: MiniCtx) {
    super(ctx, { sky: ["#1e2a5a", "#f0a070"], size: 12, sun: [0.3, 1, 0.9], sunColor: "#ffe8c8", sunIntensity: 2.4, hemi: ["#d8e0ff", "#4a6a3a", 1.4], fog: { near: 40, far: 110 } });
    this.buildStadium();
    this.players.forEach((p, i) => {
      const a = this.spawn(i, i === 0 ? -1 : 0, i === 0 ? 2 : -GZ + 0.6, 0);
      a.setRing(p.char.color);
      a.root.rotation.order = "YXZ";
    });
    this.hud.players(this.players, () => "⚽ 0");
    // who does what, above their heads
    this.roles = this.avatars.map((a, i) => this.hud.label(a.root, "", { dy: 2.0, color: this.players[i].char.dark }));
    this.buildHud();
    this.setCam([0, 6, 14], [0, 1.2, -GZ], 38);
    this.setupKick();
  }

  // ------------------------------------------------------------ the stadium

  private buildStadium() {
    const s = this.scene;
    const grass = canvasTex(512, 512, (g, w, h) => {
      for (let k = 0; k < 8; k++) {
        g.fillStyle = k % 2 ? "#3fa040" : "#4cb04a";
        g.fillRect(0, (k * h) / 8, w, h / 8 + 1);
      }
    }, true);
    grass.repeat.set(1, 5);
    const pitch = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshToonMaterial({ map: grass }));
    pitch.rotation.x = -Math.PI / 2;
    pitch.position.z = -10;
    pitch.receiveShadow = true;
    s.add(pitch);
    // lines: goal line, the box, the spot
    const white = flat("#ffffff");
    box(s, white, 30, 0.01, 0.1, { z: -GZ, y: 0.01, cast: false });
    box(s, white, 0.1, 0.01, 6.2, { x: -6.5, z: -GZ + 3.1, y: 0.01, cast: false });
    box(s, white, 0.1, 0.01, 6.2, { x: 6.5, z: -GZ + 3.1, y: 0.01, cast: false });
    box(s, white, 13, 0.01, 0.1, { z: -GZ + 6.2, y: 0.01, cast: false });
    box(s, white, 0.1, 0.01, 2, { x: -4, z: -GZ + 1, y: 0.01, cast: false });
    box(s, white, 0.1, 0.01, 2, { x: 4, z: -GZ + 1, y: 0.01, cast: false });
    box(s, white, 8, 0.01, 0.1, { z: -GZ + 2, y: 0.01, cast: false });
    const spot = new THREE.Mesh(GEO.circle, white);
    spot.rotation.x = -Math.PI / 2;
    spot.scale.setScalar(0.18);
    spot.position.y = 0.012;
    s.add(spot);
    const arc = new THREE.Mesh(new THREE.RingGeometry(3.1, 3.2, 40, 1, Math.PI * 0.18, Math.PI * 0.64), white);
    arc.rotation.x = -Math.PI / 2;
    arc.position.set(0, 0.012, -GZ + 6.2 - 3.2 + 0.05);
    arc.rotation.z = Math.PI;
    s.add(arc);
    // the goal
    const g = group(s, { z: -GZ });
    const post = toon("#ffffff");
    for (const sx of [-1, 1]) cyl(g, post, 0.1, GH, { x: sx * GW, y: GH / 2, seg: 12 });
    cyl(g, post, 0.1, GW * 2 + 0.2, { y: GH, rz: Math.PI / 2, seg: 12 });
    const netTex = canvasTex(128, 128, (c, w, h) => {
      c.clearRect(0, 0, w, h);
      c.strokeStyle = "#ffffff";
      c.lineWidth = 3;
      for (let k = 0; k <= w; k += 16) {
        c.beginPath();
        c.moveTo(k, 0);
        c.lineTo(k, h);
        c.stroke();
        c.beginPath();
        c.moveTo(0, k);
        c.lineTo(w, k);
        c.stroke();
      }
    }, true);
    netTex.repeat.set(6, 2);
    const netMat = new THREE.MeshBasicMaterial({ map: netTex, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, color: "#f0f0f0" });
    this.net = group(g);
    const back = new THREE.Mesh(GEO.plane, netMat);
    back.scale.set(GW * 2, GH, 1);
    back.position.set(0, GH / 2, -GD);
    this.net.add(back);
    const roof = new THREE.Mesh(GEO.plane, netMat);
    roof.scale.set(GW * 2, GD, 1);
    roof.rotation.x = Math.PI / 2;
    roof.position.set(0, GH, -GD / 2);
    this.net.add(roof);
    for (const sx of [-1, 1]) {
      const sd = new THREE.Mesh(GEO.plane, netMat);
      sd.scale.set(GD, GH, 1);
      sd.rotation.y = Math.PI / 2;
      sd.position.set(sx * GW, GH / 2, -GD / 2);
      this.net.add(sd);
    }
    // advertising boards (abstract shapes only) and the stands
    const adTex = canvasTex(512, 64, (c, w, h) => {
      const cols = ["#ff4b3e", "#2f8dff", "#ffd23f", "#3fcf5a"];
      for (let k = 0; k < 4; k++) {
        c.fillStyle = cols[k];
        c.fillRect((k * w) / 4, 0, w / 4, h);
        c.fillStyle = "#ffffff";
        const word = ["GO!", "GOAL!", "ZCASH", "BRAVO!"][k];
        let px = 40;
        c.font = `800 ${px}px Geist, Roboto, sans-serif`;
        while (px > 20 && c.measureText(word).width > w / 4 - 14) c.font = `800 ${(px -= 2)}px Geist, Roboto, sans-serif`;
        c.textAlign = "center";
        c.textBaseline = "middle";
        c.fillText(word, (k + 0.5) * (w / 4), h / 2 + 2);
      }
    }, true);
    adTex.repeat.set(3, 1);
    const ad = new THREE.Mesh(GEO.box, [toon("#222"), toon("#222"), toon("#333"), toon("#222"), new THREE.MeshBasicMaterial({ map: adTex }), toon("#222")]);
    ad.scale.set(34, 0.9, 0.2);
    ad.position.set(0, 0.45, -GZ - 3.4);
    s.add(ad);
    const standMat = toon("#5a6070");
    for (let r = 0; r < 7; r++) box(s, r % 2 ? "#4a5060" : standMat, 48, 0.8, 1.4, { y: 0.4 + r * 0.8, z: -GZ - 5 - r * 1.4 });
    for (const sx of [-1, 1]) {
      const side = group(s, { x: sx * 17, z: -GZ + 2, ry: -sx * 0.5 });
      for (let r = 0; r < 5; r++) box(side, r % 2 ? "#4a5060" : standMat, 1.4, 0.8, 18, { x: sx * r * 1.4, y: 0.4 + r * 0.8 });
    }
    // the crowd (instanced): rows of fans in the two teams' colours behind the goal
    const n = 7 * 30;
    const body = new THREE.CapsuleGeometry(0.28, 0.4, 4, 8);
    this.crowd = new THREE.InstancedMesh(body, new THREE.MeshToonMaterial({ color: "#ffffff" }), n);
    const col = new THREE.Color();
    const fanCols = [this.players[0].char.color, this.players[1].char.color, "#ffffff", "#ffd23f", "#3a3a4a"];
    let k = 0;
    for (let r = 0; r < 7; r++)
      for (let c = 0; c < 30; c++) {
        const x = -21 + c * 1.45 + (r % 2) * 0.7;
        const m = new THREE.Matrix4().makeTranslation(x, 1.25 + r * 0.8, -GZ - 5 - r * 1.4);
        this.crowdBase.push(m);
        this.crowdPh.push(Math.random() * 6);
        this.crowd.setMatrixAt(k, m);
        // each half of the stand mostly wears one player's colour
        col.set(Math.random() < 0.6 ? fanCols[c < 15 ? 0 : 1] : fanCols[2 + Math.floor(Math.random() * 3)]);
        this.crowd.setColorAt(k, col);
        k++;
      }
    this.crowd.castShadow = false;
    s.add(this.crowd);
    // floodlights
    for (const sx of [-1, 1]) {
      const fl = group(s, { x: sx * 19, z: -GZ - 9 });
      cyl(fl, "#8a8f9e", 0.25, 16, { y: 8, seg: 8 });
      box(fl, "#3a3a46", 3.2, 2, 0.4, { y: 16.5, rx: 0.3 });
      for (let a = 0; a < 3; a++) for (let b = 0; b < 2; b++) {
        const l = box(fl, flat("#fffbe0"), 0.8, 0.7, 0.05, { x: -1 + a, y: 16.1 + b * 0.85, z: 0.25, rx: 0.3 });
        l.castShadow = false;
      }
    }
    // the ball
    const bt = canvasTex(128, 64, (c, w, h) => {
      c.fillStyle = "#ffffff";
      c.fillRect(0, 0, w, h);
      c.fillStyle = "#1d1630";
      for (let q = 0; q < 6; q++) {
        c.beginPath();
        const cx = (q / 6) * w + 10,
          cy = q % 2 ? h * 0.3 : h * 0.72;
        for (let v = 0; v < 5; v++) c.lineTo(cx + Math.cos((v / 5) * Math.PI * 2) * 8, cy + Math.sin((v / 5) * Math.PI * 2) * 8);
        c.fill();
      }
    });
    this.ballMesh = new THREE.Mesh(GEO.sphere, new THREE.MeshToonMaterial({ map: bt }));
    this.ballMesh.scale.setScalar(R);
    this.ballMesh.castShadow = true;
    s.add(this.ballMesh);
    this.ballShadow = blobShadow(R * 1.2, 0.45);
    s.add(this.ballShadow);
  }

  private buildHud() {
    const u = (n: number) => `calc(var(--u)*${n})`;
    this.panel = this.hud.add(
      `<div style="position:absolute;left:50%;top:${u(1.2)};transform:translateX(-50%);padding:${u(0.6)} ${u(1.4)};border-radius:${u(2)};background:rgba(20,14,40,.78);border:${u(0.3)} solid #fff;display:flex;flex-direction:column;gap:${u(0.4)}">
        ${this.players
          .map(
            (p) =>
              `<div style="display:flex;align-items:center;gap:${u(0.8)}"><div style="width:${u(10)};font-weight:700;font-size:${u(1.5)};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:${p.char.color}">${p.name}</div><div class="row" style="display:flex;gap:${u(0.5)}"></div></div>`,
          )
          .join("")}
      </div>`,
    );
    this.rows = [...this.panel.querySelectorAll(".row")] as HTMLElement[];
    this.gauge = this.hud.add(
      `<div style="position:absolute;right:${u(4)};top:50%;transform:translateY(-50%);width:${u(4)};height:${u(30)};border-radius:${u(2)};border:${u(0.4)} solid #1d1630;overflow:hidden;background:linear-gradient(0deg,#ffd23f 0 ${WEAK * 100}%,#3fcf5a ${WEAK * 100}% ${PERFECT * 100}%,#ffb000 ${PERFECT * 100}% ${OVER * 100}%,#ff4b3e ${OVER * 100}% 100%);box-shadow:0 ${u(0.4)} 0 rgba(0,0,0,.35)">
        <div class="nd" style="position:absolute;left:-${u(0.2)};right:-${u(0.2)};height:${u(0.8)};bottom:0;background:#fff;border:${u(0.25)} solid #1d1630;transform:translateY(50%)"></div>
      </div>
      <div style="position:absolute;right:${u(2.6)};top:calc(50% + ${u(16.5)});width:${u(7)};text-align:center;font-family:var(--title);font-size:${u(1.8)};color:#fff;-webkit-text-stroke:${u(0.2)} #1d1630;paint-order:stroke fill">${T("POWER", "力量")}</div>`,
    );
    this.needleEl = this.gauge.querySelector(".nd") as HTMLElement;
    this.chooseEl = this.hud.add(
      `<div style="position:absolute;left:21%;top:${u(21)};transform:translate(-50%,-50%);text-align:center">
        <div style="position:relative;width:${u(10)};height:${u(10)};margin:0 auto">
          <div class="rg" style="position:absolute;inset:0;border-radius:50%;background:conic-gradient(#ffd23f 0deg, rgba(255,255,255,.15) 0deg);border:${u(0.4)} solid #1d1630"></div>
          <div class="nm" style="position:absolute;inset:${u(1.3)};border-radius:50%;background:#1d1630;display:grid;place-items:center;font-family:var(--title);font-size:${u(5)};color:#fff">2</div>
        </div>
        <div style="margin-top:${u(0.8)};font-family:var(--title);font-size:${u(3)};color:#fff;-webkit-text-stroke:${u(0.3)} #1d1630;paint-order:stroke fill;white-space:nowrap">${T("Choose in secret!", "秘密选择！")}</div>
        <div style="margin-top:${u(0.3)};font-weight:700;font-size:${u(1.6)};text-shadow:0 2px 6px rgba(0,0,0,.7);white-space:nowrap">${T("Stick left, centre or right", "摇杆：左、中或右")}</div>
      </div>`,
    );
    this.chooseNum = this.chooseEl.querySelector(".nm") as HTMLElement;
    this.chooseRing = this.chooseEl.querySelector(".rg") as HTMLElement;
    this.chooseEl.style.display = "none";
    this.gauge.style.display = "none";
    this.drawRows();
  }

  private drawRows() {
    const n = Math.max(KICKS, this.taken[0], this.taken[1]);
    this.rows.forEach((row, i) => {
      let h = "";
      for (let k = 0; k < n; k++) {
        const m = this.marks[i][k];
        const bg = m === true ? "#3fcf5a" : m === false ? "#ff4b3e" : "rgba(255,255,255,.18)";
        const t = m === true ? "✓" : m === false ? "✕" : "";
        h += `<div style="width:calc(var(--u)*2.4);height:calc(var(--u)*2.4);border-radius:50%;background:${bg};border:calc(var(--u)*0.2) solid ${k >= KICKS ? "#ffd23f" : "#fff"};display:grid;place-items:center;font-weight:800;font-size:calc(var(--u)*1.4);color:#fff">${t}</div>`;
      }
      row.innerHTML = h;
    });
  }

  // ------------------------------------------------------------ the kicks

  private setupKick() {
    this.shooter = this.kick % 2;
    this.keeper = 1 - this.shooter;
    this.phase = "setup";
    this.phaseT = 0;
    this.locked = false;
    this.power = 0;
    this.bx = 0;
    this.by = R;
    this.bz = 0;
    this.netWob = 0;
    this.bvx = this.bvy = this.bvz = 0;
    const sa = this.avatars[this.shooter],
      ka = this.avatars[this.keeper];
    sa.pos.set(RUN_X, 0, RUN_Z);
    sa.yaw = Math.PI - 0.35;
    sa.anim = "idle";
    sa.root.rotation.set(0, sa.yaw, 0);
    ka.pos.set(0, 0, -GZ + 0.5);
    ka.yaw = 0;
    ka.anim = "idle";
    ka.root.rotation.set(0, 0, 0);
    const sudden = this.kick >= KICKS * 2;
    const ps = this.players[this.shooter],
      pk = this.players[this.keeper];
    const nk = Math.floor(this.kick / 2) + 1;
    this.hud.banner(sudden ? T("SUDDEN DEATH!", "骤死赛！") : T(`Kick ${nk}`, `第 ${nk} 球`), { size: 5.5, ms: 900, color: sudden ? "#ff8a5a" : "#fff", sub: T(`${ps.name} shoots · ${pk.name} keeps`, `${ps.name} 射门 · ${pk.name} 守门`) });
    this.players.forEach((p) => this.hud.mark(p.seat, "hot", p.i === this.shooter));
    this.roles.forEach((el, i) => (el.innerHTML = `${this.players[i].name} · ${i === this.shooter ? T("SHOOTER", "射手") : T("KEEPER", "门将")}`));
    // CPU plans: a side (a good keeper reads a human's habits), and the moment to press A
    this.players.forEach((p, i) => {
      if (!p.cpu) return;
      const other = this.history[1 - i];
      let l = 0.4,
        c = 0.2;
      if (other.length >= 2 && !this.players[1 - i].cpu) {
        const left = other.filter((d) => d < 0).length / other.length;
        const ctr = other.filter((d) => d === 0).length / other.length;
        const w = 0.5 * p.level;
        l = lerp(0.4, left, w);
        c = lerp(0.2, ctr, w);
      }
      const r = Math.random();
      this.cpuDir[i] = r < l ? -1 : r < l + c ? 0 : 1;
    });
    const lv = this.players[this.shooter].level;
    const want = lv > 0.75 && Math.random() < lv - 0.3 ? 0.86 : 0.55 + 0.2 * lv;
    // the needle goes 0→1→0 in a second: time when it reaches `want` on the way up, plus error
    const err = (Math.random() - 0.5) * (0.42 - 0.36 * lv);
    this.cpuPowerAt = 1.0 + want / 2 + err;
    this.sound("whistle");
  }

  private readDir(i: number): Dir {
    const x = this.pad(i).x;
    return x < -0.35 ? -1 : x > 0.35 ? 1 : 0;
  }

  protected cpu(i: number): CpuPad {
    if (this.phase !== "choose") return {};
    const pad: CpuPad = { x: this.cpuDir[i] * 0.9 };
    if (i === this.shooter && !this.locked && this.phaseT >= this.cpuPowerAt) pad.a = true;
    return pad;
  }

  start() {
    this.hud.tip(T(`Shooter: stick + <span class="key a">A</span> for power · Keeper: stick`, `射手：摇杆 + <span class="key a">A</span> 蓄力 · 门将：摇杆`));
  }

  protected idle(dt: number) {
    this.moveCam([0.7, 2.9, 6.9], [0.2, 1.15, -GZ], dt, 1.4);
    this.animateCrowd(dt);
    this.drawBall();
  }

  protected step(dt: number) {
    this.phaseT += dt;
    if (this.phase === "setup") {
      this.moveCam([0.7, 2.9, 6.9], [0.2, 1.15, -GZ], dt, 3);
      if (this.phaseT > 0.8) {
        this.phase = "choose";
        this.phaseT = 0;
        this.chooseEl.style.display = "";
        this.gauge.style.display = "";
        this.sound("tick");
      }
    } else if (this.phase === "choose") {
      const left = CHOOSE - this.phaseT;
      const n = Math.max(1, Math.ceil(left));
      if (this.chooseNum.textContent !== String(n)) {
        this.chooseNum.textContent = String(n);
        this.sound("tick");
      }
      this.chooseRing.style.background = `conic-gradient(#ffd23f ${(1 - left / CHOOSE) * 360}deg, rgba(255,255,255,.15) 0deg)`;
      // the power gauge (the needle bounces up and down until A)
      if (!this.locked) {
        const ph = (this.phaseT * 2 + 0.0) % 2;
        this.needle = ph < 1 ? ph : 2 - ph;
        if (this.pad(this.shooter).aDown) {
          this.locked = true;
          this.power = this.needle;
          this.sound("click");
          this.buzz(this.shooter, 40);
          this.needleEl.style.background = "#ffd23f";
        }
      }
      this.needleEl.style.bottom = `${this.needle * 100}%`;
      if (!this.locked) this.needleEl.style.background = "#fff";
      if (left <= 0) {
        // the secret choices: the sticks as they are now
        this.shotDir = this.readDir(this.shooter);
        this.keepDir = this.readDir(this.keeper);
        if (!this.locked) this.power = this.needle;
        this.history[this.shooter].push(this.shotDir);
        this.history[this.keeper].push(this.keepDir);
        this.resolve();
        this.chooseEl.style.display = "none";
        this.phase = "kick";
        this.phaseT = 0;
        this.sound("go");
      }
      this.moveCam([0.7, 2.9, 6.9], [0.2, 1.15, -GZ], dt, 3);
    } else if (this.phase === "kick") {
      this.animateKick(dt);
    } else if (this.phase === "result") {
      this.animateKick(dt);
      if (this.phaseT > 1.5) this.next();
    }
    this.animateCrowd(dt);
    this.drawBall();
  }

  private resolve() {
    const p = this.power;
    const corner = this.shotDir !== 0;
    if (p > OVER) this.outcome = "over";
    else if (p >= PERFECT && corner) this.outcome = this.keepDir === this.shotDir ? "corner" : "goal";
    else if (p < WEAK) this.outcome = this.keepDir === this.shotDir || this.keepDir === 0 ? "save" : "goal";
    else this.outcome = this.keepDir === this.shotDir ? "save" : "goal";
    // where the ball goes
    const x = this.shotDir * (GW - 0.6);
    const y = p > OVER ? GH + 1.3 + (p - OVER) * 8 : p >= PERFECT ? GH - 0.45 : p < WEAK ? R + 0.05 : 0.5 + (p - WEAK) * 1.4;
    this.from.set(0, R, 0);
    // the keeper's dive (a centred keeper stretches toward a weak shot)
    this.diveX = this.keepDir * (GW - 1.1);
    if (this.outcome === "save" && this.keepDir === 0 && this.shotDir !== 0) this.diveX = this.shotDir * 1.3;
    if (this.outcome === "save") this.to.set(this.diveX, clamp(y, 0.45, 1.4), -GZ + 0.75);
    else if (this.outcome === "over") this.to.set(x, y, -GZ - 4);
    else this.to.set(x, y, -GZ - GD + 0.3);
  }

  private animateKick(dt: number) {
    const t = this.phaseT;
    const sa = this.avatars[this.shooter],
      ka = this.avatars[this.keeper];
    const RUN = 0.55;
    const FLY = this.power < WEAK ? 0.85 : 0.6 - this.power * 0.15;
    if (this.phase === "kick") {
      // the run-up
      if (t < RUN) {
        const k = t / RUN;
        sa.anim = "run";
        sa.speed = 0.8;
        sa.pos.set(lerp(RUN_X, -0.4, k), 0, lerp(RUN_Z, 0.45, k));
        sa.yaw = Math.PI - 0.35;
      } else {
        sa.anim = "throw";
        // the ball flies
        const k = clamp((t - RUN) / FLY, 0, 1);
        if (t - dt < RUN) {
          this.sound("hit");
          this.shake = 0.15;
          this.fx.burst({ x: 0, y: 0.2, z: 0 }, { count: 12, colors: ["#ffffff", "#8fd16a"], speed: 3, size: 0.1, life: 0.4, shape: "ball" });
          this.buzz(this.shooter, 50);
        }
        if (this.outcome === "save" && k >= 0.85) {
          // the keeper gets a hand to it: deflected
          if (this.bvz === 0) this.deflect();
          this.bx += this.bvx * dt;
          this.by = Math.max(R, this.by + this.bvy * dt);
          this.bvy -= 12 * dt;
          this.bz += this.bvz * dt;
        } else {
          this.bx = lerp(this.from.x, this.to.x, k);
          this.bz = lerp(this.from.z, this.to.z, k);
          this.by = lerp(this.from.y, this.to.y, k) + Math.sin(k * Math.PI) * (this.power < WEAK ? 0.1 : 0.6);
        }
        if ((this.outcome !== "save" && k >= 1) || (this.outcome === "save" && t > RUN + FLY * 0.85 + 0.25)) this.reveal();
      }
      // the keeper dives when the ball is struck
      this.dive(ka, clamp((t - RUN + 0.05) / 0.4, 0, 1), dt);
    } else {
      // the keeper: lies beaten in the grass, or gets up to celebrate
      const scored = this.outcome === "goal" || this.outcome === "corner";
      ka.pos.y = damp(ka.pos.y, scored ? 0.15 : 0, 6, dt);
      if (this.outcome === "save") {
        this.bx += this.bvx * dt;
        this.bz += this.bvz * dt;
        this.bvy -= 12 * dt;
        this.by += this.bvy * dt;
        if (this.by < R) {
          this.by = R;
          this.bvy = Math.abs(this.bvy) * 0.5;
          this.bvx *= 0.7;
          this.bvz *= 0.7;
        }
      } else if (this.outcome === "over") {
        this.bz -= 6 * dt;
        this.by += 1.5 * dt;
      }
      sa.anim = scored ? "win" : "lose";
      ka.anim = scored ? "lose" : "win";
      if (!scored) ka.root.rotation.z = damp(ka.root.rotation.z, 0, 5, dt);
    }
    if (this.netWob > 0) {
      this.netWob = Math.max(0, this.netWob - dt * 1.5);
      this.net.scale.z = 1 + Math.sin(this.t * 25) * 0.25 * this.netWob + 0.15 * this.netWob;
    }
    const push = this.phase === "kick" && t > RUN ? 1 : this.phase === "result" ? 1 : 0;
    this.moveCam([0.7 + this.bx * 0.2, 2.8 - push * 0.3, 6.9 - push * 2.4], [0.2 + this.bx * 0.4, 1.1, -GZ], dt, 2.2);
  }

  private deflect() {
    this.bvx = (this.shotDir || (Math.random() < 0.5 ? -1 : 1)) * 3;
    this.bvy = 4;
    this.bvz = 5;
    this.sound("bonk");
    this.fx.burst({ x: this.bx, y: this.by, z: this.bz }, { count: 14, colors: ["#ffffff", "#ffe14a"], speed: 4, size: 0.12, life: 0.4, shape: "ball" });
  }

  private dive(a: Avatar, k: number, dt: number) {
    if (k <= 0) return;
    const e = 1 - (1 - k) * (1 - k);
    a.anim = "jump";
    if (this.diveX === 0) a.pos.set(0, Math.sin(Math.min(1, k) * Math.PI) * 0.7, -GZ + 0.5);
    else {
      const d = Math.sign(this.diveX);
      a.pos.set(e * this.diveX, Math.sin(Math.min(1, k) * Math.PI) * 0.75 + e * 0.25, -GZ + 0.5);
      a.root.rotation.z = damp(a.root.rotation.z, -d * 1.35, 12, dt);
    }
  }

  private reveal() {
    if (this.phase !== "kick") return;
    this.phase = "result";
    this.phaseT = 0;
    const s = this.shooter;
    const scored = this.outcome === "goal" || this.outcome === "corner";
    this.marks[s][this.taken[s]] = scored;
    this.taken[s]++;
    if (scored) {
      this.goals[s]++;
      this.hud.setScore(this.players[s].seat, `⚽ ${this.goals[s]}`);
      this.netWob = 1;
      this.cheer = 1;
      this.shake = 0.4;
      this.sound("explode");
      this.sound("cheer");
      this.fx.confetti({ x: this.bx, y: 2.5, z: -GZ }, 60);
      this.hud.banner(this.outcome === "corner" ? T("TOP CORNER!", "死角！") : T("GOAL!", "进球！"), { color: this.players[s].char.color, size: 11, ms: 1300, sub: this.outcome === "corner" ? T("Unstoppable!", "无法扑救！") : undefined });
      this.buzz(s, [60, 40, 120]);
    } else if (this.outcome === "save") {
      this.cheer = 0.6;
      this.sound("aww");
      this.hud.banner(T("SAVED!", "扑救！"), { color: this.players[this.keeper].char.color, size: 10, ms: 1300, sub: T(`${this.players[this.keeper].name} guessed it!`, `${this.players[this.keeper].name} 猜对了！`) });
      this.buzz(this.keeper, [60, 40, 120]);
    } else {
      this.sound("aww");
      this.hud.banner(T("OVER THE BAR!", "踢飞了！"), { color: "#ff8a5a", size: 9, ms: 1300, sub: T("Too hard…", "太大力了……") });
    }
    this.drawRows();
  }

  /** Is the shoot-out over? */
  private decided(): number | "draw" | null {
    const [g0, g1] = this.goals;
    const [t0, t1] = this.taken;
    if (t0 <= KICKS && t1 <= KICKS) {
      // the regular five: stop as soon as one can't catch up
      if (g0 + (KICKS - t0) < g1) return 1;
      if (g1 + (KICKS - t1) < g0) return 0;
      if (t0 === KICKS && t1 === KICKS && g0 !== g1) return g0 > g1 ? 0 : 1;
      return null;
    }
    // sudden death: after each pair of kicks
    if (t0 === t1) {
      if (g0 !== g1) return g0 > g1 ? 0 : 1;
      if (t0 >= KICKS + SUDDEN) return "draw";
    }
    return null;
  }

  private next() {
    this.kick++;
    const d = this.decided();
    if (d !== null) {
      this.phase = "done";
      this.gauge.style.display = "none";
      this.hud.tip(null);
      this.players.forEach((p) => this.hud.mark(p.seat, "hot", false));
      this.roles.forEach((el) => this.hud.removeLabel(el));
      if (d === "draw") this.finish([1, 1]);
      else this.finishByScore(this.players.map((_, i) => (i === d ? 1 : 0)));
      return;
    }
    this.setupKick();
  }

  // ------------------------------------------------------------ drawing

  private drawBall() {
    this.ballMesh.position.set(this.bx, this.by, this.bz);
    if (this.phase === "kick" || (this.phase === "result" && this.outcome !== "goal" && this.outcome !== "corner")) this.ballMesh.rotation.x -= 0.25;
    this.ballShadow.position.set(this.bx, 0.02, this.bz);
    this.ballShadow.scale.setScalar(R * 2.4 * clamp(1.2 - this.by * 0.15, 0.4, 1.2));
  }

  private animateCrowd(dt: number) {
    this.cheer = Math.max(0, this.cheer - dt * 0.35);
    const m = new THREE.Matrix4();
    for (let k = 0; k < this.crowdBase.length; k++) {
      this.crowdPh[k] += dt * (3 + 9 * this.cheer);
      const y = Math.abs(Math.sin(this.crowdPh[k])) * (0.04 + 0.4 * this.cheer);
      m.copy(this.crowdBase[k]);
      m.elements[13] += y;
      this.crowd.setMatrixAt(k, m);
    }
    this.crowd.instanceMatrix.needsUpdate = true;
  }

  /** The kicking leg. */
  private rig() {
    if (this.phase !== "kick" && this.phase !== "result") return;
    const sa = this.avatars[this.shooter];
    const t = this.phaseT;
    if (this.phase === "kick" && t > 0.45 && t < 0.85) {
      const k = clamp((t - 0.45) / 0.2, 0, 1);
      sa.rig.legR.rotation.x = lerp(0.6, -1.5, k);
      sa.rig.legL.rotation.x = 0.1;
    }
  }

  update(dt: number) {
    super.update(dt);
    this.rig();
  }

  protected celebrate(res: MiniResult) {
    this.avatars.forEach((a, i) => {
      a.root.rotation.z = 0;
      a.anim = res.place[i] === 1 && res.place[1 - i] !== 1 ? "win" : "lose";
    });
  }

  protected outroStep(dt: number) {
    if (!this.outroDone) {
      this.outroDone = true;
      // both walk to the middle in front of the goal
      this.avatars[0].pos.set(-1, 0, -3);
      this.avatars[1].pos.set(1, 0, -3);
      this.avatars.forEach((a) => (a.root.rotation.z = 0));
    }
    this.avatars.forEach((a) => a.face(0, dt, 6));
    this.animateCrowd(dt);
    this.moveCam([0, 2.2, 2.5], [0, 1.0, -3], dt, 2);
  }
}

const def: MiniDef = {
  id: "tirs-au-but",
  name: "Penalty Shootout",
  icon: "⚽",
  color: "#3a9a4a",
  tagline: "Shooter or keeper: guess the right side.",
  rules: "Shooter and keeper pick in secret: where the stick points when the clock ends (left, centre, right). The shooter presses A for power: too hard flies over! 5 kicks each.",
  controls: { stick: "Pick a side (in secret)", a: "Power (shooter)" },
  modes: ["duel"],
  length: 50,
  music: "tense",
  create: (ctx) => new TirsAuBut(ctx),
};
export default def;
