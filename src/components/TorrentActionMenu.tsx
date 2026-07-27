import { useState } from 'react';
import { HardDrive, MonitorPlay, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import type { TorrentResult } from '../types/knaben';
import { addTorrent, getTorrentDetails, streamWithVlc, findBestVideoFileIndex, autoDetectVlc, getActiveTorrents, pauseTorrent } from '../api/torrent';
import { loadSettings } from '../api/settings';
import { useNavigate } from 'react-router-dom';
import { Modal, Button, ConfirmDialog } from './ui';
import { message } from '@tauri-apps/plugin-dialog';
import { useTorrentFileSelection } from '../hooks/useTorrentFileSelection';
import { FileSelectionList } from './FileSelectionList';

interface TorrentActionMenuProps {
  torrent: TorrentResult | null;
  onClose: () => void;
  hideFileSelection?: boolean;
}

export function TorrentActionMenu({ torrent, onClose, hideFileSelection }: TorrentActionMenuProps) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [filesExpanded, setFilesExpanded] = useState(false);
  const [vlcDialog, setVlcDialog] = useState<'not-found' | 'launch-error' | null>(null);
  const { files, selectedFiles, loading: fetchingFiles, error: fileError, fetchFiles, toggleFile, toggleAll } =
    useTorrentFileSelection();

  const onlyFilesOverride: number[] | undefined = torrent?.onlyFiles;

  if (!torrent) return null;

  const magnetUrl = torrent.magnetUrl || `magnet:?xt=urn:btih:${torrent.hash}`;

  const getOnlyFilesArgs = () => {
    if (onlyFilesOverride) return onlyFilesOverride;
    if (filesExpanded && files.length > 0 && selectedFiles.size < files.length) {
      return Array.from(selectedFiles);
    }
    return undefined;
  };

  const handleDownload = async () => {
    setLoading(true);
    try {
      await addTorrent(magnetUrl, false, getOnlyFilesArgs());
      onClose();
      navigate('/downloads');
    } catch (e: unknown) {
      console.error(e instanceof Error ? e.message : String(e));
      await message('Failed to start download', { title: 'Error', kind: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleStreamVlc = async () => {
    setLoading(true);
    let settings: Awaited<ReturnType<typeof loadSettings>> | null = null;
    try {
      const active = await getActiveTorrents();
      for (const t of active) {
        if (t.isStream) await pauseTorrent(t.id);
      }
      const id = await addTorrent(magnetUrl, true, getOnlyFilesArgs());
      settings = await loadSettings();
      await new Promise((r) => setTimeout(r, 1000));
      const onlyFiles = getOnlyFilesArgs();
      let fileIndex = onlyFiles && onlyFiles.length > 0 ? onlyFiles[0] : 0;
      let title: string | undefined;
      try {
        const details = await getTorrentDetails(id);
        if (details.files && details.files.length > 0) {
          if (!onlyFiles || onlyFiles.length === 0) {
            fileIndex = findBestVideoFileIndex(details.files, torrent.title);
          }
          if (details.files[fileIndex]?.name) {
            title = details.files[fileIndex].name;
          }
        }
      } catch { /* fallback */ }
      await streamWithVlc(id, fileIndex, settings.vlcPath || null, title);
      onClose();
      navigate('/downloads');
    } catch (e: unknown) {
      console.error(e instanceof Error ? e.message : String(e));
      const detected = await autoDetectVlc();
      if (!detected && (!settings || !settings.vlcPath)) {
        setVlcDialog('not-found');
      } else {
        setVlcDialog('launch-error');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleExpandFiles = async () => {
    if (!filesExpanded) {
      await fetchFiles(magnetUrl);
    }
    setFilesExpanded((v) => !v);
  };

  const isFileSelectionDisabled = filesExpanded && files.length > 0 && selectedFiles.size === 0;

  return (
    <>
      <Modal isOpen={!!torrent} onClose={onClose} maxWidth="xl">
        <h3 className="text-lg font-bold mb-1 truncate pr-8">{torrent.title}</h3>
        <p className="text-xs text-zinc-400 mb-6">Choose how to open this torrent</p>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-8 text-zinc-500 gap-3">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
            <p className="text-sm">Please wait...</p>
            <p className="text-[10px] text-zinc-600">Connecting to peers</p>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              <Button
                onClick={handleDownload}
                disabled={loading || isFileSelectionDisabled}
                variant="secondary"
                className="w-full justify-start h-auto p-4 !bg-zinc-800 hover:!bg-zinc-700 border-none rounded-xl"
              >
                <div className="bg-zinc-700/50 text-zinc-300 p-2 rounded-lg mr-1 shrink-0">
                  <HardDrive size={20} />
                </div>
                <div className="text-left flex-1 min-w-0">
                  <p className="text-sm font-bold text-gray-200">Download</p>
                  <p className="text-xs text-zinc-500 font-normal normal-case tracking-normal">Save to your downloads folder</p>
                </div>
              </Button>

              <Button
                onClick={handleStreamVlc}
                disabled={loading || isFileSelectionDisabled}
                variant="secondary"
                className="w-full justify-start h-auto p-4 !bg-zinc-800 hover:!bg-zinc-700 border-none rounded-xl"
              >
                <div className="bg-zinc-700/50 text-zinc-300 p-2 rounded-lg mr-1 shrink-0">
                  <MonitorPlay size={20} />
                </div>
                <div className="text-left flex-1 min-w-0">
                  <p className="text-sm font-bold text-gray-200">Stream with VLC</p>
                  <p className="text-xs text-zinc-500 font-normal normal-case tracking-normal">Launch VLC media player</p>
                </div>
              </Button>
            </div>

            {!hideFileSelection && !onlyFilesOverride && (
              <div className="mt-4 pt-4 border-t border-zinc-800/60">
                <Button
                  variant="ghost"
                  onClick={handleExpandFiles}
                  className="w-full justify-between text-zinc-400 hover:text-white"
                >
                  <span className="text-sm font-medium">Select specific files</span>
                  {filesExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </Button>

                {filesExpanded && (
                  <div className="mt-4 bg-black/40 rounded-xl p-4 border border-zinc-800/60">
                    <FileSelectionList
                      files={files}
                      selectedFiles={selectedFiles}
                      loading={fetchingFiles}
                      error={fileError}
                      onToggleFile={toggleFile}
                      onToggleAll={toggleAll}
                      maxHeightClass="max-h-48"
                      loadingMessage="Connecting to peers..."
                    />
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </Modal>

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
    </>
  );
}
