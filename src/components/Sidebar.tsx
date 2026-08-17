import { useState, useEffect, useCallback, useRef } from 'react';
import { NavLink } from 'react-router-dom';
import { Home, Compass, Search, Settings, HardDrive, Heart, Eye, Download, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';
import appIcon from '../assets/icon.png';
import { getVersion } from '@tauri-apps/api/app';
import { checkForUpdate } from '../api/updater';
import type { UpdateState } from '../api/updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { useNotifications } from '../lib/NotificationsContext';
import { NotificationBell } from './NotificationBell';

interface NavItemProps {
  to: string;
  icon: React.ReactNode;
  label: string;
}

function NavItem({ to, icon, label }: NavItemProps) {
  return (
    <NavLink
      to={to}
      end
      className={({ isActive }) =>
        `flex items-center gap-4 p-3 rounded-xl transition-colors duration-200 w-full border ${
          isActive
            ? 'bg-primary/10 text-primary border-primary/20'
            : 'text-zinc-400 border-transparent hover:text-white hover:bg-zinc-800/50'
        }`
      }
    >
      <div className="flex-shrink-0">{icon}</div>
      <span className="hidden lg:block font-bold text-sm tracking-wide">{label}</span>
    </NavLink>
  );
}

export function Sidebar() {
  const [updateState, setUpdateState] = useState<UpdateState>({ status: 'checking' });
  const [currentVersion, setCurrentVersion] = useState<string>('');
  const updateStateRef = useRef(updateState);
  const cancelledRef = useRef(false);
  const { newEpisodes, loading, handleClearAll, handleClearOne } = useNotifications();

  useEffect(() => {
    updateStateRef.current = updateState;
  });

  useEffect(() => {
    cancelledRef.current = false;

    const check = (force = false) => {
      if (cancelledRef.current) return;
      const s = updateStateRef.current;
      if (!force && s.status !== 'idle' && s.status !== 'error') return;
      setUpdateState({ status: 'checking' });
      checkForUpdate()
        .then((update) => {
          if (cancelledRef.current) return;
          if (update) {
            setUpdateState({ status: 'available', update });
            setCurrentVersion(update.currentVersion);
          } else {
            setUpdateState({ status: 'idle' });
          }
        })
        .catch((err) => {
          if (cancelledRef.current) return;
          setUpdateState({ status: 'error', message: err instanceof Error ? err.message : String(err) });
        });
    };

    getVersion().then(setCurrentVersion).catch(() => {});
    check(true);

    const interval = setInterval(() => check(), 6 * 60 * 60 * 1000);

    const onVisibility = () => {
      if (document.visibilityState === 'visible' && !cancelledRef.current) check();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelledRef.current = true;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
    };
    // checkForUpdate, getVersion, setUpdateState, setCurrentVersion are stable
    // (module-level imports and useState setters) — safe to omit.
  }, []);

  const handleDownload = useCallback(async () => {
    const state = updateStateRef.current;
    if (state.status !== 'available') return;
    const { update } = state;
    try {
      await update.download((event) => {
        if (cancelledRef.current) return;
        switch (event.event) {
          case 'Started':
            setUpdateState({
              status: 'downloading',
              progress: 0,
              total: event.data.contentLength ?? 0,
            });
            break;
          case 'Progress': {
            setUpdateState((prev) => {
              if (prev.status !== 'downloading') return prev;
              return {
                ...prev,
                progress: prev.progress + event.data.chunkLength,
              };
            });
            break;
          }
          case 'Finished':
            if (cancelledRef.current) return;
            setUpdateState({ status: 'downloaded', update });
            break;
        }
      });
    } catch (e: unknown) {
      if (cancelledRef.current) return;
      setUpdateState({ status: 'error', message: e instanceof Error ? e.message : 'Download failed' });
    }
  }, []);

  const handleInstall = useCallback(async () => {
    const state = updateStateRef.current;
    if (state.status !== 'downloaded') return;
    try {
      setUpdateState({ status: 'installing' });
      await state.update.install();
      await relaunch();
    } catch (e: unknown) {
      setUpdateState({ status: 'error', message: e instanceof Error ? e.message : 'Install failed' });
    }
  }, []);

  const handleRetry = useCallback(async () => {
    cancelledRef.current = false;
    setUpdateState({ status: 'checking' });
    try {
      const update = await checkForUpdate();
      if (update) {
        setUpdateState({ status: 'available', update });
        setCurrentVersion(update.currentVersion);
      } else {
        setUpdateState({ status: 'idle' });
      }
    } catch (err) {
      setUpdateState({ status: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  }, []);

  const renderUpdateBanner = () => {
    switch (updateState.status) {
      case 'checking':
        return (
          <div className="flex items-center gap-2 px-3 py-2 mb-2 text-xs rounded-xl bg-zinc-800/30 border border-zinc-700/40 text-zinc-400">
            <RefreshCw size={14} className="animate-spin" />
            <span className="hidden lg:inline font-medium">Checking for updates...</span>
          </div>
        );

      case 'available':
        return (
          <button
            onClick={handleDownload}
            title={`Update ${updateState.update.version} available — click to download`}
            className="flex items-center gap-2 px-3 py-2 mb-2 text-xs rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 transition-colors cursor-pointer w-full"
          >
            <Download size={14} />
            <span className="hidden lg:inline font-semibold">Update {updateState.update.version} available</span>
            <span className="lg:hidden font-semibold">↓</span>
          </button>
        );

      case 'downloading': {
        const pct = updateState.total > 0
          ? Math.round((updateState.progress / updateState.total) * 100)
          : 0;
        return (
          <div className="flex flex-col gap-1 px-3 py-2 mb-2 text-xs rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400">
            <div className="flex items-center gap-2">
              <Download size={14} />
              <span className="hidden lg:inline font-medium">Downloading update... {pct}%</span>
              <span className="lg:hidden">{pct}%</span>
            </div>
            <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all duration-300"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      }

      case 'downloaded':
        return (
          <button
            onClick={handleInstall}
            className="flex items-center gap-2 px-3 py-2 mb-2 text-xs rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 hover:border-emerald-500/40 transition-colors cursor-pointer w-full"
          >
            <Download size={14} />
            <span className="hidden lg:inline font-semibold">Install & Restart</span>
            <span className="lg:hidden">↓</span>
          </button>
        );

      case 'installing':
        return (
          <div className="flex items-center gap-2 px-3 py-2 mb-2 text-xs rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
            <RefreshCw size={14} className="animate-spin" />
            <span className="hidden lg:inline font-medium">Installing update...</span>
          </div>
        );

      case 'error':
        return (
          <button
            onClick={handleRetry}
            title={updateState.message || 'Update check failed'}
            className="flex items-center gap-2 px-3 py-2 mb-2 text-xs rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:bg-rose-500/20 transition-colors cursor-pointer w-full"
          >
            <AlertCircle size={14} />
            <span className="hidden lg:inline font-medium">Update failed — Retry</span>
            <span className="lg:hidden">!</span>
          </button>
        );

      case 'idle':
        return null;
    }
  };

  return (
    <aside className="w-20 lg:w-64 border-r border-zinc-800/50 flex flex-col justify-between py-8 shrink-0">
      <div>
        {/* Logo */}
        <div className="flex items-center justify-center lg:justify-start px-4 lg:px-6 mb-12">
          <div className="pl-3 flex items-end">
            <img src={appIcon} alt="Buccaneer Icon" className="w-9 h-9 object-contain drop-shadow-lg" />
            <span className="hidden lg:block ml-3 font-black text-xl tracking-widest uppercase leading-none">
              Buccaneer
            </span>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex flex-col gap-2 px-4 lg:px-6">
          <NavItem to="/" icon={<Home size={20} />} label="Home" />
          <NavItem to="/discover" icon={<Compass size={20} />} label="Discover" />
          <NavItem to="/search" icon={<Search size={20} />} label="Search" />
          <NavItem to="/downloads" icon={<HardDrive size={20} />} label="Downloads" />
          <NavItem to="/favorites" icon={<Heart size={20} />} label="Favorites" />
          <NavItem to="/watchlist" icon={<Eye size={20} />} label="Watchlist" />
        </nav>
      </div>

      <div className="flex flex-col gap-2 px-4 lg:px-6">
        <NotificationBell
          episodes={newEpisodes}
          count={newEpisodes.length}
          loading={loading}
          onClearAll={handleClearAll}
          onClearOne={handleClearOne}
          align="left"
        />
        {renderUpdateBanner()}
        {updateState.status === 'idle' && currentVersion && (
          <div
            title={`Buccaneer is up to date (${currentVersion})`}
            className="flex items-center gap-2 px-3 py-2 mb-2 text-xs rounded-xl bg-zinc-800/30 border border-zinc-700/40 text-zinc-500"
          >
            <CheckCircle2 size={14} />
            <span className="hidden lg:inline font-medium">Up to date ({currentVersion})</span>
            <span className="lg:hidden">✓</span>
          </div>
        )}
        <NavItem to="/settings" icon={<Settings size={20} />} label="Settings" />
      </div>
    </aside>
  );
}
