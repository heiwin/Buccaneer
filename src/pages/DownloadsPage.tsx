import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

import { HardDrive, Pause, Play, Trash2, X, FolderOpen } from 'lucide-react';
import { getActiveTorrents, pauseTorrent, resumeTorrent, removeTorrent, getTorrentDetails, streamWithVlc, findBestVideoFileIndex, autoDetectVlc, openInFileManager, getApiPort, type TorrentInfo } from '../api/torrent';
import { formatBytes } from '../api/knaben';
import { loadSettings } from '../api/settings';
import { Button, Badge, ConfirmDialog, PageHeader, ErrorBanner } from '../components/ui';
import { EmptyState } from '../components';
import { sendNotification } from '@tauri-apps/plugin-notification';



function formatEta(seconds: number): string {
  if (seconds <= 0 || !isFinite(seconds)) return '—';
  if (seconds < 60) return '<1m';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.floor(seconds % 60)}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

interface ConfirmState {
  isOpen: boolean;
  torrentId: string;
  deleteFiles: boolean;
}

export function DownloadsPage() {
  const navigate = useNavigate();

  const [torrents, setTorrents] = useState<TorrentInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState>({
    isOpen: false,
    torrentId: '',
    deleteFiles: false,
  });
  const [vlcDialog, setVlcDialog] = useState<'not-found' | 'launch-error' | null>(null);
  const prevStatesRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    const fetchTorrents = async () => {
      try {
        const data = await getActiveTorrents();
        const prev = prevStatesRef.current;

        for (const t of data) {
          const prevState = prev.get(t.id);
          if (prevState === 'downloading' && t.state === 'seeding') {
            const settings = await loadSettings();
            if (settings.notificationsEnabled) {
              sendNotification({
                title: 'Download Complete',
                body: `${t.name} has finished downloading.`,
              });
            }
          }
        }

        prevStatesRef.current = new Map(data.map((t) => [t.id, t.state]));
        setTorrents(data);
        setError(null);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    };

    fetchTorrents();
    const interval = window.setInterval(fetchTorrents, 2000);

    return () => window.clearInterval(interval);
  }, [navigate]);

  const handlePause = async (id: string) => {
    try {
      await pauseTorrent(id);
    } catch (e: unknown) {
      console.error(e instanceof Error ? e.message : String(e));
    }
  };

  const handleResume = async (id: string) => {
    try {
      await resumeTorrent(id);
    } catch (e: unknown) {
      console.error(e instanceof Error ? e.message : String(e));
    }
  };

  const requestRemove = (id: string, deleteFiles: boolean) => {
    setConfirmState({ isOpen: true, torrentId: id, deleteFiles });
  };

  const executeRemove = async () => {
    try {
      await removeTorrent(confirmState.torrentId, confirmState.deleteFiles);
    } catch (e: unknown) {
      console.error('Failed to remove torrent:', e instanceof Error ? e.message : String(e));
    }
  };

  const handleStreamVlc = async (id: string) => {
    try {
      const active = await getActiveTorrents();
      for (const t of active) {
        if (t.isStream) await pauseTorrent(t.id);
      }
      const settings = await loadSettings();

      const data = await getTorrentDetails(id);
      const fileIdx = data.files && data.files.length > 0
        ? findBestVideoFileIndex(data.files, data.name || '')
        : 0;

      const { port, userpass } = await getApiPort();
      const streamUrl = `http://${userpass}@127.0.0.1:${port}/torrents/${id}/stream/${fileIdx}`;
      await streamWithVlc(streamUrl, settings.vlcPath || null);
    } catch (e: unknown) {
      console.error(e instanceof Error ? e.message : String(e));
      const settings = await loadSettings();
      const detected = await autoDetectVlc();
      if (!detected && !settings.vlcPath) {
        setVlcDialog('not-found');
      } else {
        setVlcDialog('launch-error');
      }
    }
  };



  return (
    <div className="p-8">
      <PageHeader icon={HardDrive} title="Active Downloads" className="mb-10" />

      {error && <ErrorBanner error={error} withIcon className="mb-6" />}

      {!loading && torrents.length === 0 && !error && (
        <EmptyState icon={HardDrive} message="No active downloads" />
      )}

      <div className="space-y-4">
        {torrents.map((t) => (
          <div key={t.id} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-3 mb-1">
                  <h3 className="font-bold text-gray-200 truncate">{t.name || 'Fetching metadata…'}</h3>
                  {t.isStream ? (
                    <Badge variant="blue" size="sm">Stream</Badge>
                  ) : (
                    <Badge variant="emerald" size="sm">Download</Badge>
                  )}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-zinc-500">
                  <span>{t.state}</span>
                  <span>{formatBytes(t.downloadSpeed)}/s DL</span>
                  <span>{formatBytes(t.uploadSpeed)}/s UL</span>
                  <span>{t.peers} peers</span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 mb-4 bg-black/20 p-2 rounded-xl">
              {t.state !== 'paused' && t.state !== 'error' ? (
                <Button variant="secondary" size="sm" icon={Pause} onClick={() => handlePause(t.id)}>
                  Pause
                </Button>
              ) : (
                <Button variant="secondary" size="sm" icon={Play} onClick={() => handleResume(t.id)}>
                  Resume
                </Button>
              )}
              

              
              <Button variant="secondary" size="sm" icon={Play} onClick={() => handleStreamVlc(t.id)}>
                Stream VLC
              </Button>

              <div className="flex-1"></div>

              <Button variant="ghost" size="sm" icon={X} onClick={() => requestRemove(t.id, false)}>
                Cancel
              </Button>
              
              <Button variant="secondary" size="sm" icon={Trash2} onClick={() => requestRemove(t.id, true)}>
                Delete Files
              </Button>
            </div>

            {/* Progress bar */}
            <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
              <div 
                className="h-full bg-primary transition-all duration-500" 
                style={{ width: `${Math.max(0, Math.min(100, t.progress * 100))}%` }} 
              />
            </div>
            <div className="flex items-center justify-between text-[10px] text-zinc-500 mt-2 font-mono">
              <span className="flex items-center gap-2">
                <span>{(t.progress * 100).toFixed(1)}%</span>
                {t.totalBytes > 0 && (
                  <span>{formatBytes(t.downloadedBytes)} / {formatBytes(t.totalBytes)}</span>
                )}
                {t.state === 'downloading' && t.downloadSpeed > 0 && t.totalBytes > 0 && (
                  <span>
                    ETA {formatEta((t.totalBytes - t.downloadedBytes) / t.downloadSpeed)}
                  </span>
                )}
              </span>
              <button
                onClick={() => openInFileManager(t.savePath)}
                className="flex items-center gap-1 hover:text-zinc-300 transition-colors cursor-pointer text-left"
                title="Open in file manager"
              >
                <FolderOpen size={12} />
                {t.savePath}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Confirm Dialog */}
      <ConfirmDialog
        isOpen={confirmState.isOpen}
        onClose={() => setConfirmState(s => ({ ...s, isOpen: false }))}
        onConfirm={executeRemove}
        title={confirmState.deleteFiles ? 'Delete Files' : 'Cancel Download'}
        message={
          confirmState.deleteFiles
            ? 'Are you sure you want to delete the downloaded files? This action cannot be undone.'
            : 'Are you sure you want to cancel this download? The torrent will be removed but files will be kept.'
        }
        confirmLabel={confirmState.deleteFiles ? 'Delete' : 'Cancel Download'}
        kind={confirmState.deleteFiles ? 'danger' : 'warning'}
      />

      <ConfirmDialog
        isOpen={vlcDialog === 'not-found'}
        onClose={() => setVlcDialog(null)}
        onConfirm={() => navigate('/settings')}
        title="VLC Not Found"
        message="VLC not found on your system. Please install VLC or configure the path in Settings."
        confirmLabel="Go to Settings"
        kind="info"
      />

      <ConfirmDialog
        isOpen={vlcDialog === 'launch-error'}
        onClose={() => setVlcDialog(null)}
        onConfirm={() => setVlcDialog(null)}
        title="Launch Error"
        message="Failed to launch VLC"
        confirmLabel="OK"
        kind="info"
        hideCancel
      />
    </div>
  );
}
