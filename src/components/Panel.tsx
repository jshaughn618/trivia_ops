import type { ReactNode } from 'react';

export function Panel({
  title,
  action,
  children,
  className,
  headerDivider = true
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  headerDivider?: boolean;
}) {
  return (
    <section className={`surface-card p-5 sm:p-6 ${className ?? ''}`}>
      {(title || action) && (
        <div className={`mb-5 flex items-center justify-between gap-3 pb-4 ${headerDivider ? 'border-b border-border' : ''}`}>
          <h2 className="panel-title">{title}</h2>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
