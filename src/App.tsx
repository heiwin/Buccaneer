import { useEffect, useRef, useState, useCallback, lazy, Suspense } from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { onOpenUrl } from '@tauri-apps/plugin-deep-link';
import { loadSettings } from './api/settings';
import { getActiveTorrents } from './api/torrent';
import { LibraryProvider } from './lib/LibraryContext';
import { Sidebar } from './components';
import { ConfirmDialog, ErrorBoundary } from './components/ui';

const HomePage = lazy(() => import('./pages/HomePage').then(m => ({ default: m.HomePage })));
const DetailPage = lazy(() => import('./pages/DetailPage').then(m => ({ default: m.DetailPage })));
const SearchPage = lazy(() => import('./pages/SearchPage').then(m => ({ default: m.SearchPage })));
const DiscoverPage = lazy(() => import('./pages/DiscoverPage').then(m => ({ default: m.DiscoverPage })));
const SettingsPage = lazy(() => import('./pages/SettingsPage').then(m => ({ default: m.SettingsPage })));
const DownloadsPage = lazy(() => import('./pages/DownloadsPage').then(m => ({ default: m.DownloadsPage })));
const FavoritesPage = lazy(() => import('./pages/FavoritesPage').then(m => ({ default: m.FavoritesPage })));

function App() {
  const navigate = useNavigate();
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
  const closeRequestedRef = useRef(false);

  useEffect(() => {
    loadSettings().then((s) => {
      invoke('update_clear_streaming_setting', { value: s.clearStreamingOnExit }).catch(console.error);
      invoke('update_ratelimits', { downloadKbps: s.downloadLimit, uploadKbps: s.uploadLimit }).catch(console.error);
      if (s.downloadPath) {
        invoke('set_download_path', { path: s.downloadPath }).catch(console.error);
      }
    });

    const VALID_ROUTES = new Set([
      '/', '/search', '/discover', '/settings', '/downloads', '/favorites',
    ]);

    let lastDeepLink = 0;
    const unlistenDeepLink = onOpenUrl((urls) => {
      const now = Date.now();
      if (urls.length === 0 || now - lastDeepLink < 1000) return;
      lastDeepLink = now;
      try {
        const url = new URL(urls[0]);
        const path = url.hostname ? '/' + url.hostname + url.pathname : '/';
        const normalized = path.replace(/\/+$/, '') || '/';
        if (VALID_ROUTES.has(normalized) || /^\/(movie|tv)\/\d+$/.test(normalized)) {
          navigate(normalized);
        }
      } catch (e: unknown) {
        console.error('Invalid deep link URL:', urls[0], e instanceof Error ? e.message : String(e));
      }
    });

    const unlisten = getCurrentWindow().onCloseRequested(async (event) => {
      try {
        const torrents = await getActiveTorrents();
        const activeDownloads = torrents.filter(t =>
          t.state === 'downloading' || t.state === 'seeding' || t.state === 'checking' || t.state === 'paused'
        );

        if (activeDownloads.length > 0) {
          event.preventDefault();
          closeRequestedRef.current = true;
          setCloseDialogOpen(true);
        }
      } catch (err: unknown) {
        console.error('Error checking active downloads on close:', err instanceof Error ? err.message : String(err));
      }
    });

    return () => {
      unlisten.then(f => f());
      unlistenDeepLink.then(f => f());
    };
  }, [navigate]);

  const handleConfirmClose = useCallback(() => {
    setCloseDialogOpen(false);
    closeRequestedRef.current = false;
    getCurrentWindow().destroy();
  }, []);

  const handleCancelClose = useCallback(() => {
    setCloseDialogOpen(false);
    closeRequestedRef.current = false;
  }, []);

  return (
    <LibraryProvider>
      <ErrorBoundary>
        <div className="flex h-screen bg-background text-gray-100 overflow-hidden">
          <Sidebar />
          <main className="flex-1 overflow-y-auto overflow-x-hidden">
            <Suspense fallback={<div className="flex items-center justify-center h-full" role="status"><span className="loading loading-spinner" /></div>}>
              <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/movie/:id" element={<DetailPage mediaType="movie" />} />
                <Route path="/tv/:id" element={<DetailPage mediaType="tv" />} />
                <Route path="/search" element={<SearchPage />} />
                <Route path="/discover" element={<DiscoverPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/downloads" element={<DownloadsPage />} />
                <Route path="/favorites" element={<FavoritesPage />} />
              </Routes>
            </Suspense>
          </main>
        </div>
      </ErrorBoundary>

      <ConfirmDialog
        isOpen={closeDialogOpen}
        onClose={handleCancelClose}
        onConfirm={handleConfirmClose}
        title="Warning"
        message="There are active, paused, or completed downloads. Are you sure you want to close?"
        confirmLabel="Close anyway"
        cancelLabel="Cancel"
        kind="warning"
      />
    </LibraryProvider>
  );
}

export default App;
