import { invoke } from '@tauri-apps/api/core';

export interface TorrentInfo {
  id: string;
  name: string;
  progress: number;
  downloadSpeed: number;
  uploadSpeed: number;
  seeds: number;
  peers: number;
  state: 'downloading' | 'seeding' | 'paused' | 'error' | 'checking';
  error?: string;
  savePath: string;
  isStream: boolean;
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
  stats?: {
    live?: {
      snapshot?: {
        peer_stats?: { live?: number };
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
    
    let stateStr = (stats.state || 'error').toLowerCase();
    if (stateStr === 'live') {
      stateStr = stats.finished ? 'seeding' : 'downloading';
    } else if (stateStr === 'initializing') {
      stateStr = 'checking';
    }
    
    return {
      id: t.id?.toString() || '',
      name: t.name || t.info_hash || 'Unknown',
      progress: progress,
      downloadSpeed: live.download_speed?.mbps ? live.download_speed.mbps * 1024 * 1024 / 8 : 0, 
      uploadSpeed: live.upload_speed?.mbps ? live.upload_speed.mbps * 1024 * 1024 / 8 : 0,
      seeds: peerStats.live || 0,
      peers: peerStats.live || 0,
      state: stateStr as TorrentInfo['state'],
      error: stats.error,
      savePath: t.output_folder || 'Unknown',
      isStream: t.is_stream || false,
    };
  });
}

export async function autoDetectVlc(): Promise<string | null> {
  return await invoke('auto_detect_vlc');
}

export async function streamWithVlc(streamUrl: string, vlcPath: string | null, title?: string): Promise<void> {
  return await invoke('stream_with_vlc', { streamUrl, vlcPath, title: title || null });
}

export interface TorrentDetailsResponse {
  files?: { name: string; length: number }[];
  [key: string]: unknown;
}

export async function getTorrentDetails(id: string): Promise<TorrentDetailsResponse> {
  return await invoke('get_torrent_details', { id });
}

export async function getTorrentMetadata(magnetOrUrl: string): Promise<FileNode[]> {
  return await invoke('get_torrent_metadata', { magnetOrUrl });
}
