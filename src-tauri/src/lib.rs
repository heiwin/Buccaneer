use reqwest::Client;
use serde_json::{json, Value};
use tauri::Manager;
use std::sync::Mutex;

use base64::Engine;

const DEFAULT_TMDB_API_KEY: &str = "90d235c4803793948cf3cd65a6867565";

pub struct TmdbState {
    pub api_key: Mutex<String>,
}

pub struct HttpState {
    pub client: Client,
}

#[tauri::command]
async fn set_tmdb_api_key(state: tauri::State<'_, TmdbState>, key: String) -> Result<(), String> {
    let final_key = if key.trim().is_empty() {
        DEFAULT_TMDB_API_KEY.to_string()
    } else {
        key
    };
    *state.api_key.lock().map_err(|e| e.to_string())? = final_key;
    Ok(())
}

// Fixed: was knaben.org/api/v1/ — correct endpoint is api.knaben.org/v1
const KNABEN_API_URL: &str = "https://api.knaben.org/v1";
const ALLOWED_TRACKERS: &[&str] = &["1337x", "The Pirate Bay", "YTS", "Nyaa.si", "sukebei.nyaa.si"];

// ─── TMDB Commands ───────────────────────────────────────────────────────────

macro_rules! tmdb_key {
    ($state:expr) => {
        $state.api_key.lock().map_err(|e| e.to_string())?.clone()
    };
}

#[tauri::command]
async fn get_trending_movies(tmdb_state: tauri::State<'_, TmdbState>, http_state: tauri::State<'_, HttpState>) -> Result<Value, String> {
    let key = tmdb_key!(tmdb_state);
    let url = format!(
        "https://api.themoviedb.org/3/trending/movie/week?api_key={}",
        key
    );
    let res = http_state.client.get(&url).send().await.map_err(|e| e.to_string())?;
    let json: Value = res.json().await.map_err(|e| e.to_string())?;
    Ok(json)
}

#[tauri::command]
async fn get_trending_tv_series(tmdb_state: tauri::State<'_, TmdbState>, http_state: tauri::State<'_, HttpState>) -> Result<Value, String> {
    let key = tmdb_key!(tmdb_state);
    let url = format!(
        "https://api.themoviedb.org/3/trending/tv/week?api_key={}",
        key
    );
    let res = http_state.client.get(&url).send().await.map_err(|e| e.to_string())?;
    let json: Value = res.json().await.map_err(|e| e.to_string())?;
    Ok(json)
}

#[tauri::command]
async fn get_movie_details(movie_id: u64, tmdb_state: tauri::State<'_, TmdbState>, http_state: tauri::State<'_, HttpState>) -> Result<Value, String> {
    let key = tmdb_key!(tmdb_state);
    let url = format!(
        "https://api.themoviedb.org/3/movie/{}?api_key={}&append_to_response=credits,videos",
        movie_id, key
    );
    let res = http_state.client.get(&url).send().await.map_err(|e| e.to_string())?;
    let json: Value = res.json().await.map_err(|e| e.to_string())?;
    Ok(json)
}

#[tauri::command]
async fn get_tv_details(tv_id: u64, tmdb_state: tauri::State<'_, TmdbState>, http_state: tauri::State<'_, HttpState>) -> Result<Value, String> {
    let key = tmdb_key!(tmdb_state);
    let url = format!(
        "https://api.themoviedb.org/3/tv/{}?api_key={}&append_to_response=credits,videos",
        tv_id, key
    );
    let res = http_state.client.get(&url).send().await.map_err(|e| e.to_string())?;
    let json: Value = res.json().await.map_err(|e| e.to_string())?;
    Ok(json)
}

#[tauri::command]
async fn get_tv_season_details(tv_id: u64, season_number: u32, tmdb_state: tauri::State<'_, TmdbState>, http_state: tauri::State<'_, HttpState>) -> Result<Value, String> {
    let key = tmdb_key!(tmdb_state);
    let url = format!(
        "https://api.themoviedb.org/3/tv/{}/season/{}?api_key={}",
        tv_id, season_number, key
    );
    let res = http_state.client.get(&url).send().await.map_err(|e| e.to_string())?;
    let json: Value = res.json().await.map_err(|e| e.to_string())?;
    Ok(json)
}

// ─── TMDB Discover Command ────────────────────────────────────────────────────

