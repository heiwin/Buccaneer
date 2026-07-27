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

export async function checkForUpdate(timeoutMs = 10000): Promise<Update | null> {
  const result = await Promise.race([
    check(),
    new Promise<null>(resolve => setTimeout(() => resolve(null), timeoutMs)),
  ]);
  return result;
}
