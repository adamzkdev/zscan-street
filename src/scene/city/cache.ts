/**
 * The city's meshed buildings kept in IndexedDB between visits: generating the megalopolis takes
 * seconds, loading it back a fraction of that. Keyed by the build (the worker bundle's hashed URL)
 * so a new release starts afresh; off in development, where the code changes all the time.
 */

const DB = "zstreet-city";
const STORE = "variants";

function open(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export class CityCache {
  private db: Promise<IDBDatabase | null>;
  constructor(build: string | null) {
    this.db = build ? open() : Promise.resolve(null);
    // a new build: drop what the old one left
    if (build)
      void this.db.then((db) => {
        if (!db) return;
        try {
          const prev = localStorage.getItem("zstreet.cityBuild");
          if (prev !== build) {
            db.transaction(STORE, "readwrite").objectStore(STORE).clear();
            localStorage.setItem("zstreet.cityBuild", build);
          }
        } catch {
          /* private mode: no cache */
        }
      });
  }

  async getAll(keys: string[]): Promise<Map<string, unknown>> {
    const out = new Map<string, unknown>();
    const db = await this.db;
    if (!db) return out;
    await new Promise<void>((resolve) => {
      try {
        const st = db.transaction(STORE, "readonly").objectStore(STORE);
        let left = keys.length;
        if (!left) return resolve();
        for (const k of keys) {
          const req = st.get(k);
          req.onsuccess = () => {
            if (req.result !== undefined) out.set(k, req.result);
            if (--left === 0) resolve();
          };
          req.onerror = () => --left === 0 && resolve();
        }
      } catch {
        resolve();
      }
    });
    return out;
  }

  async put(entries: [string, unknown][]) {
    const db = await this.db;
    if (!db || !entries.length) return;
    try {
      const st = db.transaction(STORE, "readwrite").objectStore(STORE);
      for (const [k, v] of entries) st.put(v, k);
    } catch {
      /* quota: fine, it just regenerates next time */
    }
  }
}
