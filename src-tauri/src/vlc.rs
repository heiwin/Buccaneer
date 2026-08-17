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

fn is_video_file(path: &std::path::Path) -> bool {
    const VIDEO_EXTENSIONS: &[&str] = &[
        "mp4", "mkv", "avi", "mov", "wmv", "flv", "webm", "m4v", "mpg", "mpeg", "ts", "m2ts",
        "3gp", "ogm", "ogv",
    ];
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    VIDEO_EXTENSIONS.contains(&ext.as_str())
}

#[tauri::command]
pub async fn open_in_vlc(
    file_path: String,
    vlc_path: Option<String>,
) -> Result<(), String> {
    let requested = vlc_path.unwrap_or_else(|| "vlc".to_string());
    let executable = resolve_vlc_executable(&requested);

    if executable != "vlc" {
        let path = std::path::Path::new(&executable);
        if !path.exists() {
            return Err(format!("VLC not found at '{}'", executable));
        }
        if !path.is_file() {
            return Err(format!(
                "VLC path '{}' is not a file (select the binary, e.g. .../VLC.app/Contents/MacOS/VLC)",
                executable
            ));
        }
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mode = std::fs::metadata(path)
                .map(|m| m.permissions().mode())
                .unwrap_or(0);
            if mode & 0o111 == 0 {
                return Err(format!("VLC at '{}' is not executable", executable));
            }
        }
    }

    let full_path = std::path::Path::new(&file_path);
    if !full_path.exists() {
        return Err(format!("File not found at '{}'", file_path));
    }
    if !full_path.is_file() {
        return Err(format!("'{}' is not a file", file_path));
    }
    if full_path.components().any(|c| matches!(c, std::path::Component::ParentDir)) {
        return Err("Invalid path: '..' segments are not allowed".to_string());
    }
    if !is_video_file(full_path) {
        return Err(format!("'{}' is not a supported video file", file_path));
    }

    let mut cmd = std::process::Command::new(&executable);
    cmd.arg("--");
    cmd.arg(&file_path);

    cmd.spawn()
        .map_err(|e| format!("Failed to launch VLC at '{}': {}", executable, e))?;

    Ok(())
}

/// Normalize a user-supplied VLC location into a directly executable binary.
/// macOS: a selected `.app` bundle is a directory, so resolve its inner
/// `/Contents/MacOS/{name}` executable when present.
fn resolve_vlc_executable(path: &str) -> String {
    if path.is_empty() || path == "vlc" {
        return "vlc".to_string();
    }
    let p = std::path::Path::new(path);
    if !p.is_dir() {
        return path.to_string();
    }
    #[cfg(target_os = "macos")]
    {
        let name = p.file_stem().and_then(|s| s.to_str()).unwrap_or("VLC");
        let inner = p.join("Contents").join("MacOS").join(name);
        if inner.is_file() {
            return inner.to_string_lossy().to_string();
        }
    }
    path.to_string()
}
