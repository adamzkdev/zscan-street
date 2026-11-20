import * as THREE from "three";

/**
 * A constant light count for the city. three.js builds the number of point and spot lights into
 * every lit material's shader, so each bus (a headlight and a cabin light) or VIP car (a glow)
 * that came or went made every material of the city compile again: a whole-city stall and a new
 * set of programs for each combination. The moving lights register here; before each frame,
 * unlit fillers (intensity 0, out of sight) make up the difference to a fixed budget, so the
 * shaders always see the same counts.
 *
 * The budget is fixed: with a block every 25 seconds, more lit vehicles are about at once (buses,
 * taxis, VIP cars, some held in traffic), and a budget that grew by one each time recompiled every
 * lit material of the city (a stall of half a second to a second, again and again over a visit), and
 * every extra light was one more for every pixel of the city to light. Past the budget, the lights
 * farthest from the camera go dark (a taxi's glow a few streets away lights nothing you can see).
 */
const tracked = new Set<THREE.PointLight | THREE.SpotLight>();
const lastSeen = new WeakMap<THREE.Light, number>();
const at = new THREE.Vector3();

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

  private points: THREE.PointLight[] = [];
  private spots: THREE.SpotLight[] = [];

  /** Call right before rendering the city, with where the camera that draws it stands. */
  update(eye?: THREE.Vector3) {
    const now = performance.now();
    const points = this.points,
      spots = this.spots;
    points.length = spots.length = 0;
    for (const l of tracked) {
      if (this.counts(l)) {
        lastSeen.set(l, now);
        if ((l as THREE.SpotLight).isSpotLight) spots.push(l as THREE.SpotLight);
        else points.push(l as THREE.PointLight);
      } else if (!lastSeen.has(l)) lastSeen.set(l, now);
      // gone for a minute (its bus left town): forget it
      else if (now - lastSeen.get(l)! > 60_000) tracked.delete(l);
    }
    const p = this.keep(points, this.point.length, eye),
      s = this.keep(spots, this.spot.length, eye);
    for (let i = 0; i < this.point.length; i++) this.point[i].visible = i < this.point.length - p;
    for (let i = 0; i < this.spot.length; i++) this.spot[i].visible = i < this.spot.length - s;
  }

  /** The nearest `max` of these lit, the rest dark: how many are lit. */
  private keep(ls: THREE.Light[], max: number, eye?: THREE.Vector3) {
    if (ls.length > max && eye) {
      for (const l of ls) l.userData.far = at.setFromMatrixPosition(l.matrixWorld).distanceToSquared(eye);
      ls.sort((a, b) => a.userData.far - b.userData.far);
    }
    for (let i = 0; i < ls.length; i++) ls[i].visible = i < max;
    return Math.min(ls.length, max);
  }

  /** Does three.js count this light when drawing the city (its whole branch visible)? Its own `visible` is the budget's. */
  private counts(l: THREE.Object3D) {
    for (let o: THREE.Object3D | null = l.parent; o; o = o.parent) {
      if (!o.visible) return false;
      if (o === this.scene) return true;
    }
    return false;
  }
}
