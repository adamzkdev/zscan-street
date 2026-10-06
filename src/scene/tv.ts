import * as THREE from "three";
import type { BlockBus } from "./bus";
import type { CameraRig } from "./camera";
import { CITY } from "./city";
import { TUNNEL } from "./city/plan";
import type { Director } from "./director";
import type { Snark } from "./snark";

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(a: readonly T[]) => a[Math.floor(Math.random() * a.length)];

/** Places worth a slow look between two events: centre and zoom. */
const VIEWS: [number, number, number][] = [
  [0, 19, 2.1], // the fountain on the Transparent square
  [-37.5, 21, 2.3], // the koi pond
  [-7.5, -7, 2.2], // the MEMPOOL shop
  [8, 4, 2.2], // the bus stop
  [36, -12, 1.7], // the Proof Factory
  [-38, -30, 1.7], // the orchard rows
  [0, 9, 2.4], // the plaza benches
];

type Kind = "bus" | "carrier" | "resident" | "view" | "overview";

/**
 * TV mode: ZStreet as something to leave on a screen. The camera cuts on its own to what is
 * really happening (a block's bus coming in, a zkSNARK carrying a fresh transaction, a resident
 * on a bench, a slow look round a place), every 12 to 25 seconds, never the same kind of shot
 * twice in a row. Opt-in (the Camera menu, or ?tv); any click, drag, scroll or key hands the
 * camera back.
 */
export class TvMode {
  on = false;
  private clock = 0;
  private next = 0;
  private last: Kind | null = null;
  private wasAuto = false;
  /** The mode the TV last put the camera in, to notice when something else took over. */
  private expect: string | null = null;
  /** A block's bus still in the tunnel: cut to it once it is out in the open. */
  private incoming: BlockBus | null = null;

  constructor(
    private rig: CameraRig,
    private director: Director,
    private changed: (on: boolean) => void,
  ) {
    const stop = (e: Event) => {
      if (!this.on) return;
      // the HUD's own controls (the TV switch among them) don't count
      if (e.target instanceof Element && e.target.closest("#ui button, #ui input, #ui .panel")) return;
      this.stop();
    };
    for (const ev of ["pointerdown", "wheel", "keydown"]) window.addEventListener(ev, stop, { capture: true });
  }

  start() {
    if (this.on) return;
    this.on = true;
    this.wasAuto = this.rig.auto;
    this.rig.auto = true;
    this.next = 0;
    this.last = null;
    this.changed(true);
  }

  stop() {
    if (!this.on) return;
    this.on = false;
    this.rig.auto = this.wasAuto;
    this.rig.setMode("live");
    this.changed(false);
  }

  /** A block's bus: always worth cutting to. */
  bus(phase: "arriving" | "boarding" | "departing" | "confirmed", bus: BlockBus) {
    if (!this.on) return;
    if (phase === "arriving" && this.last !== "bus") this.incoming = bus;
    if (phase === "confirmed" && this.last === "bus") this.next = Math.min(this.next, this.clock + 2);
  }

  update(dt: number) {
    if (!this.on) return;
    this.clock += dt;
    const b = this.incoming;
    if (b && Math.abs(b.group.position.x) < TUNNEL.mouth - 8) {
      this.incoming = null;
      this.rig.followTheBus(b);
      this.mark("bus", 30);
    }
    // a slow turn on the wide views
    if (this.rig.mode === "district" || this.rig.mode === "overview") this.rig.turnBy(dt * 0.06);
    // whatever we were watching is gone (a rider left, the bus drove off): move on soon
    if (this.expect && this.rig.mode !== this.expect) {
      this.expect = null;
      this.next = Math.min(this.next, this.clock + 1.5);
    }
    if (this.clock < this.next) return;
    this.cut();
  }

  private mark(k: Kind, seconds: number) {
    this.last = k;
    this.next = this.clock + seconds;
    this.expect = this.rig.mode;
  }

  private cut() {
    // only subjects out in the open: on the north pavement the facades (and the delivery trucks
    // at the kerb) stand between the camera and them
    const open = (s: Snark) => s.root.visible && s.root.parent?.type === "Scene" && s.root.position.z > CITY.road.z1;
    const carriers = [...this.director.snarks].filter((s) => s.txs.length && open(s) && (s.state === "shopping" || s.state === "waiting" || s.state === "vip"));
    const residents = [...this.director.snarks].filter((s) => s.state === "resident" && open(s) && s.role !== "Shopkeeper" && s.role !== "Miner");
    const options: [Kind, number][] = [
      ["carrier", carriers.length ? 4 : 0],
      ["resident", residents.length ? 3 : 0],
      ["view", 3],
      ["overview", 1],
    ];
    const pool = options.filter(([k, w]) => w > 0 && k !== this.last);
    const total = pool.reduce((a, [, w]) => a + w, 0);
    let r = Math.random() * total;
    let kind: Kind = "view";
    for (const [k, w] of pool) if ((r -= w) <= 0) {
      kind = k;
      break;
    }
    if (kind === "carrier") {
      // the newest first: it has the whole way to go
      const s = carriers.find((x) => x.state === "vip") ?? pick(carriers.filter((x) => x.isWalking).concat(carriers).slice(0, 4));
      this.followOne(s, "carrier", rand(14, 20));
    } else if (kind === "resident") {
      const sitting = residents.filter((s) => s.isPerched || !s.isWalking);
      this.followOne(pick(sitting.length ? sitting : residents), "resident", rand(10, 15));
    } else if (kind === "overview") {
      this.rig.setMode("overview");
      this.mark("overview", rand(9, 13));
    } else {
      const [x, z, zoom] = pick(VIEWS);
      this.rig.district(new THREE.Vector3(x, 1, z), zoom);
      this.mark("view", rand(12, 18));
    }
  }

  private followOne(s: Snark, k: Kind, seconds: number) {
    this.rig.follow(s);
    this.mark(k, seconds);
  }
}
