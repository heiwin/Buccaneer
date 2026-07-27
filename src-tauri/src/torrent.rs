use librqbit::{AddTorrent, AddTorrentOptions, Session};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::State;

use std::collections::{HashMap, HashSet};
use std::sync::atomic::AtomicBool;
use std::sync::Mutex;

pub struct TorrentTimes {
    pub added_at: i64,
    pub completed_at: Option<i64>,
}

#[derive(Serialize)]
pub struct SpeedStats {
    pub mbps: f64,
}

#[derive(Serialize)]
pub struct PeerStats {
    pub live: usize,
    pub connecting: usize,
    pub queued: usize,
    pub seen: usize,
    pub dead: usize,
}

#[derive(Serialize)]
pub struct LiveSnapshot {
    pub peer_stats: PeerStats,
}

#[derive(Serialize)]
pub struct LiveStats {
    pub download_speed: SpeedStats,
    pub upload_speed: SpeedStats,
    pub snapshot: LiveSnapshot,
}

#[derive(Serialize)]
pub struct TorrentStats {
    pub state: String,
    pub progress_bytes: u64,
    pub total_bytes: u64,
    pub finished: bool,
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub live: Option<LiveStats>,
}

impl From<&librqbit::TorrentStats> for TorrentStats {
    fn from(s: &librqbit::TorrentStats) -> Self {
        Self {
            state: s.state.to_string(),
            progress_bytes: s.progress_bytes,
            total_bytes: s.total_bytes,
            finished: s.finished,
            error: s.error.clone(),
            live: s.live.as_ref().map(|live| LiveStats {
                download_speed: SpeedStats { mbps: live.download_speed.mbps },
                upload_speed: SpeedStats { mbps: live.upload_speed.mbps },
                snapshot: LiveSnapshot {
                    peer_stats: PeerStats {
                        live: live.snapshot.peer_stats.live,
                        connecting: live.snapshot.peer_stats.connecting,
                        queued: live.snapshot.peer_stats.queued,
                        seen: live.snapshot.peer_stats.seen,
                        dead: live.snapshot.peer_stats.dead,
                    },
                },
            }),
        }
    }
}

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
    pub base_path: Arc<Mutex<String>>,
    pub clear_streaming_on_exit: Arc<AtomicBool>,
    pub api_credentials: String,
    pub api_port: u16,
    pub api_userpass: String,
    pub torrent_times: Arc<Mutex<HashMap<usize, TorrentTimes>>>,
}

#[tauri::command]
pub async fn set_download_path(
    state: State<'_, TorrentState>,
    path: String,
) -> Result<(), String> {
    let resolved = if path.trim().is_empty() {
        // Fall back to system Downloads folder
        use directories::UserDirs;
        let default = if let Some(user_dirs) = UserDirs::new() {
            user_dirs
                .download_dir()
                .unwrap_or(user_dirs.home_dir())
                .join("Buccaneer")
                .to_string_lossy()
                .to_string()
        } else {
            std::env::var("HOME")
                .map(|h| std::path::PathBuf::from(h).join("Downloads/Buccaneer"))
                .unwrap_or_else(|_| std::path::PathBuf::from("/tmp/Buccaneer"))
                .to_string_lossy()
                .to_string()
        };
        default
    } else {
        path
    };
    std::fs::create_dir_all(&resolved).map_err(|e| e.to_string())?;
    *state.base_path.lock().map_err(|e| e.to_string())? = resolved;
    Ok(())
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
        .post(format!("http://127.0.0.1:{}/torrents/limits", state.api_port))
        .header("Content-Type", "application/json")
        .header("Authorization", &state.api_credentials)
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn add_torrent(
    state: State<'_, TorrentState>,
    magnet_or_url: String,
    stream: bool,
    only_files: Option<Vec<usize>>,
) -> Result<String, String> {
    validate_magnet_or_url(&magnet_or_url)?;

    if let Some(ref files) = only_files {
        if files.is_empty() {
            return Err("File selection cannot be empty".to_string());
        }
        if files.iter().any(|&i| i > 10000) {
            return Err("Invalid file index: out of range".to_string());
        }
    }

    let add_torrent = AddTorrent::from_url(&magnet_or_url);
    
    let base = state.base_path.lock().map_err(|e| e.to_string())?.clone();
    let output_folder = if stream {
        Some(std::path::Path::new(&base).join("Streaming").to_string_lossy().to_string())
    } else {
        Some(base)
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

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64;
    if let Ok(mut times) = state.torrent_times.lock() {
        times.entry(id).or_insert(TorrentTimes {
            added_at: now,
            completed_at: None,
        });
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
    if let Ok(mut times) = state.torrent_times.lock() {
        times.remove(&parsed_id);
    }
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
    let url = format!("http://127.0.0.1:{}/torrents", state.api_port);
    let res = state.http_client
        .get(&url)
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
            let mut map = HashMap::new();
            for (id, handle) in internal_torrents {
                let stats = TorrentStats::from(&handle.stats());
                map.insert(id, serde_json::to_value(stats).unwrap_or_default());
            }
            map
        });
        
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as i64;

        // Track completion times and populate response
        if let Ok(mut times) = state.torrent_times.lock() {
            for t in torrents.iter_mut() {
                if let Some(id) = t.get("id").and_then(|id| id.as_u64()) {
                    let id_usize = id as usize;
                    let is_stream = streams.contains(&id_usize);
                    if let Some(obj) = t.as_object_mut() {
                        obj.insert("is_stream".to_string(), serde_json::Value::Bool(is_stream));

                        if let Some(stats_val) = stats_map.get(&id_usize) {
                            obj.insert("stats".to_string(), stats_val.clone());

                            // Detect completion transition
                            if let Some(finished) = stats_val.get("finished").and_then(|v| v.as_bool()) {
                                if finished {
                                    let entry = times.entry(id_usize).or_insert(TorrentTimes {
                                        added_at: now,
                                        completed_at: None,
                                    });
                                    if entry.completed_at.is_none() {
                                        entry.completed_at = Some(now);
                                    }
                                }
                            }
                        }

                        // Add timing to response
                        if let Some(entry) = times.get(&id_usize) {
                            obj.insert("added_at".to_string(), serde_json::Value::Number(serde_json::Number::from(entry.added_at)));
                            if let Some(completed) = entry.completed_at {
                                obj.insert("completed_at".to_string(), serde_json::Value::Number(serde_json::Number::from(completed)));
                            }
                        }
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
    let url = format!("http://127.0.0.1:{}/torrents/{}", state.api_port, id);
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


