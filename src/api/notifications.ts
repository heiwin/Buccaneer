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

export function episodeKey(e: { showId: number; seasonNumber: number; episodeNumber: number }): string {
  return `${e.showId}-${e.seasonNumber}-${e.episodeNumber}`;
}

export async function getClearedEpisodes(): Promise<string[]> {
  try {
    const store = await getStore();
    return (await store.get<string[]>('cleared')) ?? [];
  } catch {
    return [];
  }
}

export async function addClearedEpisode(key: string): Promise<void> {
  const store = await getStore();
  const cleared = (await store.get<string[]>('cleared')) ?? [];
  if (!cleared.includes(key)) {
    cleared.push(key);
    await store.set('cleared', cleared);
    await store.save();
  }
}

export async function clearClearedEpisodes(): Promise<void> {
  const store = await getStore();
  await store.set('cleared', []);
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

function parseAirDate(airDate: string): number {
  if (/^\d{4}-\d{2}-\d{2}$/.test(airDate)) {
    return new Date(`${airDate}T00:00:00`).getTime();
  }
  return new Date(airDate).getTime();
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

      // 1. Check every numbered season that could still have episodes airing.
      // Checking only the highest season number misses the show while a future
      // season is already listed on TMDB (e.g. S3 airing, S4 announced).
      const numberedSeasons = details.seasons?.filter(s => s.season_number > 0) ?? [];
      const WEEK = 7 * 24 * 60 * 60 * 1000;
      // Two weeks of slack: not every show airs on a strict weekly schedule.
      const MARGIN = 14 * 24 * 60 * 60 * 1000;

      // Seasons with a known date: keep the most recent ones still inside the
      // notification window, newest first.
      const datedSeasons = numberedSeasons
        .map((season) => ({
          season,
          start: season.air_date ? parseAirDate(season.air_date) : Number.NaN,
        }))
        .filter(({ season, start }) => {
          if (!Number.isFinite(start)) return false; // fallback below
          if (start > now) return false; // not started yet
          return start + season.episode_count * WEEK + MARGIN > threshold;
        })
        .sort((a, b) => b.start - a.start)
        .slice(0, 3)
        .map(({ season }) => season);

      // A season listed without an air date can still be the one currently
      // airing, so keep one as a fallback. Keeping all of them would let
      // announced-but-unscheduled seasons crowd out the one actually airing.
      const undatedSeason = numberedSeasons
        .filter((season) => !season.air_date)
        .sort((a, b) => b.season_number - a.season_number)[0];

      const candidateSeasons = undatedSeason
        ? [...datedSeasons, undatedSeason]
        : datedSeasons;

      for (const season of candidateSeasons) {
        const seasonDetails = await getTvSeasonDetails(fav.id, season.season_number);
        for (const ep of seasonDetails.episodes ?? []) {
          if (!ep.air_date) continue;
          const epAirDate = parseAirDate(ep.air_date);
          if (epAirDate > threshold && epAirDate <= now) {
            showEpisodes.push({
              showId: fav.id,
              showName: fav.title,
              posterPath: fav.posterPath,
              seasonNumber: season.season_number,
              episodeNumber: ep.episode_number,
              episodeName: ep.name,
              airDate: ep.air_date,
            });
          }
        }
      }

      // 2. Check season 0 (specials) — no season-level air_date optimization
      if (details.seasons?.some(s => s.season_number === 0)) {
        const seasonZero = await getTvSeasonDetails(fav.id, 0);
        if (seasonZero.episodes) {
          for (const ep of seasonZero.episodes) {
            if (ep.air_date) {
              const epAirDate = parseAirDate(ep.air_date);
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
