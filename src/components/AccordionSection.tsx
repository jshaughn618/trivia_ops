import { useId, useState, type ReactNode } from 'react';

export function AccordionSection({
  title,
  actions,
  defaultOpen,
  children
}: {
  title: string;
  actions?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(Boolean(defaultOpen));
  const contentId = useId();

  return (
    <section className="surface-card">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <button
          type="button"
          className="flex flex-1 items-center justify-between gap-3 text-left"
          onClick={() => setOpen((prev) => !prev)}
          aria-expanded={open}
          aria-controls={contentId}
        >
          <span className="panel-title">{title}</span>
          <span className="text-sm text-muted">{open ? '−' : '+'}</span>
        </button>
        {actions && <div className="shrink-0" onClick={(event) => event.stopPropagation()}>{actions}</div>}
      </div>
      {open && (
        <div id={contentId} className="px-4 py-4">
          {children}
        </div>
      )}
    </section>
  );
}
