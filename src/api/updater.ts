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
  const checkPromise = check();
  const result = await new Promise<Update | null | 'timeout'>((resolve, reject) => {
    const timer = setTimeout(() => resolve('timeout'), timeoutMs);
    checkPromise.then(
      (update) => {
        clearTimeout(timer);
        resolve(update);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
  if (result === 'timeout') {
    // The check() branch can still reject after the timeout already resolved;
    // swallow it so it is not reported as an unhandled rejection.
    checkPromise.catch(() => undefined);
    throw new Error('Update check timed out. Check your connection and retry.');
  }
  return result;
}
