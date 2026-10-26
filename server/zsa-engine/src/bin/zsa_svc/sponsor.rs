//! The sponsor wallet: one Orchard account that follows the methyl chain from compact blocks,
//! keeps incremental witnesses for its unspent ZEC notes, and plans drip transactions.
//! State is a small JSON file (tree frontier, notes, witnesses) in the data dir.

use std::{io::Cursor, path::PathBuf};

use incrementalmerkletree::{frontier::CommitmentTree, witness::IncrementalWitness};
use orchard::{
    note::{AssetBase, RandomSeed, Rho},
    tree::{MerkleHashOrchard, MerklePath},
    value::NoteValue,
    Address, Note,
};
use serde::{Deserialize, Serialize};
use zapp_zsa_engine::{conventional_fee, try_compact, Keys};
use zcash_primitives::merkle_tree::{
    read_commitment_tree, read_incremental_witness, write_commitment_tree, write_incremental_witness,
};

use super::{
    chain::{tx_leaves, Leaf},
    lwd::pb,
};

pub type Tree = CommitmentTree<MerkleHashOrchard, 32>;
pub type Witness = IncrementalWitness<MerkleHashOrchard, 32>;

/// Blocks after which an unconfirmed drip's inputs are considered free again (builder expiry is
/// target + 40).
const PENDING_RELEASE: u32 = 60;

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct Pending {
    pub txid: String,
    pub at: u32,
}

pub struct WNote {
    pub note: Note,
    pub pos: u64,
    pub height: u32,
    pub nf: [u8; 32],
    pub witness: Option<Witness>,
    pub spent: Option<u32>,
    pub pending: Option<Pending>,
}

#[derive(Serialize, Deserialize)]
struct NoteFile {
    recipient: String,
    value: u64,
    asset: String,
    rho: String,
    rseed: String,
    pos: u64,
    height: u32,
    nf: String,
    witness: Option<String>,
    spent: Option<u32>,
    pending: Option<Pending>,
}

#[derive(Serialize, Deserialize)]
struct StateFile {
    birthday: u32,
    synced: u32,
    last_hash: String,
    tree: String,
    notes: Vec<NoteFile>,
}

pub struct Wallet {
    pub birthday: u32,
    pub synced: u32,
    last_hash: Vec<u8>,
    tree: Tree,
    pub notes: Vec<WNote>,
    path: PathBuf,
}

pub enum PlanError {
    /// Not enough spendable now, but unconfirmed change may cover it later.
    Wait,
    Refuse(String),
}

pub struct Plan {
    pub anchor: orchard::Anchor,
    pub spends: Vec<(Note, MerklePath)>,
    pub outputs: Vec<(Address, AssetBase, u64)>,
    pub fee: u64,
    pub nfs: Vec<[u8; 32]>,
    pub target_height: u32,
}

fn tree_hex(t: &Tree) -> String {
    let mut v = vec![];
    write_commitment_tree(t, &mut v).expect("vec");
    hex::encode(v)
}
fn witness_hex(w: &Witness) -> String {
    let mut v = vec![];
    write_incremental_witness(w, &mut v).expect("vec");
    hex::encode(v)
}
fn arr32(s: &str) -> Result<[u8; 32], String> {
    hex::decode(s).map_err(|e| e.to_string())?.try_into().map_err(|_| "expected 32 bytes".to_string())
}

pub fn fee_for(spends: usize, outputs: usize, mult: u64) -> u64 {
    mult * conventional_fee(spends.max(outputs), 0)
}

impl Wallet {
    pub fn new(birthday: u32, tree_state_hex: &str, last_hash: Vec<u8>, path: PathBuf) -> Result<Self, String> {
        let tree = if tree_state_hex.is_empty() { Tree::empty() } else { zapp_zsa_engine::tree_from_hex(tree_state_hex)? };
        Ok(Wallet { birthday, synced: birthday, last_hash, tree, notes: vec![], path })
    }

