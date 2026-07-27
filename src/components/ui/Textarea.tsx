import React, { forwardRef } from 'react';
import { cn } from '@/lib/utils';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, error, required, ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1.5 w-full relative">
        {label && (
          <label className="text-[10px] text-gray-400 font-black uppercase tracking-widest ml-1">
            {label} {required && <span className="text-rose-500">*</span>}
          </label>
        )}
        <div className="relative group w-full">
          <textarea
            className={cn(
              "flex min-h-[80px] w-full rounded-xl bg-zinc-800 border border-zinc-700 p-4 text-sm font-bold placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50",
              error && "border-rose-900/50 focus:ring-rose-500/30",
              className
            )}
            ref={ref}
            required={required}
            {...props}
          />
        </div>
        {error && (
          <span className="text-[10px] font-bold text-rose-500 uppercase tracking-wider ml-1 mt-0.5">
            {error}
          </span>
        )}
      </div>
    );
  }
);
Textarea.displayName = 'Textarea';
