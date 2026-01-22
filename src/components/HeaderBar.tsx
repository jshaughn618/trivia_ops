import { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useAuth } from '../auth';
import { useTheme } from '../lib/theme';
import logoDark from '../assets/trivia_ops_logo_dark.png';
import logoLight from '../assets/trivia_ops_logo_light.png';

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink focus-visible:ring-offset-2 focus-visible:ring-offset-bg ${
    isActive
      ? 'border border-accent-ink text-accent-ink'
      : 'border border-transparent text-muted hover:border-border hover:text-text'
  }`;

export function HeaderBar() {
  const [open, setOpen] = useState(false);
  const auth = useAuth();
  const isAdmin = auth.user?.user_type === 'admin';
  const { theme } = useTheme();
  const logo = theme === 'light' ? logoLight : logoDark;

  return (
    <header className="border-b border-border bg-panel px-4 py-3">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
        <Link to="/dashboard" className="flex items-center">
          <img src={logo} alt="Trivia Ops" className="h-10 w-auto" />
        </Link>
        <div className="flex items-center gap-2">
          <nav className="hidden items-center gap-2 lg:flex">
            <NavLink to="/dashboard" className={navLinkClass}>
              Dashboard
            </NavLink>
            {isAdmin && (
              <NavLink to="/games" className={navLinkClass}>
                Games
              </NavLink>
            )}
            <NavLink to="/events" className={navLinkClass}>
              Events
            </NavLink>
          </nav>
          <div className="relative">
            <button
              type="button"
              onClick={() => setOpen((prev) => !prev)}
              className="rounded-md border border-border px-3 py-2 text-sm font-medium text-muted hover:border-accent-ink hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
              aria-expanded={open}
              aria-label="Open menu"
            >
              <span className="flex items-center gap-2">
                <img src="/trivia_ops_icon.png" alt="" className="h-5 w-5" />
                Menu
              </span>
            </button>
            {open && (
              <div className="absolute right-0 mt-3 w-48 rounded-md border border-border bg-panel2 p-2 shadow-sm">
                <nav className="flex flex-col gap-2">
                  <NavLink to="/dashboard" className={navLinkClass} onClick={() => setOpen(false)}>
                    Dashboard
                  </NavLink>
                  {isAdmin && (
                    <NavLink to="/games" className={navLinkClass} onClick={() => setOpen(false)}>
                      Games
                    </NavLink>
                  )}
                  <NavLink to="/events" className={navLinkClass} onClick={() => setOpen(false)}>
                    Events
                  </NavLink>
                  {isAdmin && (
                    <NavLink to="/locations" className={navLinkClass} onClick={() => setOpen(false)}>
                      Locations
                    </NavLink>
                  )}
                  {isAdmin && (
                    <NavLink to="/settings" className={navLinkClass} onClick={() => setOpen(false)}>
                      Settings
                    </NavLink>
                  )}
                  {isAdmin && (
                    <NavLink to="/settings/users" className={navLinkClass} onClick={() => setOpen(false)}>
                      User Admin
                    </NavLink>
                  )}
                </nav>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
