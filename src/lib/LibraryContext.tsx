import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import {
  loadLibrary,
  saveLibrary,
  type FavoriteItem,
  type WatchedMap,
} from '../api/library';

interface LibraryContextValue {
  favorites: FavoriteItem[];
  watched: WatchedMap;
  toggleFavorite: (item: Omit<FavoriteItem, 'addedAt'>) => void;
  isFavorite: (id: number, mediaType: 'movie' | 'tv') => boolean;
  toggleWatched: (key: string) => void;
  isWatched: (key: string) => boolean;
  resetLibrary: () => void;
}

const LibraryContext = createContext<LibraryContextValue | null>(null);

export function LibraryProvider({ children }: { children: React.ReactNode }) {
  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
  const [watched, setWatched] = useState<WatchedMap>({});
  const loaded = useRef(false);

  // Load on mount
  useEffect(() => {
    loadLibrary().then((data) => {
      setFavorites(data.favorites);
      setWatched(data.watched);
      loaded.current = true;
    });
  }, []);

  // Persist on change with debounce (skip initial load)
  useEffect(() => {
    if (!loaded.current) return;
    const timer = setTimeout(() => {
      saveLibrary({ favorites, watched }).catch(console.error);
    }, 500);
    return () => clearTimeout(timer);
  }, [favorites, watched]);

  const toggleFavorite = useCallback((item: Omit<FavoriteItem, 'addedAt'>) => {
    setFavorites((prev) => {
      const exists = prev.some((f) => f.id === item.id && f.mediaType === item.mediaType);
      if (exists) {
        return prev.filter((f) => !(f.id === item.id && f.mediaType === item.mediaType));
      }
      return [...prev, { ...item, addedAt: Date.now() }];
    });
  }, []);

  const isFavorite = useCallback(
    (id: number, mediaType: 'movie' | 'tv') => {
      return favorites.some((f) => f.id === id && f.mediaType === mediaType);
    },
    [favorites]
  );

  const toggleWatched = useCallback((key: string) => {
    setWatched((prev) => {
      const next = { ...prev };
      if (next[key]) {
        delete next[key];
      } else {
        next[key] = Date.now();
      }
      return next;
    });
  }, []);

  const isWatched = useCallback(
    (key: string) => {
      return !!watched[key];
    },
    [watched]
  );

  const resetLibrary = useCallback(() => {
    setFavorites([]);
    setWatched({});
  }, []);

  return (
    <LibraryContext.Provider
      value={{ favorites, watched, toggleFavorite, isFavorite, toggleWatched, isWatched, resetLibrary }}
    >
      {children}
    </LibraryContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useLibrary(): LibraryContextValue {
  const ctx = useContext(LibraryContext);
  if (!ctx) {
    throw new Error('useLibrary must be used within a LibraryProvider');
  }
  return ctx;
}
