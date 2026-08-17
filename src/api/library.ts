import { invoke } from '@tauri-apps/api/core';

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

export const EMPTY_LIBRARY: LibraryData = {
  favorites: [],
  watched: {},
};

// ─── Loader ──────────────────────────────────────────────────────────────────

// Same fail-safe philosophy as settings.ts: the file is only ever overwritten
// after its content has been confirmed on disk, otherwise writes are blocked.
let ready = false;
let current: LibraryData = { favorites: [], watched: {} };
let loadPromise: Promise<LibraryData> | null = null;
let backgroundRetry = false;
const listeners = new Set<() => void>();

const RETRY_MS = 2000;
const MAX_BLOCKING_ATTEMPTS = 6;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function notify(): void {
  listeners.forEach((cb) => cb());
}

export function libraryIsReady(): boolean {
  return ready;
}

export function onLibraryReady(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function isValidLibraryData(data: unknown): data is LibraryData {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  return Array.isArray(d.favorites) && typeof d.watched === 'object' && d.watched !== null;
}

function extractLibrary(raw: string): LibraryData | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const candidate = (parsed as Record<string, unknown>).library ?? parsed;
    if (isValidLibraryData(candidate)) {
      return { ...EMPTY_LIBRARY, ...(candidate as LibraryData) };
    }
    return null;
  } catch {
    return null;
  }
}

async function readLibraryFile(name: string): Promise<string | null | 'error'> {
  try {
    return await invoke<string | null>('read_app_data_file', { name });
  } catch {
    return 'error';
  }
}

function writeLibraryFile(name: string, data: LibraryData): Promise<void> {
  return invoke('write_app_data_file_atomic', {
    name,
    content: JSON.stringify({ library: data }),
  });
}

function markReady(data: LibraryData): void {
  current = data;
  if (!ready) {
    ready = true;
    notify();
  }
}

type LoadAttempt =
  | { ok: true; data: LibraryData }
  | { ok: false; transient: boolean };

async function attemptLoad(): Promise<LoadAttempt> {
  const main = await readLibraryFile(MAIN_FILE);
  if (main === 'error') return { ok: false, transient: true };

  if (main !== null) {
    const data = extractLibrary(main);
    if (data) {
      return { ok: true, data };
    }
    // Main file is corrupt: try the backup before settling anything.
    const backup = await readLibraryFile(BACKUP_FILE);
    if (backup === 'error') return { ok: false, transient: true };
    if (backup !== null) {
      const backupData = extractLibrary(backup);
      if (backupData) {
        writeLibraryFile(MAIN_FILE, backupData).catch(() => {});
        return { ok: true, data: backupData };
      }
    }
    // Both files present but unreadable — definitive, keep writes blocked.
    return { ok: false, transient: false };
  }

  // Main file absent: fall back to backup, otherwise fresh install.
  const backup = await readLibraryFile(BACKUP_FILE);
  if (backup === 'error') return { ok: false, transient: true };
  if (backup !== null) {
    const backupData = extractLibrary(backup);
    if (backupData) {
      writeLibraryFile(MAIN_FILE, backupData).catch(() => {});
      return { ok: true, data: backupData };
    }
  }
  return { ok: true, data: EMPTY_LIBRARY };
}

async function loadImpl(): Promise<LibraryData> {
  for (let attempts = 0; attempts < MAX_BLOCKING_ATTEMPTS; attempts += 1) {
    const attempt = await attemptLoad();
    if (attempt.ok) {
      markReady(attempt.data);
      return current;
    }
    if (!attempt.transient) break;
    await sleep(RETRY_MS);
  }
  // Give up for now and return a best-effort value WITHOUT marking the store
  // ready, so writes stay blocked. A background retry keeps trying so a
  // transient failure later resolves on its own.
  scheduleBackgroundRetry();
  return current;
}

function scheduleBackgroundRetry(): void {
  if (backgroundRetry) return;
  backgroundRetry = true;
  const loop = async () => {
    while (!ready) {
      const attempt = await attemptLoad();
      if (attempt.ok) {
        markReady(attempt.data);
        break;
      }
      if (!attempt.transient) break;
      await sleep(RETRY_MS);
    }
    backgroundRetry = false;
  };
  void loop();
}

export async function loadLibrary(): Promise<LibraryData> {
  if (!loadPromise) {
    loadPromise = loadImpl().finally(() => {
      loadPromise = null;
    });
  }
  return loadPromise;
}

/// Force-write a library to disk and mark it ready. Only intended for explicit
/// in-app recovery (both files unreadable), where the user confirms discarding
/// the broken data. Unblocks further reading/writing once complete.
export async function forceResetLibrary(data: LibraryData = EMPTY_LIBRARY): Promise<void> {
  await writeLibraryFile(BACKUP_FILE, data);
  await writeLibraryFile(MAIN_FILE, data);
  markReady(data);
}

export async function saveLibrary(data: LibraryData): Promise<void> {
  if (!ready) {
    throw new Error(
      "Libreria non ancora caricata da disco: scrittura bloccata per evitare di sovrascrivere i dati esistenti."
    );
  }
  // Backup the last confirmed state before overwriting the main file, so a
  // corrupt write can always be recovered from backup.
  const previous = current;
  try {
    await writeLibraryFile(BACKUP_FILE, previous);
  } catch (e) {
    console.warn('Failed to write library backup:', e);
  }
  await writeLibraryFile(MAIN_FILE, data);
  current = data;
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

// ─── Watchlist ──────────────────────────────────────────────────────────────

export interface WatchedItem {
  mediaType: 'movie' | 'tv';
  id: number;
  watchedAt: number;
}

/// Parse a watched key into its media identity. Only whole-title keys
/// (`movie-{id}`, `tv-{id}`) are "watched titles"; per-episode keys
/// (`tv-{id}-s{s}e{e}`) are finer-grained tracking, not titles.
export function parseWatchedKey(key: string): { mediaType: 'movie' | 'tv'; id: number } | null {
  const movieMatch = key.match(/^movie-(\d+)$/);
  if (movieMatch) return { mediaType: 'movie', id: Number(movieMatch[1]) };
  const tvMatch = key.match(/^tv-(\d+)$/);
  if (tvMatch) return { mediaType: 'tv', id: Number(tvMatch[1]) };
  return null;
}

/// Distinct watched titles derived from the watched map, one entry per media.
export function getWatchedItems(watched: WatchedMap): WatchedItem[] {
  const items = new Map<string, WatchedItem>();
  for (const [key, ts] of Object.entries(watched)) {
    const parsed = parseWatchedKey(key);
    if (!parsed) continue;
    const mapKey = `${parsed.mediaType}-${parsed.id}`;
    const existing = items.get(mapKey);
    if (!existing || ts > existing.watchedAt) {
      items.set(mapKey, { ...parsed, watchedAt: ts });
    }
  }
  return [...items.values()];
}