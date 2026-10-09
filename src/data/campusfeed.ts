/**
 * ZK UNIVERSITY's live walls: what Zakura and Tachyon publish, read straight from their sites and
 * GitHub (all four answer browsers with CORS), kept an hour in localStorage so a visitor spends a
 * handful of GitHub's 60 anonymous calls an hour, at most.
 *
 * - Zakura: the announcements' Atom feed (zakura.com), the node's releases and latest commits
 *   (github.com/zakura-core/zakura).
 * - Tachyon: the blog's index (tachyon.z.cash/blog, no feed: its cards are parsed), the latest
 *   commits of Ragu and of the Tachyon protocol (github.com/tachyon-zcash).
 */

export interface Post {
  title: string;
  date: string;
  url: string;
  summary: string;
}
export interface Release {
  tag: string;
  name: string;
  date: string;
  url: string;
  /** The release notes' first lines, Markdown stripped. */
  notes: string[];
}
export interface Commit {
  repo: string;
  sha: string;
  message: string;
  author: string;
  date: string;
  url: string;
}
export interface CampusFeed {
  zakura: { posts: Post[]; releases: Release[]; commits: Commit[] };
  tachyon: { posts: Post[]; commits: Commit[] };
  at: number;
}

const KEY = "street.campus";
const TTL = 3_600_000;
let cached: CampusFeed | null = null;
let loading: Promise<CampusFeed> | null = null;
const listeners: (() => void)[] = [];

const text = async (url: string) => {
  try {
    const r = await fetch(url);
    return r.ok ? await r.text() : null;
  } catch {
    return null;
  }
};
const json = async <T>(url: string): Promise<T | null> => {
  try {
    const r = await fetch(url, { headers: { Accept: "application/vnd.github+json" } });
    return r.ok ? ((await r.json()) as T) : null;
  } catch {
    return null;
  }
};
const day = (s: string | null | undefined) => (s ?? "").slice(0, 10);
const clean = (s: string) => s.replace(/\s+/g, " ").trim();

async function zakuraPosts(): Promise<Post[] | null> {
  const src = await text("https://zakura.com/announcements/atom.xml");
  if (!src) return null;
  const doc = new DOMParser().parseFromString(src, "application/xml");
  return [...doc.querySelectorAll("entry")].slice(0, 12).map((e) => {
    const html = e.querySelector("summary")?.textContent ?? e.querySelector("content")?.textContent ?? "";
    const plain = new DOMParser().parseFromString(html, "text/html").body.textContent ?? "";
    return {
      title: clean(e.querySelector("title")?.textContent ?? ""),
      date: day(e.querySelector("published")?.textContent ?? e.querySelector("updated")?.textContent),
      url: e.querySelector("link")?.getAttribute("href") ?? "https://zakura.com/announcements/",
      summary: clean(plain).slice(0, 220),
    };
  });
}

async function tachyonPosts(): Promise<Post[] | null> {
  const src = await text("https://tachyon.z.cash/blog/");
  if (!src) return null;
  const doc = new DOMParser().parseFromString(src, "text/html");
  return [...doc.querySelectorAll("article.blog-card")].slice(0, 12).map((a) => ({
    title: clean(a.querySelector(".blog-card-title")?.textContent ?? ""),
    date: day(a.querySelector(".blog-card-date")?.textContent?.trim()),
    url: a.querySelector(".blog-card-title a")?.getAttribute("href") ?? "https://tachyon.z.cash/blog/",
    summary: clean(a.querySelector(".blog-card-excerpt")?.textContent ?? ""),
  }));
}

interface GhRelease {
  tag_name: string;
  name: string | null;
  published_at: string;
  html_url: string;
  body: string | null;
}
async function releases(repo: string): Promise<Release[] | null> {
  const r = await json<GhRelease[]>(`https://api.github.com/repos/${repo}/releases?per_page=8`);
  return (
    r?.map((x) => ({
      tag: x.tag_name,
      name: x.name || x.tag_name,
      date: day(x.published_at),
      url: x.html_url,
      notes: (x.body ?? "")
        .split("\n")
        .map((l) => l.replace(/^[#>*\-\s]+/, "").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/[`*_]/g, "").trim())
        .filter((l) => l.length > 3)
        .slice(0, 6),
    })) ?? null
  );
}

interface GhCommit {
  sha: string;
  html_url: string;
  commit: { message: string; author: { name: string; date: string } };
  author: { login: string } | null;
}
async function commits(repo: string, n = 6): Promise<Commit[] | null> {
  const r = await json<GhCommit[]>(`https://api.github.com/repos/${repo}/commits?per_page=${n}`);
  return (
    r?.map((c) => ({
      repo: repo.split("/")[1],
      sha: c.sha.slice(0, 7),
      message: c.commit.message.split("\n")[0].slice(0, 120),
      author: c.author?.login ?? c.commit.author.name,
      date: day(c.commit.author.date),
      url: c.html_url,
    })) ?? null
  );
}

function stored(): CampusFeed | null {
  try {
    const s = localStorage.getItem(KEY);
    return s ? (JSON.parse(s) as CampusFeed) : null;
  } catch {
    return null;
  }
}

async function load(): Promise<CampusFeed> {
  const old = cached ?? stored();
  const [zp, zr, zc, tp, rc, tc] = await Promise.all([zakuraPosts(), releases("zakura-core/zakura"), commits("zakura-core/zakura"), tachyonPosts(), commits("tachyon-zcash/ragu", 5), commits("tachyon-zcash/tachyon", 5)]);
  // a source that failed keeps what it had
  const feed: CampusFeed = {
    zakura: { posts: zp ?? old?.zakura.posts ?? [], releases: zr ?? old?.zakura.releases ?? [], commits: zc ?? old?.zakura.commits ?? [] },
    tachyon: {
      posts: tp ?? old?.tachyon.posts ?? [],
      commits: rc || tc ? [...(rc ?? []), ...(tc ?? [])].sort((a, b) => b.date.localeCompare(a.date)) : (old?.tachyon.commits ?? []),
    },
    at: Date.now(),
  };
  cached = feed;
  try {
    localStorage.setItem(KEY, JSON.stringify(feed));
  } catch {}
  listeners.forEach((fn) => fn());
  return feed;
}

/** The walls' data: the stored copy at once if it is fresh, else a fetch. */
export function campusFeed(): Promise<CampusFeed> {
  cached ??= stored();
  if (cached && Date.now() - cached.at < TTL) return Promise.resolve(cached);
  loading ??= load().finally(() => (loading = null));
  return cached ? Promise.resolve(cached) : loading;
}

export const campusNow = () => (cached ??= stored());
export const onCampusFeed = (fn: () => void) => listeners.push(fn);
