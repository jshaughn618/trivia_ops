import type { ButtonHTMLAttributes, AnchorHTMLAttributes } from 'react';
import { Link, type LinkProps } from 'react-router-dom';

const base =
  'inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:pointer-events-none disabled:opacity-50';

export function PrimaryButton(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`${base} border border-transparent bg-accent text-accent-fg hover:brightness-95 active:brightness-90 ${props.className ?? ''}`}
    />
  );
}

export function SecondaryButton(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`${base} border border-border bg-panel text-text hover:bg-panel2 ${props.className ?? ''}`}
    />
  );
}

export function DangerButton(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`${base} border border-transparent bg-danger text-danger-fg hover:brightness-95 active:brightness-90 ${props.className ?? ''}`}
    />
  );
}

export function ButtonLink(props: LinkProps & { variant?: 'primary' | 'secondary' | 'ghost' | 'outline' }) {
  const variant = props.variant ?? 'secondary';
  const variantClass =
    variant === 'primary'
      ? 'border border-transparent bg-accent text-accent-fg hover:brightness-95 active:brightness-90'
      : variant === 'ghost'
        ? 'border border-transparent bg-transparent text-text hover:bg-panel2'
        : variant === 'outline'
          ? 'border border-accent-ink text-accent-ink hover:bg-accent-soft'
          : 'border border-border bg-panel text-text hover:bg-panel2';

  return (
    <Link
      {...props}
      className={`${base} ${variantClass} ${props.className ?? ''}`}
    />
  );
}

export function TextLink(props: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a
      {...props}
      className={`text-sm font-medium text-accent-ink hover:underline ${props.className ?? ''}`}
    />
  );
}
