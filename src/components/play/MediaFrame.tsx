import type { ReactNode } from 'react';

export function MediaFrame({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={`play-panel w-full rounded-md p-2.5 ${className ?? ''}`}>
      {children}
    </div>
  );
}
