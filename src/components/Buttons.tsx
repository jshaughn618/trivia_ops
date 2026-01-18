import type { ButtonHTMLAttributes, AnchorHTMLAttributes } from 'react';
import { Link, type LinkProps } from 'react-router-dom';

const base =
  'inline-flex items-center justify-center gap-2 px-4 py-2 border-2 text-xs font-display uppercase tracking-[0.2em] transition-colors duration-150';

export function PrimaryButton(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`${base} bg-accent text-bg border-accent hover:bg-[#e6b900] ${props.className ?? ''}`}
    />
  );
}

export function SecondaryButton(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`${base} bg-panel2 text-text border-border hover:border-accent ${props.className ?? ''}`}
    />
  );
}

export function DangerButton(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`${base} bg-danger text-text border-danger hover:bg-[#9d2a24] ${props.className ?? ''}`}
    />
  );
}

export function ButtonLink(props: LinkProps & { variant?: 'primary' | 'secondary' }) {
  const variant = props.variant ?? 'secondary';
  const variantClass =
    variant === 'primary'
      ? 'bg-accent text-bg border-accent hover:bg-[#e6b900]'
      : 'bg-panel2 text-text border-border hover:border-accent';

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
      className={`text-accent uppercase tracking-[0.2em] text-xs hover:text-[#e6b900] ${props.className ?? ''}`}
    />
  );
}
