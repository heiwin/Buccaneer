
import { cn } from '@/lib/utils';

export interface SegmentedControlOption<T extends string = string> {
  value: T;
  label: string;
}

interface SegmentedControlProps<T extends string> {
  options: SegmentedControlOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
  size?: 'sm' | 'md';
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className = '',
  size = 'md'
}: SegmentedControlProps<T>) {
  return (
    <div className={cn(
      "flex bg-zinc-900 border border-zinc-800 p-1 rounded-full shadow-inner overflow-x-auto no-scrollbar",
      className
    )}>
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={cn(
            "flex-none rounded-full font-black uppercase tracking-widest transition-all whitespace-nowrap",
            size === 'sm' ? "px-4 py-1.5 text-[9px]" : "px-6 py-2 text-[10px]",
            value === opt.value 
              ? "bg-zinc-800 text-white shadow-sm" 
              : "text-zinc-500 hover:text-zinc-300"
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
};
