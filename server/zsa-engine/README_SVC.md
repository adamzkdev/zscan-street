# zsa-svc

Backend for ZStreet's ZSA Lab on the methyl ZSA testnet (lightwalletd `https://zsa.methyl.cc:443`).
It proxies lightwalletd for browser wallets, drips shielded ZEC from a sponsor wallet to new
burner wallets, and indexes every ZSA asset on the chain.

## Run locally

```sh
cd zapp-chrome/zsa-engine
cargo build --release --features svc --bin zsa-svc
ZSA_DATA_DIR=zsa-data ./target/release/zsa-svc          # listens on 127.0.0.1:8095
```

By default the sponsor seed is read from `.secrets/seed.hex`. Without a seed the service still
runs, with drips disabled. Helper commands:

- `zsa-svc addr <seedfile>` prints the uregtest1 address of a seed.
- `zsa-svc scan <seedfile> <from> [to]` lists the notes a seed received.

## Endpoints (prefix /v1/zsa)

| Method | Path | Returns |
|---|---|---|
| GET | `/health` | `{ ok, tip, indexed, uptime_s }` |
| GET | `/v1/zsa/info` | `{ network, tip, indexed, sponsor:{address, balance_zat, spendable_zat, pending_zat, synced}, drip_zat, drips_today, drips_per_day, assets, events }` |
| GET | `/v1/zsa/blocks?from=H&to=H` | octet-stream: CompactBlock protobufs, each prefixed by a u32 big-endian length, in height order. At most 1000 blocks; `to` is clamped to the tip (headers `x-zsa-tip`, `x-zsa-to`) |
| GET | `/v1/zsa/treestate/{h}` | `{ network, height, hash, time, saplingTree, orchardTree }` |
| GET | `/v1/zsa/tx/{txid}` | `{ hex, height }` (height is null while in the mempool) |
| POST | `/v1/zsa/broadcast` `{ hex, asset_desc? }` | `{ txid }`, or 400 `{ error }` with the node's error text |
| POST | `/v1/zsa/drip` `{ address }` | `{ txid, amount_zat }`; 429 when a limit is hit, 503 when the sponsor is empty or busy |
| POST | `/v1/zsa/name` `{ asset_desc }` | `{ desc_hash, assets }` |
| GET | `/v1/zsa/assets` | `[{ asset_id, name, desc_hash, issuer, issued, issued_str, finalized, burned, first_height, last_height, txs, txids }]`, newest first |
| GET | `/v1/zsa/events?since=H&limit=N` | `[{ height, time, txid, kind, asset_id, name, amount }]`, newest first. `kind` is issue, finalize, burn or transfer |

### Exchange board (player-to-player, two-step, not atomic)

methyl has no ZIP 228 swaps, because a v6 transaction carries at most one action group. A trade
is therefore two separate shielded payments. First the taker pays the maker; then the maker pays
the taker. The server only keeps the board. It cannot verify shielded payments, so the maker's
wallet has to check that the taker's payment arrived.

The board is stored in `offers.json`. Open offers expire 24 h after creation. Taken offers do not
expire. Closed offers are kept for 7 days. Each IP can create 10 offers per day.

| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/v1/zsa/offers` | `{ give_asset, give_amount, want_asset, want_amount, maker_address, note? }` | `{ id, secret }` |
| GET | `/v1/zsa/offers` | | `{ offers: [Offer] }`: open offers plus others updated in the last 24 h, newest first, at most 100 |
| GET | `/v1/zsa/offers/{id}` | | `Offer` |
| POST | `/v1/zsa/offers/{id}/take` | `{ taker_address, txid }` | `Offer` (status `taken`); only from `open` |
| POST | `/v1/zsa/offers/{id}/complete` | `{ secret, txid }` | `Offer` (status `done`); only from `taken` |
| POST | `/v1/zsa/offers/{id}/cancel` | `{ secret }` | `Offer` (status `cancelled`); only from `open` |

Request rules:

- An asset is `"zec"` or a 64-hex asset id, and the two assets must differ.
- Amounts are u64 and must be greater than 0.
- Addresses must be uregtest1 addresses with an Orchard receiver. The taker cannot use the
  maker's address.
- A txid is 64 hex characters.
- `note` is optional, at most 140 characters.
- `secret` is a 64-hex token returned only to the maker. The server stores only its hash.

The `Offer` object:

```json
{ "id": "16 hex", "give_asset": "zec|64hex", "give_name": "tZEC|name|null", "give_amount": 5,
  "want_asset": "zec|64hex", "want_name": "...", "want_amount": 10000,
  "maker_address": "uregtest1…", "note": "text|null",
  "status": "open|taken|done|cancelled|expired",
  "taker_address": "uregtest1…|null", "taker_txid": "hex|null", "maker_txid": "hex|null",
  "created_at": 1792202867, "updated_at": 1792202867 }
