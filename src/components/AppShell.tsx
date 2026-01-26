import type { ReactNode } from 'react';
import { HeaderBar } from './HeaderBar';

export function AppShell({
  title,
  children,
  showTitle = true
}: {
  title: string;
  children: ReactNode;
  showTitle?: boolean;
}) {
  return (
    <div className="min-h-screen bg-bg text-text">
      <HeaderBar />
      <main className="mx-auto max-w-6xl px-4 py-6">
        {showTitle && (
          <div className="mb-6 border-b border-border pb-3">
            <h1 className="text-2xl font-display tracking-tight">{title}</h1>
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
