//! ZApp for Chrome, ZSA spike: OrchardZSA (ZIP 226) transfers and ZIP 227 issuance, built,
//! proven and signed in-process (native or WebAssembly), for the public ZSA testnet served by
//! rpc.test-zsa.org (zcash-shielded-assets/zebra@6a91831a: "ZSATestnet", every NU at height 1,
//! NU7 branch id 0x77190ad8, v6 transactions).
//!
//! No wallet database here: notes, witnesses and anchors are passed in by the caller.

use std::io::Cursor;

use incrementalmerkletree::{frontier::CommitmentTree, witness::IncrementalWitness};
use nonempty::NonEmpty;
use orchard::{
    issuance::{
        auth::{IssueAuthKey, IssueValidatingKey, ZSASchnorr},
        compute_asset_desc_hash, IssueInfo,
    },
    keys::{FullViewingKey, Scope, SpendAuthorizingKey, SpendingKey},
    note::{AssetBase, AssetId, ExtractedNoteCommitment},
    primitives::OrchardDomain,
    tree::{MerkleHashOrchard, MerklePath},
    value::NoteValue,
    Address, Note,
};
use rand::rngs::OsRng;
use zcash_address::unified::{self, Container, Encoding};
use zcash_note_encryption::try_note_decryption;
use zcash_primitives::{
    merkle_tree::read_commitment_tree,
    transaction::{
        builder::{BuildConfig, Builder},
        fees::fixed::FeeRule as FixedFeeRule,
        Transaction,
    },
};
use zcash_protocol::{
    consensus::{BlockHeight, BranchId, NetworkType, NetworkUpgrade, Parameters},
    memo::MemoBytes,
    value::Zatoshis,
};

/// The ZSA testnet of rpc.test-zsa.org: every network upgrade up to NU7 at height 1.
#[derive(Clone, Copy, Debug)]
pub struct ZsaTestnet;

impl Parameters for ZsaTestnet {
    fn network_type(&self) -> NetworkType {
        // Zebra runs it as a configured Testnet (coinbase pays tm… addresses). The faucet and
        // the docs say uregtest1; addresses are not checked by consensus, both encodings are given.
        NetworkType::Test
    }
    fn activation_height(&self, _nu: NetworkUpgrade) -> Option<BlockHeight> {
        Some(BlockHeight::from_u32(1))
    }
}

pub const COIN_TYPE: u32 = 1;
pub const BRANCH_ID: BranchId = BranchId::Nu7;

pub type Error = String;
fn e<E: std::fmt::Debug>(x: E) -> Error {
    format!("{x:?}")
}

/// Orchard spending key and ZIP 227 issuance key for account 0 of a seed.
#[derive(Clone)]
pub struct Keys {
    pub sk: SpendingKey,
    pub fvk: FullViewingKey,
    pub isk: IssueAuthKey<ZSASchnorr>,
}

impl Keys {
    pub fn from_seed(seed: &[u8]) -> Result<Self, Error> {
        let sk = SpendingKey::from_zip32_seed(seed, COIN_TYPE, zip32::AccountId::ZERO).map_err(e)?;
        let fvk = FullViewingKey::from(&sk);
        let isk = IssueAuthKey::<ZSASchnorr>::from_zip32_seed(seed, COIN_TYPE, 0).map_err(e)?;
        Ok(Keys { sk, fvk, isk })
    }
    pub fn address(&self) -> Address {
        self.fvk.address_at(0u32, Scope::External)
    }
    pub fn ik(&self) -> IssueValidatingKey<ZSASchnorr> {
        IssueValidatingKey::from(&self.isk)
    }
    /// The asset id (AssetBase bytes) this key issues for a description.
    pub fn asset(&self, asset_desc: &[u8]) -> Result<AssetBase, Error> {
        let h = compute_asset_desc_hash(&NonEmpty::from_slice(asset_desc).ok_or("empty asset description")?);
        Ok(AssetBase::custom(&AssetId::new_v0(&self.ik(), &h)))
    }
}