```

Errors come back as `{ "error": "..." }`:

| Code | Meaning |
|---|---|
| 400 | validation failed |
| 403 | wrong secret |
| 404 | unknown id |
| 409 | the offer is in the wrong status for this action |
| 429 | IP limit reached |
| 503 | the board is full (2000 open offers) |

Notes:

- **Names.** ZIP 227 puts only the hash of the asset description on chain, so names are learned
  from whoever submits the description: `asset_desc` on broadcast, or `/name`. The service checks
  the hash before storing a name, so a name cannot be forged. Until someone submits it, `name` is
  null.
- **`issuer`** is the encoded issuer key as on chain: 33 bytes, a 0x00 algorithm byte followed by
  the 32-byte ik.
- **Transfers.** A transfer is any OrchardZSA transaction with no issuance and no burn. Assets are
  private, so faucet ZEC sends show up as transfers too.
- **Drip limits.** One drip per Orchard receiver ever, 3 per IP per day (taken from the last
  `X-Forwarded-For` hop) and 200 per day in total. Drips are queued and sent one transaction at a
  time. When few notes remain, the change is split into 3 notes so queued drips do not wait a
  block each.
- **CORS** is open: `*`, GET and POST.

## Env

| Var | Default | |
|---|---|---|
| `ZSA_ADDR` | `127.0.0.1:8095` | bind address (`0.0.0.0:8095` in Docker) |
| `ZSA_LWD` | `https://zsa.methyl.cc:443` | lightwalletd |
| `ZSA_DATA_DIR` | `./zsa-data` | state directory |
| `ZSA_SEED_FILE` | `.secrets/seed.hex` (local), `/run/secrets/zsa-sponsor.seed` (Docker) | sponsor seed in hex |
| `ZSA_DRIP_ZAT` | `60000` | drip amount (0.0006 ZEC) |
| `ZSA_WATCH_FROM` | `1` | index start height (the whole chain takes about 40 s to scan) |
| `ZSA_SPONSOR_BIRTHDAY` | tip − 2000 on first run | sponsor scan start |
| `ZSA_DRIPS_PER_IP` / `ZSA_DRIPS_PER_DAY` | `3` / `200` | drip limits |
| `ZSA_FEE_MULT` | `1` | × ZIP 317 conventional fee |
| `ZSA_CACHE_MB` | `24` | in-memory compact block cache |

Data dir layout: `index.json` (assets, events, names), `offers.json` (exchange board), `sponsor.json` (tree frontier, notes,
witnesses, pending spends) and `drips.json` (rate limits). Deleting `index.json` triggers a
rescan. Deleting `sponsor.json` triggers a resync from the birthday.

## Deploy with Docker

Put the seed on the server, never in `.env` and never in git:

```sh
install -m 600 /dev/null ~/secrets/zsa-sponsor.seed   # then paste the hex seed into it
```

Build the image from the `zapp-chrome/` root, because Cargo.toml patches pasta_curves from
`../vendor`:

```sh
docker build -f zsa-engine/Dockerfile -t zsa-svc .
```

Compose service:

```yaml
  zsa-svc:
    image: zsa-svc
    restart: unless-stopped
    environment:
      ZSA_DRIP_ZAT: "60000"
    volumes:
      - zsa-data:/data
      - /root/secrets/zsa-sponsor.seed:/run/secrets/zsa-sponsor.seed:ro
    mem_limit: 300m
    # no published port: Caddy reaches it on the compose network as zsa-svc:8095

volumes:
  zsa-data:
```

Adjust `/root` to the home directory of the user that holds `~/secrets`. Inside the container the
service runs as uid 10001, so the seed file must be readable by that uid (for example
`chown 10001 ~/secrets/zsa-sponsor.seed`, or mode 644 inside a 700 directory).

Caddy, inside the `api.zscan.cash { ... }` block:

```
handle /v1/zsa/* {
    reverse_proxy zsa-svc:8095
}
```

## Resources

- Memory: about 15–30 MB RSS while idle (after indexing the whole chain). During a drip (Halo 2
  proving) it peaks at about 200 MB. `MALLOC_ARENA_MAX=2` is set in the image so glibc returns
  that memory afterwards.
- Drip time: about 2 s to build and prove. That includes rebuilding the proving key, which the
  fork's builder does on every transaction.
