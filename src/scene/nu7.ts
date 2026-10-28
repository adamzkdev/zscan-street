import * as THREE from "three";
import { ZScan } from "../data/zscan";
import type { City } from "./city";
import type { Decor } from "./decor";
import { CURB } from "./city";

/** Fireworks particles in flight at most (one draw call). */
const SPARKS = 2400;
const PER_BURST = 180;
/** How long the city celebrates the activation (seconds). */
const PARTY = 120;
const COLORS = ["#f4b728", "#3ee08f", "#b07bff", "#3ef0ff", "#ff3e8a", "#ffffff"];

/**
 * The NU7 network upgrade in the city. Until it activates, every LED screen takes a turn counting
 * down (to the announced date, or in blocks once the height is set). When the chain reaches the
 * activation height the sky fills with fireworks for two minutes, and a neon sign lights up on the
 * Proof Factory's roof for the Network Sustainability Mechanism (60% of fees to a reserve). It
 * stays lit afterwards. `?nu7=next` (or `?nu7=<height>`) pretends NU7 activates at that height,
 * to rehearse.
 */
export class Nu7 {
  height: number | null = null;
  date: string | null = null;
  activated = false;
  private tip: number | null = null;
  private partyUntil = -1;
  private nextBurst = 0;
  private override: string | null = new URLSearchParams(location.search).get("nu7");
  private sparks: THREE.InstancedMesh;
  private trails: THREE.LineSegments;
  private trailPos = new Float32Array(SPARKS * 6);
  private trailColor = new Float32Array(SPARKS * 6);
  private sparkScale = new Float32Array(SPARKS);
  private pos = new Float32Array(SPARKS * 3);
  private vel = new Float32Array(SPARKS * 3);
  private life = new Float32Array(SPARKS);
  private head = 0;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3();
  private c = new THREE.Color();
  private sign: THREE.Group | null = null;
  private clock = 0;

