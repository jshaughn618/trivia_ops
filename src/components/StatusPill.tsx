const variants: Record<string, string> = {
  live: 'border-accent-ink bg-accent-soft text-accent-ink',
  planned: 'border-border bg-panel2/70 text-muted',
  completed: 'border-border bg-panel2/70 text-muted',
  canceled: 'border-danger/70 bg-danger/20 text-danger-ink',
  locked: 'border-border bg-panel2/70 text-muted',
  default: 'border-border bg-panel2/70 text-muted'
};

export function StatusPill({ status, label }: { status: string; label?: string }) {
  const key = status.toLowerCase();
  const classes = variants[key] ?? variants.default;
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] ${classes}`}
    >
      {label ?? status}
    </span>
  );
}
