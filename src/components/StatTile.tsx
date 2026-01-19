export function StatTile({ label, value, helper }: { label: string; value: string; helper?: string }) {
  return (
    <div className="rounded-lg border border-border bg-panel2 p-4 shadow-sm">
      <div className="ui-label">{label}</div>
      <div className="mt-2 text-3xl font-display">{value}</div>
      {helper && <div className="mt-1 text-xs text-muted">{helper}</div>}
    </div>
  );
}
