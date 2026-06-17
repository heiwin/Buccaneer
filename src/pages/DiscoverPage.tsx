import { useState, useEffect, useRef } from 'react';
import { Compass } from 'lucide-react';
import { discoverMedia, getGenres } from '../api/tmdb';
import { loadSettings } from '../api/settings';
import { STREAMING_PROVIDERS } from '../constants/streaming';
import { Select, SegmentedControl, Button, PageHeader, Spinner, ErrorBanner } from '../components/ui';
import type { SelectOption } from '../components/ui';
import type { TMDBListItem } from '../types/tmdb';
import { MediaCard } from '../components';

type MediaType = 'movie' | 'tv';

interface Genre {
  id: number;
  name: string;
}

export function DiscoverPage() {
  const [mediaType, setMediaType] = useState<MediaType>('movie');
  const [genres, setGenres] = useState<Genre[]>([]);
  const [selectedGenre, setSelectedGenre] = useState<number | null>(null);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [selectedRating, setSelectedRating] = useState<number | null>(null);
  const [selectedLanguage, setSelectedLanguage] = useState<string | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<string>('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [results, setResults] = useState<TMDBListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [watchRegion, setWatchRegion] = useState('IT');

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 40 }, (_, i) => currentYear - i);

  // Genre options for Select
  const genreOptions: SelectOption[] = [
    { value: '', label: 'All Genres' },
    ...genres.map((g) => ({ value: g.id.toString(), label: g.name })),
  ];

  // Year options for Select
  const yearOptions: SelectOption[] = [
    { value: '', label: 'Any year' },
    ...years.map((y) => ({ value: y.toString(), label: y.toString() })),
  ];

  // Rating options
  const ratingOptions: SelectOption[] = [
    { value: '', label: 'Any Rating' },
    { value: '9', label: '9+ (Masterpiece)' },
    { value: '8', label: '8+ (Great)' },
    { value: '7', label: '7+ (Good)' },
    { value: '6', label: '6+ (Okay)' },
    { value: '5', label: '5+ (Mediocre)' },
  ];

  // Language options
  const languageOptions: SelectOption[] = [
    { value: '', label: 'Any Language' },
    { value: 'en', label: 'English' },
    { value: 'it', label: 'Italian' },
    { value: 'es', label: 'Spanish' },
    { value: 'fr', label: 'French' },
    { value: 'ja', label: 'Japanese' },
    { value: 'ko', label: 'Korean' },
  ];

  // Derived from STREAMING_PROVIDERS in constants/streaming.ts — single source of truth
  const PROVIDER_OPTIONS: SelectOption[] = [
    { value: '', label: 'Any Platform' },
    ...Object.entries(STREAMING_PROVIDERS).map(([name, id]) => ({
      value: id.toString(),
      label: name,
    })),
  ];

  // Load user settings (watch region) once on mount
  useEffect(() => {
    loadSettings().then((s) => {
      if (s.streamingRegion) setWatchRegion(s.streamingRegion);
    }).catch(console.error);
  }, []);

  // Load genres when mediaType changes, also reset filters
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedGenre(null);
    setSelectedYear(null);
    setSelectedRating(null);
    setSelectedLanguage(null);
    setSelectedProvider('');
    setPage(1);
    getGenres(mediaType)
      .then((res) => setGenres(res.genres || []))
      .catch(console.error);
  }, [mediaType]);

  // Load results
  useEffect(() => {
    setLoading(true);
    setError(null);
    discoverMedia(mediaType, selectedGenre, selectedYear, page, selectedRating, selectedLanguage, selectedProvider || null, watchRegion || null, null)
      .then((res) => {
        setResults(res.results || []);
        setTotalPages(Math.min(res.total_pages, 500));
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [mediaType, selectedGenre, selectedYear, page, selectedRating, selectedLanguage, selectedProvider, watchRegion]);

  // Detect grid column count to avoid incomplete rows
  const gridRef = useRef<HTMLDivElement>(null);
  const [columnCount, setColumnCount] = useState(() => {
    if (typeof window === 'undefined') return 6;
    const w = window.innerWidth;
    if (w >= 1280) return 6;
    if (w >= 1024) return 5;
    if (w >= 768) return 4;
    if (w >= 640) return 3;
    return 2;
  });

  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      const cols = getComputedStyle(el).gridTemplateColumns.split(' ').length;
      if (cols > 0) setColumnCount(cols);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [results]);

  const visibleCount = Math.floor(results.length / columnCount) * columnCount;

  return (
    <div className="p-8">
      {/* Header */}
      <header className="mb-8">
        <PageHeader icon={Compass} title="Discover" className="mb-6" />

        {/* Media type toggle */}
        <SegmentedControl
          options={[
            { value: 'movie', label: 'Movies' },
            { value: 'tv', label: 'TV Series' },
          ]}
          value={mediaType}
          onChange={(v) => { setMediaType(v as MediaType); setPage(1); }}
          className="w-fit mb-4"
        />

        {/* Filters */}
        <div className="flex flex-col md:flex-row gap-4 flex-wrap mb-4">
          {/* Genre filter */}
          <Select
            label="Genre"
            options={genreOptions}
            value={selectedGenre?.toString() ?? ''}
            onChange={(e) => {
              const v = e.target.value as string;
              setSelectedGenre(v ? Number(v) : null);
              setPage(1);
            }}
            placeholder="All Genres"
            size="sm"
            className="w-full md:w-56"
          />

          {/* Year filter */}
          <Select
            label="Year"
            options={yearOptions}
            value={selectedYear?.toString() ?? ''}
            onChange={(e) => {
              const v = e.target.value as string;
              setSelectedYear(v ? Number(v) : null);
              setPage(1);
            }}
            placeholder="Any year"
            size="sm"
            className="w-full md:w-36"
          />

          {/* Rating filter */}
          <Select
            label="Rating"
            options={ratingOptions}
            value={selectedRating?.toString() ?? ''}
            onChange={(e) => {
              const v = e.target.value as string;
              setSelectedRating(v ? Number(v) : null);
              setPage(1);
            }}
            placeholder="Any Rating"
            size="sm"
            className="w-full md:w-40"
          />

          {/* Language filter */}
          <Select
            label="Language"
            options={languageOptions}
            value={selectedLanguage ?? ''}
            onChange={(e) => {
              const v = e.target.value as string;
              setSelectedLanguage(v || null);
              setPage(1);
            }}
            placeholder="Any Language"
            size="sm"
            className="w-full md:w-40"
          />

          {/* Platform filter */}
          <Select
            label="Platform"
            options={PROVIDER_OPTIONS}
            value={selectedProvider}
            onChange={(e) => {
              setSelectedProvider(e.target.value as string);
              setPage(1);
            }}
            placeholder="Any Platform"
            size="sm"
            className="w-full md:w-48"
          />
        </div>
      </header>

      {/* Error */}
      {error && <ErrorBanner error={error} className="mb-8" />}

      {/* Loading */}
      {loading && (
        <Spinner size="lg" className="h-64" />
      )}

      {/* Grid */}
      {!loading && !error && (
        <>
          <div ref={gridRef} className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5 pb-8">
            {results.slice(0, visibleCount).map((item) => (
              <MediaCard
                key={item.id}
                id={item.id}
                mediaType={mediaType}
                title={mediaType === 'movie' ? (item.title || item.original_title || '') : (item.name || item.original_name || '')}
                posterPath={item.poster_path}
                rating={item.vote_average}
                releaseDate={mediaType === 'movie' ? item.release_date : item.first_air_date}
              />
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-4 pb-20">
              <Button
                variant="accent"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                Prev
              </Button>
              <span className="text-sm text-zinc-500">
                Page <span className="text-white font-semibold">{page}</span> of {totalPages}
              </span>
              <Button
                variant="accent"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
              >
                Next
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
