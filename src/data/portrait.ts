import * as THREE from "three";

// One queue across buildings and character art: entering a room must not flood the image API.
const pending = new Map<string, Promise<HTMLImageElement>>();
const waiting: (() => void)[] = [];
let running = 0;

async function attempt(url: string): Promise<HTMLImageElement> {
  await new Promise<void>((resolve) => {
    const start = () => { running++; resolve(); };
    if (running < 3) start();
    else waiting.push(start);
  });
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      const done = (error?: Error) => {
        clearTimeout(timer);
        image.onload = image.onerror = null;
        if (error) {
          image.removeAttribute("src");
          reject(error);
        } else resolve(image);
      };
      const timer = setTimeout(() => done(new Error("Portrait download timed out")), 25_000);
      image.crossOrigin = "anonymous";
      image.onload = () => done();
      image.onerror = () => done(new Error("Portrait download failed"));
      image.src = url;
    });
  } finally {
    running--;
    waiting.shift()?.();
  }
}

/** Deduplicate concurrent requests, retry temporary failures, and release images to their owners. */
export function portraitImage(url: string): Promise<HTMLImageElement> {
  const existing = pending.get(url);
  if (existing) return existing;
  const request = (async () => {
    for (let i = 0; ; i++) {
      try { return await attempt(url); }
      catch (error) {
        if (i >= 4) throw error;
        await new Promise((resolve) => setTimeout(resolve, 2000 * 2 ** i + Math.random() * 500));
      }
    }
  })();
  pending.set(url, request);
  const clear = () => { if (pending.get(url) === request) pending.delete(url); };
  void request.then(clear, clear);
  return request;
}

/** Like TextureLoader.load, but portraits recover from transient failures. */
export function portraitTexture(url: string): THREE.Texture {
  const texture = new THREE.Texture();
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  void portraitImage(url).then((image) => {
    texture.image = image;
    texture.needsUpdate = true;
  }).catch(() => {});
  return texture;
}
