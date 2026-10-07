import * as THREE from "three";
import { API } from "./zscan";

/**
 * The zkSNARK collection atlas (one 3200 px JPEG, 32 px per item, 100 per row), fetched ONCE for
 * the whole app: the street crowds cut their portraits out of it, the walk-in places sample it as
 * one shared GPU texture. Before, every module downloaded and decoded its own copy (4 MB each,
 * 55 MB of GPU memory per texture). A failed download is retried with a growing delay, so a
 * moment of API trouble no longer leaves black faces for the whole visit.
 */
const URL_ATLAS = `${API}/v1/collections/zksnarks/map/image`;

let blob: Promise<Blob> | null = null;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The atlas file, shared; retried up to 6 times (2 s, 4 s, 8 s ... ). */
export function atlasBlob(): Promise<Blob> {
  blob ??= (async () => {
    let lastErr: unknown = null;
    for (let k = 0; k < 6; k++) {
      try {
        const res = await fetch(URL_ATLAS);
        if (res.ok) return await res.blob();
        lastErr = new Error(`atlas HTTP ${res.status}`);
      } catch (e) {
        lastErr = e;
      }
      await wait(2000 * 2 ** k);
    }
    throw lastErr;
  })();
  // a total failure lets the next caller try again from scratch
  blob.catch(() => (blob = null));
  return blob;
}

/** A decoded copy for cutting portraits out of; close() it when done (41 MB each). */
export async function atlasBitmap(): Promise<ImageBitmap> {
  return createImageBitmap(await atlasBlob());
}

let tex: THREE.Texture | null = null;
/** The atlas as one GPU texture shared by every place (sRGB, crisp pixels, mipmapped). */
export function sharedAtlasTexture(): THREE.Texture {
  if (tex) return tex;
  const t = (tex = new THREE.Texture());
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.anisotropy = 8;
  const load = (attempt: number): void => {
    void atlasBlob()
      .then((b) => {
        const url = URL.createObjectURL(b);
        const img = new Image();
        img.onload = () => {
          URL.revokeObjectURL(url);
          t.image = img;
          t.needsUpdate = true;
        };
        img.onerror = () => URL.revokeObjectURL(url);
        img.src = url;
      })
      .catch(() => attempt < 4 && setTimeout(() => load(attempt + 1), 60_000));
  };
  load(0);
  return t;
}
