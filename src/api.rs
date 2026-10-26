//! HTTP layer: JSON API under /api (optional officer token), embedded static web UI everywhere else.

use std::sync::{Arc, Mutex, MutexGuard};
use std::time::Duration;

use axum::{
    extract::{DefaultBodyLimit, Path, Query, Request, State},
    http::{header, StatusCode, Uri},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::{delete, get, patch, post},
    Json, Router,
};
use rust_embed::RustEmbed;
use serde::Deserialize;
use serde_json::{json, Value};
use tokio::sync::watch;
use tower_http::compression::CompressionLayer;

use crate::engine::{Engine, TapReq};
use crate::model::Persist;
use crate::util::ct_eq;

pub struct Shared {
    pub engine: Mutex<Engine>,
    pub version: watch::Sender<u64>,
    pub token: Option<String>,
}
pub type App = Arc<Shared>;

impl Shared {
    pub fn new(engine: Engine, token: Option<String>) -> App {
        Arc::new(Shared { engine: Mutex::new(engine), version: watch::channel(1).0, token })
    }

    pub fn lock(&self) -> MutexGuard<'_, Engine> {
        // A panic inside a handler must not brick the whole controller.
        self.engine.lock().unwrap_or_else(|e| e.into_inner())
    }

    pub fn bump(&self) {
        self.version.send_modify(|v| *v += 1);
    }

    /// Runs a mutation, marks the data dirty (persisted by the ticker) and wakes every poller.
    fn commit<R>(&self, f: impl FnOnce(&mut Engine) -> R) -> R {
        let r = {
            let mut e = self.lock();
            let r = f(&mut e);
            e.dirty = true;
            r
        };
        self.bump();
        r
    }
}

pub struct ApiError(StatusCode, String);

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (self.0, Json(json!({ "ok": false, "reason": self.1 }))).into_response()
    }
}

fn bad(msg: impl Into<String>) -> ApiError {
    ApiError(StatusCode::BAD_REQUEST, msg.into())
}

type ApiResult = Result<Json<Value>, ApiError>;

fn done() -> ApiResult {
    Ok(Json(json!({ "ok": true })))
}

/* ------------------------------------------------------------------ auth */

async fn auth(State(app): State<App>, req: Request, next: Next) -> Response {
    if let Some(t) = &app.token {
        let good = req.headers().get("x-wg-token").map(|v| ct_eq(v.as_bytes(), t.as_bytes())).unwrap_or(false);
        if !good {
            return ApiError(StatusCode::UNAUTHORIZED, "Token petugas diperlukan".into()).into_response();
        }
    }
    next.run(req).await
}

/* ------------------------------------------------------------------ handlers */

async fn get_state(State(app): State<App>) -> Json<Value> {
    let v = *app.version.borrow();
    let view = app.lock().view(v);
    Json(view)
}

#[derive(Deserialize)]
struct PollQ {
    since: Option<u64>,
}

/// Long-poll: returns as soon as the data version exceeds `since` (or after 25 s).
async fn poll(State(app): State<App>, Query(q): Query<PollQ>) -> Json<Value> {
    let since = q.since.unwrap_or(0);
    let mut rx = app.version.subscribe();
    let _ = tokio::time::timeout(Duration::from_secs(25), async {
        let _ = rx.wait_for(|v| *v > since).await;
    })
    .await;
    let v = *rx.borrow();
    Json(json!({ "version": v }))
}

