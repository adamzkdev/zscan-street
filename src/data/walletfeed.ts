import { get } from "./zscan";

/**
 * What ZODL, Vizor, Noir and ZApp say about themselves, for their towers (ZApp: GitHub only, no X): the X profile, the latest tweets
 * (their own, their retweets, their users'), GitHub releases, repositories, the latest commits
 * with their diffs and the open pull requests, the App Store
 * rating. Read every quarter hour by the API (`/v1/street/wallets`), here at most every 10 min.
 */

export type WalletTower = "zodl" | "vizor" | "noir" | "zapp";

export interface Tweet {
  id: string;
  url: string;
  handle: string;
  name: string;
  avatar: string | null;
  verified: boolean;
  text: string;
  at: string;
  likes: number;
  retweets: number;
  replies: number;
  media: { url: string; w: number; h: number; video: boolean }[];
  /** The wallet's account retweeted it. */
  rt_by: string | null;
  views?: number | null;
  /** The tweet it quotes. */
  quote?: { handle: string; name: string; text: string } | null;
}

export interface Commit {
  repo: string;
  sha: string;
  message: string;
  author: string;
  login: string | null;
  avatar: string | null;
  date: string;
  url: string;
  /** The newest commits come with their diffs (a few files, the first lines of each). */
  files: { name: string; additions: number; deletions: number; patch: string }[];
}

export interface Pull {
  repo: string;
  number: number;
  title: string;
  login: string;
  avatar: string | null;
  draft: boolean;
  updated: string;
  url: string;
}

export interface Release {
  repo: string;
  tag: string;
  name: string | null;
  date: string;
  url: string;
  notes: string;
}

export interface Repo {
  repo: string;
  url: string;
  description: string | null;
  stars: number;
  forks: number;
  issues: number;
  language: string | null;
  pushed_at: string;
}

export interface WalletFeed {
  key: WalletTower;
  name: string;
  handle: string;
  site: string;
  profile: {
    name: string;
    handle: string;
    description: string;
    followers: number;
    following: number;
    tweets: number;
    avatar: string | null;
    banner: string | null;
    joined: string | null;
    location: string | null;
  } | null;
  tweets: Tweet[];
  releases: Release[];
  repos: Repo[];
  commits?: Commit[];
  pulls?: Pull[];
  store: {
    name: string;
    rating: number | null;
    ratings: number | null;
    version: string;
    released: string;
    notes: string | null;
    url: string;
    size: string | null;
    seller?: string;
    genre?: string;
    /** The Chrome Web Store (Noir): its users instead of a ratings count. */
    users?: number | null;
    chrome?: boolean;
  } | null;
  fetched_at: string;
}

let cache: { at: number; feeds: Partial<Record<WalletTower, WalletFeed>> } | null = null;
let pending: Promise<Partial<Record<WalletTower, WalletFeed>>> | null = null;
const listeners = new Set<() => void>();

/** Both feeds (missing ones while the API has none yet). */
export function walletFeeds(): Promise<Partial<Record<WalletTower, WalletFeed>>> {
  if (cache && performance.now() - cache.at < 600_000) return Promise.resolve(cache.feeds);
  pending ??= get<Partial<Record<WalletTower, WalletFeed>>>("/v1/street/wallets").then((f) => {
    pending = null;
    if (f) {
      cache = { at: performance.now(), feeds: f };
      for (const l of listeners) l();
    }
    return f ?? cache?.feeds ?? {};
  });
  return pending;
}

/** The last feed for one wallet, or null while loading. */
export function walletFeed(key: WalletTower): WalletFeed | null {
  return cache?.feeds[key] ?? null;
}

/** Called whenever new feeds arrive. */
export function onWalletFeeds(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Pictures from X (avatars, tweet photos), loaded once, drawable on canvases (X allows CORS). */
const images = new Map<string, Promise<HTMLImageElement | null>>();
export function xImage(url: string | null | undefined): Promise<HTMLImageElement | null> {
  if (!url) return Promise.resolve(null);
  let p = images.get(url);
  if (!p) {
    p = new Promise((res) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.decoding = "async";
      img.onload = () => res(img);
      img.onerror = () => res(null);
      img.src = url;
    });
    images.set(url, p);
  }
  return p;
}
