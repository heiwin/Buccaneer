import React from 'react';
import { type LucideIcon } from 'lucide-react';

interface PageHeaderProps {
  icon: LucideIcon;
  title: string;
  className?: string;
  /** Optional content rendered on the right side of the header */
  children?: React.ReactNode;
}

export function PageHeader({ icon: Icon, title, className = '', children }: PageHeaderProps) {
  return (
    <header className={`flex items-start justify-between mt-2 ${className}`}>
      <div className="flex items-end gap-3">
        <Icon className="w-7 h-7 text-primary shrink-0" />
        <h1 className="font-black text-xl tracking-widest uppercase leading-none">{title}</h1>
      </div>
      {children && <div className="ml-auto flex items-center">{children}</div>}
    </header>
  );
}
