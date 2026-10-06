import * as THREE from "three";
import type { Block, BlockSummary, Tx } from "../data/types";
import { ZScan } from "../data/zscan";
import { BlockBus } from "./bus";
import { Car, Scooter, Truck, type CarKind } from "./car";
import { CITY, DISTRICTS, type City, type DistrictKey, type ShopSite } from "./city";
import { nz, TUNNEL } from "./city/plan";
import type { DistrictPlan } from "./city/plan";
import { KIND_COLOR, Snark, loadArt } from "./snark";
import { Traffic, Vehicle } from "./traffic";

/** At most this many zkSNARKs carry parcels at once, across the city. */
const CAP = 36;
/**
 * Big visible amounts don't take the bus. From 50 ZEC of public value a taxi; from 500 ZEC a
 * limousine with two of the rarest zkSNARKs as bodyguards. Calibrated on 500 real transactions:
 * about 1 in 10 and 1 in 170. Fully shielded amounts are hidden, so they always take the bus.
 */
const TAXI_ZAT = 50e8;
const LIMO_ZAT = 500e8;
/** How long a bus waits at a stop for riders still on their way. */
const MAX_DWELL_MS = 14000;
/** At least this long between two buses leaving the tunnel, so they never arrive as a pack. */
const BUS_GAP_MS = 12000;
/** Where vehicles enter and leave the map. */
/** Vehicles come out of, and drive into, the tunnels at both ends of the avenue. */
const EDGE = TUNNEL.inside;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const withTimeout = <T>(p: Promise<T>, ms: number) => Promise.race([p, sleep(ms)]);
const v = (x: number, z: number, y = CITY.curb) => new THREE.Vector3(x, y, z);

/**
 * Which zkSNARK carries a transaction: read from the txid, so the same transaction always gets the
 * same carrier. It is a casting choice, not ownership: zkSNARKs live off-chain.
 */
export function carrierOf(txid: string) {
  return (parseInt(txid.slice(-8), 16) % 10000) + 1;
}

/** Every transaction goes through the one MEMPOOL shop, downtown. */
export function districtFor(_tx: Tx): DistrictKey {
  return "downtown";
}

export type BusPhase = "arriving" | "boarding" | "departing" | "confirmed";

export interface DirectorEvents {
  stats(s: { mempool: number; shown: number; lastBlock: BlockSummary | null }): void;
  bus(phase: BusPhase, b: Block, carried: number, bus: BlockBus, district: DistrictPlan | null): void;
  removed(s: Snark): void;
  /** Someone walks into the MEMPOOL shop (the door chime). */
  door?(): void;
}

/**
 * Someone walks into the MEMPOOL shop: a zkSNARK collecting its parcel, or a truck driver bringing
 * one in. The walk-in shop replays these visits inside (interior/mempool.ts).
 */
export interface ShopVisit {
  kind: "pickup" | "delivery";
  /** The zkSNARK (portrait) doing it. */
  id: number;
  tx: Tx;
  role: string;
}

/** A line of people: spots along a path, filled in order of arrival. */
class Line {
  readonly people: Snark[] = [];
  constructor(readonly spots: THREE.Vector3[]) {}
  join(s: Snark) {
    if (!this.people.includes(s)) this.people.push(s);
    return this.spotOf(s);
  }
  leave(s: Snark) {
    const i = this.people.indexOf(s);
    if (i >= 0) this.people.splice(i, 1);
  }
  spotOf(s: Snark) {
    return this.spots[Math.min(Math.max(0, this.people.indexOf(s)), this.spots.length - 1)];
  }
  /** Direction toward the head, for people to face while they wait. */
  faceOf(s: Snark) {
    const i = Math.min(this.people.indexOf(s), this.spots.length - 1);
    if (i <= 0) return this.spots.length > 1 ? this.spots[0].clone().sub(this.spots[1]).normalize() : new THREE.Vector3(1, 0, 0);
    return this.spots[i - 1].clone().sub(this.spots[i]).normalize();
  }
}

interface Shop {
  site: ShopSite;
  /** Parcels delivered and waiting on the rack. */
  rack: { tx: Tx; mesh: THREE.Mesh }[];
}

interface Vip {
  s: Snark;
  tier: CarKind;
  district: DistrictPlan;
  guards: Snark[];
  /** Picked up by its car and off to wait for the block. */
  ready: boolean;
  /** Its block came before it was picked up. */
  pending: boolean;
}

export class Director {
  readonly snarks = new Set<Snark>();
  readonly traffic = new Traffic();
  readonly buses = new Set<BlockBus>();
  private byTx = new Map<string, Snark>();
  private loading = new Set<string>();
  private mempool = new Map<string, Tx>();
  private confirmedTx = new Set<string>();
  private lastBlock: BlockSummary | null = null;
  private shops = new Map<DistrictKey, Shop>();
  private stopLines = new Map<DistrictKey, Line>();
  private rankLines = new Map<DistrictKey, Line>();
  private vips = new Map<string, Vip>();
  private cars = new Set<Car>();
  private trucks = new Set<Truck>();
  private rarest: { id: number; rank: number }[] = [];
  private crateGeo = new THREE.BoxGeometry(0.3, 0.3, 0.3);
  private lastTidy = 0;
  /** Who is waiting outside the shop for a delivery, by spot. */
  private outside: (Snark | null)[] = [];