#[tauri::command]
async fn discover_media(
    media_type: String,
    genre_id: Option<u64>,
    year: Option<u32>,
    page: Option<u32>,
    rating: Option<f32>,
    language: Option<String>,
    watch_providers: Option<String>,
    watch_region: Option<String>,
    watch_monetization_types: Option<String>,
    tmdb_state: tauri::State<'_, TmdbState>,
    http_state: tauri::State<'_, HttpState>,
) -> Result<Value, String> {
    let key = tmdb_key!(tmdb_state);
    let page = page.unwrap_or(1);
    let mut url = format!(
        "https://api.themoviedb.org/3/discover/{}?api_key={}&sort_by=popularity.desc&page={}",
        media_type, key, page
    );
    if let Some(g) = genre_id {
        url.push_str(&format!("&with_genres={}", g));
    }
    if let Some(y) = year {
        if media_type == "movie" {
            url.push_str(&format!("&primary_release_year={}", y));
        } else {
            url.push_str(&format!("&first_air_date_year={}", y));
        }
    }
    if let Some(r) = rating {
        url.push_str(&format!("&vote_average.gte={}&vote_count.gte=50", r));
    }
    if let Some(l) = language {
        url.push_str(&format!("&with_original_language={}", l));
    }
    if let Some(p) = &watch_providers {
        url.push_str(&format!("&with_watch_providers={}", p));
    }
    if let Some(r) = &watch_region {
        url.push_str(&format!("&watch_region={}", r));
    }
    if let Some(m) = &watch_monetization_types {
        url.push_str(&format!("&with_watch_monetization_types={}", m));
    }
    let res = http_state.client.get(&url).send().await.map_err(|e| e.to_string())?;
    let json: Value = res.json().await.map_err(|e| e.to_string())?;
    Ok(json)
}

// ─── TMDB Genre List ──────────────────────────────────────────────────────────

#[tauri::command]
async fn get_genres(media_type: String, tmdb_state: tauri::State<'_, TmdbState>, http_state: tauri::State<'_, HttpState>) -> Result<Value, String> {
    let key = tmdb_key!(tmdb_state);
    let url = format!(
        "https://api.themoviedb.org/3/genre/{}/list?api_key={}",
        media_type, key
    );
    let res = http_state.client.get(&url).send().await.map_err(|e| e.to_string())?;
    let json: Value = res.json().await.map_err(|e| e.to_string())?;
    Ok(json)
}

// ─── TMDB Search Command ──────────────────────────────────────────────────────

#[tauri::command]
async fn search_tmdb(query: String, tmdb_state: tauri::State<'_, TmdbState>, http_state: tauri::State<'_, HttpState>) -> Result<Value, String> {
    let key = tmdb_key!(tmdb_state);
    let url = reqwest::Url::parse_with_params(
        "https://api.themoviedb.org/3/search/multi",
        &[("api_key", &key), ("query", &query)],
    )
    .map_err(|e| e.to_string())?;
    let res = http_state.client.get(url).send().await.map_err(|e| e.to_string())?;
    let mut json: Value = res.json().await.map_err(|e| e.to_string())?;

    // Filter out "person" results, keep only movie and tv
    if let Some(results) = json.get_mut("results").and_then(|r| r.as_array_mut()) {
        results.retain(|item| {
            item.get("media_type")
                .and_then(|t| t.as_str())
                .map(|t| t == "movie" || t == "tv")
                .unwrap_or(false)
        });
    }

    Ok(json)
}

// ─── Knaben Torrent Command ───────────────────────────────────────────────────

fn is_cam_or_telesync(title: &str) -> bool {
    let lower = title.to_lowercase();
    let keywords = [
        "camrip", "telesync", "hdts", "workprint",
        "dvdscr", "dvd-screener", "telecine", "hdtc",
    ];
    keywords.iter().any(|&kw| lower.contains(kw))
}

