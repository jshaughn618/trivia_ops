export function StatTile({
  label,
  value,
  helper,
  className
}: {
  label: string;
  value: string;
  helper?: string;
  className?: string;
}) {
  return (
    <div className={`surface-card relative overflow-hidden p-5 ${className ?? ''}`}>
      <div className="flex items-center justify-between">
        <div className="ui-label">{label}</div>
        <span className="h-2 w-2 rounded-full bg-accent opacity-70" aria-hidden />
      </div>
      <div className="mt-3 text-4xl font-display tracking-tight">{value}</div>
      {helper && <div className="mt-2 text-sm text-muted">{helper}</div>}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[2px] bg-accent opacity-60" aria-hidden />
    </div>
  );
}
