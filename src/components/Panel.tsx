import type { ReactNode } from 'react';

export function Panel({ title, action, children }: { title?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-panel p-4 shadow-sm">
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between border-b border-border pb-2">
          <h2 className="ui-label">{title}</h2>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
