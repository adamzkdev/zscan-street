//! JS bindings (wasm-bindgen) for the spike.

use wasm_bindgen::prelude::*;
use zcash_protocol::consensus::NetworkType;

use crate::*;

fn jerr(e: Error) -> JsError {
    JsError::new(&e)
}

fn now() -> f64 {
    js_sys::Date::now()
}

#[wasm_bindgen(start)]
pub fn start() {
    console_error_panic_hook::set_once();
}

/// The uregtest1 Orchard-only unified address of account 0 of a hex seed.
#[wasm_bindgen]
pub fn address(seed_hex: &str) -> Result<String, JsError> {
    let k = Keys::from_seed(&hex::decode(seed_hex).map_err(|e| JsError::new(&e.to_string()))?).map_err(jerr)?;
    Ok(encode_ua(&k.address(), NetworkType::Regtest))
}

/// Builds, proves and signs a first issuance; returns the raw tx hex for sendrawtransaction.
#[wasm_bindgen]
pub fn build_issue_hex(seed_hex: &str, target_height: u32, anchor_hex: &str, asset_desc: &str, amount: u64) -> Result<String, JsError> {
    let k = Keys::from_seed(&hex::decode(seed_hex).map_err(|e| JsError::new(&e.to_string()))?).map_err(jerr)?;
    let anchor = anchor_from_root_hex(anchor_hex).map_err(jerr)?;
    let tx = build_issue(&k, target_height, anchor, asset_desc.as_bytes(), amount, k.address(), true, false, 0).map_err(jerr)?;
    Ok(hex::encode(tx_bytes(&tx)))
}

/// Runs the offline issue + transfer self-test; returns timings in ms and sizes as JSON.
#[wasm_bindgen]
pub fn selftest_json(seed_hex: &str) -> Result<String, JsError> {
    let seed = hex::decode(seed_hex).map_err(|e| JsError::new(&e.to_string()))?;
    let t0 = now();
    let (tx1, tx2) = crate::selftest(&seed).map_err(jerr)?;
    let t1 = now();
    Ok(format!(
        "{{\"total_ms\":{},\"issue_bytes\":{},\"transfer_bytes\":{},\"issue_txid\":\"{}\",\"transfer_txid\":\"{}\"}}",
        t1 - t0,
        tx_bytes(&tx1).len(),
        tx_bytes(&tx2).len(),
        tx1.txid(),
        tx2.txid()
    ))
}

/// Times one issuance build alone (ms).
#[wasm_bindgen]
pub fn bench_issue_ms(seed_hex: &str) -> Result<f64, JsError> {
    let k = Keys::from_seed(&hex::decode(seed_hex).map_err(|e| JsError::new(&e.to_string()))?).map_err(jerr)?;
    let empty = incrementalmerkletree::frontier::CommitmentTree::<orchard::tree::MerkleHashOrchard, 32>::empty();
    let t0 = now();
    build_issue(&k, 10, orchard::Anchor::from(empty.root()), b"bench", 1, k.address(), true, false, 0).map_err(jerr)?;
    Ok(now() - t0)
}

// ---- the ZStreet ZSA Lab burner wallet ----

use crate::wallet::{Built, Wallet};

fn hexseed(seed_hex: &str) -> Result<Vec<u8>, JsError> {
    let s = hex::decode(seed_hex.trim()).map_err(|_| JsError::new("seed: not hex"))?;
    if s.len() < 32 {
        return Err(JsError::new("seed: at least 32 bytes"));
    }
    Ok(s)
}

fn amount(v: f64) -> Result<u64, JsError> {
    if !(v >= 0.0) || v.fract() != 0.0 || v > 9007199254740991.0 {
        return Err(JsError::new("amount: a non-negative integer (≤ 2^53)"));
    }
    Ok(v as u64)
}

fn built_json(b: Built) -> String {
    format!(
        "{{\"hex\":\"{}\",\"txid\":\"{}\",\"asset_id\":\"{}\",\"fee\":{},\"expiry\":{}}}",
        b.tx_hex, b.txid, b.asset_id, b.fee, b.expiry
    )
}

/// One wallet (one seed) in memory. Persist it with `save()`; the seed is never in the state.
#[wasm_bindgen]
pub struct ZsaWallet {
    w: Wallet,
}

#[wasm_bindgen]
impl ZsaWallet {
    /// A new wallet born at `birthday`; `orchard_tree_hex` is the tree state at `birthday - 1`.
    #[wasm_bindgen(constructor)]
    pub fn new(seed_hex: &str, birthday: u32, orchard_tree_hex: &str) -> Result<ZsaWallet, JsError> {
        Ok(ZsaWallet { w: Wallet::new(&hexseed(seed_hex)?, birthday, orchard_tree_hex).map_err(jerr)? })
    }

    pub fn load(seed_hex: &str, state: &[u8]) -> Result<ZsaWallet, JsError> {
        Ok(ZsaWallet { w: Wallet::from_bytes(&hexseed(seed_hex)?, state).map_err(jerr)? })
    }

