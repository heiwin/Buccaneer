import { load, type Store } from '@tauri-apps/plugin-store';

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
  tmdbApiKey: '',
};

let storeInstance: Store | null = null;

async function getStore(): Promise<Store> {
  if (!storeInstance) {
    storeInstance = await load(STORE_FILE, { autoSave: false, defaults: DEFAULTS });
  }
  return storeInstance;
}

export async function loadSettings(): Promise<AppSettings> {
  try {
    const store = await getStore();
    const stored = await store.get<AppSettings>('settings');
    return stored ? { ...DEFAULTS, ...stored } : DEFAULTS;
  } catch (e: unknown) {
    console.warn('Store not available yet, using defaults:', e instanceof Error ? e.message : String(e));
    return DEFAULTS;
  }
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  const store = await getStore();
  await store.set('settings', settings);
  await store.save();
}
