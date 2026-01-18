import type { ReactNode } from 'react';

export function Table({ headers, children }: { headers: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto border-2 border-border">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-panel2">
          <tr>
            {headers.map((header) => (
              <th key={header} className="px-3 py-2 text-xs font-display uppercase tracking-[0.3em] text-muted">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y-2 divide-border">{children}</tbody>
      </table>
    </div>
  );
}