  constructor(
    private scene: THREE.Object3D,
    private city: City,
    private ev: DirectorEvents,
  ) {
    for (const site of city.shops) this.shops.set(site.district, { site, rack: [] });
    for (const d of DISTRICTS) {
      // the bus queue snakes back and forth on the south pavement, head by the front door
      const spots: THREE.Vector3[] = [];
      [3.7, 4.75, 5.8].forEach((z, i) => {
        const xs: number[] = [];
        for (let x = d.stopX + 3.4; x >= d.crossX + 1.0; x -= 1.05) xs.push(x);
        if (i % 2) xs.reverse();
        for (const x of xs) spots.push(v(x, z));
      });
      this.stopLines.set(d.key, new Line(spots));
      // the taxi rank: a short line on the north pavement, head at the kerb sign
      this.rankLines.set(d.key, new Line([0, 1, 2, 3, 4, 5].map((k) => v(d.rankX + 0.6 + k * 1.05, nz(-3.25)))));
    }
    void this.spawnLocals();
    void ZScan.rarest(40).then((r) => (this.rarest = r));
    void this.ambientTraffic();
    // the zebra between the shop and the stop: busy while anyone is on the road near it
    const zx = DISTRICTS[0].crossX;
    this.traffic.crossings.push({
      x: zx,
      half: 1.3,
      busy: () => {
        for (const s of this.snarks) {
          const p = s.root.position;
          if (s.root.parent !== this.scene || !s.root.visible) continue;
          if (Math.abs(p.x - zx) < 1.8 && p.z > CITY.road.z0 - 0.6 && p.z < CITY.road.z1 + 0.6 && (s.isWalking || (p.z > CITY.road.z0 && p.z < CITY.road.z1))) return true;
        }
        return false;
      },
    });
  }

  /** Wait at the kerb until the crossing is clear of traffic. */
  async waitToCross(x: number) {
    while (!this.traffic.safeToCross(x, 1.3)) await sleep(150);
  }

  get lastBlockTime() {
    return this.lastBlock ? Date.parse(this.lastBlock.time) : 0;
  }

  get blockHeight() {
    return this.lastBlock?.height ?? null;
  }

  snarkOf(txid: string) {
    return this.byTx.get(txid) ?? null;
  }

  mempoolList() {
    return [...this.mempool.values()].sort((a, b) => a.seenAt - b.seenAt);
  }

  /**
   * Miners at work in the mining hall: each walks the aisle loop, stopping at the cabinets to
   * check on them.
   */
  spawnMiners(patrol: THREE.Vector3[]) {
    [3141, 2718, 1618].forEach(async (id, i) => {
      try {
        const s = await this.newSnark(id);
        s.state = "resident";
        s.role = "Miner";
        s.district = "downtown";
        // the walkway down the middle is just for crossing; everywhere else there is work to do
        const midX = patrol[1].x;
        let k = (i * 4) % patrol.length;
        s.root.position.copy(patrol[k]);
        this.snarks.add(s);
        this.scene.add(s.root);
        await sleep(i * 1800);
        while (this.snarks.has(s)) {
          k = (k + 1) % patrol.length;
          await s.walk([patrol[k]], 0.9);
          if (Math.abs(patrol[k].x - midX) < 0.2) continue;
          // check on the machines (facing the nearer row), then move on
          s.faceDir = new THREE.Vector3(0, 0, Math.random() > 0.5 ? 1 : -1);
          await sleep(2000 + Math.random() * 3500);
          s.faceDir = null;
        }
      } catch {}
    });
  }

  /** A clerk behind a counter (card shop, bank), facing the door. */
  async spawnKeeper(at: THREE.Vector3, id: number, role: string) {
    try {
      const s = await this.newSnark(id);
      s.state = "resident";
      s.role = role;
      s.district = "downtown";
      s.root.position.copy(at);
      s.faceDir = new THREE.Vector3(0, 0, 1);
      this.snarks.add(s);
      this.scene.add(s.root);
    } catch {}
  }

  private proofs = new Set<(tx: Tx) => void>();
  /** Every transaction proved at the Proof Factory (shielded ones), as it is sent for a truck. */
  onProof(fn: (tx: Tx) => void) {
    this.proofs.add(fn);
  }

  private visitors = new Set<(v: ShopVisit) => void>();
  /** Listen to the shop's door: every pickup and delivery, as it starts. */
  onShopVisit(fn: (v: ShopVisit) => void) {
    this.visitors.add(fn);
  }
  private visit(v: ShopVisit) {
    for (const fn of this.visitors) fn(v);
  }

  /** The transactions waiting on the shop rack (delivered, not yet collected), oldest first. */
  rackTxs(): Tx[] {
    return [...this.shops.values()].flatMap((s) => s.rack.map((c) => c.tx));
  }

  /** The parcels on the shop racks, for picking. */
  rackMeshes() {
    return [...this.shops.values()].flatMap((s) => s.rack.map((c) => c.mesh));
  }

  shopSites() {
    return [...this.shops.values()].map((s) => ({ site: s.site, waiting: s.rack.length }));
  }

  // ---- feed -----------------------------------------------------------------------------------

  snapshot(txs: Tx[], last: BlockSummary | null) {
    this.lastBlock = last ?? this.lastBlock;
    const fresh = txs.filter((t) => !this.mempool.has(t.txid) && !this.confirmedTx.has(t.txid));
    for (const t of txs) this.mempool.set(t.txid, t);
    void (async () => {
      for (let i = 0; i < fresh.length; i += 6) await Promise.all(fresh.slice(i, i + 6).map((t) => withTimeout(ZScan.enrich(t), 4000)));
      // when you arrive, most are already in line; the newest few are still on their way
      fresh.forEach((t, i) => (i < fresh.length - 3 ? this.place(t, "stop") : setTimeout(() => this.place(t, "walk"), 500 + i * 1500)));
    })();
    this.emitStats();
  }

  addTx(tx: Tx) {
    if (this.mempool.has(tx.txid) || this.confirmedTx.has(tx.txid)) return;
    this.mempool.set(tx.txid, tx);
    void withTimeout(ZScan.enrich(tx), 3000).then(() => this.mempool.has(tx.txid) && this.place(tx, "walk"));
    this.emitStats();
  }

