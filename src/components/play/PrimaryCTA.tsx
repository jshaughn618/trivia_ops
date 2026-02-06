import type { ButtonHTMLAttributes } from 'react';
import { PrimaryButton } from '../Buttons';

export function PrimaryCTA(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <PrimaryButton
      {...props}
      className={`play-touch w-full max-w-sm rounded-md border border-accent-ink/50 bg-accent-soft py-3 text-base text-accent-ink hover:bg-accent-soft/80 ${props.className ?? ''}`}
    />
  );
}
