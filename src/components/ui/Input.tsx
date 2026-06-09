import React, { useId } from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: React.ReactNode;
  variant?: 'default' | 'ghost';
}

export const Input: React.FC<InputProps> = ({
  label,
  error,
  icon,
  className = '',
  id,
  variant = 'default',
  ...props
}) => {
  const defaultId = useId();
  const inputId = id || defaultId;
  
  return (
    <div className="w-full space-y-1.5">
      {label && (
        <label 
          htmlFor={inputId}
          className="text-[10px] text-gray-400 font-black uppercase tracking-widest block ml-1"
        >
          {label}
        </label>
      )}
      <div className="relative">
        <input
          id={inputId}
          className={`
            w-full transition-all outline-none 
            ${variant === 'default' 
              ? 'bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-sm font-bold focus:ring-2 focus:ring-blue-500 text-white placeholder:text-zinc-600'
              : 'bg-transparent border-none p-0 focus:ring-0 placeholder:text-gray-400'
            }
            ${icon ? (variant === 'default' ? 'pl-10' : 'pl-8') : ''}
            ${error ? 'border-rose-500 focus:ring-rose-500' : ''}
            ${className}
          `}
          {...props}
        />
        {icon && (
          <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400">
            {icon}
          </div>
        )}
      </div>
      {error && (
        <p className="text-[9px] font-black text-rose-500 uppercase tracking-widest ml-1">
          {error}
        </p>
      )}
    </div>
  );
};
