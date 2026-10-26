//! A small in-memory ZSA wallet for one seed (the ZStreet ZSA Lab "burner"): compact-block
//! sync from a birthday (frontier from a tree state, trial decryption of ZEC and ZSA notes,
//! issued notes from CompactIssuance, spend detection, witnesses kept for our notes), and
//! issue / transfer / burn / finalize transactions built, proven and signed in-process, fee in
//! ZEC, change back to ourselves per asset. The state round-trips through bytes (`to_bytes`/
//! `from_bytes`); the seed is never part of it.

use std::collections::BTreeMap;
use std::io::{Cursor, Read};

use incrementalmerkletree::{frontier::CommitmentTree, witness::IncrementalWitness};
use orchard::{
    issuance::{auth::{IssueValidatingKey, ZSASchnorr}, compute_asset_desc_hash},
    keys::Scope,
    note::{AssetBase, AssetId, ExtractedNoteCommitment, Nullifier, RandomSeed, Rho},
    tree::{MerkleHashOrchard, MerklePath},
    value::NoteValue,
    Address, Note,
};
use zcash_primitives::merkle_tree::{read_commitment_tree, read_incremental_witness, write_commitment_tree, write_incremental_witness};

use crate::{build_tx_burn, e, tree_from_hex, tx_bytes, Error, IssueReq, Keys};

type Tree = CommitmentTree<MerkleHashOrchard, 32>;
type Witness = IncrementalWitness<MerkleHashOrchard, 32>;

/// ZIP 317 marginal fee, and a factor on top. The methyl chain accepts exactly
/// 5000 × (max(2, actions) + issued notes): issuances seen there pay 20000 for 2 actions + 2 notes.
pub const MARGINAL_FEE: u64 = 5_000;
pub const FEE_FACTOR: u64 = 1;
/// Transactions not mined by `expiry` are dropped by nodes; their notes come back.
const MAGIC: &[u8; 4] = b"ZSW1";

#[derive(Clone)]
struct WNote {
    note: Note,
    nf: [u8; 32],
    height: u32,
    witness: Option<Witness>,
    spent: u32,                  // height of the spending block, 0 = unspent
    locked: Option<[u8; 32]>,    // txid (internal order) of our pending spend
}

#[derive(Clone)]
pub struct TxRec {
    pub txid: [u8; 32], // internal byte order (as in compact blocks)
    pub kind: u8,       // 0 issue, 1 transfer, 2 burn, 3 finalize, 4 incoming (drip)
    pub asset: [u8; 32],
    pub amount: u64,
    pub fee: u64,
    pub created: u32,
    pub expiry: u32,
    pub mined: u32,
    /// What comes back to us when mined (change, issued to self): (asset, amount).
    pub incoming: Vec<([u8; 32], u64)>,
    nfs: Vec<[u8; 32]>,
}

const KINDS: [&str; 5] = ["issue", "transfer", "burn", "finalize", "incoming"];

#[derive(Clone, Default)]
struct OwnAsset {
    desc: Vec<u8>,
    issued_on_chain: bool,
    finalized: bool,
}

#[derive(Clone)]
pub struct Wallet {
    keys: Keys,
    pub birthday: u32,
    pub scanned: u32,
    last_hash: Vec<u8>,
    tree: Tree,
    notes: Vec<WNote>,
    own: BTreeMap<[u8; 32], OwnAsset>,
    txs: Vec<TxRec>,
    staged: Vec<TxRec>,
}

/// What one batch of blocks changed.
#[derive(Default, Debug)]
pub struct ScanReport {
    pub blocks: u32,
    pub received: u32,
    pub spent: u32,
    pub mined: Vec<String>,
    pub reorg: bool,
}

pub struct Built {
    pub tx_hex: String,
    pub txid: String,
    pub asset_id: String,
    pub fee: u64,
    pub expiry: u32,
}

fn txid_hex(internal: &[u8; 32]) -> String {
    let mut b = *internal;
    b.reverse();
    hex::encode(b)
}

fn parse_txid(display_hex: &str) -> Result<[u8; 32], Error> {
    let mut b: [u8; 32] = hex::decode(display_hex).map_err(e)?.try_into().map_err(|_| "txid length")?;
    b.reverse();
    Ok(b)
}

pub fn parse_asset(hex_id: &str) -> Result<AssetBase, Error> {
    let s = hex_id.trim();
    if s.is_empty() || s.eq_ignore_ascii_case("zec") {
        return Ok(AssetBase::zatoshi());
    }
    let b: [u8; 32] = hex::decode(s).map_err(e)?.try_into().map_err(|_| "asset id: 32 bytes hex")?;
    Option::from(AssetBase::from_bytes(&b)).ok_or_else(|| "asset id: not a valid asset base".into())
}

fn is_zec(a: &[u8; 32]) -> bool {
    *a == AssetBase::zatoshi().to_bytes()
}

// ---- minimal protobuf reader (CompactBlock and friends) ----

struct Pb<'a> {
    b: &'a [u8],
    i: usize,
}

impl<'a> Pb<'a> {
    fn new(b: &'a [u8]) -> Self {
        Pb { b, i: 0 }
    }
    fn varint(&mut self) -> Result<u64, Error> {
        let mut v = 0u64;
        for s in 0..10 {
            let x = *self.b.get(self.i).ok_or("protobuf: truncated varint")?;
            self.i += 1;
            v |= ((x & 0x7f) as u64) << (7 * s);
            if x & 0x80 == 0 {
                return Ok(v);
            }
        }
        Err("protobuf: bad varint".into())
    }
    /// Next (field, value): value is Ok(varint) or Err(bytes) for length-delimited fields.
    #[allow(clippy::type_complexity)]
    fn next(&mut self) -> Result<Option<(u64, Result<u64, &'a [u8]>)>, Error> {
        if self.i >= self.b.len() {
            return Ok(None);
        }
        let key = self.varint()?;
        let (field, wt) = (key >> 3, key & 7);
        let v = match wt {
            0 => Ok(self.varint()?),
            1 => {
                self.i += 8;
                Ok(0)
            }
            5 => {
                self.i += 4;
                Ok(0)
            }
            2 => {
                let n = self.varint()? as usize;
                let s = self.b.get(self.i..self.i + n).ok_or("protobuf: truncated field")?;
                self.i += n;
                Err(s)
            }
            _ => return Err(format!("protobuf: wire type {wt}")),
        };
        if self.i > self.b.len() {
            return Err("protobuf: truncated".into());
        }
        Ok(Some((field, v)))
    }
}

#[derive(Default)]
struct CAction<'a> {
    nf: &'a [u8],
    cmx: &'a [u8],
    epk: &'a [u8],
    ct: &'a [u8],
}