  block(b: Block) {
    // nobody is watching a hidden tab: settle now instead of piling buses up for later
    if (document.hidden) return void this.runBlock(b, false);
    this.busQueue.push(b);
    // a backlog (a reconnect, two quick blocks): only the newest still gets its bus
    while (this.busQueue.length > 1) void this.runBlock(this.busQueue.shift()!, false);
    void this.pumpBuses();
  }

  private busQueue: Block[] = [];
  private lastBusAt = -Infinity;
  private pumping = false;

  /** Sends queued blocks' buses one at a time, BUS_GAP_MS apart. */
  private async pumpBuses() {
    if (this.pumping) return;
    this.pumping = true;
    try {
      while (this.busQueue.length) {
        const wait = BUS_GAP_MS - (performance.now() - this.lastBusAt);
        if (wait > 0) await sleep(wait);
        const b = this.busQueue.shift();
        if (!b) break;
        this.lastBusAt = performance.now();
        void this.runBlock(b, !document.hidden && this.buses.size < 2);
      }
    } finally {
      this.pumping = false;
    }
  }

  /**
   * A transaction someone asked to follow: put it on the street even if the crowd is at its cap,
   * and even if the live feed hasn't shown it yet. Its carrier appears as for any other.
   */
  track(tx: Tx) {
    if (this.confirmedTx.has(tx.txid)) return;
    if (!this.mempool.has(tx.txid)) this.mempool.set(tx.txid, tx);
    const t = this.mempool.get(tx.txid)!;
    if (this.byTx.has(t.txid) || this.loading.has(t.txid)) return;
    void withTimeout(ZScan.enrich(t), 3000).then(() => {
      if (this.mempool.has(t.txid) && !this.byTx.has(t.txid) && !this.loading.has(t.txid)) void this.spawnCarrier(t, "walk");
    });
    this.emitStats();
  }

  /** Txids still waiting according to the API: anything else expired or was replaced. */
  sweep(alive: Set<string>) {
    for (const [txid, tx] of this.mempool) {
      if (alive.has(txid)) continue;
      this.mempool.delete(txid);
      this.loading.delete(txid);
      for (const shop of this.shops.values()) this.takeCrate(shop, tx);
      const s = this.byTx.get(txid);
      if (!s || s.state === "boarding" || s.state === "riding" || s.state === "chauffeured") continue;
      this.byTx.delete(txid);
      s.setTxs(s.txs.filter((t) => t !== tx));
      if (!s.txs.length) void this.leave(s);
    }
    this.emitStats();
  }

  // ---- casting --------------------------------------------------------------------------------

  private carriers() {
    return [...this.snarks].filter((s) => ["arriving", "shopping", "waiting", "boarding", "vip"].includes(s.state));
  }

  private place(tx: Tx, how: "stop" | "walk") {
    if (this.byTx.has(tx.txid) || this.loading.has(tx.txid)) return;
    if (this.carriers().length + this.loading.size >= CAP) return;
    void this.spawnCarrier(tx, how);
  }

  async newSnark(id: number) {
    while ([...this.snarks].some((s) => s.id === id)) id = (id % 10000) + 1;
    return new Snark(id, await loadArt(id));
  }

  /** A resident (scene/residents.ts) joins the street: updated, collided and clickable like the rest. */
  adopt(s: Snark) {
    s.state = "resident";
    s.district = "downtown";
    this.snarks.add(s);
    this.scene.add(s.root);
  }

  /** A resident goes home. */
  release(s: Snark) {
    this.remove(s);
  }

  private tierOf(tx: Tx): "taxi" | "limo" | null {
    const vis = tx.visible ?? 0;
    if (tx.kind === "shielded") return null;
    return vis >= LIMO_ZAT ? "limo" : vis >= TAXI_ZAT ? "taxi" : null;
  }

  private async spawnCarrier(tx: Tx, how: "stop" | "walk") {
    this.loading.add(tx.txid);
    // the parcel is on a truck from the Proof Factory (shielded) or the depot (transparent)
    if (how === "walk") void this.truckDelivery(tx);
    let s: Snark;
    try {
      s = await this.newSnark(carrierOf(tx.txid));
    } catch {
      this.loading.delete(tx.txid);
      return;
    }
    if (!this.loading.delete(tx.txid)) return;
    const d = DISTRICTS.find((x) => x.key === districtFor(tx))!;
    const shop = this.shops.get(d.key)!;
    const tier = this.tierOf(tx);
    s.district = d.key;
    s.shop = shop.site;
    s.setTxs([tx]);
    if (tier) {
      s.ride = tier;
      s.carry = tier === "limo" ? "goldcase" : "briefcase";
      s.redrawHold();
    }
    this.byTx.set(tx.txid, s);
    this.snarks.add(s);
    this.scene.add(s.root);

    if (how === "stop") {
      if (tier) {
        // already in its car, out of sight, waiting for its block
        s.state = "chauffeured";
        s.setVisible(false);
        this.vips.set(tx.txid, { s, tier, district: d, guards: [], ready: true, pending: false });
        return;
      }
      const line = this.stopLines.get(d.key)!;
      s.state = "waiting";
      s.root.position.copy(line.join(s));
      s.faceDir = line.faceOf(s);
      return;
    }

    // a zkSNARK steps out of a doorway in the district and heads for the shop
    const entries = this.city.entries[d.key];
    const entry = entries[Math.floor(Math.random() * entries.length)];
    s.root.position.copy(entry);
    s.state = "arriving";
    s.showParcels(false);
    const lane = nz(-4.0) + (Math.random() - 0.5) * 0.6;
    // wait outside, in a loose row along the shop front, until the delivery is on the rack
    const slot = this.outside.indexOf(null) >= 0 ? this.outside.indexOf(null) : this.outside.push(null) - 1;
    this.outside[slot] = s;
    const ox = shop.site.door.x + ((slot % 7) - 3) * 0.95 + (Math.random() - 0.5) * 0.2;
    const oz = lane + 0.7 + Math.floor(slot / 7) * 0.8;
    await s.walk([v(entry.x, lane), v(ox, oz)], 1.8);
    s.faceDir = new THREE.Vector3(0, 0, -1);
    while (this.snarks.has(s) && !shop.rack.some((c) => c.tx === tx) && !tx.height) await sleep(300);
    this.outside[slot] = null;
    s.faceDir = null;
    if (!this.snarks.has(s)) return;
    // inside: to the counter, take the parcel, back out
    s.state = "shopping";
    this.visit({ kind: "pickup", id: s.id, tx, role: "Customer" });
    await s.walk([shop.site.door], 1.5);
    this.ev.door?.();
    await s.walk([shop.site.inside, shop.site.counter], 1.5);
    this.takeCrate(shop, tx);
    s.showParcels(true);
    await sleep(s.rush > 1 ? 250 : 700);
    await s.walk([shop.site.inside, shop.site.door], 1.6);
    if (tier) return void this.toRank(s, tier, d);
    await this.toStop(s, d);
  }

