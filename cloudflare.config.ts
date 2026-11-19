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
    assets: { htmlHandling: "none", notFoundHandling: "none", runWorkerFirst: true },
    env: {
      ASSETS: bindings.assets(),
      MEDIA: bindings.r2({ name: "zstreet-media" }),
      // ZK PARTY's online rooms (server/rooms/worker.ts), exported by this worker
      ROOMS: bindings.durableObject({ worker: "zscan-street", exportName: "Room" }),
    },
    exports: { Room: exports.durableObject({ storage: "sqlite" }) },
  }),
});
