//! Wisata Gateway — digital guestbook & turnstile access controller.
//!
//! Env: WG_BIND (default 127.0.0.1:8080), WG_DATA (default data/state.json), WG_TOKEN (officer token).

mod api;
mod demo;
mod engine;
mod model;
mod util;

use std::net::SocketAddr;
use std::path::{Path, PathBuf};
use std::time::Duration;

use api::{router, Shared};
use engine::Engine;
use model::Persist;

fn load(path: &Path) -> Persist {
    match std::fs::read_to_string(path) {
        Ok(s) => match serde_json::from_str::<Persist>(&s) {
            Ok(p) => p.sanitize(),
            Err(e) => {
                let bad = path.with_extension("json.bad");
                eprintln!("! {} rusak ({e}); disimpan sebagai {} dan memulai data kosong", path.display(), bad.display());
                let _ = std::fs::rename(path, bad);
                Persist::default()
            }
        },
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Persist::default(),
        Err(e) => {
            eprintln!("! gagal membaca {}: {e}", path.display());
            std::process::exit(1);
        }
    }
}

/// Atomic write: temp file in the same directory, then rename over the real one.
fn save_sync(path: &Path, json: &str) -> std::io::Result<()> {
    if let Some(dir) = path.parent().filter(|d| !d.as_os_str().is_empty()) {
        std::fs::create_dir_all(dir)?;
    }
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, json)?;
    std::fs::rename(&tmp, path)
}

async fn shutdown_signal() {
    let ctrl_c = async {
        let _ = tokio::signal::ctrl_c().await;
    };
    #[cfg(unix)]
    let term = async {
        if let Ok(mut s) = tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate()) {
            s.recv().await;
        }
    };
    #[cfg(not(unix))]
    let term = std::future::pending::<()>();
    tokio::select! { _ = ctrl_c => {}, _ = term => {} }
}

#[tokio::main]
async fn main() {
    let bind: SocketAddr = std::env::var("WG_BIND").unwrap_or_else(|_| "127.0.0.1:8080".into()).parse().unwrap_or_else(|e| {
        eprintln!("! WG_BIND tidak valid: {e}");
        std::process::exit(2)
    });
    let data_path = PathBuf::from(std::env::var("WG_DATA").unwrap_or_else(|_| "data/state.json".into()));
    let token = std::env::var("WG_TOKEN").ok().filter(|t| !t.is_empty());

    // The API can open gates and export every NIK. Never expose that on the network without a token.
    if !bind.ip().is_loopback() && token.is_none() {
        eprintln!("! Menolak mulai: WG_BIND={bind} bisa diakses dari jaringan tetapi WG_TOKEN belum diisi.");
        eprintln!("  Isi WG_TOKEN=<rahasia-petugas> atau gunakan 127.0.0.1.");
        std::process::exit(2);
    }

    let app = Shared::new(Engine::new(load(&data_path)), token.clone());

    // Ticker: re-lock expired gates, run auto-traffic, persist when dirty.
    let tick_app = app.clone();
    let tick_path = data_path.clone();
    tokio::spawn(async move {
        let mut iv = tokio::time::interval(Duration::from_millis(200));
        let mut n: u32 = 0;
        loop {
            iv.tick().await;
            n = n.wrapping_add(1);
            let (changed, snapshot) = {
                let mut e = tick_app.lock();
                let changed = e.tick();
                let snap = if n.is_multiple_of(5) && e.dirty {
                    e.dirty = false;
                    serde_json::to_string(&e.data).ok()
                } else {
                    None
                };
                (changed, snap)
            };
            if changed {
                tick_app.bump();
            }
            if let Some(json) = snapshot {
                let p = tick_path.clone();
                let res = tokio::task::spawn_blocking(move || save_sync(&p, &json)).await;
                if !matches!(res, Ok(Ok(()))) {
                    eprintln!("! gagal menyimpan data ke {}", tick_path.display());
                    tick_app.lock().dirty = true;
                }
            }
        }
    });

    let listener = tokio::net::TcpListener::bind(bind).await.unwrap_or_else(|e| {
        eprintln!("! tidak bisa membuka {bind}: {e}");
        std::process::exit(1)
    });
    println!("Wisata Gateway berjalan di http://{bind}  (data: {}, token: {})", data_path.display(), if token.is_some() { "aktif" } else { "tidak dipakai" });

    axum::serve(listener, router(app.clone())).with_graceful_shutdown(shutdown_signal()).await.unwrap_or_else(|e| eprintln!("! server berhenti: {e}"));

    let json = serde_json::to_string(&app.lock().data).unwrap_or_default();
    match save_sync(&data_path, &json) {
        Ok(()) => println!("Data tersimpan. Sampai jumpa."),
        Err(e) => eprintln!("! gagal menyimpan saat berhenti: {e}"),
    }
}