/// A unified address with only an Orchard receiver.
pub fn encode_ua(addr: &Address, net: NetworkType) -> String {
    let ua = unified::Address::try_from_items(vec![unified::Receiver::Orchard(addr.to_raw_address_bytes())])
        .expect("one orchard receiver");
    ua.encode(&net)
}

pub fn decode_ua(s: &str) -> Result<Address, Error> {
    let (_, ua) = unified::Address::decode(s).map_err(e)?;
    for r in ua.items() {
        if let unified::Receiver::Orchard(b) = r {
            return Option::from(Address::from_raw_address_bytes(&b)).ok_or_else(|| "bad orchard receiver".into());
        }
    }
    Err("no orchard receiver".into())
}

/// Parses the `orchard.commitments.finalState` of `z_gettreestate` (legacy CommitmentTree).
pub fn tree_from_hex(final_state: &str) -> Result<CommitmentTree<MerkleHashOrchard, 32>, Error> {
    let bytes = hex::decode(final_state).map_err(e)?;
    read_commitment_tree::<MerkleHashOrchard, _, 32>(Cursor::new(bytes)).map_err(e)
}

pub fn anchor_from_root_hex(root_be_hex: &str) -> Result<orchard::Anchor, Error> {
    // z_gettreestate prints finalRoot as plain (little-endian) bytes.
    let b: [u8; 32] = hex::decode(root_be_hex).map_err(e)?.try_into().map_err(|_| "root length")?;
    Option::from(orchard::Anchor::from_bytes(b)).ok_or_else(|| "bad anchor".into())
}

pub fn parse_tx(bytes: &[u8]) -> Result<Transaction, Error> {
    Transaction::read(Cursor::new(bytes), BRANCH_ID).map_err(e)
}

pub fn tx_bytes(tx: &Transaction) -> Vec<u8> {
    let mut v = vec![];
    tx.write(&mut v).expect("write to vec");
    v
}

/// Note commitments a transaction appends to the Orchard tree, in Zebra's order:
/// Orchard actions, then issued notes.
pub fn tx_commitments(tx: &Transaction) -> Vec<MerkleHashOrchard> {
    let mut out = vec![];
    if let Some(b) = tx.orchard_bundle() {
        match b {
            zcash_primitives::transaction::OrchardBundle::OrchardVanilla(b) => {
                out.extend(b.actions().iter().map(|a| MerkleHashOrchard::from_cmx(a.cmx())))
            }
            zcash_primitives::transaction::OrchardBundle::OrchardZSA(b) => {
                out.extend(b.actions().iter().map(|a| MerkleHashOrchard::from_cmx(a.cmx())))
            }
        }
    }
    if let Some(ib) = tx.issue_bundle() {
        for n in ib.get_all_notes() {
            out.push(MerkleHashOrchard::from_cmx(&ExtractedNoteCommitment::from(n.commitment())));
        }
    }
    out
}

/// Wallet-side scanning of a full v6 transaction: trial-decrypts every OrchardZSA action with
/// the incoming viewing key, and picks issued notes paid to us (issuance notes are public).
pub fn scan_tx(keys: &Keys, tx: &Transaction) -> Vec<(usize, Note)> {
    let ivk = keys.fvk.to_ivk(Scope::External).prepare();
    let mut found = vec![];
    let mut pos = 0usize;
    if let Some(zcash_primitives::transaction::OrchardBundle::OrchardZSA(b)) = tx.orchard_bundle() {
        for a in b.actions().iter() {
            if let Some((note, _, _)) = try_note_decryption(&OrchardDomain::for_action(a), &ivk, a) {
                found.push((pos, note));
            }
            pos += 1;
        }
    } else if let Some(zcash_primitives::transaction::OrchardBundle::OrchardVanilla(b)) = tx.orchard_bundle() {
        pos += b.actions().len();
    }
    if let Some(ib) = tx.issue_bundle() {
        let me = keys.address();
        for n in ib.get_all_notes() {
            if n.recipient() == me {
                found.push((pos, *n));
            }
            pos += 1;
        }
    }
    found
}

