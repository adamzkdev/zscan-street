import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { cloudflare } from "@cloudflare/vite-plugin";

// The pages built: the city, and the games' own pages a phone or tablet plays them on
// (src/game/solo.ts): ZK PARTY's hall (party.html) and the GAME HOUSE's tables (table.html).
// The benches (partylab.html, tablelab.html) are served by the dev server only.
const page = (f: string) => fileURLToPath(new URL(f, import.meta.url));
const input = { main: page("./index.html"), party: page("./party.html"), table: page("./table.html") };

// (the client environment only: the worker has its own entry)
export default defineConfig({ plugins: [cloudflare()], environments: { client: { build: { rolldownOptions: { input } } } } });
