import React from 'react';
import { cn } from '@/lib/utils';

type BadgeVariant = 'blue' | 'emerald' | 'rose' | 'amber' | 'purple' | 'indigo' | 'gray';
type BadgeSize = 'sm' | 'md' | 'lg';

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  size?: BadgeSize;
  className?: string;
}

const variantStyles: Record<BadgeVariant, string> = {
  blue: "bg-blue-900/30 text-blue-400",
  emerald: "bg-emerald-900/30 text-emerald-400",
  rose: "bg-rose-900/30 text-rose-400",
  amber: "bg-amber-900/30 text-amber-400",
  purple: "bg-purple-900/30 text-purple-400",
  indigo: "bg-indigo-900/40 text-indigo-300",
  gray: "bg-zinc-800 text-zinc-400",
};

const sizeStyles: Record<BadgeSize, string> = {
  sm: "px-1.5 py-0.5 rounded text-[8px]",
  md: "px-2.5 py-1 rounded-lg text-[8px]",
  lg: "px-4 py-1.5 rounded-full text-[10px]",
};

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'gray',
  size = 'md',
  className = ''
}) => {
  return (
    <span className={cn(
      "inline-flex items-center font-black uppercase tracking-widest",
      variantStyles[variant],
      sizeStyles[size],
      className
    )}>
      {children}
    </span>
  );
};
