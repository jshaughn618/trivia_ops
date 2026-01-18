export function StatTile({ label, value, helper }: { label: string; value: string; helper?: string }) {
  return (
    <div className="border-2 border-border bg-panel2 p-4">
      <div className="text-xs font-display uppercase tracking-[0.3em] text-muted">{label}</div>
      <div className="mt-2 text-3xl font-display">{value}</div>
      {helper && <div className="mt-1 text-xs text-muted uppercase tracking-[0.2em]">{helper}</div>}
    </div>
  );
}
