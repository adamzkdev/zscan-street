//! zsa-svc: backend of ZStreet's ZSA Lab on the methyl ZSA testnet.
//!
//! - lightwalletd proxy for browser wallets (compact blocks, tree states, txs, broadcast)
//! - sponsor wallet that drips a little shielded ZEC to new burner wallets
//! - index of every ZSA asset and an event feed, following the tip
//!
//! Env: ZSA_ADDR (127.0.0.1:8095), ZSA_LWD (https://zsa.methyl.cc:443), ZSA_DATA_DIR (./zsa-data),
//! ZSA_SEED_FILE (sponsor seed hex; default .secrets/seed.hex next to Cargo.toml), ZSA_DRIP_ZAT
//! (60000), ZSA_WATCH_FROM (1), ZSA_SPONSOR_BIRTHDAY (tip-2000 on first run), ZSA_DRIPS_PER_IP
//! (3), ZSA_DRIPS_PER_DAY (200), ZSA_FEE_MULT (1).

#[path = "zsa_svc/chain.rs"]
mod chain;
#[path = "zsa_svc/index.rs"]
mod index;
#[path = "zsa_svc/lwd.rs"]
mod lwd;
#[path = "zsa_svc/sponsor.rs"]
mod sponsor;
#[path = "zsa_svc/offers.rs"]
mod offers;

use std::{
    collections::{BTreeMap, HashMap},
    net::SocketAddr,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicU32, Ordering},
        Arc, Mutex as StdMutex,
    },
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

