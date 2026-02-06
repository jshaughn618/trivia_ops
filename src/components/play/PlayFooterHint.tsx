import type { ReactNode } from 'react';

export function PlayFooterHint({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={`text-xs font-medium text-muted ${className ?? ''}`}>{children}</div>
  );
}
