use librqbit::{AddTorrent, AddTorrentOptions, Session};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::State;

use crate::completed::{CompletedEntry, CompletedStore};

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

fn is_blocked_ip(ip: &std::net::IpAddr) -> bool {
    match ip {
        std::net::IpAddr::V4(v4) => {
            let o = v4.octets();
            // Private: 10/8, 172.16/12, 192.168/16
            if o[0] == 10 || (o[0] == 172 && (16..=31).contains(&o[1])) || (o[0] == 192 && o[1] == 168) {
                return true;
            }
            // Loopback 127/8
            if o[0] == 127 {
                return true;
            }
            // Unspecified 0/8 and broadcast
            if o[0] == 0 || (o[0] == 255 && o[1] == 255 && o[2] == 255 && o[3] == 255) {
                return true;
            }
            // Link-local 169.254/16
            if o[0] == 169 && o[1] == 254 {
                return true;
            }
            // CGNAT 100.64/10
            if o[0] == 100 && (64..=127).contains(&o[1]) {
                return true;
            }
            // Documentation/benchmark/test ranges
            if (o[0] == 192 && o[1] == 0 && (o[2] == 0 || o[2] == 2))
                || (o[0] == 198 && ((18..=19).contains(&o[1]) || (o[1] == 51 && o[2] == 100)))
                || (o[0] == 203 && o[1] == 0 && o[2] == 113)
            {
                return true;
            }
            // Reserved 240/4
            if o[0] >= 240 {
                return true;
            }
            false
        }
        std::net::IpAddr::V6(v6) => {
            if v6.is_loopback() || v6.is_unspecified() || v6.is_multicast() {
                return true;
            }
            // fe80::/10 link-local and fc00::/7 unique-local
            let seg = v6.segments();
            if (seg[0] & 0xffc0) == 0xfe80 || (seg[0] & 0xfe00) == 0xfc00 {
                return true;
            }
            // IPv4-mapped addresses (e.g. ::ffff:127.0.0.1)
            if let Some(ip4) = v6.to_ipv4_mapped() {
                return is_blocked_ip(&std::net::IpAddr::V4(ip4));
            }
            false
        }
    }
}

async fn validate_magnet_or_url(input: &str) -> Result<(), String> {
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
        let url = reqwest::Url::parse(input).map_err(|_| "Invalid HTTP URL".to_string())?;
        let host = url
            .host_str()
            .ok_or_else(|| "Invalid HTTP URL: missing host".to_string())?
            .to_string();

        // Reject local hostnames outright
        if host == "localhost" || host.ends_with(".localhost") || host.ends_with(".local") {
            return Err("HTTP URL host must not be local".to_string());
        }

        let blocked = if let Ok(ip) = host.parse::<std::net::IpAddr>() {
            is_blocked_ip(&ip)
        } else {
            // Resolve hostname and reject if any address is loopback/private
            let resolved = tokio::net::lookup_host((host.as_str(), 80))
                .await
                .map_err(|_| "Could not resolve URL host".to_string())?;
            resolved.into_iter().any(|addr| is_blocked_ip(&addr.ip()))
        };

        if blocked {
            return Err("HTTP URL must point to a public address".to_string());
        }
    } else {
        return Err("Invalid torrent source: must be a magnet link or HTTP URL".to_string());
    }
    Ok(())
}

pub struct TorrentState {
    /// `None` until the librqbit session initializes. The state is managed up
    /// front so a transient init failure degrades to a clear command error
    /// instead of Tauri's "state not managed" panic, and can recover in place
    /// via the background retry in lib.rs.
    pub session: Arc<Mutex<Option<(Arc<Session>, u16)>>>,
    pub http_client: reqwest::Client,
    pub streamed_torrents: Arc<Mutex<HashSet<usize>>>,
    pub base_path: Arc<Mutex<String>>,
    pub clear_streaming_on_exit: Arc<AtomicBool>,
    pub api_credentials: String,
    pub api_userpass: String,
    pub torrent_times: Arc<Mutex<HashMap<usize, TorrentTimes>>>,
    pub completed: Arc<Mutex<CompletedStore>>,
}