#[tauri::command]
async fn search_torrents(query: String, media_type: Option<String>, source: Option<String>, tmdb_state: tauri::State<'_, TmdbState>, http_state: tauri::State<'_, HttpState>) -> Result<Value, String> {
    let api_key = tmdb_key!(tmdb_state);

    match source.as_deref().unwrap_or("knaben") {
        "apibay" => search_apibay(&http_state.client, &query).await,
        "yts" => search_yts(&http_state.client, &query).await,
        "eztv" => search_eztv(&http_state.client, &query, &api_key).await,
        _ => {
            // knaben: try knaben first, fallback to apibay
            match search_knaben(&http_state.client, &query, &media_type).await {
                Ok(mut json) => {
                    if let Some(hits) = json.get_mut("hits").and_then(|h| h.as_array_mut()) {
                        hits.retain(|hit| {
                            hit.get("tracker")
                                .and_then(|t| t.as_str())
                                .map(|t| ALLOWED_TRACKERS.contains(&t))
                                .unwrap_or(false)
                        });
                        hits.retain(|hit| {
                            hit.get("title")
                                .and_then(|t| t.as_str())
                                .map(|t| !is_cam_or_telesync(t))
                                .unwrap_or(true)
                        });
                        if !hits.is_empty() {
                            return Ok(json);
                        }
                    }
                    search_apibay(&http_state.client, &query).await
                }
                Err(_) => search_apibay(&http_state.client, &query).await,
            }
        }
    }
}

async fn search_knaben(client: &Client, query: &str, media_type: &Option<String>) -> Result<Value, String> {
    let mut body = json!({
        "search_type": "100%",
        "search_field": "title",
        "query": query,
        "order_by": "seeders",
        "order_direction": "desc",
        "from": 0,
        "size": 50,
        "hide_unsafe": true,
        "hide_xxx": true
    });

    if let Some(mt) = media_type {
        let category_ids = match mt.as_str() {
            "movie" => vec![3000000],
            "tv" => vec![2000000],
            _ => vec![],
        };
        if !category_ids.is_empty() {
            body["categories"] = json!(category_ids);
        }
    }

    let res = client
        .post(KNABEN_API_URL)
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("knaben error: {}", e))?;

    let json: Value = res.json().await.map_err(|e| format!("knaben parse: {}", e))?;
    Ok(json)
}

fn unix_to_iso(ts: i64) -> String {
    if ts <= 0 {
        return String::new();
    }
    chrono::DateTime::from_timestamp(ts, 0)
        .map(|dt| dt.format("%Y-%m-%dT%H:%M:%S").to_string())
        .unwrap_or_default()
}

async fn search_apibay(client: &Client, query: &str) -> Result<Value, String> {
    let url = reqwest::Url::parse_with_params("https://apibay.org/q.php", &[("q", query)])
        .map_err(|e| format!("apibay URL error: {}", e))?;

    let res = client
        .get(url)
        .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
        .send()
        .await
        .map_err(|e| format!("apibay error: {}", e))?;

    let items: Vec<Value> = res.json().await.map_err(|e| format!("apibay parse: {}", e))?;

    let mut hits: Vec<Value> = items
        .into_iter()
        .map(|item| {
            let id = item["id"].as_str().unwrap_or("0").to_string();
            let name = item["name"].as_str().unwrap_or("").to_string();
            let info_hash = item["info_hash"].as_str().unwrap_or("").to_string();
            let seeders = item["seeders"]
                .as_str()
                .and_then(|s| s.parse::<i64>().ok())
                .unwrap_or(0);
            let leechers = item["leechers"]
                .as_str()
                .and_then(|s| s.parse::<i64>().ok())
                .unwrap_or(0);
            let size = item["size"]
                .as_str()
                .and_then(|s| s.parse::<i64>().ok())
                .unwrap_or(0);
            let added = item["added"]
                .as_str()
                .and_then(|s| s.parse::<i64>().ok())
                .unwrap_or(0);
            let category = item["category"].as_str().unwrap_or("0").to_string();

            let magnet_url = if !info_hash.is_empty() {
                format!("magnet:?xt=urn:btih:{}&dn={}", info_hash, urlencoding::encode(&name))
            } else {
                String::new()
            };

            json!({
                "id": id,
                "title": name,
                "tracker": "The Pirate Bay",
                "trackerId": "thepiratebay",
                "magnetUrl": magnet_url,
                "hash": info_hash,
                "bytes": size,
                "seeders": seeders,
                "peers": leechers,
                "category": category,
                "date": unix_to_iso(added),
                "lastSeen": unix_to_iso(added),
                "virusDetection": 0,
                "details": format!("https://apibay.org/t.php?id={}", id),
            })
        })
        .collect();

    hits.retain(|item| {
        item["title"].as_str().map(|t| !is_cam_or_telesync(t)).unwrap_or(true)
    });

    Ok(json!({
        "total": { "value": hits.len(), "relation": "eq" },
        "max_score": null,
        "hits": hits
    }))
}