  /** From the shop door, across the zebra, to the back of the bus line (or straight onto a waiting bus). */
  private async toStop(s: Snark, d: DistrictPlan) {
    const kerb = CITY.south.z0 + 0.4;
    const cx = d.crossX + (Math.random() - 0.5) * 0.8;
    await s.walk([v(cx, CITY.north.z1 - 0.3)], 1.8);
    await this.waitToCross(d.crossX);
    await s.walk([v(cx, CITY.road.z0 + 0.1, 0.01), v(cx, CITY.road.z1 - 0.1, 0.01), v(cx, kerb)], 1.8);
    if (s.state !== "shopping") return;
    const bus = this.busAt(d);
    if (bus && s.txs.some((t) => t.height === bus.blockHeight)) {
      s.state = "waiting";
      return void this.board(s, bus);
    }
    if (s.txs.length && s.txs.every((t) => t.height)) return void this.leave(s);
    const line = this.stopLines.get(d.key)!;
    const spot = line.join(s);
    s.state = "waiting";
    s.rush = 1;
    const row0 = Math.abs(spot.z - 3.7) < 0.1;
    await s.walk(row0 ? [v(spot.x, kerb), spot] : [v(d.crossX + 0.6, kerb), v(d.crossX + 0.6, spot.z), spot], 1.6);
    s.faceDir = line.faceOf(s);
  }

  /** The bus currently standing at this district's stop, if any. */
  private busAt(d: DistrictPlan) {
    for (const b of this.buses) if (b.phase === "stopped" && Math.abs(b.group.position.x - d.stopX) < 0.5) return b;
    return null;
  }

  private async leave(s: Snark) {
    s.state = "leaving";
    s.rush = 1;
    s.faceDir = null;
    this.leaveLines(s);
    for (const t of s.txs) this.byTx.delete(t.txid);
    // home through the nearest side street
    const d = DISTRICTS.find((x) => x.key === s.district) ?? DISTRICTS[0];
    const p = s.root.position;
    const side = p.z > 0 ? 4.4 : nz(-4.3);
    const out = Math.abs(p.x - d.x0) < Math.abs(p.x - d.x1) ? d.x0 + 3.4 : d.x1 - 3.4;
    await s.walk([v(p.x, side), v(out, side), v(out, side > 0 ? 26 : -28)], 2.0);
    this.remove(s);
  }

  private leaveLines(s: Snark) {
    for (const l of this.stopLines.values()) l.leave(s);
    for (const l of this.rankLines.values()) l.leave(s);
  }

  private remove(s: Snark) {
    this.leaveLines(s);
    s.root.parent?.remove(s.root);
    this.snarks.delete(s);
    this.ev.removed(s);
  }

  /** Shopkeepers behind every counter. */
  private async spawnLocals() {
    const keepers = [6221];
    let k = 0;
    for (const shop of this.shops.values()) {
      try {
        const s = await this.newSnark(keepers[k++ % keepers.length]);
        s.state = "resident";
        s.role = "Shopkeeper";
        s.district = shop.site.district;
        s.root.position.copy(shop.site.keeper);
        s.faceDir = new THREE.Vector3(0, 0, 1);
        this.snarks.add(s);
        this.scene.add(s.root);
      } catch {}
    }
    // neighbours out and about are scene/residents.ts
  }

  // ---- deliveries -----------------------------------------------------------------------------

  /** Parcels waiting at each dock for the next truck. */
  private pending = { proof: [] as Tx[], depot: [] as Tx[] };
  private enRoute = { proof: false, depot: false };

  /**
   * Queue a parcel at the right dock: shielded ones need a proof, so they leave from the Proof
   * Factory; transparent ones from the depot. One truck takes everything that is waiting.
   */
  private truckDelivery(tx: Tx) {
    const source = tx.pool || tx.kind === "shielded" || tx.kind === "migration" ? "proof" : "depot";
    if (source === "proof") for (const fn of this.proofs) fn(tx);
    this.pending[source].push(tx);
    if (!this.enRoute[source]) void this.dispatch(source);
  }

  private porterSeq = 0;

