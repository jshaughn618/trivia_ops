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
    <div className="relative min-h-screen bg-bg text-text">
      <HeaderBar />
      <main className="page-reveal mx-auto max-w-7xl px-4 py-7 sm:px-6 lg:px-8 lg:py-8">
        {showTitle && (
          <div className="mb-7 border-b border-border pb-4">
            <h1 className="text-[1.75rem] font-display tracking-tight sm:text-[1.95rem]">{title}</h1>
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