#[derive(Default)]
struct CIssueNote<'a> {
    recipient: &'a [u8],
    value: u64,
    rho: &'a [u8],
    rseed: &'a [u8],
}

#[derive(Default)]
struct CIssuance<'a> {
    desc_hash: &'a [u8],
    finalize: bool,
    ik: &'a [u8],
    notes: Vec<CIssueNote<'a>>,
}

#[derive(Default)]
struct CTx<'a> {
    txid: &'a [u8],
    actions: Vec<CAction<'a>>,
    issuances: Vec<CIssuance<'a>>,
}

#[derive(Default)]
struct CBlock<'a> {
    height: u32,
    hash: &'a [u8],
    prev_hash: &'a [u8],
    txs: Vec<CTx<'a>>,
    orchard_tree_size: Option<u32>,
}

fn parse_block(b: &[u8]) -> Result<CBlock<'_>, Error> {
    let mut out = CBlock::default();
    let mut p = Pb::new(b);
    while let Some((f, v)) = p.next()? {
        match (f, v) {
            (2, Ok(h)) => out.height = h as u32,
            (3, Err(x)) => out.hash = x,
            (4, Err(x)) => out.prev_hash = x,
            (7, Err(x)) => out.txs.push(parse_tx(x)?),
            (8, Err(x)) => {
                let mut q = Pb::new(x);
                while let Some((f, v)) = q.next()? {
                    if let (2, Ok(n)) = (f, v) {
                        out.orchard_tree_size = Some(n as u32);
                    }
                }
                out.orchard_tree_size.get_or_insert(0);
            }
            _ => {}
        }
    }
    Ok(out)
}

fn parse_tx(b: &[u8]) -> Result<CTx<'_>, Error> {
    let mut t = CTx::default();
    let mut p = Pb::new(b);
    while let Some((f, v)) = p.next()? {
        match (f, v) {
            (2, Err(x)) => t.txid = x,
            (6, Err(x)) => {
                let mut a = CAction::default();
                let mut q = Pb::new(x);
                while let Some((f, v)) = q.next()? {
                    match (f, v) {
                        (1, Err(y)) => a.nf = y,
                        (2, Err(y)) => a.cmx = y,
                        (3, Err(y)) => a.epk = y,
                        (4, Err(y)) => a.ct = y,
                        _ => {}
                    }
                }
                t.actions.push(a);
            }
            (10, Err(x)) => {
                let mut is = CIssuance::default();
                let mut q = Pb::new(x);
                while let Some((f, v)) = q.next()? {
                    match (f, v) {
                        (1, Err(y)) => is.desc_hash = y,
                        (2, Ok(y)) => is.finalize = y != 0,
                        (3, Err(y)) => is.ik = y,
                        (5, Err(y)) => {
                            let mut n = CIssueNote::default();
                            let mut r = Pb::new(y);
                            while let Some((f, v)) = r.next()? {
                                match (f, v) {
                                    (1, Err(z)) => n.recipient = z,
                                    (2, Ok(z)) => n.value = z,
                                    (3, Err(z)) => n.rho = z,
                                    (4, Err(z)) => n.rseed = z,
                                    _ => {}
                                }
                            }
                            is.notes.push(n);
                        }
                        _ => {}
                    }
                }
                t.issuances.push(is);
            }
            _ => {}
        }
    }
    Ok(t)
}

/// Splits the service's block stream: each CompactBlock prefixed by its u32 big-endian length.
pub fn split_blocks(stream: &[u8]) -> Result<Vec<&[u8]>, Error> {
    let mut out = vec![];
    let mut i = 0;
    while i < stream.len() {
        let n = u32::from_be_bytes(stream.get(i..i + 4).ok_or("block stream: truncated length")?.try_into().unwrap()) as usize;
        out.push(stream.get(i + 4..i + 4 + n).ok_or("block stream: truncated block")?);
        i += 4 + n;
    }
    Ok(out)
}

/// Vanilla Orchard compact actions (52-byte ciphertexts, v5 transactions).
fn try_compact_vanilla(keys: &Keys, nf: &[u8], cmx: &[u8], epk: &[u8], ct: &[u8]) -> Option<Note> {
    use orchard::{flavor::OrchardVanilla, primitives::{CompactAction, OrchardDomain, OrchardPrimitives}};
    use zcash_note_encryption::{note_bytes::NoteBytes, try_compact_note_decryption, EphemeralKeyBytes};
    let ct = <<OrchardVanilla as OrchardPrimitives>::CompactNoteCiphertextBytes as NoteBytes>::from_slice(ct)?;
    let nf = Option::from(Nullifier::from_bytes(&nf.try_into().ok()?))?;
    let cmx = Option::from(ExtractedNoteCommitment::from_bytes(&cmx.try_into().ok()?))?;
    let act = CompactAction::<OrchardVanilla>::from_parts(nf, cmx, EphemeralKeyBytes(epk.try_into().ok()?), ct);
    let ivk = keys.fvk.to_ivk(Scope::External).prepare();
    try_compact_note_decryption(&OrchardDomain::for_compact_action(&act), &ivk, &act).map(|(n, _)| n)
}

fn issued_note(n: &CIssueNote, asset: AssetBase) -> Option<Note> {
    let recipient = Option::from(Address::from_raw_address_bytes(&n.recipient.try_into().ok()?))?;
    let rho = Option::from(Rho::from_bytes(&n.rho.try_into().ok()?))?;
    let rseed = Option::from(RandomSeed::from_bytes(n.rseed.try_into().ok()?, &rho))?;
    Option::from(Note::from_parts(recipient, NoteValue::from_raw(n.value), asset, rho, rseed))
}

fn issuance_asset(is: &CIssuance) -> Option<AssetBase> {
    let ik = match is.ik.len() {
        33 => IssueValidatingKey::<ZSASchnorr>::decode(is.ik).ok()?,
        32 => IssueValidatingKey::<ZSASchnorr>::from_bytes(&is.ik.try_into().ok()?)?,
        _ => return None,
    };
    Some(AssetBase::custom(&AssetId::new_v0(&ik, &is.desc_hash.try_into().ok()?)))
}

// ---- byte serialization helpers ----

