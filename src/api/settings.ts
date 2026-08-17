import { invoke } from '@tauri-apps/api/core';

const STORE_FILE = 'settings.json';

export type AppSettings = {
  hideUnsafe: boolean;
  hideXxx: boolean;
  vlcPath: string;
  downloadPath: string;
  clearStreamingOnExit: boolean;
  downloadLimit: number;
  uploadLimit: number;
  streamingRegion: string;
  streamingProviders: number[];
  notificationsEnabled: boolean;
  downloadsSortBy: string;
  favoritesSortBy: string;
  watchlistSortBy: string;
  tmdbApiKey: string;
};

export const DEFAULTS: AppSettings = {
  hideUnsafe: true,
  hideXxx: true,
  vlcPath: '',
  downloadPath: '',
  clearStreamingOnExit: true,
  downloadLimit: 0,
  uploadLimit: 0,
  streamingRegion: 'IT',
  streamingProviders: [350],
  notificationsEnabled: true,
  downloadsSortBy: 'time-added',
  favoritesSortBy: 'alphabetical',
  watchlistSortBy: 'alphabetical',
  tmdbApiKey: '',
};

// The plugin-store swallowed disk-read failures and returned defaults, which
// then overwrote intact files on the next save. It has been replaced with
// direct atomic reads/writes to the app data dir: a file is only ever written
// after its content has been successfully read (or confirmed absent), and
// failed reads block writes instead of clobbering existing data.
let ready = false;
let firstRun = false;
let current: AppSettings = { ...DEFAULTS };
let loadPromise: Promise<AppSettings> | null = null;
let backgroundRetry = false;
const listeners = new Set<() => void>();

const RETRY_MS = 800;
const MAX_BLOCKING_ATTEMPTS = 10;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function notify(): void {
  listeners.forEach((cb) => cb());
}

export function onSettingsReady(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/// Push settings that came off disk into the backend. Only safe to call once
/// `settingsAreReady()` is true — otherwise defaults would clobber real state.
export function applySettingsToBackend(s: AppSettings): void {
  invoke('set_tmdb_api_key', { key: s.tmdbApiKey || '' }).catch(console.error);
  invoke('update_clear_streaming_setting', { value: s.clearStreamingOnExit }).catch(console.error);
  invoke('update_ratelimits', { downloadKbps: s.downloadLimit, uploadKbps: s.uploadLimit }).catch(console.error);
  if (s.downloadPath) {
    invoke('set_download_path', { path: s.downloadPath }).catch(console.error);
  }
}

type ParseResult =
  | { kind: 'ok'; settings: AppSettings }
  | { kind: 'empty' }
  | { kind: 'corrupt' };

function parseSettingsFile(raw: string): ParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { kind: 'corrupt' };
  }
  if (!parsed || typeof parsed !== 'object') return { kind: 'corrupt' };
  const candidate = (parsed as Record<string, unknown>).settings;
  if (candidate && typeof candidate === 'object') {
    return { kind: 'ok', settings: { ...DEFAULTS, ...(candidate as Record<string, unknown>) } };
  }
  // Valid JSON but no "settings" key: nothing was persisted yet.
  return { kind: 'empty' };
}

type LoadAttempt =
  | { ok: true; settings: AppSettings }
  | { ok: false; transient: boolean };

async function attemptLoad(): Promise<LoadAttempt> {
  let raw: string | null;
  try {
    raw = await invoke<string | null>('read_app_data_file', { name: STORE_FILE });
  } catch {
    // Real I/O error (e.g. transient FD exhaustion) — retry later.
    return { ok: false, transient: true };
  }
  if (raw === null) {
    // File absent = fresh install, nothing to preserve.
    if (!ready) {
      ready = true;
      firstRun = true;
      notify();
    }
    return { ok: true, settings: DEFAULTS };
  }
  const parsed = parseSettingsFile(raw);
  if (parsed.kind === 'corrupt') {
    // A corrupt file will not heal on its own — stop retrying but keep writes
    // blocked so it is never overwritten blindly.
    return { ok: false, transient: false };
  }
  if (!ready) {
    ready = true;
    notify();
  }
  return { ok: true, settings: parsed.kind === 'ok' ? parsed.settings : DEFAULTS };
}

async function loadImpl(): Promise<AppSettings> {
  for (let attempts = 0; attempts < MAX_BLOCKING_ATTEMPTS; attempts += 1) {
    const attempt = await attemptLoad();
    if (attempt.ok) {
      current = attempt.settings;
      return current;
    }
    if (!attempt.transient) break;
    await sleep(RETRY_MS);
  }
  // Give up for now and return a best-effort value (possibly defaults)
  // WITHOUT marking the store ready, so writes stay blocked. A background
  // retry keeps trying so a transient failure later resolves on its own.
  scheduleBackgroundRetry();
  return current;
}

function scheduleBackgroundRetry(): void {
  if (backgroundRetry) return;
  backgroundRetry = true;
  const loop = async () => {
    while (!ready) {
      const attempt = await attemptLoad();
      if (attempt.ok) break;
      if (!attempt.transient) break;
      await sleep(RETRY_MS);
    }
    backgroundRetry = false;
  };
  void loop();
}

export function settingsAreReady(): boolean {
  return ready;
}

/// Force-write a settings file to disk. Only intended for explicit in-app
/// recovery (corrupt settings), where the user confirms discarding the broken
/// file. Unblocks further reading/writing once complete.
export async function resetSettingsFile(settings: AppSettings = DEFAULTS): Promise<void> {
  await invoke('write_app_data_file_atomic', {
    name: STORE_FILE,
    content: JSON.stringify({ settings }),
  });
  current = settings;
  ready = true;
  notify();
}

export async function loadSettings(): Promise<AppSettings> {
  if (!loadPromise) {
    loadPromise = loadImpl().finally(() => {
      loadPromise = null;
    });
  }
  return loadPromise;
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  if (!ready) {
    throw new Error(
      "Impostazioni non ancora caricate da disco: scrittura bloccata per evitare di sovrascrivere i dati esistenti."
    );
  }
  current = settings;
  await invoke('write_app_data_file_atomic', {
    name: STORE_FILE,
    content: JSON.stringify({ settings }),
  });
}

/// Only on the very first launch (no settings file existed yet): if the VLC
/// path is still unset, auto-detect the platform-standard VLC location and
/// persist it. No-op on any subsequent run.
export async function ensureDefaultVlcPath(): Promise<void> {
  if (!ready || !firstRun || current.vlcPath) return;
  try {
    const { autoDetectVlc } = await import('./torrent');
    const detected = await autoDetectVlc();
    if (detected) await saveSettings({ ...current, vlcPath: detected });
  } catch (e) {
    console.error('VLC auto-detect failed:', e instanceof Error ? e.message : String(e));
  }
}