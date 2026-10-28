# ZStreet server code

ZStreet is a static site (the rest of this repo) plus a few server pieces. They run on the ZScan
backend next to the ZScan explorer API. The full API source is available in
[zscan-api-source](https://github.com/adamzkdev/zscan-api-source). These modules were written for ZStreet during the Zecathon window and are copied here so
the whole project is open source in one place.

| Folder | What it is | Runs as |
|---|---|---|
| `zscan-api/` | ZStreet's routes (`/v1/street/*`), its background jobs and their tables | modules of the `zscan-api` and `zscan-indexer` binaries |
| `zsa-engine/` | OrchardZSA (ZIPs 226/227) wallet engine: WebAssembly for the browser, plus `zsa-svc`, the ZSA Lab's backend | `src/zsa/pkg` in the site; `zsa-svc` in Docker |
| `vendor/` | The two patched crates `zsa-engine` builds against (`orchard` at the ZSA testnet's revision, `pasta_curves`) | |

Everything ZStreet shows about the chain itself (blocks, mempool, transactions, pools, market,
the zkSNARK collection) comes from the public ZScan API (`https://api.zscan.cash`), which existed
before ZStreet and is not part of this submission.

## `zscan-api/`: the city's backend

The files are as they are in `zscan-api` (paths kept). They are axum handlers and Tokio tasks
that use that crate's shared state (`AppState`: Postgres pool, HTTP client, rate limiters), so they
are not a standalone crate.

| File | Created | Endpoints and jobs |
|---|---|---|
| `crates/api/src/presence.rs` | 2026-10-06 | `GET /v1/street/presence` WebSocket: other visitors' positions and emojis, in memory only (no text, no accounts) |
| `crates/api/src/street_chat.rs` | 2026-10-06 | `POST /v1/street/chat`: talk to any zkSNARK; replies in persona from the live chain data it is given |
| `crates/api/src/street.rs` | 2026-10-08 | block gossip, the ZStreet Daily, the mayor, per-visitor character memory, the events schedule |
| `crates/api/src/street_llm.rs` | 2026-10-08 | the shared model client (OpenRouter), daily budget |
| `crates/api/src/street_agents.rs` | 2026-10-08 | `GET /v1/street/people` personas for all 10,000 zkSNARKs, `GET /v1/street/agents` the day's cast of 12 who live one turn per block |
| `crates/api/src/street_plots.rs` | 2026-10-08 | Builders' Row voxel plots |
| `crates/api/src/street_works.rs` | 2026-10-09 | City Works: agents propose a building every 576 blocks, visitors vote, the winner is built block by block |
| `crates/api/src/street_pay.rs` | 2026-10-09 | **shielded payments** (below) |
| `crates/indexer/src/street_pay.rs` | 2026-10-09 | **shielded payments**: the viewing-key scanner of ZStreet's address |
| `crates/api/src/street_wallets.rs` | 2026-10-09 | the wallet towers' feeds (tweets, GitHub releases/commits/PRs, store pages) |
| `crates/api/src/street_pulse.rs` | 2026-10-12 | live heralds in the wallet towers (new commit, release, tweet) |
| `crates/api/src/hashsmash.rs` | 2026-10-12 | the ZK University's HashSmash Hall (live from yukon.org) |
| `crates/api/src/street_card.rs` | 2026-10-17 | `GET /v1/street/card/tx/{txid}.png` share cards |
| `crates/api/src/street_sprout.rs` | 2026-10-17 | the Sprout evacuation board in the cemetery crypt |
| `crates/db/migrations/0023…0027` | 2026-10-08…12 | their tables |

### Shielded payments (`street_pay.rs`)

ZStreet has one shielded (Orchard) address. A visitor who wants to leave a message on the ground
where they stand, sign the guestbook, cast a sealed City Works vote or tip asks for an *intent*
and gets a ZIP-321 URI: ZStreet's address, the amount, and `ZS1:<ref>` plus their text in the
memo. They pay from any Zcash wallet (scan the QR, copy address and memo, or one click with the
Noir browser wallet). The indexer scans the address with its full viewing key, a block or two
behind the tip, and stores each received note with its memo; the API then plays the payment for
everyone (the message appears, the vote counts, fireworks go up).

What is shown is only the memo as it arrived on chain. The payer is never known to ZStreet:
there is no sender in a shielded note, no account, no login. The address and its viewing key are
created once by `zscan-indexer street-keygen`, which prints a fresh 24-word seed for the operator
and writes nothing to disk.

## `zsa-engine/`: the ZSA Lab

ZSAs (Zcash Shielded Assets) are not on mainnet yet. The ZSA Lab runs on the public ZSA test
network (lightwalletd `zsa.methyl.cc`).

- The browser builds, proves and signs every issuance, transfer and burn in a Web Worker
  (`src/wasm.rs`, `src/wallet.rs`, compiled to `src/zsa/pkg` in the site). The visitor's seed is
  made in the browser and never leaves it.
- `zsa-svc` (`src/bin/zsa-svc.rs`, `src/bin/zsa_svc/`) proxies lightwalletd for those browser
  wallets, gives each new wallet a small drip of testnet ZEC from a sponsor wallet so visitors pay
  no fees, indexes every ZSA asset on the network, and keeps the player-to-player exchange board.
  See `zsa-engine/README_SVC.md` for its endpoints.

Build the WebAssembly engine (from `zsa-engine/`; needs LLVM clang and a `wasm-bindgen-cli`
matching the `wasm-bindgen` crate in `Cargo.lock`):

    cargo build --release --target wasm32-unknown-unknown
    wasm-bindgen --target web --out-dir ../../src/zsa/pkg target/wasm32-unknown-unknown/release/zapp_zsa_engine.wasm

Build and run `zsa-svc` (from this folder):

    docker build -f zsa-engine/Dockerfile -t zsa-svc .
    docker run -p 8095:8095 -v $PWD/zsa-data:/data zsa-svc   # without a seed file, drips are off
