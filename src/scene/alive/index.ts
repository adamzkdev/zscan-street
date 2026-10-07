import * as THREE from "three";
import type { City } from "../city";
import type { Director } from "../director";
import type { AliveCtx, AliveFrame, AlivePart } from "./types";
import { buildPeople } from "./people";
import { buildNight } from "./night";
import { buildAir } from "./air";
import { buildWater } from "./water";
import { buildWorks } from "./works";
import { buildSirens } from "./sirens";

/**
 * The megalopolis, more alive: crowds on every pavement of the outer districts, life round the
 * landmarks, street events, the sky and the water busy, the nights lit. Every part is instanced or
 * merged and only updates near the camera.
 */
export class Alive {
  readonly group = new THREE.Group();
  private parts: AlivePart[] = [];
  /** The parts by name (for debugging: street.alive.named.people…). */
  readonly named: Record<string, AlivePart> = {};
  private frame: AliveFrame;
  private eye = new THREE.Vector3();

  constructor(scene: THREE.Scene, city: City, director: Director, budget: number) {
    this.group.name = "alive";
    city.group.add(this.group);
    const ctx: AliveCtx = { scene, city, director, group: this.group, budget };
    this.frame = { dt: 0, t: 0, focus: new THREE.Vector3(), eye: this.eye, camera: new THREE.PerspectiveCamera(), night: true, wide: false, walking: false };
    void this.load(ctx);
  }

  /** Each part in its own module, loaded (a broken one never stops the rest). */
  private async load(ctx: AliveCtx) {
    const mods = Object.entries({ people: buildPeople, night: buildNight, air: buildAir, water: buildWater, works: buildWorks, sirens: buildSirens });
    // side by side: one that waits (for the outer city to stream in) never holds up the others
    await Promise.all(
      mods.map(async ([name, build]) => {
        try {
          const part = await build(ctx);
          this.parts.push(part);
          this.named[name] = part;
        } catch (e) {
          console.error("[alive]", e);
        }
      }),
    );
  }

  update(dt: number, t: number, focus: THREE.Vector3, camera: THREE.Camera, wide: boolean, walking: boolean) {
    const f = this.frame;
    f.dt = Math.min(dt, 0.1);
    f.t = t;
    f.focus.copy(focus);
    camera.getWorldPosition(this.eye);
    f.camera = camera;
    f.night = document.documentElement.dataset.theme !== "day";
    f.wide = wide;
    f.walking = walking;
    for (const p of this.parts) p.update(f);
  }
}
