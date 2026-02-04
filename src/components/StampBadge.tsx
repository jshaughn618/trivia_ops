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
      className={`inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-semibold tracking-[0.1em] ${
        variants[variant]
      }`}
    >
      {label}
    </span>
  );
}
