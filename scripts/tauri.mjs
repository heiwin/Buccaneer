import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(rootDir);

const expandHome = (val) =>
  typeof val !== 'string' ? val : val.replaceAll('$HOME', process.env.HOME ?? os.homedir());

// Load .env (expand $HOME), without overriding already-set environment variables.
const envPath = path.join(rootDir, '.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq);
    if (process.env[key] !== undefined) continue;
    process.env[key] = expandHome(trimmed.slice(eq + 1));
  }
}

// Updater signing expects the private key *content* (a base64 string), not a
// file path. Resolve the key file we have and load its contents.
let privateKeyFile = process.env.TAURI_SIGNING_PRIVATE_KEY_PATH;
if (!privateKeyFile && process.env.TAURI_SIGNING_PRIVATE_KEY && existsSync(process.env.TAURI_SIGNING_PRIVATE_KEY)) {
  privateKeyFile = process.env.TAURI_SIGNING_PRIVATE_KEY;
}
if (privateKeyFile) {
  process.env.TAURI_SIGNING_PRIVATE_KEY = readFileSync(privateKeyFile, 'utf8').trim();
}

const tauriCli = path.join(rootDir, 'node_modules', '@tauri-apps', 'cli', 'tauri.js');
const result = spawnSync(process.execPath, [tauriCli, ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: process.env,
});
process.exit(result.status ?? 1);