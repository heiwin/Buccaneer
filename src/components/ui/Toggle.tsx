import React from 'react';
import { cn } from '@/lib/utils';

export interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  className?: string;
  disabled?: boolean;
}

export const Toggle: React.FC<ToggleProps> = ({ checked, onChange, className, disabled = false }) => {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
        className={cn(
          "w-12 h-6 rounded-full relative transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-offset-2 dark:focus:ring-offset-zinc-900",
          checked ? 'bg-primary' : 'bg-zinc-700',
          disabled && 'opacity-50 cursor-not-allowed',
          className
        )}
    >
      <div
        className={cn(
          "absolute top-1 w-4 h-4 bg-white rounded-full transition-all shadow-sm",
          checked ? 'right-1' : 'left-1'
        )}
      />
    </button>
  );
};
