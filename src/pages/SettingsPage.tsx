import { useState, useEffect } from 'react';
import { Settings, Save, RotateCcw, Eye, EyeOff, Shield, ShieldOff, Trash2, FolderOpen, RefreshCw } from 'lucide-react';
import { loadSettings, saveSettings, DEFAULTS, type AppSettings } from '../api/settings';
import { invoke } from '@tauri-apps/api/core';
import { open, message } from '@tauri-apps/plugin-dialog';
import { autoDetectVlc } from '../api/torrent';
import { Input, Button, Toggle, Select, PageHeader, ConfirmDialog } from '../components/ui';
import { clearTmdbCache } from '../api/tmdb';
import { useLibrary } from '../lib/LibraryContext';
import { STREAMING_PROVIDERS, REGIONS } from '../constants/streaming';

export function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULTS);
  const [saved, setSaved] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);

  // Load from store on mount
  useEffect(() => {
    loadSettings().then((s) => {
      setSettings(s);
      invoke('update_clear_streaming_setting', { value: s.clearStreamingOnExit }).catch(console.error);
    });
  }, []);

  const handleSave = async () => {
    try {
      await saveSettings(settings);
      await invoke('update_clear_streaming_setting', { value: settings.clearStreamingOnExit }).catch(console.error);
      await invoke('update_ratelimits', { downloadKbps: settings.downloadLimit, uploadKbps: settings.uploadLimit }).catch(console.error);
      await invoke('set_tmdb_api_key', { key: settings.tmdbApiKey }).catch(console.error);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e: unknown) {
      console.error('Failed to save settings:', e instanceof Error ? e.message : String(e));
    }
  };

  const handleReset = () => {
    setSettings(DEFAULTS);
  };

  const handleBrowseDownload = async () => {
    const selected = await open({
      directory: true,
      multiple: false,
    });
    if (selected && typeof selected === 'string') {
      setSettings(s => ({ ...s, downloadPath: selected }));
    }
  };

  const handleBrowseVlc = async () => {
    const selected = await open({
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
  const [cacheCleared, setCacheCleared] = useState(false);

  const handleClearCache = () => {
    clearTmdbCache();
    setCacheCleared(true);
    setTimeout(() => setCacheCleared(false), 2000);
  };

  const handleResetLibrary = () => {
    resetLibrary();
  };

  return (
    <div className="p-8 max-w-2xl">
      <PageHeader icon={Settings} title="Settings" className="mb-10" />

      <div className="space-y-8">
        {/* TMDB API Key */}
        <section className="bg-zinc-900/50 border border-zinc-800/60 rounded-2xl p-6">
          <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-400 mb-1">TMDB API Key</h2>
          <p className="text-xs text-zinc-600 mb-4">
            Used to fetch movie and TV metadata. Get your key at{' '}
            <span className="text-zinc-500">themoviedb.org/settings/api</span>
          </p>
          <div className="relative">
            <Input
              type={showApiKey ? 'text' : 'password'}
              value={settings.tmdbApiKey}
              onChange={(e) => setSettings((s) => ({ ...s, tmdbApiKey: e.target.value }))}
              placeholder="Leave empty for default key"
              className="font-mono pr-12"
            />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowApiKey((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors z-10 w-auto h-auto p-1 bg-transparent hover:bg-transparent"
              icon={showApiKey ? EyeOff : Eye}
            />
          </div>
        </section>

        {/* System Settings */}
        <section className="bg-zinc-900/50 border border-zinc-800/60 rounded-2xl p-6">
          <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-400 mb-1">System</h2>
          <p className="text-xs text-zinc-600 mb-5">
            Configure default download folder and VLC player path.
          </p>

          <div className="space-y-6">
            {/* Download Path */}
            <div>
              <label className="text-[10px] text-gray-400 font-black uppercase tracking-widest block ml-1 mb-1.5">
                Default Download Folder
              </label>
              <div className="flex gap-2 items-center">
                <Input
                  type="text"
                  value={settings.downloadPath}
                  onChange={(e) => setSettings((s) => ({ ...s, downloadPath: e.target.value }))}
                  placeholder="~/Downloads/Buccaneer"
                  className="font-mono"
                />
                <Button
                  variant="accent"
                  size="md"
                  icon={FolderOpen}
                  onClick={handleBrowseDownload}
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
                      await message('Could not auto-detect VLC path. Please enter it manually.', { title: 'VLC Detection Failed', kind: 'warning' });
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
          </div>
        </section>

        {/* Search Filters */}
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

        {/* Streaming */}
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

        {/* Maintenance */}
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

        {/* Actions */}
        <div className="flex items-center gap-3">
          <Button
            variant={saved ? 'primary' : 'primary'}
            icon={Save}
            onClick={handleSave}
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

        {/* Note about API key */}
        <p className="text-xs text-zinc-700 leading-relaxed">
          Note: changes to the TMDB API key require restarting the app to take effect, as the key is
          currently embedded in the Rust backend. This will be fixed in a future update to read from the store at runtime.
        </p>

        <ConfirmDialog
          isOpen={showResetConfirm}
          onClose={() => setShowResetConfirm(false)}
          onConfirm={handleResetLibrary}
          title="Reset Library"
          message="This will permanently delete all your favorites and watched history. This action cannot be undone."
          confirmLabel="Reset Library"
          kind="danger"
        />
      </div>
    </div>
  );
}
