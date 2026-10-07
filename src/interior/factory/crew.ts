import * as THREE from "three";
import { Snark, loadArt } from "../../scene/snark";
import { GRID, sprite } from "../../scene/sprites";
import { hash } from "../../scene/voxel/model";

/**
 * The people of the hall: zkSNARKs in hard hats. They talk (in English) when the walker comes
 * near, beep from their vehicles, cheer when a block comes in.
 */

const BODY = 1.75;
const PX = BODY / GRID;
const LEG_H = 6 * PX;
const BUST_X = 2.5 * PX;
const snap = (v: number) => Math.round(v / PX) * PX;

const hats = new Map<string, ReturnType<typeof sprite>>();
/** A hard hat on the portrait's grid: dome, ridge, brim (yellow, white for supervisors, orange…). */
function hatSprite(color: string) {
  let s = hats.get(color);
  if (s) return s;
  const c = new THREE.Color(color);
  const hex = (k: number) => `#${c.clone().multiplyScalar(k).getHexString()}`;
  s = sprite(15, 7, (px) => {
    px(4, 0, 7, 1, hex(0.95));
    px(2, 1, 11, 1, hex(1));
    px(1, 2, 13, 3, hex(1));
    px(6, 0, 3, 5, hex(1.15));
    px(3, 2, 2, 1, hex(1.25));
    px(1, 4, 13, 1, hex(0.82));
    px(0, 5, 15, 2, hex(0.7));
    px(0, 6, 15, 1, hex(0.55));
  });
  hats.set(color, s);
  return s;
}

/** A hi-vis vest over the bust: two reflective bands across the chest (orange or lime). */
function vestSprite(color: string) {
  const key = `v${color}`;
  let s = hats.get(key);
  if (s) return s;
  s = sprite(14, 4, (px) => {
    px(0, 0, 14, 4, color);
    px(0, 1, 14, 1, "#e8ecf0");
    px(0, 3, 14, 1, "#c8ccd0");
  });
  hats.set(key, s);
  return s;
}

export interface Person {
  s: Snark;
  role: string;
  lines: string[];
  wait: number;
  near: number;
}

export class Crew {
  readonly people: Person[] = [];
  readonly eye = new THREE.Vector3();
  private seq = 0;

  /** A zkSNARK in PPE at `at` (in `parent`'s frame). */
  async person(id: number, parent: THREE.Object3D, at: THREE.Vector3, role: string, o: { hat?: string | null; vest?: string | null; lines?: string[]; sit?: boolean; scale?: number; face?: THREE.Vector3 | null; near?: number } = {}) {
    try {
      const s = new Snark(id, await loadArt(id));
      s.noClip = true;
      s.state = "resident";
      s.role = role;
      s.showParcels(false);
      s.root.position.copy(at);
      s.faceDir = o.face ?? null;
      if (o.hat !== null) {
        const hat = hatSprite(o.hat ?? "#f4c020");
        const h = new THREE.Mesh(new THREE.PlaneGeometry(hat.w * PX, hat.h * PX), new THREE.MeshBasicMaterial({ map: hat.texture, transparent: true, alphaTest: 0.5 }));
        h.position.set(snap(BUST_X + PX), LEG_H + BODY - 1.8 * PX, 0.06);
        s.visual.add(h);
      }
      if (o.vest !== null) {
        const v = vestSprite(o.vest ?? "#ff7a1a");
        const vm = new THREE.Mesh(new THREE.PlaneGeometry(v.w * PX, v.h * PX), new THREE.MeshBasicMaterial({ map: v.texture, transparent: true, alphaTest: 0.5 }));
        vm.position.set(snap(BUST_X + 0.5 * PX), LEG_H + 2.5 * PX, 0.045);
        s.visual.add(vm);
      }
      if (o.sit) s.sit(true);
      if (o.scale) s.setScale(o.scale);
      parent.add(s.root);
      const p: Person = { s, role, lines: o.lines ?? [], wait: 2 + hash(this.seq++, 4, 4, 4) * 6, near: o.near ?? 9 };
      this.people.push(p);
      return p;
    } catch {
      return null;
    }
  }

