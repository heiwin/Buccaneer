import { invoke } from '@tauri-apps/api/core';
import type { KnabenResponse } from '../types/knaben';

// ─── Knaben Torrent Search ────────────────────────────────────────────────────
// All network traffic routes through the Tauri Rust backend.
// Tracker filtering (1337x / The Pirate Bay / YTS / Nyaa.si) is applied
// server-side in lib.rs before the result is returned here.

export async function searchTorrents(
  query: string,
  mediaType?: 'movie' | 'tv' | null,
  source?: string,
): Promise<KnabenResponse> {
  return await invoke('search_torrents', {
    query,
    mediaType: mediaType ?? null,
    source: source ?? 'knaben',
  });
}

// ─── Utility ──────────────────────────────────────────────────────────────────

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}
