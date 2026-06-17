import { load, type Store } from '@tauri-apps/plugin-store';
import { getTvDetails, getTvSeasonDetails } from './tmdb';

const NOTIFICATIONS_FILE = 'notifications.json';

let storeInstance: Store | null = null;

async function getStore(): Promise<Store> {
  if (!storeInstance) {
    storeInstance = await load(NOTIFICATIONS_FILE, { autoSave: false });
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

interface FavoriteInfo {
  id: number;
  title: string;
  posterPath: string | null;
}

export async function checkNewEpisodes(
  favorites: FavoriteInfo[],
  lastOpened: number,
): Promise<NewEpisode[]> {
  const episodes: NewEpisode[] = [];

  const results = await Promise.allSettled(
    favorites.map(async (fav) => {
      const details = await getTvDetails(fav.id);
      const validSeasons = details.seasons?.filter(s => s.season_number > 0) ?? [];
      if (validSeasons.length === 0) return [];

      const latestSeason = validSeasons.reduce((a, b) =>
        a.season_number > b.season_number ? a : b
      );

      if (!latestSeason.air_date) return [];
      if (new Date(latestSeason.air_date).getTime() <= lastOpened) return [];

      const seasonDetails = await getTvSeasonDetails(fav.id, latestSeason.season_number);
      if (!seasonDetails.episodes) return [];

      return seasonDetails.episodes
        .filter(ep => ep.air_date && new Date(ep.air_date).getTime() > lastOpened)
        .map(ep => ({
          showId: fav.id,
          showName: fav.title,
          posterPath: fav.posterPath,
          seasonNumber: latestSeason.season_number,
          episodeNumber: ep.episode_number,
          episodeName: ep.name,
          airDate: ep.air_date!,
        }));
    }),
  );

  for (const r of results) {
    if (r.status === 'fulfilled') {
      episodes.push(...r.value);
    }
  }

  return episodes;
}
