import { useState } from 'react';
import { ChevronDown, ChevronUp, HardDrive, Sprout, Users, Loader2 } from 'lucide-react';
import { Button, Badge } from './ui';
import { formatBytes } from '../api/knaben';
import type { TorrentResult } from '../types/knaben';
import { useTorrentFileSelection } from '../hooks/useTorrentFileSelection';
import { FileSelectionList } from './FileSelectionList';

interface TorrentRowProps {
  torrent: TorrentResult;
  onSelect: (torrent: TorrentResult, onlyFiles?: number[]) => void;
}

export function TorrentRow({ torrent, onSelect }: TorrentRowProps) {
  const [expanded, setExpanded] = useState(false);
  const { files, selectedFiles, loading, error, fetchFiles, toggleFile, toggleAll } =
    useTorrentFileSelection();

  const hasMagnet = !!(torrent.magnetUrl || torrent.hash);
  const magnetUrl = torrent.magnetUrl || `magnet:?xt=urn:btih:${torrent.hash}`;

  const handleExpand = async () => {
    if (!hasMagnet) return;
    if (!expanded) {
      await fetchFiles(magnetUrl);
    }
    setExpanded((v) => !v);
  };

  const handleAction = () => {
    if (expanded && files.length > 0 && selectedFiles.size < files.length) {
      onSelect(torrent, Array.from(selectedFiles));
      return;
    }
    onSelect(torrent);
  };

  return (
    <div className="group flex flex-col bg-surface-elevated border border-zinc-800/60 rounded-xl overflow-hidden hover:border-primary/30 transition-all">
      <div className="flex items-center gap-4 px-4 py-3 hover:bg-zinc-800/40">
        <div className="flex-1 min-w-0 cursor-pointer" onClick={handleExpand}>
          <p className="text-sm text-gray-200 font-medium truncate">{torrent.title}</p>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            <Badge variant="gray" size="sm">{torrent.tracker}</Badge>
            <span className="text-[11px] text-zinc-500 flex items-center gap-1">
              <HardDrive className="w-3 h-3" /> {formatBytes(torrent.bytes)}
            </span>
            <span className="text-[11px] text-emerald-500 flex items-center gap-1">
              <Sprout className="w-3 h-3" /> {torrent.seeders}
            </span>
            <span className="text-[11px] text-zinc-500 flex items-center gap-1">
              <Users className="w-3 h-3" /> {torrent.peers}
            </span>
            <span className="text-[11px] text-zinc-600 hidden sm:inline">{torrent.category}</span>
          </div>
        </div>

        {hasMagnet ? (
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleExpand}
              disabled={loading}
              className="text-zinc-500 hover:text-white disabled:opacity-100 disabled:hover:text-zinc-500"
            >
              {loading ? (
                <Loader2 size={20} className="animate-spin" />
              ) : expanded ? (
                <ChevronUp size={20} />
              ) : (
                <ChevronDown size={20} />
              )}
            </Button>
            <Button
              size="sm"
              variant="accent"
              onClick={handleAction}
              disabled={expanded && files.length > 0 && selectedFiles.size === 0}
              className="shrink-0"
            >
              Select
            </Button>
          </div>
        ) : (
          <span className="shrink-0 text-zinc-700 text-xs">no magnet</span>
        )}
      </div>

      {expanded && (
        <div className="border-t border-zinc-800/60 bg-black/40 p-4">
          <FileSelectionList
            files={files}
            selectedFiles={selectedFiles}
            loading={loading}
            error={error}
            onToggleFile={toggleFile}
            onToggleAll={toggleAll}
            maxHeightClass="max-h-60"
            loadingMessage="Connecting to peers to fetch metadata..."
            loadingSubMessage="This can take up to a minute for torrents with few seeders."
          />
        </div>
      )}
    </div>
  );
}
