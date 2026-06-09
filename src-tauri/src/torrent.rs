use librqbit::{AddTorrent, AddTorrentOptions, Session};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::State;

use std::collections::HashSet;
use std::sync::atomic::AtomicBool;
use std::sync::Mutex;

fn validate_magnet_or_url(input: &str) -> Result<(), String> {
    if input.starts_with("magnet:") {
        if !input.contains("xt=urn:btih:") {
            return Err("Invalid magnet URL: missing xt=urn:btih: parameter".to_string());
        }
        // Extract the info_hash value after xt=urn:btih:
        if let Some(hash_start) = input.find("xt=urn:btih:") {
            let hash_part = &input[hash_start + 12..];
            let hash = hash_part.split('&').next().unwrap_or("");
            if hash.len() != 40 || !hash.chars().all(|c| c.is_ascii_hexdigit()) {
                return Err("Invalid magnet URL: info_hash must be a 40-character hex string".to_string());
            }
        }
    } else if input.starts_with("http://") || input.starts_with("https://") {
        reqwest::Url::parse(input)
            .map_err(|_| "Invalid HTTP URL".to_string())?;
    } else {
        return Err("Invalid torrent source: must be a magnet link or HTTP URL".to_string());
    }
    Ok(())
}

pub struct TorrentState {
    pub session: Arc<Session>,
    pub http_client: reqwest::Client,
    pub streamed_torrents: Arc<Mutex<HashSet<usize>>>,
    pub base_path: String,
    pub clear_streaming_on_exit: Arc<AtomicBool>,
    pub api_credentials: String,
    pub api_credentials_url: String,
}

#[tauri::command]
pub async fn update_clear_streaming_setting(
    state: State<'_, TorrentState>,
    value: bool,
) -> Result<(), String> {
    state
        .clear_streaming_on_exit
        .store(value, std::sync::atomic::Ordering::Relaxed);
    Ok(())
}

