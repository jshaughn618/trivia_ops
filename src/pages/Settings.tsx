import { useNavigate } from 'react-router-dom';
import { AppShell } from '../components/AppShell';
import { Panel } from '../components/Panel';
import { DangerButton, SecondaryButton } from '../components/Buttons';
import { useAuth } from '../auth';

export function SettingsPage() {
  const auth = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await auth.logout();
    navigate('/login');
  };

  return (
    <AppShell title="Settings">
      <Panel title="Operator">
        <div className="flex flex-col gap-4">
          <div className="border-2 border-border bg-panel2 p-3 text-xs uppercase tracking-[0.2em] text-muted">
            Signed in as
          </div>
          <div className="text-sm font-display uppercase tracking-[0.2em]">{auth.user?.email}</div>
          <div className="flex flex-wrap gap-2">
            <SecondaryButton onClick={() => navigate('/settings/users')}>User Admin</SecondaryButton>
            <DangerButton onClick={handleLogout}>Logout</DangerButton>
          </div>
        </div>
      </Panel>
    </AppShell>
  );
}
