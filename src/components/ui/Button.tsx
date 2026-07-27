import React from 'react';
import { type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'accent' | 'glass';
  size?: 'sm' | 'md' | 'lg' | 'icon';
  icon?: LucideIcon;
  loading?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  icon: Icon,
  loading,
  className = '',
  disabled,
  ...props
}) => {
  const baseStyles = "inline-flex items-center justify-center gap-2 font-black uppercase tracking-widest transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none rounded-full";
  
  const variants = {
    primary: "bg-zinc-900 text-white hover:bg-zinc-800 shadow-sm",
    secondary: "bg-zinc-800 border border-zinc-700 text-gray-200 shadow-sm hover:border-blue-500",
    outline: "bg-transparent border border-zinc-700 text-zinc-400 hover:bg-zinc-800",
    ghost: "bg-transparent text-gray-400 hover:text-zinc-200",
    accent: "bg-primary/10 border border-primary/20 text-primary hover:bg-primary/20 hover:border-primary/40",
    danger: "bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:bg-rose-500/20 hover:border-rose-500/40",
    glass: "bg-black/40 hover:bg-black/70 backdrop-blur-sm border border-white/10 text-white"
  };

  const sizes = {
    sm: "h-8 px-4 text-[9px]",
    md: "h-10 px-6 text-[10px]",
    lg: "h-12 px-8 text-[11px]",
    icon: "w-10 h-10 p-0"
  };

  return (
    <button
      className={cn(baseStyles, variants[variant], sizes[size], className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <div className="w-4 h-4 border-2 border-current/20 border-t-current rounded-full animate-spin" />
      ) : (
        <>
          {Icon && <Icon size={size === 'sm' ? 14 : 16} />}
          {children}
        </>
      )}
    </button>
  );
};
