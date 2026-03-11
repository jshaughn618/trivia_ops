import logoDark from '../assets/trivia_ops_logo_dark.png';
import logoLight from '../assets/trivia_ops_logo_light.png';
import { useTheme } from '../lib/theme';

export function BillboardPage() {
  const { theme } = useTheme();
  const logo = theme === 'light' ? logoLight : logoDark;

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-bg px-6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,214,10,0.08),transparent_34%)]" />
      <div className="relative flex flex-col items-center gap-6 text-center">
        <img
          src={logo}
          alt="Trivia Ops"
          className="w-full max-w-[720px] min-w-[280px] drop-shadow-[0_0_48px_rgba(255,214,10,0.12)]"
        />
        <p className="max-w-2xl text-balance text-xl font-medium tracking-[0.04em] text-muted sm:text-2xl">
          The command center for live trivia fun.
        </p>
      </div>
    </div>
  );
}
