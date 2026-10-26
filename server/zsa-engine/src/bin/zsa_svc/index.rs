//! ZSA asset index: every issuance, finalization and burn seen on the chain, plus a feed of
//! events. Issuances come from compact blocks (CompactIssuance carries ik, description hash,
//! notes in clear); burns and the transfer/vanilla distinction need the full transaction.
//!
//! ZIP 227 puts only the 32-byte asset description *hash* on chain, so names are learned from
//! anyone who submits the description (POST /v1/zsa/name or the broadcast body): the service
//! checks the hash before storing it, so a name cannot be forged.

use std::collections::{BTreeMap, HashMap};

use serde::{Deserialize, Serialize};
use zcash_primitives::transaction::{OrchardBundle, Transaction};

use super::{chain::issuance_asset, lwd::{pb, txid_hex}};

const MAX_EVENTS: usize = 50_000;
const MAX_TXIDS: usize = 20;

#[derive(Clone, Serialize, Deserialize)]
pub struct Asset {
    pub asset_id: String,
    pub desc_hash: Option<String>,
    pub issuer: Option<String>,
    pub issued: u64,
    pub finalized: bool,
    pub burned: u64,
    pub first_height: u32,
    pub last_height: u32,
    pub txs: u32,
    pub txids: Vec<String>,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct Event {
    pub height: u32,
    pub time: u32,
    pub txid: String,
    pub kind: String,
    pub asset_id: Option<String>,
    pub amount: Option<u64>,
}

#[derive(Default, Serialize, Deserialize)]
pub struct Index {
    pub from: u32,
    pub scanned: u32,
    pub assets: BTreeMap<String, Asset>,
    /// Ascending by height.
    pub events: Vec<Event>,
    /// asset description hash (hex) -> description (UTF-8 lossy, trimmed).
    pub names: BTreeMap<String, String>,
}

pub fn clean_name(desc: &[u8]) -> String {
    let s = String::from_utf8_lossy(desc);
    s.trim().chars().filter(|c| !c.is_control()).take(64).collect::<String>().trim().to_string()
}

impl Index {
    pub fn name_of(&self, a: &Asset) -> Option<String> {
        a.desc_hash.as_ref().and_then(|h| self.names.get(h)).cloned()
    }

    fn touch(&mut self, id: &str, h: u32, txid: &str) -> &mut Asset {
        let a = self.assets.entry(id.to_string()).or_insert_with(|| Asset {
            asset_id: id.to_string(),
            desc_hash: None,
            issuer: None,
            issued: 0,
            finalized: false,
            burned: 0,
            first_height: h,
            last_height: h,
            txs: 0,
            txids: vec![],
        });
        a.last_height = a.last_height.max(h);
        a.first_height = a.first_height.min(h);
        if a.txids.last().map(|t| t.as_str()) != Some(txid) {
            a.txs += 1;
            a.txids.push(txid.to_string());
            if a.txids.len() > MAX_TXIDS {
                a.txids.remove(0);
            }
        }
        a
    }

    fn event(&mut self, height: u32, time: u32, txid: &str, kind: &str, asset_id: Option<String>, amount: Option<u64>) {
        self.events.push(Event { height, time, txid: txid.to_string(), kind: kind.into(), asset_id, amount });
    }

    /// `full`: parsed full transactions by internal txid (None when unavailable).
    pub fn apply_block(&mut self, b: &pb::CompactBlock, full: &HashMap<Vec<u8>, Option<Transaction>>) {
        let h = b.height as u32;
        for tx in &b.vtx {
            let txid = txid_hex(&tx.txid);
            for iss in &tx.issuances {
                let Some(asset) = issuance_asset(iss) else { continue };
                let id = hex::encode(asset.to_bytes());
                let amount: u64 = iss.notes.iter().map(|n| n.value).fold(0u64, |a, v| a.saturating_add(v));
                let a = self.touch(&id, h, &txid);
                a.desc_hash = Some(hex::encode(&iss.asset_desc_hash));
                a.issuer = Some(hex::encode(&iss.ik));
                a.issued = a.issued.saturating_add(amount);
                a.finalized |= iss.finalize;
                self.event(h, b.time, &txid, "issue", Some(id.clone()), Some(amount));
                if iss.finalize {
                    self.event(h, b.time, &txid, "finalize", Some(id), None);
                }
            }
            if tx.actions.is_empty() {
                continue;
            }
            let mut zsa_bundle = true; // unknown full tx: v6 chain, assume OrchardZSA
            let mut burned_any = false;
            if let Some(Some(ftx)) = full.get(&tx.txid) {
                match ftx.orchard_bundle() {
                    Some(OrchardBundle::OrchardZSA(ob)) => {
                        for (asset, v) in ob.burn() {
                            let id = hex::encode(asset.to_bytes());
                            let a = self.touch(&id, h, &txid);
                            a.burned = a.burned.saturating_add(v.inner());
                            self.event(h, b.time, &txid, "burn", Some(id), Some(v.inner()));
                            burned_any = true;
                        }
                    }
                    _ => zsa_bundle = false,
                }
            }
            if tx.issuances.is_empty() && !burned_any && zsa_bundle {
                self.event(h, b.time, &txid, "transfer", None, None);
            }
        }
        if self.events.len() > MAX_EVENTS {
            let cut = self.events.len() - MAX_EVENTS;
            self.events.drain(..cut);
        }
        self.scanned = h;
    }

    /// Stores a verified description; returns how many known assets it names.
    pub fn add_name(&mut self, desc: &[u8]) -> Option<(String, usize)> {
        let ne = nonempty::NonEmpty::from_slice(desc)?;
        let hash = hex::encode(orchard::issuance::compute_asset_desc_hash(&ne));
        let name = clean_name(desc);
        if name.is_empty() {
            return None;
        }
        let n = self.assets.values().filter(|a| a.desc_hash.as_deref() == Some(hash.as_str())).count();
        // Unmatched names (e.g. sent with a broadcast before it is mined) are kept, but bounded.
        if n == 0 && !self.names.contains_key(&hash) && self.names.len() >= 20_000 {
            return None;
        }
        self.names.insert(hash.clone(), name);
        Some((hash, n))
    }
}
