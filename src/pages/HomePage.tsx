import { useState, useEffect } from 'react';
import { Search, Home, ArrowLeft } from 'lucide-react';
import { getTrendingMovies, getTrendingTvSeries, searchTMDB, discoverMedia } from '../api/tmdb';
import { MediaCard, Carousel, EmptyState } from '../components';
import type { TMDBListItem } from '../types/tmdb';
import { Input, PageHeader, Spinner, ErrorBanner, Button } from '../components/ui';
import { STREAMING_PROVIDERS } from '../constants/streaming';
import { loadSettings } from '../api/settings';

interface ProviderSection {
  providerId: number;
  providerName: string;
  items: TMDBListItem[];
}

export function HomePage() {
  const [movies, setMovies] = useState<TMDBListItem[]>([]);
  const [tvSeries, setTvSeries] = useState<TMDBListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<TMDBListItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [providerSections, setProviderSections] = useState<ProviderSection[]>([]);

  useEffect(() => {
    async function loadData() {
      try {
        const [moviesRes, tvRes] = await Promise.all([
          getTrendingMovies(),
          getTrendingTvSeries(),
        ]);
        setMovies(moviesRes.results || []);
        setTvSeries(tvRes.results || []);
      } catch (err: unknown) {
        console.error(err);
        setError('Failed to fetch trending data. Make sure the Tauri backend is running.');
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  useEffect(() => {
    if (loading) return;

    async function loadProviderData() {
      const settings = await loadSettings();
      const { streamingRegion, streamingProviders } = settings;

      if (!streamingProviders.length) return;

      const results = await Promise.all(
        streamingProviders.map(async (providerId) => {
          const providerName = Object.entries(STREAMING_PROVIDERS).find(([, id]) => id === providerId)?.[0] ?? 'Unknown';
          try {
            const [movieRes, tvRes] = await Promise.all([
              discoverMedia('movie', null, null, 1, null, null, String(providerId), streamingRegion, 'flatrate'),
              discoverMedia('tv', null, null, 1, null, null, String(providerId), streamingRegion, 'flatrate'),
            ]);

            const movieItems = (movieRes.results || []).map(i => ({ ...i, media_type: 'movie' as const }));
            const tvItems = (tvRes.results || []).map(i => ({ ...i, media_type: 'tv' as const }));
            const merged = [...movieItems, ...tvItems]
              .sort((a, b) => b.vote_count - a.vote_count);

            return { providerId, providerName, items: merged };
          } catch {
            return { providerId, providerName, items: [] };
          }
        }),
      );

      setProviderSections(results.filter(s => s.items.length > 0));
    }

    loadProviderData();
  }, [loading]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchQuery.trim();
    if (!q) return;

    setSearching(true);
    setSearchError(null);
    setSearchResults([]);

    try {
      const res = await searchTMDB(q);
      setSearchResults(res.results || []);
    } catch (err: unknown) {
      setSearchError(err instanceof Error ? err.message : String(err));
    } finally {
      setSearching(false);
    }
  };

  const clearSearch = () => {
    setSearchQuery('');
    setSearchResults([]);
    setSearchError(null);
  };

  const hasActiveSearch = searchResults.length > 0 || searching || searchError !== null;

  return (
    <div className="px-8 pt-8 pb-8">
      <PageHeader icon={Home} title={hasActiveSearch ? 'Search Results' : 'Home'} className="mb-12 justify-between">
        <form onSubmit={handleSearch} className="w-64 hidden md:block">
          <Input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search movies, tv series..."
            icon={<Search size={15} />}
            className="rounded-full"
          />
        </form>
      </PageHeader>

      {error && !hasActiveSearch && <ErrorBanner error={error} className="mb-8" />}

      {/* Search Results */}
      {hasActiveSearch ? (
        <div>
          <Button
            variant="glass"
            size="sm"
            icon={ArrowLeft}
            onClick={clearSearch}
            className="mb-6"
          >
            Back to trending
          </Button>

          {searching && <Spinner size="lg" className="h-64" />}

          {searchError && <ErrorBanner error={searchError} className="mb-8" />}

          {!searching && !searchError && searchResults.length === 0 && (
            <EmptyState icon={Search} message={`No results found for "${searchQuery}"`} />
          )}

          {!searching && searchResults.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5 pb-20">
              {searchResults.map((item) => (
                <MediaCard
                  key={item.id}
                  id={item.id}
                  mediaType={item.media_type || 'movie'}
                  title={(item.media_type === 'tv' ? item.name : item.title) || item.original_title || item.original_name || ''}
                  posterPath={item.poster_path}
                  rating={item.vote_average}
                  releaseDate={item.media_type === 'tv' ? item.first_air_date : item.release_date}
                />
              ))}
            </div>
          )}
        </div>
      ) : loading ? (
        <Spinner size="lg" className="h-64" />
      ) : (
        <div className="space-y-12 pb-20">
          {/* Trending Movies */}
          <section>
            <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
              Trending Movies
              <span className="text-xs font-normal text-zinc-500 uppercase tracking-wider ml-2">
                This Week
              </span>
            </h2>
            <Carousel>
              {movies.map((movie) => (
                <MediaCard
                  key={movie.id}
                  id={movie.id}
                  mediaType="movie"
                  title={movie.title || movie.original_title || ''}
                  posterPath={movie.poster_path}
                  rating={movie.vote_average}
                  releaseDate={movie.release_date}
                  className="w-40 shrink-0"
                />
              ))}
            </Carousel>
          </section>

          {/* Trending TV Series */}
          <section>
            <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
              Trending TV Series
              <span className="text-xs font-normal text-zinc-500 uppercase tracking-wider ml-2">
                This Week
              </span>
            </h2>
            <Carousel>
              {tvSeries.map((tv) => (
                <MediaCard
                  key={tv.id}
                  id={tv.id}
                  mediaType="tv"
                  title={tv.name || tv.original_name || ''}
                  posterPath={tv.poster_path}
                  rating={tv.vote_average}
                  releaseDate={tv.first_air_date}
                  className="w-40 shrink-0"
                />
              ))}
            </Carousel>
          </section>

          {/* Streaming Provider Sections */}
          {providerSections.map(section => (
            <section key={section.providerId}>
              <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                Popular on {section.providerName}
              </h2>
              <Carousel>
                {section.items.map(item => (
                  <MediaCard
                    key={`${item.media_type}-${item.id}`}
                    id={item.id}
                    mediaType={item.media_type || 'movie'}
                    title={item.title || item.name || item.original_title || item.original_name || ''}
                    posterPath={item.poster_path}
                    rating={item.vote_average}
                    releaseDate={item.media_type === 'tv' ? item.first_air_date : item.release_date}
                    className="w-40 shrink-0"
                  />
                ))}
              </Carousel>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
