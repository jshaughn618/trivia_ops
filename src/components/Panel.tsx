import type { ReactNode } from 'react';

export function Panel({ title, action, children }: { title?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="border-2 border-border bg-panel p-4">
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between border-b-2 border-border pb-2">
          <h2 className="text-sm font-display uppercase tracking-[0.3em] text-muted">
            {title}
          </h2>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
