import { invoke } from '@tauri-apps/api/core';

export interface UpdateInfo {
  available: boolean;
  latestVersion: string;
  downloadUrl: string;
  currentVersion: string;
  error?: string;
}

export async function checkForUpdate(): Promise<UpdateInfo> {
  return await invoke('check_update');
}