/// Wallet-side scanning of a lightwalletd CompactOrchardAction (ZSA lightwalletd serves 84-byte
/// compact ciphertexts: the vanilla 52 plus the 32-byte asset base).
pub fn try_compact(keys: &Keys, nf: &[u8], cmx: &[u8], epk: &[u8], ct: &[u8]) -> Option<Note> {
    use orchard::{flavor::OrchardZSA, note::Nullifier, primitives::{CompactAction, OrchardPrimitives}};
    use zcash_note_encryption::{note_bytes::NoteBytes, try_compact_note_decryption, EphemeralKeyBytes};
    let ct = <<OrchardZSA as OrchardPrimitives>::CompactNoteCiphertextBytes as NoteBytes>::from_slice(ct)?;
    let nf = Option::from(Nullifier::from_bytes(&nf.try_into().ok()?))?;
    let cmx = Option::from(ExtractedNoteCommitment::from_bytes(&cmx.try_into().ok()?))?;
    let act = CompactAction::<OrchardZSA>::from_parts(nf, cmx, EphemeralKeyBytes(epk.try_into().ok()?), ct);
    let ivk = keys.fvk.to_ivk(Scope::External).prepare();
    try_compact_note_decryption(&OrchardDomain::for_compact_action(&act), &ivk, &act).map(|(n, _)| n)
}

/// Sapling is never used here; the builder still wants provers.
struct NoSapling;
impl sapling::prover::SpendProver for NoSapling {
    type Proof = sapling::bundle::GrothProofBytes;
    fn prepare_circuit(
        _: sapling::ProofGenerationKey, _: sapling::Diversifier, _: sapling::Rseed, _: sapling::value::NoteValue,
        _: jubjub::Fr, _: sapling::value::ValueCommitTrapdoor, _: bls12_381::Scalar, _: sapling::MerklePath,
    ) -> Option<sapling::circuit::Spend> {
        unreachable!("no sapling spends")
    }
    fn create_proof<R: rand_core::RngCore>(&self, _: sapling::circuit::Spend, _: &mut R) -> Self::Proof {
        unreachable!()
    }
    fn encode_proof(p: Self::Proof) -> sapling::bundle::GrothProofBytes {
        p
    }
}
impl sapling::prover::OutputProver for NoSapling {
    type Proof = sapling::bundle::GrothProofBytes;
    fn prepare_circuit(
        _: &sapling::keys::EphemeralSecretKey, _: sapling::PaymentAddress, _: jubjub::Fr, _: sapling::value::NoteValue,
        _: sapling::value::ValueCommitTrapdoor,
    ) -> sapling::circuit::Output {
        unreachable!("no sapling outputs")
    }
    fn create_proof<R: rand_core::RngCore>(&self, _: sapling::circuit::Output, _: &mut R) -> Self::Proof {
        unreachable!()
    }
    fn encode_proof(p: Self::Proof) -> sapling::bundle::GrothProofBytes {
        p
    }
}

fn fee_rule(fee: u64) -> FixedFeeRule {
    FixedFeeRule::non_standard(Zatoshis::from_u64(fee).expect("fee"))
}

/// Zebra's mempool (ZIP 317 relay rule, block_unpaid_action_limit = 0) wants at least
/// 5000 zat per logical action; the deployed node does not yet count ZSA asset creation.
pub fn conventional_fee(orchard_actions: usize, issued_notes: usize) -> u64 {
    5000 * (orchard_actions.max(2) + issued_notes) as u64
}

/// A ZIP 227 issuance request.
pub struct IssueReq {
    pub asset_desc: Vec<u8>,
    pub amount: u64,
    pub to: Address,
    pub first_issuance: bool,
    pub finalize: bool,
}

