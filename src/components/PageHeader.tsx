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
    <div className="mb-1 border-b border-border pb-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-[1.7rem] font-display tracking-tight sm:text-[1.95rem]">{title}</h1>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children && <div className="mt-3.5">{children}</div>}
    </div>
  );
}
