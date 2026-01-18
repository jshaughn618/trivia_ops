const variants: Record<string, string> = {
  inspected: 'border-accent text-accent',
  verified: 'border-accent text-accent',
  locked: 'border-border text-muted',
  approved: 'border-accent text-accent',
  danger: 'border-danger text-danger'
};

export function StampBadge({ label, variant = 'inspected' }: { label: string; variant?: keyof typeof variants }) {
  return (
    <span
      className={`inline-flex items-center border-2 px-3 py-1 text-[10px] font-display uppercase tracking-[0.35em] ${
        variants[variant]
      }`}
    >
      {label}
    </span>
  );
}