/// Builds, proves and signs a v6 transaction: OrchardZSA spends of our notes (any assets),
/// outputs (address, asset, amount), an optional issuance, the fee in ZEC, and one change output
/// per asset back to ourselves. A v6 issuance needs an Orchard bundle (its first nullifier seeds
/// rho): with no spends or outputs a zero-value ZEC note to ourselves is added.
pub fn build_tx(
    keys: &Keys,
    target_height: u32,
    anchor: orchard::Anchor,
    spends: Vec<(Note, MerklePath)>,
    outputs: Vec<(Address, AssetBase, u64)>,
    issue: Option<IssueReq>,
    fee: u64,
) -> Result<Transaction, Error> {
    build_tx_burn(keys, target_height, anchor, spends, outputs, vec![], issue, fee)
}

/// [`build_tx`] with ZIP 226 burns (asset, amount) of non-ZEC assets.
#[allow(clippy::too_many_arguments)]
pub fn build_tx_burn(
    keys: &Keys,
    target_height: u32,
    anchor: orchard::Anchor,
    spends: Vec<(Note, MerklePath)>,
    outputs: Vec<(Address, AssetBase, u64)>,
    burns: Vec<(AssetBase, u64)>,
    issue: Option<IssueReq>,
    fee: u64,
) -> Result<Transaction, Error> {
    use std::collections::BTreeMap;
    let ovk = Some(keys.fvk.to_ovk(Scope::External));
    let mut b = Builder::new(
        ZsaTestnet,
        BlockHeight::from_u32(target_height),
        BuildConfig::Standard { sapling_anchor: None, orchard_anchor: Some(anchor) },
    );
    // Per-asset balance: inputs - outputs (- fee for ZEC).
    let mut bal: BTreeMap<[u8; 32], (AssetBase, i128)> = BTreeMap::new();
    let zec = AssetBase::zatoshi();
    bal.insert(zec.to_bytes(), (zec, -(fee as i128)));
    let n_spends = spends.len();
    for (note, path) in spends {
        bal.entry(note.asset().to_bytes()).or_insert((note.asset(), 0)).1 += note.value().inner() as i128;
        b.add_orchard_spend::<std::convert::Infallible>(keys.fvk.clone(), note, path).map_err(e)?;
    }
    for (asset, v) in burns {
        if bool::from(asset.is_zatoshi()) {
            return Err("ZEC cannot be burnt".into());
        }
        bal.entry(asset.to_bytes()).or_insert((asset, 0)).1 -= v as i128;
        b.add_burn::<std::convert::Infallible>(v, asset).map_err(e)?;
    }
    let mut n_outputs = 0;
    for (to, asset, v) in outputs {
        bal.entry(asset.to_bytes()).or_insert((asset, 0)).1 -= v as i128;
        // The builder takes Zatoshis for every asset (ZSA amounts share the u64 range).
        b.add_orchard_output::<std::convert::Infallible>(ovk.clone(), to, Zatoshis::from_u64(v).map_err(e)?, asset, MemoBytes::empty())
            .map_err(e)?;
        n_outputs += 1;
    }
    for (asset, v) in bal.values() {
        if *v < 0 {
            return Err(format!("insufficient funds in asset {}: short by {}", hex::encode(asset.to_bytes()), -v));
        }
        if *v > 0 {
            b.add_orchard_output::<std::convert::Infallible>(ovk.clone(), keys.address(), Zatoshis::from_u64(*v as u64).map_err(e)?, *asset, MemoBytes::empty())
                .map_err(e)?;
            n_outputs += 1;
        }
    }
    let mut first = false;
    if let Some(req) = issue {
        first = req.first_issuance;
        let h = compute_asset_desc_hash(&NonEmpty::from_slice(&req.asset_desc).ok_or("empty asset description")?);
        // amount 0 with finalize: an issue action with no note (besides the reference note of a
        // first issuance) and the finalize flag, as IssueBundle::new makes it from `None`.
        let info = (req.amount > 0 || !req.finalize).then(|| IssueInfo { recipient: req.to, value: NoteValue::from_raw(req.amount) });
        let finalize_only = info.is_none();
        b.init_issuance_bundle::<std::convert::Infallible>(keys.isk.clone(), h, info, req.first_issuance).map_err(e)?;
        if req.finalize && !finalize_only {
            b.finalize_asset::<std::convert::Infallible>(&h).map_err(e)?;
        }
        if n_spends == 0 && n_outputs == 0 {
            b.add_orchard_output::<std::convert::Infallible>(ovk, keys.address(), Zatoshis::ZERO, zec, MemoBytes::empty()).map_err(e)?;
        }
    }
    let res = b
        .build(
            &transparent::builder::TransparentSigningSet::new(),
            &[],
            &[SpendAuthorizingKey::from(&keys.sk)],
            OsRng,
            &NoSapling,
            &NoSapling,
            &fee_rule(fee),
            move |_| first,
        )
        .map_err(e)?;
    Ok(res.into_transaction())
}