use axum::{
    body::Body,
    extract::{ConnectInfo, Path as UrlPath, Query, State},
    http::{header, HeaderMap, Method, StatusCode},
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use bytes::Bytes;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tokio::sync::{mpsc, oneshot, Mutex, RwLock};
use tower_http::cors::{Any, CorsLayer};
use zapp_zsa_engine::{build_tx, decode_ua, encode_ua, parse_tx, tx_bytes, Keys};
use zcash_protocol::consensus::NetworkType;

use index::Index;
use lwd::Lwd;
use sponsor::{PlanError, Wallet};

pub fn write_atomic(path: &Path, data: &[u8]) -> Result<(), String> {
    let tmp = path.with_extension("tmp");
    std::fs::write(&tmp, data).map_err(|e| format!("{}: {e}", tmp.display()))?;
    std::fs::rename(&tmp, path).map_err(|e| format!("{}: {e}", path.display()))
}

fn env_u64(k: &str, d: u64) -> u64 {
    std::env::var(k).ok().and_then(|v| v.trim().parse().ok()).unwrap_or(d)
}

fn now_secs() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

fn log(msg: impl AsRef<str>) {
    eprintln!("[{}] {}", now_secs(), msg.as_ref());
}

// ---------------------------------------------------------------- block cache

/// Recent compact blocks, raw, bounded by total bytes; evicts the lowest heights first.
struct BlockCache {
    map: BTreeMap<u32, Bytes>,
    bytes: usize,
    budget: usize,
}

impl BlockCache {
    fn insert(&mut self, h: u32, b: Bytes) {
        self.bytes += b.len();
        if let Some(old) = self.map.insert(h, b) {
            self.bytes -= old.len();
        }
        while self.bytes > self.budget {
            let Some((_, v)) = self.map.pop_first() else { break };
            self.bytes -= v.len();
        }
    }
    fn get_range(&self, from: u32, to: u32) -> Option<Vec<Bytes>> {
        let mut out = Vec::with_capacity((to - from + 1) as usize);
        for h in from..=to {
            out.push(self.map.get(&h)?.clone());
        }
        Some(out)
    }
}

/// Only blocks this deep are cached (a reorg above that is just refetched).
const CACHE_CONF: u32 = 3;
/// ... and only this recent (the initial whole-chain scan should not flush what browsers need).
const CACHE_WINDOW: u32 = 50_000;

// ---------------------------------------------------------------- drip limits

#[derive(Default, Serialize, Deserialize)]
struct Limits {
    /// orchard receiver (hex) -> txid ("pending" while queued)
    addresses: BTreeMap<String, String>,
    day: u64,
    global: u32,
    ips: BTreeMap<String, u32>,
    total: u64,
}

impl Limits {
    fn roll(&mut self) {
        let d = now_secs() / 86_400;
        if d != self.day {
            self.day = d;
            self.global = 0;
            self.ips.clear();
        }
    }
}

// ---------------------------------------------------------------- app

struct Cfg {
    drip: u64,
    per_ip: u32,
    per_day: u32,
    fee_mult: u64,
    watch_from: u32,
    data: PathBuf,
}

struct DripReq {
    to: orchard::Address,
    reply: oneshot::Sender<Result<String, String>>,
}

struct App {
    lwd: Lwd,
    cfg: Cfg,
    tip: AtomicU32,
    cache: StdMutex<BlockCache>,
    keys: Option<Arc<Keys>>,
    sponsor_addr: Option<String>,
    wallet: Mutex<Option<Wallet>>,
    index: RwLock<Index>,
    limits: StdMutex<Limits>,
    offers: Mutex<offers::Board>,
    drip_tx: mpsc::Sender<DripReq>,
    started: Instant,
}

type St = Arc<App>;

impl App {
    async fn refresh_tip(&self) -> Result<u32, String> {
        let t = self.lwd.tip().await?;
        self.tip.store(t, Ordering::Relaxed);
        Ok(t)
    }

    /// Raw compact blocks [from, to] (to <= tip), from cache or lightwalletd.
    async fn blocks(&self, from: u32, to: u32) -> Result<Vec<Bytes>, String> {
        if let Some(v) = self.cache.lock().unwrap().get_range(from, to) {
            return Ok(v);
        }
        let v = self.lwd.block_range(from, to).await?;
        if v.len() != (to - from + 1) as usize {
            return Err(format!("lightwalletd returned {} blocks for {from}..={to}", v.len()));
        }
        let tip = self.tip.load(Ordering::Relaxed).max(to);
        let mut c = self.cache.lock().unwrap();
        for (i, b) in v.iter().enumerate() {
            let h = from + i as u32;
            if h + CACHE_CONF <= tip && h + CACHE_WINDOW > tip {
                c.insert(h, b.clone());
            }
        }
        Ok(v)
    }

    fn save_limits(&self, l: &Limits) {
        if let Err(e) = write_atomic(&self.cfg.data.join("drips.json"), serde_json::to_string(l).unwrap().as_bytes()) {
            log(format!("save drips.json: {e}"));
        }
    }
}

// ---------------------------------------------------------------- sponsor sync + drip worker

async fn init_wallet(app: &App) -> Result<Wallet, String> {
    let tip = app.refresh_tip().await?;
    let bday = std::env::var("ZSA_SPONSOR_BIRTHDAY")
        .ok()
        .and_then(|v| v.parse::<u32>().ok())
        .unwrap_or(tip.saturating_sub(2000))
        .max(1);
    let ts = app.lwd.tree_state(bday).await?;
    let hash = {
        // TreeState.hash is display hex; compact blocks carry internal order.
        let mut h = hex::decode(&ts.hash).map_err(|e| e.to_string())?;
        h.reverse();
        h
    };
    log(format!("sponsor wallet: new state, birthday {bday}"));
    Wallet::new(bday, &ts.orchard_tree, hash, app.cfg.data.join("sponsor.json"))
}

/// Brings the sponsor wallet to the tip. Rescans from the birthday on a reorg.
async fn sync_wallet(app: &App) -> Result<(), String> {
    let Some(keys) = app.keys.clone() else { return Ok(()) };
    let mut guard = app.wallet.lock().await;
    if guard.is_none() {
        *guard = Some(init_wallet(app).await?);
    }
    let tip = app.refresh_tip().await?;
    loop {
        let w = guard.as_mut().unwrap();
        if w.synced >= tip {
            break;
        }
        let from = w.synced + 1;
        let to = (from + 999).min(tip);
        let raw = app.blocks(from, to).await?;
        let mut res = Ok(());
        for b in &raw {
            let cb = lwd::decode_block(b)?;
            res = w.apply_block(&keys, &cb);
            if res.is_err() {
                break;
            }
        }
        match res {
            Ok(()) => w.save()?,
            Err(e) if e == "reorg" => {
                log(format!("sponsor wallet: reorg near {}, rescanning from birthday", w.synced));
                let bday = w.birthday;
                std::env::set_var("ZSA_SPONSOR_BIRTHDAY", bday.to_string());
                let pend: Vec<_> = w.notes.iter().filter_map(|n| n.pending.clone().map(|p| (n.nf, p))).collect();
                let mut nw = init_wallet(app).await?;
                for (nf, p) in pend {
                    nw.mark_pending(&[nf], &p.txid, p.at);
                }
                *guard = Some(nw);
            }
            Err(e) => {
                let _ = w.save();
                return Err(e);
            }
        }
    }
    Ok(())
}

async fn do_drip(app: &App, to: orchard::Address) -> Result<String, String> {
    let keys = app.keys.clone().ok_or("drip disabled: no sponsor seed")?;
    let deadline = Instant::now() + Duration::from_secs(240);
    let plan = loop {
        sync_wallet(app).await?;
        let r = app.wallet.lock().await.as_ref().unwrap().plan_drip(&keys, to, app.cfg.drip, app.cfg.fee_mult);
        match r {
            Ok(p) => break p,
            Err(PlanError::Wait) if Instant::now() < deadline => tokio::time::sleep(Duration::from_secs(10)).await,
            Err(PlanError::Wait) => return Err("sponsor busy (waiting for change to confirm), try again in a minute".into()),
            Err(PlanError::Refuse(e)) => return Err(e),
        }
    };
    let nfs = plan.nfs.clone();
    let fee = plan.fee;
    let t0 = Instant::now();
    let k2 = keys.clone();
    let tx = tokio::task::spawn_blocking(move || {
        build_tx(&k2, plan.target_height, plan.anchor, plan.spends, plan.outputs, None, plan.fee)
    })
    .await
    .map_err(|e| e.to_string())??;
    let txid = tx.txid().to_string();
    let raw = tx_bytes(&tx);
    log(format!("drip {txid}: built in {:?}, {} B, fee {fee}", t0.elapsed(), raw.len()));
    let r = app.lwd.send(raw).await?;
    if r.error_code != 0 {
        return Err(format!("node rejected drip: {}", r.error_message));
    }
    let mut g = app.wallet.lock().await;
    let w = g.as_mut().unwrap();
    w.mark_pending(&nfs, &txid, w.synced);
    w.save()?;
    Ok(txid)
}

async fn drip_worker(app: St, mut rx: mpsc::Receiver<DripReq>) {
    while let Some(req) = rx.recv().await {
        let r = do_drip(&app, req.to).await;
        if let Err(e) = &r {
            log(format!("drip failed: {e}"));
        }
        let _ = req.reply.send(r);
    }
}

// ---------------------------------------------------------------- watcher

async fn index_step(app: &App, tip: u32) -> Result<bool, String> {
    let scanned = app.index.read().await.scanned;
    if scanned >= tip {
        return Ok(false);
    }
    let from = scanned + 1;
    let to = (from + 999).min(tip);
    let raw = app.blocks(from, to).await?;
    let blocks: Vec<lwd::pb::CompactBlock> = raw.iter().map(|b| lwd::decode_block(b)).collect::<Result<_, _>>()?;
    // Full transactions for every tx with Orchard actions (burns, ZSA vs vanilla bundle).
    let ids: Vec<Vec<u8>> =
        blocks.iter().flat_map(|b| b.vtx.iter()).filter(|t| !t.actions.is_empty()).map(|t| t.txid.clone()).collect();
    let mut full = HashMap::new();
    for chunk in ids.chunks(8) {
        let mut set = tokio::task::JoinSet::new();
        for id in chunk {
            let l = app.lwd.clone();
            let id = id.clone();
            set.spawn(async move {
                let mut last = None;
                for _ in 0..3 {
                    match l.transaction(&id).await {
                        Ok(r) => return (id, parse_tx(&r.data).ok()),
                        Err(e) => last = Some(e),
                    }
                    tokio::time::sleep(Duration::from_millis(500)).await;
                }
                log(format!("index: GetTransaction {} failed: {:?}", lwd::txid_hex(&id), last));
                (id, None)
            });
        }
        while let Some(r) = set.join_next().await {
            let (id, tx) = r.map_err(|e| e.to_string())?;
            full.insert(id, tx);
        }
    }
    let mut idx = app.index.write().await;
    for b in &blocks {
        if b.height as u32 != idx.scanned + 1 {
            return Err(format!("index: expected block {}, got {}", idx.scanned + 1, b.height));
        }
        idx.apply_block(b, &full);
    }
    save_index(app, &idx);
    if to < tip {
        log(format!("index: scanned {to}/{tip}, {} assets, {} events", idx.assets.len(), idx.events.len()));
    }
    Ok(to < tip)
}

fn save_index(app: &App, idx: &Index) {
    if let Err(e) = write_atomic(&app.cfg.data.join("index.json"), serde_json::to_string(idx).unwrap().as_bytes()) {
        log(format!("save index.json: {e}"));
    }
}

async fn watcher(app: St) {
    loop {
        match app.refresh_tip().await {
            Ok(tip) => {
                loop {
                    match index_step(&app, tip).await {
                        Ok(true) => continue,
                        Ok(false) => break,
                        Err(e) => {
                            log(format!("index: {e}"));
                            break;
                        }
                    }
                }
                if let Err(e) = sync_wallet(&app).await {
                    log(format!("sponsor sync: {e}"));
                }
            }
            Err(e) => log(format!("tip: {e}")),
        }
        tokio::time::sleep(Duration::from_secs(10)).await;
    }
}

// ---------------------------------------------------------------- http

fn err(code: StatusCode, msg: impl Into<String>) -> Response {
    (code, Json(json!({ "error": msg.into() }))).into_response()
}

async fn health(State(app): State<St>) -> Response {
    let idx = app.index.read().await.scanned;
    Json(json!({ "ok": true, "tip": app.tip.load(Ordering::Relaxed), "indexed": idx, "uptime_s": app.started.elapsed().as_secs() }))
        .into_response()
}

async fn info(State(app): State<St>) -> Response {
    let sponsor = match &app.sponsor_addr {
        Some(addr) => {
            let g = app.wallet.lock().await;
            let (bal, sp, pend, synced) =
                g.as_ref().map_or((0, 0, 0, 0), |w| (w.balance(), w.spendable(), w.pending_value(), w.synced));
            json!({ "address": addr, "balance_zat": bal, "spendable_zat": sp, "pending_zat": pend, "synced": synced })
        }
        None => Value::Null,
    };
    let idx = app.index.read().await;
    let l = app.limits.lock().unwrap();
    Json(json!({
        "network": "methyl",
        "tip": app.tip.load(Ordering::Relaxed),
        "indexed": idx.scanned,
        "sponsor": sponsor,
        "drip_zat": app.cfg.drip,
        "drips_today": l.global,
        "drips_per_day": app.cfg.per_day,
        "assets": idx.assets.len(),
        "events": idx.events.len(),
    }))
    .into_response()
}

#[derive(Deserialize)]
struct RangeQ {
    from: u32,
    to: u32,
}

async fn blocks(State(app): State<St>, Query(q): Query<RangeQ>) -> Response {
    let mut tip = app.tip.load(Ordering::Relaxed);
    if q.to > tip {
        tip = match app.refresh_tip().await {
            Ok(t) => t,
            Err(e) => return err(StatusCode::BAD_GATEWAY, e),
        };
    }
    let to = q.to.min(tip);
    if q.from == 0 || q.from > to {
        return err(StatusCode::BAD_REQUEST, format!("bad range {}..{} (tip {tip})", q.from, q.to));
    }
    if to - q.from + 1 > 1000 {
        return err(StatusCode::BAD_REQUEST, "at most 1000 blocks per request");
    }
    match app.blocks(q.from, to).await {
        Ok(v) => {
            let mut out = Vec::with_capacity(v.iter().map(|b| b.len() + 4).sum());
            for b in &v {
                lwd::put_len_prefixed(&mut out, b);
            }
            (
                [(header::CONTENT_TYPE, "application/octet-stream"), (header::CACHE_CONTROL, "no-store")],
                [("x-zsa-tip", tip.to_string()), ("x-zsa-to", to.to_string())],
                Body::from(out),
            )
                .into_response()
        }
        Err(e) => err(StatusCode::BAD_GATEWAY, e),
    }
}

async fn treestate(State(app): State<St>, UrlPath(h): UrlPath<u32>) -> Response {
    match app.lwd.tree_state(h).await {
        Ok(t) => Json(json!({
            "network": t.network, "height": t.height, "hash": t.hash, "time": t.time,
            "saplingTree": t.sapling_tree, "orchardTree": t.orchard_tree,
        }))
        .into_response(),
        Err(e) => err(StatusCode::BAD_GATEWAY, e),
    }
}

async fn get_tx(State(app): State<St>, UrlPath(txid): UrlPath<String>) -> Response {
    let id = match lwd::txid_internal(&txid) {
        Ok(i) => i,
        Err(e) => return err(StatusCode::BAD_REQUEST, e),
    };
    match app.lwd.transaction(&id).await {
        Ok(r) => {
            // lightwalletd: height 0 = mempool, u64::MAX-ish = not in best chain.
            let height = if r.height == 0 || r.height >= u32::MAX as u64 { Value::Null } else { json!(r.height) };
            Json(json!({ "hex": hex::encode(&r.data), "height": height })).into_response()
        }
        Err(e) => err(StatusCode::NOT_FOUND, e),
    }
}

#[derive(Deserialize)]
struct BroadcastReq {
    hex: String,
    /// Optional ZIP 227 asset description of an issuance in this tx (stored after hash check).
    asset_desc: Option<String>,
}

async fn broadcast(State(app): State<St>, Json(b): Json<BroadcastReq>) -> Response {
    let raw = match hex::decode(b.hex.trim()) {
        Ok(r) => r,
        Err(e) => return err(StatusCode::BAD_REQUEST, format!("bad hex: {e}")),
    };
    let txid = match parse_tx(&raw) {
        Ok(t) => t.txid().to_string(),
        Err(e) => return err(StatusCode::BAD_REQUEST, format!("unparseable v6 tx: {e}")),
    };
    match app.lwd.send(raw).await {
        Ok(r) if r.error_code == 0 => {
            if let Some(d) = b.asset_desc.filter(|d| !d.is_empty()) {
                let mut idx = app.index.write().await;
                if idx.add_name(d.as_bytes()).is_some() {
                    save_index(&app, &idx);
                }
            }
            Json(json!({ "txid": txid })).into_response()
        }
        Ok(r) => err(StatusCode::BAD_REQUEST, if r.error_message.is_empty() { format!("error {}", r.error_code) } else { r.error_message }),
        Err(e) => err(StatusCode::BAD_REQUEST, e),
    }
}

#[derive(Deserialize)]
struct NameReq {
    asset_desc: String,
}

async fn name(State(app): State<St>, Json(b): Json<NameReq>) -> Response {
    let mut idx = app.index.write().await;
    match idx.add_name(b.asset_desc.as_bytes()) {
        Some((hash, n)) => {
            save_index(&app, &idx);
            Json(json!({ "desc_hash": hash, "assets": n })).into_response()
        }
        None => err(StatusCode::BAD_REQUEST, "empty description or registry full"),
    }
}

#[derive(Deserialize)]
struct DripBody {
    address: String,
}

fn client_ip(h: &HeaderMap, peer: SocketAddr) -> String {
    h.get("x-forwarded-for")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.split(',').last())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| peer.ip().to_string())
}

