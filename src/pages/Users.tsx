import { useEffect, useState } from 'react';
import { api } from '../api';
import { AppShell } from '../components/AppShell';
import { Panel } from '../components/Panel';
import { PrimaryButton, SecondaryButton, DangerButton } from '../components/Buttons';
import type { User } from '../types';
import { useAuth } from '../auth';

const emptyForm = {
  email: '',
  password: '',
  username: '',
  first_name: '',
  last_name: '',
  user_type: 'host' as 'admin' | 'host' | 'player'
};

export function UsersPage() {
  const auth = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [form, setForm] = useState({ ...emptyForm });
  const [error, setError] = useState<string | null>(null);
  const [inviteText, setInviteText] = useState('');
  const [inviteSending, setInviteSending] = useState(false);
  const [inviteResult, setInviteResult] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteFailures, setInviteFailures] = useState<string[]>([]);

  const load = async () => {
    const res = await api.listUsers();
    if (res.ok) {
      setUsers(res.data);
      setError(null);
    } else {
      setError(res.error.message);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleCreate = async () => {
    if (!form.email || !form.password) return;
    const res = await api.createUser({
      email: form.email,
      password: form.password,
      username: form.username || undefined,
      first_name: form.first_name || undefined,
      last_name: form.last_name || undefined,
      user_type: form.user_type
    });
    if (res.ok) {
      setForm({ ...emptyForm });
      setError(null);
      load();
    } else {
      setError(res.error.message);
    }
  };

  const handleDelete = async (id: string) => {
    await api.deleteUser(id);
    load();
  };

  const parseInviteEmails = (value: string) => {
    return value
      .split(/[\n,;\s]+/)
      .map((email) => email.trim())
      .filter(Boolean);
  };

  const handleInvite = async () => {
    const emails = parseInviteEmails(inviteText);
    if (emails.length === 0) return;
    setInviteSending(true);
    setInviteError(null);
    setInviteResult(null);
    setInviteFailures([]);
    const res = await api.createInvites({ emails, role: 'host' });
    setInviteSending(false);
    if (!res.ok) {
      setInviteError(res.error.message ?? 'Failed to send invites.');
      return;
    }
    const sent = res.data.results.filter((item) => item.status === 'sent').length;
    const skipped = res.data.results.filter((item) => item.status === 'skipped').length;
    const failedEntries = res.data.results.filter((item) => item.status === 'failed');
    const failed = failedEntries.length;
    setInviteResult(`Sent ${sent} • Skipped ${skipped} • Failed ${failed}`);
    if (failedEntries.length > 0) {
      setInviteFailures(
        failedEntries.map((entry) => `${entry.email} — ${entry.reason || 'No reason provided'}`)
      );
    }
    setInviteText('');
  };

  if (auth.user?.user_type !== 'admin') {
    return (
      <AppShell title="User Admin">
        <Panel title="Access">
          <div className="text-xs uppercase tracking-[0.2em] text-muted">
            Admin access required.
          </div>
        </Panel>
      </AppShell>
    );
  }

  return (
    <AppShell title="User Admin">
      <div className="grid gap-4 lg:grid-cols-[1fr,360px]">
        <Panel title="Users">
          <div className="flex flex-col gap-3">
            {users.map((user) => (
              <div key={user.id} className="border-2 border-border bg-panel2 p-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-display uppercase tracking-[0.2em]">{user.email}</div>
                  <div className="text-xs uppercase tracking-[0.2em] text-muted">{user.user_type}</div>
                </div>
                <div className="mt-2 text-xs uppercase tracking-[0.2em] text-muted">
                  {user.first_name ?? ''} {user.last_name ?? ''}
                </div>
                <div className="mt-2">
                  <DangerButton onClick={() => handleDelete(user.id)} disabled={user.id === auth.user?.id}>
                    {user.id === auth.user?.id ? 'Current User' : 'Delete'}
                  </DangerButton>
                </div>
              </div>
            ))}
            {users.length === 0 && (
              <div className="text-xs uppercase tracking-[0.2em] text-muted">No users found.</div>
            )}
          </div>
        </Panel>
        <Panel title="Create User">
          <div className="flex flex-col gap-4">
            <label className="flex flex-col gap-2 text-xs font-display uppercase tracking-[0.25em] text-muted">
              Email
              <input
                className="h-10 px-3"
                value={form.email}
                onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
              />
            </label>
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
              Username
              <input
                className="h-10 px-3"
                value={form.username}
                onChange={(event) => setForm((prev) => ({ ...prev, username: event.target.value }))}
              />
            </label>
            <label className="flex flex-col gap-2 text-xs font-display uppercase tracking-[0.25em] text-muted">
              First Name
              <input
                className="h-10 px-3"
                value={form.first_name}
                onChange={(event) => setForm((prev) => ({ ...prev, first_name: event.target.value }))}
              />
            </label>
            <label className="flex flex-col gap-2 text-xs font-display uppercase tracking-[0.25em] text-muted">
              Last Name
              <input
                className="h-10 px-3"
                value={form.last_name}
                onChange={(event) => setForm((prev) => ({ ...prev, last_name: event.target.value }))}
              />
            </label>
            <label className="flex flex-col gap-2 text-xs font-display uppercase tracking-[0.25em] text-muted">
              User Type
              <select
                className="h-10 px-3"
                value={form.user_type}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    user_type: event.target.value as 'admin' | 'host' | 'player'
                  }))
                }
              >
                <option value="admin">Admin</option>
                <option value="host">Host</option>
                <option value="player">Player</option>
              </select>
            </label>
            {error && (
              <div className="border-2 border-danger bg-panel2 px-3 py-2 text-xs uppercase tracking-[0.2em] text-danger">
                {error}
              </div>
            )}
            <div className="flex items-center gap-2">
              <PrimaryButton onClick={handleCreate}>Create User</PrimaryButton>
              <SecondaryButton onClick={() => setForm({ ...emptyForm })}>Clear</SecondaryButton>
            </div>
          </div>
        </Panel>
        <Panel title="Invite Hosts">
          <div className="flex flex-col gap-3">
            <div className="text-xs uppercase tracking-[0.2em] text-muted">
              Send one-time invites (expires in 30 days).
            </div>
            <textarea
              className="min-h-[120px] px-3 py-2"
              value={inviteText}
              onChange={(event) => setInviteText(event.target.value)}
              placeholder="Emails separated by comma, space, or new line"
            />
            <div className="flex items-center gap-2">
              <PrimaryButton onClick={handleInvite} disabled={inviteSending}>
                {inviteSending ? 'Sending…' : 'Send invites'}
              </PrimaryButton>
              <SecondaryButton onClick={() => setInviteText('')}>Clear</SecondaryButton>
            </div>
            {inviteError && (
              <div className="border-2 border-danger bg-panel2 px-3 py-2 text-xs uppercase tracking-[0.2em] text-danger">
                {inviteError}
              </div>
            )}
            {inviteResult && (
              <div className="border-2 border-border bg-panel2 px-3 py-2 text-xs uppercase tracking-[0.2em] text-muted">
                {inviteResult}
              </div>
            )}
            {inviteFailures.length > 0 && (
              <div className="border-2 border-danger bg-panel2 px-3 py-2 text-xs uppercase tracking-[0.2em] text-danger">
                {inviteFailures.map((line) => (
                  <div key={line}>{line}</div>
                ))}
              </div>
            )}
          </div>
        </Panel>
      </div>
    </AppShell>
  );
}
