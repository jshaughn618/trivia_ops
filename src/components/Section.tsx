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
    <section className={`surface-card ${className ?? ''}`}>
      {(title || actions) && (
        <div
          className={`flex items-center justify-between gap-3 border-b border-border px-5 py-4 sm:px-6 ${
            headerClassName ?? ''
          }`}
        >
          {title ? <h2 className="panel-title">{title}</h2> : <span />}
          {actions}
        </div>
      )}
      <div className={`px-5 py-5 sm:px-6 sm:py-6 ${bodyClassName ?? ''}`}>{children}</div>
    </section>
  );
}
