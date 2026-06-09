import { load, type Store } from '@tauri-apps/plugin-store';

const LIBRARY_FILE = 'library.json';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FavoriteItem {
  id: number;
  mediaType: 'movie' | 'tv';
  title: string;
  posterPath: string | null;
  rating?: number;
  releaseDate?: string;
  addedAt: number;
}

// key format: "movie-{id}" or "tv-{id}-s{season}e{episode}"
export type WatchedMap = Record<string, number>;

export interface LibraryData {
  favorites: FavoriteItem[];
  watched: WatchedMap;
}

const EMPTY_LIBRARY: LibraryData = {
  favorites: [],
  watched: {},
};

// ─── Store ────────────────────────────────────────────────────────────────────

let storeInstance: Store | null = null;

async function getStore(): Promise<Store> {
  if (!storeInstance) {
    storeInstance = await load(LIBRARY_FILE, { autoSave: false, defaults: {} });
  }
  return storeInstance;
}

export async function loadLibrary(): Promise<LibraryData> {
  try {
    const store = await getStore();
    const data = await store.get<LibraryData>('library');
    return data ? { ...EMPTY_LIBRARY, ...data } : EMPTY_LIBRARY;
  } catch (e: unknown) {
    console.warn('Library store not available, using empty:', e instanceof Error ? e.message : String(e));
    return EMPTY_LIBRARY;
  }
}

export async function saveLibrary(data: LibraryData): Promise<void> {
  const store = await getStore();
  await store.set('library', data);
  await store.save();
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function watchedKeyMovie(movieId: number): string {
  return `movie-${movieId}`;
}

export function watchedKeyMedia(id: number, mediaType: 'movie' | 'tv'): string {
  return `${mediaType}-${id}`;
}

export function watchedKeyEpisode(tvId: number, season: number, episode: number): string {
  return `tv-${tvId}-s${season}e${episode}`;
}
