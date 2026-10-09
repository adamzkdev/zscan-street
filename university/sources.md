# ZK University — verified source material

Collected 2026-10-09 by fetching every URL below with curl (no auth). Quotes are copied from the page text, with whitespace normalized. Anything not confirmed is listed under "Gaps".

## Notes

- **Zakura** has a working Atom feed (`https://zakura.com/announcements/atom.xml`, Zola, 13 entries, full HTML content). Every page also has a Markdown twin at `<page>/index.html.md`, e.g. `https://zakura.com/announcements/index.html.md`, which is useful for LLM ingestion. The Engineering section has **no** feed (`/engineering/atom.xml` returns 404).
- **Tachyon** (`tachyon.z.cash/blog`) and **seanbowe.com/blog** have **no** RSS or Atom feed: `/atom.xml`, `/rss.xml` and `/blog/atom.xml` all return 404. To track them, scrape the blog index HTML or use GitHub `releases.atom`/commits.
- **GitHub REST API** works unauthenticated (60 requests/hour per IP; I used 47 during this research). `GET /repos/<org>/<repo>/releases` returns 200 for all the repos listed here. Only `zakura-core/zakura` has actual Releases; the other repos return `[]` but have tags (`/tags`). `https://github.com/<org>/<repo>/releases.atom` returns 200 `application/atom+xml` for all of them.
- Other feeds that returned 200 server-side: `https://zfnd.org/feed/` (RSS, current), `https://zkproof.org/feed/` (RSS), `https://forum.zcashcommunity.com/latest.rss` (RSS). `https://z.cash/feed/` returns RSS but looks **stale**: its newest item is "Zcashd 5.6.0 released…". `https://electriccoin.co/feed/` returns HTML, not a feed. The ECC blog now redirects to **zodl.com**.
- Small inconsistency: the Zakura NU7 dashboard reports node build `v1.6.1+gf6f458641c03`, but the latest GitHub Release and announcement are **v1.6.0** (2026-10-01). There is no v1.6.1 release or tag on GitHub yet.

## Gaps / unconfirmed

- No published Zakura or Tachyon API (REST/JSON) for blog content other than the Zakura Atom feed and the `.md` twins.
- I did not open every Zakura engineering article or every Tachyon post. Only their titles and summaries from the index pages are recorded; dates for the Zakura engineering posts are not shown on the index.
- Ragu has no GitHub Release, only `*-0.0.0` crate tags. I did not verify whether it's on crates.io.
- `seanbowe.com/blog` lists a "Disabling Sprout the Right Way" post (2026-09-04). I did not read it.
- zkproof.org gives event and standards info but no beginner-level explainer quote on zkSNARKs.

