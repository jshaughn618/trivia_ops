import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PrimaryButton, SecondaryButton } from '../components/Buttons';
import { api } from '../api';
import { useAuth } from '../auth';
import logoDark from '../assets/trivia_ops_logo_dark.png';
import logoLight from '../assets/trivia_ops_logo_light.png';
import { useTheme } from '../lib/theme';

export function InviteAcceptPage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const auth = useAuth();
  const { theme } = useTheme();
  const logo = theme === 'light' ? logoLight : logoDark;
  const [email, setEmail] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    password: '',
    username: '',
    first_name: '',
    last_name: ''
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (!token) return;
      setLoading(true);
      setError(null);
      const res = await api.getPublicInvite(token);
      if (res.ok) {
        setEmail(res.data.email);
        setExpiresAt(res.data.expires_at);
      } else {
        setError(res.error.message ?? 'Invite not available.');
      }
      setLoading(false);
    };
    load();
  }, [token]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token) return;
    setSubmitting(true);
    setError(null);
    const res = await api.acceptInvite(token, {
      password: form.password,
      username: form.username || undefined,
      first_name: form.first_name || undefined,
      last_name: form.last_name || undefined
    });
    setSubmitting(false);
    if (res.ok) {
      await auth.refresh();
      navigate('/events');
    } else {
      setError(res.error.message ?? 'Could not accept invite.');
    }
  };

  return (
    <div className="min-h-screen bg-bg text-text flex items-center justify-center px-4">
      <div className="w-full max-w-md border-2 border-border bg-panel p-6">
        <img src={logo} alt="Trivia Ops" className="h-16 w-auto" />
        <div className="mt-4 text-2xl font-display tracking-tight">Accept invite</div>
        {loading ? (
          <div className="mt-3 text-xs uppercase tracking-[0.2em] text-muted">Loading invite…</div>
        ) : (
          <>
            {error && (
              <div className="mt-3 border-2 border-danger bg-panel2 px-3 py-2 text-xs uppercase tracking-[0.2em] text-danger">
                {error}
              </div>
            )}
            {!error && (
              <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3">
                <div className="text-xs uppercase tracking-[0.2em] text-muted">
                  Invited email
                </div>
                <div className="border-2 border-border bg-panel2 px-3 py-2 text-sm">{email}</div>
                <div className="text-[10px] uppercase tracking-[0.2em] text-muted">
                  Expires {expiresAt ? new Date(expiresAt).toLocaleDateString() : 'soon'}
                </div>
                <label className="flex flex-col gap-2 text-xs font-display uppercase tracking-[0.25em] text-muted">
                  Password
                  <input
                    type="password"
                    className="h-10 px-3"
                    value={form.password}
                    onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
                  />
                </label>
                <label className="flex flex-col gap-2 text-xs font-display uppercase tracking-[0.25em] text-muted">
                  Username (optional)
                  <input
                    className="h-10 px-3"
                    value={form.username}
                    onChange={(event) => setForm((prev) => ({ ...prev, username: event.target.value }))}
                  />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="flex flex-col gap-2 text-xs font-display uppercase tracking-[0.25em] text-muted">
                    First name
                    <input
                      className="h-10 px-3"
                      value={form.first_name}
                      onChange={(event) => setForm((prev) => ({ ...prev, first_name: event.target.value }))}
                    />
                  </label>
                  <label className="flex flex-col gap-2 text-xs font-display uppercase tracking-[0.25em] text-muted">
                    Last name
                    <input
                      className="h-10 px-3"
                      value={form.last_name}
                      onChange={(event) => setForm((prev) => ({ ...prev, last_name: event.target.value }))}
                    />
                  </label>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <PrimaryButton type="submit" disabled={submitting}>
                    {submitting ? 'Creating…' : 'Create account'}
                  </PrimaryButton>
                  <SecondaryButton type="button" onClick={() => navigate('/login')}>
                    Back to login
                  </SecondaryButton>
                </div>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  );
}
