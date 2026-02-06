import type { ReactNode } from 'react';

export function PromptHero({ children, className, align = 'center' }: { children: ReactNode; className?: string; align?: 'center' | 'left' }) {
  return (
    <div
      className={`text-[clamp(2.2rem,9vw,4.2rem)] font-display leading-[1.1] tracking-tight landscape:text-[clamp(1.8rem,6vw,3.2rem)] ${
        align === 'center' ? 'text-center' : 'text-left'
      } ${className ?? ''}`}
    >
      {children}
    </div>
  );
}
