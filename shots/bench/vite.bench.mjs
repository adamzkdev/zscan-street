// The bench's own dev server (port 3014): no hot reload, so another agent's edit to a shared file
// cannot reload a page in the middle of a run (the page still gets the latest code on each load).
import { defineConfig } from "vite";

export default defineConfig({ cacheDir: "node_modules/.vite-bench", server: { port: 3014, strictPort: true, hmr: false } });
