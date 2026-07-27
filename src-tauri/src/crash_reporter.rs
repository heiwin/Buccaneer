use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

const LOG_DIR_NAME: &str = "logs";
const CRASH_MARKER: &str = ".crash_marker";
const RUNTIME_LOG: &str = "buccaneer.log";

static LOG_DIR: std::sync::OnceLock<PathBuf> = std::sync::OnceLock::new();

struct FileLogger {
    file: Mutex<std::fs::File>,
}

impl log::Log for FileLogger {
    fn enabled(&self, metadata: &log::Metadata) -> bool {
        if metadata.level() > log::Level::Warn {
            return false;
        }
        if metadata.target().starts_with("librqbit")
            || metadata.target().starts_with("tracing::span")
        {
            return false;
        }
        true
    }

    fn log(&self, record: &log::Record) {
        if !self.enabled(record.metadata()) {
            return;
        }
        if let Ok(mut file) = self.file.lock() {
            let ts = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|d| d.as_secs())
                .unwrap_or(0);
            let _ = writeln!(
                file,
                "[{}] [{}] [{}] {}",
                ts,
                record.level(),
                record.target(),
                record.args()
            );
        }
    }

    fn flush(&self) {
        if let Ok(mut file) = self.file.lock() {
            let _ = file.flush();
        }
    }
}

fn log_dir(app_data_dir: &PathBuf) -> PathBuf {
    app_data_dir.join(LOG_DIR_NAME)
}

fn marker_path(log_dir: &PathBuf) -> PathBuf {
    log_dir.join(CRASH_MARKER)
}

fn write_crash_report(log_dir: &PathBuf, panic_info: &std::panic::PanicHookInfo) {
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let crash_file = log_dir.join(format!("crash_{}.txt", ts));

    let mut file = match OpenOptions::new()
        .create(true)
        .write(true)
        .truncate(true)
        .open(&crash_file)
    {
        Ok(f) => f,
        Err(_) => return,
    };

    let _ = writeln!(file, "Buccaneer Crash Report");
    let _ = writeln!(file, "======================");
    let _ = writeln!(
        file,
        "Timestamp: {}",
        chrono::DateTime::from_timestamp(ts as i64, 0)
            .map(|dt| dt.format("%Y-%m-%d %H:%M:%S UTC").to_string())
            .unwrap_or_else(|| ts.to_string())
    );
    let _ = writeln!(file, "Payload: {}", panic_info);
    if let Some(location) = panic_info.location() {
        let _ = writeln!(file, "File: {}", location.file());
        let _ = writeln!(file, "Line: {}", location.line());
        let _ = writeln!(file, "Column: {}", location.column());
    }
    let _ = writeln!(file, "Version: {}", env!("CARGO_PKG_VERSION"));
    let _ = writeln!(
        file,
        "System: {} / {}",
        std::env::consts::OS,
        std::env::consts::ARCH
    );
    let bt = std::backtrace::Backtrace::force_capture();
    let bt_str = bt.to_string();
    let bt_lines = bt_str.lines().take(30).collect::<Vec<_>>();
    if !bt_lines.is_empty() {
        let _ = writeln!(file, "Backtrace:\n{}", bt_lines.join("\n"));
    }
}

/// Initialize crash reporting. Creates the log directory, registers a
/// file logger (if no logger is active yet), installs a panic hook,
/// and creates a crash marker to detect unclean shutdowns.
///
/// On the next boot, if the crash marker file exists, a crash report
/// is written to `previous_crash.txt`.
pub fn setup(app_data_dir: PathBuf) {
    let dir = log_dir(&app_data_dir);
    let _ = fs::create_dir_all(&dir);

    // Check for crash marker from previous session
    let marker = marker_path(&dir);
    if marker.exists() {
        let prev_crash_log = dir.join("previous_crash.txt");
        let _ = fs::write(
            &prev_crash_log,
            format!(
                "Previous session crashed at {}",
                chrono::DateTime::from_timestamp(
                    SystemTime::now()
                        .duration_since(UNIX_EPOCH)
                        .map(|d| d.as_secs() as i64)
                        .unwrap_or(0),
                    0,
                )
                .map(|dt| dt.format("%Y-%m-%d %H:%M:%S UTC").to_string())
                .unwrap_or_else(|| "unknown time".to_string())
            ),
        );
    }

    // Register file logger (only succeeds in release mode where no logger is set)
    let log_path = dir.join(RUNTIME_LOG);
    if let Ok(file) = OpenOptions::new()
        .create(true)
        .write(true)
        .truncate(true)
        .open(&log_path)
    {
        let logger = FileLogger {
            file: Mutex::new(file),
        };
        let _ = log::set_boxed_logger(Box::new(logger));
        log::set_max_level(log::LevelFilter::Info);
    }

    // Panic hook
    let dir_for_panic = dir.clone();
    let prev_hook = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        write_crash_report(&dir_for_panic, info);
        prev_hook(info);
    }));

    // Create crash marker
    let _ = fs::write(&marker, "");

    // Store dir for later marker removal
    let _ = LOG_DIR.set(dir);
}

/// Remove the crash marker — call on clean shutdown.
pub fn clear_marker() {
    if let Some(dir) = LOG_DIR.get() {
        let _ = fs::remove_file(marker_path(dir));
    }
}

/// Path to the log directory, if initialized.
pub fn log_dir_path() -> Option<&'static PathBuf> {
    LOG_DIR.get()
}
