import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  title?: string;
  icon?: React.ReactNode;
  headerAction?: React.ReactNode;
}

export const Card: React.FC<CardProps> = ({
  children,
  className = '',
  title,
  icon,
  headerAction
}) => {
  return (
    <div className={`
      bg-zinc-900 rounded-[40px] p-8 border border-zinc-800 shadow-sm
      ${className}
    `}>
      {(title || icon || headerAction) && (
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            {icon && (
              <div className="w-10 h-10 flex items-center justify-center bg-zinc-800 rounded-xl text-zinc-400">
                {icon}
              </div>
            )}
            {title && (
              <h2 className="text-sm font-black text-zinc-50 uppercase tracking-widest">
                {title}
              </h2>
            )}
          </div>
          {headerAction && (
            <div>{headerAction}</div>
          )}
        </div>
      )}
      {children}
    </div>
  );
};