fn w_u32(w: &mut Vec<u8>, v: u32) {
    w.extend_from_slice(&v.to_le_bytes());
}
fn w_u64(w: &mut Vec<u8>, v: u64) {
    w.extend_from_slice(&v.to_le_bytes());
}
fn w_bytes(w: &mut Vec<u8>, b: &[u8]) {
    w_u32(w, b.len() as u32);
    w.extend_from_slice(b);
}
fn r_u32(r: &mut Cursor<&[u8]>) -> Result<u32, Error> {
    let mut b = [0u8; 4];
    r.read_exact(&mut b).map_err(e)?;
    Ok(u32::from_le_bytes(b))
}
fn r_u64(r: &mut Cursor<&[u8]>) -> Result<u64, Error> {
    let mut b = [0u8; 8];
    r.read_exact(&mut b).map_err(e)?;
    Ok(u64::from_le_bytes(b))
}
fn r_32(r: &mut Cursor<&[u8]>) -> Result<[u8; 32], Error> {
    let mut b = [0u8; 32];
    r.read_exact(&mut b).map_err(e)?;
    Ok(b)
}
fn r_bytes(r: &mut Cursor<&[u8]>) -> Result<Vec<u8>, Error> {
    let n = r_u32(r)? as usize;
    if n > 1 << 24 {
        return Err("state: bad length".into());
    }
    let mut b = vec![0u8; n];
    r.read_exact(&mut b).map_err(e)?;
    Ok(b)
}

fn note_bytes(n: &Note) -> Vec<u8> {
    let mut v = Vec::with_capacity(147);
    v.extend_from_slice(&n.recipient().to_raw_address_bytes());
    v.extend_from_slice(&n.value().inner().to_le_bytes());
    v.extend_from_slice(&n.asset().to_bytes());
    v.extend_from_slice(&n.rho().to_bytes());
    v.extend_from_slice(n.rseed().as_bytes());
    v
}

fn note_from_bytes(b: &[u8]) -> Result<Note, Error> {
    if b.len() != 147 {
        return Err("state: note length".into());
    }
    let recipient = Option::from(Address::from_raw_address_bytes(&b[0..43].try_into().unwrap())).ok_or("state: note address")?;
    let value = NoteValue::from_raw(u64::from_le_bytes(b[43..51].try_into().unwrap()));
    let asset = Option::from(AssetBase::from_bytes(&b[51..83].try_into().unwrap())).ok_or("state: note asset")?;
    let rho = Option::from(Rho::from_bytes(&b[83..115].try_into().unwrap())).ok_or("state: note rho")?;
    let rseed = Option::from(RandomSeed::from_bytes(b[115..147].try_into().unwrap(), &rho)).ok_or("state: note rseed")?;
    Option::from(Note::from_parts(recipient, value, asset, rho, rseed)).ok_or_else(|| "state: note".into())
}

impl Wallet {
    /// A new wallet born at `birthday`: `orchard_tree_hex` is the Orchard tree state at
    /// `birthday - 1` (the `orchardTree` of GetTreeState / the service's treestate).
    pub fn new(seed: &[u8], birthday: u32, orchard_tree_hex: &str) -> Result<Self, Error> {
        let tree = if orchard_tree_hex.is_empty() { Tree::empty() } else { tree_from_hex(orchard_tree_hex)? };
        Ok(Wallet {
            keys: Keys::from_seed(seed)?,
            birthday,
            scanned: birthday.saturating_sub(1),
            last_hash: vec![],
            tree,
            notes: vec![],
            own: BTreeMap::new(),
            txs: vec![],
            staged: vec![],
        })
    }

    pub fn keys(&self) -> &Keys {
        &self.keys
    }

    pub fn address(&self) -> Address {
        self.keys.address()
    }

    pub fn tree_size(&self) -> usize {
        self.tree.size()
    }

    pub fn anchor(&self) -> orchard::Anchor {
        orchard::Anchor::from(self.tree.root())
    }

    // ---- persistence ----

    pub fn to_bytes(&self) -> Vec<u8> {
        let mut w = MAGIC.to_vec();
        w_u32(&mut w, self.birthday);
        w_u32(&mut w, self.scanned);
        w_bytes(&mut w, &self.last_hash);
        let mut t = vec![];
        write_commitment_tree(&self.tree, &mut t).expect("vec");
        w_bytes(&mut w, &t);
        w_u32(&mut w, self.notes.len() as u32);
        for n in &self.notes {
            w.extend_from_slice(&note_bytes(&n.note));
            w.extend_from_slice(&n.nf);
            w_u32(&mut w, n.height);
            w_u32(&mut w, n.spent);
            match &n.locked {
                Some(id) => {
                    w.push(1);
                    w.extend_from_slice(id);
                }
                None => w.push(0),
            }
            let mut wb = vec![];
            if let Some(wit) = &n.witness {
                write_incremental_witness(wit, &mut wb).expect("vec");
            }
            w_bytes(&mut w, &wb);
        }
        w_u32(&mut w, self.own.len() as u32);
        for (a, o) in &self.own {
            w.extend_from_slice(a);
            w_bytes(&mut w, &o.desc);
            w.push(o.issued_on_chain as u8 | (o.finalized as u8) << 1);
        }
        w_u32(&mut w, self.txs.len() as u32);
        for t in &self.txs {
            w.extend_from_slice(&t.txid);
            w.push(t.kind);
            w.extend_from_slice(&t.asset);
            w_u64(&mut w, t.amount);
            w_u64(&mut w, t.fee);
            w_u32(&mut w, t.created);
            w_u32(&mut w, t.expiry);
            w_u32(&mut w, t.mined);
            w_u32(&mut w, t.incoming.len() as u32);
            for (a, v) in &t.incoming {
                w.extend_from_slice(a);
                w_u64(&mut w, *v);
            }
            w_u32(&mut w, t.nfs.len() as u32);
            for nf in &t.nfs {
                w.extend_from_slice(nf);
            }
        }
        w
    }