async fn tap(State(app): State<App>, Json(req): Json<TapReq>) -> ApiResult {
    let r = app.commit(|e| e.tap(req));
    Ok(Json(serde_json::to_value(r).unwrap_or(Value::Null)))
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
struct TapGroupReq {
    group_id: String,
    gate_id: String,
}

async fn tap_group(State(app): State<App>, Json(r): Json<TapGroupReq>) -> ApiResult {
    let res = app.commit(|e| e.tap_group(&r.group_id, &r.gate_id));
    Ok(Json(serde_json::to_value(res).unwrap_or(Value::Null)))
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
struct ManualReq {
    gate_id: String,
    reason: String,
    seconds: u32,
}

async fn manual_open(State(app): State<App>, Json(r): Json<ManualReq>) -> ApiResult {
    app.commit(|e| e.manual_open(&r.gate_id, &r.reason, r.seconds)).map_err(bad)?;
    done()
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
struct LockReq {
    gate_id: String,
}

async fn lock(State(app): State<App>, Json(r): Json<LockReq>) -> ApiResult {
    app.commit(|e| e.lock_gate(&r.gate_id)).map_err(bad)?;
    done()
}

#[derive(Deserialize, Default)]
struct OnReq {
    on: bool,
}

async fn panic(State(app): State<App>, Json(r): Json<OnReq>) -> ApiResult {
    app.commit(|e| e.set_panic(r.on));
    done()
}

async fn set_auto(State(app): State<App>, Json(r): Json<OnReq>) -> ApiResult {
    app.commit(|e| e.set_auto(r.on));
    done()
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
struct GroupReq {
    name: String,
    leader: String,
    city: String,
    category: String,
    size: u32,
}

async fn add_group(State(app): State<App>, Json(r): Json<GroupReq>) -> ApiResult {
    app.commit(|e| e.add_group(&r.name, &r.leader, &r.city, &r.category, r.size)).map_err(bad)?;
    done()
}

async fn remove_group(State(app): State<App>, Path(id): Path<String>) -> ApiResult {
    app.commit(|e| e.remove_group(&id));
    done()
}

#[derive(Deserialize, Default)]
#[serde(default)]
struct GuestReq {
    name: String,
    text: String,
    rating: u8,
}

async fn add_guestbook(State(app): State<App>, Json(r): Json<GuestReq>) -> ApiResult {
    app.commit(|e| e.add_guestbook(&r.name, &r.text, r.rating)).map_err(bad)?;
    done()
}

async fn patch_settings(State(app): State<App>, Json(patch): Json<Value>) -> ApiResult {
    app.commit(|e| e.update_settings(&patch)).map_err(bad)?;
    done()
}

async fn persona(State(app): State<App>) -> ApiResult {
    let p = app.lock().random_persona().ok_or_else(|| bad("Gagal membuat data contoh"))?;
    Ok(Json(serde_json::to_value(p).unwrap_or(Value::Null)))
}

async fn demo(State(app): State<App>) -> ApiResult {
    app.commit(|e| e.load_demo());
    done()
}

async fn clear_sim(State(app): State<App>) -> ApiResult {
    app.commit(|e| e.clear_sim());
    done()
}

async fn reset_today(State(app): State<App>) -> ApiResult {
    app.commit(|e| e.reset_today());
    done()
}

async fn factory_reset(State(app): State<App>) -> ApiResult {
    app.commit(|e| e.factory_reset());
    done()
}

/// Full backup, including complete NIKs — only reachable with the officer token when one is set.
async fn export(State(app): State<App>) -> Response {
    let body = serde_json::to_vec_pretty(&app.lock().data).unwrap_or_default();
    ([(header::CONTENT_TYPE, "application/json"), (header::CONTENT_DISPOSITION, "attachment; filename=\"wisata-gateway-backup.json\"")], body).into_response()
}

async fn import(State(app): State<App>, Json(raw): Json<Value>) -> ApiResult {
    if raw.get("v").and_then(Value::as_u64) != Some(1) || !raw.get("settings").map(Value::is_object).unwrap_or(false) {
        return Err(bad("Bukan file backup Wisata Gateway (v1)."));
    }
    let p: Persist = serde_json::from_value(raw).map_err(|e| bad(format!("Isi backup tidak valid: {e}")))?;
    app.commit(|e| e.import(p));
    done()
}

/* ------------------------------------------------------------------ static UI */

#[derive(RustEmbed)]
#[folder = "web/"]
struct Assets;

async fn static_handler(uri: Uri) -> Response {
    let path = uri.path().trim_start_matches('/');
    let path = if path.is_empty() { "index.html" } else { path };
    match Assets::get(path) {
        Some(f) => ([(header::CONTENT_TYPE, f.metadata.mimetype().to_string()), (header::CACHE_CONTROL, "no-cache".to_string())], f.data.into_owned()).into_response(),
        None => (StatusCode::NOT_FOUND, "404").into_response(),
    }
}

pub fn router(app: App) -> Router {
    let api = Router::new()
        .route("/state", get(get_state))
        .route("/poll", get(poll))
        .route("/tap", post(tap))
        .route("/tap-group", post(tap_group))
        .route("/manual-open", post(manual_open))
        .route("/lock", post(lock))
        .route("/panic", post(panic))
        .route("/auto", post(set_auto))
        .route("/groups", post(add_group))
        .route("/groups/{id}", delete(remove_group))
        .route("/guestbook", post(add_guestbook))
        .route("/settings", patch(patch_settings))
        .route("/persona", get(persona))
        .route("/demo", post(demo))
        .route("/clear-sim", post(clear_sim))
        .route("/reset-today", post(reset_today))
        .route("/factory-reset", post(factory_reset))
        .route("/export", get(export))
        .route("/import", post(import).layer(DefaultBodyLimit::max(16 * 1024 * 1024)))
        .layer(middleware::from_fn_with_state(app.clone(), auth));
    Router::new().nest("/api", api).fallback(static_handler).layer(CompressionLayer::new()).with_state(app)
}
