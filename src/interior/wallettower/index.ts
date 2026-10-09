import * as THREE from "three";
import { onWalletFeeds, walletFeed, walletFeeds, type WalletTower } from "../../data/walletfeed";
import type { Interior, InteriorContext } from "../types";
import { SkyKit, type Level } from "../zktowers/kit";
import { labFloor } from "./lab";
import { lobby } from "./lobby";
import { roof } from "./roof";
import { LOOKS, type WalletKit } from "./shared";
import { tweetsFloor } from "./tweets";

/**
 * The wallet towers on the avenue, Noir's (obsidian and emerald, next to ZODL's), ZODL's (white and black, like its app icon, across from the ZEC Reserve) and
 * Vizor's (crimson and silver, its knight's colours, across from HALO): the lobby and the wallet's card, the wall of
 * its tweets on 8, the lab of its releases on 16, its emblem over the roof. Everything on the walls
 * is read live from X, GitHub and the App Store (through the API, every quarter hour).
 */
export const LEVELS: Level[] = [
  { label: "G", name: "Lobby · the emblem, the wallet's card", y: 0, spawn: [0, -2.6], yaw: 0, view: 2 },
  { label: "8", name: "Tweets · the wall of tweets", y: 30, spawn: [-13.4, -6], yaw: -Math.PI / 2, view: 30 },
  { label: "16", name: "Lab · releases, developers", y: 60, spawn: [-11.4, -6], yaw: -Math.PI / 2, view: 60 },
  { label: "R", name: "Roof · the crown, the view", y: 104, spawn: [0, -19.4], yaw: Math.PI, view: 106 },
];
/** Metres from the street door back to the tower's axis (the panoramas' point). */
const BACK = 14;

export function buildWalletTower(ctx: InteriorContext, key: WalletTower): Interior {
  const look = LOOKS[key];
  const k = new SkyKit(ctx, LEVELS, look.title, { bg: look.dark });
  k.scene.environmentIntensity = 0.3;
  const listeners: (() => void)[] = [];
  const wk: WalletKit = {
    k,
    look,
    feed: () => walletFeed(key),
    onFeed: (fn) => listeners.push(fn),
  };
  onWalletFeeds(() => listeners.forEach((fn) => fn()));
  void walletFeeds();
  // fresh posters every 10 minutes while the tower is open
  setInterval(() => void walletFeeds(), 600_000);
  lobby(wk);
  tweetsFloor(wk);
  labFloor(wk);
  roof(wk);
  const interior = k.interior(key, BACK);
  // the look's dimming: every lamp, every self-lit screen and sign
  k.scene.traverse((o) => {
    if (o instanceof THREE.PointLight) o.intensity *= look.lamps;
    const m = (o as THREE.Mesh).material;
    if (m instanceof THREE.MeshBasicMaterial && m.map && !m.toneMapped) m.color.multiplyScalar(look.screens);
  });
  return interior;
}