    pub fn load(path: PathBuf) -> Result<Option<Self>, String> {
        let s = match std::fs::read_to_string(&path) {
            Ok(s) => s,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
            Err(e) => return Err(e.to_string()),
        };
        let f: StateFile = serde_json::from_str(&s).map_err(|e| format!("{}: {e}", path.display()))?;
        let tree = read_commitment_tree::<MerkleHashOrchard, _, 32>(Cursor::new(hex::decode(&f.tree).map_err(|e| e.to_string())?))
            .map_err(|e| e.to_string())?;
        let mut notes = vec![];
        for n in f.notes {
            let rb: [u8; 43] = hex::decode(&n.recipient).map_err(|e| e.to_string())?.try_into().map_err(|_| "recipient")?;
            let recipient = Option::<Address>::from(Address::from_raw_address_bytes(&rb)).ok_or("recipient")?;
            let asset = Option::<AssetBase>::from(AssetBase::from_bytes(&arr32(&n.asset)?)).ok_or("asset")?;
            let rho = Option::<Rho>::from(Rho::from_bytes(&arr32(&n.rho)?)).ok_or("rho")?;
            let rseed = Option::<RandomSeed>::from(RandomSeed::from_bytes(arr32(&n.rseed)?, &rho)).ok_or("rseed")?;
            let note = Option::<Note>::from(Note::from_parts(recipient, NoteValue::from_raw(n.value), asset, rho, rseed)).ok_or("note")?;
            let witness = match n.witness {
                Some(w) => Some(
                    read_incremental_witness::<MerkleHashOrchard, _, 32>(Cursor::new(hex::decode(w).map_err(|e| e.to_string())?))
                        .map_err(|e| e.to_string())?,
                ),
                None => None,
            };
            notes.push(WNote { note, pos: n.pos, height: n.height, nf: arr32(&n.nf)?, witness, spent: n.spent, pending: n.pending });
        }
        Ok(Some(Wallet {
            birthday: f.birthday,
            synced: f.synced,
            last_hash: hex::decode(&f.last_hash).map_err(|e| e.to_string())?,
            tree,
            notes,
            path,
        }))
    }

    pub fn save(&self) -> Result<(), String> {
        let f = StateFile {
            birthday: self.birthday,
            synced: self.synced,
            last_hash: hex::encode(&self.last_hash),
            tree: tree_hex(&self.tree),
            notes: self
                .notes
                .iter()
                .map(|n| NoteFile {
                    recipient: hex::encode(n.note.recipient().to_raw_address_bytes()),
                    value: n.note.value().inner(),
                    asset: hex::encode(n.note.asset().to_bytes()),
                    rho: hex::encode(n.note.rho().to_bytes()),
                    rseed: hex::encode(n.note.rseed().as_bytes()),
                    pos: n.pos,
                    height: n.height,
                    nf: hex::encode(n.nf),
                    witness: n.witness.as_ref().map(witness_hex),
                    spent: n.spent,
                    pending: n.pending.clone(),
                })
                .collect(),
        };
        super::write_atomic(&self.path, serde_json::to_string(&f).map_err(|e| e.to_string())?.as_bytes())
    }

    /// Applies the next block. Err("reorg") when it does not extend our chain.
    pub fn apply_block(&mut self, keys: &Keys, b: &pb::CompactBlock) -> Result<(), String> {
        let h = b.height as u32;
        if h != self.synced + 1 {
            return Err(format!("expected block {}, got {h}", self.synced + 1));
        }
        if !self.last_hash.is_empty() && b.prev_hash != self.last_hash {
            return Err("reorg".into());
        }
        let me = keys.address();
        for tx in &b.vtx {
            for a in &tx.actions {
                if let Some(n) = self.notes.iter_mut().find(|n| n.spent.is_none() && n.nf.as_slice() == a.nullifier.as_slice()) {
                    n.spent = Some(h);
                    n.pending = None;
                    n.witness = None;
                }
            }
            for leaf in tx_leaves(tx)? {
                let (l, mine) = match leaf {
                    Leaf::Action(a, l) => {
                        (l, try_compact(keys, &a.nullifier, &a.cmx, &a.ephemeral_key, &a.ciphertext))
                    }
                    Leaf::Issued(note, l) => (l, if note.recipient() == me { Some(note) } else { None }),
                };
                self.tree.append(l).map_err(|_| "tree full")?;
                for n in self.notes.iter_mut() {
                    if let Some(w) = n.witness.as_mut() {
                        w.append(l).map_err(|_| "tree full")?;
                    }
                }
                if let Some(note) = mine {
                    if bool::from(note.asset().is_zatoshi()) && note.value().inner() > 0 {
                        let witness = Witness::from_tree(self.tree.clone()).ok_or("empty tree")?;
                        self.notes.push(WNote {
                            pos: self.tree.size() as u64 - 1,
                            height: h,
                            nf: note.nullifier(&keys.fvk).to_bytes(),
                            note,
                            witness: Some(witness),
                            spent: None,
                            pending: None,
                        });
                    }
                }
            }
        }
        if let Some(m) = &b.chain_metadata {
            if m.orchard_commitment_tree_size as usize != self.tree.size() {
                return Err(format!(
                    "orchard tree size mismatch at {h}: ours {} vs node {}",
                    self.tree.size(),
                    m.orchard_commitment_tree_size
                ));
            }
        }
        for n in self.notes.iter_mut() {
            if let Some(p) = &n.pending {
                if n.spent.is_none() && h > p.at + PENDING_RELEASE {
                    n.pending = None;
                }
            }
        }
        // Forget long-spent notes.
        self.notes.retain(|n| n.spent.map_or(true, |s| s + 1000 > h));
        self.synced = h;
        self.last_hash = b.hash.clone();
        Ok(())
    }

