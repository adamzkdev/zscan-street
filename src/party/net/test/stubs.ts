/**
 * Just enough of a browser for a mini-game's sim to be built and run headless (Node, the `jsc`
 * shell): a canvas whose 2D context draws nothing, an Image, storage, a location. Imported first by
 * entry.ts; never part of the app.
 */
const g = globalThis as unknown as Record<string, unknown>;
declare const preciseTime: (() => number) | undefined;

if (typeof g.performance === "undefined") g.performance = { now: typeof preciseTime === "function" ? () => preciseTime() * 1000 : () => Date.now() };
const noop = () => {};
if (typeof g.window === "undefined") g.window = g;
for (const k of ["addEventListener", "removeEventListener"]) if (typeof g[k] !== "function") g[k] = noop;
if (typeof g.setTimeout !== "function") g.setTimeout = () => 0;
if (typeof g.clearTimeout !== "function") g.clearTimeout = noop;
if (typeof g.setInterval !== "function") g.setInterval = () => 0;
if (typeof g.clearInterval !== "function") g.clearInterval = noop;
if (typeof g.requestAnimationFrame !== "function") g.requestAnimationFrame = () => 0;
if (typeof g.location === "undefined") g.location = { pathname: "/nettest", search: "", href: "http://localhost/nettest", origin: "http://localhost" };
if (typeof g.navigator === "undefined") g.navigator = { userAgent: "headless", language: "en", platform: "", maxTouchPoints: 0 };
const store = new Map<string, string>();
if (typeof g.localStorage === "undefined") g.localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };
if (typeof g.matchMedia !== "function") g.matchMedia = () => ({ matches: false, addEventListener: noop, removeEventListener: noop, addListener: noop, removeListener: noop });
if (typeof g.devicePixelRatio === "undefined") g.devicePixelRatio = 1;
if (typeof g.URLSearchParams === "undefined")
  g.URLSearchParams = class {
    private m = new Map<string, string>();
    constructor(q = "") {
      for (const kv of String(q).replace(/^\?/, "").split("&").filter(Boolean)) {
        const [k, v = ""] = kv.split("=");
        this.m.set(decodeURIComponent(k), decodeURIComponent(v));
      }
    }
    get(k: string) {
      return this.m.get(k) ?? null;
    }
    has(k: string) {
      return this.m.has(k);
    }
  };

/** A 2D context that takes every call and every setting, and draws nothing. */
function ctx2d(canvas: unknown) {
  const props: Record<string | symbol, unknown> = {
    canvas,
    measureText: (s: string) => ({ width: String(s).length * 8, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 }),
    createLinearGradient: () => ({ addColorStop: noop }),
    createRadialGradient: () => ({ addColorStop: noop }),
    createConicGradient: () => ({ addColorStop: noop }),
    createPattern: () => ({}),
    getImageData: (_x: number, _y: number, w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(Math.max(1, w * h * 4)) }),
    createImageData: (w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(Math.max(1, w * h * 4)) }),
    getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
    isPointInPath: () => false,
    getLineDash: () => [],
  };
  return new Proxy(props, {
    get: (t, k) => (k in t ? t[k] : noop),
    set: (t, k, v) => ((t[k] = v), true),
  });
}

class FakeCanvas {
  width = 300;
  height = 150;
  style: Record<string, string> = {};
  private c: unknown = null;
  getContext() {
    return (this.c ??= ctx2d(this));
  }
  toDataURL() {
    return "data:,";
  }
  addEventListener() {}
  removeEventListener() {}
}

if (typeof g.document === "undefined") {
  const el = () => ({ style: {}, appendChild: noop, append: noop, remove: noop, addEventListener: noop, removeEventListener: noop, setAttribute: noop, classList: { add: noop, remove: noop, toggle: noop } });
  g.document = {
    createElement: (tag: string) => (tag === "canvas" ? new FakeCanvas() : el()),
    createElementNS: (_ns: string, tag: string) => (tag === "canvas" ? new FakeCanvas() : el()),
    images: [],
    body: el(),
    documentElement: el(),
    addEventListener: noop,
    removeEventListener: noop,
    querySelector: () => null,
  };
}
if (typeof g.Image === "undefined")
  g.Image = class {
    complete = false;
    naturalWidth = 0;
    src = "";
    onload: unknown = null;
    addEventListener() {}
  };
if (typeof g.OffscreenCanvas === "undefined") g.OffscreenCanvas = FakeCanvas;

export {};
