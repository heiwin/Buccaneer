use reqwest::Client;
use serde_json::{json, Value};
use tauri::Manager;
use std::sync::Mutex;

use base64::Engine;
use tauri_plugin_dialog::DialogExt;

// This API key is intentionally embedded in the binary. It's a free, rate-limited key
// that only provides read-only access to TMDB's movie/TV database. Exposure is not a
// security concern — there are no write permissions, quotas are per-IP, and the key
// cannot be used for any privileged action.
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

async fn tmdb_get(http_state: &HttpState, url: &str) -> Result<Value, String> {
    let mut last_err = String::new();
    for attempt in 0..3 {
        match http_state.client.get(url).send().await {
            Ok(res) => {
                let status = res.status();
                if !status.is_success() {
                    let body = res.text().await.unwrap_or_default();
                    return Err(format!("TMDB error {}: {}", status.as_u16(), body));
                }
                return res.json().await.map_err(|e| format!("TMDB parse error: {}", e));
            }
            Err(e) => {
                last_err = format!("TMDB network error: {}", e);
                if attempt < 2 {
                    tokio::time::sleep(std::time::Duration::from_millis(500 * (attempt + 1))).await;
                }
            }
        }
    }
    Err(last_err)
}

#[tauri::command]
async fn get_trending_movies(tmdb_state: tauri::State<'_, TmdbState>, http_state: tauri::State<'_, HttpState>) -> Result<Value, String> {
    let key = tmdb_key!(tmdb_state);
    let url = format!(
        "https://api.themoviedb.org/3/trending/movie/week?api_key={}",
        key
    );
    tmdb_get(&http_state, &url).await
}

#[tauri::command]
async fn get_trending_tv_series(tmdb_state: tauri::State<'_, TmdbState>, http_state: tauri::State<'_, HttpState>) -> Result<Value, String> {
    let key = tmdb_key!(tmdb_state);
    let url = format!(
        "https://api.themoviedb.org/3/trending/tv/week?api_key={}",
        key
    );
    tmdb_get(&http_state, &url).await
}

#[tauri::command]
async fn get_movie_details(movie_id: u64, tmdb_state: tauri::State<'_, TmdbState>, http_state: tauri::State<'_, HttpState>) -> Result<Value, String> {
    let key = tmdb_key!(tmdb_state);
    let url = format!(
        "https://api.themoviedb.org/3/movie/{}?api_key={}&append_to_response=credits,videos",
        movie_id, key
    );
    tmdb_get(&http_state, &url).await
}

#[tauri::command]
async fn get_tv_details(tv_id: u64, tmdb_state: tauri::State<'_, TmdbState>, http_state: tauri::State<'_, HttpState>) -> Result<Value, String> {
    let key = tmdb_key!(tmdb_state);
    let url = format!(
        "https://api.themoviedb.org/3/tv/{}?api_key={}&append_to_response=credits,videos",
        tv_id, key
    );
    tmdb_get(&http_state, &url).await
}

#[tauri::command]
async fn get_tv_season_details(tv_id: u64, season_number: u32, tmdb_state: tauri::State<'_, TmdbState>, http_state: tauri::State<'_, HttpState>) -> Result<Value, String> {
    let key = tmdb_key!(tmdb_state);
    let url = format!(
        "https://api.themoviedb.org/3/tv/{}/season/{}?api_key={}",
        tv_id, season_number, key
    );
    tmdb_get(&http_state, &url).await
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
    tmdb_get(&http_state, &url).await
}

// ─── TMDB Genre List ──────────────────────────────────────────────────────────

