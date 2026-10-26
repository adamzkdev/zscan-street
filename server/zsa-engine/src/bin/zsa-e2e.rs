//! Native end-to-end harness against the public ZSA testnet (rpc.test-zsa.org), using the same
//! code as the wasm build. The seed lives in .secrets/seed.hex (gitignored, test funds only).
//!
//!   zsa-e2e keys                    addresses + issuance key
//!   zsa-e2e parse <height>          parse every tx of a block, check txid round trip
//!   zsa-e2e issue <desc> <amount>   issue (first issuance), broadcast, wait for a block
//!   zsa-e2e transfer <amount>       spend the issued note: <amount> to account 1, change back
//!   zsa-e2e scan <height>           trial-decrypt a block for both accounts

use std::{fs, path::PathBuf, time::{Duration, Instant}};

use serde_json::{json, Value};
use zapp_zsa_engine::*;
use zcash_protocol::consensus::NetworkType;

const RPC: &str = "https://rpc.test-zsa.org";

fn rpc(method: &str, params: Value) -> Result<Value, String> {
    let r: Value = ureq::post(RPC)
        .timeout(Duration::from_secs(60))
        .send_json(json!({"jsonrpc": "2.0", "id": 1, "method": method, "params": params}))
        .map_err(|e| match e {
            ureq::Error::Status(_, resp) => resp.into_string().unwrap_or_default(),
            e => e.to_string(),
        })?
        .into_json()
        .map_err(|e| e.to_string())?;
    if !r["error"].is_null() {
        return Err(r["error"].to_string());
    }
    Ok(r["result"].clone())
}

/// zsa.methyl.cc lightwalletd (another ZSA chain, with a faucet), through grpcurl.
fn lwd(method: &str, body: &str) -> Value {
    let out = std::process::Command::new("grpcurl")
        .args(["-max-time", "120", "-d", body, "zsa.methyl.cc:443", &format!("cash.z.wallet.sdk.rpc.CompactTxStreamer/{method}")])
        .output()
        .expect("grpcurl");
    let txt = String::from_utf8_lossy(&out.stdout).to_string() + &String::from_utf8_lossy(&out.stderr);
    serde_json::from_str(&txt).unwrap_or(json!({"raw": txt}))
}

fn b64(s: &str) -> Vec<u8> {
    use base64::Engine;
    base64::engine::general_purpose::STANDARD.decode(s).unwrap()
}

fn txid_b64(txid_hex: &str) -> String {
    use base64::Engine;
    let mut b = hex::decode(txid_hex).unwrap();
    b.reverse();
    base64::engine::general_purpose::STANDARD.encode(b)
}

/// Full transactions of a methyl block, in order (compact block for the txids, then GetTransaction).
fn m_block_txs(h: u32) -> Vec<(String, Vec<u8>)> {
    let cb = lwd("GetBlock", &format!("{{\"height\":{h}}}"));
    cb["vtx"]
        .as_array()
        .unwrap()
        .iter()
        .map(|t| {
            let mut id = b64(t["txid"].as_str().unwrap());
            id.reverse();
            let idh = hex::encode(&id);
            let raw = lwd("GetTransaction", &format!("{{\"hash\":\"{}\"}}", txid_b64(&idh)));
            (idh, b64(raw["data"].as_str().unwrap()))
        })
        .collect()
}

fn m_tree(h: u32) -> String {
    lwd("GetTreeState", &format!("{{\"height\":{h}}}"))["orchardTree"].as_str().unwrap().to_string()
}

