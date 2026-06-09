import type { ElementType } from 'react';

interface EmptyStateProps {
  icon: ElementType;
  message: string;
  subMessage?: string;
  className?: string;
}

export function EmptyState({ icon: Icon, message, subMessage, className = '' }: EmptyStateProps) {
  return (
    <div className={`py-24 text-center text-zinc-600 ${className}`}>
      <Icon className="w-10 h-10 mx-auto mb-4 opacity-30" />
      <p className="text-sm">{message}</p>
      {subMessage && <p className="text-xs text-zinc-700 mt-2">{subMessage}</p>}
    </div>
  );
}