  /**
   * The whole run of one delivery truck:
   * backs onto the loading dock, factory hands load the parcels into it, it pulls out and drives
   * west to the MEMPOOL shop, the driver gets down and carries each parcel into the shop, then the
   * truck turns up the side street and goes back round.
   */
  private async dispatch(source: "proof" | "depot") {
    this.enRoute[source] = true;
    await sleep(1200);
    const load = this.pending[source].splice(0);
    const shop = [...this.shops.values()][0];
    const dock = this.city.docks.find((k) => k.kind === source);
    const truck = new Truck(source);
    this.trucks.add(truck);
    const front = CITY.frontNorth;
    if (dock) {
      // nose out on the pavement, tail at the bay door
      truck.group.position.set(dock.x, 0, front + truck.length / 2 + 0.15);
      truck.group.rotation.y = -Math.PI / 2;
      this.scene.add(truck.group);
      truck.open();
      const worker = await this.porter(9000 + (this.porterSeq++ % 900));
      if (worker) {
        const bay = v(dock.x + 0.4, front - 1.1);
        worker.root.position.copy(bay);
        for (const tx of load) {
          worker.setTxs([tx]);
          worker.showParcels(true);
          await worker.walk([v(dock.x + 0.7, front + 0.25)], 2.4);
          worker.showParcels(false);
          await this.flyCrate(worker.root.position.clone().setY(1.0), [truck.tail()], tx);
          await worker.walk([bay], 2.4);
        }
        this.remove(worker);
      }
      truck.close();
      await sleep(400);
      // pull out: south across the pavement, swing into the westbound kerb lane
      while (!this.traffic.clearAt("west", dock.x - 5, truck.length)) await sleep(300);
      await this.drivePath(truck, [v(dock.x, CITY.laneWest + 1.6, 0), v(dock.x - 1.5, CITY.laneWest, 0), v(dock.x - 5, CITY.laneWest, 0)], 4.5);
    } else this.scene.add(truck.group);
    const veh = this.traffic.add(new Vehicle(truck, "west", dock ? dock.x - 5 : EDGE, 9));
    // heading west, the tail is the east end: stop with it just past the shop door
    // tail just short of the zebra, so the driver has a short walk and the crossing stays free
    await veh.stopAt(Math.min(shop.site.door.x + 0.9 + truck.length / 2, DISTRICTS[0].crossX - 1.3 - 0.8 - truck.length / 2));
    // the driver climbs down and carries every parcel into the shop
    const driver = await this.porter(8000 + (this.porterSeq++ % 900));
    if (driver) {
      driver.role = source === "proof" ? "Proof Factory driver" : "Depot driver";
      driver.root.position.copy(truck.cabSide().setY(CITY.curb));
      truck.open();
      for (const tx of load) {
        if (!this.mempool.has(tx.txid) && !tx.height) continue;
        await driver.walk([truck.behind().setY(CITY.curb)], 1.9);
        driver.setTxs([tx]);
        driver.showParcels(true);
        this.visit({ kind: "delivery", id: driver.id, tx, role: driver.role ?? "Driver" });
        await driver.walk([shop.site.door], 1.7);
        this.ev.door?.();
        await driver.walk([shop.site.inside, shop.site.counter], 1.7);
        driver.showParcels(false);
        this.addCrate(shop, tx);
        await sleep(250);
        await driver.walk([shop.site.inside, shop.site.door], 1.9);
      }
      truck.close();
      driver.setTxs([]);
      await driver.walk([truck.cabSide().setY(CITY.curb)], 1.9);
      this.remove(driver);
    } else for (const tx of load) this.addCrate(shop, tx);
    this.enRoute[source] = false;
    if (this.pending[source].length) void this.dispatch(source);
    // on to the junction, then up the side street and away
    const cx = CITY.cross[0];
    await veh.stopAt(cx + CITY.crossHalf + truck.length / 2 + 0.5);
    this.traffic.remove(veh);
    await this.drivePath(truck, [v(cx + 1.6, CITY.laneWest, 0), v(cx + 1.1, CITY.laneWest - 3, 0), v(cx + 1.1, CITY.minZ - 8, 0)], 6);
    this.scene.remove(truck.group);
    this.trucks.delete(truck);
  }

  /** A zkSNARK who works for the factories (not a carrier). */
  private async porter(seed: number) {
    try {
      const s = await this.newSnark(seed);
      s.state = "resident";
      s.role = "Factory hand";
      s.noClip = true;
      s.district = "downtown";
      this.snarks.add(s);
      this.scene.add(s.root);
      return s;
    } catch {
      return null;
    }
  }

  /** Drive a vehicle along a smooth path (outside the lane traffic), facing its direction. */
  private drivePath(mover: { group: THREE.Object3D; spin(d: number): void }, pts: THREE.Vector3[], speed: number) {
    const curve = new THREE.CatmullRomCurve3([mover.group.position.clone().setY(0), ...pts], false, "centripetal");
    const len = curve.getLength();
    return new Promise<void>((resolve) => {
      let u = 0;
      let last = performance.now();
      const step = () => {
        const now = performance.now();
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        const k = Math.min(1, u / len);
        // ease in and out of the manoeuvre
        const v2 = speed * (0.35 + 0.65 * Math.sin(Math.PI * Math.min(1, Math.max(0.05, k))));
        u += v2 * dt;
        const p = curve.getPointAt(Math.min(1, u / len));
        const tan = curve.getTangentAt(Math.min(1, u / len));
        mover.spin(p.distanceTo(mover.group.position.clone().setY(0)));
        mover.group.position.set(p.x, 0, p.z);
        mover.group.rotation.y = Math.atan2(-tan.z, tan.x);
        if (u >= len) return resolve();
        requestAnimationFrame(step);
      };
      step();
    });
  }

  /** Ordinary traffic in the two fast lanes, both directions, so the avenue is never empty. */
  private async ambientTraffic() {
    for (;;) {
      await sleep(2500 + Math.random() * 5000);
      if (this.cars.size > 7) continue;
      const lane = Math.random() < 0.5 ? "eastFast" : "westFast";
      const startX = lane === "eastFast" ? -EDGE : EDGE;
      if (Math.random() < 0.3) {
        void this.courier(lane, startX);
        continue;
      }
      const car = new Car("sedan");
      if (!this.traffic.clearAt(lane, startX, car.length)) continue;
      this.cars.add(car);
      this.scene.add(car.group);
      const veh = this.traffic.add(new Vehicle(car, lane, startX, 8 + Math.random() * 4));
      void veh.leaveTo(lane === "eastFast" ? EDGE : -EDGE).then(() => {
        this.traffic.remove(veh);
        this.scene.remove(car.group);
        this.cars.delete(car);
      });
    }
  }

