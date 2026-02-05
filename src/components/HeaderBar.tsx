import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { useTheme } from '../lib/theme';
import logoDark from '../assets/trivia_ops_logo_dark.png';
import logoLight from '../assets/trivia_ops_logo_light.png';

const topNavLinkClass = ({ isActive }: { isActive: boolean }) =>
  `inline-flex h-9 w-[112px] items-center justify-center rounded-lg px-3 text-sm font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink focus-visible:ring-offset-2 focus-visible:ring-offset-bg ${
    isActive
      ? 'border border-border-strong bg-panel2 text-text shadow-card'
      : 'border border-transparent text-muted hover:border-border hover:bg-panel2 hover:text-text'
  }`;

const menuNavLinkClass = ({ isActive }: { isActive: boolean }) =>
  `inline-flex h-9 items-center rounded-lg px-3 text-sm font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink focus-visible:ring-offset-2 focus-visible:ring-offset-bg ${
    isActive
      ? 'border border-border-strong bg-panel2 text-text shadow-card'
      : 'border border-transparent text-muted hover:border-border hover:bg-panel2 hover:text-text'
  }`;

export function HeaderBar() {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const auth = useAuth();
  const navigate = useNavigate();
  const isAdmin = auth.user?.user_type === 'admin';
  const { theme } = useTheme();
  const logo = theme === 'light' ? logoLight : logoDark;
  const homePath = isAdmin ? '/dashboard' : '/events';

  useEffect(() => {
    if (!open) return;
    const handleOutside = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (menuRef.current && target && !menuRef.current.contains(target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [open]);

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-bg px-4 py-2.5 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 sm:px-2">
        <Link to={homePath} className="flex items-center">
          <img src={logo} alt="Trivia Ops" className="h-9 w-auto" />
        </Link>
        <div className="flex items-center gap-2">
          <nav className="hidden items-center gap-2 lg:flex">
            {isAdmin && (
              <NavLink to="/dashboard" className={topNavLinkClass}>
                Dashboard
              </NavLink>
            )}
            {isAdmin && (
              <NavLink to="/games" className={topNavLinkClass}>
                Games
              </NavLink>
            )}
            <NavLink to="/events" className={topNavLinkClass}>
              Events
            </NavLink>
          </nav>
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setOpen((prev) => !prev)}
              className="inline-flex h-9 items-center rounded-lg border border-border bg-panel px-3 text-sm font-medium text-muted transition-all duration-150 hover:border-border-strong hover:bg-panel2 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
              aria-expanded={open}
              aria-label="Open menu"
            >
              <span className="flex items-center gap-2">
                <img src="/trivia_ops_icon.png" alt="" className="h-5 w-5" />
                Menu
              </span>
            </button>
            {open && (
              <div className="surface-card absolute right-0 z-50 mt-3 w-56 p-2">
                <nav className="flex flex-col gap-2">
                  {isAdmin && (
                    <NavLink to="/dashboard" className={menuNavLinkClass} onClick={() => setOpen(false)}>
                      Dashboard
                    </NavLink>
                  )}
                  {isAdmin && (
                    <NavLink to="/games" className={menuNavLinkClass} onClick={() => setOpen(false)}>
                      Games
                    </NavLink>
                  )}
                  <NavLink to="/events" className={menuNavLinkClass} onClick={() => setOpen(false)}>
                    Events
                  </NavLink>
                  {isAdmin && (
                    <NavLink to="/locations" className={menuNavLinkClass} onClick={() => setOpen(false)}>
                      Locations
                    </NavLink>
                  )}
                  {isAdmin && (
                    <NavLink to="/settings" className={menuNavLinkClass} onClick={() => setOpen(false)}>
                      Settings
                    </NavLink>
                  )}
                  {isAdmin && (
                    <NavLink to="/settings/users" className={menuNavLinkClass} onClick={() => setOpen(false)}>
                      User Admin
                    </NavLink>
                  )}
                  <button
                    type="button"
                    onClick={async () => {
                      setOpen(false);
                      await auth.logout();
                      navigate('/login');
                    }}
                    className="inline-flex h-9 items-center rounded-lg border border-border px-3 text-left text-sm font-medium text-muted transition-colors hover:border-danger hover:text-danger-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
                  >
                    Logout
                  </button>
                </nav>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