  constructor(
    scene: THREE.Scene,
    private city: City,
    private decor: Decor,
  ) {
    this.sparks = new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, 0.16, 0.16), new THREE.MeshBasicMaterial({ toneMapped: false }), SPARKS);
    this.sparks.frustumCulled = false;
    this.sparks.setColorAt(0, this.c.set("#fff"));
    this.sparks.count = 0;
    scene.add(this.sparks);
    const trails = new THREE.BufferGeometry();
    trails.setAttribute("position", new THREE.BufferAttribute(this.trailPos, 3).setUsage(THREE.DynamicDrawUsage));
    trails.setAttribute("color", new THREE.BufferAttribute(this.trailColor, 3).setUsage(THREE.DynamicDrawUsage));
    this.trails = new THREE.LineSegments(trails, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    this.trails.frustumCulled = false;
    this.trails.visible = false;
    scene.add(this.trails);
    this.life.fill(0);
    void this.poll();
    setInterval(() => void this.poll(), 10 * 60_000);
  }

  private async poll() {
    const u = await ZScan.upgrades();
    const n = u?.upgrades.find((x) => x.name.toLowerCase() === "nu7");
    if (n) {
      this.height = n.activation_height;
      this.date = (n as { announced_date?: string | null }).announced_date ?? null;
      if (n.activated) this.activated = true;
    }
    if (u) this.tip = Math.max(this.tip ?? 0, u.height);
    this.applyOverride();
    this.push();
  }

  private applyOverride() {
    const o = this.override;
    if (!o || !this.tip) return;
    const h = o === "next" ? this.tip + 1 : Number(o);
    if (Number.isFinite(h)) {
      this.height = h;
      this.override = null; // fixed once: the live tip moves on from here
    }
  }

  private push() {
    this.decor.setLive({ nu7: { height: this.height, date: this.date, activated: this.activated } });
    if (this.activated) this.lightSign();
  }

  /** The latest block on the street: activation is the moment the tip reaches NU7's height. */
  setTip(h: number | null) {
    if (h === null) return;
    const was = this.tip;
    this.tip = Math.max(this.tip ?? 0, h);
    this.applyOverride();
    if (!this.activated && this.height !== null && this.tip >= this.height) {
      this.activated = true;
      // a visitor who arrives within the hour still gets the party, a shorter one
      const fresh = was !== null && was < this.height;
      this.party(fresh ? PARTY : 30);
      this.push();
    }
  }

  /** Fireworks over the city for `seconds`. */
  party(seconds = PARTY) {
    this.partyUntil = Math.max(this.partyUntil, this.clock + seconds);
    this.nextBurst = this.clock;
  }

  /** `focus` is where the camera looks: the bursts go up around it, wherever that is in the city. */
  update(dt: number, focus?: THREE.Vector3, camera?: THREE.Camera) {
    this.clock += dt;
    if (this.clock < this.partyUntil && this.clock >= this.nextBurst) {
      this.burst(focus, camera);
      this.nextBurst = this.clock + 0.35 + Math.random() * 0.6;
    }
    let alive = 0;
    for (let i = 0; i < SPARKS; i++) {
      if (this.life[i] <= 0) continue;
      alive++;
      const o = i * 3;
      this.vel[o + 1] -= 9.8 * 0.35 * dt;
      this.vel[o] *= 1 - 0.9 * dt;
      this.vel[o + 1] *= 1 - 0.6 * dt;
      this.vel[o + 2] *= 1 - 0.9 * dt;
      this.pos[o] += this.vel[o] * dt;
      this.pos[o + 1] += this.vel[o + 1] * dt;
      this.pos[o + 2] += this.vel[o + 2] * dt;
      this.life[i] -= dt;
    }
    if (!alive && this.sparks.count === 0) return;
    for (let i = 0; i < SPARKS; i++) {
      const o = i * 3;
      const k = Math.max(0, Math.min(1, this.life[i] / 1.2));
      this.v.set(this.pos[o], this.pos[o + 1], this.pos[o + 2]);
      this.s.setScalar(this.life[i] > 0 ? (0.4 + k) * this.sparkScale[i] : 0);
      this.m.compose(this.v, this.q, this.s);
      this.sparks.setMatrixAt(i, this.m);
      for (let axis = 0; axis < 3; axis++) {
        this.trailPos[i * 6 + axis] = this.pos[o + axis];
        this.trailPos[i * 6 + 3 + axis] = this.pos[o + axis] - this.vel[o + axis] * 0.2;
        const color = this.life[i] > 0 ? this.sparks.instanceColor!.array[o + axis] * k : 0;
        this.trailColor[i * 6 + axis] = color;
        this.trailColor[i * 6 + 3 + axis] = color * 0.06;
      }
    }
    this.sparks.count = alive ? SPARKS : 0;
    this.sparks.instanceMatrix.needsUpdate = true;
    this.trails.visible = alive > 0;
    this.trails.geometry.getAttribute("position").needsUpdate = true;
    this.trails.geometry.getAttribute("color").needsUpdate = true;
  }

  private burst(focus?: THREE.Vector3, camera?: THREE.Camera) {
    // within ~40 m of where the camera looks (the diorama's centre without one)
    const fx = focus?.x ?? 0,
      fz = focus?.z ?? -3;
    let cx = fx, cz = fz, cy = CURB + 24;
    // Clear the real roofline, including the burst's radius. The old fixed 13–22 m altitude
    // put almost every shell inside a building when the camera was near the towers.
    const point = new THREE.Vector3();
    const projected = new THREE.Vector3();
    const cameraAt = camera?.getWorldPosition(new THREE.Vector3());
    const span = camera instanceof THREE.OrthographicCamera ? (camera.top - camera.bottom) / camera.zoom
      : camera instanceof THREE.PerspectiveCamera ? cameraAt!.distanceTo(focus ?? point) * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * 2 : 100;
    const scale = THREE.MathUtils.clamp(span / 100, 1, 3);
    const sight = new THREE.Ray();
    const intersection = new THREE.Vector3();
    camera?.updateMatrixWorld(true);
    for (let attempt = 0; attempt < (camera ? 48 : 1); attempt++) {
      cx = fx + (Math.random() - 0.5) * 90;
      cz = fz + (Math.random() - 0.5) * 75;
      let roof = Math.max(CURB + 12, (focus?.y ?? 0) - 5);
      for (const { box } of this.city.occluders) {
        if (cx >= box.min.x - 10 && cx <= box.max.x + 10 && cz >= box.min.z - 10 && cz <= box.max.z + 10)
          roof = Math.max(roof, box.max.y);
      }
      cy = roof + 18 * scale + Math.random() * 6;
      if (!camera) break;
      projected.copy(point.set(cx, cy, cz)).project(camera);
      if (Math.abs(projected.x) >= 0.85 || Math.abs(projected.y) >= 0.8 || projected.z <= -1 || projected.z >= 1) continue;
      sight.set(cameraAt!, point.clone().sub(cameraAt!).normalize());
      const distance = cameraAt!.distanceTo(point);
      const blocked = this.city.occluders.some(({ box }) => sight.intersectBox(box, intersection) && cameraAt!.distanceTo(intersection) < distance - 2);
      if (!blocked) break;
    }
    const color = this.c.set(COLORS[Math.floor(Math.random() * COLORS.length)]).multiplyScalar(2.2).clone();
    const speed = (9 + Math.random() * 4) * scale;
    for (let k = 0; k < PER_BURST; k++) {
      const i = this.head;
      this.head = (this.head + 1) % SPARKS;
      // directions spread over a sphere
      const u = Math.random() * 2 - 1,
        a = Math.random() * Math.PI * 2,
        r = Math.sqrt(1 - u * u);
      const o = i * 3;
      this.pos[o] = cx;
      this.pos[o + 1] = cy;
      this.pos[o + 2] = cz;
      const sp = speed * (0.75 + Math.random() * 0.25);
      this.vel[o] = r * Math.cos(a) * sp;
      this.vel[o + 1] = u * sp;
      this.vel[o + 2] = r * Math.sin(a) * sp;
      this.life[i] = 2.1 + Math.random() * 0.9;
      this.sparkScale[i] = scale;
      this.sparks.setColorAt(i, color);
    }
    if (this.sparks.instanceColor) this.sparks.instanceColor.needsUpdate = true;
  }

  /** The NSM sign on the Proof Factory's roof (lit once NU7 is live). */
  private lightSign() {
    if (this.sign || !this.city.factory) return;
    const roof = this.city.factory.roof;
    const hall = roof ?? this.city.factory.hall;
    const occ = this.city.occluders.find((o) => o.box.containsPoint(new THREE.Vector3(hall.x, CURB + 1, hall.z)));
    const top = roof ? roof.y : occ ? occ.box.max.y : CURB + 10;
    const front = roof ? roof.z : occ ? occ.box.max.z : hall.z + 4;
    const c = document.createElement("canvas");
    c.width = 1024;
    c.height = 256;
    const g = c.getContext("2d")!;
    g.fillStyle = "rgba(6,6,10,0.92)";
    g.fillRect(0, 0, 1024, 256);
    g.strokeStyle = "#3ee08f";
    g.shadowColor = "#3ee08f";
    g.shadowBlur = 24;
    g.lineWidth = 10;
    g.strokeRect(12, 12, 1000, 232);
    g.fillStyle = "#e9fff3";
    g.textAlign = "center";
    g.font = '900 96px "JetBrains Mono", Menlo, monospace';
    g.fillText("NSM", 512, 118);
    g.font = '700 46px "JetBrains Mono", Menlo, monospace';
    g.fillStyle = "#3ee08f";
    g.fillText("60% OF FEES → RESERVE · NU7", 512, 196);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Group();
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(8, 2), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, color: new THREE.Color(1.4, 1.4, 1.4) }));
    panel.position.y = 1.7;
    const leg = new THREE.MeshStandardMaterial({ color: "#2a2834", metalness: 0.7, roughness: 0.4 });
    for (const x of [-3, 3]) {
      const l = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.6, 0.18), leg);
      l.position.set(x, 0.8, -0.1);
      sign.add(l);
    }
    sign.add(panel);
    sign.position.set(hall.x, top, front - 1.2);
    this.city.group.add(sign);
    this.sign = sign;
  }
}