  private couriers = 0;
  /** A delivery scooter with a zkSNARK courier, zipping down the avenue. */
  private async courier(lane: "eastFast" | "westFast", startX: number) {
    if (this.couriers >= 2) return;
    const scooter = new Scooter();
    if (!this.traffic.clearAt(lane, startX, scooter.length + 2)) return;
    this.couriers++;
    let rider: Snark | null = null;
    try {
      rider = await this.newSnark(1 + Math.floor(Math.random() * 10000));
    } catch {}
    if (rider) {
      rider.state = "resident";
      rider.role = "Courier";
      rider.district = "downtown";
      rider.root.position.copy(scooter.saddle);
      rider.perch(0.8);
      rider.setScale(0.9);
      rider.faceDir = new THREE.Vector3(lane === "eastFast" ? 1 : -1, 0, 0);
      scooter.group.add(rider.root);
      this.snarks.add(rider);
    }
    this.scene.add(scooter.group);
    const veh = this.traffic.add(new Vehicle(scooter, lane, startX, 10 + Math.random() * 3));
    await veh.leaveTo(lane === "eastFast" ? EDGE : -EDGE);
    this.traffic.remove(veh);
    this.scene.remove(scooter.group);
    if (rider) {
      this.snarks.delete(rider);
      this.ev.removed(rider);
    }
    this.couriers--;
  }

