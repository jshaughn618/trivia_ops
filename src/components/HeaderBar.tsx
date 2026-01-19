import { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useAuth } from '../auth';
import { useTheme } from '../lib/theme';
import logoDark from '../assets/trivia_ops_logo_dark.png';
import logoLight from '../assets/trivia_ops_logo_light.png';

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `px-3 py-2 text-xs font-display uppercase tracking-[0.25em] border-2 transition-colors ${
    isActive
      ? 'border-accent text-accent'
      : 'border-transparent text-muted hover:border-border hover:text-text'
  }`;

export function HeaderBar() {
  const [open, setOpen] = useState(false);
  const auth = useAuth();
  const isAdmin = auth.user?.user_type === 'admin';
  const { theme } = useTheme();
  const logo = theme === 'light' ? logoLight : logoDark;

  return (
    <header className="border-b-2 border-border bg-panel px-4 py-3">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
        <Link to="/dashboard" className="flex items-center">
          <img src={logo} alt="Trivia Ops" className="h-10 w-auto" />
        </Link>
        <div className="flex items-center gap-2">
          <nav className="hidden items-center gap-2 lg:flex">
            <NavLink to="/dashboard" className={navLinkClass}>
              Dashboard
            </NavLink>
            <NavLink to="/games" className={navLinkClass}>
              Games
            </NavLink>
            <NavLink to="/events" className={navLinkClass}>
              Events
            </NavLink>
          </nav>
          <div className="relative">
            <button
              type="button"
              onClick={() => setOpen((prev) => !prev)}
              className="border-2 border-border px-3 py-2 text-xs font-display uppercase tracking-[0.3em] text-muted hover:border-accent hover:text-text"
              aria-expanded={open}
              aria-label="Open menu"
            >
              <span className="flex items-center gap-2">
                <img src="/trivia_ops_icon.png" alt="" className="h-5 w-5" />
                Menu
              </span>
            </button>
            {open && (
              <div className="absolute right-0 mt-3 w-48 border-2 border-border bg-panel2 p-2">
                <nav className="flex flex-col gap-2">
                  <NavLink to="/dashboard" className={navLinkClass} onClick={() => setOpen(false)}>
                    Dashboard
                  </NavLink>
                  <NavLink to="/games" className={navLinkClass} onClick={() => setOpen(false)}>
                    Games
                  </NavLink>
                  <NavLink to="/events" className={navLinkClass} onClick={() => setOpen(false)}>
                    Events
                  </NavLink>
                  <NavLink to="/locations" className={navLinkClass} onClick={() => setOpen(false)}>
                    Locations
                  </NavLink>
                  <NavLink to="/settings" className={navLinkClass} onClick={() => setOpen(false)}>
                    Settings
                  </NavLink>
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
