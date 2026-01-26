import type { ButtonHTMLAttributes } from 'react';
import { PrimaryButton } from '../Buttons';

export function PrimaryCTA(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <PrimaryButton
      {...props}
      className={`w-full max-w-sm py-3 text-base ${props.className ?? ''}`}
    />
  );
}
