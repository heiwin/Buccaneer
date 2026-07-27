import { invoke } from '@tauri-apps/api/core';

export interface TorrentInfo {
  id: string;
  name: string;
  progress: number;
  totalBytes: number;
  downloadedBytes: number;
  downloadSpeed: number;
  uploadSpeed: number;
  seeds: number;
  peers: number;
  state: 'downloading' | 'seeding' | 'paused' | 'error' | 'checking';
  error?: string;
  savePath: string;
  isStream: boolean;
  addedAt: number;
  completedAt: number | null;
}

export interface FileNode {
  index: number;
  name: string;
  size: number;
}

export async function addTorrent(magnetOrUrl: string, stream: boolean, onlyFiles?: number[]): Promise<string> {
  return await invoke('add_torrent', { magnetOrUrl, stream, onlyFiles: onlyFiles || null });
}

export async function pauseTorrent(id: string): Promise<void> {
  return await invoke('pause_torrent', { id });
}

export async function resumeTorrent(id: string): Promise<void> {
  return await invoke('resume_torrent', { id });
}

export interface ActiveTorrentItem {
  id?: number | string;
  name?: string;
  info_hash?: string;
  output_folder?: string;
  is_stream?: boolean;
  added_at?: number;
  completed_at?: number;
  stats?: {
    live?: {
      snapshot?: {
        peer_stats?: { live?: number; connecting?: number; queued?: number; seen?: number; dead?: number };
      };
      download_speed?: { mbps?: number };
      upload_speed?: { mbps?: number };
    };
    total_bytes?: number;
    progress_bytes?: number;
    state?: string;
    finished?: boolean;
    error?: string;
  };
}

export async function removeTorrent(id: string, deleteFiles: boolean): Promise<void> {
  return await invoke('remove_torrent', { id, deleteFiles });
}

export async function getActiveTorrents(): Promise<TorrentInfo[]> {
  const json = await invoke<{ torrents?: ActiveTorrentItem[] }>('get_active_torrents');
  if (!json || !json.torrents) return [];
  
  return json.torrents.map((t) => {
    const stats = t.stats || {};
    const live = stats.live || {};
    const snapshot = live.snapshot || {};
    const peerStats = snapshot.peer_stats || {};
    
    // progress computation
    const total = stats.total_bytes || 1;
    const progress = stats.progress_bytes ? (stats.progress_bytes / total) : 0;
    
    const VALID_STATES = new Set(['downloading', 'seeding', 'paused', 'error', 'checking']);
    let stateStr = (stats.state || 'error').toLowerCase();
    if (stateStr === 'live') {
      stateStr = stats.finished ? 'seeding' : 'downloading';
    } else if (stateStr === 'initializing') {
      stateStr = 'checking';
    } else if (!VALID_STATES.has(stateStr)) {
      stateStr = 'error';
    }
    
    return {
      id: t.id?.toString() || '',
      name: t.name || t.info_hash || 'Unknown',
      progress: progress,
      totalBytes: stats.total_bytes || 0,
      downloadedBytes: stats.progress_bytes || 0,
      downloadSpeed: live.download_speed?.mbps ? live.download_speed.mbps * 1024 * 1024 : 0,
      uploadSpeed: live.upload_speed?.mbps ? live.upload_speed.mbps * 1024 * 1024 : 0,
      seeds: peerStats.live || 0,
      peers: Math.max(0, (peerStats.seen || 0) - (peerStats.live || 0)),
      state: stateStr as TorrentInfo['state'],
      error: stats.error,
      savePath: t.output_folder || 'Unknown',
      isStream: t.is_stream || false,
      addedAt: t.added_at ?? Date.now(),
      completedAt: t.completed_at ?? null,
    };
  });
}

export async function openInFileManager(path: string): Promise<void> {
  return await invoke('open_in_file_manager', { path });
}

export async function autoDetectVlc(): Promise<string | null> {
  return await invoke('auto_detect_vlc');
}

export async function streamWithVlc(id: string, fileIndex: number, vlcPath: string | null, title?: string): Promise<void> {
  return await invoke('stream_with_vlc', { torrentId: id, fileIndex, vlcPath, title: title || null });
}

export interface TorrentDetailsResponse {
  name?: string;
  files?: { name: string; length: number }[];
  [key: string]: unknown;
}

export async function getTorrentDetails(id: string): Promise<TorrentDetailsResponse> {
  return await invoke('get_torrent_details', { id });
}

export const VIDEO_EXTENSIONS = new Set([
  '.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm',
  '.m4v', '.mpg', '.mpeg', '.ts', '.m2ts', '.3gp', '.ogm', '.ogv',
]);

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function findBestVideoFileIndex(
  files: { name: string; length: number }[],
  torrentTitle: string,
): number {
  const videoFiles = files
    .map((f, i) => ({ ...f, index: i }))
    .filter((f) => {
      const match = f.name.toLowerCase().match(/\.[a-z0-9]+$/);
      return match && VIDEO_EXTENSIONS.has(match[0]);
    });

  if (videoFiles.length === 0) return 0;
  if (videoFiles.length === 1) return videoFiles[0].index;

  const cleanTitle = normalizeName(torrentTitle);
  const titleWords = cleanTitle.split(' ').filter((w) => w.length > 2);

  let bestFile = videoFiles[0];
  let bestScore = -1;

  for (const file of videoFiles) {
    let score = 0;
    const cleanName = normalizeName(file.name.replace(/\.[^.]+$/, ''));

    if (titleWords.length > 0) {
      const matchCount = titleWords.filter((w) => cleanName.includes(w)).length;
      score += (matchCount / titleWords.length) * 100;
    }

    if (!cleanName.includes('sample')) score += 50;

    const maxSize = Math.max(...videoFiles.map((f) => f.length));
    if (maxSize > 0) score += (file.length / maxSize) * 30;

    if (score > bestScore) {
      bestScore = score;
      bestFile = file;
    }
  }

  return bestFile.index;
}

export async function getTorrentMetadata(magnetOrUrl: string): Promise<FileNode[]> {
  return await invoke('get_torrent_metadata', { magnetOrUrl });
}


