//! Minimal lightwalletd gRPC client (cash.z.wallet.sdk.rpc.CompactTxStreamer) for the methyl ZSA
//! chain. Requests are prost messages; responses come back as raw protobuf bytes so compact blocks
//! can be passed through to browsers untouched, and are decoded locally with the partial message
//! definitions below (prost skips the fields we do not declare).

use std::{marker::PhantomData, time::Duration};

use bytes::{Buf, BufMut, Bytes};
use prost::Message;
use tonic::{
    client::Grpc,
    codec::{Codec, DecodeBuf, Decoder, EncodeBuf, Encoder},
    codegen::http::uri::PathAndQuery,
    transport::{Channel, ClientTlsConfig, Endpoint},
    Request, Status,
};

pub mod pb {
    #[derive(Clone, PartialEq, prost::Message)]
    pub struct BlockId {
        #[prost(uint64, tag = "1")]
        pub height: u64,
        #[prost(bytes = "vec", tag = "2")]
        pub hash: Vec<u8>,
    }
    #[derive(Clone, PartialEq, prost::Message)]
    pub struct BlockRange {
        #[prost(message, optional, tag = "1")]
        pub start: Option<BlockId>,
        #[prost(message, optional, tag = "2")]
        pub end: Option<BlockId>,
    }
    #[derive(Clone, PartialEq, prost::Message)]
    pub struct ChainSpec {}
    #[derive(Clone, PartialEq, prost::Message)]
    pub struct TxFilter {
        #[prost(message, optional, tag = "1")]
        pub block: Option<BlockId>,
        #[prost(uint64, tag = "2")]
        pub index: u64,
        #[prost(bytes = "vec", tag = "3")]
        pub hash: Vec<u8>,
    }
    #[derive(Clone, PartialEq, prost::Message)]
    pub struct RawTransaction {
        #[prost(bytes = "vec", tag = "1")]
        pub data: Vec<u8>,
        #[prost(uint64, tag = "2")]
        pub height: u64,
    }
    #[derive(Clone, PartialEq, prost::Message)]
    pub struct SendResponse {
        #[prost(int32, tag = "1")]
        pub error_code: i32,
        #[prost(string, tag = "2")]
        pub error_message: String,
    }
    #[derive(Clone, PartialEq, prost::Message)]
    pub struct TreeState {
        #[prost(string, tag = "1")]
        pub network: String,
        #[prost(uint64, tag = "2")]
        pub height: u64,
        #[prost(string, tag = "3")]
        pub hash: String,
        #[prost(uint32, tag = "4")]
        pub time: u32,
        #[prost(string, tag = "5")]
        pub sapling_tree: String,
        #[prost(string, tag = "6")]
        pub orchard_tree: String,
    }
    #[derive(Clone, PartialEq, prost::Message)]
    pub struct CompactBlock {
        #[prost(uint64, tag = "2")]
        pub height: u64,
        #[prost(bytes = "vec", tag = "3")]
        pub hash: Vec<u8>,
        #[prost(bytes = "vec", tag = "4")]
        pub prev_hash: Vec<u8>,
        #[prost(uint32, tag = "5")]
        pub time: u32,
        #[prost(message, repeated, tag = "7")]
        pub vtx: Vec<CompactTx>,
        #[prost(message, optional, tag = "8")]
        pub chain_metadata: Option<ChainMetadata>,
    }
    #[derive(Clone, PartialEq, prost::Message)]
    pub struct CompactTx {
        #[prost(uint64, tag = "1")]
        pub index: u64,
        #[prost(bytes = "vec", tag = "2")]
        pub txid: Vec<u8>,
        #[prost(message, repeated, tag = "6")]
        pub actions: Vec<CompactOrchardAction>,
        #[prost(message, repeated, tag = "10")]
        pub issuances: Vec<CompactIssuance>,
    }
    #[derive(Clone, PartialEq, prost::Message)]
    pub struct CompactOrchardAction {
        #[prost(bytes = "vec", tag = "1")]
        pub nullifier: Vec<u8>,
        #[prost(bytes = "vec", tag = "2")]
        pub cmx: Vec<u8>,
        #[prost(bytes = "vec", tag = "3")]
        pub ephemeral_key: Vec<u8>,
        #[prost(bytes = "vec", tag = "4")]
        pub ciphertext: Vec<u8>,
    }
    #[derive(Clone, PartialEq, prost::Message)]
    pub struct CompactIssuance {
        #[prost(bytes = "vec", tag = "1")]
        pub asset_desc_hash: Vec<u8>,
        #[prost(bool, tag = "2")]
        pub finalize: bool,
        #[prost(bytes = "vec", tag = "3")]
        pub ik: Vec<u8>,
        #[prost(uint64, tag = "4")]
        pub issued_amount: u64,
        #[prost(message, repeated, tag = "5")]
        pub notes: Vec<CompactIssueNote>,
    }
    #[derive(Clone, PartialEq, prost::Message)]
    pub struct CompactIssueNote {
        #[prost(bytes = "vec", tag = "1")]
        pub recipient: Vec<u8>,
        #[prost(uint64, tag = "2")]
        pub value: u64,
        #[prost(bytes = "vec", tag = "3")]
        pub rho: Vec<u8>,
        #[prost(bytes = "vec", tag = "4")]
        pub rseed: Vec<u8>,
    }
    #[derive(Clone, PartialEq, prost::Message)]
    pub struct ChainMetadata {
        #[prost(uint32, tag = "1")]
        pub sapling_commitment_tree_size: u32,
        #[prost(uint32, tag = "2")]
        pub orchard_commitment_tree_size: u32,
    }
}

/// Encodes a prost request, hands the response back as raw bytes.
struct RawCodec<T>(PhantomData<T>);
struct RawEnc<T>(PhantomData<T>);
struct RawDec;