async fn search_yts(client: &Client, query: &str) -> Result<Value, String> {
    let url = reqwest::Url::parse_with_params(
        "https://movies-api.accel.li/api/v2/list_movies.json",
        &[("query_term", query), ("limit", "50")],
    )
    .map_err(|e| format!("yts URL error: {}", e))?;

    let res = client.get(url).send().await.map_err(|e| format!("yts error: {}", e))?;
    let json: Value = res.json().await.map_err(|e| format!("yts parse: {}", e))?;

    if json["status"] != "ok" {
        return Err(json["status_message"]
            .as_str()
            .unwrap_or("YTS API error")
            .to_string());
    }

    let movies = json["data"]["movies"].as_array().cloned().unwrap_or_default();

    let mut hits: Vec<Value> = movies
        .iter()
        .flat_map(|movie| {
            let title = movie["title_english"]
                .as_str()
                .or_else(|| movie["title"].as_str())
                .unwrap_or("")
                .to_string();
            let year = movie["year"].as_u64().unwrap_or(0);
            let movie_id = movie["id"].as_u64().unwrap_or(0);
            let torrents = movie["torrents"].as_array().cloned().unwrap_or_default();

            torrents.into_iter().map(move |t| {
                let hash = t["hash"].as_str().unwrap_or("").to_string();
                let quality = t["quality"].as_str().unwrap_or("").to_string();
                let seeds = t["seeds"].as_i64().unwrap_or(0);
                let peers = t["peers"].as_i64().unwrap_or(0);
                let size_bytes = t["size_bytes"].as_i64().unwrap_or(0);
                let date_uploaded = t["date_uploaded_unix"].as_i64().unwrap_or(0);

                let magnet_url = if !hash.is_empty() {
                    let dn = format!("{} {}", title, quality);
                    let encoded_name = urlencoding::encode(&dn);
                    format!("magnet:?xt=urn:btih:{}&dn={}", hash, encoded_name)
                } else {
                    String::new()
                };

                json!({
                    "id": format!("yts-{}", hash),
                    "title": format!("{} ({}) [{}]", title, year, quality),
                    "tracker": "YTS",
                    "trackerId": "yts",
                    "magnetUrl": magnet_url,
                    "hash": hash,
                    "bytes": size_bytes,
                    "seeders": seeds,
                    "peers": peers,
                    "category": "movie",
                    "date": unix_to_iso(date_uploaded),
                    "lastSeen": unix_to_iso(date_uploaded),
                    "virusDetection": 0,
                    "details": format!("https://yts.bz/movie/{}", movie_id),
                })
            })
        })
        .collect();

    hits.retain(|item| {
        item["title"].as_str().map(|t| !is_cam_or_telesync(t)).unwrap_or(true)
    });

    Ok(json!({
        "total": { "value": hits.len(), "relation": "eq" },
        "max_score": null,
        "hits": hits
    }))
}

