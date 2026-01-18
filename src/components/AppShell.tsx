import type { ReactNode } from 'react';
import { HeaderBar } from './HeaderBar';

export function AppShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-bg text-text">
      <HeaderBar />
      <main className="mx-auto max-w-6xl px-4 py-6">
        <div className="mb-6 border-b-2 border-border pb-3">
          <h1 className="text-2xl font-display uppercase tracking-[0.35em]">{title}</h1>
        </div>
        {children}
      </main>
    </div>
  );
}
