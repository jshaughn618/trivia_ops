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
    <section className={`surface-card p-4 ${className ?? ''}`}>
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between border-b border-border pb-3">
          <h2 className="panel-title">{title}</h2>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