async fn drip(State(app): State<St>, ConnectInfo(peer): ConnectInfo<SocketAddr>, headers: HeaderMap, Json(b): Json<DripBody>) -> Response {
    if app.keys.is_none() {
        return err(StatusCode::SERVICE_UNAVAILABLE, "drip disabled: no sponsor seed configured");
    }
    let addr = b.address.trim();
    if !(addr.starts_with("uregtest1") || addr.starts_with("utest1")) {
        return err(StatusCode::BAD_REQUEST, "expected a uregtest1 unified address with an Orchard receiver");
    }
    let to = match decode_ua(addr) {
        Ok(a) => a,
        Err(e) => return err(StatusCode::BAD_REQUEST, format!("bad address: {e}")),
    };
    let key = hex::encode(to.to_raw_address_bytes());
    let ip = client_ip(&headers, peer);
    // Quick funds check before queueing.
    {
        let g = app.wallet.lock().await;
        if let Some(w) = g.as_ref() {
            if w.spendable() + w.pending_value() < app.cfg.drip + sponsor::fee_for(1, 4, app.cfg.fee_mult) {
                return err(StatusCode::SERVICE_UNAVAILABLE, "sponsor wallet is empty, try again later");
            }
        }
    }
    {
        let mut l = app.limits.lock().unwrap();
        l.roll();
        if let Some(t) = l.addresses.get(&key) {
            return err(StatusCode::TOO_MANY_REQUESTS, format!("this address already got a drip ({t})"));
        }
        if *l.ips.get(&ip).unwrap_or(&0) >= app.cfg.per_ip {
            return err(StatusCode::TOO_MANY_REQUESTS, "drip limit for your IP reached today");
        }
        if l.global >= app.cfg.per_day {
            return err(StatusCode::TOO_MANY_REQUESTS, "daily drip budget reached, try tomorrow");
        }
        l.addresses.insert(key.clone(), "pending".into());
        *l.ips.entry(ip.clone()).or_default() += 1;
        l.global += 1;
    }
    let (tx, rx) = oneshot::channel();
    let res = match app.drip_tx.try_send(DripReq { to, reply: tx }) {
        Ok(()) => match tokio::time::timeout(Duration::from_secs(300), rx).await {
            Ok(Ok(r)) => r,
            _ => Err("drip timed out".into()),
        },
        Err(_) => Err("drip queue full, try again shortly".into()),
    };
    let mut l = app.limits.lock().unwrap();
    match res {
        Ok(txid) => {
            l.addresses.insert(key, txid.clone());
            l.total += 1;
            app.save_limits(&l);
            log(format!("drip ok {txid} ip {ip}"));
            Json(json!({ "txid": txid, "amount_zat": app.cfg.drip })).into_response()
        }
        Err(e) => {
            l.addresses.remove(&key);
            if let Some(n) = l.ips.get_mut(&ip) {
                *n = n.saturating_sub(1);
            }
            l.global = l.global.saturating_sub(1);
            app.save_limits(&l);
            err(StatusCode::SERVICE_UNAVAILABLE, e)
        }
    }
}

