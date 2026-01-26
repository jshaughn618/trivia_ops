import type { ReactNode } from 'react';

export function PlayShell({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`min-h-[100svh] bg-bg text-text ${className ?? ''}`}
      style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {children}
    </div>
  );
}