  private crateMat(tx: Tx) {
    const c = new THREE.Color(KIND_COLOR[tx.kind]);
    return new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.25, roughness: 0.7 });
  }

  private flyCrate(from: THREE.Vector3, via: THREE.Vector3[], tx: Tx) {
    const m = new THREE.Mesh(this.crateGeo, this.crateMat(tx));
    m.castShadow = true;
    this.scene.add(m);
    const pts = [from, ...via];
    return new Promise<void>((resolve) => {
      let i = 0;
      let t0 = performance.now();
      const step = () => {
        const k = Math.min(1, (performance.now() - t0) / 650);
        m.position.lerpVectors(pts[i], pts[i + 1], k);
        m.position.y += Math.sin(k * Math.PI) * 0.6;
        m.rotation.y += 0.12;
        if (k < 1) return void requestAnimationFrame(step);
        i++;
        t0 = performance.now();
        if (i < pts.length - 1) return void requestAnimationFrame(step);
        this.scene.remove(m);
        resolve();
      };
      step();
    });
  }

  private addCrate(shop: Shop, tx: Tx) {
    if (shop.rack.some((c) => c.tx === tx)) return;
    const mesh = new THREE.Mesh(this.crateGeo, this.crateMat(tx));
    mesh.castShadow = true;
    mesh.userData.tx = tx;
    shop.rack.push({ tx, mesh });
    this.scene.add(mesh);
    this.layoutRack(shop);
  }

  private takeCrate(shop: Shop, tx: Tx) {
    const i = shop.rack.findIndex((c) => c.tx === tx);
    if (i < 0) return;
    this.scene.remove(shop.rack[i].mesh);
    shop.rack.splice(i, 1);
    this.layoutRack(shop);
  }

  private layoutRack(shop: Shop) {
    shop.rack.forEach((c, i) => c.mesh.position.copy(shop.site.rack).add(new THREE.Vector3((i % 5) * 0.36 - 0.7, Math.floor(i / 5) * 0.34 + 0.17, 0)));
  }

  // ---- taxis and limousines ---------------------------------------------------------------------

  /** Walk to the rank, queue, and get collected by the right car. */
  private async toRank(s: Snark, tier: CarKind, d: DistrictPlan) {
    const vip: Vip = { s, tier, district: d, guards: [], ready: false, pending: false };
    for (const t of s.txs) this.vips.set(t.txid, vip);
    s.state = "vip";
    const line = this.rankLines.get(d.key)!;
    const spot = line.join(s);
    await s.walk([v(s.root.position.x, nz(-3.7)), spot], 1.6);
    s.faceDir = line.faceOf(s);
    // the car comes in westbound and pulls up with its door at the rank
    const car = new Car(tier);
    this.cars.add(car);
    this.scene.add(car.group);
    const veh = this.traffic.add(new Vehicle(car, "west", EDGE, 13));
    await veh.stopAt(d.rankX + car.doorOffset);
    while (line.people[0] !== s && this.snarks.has(s)) await sleep(300);
    const door = car.doorPoint().setY(CITY.curb);
    if (tier === "limo") {
      vip.guards = await this.castGuards(2);
      await car.openDoor();
      for (const [i, g] of vip.guards.entries()) {
        g.root.position.copy(door);
        g.setVisible(true);
        await g.walk([car.kerbPoint(i ? 1.4 : -1.4).setY(CITY.curb)], 1.6);
        g.faceDir = door.clone().sub(g.root.position).normalize();
      }
      await sleep(500);
    } else await car.openDoor();
    s.faceDir = null;
    await s.walk([door], 1.4);
    line.leave(s);
    s.setVisible(false);
    s.state = "chauffeured";
    for (const g of vip.guards) {
      await g.walk([door], 1.8);
      g.setVisible(false);
    }
    await car.closeDoor();
    await veh.leaveTo(-EDGE);
    this.traffic.remove(veh);
    this.scene.remove(car.group);
    this.cars.delete(car);
    vip.ready = true;
    if (vip.pending) void this.convoy(vip);
  }

  private async castGuards(n: number) {
    const used = new Set([...this.snarks].map((s) => s.id));
    const picks = this.rarest.filter((r) => !used.has(r.id)).sort(() => Math.random() - 0.5).slice(0, n);
    const guards: Snark[] = [];
    for (const p of picks) {
      try {
        const g = new Snark(p.id, await loadArt(p.id));
        g.state = "guard";
        g.rank = p.rank;
        g.setVisible(false);
        this.snarks.add(g);
        this.scene.add(g.root);
        guards.push(g);
      } catch {}
    }
    return guards;
  }

  /** The VIP's car rolls in behind the bus and follows it through the city: same block, own ride. */
  private async convoy(vip: Vip) {
    const car = new Car(vip.tier);
    this.cars.add(car);
    while (!this.traffic.clearAt("east", -EDGE, car.length)) await sleep(300);
    this.scene.add(car.group);
    const veh = this.traffic.add(new Vehicle(car, "east", -EDGE, 12));
    await veh.leaveTo(EDGE);
    this.traffic.remove(veh);
    this.scene.remove(car.group);
    this.cars.delete(car);
    for (const s of [vip.s, ...vip.guards]) this.remove(s);
    for (const t of vip.s.txs) this.vips.delete(t.txid);
  }

  // ---- blocks ---------------------------------------------------------------------------------

  private async runBlock(b: Block, animate: boolean) {
    const included = new Map(b.txs.map((t) => [t.txid, t]));
    for (const txid of included.keys()) {
      this.confirmedTx.add(txid);
      const mtx = this.mempool.get(txid);
      if (mtx) mtx.height = b.height;
      this.mempool.delete(txid);
      this.loading.delete(txid);
    }
    for (const shop of this.shops.values()) for (const c of [...shop.rack]) if (included.has(c.tx.txid) && !this.byTx.has(c.tx.txid)) this.takeCrate(shop, c.tx);
    const riders: Snark[] = [];
    let carried = 0;
    for (const s of this.carriers()) {
      if (!s.txs.some((t) => included.has(t.txid))) continue;
      for (const t of s.txs) if (included.has(t.txid)) t.height = b.height;
      carried += s.txs.filter((t) => t.height === b.height).length;
      if (s.state !== "vip") riders.push(s);
    }
    this.lastBlock = { height: b.height, hash: "", time: new Date(b.time).toISOString(), tx_count: b.txs.length + 1, size: b.size, fees: b.fees, miner_pool: b.pool };
    this.emitStats();
    const vipRides = [...new Set([...this.vips.entries()].filter(([txid]) => included.has(txid)).map(([, vp]) => vp))];

    const bus = new BlockBus();
    bus.setBlock(b.height);
    if (!animate) {
      for (const s of riders) this.settle(s, b.height);
      this.ev.bus("confirmed", b, carried, bus, null);
      return;
    }
    // riders anywhere in the chain hurry
    for (const s of riders) if (s.state !== "waiting") s.rush = 1.9;
    while (!this.traffic.clearAt("east", -EDGE, bus.length)) await sleep(300);
    this.buses.add(bus);
    this.scene.add(bus.group);
    const veh = this.traffic.add(new Vehicle(bus, "east", -EDGE, 12));
    bus.phase = "arriving";
    this.ev.bus("arriving", b, carried, bus, null);
    // the VIP cars of this block fall in behind it
    for (const vp of vipRides) {
      if (vp.ready) setTimeout(() => void this.convoy(vp), 1800);
      else vp.pending = true;
    }
    // west to east, stopping only where someone from this block is waiting or on the way
    for (const d of DISTRICTS) {
      const here = riders.filter((s) => s.district === d.key && this.snarks.has(s) && s.state !== "leaving" && s.state !== "riding");
      if (!here.length) continue;
      bus.phase = "arriving";
      await veh.stopAt(d.stopX);
      bus.phase = "stopped";
      bus.openDoors();
      this.ev.bus("boarding", b, carried, bus, d);
      await sleep(400);
      const line = this.stopLines.get(d.key)!;
      here
        .filter((s) => s.state === "waiting")
        .sort((a, c) => line.people.indexOf(a) - line.people.indexOf(c))
        .forEach((s, i) => setTimeout(() => void this.board(s, bus), i * 380));
      const t0 = performance.now();
      const done = () => here.every((s) => !this.snarks.has(s) || s.state === "riding" || s.state === "leaving" || !s.txs.some((t) => t.height === b.height));
      await sleep(1500);
      while (!done() && performance.now() - t0 < MAX_DWELL_MS) await sleep(250);
      await sleep(Math.max(900, 6500 - (performance.now() - t0)));
      await bus.closeDoors();
      for (const s of here) if (s.state === "boarding" && s.root.parent !== bus.cabin) this.remove(s);
      bus.phase = "departing";
      this.ev.bus("departing", b, carried, bus, d);
    }
    bus.phase = "departing";
    await veh.leaveTo(EDGE);
    this.traffic.remove(veh);
    this.scene.remove(bus.group);
    this.buses.delete(bus);
    for (const s of [...this.snarks])
      if (s.state === "riding" && s.bus === bus) {
        this.snarks.delete(s);
        this.ev.removed(s);
      }
    for (const s of riders) if (this.snarks.has(s) && s.state !== "riding") this.settle(s, b.height);
    this.ev.bus("confirmed", b, carried, bus, null);
  }

  /** After a block: drop mined parcels; anyone left with nothing walks off. */
  private settle(s: Snark, height: number) {
    const keep = s.txs.filter((t) => t.height !== height);
    for (const t of s.txs) if (t.height === height) this.byTx.delete(t.txid);
    s.setTxs(keep);
    if (!keep.length && s.state !== "leaving") void this.leave(s);
  }

  private async board(s: Snark, bus: BlockBus) {
    if (s.state === "boarding" || s.state === "riding") return;
    s.state = "boarding";
    s.faceDir = null;
    this.leaveLines(s);
    const doors = bus.doorPoints();
    let di = 0;
    doors.forEach((d, i) => {
      if (d.distanceTo(s.root.position) < doors[di].distanceTo(s.root.position)) di = i;
    });
    const kerb = CITY.south.z0 + 0.35;
    await s.walk([v(s.root.position.x + (doors[di].x > s.root.position.x ? 0.4 : -0.4), kerb), doors[di]], 2.0);
    if (s.state !== "boarding" || bus.phase !== "stopped") return;
    // step aboard: from here on the zkSNARK lives in the bus's frame and rides with it
    bus.cabin.attach(s.root);
    s.bus = bus;
    s.setScale(0.78);
    const { path, seated } = bus.pathInside(di);
    await s.walk(path, 1.5);
    if (s.state !== "boarding") return;
    for (const t of s.txs) this.byTx.delete(t.txid);
    s.state = "riding";
    s.rush = 1;
    s.sit(seated);
    s.faceDir = new THREE.Vector3(1, 0, 0);
  }

  // ---- per frame ------------------------------------------------------------------------------

  update(dt: number, t: number, camQuat: THREE.Quaternion, camRight: THREE.Vector3) {
    this.traffic.update(dt);
    for (const b of this.buses) b.update(dt);
    for (const c of this.cars) c.update(dt);
    for (const k of this.trucks) k.update(dt);
    const active: Snark[] = [];
    for (const s of this.snarks) {
      s.update(dt, t, camQuat, camRight);
      if (s.root.visible && s.root.parent === this.scene) active.push(s);
    }
    this.collide(active);
    if (t - this.lastTidy > 0.4) {
      this.lastTidy = t;
      for (const l of [...this.stopLines.values(), ...this.rankLines.values()]) this.tidy(l);
    }
  }

  /** Keep a line tight: anyone behind their spot shuffles forward along it. */
  private tidy(line: Line) {
    let delay = 0;
    line.people.forEach((s, i) => {
      if ((s.state !== "waiting" && s.state !== "vip") || s.isWalking) return;
      const target = line.spots[Math.min(i, line.spots.length - 1)];
      if (s.root.position.distanceTo(target) < 0.12) return;
      let n = 0;
      line.spots.forEach((p, k) => {
        if (p.distanceTo(s.root.position) < line.spots[n].distanceTo(s.root.position)) n = k;
      });
      const path: THREE.Vector3[] = [];
      for (let k = n - 1; k >= i; k--) path.push(line.spots[k]);
      if (!path.length) path.push(target);
      const go = () => {
        if (line.people[i] === s && !s.isWalking) void s.walk(path, 1.3).then(() => (s.faceDir = line.faceOf(s)));
      };
      if (delay) setTimeout(go, delay);
      else go();
      delay += 150;
    });
  }

  /** Nobody walks through anybody: walkers get pushed out of standing people, furniture and walls. */
  private collide(list: Snark[]) {
    const R = 0.27;
    for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i],
          b = list[j];
        if (a.ghosting || b.ghosting) continue;
        const pa = a.root.position,
          pb = b.root.position;
        const dx = pb.x - pa.x,
          dz = pb.z - pa.z;
        if (Math.abs(dx) > R * 2 || Math.abs(dz) > R * 2) continue;
        const d = Math.hypot(dx, dz);
        if (d >= R * 2 || d < 1e-5) continue;
        const push = R * 2 - d;
        const am = a.isWalking && a.state !== "boarding",
          bm = b.isWalking && b.state !== "boarding";
        const ka = am && bm ? 0.5 : am ? 1 : bm ? 0 : 0.5;
        pa.x -= (dx / d) * push * ka;
        pa.z -= (dz / d) * push * ka;
        pb.x += (dx / d) * push * (1 - ka);
        pb.z += (dz / d) * push * (1 - ka);
      }
    for (const s of list) if (s.isWalking && !s.noClip && !s.ghosting && s.state !== "boarding" && s.state !== "shopping") this.city.nav.resolve(s.root.position, R);
  }

  private emitStats() {
    this.ev.stats({ mempool: this.mempool.size, shown: this.byTx.size, lastBlock: this.lastBlock });
  }

  // ---- debug (only reachable with ?debug) ---------------------------------------------------------

  /** Test only: stage a car pickup with a copy of a real waiting transaction. */
  debugVip(tier: CarKind) {
    const base = [...this.mempool.values()][0];
    if (!base) return false;
    const tx: Tx = { ...base, txid: `${base.txid.slice(0, 56)}${Math.random().toString(16).slice(2, 10)}`, visible: tier === "limo" ? 600e8 : 80e8, kind: "transparent", pool: null };
    this.mempool.set(tx.txid, tx);
    this.place(tx, "walk");
    return tx.txid;
  }

  /** Test only: a copy of a pending transaction, delivered and picked up like a new one. */
  debugCarrier(kind: Tx["kind"] = "shielded") {
    const base = [...this.mempool.values()][0];
    if (!base) return false;
    const tx: Tx = { ...base, txid: `${base.txid.slice(0, 56)}${Math.random().toString(16).slice(2, 10)}`, kind, seenAt: Date.now() };
    this.mempool.set(tx.txid, tx);
    this.place(tx, "walk");
    return tx.txid;
  }

  /** Test only: `n` copies of a pending transaction, already queueing at the stop. */
  debugQueue(n: number) {
    const base = [...this.mempool.values()][0];
    if (!base) return 0;
    for (let i = 0; i < n; i++) {
      const tx: Tx = { ...base, txid: `${base.txid.slice(0, 56)}${Math.random().toString(16).slice(2, 10)}`, kind: "shielded", visible: 0, pool: "orchard" };
      this.mempool.set(tx.txid, tx);
      this.place(tx, "stop");
    }
    return n;
  }

  debugCars() {
    return [...this.traffic.vehicles].map((x) => `${x.lane}:${x.x.toFixed(1)}`).join(" ");
  }
}
