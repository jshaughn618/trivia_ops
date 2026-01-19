const variants: Record<string, string> = {
  inspected: 'border-accent-ink text-accent-ink',
  verified: 'border-accent-ink text-accent-ink',
  locked: 'border-border text-muted',
  approved: 'border-accent-ink bg-accent text-accent-fg',
  danger: 'border-danger bg-danger text-danger-fg'
};

export function StampBadge({ label, variant = 'inspected' }: { label: string; variant?: keyof typeof variants }) {
  return (
    <span
      className={`inline-flex items-center rounded-sm border px-3 py-1 text-[10px] font-display uppercase tracking-[0.35em] ${
        variants[variant]
      }`}
    >
      {label}
    </span>
  );
}
