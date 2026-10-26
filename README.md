# ZStreet

**The Zcash blockchain as a living city.** Live at **https://zstreet.cash**.

Every real transaction in the Zcash mempool is carried through a voxel megalopolis by one of the
10,000 zkSNARKs, and every mined block drives them into the chain. Around that street is a city you can fly
over or walk through in first person, with more than 30 buildings you can walk into, citizens you
can talk to, and things to do that are paid for with shielded ZEC.

Built for the Zecathon (Wildcard track) between 2026-10-03 and 2026-10-28.

## How the chain becomes a city

- **A transaction** enters the mempool → a truck brings it from the Proof Factory (shielded) or
  the depot (transparent) to the MEMPOOL shop → a zkSNARK picks up the parcel and queues at the
  bus stop. Large *public* amounts take a taxi (≥ 50 ZEC) or a limousine with bodyguards
  (≥ 500 ZEC); shielded ones ride the bus like everyone else.
- **A block** is mined → its vehicle, with the real height on its sign, picks up exactly the riders
  whose transactions are in it and drives into the chain: a taxi for two or three, a bus for a
  handful, a metro train for a full block. An empty block just drives past.
- **The city reacts**: LED screens flash on every block; an empty block blacks out the city; a
  big shielded transaction strikes the Proof Factory with lightning; the Block Stadium scores
  shielded against transparent, block by block.
- **Follow your own transaction**: paste a txid (or open `zstreet.cash/tx/<txid>`) and the camera
  follows its carrier from the shop to the bus; share a 10 s clip or a card.

Nothing is simulated: blocks, mempool, transactions, pools, market, supply and the zkSNARK
collection all come from the public ZScan API. A transaction's carrier is picked from its txid
(zkSNARKs live off-chain, so it is casting, not ownership).

## Shielded ZEC in the city

- **Messages on the ground, guestbook, sealed City Works votes, tips**: ZStreet gives a ZIP-321
  QR code to its own shielded address with `ZS1:<ref>` and your text in the memo. Pay from any
  wallet (Zodl, Vizor, or one click with the Noir browser extension). The server reads the memo
  with the address's viewing key and the whole city sees the result. It never learns who paid:
  no account, no login, no sender in a shielded note.
- **ZSA Lab**: mint your own Zcash Shielded Asset (ZIPs 226/227) on the public ZSA test network.
  The transaction is built, proved and signed in your browser (WebAssembly); the seed never
  leaves it, and ZStreet drips the testnet fees so you need nothing. Then send, trade on the
  player-to-player board, or burn it in the furnace.
- **View Key Bank**: paste a viewing key at a teller; your shielded history is decrypted in your
  browser and the key is never sent anywhere.

## Privacy rules

- ZStreet shows what the chain already makes public. For shielded transactions that is the fact
  that they happened, their size and their pool: never amounts, addresses or memos.
- Payments to ZStreet: only the memo the payer chose to write is shown.
- Viewing keys and ZSA seeds stay in the browser.
- Multiplayer presence carries positions and emojis only, kept in memory.

## The city

- **A megalopolis** on a grid of named streets: the avenue with the MEMPOOL shop, a bay with
  ferries and a Golden Gate, a metro line, Central Park, a port, landmarks from around the world
  rebuilt in voxels, day and night with the visitor's clock.
- **30+ walk-in places**, each with live data: the MEMPOOL HQ and its block archive (Bitfeed-style
  mosaic of any block), the Proof Factory's mining hall, the ZEC Reserve (value pools in vaults,
  a live zkSNARKs order book on the trading floor), the zkSNARK Museum (a Louvre with all 10,000,
  the Apparitions wing and the Memorial of the Purged), the ZK University (video courses, Zakura
  and Tachyon halls, HashSmash Hall), wallet towers for Zodl, Vizor and Noir fed live from their
  tweets and GitHub, the ZSA Lab, a cinema, a stadium, a prison of crypto's convicted founders, a
  cemetery whose crypt tracks the ZEC still leaving Sprout, a convention center, and more.
- **Citizens are AI agents**: every zkSNARK has a persona; walk up to anyone and press E to talk.
  A cast of 12 lives one turn per block. Each 576-block round, agents propose a building, visitors
  vote, and the winner is built block by block.
- **NU7**: a quarter whose tower and karting circuit rise with the countdown to the upgrade.
- **Daily events**: the Apparition parade at 12:00 and 20:00 New York time, with a crowd of phones.
- **Multiplayer**: see other visitors walk around.
- **Phones**: landscape, touch joystick, adaptive quality.

## Run it

    npm install
    npm run dev      # http://localhost:3007
    npm run build    # static site in dist/ (server.mjs serves it with per-transaction share tags)

`VITE_API_URL` sets the API (default `https://api.zscan.cash`). `?debug` exposes `window.street`.

## Code

| Path | |
|---|---|
| `src/scene/` | the city: layout (`city/plan.ts`), the voxel engine (`voxel/`: greedy mesher, buildings, landmarks, vehicles), the director that turns chain events into the street (`director.ts`), traffic, camera, crowds, render passes |
| `src/interior/` | the walk-in places (`types.ts` is the contract, `walk.ts` the first-person walker, `manager.ts` switches scenes) |
| `src/game/` | the chain-driven life of the city: block clock, AI agents and personas, City Works, parades, NU7 |
| `src/ui/` | the HUD, the pay desk (`paydesk.ts`), the ZSA Lab terminal, transaction tracking and clips |
| `src/data/` | API clients, the viewing-key scanner, ZSA and payment clients |
| `src/zsa/` | the ZSA wallet (WebAssembly engine in a Web Worker) |
| `university/` | ZK University courses and their Remotion video kit |
| `server/` | the server code: ZStreet's API routes and payment scanner, and the ZSA engine and Lab backend ([server/README.md](server/README.md)) |
| `shots/` | puppeteer scripts used to check scenes and to film |

## Credits

zkSNARKs artwork belongs to the zkSNARKs collection and its creators. Sounds are CC0. Wallet
names and logos belong to their projects. Code: MIT (see `LICENSE`), except `server/vendor/`,
which keeps its upstream licenses.
