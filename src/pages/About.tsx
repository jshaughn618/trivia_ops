import { Link } from 'react-router-dom';
import logoDark from '../assets/trivia_ops_logo_dark.png';
import logoLight from '../assets/trivia_ops_logo_light.png';
import { useTheme } from '../lib/theme';

export function AboutPage() {
  const { theme } = useTheme();
  const logo = theme === 'light' ? logoLight : logoDark;

  return (
    <div className="min-h-screen bg-bg px-4 py-10 text-text">
      <div className="mx-auto w-full max-w-3xl border-2 border-border bg-panel p-6 sm:p-8">
        <img src={logo} alt="Trivia Ops" className="h-14 w-auto" />
        <div className="text-xs uppercase tracking-[0.2em] text-muted">About Us</div>
        <h1 className="mt-2 text-3xl font-display tracking-tight sm:text-4xl">Trivia Ops</h1>
        <p className="mt-4 text-sm leading-relaxed text-muted">
          Trivia Ops is a platform for running live trivia nights. We help hosts organize rounds, manage teams, present
          questions, and keep game flow moving from start to finish.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          We also host trivia events for various venues and organizations in Southwest Michigan, providing a fun and engaging experience for participants. Please contact us for more information about our services or to inquire about hosting an event.
        </p>
        <div className="mt-8 border-t border-border pt-6">
          <div className="text-xs uppercase tracking-[0.2em] text-muted">Contact Us</div>
          <a className="mt-2 inline-block text-sm text-accent-ink hover:text-accent" href="mailto:info@triviaops.com">
            info@triviaops.com
          </a>
        </div>
        <div className="mt-8">
          <Link
            to="/login"
            className="inline-flex h-10 items-center rounded-lg border border-border bg-panel2 px-4 text-sm font-medium text-text transition-colors hover:border-border-strong hover:bg-panel"
          >
            Back To Login
          </Link>
        </div>
      </div>
    </div>
  );
}