impl<T: Message + Send + 'static> Codec for RawCodec<T> {
    type Encode = T;
    type Decode = Bytes;
    type Encoder = RawEnc<T>;
    type Decoder = RawDec;
    fn encoder(&mut self) -> Self::Encoder {
        RawEnc(PhantomData)
    }
    fn decoder(&mut self) -> Self::Decoder {
        RawDec
    }
}
impl<T: Message> Encoder for RawEnc<T> {
    type Item = T;
    type Error = Status;
    fn encode(&mut self, item: T, dst: &mut EncodeBuf<'_>) -> Result<(), Status> {
        dst.reserve(item.encoded_len());
        item.encode(dst).map_err(|e| Status::internal(e.to_string()))
    }
}
impl Decoder for RawDec {
    type Item = Bytes;
    type Error = Status;
    fn decode(&mut self, src: &mut DecodeBuf<'_>) -> Result<Option<Bytes>, Status> {
        let n = src.remaining();
        Ok(Some(src.copy_to_bytes(n)))
    }
}

const SVC: &str = "/cash.z.wallet.sdk.rpc.CompactTxStreamer/";

#[derive(Clone)]
pub struct Lwd {
    ch: Channel,
}

pub type R<T> = Result<T, String>;

fn st(s: Status) -> String {
    let m = s.message().to_string();
    if m.is_empty() {
        format!("{:?}", s.code())
    } else {
        m
    }
}

impl Lwd {
    pub fn new(url: &str) -> R<Self> {
        let mut ep = Endpoint::from_shared(url.to_string())
            .map_err(|e| e.to_string())?
            .connect_timeout(Duration::from_secs(15))
            .timeout(Duration::from_secs(120))
            .http2_keep_alive_interval(Duration::from_secs(30))
            .keep_alive_while_idle(true);
        if url.starts_with("https") {
            ep = ep.tls_config(ClientTlsConfig::new().with_webpki_roots()).map_err(|e| e.to_string())?;
        }
        Ok(Lwd { ch: ep.connect_lazy() })
    }

    fn grpc(&self) -> Grpc<Channel> {
        Grpc::new(self.ch.clone()).max_decoding_message_size(64 << 20)
    }

    async fn unary<T: Message + Send + 'static>(&self, method: &str, req: T) -> R<Bytes> {
        let mut g = self.grpc();
        g.ready().await.map_err(|e| format!("lightwalletd unavailable: {e}"))?;
        let path = PathAndQuery::try_from(format!("{SVC}{method}")).map_err(|e| e.to_string())?;
        let r = g.unary(Request::new(req), path, RawCodec::<T>(PhantomData)).await.map_err(st)?;
        Ok(r.into_inner())
    }

    pub async fn tip(&self) -> R<u32> {
        let b = self.unary("GetLatestBlock", pb::ChainSpec {}).await?;
        Ok(pb::BlockId::decode(b).map_err(|e| e.to_string())?.height as u32)
    }

    pub async fn tree_state(&self, height: u32) -> R<pb::TreeState> {
        let b = self.unary("GetTreeState", pb::BlockId { height: height as u64, hash: vec![] }).await?;
        pb::TreeState::decode(b).map_err(|e| e.to_string())
    }

    /// Raw transaction by txid in internal byte order (as in compact blocks).
    pub async fn transaction(&self, txid_internal: &[u8]) -> R<pb::RawTransaction> {
        let b = self
            .unary("GetTransaction", pb::TxFilter { block: None, index: 0, hash: txid_internal.to_vec() })
            .await?;
        pb::RawTransaction::decode(b).map_err(|e| e.to_string())
    }

    pub async fn send(&self, raw: Vec<u8>) -> R<pb::SendResponse> {
        let b = self.unary("SendTransaction", pb::RawTransaction { data: raw, height: 0 }).await?;
        pb::SendResponse::decode(b).map_err(|e| e.to_string())
    }

    /// Raw CompactBlock protobufs for [from, to], in height order.
    pub async fn block_range(&self, from: u32, to: u32) -> R<Vec<Bytes>> {
        let mut g = self.grpc();
        g.ready().await.map_err(|e| format!("lightwalletd unavailable: {e}"))?;
        let req = pb::BlockRange {
            start: Some(pb::BlockId { height: from as u64, hash: vec![] }),
            end: Some(pb::BlockId { height: to as u64, hash: vec![] }),
        };
        let path = PathAndQuery::from_static("/cash.z.wallet.sdk.rpc.CompactTxStreamer/GetBlockRange");
        let mut s = g
            .server_streaming(Request::new(req), path, RawCodec::<pb::BlockRange>(PhantomData))
            .await
            .map_err(st)?
            .into_inner();
        let mut out = Vec::with_capacity((to - from + 1) as usize);
        while let Some(m) = s.message().await.map_err(st)? {
            out.push(m);
        }
        Ok(out)
    }
}

pub fn decode_block(b: &[u8]) -> R<pb::CompactBlock> {
    pb::CompactBlock::decode(b).map_err(|e| e.to_string())
}

/// Internal byte order <-> display hex.
pub fn txid_hex(internal: &[u8]) -> String {
    let mut v = internal.to_vec();
    v.reverse();
    hex::encode(v)
}

pub fn txid_internal(display_hex: &str) -> R<Vec<u8>> {
    let mut v = hex::decode(display_hex.trim()).map_err(|e| e.to_string())?;
    if v.len() != 32 {
        return Err("txid must be 32 bytes of hex".into());
    }
    v.reverse();
    Ok(v)
}

#[allow(dead_code)]
pub fn put_len_prefixed(out: &mut Vec<u8>, b: &[u8]) {
    out.put_u32(b.len() as u32);
    out.extend_from_slice(b);
}
