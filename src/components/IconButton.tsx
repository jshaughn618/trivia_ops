import type { ButtonHTMLAttributes } from 'react';

export function IconButton({ label, className, ...props }: { label: string } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      aria-label={label}
      {...props}
      className={`flex h-8 w-8 items-center justify-center rounded-md border border-border bg-panel2 text-text transition-colors hover:bg-panel focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink focus-visible:ring-offset-2 focus-visible:ring-offset-bg ${
        className ?? ''
      }`}
    />
  );
}
