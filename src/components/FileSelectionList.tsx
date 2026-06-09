import { Loader2, CheckSquare, Square } from 'lucide-react';
import { Button } from './ui';
import { formatBytes } from '../api/knaben';
import type { FileNode } from '../api/torrent';

interface FileSelectionListProps {
  files: FileNode[];
  selectedFiles: Set<number>;
  loading: boolean;
  error: string | null;
  onToggleFile: (index: number) => void;
  onToggleAll: () => void;
  /** Optional max height CSS class for the scrollable file list. Defaults to 'max-h-60' */
  maxHeightClass?: string;
  /** Optional loading message. Defaults to generic connecting message. */
  loadingMessage?: string;
  loadingSubMessage?: string;
}

export function FileSelectionList({
  files,
  selectedFiles,
  loading,
  error,
  onToggleFile,
  onToggleAll,
  maxHeightClass = 'max-h-60',
  loadingMessage = 'Connecting to peers...',
  loadingSubMessage,
}: FileSelectionListProps) {
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-6 text-zinc-500 gap-3">
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
        <p className="text-xs">{loadingMessage}</p>
        {loadingSubMessage && (
          <p className="text-[10px] text-zinc-600">{loadingSubMessage}</p>
        )}
      </div>
    );
  }

  if (error) {
    return <div className="text-sm text-red-400 p-2 text-center">{error}</div>;
  }

  if (files.length === 0) {
    return <div className="text-sm text-zinc-500 text-center py-4">No files found.</div>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-2">
        <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Files</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={onToggleAll}
          className="h-auto py-1 px-2 text-xs text-primary hover:text-primary-light hover:bg-primary/10 transition-colors"
        >
          {selectedFiles.size === files.length ? 'Deselect All' : 'Select All'}
        </Button>
      </div>
      <div className={`${maxHeightClass} overflow-y-auto pr-2 space-y-1 custom-scrollbar`}>
        {files.map((f) => (
          <div
            key={f.index}
            onClick={() => onToggleFile(f.index)}
            className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 cursor-pointer transition-colors group/file"
          >
            <div className="text-zinc-500 group-hover/file:text-primary transition-colors">
              {selectedFiles.has(f.index) ? (
                <CheckSquare size={16} className="text-primary" />
              ) : (
                <Square size={16} />
              )}
            </div>
            <span className="text-sm text-gray-300 truncate flex-1">{f.name}</span>
            <span className="text-xs text-zinc-600">{formatBytes(f.size)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
