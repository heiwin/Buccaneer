import { useState, useEffect } from 'react';

import { HardDrive, Pause, Play, Trash2, X } from 'lucide-react';
import { getActiveTorrents, pauseTorrent, resumeTorrent, removeTorrent, type TorrentInfo } from '../api/torrent';
import { formatBytes } from '../api/knaben';
import { Button, Badge, ConfirmDialog, PageHeader, ErrorBanner } from '../components/ui';
import { EmptyState } from '../components';

interface ConfirmState {
  isOpen: boolean;
  torrentId: string;
  deleteFiles: boolean;
}

export function DownloadsPage() {

  const [torrents, setTorrents] = useState<TorrentInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState>({
    isOpen: false,
    torrentId: '',
    deleteFiles: false,
  });

  useEffect(() => {
    const fetchTorrents = async () => {
      if (document.hidden) return; // Skip when page is not visible
      try {
        const data = await getActiveTorrents();
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
  }, []);

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
      const { loadSettings } = await import('../api/settings');
      const { streamWithVlc, getTorrentDetails } = await import('../api/torrent');
      const settings = await loadSettings();

      // Fetch torrent details to find the largest video file
      const data = await getTorrentDetails(id);
      
      let fileIdx = 0;
      if (data.files && data.files.length > 0) {
        // Find largest video file (mp4, mkv, avi)
        let maxIdx = 0;
        let maxSize = 0;
        data.files.forEach((f, idx: number) => {
          const name = f.name.toLowerCase();
          if (name.endsWith('.mp4') || name.endsWith('.mkv') || name.endsWith('.avi')) {
            if (f.length > maxSize) {
              maxSize = f.length;
              maxIdx = idx;
            }
          }
        });
        fileIdx = maxIdx;
      }

      const streamUrl = `http://127.0.0.1:3030/torrents/${id}/stream/${fileIdx}`;
      await streamWithVlc(streamUrl, settings.vlcPath || null);
    } catch (e: unknown) {
      console.error(e instanceof Error ? e.message : String(e));
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
            <div className="flex justify-between text-[10px] text-zinc-500 mt-2 font-mono">
              <span>{(t.progress * 100).toFixed(1)}%</span>
              <span>{t.savePath}</span>
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
    </div>
  );
}
