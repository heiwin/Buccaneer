import { useState, useEffect } from 'react';
import { Search, Settings, Save, RotateCcw, Shield, ShieldOff, Trash2, FolderOpen, RefreshCw, HardDrive } from 'lucide-react';
import { loadSettings, saveSettings, DEFAULTS, settingsAreReady, onSettingsReady, resetSettingsFile, type AppSettings } from '../api/settings';
import { invoke } from '@tauri-apps/api/core';
import { appDataDir } from '@tauri-apps/api/path';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { open as openUrl } from '@tauri-apps/plugin-shell';
import { autoDetectVlc, openInFileManager } from '../api/torrent';
import { Input, Button, Toggle, Select, PageHeader, ConfirmDialog } from '../components/ui';
import { EmptyState } from '../components';
import { clearTmdbCache } from '../api/tmdb';
import { useLibrary } from '../lib/LibraryContext';
import { STREAMING_PROVIDERS, REGIONS } from '../constants/streaming';

export function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULTS);
  const [saved, setSaved] = useState(false);
  const [settingsReady, setSettingsReady] = useState(settingsAreReady());
  const [apiKey, setApiKey] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [appCachePath, setAppCachePath] = useState('');

  // Load from store on mount
  useEffect(() => {
    loadSettings().then((s) => {
      setSettings(s);
      setApiKey(s.tmdbApiKey || '');
      setSettingsReady(settingsAreReady());
      invoke('update_clear_streaming_setting', { value: s.clearStreamingOnExit }).catch(console.error);
    });
    appDataDir().then(setAppCachePath).catch(console.error);
    const unsubscribe = onSettingsReady(() => {
      setSettingsReady(true);
      loadSettings().then((s) => {
        setSettings(s);
        setApiKey(s.tmdbApiKey || '');
      });
    });
    return unsubscribe;
  }, []);

  const handleSave = async () => {
    if (!settingsReady) return;
    try {
      // Merge with the latest persisted settings so changes made on other pages
      // (e.g. favorites/downloads sort) are not clobbered by this form's snapshot.
      const latest = await loadSettings();
      await saveSettings({
        ...latest,
        hideUnsafe: settings.hideUnsafe,
        hideXxx: settings.hideXxx,
        vlcPath: settings.vlcPath,
        downloadPath: settings.downloadPath,
        clearStreamingOnExit: settings.clearStreamingOnExit,
        downloadLimit: settings.downloadLimit,
        uploadLimit: settings.uploadLimit,
        streamingRegion: settings.streamingRegion,
        streamingProviders: settings.streamingProviders,
        notificationsEnabled: settings.notificationsEnabled,
        tmdbApiKey: apiKey,
      });
      await invoke('update_clear_streaming_setting', { value: settings.clearStreamingOnExit }).catch(console.error);
      await invoke('update_ratelimits', { downloadKbps: settings.downloadLimit, uploadKbps: settings.uploadLimit }).catch(console.error);
      await invoke('set_tmdb_api_key', { key: apiKey }).catch(console.error);
      await invoke('set_download_path', { path: settings.downloadPath }).catch(console.error);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e: unknown) {
      console.error('Failed to save settings:', e instanceof Error ? e.message : String(e));
    }
  };

  const handleReset = () => {
    setSettings(DEFAULTS);
  };

  const handleRecoverSettings = async () => {
    try {
      // Explicit user-confirmed recovery: overwrite the unreadable file so the
      // app becomes usable again and saves are unblocked.
      await resetSettingsFile(DEFAULTS);
      setSettings(DEFAULTS);
      setApiKey(DEFAULTS.tmdbApiKey);
      setSettingsReady(true);
    } catch (e: unknown) {
      console.error('Failed to reset settings file:', e instanceof Error ? e.message : String(e));
    }
  };

  const handleBrowseVlc = async () => {
    const selected = await openDialog({
      directory: false,
      multiple: false,
    });
    if (selected && typeof selected === 'string') {
      setSettings(s => ({ ...s, vlcPath: selected }));
    }
  };

  // Maintenance
  const { resetLibrary } = useLibrary();
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [settingsResetConfirm, setSettingsResetConfirm] = useState(false);
  const [cacheCleared, setCacheCleared] = useState(false);
  const [vlcDetectDialog, setVlcDetectDialog] = useState(false);

  const handleClearCache = () => {
    clearTmdbCache();
    setCacheCleared(true);
    setTimeout(() => setCacheCleared(false), 2000);
  };

  const handleResetLibrary = () => {
    resetLibrary();
  };

  const SECTION_KEYWORDS: Record<string, string[]> = {
    tmdb: ['tmdb', 'api', 'key', 'metadata'],
    system: ['system', 'download', 'folder', 'vlc', 'path', 'clear', 'streaming', 'notifications', 'network', 'limits', 'upload'],
    filters: ['search', 'filters', 'unsafe', 'adult', 'xxx', 'hide'],
    streaming: ['streaming', 'region', 'provider', 'trending'],
    maintenance: ['maintenance', 'cache', 'library', 'reset', 'metadata'],
  };

  function matchesSearch(id: string, ...texts: string[]): boolean {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const keywords = SECTION_KEYWORDS[id] ?? [];
    return [...keywords, ...texts].some(t => t.toLowerCase().includes(q));
  }

  const showTmdb = matchesSearch('tmdb', 'TMDB API Key', 'Used to fetch movie and TV metadata', 'themoviedb.org');
  const showSystem = matchesSearch('system', 'System', 'Configure default download folder and VLC player path', 'Download Folder', 'VLC Executable Path', 'Clear /Streaming folder on exit', 'Network Limits', 'Download notifications', 'Download Limit', 'Upload Limit');
  const showFilters = matchesSearch('filters', 'Search Filters', 'Applied to all Knaben torrent searches', 'Hide unsafe results', 'Hide adult content', 'Filters out very old results');
  const showStreaming = matchesSearch('streaming', 'Streaming', 'Choose your region', 'Streaming Region', 'Show trending from');
  const showMaintenance = matchesSearch('maintenance', 'Maintenance', 'Manage cached metadata and local library data', 'Clear Metadata Cache', 'Reset Library', 'Remove cached movie and TV information', 'Permanently remove all favorites');
  const hasVisibleSections = showTmdb || showSystem || showFilters || showStreaming || showMaintenance;

  return (
    <div className="p-8 max-w-2xl">
      <PageHeader icon={Settings} title="Settings" className="mb-10" />

      <div className="mb-6 max-w-md">
        <Input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search settings…"
          icon={<Search size={15} />}
          className="rounded-full"
        />
      </div>

      <div className="space-y-8">
        {/* TMDB API Key */}
        {showTmdb && (
        <section className="bg-zinc-900/50 border border-zinc-800/60 rounded-2xl p-6">
          <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-400 mb-1">TMDB API Key</h2>
          <p className="text-xs text-zinc-600 mb-4">
            Used to fetch movie and TV metadata. Get your key at{' '}
            <a
              href="#"
              onClick={(e) => { e.preventDefault(); openUrl('https://www.themoviedb.org/settings/api'); }}
              className="text-zinc-500 hover:text-zinc-300 underline underline-offset-2 cursor-pointer"
            >
              themoviedb.org/settings/api
            </a>
          </p>
          <Input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Leave empty for default key"
            className="font-mono"
          />
        </section>
        )}

        {/* System Settings */}
        {showSystem && (
        <section className="bg-zinc-900/50 border border-zinc-800/60 rounded-2xl p-6">
          <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-400 mb-1">System</h2>
          <p className="text-xs text-zinc-600 mb-5">
            Configure default download folder and VLC player path.
          </p>

          <div className="space-y-6">
            {/* Download Folder */}
            <div>
              <label className="text-[10px] text-gray-400 font-black uppercase tracking-widest block ml-1 mb-1.5">
                Download Folder
              </label>
              <div className="flex gap-2 items-center">
                <Input
                  type="text"
                  value={settings.downloadPath}
                  onChange={(e) => setSettings((s) => ({ ...s, downloadPath: e.target.value }))}
                  placeholder="Leave empty for default (~/Downloads/Buccaneer)"
                  className="font-mono"
                />
                <Button
                  variant="accent"
                  size="md"
                  icon={FolderOpen}
                  onClick={async () => {
                    const selected = await openDialog({ directory: true, multiple: false });
                    if (selected && typeof selected === 'string') {
                      setSettings(s => ({ ...s, downloadPath: selected }));
                    }
                  }}
                  className="whitespace-nowrap"
                >
                  Browse
                </Button>
              </div>
            </div>

            {/* VLC Path */}
            <div>
              <label className="text-[10px] text-gray-400 font-black uppercase tracking-widest block ml-1 mb-1.5">
                VLC Executable Path
              </label>
              <div className="flex gap-2 items-center">
                <Input
                  type="text"
                  value={settings.vlcPath}
                  onChange={(e) => setSettings((s) => ({ ...s, vlcPath: e.target.value }))}
                  placeholder="Auto-detected if left empty"
                  className="font-mono"
                />
                <Button
                  variant="accent"
                  size="md"
                  onClick={async () => {
                    const detected = await autoDetectVlc();
                    if (detected) {
                      setSettings(s => ({ ...s, vlcPath: detected }));
                    } else {
                      setVlcDetectDialog(true);
                    }
                  }}
                  className="whitespace-nowrap"
                >
                  Auto-Detect
                </Button>
                <Button
                  variant="accent"
                  size="md"
                  icon={FolderOpen}
                  onClick={handleBrowseVlc}
                  className="whitespace-nowrap"
                >
                  Browse
                </Button>
              </div>
            </div>

            {/* Clear Streaming Folder on Exit */}
            <div className="border-t border-zinc-800/60 pt-6 mt-6">
              <label className="flex items-center justify-between cursor-pointer group">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-xl ${settings.clearStreamingOnExit ? 'bg-white/10' : 'bg-zinc-800'}`}>
                    <Trash2 size={16} className={settings.clearStreamingOnExit ? "text-white" : "text-zinc-500"} />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-200">Clear /Streaming folder on exit</p>
                    <p className="text-xs text-zinc-500">Automatically deletes all streamed files when closing the app</p>
                  </div>
                </div>
                <Toggle
                  checked={settings.clearStreamingOnExit}
                  onChange={(v) => setSettings((s) => ({ ...s, clearStreamingOnExit: v }))}
                />
              </label>
            </div>

            {/* Network Limits */}
            <div className="border-t border-zinc-800/60 pt-6 mt-6">
              <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-400 mb-4">Network Limits (KB/s)</h3>
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Download Limit"
                  type="number"
                  min="0"
                  step="0.1"
                  value={settings.downloadLimit.toString()}
                  onChange={(e) => setSettings((s) => ({ ...s, downloadLimit: parseFloat(e.target.value) || 0 }))}
                  placeholder="0 (Unlimited)"
                  className="font-mono"
                />
                <Input
                  label="Upload Limit"
                  type="number"
                  min="0"
                  step="0.1"
                  value={settings.uploadLimit.toString()}
                  onChange={(e) => setSettings((s) => ({ ...s, uploadLimit: parseFloat(e.target.value) || 0 }))}
                  placeholder="0 (Unlimited)"
                  className="font-mono"
                />
              </div>
              <p className="text-[10px] text-zinc-500 mt-2">Set to 0 for unlimited speed.</p>
            </div>

            {/* Download Notifications */}
            <div className="border-t border-zinc-800/60 pt-6 mt-6">
              <label className="flex items-center justify-between cursor-pointer group">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-xl ${settings.notificationsEnabled ? 'bg-white/10' : 'bg-zinc-800'}`}>
                    <HardDrive size={16} className={settings.notificationsEnabled ? "text-white" : "text-zinc-500"} />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-200">Download notifications</p>
                    <p className="text-xs text-zinc-500">Show a system notification when a download completes</p>
                  </div>
                </div>
                <Toggle
                  checked={settings.notificationsEnabled}
                  onChange={(v) => setSettings((s) => ({ ...s, notificationsEnabled: v }))}
                />
              </label>
            </div>
          </div>
        </section>
        )}

        {/* Search Filters */}
        {showFilters && (
        <section className="bg-zinc-900/50 border border-zinc-800/60 rounded-2xl p-6">
          <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-400 mb-1">Search Filters</h2>
          <p className="text-xs text-zinc-600 mb-5">
            Applied to all Knaben torrent searches.
          </p>

          <div className="space-y-4">
            {/* Hide Unsafe */}
            <label className="flex items-center justify-between cursor-pointer group">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-xl ${settings.hideUnsafe ? 'bg-white/10' : 'bg-zinc-800'}`}>
                  {settings.hideUnsafe
                    ? <Shield size={16} className="text-white" />
                    : <ShieldOff size={16} className="text-zinc-500" />
                  }
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-200">Hide unsafe results</p>
                  <p className="text-xs text-zinc-500">Filters out very old results and high virus-score entries</p>
                </div>
              </div>
              <Toggle
                checked={settings.hideUnsafe}
                onChange={(v) => setSettings((s) => ({ ...s, hideUnsafe: v }))}
              />
            </label>

            {/* Hide XXX */}
            <label className="flex items-center justify-between cursor-pointer group">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-xl ${settings.hideXxx ? 'bg-white/10' : 'bg-zinc-800'}`}>
                  {settings.hideXxx
                    ? <Shield size={16} className="text-white" />
                    : <ShieldOff size={16} className="text-zinc-500" />
                  }
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-200">Hide adult content</p>
                  <p className="text-xs text-zinc-500">Filters out XXX / pornographic results</p>
                </div>
              </div>
              <Toggle
                checked={settings.hideXxx}
                onChange={(v) => setSettings((s) => ({ ...s, hideXxx: v }))}
              />
            </label>
          </div>
        </section>
        )}

        {/* Streaming */}
        {showStreaming && (
        <section className="bg-zinc-900/50 border border-zinc-800/60 rounded-2xl p-6">
          <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-400 mb-1">Streaming</h2>
          <p className="text-xs text-zinc-600 mb-5">
            Choose your region and which streaming providers to show on the home page.
          </p>

          <div className="mb-6">
            <Select
              label="Streaming Region"
              options={REGIONS.map(r => ({ value: r.value, label: r.label }))}
              value={settings.streamingRegion}
               onChange={(e) => setSettings(s => ({ ...s, streamingRegion: e.target.value as string }))}
              size="sm"
            />
          </div>

          <label className="text-[10px] text-gray-400 font-black uppercase tracking-widest block ml-1 mb-3">
            Show trending from
          </label>
          <div className="space-y-3">
            {Object.entries(STREAMING_PROVIDERS).map(([name, id]) => (
              <label key={id} className="flex items-center justify-between cursor-pointer group">
                <span className="text-sm text-gray-300">{name}</span>
                <Toggle
                  checked={settings.streamingProviders.includes(id)}
                  onChange={(v) => {
                    setSettings(s => ({
                      ...s,
                      streamingProviders: v
                        ? [...s.streamingProviders, id]
                        : s.streamingProviders.filter(p => p !== id),
                    }));
                  }}
                />
              </label>
            ))}
          </div>
        </section>
        )}

        {/* Maintenance */}
        {showMaintenance && (
        <section className="bg-zinc-900/50 border border-zinc-800/60 rounded-2xl p-6">
          <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-400 mb-1">Maintenance</h2>
          <p className="text-xs text-zinc-600 mb-5">
            Manage cached metadata and local library data.
          </p>

          {/* Clear Cache */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-zinc-800">
                <RefreshCw size={16} className="text-zinc-500" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-200">Clear Metadata Cache</p>
                <p className="text-xs text-zinc-500">
                  Remove cached movie and TV information to force fresh data on next load.
                </p>
              </div>
            </div>
            <Button
              variant="accent"
              size="sm"
              onClick={handleClearCache}
              className={cacheCleared ? '!bg-emerald-500/20 !border !border-emerald-500/40 !text-emerald-400' : ''}
            >
              {cacheCleared ? 'Cleared!' : 'Clear'}
            </Button>
          </div>

          {/* Cached Files Folder */}
          {appCachePath && (
            <div className="border-t border-zinc-800/60 pt-5 mt-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-zinc-800">
                    <FolderOpen size={16} className="text-zinc-500" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-200">Cached Files</p>
                    <p className="text-xs text-zinc-500">
                      App data directory containing cached metadata and torrent state.
                    </p>
                  </div>
                </div>
              </div>
              <button
                onClick={() => openInFileManager(appCachePath)}
                className="mt-3 flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
                title="Open in file manager"
              >
                <FolderOpen size={12} />
                <span className="truncate font-mono">{appCachePath}</span>
              </button>
            </div>
          )}

          {/* Reset Library */}
          <div className="border-t border-zinc-800/60 pt-5 mt-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-rose-500/10">
                  <Trash2 size={16} className="text-rose-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-200">Reset Library</p>
                  <p className="text-xs text-zinc-500">
                    Permanently remove all favorites and watched history.
                  </p>
                </div>
              </div>
              <Button
                variant="danger"
                size="sm"
                onClick={() => setShowResetConfirm(true)}
              >
                Reset
              </Button>
            </div>
          </div>
        </section>
        )}

        {searchQuery.trim() && !hasVisibleSections && (
          <EmptyState icon={Search} message={`No settings match "${searchQuery}"`} subMessage="Try a different search term" />
        )}

        {/* Actions */}
        {!settingsReady && (
          <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs p-3 mb-6">
            <p>
              Impossibile caricare le impostazioni salvate da disco: le modifiche sono bloccate per
              evitare di sovrascrivere i dati esistenti. Verifica che il file{' '}
              <code className="font-mono">settings.json</code> sia leggibile, oppure ripristina i
              valori di default.
            </p>
            <Button
              variant="danger"
              size="sm"
              icon={RotateCcw}
              className="mt-3"
              onClick={() => setSettingsResetConfirm(true)}
            >
              Reset settings file to defaults
            </Button>
          </div>
        )}
        <div className="flex items-center gap-3">
          <Button
            variant={saved ? 'primary' : 'primary'}
            icon={Save}
            onClick={handleSave}
            disabled={!settingsReady}
            className={saved ? '!bg-emerald-500/20 !border !border-emerald-500/40 !text-emerald-400' : ''}
          >
            {saved ? 'Saved!' : 'Save Settings'}
          </Button>
          <Button
            variant="accent"
            icon={RotateCcw}
            onClick={handleReset}
          >
            Reset to defaults
          </Button>
        </div>
      </div>

      <ConfirmDialog
        isOpen={showResetConfirm}
        onClose={() => setShowResetConfirm(false)}
        onConfirm={handleResetLibrary}
        title="Reset Library"
        message="This will permanently delete all your favorites and watched history. This action cannot be undone."
        confirmLabel="Reset Library"
        kind="danger"
      />

      <ConfirmDialog
        isOpen={settingsResetConfirm}
        onClose={() => setSettingsResetConfirm(false)}
        onConfirm={() => {
          setSettingsResetConfirm(false);
          handleRecoverSettings();
        }}
        title="Reset Settings File"
        message="The settings file could not be read. This will permanently overwrite settings.json with the default values. This action cannot be undone."
        confirmLabel="Overwrite with defaults"
        kind="danger"
      />

      <ConfirmDialog
        isOpen={vlcDetectDialog}
        onClose={() => setVlcDetectDialog(false)}
        onConfirm={() => setVlcDetectDialog(false)}
        title="VLC Detection Failed"
        message="Could not auto-detect VLC path. Please enter it manually."
        confirmLabel="OK"
        kind="info"
        hideCancel
      />
    </div>
  );
}
