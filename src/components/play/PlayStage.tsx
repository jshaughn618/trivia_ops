import type { ReactNode } from 'react';

export function PlayStage({
  children,
  className,
  scrollable,
  fullBleed
}: {
  children: ReactNode;
  className?: string;
  scrollable?: boolean;
  fullBleed?: boolean;
}) {
  const minHeight = fullBleed ? 'min-h-[100svh]' : 'min-h-[70svh]';
  return (
    <section className={`flex-1 ${scrollable ? 'overflow-y-auto' : ''} ${className ?? ''}`}>
      <div
        className={`mx-auto flex w-full max-w-5xl flex-col items-center justify-center gap-6 px-5 py-8 landscape:py-4 ${minHeight}`}
      >
        {children}
      </div>
    </section>
  );
}
