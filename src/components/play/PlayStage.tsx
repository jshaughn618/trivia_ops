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
  const minHeight = fullBleed
    ? 'min-h-[calc(100svh-3.25rem)]'
    : 'min-h-[calc(70svh-2.5rem)]';
  return (
    <section className={`flex-1 ${scrollable ? 'overflow-y-auto' : ''} ${className ?? ''}`}>
      <div
        className={`mx-auto flex w-full max-w-5xl flex-col items-center justify-start gap-5 px-4 py-3 sm:px-5 sm:py-4 landscape:py-2 ${minHeight}`}
      >
        {children}
      </div>
    </section>
  );
}
