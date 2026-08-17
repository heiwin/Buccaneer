use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Serialize, Deserialize, Clone)]
pub struct CompletedEntry {
    pub info_hash: String,
    pub name: String,
    pub total_bytes: u64,
    pub output_folder: String,
    pub files: Vec<String>,
    pub finished_at: i64,
}

/// Persistent store describing downloads that finished and were then removed
/// from the librqbit session (to free file descriptors). Used to keep them
/// visible in the Downloads section while no longer consuming resources.
pub struct CompletedStore {
    pub entries: Vec<CompletedEntry>,
    path: PathBuf,
}

impl CompletedStore {
    pub fn new(path: PathBuf) -> Self {
        let entries = match fs::read_to_string(&path) {
            Ok(s) => match serde_json::from_str::<Vec<CompletedEntry>>(&s) {
                Ok(entries) => entries,
                Err(e) => {
                    // The store file failed to parse. Move it aside so the next
                    // save() cannot silently destroy the user's download
                    // history, then start fresh with a recoverable backup.
                    let ts = std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .map(|d| d.as_secs())
                        .unwrap_or_default();
                    let name = path
                        .file_name()
                        .and_then(|n| n.to_str())
                        .unwrap_or("completed_downloads");
                    let mut backup = path.clone();
                    backup.set_file_name(format!("{}.corrupt.{}", name, ts));
                    if fs::rename(&path, &backup).is_err() {
                        let _ = fs::copy(&path, &backup);
                    }
                    log::error!("Completed store corrupted ({}): {}", e, backup.display());
                    Vec::new()
                }
            },
            Err(_) => Vec::new(),
        };
        CompletedStore { entries, path }
    }

    pub fn entries(&self) -> &[CompletedEntry] {
        &self.entries
    }

    pub fn contains(&self, info_hash: &str) -> bool {
        let hash = info_hash.to_lowercase();
        self.entries.iter().any(|e| e.info_hash.to_lowercase() == hash)
    }

    pub fn add(&mut self, entry: CompletedEntry) -> Result<(), String> {
        if let Some(existing) = self
            .entries
            .iter_mut()
            .find(|e| e.info_hash.to_lowercase() == entry.info_hash.to_lowercase())
        {
            *existing = entry;
        } else {
            self.entries.push(entry);
        }
        self.save()
    }

    pub fn remove(&mut self, info_hash: &str) -> Result<Option<CompletedEntry>, String> {
        let hash = info_hash.to_lowercase();
        if let Some(idx) = self
            .entries
            .iter()
            .position(|e| e.info_hash.to_lowercase() == hash)
        {
            let entry = self.entries.remove(idx);
            self.save()?;
            return Ok(Some(entry));
        }
        Ok(None)
    }

    /// Backfill the file list of an existing entry (e.g. discovered from disk
    /// after the original snapshot came back empty). No-op if unknown hash.
    pub fn set_files(&mut self, info_hash: &str, files: Vec<String>) -> Result<(), String> {
        if let Some(entry) = self
            .entries
            .iter_mut()
            .find(|e| e.info_hash.to_lowercase() == info_hash.to_lowercase())
        {
            entry.files = files;
            self.save()
        } else {
            Ok(())
        }
    }

    fn save(&self) -> Result<(), String> {
        let bytes = serde_json::to_vec_pretty(&self.entries).map_err(|e| e.to_string())?;
        let tmp = self.path.with_extension("tmp");
        if let Err(e) = fs::write(&tmp, &bytes) {
            let _ = fs::remove_file(&tmp);
            return Err(e.to_string());
        }
        crate::rename_overwrite(&tmp, &self.path).map_err(|e| {
            let _ = fs::remove_file(&tmp);
            e.to_string()
        })
    }
}