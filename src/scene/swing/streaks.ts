import * as THREE from "three";

/** The air going past you at speed: thin warm-white threads round the eye, longer the faster. */
export class AirStreaks {
  private n: number;
  private spread: number;
  private trail: number;
  private at: THREE.BufferAttribute;
  private p: Float32Array;
  private mat = new THREE.LineBasicMaterial({ color: 0xfff1d6, transparent: true, opacity: 0, depthWrite: false, fog: false });
  readonly root: THREE.LineSegments;

  constructor(options: { count?: number; spread?: number; trail?: number } = {}) {
    this.n = options.count ?? 70;
    this.spread = options.spread ?? 18;
    this.trail = options.trail ?? 0.035;
    this.p = new Float32Array(this.n * 3);
    for (let i = 0; i < this.p.length; i++) this.p[i] = (Math.random() - 0.5) * this.spread * 2;
    this.at = new THREE.BufferAttribute(new Float32Array(this.n * 6), 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", this.at);
    this.root = new THREE.LineSegments(g, this.mat);
    this.root.frustumCulled = false;
    this.root.visible = false;
    this.root.userData.noField = true;
  }

  /** Round the eye at (x, y, z), going at (vx, vy, vz); `level` 0..1 is how much of it shows. */
  update(dt: number, x: number, y: number, z: number, vx: number, vy: number, vz: number, level: number) {
    this.mat.opacity = this.mat.opacity + (level - this.mat.opacity) * (1 - Math.exp(-8 * dt));
    this.root.visible = this.mat.opacity > 0.01;
    if (!this.root.visible) return;
    this.root.position.set(x, y, z);
    const size = this.spread * 2;
    const wrap = (v: number) => ((((v + this.spread) % size) + size) % size) - this.spread;
    for (let i = 0; i < this.n; i++) {
      const a = wrap(this.p[i * 3] - vx * dt);
      const b = wrap(this.p[i * 3 + 1] - vy * dt);
      const c = wrap(this.p[i * 3 + 2] - vz * dt);
      this.p[i * 3] = a;
      this.p[i * 3 + 1] = b;
      this.p[i * 3 + 2] = c;
      this.at.setXYZ(i * 2, a, b, c);
      this.at.setXYZ(i * 2 + 1, a + vx * this.trail, b + vy * this.trail, c + vz * this.trail);
    }
    this.at.needsUpdate = true;
  }

  get opacity() {
    return this.mat.opacity;
  }

  /** Gone at once (back on the map, through a door). */
  hide() {
    this.mat.opacity = 0;
    this.root.visible = false;
  }
}
