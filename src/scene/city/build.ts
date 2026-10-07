import { apartment, house, izakaya, office, pavilion, shophouse, warehouse, type Built } from "../voxel/buildings";
import { bank, cardShop, construction, depot, factory, library, machiya, mempoolShop, shrine, zsaShop } from "../voxel/buildings2";
import * as Props from "../voxel/props";
import { landmark } from "../voxel/landmarks";
import type { BuildingJob } from "./plan";

/**
 * Turn plan jobs into voxel models. Pure (no DOM): runs inside the generation workers.
 */
export function buildJob(j: BuildingJob): Built {
  // the plan decides the options; each archetype reads the ones it knows
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const o = { ...j.opts, width: j.width } as any;
  switch (j.type) {
    case "shophouse":
      return shophouse(j.seed, o);
    case "apartment":
      return apartment(j.seed, o);
    case "office":
      return office(j.seed, o);
    case "izakaya":
      return izakaya(j.seed, o);
    case "warehouse":
      return warehouse(j.seed, o);
    case "house":
      return house(j.seed, o);
    case "machiya":
      return machiya(j.seed, o);
    case "mempool":
      return mempoolShop(j.seed, o);
    case "depot":
      return depot(j.seed, j.width);
    case "factory":
      return factory(j.seed, j.width);
    case "shrine":
      return shrine(j.seed);
    case "construction":
      return construction(j.seed);
    case "cardshop":
      return cardShop(j.seed, o);
    case "bank":
      return bank(j.seed, o);
    case "zsa":
      return zsaShop(j.seed, o);
    case "library":
      return library(j.seed, o);
    case "pavilion":
      return pavilion(j.seed, o);
    case "landmark":
      return landmark(j.seed, o);
  }
}

export function propModel(type: string, args: unknown[]): Props.Prop {
  const a = args as never[];
  switch (type) {
    case "lamp":
      return Props.streetLamp(a[0]);
    case "pole":
      return Props.utilityPole();
    case "bollard":
      return Props.bollard();
    case "shelter":
      return Props.busShelter();
    case "stopPole":
      return Props.stopPole();
    case "taxiSign":
      return Props.taxiSign();
    case "rail":
      return Props.rail(a[0]);
    case "vending":
      return Props.vendingMachine(a[0]);
    case "bicycle":
      return Props.bicycle(a[0]);
    case "streetSign":
      return Props.streetSign();
    case "hydrant":
      return Props.hydrant();
    case "planter":
      return Props.planter(a[0], a[1]);
    case "stall":
      return Props.stall(a[0], a[1]);
    case "tree":
      return Props.tree(a[0], a[1]);
    case "stoneLantern":
      return Props.stoneLantern();
    case "bench":
      return Props.bench();
    case "crates":
      return Props.crates(a[0]);
    case "trashBags":
      return Props.trashBags(a[0]);
    case "trashBin":
      return Props.trashBin();
    case "cone":
      return Props.cone();
    case "mailbox":
      return Props.mailbox();
    case "fountain":
      return Props.fountain();
    case "gate":
      return Props.gate(a[0]);
    case "greenhouse":
      return Props.greenhouse();
    case "chimney":
      return Props.chimney(a[0]);
    case "container":
      return Props.container(a[0], a[1]);
    case "gantry":
      return Props.gantry(a[0], a[1]);
    case "fence":
      return Props.fenceSegment(a[0]);
    case "barrel":
      return Props.barrel(a[0]);
    case "maple":
      return Props.maple(a[0]);
    case "bamboo":
      return Props.bamboo(a[0]);
    case "bridge":
      return Props.bridge();
    case "stones":
      return Props.steppingStones(a[0]);
    case "tieredFountain":
      return Props.tieredFountain();
    case "roofGarden":
      return Props.roofGarden(a[0], a[1], a[2]);
    default:
      throw new Error(`unknown prop ${type}`);
  }
}
