const variants: Record<string, string> = {
  live: 'border-accent-ink bg-accent-soft text-accent-ink',
  planned: 'border-border bg-panel2/70 text-muted',
  completed: 'border-border bg-panel2/70 text-muted',
  canceled: 'border-danger/70 bg-danger/20 text-danger-ink',
  locked: 'border-border bg-panel2/70 text-muted',
  default: 'border-border bg-panel2/70 text-muted'
};

function toSentenceCase(value: string) {
  return value
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function StatusPill({ status, label }: { status: string; label?: string }) {
  const key = status.toLowerCase();
  const classes = variants[key] ?? variants.default;
  const text = label ? toSentenceCase(label) : toSentenceCase(status);
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold tracking-[0.04em] ${classes}`}
    >
      {text}
    </span>
  );
}
