import { useState, useRef, useEffect } from 'react';
import { Bell, BellRing } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { NewEpisode } from '../api/notifications';
import { posterUrl } from '../api/tmdb';

interface NotificationBellProps {
  episodes: NewEpisode[];
  count: number;
  loading: boolean;
}

export function NotificationBell({ episodes, count, loading }: NotificationBellProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 rounded-full hover:bg-zinc-800 transition-colors"
        title="New episodes"
      >
        {count > 0
          ? <BellRing size={18} className="text-primary" />
          : <Bell size={18} className="text-zinc-400" />
        }
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 bg-primary text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl z-50 max-h-96 overflow-y-auto">
          <div className="p-3 border-b border-zinc-800">
            <p className="text-sm font-semibold text-zinc-300">
              {loading
                ? 'Checking for new episodes…'
                : episodes.length === 0
                  ? 'No new episodes'
                  : `${episodes.length} new episode${episodes.length !== 1 ? 's' : ''}`
              }
            </p>
          </div>
          {!loading && episodes.length === 0 && (
            <div className="p-6 text-center text-zinc-600 text-sm">
              All caught up!
            </div>
          )}
          {!loading && episodes.length > 0 && (
            <div className="divide-y divide-zinc-800">
              {episodes.map((ep, i) => (
                <button
                  key={i}
                  onClick={() => {
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
                    <p className="text-[10px] text-zinc-600">{ep.airDate}</p>
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
