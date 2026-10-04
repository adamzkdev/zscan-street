# ZStreet

The Zcash blockchain as a living voxel city (Three.js), at street.zscan.cash. Real zkSNARK NFTs pick
up real mempool transactions at the MEMPOOL shop, wait at the stop and board the block bus when the
block that includes their transaction is mined. You can walk into the shops.

    npm install
    npm run dev      # http://localhost:3007   (?debug exposes window.street for tests)
    npm run build    # static site in dist/

Data comes only from zscan-api (`VITE_API_URL`, default https://api.zscan.cash): mempool, blocks,
transactions, market, supply, pools, network, miners, the zkSNARK collection and its atlas, and the
compact blocks the viewing-key scanner decrypts in the browser. Nothing is simulated. The carrier of
a transaction is picked from its txid (zkSNARKs live off-chain, so it's casting, not ownership).

## The street

- One avenue, Downtown in the middle, the Orchard park west, Ironwood's Proof Factory and depot east,
  the Transparent square south. The avenue runs off the board into a tunnel at each end: buses come
  "from the miners" in the west and carry blocks "into the chain" in the east.
- A new mempool transaction sends a truck from the Proof Factory (shielded) or the depot
  (transparent) to the MEMPOOL shop; a zkSNARK picks the parcel up and queues at the bus stop, or
  takes a taxi (≥ 50 ZEC public) or a limousine (≥ 500 ZEC, with two of the rarest zkSNARKs as
  bodyguards). Each block is one bus.
- LED screens on the towers show the live ZEC price, market cap and supply.
- Day and night themes (night: rain and neon), sound, a camera rail on the right, and one thin data
  strip at the bottom (last block, mempool, market, supply, network) that unfolds on click.

## Walk-in places

Hover a building to light it up, click to go in. Inside: ZQSD / WASD to walk, drag to look, scroll to
step, the lift for floors, Esc to leave. Click things for details and links to ZScan.

| Place | Inside |
|---|---|
| MEMPOOL | The shop: one aisle per kind of block, the live pickup wall of pending transactions. 1F: the archive of the last 2,000 blocks. |
| zkCARDS | A museum of the whole collection: a lobby with the ten Legendaries, then one floor per rank band (10,000 cards). |
| VIEW KEY BANK | The banking hall: paste a viewing key at a terminal; it is decrypted in this browser and never sent. -1: the vaults of the value pools. |
| Proof Factory | The mining hall: rows per mining pool, a press that stamps every new block, the big wall screen. 1F: the control room. |
| ZSA EXCHANGE | A building site: Zcash Shielded Assets (ZIPs 226, 227, 228) are coming, the zkSNARKs are fitting out the shop. |

## Code

- `src/scene/city`: layout (`plan.ts`), voxel generation in workers (`worker.ts`), assembly
  (`index.ts`), the tunnels (`tunnel.ts`)
- `src/scene/voxel`: the voxel engine (greedy mesher with AO), buildings, props, vehicles
- `src/scene`: `director.ts` (the chain's events), `traffic.ts`, `camera.ts`, `decor.ts` (screens,
  neon, rain), `theme.ts` (day / night), `shelf.ts`, `mining.ts`
- `src/interior`: the walk-in places (`types.ts` is the contract, `walk.ts` the first-person walker,
  `manager.ts` switches scenes)
- `src/ui`: the HUD (`hud.ts`) and the shop panels (`venues.ts`)
- `src/data`: the API client (rate-limited), market data, the viewing-key scanner (`viewkey.ts`, wasm
  in `public/wasm`)
- `shots/*.mjs`: puppeteer scripts used to check the scene (`?debug&interior=<place>`)
