import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Heart, CheckCircle, Plus } from 'lucide-react';
import { posterUrl } from '../api/tmdb';
import { useLibrary } from '../lib/LibraryContext';
import { watchedKeyMedia } from '../api/library';
import { Button } from './ui';
import { cn } from '../lib/utils';

interface MediaCardProps {
  id: number;
  title: string;
  posterPath: string | null;
  rating?: number;
  releaseDate?: string;
  mediaType: 'movie' | 'tv';
  className?: string;
}

export const MediaCard: React.FC<MediaCardProps> = ({
  id,
  title,
  posterPath,
  rating,
  releaseDate,
  mediaType,
  className = 'w-full',
}) => {
  const navigate = useNavigate();
  const { toggleFavorite, isFavorite, toggleWatched, isWatched, toggleToWatch, isToWatch } = useLibrary();
  const imageUrl = posterUrl(posterPath, 'w500');
  const year = releaseDate ? new Date(releaseDate).getFullYear() : '';

  const favorite = isFavorite(id, mediaType);
  const watchedKey = watchedKeyMedia(id, mediaType);
  const watched = isWatched(watchedKey);
  const inToWatch = isToWatch(watchedKey);

  const handleToggleFavorite = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleFavorite({ id, mediaType, title, posterPath, rating, releaseDate });
  };

  const handleToggleWatched = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleWatched(watchedKey);
  };

  const handleToggleToWatch = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleToWatch(watchedKey);
  };

  return (
    <div
      onClick={() => navigate(`/${mediaType}/${id}`)}
      className={`group relative cursor-pointer overflow-hidden rounded-2xl transition-all duration-300 hover:scale-105 hover:z-10 shadow-lg ${className}`}
    >
      {/* Poster */}
      <div className="aspect-[2/3] w-full bg-zinc-800">
        <img
          src={imageUrl}
          alt={title}
          className={`h-full w-full object-cover transition-all duration-300 group-hover:scale-110 ${watched ? 'brightness-[0.35]' : ''}`}
        />
      </div>

      {/* Watched persistent overlay */}
      {watched && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
          <CheckCircle className="w-12 h-12 text-white/70" />
        </div>
      )}

      {/* Action icons — visible on hover */}
      <div className="absolute top-2 right-2 z-20 flex flex-col gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        <Button
          variant="ghost"
          size="icon"
          onClick={handleToggleFavorite}
          aria-label={favorite ? 'Remove from favorites' : 'Add to favorites'}
          className={`p-1.5 backdrop-blur-sm transition-colors ${
            favorite
              ? 'bg-white/20 text-white'
              : 'bg-black/50 text-white/70 hover:text-white hover:bg-white/20'
          }`}
        >
          <Heart size={16} fill={favorite ? 'currentColor' : 'none'} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleToggleWatched}
          aria-label={watched ? 'Mark as unwatched' : 'Mark as watched'}
          className={`p-1.5 backdrop-blur-sm transition-colors ${
            watched
              ? 'bg-white/20 text-white'
              : 'bg-black/50 text-white/70 hover:text-white hover:bg-white/20'
          }`}
        >
          <CheckCircle size={16} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleToggleToWatch}
          aria-label={inToWatch ? 'Remove from watchlist' : 'Add to watchlist'}
          className={`p-1.5 backdrop-blur-sm transition-colors ${
            inToWatch
              ? 'bg-white/20 text-white'
              : 'bg-black/50 text-white/70 hover:text-white hover:bg-white/20'
          }`}
        >
          <Plus size={16} className={cn('transition-transform duration-200', inToWatch && 'rotate-45')} />
        </Button>
      </div>

      {/* Favorite / to-watch badges — always visible */}
      <div className="absolute top-2 left-2 z-20 flex flex-col gap-1.5">
        {favorite && (
          <Heart size={14} fill="currentColor" className="text-white drop-shadow-lg" />
        )}
        {inToWatch && (
          <Plus size={14} className="text-white drop-shadow-lg" />
        )}
      </div>

      {/* Hover overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100 flex flex-col justify-end p-4">
        {/* Info */}
        <div className="z-10 transform translate-y-2 opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100">
          <h3 className="text-white font-bold text-sm line-clamp-2 mb-1">{title}</h3>
          <div className="flex items-center gap-2 text-xs text-gray-300">
            {year && <span>{year}</span>}
            {rating && (
              <span className="flex items-center gap-1 text-yellow-400">
                ★ {rating.toFixed(1)}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