    fn spendable_notes(&self) -> Vec<&WNote> {
        let mut v: Vec<&WNote> = self
            .notes
            .iter()
            .filter(|n| n.spent.is_none() && n.pending.is_none() && n.witness.is_some())
            .collect();
        v.sort_by_key(|n| std::cmp::Reverse(n.note.value().inner()));
        v
    }

    pub fn balance(&self) -> u64 {
        self.notes.iter().filter(|n| n.spent.is_none()).map(|n| n.note.value().inner()).sum()
    }
    pub fn spendable(&self) -> u64 {
        self.spendable_notes().iter().map(|n| n.note.value().inner()).sum()
    }
    pub fn pending_value(&self) -> u64 {
        self.notes.iter().filter(|n| n.spent.is_none() && n.pending.is_some()).map(|n| n.note.value().inner()).sum()
    }

    /// Drip `amount` ZEC to `to`. When few spendable notes remain, the change is split into
    /// several notes so queued drips do not each wait a block for the previous change.
    pub fn plan_drip(&self, keys: &Keys, to: Address, amount: u64, fee_mult: u64) -> Result<Plan, PlanError> {
        let avail = self.spendable_notes();
        let change_count = if avail.len() <= 2 { 3 } else { 1 };
        let mut sel: Vec<&WNote> = vec![];
        let mut sum = 0u64;
        let mut fee = fee_for(1, 1 + change_count, fee_mult);
        for n in &avail {
            if sum >= amount + fee {
                break;
            }
            sel.push(n);
            sum += n.note.value().inner();
            fee = fee_for(sel.len(), 1 + change_count, fee_mult);
        }
        if sum < amount + fee {
            if self.pending_value() > 0 {
                return Err(PlanError::Wait);
            }
            return Err(PlanError::Refuse(format!(
                "sponsor wallet is low: spendable {} zat, need {} zat",
                sum,
                amount + fee
            )));
        }
        // Fewer change parts never raise the fee, so the change stays non-negative.
        let rough = sum - amount - fee;
        let parts = if rough >= change_count as u64 * 2 * amount { change_count } else { 1 };
        let fee = fee_for(sel.len(), 1 + parts, fee_mult);
        let change = sum - amount - fee;
        let me = keys.address();
        let zec = AssetBase::zatoshi();
        let mut outputs = vec![(to, zec, amount)];
        if change > 0 {
            let each = change / parts as u64;
            for i in 0..parts {
                let v = if i + 1 == parts { change - each * (parts as u64 - 1) } else { each };
                outputs.push((me, zec, v));
            }
        }
        let root = self.tree.root();
        let mut spends = vec![];
        for n in &sel {
            let w = n.witness.as_ref().unwrap();
            if w.root() != root {
                return Err(PlanError::Refuse("witness out of sync with tree".into()));
            }
            spends.push((n.note, MerklePath::from(w.path().ok_or(PlanError::Refuse("no witness path".into()))?)));
        }
        Ok(Plan {
            anchor: orchard::Anchor::from(root),
            spends,
            outputs,
            fee,
            nfs: sel.iter().map(|n| n.nf).collect(),
            target_height: self.synced + 1,
        })
    }

    pub fn mark_pending(&mut self, nfs: &[[u8; 32]], txid: &str, at: u32) {
        for n in self.notes.iter_mut() {
            if nfs.contains(&n.nf) {
                n.pending = Some(Pending { txid: txid.to_string(), at });
            }
        }
    }
}
