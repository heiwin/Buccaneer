import { useState, useRef } from 'react';
import { getTorrentMetadata, type FileNode } from '../api/torrent';

export interface UseTorrentFileSelectionReturn {
  files: FileNode[];
  selectedFiles: Set<number>;
  loading: boolean;
  error: string | null;
  fetchFiles: (magnetUrl: string, force?: boolean) => Promise<void>;
  toggleFile: (index: number) => void;
  toggleAll: () => void;
}

export function useTorrentFileSelection(): UseTorrentFileSelectionReturn {
  const [files, setFiles] = useState<FileNode[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const currentIdRef = useRef<string | null>(null);

  const fetchFiles = async (magnetUrl: string, force?: boolean) => {
    if (!force && files.length > 0 && currentIdRef.current === magnetUrl) return;
    currentIdRef.current = magnetUrl;
    setLoading(true);
    setError(null);
    setFiles([]);
    setSelectedFiles(new Set());
    try {
      const metadata = await getTorrentMetadata(magnetUrl);
      setFiles(metadata);
      setSelectedFiles(new Set(metadata.map((f) => f.index)));
    } catch (e: unknown) {
      console.error(e instanceof Error ? e.message : String(e));
      setError('Failed to fetch file list. The torrent might have no seeds or is taking too long.');
    } finally {
      setLoading(false);
    }
  };

  const toggleFile = (index: number) => {
    setSelectedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const toggleAll = () => {
    setSelectedFiles((prev) =>
      prev.size === files.length
        ? new Set<number>()
        : new Set(files.map((f) => f.index))
    );
  };

  return { files, selectedFiles, loading, error, fetchFiles, toggleFile, toggleAll };
}