#[tauri::command]
pub async fn update_ratelimits(
    state: State<'_, TorrentState>,
    download_kbps: f64,
    upload_kbps: f64,
) -> Result<(), String> {
    let download_bps = if download_kbps > 0.0 {
        Some((download_kbps * 1024.0) as u32)
    } else {
        None
    };

    let upload_bps = if upload_kbps > 0.0 {
        Some((upload_kbps * 1024.0) as u32)
    } else {
        None
    };

    let body = serde_json::json!({
        "download_bps": download_bps,
        "upload_bps": upload_bps
    });

    let _res = state.http_client
        .post("http://127.0.0.1:3030/torrents/limits")
        .header("Content-Type", "application/json")
        .header("Authorization", &state.api_credentials)
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[derive(Serialize, Deserialize, Clone)]
pub struct TorrentInfo {
    pub id: String,
    pub name: String,
    pub progress: f64,
    pub download_speed: u64,
    pub upload_speed: u64,
    pub seeds: u32,
    pub peers: u32,
    pub state: String,
    pub error: Option<String>,
    pub save_path: String,
    pub is_stream: bool,
}

#[tauri::command]
pub async fn add_torrent(
    state: State<'_, TorrentState>,
    magnet_or_url: String,
    stream: bool,
    only_files: Option<Vec<usize>>,
) -> Result<String, String> {
    validate_magnet_or_url(&magnet_or_url)?;
    let add_torrent = AddTorrent::from_url(&magnet_or_url);
    
    let output_folder = if stream {
        Some(std::path::Path::new(&state.base_path).join("Streaming").to_string_lossy().to_string())
    } else {
        None
    };

    let options = AddTorrentOptions {
        overwrite: true,
        output_folder,
        only_files,
        ..Default::default()
    };

    let response = state
        .session
        .add_torrent(add_torrent, Some(options))
        .await
        .map_err(|e| e.to_string())?;

    let id = match response {
        librqbit::AddTorrentResponse::Added(id, _) => id,
        librqbit::AddTorrentResponse::AlreadyManaged(id, _) => id,
        librqbit::AddTorrentResponse::ListOnly(_) => {
            return Err("ListOnly not supported".to_string())
        }
    };

    if stream {
        if let Ok(mut streams) = state.streamed_torrents.lock() {
            streams.insert(id);
        }
    }

    Ok(id.to_string())
}

#[tauri::command]
pub async fn pause_torrent(state: State<'_, TorrentState>, id: String) -> Result<(), String> {
    let parsed_id: usize = id.parse().map_err(|_| "Invalid ID".to_string())?;
    if let Some(handle) = state
        .session
        .get(librqbit::api::TorrentIdOrHash::Id(parsed_id))
    {
        state
            .session
            .pause(&handle)
            .await
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn resume_torrent(state: State<'_, TorrentState>, id: String) -> Result<(), String> {
    let parsed_id: usize = id.parse().map_err(|_| "Invalid ID".to_string())?;
    if let Some(handle) = state
        .session
        .get(librqbit::api::TorrentIdOrHash::Id(parsed_id))
    {
        state
            .session
            .unpause(&handle)
            .await
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn remove_torrent(
    state: State<'_, TorrentState>,
    id: String,
    delete_files: bool,
) -> Result<(), String> {
    let parsed_id: usize = id.parse().map_err(|_| "Invalid ID".to_string())?;
    state
        .session
        .delete(librqbit::api::TorrentIdOrHash::Id(parsed_id), delete_files)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn get_active_torrents(
    state: State<'_, TorrentState>,
) -> Result<serde_json::Value, String> {
    let url = "http://127.0.0.1:3030/torrents";
    let res = state.http_client
        .get(url)
        .header("Authorization", &state.api_credentials)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let mut json: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;

    if let Some(torrents) = json.get_mut("torrents").and_then(|t| t.as_array_mut()) {
        let streams = if let Ok(s) = state.streamed_torrents.lock() {
            s.clone()
        } else {
            std::collections::HashSet::new()
        };
        
        // We need to fetch stats internally since the HTTP /torrents endpoint omits them
        let stats_map = state.session.with_torrents(|internal_torrents| {
            let mut map = std::collections::HashMap::new();
            for (id, handle) in internal_torrents {
                let stats = handle.stats();
                
                // Manually construct the stats JSON to match what torrent.ts expects
                let mut stats_json = serde_json::Map::new();
                stats_json.insert("state".to_string(), serde_json::Value::String(stats.state.to_string()));
                stats_json.insert("progress_bytes".to_string(), serde_json::Value::Number(serde_json::Number::from(stats.progress_bytes)));
                stats_json.insert("total_bytes".to_string(), serde_json::Value::Number(serde_json::Number::from(stats.total_bytes)));
                stats_json.insert("finished".to_string(), serde_json::Value::Bool(stats.finished));
                if let Some(err) = &stats.error {
                    stats_json.insert("error".to_string(), serde_json::Value::String(err.clone()));
                }
                
                let mut live_json = serde_json::Map::new();
                if let Some(live) = &stats.live {
                    let mut download_speed = serde_json::Map::new();
                    download_speed.insert("mbps".to_string(), serde_json::Value::Number(serde_json::Number::from_f64(live.download_speed.mbps).unwrap_or(serde_json::Number::from(0))));
                    live_json.insert("download_speed".to_string(), serde_json::Value::Object(download_speed));
                    
                    let mut upload_speed = serde_json::Map::new();
                    upload_speed.insert("mbps".to_string(), serde_json::Value::Number(serde_json::Number::from_f64(live.upload_speed.mbps).unwrap_or(serde_json::Number::from(0))));
                    live_json.insert("upload_speed".to_string(), serde_json::Value::Object(upload_speed));
                    
                    let mut snapshot = serde_json::Map::new();
                    let mut peer_stats = serde_json::Map::new();
                    peer_stats.insert("live".to_string(), serde_json::Value::Number(serde_json::Number::from(live.snapshot.peer_stats.live)));
                    snapshot.insert("peer_stats".to_string(), serde_json::Value::Object(peer_stats));
                    live_json.insert("snapshot".to_string(), serde_json::Value::Object(snapshot));
                }
                stats_json.insert("live".to_string(), serde_json::Value::Object(live_json));
                
                map.insert(id, serde_json::Value::Object(stats_json));
            }
            map
        });
        
        // Now mutate the json outside the closure
        for t in torrents.iter_mut() {
            if let Some(id) = t.get("id").and_then(|id| id.as_u64()) {
                let id_usize = id as usize;
                let is_stream = streams.contains(&id_usize);
                if let Some(obj) = t.as_object_mut() {
                    obj.insert("is_stream".to_string(), serde_json::Value::Bool(is_stream));
                    
                    if let Some(stats_val) = stats_map.get(&id_usize) {
                        obj.insert("stats".to_string(), stats_val.clone());
                    }
                }
            }
        }
    }

    Ok(json)
}

#[tauri::command]
pub async fn get_torrent_details(
    state: State<'_, TorrentState>,
    id: String,
) -> Result<serde_json::Value, String> {
    // Validate id is numeric to prevent path traversal
    id.parse::<usize>().map_err(|_| "Invalid torrent ID: must be numeric".to_string())?;
    let url = format!("http://127.0.0.1:3030/torrents/{}", id);
    let res = state.http_client
        .get(&url)
        .header("Authorization", &state.api_credentials)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let json: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
    Ok(json)
}

#[derive(Serialize, Deserialize, Clone)]
pub struct FileNode {
    pub index: usize,
    pub name: String,
    pub size: u64,
}

#[tauri::command]
pub async fn get_torrent_metadata(
    state: State<'_, TorrentState>,
    magnet_or_url: String,
) -> Result<Vec<FileNode>, String> {
    validate_magnet_or_url(&magnet_or_url)?;
    let add_torrent = AddTorrent::from_url(&magnet_or_url);
    let options = AddTorrentOptions {
        list_only: true,
        ..Default::default()
    };

    let response = state
        .session
        .add_torrent(add_torrent, Some(options))
        .await
        .map_err(|e| e.to_string())?;

    match response {
        librqbit::AddTorrentResponse::ListOnly(res) => {
            let mut files = Vec::new();
            if let Ok(details) = res.info.iter_file_details() {
                for (idx, fd) in details.enumerate() {
                    let name = fd.filename.to_string().unwrap_or_else(|_| "Unknown".to_string());
                    files.push(FileNode {
                        index: idx,
                        name,
                        size: fd.len,
                    });
                }
            }
            Ok(files)
        }
        _ => Err("Expected ListOnly response. Torrent might already be managed.".to_string()),
    }
}
