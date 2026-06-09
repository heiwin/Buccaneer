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
            "/usr/bin/vlc",
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
    stream_url: String,
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
            // Require the binary filename to be exactly "VLC"
            let file_name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
            if file_name != "VLC" {
                return Err(format!("'{}' does not appear to be a valid VLC path", executable));
            }
        }
        #[cfg(target_os = "windows")]
        if !executable.to_lowercase().contains("vlc") {
            return Err(format!("'{}' does not appear to be a valid VLC path", executable));
        }
        #[cfg(target_os = "linux")]
        {
            // Verify the binary is actually VLC by checking --version output
            let output = std::process::Command::new(&executable)
                .arg("--version")
                .output()
                .map_err(|_| format!("Failed to execute '{}'", executable))?;
            if !String::from_utf8_lossy(&output.stdout).contains("VLC") {
                return Err(format!("'{}' does not appear to be a valid VLC executable", executable));
            }
        }
    }

    // Validate stream_url — must be a local librqbit HTTP stream URL
    let parsed_url = reqwest::Url::parse(&stream_url)
        .map_err(|_| "Invalid stream URL: must be a valid HTTP URL".to_string())?;

    let allowed_host = parsed_url.host_str().unwrap_or("");
    if allowed_host != "127.0.0.1" && allowed_host != "localhost" {
        return Err("Stream URL must point to localhost (127.0.0.1)".to_string());
    }
    if parsed_url.scheme() != "http" {
        return Err("Stream URL must use HTTP scheme".to_string());
    }

    // Sanitize title: reject values starting with '--' to prevent argument injection
    if let Some(t) = &title {
        if t.starts_with("--") || (t.starts_with('-') && t.len() > 1) {
            return Err("Invalid title: cannot start with argument prefix".to_string());
        }
    }

    // Embed credentials in the stream URL so VLC can authenticate with the local API
    let authenticated_url = stream_url.replacen("http://", &format!("http://{}@", state.api_credentials_url), 1);

    let mut cmd = std::process::Command::new(&executable);
    cmd.arg("--network-caching=10000");
    if let Some(t) = &title {
        cmd.arg("--meta-title");
        cmd.arg(t);
    }
    // Use "--" to separate options from positional arguments
    cmd.arg("--");
    cmd.arg(&authenticated_url);

    cmd.spawn()
        .map_err(|e| format!("Failed to launch VLC at '{}': {}", executable, e))?;

    Ok(())
}
