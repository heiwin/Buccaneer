import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useLibrary } from './LibraryContext';
import type { NewEpisode } from '../api/notifications';
import {
  checkNewEpisodes,
  getLastOpened,
  updateLastOpened,
  getClearedEpisodes,
  addClearedEpisode,
  clearClearedEpisodes,
  episodeKey,
} from '../api/notifications';

interface NotificationsContextValue {
  newEpisodes: NewEpisode[];
  loading: boolean;
  handleClearAll: () => void;
  handleClearOne: (episode: NewEpisode) => void;
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const { favorites } = useLibrary();
  const [newEpisodes, setNewEpisodes] = useState<NewEpisode[]>([]);
  const [loading, setLoading] = useState(true);

  const favoritesRef = useRef(favorites);
  useEffect(() => {
    favoritesRef.current = favorites;
  }, [favorites]);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const refreshNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const tvFavorites = favoritesRef.current.filter(f => f.mediaType === 'tv');
      if (tvFavorites.length === 0) return;

      const lastOpened = await getLastOpened();
      if (!lastOpened) {
        await updateLastOpened();
        return;
      }

      const cleared = await getClearedEpisodes();
      const clearedSet = new Set(cleared);

      const episodes = (await checkNewEpisodes(tvFavorites, lastOpened))
        .filter(e => !clearedSet.has(episodeKey(e)));

      if (!mountedRef.current) return;

      setNewEpisodes(prev => {
        if (episodes.length === 0) return prev;
        if (prev.length === 0) return episodes;
        const seen = new Set(prev.map(e => episodeKey(e)));
        const additions = episodes.filter(e => !seen.has(episodeKey(e)));
        return additions.length > 0 ? [...prev, ...additions] : prev;
      });
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  // Check on favorites load/change. The baseline (lastOpened) only advances on an
  // explicit Clear All, so episodes stay in the bell until the user clears them
  // — relaunching the app does not wipe them.
  useEffect(() => {
    const t = setTimeout(() => refreshNotifications(), 0);
    return () => clearTimeout(t);
  }, [refreshNotifications, favorites]);

  // Re-check on window focus / visibility, so the badge stays fresh while the app is open.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') refreshNotifications();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [refreshNotifications]);

  useEffect(() => {
    const interval = setInterval(() => refreshNotifications(), 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, [refreshNotifications]);

  const handleClearAll = useCallback(async () => {
    try {
      await updateLastOpened();
      await clearClearedEpisodes();
    } finally {
      setNewEpisodes([]);
    }
  }, []);

  const handleClearOne = useCallback((episode: NewEpisode) => {
    const key = episodeKey(episode);
    addClearedEpisode(key).catch(console.error);
    setNewEpisodes(prev => prev.filter(e => episodeKey(e) !== key));
  }, []);

  return (
    <NotificationsContext.Provider value={{ newEpisodes, loading, handleClearAll, handleClearOne }}>
      {children}
    </NotificationsContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useNotifications(): NotificationsContextValue {
  const ctx = useContext(NotificationsContext);
  if (!ctx) {
    throw new Error('useNotifications must be used within a NotificationsProvider');
  }
  return ctx;
}