import { check } from '@tauri-apps/plugin-updater';
import type { Update } from '@tauri-apps/plugin-updater';

export type UpdateState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'available'; update: Update }
  | { status: 'downloading'; progress: number; total: number }
  | { status: 'downloaded'; update: Update }
  | { status: 'installing' }
  | { status: 'error'; message: string };

export type { Update } from '@tauri-apps/plugin-updater';

export async function checkForUpdate(): Promise<Update | null> {
  return check();
}