    pub fn from_bytes(seed: &[u8], b: &[u8]) -> Result<Self, Error> {
        if b.len() < 4 || &b[..4] != MAGIC {
            return Err("state: unknown format".into());
        }
        let mut r = Cursor::new(b);
        r.set_position(4);
        let birthday = r_u32(&mut r)?;
        let scanned = r_u32(&mut r)?;
        let last_hash = r_bytes(&mut r)?;
        let tree = read_commitment_tree::<MerkleHashOrchard, _, 32>(Cursor::new(r_bytes(&mut r)?)).map_err(e)?;
        let mut notes = vec![];
        for _ in 0..r_u32(&mut r)? {
            let mut nb = [0u8; 147];
            r.read_exact(&mut nb).map_err(e)?;
            let note = note_from_bytes(&nb)?;
            let nf = r_32(&mut r)?;
            let height = r_u32(&mut r)?;
            let spent = r_u32(&mut r)?;
            let mut flag = [0u8; 1];
            r.read_exact(&mut flag).map_err(e)?;
            let locked = if flag[0] == 1 { Some(r_32(&mut r)?) } else { None };
            let wb = r_bytes(&mut r)?;
            let witness = if wb.is_empty() { None } else { Some(read_incremental_witness::<MerkleHashOrchard, _, 32>(Cursor::new(wb)).map_err(e)?) };
            notes.push(WNote { note, nf, height, witness, spent, locked });
        }
        let mut own = BTreeMap::new();
        for _ in 0..r_u32(&mut r)? {
            let a = r_32(&mut r)?;
            let desc = r_bytes(&mut r)?;
            let mut f = [0u8; 1];
            r.read_exact(&mut f).map_err(e)?;
            own.insert(a, OwnAsset { desc, issued_on_chain: f[0] & 1 != 0, finalized: f[0] & 2 != 0 });
        }
        let mut txs = vec![];
        for _ in 0..r_u32(&mut r)? {
            let txid = r_32(&mut r)?;
            let mut k = [0u8; 1];
            r.read_exact(&mut k).map_err(e)?;
            let asset = r_32(&mut r)?;
            let amount = r_u64(&mut r)?;
            let fee = r_u64(&mut r)?;
            let created = r_u32(&mut r)?;
            let expiry = r_u32(&mut r)?;
            let mined = r_u32(&mut r)?;
            let mut incoming = vec![];
            for _ in 0..r_u32(&mut r)? {
                incoming.push((r_32(&mut r)?, r_u64(&mut r)?));
            }
            let mut nfs = vec![];
            for _ in 0..r_u32(&mut r)? {
                nfs.push(r_32(&mut r)?);
            }
            txs.push(TxRec { txid, kind: k[0], asset, amount, fee, created, expiry, mined, incoming, nfs });
        }
        let keys = Keys::from_seed(seed)?;
        Ok(Wallet { keys, birthday, scanned, last_hash, tree, notes, own, txs, staged: vec![] })
    }

    // ---- sync ----

    /// Scans a stream of length-prefixed CompactBlocks that must start at `scanned + 1`.
    /// On a chain mismatch (reorg) nothing is applied and `reorg` is set: the caller starts
    /// over from the birthday (a fresh wallet from the same seed).
    pub fn scan_stream(&mut self, stream: &[u8]) -> Result<ScanReport, Error> {
        let blocks = split_blocks(stream)?;
        let mut rep = ScanReport::default();
        // Work on a copy so a failure in the middle leaves the wallet as it was.
        let mut next = self.clone();
        for b in blocks {
            let blk = parse_block(b)?;
            if blk.height != next.scanned + 1 {
                return Err(format!("block {} out of order (expected {})", blk.height, next.scanned + 1));
            }
            if !next.last_hash.is_empty() && blk.prev_hash != next.last_hash.as_slice() {
                rep.reorg = true;
                return Ok(rep);
            }
            next.scan_block(&blk, &mut rep)?;
            rep.blocks += 1;
        }
        *self = next;
        Ok(rep)
    }

    fn append(&mut self, leaf: MerkleHashOrchard) -> Result<(), Error> {
        self.tree.append(leaf).map_err(|_| "tree full")?;
        for n in self.notes.iter_mut() {
            if let Some(w) = n.witness.as_mut() {
                w.append(leaf).map_err(|_| "witness full")?;
            }
        }
        Ok(())
    }

    fn receive(&mut self, note: Note, height: u32, rep: &mut ScanReport) -> Result<(), Error> {
        // Zero-value notes (padding, issuance reference notes) are never worth keeping.
        if note.value().inner() > 0 {
            let nf = note.nullifier(&self.keys.fvk).to_bytes();
            let witness = Some(Witness::from_tree(self.tree.clone()).ok_or("empty tree")?);
            rep.received += 1;
            self.notes.push(WNote { note, nf, height, witness, spent: 0, locked: None });
        }
        Ok(())
    }

    fn scan_block(&mut self, blk: &CBlock, rep: &mut ScanReport) -> Result<(), Error> {
        let h = blk.height;
        let me = self.keys.address();
        let my_ik = self.keys.ik().to_bytes();
        for tx in &blk.txs {
            for a in &tx.actions {
                if let Some(n) = self.notes.iter_mut().find(|n| n.spent == 0 && n.nf == a.nf) {
                    n.spent = h;
                    n.witness = None;
                    rep.spent += 1;
                }
                let cmx: [u8; 32] = a.cmx.try_into().map_err(|_| "compact action: cmx length")?;
                let cmx = Option::from(ExtractedNoteCommitment::from_bytes(&cmx)).ok_or("compact action: bad cmx")?;
                self.append(MerkleHashOrchard::from_cmx(&cmx))?;
                let found = if a.ct.len() == 52 {
                    try_compact_vanilla(&self.keys, a.nf, a.cmx, a.epk, a.ct)
                } else {
                    crate::try_compact(&self.keys, a.nf, a.cmx, a.epk, a.ct)
                };
                if let Some(note) = found {
                    self.receive(note, h, rep)?;
                }
            }
            for is in &tx.issuances {
                let asset = issuance_asset(is).ok_or("compact issuance: bad ik or asset")?;
                if is.ik.ends_with(&my_ik) {
                    let o = self.own.entry(asset.to_bytes()).or_default();
                    o.issued_on_chain = true;
                    o.finalized |= is.finalize;
                }
                for n in &is.notes {
                    let note = issued_note(n, asset).ok_or("compact issuance: bad note")?;
                    let cmx = ExtractedNoteCommitment::from(note.commitment());
                    self.append(MerkleHashOrchard::from_cmx(&cmx))?;
                    if note.recipient() == me {
                        self.receive(note, h, rep)?;
                    }
                }
            }
            if tx.txid.len() == 32 {
                if let Some(t) = self.txs.iter_mut().find(|t| t.mined == 0 && t.txid == tx.txid) {
                    t.mined = h;
                    rep.mined.push(txid_hex(&t.txid));
                }
            }
        }
        if let Some(size) = blk.orchard_tree_size {
            if size as usize != self.tree.size() && size != 0 {
                return Err(format!("block {h}: tree size {} differs from the chain's {size}", self.tree.size()));
            }
        }
        // Pending spends past their expiry are dropped by nodes: unlock their notes.
        for t in self.txs.iter() {
            if t.mined == 0 && t.expiry != 0 && h >= t.expiry {
                for n in self.notes.iter_mut() {
                    if n.locked == Some(t.txid) && n.spent == 0 {
                        n.locked = None;
                    }
                }
            }
        }
        self.scanned = h;
        self.last_hash = blk.hash.to_vec();
        Ok(())
    }