```json
{
  "zakura": {
    "site": "https://zakura.com/",
    "blog": [
      {"section": "announcements", "index": "https://zakura.com/announcements/", "posts": [
        {"date": "2026-10-01", "title": "Release: Zakura 1.6.0", "url": "https://zakura.com/announcements/zakura-1-6-0/"},
        {"date": "2026-09-24", "title": "Release: Zakura 1.5.0", "url": "https://zakura.com/announcements/zakura-1-5-0/"},
        {"date": "2026-09-10", "title": "Release: Zakura 1.4.0", "url": "https://zakura.com/announcements/zakura-1-4-0/"},
        {"date": "2026-08-31", "title": "Release: Zakura 1.3.0", "url": "https://zakura.com/announcements/zakura-1-3-0/"},
        {"date": "2026-08-29", "title": "Zakura Common: High Performance Zcash Cryptography", "url": "https://zakura.com/announcements/zakura-common/"},
        {"date": "2026-08-14", "title": "Release: Zakura 1.2.0, 87% faster full block processing", "url": "https://zakura.com/announcements/zakura-1-2-0-orphan-rate/"},
        {"date": "2026-08-10", "title": "Release: Zakura 1.1.1", "url": "https://zakura.com/announcements/zakura-1-1-1/"},
        {"date": "2026-07-28", "title": "Release: Zakura 1.0.5", "url": "https://zakura.com/announcements/zakura-1-0-5/"},
        {"date": "2026-07-26", "title": "Release: Zakura 1.0.4", "url": "https://zakura.com/announcements/zakura-1-0-4/"},
        {"date": "2026-07-22", "title": "Release: Zakura 1.0.3", "url": "https://zakura.com/announcements/zakura-1-0-3/"},
        {"date": "2026-07-20", "title": "Release: Zakura 1.0.2", "url": "https://zakura.com/announcements/zakura-1-0-2/"},
        {"date": "2026-07-17", "title": "Release: Zakura 1.0.1", "url": "https://zakura.com/announcements/zakura-1-0-1/"},
        {"date": "2026-07-15", "title": "Introducing Zakura", "url": "https://zakura.com/announcements/introducing-zakura/"}
      ]},
      {"section": "engineering (undated on index)", "index": "https://zakura.com/engineering/", "posts": [
        {"title": "A Privacy Layer for Transparent Wallets", "status": "Design", "url": "https://zakura.com/engineering/transparent-pir-rotating-addresses/"},
        {"title": "Adversarial Audit of Ironwood's Formal Verification", "status": "Audited", "url": "https://zakura.com/engineering/adversarial-audit-formal-verification/"},
        {"title": "Formally Verifying Zero Knowledge for Zakura", "status": "In development", "url": "https://zakura.com/engineering/ironwood-zero-knowledge/"},
        {"title": "Testing 25-Second Blocks for NU7", "status": "Measured", "url": "https://zakura.com/engineering/25-second-block-time-update/"},
        {"title": "Why We Doubled the Lattice Dimension for Zcash Voting", "status": "Deployed", "url": "https://zakura.com/engineering/pir-security-parameters/"},
        {"title": "Prepared Multiscalar Zero-Checks", "status": "In development", "url": "https://zakura.com/engineering/prepared-multiscalar-zero-checks/"},
        {"title": "Fastest ecFFT in the West", "status": "In development", "url": "https://zakura.com/engineering/pasta-ecfft/"},
        {"title": "Avoiding Montgomery Reductions", "status": "Landed", "url": "https://zakura.com/engineering/deferred-montgomery-products/"},
        {"title": "Data Dependencies in Field Multiplication", "status": "Landed", "url": "https://zakura.com/engineering/multiplication-dependencies/"},
        {"title": "Porting libsecp256k1's Modular Inversion to Pasta", "status": "Landed", "url": "https://zakura.com/engineering/safegcd-modular-inversion/"},
        {"title": "Position-Weighted Sinsemilla", "status": "Landed", "url": "https://zakura.com/engineering/position-weighted-sinsemilla/"},
        {"title": "Batch Affine Ladders with Eisenstein Recoding", "status": "In development", "url": "https://zakura.com/engineering/key-agreement/"}
      ]},
      {"section": "other pages", "posts": [
        {"title": "NU7 Dashboard", "url": "https://zakura.com/nu7/"},
        {"title": "About / team", "url": "https://zakura.com/about/"},
        {"title": "Download", "url": "https://zakura.com/download/"},
        {"title": "Snapshots", "url": "https://zakura.com/snapshots/"},
        {"title": "zcashd compatibility", "url": "https://zakura.com/zcashd/"}
      ]}
    ],
    "feeds": [
      {"url": "https://zakura.com/announcements/atom.xml", "type": "Atom", "works_without_auth": true, "notes": "200 application/xml, 13 entries, full content"},
      {"url": "https://zakura.com/announcements/index.html.md", "type": "Markdown index", "works_without_auth": true, "notes": "LLM-friendly list of posts with summaries"},
      {"url": "https://github.com/zakura-core/zakura/releases.atom", "type": "Atom", "works_without_auth": true},
      {"url": "https://api.github.com/repos/zakura-core/zakura/releases", "type": "GitHub REST", "works_without_auth": true, "notes": "60 req/h unauthenticated"},
      {"url": "https://zakura.com/engineering/atom.xml", "type": "Atom", "works_without_auth": false, "notes": "404, does not exist"}
    ],
    "github": [
      {"repo": "zakura-core/zakura", "description": "Zcash full node, built for scale.", "language": "Rust", "stars": 90, "latest_release": {"tag": "v1.6.0", "published": "2026-10-01T01:40:12Z"}, "recent_releases": ["v1.6.0 (2026-10-01)", "v1.5.1 (2026-09-29)", "v1.5.0 (2026-09-24)"], "releases_api": "https://api.github.com/repos/zakura-core/zakura/releases"},
      {"repo": "zakura-core/common", "description": "Zakura Common Libraries", "language": "Rust", "stars": 11, "latest_release": null, "tags": ["v2.2.0", "v2.1.0", "v2.0.0", "v1.2.0", "v1.1.0"]},
      {"repo": "zakura-core/wallet-libraries", "description": "Wallet-layer librustzcash crates forked onto the Zakura crypto stack", "language": "Rust", "stars": 4, "latest_release": null},
      {"repo": "zakura-core/librustzcash", "description": "Rust-language assets for Zcash", "fork": true},
      {"repo": "zakura-core/ironwood-formal-verification", "description": "Formal Verification of the Zcash Protocol and Documentation for the Ironwood Pool", "language": "Lean", "fork": true},
      {"repo": "zakura-core/iroh", "description": "IP addresses break, dial keys instead. A library that adds QUIC + NAT Traversal to your apps.", "fork": true},
      {"repo": "zakura-core/iroh-quinn", "description": "noq, a QUIC implementation in Rust", "fork": true},
      {"repo": "zakura-core/zakura-vct-sprout-history", "description": null, "archived": true}
    ],
    "facts": [
      {"fact": "Zakura is a Zcash full node: a program that checks and stores the Zcash blockchain.", "url": "https://zakura.com/", "quote": "Zakura is a full node implementation for Zcash , with major improvements over existing nodes"},
      {"fact": "It started as a fork of Zebra (the Zcash Foundation's node) and follows the same consensus rules.", "url": "https://zakura.com/announcements/introducing-zakura/", "quote": "Forked from Zebra , Zakura is a consensus-compatible Zcash full node."},
      {"fact": "Version 1.0.0 was released on 15 July 2026, and it's free and open-source.", "url": "https://zakura.com/announcements/introducing-zakura/", "quote": "It is free and open-source software. Today, we're releasing 1.0.0 ."},
      {"fact": "It is led by Sean Bowe (Zcash cofounder) and Dev Ojha, as a collaboration between Valar Group and Project Tachyon.", "url": "https://zakura.com/about/", "quote": "as a collaboration between Valar Group and Project Tachyon ."},
      {"fact": "Syncing the chain is almost 5x faster than Zebra. In the team's test it took 4h 20m against 20h 46m.", "url": "https://zakura.com/announcements/introducing-zakura/", "quote": "Zakura block sync finishes in 4h 20m versus Zebra's 20h 46m in this run"},
      {"fact": "Pruned nodes use much less disk space and can start from a published snapshot in about 2 minutes.", "url": "https://zakura.com/", "quote": "Operate a full node with substantially less disk space, and bootstrap it in 2 minutes from the snapshots our team publishes."},
      {"fact": "A zcashd compatibility mode keeps older wallets and integrations working.", "url": "https://zakura.com/announcements/introducing-zakura/", "quote": "A compatibility mode reproduces the legacy zcashd RPC interface, so existing wallets and integrations keep working."},
      {"fact": "The goal is Visa or Mastercard scale: 50,000+ transactions per second as the minimum.", "url": "https://zakura.com/announcements/introducing-zakura/", "quote": "Mastercard and Visa handle more than 50k transactions per second; that's our floor ."},
      {"fact": "Zakura Common, its faster cryptography library, makes proofs on phones over 14x faster.", "url": "https://zakura.com/announcements/zakura-common/", "quote": "Mobile proof generation is more than 14x faster."},
      {"fact": "Zakura 1.6.0 ships NU7 (25-second blocks) and activates it on Testnet. Mainnet activation is not scheduled yet.", "url": "https://zakura.com/announcements/zakura-1-6-0/", "quote": "This release activates NU7 on Testnet at height 4,465,026 ... Mainnet activation is not yet scheduled."},
      {"fact": "A test network of 80 nodes running 25-second blocks saw only 3.43% orphaned blocks.", "url": "https://zakura.com/engineering/25-second-block-time-update/", "quote": "measured a 3.43% orphan rate while mining full 2MB blocks every 25 seconds."},
      {"fact": "Project Tachyon and Valar Group are funded by private ZEC donations.", "url": "https://zakura.com/announcements/introducing-zakura/", "quote": "Both Project Tachyon and Valar Group are funded by private ZEC donations."}
    ]
  },
  "tachyon": {
    "site": "https://tachyon.z.cash/",
    "blog": [
      {"source": "tachyon.z.cash/blog", "index": "https://tachyon.z.cash/blog/", "posts": [
        {"date": "2026-09-29", "title": "Building Tachyon's Proof Tree with Shared Evidence", "url": "https://tachyon.z.cash/blog/building-tachyons-proof-tree-with-shared-evidence/"},
        {"date": "2026-09-28", "title": "Integrating Tachyon's Cryptography with Zakura Common", "url": "https://tachyon.z.cash/blog/integrating-tachyon-with-zakura-common/"},
        {"date": "2026-07-28", "title": "Formal Verification of Zcash Ironwood Completed", "url": "https://tachyon.z.cash/blog/ironwood-verification-complete/"},
        {"date": "2026-07-07", "title": "Detecting Counterfeiting after Zcash's Ironwood", "url": "https://tachyon.z.cash/blog/detecting-counterfeiting-in-zcash/"},
        {"date": "2026-06-06", "title": "Ironwood: Auditing the Orchard Pool's Supply", "url": "https://tachyon.z.cash/blog/auditing-orchard-supply/"},
        {"date": "2026-05-07", "title": "Folding Tachyon with Ragu: High Assurance Cryptography for Zcash", "url": "https://tachyon.z.cash/blog/folding-tachyon-with-ragu/"}
      ]},
      {"source": "seanbowe.com/blog", "index": "https://seanbowe.com/blog/", "posts": [
        {"date": "2026-09-04", "title": "Disabling Sprout the Right Way", "url": "https://seanbowe.com/blog/disabling-sprout-the-right-way/"},
        {"date": "2025-10-16", "title": "Zcash and Quantum Computers", "url": "https://seanbowe.com/blog/zcash-and-quantum-computers/"},
        {"date": "2025-05-15", "title": "Tachyaction at a Distance", "url": "https://seanbowe.com/blog/tachyaction-at-a-distance/"},
        {"date": "2025-04-17", "title": "Ragu for Orchard: Recursion Al Dente", "url": "https://seanbowe.com/blog/ragu-for-orchard-part1/"},
        {"date": "2025-04-02", "title": "Tachyon: Scaling Zcash with Oblivious Synchronization", "url": "https://seanbowe.com/blog/tachyon-scaling-zcash-oblivious-synchronization/"}
      ]},
      {"source": "paper", "posts": [
        {"title": "A Note on Notes: Towards Scalable Anonymous Payments via Evolving Nullifiers and Oblivious Synchronization (Sean Bowe, Ian Miers), ePrint 2025/2031", "url": "https://eprint.iacr.org/2025/2031"}
      ]},
      {"source": "site pages", "posts": [
        {"title": "Overview", "url": "https://tachyon.z.cash/overview/"},
        {"title": "Roadmap", "url": "https://tachyon.z.cash/roadmap/"},
        {"title": "Team", "url": "https://tachyon.z.cash/team/"}
      ]}
    ],
    "feeds": [
      {"url": "https://tachyon.z.cash/atom.xml", "works_without_auth": false, "notes": "404; rss.xml and blog/atom.xml also 404, so there is no blog feed"},
      {"url": "https://seanbowe.com/atom.xml", "works_without_auth": false, "notes": "404; rss.xml and blog/atom.xml also 404"},
      {"url": "https://github.com/tachyon-zcash/ragu/releases.atom", "type": "Atom", "works_without_auth": true, "notes": "200 but empty (no releases)"},
      {"url": "https://github.com/tachyon-zcash/tachyon/releases.atom", "type": "Atom", "works_without_auth": true, "notes": "200 but empty (no releases)"},
      {"url": "https://api.github.com/repos/tachyon-zcash/ragu/releases", "type": "GitHub REST", "works_without_auth": true, "notes": "returns []; use /tags or /commits instead"}
    ],
    "github": [
      {"repo": "tachyon-zcash/ragu", "description": "Rust language proof-carrying data framework", "language": "Rust", "stars": 59, "latest_release": null, "tags": ["ragu-0.0.0", "ragu_pcd-0.0.0", "ragu_pasta-0.0.0", "ragu_primitives-0.0.0", "ragu_testing-0.0.0"]},
      {"repo": "tachyon-zcash/tachyon", "description": "zcash_tachyon Rust library for Tachyon", "language": "Rust", "stars": 30, "latest_release": null, "tags": ["v0.0.0"]},
      {"repo": "tachyon-zcash/zips", "description": "Zcash Improvement Proposals", "fork": true},
      {"repo": "tachyon-zcash/zebra", "description": "Zcash - Financial Privacy in Rust", "fork": true},
      {"repo": "tachyon-zcash/librustzcash", "description": "Rust-language assets for Zcash", "fork": true},
      {"repo": "tachyon-zcash/zcash-devtool", "description": "CLI app for developers prototyping Zcash functionality.", "fork": true},
      {"repo": "tachyon-zcash/zcash-test-vectors", "fork": true},
      {"repo": "tachyon-zcash/maybe-rayon", "fork": true}
    ],
    "facts": [
      {"fact": "Tachyon is a proposed upgrade to make Zcash scale: transactions about 100x smaller, and validators no longer have to store ever-growing data.", "url": "https://tachyon.z.cash/", "quote": "Tachyon proposes a scalability upgrade for Zcash that shrinks transactions by two orders of magnitude and removes runaway state growth for validators."},
      {"fact": "It also brings full post-quantum privacy as a side effect.", "url": "https://tachyon.z.cash/", "quote": "As a side-effect, we obtain full post-quantum privacy."},
      {"fact": "It is only a proposal: the community has to approve it before it goes live.", "url": "https://tachyon.z.cash/", "quote": "All network upgrades require community approval before activation."},
      {"fact": "Today every validator stores every nullifier forever. A nullifier is a one-time 'already spent' tag, and this adds up to gigabytes per day.", "url": "https://tachyon.z.cash/overview/", "quote": "every validator must store all revealed nullifiers forever, leading to runaway state growth: gigabytes per day even at modest TPS."},
      {"fact": "With 'oblivious synchronization', a helper service proves your coins are unspent without learning which coins are yours.", "url": "https://tachyon.z.cash/overview/", "quote": "a remote service incrementally constructs a proof that your funds have not been spent. Crucially, the service never learns your actual nullifiers"},
      {"fact": "Tachyon uses proof-carrying data (PCD): proofs that can be merged again and again, so blocks can bundle many transactions into one compact proof.", "url": "https://tachyon.z.cash/overview/", "quote": "PCD lets block producers aggregate shielded transactions without user coordination, cutting marginal size and verification cost and boosting block capacity."},
      {"fact": "Ragu is Tachyon's PCD library, written in Rust and based on the original Halo paper.", "url": "https://tachyon.z.cash/roadmap/", "quote": "Ragu is Tachyon's foundational proof-carrying data (PCD) scheme: a Rust library that closely follows the original Halo construction."},
      {"fact": "Ragu needs no trusted setup and reuses tools Zcash already ships in Orchard: the Pasta curves and the Poseidon hash.", "url": "https://tachyon.z.cash/blog/folding-tachyon-with-ragu/", "quote": "Ragu leans heavily on tools we have already shipped in Zcash: the Pasta elliptic curve cycle , the original Poseidon algebraic hash function"},
      {"fact": "Tachyon will be a new shielded pool, separate from today's Orchard pool.", "url": "https://tachyon.z.cash/roadmap/", "quote": "This protocol, which acts as a new shielded pool independent of the existing Orchard pool used in Zcash"},
      {"fact": "Sean Bowe announced Tachyon on 2 April 2025.", "url": "https://seanbowe.com/blog/tachyon-scaling-zcash-oblivious-synchronization/", "quote": "I am proposing several protocol changes in Zcash that allow us to increasingly scale the protocol while providing a smooth transition path for existing users and wallets."},
      {"fact": "The team: Sean Bowe (lead cryptographer), Tal Derei, Connor O'Hara, Alex Xiong, L Winslow, Samuel Akinosho.", "url": "https://tachyon.z.cash/team/", "quote": "Sean Bowe Lead Cryptographer Tal Derei Engineering & Cryptography Connor O'Hara Engineering & Cryptography Alex Xiong Engineering & Cryptography L Winslow Protocol Engineer Samuel Akinosho Engineering"},
      {"fact": "Tachyon's recursive proofs are being moved into Zakura Common, starting with a new crate called Udon.", "url": "https://tachyon.z.cash/blog/integrating-tachyon-with-zakura-common/", "quote": "Today we are beginning the process of upstreaming Tachyon's recursive proofs into the core of Zakura Common."}
    ]
  },
  "basics": [
    {
      "title": "What are zk-SNARKs? (z.cash Learn)",
      "url": "https://z.cash/learn/what-are-zk-snarks/",
      "facts": [
        {"fact": "zk-SNARK means Zero-Knowledge Succinct Non-Interactive Argument of Knowledge: you prove you know something without revealing it.", "quote": "The acronym zk-SNARK stands for Zero-Knowledge Succinct Non-Interactive Argument of Knowledge and refers to a proof construction where one can prove possession of certain information, e.g., a secret key, without revealing that information"},
        {"fact": "Zcash was the first widespread use of zk-SNARKs.", "quote": "Zcash was the first widespread application of zk-SNARKs"},
        {"fact": "Shielded transactions are fully encrypted on-chain but can still be checked as valid.", "quote": "shielded transactions in Zcash can be fully encrypted on the blockchain, yet still be verified as valid under the network’s consensus rules by using zk-SNARK proofs."},
        {"fact": "'Succinct' means proofs are tiny (a few hundred bytes) and quick to check (milliseconds).", "quote": "“Succinct” zero-knowledge proofs can be verified within a few milliseconds, with a proof length of only a few hundred bytes"},
        {"fact": "Since NU5 (May 2022), Orchard uses Halo 2, which needs no trusted setup.", "quote": "With Network Upgrade 5 (NU5) in May 2022, Zcash introduced the Orchard shielded payment protocol, which utilizes the Halo 2 zero-knowledge proving system."}
      ]
    },
    {
      "title": "What is the difference between shielded and transparent Zcash? (z.cash Learn)",
      "url": "https://z.cash/learn/what-is-the-difference-between-shielded-and-transparent-zcash/",
      "facts": [
        {"fact": "Shielded addresses keep your finances private; transparent addresses are public like Bitcoin.", "quote": "Shielded Zcash addresses keep your financial information private. Transparent addresses make that information public."},
        {"fact": "Zcash lets you choose between private and public.", "quote": "With Zcash you have the option to keep your financial information private (shielded), or transparent and available to the public like most other blockchains."}
      ]
    },
    {
      "title": "Zcash Protocol Specification (version v2026.7.0-282-g3af03a [NU6.2], dated October 8, 2026)",
      "url": "https://zips.z.cash/protocol/protocol.pdf",
      "facts": [
        {"fact": "Zcash is based on the Zerocash design.", "quote": "Zcash is an implementation of the Decentralized Anonymous Payment scheme Zerocash, with security fixes and improvements to performance and functionality."},
        {"fact": "It combines Bitcoin-style transparent payments with shielded payments secured by zk-SNARKs.", "quote": "It bridges the existing transparent payment scheme used by Bitcoin with a shielded payment scheme secured by zero-knowledge succinct non-interactive arguments of knowledge (zk-SNARKs)."},
        {"fact": "The spec covers every upgrade from launch to NU6.2.", "quote": "This specification defines the Zcash consensus protocol at launch, and after each of the upgrades codenamed Overwinter, Sapling upgrade, Blossom, Heartwood, Canopy, NU5, NU6, NU6.1, and NU6.2."}
      ]
    },
    {
      "title": "ZIP 224: Orchard Shielded Protocol",
      "url": "https://zips.z.cash/zip-0224",
      "facts": [
        {"fact": "Zcash has had three shielded pools: Sprout, then Sapling, then Orchard.", "quote": "Zcash currently has two active shielded protocols and associated shielded pools: The Sprout shielded protocol ... The Sapling shielded protocol"},
        {"fact": "Orchard was designed to allow future scaling.", "quote": "This document proposes the Orchard shielded protocol, which defines a new shielded pool with spending keys and payment addresses that are amenable to future scalability improvements."},
        {"fact": "Sprout and Sapling used Groth16, which needed a 'trusted setup'. If its secret were known, it could be used to counterfeit coins.", "quote": "The Sprout and Sapling circuits are implemented using a proving system (Groth16) that requires a \"trusted setup\""}
      ]
    },
    {
      "title": "Explaining SNARKs Part I: Homomorphic Hidings (ECC blog, 2017-02-28; now hosted at zodl.com)",
      "url": "https://zodl.com/snark-explain/",
      "facts": [
        {"fact": "A key ingredient in zk-SNARKs is 'homomorphic hiding': you can do math on hidden numbers without revealing them.", "quote": "If someone knows E(x) and E(y), they can generate the HH of arithmetic expressions in x and y."},
        {"fact": "Toy example: Alice proves x+y=7 without telling Bob x or y.", "quote": "Suppose Alice wants to prove to Bob she knows numbers x,y such that x+y=7"}
      ]
    },
    {
      "title": "ZKProof Standards",
      "url": "https://zkproof.org/",
      "facts": [
        {"fact": "ZKProof is an open industry and academic effort to standardize zero-knowledge proofs.", "quote": "ZKProof is an open-industry academic initiative that seeks to mainstream zero-knowledge proof (ZKP) cryptography through an inclusive, community-driven standardization process that focuses on interoperability and security."}
      ]
    }
  ],
  "other_feeds_tested": [
    {"url": "https://zfnd.org/feed/", "works_without_auth": true, "type": "RSS"},
    {"url": "https://zkproof.org/feed/", "works_without_auth": true, "type": "RSS"},
    {"url": "https://forum.zcashcommunity.com/latest.rss", "works_without_auth": true, "type": "RSS"},
    {"url": "https://z.cash/feed/", "works_without_auth": true, "type": "RSS", "notes": "appears stale (top item: Zcashd 5.6.0 released)"},
    {"url": "https://electriccoin.co/feed/", "works_without_auth": false, "notes": "returns HTML (ECC blog moved to zodl.com)"}
  ]
}
```

Note: the HH quote originally renders math with `:math:` markup on the page. It's shown here with the markup removed.
