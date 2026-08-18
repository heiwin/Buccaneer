import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import {
  loadLibrary,
  saveLibrary,
  libraryIsReady,
  onLibraryReady,
  forceResetLibrary,
  type FavoriteItem,
  type WatchedMap,
  type ToWatchMap,
} from '../api/library';

interface LibraryContextValue {
  favorites: FavoriteItem[];
  watched: WatchedMap;
  toWatch: ToWatchMap;
  ready: boolean;
  toggleFavorite: (item: Omit<FavoriteItem, 'addedAt'>) => void;
  isFavorite: (id: number, mediaType: 'movie' | 'tv') => boolean;
  toggleWatched: (key: string) => void;
  isWatched: (key: string) => boolean;
  toggleToWatch: (key: string) => void;
  isToWatch: (key: string) => boolean;
  resetLibrary: () => void;
}

const LibraryContext = createContext<LibraryContextValue | null>(null);

export function LibraryProvider({ children }: { children: React.ReactNode }) {
  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
  const [watched, setWatched] = useState<WatchedMap>({});
  const [toWatch, setToWatch] = useState<ToWatchMap>({});
  const [ready, setReady] = useState(false);
  const initialized = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestFavorites = useRef(favorites);
  const latestWatched = useRef(watched);
  const latestToWatch = useRef(toWatch);

  useEffect(() => {
    latestFavorites.current = favorites;
    latestWatched.current = watched;
    latestToWatch.current = toWatch;
  }, [favorites, watched, toWatch]);

  // Load on mount (once; ref survives StrictMode double-mount). `initialized`
  // is only set to true after the data has been confirmed on disk, so the
  // debounced save below can never overwrite a file that failed to load.
  useEffect(() => {
    if (initialized.current) return;
    let cancelled = false;

    const applyData = (data: { favorites: FavoriteItem[]; watched: WatchedMap; toWatch: ToWatchMap }) => {
      if (cancelled) return;
      setFavorites(data.favorites);
      setWatched(data.watched);
      setToWatch(data.toWatch);
      initialized.current = true;
      setReady(true);
    };

    loadLibrary()
      .then((data) => {
        if (cancelled) return;
        if (libraryIsReady()) {
          applyData(data);
        } else {
          // Transient I/O failure — retried automatically; keep writes blocked.
          setReady(false);
        }
      })
      .catch(console.error);

    const unsubscribe = onLibraryReady(() => {
      if (initialized.current) return;
      loadLibrary()
        .then((data) => {
          if (!cancelled && libraryIsReady()) applyData(data);
        })
        .catch(console.error);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  // Persist on change with debounce (skip until the file has been confirmed
  // on disk, and skip the initial load).
  useEffect(() => {
    if (!initialized.current) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      saveLibrary({ favorites, watched, toWatch }).catch(console.error);
    }, 500);
  }, [favorites, watched, toWatch]);

  // Flush pending save on unmount (only if a confirmed load took place).
  useEffect(() => {
    return () => {
      if (debounceRef.current && initialized.current) {
        clearTimeout(debounceRef.current);
        saveLibrary({ favorites: latestFavorites.current, watched: latestWatched.current, toWatch: latestToWatch.current }).catch(console.error);
      }
    };
  }, []);

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

  const toggleToWatch = useCallback((key: string) => {
    setToWatch((prev) => {
      const next = { ...prev };
      if (next[key]) {
        delete next[key];
      } else {
        next[key] = Date.now();
      }
      return next;
    });
  }, []);

  const isToWatch = useCallback(
    (key: string) => {
      return !!toWatch[key];
    },
    [toWatch]
  );

  const resetLibrary = useCallback(() => {
    setFavorites([]);
    setWatched({});
    setToWatch({});
    // If the library could never be read (both main and backup unreadable),
    // the debounced save stays blocked forever (initialized=false). Force a
    // write so the reset actually takes effect and unblocks the store.
    if (!libraryIsReady() && !initialized.current) {
      forceResetLibrary({ favorites: [], watched: {}, toWatch: {} })
        .then(() => {
          initialized.current = true;
          setReady(true);
        })
        .catch(console.error);
    }
  }, []);

  return (
    <LibraryContext.Provider
      value={{ favorites, watched, toWatch, ready, toggleFavorite, isFavorite, toggleWatched, isWatched, toggleToWatch, isToWatch, resetLibrary }}
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