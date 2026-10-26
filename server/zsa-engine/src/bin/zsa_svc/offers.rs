//! Player-to-player exchange board. methyl has no ZIP 228 swaps (a v6 tx carries one action
//! group), so a trade is two separate shielded payments: the taker pays the maker first, then the
//! maker pays the taker. The server only keeps the board; it cannot see shielded payments.
//! Persisted in ZSA_DATA_DIR/offers.json.

use std::{collections::BTreeMap, net::SocketAddr};

use axum::{
    extract::{ConnectInfo, Path as UrlPath, State},
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use rand_core::RngCore;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use super::{client_ip, err, log, now_secs, write_atomic, St};

const TTL: u64 = 86_400;
const KEEP_CLOSED: u64 = 7 * 86_400;
const PER_IP_DAY: u32 = 10;
const MAX_OPEN: usize = 2000;
const LIST_MAX: usize = 100;

#[derive(Clone, Serialize, Deserialize)]
pub struct Offer {
    id: String,
    give_asset: String,
    give_amount: u64,
    want_asset: String,
    want_amount: u64,
    maker_address: String,
    note: Option<String>,
    status: String,
    taker_address: Option<String>,
    taker_txid: Option<String>,
    maker_txid: Option<String>,
    created_at: u64,
    updated_at: u64,
    secret_hash: String,
}

#[derive(Default, Serialize, Deserialize)]
pub struct Board {
    offers: Vec<Offer>,
    day: u64,
    ips: BTreeMap<String, u32>,
}

fn hash_secret(s: &str) -> String {
    hex::encode(blake2b_simd::Params::new().hash_length(32).personal(b"zsa-svc-offer\0\0\0").hash(s.as_bytes()).as_bytes())
}

fn rand_hex(n: usize) -> String {
    let mut b = vec![0u8; n];
    rand_core::OsRng.fill_bytes(&mut b);
    hex::encode(b)
}

fn norm_asset(a: &str) -> Result<String, String> {
    let a = a.trim().to_ascii_lowercase();
    if a == "zec" {
        return Ok(a);
    }
    if a.len() == 64 && a.chars().all(|c| c.is_ascii_hexdigit()) {
        return Ok(a);
    }
    Err(format!("asset must be \"zec\" or a 64-hex asset id, got {a:?}"))
}

fn check_addr(a: &str, what: &str) -> Result<String, String> {
    let a = a.trim();
    if !a.starts_with("uregtest1") {
        return Err(format!("{what} must be a uregtest1 unified address"));
    }
    zapp_zsa_engine::decode_ua(a).map_err(|e| format!("{what}: {e}"))?;
    Ok(a.to_string())
}

fn check_txid(t: &str) -> Result<String, String> {
    let t = t.trim().to_ascii_lowercase();
    if t.len() == 64 && t.chars().all(|c| c.is_ascii_hexdigit()) {
        Ok(t)
    } else {
        Err("txid must be 64 hex characters".into())
    }
}

impl Board {
    pub fn load(path: &std::path::Path) -> Board {
        std::fs::read_to_string(path).ok().and_then(|s| serde_json::from_str(&s).ok()).unwrap_or_default()
    }

    /// Expires open offers past their TTL and forgets old closed ones.
    fn tick(&mut self) {
        let now = now_secs();
        for o in self.offers.iter_mut() {
            if o.status == "open" && now >= o.created_at + TTL {
                o.status = "expired".into();
                o.updated_at = o.created_at + TTL;
            }
        }
        self.offers.retain(|o| matches!(o.status.as_str(), "open" | "taken") || o.updated_at + KEEP_CLOSED > now);
        let d = now / 86_400;
        if d != self.day {
            self.day = d;
            self.ips.clear();
        }
    }
}

async fn save(app: &St, b: &Board) {
    if let Err(e) = write_atomic(&app.cfg.data.join("offers.json"), serde_json::to_string(b).unwrap().as_bytes()) {
        log(format!("save offers.json: {e}"));
    }
}

async fn view(app: &St, o: &Offer) -> Value {
    let idx = app.index.read().await;
    let name = |a: &str| -> Option<String> {
        if a == "zec" {
            Some("tZEC".into())
        } else {
            idx.assets.get(a).and_then(|x| idx.name_of(x))
        }
    };
    json!({
        "id": o.id,
        "give_asset": o.give_asset, "give_name": name(&o.give_asset), "give_amount": o.give_amount,
        "want_asset": o.want_asset, "want_name": name(&o.want_asset), "want_amount": o.want_amount,
        "maker_address": o.maker_address, "note": o.note,
        "status": o.status,
        "taker_address": o.taker_address, "taker_txid": o.taker_txid, "maker_txid": o.maker_txid,
        "created_at": o.created_at, "updated_at": o.updated_at,
    })
}

#[derive(Deserialize)]
pub struct NewOffer {
    give_asset: String,
    give_amount: u64,
    want_asset: String,
    want_amount: u64,
    maker_address: String,
    note: Option<String>,
}

pub async fn create(
    State(app): State<St>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Json(r): Json<NewOffer>,
) -> Response {
    let v = (|| -> Result<(String, String, String, Option<String>), String> {
        let g = norm_asset(&r.give_asset)?;
        let w = norm_asset(&r.want_asset)?;
        if g == w {
            return Err("give_asset and want_asset must differ".into());
        }
        if r.give_amount == 0 || r.want_amount == 0 {
            return Err("amounts must be > 0".into());
        }
        let m = check_addr(&r.maker_address, "maker_address")?;
        let note = r
            .note
            .as_deref()
            .map(|n| n.trim().chars().filter(|c| !c.is_control()).take(140).collect::<String>())
            .filter(|n| !n.is_empty());
        Ok((g, w, m, note))
    })();
    let (give, want, maker, note) = match v {
        Ok(x) => x,
        Err(e) => return err(StatusCode::BAD_REQUEST, e),
    };
    let ip = client_ip(&headers, peer);
    let mut b = app.offers.lock().await;
    b.tick();
    if *b.ips.get(&ip).unwrap_or(&0) >= PER_IP_DAY {
        return err(StatusCode::TOO_MANY_REQUESTS, "offer limit for your IP reached today (10)");
    }
    if b.offers.iter().filter(|o| o.status == "open").count() >= MAX_OPEN {
        return err(StatusCode::SERVICE_UNAVAILABLE, "exchange board is full, try later");
    }
    *b.ips.entry(ip).or_default() += 1;
    let now = now_secs();
    let secret = rand_hex(32);
    let o = Offer {
        id: rand_hex(8),
        give_asset: give,
        give_amount: r.give_amount,
        want_asset: want,
        want_amount: r.want_amount,
        maker_address: maker,
        note,
        status: "open".into(),
        taker_address: None,
        taker_txid: None,
        maker_txid: None,
        created_at: now,
        updated_at: now,
        secret_hash: hash_secret(&secret),
    };
    let id = o.id.clone();
    b.offers.push(o);
    save(&app, &b).await;
    Json(json!({ "id": id, "secret": secret })).into_response()
}

pub async fn list(State(app): State<St>) -> Response {
    let mut b = app.offers.lock().await;
    b.tick();
    let now = now_secs();
    let mut v: Vec<Offer> =
        b.offers.iter().filter(|o| o.status == "open" || o.updated_at + TTL > now).cloned().collect();
    drop(b);
    v.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    v.truncate(LIST_MAX);
    let mut out = Vec::with_capacity(v.len());
    for o in &v {
        out.push(view(&app, o).await);
    }
    Json(json!({ "offers": out })).into_response()
}

pub async fn get_one(State(app): State<St>, UrlPath(id): UrlPath<String>) -> Response {
    let mut b = app.offers.lock().await;
    b.tick();
    let Some(o) = b.offers.iter().find(|o| o.id == id).cloned() else {
        return err(StatusCode::NOT_FOUND, "no such offer");
    };
    drop(b);
    Json(view(&app, &o).await).into_response()
}

#[derive(Deserialize)]
pub struct TakeReq {
    taker_address: String,
    txid: String,
}

pub async fn take(State(app): State<St>, UrlPath(id): UrlPath<String>, Json(r): Json<TakeReq>) -> Response {
    let (addr, txid) = match check_addr(&r.taker_address, "taker_address").and_then(|a| Ok((a, check_txid(&r.txid)?))) {
        Ok(x) => x,
        Err(e) => return err(StatusCode::BAD_REQUEST, e),
    };
    transition(&app, &id, |o| {
        if o.status != "open" {
            return Err(format!("offer is {}, not open", o.status));
        }
        if o.maker_address == addr {
            return Err("taker_address is the maker's address".into());
        }
        o.status = "taken".into();
        o.taker_address = Some(addr);
        o.taker_txid = Some(txid);
        Ok(())
    })
    .await
}

#[derive(Deserialize)]
pub struct CompleteReq {
    secret: String,
    txid: String,
}

pub async fn complete(State(app): State<St>, UrlPath(id): UrlPath<String>, Json(r): Json<CompleteReq>) -> Response {
    let txid = match check_txid(&r.txid) {
        Ok(t) => t,
        Err(e) => return err(StatusCode::BAD_REQUEST, e),
    };
    let h = hash_secret(r.secret.trim());
    transition(&app, &id, |o| {
        if o.secret_hash != h {
            return Err("forbidden: wrong secret".into());
        }
        if o.status != "taken" {
            return Err(format!("offer is {}, not taken", o.status));
        }
        o.status = "done".into();
        o.maker_txid = Some(txid);
        Ok(())
    })
    .await
}

#[derive(Deserialize)]
pub struct CancelReq {
    secret: String,
}

pub async fn cancel(State(app): State<St>, UrlPath(id): UrlPath<String>, Json(r): Json<CancelReq>) -> Response {
    let h = hash_secret(r.secret.trim());
    transition(&app, &id, |o| {
        if o.secret_hash != h {
            return Err("forbidden: wrong secret".into());
        }
        if o.status != "open" {
            return Err(format!("offer is {}, only open offers can be cancelled", o.status));
        }
        o.status = "cancelled".into();
        Ok(())
    })
    .await
}

async fn transition(app: &St, id: &str, f: impl FnOnce(&mut Offer) -> Result<(), String>) -> Response {
    let mut b = app.offers.lock().await;
    b.tick();
    let Some(o) = b.offers.iter_mut().find(|o| o.id == id) else {
        return err(StatusCode::NOT_FOUND, "no such offer");
    };
    if let Err(e) = f(o) {
        let code = if e.starts_with("forbidden") { StatusCode::FORBIDDEN } else { StatusCode::CONFLICT };
        return err(code, e);
    }
    o.updated_at = now_secs();
    let o = o.clone();
    save(app, &b).await;
    drop(b);
    Json(view(app, &o).await).into_response()
}
