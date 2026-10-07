import * as THREE from "three";
import { sharedAtlasTexture } from "../../data/atlas";

/**
 * Cards on the walls. Every zkSNARK of a floor is one instance of a single InstancedMesh whose
 * shader looks its portrait up in the collection atlas (one 3200 px JPEG, 32 px per item, item n
 * at slot n − 1, 100 per row), so even the 5,000-card floor is two draw calls: pictures, frames.
 */

let atlas: THREE.Texture | null = null;
/** The full atlas, loaded once and shared by every floor. */
export function atlasTexture() {
  if (atlas) return atlas;
  // one download, one GPU texture for the whole app
  atlas = sharedAtlasTexture();
  return atlas;
}
