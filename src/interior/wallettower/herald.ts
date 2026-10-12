import * as THREE from "three";
import { walletFeeds, walletPulse, type Pulse } from "../../data/walletfeed";
import type { Snark } from "../../scene/snark";
import type { InteriorContext } from "../types";
import type { Level } from "../zktowers/kit";
import type { WalletKit } from "./shared";

/** Seconds between two asks of the pulse while you are inside. */
const EVERY = 20;
/** Announced aloud per ask at most (the rest go to the inbox only). */
const ALOUD = 4;

const repoName = (r: string | null) => (r ?? "").split("/")[1] ?? r ?? "";
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** What the herald says about a pulse (a bubble holds ~110 characters; the inbox letter has the link). */
export function pulseLine(p: Pulse, handle: string): string {
  const repo = repoName(p.repo);
  switch (p.kind) {
    case "commit":
      return `New commit on ${repo}${p.actor ? ` by @${p.actor}` : ""}: "${clip(p.title, 55)}"`;
    case "release":
      return `${repo} just released ${clip(p.title, 60)}!`;
    case "pull":
      return `@${p.actor ?? "someone"} opened a pull request on ${repo}: ${clip(p.title, 50)}`;
    case "merge":
      return `Merged on ${repo}: ${clip(p.title, 70)}`;
    case "retweet":
      return `@${handle} retweeted @${p.actor}: "${clip(p.title, 60)}"`;
    default:
      return `@${p.actor ?? handle} just tweeted: "${clip(p.title, 75)}"`;
  }
}

const TITLE: Record<Pulse["kind"], string> = { commit: "New commit", release: "New release", pull: "Pull request opened", merge: "Pull request merged", tweet: "New tweet", retweet: "Retweet" };

/**
 * The tower's herald: a zkSNARK by the lift on every floor. While you are inside, the tower asks
 * the API what moved (every 20 s); each commit, release, pull request or tweet of its wallet, the
 * herald of your floor walks up to you and says it, and a letter goes to the inbox with the link.
 */
export function herald(wk: WalletKit, ctx: InteriorContext, levels: Level[], seed: number) {
  const { k, look } = wk;
  const heralds: (Snark | null)[] = levels.map(() => null);
  levels.forEach((lv, f) => {
    // a step off the lift's arrival spot
    const at: [number, number] = [lv.spawn[0] + 2, lv.spawn[1] - 1.5];
    k.onCast(f, () => {
      void k.person(f, seed + f, at, "Herald", { face: [0, 1], lines: [`I'm ${look.name}'s herald: every commit, every release${look.handle ? ", every tweet" : ""}, I tell you the minute it lands.`, "Stay a while. Something always ships."] }).then((s) => (heralds[f] = s));
    });
  });

  const queue: Pulse[] = [];
  let speaking = 0;
  const announce = (p: Pulse) => {
    const line = pulseLine(p, look.handle);
    const s = heralds[k.current];
    if (s) {
      const eye = new THREE.Vector3(k.eye.x, s.root.position.y, k.eye.z);
      const to = eye.clone().sub(s.root.position);
      const d = to.length();
      // walks up to you (stops a couple of steps away, his bubble in view), then says it
      const go = d > 3.4 ? s.walk([s.root.position.clone().add(to.multiplyScalar((d - 2.8) / d))], 2.2) : Promise.resolve();
      void go.then(() => {
        s.faceDir = eye.clone().sub(s.root.position).setY(0).normalize();
        s.say(line, 7, p.kind === "release" ? "shout" : "talk");
      });
    }
    const url = p.url;
    ctx.mail("dev", `${look.name} · ${TITLE[p.kind]}`, line, url ? { label: "Open", fn: () => window.open(url, "_blank", "noopener") } : undefined);
  };

  let wait = 2;
  let asking = false;
  const tick = (dt: number) => {
    speaking -= dt;
    if (speaking <= 0 && queue.length) {
      announce(queue.shift()!);
      speaking = 8;
    }
    wait -= dt;
    if (wait > 0 || asking) return;
    wait = EVERY;
    asking = true;
    void walletPulse()
      .then((items) => {
        const mine = items.filter((p) => p.wallet === look.key);
        if (!mine.length) return;
        mine.slice(ALOUD).forEach((p) => ctx.mail("dev", `${look.name} · ${TITLE[p.kind]}`, pulseLine(p, look.handle), p.url ? { label: "Open", fn: () => window.open(p.url!, "_blank", "noopener") } : undefined));
        queue.push(...mine.slice(0, ALOUD));
        // the boards: once the API has read the repository again
        if (mine.some((p) => p.repo)) setTimeout(() => void walletFeeds(true), 30_000);
      })
      .finally(() => (asking = false));
  };
  // ticks only run on the floor you are on, inside: one per floor, the same clock
  levels.forEach((_, f) => k.ticks[f].push(tick));
}
