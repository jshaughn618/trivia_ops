import type { ReactNode } from 'react';

export function MediaFrame({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={`w-full rounded-2xl bg-panel/40 p-3 shadow-lg ${className ?? ''}`}>
      {children}
    </div>
  );
}
