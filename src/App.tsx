import { useEffect, useRef, useState, useCallback, lazy, Suspense } from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { onOpenUrl } from '@tauri-apps/plugin-deep-link';
import { sendNotification } from '@tauri-apps/plugin-notification';
import { loadSettings, settingsAreReady, onSettingsReady, applySettingsToBackend, ensureDefaultVlcPath } from './api/settings';
import { getActiveTorrents } from './api/torrent';
import { LibraryProvider } from './lib/LibraryContext';
import { NotificationsProvider } from './lib/NotificationsContext';
import { Sidebar } from './components';
import { ConfirmDialog, ErrorBoundary } from './components/ui';

const HomePage = lazy(() => import('./pages/HomePage').then(m => ({ default: m.HomePage })));
const DetailPage = lazy(() => import('./pages/DetailPage').then(m => ({ default: m.DetailPage })));
const SearchPage = lazy(() => import('./pages/SearchPage').then(m => ({ default: m.SearchPage })));
const DiscoverPage = lazy(() => import('./pages/DiscoverPage').then(m => ({ default: m.DiscoverPage })));
const SettingsPage = lazy(() => import('./pages/SettingsPage').then(m => ({ default: m.SettingsPage })));
const DownloadsPage = lazy(() => import('./pages/DownloadsPage').then(m => ({ default: m.DownloadsPage })));
const FavoritesPage = lazy(() => import('./pages/FavoritesPage').then(m => ({ default: m.FavoritesPage })));
const WatchlistPage = lazy(() => import('./pages/WatchlistPage').then(m => ({ default: m.WatchlistPage })));

function App() {
  const navigate = useNavigate();
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
  const closeRequestedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    loadSettings().then((s) => {
      if (cancelled) return;
      // Only push settings to the backend once they are confirmed from disk.
      // Applying defaults over a failed load would wipe the user's real state.
      if (!settingsAreReady()) return;
      applySettingsToBackend(s);
      ensureDefaultVlcPath();
    });

    const unlistenSettingsReady = onSettingsReady(() => {
      if (cancelled) return;
      // Settings became available after the first attempt (e.g. transient FD
      // exhaustion resolved, or in-app recovery rewrote a corrupt file).
      loadSettings().then((s) => {
        if (!cancelled) {
          applySettingsToBackend(s);
          ensureDefaultVlcPath();
        }
      });
    });

    const VALID_ROUTES = new Set([
      '/', '/search', '/discover', '/settings', '/downloads', '/favorites', '/watchlist',
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
      cancelled = true;
      unlistenSettingsReady();
      unlisten.then(f => f());
      unlistenDeepLink.then(f => f());
    };
  }, [navigate]);

  // Global download-completion notifications — fire even when the Downloads page
  // is not mounted. Streamed torrents are excluded (buffering is not a download).
  useEffect(() => {
    let cancelled = false;
    const prevStates = new Map<string, string>();
    let initialSeed = true;
    const COMPLETED_STATES = new Set(['seeding', 'completed']);

    const check = async () => {
      if (cancelled) return;
      try {
        const torrents = await getActiveTorrents();
        if (cancelled) return;
        const settings = await loadSettings();
        const notificationsEnabled = settingsAreReady() ? settings.notificationsEnabled : false;

        for (const t of torrents) {
          if (t.isStream) continue;
          const isCompleted = t.completedAt != null || COMPLETED_STATES.has(t.state);
          const wasCompleted = prevStates.get(t.id) === 'completed';
          if (!initialSeed && !wasCompleted && isCompleted && notificationsEnabled) {
            sendNotification({
              title: 'Download Complete',
              body: `${t.name} has finished downloading.`,
            });
          }
          prevStates.set(t.id, isCompleted ? 'completed' : t.state);
        }
        initialSeed = false;
      } catch (e: unknown) {
        console.error('Error polling downloads for notifications:', e instanceof Error ? e.message : String(e));
      }
    };

    check();
    const interval = setInterval(check, 5000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

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
      <NotificationsProvider>
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
                  <Route path="/watchlist" element={<WatchlistPage />} />
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
          message="There are downloads still in progress. Are you sure you want to close?"
          confirmLabel="Close anyway"
          cancelLabel="Cancel"
          kind="warning"
        />
      </NotificationsProvider>
    </LibraryProvider>
  );
}

export default App;
