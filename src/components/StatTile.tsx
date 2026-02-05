export function StatTile({
  label,
  value,
  helper,
  className,
  labelClassName
}: {
  label: string;
  value: string;
  helper?: string;
  className?: string;
  labelClassName?: string;
}) {
  return (
    <div className={`surface-card relative overflow-hidden p-5 sm:p-6 ${className ?? ''}`}>
      <div className="flex items-center justify-between">
        <div className={labelClassName ?? 'ui-label'}>{label}</div>
        <span className="h-2 w-2 rounded-full bg-accent opacity-70" aria-hidden />
      </div>
      <div className="mt-4 text-4xl font-display tracking-tight">{value}</div>
      {helper && <div className="mt-2 text-sm text-muted">{helper}</div>}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[2px] bg-accent opacity-50" aria-hidden />
    </div>
  );
}