#[tauri::command]
async fn get_genres(media_type: String, tmdb_state: tauri::State<'_, TmdbState>, http_state: tauri::State<'_, HttpState>) -> Result<Value, String> {
    let key = tmdb_key!(tmdb_state);
    let url = format!(
        "https://api.themoviedb.org/3/genre/{}/list?api_key={}",
        media_type, key
    );
    tmdb_get(&http_state, &url).await
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
    let mut json: Value = tmdb_get(&http_state, url.as_str()).await?;

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

fn extract_episode_pattern(query: &str) -> Option<String> {
    let lower = query.to_lowercase();
    let chars: Vec<char> = lower.chars().collect();
    // s##e## pattern first
    for i in 0..chars.len().saturating_sub(5) {
        if chars[i] == 's'
            && chars[i + 1].is_ascii_digit()
            && chars[i + 2].is_ascii_digit()
            && chars[i + 3] == 'e'
            && chars[i + 4].is_ascii_digit()
            && chars[i + 5].is_ascii_digit()
        {
            return Some(chars[i..i + 6].iter().collect());
        }
    }
    // s## pattern (season-only)
    for i in 0..chars.len().saturating_sub(2) {
        if chars[i] == 's'
            && chars[i + 1].is_ascii_digit()
            && chars[i + 2].is_ascii_digit()
            && (i + 3 >= chars.len() || !chars[i + 3].is_ascii_digit())
        {
            return Some(chars[i..i + 3].iter().collect());
        }
    }
    None
}

fn filter_by_episode_pattern(hits: &mut Vec<Value>, pattern: &str) {
    let pat_lower = pattern.to_lowercase();
    hits.retain(|hit| {
        hit.get("title")
            .and_then(|t| t.as_str())
            .map(|t| t.to_lowercase().contains(&pat_lower))
            .unwrap_or(false)
    });
}

fn is_cam_or_telesync(title: &str) -> bool {
    let lower = title.to_lowercase();
    let keywords = [
        "camrip", "telesync", "hdts", "workprint",
        "dvdscr", "dvd-screener", "telecine", "hdtc",
    ];
    if keywords.iter().any(|&kw| lower.contains(kw)) {
        return true;
    }
    lower.contains(".cam.") || lower.contains(" cam ")
        || lower.contains("-cam-") || lower.contains("_cam_")
        || lower.starts_with("cam.") || lower.ends_with(".cam")
}

#[tauri::command]
async fn search_torrents(query: String, media_type: Option<String>, source: Option<String>, tv_id: Option<u64>, tmdb_state: tauri::State<'_, TmdbState>, http_state: tauri::State<'_, HttpState>) -> Result<Value, String> {
    let api_key = tmdb_key!(tmdb_state);
    let episode_pattern = extract_episode_pattern(&query);

    match source.as_deref().unwrap_or("knaben") {
        "apibay" => {
            let mut res = search_apibay(&http_state.client, &query).await?;
            if let Some(ref pat) = episode_pattern {
                if let Some(hits) = res.get_mut("hits").and_then(|h| h.as_array_mut()) {
                    filter_by_episode_pattern(hits, pat);
                }
            }
            Ok(res)
        }
        "yts" => search_yts(&http_state.client, &query).await,
        "eztv" => {
            let mut res = if let Some(tv) = tv_id {
                search_eztv_by_id(&http_state.client, tv, &api_key).await?
            } else {
                search_eztv(&http_state.client, &query, &api_key).await?
            };
            if let Some(ref pat) = episode_pattern {
                if let Some(hits) = res.get_mut("hits").and_then(|h| h.as_array_mut()) {
                    filter_by_episode_pattern(hits, pat);
                }
            }
            Ok(res)
        }
        _ => {
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
                        if let Some(ref pat) = episode_pattern {
                            filter_by_episode_pattern(hits, pat);
                        }
                        if !hits.is_empty() {
                            return Ok(json);
                        }
                    }
                    let mut apibay_res = search_apibay(&http_state.client, &query).await?;
                    if let Some(ref pat) = episode_pattern {
                        if let Some(hits) = apibay_res.get_mut("hits").and_then(|h| h.as_array_mut()) {
                            filter_by_episode_pattern(hits, pat);
                        }
                    }
                    Ok(apibay_res)
                }
                Err(_) => {
                    let mut apibay_res = search_apibay(&http_state.client, &query).await?;
                    if let Some(ref pat) = episode_pattern {
                        if let Some(hits) = apibay_res.get_mut("hits").and_then(|h| h.as_array_mut()) {
                            filter_by_episode_pattern(hits, pat);
                        }
                    }
                    Ok(apibay_res)
                }
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

async fn get_imdb_id_from_tv_id(client: &Client, tv_id: u64, api_key: &str) -> Result<String, String> {
    let url = format!(
        "https://api.themoviedb.org/3/tv/{}?api_key={}&append_to_response=external_ids",
        tv_id, api_key
    );
    let res = client.get(&url).send().await.map_err(|e| format!("tmdb error: {}", e))?;
    let details: Value = res.json().await.map_err(|e| format!("tmdb parse: {}", e))?;
    let imdb_id = details["external_ids"]["imdb_id"]
        .as_str()
        .unwrap_or("")
        .trim_start_matches("tt")
        .to_string();
    if imdb_id.is_empty() {
        Err("No IMDB ID found for this TV series".to_string())
    } else {
        Ok(imdb_id)
    }
}

async fn call_eztv_api(client: &Client, imdb_id: &str, page: u32) -> Result<Value, String> {
    let eztv_url = reqwest::Url::parse_with_params(
        "https://eztvx.to/api/get-torrents",
        &[("imdb_id", imdb_id), ("limit", "100"), ("page", &page.to_string())],
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

    let hits: Vec<Value> = torrents
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

    Ok(serde_json::Value::Array(hits))
}

async fn search_eztv_by_id(client: &Client, tv_id: u64, api_key: &str) -> Result<Value, String> {
    let imdb_id = get_imdb_id_from_tv_id(client, tv_id, api_key).await?;

    // Collect hits across all pages (API returns <100 items on the last page)
    let mut all_hits: Vec<Value> = Vec::new();
    let mut page = 1u32;
    loop {
        let raw = call_eztv_api(client, &imdb_id, page).await?;
        if let Some(arr) = raw.as_array() {
            all_hits.extend(arr.iter().cloned());
            if arr.len() < 100 {
                break; // last page
            }
        } else {
            break;
        }
        page += 1;
    }

    all_hits.retain(|item| {
        item["title"].as_str().map(|t| !is_cam_or_telesync(t)).unwrap_or(true)
    });

    let count = all_hits.len();

    Ok(json!({
        "total": { "value": count, "relation": "eq" },
        "max_score": null,
        "hits": all_hits
    }))
}

async fn search_eztv(client: &Client, query: &str, api_key: &str) -> Result<Value, String> {
    // 1. Search TMDB for TV show matching the query
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

    search_eztv_by_id(client, tv_id, api_key).await
}


pub mod crash_reporter;
pub mod torrent;
pub mod vlc;

// ─── App Entry Point ─────────────────────────────────────────────────────────

#[tauri::command]
fn open_in_file_manager(path: String) -> Result<(), String> {
    let p = std::path::Path::new(&path);
    if !p.exists() {
        return Err(format!("Path does not exist: {}", path));
    }
    if !p.is_dir() {
        return Err(format!("Path is not a directory: {}", path));
    }

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

#[tauri::command]
async fn delete_library_file(app: tauri::AppHandle) -> Result<(), String> {
    let path = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?
        .join("library.json");

    if path.exists() {
        std::fs::remove_file(&path)
            .map_err(|e| format!("Failed to delete library file: {}", e))?;
    }

    let bak = path.with_extension("json.bak");
    if bak.exists() {
        let _ = std::fs::remove_file(&bak);
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
        .plugin(tauri_plugin_process::init())
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
            open_in_file_manager,
            delete_library_file,
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
            torrent::get_api_port,
        ])
        .setup(|app| {
            #[cfg(desktop)]
            app.handle().plugin(tauri_plugin_updater::Builder::new().build())?;

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

            // Initialize crash reporter (file logging, panic hook, crash marker)
            if let Ok(app_data) = app.path().app_data_dir() {
                crash_reporter::setup(app_data.clone());
            } else {
                log::warn!("Could not determine app data dir — crash reporter disabled");
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

                    // Generate random credentials for internal API calls
                    let username = "buccaneer";
                    let password = format!("{}-{}",
                        std::time::SystemTime::now()
                            .duration_since(std::time::UNIX_EPOCH)
                            .unwrap_or_default()
                            .as_nanos(),
                        std::process::id()
                    );
                    let api_userpass = format!("{}:{}", username, password);
                    let api_credentials = format!("Basic {}", base64::engine::general_purpose::STANDARD.encode(&api_userpass));

                    // Create API and HTTP API with basic auth enforced server-side
                    let http_api_opts = librqbit::http_api::HttpApiOptions {
                        read_only: false,
                        basic_auth: Some((username.to_string(), password)),
                    };
                    let api = librqbit::api::Api::new(session_arc.clone(), None, None);
                    let http_api = librqbit::http_api::HttpApi::new(api, Some(http_api_opts));

                    // Try to bind to a port starting from 3030, with fallback up to 3049
                    let mut port = 3030u16;
                    let api_port = loop {
                        match tokio::net::TcpListener::bind(format!("127.0.0.1:{}", port)).await {
                            Ok(listener) => {
                                tokio::spawn(async move {
                                    if let Err(e) = http_api.make_http_api_and_run(listener, None).await {
                                        log::error!("HTTP API error: {}", e);
                                    }
                                });
                                break port;
                            }
                            Err(_) if port < 3049 => {
                                log::warn!("Port {} is in use, trying next...", port);
                                port += 1;
                            }
                            Err(e) => {
                                log::error!("Failed to bind to any port from 3030 to 3049: {}", e);
                                drop(http_api);
                                drop(session_arc);
                                let _ = handle.dialog()
                                    .message("Could not start the torrent engine because ports 3030–3049 are all in use.\nPlease close other applications using these ports and restart.")
                                    .title("Torrent Engine Error")
                                    .show(|_| {});
                                return;
                            }
                        }
                    };

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
                        api_port,
                        api_userpass: api_userpass.clone(),
                        torrent_times: std::sync::Arc::new(std::sync::Mutex::new(
                            std::collections::HashMap::new(),
                        )),
                    });

                    // Clean up restored torrents whose output directory no longer exists
                    let cleanup_client = Client::new();
                    let cleanup_credentials = api_credentials.clone();
                    let cleanup_port = api_port;
                    tauri::async_runtime::spawn(async move {
                        tokio::time::sleep(std::time::Duration::from_secs(1)).await;

                        if let Ok(resp) = cleanup_client
                            .get(format!("http://127.0.0.1:{}/torrents", cleanup_port))
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
                let state = app.try_state::<torrent::TorrentState>();
                let Some(state) = state else {
                    log::info!("TorrentState not initialized, exiting directly.");
                    return;
                };

                // Clean shutdown — remove the crash marker
                crash_reporter::clear_marker();

                let stream_ids = if let Ok(streams) = state.streamed_torrents.lock() {
                    streams.iter().copied().collect::<Vec<_>>()
                } else {
                    vec![]
                };
                let clear_files = state.clear_streaming_on_exit.load(std::sync::atomic::Ordering::Relaxed);
                let base_path = state.base_path.lock().map(|b| b.clone()).unwrap_or_default();

                log::info!("Starting exit cleanup. Stream IDs: {:?}, Clear files: {}", stream_ids, clear_files);

                if stream_ids.is_empty() {
                    if clear_files {
                        let streaming_dir = std::path::Path::new(&base_path).join("Streaming");
                        log::info!("Deleting streaming directory: {:?}", streaming_dir);
                        let _ = std::fs::remove_dir_all(&streaming_dir);
                    }
                    log::info!("Cleanup finished.");
                    // No streams to clean up — allow exit to proceed normally
                    return;
                }

                api.prevent_exit();
                let session = state.session.clone();
                let handle = (*app).clone();
                tauri::async_runtime::spawn(async move {
                    for id in stream_ids {
                        let _ = session
                            .delete(librqbit::api::TorrentIdOrHash::Id(id), clear_files)
                            .await;
                    }
                    log::info!("Streaming torrent cleanup done.");
                    let _ = handle.exit(0);
                });
            }
        });
}
