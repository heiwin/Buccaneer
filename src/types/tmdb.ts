// ─── TMDB Type Definitions ───────────────────────────────────────────────────

export interface WatchProvider {
  provider_id: number;
  provider_name: string;
  logo_path: string;
  display_priority: number;
}

export type MediaType = 'movie' | 'tv';

export interface TMDBResponse<T = TMDBListItem> {
  page: number;
  results: T[];
  total_pages: number;
  total_results: number;
}

/** Minimal shape shared between movie and tv list items (trending) */
export interface TMDBListItem {
  id: number;
  media_type?: MediaType;
  title?: string;           // movies
  name?: string;            // tv series
  original_title?: string;
  original_name?: string;
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average: number;
  vote_count: number;
  release_date?: string;    // movies
  first_air_date?: string;  // tv
  overview: string;
  genre_ids: number[];
}

export interface Genre {
  id: number;
  name: string;
}

export interface ProductionCompany {
  id: number;
  name: string;
  logo_path: string | null;
  origin_country: string;
}

export interface CastMember {
  id: number;
  name: string;
  character: string;
  profile_path: string | null;
  order: number;
}

export interface Video {
  id: string;
  key: string;
  name: string;
  site: string;
  type: string;
  official: boolean;
}

/** Full movie details (append_to_response=credits,videos) */
export interface MovieDetails {
  id: number;
  title: string;
  original_title: string;
  tagline: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date: string;
  runtime: number | null;
  vote_average: number;
  vote_count: number;
  status: string;
  genres: Genre[];
  production_companies: ProductionCompany[];
  budget: number;
  revenue: number;
  imdb_id: string | null;
  credits?: {
    cast: CastMember[];
    crew: CastMember[];
  };
  videos?: {
    results: Video[];
  };
}

export interface TvSeason {
  id: number;
  name: string;
  season_number: number;
  episode_count: number;
  air_date: string | null;
  poster_path: string | null;
  overview: string;
}

export interface TvEpisode {
  id: number;
  name: string;
  episode_number: number;
  overview: string;
  still_path: string | null;
  air_date: string | null;
  vote_average: number;
  runtime: number | null;
}

export interface SeasonDetails {
  _id: string;
  id: number;
  name: string;
  overview: string;
  poster_path: string | null;
  season_number: number;
  episodes: TvEpisode[];
}

/** Full TV series details (append_to_response=credits,videos) */
export interface TvDetails {
  id: number;
  name: string;
  original_name: string;
  tagline: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  first_air_date: string;
  last_air_date: string;
  number_of_seasons: number;
  number_of_episodes: number;
  episode_run_time: number[];
  vote_average: number;
  vote_count: number;
  status: string;
  genres: Genre[];
  production_companies: ProductionCompany[];
  seasons: TvSeason[];
  credits?: {
    cast: CastMember[];
    crew: CastMember[];
  };
  videos?: {
    results: Video[];
  };
}
