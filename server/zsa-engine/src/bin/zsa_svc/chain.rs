//! Orchard commitment helpers for compact blocks: ZSA lightwalletd ships issued notes in clear
//! (recipient, value, rho, rseed) next to the issuer key and asset description hash, which is
//! everything needed to recompute their commitments and keep a local note commitment tree.

use orchard::{
    issuance::auth::{IssueValidatingKey, ZSASchnorr},
    note::{AssetBase, AssetId, ExtractedNoteCommitment, RandomSeed, Rho},
    tree::MerkleHashOrchard,
    value::NoteValue,
    Address, Note,
};

use super::lwd::pb;

pub fn issuance_asset(iss: &pb::CompactIssuance) -> Option<AssetBase> {
    let ik = IssueValidatingKey::<ZSASchnorr>::decode(&iss.ik).ok()?;
    let h: [u8; 32] = iss.asset_desc_hash.as_slice().try_into().ok()?;
    Some(AssetBase::custom(&AssetId::new_v0(&ik, &h)))
}

pub fn issued_note(asset: AssetBase, n: &pb::CompactIssueNote) -> Option<Note> {
    let recipient: [u8; 43] = n.recipient.as_slice().try_into().ok()?;
    let recipient = Option::<Address>::from(Address::from_raw_address_bytes(&recipient))?;
    let rho = Option::<Rho>::from(Rho::from_bytes(&n.rho.as_slice().try_into().ok()?))?;
    let rseed = Option::<RandomSeed>::from(RandomSeed::from_bytes(n.rseed.as_slice().try_into().ok()?, &rho))?;
    Option::from(Note::from_parts(recipient, NoteValue::from_raw(n.value), asset, rho, rseed))
}

pub fn note_leaf(n: &Note) -> MerkleHashOrchard {
    MerkleHashOrchard::from_cmx(&ExtractedNoteCommitment::from(n.commitment()))
}

pub fn cmx_leaf(cmx: &[u8]) -> Option<MerkleHashOrchard> {
    let b: [u8; 32] = cmx.try_into().ok()?;
    Option::<ExtractedNoteCommitment>::from(ExtractedNoteCommitment::from_bytes(&b)).map(|c| MerkleHashOrchard::from_cmx(&c))
}

/// One event in a block's Orchard leaf sequence (Zebra's order: per tx, actions then issued notes).
pub enum Leaf<'a> {
    Action(&'a pb::CompactOrchardAction, MerkleHashOrchard),
    Issued(Note, MerkleHashOrchard),
}

/// The leaves a compact transaction appends, in order. Errors on undecodable data, since a
/// skipped leaf would silently corrupt every witness after it.
pub fn tx_leaves(tx: &pb::CompactTx) -> Result<Vec<Leaf<'_>>, String> {
    let mut out = Vec::with_capacity(tx.actions.len());
    for a in &tx.actions {
        out.push(Leaf::Action(a, cmx_leaf(&a.cmx).ok_or("bad cmx")?));
    }
    for iss in &tx.issuances {
        let asset = issuance_asset(iss).ok_or("bad issuance ik/hash")?;
        for n in &iss.notes {
            let note = issued_note(asset, n).ok_or("bad issued note")?;
            let l = note_leaf(&note);
            out.push(Leaf::Issued(note, l));
        }
    }
    Ok(out)
}
