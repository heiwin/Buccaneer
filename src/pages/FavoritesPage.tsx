import { useState, useEffect, useRef, useCallback } from 'react';
import { Heart, Search } from 'lucide-react';
import { useLibrary } from '../lib/LibraryContext';
import { PageHeader } from '../components/ui';
import { Input, Select } from '../components/ui';
import { MediaCard, EmptyState } from '../components';
import { loadSettings, saveSettings } from '../api/settings';
import { getTvDetails } from '../api/tmdb';
import type { FavoriteItem } from '../api/library';

export function FavoritesPage() {
  const { favorites } = useLibrary();
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('alphabetical');
  const [lastUpdated, setLastUpdated] = useState<Record<string, number>>({});
  const tvLastAirDatesRef = useRef<Record<string, number>>({});
  const sortInitialized = useRef(false);

  useEffect(() => {
    loadSettings().then((s) => {
      setSortBy(s.favoritesSortBy || 'alphabetical');
      sortInitialized.current = true;
    });
  }, []);

  useEffect(() => {
    if (!sortInitialized.current) return;
    const timer = setTimeout(() => {
      loadSettings().then((s) => saveSettings({ ...s, favoritesSortBy: sortBy }));
    }, 1000);
    return () => clearTimeout(timer);
  }, [sortBy]);

  useEffect(() => {
    if (sortBy !== 'last-updated') return;
    let cancelled = false;

    const tvIds = favorites.filter((f) => f.mediaType === 'tv').map((f) => f.id);
    if (tvIds.length === 0) return;

    // Only fetch shows not already cached, so re-selecting the sort is cheap.
    const missing = tvIds.filter((id) => !(id in tvLastAirDatesRef.current));
    if (missing.length === 0) return;

    (async () => {
      const results = await Promise.allSettled(missing.map((id) => getTvDetails(id)));
      if (cancelled) return;
      results.forEach((r, i) => {
        if (r.status === 'fulfilled' && r.value.last_air_date) {
          const t = new Date(r.value.last_air_date).getTime();
          if (!Number.isNaN(t)) tvLastAirDatesRef.current[`tv-${missing[i]}`] = t;
        }
      });
      setLastUpdated({ ...tvLastAirDatesRef.current });
    })();

    return () => { cancelled = true; };
  }, [sortBy, favorites]);

  const sortOptions = [
    { value: 'alphabetical', label: 'Alphabetically' },
    { value: 'time-added', label: 'Time Added' },
    { value: 'rating', label: 'Rating' },
    { value: 'last-updated', label: 'Last Updated' },
  ];

  const sortFavorites = useCallback((list: FavoriteItem[]) => {
    const sorted = [...list];
    switch (sortBy) {
      case 'time-added':
        sorted.sort((a, b) => b.addedAt - a.addedAt);
        break;
      case 'rating':
        sorted.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
        break;
      case 'last-updated': {
        const updatedAt = (f: FavoriteItem): number => {
          if (f.mediaType === 'movie') {
            const t = f.releaseDate ? new Date(f.releaseDate).getTime() : NaN;
            return Number.isFinite(t) ? t : 0;
          }
          return lastUpdated[`tv-${f.id}`] ?? 0;
        };
        sorted.sort((a, b) => updatedAt(b) - updatedAt(a));
        break;
      }
      default:
        sorted.sort((a, b) => a.title.localeCompare(b.title));
    }
    return sorted;
  }, [sortBy, lastUpdated]);

  const q = searchQuery.toLowerCase().trim();
  const filtered = q
    ? favorites.filter((f) => f.title.toLowerCase().includes(q))
    : favorites;

  const movieFavorites = sortFavorites(filtered.filter((f) => f.mediaType === 'movie'));
  const tvFavorites = sortFavorites(filtered.filter((f) => f.mediaType === 'tv'));

  return (
    <div className="p-8">
      <PageHeader icon={Heart} title="Favorites" className="mb-10 justify-between">
        <div className="flex items-end gap-2">
          <form onSubmit={(e) => e.preventDefault()} className="w-64 hidden md:block">
            <Input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search favorites..."
              icon={<Search size={15} />}
              className="rounded-full"
            />
          </form>
        </div>
      </PageHeader>

      <div className="space-y-1.5 mb-10">
        <span className="text-[10px] text-gray-400 font-black uppercase tracking-widest">Sort by</span>
        <Select
          options={sortOptions}
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as string)}
          size="sm"
          className="w-44"
        />
      </div>

      {favorites.length === 0 ? (
        <EmptyState
          icon={Heart}
          message="No favorites yet"
          subMessage="Click the heart icon on any movie or TV series card to add it here"
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Search}
          message={`No favorites match "${searchQuery}"`}
        />
      ) : (
        <div className="space-y-12 pb-20">
          {/* Movies */}
          {movieFavorites.length > 0 && (
            <section>
              <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                Movies
                <span className="text-xs font-normal text-zinc-500 uppercase tracking-wider ml-2">
                  {movieFavorites.length} title{movieFavorites.length !== 1 ? 's' : ''}
                </span>
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5">
                {movieFavorites.map((item) => (
                  <MediaCard
                    key={item.id}
                    id={item.id}
                    mediaType="movie"
                    title={item.title}
                    posterPath={item.posterPath}
                    rating={item.rating}
                    releaseDate={item.releaseDate}
                  />
                ))}
              </div>
            </section>
          )}

          {/* TV Series */}
          {tvFavorites.length > 0 && (
            <section>
              <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                TV Series
                <span className="text-xs font-normal text-zinc-500 uppercase tracking-wider ml-2">
                  {tvFavorites.length} title{tvFavorites.length !== 1 ? 's' : ''}
                </span>
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5">
                {tvFavorites.map((item) => (
                  <MediaCard
                    key={item.id}
                    id={item.id}
                    mediaType="tv"
                    title={item.title}
                    posterPath={item.posterPath}
                    rating={item.rating}
                    releaseDate={item.releaseDate}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
