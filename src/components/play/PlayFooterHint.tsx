import type { ReactNode } from 'react';

export function PlayFooterHint({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={`text-xs uppercase tracking-[0.2em] text-muted ${className ?? ''}`}>{children}</div>
  );
}
