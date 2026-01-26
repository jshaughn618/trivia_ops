import type { ReactNode } from 'react';

export function PageHeader({
  title,
  actions,
  children
}: {
  title: string;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="border-b border-border pb-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-display tracking-tight">{title}</h1>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children && <div className="mt-3">{children}</div>}
    </div>
  );
}