async fn assets(State(app): State<St>) -> Response {
    let idx = app.index.read().await;
    let mut v: Vec<&index::Asset> = idx.assets.values().collect();
    v.sort_by(|a, b| (b.first_height, b.last_height).cmp(&(a.first_height, a.last_height)));
    let out: Vec<Value> = v
        .iter()
        .map(|a| {
            json!({
                "asset_id": a.asset_id,
                "name": idx.name_of(a),
                "desc_hash": a.desc_hash,
                "issuer": a.issuer,
                "issued": a.issued,
                "issued_str": a.issued.to_string(),
                "finalized": a.finalized,
                "burned": a.burned,
                "first_height": a.first_height,
                "last_height": a.last_height,
                "txs": a.txs,
                "txids": a.txids,
            })
        })
        .collect();
    Json(out).into_response()
}

#[derive(Deserialize)]
struct EventsQ {
    since: Option<u32>,
    limit: Option<usize>,
}

async fn events(State(app): State<St>, Query(q): Query<EventsQ>) -> Response {
    let idx = app.index.read().await;
    let since = q.since.unwrap_or(0);
    let limit = q.limit.unwrap_or(100).clamp(1, 1000);
    let out: Vec<Value> = idx
        .events
        .iter()
        .rev()
        .take_while(|e| e.height >= since)
        .take(limit)
        .map(|e| {
            let name = e.asset_id.as_ref().and_then(|id| idx.assets.get(id)).and_then(|a| idx.name_of(a));
            json!({
                "height": e.height, "time": e.time, "txid": e.txid, "kind": e.kind,
                "asset_id": e.asset_id, "name": name, "amount": e.amount,
            })
        })
        .collect();
    Json(out).into_response()
}

