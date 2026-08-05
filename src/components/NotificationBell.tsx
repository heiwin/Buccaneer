import { useState, useRef, useEffect, useCallback } from 'react';
import { Bell, BellRing } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { NewEpisode } from '../api/notifications';
import { posterUrl } from '../api/tmdb';
import { formatDate } from '../lib/utils';

interface NotificationBellProps {
  episodes: NewEpisode[];
  count: number;
  loading: boolean;
  onClearAll?: () => void;
  onClearOne?: (episode: NewEpisode) => void;
  align?: 'left' | 'right';
}

export function NotificationBell({ episodes, count, loading, onClearAll, onClearOne, align = 'right' }: NotificationBellProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        close();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, close]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(prev => !prev)}
        className="relative p-2 rounded-full hover:bg-zinc-800 transition-colors"
        title="New episodes"
      >
        {count > 0
          ? <BellRing size={18} className="text-primary-glow" />
          : <Bell size={18} className="text-zinc-400" />
        }
        {count > 0 && (
          <span className="absolute -top-1 -right-1 bg-primary text-background text-[10px] font-bold min-w-[16px] h-4 px-1 rounded-full shadow-lg shadow-black/50 flex items-center justify-center ring-2 ring-background">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      {open && (
        <div className={`absolute bottom-full mb-2 w-80 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl z-50 max-h-96 overflow-y-auto ${align === 'left' ? 'left-0' : 'right-0'}`}>
          <div className="p-3 border-b border-zinc-800 flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-zinc-300">
              {loading
                ? 'Checking for new episodes…'
                : episodes.length === 0
                  ? 'No new episodes'
                  : `${episodes.length} new episode${episodes.length !== 1 ? 's' : ''}`
              }
            </p>
            {!loading && episodes.length > 0 && (
              <button
                onClick={() => {
                  onClearAll?.();
                  setOpen(false);
                }}
                className="text-xs font-medium text-zinc-400 hover:text-zinc-200 transition-colors shrink-0"
              >
                Clear
              </button>
            )}
          </div>
          {!loading && episodes.length === 0 && (
            <div className="p-6 text-center text-zinc-600 text-sm">
              All caught up!
            </div>
          )}
          {!loading && episodes.length > 0 && (
            <div className="divide-y divide-zinc-800">
              {episodes.map((ep) => (
                <button
                  key={`${ep.showId}-${ep.seasonNumber}-${ep.episodeNumber}`}
                  onClick={() => {
                    onClearOne?.(ep);
                    navigate(`/tv/${ep.showId}`);
                    setOpen(false);
                  }}
                  className="w-full text-left p-3 hover:bg-zinc-800/50 transition-colors flex gap-3 items-start"
                >
                  <img
                    src={posterUrl(ep.posterPath, 'w300')}
                    alt={ep.showName}
                    className="w-10 h-14 rounded object-cover shrink-0"
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-zinc-200 truncate">{ep.showName}</p>
                    <p className="text-xs text-zinc-400">
                      S{String(ep.seasonNumber).padStart(2, '0')}E{String(ep.episodeNumber).padStart(2, '0')}
                    </p>
                    <p className="text-xs text-zinc-500 truncate">{ep.episodeName}</p>
                    <p className="text-[10px] text-zinc-600">{formatDate(ep.airDate)}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
