import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

import { HardDrive, Pause, Play, Trash2, X, FolderOpen } from 'lucide-react';
import { getActiveTorrents, pauseTorrent, resumeTorrent, removeTorrent, getTorrentDetails, openInVlc, findBestVideoFileIndex, autoDetectVlc, openInFileManager, type TorrentInfo } from '../api/torrent';
import { formatBytes } from '../api/knaben';
import { loadSettings, saveSettings } from '../api/settings';
import { Select, Button, Badge, ConfirmDialog, PageHeader, ErrorBanner } from '../components/ui';
import { EmptyState } from '../components';



function formatEta(seconds: number): string {
  if (seconds <= 0 || !isFinite(seconds) || isNaN(seconds)) return '—';
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
  const [sortBy, setSortBy] = useState('time-added');
  const sortInitialized = useRef(false);
  const errorCountRef = useRef(0);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    loadSettings().then((s) => {
      setSortBy(s.downloadsSortBy);
      sortInitialized.current = true;
    });
  }, []);

  useEffect(() => {
    if (!sortInitialized.current) return;
    const timer = setTimeout(() => {
      loadSettings().then((s) => saveSettings({ ...s, downloadsSortBy: sortBy }));
    }, 1000);
    return () => clearTimeout(timer);
  }, [sortBy]);

  useEffect(() => {
    let cancelled = false;
    const MAX_BACKOFF_MS = 30000;

    const scheduleNext = (delayMs: number) => {
      pollIntervalRef.current = window.setTimeout(() => {
        if (!cancelled) fetchTorrents();
      }, delayMs);
    };

    const fetchTorrents = async () => {
      try {
        const data = await getActiveTorrents();
        if (cancelled) return;

        setTorrents(data);
        setError(null);
        errorCountRef.current = 0;
        if (!cancelled) scheduleNext(2000);
      } catch (err: unknown) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        errorCountRef.current += 1;
        const backoff = Math.min(2000 * Math.pow(2, errorCountRef.current - 1), MAX_BACKOFF_MS);
        if (!cancelled) scheduleNext(backoff);
      } finally {
        setLoading(false);
      }
    };

    fetchTorrents();

    return () => {
      cancelled = true;
      if (pollIntervalRef.current !== null) {
        window.clearTimeout(pollIntervalRef.current);
      }
    };
  }, [navigate]);

  const sortOptions = [
    { value: 'time-added', label: 'Time Added' },
    { value: 'time-finished', label: 'Time Completed' },
    { value: 'alphabetical', label: 'Alphabetically' },
  ];

  const sortedTorrents = useMemo(() => {
    const list = [...torrents];
    switch (sortBy) {
      case 'time-added':
        list.sort((a, b) => b.addedAt - a.addedAt);
        break;
      case 'time-finished':
        list.sort((a, b) => {
          if (a.completedAt && b.completedAt) return b.completedAt - a.completedAt;
          if (a.completedAt) return -1;
          if (b.completedAt) return 1;
          return 0;
        });
        break;
      case 'alphabetical':
        list.sort((a, b) => a.name.localeCompare(b.name));
        break;
    }
    return list;
  }, [torrents, sortBy]);

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
    } finally {
      setConfirmState(s => ({ ...s, isOpen: false }));
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
      const fileName = data.files?.[fileIdx]?.name;
      const outputFolder = data.output_folder as string | undefined;

      if (!outputFolder || !fileName) {
        throw new Error('Could not determine file path');
      }
      await openInVlc(`${outputFolder}/${fileName}`, settings.vlcPath || null);
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
      <div className="mb-10">
        <PageHeader icon={HardDrive} title="Active Downloads" className="mb-5" />
        <div className="space-y-1.5">
          <span className="text-[10px] text-gray-400 font-black uppercase tracking-widest">Sort by</span>
          <Select
            options={sortOptions}
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as string)}
            size="sm"
            className="w-44"
          />
        </div>
      </div>

      {error && <ErrorBanner error={error} withIcon className="mb-6" />}

      {!loading && torrents.length === 0 && !error && (
        <EmptyState icon={HardDrive} message="No active downloads" />
      )}

      <div className="space-y-4">
        {sortedTorrents.map((t) => (
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
                  {t.state === 'error' && t.error && (
                    <span className="text-rose-400 font-bold" title={t.error}>{t.error}</span>
                  )}
                  <span>{formatBytes(t.downloadSpeed)}/s DL</span>
                  <span>{formatBytes(t.uploadSpeed)}/s UL</span>
                  <span>{t.seeds} seeds</span>
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
        confirmLabel={confirmState.deleteFiles ? 'Delete Files' : 'Remove Download'}
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
