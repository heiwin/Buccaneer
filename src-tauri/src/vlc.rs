#[tauri::command]
pub async fn auto_detect_vlc() -> Result<Option<String>, String> {
    #[cfg(target_os = "windows")]
    {
        let paths = vec![
            "C:\\Program Files\\VideoLAN\\VLC\\vlc.exe",
            "C:\\Program Files (x86)\\VideoLAN\\VLC\\vlc.exe",
        ];
        for p in paths {
            if std::path::Path::new(p).exists() {
                return Ok(Some(p.to_string()));
            }
        }

        // Try `where vlc` (Windows equivalent of `which`)
        if let Ok(output) = std::process::Command::new("where").arg("vlc").output() {
            if output.status.success() {
                let path = String::from_utf8_lossy(&output.stdout)
                    .lines()
                    .next()
                    .unwrap_or("")
                    .trim()
                    .to_string();
                if !path.is_empty() {
                    return Ok(Some(path));
                }
            }
        }

        // Try Windows registry
        if let Ok(output) = std::process::Command::new("reg")
            .args(&[
                "query",
                "HKEY_LOCAL_MACHINE\\SOFTWARE\\VideoLAN\\VLC",
                "/v",
                "InstallDir",
            ])
            .output()
        {
            if output.status.success() {
                let stdout = String::from_utf8_lossy(&output.stdout);
                for line in stdout.lines() {
                    let trimmed = line.trim();
                    if let Some(pos) = trimmed.find("REG_SZ") {
                        let dir = trimmed[pos + 6..].trim();
                        let exe = std::path::Path::new(dir).join("vlc.exe");
                        if exe.exists() {
                            return Ok(Some(exe.to_string_lossy().to_string()));
                        }
                    }
                }
            }
        }
    }

    #[cfg(target_os = "macos")]
    {
        let path = "/Applications/VLC.app/Contents/MacOS/VLC";
        if std::path::Path::new(path).exists() {
            return Ok(Some(path.to_string()));
        }
    }

    #[cfg(target_os = "linux")]
    {
        // Check well-known VLC installation paths first
        let known_paths = vec![
            "/usr/bin/vlc",
            "/snap/bin/vlc",
            "/usr/local/bin/vlc",
        ];
        for p in known_paths {
            if std::path::Path::new(p).exists() {
                return Ok(Some(p.to_string()));
            }
        }
        // Fallback to `which vlc`
        if let Ok(output) = std::process::Command::new("which").arg("vlc").output() {
            if output.status.success() {
                let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if !path.is_empty() {
                    return Ok(Some(path));
                }
            }
        }
    }

    Ok(None)
}

#[tauri::command]
pub async fn stream_with_vlc(
    torrent_id: String,
    file_index: u32,
    vlc_path: Option<String>,
    title: Option<String>,
    state: tauri::State<'_, crate::torrent::TorrentState>,
) -> Result<(), String> {
    let executable = vlc_path.unwrap_or_else(|| "vlc".to_string());

    // Validate that the VLC path exists and looks like a VLC executable
    if executable != "vlc" {
        let path = std::path::Path::new(&executable);
        if !path.exists() {
            return Err(format!("VLC not found at '{}'", executable));
        }
        #[cfg(target_os = "macos")]
        {
            let file_name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
            if file_name != "VLC" && file_name.to_lowercase() != "vlc" {
                return Err(format!("'{}' does not appear to be a valid VLC path", executable));
            }
        }
        #[cfg(target_os = "windows")]
        if !executable.to_lowercase().contains("vlc") {
            return Err(format!("'{}' does not appear to be a valid VLC path", executable));
        }
        #[cfg(target_os = "linux")]
        {
            let output = std::process::Command::new(&executable)
                .arg("--version")
                .output()
                .map_err(|_| format!("Failed to execute '{}'", executable))?;
            if !String::from_utf8_lossy(&output.stdout).contains("VLC") {
                return Err(format!("'{}' does not appear to be a valid VLC executable", executable));
            }
        }
    }

    // Construct stream URL using stored credentials (never exposed on CLI)
    let stream_url = format!(
        "http://{}/torrents/{}/stream/{}",
        state.api_userpass, torrent_id, file_index
    );

    // Write URL to a temporary M3U file to avoid exposing credentials in process listing
    let mut tmp = std::env::temp_dir();
    tmp.push(format!("buccaneer_{}.m3u", torrent_id));
    let tmp_path = tmp.to_string_lossy().to_string();
    let m3u_content = format!("#EXTM3U\n{}\n", stream_url);
    std::fs::write(&tmp_path, &m3u_content)
        .map_err(|e| format!("Failed to create temp playlist: {}", e))?;

    let mut cmd = std::process::Command::new(&executable);
    cmd.arg("--network-caching=10000");
    if let Some(t) = &title {
        let sanitized: String = t.chars()
            .filter(|c| c.is_alphanumeric() || c.is_ascii_punctuation() || c.is_whitespace())
            .collect();
        cmd.arg(format!("--meta-title={}", sanitized));
    }
    cmd.arg("--");
    cmd.arg(&tmp_path);

    cmd.spawn()
        .map_err(|e| format!("Failed to launch VLC at '{}': {}", executable, e))?;

    // Clean up temp file — VLC has already read it by now
    let _ = std::fs::remove_file(&tmp_path);

    Ok(())
}