/// Issuance of a new asset to `to`, no ZEC input (so 0 fee: consensus-valid, but Zebra's
/// mempool relay rule rejects it).
pub fn build_issue(
    keys: &Keys,
    target_height: u32,
    anchor: orchard::Anchor,
    asset_desc: &[u8],
    amount: u64,
    to: Address,
    first_issuance: bool,
    finalize: bool,
    fee: u64,
) -> Result<Transaction, Error> {
    let req = IssueReq { asset_desc: asset_desc.to_vec(), amount, to, first_issuance, finalize };
    build_tx(keys, target_height, anchor, vec![], vec![], Some(req), fee)
}

/// Transfer of `amount` of `note`'s asset to `to`, change back to us.
pub fn build_transfer(
    keys: &Keys,
    target_height: u32,
    anchor: orchard::Anchor,
    note: Note,
    path: MerklePath,
    to: Address,
    amount: u64,
    fee: u64,
) -> Result<Transaction, Error> {
    let asset = note.asset();
    build_tx(keys, target_height, anchor, vec![(note, path)], vec![(to, asset, amount)], None, fee)
}

/// Witnesses of the leaves at `positions` (0-based, within `leaves`) appended on top of
/// `frontier`; returns their Merkle paths and the resulting root (the anchor to spend them at).
pub fn witnesses(
    frontier: CommitmentTree<MerkleHashOrchard, 32>,
    leaves: &[MerkleHashOrchard],
    positions: &[usize],
) -> Result<(Vec<MerklePath>, orchard::Anchor), Error> {
    let mut tree = frontier;
    let mut wits: Vec<IncrementalWitness<MerkleHashOrchard, 32>> = vec![];
    for (i, l) in leaves.iter().enumerate() {
        tree.append(*l).map_err(|_| "tree full")?;
        for w in wits.iter_mut() {
            w.append(*l).map_err(|_| "tree full")?;
        }
        if positions.contains(&i) {
            wits.push(IncrementalWitness::from_tree(tree.clone()).ok_or("empty tree")?);
        }
    }
    if wits.len() != positions.len() {
        return Err("leaf not found".into());
    }
    let root = orchard::Anchor::from(tree.root());
    let mut paths = vec![];
    for w in wits {
        paths.push(MerklePath::from(w.path().ok_or("no path")?));
    }
    Ok((paths, root))
}

pub fn witness(
    frontier: CommitmentTree<MerkleHashOrchard, 32>,
    leaves: &[MerkleHashOrchard],
    leaf_pos: usize,
) -> Result<(MerklePath, orchard::Anchor), Error> {
    let (mut p, a) = witnesses(frontier, leaves, &[leaf_pos])?;
    Ok((p.remove(0), a))
}

