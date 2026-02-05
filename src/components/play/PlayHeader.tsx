import type { ReactNode } from 'react';

export function PlayHeader({
  title,
  code,
  meta,
  team,
  menu
}: {
  title: string;
  code: string;
  meta?: string;
  team?: ReactNode;
  menu?: ReactNode;
}) {
  return (
    <header className="px-4 pb-1.5 pt-2 sm:px-6 sm:pt-2.5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-sm font-display tracking-tight sm:text-base">{title}</div>
          <div className="mt-1 text-[11px] uppercase tracking-[0.25em] text-muted">Code {code}</div>
          {meta && <div className="mt-1 text-xs text-muted">{meta}</div>}
        </div>
        <div className="flex items-center gap-3">
          {team}
          {menu}
        </div>
      </div>
    </header>
  );
}