    // ---- balances ----

    fn tx_status(&self, t: &TxRec) -> &'static str {
        if t.mined != 0 {
            "mined"
        } else if t.expiry != 0 && self.scanned >= t.expiry {
            "expired"
        } else {
            "pending"
        }
    }

    /// JSON: { zec_zat, zec_pending_zat, assets:[{asset_id, name, units, pending, issuer, finalized}], scanned }
    pub fn balances_json(&self) -> String {
        let zec = AssetBase::zatoshi().to_bytes();
        let mut spendable: BTreeMap<[u8; 32], u64> = BTreeMap::new();
        let mut pending: BTreeMap<[u8; 32], u64> = BTreeMap::new();
        let mut locked: BTreeMap<[u8; 32], u64> = BTreeMap::new();
        for n in self.notes.iter().filter(|n| n.spent == 0) {
            let a = n.note.asset().to_bytes();
            let m = if n.locked.is_some() { &mut locked } else { &mut spendable };
            *m.entry(a).or_default() += n.note.value().inner();
        }
        for t in self.txs.iter().filter(|t| self.tx_status(t) == "pending") {
            for (a, v) in &t.incoming {
                *pending.entry(*a).or_default() += v;
            }
        }
        let mut ids: Vec<[u8; 32]> = spendable.keys().chain(pending.keys()).chain(locked.keys()).copied().collect();
        ids.extend(self.own.keys().copied());
        ids.sort();
        ids.dedup();
        let mut assets = vec![];
        for a in ids.iter().filter(|a| **a != zec) {
            let o = self.own.get(a);
            let name = o.map(|o| json_str(&String::from_utf8_lossy(&o.desc))).unwrap_or("null".into());
            assets.push(format!(
                "{{\"asset_id\":\"{}\",\"name\":{},\"units\":{},\"pending\":{},\"locked\":{},\"mine\":{},\"issued\":{},\"finalized\":{}}}",
                hex::encode(a),
                name,
                spendable.get(a).copied().unwrap_or(0),
                pending.get(a).copied().unwrap_or(0),
                locked.get(a).copied().unwrap_or(0),
                o.is_some(),
                o.map_or(false, |o| o.issued_on_chain),
                o.map_or(false, |o| o.finalized),
            ));
        }
        format!(
            "{{\"scanned\":{},\"zec_zat\":{},\"zec_pending_zat\":{},\"zec_locked_zat\":{},\"assets\":[{}]}}",
            self.scanned,
            spendable.get(&zec).copied().unwrap_or(0),
            pending.get(&zec).copied().unwrap_or(0),
            locked.get(&zec).copied().unwrap_or(0),
            assets.join(",")
        )
    }

    /// JSON array of our transactions, newest first.
    pub fn history_json(&self) -> String {
        let items: Vec<String> = self
            .txs
            .iter()
            .rev()
            .map(|t| {
                format!(
                    "{{\"txid\":\"{}\",\"kind\":\"{}\",\"asset_id\":\"{}\",\"amount\":{},\"fee\":{},\"created\":{},\"expiry\":{},\"mined\":{},\"status\":\"{}\"}}",
                    txid_hex(&t.txid),
                    KINDS.get(t.kind as usize).unwrap_or(&"?"),
                    if is_zec(&t.asset) { "zec".to_string() } else { hex::encode(t.asset) },
                    t.amount,
                    t.fee,
                    t.created,
                    t.expiry,
                    t.mined,
                    self.tx_status(t)
                )
            })
            .collect();
        format!("[{}]", items.join(","))
    }

    /// Tracks an incoming transaction (e.g. the drip) so it shows as pending until mined.
    pub fn track_incoming(&mut self, txid_display_hex: &str, asset: &str, amount: u64) -> Result<(), Error> {
        let txid = parse_txid(txid_display_hex)?;
        if self.txs.iter().any(|t| t.txid == txid) {
            return Ok(());
        }
        let a = parse_asset(asset)?.to_bytes();
        self.txs.push(TxRec {
            txid,
            kind: 4,
            asset: a,
            amount,
            fee: 0,
            created: self.scanned + 1,
            expiry: self.scanned + 1 + 100,
            mined: 0,
            incoming: vec![(a, amount)],
            nfs: vec![],
        });
        Ok(())
    }

    /// The asset id our issuance key gives a name.
    pub fn asset_for(&self, name: &str) -> Result<AssetBase, Error> {
        self.keys.asset(name.as_bytes())
    }

    // ---- building ----

    fn spendable(&self, asset: &[u8; 32]) -> Vec<usize> {
        let mut v: Vec<usize> = (0..self.notes.len())
            .filter(|&i| {
                let n = &self.notes[i];
                n.spent == 0 && n.locked.is_none() && n.witness.is_some() && n.note.asset().to_bytes() == *asset
            })
            .collect();
        v.sort_by_key(|&i| std::cmp::Reverse(self.notes[i].note.value().inner()));
        v
    }

    fn pick(&self, asset: &[u8; 32], need: u64) -> Result<(Vec<usize>, u64), Error> {
        let mut got = 0u64;
        let mut out = vec![];
        for i in self.spendable(asset) {
            if got >= need && !out.is_empty() {
                break;
            }
            got += self.notes[i].note.value().inner();
            out.push(i);
        }
        if got < need {
            let what = if is_zec(asset) { "test ZEC for the fee".to_string() } else { "units of this token".to_string() };
            let waiting = self.notes.iter().any(|n| n.spent == 0 && n.locked.is_some() && n.note.asset().to_bytes() == *asset)
                || self.txs.iter().any(|t| t.mined == 0 && self.tx_status(t) == "pending" && t.incoming.iter().any(|(a, _)| a == asset));
            let hint = if waiting { " Your last transaction is still being mined: try again after the next block." } else { "" };
            return Err(format!("Not enough {what}: {got} spendable, {need} needed.{hint}"));
        }
        Ok((out, got))
    }

    /// Builds, proves and signs. The result is staged: `commit(txid)` after a successful
    /// broadcast locks the spent notes and records it as pending.
    #[allow(clippy::too_many_arguments)]
    fn build(
        &mut self,
        target_height: u32,
        outputs: Vec<(Address, AssetBase, u64)>,
        burns: Vec<(AssetBase, u64)>,
        issue: Option<IssueReq>,
        kind: u8,
        rec_asset: AssetBase,
        rec_amount: u64,
    ) -> Result<Built, Error> {
        let zec = AssetBase::zatoshi().to_bytes();
        // Needs per asset (outputs + burns), and output counts per asset (for the fee).
        let mut need: BTreeMap<[u8; 32], u64> = BTreeMap::new();
        let mut outs: BTreeMap<[u8; 32], usize> = BTreeMap::new();
        for (_, a, v) in &outputs {
            *need.entry(a.to_bytes()).or_default() += v;
            *outs.entry(a.to_bytes()).or_default() += 1;
        }
        for (a, v) in &burns {
            *need.entry(a.to_bytes()).or_default() += v;
        }
        let mut picks: BTreeMap<[u8; 32], (Vec<usize>, u64)> = BTreeMap::new();
        for (a, v) in &need {
            if *a != zec {
                picks.insert(*a, self.pick(a, *v)?);
            }
        }
        let issued_notes = issue.as_ref().map_or(0, |r| (r.amount > 0 || !r.finalize) as usize + r.first_issuance as usize);
        // Fee fixed point: ZEC inputs depend on the fee, the fee on the action count.
        let mut fee = 0;
        let mut zec_pick = (vec![], 0u64);
        for _ in 0..8 {
            let zneed = need.get(&zec).copied().unwrap_or(0) + fee;
            zec_pick = self.pick(&zec, zneed.max(1))?;
            let mut actions = 0usize;
            let zchange = (zec_pick.1 > zneed) as usize;
            actions += zec_pick.0.len().max(outs.get(&zec).copied().unwrap_or(0) + zchange);
            for (a, (idx, got)) in &picks {
                let change = (*got > need[a]) as usize;
                actions += idx.len().max(outs.get(a).copied().unwrap_or(0) + change);
            }
            let f = FEE_FACTOR * MARGINAL_FEE * (actions.max(2) + issued_notes) as u64;
            if f == fee {
                break;
            }
            fee = f;
        }
        let zneed = need.get(&zec).copied().unwrap_or(0) + fee;
        if zec_pick.1 < zneed {
            return Err(format!("Not enough test ZEC for the fee: {} spendable, {zneed} needed.", zec_pick.1));
        }
        let mut idx: Vec<usize> = zec_pick.0.clone();
        for (i, _) in picks.values() {
            idx.extend(i);
        }
        let mut spends = vec![];
        for &i in &idx {
            let n = &self.notes[i];
            let path = MerklePath::from(n.witness.as_ref().unwrap().path().ok_or("witness without path")?);
            spends.push((n.note, path));
        }
        // Expected value back to us when mined: change per asset, plus what we send/issue to ourselves.
        let me = self.keys.address();
        let mut incoming: BTreeMap<[u8; 32], u64> = BTreeMap::new();
        if zec_pick.1 > zneed {
            *incoming.entry(zec).or_default() += zec_pick.1 - zneed;
        }
        for (a, (_, got)) in &picks {
            if *got > need[a] {
                *incoming.entry(*a).or_default() += got - need[a];
            }
        }
        for (to, a, v) in &outputs {
            if *to == me {
                *incoming.entry(a.to_bytes()).or_default() += v;
            }
        }
        let mut issued_desc = None;
        if let Some(r) = &issue {
            if r.to == me && r.amount > 0 {
                *incoming.entry(self.keys.asset(&r.asset_desc)?.to_bytes()).or_default() += r.amount;
            }
            issued_desc = Some(r.asset_desc.clone());
        }
        let anchor = self.anchor();
        let tx = build_tx_burn(&self.keys, target_height, anchor, spends, outputs, burns, issue, fee)?;
        let txid_disp = tx.txid().to_string();
        let txid = parse_txid(&txid_disp)?;
        let expiry = u32::from(tx.expiry_height());
        if let Some(desc) = issued_desc {
            let a = self.keys.asset(&desc)?.to_bytes();
            self.own.entry(a).or_insert_with(|| OwnAsset { desc, ..Default::default() });
        }
        let rec = TxRec {
            txid,
            kind,
            asset: rec_asset.to_bytes(),
            amount: rec_amount,
            fee,
            created: target_height,
            expiry,
            mined: 0,
            incoming: incoming.into_iter().collect(),
            nfs: idx.iter().map(|&i| self.notes[i].nf).collect(),
        };
        self.staged.retain(|t| t.txid != txid);
        self.staged.push(rec);
        Ok(Built { tx_hex: hex::encode(tx_bytes(&tx)), txid: txid_disp, asset_id: hex::encode(rec_asset.to_bytes()), fee, expiry })
    }

    /// Marks a built transaction as broadcast: its notes are locked until it is mined or expires.
    pub fn commit(&mut self, txid_display_hex: &str) -> Result<(), Error> {
        let txid = parse_txid(txid_display_hex)?;
        let pos = self.staged.iter().position(|t| t.txid == txid).ok_or("no such built transaction")?;
        let rec = self.staged.remove(pos);
        for n in self.notes.iter_mut() {
            if rec.nfs.contains(&n.nf) {
                n.locked = Some(txid);
            }
        }
        self.txs.push(rec);
        Ok(())
    }

    /// Issues `amount` units of the asset named `name` (≤ 32 bytes UTF-8) to ourselves.
    pub fn issue(&mut self, target_height: u32, name: &str, amount: u64, finalize: bool) -> Result<Built, Error> {
        if name.is_empty() || name.len() > 32 {
            return Err("asset name: 1 to 32 bytes of UTF-8".into());
        }
        if amount == 0 && !finalize {
            return Err("amount must be > 0".into());
        }
        let asset = self.keys.asset(name.as_bytes())?;
        let o = self.own.get(&asset.to_bytes()).cloned().unwrap_or_default();
        if o.finalized {
            return Err("this asset is finalized: no more issuance".into());
        }
        let first = !o.issued_on_chain && !self.txs.iter().any(|t| t.asset == asset.to_bytes() && (t.kind == 0 || t.kind == 3) && self.tx_status(t) != "expired");
        let req = IssueReq { asset_desc: name.as_bytes().to_vec(), amount, to: self.keys.address(), first_issuance: first, finalize };
        let kind = if amount == 0 { 3 } else { 0 };
        self.build(target_height, vec![], vec![], Some(req), kind, asset, amount)
    }

    /// Finalizes one of our assets (no further issuance), by asset id.
    pub fn finalize(&mut self, target_height: u32, asset_id: &str) -> Result<Built, Error> {
        let a = parse_asset(asset_id)?.to_bytes();
        let o = self.own.get(&a).cloned().ok_or("not an asset this wallet issued")?;
        let name = String::from_utf8(o.desc).map_err(e)?;
        self.issue(target_height, &name, 0, true)
    }

    /// Sends `amount` of an asset ("zec" or an asset id) to a unified address.
    pub fn transfer(&mut self, target_height: u32, asset_id: &str, amount: u64, to: &str) -> Result<Built, Error> {
        if amount == 0 {
            return Err("amount must be > 0".into());
        }
        let asset = parse_asset(asset_id)?;
        let to = crate::decode_ua(to)?;
        self.build(target_height, vec![(to, asset, amount)], vec![], None, 1, asset, amount)
    }

    /// Burns `amount` of a (non-ZEC) asset (ZIP 226).
    pub fn burn(&mut self, target_height: u32, asset_id: &str, amount: u64) -> Result<Built, Error> {
        let asset = parse_asset(asset_id)?;
        if bool::from(asset.is_zatoshi()) {
            return Err("ZEC cannot be burnt".into());
        }
        if amount == 0 {
            return Err("amount must be > 0".into());
        }
        self.build(target_height, vec![], vec![(asset, amount)], None, 2, asset, amount)
    }
}