pub mod wallet;

#[cfg(target_arch = "wasm32")]
pub mod wasm;

/// Offline self-test: issue `amount` of a new asset to ourselves (tx 1), witness the issued note
/// in a tree that holds only tx 1's commitments, then transfer part of it (tx 2). Both are fully
/// proven and signed. Returns (issue tx, transfer tx). The transfer's anchor is local, so it would
/// not be accepted on chain; it measures and exercises the same code path.
pub fn selftest(seed: &[u8]) -> Result<(Transaction, Transaction), Error> {
    let keys = Keys::from_seed(seed)?;
    let empty = CommitmentTree::<MerkleHashOrchard, 32>::empty();
    let tx1 = build_issue(&keys, 10, orchard::Anchor::from(empty.root()), b"selftest", 1000, keys.address(), true, false, 0)?;
    let leaves = tx_commitments(&tx1);
    let (pos, note) = scan_tx(&keys, &tx1)
        .into_iter()
        .find(|(_, n)| !bool::from(n.asset().is_zatoshi()))
        .ok_or("issued note not found")?;
    let (path, anchor) = witness(empty, &leaves, pos)?;
    let tx2 = build_transfer(&keys, 11, anchor, note, path, keys.address(), 400, 0)?;
    // Verify both: the transfer's Orchard proof against the ZSA verifying key.
    if let Some(zcash_primitives::transaction::OrchardBundle::OrchardZSA(b)) = tx2.orchard_bundle() {
        let vk = orchard::circuit::VerifyingKey::build::<orchard::flavor::OrchardZSA>();
        b.verify_proof(&vk).map_err(|x| format!("proof does not verify: {x:?}"))?;
    }
    Ok((tx1, tx2))
}

#[cfg(test)]
mod tests {
    #[test]
    fn selftest_issue_transfer() {
        let t0 = std::time::Instant::now();
        let (a, b) = super::selftest(&[7u8; 32]).unwrap();
        println!(
            "selftest: issue {} B + transfer {} B in {:?} (single-thread unless built with `native`)",
            super::tx_bytes(&a).len(),
            super::tx_bytes(&b).len(),
            t0.elapsed()
        );
    }
}

#[cfg(test)]
mod bench {
    #[test]
    fn bench_issue() {
        let k = super::Keys::from_seed(&[7u8; 32]).unwrap();
        let empty = super::CommitmentTree::<super::MerkleHashOrchard, 32>::empty();
        let t0 = std::time::Instant::now();
        super::build_issue(&k, 10, orchard::Anchor::from(empty.root()), b"bench", 1, k.address(), true, false, 0).unwrap();
        println!("bench_issue: {:?}", t0.elapsed());
        let t1 = std::time::Instant::now();
        let _pk = orchard::circuit::ProvingKey::build::<orchard::flavor::OrchardZSA>();
        println!("bench_pk_build: {:?}", t1.elapsed());
    }
}

#[cfg(test)]
mod compact {
    /// The compact form lightwalletd serves (first 84 ciphertext bytes) decrypts ZSA notes.
    #[test]
    fn compact_decrypts_zsa_outputs() {
        let k = super::Keys::from_seed(&[7u8; 32]).unwrap();
        let (_, tx2) = super::selftest(&[7u8; 32]).unwrap();
        let b = tx2.orchard_bundle().unwrap().as_zsa_bundle();
        let mut found = vec![];
        for a in b.actions().iter() {
            let ct = &a.encrypted_note().enc_ciphertext.as_ref()[..84];
            if let Some(n) = super::try_compact(&k, &a.nullifier().to_bytes(), &a.cmx().to_bytes(), &a.encrypted_note().epk_bytes, ct) {
                found.push((n.value().inner(), bool::from(n.asset().is_zatoshi())));
            }
        }
        found.sort();
        println!("compact found {found:?}");
        assert_eq!(found, vec![(400, false), (600, false)]);
    }
}
