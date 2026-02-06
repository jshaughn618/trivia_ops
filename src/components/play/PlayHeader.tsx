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
    <header className="mx-auto w-full max-w-5xl px-3 pb-1 pt-2 sm:px-5">
      <div className="play-panel rounded-sm px-3 py-2">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-sm font-display tracking-tight text-text sm:text-base">{title}</div>
            <div className="mt-1 text-[11px] font-medium text-muted">Code {code}</div>
            {meta && <div className="mt-1 text-xs text-muted">{meta}</div>}
          </div>
          <div className="flex items-center gap-3">
            {team}
            {menu}
          </div>
        </div>
      </div>
    </header>
  );
}