  /** Someone near the walker says this now (a block, an event). */
  shout(text: string, maxDist = 16) {
    const w = new THREE.Vector3();
    let best: Person | null = null,
      bd = maxDist;
    for (const p of this.people) {
      p.s.root.getWorldPosition(w);
      if (Math.abs(w.y + 1.6 - this.eye.y) > 2.5 && Math.abs(w.y - this.eye.y) > 2.5) continue;
      const d = Math.hypot(w.x - this.eye.x, w.z - this.eye.z);
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    if (best) {
      best.s.say(text, 4, "shout");
      best.wait = 8;
    }
    return best;
  }

  private w = new THREE.Vector3();
  update(dt: number, t: number, camQuat: THREE.Quaternion, camRight: THREE.Vector3) {
    for (const p of this.people) {
      p.s.update(dt, t, camQuat, camRight);
      if (!p.lines.length) continue;
      p.wait -= dt;
      if (p.wait > 0) continue;
      p.wait = 1;
      p.s.root.getWorldPosition(this.w);
      const dy = this.eye.y - 1.6 - this.w.y;
      if (dy > -2 && dy < 2.2 && Math.hypot(this.eye.x - this.w.x, this.eye.z - this.w.z) < p.near) {
        p.s.say(p.lines[Math.floor(hash(Math.floor(t * 3), this.people.indexOf(p), 7, 7) * p.lines.length)], 3.8);
        p.wait = 9 + hash(Math.floor(t), this.people.indexOf(p), 2, 2) * 9;
      }
    }
  }
}

/** A zkSNARK id for the n-th worker (always the same one). */
export const crewId = (n: number) => 1 + Math.floor(hash(n, 77, 31, 5) * 9998);

export const LINES = {
  tech: [
    "Rack 42 is running hot!",
    "Swapping a fan. Again.",
    "Hot aisle? More like sauna aisle.",
    "Board two is down, replacing it.",
    "Green LEDs, happy miners.",
    "Who unplugged this one?",
    "Equihash never sleeps.",
    "Another block, another crate.",
    "Firmware updated. Fingers crossed.",
    "Dust filters, my old enemy.",
    "This unit hashes like it's 2016.",
    "Red LED on shelf three. Of course.",
  ],
  forklift: ["Coming through!", "Mind the forks!", "Beep beep!", "Pallet of spares for the pods.", "Who parked in my lane?", "Forks up, eyes up."],
  tugger: ["Next stop: the north pods.", "Three carts, zero patience.", "All aboard the spare-parts express!", "Cable reels for W5!", "Crossing! Crossing!"],
  cart: ["Zipping over to E2!", "Shortcut down the avenue!", "Battery at 12%… it's fine.", "Got the new hashboards!", "On my way, on my way!"],
  lift: ["Checking the cable trays up here.", "Nice view from up here!", "Don't move the lift, please!", "Busbar tap 7 looks good."],
  robot: ["R-01 never misses a crate.", "Crate on the AGV. Next!", "Robot's faster than me. Rude.", "Light curtain is green."],
  press: ["Stamp it!", "One block, one crate.", "The press waits for no one.", "Die is clean, ready for the next block."],
  dock: ["That truck's almost full.", "Load it up, it's going to the mempool!", "Shielded parcels only, please.", "Dock four, back it in!"],
  guard: ["Hard hat on, please.", "Mind the forklifts in there.", "Welcome to the Proof Factory.", "Green walkways only!"],
  control: ["Difficulty's up again.", "Hashrate looks healthy.", "Keep an eye on the Nakamoto coefficient.", "Coffee's cold. Blocks are hot.", "Block time on target.", "All pods reporting."],
  catwalk: ["You can see every pod from up here.", "Don't look down.", "Crane two, hold it there!", "Skylights need a wash."],
};