pub fn json_str(s: &str) -> String {
    let mut o = String::from("\"");
    for c in s.chars() {
        match c {
            '"' => o.push_str("\\\""),
            '\\' => o.push_str("\\\\"),
            c if (c as u32) < 0x20 => o.push_str(&format!("\\u{:04x}", c as u32)),
            c => o.push(c),
        }
    }
    o.push('"');
    o
}

/// Hash check helper for tests: the asset description hash of a name.
pub fn desc_hash(name: &str) -> Option<[u8; 32]> {
    Some(compute_asset_desc_hash(&nonempty::NonEmpty::from_slice(name.as_bytes())?))
}

/// Encodes a full tx as the CompactTx lightwalletd would serve (84-byte ZSA ciphertexts),
/// in a block at height `h` whose hash is `[h as u8; 32]` and prevHash `[(h-1) as u8; 32]`.
pub fn compact_from_tx(h: u32, tx: &zcash_primitives::transaction::Transaction) -> Vec<u8> {
    let (key, varint, ld) = (pb_key, pb_varint, pb_ld);
    let mut ctx = vec![];
    ctx.extend(ld(2, tx.txid().as_ref()));
    if let Some(zcash_primitives::transaction::OrchardBundle::OrchardZSA(b)) = tx.orchard_bundle() {
        for a in b.actions().iter() {
            let mut act = ld(1, &a.nullifier().to_bytes());
            act.extend(ld(2, &a.cmx().to_bytes()));
            act.extend(ld(3, &a.encrypted_note().epk_bytes));
            act.extend(ld(4, &a.encrypted_note().enc_ciphertext.as_ref()[..84]));
            ctx.extend(ld(6, &act));
        }
    }
    if let Some(ib) = tx.issue_bundle() {
        for act in ib.actions().iter() {
            let mut is = ld(1, act.asset_desc_hash());
            if act.is_finalized() {
                is.extend(key(2, 0));
                is.extend(varint(1));
            }
            is.extend(ld(3, &ib.ik().encode()));
            for n in act.notes() {
                let mut nb = ld(1, &n.recipient().to_raw_address_bytes());
                nb.extend(key(2, 0));
                nb.extend(varint(n.value().inner()));
                nb.extend(ld(3, &n.rho().to_bytes()));
                nb.extend(ld(4, n.rseed().as_bytes()));
                is.extend(ld(5, &nb));
            }
            ctx.extend(ld(10, &is));
        }
    }
    let mut blk = key(2, 0);
    blk.extend(varint(h as u64));
    blk.extend(ld(3, &[h as u8; 32]));
    blk.extend(ld(4, &[(h - 1) as u8; 32]));
    blk.extend(ld(7, &ctx));
    blk
}
/// Offline end-to-end flow, all proofs real: a fabricated ZEC note (local tree only) is spent
/// to ourselves (tx1), the wallet finds the change by compact scanning, then issues an asset,
/// transfers part of it, burns part, finalizes it, scanning each transaction back as a compact
/// block and verifying every Orchard proof and the issuance. Returns a JSON report with timings.
pub fn offline_flow(seed: &[u8], now: &dyn Fn() -> f64) -> Result<String, Error> {
    use crate::{build_tx, encode_ua};
    use rand_core::RngCore;
    use zcash_protocol::consensus::NetworkType;
    let keys = Keys::from_seed(seed)?;
    let me = keys.address();
    // Fabricated 0.01 ZEC note to us, alone in a local tree.
    let mut rng = rand_core::OsRng;
    let fake = loop {
        let mut r = [0u8; 32];
        rng.fill_bytes(&mut r);
        r[31] &= 0x1f;
        let Some(rho) = Option::<Rho>::from(Rho::from_bytes(&r)) else { continue };
        rng.fill_bytes(&mut r);
        let Some(rseed) = Option::<RandomSeed>::from(RandomSeed::from_bytes(r, &rho)) else { continue };
        if let Some(n) = Option::<Note>::from(Note::from_parts(me, NoteValue::from_raw(1_000_000), AssetBase::zatoshi(), rho, rseed)) {
            break n;
        }
    };
    let fake_cmx = ExtractedNoteCommitment::from(fake.commitment());
    let mut tree = Tree::empty();
    tree.append(MerkleHashOrchard::from_cmx(&fake_cmx)).unwrap();
    let wit = Witness::from_tree(tree.clone()).unwrap();
    let path = MerklePath::from(wit.path().unwrap());
    let anchor = orchard::Anchor::from(tree.root());
    let mut times = vec![];
    let t = now();
    let tx1 = build_tx(&keys, 2, anchor, vec![(fake, path)], vec![], None, 0)?;
    times.push(("fund", now() - t));
    // Block 1: the fabricated leaf (undecryptable compact action); block 2: tx1.
    let mut w = Wallet::new(seed, 1, "")?;
    let mut fake_act = pb_ld(1, &[0u8; 32]);
    fake_act.extend(pb_ld(2, &fake_cmx.to_bytes()));
    fake_act.extend(pb_ld(3, &[0u8; 32]));
    fake_act.extend(pb_ld(4, &[0u8; 84]));
    let mut b1 = pb_key(2, 0);
    b1.extend(pb_varint(1));
    b1.extend(pb_ld(3, &[1u8; 32]));
    b1.extend(pb_ld(4, &[0u8; 32]));
    b1.extend(pb_ld(7, &pb_ld(6, &fake_act)));
    let mut h = 1u32;
    let feed = |w: &mut Wallet, blk: Vec<u8>| -> Result<ScanReport, Error> {
        let mut s = (blk.len() as u32).to_be_bytes().to_vec();
        s.extend(blk);
        w.scan_stream(&s)
    };
    feed(&mut w, b1)?;
    h += 1;
    let r = feed(&mut w, compact_from_tx(h, &tx1))?;
    if r.received != 1 {
        return Err(format!("funding note not found: {r:?}"));
    }
    let t = now();
    let vk = orchard::circuit::VerifyingKey::build::<orchard::flavor::OrchardZSA>();
    times.push(("verifying_key", now() - t));
    let verify = |tx: &zcash_primitives::transaction::Transaction| -> Result<(), Error> {
        if let Some(zcash_primitives::transaction::OrchardBundle::OrchardZSA(b)) = tx.orchard_bundle() {
            b.verify_proof(&vk).map_err(|x| format!("proof does not verify: {x:?}"))?;
        }
        Ok(())
    };
    let other = encode_ua(&Keys::from_seed(&[seed, b"other"].concat())?.address(), NetworkType::Test);
    let mut sizes = vec![];
    let mut fees = vec![];
    let mut asset = String::new();
    let mut records = BTreeMap::new();
    for step in ["issue", "transfer", "burn", "finalize"] {
        let t = now();
        let built = match step {
            "issue" => w.issue(h + 1, "ZStreet Lab Token", 1000, false)?,
            "transfer" => w.transfer(h + 1, &asset, 300, &other)?,
            "burn" => w.burn(h + 1, &asset, 100)?,
            _ => w.finalize(h + 1, &asset)?,
        };
        times.push((step, now() - t));
        if step == "issue" {
            asset = built.asset_id.clone();
        }
        let raw = hex::decode(&built.tx_hex).map_err(e)?;
        let tx = crate::parse_tx(&raw)?;
        let t = now();
        verify(&tx)?;
        if let Some(ib) = tx.issue_bundle() {
            // ZIP 244: with no transparent input the shielded sighash is the txid digest.
            let first_nf = *tx.orchard_bundle().ok_or("issuance without orchard bundle")?.as_zsa_bundle().actions().first().nullifier();
            let upd = orchard::issuance::verify_issue_bundle(ib, *tx.txid().as_ref(), |a| records.get(a).copied(), &first_nf)
                .map_err(|x| format!("issuance does not verify: {x:?}"))?;
            records.extend(upd);
        }
        times.push(("verify", now() - t));
        sizes.push(raw.len());
        fees.push(built.fee);
        w.commit(&built.txid)?;
        h += 1;
        let r = feed(&mut w, compact_from_tx(h, &tx))?;
        if r.mined != vec![built.txid.clone()] {
            return Err(format!("{step}: not seen mined: {r:?}"));
        }
    }
    let bal = w.balances_json();
    let state = w.to_bytes();
    Wallet::from_bytes(seed, &state)?;
    let ts: Vec<String> = times.iter().map(|(k, v)| format!("{{\"step\":\"{k}\",\"ms\":{v:.0}}}")).collect();
    Ok(format!(
        "{{\"times\":[{}],\"tx_bytes\":{:?},\"fees\":{:?},\"asset_id\":\"{asset}\",\"state_bytes\":{},\"balances\":{bal}}}",
        ts.join(","),
        sizes,
        fees,
        state.len()
    ))
}