// ---------------------------------------------------------------- main

fn load_seed() -> Option<Vec<u8>> {
    let p = std::env::var("ZSA_SEED_FILE")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(".secrets/seed.hex"));
    match std::fs::read_to_string(&p) {
        Ok(s) => match hex::decode(s.trim()) {
            Ok(b) if b.len() >= 32 => Some(b),
            _ => {
                log(format!("seed file {} is not hex (>= 32 bytes); drip disabled", p.display()));
                None
            }
        },
        Err(_) => {
            log(format!("no seed file at {}; drip disabled", p.display()));
            None
        }
    }
}

/// `zsa-svc addr <seedfile>`: the uregtest1 address of a seed.
/// `zsa-svc scan <seedfile> <from> [to]`: ZEC/ZSA notes received by a seed (compact trial decryption).
async fn cli(args: &[String]) -> bool {
    let read = |p: &str| hex::decode(std::fs::read_to_string(p).expect("seed file").trim()).expect("seed hex");
    match args.get(1).map(|s| s.as_str()) {
        Some("addr") => {
            let k = Keys::from_seed(&read(&args[2])).unwrap();
            println!("{}", encode_ua(&k.address(), NetworkType::Regtest));
            true
        }
        Some("scan") => {
            let k = Keys::from_seed(&read(&args[2])).unwrap();
            let l = Lwd::new(&std::env::var("ZSA_LWD").unwrap_or("https://zsa.methyl.cc:443".into())).unwrap();
            let from: u32 = args[3].parse().unwrap();
            let to: u32 = match args.get(4) { Some(t) => t.parse().unwrap(), None => l.tip().await.unwrap() };
            let mut h = from;
            while h <= to {
                let e = (h + 999).min(to);
                for raw in l.block_range(h, e).await.unwrap() {
                    let b = lwd::decode_block(&raw).unwrap();
                    for tx in &b.vtx {
                        for a in &tx.actions {
                            if let Some(n) = zapp_zsa_engine::try_compact(&k, &a.nullifier, &a.cmx, &a.ephemeral_key, &a.ciphertext) {
                                println!("{} {} received {} of {}", b.height, lwd::txid_hex(&tx.txid), n.value().inner(),
                                    if bool::from(n.asset().is_zatoshi()) { "ZEC".to_string() } else { hex::encode(n.asset().to_bytes()) });
                            }
                        }
                    }
                }
                h = e + 1;
            }
            true
        }
        _ => false,
    }
}