async fn search_eztv(client: &Client, query: &str, api_key: &str) -> Result<Value, String> {
    // 1. Search TMDB for TV shows matching the query
    let tmdb_url = reqwest::Url::parse_with_params(
        "https://api.themoviedb.org/3/search/multi",
        &[("api_key", api_key), ("query", query)],
    )
    .map_err(|e| format!("tmdb URL error: {}", e))?;

    let res = client
        .get(tmdb_url)
        .send()
        .await
        .map_err(|e| format!("tmdb error: {}", e))?;
    let tmdb_json: Value = res.json().await.map_err(|e| format!("tmdb parse: {}", e))?;

    let tv_result = tmdb_json["results"]
        .as_array()
        .and_then(|r| r.iter().find(|item| item["media_type"] == "tv"))
        .ok_or_else(|| "No TV series found for this query".to_string())?;

    let tv_id = tv_result["id"]
        .as_u64()
        .ok_or_else(|| "Invalid TV ID".to_string())?;

    // 2. Get IMDB ID from TMDB
    let details_url = format!(
        "https://api.themoviedb.org/3/tv/{}?api_key={}&append_to_response=external_ids",
        tv_id, api_key
    );
    let details_res = client
        .get(&details_url)
        .send()
        .await
        .map_err(|e| format!("tmdb details error: {}", e))?;
    let details: Value = details_res
        .json()
        .await
        .map_err(|e| format!("tmdb details parse: {}", e))?;

    let imdb_id = details["external_ids"]["imdb_id"]
        .as_str()
        .unwrap_or("")
        .trim_start_matches("tt")
        .to_string();

    if imdb_id.is_empty() {
        return Err("No IMDB ID found for this TV series".to_string());
    }

    // 3. Call EZTV API with the IMDB ID
    let eztv_url = reqwest::Url::parse_with_params(
        "https://eztvx.to/api/get-torrents",
        &[("imdb_id", imdb_id.as_str()), ("limit", "50")],
    )
    .map_err(|e| format!("eztv URL error: {}", e))?;

    let eztv_res = client
        .get(eztv_url)
        .send()
        .await
        .map_err(|e| format!("eztv error: {}", e))?;
    let eztv_json: Value = eztv_res
        .json()
        .await
        .map_err(|e| format!("eztv parse: {}", e))?;

    let torrents = eztv_json["torrents"].as_array().cloned().unwrap_or_default();

    let mut hits: Vec<Value> = torrents
        .iter()
        .map(|t| {
            let hash = t["hash"].as_str().unwrap_or("").to_string();
            let title = t["title"].as_str().unwrap_or("").to_string();
            let seeds = t["seeds"].as_i64().unwrap_or(0);
            let peers = t["peers"].as_i64().unwrap_or(0);
            let size_bytes = t["size_bytes"]
                .as_str()
                .and_then(|s| s.parse::<i64>().ok())
                .unwrap_or(0);
            let date_released = t["date_released_unix"].as_i64().unwrap_or(0);

            json!({
                "id": format!("eztv-{}", hash),
                "title": title,
                "tracker": "EZTV",
                "trackerId": "eztv",
                "magnetUrl": t["magnet_url"].as_str().unwrap_or(""),
                "hash": hash,
                "bytes": size_bytes,
                "seeders": seeds,
                "peers": peers,
                "category": "tv",
                "date": unix_to_iso(date_released),
                "lastSeen": unix_to_iso(date_released),
                "virusDetection": 0,
                "details": format!("https://eztvx.to/torrents/{}", t["id"]),
            })
        })
        .collect();

    hits.retain(|item| {
        item["title"].as_str().map(|t| !is_cam_or_telesync(t)).unwrap_or(true)
    });

    let count = eztv_json["torrents_count"].as_u64().unwrap_or(0);

    Ok(json!({
        "total": { "value": count, "relation": "eq" },
        "max_score": null,
        "hits": hits
    }))
}


pub mod torrent;
pub mod vlc;

// ─── App Entry Point ─────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
#[tauri::command]
async fn check_update() -> Result<serde_json::Value, String> {
    let client = reqwest::Client::builder()
        .user_agent("Buccaneer")
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client
        .get("https://api.github.com/repos/heiwin/Buccaneer/releases/latest")
        .send()
        .await
        .map_err(|e| format!("Failed to check for updates: {}", e))?;

    if !resp.status().is_success() {
        return Ok(serde_json::json!({ "available": false, "error": "GitHub API rate limited" }));
    }

    let json: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;

    let latest_tag = json["tag_name"]
        .as_str()
        .unwrap_or("v0.0.0")
        .trim_start_matches('v');

    let current = env!("CARGO_PKG_VERSION");
    let available = if let (Ok(latest), Ok(cur)) = (
        semver::Version::parse(latest_tag),
        semver::Version::parse(current),
    ) {
        latest > cur
    } else {
        latest_tag != current
    };

    Ok(serde_json::json!({
        "available": available,
        "latestVersion": json["tag_name"].as_str().unwrap_or("unknown"),
        "downloadUrl": "https://github.com/heiwin/Buccaneer/releases/latest",
        "currentVersion": current,
    }))
}

