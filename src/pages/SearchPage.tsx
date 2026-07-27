import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Search, Magnet, Loader2 } from 'lucide-react';
import { searchTorrents } from '../api/knaben';
import type { TorrentResult } from '../types/knaben';
import { Input, Button, Select, PageHeader, ErrorBanner } from '../components/ui';
import { TorrentActionMenu, TorrentRow, EmptyState } from '../components';
import { QUALITY_OPTIONS, LANGUAGE_OPTIONS, buildSearchQuery } from '../constants/filters';

const SOURCE_OPTIONS = [
  { value: 'knaben', label: 'Knaben' },
  { value: 'apibay', label: 'APIBay' },
  { value: 'yts', label: 'YTS (Movies only)' },
  { value: 'eztv', label: 'EZTV (TV series only)' },
];

export function SearchPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const initialQuery = searchParams.get('q') ?? '';

  const [query, setQuery] = useState(initialQuery);
  const [inputValue, setInputValue] = useState(initialQuery);
  const [results, setResults] = useState<TorrentResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [qualityFilter, setQualityFilter] = useState('');
  const [languageFilter, setLanguageFilter] = useState('');
  const [source, setSource] = useState('knaben');
  const [selectedTorrent, setSelectedTorrent] = useState<TorrentResult | null>(null);

  // Sync URL ?q= param changes into local state
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setQuery(initialQuery);
    setInputValue(initialQuery);
  }, [initialQuery]);

  useEffect(() => {
    let cancelled = false;
    if (!query.trim()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResults([]);
      return;
    }
    
    setLoading(true);
    setError(null);

    const finalQuery = buildSearchQuery(query, qualityFilter, languageFilter);

    searchTorrents(finalQuery, null, source)
      .then((res) => { if (!cancelled) setResults(res.hits || []); })
      .catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    
    return () => { cancelled = true; };
  }, [query, qualityFilter, languageFilter, source]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputValue.trim()) {
      navigate(`/search?q=${encodeURIComponent(inputValue.trim())}`);
    }
  };

  return (
    <div className="p-8">
      <div className="mb-10">
        <PageHeader icon={Search} title="Search Torrents" className="mb-6" />
        <form onSubmit={handleSubmit} className="flex gap-3 max-w-2xl items-center">
          <div className="flex-1">
            <Input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Search for any torrent…"
              autoFocus
              icon={<Search size={15} />}
              className="rounded-full"
            />
          </div>
          <Button type="submit" variant="primary" size="lg" className="rounded-full h-[46px]">
            Search
          </Button>
        </form>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 mb-6">
        <Select
          label="Source"
          options={SOURCE_OPTIONS}
          value={source}
          onChange={(e) => setSource(e.target.value as string)}
          size="sm"
          className="w-48"
        />
        {results.length > 0 && (
          <>
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
          </>
        )}
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center gap-3 py-24 text-zinc-500">
          <Loader2 className="w-6 h-6 animate-spin" />
          <span>Searching…</span>
        </div>
      )}

      {/* Error */}
      {!loading && error && <ErrorBanner error={error} />}

      {/* Empty state */}
      {!loading && !error && query && results.length === 0 && (
        <EmptyState icon={Magnet} message={`No torrents found for "${query}"`} />
      )}

      {/* No query yet */}
      {!loading && !error && !query && (
        <EmptyState icon={Search} message="Type something to search torrents across all trackers" />
      )}

      {/* Results */}
      {!loading && !error && results.length > 0 && (
        <div className="space-y-2 pb-20">
          {results.map((t) => (
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
    </div>
  );
}
