import * as THREE from "three";

/**
 * A constant light count for the city. three.js builds the number of point and spot lights into
 * every lit material's shader, so each bus (a headlight and a cabin light) or VIP car (a glow)
 * that came or went made every material of the city compile again: a whole-city stall and a new
 * set of programs for each combination. The moving lights register here; before each frame,
 * unlit fillers (intensity 0, out of sight) make up the difference to a fixed budget, so the
 * shaders always see the same counts. The budget only grows (once) if more ever show up at once.
 */
const tracked = new Set<THREE.PointLight | THREE.SpotLight>();
const lastSeen = new WeakMap<THREE.Light, number>();

/** A light that comes and goes with its vehicle. */
export function trackLight<T extends THREE.PointLight | THREE.SpotLight>(l: T): T {
  tracked.add(l);
  return l;
}

export class LightBudget {
  private point: THREE.PointLight[] = [];
  private spot: THREE.SpotLight[] = [];
  private holder = new THREE.Group();

  constructor(
    private scene: THREE.Scene,
    points = 4,
    spots = 2,
  ) {
    this.holder.name = "light budget";
    this.holder.position.set(0, -500, 0);
    scene.add(this.holder);
    this.grow(points, spots);
  }

  private grow(points: number, spots: number) {
    while (this.point.length < points) {
      const l = new THREE.PointLight("#000000", 0, 0.01);
      this.point.push(l);
      this.holder.add(l);
    }
    while (this.spot.length < spots) {
      const l = new THREE.SpotLight("#000000", 0, 0.01);
      l.target = this.holder;
      this.spot.push(l);
      this.holder.add(l);
    }
  }

  /** Call right before rendering the city. */
  update() {
    const now = performance.now();
    let p = 0,
      s = 0;
    for (const l of tracked) {
      if (this.counts(l)) {
        lastSeen.set(l, now);
        if ((l as THREE.SpotLight).isSpotLight) s++;
        else p++;
      } else if (!lastSeen.has(l)) lastSeen.set(l, now);
      // gone for a minute (its bus left town): forget it
      else if (now - lastSeen.get(l)! > 60_000) tracked.delete(l);
    }
    if (p > this.point.length || s > this.spot.length) this.grow(Math.max(p, this.point.length), Math.max(s, this.spot.length));
    for (let i = 0; i < this.point.length; i++) this.point[i].visible = i < this.point.length - p;
    for (let i = 0; i < this.spot.length; i++) this.spot[i].visible = i < this.spot.length - s;
  }

  /** Does three.js count this light when drawing the city (visible all the way up to it)? */
  private counts(l: THREE.Object3D) {
    for (let o: THREE.Object3D | null = l; o; o = o.parent) {
      if (!o.visible) return false;
      if (o === this.scene) return true;
    }
    return false;
  }
}
