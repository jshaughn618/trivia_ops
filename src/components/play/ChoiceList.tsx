import type { ReactNode } from 'react';

export function ChoiceList({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={`w-full max-w-3xl space-y-3 ${className ?? ''}`}>{children}</div>;
}
