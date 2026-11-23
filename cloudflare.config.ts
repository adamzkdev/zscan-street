import { bindings, defineConfig, defineWorker, exports } from "cf/config";

export default defineConfig({
  accountId: "b4461addee108efc79385b2d447b25a5",
  worker: defineWorker({
    name: "zscan-street",
    entrypoint: "./worker/index.ts",
    compatibilityDate: "2026-11-12",
    workersDev: true,
    previewUrls: false,
    observability: { enabled: true, redactQueryString: true, logs: { invocationLogs: false }, traces: { enabled: false } },
    // The city is static: Cloudflare serves its files without running the Worker (those requests
    // are free and don't count against the Workers quota). The Worker only answers what needs
    // code: a transaction's share card, the films from R2 and ZK PARTY's online rooms.
    assets: {
      htmlHandling: "auto-trailing-slash",
      notFoundHandling: "single-page-application",
      runWorkerFirst: ["/tx/*", "/snark/*", "/zilk/*", "/video.mp4", "/10-years.mp4", "/rooms", "/rooms/*", "/rooms-health", "/world/*"],
    },
    env: {
      ASSETS: bindings.assets(),
      MEDIA: bindings.r2({ name: "zstreet-media" }),
      // ZK PARTY's online rooms (server/rooms/worker.ts), exported by this worker
      ROOMS: bindings.durableObject({ worker: "zscan-street", exportName: "Room" }),
      // the game's shared city (worker/world.ts)
      WORLD: bindings.durableObject({ worker: "zscan-street", exportName: "World" }),
    },
    exports: { Room: exports.durableObject({ storage: "sqlite" }), World: exports.durableObject({ storage: "sqlite" }) },
  }),
});
