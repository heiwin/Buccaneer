import { load, type Store } from '@tauri-apps/plugin-store';
import { getTvDetails, getTvSeasonDetails } from './tmdb';
import type { FavoriteItem } from './library';

const NOTIFICATIONS_FILE = 'notifications.json';

let storeInstance: Store | null = null;

async function getStore(): Promise<Store> {
  if (!storeInstance) {
    storeInstance = await load(NOTIFICATIONS_FILE, { autoSave: false, defaults: {} });
  }
  return storeInstance;
}

export async function getLastOpened(): Promise<number | null> {
  try {
    const store = await getStore();
    return (await store.get<number>('lastOpened')) ?? null;
  } catch {
    return null;
  }
}

export async function updateLastOpened(): Promise<void> {
  const store = await getStore();
  await store.set('lastOpened', Date.now());
  await store.save();
}

export interface NewEpisode {
  showId: number;
  showName: string;
  posterPath: string | null;
  seasonNumber: number;
  episodeNumber: number;
  episodeName: string;
  airDate: string;
}

export async function checkNewEpisodes(
  favorites: FavoriteItem[],
  lastOpened: number,
): Promise<NewEpisode[]> {
  const now = Date.now();
  const episodes: NewEpisode[] = [];

  const results = await Promise.allSettled(
    favorites.map(async (fav) => {
      const threshold = Math.max(fav.addedAt, lastOpened);
      const details = await getTvDetails(fav.id);
      const showEpisodes: NewEpisode[] = [];

      // 1. Check the latest numbered season
      const numberedSeasons = details.seasons?.filter(s => s.season_number > 0) ?? [];
      if (numberedSeasons.length > 0) {
        const latestSeason = numberedSeasons.reduce((a, b) =>
          a.season_number > b.season_number ? a : b
        );

        if (latestSeason.air_date) {
          if (new Date(latestSeason.air_date).getTime() > threshold) {
            const seasonDetails = await getTvSeasonDetails(fav.id, latestSeason.season_number);
            if (seasonDetails.episodes) {
              for (const ep of seasonDetails.episodes) {
                if (ep.air_date) {
                  const epAirDate = new Date(ep.air_date).getTime();
                  if (epAirDate > threshold && epAirDate <= now) {
                    showEpisodes.push({
                      showId: fav.id,
                      showName: fav.title,
                      posterPath: fav.posterPath,
                      seasonNumber: latestSeason.season_number,
                      episodeNumber: ep.episode_number,
                      episodeName: ep.name,
                      airDate: ep.air_date,
                    });
                  }
                }
              }
            }
          }
        }
      }

      // 2. Check season 0 (specials) — no season-level air_date optimization
      if (details.seasons?.some(s => s.season_number === 0)) {
        const seasonZero = await getTvSeasonDetails(fav.id, 0);
        if (seasonZero.episodes) {
          for (const ep of seasonZero.episodes) {
            if (ep.air_date) {
              const epAirDate = new Date(ep.air_date).getTime();
              if (epAirDate > threshold && epAirDate <= now) {
                showEpisodes.push({
                  showId: fav.id,
                  showName: fav.title,
                  posterPath: fav.posterPath,
                  seasonNumber: 0,
                  episodeNumber: ep.episode_number,
                  episodeName: ep.name,
                  airDate: ep.air_date,
                });
              }
            }
          }
        }
      }

      return showEpisodes;
    }),
  );

  for (const r of results) {
    if (r.status === 'fulfilled') {
      episodes.push(...r.value);
    }
  }

  return episodes;
}
