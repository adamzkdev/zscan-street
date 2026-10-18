import type { LabWallet, LabWalletStore } from "./zsalab";
import { ZSA_API } from "../data/zsa";
import { ZsaWallet } from "../zsa/zsaWallet";

/** The lab panel's view of the in-browser ZSA wallet (src/zsa/: wasm in a worker). */
function adapt(w: ZsaWallet): LabWallet {
  return {
    address: () => w.address(),
    sync: (p) => w.sync(p),
    balances: () => {
      const b = w.balances();
      return {
        zec_zat: b.zec_zat,
        pending_zat: b.zec_pending_zat,
        // What we hold once our pending transactions are mined (a fresh mint shows at once).
        assets: b.assets
          .map((a) => ({ asset_id: a.asset_id, name: a.name, units: a.units + a.pending }))
          .filter((a) => a.units > 0),
      };
    },
    issue: async (name, amount, finalize, stage) => {
      const r = await w.issue(name, amount, finalize, stage);
      return { txid: r.txid, asset_id: r.asset_id };
    },
    transfer: async (asset_id, amount, to, stage) => ({ txid: (await w.transfer(asset_id, amount, to, stage)).txid }),
    burn: async (asset_id, amount, stage) => ({ txid: (await w.burn(asset_id, amount, stage)).txid }),
    finalize: async (asset_id, stage) => ({ txid: (await w.finalize(asset_id, stage)).txid }),
    exportSeed: () => w.exportSeed(),
    trackIncoming: (txid, zat) => w.trackIncoming(txid, zat),
  };
}

/** The in-browser ZSA wallet behind the lab's panel. */
export const store: LabWalletStore = {
  load: async () => {
    const w = await ZsaWallet.load(ZSA_API);
    return w && adapt(w);
  },
  create: async () => adapt(await ZsaWallet.create(ZSA_API)),
  restore: async (seed) => adapt(await ZsaWallet.restore(ZSA_API, seed)),
};
