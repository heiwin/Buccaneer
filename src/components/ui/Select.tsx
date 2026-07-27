import { useId, useState, useRef, useEffect } from 'react';
import { ChevronsUpDown, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/lib/utils';

export interface SelectOption {
  value: string;
  label: string;
  group?: string; // Optional group name
}

export interface SelectGroup {
  label: string;
  options: SelectOption[];
}

interface SelectProps extends Omit<React.ComponentPropsWithoutRef<'button'>, 'value' | 'onChange'> {
  label?: string;
  error?: string;
  icon?: React.ReactNode;
  options?: (SelectOption | SelectGroup)[];
  value?: string | string[];
  onChange?: (event: {
    target: { value: string | string[]; name?: string };
    currentTarget: { value: string | string[]; name?: string };
    preventDefault: () => void;
    stopPropagation: () => void;
  }) => void;
  placeholder?: string;
  multiple?: boolean;
  hideLabelInButton?: boolean; 
  size?: 'sm' | 'md'; // New: size support
  required?: boolean;
}

/**
 * Premium Custom Select Component
 * Supports single/multiple selection and grouped options.
 */
export const Select: React.FC<SelectProps> = ({
  label,
  error,
  icon,
  options: providedOptions,
  children,
  value,
  onChange,
  placeholder = 'Select an option...',
  className = '',
  id,
  disabled = false,
  multiple = false,
  hideLabelInButton = false,
  size = 'md',
  ...props
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const defaultId = useId();
  const selectId = id || defaultId;

  // Final structure to render and flat list for lookup
  const groupedStructure: (SelectOption | SelectGroup)[] = [];
  const flatOptions: SelectOption[] = [];

  // 1. Process provided options
  if (providedOptions) {
    providedOptions.forEach(item => {
      groupedStructure.push(item);
      if ('options' in item) {
        flatOptions.push(...item.options);
      } else {
        flatOptions.push(item);
      }
    });
  }

  // Children-based option parsing is intentionally removed.
  // Use the `options` prop exclusively for type safety.

  // Handle selected label(s)
  const isSelected = (val: string) => {
    if (multiple && Array.isArray(value)) {
      return value.includes(val);
    }
    return value === val;
  };

  const selectedOptions = flatOptions.filter(opt => isSelected(opt.value));
  
  const displayLabel = hideLabelInButton 
    ? placeholder 
    : (selectedOptions.length > 0 
        ? (multiple ? selectedOptions.length.toString() : selectedOptions[0].label)
        : placeholder);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Handle selection
  const handleSelect = (optionValue: string) => {
    if (disabled) return;
    
    let newValue: string | string[];
    if (multiple) {
      const currentValues = Array.isArray(value) ? [...value] : [];
      if (currentValues.includes(optionValue)) {
        newValue = currentValues.filter(v => v !== optionValue);
      } else {
        newValue = [...currentValues, optionValue];
      }
    } else {
      newValue = optionValue;
    }

    if (onChange) {
      const syntheticEvent = {
        target: { value: newValue, name: id },
        currentTarget: { value: newValue, name: id },
        preventDefault: () => {},
        stopPropagation: () => {},
      };
      onChange(syntheticEvent);
    }

    if (!multiple) {
      setIsOpen(false);
    }
  };

  const renderOption = (opt: SelectOption) => {
    const active = isSelected(opt.value);
    return (
      <button
        key={opt.value}
        type="button"
        role="option"
        aria-selected={active}
        onClick={() => handleSelect(opt.value)}
        className={cn(
          "w-full px-4 py-2 text-[12px] font-bold text-left flex items-center justify-between transition-all",
          active 
            ? "bg-zinc-800 text-white" 
            : "text-zinc-300 hover:bg-zinc-800 hover:text-white"
        )}
      >
        <span className="truncate">{opt.label}</span>
        {active && (
          <motion.div
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
          >
            <Check className="w-3.5 h-3.5 stroke-[3px] text-blue-400" />
          </motion.div>
        )}
      </button>
    );
  };

  return (
    <div className={cn("w-full space-y-1.5 relative", className)} ref={containerRef}>
      {label && (
        <label 
          htmlFor={selectId}
          className="text-[10px] text-gray-400 font-black uppercase tracking-widest block ml-1"
        >
          {label}
        </label>
      )}
      
      <div className="relative">
        <button
          {...props}
          id={selectId}
          type="button"
          role="combobox"
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          aria-controls={`${selectId}-listbox`}
          disabled={disabled}
          onClick={() => !disabled && setIsOpen(!isOpen)}
          className={cn(
            "w-full bg-zinc-900 text-white border border-zinc-800",
            "rounded-full font-bold flex items-center justify-between",
            "transition-all outline-none cursor-pointer text-left shadow-sm",
            "hover:bg-zinc-800 hover:border-zinc-700",
            size === 'sm' ? "p-2 px-4 text-[13px]" : "p-3 px-5 text-sm",
            isOpen && "ring-4 ring-blue-500/10 border-blue-500 bg-zinc-900",
            error && "border-rose-500 ring-4 ring-rose-500/10",
            disabled && "opacity-50 cursor-not-allowed grayscale"
          )}
        >
          <div className="flex items-center gap-2.5 overflow-hidden">
            {icon && <span className="text-white/70 shrink-0">{icon}</span>}
            <span className={cn(
              "truncate transition-colors",
              selectedOptions.length === 0 ? "text-white/50 font-medium" : "text-white"
            )}>
              {displayLabel}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <ChevronsUpDown 
              className={cn(
                "w-4 h-4 text-white/70 transition-transform duration-300 ease-out shrink-0",
                isOpen && "rotate-180 text-blue-400"
              )} 
            />
          </div>
        </button>

        <AnimatePresence>
          {isOpen && (
            <motion.div
              id={`${selectId}-listbox`}
              role="listbox"
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 6, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              transition={{ duration: 0.15, ease: [0.23, 1, 0.32, 1] }}
              className={cn(
                "absolute z-[100] w-64 mt-1",
                "bg-zinc-900/95 backdrop-blur-xl",
                "border border-zinc-800/50",
                "rounded-2xl shadow-2xl shadow-black/40",
                "overflow-hidden py-2"
              )}
            >
              <div className="max-h-96 overflow-y-auto scrollbar-hide">
                {groupedStructure.length > 0 ? (
                  groupedStructure.map((item, idx) => {
                    if ('options' in item) {
                      return (
                        <div key={`group-${idx}`} className="mb-2 last:mb-0">
                          <div className="px-4 py-1 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] bg-white/5">
                            {item.label}
                          </div>
                          <div className="mt-1">
                            {item.options.map(opt => renderOption(opt))}
                          </div>
                        </div>
                      );
                    }
                    return renderOption(item);
                  })
                ) : (
                  <div className="px-4 py-4 text-xs text-gray-400 font-bold uppercase tracking-widest text-center">
                    No options
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {error && (
        <motion.p 
          initial={{ opacity: 0, x: -4 }}
          animate={{ opacity: 1, x: 0 }}
          className="text-[9px] font-black text-rose-500 uppercase tracking-widest ml-1"
        >
          {error}
        </motion.p>
      )}
    </div>
  );
};