/// Our unspent notes in tx `txid` of methyl block `h`, with witnesses at the end of block `h`.
fn m_notes(k: &Keys, txid: &str, h: u32) -> (Vec<(orchard::Note, orchard::tree::MerklePath)>, orchard::Anchor) {
    let mut leaves = vec![];
    let mut mine = vec![];
    for (id, raw) in m_block_txs(h) {
        let tx = parse_tx(&raw).unwrap();
        if id == txid {
            for (pos, n) in scan_tx(k, &tx) {
                if n.value().inner() > 0 {
                    mine.push((leaves.len() + pos, n));
                }
            }
        }
        leaves.extend(tx_commitments(&tx));
    }
    let positions: Vec<usize> = mine.iter().map(|(p, _)| *p).collect();
    let (paths, anchor) = witnesses(tree_from_hex(&m_tree(h - 1)).unwrap(), &leaves, &positions).unwrap();
    let node_root = tree_from_hex(&m_tree(h)).unwrap().root();
    assert_eq!(orchard::Anchor::from(node_root), anchor, "recomputed root differs from lightwalletd's tree state");
    (mine.into_iter().map(|(_, n)| n).zip(paths).collect(), anchor)
}

fn m_send_wait(tx: &zcash_primitives::transaction::Transaction, tip: u32) -> u32 {
    use base64::Engine;
    let raw = tx_bytes(tx);
    let txid = tx.txid().to_string();
    let r = lwd("SendTransaction", &format!("{{\"data\":\"{}\",\"height\":{tip}}}", base64::engine::general_purpose::STANDARD.encode(&raw)));
    println!("tx {txid} ({} B) -> {r}", raw.len());
    let t0 = Instant::now();
    loop {
        std::thread::sleep(Duration::from_secs(10));
        let v = lwd("GetTransaction", &format!("{{\"hash\":\"{}\"}}", txid_b64(&txid)));
        if let Some(h) = v["height"].as_str().and_then(|h| h.parse::<u64>().ok()).filter(|h| *h > 0 && *h < u32::MAX as u64) {
            println!("mined at height {h} after {:?}", t0.elapsed());
            return h as u32;
        }
        if t0.elapsed() > Duration::from_secs(1800) {
            panic!("not mined after 30 min: {v}");
        }
    }
}

fn m_tip() -> u32 {
    lwd("GetLatestBlock", "{}")["height"].as_str().unwrap().parse().unwrap()
}

fn secrets() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(".secrets")
}

fn seed() -> Vec<u8> {
    let p = secrets().join("seed.hex");
    if let Ok(s) = fs::read_to_string(&p) {
        return hex::decode(s.trim()).unwrap();
    }
    let mut s = [0u8; 32];
    rand_core::RngCore::fill_bytes(&mut rand_core::OsRng, &mut s);
    fs::create_dir_all(secrets()).unwrap();
    fs::write(&p, hex::encode(s)).unwrap();
    s.to_vec()
}

/// Account 1 of the same seed, as the transfer recipient.
fn keys2(seed: &[u8]) -> Keys {
    let mut s = seed.to_vec();
    s.push(1);
    Keys::from_seed(&s).unwrap()
}

fn tip() -> u32 {
    rpc("getblockcount", json!([])).unwrap().as_u64().unwrap() as u32
}

fn treestate(h: u32) -> (String, String) {
    let t = rpc("z_gettreestate", json!([h.to_string()])).unwrap();
    let o = &t["orchard"]["commitments"];
    (o["finalState"].as_str().unwrap_or("").to_string(), o["finalRoot"].as_str().unwrap().to_string())
}

fn block_txs(h: u32) -> Vec<(String, Vec<u8>)> {
    let b = rpc("getblock", json!([h.to_string(), 1])).unwrap();
    b["tx"]
        .as_array()
        .unwrap()
        .iter()
        .map(|t| {
            let id = t.as_str().unwrap().to_string();
            let raw = rpc("getrawtransaction", json!([id, 0])).unwrap();
            (id, hex::decode(raw.as_str().unwrap()).unwrap())
        })
        .collect()
}