#[tauri::command]
fn open_in_file_manager(path: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Failed to open directory: {}", e))?;
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Failed to open directory: {}", e))?;
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Failed to open directory: {}", e))?;
    }
    Ok(())
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .manage(TmdbState {
            api_key: Mutex::new(DEFAULT_TMDB_API_KEY.to_string()),
        })
        .manage(HttpState {
            client: Client::new(),
        })
        .invoke_handler(tauri::generate_handler![
            set_tmdb_api_key,
            get_trending_movies,
            get_trending_tv_series,
            get_movie_details,
            get_tv_details,
            get_tv_season_details,
            discover_media,
            get_genres,
            search_tmdb,
            search_torrents,
            check_update,
            open_in_file_manager,
            torrent::add_torrent,
            torrent::get_torrent_metadata,
            torrent::pause_torrent,
            torrent::resume_torrent,
            torrent::remove_torrent,
            torrent::get_active_torrents,
            torrent::get_torrent_details,
            vlc::auto_detect_vlc,
            vlc::stream_with_vlc,
            torrent::update_clear_streaming_setting,
            torrent::update_ratelimits,
            torrent::set_download_path,
        ])
        .setup(|app| {
            // On Linux, register the deep link scheme at runtime via xdg-settings.
            // On macOS/Windows it is handled automatically by the app bundle.
            #[cfg(target_os = "linux")]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                app.deep_link().register_all()?;
            }

            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .filter(|metadata| {
                            !metadata.target().starts_with("librqbit")
                                && !metadata.target().starts_with("tracing::span")
                        })
                        .build(),
                )?;
            }

            // Initialize librqbit session
            let handle = app.handle().clone();

            // Set up persistence directory for torrent cache
            let persistence_dir = app
                .path()
                .app_data_dir()
                .unwrap_or_else(|_| std::path::PathBuf::from("."))
                .join("torrents");
            let _ = std::fs::create_dir_all(&persistence_dir);

            tauri::async_runtime::block_on(async move {
                use directories::UserDirs;
                let default_path = if let Some(user_dirs) = UserDirs::new() {
                    user_dirs
                        .download_dir()
                        .unwrap_or(user_dirs.home_dir())
                        .join("Buccaneer")
                } else {
                    std::env::var("HOME")
                        .map(|h| std::path::PathBuf::from(h).join("Downloads/Buccaneer"))
                        .unwrap_or_else(|_| std::path::PathBuf::from("/tmp/Buccaneer"))
                };

                // Ensure dir exists
                let _ = std::fs::create_dir_all(&default_path);

                // Check if we should clear streaming folder on startup (handles app crashes / hard kills like Ctrl+C)
                let streaming_dir = default_path.join("Streaming");
                if streaming_dir.exists() {
                    log::info!("Found existing Streaming directory at startup. Cleaning it up...");
                    let _ = std::fs::remove_dir_all(&streaming_dir);
                }

                // Start librqbit session with persistence enabled
                // Saves torrents to disk so they persist across app restarts
                let opts = librqbit::SessionOptions {
                    persistence: Some(librqbit::SessionPersistenceConfig::Json {
                        folder: Some(persistence_dir),
                    }),
                    ..Default::default()
                };

                if let Ok(session) = librqbit::Session::new_with_opts(default_path.clone(), opts).await {
                    let session_arc = session; // Session::new_with_opts already returns Arc<Session>

                    // Generate random credentials for the local HTTP API
                    let password = format!("{}-{}",
                        std::time::SystemTime::now()
                            .duration_since(std::time::UNIX_EPOCH)
                            .unwrap_or_default()
                            .as_nanos(),
                        std::process::id()
                    );
                    let api_credentials = format!("Basic {}", base64::engine::general_purpose::STANDARD.encode(format!("buccaneer:{}", password)));
                    let api_credentials_url = format!("buccaneer:{}", password);
                    let api_opts = librqbit::http_api::HttpApiOptions {
                        basic_auth: Some(("buccaneer".to_string(), password)),
                        ..Default::default()
                    };

                    // Create API and HTTP API
                    let api = librqbit::api::Api::new(session_arc.clone(), None, None);
                    let http_api = librqbit::http_api::HttpApi::new(api, Some(api_opts));

                    // Start the HTTP server on port 3030
                    if let Ok(listener) = tokio::net::TcpListener::bind("127.0.0.1:3030").await {
                        tokio::spawn(async move {
                            if let Err(e) = http_api.make_http_api_and_run(listener, None).await {
                                log::error!("HTTP API error: {}", e);
                            }
                        });
                    } else {
                        log::error!("Failed to bind to 127.0.0.1:3030");
                    }

                    handle.manage(torrent::TorrentState {
                        session: session_arc.clone(),
                        http_client: Client::new(),
                        streamed_torrents: std::sync::Arc::new(std::sync::Mutex::new(
                            std::collections::HashSet::new(),
                        )),
                        base_path: std::sync::Arc::new(std::sync::Mutex::new(
                            default_path.to_string_lossy().to_string()
                        )),
                        clear_streaming_on_exit: std::sync::Arc::new(std::sync::atomic::AtomicBool::new(true)),
                        api_credentials: api_credentials.clone(),
                        api_credentials_url,
                    });

                    // Clean up restored torrents whose output directory no longer exists
                    let cleanup_client = Client::new();
                    let cleanup_credentials = api_credentials.clone();
                    tauri::async_runtime::spawn(async move {
                        tokio::time::sleep(std::time::Duration::from_secs(1)).await;

                        if let Ok(resp) = cleanup_client
                            .get("http://127.0.0.1:3030/torrents")
                            .header("Authorization", &cleanup_credentials)
                            .send()
                            .await
                        {
                            if let Ok(json) = resp.json::<serde_json::Value>().await {
                                if let Some(torrents) = json.get("torrents").and_then(|t| t.as_array()) {
                                    for t in torrents {
                                        let id = t.get("id").and_then(|v| v.as_u64());
                                        let output = t.get("output_folder").and_then(|v| v.as_str());
                                        if let (Some(id), Some(output)) = (id, output) {
                                            if !std::path::Path::new(output).exists() {
                                                log::info!(
                                                    "Removing torrent {}: output folder {} not found",
                                                    id,
                                                    output
                                                );
                                                let _ = session_arc
                                                    .delete(
                                                        librqbit::api::TorrentIdOrHash::Id(id as usize),
                                                        false,
                                                    )
                                                    .await;
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    });
                } else {
                    log::error!("Failed to initialize librqbit session");
                }
            });

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if let tauri::RunEvent::ExitRequested { api, .. } = event {
                // Prevent immediate exit to allow cleanup to finish
                api.prevent_exit();

                let (session, stream_ids, clear_files, base_path) = {
                    let state = app.state::<torrent::TorrentState>();
                    let ids = if let Ok(streams) = state.streamed_torrents.lock() {
                        streams.iter().copied().collect::<Vec<_>>()
                    } else {
                        vec![]
                    };
                    (
                        state.session.clone(), 
                        ids,
                        state.clear_streaming_on_exit.load(std::sync::atomic::Ordering::Relaxed),
                        state.base_path.lock().map(|b| b.clone()).unwrap_or_default(),
                    )
                };

                // Spawn a new thread so we don't block the event loop, then explicitly exit
                std::thread::spawn(move || {
                    log::info!("Starting exit cleanup. Stream IDs: {:?}, Clear files: {}", stream_ids, clear_files);
                    
                    for id in stream_ids {
                        let session_clone = session.clone();
                        tauri::async_runtime::block_on(async move {
                            // Tell librqbit to delete the files as well if clear_files is true
                            let _ = session_clone
                                .delete(librqbit::api::TorrentIdOrHash::Id(id), clear_files)
                                .await;
                        });
                    }

                    if clear_files {
                        let streaming_dir = std::path::Path::new(&base_path).join("Streaming");
                        log::info!("Deleting streaming directory: {:?}", streaming_dir);
                        
                        // Retry with exponential backoff to ensure librqbit releases file locks
                        let mut retries = 5;
                        let mut delay_ms = 200;
                        loop {
                            match std::fs::remove_dir_all(&streaming_dir) {
                                Ok(_) => {
                                    log::info!("Successfully deleted streaming directory.");
                                    break;
                                }
                                Err(e) => {
                                    retries -= 1;
                                    if retries == 0 {
                                        log::error!("Failed to delete streaming directory after 5 retries: {}", e);
                                        break;
                                    }
                                    std::thread::sleep(std::time::Duration::from_millis(delay_ms));
                                    delay_ms *= 2;
                                }
                            }
                        }
                    }

                    log::info!("Cleanup finished. Exiting process.");
                    std::process::exit(0);
                });
            }
        });
}
