import type { ReactNode } from 'react';

export function PlayShell({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`play-shell min-h-[100dvh] bg-bg text-text ${className ?? ''}`}
      style={{
        paddingTop: 'max(env(safe-area-inset-top), 0px)',
        paddingBottom: 'max(env(safe-area-inset-bottom), 0px)'
      }}
    >
      {children}
    </div>
  );
}
