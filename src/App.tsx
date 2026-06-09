import { useEffect, useRef, useState, useCallback } from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { onOpenUrl } from '@tauri-apps/plugin-deep-link';
import { loadSettings } from './api/settings';
import { getActiveTorrents } from './api/torrent';
import { LibraryProvider } from './lib/LibraryContext';
import { Sidebar } from './components';
import { ConfirmDialog, ErrorBoundary } from './components/ui';
import { HomePage } from './pages/HomePage';
import { DetailPage } from './pages/DetailPage';
import { SearchPage } from './pages/SearchPage';
import { DiscoverPage } from './pages/DiscoverPage';
import { SettingsPage } from './pages/SettingsPage';
import { DownloadsPage } from './pages/DownloadsPage';
import { FavoritesPage } from './pages/FavoritesPage';

function App() {
  const navigate = useNavigate();
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
  const closeEventRef = useRef<{ preventDefault: () => void } | null>(null);

  useEffect(() => {
    loadSettings().then((s) => {
      invoke('update_clear_streaming_setting', { value: s.clearStreamingOnExit }).catch(console.error);
      invoke('update_ratelimits', { downloadKbps: s.downloadLimit, uploadKbps: s.uploadLimit }).catch(console.error);
      invoke('set_tmdb_api_key', { key: s.tmdbApiKey }).catch(console.error);
    });

    const VALID_ROUTES = new Set([
      '/', '/search', '/discover', '/settings', '/downloads', '/favorites',
    ]);

    const unlistenDeepLink = onOpenUrl((urls) => {
      if (urls.length === 0) return;
      try {
        const url = new URL(urls[0]);
        const path = url.hostname ? '/' + url.hostname + url.pathname : '/';
        // Only navigate to valid routes to prevent deep link abuse
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
          closeEventRef.current = event;
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
    closeEventRef.current = null;
    getCurrentWindow().destroy();
  }, []);

  const handleCancelClose = useCallback(() => {
    setCloseDialogOpen(false);
    closeEventRef.current = null;
  }, []);

  return (
    <LibraryProvider>
      <ErrorBoundary>
        <div className="flex h-screen bg-background text-gray-100 overflow-hidden">
          <Sidebar />
          <main className="flex-1 overflow-y-auto overflow-x-hidden">
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
          </main>
        </div>
      </ErrorBoundary>

      <ConfirmDialog
        isOpen={closeDialogOpen}
        onClose={handleCancelClose}
        onConfirm={handleConfirmClose}
        title="Attenzione"
        message="Ci sono download attivi, in pausa o completati. Vuoi chiudere comunque?"
        confirmLabel="Chiudi comunque"
        cancelLabel="Annulla"
        kind="warning"
      />
    </LibraryProvider>
  );
}

export default App;