    pub fn save(&self) -> Vec<u8> {
        self.w.to_bytes()
    }

    /// uregtest1… unified address (Orchard receiver only), the form the ZSA service and its
    /// sponsor use; consensus does not look at addresses, and any HRP is accepted as a recipient.
    pub fn address(&self) -> String {
        encode_ua(&self.w.address(), NetworkType::Regtest)
    }

    pub fn scanned(&self) -> u32 {
        self.w.scanned
    }

    pub fn birthday(&self) -> u32 {
        self.w.birthday
    }

    /// Scans length-prefixed CompactBlocks starting at `scanned() + 1`; JSON report
    /// {blocks, received, spent, mined:[txid], reorg}. On reorg nothing is applied.
    pub fn scan(&mut self, stream: &[u8]) -> Result<String, JsError> {
        let r = self.w.scan_stream(stream).map_err(jerr)?;
        let mined: Vec<String> = r.mined.iter().map(|t| format!("\"{t}\"")).collect();
        Ok(format!(
            "{{\"blocks\":{},\"received\":{},\"spent\":{},\"mined\":[{}],\"reorg\":{},\"scanned\":{}}}",
            r.blocks, r.received, r.spent, mined.join(","), r.reorg, self.w.scanned
        ))
    }

    pub fn balances(&self) -> String {
        self.w.balances_json()
    }

    pub fn history(&self) -> String {
        self.w.history_json()
    }

    /// The asset id this wallet's issuance key gives a name.
    pub fn asset_id(&self, name: &str) -> Result<String, JsError> {
        Ok(hex::encode(self.w.asset_for(name).map_err(jerr)?.to_bytes()))
    }

    pub fn issue(&mut self, target_height: u32, name: &str, amount_units: f64, finalize: bool) -> Result<String, JsError> {
        Ok(built_json(self.w.issue(target_height, name, amount(amount_units)?, finalize).map_err(jerr)?))
    }

    pub fn transfer(&mut self, target_height: u32, asset_id: &str, amount_units: f64, to: &str) -> Result<String, JsError> {
        Ok(built_json(self.w.transfer(target_height, asset_id, amount(amount_units)?, to).map_err(jerr)?))
    }

    pub fn burn(&mut self, target_height: u32, asset_id: &str, amount_units: f64) -> Result<String, JsError> {
        Ok(built_json(self.w.burn(target_height, asset_id, amount(amount_units)?).map_err(jerr)?))
    }

    pub fn finalize(&mut self, target_height: u32, asset_id: &str) -> Result<String, JsError> {
        Ok(built_json(self.w.finalize(target_height, asset_id).map_err(jerr)?))
    }

    /// After a successful broadcast: locks the spent notes, records the tx as pending.
    pub fn commit(&mut self, txid: &str) -> Result<(), JsError> {
        self.w.commit(txid).map_err(jerr)
    }

    /// Shows an incoming tx (the drip) as pending until it is mined.
    pub fn track_incoming(&mut self, txid: &str, asset_id: &str, amount_units: f64) -> Result<(), JsError> {
        self.w.track_incoming(txid, asset_id, amount(amount_units)?).map_err(jerr)
    }
}

/// Offline issue → transfer → burn → finalize with real proofs and verification (JSON report).
#[wasm_bindgen]
pub fn offline_flow_json(seed_hex: &str) -> Result<String, JsError> {
    crate::wallet::offline_flow(&hexseed(seed_hex)?, &now).map_err(jerr)
}

/// Parses a raw tx and verifies its OrchardZSA proof: JSON {txid, bytes, actions, issued, burns, fee, ok}.
#[wasm_bindgen]
pub fn verify_tx_hex(tx_hex: &str) -> Result<String, JsError> {
    let raw = hex::decode(tx_hex).map_err(|_| JsError::new("tx: not hex"))?;
    let tx = parse_tx(&raw).map_err(jerr)?;
    let mut actions = 0;
    let mut burns = 0;
    let mut fee = 0i64;
    if let Some(zcash_primitives::transaction::OrchardBundle::OrchardZSA(b)) = tx.orchard_bundle() {
        let vk = orchard::circuit::VerifyingKey::build::<orchard::flavor::OrchardZSA>();
        b.verify_proof(&vk).map_err(|x| JsError::new(&format!("proof does not verify: {x:?}")))?;
        actions = b.actions().len();
        burns = b.burn().len();
        fee = i64::from(*b.value_balance());
    }
    let issued = tx.issue_bundle().map_or(0, |b| b.get_all_notes().len());
    Ok(format!(
        "{{\"txid\":\"{}\",\"bytes\":{},\"actions\":{actions},\"issued\":{issued},\"burns\":{burns},\"fee\":{fee},\"ok\":true}}",
        tx.txid(),
        raw.len()
    ))
}
