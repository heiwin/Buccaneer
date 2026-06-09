import { AlertCircle } from 'lucide-react';

interface ErrorBannerProps {
  error: string;
  /** Show AlertCircle icon on the left. Defaults to false. */
  withIcon?: boolean;
  className?: string;
}

export function ErrorBanner({ error, withIcon = false, className = '' }: ErrorBannerProps) {
  return (
    <div
      className={`${withIcon ? 'flex items-center gap-3' : ''} bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-xl text-sm ${className}`}
    >
      {withIcon && <AlertCircle className="w-4 h-4 shrink-0" />}
      {error}
    </div>
  );
}