fn broadcast_and_wait(tx: &zcash_primitives::transaction::Transaction) -> u32 {
    let raw = tx_bytes(tx);
    let txid = tx.txid().to_string();
    println!("tx {txid}, {} bytes", raw.len());
    let r = rpc("sendrawtransaction", json!([hex::encode(&raw)]));
    println!("sendrawtransaction -> {r:?}");
    r.expect("broadcast");
    let t0 = Instant::now();
    loop {
        std::thread::sleep(Duration::from_secs(10));
        if let Ok(v) = rpc("getrawtransaction", json!([txid, 1])) {
            if let Some(h) = v["height"].as_u64() {
                println!("mined at height {h} after {:?}", t0.elapsed());
                let b = rpc("getblock", json!([h.to_string(), 1])).unwrap();
                assert!(b["tx"].as_array().unwrap().iter().any(|t| t.as_str() == Some(&txid)));
                println!("getblock {h}: contains {txid}");
                return h as u32;
            }
        }
        if t0.elapsed() > Duration::from_secs(1800) {
            panic!("not mined after 30 min");
        }
    }
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let seed = seed();
    let k = Keys::from_seed(&seed).unwrap();
    match args.get(1).map(|s| s.as_str()) {
        Some("keys") => {
            println!("uregtest: {}", encode_ua(&k.address(), NetworkType::Regtest));
            println!("utest:    {}", encode_ua(&k.address(), NetworkType::Test));
            println!("ik:       {}", hex::encode(k.ik().to_bytes()));
            println!("account1: {}", encode_ua(&keys2(&seed).address(), NetworkType::Regtest));
        }
        Some("parse") => {
            let h: u32 = args[2].parse().unwrap();
            for (id, raw) in block_txs(h) {
                let tx = parse_tx(&raw).unwrap();
                let back = tx_bytes(&tx);
                println!(
                    "{id} v{:?} parsed, txid ok: {}, bytes ok: {}, issue: {}, orchard actions: {}, commitments: {}",
                    tx.version(),
                    tx.txid().to_string() == id,
                    back == raw,
                    tx.issue_bundle().is_some(),
                    tx.orchard_bundle().map_or(0, |b| match b {
                        zcash_primitives::transaction::OrchardBundle::OrchardZSA(b) => b.actions().len(),
                        zcash_primitives::transaction::OrchardBundle::OrchardVanilla(b) => b.actions().len(),
                    }),
                    tx_commitments(&tx).len()
                );
            }
            // Check the commitment order against the node's tree state.
            let (prev, _) = treestate(h - 1);
            let (_, root) = treestate(h);
            let mut tree = tree_from_hex(&prev).unwrap();
            for (_, raw) in block_txs(h) {
                for c in tx_commitments(&parse_tx(&raw).unwrap()) {
                    tree.append(c).unwrap();
                }
            }
            let mine = hex::encode(orchard::Anchor::from(tree.root()).to_bytes());
            println!("root recomputed {mine}\nroot from node  {root}\nmatch: {}", mine == root);
        }
        Some("issue") => {
            let desc = args[2].as_bytes();
            let amount: u64 = args[3].parse().unwrap();
            let h = tip();
            let (_, root) = treestate(h);
            let anchor = anchor_from_root_hex(&root).unwrap();
            println!("asset {}", hex::encode(k.asset(desc).unwrap().to_bytes()));
            let t0 = Instant::now();
            let tx = build_issue(&k, h + 1, anchor, desc, amount, k.address(), true, false, 0).unwrap();
            println!("built+proved+signed in {:?}", t0.elapsed());
            let mh = broadcast_and_wait(&tx);
            fs::write(secrets().join("issued.txt"), format!("{} {}", tx.txid(), mh)).unwrap();
        }
        Some("transfer") => {
            let amount: u64 = args[2].parse().unwrap();
            let s = fs::read_to_string(secrets().join("issued.txt")).unwrap();
            let mut it = s.split_whitespace();
            let (txid, h) = (it.next().unwrap().to_string(), it.next().unwrap().parse::<u32>().unwrap());
            let txs = block_txs(h);
            let mut leaves = vec![];
            let mut found = None;
            for (id, raw) in &txs {
                let tx = parse_tx(raw).unwrap();
                if *id == txid {
                    for (pos, note) in scan_tx(&k, &tx) {
                        if !bool::from(note.asset().is_zatoshi()) {
                            found = Some((leaves.len() + pos, note));
                        }
                    }
                }
                leaves.extend(tx_commitments(&tx));
            }
            let (pos, note) = found.expect("issued note");
            println!("issued note: {} units of {}", note.value().inner(), hex::encode(note.asset().to_bytes()));
            let (prev, _) = treestate(h - 1);
            let (_, root) = treestate(h);
            let (path, anchor) = witness(tree_from_hex(&prev).unwrap(), &leaves, pos).unwrap();
            println!("witness root matches node: {}", hex::encode(anchor.to_bytes()) == root);
            let to = keys2(&seed).address();
            let t0 = Instant::now();
            let tx = build_transfer(&k, tip() + 1, anchor, note, path, to, amount, 0).unwrap();
            println!("built+proved+signed in {:?}", t0.elapsed());
            let mh = broadcast_and_wait(&tx);
            fs::write(secrets().join("transfer.txt"), format!("{} {}", tx.txid(), mh)).unwrap();
            // Wallet side: find the outputs again from the mined block.
            for (id, raw) in block_txs(mh) {
                let tx = parse_tx(&raw).unwrap();
                for (who, kk) in [("account0", &k), ("account1", &keys2(&seed))] {
                    for (_, n) in scan_tx(kk, &tx) {
                        println!("{id}: {who} decrypted {} of {}", n.value().inner(), hex::encode(n.asset().to_bytes()));
                    }
                }
            }
        }
        Some("m-issue") => {
            // zsa.methyl.cc (a different ZSA chain, lightwalletd only): consensus probe, 0 fee.
            let tipv = lwd("GetLatestBlock", "{}");
            let h: u32 = tipv["height"].as_str().unwrap().parse().unwrap();
            let ts = lwd("GetTreeState", &format!("{{\"height\":{h}}}"));
            let tree = tree_from_hex(ts["orchardTree"].as_str().unwrap()).unwrap();
            let anchor = orchard::Anchor::from(tree.root());
            let tx = build_issue(&k, h + 1, anchor, args[2].as_bytes(), 1000, k.address(), true, false, 0).unwrap();
            let raw = tx_bytes(&tx);
            use base64::Engine;
            let b64 = base64::engine::general_purpose::STANDARD.encode(&raw);
            println!("tx {} -> {}", tx.txid(), lwd("SendTransaction", &format!("{{\"data\":\"{b64}\",\"height\":{h}}}")));
        }
        Some("m-root") => {
            let h: u32 = args[2].parse().unwrap();
            let mut tree = tree_from_hex(&m_tree(h - 1)).unwrap();
            let mut n = 0;
            for (_, raw) in m_block_txs(h) {
                for c in tx_commitments(&parse_tx(&raw).unwrap()) {
                    tree.append(c).unwrap();
                    n += 1;
                }
            }
            let node = tree_from_hex(&m_tree(h)).unwrap().root();
            println!("methyl block {h}: {n} commitments, root matches lightwalletd: {}", tree.root() == node);
        }
        Some("m-run") => {
            // Faucet txid -> issue a new asset paying the fee from the faucet note -> transfer part
            // of it to account 1 -> find it again from compact blocks.
            let faucet_txid = &args[2];
            let ft = lwd("GetTransaction", &format!("{{\"hash\":\"{}\"}}", txid_b64(faucet_txid)));
            let fh: u32 = ft["height"].as_str().unwrap().parse().unwrap();
            let (notes, anchor) = m_notes(&k, faucet_txid, fh);
            println!("faucet notes: {:?}", notes.iter().map(|(n, _)| n.value().inner()).collect::<Vec<_>>());
            let desc = args.get(3).cloned().unwrap_or("ZApp spike asset".into());
            let fee = 2 * conventional_fee(2, 2);
            let tip = m_tip();
            let t0 = Instant::now();
            let tx = build_tx(&k, tip + 1, anchor, notes, vec![], Some(IssueReq { asset_desc: desc.clone().into_bytes(), amount: 1_000_000, to: k.address(), first_issuance: true, finalize: false }), fee).unwrap();
            println!("issue built+proved+signed in {:?}, asset {}", t0.elapsed(), hex::encode(k.asset(desc.as_bytes()).unwrap().to_bytes()));
            let ih = m_send_wait(&tx, tip);
            let itxid = tx.txid().to_string();
            fs::write(secrets().join("methyl_issued.txt"), format!("{itxid} {ih}")).unwrap();
            let (notes, anchor) = m_notes(&k, &itxid, ih);
            println!("after issuance: {:?}", notes.iter().map(|(n, _)| (n.value().inner(), bool::from(n.asset().is_zatoshi()))).collect::<Vec<_>>());
            let asset = k.asset(desc.as_bytes()).unwrap();
            let tip = m_tip();
            let t0 = Instant::now();
            let tx = build_tx(&k, tip + 1, anchor, notes, vec![(keys2(&seed).address(), asset, 250_000)], None, 2 * conventional_fee(3, 0)).unwrap();
            println!("transfer built+proved+signed in {:?}", t0.elapsed());
            let th = m_send_wait(&tx, tip);
            fs::write(secrets().join("methyl_transfer.txt"), format!("{} {th}", tx.txid())).unwrap();
            let cb = lwd("GetBlock", &format!("{{\"height\":{th}}}"));
            for t in cb["vtx"].as_array().unwrap() {
                for a in t["actions"].as_array().into_iter().flatten() {
                    let f = |x: &str| b64(a[x].as_str().unwrap_or(""));
                    for (who, kk) in [("account0", &k), ("account1", &keys2(&seed))] {
                        if let Some(n) = try_compact(kk, &f("nullifier"), &f("cmx"), &f("ephemeralKey"), &f("ciphertext")) {
                            println!("compact block {th}: {who} has {} of {}", n.value().inner(), hex::encode(n.asset().to_bytes()));
                        }
                    }
                }
            }
        }
        Some("selftest") => {
            let t0 = Instant::now();
            let (a, b) = selftest(&[7u8; 32]).unwrap();
            println!("selftest native: issue {} B, transfer {} B, total {:?}", tx_bytes(&a).len(), tx_bytes(&b).len(), t0.elapsed());
        }
        Some("parsefile") => {
            let raw = fs::read(&args[2]).unwrap();
            let tx = parse_tx(&raw).unwrap();
            println!("txid {} bytes ok {} issue {} commitments {}", tx.txid(), tx_bytes(&tx) == raw, tx.issue_bundle().is_some(), tx_commitments(&tx).len());
            if let Some(ib) = tx.issue_bundle() {
                for n in ib.get_all_notes() {
                    println!("  issued {} of {}", n.value().inner(), hex::encode(n.asset().to_bytes()));
                }
            }
        }
        Some("scan") => {
            let h: u32 = args[2].parse().unwrap();
            for (id, raw) in block_txs(h) {
                let tx = parse_tx(&raw).unwrap();
                for (who, kk) in [("account0", &k), ("account1", &keys2(&seed))] {
                    for (_, n) in scan_tx(kk, &tx) {
                        println!("{id}: {who} {} of {}", n.value().inner(), hex::encode(n.asset().to_bytes()));
                    }
                }
            }
        }
        _ => eprintln!("usage: zsa-e2e keys|parse <h>|issue <desc> <amount>|transfer <amount>|scan <h>"),
    }
}
