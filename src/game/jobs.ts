import * as THREE from "three";
import type { Tx } from "../data/types";
import type { ChainClock } from "./clock";
import { profile } from "./profile";
import type { GameHud } from "./ui";

export interface JobHooks {
  /** Put the visitor on foot at `at`. */
  walkFrom(at: THREE.Vector3): void;
  /** Where the visitor stands on foot (null when not walking). */
  onFoot(): THREE.Vector3 | null;
  project(v: THREE.Vector3): { x: number; y: number } | null;
  /** Courier: where parcels are picked up (the depot) and where they go (the MEMPOOL HQ's door). */
  depot(): THREE.Vector3 | null;
  hq(): THREE.Vector3 | null;
  /** A transaction waiting in the mempool, for the parcel's label. */
  mempoolTx(): Tx | null;
  /** Driver: ride the next block's bus from inside; `stopX` is where it must stop. */
  rideNextBus(): void;
  busX(): number | null;
  stopX: number;
  /** Miner: walk into the Proof Factory. */
  factory(): void;
}

type Job = "courier" | "miner" | "driver";


/**
 * Work the chain's jobs for ⓩ:
 * - Courier: carry a real waiting transaction's parcel on foot from the depot to the MEMPOOL HQ,
 *   against the clock.
 * - Miner: at the Proof Factory, hit the hash window (space or tap) as often as you can until the
 *   next real block lands: every hit is a share, shares are paid when it does.
 * - Bus driver: take the next block's bus and brake (space) so it stops on the line.
 */
export class Jobs {
  job: Job | null = null;
  private board: HTMLElement;
  private bar: HTMLElement;
  private marker: HTMLElement;
  private t = 0;
  // courier
  private parcel: { tx: Tx | null; to: THREE.Vector3; until: number } | null = null;
  // miner
  private shares = 0;
  private streak = 0;
  private needle = 0;
  private dir = 1;
  private band = 0.18;
  // driver
  private braked: number | null = null;
  private driving = false;