impl TorrentState {
    /// Shared accessor for the initialized session and its bound API port.
    /// Returns a clear error while the engine is (re)initializing.
    pub fn session(&self) -> Result<(Arc<Session>, u16), String> {
        self.session
            .lock()
            .map_err(|e| e.to_string())?
            .clone()
            .ok_or_else(|| "Torrent engine not initialized".to_string())
    }
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

    let (_, api_port) = state.session()?;

    let body = serde_json::json!({
        "download_bps": download_bps,
        "upload_bps": upload_bps
    });

    let _res = state.http_client
        .post(format!("http://127.0.0.1:{}/torrents/limits", api_port))
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
    validate_magnet_or_url(&magnet_or_url).await?;

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

    let (session, _) = state.session()?;

    let response = session
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
    let (session, _) = state.session()?;
    if let Some(handle) = session.get(librqbit::api::TorrentIdOrHash::Id(parsed_id)) {
        session
            .pause(&handle)
            .await
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn resume_torrent(state: State<'_, TorrentState>, id: String) -> Result<(), String> {
    let parsed_id: usize = id.parse().map_err(|_| "Invalid ID".to_string())?;
    let (session, _) = state.session()?;
    if let Some(handle) = session.get(librqbit::api::TorrentIdOrHash::Id(parsed_id)) {
        session
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
    if let Some(hash) = id.strip_prefix("c:") {
        let entry = {
            let mut store = state.completed.lock().map_err(|e| e.to_string())?;
            store.remove(hash).map_err(|e| e.to_string())?
        };
        if let Some(entry) = entry {
            if delete_files {
                delete_entry_files(&entry);
            }
        }
        return Ok(());
    }

    let parsed_id: usize = id.parse().map_err(|_| "Invalid ID".to_string())?;
    if let Ok(mut times) = state.torrent_times.lock() {
        times.remove(&parsed_id);
    }
    let (session, _) = state.session()?;
    session
        .delete(librqbit::api::TorrentIdOrHash::Id(parsed_id), delete_files)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

fn delete_entry_files(entry: &CompletedEntry) {
    let mut parents = std::collections::HashSet::new();
    for rel in &entry.files {
        let p = std::path::Path::new(&entry.output_folder).join(rel);
        let _ = std::fs::remove_file(&p);
        if let Some(parent) = p.parent() {
            parents.insert(parent.to_path_buf());
        }
    }
    let mut dirs: Vec<_> = parents.into_iter().collect();
    dirs.sort_by_key(|d| std::cmp::Reverse(d.components().count()));
    for d in dirs {
        let empty = std::fs::read_dir(&d)
            .map(|mut it| it.next().is_none())
            .unwrap_or(false);
        if empty {
            let _ = std::fs::remove_dir(&d);
        }
    }
}

#[tauri::command]
pub async fn get_active_torrents(
    state: State<'_, TorrentState>,
) -> Result<serde_json::Value, String> {
    let (session, api_port) = state.session()?;
    let url = format!("http://127.0.0.1:{}/torrents", api_port);
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
        let stats_map = session.with_torrents(|internal_torrents| {
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

        // Track completion times, detect finished downloads and prepare them
        // for removal from the session (which closes their file descriptors).
        struct CompletionInfo {
            id: usize,
            info_hash: String,
            name: String,
            output: String,
            total: u64,
            finished_at: i64,
        }

        let mut completions: Vec<CompletionInfo> = Vec::new();
        if let Ok(mut times) = state.torrent_times.lock() {
            for t in torrents.iter_mut() {
                if let Some(id) = t.get("id").and_then(|id| id.as_u64()) {
                    let id_usize = id as usize;
                    let is_stream = streams.contains(&id_usize);
                    let info_hash = t
                        .get("info_hash")
                        .and_then(|h| h.as_str())
                        .unwrap_or("")
                        .to_string();
                    let name = t
                        .get("name")
                        .and_then(|n| n.as_str())
                        .unwrap_or("Unknown")
                        .to_string();
                    let output = t
                        .get("output_folder")
                        .and_then(|o| o.as_str())
                        .unwrap_or("")
                        .to_string();
                    if let Some(obj) = t.as_object_mut() {
                        obj.insert("is_stream".to_string(), serde_json::Value::Bool(is_stream));

                        if let Some(stats_val) = stats_map.get(&id_usize) {
                            obj.insert("stats".to_string(), stats_val.clone());

                            let finished = stats_val
                                .get("finished")
                                .and_then(|v| v.as_bool())
                                .unwrap_or(false);
                            if finished {
                                let entry = times.entry(id_usize).or_insert(TorrentTimes {
                                    added_at: now,
                                    completed_at: None,
                                });
                                if entry.completed_at.is_none() {
                                    entry.completed_at = Some(now);
                                }

                                if !is_stream {
                                    let total = stats_val
                                        .get("total_bytes")
                                        .and_then(|v| v.as_u64())
                                        .unwrap_or(0);
                                    completions.push(CompletionInfo {
                                        id: id_usize,
                                        info_hash,
                                        name,
                                        output,
                                        total,
                                        finished_at: now,
                                    });
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

        // Record finished downloads in the completed-history store and remove
        // them from the session so their file handles are closed.
        if !completions.is_empty() {
            let to_record: Vec<CompletionInfo> = {
                let store = state.completed.lock().map_err(|e| e.to_string())?;
                completions
                    .into_iter()
                    .filter(|c| !c.info_hash.is_empty() && !store.contains(&c.info_hash))
                    .collect()
            };

            let dropped: HashSet<usize> = to_record.iter().map(|c| c.id).collect();

            for c in to_record {
                let files =
                    fetch_torrent_files(&state.http_client, &state.api_credentials, api_port, c.id)
                        .await;
                {
                    let mut store = state.completed.lock().map_err(|e| e.to_string())?;
                    let _ = store.add(CompletedEntry {
                        info_hash: c.info_hash.to_lowercase(),
                        name: c.name,
                        total_bytes: c.total,
                        output_folder: c.output,
                        files,
                        finished_at: c.finished_at,
                    });
                }
                // Closing the torrent releases its file descriptors.
                let _ = session
                    .delete(librqbit::api::TorrentIdOrHash::Id(c.id), false)
                    .await;
            }

            // The removed torrents are now represented by the history entries
            // below; drop them from the live list to avoid a transient duplicate.
            if !dropped.is_empty() {
                torrents.retain(|t| {
                    let id = t.get("id").and_then(|v| v.as_u64()).unwrap_or(0) as usize;
                    !dropped.contains(&id)
                });
            }
        }

        // Merge the completed-downloads history into the response so finished
        // downloads remain visible after being removed from the session.
        {
            let live_hashes: HashSet<String> = torrents
                .iter()
                .filter_map(|t| t.get("info_hash").and_then(|h| h.as_str()))
                .map(|h| h.to_lowercase())
                .collect();

            // Snapshot the history under a short lock, then release it before
            // any disk I/O (re-scanning) so a slow folder never blocks the poll.
            let history: Vec<CompletedEntry> = {
                let store = state.completed.lock().map_err(|e| e.to_string())?;
                store.entries().to_vec()
            };

            for entry in history {
                if live_hashes.contains(&entry.info_hash.to_lowercase()) {
                    // Still live in the session: an earlier session.delete likely
                    // failed, leaving the file descriptors open. Drop the history
                    // entry so the next poll re-records it and retries the delete.
                    let _ = state
                        .completed
                        .lock()
                        .map_err(|e| e.to_string())?
                        .remove(&entry.info_hash);
                    continue;
                }
                let mut files = entry.files.clone();
                let needs_rescan = files.is_empty()
                    || !any_file_exists(&entry.output_folder, &files);
                if needs_rescan {
                    // The completion-time snapshot can be empty (its HTTP fetch
                    // occasionally fails right before session removal), or its
                    // recorded paths can be stale/incorrect. Rebuild from disk
                    // so streaming/open work, and persist it so the store
                    // self-heals and scans are not repeated on every poll.
                    let scanned = scan_output_files(&entry.output_folder);
                    if !scanned.is_empty() {
                        files = scanned.clone();
                        let _ = state
                            .completed
                            .lock()
                            .map_err(|e| e.to_string())?
                            .set_files(&entry.info_hash, scanned);
                    }
                }
                torrents.push(serde_json::json!({
                    "id": format!("c:{}", entry.info_hash),
                    "name": entry.name,
                    "info_hash": entry.info_hash,
                    "output_folder": entry.output_folder,
                    "is_stream": false,
                    "is_completed_history": true,
                    "completed_at": entry.finished_at,
                    "files": files,
                    "stats": {
                        "state": "completed",
                        "finished": true,
                        "total_bytes": entry.total_bytes,
                        "progress_bytes": entry.total_bytes,
                    },
                }));
            }
        }
    }

    Ok(json)
}

/// Recursively list files on disk under `output_folder`, as paths relative to
/// the folder (matching the shape of the snapshot recorded at completion time).
/// Symlinks are never followed — a symlinked directory pointing at an ancestor
/// would otherwise cause the traversal to loop forever.
fn scan_output_files(output_folder: &str) -> Vec<String> {
    let base = std::path::Path::new(output_folder);
    let Ok(base_canonical) = std::fs::canonicalize(base) else {
        return Vec::new();
    };
    let mut files = Vec::new();
    let mut visited = std::collections::HashSet::new();
    let mut stack = vec![base_canonical.clone()];
    while let Some(dir) = stack.pop() {
        if !visited.insert(dir.clone()) {
            continue;
        }
        let Ok(entries) = std::fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.flatten() {
            let Ok(file_type) = entry.file_type() else {
                continue;
            };
            let path = entry.path();
            if file_type.is_dir() {
                stack.push(path);
            } else if file_type.is_file() {
                if let Ok(rel) = path.strip_prefix(&base_canonical) {
                    files.push(rel.to_string_lossy().to_string());
                }
            }
        }
    }
    files
}

/// True when at least one of the recorded file paths still exists on disk.
/// Used to detect stale/incorrect snapshots that deserve a disk re-scan.
fn any_file_exists(output_folder: &str, files: &[String]) -> bool {
    let base = std::path::Path::new(output_folder);
    files.iter().any(|rel| !rel.is_empty() && base.join(rel).is_file())
}

async fn fetch_torrent_files(
    client: &reqwest::Client,
    credentials: &str,
    port: u16,
    id: usize,
) -> Vec<String> {
    let url = format!("http://127.0.0.1:{}/torrents/{}", port, id);
    if let Ok(resp) = client
        .get(&url)
        .header("Authorization", credentials)
        .send()
        .await
    {
        if let Ok(json) = resp.json::<serde_json::Value>().await {
            if let Some(files) = json.get("files").and_then(|f| f.as_array()) {
                return files
                    .iter()
                    .filter_map(|f| f.get("name").and_then(|n| n.as_str()).map(String::from))
                    .collect();
            }
        }
    }
    Vec::new()
}

#[tauri::command]
pub async fn get_torrent_details(
    state: State<'_, TorrentState>,
    id: String,
) -> Result<serde_json::Value, String> {
    // Validate id is numeric to prevent path traversal
    id.parse::<usize>().map_err(|_| "Invalid torrent ID: must be numeric".to_string())?;
    let (_, api_port) = state.session()?;
    let url = format!("http://127.0.0.1:{}/torrents/{}", api_port, id);
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
    validate_magnet_or_url(&magnet_or_url).await?;
    let add_torrent = AddTorrent::from_url(&magnet_or_url);
    let options = AddTorrentOptions {
        list_only: true,
        ..Default::default()
    };

    let (session, _) = state.session()?;

    let response = session
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


