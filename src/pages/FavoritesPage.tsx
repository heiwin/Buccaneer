import { Heart } from 'lucide-react';
import { useLibrary } from '../lib/LibraryContext';
import { PageHeader } from '../components/ui';
import { MediaCard, EmptyState } from '../components';

export function FavoritesPage() {
  const { favorites } = useLibrary();

  const movieFavorites = favorites
    .filter((f) => f.mediaType === 'movie')
    .sort((a, b) => b.addedAt - a.addedAt);
  const tvFavorites = favorites
    .filter((f) => f.mediaType === 'tv')
    .sort((a, b) => b.addedAt - a.addedAt);

  return (
    <div className="p-8">
      <PageHeader icon={Heart} title="Favorites" className="mb-12" />

      {favorites.length === 0 ? (
        <EmptyState
          icon={Heart}
          message="No favorites yet"
          subMessage="Click the heart icon on any movie or TV series card to add it here"
        />
      ) : (
        <div className="space-y-12 pb-20">
          {/* Movies */}
          {movieFavorites.length > 0 && (
            <section>
              <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                Movies
                <span className="text-xs font-normal text-zinc-500 uppercase tracking-wider ml-2">
                  {movieFavorites.length} title{movieFavorites.length !== 1 ? 's' : ''}
                </span>
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5">
                {movieFavorites.map((item) => (
                  <MediaCard
                    key={item.id}
                    id={item.id}
                    mediaType="movie"
                    title={item.title}
                    posterPath={item.posterPath}
                    rating={item.rating}
                    releaseDate={item.releaseDate}
                  />
                ))}
              </div>
            </section>
          )}

          {/* TV Series */}
          {tvFavorites.length > 0 && (
            <section>
              <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                TV Series
                <span className="text-xs font-normal text-zinc-500 uppercase tracking-wider ml-2">
                  {tvFavorites.length} title{tvFavorites.length !== 1 ? 's' : ''}
                </span>
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5">
                {tvFavorites.map((item) => (
                  <MediaCard
                    key={item.id}
                    id={item.id}
                    mediaType="tv"
                    title={item.title}
                    posterPath={item.posterPath}
                    rating={item.rating}
                    releaseDate={item.releaseDate}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
