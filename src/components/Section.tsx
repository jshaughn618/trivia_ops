import type { ReactNode } from 'react';

export function Section({
  title,
  actions,
  children,
  className,
  bodyClassName,
  headerClassName
}: {
  title?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  headerClassName?: string;
}) {
  return (
    <section className={`rounded-lg border border-border bg-panel ${className ?? ''}`}>
      {(title || actions) && (
        <div
          className={`flex items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-5 ${
            headerClassName ?? ''
          }`}
        >
          {title ? <h2 className="ui-label">{title}</h2> : <span />}
          {actions}
        </div>
      )}
      <div className={`px-4 py-4 sm:px-5 sm:py-5 ${bodyClassName ?? ''}`}>{children}</div>
    </section>
  );
}
