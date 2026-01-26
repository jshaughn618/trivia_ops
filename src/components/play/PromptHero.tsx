import type { ReactNode } from 'react';

export function PromptHero({ children, className, align = 'center' }: { children: ReactNode; className?: string; align?: 'center' | 'left' }) {
  return (
    <div
      className={`text-[clamp(2rem,6vw,4rem)] leading-tight landscape:text-[clamp(1.75rem,4vw,3rem)] ${
        align === 'center' ? 'text-center' : 'text-left'
      } ${className ?? ''}`}
    >
      {children}
    </div>
  );
}
