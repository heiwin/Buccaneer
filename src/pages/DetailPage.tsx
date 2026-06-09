import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Star,
  Clock,
  Calendar,
  Tv,
  Film,
  ExternalLink,
  Heart,
  CheckCircle,
} from 'lucide-react';
import { getMovieDetails, getTvDetails, getTvSeasonDetails, backdropUrl, posterUrl, profileUrl } from '../api/tmdb';
import { searchTorrents } from '../api/knaben';
import { Button, Spinner, Badge } from '../components/ui';
import { TorrentList, Carousel } from '../components';
import { useLibrary } from '../lib/LibraryContext';
import { watchedKeyEpisode } from '../api/library';
import { buildSearchQuery } from '../constants/filters';
import type { MovieDetails, TvDetails, SeasonDetails, TvSeason } from '../types/tmdb';
import type { TorrentResult } from '../types/knaben';

interface DetailPageProps {
  mediaType: 'movie' | 'tv';
}

type Details = MovieDetails | TvDetails;

function isMovie(d: Details): d is MovieDetails {
  return 'title' in d;
}

export function DetailPage({ mediaType }: DetailPageProps) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toggleFavorite, isFavorite, toggleWatched, isWatched } = useLibrary();

  const [details, setDetails] = useState<Details | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(true);
  const [detailsError, setDetailsError] = useState<string | null>(null);

  const [torrents, setTorrents] = useState<TorrentResult[]>([]);
  const [torrentsLoading, setTorrentsLoading] = useState(false);
  const [torrentsError, setTorrentsError] = useState<string | null>(null);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [qualityFilter, setQualityFilter] = useState('');
  const [languageFilter, setLanguageFilter] = useState('');
  
  const torrentSectionRef = useRef<HTMLDivElement>(null);

  // TV Specific state
  const [selectedSeason, setSelectedSeason] = useState<number | null>(null);
  const [seasonDetails, setSeasonDetails] = useState<SeasonDetails | null>(null);
  const [seasonLoading, setSeasonLoading] = useState(false);

  // Load TMDB details and build initial search query
  useEffect(() => {
    if (!id) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDetailsLoading(true);
    setDetailsError(null);

    const fetchDetails = mediaType === 'movie'
      ? getMovieDetails(Number(id))
      : getTvDetails(Number(id));

    fetchDetails
      .then((d) => {
        setDetails(d);
        if (!isMovie(d) && d.seasons && d.seasons.length > 0) {
          const firstValid = d.seasons.find(s => s.season_number > 0) || d.seasons[0];
          setSelectedSeason(firstValid.season_number);
        }
        const rawTitle = isMovie(d) ? d.title : (d as TvDetails).name;
        const releaseDate = isMovie(d) ? d.release_date : (d as TvDetails).first_air_date;
        const year = releaseDate ? new Date(releaseDate).getFullYear() : '';
        const cleanTitle = rawTitle.replace(/[:'-]/g, ' ').replace(/\s+/g, ' ').trim();
        setSearchQuery(year ? `${cleanTitle} ${year}` : cleanTitle);
      })
      .catch((e: unknown) => setDetailsError(e instanceof Error ? e.message : String(e)))
      .finally(() => setDetailsLoading(false));
  }, [id, mediaType]);

  // Load Season details
  useEffect(() => {
    if (selectedSeason === null || !id || mediaType !== 'tv') return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSeasonLoading(true);
    getTvSeasonDetails(Number(id), selectedSeason)
      .then(setSeasonDetails)
      .catch(console.error)
      .finally(() => setSeasonLoading(false));
  }, [id, selectedSeason, mediaType]);

  // Fetch torrents when query or filters change
  useEffect(() => {
    if (!searchQuery) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTorrentsLoading(true);
    setTorrentsError(null);
    const finalQuery = buildSearchQuery(searchQuery, qualityFilter, languageFilter);
    searchTorrents(finalQuery, mediaType)
      .then((res) => setTorrents(res.hits || []))
      .catch((e: unknown) => setTorrentsError(e instanceof Error ? e.message : String(e)))
      .finally(() => setTorrentsLoading(false));
  }, [searchQuery, qualityFilter, languageFilter, mediaType]);

  // Helpers for TV searches
  const handleSearchSeason = () => {
    if (!details || isMovie(details) || selectedSeason === null) return;
    const rawTitle = details.name.replace(/[:'-]/g, ' ').replace(/\s+/g, ' ').trim();
    const query = `${rawTitle} s${String(selectedSeason).padStart(2, '0')}`;
    setSearchQuery(query);
    torrentSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSearchEpisode = (episodeNumber: number) => {
    if (!details || isMovie(details) || selectedSeason === null) return;
    const rawTitle = details.name.replace(/[:'-]/g, ' ').replace(/\s+/g, ' ').trim();
    const query = `${rawTitle} s${String(selectedSeason).padStart(2, '0')}e${String(episodeNumber).padStart(2, '0')}`;
    setSearchQuery(query);
    torrentSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (detailsLoading) {
    return (
      <Spinner size="lg" className="min-h-screen" />
    );
  }

  if (detailsError || !details) {
    return (
      <div className="p-12 text-center text-red-400">
        <p className="mb-4">Failed to load details.</p>
        <Button variant="ghost" onClick={() => navigate(-1)} className="text-primary underline">
          Go back
        </Button>
      </div>
    );
  }

  // ── Derived values ────────────────────────────────────────────────────────────
  const title     = isMovie(details) ? details.title        : (details as TvDetails).name;
  const tagline   = details.tagline;
  const overview  = details.overview;
  const rating    = details.vote_average;
  const genres    = details.genres;
  const cast      = details.credits?.cast.slice(0, 10) ?? [];
  const trailer   = details.videos?.results.find(
    (v) => v.site === 'YouTube' && v.type === 'Trailer'
  );

  const backdrop  = backdropUrl(details.backdrop_path, 'w1280');
  const poster    = posterUrl(details.poster_path, 'w500');

  const metaItems: { icon: React.ReactNode; label: string }[] = [];

  if (isMovie(details)) {
    if (details.release_date)
      metaItems.push({ icon: <Calendar size={14} />, label: new Date(details.release_date).getFullYear().toString() });
    if (details.runtime)
      metaItems.push({ icon: <Clock size={14} />, label: `${details.runtime} min` });
    metaItems.push({ icon: <Film size={14} />, label: 'Movie' });
  } else {
    const tv = details as TvDetails;
    if (tv.first_air_date)
      metaItems.push({ icon: <Calendar size={14} />, label: new Date(tv.first_air_date).getFullYear().toString() });
    metaItems.push({ icon: <Tv size={14} />, label: `${tv.number_of_seasons} Season${tv.number_of_seasons !== 1 ? 's' : ''}` });
    metaItems.push({ icon: <Tv size={14} />, label: `${tv.number_of_episodes} Episodes` });
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* ── Backdrop ────────────────────────────────────────────────────────── */}
      <div className="relative h-[55vh] w-full overflow-hidden">
        {backdrop && (
          <img
            src={backdrop}
            alt={title}
            className="w-full h-full object-cover object-top"
          />
        )}
        {/* Gradient overlays */}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-background/80 to-transparent" />
      </div>

      {/* Back button (fixed overlay) */}
      <Button
        variant="glass"
        size="sm"
        icon={ArrowLeft}
        onClick={() => navigate(-1)}
        className="fixed top-10 left-[calc(5rem+1.5rem)] lg:left-[calc(16rem+1.5rem)] z-50"
      >
        Back
      </Button>

      {/* ── Content ─────────────────────────────────────────────────────────── */}
      <div className="px-8 lg:px-16 -mt-[270px] relative z-10">
        <div className="flex gap-8 items-start mb-8">
          {/* Poster */}
          <div className="hidden md:block shrink-0 w-44 rounded-2xl overflow-hidden shadow-2xl border border-zinc-800/60">
            <img src={poster} alt={title} className="w-full h-full object-cover" />
          </div>

          {/* Title block */}
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap gap-2 mb-3">
              {genres.map((g) => (
                <Badge
                  key={g.id}
                  variant="gray"
                  size="lg"
                >
                  {g.name}
                </Badge>
              ))}
            </div>

            <div className="flex items-center gap-4 mb-2">
              <h1 className="text-4xl lg:text-5xl font-black leading-tight drop-shadow-lg">
                {title}
              </h1>
            </div>

            {tagline && (
              <p className="text-zinc-400 italic text-sm mb-4">{tagline}</p>
            )}

            {/* Meta row */}
            <div className="flex flex-wrap items-center gap-4 text-sm text-zinc-400 mb-6">
              <span className="flex items-center gap-1.5 text-yellow-400 font-bold">
                <Star size={15} fill="currentColor" />
                {rating.toFixed(1)}/10
              </span>
              {metaItems.map((m, i) => (
                <span key={i} className="flex items-center gap-1.5 text-zinc-400">
                  {m.icon} {m.label}
                </span>
              ))}
              {isMovie(details) && details.imdb_id && (
                <a
                  href={`https://www.imdb.com/title/${details.imdb_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-yellow-500 hover:text-yellow-400 transition-colors text-xs"
                >
                  IMDb <ExternalLink size={12} />
                </a>
              )}
            </div>

            {/* Actions (Trailer + Favorite) */}
            <div className="flex items-center gap-4 mb-6">
              {trailer && (
                <a
                  href={`https://www.youtube.com/watch?v=${trailer.key}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block"
                >
                  <Button variant="accent" className="!bg-primary/20 hover:!bg-primary/30 !border-primary/30">
                    ▶ Watch Trailer
                  </Button>
                </a>
              )}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  const releaseDate = isMovie(details) ? details.release_date : (details as TvDetails).first_air_date;
                  toggleFavorite({
                    id: details.id,
                    mediaType,
                    title,
                    posterPath: details.poster_path,
                    rating: details.vote_average,
                    releaseDate,
                  });
                }}
                className={`shrink-0 rounded-full border transition-colors ${
                  isFavorite(details.id, mediaType)
                    ? 'bg-white/20 border-white/40 text-white'
                    : 'bg-zinc-800/60 border-zinc-700/50 text-zinc-400 hover:text-white hover:border-white/30'
                }`}
              >
                <Heart size={20} fill={isFavorite(details.id, mediaType) ? 'currentColor' : 'none'} />
              </Button>
            </div>

            {/* Overview in overlay */}
            {overview && (
              <div className="mt-2">
                <p className="text-gray-300 leading-relaxed max-w-3xl text-sm md:text-base drop-shadow-md">
                  {overview}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* ── Cast ──────────────────────────────────────────────────────────── */}
        {cast.length > 0 && (
          <section className="mb-10">
            <h2 className="text-base font-bold uppercase tracking-widest text-zinc-500 mb-4">Cast</h2>
            <div className="flex gap-4 overflow-x-auto pb-2" style={{ scrollbarWidth: 'none' }}>
              {cast.map((member) => (
                <div key={member.id} className="shrink-0 w-24 text-center">
                  <div className="w-24 h-24 rounded-full overflow-hidden border-2 border-zinc-800 mb-2 mx-auto">
                    <img
                      src={profileUrl(member.profile_path)}
                      alt={member.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <p className="text-xs font-semibold text-white leading-tight line-clamp-2">{member.name}</p>
                  <p className="text-[10px] text-zinc-500 mt-0.5 line-clamp-1">{member.character}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Divider ───────────────────────────────────────────────────────── */}
        <div className="border-t border-zinc-800/60 my-8" />

        {/* ── Torrents ──────────────────────────────────────────────────────── */}
        <div ref={torrentSectionRef}>
          <TorrentList
            results={torrents}
            loading={torrentsLoading}
            error={torrentsError}
            qualityFilter={qualityFilter}
            setQualityFilter={setQualityFilter}
            languageFilter={languageFilter}
            setLanguageFilter={setLanguageFilter}
          />
        </div>

        {/* ── Divider ───────────────────────────────────────────────────────── */}
        <div className="border-t border-zinc-800/60 my-8" />

        {/* ── TV Seasons and Episodes ───────────────────────────────────────── */}
        {!isMovie(details) && details.seasons && details.seasons.length > 0 && (
          <section className="mb-10">
            <h2 className="text-base font-bold uppercase tracking-widest text-zinc-500 mb-4">Seasons & Episodes</h2>
            
            {/* Season Selector */}
            <div className="mb-4">
              <Carousel containerClassName="!mx-0 !px-0" contentClassName="gap-2 pb-2">
                {details.seasons.map((s: TvSeason) => (
                  <Button
                    key={s.id}
                    variant={selectedSeason === s.season_number ? 'primary' : 'ghost'}
                    size="sm"
                    onClick={() => setSelectedSeason(s.season_number)}
                    className={`shrink-0 ${selectedSeason === s.season_number ? '!bg-primary/20 !text-primary !border-primary/30' : 'bg-zinc-900 border-zinc-800'}`}
                  >
                    {s.name}
                  </Button>
                ))}
              </Carousel>
            </div>

            {/* Season Details and Episodes */}
            {seasonLoading ? (
              <div className="py-12 flex justify-center text-primary/50">
                <Spinner size="md" />
              </div>
            ) : seasonDetails && (
              <div className="space-y-6">
                <div className="flex items-center justify-between bg-zinc-900/50 border border-zinc-800/60 p-4 rounded-2xl">
                  <div>
                    <h3 className="font-bold text-lg text-gray-200">{seasonDetails.name}</h3>
                    <p className="text-xs text-zinc-500">{seasonDetails.episodes.length} Episodes</p>
                  </div>
                  <Button 
                    size="sm" 
                    variant="accent" 
                    onClick={handleSearchSeason}
                    className="shrink-0"
                  >
                    Search Season
                  </Button>
                </div>

                <div className="space-y-3">
                  {seasonDetails.episodes.map((ep) => {
                    const epKey = watchedKeyEpisode(details.id, selectedSeason!, ep.episode_number);
                    const epWatched = isWatched(epKey);
                    return (
                    <div key={ep.id} className={`flex flex-col md:flex-row gap-4 bg-zinc-900 border border-zinc-800/60 rounded-xl p-3 transition-colors ${epWatched ? 'opacity-50' : 'hover:bg-zinc-800/40'}`}>
                      {ep.still_path && (
                        <div className="w-full md:w-48 h-28 shrink-0 rounded-lg overflow-hidden bg-zinc-800 relative">
                          <img src={backdropUrl(ep.still_path, 'w780')} alt={ep.name} className="w-full h-full object-cover" />
                          {epWatched && (
                            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                              <CheckCircle className="w-8 h-8 text-white/80" />
                            </div>
                          )}
                        </div>
                      )}
                      <div className="flex-1 min-w-0 flex flex-col justify-center">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <h4 className="font-bold text-gray-200 text-sm mb-1">
                              <span className="text-zinc-500 mr-2">{ep.episode_number}.</span>
                              {ep.name}
                              {epWatched && (
                                <span className="ml-2 text-[10px] text-white/70 font-normal uppercase tracking-wider">Watched</span>
                              )}
                            </h4>
                            {ep.air_date && <p className="text-[10px] text-zinc-500 mb-2">{ep.air_date}</p>}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => toggleWatched(epKey)}
                              className={`p-1.5 rounded-full border transition-colors ${
                                epWatched
                                  ? 'bg-white/20 border-white/40 text-white'
                                  : 'bg-zinc-800/60 border-zinc-700/50 text-zinc-500 hover:text-white hover:border-white/30'
                              }`}
                              title={epWatched ? 'Mark as unwatched' : 'Mark as watched'}
                            >
                              <CheckCircle size={14} />
                            </Button>
                            <Button 
                              size="sm" 
                              variant="accent" 
                              onClick={() => handleSearchEpisode(ep.episode_number)} 
                              className="shrink-0 text-xs py-1 h-auto"
                            >
                              Search Episode
                            </Button>
                          </div>
                        </div>
                        <p className="text-xs text-zinc-400 line-clamp-2 md:line-clamp-3">{ep.overview}</p>
                      </div>
                    </div>
                    );
                  })}
                </div>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
