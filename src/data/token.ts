/**
 * This browser's secret (32 hex), for what the API keeps per visitor without an account: the
 * characters' memory, the plot you built. The API only stores its hash; clearing the browser's
 * data loses it.
 */
export function visitorToken() {
  try {
    let t = localStorage.getItem("street.token");
    if (!t) {
      const a = new Uint8Array(16);
      crypto.getRandomValues(a);
      t = [...a].map((b) => b.toString(16).padStart(2, "0")).join("");
      localStorage.setItem("street.token", t);
    }
    return t;
  } catch {
    return null;
  }
}
