import type { ReactNode } from 'react';

export function Panel({
  title,
  action,
  children,
  className
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`surface-card p-5 sm:p-6 ${className ?? ''}`}>
      {(title || action) && (
        <div className="mb-5 flex items-center justify-between gap-3 border-b border-border pb-4">
          <h2 className="panel-title">{title}</h2>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