  constructor(
    private hud: GameHud,
    clock: ChainClock,
    private hooks: JobHooks,
  ) {
    this.board = document.createElement("div");
    this.board.className = "jobboard hud";
    hud.root.append(this.board);
    this.bar = document.createElement("div");
    this.bar.className = "jobbar hud";
    hud.root.append(this.bar);
    this.marker = document.createElement("div");
    this.marker.className = "jobmark";
    hud.root.append(this.marker);
    this.board.addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>("[data-job]");
      if ((e.target as HTMLElement).closest("[data-x]")) this.board.classList.remove("open");
      if (b) this.start(b.dataset.job as Job);
    });
    this.bar.addEventListener("pointerdown", (e) => {
      if ((e.target as HTMLElement).closest("[data-quit]")) return this.stop("You clocked off.");
      if ((e.target as HTMLElement).closest("[data-hit]")) this.hit();
    });
    window.addEventListener("keydown", (e) => {
      if (e.code !== "Space" || !this.job || this.job === "courier") return;
      e.preventDefault();
      this.hit();
    });
    hud.root.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).closest("[data-jobs]")) this.openBoard();
    });
    clock.onBlock(() => this.job === "miner" && this.payMiner());
  }

  /** Where the shift wants you (the minimap's gold diamond). */
  get goal(): THREE.Vector3 | null {
    return this.job === "courier" && this.parcel ? this.parcel.to : null;
  }

  openBoard() {
    this.board.innerHTML = `<header><label>仕事 · JOBS</label><button data-x>×</button></header>
      <button data-job="courier"><b>Courier</b><span>Carry a waiting transaction from the depot to the MEMPOOL HQ before time runs out · up to ⓩ 60</span></button>
      <button data-job="miner"><b>Miner</b><span>Hit the hash window at the Proof Factory until the next block lands · ⓩ 3 a share</span></button>
      <button data-job="driver"><b>Bus driver</b><span>Drive the next block's bus and brake on the stop line · up to ⓩ 60</span></button>`;
    this.board.classList.add("open");
  }

  private start(job: Job) {
    this.board.classList.remove("open");
    this.stop(null);
    this.job = job;
    this.t = 0;
    if (job === "courier") {
      const from = this.hooks.depot(),
        to = this.hooks.hq();
      if (!from || !to) return this.stop("No parcels today.");
      this.hooks.walkFrom(from);
      const tx = this.hooks.mempoolTx();
      const dist = from.distanceTo(to);
      this.parcel = { tx, to, until: Math.max(45, dist / 2.2) };
      this.hud.say(`<b>COURIER</b> · ${tx ? `parcel ${tx.txid.slice(0, 8)}… (${tx.kind})` : "a parcel"}: get it to the MEMPOOL HQ, follow the gold marker`);
    } else if (job === "miner") {
      this.shares = 0;
      this.streak = 0;
      this.band = 0.18;
      this.hooks.factory();
      this.hud.say("<b>MINER</b> · hit SPACE (or HASH) when the needle is in the gold window. Shares are paid when the next block lands.");
    } else {
      this.braked = null;
      this.driving = false;
      this.hooks.rideNextBus();
      this.hud.say("<b>BUS DRIVER</b> · you take the next block's bus. Hit SPACE (or BRAKE) right on the stop line.");
    }
    this.bar.classList.add("on");
    this.render();
  }

  stop(msg: string | null) {
    this.job = null;
    this.parcel = null;
    this.bar.classList.remove("on");
    this.marker.style.display = "none";
    if (msg) this.hud.say(msg);
  }

  /** The bus for this shift came out of the tunnel (main calls it on "arriving"). */
  busArriving() {
    if (this.job === "driver") this.driving = true;
  }

  /** The bus reached its stop by itself: grade the braking. */
  busStopped() {
    if (this.job !== "driver" || !this.driving) return;
    const d = this.braked;
    const pay = d === null ? 0 : d < 1 ? 60 : d < 3 ? 30 : d < 6 ? 10 : 0;
    if (pay) profile.pay(pay, "driver");
    profile.update((p) => p.stats.jobs++);
    this.stop(d === null ? "<b>SHIFT OVER</b> · you never touched the brake" : `<b>SHIFT OVER</b> · stopped ${d.toFixed(1)} m from the line${pay ? ` · ⓩ +${pay}` : ""}`);
  }

  private hit() {
    if (this.job === "miner") {
      const inside = Math.abs(this.needle - 0.5) < this.band / 2;
      if (inside) {
        this.shares++;
        this.streak++;
        this.band = Math.max(0.06, 0.18 - this.streak * 0.008);
      } else {
        this.streak = 0;
        this.band = 0.18;
      }
      this.bar.classList.toggle("miss", !inside);
      this.render();
    } else if (this.job === "driver" && this.driving && this.braked === null) {
      const x = this.hooks.busX();
      if (x !== null) this.braked = Math.abs(this.hooks.stopX - x);
      this.render();
    }
  }

  private payMiner() {
    const pay = this.shares * 3;
    if (pay) profile.pay(pay, "mining");
    profile.update((p) => p.stats.jobs++);
    this.stop(`<b>BLOCK FOUND</b> · your ${this.shares} share${this.shares === 1 ? "" : "s"} paid ⓩ ${pay}`);
  }

  private render() {
    const j = this.job;
    if (!j) return;
    if (j === "miner") {
      this.bar.innerHTML = `<label>採掘 · MINING SHIFT</label><div class="meter"><i class="band" style="left:${(0.5 - this.band / 2) * 100}%;width:${this.band * 100}%"></i><i class="needle" style="left:${this.needle * 100}%"></i></div><span>${this.shares} shares · streak ${this.streak}</span><button data-hit>HASH</button><button data-quit>×</button>`;
    } else if (j === "driver") {
      const x = this.hooks.busX();
      const d = x === null ? null : this.hooks.stopX - x;
      this.bar.innerHTML = `<label>運転 · BUS DRIVER</label><span>${!this.driving ? "waiting for the next block's bus…" : this.braked !== null ? `braked ${this.braked.toFixed(1)} m from the line` : d !== null ? `stop line in ${Math.max(0, d).toFixed(1)} m` : "…"}</span><button data-hit>BRAKE</button><button data-quit>×</button>`;
    } else {
      const left = this.parcel ? Math.max(0, Math.ceil(this.parcel.until - this.t)) : 0;
      const p = this.hooks.onFoot();
      const d = p && this.parcel ? Math.hypot(p.x - this.parcel.to.x, p.z - this.parcel.to.z) : null;
      this.bar.innerHTML = `<label>配達 · COURIER</label><span>${d === null ? "…" : `${Math.round(d)} m to the MEMPOOL HQ`} · ${left}s</span><button data-quit>×</button>`;
    }
  }

  update(dt: number) {
    if (!this.job) return;
    this.t += dt;
    if (this.job === "miner") {
      // the needle sweeps faster as the streak grows
      this.needle += dt * this.dir * (0.9 + this.streak * 0.05);
      if (this.needle > 1) (this.needle = 1), (this.dir = -1);
      if (this.needle < 0) (this.needle = 0), (this.dir = 1);
      const n = this.bar.querySelector<HTMLElement>(".needle");
      if (n) n.style.left = `${this.needle * 100}%`;
      return;
    }
    // a few times a second is enough for the text
    if (Math.floor(this.t * 4) !== Math.floor((this.t - dt) * 4)) this.render();
    if (this.job === "courier" && this.parcel) {
      const p = this.hooks.onFoot();
      const to = this.parcel.to;
      const at = this.hooks.project(new THREE.Vector3(to.x, to.y + 2.6, to.z));
      this.marker.style.display = at ? "" : "none";
      if (at) this.marker.style.transform = `translate(${Math.round(at.x)}px, ${Math.round(at.y)}px) translate(-50%, -100%)`;
      if (!p) return this.stop("<b>DELIVERY DROPPED</b> · you left the street");
      if (Math.hypot(p.x - to.x, p.z - to.z) < 3.2) {
        const left = this.parcel.until - this.t;
        const pay = 20 + Math.round(Math.max(0, left) / this.parcel.until * 40);
        profile.pay(pay, "courier");
        profile.update((q) => q.stats.jobs++);
        return this.stop(`<b>DELIVERED</b> · ${Math.round(this.t)} s · ⓩ +${pay}`);
      }
      if (this.t > this.parcel.until) this.stop("<b>TOO LATE</b> · the parcel went with someone else");
    }
  }
}