fn pb_varint(mut n: u64) -> Vec<u8> {
    let mut o = vec![];
    loop {
        let b = (n & 0x7f) as u8;
        n >>= 7;
        if n == 0 {
            o.push(b);
            return o;
        }
        o.push(b | 0x80);
    }
}
fn pb_key(f: u32, wt: u32) -> Vec<u8> {
    pb_varint(((f << 3) | wt) as u64)
}
fn pb_ld(f: u32, b: &[u8]) -> Vec<u8> {
    let mut o = pb_key(f, 2);
    o.extend(pb_varint(b.len() as u64));
    o.extend_from_slice(b);
    o
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rec_dir() -> std::path::PathBuf {
        std::path::PathBuf::from(std::env::var("ZSA_REC").unwrap_or_else(|_| "testdata".into()))
    }

    /// Scans recorded methyl compact blocks from the tree state before them and checks the
    /// tree size the chain reports after every block (and the root of the last one when given).
    #[test]
    fn scan_recorded_methyl() {
        let dir = rec_dir();
        let Ok(stream) = std::fs::read(dir.join("blocks.bin")) else {
            eprintln!("no recording in {dir:?}, skipped");
            return;
        };
        let meta = std::fs::read_to_string(dir.join("meta.txt")).unwrap();
        let mut it = meta.split_whitespace();
        let from: u32 = it.next().unwrap().parse().unwrap();
        let tree_before = it.next().unwrap().to_string();
        let root_after = it.next().map(|s| s.to_string());
        let mut w = Wallet::new(&[7u8; 32], from, &tree_before).unwrap();
        let t0 = std::time::Instant::now();
        let rep = w.scan_stream(&stream).unwrap();
        println!("scanned {} blocks to {} in {:?}, tree size {}, report {:?}", rep.blocks, w.scanned, t0.elapsed(), w.tree_size(), rep);
        if let Some(r) = root_after {
            let node = tree_from_hex(&r).unwrap().root();
            assert_eq!(node, w.tree.root(), "root after scan differs from the node's");
            println!("root matches the node's tree state");
        }
        let b = w.to_bytes();
        let w2 = Wallet::from_bytes(&[7u8; 32], &b).unwrap();
        assert_eq!(w2.to_bytes(), b);
        println!("{}", w.balances_json());
    }

    /// Prints the ZEC fee, actions and issued notes of raw transactions (ZSA_TXS=a.bin,b.bin).
    #[test]
    fn fee_of_recorded_txs() {
        for p in std::env::var("ZSA_TXS").unwrap_or_default().split(',').filter(|s| !s.is_empty()) {
            let tx = crate::parse_tx(&std::fs::read(p).unwrap()).unwrap();
            let (vb, n, burns) = match tx.orchard_bundle() {
                Some(zcash_primitives::transaction::OrchardBundle::OrchardZSA(b)) => (i64::from(*b.value_balance()), b.actions().len(), b.burn().len()),
                Some(zcash_primitives::transaction::OrchardBundle::OrchardVanilla(b)) => (i64::from(*b.value_balance()), b.actions().len(), 0),
                None => (0, 0, 0),
            };
            let issued = tx.issue_bundle().map_or(0, |b| b.get_all_notes().len());
            println!("{p}: fee {vb} zat, {n} actions, {issued} issued notes, {burns} burns, expiry {:?}", tx.expiry_height());
        }
    }

    #[test]
    fn offline_flow_native() {
        let t0 = std::time::Instant::now();
        let r = offline_flow(&[9u8; 32], &move || t0.elapsed().as_secs_f64() * 1000.0).unwrap();
        println!("{r}");
    }

}
