import { useState, useEffect, useRef, useMemo } from 'react';
import { Eye, Plus, Search } from 'lucide-react';
import { useLibrary } from '../lib/LibraryContext';
import { PageHeader, Input, Select, SegmentedControl } from '../components/ui';
import { MediaCard, EmptyState } from '../components';
import { loadSettings, saveSettings } from '../api/settings';
import { getMovieDetails, getTvDetails } from '../api/tmdb';
import { getWatchedItems, getToWatchItems } from '../api/library';
import type { MovieDetails, TvDetails } from '../types/tmdb';

type ListType = 'watched' | 'towatch';

interface WatchlistItem {
  mediaType: 'movie' | 'tv';
  id: number;
  ts: number;
  title: string;
  posterPath: string | null;
  rating?: number;
  releaseDate?: string;
  lastAirDate?: number;
}

export function WatchlistPage() {
  const { watched, toWatch } = useLibrary();
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [listType, setListType] = useState<ListType>('watched');
  const [mediaType, setMediaType] = useState<'movie' | 'tv'>('movie');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('alphabetical');
  const sortInitialized = useRef(false);

  useEffect(() => {
    loadSettings().then((s) => {
      setSortBy(s.watchlistSortBy || 'alphabetical');
      sortInitialized.current = true;
    });
  }, []);

  useEffect(() => {
    if (!sortInitialized.current) return;
    const timer = setTimeout(() => {
      loadSettings().then((s) => saveSettings({ ...s, watchlistSortBy: sortBy })).catch(console.error);
    }, 1000);
    return () => clearTimeout(timer);
  }, [sortBy]);

  // Resolve watched/to-watch keys into media metadata (TMDB responses are cached).
  // TV last-air dates are cached in a ref so re-sorting stays cheap.
  useEffect(() => {
    let cancelled = false;
    const baseItems =
      listType === 'watched' ? getWatchedItems(watched) : getToWatchItems(toWatch);

    (async () => {
      const results = await Promise.allSettled(
        baseItems.map((w) =>
          w.mediaType === 'movie' ? getMovieDetails(w.id) : getTvDetails(w.id)
        )
      );
      if (cancelled) return;

      if (baseItems.length === 0) {
        setItems([]);
        return;
      }

      let lastAirDate: number | undefined;
      const resolved: WatchlistItem[] = [];
      results.forEach((r, i) => {
        if (r.status !== 'fulfilled') return;
        const d = r.value as MovieDetails | TvDetails;
        const base = baseItems[i];
        const title = 'title' in d ? d.title : d.name;
        if (base.mediaType === 'tv') {
          const t = (d as TvDetails).last_air_date ? new Date((d as TvDetails).last_air_date).getTime() : NaN;
          lastAirDate = Number.isFinite(t) ? t : undefined;
        }
        resolved.push({
          mediaType: base.mediaType,
          id: base.id,
          ts: 'watchedAt' in base ? base.watchedAt : base.addedAt,
          title: title || 'Unknown',
          posterPath: d.poster_path,
          rating: d.vote_average,
          releaseDate: 'release_date' in d
            ? d.release_date
            : d.first_air_date || undefined,
          lastAirDate,
        });
      });
      setItems(resolved);
    })();

    return () => { cancelled = true; };
  }, [watched, toWatch, listType]);

  const sortOptions = listType === 'watched'
    ? [
        { value: 'alphabetical', label: 'Alphabetically' },
        { value: 'recent', label: 'Recently Watched' },
        { value: 'rating', label: 'Rating' },
        { value: 'last-updated', label: 'Last Updated' },
      ]
    : [
        { value: 'alphabetical', label: 'Alphabetically' },
        { value: 'recent', label: 'Recently Added' },
        { value: 'rating', label: 'Rating' },
        { value: 'last-updated', label: 'Last Updated' },
      ];

  const q = searchQuery.toLowerCase().trim();
  const filtered = q ? items.filter((w) => w.title.toLowerCase().includes(q)) : items;

  const sortedItems = useMemo(() => {
    const sorted = [...filtered];
    switch (sortBy) {
      case 'recent':
        sorted.sort((a, b) => b.ts - a.ts);
        break;
      case 'rating':
        sorted.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
        break;
      case 'last-updated': {
        const updatedAt = (item: WatchlistItem): number => {
          if (item.mediaType === 'movie') {
            const t = item.releaseDate ? new Date(item.releaseDate).getTime() : NaN;
            return Number.isFinite(t) ? t : 0;
          }
          return item.lastAirDate ?? 0;
        };
        sorted.sort((a, b) => updatedAt(b) - updatedAt(a));
        break;
      }
      default:
        sorted.sort((a, b) => a.title.localeCompare(b.title));
    }
    return sorted;
  }, [filtered, sortBy]);

  const activeItems =
    mediaType === 'movie'
      ? sortedItems.filter((w) => w.mediaType === 'movie')
      : sortedItems.filter((w) => w.mediaType === 'tv');

  return (
    <div className="p-8">
      {/* Header */}
      <header className="mb-8">
        <PageHeader icon={Eye} title="Watchlist" className="mb-4 justify-between">
          <div className="flex items-end gap-2">
            <form onSubmit={(e) => e.preventDefault()} className="w-64 hidden md:block">
              <Input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search watchlist..."
                icon={<Search size={15} />}
                className="rounded-full"
              />
            </form>
          </div>
        </PageHeader>

        {/* List type + media type toggles */}
        <div className="flex flex-wrap items-center gap-3">
          <SegmentedControl
            options={[
              { value: 'watched', label: 'Watched' },
              { value: 'towatch', label: 'To Watch' },
            ]}
            value={listType}
            onChange={(v) => setListType(v as ListType)}
            className="w-fit"
          />
          <SegmentedControl
            options={[
              { value: 'movie', label: 'Movies' },
              { value: 'tv', label: 'TV Series' },
            ]}
            value={mediaType}
            onChange={(v) => setMediaType(v as 'movie' | 'tv')}
            className="w-fit"
          />
        </div>
      </header>

      <div className="space-y-1.5 mb-10">
        <span className="text-[10px] text-gray-400 font-black uppercase tracking-widest">Sort by</span>
        <Select
          options={sortOptions}
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as string)}
          size="sm"
          className="w-52"
        />
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={listType === 'watched' ? Eye : Plus}
          message={listType === 'watched' ? 'No watched titles yet' : 'No to-watch titles yet'}
          subMessage={
            listType === 'watched'
              ? 'Click the eye icon on any movie or TV series card to add it here'
              : 'Click the + icon on any movie or TV series card to add it here'
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Search}
          message={`No ${listType === 'watched' ? 'watched' : 'to-watch'} titles match "${searchQuery}"`}
        />
      ) : activeItems.length === 0 ? (
        <EmptyState
          icon={listType === 'watched' ? Eye : Plus}
          message={
            mediaType === 'movie'
              ? listType === 'watched'
                ? 'No watched movies yet'
                : 'No to-watch movies yet'
              : listType === 'watched'
                ? 'No watched TV series yet'
                : 'No to-watch TV series yet'
          }
          subMessage={`Switch to the ${mediaType === 'movie' ? 'TV Series' : 'Movies'} tab or search in the other category`}
        />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5 pb-20">
          {activeItems.map((item) => (
            <MediaCard
              key={`${item.mediaType}-${item.id}`}
              id={item.id}
              mediaType={item.mediaType}
              title={item.title}
              posterPath={item.posterPath}
              rating={item.rating}
              releaseDate={item.releaseDate}
            />
          ))}
        </div>
      )}
    </div>
  );
}