import { invoke } from '@tauri-apps/api/core';
import type { TMDBResponse, TMDBListItem, MovieDetails, TvDetails, SeasonDetails } from '../types/tmdb';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const cache = new Map<string, CacheEntry<unknown>>();
const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes

export function clearTmdbCache(): void {
  cache.clear();
}

async function cachedInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const key = JSON.stringify({ cmd, args });
  const now = Date.now();

  const cached = cache.get(key);
  if (cached && now - cached.timestamp < CACHE_DURATION) {
    return cached.data as T;
  }

  const data = await invoke<T>(cmd, args);
  cache.set(key, { data, timestamp: now });
  return data;
}

// ─── Trending ─────────────────────────────────────────────────────────────────

export async function getTrendingMovies(): Promise<TMDBResponse<TMDBListItem>> {
  return await cachedInvoke('get_trending_movies');
}

export async function getTrendingTvSeries(): Promise<TMDBResponse<TMDBListItem>> {
  return await cachedInvoke('get_trending_tv_series');
}

// ─── Details ──────────────────────────────────────────────────────────────────

export async function getMovieDetails(movieId: number): Promise<MovieDetails> {
  return await cachedInvoke('get_movie_details', { movieId });
}

export async function getTvDetails(tvId: number): Promise<TvDetails> {
  return await cachedInvoke('get_tv_details', { tvId });
}

export async function getTvSeasonDetails(tvId: number, seasonNumber: number): Promise<SeasonDetails> {
  return await cachedInvoke('get_tv_season_details', { tvId, seasonNumber });
}

// ─── Discover ─────────────────────────────────────────────────────────────────

export async function discoverMedia(
  mediaType: 'movie' | 'tv',
  genreId?: number | null,
  year?: number | null,
  page?: number,
  rating?: number | null,
  language?: string | null,
  watchProviders?: string | null,
  watchRegion?: string | null,
  watchMonetizationTypes?: string | null,
): Promise<TMDBResponse<TMDBListItem>> {
  return await cachedInvoke('discover_media', {
    mediaType,
    genreId: genreId ?? null,
    year: year ?? null,
    page: page ?? 1,
    rating: rating ?? null,
    language: language ?? null,
    watchProviders: watchProviders ?? null,
    watchRegion: watchRegion ?? null,
    watchMonetizationTypes: watchMonetizationTypes ?? null,
  });
}

// ─── Genres ───────────────────────────────────────────────────────────────────

export async function getGenres(mediaType: 'movie' | 'tv'): Promise<{ genres: { id: number; name: string }[] }> {
  return await cachedInvoke('get_genres', { mediaType });
}

// ─── Search ───────────────────────────────────────────────────────────────────

export async function searchTMDB(query: string): Promise<TMDBResponse<TMDBListItem>> {
  return await cachedInvoke('search_tmdb', { query });
}

// ─── Image helpers ────────────────────────────────────────────────────────────

export const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p';

export function posterUrl(path: string | null, size: 'w300' | 'w500' | 'original' = 'w500'): string {
  return path
    ? `${TMDB_IMAGE_BASE}/${size}${path}`
    : 'https://placehold.co/500x750/1a1a2e/6b7280?text=No+Image';
}

export function backdropUrl(path: string | null, size: 'w780' | 'w1280' | 'original' = 'w1280'): string {
  return path
    ? `${TMDB_IMAGE_BASE}/${size}${path}`
    : '';
}

export function profileUrl(path: string | null): string {
  return path
    ? `${TMDB_IMAGE_BASE}/w185${path}`
    : `https://placehold.co/185x278/1a1a2e/6b7280?text=N%2FA`;
}