#[tokio::main(worker_threads = 2)]
async fn main() {
    let args: Vec<String> = std::env::args().collect();
    if cli(&args).await {
        return;
    }
    let addr: SocketAddr = std::env::var("ZSA_ADDR").unwrap_or("127.0.0.1:8095".into()).parse().expect("ZSA_ADDR");
    let lwd_url = std::env::var("ZSA_LWD").unwrap_or("https://zsa.methyl.cc:443".into());
    let data = PathBuf::from(std::env::var("ZSA_DATA_DIR").unwrap_or("zsa-data".into()));
    std::fs::create_dir_all(&data).expect("create ZSA_DATA_DIR");
    let cfg = Cfg {
        drip: env_u64("ZSA_DRIP_ZAT", 60_000),
        per_ip: env_u64("ZSA_DRIPS_PER_IP", 3) as u32,
        per_day: env_u64("ZSA_DRIPS_PER_DAY", 200) as u32,
        fee_mult: env_u64("ZSA_FEE_MULT", 1).max(1),
        watch_from: env_u64("ZSA_WATCH_FROM", 1).max(1) as u32,
        data: data.clone(),
    };

    let keys = load_seed().map(|s| Arc::new(Keys::from_seed(&s).expect("sponsor keys")));
    let sponsor_addr = keys.as_ref().map(|k| encode_ua(&k.address(), NetworkType::Regtest));
    if let Some(a) = &sponsor_addr {
        log(format!("sponsor {a}"));
    }
    let wallet = match Wallet::load(data.join("sponsor.json")) {
        Ok(w) => w,
        Err(e) => panic!("sponsor.json: {e}"),
    };
    let mut idx: Index = std::fs::read_to_string(data.join("index.json"))
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default();
    if idx.scanned == 0 || idx.from != cfg.watch_from {
        let names = std::mem::take(&mut idx.names);
        idx = Index { from: cfg.watch_from, scanned: cfg.watch_from - 1, names, ..Default::default() };
    }
    let limits: Limits = std::fs::read_to_string(data.join("drips.json"))
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default();

    let (drip_tx, drip_rx) = mpsc::channel(64);
    let app = Arc::new(App {
        lwd: Lwd::new(&lwd_url).expect("ZSA_LWD"),
        cfg,
        tip: AtomicU32::new(0),
        cache: StdMutex::new(BlockCache { map: BTreeMap::new(), bytes: 0, budget: (env_u64("ZSA_CACHE_MB", 24) as usize) << 20 }),
        keys,
        sponsor_addr,
        wallet: Mutex::new(wallet),
        index: RwLock::new(idx),
        limits: StdMutex::new(limits),
        offers: Mutex::new(offers::Board::load(&data.join("offers.json"))),
        drip_tx,
        started: Instant::now(),
    });
    if let Err(e) = app.refresh_tip().await {
        log(format!("lightwalletd {lwd_url}: {e}"));
    }
    tokio::spawn(watcher(app.clone()));
    tokio::spawn(drip_worker(app.clone(), drip_rx));

    let cors = CorsLayer::new().allow_origin(Any).allow_methods([Method::GET, Method::POST, Method::OPTIONS]).allow_headers(Any);
    let r = Router::new()
        .route("/health", get(health))
        .route("/v1/zsa/info", get(info))
        .route("/v1/zsa/blocks", get(blocks))
        .route("/v1/zsa/treestate/{height}", get(treestate))
        .route("/v1/zsa/tx/{txid}", get(get_tx))
        .route("/v1/zsa/broadcast", post(broadcast))
        .route("/v1/zsa/drip", post(drip))
        .route("/v1/zsa/name", post(name))
        .route("/v1/zsa/assets", get(assets))
        .route("/v1/zsa/events", get(events))
        .route("/v1/zsa/offers", get(offers::list).post(offers::create))
        .route("/v1/zsa/offers/{id}", get(offers::get_one))
        .route("/v1/zsa/offers/{id}/take", post(offers::take))
        .route("/v1/zsa/offers/{id}/complete", post(offers::complete))
        .route("/v1/zsa/offers/{id}/cancel", post(offers::cancel))
        .layer(cors)
        .with_state(app.clone());
    let listener = tokio::net::TcpListener::bind(addr).await.expect("bind ZSA_ADDR");
    log(format!("zsa-svc listening on {addr}, lightwalletd {lwd_url}, data {}", data.display()));
    axum::serve(listener, r.into_make_service_with_connect_info::<SocketAddr>())
        .with_graceful_shutdown(async {
            #[cfg(unix)]
            {
                let mut term = tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate()).expect("sigterm");
                tokio::select! { _ = tokio::signal::ctrl_c() => {}, _ = term.recv() => {} }
            }
            #[cfg(not(unix))]
            let _ = tokio::signal::ctrl_c().await;
        })
        .await
        .expect("serve");
    let w = app.wallet.lock().await;
    if let Some(w) = w.as_ref() {
        let _ = w.save();
    }
    log("bye");
}
