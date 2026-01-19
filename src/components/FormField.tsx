import type { ReactNode } from 'react';

export function FormField({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-2">
      <span className="ui-label">{label}</span>
      {children}
      {hint && <span className="text-[10px] tracking-[0.2em] text-muted">{hint}</span>}
    </label>
  );
}
