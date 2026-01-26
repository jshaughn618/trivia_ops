import type { ReactNode, HTMLAttributes } from 'react';
import { Link } from 'react-router-dom';

export function List({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={`-mx-4 divide-y divide-border sm:-mx-5 ${className ?? ''}`}>{children}</div>;
}

type ListRowProps = {
  to?: string;
  href?: string;
  className?: string;
  interactive?: boolean;
  children: ReactNode;
} & HTMLAttributes<HTMLElement>;

export function ListRow({ to, href, className, interactive, children, ...rest }: ListRowProps) {
  const isInteractive = interactive ?? Boolean(to || href || rest.onClick);
  const base = 'flex w-full items-start justify-between gap-3 px-4 py-3 text-left sm:px-5';
  const state = isInteractive
    ? 'cursor-pointer transition-colors hover:bg-panel2/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink focus-visible:ring-offset-2 focus-visible:ring-offset-bg'
    : '';
  const classes = `${base} ${state} ${className ?? ''}`;

  if (to) {
    return (
      <Link to={to} className={classes}>
        {children}
      </Link>
    );
  }

  if (href) {
    return (
      <a href={href} className={classes}>
        {children}
      </a>
    );
  }

  return (
    <div {...rest} className={classes}>
      {children}
    </div>
  );
}
