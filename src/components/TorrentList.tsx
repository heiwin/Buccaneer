import React, { useState, useMemo } from 'react';
import { Magnet, Loader2 } from 'lucide-react';
import type { TorrentResult } from '../types/knaben';
import { ALLOWED_TRACKERS } from '../types/knaben';
import { TorrentActionMenu } from './TorrentActionMenu';
import { TorrentRow } from './TorrentRow';
import { Select, ErrorBanner } from './ui';
import { QUALITY_OPTIONS, LANGUAGE_OPTIONS, LANGUAGE_SUFFIX } from '../constants/filters';

interface TorrentListProps {
  results: TorrentResult[];
  loading: boolean;
  error: string | null;
  qualityFilter: string;
  setQualityFilter: (v: string) => void;
  languageFilter: string;
  setLanguageFilter: (v: string) => void;
}

export const TorrentList: React.FC<TorrentListProps> = ({ 
  results, 
  loading, 
  error,
  qualityFilter,
  setQualityFilter,
  languageFilter,
  setLanguageFilter
}) => {
  const [selectedTorrent, setSelectedTorrent] = useState<TorrentResult | null>(null);
  const [providerFilter, setProviderFilter] = useState('All');

  const filteredResults = useMemo(() => results.filter(t => {
    const title = t.title.toLowerCase();

    if (providerFilter !== 'All' && t.tracker !== providerFilter) return false;

    if (qualityFilter) {
      const q = qualityFilter.toLowerCase();
      const matches = title.includes(q) || (q === '2160p' && title.includes('4k'));
      if (!matches) return false;
    }

    if (languageFilter) {
      const suffix = LANGUAGE_SUFFIX[languageFilter];
      if (suffix && !title.includes(suffix)) return false;
    }

    return true;
  }), [results, providerFilter, qualityFilter, languageFilter]);



  return (
    <section className="mt-10">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <Magnet className="w-5 h-5 text-primary" />
        <h2 className="text-lg font-bold tracking-wide">Available Torrents</h2>
        {!loading && !error && results.length > 0 && (
          <span className="ml-auto text-xs text-zinc-500">{filteredResults.length} results</span>
        )}
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center gap-3 py-16 text-zinc-500">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">Searching torrents…</span>
        </div>
      )}

      {/* Error */}
      {!loading && error && <ErrorBanner error={error} withIcon />}

      {/* Empty (no API results) */}
      {!loading && !error && results.length === 0 && (
        <div className="py-14 text-center text-zinc-600 text-sm">
          No torrents found for this title.
        </div>
      )}

      {/* Filters */}
      {!loading && !error && results.length > 0 && (
        <div className="flex flex-wrap gap-4 mb-4">
          <Select
            label="Quality"
            options={QUALITY_OPTIONS}
            value={qualityFilter}
            onChange={(e) => setQualityFilter(e.target.value as string)}
            size="sm"
            className="w-32"
          />
          <Select
            label="Language"
            options={LANGUAGE_OPTIONS}
            value={languageFilter}
            onChange={(e) => setLanguageFilter(e.target.value as string)}
            size="sm"
            className="w-40"
          />
          <Select
            label="Provider"
            options={[
              { value: 'All', label: 'All' },
              ...ALLOWED_TRACKERS.map(t => ({ value: t, label: t }))
            ]}
            value={providerFilter}
            onChange={(e) => setProviderFilter(e.target.value as string)}
            size="sm"
            className="w-48"
          />
        </div>
      )}

      {/* Empty after filter */}
      {!loading && !error && results.length > 0 && filteredResults.length === 0 && (
        <div className="py-14 text-center text-zinc-600 text-sm">
          No torrents match the selected filters.
        </div>
      )}

      {/* Results */}
      {!loading && !error && filteredResults.length > 0 && (
        <div className="space-y-2 max-h-[360px] overflow-y-auto pr-2 custom-scrollbar">
          {filteredResults.map((t) => (
            <TorrentRow 
              key={t.id} 
              torrent={t} 
              onSelect={(torrent, onlyFiles) => {
                const updatedTorrent = { ...torrent, onlyFiles };
                setSelectedTorrent(updatedTorrent);
              }} 
            />
          ))}
        </div>
      )}

      {/* Action Menu */}
      <TorrentActionMenu
        torrent={selectedTorrent}
        onClose={() => setSelectedTorrent(null)}
        hideFileSelection
      />
    </section>
  );
};
