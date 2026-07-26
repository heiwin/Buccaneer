import { invoke } from '@tauri-apps/api/core';
import { load, type Store } from '@tauri-apps/plugin-store';

const MAIN_FILE = 'library.json';
const BACKUP_FILE = 'library.backup.json';

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

let mainStore: Store | null = null;
let backupStore: Store | null = null;

async function getMainStore(): Promise<Store> {
  if (!mainStore) {
    mainStore = await load(MAIN_FILE, { autoSave: false });
  }
  return mainStore;
}

async function getBackupStore(): Promise<Store> {
  if (!backupStore) {
    backupStore = await load(BACKUP_FILE, { autoSave: false });
  }
  return backupStore;
}

function isValidLibraryData(data: unknown): data is LibraryData {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  return Array.isArray(d.favorites) && typeof d.watched === 'object' && d.watched !== null;
}

async function deleteCorruptedStores(): Promise<void> {
  mainStore = null;
  backupStore = null;
  await invoke('delete_library_file');
}

async function restoreFromBackup(data: LibraryData): Promise<void> {
  try {
    await deleteCorruptedStores();
    const main = await getMainStore();
    await main.set('library', data);
    await main.save();
  } catch (e) {
    console.warn('Failed to restore main store from backup:', e);
  }
}

export async function loadLibrary(): Promise<LibraryData> {
  try {
    const store = await getMainStore();
    const data = await store.get<LibraryData>('library');
    if (data && isValidLibraryData(data)) {
      return { ...EMPTY_LIBRARY, ...data };
    }
  } catch (e) {
    console.warn('Main library corrupted, trying backup...', e instanceof Error ? e.message : String(e));
  }

  try {
    const backup = await getBackupStore();
    const data = await backup.get<LibraryData>('library');
    if (data && isValidLibraryData(data)) {
      restoreFromBackup(data).catch(console.warn);
      return { ...EMPTY_LIBRARY, ...data };
    }
  } catch (e2) {
    console.warn('Backup also corrupted, starting fresh', e2 instanceof Error ? e2.message : String(e2));
  }

  return EMPTY_LIBRARY;
}

export async function saveLibrary(data: LibraryData): Promise<void> {
  try {
    const main = await getMainStore();
    const current = await main.get<LibraryData>('library');
    if (current && isValidLibraryData(current)) {
      try {
        const backup = await getBackupStore();
        await backup.set('library', current);
        await backup.save();
      } catch (e) {
        console.warn('Failed to write backup, continuing with save:', e);
      }
    }

    await main.set('library', data);
    await main.save();
  } catch (e) {
    console.warn('Main save failed, attempting recovery...', e);
    try {
      const backup = await getBackupStore();
      const backupData = await backup.get<LibraryData>('library');
      await deleteCorruptedStores();
      const fresh = await getMainStore();

      if (backupData && isValidLibraryData(backupData)) {
        await fresh.set('library', backupData);
        await fresh.save();
      }

      await fresh.set('library', data);
      await fresh.save();
    } catch (e2) {
      console.error('Failed to save library even after recovery:', e2);
      throw e2;
    }
  }
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
